/**
 * Capa de app del respaldo sin Gemini. Hace el OCR de la foto con Drive,
 * deja la entrada POR-PROCESAR en `_ESTADO`, le propone el total al usuario y escribe la fila cuando
 * ella lo confirma (botón "Sí" o el monto escrito, SIN Gemini). Vive aparte de MensajesApp.js y de
 * MensajesFoto.js solo por tamaño.
 * Usa todo lo puro de PorProcesar.js; carpetaHija_ y CARPETA_POR_CLASIFICAR de CarpetasApp.js;
 * guardarPregunta_ y celdaEstado_ de EscrituraApp.js; filasEstado_ de BotonesApp.js;
 * enviarTelegram_, quitarBotones_, respuestaFechaAtendida_, resumenHoja_, contextoTexto_ y
 * registrarPlan_ de MensajesApp.js; moverFotoDelPlan_ de MensajesFoto.js; confirmacionFoto_ de
 * Foto.js; COLUMNAS_ESTADO de Hoja.js; PREGUNTA_ABIERTA de Escritura.js; CONFIG de Config.js.
 *
 * IMPORTANTE (seguridad): el token de OAuth viaja solo en la cabecera Authorization del export.
 * Ningún `motivo` ni registro de este archivo lleva el token ni la URL de export.
 */
// Drive convierte la imagen a Google Doc y, al convertirla, le hace OCR (guía de subidas de Drive).
const MIME_DOC_GOOGLE = 'application/vnd.google-apps.document';
const IDIOMA_OCR = 'es';
const URL_EXPORTAR_DRIVE = 'https://www.googleapis.com/drive/v3/files/';
const NOMBRE_DOC_OCR = 'ocr-temporal';
const MOTIVO_OCR_FALLO = 'no se pudo hacer el OCR de la foto en Drive';
const LARGO_MUESTRA_OCR = 400;

/** Los servicios de Google que usa el OCR, juntos para poder probar sin Drive ni red. */
const serviciosOcr_ = () => ({
  crearDoc: (recurso, blob, opciones) => Drive.Files.create(recurso, blob, opciones),
  traer: (url, opciones) => UrlFetchApp.fetch(url, opciones),
  token: () => ScriptApp.getOAuthToken(),
  aPapelera: (id) => DriveApp.getFileById(id).setTrashed(true),
});

/** Texto plano del Doc ya convertido (files.export); null si Drive no lo devolvió. */
function exportarTextoDoc_(id, servicios) {
  const respuesta = servicios.traer(`${URL_EXPORTAR_DRIVE}${encodeURIComponent(id)}/export?mimeType=text/plain`, {
    method: 'get',
    headers: { Authorization: `Bearer ${servicios.token()}` },
    muteHttpExceptions: true,
  });
  return respuesta.getResponseCode() === 200 ? respuesta.getContentText() : null;
}

/** El Doc temporal se manda a la papelera enseguida; si eso falla, solo se registra. */
function papeleraDoc_(id, servicios) {
  try {
    servicios.aPapelera(id);
  } catch (error) {
    console.warn('OCR de Drive: el documento temporal quedó sin mandar a la papelera');
  }
}

/**
 * OCR de una foto con Drive: la sube a "Por clasificar" convertida a Google Doc con
 * `ocrLanguage: 'es'`, exporta el texto plano y manda el Doc temporal a la papelera. Nunca lanza:
 * devuelve { ok: true, texto } o { ok: false, motivo } (sin token ni URL adentro).
 */
function ocrDrive_(blob, raiz, servicios) {
  let id = null;
  try {
    const carpeta = carpetaHija_(raiz, CARPETA_POR_CLASIFICAR);
    const creado = servicios.crearDoc(
      { name: `${NOMBRE_DOC_OCR}-${Date.now()}`, mimeType: MIME_DOC_GOOGLE, parents: [carpeta.getId()] },
      blob,
      { ocrLanguage: IDIOMA_OCR },
    );
    id = (creado && creado.id) || null;
    if (!id) return { ok: false, motivo: 'Drive no devolvió el documento del OCR' };
    const texto = exportarTextoDoc_(id, servicios);
    return texto === null ? { ok: false, motivo: 'Drive no devolvió el texto del OCR' } : { ok: true, texto };
  } catch (error) {
    console.warn(`OCR de Drive: ${(error && error.message) || error}`);
    return { ok: false, motivo: MOTIVO_OCR_FALLO };
  } finally {
    if (id) papeleraDoc_(id, servicios);
  }
}

/** La imagen más nueva de "Por clasificar" a la que Drive le puede sacar texto; null si no hay. */
function fotoMasNuevaPorClasificar_(raiz) {
  const archivos = carpetaHija_(raiz, CARPETA_POR_CLASIFICAR).getFiles();
  let elegida = null;
  while (archivos.hasNext()) {
    const archivo = archivos.next();
    const sirve = ocrPosible_(archivo.getMimeType())
      && (!elegida || archivo.getDateCreated() > elegida.getDateCreated());
    if (sirve) elegida = archivo;
  }
  return elegida;
}

/**
 * Ejecutar desde el editor (antes de conectar nada en vivo): le hace OCR a la foto más
 * nueva de "Por clasificar" y registra un pedazo del texto y el total que propondría el bot. Lo
 * único que toca es el Doc temporal, que queda en la papelera.
 */
function probarOcr() {
  const raiz = DriveApp.getFolderById(CONFIG.FACTURAS_FOLDER_ID);
  const archivo = fotoMasNuevaPorClasificar_(raiz);
  const lineas = [];
  if (!archivo) {
    lineas.push(`No hay ninguna imagen en "${CARPETA_POR_CLASIFICAR}" que Drive pueda leer`);
  } else {
    const resultado = ocrDrive_(archivo.getBlob(), raiz, serviciosOcr_());
    lineas.push(`Foto: ${archivo.getName()}`);
    if (!resultado.ok) lineas.push(`OCR: falla (${resultado.motivo})`);
    else {
      lineas.push(`Texto (${resultado.texto.length} caracteres): ${resultado.texto.slice(0, LARGO_MUESTRA_OCR)}`);
      lineas.push(`Total propuesto: ${totalDeOcr_(resultado.texto)}`);
    }
  }
  lineas.forEach((linea) => Logger.log(linea));
  return lineas;
}

/** Total que propone el OCR para una foto ya archivada; null si no se puede o no hay línea TOTAL. */
function totalOcrDeFoto_(deps, leido, raiz) {
  if (!leido.blob || !ocrPosible_(leido.mimeType)) return null;
  const resultado = deps.ocr(leido.blob, raiz);
  if (!resultado.ok) {
    console.warn(`OCR de Drive: ${resultado.motivo}`);
    return null;
  }
  return totalDeOcr_(resultado.texto);
}

/**
 * Gemini no pudo leer la foto: la foto ya está archivada en "Por clasificar",
 * así que el bot le propone el total del OCR con botones Sí/No (o le pregunta el total si no hay) y
 * deja la entrada POR-PROCESAR abierta en `_ESTADO`. No escribe ninguna fila de gasto todavía.
 */
function atenderFotoSinGemini_(entorno, { mensaje, leido, raiz }) {
  const { hojaEstado, deps, momento } = entorno;
  const total = totalOcrDeFoto_(deps, leido, raiz);
  const enviado = enviarTelegram_(deps, 'sendMessage', {
    chat_id: momento.chatId,
    text: total === null ? TEXTO_PEDIR_TOTAL : textoTotalOcr_(total),
    ...(total === null ? {} : { reply_markup: tecladoTotalOcr_(mensaje.message_id) }),
  });
  guardarPregunta_(hojaEstado, filaPorProcesar_({
    creado: momento.ahora,
    idMensaje: mensaje.message_id,
    idPregunta: enviado.message_id,
    idFoto: leido.archivo.getId(),
    enlace: leido.archivo.getUrl(),
    fechaMensaje: momento.fechaMensaje,
    leyenda: mensaje.caption,
    intentos: 0,
    totalOcr: total,
  }));
}

/**
 * Plan de la fila con el total que el usuario confirmó, ya listo para registrarPlan_: la fila de
 * planTotalConfirmado_ más la confirmación detallada de siempre (con la línea "ver foto").
 */
function planFotoSinLeer_(total, pregunta, ctx) {
  const base = planTotalConfirmado_(total, pregunta, ctx);
  if (!base.filas.length) return { ...base, respuesta: TEXTO_PEDIR_TOTAL, confirmable: false, html: false };
  return {
    ...base,
    respuesta: confirmacionFoto_(base.filas, [], ctx, base.datos.foto),
    confirmable: true,
    html: true,
  };
}

/** Anota en ID FILAS las filas escritas: esa marca es la que dice "el total ya se confirmó". */
function anotarIdFilas_(hojaEstado, pregunta, escritas) {
  celdaEstado_(hojaEstado, pregunta.fila, 'ID FILAS')
    .setValue(escritas.map((escrita) => escrita.fila['ID FILA']).join(','));
}

/**
 * Escribe la fila de una foto con el total ya confirmado, la confirma, mueve la foto a la carpeta
 * de su mes y anota en ID FILAS lo que escribió: esa marca es la que dice "el total ya se
 * confirmó". La marca se anota apenas se escribe la fila, antes de Telegram o Drive: si alguno
 * falla, repetir el botón o el monto no escribe otra fila. La entrada sigue ABIERTA a propósito,
 * para los reintentos de Gemini.
 */
function escribirTotalConfirmado_(entorno, pregunta, total) {
  const { hojaEstado, deps } = entorno;
  const ss = deps.libro();
  const completo = { ...entorno, ss, resumen: resumenHoja_(ss), registros: { citado: null, ultimo: null } };
  const ctx = contextoTexto_(completo, { idMensaje: pregunta.idMensaje, fechaMensaje: pregunta.fechaMensaje });
  const plan = planFotoSinLeer_(total, pregunta, ctx);
  const escritas = registrarPlan_(completo, plan, ctx, plan.datos,
    (escritasAhora) => { if (escritasAhora.length) anotarIdFilas_(hojaEstado, pregunta, escritasAhora); });
  if (!escritas.length) return;
  // El PROVEEDOR queda en PENDIENTE: el nombre del archivo lo pone DESCRIPCION_FOTO_SIN_LEER.
  moverFotoDelPlan_(deps, plan, { ...plan.datos, descripcion_corta: DESCRIPCION_FOTO_SIN_LEER });
}

/**
 * Toque de "Sí" / "No" en el total que propuso el OCR. "Sí" escribe la fila con ese total;
 * "No" solo pregunta cuánto es. Una entrada desconocida, cerrada o con el total ya confirmado
 * recibe el aviso corto de siempre.
 */
function atenderBotonTotalOcr_(entorno, callbackQuery) {
  const { hojaEstado, deps, momento } = entorno;
  const boton = leerBotonTotalOcr_(callbackQuery.data);
  const pregunta = boton ? buscarPorProcesar_(filasEstado_(hojaEstado), boton.clave) : null;
  if (!pregunta || !pregunta.abierto || pregunta.idFilas.length) {
    respuestaFechaAtendida_(deps, callbackQuery);
    return;
  }
  enviarTelegram_(deps, 'answerCallbackQuery', { callback_query_id: callbackQuery.id });
  quitarBotones_(entorno, callbackQuery);
  if (!boton.si) {
    enviarTelegram_(deps, 'sendMessage', { chat_id: momento.chatId, text: TEXTO_TOTAL_NO });
    return;
  }
  escribirTotalConfirmado_(entorno, pregunta, pregunta.totalOcr);
}

/** Las entradas POR-PROCESAR abiertas que todavía esperan el total (sin fila escrita). */
const esperandoTotal_ = (filasEstado) => porProcesarAbiertas_(filasEstado)
  .filter((entrada) => !entrada.idFilas.length);

const instanteEstado_ = (valor) => new Date(valor).getTime();

/**
 * true si ninguna otra pregunta abierta de `_ESTADO` es más nueva que esa (no hay con cuál
 * confundirla). Los REGISTRO abiertos son constancias de una confirmación, no preguntas: confirmar
 * el total deja uno más nuevo que la foto y no debe frenar la respuesta que sigue.
 */
function esLaPreguntaMasNueva_(filasEstado, pregunta) {
  const iEstado = COLUMNAS_ESTADO.indexOf('ESTADO');
  const iCreado = COLUMNAS_ESTADO.indexOf('CREADO');
  const iTipo = COLUMNAS_ESTADO.indexOf('TIPO');
  return filasEstado.every((fila, i) => i + 2 === pregunta.fila
    || fila[iEstado] !== PREGUNTA_ABIERTA
    || fila[iTipo] === TIPO_ESTADO_REGISTRO
    || instanteEstado_(fila[iCreado]) <= instanteEstado_(pregunta.creado));
}

/**
 * A qué foto le contesta un monto escrito: a la que el usuario citó con "Responder" (el mensaje con que
 * el bot preguntó, o la foto misma) y, sin cita, a la más nueva solo si además es la última
 * pregunta abierta de todas. Si citó otra cosa, o hay una pregunta más nueva, devuelve null y el
 * mensaje sigue su camino normal (Gemini).
 */
function elegirPorProcesar_(filasEstado, mensaje) {
  const candidatas = esperandoTotal_(filasEstado);
  if (!candidatas.length) return null;
  const citado = (mensaje.reply_to_message && mensaje.reply_to_message.message_id) || null;
  if (citado !== null) {
    return candidatas.find((entrada) => String(entrada.idPregunta) === String(citado)
      || String(entrada.idMensaje) === String(citado)) || null;
  }
  const nueva = candidatas.reduce((reciente, entrada) => (
    instanteEstado_(entrada.creado) > instanteEstado_(reciente.creado) ? entrada : reciente));
  return esLaPreguntaMasNueva_(filasEstado, nueva) ? nueva : null;
}

/**
 * El usuario contesta el total escribiéndolo. Si el mensaje es SOLO un monto y se sabe a qué foto
 * le contesta, se escribe la fila igual que con el botón "Sí", sin pasar por Gemini, y devuelve
 * true. Cualquier otro texto devuelve false y sigue el camino normal.
 */
function atenderTotalEscrito_(entorno, mensaje, texto) {
  const total = leerMontoEscrito_(texto);
  if (total === null) return false;
  const pregunta = elegirPorProcesar_(filasEstado_(entorno.hojaEstado), mensaje);
  if (!pregunta) return false;
  escribirTotalConfirmado_(entorno, pregunta, total);
  return true;
}

if (typeof module !== 'undefined') {
  module.exports = {
    serviciosOcr_, ocrDrive_, fotoMasNuevaPorClasificar_, probarOcr, totalOcrDeFoto_,
    atenderFotoSinGemini_, planFotoSinLeer_, escribirTotalConfirmado_, atenderBotonTotalOcr_,
    esperandoTotal_, elegirPorProcesar_, atenderTotalEscrito_,
    // ReintentoApp.js usa las dos para la respuesta escrita del proveedor.
    instanteEstado_, esLaPreguntaMasNueva_,
  };
}
