/**
 * Lógica pura: nombres de carpetas y de fotos en Facturas/AAAA/N. Mes/.
 * Usa `leerFecha_` de Reglas.js y `MESES` de Hoja.js. La capa Drive está en CarpetasApp.js.
 */
const DESCRIPCION_MAX_PALABRAS = 5;
const DESCRIPCION_MAX_CARACTERES = 60;
const DESCRIPCION_VACIA = 'factura';
// Caracteres que Windows/Mac no aceptan al descargar, más los de control (saltos, tabs).
const CARACTERES_PROHIBIDOS = /[/\\:*?"<>|\u0000-\u001f\u007f]/g;
const EXTENSIONES_MIME = Object.freeze({
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/heic': '.heic',
  'application/pdf': '.pdf',
});
// Solo una extensión corta sin espacios: los puntos de "2026.07.03 - taxi" no cuentan.
const FORMA_EXTENSION = /\.[A-Za-z0-9]{1,5}$/;

/** 7 → "7. Julio" */
function nombreCarpetaMes_(mes) {
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) throw new Error(`mes inválido: ${mes}`);
  const nombre = MESES[mes - 1];
  return `${mes}. ${nombre.charAt(0).toUpperCase()}${nombre.slice(1)}`;
}

/** "2026-07-03" → ["2026", "7. Julio"] (carpetas debajo de Facturas). */
function rutaMes_(fecha) {
  const { anio, mes } = leerFecha_(fecha);
  return [String(anio), nombreCarpetaMes_(mes)];
}

/** Texto libre → máximo 5 palabras y 60 caracteres, sin caracteres prohibidos. */
function descripcionCorta_(texto) {
  const palabras = String(texto || '').replace(CARACTERES_PROHIBIDOS, ' ').split(/\s+/).filter(Boolean);
  const corta = palabras.slice(0, DESCRIPCION_MAX_PALABRAS).join(' ')
    .slice(0, DESCRIPCION_MAX_CARACTERES).trim();
  return corta || DESCRIPCION_VACIA;
}

/** "image/jpeg" → ".jpg"; tipo desconocido → "" (sin extensión). */
const extensionMime_ = (mime) => EXTENSIONES_MIME[String(mime || '').toLowerCase()] || '';

/** "AAAA.MM.DD - descripción.ext" */
function nombreFoto_(fecha, descripcion, mime) {
  leerFecha_(fecha);
  return `${fecha.replace(/-/g, '.')} - ${descripcionCorta_(descripcion)}${extensionMime_(mime)}`;
}

/** Si `existe(nombre)`, prueba "nombre (2).ext", "nombre (3).ext"… */
function nombreLibre_(nombre, existe) {
  if (!existe(nombre)) return nombre;
  const extension = (FORMA_EXTENSION.exec(nombre) || [''])[0];
  const base = nombre.slice(0, nombre.length - extension.length);
  let n = 2;
  while (existe(`${base} (${n})${extension}`)) n += 1;
  return `${base} (${n})${extension}`;
}

if (typeof module !== 'undefined') {
  module.exports = {
    nombreCarpetaMes_, rutaMes_, descripcionCorta_, extensionMime_, nombreFoto_, nombreLibre_,
  };
}
