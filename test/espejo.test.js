const test = require('node:test');
const assert = require('node:assert/strict');

const {
  debeCopiar_, urlExportarXlsx_, validarRespuestaExport_, TIPO_XLSX, INTERVALO_ESPEJO_MINUTOS,
} = require('../src/Espejo.js');

test('debeCopiar_: sin copia previa (null, vacío o texto ilegible) copia', () => {
  for (const previa of [null, undefined, '', '   ', 'no-es-numero']) {
    assert.equal(debeCopiar_(1000, previa), true, String(previa));
  }
});

test('debeCopiar_: hoja más nueva que la última copia copia', () => {
  assert.equal(debeCopiar_(2000, '1000'), true);
  assert.equal(debeCopiar_(1001, 1000), true);
});

test('debeCopiar_: hoja igual o más vieja que la última copia no copia', () => {
  assert.equal(debeCopiar_(1000, '1000'), false);
  assert.equal(debeCopiar_(999, '1000'), false);
});

test('debeCopiar_: última modificación inválida lanza error en vez de adivinar', () => {
  for (const mala of [NaN, null, undefined, 'abc', Infinity]) {
    assert.throws(() => debeCopiar_(mala, '1000'), /modificación/);
  }
});

test('urlExportarXlsx_: arma la URL de exportación xlsx de la hoja', () => {
  assert.equal(urlExportarXlsx_('ABC123'), 'https://docs.google.com/spreadsheets/d/ABC123/export?format=xlsx');
});

test('urlExportarXlsx_: rechaza un id vacío o con caracteres raros', () => {
  for (const malo of ['', null, undefined, 'a/b', 'a?b=1', 'a b']) {
    assert.throws(() => urlExportarXlsx_(malo), /id/i, String(malo));
  }
});

test('validarRespuestaExport_: 200 no lanza', () => {
  assert.doesNotThrow(() => validarRespuestaExport_(200, 'ok'));
});

test('validarRespuestaExport_: otro código lanza con código y cuerpo corto', () => {
  const largo = 'x'.repeat(500);
  assert.throws(() => validarRespuestaExport_(403, largo), (error) => {
    assert.match(error.message, /HTTP 403/);
    assert.ok(error.message.length < 300);
    return true;
  });
});

test('validarRespuestaExport_: cuerpo ausente no rompe el mensaje', () => {
  assert.throws(() => validarRespuestaExport_(500, null), /HTTP 500/);
});

test('constantes: tipo xlsx e intervalo de 5 minutos', () => {
  assert.equal(TIPO_XLSX, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  assert.equal(INTERVALO_ESPEJO_MINUTOS, 5);
});
