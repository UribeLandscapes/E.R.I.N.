/**
 * Botones Sí/No del conteo, capa SpreadsheetApp sobre Botones.js. No llama a
 * Telegram: devuelve las llamadas [metodo, cuerpo] en orden las ejecuta.
 * Usa COLUMNAS_ESTADO de Hoja.js; leerFecha_ de Reglas.js; PREGUNTA_CERRADA, guardarPregunta_,
 * celdaEstado_, pestanaDelMes_, idsFacturaDe_ y escribirFilas_ de EscrituraApp.js.
 */

/** Agrega el conteo abierto al final de _ESTADO (y de ninguna otra pestaña). */
function abrirConteo_(hojaEstado, { idMensaje, contado, saldo }, creado) {
  guardarPregunta_(hojaEstado, filaConteo_({ creado, idMensaje, contado, saldo }));
}

/** Filas de _ESTADO sin encabezado. */
function filasEstado_(hojaEstado) {
  const cuantas = hojaEstado.getLastRow() - 1;
  if (cuantas < 1) return [];
  return hojaEstado.getRange(2, 1, cuantas, COLUMNAS_ESTADO.length).getValues();
}

/** ID FACTURA ya usados en la pestaña del mes de la fecha (vacío si la pestaña no existe). */
function idsFacturaDelMes_(ss, fecha) {
  const { anio, mes } = leerFecha_(fecha);
  return idsFacturaDe_(pestanaDelMes_(ss, anio, mes), []);
}

/** Cierra el conteo, o lo deja abierto con el saldo nuevo para volver a preguntar. */
function guardarConteo_(hojaEstado, conteo, plan) {
  if (plan.estado === PREGUNTA_CERRADA) {
    celdaEstado_(hojaEstado, conteo.fila, 'ESTADO').setValue(PREGUNTA_CERRADA);
    return;
  }
  const datos = { idMensaje: conteo.idMensaje, contado: conteo.contado, saldo: plan.saldo };
  celdaEstado_(hojaEstado, conteo.fila, 'DATOS').setValue(JSON.stringify(datos));
}

/** Llamadas a Telegram en orden: contestar el botón, quitar los botones, responder. */
function llamadasConteo_(callbackQuery, conteo, plan, chatId) {
  const respuestaBoton = { callback_query_id: callbackQuery.id };
  const llamadas = [['answerCallbackQuery', plan.aviso ? { ...respuestaBoton, text: plan.aviso } : respuestaBoton]];
  if (plan.estado === null) return llamadas;
  // Un mensaje inaccesible llega con date 0 y no se puede editar.
  const mensaje = callbackQuery.message;
  if (mensaje && mensaje.date !== 0) {
    llamadas.push(['editMessageReplyMarkup', { chat_id: chatId, message_id: mensaje.message_id }]);
  }
  const envio = { chat_id: chatId, text: plan.respuesta };
  llamadas.push(['sendMessage', plan.teclado ? { ...envio, reply_markup: tecladoConteo_(conteo.idMensaje) } : envio]);
  return llamadas;
}

/**
 * Atiende un toque de Sí/No. `opciones`: { saldoAhora, fechaMensaje, sello, ahora, chatId }.
 * Escribe el AJUSTE antes de cerrar el conteo: si la escritura falla, el conteo queda abierto.
 * Devuelve { llamadas: [[metodo, cuerpo]...], escritas }.
 */
function atenderBotonConteo_(ss, hojaEstado, callbackQuery, opciones) {
  const boton = leerBotonConteo_(callbackQuery.data);
  const conteo = boton ? buscarConteo_(filasEstado_(hojaEstado), boton.clave) : null;
  const atender = conteo && conteo.abierto;
  const idsFactura = atender && boton.si ? idsFacturaDelMes_(ss, opciones.fechaMensaje) : [];
  const ctx = { fechaMensaje: opciones.fechaMensaje, idsFactura };
  const plan = planBotonConteo_(conteo, Boolean(boton && boton.si), opciones.saldoAhora, ctx);
  const escritas = plan.filas.length ? escribirFilas_(ss, plan.filas, opciones.sello, opciones.ahora) : [];
  if (plan.estado !== null) guardarConteo_(hojaEstado, conteo, plan);
  return { llamadas: llamadasConteo_(callbackQuery, conteo, plan, opciones.chatId), escritas };
}

if (typeof module !== 'undefined') {
  module.exports = { abrirConteo_, atenderBotonConteo_, filasEstado_, idsFacturaDelMes_ };
}
