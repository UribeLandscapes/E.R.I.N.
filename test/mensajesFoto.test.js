const test = require('node:test');
const assert = require('node:assert/strict');

// En Apps Script estos nombres son globales; en Node se ponen a mano (mismo patrón que
// mensajesFlujo.test.js, más las piezas de foto).
Object.assign(global, require('../src/Hoja.js'), require('../src/Moneda.js'));
Object.assign(global, require('../src/Hoja.js'));
Object.assign(global, require('../src/Reglas.js'));
Object.assign(global, require('../src/Escritura.js'));
Object.assign(global, require('../src/Clases.js'));
Object.assign(global, require('../src/Texto.js'));
Object.assign(global, require('../src/Confirmacion.js'));
Object.assign(global, require('../src/Botones.js'));
Object.assign(global, require('../src/Fecha.js'));
Object.assign(global, require('../src/Registro.js'));
Object.assign(global, require('../src/Extraccion.js'));
Object.assign(global, require('../src/Moneda.js'));
Object.assign(global, require('../src/Gemini.js'));
Object.assign(global, require('../src/Groq.js'));
Object.assign(global, require('../src/GroqApp.js'));
Object.assign(global, require('../src/Mensajes.js'));
Object.assign(global, require('../src/Ediciones.js'));
Object.assign(global, require('../src/Edicion.js'));
Object.assign(global, require('../src/EdicionesApp.js'));
global.registroParaEscribir_ = () => ({ disponible: true, corte: '20260926-000000', porId: new Map() });
Object.assign(global, require('../src/Carpetas.js'));
Object.assign(global, require('../src/Foto.js'));
global.CONFIG = require('./configPrueba.js').CONFIG;
// Utilities.sleep de los reintentos de Gemini, sin esperar de verdad en las pruebas.
global.Utilities = { sleep: () => {} };
global.PESTANA_ESTADO = '_ESTADO';
global.PESTANA_HISTORIAL = '_HISTORIAL';
const { hojaFalsa, libroFalso, filaDe, ponerFila } = require('./falsos.js');
Object.assign(global, require('../src/EscrituraApp.js'));
Object.assign(global, require('../src/BotonesApp.js'));
Object.assign(global, require('../src/RegistroApp.js'));
Object.assign(global, require('../src/HistorialApp.js'));
Object.assign(global, require('../src/CarpetasApp.js'));
Object.assign(global, require('../src/WebhookApp.js'));
Object.assign(global, require('../src/FotoApp.js'));
Object.assign(global, require('../src/MensajesApp.js'));
Object.assign(global, require('../src/PorProcesar.js'));
Object.assign(global, require('../src/Reintento.js'));
Object.assign(global, require('../src/FechaFotoApp.js'));
Object.assign(global, require('../src/PorProcesarApp.js'));
Object.assign(global, require('../src/ReintentoApp.js'));
Object.assign(global, require('../src/MensajesFoto.js'));
Object.assign(global, require('../src/Importacion.js'));
Object.assign(global, require('../src/Duplicado.js'));
Object.assign(global, require('../src/DuplicadoApp.js'));

const { atenderMensaje_, atenderBoton_ } = require('../src/MensajesApp.js');
const { atenderFoto_ } = require('../src/MensajesFoto.js');
const { filasEstado_ } = require('../src/BotonesApp.js');
const { COLUMNAS_ESTADO } = require('../src/Hoja.js');
const { TEXTO_SOLO_TEXTO, TEXTO_FOTO_NO_BAJADA } = require('../src/Mensajes.js');
const { TEXTO_PEDIR_TOTAL } = require('../src/PorProcesar.js');
const { TEXTO_CONTEO_ATENDIDO } = require('../src/Botones.js');
const {
  tecladoFecha_, tecladoFechaFoto_, textoFechaIlegible_, filaFechaFoto_,
  TEXTO_OTRA_FECHA, TEXTO_FECHA_SIN_GASTO,
} = require('../src/Fecha.js');

const AHORA = new Date(2026, 8, 27, 9, 30, 0);
const SELLO = '20260927-093000';
const CHAT = 1000000001;
const ID_ERIN = 501;

const dos = (n) => String(n).padStart(2, '0');
function formatear(fecha, formato) {
  const dia = `${fecha.getFullYear()}-${dos(fecha.getMonth() + 1)}-${dos(fecha.getDate())}`;
  if (formato === 'yyyy-MM-dd') return dia;
  return `${dia.replace(/-/g, '')}-${dos(fecha.getHours())}${dos(fecha.getMinutes())}${dos(fecha.getSeconds())}`;
}

const SALDO_INICIAL = {
  FECHA: '2026-09-01', 'ID FACTURA': 'SALDOINICIAL-20260901', TIPO: 'SALDO INICIAL',
  'DEPÓSITO': 150, MONEDA: 'USD', 'ID FILA': 'BOT-viejo-1', ORIGEN: 'BOT', REGISTRADO: AHORA,
};

// Un gasto ya anotado: deja GROCERIES entre las categorías de la hoja, la clase que
// Gemini elige al leer la foto.
const GASTO_VIEJO = {
  FECHA: '2026-09-02', 'ID FACTURA': 'X-20260902', TIPO: 'GASTO', 'GASTO (USD)': 60,
  MONEDA: 'USD', 'CLASE DE GASTO': 'GROCERIES', 'ID FILA': 'BOT-viejo-2', ORIGEN: 'BOT',
  REGISTRADO: AHORA,
};

/** Libro con Septiembre 2026 y _ESTADO con solo el encabezado. */
function escenario() {
  const sep = hojaFalsa('Septiembre 2026');
  ponerFila(sep, 6, SALDO_INICIAL);
  ponerFila(sep, 7, GASTO_VIEJO);
  const estado = hojaFalsa(PESTANA_ESTADO, { protegerDesborde: false });
  estado.appendRow([...COLUMNAS_ESTADO]);
  return { sep, estado, ss: libroFalso([sep, estado]) };
}

// --- Drive falso: solo lo que usan archivarFoto_ y clasificarFoto_ ---

let siguienteId = 0;

function carpetaFalsa(nombre, padre = null) {
  const carpeta = {
    nombre, padre, hijas: [], archivos: [], id: `carpeta-${(siguienteId += 1)}`,
    getId: () => carpeta.id,
    getName: () => carpeta.nombre,
    getFoldersByName: (n) => {
      const encontradas = carpeta.hijas.filter((h) => h.nombre === n);
      let i = 0;
      return { hasNext: () => i < encontradas.length, next: () => encontradas[i++] };
    },
    getFilesByName: (n) => {
      const encontrados = carpeta.archivos.filter((a) => a.getName() === n);
      let i = 0;
      return { hasNext: () => i < encontrados.length, next: () => encontrados[i++] };
    },
    createFolder: (n) => {
      const hija = carpetaFalsa(n, carpeta);
      carpeta.hijas.push(hija);
      return hija;
    },
    createFile: (blob) => {
      const archivo = {
        nombre: 'sin nombre', mime: blob.getContentType(), carpeta,
        id: `archivo-${(siguienteId += 1)}`,
        getId: () => archivo.id,
        getName: () => archivo.nombre,
        setName: (n) => { archivo.nombre = n; return archivo; },
        getMimeType: () => archivo.mime,
        getParents: () => {
          let dado = false;
          return { hasNext: () => !dado, next: () => { dado = true; return archivo.carpeta; } };
        },
        getUrl: () => `https://drive.google.com/file/d/${archivo.id}/view`,
        moveTo: (destino) => {
          archivo.carpeta.archivos = archivo.carpeta.archivos.filter((a) => a !== archivo);
          archivo.carpeta = destino;
          destino.archivos.push(archivo);
          return archivo;
        },
      };
      carpeta.archivos.push(archivo);
      return archivo;
    },
  };
  return carpeta;
}

/** Ruta "Facturas/2026/9. Septiembre" de un archivo del Drive falso. */
function rutaDe(archivo) {
  const partes = [archivo.getName()];
  for (let c = archivo.carpeta; c; c = c.padre) partes.unshift(c.getName());
  return partes.join('/');
}

/** Todos los archivos del Drive falso, con su ruta. */
function archivosDe(raiz) {
  const lista = raiz.archivos.map(rutaDe);
  raiz.hijas.forEach((h) => lista.push(...archivosDe(h)));
  return lista;
}

const blobFalso = (mime = 'image/jpeg') => ({ getContentType: () => mime, getBytes: () => [1, 2, 3] });

/** Dependencias falsas: Telegram, Gemini, Drive y la foto, todo con dobles. */
function dependencias(ss, raiz, extra = {}) {
  const llamadas = [];
  let idBot = 900;
  return {
    llamadas,
    token: 'tok',
    claveGemini: 'clave-gemini',
    libro: () => ss,
    ahora: () => AHORA,
    formatear,
    obtenerJson: () => null,
    llamar: (token, metodo, cuerpo) => {
      llamadas.push([metodo, cuerpo]);
      if (metodo === 'getFile') {
        return { codigo: 200, datos: { ok: true, result: { file_path: 'photos/file_1.jpg', file_size: 1000 } } };
      }
      idBot += 1;
      return { codigo: 200, datos: { ok: true, result: { message_id: idBot } } };
    },
    descargar: () => blobFalso(),
    base64: () => 'b64-de-la-foto',
    carpetaFacturas: () => raiz,
    archivoPorId: (id) => {
      const buscar = (carpeta) => carpeta.archivos.find((a) => a.getId() === id)
        || carpeta.hijas.reduce((hallado, h) => hallado || buscar(h), null);
      const archivo = buscar(raiz);
      if (!archivo) throw new Error(`no existe el archivo ${id}`);
      return archivo;
    },
    // El OCR de Drive del respaldo sin Gemini (aquí nunca encuentra un total).
    ocr: () => ({ ok: false, motivo: 'sin OCR en las pruebas' }),
    ...extra,
  };
}

/** Extracción de foto (sin intención: el esquema de foto no la trae). */
const datosFoto = (extra = {}) => ({
  legible: true,
  tipo_documento: 'TICKET',
  proveedor: 'Whole Foods',
  fecha: '2026-09-27',
  moneda: 'USD',
  forma_pago: 'EFECTIVO',
  lineas: [{ tipo: 'ITEM', descripcion: 'compra', monto: 22.5, confianza: 'ALTA' }],
  total: 22.5,
  clase: 'GROCERIES',
  casa: null,
  comentario: null,
  descripcion_corta: 'super whole foods',
  confianza: { proveedor: 'ALTA', fecha: 'ALTA', moneda: 'ALTA', total: 'ALTA', clase: 'ALTA' },
  ...extra,
});

/** Gemini falso: cada llamada devuelve la siguiente extracción de la lista. */
function ponerGemini(extracciones, codigo = 200) {
  const pedidos = [];
  const lista = Array.isArray(extracciones) ? [...extracciones] : [extracciones];
  global.UrlFetchApp = {
    fetch: (url, opciones) => {
      pedidos.push({ url, opciones });
      const datos = lista.length > 1 ? lista.shift() : lista[0];
      return {
        getResponseCode: () => codigo,
        getContentText: () => JSON.stringify({
          candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(datos) }] } }],
        }),
      };
    },
  };
  return pedidos;
}

const mensajeFoto = (extra = {}) => ({
  message_id: ID_ERIN,
  date: Math.floor(AHORA.getTime() / 1000),
  chat: { id: CHAT, type: 'private' },
  photo: [{ file_id: 'f-chica', width: 90, height: 90 }, { file_id: 'f-grande', width: 800, height: 600 }],
  ...extra,
});

const enviados = (d) => d.llamadas.filter(([metodo]) => metodo === 'sendMessage');
const textoEnviado = (d, i = 0) => enviados(d)[i][1].text;
const celdaEstado = (estado, fila, columna) => estado.leer(fila, COLUMNAS_ESTADO.indexOf(columna) + 1);
const datosEstado = (estado, fila) => JSON.parse(celdaEstado(estado, fila, 'DATOS'));

/** Una foto atendida de punta a punta, con su escenario. */
function conFoto(extracciones = [datosFoto()], mensaje = mensajeFoto(), extraDeps = {}) {
  const caso = escenario();
  const raiz = carpetaFalsa('Facturas');
  const pedidos = ponerGemini(extracciones);
  const d = dependencias(caso.ss, raiz, extraDeps);
  atenderMensaje_(mensaje, d, caso.estado);
  return { ...caso, raiz, d, pedidos };
}

// --- Camino normal (casos 1 y 2 del plan) ---

test('una foto de factura escribe la fila con el enlace FOTO y confirma con "ver foto"', () => {
  const { sep, d } = conFoto();
  const fila = filaDe(sep, 8);
  assert.equal(fila.PROVEEDOR, 'Whole Foods');
  assert.equal(fila['GASTO (USD)'], 22.5);
  assert.equal(fila.FECHA, '2026-09-27');
  assert.match(fila.FOTO, /^https:\/\/drive\.google\.com\/file\/d\/archivo-\d+\/view$/);
  assert.equal(fila['ID FILA'], `BOT-${SELLO}-${ID_ERIN}-1`);
  assert.equal(enviados(d).length, 1);
  assert.equal(enviados(d)[0][1].parse_mode, 'HTML');
  assert.match(textoEnviado(d), /<b>Foto:<\/b> <a href="https:\/\/drive\.google\.com\/file\/d\/archivo-\d+\/view">ver foto<\/a>/);
});

test('la foto leída queda clasificada en la carpeta del mes con su nombre final', () => {
  const { raiz } = conFoto();
  assert.deepEqual(archivosDe(raiz), ['Facturas/2026/9. Septiembre/2026.09.27 - super whole foods.jpg']);
});

test('la confirmación de la foto deja su REGISTRO abierto con la foto y su id en DATOS', () => {
  const { estado } = conFoto();
  assert.equal(celdaEstado(estado, 2, 'TIPO'), 'REGISTRO');
  const guardado = datosEstado(estado, 2);
  assert.equal(guardado.datos.intencion, 'GASTO');
  assert.match(guardado.datos.foto, /^https:\/\/drive\.google\.com\//);
  assert.match(guardado.datos.idFoto, /^archivo-\d+$/);
});

test('la leyenda de la foto solo va a Gemini: "ayuda" no dispara la guía', () => {
  const { pedidos, sep, d } = conFoto([datosFoto()], mensajeFoto({ caption: 'ayuda, es de Playa' }));
  const cuerpo = JSON.parse(pedidos[0].opciones.payload);
  assert.deepEqual(cuerpo.contents[0].parts[1], { text: 'ayuda, es de Playa' });
  assert.match(textoEnviado(d), /^Listo, agregué el gasto a tu reporte\./);
  assert.equal(filaDe(sep, 8)['GASTO (USD)'], 22.5);
});

test('la foto de mayor tamaño es la que se baja (no la primera del arreglo)', () => {
  const { d } = conFoto();
  const getFile = d.llamadas.find(([metodo]) => metodo === 'getFile');
  assert.deepEqual(getFile[1], { file_id: 'f-grande' });
});

// --- Una factura mandada "como archivo" (mensaje.document) se atiende igual que una foto ---

const mensajeDocumento = (extra = {}) => ({
  message_id: ID_ERIN,
  date: Math.floor(AHORA.getTime() / 1000),
  chat: { id: CHAT, type: 'private' },
  document: { file_id: 'doc-1', mime_type: 'image/jpeg', file_name: 'factura.jpg', file_size: 5000 },
  ...extra,
});

test('una factura mandada como archivo (document image/jpeg) se lee, archiva y escribe igual que una foto', () => {
  const { sep, d, raiz } = conFoto([datosFoto()], mensajeDocumento());
  const fila = filaDe(sep, 8);
  assert.equal(fila.PROVEEDOR, 'Whole Foods');
  assert.equal(fila['GASTO (USD)'], 22.5);
  assert.match(fila.FOTO, /^https:\/\/drive\.google\.com\/file\/d\/archivo-\d+\/view$/);
  assert.deepEqual(archivosDe(raiz), ['Facturas/2026/9. Septiembre/2026.09.27 - super whole foods.jpg']);
  assert.match(textoEnviado(d), /<b>Foto:<\/b> <a href="https:\/\/drive\.google\.com\/file\/d\/archivo-\d+\/view">ver foto<\/a>/);
});

// Un PDF mandado "como archivo" ya se lee, archiva y escribe igual que una foto.
test('un document que es un PDF se lee, archiva (con extensión .pdf) y escribe igual que una foto', () => {
  const { sep, d, raiz } = conFoto(
    [datosFoto()],
    mensajeDocumento({ document: { file_id: 'doc-2', mime_type: 'application/pdf', file_name: 'factura.pdf', file_size: 5000 } }),
    { descargar: () => blobFalso('application/pdf') },
  );
  const fila = filaDe(sep, 8);
  assert.equal(fila.PROVEEDOR, 'Whole Foods');
  assert.equal(fila['GASTO (USD)'], 22.5);
  assert.deepEqual(archivosDe(raiz), ['Facturas/2026/9. Septiembre/2026.09.27 - super whole foods.pdf']);
  assert.match(textoEnviado(d), /<b>Foto:<\/b> <a href="https:\/\/drive\.google\.com\/file\/d\/archivo-\d+\/view">ver foto<\/a>/);
});

test('un PDF mandado como archivo manda inlineData con mimeType application/pdf a Gemini', () => {
  const { pedidos } = conFoto(
    [datosFoto()],
    mensajeDocumento({ document: { file_id: 'doc-3', mime_type: 'application/pdf', file_name: 'factura.pdf', file_size: 5000 } }),
    { descargar: () => blobFalso('application/pdf') },
  );
  const cuerpo = JSON.parse(pedidos[0].opciones.payload);
  assert.equal(cuerpo.contents[0].parts[0].inlineData.mimeType, 'application/pdf');
});

// --- Fallas ---

test('si la foto no se pudo bajar de Telegram avisa y no escribe ni llama a Gemini', () => {
  const caso = escenario();
  const raiz = carpetaFalsa('Facturas');
  const pedidos = ponerGemini([datosFoto()]);
  const d = dependencias(caso.ss, raiz, { descargar: () => { throw new Error('sin red'); } });
  caso.sep.escrituras.length = 0;
  atenderMensaje_(mensajeFoto(), d, caso.estado);
  assert.deepEqual(enviados(d).map(([, cuerpo]) => cuerpo.text), [TEXTO_FOTO_NO_BAJADA]);
  assert.deepEqual(pedidos, []);
  assert.deepEqual(caso.sep.escrituras, []);
  assert.deepEqual(archivosDe(raiz), []);
});

// Ya no se contesta "no la pude leer, mándala otra vez"; la foto queda POR-PROCESAR y el bot
// pregunta el total. El detalle de ese camino se prueba en porProcesarApp.test.js.
test('si Gemini no lee la foto pregunta el total, la deja en Por clasificar y no escribe nada', () => {
  const caso = escenario();
  const raiz = carpetaFalsa('Facturas');
  ponerGemini([datosFoto()], 429);
  const d = dependencias(caso.ss, raiz);
  caso.sep.escrituras.length = 0;
  atenderMensaje_(mensajeFoto(), d, caso.estado);
  assert.deepEqual(enviados(d).map(([, cuerpo]) => cuerpo.text), [TEXTO_PEDIR_TOTAL]);
  assert.deepEqual(caso.sep.escrituras, []);
  assert.equal(celdaEstado(caso.estado, 2, 'TIPO'), 'POR-PROCESAR');
  assert.deepEqual(archivosDe(raiz), ['Facturas/Por clasificar/tg-501.jpg']);
});

test('una foto sin monto legible pregunta el monto y deja la foto en Por clasificar', () => {
  const { sep, estado, raiz, d } = conFoto([datosFoto({ total: null, lineas: [] })]);
  assert.equal(textoEnviado(d), '¿Me dices el monto?');
  assert.equal(enviados(d)[0][1].parse_mode, undefined);
  assert.equal(filaDe(sep, 8).PROVEEDOR, '');
  assert.equal(celdaEstado(estado, 2, 'TIPO'), 'PREGUNTA');
  assert.deepEqual(archivosDe(raiz), ['Facturas/Por clasificar/tg-501.jpg']);
});

// --- Otros adjuntos y mensajes sin texto ---

test('un adjunto que no es foto sigue recibiendo TEXTO_SOLO_TEXTO', () => {
  const caso = escenario();
  const raiz = carpetaFalsa('Facturas');
  const pedidos = ponerGemini([datosFoto()]);
  const d = dependencias(caso.ss, raiz);
  atenderMensaje_({
    message_id: ID_ERIN, date: 1790000000, chat: { id: CHAT, type: 'private' },
    voice: { file_id: 'voz-1' },
  }, d, caso.estado);
  assert.deepEqual(d.llamadas, [['sendMessage', { chat_id: CHAT, text: TEXTO_SOLO_TEXTO }]]);
  assert.deepEqual(pedidos, []);
});

test('un arreglo photo vacío no se trata como foto', () => {
  const caso = escenario();
  const raiz = carpetaFalsa('Facturas');
  ponerGemini([datosFoto()]);
  const d = dependencias(caso.ss, raiz);
  atenderMensaje_({ message_id: ID_ERIN, date: 1790000000, chat: { id: CHAT, type: 'private' }, photo: [] }, d, caso.estado);
  assert.deepEqual(d.llamadas, [['sendMessage', { chat_id: CHAT, text: TEXTO_SOLO_TEXTO }]]);
});

test('atenderFoto_ avisa si el arreglo photo no trae ninguna foto válida', () => {
  const caso = escenario();
  const raiz = carpetaFalsa('Facturas');
  const d = dependencias(caso.ss, raiz);
  atenderFoto_({ ...mensajeFoto(), photo: [{ file_id: '' }] }, d, caso.estado);
  assert.deepEqual(enviados(d).map(([, cuerpo]) => cuerpo.text), [TEXTO_FOTO_NO_BAJADA]);
});

// --- con foto (caso 8: factura del mes pasado) ---

test('una foto de otro mes pregunta con los dos botones, no escribe y deja la foto en Por clasificar', () => {
  const { sep, estado, raiz, d } = conFoto([datosFoto({ fecha: '2026-08-15' })]);
  assert.match(textoEnviado(d), /^El recibo es del 2026-08-15 pero lo mandaste el 2026-09-27, de otro mes\./);
  assert.deepEqual(enviados(d)[0][1].reply_markup, tecladoFecha_(ID_ERIN, '2026-08-15', '2026-09-27'));
  assert.equal(filaDe(sep, 8).PROVEEDOR, '');
  assert.equal(celdaEstado(estado, 2, 'TIPO'), 'FECHA');
  assert.deepEqual(archivosDe(raiz), ['Facturas/Por clasificar/tg-501.jpg']);
});

test('el botón "la fecha del recibo" escribe la fila con FOTO y mueve la foto al mes del recibo', () => {
  const { estado, raiz, d, ss } = conFoto([datosFoto({ fecha: '2026-08-15' })]);
  const callback = {
    id: 'cb-1',
    data: `fecha:${ID_ERIN}:recibo`,
    message: { message_id: 901, date: 1790000000, chat: { id: CHAT, type: 'private' } },
  };
  atenderBoton_(callback, d, estado);
  const agosto = ss.getSheetByName('Agosto 2026');
  const fila = filaDe(agosto, 6);
  assert.equal(fila.FECHA, '2026-08-15');
  assert.match(fila.FOTO, /^https:\/\/drive\.google\.com\/file\/d\/archivo-\d+\/view$/);
  assert.deepEqual(archivosDe(raiz), ['Facturas/2026/8. Agosto/2026.08.15 - super whole foods.jpg']);
  assert.match(textoEnviado(d, 1), /<b>Foto:<\/b> <a href="https:\/\/drive\.google\.com\/file\/d\/archivo-\d+\/view">ver foto<\/a>/);
});

test('el botón "el día que la mandé" también mueve la foto, al mes del envío', () => {
  const { estado, raiz, d } = conFoto([datosFoto({ fecha: '2026-08-15' })]);
  atenderBoton_({
    id: 'cb-2',
    data: `fecha:${ID_ERIN}:envio`,
    message: { message_id: 901, date: 1790000000, chat: { id: CHAT, type: 'private' } },
  }, d, estado);
  assert.deepEqual(archivosDe(raiz), ['Facturas/2026/9. Septiembre/2026.09.27 - super whole foods.jpg']);
});

test('el botón de fecha de una entrada de texto (sin foto) no toca Drive', () => {
  const caso = escenario();
  const raiz = carpetaFalsa('Facturas');
  ponerGemini([{ ...datosFoto({ fecha: '2026-08-15' }), intencion: 'GASTO' }]);
  const d = dependencias(caso.ss, raiz, {
    carpetaFacturas: () => { throw new Error('no debería tocar Drive'); },
    archivoPorId: () => { throw new Error('no debería tocar Drive'); },
  });
  atenderMensaje_({
    message_id: ID_ERIN, date: Math.floor(AHORA.getTime() / 1000), chat: { id: CHAT, type: 'private' },
    text: '22.50 super Whole Foods del 15 de agosto',
  }, d, caso.estado);
  atenderBoton_({
    id: 'cb-3',
    data: `fecha:${ID_ERIN}:recibo`,
    message: { message_id: 901, date: 1790000000, chat: { id: CHAT, type: 'private' } },
  }, d, caso.estado);
  assert.equal(filaDe(caso.ss.getSheetByName('Agosto 2026'), 6).FOTO, '');
});

// --- Corrección de una entrada que vino de una foto ---

test('corregir una entrada que vino de una foto conserva el enlace FOTO y la línea "ver foto"', () => {
  const { sep, estado, d } = conFoto([datosFoto(), {
    ...datosFoto({ proveedor: 'Seven 11', lineas: [], total: null }), intencion: 'CORREGIR',
  }]);
  const enlace = filaDe(sep, 8).FOTO;
  atenderMensaje_({
    message_id: ID_ERIN + 1, date: Math.floor(AHORA.getTime() / 1000), chat: { id: CHAT, type: 'private' },
    text: 'el proveedor es Seven 11', reply_to_message: { message_id: 901, text: 'Listo' },
  }, d, estado);
  const nueva = filaDe(sep, 9);
  assert.equal(nueva.PROVEEDOR, 'Seven 11');
  assert.equal(nueva.FOTO, enlace);
  assert.match(textoEnviado(d, 1), /^Listo, corregí el gasto\. Así quedó:/);
  assert.ok(textoEnviado(d, 1).includes(`<a href="${enlace}">ver foto</a>`), textoEnviado(d, 1));
});

// --- La foto sin fecha legible se pregunta aparte ---

/** Extracción de una foto cuya fecha Gemini no pudo leer. */
const fotoSinFecha = (extra = {}) => datosFoto({
  fecha: null,
  confianza: { proveedor: 'ALTA', fecha: 'BAJA', moneda: 'ALTA', total: 'ALTA', clase: 'ALTA' },
  ...extra,
});

/** Una foto sin fecha legible ya atendida, con su pregunta abierta. */
const conFotoSinFecha = (extracciones = [fotoSinFecha()]) => conFoto(extracciones);

/** Números de fila de _ESTADO con ese TIPO (la hoja falsa nunca pasa de unas pocas filas). */
const filasDeTipo = (estado, tipo) => Array.from({ length: 14 }, (_, i) => i + 2)
  .filter((f) => celdaEstado(estado, f, 'TIPO') === tipo);
const filaFechaFotoDe = (estado) => filasDeTipo(estado, 'FECHA-FOTO')[0];

test('una foto sin fecha legible se anota con el día del mensaje y pregunta aparte si está bien', () => {
  const { sep, estado, d } = conFotoSinFecha();
  assert.equal(filaDe(sep, 8).FECHA, '2026-09-27');
  assert.equal(enviados(d).length, 2);
  assert.equal(textoEnviado(d, 1), textoFechaIlegible_('2026-09-27'));
  assert.deepEqual(enviados(d)[1][1].reply_markup, tecladoFechaFoto_(ID_ERIN));
  const fila = filaFechaFotoDe(estado);
  assert.equal(celdaEstado(estado, fila, 'CLAVE'), String(ID_ERIN));
  assert.equal(celdaEstado(estado, fila, 'ID FILAS'), `BOT-${SELLO}-${ID_ERIN}-1`);
  assert.equal(celdaEstado(estado, fila, 'ESTADO'), 'ABIERTA');
  assert.deepEqual(datosEstado(estado, fila), {
    fechaMensaje: '2026-09-27', idMensaje: ID_ERIN, idPregunta: 902,
  });
});

test('una foto con fecha legible no pregunta nada de fecha', () => {
  const { estado, d } = conFoto();
  assert.equal(enviados(d).length, 1);
  assert.equal(filaFechaFotoDe(estado), undefined);
});

test('una foto sin fecha legible y sin monto pregunta el monto y no la fecha (no escribió filas)', () => {
  const { estado, d } = conFotoSinFecha([fotoSinFecha({ total: null, lineas: [] })]);
  assert.equal(enviados(d).length, 1);
  assert.equal(textoEnviado(d), '¿Me dices el monto?');
  assert.equal(filaFechaFotoDe(estado), undefined);
});

// ---: los botones ---

const tocar = (d, estado, opcion, clave = ID_ERIN) => atenderBoton_({
  id: `cb-${opcion}`,
  data: `fechafoto:${clave}:${opcion}`,
  message: { message_id: 902, date: 1790000000, chat: { id: CHAT, type: 'private' } },
}, d, estado);

test('"Sí, esa fecha" cierra la pregunta, quita los botones y no cambia nada más', () => {
  const { sep, estado, d } = conFotoSinFecha();
  const antes = filaDe(sep, 8);
  d.llamadas.length = 0;
  tocar(d, estado, 'si');
  assert.deepEqual(d.llamadas.map(([metodo]) => metodo), ['answerCallbackQuery', 'editMessageReplyMarkup']);
  assert.equal(celdaEstado(estado, filaFechaFotoDe(estado), 'ESTADO'), 'CERRADA');
  assert.deepEqual(filaDe(sep, 8), antes);
});

test('"Es otra fecha" pide la fecha y deja la pregunta abierta esperando', () => {
  const { estado, d } = conFotoSinFecha();
  d.llamadas.length = 0;
  tocar(d, estado, 'otra');
  assert.deepEqual(d.llamadas.map(([metodo]) => metodo), ['answerCallbackQuery', 'editMessageReplyMarkup', 'sendMessage']);
  assert.equal(textoEnviado(d), TEXTO_OTRA_FECHA);
  const fila = filaFechaFotoDe(estado);
  assert.equal(celdaEstado(estado, fila, 'ESTADO'), 'ABIERTA');
  assert.deepEqual(datosEstado(estado, fila), {
    fechaMensaje: '2026-09-27',
    idMensaje: ID_ERIN,
    idPregunta: 902,
    idOtra: 905,
    tocado: AHORA.toISOString(),
    esperando: true,
  });
});

test('un botón AE-a ya atendido o de una pregunta que no existe solo contesta el aviso corto', () => {
  const { estado, d } = conFotoSinFecha();
  tocar(d, estado, 'si');
  d.llamadas.length = 0;
  tocar(d, estado, 'otra');
  tocar(d, estado, 'si', 999);
  assert.deepEqual(d.llamadas.map(([metodo]) => metodo), ['answerCallbackQuery', 'answerCallbackQuery']);
  assert.equal(d.llamadas[0][1].text, TEXTO_CONTEO_ATENDIDO);
});

// ---: la fecha escrita a mano (formato fijo, sin Gemini) ---

/** el usuario escribe un texto después de la foto. */
const escribir = (d, estado, text) => atenderMensaje_({
  message_id: ID_ERIN + 1,
  date: Math.floor(AHORA.getTime() / 1000),
  chat: { id: CHAT, type: 'private' },
  text,
}, d, estado);

test('una fecha escrita del mismo mes corrige la fila sin pasar por Gemini', () => {
  const { sep, estado, d, pedidos } = conFotoSinFecha();
  tocar(d, estado, 'otra');
  d.llamadas.length = 0;
  escribir(d, estado, '25/09');
  assert.equal(pedidos.length, 1, 'Gemini solo se llamó por la foto');
  const nueva = filaDe(sep, 9);
  assert.equal(nueva.FECHA, '2026-09-25');
  assert.equal(nueva['ID FACTURA'], 'WHOLEFOODS-20260925');
  assert.equal(filaDe(sep, 8).PROVEEDOR, '');
  assert.equal(celdaEstado(estado, filaFechaFotoDe(estado), 'ESTADO'), 'CERRADA');
});

test('fecha escrita no cierra pregunta ni mueve foto si la fila fue editada a mano', () => {
  const { sep, estado, d, raiz } = conFotoSinFecha();
  tocar(d, estado, 'otra');
  const id = filaDe(sep, 8)['ID FILA'];
  const leer = global.registroParaEscribir_;
  const tiene = global.tieneEdicionesManuales_;
  global.registroParaEscribir_ = () => require('../src/Ediciones.js').registroEdiciones_({
    disponible: true, corte: '20260926-000000',
    filas: [[AHORA, 'Septiembre 2026', id, 'PROVEEDOR']],
  });
  global.tieneEdicionesManuales_ = require('../src/Ediciones.js').tieneEdicionesManuales_;
  const antes = archivosDe(raiz);
  d.llamadas.length = 0;
  try { escribir(d, estado, '25/09'); } finally {
    global.registroParaEscribir_ = leer;
    global.tieneEdicionesManuales_ = tiene;
  }
  assert.equal(textoEnviado(d), TEXTO_NO_CORRIJO_MANUAL);
  assert.equal(filaDe(sep, 8).FECHA, '2026-09-27');
  assert.equal(celdaEstado(estado, filaFechaFotoDe(estado), 'ESTADO'), 'ABIERTA');
  assert.deepEqual(archivosDe(raiz), antes);
});

test('una fecha escrita de otro mes mueve las filas y recalcula el ID FACTURA', () => {
  const { sep, estado, d, ss, pedidos } = conFotoSinFecha();
  tocar(d, estado, 'otra');
  d.llamadas.length = 0;
  escribir(d, estado, '15/08');
  assert.equal(pedidos.length, 1);
  const agosto = ss.getSheetByName('Agosto 2026');
  const fila = filaDe(agosto, 6);
  assert.equal(fila.FECHA, '2026-08-15');
  assert.equal(fila['ID FACTURA'], 'WHOLEFOODS-20260815');
  assert.equal(fila.PROVEEDOR, 'Whole Foods');
  assert.match(fila.FOTO, /^https:\/\/drive\.google\.com\//);
  assert.equal(filaDe(sep, 8).PROVEEDOR, '');
  assert.match(textoEnviado(d), /^Listo, corregí el gasto\. Así quedó:/);
  assert.ok(textoEnviado(d).includes('ver foto'), textoEnviado(d));
  assert.equal(celdaEstado(estado, filaFechaFotoDe(estado), 'ESTADO'), 'CERRADA');
});

test('la fecha escrita con año propio también vale', () => {
  const { estado, d, ss } = conFotoSinFecha();
  tocar(d, estado, 'otra');
  escribir(d, estado, '15/08/2025');
  assert.equal(filaDe(ss.getSheetByName('Agosto 2025'), 6).FECHA, '2025-08-15');
});

test('un texto que no es solo una fecha sigue el camino normal y la pregunta sigue esperando', () => {
  const { estado, d, pedidos } = conFotoSinFecha([fotoSinFecha(), { ...datosFoto(), intencion: 'GASTO' }]);
  tocar(d, estado, 'otra');
  escribir(d, estado, 'fue el 25 de septiembre');
  assert.equal(pedidos.length, 2, 'el texto sí pasó por Gemini');
  const fila = filaFechaFotoDe(estado);
  assert.equal(celdaEstado(estado, fila, 'ESTADO'), 'ABIERTA');
  assert.equal(datosEstado(estado, fila).esperando, true);
});

test('una fecha escrita sin pregunta esperando sigue el camino normal', () => {
  const { estado, d, pedidos } = conFotoSinFecha([fotoSinFecha(), { ...datosFoto(), intencion: 'GASTO' }]);
  escribir(d, estado, '25/09');
  assert.equal(pedidos.length, 2);
});

test('si el gasto de la foto ya no está, la fecha escrita cierra la pregunta y lo dice', () => {
  const { estado, d, pedidos } = conFotoSinFecha();
  tocar(d, estado, 'otra');
  // El REGISTRO de la foto se cerró (p. ej. el usuario ya la borró): no hay a qué aplicarle la fecha.
  estado.getRange(2, COLUMNAS_ESTADO.indexOf('ESTADO') + 1).setValue('CERRADA');
  d.llamadas.length = 0;
  escribir(d, estado, '25/09');
  assert.equal(pedidos.length, 1);
  assert.deepEqual(enviados(d).map(([, cuerpo]) => cuerpo.text), [TEXTO_FECHA_SIN_GASTO]);
  assert.equal(celdaEstado(estado, filaFechaFotoDe(estado), 'ESTADO'), 'CERRADA');
});

test('un "fechafoto:" mal formado no lanza y solo contesta el botón', () => {
  const { estado, d } = conFotoSinFecha();
  d.llamadas.length = 0;
  atenderBoton_({
    id: 'cb-raro',
    data: `fechafoto:${ID_ERIN}:tal-vez`,
    message: { message_id: 902, date: 1790000000, chat: { id: CHAT, type: 'private' } },
  }, d, estado);
  assert.deepEqual(d.llamadas.map(([metodo]) => metodo), ['answerCallbackQuery']);
  assert.equal(celdaEstado(estado, filaFechaFotoDe(estado), 'ESTADO'), 'ABIERTA');
});

// --- La foto sigue a su mes cuando la entrada se reescribe en otro mes (hueco 1) ---

/** Un mensaje de texto cualquiera del usuario (con o sin "Responder"). */
const mensajeTexto = (text, extra = {}) => ({
  message_id: ID_ERIN + 1,
  date: Math.floor(AHORA.getTime() / 1000),
  chat: { id: CHAT, type: 'private' },
  text,
  ...extra,
});

test('corregir la fecha a otro mes mueve la foto a la carpeta de ese mes', () => {
  const { raiz, d, estado, ss } = conFoto([datosFoto(), {
    ...datosFoto({ fecha: '2026-08-15', lineas: [], total: null }), intencion: 'CORREGIR',
  }]);
  atenderMensaje_(mensajeTexto('la fecha es el 15 de agosto', {
    reply_to_message: { message_id: 901, text: 'Listo' },
  }), d, estado);
  assert.equal(filaDe(ss.getSheetByName('Agosto 2026'), 6).FECHA, '2026-08-15');
  assert.deepEqual(archivosDe(raiz), ['Facturas/2026/8. Agosto/2026.08.15 - super whole foods.jpg']);
});

test('una corrección del mismo mes deja la foto donde está', () => {
  const { raiz, d, estado } = conFoto([datosFoto(), {
    ...datosFoto({ proveedor: 'Seven 11', lineas: [], total: null }), intencion: 'CORREGIR',
  }]);
  atenderMensaje_(mensajeTexto('el proveedor es Seven 11', {
    reply_to_message: { message_id: 901, text: 'Listo' },
  }), d, estado);
  assert.deepEqual(archivosDe(raiz), ['Facturas/2026/9. Septiembre/2026.09.27 - super whole foods.jpg']);
});

test('una corrección de una entrada de texto (sin foto) no toca Drive', () => {
  const caso = escenario();
  const raiz = carpetaFalsa('Facturas');
  ponerGemini([
    { ...datosFoto(), intencion: 'GASTO' },
    { ...datosFoto({ fecha: '2026-08-15', lineas: [], total: null }), intencion: 'CORREGIR' },
  ]);
  const d = dependencias(caso.ss, raiz, {
    carpetaFacturas: () => { throw new Error('no debería tocar Drive'); },
    archivoPorId: () => { throw new Error('no debería tocar Drive'); },
  });
  atenderMensaje_(mensajeTexto('22.50 super Whole Foods'), d, caso.estado);
  atenderMensaje_(mensajeTexto('la fecha es el 15 de agosto', {
    reply_to_message: { message_id: 901, text: 'Listo' },
  }), d, caso.estado);
  assert.equal(filaDe(caso.ss.getSheetByName('Agosto 2026'), 6).FECHA, '2026-08-15');
});

test('la fecha escrita de otro mes también mueve la foto a ese mes', () => {
  const { estado, d, raiz } = conFotoSinFecha();
  tocar(d, estado, 'otra');
  escribir(d, estado, '15/08');
  assert.deepEqual(archivosDe(raiz), ['Facturas/2026/8. Agosto/2026.08.15 - super whole foods.jpg']);
});

// --- Foto sin fecha Y sin monto: la fecha se pregunta cuando el usuario dice el monto (hueco 3) ---

test('al contestar el monto de una foto sin fecha legible se escribe, se clasifica y se pregunta la fecha', () => {
  const { estado, d, sep, raiz } = conFotoSinFecha([
    fotoSinFecha({ total: null, lineas: [] }),
    { ...datosFoto({ total: 30, lineas: [] }), intencion: 'RESPUESTA' },
  ]);
  d.llamadas.length = 0;
  escribir(d, estado, '30');
  const fila = filaDe(sep, 8);
  assert.equal(fila['GASTO (USD)'], 30);
  assert.equal(fila.FECHA, '2026-09-27');
  assert.deepEqual(archivosDe(raiz), ['Facturas/2026/9. Septiembre/2026.09.27 - super whole foods.jpg']);
  assert.equal(enviados(d).length, 2);
  assert.equal(textoEnviado(d, 1), textoFechaIlegible_('2026-09-27'));
  assert.deepEqual(enviados(d)[1][1].reply_markup, tecladoFechaFoto_(ID_ERIN));
  const preguntaFecha = filasDeTipo(estado, 'FECHA-FOTO');
  assert.equal(preguntaFecha.length, 1);
  // Las filas llevan el ID MENSAJE TG de la foto, no el de la respuesta con el monto.
  assert.equal(celdaEstado(estado, preguntaFecha[0], 'ID FILAS'), `BOT-${SELLO}-${ID_ERIN}-1`);
});

test('al contestar el monto de una foto con fecha legible no se pregunta ninguna fecha', () => {
  const { estado, d } = conFoto([
    datosFoto({ total: null, lineas: [] }),
    { ...datosFoto({ total: 30, lineas: [] }), intencion: 'RESPUESTA' },
  ]);
  d.llamadas.length = 0;
  escribir(d, estado, '30');
  assert.equal(enviados(d).length, 1);
  assert.deepEqual(filasDeTipo(estado, 'FECHA-FOTO'), []);
});

// --- Dos fotos esperando fecha a la vez (hueco 2) ---

/** Dos fotos sin fecha legible, una de Whole Foods (501) y otra de Seven 11 (511). */
function dosFotosSinFecha() {
  const caso = conFotoSinFecha([fotoSinFecha(), fotoSinFecha({ proveedor: 'Seven 11', descripcion_corta: 'seven 11' })]);
  atenderMensaje_(mensajeFoto({ message_id: ID_ERIN + 10 }), caso.d, caso.estado);
  return caso;
}

const proveedorEnAgosto = (ss) => filaDe(ss.getSheetByName('Agosto 2026'), 6).PROVEEDOR;

test('con dos fotos esperando, la fecha escrita sin "Responder" va a la que tocó "Es otra fecha" al final', () => {
  const { estado, d, ss } = dosFotosSinFecha();
  tocar(d, estado, 'otra', ID_ERIN + 10);
  d.ahora = () => new Date(2026, 8, 27, 10, 0, 0);
  tocar(d, estado, 'otra', ID_ERIN);
  escribir(d, estado, '15/08');
  assert.equal(proveedorEnAgosto(ss), 'Whole Foods');
});

test('con dos fotos esperando, "Responder" sobre la pregunta manda la fecha a esa foto', () => {
  const { estado, d, ss } = dosFotosSinFecha();
  tocar(d, estado, 'otra', ID_ERIN);
  d.ahora = () => new Date(2026, 8, 27, 10, 0, 0);
  tocar(d, estado, 'otra', ID_ERIN + 10);
  atenderMensaje_(mensajeTexto('15/08', { reply_to_message: { message_id: 902, text: 'No pude leer la fecha' } }), d, estado);
  assert.equal(proveedorEnAgosto(ss), 'Whole Foods');
});

test('con dos fotos esperando, "Responder" sobre la confirmación manda la fecha a esa foto', () => {
  const { estado, d, ss } = dosFotosSinFecha();
  tocar(d, estado, 'otra', ID_ERIN);
  d.ahora = () => new Date(2026, 8, 27, 10, 0, 0);
  tocar(d, estado, 'otra', ID_ERIN + 10);
  atenderMensaje_(mensajeTexto('15/08', { reply_to_message: { message_id: 901, text: 'Listo' } }), d, estado);
  assert.equal(proveedorEnAgosto(ss), 'Whole Foods');
});

test('con dos fotos esperando, "Responder" sobre la propia foto manda la fecha a esa foto', () => {
  const { estado, d, ss } = dosFotosSinFecha();
  tocar(d, estado, 'otra', ID_ERIN);
  d.ahora = () => new Date(2026, 8, 27, 10, 0, 0);
  tocar(d, estado, 'otra', ID_ERIN + 10);
  atenderMensaje_(mensajeTexto('15/08', { reply_to_message: { message_id: ID_ERIN } }), d, estado);
  assert.equal(proveedorEnAgosto(ss), 'Whole Foods');
});

// --- La fecha escrita se lee con el año de la foto, no con el del día en que la escribe (hueco 4) ---

test('la fecha escrita sin año usa el año de la foto, aunque el usuario conteste el año siguiente', () => {
  const { estado, d, ss } = conFotoSinFecha();
  tocar(d, estado, 'otra');
  atenderMensaje_({
    message_id: ID_ERIN + 1,
    date: Math.floor(new Date(2027, 0, 5, 9, 0, 0).getTime() / 1000),
    chat: { id: CHAT, type: 'private' },
    text: '15/08',
  }, d, estado);
  assert.equal(filaDe(ss.getSheetByName('Agosto 2026'), 6).FECHA, '2026-08-15');
});

test('"Responder" sobre un mensaje cualquiera no rompe: la fecha va a la pregunta que espera', () => {
  const { estado, d, ss } = conFotoSinFecha();
  tocar(d, estado, 'otra');
  atenderMensaje_(mensajeTexto('15/08', { reply_to_message: { message_id: 777, text: 'cualquier cosa' } }), d, estado);
  assert.equal(filaDe(ss.getSheetByName('Agosto 2026'), 6).FECHA, '2026-08-15');
});

// ---: aviso de factura duplicada ---

/** Fila ya anotada en Septiembre 2026 que coincide con la foto por defecto (Whole Foods, 22.50). */
const GASTO_IGUAL = {
  FECHA: '2026-09-27', 'ID FACTURA': 'WHOLEFOODS-20260927', PROVEEDOR: 'Whole Foods', TIPO: 'GASTO',
  'GASTO (USD)': 22.5, MONEDA: 'USD', 'ID FILA': 'BOT-viejo-3', ORIGEN: 'BOT',
  REGISTRADO: new Date(2026, 8, 27, 8, 0, 0),
};

/** Foto atendida con una fila igual ya en la hoja; `aPapelera` guarda los ids mandados a la papelera. */
function conFotoRepetida(existente = GASTO_IGUAL, extracciones = [datosFoto()], preparar = () => {}) {
  const caso = escenario();
  ponerFila(caso.sep, 8, existente);
  preparar(caso);
  const raiz = carpetaFalsa('Facturas');
  const pedidos = ponerGemini(extracciones);
  const papelera = [];
  const d = dependencias(caso.ss, raiz, { aPapelera: (id) => papelera.push(id) });
  atenderMensaje_(mensajeFoto(), d, caso.estado);
  return { ...caso, raiz, d, pedidos, papelera };
}

const tocarDuplicado = (d, estado, opcion, clave = ID_ERIN) => atenderBoton_({
  id: `cb-dup-${opcion}`,
  data: `duplicado:${clave}:${opcion}`,
  message: { message_id: 903, date: 1790000000, chat: { id: CHAT, type: 'private' } },
}, d, estado);

const metodos = (d) => d.llamadas.map(([metodo]) => metodo);

test('foto ya anotada: avisa con los dos botones, no escribe filas y deja la foto en Por clasificar', () => {
  const { sep, estado, raiz, d } = conFotoRepetida();
  assert.equal(enviados(d).length, 1);
  assert.equal(textoEnviado(d),
    'Esta factura ya está anotada: la agregaste el 27/09/2026 por 22.50, proveedor Whole Foods.');
  assert.deepEqual(enviados(d)[0][1].reply_markup, tecladoDuplicado_(ID_ERIN));
  assert.equal(filaDe(sep, 9).PROVEEDOR, '');
  assert.deepEqual(archivosDe(raiz), ['Facturas/Por clasificar/tg-501.jpg']);
  assert.equal(celdaEstado(estado, 2, 'TIPO'), 'DUPLICADO');
  assert.equal(celdaEstado(estado, 2, 'CLAVE'), String(ID_ERIN));
  assert.equal(celdaEstado(estado, 2, 'ESTADO'), 'ABIERTA');
  const guardado = datosEstado(estado, 2);
  assert.equal(guardado.paso, 'aviso');
  assert.equal(guardado.mimeType, 'image/jpeg');
  assert.equal(guardado.datos.total, 22.5);
  assert.match(guardado.datos.idFoto, /^archivo-\d+$/);
  assert.equal(celdaEstado(estado, 3, 'TIPO'), '');
});

test('foto ya anotada en el Excel viejo: el aviso lo dice y usa la fecha de la factura', () => {
  const { d } = conFotoRepetida({ ...GASTO_IGUAL, ORIGEN: 'ARCHIVO', REGISTRADO: new Date(2026, 8, 29, 18, 0, 0) });
  assert.equal(textoEnviado(d),
    'Esta factura ya está anotada en el Excel viejo: factura del 27/09/2026 por 22.50, proveedor Whole Foods.');
});

test('foto con otro total, otra fecha u otro proveedor que lo anotado se anota como siempre', () => {
  [{ total: 23 }, { fecha: '2026-09-26' }, { proveedor: 'Seven 11' }].forEach((cambio) => {
    const { sep, d } = conFotoRepetida(GASTO_IGUAL, [datosFoto({
      ...cambio, ...(cambio.total ? { lineas: [{ tipo: 'ITEM', descripcion: 'compra', monto: 23, confianza: 'ALTA' }] } : {}),
    })]);
    assert.equal(filaDe(sep, 9).ORIGEN, 'BOT', JSON.stringify(cambio));
    assert.match(textoEnviado(d), /Foto:/);
  });
});

test('un depósito igual no cuenta: la foto se anota normal', () => {
  const { sep } = conFotoRepetida({ ...GASTO_IGUAL, TIPO: 'DEPOSITO' });
  assert.equal(filaDe(sep, 9).PROVEEDOR, 'Whole Foods');
});

test('S3: sin total no hay aviso, el bot pregunta el monto', () => {
  const { d, estado } = conFotoRepetida(GASTO_IGUAL, [datosFoto({ total: null, lineas: [] })]);
  assert.equal(textoEnviado(d), '¿Me dices el monto?');
  assert.equal(celdaEstado(estado, 2, 'TIPO'), 'PREGUNTA');
});

test('S3: fecha no legible no revisa duplicado (se anota con el día del mensaje)', () => {
  const { sep, d } = conFotoRepetida(GASTO_IGUAL, [fotoSinFecha()]);
  assert.equal(filaDe(sep, 9).PROVEEDOR, 'Whole Foods');
  assert.equal(enviados(d).length, 2);
});

test('S3: fecha de otro mes pregunta la fecha aunque haya una igual en ese mes, sin aviso', () => {
  const { estado, d } = conFotoRepetida(GASTO_IGUAL, [datosFoto({ fecha: '2026-08-15' })], ({ ss }) => {
    const agosto = hojaFalsa('Agosto 2026');
    ponerFila(agosto, 6, { ...GASTO_IGUAL, FECHA: '2026-08-15' });
    ss.hojas.push(agosto);
  });
  assert.match(textoEnviado(d), /^El recibo es del 2026-08-15/);
  assert.equal(celdaEstado(estado, 2, 'TIPO'), 'FECHA');
});

test('S4: si no existe la pestaña del mes de la fecha no hay duplicado', () => {
  const caso = escenario();
  caso.ss.hojas.splice(caso.ss.hojas.indexOf(caso.sep), 1);
  assert.equal(avisarSiDuplicada_({ ss: caso.ss }, { filas: [{ FECHA: '2026-09-27', PROVEEDOR: 'Whole Foods', 'GASTO (USD)': 22.5 }] }, {}, {}), false);
});

test('botón 1 "Me equivoqué": cierra, foto a la papelera, no escribe y contesta', () => {
  const { sep, estado, d, papelera } = conFotoRepetida();
  const idFoto = datosEstado(estado, 2).datos.idFoto;
  d.llamadas.length = 0;
  tocarDuplicado(d, estado, 'equivoque');
  assert.deepEqual(metodos(d), ['answerCallbackQuery', 'editMessageReplyMarkup', 'sendMessage']);
  assert.equal(textoEnviado(d), 'Listo, no la agregué.');
  assert.deepEqual(papelera, [idFoto]);
  assert.equal(celdaEstado(estado, 2, 'ESTADO'), 'CERRADA');
  assert.equal(filaDe(sep, 9).PROVEEDOR, '');
});

test('un segundo toque del botón 1 solo contesta "atendido" y no vuelve a la papelera', () => {
  const { estado, d, papelera } = conFotoRepetida();
  tocarDuplicado(d, estado, 'equivoque');
  d.llamadas.length = 0;
  tocarDuplicado(d, estado, 'equivoque');
  assert.deepEqual(metodos(d), ['answerCallbackQuery']);
  assert.equal(d.llamadas[0][1].text, TEXTO_CONTEO_ATENDIDO);
  assert.equal(papelera.length, 1);
});

test('si la papelera falla igual se cierra y se le contesta al usuario', () => {
  const { estado, d } = conFotoRepetida();
  d.aPapelera = () => { throw new Error('Drive caído'); };
  d.llamadas.length = 0;
  tocarDuplicado(d, estado, 'equivoque');
  assert.equal(textoEnviado(d), 'Listo, no la agregué.');
  assert.equal(celdaEstado(estado, 2, 'ESTADO'), 'CERRADA');
});

test('botón 2 pide confirmar con Sí/No, deja el registro abierto en paso confirmar y no escribe', () => {
  const { sep, estado, d, papelera } = conFotoRepetida();
  d.llamadas.length = 0;
  tocarDuplicado(d, estado, 'agregar');
  assert.deepEqual(metodos(d), ['answerCallbackQuery', 'editMessageReplyMarkup', 'sendMessage']);
  assert.equal(textoEnviado(d), '¿Estás segura de que quieres agregarla otra vez?');
  assert.deepEqual(enviados(d)[0][1].reply_markup, tecladoConfirmarDuplicado_(ID_ERIN));
  assert.equal(celdaEstado(estado, 2, 'ESTADO'), 'ABIERTA');
  assert.equal(datosEstado(estado, 2).paso, 'confirmar');
  assert.equal(filaDe(sep, 9).PROVEEDOR, '');
  assert.deepEqual(papelera, []);
});

test('botón 2 tocado otra vez, o Sí/No antes de tiempo, solo contesta "atendido"', () => {
  const { sep, estado, d } = conFotoRepetida();
  tocarDuplicado(d, estado, 'seguro');
  tocarDuplicado(d, estado, 'agregar');
  d.llamadas.length = 0;
  tocarDuplicado(d, estado, 'agregar');
  tocarDuplicado(d, estado, 'equivoque');
  assert.deepEqual(metodos(d), ['answerCallbackQuery', 'answerCallbackQuery']);
  assert.equal(filaDe(sep, 9).PROVEEDOR, '');
});

test('2 y luego Sí: cierra, escribe la fila con FOTO, clasifica la foto y confirma como una foto normal', () => {
  const { sep, estado, raiz, d, papelera } = conFotoRepetida();
  tocarDuplicado(d, estado, 'agregar');
  d.llamadas.length = 0;
  tocarDuplicado(d, estado, 'seguro');
  const fila = filaDe(sep, 9);
  assert.equal(fila.PROVEEDOR, 'Whole Foods');
  assert.equal(fila['GASTO (USD)'], 22.5);
  assert.match(fila.FOTO, /^https:\/\/drive\.google\.com\/file\/d\/archivo-\d+\/view$/);
  assert.equal(celdaEstado(estado, 2, 'ESTADO'), 'CERRADA');
  assert.deepEqual(archivosDe(raiz), ['Facturas/2026/9. Septiembre/2026.09.27 - super whole foods.jpg']);
  assert.match(textoEnviado(d), /<b>Foto:<\/b> <a href/);
  assert.deepEqual(papelera, []);
  assert.equal(celdaEstado(estado, 3, 'TIPO'), 'REGISTRO');
});

test('un segundo toque en Sí no escribe dos veces', () => {
  const { sep, estado, d } = conFotoRepetida();
  tocarDuplicado(d, estado, 'agregar');
  tocarDuplicado(d, estado, 'seguro');
  tocarDuplicado(d, estado, 'seguro');
  assert.equal(filaDe(sep, 10).PROVEEDOR, '');
});

test('2 y luego No: cierra, foto a la papelera, no escribe y contesta', () => {
  const { sep, estado, d, papelera } = conFotoRepetida();
  const idFoto = datosEstado(estado, 2).datos.idFoto;
  tocarDuplicado(d, estado, 'agregar');
  d.llamadas.length = 0;
  tocarDuplicado(d, estado, 'cancelar');
  assert.equal(textoEnviado(d), 'Listo, no la agregué.');
  assert.deepEqual(papelera, [idFoto]);
  assert.equal(celdaEstado(estado, 2, 'ESTADO'), 'CERRADA');
  assert.equal(filaDe(sep, 9).PROVEEDOR, '');
});

test('un botón de duplicado de un aviso que no existe o mal formado solo contesta "atendido"', () => {
  const { estado, d } = conFotoRepetida();
  d.llamadas.length = 0;
  tocarDuplicado(d, estado, 'equivoque', 999);
  atenderBoton_({ id: 'cb-x', data: 'duplicado:501:raro', message: { message_id: 903, date: 1790000000, chat: { id: CHAT } } }, d, estado);
  assert.deepEqual(metodos(d), ['answerCallbackQuery', 'answerCallbackQuery']);
  assert.equal(d.llamadas[0][1].text, TEXTO_CONTEO_ATENDIDO);
});
