const test = require('node:test');
const assert = require('node:assert/strict');

Object.assign(global, require('../src/Hoja.js'));
Object.assign(global, require('../src/Escritura.js'));
Object.assign(global, require('../src/Edicion.js'));
Object.assign(global, require('../src/Ediciones.js'));
Object.assign(global, require('../src/HojaApp.js'));
const { registroEdiciones_ } = require('../src/Ediciones.js');
const { conteosProtegidosLimpieza_ } = require('../src/LimpiezaPrueba.js');

const mes = (filas) => ({
  nombre: 'Septiembre 2026',
  encabezados: ['ORIGEN', 'ID FILA'],
  filas: filas.map(([origen, id], i) => ({ numero: i + 6, valores: [origen, id] })),
});
const registro = (filas = [], disponible = true) => registroEdiciones_({
  filas, disponible, corte: '20260928-093000',
});

test('limpieza cuenta MANUAL por origen o ID y solo anotaciones reales del bot', () => {
  const filas = mes([
    ['MANUAL', 'x'], ['BOT', 'MANUAL-1'],
    ['BOT', 'BOT-20260927-093000-1-1'],
    ['BOT', 'BOT-20260929-093000-1-1'],
  ]);
  const anotado = registro([[new Date(), filas.nombre, 'BOT-20260929-093000-1-1', 'PROVEEDOR']]);
  assert.deepEqual(conteosProtegidosLimpieza_(filas, anotado), { manuales: 2, anotadas: 1 });
  assert.deepEqual(conteosProtegidosLimpieza_(filas, registro()), { manuales: 2, anotadas: 0 });
});

test('limpieza no convierte filas anteriores al corte en anotaciones', () => {
  const filas = mes([['BOT', 'BOT-20260927-093000-1-1']]);
  assert.deepEqual(conteosProtegidosLimpieza_(filas, registro([], false)), { manuales: 0, anotadas: 0 });
});

test('limpieza cuenta una anotación aunque ORIGEN haya cambiado a mano', () => {
  const filas = mes([['', 'BOT-20260929-093000-1-1']]);
  const anotado = registro([[new Date(), filas.nombre, 'BOT-20260929-093000-1-1', 'PROVEEDOR']]);
  assert.deepEqual(conteosProtegidosLimpieza_(filas, anotado), { manuales: 0, anotadas: 1 });
});
