/**
 * Espejo de un solo sentido, la hoja de la caja chica -> Excel existente en Drive
 * (CONFIG.EXCEL_ESPEJO_ID). Lógica pura, sin Apps Script: la capa que habla con Google es EspejoApp.js.
 * Regla del dueño: cada 5 minutos, solo si hubo cambio; sin cambio no se hace nada.
 */
const INTERVALO_ESPEJO_MINUTOS = 5;
const TIPO_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const LARGO_CUERPO_ERROR_ESPEJO = 200; // del cuerpo de una respuesta fallida solo se guarda el inicio
const FORMA_ID_DRIVE_ESPEJO = /^[A-Za-z0-9_-]+$/;

/**
 * ¿Hay que copiar? `ultimaModificacion` son milisegundos de la hoja; `ultimaCopia` es la marca
 * guardada (texto o número). Sin marca legible copia; una modificación ilegible lanza error.
 */
function debeCopiar_(ultimaModificacion, ultimaCopia) {
  if (typeof ultimaModificacion !== 'number' || !Number.isFinite(ultimaModificacion)) {
    throw new Error(`debeCopiar_: última modificación inválida (${String(ultimaModificacion)})`);
  }
  const marca = typeof ultimaCopia === 'string' && ultimaCopia.trim() === '' ? NaN : Number(ultimaCopia);
  if (ultimaCopia === null || ultimaCopia === undefined || !Number.isFinite(marca)) return true;
  return ultimaModificacion > marca;
}

/** URL de exportación a xlsx de una hoja de cálculo de Google. */
function urlExportarXlsx_(idHoja) {
  if (typeof idHoja !== 'string' || !FORMA_ID_DRIVE_ESPEJO.test(idHoja)) {
    throw new Error('urlExportarXlsx_: id de hoja inválido');
  }
  return `https://docs.google.com/spreadsheets/d/${idHoja}/export?format=xlsx`;
}

/** Lanza si la exportación no fue HTTP 200; el mensaje lleva el código y solo el inicio del cuerpo. */
function validarRespuestaExport_(codigo, cuerpo) {
  if (codigo === 200) return;
  const resumen = String(cuerpo === null || cuerpo === undefined ? '' : cuerpo).slice(0, LARGO_CUERPO_ERROR_ESPEJO);
  throw new Error(`exportar xlsx falló: HTTP ${codigo} ${resumen}`.trim());
}

if (typeof module !== 'undefined') {
  module.exports = {
    INTERVALO_ESPEJO_MINUTOS, TIPO_XLSX, debeCopiar_, urlExportarXlsx_, validarRespuestaExport_,
  };
}
