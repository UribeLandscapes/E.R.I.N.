/**
 * Capa Drive/SpreadsheetApp: lee los Excel de la carpeta de historial y agrega a
 * _HISTORIAL las filas que todavía no están. La lectura del.xlsx sale de Historial.js.
 * Correrla dos veces no duplica: cada fila lleva su CLAVE.
 */
const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const COLUMNAS_TEXTO_HISTORIAL = Object.freeze(['PROVEEDOR', 'CLASE DE GASTO', 'ARCHIVO', 'PESTAÑA', 'CLAVE']);
const indiceHistorial_ = (nombre) => COLUMNAS_HISTORIAL.indexOf(nombre);

const esExcel_ = (archivo) => /\.xlsx$/i.test(archivo.getName()) || archivo.getMimeType() === MIME_XLSX;

/**
 *.xlsx → { ruta: texto }. Cada texto se lee solo cuando Historial.js lo pide, así el XML de las
 * pestañas PLANILLA (números de cuenta) nunca se convierte en texto.
 * setContentType('application/zip'): truco de la comunidad, no documentado por Google.
 */
function textosXlsx_(archivo) {
  const textos = {};
  Utilities.unzip(archivo.getBlob().setContentType('application/zip')).forEach((blob) => {
    Object.defineProperty(textos, blob.getName(), {
      enumerable: true, get: () => blob.getDataAsString('UTF-8'),
    });
  });
  return textos;
}

/** Excel de la carpeta, ordenados por nombre (07., 08., 09. …). */
function archivosExcel_(carpeta) {
  const archivos = [];
  const iterador = carpeta.getFiles();
  while (iterador.hasNext()) {
    const archivo = iterador.next();
    if (esExcel_(archivo)) archivos.push(archivo);
  }
  return archivos.sort((a, b) => a.getName().localeCompare(b.getName()));
}

/** Un Excel → lotes { archivo, pestana, registros } de las pestañas que tienen gastos. */
function lotesDeArchivo_(archivo) {
  const nombre = archivo.getName();
  try {
    const libro = leerLibroXlsx_(textosXlsx_(archivo));
    return libro.pestanas
      .map((p) => ({ archivo: nombre, pestana: p.nombre, registros: conClaves_(registrosDePestana_(p.filas, libro.fecha1904, { exacto: true })) }))
      .filter((lote) => lote.registros.length > 0);
  } catch (e) {
    throw new Error(`${nombre}: ${e.message}`);
  }
}

/** Filas de _HISTORIAL debajo del encabezado. */
function filasHistorial_(hoja) {
  const ultima = hoja.getLastRow();
  if (ultima < 2) return [];
  return hoja.getRange(2, 1, ultima - 1, COLUMNAS_HISTORIAL.length).getValues();
}

/** "2026-07-01" → Date a medianoche en la zona del script (America/Panama). */
function fechaLocal_(texto) {
  const [anio, mes, dia] = texto.split('-').map(Number);
  return new Date(anio, mes - 1, dia);
}

/**
 * Escribe las filas desde `inicio` (por omisión, al final); las columnas de texto van como texto
 * para que nada se lea como fórmula o número.
 */
function escribirHistorial_(hoja, filas, inicio = hoja.getLastRow() + 1) {
  COLUMNAS_TEXTO_HISTORIAL.forEach((nombre) => {
    hoja.getRange(inicio, indiceHistorial_(nombre) + 1, filas.length, 1).setNumberFormat('@');
  });
  hoja.getRange(inicio, 1, filas.length, COLUMNAS_HISTORIAL.length)
    .setValues(filas.map(([fecha, ...resto]) => [fechaLocal_(fecha), ...resto]));
}

/**
 * Importa todos los Excel de la carpeta a _HISTORIAL en una sola escritura. Si un archivo falla,
 * no se escribe nada. Devuelve las líneas del registro.
 */
function importarHistorial_(carpeta, hoja) {
  const lotes = archivosExcel_(carpeta).flatMap(lotesDeArchivo_);
  const existentes = filasHistorial_(hoja);
  const claves = existentes.map((f) => String(f[indiceHistorial_('CLAVE')]));
  const { filas, repetidas } = filasNuevasHistorial_(lotes, claves);
  if (filas.length > 0) escribirHistorial_(hoja, filas);

  const nuevasDe = (lote) => filas.filter((f) => f[indiceHistorial_('ARCHIVO')] === lote.archivo
    && f[indiceHistorial_('PESTAÑA')] === lote.pestana).length;
  const clase = indiceHistorial_('CLASE DE GASTO');
  return [
    ...lotes.map((l) => `${l.archivo} / ${l.pestana}: ${l.registros.length} leídas, ${nuevasDe(l)} nuevas`),
    `Total: ${filas.length} filas nuevas, ${repetidas} repetidas saltadas`,
    `_HISTORIAL: ${existentes.length + filas.length} filas, `
      + `${contarCategorias_([...existentes, ...filas].map((f) => f[clase]))} categorías distintas`,
  ];
}

/**
 * Vacía _HISTORIAL (filas 2 en adelante) y lo reescribe con los montos exactos de los Excel.
 * Lee y arma todo antes de tocar la hoja: si un archivo falla, lanza y no se borra nada.
 * PARO (sin borrar ni escribir) si la carpeta no tiene Excel o si salen menos filas que las que hay.
 */
function reimportarHistorialExacto_(carpeta, hoja) {
  const archivos = archivosExcel_(carpeta);
  if (archivos.length === 0) return ['PARO: no hay Excel en la carpeta de historial; no se tocó _HISTORIAL'];
  const lotes = archivos.flatMap(lotesDeArchivo_);
  const { filas } = filasNuevasHistorial_(lotes, []);
  const antes = Math.max(hoja.getLastRow() - 1, 0);
  if (filas.length < antes) {
    return [`PARO: _HISTORIAL tiene ${antes} filas y la lectura da solo ${filas.length}; `
      + 'probablemente falta un Excel en la carpeta. No se borró ni se escribió nada'];
  }
  if (antes > 0) hoja.getRange(2, 1, antes, COLUMNAS_HISTORIAL.length).clearContent();
  if (filas.length > 0) escribirHistorial_(hoja, filas, 2);
  const clase = indiceHistorial_('CLASE DE GASTO');
  return [
    ...lotes.map((l) => `${l.archivo} / ${l.pestana}: ${l.registros.length} leídas`),
    `Antes: ${antes} filas; ahora: ${filas.length} filas`,
    `_HISTORIAL: ${contarCategorias_(filas.map((f) => f[clase]))} categorías distintas`,
  ];
}

/** Ejecutar desde el editor: deja _HISTORIAL con los montos exactos del Excel (sin redondear). */
function reimportarHistorialExacto() {
  const hoja = SpreadsheetApp.openById(CONFIG.SHEET_ID).getSheetByName(PESTANA_HISTORIAL);
  if (!hoja) throw new Error(`falta la pestaña ${PESTANA_HISTORIAL}: corre configurarHoja primero`);
  const lineas = reimportarHistorialExacto_(DriveApp.getFolderById(CONFIG.HISTORIAL_FOLDER_ID), hoja);
  lineas.forEach((linea) => Logger.log(linea));
  return lineas;
}

/** Ejecutar desde el editor (del plan), después de configurarHoja. */
function importarHistorial() {
  const hoja = SpreadsheetApp.openById(CONFIG.SHEET_ID).getSheetByName(PESTANA_HISTORIAL);
  if (!hoja) throw new Error(`falta la pestaña ${PESTANA_HISTORIAL}: corre configurarHoja primero`);
  const lineas = importarHistorial_(DriveApp.getFolderById(CONFIG.HISTORIAL_FOLDER_ID), hoja);
  lineas.forEach((linea) => Logger.log(linea));
  return lineas;
}

if (typeof module !== 'undefined') {
  module.exports = {
    MIME_XLSX, esExcel_, textosXlsx_, archivosExcel_, lotesDeArchivo_, filasHistorial_, fechaLocal_,
    escribirHistorial_, importarHistorial_, importarHistorial, reimportarHistorialExacto_, reimportarHistorialExacto,
  };
}
