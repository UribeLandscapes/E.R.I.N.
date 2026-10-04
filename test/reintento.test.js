const test = require('node:test');
const assert = require('node:assert/strict');

// En Apps Script son globales; en Node se ponen a mano antes de requerir la lógica.
Object.assign(global, require('../src/Hoja.js'));
Object.assign(global, require('../src/Reglas.js'));
Object.assign(global, require('../src/Escritura.js'));
Object.assign(global, require('../src/Clases.js'));
Object.assign(global, require('../src/Texto.js'));
Object.assign(global, require('../src/Botones.js'));
Object.assign(global, require('../src/PorProcesar.js'));

const {
  CAMPO_TOTAL, CAMPO_PROVEEDOR, CAMPO_PAGO, pendientesPorProcesar_, porPreguntar_,
  pareceProveedorEscrito_,
} = require('../src/Reintento.js');
const { datosPorProcesar_, leerFilaPorProcesar_, filaPorProcesar_ } = require('../src/PorProcesar.js');
const { COLUMNAS_ESTADO } = require('../src/Hoja.js');

const entradaCon = (extra = {}) => ({ idFilas: ['BOT-1'], preguntado: [], ...extra });

// --- Qué le falta a la foto ---

test('sin fila escrita lo que falta es el total', () => {
  assert.deepEqual(pendientesPorProcesar_(entradaCon({ idFilas: [] }), {}), [CAMPO_TOTAL]);
});

test('con la fila escrita, PROVEEDOR y FORMA DE PAGO en PENDIENTE son lo que falta', () => {
  const valores = { PROVEEDOR: 'PENDIENTE', 'FORMA DE PAGO': 'PENDIENTE', 'CLASE DE GASTO': 'PENDIENTE' };
  assert.deepEqual(pendientesPorProcesar_(entradaCon(), valores), [CAMPO_PROVEEDOR, CAMPO_PAGO]);
});

test('la clase sola en PENDIENTE no se pregunta (sale del proveedor o se edita en la hoja)', () => {
  const valores = { PROVEEDOR: 'Riba Smith', 'FORMA DE PAGO': 'EFECTIVO', 'CLASE DE GASTO': 'PENDIENTE' };
  assert.deepEqual(pendientesPorProcesar_(entradaCon(), valores), []);
});

test('un valor que no es PENDIENTE (o una celda vacía) no se pregunta', () => {
  assert.deepEqual(pendientesPorProcesar_(entradaCon(), { PROVEEDOR: '', 'FORMA DE PAGO': 'TARJETA' }), []);
});

test('sin entrada no hay nada que preguntar más que el total', () => {
  assert.deepEqual(pendientesPorProcesar_(null, {}), [CAMPO_TOTAL]);
});

test('porPreguntar_ deja fuera lo que ya se preguntó una vez', () => {
  assert.deepEqual(porPreguntar_([CAMPO_PROVEEDOR, CAMPO_PAGO], [CAMPO_PROVEEDOR]), [CAMPO_PAGO]);
  assert.deepEqual(porPreguntar_([CAMPO_PAGO], null), [CAMPO_PAGO]);
  assert.deepEqual(porPreguntar_([], [CAMPO_PAGO]), []);
});

// --- El texto que contesta "¿A quién le pagaste en esa foto?" ---

test('un nombre de comercio sirve como respuesta de proveedor', () => {
  ['Riba Smith', 'super 99', 'Farmacia Arrocha  '].forEach((texto) => {
    assert.equal(pareceProveedorEscrito_(texto), true, texto);
  });
});

test('un texto que trae un monto o una moneda es un gasto nuevo, no un proveedor', () => {
  ['gasté 12.50 en el super', '66.34', 'B/. 20 en Riba', '$15 super'].forEach((texto) => {
    assert.equal(pareceProveedorEscrito_(texto), false, texto);
  });
});

test('un texto vacío, larguísimo o que no es texto no es una respuesta de proveedor', () => {
  [null, undefined, '', '   ', 'x'.repeat(61), 42].forEach((texto) => {
    assert.equal(pareceProveedorEscrito_(texto), false, String(texto));
  });
});

// --- DATOS del modo preguntas (PorProcesar.js) ---

test('los DATOS guardan el mensaje de la pregunta de proveedor y lo ya preguntado', () => {
  const datos = JSON.parse(datosPorProcesar_({
    idMensaje: 501, fechaMensaje: '2026-09-27', intentos: 2, idProveedor: 910, preguntado: ['proveedor', 'pago'],
  }));
  assert.equal(datos.idProveedor, 910);
  assert.deepEqual(datos.preguntado, ['proveedor', 'pago']);
});

test('sin modo preguntas los DATOS quedan como antes (sin campos de más)', () => {
  const datos = JSON.parse(datosPorProcesar_({ idMensaje: 501, fechaMensaje: '2026-09-27', intentos: 0 }));
  assert.deepEqual(Object.keys(datos).sort(), ['fechaMensaje', 'idMensaje', 'intentos']);
});

test('leerFilaPorProcesar_ devuelve idProveedor y preguntado', () => {
  const fila = filaPorProcesar_({
    creado: new Date(2026, 8, 27), idMensaje: 501, fechaMensaje: '2026-09-27', intentos: 2,
    idProveedor: 910, preguntado: ['proveedor'],
  });
  const leida = leerFilaPorProcesar_(fila, 0);
  assert.equal(leida.idProveedor, 910);
  assert.deepEqual(leida.preguntado, ['proveedor']);
});

test('una entrada vieja sin esos campos se sigue leyendo igual', () => {
  const fila = filaPorProcesar_({ creado: new Date(2026, 8, 27), idMensaje: 501, fechaMensaje: '2026-09-27' });
  const leida = leerFilaPorProcesar_(fila, 0);
  assert.equal(leida.idProveedor, null);
  assert.deepEqual(leida.preguntado, []);
  assert.equal(fila[COLUMNAS_ESTADO.indexOf('TIPO')], 'POR-PROCESAR');
});
