/**
 * Capa de app del respaldo de Groq. Manda la llamada de verdad a Groq
 * (UrlFetchApp) y decide si vale la pena intentarla tras una falla FINAL de Gemini, con el mismo
 * cuerpo que se le mandó a Gemini. FotoApp.js y MensajesApp.js llaman a llamarConRespaldoGroq_ en
 * vez de armar el intento de Gemini a mano. `probarGroq` es el equivalente de probarGemini
 * (Gemini.js) para el editor. Usa cuerpoGroqDesdeGemini_, respuestaGeminiDesdeGroq_, geminiFallo_,
 * rutaGroqFoto_ y lineaRastroGroq_ de Groq.js; leerExtraccion_ de Extraccion.js; CONFIG de
 * Config.js.
 *
 * IMPORTANTE (seguridad): la clave de Groq va solo en la cabecera Authorization; nunca se registra
 * (tampoco el texto de un error de red, que en teoría podría traerla, como en FotoApp.js).
 */
const LARGO_MAX_ERROR_GROQ_ = 200;

/** Una llamada de verdad a chat/completions de Groq; mismo contrato que llamarGemini_ (Gemini.js). */
function llamarGroq_(clave, cuerpo) {
  const opciones = {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: `Bearer ${clave}` },
    payload: JSON.stringify(cuerpo),
    muteHttpExceptions: true,
  };
  const respuesta = UrlFetchApp.fetch(URL_GROQ, opciones);
  const codigo = respuesta.getResponseCode();
  let datos = {};
  try {
    datos = JSON.parse(respuesta.getContentText());
  } catch (error) {
    datos = {};
  }
  return { codigo, datos };
}

/**
 * Intenta leer `cuerpoGemini` con Groq tras una falla FINAL de Gemini. Nunca lanza:
 * sin `claveGroq`, sin `cuerpoGemini` (una foto que Groq no confirma leer, o el OCR que
 * armó `cuerpoGeminiConTextoOcr_` no estaba disponible), con un HTTP != 200 o con una lectura que
 * no pasó la validación de leerExtraccion_ (esquema, campos) devuelve null y el llamador sigue con
 * la falla original de Gemini. Con éxito deja el rastro que solo ve el administrador (el log
 * de Apps Script) y devuelve la lectura { ok: true, datos }.
 */
function intentarGroq_(claveGroq, cuerpoGemini, categoriasClase, conIntencion, motivoGemini) {
  if (!claveGroq || !cuerpoGemini) return null;
  let cuerpoGroq;
  try {
    cuerpoGroq = cuerpoGroqDesdeGemini_(cuerpoGemini);
  } catch (error) {
    console.warn(`Groq: no se pudo armar el pedido (${(error && error.message) || 'motivo desconocido'})`);
    return null;
  }
  let resultado;
  try {
    resultado = llamarGroq_(claveGroq, cuerpoGroq);
  } catch (error) {
    // Nunca el texto del error tal cual: UrlFetchApp podría repetir la URL o algo del pedido.
    console.warn('Groq: no se pudo conectar');
    return null;
  }
  if (resultado.codigo !== 200) {
    console.warn(`Groq: HTTP ${resultado.codigo}`);
    return null;
  }
  const leido = leerExtraccion_(respuestaGeminiDesdeGroq_(resultado.datos), categoriasClase, conIntencion);
  if (!leido.ok) {
    console.warn(`Groq: respuesta inválida (${leido.motivo})`);
    return null;
  }
  console.log(lineaRastroGroq_(motivoGemini));
  return leido;
}

/**
 * El motivo corto de una falla FINAL de Gemini, para lineaRastroGroq_ y para el `motivo`
 * que devuelve el llamador si Groq también falla.
 */
function motivoGeminiFallo_(intento, lectura) {
  if (intento.error) return 'sin conexión';
  if (intento.resultado.codigo !== 200) return `HTTP ${intento.resultado.codigo}`;
  return (lectura && lectura.motivo) || 'respuesta inválida';
}

/**
 * Un intento de Gemini con respaldo de Groq: llama a Gemini con `armarLlamada` (mismo
 * contrato que intentarGemini_/llamarGeminiConReintento_: puede lanzar o devolver {codigo, datos})
 * y, si el resultado FINAL falla (geminiFallo_), intenta Groq con el cuerpo de `armarCuerpoGemini`
 * (solo se arma si hace falta, para no gastar de más armando un cuerpo que no se va a usar; si
 * `armarCuerpoGemini` lanza, se salta Groq igual que sin cuerpo) antes de rendirse. Nunca lanza. Devuelve { intento, lectura, groq }: `lectura` es la de leerExtraccion_
 * sobre la respuesta de Gemini si respondió 200 (undefined si no), `groq` es la lectura de Groq si
 * tuvo éxito o null. FotoApp.js y MensajesApp.js deciden con esto qué motivo devolver si ninguno
 * de los dos sirvió.
 */
function llamarConRespaldoGroq_(armarLlamada, armarCuerpoGemini, categoriasClase, conIntencion, claveGroq) {
  let intento;
  try {
    intento = { resultado: armarLlamada() };
  } catch (error) {
    intento = { error };
  }
  const lectura = intento.resultado && intento.resultado.codigo === 200
    ? leerExtraccion_(intento.resultado.datos, categoriasClase, conIntencion) : undefined;
  if (!geminiFallo_(intento, lectura) || !claveGroq) return { intento, lectura, groq: null };
  const motivo = motivoGeminiFallo_(intento, lectura);
  let cuerpoGemini = null;
  try {
    cuerpoGemini = armarCuerpoGemini();
  } catch (error) {
    cuerpoGemini = null;
  }
  const groq = intentarGroq_(claveGroq, cuerpoGemini, categoriasClase, conIntencion, motivo);
  return { intento, lectura, groq };
}

/**
 * Ejecutar desde el editor, como probarGemini: confirma que GROQ_API_KEY existe y que
 * CONFIG.MODELO_GROQ responde en modo JSON. Nunca registra la clave.
 */
function probarGroq() {
  const clave = PropertiesService.getScriptProperties().getProperty('GROQ_API_KEY');
  if (!clave) {
    Logger.log('GROQ_API_KEY: falta (opcional; sin ella el respaldo de Groq queda apagado)');
    return false;
  }
  const cuerpo = {
    model: CONFIG.MODELO_GROQ,
    messages: [{ role: 'user', content: 'Responde solo con este JSON: {"ok": true}.' }],
    response_format: { type: 'json_object' },
  };
  let resultado;
  try {
    resultado = llamarGroq_(clave, cuerpo);
  } catch (error) {
    Logger.log(`Groq: falla (${(error && error.message) || error})`);
    return false;
  }
  if (resultado.codigo !== 200) {
    const mensaje = String(JSON.stringify(resultado.datos)).slice(0, LARGO_MAX_ERROR_GROQ_);
    Logger.log(`Groq (${CONFIG.MODELO_GROQ}): HTTP ${resultado.codigo} (${mensaje})`);
    return false;
  }
  const texto = ((((respuestaGeminiDesdeGroq_(resultado.datos).candidates || [])[0] || {}).content || {}).parts || [])[0];
  const contenido = texto ? texto.text : '';
  try {
    const datos = JSON.parse(contenido);
    if (datos.ok !== true) {
      Logger.log(`Groq (${CONFIG.MODELO_GROQ}): respondió, pero sin "ok":true (${contenido})`);
      return false;
    }
  } catch (error) {
    Logger.log(`Groq (${CONFIG.MODELO_GROQ}): respondió, pero el texto no es JSON (${contenido})`);
    return false;
  }
  Logger.log(`Groq (${CONFIG.MODELO_GROQ}): ok, modo JSON confirmado`);
  return true;
}

if (typeof module !== 'undefined') {
  module.exports = {
    llamarGroq_, intentarGroq_, motivoGeminiFallo_, llamarConRespaldoGroq_, probarGroq,
  };
}
