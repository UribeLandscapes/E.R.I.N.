const test = require('node:test');
const assert = require('node:assert/strict');

// En Apps Script estos nombres son globales (Config.js, Hoja.js, HojaApp.js, Webhook.js).
global.CONFIG = require('./configPrueba.js').CONFIG;
global.COLUMNAS_ESTADO = require('../src/Hoja.js').COLUMNAS_ESTADO;
global.PESTANA_ESTADO = '_ESTADO';
Object.assign(global, require('../src/Webhook.js'));
Object.assign(global, require('../src/Mensajes.js'));

// El vive en MensajesApp.js; aquí se reemplaza por espías (tiene sus propias pruebas).
const atendidos = [];
const enviarFalso = (deps, metodo, cuerpo) => {
  const r = deps.llamar(deps.token, metodo, cuerpo);
  if (!r.datos.ok) throw new Error(`Telegram ${metodo}: HTTP ${r.codigo} — ${r.datos.description || 'sin detalle'}`);
};
global.atenderMensaje_ = (msj, deps, hojaEstado) => {
  atendidos.push({ tipo: 'mensaje', mensaje: msj, hojaEstado });
  enviarFalso(deps, 'sendMessage', { chat_id: msj.chat.id, text: 'atendido' });
};
global.atenderBoton_ = (cq, deps, hojaEstado) => {
  atendidos.push({ tipo: 'boton', cq, hojaEstado });
  enviarFalso(deps, 'answerCallbackQuery', { callback_query_id: cq.id });
};
const restaurarMensaje = global.atenderMensaje_;
const restaurarBoton = global.atenderBoton_;
global.obtenerJsonRed_ = () => null;

const {
  PREFIJO_CACHE_UPDATE, PREFIJO_CACHE_AVISO, PREFIJO_CACHE_ALBUM, SEGUNDOS_CACHE_UPDATE,
  ESPERA_CANDADO_MS, ESPERA_CANDADO_BOTON_MS, ESPERA_CANDADO_AVISO_MS, TIPO_ESTADO_UPDATE,
  llamarTelegram_, yaVisto_, marcarVisto_, atenderUpdate_, avisarSinCandado_, textoAvisoAlbum_,
  procesarUpdate_, doPost, registrarWebhook, verWebhook, dependenciasReales_,
  FILAS_REVISADAS_UPDATE,
} = require('../src/WebhookApp.js');

const SECRETO = 'a'.repeat(32);
const TOKEN = '123456:ABC-token-de-prueba';
const USUARIO = '1000000001';
const URL_APP = 'https://script.google.com/macros/s/AKfycbx-abc_123/exec';

const privado = (id) => ({ id: Number(id), type: 'private' });
const mensaje = (id = 7) => ({ update_id: id, message: { message_id: 1, chat: privado(USUARIO), text: 'hola' } });
const mensajeFoto = (id = 7) => ({
  update_id: id, message: { message_id: 1, chat: privado(USUARIO), photo: [{ file_id: 'f1' }] },
});
// Varias fotos del mismo álbum comparten media_group_id; cada una con su propio message_id.
const mensajeFotoAlbum = (id, idMsj, gid = 'gid-1') => ({
  update_id: id,
  message: {
    message_id: idMsj, chat: privado(USUARIO), photo: [{ file_id: 'f1' }], media_group_id: gid,
  },
});
const boton = (id = 8) => ({
  update_id: id, callback_query: { id: 'cb-1', data: 'x', message: { message_id: 2, chat: privado(USUARIO) } },
});
const evento = (update, k = SECRETO) => ({ parameter: { k }, postData: { contents: JSON.stringify(update) } });

function cacheFalsa() {
  const datos = new Map();
  return {
    datos, puestas: [],
    get: (k) => (datos.has(k) ? datos.get(k) : null),
    put(k, v, seg) { datos.set(k, v); this.puestas.push([k, v, seg]); },
  };
}

/** Pestaña _ESTADO falsa: fila 1 = encabezados, luego las filas agregadas. */
function hojaFalsa(filas = []) {
  const hoja = {
    filas: [[...COLUMNAS_ESTADO], ...filas], lecturas: 0, rangos: [],
    getLastRow: () => hoja.filas.length,
    getRange: (fila, col, n, m) => ({
      getValues: () => { hoja.lecturas += 1; hoja.rangos.push([fila, col, n, m]); return hoja.filas.slice(fila - 1, fila - 1 + n).map((f) => f.slice(col - 1, col - 1 + m)); },
    }),
    appendRow: (fila) => { hoja.filas.push(fila); return hoja; },
  };
  return hoja;
}

function candadoFalso(libre = true) {
  return {
    pedidos: [], tomado: false, liberado: 0,
    tryLock(ms) { this.pedidos.push(ms); this.tomado = libre; return libre; },
    releaseLock() { this.liberado += 1; this.tomado = false; },
  };
}

/** Deps.candadoAvisos es una función; esta arma una que siempre devuelve el mismo candado. */
function candadoAvisosFalso(libre = true) {
  const candado = candadoFalso(libre);
  return () => candado;
}

function dependencias(extra = {}) {
  const llamadas = [];
  return {
    llamadas,
    secreto: SECRETO, chatId: USUARIO, token: TOKEN,
    candado: candadoFalso(), candadoAvisos: candadoAvisosFalso(), cache: cacheFalsa(), hoja: hojaFalsa(),
    hojaEstado() { return this.hoja; },
    llamar: (token, metodo, cuerpo) => { llamadas.push({ token, metodo, cuerpo }); return { codigo: 200, datos: { ok: true } }; },
    ahora: () => new Date('2026-09-26T20:00:00Z'),
    ...extra,
  };
}

function respuestaFalsa(codigo, texto) {
  return { getResponseCode: () => codigo, getContentText: () => texto };
}

test.beforeEach(() => { atendidos.length = 0; });

test('constantes: caché de 6 h, candado de 240 s y tipo UPDATE', () => {
  assert.equal(SEGUNDOS_CACHE_UPDATE, 21600);
  assert.equal(ESPERA_CANDADO_MS, 240000);
  assert.equal(TIPO_ESTADO_UPDATE, 'UPDATE');
  assert.ok(PREFIJO_CACHE_UPDATE.length > 0);
  assert.ok(PREFIJO_CACHE_AVISO.length > 0);
});

test('llamarTelegram_ manda JSON por POST y devuelve código y datos', () => {
  let pedido;
  global.UrlFetchApp = { fetch: (url, opciones) => { pedido = { url, opciones }; return respuestaFalsa(200, '{"ok":true,"result":true}'); } };
  const r = llamarTelegram_(TOKEN, 'sendMessage', { chat_id: 1, text: 'x' });
  assert.deepEqual(r, { codigo: 200, datos: { ok: true, result: true } });
  assert.equal(pedido.url, `https://api.telegram.org/bot${TOKEN}/sendMessage`);
  assert.equal(pedido.opciones.method, 'post');
  assert.equal(pedido.opciones.contentType, 'application/json');
  assert.equal(pedido.opciones.muteHttpExceptions, true);
  assert.deepEqual(JSON.parse(pedido.opciones.payload), { chat_id: 1, text: 'x' });
});

test('llamarTelegram_ con respuesta que no es JSON devuelve datos vacíos', () => {
  global.UrlFetchApp = { fetch: () => respuestaFalsa(502, '<html>Bad Gateway</html>') };
  assert.deepEqual(llamarTelegram_(TOKEN, 'getWebhookInfo'), { codigo: 502, datos: {} });
});

test('llamarTelegram_ con respuesta JSON null devuelve datos vacíos', () => {
  global.UrlFetchApp = { fetch: () => respuestaFalsa(502, 'null') };
  assert.deepEqual(llamarTelegram_(TOKEN, 'getWebhookInfo'), { codigo: 502, datos: {} });
});

test('llamarTelegram_ al fallar la conexión lanza un error sin la URL ni el token', () => {
  global.UrlFetchApp = { fetch: (url) => { throw new Error(`DNS error: ${url}`); } };
  assert.throws(() => llamarTelegram_(TOKEN, 'sendMessage', {}), (error) => {
    assert.match(error.message, /Telegram sendMessage: no se pudo conectar/);
    assert.doesNotMatch(error.message, /token|api\.telegram\.org/);
    return true;
  });
});

test('yaVisto_ responde sí si el update está en la caché, sin leer la hoja', () => {
  const cache = cacheFalsa();
  cache.datos.set(`${PREFIJO_CACHE_UPDATE}7`, '1');
  const hoja = hojaFalsa();
  assert.equal(yaVisto_(7, cache, hoja), true);
  assert.equal(hoja.lecturas, 0);
});

test('yaVisto_ busca en _ESTADO solo filas UPDATE y compara la clave como texto', () => {
  const hoja = hojaFalsa([
    ['2026-09-26', 'OTRO', 7, '', '', ''],
    ['2026-09-26', 'UPDATE', '9', '', '', 'VISTO'],
  ]);
  assert.equal(yaVisto_(7, cacheFalsa(), hoja), false);
  assert.equal(yaVisto_(9, cacheFalsa(), hoja), true);
});

test('yaVisto_ con _ESTADO sin filas responde no', () => {
  assert.equal(yaVisto_(7, cacheFalsa(), hojaFalsa()), false);
});

test('yaVisto_ lee solo TIPO y CLAVE de las últimas filas de la ventana', () => {
  const iTipo = COLUMNAS_ESTADO.indexOf('TIPO');
  const iClave = COLUMNAS_ESTADO.indexOf('CLAVE');
  const relleno = Array.from({ length: FILAS_REVISADAS_UPDATE + 5 }, (_, i) => ['x', 'OTRO', i, '', '', '']);
  const hoja = hojaFalsa(relleno);
  assert.equal(yaVisto_(7, cacheFalsa(), hoja), false);
  const total = hoja.filas.length;
  assert.deepEqual(hoja.rangos, [[total - FILAS_REVISADAS_UPDATE + 1, iTipo + 1, FILAS_REVISADAS_UPDATE, iClave - iTipo + 1]]);
});

test('un UPDATE más viejo que la ventana no se busca', () => {
  const viejo = [['x', 'UPDATE', 77, '', '', 'VISTO']];
  const relleno = Array.from({ length: FILAS_REVISADAS_UPDATE }, (_, i) => ['x', 'OTRO', i, '', '', '']);
  assert.equal(yaVisto_(77, cacheFalsa(), hojaFalsa([...viejo, ...relleno])), false);
  const dentro = [['x', 'UPDATE', 78, '', '', 'VISTO'], ...relleno.slice(1)];
  assert.equal(yaVisto_(78, cacheFalsa(), hojaFalsa(dentro)), true);
});

test('con menos filas que la ventana lee desde la fila 2', () => {
  const hoja = hojaFalsa([['x', 'UPDATE', 5, '', '', 'VISTO'], ['x', 'OTRO', 6, '', '', '']]);
  assert.equal(yaVisto_(5, cacheFalsa(), hoja), true);
  assert.equal(hoja.rangos[0][0], 2);
  assert.equal(hoja.rangos[0][2], 2);
});

test('marcarVisto_ guarda en la caché 6 h y agrega la fila UPDATE en _ESTADO', () => {
  const cache = cacheFalsa();
  const hoja = hojaFalsa();
  const fecha = new Date('2026-09-26T20:00:00Z');
  marcarVisto_(7, cache, hoja, fecha);
  assert.deepEqual(cache.puestas, [[`${PREFIJO_CACHE_UPDATE}7`, '1', SEGUNDOS_CACHE_UPDATE]]);
  assert.deepEqual(hoja.filas[1], [fecha, 'UPDATE', 7, '', '', 'VISTO']);
  assert.equal(yaVisto_(7, cacheFalsa(), hoja), true);
});

test('marcarVisto_ no deja caché si appendRow falla', () => {
  const cache = cacheFalsa();
  const hoja = hojaFalsa();
  hoja.appendRow = () => { throw new Error('sin hoja'); };
  assert.throws(() => marcarVisto_(7, cache, hoja, new Date()), /sin hoja/);
  assert.deepEqual(cache.puestas, []);
});

test('atenderUpdate_ manda un mensaje a atenderMensaje_ con la pestaña _ESTADO', () => {
  const d = dependencias();
  const hoja = d.hoja;
  atenderUpdate_(mensaje(), d, hoja);
  assert.equal(atendidos.length, 1);
  assert.equal(atendidos[0].tipo, 'mensaje');
  assert.equal(atendidos[0].mensaje.message_id, 1);
  assert.equal(atendidos[0].hojaEstado, hoja);
  assert.deepEqual(d.llamadas, [{ token: TOKEN, metodo: 'sendMessage', cuerpo: { chat_id: Number(USUARIO), text: 'atendido' } }]);
});

test('atenderUpdate_ manda un botón a atenderBoton_', () => {
  const d = dependencias();
  atenderUpdate_(boton(), d, d.hoja);
  assert.equal(atendidos[0].tipo, 'boton');
  assert.equal(atendidos[0].cq.id, 'cb-1');
  assert.deepEqual(d.llamadas, [{ token: TOKEN, metodo: 'answerCallbackQuery', cuerpo: { callback_query_id: 'cb-1' } }]);
});

test('atenderUpdate_ sin token lanza error y no atiende nada', () => {
  const d = dependencias({ token: null });
  assert.throws(() => atenderUpdate_(mensaje(), d, d.hoja), /falta TELEGRAM_TOKEN/);
  assert.deepEqual(atendidos, []);
  assert.deepEqual(d.llamadas, []);
});

test('dependenciasReales_ arma todo lo que necesita el paso 15d y abre el libro una sola vez', () => {
  let aperturas = 0;
  const libro = { getSheetByName: (n) => ({ nombre: n }) };
  const candadoAviso = candadoFalso();
  global.PropertiesService = { getScriptProperties: () => ({ getProperty: (k) => `valor-${k}` }) };
  global.LockService = { getScriptLock: () => candadoFalso(), getUserLock: () => candadoAviso };
  global.CacheService = { getScriptCache: () => cacheFalsa() };
  global.SpreadsheetApp = { openById: () => { aperturas += 1; return libro; } };
  global.Utilities = { formatDate: (fecha, zona, formato) => `${zona}|${formato}` };
  const d = dependenciasReales_();
  assert.equal(d.token, 'valor-TELEGRAM_TOKEN');
  assert.equal(d.claveGemini, 'valor-GEMINI_API_KEY');
  // Respaldo de Groq, opcional (GROQ_API_KEY).
  assert.equal(d.claveGroq, 'valor-GROQ_API_KEY');
  assert.equal(d.libro(), libro);
  assert.equal(d.candadoAvisos(), candadoAviso); // candado corto de LockService.getUserLock
  assert.deepEqual(d.hojaEstado(), { nombre: '_ESTADO' });
  assert.equal(aperturas, 1);
  assert.equal(d.formatear(new Date(), 'yyyy-MM-dd'), `${CONFIG.TIMEZONE}|yyyy-MM-dd`);
  assert.equal(d.propiedades.getProperty('EDICIONES_CREADA'), 'valor-EDICIONES_CREADA');
  assert.equal(d.sello(), `${CONFIG.TIMEZONE}|${FORMATO_SELLO}`);
  assert.equal(typeof d.obtenerJson, 'function');
  assert.ok(d.ahora() instanceof Date);
});

test('dependenciasReales_ agrega descargar/base64/carpetaFacturas del paso 16b', () => {
  global.PropertiesService = { getScriptProperties: () => ({ getProperty: (k) => `valor-${k}` }) };
  global.LockService = { getScriptLock: () => candadoFalso() };
  global.CacheService = { getScriptCache: () => cacheFalsa() };
  global.SpreadsheetApp = { openById: () => ({ getSheetByName: () => null }) };
  global.Utilities = {
    formatDate: () => '',
    base64Encode: (bytes) => `b64:${bytes.join(',')}`,
  };
  let pedido;
  global.UrlFetchApp = {
    fetch: (url, opciones) => {
      pedido = { url, opciones };
      return { getResponseCode: () => 200, getBlob: () => ({ getBytes: () => [1, 2, 3] }) };
    },
  };
  const carpeta = { getName: () => 'Facturas' };
  global.DriveApp = { getFolderById: (id) => { assert.equal(id, CONFIG.FACTURAS_FOLDER_ID); return carpeta; } };
  const d = dependenciasReales_();
  const blob = d.descargar('https://api.telegram.org/file/bot123/photos/f1.jpg');
  assert.deepEqual(pedido.opciones, { muteHttpExceptions: true });
  assert.equal(d.base64(blob), 'b64:1,2,3');
  assert.equal(d.carpetaFacturas(), carpeta);
});

test('dependenciasReales_ agrega aPapelera (pt 110: foto de factura duplicada)', () => {
  global.PropertiesService = { getScriptProperties: () => ({ getProperty: () => '' }) };
  global.LockService = { getScriptLock: () => candadoFalso() };
  global.CacheService = { getScriptCache: () => cacheFalsa() };
  global.SpreadsheetApp = { openById: () => ({ getSheetByName: () => null }) };
  global.Utilities = { formatDate: () => '' };
  const trashed = [];
  global.DriveApp = { getFileById: (id) => ({ setTrashed: (v) => trashed.push([id, v]) }) };
  dependenciasReales_().aPapelera('foto-9');
  assert.deepEqual(trashed, [['foto-9', true]]);
});

test('dependenciasReales_ agrega archivoPorId del paso 16c (mover la foto tras el botón de fecha)', () => {
  global.PropertiesService = { getScriptProperties: () => ({ getProperty: () => '' }) };
  global.LockService = { getScriptLock: () => candadoFalso() };
  global.CacheService = { getScriptCache: () => cacheFalsa() };
  global.SpreadsheetApp = { openById: () => ({ getSheetByName: () => null }) };
  global.Utilities = { formatDate: () => '' };
  const archivo = { getId: () => 'archivo-1' };
  global.DriveApp = {
    getFolderById: () => ({ getName: () => 'Facturas' }),
    getFileById: (id) => { assert.equal(id, 'archivo-1'); return archivo; },
  };
  assert.equal(dependenciasReales_().archivoPorId('archivo-1'), archivo);
});

test('dependenciasReales_.descargar lanza un error sin la URL (lleva el token) si Telegram no responde 200', () => {
  global.PropertiesService = { getScriptProperties: () => ({ getProperty: () => '' }) };
  global.LockService = { getScriptLock: () => candadoFalso() };
  global.CacheService = { getScriptCache: () => cacheFalsa() };
  global.SpreadsheetApp = { openById: () => ({ getSheetByName: () => null }) };
  global.Utilities = { formatDate: () => '' };
  global.UrlFetchApp = { fetch: () => ({ getResponseCode: () => 404, getBlob: () => ({}) }) };
  const d = dependenciasReales_();
  const url = 'https://api.telegram.org/file/bot123456:secreto/photos/f1.jpg';
  assert.throws(() => d.descargar(url), (error) => {
    assert.ok(!error.message.includes('123456:secreto'));
    assert.ok(!error.message.includes(url));
    return true;
  });
});

test('procesarUpdate_ atiende un update nuevo: candado, marca visto, responde y suelta el candado', () => {
  const d = dependencias();
  assert.equal(procesarUpdate_(evento(mensaje(7)), d), 'atendido (update 7)');
  assert.deepEqual(d.candado.pedidos, [240000]);
  assert.equal(d.candado.liberado, 1);
  assert.equal(d.hoja.filas.length, 2);
  assert.equal(d.llamadas.length, 1);
});

test('procesarUpdate_ usa 8 s para botón y 240 s para mensaje', () => {
  const botonDeps = dependencias();
  procesarUpdate_(evento(boton(8)), botonDeps);
  assert.deepEqual(botonDeps.candado.pedidos, [8000]);
  const mensajeDeps = dependencias();
  procesarUpdate_(evento(mensaje(7)), mensajeDeps);
  assert.deepEqual(mensajeDeps.candado.pedidos, [240000]);
  assert.equal(ESPERA_CANDADO_BOTON_MS, 8000);
});

test('procesarUpdate_ avisa y relanza si appendRow de visto falla', () => {
  const d = dependencias();
  d.hoja.appendRow = () => { throw new Error('append roto'); };
  assert.throws(() => procesarUpdate_(evento(mensaje(7)), d), /append roto/);
  assert.deepEqual(d.cache.puestas, []);
  assert.equal(d.llamadas[0].metodo, 'sendMessage');
  assert.equal(d.llamadas[0].cuerpo.text, TEXTO_FALLO_MENSAJE);
});

const fallosConsultaEstado = [
  ['hojaEstado', (d, error) => { d.hojaEstado = () => { throw error; }; }],
  ['hoja nula', (d) => { d.hojaEstado = () => null; }],
  ['cache.get', (d, error) => { d.cache.get = () => { throw error; }; }],
  ['getValues', (d, error) => {
    d.hoja.filas.push(['', 'UPDATE', 'otro']);
    d.hoja.getRange = () => ({ getValues: () => { throw error; } });
  }],
];
fallosConsultaEstado.forEach(([nombre, preparar]) => {
  test(`fallo en ${nombre} avisa al usuario y conserva el error original`, () => {
    const error = nombre === 'hoja nula'
      ? null : new Error(`${nombre} roto`);
    const d = dependencias();
    preparar(d, error);
    assert.throws(() => procesarUpdate_(evento(mensaje(7)), d), (recibido) => {
      if (error) assert.equal(recibido, error, nombre);
      else assert.match(recibido.message, /falta la pestaña _ESTADO/);
      return true;
    });
    assert.deepEqual(d.llamadas, [{
      token: TOKEN, metodo: 'sendMessage',
      cuerpo: {
        chat_id: Number(USUARIO), text: TEXTO_FALLO_MENSAJE, reply_parameters: { message_id: 1 },
      },
    }], nombre);
    assert.equal(d.candado.liberado, 1, nombre);
    assert.deepEqual(d.cache.puestas, [], nombre);
    assert.equal(d.hoja.filas.filter((fila) => fila[1] === 'UPDATE' && fila[2] === 7).length, 0, nombre);
    assert.deepEqual(atendidos, [], nombre);
  });
});

test('fallo al consultar _ESTADO para botón no manda aviso de mensaje', () => {
  const error = new Error('cache rota');
  const d = dependencias();
  d.cache.get = () => { throw error; };
  assert.throws(() => procesarUpdate_(evento(boton(8)), d), (recibido) => recibido === error);
  assert.deepEqual(d.llamadas, []);
  assert.equal(d.candado.liberado, 1);
  assert.deepEqual(d.cache.puestas, []);
  assert.deepEqual(atendidos, []);
});

test('si el aviso de un fallo de consulta falla, conserva el fallo de consulta', () => {
  const error = new Error('no se pudo abrir _ESTADO');
  const d = dependencias({
    hojaEstado: () => { throw error; },
    llamar: () => { throw new Error('Telegram no responde'); },
  });
  const consola = console.error;
  const registros = [];
  console.error = (texto) => registros.push(texto);
  try {
    assert.throws(() => procesarUpdate_(evento(mensaje(7)), d), (recibido) => recibido === error);
    assert.equal(registros.length, 1);
    assert.deepEqual(d.cache.puestas, []);
    assert.deepEqual(atendidos, []);
    assert.equal(d.candado.liberado, 1);
  } finally {
    console.error = consola;
  }
});

test('si atender falla con un mensaje, avisa una vez al usuario y relanza el error original', () => {
  const error = new Error('Sheet ocupado');
  global.atenderMensaje_ = () => { throw error; };
  try {
    const d = dependencias();
    assert.throws(() => procesarUpdate_(evento(mensaje(7)), d), (e) => e === error);
    assert.equal(d.hoja.filas.length, 2);
    assert.deepEqual(d.llamadas, [{
      token: TOKEN, metodo: 'sendMessage',
      cuerpo: {
        chat_id: Number(USUARIO), text: TEXTO_FALLO_MENSAJE, reply_parameters: { message_id: 1 },
      },
    }]);
    assert.equal(TEXTO_FALLO_MENSAJE,
      'Algo me falló con este mensaje. Revisa en la hoja si quedó anotado; si no, mándamelo otra vez.');
    assert.equal(d.candado.liberado, 1);
  } finally {
    global.atenderMensaje_ = restaurarMensaje;
  }
});

test('si el aviso de fallo también falla, se traga y relanza el error original', () => {
  const error = new Error('original');
  global.atenderMensaje_ = () => { throw error; };
  const antes = console.error;
  const registro = [];
  console.error = (...a) => registro.push(a.join(' '));
  try {
    [() => { throw new Error(`x ${TOKEN}`); }, () => ({ codigo: 500, datos: { ok: false } })].forEach((llamar) => {
      const d = dependencias({ llamar });
      assert.throws(() => procesarUpdate_(evento(mensaje(7)), d), (e) => e === error);
    });
    assert.equal(registro.length, 2);
    registro.forEach((l) => assert.doesNotMatch(l, /ABC-token/));
  } finally {
    console.error = antes;
    global.atenderMensaje_ = restaurarMensaje;
  }
});

test('un botón que falla no manda aviso; sin token tampoco', () => {
  const error = new Error('boom');
  global.atenderBoton_ = () => { throw error; };
  try {
    const d = dependencias();
    assert.throws(() => procesarUpdate_(evento(boton(8)), d), (e) => e === error);
    assert.deepEqual(d.llamadas, []);
  } finally {
    global.atenderBoton_ = restaurarBoton;
  }
  const sinToken = dependencias({ token: null });
  assert.throws(() => procesarUpdate_(evento(mensaje(9)), sinToken), /falta TELEGRAM_TOKEN/);
  assert.deepEqual(sinToken.llamadas, []);
});

test('procesarUpdate_ ignora un update repetido (Telegram reintentó)', () => {
  const d = dependencias();
  procesarUpdate_(evento(mensaje(7)), d);
  assert.equal(procesarUpdate_(evento(mensaje(7)), d), 'repetido (update 7)');
  assert.equal(d.llamadas.length, 1);
  assert.equal(d.hoja.filas.length, 2);
  assert.equal(d.candado.liberado, 2);
});

test('procesarUpdate_ reconoce el repetido por _ESTADO aunque la caché se haya perdido', () => {
  const d = dependencias();
  procesarUpdate_(evento(mensaje(7)), d);
  d.cache = cacheFalsa();
  assert.equal(procesarUpdate_(evento(mensaje(7)), d), 'repetido (update 7)');
  assert.equal(d.llamadas.length, 1);
});

test('procesarUpdate_ rechaza sin candado ni hoja: secreto malo o chat ajeno', () => {
  const d = dependencias();
  assert.equal(procesarUpdate_(evento(mensaje(), 'b'.repeat(32)), d), 'rechazado: secreto');
  const ajeno = { update_id: 5, message: { message_id: 1, chat: privado('111'), text: 'hola' } };
  assert.equal(procesarUpdate_(evento(ajeno), d), 'rechazado: chat');
  assert.deepEqual(d.candado.pedidos, []);
  assert.equal(d.hoja.filas.length, 1);
  assert.deepEqual(d.llamadas, []);
});

test('procesarUpdate_ con el candado ocupado y un botón contesta el toque y no escribe nada', () => {
  const d = dependencias({ candado: candadoFalso(false) });
  assert.equal(procesarUpdate_(evento(boton(7)), d), 'sin candado, botón avisado (update 7)');
  assert.equal(d.hoja.filas.length, 1);
  assert.deepEqual(d.llamadas, [{
    token: TOKEN, metodo: 'answerCallbackQuery',
    cuerpo: { callback_query_id: 'cb-1', text: 'Estoy terminando otra cosa. Toca el botón otra vez en un minuto.' },
  }]);
  assert.equal(TEXTO_SIN_CANDADO_BOTON, 'Estoy terminando otra cosa. Toca el botón otra vez en un minuto.');
  assert.equal(d.candado.liberado, 0);
});

test('si no se puede contestar el toque, lanza error sin token ni URL', () => {
  const malos = [
    { llamar: () => { throw new Error(`fallo https://api.telegram.org/bot${TOKEN}/x`); } },
    { llamar: () => ({ codigo: 400, datos: { ok: false } }) },
    { token: null },
  ];
  malos.forEach((extra) => {
    const d = dependencias({ candado: candadoFalso(false), ...extra });
    assert.throws(() => procesarUpdate_(evento(boton(7)), d), (error) => {
      assert.match(error.message, /botón/);
      assert.doesNotMatch(error.message, /ABC-token|api\.telegram\.org/);
      return true;
    });
    assert.equal(d.hoja.filas.length, 1);
  });
});

test('procesarUpdate_ con el candado ocupado y un mensaje con foto avisa sin candado', () => {
  const d = dependencias({ candado: candadoFalso(false) });
  const resultado = procesarUpdate_(evento(mensajeFoto(7)), d);
  assert.equal(resultado, 'sin candado, aviso enviado (update 7)');
  assert.equal(d.hoja.filas.length, 1);
  assert.equal(d.candado.liberado, 0);
  assert.equal(d.llamadas.length, 1);
  assert.equal(d.llamadas[0].metodo, 'sendMessage');
  assert.equal(d.llamadas[0].cuerpo.chat_id, Number(USUARIO));
  assert.equal(d.llamadas[0].cuerpo.text, TEXTO_SIN_CANDADO_FOTO);
  assert.deepEqual(d.llamadas[0].cuerpo.reply_parameters, { message_id: 1 });
  assert.deepEqual(d.cache.puestas.map((p) => p[0]), [`${PREFIJO_CACHE_AVISO}7`]);
});

test('procesarUpdate_ con el candado ocupado y un mensaje de texto avisa con el texto de mensaje', () => {
  const d = dependencias({ candado: candadoFalso(false) });
  const resultado = procesarUpdate_(evento(mensaje(7)), d);
  assert.equal(resultado, 'sin candado, aviso enviado (update 7)');
  assert.equal(d.llamadas[0].cuerpo.text, TEXTO_SIN_CANDADO_MENSAJE);
});

test('procesarUpdate_ con varias fotos del mismo álbum encadena FOTO, FOTO_2, FOTO_3 y FOTO_3', () => {
  const d = dependencias({ candado: candadoFalso(false) });
  const r1 = procesarUpdate_(evento(mensajeFotoAlbum(7, 101)), d);
  const r2 = procesarUpdate_(evento(mensajeFotoAlbum(8, 102)), d);
  const r3 = procesarUpdate_(evento(mensajeFotoAlbum(9, 103)), d);
  const r4 = procesarUpdate_(evento(mensajeFotoAlbum(10, 104)), d);
  [r1, r2, r3, r4].forEach((r, i) => assert.equal(r, `sin candado, aviso enviado (update ${7 + i})`));
  assert.deepEqual(d.llamadas.map((l) => l.cuerpo.text),
    [TEXTO_SIN_CANDADO_FOTO, TEXTO_SIN_CANDADO_FOTO_2, TEXTO_SIN_CANDADO_FOTO_3, TEXTO_SIN_CANDADO_FOTO_3]);
  assert.deepEqual(d.llamadas.map((l) => l.cuerpo.reply_parameters.message_id), [101, 102, 103, 104]);
  assert.equal(d.candadoAvisos().liberado, 4);
  assert.equal(d.candadoAvisos().tomado, false);
});

test('procesarUpdate_ con otro media_group_id reinicia el conteo en FOTO', () => {
  const d = dependencias({ candado: candadoFalso(false) });
  procesarUpdate_(evento(mensajeFotoAlbum(7, 101, 'gid-1')), d);
  const r = procesarUpdate_(evento(mensajeFotoAlbum(8, 102, 'gid-2')), d);
  assert.equal(d.llamadas[1].cuerpo.text, TEXTO_SIN_CANDADO_FOTO);
  assert.equal(r, 'sin candado, aviso enviado (update 8)');
});

test('procesarUpdate_ con foto sin media_group_id usa FOTO y no toca el candado de avisos', () => {
  let llamado = false;
  const d = dependencias({ candado: candadoFalso(false), candadoAvisos: () => { llamado = true; return candadoFalso(); } });
  const r = procesarUpdate_(evento(mensajeFoto(7)), d);
  assert.equal(r, 'sin candado, aviso enviado (update 7)');
  assert.equal(d.llamadas[0].cuerpo.text, TEXTO_SIN_CANDADO_FOTO);
  assert.equal(llamado, false);
});

test('avisarFotoDeAlbum_ sin poder tomar el candado de avisos manda FOTO sin orden y no toca album:', () => {
  const d = dependencias({ candado: candadoFalso(false), candadoAvisos: candadoAvisosFalso(false) });
  const r = procesarUpdate_(evento(mensajeFotoAlbum(7, 101)), d);
  assert.match(r, /sin orden/);
  assert.equal(d.llamadas[0].cuerpo.text, TEXTO_SIN_CANDADO_FOTO);
  assert.deepEqual(d.cache.puestas.map((p) => p[0]), [`${PREFIJO_CACHE_AVISO}7`]);
});

test('avisarFotoDeAlbum_ si deps.candadoAvisos truena manda FOTO sin orden y no toca album:', () => {
  const d = dependencias({ candado: candadoFalso(false), candadoAvisos: () => { throw new Error('sin usuario activo'); } });
  const r = procesarUpdate_(evento(mensajeFotoAlbum(7, 101)), d);
  assert.match(r, /sin orden/);
  assert.equal(d.llamadas[0].cuerpo.text, TEXTO_SIN_CANDADO_FOTO);
  assert.deepEqual(d.cache.puestas.map((p) => p[0]), [`${PREFIJO_CACHE_AVISO}7`]);
});

test('avisarFotoDeAlbum_ no manda de nuevo si otro proceso puso el aviso justo al tomar el candado (carrera)', () => {
  const d = dependencias({ candado: candadoFalso(false) });
  const candado = candadoFalso(true);
  const tomar = candado.tryLock.bind(candado);
  // Simula que, mientras se esperaba el candado, otra foto del mismo update ya se avisó.
  candado.tryLock = (ms) => { const r = tomar(ms); d.cache.put(`${PREFIJO_CACHE_AVISO}7`, '1', SEGUNDOS_CACHE_UPDATE); return r; };
  d.candadoAvisos = () => candado;
  const r = procesarUpdate_(evento(mensajeFotoAlbum(7, 101)), d);
  assert.equal(r, 'sin candado, aviso ya enviado (update 7)');
  assert.deepEqual(d.llamadas, []);
  assert.equal(candado.liberado, 1);
});

test('avisarFotoDeAlbum_ si Telegram no confirma lanza error, no guarda aviso ni album:, y suelta el candado', () => {
  const d = dependencias({ candado: candadoFalso(false), llamar: () => ({ codigo: 200, datos: { ok: false } }) });
  assert.throws(() => procesarUpdate_(evento(mensajeFotoAlbum(7, 101)), d), /update 7/);
  assert.deepEqual(d.cache.puestas, []);
  assert.equal(d.candadoAvisos().liberado, 1);
});

test('textoAvisoAlbum_ devuelve FOTO en 0, FOTO_2 en 1 y FOTO_3 de 2 en adelante', () => {
  assert.equal(textoAvisoAlbum_(0), TEXTO_SIN_CANDADO_FOTO);
  assert.equal(textoAvisoAlbum_(1), TEXTO_SIN_CANDADO_FOTO_2);
  assert.equal(textoAvisoAlbum_(2), TEXTO_SIN_CANDADO_FOTO_3);
  assert.equal(textoAvisoAlbum_(5), TEXTO_SIN_CANDADO_FOTO_3);
});

test('constantes: candado de avisos de 20 s y prefijo de caché de álbum', () => {
  assert.equal(ESPERA_CANDADO_AVISO_MS, 20000);
  assert.ok(PREFIJO_CACHE_ALBUM.length > 0);
});

test('avisarSinCandado_ no avisa de nuevo si el update ya se atendió (caché de update:)', () => {
  const d = dependencias();
  d.cache.put(`${PREFIJO_CACHE_UPDATE}7`, '1', SEGUNDOS_CACHE_UPDATE);
  assert.equal(avisarSinCandado_(mensaje(7), d), 'sin candado, ya atendido (update 7)');
  assert.deepEqual(d.llamadas, []);
});

test('avisarSinCandado_ no repite el aviso si ya se envió antes', () => {
  const d = dependencias();
  d.cache.put(`${PREFIJO_CACHE_AVISO}7`, '1', SEGUNDOS_CACHE_UPDATE);
  assert.equal(avisarSinCandado_(mensaje(7), d), 'sin candado, aviso ya enviado (update 7)');
  assert.deepEqual(d.llamadas, []);
});

test('avisarSinCandado_ lanza error y no guarda el aviso si Telegram no confirma', () => {
  const d = dependencias({ llamar: () => ({ codigo: 200, datos: { ok: false } }) });
  assert.throws(() => avisarSinCandado_(mensaje(7), d), /update 7/);
  assert.deepEqual(d.cache.puestas, []);
});

test('avisarSinCandado_ lanza error y no guarda el aviso si falta el token', () => {
  const d = dependencias({ token: '' });
  assert.throws(() => avisarSinCandado_(mensaje(7), d), /update 7/);
  assert.deepEqual(d.cache.puestas, []);
});

test('avisarSinCandado_ lanza error sin token/URL si deps.llamar truena', () => {
  const d = dependencias({ llamar: () => { throw new Error('DNS falló: https://api.telegram.org/bot123'); } });
  assert.throws(() => avisarSinCandado_(mensaje(7), d), (error) => {
    assert.match(error.message, /update 7/);
    assert.doesNotMatch(error.message, /api\.telegram\.org|123/);
    return true;
  });
  assert.deepEqual(d.cache.puestas, []);
});

test('procesarUpdate_ suelta el candado aunque falle la respuesta a Telegram', () => {
  const d = dependencias({ llamar: () => ({ codigo: 500, datos: {} }) });
  assert.throws(() => procesarUpdate_(evento(mensaje(7)), d), /HTTP 500/);
  assert.equal(d.candado.liberado, 1);
  assert.equal(d.hoja.filas.length, 2);
});

/** Servicios de Google falsos para doPost, registrarWebhook y verWebhook. */
function serviciosFalsos({ propiedades = {}, fetch, hoja = hojaFalsa() } = {}) {
  const registro = [];
  const consola = [];
  const candado = candadoFalso();
  global.PropertiesService = { getScriptProperties: () => ({ getProperty: (k) => (k in propiedades ? propiedades[k] : null) }) };
  global.LockService = { getScriptLock: () => candado };
  global.CacheService = { getScriptCache: () => cacheFalsa() };
  global.SpreadsheetApp = {
    openById: (id) => ({ getSheetByName: (n) => (id === CONFIG.SHEET_ID && n === '_ESTADO' ? hoja : null) }),
  };
  global.HtmlService = { createHtmlOutput: (t) => ({ html: t }) };
  global.UrlFetchApp = { fetch: fetch || (() => respuestaFalsa(200, '{"ok":true}')) };
  global.Logger = { log: (l) => registro.push(l) };
  global.console = { ...console, log: (l) => consola.push(['log', l]), error: (l) => consola.push(['error', l]) };
  return { registro, consola, candado, hoja };
}

const consolaReal = console;
test.afterEach(() => { global.console = consolaReal; });

test('doPost atiende al usuario, devuelve HTML vacío y registra solo el resultado', () => {
  const pedidos = [];
  const s = serviciosFalsos({
    propiedades: { WEBHOOK_SECRET: SECRETO, TELEGRAM_TOKEN: TOKEN },
    fetch: (url, o) => { pedidos.push({ url, cuerpo: JSON.parse(o.payload) }); return respuestaFalsa(200, '{"ok":true}'); },
  });
  const salida = doPost(evento(mensaje(7)));
  assert.deepEqual(salida, { html: '' });
  assert.deepEqual(pedidos.map((p) => p.cuerpo.text), ['atendido']);
  assert.deepEqual(s.consola, [['log', 'webhook: atendido (update 7)']]);
  assert.equal(s.candado.liberado, 1);
});

test('doPost ante cualquier error igual devuelve HTML vacío y registra el error sin el secreto', () => {
  const s = serviciosFalsos({
    propiedades: { WEBHOOK_SECRET: SECRETO, TELEGRAM_TOKEN: TOKEN },
    fetch: () => { throw new Error('x'); },
  });
  assert.deepEqual(doPost(evento(mensaje(7))), { html: '' });
  // el aviso de fallo también falla (mismo fetch caído): se registra aparte y luego el original.
  assert.equal(s.consola.length, 2);
  assert.equal(s.consola[0][0], 'error');
  assert.match(s.consola[0][1], /^webhook: no se pudo avisar del fallo del update 7/);
  assert.equal(s.consola[1][0], 'error');
  assert.match(s.consola[1][1], /^webhook: Telegram sendMessage: no se pudo conectar/);
  assert.doesNotMatch(JSON.stringify(s.consola), new RegExp(`${SECRETO}|${TOKEN}`));
});

test('doPost sin evento (ejecutado desde el editor) no se cae', () => {
  const s = serviciosFalsos({ propiedades: { WEBHOOK_SECRET: SECRETO } });
  assert.deepEqual(doPost(undefined), { html: '' });
  assert.deepEqual(s.consola, [['log', 'webhook: rechazado: secreto']]);
});

test('registrarWebhook sin WEBAPP_URL avisa y no llama a Telegram', () => {
  let llamadas = 0;
  const s = serviciosFalsos({
    propiedades: { WEBHOOK_SECRET: SECRETO, TELEGRAM_TOKEN: TOKEN },
    fetch: () => { llamadas += 1; return respuestaFalsa(200, '{"ok":true}'); },
  });
  assert.equal(registrarWebhook(''), false);
  assert.equal(llamadas, 0);
  assert.match(s.registro.join('\n'), /falta CONFIG.WEBAPP_URL/);
});

test('registrarWebhook manda setWebhook con la URL y registra el resultado sin el secreto', () => {
  let pedido;
  const s = serviciosFalsos({
    propiedades: { WEBHOOK_SECRET: SECRETO, TELEGRAM_TOKEN: TOKEN },
    fetch: (url, o) => { pedido = { url, cuerpo: JSON.parse(o.payload) }; return respuestaFalsa(200, '{"ok":true,"description":"Webhook was set"}'); },
  });
  assert.equal(registrarWebhook(URL_APP), true);
  assert.match(pedido.url, /\/setWebhook$/);
  assert.equal(pedido.cuerpo.url, `${URL_APP}?k=${SECRETO}`);
  assert.deepEqual(pedido.cuerpo.allowed_updates, ['message', 'callback_query']);
  assert.deepEqual(s.registro, ['setWebhook: ok (Webhook was set)']);
});

test('registrarWebhook usa CONFIG.WEBAPP_URL si no recibe URL', () => {
  const s = serviciosFalsos({ propiedades: { WEBHOOK_SECRET: SECRETO, TELEGRAM_TOKEN: TOKEN } });
  const esperado = CONFIG.WEBAPP_URL ? true : false;
  assert.equal(registrarWebhook(), esperado);
  assert.equal(s.registro.length, 1);
});

test('registrarWebhook informa la falla de Telegram', () => {
  const s = serviciosFalsos({
    propiedades: { WEBHOOK_SECRET: SECRETO, TELEGRAM_TOKEN: TOKEN },
    fetch: () => respuestaFalsa(400, '{"ok":false,"description":"Bad Request: bad webhook"}'),
  });
  assert.equal(registrarWebhook(URL_APP), false);
  assert.deepEqual(s.registro, ['setWebhook: falla (HTTP 400 — Bad Request: bad webhook)']);
});

test('registrarWebhook sin TELEGRAM_TOKEN avisa y no llama a Telegram', () => {
  let llamadas = 0;
  const s = serviciosFalsos({ propiedades: { WEBHOOK_SECRET: SECRETO }, fetch: () => { llamadas += 1; } });
  assert.equal(registrarWebhook(URL_APP), false);
  assert.equal(llamadas, 0);
  assert.match(s.registro.join('\n'), /falta TELEGRAM_TOKEN/);
});

test('verWebhook registra el resumen de getWebhookInfo con el secreto oculto', () => {
  const info = {
    url: `${URL_APP}?k=${SECRETO}`, pending_update_count: 0, max_connections: 1,
    allowed_updates: ['message', 'callback_query'],
  };
  const s = serviciosFalsos({
    propiedades: { TELEGRAM_TOKEN: TOKEN },
    fetch: () => respuestaFalsa(200, JSON.stringify({ ok: true, result: info })),
  });
  const lineas = verWebhook();
  assert.deepEqual(s.registro, lineas);
  assert.equal(lineas[0], `url: ${URL_APP}?k=***`);
  assert.doesNotMatch(lineas.join('\n'), new RegExp(SECRETO));
});

test('verWebhook informa la falla de Telegram', () => {
  const s = serviciosFalsos({
    propiedades: { TELEGRAM_TOKEN: TOKEN },
    fetch: () => respuestaFalsa(401, '{"ok":false,"description":"Unauthorized"}'),
  });
  assert.deepEqual(verWebhook(), ['getWebhookInfo: falla (HTTP 401 — Unauthorized)']);
  assert.deepEqual(s.registro, ['getWebhookInfo: falla (HTTP 401 — Unauthorized)']);
});

test('verWebhook sin TELEGRAM_TOKEN avisa', () => {
  const s = serviciosFalsos();
  assert.deepEqual(verWebhook(), ['falta TELEGRAM_TOKEN (ejecuta verificarPropiedades)']);
  assert.equal(s.registro.length, 1);
});

// --- Configuración incompleta: el bot se niega a trabajar ---

const configConEjemplos = (extra = {}) => Object.freeze({ ...CONFIG, SHEET_ID: 'TU_SHEET_ID', ...extra });

test('doPost con CONFIG sin completar responde vacío, no procesa nada y registra el motivo', () => {
  const pedidos = [];
  const s = serviciosFalsos({
    propiedades: { WEBHOOK_SECRET: SECRETO, TELEGRAM_TOKEN: TOKEN },
    fetch: (url, o) => { pedidos.push({ url, o }); return respuestaFalsa(200, '{"ok":true}'); },
  });
  const configReal = global.CONFIG;
  global.CONFIG = configConEjemplos({ ERIN_CHAT_ID: 'TU_CHAT_ID' });
  try {
    assert.deepEqual(doPost(evento(mensaje(7))), { html: '' });
  } finally {
    global.CONFIG = configReal;
  }
  assert.deepEqual(pedidos, []);
  assert.equal(s.candado.liberado, 0);
  assert.equal(s.consola.length, 1);
  assert.equal(s.consola[0][0], 'error');
  assert.match(s.consola[0][1], /^webhook: Falta completar src\/Config\.js\. Valores pendientes: SHEET_ID, ERIN_CHAT_ID$/);
});

test('registrarWebhook con CONFIG sin completar lanza un error claro y no llama a Telegram', () => {
  let llamadas = 0;
  serviciosFalsos({
    propiedades: { WEBHOOK_SECRET: SECRETO, TELEGRAM_TOKEN: TOKEN },
    fetch: () => { llamadas += 1; return respuestaFalsa(200, '{"ok":true}'); },
  });
  const configReal = global.CONFIG;
  global.CONFIG = configConEjemplos();
  try {
    assert.throws(() => registrarWebhook(URL_APP), /Falta completar src\/Config\.js.*SHEET_ID/);
  } finally {
    global.CONFIG = configReal;
  }
  assert.equal(llamadas, 0);
});
