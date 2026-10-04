const test = require('node:test');
const assert = require('node:assert/strict');

// Mismo patrón que gemini.test.js/fotoApp.test.js (Apps Script comparte un solo
// espacio de nombres global; en Node se arma a mano).
global.MESES = require('../src/Hoja.js').MESES;
Object.assign(global, require('../src/Reglas.js'));
Object.assign(global, require('../src/Extraccion.js'));
global.CONFIG = require('./configPrueba.js').CONFIG;
Object.assign(global, require('../src/Clases.js'));
Object.assign(global, require('../src/Texto.js'));
Object.assign(global, require('../src/Confirmacion.js'));
Object.assign(global, require('../src/Carpetas.js'));
Object.assign(global, require('../src/Foto.js'));
Object.assign(global, require('../src/Groq.js'));

const { cuerpoFotoGemini_ } = require('../src/Foto.js');
const {
  llamarGroq_, intentarGroq_, motivoGeminiFallo_, llamarConRespaldoGroq_, probarGroq,
} = require('../src/GroqApp.js');

const CLAVE_GROQ = 'gsk_clave-de-prueba';
const CATEGORIAS = ['GROCERIES', 'MAINTENANCE'];
const HOY = '2026-09-27';

function respuestaFalsa(codigo, texto) {
  return { getResponseCode: () => codigo, getContentText: () => texto };
}

function datosGroqOk(extra) {
  const extraccion = {
    legible: true, tipo_documento: 'TICKET', proveedor: 'Seven 11', fecha: '2026-09-20',
    moneda: 'USD', forma_pago: 'EFECTIVO', lineas: [{ tipo: 'ITEM', descripcion: 'Leche', monto: 1.55, confianza: 'ALTA' }],
    total: 1.55, clase: 'GROCERIES', casa: null, comentario: null, descripcion_corta: 'leche seven 11',
    confianza: { proveedor: 'ALTA', fecha: 'ALTA', moneda: 'ALTA', total: 'ALTA', clase: 'ALTA' },
    ...extra,
  };
  return { choices: [{ message: { role: 'assistant', content: JSON.stringify(extraccion) }, finish_reason: 'stop' }] };
}

const cuerpoGeminiFoto = () => cuerpoFotoGemini_('BASE64', 'image/jpeg', 'efectivo', CATEGORIAS, HOY);

// --- llamarGroq_ ---

test('llamarGroq_ manda POST con Authorization Bearer y JSON, y nunca lanza con contenido raro', () => {
  let opciones;
  global.UrlFetchApp = {
    fetch: (url, opts) => {
      opciones = { url, opts };
      return respuestaFalsa(200, JSON.stringify(datosGroqOk()));
    },
  };
  const r = llamarGroq_(CLAVE_GROQ, { model: CONFIG.MODELO_GROQ, messages: [] });
  assert.equal(opciones.url, URL_GROQ);
  assert.equal(opciones.opts.method, 'post');
  assert.equal(opciones.opts.contentType, 'application/json');
  assert.deepEqual(opciones.opts.headers, { Authorization: `Bearer ${CLAVE_GROQ}` });
  assert.equal(opciones.opts.muteHttpExceptions, true);
  assert.equal(r.codigo, 200);
  assert.equal(r.datos.choices[0].message.content.includes('Seven 11'), true);
});

test('llamarGroq_ nunca manda la clave en la URL', () => {
  let url;
  global.UrlFetchApp = { fetch: (u) => { url = u; return respuestaFalsa(200, '{}'); } };
  llamarGroq_(CLAVE_GROQ, {});
  assert.ok(!url.includes(CLAVE_GROQ));
});

test('llamarGroq_ da datos vacíos si la respuesta no es JSON', () => {
  global.UrlFetchApp = { fetch: () => respuestaFalsa(500, '<html>error</html>') };
  const r = llamarGroq_(CLAVE_GROQ, {});
  assert.equal(r.codigo, 500);
  assert.deepEqual(r.datos, {});
});

// --- intentarGroq_ ---

test('intentarGroq_ da null sin claveGroq (Groq apagado, AH-g)', () => {
  assert.equal(intentarGroq_(null, cuerpoGeminiFoto(), CATEGORIAS, false, '503'), null);
  assert.equal(intentarGroq_('', cuerpoGeminiFoto(), CATEGORIAS, false, '503'), null);
});

test('intentarGroq_ da null sin cuerpoGemini (AH-c: mimeType que Groq no confirma leer)', () => {
  assert.equal(intentarGroq_(CLAVE_GROQ, null, CATEGORIAS, false, '503'), null);
});

test('intentarGroq_ da null si cuerpoGroqDesdeGemini_ lanza (más de 3 imágenes, PDF, etc.)', () => {
  const cuerpoConPdf = {
    systemInstruction: { parts: [{ text: 'x' }] },
    contents: [{ role: 'user', parts: [{ inlineData: { mimeType: 'application/pdf', data: 'AAAA' } }] }],
  };
  global.UrlFetchApp = { fetch: () => { throw new Error('no debería llamarse'); } };
  assert.equal(intentarGroq_(CLAVE_GROQ, cuerpoConPdf, CATEGORIAS, false, '503'), null);
});

test('intentarGroq_ da null si UrlFetchApp lanza (sin red)', () => {
  global.UrlFetchApp = { fetch: () => { throw new Error('DNS'); } };
  assert.equal(intentarGroq_(CLAVE_GROQ, cuerpoGeminiFoto(), CATEGORIAS, false, '503'), null);
});

test('intentarGroq_ da null con HTTP != 200', () => {
  global.UrlFetchApp = { fetch: () => respuestaFalsa(429, '{"error":"rate limit"}') };
  assert.equal(intentarGroq_(CLAVE_GROQ, cuerpoGeminiFoto(), CATEGORIAS, false, '503'), null);
});

test('intentarGroq_ da null si la respuesta 200 no pasa leerExtraccion_ (JSON inválido)', () => {
  global.UrlFetchApp = {
    fetch: () => respuestaFalsa(200, JSON.stringify({
      choices: [{ message: { content: 'no es json' }, finish_reason: 'stop' }],
    })),
  };
  assert.equal(intentarGroq_(CLAVE_GROQ, cuerpoGeminiFoto(), CATEGORIAS, false, '503'), null);
});

test('intentarGroq_ con éxito devuelve la lectura y deja el rastro', () => {
  global.UrlFetchApp = { fetch: () => respuestaFalsa(200, JSON.stringify(datosGroqOk())) };
  const registrado = [];
  const original = console.log;
  console.log = (t) => registrado.push(t);
  try {
    const r = intentarGroq_(CLAVE_GROQ, cuerpoGeminiFoto(), CATEGORIAS, false, 'HTTP 503');
    assert.equal(r.ok, true);
    assert.equal(r.datos.proveedor, 'Seven 11');
    assert.deepEqual(registrado, ['Gemini falló (HTTP 503) → leyó Groq']);
  } finally {
    console.log = original;
  }
});

test('intentarGroq_ nunca manda la clave a console.warn en ninguna falla', () => {
  const registrado = [];
  const original = console.warn;
  console.warn = (t) => registrado.push(t);
  global.UrlFetchApp = { fetch: () => { throw new Error(`falló con ${CLAVE_GROQ}`); } };
  try {
    intentarGroq_(CLAVE_GROQ, cuerpoGeminiFoto(), CATEGORIAS, false, '503');
    assert.ok(registrado.every((linea) => !linea.includes(CLAVE_GROQ)));
  } finally {
    console.warn = original;
  }
});

// --- motivoGeminiFallo_ ---

test('motivoGeminiFallo_ da "sin conexión", "HTTP <código>" o el motivo de leerExtraccion_', () => {
  assert.equal(motivoGeminiFallo_({ error: new Error('DNS') }), 'sin conexión');
  assert.equal(motivoGeminiFallo_({ resultado: { codigo: 503, datos: {} } }), 'HTTP 503');
  assert.equal(motivoGeminiFallo_({ resultado: { codigo: 200, datos: {} } }, { ok: false, motivo: 'sin candidatos' }), 'sin candidatos');
  assert.equal(motivoGeminiFallo_({ resultado: { codigo: 200, datos: {} } }, { ok: false }), 'respuesta inválida');
});

// --- llamarConRespaldoGroq_ ---

test('llamarConRespaldoGroq_ sin falla de Gemini nunca intenta Groq', () => {
  global.UrlFetchApp = { fetch: () => { throw new Error('no debería llamarse'); } };
  const extraccion = {
    legible: true, tipo_documento: 'TICKET', proveedor: 'Seven 11', fecha: '2026-09-20',
    moneda: 'USD', forma_pago: 'EFECTIVO', lineas: [{ tipo: 'ITEM', descripcion: 'Leche', monto: 1.55, confianza: 'ALTA' }],
    total: 1.55, clase: 'GROCERIES', casa: null, comentario: null, descripcion_corta: 'leche seven 11',
    confianza: { proveedor: 'ALTA', fecha: 'ALTA', moneda: 'ALTA', total: 'ALTA', clase: 'ALTA' },
  };
  const datosGemini = { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(extraccion) }] } }] };
  const { intento, lectura, groq } = llamarConRespaldoGroq_(
    () => ({ codigo: 200, datos: datosGemini }), cuerpoGeminiFoto, CATEGORIAS, false, CLAVE_GROQ,
  );
  assert.equal(groq, null);
  assert.equal(intento.resultado.codigo, 200);
  assert.equal(lectura.ok, true);
});

test('llamarConRespaldoGroq_ con Gemini caído (error) y Groq con éxito devuelve groq', () => {
  global.UrlFetchApp = { fetch: () => respuestaFalsa(200, JSON.stringify(datosGroqOk())) };
  const { groq, intento } = llamarConRespaldoGroq_(
    () => { throw new Error('DNS'); }, cuerpoGeminiFoto, CATEGORIAS, false, CLAVE_GROQ,
  );
  assert.ok(intento.error);
  assert.equal(groq.ok, true);
  assert.equal(groq.datos.proveedor, 'Seven 11');
});

test('llamarConRespaldoGroq_ con Gemini HTTP != 200 y sin clave de Groq no arma el cuerpo ni llama a Groq', () => {
  let armado = false;
  global.UrlFetchApp = { fetch: () => { throw new Error('no debería llamarse'); } };
  const { groq } = llamarConRespaldoGroq_(
    () => ({ codigo: 503, datos: {} }), () => { armado = true; return cuerpoGeminiFoto(); }, CATEGORIAS, false, null,
  );
  assert.equal(groq, null);
  assert.equal(armado, false);
});

test('llamarConRespaldoGroq_ con Gemini 200 pero leerExtraccion_ inválida intenta Groq con el mismo cuerpo', () => {
  global.UrlFetchApp = { fetch: () => respuestaFalsa(200, JSON.stringify(datosGroqOk())) };
  const { groq, lectura } = llamarConRespaldoGroq_(
    () => ({ codigo: 200, datos: { candidates: [] } }), cuerpoGeminiFoto, CATEGORIAS, false, CLAVE_GROQ,
  );
  assert.equal(lectura.ok, false);
  assert.equal(groq.ok, true);
});

test('llamarConRespaldoGroq_ si Groq también falla devuelve groq: null y conserva intento/lectura originales', () => {
  global.UrlFetchApp = { fetch: () => respuestaFalsa(500, '{}') };
  const { groq, intento } = llamarConRespaldoGroq_(
    () => ({ codigo: 503, datos: {} }), cuerpoGeminiFoto, CATEGORIAS, false, CLAVE_GROQ,
  );
  assert.equal(groq, null);
  assert.equal(intento.resultado.codigo, 503);
});

test('llamarConRespaldoGroq_ si armarCuerpoGemini lanza (con claveGroq), se salta Groq sin propagar el error', () => {
  global.UrlFetchApp = { fetch: () => { throw new Error('no debería llamarse'); } };
  const { groq, intento } = llamarConRespaldoGroq_(
    () => ({ codigo: 503, datos: {} }),
    () => { throw new Error('no se pudo armar el cuerpo'); },
    CATEGORIAS, false, CLAVE_GROQ,
  );
  assert.equal(groq, null);
  assert.equal(intento.resultado.codigo, 503);
});

// --- probarGroq (editor) ---

test('probarGroq sin GROQ_API_KEY registra que falta (opcional) y no llama a Groq', () => {
  global.PropertiesService = { getScriptProperties: () => ({ getProperty: () => null }) };
  const registrado = [];
  global.Logger = { log: (t) => registrado.push(t) };
  global.UrlFetchApp = { fetch: () => { throw new Error('no debería llamarse'); } };
  try {
    assert.equal(probarGroq(), false);
    assert.deepEqual(registrado, ['GROQ_API_KEY: falta (opcional; sin ella el respaldo de Groq queda apagado)']);
  } finally {
    delete global.PropertiesService;
    delete global.Logger;
  }
});

test('probarGroq con clave y respuesta JSON {"ok":true} registra ok y nunca la clave', () => {
  global.PropertiesService = { getScriptProperties: () => ({ getProperty: () => CLAVE_GROQ }) };
  const registrado = [];
  global.Logger = { log: (t) => registrado.push(t) };
  global.UrlFetchApp = {
    fetch: () => respuestaFalsa(200, JSON.stringify({
      choices: [{ message: { content: '{"ok": true}' }, finish_reason: 'stop' }],
    })),
  };
  try {
    assert.equal(probarGroq(), true);
    assert.equal(registrado.length, 1);
    assert.match(registrado[0], /ok, modo JSON confirmado/);
    assert.ok(!registrado[0].includes(CLAVE_GROQ));
  } finally {
    delete global.PropertiesService;
    delete global.Logger;
  }
});

test('probarGroq con HTTP != 200 registra el código y un recorte del cuerpo, nunca la clave', () => {
  global.PropertiesService = { getScriptProperties: () => ({ getProperty: () => CLAVE_GROQ }) };
  const registrado = [];
  global.Logger = { log: (t) => registrado.push(t) };
  global.UrlFetchApp = { fetch: () => respuestaFalsa(401, JSON.stringify({ error: 'clave inválida' })) };
  try {
    assert.equal(probarGroq(), false);
    assert.match(registrado[0], /HTTP 401/);
    assert.ok(!registrado[0].includes(CLAVE_GROQ));
  } finally {
    delete global.PropertiesService;
    delete global.Logger;
  }
});

test('probarGroq con JSON sin "ok":true registra que respondió pero sin ok', () => {
  global.PropertiesService = { getScriptProperties: () => ({ getProperty: () => CLAVE_GROQ }) };
  const registrado = [];
  global.Logger = { log: (t) => registrado.push(t) };
  global.UrlFetchApp = {
    fetch: () => respuestaFalsa(200, JSON.stringify({
      choices: [{ message: { content: '{"ok": false}' }, finish_reason: 'stop' }],
    })),
  };
  try {
    assert.equal(probarGroq(), false);
    assert.match(registrado[0], /sin "ok":true/);
  } finally {
    delete global.PropertiesService;
    delete global.Logger;
  }
});

test('probarGroq con texto que no es JSON registra que la respuesta no es JSON', () => {
  global.PropertiesService = { getScriptProperties: () => ({ getProperty: () => CLAVE_GROQ }) };
  const registrado = [];
  global.Logger = { log: (t) => registrado.push(t) };
  global.UrlFetchApp = {
    fetch: () => respuestaFalsa(200, JSON.stringify({
      choices: [{ message: { content: 'claro, aquí va' }, finish_reason: 'stop' }],
    })),
  };
  try {
    assert.equal(probarGroq(), false);
    assert.match(registrado[0], /el texto no es JSON/);
  } finally {
    delete global.PropertiesService;
    delete global.Logger;
  }
});

test('probarGroq si UrlFetchApp lanza registra la falla sin la clave', () => {
  global.PropertiesService = { getScriptProperties: () => ({ getProperty: () => CLAVE_GROQ }) };
  const registrado = [];
  global.Logger = { log: (t) => registrado.push(t) };
  global.UrlFetchApp = { fetch: () => { throw new Error('DNS'); } };
  try {
    assert.equal(probarGroq(), false);
    assert.match(registrado[0], /falla \(DNS\)/);
  } finally {
    delete global.PropertiesService;
    delete global.Logger;
  }
});

test('probarGroq si UrlFetchApp lanza un valor sin .message (no un Error) igual lo registra', () => {
  global.PropertiesService = { getScriptProperties: () => ({ getProperty: () => CLAVE_GROQ }) };
  const registrado = [];
  global.Logger = { log: (t) => registrado.push(t) };
  // eslint-disable-next-line no-throw-literal -- a propósito: un throw sin.message.
  global.UrlFetchApp = { fetch: () => { throw 'DNS'; } };
  try {
    assert.equal(probarGroq(), false);
    assert.match(registrado[0], /falla \(DNS\)/);
  } finally {
    delete global.PropertiesService;
    delete global.Logger;
  }
});

test('probarGroq con una respuesta 200 sin choices registra que el texto no es JSON (texto vacío)', () => {
  global.PropertiesService = { getScriptProperties: () => ({ getProperty: () => CLAVE_GROQ }) };
  const registrado = [];
  global.Logger = { log: (t) => registrado.push(t) };
  global.UrlFetchApp = { fetch: () => respuestaFalsa(200, JSON.stringify({ choices: [] })) };
  try {
    assert.equal(probarGroq(), false);
    assert.match(registrado[0], /el texto no es JSON/);
  } finally {
    delete global.PropertiesService;
    delete global.Logger;
  }
});
