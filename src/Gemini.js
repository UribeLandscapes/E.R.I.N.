/**
 * Acceso a Gemini (generateContent, sin estado). La clave va solo en la cabecera
 * x-goog-api-key: nunca en la URL ni en el registro. Usa debeSaltarAGroq_ de Groq.js.
 */
const URL_GEMINI = 'https://generativelanguage.googleapis.com/v1beta';
const LARGO_MAX_ERROR = 200;

const ESQUEMA_PRUEBA = Object.freeze({
  type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'],
});

// La documentación actual ya no muestra los campos de generateContent: se prueban en vivo.
const VARIANTES_SALIDA = Object.freeze([
  {
    nombre: 'responseFormat',
    generationConfig: { responseFormat: { text: { mimeType: 'application/json', schema: ESQUEMA_PRUEBA } } },
  },
  {
    nombre: 'responseMimeType+responseJsonSchema',
    generationConfig: { responseMimeType: 'application/json', responseJsonSchema: ESQUEMA_PRUEBA },
  },
  {
    nombre: 'responseMimeType+responseSchema',
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: { type: 'OBJECT', properties: { ok: { type: 'BOOLEAN' } }, required: ['ok'] },
    },
  },
]);

function revisarModelos_(lista, ids) {
  const modelos = (lista && lista.models) || [];
  const lineas = ids.map((id) => {
    const encontrado = modelos.find((m) => m.name === `models/${id}`);
    if (!encontrado) return `Modelo ${id}: falta`;
    const metodos = encontrado.supportedGenerationMethods || [];
    if (!metodos.includes('generateContent')) return `Modelo ${id}: existe, pero no acepta generateContent`;
    return `Modelo ${id}: existe, acepta generateContent`;
  });
  return { ok: lineas.every((l) => l.endsWith(': existe, acepta generateContent')), lineas };
}

function leerRespuestaPrueba_(respuesta) {
  const partes = (((respuesta.candidates || [])[0] || {}).content || {}).parts || [];
  const texto = partes.map((p) => p.text || '').join('');
  if (!texto) return { ok: false, detalle: 'respuesta sin texto' };
  try {
    const datos = JSON.parse(texto);
    if (typeof datos.ok !== 'boolean') return { ok: false, detalle: 'JSON sin "ok" booleano' };
    return { ok: true, detalle: `JSON válido ${JSON.stringify(datos)}` };
  } catch (error) {
    return { ok: false, detalle: 'el texto no es JSON' };
  }
}

function llamarGemini_(clave, ruta, cuerpo) {
  const opciones = { headers: { 'x-goog-api-key': clave }, muteHttpExceptions: true };
  if (cuerpo) Object.assign(opciones, { method: 'post', contentType: 'application/json', payload: JSON.stringify(cuerpo) });
  const respuesta = UrlFetchApp.fetch(`${URL_GEMINI}${ruta}`, opciones);
  const codigo = respuesta.getResponseCode();
  let datos = {};
  try {
    datos = JSON.parse(respuesta.getContentText());
  } catch (error) {
    datos = {};
  }
  return { codigo, datos };
}

function describirError_({ codigo, datos }) {
  const mensaje = String((datos.error && datos.error.message) || 'sin detalle').slice(0, LARGO_MAX_ERROR);
  return `HTTP ${codigo}: ${mensaje}`;
}

// "el modelo está saturado" (alta demanda) o una falla momentánea del servicio de
// Gemini, no del pedido en sí (eso sería 400/401/403/404, que nunca se reintentan).
const CODIGOS_TRANSITORIOS_ = Object.freeze([429, 500, 503, 504]);
const ESPERA_REINTENTO_MS = 2000;

/** Utilities.sleep de verdad, salvo que una prueba lo cambie (tercer argumento de la función de abajo). */
const dormirReintento_ = (ms) => Utilities.sleep(ms);

/** Un intento de generateContent: { resultado } si respondió, o { error } si UrlFetchApp lanzó. */
function intentarGemini_(clave, modelo, armarCuerpo) {
  try {
    return { resultado: llamarGemini_(clave, `/models/${modelo}:generateContent`, armarCuerpo(modelo)) };
  } catch (error) {
    return { error };
  }
}

/** true si ese intento (conexión caída o el código HTTP) vale la pena reintentar. */
const esTransitorio_ = ({ resultado, error }) => Boolean(error) || CODIGOS_TRANSITORIOS_.includes(resultado.codigo);

/** Termina el intento: relanza si UrlFetchApp lanzó, o devuelve el { codigo, datos } de la respuesta. */
function resolverIntento_({ resultado, error }) {
  if (error) throw error;
  return resultado;
}

/**
 * generateContent con reintentos ante una falla transitoria: un pedido con alta
 * demanda (HTTP 429/500/503/504) o sin conexión (UrlFetchApp lanza) se reintenta una vez con el
 * mismo `modelo` y, si sigue fallando, una vez con CONFIG.MODELO_RELECTURA (salvo que `modelo` ya
 * fuera ese). Un código no transitorio (400, 401, 403, 404…) nunca se reintenta: se devuelve tal
 * cual, como hacía llamarGemini_ antes. Mismo contrato que llamarGemini_: devuelve
 * { codigo, datos } o lanza (solo si el último intento se quedó sin conexión). `armarCuerpo(modelo)`
 * arma el payload de ese intento (varía el modelo dentro del cuerpo si hiciera falta); `dormir`
 * (opcional, para pruebas) reemplaza a Utilities.sleep. `hayGroq` (opcional,: true solo
 * si hay GROQ_API_KEY configurada) salta directo al respaldo de Groq sin el segundo intento a
 * Gemini cuando el primero da debeSaltarAGroq_ (Groq.js: HTTP 429/503), para que el usuario no
 * espere de más; sin `hayGroq` (o sin clave de Groq) el comportamiento es EXACTAMENTE el de hoy.
 */
function llamarGeminiConReintento_(clave, modelo, armarCuerpo, dormir, hayGroq) {
  const esperar = dormir || dormirReintento_;
  const avisar = (modeloIntento, intento) => {
    const motivo = intento.error ? 'sin conexión' : `HTTP ${intento.resultado.codigo}`;
    console.warn(`Gemini ${modeloIntento}: ${motivo}, reintenta`);
  };

  let intento = intentarGemini_(clave, modelo, armarCuerpo);
  if (!esTransitorio_(intento)) return resolverIntento_(intento);
  if (hayGroq && debeSaltarAGroq_(intento)) return resolverIntento_(intento);

  avisar(modelo, intento);
  esperar(ESPERA_REINTENTO_MS);
  intento = intentarGemini_(clave, modelo, armarCuerpo);
  if (!esTransitorio_(intento)) return resolverIntento_(intento);

  if (modelo !== CONFIG.MODELO_RELECTURA) {
    avisar(modelo, intento);
    esperar(ESPERA_REINTENTO_MS);
    intento = intentarGemini_(clave, CONFIG.MODELO_RELECTURA, armarCuerpo);
  }
  return resolverIntento_(intento);
}

function probarVariante_(clave, modeloId, variante) {
  const cuerpo = {
    contents: [{ role: 'user', parts: [{ text: 'Responde solo con {"ok": true}.' }] }],
    generationConfig: variante.generationConfig,
  };
  const resultado = llamarGemini_(clave, `/models/${modeloId}:generateContent`, cuerpo);
  if (resultado.codigo !== 200) return { ok: false, detalle: describirError_(resultado) };
  return leerRespuestaPrueba_(resultado.datos);
}

function lineaVariante_(modeloId, variante, r) {
  return `${modeloId} con ${variante.nombre}: ${r.ok ? 'ok' : 'falla'} (${r.detalle})`;
}

/**
 * Ejecutar desde el editor. Confirma que los modelos de CONFIG existen y qué campo
 * de salida estructurada acepta generateContent. Gasta 3 llamadas del modelo principal y 1 del de relectura.
 */
function probarGemini() {
  const clave = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!clave) {
    Logger.log('GEMINI_API_KEY: falta (ejecuta verificarPropiedades)');
    return false;
  }
  const lineas = [];
  const lista = llamarGemini_(clave, '/models?pageSize=1000');
  const modelos = lista.codigo === 200
    ? revisarModelos_(lista.datos, [CONFIG.MODELO_PRINCIPAL, CONFIG.MODELO_RELECTURA])
    : { ok: false, lineas: [`Lista de modelos: falla (${describirError_(lista)})`] };
  lineas.push(...modelos.lineas);

  const resultados = VARIANTES_SALIDA.map((v) => ({ v, r: probarVariante_(clave, CONFIG.MODELO_PRINCIPAL, v) }));
  resultados.forEach(({ v, r }) => lineas.push(lineaVariante_(CONFIG.MODELO_PRINCIPAL, v, r)));
  const ganadora = resultados.find(({ r }) => r.ok);
  if (!ganadora) {
    lineas.push('Ninguna variante funcionó');
    lineas.forEach((l) => Logger.log(l));
    return false;
  }
  lineas.push(`Usar: ${ganadora.v.nombre}`);
  const relectura = probarVariante_(clave, CONFIG.MODELO_RELECTURA, ganadora.v);
  lineas.push(lineaVariante_(CONFIG.MODELO_RELECTURA, ganadora.v, relectura));
  lineas.forEach((l) => Logger.log(l));
  return modelos.ok && relectura.ok;
}

if (typeof module !== 'undefined') {
  module.exports = {
    URL_GEMINI, VARIANTES_SALIDA, revisarModelos_, leerRespuestaPrueba_, probarGemini,
    llamarGemini_, describirError_, CODIGOS_TRANSITORIOS_, ESPERA_REINTENTO_MS, llamarGeminiConReintento_,
  };
}
