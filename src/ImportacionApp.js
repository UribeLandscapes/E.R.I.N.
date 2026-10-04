/**
 * Capa Drive/SpreadsheetApp: importa los Excel viejos de la carpeta de historial (los meses
 * de CONFIG.HISTORIAL_MESES del año CONFIG.HISTORIAL_ANIO) como pestañas "<Mes> <año> (archivo)". El nombre con sufijo hace que leerPestanaMes_
 * las ignore: el bot no las cuenta en saldo, alEditar, búsqueda ni encadenado.
 * Usa la lógica pura de Importacion.js; archivosExcel_ y textosXlsx_ de HistorialApp.js;
 * leerLibroXlsx_ de Historial.js; escribirCabeceraMes_ y darFormatoMes_ de HojaApp.js;
 * COLUMNAS, FILA_TITULO, PRIMERA_FILA_DATOS, numeroColumna_, datos_, leerPestanaMes_,
 * posicionPestanaMes_ y nombrePestanaMes_ de Hoja.js; CONFIG. Todos globales en Apps Script.
 * NO usa crearPestanaMes_: ese cambia el saldo inicial del mes siguiente.
 */
const ESPERA_CANDADO_IMPORTACION_MS = 30000;
/** Nota de A1: solo la lleva una pestaña de archivo cuyos datos ya se escribieron y cuadraron. */
const MARCA_ARCHIVO_IMPORTADO = 'ERIN-IMPORTACION-ARCHIVO-v1';
const SUFIJO_PESTANA_ARCHIVO = ' (archivo)';
/**
 * Columnas de texto seguro: con formato de texto, Sheets no convierte "2026-07-05" en fecha ni un
 * comentario "438.8752631578947" en número (lo guardaría con 15 cifras y el cuadre no pasaría).
 */
const COLUMNAS_TEXTO_IMPORTACION = Object.freeze(['FECHA', 'COMENTARIOS', 'CASA', 'TIPO', 'ORIGEN', 'ID FILA']);
/** Columnas de texto que el cuadre compara fila por fila (REGISTRADO es Date y las de dinero ya suman). */
const COLUMNAS_CUADRE_TEXTO = Object.freeze([
  'FECHA', 'PROVEEDOR', 'CLASE DE GASTO', 'COMENTARIOS', 'CASA', 'TIPO', 'ORIGEN', 'ID FILA',
]);
/** Lo que textoSeguroCelda_ antepone el apóstrofo: Sheets lo consume y no lo devuelve al leer. */
const ESCAPE_ANTEPUESTO = /^'[=+\-@\t\r]/;

const claveMesImportacion_ = (mesAnio) => mesAnio.anio * 12 + mesAnio.mes;
const motivoDeError_ = (error) => (error instanceof Error ? error.message : String(error));
const celdaMarcaArchivo_ = (hoja) => hoja.getRange(`A${FILA_TITULO}`);
const tieneMarcaArchivo_ = (hoja) => celdaMarcaArchivo_(hoja).getNote() === MARCA_ARCHIVO_IMPORTADO;

/**
 * Archivos que sí se importan, en orden cronológico (no el de Drive). Los demás se anotan y se
 * saltan SIN abrir su contenido. Dos archivos del mismo mes paran todo antes de tocar la hoja.
 */
function archivosAImportar_(archivos, anotar) {
  const elegidos = [];
  archivos.forEach((archivo) => {
    const nombre = archivo.getName();
    const mesAnio = mesDeArchivo_(nombre);
    if (!mesAnio) return anotar(`${nombre}: sin mes`);
    if (!archivoIncluido_(mesAnio)) return anotar(`${nombre}: no incluido`);
    return elegidos.push({ archivo, nombre, ...mesAnio });
  });
  elegidos.sort((a, b) => claveMesImportacion_(a) - claveMesImportacion_(b));
  elegidos.forEach((actual, i) => {
    const previo = elegidos[i - 1];
    if (previo && claveMesImportacion_(previo) === claveMesImportacion_(actual)) {
      throw new Error(`dos archivos para ${nombrePestanaMes_(actual.anio, actual.mes).toLowerCase()}: `
        + `${previo.nombre} y ${actual.nombre}`);
    }
  });
  return elegidos;
}

/** Nombres de pestañas donde cada "(archivo)" cuenta como su mes, para ordenar entre sí y con los meses reales. */
function nombresParaOrdenar_(ss) {
  return ss.getSheets().map((hoja) => {
    const nombre = hoja.getName();
    if (!nombre.endsWith(SUFIJO_PESTANA_ARCHIVO)) return nombre;
    const base = nombre.slice(0, -SUFIJO_PESTANA_ARCHIVO.length);
    return leerPestanaMes_(base) ? base : nombre;
  });
}

/**
 * Índice donde va la pestaña "(archivo)". Si ya hay una pestaña real de ese mes (p. ej. una de
 * prueba que quedó vacía), va justo antes de ella en vez de parar: el importador nunca la toca.
 */
function indicePestanaArchivo_(nombres, anio, mes) {
  const real = nombres.findIndex((nombre) => {
    const m = leerPestanaMes_(nombre);
    return m && m.anio === anio && m.mes === mes;
  });
  return real >= 0 ? real : posicionPestanaMes_(nombres, anio, mes).indice;
}

/** Lo escrito en la hoja, leído de vuelta: filas (con ID FILA), depósitos y gastos con los decimales tal cual. */
function leerCuadreArchivo_(hoja, cuantas, ancho, desde = PRIMERA_FILA_DATOS) {
  const filas = hoja.getRange(desde, 1, cuantas, ancho).getValues();
  const suma = (nombre) => redondearTotal_(filas.reduce((total, f) => {
    const valor = f[numeroColumna_(nombre) - 1];
    return total + (valor === '' || valor === null ? 0 : Number(valor));
  }, 0));
  return {
    valores: filas,
    filas: filas.filter((f) => String(f[numeroColumna_('ID FILA') - 1]).trim() !== '').length,
    depositos: suma('DEPÓSITO'), gastos: suma('GASTO (USD)'),
  };
}

/** Texto escrito tal como Sheets lo devuelve: sin el apóstrofo de escape que puso filasImportacion_. */
const textoEscrito_ = (valor) => textoCelda_(typeof valor === 'string' && ESCAPE_ANTEPUESTO.test(valor)
  ? valor.slice(1) : valor);

/**
 * Primer texto distinto, fila por fila: "fila N columna X" (N = fila de la hoja). Un Date leído en
 * FECHA (Sheets la convirtió) solo vale si es el mismo día, pues textoCelda_ lo pasa a AAAA-MM-DD.
 */
function primerTextoDistinto_(escritas, leidas, desde = PRIMERA_FILA_DATOS) {
  const columnas = COLUMNAS_CUADRE_TEXTO.map((nombre) => [nombre, numeroColumna_(nombre) - 1]);
  for (let i = 0; i < escritas.length; i += 1) {
    const distinta = columnas.find(([, c]) => textoEscrito_(escritas[i][c]) !== textoCelda_(leidas[i][c]));
    if (distinta) return `fila ${desde + i} columna ${distinta[0]}`;
  }
  return null;
}

/** Lanza si lo leído no coincide con el Excel en filas, depósitos, gastos o en algún texto escrito. */
function comprobarCuadreArchivo_(leido, esperado, escritas, desde = PRIMERA_FILA_DATOS) {
  const distintos = [['filas', 'filas'], ['depositos', 'depósitos'], ['gastos', 'gastos']]
    .filter(([campo]) => (campo === 'filas' ? leido[campo] !== esperado[campo] : !igualMonto_(leido[campo], esperado[campo])))
    .map(([campo, etiqueta]) => `${etiqueta} (Excel ${esperado[campo]}, hoja ${leido[campo]})`);
  const texto = primerTextoDistinto_(escritas, leido.valores, desde);
  if (texto) distintos.push(texto);
  if (distintos.length > 0) throw new Error(`no cuadra: ${distintos.join(', ')}`);
}

/**
 * Crea la pestaña "(archivo)" en su lugar, escribe cabecera, formato y todas las filas de una vez,
 * cuadra lo escrito contra el Excel y SOLO entonces pone la marca (última mutación de la pestaña).
 */
function crearPestanaArchivo_(ss, lote, ahora) {
  const nombre = nombrePestanaArchivo_(lote.anio, lote.mes);
  const filas = filasImportacion_(lote.registros, ahora);
  const esperado = totalesImportacion_(lote.registros);
  const ancho = numeroColumna_('GRUPO') - 1; // GRUPO (última) es el desborde de fórmula: no se escribe
  const indice = indicePestanaArchivo_(nombresParaOrdenar_(ss), lote.anio, lote.mes);
  const hoja = ss.insertSheet(nombre, indice);
  escribirCabeceraMes_(hoja, nombre, null);
  darFormatoMes_(hoja);
  const falta = PRIMERA_FILA_DATOS + filas.length - 1 - hoja.getMaxRows();
  if (falta > 0) hoja.insertRowsAfter(hoja.getMaxRows(), falta);
  COLUMNAS_TEXTO_IMPORTACION.forEach((columna) => hoja.getRange(datos_(columna)).setNumberFormat('@'));
  const escritas = filas.map((f) => f.slice(0, ancho));
  hoja.getRange(PRIMERA_FILA_DATOS, 1, filas.length, ancho).setValues(escritas);
  comprobarCuadreArchivo_(leerCuadreArchivo_(hoja, filas.length, ancho), esperado, escritas);
  celdaMarcaArchivo_(hoja).setNote(MARCA_ARCHIVO_IMPORTADO);
  return { nombre, esperado };
}

/**
 * Un archivo de la lista: salta si ya está importado; si su pestaña existe sin marca PARA ese mes sin
 * tocarla (puede tener celdas editadas a mano: el programa nunca borra); si no, la crea y anota el cuadre.
 */
function importarUnArchivo_(ss, lote, ahora, anotar) {
  const nombrePestana = nombrePestanaArchivo_(lote.anio, lote.mes);
  const existente = ss.getSheetByName(nombrePestana);
  if (existente && tieneMarcaArchivo_(existente)) {
    return anotar(`${lote.nombre}: ya importado (${nombrePestana})`);
  }
  if (existente) {
    return anotar(`${lote.nombre}: PARO: la pestaña "${nombrePestana}" existe a medias (sin marca); `
      + 'revísala y bórrala a mano si no tiene cambios tuyos, luego vuelve a correr');
  }
  const libro = leerLibroXlsx_(textosXlsx_(lote.archivo));
  const plan = planImportacion_(lote.nombre, libro);
  if (!plan.incluido) return anotar(`${lote.nombre}: ${plan.motivo}`);
  if (plan.registros.length === 0) return anotar(`${lote.nombre}: sin registros`);
  const { esperado } = crearPestanaArchivo_(ss, { ...lote, registros: plan.registros }, ahora);
  return anotar(`${lote.nombre}: ${esperado.filas} filas leídas, depósitos ${dineroExacto_(esperado.depositos)}, `
    + `gastos ${dineroExacto_(esperado.gastos)} (${nombrePestana})`);
}

/**
 * Importa los meses de CONFIG.HISTORIAL_MESES (año CONFIG.HISTORIAL_ANIO) con el candado del script. Devuelve las líneas del registro (que
 * también van a deps.log una por una, así un fallo posterior no borra lo ya terminado). Un error
 * de un archivo lleva su nombre y se relanza; los motivos esperados de exclusión siguen adelante.
 * Sin ningún Excel de esos meses en la carpeta deja un PARO: una corrida vacía nunca es muda.
 */
function importarArchivosViejos_(deps) {
  const lineas = [];
  const anotar = (linea) => { lineas.push(linea); deps.log(linea); };
  if (!deps.candado.tryLock(ESPERA_CANDADO_IMPORTACION_MS)) {
    anotar('PARO: no se pudo tomar el candado; no se tocó nada');
    return lineas;
  }
  try {
    const ss = deps.libro();
    const lotes = archivosAImportar_(archivosExcel_(deps.carpeta()), anotar);
    if (lotes.length === 0) {
      anotar('PARO: la carpeta no tiene Excel de los meses a importar (CONFIG.HISTORIAL_MESES); no se tocó nada '
        + '(revisa CONFIG.HISTORIAL_FOLDER_ID)');
      return lineas;
    }
    lotes.forEach((lote) => {
      try {
        importarUnArchivo_(ss, lote, deps.ahora(), anotar);
      } catch (error) {
        anotar(`${lote.nombre}: ERROR ${motivoDeError_(error)}`);
        throw new Error(`${lote.nombre}: ${motivoDeError_(error)}`);
      }
    });
    return lineas;
  } finally {
    deps.candado.releaseLock();
  }
}

/** Dependencias reales: libro y carpeta de historial de CONFIG, candado del script y Logger. */
function dependenciasImportacion_() {
  return {
    libro: () => SpreadsheetApp.openById(CONFIG.SHEET_ID),
    carpeta: () => DriveApp.getFolderById(CONFIG.HISTORIAL_FOLDER_ID),
    candado: LockService.getScriptLock(),
    ahora: () => new Date(),
    log: (linea) => Logger.log(linea),
  };
}

/** Ejecutar a mano desde el editor, sin disparador. Correrla otra vez no duplica. */
function importarArchivosViejos() {
  return importarArchivosViejos_(dependenciasImportacion_());
}

if (typeof module !== 'undefined') {
  module.exports = {
    ESPERA_CANDADO_IMPORTACION_MS, MARCA_ARCHIVO_IMPORTADO, archivosAImportar_, nombresParaOrdenar_,
    indicePestanaArchivo_, importarArchivosViejos_, dependenciasImportacion_, importarArchivosViejos,
  };
}
