const test = require('node:test');
const assert = require('node:assert/strict');

// En Apps Script todos estos nombres son globales; en Node se ponen a mano antes de requerir la
// capa de app (mismo patrón que mensajesFoto.test.js, más las piezas).
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
Object.assign(global, require('../src/Carpetas.js'));
Object.assign(global, require('../src/Foto.js'));
Object.assign(global, require('../src/PorProcesar.js'));
Object.assign(global, require('../src/Reintento.js'));
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
Object.assign(global, require('../src/FechaFotoApp.js'));
Object.assign(global, require('../src/PorProcesarApp.js'));
Object.assign(global, require('../src/ReintentoApp.js'));
Object.assign(global, require('../src/MensajesFoto.js'));
Object.assign(global, require('../src/Importacion.js'));
Object.assign(global, require('../src/Duplicado.js'));
Object.assign(global, require('../src/DuplicadoApp.js'));

const { atenderMensaje_, atenderBoton_ } = require('../src/MensajesApp.js');
const { ocrDrive_, probarOcr, atenderTotalEscrito_, serviciosOcr_ } = require('../src/PorProcesarApp.js');
const { dependenciasReales_ } = require('../src/WebhookApp.js');
const { COLUMNAS_ESTADO } = require('../src/Hoja.js');
const { PREGUNTA_ABIERTA } = require('../src/Escritura.js');
const { TEXTO_CONTEO_ATENDIDO } = require('../src/Botones.js');
const {
  textoTotalOcr_, tecladoTotalOcr_, TEXTO_PEDIR_TOTAL, TEXTO_TOTAL_NO, filaPorProcesar_,
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

/** Libro con Septiembre 2026 y _ESTADO con solo el encabezado. */
function escenario() {
  const sep = hojaFalsa('Septiembre 2026');
  ponerFila(sep, 6, SALDO_INICIAL);
  const estado = hojaFalsa(PESTANA_ESTADO, { protegerDesborde: false });
  estado.appendRow([...COLUMNAS_ESTADO]);
  return { sep, estado, ss: libroFalso([sep, estado]) };
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

/** Servicios del OCR falsos: guardan lo que se les pidió y devuelven lo que diga `como`. */
function serviciosFalsos(como = {}) {
  const pedidos = { creados: [], exportados: [], papelera: [] };
  return {
    pedidos,
    crearDoc: (recurso, blob, opciones) => {
      pedidos.creados.push({ recurso, blob, opciones });
      if (como.crearLanza) throw new Error('Drive falló');
      return como.creado === undefined ? { id: 'doc-1' } : como.creado;
    },
    traer: (url, opciones) => {
      pedidos.exportados.push({ url, opciones });
      return {
        getResponseCode: () => como.codigo || 200,
        getContentText: () => (como.texto === undefined ? TEXTO_RECIBO : como.texto),
      };
    },
    token: () => 'token-secreto',
    aPapelera: (id) => {
      pedidos.papelera.push(id);
      if (como.papeleraLanza) throw new Error('no se pudo borrar');
    },
  };
}

// --- OCR de Drive ---

test('ocrDrive_ sube la foto convertida a Doc con ocrLanguage es y devuelve el texto', () => {
  const raiz = carpetaFalsa('Facturas');
  const servicios = serviciosFalsos();
  const resultado = ocrDrive_(blobFalso(), raiz, servicios);
  assert.deepEqual(resultado, { ok: true, texto: TEXTO_RECIBO });
  const { recurso, opciones } = servicios.pedidos.creados[0];
  assert.equal(recurso.mimeType, 'application/vnd.google-apps.document');
  assert.deepEqual(opciones, { ocrLanguage: 'es' });
  // El Doc temporal se crea dentro de "Por clasificar".
  assert.deepEqual(recurso.parents, [raiz.hijas[0].getId()]);
  assert.equal(raiz.hijas[0].getName(), 'Por clasificar');
});

test('ocrDrive_ exporta text/plain con el token en la cabecera y manda el Doc a la papelera', () => {
  const servicios = serviciosFalsos();
  ocrDrive_(blobFalso(), carpetaFalsa('Facturas'), servicios);
  const { url, opciones } = servicios.pedidos.exportados[0];
  assert.equal(url, 'https://www.googleapis.com/drive/v3/files/doc-1/export?mimeType=text/plain');
  assert.equal(opciones.headers.Authorization, 'Bearer token-secreto');
  assert.equal(opciones.muteHttpExceptions, true);
  assert.deepEqual(servicios.pedidos.papelera, ['doc-1']);
});

test('ocrDrive_ con Drive lanzando devuelve la falla sin lanzar y sin dejar nada', () => {
  const servicios = serviciosFalsos({ crearLanza: true });
  const resultado = ocrDrive_(blobFalso(), carpetaFalsa('Facturas'), servicios);
  assert.equal(resultado.ok, false);
  assert.match(resultado.motivo, /OCR/);
  assert.deepEqual(servicios.pedidos.papelera, []);
});

test('ocrDrive_ sin id de documento no exporta nada', () => {
  const servicios = serviciosFalsos({ creado: {} });
  assert.equal(ocrDrive_(blobFalso(), carpetaFalsa('Facturas'), servicios).ok, false);
  assert.deepEqual(servicios.pedidos.exportados, []);
});

test('ocrDrive_ con el export en error igual manda el Doc a la papelera', () => {
  const servicios = serviciosFalsos({ codigo: 403 });
  const resultado = ocrDrive_(blobFalso(), carpetaFalsa('Facturas'), servicios);
  assert.equal(resultado.ok, false);
  assert.deepEqual(servicios.pedidos.papelera, ['doc-1']);
});

test('ocrDrive_ con la papelera fallando devuelve el texto igual (AF-c: solo se registra)', () => {
  const servicios = serviciosFalsos({ papeleraLanza: true });
  assert.deepEqual(ocrDrive_(blobFalso(), carpetaFalsa('Facturas'), servicios), { ok: true, texto: TEXTO_RECIBO });
});

test('ningún motivo del OCR lleva el token ni la URL de export', () => {
  [{ crearLanza: true }, { creado: {} }, { codigo: 500 }].forEach((como) => {
    const { motivo } = ocrDrive_(blobFalso(), carpetaFalsa('Facturas'), serviciosFalsos(como));
    assert.doesNotMatch(motivo, /token|googleapis|Bearer/i, motivo);
  });
});

// --- probarOcr desde el editor ---

function conDrive(raiz) {
  const registro = [];
  global.DriveApp = { getFolderById: () => raiz };
  global.Logger = { log: (linea) => registro.push(linea) };
  global.Drive = { Files: { create: () => ({ id: 'doc-1' }) } };
  global.ScriptApp = { getOAuthToken: () => 'token-secreto' };
  global.UrlFetchApp = { fetch: () => ({ getResponseCode: () => 200, getContentText: () => TEXTO_RECIBO }) };
  return registro;
}

test('probarOcr() lee la imagen más nueva de Por clasificar y registra el total propuesto', () => {
  const raiz = carpetaFalsa('Facturas');
  const porClasificar = raiz.createFolder('Por clasificar');
  const vieja = porClasificar.createFile(blobFalso());
  vieja.setName('tg-1.jpg');
  const nueva = porClasificar.createFile(blobFalso());
  nueva.setName('tg-2.jpg');
  nueva.creado = new Date(2026, 8, 27, 9, 0, 0);
  const registro = conDrive(raiz);
  probarOcr();
  assert.match(registro.join('\n'), /tg-2\.jpg/);
  assert.match(registro.join('\n'), /66\.34/);
  // El Doc temporal ya no está en la carpeta.
  assert.deepEqual(archivosDe(raiz), ['Facturas/Por clasificar/tg-1.jpg', 'Facturas/Por clasificar/tg-2.jpg']);
});

test('probarOcr() avisa si no hay ninguna imagen que Drive pueda leer', () => {
  const raiz = carpetaFalsa('Facturas');
  raiz.createFolder('Por clasificar').createFile(blobFalso('image/heic')).setName('tg-3.heic');
  const registro = conDrive(raiz);
  probarOcr();
  assert.match(registro.join('\n'), /No hay ninguna imagen/);
});

test('probarOcr() registra la falla del OCR sin lanzar', () => {
  const raiz = carpetaFalsa('Facturas');
  raiz.createFolder('Por clasificar').createFile(blobFalso()).setName('tg-4.jpg');
  const registro = conDrive(raiz);
  global.Drive = { Files: { create: () => { throw new Error('sin cuota'); } } };
  probarOcr();
  assert.match(registro.join('\n'), /falla/);
});

// --- La foto que Gemini no pudo leer (casos 9 y 13) ---

/** Dependencias falsas: Telegram, Drive, el OCR y el reloj. */
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
    ocr: () => ({ ok: true, texto: TEXTO_RECIBO }),
    ...extra,
  };
}

/** Gemini falso que siempre falla (caso 13: clave inválida / 429). */
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

const enviados = (d) => d.llamadas.filter(([metodo]) => metodo === 'sendMessage');
const textoEnviado = (d, i = 0) => enviados(d)[i][1].text;
const celdaEstado = (estado, fila, columna) => estado.leer(fila, COLUMNAS_ESTADO.indexOf(columna) + 1);
const datosEstado = (estado, fila) => JSON.parse(celdaEstado(estado, fila, 'DATOS'));

/** Una foto que Gemini no pudo leer, atendida de punta a punta. */
function sinGemini(extraDeps = {}, mensaje = mensajeFoto()) {
  const caso = escenario();
  const raiz = carpetaFalsa('Facturas');
  geminiCaido();
  const d = dependencias(caso.ss, raiz, extraDeps);
  caso.sep.escrituras.length = 0;
  atenderMensaje_(mensaje, d, caso.estado);
  return { ...caso, raiz, d };
}

test('la foto que Gemini no pudo leer deja una POR-PROCESAR abierta con el enlace de la foto', () => {
  const { estado } = sinGemini();
  assert.equal(celdaEstado(estado, 2, 'TIPO'), 'POR-PROCESAR');
  assert.equal(celdaEstado(estado, 2, 'CLAVE'), String(ID_ERIN));
  assert.equal(celdaEstado(estado, 2, 'ESTADO'), PREGUNTA_ABIERTA);
  assert.equal(celdaEstado(estado, 2, 'ID FILAS'), '');
  const guardado = datosEstado(estado, 2);
  assert.match(guardado.enlace, /^https:\/\/drive\.google\.com\//);
  assert.match(guardado.idFoto, /^archivo-\d+$/);
  assert.equal(guardado.fechaMensaje, '2026-09-27');
  assert.equal(guardado.intentos, 0);
  assert.equal(guardado.totalOcr, 66.34);
});

test('con un total del OCR el bot lo propone con los botones Sí/No y no escribe nada', () => {
  const { d, sep, raiz } = sinGemini();
  assert.deepEqual(enviados(d).map(([, cuerpo]) => cuerpo.text), [textoTotalOcr_(66.34)]);
  assert.deepEqual(enviados(d)[0][1].reply_markup, tecladoTotalOcr_(ID_ERIN));
  assert.deepEqual(sep.escrituras, []);
  assert.deepEqual(archivosDe(raiz), ['Facturas/Por clasificar/tg-501.jpg']);
});

test('el id del mensaje con que el bot preguntó queda en DATOS', () => {
  const { estado, d } = sinGemini();
  assert.equal(enviados(d).length, 1);
  assert.equal(datosEstado(estado, 2).idPregunta, 901);
});

test('sin total en el texto del OCR el bot pide el total, sin botones', () => {
  const { d, estado } = sinGemini({ ocr: () => ({ ok: true, texto: 'Gracias por su compra' }) });
  assert.equal(textoEnviado(d), TEXTO_PEDIR_TOTAL);
  assert.equal(enviados(d)[0][1].reply_markup, undefined);
  assert.equal(datosEstado(estado, 2).totalOcr, undefined);
});

test('si el OCR falla el bot pide el total igual y deja la entrada abierta', () => {
  const { d, estado } = sinGemini({ ocr: () => ({ ok: false, motivo: 'no se pudo' }) });
  assert.equal(textoEnviado(d), TEXTO_PEDIR_TOTAL);
  assert.equal(celdaEstado(estado, 2, 'TIPO'), 'POR-PROCESAR');
});

test('una foto HEIC no pasa por el OCR: el bot pregunta el total directo', () => {
  let llamado = false;
  const { d } = sinGemini({
    descargar: () => blobFalso('image/heic'),
    ocr: () => { llamado = true; return { ok: true, texto: TEXTO_RECIBO }; },
  });
  assert.equal(llamado, false);
  assert.equal(textoEnviado(d), TEXTO_PEDIR_TOTAL);
});

test('la leyenda de la foto se guarda en la entrada POR-PROCESAR', () => {
  const { estado } = sinGemini({}, mensajeFoto({ caption: 'Playa' }));
  assert.equal(datosEstado(estado, 2).leyenda, 'Playa');
});

// --- Botones Sí/No del total propuesto ---

const toqueTotal = (opcion, id = ID_ERIN) => ({
  id: 'cb-1',
  data: `totalocr:${id}:${opcion}`,
  message: { message_id: 901, date: 1, chat: { id: CHAT } },
});

test('tocar "Sí" escribe UNA fila con el total, PENDIENTE en lo demás, y confirma', () => {
  const caso = sinGemini();
  atenderBoton_(toqueTotal('si'), caso.d, caso.estado);
  const fila = filaDe(caso.sep, 7);
  assert.equal(fila['GASTO (USD)'], 66.34);
  assert.equal(fila.FECHA, '2026-09-27');
  assert.equal(fila.PROVEEDOR, 'PENDIENTE');
  assert.equal(fila['FORMA DE PAGO'], 'PENDIENTE');
  assert.equal(fila['CLASE DE GASTO'], 'PENDIENTE');
  assert.equal(fila['ID FILA'], `BOT-${SELLO}-${ID_ERIN}-1`);
  assert.match(fila.FOTO, /^https:\/\/drive\.google\.com\//);
  assert.match(textoEnviado(caso.d, 1), /ver foto/);
});

test('tocar "Sí" mueve la foto al mes con el nombre de una factura sin leer', () => {
  const caso = sinGemini();
  atenderBoton_(toqueTotal('si'), caso.d, caso.estado);
  assert.deepEqual(archivosDe(caso.raiz), ['Facturas/2026/9. Septiembre/2026.09.27 - Factura sin leer.jpg']);
});

test('tocar "Sí" anota las filas escritas en ID FILAS y deja la entrada abierta', () => {
  const caso = sinGemini();
  atenderBoton_(toqueTotal('si'), caso.d, caso.estado);
  assert.equal(celdaEstado(caso.estado, 2, 'ID FILAS'), `BOT-${SELLO}-${ID_ERIN}-1`);
  assert.equal(celdaEstado(caso.estado, 2, 'ESTADO'), PREGUNTA_ABIERTA);
});

test('tocar "Sí" quita los botones y contesta el toque', () => {
  const caso = sinGemini();
  atenderBoton_(toqueTotal('si'), caso.d, caso.estado);
  const metodos = caso.d.llamadas.map(([metodo]) => metodo);
  assert.ok(metodos.includes('answerCallbackQuery'));
  assert.ok(metodos.includes('editMessageReplyMarkup'));
});

test('tocar "No" no escribe nada y pregunta el total', () => {
  const caso = sinGemini();
  caso.sep.escrituras.length = 0;
  atenderBoton_(toqueTotal('no'), caso.d, caso.estado);
  assert.equal(textoEnviado(caso.d, 1), TEXTO_TOTAL_NO);
  assert.deepEqual(caso.sep.escrituras, []);
  assert.equal(celdaEstado(caso.estado, 2, 'ID FILAS'), '');
});

test('tocar "Sí" dos veces solo escribe una fila y avisa que ya está atendido', () => {
  const caso = sinGemini();
  atenderBoton_(toqueTotal('si'), caso.d, caso.estado);
  atenderBoton_(toqueTotal('si'), caso.d, caso.estado);
  assert.equal(filaDe(caso.sep, 8)['GASTO (USD)'], '');
  const respuestas = caso.d.llamadas.filter(([metodo]) => metodo === 'answerCallbackQuery');
  assert.equal(respuestas[respuestas.length - 1][1].text, TEXTO_CONTEO_ATENDIDO);
});

test('un botón de total de una entrada que no existe solo contesta el toque', () => {
  const caso = sinGemini();
  caso.sep.escrituras.length = 0;
  atenderBoton_(toqueTotal('si', 999), caso.d, caso.estado);
  assert.deepEqual(caso.sep.escrituras, []);
});

// --- El total escrito a mano, sin Gemini ---

const mensajeTexto = (texto, extra = {}) => ({
  message_id: 600,
  date: Math.floor(AHORA.getTime() / 1000),
  chat: { id: CHAT, type: 'private' },
  text: texto,
  ...extra,
});

test('un mensaje que es solo un monto contesta la POR-PROCESAR abierta sin llamar a Gemini', () => {
  const caso = sinGemini({ ocr: () => ({ ok: true, texto: 'sin total' }) });
  let gemini = false;
  global.UrlFetchApp = { fetch: () => { gemini = true; throw new Error('no debería llamar a Gemini'); } };
  atenderMensaje_(mensajeTexto('66.34'), caso.d, caso.estado);
  assert.equal(gemini, false);
  assert.equal(filaDe(caso.sep, 7)['GASTO (USD)'], 66.34);
  assert.equal(celdaEstado(caso.estado, 2, 'ID FILAS'), `BOT-${SELLO}-${ID_ERIN}-1`);
});

test('el monto escrito citando el mensaje del bot va a esa foto aunque haya otra pregunta más nueva', () => {
  const caso = sinGemini({ ocr: () => ({ ok: true, texto: 'sin total' }) });
  caso.estado.appendRow(COLUMNAS_ESTADO.map((c) => ({
    CREADO: new Date(2026, 8, 27, 23, 0, 0), TIPO: 'PREGUNTA', CLAVE: '999',
    DATOS: '{"preguntas":["clase"]}', ESTADO: PREGUNTA_ABIERTA,
  }[c] || '')));
  atenderMensaje_(mensajeTexto('66.34', { reply_to_message: { message_id: 901 } }), caso.d, caso.estado);
  assert.equal(filaDe(caso.sep, 7)['GASTO (USD)'], 66.34);
});

test('con otra pregunta abierta más nueva el monto escrito sigue el camino normal de Gemini', () => {
  const caso = sinGemini({ ocr: () => ({ ok: true, texto: 'sin total' }) });
  caso.estado.appendRow(COLUMNAS_ESTADO.map((c) => ({
    CREADO: new Date(2026, 8, 27, 23, 0, 0), TIPO: 'PREGUNTA', CLAVE: '999',
    DATOS: '{"preguntas":["clase"]}', ESTADO: PREGUNTA_ABIERTA,
  }[c] || '')));
  assert.equal(atenderTotalEscrito_({ hojaEstado: caso.estado, deps: caso.d, momento: null },
    mensajeTexto('66.34'), '66.34'), false);
});

test('un texto que no es solo un monto no toca la POR-PROCESAR', () => {
  const caso = sinGemini({ ocr: () => ({ ok: true, texto: 'sin total' }) });
  assert.equal(atenderTotalEscrito_({ hojaEstado: caso.estado, deps: caso.d, momento: null },
    mensajeTexto('gasté 66.34 en el super'), 'gasté 66.34 en el super'), false);
});

test('sin ninguna POR-PROCESAR esperando el total, un monto suelto sigue su camino', () => {
  const caso = escenario();
  const d = dependencias(caso.ss, carpetaFalsa('Facturas'));
  assert.equal(atenderTotalEscrito_({ hojaEstado: caso.estado, deps: d, momento: null },
    mensajeTexto('66.34'), '66.34'), false);
});

test('una POR-PROCESAR con el total ya confirmado no vuelve a tomar un monto escrito', () => {
  const caso = escenario();
  const fila = filaPorProcesar_({
    creado: AHORA, idMensaje: ID_ERIN, fechaMensaje: '2026-09-27', idFoto: 'a', enlace: 'u', intentos: 0,
  });
  fila[COLUMNAS_ESTADO.indexOf('ID FILAS')] = 'BOT-1';
  caso.estado.appendRow(fila);
  const d = dependencias(caso.ss, carpetaFalsa('Facturas'));
  assert.equal(atenderTotalEscrito_({ hojaEstado: caso.estado, deps: d, momento: null },
    mensajeTexto('66.34'), '66.34'), false);
});

test('un monto escrito citando otro mensaje cualquiera no contesta la POR-PROCESAR', () => {
  const caso = sinGemini({ ocr: () => ({ ok: true, texto: 'sin total' }) });
  assert.equal(atenderTotalEscrito_({ hojaEstado: caso.estado, deps: caso.d, momento: null },
    mensajeTexto('66.34', { reply_to_message: { message_id: 12345 } }), '66.34'), false);
});

// --- Los servicios de verdad (solo el cableado: cada uno llama a su servicio de Google) ---

test('serviciosOcr_ llama a Drive avanzado, a UrlFetchApp, a ScriptApp y a la papelera', () => {
  const pedidos = [];
  global.Drive = { Files: { create: (r, b, o) => { pedidos.push(['create', r, b, o]); return { id: 'doc-9' }; } } };
  global.UrlFetchApp = { fetch: (url, opciones) => { pedidos.push(['fetch', url, opciones]); return 'respuesta'; } };
  global.ScriptApp = { getOAuthToken: () => 'token-real' };
  global.DriveApp = { getFileById: (id) => ({ setTrashed: (v) => pedidos.push(['papelera', id, v]) }) };
  const servicios = serviciosOcr_();
  assert.deepEqual(servicios.crearDoc({ name: 'x' }, 'blob', { ocrLanguage: 'es' }), { id: 'doc-9' });
  assert.equal(servicios.traer('https://ejemplo', { method: 'get' }), 'respuesta');
  assert.equal(servicios.token(), 'token-real');
  servicios.aPapelera('doc-9');
  assert.deepEqual(pedidos.map(([que]) => que), ['create', 'fetch', 'papelera']);
  assert.deepEqual(pedidos[2], ['papelera', 'doc-9', true]);
});

test('dependenciasReales_ agrega el OCR del paso 17b', () => {
  const raiz = carpetaFalsa('Facturas');
  global.PropertiesService = { getScriptProperties: () => ({ getProperty: () => '' }) };
  global.LockService = { getScriptLock: () => ({}) };
  global.CacheService = { getScriptCache: () => ({}) };
  global.SpreadsheetApp = { openById: () => ({ getSheetByName: () => null }) };
  global.Utilities = { formatDate: () => '' };
  global.Drive = { Files: { create: () => ({ id: 'doc-1' }) } };
  global.ScriptApp = { getOAuthToken: () => 'token-real' };
  global.UrlFetchApp = { fetch: () => ({ getResponseCode: () => 200, getContentText: () => TEXTO_RECIBO }) };
  global.DriveApp = {
    getFolderById: () => raiz,
    getFileById: () => ({ setTrashed: () => null }),
  };
  assert.deepEqual(dependenciasReales_().ocr(blobFalso(), raiz), { ok: true, texto: TEXTO_RECIBO });
});

test('con dos fotos esperando el total, el monto escrito va a la más nueva', () => {
  const caso = escenario();
  const raiz = carpetaFalsa('Facturas');
  const porClasificar = raiz.createFolder('Por clasificar');
  const vieja = porClasificar.createFile(blobFalso());
  const nueva = porClasificar.createFile(blobFalso());
  [[vieja, 401, new Date(2026, 8, 27, 8, 0, 0)], [nueva, 402, new Date(2026, 8, 27, 9, 0, 0)]]
    .forEach(([archivo, idMensaje, creado]) => caso.estado.appendRow(filaPorProcesar_({
      creado, idMensaje, fechaMensaje: '2026-09-27', idFoto: archivo.getId(), enlace: archivo.getUrl(), intentos: 0,
    })));
  const d = dependencias(caso.ss, raiz);
  const momento = { ahora: AHORA, chatId: CHAT, sello: SELLO, fechaMensaje: '2026-09-27' };
  assert.equal(atenderTotalEscrito_({ hojaEstado: caso.estado, deps: d, momento },
    mensajeTexto('66.34'), '66.34'), true);
  assert.equal(celdaEstado(caso.estado, 2, 'ID FILAS'), '');
  assert.equal(celdaEstado(caso.estado, 3, 'ID FILAS'), `BOT-${SELLO}-402-1`);
});

test('con las dos fotos al revés en _ESTADO igual gana la más nueva', () => {
  const caso = escenario();
  const raiz = carpetaFalsa('Facturas');
  const porClasificar = raiz.createFolder('Por clasificar');
  const nueva = porClasificar.createFile(blobFalso());
  const vieja = porClasificar.createFile(blobFalso());
  [[nueva, 402, new Date(2026, 8, 27, 9, 0, 0)], [vieja, 401, new Date(2026, 8, 27, 8, 0, 0)]]
    .forEach(([archivo, idMensaje, creado]) => caso.estado.appendRow(filaPorProcesar_({
      creado, idMensaje, fechaMensaje: '2026-09-27', idFoto: archivo.getId(), enlace: archivo.getUrl(), intentos: 0,
    })));
  const d = dependencias(caso.ss, raiz);
  const momento = { ahora: AHORA, chatId: CHAT, sello: SELLO, fechaMensaje: '2026-09-27' };
  atenderTotalEscrito_({ hojaEstado: caso.estado, deps: d, momento }, mensajeTexto('66.34'), '66.34');
  assert.equal(celdaEstado(caso.estado, 2, 'ID FILAS'), `BOT-${SELLO}-402-1`);
  assert.equal(celdaEstado(caso.estado, 3, 'ID FILAS'), '');
});

test('tocar "Sí" en una entrada sin total guardado no escribe nada y vuelve a preguntar', () => {
  const caso = escenario();
  const raiz = carpetaFalsa('Facturas');
  caso.estado.appendRow(filaPorProcesar_({
    creado: AHORA, idMensaje: ID_ERIN, fechaMensaje: '2026-09-27', idFoto: 'a', enlace: 'u', intentos: 0,
  }));
  const d = dependencias(caso.ss, raiz);
  caso.sep.escrituras.length = 0;
  atenderBoton_(toqueTotal('si'), d, caso.estado);
  assert.equal(textoEnviado(d), TEXTO_PEDIR_TOTAL);
  assert.deepEqual(caso.sep.escrituras, []);
  assert.equal(celdaEstado(caso.estado, 2, 'ID FILAS'), '');
});

test('un callback_data de total con clave rara solo contesta el toque', () => {
  const caso = sinGemini();
  caso.sep.escrituras.length = 0;
  atenderBoton_({ ...toqueTotal('si'), data: 'totalocr::si' }, caso.d, caso.estado);
  assert.deepEqual(caso.sep.escrituras, []);
  const respuestas = caso.d.llamadas.filter(([metodo]) => metodo === 'answerCallbackQuery');
  assert.equal(respuestas[respuestas.length - 1][1].text, TEXTO_CONTEO_ATENDIDO);
});
