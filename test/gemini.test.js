const test = require('node:test');
const assert = require('node:assert/strict');

const {
  URL_GEMINI, VARIANTES_SALIDA, revisarModelos_, leerRespuestaPrueba_, probarGemini,
  llamarGeminiConReintento_, CODIGOS_TRANSITORIOS_, ESPERA_REINTENTO_MS,
} = require('../src/Gemini.js');

// LlamarGeminiConReintento_ usa debeSaltarAGroq_ (Groq.js) cuando hayGroq es true.
Object.assign(global, require('../src/Groq.js'));

const CLAVE_FALSA = 'clave-gemini-de-prueba';

function modelo(id, metodos = ['generateContent', 'countTokens']) {
  return { name: `models/${id}`, supportedGenerationMethods: metodos };
}

function respuestaTexto(texto) {
  return { candidates: [{ content: { parts: [{ text: texto }] }, finishReason: 'STOP' }] };
}

test('revisarModelos_ confirma cada id con generateContent', () => {
  const lista = { models: [modelo('gemini-3.5-flash-lite'), modelo('gemini-3.8-flash')] };
  const r = revisarModelos_(lista, ['gemini-3.5-flash-lite', 'gemini-3.8-flash']);
  assert.equal(r.ok, true);
  assert.deepEqual(r.lineas, [
    'Modelo gemini-3.5-flash-lite: existe, acepta generateContent',
    'Modelo gemini-3.8-flash: existe, acepta generateContent',
  ]);
});

test('revisarModelos_ marca un id que no existe o que no acepta generateContent', () => {
  const lista = { models: [modelo('gemini-3.8-flash', ['embedContent'])] };
  const r = revisarModelos_(lista, ['gemini-3.5-flash-lite', 'gemini-3.8-flash']);
  assert.equal(r.ok, false);
  assert.equal(r.lineas[0], 'Modelo gemini-3.5-flash-lite: falta');
  assert.equal(r.lineas[1], 'Modelo gemini-3.8-flash: existe, pero no acepta generateContent');
});

test('revisarModelos_ tolera una respuesta sin lista de modelos', () => {
  const r = revisarModelos_({}, ['gemini-3.5-flash-lite']);
  assert.equal(r.ok, false);
  assert.equal(r.lineas[0], 'Modelo gemini-3.5-flash-lite: falta');
});

test('prueba primero responseFormat y deja los campos viejos como respaldo', () => {
  assert.deepEqual(VARIANTES_SALIDA.map((v) => v.nombre), [
    'responseFormat', 'responseMimeType+responseJsonSchema', 'responseMimeType+responseSchema',
  ]);
  const [nueva, jsonSchema, vieja] = VARIANTES_SALIDA;
  assert.equal(nueva.generationConfig.responseFormat.text.mimeType, 'application/json');
  assert.equal(jsonSchema.generationConfig.responseMimeType, 'application/json');
  assert.equal(jsonSchema.generationConfig.responseJsonSchema.type, 'object');
  assert.equal(vieja.generationConfig.responseSchema.type, 'OBJECT');
});

test('leerRespuestaPrueba_ acepta un JSON con ok booleano', () => {
  assert.deepEqual(leerRespuestaPrueba_(respuestaTexto('{"ok": true}')), { ok: true, detalle: 'JSON válido {"ok":true}' });
});

test('leerRespuestaPrueba_ rechaza texto que no es JSON o sin ok booleano', () => {
  assert.equal(leerRespuestaPrueba_(respuestaTexto('claro, aquí va')).ok, false);
  assert.equal(leerRespuestaPrueba_(respuestaTexto('{"ok": "sí"}')).ok, false);
  assert.equal(leerRespuestaPrueba_({}).ok, false);
  assert.match(leerRespuestaPrueba_({}).detalle, /sin texto/);
});

function simularGemini({ modelos, codigos = {}, cuerpos = {}, clave = CLAVE_FALSA } = {}) {
  const peticiones = [];
  const registrado = [];
  global.CONFIG = require('./configPrueba.js').CONFIG;
  global.PropertiesService = { getScriptProperties: () => ({ getProperty: () => clave }) };
  global.Logger = { log: (t) => registrado.push(t) };
  global.UrlFetchApp = {
    fetch: (url, opciones) => {
      peticiones.push({ url, opciones });
      if (url.includes('/models?')) {
        const lista = modelos || { models: [modelo('gemini-3.5-flash-lite'), modelo('gemini-3.8-flash')] };
        return { getResponseCode: () => 200, getContentText: () => JSON.stringify(lista) };
      }
      const variante = Object.keys(JSON.parse(opciones.payload).generationConfig)[0];
      const codigo = codigos[variante] || 200;
      const cuerpo = cuerpos[variante] || (codigo === 200
        ? respuestaTexto('{"ok":true}')
        : { error: { code: codigo, message: `Unknown name "${variante}"` } });
      return { getResponseCode: () => codigo, getContentText: () => JSON.stringify(cuerpo) };
    },
  };
  return { peticiones, registrado };
}

function limpiarGemini() {
  for (const g of ['CONFIG', 'PropertiesService', 'Logger', 'UrlFetchApp']) delete global[g];
}

test('probarGemini manda la clave solo en la cabecera y nunca la registra', () => {
  const { peticiones, registrado } = simularGemini();
  try {
    probarGemini();
    for (const { url, opciones } of peticiones) {
      assert.ok(url.startsWith(URL_GEMINI), url);
      assert.ok(!url.includes(CLAVE_FALSA), url);
      assert.equal(opciones.headers['x-goog-api-key'], CLAVE_FALSA);
      assert.equal(opciones.muteHttpExceptions, true);
    }
    assert.ok(!registrado.join('\n').includes(CLAVE_FALSA));
  } finally {
    limpiarGemini();
  }
});

test('probarGemini revisa modelos, prueba las 3 variantes y confirma la ganadora en el modelo de relectura', () => {
  const { peticiones, registrado } = simularGemini({ codigos: { responseFormat: 400 } });
  try {
    assert.equal(probarGemini(), true);
    const generar = peticiones.filter((p) => p.url.endsWith(':generateContent'));
    assert.equal(generar.length, 4);
    assert.ok(generar.slice(0, 3).every((p) => p.url.includes('/models/gemini-3.5-flash-lite:')));
    assert.ok(generar[3].url.includes('/models/gemini-3.8-flash:'));
    assert.deepEqual(Object.keys(JSON.parse(generar[3].opciones.payload).generationConfig), ['responseMimeType', 'responseJsonSchema']);
    assert.match(registrado.join('\n'), /responseFormat: falla \(HTTP 400: Unknown name/);
    assert.match(registrado.join('\n'), /Usar: responseMimeType\+responseJsonSchema/);
    assert.match(registrado.join('\n'), /gemini-3\.8-flash con responseMimeType\+responseJsonSchema: ok/);
  } finally {
    limpiarGemini();
  }
});

test('probarGemini devuelve false si ninguna variante funciona y no gasta la cuota de relectura', () => {
  const { peticiones, registrado } = simularGemini({
    codigos: { responseFormat: 400, responseMimeType: 400 },
  });
  try {
    assert.equal(probarGemini(), false);
    assert.equal(peticiones.filter((p) => p.url.includes('gemini-3.8-flash:')).length, 0);
    assert.match(registrado.join('\n'), /Ninguna variante funcionó/);
  } finally {
    limpiarGemini();
  }
});

test('probarGemini se detiene si falta la clave', () => {
  const { peticiones, registrado } = simularGemini({ clave: null });
  try {
    assert.equal(probarGemini(), false);
    assert.equal(peticiones.length, 0);
    assert.deepEqual(registrado, ['GEMINI_API_KEY: falta (ejecuta verificarPropiedades)']);
  } finally {
    limpiarGemini();
  }
});

test('probarGemini informa el error HTTP al listar modelos y sigue con la prueba de salida', () => {
  const { registrado } = simularGemini();
  const fetchOriginal = global.UrlFetchApp.fetch;
  global.UrlFetchApp.fetch = (url, opciones) => (url.includes('/models?')
    ? { getResponseCode: () => 403, getContentText: () => '{"error":{"message":"PERMISSION_DENIED"}}' }
    : fetchOriginal(url, opciones));
  try {
    assert.equal(probarGemini(), false);
    assert.match(registrado[0], /^Lista de modelos: falla \(HTTP 403: PERMISSION_DENIED\)/);
    assert.match(registrado.join('\n'), /Usar: responseFormat/);
  } finally {
    limpiarGemini();
  }
});

test('probarGemini recorta mensajes de error largos', () => {
  const { registrado } = simularGemini({
    codigos: { responseFormat: 400, responseMimeType: 400 },
    cuerpos: { responseFormat: { error: { message: 'x'.repeat(500) } } },
  });
  try {
    probarGemini();
    const linea = registrado.find((l) => l.includes('responseFormat: falla'));
    assert.ok(linea.length < 300, String(linea.length));
    assert.ok(!linea.includes('x'.repeat(201)));
  } finally {
    limpiarGemini();
  }
});

test('probarGemini tolera una respuesta que no es JSON (p. ej. una página de error)', () => {
  const { registrado } = simularGemini();
  global.UrlFetchApp.fetch = () => ({ getResponseCode: () => 502, getContentText: () => '<html>Bad Gateway</html>' });
  try {
    assert.equal(probarGemini(), false);
    assert.match(registrado[0], /^Lista de modelos: falla \(HTTP 502: sin detalle\)/);
  } finally {
    limpiarGemini();
  }
});

// --- llamarGeminiConReintento_ ---

const PRINCIPAL = 'gemini-3.5-flash-lite';
const RELECTURA = 'gemini-3.8-flash';

/** Cola de respuestas/errores de UrlFetchApp; cada llamada consume el siguiente. */
function fetchDeCola_(pasos) {
  let i = 0;
  return () => {
    const paso = pasos[Math.min(i, pasos.length - 1)];
    i += 1;
    if (paso.lanza) throw new Error(paso.lanza);
    return { getResponseCode: () => paso.codigo, getContentText: () => JSON.stringify(paso.cuerpo || {}) };
  };
}

/** Espía de Utilities.sleep: no espera de verdad, solo anota cuánto le pidieron dormir. */
function espiaDormir_() {
  const esperas = [];
  return { dormir: (ms) => esperas.push(ms), esperas };
}

function prepararGemini_() {
  global.CONFIG = { MODELO_PRINCIPAL: PRINCIPAL, MODELO_RELECTURA: RELECTURA };
  global.Logger = { log: () => {} };
}

function limpiarGeminiReintento_() {
  for (const g of ['CONFIG', 'Logger', 'UrlFetchApp']) delete global[g];
}

test('llamarGeminiConReintento_ sin falla: una sola llamada, sin dormir', () => {
  prepararGemini_();
  try {
    global.UrlFetchApp = { fetch: fetchDeCola_([{ codigo: 200, cuerpo: { ok: true } }]) };
    const { dormir, esperas } = espiaDormir_();
    let llamadas = 0;
    const resultado = llamarGeminiConReintento_(CLAVE_FALSA, PRINCIPAL, () => { llamadas += 1; return {}; }, dormir);
    assert.deepEqual(resultado, { codigo: 200, datos: { ok: true } });
    assert.equal(llamadas, 1);
    assert.deepEqual(esperas, []);
  } finally {
    limpiarGeminiReintento_();
  }
});

test('llamarGeminiConReintento_ no reintenta un código no transitorio (400)', () => {
  prepararGemini_();
  try {
    global.UrlFetchApp = { fetch: fetchDeCola_([{ codigo: 400, cuerpo: { error: { message: 'pedido malo' } } }]) };
    const { dormir, esperas } = espiaDormir_();
    let llamadas = 0;
    const resultado = llamarGeminiConReintento_(CLAVE_FALSA, PRINCIPAL, () => { llamadas += 1; return {}; }, dormir);
    assert.equal(resultado.codigo, 400);
    assert.equal(llamadas, 1);
    assert.deepEqual(esperas, []);
  } finally {
    limpiarGeminiReintento_();
  }
});

CODIGOS_TRANSITORIOS_.forEach((codigo) => {
  test(`llamarGeminiConReintento_ reintenta el mismo modelo ante HTTP ${codigo} y devuelve el segundo intento si ya no falla`, () => {
    prepararGemini_();
    try {
      const rutas = [];
      global.UrlFetchApp = {
        fetch: fetchDeCola_([{ codigo, cuerpo: {} }, { codigo: 200, cuerpo: { ok: true } }]),
      };
      const original = global.UrlFetchApp.fetch;
      global.UrlFetchApp.fetch = (url, opciones) => { rutas.push(url); return original(url, opciones); };
      const avisos = [];
      const real = console.warn;
      console.warn = (linea) => avisos.push(linea);
      const { dormir, esperas } = espiaDormir_();
      let resultado;
      try {
        resultado = llamarGeminiConReintento_(CLAVE_FALSA, PRINCIPAL, () => ({}), dormir);
      } finally {
        console.warn = real;
      }
      assert.deepEqual(resultado, { codigo: 200, datos: { ok: true } });
      assert.deepEqual(rutas, [
        `${URL_GEMINI}/models/${PRINCIPAL}:generateContent`,
        `${URL_GEMINI}/models/${PRINCIPAL}:generateContent`,
      ]);
      assert.deepEqual(esperas, [ESPERA_REINTENTO_MS]);
      assert.deepEqual(avisos, [`Gemini ${PRINCIPAL}: HTTP ${codigo}, reintenta`]);
    } finally {
      limpiarGeminiReintento_();
    }
  });
});

test('llamarGeminiConReintento_ pasa a MODELO_RELECTURA si el modelo principal sigue transitorio tras el reintento', () => {
  prepararGemini_();
  try {
    const rutas = [];
    global.UrlFetchApp = {
      fetch: fetchDeCola_([{ codigo: 503, cuerpo: {} }, { codigo: 503, cuerpo: {} }, { codigo: 200, cuerpo: { ok: true } }]),
    };
    const original = global.UrlFetchApp.fetch;
    global.UrlFetchApp.fetch = (url, opciones) => { rutas.push(url); return original(url, opciones); };
    const { dormir, esperas } = espiaDormir_();
    const resultado = llamarGeminiConReintento_(CLAVE_FALSA, PRINCIPAL, () => ({}), dormir);
    assert.deepEqual(resultado, { codigo: 200, datos: { ok: true } });
    assert.deepEqual(rutas, [
      `${URL_GEMINI}/models/${PRINCIPAL}:generateContent`,
      `${URL_GEMINI}/models/${PRINCIPAL}:generateContent`,
      `${URL_GEMINI}/models/${RELECTURA}:generateContent`,
    ]);
    assert.equal(esperas.length, 2);
  } finally {
    limpiarGeminiReintento_();
  }
});

test('llamarGeminiConReintento_ devuelve el último resultado si los 3 intentos siguen transitorios', () => {
  prepararGemini_();
  try {
    global.UrlFetchApp = { fetch: fetchDeCola_([{ codigo: 500, cuerpo: {} }]) };
    const { dormir } = espiaDormir_();
    const resultado = llamarGeminiConReintento_(CLAVE_FALSA, PRINCIPAL, () => ({}), dormir);
    assert.equal(resultado.codigo, 500);
  } finally {
    limpiarGeminiReintento_();
  }
});

test('llamarGeminiConReintento_ no repite MODELO_RELECTURA si ya era el modelo original (solo 2 intentos)', () => {
  prepararGemini_();
  try {
    const rutas = [];
    global.UrlFetchApp = { fetch: fetchDeCola_([{ codigo: 429, cuerpo: {} }]) };
    const original = global.UrlFetchApp.fetch;
    global.UrlFetchApp.fetch = (url, opciones) => { rutas.push(url); return original(url, opciones); };
    const { dormir, esperas } = espiaDormir_();
    const resultado = llamarGeminiConReintento_(CLAVE_FALSA, RELECTURA, () => ({}), dormir);
    assert.equal(resultado.codigo, 429);
    assert.deepEqual(rutas, [
      `${URL_GEMINI}/models/${RELECTURA}:generateContent`,
      `${URL_GEMINI}/models/${RELECTURA}:generateContent`,
    ]);
    assert.deepEqual(esperas, [ESPERA_REINTENTO_MS]);
  } finally {
    limpiarGeminiReintento_();
  }
});

// --- llamarGeminiConReintento_ con hayGroq (saltar directo a Groq) ---

[429, 503].forEach((codigo) => {
  test(`llamarGeminiConReintento_ con hayGroq=true salta al respaldo sin el segundo intento ante HTTP ${codigo}`, () => {
    prepararGemini_();
    try {
      let llamadas = 0;
      global.UrlFetchApp = { fetch: fetchDeCola_([{ codigo, cuerpo: {} }]) };
      const { dormir, esperas } = espiaDormir_();
      const resultado = llamarGeminiConReintento_(CLAVE_FALSA, PRINCIPAL, () => { llamadas += 1; return {}; }, dormir, true);
      assert.equal(resultado.codigo, codigo);
      assert.equal(llamadas, 1);
      assert.deepEqual(esperas, []);
    } finally {
      limpiarGeminiReintento_();
    }
  });
});

test('llamarGeminiConReintento_ con hayGroq=true NO salta ante HTTP 500/504 (solo 429/503 saltan, AH-b): reintenta igual que hoy', () => {
  prepararGemini_();
  try {
    global.UrlFetchApp = { fetch: fetchDeCola_([{ codigo: 500, cuerpo: {} }, { codigo: 200, cuerpo: { ok: true } }]) };
    const { dormir, esperas } = espiaDormir_();
    let llamadas = 0;
    const resultado = llamarGeminiConReintento_(CLAVE_FALSA, PRINCIPAL, () => { llamadas += 1; return {}; }, dormir, true);
    assert.deepEqual(resultado, { codigo: 200, datos: { ok: true } });
    assert.equal(llamadas, 2);
    assert.deepEqual(esperas, [ESPERA_REINTENTO_MS]);
  } finally {
    limpiarGeminiReintento_();
  }
});

test('llamarGeminiConReintento_ sin hayGroq (undefined, el default) NO salta ante HTTP 429/503: reintenta igual que hoy', () => {
  prepararGemini_();
  try {
    global.UrlFetchApp = { fetch: fetchDeCola_([{ codigo: 429, cuerpo: {} }, { codigo: 200, cuerpo: { ok: true } }]) };
    const { dormir, esperas } = espiaDormir_();
    let llamadas = 0;
    const resultado = llamarGeminiConReintento_(CLAVE_FALSA, PRINCIPAL, () => { llamadas += 1; return {}; }, dormir);
    assert.deepEqual(resultado, { codigo: 200, datos: { ok: true } });
    assert.equal(llamadas, 2);
    assert.deepEqual(esperas, [ESPERA_REINTENTO_MS]);
  } finally {
    limpiarGeminiReintento_();
  }
});

test('llamarGeminiConReintento_ con hayGroq=false (con clave de Groq apagada) tampoco salta', () => {
  prepararGemini_();
  try {
    global.UrlFetchApp = { fetch: fetchDeCola_([{ codigo: 503, cuerpo: {} }, { codigo: 200, cuerpo: { ok: true } }]) };
    const { dormir, esperas } = espiaDormir_();
    let llamadas = 0;
    const resultado = llamarGeminiConReintento_(CLAVE_FALSA, PRINCIPAL, () => { llamadas += 1; return {}; }, dormir, false);
    assert.deepEqual(resultado, { codigo: 200, datos: { ok: true } });
    assert.equal(llamadas, 2);
    assert.deepEqual(esperas, [ESPERA_REINTENTO_MS]);
  } finally {
    limpiarGeminiReintento_();
  }
});

test('llamarGeminiConReintento_ reintenta si UrlFetchApp lanza (sin conexión) y se recupera', () => {
  prepararGemini_();
  try {
    global.UrlFetchApp = { fetch: fetchDeCola_([{ lanza: 'DNS' }, { codigo: 200, cuerpo: { ok: true } }]) };
    const avisos = [];
    const real = console.warn;
    console.warn = (linea) => avisos.push(linea);
    const { dormir, esperas } = espiaDormir_();
    let resultado;
    try {
      resultado = llamarGeminiConReintento_(CLAVE_FALSA, PRINCIPAL, () => ({}), dormir);
    } finally {
      console.warn = real;
    }
    assert.deepEqual(resultado, { codigo: 200, datos: { ok: true } });
    assert.deepEqual(esperas, [ESPERA_REINTENTO_MS]);
    assert.deepEqual(avisos, [`Gemini ${PRINCIPAL}: sin conexión, reintenta`]);
  } finally {
    limpiarGeminiReintento_();
  }
});

test('llamarGeminiConReintento_ lanza si el último intento se quedó sin conexión', () => {
  prepararGemini_();
  try {
    global.UrlFetchApp = { fetch: fetchDeCola_([{ lanza: 'DNS' }]) };
    const { dormir } = espiaDormir_();
    assert.throws(() => llamarGeminiConReintento_(CLAVE_FALSA, PRINCIPAL, () => ({}), dormir), /DNS/);
  } finally {
    limpiarGeminiReintento_();
  }
});

test('llamarGeminiConReintento_ nunca manda la clave en la URL en ningún intento', () => {
  prepararGemini_();
  try {
    const urls = [];
    global.UrlFetchApp = {
      fetch: (url) => { urls.push(url); return { getResponseCode: () => 503, getContentText: () => '{}' }; },
    };
    const { dormir } = espiaDormir_();
    llamarGeminiConReintento_(CLAVE_FALSA, PRINCIPAL, () => ({}), dormir);
    urls.forEach((url) => assert.ok(!url.includes(CLAVE_FALSA)));
  } finally {
    limpiarGeminiReintento_();
  }
});
