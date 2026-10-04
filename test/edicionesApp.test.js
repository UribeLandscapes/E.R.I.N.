const test = require('node:test');
const assert = require('node:assert/strict');

Object.assign(global, require('../src/Hoja.js'));
Object.assign(global, require('../src/Escritura.js'));
Object.assign(global, require('../src/Edicion.js'));
Object.assign(global, require('../src/Ediciones.js'));
global.CONFIG = require('./configPrueba.js').CONFIG;
global.FORMATO_SELLO = require('../src/Mensajes.js').FORMATO_SELLO;
global.Utilities = { formatDate(fecha, zona, formato) {
  assert.ok(fecha instanceof Date);
  assert.equal(zona, CONFIG.TIMEZONE);
  assert.equal(formato, FORMATO_SELLO);
  return '20260928-093000';
} };
const {
  estadoActualEdiciones_, marcarPerdida_, arrancarEdiciones_, leerRegistroEdiciones_,
  asegurarEdiciones_, registroParaEscribir_, avisarChoques_,
} = require('../src/EdicionesApp.js');

function propiedadesFalsas(inicial = {}) {
  const datos = { ...inicial };
  return {
    datos, llamadas: [],
    getProperty(nombre) { return datos[nombre] || null; },
    setProperty(nombre, valor) { this.llamadas.push([nombre, valor]); datos[nombre] = valor; },
    deleteProperty(nombre) { delete datos[nombre]; },
  };
}

function hojaEdiciones(encabezados = COLUMNAS_EDICIONES, filas = []) {
  const hoja = {
    datos: encabezados ? [[...encabezados], ...filas] : [], anexadas: [],
    getLastRow() { return this.datos.length; },
    getRange(fila, columna, alto, ancho) {
      return { getValues: () => this.datos.slice(fila - 1, fila - 1 + alto)
        .map((r) => r.slice(columna - 1, columna - 1 + ancho)) };
    },
    appendRow(fila) { this.anexadas.push(fila); this.datos.push([...fila]); },
  };
  return hoja;
}

function libroFalso(hoja = null) {
  return {
    hoja, creadas: 0,
    getSheetByName() { return this.hoja; },
  };
}

global.crearPestanaOculta_ = (ss, nombre, columnas) => {
  assert.equal(nombre, PESTANA_EDICIONES);
  ss.creadas += 1;
  ss.hoja = hojaEdiciones(columnas);
};
const crearPestanaOcultaOriginal = global.crearPestanaOculta_;
test.afterEach(() => { global.crearPestanaOculta_ = crearPestanaOcultaOriginal; });

test('estado: inicio, lista, pérdida por pestaña sola o encabezado ilegible', () => {
  const props = propiedadesFalsas();
  const ss = libroFalso();
  assert.equal(estadoActualEdiciones_(ss, props).estado, 'ARRANCAR');
  ss.hoja = hojaEdiciones();
  assert.equal(estadoActualEdiciones_(ss, props).estado, 'PERDIDA');
  props.setProperty(PROPIEDAD_EDICIONES_CREADA, '20260928-093000');
  assert.equal(estadoActualEdiciones_(ss, props).estado, 'LISTA');
  ss.hoja.getRange = () => { throw new Error('lectura'); };
  assert.equal(estadoActualEdiciones_(ss, props).estado, 'PERDIDA');
});

test('pestaña vacía o con encabezado incorrecto es pérdida', () => {
  const props = propiedadesFalsas({ [PROPIEDAD_EDICIONES_CREADA]: '20260928-093000' });
  const ss = libroFalso(hojaEdiciones(null));
  assert.equal(estadoActualEdiciones_(ss, props).estado, 'PERDIDA');
  ss.hoja = hojaEdiciones(['FECHA', 'MAL', 'ID FILA', 'COLUMNAS']);
  assert.equal(estadoActualEdiciones_(ss, props).estado, 'PERDIDA');
});

test('getSheetByName fallido equivale a pestaña perdida y protege el registro', () => {
  const props = propiedadesFalsas({ [PROPIEDAD_EDICIONES_CREADA]: '20260928-093000' });
  const ss = { getSheetByName() { throw new Error('lectura de pestaña'); } };
  const real = console.error;
  console.error = () => {};
  try {
    assert.deepEqual(estadoActualEdiciones_(ss, props), { estado: 'PERDIDA', hoja: null });
    assert.equal(leerRegistroEdiciones_(ss, props).disponible, false);
    assert.ok(props.getProperty(PROPIEDAD_EDICIONES_PERDIDA));
  } finally { console.error = real; }
});

test('arranque guarda el corte antes de crear y el segundo uso no cambia nada', () => {
  const props = propiedadesFalsas();
  const ss = libroFalso();
  global.crearPestanaOculta_ = (libro, nombre, columnas) => {
    assert.equal(props.getProperty(PROPIEDAD_EDICIONES_CREADA), '20260928-093000');
    libro.creadas += 1;
    libro.hoja = hojaEdiciones(columnas);
  };
  arrancarEdiciones_(ss, props, '20260928-093000');
  arrancarEdiciones_(ss, props, '20260929-093000');
  assert.equal(ss.creadas, 1);
  assert.equal(props.getProperty(PROPIEDAD_EDICIONES_CREADA), '20260928-093000');
});

test('fallo entre propiedad y pestaña marca pérdida y no recrea después', () => {
  const props = propiedadesFalsas();
  const ss = libroFalso();
  global.crearPestanaOculta_ = () => { throw new Error('crear'); };
  const real = console.error;
  console.error = () => {};
  try {
    assert.throws(() => arrancarEdiciones_(ss, props, '20260928-093000'), /crear/);
    assert.ok(props.getProperty(PROPIEDAD_EDICIONES_PERDIDA));
    assert.equal(estadoActualEdiciones_(ss, props).estado, 'PERDIDA');
  } finally { console.error = real; }
});

test('arranque revalida bajo candado y rechaza una pestaña sin propiedad', () => {
  const props = propiedadesFalsas();
  const ss = libroFalso(hojaEdiciones());
  const real = console.error;
  console.error = () => {};
  try {
    assert.throws(() => arrancarEdiciones_(ss, props, '20260928-093000'), /estado perdido/);
    assert.ok(props.getProperty(PROPIEDAD_EDICIONES_PERDIDA));
  } finally { console.error = real; }
});

test('lectura de registro disponible agrupa filas; pestaña perdida protege todo', () => {
  const props = propiedadesFalsas({ [PROPIEDAD_EDICIONES_CREADA]: '20260928-093000' });
  const ss = libroFalso(hojaEdiciones(COLUMNAS_EDICIONES, [
    [new Date(), 'Septiembre 2026', 'BOT-20260929-093000-1-1', 'FECHA|PROVEEDOR'],
  ]));
  const registro = leerRegistroEdiciones_(ss, props);
  assert.equal(registro.disponible, true);
  assert.deepEqual(registro.porId.get('BOT-20260929-093000-1-1'), ['FECHA', 'PROVEEDOR']);
  ss.hoja = null;
  const real = console.error;
  console.error = () => {};
  try {
    assert.equal(leerRegistroEdiciones_(ss, props).disponible, false);
    assert.ok(props.getProperty(PROPIEDAD_EDICIONES_PERDIDA));
  } finally { console.error = real; }
});

test('marcarPerdida guarda solo una vez y propaga fallo de propiedades', () => {
  const props = propiedadesFalsas();
  const real = console.error;
  console.error = () => {};
  try {
    marcarPerdida_(props, 'primera');
    marcarPerdida_(props, 'segunda');
    assert.equal(props.llamadas.length, 1);
    assert.equal(props.getProperty(PROPIEDAD_EDICIONES_PERDIDA), '20260928-093000 primera');
    props.getProperty = () => null;
    props.setProperty = () => { throw new Error('propiedades'); };
    assert.throws(() => marcarPerdida_(props, 'tercera'), /propiedades/);
  } finally { console.error = real; }
});

test('registroParaEscribir arranca bajo candado y falla cerrado si creación falla', () => {
  const props = propiedadesFalsas();
  const ss = libroFalso();
  global.crearPestanaOculta_ = (libro, nombre, columnas) => { libro.hoja = hojaEdiciones(columnas); };
  const deps = { propiedades: props, sello: () => '20260928-093000' };
  assert.equal(registroParaEscribir_(ss, deps).disponible, true);
  ss.hoja = null;
  const real = console.error;
  console.error = () => {};
  try { assert.equal(registroParaEscribir_(ss, deps).disponible, false); } finally { console.error = real; }
});

test('registroParaEscribir con selloFila arranca con el corte un segundo antes de esa fila', () => {
  const props = propiedadesFalsas();
  const ss = libroFalso();
  global.crearPestanaOculta_ = (libro, nombre, columnas) => { libro.hoja = hojaEdiciones(columnas); };
  const deps = { propiedades: props, sello: () => '20260928-093005' };
  assert.equal(registroParaEscribir_(ss, deps, '20260928-093000').disponible, true);
  assert.equal(props.getProperty(PROPIEDAD_EDICIONES_CREADA), selloAnterior_('20260928-093000'));
  assert.equal(props.getProperty(PROPIEDAD_EDICIONES_CREADA), '20260928-092959');
});

test('lectura de datos fallida sigue indisponible aunque no pueda marcarse la pérdida', () => {
  const props = propiedadesFalsas({ [PROPIEDAD_EDICIONES_CREADA]: '20260928-093000' });
  props.setProperty = () => { throw new Error('propiedades'); };
  const hoja = hojaEdiciones(COLUMNAS_EDICIONES, [[new Date(), 'Septiembre 2026', 'BOT-1', 'FECHA']]);
  const rango = hoja.getRange;
  hoja.getRange = (fila, ...resto) => {
    if (fila === 2) throw new Error('datos');
    return rango.call(hoja, fila, ...resto);
  };
  const real = console.error;
  console.error = () => {};
  try {
    assert.equal(leerRegistroEdiciones_(libroFalso(hoja), props).disponible, false);
  } finally { console.error = real; }
});

test('estado perdido no lanza al leer si la marca tampoco puede guardarse', () => {
  const props = propiedadesFalsas({ [PROPIEDAD_EDICIONES_CREADA]: '20260928-093000' });
  props.setProperty = () => { throw new Error('propiedades'); };
  const real = console.error;
  console.error = () => {};
  try {
    assert.equal(leerRegistroEdiciones_(libroFalso(), props).disponible, false);
  } finally { console.error = real; }
});

test('registro antes del arranque es indisponible y tiene corte vacío', () => {
  const real = console.error;
  console.error = () => {};
  try {
    const registro = leerRegistroEdiciones_(libroFalso(), propiedadesFalsas());
    assert.equal(registro.disponible, false);
    assert.equal(registro.corte, '');
  } finally { console.error = real; }
});

test('registroParaEscribir devuelve indisponible si falla el arranque', () => {
  const props = propiedadesFalsas();
  const ss = libroFalso();
  global.crearPestanaOculta_ = () => { throw new Error('crear'); };
  const real = console.error;
  console.error = () => {};
  try {
    assert.equal(registroParaEscribir_(ss, {
      propiedades: props, sello: () => '20260928-093000',
    }).disponible, false);
    assert.ok(props.getProperty(PROPIEDAD_EDICIONES_PERDIDA));
  } finally { console.error = real; }
});

test('avisarChoques_ relee solo una lista sana, no toca propiedades y nunca lanza', () => {
  const desde = new Date(2026, 8, 28, 9, 0, 0);
  const props = propiedadesFalsas({ [PROPIEDAD_EDICIONES_CREADA]: '20260928-080000' });
  const hoja = hojaEdiciones(COLUMNAS_EDICIONES, [
    [new Date(2026, 8, 28, 9, 1, 0), 'Septiembre 2026', 'BOT-20260928-090000-1-1', 'PROVEEDOR'],
    [desde, 'Septiembre 2026', 'BOT-20260928-090000-1-1', 'FORMA DE PAGO'],
  ]);
  const ss = libroFalso(hoja);
  const real = console.error;
  const avisos = [];
  console.error = (texto) => avisos.push(texto);
  try {
    avisarChoques_(ss, desde, [{ pestana: 'Septiembre 2026', idFila: 'BOT-20260928-090000-1-1', columnas: ['PROVEEDOR'] }], props);
    assert.deepEqual(avisos, ['posible choque con edición a mano: Septiembre 2026 BOT-20260928-090000-1-1 PROVEEDOR']);
    avisarChoques_(libroFalso(hojaEdiciones(COLUMNAS_EDICIONES)), desde, [], props);
    avisarChoques_(libroFalso(), desde, [], props);
    hoja.getRange = () => { throw new Error('relectura'); };
    assert.doesNotThrow(() => avisarChoques_(ss, desde, [], props));
    assert.match(avisos.pop(), /no se pudieron leer encabezados/);
    const rotas = propiedadesFalsas();
    rotas.getProperty = () => { throw new Error('propiedades'); };
    assert.doesNotThrow(() => avisarChoques_(ss, desde, [], rotas));
    assert.match(avisos.pop(), /no se pudo revisar choques/);
  } finally { console.error = real; }
  assert.deepEqual(props.llamadas, []);
});

test('avisarChoques_ registra, sin lanzar, si armar los escritos falla o faltan desde/propiedades', () => {
  const desde = new Date(2026, 8, 28, 9, 0, 0);
  const props = propiedadesFalsas({ [PROPIEDAD_EDICIONES_CREADA]: '20260928-080000' });
  const ss = libroFalso(hojaEdiciones(COLUMNAS_EDICIONES));
  const real = console.error;
  const avisos = [];
  console.error = (texto) => avisos.push(texto);
  try {
    assert.doesNotThrow(() => avisarChoques_(ss, desde, () => { throw new Error('sin nombre'); }, props));
    assert.equal(avisos.pop(), '_EDICIONES: no se pudo revisar choques: sin nombre');
    assert.doesNotThrow(() => avisarChoques_(ss, undefined, [], props));
    assert.match(avisos.pop(), /faltan desde o propiedades/);
    assert.doesNotThrow(() => avisarChoques_(ss, desde, [], undefined));
    assert.match(avisos.pop(), /faltan desde o propiedades/);
  } finally { console.error = real; }
  assert.deepEqual(avisos, []);
});

test('asegurarEdiciones_ arranca con el corte un segundo antes del sello de la fila por escribir', () => {
  const props = propiedadesFalsas();
  const ss = libroFalso();
  assert.equal(asegurarEdiciones_(ss, { propiedades: props, sello: () => '20260928-093000' }, '20260928-093000'), true);
  assert.equal(props.datos[PROPIEDAD_EDICIONES_CREADA], '20260928-092959');
  assert.equal(ss.creadas, 1);
});

test('asegurarEdiciones_ sin sello de fila usa el reloj y no vuelve a arrancar si ya está lista', () => {
  const props = propiedadesFalsas();
  const ss = libroFalso();
  asegurarEdiciones_(ss, { propiedades: props, sello: () => '20260928-093000' });
  assert.equal(props.datos[PROPIEDAD_EDICIONES_CREADA], '20260928-093000');
  asegurarEdiciones_(ss, { propiedades: props, sello: () => '20260929-000000' }, '20260929-000000');
  assert.equal(props.datos[PROPIEDAD_EDICIONES_CREADA], '20260928-093000');
  assert.equal(ss.creadas, 1);
});

test('asegurarEdiciones_ devuelve false sin lanzar si el arranque falla', () => {
  const real = console.error;
  console.error = () => {};
  global.crearPestanaOculta_ = () => { throw new Error('sin permiso'); };
  try {
    assert.equal(asegurarEdiciones_(libroFalso(), { propiedades: propiedadesFalsas(), sello: () => '20260928-093000' }), false);
  } finally { console.error = real; }
});
