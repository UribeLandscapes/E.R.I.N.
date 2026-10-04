/**
 * Registro de ediciones a mano en SpreadsheetApp. Usa PESTANA_EDICIONES,
 * COLUMNAS_EDICIONES, PROPIEDAD_EDICIONES_CREADA, PROPIEDAD_EDICIONES_PERDIDA,
 * encabezadosEdicionesOk_, estadoEdiciones_, selloAnterior_, registroEdiciones_, choquesPosteriores_ y textoChoque_ de Ediciones.js;
 * crearPestanaOculta_ de HojaApp.js; FORMATO_SELLO de Mensajes.js y CONFIG/Utilities al marcar pérdida.
 */

/** Estado de las propiedades y la pestaña; encabezados ilegibles significan pérdida. */
function estadoActualEdiciones_(ss, propiedades) {
  const creada = propiedades.getProperty(PROPIEDAD_EDICIONES_CREADA);
  const perdida = propiedades.getProperty(PROPIEDAD_EDICIONES_PERDIDA);
  let hoja = null;
  let encabezadosOk = false;
  try {
    hoja = ss.getSheetByName(PESTANA_EDICIONES);
    if (hoja) {
      encabezadosOk = hoja.getLastRow() >= 1
        && encabezadosEdicionesOk_(hoja.getRange(1, 1, 1, COLUMNAS_EDICIONES.length).getValues()[0]);
    }
  } catch (error) {
    console.error(`_EDICIONES: no se pudieron leer encabezados: ${error.message}`);
    hoja = null;
  }
  return { estado: estadoEdiciones_({ creada, perdida, pestanaExiste: !!hoja, encabezadosOk }), hoja };
}

/** Marca una pérdida sin borrar su primer motivo. Si PropertiesService falla, propaga. */
function marcarPerdida_(propiedades, motivo) {
  console.error(`_EDICIONES: ${motivo}`);
  if (!propiedades.getProperty(PROPIEDAD_EDICIONES_PERDIDA)) {
    propiedades.setProperty(PROPIEDAD_EDICIONES_PERDIDA,
      `${Utilities.formatDate(new Date(), CONFIG.TIMEZONE, FORMATO_SELLO)} ${motivo}`);
  }
}

/** Primera creación, siempre dentro del candado y con el corte guardado primero. */
function arrancarEdiciones_(ss, propiedades, sello) {
  const { estado } = estadoActualEdiciones_(ss, propiedades);
  if (estado === 'LISTA') return;
  if (estado !== 'ARRANCAR') {
    marcarPerdida_(propiedades, 'arranque: estado inválido');
    throw new Error('arranque de _EDICIONES en estado perdido');
  }
  propiedades.setProperty(PROPIEDAD_EDICIONES_CREADA, sello);
  try {
    crearPestanaOculta_(ss, PESTANA_EDICIONES, COLUMNAS_EDICIONES);
  } catch (error) {
    marcarPerdida_(propiedades, `falló crear pestaña: ${error.message}`);
    throw error;
  }
}

/** Registro legible o uno indisponible que protege todas las filas. */
function leerRegistroEdiciones_(ss, propiedades) {
  let corte = '';
  try {
    corte = propiedades.getProperty(PROPIEDAD_EDICIONES_CREADA) || '';
    const { estado, hoja } = estadoActualEdiciones_(ss, propiedades);
    if (estado === 'LISTA') {
      const ultima = hoja.getLastRow();
      const filas = ultima > 1
        ? hoja.getRange(2, 1, ultima - 1, COLUMNAS_EDICIONES.length).getValues() : [];
      return registroEdiciones_({ filas, corte, disponible: true });
    }
    if (estado === 'PERDIDA') {
      try { marcarPerdida_(propiedades, 'registro ausente o inválido'); }
      catch (error) { console.error(`_EDICIONES: no se pudo marcar pérdida: ${error.message}`); }
    }
    console.error(`_EDICIONES: registro no disponible (${estado})`);
  } catch (error) {
    console.error(`_EDICIONES: no se pudo leer registro: ${error.message}`);
    try { marcarPerdida_(propiedades, `lectura fallida: ${error.message}`); }
    catch (fallo) { console.error(`_EDICIONES: no se pudo marcar pérdida: ${fallo.message}`); }
  }
  return registroEdiciones_({ filas: [], corte, disponible: false });
}

/**
 * Arranca el registro de ediciones si aún no existe, con el candado ya tomado. Se llama ANTES de la
 * primera fila que escribe el bot, así el corte nunca queda después de las filas del propio bot.
 * `selloFila` (opcional) es el sello de la fila por escribir: el corte es un segundo antes, porque
 * proteccionFila_ protege todo sello <= corte. Devuelve false (sin lanzar) si no pudo arrancar.
 */
function asegurarEdiciones_(ss, deps, selloFila) {
  try {
    if (estadoActualEdiciones_(ss, deps.propiedades).estado === 'ARRANCAR') {
      arrancarEdiciones_(ss, deps.propiedades, (selloFila && selloAnterior_(selloFila)) || deps.sello());
    }
    return true;
  } catch (error) {
    console.error(`_EDICIONES: no se pudo arrancar: ${error.message}`);
    return false;
  }
}

/**
 * Uso por escrituras del bot que ya tienen el candado. `selloFila` (opcional) es el sello de la fila
 * nueva que se va a escribir: en instalación nueva el corte queda un segundo antes, no en "ahora".
 */
function registroParaEscribir_(ss, deps, selloFila) {
  if (!asegurarEdiciones_(ss, deps, selloFila)) return registroEdiciones_({ filas: [], corte: '', disponible: false });
  return leerRegistroEdiciones_(ss, deps.propiedades);
}

/**
 * Avisa si una edición posterior pudo cruzarse con celdas que el bot acabó de escribir.
 * `escritos` es la lista o una función que la arma; se arma dentro del try para que nunca lance.
 */
function avisarChoques_(ss, desde, escritos, propiedades) {
  try {
    if (!desde || !propiedades) throw new Error('faltan desde o propiedades');
    const lista = typeof escritos === 'function' ? escritos() : escritos;
    const { estado, hoja } = estadoActualEdiciones_(ss, propiedades);
    if (estado !== 'LISTA') return;
    const ultima = hoja.getLastRow();
    const filas = ultima > 1
      ? hoja.getRange(2, 1, ultima - 1, COLUMNAS_EDICIONES.length).getValues() : [];
    choquesPosteriores_(filas, desde, lista).forEach((choque) => console.error(textoChoque_(choque)));
  } catch (error) {
    console.error(`_EDICIONES: no se pudo revisar choques: ${error.message}`);
  }
}

if (typeof module !== 'undefined') {
  module.exports = {
    estadoActualEdiciones_, marcarPerdida_, arrancarEdiciones_, leerRegistroEdiciones_,
    asegurarEdiciones_, registroParaEscribir_, avisarChoques_,
  };
}
