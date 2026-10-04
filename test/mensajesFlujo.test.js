const test = require('node:test');
const assert = require('node:assert/strict');

// En Apps Script estos nombres son globales; en Node se ponen a mano.
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
global.registroParaEscribir_ = () => ({ disponible: true, corte: '20260926-000000', porId: new Map() });
global.avisarChoques_ = () => {};
global.CONFIG = require('./configPrueba.js').CONFIG;
global.PESTANA_ESTADO = '_ESTADO';
global.PESTANA_HISTORIAL = '_HISTORIAL';
// Utilities.sleep de los reintentos de Gemini, sin esperar de verdad en las pruebas.
global.Utilities = { sleep: () => {} };
const { hojaFalsa, libroFalso, filaDe, ponerFila } = require('./falsos.js');
Object.assign(global, require('../src/EscrituraApp.js'));
Object.assign(global, require('../src/BotonesApp.js'));
Object.assign(global, require('../src/RegistroApp.js'));
Object.assign(global, require('../src/HistorialApp.js'));
Object.assign(global, require('../src/WebhookApp.js'));
// MensajesApp.js usa atenderFoto_ y moverFotoDelPlan_ como globales (MensajesFoto.js),
// y atenderFechaEscrita_ y atenderBotonFechaFoto_ de FechaFotoApp.js. fotoDeMensaje_ de
// Foto.js decide si el mensaje trae una foto (o un document de imagen mandado "como archivo").
Object.assign(global, require('../src/Foto.js'));
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
const { COLUMNAS_ESTADO } = require('../src/Hoja.js');
const { TEXTO_GEMINI_FALLO, TEXTO_SOLO_TEXTO, TEXTO_SIN_PREGUNTA, esAcuse_, fraseAnimo_ } = require('../src/Mensajes.js');
const { textoGuia_ } = require('../src/Texto.js');
const { tecladoConteo_ } = require('../src/Botones.js');
const { tecladoFecha_, filaFecha_ } = require('../src/Fecha.js');
const { preguntaEstado_ } = require('../src/Escritura.js');
const { guardarPregunta_ } = require('../src/EscrituraApp.js');
const { abrirConteo_ } = require('../src/BotonesApp.js');

const AHORA = new Date(2026, 8, 27, 9, 30, 0);
const SELLO = '20260927-093000';
const CHAT = 1000000001;
const ID_ERIN = 501;

const dos = (n) => String(n).padStart(2, '0');
/** Utilities.formatDate falso para los dos formatos que usa. */
function formatear(fecha, formato) {
  const dia = `${fecha.getFullYear()}-${dos(fecha.getMonth() + 1)}-${dos(fecha.getDate())}`;
  if (formato === 'yyyy-MM-dd') return dia;
  return `${dia.replace(/-/g, '')}-${dos(fecha.getHours())}${dos(fecha.getMinutes())}${dos(fecha.getSeconds())}`;
}

const SALDO_INICIAL = { FECHA: '2026-09-01', 'ID FACTURA': 'SALDOINICIAL-20260901', TIPO: 'SALDO INICIAL', 'DEPÓSITO': 150, MONEDA: 'USD', 'ID FILA': 'BOT-viejo-1', ORIGEN: 'BOT', REGISTRADO: AHORA };
const GASTO_VIEJO = { FECHA: '2026-09-02', 'ID FACTURA': 'X-20260902', TIPO: 'GASTO', 'GASTO (USD)': 60, MONEDA: 'USD', 'CLASE DE GASTO': 'GROCERIES', 'ID FILA': 'BOT-viejo-2', ORIGEN: 'BOT', REGISTRADO: AHORA };
// Gasto del bot esperando proveedor, para las pruebas de "varias preguntas abiertas el mismo día".
const GASTO_SIN_PROVEEDOR = {
  FECHA: '2026-09-27', 'ID FACTURA': 'PENDIENTE-20260927', TIPO: 'GASTO', PROVEEDOR: 'PENDIENTE',
  'GASTO (USD)': 25, MONEDA: 'USD', 'CLASE DE GASTO': 'GROCERIES', 'ID FILA': 'BOT-20260927-090000-501-1',
  ORIGEN: 'BOT', 'ID MENSAJE TG': 501, REGISTRADO: AHORA,
};

// Gasto del bot esperando el total de la factura (para las mismas pruebas).
const GASTO_SIN_TOTAL = {
  FECHA: '2026-09-27', 'ID FACTURA': 'TAXI-20260927', TIPO: 'GASTO', PROVEEDOR: 'Taxi',
  'ARTÍCULOS': 25, 'GASTO (USD)': 25, MONEDA: 'USD', 'CLASE DE GASTO': 'GROCERIES',
  REVISAR: 'PENDIENTE: TOTAL (partes suman 25.00)', 'ID FILA': 'BOT-20260927-090000-501-2', ORIGEN: 'BOT',
  'ID MENSAJE TG': 501, REGISTRADO: AHORA,
};

/** Libro con Septiembre 2026 (saldo 90) y _ESTADO con solo el encabezado. */
function escenario({ filas = [SALDO_INICIAL, GASTO_VIEJO] } = {}) {
  const sep = hojaFalsa('Septiembre 2026');
  filas.forEach((valores, i) => ponerFila(sep, 6 + i, valores));
  const estado = hojaFalsa(PESTANA_ESTADO, { protegerDesborde: false });
  estado.appendRow([...COLUMNAS_ESTADO]);
  return { sep, estado, ss: libroFalso([sep, estado]) };
}

/** Dependencias falsas; cada respuesta de Telegram trae un message_id nuevo desde 901. */
function dependencias(ss, extra = {}) {
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
      idBot += 1;
      return { codigo: 200, datos: { ok: true, result: { message_id: idBot } } };
    },
    ...extra,
  };
}

const datosGemini = (extra = {}) => ({
  legible: true,
  tipo_documento: 'OTRO',
  proveedor: null,
  fecha: null,
  moneda: 'USD',
  forma_pago: 'DESCONOCIDA',
  lineas: [],
  total: null,
  clase: 'PENDIENTE',
  descripcion_corta: '',
  confianza: { proveedor: 'ALTA', fecha: 'ALTA', moneda: 'ALTA', total: 'ALTA', clase: 'ALTA' },
  intencion: 'OTRO',
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

const mensaje = (texto, extra = {}) => ({
  message_id: ID_ERIN,
  date: Math.floor(AHORA.getTime() / 1000),
  chat: { id: CHAT, type: 'private' },
  text: texto,
  ...extra,
});

/** Texto del n-ésimo sendMessage que el bot mandó. */
const textoEnviado = (d, i = 0) => d.llamadas.filter(([metodo]) => metodo === 'sendMessage')[i][1].text;

const celdaEstado = (estado, fila, columna) => estado.leer(fila, COLUMNAS_ESTADO.indexOf(columna) + 1);
const datosEstado = (estado, fila) => JSON.parse(celdaEstado(estado, fila, 'DATOS'));

test('atenderMensaje_ escribe el gasto y responde lo anotado', () => {
  const { ss, sep, estado } = escenario();
  ponerGemini(datosGemini({ intencion: 'GASTO', proveedor: 'Taxi', fecha: '2026-09-27', total: 25, clase: 'GROCERIES' }));
  const d = dependencias(ss);
  atenderMensaje_(mensaje('25 efectivo taxi'), d, estado);
  assert.deepEqual(d.llamadas.map(([metodo]) => metodo), ['sendMessage']);
  assert.equal(d.llamadas[0][1].chat_id, CHAT);
  assert.match(textoEnviado(d), /^Listo, agregué el gasto a tu reporte\. Estos son los detalles:/);
  assert.match(textoEnviado(d), /^<b>Proveedor:<\/b> Taxi$/m);
  assert.match(textoEnviado(d), /^<b>Gasto:<\/b> 25\.00$/m);
  const fila = filaDe(sep, 8);
  assert.equal(fila.PROVEEDOR, 'Taxi');
  assert.equal(fila['GASTO (USD)'], 25);
  assert.equal(fila['CLASE DE GASTO'], 'GROCERIES');
  assert.equal(fila['ID MENSAJE TG'], ID_ERIN);
  assert.equal(fila['ID FILA'], `BOT-${SELLO}-${ID_ERIN}-1`);
  assert.equal(fila.REGISTRADO, AHORA);
  assert.equal(estado.anexadas.length, 2); // encabezado + el REGISTRO de la confirmación
  // Solo el sendMessage de una confirmación lleva parse_mode HTML (Bot API 10.3).
  assert.equal(d.llamadas[0][1].parse_mode, 'HTML');
});

test('un gasto sin monto (pregunta simple, sin confirmación) no lleva parse_mode HTML', () => {
  const { ss, estado } = escenario();
  ponerGemini(datosGemini({ intencion: 'GASTO', proveedor: 'Taxi', fecha: '2026-09-27' }));
  const d = dependencias(ss);
  atenderMensaje_(mensaje('pagué el taxi'), d, estado);
  assert.equal(d.llamadas[0][1].text, '¿Me dices el monto?');
  assert.equal(d.llamadas[0][1].parse_mode, undefined);
});

test('un mensaje que Gemini no entiende responde en texto plano, sin parse_mode', () => {
  const { ss, estado } = escenario();
  ponerGemini(datosGemini({ intencion: 'OTRO' }));
  const d = dependencias(ss);
  atenderMensaje_(mensaje('asdf qwer'), d, estado);
  assert.equal(d.llamadas[0][1].parse_mode, undefined);
});

test('atenderMensaje_ responde primero y guarda la pregunta con el id de esa respuesta', () => {
  const { ss, sep, estado } = escenario();
  ponerGemini(datosGemini({ intencion: 'GASTO', fecha: '2026-09-27', total: 25 }));
  const d = dependencias(ss);
  atenderMensaje_(mensaje('25 en el super'), d, estado);
  assert.match(textoEnviado(d), /^<b>Proveedor:<\/b> \(falta\)$/m);
  assert.match(textoEnviado(d), /^<b>Clase de gasto:<\/b> \(falta\)$/m);
  // La pregunta de clase muestra la lista de los 17 grupos.
  assert.match(textoEnviado(d), /¿Me dices a quién le pagaste y la clase de gasto\?\n\n1\. Supermercado/);
  assert.ok(textoEnviado(d).endsWith('número de la lista, o dime la clase con tus palabras (por ejemplo "super").'),
    textoEnviado(d));
  assert.equal(celdaEstado(estado, 2, 'TIPO'), 'PREGUNTA');
  assert.equal(celdaEstado(estado, 2, 'CLAVE'), 901);
  assert.equal(celdaEstado(estado, 2, 'ESTADO'), 'ABIERTA');
  assert.equal(celdaEstado(estado, 2, 'ID FILAS'), filaDe(sep, 8)['ID FILA']);
  const datos = datosEstado(estado, 2);
  assert.deepEqual(datos.preguntas, ['proveedor', 'clase']);
  assert.equal(datos.pestana, 'Septiembre 2026');
});

test('atenderMensaje_ sin monto no escribe nada y guarda los datos para volver a intentar', () => {
  const { ss, sep, estado } = escenario();
  ponerGemini(datosGemini({ intencion: 'GASTO', proveedor: 'Taxi', fecha: '2026-09-27' }));
  const d = dependencias(ss);
  sep.escrituras.length = 0;
  atenderMensaje_(mensaje('pagué el taxi'), d, estado);
  assert.deepEqual(d.llamadas, [['sendMessage', { chat_id: CHAT, text: '¿Me dices el monto?' }]]);
  assert.deepEqual(sep.escrituras, []);
  const datos = datosEstado(estado, 2);
  assert.deepEqual(datos.preguntas, ['monto']);
  assert.equal(datos.fechaMensaje, '2026-09-27');
  assert.equal(datos.idMensaje, ID_ERIN);
  assert.equal(datos.datos.proveedor, 'Taxi');
  assert.equal(celdaEstado(estado, 2, 'ID FILAS'), '');
});

test('atenderMensaje_ responde la contestación de una pregunta de monto y registra el gasto', () => {
  const { ss, sep, estado } = escenario();
  guardarPregunta_(estado, preguntaEstado_({
    creado: AHORA,
    clave: 901,
    preguntas: ['monto'],
    filas: [],
    pestana: '',
    extra: {
      datos: datosGemini({ intencion: 'GASTO', proveedor: 'Taxi', fecha: '2026-09-26', clase: 'GROCERIES' }),
      fechaMensaje: '2026-09-26',
      idMensaje: 55,
    },
  }));
  ponerGemini(datosGemini({ intencion: 'RESPUESTA', total: 12.5 }));
  const d = dependencias(ss);
  atenderMensaje_(mensaje('12.50', { reply_to_message: { message_id: 901 } }), d, estado);
  assert.deepEqual(d.llamadas.map(([metodo]) => metodo), ['sendMessage']);
  assert.match(textoEnviado(d), /^<b>Gasto:<\/b> 12\.50$/m);
  const fila = filaDe(sep, 8);
  assert.equal(fila['GASTO (USD)'], 12.5);
  assert.equal(fila['ID MENSAJE TG'], 55);
  assert.equal(fila.FECHA, '2026-09-26');
  assert.equal(celdaEstado(estado, 2, 'ESTADO'), 'CERRADA');
});

/** Hace que escribir filas en la hoja falle mientras corre `hacer`; luego la deja como estaba. */
function conEscrituraRota_(hoja, hacer) {
  const original = hoja.getRange;
  hoja.getRange = (...args) => ({
    ...original(...args),
    setValues: () => { throw new Error('Sheets no responde'); },
  });
  try { hacer(); } finally { hoja.getRange = original; }
}

/** Escenario con la pregunta de monto abierta (clave 901) esperando el total de un taxi. */
function conPreguntaDeMonto() {
  const caso = escenario();
  guardarPregunta_(caso.estado, preguntaEstado_({
    creado: AHORA,
    clave: 901,
    preguntas: ['monto'],
    filas: [],
    pestana: '',
    extra: {
      datos: datosGemini({ intencion: 'GASTO', proveedor: 'Taxi', fecha: '2026-09-26', clase: 'GROCERIES' }),
      fechaMensaje: '2026-09-26',
      idMensaje: 55,
    },
  }));
  ponerGemini(datosGemini({ intencion: 'RESPUESTA', total: 12.5 }));
  return { ...caso, d: dependencias(caso.ss) };
}

const responderMonto = (d, estado) => atenderMensaje_(
  mensaje('12.50', { reply_to_message: { message_id: 901 } }), d, estado);
const filasConTaxi = (sep) => [8, 9, 10].filter((n) => filaDe(sep, n).PROVEEDOR === 'Taxi').length;

test('si falla escribir el gasto, la pregunta de monto sigue abierta y el reintento no duplica filas', () => {
  const { sep, estado, d } = conPreguntaDeMonto();
  conEscrituraRota_(sep, () => assert.throws(() => responderMonto(d, estado), /Sheets no responde/));
  assert.equal(celdaEstado(estado, 2, 'ESTADO'), 'ABIERTA');
  assert.equal(filasConTaxi(sep), 0);
  responderMonto(d, estado);
  assert.equal(filasConTaxi(sep), 1);
  assert.equal(filaDe(sep, 8)['GASTO (USD)'], 12.5);
  assert.equal(celdaEstado(estado, 2, 'ESTADO'), 'CERRADA');
});

test('registrado el gasto, la pregunta de monto se cierra una sola vez', () => {
  const { sep, estado, d } = conPreguntaDeMonto();
  responderMonto(d, estado);
  assert.equal(filasConTaxi(sep), 1);
  const cierres = estado.escrituras.filter(([metodo, fila, col]) => metodo === 'setValue'
    && fila === 2 && col === COLUMNAS_ESTADO.indexOf('ESTADO') + 1);
  assert.equal(cierres.length, 1);
  assert.equal(celdaEstado(estado, 2, 'ESTADO'), 'CERRADA');
});

test('escrito el gasto, un fallo al avisar por Telegram no deja la pregunta de monto abierta', () => {
  const { sep, estado, d } = conPreguntaDeMonto();
  d.llamar = () => { throw new Error('Telegram no responde'); };
  assert.throws(() => responderMonto(d, estado), /Telegram no responde/);
  assert.equal(filasConTaxi(sep), 1);
  assert.equal(celdaEstado(estado, 2, 'ESTADO'), 'CERRADA');
});

test('si falla escribir al tocar el botón de fecha, la pregunta sigue abierta y el reintento escribe una vez', () => {
  const { ss, sep, estado } = escenario();
  guardarPregunta_(estado, filaFecha_({
    creado: AHORA,
    idMensaje: ID_ERIN,
    datos: datosGemini({ intencion: 'GASTO', proveedor: 'Riba Smith', fecha: '2026-09-15', total: 25, clase: 'GROCERIES' }),
    fechaMensaje: '2026-09-27',
  }));
  const d = dependencias(ss);
  const boton = { id: 'cb-1', data: `fecha:${ID_ERIN}:recibo`, message: { message_id: 900, date: 1790000000, chat: { id: CHAT } } };
  conEscrituraRota_(sep, () => assert.throws(() => atenderBoton_(boton, d, estado), /Sheets no responde/));
  assert.equal(celdaEstado(estado, 2, 'ESTADO'), 'ABIERTA');
  atenderBoton_(boton, d, estado);
  assert.equal(filaDe(sep, 8).PROVEEDOR, 'Riba Smith');
  assert.ok(COLUMNAS.every((c, i) => c === 'GRUPO' || sep.leer(9, i + 1) === ''));
  assert.equal(celdaEstado(estado, 2, 'ESTADO'), 'CERRADA');
});

test('atenderMensaje_ aplica a la pregunta citada con "Responder" aunque la intención no sea RESPUESTA', () => {
  const { ss, sep, estado } = escenario();
  ponerGemini([
    datosGemini({ intencion: 'GASTO', fecha: '2026-09-27', total: 25, clase: 'GROCERIES' }),
    datosGemini({ intencion: 'GASTO', proveedor: 'Riba Smith' }),
  ]);
  const d = dependencias(ss);
  atenderMensaje_(mensaje('25 en el super'), d, estado);
  atenderMensaje_(mensaje('Riba Smith', { reply_to_message: { message_id: 901 } }), d, estado);
  assert.deepEqual(d.llamadas[1], ['sendMessage', { chat_id: CHAT, text: 'Listo, lo anoté.' }]);
  assert.equal(filaDe(sep, 8).PROVEEDOR, 'Riba Smith');
  assert.equal(celdaEstado(estado, 2, 'ESTADO'), 'CERRADA');
});

test('atenderMensaje_ con intención RESPUESTA y ninguna pregunta abierta lo dice', () => {
  const { ss, sep, estado } = escenario();
  ponerGemini(datosGemini({ intencion: 'RESPUESTA', proveedor: 'Riba Smith' }));
  const d = dependencias(ss);
  sep.escrituras.length = 0;
  atenderMensaje_(mensaje('Riba Smith'), d, estado);
  assert.deepEqual(d.llamadas, [['sendMessage', { chat_id: CHAT, text: TEXTO_SIN_PREGUNTA }]]);
  assert.deepEqual(sep.escrituras, []);
  assert.equal(estado.anexadas.length, 1);
});

test('atenderMensaje_ con un conteo responde con los botones Sí/No y lo abre en _ESTADO', () => {
  const { ss, estado } = escenario();
  ponerGemini(datosGemini({ intencion: 'CONTEO', total: 85 }));
  const d = dependencias(ss);
  atenderMensaje_(mensaje('tengo 85'), d, estado);
  assert.deepEqual(d.llamadas, [['sendMessage', {
    chat_id: CHAT,
    text: 'El sistema calcula 90.00, dices 85.00: faltante de 5.00. ¿Lo registro como ajuste?',
    reply_markup: tecladoConteo_(ID_ERIN),
  }]]);
  assert.equal(celdaEstado(estado, 2, 'TIPO'), 'CONTEO');
  assert.equal(celdaEstado(estado, 2, 'CLAVE'), String(ID_ERIN));
  assert.deepEqual(datosEstado(estado, 2), { idMensaje: ID_ERIN, contado: 85, saldo: 90 });
});

// ---: ya no hay pregunta diaria de saldo inicial ---

test('atenderMensaje_ no pregunta el saldo inicial aunque falte', () => {
  const { ss, estado } = escenario({ filas: [] });
  ponerGemini(datosGemini({ intencion: 'DEPOSITO', fecha: '2026-09-27', total: 200, proveedor: 'Beto' }));
  const d = dependencias(ss);
  atenderMensaje_(mensaje('depósito 200'), d, estado);
  assert.deepEqual(d.llamadas.map(([metodo]) => metodo), ['sendMessage']);
  assert.match(textoEnviado(d), /^Listo, agregué el depósito a tu reporte\. Estos son los detalles:/);
  assert.match(textoEnviado(d), /^<b>De:<\/b> Beto$/m);
  assert.match(textoEnviado(d), /^<b>Depósito:<\/b> 200\.00$/m);
  assert.equal(estado.anexadas.length, 2); // encabezado + el REGISTRO de la confirmación
  assert.equal(d.llamadas[0][1].parse_mode, 'HTML');
});

test('atenderMensaje_ con SALDO_INICIAL directo sigue escribiendo la fila ("saldo inicial 150")', () => {
  const { ss, sep, estado } = escenario({ filas: [] });
  ponerGemini(datosGemini({ intencion: 'SALDO_INICIAL', total: 150 }));
  const d = dependencias(ss);
  atenderMensaje_(mensaje('saldo inicial 150'), d, estado);
  assert.match(d.llamadas[0][1].text, /^Anoté el saldo inicial: 150\.00\./);
  assert.equal(filaDe(sep, 6).TIPO, 'SALDO INICIAL');
  assert.equal(filaDe(sep, 6)['DEPÓSITO'], 150);
});

test('atenderMensaje_ ignora una pregunta vieja de saldo_inicial de _ESTADO: no la manda a Gemini ni la contesta', () => {
  const { ss, sep, estado } = escenario({ filas: [] });
  guardarPregunta_(estado, preguntaEstado_({
    creado: AHORA,
    clave: 902,
    preguntas: ['saldo_inicial'],
    filas: [],
    pestana: '',
    extra: { fechaMensaje: '2026-09-27', idMensaje: 902 },
  }));
  const pedidos = ponerGemini(datosGemini({ intencion: 'RESPUESTA', total: 0 }));
  const d = dependencias(ss);
  sep.escrituras.length = 0;
  atenderMensaje_(mensaje('nada'), d, estado);
  const texto = JSON.parse(pedidos[0].opciones.payload).systemInstruction.parts[0].text;
  assert.ok(!texto.includes('preguntas sin contestar'));
  assert.deepEqual(d.llamadas, [['sendMessage', { chat_id: CHAT, text: TEXTO_SIN_PREGUNTA }]]);
  assert.deepEqual(sep.escrituras, []);
  assert.equal(celdaEstado(estado, 2, 'ESTADO'), 'ABIERTA'); // se queda como estaba, sin romper nada
});

test('atenderMensaje_ con "Responder" sobre una pregunta vieja de saldo_inicial no escribe nada', () => {
  const { ss, sep, estado } = escenario({ filas: [] });
  guardarPregunta_(estado, preguntaEstado_({
    creado: AHORA,
    clave: 902,
    preguntas: ['saldo_inicial'],
    filas: [],
    pestana: '',
    extra: { fechaMensaje: '2026-09-27', idMensaje: 902 },
  }));
  ponerGemini(datosGemini({ intencion: 'RESPUESTA', total: 0 }));
  const d = dependencias(ss);
  sep.escrituras.length = 0;
  atenderMensaje_(mensaje('nada', { reply_to_message: { message_id: 902 } }), d, estado);
  assert.deepEqual(d.llamadas, [['sendMessage', { chat_id: CHAT, text: TEXTO_SIN_PREGUNTA }]]);
  assert.deepEqual(sep.escrituras, []);
});

// ---: saludos y ayuda (guía sin Gemini) ---

test('atenderMensaje_ con "Hola!" responde la guía sin llamar a Gemini y sin escribir nada', () => {
  const { ss, sep, estado } = escenario();
  const pedidos = ponerGemini(datosGemini());
  const d = dependencias(ss);
  sep.escrituras.length = 0;
  atenderMensaje_(mensaje('Hola!'), d, estado);
  assert.deepEqual(d.llamadas, [['sendMessage', { chat_id: CHAT, text: textoGuia_() }]]);
  assert.deepEqual(pedidos, []);
  assert.deepEqual(sep.escrituras, []);
  assert.equal(estado.anexadas.length, 1);
});

test('atenderMensaje_ responde la misma guía a "/start", "ayuda", "buenos días" y "?"', () => {
  ['/start', 'ayuda', '/ayuda', 'buenos días', 'buenas noches', '?'].forEach((texto) => {
    const { ss, estado } = escenario();
    const pedidos = ponerGemini(datosGemini());
    const d = dependencias(ss);
    atenderMensaje_(mensaje(texto), d, estado);
    assert.deepEqual(d.llamadas, [['sendMessage', { chat_id: CHAT, text: textoGuia_() }]], texto);
    assert.deepEqual(pedidos, [], texto);
  });
});

test('atenderMensaje_ con intención AYUDA de Gemini ("¿cómo funciona esto?") responde la guía', () => {
  const { ss, sep, estado } = escenario();
  ponerGemini(datosGemini({ intencion: 'AYUDA' }));
  const d = dependencias(ss);
  sep.escrituras.length = 0;
  atenderMensaje_(mensaje('¿cómo funciona esto?'), d, estado);
  assert.deepEqual(d.llamadas, [['sendMessage', { chat_id: CHAT, text: textoGuia_() }]]);
  assert.deepEqual(sep.escrituras, []);
  assert.equal(estado.anexadas.length, 1);
});

test('atenderMensaje_ pasa un gasto en otra moneda a USD con la tasa de la fuente', () => {
  const { ss, sep, estado } = escenario();
  ponerGemini(datosGemini({
    intencion: 'GASTO', proveedor: 'Taxi', fecha: '2026-09-27', total: 100000, moneda: 'COP', clase: 'GROCERIES',
  }));
  const d = dependencias(ss, { obtenerJson: () => ({ quote: 'COP', rate: 4000, date: '2026-09-27' }) });
  atenderMensaje_(mensaje('100000 pesos en taxi'), d, estado);
  assert.match(textoEnviado(d), /^<b>Gasto:<\/b> 25\.00 USD \(pagado en COP\)$/m);
  const fila = filaDe(sep, 8);
  assert.equal(fila['GASTO (USD)'], 25);
  assert.equal(fila['MONTO ORIGINAL'], 100000);
  assert.equal(fila['TASA USADA'], '4000 (2026-09-27)');
  assert.equal(estado.anexadas.length, 2); // encabezado + el REGISTRO de la confirmación
});

test('atenderMensaje_ con Gemini caído responde el aviso y no escribe nada', () => {
  const { ss, sep, estado } = escenario();
  ponerGemini(datosGemini({ intencion: 'GASTO', total: 25 }), 500);
  const d = dependencias(ss);
  sep.escrituras.length = 0;
  const avisos = [];
  const real = console.warn;
  console.warn = (linea) => avisos.push(linea);
  try {
    atenderMensaje_(mensaje('25 efectivo taxi'), d, estado);
  } finally {
    console.warn = real;
  }
  // HTTP 500 es transitorio, reintenta el mismo modelo y luego MODELO_RELECTURA
  // (los tres siguen a 500 en este escenario) antes de darse por vencido.
  assert.deepEqual(avisos, [
    `Gemini ${CONFIG.MODELO_PRINCIPAL}: HTTP 500, reintenta`,
    `Gemini ${CONFIG.MODELO_PRINCIPAL}: HTTP 500, reintenta`,
    'Gemini de texto: HTTP 500: sin detalle',
  ]);
  assert.deepEqual(d.llamadas, [['sendMessage', { chat_id: CHAT, text: TEXTO_GEMINI_FALLO }]]);
  assert.deepEqual(sep.escrituras, []);
  assert.equal(estado.anexadas.length, 1);
});

// Las fotos ya tienen su propio camino (test/mensajesFoto.test.js); TEXTO_SOLO_TEXTO
// queda para los demás adjuntos (documentos, audios, ubicaciones).
test('atenderMensaje_ sin texto y sin foto (documento) avisa y no llama a Gemini', () => {
  const { ss, sep, estado } = escenario();
  const pedidos = ponerGemini(datosGemini());
  const d = dependencias(ss);
  sep.escrituras.length = 0;
  atenderMensaje_({ message_id: ID_ERIN, date: 1790000000, chat: { id: CHAT, type: 'private' }, document: { file_id: 'd' } }, d, estado);
  assert.deepEqual(d.llamadas, [['sendMessage', { chat_id: CHAT, text: TEXTO_SOLO_TEXTO }]]);
  assert.deepEqual(pedidos, []);
  assert.deepEqual(sep.escrituras, []);
});

test('atenderMensaje_ sin fecha en el mensaje usa la hora del servidor', () => {
  const { ss, sep, estado } = escenario();
  ponerGemini(datosGemini({ intencion: 'GASTO', proveedor: 'Taxi', total: 25, clase: 'GROCERIES' }));
  const d = dependencias(ss);
  atenderMensaje_(mensaje('25 taxi', { date: undefined }), d, estado);
  assert.equal(filaDe(sep, 8).FECHA, '2026-09-27');
  assert.equal(filaDe(sep, 8).REVISAR, '');
});

test('atenderMensaje_ lanza error si Telegram no acepta la respuesta', () => {
  const { ss, estado } = escenario();
  ponerGemini(datosGemini({ intencion: 'GASTO', proveedor: 'Taxi', fecha: '2026-09-27', total: 25, clase: 'GROCERIES' }));
  const d = dependencias(ss, {
    llamar: () => ({ codigo: 400, datos: { ok: false, description: 'Bad Request: chat not found' } }),
  });
  assert.throws(() => atenderMensaje_(mensaje('25 taxi'), d, estado),
    /Telegram sendMessage: HTTP 400 — Bad Request: chat not found/);
});

test('atenderBoton_ con Sí escribe el AJUSTE y ejecuta las llamadas del conteo', () => {
  const { ss, sep, estado } = escenario();
  abrirConteo_(estado, { idMensaje: ID_ERIN, contado: 85, saldo: 90 }, AHORA);
  const d = dependencias(ss);
  atenderBoton_({
    id: 'cb-1',
    data: `conteo:${ID_ERIN}:si`,
    message: { message_id: 900, date: 1790000000, chat: { id: CHAT } },
  }, d, estado);
  assert.deepEqual(d.llamadas.map(([metodo]) => metodo),
    ['answerCallbackQuery', 'editMessageReplyMarkup', 'sendMessage']);
  assert.deepEqual(d.llamadas[2][1], { chat_id: CHAT, text: 'Anoté el ajuste: faltante de 5.00.' });
  const fila = filaDe(sep, 8);
  assert.equal(fila.TIPO, 'AJUSTE');
  assert.equal(fila['GASTO (USD)'], 5);
  assert.equal(fila.FECHA, '2026-09-27');
  assert.equal(celdaEstado(estado, 2, 'ESTADO'), 'CERRADA');
});

test('atenderBoton_ de un conteo que ya no está solo contesta el botón', () => {
  const { ss, sep, estado } = escenario();
  const d = dependencias(ss);
  sep.escrituras.length = 0;
  atenderBoton_({ id: 'cb-1', data: 'conteo:999:si', message: { message_id: 900, date: 1, chat: { id: CHAT } } }, d, estado);
  assert.equal(d.llamadas.length, 1);
  assert.equal(d.llamadas[0][0], 'answerCallbackQuery');
  assert.deepEqual(sep.escrituras, []);
});

test('atenderBoton_ sin mensaje usa el chat del usuario', () => {
  const { ss, estado } = escenario();
  abrirConteo_(estado, { idMensaje: ID_ERIN, contado: 90, saldo: 90 }, AHORA);
  const d = dependencias(ss);
  atenderBoton_({ id: 'cb-1', data: `conteo:${ID_ERIN}:no` }, d, estado);
  const envio = d.llamadas.find(([metodo]) => metodo === 'sendMessage');
  assert.equal(envio[1].chat_id, CONFIG.ERIN_CHAT_ID);
});

test('atenderBoton_ con un callback_data desconocido no lanza y solo contesta el botón', () => {
  const { ss, sep, estado } = escenario();
  const d = dependencias(ss);
  sep.escrituras.length = 0;
  atenderBoton_({ id: 'cb-1', data: 'algo-raro', message: { message_id: 900, date: 1, chat: { id: CHAT } } }, d, estado);
  assert.equal(d.llamadas.length, 1);
  assert.equal(d.llamadas[0][0], 'answerCallbackQuery');
  assert.deepEqual(sep.escrituras, []);
});

// --- Fecha de otro mes ---

test('atenderMensaje_ con la fecha del recibo de otro mes pregunta con botones y no escribe nada', () => {
  const { ss, sep, estado } = escenario();
  ponerGemini(datosGemini({
    intencion: 'GASTO', proveedor: 'Riba Smith', fecha: '2026-08-15', total: 25, clase: 'GROCERIES',
  }));
  const d = dependencias(ss);
  sep.escrituras.length = 0;
  atenderMensaje_(mensaje('25 en Riba Smith el 15 de agosto'), d, estado);
  assert.deepEqual(d.llamadas, [['sendMessage', {
    chat_id: CHAT,
    text: 'El recibo es del 2026-08-15 pero lo mandaste el 2026-09-27, de otro mes. ¿Con cuál lo registro?',
    reply_markup: tecladoFecha_(ID_ERIN, '2026-08-15', '2026-09-27'),
  }]]);
  assert.deepEqual(sep.escrituras, []);
  assert.equal(celdaEstado(estado, 2, 'TIPO'), 'FECHA');
  assert.equal(celdaEstado(estado, 2, 'CLAVE'), String(ID_ERIN));
  assert.equal(celdaEstado(estado, 2, 'ESTADO'), 'ABIERTA');
  const datos = datosEstado(estado, 2);
  assert.equal(datos.fechaMensaje, '2026-09-27');
  assert.equal(datos.idMensaje, ID_ERIN);
  assert.equal(datos.datos.fecha, '2026-08-15');
});

test('atenderMensaje_ con fecha del recibo del mismo mes no pregunta nada de fecha (comportamiento actual)', () => {
  const { ss, sep, estado } = escenario();
  ponerGemini(datosGemini({
    intencion: 'GASTO', proveedor: 'Riba Smith', fecha: '2026-09-01', total: 25, clase: 'GROCERIES',
  }));
  const d = dependencias(ss);
  atenderMensaje_(mensaje('25 en Riba Smith el 1'), d, estado);
  assert.equal(filaDe(sep, 8).FECHA, '2026-09-01');
  assert.equal(estado.anexadas.length, 2); // encabezado + el REGISTRO de la confirmación
});

test('atenderBoton_ fecha:recibo escribe el gasto en el mes del recibo (lo crea) y cierra la pregunta', () => {
  const { ss, estado } = escenario();
  guardarPregunta_(estado, filaFecha_({
    creado: AHORA,
    idMensaje: ID_ERIN,
    datos: datosGemini({
      intencion: 'GASTO', proveedor: 'Riba Smith', fecha: '2026-08-15', total: 25, clase: 'GROCERIES',
    }),
    fechaMensaje: '2026-09-27',
  }));
  const d = dependencias(ss);
  atenderBoton_({
    id: 'cb-1',
    data: `fecha:${ID_ERIN}:recibo`,
    message: { message_id: 900, date: 1790000000, chat: { id: CHAT } },
  }, d, estado);
  assert.deepEqual(d.llamadas.map(([metodo]) => metodo),
    ['answerCallbackQuery', 'editMessageReplyMarkup', 'sendMessage']);
  assert.equal(d.llamadas[2][1].chat_id, CHAT);
  assert.match(textoEnviado(d), /^<b>Gasto:<\/b> 25\.00$/m);
  const agosto = ss.getSheetByName('Agosto 2026');
  assert.ok(agosto);
  const fila = filaDe(agosto, 6);
  assert.equal(fila.FECHA, '2026-08-15');
  assert.equal(fila.PROVEEDOR, 'Riba Smith');
  assert.equal(fila['ID FACTURA'], 'RIBASMITH-20260815');
  assert.equal(celdaEstado(estado, 2, 'ESTADO'), 'CERRADA');
});

test('atenderBoton_ fecha:envio escribe el gasto con el día que el usuario lo mandó', () => {
  const { ss, sep, estado } = escenario();
  guardarPregunta_(estado, filaFecha_({
    creado: AHORA,
    idMensaje: ID_ERIN,
    datos: datosGemini({
      intencion: 'GASTO', proveedor: 'Riba Smith', fecha: '2026-08-15', total: 25, clase: 'GROCERIES',
    }),
    fechaMensaje: '2026-09-27',
  }));
  const d = dependencias(ss);
  atenderBoton_({
    id: 'cb-1',
    data: `fecha:${ID_ERIN}:envio`,
    message: { message_id: 900, date: 1790000000, chat: { id: CHAT } },
  }, d, estado);
  const fila = filaDe(sep, 8);
  assert.equal(fila.FECHA, '2026-09-27');
  assert.equal(fila['ID FACTURA'], 'RIBASMITH-20260927');
  assert.equal(celdaEstado(estado, 2, 'ESTADO'), 'CERRADA');
});

test('atenderBoton_ fecha:recibo abre una pregunta nueva si todavía falta algo (p. ej. proveedor)', () => {
  const { ss, estado } = escenario();
  guardarPregunta_(estado, filaFecha_({
    creado: AHORA,
    idMensaje: ID_ERIN,
    datos: datosGemini({ intencion: 'GASTO', fecha: '2026-08-15', total: 25, clase: 'GROCERIES' }),
    fechaMensaje: '2026-09-27',
  }));
  const d = dependencias(ss);
  atenderBoton_({
    id: 'cb-1',
    data: `fecha:${ID_ERIN}:recibo`,
    message: { message_id: 900, date: 1790000000, chat: { id: CHAT } },
  }, d, estado);
  assert.match(d.llamadas[2][1].text, /a quién le pagaste/);
  assert.equal(celdaEstado(estado, 3, 'TIPO'), 'PREGUNTA');
  assert.equal(celdaEstado(estado, 3, 'ESTADO'), 'ABIERTA');
});

test('atenderBoton_ de una fecha que ya no está abierta (o no existe) solo contesta el botón', () => {
  const { ss, sep, estado } = escenario();
  const d = dependencias(ss);
  sep.escrituras.length = 0;
  atenderBoton_({ id: 'cb-1', data: 'fecha:999:recibo', message: { message_id: 900, date: 1, chat: { id: CHAT } } }, d, estado);
  assert.equal(d.llamadas.length, 1);
  assert.equal(d.llamadas[0][0], 'answerCallbackQuery');
  assert.deepEqual(sep.escrituras, []);
});

test('atenderBoton_ con "fecha:" pero mal formado (no matchea recibo/envio) solo contesta el botón', () => {
  const { ss, estado } = escenario();
  const d = dependencias(ss);
  atenderBoton_({ id: 'cb-1', data: 'fecha:malformado', message: { message_id: 900, date: 1, chat: { id: CHAT } } }, d, estado);
  assert.equal(d.llamadas.length, 1);
  assert.equal(d.llamadas[0][0], 'answerCallbackQuery');
});

test('atenderBoton_ sin data (undefined) no lanza y lo trata como conteo desconocido', () => {
  const { ss, estado } = escenario();
  const d = dependencias(ss);
  atenderBoton_({ id: 'cb-1', message: { message_id: 900, date: 1, chat: { id: CHAT } } }, d, estado);
  assert.equal(d.llamadas.length, 1);
  assert.equal(d.llamadas[0][0], 'answerCallbackQuery');
});

test('atenderBoton_ fecha:recibo sin mensaje accesible no intenta quitar los botones', () => {
  const { ss, estado } = escenario();
  guardarPregunta_(estado, filaFecha_({
    creado: AHORA,
    idMensaje: ID_ERIN,
    datos: datosGemini({
      intencion: 'GASTO', proveedor: 'Riba Smith', fecha: '2026-08-15', total: 25, clase: 'GROCERIES',
    }),
    fechaMensaje: '2026-09-27',
  }));
  const d = dependencias(ss);
  atenderBoton_({ id: 'cb-1', data: `fecha:${ID_ERIN}:recibo`, message: { message_id: 900, date: 0, chat: { id: CHAT } } }, d, estado);
  assert.deepEqual(d.llamadas.map(([metodo]) => metodo), ['answerCallbackQuery', 'sendMessage']);
});

// --- Prueba en vivo (el usuario, 2026-09-26 21:08-21:09):, ya sin la pregunta de saldo
// inicial ---

test('flujo en vivo: gasto sin fecha, depósito sin nombre y ninguna pregunta de saldo inicial', () => {
  const { ss, sep, estado } = escenario({ filas: [GASTO_VIEJO] });
  ponerGemini([
    datosGemini({
      intencion: 'GASTO',
      proveedor: 'Riba Smith',
      clase: 'GROCERIES',
      lineas: [
        { tipo: 'ITEM', descripcion: 'compras', monto: 20, confianza: 'ALTA' },
        { tipo: 'PROPINA', descripcion: 'propina', monto: 5, confianza: 'ALTA' },
      ],
      total: 25,
    }),
    datosGemini({ intencion: 'DEPOSITO', total: 500 }),
    datosGemini({ intencion: 'SALDO_INICIAL', total: 0 }),
  ]);
  const d = dependencias(ss);

  // 1) "Riba Smith 20 + 5 propina efectivo": sin fecha, se usa la de hoy, sin preguntar.
  atenderMensaje_(mensaje('Riba Smith 20 + 5 propina efectivo'), d, estado);
  // Una sola fila: los 20 en ARTÍCULOS y los 5 de propina en OTROS CARGOS.
  const filaItem = filaDe(sep, 7);
  assert.equal(filaItem.FECHA, '2026-09-27');
  assert.equal(filaItem.REVISAR, '');
  assert.equal(filaItem['ARTÍCULOS'], 20);
  assert.equal(filaItem['OTROS CARGOS'], 5);
  assert.equal(filaItem['GASTO (USD)'], 25);
  assert.equal(filaDe(sep, 8)['ID FILA'], '');
  assert.equal(d.llamadas.length, 1); // un solo mensaje: nada de saldo inicial
  assert.equal(estado.anexadas.length, 2); // encabezado + el REGISTRO de la confirmación

  // 2) "depósito 500": Beto sin preguntar.
  atenderMensaje_(mensaje('depósito 500', { message_id: ID_ERIN + 1 }), d, estado);
  assert.equal(d.llamadas.length, 2);
  assert.match(textoEnviado(d, 1), /^<b>Depósito:<\/b> 500\.00$/m);
  assert.match(textoEnviado(d, 1), /^<b>De:<\/b> Beto$/m);

  // 3) "no había nada": el saldo inicial se registra solo si el usuario lo dice.
  atenderMensaje_(mensaje('no había nada', { message_id: ID_ERIN + 2 }), d, estado);
  assert.equal(d.llamadas.length, 3);
  assert.match(d.llamadas[2][1].text, /^Anoté el saldo inicial: 0\.00\./);
  const filaSaldo = filaDe(sep, 9);
  assert.equal(filaSaldo.TIPO, 'SALDO INICIAL');
  assert.equal(filaSaldo['DEPÓSITO'], 0);
});

// --- Cobertura de detalle (arreglo 4: las preguntas abiertas van en la
// instrucción de Gemini) ---

test('atenderMensaje_ manda a Gemini varias preguntas abiertas (ordenadas por fecha de creación)', () => {
  const { ss, estado } = escenario({ filas: [GASTO_VIEJO] });
  guardarPregunta_(estado, preguntaEstado_({
    creado: new Date(2026, 8, 25), clave: 700, preguntas: ['proveedor'], filas: [], pestana: '',
  }));
  guardarPregunta_(estado, preguntaEstado_({
    creado: new Date(2026, 8, 26), clave: 800, preguntas: ['clase'], filas: [], pestana: '',
  }));
  const pedidos = ponerGemini(datosGemini({
    intencion: 'GASTO', proveedor: 'Taxi', fecha: '2026-09-27', total: 25, clase: 'GROCERIES',
  }));
  const d = dependencias(ss);
  atenderMensaje_(mensaje('25 taxi'), d, estado);
  const cuerpo = JSON.parse(pedidos[0].opciones.payload);
  const texto = cuerpo.systemInstruction.parts[0].text;
  assert.match(texto, /preguntas sin contestar/);
  assert.match(texto, /¿Me dices a quién le pagaste\?/);
  assert.match(texto, /¿Me dices la clase de gasto\?/);
});

// --- Defecto E2: "super"/"supermercado" a la pregunta de clase ---

const GASTO_SIN_CLASE = {
  FECHA: '2026-09-26', 'ID FACTURA': 'RIBASMITH-20260926', TIPO: 'GASTO', PROVEEDOR: 'Riba Smith',
  'ARTÍCULOS': 22.5, 'GASTO (USD)': 22.5, MONEDA: 'USD', 'CLASE DE GASTO': 'PENDIENTE',
  'ID FILA': 'BOT-20260926-090000-501-1', ORIGEN: 'BOT', 'ID MENSAJE TG': 501, REGISTRADO: AHORA,
};

function conPreguntaDeClaseAbierta_(estado) {
  guardarPregunta_(estado, preguntaEstado_({
    creado: AHORA, clave: 901, preguntas: ['clase'], filas: [GASTO_SIN_CLASE], pestana: 'Septiembre 2026',
  }));
}

test('atenderMensaje_: "super" a la pregunta de clase anota GROCERIES W<semana> NORTE, aunque Gemini diga PENDIENTE', () => {
  const { ss, sep, estado } = escenario({ filas: [GASTO_SIN_CLASE] });
  conPreguntaDeClaseAbierta_(estado);
  ponerGemini(datosGemini({ intencion: 'RESPUESTA', clase: 'PENDIENTE' }));
  const d = dependencias(ss);
  atenderMensaje_(mensaje('super'), d, estado);
  assert.equal(filaDe(sep, 6)['CLASE DE GASTO'], 'GROCERIES W4 NORTE');
  assert.equal(celdaEstado(estado, 2, 'ESTADO'), 'CERRADA');
  assert.doesNotMatch(textoEnviado(d), /No me quedó claro/);
});

test('atenderMensaje_: "supermercado" a la pregunta de clase también anota GROCERIES (defecto E2)', () => {
  const { ss, sep, estado } = escenario({ filas: [GASTO_SIN_CLASE] });
  conPreguntaDeClaseAbierta_(estado);
  ponerGemini(datosGemini({ intencion: 'RESPUESTA', clase: 'PENDIENTE' }));
  const d = dependencias(ss);
  atenderMensaje_(mensaje('supermercado'), d, estado);
  assert.equal(filaDe(sep, 6)['CLASE DE GASTO'], 'GROCERIES W4 NORTE');
});

test('atenderMensaje_: "3" a la pregunta de clase anota GAS & OIL (número de la lista)', () => {
  const { ss, sep, estado } = escenario({ filas: [GASTO_SIN_CLASE] });
  conPreguntaDeClaseAbierta_(estado);
  ponerGemini(datosGemini({ intencion: 'RESPUESTA', clase: 'PENDIENTE' }));
  const d = dependencias(ss);
  atenderMensaje_(mensaje('3'), d, estado);
  assert.equal(filaDe(sep, 6)['CLASE DE GASTO'], 'GAS & OIL');
});

// --- Varias preguntas abiertas el mismo día: elegir por lo que trae la respuesta, no solo la
// más reciente (defecto reportado tras) ---

function conDosPreguntasAbiertas_(estado) {
  guardarPregunta_(estado, preguntaEstado_({
    creado: AHORA, clave: 901, preguntas: ['proveedor'], filas: [GASTO_SIN_PROVEEDOR], pestana: 'Septiembre 2026',
  }));
  guardarPregunta_(estado, preguntaEstado_({
    creado: AHORA, clave: 902, preguntas: ['total'], filas: [GASTO_SIN_TOTAL], pestana: 'Septiembre 2026',
  }));
}

test('atenderMensaje_ sin "Responder": un nombre va a la pregunta de proveedor y deja abierta la del total', () => {
  const { ss, sep, estado } = escenario({ filas: [GASTO_SIN_PROVEEDOR, GASTO_SIN_TOTAL] });
  conDosPreguntasAbiertas_(estado);
  ponerGemini(datosGemini({ intencion: 'RESPUESTA', proveedor: 'Riba Smith' }));
  const d = dependencias(ss);
  atenderMensaje_(mensaje('Riba Smith'), d, estado);
  assert.equal(filaDe(sep, 6).PROVEEDOR, 'Riba Smith');
  assert.equal(celdaEstado(estado, 2, 'ESTADO'), 'CERRADA'); // proveedor: contestada
  assert.equal(celdaEstado(estado, 3, 'ESTADO'), 'ABIERTA'); // total: sigue esperando
});

test('atenderMensaje_ sin "Responder": un monto va a la pregunta del total y deja abierta la de proveedor', () => {
  const { ss, sep, estado } = escenario({ filas: [GASTO_SIN_PROVEEDOR, GASTO_SIN_TOTAL] });
  conDosPreguntasAbiertas_(estado);
  ponerGemini(datosGemini({ intencion: 'RESPUESTA', total: 70 }));
  const d = dependencias(ss);
  atenderMensaje_(mensaje('70'), d, estado);
  assert.equal(celdaEstado(estado, 2, 'ESTADO'), 'ABIERTA'); // proveedor: sigue esperando
  assert.equal(celdaEstado(estado, 3, 'ESTADO'), 'CERRADA'); // total: contestada
  assert.equal(filaDe(sep, 7)['GASTO (USD)'], 70);
});

test('atenderMensaje_ con "Responder" cita la pregunta aunque otra sea más "elegible"', () => {
  const { ss, estado } = escenario({ filas: [GASTO_SIN_PROVEEDOR, GASTO_SIN_TOTAL] });
  conDosPreguntasAbiertas_(estado);
  // "70" sería elegible para el total, pero el mensaje cita la pregunta de proveedor (901).
  ponerGemini(datosGemini({ intencion: 'RESPUESTA', total: 70 }));
  const d = dependencias(ss);
  atenderMensaje_(mensaje('70', { reply_to_message: { message_id: 901 } }), d, estado);
  assert.match(d.llamadas[0][1].text, /No me quedó claro/);
  assert.equal(celdaEstado(estado, 2, 'ESTADO'), 'ABIERTA'); // citada, pero sin proveedor: sigue abierta
  assert.equal(celdaEstado(estado, 3, 'ESTADO'), 'ABIERTA'); // total: ni se tocó
});

// --- Acuses: ok, listo, está bien, etc. sin escribir nada ni llamar a Gemini ---

test('atenderMensaje_ con acuse ("ok", "listo") sin pregunta abierta responde con frase de ánimo y no llama Gemini', () => {
  const { ss, sep, estado } = escenario();
  const pedidos = ponerGemini(datosGemini());
  const d = dependencias(ss);
  sep.escrituras.length = 0;
  atenderMensaje_(mensaje('ok'), d, estado);
  const respuestaEsperada = fraseAnimo_(ID_ERIN);
  assert.deepEqual(d.llamadas, [['sendMessage', { chat_id: CHAT, text: respuestaEsperada }]]);
  assert.deepEqual(pedidos, []);
  assert.deepEqual(sep.escrituras, []);
  assert.equal(estado.anexadas.length, 1); // solo encabezado
});

test('atenderMensaje_ reconoce acuses variados sin llamar Gemini', () => {
  const respuestaEsperada = fraseAnimo_(ID_ERIN);
  ['listo', 'Está bien', 'GRACIAS', 'muchas gracias', 'perfecto', 'vale', '👍'].forEach((acuse) => {
    const { ss, sep, estado } = escenario();
    const pedidos = ponerGemini(datosGemini());
    const d = dependencias(ss);
    sep.escrituras.length = 0;
    atenderMensaje_(mensaje(acuse), d, estado);
    assert.deepEqual(d.llamadas, [['sendMessage', { chat_id: CHAT, text: respuestaEsperada }]], acuse);
    assert.deepEqual(pedidos, [], acuse);
    assert.deepEqual(sep.escrituras, [], acuse);
  });
});

test('atenderMensaje_ con acuse y una pregunta abierta responde el acuse + "Todavía me falta esto:" + la pregunta', () => {
  const { ss, sep, estado } = escenario({ filas: [SALDO_INICIAL, GASTO_VIEJO, GASTO_SIN_PROVEEDOR] });
  guardarPregunta_(estado, preguntaEstado_({
    creado: AHORA,
    clave: 901,
    preguntas: ['proveedor'],
    filas: [GASTO_SIN_PROVEEDOR],
    pestana: 'Septiembre 2026',
    extra: null,
  }));
  const pedidos = ponerGemini(datosGemini());
  const d = dependencias(ss);
  atenderMensaje_(mensaje('listo'), d, estado);
  const respuesta = d.llamadas[0][1].text;
  const fraseEsperada = fraseAnimo_(ID_ERIN);
  assert.match(respuesta, new RegExp(fraseEsperada.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(respuesta, /Todavía me falta esto:/);
  assert.match(respuesta, /¿Me dices a quién le pagaste/);
  assert.deepEqual(pedidos, []);
});

test('atenderMensaje_ con acuse toma la pregunta más reciente (CREADO)', () => {
  const { ss, estado } = escenario({ filas: [SALDO_INICIAL, GASTO_VIEJO, GASTO_SIN_PROVEEDOR, GASTO_SIN_TOTAL] });
  // Dos preguntas: una vieja (creada ayer) y una nueva (creada hoy)
  guardarPregunta_(estado, preguntaEstado_({
    creado: new Date(2026, 8, 26, 10, 0, 0),
    clave: 900,
    preguntas: ['clase'],
    filas: [GASTO_VIEJO],
    pestana: 'Septiembre 2026',
    extra: null,
  }));
  guardarPregunta_(estado, preguntaEstado_({
    creado: AHORA,
    clave: 901,
    preguntas: ['proveedor'],
    filas: [GASTO_SIN_PROVEEDOR],
    pestana: 'Septiembre 2026',
    extra: null,
  }));
  const pedidos = ponerGemini(datosGemini());
  const d = dependencias(ss);
  atenderMensaje_(mensaje('ok'), d, estado);
  const respuesta = d.llamadas[0][1].text;
  // Debe mencionar la pregunta de proveedor (la más reciente), no la de clase
  assert.match(respuesta, /¿Me dices a quién le pagaste/);
  assert.ok(!respuesta.includes('¿Me dices la clase'));
  assert.deepEqual(pedidos, []);
});

test('atenderMensaje_ con acuse no escribe en el Sheet ni toca _ESTADO', () => {
  const { ss, sep, estado } = escenario({ filas: [SALDO_INICIAL, GASTO_VIEJO, GASTO_SIN_PROVEEDOR] });
  guardarPregunta_(estado, preguntaEstado_({
    creado: AHORA,
    clave: 901,
    preguntas: ['proveedor'],
    filas: [GASTO_SIN_PROVEEDOR],
    pestana: 'Septiembre 2026',
    extra: null,
  }));
  ponerGemini(datosGemini());
  const d = dependencias(ss);
  sep.escrituras.length = 0;
  const estadoAntes = celdaEstado(estado, 2, 'ESTADO');
  const claveAntes = celdaEstado(estado, 2, 'CLAVE');
  atenderMensaje_(mensaje('perfecto'), d, estado);
  // No escribió en el mes
  assert.deepEqual(sep.escrituras, []);
  // No modificó la pregunta abierta
  assert.equal(celdaEstado(estado, 2, 'ESTADO'), estadoAntes);
  assert.equal(celdaEstado(estado, 2, 'CLAVE'), claveAntes);
});
