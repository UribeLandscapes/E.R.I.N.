/**
 * Aviso de factura duplicada, la parte que toca Sheets, Drive y
 * Telegram; la lógica pura vive en Duplicado.js. Sigue el patrón (fecha de otro
 * mes): atenderFoto_ llama a avisarSiDuplicada_ tras planFoto_ y ANTES de escribir; si hay
 * coincidencia guarda un aviso DUPLICADO en _ESTADO con la foto ya leída y manda los botones, sin
 * escribir filas y sin mover la foto. atenderBoton_ (MensajesApp.js) llama a atenderBotonDuplicado_.
 * Todo lo de Google entra por `deps` (libro, archivoPorId, carpetaFacturas, aPapelera).
 * Usa buscarDuplicado_, textoDuplicado_, tecladoDuplicado_, tecladoConfirmarDuplicado_,
 * leerBotonDuplicado_, filaDuplicado_, datosDuplicado_, buscarDuplicadoAbierto_, PASO_AVISO,
 * PASO_CONFIRMAR, TEXTO_CONFIRMAR_DUPLICADO y TEXTO_NO_AGREGADA de Duplicado.js; nombrePestanaMes_
 * de Hoja.js; filasDatos_, guardarPregunta_, celdaEstado_ y PREGUNTA_CERRADA de EscrituraApp.js;
 * filasEstado_ de BotonesApp.js; enviarTelegram_, contextoTexto_, registrarPlan_, quitarBotones_ y
 * respuestaFechaAtendida_ de MensajesApp.js; planFoto_ de Foto.js; moverFotoDelPlan_ de
 * MensajesFoto.js; preguntarFechaFotoSiHace_ de FechaFotoApp.js.
 */

/**
 * La coincidencia de la fila del plan en la pestaña de su mes (S4: sin pestaña no hay duplicado),
 * o null. Solo mira la primera fila del plan: con una fila por foto, su GASTO (USD) es el total.
 */
function duplicadaDelPlan_(ss, plan) {
  const fila = plan.filas[0];
  const partes = /^(\d{4})-(\d{2})-\d{2}$/.exec(String(fila.FECHA));
  if (!partes) return null;
  const hoja = ss.getSheetByName(nombrePestanaMes_(Number(partes[1]), Number(partes[2])));
  return hoja ? buscarDuplicado_(filasDatos_(hoja), fila) : null;
}

/**
 * Si el plan de la foto ya trae su fila con fecha leída y total (S3) y esa factura ya está en la
 * hoja, guarda el aviso, se lo manda al usuario con los botones y devuelve true (no se escribe nada).
 * Cualquier otro caso devuelve false y la foto sigue su camino de siempre.
 */
function avisarSiDuplicada_(entorno, plan, ctx, datos) {
  if (plan.fechaDistinta || plan.fechaIlegible || !plan.filas.length) return false;
  const coincidencia = duplicadaDelPlan_(entorno.ss, plan);
  if (!coincidencia) return false;
  const { hojaEstado, deps, momento } = entorno;
  enviarTelegram_(deps, 'sendMessage', {
    chat_id: momento.chatId,
    text: textoDuplicado_(coincidencia),
    reply_markup: tecladoDuplicado_(ctx.idMensaje),
  });
  guardarPregunta_(hojaEstado, filaDuplicado_({
    creado: momento.ahora,
    idMensaje: ctx.idMensaje,
    datos,
    fechaMensaje: ctx.fechaMensaje,
    mimeType: ctx.mimeType,
    paso: PASO_AVISO,
  }));
  return true;
}

/** La foto repetida a la papelera de Drive (D5); si falla solo se registra, el usuario no lo necesita. */
function fotoDuplicadaAPapelera_(deps, datos) {
  try {
    deps.aPapelera(datos.idFoto);
  } catch (error) {
    console.warn('foto duplicada: quedó sin mandar a la papelera');
  }
}

/** "Sí, estoy segura": el camino normal de una foto (planFoto_, clasificar, registrar). */
function agregarFotoDuplicada_(entorno, aviso) {
  const { deps } = entorno;
  const ctx = {
    ...contextoTexto_(entorno, { idMensaje: aviso.idMensaje, fechaMensaje: aviso.fechaMensaje }),
    mimeType: aviso.mimeType,
  };
  const plan = planFoto_(aviso.datos, ctx);
  moverFotoDelPlan_(deps, plan, aviso.datos);
  const escritas = registrarPlan_(entorno, plan, ctx, aviso.datos);
  preguntarFechaFotoSiHace_(entorno, {
    fechaIlegible: plan.fechaIlegible, escritas, idMensaje: aviso.idMensaje,
  });
}

/** Cada botón solo vale en su paso: 1 y 2 en el aviso; Sí y No en la confirmación. */
const opcionDelPaso_ = (opcion, paso) => (paso === PASO_AVISO
  ? opcion === 'equivoque' || opcion === 'agregar'
  : opcion === 'seguro' || opcion === 'cancelar');

/** Botón 2: el mismo aviso pasa al paso "confirmar" y se pregunta "¿Estás segura?" con Sí/No. */
function pedirConfirmarDuplicado_(entorno, aviso) {
  const { hojaEstado, deps, momento } = entorno;
  celdaEstado_(hojaEstado, aviso.fila, 'DATOS').setValue(datosDuplicado_({
    datos: aviso.datos,
    fechaMensaje: aviso.fechaMensaje,
    idMensaje: aviso.idMensaje,
    mimeType: aviso.mimeType,
    paso: PASO_CONFIRMAR,
  }));
  enviarTelegram_(deps, 'sendMessage', {
    chat_id: momento.chatId,
    text: TEXTO_CONFIRMAR_DUPLICADO,
    reply_markup: tecladoConfirmarDuplicado_(aviso.idMensaje),
  });
}

/**
 * Toque de un botón del aviso de duplicado. Cerrado, desconocido o de otro paso: solo contesta
 * "atendido". El aviso se cierra ANTES de actuar, así un segundo toque nunca actúa dos veces.
 */
function atenderBotonDuplicado_(entorno, callbackQuery) {
  const { hojaEstado, deps, momento } = entorno;
  const boton = leerBotonDuplicado_(callbackQuery.data);
  const aviso = boton ? buscarDuplicadoAbierto_(filasEstado_(hojaEstado), boton.clave) : null;
  if (!aviso || !aviso.abierto || !opcionDelPaso_(boton.opcion, aviso.paso)) {
    respuestaFechaAtendida_(deps, callbackQuery);
    return;
  }
  enviarTelegram_(deps, 'answerCallbackQuery', { callback_query_id: callbackQuery.id });
  quitarBotones_(entorno, callbackQuery);
  if (boton.opcion === 'agregar') {
    pedirConfirmarDuplicado_(entorno, aviso);
    return;
  }
  celdaEstado_(hojaEstado, aviso.fila, 'ESTADO').setValue(PREGUNTA_CERRADA);
  if (boton.opcion === 'seguro') {
    agregarFotoDuplicada_(entorno, aviso);
    return;
  }
  fotoDuplicadaAPapelera_(deps, aviso.datos);
  enviarTelegram_(deps, 'sendMessage', { chat_id: momento.chatId, text: TEXTO_NO_AGREGADA });
}

if (typeof module !== 'undefined') {
  module.exports = { duplicadaDelPlan_, avisarSiDuplicada_, atenderBotonDuplicado_ };
}
