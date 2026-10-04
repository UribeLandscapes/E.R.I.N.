/**
 * copiarAExcel, la capa Apps Script del espejo hoja -> Excel (lógica en Espejo.js).
 * Un disparador de tiempo lo llama cada INTERVALO_ESPEJO_MINUTOS; si la hoja no cambió desde la
 * última copia no hace nada. Usa CONFIG de Config.js; debeCopiar_, urlExportarXlsx_,
 * validarRespuestaExport_ y TIPO_XLSX de Espejo.js.
 */
const CLAVE_ESPEJO_ULTIMA_COPIA = 'ESPEJO_ULTIMA_COPIA';
const ESPERA_CANDADO_ESPEJO_MS = 5000; // corto: si otra copia corre, este turno se salta

const mensajeEspejo_ = (error) => (error && error.message) || String(error);

/** Exporta y sobrescribe el Excel. Lanza (sin tocar el Excel) si la exportación no fue 200. */
function exportarYSobrescribir_(deps) {
  const respuesta = deps.exportarXlsx();
  const codigo = respuesta.getResponseCode();
  try {
    validarRespuestaExport_(codigo, codigo === 200 ? '' : respuesta.getContentText());
  } catch (error) {
    deps.log(`copiarAExcel: ${mensajeEspejo_(error)}`);
    throw error;
  }
  deps.sobrescribirExcel(respuesta.getBlob().setContentType(TIPO_XLSX));
}

/**
 * Núcleo testeable. Lee la marca de la hoja ANTES de exportar y esa misma guarda al terminar, así una
 * edición hecha durante la exportación se copia en el turno siguiente. Un error se registra y se
 * vuelve a lanzar (ejecución en rojo); la marca solo se guarda si el Excel ya se sobrescribió.
 */
function copiarAExcelConDeps_(deps) {
  if (!deps.candado.tryLock(ESPERA_CANDADO_ESPEJO_MS)) {
    deps.log('copiarAExcel: otra copia está en curso (sin candado), se salta este turno');
    return;
  }
  try {
    const modificada = deps.ultimaModificacion();
    if (!debeCopiar_(modificada, deps.leerUltimaCopia())) {
      deps.log('copiarAExcel: sin cambios desde la última copia');
      return;
    }
    exportarYSobrescribir_(deps);
    deps.guardarUltimaCopia(String(modificada));
    deps.log(`copiarAExcel: Excel actualizado (hoja modificada ${new Date(modificada).toISOString()})`);
  } catch (error) {
    deps.log(`copiarAExcel: error, no se guarda la marca (${mensajeEspejo_(error)})`);
    throw error;
  } finally {
    deps.candado.releaseLock();
  }
}

function dependenciasEspejoReales_() {
  const propiedades = PropertiesService.getScriptProperties();
  return {
    candado: LockService.getScriptLock(),
    ultimaModificacion: () => DriveApp.getFileById(CONFIG.SHEET_ID).getLastUpdated().getTime(),
    leerUltimaCopia: () => propiedades.getProperty(CLAVE_ESPEJO_ULTIMA_COPIA),
    guardarUltimaCopia: (marca) => propiedades.setProperty(CLAVE_ESPEJO_ULTIMA_COPIA, marca),
    exportarXlsx: () => UrlFetchApp.fetch(urlExportarXlsx_(CONFIG.SHEET_ID), {
      headers: { Authorization: `Bearer ${ScriptApp.getOAuthToken()}` },
      muteHttpExceptions: true,
    }),
    sobrescribirExcel: (blob) => Drive.Files.update({}, CONFIG.EXCEL_ESPEJO_ID, blob),
    log: (linea) => Logger.log(linea),
  };
}

/** Disparador de tiempo (cada 5 minutos) o a mano desde el editor. */
function copiarAExcel() {
  copiarAExcelConDeps_(dependenciasEspejoReales_());
}

if (typeof module !== 'undefined') {
  module.exports = {
    CLAVE_ESPEJO_ULTIMA_COPIA, ESPERA_CANDADO_ESPEJO_MS, copiarAExcelConDeps_,
    dependenciasEspejoReales_, copiarAExcel,
  };
}
