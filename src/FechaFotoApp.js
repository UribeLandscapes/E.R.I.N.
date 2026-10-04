/**
 * La pregunta ("no pude leer la fecha en la foto"), sus botones, la fecha que
 * El usuario escribe a mano y las preguntas que quedaron sin contestar. Capa de Apps Script
 * sobre Fecha.js; vive aparte de MensajesApp.js solo por tamaño.
 * Usa TEXTO_OTRA_FECHA, TEXTO_FECHA_SIN_GASTO, textoFechaIlegible_, tecladoFechaFoto_,
 * leerBotonFechaFoto_, filaFechaFoto_, buscarFechaFoto_, fechasFotoEsperando_, elegirFechaFoto_,
 * datosFechaFoto_, pareceFechaEscrita_ y leerFechaEscrita_ de Fecha.js;
 * guardarPregunta_ y celdaEstado_ de EscrituraApp.js; filasEstado_ de BotonesApp.js;
 * cerrarEstado_ de RegistroApp.js; registrosAbiertos_ y buscarRegistro_ de Registro.js; enviarTelegram_, quitarBotones_, respuestaFechaAtendida_,
 * resumenHoja_ y corregirEntrada_ de MensajesApp.js.
 */

/**
 * del detalle: las filas ya se escribieron con la fecha del día en que el usuario mandó la
 * foto; esto le avisa aparte, con los dos botones, y deja la pregunta abierta en _ESTADO con los
 * ID FILA que escribió (para poder corregirlas después).
 */
function preguntarFechaFoto_(entorno, { idMensaje, idFilas, fechaEnvio }) {
  const { hojaEstado, deps, momento } = entorno;
  const enviado = enviarTelegram_(deps, 'sendMessage', {
    chat_id: momento.chatId,
    text: textoFechaIlegible_(fechaEnvio),
    reply_markup: tecladoFechaFoto_(idMensaje),
  });
  guardarPregunta_(hojaEstado, filaFechaFoto_({
    creado: momento.ahora,
    idMensaje,
    idPregunta: enviado.message_id,
    idFilas,
    fechaMensaje: fechaEnvio,
  }));
}

/**
 * La pregunta, pero solo cuando hace falta: la fecha no se leyó Y las filas ya están
 * escritas. Lo usan el camino de la foto y el de la respuesta de monto (esa respuesta es la que
 * escribe las filas de una foto sin fecha ni monto).
 */
function preguntarFechaFotoSiHace_(entorno, { fechaIlegible, escritas, idMensaje }) {
  if (!fechaIlegible || !escritas.length) return;
  preguntarFechaFoto_(entorno, {
    idMensaje,
    idFilas: escritas.map((escrita) => escrita.fila['ID FILA']),
    fechaEnvio: fechaIlegible.fechaEnvio,
  });
}

/**
 * La pregunta queda abierta pero esperando que el usuario escriba la fecha. Sigue ABIERTA a
 * propósito, hasta que conteste. Guarda el mensaje
 * que pidió la fecha y cuándo lo tocó, para saber a cuál pregunta contesta si hay varias.
 */
function esperarFechaEscrita_(hojaEstado, pregunta, { idOtra, tocado }) {
  celdaEstado_(hojaEstado, pregunta.fila, 'DATOS').setValue(datosFechaFoto_({
    fechaMensaje: pregunta.fechaMensaje,
    idMensaje: pregunta.idMensaje,
    idPregunta: pregunta.idPregunta,
    idOtra,
    tocado,
    esperando: true,
  }));
}

/**
 * Toque de "Sí, esa fecha" / "Es otra fecha". "Sí" cierra la pregunta y no
 * cambia nada; "otra" pide la fecha escrita. Una pregunta ya cerrada o desconocida solo recibe el
 * aviso corto, igual que los demás botones.
 */
function atenderBotonFechaFoto_(entorno, callbackQuery) {
  const { hojaEstado, deps, momento } = entorno;
  const boton = leerBotonFechaFoto_(callbackQuery.data);
  const pregunta = boton ? buscarFechaFoto_(filasEstado_(hojaEstado), boton.clave) : null;
  if (!pregunta || !pregunta.abierto) {
    respuestaFechaAtendida_(deps, callbackQuery);
    return;
  }
  enviarTelegram_(deps, 'answerCallbackQuery', { callback_query_id: callbackQuery.id });
  quitarBotones_(entorno, callbackQuery);
  if (!boton.otra) {
    cerrarEstado_(hojaEstado, pregunta.fila);
    return;
  }
  const pedido = enviarTelegram_(deps, 'sendMessage', { chat_id: momento.chatId, text: TEXTO_OTRA_FECHA });
  esperarFechaEscrita_(hojaEstado, pregunta, { idOtra: pedido.message_id, tocado: momento.ahora });
}

/**
 * Mensajes a los que el usuario pudo estar contestando con "Responder": el que citó y, si citó una
 * confirmación del bot, el mensaje de la foto que la generó (así "Responder" sobre la
 * confirmación también encuentra su pregunta de fecha).
 */
function citadosDelMensaje_(filasEstado, mensaje) {
  const citado = (mensaje && mensaje.reply_to_message && mensaje.reply_to_message.message_id) || null;
  if (citado === null) return [];
  const registro = buscarRegistro_(registrosAbiertos_(filasEstado), citado);
  return [citado, registro ? registro.idMensaje : null];
}

/** El REGISTRO abierto de la entrada que escribió esa foto (el más nuevo); null si ya no está. */
function registroDeFechaFoto_(filasEstado, pregunta) {
  const suyos = registrosAbiertos_(filasEstado)
    .filter((registro) => String(registro.idMensaje) === String(pregunta.idMensaje));
  return suyos.length ? suyos[suyos.length - 1] : null;
}

/**
 * Si hay una pregunta esperando y el mensaje es SOLO una fecha DD/MM o DD/MM/AAAA,
 * se aplica por la máquina (corregirEntrada_ reescribe las filas, las mueve de
 * pestaña si cambió de mes y vuelve a confirmar) y la pregunta se cierra. Devuelve true cuando ya
 * atendió el mensaje; cualquier otro texto devuelve false y sigue el camino normal (Gemini), con
 * la pregunta todavía esperando. Formato fijo, sin Gemini.
 */
function atenderFechaEscrita_(entorno, mensaje, texto) {
  const { hojaEstado, deps, momento } = entorno;
  if (!pareceFechaEscrita_(texto)) return false;
  const filas = filasEstado_(hojaEstado);
  const pregunta = elegirFechaFoto_(fechasFotoEsperando_(filas), citadosDelMensaje_(filas, mensaje));
  if (!pregunta) return false;
  // El año que falta es el de la foto (cuando el usuario la mandó), no el del día en que contesta.
  const fecha = leerFechaEscrita_(texto, Number(String(pregunta.fechaMensaje).slice(0, 4)));
  if (!fecha) return false;
  const registro = registroDeFechaFoto_(filas, pregunta);
  if (!registro) {
    cerrarEstado_(hojaEstado, pregunta.fila);
    enviarTelegram_(deps, 'sendMessage', { chat_id: momento.chatId, text: TEXTO_FECHA_SIN_GASTO });
    return true;
  }
  const ss = deps.libro();
  const corregida = corregirEntrada_({ ...entorno, ss, resumen: resumenHoja_(ss) }, registro, { fecha });
  if (corregida !== false) cerrarEstado_(hojaEstado, pregunta.fila);
  return true;
}

if (typeof module !== 'undefined') {
  module.exports = {
    preguntarFechaFoto_, preguntarFechaFotoSiHace_, esperarFechaEscrita_, atenderBotonFechaFoto_,
    citadosDelMensaje_, registroDeFechaFoto_, atenderFechaEscrita_,
  };
}
