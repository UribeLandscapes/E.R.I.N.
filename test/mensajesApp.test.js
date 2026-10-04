const test = require('node:test');
const assert = require('node:assert/strict');

// En Apps Script estos nombres son globales; en Node se ponen a mano.
Object.assign(global, require('../src/Hoja.js'), require('../src/Moneda.js'));
Object.assign(global, require('../src/Hoja.js'));
Object.assign(global, require('../src/Reglas.js'));
Object.assign(global, require('../src/Escritura.js'));
Object.assign(global, require('../src/Clases.js'));
Object.assign(global, require('../src/Texto.js'));
Object.assign(global, require('../src/Botones.js'));
Object.assign(global, require('../src/Extraccion.js'));
Object.assign(global, require('../src/Moneda.js'));
Object.assign(global, require('../src/Gemini.js'));
Object.assign(global, require('../src/Groq.js'));
Object.assign(global, require('../src/GroqApp.js'));
Object.assign(global, require('../src/Mensajes.js'));
global.CONFIG = require('./configPrueba.js').CONFIG;
// Utilities.sleep de los reintentos de Gemini, sin esperar de verdad en las pruebas.
global.Utilities = { sleep: () => {} };
global.PESTANA_ESTADO = '_ESTADO';
global.PESTANA_HISTORIAL = '_HISTORIAL';
const { hojaFalsa, libroFalso, ponerFila } = require('./falsos.js');
Object.assign(global, require('../src/EscrituraApp.js'));
Object.assign(global, require('../src/HistorialApp.js'));

const { obtenerJsonRed_, resumenHoja_, leerTextoGemini_ } = require('../src/MensajesApp.js');
const { COLUMNAS_ESTADO, COLUMNAS_HISTORIAL } = require('../src/Hoja.js');
const { CONFIG } = require('./configPrueba.js');

const HOY = '2026-09-27';
const CLAVE = 'clave-de-prueba';

function respuestaFalsa(codigo, texto) {
  return { getResponseCode: () => codigo, getContentText: () => texto };
}

/** Libro con las pestañas que se le pidan; `mes` = { nombre, filas: [{columna: valor}] }. */
function libro({ meses = [], historial = null, otras = [] } = {}) {
  const hojas = meses.map(({ nombre, filas = [] }) => {
    const hoja = hojaFalsa(nombre);
    filas.forEach((valores, i) => ponerFila(hoja, 6 + i, valores));
    return hoja;
  });
  if (historial) {
    const hoja = hojaFalsa(PESTANA_HISTORIAL, { protegerDesborde: false });
    hoja.appendRow([...COLUMNAS_HISTORIAL]);
    historial.forEach((fila) => {
      const clase = typeof fila === 'string' ? fila : fila.clase;
      const proveedor = typeof fila === 'string' ? 'X' : (fila.proveedor || 'X');
      hoja.appendRow(['2026-07-01', proveedor, clase, '', 10, 'a.xlsx', 'Jul', 'k']);
    });
    hojas.push(hoja);
  }
  const estado = hojaFalsa(PESTANA_ESTADO, { protegerDesborde: false });
  estado.appendRow([...COLUMNAS_ESTADO]);
  return libroFalso([...hojas, estado, ...otras]);
}

test('obtenerJsonRed_ devuelve el JSON de un 200 y consulta con muteHttpExceptions', () => {
  let pedido;
  global.UrlFetchApp = {
    fetch: (url, opciones) => { pedido = { url, opciones }; return respuestaFalsa(200, '{"rate":1.2}'); },
  };
  assert.deepEqual(obtenerJsonRed_('https://api.ejemplo/tasa'), { rate: 1.2 });
  assert.equal(pedido.url, 'https://api.ejemplo/tasa');
  assert.equal(pedido.opciones.muteHttpExceptions, true);
  assert.equal(pedido.opciones.method, undefined);
});

test('obtenerJsonRed_ devuelve null si la fuente no tiene el dato (404)', () => {
  global.UrlFetchApp = { fetch: () => respuestaFalsa(404, 'not found') };
  assert.equal(obtenerJsonRed_('https://api.ejemplo/tasa'), null);
});

test('obtenerJsonRed_ lanza si la fuente está caída (5xx u otro código)', () => {
  global.UrlFetchApp = { fetch: () => respuestaFalsa(503, 'down') };
  assert.throws(() => obtenerJsonRed_('https://api.ejemplo/tasa'), /HTTP 503/);
  global.UrlFetchApp = { fetch: () => respuestaFalsa(403, 'no') };
  assert.throws(() => obtenerJsonRed_('https://api.ejemplo/tasa'), /HTTP 403/);
});

test('obtenerJsonRed_ lanza si no se pudo conectar o si la respuesta no es JSON', () => {
  global.UrlFetchApp = { fetch: () => { throw new Error('DNS'); } };
  assert.throws(() => obtenerJsonRed_('https://api.ejemplo/tasa'), /no se pudo consultar/);
  global.UrlFetchApp = { fetch: () => respuestaFalsa(200, '<html>') };
  assert.throws(() => obtenerJsonRed_('https://api.ejemplo/tasa'), /no devolvió JSON/);
});

test('resumenHoja_ suma depósitos menos gastos de TODAS las pestañas de mes', () => {
  const ss = libro({
    meses: [
      {
        nombre: 'Agosto 2026',
        filas: [
          { TIPO: 'SALDO INICIAL', 'DEPÓSITO': 150 },
          { TIPO: 'GASTO', 'GASTO (USD)': 60 },
        ],
      },
      { nombre: 'septiembre 2026', filas: [{ TIPO: 'DEPÓSITO', 'DEPÓSITO': 40.5 }] },
    ],
  });
  const resumen = resumenHoja_(ss);
  assert.equal(resumen.saldo, 130.5);
  assert.equal(resumen.saldoInicialDefinido, true);
});

test('resumenHoja_ cuenta 0 en celdas con texto y toma filas sin REGISTRADO', () => {
  const ss = libro({
    meses: [{
      nombre: 'Septiembre 2026',
      filas: [
        { TIPO: 'GASTO', 'GASTO (USD)': 'PENDIENTE', ORIGEN: 'BOT' },
        { TIPO: 'DEPÓSITO', 'DEPÓSITO': 25, ORIGEN: 'MANUAL' },
      ],
    }],
  });
  assert.equal(resumenHoja_(ss).saldo, 25);
});

test('resumenHoja_ sin filas ni saldo inicial devuelve 0 y saldoInicialDefinido false', () => {
  const ss = libro({ meses: [{ nombre: 'Septiembre 2026' }] });
  const resumen = resumenHoja_(ss);
  assert.equal(resumen.saldo, 0);
  assert.equal(resumen.saldoInicialDefinido, false);
  assert.deepEqual(resumen.categorias, []);
});

test('resumenHoja_ reconoce SALDO INICIAL sin importar mayúsculas ni tildes', () => {
  const ss = libro({ meses: [{ nombre: 'Septiembre 2026', filas: [{ TIPO: ' saldo inicial ', 'DEPÓSITO': 10 }] }] });
  assert.equal(resumenHoja_(ss).saldoInicialDefinido, true);
});

test('resumenHoja_ junta las categorías de las pestañas de mes y de _HISTORIAL', () => {
  const ss = libro({
    meses: [
      { nombre: 'Septiembre 2026', filas: [{ 'CLASE DE GASTO': 'GROCERIES' }, { 'CLASE DE GASTO': '' }] },
      { nombre: 'Agosto 2026', filas: [{ 'CLASE DE GASTO': 'MAINTENANCE' }, { 'CLASE DE GASTO': 'GROCERIES' }] },
    ],
    historial: ['SERVICES NORTE', 'GROCERIES'],
  });
  assert.deepEqual(resumenHoja_(ss).categorias.sort(),
    ['GROCERIES', 'MAINTENANCE', 'SERVICES NORTE']);
});

test('resumenHoja_ también devuelve proveedor y clase de cada fila de _HISTORIAL (Supuesto AB, punto G)', () => {
  const ss = libro({
    meses: [],
    historial: [
      { proveedor: 'Whole Foods', clase: 'GROCERIES' },
      { proveedor: 'WHOLEFOODS', clase: 'GROCERIES W2 NORTE' },
      { proveedor: 'IKEA', clase: 'MISCELANEOS' },
    ],
  });
  assert.deepEqual(resumenHoja_(ss).historialProveedores, [
    { proveedor: 'Whole Foods', clase: 'GROCERIES' },
    { proveedor: 'WHOLEFOODS', clase: 'GROCERIES W2 NORTE' },
    { proveedor: 'IKEA', clase: 'MISCELANEOS' },
  ]);
});

test('resumenHoja_ sin _HISTORIAL devuelve historialProveedores vacío', () => {
  const ss = libro({ meses: [] });
  assert.deepEqual(resumenHoja_(ss).historialProveedores, []);
});

test('resumenHoja_ no lee las pestañas que no son de mes y lee cada mes de una sola vez', () => {
  const ss = libro({ meses: [{ nombre: 'Septiembre 2026', filas: [{ 'DEPÓSITO': 10 }] }], otras: [hojaFalsa('Resumen')] });
  const sep = ss.getSheetByName('Septiembre 2026');
  const otra = ss.getSheetByName('Resumen');
  let lecturasSep = 0;
  let lecturasOtra = 0;
  const original = sep.getRange;
  sep.getRange = (...args) => { lecturasSep += 1; return original(...args); };
  otra.getRange = () => { lecturasOtra += 1; throw new Error('no se debe leer'); };
  assert.equal(resumenHoja_(ss).saldo, 10);
  assert.equal(lecturasSep, 1);
  assert.equal(lecturasOtra, 0);
});

test('leerTextoGemini_ llama al modelo principal con la clave en la cabecera', () => {
  let pedido;
  const datos = { legible: true, intencion: 'GASTO', total: 25, clase: 'GROCERIES', lineas: [] };
  global.UrlFetchApp = {
    fetch: (url, opciones) => {
      pedido = { url, opciones };
      return respuestaFalsa(200, JSON.stringify({
        candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(datos) }] } }],
      }));
    },
  };
  const leido = leerTextoGemini_('25 efectivo taxi', ['GROCERIES'], CLAVE, HOY);
  assert.equal(leido.ok, true);
  assert.equal(leido.datos.intencion, 'GASTO');
  assert.equal(leido.datos.total, 25);
  assert.equal(leido.datos.clase, 'GROCERIES');
  assert.equal(pedido.url, `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.MODELO_PRINCIPAL}:generateContent`);
  assert.equal(pedido.opciones.headers['x-goog-api-key'], CLAVE);
  const cuerpo = JSON.parse(pedido.opciones.payload);
  assert.match(cuerpo.systemInstruction.parts[0].text, new RegExp(HOY));
  assert.deepEqual(cuerpo.contents, [{ role: 'user', parts: [{ text: '25 efectivo taxi' }] }]);
  assert.equal(cuerpo.generationConfig.responseMimeType, 'application/json');
});

test('leerTextoGemini_ agrega los 17 grupos de clase al esquema, además de las categorías de la hoja (Supuesto AB (c))', () => {
  let pedido;
  const datos = { legible: true, intencion: 'GASTO', total: 25, clase: 'Supermercado', lineas: [] };
  global.UrlFetchApp = {
    fetch: (url, opciones) => {
      pedido = opciones;
      return respuestaFalsa(200, JSON.stringify({
        candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(datos) }] } }],
      }));
    },
  };
  const leido = leerTextoGemini_('25 super', ['GROCERIES'], CLAVE, HOY);
  const cuerpo = JSON.parse(pedido.payload);
  assert.ok(cuerpo.generationConfig.responseJsonSchema.properties.clase.enum.includes('GROCERIES'));
  assert.ok(cuerpo.generationConfig.responseJsonSchema.properties.clase.enum.includes('Supermercado'));
  assert.ok(cuerpo.generationConfig.responseJsonSchema.properties.clase.enum.includes('Varios'));
  assert.ok(cuerpo.generationConfig.responseJsonSchema.properties.clase.enum.includes('Garrafones de agua'));
  assert.ok(cuerpo.generationConfig.responseJsonSchema.properties.clase.enum.includes('SIPE'));
  assert.ok(cuerpo.generationConfig.responseJsonSchema.properties.clase.enum.includes('Décimo tercer mes'));
  // limpiarDatos_ (Extraccion.js) también acepta el nombre de grupo, no lo marca PENDIENTE.
  assert.equal(leido.ok, true);
  assert.equal(leido.datos.clase, 'Supermercado');
});

test('leerTextoGemini_ pasa las preguntas abiertas a la instrucción (Supuesto W-bis, arreglo 4)', () => {
  let pedido;
  const datos = { legible: true, intencion: 'RESPUESTA', total: 0, lineas: [] };
  global.UrlFetchApp = {
    fetch: (url, opciones) => {
      pedido = opciones;
      return respuestaFalsa(200, JSON.stringify({
        candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(datos) }] } }],
      }));
    },
  };
  leerTextoGemini_('nada', [], CLAVE, HOY, { textos: ['¿Cuánto había en la caja al empezar?'], citado: null });
  const cuerpo = JSON.parse(pedido.payload);
  assert.match(cuerpo.systemInstruction.parts[0].text, /preguntas sin contestar/);
  assert.match(cuerpo.systemInstruction.parts[0].text, /¿Cuánto había en la caja al empezar\?/);
});

test('leerTextoGemini_ trata cualquier HTTP distinto de 200 como falla', () => {
  // 429 es transitorio, así que reintenta (mismo modelo y MODELO_RELECTURA) antes de
  // darse por vencido; con los 3 intentos fallando sigue siendo una falla.
  global.UrlFetchApp = { fetch: () => respuestaFalsa(429, '{"error":{"message":"Quota exceeded"}}') };
  const leido = leerTextoGemini_('hola', [], CLAVE, HOY);
  assert.equal(leido.ok, false);
  assert.match(leido.motivo, /HTTP 429.*Quota exceeded/);
});

test('leerTextoGemini_ reintenta un HTTP 503 (alta demanda) y se recupera sin fallar', () => {
  const datos = { legible: true, intencion: 'GASTO', total: 25, clase: 'GROCERIES', lineas: [] };
  const rutas = [];
  let llamadas = 0;
  global.UrlFetchApp = {
    fetch: (url) => {
      rutas.push(url);
      llamadas += 1;
      if (llamadas === 1) return respuestaFalsa(503, '{"error":{"message":"model is overloaded"}}');
      return respuestaFalsa(200, JSON.stringify({
        candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(datos) }] } }],
      }));
    },
  };
  const leido = leerTextoGemini_('25 efectivo taxi', ['GROCERIES'], CLAVE, HOY);
  assert.equal(leido.ok, true);
  assert.equal(llamadas, 2);
  assert.ok(rutas.every((url) => url.includes(CONFIG.MODELO_PRINCIPAL)));
});

test('leerTextoGemini_ informa la falla si Gemini bloquea o contesta algo que no es JSON', () => {
  global.UrlFetchApp = { fetch: () => respuestaFalsa(200, '{"promptFeedback":{"blockReason":"SAFETY"}}') };
  assert.deepEqual(leerTextoGemini_('hola', [], CLAVE, HOY), { ok: false, motivo: 'bloqueado: SAFETY' });
  global.UrlFetchApp = {
    fetch: () => respuestaFalsa(200, JSON.stringify({
      candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'no soy JSON' }] } }],
    })),
  };
  assert.deepEqual(leerTextoGemini_('hola', [], CLAVE, HOY), { ok: false, motivo: 'el texto no es JSON' });
});

test('leerTextoGemini_ sin clave y sin conexión no lanza: devuelve la falla', () => {
  let llamadas = 0;
  global.UrlFetchApp = { fetch: () => { llamadas += 1; return respuestaFalsa(200, '{}'); } };
  const sinClave = leerTextoGemini_('hola', [], '', HOY);
  assert.equal(sinClave.ok, false);
  assert.match(sinClave.motivo, /GEMINI_API_KEY/);
  assert.equal(llamadas, 0);
  global.UrlFetchApp = { fetch: () => { throw new Error('DNS'); } };
  const sinRed = leerTextoGemini_('hola', [], CLAVE, HOY);
  assert.equal(sinRed.ok, false);
  assert.match(sinRed.motivo, /no se pudo conectar/);
});

// --- leerTextoGemini_ con el respaldo de Groq ---

const CLAVE_GROQ = 'gsk_clave-groq-de-prueba';

test('leerTextoGemini_ sin claveGroq: un HTTP fallido no intenta Groq (comportamiento de hoy)', () => {
  global.UrlFetchApp = { fetch: () => respuestaFalsa(500, '{}') };
  const leido = leerTextoGemini_('hola', [], CLAVE, HOY);
  assert.equal(leido.ok, false);
  assert.match(leido.motivo, /HTTP 500/);
});

test('leerTextoGemini_ con claveGroq: Gemini falla del todo (500) y Groq lee el texto', () => {
  const datosGroq = { legible: true, intencion: 'GASTO', total: 25, clase: 'GROCERIES', lineas: [] };
  global.UrlFetchApp = {
    fetch: (url) => (url === URL_GROQ
      ? respuestaFalsa(200, JSON.stringify({
        choices: [{ message: { content: JSON.stringify(datosGroq) }, finish_reason: 'stop' }],
      }))
      : respuestaFalsa(500, '{}')),
  };
  const leido = leerTextoGemini_('25 efectivo taxi', ['GROCERIES'], CLAVE, HOY, undefined, undefined, CLAVE_GROQ);
  assert.equal(leido.ok, true);
  assert.equal(leido.datos.total, 25);
});

test('leerTextoGemini_ con claveGroq: manda el mismo cuerpo de texto (sin imagen) a Groq', () => {
  const datosGroq = { legible: true, intencion: 'RESPUESTA', total: 0, lineas: [] };
  let pedidoGroq;
  global.UrlFetchApp = {
    fetch: (url, opciones) => {
      if (url === URL_GROQ) {
        pedidoGroq = JSON.parse(opciones.payload);
        return respuestaFalsa(200, JSON.stringify({
          choices: [{ message: { content: JSON.stringify(datosGroq) }, finish_reason: 'stop' }],
        }));
      }
      return respuestaFalsa(503, '{}');
    },
  };
  leerTextoGemini_('gasté 25 en el super', [], CLAVE, HOY, undefined, undefined, CLAVE_GROQ);
  assert.deepEqual(pedidoGroq.messages[1].content, [{ type: 'text', text: 'gasté 25 en el super' }]);
});

test('leerTextoGemini_ con claveGroq: si Groq también falla se rinde con el motivo original de Gemini', () => {
  global.UrlFetchApp = {
    fetch: (url) => (url === URL_GROQ ? respuestaFalsa(429, '{}') : respuestaFalsa(500, '{"error":{"message":"caído"}}')),
  };
  const leido = leerTextoGemini_('hola', [], CLAVE, HOY, undefined, undefined, CLAVE_GROQ);
  assert.equal(leido.ok, false);
  assert.match(leido.motivo, /HTTP 500/);
});

test('leerTextoGemini_ con claveGroq salta al respaldo con HTTP 503 sin el segundo intento a Gemini', () => {
  const datosGroq = { legible: true, intencion: 'GASTO', total: 25, clase: 'GROCERIES', lineas: [] };
  let llamadasGemini = 0;
  global.UrlFetchApp = {
    fetch: (url) => {
      if (url === URL_GROQ) {
        return respuestaFalsa(200, JSON.stringify({
          choices: [{ message: { content: JSON.stringify(datosGroq) }, finish_reason: 'stop' }],
        }));
      }
      llamadasGemini += 1;
      return respuestaFalsa(503, '{}');
    },
  };
  const leido = leerTextoGemini_('25 efectivo taxi', ['GROCERIES'], CLAVE, HOY, undefined, undefined, CLAVE_GROQ);
  assert.equal(leido.ok, true);
  assert.equal(llamadasGemini, 1);
});

test('leerTextoGemini_ con claveGroq: si Gemini responde 200 con una lectura ok:false, intenta Groq', () => {
  const datosGroq = { legible: true, intencion: 'GASTO', total: 10, clase: 'GROCERIES', lineas: [] };
  global.UrlFetchApp = {
    fetch: (url) => (url === URL_GROQ
      ? respuestaFalsa(200, JSON.stringify({
        choices: [{ message: { content: JSON.stringify(datosGroq) }, finish_reason: 'stop' }],
      }))
      : respuestaFalsa(200, JSON.stringify({
        candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'no soy JSON' }] } }],
      }))),
  };
  const leido = leerTextoGemini_('hola', [], CLAVE, HOY, undefined, undefined, CLAVE_GROQ);
  assert.equal(leido.ok, true);
  assert.equal(leido.datos.total, 10);
});
