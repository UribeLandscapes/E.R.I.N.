const test = require('node:test');
const assert = require('node:assert/strict');

// En Apps Script estos nombres son globales (Reglas.js).
global.MESES = require('../src/Hoja.js').MESES;
global.leerFecha_ = require('../src/Reglas.js').leerFecha_;

const {
  nombreCarpetaMes_, rutaMes_, descripcionCorta_, extensionMime_, nombreFoto_, nombreLibre_,
} = require('../src/Carpetas.js');

test('nombreCarpetaMes_ da número, punto y mes con mayúscula', () => {
  assert.equal(nombreCarpetaMes_(7), '7. Julio');
  assert.equal(nombreCarpetaMes_(1), '1. Enero');
  assert.equal(nombreCarpetaMes_(12), '12. Diciembre');
});

test('nombreCarpetaMes_ rechaza meses fuera de 1–12', () => {
  assert.throws(() => nombreCarpetaMes_(0), /mes inválido/);
  assert.throws(() => nombreCarpetaMes_(13), /mes inválido/);
  assert.throws(() => nombreCarpetaMes_(1.5), /mes inválido/);
});

test('rutaMes_ da año y carpeta del mes de la fecha de la factura', () => {
  assert.deepEqual(rutaMes_('2026-07-03'), ['2026', '7. Julio']);
  assert.deepEqual(rutaMes_('2026-09-26'), ['2026', '9. Septiembre']);
});

test('rutaMes_ rechaza fechas inválidas', () => {
  assert.throws(() => rutaMes_('2026-02-30'), /fecha inválida/);
  assert.throws(() => rutaMes_(''), /fecha inválida/);
});

test('descripcionCorta_ deja máximo 5 palabras', () => {
  assert.equal(descripcionCorta_('Super 99 compra de frutas y verduras'), 'Super 99 compra de frutas');
});

test('descripcionCorta_ quita caracteres que Drive o Windows no aceptan en nombres', () => {
  assert.equal(descripcionCorta_('Taxi a/de: "aeropuerto" *ida*'), 'Taxi a de aeropuerto ida');
  assert.equal(descripcionCorta_('uno\\dos|tres<cuatro>?'), 'uno dos tres cuatro');
  assert.equal(descripcionCorta_('línea\nnueva\ttab'), 'línea nueva tab');
});

test('descripcionCorta_ corta a 60 caracteres sin dejar espacio al final', () => {
  const larga = `${'a'.repeat(40)} ${'b'.repeat(40)}`;
  const corta = descripcionCorta_(larga);
  assert.ok(corta.length <= 60);
  assert.equal(corta, `${'a'.repeat(40)} ${'b'.repeat(19)}`);
  assert.equal(descripcionCorta_(`${'a'.repeat(59)} b`), 'a'.repeat(59));
});

test('descripcionCorta_ vacía o solo símbolos da "factura"', () => {
  assert.equal(descripcionCorta_(''), 'factura');
  assert.equal(descripcionCorta_('  /?*  '), 'factura');
  assert.equal(descripcionCorta_(null), 'factura');
  assert.equal(descripcionCorta_(undefined), 'factura');
});

test('extensionMime_ da la extensión de los tipos de foto y PDF', () => {
  assert.equal(extensionMime_('image/jpeg'), '.jpg');
  assert.equal(extensionMime_('image/png'), '.png');
  assert.equal(extensionMime_('image/webp'), '.webp');
  assert.equal(extensionMime_('image/heic'), '.heic');
  assert.equal(extensionMime_('application/pdf'), '.pdf');
  assert.equal(extensionMime_('IMAGE/JPEG'), '.jpg');
});

test('extensionMime_ de un tipo desconocido no pone extensión', () => {
  assert.equal(extensionMime_('application/octet-stream'), '');
  assert.equal(extensionMime_(''), '');
  assert.equal(extensionMime_(null), '');
});

test('nombreFoto_ arma "AAAA.MM.DD - descripción.ext"', () => {
  assert.equal(nombreFoto_('2026-07-03', 'Super 99 compra', 'image/jpeg'), '2026.07.03 - Super 99 compra.jpg');
  assert.equal(nombreFoto_('2026-09-26', '', 'application/pdf'), '2026.09.26 - factura.pdf');
  assert.equal(nombreFoto_('2026-09-26', 'algo', 'x/y'), '2026.09.26 - algo');
});

test('nombreFoto_ rechaza fechas inválidas', () => {
  assert.throws(() => nombreFoto_('2026-13-01', 'x', 'image/jpeg'), /fecha inválida/);
});

test('nombreLibre_ deja el nombre si no existe', () => {
  assert.equal(nombreLibre_('2026.07.03 - taxi.jpg', () => false), '2026.07.03 - taxi.jpg');
});

test('nombreLibre_ agrega (2), (3)… antes de la extensión si ya existe', () => {
  const usados = new Set(['2026.07.03 - taxi.jpg', '2026.07.03 - taxi (2).jpg']);
  assert.equal(nombreLibre_('2026.07.03 - taxi.jpg', (n) => usados.has(n)), '2026.07.03 - taxi (3).jpg');
});

test('nombreLibre_ sin extensión agrega el número al final (los puntos de la fecha no son extensión)', () => {
  const usados = new Set(['2026.07.03 - taxi']);
  assert.equal(nombreLibre_('2026.07.03 - taxi', (n) => usados.has(n)), '2026.07.03 - taxi (2)');
});
