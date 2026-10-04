/**
 * Capa DriveApp: archiva cada foto apenas llega (Facturas/Por clasificar) y, cuando
 * ya se sabe la fecha de la factura, la mueve a Facturas/AAAA/N. Mes/ con su nombre final.
 * Los nombres salen de Carpetas.js. Las carpetas que faltan se crean.
 */
const CARPETA_POR_CLASIFICAR = 'Por clasificar';

/** Carpeta hija con ese nombre; si no existe, la crea. */
function carpetaHija_(padre, nombre) {
  const existentes = padre.getFoldersByName(nombre);
  return existentes.hasNext() ? existentes.next() : padre.createFolder(nombre);
}

/** Facturas/AAAA/N. Mes de la fecha, creando lo que falte. */
const carpetaMes_ = (raiz, fecha) => rutaMes_(fecha).reduce(carpetaHija_, raiz);

/** Guarda la foto recién llegada con nombre temporal "tg-<id del mensaje>.ext". */
function archivarFoto_(blob, idMensaje, raiz) {
  if (idMensaje === '' || idMensaje === null || idMensaje === undefined) throw new Error('id de mensaje vacío');
  const archivo = carpetaHija_(raiz, CARPETA_POR_CLASIFICAR).createFile(blob);
  return archivo.setName(`tg-${idMensaje}${extensionMime_(blob.getContentType())}`);
}

/** ¿Hay en la carpeta otro archivo (no este) con ese nombre? */
function otroConNombre_(carpeta, nombre, archivo) {
  const iguales = carpeta.getFilesByName(nombre);
  while (iguales.hasNext()) {
    if (iguales.next().getId() !== archivo.getId()) return true;
  }
  return false;
}

function estaEn_(archivo, carpeta) {
  const padres = archivo.getParents();
  while (padres.hasNext()) {
    if (padres.next().getId() === carpeta.getId()) return true;
  }
  return false;
}

/**
 * Mueve la foto a la carpeta del mes de la factura y le pone el nombre final. Repetirla con los
 * mismos datos no cambia nada; con otra fecha la mueve al mes nuevo. Devuelve { ruta, url }.
 */
function clasificarFoto_(archivo, fecha, descripcion, raiz) {
  const deseado = nombreFoto_(fecha, descripcion, archivo.getMimeType());
  const destino = carpetaMes_(raiz, fecha);
  const nombre = nombreLibre_(deseado, (n) => otroConNombre_(destino, n, archivo));
  if (!estaEn_(archivo, destino)) archivo.moveTo(destino);
  archivo.setName(nombre);
  return { ruta: [raiz.getName(), ...rutaMes_(fecha), nombre].join('/'), url: archivo.getUrl() };
}

/**
 * Ejecutar desde el editor (del plan): crea una foto de prueba, la clasifica con la fecha
 * de hoy y la manda a la papelera. Deja creadas "Por clasificar" y la carpeta del mes actual.
 */
function probarCarpetas() {
  const raiz = DriveApp.getFolderById(CONFIG.FACTURAS_FOLDER_ID);
  const hoy = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd');
  const archivo = archivarFoto_(Utilities.newBlob('prueba', 'image/jpeg', 'prueba.jpg'), 'prueba', raiz);
  const lineas = [`Archivada: ${raiz.getName()}/${CARPETA_POR_CLASIFICAR}/${archivo.getName()}`];
  try {
    const { ruta } = clasificarFoto_(archivo, hoy, 'prueba de carpetas', raiz);
    lineas.push(`Clasificada: ${ruta}`);
  } finally {
    archivo.setTrashed(true);
  }
  lineas.push('Archivo de prueba enviado a la papelera');
  lineas.forEach((linea) => Logger.log(linea));
  return lineas;
}

if (typeof module !== 'undefined') {
  module.exports = {
    CARPETA_POR_CLASIFICAR, carpetaHija_, carpetaMes_, archivarFoto_, clasificarFoto_, probarCarpetas,
  };
}
