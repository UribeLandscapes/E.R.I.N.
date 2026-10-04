/**
 * Capa de app: baja la foto que el usuario mandó, la archiva de una vez (Facturas/Por
 * clasificar) y la manda a Gemini para leerla, con el respaldo de Groq
 * si Gemini falla del todo. Todo lo de Google/Telegram entra por `deps` (token, llamar, descargar,
 * base64, claveGemini, claveGroq, ocr, categorias, hoy), como en MensajesApp.js.
 * Usa fotoDeMensaje_, MIME_FOTO_PERMITIDOS y cuerpoFotoGemini_ de Foto.js; archivarFoto_ y
 * clasificarFoto_ de CarpetasApp.js; descripcionCorta_ de Carpetas.js; llamarGemini_,
 * llamarGeminiConReintento_ y describirError_ de Gemini.js; leerExtraccion_ y debeReleer_ de
 * Extraccion.js; nombresGrupos_ de Clases.js; CONFIG de Config.js; detalleTelegram_ de
 * WebhookApp.js; rutaGroqFoto_ y cuerpoGeminiConTextoOcr_ de Groq.js; llamarConRespaldoGroq_ de
 * GroqApp.js.
 *
 * IMPORTANTE (seguridad): la URL de descarga de Telegram lleva el token del bot
 * (https://api.telegram.org/file/bot<token>/<file_path>). Ningún `motivo` que devuelve este
 * archivo la arma ni reenvía el texto de un error que pudiera traerla (deps.descargar puede
 * lanzar con la URL adentro): siempre un texto genérico, fijo.
 */
// Bot API: getFile no deja bajar un archivo de más de 20 MB (documentación revisada).
const LIMITE_DESCARGA_FOTO_BYTES = 20 * 1024 * 1024;
const URL_TELEGRAM_ARCHIVO_ = 'https://api.telegram.org/file/bot';
// Telegram puede no conservar el MIME real: si el blob no trae uno de los permitidos, se adivina
// por la extensión del file_path (Bot API: JPEG, PNG, WEBP, HEIC, HEIF, más PDF).
const EXTENSION_A_MIME_ = Object.freeze({
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.pdf': 'application/pdf',
});

/** MIME por la extensión de `filePath`, o null si no es una de las conocidas. */
function mimeDePath_(filePath) {
  const extension = (/\.[A-Za-z0-9]+$/.exec(String(filePath || '')) || [''])[0].toLowerCase();
  return EXTENSION_A_MIME_[extension] || null;
}

/**
 * MIME del blob si es uno permitido por Gemini; si no, el mime_type del documento (el usuario mandó la
 * factura "como archivo": Telegram puede no conservarlo en el blob); si no, el de la extensión;
 * si no, jpeg.
 */
function mimeDeFoto_(blob, filePath, mimeDocumento) {
  const tipoBlob = String(blob.getContentType() || '').toLowerCase();
  if (MIME_FOTO_PERMITIDOS.includes(tipoBlob)) return tipoBlob;
  if (MIME_FOTO_PERMITIDOS.includes(String(mimeDocumento || '').toLowerCase())) return mimeDocumento;
  return mimeDePath_(filePath) || 'image/jpeg';
}

/**
 * Baja la foto de Telegram: `deps.llamar` pide getFile, `deps.descargar` trae el blob. Nunca
 * lanza: cualquier falla (sin file_path, más de 20 MB, sin red) es `{ ok: false, motivo }` sin la
 * URL ni el token adentro. `foto` = resultado de fotoMayor_ (trae file_id).
 */
function descargarFoto_(deps, foto) {
  let resultado;
  try {
    resultado = deps.llamar(deps.token, 'getFile', { file_id: foto.file_id });
  } catch (error) {
    return { ok: false, motivo: 'no se pudo consultar Telegram para bajar la foto' };
  }
  if (!resultado.datos.ok) return { ok: false, motivo: detalleTelegram_(resultado) };
  const archivo = resultado.datos.result || {};
  if (!archivo.file_path) return { ok: false, motivo: 'Telegram no devolvió dónde está la foto' };
  if (Number.isFinite(archivo.file_size) && archivo.file_size > LIMITE_DESCARGA_FOTO_BYTES) {
    return { ok: false, motivo: 'la foto pesa más de 20 MB, el límite de Telegram para bajarla' };
  }
  const url = `${URL_TELEGRAM_ARCHIVO_}${deps.token}/${archivo.file_path}`;
  let blob;
  try {
    blob = deps.descargar(url);
  } catch (error) {
    return { ok: false, motivo: 'no se pudo bajar la foto de Telegram' };
  }
  return { ok: true, blob, mimeType: mimeDeFoto_(blob, archivo.file_path, foto.mime_type) };
}

/** Una llamada a generateContent en modo foto con ese modelo; puede lanzar (red, mimeType malo). */
const llamarFotoGemini_ = (clave, modelo, base64, mimeType, caption, categoriasClase, hoy) => llamarGemini_(
  clave, `/models/${modelo}:generateContent`, cuerpoFotoGemini_(base64, mimeType, caption, categoriasClase, hoy),
);

/**
 * La primera lectura de una foto (CONFIG.MODELO_PRINCIPAL), con los reintentos de
 * llamarGeminiConReintento_ (alta demanda o sin conexión reintenta el mismo modelo y
 * luego CONFIG.MODELO_RELECTURA); puede lanzar (mimeType malo arma mal el cuerpo, o se quedó sin
 * conexión en el último intento). La relectura manuscrita (releerFoto_) no pasa por aquí: ya usa
 * MODELO_RELECTURA directo, sin reintentos.
 */
const llamarFotoGeminiPrincipal_ = (clave, base64, mimeType, caption, categoriasClase, hoy, hayGroq) => llamarGeminiConReintento_(
  clave, CONFIG.MODELO_PRINCIPAL, (modelo) => cuerpoFotoGemini_(base64, mimeType, caption, categoriasClase, hoy),
  undefined, hayGroq,
);

/** Relectura con CONFIG.MODELO_RELECTURA (foto manuscrita con campos dudosos). */
function releerFoto_(clave, base64, mimeType, caption, categoriasClase, hoy, primera) {
  let resultado;
  try {
    resultado = llamarFotoGemini_(clave, CONFIG.MODELO_RELECTURA, base64, mimeType, caption, categoriasClase, hoy);
  } catch (error) {
    return primera;
  }
  if (resultado.codigo !== 200) return primera;
  const releida = leerExtraccion_(resultado.datos, categoriasClase, false);
  return releida.ok ? releida : primera;
}

/**
 * El texto de un álbum de más de MAX_IMAGENES_GROQ fotos: corre
 * cada `obtenerTextoOcr` perezoso de `callbacks` (uno por foto, en orden) y une los textos con un
 * separador "--- Foto N de <total> ---". null si CUALQUIER foto falla su OCR (ok:false, sin
 * resultado) o da texto vacío/solo espacios: mejor rendirse al camino de hoy que mandarle a Groq
 * un álbum a medio leer.
 */
function textoOcrAlbum_(callbacks) {
  const textos = [];
  for (let i = 0; i < callbacks.length; i += 1) {
    const ocr = callbacks[i]();
    const texto = ocr && ocr.ok ? String(ocr.texto || '').trim() : '';
    if (!texto) return null;
    textos.push(`--- Foto ${i + 1} de ${callbacks.length} ---\n${texto}`);
  }
  return textos.join('\n\n');
}

/**
 * El cuerpo que se le mandaría a Groq para esta foto, o null si no hay forma de armarlo:
 * un álbum de más de MAX_IMAGENES_GROQ fotos (`obtenerTextosOcrAlbum`, un array de funciones
 * perezosas, una por foto) manda el OCR de todas juntas; si no, la imagen tal cual
 * (rutaGroqFoto_ 'imagen'), el texto del OCR de Drive en su lugar si es un PDF y `obtenerTextoOcr`
 * lo consigue ('ocr'), o ninguno si Groq no confirma leer ese mimeType (WEBP, HEIC, HEIF:
 *) o el OCR falló. `obtenerTextoOcr`/`obtenerTextosOcrAlbum` (opcionales) son funciones
 * perezosas (deps.ocr sobre el/los blob ya bajados): solo se llaman aquí, cuando Gemini ya falló
 * del todo y hace falta.
 */
function cuerpoGroqFoto_(mimeType, base64, caption, categoriasClase, hoy, obtenerTextoOcr, obtenerTextosOcrAlbum) {
  if (Array.isArray(obtenerTextosOcrAlbum) && obtenerTextosOcrAlbum.length > MAX_IMAGENES_GROQ) {
    const texto = textoOcrAlbum_(obtenerTextosOcrAlbum);
    if (texto) return cuerpoGeminiConTextoOcr_(texto, caption, categoriasClase, hoy);
    console.warn('Groq: se salta el álbum, no se pudo sacar el texto con OCR de todas las fotos');
    return null;
  }
  const ruta = rutaGroqFoto_(mimeType);
  if (ruta === 'imagen') return cuerpoFotoGemini_(base64, mimeType, caption, categoriasClase, hoy);
  if (ruta === 'ocr' && obtenerTextoOcr) {
    const ocr = obtenerTextoOcr();
    if (ocr && ocr.ok) return cuerpoGeminiConTextoOcr_(ocr.texto, caption, categoriasClase, hoy);
    console.warn(`Groq: se salta el PDF, no se pudo sacar el texto con OCR${ocr ? ` (${ocr.motivo})` : ''}`);
    return null;
  }
  if (ruta === null) console.warn(`Groq: se salta, ${mimeType} no está en la lista de fotos que Groq acepta`);
  return null;
}

/**
 * Lee una foto ya bajada con Gemini: { ok: true, datos } o { ok: false, motivo } (nunca
 * lanza). Espejo de leerTextoGemini_ (MensajesApp.js) en modo foto; agrega la relectura con
 * CONFIG.MODELO_RELECTURA cuando debeReleer_ lo pide (foto manuscrita con campos dudosos), sin
 * perder la primera lectura si la relectura falla. `claveGroq`, `obtenerTextoOcr` y
 * `obtenerTextosOcrAlbum`: si Gemini falla del todo y hay clave
 * de Groq, se intenta el respaldo antes de rendirse; sin clave de Groq el
 * comportamiento es exactamente el de hoy.
 */
function leerFotoGemini_(base64, mimeType, caption, categorias, clave, hoy, claveGroq, obtenerTextoOcr, obtenerTextosOcrAlbum) {
  if (!clave) return { ok: false, motivo: 'falta GEMINI_API_KEY (ejecuta verificarPropiedades)' };
  const categoriasClase = [...categorias, ...nombresGrupos_()];
  const { intento, lectura, groq } = llamarConRespaldoGroq_(
    () => llamarFotoGeminiPrincipal_(clave, base64, mimeType, caption, categoriasClase, hoy, Boolean(claveGroq)),
    () => cuerpoGroqFoto_(mimeType, base64, caption, categoriasClase, hoy, obtenerTextoOcr, obtenerTextosOcrAlbum),
    categoriasClase, false, claveGroq,
  );
  if (groq) return groq;
  if (intento.error) return { ok: false, motivo: 'no se pudo conectar con Gemini' };
  if (intento.resultado.codigo !== 200) return { ok: false, motivo: describirError_(intento.resultado) };
  if (!lectura.ok || !debeReleer_(lectura.datos)) return lectura;
  return releerFoto_(clave, base64, mimeType, caption, categoriasClase, hoy, lectura);
}

/**
 * Una foto que llegó del usuario: la archiva PRIMERO (antes de gastar nada en Gemini),
 * luego la manda a leer. Nunca lanza: una falla de Gemini es, `{ ok: false, archivo, motivo }`
 * con la foto ya archivada; una falla al bajarla deja `archivo: null` (nunca se archivó nada).
 */
function recibirFoto_(mensaje, deps, raiz) {
  const foto = fotoDeMensaje_(mensaje);
  if (!foto) return { ok: false, archivo: null, motivo: 'la foto no llegó completa' };
  const descarga = descargarFoto_(deps, foto);
  if (!descarga.ok) return { ok: false, archivo: null, motivo: descarga.motivo };
  const archivo = archivarFoto_(descarga.blob, mensaje.message_id, raiz);
  let base64;
  try {
    base64 = deps.base64(descarga.blob);
  } catch (error) {
    return { ok: false, archivo, motivo: 'no se pudo leer la foto ya archivada' };
  }
  const leido = leerFotoGemini_(base64, descarga.mimeType, mensaje.caption, deps.categorias, deps.claveGemini, deps.hoy,
    deps.claveGroq, () => deps.ocr(descarga.blob, raiz));
  // Con Gemini caído la foto todavía sirve para el OCR de Drive, así que el blob y su
  // tipo viajan de vuelta (nadie más los usa: son agregados, no cambian lo de antes).
  if (!leido.ok) {
    return { ok: false, archivo, motivo: leido.motivo, blob: descarga.blob, mimeType: descarga.mimeType };
  }
  return { ok: true, archivo, datos: leido.datos, mimeType: descarga.mimeType };
}

/**
 * Clasifica la foto ya leída (mueve a Facturas/AAAA/N. Mes/ con su nombre final) cuando el plan
 * trajo filas; sin filas (fechaDistinta /) la deja en Por clasificar y solo da su URL.
 */
function clasificarFotoLeida_(archivo, plan, datos, raiz) {
  if (!plan.filas.length) return { url: archivo.getUrl() };
  const fila = plan.filas[0];
  const descripcion = descripcionCorta_(datos.descripcion_corta || fila.PROVEEDOR);
  return clasificarFoto_(archivo, fila.FECHA, descripcion, raiz);
}

if (typeof module !== 'undefined') {
  module.exports = {
    LIMITE_DESCARGA_FOTO_BYTES, descargarFoto_, cuerpoGroqFoto_, leerFotoGemini_, recibirFoto_, clasificarFotoLeida_,
  };
}
