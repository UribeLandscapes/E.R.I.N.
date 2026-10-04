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
Object.assign(global, require('../src/EdicionesApp.js'));
global.registroParaEscribir_ = () => ({ disponible: true, corte: '20260926-000000', porId: new Map() });
global.CONFIG = require('./configPrueba.js').CONFIG;
global.PESTANA_ESTADO = '_ESTADO';
global.PESTANA_HISTORIAL = '_HISTORIAL';
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
const { COLUMNAS, COLUMNAS_ESTADO, COLUMNAS_HISTORIAL } = require('../src/Hoja.js');
const { TEXTO_REGISTRO_NO_ESTA, TEXTO_BORRADO, TEXTO_NO_BORRADO } = require('../src/Registro.js');
const { registroEdiciones_,
  TEXTO_NO_BORRO_MANUAL, TEXTO_NO_CORRIJO_MANUAL } = require('../src/Ediciones.js');
const { TEXTO_CONTEO_ATENDIDO } = require('../src/Botones.js');
const { guardarPregunta_ } = require('../src/EscrituraApp.js');
const { preguntaEstado_ } = require('../src/Escritura.js');

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

const GASTO_VIEJO = { FECHA: '2026-09-02', 'ID FACTURA': 'X-20260902', TIPO: 'GASTO', 'GASTO (USD)': 60, MONEDA: 'USD', 'CLASE DE GASTO': 'GROCERIES', 'ID FILA': 'BOT-viejo-2', ORIGEN: 'BOT', REGISTRADO: AHORA };

/**
 * Libro con Septiembre 2026 y _ESTADO con solo el encabezado. `historial` (opcional) = filas
 * { proveedor, clase } para _HISTORIAL.
 */
function escenario({ filas = [GASTO_VIEJO], historial = null } = {}) {
  const sep = hojaFalsa('Septiembre 2026');
  filas.forEach((valores, i) => ponerFila(sep, 6 + i, valores));
  const estado = hojaFalsa(PESTANA_ESTADO, { protegerDesborde: false });
  estado.appendRow([...COLUMNAS_ESTADO]);
  const hojas = [sep, estado];
  if (historial) {
    const hojaHistorial = hojaFalsa(PESTANA_HISTORIAL, { protegerDesborde: false });
    hojaHistorial.appendRow([...COLUMNAS_HISTORIAL]);
    historial.forEach((h) => hojaHistorial.appendRow(['2026-07-01', h.proveedor, h.clase, '', 10, 'a.xlsx', 'Jul', 'k']));
    hojas.push(hojaHistorial);
  }
  return { sep, estado, ss: libroFalso(hojas) };
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
    propiedades: { getProperty: () => null },
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
  casa: null,
  comentario: null,
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

const celdaEstado = (estado, fila, columna) => estado.leer(fila, COLUMNAS_ESTADO.indexOf(columna) + 1);
const datosEstado = (estado, fila) => JSON.parse(celdaEstado(estado, fila, 'DATOS'));
const textoEnviado = (d, i = 0) => d.llamadas.filter(([metodo]) => metodo === 'sendMessage')[i][1].text;
/** Fila de _ESTADO (número) del primer REGISTRO con esa clave. */
function filaRegistroDe(estado, clave) {
  for (let fila = 2; fila <= estado.getLastRow(); fila += 1) {
    if (celdaEstado(estado, fila, 'TIPO') === 'REGISTRO' && celdaEstado(estado, fila, 'CLAVE') === String(clave)) return fila;
  }
  return 0;
}
const filaVacia = (hoja, numero) => COLUMNAS.every((c, i) => c === 'GRUPO'
  || hoja.leer(numero, i + 1) === '');

const GASTO_RIBA = datosGemini({
  intencion: 'GASTO', proveedor: 'Riba Smith', fecha: '2026-09-27', total: 22.5, clase: 'GROCERIES',
});

/** Anota el gasto de 22.50 de Riba Smith y devuelve el escenario ya con su REGISTRO abierto. */
function conEntrada(extracciones, datosEntrada = GASTO_RIBA, opcionesEscenario = {}) {
  const caso = escenario(opcionesEscenario);
  const pedidos = ponerGemini([datosEntrada, ...extracciones]);
  const d = dependencias(caso.ss);
  atenderMensaje_(mensaje('22.50 super Riba Smith'), d, caso.estado);
  return { ...caso, d, pedidos };
}

function conProteccion_(registro, hacer) {
  const leer = global.registroParaEscribir_;
  global.registroParaEscribir_ = () => registro;
  try { hacer(); } finally {
    global.registroParaEscribir_ = leer;
  }
}

function registroProtegido_(id, { disponible = true, corte = '20260926-000000', anotado = true } = {}) {
  return registroEdiciones_({ disponible, corte, filas: anotado
    ? [[AHORA, 'Septiembre 2026', id, 'PROVEEDOR']] : [] });
}

test('borrar pedido con celda a mano no abre botones ni cierra REGISTRO', () => {
  const { sep, estado, d } = conEntrada([BORRAR]);
  const id = filaDe(sep, 7)['ID FILA'];
  conProteccion_(registroProtegido_(id), () => {
    atenderMensaje_(mensaje('borra el último', { message_id: ID_ERIN + 1 }), d, estado);
  });
  assert.equal(textoEnviado(d, 1), TEXTO_NO_BORRO_MANUAL);
  assert.equal(filaRegistroDe(estado, 901), 2);
  assert.equal(celdaEstado(estado, 2, 'ESTADO'), 'ABIERTA');
  assert.equal(estado.getLastRow(), 2);
});

test('edición entre botones y Sí conserva filas, REGISTRO y preguntas', () => {
  const pendiente = datosGemini({ intencion: 'GASTO', fecha: '2026-09-27', total: 22.5 });
  const { sep, estado, d } = conEntrada([BORRAR], pendiente);
  atenderMensaje_(mensaje('borra el último', { message_id: ID_ERIN + 1 }), d, estado);
  const id = filaDe(sep, 7)['ID FILA'];
  conProteccion_(registroProtegido_(id), () => atenderBoton_(botonBorrar('901', true), d, estado));
  assert.equal(textoEnviado(d, 2), TEXTO_NO_BORRO_MANUAL);
  assert.equal(filaDe(sep, 7)['GASTO (USD)'], 22.5);
  assert.equal(celdaEstado(estado, 2, 'TIPO'), 'PREGUNTA');
  assert.equal(celdaEstado(estado, 2, 'ESTADO'), 'ABIERTA');
  assert.equal(celdaEstado(estado, 3, 'ESTADO'), 'ABIERTA');
  assert.equal(celdaEstado(estado, 4, 'ESTADO'), 'CERRADA');
});

test('registro ilegible o fila anterior al corte impide borrar', () => {
  for (const opciones of [{ disponible: false, anotado: false },
    { corte: '20260927-093000', anotado: false }]) {
    const { sep, estado, d } = conEntrada([BORRAR]);
    atenderMensaje_(mensaje('borra el último', { message_id: ID_ERIN + 1 }), d, estado);
    const id = filaDe(sep, 7)['ID FILA'];
    conProteccion_(registroProtegido_(id, opciones), () => atenderBoton_(botonBorrar('901', true), d, estado));
    assert.equal(textoEnviado(d, 2), TEXTO_NO_BORRO_MANUAL);
    assert.equal(filaDe(sep, 7)['GASTO (USD)'], 22.5);
  }
});

test('corrección con celda a mano conserva la fila y el REGISTRO', () => {
  const { sep, estado, d } = conEntrada([datosGemini({ intencion: 'CORREGIR', proveedor: 'Super 99' })]);
  const id = filaDe(sep, 7)['ID FILA'];
  const escrituras = sep.escrituras.length;
  conProteccion_(registroProtegido_(id), () => atenderMensaje_(
    mensaje('el proveedor es Super 99', { message_id: ID_ERIN + 1 }), d, estado,
  ));
  assert.equal(textoEnviado(d, 1), TEXTO_NO_CORRIJO_MANUAL);
  assert.equal(sep.escrituras.length, escrituras);
  assert.equal(filaDe(sep, 7).PROVEEDOR, 'Riba Smith');
  assert.equal(celdaEstado(estado, 2, 'ESTADO'), 'ABIERTA');
});

test('corregir avisa la anotación que llegó al limpiar la fila original y confirma igual', () => {
  const { sep, estado, d, ss } = conEntrada([datosGemini({ intencion: 'CORREGIR', proveedor: 'Super 99' })]);
  const id = filaDe(sep, 7)['ID FILA'];
  const ediciones = hojaFalsa('_EDICIONES', { protegerDesborde: false });
  ediciones.appendRow(['FECHA', 'PESTAÑA', 'ID FILA', 'COLUMNAS']);
  ss.hojas.push(ediciones);
  d.propiedades = { getProperty: (nombre) => nombre === PROPIEDAD_EDICIONES_CREADA ? '20260926-000000' : null };
  const rango = sep.getRange;
  let anoto = false;
  sep.getRange = (...args) => {
    const celda = rango.apply(sep, args);
    if (args[0] !== 7) return celda;
    return { ...celda, clearContent: () => {
      celda.clearContent();
      if (!anoto) {
        anoto = true;
        ediciones.appendRow([new Date(AHORA.getTime() + 1000), 'Septiembre 2026', id, 'PROVEEDOR']);
      }
    } };
  };
  const real = console.error;
  const avisos = [];
  const leer = global.registroParaEscribir_;
  global.registroParaEscribir_ = require('../src/EdicionesApp.js').registroParaEscribir_;
  console.error = (texto) => avisos.push(texto);
  try { atenderMensaje_(mensaje('el proveedor es Super 99', { message_id: ID_ERIN + 1 }), d, estado); } finally {
    console.error = real;
    global.registroParaEscribir_ = leer;
  }
  assert.ok(avisos.includes(`posible choque con edición a mano: Septiembre 2026 ${id} PROVEEDOR`));
  assert.match(textoEnviado(d, 1), /^Listo, corregí el gasto/);
});

test('una anotación en la segunda fila bloquea toda la corrección', () => {
  const { sep, estado, d } = conEntrada([datosGemini({ intencion: 'CORREGIR', proveedor: 'Super 99' })]);
  const primera = filaDe(sep, 7);
  const segundaId = 'BOT-20260927-093001-501-2';
  ponerFila(sep, 8, { ...primera, 'ID FILA': segundaId });
  estado.poner(2, COLUMNAS_ESTADO.indexOf('ID FILAS') + 1, `${primera['ID FILA']},${segundaId}`);
  const escrituras = sep.escrituras.length;
  conProteccion_(registroProtegido_(segundaId), () => atenderMensaje_(
    mensaje('el proveedor es Super 99', { message_id: ID_ERIN + 1 }), d, estado,
  ));
  assert.equal(textoEnviado(d, 1), TEXTO_NO_CORRIJO_MANUAL);
  assert.equal(sep.escrituras.length, escrituras);
  assert.equal(filaDe(sep, 7).PROVEEDOR, 'Riba Smith');
  assert.equal(filaDe(sep, 8).PROVEEDOR, 'Riba Smith');
  assert.equal(celdaEstado(estado, 2, 'ESTADO'), 'ABIERTA');
});

// --- REGISTRO de cada confirmación ---

test('la confirmación de un gasto deja un REGISTRO abierto con la clave de ese mensaje', () => {
  const { sep, estado } = conEntrada([]);
  const fila = filaRegistroDe(estado, 901);
  assert.equal(fila, 2);
  assert.equal(celdaEstado(estado, fila, 'ESTADO'), 'ABIERTA');
  assert.equal(celdaEstado(estado, fila, 'ID FILAS'), filaDe(sep, 7)['ID FILA']);
  const datos = datosEstado(estado, fila);
  assert.equal(datos.pestana, 'Septiembre 2026');
  assert.equal(datos.idFactura, 'RIBASMITH-20260927');
  assert.equal(datos.idMensaje, ID_ERIN);
  assert.equal(datos.fechaMensaje, '2026-09-27');
  assert.equal(datos.datos.proveedor, 'Riba Smith');
  assert.deepEqual(datos.resumen, { tipo: 'gasto', proveedor: 'Riba Smith', monto: 22.5, fecha: '2026-09-27' });
});

test('la confirmación con algo pendiente deja la pregunta y el REGISTRO con la misma clave', () => {
  const { estado } = conEntrada([], datosGemini({ intencion: 'GASTO', fecha: '2026-09-27', total: 25 }));
  assert.equal(celdaEstado(estado, 2, 'TIPO'), 'PREGUNTA');
  assert.equal(celdaEstado(estado, 3, 'TIPO'), 'REGISTRO');
  assert.equal(celdaEstado(estado, 2, 'CLAVE'), 901);
  assert.equal(celdaEstado(estado, 3, 'CLAVE'), '901');
});

test('un depósito también deja su REGISTRO', () => {
  const { estado } = conEntrada([], datosGemini({ intencion: 'DEPOSITO', fecha: '2026-09-27', total: 500 }));
  assert.equal(datosEstado(estado, filaRegistroDe(estado, 901)).resumen.tipo, 'deposito');
});

test('el conteo, el saldo inicial y la ayuda no dejan REGISTRO', () => {
  for (const datos of [
    datosGemini({ intencion: 'CONTEO', total: 85 }),
    datosGemini({ intencion: 'SALDO_INICIAL', total: 150 }),
    datosGemini({ intencion: 'AYUDA' }),
  ]) {
    const { estado } = conEntrada([], datos);
    assert.equal(filaRegistroDe(estado, 901), 0, datos.intencion);
  }
});

// --- CORREGIR ---

test('"de esos 22.50, 1.50 fue propina" reescribe la entrada: filas nuevas, viejas limpias', () => {
  const correccion = datosGemini({
    intencion: 'CORREGIR',
    lineas: [
      { tipo: 'ITEM', descripcion: 'compras', monto: 21, confianza: 'ALTA' },
      { tipo: 'PROPINA', descripcion: 'propina', monto: 1.5, confianza: 'ALTA' },
    ],
  });
  const { sep, estado, d } = conEntrada([correccion]);
  atenderMensaje_(mensaje('de esos 22.50, 1.50 fue propina', { message_id: ID_ERIN + 1 }), d, estado);
  // La fila vieja quedó limpia, incluidas las ocultas y CASA.
  assert.ok(filaVacia(sep, 7), JSON.stringify(filaDe(sep, 7)));
  const item = filaDe(sep, 8);
  // Una fila por factura: la propina va a OTROS CARGOS, no a una fila aparte.
  assert.ok(filaVacia(sep, 9), JSON.stringify(filaDe(sep, 9)));
  assert.equal(item['ARTÍCULOS'], 21);
  assert.equal(item['OTROS CARGOS'], 1.5);
  assert.equal(item['GASTO (USD)'], 22.5);
  assert.equal(item.TIPO, 'GASTO');
  // Mismo ID FACTURA que antes: no aparece un "-2".
  assert.equal(item['ID FACTURA'], 'RIBASMITH-20260927');
  assert.equal(item['ID MENSAJE TG'], ID_ERIN);
  assert.match(textoEnviado(d, 1), /^Listo, corregí el gasto\. Así quedó:/);
  assert.match(textoEnviado(d, 1), /^<b>Descripción:<\/b> compras; propina$/m);
  assert.match(textoEnviado(d, 1), /^<b>Desglose:<\/b> artículos 21\.00, otros cargos 1\.50$/m);
});

test('la corrección cierra el REGISTRO viejo y abre uno nuevo con las filas nuevas', () => {
  const correccion = datosGemini({ intencion: 'CORREGIR', proveedor: 'Super 99' });
  const { sep, estado, d } = conEntrada([correccion]);
  atenderMensaje_(mensaje('el proveedor es Super 99', { message_id: ID_ERIN + 1 }), d, estado);
  assert.equal(celdaEstado(estado, filaRegistroDe(estado, 901), 'ESTADO'), 'CERRADA');
  const nuevo = filaRegistroDe(estado, 902);
  assert.equal(celdaEstado(estado, nuevo, 'ESTADO'), 'ABIERTA');
  assert.equal(celdaEstado(estado, nuevo, 'ID FILAS'), filaDe(sep, 8)['ID FILA']);
  assert.equal(filaDe(sep, 8).PROVEEDOR, 'Super 99');
  assert.equal(filaDe(sep, 8)['ID FACTURA'], 'SUPER99-20260927');
  assert.equal(datosEstado(estado, nuevo).datos.proveedor, 'Super 99');
});

test('la corrección cierra las preguntas abiertas de las filas viejas', () => {
  const { sep, estado, d } = conEntrada(
    [datosGemini({ intencion: 'CORREGIR', clase: 'GROCERIES' })],
    datosGemini({ intencion: 'GASTO', proveedor: 'Riba Smith', fecha: '2026-09-27', total: 22.5 }),
  );
  assert.equal(celdaEstado(estado, 2, 'TIPO'), 'PREGUNTA');
  atenderMensaje_(mensaje('es groceries', { message_id: ID_ERIN + 1 }), d, estado);
  assert.equal(celdaEstado(estado, 2, 'ESTADO'), 'CERRADA');
  assert.equal(filaDe(sep, 8)['CLASE DE GASTO'], 'GROCERIES');
});

// --- (G) Al corregir el proveedor, deducir la clase del historial ---

test('corregir el proveedor a uno con historial claro deduce la clase (ejemplo del encargo)', () => {
  const entradaPendiente = datosGemini({
    intencion: 'GASTO', proveedor: null, fecha: '2026-09-26', casa: 'PRINCIPAL', total: 22.5,
  });
  const historial = Array.from({ length: 10 }, (_, i) => ({
    proveedor: 'Riba Smith', clase: i % 2 ? 'GROCERIES' : 'GROCERIES W2 NORTE',
  }));
  const correccion = datosGemini({ intencion: 'CORREGIR', proveedor: 'Riba Smith' });
  const { sep, estado, d } = conEntrada([correccion], entradaPendiente, { historial });
  atenderMensaje_(mensaje('el proveedor es Riba Smith', { message_id: ID_ERIN + 1 }), d, estado);
  assert.equal(filaDe(sep, 8)['CLASE DE GASTO'], 'GROCERIES W4 NORTE');
});

test('corregir el proveedor a uno con historial dividido (NOVEY) deja la clase PENDIENTE y vuelve a preguntar', () => {
  const entradaPendiente = datosGemini({ intencion: 'GASTO', proveedor: null, fecha: '2026-09-26', total: 22.5 });
  const historial = [
    { proveedor: 'Novey', clase: 'MISCELANEOS' },
    { proveedor: 'Novey', clase: 'MISCELANEOS' },
    { proveedor: 'Novey', clase: 'MAINTENANCE' },
    { proveedor: 'Novey', clase: 'MAINTENANCE' },
  ];
  const correccion = datosGemini({ intencion: 'CORREGIR', proveedor: 'Novey' });
  const { sep, estado, d } = conEntrada([correccion], entradaPendiente, { historial });
  atenderMensaje_(mensaje('el proveedor es Novey', { message_id: ID_ERIN + 1 }), d, estado);
  assert.equal(filaDe(sep, 8)['CLASE DE GASTO'], 'PENDIENTE');
  assert.match(textoEnviado(d, 1), /¿Me dices la clase de gasto\?/);
});

test('corregir el proveedor cuando la corrección también trae su propia clase no la deduce', () => {
  const entradaPendiente = datosGemini({ intencion: 'GASTO', proveedor: null, fecha: '2026-09-26', total: 22.5 });
  const historial = Array.from({ length: 5 }, () => ({ proveedor: 'Riba Smith', clase: 'GROCERIES' }));
  const correccion = datosGemini({ intencion: 'CORREGIR', proveedor: 'Riba Smith', clase: 'Farmacia y medicinas' });
  const { sep, estado, d } = conEntrada([correccion], entradaPendiente, { historial });
  atenderMensaje_(mensaje('era de Riba Smith y fue de farmacia', { message_id: ID_ERIN + 1 }), d, estado);
  // La corrección trajo su propia clase (un grupo de la lista): no se deduce del historial.
  assert.equal(filaDe(sep, 8)['CLASE DE GASTO'], 'MEDS');
});

// --- La respuesta a una pregunta queda en el REGISTRO: una corrección posterior no la deshace ---

test('una corrección de fecha conserva el proveedor que el usuario contestó antes', () => {
  const sinProveedor = datosGemini({ intencion: 'GASTO', proveedor: null, fecha: '2026-09-27', total: 22.5, clase: 'GROCERIES' });
  const respuesta = datosGemini({ intencion: 'RESPUESTA', proveedor: 'Super 99' });
  const correccion = datosGemini({ intencion: 'CORREGIR', fecha: '2026-09-26' });
  const { sep, estado, d } = conEntrada([respuesta, correccion], sinProveedor);
  atenderMensaje_(mensaje('Super 99', { message_id: ID_ERIN + 1, reply_to_message: { message_id: 901 } }), d, estado);
  assert.equal(filaDe(sep, 7).PROVEEDOR, 'Super 99');
  atenderMensaje_(mensaje('la fecha era el 26', { message_id: ID_ERIN + 2 }), d, estado);
  assert.ok(filaVacia(sep, 7), JSON.stringify(filaDe(sep, 7)));
  assert.equal(filaDe(sep, 8).PROVEEDOR, 'Super 99');
  assert.equal(filaDe(sep, 8).FECHA, '2026-09-26');
});

test('una corrección de fecha conserva la clase que el usuario contestó antes', () => {
  const sinClase = datosGemini({ intencion: 'GASTO', proveedor: 'Riba Smith', fecha: '2026-09-27', total: 22.5, clase: 'PENDIENTE' });
  const respuesta = datosGemini({ intencion: 'RESPUESTA', clase: 'Farmacia y medicinas' });
  const correccion = datosGemini({ intencion: 'CORREGIR', fecha: '2026-09-26' });
  const { sep, estado, d } = conEntrada([respuesta, correccion], sinClase);
  atenderMensaje_(mensaje('farmacia', { message_id: ID_ERIN + 1, reply_to_message: { message_id: 901 } }), d, estado);
  assert.equal(filaDe(sep, 7)['CLASE DE GASTO'], 'MEDS');
  atenderMensaje_(mensaje('la fecha era el 26', { message_id: ID_ERIN + 2 }), d, estado);
  assert.equal(filaDe(sep, 8)['CLASE DE GASTO'], 'MEDS');
  assert.equal(filaDe(sep, 8).FECHA, '2026-09-26');
});

// --- (F) Al escribir un proveedor nuevo, usar la ortografía del historial ---

test('corregir el proveedor usa la ortografía del historial (defecto de la revisión)', () => {
  const entradaPendiente = datosGemini({
    intencion: 'GASTO', proveedor: null, fecha: '2026-09-26', casa: 'PRINCIPAL', total: 22.5, clase: 'GROCERIES',
  });
  const historial = [
    { proveedor: 'Super 99', clase: 'GROCERIES' },
    { proveedor: 'Super 99', clase: 'GROCERIES' },
    { proveedor: 'SUPER 99', clase: 'GROCERIES' },
  ];
  const correccion = datosGemini({ intencion: 'CORREGIR', proveedor: 'super 99' });
  const { sep, estado, d } = conEntrada([correccion], entradaPendiente, { historial });
  atenderMensaje_(mensaje('el proveedor es super 99', { message_id: ID_ERIN + 1 }), d, estado);
  assert.equal(filaDe(sep, 8).PROVEEDOR, 'Super 99');
});

test('responder la pregunta de proveedor usa la ortografía del historial (defecto de la revisión)', () => {
  const historial = [{ proveedor: 'Riba Smith', clase: 'GROCERIES' }, { proveedor: 'Riba Smith', clase: 'GROCERIES' }];
  const { sep, estado, ss } = escenario({ filas: [], historial });
  const sinProveedor = datosGemini({ intencion: 'GASTO', fecha: '2026-09-27', total: 22.5, clase: 'GROCERIES' });
  const d = dependencias(ss);
  ponerGemini(sinProveedor);
  atenderMensaje_(mensaje('22.50 super'), d, estado);
  ponerGemini(datosGemini({ intencion: 'RESPUESTA', proveedor: 'riba smith' }));
  atenderMensaje_(mensaje('riba smith', { message_id: ID_ERIN + 1, reply_to_message: { message_id: 901 } }), d, estado);
  assert.equal(filaDe(sep, 6).PROVEEDOR, 'Riba Smith');
});

test('corregir algo que no es el proveedor no toca la clase que ya estaba', () => {
  const { sep, estado, d } = conEntrada([datosGemini({ intencion: 'CORREGIR', total: 30 })]);
  atenderMensaje_(mensaje('el total eran 30', { message_id: ID_ERIN + 1 }), d, estado);
  assert.equal(filaDe(sep, 8)['CLASE DE GASTO'], 'GROCERIES');
});

test('responder a la confirmación con el cambio corrige esa entrada (Supuesto T y AA (3))', () => {
  // Gemini la lee como un gasto nuevo; al responder a la confirmación es una corrección.
  const comoGasto = datosGemini({
    intencion: 'GASTO', proveedor: 'Riba Smith', fecha: '2026-09-27', total: 22.5, forma_pago: 'TARJETA',
  });
  const { sep, estado, d } = conEntrada([comoGasto]);
  atenderMensaje_(mensaje('la forma de pago es tarjeta', {
    message_id: ID_ERIN + 1, reply_to_message: { message_id: 901, text: 'Listo, agregué el gasto' },
  }), d, estado);
  assert.ok(filaVacia(sep, 7));
  assert.equal(filaDe(sep, 8)['FORMA DE PAGO'], 'TARJETA');
  assert.match(textoEnviado(d, 1), /^Listo, corregí el gasto\. Así quedó:/);
});

test('sin "Responder", CORREGIR va a la última entrada', () => {
  const caso = escenario();
  ponerGemini([
    GASTO_RIBA,
    datosGemini({ intencion: 'DEPOSITO', fecha: '2026-09-27', total: 500 }),
    datosGemini({ intencion: 'CORREGIR', total: 400 }),
  ]);
  const d = dependencias(caso.ss);
  atenderMensaje_(mensaje('22.50 super Riba Smith'), d, caso.estado);
  atenderMensaje_(mensaje('me depositaron 500', { message_id: ID_ERIN + 1 }), d, caso.estado);
  atenderMensaje_(mensaje('corrige el último: eran 400', { message_id: ID_ERIN + 2 }), d, caso.estado);
  // El gasto no se tocó; el depósito quedó corregido.
  assert.equal(filaDe(caso.sep, 7)['GASTO (USD)'], 22.5);
  assert.ok(filaVacia(caso.sep, 8));
  assert.equal(filaDe(caso.sep, 9)['DEPÓSITO'], 400);
  assert.match(textoEnviado(d, 2), /^Listo, corregí el depósito\. Así quedó:/);
});

test('CORREGIR sin ninguna entrada registrada avisa y no escribe nada', () => {
  const { ss, sep, estado } = escenario();
  ponerGemini(datosGemini({ intencion: 'CORREGIR', total: 30 }));
  const d = dependencias(ss);
  sep.escrituras.length = 0;
  atenderMensaje_(mensaje('corrige el último: eran 30'), d, estado);
  assert.deepEqual(d.llamadas, [['sendMessage', { chat_id: CHAT, text: TEXTO_REGISTRO_NO_ESTA }]]);
  assert.deepEqual(sep.escrituras, []);
  assert.equal(estado.anexadas.length, 1);
});

test('CORREGIR cuando las filas ya no están en la hoja avisa y cierra el REGISTRO', () => {
  const { sep, estado, d } = conEntrada([datosGemini({ intencion: 'CORREGIR', total: 30 })]);
  // Alguien borró la fila a mano en la hoja.
  COLUMNAS.forEach((c, i) => sep.poner(7, i + 1, ''));
  atenderMensaje_(mensaje('corrige el último: eran 30', { message_id: ID_ERIN + 1 }), d, estado);
  assert.equal(textoEnviado(d, 1), TEXTO_REGISTRO_NO_ESTA);
  assert.equal(celdaEstado(estado, filaRegistroDe(estado, 901), 'ESTADO'), 'CERRADA');
});

test('CORREGIR que deja la entrada sin monto no toca las filas viejas', () => {
  const { sep, estado, d } = conEntrada([datosGemini({ intencion: 'CORREGIR', lineas: [{ tipo: 'ITEM', descripcion: 'x', monto: null, confianza: 'BAJA' }] })]);
  atenderMensaje_(mensaje('cámbialo', { message_id: ID_ERIN + 1 }), d, estado);
  assert.equal(filaDe(sep, 7)['GASTO (USD)'], 22.5);
  assert.match(textoEnviado(d, 1), /monto/);
});

test('"corrige el último, el total eran 22.50" ajusta la línea única al nuevo total (defecto E1)', () => {
  // "25 efectivo": Gemini devuelve el total y una sola línea con ese mismo monto.
  const UNA_LINEA = datosGemini({
    intencion: 'GASTO', proveedor: 'Riba Smith', fecha: '2026-09-27', total: 25, clase: 'GROCERIES',
    lineas: [{ tipo: 'ITEM', descripcion: 'efectivo', monto: 25, confianza: 'ALTA' }],
  });
  const correccion = datosGemini({ intencion: 'CORREGIR', total: 22.5 });
  const { sep, estado, d } = conEntrada([correccion], UNA_LINEA);
  atenderMensaje_(mensaje('corrige el último, el total eran 22.50', { message_id: ID_ERIN + 1 }), d, estado);
  const item = filaDe(sep, 8);
  assert.equal(item['GASTO (USD)'], 22.5);
  assert.equal(item['ARTÍCULOS'], 22.5);
  assert.match(textoEnviado(d, 1), /^<b>Gasto:<\/b> 22\.50$/m);
});

test('una fila ajena (ORIGEN a mano) no se corrige', () => {
  const { sep, estado, d } = conEntrada([datosGemini({ intencion: 'CORREGIR', total: 30 })]);
  ponerFila(sep, 7, { ORIGEN: 'MANUAL' });
  atenderMensaje_(mensaje('corrige el último: eran 30', { message_id: ID_ERIN + 1 }), d, estado);
  assert.equal(textoEnviado(d, 1), TEXTO_REGISTRO_NO_ESTA);
  assert.equal(filaDe(sep, 7)['GASTO (USD)'], 22.5);
});

test('responder a la confirmación sin nada claro no reescribe nada y pide que lo repita', () => {
  const { sep, estado, d } = conEntrada([datosGemini({ intencion: 'OTRO' })]);
  atenderMensaje_(mensaje('mmm', {
    message_id: ID_ERIN + 1, reply_to_message: { message_id: 901, text: 'Listo, agregué el gasto' },
  }), d, estado);
  assert.equal(filaDe(sep, 7)['GASTO (USD)'], 22.5);
  assert.ok(filaVacia(sep, 8));
  assert.match(textoEnviado(d, 1), /^No entendí bien\./);
  assert.equal(celdaEstado(estado, filaRegistroDe(estado, 901), 'ESTADO'), 'ABIERTA');
});

test('responder a la confirmación con un conteo cuenta la caja, no corrige', () => {
  const conteo = datosGemini({ intencion: 'CONTEO', total: 85 });
  const { sep, estado, d } = conEntrada([conteo]);
  atenderMensaje_(mensaje('tengo 85', {
    message_id: ID_ERIN + 1, reply_to_message: { message_id: 901, text: 'Listo, agregué el gasto' },
  }), d, estado);
  assert.equal(filaDe(sep, 7)['GASTO (USD)'], 22.5);
  assert.match(textoEnviado(d, 1), /sistema calcula/);
});

test('una respuesta que cita una pregunta abierta sigue siendo respuesta, no corrección', () => {
  // La fila 7 (GASTO_VIEJO) es la que le da a Gemini la categoría GROCERIES de la lista cerrada.
  const { ss, sep, estado } = escenario({
    filas: [{ ...GASTO_VIEJO, 'ID FILA': 'BOT-20260927-093000-1-1', 'CLASE DE GASTO': 'PENDIENTE' }, GASTO_VIEJO],
  });
  guardarPregunta_(estado, preguntaEstado_({
    creado: AHORA,
    clave: 901,
    preguntas: ['clase'],
    filas: [{ ...filaDe(sep, 6), 'ID FILA': 'BOT-20260927-093000-1-1' }],
    pestana: 'Septiembre 2026',
    extra: null,
  }));
  ponerGemini(datosGemini({ intencion: 'RESPUESTA', clase: 'GROCERIES' }));
  const d = dependencias(ss);
  atenderMensaje_(mensaje('groceries', { reply_to_message: { message_id: 901, text: '¿Me dices la clase de gasto?' } }), d, estado);
  assert.equal(filaDe(sep, 6)['CLASE DE GASTO'], 'GROCERIES');
  assert.match(textoEnviado(d), /^Listo, lo anoté\./);
});

test('la instrucción de Gemini lleva los detalles de la entrada a la que apunta una corrección', () => {
  const { pedidos, estado, d } = conEntrada([datosGemini({ intencion: 'CORREGIR', total: 30 })]);
  atenderMensaje_(mensaje('corrige el último: eran 30', { message_id: ID_ERIN + 1 }), d, estado);
  const cuerpo = JSON.parse(pedidos[1].opciones.payload);
  const instruccion = cuerpo.systemInstruction.parts[0].text;
  assert.match(instruccion, /última entrada que el bot registró/);
  assert.match(instruccion, /proveedor: Riba Smith/);
  assert.match(instruccion, /total: 22\.5/);
  assert.match(instruccion, /clase de gasto: GROCERIES/);
  assert.match(instruccion, /- CORREGIR:/);
  assert.match(instruccion, /- BORRAR:/);
});

test('sin ninguna entrada registrada la instrucción no habla de correcciones', () => {
  const { ss, estado } = escenario();
  const pedidos = ponerGemini(GASTO_RIBA);
  atenderMensaje_(mensaje('22.50 super Riba Smith'), dependencias(ss), estado);
  const instruccion = JSON.parse(pedidos[0].opciones.payload).systemInstruction.parts[0].text;
  assert.ok(!instruccion.includes('última entrada que el bot registró'), instruccion);
});

// --- BORRAR con botones ---

const BORRAR = datosGemini({ intencion: 'BORRAR' });
const botonBorrar = (clave, si, extra = {}) => ({
  id: 'cb-1',
  data: `borrar:${clave}:${si ? 'si' : 'no'}`,
  message: { message_id: 950, date: 1790000000, chat: { id: CHAT } },
  ...extra,
});

test('"borra el último" pregunta con los dos botones y no borra nada todavía', () => {
  const { sep, estado, d } = conEntrada([BORRAR]);
  atenderMensaje_(mensaje('borra el último', { message_id: ID_ERIN + 1 }), d, estado);
  assert.equal(textoEnviado(d, 1), '¿Segura que quieres borrar el gasto de Riba Smith por 22.50 del 27/09/2026?');
  assert.deepEqual(d.llamadas[1][1].reply_markup.inline_keyboard[0].map((b) => b.text), ['Sí, bórralo', 'No, déjalo']);
  assert.equal(filaDe(sep, 7)['GASTO (USD)'], 22.5);
  assert.equal(celdaEstado(estado, 3, 'TIPO'), 'BORRAR');
  assert.equal(celdaEstado(estado, 3, 'CLAVE'), '901');
});

test('"Sí, bórralo" limpia las filas del bot, cierra el REGISTRO y avisa', () => {
  const { sep, estado, d } = conEntrada([BORRAR]);
  atenderMensaje_(mensaje('borra el último', { message_id: ID_ERIN + 1 }), d, estado);
  atenderBoton_(botonBorrar('901', true), d, estado);
  assert.deepEqual(d.llamadas.slice(2).map(([metodo]) => metodo),
    ['answerCallbackQuery', 'editMessageReplyMarkup', 'sendMessage']);
  assert.equal(textoEnviado(d, 2), TEXTO_BORRADO);
  assert.ok(filaVacia(sep, 7), JSON.stringify(filaDe(sep, 7)));
  assert.equal(celdaEstado(estado, filaRegistroDe(estado, 901), 'ESTADO'), 'CERRADA');
  assert.equal(celdaEstado(estado, 3, 'ESTADO'), 'CERRADA');
});

test('"No, déjalo" no borra nada y lo dice', () => {
  const { sep, estado, d } = conEntrada([BORRAR]);
  atenderMensaje_(mensaje('borra el último', { message_id: ID_ERIN + 1 }), d, estado);
  atenderBoton_(botonBorrar('901', false), d, estado);
  assert.equal(textoEnviado(d, 2), TEXTO_NO_BORRADO);
  assert.equal(filaDe(sep, 7)['GASTO (USD)'], 22.5);
  assert.equal(celdaEstado(estado, filaRegistroDe(estado, 901), 'ESTADO'), 'ABIERTA');
  assert.equal(celdaEstado(estado, 3, 'ESTADO'), 'CERRADA');
});

test('un botón de borrar ya atendido solo contesta, sin volver a borrar', () => {
  const { estado, d } = conEntrada([BORRAR]);
  atenderMensaje_(mensaje('borra el último', { message_id: ID_ERIN + 1 }), d, estado);
  atenderBoton_(botonBorrar('901', true), d, estado);
  const cuantas = d.llamadas.length;
  atenderBoton_(botonBorrar('901', true), d, estado);
  assert.deepEqual(d.llamadas.slice(cuantas),
    [['answerCallbackQuery', { callback_query_id: 'cb-1', text: TEXTO_CONTEO_ATENDIDO }]]);
});

test('un botón de borrar de una clave desconocida solo contesta', () => {
  const { estado, d } = conEntrada([BORRAR]);
  atenderBoton_(botonBorrar('999', true), d, estado);
  assert.deepEqual(d.llamadas.slice(1),
    [['answerCallbackQuery', { callback_query_id: 'cb-1', text: TEXTO_CONTEO_ATENDIDO }]]);
});

test('"Sí, bórralo" cuando las filas ya no están avisa y no borra nada', () => {
  const { sep, estado, d } = conEntrada([BORRAR]);
  atenderMensaje_(mensaje('borra el último', { message_id: ID_ERIN + 1 }), d, estado);
  COLUMNAS.forEach((c, i) => sep.poner(7, i + 1, ''));
  atenderBoton_(botonBorrar('901', true), d, estado);
  assert.equal(textoEnviado(d, 2), TEXTO_REGISTRO_NO_ESTA);
  assert.equal(celdaEstado(estado, filaRegistroDe(estado, 901), 'ESTADO'), 'CERRADA');
});

test('"Sí, bórralo" de un REGISTRO ya cerrado avisa que no lo encontró', () => {
  const { estado, d } = conEntrada([BORRAR]);
  atenderMensaje_(mensaje('borra el último', { message_id: ID_ERIN + 1 }), d, estado);
  estado.poner(filaRegistroDe(estado, 901), COLUMNAS_ESTADO.indexOf('ESTADO') + 1, 'CERRADA');
  atenderBoton_(botonBorrar('901', true), d, estado);
  assert.equal(textoEnviado(d, 2), TEXTO_REGISTRO_NO_ESTA);
});

test('un botón de borrar sin mensaje accesible no intenta quitar los botones', () => {
  const { estado, d } = conEntrada([BORRAR]);
  atenderMensaje_(mensaje('borra el último', { message_id: ID_ERIN + 1 }), d, estado);
  atenderBoton_(botonBorrar('901', false, { message: { message_id: 950, date: 0, chat: { id: CHAT } } }), d, estado);
  assert.deepEqual(d.llamadas.slice(2).map(([metodo]) => metodo), ['answerCallbackQuery', 'sendMessage']);
});

test('responder "borrar" a una confirmación pregunta por esa entrada', () => {
  const { estado, d } = conEntrada([BORRAR]);
  atenderMensaje_(mensaje('borrar', {
    message_id: ID_ERIN + 1, reply_to_message: { message_id: 901, text: 'Listo, agregué el gasto' },
  }), d, estado);
  assert.match(textoEnviado(d, 1), /^¿Segura que quieres borrar el gasto de Riba Smith/);
});

// --- Atajo de "borrar" sin Gemini ---

test('atajo: "borrar" solo, citando una confirmación con REGISTRO abierto, pide confirmar sin llamar a Gemini', () => {
  const { estado, d, pedidos } = conEntrada([BORRAR]);
  const antes = pedidos.length;
  atenderMensaje_(mensaje('borrar', {
    message_id: ID_ERIN + 1, reply_to_message: { message_id: 901, text: 'Listo, agregué el gasto' },
  }), d, estado);
  assert.equal(pedidos.length, antes, 'no debió llamar a Gemini');
  assert.match(textoEnviado(d, 1), /^¿Segura que quieres borrar el gasto de Riba Smith/);
  assert.equal(celdaEstado(estado, 3, 'TIPO'), 'BORRAR');
  assert.equal(celdaEstado(estado, 3, 'CLAVE'), '901');
});

test('atajo: usa el registro sano real y no lo marca perdido', () => {
  const { ss, estado, d } = conEntrada([BORRAR]);
  const ediciones = hojaFalsa('_EDICIONES', { protegerDesborde: false });
  ediciones.appendRow(['FECHA', 'PESTAÑA', 'ID FILA', 'COLUMNAS']);
  ss.hojas.push(ediciones);
  const valores = new Map([['EDICIONES_CREADA', '20260926-000000']]);
  const propiedades = {
    getProperty: (clave) => valores.get(clave) || null,
    setProperty: (clave, valor) => valores.set(clave, valor),
  };
  const leer = global.registroParaEscribir_;
  global.registroParaEscribir_ = require('../src/EdicionesApp.js').registroParaEscribir_;
  try {
    atenderMensaje_(mensaje('borrar', {
      message_id: ID_ERIN + 1, reply_to_message: { message_id: 901, text: 'Listo, agregué el gasto' },
    }), { ...d, propiedades, sello: () => SELLO }, estado);
  } finally {
    global.registroParaEscribir_ = leer;
  }
  assert.match(textoEnviado(d, 1), /^¿Segura que quieres borrar el gasto de Riba Smith/);
  assert.equal(propiedades.getProperty('EDICIONES_PERDIDA'), null);
});

test('atajo: variaciones con mayúsculas/tildes/puntuación también piden confirmar sin Gemini', () => {
  const { estado, d, pedidos } = conEntrada([BORRAR]);
  const antes = pedidos.length;
  atenderMensaje_(mensaje(' Bórralo! ', {
    message_id: ID_ERIN + 1, reply_to_message: { message_id: 901, text: 'Listo, agregué el gasto' },
  }), d, estado);
  assert.equal(pedidos.length, antes, 'no debió llamar a Gemini');
  assert.match(textoEnviado(d, 1), /^¿Segura que quieres borrar el gasto de Riba Smith/);
});

test('atajo: funciona aunque Gemini esté caído (no lo necesita)', () => {
  const { sep, estado, d } = conEntrada([]);
  // Gemini quedaría sin más respuestas en la cola: si el atajo lo llamara, esto fallaría.
  global.UrlFetchApp = { fetch: () => { throw new Error('Gemini no debería llamarse'); } };
  atenderMensaje_(mensaje('borrar', {
    message_id: ID_ERIN + 1, reply_to_message: { message_id: 901, text: 'Listo, agregué el gasto' },
  }), d, estado);
  assert.match(textoEnviado(d, 1), /^¿Segura que quieres borrar el gasto de Riba Smith/);
  assert.equal(filaDe(sep, 7)['GASTO (USD)'], 22.5); // nada se borró todavía, falta el botón "Sí"
});

test('atajo: bare "borrar" sin citar nada pide confirmar el borrado de la última entrada, sin Gemini', () => {
  const { estado, d, pedidos } = conEntrada([BORRAR]);
  const antes = pedidos.length;
  atenderMensaje_(mensaje('borrar', { message_id: ID_ERIN + 1 }), d, estado);
  assert.equal(pedidos.length, antes, 'no debió llamar a Gemini');
  assert.match(textoEnviado(d, 1), /^¿Segura que quieres borrar el gasto de Riba Smith/);
  assert.equal(celdaEstado(estado, 3, 'TIPO'), 'BORRAR');
  assert.equal(celdaEstado(estado, 3, 'CLAVE'), '901');
});

test('atajo: bare "borrar" funciona aunque Gemini esté caído', () => {
  const { sep, estado, d } = conEntrada([]);
  // Gemini quedaría sin más respuestas en la cola: si el atajo lo llamara, esto fallaría.
  global.UrlFetchApp = { fetch: () => { throw new Error('Gemini no debería llamarse'); } };
  atenderMensaje_(mensaje('borrar', { message_id: ID_ERIN + 1 }), d, estado);
  assert.match(textoEnviado(d, 1), /^¿Segura que quieres borrar el gasto de Riba Smith/);
  assert.equal(filaDe(sep, 7)['GASTO (USD)'], 22.5); // nada se borró todavía, falta el botón "Sí"
});

test('atajo: bare "borrar" sin ninguna entrada registrada avisa y no escribe nada, sin Gemini', () => {
  const { ss, sep, estado } = escenario();
  global.UrlFetchApp = { fetch: () => { throw new Error('Gemini no debería llamarse'); } };
  const d = dependencias(ss);
  sep.escrituras.length = 0;
  atenderMensaje_(mensaje('borrar'), d, estado);
  assert.deepEqual(d.llamadas, [['sendMessage', { chat_id: CHAT, text: TEXTO_REGISTRO_NO_ESTA }]]);
  assert.deepEqual(sep.escrituras, []);
});

test('atajo: bare "borrar" sin citar nada, con dos entradas registradas, pide confirmar la más nueva', () => {
  const caso = escenario();
  const pedidos = ponerGemini([GASTO_RIBA, datosGemini({ intencion: 'DEPOSITO', fecha: '2026-09-27', total: 500 })]);
  const d = dependencias(caso.ss);
  atenderMensaje_(mensaje('22.50 super Riba Smith'), d, caso.estado);
  atenderMensaje_(mensaje('me depositaron 500', { message_id: ID_ERIN + 1 }), d, caso.estado);
  const antes = pedidos.length;
  atenderMensaje_(mensaje('borrar', { message_id: ID_ERIN + 2 }), d, caso.estado);
  assert.equal(pedidos.length, antes, 'no debió llamar a Gemini');
  assert.match(textoEnviado(d, 2), /^¿Segura que quieres borrar el depósito de Beto por 500\.00/);
});

test('"borra el de ayer" citando una confirmación sigue el camino de Gemini (texto con más palabras)', () => {
  const { estado, d, pedidos } = conEntrada([BORRAR]);
  const antes = pedidos.length;
  atenderMensaje_(mensaje('borra el de ayer', {
    message_id: ID_ERIN + 1, reply_to_message: { message_id: 901, text: 'Listo, agregué el gasto' },
  }), d, estado);
  assert.equal(pedidos.length, antes + 1, 'debió llamar a Gemini');
  assert.match(textoEnviado(d, 1), /^¿Segura que quieres borrar el gasto de Riba Smith/);
});

test('"borrar" citando un mensaje sin REGISTRO abierto sigue el camino de Gemini', () => {
  const { estado, d, pedidos } = conEntrada([BORRAR]);
  const antes = pedidos.length;
  atenderMensaje_(mensaje('borrar', {
    message_id: ID_ERIN + 1, reply_to_message: { message_id: 999999, text: 'otro mensaje' },
  }), d, estado);
  assert.equal(pedidos.length, antes + 1, 'debió llamar a Gemini porque el citado no tiene REGISTRO abierto');
  assert.match(textoEnviado(d, 1), /^¿Segura que quieres borrar el gasto de Riba Smith/);
});

test('BORRAR sin ninguna entrada registrada avisa y no escribe nada', () => {
  const { ss, sep, estado } = escenario();
  ponerGemini(BORRAR);
  const d = dependencias(ss);
  sep.escrituras.length = 0;
  atenderMensaje_(mensaje('borra el último'), d, estado);
  assert.deepEqual(d.llamadas, [['sendMessage', { chat_id: CHAT, text: TEXTO_REGISTRO_NO_ESTA }]]);
  assert.deepEqual(sep.escrituras, []);
});

test('borrar un depósito también limpia su fila', () => {
  const { sep, estado, d } = conEntrada([BORRAR], datosGemini({ intencion: 'DEPOSITO', fecha: '2026-09-27', total: 500 }));
  atenderMensaje_(mensaje('borra el último', { message_id: ID_ERIN + 1 }), d, estado);
  assert.match(textoEnviado(d, 1), /^¿Segura que quieres borrar el depósito de Beto por 500\.00/);
  atenderBoton_(botonBorrar('901', true), d, estado);
  assert.ok(filaVacia(sep, 7));
});

// --- CORREGIR y BORRAR ganan a una pregunta abierta citada, aunque la confirmación diga "(falta)" ---

test('responder "borrar" a una confirmación con "(falta)" pide confirmar el borrado, no repite la pregunta', () => {
  const incompleto = datosGemini({ intencion: 'GASTO', fecha: '2026-09-27', total: 25 });
  const { sep, estado, d } = conEntrada([BORRAR], incompleto);
  atenderMensaje_(mensaje('borrar', {
    message_id: ID_ERIN + 1, reply_to_message: { message_id: 901, text: 'Listo, agregué el gasto' },
  }), d, estado);
  assert.match(textoEnviado(d, 1), /^¿Segura que quieres borrar el gasto/);
  assert.deepEqual(d.llamadas[1][1].reply_markup.inline_keyboard[0].map((b) => b.text), ['Sí, bórralo', 'No, déjalo']);
  // Nada se borra todavía: hace falta el botón "Sí".
  assert.equal(filaDe(sep, 7)['GASTO (USD)'], 25);
  const ultima = estado.getLastRow();
  assert.equal(celdaEstado(estado, ultima, 'TIPO'), 'BORRAR');
  assert.equal(celdaEstado(estado, ultima, 'CLAVE'), '901');
});

test('corregir la forma de pago de una confirmación con "(falta)" corrige eso y vuelve a preguntar lo que falta', () => {
  const incompleto = datosGemini({ intencion: 'GASTO', fecha: '2026-09-27', total: 25 });
  const cambioFormaPago = datosGemini({ intencion: 'CORREGIR', forma_pago: 'TARJETA' });
  const { sep, estado, d } = conEntrada([cambioFormaPago], incompleto);
  atenderMensaje_(mensaje('la forma de pago es tarjeta', {
    message_id: ID_ERIN + 1, reply_to_message: { message_id: 901, text: 'Listo, agregué el gasto' },
  }), d, estado);
  assert.ok(filaVacia(sep, 7), JSON.stringify(filaDe(sep, 7)));
  assert.equal(filaDe(sep, 8)['FORMA DE PAGO'], 'TARJETA');
  assert.match(textoEnviado(d, 1), /^<b>Proveedor:<\/b> \(falta\)$/m);
});

test('responder el dato que falta a una confirmación con "(falta)" sigue contestando la pregunta abierta', () => {
  const incompleto = datosGemini({ intencion: 'GASTO', fecha: '2026-09-27', total: 25 });
  const respuesta = datosGemini({ intencion: 'RESPUESTA', proveedor: 'Super 99' });
  const { sep, estado, d } = conEntrada([respuesta], incompleto);
  atenderMensaje_(mensaje('el proveedor es Super 99', {
    message_id: ID_ERIN + 1, reply_to_message: { message_id: 901, text: 'Listo, agregué el gasto' },
  }), d, estado);
  assert.equal(filaDe(sep, 7).PROVEEDOR, 'Super 99');
  assert.match(textoEnviado(d, 1), /^Listo, lo anoté\./);
});
