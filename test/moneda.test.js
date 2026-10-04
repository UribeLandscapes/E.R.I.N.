const test = require('node:test');
const assert = require('node:assert/strict');

global.leerFecha_ = require('../src/Reglas.js').leerFecha_;
const {
  urlsTasa_, buscarTasa_, convertirAUsd_, textoTasaUsada_, montoEnUsd_,
} = require('../src/Moneda.js');

const URL_FRANKFURTER = 'https://api.frankfurter.dev/v2/rate/usd/cop?date=2026-07-03';
const URL_JSDELIVR = 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@2026-07-03/v1/currencies/usd.min.json';
const URL_ESPEJO = 'https://2026-07-03.currency-api.pages.dev/v1/currencies/usd.min.json';

/** Lector falso: responde según la URL y guarda cada URL pedida. */
function lector(respuestas) {
  const pedidas = [];
  const obtenerJson = (url) => {
    pedidas.push(url);
    const r = respuestas[url];
    if (r instanceof Error) throw r;
    return r === undefined ? null : r;
  };
  return { obtenerJson, pedidas };
}

// --- URLs ---

test('urlsTasa_ arma Frankfurter v2 base USD, luego jsDelivr y el espejo pages.dev', () => {
  assert.deepEqual(urlsTasa_('COP', '2026-07-03').map((u) => u.url), [URL_FRANKFURTER, URL_JSDELIVR, URL_ESPEJO]);
  assert.deepEqual(urlsTasa_('COP', '2026-07-03').map((u) => u.fuente), ['frankfurter', 'jsdelivr', 'pages.dev']);
});

// --- buscarTasa_ ---

test('buscarTasa_ usa tasa fija 1 para USD y PAB sin consultar nada', () => {
  for (const moneda of ['USD', 'PAB']) {
    const { obtenerJson, pedidas } = lector({});
    assert.deepEqual(buscarTasa_(moneda, '2026-07-03', obtenerJson), { tasa: 1, fecha: '2026-07-03', fuente: 'fija' });
    assert.equal(pedidas.length, 0);
  }
});

test('buscarTasa_ toma la tasa de Frankfurter con la fecha que devuelve la API', () => {
  const { obtenerJson, pedidas } = lector({
    [URL_FRANKFURTER]: { date: '2026-07-02', base: 'USD', quote: 'COP', rate: 3950.12 },
  });
  assert.deepEqual(buscarTasa_('COP', '2026-07-03', obtenerJson), { tasa: 3950.12, fecha: '2026-07-02', fuente: 'frankfurter' });
  assert.deepEqual(pedidas, [URL_FRANKFURTER]);
});

test('buscarTasa_ pasa a fawazahmed0 (jsDelivr) si Frankfurter no tiene la tasa', () => {
  const { obtenerJson } = lector({
    [URL_JSDELIVR]: { date: '2026-07-03', usd: { eur: 0.87, cop: 3951.5 } },
  });
  assert.deepEqual(buscarTasa_('COP', '2026-07-03', obtenerJson), { tasa: 3951.5, fecha: '2026-07-03', fuente: 'jsdelivr' });
});

test('buscarTasa_ usa el espejo pages.dev si jsDelivr falla', () => {
  const { obtenerJson } = lector({
    [URL_FRANKFURTER]: new Error('HTTP 500'),
    [URL_JSDELIVR]: new Error('sin red'),
    [URL_ESPEJO]: { date: '2026-07-03', usd: { cop: 3952 } },
  });
  assert.deepEqual(buscarTasa_('COP', '2026-07-03', obtenerJson), { tasa: 3952, fecha: '2026-07-03', fuente: 'pages.dev' });
});

test('buscarTasa_ retrocede un día a la vez hasta 7 días', () => {
  const { obtenerJson, pedidas } = lector({
    'https://api.frankfurter.dev/v2/rate/usd/cop?date=2026-06-26': { date: '2026-06-26', quote: 'COP', rate: 3900 },
  });
  assert.deepEqual(buscarTasa_('COP', '2026-07-03', obtenerJson), { tasa: 3900, fecha: '2026-06-26', fuente: 'frankfurter' });
  assert.equal(pedidas.length, 7 * 3 + 1);
  assert.ok(pedidas.includes('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@2026-06-30/v1/currencies/usd.min.json'));
});

test('buscarTasa_ devuelve null si no hay tasa en ninguna fuente en 8 fechas', () => {
  const { obtenerJson, pedidas } = lector({});
  assert.equal(buscarTasa_('COP', '2026-07-03', obtenerJson), null);
  assert.equal(pedidas.length, 8 * 3);
  assert.ok(pedidas.at(-1).startsWith('https://2026-06-26.'));
});

test('buscarTasa_ deja de pedir a una fuente que lanzó error (caída) en las fechas siguientes', () => {
  const { obtenerJson, pedidas } = lector({
    [URL_FRANKFURTER]: new Error('HTTP 503'),
    [URL_JSDELIVR]: new Error('HTTP 503'),
    [URL_ESPEJO]: new Error('HTTP 503'),
  });
  assert.equal(buscarTasa_('COP', '2026-07-03', obtenerJson), null);
  assert.equal(pedidas.length, 3);
});

test('buscarTasa_ ignora respuestas con tasa no positiva, fecha inválida, fecha futura u otra moneda', () => {
  const malas = [
    { date: '2026-07-03', quote: 'COP', rate: 0 },
    { date: '2026-07-03', quote: 'COP', rate: -5 },
    { date: '2026-07-03', quote: 'COP', rate: '3950' },
    { date: '2026-02-30', quote: 'COP', rate: 3950 },
    { date: '2026-07-04', quote: 'COP', rate: 3950 },
    { date: '2026-07-03', quote: 'EUR', rate: 0.87 },
    { quote: 'COP', rate: 3950 },
    'texto',
  ];
  for (const mala of malas) {
    const { obtenerJson } = lector({ [URL_FRANKFURTER]: mala });
    assert.equal(buscarTasa_('COP', '2026-07-03', obtenerJson), null, JSON.stringify(mala));
  }
  const { obtenerJson } = lector({ [URL_JSDELIVR]: { date: '2026-07-03', usd: {} } });
  assert.equal(buscarTasa_('COP', '2026-07-03', obtenerJson), null);
});

test('buscarTasa_ acepta la moneda en minúscula en la respuesta de Frankfurter', () => {
  const { obtenerJson } = lector({ [URL_FRANKFURTER]: { date: '2026-07-03', quote: 'cop', rate: 3950 } });
  assert.equal(buscarTasa_('COP', '2026-07-03', obtenerJson).tasa, 3950);
});

test('buscarTasa_ rechaza moneda que no es ISO de 3 letras mayúsculas, o fecha inválida', () => {
  const { obtenerJson } = lector({});
  for (const mala of ['cop', 'CO', 'COPS', '', null, 'C0P']) {
    assert.throws(() => buscarTasa_(mala, '2026-07-03', obtenerJson), /moneda inválida/, String(mala));
  }
  assert.throws(() => buscarTasa_('COP', '2026-13-01', obtenerJson), /fecha inválida/);
});

// --- Conversión y texto ---

test('convertirAUsd_ divide por la tasa y redondea a centavos', () => {
  assert.equal(convertirAUsd_(100000, 3950.12), 25.32);
  assert.equal(convertirAUsd_(10, 0.87), 11.49);
  assert.equal(convertirAUsd_(12.5, 1), 12.5);
});

test('convertirAUsd_ redondea igual los negativos (descuentos) y no deja -0', () => {
  assert.equal(convertirAUsd_(-0.385, 1), -0.39);
  assert.equal(convertirAUsd_(0.385, 1), 0.39);
  assert.ok(Object.is(convertirAUsd_(-0.001, 1), 0));
});

test('convertirAUsd_ rechaza monto o tasa no válidos', () => {
  assert.throws(() => convertirAUsd_(null, 1), /monto inválido/);
  assert.throws(() => convertirAUsd_(NaN, 1), /monto inválido/);
  assert.throws(() => convertirAUsd_(10, 0), /tasa inválida/);
  assert.throws(() => convertirAUsd_(10, Infinity), /tasa inválida/);
});

test('textoTasaUsada_ arma "tasa (fecha de la API)"', () => {
  assert.equal(textoTasaUsada_({ tasa: 3950.12, fecha: '2026-07-02' }), '3950.12 (2026-07-02)');
  assert.equal(textoTasaUsada_({ tasa: 1, fecha: '2026-07-03' }), '1 (2026-07-03)');
});

// --- montoEnUsd_ ---

test('montoEnUsd_ devuelve GASTO (USD) y TASA USADA cuando hay tasa', () => {
  const { obtenerJson } = lector({ [URL_FRANKFURTER]: { date: '2026-07-02', quote: 'COP', rate: 4000 } });
  assert.deepEqual(montoEnUsd_(100000, 'COP', '2026-07-03', obtenerJson), {
    gastoUsd: 25, tasaUsada: '4000 (2026-07-02)',
  });
});

test('montoEnUsd_ deja PENDIENTE en GASTO (USD) y TASA USADA si no hay tasa', () => {
  const { obtenerJson } = lector({});
  assert.deepEqual(montoEnUsd_(100000, 'COP', '2026-07-03', obtenerJson), {
    gastoUsd: 'PENDIENTE', tasaUsada: 'PENDIENTE',
  });
});

test('montoEnUsd_ con PAB usa tasa 1', () => {
  const { obtenerJson } = lector({});
  assert.deepEqual(montoEnUsd_(12.34, 'PAB', '2026-07-03', obtenerJson), { gastoUsd: 12.34, tasaUsada: '1 (2026-07-03)' });
});
