const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizarProveedor_, idFactura_, semanaDelMes_, cuadre_, mesDistinto_, ortografiaProveedor_,
} = require('../src/Reglas.js');

// --- Proveedor ---

test('normalizarProveedor_ deja mayúsculas sin tildes, espacios ni signos', () => {
  assert.equal(normalizarProveedor_('Whole Foods'), 'WHOLEFOODS');
  assert.equal(normalizarProveedor_('Farmacia Arrocha, S.A.'), 'FARMACIAARROCHA');
  assert.equal(normalizarProveedor_('Panadería Ñoño'), 'PANADERIANONO');
  assert.equal(normalizarProveedor_('  Séven 11  '), 'SEVEN11');
});

test('normalizarProveedor_ corta a 15 caracteres', () => {
  assert.equal(normalizarProveedor_('Supermercados El Machetazo'), 'SUPERMERCADOSEL');
  assert.equal(normalizarProveedor_('Supermercados El Machetazo').length, 15);
});

test('normalizarProveedor_ devuelve texto vacío si no queda nada útil', () => {
  assert.equal(normalizarProveedor_(''), '');
  assert.equal(normalizarProveedor_('  ¿? -- '), '');
  assert.equal(normalizarProveedor_(null), '');
  assert.equal(normalizarProveedor_(undefined), '');
});

// --- ortografiaProveedor_ ---

test('ortografiaProveedor_ usa la ortografía más frecuente del historial', () => {
  const historial = [
    { proveedor: 'Seven 11', clase: 'GROCERIES' },
    { proveedor: 'Seven 11', clase: 'GROCERIES' },
    { proveedor: 'Seven 11', clase: 'GROCERIES' },
    { proveedor: 'SEVEN 11', clase: 'GROCERIES' },
  ];
  assert.equal(ortografiaProveedor_(historial, 'seven 11'), 'Seven 11');
});

test('ortografiaProveedor_ desempata con la primera ortografía vista', () => {
  const historial = [
    { proveedor: 'Whole Foods', clase: 'GROCERIES' },
    { proveedor: 'WHOLE FOODS', clase: 'GROCERIES' },
  ];
  assert.equal(ortografiaProveedor_(historial, 'whole foods'), 'Whole Foods');
});

test('ortografiaProveedor_ sin historial: todo en minúsculas queda con mayúscula inicial por palabra', () => {
  assert.equal(ortografiaProveedor_([], 'seven 11'), 'Seven 11');
  assert.equal(ortografiaProveedor_([], 'whole foods'), 'Whole Foods');
});

test('ortografiaProveedor_ sin historial y con alguna mayúscula, se deja tal cual', () => {
  assert.equal(ortografiaProveedor_([], "McDonald's"), "McDonald's");
  assert.equal(ortografiaProveedor_([], 'Whole Foods'), 'Whole Foods');
});

test('ortografiaProveedor_ nunca cambia PENDIENTE ni vacío', () => {
  assert.equal(ortografiaProveedor_([], 'PENDIENTE'), 'PENDIENTE');
  assert.equal(ortografiaProveedor_([{ proveedor: 'Seven 11' }], ''), '');
});

test('ortografiaProveedor_ ignora del historial los proveedores de otro comercio', () => {
  const historial = [{ proveedor: 'Whole Foods', clase: 'GROCERIES' }];
  assert.equal(ortografiaProveedor_(historial, 'seven 11'), 'Seven 11');
});

// --- ID FACTURA ---

test('idFactura_ arma PROVEEDOR-AAAAMMDD', () => {
  assert.equal(idFactura_('Whole Foods', '2026-07-03', []), 'WHOLEFOODS-20260703');
});

test('idFactura_ agrega -2, -3… si el ID ya existe en el archivo', () => {
  assert.equal(idFactura_('Whole Foods', '2026-07-03', ['WHOLEFOODS-20260703']), 'WHOLEFOODS-20260703-2');
  const existentes = new Set(['WHOLEFOODS-20260703', 'WHOLEFOODS-20260703-2']);
  assert.equal(idFactura_('Whole Foods', '2026-07-03', existentes), 'WHOLEFOODS-20260703-3');
});

test('idFactura_ no confunde otro proveedor u otra fecha con un duplicado', () => {
  const existentes = ['WHOLEFOODS-20260704', 'WHOLEFOODSX-20260703'];
  assert.equal(idFactura_('Whole Foods', '2026-07-03', existentes), 'WHOLEFOODS-20260703');
});

test('idFactura_ sirve para depósitos, ajustes y saldo inicial', () => {
  assert.equal(idFactura_('DEPOSITO', '2026-07-01', []), 'DEPOSITO-20260701');
  assert.equal(idFactura_('AJUSTE', '2026-07-01', ['AJUSTE-20260701']), 'AJUSTE-20260701-2');
  assert.equal(idFactura_('SALDOINICIAL', '2026-07-01', []), 'SALDOINICIAL-20260701');
});

test('idFactura_ rechaza proveedor vacío o fecha inválida', () => {
  assert.throws(() => idFactura_('¿?', '2026-07-03', []), /proveedor vacío/);
  for (const mala of ['2026-7-3', '03/07/2026', '2026-02-30', '2026-13-01', '', null]) {
    assert.throws(() => idFactura_('Whole Foods', mala, []), /fecha inválida/, String(mala));
  }
});

// --- Semana Wn (W1 = semana que contiene el día 1; semanas empiezan lunes) ---

test('semanaDelMes_ reproduce julio 2026 del Excel: W1 1–5, W2 6–12, W3 13–19, W4 20–26', () => {
  const esperado = { 1: 1, 5: 1, 6: 2, 12: 2, 13: 3, 19: 3, 20: 4, 26: 4, 27: 5, 31: 5 };
  for (const [dia, semana] of Object.entries(esperado)) {
    assert.equal(semanaDelMes_(`2026-07-${String(dia).padStart(2, '0')}`), semana, `día ${dia}`);
  }
});

test('semanaDelMes_ con un mes que empieza sábado y otro que empieza lunes', () => {
  // Agosto 2026 empieza sábado: W1 = 1–2, W2 = 3–9.
  assert.equal(semanaDelMes_('2026-08-02'), 1);
  assert.equal(semanaDelMes_('2026-08-03'), 2);
  assert.equal(semanaDelMes_('2026-08-31'), 6);
  // Junio 2026 empieza lunes: W1 = 1–7.
  assert.equal(semanaDelMes_('2026-06-07'), 1);
  assert.equal(semanaDelMes_('2026-06-08'), 2);
});

test('semanaDelMes_ rechaza fecha inválida', () => {
  assert.throws(() => semanaDelMes_('2026-02-29'), /fecha inválida/);
});

// --- Cuadre ---

test('cuadre_ cuadra si la suma de las partes iguala el total impreso', () => {
  assert.deepEqual(cuadre_([10.5, 2.25, 0.74], 13.49), { cuadra: true, suma: 13.49, diferencia: 0 });
});

test('cuadre_ evita errores de coma flotante', () => {
  assert.equal(cuadre_([0.1, 0.2], 0.3).cuadra, true);
  assert.equal(cuadre_([0.1, 0.2], 0.3).suma, 0.3);
});

test('cuadre_ tolera hasta 0.01 de diferencia y no más', () => {
  assert.equal(cuadre_([10.00], 10.01).cuadra, true);
  assert.deepEqual(cuadre_([10.00], 10.02), { cuadra: false, suma: 10, diferencia: -0.02 });
});

test('cuadre_ resta los descuentos (van en negativo dentro de GASTO)', () => {
  assert.equal(cuadre_([20, 1.4, -2], 19.4).cuadra, true);
});

test('cuadre_ no cuadra si falta el total o algún monto', () => {
  const sinDatos = { cuadra: false, suma: null, diferencia: null };
  assert.deepEqual(cuadre_([10], null), sinDatos);
  assert.deepEqual(cuadre_([10, null], 10), sinDatos);
  assert.deepEqual(cuadre_([], 10), sinDatos);
  assert.deepEqual(cuadre_([10, Number.NaN], 10), sinDatos);
});

// --- Mes distinto ---

test('mesDistinto_ es false en el mismo mes, sin importar el día', () => {
  assert.equal(mesDistinto_('2026-09-01', '2026-09-27'), false);
  assert.equal(mesDistinto_('2026-09-27', '2026-09-27'), false);
});

test('mesDistinto_ es true si cambia el mes, aunque sea el mismo año', () => {
  assert.equal(mesDistinto_('2026-08-31', '2026-09-01'), true);
  assert.equal(mesDistinto_('2026-09-01', '2026-08-31'), true);
});

test('mesDistinto_ es true si cambia el año', () => {
  assert.equal(mesDistinto_('2025-12-31', '2026-01-01'), true);
});

test('mesDistinto_ rechaza una fecha inválida en cualquiera de los dos lados', () => {
  assert.throws(() => mesDistinto_('2026-13-01', '2026-09-27'), /fecha inválida/);
  assert.throws(() => mesDistinto_('2026-09-27', 'no es fecha'), /fecha inválida/);
});
