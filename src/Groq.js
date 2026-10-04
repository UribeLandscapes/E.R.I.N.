/**
 * Respaldo de Groq cuando Gemini falla, lógica pura: traducir un cuerpo
 * de generateContent de Gemini (cuerpoFotoGemini_ o cuerpoTextoGemini_) al formato de
 * chat/completions estilo OpenAI que usa Groq, leer su respuesta al mismo formato que Gemini
 * (para que Extraccion.js la lea sin cambios), decidir cuándo saltar o caer a Groq, y armar el
 * cuerpo de un PDF (que Groq no lee) con el texto del OCR de Drive en vez de la imagen. Nunca
 * llama a UrlFetchApp ni a PropertiesService (eso es, GroqApp.js). Usa CONFIG de
 * Config.js; instruccionFoto_ y esquemaExtraccion_ (de Foto.js y Extraccion.js) solo para
 * cuerpoGeminiConTextoOcr_, las mismas instrucciones de foto que ya usa cuerpoFotoGemini_.
 */
const URL_GROQ = 'https://api.groq.com/openai/v1/chat/completions';
// Un solo modelo de Groq (visión) para fotos y texto; límites vistos en
// console.groq.com/docs/rate-limits el 2026-09-28 (30/min, 1000/día, plan gratis).
const MAX_IMAGENES_GROQ = 3;
const MAX_BYTES_IMAGEN_GROQ = 20 * 1024 * 1024;
// Códigos que, si los da Gemini, saltan directo a Groq sin el segundo intento: el modelo
// está saturado (429) o el servicio está caído (503). 500/504/sin conexión sí reintentan hoy.
const CODIGOS_SALTO_GROQ_ = Object.freeze([429, 503]);
// Decisión de diseño: la documentación de Groq (console.groq.com/docs/vision,
// revisada 2026-09-28) no lista los formatos de imagen que acepta ese modelo; solo JPEG aparece en
// los ejemplos. Por prudencia, Groq solo lee JPEG y PNG; una foto WEBP/HEIC/HEIF sigue el camino
// de hoy (OCR + Sí/No) si Gemini falla, igual que sin clave de Groq.
const MIME_IMAGEN_GROQ_PERMITIDOS = Object.freeze(['image/jpeg', 'image/png']);

/** Texto de systemInstruction.parts de Gemini, unido en un solo bloque. */
const textoSistemaGemini_ = (cuerpoGemini) => (((cuerpoGemini.systemInstruction || {}).parts) || [])
  .map((p) => p.text || '').join('\n');

/**
 * Traduce una parte de `contents[user].parts` de Gemini a un bloque de `content` de Groq: una
 * imagen (inlineData) a { type: 'image_url' } en formato data URL, un texto a { type: 'text' }.
 * Lanza si la imagen es PDF (Groq no lo lee:, ese texto sale del OCR de Drive) o si excede
 * MAX_BYTES_IMAGEN_GROQ; `contarImagen` cuenta cuántas imágenes van (para MAX_IMAGENES_GROQ).
 */
function parteGroqDesdeGemini_(parte, contarImagen) {
  if (!parte.inlineData) return { type: 'text', text: parte.text || '' };
  const { mimeType, data } = parte.inlineData;
  if (String(mimeType).toLowerCase() === 'application/pdf') {
    throw new Error('Groq no lee PDF: ese texto debe salir del OCR de Drive, no de esta imagen');
  }
  const bytes = Math.floor((String(data || '').length * 3) / 4);
  if (bytes > MAX_BYTES_IMAGEN_GROQ) {
    throw new Error(`la imagen pesa más de los ${MAX_BYTES_IMAGEN_GROQ} bytes que acepta Groq`);
  }
  contarImagen();
  return { type: 'image_url', image_url: { url: `data:${mimeType};base64,${data}` } };
}

/**
 * Cuerpo de chat/completions de Groq a partir de un cuerpo de generateContent de Gemini (mismas
 * formas que arman cuerpoFotoGemini_ y cuerpoTextoGemini_), sin tocar `cuerpoGemini`. El sistema
 * repite el texto de Gemini más una línea que pide el JSON del mismo esquema (responseJsonSchema);
 * modo JSON (response_format) en vez de json_schema, que Groq no tiene confirmado para este
 * modelo. Lanza (mensaje claro, en español) si faltan partes de usuario, si hay más de
 * MAX_IMAGENES_GROQ imágenes, si alguna pesa de más o si alguna es PDF.
 */
function cuerpoGroqDesdeGemini_(cuerpoGemini) {
  const partesUsuario = (((cuerpoGemini.contents || [])[0] || {}).parts) || [];
  if (!partesUsuario.length) throw new Error('cuerpoGroqDesdeGemini_: falta la parte de usuario');

  let imagenes = 0;
  const contarImagen = () => {
    imagenes += 1;
    if (imagenes > MAX_IMAGENES_GROQ) {
      throw new Error(`Groq acepta hasta ${MAX_IMAGENES_GROQ} imágenes por llamada`);
    }
  };
  const content = partesUsuario.map((parte) => parteGroqDesdeGemini_(parte, contarImagen));

  const esquema = (cuerpoGemini.generationConfig || {}).responseJsonSchema;
  const instruccionJson = `Responde SOLO con un objeto JSON que siga este JSON Schema: `
    + `${JSON.stringify(esquema)}`;

  return {
    model: CONFIG.MODELO_GROQ,
    messages: [
      { role: 'system', content: `${textoSistemaGemini_(cuerpoGemini)}\n${instruccionJson}` },
      { role: 'user', content },
    ],
    response_format: { type: 'json_object' },
  };
}

/**
 * Qué camino sigue Groq para leer una foto ya bajada: 'imagen' (manda la foto tal cual,
 * cuerpoFotoGemini_) si el mimeType es uno de MIME_IMAGEN_GROQ_PERMITIDOS; 'ocr' (Groq no lee PDF:
 * manda el texto del OCR de Drive en su lugar, cuerpoGeminiConTextoOcr_) si es 'application/pdf';
 * null si es una foto que Groq no confirma leer (WEBP/HEIC/HEIF): no se llama a Groq.
 */
function rutaGroqFoto_(mimeType) {
  const mime = String(mimeType || '').toLowerCase();
  if (mime === 'application/pdf') return 'ocr';
  if (MIME_IMAGEN_GROQ_PERMITIDOS.includes(mime)) return 'imagen';
  return null;
}

/**
 * Cuerpo de generateContent con las mismas instrucciones de foto (instruccionFoto_/
 * esquemaExtraccion_, modo foto conIntencion=false) pero con el texto del OCR de Drive en vez de
 * la imagen (PDF, que Groq no lee; ese texto ya lo saca ocrDrive_). `caption`
 * = la leyenda del usuario, igual que cuerpoFotoGemini_. Lanza si falta `textoOcr`.
 */
function cuerpoGeminiConTextoOcr_(textoOcr, caption, categorias, hoy) {
  if (!textoOcr) throw new Error('cuerpoGeminiConTextoOcr_: falta el texto del OCR');
  const textoLeyenda = typeof caption === 'string' ? caption.trim() : '';
  const parts = [{ text: `Texto leído por OCR de la foto (puede tener errores de lectura):\n${textoOcr}` }];
  if (textoLeyenda) parts.push({ text: textoLeyenda });
  return {
    systemInstruction: { parts: [{ text: instruccionFoto_(hoy) }] },
    contents: [{ role: 'user', parts }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseJsonSchema: esquemaExtraccion_(categorias, false),
    },
  };
}

// finish_reason de OpenAI/Groq → finishReason de Gemini, que ya lee Extraccion.js (textoRespuesta_).
const FINISH_REASON_GROQ_A_GEMINI_ = Object.freeze({ stop: 'STOP', length: 'MAX_TOKENS' });

/** Quita un bloque <think>...</think> inicial (modelos razonadores) y una cerca ```json...```. */
function limpiarTextoGroq_(texto) {
  let limpio = String(texto || '').replace(/^\s*<think>[\s\S]*?<\/think>\s*/i, '').trim();
  const cercado = limpio.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (cercado) limpio = cercado[1].trim();
  return limpio;
}

/**
 * Traduce una respuesta de chat/completions de Groq a la forma de generateContent de Gemini que
 * ya lee Extraccion.js (textoRespuesta_/leerExtraccion_): { candidates: [{ finishReason, content:
 * { parts: [{ text }] } }] }. Nunca lanza: cualquier entrada rara (null, sin choices, sin mensaje)
 * da { candidates: [] }, igual que "sin candidatos" en Gemini.
 */
function respuestaGeminiDesdeGroq_(datosGroq) {
  const opcion = datosGroq && typeof datosGroq === 'object' ? (datosGroq.choices || [])[0] : null;
  const contenido = opcion && opcion.message ? opcion.message.content : undefined;
  if (typeof contenido !== 'string') return { candidates: [] };

  const motivo = opcion.finish_reason;
  const finishReason = motivo
    ? (FINISH_REASON_GROQ_A_GEMINI_[motivo] || String(motivo).toUpperCase())
    : 'OTHER';
  return { candidates: [{ finishReason, content: { parts: [{ text: limpiarTextoGroq_(contenido) }] } }] };
}

/**
 * true si, tras esta falla de Gemini, hay que saltar directo a Groq sin el segundo intento a
 * Gemini: HTTP 429 o 503. `intento` es la forma de intentarGemini_ (Gemini.js):
 * { resultado: { codigo, datos } } si respondió, { error } si UrlFetchApp lanzó (sin conexión
 * sigue reintentando hoy, no salta).
 */
function debeSaltarAGroq_(intento) {
  if (!intento || intento.error) return false;
  return CODIGOS_SALTO_GROQ_.includes((intento.resultado || {}).codigo);
}

/**
 * true si el resultado FINAL de Gemini (tras sus reintentos) debe caer a Groq:
 * `error` truthy (sin conexión), cualquier `resultado.codigo` distinto de 200, o un 200 cuya
 * `lectura` (el { ok,... } de leerExtraccion_ sobre esa respuesta) vino con ok:false.
 */
function geminiFallo_({ resultado, error } = {}, lectura) {
  if (error || !resultado) return true;
  if (resultado.codigo !== 200) return true;
  return Boolean(lectura) && lectura.ok === false;
}

/** Línea de log (solo la ve el administrador): "Gemini falló (<motivo>) → leyó Groq". */
const lineaRastroGroq_ = (motivoGemini) => `Gemini falló (${motivoGemini}) → leyó Groq`;

if (typeof module !== 'undefined') {
  module.exports = {
    URL_GROQ, MAX_IMAGENES_GROQ, MAX_BYTES_IMAGEN_GROQ, CODIGOS_SALTO_GROQ_, MIME_IMAGEN_GROQ_PERMITIDOS,
    cuerpoGroqDesdeGemini_, respuestaGeminiDesdeGroq_, debeSaltarAGroq_, geminiFallo_, lineaRastroGroq_,
    rutaGroqFoto_, cuerpoGeminiConTextoOcr_,
  };
}
