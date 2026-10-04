/**
 * Conecta una foto de factura que manda el usuario con Gemini, el plan de la foto, el Sheet y
 * Drive. Vive aparte de MensajesApp.js solo por tamaño; comparte todo su cableado con el camino de
 * texto. Todo lo de Google y Telegram entra por `deps`, como en MensajesApp.js.
 * Usa recibirFoto_ y clasificarFotoLeida_ de FotoApp.js; planFoto_ de Foto.js; momentoDeMensaje_,
 * resumenHoja_, contextoTexto_, registrarPlan_ y enviarTelegram_ de MensajesApp.js;
 * TEXTO_FOTO_NO_BAJADA de Mensajes.js; preguntarFechaFoto_ de
 * FechaFotoApp.js (la fecha que no se pudo leer se pregunta aparte, con botones);
 * atenderFotoSinGemini_ de PorProcesarApp.js (respaldo sin Gemini).
 * avisarSiDuplicada_ de DuplicadoApp.js (aviso de factura ya anotada, antes de escribir).
 * preguntarFechaFotoSiHace_ es el mismo gancho que usa la respuesta de monto (MensajesApp.js).
 *
 * La leyenda de la foto es solo para Gemini. Esta rama no pasa por esSaludoOAyuda_, esAcuse_
 * ni por el camino de correcciones: una foto siempre es un gasto nuevo.
 */

/**
 * Datos del gasto de una foto ya leída: la extracción de Gemini más la intención (el esquema de
 * foto no la trae) y la foto en Drive. El enlace de getUrl es por id, así que sigue sirviendo
 * cuando la foto se mueve de "Por clasificar" a la carpeta de su mes.
 */
const datosDeFoto_ = (leido) => ({
  ...leido.datos,
  intencion: 'GASTO',
  foto: leido.archivo.getUrl(),
  idFoto: leido.archivo.getId(),
});

/**
 * Una foto del usuario: se archiva y se lee (recibirFoto_), se planea como un gasto (planFoto_), se
 * clasifica en la carpeta de su mes si el plan escribió filas y se responde por el camino normal
 * (registrarPlan_: escribe, responde y deja abierto lo que falte en _ESTADO).
 * Sin poder bajarla: TEXTO_FOTO_NO_BAJADA. Bajada pero sin poder leerla: queda en
 * "Por clasificar" y sigue el respaldo sin Gemini (OCR de Drive + pregunta del total).
 * El plan corre UNA sola vez (ctx.aUsd consulta tasas).
 */
function atenderFoto_(mensaje, deps, hojaEstado) {
  const chatId = mensaje.chat.id;
  const momento = momentoDeMensaje_(mensaje, deps, chatId);
  const ss = deps.libro();
  const resumen = resumenHoja_(ss);
  const raiz = deps.carpetaFacturas();
  const depsFoto = { ...deps, categorias: resumen.categorias, hoy: momento.fechaMensaje };
  const leido = recibirFoto_(mensaje, depsFoto, raiz);
  if (!leido.archivo) {
    console.warn(`foto de Telegram: ${leido.motivo}`);
    enviarTelegram_(deps, 'sendMessage', { chat_id: chatId, text: TEXTO_FOTO_NO_BAJADA });
    return;
  }
  if (!leido.ok) {
    console.warn(`Gemini de foto: ${leido.motivo}`);
    atenderFotoSinGemini_({ hojaEstado, deps, momento }, { mensaje, leido, raiz });
    return;
  }
  const entorno = { ss, hojaEstado, deps, momento, resumen, registros: { citado: null, ultimo: null } };
  const ctx = {
    ...contextoTexto_(entorno, { idMensaje: mensaje.message_id, fechaMensaje: momento.fechaMensaje }),
    mimeType: leido.mimeType,
  };
  const datos = datosDeFoto_(leido);
  const plan = planFoto_(datos, ctx);
  // Una factura que ya está en la hoja se avisa ANTES de escribir o mover la foto.
  if (avisarSiDuplicada_(entorno, plan, ctx, datos)) return;
  if (plan.filas.length) clasificarFotoLeida_(leido.archivo, plan, datos, raiz);
  const escritas = registrarPlan_(entorno, plan, ctx, datos);
  // La fecha no se leyó y las filas SÍ se escribieron con el día del mensaje → se pregunta
  // aparte si esa fecha está bien. Sin filas escritas (p. ej. falta el monto y el bot pregunta
  // primero) todavía no hay fecha anotada que corregir: la pregunta la hará la respuesta de monto.
  preguntarFechaFotoSiHace_(entorno, {
    fechaIlegible: plan.fechaIlegible, escritas, idMensaje: mensaje.message_id,
  });
}

/**
 * con foto (factura de otro mes): cuando el botón de fecha ya escribió las
 * filas, la foto sale de "Por clasificar" a la carpeta del mes elegido. Sin foto (una entrada de
 * texto) o sin filas escritas no toca Drive.
 */
function moverFotoDelPlan_(deps, plan, datos) {
  if (!datos.idFoto || !plan.filas.length) return;
  clasificarFotoLeida_(deps.archivoPorId(datos.idFoto), plan, datos, deps.carpetaFacturas());
}

if (typeof module !== 'undefined') {
  module.exports = { atenderFoto_, moverFotoDelPlan_ };
}
