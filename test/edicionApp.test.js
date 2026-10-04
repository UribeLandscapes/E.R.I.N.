const test = require('node:test');
const assert = require('node:assert/strict');

// En Apps Script estos nombres son globales; en Node se ponen a mano antes de requerir EdicionApp.js
// (mismo orden que edicion.test.js, más HojaApp.js por PESTANA_ESTADO y RegistroApp.js/ReintentoApp.js
// por cerrarEstado_/quitarBotonesPropuesta_).
global.MESES = require('../src/Hoja.js').MESES;
Object.assign(global, require('../src/Hoja.js'));
Object.assign(global, require('../src/Reglas.js'));
Object.assign(global, require('../src/Carpetas.js'));
Object.assign(global, require('../src/CarpetasApp.js'));
Object.assign(global, require('../src/Clases.js'));
Object.assign(global, require('../src/Texto.js'));
Object.assign(global, require('../src/Moneda.js'));
Object.assign(global, require('../src/Confirmacion.js'));
Object.assign(global, require('../src/Foto.js'));
Object.assign(global, require('../src/Botones.js'));
Object.assign(global, require('../src/Fecha.js'));
Object.assign(global, require('../src/Mensajes.js'));
Object.assign(global, require('../src/Webhook.js'));
Object.assign(global, require('../src/WebhookApp.js'));
Object.assign(global, require('../src/Escritura.js'));
Object.assign(global, require('../src/PorProcesar.js'));
global.CONFIG = require('./configPrueba.js').CONFIG;
test.beforeEach(() => { global.Utilities = { formatDate: () => '20260928-093000' }; });
global.PESTANA_ESTADO = require('../src/HojaApp.js').PESTANA_ESTADO;
Object.assign(global, require('../src/Edicion.js'));
Object.assign(global, require('../src/EscrituraApp.js'));
Object.assign(global, require('../src/BotonesApp.js'));
Object.assign(global, require('../src/RegistroApp.js'));
Object.assign(global, require('../src/MensajesApp.js'));
Object.assign(global, require('../src/Importacion.js'));
Object.assign(global, require('../src/Duplicado.js'));
Object.assign(global, require('../src/DuplicadoApp.js'));
Object.assign(global, require('../src/ReintentoApp.js'));
Object.assign(global, require('../src/Ediciones.js'));
Object.assign(global, require('../src/EdicionesApp.js'));

const {
  ESPERA_CANDADO_EDICION_MS, nombreAColumnas_, filaObjeto_, todosIdsFilas_, moverFotoSiCambioFecha_, sellarYRevisar_,
  procesarEdicion_, manejarEdicion_, alEditar, dependenciasEdicionReales_, revisarEdiciones_, revisarEdiciones,
} = require('../src/EdicionApp.js');
const { COLUMNAS, COLUMNAS_ESTADO } = require('../src/Hoja.js');
const { TIPO_ESTADO_PREGUNTA, PREGUNTA_ABIERTA } = require('../src/Escritura.js');
const { TIPO_ESTADO_POR_PROCESAR } = require('../src/PorProcesar.js');
const { TEXTO_PREGUNTA_CERRADA_HOJA } = require('../src/Edicion.js');

/** Hoja falsa por celdas, como falsos.js pero sin la prueba de assert que exige node:assert. */
function hojaFalsa(nombre, filasIniciales = {}) {
  const celdas = new Map();
  const clave = (f, c) => `${f},${c}`;
  Object.entries(filasIniciales).forEach(([fila, valores]) => {
    Object.entries(valores).forEach(([col, v]) => celdas.set(clave(Number(fila), Number(col)), v));
  });
  const escrituras = [];
  return {
    nombre,
    escrituras,
    getName: () => nombre,
    getMaxRows: () => Math.max(20, ...[...celdas.keys()].map((k) => Number(k.split(',')[0]))),
    getLastRow: () => Math.max(1, ...[...celdas.keys()].map((k) => Number(k.split(',')[0]))),
    appendRow: (valores) => {
      const f = Math.max(1, ...[...celdas.keys()].map((k) => Number(k.split(',')[0]))) + 1;
      valores.forEach((v, i) => celdas.set(clave(f, i + 1), v));
    },
    getRange: (f, c, nf = 1, nc = 1) => ({
      getValues: () => Array.from({ length: nf }, (_, i) => Array.from({ length: nc },
        (__, j) => (celdas.has(clave(f + i, c + j)) ? celdas.get(clave(f + i, c + j)) : ''))),
      getValue: () => (celdas.has(clave(f, c)) ? celdas.get(clave(f, c)) : ''),
      setValue: (v) => { celdas.set(clave(f, c), v); escrituras.push([f, c, v]); },
      setValues: (filas) => filas.forEach((valores, i) => valores.forEach((v, j) => {
        celdas.set(clave(f + i, c + j), v);
        escrituras.push([f + i, c + j, v]);
      })),
    }),
  };
}

function libroFalso(hojas, conEdiciones = true) {
  const lista = [...hojas];
  if (conEdiciones) lista.push(hojaFalsa('_EDICIONES', { 1: Object.fromEntries(
    COLUMNAS_EDICIONES.map((c, i) => [i + 1, c]),
  ) }));
  return {
    hojas: lista,
    getSheets: () => [...lista],
    getSheetByName: (n) => lista.find((h) => h.nombre === n) || null,
    insertSheet: (nombre) => {
      const hoja = hojaFalsa(nombre);
      lista.push(hoja);
      return hoja;
    },
  };
}

global.crearPestanaOculta_ = (ss, nombre, columnas) => {
  const hoja = ss.insertSheet(nombre);
  columnas.forEach((columna, i) => hoja.getRange(1, i + 1).setValue(columna));
};

/** Fila del mes {columna: valor} → { fila, col } por número de columna, para sembrar hojaFalsa. */
function filaSembrada(numero, valores = {}) {
  const objeto = {};
  COLUMNAS.forEach((c, i) => { objeto[i + 1] = c in valores ? valores[c] : ''; });
  return { [numero]: objeto };
}

function fusionar(...bloques) {
  const out = {};
  bloques.forEach((b) => Object.entries(b).forEach(([f, cols]) => { out[f] = { ...(out[f] || {}), ...cols }; }));
  return out;
}

/** e.range falso: fila/col de inicio y cuántas, sobre la pestaña dada. */
function rangoFalso(hoja, fila, numFilas, col = 1, numCols = COLUMNAS.length) {
  return {
    getSheet: () => hoja,
    getRow: () => fila,
    getNumRows: () => numFilas,
    getColumn: () => col,
    getNumCols: () => numCols,
    getNumColumns: () => numCols,
  };
}

const iteradorFalso_ = (lista) => {
  let i = 0;
  return { hasNext: () => i < lista.length, next: () => lista[i++] };
};

/** Archivo falso de Drive: guarda nombre y carpeta, como el de carpetasApp.test.js. */
function archivoFalso(id, nombre, carpeta) {
  const archivo = {
    id, nombre, carpeta, movidas: 0,
    getId: () => archivo.id,
    getName: () => archivo.nombre,
    setName: (n) => { archivo.nombre = n; return archivo; },
    getMimeType: () => 'image/jpeg',
    getParents: () => iteradorFalso_([archivo.carpeta]),
    getUrl: () => `https://drive.google.com/file/d/${archivo.id}/view`,
    moveTo: (destino) => {
      archivo.carpeta.archivos = archivo.carpeta.archivos.filter((a) => a !== archivo);
      destino.archivos.push(archivo);
      archivo.carpeta = destino;
      archivo.movidas += 1;
      return archivo;
    },
  };
  carpeta.archivos.push(archivo);
  return archivo;
}

/** Carpeta falsa de Drive: raíz de Facturas para moverFotoSiCambioFecha_/clasificarFoto_. */
function carpetaFalsa(nombre) {
  const carpeta = {
    id: `carpeta-${nombre}-${Math.random()}`, nombre, hijas: [], archivos: [],
    getId: () => carpeta.id,
    getName: () => carpeta.nombre,
    getFoldersByName: (n) => iteradorFalso_(carpeta.hijas.filter((h) => h.nombre === n)),
    getFilesByName: (n) => iteradorFalso_(carpeta.archivos.filter((a) => a.nombre === n)),
    createFolder: (n) => {
      const hija = carpetaFalsa(n);
      carpeta.hijas.push(hija);
      return hija;
    },
  };
  return carpeta;
}

function candadoFalso(libre = true) {
  return {
    pedidos: [], liberado: 0,
    tryLock(ms) { this.pedidos.push(ms); return libre; },
    releaseLock() { this.liberado += 1; },
  };
}

function llamarFalso(respuestas) {
  const llamadas = [];
  return {
    llamadas,
    llamar: (token, metodo, cuerpo) => {
      llamadas.push([metodo, cuerpo]);
      const r = respuestas[metodo];
      if (typeof r === 'function') return r(cuerpo);
      return r || { codigo: 200, datos: { ok: true, result: {} } };
    },
  };
}

function deps({
  candado = candadoFalso(true), respuestas = {}, archivos = {}, raiz = carpetaFalsa('Facturas'),
  propiedades = propiedadesFalsas({ [PROPIEDAD_EDICIONES_CREADA]: '20260927-000000' }),
} = {}) {
  const { llamadas, llamar } = llamarFalso(respuestas);
  return {
    candado, propiedades, sello: () => '20260928-093000',
    llamadas, llamar, token: 'TESTTOKEN:abc', chatId: CONFIG.ERIN_CHAT_ID,
    ahora: () => new Date(2026, 8, 28, 9, 30, 0),
    formatear: () => '20260928-093000',
    // por defecto sin archivos falsos; las pruebas de la foto los siembran con archivoPorId.
    archivoPorId: (id) => {
      if (!archivos[id]) throw new Error(`archivo falso no sembrado: ${id}`);
      return archivos[id];
    },
    carpetaFacturas: () => raiz,
  };
}

function propiedadesFalsas(inicial = {}) {
  const datos = { ...inicial };
  return {
    datos, llamadas: [],
    getProperty: (nombre) => datos[nombre] || null,
    setProperty(nombre, valor) { this.llamadas.push([nombre, valor]); datos[nombre] = valor; },
    deleteProperty(nombre) { this.llamadas.push(['borrar', nombre]); delete datos[nombre]; },
  };
}

function conSpyError(fn) {
  const real = console.error;
  const avisos = [];
  console.error = (t) => avisos.push(t);
  try {
    fn(avisos);
  } finally {
    console.error = real;
  }
}

// --- nombreAColumnas_ / filaObjeto_ / todosIdsFilas_ ---

test('nombreAColumnas_: mapea el rango de columnas editadas a sus nombres de COLUMNAS', () => {
  assert.deepEqual(nombreAColumnas_(1, 3), [COLUMNAS[0], COLUMNAS[1], COLUMNAS[2]]);
});

test('nombreAColumnas_: un rango más allá de la última columna no revienta', () => {
  assert.deepEqual(nombreAColumnas_(COLUMNAS.length, 3), [COLUMNAS[COLUMNAS.length - 1]]);
});

test('filaObjeto_: lee la fila completa de la hoja como {columna: valor}', () => {
  const hoja = hojaFalsa('Septiembre 2026', filaSembrada(6, { PROVEEDOR: 'Xtra' }));
  assert.equal(filaObjeto_(hoja, 6).PROVEEDOR, 'Xtra');
});

test('todosIdsFilas_: junta los ID FILAS de PREGUNTA y POR-PROCESAR abiertas, sin repetir', () => {
  const filaPregunta = COLUMNAS_ESTADO.map((c) => ({
    CREADO: new Date(), TIPO: TIPO_ESTADO_PREGUNTA, CLAVE: 501, 'ID FILAS': 'BOT-1,BOT-2',
    DATOS: JSON.stringify({ preguntas: ['total'], pestana: 'Septiembre 2026', escrito: {} }),
    ESTADO: PREGUNTA_ABIERTA,
  }[c]));
  const filaPP = COLUMNAS_ESTADO.map((c) => ({
    CREADO: new Date(), TIPO: TIPO_ESTADO_POR_PROCESAR, CLAVE: 777, 'ID FILAS': 'BOT-2',
    DATOS: JSON.stringify({ fechaMensaje: '2026-09-27', idMensaje: 777, idPregunta: 900 }),
    ESTADO: PREGUNTA_ABIERTA,
  }[c]));
  assert.deepEqual(todosIdsFilas_([filaPregunta, filaPP]).sort(), ['BOT-1', 'BOT-2']);
});

// --- procesarEdicion_ / manejarEdicion_ ---

test('procesarEdicion_: pestaña que no es de mes (_ESTADO) se ignora, no escribe nada', () => {
  const hojaEstado = hojaFalsa('_ESTADO');
  procesarEdicion_({ source: libroFalso([hojaEstado]), range: rangoFalso(hojaEstado, 2, 1) }, deps());
  assert.deepEqual(hojaEstado.escrituras, []);
});

test('procesarEdicion_: filas 1 a 5 (encabezados) se ignoran', () => {
  const mes = hojaFalsa('Septiembre 2026');
  const estado = hojaFalsa('_ESTADO');
  procesarEdicion_({ source: libroFalso([mes, estado]), range: rangoFalso(mes, 3, 3) }, deps());
  assert.deepEqual(mes.escrituras, []);
});

test('procesarEdicion_: pegar varias filas manuales sella cada una con su propio número de fila', () => {
  const mes = hojaFalsa('Septiembre 2026', fusionar(
    filaSembrada(6, { PROVEEDOR: 'Whole Foods' }),
    filaSembrada(7, { PROVEEDOR: 'Xtra' }),
  ));
  const estado = hojaFalsa('_ESTADO');
  procesarEdicion_({ source: libroFalso([mes, estado]), range: rangoFalso(mes, 6, 2) }, deps());
  assert.equal(filaObjeto_(mes, 6)['ID FILA'], 'MANUAL-20260928-093000-6');
  assert.equal(filaObjeto_(mes, 7)['ID FILA'], 'MANUAL-20260928-093000-7');
  assert.equal(filaObjeto_(mes, 6).ORIGEN, 'MANUAL');
  assert.equal(filaObjeto_(mes, 7).ORIGEN, 'MANUAL');
});

test('procesarEdicion_: fila del bot (ORIGEN distinto de MANUAL) no se sella', () => {
  const mes = hojaFalsa('Septiembre 2026', filaSembrada(6, {
    'ID FILA': 'BOT-20260926-161020-501-1', ORIGEN: 'BOT', PROVEEDOR: 'Xtra',
  }));
  const estado = hojaFalsa('_ESTADO');
  procesarEdicion_({ source: libroFalso([mes, estado]), range: rangoFalso(mes, 6, 1) }, deps());
  assert.deepEqual(mes.escrituras, []);
});

test('procesarEdicion_: corregir GASTO (USD) con un número quita la marca TOTAL de REVISAR', () => {
  const colGasto = COLUMNAS.indexOf('GASTO (USD)') + 1;
  const mes = hojaFalsa('Septiembre 2026', filaSembrada(6, {
    'ID FILA': 'BOT-20260928-093001-1-1', ORIGEN: 'BOT', 'GASTO (USD)': 20, REVISAR: 'PENDIENTE: TOTAL',
  }));
  const estado = hojaFalsa('_ESTADO');
  procesarEdicion_({ source: libroFalso([mes, estado]), range: rangoFalso(mes, 6, 1, colGasto, 1) }, deps());
  assert.equal(filaObjeto_(mes, 6).REVISAR, '');
});

test('procesarEdicion_: vaciar la celda deja la marca de REVISAR (no se toca)', () => {
  const colGasto = COLUMNAS.indexOf('GASTO (USD)') + 1;
  const mes = hojaFalsa('Septiembre 2026', filaSembrada(6, {
    'ID FILA': 'BOT-20260928-093001-1-1', ORIGEN: 'BOT', 'GASTO (USD)': '', REVISAR: 'PENDIENTE: TOTAL',
  }));
  const estado = hojaFalsa('_ESTADO');
  procesarEdicion_({ source: libroFalso([mes, estado]), range: rangoFalso(mes, 6, 1, colGasto, 1) }, deps());
  assert.equal(filaObjeto_(mes, 6).REVISAR, 'PENDIENTE: TOTAL');
});

function filaEstadoPregunta({ clave, idFilas, idPregunta }) {
  const tipo = idPregunta === undefined ? TIPO_ESTADO_PREGUNTA : TIPO_ESTADO_POR_PROCESAR;
  const datos = idPregunta === undefined
    ? { preguntas: ['total'], pestana: 'Septiembre 2026', escrito: {} }
    : { fechaMensaje: '2026-09-27', idMensaje: clave, idPregunta };
  const objeto = {
    CREADO: new Date(2026, 8, 27), TIPO: tipo, CLAVE: clave, 'ID FILAS': idFilas.join(','),
    DATOS: JSON.stringify(datos), ESTADO: PREGUNTA_ABIERTA,
  };
  return COLUMNAS_ESTADO.map((c) => objeto[c]);
}

test('procesarEdicion_: pregunta sin nada PENDIENTE en sus filas se cierra y avisa al usuario', () => {
  const colGasto = COLUMNAS.indexOf('GASTO (USD)') + 1;
  const mes = hojaFalsa('Septiembre 2026', filaSembrada(6, {
    'ID FILA': 'BOT-1', ORIGEN: 'BOT', PROVEEDOR: 'Xtra', 'GASTO (USD)': 20,
  }));
  const estado = hojaFalsa('_ESTADO', { 2: {} });
  estado.appendRow(filaEstadoPregunta({ clave: 501, idFilas: ['BOT-1'] }));
  const d = deps();
  procesarEdicion_({ source: libroFalso([mes, estado]), range: rangoFalso(mes, 6, 1, colGasto, 1) }, d);
  assert.equal(filaObjeto_(estado, 2).ESTADO ?? estado.getRange(2, COLUMNAS_ESTADO.indexOf('ESTADO') + 1).getValue(), 'CERRADA');
  const metodos = d.llamadas.map((l) => l[0]);
  assert.ok(metodos.includes('editMessageReplyMarkup'));
  const envio = d.llamadas.find((l) => l[0] === 'sendMessage');
  assert.equal(envio[1].text, TEXTO_PREGUNTA_CERRADA_HOJA);
  assert.deepEqual(envio[1].reply_parameters, { message_id: 501 });
});

test('procesarEdicion_: si Telegram falla al cerrar, la pregunta igual queda cerrada y solo se loguea', () => {
  const colGasto = COLUMNAS.indexOf('GASTO (USD)') + 1;
  const mes = hojaFalsa('Septiembre 2026', filaSembrada(6, {
    'ID FILA': 'BOT-1', ORIGEN: 'BOT', PROVEEDOR: 'Xtra', 'GASTO (USD)': 20,
  }));
  const estado = hojaFalsa('_ESTADO');
  estado.appendRow(filaEstadoPregunta({ clave: 501, idFilas: ['BOT-1'] }));
  const d = deps({
    respuestas: {
      editMessageReplyMarkup: () => ({ codigo: 400, datos: { ok: false, description: 'no modificado' } }),
      sendMessage: () => ({ codigo: 500, datos: { ok: false, description: 'caído' } }),
    },
  });
  conSpyError((avisos) => {
    procesarEdicion_({ source: libroFalso([mes, estado]), range: rangoFalso(mes, 6, 1, colGasto, 1) }, d);
    assert.ok(avisos.some((a) => a.includes('alEditar')));
  });
  assert.equal(estado.getRange(2, COLUMNAS_ESTADO.indexOf('ESTADO') + 1).getValue(), 'CERRADA');
});

test('procesarEdicion_: pregunta con CLAVE vacía (sin idMensajeBot) se cierra sin llamar a Telegram', () => {
  const colGasto = COLUMNAS.indexOf('GASTO (USD)') + 1;
  const mes = hojaFalsa('Septiembre 2026', filaSembrada(6, {
    'ID FILA': 'BOT-1', ORIGEN: 'BOT', PROVEEDOR: 'Xtra', 'GASTO (USD)': 20,
  }));
  const estado = hojaFalsa('_ESTADO');
  estado.appendRow(filaEstadoPregunta({ clave: '', idFilas: ['BOT-1'] }));
  const d = deps();
  procesarEdicion_({ source: libroFalso([mes, estado]), range: rangoFalso(mes, 6, 1, colGasto, 1) }, d);
  assert.equal(estado.getRange(2, COLUMNAS_ESTADO.indexOf('ESTADO') + 1).getValue(), 'CERRADA');
  assert.deepEqual(d.llamadas, []);
});

test('procesarEdicion_: sin pestaña _ESTADO todavía (recién creado el libro) no truena', () => {
  const mes = hojaFalsa('Septiembre 2026', filaSembrada(6, { PROVEEDOR: 'Whole Foods' }));
  assert.doesNotThrow(() => procesarEdicion_(
    { source: libroFalso([mes]), range: rangoFalso(mes, 6, 1) }, deps(),
  ));
});

// --- moverFotoSiCambioFecha_ / procesarEdicion_ mueve la foto ---

const colFecha = COLUMNAS.indexOf('FECHA') + 1;
const urlFoto = (id) => `https://drive.google.com/file/d/${id}/view?usp=drivesdk`;

test('moverFotoSiCambioFecha_: foto ya clasificada, FECHA editada a una fecha válida → la mueve y renombra', () => {
  const porClasificar = carpetaFalsa('Por clasificar');
  const archivo = archivoFalso('ID1', '2026.07.03 - Seven 11 compra.jpg', porClasificar);
  const mes = hojaFalsa('Septiembre 2026', filaSembrada(6, { FECHA: '2026-08-15', FOTO: urlFoto('ID1') }));
  const d = deps({ archivos: { ID1: archivo } });
  moverFotoSiCambioFecha_(mes, 6, ['FECHA'], d);
  assert.equal(archivo.movidas, 1);
  assert.equal(archivo.carpeta.nombre, '8. Agosto');
  assert.equal(archivo.nombre, '2026.08.15 - Seven 11 compra.jpg');
});

test('moverFotoSiCambioFecha_: nombre todavía sin clasificar (Por clasificar) usa PROVEEDOR como descripción', () => {
  const porClasificar = carpetaFalsa('Por clasificar');
  const archivo = archivoFalso('ID2', 'tg-555.jpg', porClasificar);
  const mes = hojaFalsa('Septiembre 2026', filaSembrada(6, {
    FECHA: '2026-08-15', FOTO: urlFoto('ID2'), PROVEEDOR: 'Xtra',
  }));
  const d = deps({ archivos: { ID2: archivo } });
  moverFotoSiCambioFecha_(mes, 6, ['FECHA'], d);
  assert.equal(archivo.movidas, 1);
  assert.equal(archivo.nombre, '2026.08.15 - Xtra.jpg');
});

test('moverFotoSiCambioFecha_: nombre sin clasificar y PROVEEDOR vacío → no toca Drive, solo loguea', () => {
  const porClasificar = carpetaFalsa('Por clasificar');
  const archivo = archivoFalso('ID3', 'tg-555.jpg', porClasificar);
  const mes = hojaFalsa('Septiembre 2026', filaSembrada(6, { FECHA: '2026-08-15', FOTO: urlFoto('ID3') }));
  const d = deps({ archivos: { ID3: archivo } });
  conSpyError((avisos) => {
    moverFotoSiCambioFecha_(mes, 6, ['FECHA'], d);
    assert.ok(avisos.some((a) => a.includes('sin descripción')));
  });
  assert.equal(archivo.movidas, 0);
  assert.equal(archivo.nombre, 'tg-555.jpg');
});

test('moverFotoSiCambioFecha_: FECHA no editada → no llama a Drive (ni archivoPorId)', () => {
  const mes = hojaFalsa('Septiembre 2026', filaSembrada(6, { FECHA: '2026-08-15', FOTO: urlFoto('NUNCA') }));
  assert.doesNotThrow(() => moverFotoSiCambioFecha_(mes, 6, ['PROVEEDOR'], deps()));
});

test('moverFotoSiCambioFecha_: sin FOTO → no llama a Drive', () => {
  const mes = hojaFalsa('Septiembre 2026', filaSembrada(6, { FECHA: '2026-08-15', FOTO: '' }));
  assert.doesNotThrow(() => moverFotoSiCambioFecha_(mes, 6, ['FECHA'], deps()));
});

test('moverFotoSiCambioFecha_: FECHA inválida → no llama a Drive', () => {
  const mes = hojaFalsa('Septiembre 2026', filaSembrada(6, { FECHA: '2026-02-30', FOTO: urlFoto('NUNCA') }));
  assert.doesNotThrow(() => moverFotoSiCambioFecha_(mes, 6, ['FECHA'], deps()));
});

test('procesarEdicion_: FECHA corregida a mano mueve la foto de la fila (integración completa)', () => {
  const porClasificar = carpetaFalsa('Por clasificar');
  const archivo = archivoFalso('ID4', '2026.07.03 - taxi.jpg', porClasificar);
  const mes = hojaFalsa('Septiembre 2026', filaSembrada(6, {
    'ID FILA': 'BOT-1', ORIGEN: 'BOT', FECHA: '2026-08-15', FOTO: urlFoto('ID4'),
  }));
  const estado = hojaFalsa('_ESTADO');
  const d = deps({ archivos: { ID4: archivo } });
  procesarEdicion_(
    { source: libroFalso([mes, estado]), range: rangoFalso(mes, 6, 1, colFecha, 1) }, d,
  );
  assert.equal(archivo.movidas, 1);
  assert.equal(archivo.nombre, '2026.08.15 - taxi.jpg');
});

test('procesarEdicion_: pegar dos filas con FECHA y FOTO mueve la foto de cada una', () => {
  const porClasificar = carpetaFalsa('Por clasificar');
  const archivoA = archivoFalso('IDA', '2026.07.03 - taxi.jpg', porClasificar);
  const archivoB = archivoFalso('IDB', '2026.07.04 - almuerzo.jpg', porClasificar);
  const mes = hojaFalsa('Septiembre 2026', fusionar(
    filaSembrada(6, { FECHA: '2026-08-15', FOTO: urlFoto('IDA') }),
    filaSembrada(7, { FECHA: '2026-08-16', FOTO: urlFoto('IDB') }),
  ));
  const estado = hojaFalsa('_ESTADO');
  const d = deps({ archivos: { IDA: archivoA, IDB: archivoB } });
  procesarEdicion_(
    { source: libroFalso([mes, estado]), range: rangoFalso(mes, 6, 2, colFecha, 1) }, d,
  );
  assert.equal(archivoA.nombre, '2026.08.15 - taxi.jpg');
  assert.equal(archivoB.nombre, '2026.08.16 - almuerzo.jpg');
});

test('procesarEdicion_: si Drive falla al mover la foto, solo se loguea y sigue el resto (sello/REVISAR/preguntas)', () => {
  const mes = hojaFalsa('Septiembre 2026', filaSembrada(6, {
    FECHA: '2026-08-15', FOTO: urlFoto('NO-SEMBRADO'), PROVEEDOR: 'Whole Foods',
  }));
  const estado = hojaFalsa('_ESTADO');
  const d = deps(); // archivoPorId lanza: 'NO-SEMBRADO' no está en `archivos`
  conSpyError((avisos) => {
    procesarEdicion_(
      { source: libroFalso([mes, estado]), range: rangoFalso(mes, 6, 1, colFecha, 1) }, d,
    );
    assert.ok(avisos.some((a) => a.includes('no se pudo mover la foto')));
  });
  // el resto de alEditar (sello manual de la fila) siguió corriendo:
  assert.equal(filaObjeto_(mes, 6)['ID FILA'], 'MANUAL-20260928-093000-6');
});

// --- manejarEdicion_ (candado + nunca lanza) ---

test('manejarEdicion_: sin candado registra "alEditar sin candado" y no escribe nada', () => {
  const mes = hojaFalsa('Septiembre 2026', filaSembrada(6, { PROVEEDOR: 'Whole Foods' }));
  const estado = hojaFalsa('_ESTADO');
  const d = deps({ candado: candadoFalso(false) });
  conSpyError((avisos) => {
    manejarEdicion_({ source: libroFalso([mes, estado]), range: rangoFalso(mes, 6, 1) }, d);
    assert.deepEqual(avisos, ['alEditar sin candado']);
  });
  assert.deepEqual(mes.escrituras, []);
});

test('manejarEdicion_: suelta el candado incluso si procesarEdicion_ revienta', () => {
  const mes = hojaFalsa('Septiembre 2026', filaSembrada(6, { PROVEEDOR: 'Whole Foods' }));
  const candado = candadoFalso(true);
  const d = deps({ candado });
  d.formatear = () => { throw new Error('boom'); };
  conSpyError((avisos) => {
    assert.doesNotThrow(() => manejarEdicion_({ source: libroFalso([mes]), range: rangoFalso(mes, 6, 1) }, d));
    assert.ok(avisos.some((a) => a.includes('alEditar')));
  });
  assert.equal(candado.liberado, 1);
});

test('manejarEdicion_: un error inesperado nunca se propaga hacia el usuario', () => {
  const rangoQueRevienta = {
    getSheet: () => { throw new Error('algo raro'); },
    getRow: () => 6,
    getNumRows: () => 1,
    getColumn: () => 1,
    getNumColumns: () => 1,
  };
  const d = deps();
  conSpyError((avisos) => {
    assert.doesNotThrow(() => manejarEdicion_({ source: libroFalso([]), range: rangoQueRevienta }, d));
    assert.equal(avisos.length, 1);
  });
});

test('ESPERA_CANDADO_EDICION_MS es un número de milisegundos corto', () => {
  assert.ok(Number.isInteger(ESPERA_CANDADO_EDICION_MS) && ESPERA_CANDADO_EDICION_MS > 0
    && ESPERA_CANDADO_EDICION_MS <= 10000);
});

// --- alEditar (instalable) y dependenciasEdicionReales_ ---

test('alEditar: usa dependenciasEdicionReales_ y nunca lanza aunque falten los globales de Google', () => {
  assert.doesNotThrow(() => alEditar({
    source: libroFalso([]),
    range: {
      getSheet: () => { throw new Error('sin SpreadsheetApp en la prueba'); },
      getRow: () => 6,
      getNumRows: () => 1,
      getColumn: () => 1,
      getNumColumns: () => 1,
    },
  }));
});

test('dependenciasEdicionReales_: arma candado, token y chatId desde los servicios de Google', () => {
  global.PropertiesService = { getScriptProperties: () => ({ getProperty: () => 'TESTTOKEN:abc' }) };
  global.LockService = { getScriptLock: () => candadoFalso(true) };
  global.Utilities = { formatDate: () => '20260928-093000' };
  // archivoPorId y carpetaFacturas son DriveApp real; aquí solo se prueba que arman la llamada.
  global.DriveApp = {
    getFileById: (id) => ({ id }),
    getFolderById: (id) => ({ id }),
  };
  try {
    const d = dependenciasEdicionReales_();
    assert.equal(d.token, 'TESTTOKEN:abc');
    assert.equal(d.chatId, CONFIG.ERIN_CHAT_ID);
    assert.equal(typeof d.candado.tryLock, 'function');
    assert.equal(typeof d.ahora, 'function');
    assert.ok(d.ahora() instanceof Date);
    assert.equal(d.sello(), '20260928-093000');
    assert.equal(d.formatear(new Date(), 'x'), '20260928-093000');
    assert.deepEqual(d.archivoPorId('ID9'), { id: 'ID9' });
    assert.deepEqual(d.carpetaFacturas(), { id: CONFIG.FACTURAS_FOLDER_ID });
  } finally {
    delete global.PropertiesService;
    delete global.LockService;
    delete global.Utilities;
    delete global.DriveApp;
  }
});

test('sellarYRevisar_: escapa fórmulas en COMENTARIOS y REVISAR cuando escriben', () => {
  // Mock selloManual_ para devolver valores con fórmulas
  const selloManualOriginal = global.selloManual_;
  global.selloManual_ = () => ({
    REGISTRADO: new Date(2026, 8, 28, 9, 30, 0),
    'COMENTARIOS': '=IMPORTDATA("x")',
  });
  const revisarOriginal = global.revisarTrasEdicion_;
  global.revisarTrasEdicion_ = () => '=REVISAR_FORMULA';
  try {
    const sep = hojaFalsa('Septiembre 2026', filaSembrada(6, { PROVEEDOR: 'Inicial', COMENTARIOS: '', REVISAR: '' }));
    const tiempos = { numeroFila: 6, ahora: new Date(), formatear: () => '20260928-093000' };
    const antes = filaObjeto_(sep, 6);
    antes['ID FILA'] = 'BOT-20260928-093001-1-1';
    antes.ORIGEN = 'BOT';
    const registro = registroEdiciones_({ filas: [], corte: '20260928-093000', disponible: true });
    sellarYRevisar_(sep, 6, ['GASTO (USD)'], tiempos, antes, registro);
    assert.equal(sep.getRange(6, numeroColumna_('COMENTARIOS')).getValue(), "'=IMPORTDATA(\"x\")");
    assert.equal(sep.getRange(6, numeroColumna_('REVISAR')).getValue(), "'=REVISAR_FORMULA");
  } finally {
    global.selloManual_ = selloManualOriginal;
    global.revisarTrasEdicion_ = revisarOriginal;
  }
});

const idBotNuevo = 'BOT-20260928-093001-701-1';
const colGasto26b = COLUMNAS.indexOf('GASTO (USD)') + 1;
const colRevisar26b = COLUMNAS.indexOf('REVISAR') + 1;

function eventoBot26b(valores = {}, fila = 6, col = colGasto26b, ancho = 1) {
  const mes = hojaFalsa('Septiembre 2026', filaSembrada(fila, {
    'ID FILA': idBotNuevo, ORIGEN: 'BOT', 'GASTO (USD)': 20,
    REVISAR: 'PENDIENTE: TOTAL', ...valores,
  }));
  const ss = libroFalso([mes]);
  return { mes, ss, e: { source: ss, range: rangoFalso(mes, fila, 1, col, ancho) } };
}

test('26b: una celda del bot se anota antes del candado ocupado', () => {
  const { ss, e } = eventoBot26b();
  const d = deps({ candado: candadoFalso(false) });
  conSpyError(() => manejarEdicion_(e, d));
  const ediciones = ss.getSheetByName('_EDICIONES');
  assert.equal(ediciones.getLastRow(), 2);
  assert.equal(ediciones.getRange(2, 3).getValue(), idBotNuevo);
  assert.equal(ediciones.getRange(2, 4).getValue(), 'GASTO (USD)');
  assert.equal(d.propiedades.getProperty(PROPIEDAD_EDICIONES_PERDIDA), null);
});

test('26b: pegar un rango en dos filas anota una por fila y excluye ocultas', () => {
  const { mes, ss } = eventoBot26b({}, 6, colRevisar26b - 1, 6);
  Object.entries(filaSembrada(7, { 'ID FILA': 'BOT-20260928-093002-702-1', ORIGEN: 'BOT' })[7])
    .forEach(([col, valor]) => mes.getRange(7, Number(col)).setValue(valor));
  const e = { source: ss, range: rangoFalso(mes, 6, 2, colRevisar26b - 1, 6) };
  manejarEdicion_(e, deps());
  const ediciones = ss.getSheetByName('_EDICIONES');
  assert.equal(ediciones.getLastRow(), 3);
  const columnas = ediciones.getRange(2, 4).getValue();
  assert.equal(columnas, [COLUMNAS[colRevisar26b - 2], 'REVISAR', 'CASA'].join('|'));
  assert.equal(ediciones.getRange(3, 4).getValue(), columnas);
});

test('26b: fila manual no se anota ni altera REVISAR, con candado libre u ocupado', () => {
  for (const libre of [true, false]) {
    const { mes, ss, e } = eventoBot26b({ 'ID FILA': '', ORIGEN: '', PROVEEDOR: 'Xtra' });
    const d = deps({ candado: candadoFalso(libre) });
    conSpyError(() => manejarEdicion_(e, d));
    assert.equal(ss.getSheetByName('_EDICIONES').getLastRow(), 1);
    assert.equal(filaObjeto_(mes, 6).REVISAR, 'PENDIENTE: TOTAL');
    if (libre) assert.match(filaObjeto_(mes, 6)['ID FILA'], /^MANUAL-/);
  }
});

test('26b: REVISAR tocado o ya anotado no cambia; fila nueva libre sí', () => {
  const casos = [
    { col: colRevisar26b, protegida: true },
    { col: colGasto26b, protegida: true, anotada: true },
    { col: colGasto26b, protegida: false },
  ];
  for (const caso of casos) {
    const { mes, ss } = eventoBot26b({}, 6, caso.col);
    const e = { source: ss, range: rangoFalso(mes, 6, 1, caso.col, 1) };
    if (caso.anotada) ss.getSheetByName('_EDICIONES').appendRow([
      new Date(), 'Septiembre 2026', idBotNuevo, 'REVISAR',
    ]);
    manejarEdicion_(e, deps());
    assert.equal(filaObjeto_(mes, 6).REVISAR, caso.protegida ? 'PENDIENTE: TOTAL' : '');
  }
});

test('26b: fila del bot anterior o igual al corte y MANUAL- quedan protegidas', () => {
  for (const id of [
    'BOT-20260926-235959-1-1', 'BOT-20260927-000000-1-2', 'MANUAL-20260928-093000-6',
  ]) {
    const { mes, e } = eventoBot26b({ 'ID FILA': id });
    manejarEdicion_(e, deps());
    assert.equal(filaObjeto_(mes, 6).REVISAR, 'PENDIENTE: TOTAL');
  }
});

test('26b: alEditar propaga fallo doble de appendRow y PropertiesService', () => {
  const { ss, e } = eventoBot26b();
  ss.getSheetByName('_EDICIONES').appendRow = () => { throw new Error('hoja'); };
  const props = propiedadesFalsas({ [PROPIEDAD_EDICIONES_CREADA]: '20260927-000000' });
  props.setProperty = () => { throw new Error('propiedades'); };
  global.PropertiesService = { getScriptProperties: () => props };
  global.LockService = { getScriptLock: () => candadoFalso(true) };
  global.Utilities = { formatDate: () => '20260928-093000' };
  try {
    conSpyError(() => assert.throws(() => alEditar(e), /propiedades/));
  } finally {
    delete global.PropertiesService;
    delete global.LockService;
    delete global.Utilities;
  }
});

test('26b: alEditar sigue en modo protegido si getSheetByName lanza', () => {
  const { mes, ss, e } = eventoBot26b();
  ss.getSheetByName = () => { throw new Error('lectura de pestaña'); };
  const props = propiedadesFalsas({ [PROPIEDAD_EDICIONES_CREADA]: '20260927-000000' });
  const candado = candadoFalso(true);
  global.PropertiesService = { getScriptProperties: () => props };
  global.LockService = { getScriptLock: () => candado };
  global.Utilities = { formatDate: () => '20260928-093000' };
  try {
    conSpyError(() => assert.doesNotThrow(() => alEditar(e)));
    assert.ok(props.getProperty(PROPIEDAD_EDICIONES_PERDIDA));
    assert.equal(filaObjeto_(mes, 6).REVISAR, 'PENDIENTE: TOTAL');
    assert.equal(candado.liberado, 1);
  } finally {
    delete global.PropertiesService;
    delete global.LockService;
    delete global.Utilities;
  }
});

test('26b: ID FILA vaciado se resella MANUAL y no se anota', () => {
  const { mes, ss, e } = eventoBot26b({ 'ID FILA': '' });
  manejarEdicion_(e, deps());
  assert.match(filaObjeto_(mes, 6)['ID FILA'], /^MANUAL-/);
  assert.equal(filaObjeto_(mes, 6).REVISAR, 'PENDIENTE: TOTAL');
  assert.equal(ss.getSheetByName('_EDICIONES').getLastRow(), 1);
});

test('26b: arranque toma un solo candado y guarda propiedad antes de pestaña', () => {
  const { mes } = eventoBot26b();
  const ss = libroFalso([mes], false);
  const e = { source: ss, range: rangoFalso(mes, 6, 1, colGasto26b, 1) };
  const candado = candadoFalso(true);
  const d = deps({ candado, propiedades: propiedadesFalsas() });
  const crear = global.crearPestanaOculta_;
  global.crearPestanaOculta_ = (libro, nombre, columnas) => {
    assert.equal(d.propiedades.getProperty(PROPIEDAD_EDICIONES_CREADA), d.sello());
    crear(libro, nombre, columnas);
  };
  try {
    manejarEdicion_(e, d);
    manejarEdicion_(e, d);
    assert.equal(candado.pedidos.length, 2);
    assert.equal(candado.liberado, 2);
    assert.equal(ss.getSheetByName('_EDICIONES').getLastRow(), 3);
  } finally { global.crearPestanaOculta_ = crear; }
});

test('26b: arranque sin candado o pestaña borrada marcan pérdida sin recrear', () => {
  const { mes } = eventoBot26b();
  const ss = libroFalso([mes], false);
  const e = { source: ss, range: rangoFalso(mes, 6, 1, colGasto26b, 1) };
  const props = propiedadesFalsas();
  conSpyError(() => manejarEdicion_(e, deps({ candado: candadoFalso(false), propiedades: props })));
  assert.ok(props.getProperty(PROPIEDAD_EDICIONES_PERDIDA));
  assert.equal(ss.getSheetByName('_EDICIONES'), null);
  props.deleteProperty(PROPIEDAD_EDICIONES_PERDIDA);
  props.setProperty(PROPIEDAD_EDICIONES_CREADA, '20260928-093000');
  conSpyError(() => manejarEdicion_(e, deps({ propiedades: props })));
  assert.ok(props.getProperty(PROPIEDAD_EDICIONES_PERDIDA));
  assert.equal(ss.getSheetByName('_EDICIONES'), null);
});

test('26b: fallo al crear después del corte deja pérdida y libera candado', () => {
  const { mes } = eventoBot26b();
  const ss = libroFalso([mes], false);
  const e = { source: ss, range: rangoFalso(mes, 6, 1, colGasto26b, 1) };
  const candado = candadoFalso(true);
  const props = propiedadesFalsas();
  const crear = global.crearPestanaOculta_;
  global.crearPestanaOculta_ = () => { throw new Error('crear falló'); };
  try {
    conSpyError(() => manejarEdicion_(e, deps({ candado, propiedades: props })));
    assert.ok(props.getProperty(PROPIEDAD_EDICIONES_PERDIDA));
    assert.equal(candado.liberado, 1);
  } finally { global.crearPestanaOculta_ = crear; }
});

test('26b: appendRow fallido marca pérdida; doble fallo propaga la anotación', () => {
  const { ss, e } = eventoBot26b();
  ss.getSheetByName('_EDICIONES').appendRow = () => { throw new Error('hoja'); };
  const props = propiedadesFalsas({ [PROPIEDAD_EDICIONES_CREADA]: '20260927-000000' });
  conSpyError(() => manejarEdicion_(e, deps({ propiedades: props })));
  assert.ok(props.getProperty(PROPIEDAD_EDICIONES_PERDIDA));
  props.deleteProperty(PROPIEDAD_EDICIONES_PERDIDA);
  props.setProperty = (nombre) => {
    if (nombre === PROPIEDAD_EDICIONES_PERDIDA) throw new Error('propiedades');
  };
  conSpyError((avisos) => {
    assert.throws(() => manejarEdicion_(e, deps({ propiedades: props })), /propiedades/);
    assert.ok(avisos.some((aviso) => aviso.includes(idBotNuevo)));
  });
});

test('26b: recuperar mueve el corte sin marca y cuenta filas', () => {
  const { ss } = eventoBot26b();
  ss.getSheetByName('_EDICIONES').appendRow([new Date(), 'Septiembre 2026', idBotNuevo, 'FECHA']);
  const d = deps();
  const real = console.log;
  const avisos = [];
  console.log = (texto) => avisos.push(texto);
  try {
    const resultado = revisarEdiciones_(ss, d);
    assert.deepEqual(resultado, { corte: d.sello(), accion: 'verificada', filas: 1 });
    assert.equal(d.propiedades.getProperty(PROPIEDAD_EDICIONES_CREADA), d.sello());
    assert.ok(avisos[0].includes('1 filas anotadas'));
  } finally { console.log = real; }
});

test('26b: recuperar crea pestaña faltante y quita la marca al final', () => {
  const { mes } = eventoBot26b();
  const ss = libroFalso([mes], false);
  const d = deps({ propiedades: propiedadesFalsas({ [PROPIEDAD_EDICIONES_PERDIDA]: 'antes' }) });
  const real = console.log;
  console.log = () => {};
  try {
    assert.equal(revisarEdiciones_(ss, d).accion, 'creada');
    assert.equal(d.propiedades.getProperty(PROPIEDAD_EDICIONES_PERDIDA), null);
  } finally { console.log = real; }
});

test('26b: recuperar repara encabezado vacío y conserva marca ante encabezados malos', () => {
  const { ss } = eventoBot26b();
  const hoja = ss.getSheetByName('_EDICIONES');
  const d = deps({ propiedades: propiedadesFalsas({ [PROPIEDAD_EDICIONES_PERDIDA]: 'antes' }) });
  const ultima = hoja.getLastRow;
  hoja.getLastRow = () => 0;
  const real = console.log;
  console.log = () => {};
  try { revisarEdiciones_(ss, d); } finally { console.log = real; hoja.getLastRow = ultima; }
  assert.equal(d.propiedades.getProperty(PROPIEDAD_EDICIONES_PERDIDA), null);
  hoja.getRange(1, 1).setValue('MAL');
  d.propiedades.setProperty(PROPIEDAD_EDICIONES_PERDIDA, 'otra vez');
  conSpyError(() => assert.throws(() => revisarEdiciones_(ss, d), /encabezados inválidos/));
  assert.equal(d.propiedades.getProperty(PROPIEDAD_EDICIONES_PERDIDA), 'otra vez');
});

test('26b: revisarEdiciones pide 30 s y libera candado; ocupado lanza', () => {
  const { ss } = eventoBot26b();
  const props = propiedadesFalsas();
  let libre = false;
  const candado = { pedidos: [], liberado: 0, tryLock(ms) { this.pedidos.push(ms); return libre; },
    releaseLock() { this.liberado += 1; } };
  global.PropertiesService = { getScriptProperties: () => props };
  global.LockService = { getScriptLock: () => candado };
  global.SpreadsheetApp = { openById: () => ss };
  global.Utilities = { formatDate: () => '20260928-093000' };
  const real = console.log;
  console.log = () => {};
  try {
    assert.throws(() => revisarEdiciones(), /candado ocupado/);
    libre = true;
    revisarEdiciones();
    assert.deepEqual(candado.pedidos, [30000, 30000]);
    assert.equal(candado.liberado, 1);
  } finally {
    console.log = real;
    delete global.PropertiesService;
    delete global.LockService;
    delete global.SpreadsheetApp;
    delete global.Utilities;
  }
});
