/**
 * Capa Apps Script: recibe los updates de Telegram (doPost), evita atender dos veces
 * el mismo update_id y registra o revisa el webhook. Las decisiones puras salen de Webhook.js.
 * Ni el token ni el secreto aparecen en el registro de ejecución.
 */
const PREFIJO_CACHE_UPDATE = 'update:';
const PREFIJO_CACHE_AVISO = 'aviso:'; // ya se avisó al usuario que esta no se leyó
// Cuántos avisos van enviados de un álbum (message.media_group_id), para encadenar el texto.
const PREFIJO_CACHE_ALBUM = 'album:';
const SEGUNDOS_CACHE_UPDATE = 21600; // 6 h, el máximo de CacheService
// Un álbum manda 5-10 fotos a la vez y cada una espera el candado; 240 s deja ~2 min
// de los 6 min que da Apps Script para que la foto que sí tomó el candado termine de procesarse.
const ESPERA_CANDADO_MS = 240000;
// Un botón no puede esperar 240 s; Telegram deja de aceptar la respuesta del botón en
// segundos. 8 s deja margen para answerCallbackQuery antes de que venza.
const ESPERA_CANDADO_BOTON_MS = 8000;
// Candado corto solo para ordenar los avisos de un mismo álbum (no el de todo el script).
const ESPERA_CANDADO_AVISO_MS = 20000;
const TIPO_ESTADO_UPDATE = 'UPDATE';
// yaVisto_ solo mira las últimas filas de _ESTADO (~40 días a ~50 updates al día).
const FILAS_REVISADAS_UPDATE = 2000;
const URL_TELEGRAM = 'https://api.telegram.org/bot';
const AVISO_SIN_TOKEN = 'falta TELEGRAM_TOKEN (ejecuta verificarPropiedades)';

/** POST JSON a la Bot API. Devuelve { codigo, datos }; un error nunca lleva la URL (tiene el token). */
function llamarTelegram_(token, metodo, cuerpo) {
  let respuesta;
  try {
    respuesta = UrlFetchApp.fetch(`${URL_TELEGRAM}${token}/${metodo}`, {
      method: 'post', contentType: 'application/json', payload: JSON.stringify(cuerpo || {}), muteHttpExceptions: true,
    });
  } catch (error) {
    throw new Error(`Telegram ${metodo}: no se pudo conectar`);
  }
  let datos = {};
  try {
    datos = JSON.parse(respuesta.getContentText()) || {};
  } catch (error) {
    datos = {};
  }
  return { codigo: respuesta.getResponseCode(), datos };
}

const detalleTelegram_ = ({ codigo, datos }) => `HTTP ${codigo} — ${datos.description || 'sin detalle'}`;

/**
 * Baja el blob de una URL de archivo de Telegram. `url` lleva el token del bot: el
 * error nunca la incluye, ni siquiera si UrlFetchApp la trae en su propio mensaje.
 */
function descargarBlobTelegram_(url) {
  const respuesta = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (respuesta.getResponseCode() !== 200) throw new Error('no se pudo bajar el archivo de Telegram');
  return respuesta.getBlob();
}

/** ¿Ya se atendió este update_id? Primero la caché; si se perdió, las filas UPDATE de _ESTADO. */
function yaVisto_(id, cache, hoja) {
  if (cache.get(PREFIJO_CACHE_UPDATE + id) !== null) return true;
  const ultima = hoja.getLastRow();
  const filas = Math.min(ultima - 1, FILAS_REVISADAS_UPDATE);
  if (filas < 1) return false;
  // Solo las últimas filas y solo las columnas TIPO y CLAVE (contiguas).
  const iTipo = COLUMNAS_ESTADO.indexOf('TIPO');
  const iClave = COLUMNAS_ESTADO.indexOf('CLAVE');
  return hoja.getRange(ultima - filas + 1, iTipo + 1, filas, iClave - iTipo + 1).getValues()
    .some((f) => f[0] === TIPO_ESTADO_UPDATE && String(f[iClave - iTipo]) === String(id));
}

// appendRow está bien aquí: la regla de no usarlo es para las pestañas de mes.
function marcarVisto_(id, cache, hoja, fecha) {
  const valores = { CREADO: fecha, TIPO: TIPO_ESTADO_UPDATE, CLAVE: id, ESTADO: 'VISTO' };
  hoja.appendRow(COLUMNAS_ESTADO.map((c) => (c in valores ? valores[c] : '')));
  cache.put(PREFIJO_CACHE_UPDATE + id, '1', SEGUNDOS_CACHE_UPDATE);
}

/** Un mensaje pasa por Gemini y la lógica de texto; un botón, por el conteo (MensajesApp.js). */
function atenderUpdate_(update, deps, hojaEstado) {
  if (!deps.token) throw new Error(AVISO_SIN_TOKEN);
  if (update.message) atenderMensaje_(update.message, deps, hojaEstado);
  else atenderBoton_(update.callback_query, deps, hojaEstado);
}

/** 1er aviso de la foto (o cualquier foto suelta), 2do, 3ro y siguientes del mismo álbum. */
function textoAvisoAlbum_(n) {
  if (n === 0) return TEXTO_SIN_CANDADO_FOTO;
  return n === 1 ? TEXTO_SIN_CANDADO_FOTO_2 : TEXTO_SIN_CANDADO_FOTO_3;
}

/** Manda el aviso sin candado a la foto/mensaje puntual; el error nunca lleva token ni URL. */
function enviarAvisoSinCandado_(deps, mensaje, texto, id) {
  try {
    if (!deps.token) throw new Error(AVISO_SIN_TOKEN);
    const resultado = deps.llamar(deps.token, 'sendMessage', {
      chat_id: mensaje.chat.id, text: texto, reply_parameters: { message_id: mensaje.message_id },
    });
    if (resultado.datos.ok !== true) throw new Error('Telegram no confirmó el aviso');
  } catch (error) {
    throw new Error(`aviso sin candado: no se pudo avisar del update ${id}`);
  }
}

/**
 * Intenta tomar el candado corto de avisos (solo ordena, no es el candado del script).
 * Si LockService truena o no se puede tomar, devuelve null: el llamador avisa sin orden.
 */
function tomarCandadoAviso_(deps) {
  try {
    const candado = deps.candadoAvisos();
    return candado && candado.tryLock(ESPERA_CANDADO_AVISO_MS) ? candado : null;
  } catch (error) {
    return null;
  }
}

/**
 * Una foto/documento de un álbum (media_group_id). Con el candado de avisos se numera el
 * texto (1a, 2a, 3a...); sin él, se avisa igual pero sin orden (podría repetir el texto de la 1a).
 */
function avisarFotoDeAlbum_(mensaje, id, gid, deps) {
  const candado = tomarCandadoAviso_(deps);
  if (!candado) {
    enviarAvisoSinCandado_(deps, mensaje, TEXTO_SIN_CANDADO_FOTO, id);
    deps.cache.put(PREFIJO_CACHE_AVISO + id, '1', SEGUNDOS_CACHE_UPDATE);
    return `sin candado, aviso enviado sin orden (update ${id})`;
  }
  try {
    if (deps.cache.get(PREFIJO_CACHE_AVISO + id) !== null) return `sin candado, aviso ya enviado (update ${id})`;
    const n = Number(deps.cache.get(PREFIJO_CACHE_ALBUM + gid)) || 0;
    enviarAvisoSinCandado_(deps, mensaje, textoAvisoAlbum_(n), id);
    deps.cache.put(PREFIJO_CACHE_AVISO + id, '1', SEGUNDOS_CACHE_UPDATE);
    deps.cache.put(PREFIJO_CACHE_ALBUM + gid, String(n + 1), SEGUNDOS_CACHE_UPDATE);
    return `sin candado, aviso enviado (update ${id})`;
  } finally {
    candado.releaseLock();
  }
}

/**
 * El botón tocado con el candado ocupado se contesta con un aviso corto; el botón
 * sigue ahí y tocarlo otra vez funciona. No escribe nada. El error nunca lleva token ni URL.
 */
function avisarBotonSinCandado_(update, deps) {
  const id = update.update_id;
  try {
    if (!deps.token) throw new Error(AVISO_SIN_TOKEN);
    const resultado = deps.llamar(deps.token, 'answerCallbackQuery', {
      callback_query_id: update.callback_query.id, text: TEXTO_SIN_CANDADO_BOTON,
    });
    if (resultado.datos.ok !== true) throw new Error('Telegram no confirmó el aviso');
  } catch (error) {
    throw new Error(`aviso sin candado: no se pudo avisar del botón del update ${id}`);
  }
  return `sin candado, botón avisado (update ${id})`;
}

/**
 * El candado se ocupó (álbum en curso). Un botón se contesta; un mensaje se avisa sin el candado, una sola vez, para que el usuario lo vuelva a mandar.
 * Una foto/documento con media_group_id encadena el texto según cuántas van avisadas.
 */
function avisarSinCandado_(update, deps) {
  const id = update.update_id;
  if (update.callback_query) return avisarBotonSinCandado_(update, deps);
  const mensaje = update.message;
  if (deps.cache.get(PREFIJO_CACHE_UPDATE + id) !== null) return `sin candado, ya atendido (update ${id})`;
  if (deps.cache.get(PREFIJO_CACHE_AVISO + id) !== null) return `sin candado, aviso ya enviado (update ${id})`;
  const esFoto = Boolean(mensaje.photo || mensaje.document);
  if (esFoto && mensaje.media_group_id) return avisarFotoDeAlbum_(mensaje, id, mensaje.media_group_id, deps);
  const texto = esFoto ? TEXTO_SIN_CANDADO_FOTO : TEXTO_SIN_CANDADO_MENSAJE;
  enviarAvisoSinCandado_(deps, mensaje, texto, id);
  deps.cache.put(PREFIJO_CACHE_AVISO + id, '1', SEGUNDOS_CACHE_UPDATE);
  return `sin candado, aviso enviado (update ${id})`;
}

/**
 * Atender falló con un mensaje; se intenta avisar al usuario UNA vez. Si el aviso también
 * falla solo se registra (sin token ni URL): el error original es el que importa.
 */
function avisarFalloMensaje_(update, deps) {
  try {
    if (!update.message || !deps.token) return;
    const resultado = deps.llamar(deps.token, 'sendMessage', {
      chat_id: update.message.chat.id, text: TEXTO_FALLO_MENSAJE,
      reply_parameters: { message_id: update.message.message_id },
    });
    if (resultado.datos.ok !== true) throw new Error('Telegram no confirmó el aviso');
  } catch (error) {
    console.error(`webhook: no se pudo avisar del fallo del update ${update.update_id}`);
  }
}

/**
 * Orden: revisar → candado → ¿visto? → marcar visto → atender. Consulta, marca y atención
 * comparten el aviso de fallo para mensajes; el error original se conserva. Devuelve el texto.
 */
function procesarUpdate_(e, deps) {
  const revision = revisarUpdate_(e, deps.secreto, deps.chatId);
  if (!revision.ok) return `rechazado: ${revision.motivo}`;
  const id = revision.update.update_id;
  const espera = revision.update.callback_query ? ESPERA_CANDADO_BOTON_MS : ESPERA_CANDADO_MS;
  if (!deps.candado.tryLock(espera)) return avisarSinCandado_(revision.update, deps);
  try {
    const hoja = deps.hojaEstado();
    if (!hoja) throw new Error(`falta la pestaña ${PESTANA_ESTADO} (ejecuta configurarHoja)`);
    if (yaVisto_(id, deps.cache, hoja)) return `repetido (update ${id})`;
    marcarVisto_(id, deps.cache, hoja, deps.ahora());
    atenderUpdate_(revision.update, deps, hoja);
    return `atendido (update ${id})`;
  } catch (error) {
    avisarFalloMensaje_(revision.update, deps);
    throw error;
  } finally {
    deps.candado.releaseLock();
  }
}

function dependenciasReales_() {
  const propiedades = PropertiesService.getScriptProperties();
  // El libro se abre una sola vez por update (lo piden la pestaña _ESTADO).
  let libroAbierto = null;
  const libro = () => {
    if (!libroAbierto) libroAbierto = SpreadsheetApp.openById(CONFIG.SHEET_ID);
    return libroAbierto;
  };
  return {
    propiedades,
    secreto: propiedades.getProperty('WEBHOOK_SECRET'),
    token: propiedades.getProperty('TELEGRAM_TOKEN'),
    claveGemini: propiedades.getProperty('GEMINI_API_KEY'),
    // Respaldo de Groq si Gemini falla; opcional (null = apagado, mismo camino de hoy).
    claveGroq: propiedades.getProperty('GROQ_API_KEY'),
    chatId: CONFIG.ERIN_CHAT_ID,
    candado: LockService.getScriptLock(),
    // Candado corto solo para ordenar los avisos de un álbum; getUserLock puede tronar
    // en el contexto del webhook, por eso es una función y no el candado ya tomado.
    candadoAvisos: () => LockService.getUserLock(),
    cache: CacheService.getScriptCache(),
    libro,
    hojaEstado: () => libro().getSheetByName(PESTANA_ESTADO),
    llamar: llamarTelegram_,
    obtenerJson: obtenerJsonRed_,
    formatear: (fecha, formato) => Utilities.formatDate(fecha, CONFIG.TIMEZONE, formato),
    ahora: () => new Date(),
    sello: () => Utilities.formatDate(new Date(), CONFIG.TIMEZONE, FORMATO_SELLO),
    // Bajar la foto, pasarla a base64 para Gemini y la carpeta raíz de Facturas.
    descargar: descargarBlobTelegram_,
    base64: (blob) => Utilities.base64Encode(blob.getBytes()),
    carpetaFacturas: () => DriveApp.getFolderById(CONFIG.FACTURAS_FOLDER_ID),
    // La foto que quedó en "Por clasificar" mientras el usuario elegía la fecha.
    archivoPorId: (id) => DriveApp.getFileById(id),
    // La foto de una factura repetida se manda a la papelera de Drive (30 días para recuperarla).
    aPapelera: (id) => DriveApp.getFileById(id).setTrashed(true),
    // El OCR de Drive del respaldo sin Gemini. Nunca lanza.
    ocr: (blob, raiz) => ocrDrive_(blob, raiz, serviciosOcr_()),
  };
}

/**
 * Telegram llama aquí. Siempre devuelve HTML vacío (ContentService daría un 302 que Telegram
 * reintenta). Nunca se registra el evento: su URL trae ?k=<secreto>.
 */
function doPost(e) {
  const aviso = avisoConfigIncompleta_(CONFIG);
  if (aviso) {
    // Responde OK para que Telegram no reintente, pero no procesa nada con la configuración a medias.
    console.error(`webhook: ${aviso}`);
    return HtmlService.createHtmlOutput('');
  }
  try {
    console.log(`webhook: ${procesarUpdate_(e, dependenciasReales_())}`);
  } catch (error) {
    console.error(`webhook: ${ocultarSecreto_(error.message)}`);
  }
  return HtmlService.createHtmlOutput('');
}

/** Ejecutar desde el editor, después de pegar la URL /exec en CONFIG.WEBAPP_URL. */
function registrarWebhook(urlApp = CONFIG.WEBAPP_URL) {
  exigirConfigCompleta_(CONFIG);
  const propiedades = PropertiesService.getScriptProperties();
  const token = propiedades.getProperty('TELEGRAM_TOKEN');
  let linea;
  let ok = false;
  try {
    if (!token) throw new Error(AVISO_SIN_TOKEN);
    const url = urlWebhook_(urlApp, propiedades.getProperty('WEBHOOK_SECRET'));
    const resultado = llamarTelegram_(token, 'setWebhook', cuerpoSetWebhook_(url));
    ok = resultado.datos.ok === true;
    linea = ok ? `setWebhook: ok (${resultado.datos.description || 'sin detalle'})`
      : `setWebhook: falla (${detalleTelegram_(resultado)})`;
  } catch (error) {
    linea = `setWebhook: no se llamó (${error.message})`;
  }
  Logger.log(ocultarSecreto_(linea));
  return ok;
}

/** Ejecutar desde el editor: estado del webhook según Telegram (pendientes, último error). */
function verWebhook() {
  const token = PropertiesService.getScriptProperties().getProperty('TELEGRAM_TOKEN');
  let lineas = [AVISO_SIN_TOKEN];
  if (token) {
    const resultado = llamarTelegram_(token, 'getWebhookInfo');
    lineas = resultado.datos.ok ? lineasWebhook_(resultado.datos.result)
      : [`getWebhookInfo: falla (${detalleTelegram_(resultado)})`];
  }
  lineas.forEach((linea) => Logger.log(linea));
  return lineas;
}

if (typeof module !== 'undefined') {
  module.exports = {
    PREFIJO_CACHE_UPDATE, PREFIJO_CACHE_AVISO, PREFIJO_CACHE_ALBUM, SEGUNDOS_CACHE_UPDATE,
    ESPERA_CANDADO_MS, ESPERA_CANDADO_BOTON_MS, ESPERA_CANDADO_AVISO_MS, TIPO_ESTADO_UPDATE, AVISO_SIN_TOKEN, FILAS_REVISADAS_UPDATE,
    llamarTelegram_, detalleTelegram_, yaVisto_, marcarVisto_, atenderUpdate_, avisarSinCandado_,
    textoAvisoAlbum_, procesarUpdate_, doPost, registrarWebhook, verWebhook, dependenciasReales_,
  };
}
