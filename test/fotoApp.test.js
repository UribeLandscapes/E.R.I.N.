const test = require('node:test');
const assert = require('node:assert/strict');

// En Apps Script estos nombres son globales; en Node se ponen a mano (mismo patrón que
// carpetasApp.test.js y mensajesApp.test.js).
global.MESES = require('../src/Hoja.js').MESES;
Object.assign(global, require('../src/Reglas.js'));
Object.assign(global, require('../src/Extraccion.js'));
global.sinTildes_ = require('../src/Hoja.js').sinTildes_;
global.CONFIG = require('./configPrueba.js').CONFIG;
// Utilities.sleep de los reintentos de Gemini, sin esperar de verdad en las pruebas.
global.Utilities = { sleep: () => {} };
Object.assign(global, require('../src/Clases.js'));
global.cambiosRespuesta_ = require('../src/Escritura.js').cambiosRespuesta_;
global.textoCelda_ = require('../src/Escritura.js').textoCelda_;
Object.assign(global, require('../src/Texto.js'));
Object.assign(global, require('../src/Confirmacion.js'));
Object.assign(global, require('../src/Carpetas.js'));
Object.assign(global, require('../src/Foto.js'));
Object.assign(global, require('../src/CarpetasApp.js'));
Object.assign(global, require('../src/Gemini.js'));
Object.assign(global, require('../src/Groq.js'));
Object.assign(global, require('../src/GroqApp.js'));
global.detalleTelegram_ = require('../src/WebhookApp.js').detalleTelegram_;

const {
  LIMITE_DESCARGA_FOTO_BYTES, descargarFoto_, cuerpoGroqFoto_, leerFotoGemini_, recibirFoto_, clasificarFotoLeida_,
} = require('../src/FotoApp.js');

const TOKEN = '123456:ABC-token-secreto-de-prueba';
const CLAVE = 'clave-de-prueba';
const CLAVE_GROQ = 'gsk_clave-groq-de-prueba';
const HOY = '2026-09-27';
const CATEGORIAS = ['GROCERIES'];

const fotoTelegram = (cambios) => ({ file_id: 'file-1', width: 100, height: 100, ...cambios });

function respuestaFalsa(codigo, texto) {
  return { getResponseCode: () => codigo, getContentText: () => texto };
}

function blobFalso(mime, bytes = [1, 2, 3]) {
  return { getContentType: () => mime, getBytes: () => bytes };
}

/** Carpeta falsa mínima de Drive (mismo patrón que carpetasApp.test.js). */
function carpetaFalsa(nombre) {
  const carpeta = {
    nombre, hijas: [], archivos: [],
    getName: () => carpeta.nombre,
    getFoldersByName: () => ({ hasNext: () => false, next: () => null }),
    getFilesByName: () => ({ hasNext: () => false, next: () => null }),
    createFolder: (n) => {
      const hija = carpetaFalsa(n);
      carpeta.hijas.push(hija);
      return hija;
    },
    createFile: (blob) => {
      const archivo = {
        nombre: `tg-1${blob.getContentType() === 'image/png' ? '.png' : '.jpg'}`,
        mime: blob.getContentType(),
        getId: () => 'archivo-1',
        getName: () => archivo.nombre,
        setName: (n) => { archivo.nombre = n; return archivo; },
        getMimeType: () => archivo.mime,
        getParents: () => ({ hasNext: () => false, next: () => null }),
        getUrl: () => 'https://drive/archivo-1',
        moveTo: (destino) => { destino.archivos.push(archivo); return archivo; },
        setTrashed: () => archivo,
      };
      carpeta.archivos.push(archivo);
      return archivo;
    },
  };
  return carpeta;
}

/** deps mínimos para descargarFoto_/leerFotoGemini_/recibirFoto_, todo con dobles. */
function deps(cambios) {
  return {
    token: TOKEN,
    claveGemini: CLAVE,
    categorias: CATEGORIAS,
    hoy: HOY,
    llamar: () => ({ datos: { ok: true, result: { file_path: 'photos/file_1.jpg', file_size: 1000 } } }),
    descargar: () => blobFalso('image/jpeg'),
    base64: (blob) => `b64:${blob.getContentType()}`,
    ...cambios,
  };
}

function datosGeminiFoto(cambios) {
  return {
    legible: true, tipo_documento: 'TICKET', proveedor: 'Whole Foods', fecha: '2026-09-27',
    moneda: 'USD', forma_pago: 'EFECTIVO', lineas: [{ tipo: 'ITEM', descripcion: 'compra', monto: 10, confianza: 'ALTA' }],
    total: 10, clase: 'GROCERIES', casa: null, comentario: null, descripcion_corta: 'super whole foods',
    confianza: { proveedor: 'ALTA', fecha: 'ALTA', moneda: 'ALTA', total: 'ALTA', clase: 'ALTA' },
    ...cambios,
  };
}

function respuestaGemini(datos) {
  return respuestaFalsa(200, JSON.stringify({
    candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(datos) }] } }],
  }));
}

// --- descargarFoto_ ---

test('descargarFoto_ pide getFile, arma la URL con el token y devuelve el blob y el mimeType', () => {
  let pedidoGetFile;
  let urlDescargada;
  global.UrlFetchApp = {};
  const d = deps({
    llamar: (token, metodo, cuerpo) => {
      pedidoGetFile = { token, metodo, cuerpo };
      return { datos: { ok: true, result: { file_path: 'photos/file_1.jpg', file_size: 1000 } } };
    },
    descargar: (url) => { urlDescargada = url; return blobFalso('image/jpeg'); },
  });
  const r = descargarFoto_(d, fotoTelegram());
  assert.equal(r.ok, true);
  assert.equal(r.mimeType, 'image/jpeg');
  assert.equal(pedidoGetFile.metodo, 'getFile');
  assert.deepEqual(pedidoGetFile.cuerpo, { file_id: 'file-1' });
  assert.equal(urlDescargada, `https://api.telegram.org/file/bot${TOKEN}/photos/file_1.jpg`);
});

test('descargarFoto_ nunca deja el token en el motivo, ni siquiera si deps.descargar lanza con el error de red', () => {
  const d = deps({
    descargar: () => { throw new Error(`falló GET https://api.telegram.org/file/bot${TOKEN}/photos/file_1.jpg`); },
  });
  const r = descargarFoto_(d, fotoTelegram());
  assert.equal(r.ok, false);
  assert.ok(!r.motivo.includes(TOKEN));
});

test('descargarFoto_ falla si Telegram no encuentra el archivo (getFile no-ok), sin token en el motivo', () => {
  const d = deps({ llamar: () => ({ datos: { ok: false, description: 'file not found' } }) });
  const r = descargarFoto_(d, fotoTelegram());
  assert.equal(r.ok, false);
  assert.ok(!r.motivo.includes(TOKEN));
});

test('descargarFoto_ falla si getFile no trae file_path, sin token en el motivo', () => {
  const d = deps({ llamar: () => ({ datos: { ok: true, result: {} } }) });
  const r = descargarFoto_(d, fotoTelegram());
  assert.equal(r.ok, false);
  assert.ok(!r.motivo.includes(TOKEN));
});

test('descargarFoto_ falla si file_size pasa el límite de 20 MB de la Bot API, sin token en el motivo', () => {
  const d = deps({
    llamar: () => ({
      datos: { ok: true, result: { file_path: 'photos/file_1.jpg', file_size: LIMITE_DESCARGA_FOTO_BYTES + 1 } },
    }),
  });
  const r = descargarFoto_(d, fotoTelegram());
  assert.equal(r.ok, false);
  assert.ok(!r.motivo.includes(TOKEN));
});

test('descargarFoto_ falla sin lanzar si deps.llamar lanza (sin red), sin token en el motivo', () => {
  const d = deps({ llamar: () => { throw new Error(`red caída bot${TOKEN}`); } });
  const r = descargarFoto_(d, fotoTelegram());
  assert.equal(r.ok, false);
  assert.ok(!r.motivo.includes(TOKEN));
});

test('descargarFoto_ usa el mimeType del blob si es uno de los permitidos, aunque la extensión diga otra cosa', () => {
  const d = deps({
    llamar: () => ({ datos: { ok: true, result: { file_path: 'photos/file_1.jpg' } } }),
    descargar: () => blobFalso('image/png'),
  });
  assert.equal(descargarFoto_(d, fotoTelegram()).mimeType, 'image/png');
});

test('descargarFoto_ deduce el mimeType de la extensión del file_path si el blob no trae uno permitido', () => {
  const d = deps({
    llamar: () => ({ datos: { ok: true, result: { file_path: 'photos/file_1.webp' } } }),
    descargar: () => blobFalso('application/octet-stream'),
  });
  assert.equal(descargarFoto_(d, fotoTelegram()).mimeType, 'image/webp');
});

test('descargarFoto_ usa image/jpeg si ni el blob ni la extensión dicen un mimeType válido', () => {
  const d = deps({
    llamar: () => ({ datos: { ok: true, result: { file_path: 'photos/file_1.bin' } } }),
    descargar: () => blobFalso('application/octet-stream'),
  });
  assert.equal(descargarFoto_(d, fotoTelegram()).mimeType, 'image/jpeg');
});

test('descargarFoto_ usa el mime_type del documento si el blob no trae uno permitido (antes de la extensión)', () => {
  const d = deps({
    llamar: () => ({ datos: { ok: true, result: { file_path: 'photos/file_1.bin' } } }),
    descargar: () => blobFalso('application/octet-stream'),
  });
  const foto = fotoTelegram({ mime_type: 'image/webp' });
  assert.equal(descargarFoto_(d, foto).mimeType, 'image/webp');
});

// Un PDF mandado como documento se detecta y viaja igual que una foto.
test('descargarFoto_ acepta un PDF: usa application/pdf del mime_type del documento', () => {
  const d = deps({
    llamar: () => ({ datos: { ok: true, result: { file_path: 'documents/file_1' } } }),
    descargar: () => blobFalso('application/pdf'),
  });
  const foto = fotoTelegram({ mime_type: 'application/pdf' });
  assert.equal(descargarFoto_(d, foto).mimeType, 'application/pdf');
});

// --- leerFotoGemini_ ---

test('leerFotoGemini_ llama al modelo principal con la imagen y la leyenda', () => {
  let pedido;
  global.UrlFetchApp = {
    fetch: (url, opciones) => { pedido = { url, opciones }; return respuestaGemini(datosGeminiFoto()); },
  };
  const leido = leerFotoGemini_('b64-datos', 'image/jpeg', 'para la fiesta', CATEGORIAS, CLAVE, HOY);
  assert.equal(leido.ok, true);
  assert.equal(leido.datos.proveedor, 'Whole Foods');
  assert.equal(pedido.url, `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.MODELO_PRINCIPAL}:generateContent`);
  const cuerpo = JSON.parse(pedido.opciones.payload);
  assert.deepEqual(cuerpo.contents[0].parts[0], { inlineData: { mimeType: 'image/jpeg', data: 'b64-datos' } });
  assert.deepEqual(cuerpo.contents[0].parts[1], { text: 'para la fiesta' });
});

test('leerFotoGemini_ sin clave no lanza: devuelve la falla', () => {
  const leido = leerFotoGemini_('b64', 'image/jpeg', '', CATEGORIAS, '', HOY);
  assert.equal(leido.ok, false);
  assert.match(leido.motivo, /GEMINI_API_KEY/);
});

test('leerFotoGemini_ trata un HTTP distinto de 200 como falla, sin lanzar', () => {
  global.UrlFetchApp = { fetch: () => respuestaFalsa(429, '{"error":{"message":"Quota exceeded"}}') };
  const leido = leerFotoGemini_('b64', 'image/jpeg', '', CATEGORIAS, CLAVE, HOY);
  assert.equal(leido.ok, false);
  assert.match(leido.motivo, /HTTP 429/);
});

test('leerFotoGemini_ no lanza si UrlFetchApp lanza (sin red)', () => {
  global.UrlFetchApp = { fetch: () => { throw new Error('DNS'); } };
  const leido = leerFotoGemini_('b64', 'image/jpeg', '', CATEGORIAS, CLAVE, HOY);
  assert.equal(leido.ok, false);
});

test('leerFotoGemini_ no lanza si falta base64 (cuerpoFotoGemini_ lanza)', () => {
  global.UrlFetchApp = { fetch: () => respuestaGemini(datosGeminiFoto()) };
  const leido = leerFotoGemini_('', 'image/jpeg', '', CATEGORIAS, CLAVE, HOY);
  assert.equal(leido.ok, false);
});

test('leerFotoGemini_ relee con MODELO_RELECTURA si la foto es manuscrita con campos dudosos', () => {
  const rutas = [];
  global.UrlFetchApp = {
    fetch: (url, opciones) => {
      rutas.push(url);
      const cuerpo = JSON.parse(opciones.payload);
      const releyendo = url.includes(CONFIG.MODELO_RELECTURA);
      return respuestaGemini(datosGeminiFoto({
        tipo_documento: 'MANUSCRITO',
        confianza: { proveedor: 'ALTA', fecha: 'ALTA', moneda: 'ALTA', total: releyendo ? 'ALTA' : 'BAJA', clase: 'ALTA' },
        total: releyendo ? 12 : null,
      }));
    },
  };
  const leido = leerFotoGemini_('b64', 'image/jpeg', '', CATEGORIAS, CLAVE, HOY);
  assert.equal(rutas.length, 2);
  assert.ok(rutas[0].includes(CONFIG.MODELO_PRINCIPAL));
  assert.ok(rutas[1].includes(CONFIG.MODELO_RELECTURA));
  assert.equal(leido.ok, true);
  assert.equal(leido.datos.total, 12);
});

test('leerFotoGemini_ se queda con la primera lectura si la relectura falla', () => {
  let llamadas = 0;
  global.UrlFetchApp = {
    fetch: (url) => {
      llamadas += 1;
      if (url.includes(CONFIG.MODELO_RELECTURA)) return respuestaFalsa(500, '{}');
      return respuestaGemini(datosGeminiFoto({
        tipo_documento: 'MANUSCRITO',
        confianza: { proveedor: 'ALTA', fecha: 'ALTA', moneda: 'ALTA', total: 'BAJA', clase: 'ALTA' },
        total: null,
      }));
    },
  };
  const leido = leerFotoGemini_('b64', 'image/jpeg', '', CATEGORIAS, CLAVE, HOY);
  assert.equal(llamadas, 2);
  assert.equal(leido.ok, true);
  assert.equal(leido.datos.total, null);
});

test('leerFotoGemini_ se queda con la primera lectura si la relectura no conecta (sin lanzar)', () => {
  let llamadas = 0;
  global.UrlFetchApp = {
    fetch: (url) => {
      llamadas += 1;
      if (url.includes(CONFIG.MODELO_RELECTURA)) throw new Error('DNS');
      return respuestaGemini(datosGeminiFoto({
        tipo_documento: 'MANUSCRITO',
        confianza: { proveedor: 'ALTA', fecha: 'ALTA', moneda: 'ALTA', total: 'BAJA', clase: 'ALTA' },
        total: null,
      }));
    },
  };
  const leido = leerFotoGemini_('b64', 'image/jpeg', '', CATEGORIAS, CLAVE, HOY);
  assert.equal(llamadas, 2);
  assert.equal(leido.ok, true);
  assert.equal(leido.datos.total, null);
});

test('leerFotoGemini_ no relee una foto que no es manuscrita (una sola llamada)', () => {
  let llamadas = 0;
  global.UrlFetchApp = {
    fetch: () => { llamadas += 1; return respuestaGemini(datosGeminiFoto()); },
  };
  leerFotoGemini_('b64', 'image/jpeg', '', CATEGORIAS, CLAVE, HOY);
  assert.equal(llamadas, 1);
});

// --- cuerpoGroqFoto_ ---

test('cuerpoGroqFoto_ manda la imagen tal cual para jpeg/png (rutaGroqFoto_ "imagen")', () => {
  const cuerpo = cuerpoGroqFoto_('image/jpeg', 'b64', 'la leyenda', CATEGORIAS, HOY);
  assert.deepEqual(cuerpo.contents[0].parts[0], { inlineData: { mimeType: 'image/jpeg', data: 'b64' } });
});

test('cuerpoGroqFoto_ con PDF usa el texto de obtenerTextoOcr en vez de la imagen', () => {
  const cuerpo = cuerpoGroqFoto_('application/pdf', 'b64-inutil', 'la leyenda', CATEGORIAS, HOY,
    () => ({ ok: true, texto: 'TOTAL 12.00' }));
  assert.deepEqual(cuerpo.contents[0].parts[0], { text: 'Texto leído por OCR de la foto (puede tener errores de lectura):\nTOTAL 12.00' });
});

test('cuerpoGroqFoto_ con PDF y OCR fallido (o sin obtenerTextoOcr) da null y avisa por consola', () => {
  const avisos = [];
  const original = console.warn;
  console.warn = (t) => avisos.push(t);
  try {
    assert.equal(cuerpoGroqFoto_('application/pdf', 'b64', '', CATEGORIAS, HOY, () => ({ ok: false, motivo: 'x' })), null);
    assert.equal(cuerpoGroqFoto_('application/pdf', 'b64', '', CATEGORIAS, HOY), null);
    assert.equal(cuerpoGroqFoto_('application/pdf', 'b64', '', CATEGORIAS, HOY, () => null), null);
    assert.ok(avisos.every((linea) => linea.includes('OCR')));
  } finally {
    console.warn = original;
  }
});

test('cuerpoGroqFoto_ con webp/heic/heif da null (Groq no confirma leerlos) y avisa por consola', () => {
  const avisos = [];
  const original = console.warn;
  console.warn = (t) => avisos.push(t);
  try {
    assert.equal(cuerpoGroqFoto_('image/webp', 'b64', '', CATEGORIAS, HOY), null);
    assert.match(avisos[0], /image\/webp no está en la lista/);
  } finally {
    console.warn = original;
  }
});

// --- cuerpoGroqFoto_ con un álbum de más de MAX_IMAGENES_GROQ fotos ---
// Groq acepta hasta MAX_IMAGENES_GROQ (3) imágenes por llamada; un álbum de más fotos manda el
// texto del OCR de Drive de CADA foto, unido y separado por foto, en vez de las imágenes.

const ocrAlbum_ = (...textos) => textos.map((texto) => () => ({ ok: true, texto }));

test('cuerpoGroqFoto_ con 4+ fotos (album) manda el OCR de cada una, unido y separado', () => {
  const cuerpo = cuerpoGroqFoto_('image/jpeg', 'b64', 'la leyenda', CATEGORIAS, HOY, undefined,
    ocrAlbum_('TOTAL 12.00', 'TOTAL 8.50', 'TOTAL 3.00', 'TOTAL 1.00'));
  const texto = cuerpo.contents[0].parts[0].text;
  assert.match(texto, /Foto 1 de 4/);
  assert.match(texto, /TOTAL 12\.00/);
  assert.match(texto, /Foto 4 de 4/);
  assert.match(texto, /TOTAL 1\.00/);
});

test('cuerpoGroqFoto_ con 3 o menos fotos NO usa la ruta de álbum: sigue rutaGroqFoto_ por mimeType', () => {
  const cuerpo = cuerpoGroqFoto_('image/jpeg', 'b64', '', CATEGORIAS, HOY, undefined, ocrAlbum_('a', 'b', 'c'));
  assert.deepEqual(cuerpo.contents[0].parts[0], { inlineData: { mimeType: 'image/jpeg', data: 'b64' } });
});

test('cuerpoGroqFoto_ con álbum donde una foto no tiene OCR (ok:false) da null y avisa por consola', () => {
  const avisos = [];
  const original = console.warn;
  console.warn = (t) => avisos.push(t);
  try {
    const callbacks = [...ocrAlbum_('a', 'b', 'c'), () => ({ ok: false, motivo: 'x' })];
    assert.equal(cuerpoGroqFoto_('image/jpeg', 'b64', '', CATEGORIAS, HOY, undefined, callbacks), null);
    assert.ok(avisos.some((linea) => linea.includes('álbum')));
  } finally {
    console.warn = original;
  }
});

test('cuerpoGroqFoto_ con álbum donde una foto da texto vacío (solo espacios) da null', () => {
  const callbacks = [...ocrAlbum_('a', 'b', 'c'), () => ({ ok: true, texto: '   ' })];
  assert.equal(cuerpoGroqFoto_('image/jpeg', 'b64', '', CATEGORIAS, HOY, undefined, callbacks), null);
});

test('cuerpoGroqFoto_ ignora un obtenerTextosOcrAlbum que no es array', () => {
  const cuerpo = cuerpoGroqFoto_('image/jpeg', 'b64', '', CATEGORIAS, HOY, undefined, 'no-es-array');
  assert.deepEqual(cuerpo.contents[0].parts[0], { inlineData: { mimeType: 'image/jpeg', data: 'b64' } });
});

// --- leerFotoGemini_ con el respaldo de Groq ---

test('leerFotoGemini_ sin claveGroq: una foto/HTTP fallido no intenta Groq (comportamiento de hoy)', () => {
  global.UrlFetchApp = { fetch: () => respuestaFalsa(500, '{}') };
  const leido = leerFotoGemini_('b64', 'image/jpeg', '', CATEGORIAS, CLAVE, HOY);
  assert.equal(leido.ok, false);
  assert.match(leido.motivo, /HTTP 500/);
});

test('leerFotoGemini_ con claveGroq: Gemini falla del todo (500) y Groq (jpeg) lee la foto', () => {
  global.UrlFetchApp = {
    fetch: (url) => (url === URL_GROQ
      ? respuestaFalsa(200, JSON.stringify({
        choices: [{ message: { content: JSON.stringify(datosGeminiFoto()) }, finish_reason: 'stop' }],
      }))
      : respuestaFalsa(500, '{}')),
  };
  const leido = leerFotoGemini_('b64', 'image/jpeg', '', CATEGORIAS, CLAVE, HOY, CLAVE_GROQ);
  assert.equal(leido.ok, true);
  assert.equal(leido.datos.proveedor, 'Whole Foods');
});

test('leerFotoGemini_ con claveGroq: un PDF cuya Gemini falla usa el OCR de Drive para Groq', () => {
  let pedidoGroq;
  global.UrlFetchApp = {
    fetch: (url, opciones) => (url === URL_GROQ
      ? (() => { pedidoGroq = JSON.parse(opciones.payload); return respuestaFalsa(200, JSON.stringify({
        choices: [{ message: { content: JSON.stringify(datosGeminiFoto()) }, finish_reason: 'stop' }],
      })); })()
      : respuestaFalsa(503, '{}')),
  };
  const obtenerTextoOcr = () => ({ ok: true, texto: 'TOTAL 12.00 Seven 11' });
  const leido = leerFotoGemini_('b64', 'application/pdf', '', CATEGORIAS, CLAVE, HOY, CLAVE_GROQ, obtenerTextoOcr);
  assert.equal(leido.ok, true);
  assert.match(pedidoGroq.messages[1].content[0].text, /TOTAL 12\.00 Seven 11/);
});

test('leerFotoGemini_ con claveGroq: un PDF sin OCR disponible se rinde con el motivo original de Gemini', () => {
  global.UrlFetchApp = { fetch: () => respuestaFalsa(500, '{"error":{"message":"caído"}}') };
  const leido = leerFotoGemini_('b64', 'application/pdf', '', CATEGORIAS, CLAVE, HOY, CLAVE_GROQ,
    () => ({ ok: false, motivo: 'no se pudo hacer el OCR' }));
  assert.equal(leido.ok, false);
  assert.match(leido.motivo, /HTTP 500/);
});

test('leerFotoGemini_ con claveGroq: una foto webp que Gemini no puede leer no intenta Groq y se rinde igual', () => {
  global.UrlFetchApp = { fetch: () => respuestaFalsa(500, '{}') };
  const leido = leerFotoGemini_('b64', 'image/webp', '', CATEGORIAS, CLAVE, HOY, CLAVE_GROQ);
  assert.equal(leido.ok, false);
  assert.match(leido.motivo, /HTTP 500/);
});

test('leerFotoGemini_ con claveGroq: si Groq también falla se rinde con el motivo original de Gemini', () => {
  global.UrlFetchApp = {
    fetch: (url) => (url === URL_GROQ ? respuestaFalsa(429, '{}') : respuestaFalsa(500, '{"error":{"message":"caído"}}')),
  };
  const leido = leerFotoGemini_('b64', 'image/jpeg', '', CATEGORIAS, CLAVE, HOY, CLAVE_GROQ);
  assert.equal(leido.ok, false);
  assert.match(leido.motivo, /HTTP 500/);
});

test('leerFotoGemini_ con claveGroq salta al respaldo con HTTP 503 sin el segundo intento a Gemini', () => {
  let llamadasGemini = 0;
  global.UrlFetchApp = {
    fetch: (url) => {
      if (url === URL_GROQ) {
        return respuestaFalsa(200, JSON.stringify({
          choices: [{ message: { content: JSON.stringify(datosGeminiFoto()) }, finish_reason: 'stop' }],
        }));
      }
      llamadasGemini += 1;
      return respuestaFalsa(503, '{}');
    },
  };
  const leido = leerFotoGemini_('b64', 'image/jpeg', '', CATEGORIAS, CLAVE, HOY, CLAVE_GROQ);
  assert.equal(leido.ok, true);
  assert.equal(llamadasGemini, 1);
});

test('leerFotoGemini_ con claveGroq y un álbum de 4 fotos: Gemini falla, Groq lee el OCR unido de las 4', () => {
  let pedidoGroq;
  global.UrlFetchApp = {
    fetch: (url, opciones) => (url === URL_GROQ
      ? (() => { pedidoGroq = JSON.parse(opciones.payload); return respuestaFalsa(200, JSON.stringify({
        choices: [{ message: { content: JSON.stringify(datosGeminiFoto()) }, finish_reason: 'stop' }],
      })); })()
      : respuestaFalsa(500, '{}')),
  };
  const obtenerTextosOcrAlbum = ocrAlbum_('TOTAL 12.00 Seven 11', 'TOTAL 8.50 Whole Foods', 'TOTAL 3.00', 'TOTAL 1.00');
  const leido = leerFotoGemini_('b64', 'image/jpeg', '', CATEGORIAS, CLAVE, HOY, CLAVE_GROQ, undefined, obtenerTextosOcrAlbum);
  assert.equal(leido.ok, true);
  const texto = pedidoGroq.messages[1].content[0].text;
  assert.match(texto, /Foto 1 de 4/);
  assert.match(texto, /Seven 11/);
  assert.match(texto, /Foto 4 de 4/);
});

test('leerFotoGemini_ con claveGroq y álbum cuyo OCR falla en una foto: se rinde con el motivo original de Gemini', () => {
  global.UrlFetchApp = { fetch: () => respuestaFalsa(500, '{"error":{"message":"caído"}}') };
  const callbacks = [...ocrAlbum_('a', 'b', 'c'), () => ({ ok: false, motivo: 'x' })];
  const leido = leerFotoGemini_('b64', 'image/jpeg', '', CATEGORIAS, CLAVE, HOY, CLAVE_GROQ, undefined, callbacks);
  assert.equal(leido.ok, false);
  assert.match(leido.motivo, /HTTP 500/);
});

// --- recibirFoto_ ---

test('recibirFoto_ archiva la foto ANTES de llamar a Gemini y devuelve datos leídos', () => {
  const orden = [];
  const raiz = carpetaFalsa('Facturas');
  const d = deps({
    llamar: () => { orden.push('getFile'); return { datos: { ok: true, result: { file_path: 'photos/file_1.jpg' } } }; },
    descargar: () => { orden.push('descargar'); return blobFalso('image/jpeg'); },
  });
  global.UrlFetchApp = {
    fetch: () => { orden.push('gemini'); return respuestaGemini(datosGeminiFoto()); },
  };
  const mensaje = { message_id: 42, caption: 'para la fiesta', photo: [{ file_id: 'file-1', width: 10, height: 10 }] };
  const r = recibirFoto_(mensaje, d, raiz);
  assert.equal(r.ok, true);
  assert.equal(r.archivo.getName(), 'tg-42.jpg');
  assert.equal(r.mimeType, 'image/jpeg');
  assert.equal(r.datos.proveedor, 'Whole Foods');
  assert.deepEqual(orden, ['getFile', 'descargar', 'gemini']);
});

test('recibirFoto_ con un document de imagen (mandada "como archivo") funciona igual que con photo', () => {
  const orden = [];
  const raiz = carpetaFalsa('Facturas');
  const d = deps({
    llamar: () => { orden.push('getFile'); return { datos: { ok: true, result: { file_path: 'photos/file_1.jpg' } } }; },
    descargar: () => { orden.push('descargar'); return blobFalso('image/jpeg'); },
  });
  global.UrlFetchApp = {
    fetch: () => { orden.push('gemini'); return respuestaGemini(datosGeminiFoto()); },
  };
  const mensaje = {
    message_id: 47, caption: 'para la fiesta',
    document: { file_id: 'file-1', mime_type: 'image/jpeg', file_size: 2000 },
  };
  const r = recibirFoto_(mensaje, d, raiz);
  assert.equal(r.ok, true);
  assert.equal(r.archivo.getName(), 'tg-47.jpg');
  assert.equal(r.mimeType, 'image/jpeg');
  assert.equal(r.datos.proveedor, 'Whole Foods');
  assert.deepEqual(orden, ['getFile', 'descargar', 'gemini']);
});

test('recibirFoto_ AE-f: si Gemini falla, la foto ya quedó archivada y el motivo no lleva el token', () => {
  const raiz = carpetaFalsa('Facturas');
  const d = deps({});
  global.UrlFetchApp = { fetch: () => { throw new Error('DNS'); } };
  const mensaje = { message_id: 43, caption: '', photo: [{ file_id: 'file-1', width: 10, height: 10 }] };
  const r = recibirFoto_(mensaje, d, raiz);
  assert.equal(r.ok, false);
  assert.ok(r.archivo);
  assert.equal(r.archivo.getName(), 'tg-43.jpg');
  assert.ok(!r.motivo.includes(TOKEN));
});

test('recibirFoto_ con claveGroq: un PDF cuya Gemini falla usa deps.ocr(blob, raiz) para el respaldo de Groq', () => {
  const raiz = carpetaFalsa('Facturas');
  let pedidoOcr;
  const d = deps({
    claveGroq: 'gsk_clave-groq-de-prueba',
    descargar: () => blobFalso('application/pdf'),
    ocr: (blob, raizOcr) => { pedidoOcr = { blob, raizOcr }; return { ok: true, texto: 'TOTAL 12.00 Seven 11' }; },
  });
  global.UrlFetchApp = {
    fetch: (url) => (url === URL_GROQ
      ? respuestaFalsa(200, JSON.stringify({
        choices: [{ message: { content: JSON.stringify(datosGeminiFoto()) }, finish_reason: 'stop' }],
      }))
      : respuestaFalsa(500, '{}')),
  };
  const mensaje = { message_id: 48, caption: '', document: { file_id: 'file-1', mime_type: 'application/pdf', file_size: 2000 } };
  const r = recibirFoto_(mensaje, d, raiz);
  assert.equal(r.ok, true);
  assert.equal(r.datos.proveedor, 'Whole Foods');
  assert.equal(pedidoOcr.raizOcr, raiz);
});

test('recibirFoto_ AE-f: si deps.base64 lanza, la foto ya archivada se devuelve con motivo genérico', () => {
  const raiz = carpetaFalsa('Facturas');
  const d = deps({ base64: () => { throw new Error('no se pudo leer el blob'); } });
  const mensaje = { message_id: 46, caption: '', photo: [{ file_id: 'file-1', width: 10, height: 10 }] };
  const r = recibirFoto_(mensaje, d, raiz);
  assert.equal(r.ok, false);
  assert.ok(r.archivo);
  assert.equal(r.motivo, 'no se pudo leer la foto ya archivada');
});

test('recibirFoto_ sin descargar no archiva nada: archivo va null y el motivo no lleva el token', () => {
  const raiz = carpetaFalsa('Facturas');
  const d = deps({ llamar: () => ({ datos: { ok: false, description: 'file not found' } }) });
  const mensaje = { message_id: 44, caption: '', photo: [{ file_id: 'file-1', width: 10, height: 10 }] };
  const r = recibirFoto_(mensaje, d, raiz);
  assert.equal(r.ok, false);
  assert.equal(r.archivo, null);
  assert.equal(raiz.hijas.length, 0);
  assert.ok(!r.motivo.includes(TOKEN));
});

test('recibirFoto_ nunca lanza si la foto del mensaje viene vacía o mal formada', () => {
  const raiz = carpetaFalsa('Facturas');
  const d = deps({});
  assert.doesNotThrow(() => {
    const r = recibirFoto_({ message_id: 45, photo: [] }, d, raiz);
    assert.equal(r.ok, false);
    assert.equal(r.archivo, null);
  });
});

// --- clasificarFotoLeida_ ---

test('clasificarFotoLeida_ clasifica con la fecha y el proveedor de la primera fila cuando hay filas', () => {
  const raiz = carpetaFalsa('Facturas');
  const archivo = raiz.createFile(blobFalso('image/jpeg'));
  const plan = { filas: [{ FECHA: '2026-09-27', PROVEEDOR: 'Whole Foods' }] };
  const datos = { descripcion_corta: 'super whole foods' };
  const r = clasificarFotoLeida_(archivo, plan, datos, raiz);
  assert.match(r.ruta, /super whole foods/);
  assert.equal(r.url, 'https://drive/archivo-1');
});

test('clasificarFotoLeida_ usa el proveedor de la fila si datos.descripcion_corta viene vacía', () => {
  const raiz = carpetaFalsa('Facturas');
  const archivo = raiz.createFile(blobFalso('image/jpeg'));
  const plan = { filas: [{ FECHA: '2026-09-27', PROVEEDOR: 'Whole Foods' }] };
  const r = clasificarFotoLeida_(archivo, plan, {}, raiz);
  assert.match(r.ruta, /Whole Foods/);
});

test('clasificarFotoLeida_ sin filas (fechaDistinta / Supuesto V) deja el archivo en Por clasificar', () => {
  const raiz = carpetaFalsa('Facturas');
  const archivo = raiz.createFile(blobFalso('image/jpeg'));
  const r = clasificarFotoLeida_(archivo, { filas: [] }, {}, raiz);
  assert.deepEqual(r, { url: 'https://drive/archivo-1' });
});
