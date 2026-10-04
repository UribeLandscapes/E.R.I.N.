const test = require('node:test');
const assert = require('node:assert/strict');

// En Apps Script estos nombres son globales; en Node se ponen a mano (mismo patrón que
// foto.test.js y mensajes.test.js).
global.MESES = require('../src/Hoja.js').MESES;
Object.assign(global, require('../src/Reglas.js'));
Object.assign(global, require('../src/Extraccion.js'));
global.sinTildes_ = require('../src/Hoja.js').sinTildes_;
global.CONFIG = require('./configPrueba.js').CONFIG;
Object.assign(global, require('../src/Clases.js'));
global.cambiosRespuesta_ = require('../src/Escritura.js').cambiosRespuesta_;
global.textoCelda_ = require('../src/Escritura.js').textoCelda_;
Object.assign(global, require('../src/Texto.js'));
Object.assign(global, require('../src/Confirmacion.js'));
Object.assign(global, require('../src/Carpetas.js'));
Object.assign(global, require('../src/Foto.js'));

const { cuerpoFotoGemini_ } = require('../src/Foto.js');
const { cuerpoTextoGemini_ } = require('../src/Mensajes.js');
const { leerExtraccion_ } = require('../src/Extraccion.js');
const {
  URL_GROQ, MAX_IMAGENES_GROQ, MAX_BYTES_IMAGEN_GROQ, MIME_IMAGEN_GROQ_PERMITIDOS,
  cuerpoGroqDesdeGemini_, respuestaGeminiDesdeGroq_, debeSaltarAGroq_, geminiFallo_, lineaRastroGroq_,
  rutaGroqFoto_, cuerpoGeminiConTextoOcr_,
} = require('../src/Groq.js');

const CATEGORIAS = ['GROCERIES', 'MAINTENANCE', 'SERVICES'];
const HOY = '2026-09-27';

// --- URL_GROQ / constantes ---

test('URL_GROQ apunta al chat/completions de Groq', () => {
  assert.equal(URL_GROQ, 'https://api.groq.com/openai/v1/chat/completions');
});

test('MAX_IMAGENES_GROQ y MAX_BYTES_IMAGEN_GROQ son los límites documentados (3 fotos, 20 MB)', () => {
  assert.equal(MAX_IMAGENES_GROQ, 3);
  assert.equal(MAX_BYTES_IMAGEN_GROQ, 20 * 1024 * 1024);
});

// --- cuerpoGroqDesdeGemini_ ---

function base64DeBytes_(bytes) {
  return 'A'.repeat(Math.ceil(bytes / 0.75));
}

test('cuerpoGroqDesdeGemini_ traduce el cuerpo de una foto de Gemini (cuerpoFotoGemini_) sin tocarlo', () => {
  const cuerpoGemini = cuerpoFotoGemini_('BASE64FOTO', 'image/jpeg', 'playa, efectivo', CATEGORIAS, HOY);
  const copia = JSON.parse(JSON.stringify(cuerpoGemini));

  const cuerpoGroq = cuerpoGroqDesdeGemini_(cuerpoGemini);

  assert.deepEqual(cuerpoGemini, copia, 'cuerpoGroqDesdeGemini_ no debe mutar su entrada');
  assert.equal(cuerpoGroq.model, CONFIG.MODELO_GROQ);
  assert.deepEqual(cuerpoGroq.response_format, { type: 'json_object' });
  assert.equal(cuerpoGroq.messages[0].role, 'system');
  assert.match(cuerpoGroq.messages[0].content, /Responde SOLO con un objeto JSON/);
  assert.match(cuerpoGroq.messages[0].content, /Eres el asistente de la caja chica/);
  assert.equal(cuerpoGroq.messages[1].role, 'user');
  assert.deepEqual(cuerpoGroq.messages[1].content, [
    { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,BASE64FOTO' } },
    { type: 'text', text: 'playa, efectivo' },
  ]);
});

test('cuerpoGroqDesdeGemini_ traduce el cuerpo de un texto de Gemini (cuerpoTextoGemini_)', () => {
  const cuerpoGemini = cuerpoTextoGemini_('gasté 25 en el super', CATEGORIAS, HOY);

  const cuerpoGroq = cuerpoGroqDesdeGemini_(cuerpoGemini);

  assert.equal(cuerpoGroq.messages[1].role, 'user');
  assert.deepEqual(cuerpoGroq.messages[1].content, [{ type: 'text', text: 'gasté 25 en el super' }]);
  assert.match(cuerpoGroq.messages[0].content, new RegExp(JSON.stringify(cuerpoGemini.generationConfig.responseJsonSchema).slice(0, 30).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('cuerpoGroqDesdeGemini_ lanza si no hay partes de usuario', () => {
  assert.throws(() => cuerpoGroqDesdeGemini_({ systemInstruction: { parts: [{ text: 'hola' }] }, contents: [] }), /parte de usuario/);
  assert.throws(() => cuerpoGroqDesdeGemini_({ systemInstruction: { parts: [] }, contents: [{ role: 'user', parts: [] }] }), /parte de usuario/);
});

test('cuerpoGroqDesdeGemini_ lanza si trae más de MAX_IMAGENES_GROQ imágenes', () => {
  const parts = Array.from({ length: MAX_IMAGENES_GROQ + 1 }, () => ({ inlineData: { mimeType: 'image/jpeg', data: 'AAAA' } }));
  const cuerpo = { systemInstruction: { parts: [{ text: 'x' }] }, contents: [{ role: 'user', parts }] };
  assert.throws(() => cuerpoGroqDesdeGemini_(cuerpo), /hasta 3 imágenes/);
});

test('cuerpoGroqDesdeGemini_ acepta exactamente MAX_IMAGENES_GROQ imágenes', () => {
  const parts = Array.from({ length: MAX_IMAGENES_GROQ }, () => ({ inlineData: { mimeType: 'image/jpeg', data: 'AAAA' } }));
  const cuerpo = { systemInstruction: { parts: [{ text: 'x' }] }, contents: [{ role: 'user', parts }] };
  assert.doesNotThrow(() => cuerpoGroqDesdeGemini_(cuerpo));
});

test('cuerpoGroqDesdeGemini_ lanza si una imagen pesa más de MAX_BYTES_IMAGEN_GROQ', () => {
  const data = base64DeBytes_(MAX_BYTES_IMAGEN_GROQ + 1);
  const cuerpo = {
    systemInstruction: { parts: [{ text: 'x' }] },
    contents: [{ role: 'user', parts: [{ inlineData: { mimeType: 'image/jpeg', data } }] }],
  };
  assert.throws(() => cuerpoGroqDesdeGemini_(cuerpo), /pesa más/);
});

test('cuerpoGroqDesdeGemini_ acepta una imagen justo en el límite de bytes', () => {
  const data = base64DeBytes_(MAX_BYTES_IMAGEN_GROQ);
  const cuerpo = {
    systemInstruction: { parts: [{ text: 'x' }] },
    contents: [{ role: 'user', parts: [{ inlineData: { mimeType: 'image/jpeg', data } }] }],
  };
  assert.doesNotThrow(() => cuerpoGroqDesdeGemini_(cuerpo));
});

test('cuerpoGroqDesdeGemini_ lanza si alguna imagen es PDF (AH-c: ese texto sale del OCR de Drive)', () => {
  const cuerpo = {
    systemInstruction: { parts: [{ text: 'x' }] },
    contents: [{ role: 'user', parts: [{ inlineData: { mimeType: 'application/pdf', data: 'AAAA' } }] }],
  };
  assert.throws(() => cuerpoGroqDesdeGemini_(cuerpo), /PDF/);
});

test('cuerpoGroqDesdeGemini_ tolera un cuerpo sin systemInstruction, contents o generationConfig', () => {
  const cuerpoGroq = cuerpoGroqDesdeGemini_({ contents: [{ role: 'user', parts: [{ text: 'hola' }] }] });
  assert.equal(cuerpoGroq.messages[0].role, 'system');
  assert.match(cuerpoGroq.messages[0].content, /Responde SOLO con un objeto JSON/);
  assert.deepEqual(cuerpoGroq.messages[1].content, [{ type: 'text', text: 'hola' }]);
});

test('cuerpoGroqDesdeGemini_ lanza si falta contents por completo', () => {
  assert.throws(() => cuerpoGroqDesdeGemini_({ systemInstruction: { parts: [{ text: 'x' }] } }), /parte de usuario/);
});

test('cuerpoGroqDesdeGemini_ une varias partes de systemInstruction con salto de línea', () => {
  const cuerpo = {
    systemInstruction: { parts: [{ text: 'línea 1' }, { text: 'línea 2' }] },
    contents: [{ role: 'user', parts: [{ text: 'hola' }] }],
  };
  const cuerpoGroq = cuerpoGroqDesdeGemini_(cuerpo);
  assert.match(cuerpoGroq.messages[0].content, /línea 1\nlínea 2/);
});

// --- respuestaGeminiDesdeGroq_ ---

function respuestaGroq(content, finishReason = 'stop') {
  return { choices: [{ message: { role: 'assistant', content }, finish_reason: finishReason }] };
}

test('respuestaGeminiDesdeGroq_ traduce stop → STOP y length → MAX_TOKENS', () => {
  assert.equal(respuestaGeminiDesdeGroq_(respuestaGroq('{"ok":true}', 'stop')).candidates[0].finishReason, 'STOP');
  assert.equal(respuestaGeminiDesdeGroq_(respuestaGroq('{"ok":true}', 'length')).candidates[0].finishReason, 'MAX_TOKENS');
});

test('respuestaGeminiDesdeGroq_ pone en mayúsculas cualquier otro finish_reason, u OTHER si falta', () => {
  assert.equal(respuestaGeminiDesdeGroq_(respuestaGroq('x', 'content_filter')).candidates[0].finishReason, 'CONTENT_FILTER');
  assert.equal(respuestaGeminiDesdeGroq_({ choices: [{ message: { content: 'x' } }] }).candidates[0].finishReason, 'OTHER');
});

test('respuestaGeminiDesdeGroq_ da { candidates: [] } sin choices, sin mensaje o con entrada rara', () => {
  assert.deepEqual(respuestaGeminiDesdeGroq_({ choices: [] }), { candidates: [] });
  assert.deepEqual(respuestaGeminiDesdeGroq_({}), { candidates: [] });
  assert.deepEqual(respuestaGeminiDesdeGroq_(null), { candidates: [] });
  assert.deepEqual(respuestaGeminiDesdeGroq_(undefined), { candidates: [] });
  assert.deepEqual(respuestaGeminiDesdeGroq_('texto suelto'), { candidates: [] });
  assert.deepEqual(respuestaGeminiDesdeGroq_({ choices: [{}] }), { candidates: [] });
  assert.deepEqual(respuestaGeminiDesdeGroq_({ choices: [{ message: {} }] }), { candidates: [] });
});

test('respuestaGeminiDesdeGroq_ quita un bloque <think>...</think> inicial', () => {
  const texto = '<think>dudando...</think>\n{"ok":true}';
  const r = respuestaGeminiDesdeGroq_(respuestaGroq(texto));
  assert.equal(r.candidates[0].content.parts[0].text, '{"ok":true}');
});

test('respuestaGeminiDesdeGroq_ quita una cerca ```json ... ``` si el texto completo viene cercado', () => {
  const texto = '```json\n{"ok":true}\n```';
  const r = respuestaGeminiDesdeGroq_(respuestaGroq(texto));
  assert.equal(r.candidates[0].content.parts[0].text, '{"ok":true}');
});

test('respuestaGeminiDesdeGroq_ deja tal cual un texto sin <think> ni cerca', () => {
  const r = respuestaGeminiDesdeGroq_(respuestaGroq('{"ok":true}'));
  assert.equal(r.candidates[0].content.parts[0].text, '{"ok":true}');
});

// --- integración: leerExtraccion_(respuestaGeminiDesdeGroq_(x)) funciona sin cambios ---

test('leerExtraccion_ lee sin cambios una respuesta realista de Groq traducida por respuestaGeminiDesdeGroq_', () => {
  const extraccion = {
    legible: true,
    tipo_documento: 'TICKET',
    proveedor: 'Super 99',
    fecha: '2026-09-20',
    moneda: 'USD',
    forma_pago: 'EFECTIVO',
    lineas: [{ tipo: 'ITEM', descripcion: 'Leche', monto: 1.55, confianza: 'ALTA' }],
    total: 1.55,
    clase: 'GROCERIES',
    casa: null,
    comentario: null,
    descripcion_corta: 'leche super 99',
    confianza: { proveedor: 'ALTA', fecha: 'ALTA', moneda: 'ALTA', total: 'ALTA', clase: 'ALTA' },
  };
  const contenidoGroq = `<think>leo el recibo</think>\n${JSON.stringify(extraccion)}`;
  const respuestaGroqCruda = respuestaGroq(contenidoGroq, 'stop');

  const respuestaGemini = respuestaGeminiDesdeGroq_(respuestaGroqCruda);
  const r = leerExtraccion_(respuestaGemini, CATEGORIAS, false);

  assert.equal(r.ok, true);
  assert.equal(r.datos.proveedor, 'Super 99');
  assert.equal(r.datos.total, 1.55);
  assert.equal(r.datos.clase, 'GROCERIES');
  assert.equal(r.datos.lineas.length, 1);
});

test('leerExtraccion_ da ok:false ante un finish_reason distinto de stop (Groq truncó la respuesta)', () => {
  const respuestaGemini = respuestaGeminiDesdeGroq_(respuestaGroq('{"legible":true}', 'length'));
  const r = leerExtraccion_(respuestaGemini, CATEGORIAS, false);
  assert.equal(r.ok, false);
  assert.match(r.motivo, /MAX_TOKENS/);
});

// --- debeSaltarAGroq_ ---

test('debeSaltarAGroq_ salta con HTTP 429 o 503', () => {
  assert.equal(debeSaltarAGroq_({ resultado: { codigo: 429, datos: {} } }), true);
  assert.equal(debeSaltarAGroq_({ resultado: { codigo: 503, datos: {} } }), true);
});

test('debeSaltarAGroq_ no salta con 200, 500, 504, 400/401/403/404 ni sin conexión', () => {
  [200, 500, 504, 400, 401, 403, 404].forEach((codigo) => {
    assert.equal(debeSaltarAGroq_({ resultado: { codigo, datos: {} } }), false, String(codigo));
  });
  assert.equal(debeSaltarAGroq_({ error: new Error('sin conexión') }), false);
});

test('debeSaltarAGroq_ tolera entrada vacía', () => {
  assert.equal(debeSaltarAGroq_(undefined), false);
  assert.equal(debeSaltarAGroq_({}), false);
});

// --- geminiFallo_ ---

test('geminiFallo_ es true con un error de conexión o sin resultado', () => {
  assert.equal(geminiFallo_({ error: new Error('DNS') }), true);
  assert.equal(geminiFallo_({}), true);
  assert.equal(geminiFallo_(undefined), true);
});

test('geminiFallo_ es true con cualquier código distinto de 200', () => {
  [429, 500, 503, 504, 400].forEach((codigo) => {
    assert.equal(geminiFallo_({ resultado: { codigo, datos: {} } }), true, String(codigo));
  });
});

test('geminiFallo_ con 200 depende de si la lectura de leerExtraccion_ vino ok:false', () => {
  assert.equal(geminiFallo_({ resultado: { codigo: 200, datos: {} } }, { ok: false, motivo: 'x' }), true);
  assert.equal(geminiFallo_({ resultado: { codigo: 200, datos: {} } }, { ok: true, datos: {} }), false);
  assert.equal(geminiFallo_({ resultado: { codigo: 200, datos: {} } }), false);
});

// --- lineaRastroGroq_ ---

test('lineaRastroGroq_ arma la línea de log que solo ve el administrador', () => {
  assert.equal(lineaRastroGroq_('503'), 'Gemini falló (503) → leyó Groq');
  assert.equal(lineaRastroGroq_('sin conexión'), 'Gemini falló (sin conexión) → leyó Groq');
});

// --- rutaGroqFoto_ / MIME_IMAGEN_GROQ_PERMITIDOS ---

test('MIME_IMAGEN_GROQ_PERMITIDOS es solo jpeg y png (Groq no confirma otros formatos)', () => {
  assert.deepEqual([...MIME_IMAGEN_GROQ_PERMITIDOS], ['image/jpeg', 'image/png']);
});

test('rutaGroqFoto_ da "imagen" para jpeg y png (sin importar mayúsculas)', () => {
  assert.equal(rutaGroqFoto_('image/jpeg'), 'imagen');
  assert.equal(rutaGroqFoto_('image/png'), 'imagen');
  assert.equal(rutaGroqFoto_('IMAGE/JPEG'), 'imagen');
});

test('rutaGroqFoto_ da "ocr" para un PDF (Groq no lo lee: AH-c)', () => {
  assert.equal(rutaGroqFoto_('application/pdf'), 'ocr');
  assert.equal(rutaGroqFoto_('APPLICATION/PDF'), 'ocr');
});

test('rutaGroqFoto_ da null para webp/heic/heif u otro mimeType, o sin mimeType', () => {
  ['image/webp', 'image/heic', 'image/heif', 'audio/ogg', ''].forEach((mime) => {
    assert.equal(rutaGroqFoto_(mime), null, mime);
  });
  assert.equal(rutaGroqFoto_(undefined), null);
  assert.equal(rutaGroqFoto_(null), null);
});

// --- cuerpoGeminiConTextoOcr_ (PDF/álbumes >3 fotos por el OCR de Drive) ---

test('cuerpoGeminiConTextoOcr_ arma un cuerpo de foto con el texto del OCR en vez de la imagen', () => {
  const cuerpo = cuerpoGeminiConTextoOcr_('TOTAL 12.50\nSuper 99', 'efectivo', CATEGORIAS, HOY);
  assert.equal(cuerpo.systemInstruction.parts[0].text, instruccionFoto_(HOY));
  assert.deepEqual(cuerpo.contents[0].parts, [
    { text: 'Texto leído por OCR de la foto (puede tener errores de lectura):\nTOTAL 12.50\nSuper 99' },
    { text: 'efectivo' },
  ]);
  assert.deepEqual(cuerpo.generationConfig, {
    responseMimeType: 'application/json',
    responseJsonSchema: esquemaExtraccion_(CATEGORIAS, false),
  });
});

test('cuerpoGeminiConTextoOcr_ sin leyenda (vacía o solo espacios) no agrega esa parte', () => {
  assert.equal(cuerpoGeminiConTextoOcr_('texto', '', CATEGORIAS, HOY).contents[0].parts.length, 1);
  assert.equal(cuerpoGeminiConTextoOcr_('texto', '   ', CATEGORIAS, HOY).contents[0].parts.length, 1);
  assert.equal(cuerpoGeminiConTextoOcr_('texto', undefined, CATEGORIAS, HOY).contents[0].parts.length, 1);
});

test('cuerpoGeminiConTextoOcr_ lanza si falta el texto del OCR', () => {
  assert.throws(() => cuerpoGeminiConTextoOcr_('', 'x', CATEGORIAS, HOY), /falta el texto del OCR/);
  assert.throws(() => cuerpoGeminiConTextoOcr_(null, 'x', CATEGORIAS, HOY), /falta el texto del OCR/);
  assert.throws(() => cuerpoGeminiConTextoOcr_(undefined, 'x', CATEGORIAS, HOY), /falta el texto del OCR/);
});

test('cuerpoGeminiConTextoOcr_, traducido por cuerpoGroqDesdeGemini_, no lleva ninguna imagen', () => {
  const cuerpo = cuerpoGeminiConTextoOcr_('TOTAL 5.00', 'x', CATEGORIAS, HOY);
  const cuerpoGroq = cuerpoGroqDesdeGemini_(cuerpo);
  assert.ok(cuerpoGroq.messages[1].content.every((p) => p.type === 'text'));
});
