const test = require('node:test');
const assert = require('node:assert/strict');

// En Apps Script todos estos nombres son globales; en Node se ponen a mano antes de requerir la
// capa de app (mismo patrón que porProcesarApp.test.js, más las piezas).
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
Object.assign(global, require('../src/Edicion.js'));
Object.assign(global, require('../src/Ediciones.js'));
Object.assign(global, require('../src/EdicionesApp.js'));
Object.assign(global, require('../src/Carpetas.js'));
Object.assign(global, require('../src/Foto.js'));
Object.assign(global, require('../src/PorProcesar.js'));
Object.assign(global, require('../src/Reintento.js'));
global.CONFIG = require('./configPrueba.js').CONFIG;
// Utilities.sleep de los reintentos de Gemini, sin esperar de verdad en las pruebas.
global.Utilities = { sleep: () => {} };
global.PESTANA_ESTADO = '_ESTADO';
global.PESTANA_HISTORIAL = '_HISTORIAL';
global.registroParaEscribir_ = () => registroEdiciones_({ filas: [], corte: '20260926-000000', disponible: true });
global.asegurarEdiciones_ = () => true;
const { hojaFalsa, libroFalso, filaDe, ponerFila } = require('./falsos.js');
Object.assign(global, require('../src/EscrituraApp.js'));
Object.assign(global, require('../src/BotonesApp.js'));
Object.assign(global, require('../src/RegistroApp.js'));
Object.assign(global, require('../src/HistorialApp.js'));
Object.assign(global, require('../src/CarpetasApp.js'));
Object.assign(global, require('../src/WebhookApp.js'));
Object.assign(global, require('../src/FotoApp.js'));
Object.assign(global, require('../src/MensajesApp.js'));
Object.assign(global, require('../src/FechaFotoApp.js'));
Object.assign(global, require('../src/PorProcesarApp.js'));
Object.assign(global, require('../src/ReintentoApp.js'));
Object.assign(global, require('../src/MensajesFoto.js'));
Object.assign(global, require('../src/Importacion.js'));
Object.assign(global, require('../src/Duplicado.js'));
Object.assign(global, require('../src/DuplicadoApp.js'));

const { atenderMensaje_, atenderBoton_ } = require('../src/MensajesApp.js');
const {
  reintentarPorProcesar_, reintentarFotos, reintentarFotosConCandado_, ESPERA_CANDADO_REINTENTO_MS, atenderProveedorEscrito_, guardarIntento_, releerConGemini_, llenarFilas_,
} = require('../src/ReintentoApp.js');
const { COLUMNAS_ESTADO, COLUMNAS_HISTORIAL } = require('../src/Hoja.js');
const { PREGUNTA_ABIERTA } = require('../src/Escritura.js');
const { PREGUNTA_CERRADA } = require('../src/EscrituraApp.js');
const { TEXTO_CONTEO_ATENDIDO } = require('../src/Botones.js');
const {
  TEXTO_PEDIR_TOTAL, TEXTO_PREGUNTA_PROVEEDOR, TEXTO_PREGUNTA_FORMA_PAGO, tecladoFormaPago_,
  filaPorProcesar_,
} = require('../src/PorProcesar.js');

const AHORA = new Date(2026, 8, 27, 9, 30, 0);
const SELLO = '20260927-093000';
const CHAT = 1000000001;
const ID_ERIN = 501;
const TEXTO_RECIBO = ['SUPER 99, S.A.', 'RUC 155646463-2-2017', 'Pan', '3.25', 'TOTAL  B/. 66.34'].join('\n');

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

/** Libro con Septiembre 2026, _ESTADO y (si se pide) _HISTORIAL con filas de proveedores. */
function escenario(historial = []) {
  const sep = hojaFalsa('Septiembre 2026');
  ponerFila(sep, 6, SALDO_INICIAL);
  const estado = hojaFalsa(PESTANA_ESTADO, { protegerDesborde: false });
  estado.appendRow([...COLUMNAS_ESTADO]);
  const hojas = [sep, estado];
  if (historial.length) {
    const hist = hojaFalsa(PESTANA_HISTORIAL, { protegerDesborde: false });
    hist.appendRow([...COLUMNAS_HISTORIAL]);
    historial.forEach((fila) => hist.appendRow(COLUMNAS_HISTORIAL.map((c) => fila[c] || '')));
    hojas.push(hist);
  }
  return { sep, estado, ss: libroFalso(hojas) };
}

// --- Drive falso (el de mensajesFoto.test.js más getFiles, getBlob y la papelera) ---

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
    getFiles: () => {
      const vivos = carpeta.archivos.filter((a) => !a.papelera);
      let i = 0;
      return { hasNext: () => i < vivos.length, next: () => vivos[i++] };
    },
    createFolder: (n) => {
      const hija = carpetaFalsa(n, carpeta);
      carpeta.hijas.push(hija);
      return hija;
    },
    createFile: (blob) => {
      const archivo = {
        nombre: 'sin nombre', mime: blob.getContentType(), carpeta, papelera: false,
        creado: new Date(2026, 8, 27, 8, 0, 0),
        id: `archivo-${(siguienteId += 1)}`,
        getId: () => archivo.id,
        getName: () => archivo.nombre,
        setName: (n) => { archivo.nombre = n; return archivo; },
        getMimeType: () => archivo.mime,
        getBlob: () => blobFalso(archivo.mime),
        getDateCreated: () => archivo.creado,
        setTrashed: (v) => { archivo.papelera = v; return archivo; },
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

function rutaDe(archivo) {
  const partes = [archivo.getName()];
  for (let c = archivo.carpeta; c; c = c.padre) partes.unshift(c.getName());
  return partes.join('/');
}

function archivosDe(raiz) {
  const lista = raiz.archivos.filter((a) => !a.papelera).map(rutaDe);
  raiz.hijas.forEach((h) => lista.push(...archivosDe(h)));
  return lista;
}

const blobFalso = (mime = 'image/jpeg') => ({ getContentType: () => mime, getBytes: () => [1, 2, 3] });

test('llenarFilas_ no pisa PENDIENTE ni REVISAR anotados', () => {
  const hoja = hojaFalsa('Septiembre 2026');
  const id = 'BOT-20260927-093000-1-1';
  const valores = { PROVEEDOR: 'PENDIENTE', REVISAR: '', 'ID FILA': id };
  ponerFila(hoja, 6, valores);
  const registro = registroEdiciones_({
    filas: [[AHORA, 'Septiembre 2026', id, 'PROVEEDOR|REVISAR']], corte: '20260926-000000', disponible: true,
  });
  const [llena] = llenarFilas_([{ hoja, numero: 6, idFila: id, valores }], { PROVEEDOR: 'Riba Smith' }, true, registro);
  assert.deepEqual(llena.saltadas.sort(), ['PROVEEDOR', 'REVISAR']);
  assert.equal(filaDe(hoja, 6).PROVEEDOR, 'PENDIENTE');
  assert.equal(filaDe(hoja, 6).REVISAR, '');
});

test('llenarFilas_ conserva la marca del proveedor protegido y escribe la clase libre', () => {
  const hoja = hojaFalsa('Septiembre 2026');
  const id = 'BOT-20260927-093000-1-2';
  const valores = {
    PROVEEDOR: 'PENDIENTE', 'CLASE DE GASTO': 'PENDIENTE',
    REVISAR: 'PENDIENTE: PROVEEDOR, CLASE DE GASTO', 'ID FILA': id,
  };
  ponerFila(hoja, 6, valores);
  const registro = registroEdiciones_({
    filas: [[AHORA, 'Septiembre 2026', id, 'PROVEEDOR']], corte: '20260926-000000', disponible: true,
  });
  llenarFilas_([{ hoja, numero: 6, idFila: id, valores }], {
    PROVEEDOR: 'Riba Smith', 'CLASE DE GASTO': 'GROCERIES W1 NORTE',
  }, false, registro);
  assert.equal(filaDe(hoja, 6).PROVEEDOR, 'PENDIENTE');
  assert.equal(filaDe(hoja, 6)['CLASE DE GASTO'], 'GROCERIES W1 NORTE');
  assert.equal(filaDe(hoja, 6).REVISAR, 'PENDIENTE: PROVEEDOR, CLASE DE GASTO');
});

test('llenarFilas_ no escribe con registro perdido ni con ID anterior al corte', () => {
  const probar = (id, registro) => {
    const hoja = hojaFalsa('Septiembre 2026');
    const valores = { PROVEEDOR: 'PENDIENTE', 'ID FILA': id };
    ponerFila(hoja, 6, valores);
    const [llena] = llenarFilas_([{ hoja, numero: 6, idFila: id, valores }], { PROVEEDOR: 'Riba Smith' }, false, registro);
    assert.deepEqual(llena.saltadas, ['PROVEEDOR']);
    assert.equal(filaDe(hoja, 6).PROVEEDOR, 'PENDIENTE');
  };
  probar('BOT-20260927-093000-1-3', registroEdiciones_({ filas: [], corte: '', disponible: false }));
  probar('BOT-20260925-093000-1-4', registroEdiciones_({ filas: [], corte: '20260926-000000', disponible: true }));
});

/** Dependencias falsas: Telegram, Drive, el OCR y el reloj. */
function dependencias(ss, raiz, extra = {}) {
  const llamadas = [];
  let idBot = 900;
  return {
    llamadas,
    token: 'tok',
    claveGemini: 'clave-gemini',
    libro: () => ss,
    propiedades: { getProperty: () => null },
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
    ocr: () => ({ ok: true, texto: TEXTO_RECIBO }),
    ...extra,
  };
}


// --- releerConGemini_ con el respaldo de Groq ---

const CLAVE_GROQ = 'gsk_clave-groq-de-prueba';

function archivoDeReintento_(raiz, mime = 'image/jpeg') {
  return raiz.createFile(blobFalso(mime));
}

test('releerConGemini_ sin claveGroq: Gemini caído no intenta Groq (comportamiento de hoy)', () => {
  const raiz = carpetaFalsa('Facturas');
  const archivo = archivoDeReintento_(raiz);
  const d = dependencias(null, raiz);
  geminiCaido(500);
  const entrada = { idFoto: archivo.getId(), leyenda: '', fechaMensaje: '2026-09-27' };
  const leido = releerConGemini_(d, entrada, { categorias: ['GROCERIES'] });
  assert.equal(leido.ok, false);
  assert.match(leido.motivo, /HTTP 500/);
});

test('releerConGemini_ con claveGroq: Gemini caído (500) y Groq (jpeg) lee la foto', () => {
  const raiz = carpetaFalsa('Facturas');
  const archivo = archivoDeReintento_(raiz);
  const d = dependencias(null, raiz, { claveGroq: CLAVE_GROQ });
  const datosGroq = {
    legible: true, tipo_documento: 'TICKET', proveedor: 'Super 99', fecha: '2026-09-20',
    moneda: 'USD', forma_pago: 'EFECTIVO', lineas: [{ tipo: 'ITEM', descripcion: 'Leche', monto: 1.55, confianza: 'ALTA' }],
    total: 1.55, clase: 'GROCERIES', casa: null, comentario: null, descripcion_corta: 'leche',
    confianza: { proveedor: 'ALTA', fecha: 'ALTA', moneda: 'ALTA', total: 'ALTA', clase: 'ALTA' },
  };
  global.UrlFetchApp = {
    fetch: (url) => (url === URL_GROQ
      ? { getResponseCode: () => 200, getContentText: () => JSON.stringify({ choices: [{ message: { content: JSON.stringify(datosGroq) }, finish_reason: 'stop' }] }) }
      : { getResponseCode: () => 500, getContentText: () => '{}' }),
  };
  const entrada = { idFoto: archivo.getId(), leyenda: '', fechaMensaje: '2026-09-27' };
  const leido = releerConGemini_(d, entrada, { categorias: ['GROCERIES'] });
  assert.equal(leido.ok, true);
  assert.equal(leido.datos.proveedor, 'Super 99');
  assert.equal(leido.archivo, archivo);
});

test('releerConGemini_ con claveGroq: un PDF usa el OCR de Drive (deps.carpetaFacturas como raíz) para Groq', () => {
  const raiz = carpetaFalsa('Facturas');
  const archivo = archivoDeReintento_(raiz, 'application/pdf');
  let raizUsadaEnOcr;
  const d = dependencias(null, raiz, {
    claveGroq: CLAVE_GROQ,
    ocr: (blob, raizOcr) => { raizUsadaEnOcr = raizOcr; return { ok: true, texto: TEXTO_RECIBO }; },
  });
  const datosGroq = {
    legible: true, tipo_documento: 'TICKET', proveedor: 'Super 99', fecha: '2026-09-20',
    moneda: 'USD', forma_pago: 'EFECTIVO', lineas: [], total: 66.34, clase: 'GROCERIES', casa: null,
    comentario: null, descripcion_corta: 'super 99', confianza: { proveedor: 'ALTA', fecha: 'ALTA', moneda: 'ALTA', total: 'ALTA', clase: 'ALTA' },
  };
  global.UrlFetchApp = {
    fetch: (url) => (url === URL_GROQ
      ? { getResponseCode: () => 200, getContentText: () => JSON.stringify({ choices: [{ message: { content: JSON.stringify(datosGroq) }, finish_reason: 'stop' }] }) }
      : { getResponseCode: () => 500, getContentText: () => '{}' }),
  };
  const entrada = { idFoto: archivo.getId(), leyenda: '', fechaMensaje: '2026-09-27' };
  const leido = releerConGemini_(d, entrada, { categorias: ['GROCERIES'] });
  assert.equal(leido.ok, true);
  assert.equal(raizUsadaEnOcr, raiz);
});

test('releerConGemini_ con claveGroq: si Groq también falla se rinde con el motivo original de Gemini', () => {
  const raiz = carpetaFalsa('Facturas');
  const archivo = archivoDeReintento_(raiz);
  const d = dependencias(null, raiz, { claveGroq: CLAVE_GROQ });
  global.UrlFetchApp = {
    fetch: (url) => (url === URL_GROQ
      ? { getResponseCode: () => 429, getContentText: () => '{}' }
      : { getResponseCode: () => 500, getContentText: () => '{"error":{"message":"caído"}}' }),
  };
  const entrada = { idFoto: archivo.getId(), leyenda: '', fechaMensaje: '2026-09-27' };
  const leido = releerConGemini_(d, entrada, { categorias: ['GROCERIES'] });
  assert.equal(leido.ok, false);
  assert.match(leido.motivo, /HTTP 500/);
});

// --- Gemini falso ---

/** Extracción de foto (sin intención: el esquema de foto no la trae). */
const datosFoto = (extra = {}) => ({
  legible: true,
  tipo_documento: 'TICKET',
  proveedor: 'Riba Smith',
  fecha: '2026-09-27',
  moneda: 'USD',
  forma_pago: 'EFECTIVO',
  lineas: [{ tipo: 'ITEM', descripcion: 'compra', monto: 66.34, confianza: 'ALTA' }],
  total: 66.34,
  clase: 'Supermercado',
  casa: null,
  comentario: null,
  descripcion_corta: 'super riba smith',
  confianza: { proveedor: 'ALTA', fecha: 'ALTA', moneda: 'ALTA', total: 'ALTA', clase: 'ALTA' },
  ...extra,
});

/** Gemini vivo: cada llamada devuelve esa extracción. */
function ponerGemini(datos) {
  global.UrlFetchApp = {
    fetch: () => ({
      getResponseCode: () => 200,
      getContentText: () => JSON.stringify({
        candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(datos) }] } }],
      }),
    }),
  };
}

/** Gemini caído (caso 13: clave inválida / 429). */
function geminiCaido(codigo = 429) {
  global.UrlFetchApp = {
    fetch: () => ({ getResponseCode: () => codigo, getContentText: () => '{"error":{"message":"cuota"}}' }),
  };
}

const mensajeFoto = (extra = {}) => ({
  message_id: ID_ERIN,
  date: Math.floor(AHORA.getTime() / 1000),
  chat: { id: CHAT, type: 'private' },
  photo: [{ file_id: 'f-grande', width: 800, height: 600 }],
  ...extra,
});

const mensajeTexto = (texto, extra = {}) => ({
  message_id: 600,
  date: Math.floor(AHORA.getTime() / 1000),
  chat: { id: CHAT, type: 'private' },
  text: texto,
  ...extra,
});

const enviados = (d) => d.llamadas.filter(([metodo]) => metodo === 'sendMessage');
const textosEnviados = (d) => enviados(d).map(([, cuerpo]) => cuerpo.text);
const celdaEstado = (estado, fila, columna) => estado.leer(fila, COLUMNAS_ESTADO.indexOf(columna) + 1);
const datosEstado = (estado, fila) => JSON.parse(celdaEstado(estado, fila, 'DATOS'));

const toqueTotal = (opcion, id = ID_ERIN) => ({
  id: 'cb-1',
  data: `totalocr:${id}:${opcion}`,
  message: { message_id: 901, date: 1, chat: { id: CHAT } },
});

const toquePago = (opcion, id = ID_ERIN) => ({
  id: 'cb-2',
  data: `pago:${id}:${opcion}`,
  message: { message_id: 903, date: 1, chat: { id: CHAT } },
});

/** Foto que Gemini no pudo leer, con la entrada POR-PROCESAR abierta y sin fila escrita. */
function fotoSinLeer(historial = [], extraDeps = {}) {
  const caso = escenario(historial);
  const raiz = carpetaFalsa('Facturas');
  geminiCaido();
  const d = dependencias(caso.ss, raiz, extraDeps);
  atenderMensaje_(mensajeFoto(), d, caso.estado);
  return { ...caso, raiz, d };
}

/** Lo mismo, pero con el total ya confirmado por el usuario (la fila escrita, todo lo demás PENDIENTE). */
function conTotalConfirmado(historial = [], extraDeps = {}) {
  const caso = fotoSinLeer(historial, extraDeps);
  atenderBoton_(toqueTotal('si'), caso.d, caso.estado);
  caso.d.llamadas.length = 0;
  return caso;
}

// --- Reintento con Gemini vivo y el total ya confirmado (relleno de PENDIENTE) ---

test('el reintento llena los campos PENDIENTE sin tocar el total confirmado', () => {
  const caso = conTotalConfirmado();
  ponerGemini(datosFoto());
  reintentarPorProcesar_(caso.d, caso.estado);
  const fila = filaDe(caso.sep, 7);
  assert.equal(fila.PROVEEDOR, 'Riba Smith');
  assert.equal(fila['FORMA DE PAGO'], 'EFECTIVO');
  assert.notEqual(fila['CLASE DE GASTO'], 'PENDIENTE');
  assert.equal(fila['GASTO (USD)'], 66.34);
  assert.equal(fila.MONEDA, 'USD');
  assert.equal(fila.REVISAR, '');
});

test('el reintento que llena los pendientes cierra la entrada POR-PROCESAR', () => {
  const caso = conTotalConfirmado();
  ponerGemini(datosFoto());
  const lineas = reintentarPorProcesar_(caso.d, caso.estado);
  assert.equal(celdaEstado(caso.estado, 2, 'ESTADO'), PREGUNTA_CERRADA);
  assert.equal(lineas.length, 1);
  assert.match(lineas[0], /llenó/);
});

test('el reintento le pone su nombre real a la foto en Drive', () => {
  const caso = conTotalConfirmado();
  ponerGemini(datosFoto());
  reintentarPorProcesar_(caso.d, caso.estado);
  assert.match(archivosDe(caso.raiz).join('\n'), /Riba Smith/i);
});

test('el reintento renombra la foto aunque la hoja devuelva FECHA como Date (Google Sheets real)', () => {
  const caso = conTotalConfirmado();
  const fechaComoDate = new Date(2026, 8, 27);
  ponerFila(caso.sep, 7, { FECHA: fechaComoDate });
  assert.ok(filaDe(caso.sep, 7).FECHA instanceof Date);
  ponerGemini(datosFoto());
  reintentarPorProcesar_(caso.d, caso.estado);
  const archivos = archivosDe(caso.raiz).join('\n');
  assert.match(archivos, /Riba Smith/i);
  assert.doesNotMatch(archivos, /Por clasificar/i);
});

test('si el total de Gemini no es el confirmado se marca PENDIENTE: TOTAL, sin sobrescribirlo', () => {
  const caso = conTotalConfirmado();
  ponerGemini(datosFoto({ total: 70, lineas: [{ tipo: 'ITEM', descripcion: 'compra', monto: 70, confianza: 'ALTA' }] }));
  reintentarPorProcesar_(caso.d, caso.estado);
  const fila = filaDe(caso.sep, 7);
  assert.equal(fila['GASTO (USD)'], 66.34);
  assert.equal(fila.REVISAR, 'PENDIENTE: TOTAL');
  assert.equal(fila.PROVEEDOR, 'Riba Smith');
});

test('el reintento no pisa lo que el usuario ya había contestado', () => {
  const caso = conTotalConfirmado();
  ponerFila(caso.sep, 7, { PROVEEDOR: 'Super 99', 'FORMA DE PAGO': 'TARJETA' });
  ponerGemini(datosFoto());
  reintentarPorProcesar_(caso.d, caso.estado);
  const fila = filaDe(caso.sep, 7);
  assert.equal(fila.PROVEEDOR, 'Super 99');
  assert.equal(fila['FORMA DE PAGO'], 'TARJETA');
});

test('correr el reintento dos veces no cambia nada la segunda (entrada ya cerrada)', () => {
  const caso = conTotalConfirmado();
  ponerGemini(datosFoto());
  reintentarPorProcesar_(caso.d, caso.estado);
  const antes = filaDe(caso.sep, 7);
  assert.deepEqual(reintentarPorProcesar_(caso.d, caso.estado), []);
  assert.deepEqual(filaDe(caso.sep, 7), antes);
});

// --- Reintento con Gemini vivo y sin total confirmado (se escribe la fila como siempre) ---

test('sin total confirmado, el reintento escribe la fila por el camino normal y confirma', () => {
  const caso = fotoSinLeer();
  caso.d.llamadas.length = 0;
  ponerGemini(datosFoto());
  const lineas = reintentarPorProcesar_(caso.d, caso.estado);
  const fila = filaDe(caso.sep, 7);
  assert.equal(fila['GASTO (USD)'], 66.34);
  assert.equal(fila.PROVEEDOR, 'Riba Smith');
  assert.match(textosEnviados(caso.d).join('\n'), /Riba Smith/);
  assert.match(lineas[0], /escribió/);
});

test('sin total confirmado, el reintento quita los botones Sí/No de la propuesta vieja y cierra', () => {
  const caso = fotoSinLeer();
  caso.d.llamadas.length = 0;
  ponerGemini(datosFoto());
  reintentarPorProcesar_(caso.d, caso.estado);
  const quitados = caso.d.llamadas.filter(([metodo]) => metodo === 'editMessageReplyMarkup');
  assert.deepEqual(quitados.map(([, cuerpo]) => cuerpo.message_id), [901]);
  assert.equal(celdaEstado(caso.estado, 2, 'ESTADO'), PREGUNTA_CERRADA);
});

test('sin total confirmado, la foto sale de Por clasificar a la carpeta de su mes', () => {
  const caso = fotoSinLeer();
  ponerGemini(datosFoto());
  reintentarPorProcesar_(caso.d, caso.estado);
  assert.doesNotMatch(archivosDe(caso.raiz).join('\n'), /Por clasificar/);
});

// --- Reintento con Gemini todavía caído ---

test('el primer reintento fallido solo suma un intento y no le escribe nada al usuario', () => {
  const caso = conTotalConfirmado();
  const lineas = reintentarPorProcesar_(caso.d, caso.estado);
  assert.equal(datosEstado(caso.estado, 2).intentos, 1);
  assert.equal(celdaEstado(caso.estado, 2, 'ESTADO'), PREGUNTA_ABIERTA);
  assert.deepEqual(enviados(caso.d), []);
  assert.match(lineas[0], /intento 1/);
});

test('el segundo reintento fallido pasa al modo preguntas (proveedor y forma de pago)', () => {
  const caso = conTotalConfirmado();
  reintentarPorProcesar_(caso.d, caso.estado);
  reintentarPorProcesar_(caso.d, caso.estado);
  assert.deepEqual(textosEnviados(caso.d), [TEXTO_PREGUNTA_PROVEEDOR, TEXTO_PREGUNTA_FORMA_PAGO]);
  const teclado = enviados(caso.d)[1][1].reply_markup;
  assert.deepEqual(teclado, tecladoFormaPago_(ID_ERIN));
  const guardado = datosEstado(caso.estado, 2);
  assert.deepEqual(guardado.preguntado, ['proveedor', 'pago']);
  assert.equal(guardado.intentos, 2);
  assert.equal(celdaEstado(caso.estado, 2, 'ESTADO'), PREGUNTA_ABIERTA);
});

test('el tercer reintento fallido no repite las preguntas', () => {
  const caso = conTotalConfirmado();
  reintentarPorProcesar_(caso.d, caso.estado);
  reintentarPorProcesar_(caso.d, caso.estado);
  caso.d.llamadas.length = 0;
  const lineas = reintentarPorProcesar_(caso.d, caso.estado);
  assert.deepEqual(enviados(caso.d), []);
  assert.match(lineas[0], /ya se preguntó/);
});

test('sin total confirmado el modo preguntas pide el total y nada más', () => {
  const caso = fotoSinLeer();
  reintentarPorProcesar_(caso.d, caso.estado);
  caso.d.llamadas.length = 0;
  reintentarPorProcesar_(caso.d, caso.estado);
  assert.deepEqual(textosEnviados(caso.d), [TEXTO_PEDIR_TOTAL]);
  assert.deepEqual(datosEstado(caso.estado, 2).preguntado, ['total']);
});

test('una foto que ya no está en Drive no rompe el reintento de las demás', () => {
  const caso = conTotalConfirmado();
  const rota = filaPorProcesar_({
    creado: AHORA, idMensaje: 777, fechaMensaje: '2026-09-27', idFoto: 'no-existe', enlace: 'u', intentos: 0,
  });
  caso.estado.appendRow(rota);
  const lineas = reintentarPorProcesar_(caso.d, caso.estado);
  assert.equal(lineas.length, 2);
  // La fila 3 es el REGISTRO de la confirmación; la entrada agregada quedó en la 4.
  assert.equal(datosEstado(caso.estado, 4).intentos, 1);
  assert.match(lineas[1], /foto 777/);
});

test('una entrada sin foto guardada se cuenta como intento fallido', () => {
  const caso = escenario();
  caso.estado.appendRow(filaPorProcesar_({
    creado: AHORA, idMensaje: 778, fechaMensaje: '2026-09-27', intentos: 0,
  }));
  const d = dependencias(caso.ss, carpetaFalsa('Facturas'));
  ponerGemini(datosFoto());
  reintentarPorProcesar_(d, caso.estado);
  assert.equal(datosEstado(caso.estado, 2).intentos, 1);
});

test('si algo lanza con una entrada, el reintento lo registra y sigue', () => {
  const caso = conTotalConfirmado();
  ponerGemini(datosFoto());
  const d = { ...caso.d, libro: () => { throw new Error('el libro no abre'); } };
  const lineas = reintentarPorProcesar_(d, caso.estado);
  assert.equal(lineas.length, 1);
  assert.match(lineas[0], /el libro no abre/);
});

// --- reintentarFotos desde el editor ---

/** Candado falso que anota la espera pedida y cuántas veces se soltó. */
function candadoLibre(libre = true) {
  return {
    pedidos: [], liberado: 0,
    tryLock(ms) { this.pedidos.push(ms); return libre; },
    releaseLock() { this.liberado += 1; },
  };
}

test('reintentarFotos() registra una línea por foto por procesar', () => {
  const caso = conTotalConfirmado();
  const registro = [];
  geminiCaido();
  global.Logger = { log: (linea) => registro.push(linea) };
  global.PropertiesService = {
    getScriptProperties: () => ({ getProperty: (clave) => (clave === 'GEMINI_API_KEY' ? 'clave' : 'tok') }),
  };
  global.LockService = { getScriptLock: () => candadoLibre() };
  global.CacheService = { getScriptCache: () => ({}) };
  global.SpreadsheetApp = { openById: () => caso.ss };
  global.Utilities = {
    formatDate: (fecha, zona, formato) => formatear(fecha, formato), base64Encode: () => 'b64', sleep: () => {},
  };
  global.DriveApp = {
    getFolderById: () => caso.raiz,
    getFileById: (id) => caso.d.archivoPorId(id),
  };
  const lineas = reintentarFotos();
  assert.equal(lineas.length, 1);
  assert.deepEqual(registro, lineas);
  assert.equal(datosEstado(caso.estado, 2).intentos, 1);
});

test('reintentarFotos() avisa cuando no hay ninguna foto por procesar', () => {
  const caso = escenario();
  const registro = [];
  global.Logger = { log: (linea) => registro.push(linea) };
  global.PropertiesService = { getScriptProperties: () => ({ getProperty: () => 'tok' }) };
  global.LockService = { getScriptLock: () => candadoLibre() };
  global.CacheService = { getScriptCache: () => ({}) };
  global.SpreadsheetApp = { openById: () => caso.ss };
  global.Utilities = { formatDate: () => '', base64Encode: () => 'b64' };
  global.DriveApp = { getFolderById: () => carpetaFalsa('Facturas'), getFileById: () => null };
  assert.match(reintentarFotos()[0], /No hay ninguna foto/);
});

test('reintentarFotos() avisa si falta la pestaña _ESTADO', () => {
  const registro = [];
  global.Logger = { log: (linea) => registro.push(linea) };
  global.PropertiesService = { getScriptProperties: () => ({ getProperty: () => 'tok' }) };
  global.LockService = { getScriptLock: () => candadoLibre() };
  global.CacheService = { getScriptCache: () => ({}) };
  global.SpreadsheetApp = { openById: () => ({ getSheetByName: () => null }) };
  global.Utilities = { formatDate: () => '', base64Encode: () => 'b64' };
  global.DriveApp = { getFolderById: () => carpetaFalsa('Facturas'), getFileById: () => null };
  assert.match(reintentarFotos()[0], /_ESTADO/);
});

// --- Modo preguntas: los botones de forma de pago ---

/** Una foto con la fila escrita y el modo preguntas ya abierto (dos reintentos fallidos). */
function enModoPreguntas(historial = []) {
  const caso = conTotalConfirmado(historial);
  reintentarPorProcesar_(caso.d, caso.estado);
  reintentarPorProcesar_(caso.d, caso.estado);
  caso.d.llamadas.length = 0;
  return caso;
}

test('tocar una forma de pago la escribe en la fila y contesta el toque', () => {
  const caso = enModoPreguntas();
  atenderBoton_(toquePago('tarjeta'), caso.d, caso.estado);
  assert.equal(filaDe(caso.sep, 7)['FORMA DE PAGO'], 'TARJETA');
  const metodos = caso.d.llamadas.map(([metodo]) => metodo);
  assert.ok(metodos.includes('answerCallbackQuery'));
  assert.ok(metodos.includes('editMessageReplyMarkup'));
});

test('con el proveedor todavía pendiente, la forma de pago no cierra la entrada', () => {
  const caso = enModoPreguntas();
  atenderBoton_(toquePago('efectivo'), caso.d, caso.estado);
  assert.equal(celdaEstado(caso.estado, 2, 'ESTADO'), PREGUNTA_ABIERTA);
});

test('tocar la forma de pago dos veces no la vuelve a escribir y avisa que ya está atendida', () => {
  const caso = enModoPreguntas();
  atenderBoton_(toquePago('transferencia'), caso.d, caso.estado);
  ponerFila(caso.sep, 7, { PROVEEDOR: 'Riba Smith' });
  atenderBoton_(toquePago('efectivo'), caso.d, caso.estado);
  assert.equal(filaDe(caso.sep, 7)['FORMA DE PAGO'], 'TRANSFERENCIA');
});

test('un botón de forma de pago de una entrada que no existe solo contesta el toque', () => {
  const caso = enModoPreguntas();
  caso.sep.escrituras.length = 0;
  atenderBoton_(toquePago('efectivo', 999), caso.d, caso.estado);
  assert.deepEqual(caso.sep.escrituras, []);
  const respuestas = caso.d.llamadas.filter(([metodo]) => metodo === 'answerCallbackQuery');
  assert.equal(respuestas[respuestas.length - 1][1].text, TEXTO_CONTEO_ATENDIDO);
});

test('un callback_data de forma de pago con clave rara solo contesta el toque', () => {
  const caso = enModoPreguntas();
  caso.sep.escrituras.length = 0;
  atenderBoton_({ ...toquePago('efectivo'), data: 'pago::efectivo' }, caso.d, caso.estado);
  assert.deepEqual(caso.sep.escrituras, []);
});

// --- Modo preguntas: el proveedor escrito ---

const HISTORIAL_RIBA = [
  { FECHA: '2026-08-01', PROVEEDOR: 'Riba Smith', 'CLASE DE GASTO': 'GROCERIES W1 NORTE' },
  { FECHA: '2026-08-10', PROVEEDOR: 'Riba Smith', 'CLASE DE GASTO': 'GROCERIES W2 NORTE' },
];

test('el proveedor que el usuario escribe se anota en la fila, con su clase dominante', () => {
  const caso = enModoPreguntas(HISTORIAL_RIBA);
  atenderMensaje_(mensajeTexto('riba smith'), caso.d, caso.estado);
  const fila = filaDe(caso.sep, 7);
  assert.equal(fila.PROVEEDOR, 'Riba Smith');
  assert.match(String(fila['CLASE DE GASTO']), /^GROCERIES W\d NORTE$/);
  assert.equal(textosEnviados(caso.d).pop(), 'Listo, anoté el proveedor: Riba Smith.');
});

test('sin historial dominante la clase se queda en PENDIENTE', () => {
  const caso = enModoPreguntas();
  atenderMensaje_(mensajeTexto('Panadería del barrio'), caso.d, caso.estado);
  const fila = filaDe(caso.sep, 7);
  assert.equal(fila.PROVEEDOR, 'Panadería del barrio');
  assert.equal(fila['CLASE DE GASTO'], 'PENDIENTE');
});

test('el proveedor escrito le pone su nombre a la foto en Drive', () => {
  const caso = enModoPreguntas();
  atenderMensaje_(mensajeTexto('Riba Smith'), caso.d, caso.estado);
  assert.match(archivosDe(caso.raiz).join('\n'), /Riba Smith/i);
});

test('el proveedor escrito renombra la foto aunque la hoja devuelva FECHA como Date', () => {
  const caso = enModoPreguntas();
  ponerFila(caso.sep, 7, { FECHA: new Date(2026, 8, 27) });
  assert.ok(filaDe(caso.sep, 7).FECHA instanceof Date);
  atenderMensaje_(mensajeTexto('Riba Smith'), caso.d, caso.estado);
  const archivos = archivosDe(caso.raiz).join('\n');
  assert.match(archivos, /Riba Smith/i);
  assert.doesNotMatch(archivos, /Por clasificar/i);
});

test('cuando ya no falta nada, la respuesta del proveedor cierra la entrada', () => {
  const caso = enModoPreguntas();
  atenderBoton_(toquePago('efectivo'), caso.d, caso.estado);
  atenderMensaje_(mensajeTexto('Riba Smith'), caso.d, caso.estado);
  assert.equal(celdaEstado(caso.estado, 2, 'ESTADO'), PREGUNTA_CERRADA);
});

test('botón de forma de pago anotada avisa y no pisa la hoja', () => {
  const caso = enModoPreguntas();
  const id = filaDe(caso.sep, 7)['ID FILA'];
  const leer = global.registroParaEscribir_;
  global.registroParaEscribir_ = () => registroEdiciones_({
    filas: [[AHORA, 'Septiembre 2026', id, 'FORMA DE PAGO']], corte: '20260926-000000', disponible: true,
  });
  try { atenderBoton_({ ...toquePago('efectivo'), message: undefined }, caso.d, caso.estado); } finally { global.registroParaEscribir_ = leer; }
  assert.equal(filaDe(caso.sep, 7)['FORMA DE PAGO'], 'PENDIENTE');
  assert.ok(caso.d.llamadas.some(([, cuerpo]) => cuerpo.text === textoNadaCambiado_(['FORMA DE PAGO'])));
});

test('botón de pago avisa la anotación llegada durante setValue y sigue atendiendo', () => {
  const caso = enModoPreguntas();
  const id = filaDe(caso.sep, 7)['ID FILA'];
  const ediciones = hojaFalsa('_EDICIONES', { protegerDesborde: false });
  ediciones.appendRow(['FECHA', 'PESTAÑA', 'ID FILA', 'COLUMNAS']);
  caso.ss.hojas.push(ediciones);
  caso.d.propiedades = { getProperty: (n) => n === PROPIEDAD_EDICIONES_CREADA ? '20260926-000000' : null };
  const leer = global.registroParaEscribir_;
  global.registroParaEscribir_ = require('../src/EdicionesApp.js').registroParaEscribir_;
  const rango = caso.sep.getRange;
  let anoto = false;
  caso.sep.getRange = (...args) => {
    const celda = rango.apply(caso.sep, args);
    return { ...celda, setValue: (valor) => {
      celda.setValue(valor);
      if (!anoto) {
        anoto = true;
        ediciones.appendRow([new Date(AHORA.getTime() + 1000), 'Septiembre 2026', id, 'FORMA DE PAGO']);
      }
    } };
  };
  const real = console.error; const avisos = []; console.error = (texto) => avisos.push(texto);
  try { atenderBoton_(toquePago('efectivo'), caso.d, caso.estado); } finally { console.error = real; global.registroParaEscribir_ = leer; }
  assert.equal(filaDe(caso.sep, 7)['FORMA DE PAGO'], 'EFECTIVO');
  assert.ok(avisos.includes(`posible choque con edición a mano: Septiembre 2026 ${id} FORMA DE PAGO`));
  assert.equal(celdaEstado(caso.estado, 2, 'ESTADO'), PREGUNTA_ABIERTA);
});

test('reintento registra el proveedor saltado y no renombra la foto', () => {
  const caso = conTotalConfirmado();
  const id = filaDe(caso.sep, 7)['ID FILA'];
  const antes = archivosDe(caso.raiz);
  const leer = global.registroParaEscribir_;
  const log = console.log;
  const lineas = [];
  global.registroParaEscribir_ = () => registroEdiciones_({
    filas: [[AHORA, 'Septiembre 2026', id, 'PROVEEDOR']], corte: '20260926-000000', disponible: true,
  });
  console.log = (linea) => lineas.push(linea);
  try {
    ponerGemini(datosFoto());
    reintentarPorProcesar_(caso.d, caso.estado);
  } finally {
    console.log = log;
    global.registroParaEscribir_ = leer;
  }
  assert.equal(filaDe(caso.sep, 7).PROVEEDOR, 'PENDIENTE');
  assert.deepEqual(archivosDe(caso.raiz), antes);
  assert.ok(lineas.includes(`Septiembre 2026 ${id}: no cambié PROVEEDOR, editadas a mano`));
});

test('proveedor protegido y PENDIENTE no se pisa ni se renombra', () => {
  const caso = enModoPreguntas();
  const id = filaDe(caso.sep, 7)['ID FILA'];
  const antes = archivosDe(caso.raiz);
  const leer = global.registroParaEscribir_;
  global.registroParaEscribir_ = () => registroEdiciones_({
    filas: [[AHORA, 'Septiembre 2026', id, 'PROVEEDOR']], corte: '20260926-000000', disponible: true,
  });
  try { atenderMensaje_(mensajeTexto('Riba Smith'), caso.d, caso.estado); } finally { global.registroParaEscribir_ = leer; }
  assert.equal(filaDe(caso.sep, 7).PROVEEDOR, 'PENDIENTE');
  assert.deepEqual(archivosDe(caso.raiz), antes);
  assert.equal(textosEnviados(caso.d).pop(), textoNadaCambiado_(['PROVEEDOR']));
});

test('un proveedor que ya no era PENDIENTE no se pisa, no se avisa como anotado ni como saltado', () => {
  const caso = enModoPreguntas();
  const id = filaDe(caso.sep, 7)['ID FILA'];
  const antes = archivosDe(caso.raiz);
  ponerFila(caso.sep, 7, { PROVEEDOR: 'Proveedor manual' });
  const leer = global.registroParaEscribir_;
  const log = console.log;
  const lineas = [];
  global.registroParaEscribir_ = () => registroEdiciones_({
    filas: [[AHORA, 'Septiembre 2026', id, 'PROVEEDOR']], corte: '20260926-000000', disponible: true,
  });
  console.log = (linea) => lineas.push(linea);
  try { atenderMensaje_(mensajeTexto('Riba Smith'), caso.d, caso.estado); } finally {
    console.log = log;
    global.registroParaEscribir_ = leer;
  }
  assert.equal(filaDe(caso.sep, 7).PROVEEDOR, 'Proveedor manual');
  assert.deepEqual(archivosDe(caso.raiz), antes);
  assert.ok(!textosEnviados(caso.d).includes(textoProveedorAnotado_('Riba Smith')));
  assert.ok(!textosEnviados(caso.d).includes(textoNadaCambiado_(['PROVEEDOR'])));
  assert.deepEqual(lineas.filter((linea) => linea.includes('editadas a mano')), []);
});

test('proveedor libre y clase protegida escriben solo el proveedor y avisan ambos resultados', () => {
  const caso = enModoPreguntas(HISTORIAL_RIBA);
  const id = filaDe(caso.sep, 7)['ID FILA'];
  const leer = global.registroParaEscribir_;
  global.registroParaEscribir_ = () => registroEdiciones_({
    filas: [[AHORA, 'Septiembre 2026', id, 'CLASE DE GASTO']], corte: '20260926-000000', disponible: true,
  });
  try { atenderMensaje_(mensajeTexto('Riba Smith'), caso.d, caso.estado); } finally { global.registroParaEscribir_ = leer; }
  assert.equal(filaDe(caso.sep, 7).PROVEEDOR, 'Riba Smith');
  assert.equal(filaDe(caso.sep, 7)['CLASE DE GASTO'], 'PENDIENTE');
  assert.match(archivosDe(caso.raiz).join('\n'), /Riba Smith/i);
  assert.equal(textosEnviados(caso.d).pop(), `${textoProveedorAnotado_('Riba Smith')}\n${textoColumnasSaltadas_(['CLASE DE GASTO'])}`);
});

test('el proveedor citando la pregunta del bot también contesta esa foto', () => {
  const caso = enModoPreguntas();
  const idPregunta = datosEstado(caso.estado, 2).idProveedor;
  assert.ok(idPregunta);
  atenderMensaje_(mensajeTexto('Riba Smith', { reply_to_message: { message_id: idPregunta } }), caso.d, caso.estado);
  assert.equal(filaDe(caso.sep, 7).PROVEEDOR, 'Riba Smith');
});

test('un texto que parece un gasto nuevo no se toma como proveedor', () => {
  const caso = enModoPreguntas();
  assert.equal(atenderProveedorEscrito_({ hojaEstado: caso.estado, deps: caso.d, momento: null },
    mensajeTexto('gasté 12.50 en el super'), 'gasté 12.50 en el super'), false);
  assert.equal(filaDe(caso.sep, 7).PROVEEDOR, 'PENDIENTE');
});

test('sin pregunta de proveedor abierta, un nombre suelto sigue el camino normal', () => {
  const caso = conTotalConfirmado();
  assert.equal(atenderProveedorEscrito_({ hojaEstado: caso.estado, deps: caso.d, momento: null },
    mensajeTexto('Riba Smith'), 'Riba Smith'), false);
});

test('un proveedor citando otro mensaje cualquiera no contesta la pregunta', () => {
  const caso = enModoPreguntas();
  assert.equal(atenderProveedorEscrito_({ hojaEstado: caso.estado, deps: caso.d, momento: null },
    mensajeTexto('Riba Smith', { reply_to_message: { message_id: 12345 } }), 'Riba Smith'), false);
});

test('con una pregunta abierta más nueva, el nombre suelto sigue el camino normal', () => {
  const caso = enModoPreguntas();
  caso.estado.appendRow(COLUMNAS_ESTADO.map((c) => ({
    CREADO: new Date(2026, 8, 27, 23, 0, 0), TIPO: 'PREGUNTA', CLAVE: '999',
    DATOS: '{"preguntas":["clase"]}', ESTADO: PREGUNTA_ABIERTA,
  }[c] || '')));
  assert.equal(atenderProveedorEscrito_({ hojaEstado: caso.estado, deps: caso.d, momento: null },
    mensajeTexto('Riba Smith'), 'Riba Smith'), false);
});

test('con dos preguntas de proveedor abiertas y sin cita, el nombre suelto va a la más nueva (elegirPreguntaProveedor_)', () => {
  const caso = enModoPreguntas();
  // Una segunda entrada POR-PROCESAR, más vieja, también preguntando el proveedor.
  caso.estado.appendRow(COLUMNAS_ESTADO.map((c) => ({
    CREADO: new Date(2026, 8, 20, 9, 0, 0), TIPO: 'POR-PROCESAR', CLAVE: '777',
    'ID FILAS': '99',
    DATOS: JSON.stringify({
      fechaMensaje: '2026-09-20', idMensaje: 777, intentos: 1, preguntado: ['proveedor'],
    }),
    ESTADO: PREGUNTA_ABIERTA,
  }[c] || '')));
  const r = atenderProveedorEscrito_({ hojaEstado: caso.estado, deps: caso.d, momento: { chatId: CHAT } },
    mensajeTexto('Riba Smith'), 'Riba Smith');
  assert.equal(r, true);
  // La entrada de enModoPreguntas (creada "AHORA") es más nueva que la agregada (20 de sep) → gana esa.
  assert.equal(filaDe(caso.sep, 7).PROVEEDOR, 'Riba Smith');
});

test('si la fila de la foto ya no está en la hoja, el proveedor escrito sigue su camino', () => {
  const caso = enModoPreguntas();
  ponerFila(caso.sep, 7, { 'ID FILA': '' });
  assert.equal(atenderProveedorEscrito_({ hojaEstado: caso.estado, deps: caso.d, momento: null },
    mensajeTexto('Riba Smith'), 'Riba Smith'), false);
});

// --- Bordes: Drive y _ESTADO fallando ---

test('si la foto archivada no se puede pasar a base64, cuenta como intento fallido', () => {
  const caso = conTotalConfirmado([], { base64: () => { throw new Error('foto rota'); } });
  ponerGemini(datosFoto());
  const lineas = reintentarPorProcesar_(caso.d, caso.estado);
  assert.match(lineas[0], /intento 1/);
  assert.equal(datosEstado(caso.estado, 2).intentos, 1);
});

test('si Drive no deja renombrar la foto, la fila igual queda escrita', () => {
  const caso = enModoPreguntas();
  const d = { ...caso.d, archivoPorId: () => { throw new Error('Drive caído'); } };
  atenderProveedorEscrito_({ hojaEstado: caso.estado, deps: d, momento: { chatId: CHAT } },
    mensajeTexto('Riba Smith'), 'Riba Smith');
  assert.equal(filaDe(caso.sep, 7).PROVEEDOR, 'Riba Smith');
});

test('unos DATOS ilegibles no rompen el conteo de intentos (solo se registran)', () => {
  const caso = conTotalConfirmado();
  caso.estado.poner(2, COLUMNAS_ESTADO.indexOf('DATOS') + 1, 'esto no es JSON');
  guardarIntento_(caso.estado, { fila: 2, idMensaje: ID_ERIN });
  assert.equal(celdaEstado(caso.estado, 2, 'DATOS'), 'esto no es JSON');
});

test('si ya no falta nada, el modo preguntas solo cierra la entrada', () => {
  const caso = conTotalConfirmado();
  ponerFila(caso.sep, 7, { PROVEEDOR: 'Riba Smith', 'FORMA DE PAGO': 'EFECTIVO' });
  reintentarPorProcesar_(caso.d, caso.estado);
  const lineas = reintentarPorProcesar_(caso.d, caso.estado);
  assert.match(lineas[0], /ya no falta nada/);
  assert.equal(celdaEstado(caso.estado, 2, 'ESTADO'), PREGUNTA_CERRADA);
  assert.deepEqual(enviados(caso.d), []);
});

// ---: reintentarFotos toma el candado del script ---

test('reintentarFotosConCandado_ espera 30 s, corre y suelta el candado', () => {
  assert.equal(ESPERA_CANDADO_REINTENTO_MS, 30000);
  const caso = escenario();
  const candado = candadoLibre();
  const registro = [];
  global.Logger = { log: (linea) => registro.push(linea) };
  const deps = { ...caso.d, candado, hojaEstado: () => caso.estado };
  const salida = reintentarFotosConCandado_(deps);
  assert.deepEqual(candado.pedidos, [30000]);
  assert.equal(candado.liberado, 1);
  assert.match(salida[0], /No hay ninguna foto/);
  assert.deepEqual(registro, salida);
});

test('con el candado ocupado no hace nada, avisa y no suelta lo que no tiene', () => {
  const caso = escenario();
  const candado = candadoLibre(false);
  const registro = [];
  global.Logger = { log: (linea) => registro.push(linea) };
  let abierta = 0;
  const deps = { ...caso.d, candado, hojaEstado: () => { abierta += 1; return caso.estado; } };
  const salida = reintentarFotosConCandado_(deps);
  const linea = 'reintentarFotos: ocupado, vuelve a correrlo en un minuto';
  assert.deepEqual(salida, [linea]);
  assert.deepEqual(registro, [linea]);
  assert.equal(abierta, 0);
  assert.equal(candado.liberado, 0);
});

test('suelta el candado aunque el reintento truene', () => {
  const caso = escenario();
  const candado = candadoLibre();
  global.Logger = { log: () => {} };
  const deps = { ...caso.d, candado, hojaEstado: () => { throw new Error('libro caído'); } };
  assert.throws(() => reintentarFotosConCandado_(deps), /libro caído/);
  assert.equal(candado.liberado, 1);
});

test('reintentarPorProcesar_ (la usa reintentarFotos con su propio candado) no toca el candado', () => {
  const caso = escenario();
  const candado = candadoLibre();
  reintentarPorProcesar_({ ...caso.d, candado }, caso.estado);
  assert.deepEqual(candado.pedidos, []);
  assert.equal(candado.liberado, 0);
});

test('escribirCeldas_: escapa fórmulas en columnas guarded, no en FECHA/FOTO', () => {
  const { escribirCeldas_ } = require('../src/ReintentoApp.js');
  const sep = hojaFalsa('Septiembre 2026');
  ponerFila(sep, 6, { PROVEEDOR: 'INICIAL', 'DESCRIPCIÓN': 'desc' });
  const ubicada = { hoja: sep, numero: 6, valores: filaDe(sep, 6) };
  const fecha = new Date(2026, 8, 26);
  escribirCeldas_(ubicada, {
    PROVEEDOR: '=IMPORTDATA("x")', 'DESCRIPCIÓN': '=FORMULA', FECHA: fecha, FOTO: '=enlace',
  });
  const f = filaDe(sep, 6);
  assert.equal(f.PROVEEDOR, "'=IMPORTDATA(\"x\")");
  assert.equal(f['DESCRIPCIÓN'], "'=FORMULA");
  assert.deepEqual(f.FECHA, fecha);
  assert.equal(f.FOTO, '=enlace');
});

// --- Hallazgos de la auditoría 3 (reintentos sin duplicar y REGISTRO al día) ---

/** Los datos guardados del REGISTRO abierto de la confirmación (no la entrada POR-PROCESAR). */
function datosRegistro(estado) {
  const fila = [2, 3, 4, 5].find((f) => celdaEstado(estado, f, 'TIPO') === 'REGISTRO');
  return datosEstado(estado, fila).datos;
}

test('si falla Telegram tras escribir la foto releída, la entrada ya está cerrada y el reintento no inserta otra fila', () => {
  const caso = fotoSinLeer();
  ponerGemini(datosFoto());
  const llamar = caso.d.llamar;
  caso.d.llamar = (token, metodo, cuerpo) => {
    if (metodo === 'sendMessage') throw new Error('Telegram no responde');
    return llamar(token, metodo, cuerpo);
  };
  const lineas = reintentarPorProcesar_(caso.d, caso.estado);
  assert.match(lineas[0], /Telegram no responde/);
  assert.equal(filaDe(caso.sep, 7)['GASTO (USD)'], 66.34);
  assert.equal(celdaEstado(caso.estado, 2, 'ESTADO'), PREGUNTA_CERRADA);
  caso.d.llamar = llamar;
  assert.deepEqual(reintentarPorProcesar_(caso.d, caso.estado), []);
  assert.equal(filaDe(caso.sep, 8)['GASTO (USD)'], '');
});

test('el reintento que llena los pendientes pone proveedor, clase y pago en el REGISTRO de la confirmación', () => {
  const caso = conTotalConfirmado();
  ponerGemini(datosFoto());
  reintentarPorProcesar_(caso.d, caso.estado);
  const datos = datosRegistro(caso.estado);
  assert.equal(datos.proveedor, 'Riba Smith');
  assert.equal(datos.forma_pago, 'EFECTIVO');
  assert.equal(datos.clase, filaDe(caso.sep, 7)['CLASE DE GASTO']);
});

test('la forma de pago tocada se guarda en el REGISTRO de la confirmación', () => {
  const caso = conTotalConfirmado();
  atenderBoton_(toquePago('tarjeta'), caso.d, caso.estado);
  assert.equal(datosRegistro(caso.estado).forma_pago, 'TARJETA');
});

test('el proveedor escrito y su clase se guardan en el REGISTRO de la confirmación', () => {
  const caso = enModoPreguntas(HISTORIAL_RIBA);
  atenderMensaje_(mensajeTexto('riba smith'), caso.d, caso.estado);
  const datos = datosRegistro(caso.estado);
  assert.equal(datos.proveedor, 'Riba Smith');
  assert.equal(datos.clase, filaDe(caso.sep, 7)['CLASE DE GASTO']);
});

// --- Auditoría P2: REGISTRO no cuenta como pregunta pendiente; proveedor ya lleno ---

const filasDeRegistro = (estado) => filasEstado_(estado)
  .filter((f) => f[COLUMNAS_ESTADO.indexOf('TIPO')] === 'REGISTRO');

test('el proveedor escrito sin cita llega aunque confirmar el total dejara un REGISTRO más nuevo', () => {
  const caso = fotoSinLeer();
  let reloj = AHORA.getTime();
  caso.d.ahora = () => new Date(reloj);
  reloj += 60000;
  atenderBoton_(toqueTotal('si'), caso.d, caso.estado);
  reloj += 60000;
  reintentarPorProcesar_(caso.d, caso.estado);
  reloj += 60000;
  reintentarPorProcesar_(caso.d, caso.estado);
  const registros = filasDeRegistro(caso.estado);
  assert.equal(registros.length, 1);
  assert.ok(new Date(registros[0][COLUMNAS_ESTADO.indexOf('CREADO')]).getTime() > AHORA.getTime());
  caso.d.llamadas.length = 0;
  const atendido = atenderProveedorEscrito_({ hojaEstado: caso.estado, deps: caso.d, momento: { chatId: CHAT } },
    mensajeTexto('Riba Smith'), 'Riba Smith');
  assert.equal(atendido, true);
  assert.equal(filaDe(caso.sep, 7).PROVEEDOR, 'Riba Smith');
});

test('un BORRAR abierto más nuevo sigue frenando el proveedor escrito sin cita', () => {
  const caso = enModoPreguntas();
  caso.estado.appendRow(COLUMNAS_ESTADO.map((c) => ({
    CREADO: new Date(2026, 8, 27, 23, 0, 0), TIPO: 'BORRAR', CLAVE: '555',
    DATOS: '{"clave":"555"}', ESTADO: PREGUNTA_ABIERTA,
  }[c] || '')));
  assert.equal(atenderProveedorEscrito_({ hojaEstado: caso.estado, deps: caso.d, momento: null },
    mensajeTexto('Riba Smith'), 'Riba Smith'), false);
  assert.equal(filaDe(caso.sep, 7).PROVEEDOR, 'PENDIENTE');
});

test('repetir el proveedor cuando ya está lleno no lo pisa, no avisa "anotado" y sigue el camino normal', () => {
  const caso = enModoPreguntas();
  assert.equal(atenderProveedorEscrito_({ hojaEstado: caso.estado, deps: caso.d, momento: { chatId: CHAT } },
    mensajeTexto('Riba Smith'), 'Riba Smith'), true);
  assert.equal(celdaEstado(caso.estado, 2, 'ESTADO'), PREGUNTA_ABIERTA);
  caso.d.llamadas.length = 0;
  const atendido = atenderProveedorEscrito_({ hojaEstado: caso.estado, deps: caso.d, momento: { chatId: CHAT } },
    mensajeTexto('Otro Super'), 'Otro Super');
  assert.equal(atendido, false);
  assert.equal(filaDe(caso.sep, 7).PROVEEDOR, 'Riba Smith');
  assert.deepEqual(textosEnviados(caso.d), []);
});
