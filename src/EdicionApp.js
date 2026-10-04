/**
 * alEditar (capa SpreadsheetApp) sobre la lógica pura de Edicion.js: cuando el usuario edita
 * a mano una pestaña de mes, sella filas manuales nuevas, quita marcas de REVISAR resueltas y
 * cierra preguntas del bot que ya no tienen nada PENDIENTE. Se instala como disparador onEdit
 * instalable (instalarDisparadores en Instalacion.js): un onEdit simple no puede llamar a
 * Telegram ni tomar el candado del script.
 * Usa esPestanaMes_, filasDatosTocadas_, selloManual_, revisarTrasEdicion_, preguntasParaCerrar_,
 * TEXTO_PREGUNTA_CERRADA_HOJA, fotoAMover_, descripcionDeNombreFoto_ de Edicion.js; COLUMNAS,
 * numeroColumna_ de Hoja.js; PESTANA_ESTADO de HojaApp.js; filasEstado_ de BotonesApp.js;
 * buscarFilas_ de EscrituraApp.js; cerrarEstado_ de RegistroApp.js; enviarTelegram_ de
 * MensajesApp.js; quitarBotonesPropuesta_ de ReintentoApp.js; preguntasAbiertas_, textoCelda_ de
 * Escritura.js; porProcesarAbiertas_ de PorProcesar.js; FORMATO_SELLO de Mensajes.js;
 * clasificarFoto_ de CarpetasApp.js (la fecha corregida en la hoja mueve la foto).
 * Usa filaEdicion_, esFilaBotAnotable_, puedeCambiarRevisar_, registroEdiciones_,
 * encabezadosEdicionesOk_, COLUMNAS_EDICIONES, PESTANA_EDICIONES y propiedades de Ediciones.js;
 * estadoActualEdiciones_, marcarPerdida_,
 * arrancarEdiciones_, leerRegistroEdiciones_ de EdicionesApp.js; crearPestanaOculta_ de HojaApp.js.
 */
// Candado corto: el usuario edita a mano, no debe esperar lo mismo que un álbum de fotos (WebhookApp.js).
const ESPERA_CANDADO_EDICION_MS = 5000;

/** Nombres de columna del rango editado, en el mismo orden físico que COLUMNAS. */
function nombreAColumnas_(colInicio, numCols) {
  const nombres = [];
  for (let i = 0; i < numCols; i += 1) {
    const nombre = COLUMNAS[colInicio - 1 + i];
    if (nombre) nombres.push(nombre);
  }
  return nombres;
}

/** Fila de la hoja como {columna: valor}, leyendo la fila entera (nunca e.value/e.oldValue). */
function filaObjeto_(hoja, numeroFila) {
  const valores = hoja.getRange(numeroFila, 1, 1, COLUMNAS.length).getValues()[0];
  return Object.fromEntries(COLUMNAS.map((c, i) => [c, valores[i]]));
}

/** ID FILAS de todas las preguntas PREGUNTA/POR-PROCESAR abiertas de _ESTADO, sin repetir. */
function todosIdsFilas_(filasEstado) {
  const listas = [...preguntasAbiertas_(filasEstado), ...porProcesarAbiertas_(filasEstado)]
    .map((p) => p.idFilas);
  return [...new Set(listas.flat())];
}

/** Sella ocultas vacías y ajusta REVISAR solo cuando la fila del bot está libre. */
function sellarYRevisar_(hoja, numeroFila, columnasEditadas, tiempos, valoresAntes, registro) {
  const relleno = selloManual_(valoresAntes, { ...tiempos, numeroFila });
  Object.entries(relleno).forEach(([columna, valor]) => {
    hoja.getRange(numeroFila, numeroColumna_(columna)).setValue(valorSeguroPorColumna_(columna, valor));
  });
  if (!puedeCambiarRevisar_(registro, valoresAntes, columnasEditadas)) return;
  const nuevoRevisar = revisarTrasEdicion_(valoresAntes, columnasEditadas);
  if (nuevoRevisar !== null) {
    hoja.getRange(numeroFila, numeroColumna_('REVISAR'))
      .setValue(valorSeguroPorColumna_('REVISAR', nuevoRevisar));
  }
}

/**
 * Si el usuario corrigió FECHA a una fecha válida y la fila tiene FOTO con enlace de Drive, mueve
 * la foto a Facturas/<año>/<n. Mes> y la renombra con la fecha nueva. La descripción sale del
 * nombre actual de la foto ("AAAA.MM.DD - descripción.ext"); si todavía no tiene ese formato
 * (sigue en Por clasificar) se usa PROVEEDOR; sin ninguna de las dos, no se toca Drive.
 */
function moverFotoSiCambioFecha_(hoja, numeroFila, columnasEditadas, deps) {
  const valores = filaObjeto_(hoja, numeroFila);
  const plan = fotoAMover_(valores, columnasEditadas);
  if (!plan) return;
  const archivo = deps.archivoPorId(plan.idArchivo);
  const descripcion = descripcionDeNombreFoto_(archivo.getName()) || textoCelda_(valores.PROVEEDOR);
  if (!descripcion) {
    console.error(`alEditar: sin descripción para mover la foto (fila ${numeroFila})`);
    return;
  }
  clasificarFoto_(archivo, plan.fecha, descripcion, deps.carpetaFacturas());
}

/** Cierra una pregunta y avisa al usuario; un fallo de Telegram nunca deja de cerrarla. */
function cerrarPreguntaYAvisar_(hojaEstado, pregunta, deps) {
  cerrarEstado_(hojaEstado, pregunta.fila);
  if (!pregunta.idMensajeBot) return;
  try {
    quitarBotonesPropuesta_(deps, deps.chatId, pregunta.idMensajeBot);
  } catch (error) {
    console.error(ocultarSecreto_(`alEditar: no se pudieron quitar los botones (mensaje ${pregunta.idMensajeBot}): ${error.message}`));
  }
  try {
    enviarTelegram_(deps, 'sendMessage', {
      chat_id: deps.chatId,
      text: TEXTO_PREGUNTA_CERRADA_HOJA,
      reply_parameters: { message_id: pregunta.idMensajeBot },
    });
  } catch (error) {
    console.error(ocultarSecreto_(`alEditar: no se pudo avisar del cierre (mensaje ${pregunta.idMensajeBot}): ${error.message}`));
  }
}

/** Preguntas de _ESTADO que ya no tienen nada PENDIENTE en sus filas: se cierran y se avisa. */
function cerrarPreguntasResueltas_(ss, hoja, deps) {
  const hojaEstado = ss.getSheetByName(PESTANA_ESTADO);
  if (!hojaEstado) return;
  const filasEstado = filasEstado_(hojaEstado);
  const ids = todosIdsFilas_(filasEstado);
  const filasPorId = new Map(buscarFilas_(ss, ids, hoja.getName()).map((f) => [f.idFila, f.valores]));
  preguntasParaCerrar_(filasEstado, filasPorId)
    .forEach((pregunta) => cerrarPreguntaYAvisar_(hojaEstado, pregunta, deps));
}

/** Lee las filas y arma sus anotaciones antes de intentar tomar el candado. */
function prepararEdicion_(e, deps) {
  const hoja = e.range.getSheet();
  if (!esPestanaMes_(hoja.getName())) return null;
  const numeros = filasDatosTocadas_(e.range.getRow(), e.range.getNumRows());
  if (!numeros.length) return null;
  const columnas = nombreAColumnas_(e.range.getColumn(), e.range.getNumColumns());
  const filas = numeros.map((numero) => ({ numero, valores: filaObjeto_(hoja, numero) }));
  const anotaciones = filas.map(({ valores }) => filaEdicion_(deps.ahora(), hoja.getName(), valores, columnas))
    .filter(Boolean);
  return { hoja, filas, columnas, anotaciones };
}

/** Lógica de alEditar con el candado ya tomado. */
function procesarEdicion_(e, deps, preparados = prepararEdicion_(e, deps)) {
  if (!preparados) return;
  const { hoja, filas, columnas } = preparados;
  const tiempos = { ahora: deps.ahora(), sello: deps.formatear(deps.ahora(), FORMATO_SELLO) };
  const registro = filas.some(({ valores }) => esFilaBotAnotable_(valores))
    ? leerRegistroEdiciones_(e.source, deps.propiedades)
    : registroEdiciones_({ filas: [], corte: '', disponible: false });
  filas.forEach(({ numero: numeroFila, valores }) => {
    sellarYRevisar_(hoja, numeroFila, columnas, tiempos, valores, registro);
    try {
      moverFotoSiCambioFecha_(hoja, numeroFila, columnas, deps);
    } catch (error) {
      console.error(ocultarSecreto_(`alEditar: no se pudo mover la foto (fila ${numeroFila}): ${error.message}`));
    }
  });
  cerrarPreguntasResueltas_(e.source, hoja, deps);
}

/** Guarda las anotaciones; si falla Sheets y también PropertiesService, el disparador lanza. */
function anexarEdiciones_(hoja, anotaciones, propiedades) {
  for (const anotacion of anotaciones) {
    try {
      hoja.appendRow(anotacion);
    } catch (error) {
      try {
        marcarPerdida_(propiedades, `appendRow falló: ${error.message}`);
      } catch (fallo) {
        console.error(`alEditar: anotación perdida ${JSON.stringify(anotacion)}; `
          + `appendRow: ${error.message}; propiedad: ${fallo.message}`);
        throw Object.assign(new Error(fallo.message), { falloCriticoEdiciones: true, cause: fallo });
      }
    }
  }
}

/** Anota antes del candado cuando la pestaña ya está lista; arranca dentro de él si hace falta. */
function anotarAntesDeProcesar_(ss, preparados, deps) {
  if (!preparados || preparados.anotaciones.length === 0) return false;
  const { estado, hoja } = estadoActualEdiciones_(ss, deps.propiedades);
  if (estado === 'LISTA') {
    anexarEdiciones_(hoja, preparados.anotaciones, deps.propiedades);
    return false;
  }
  if (estado === 'PERDIDA') {
    marcarPerdida_(deps.propiedades, 'edición con registro perdido');
    return false;
  }
  if (!deps.candado.tryLock(ESPERA_CANDADO_EDICION_MS)) {
    marcarPerdida_(deps.propiedades, 'sin candado durante arranque');
    console.error('alEditar sin candado');
    return null;
  }
  try {
    arrancarEdiciones_(ss, deps.propiedades, deps.sello());
    anexarEdiciones_(ss.getSheetByName(PESTANA_EDICIONES), preparados.anotaciones, deps.propiedades);
    return true;
  } catch (error) {
    deps.candado.releaseLock();
    throw error;
  }
}

/**
 * Anota antes del candado si el registro está listo; luego procesa la edición bajo candado.
 * Solo propaga el doble fallo de hoja y propiedades. `e.source` es el libro (instalable);
 * `e.range` es el rango editado, nunca `e.value`/`e.oldValue` (multi-celda al pegar).
 */
function manejarEdicion_(e, deps) {
  let candadoTomado = false;
  try {
    const preparados = prepararEdicion_(e, deps);
    const resultado = anotarAntesDeProcesar_(e.source, preparados, deps);
    candadoTomado = resultado === true;
    if (resultado === null) return;
    if (!candadoTomado && !deps.candado.tryLock(ESPERA_CANDADO_EDICION_MS)) {
      console.error('alEditar sin candado');
      return;
    }
    candadoTomado = true;
    procesarEdicion_(e, deps, preparados);
  } catch (error) {
    if (error.falloCriticoEdiciones) throw error;
    console.error(ocultarSecreto_(`alEditar: ${error.message}`));
  } finally {
    if (candadoTomado) deps.candado.releaseLock();
  }
}

function dependenciasEdicionReales_() {
  const propiedades = PropertiesService.getScriptProperties();
  return {
    candado: LockService.getScriptLock(),
    propiedades,
    sello: () => Utilities.formatDate(new Date(), CONFIG.TIMEZONE, FORMATO_SELLO),
    token: propiedades.getProperty('TELEGRAM_TOKEN'),
    chatId: CONFIG.ERIN_CHAT_ID,
    llamar: llamarTelegram_,
    ahora: () => new Date(),
    formatear: (fecha, formato) => Utilities.formatDate(fecha, CONFIG.TIMEZONE, formato),
    // La foto que el usuario ya había mandado, y la carpeta raíz de Facturas donde clasificarla.
    archivoPorId: (id) => DriveApp.getFileById(id),
    carpetaFacturas: () => DriveApp.getFolderById(CONFIG.FACTURAS_FOLDER_ID),
  };
}

/** Disparador onEdit instalable; el doble fallo de anotación llega al correo de Google. */
function alEditar(e) {
  try {
    manejarEdicion_(e, dependenciasEdicionReales_());
  } catch (error) {
    if (error.falloCriticoEdiciones) throw error;
    console.error(ocultarSecreto_(`alEditar: ${error.message}`));
  }
}

/** Recuperación manual: mueve el corte primero y quita la marca solo tras verificar la hoja. */
function revisarEdiciones_(ss, deps) {
  const corte = deps.sello();
  deps.propiedades.setProperty(PROPIEDAD_EDICIONES_CREADA, corte);
  let accion = 'verificada';
  try {
    let hoja = ss.getSheetByName(PESTANA_EDICIONES);
    if (!hoja) {
      crearPestanaOculta_(ss, PESTANA_EDICIONES, COLUMNAS_EDICIONES);
      hoja = ss.getSheetByName(PESTANA_EDICIONES);
      accion = 'creada';
    } else if (hoja.getLastRow() === 0) {
      hoja.getRange(1, 1, 1, COLUMNAS_EDICIONES.length).setValues([[...COLUMNAS_EDICIONES]]);
    }
    if (!hoja || !encabezadosEdicionesOk_(
      hoja.getRange(1, 1, 1, COLUMNAS_EDICIONES.length).getValues()[0],
    )) throw new Error('encabezados inválidos de _EDICIONES');
    const filas = Math.max(0, hoja.getLastRow() - 1);
    deps.propiedades.deleteProperty(PROPIEDAD_EDICIONES_PERDIDA);
    console.log(`revisarEdiciones: corte ${corte}; pestaña ${accion}; ${filas} filas anotadas`);
    return { corte, accion, filas };
  } catch (error) {
    marcarPerdida_(deps.propiedades, `revisarEdiciones falló: ${error.message}`);
    throw error;
  }
}

/** Ejecutar a mano desde el editor para recuperar el registro de ediciones. */
function revisarEdiciones() {
  const deps = {
    candado: LockService.getScriptLock(), propiedades: PropertiesService.getScriptProperties(),
    sello: () => Utilities.formatDate(new Date(), CONFIG.TIMEZONE, FORMATO_SELLO),
  };
  if (!deps.candado.tryLock(30000)) {
    throw new Error('revisarEdiciones: candado ocupado, vuelve a correrla');
  }
  try {
    return revisarEdiciones_(SpreadsheetApp.openById(CONFIG.SHEET_ID), deps);
  } finally {
    deps.candado.releaseLock();
  }
}

if (typeof module !== 'undefined') {
  module.exports = {
    ESPERA_CANDADO_EDICION_MS, nombreAColumnas_, filaObjeto_, todosIdsFilas_, moverFotoSiCambioFecha_, sellarYRevisar_,
    prepararEdicion_, anexarEdiciones_, anotarAntesDeProcesar_, procesarEdicion_, manejarEdicion_,
    dependenciasEdicionReales_, alEditar, revisarEdiciones_, revisarEdiciones,
  };
}
