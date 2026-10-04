/**
 * Corregir y borrar entradas ya registradas, capa SpreadsheetApp sobre
 * Registro.js. No llama a Telegram: MensajesApp.js manda los mensajes. Nunca escribe ni borra en
 * GRUPO (Y, desborde de fórmula): todo va por tramosEscritura_, que sí limpia las ocultas
 * (ID FILA, ORIGEN, REGISTRADO, ID MENSAJE TG) y CASA, para que filaLibre_ pueda reusar la fila.
 * Usa tramosEscritura_, preguntasAbiertas_ y ORIGEN_BOT de Escritura.js; PREGUNTA_CERRADA,
 * celdaEstado_, guardarPregunta_ y buscarFilas_ de EscrituraApp.js; filasEstado_ de BotonesApp.js.
 * Usa registroParaEscribir_ de EdicionesApp.js, tieneEdicionesManuales_ y
 * TEXTO_NO_BORRO_MANUAL de Ediciones.js.
 */

/** Agrega al final de _ESTADO el REGISTRO de una confirmación. */
function abrirRegistro_(hojaEstado, registro, creado) {
  guardarPregunta_(hojaEstado, filaRegistro_({ creado, ...registro }));
}

/** Agrega al final de _ESTADO el borrado que espera el botón Sí/No. */
function abrirBorrado_(hojaEstado, clave, creado) {
  guardarPregunta_(hojaEstado, filaBorrar_({ creado, clave }));
}

const cerrarEstado_ = (hojaEstado, fila) => celdaEstado_(hojaEstado, fila, 'ESTADO')
  .setValue(PREGUNTA_CERRADA);

/** Filas del bot de un REGISTRO que todavía están en la hoja. */
const filasDelRegistro_ = (ss, registro) => buscarFilas_(ss, registro.idFilas, registro.pestana)
  .filter((f) => f.valores.ORIGEN === ORIGEN_BOT);

/** Borra el contenido que el bot escribió en esas filas, sin mover ninguna fila. */
function limpiarFilas_(filas) {
  for (const f of filas) {
    tramosEscritura_().forEach((tramo) => f.hoja
      .getRange(f.numero, tramo.desde, 1, tramo.columnas.length).clearContent());
  }
}

/** Cierra las preguntas abiertas de esas filas: ya no tienen a qué fila apuntar. */
function cerrarPreguntasDeFilas_(hojaEstado, idFilas) {
  const ids = new Set(idFilas);
  preguntasAbiertas_(filasEstado_(hojaEstado))
    .filter((pregunta) => pregunta.idFilas.some((id) => ids.has(id)))
    .forEach((pregunta) => cerrarEstado_(hojaEstado, pregunta.fila));
}

/** Deja la entrada como borrada: limpia sus filas y cierra sus preguntas y su REGISTRO. */
function limpiarEntrada_(ss, hojaEstado, registro) {
  const filas = filasDelRegistro_(ss, registro);
  cerrarEstado_(hojaEstado, registro.fila);
  if (!filas.length) return false;
  limpiarFilas_(filas);
  cerrarPreguntasDeFilas_(hojaEstado, registro.idFilas);
  return true;
}

/**
 * El usuario tocó "Sí, bórralo": limpia la entrada de ese REGISTRO y devuelve qué contestarle.
 * Si el REGISTRO ya no está abierto o sus filas ya no están, no borra nada y lo dice.
 */
function borrarEntrada_(ss, hojaEstado, clave, deps) {
  const registro = buscarRegistro_(registrosAbiertos_(filasEstado_(hojaEstado)), clave);
  if (!registro) return TEXTO_REGISTRO_NO_ESTA;
  if (tieneEdicionesManuales_(registroParaEscribir_(ss, deps), registro.idFilas)) {
    return TEXTO_NO_BORRO_MANUAL;
  }
  return limpiarEntrada_(ss, hojaEstado, registro) ? TEXTO_BORRADO : TEXTO_REGISTRO_NO_ESTA;
}

if (typeof module !== 'undefined') {
  module.exports = {
    abrirRegistro_, abrirBorrado_, cerrarEstado_, filasDelRegistro_, limpiarFilas_,
    cerrarPreguntasDeFilas_, borrarEntrada_,
  };
}
