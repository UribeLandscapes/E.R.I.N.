const test = require('node:test');
const assert = require('node:assert/strict');

// En Apps Script estos nombres son globales; en Node se ponen a mano (igual que cierreApp.test.js).
// Se usa el atenderMensaje_ REAL para comprobar que "hola" solo pasa por deps.llamar.
Object.assign(global, require('../src/Hoja.js'), require('../src/Moneda.js'));
Object.assign(global, require('../src/Hoja.js'));
Object.assign(global, require('../src/Reglas.js'));
Object.assign(global, require('../src/Escritura.js'));
Object.assign(global, require('../src/Clases.js'));
Object.assign(global, require('../src/Texto.js'));
Object.assign(global, require('../src/Confirmacion.js'));
Object.assign(global, require('../src/Foto.js'));
Object.assign(global, require('../src/Botones.js'));
Object.assign(global, require('../src/PorProcesar.js'));
Object.assign(global, require('../src/Edicion.js'));
Object.assign(global, require('../src/Mensajes.js'));
Object.assign(global, require('../src/Webhook.js'));
global.PESTANA_ESTADO = '_ESTADO';
global.CONFIG = require('./configPrueba.js').CONFIG;
Object.assign(global, require('../src/WebhookApp.js'));
Object.assign(global, require('../src/MensajesApp.js'));
Object.assign(global, require('../src/Importacion.js'));
Object.assign(global, require('../src/Duplicado.js'));
Object.assign(global, require('../src/DuplicadoApp.js'));

const {
  armarUpdateRepetido_, borrarFilasUpdate_, probarRepetido_, dependenciasSeguridad_, probarRepetido,
} = require('../src/SeguridadApp.js');
const { COLUMNAS_ESTADO } = require('../src/Hoja.js');

const SECRETO = 's'.repeat(32);
const TOKEN = '123456:ABC-token-de-prueba';
const ID = -1234567890;
const RESPUESTA_OK = { codigo: 200, datos: { ok: true, result: { message_id: 1 } } };

/** _ESTADO falsa con filas (fila 1 = encabezados), getRange de lectura y deleteRow. */
function hojaEstadoFalsa(filas = []) {
  const hoja = {
    filas: [[...COLUMNAS_ESTADO], ...filas], borradas: [],
    getLastRow: () => hoja.filas.length,
    getRange: (fila, col, n, m) => ({
      getValues: () => hoja.filas.slice(fila - 1, fila - 1 + n).map((f) => f.slice(col - 1, col - 1 + m)),
    }),
    appendRow: (fila) => { hoja.filas.push(fila); },
    deleteRow: (n) => { hoja.borradas.push(n); hoja.filas.splice(n - 1, 1); },
  };
  return hoja;
}

function cacheFalsa() {
  const datos = new Map();
  return {
    datos,
    get: (k) => (datos.has(k) ? datos.get(k) : null),
    put: (k, v) => { datos.set(k, v); },
    remove: (k) => { datos.delete(k); },
  };
}

function dependencias(extra = {}) {
  const d = {
    llamadas: [], registro: [], hoja: hojaEstadoFalsa(), cache: cacheFalsa(),
    secreto: SECRETO, token: TOKEN, chatId: CONFIG.ERIN_CHAT_ID,
    candado: { tryLock: () => true, releaseLock: () => {} },
    candadoLimpieza: () => ({ tryLock: () => true, releaseLock: () => {} }),
    hojaEstado() { return this.hoja; },
    llamar: (token, metodo, cuerpo) => {
      d.llamadas.push({ token, metodo, cuerpo });
      return { codigo: 200, datos: { ok: true, result: { message_id: 1 } } };
    },
    ahora: () => new Date('2026-09-28T20:00:00Z'),
    log: (linea) => d.registro.push(linea),
    ...extra,
  };
  return d;
}

test('armarUpdateRepetido_ arma el update del usuario con id negativo, secreto y chat privado', () => {
  const e = armarUpdateRepetido_(ID, SECRETO);
  assert.deepEqual(e.parameter, { k: SECRETO });
  const update = JSON.parse(e.postData.contents);
  assert.equal(update.update_id, ID);
  assert.equal(update.message.text, 'hola');
  assert.deepEqual(update.message.chat, { id: CONFIG.ERIN_CHAT_ID, type: 'private' });
});

test('probarRepetido_: atendido, repetido, repetido por _ESTADO; limpia todo y el usuario no recibe nada', () => {
  const d = dependencias();
  const lineas = probarRepetido_(d, ID);
  assert.equal(lineas.filter((l) => /^paso \d.*: OK/.test(l)).length, 3, lineas.join('\n'));
  assert.equal(lineas.filter((l) => /FALLA/.test(l)).length, 0);
  assert.deepEqual(d.registro, lineas);
  // Solo el saludo del primer paso salió por el envío falso, y nada se manda a otro lugar.
  assert.equal(d.llamadas.length, 1);
  assert.equal(d.llamadas[0].metodo, 'sendMessage');
  assert.equal(d.llamadas[0].cuerpo.text, textoGuia_());
  // Limpieza: sin fila UPDATE ni caché.
  assert.equal(d.hoja.filas.length, 1);
  assert.equal(d.cache.datos.size, 0);
  assert.doesNotMatch(lineas.join('\n'), new RegExp(`${SECRETO}|${TOKEN}`));
});

test('probarRepetido_ toma candado para limpiar su fila UPDATE y lo libera', () => {
  const candado = { pedidos: [], liberado: 0, tryLock(ms) { this.pedidos.push(ms); return true; }, releaseLock() { this.liberado += 1; } };
  const d = dependencias({ candadoLimpieza: () => candado });
  probarRepetido_(d, ID);
  assert.deepEqual(candado.pedidos, [30000]);
  assert.equal(candado.liberado, 1);
});

test('probarRepetido_ registra la limpieza omitida si no toma el candado', () => {
  const candado = { tryLock: () => false, releaseLock: () => { throw new Error('no debe liberar'); } };
  const d = dependencias({ candadoLimpieza: () => candado });
  const lineas = probarRepetido_(d, ID);
  assert.ok(lineas.some((l) => l.includes('limpieza: OMITIDA') && l.includes(String(ID))));
});

test('probarRepetido_: marca FALLA si un paso no da lo esperado, y aun así limpia', () => {
  // Ni la caché ni _ESTADO recuerdan el update: el segundo paso atiende de nuevo en vez de decir repetido.
  const d = dependencias({ cache: { ...cacheFalsa(), get: () => null } });
  d.hoja.appendRow = () => {};
  const lineas = probarRepetido_(d, ID);
  assert.ok(lineas.some((l) => /FALLA/.test(l)));
  assert.equal(d.hoja.filas.filter((f) => f[1] === 'UPDATE').length, 0);
});

test('probarRepetido_: un error dentro del paso se registra como FALLA sin secreto y limpia', () => {
  const d = dependencias({
    hojaEstado() { throw new Error(`no abre https://x/exec?k=${SECRETO}`); },
  });
  const lineas = probarRepetido_(d, ID);
  assert.ok(lineas.some((l) => /FALLA/.test(l)));
  assert.doesNotMatch(lineas.join('\n'), new RegExp(SECRETO));
});

test('probarRepetido_: si la limpieza de _ESTADO truena, lo registra y no lanza', () => {
  const d = dependencias();
  d.hoja.deleteRow = () => { throw new Error('sin permiso'); };
  const lineas = probarRepetido_(d, ID);
  assert.ok(lineas.some((l) => /limpieza.*FALLA.*sin permiso/.test(l)), lineas.join('\n'));
});

test('borrarFilasUpdate_ borra solo las filas UPDATE con esa clave, de abajo hacia arriba', () => {
  const hoja = hojaEstadoFalsa([
    ['x', 'UPDATE', 5, '', '', 'VISTO'],
    ['x', 'UPDATE', ID, '', '', 'VISTO'],
    ['x', 'OTRO', ID, '', '', ''],
    ['x', 'UPDATE', String(ID), '', '', 'VISTO'],
  ]);
  assert.equal(borrarFilasUpdate_(hoja, ID), 2);
  assert.deepEqual(hoja.borradas, [5, 3]);
  assert.deepEqual(hoja.filas.slice(1).map((f) => [f[1], f[2]]), [['UPDATE', 5], ['OTRO', ID]]);
});

test('probarRepetido_ sin lista de envíos falsos en deps cuenta 0', () => {
  const d = dependencias();
  delete d.llamadas;
  const lineas = probarRepetido_({ ...d, llamar: () => RESPUESTA_OK }, ID);
  assert.match(lineas[lineas.length - 1], /envíos falsos: 0/);
});

test('borrarFilasUpdate_ con _ESTADO vacía o sin la pestaña no hace nada', () => {
  assert.equal(borrarFilasUpdate_(hojaEstadoFalsa(), ID), 0);
  assert.equal(borrarFilasUpdate_(null, ID), 0);
});

test('dependenciasSeguridad_ usa las reales pero cambia el envío por uno falso que no toca la red', () => {
  global.PropertiesService = { getScriptProperties: () => ({ getProperty: () => 'x' }) };
  global.LockService = { getScriptLock: () => ({}) };
  global.CacheService = { getScriptCache: () => ({}) };
  global.UrlFetchApp = { fetch: () => { throw new Error('red real'); } };
  global.Logger = { log: () => {} };
  try {
    const d = dependenciasSeguridad_();
    assert.notEqual(d.llamar, llamarTelegram_);
    assert.deepEqual(d.llamar('t', 'sendMessage', {}), { codigo: 200, datos: { ok: true, result: { message_id: 1 } } });
    assert.equal(typeof d.log, 'function');
    d.log('x');
  } finally {
    ['PropertiesService', 'LockService', 'CacheService', 'UrlFetchApp', 'Logger'].forEach((n) => delete global[n]);
  }
});

test('probarRepetido() corre el núcleo con dependencias falsas y devuelve las líneas', () => {
  const hoja = hojaEstadoFalsa();
  const cache = cacheFalsa();
  const registro = [];
  global.PropertiesService = { getScriptProperties: () => ({ getProperty: (k) => (k === 'WEBHOOK_SECRET' ? SECRETO : TOKEN) }) };
  global.LockService = { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) };
  global.CacheService = { getScriptCache: () => cache };
  global.SpreadsheetApp = { openById: () => ({ getSheetByName: () => hoja }) };
  global.UrlFetchApp = { fetch: () => { throw new Error('red real'); } };
  global.Logger = { log: (l) => registro.push(l) };
  try {
    const lineas = probarRepetido();
    assert.equal(lineas.filter((l) => /^paso \d.*: OK/.test(l)).length, 3, lineas.join('\n'));
    assert.deepEqual(registro, lineas);
    assert.equal(hoja.filas.length, 1);
  } finally {
    ['PropertiesService', 'LockService', 'CacheService', 'SpreadsheetApp', 'UrlFetchApp', 'Logger']
      .forEach((n) => delete global[n]);
  }
});
