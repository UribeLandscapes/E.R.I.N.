const test = require('node:test');
const assert = require('node:assert/strict');

// En Apps Script estos nombres son globales; en Node se ponen a mano.
global.MESES = require('../src/Hoja.js').MESES;
Object.assign(global, require('../src/Hoja.js'));
Object.assign(global, require('../src/Reglas.js'));
Object.assign(global, require('../src/Escritura.js'));
Object.assign(global, require('../src/Clases.js'));
Object.assign(global, require('../src/Texto.js'));
Object.assign(global, require('../src/Botones.js'));
global.CONFIG = require('./configPrueba.js').CONFIG;
global.PESTANA_ESTADO = '_ESTADO';
const { hojaFalsa, libroFalso, filaDe, ponerFila } = require('./falsos.js');

Object.assign(global, require('../src/EscrituraApp.js'));

const { abrirConteo_, atenderBotonConteo_ } = require('../src/BotonesApp.js');
const { COLUMNAS_ESTADO } = require('../src/Hoja.js');
const { TEXTO_CONTEO_ATENDIDO, TEXTO_SIN_AJUSTE, tecladoConteo_ } = require('../src/Botones.js');

const AHORA = new Date(2026, 8, 27, 9, 30, 0);
const SELLO = '20260927-093000';
const CHAT = 12345;

const opciones = (cambios) => ({
  saldoAhora: 90, fechaMensaje: '2026-09-27', sello: SELLO, ahora: AHORA, chatId: CHAT, ...cambios,
});

const boton = (data, mensaje = { message_id: 900, date: 1790500000, chat: { id: CHAT } }) => ({
  id: 'cb-1', data, message: mensaje,
});

/** Libro con Septiembre 2026 y _ESTADO (encabezado + conteo abierto 85 contra 90 en la fila 2). */
function escenario({ estadoConteo = 'ABIERTA' } = {}) {
  const sep = hojaFalsa('Septiembre 2026');
  const estado = hojaFalsa('_ESTADO', { protegerDesborde: false });
  estado.appendRow([...COLUMNAS_ESTADO]);
  const ss = libroFalso([sep, estado]);
  abrirConteo_(estado, { idMensaje: 501, contado: 85, saldo: 90 }, AHORA);
  if (estadoConteo !== 'ABIERTA') estado.poner(2, COLUMNAS_ESTADO.indexOf('ESTADO') + 1, estadoConteo);
  return { ss, sep, estado };
}

const celda = (estado, columna) => estado.leer(2, COLUMNAS_ESTADO.indexOf(columna) + 1);

test('abrirConteo_ agrega el conteo abierto al final de _ESTADO', () => {
  const { estado } = escenario();
  assert.equal(celda(estado, 'TIPO'), 'CONTEO');
  assert.equal(celda(estado, 'CLAVE'), '501');
  assert.equal(celda(estado, 'CREADO'), AHORA);
  assert.deepEqual(JSON.parse(celda(estado, 'DATOS')), { idMensaje: 501, contado: 85, saldo: 90 });
  assert.equal(celda(estado, 'ESTADO'), 'ABIERTA');
});

test('abrirConteo_ solo escribe en _ESTADO', () => {
  assert.throws(() => abrirConteo_(hojaFalsa('Septiembre 2026'), { idMensaje: 1, contado: 1, saldo: 2 }, AHORA),
    /_ESTADO/);
});

test('atenderBotonConteo_ con Sí escribe la fila AJUSTE, cierra el conteo y quita los botones', () => {
  const { ss, sep, estado } = escenario();
  const r = atenderBotonConteo_(ss, estado, boton('conteo:501:si'), opciones());
  const fila = filaDe(sep, 6);
  assert.equal(fila.TIPO, 'AJUSTE');
  assert.equal(fila['GASTO (USD)'], 5);
  assert.equal(fila['ID FILA'], 'BOT-20260927-093000-501-1');
  assert.equal(fila.REGISTRADO, AHORA);
  assert.equal(r.escritas.length, 1);
  assert.equal(celda(estado, 'ESTADO'), 'CERRADA');
  assert.deepEqual(r.llamadas, [
    ['answerCallbackQuery', { callback_query_id: 'cb-1' }],
    ['editMessageReplyMarkup', { chat_id: CHAT, message_id: 900 }],
    ['sendMessage', { chat_id: CHAT, text: 'Anoté el ajuste: faltante de 5.00.' }],
  ]);
});

test('atenderBotonConteo_ cuenta los ID FACTURA ya usados en el mes para no repetir', () => {
  const { ss, sep, estado } = escenario();
  ponerFila(sep, 6, { FECHA: '2026-09-27', 'ID FACTURA': 'AJUSTE-20260927', 'ID FILA': 'M-1' });
  atenderBotonConteo_(ss, estado, boton('conteo:501:si'), opciones());
  assert.equal(filaDe(sep, 7)['ID FACTURA'], 'AJUSTE-20260927-2');
});

test('atenderBotonConteo_ con Sí en un mes sin pestaña la crea', () => {
  const { ss, estado } = escenario();
  atenderBotonConteo_(ss, estado, boton('conteo:501:si'), opciones({ fechaMensaje: '2026-10-01' }));
  assert.equal(filaDe(ss.getSheetByName('Octubre 2026'), 6).TIPO, 'AJUSTE');
});

test('atenderBotonConteo_ con No cierra sin escribir en el mes', () => {
  const { ss, sep, estado } = escenario();
  const r = atenderBotonConteo_(ss, estado, boton('conteo:501:no'), opciones());
  assert.deepEqual(sep.escrituras, []);
  assert.deepEqual(r.escritas, []);
  assert.equal(celda(estado, 'ESTADO'), 'CERRADA');
  assert.deepEqual(r.llamadas, [
    ['answerCallbackQuery', { callback_query_id: 'cb-1' }],
    ['editMessageReplyMarkup', { chat_id: CHAT, message_id: 900 }],
    ['sendMessage', { chat_id: CHAT, text: TEXTO_SIN_AJUSTE }],
  ]);
});

test('atenderBotonConteo_ con Sí y saldo cambiado deja el conteo abierto con el saldo nuevo y pregunta otra vez', () => {
  const { ss, sep, estado } = escenario();
  const r = atenderBotonConteo_(ss, estado, boton('conteo:501:si'), opciones({ saldoAhora: 88 }));
  assert.deepEqual(sep.escrituras, []);
  assert.equal(celda(estado, 'ESTADO'), 'ABIERTA');
  assert.deepEqual(JSON.parse(celda(estado, 'DATOS')), { idMensaje: 501, contado: 85, saldo: 88 });
  const [metodo, cuerpo] = r.llamadas[2];
  assert.equal(metodo, 'sendMessage');
  assert.match(cuerpo.text, /faltante de 3\.00/);
  assert.deepEqual(cuerpo.reply_markup, tecladoConteo_('501'));
  assert.deepEqual(r.llamadas[1], ['editMessageReplyMarkup', { chat_id: CHAT, message_id: 900 }]);
});

test('atenderBotonConteo_ sobre un conteo ya cerrado solo avisa en el botón y no toca nada', () => {
  const { ss, sep, estado } = escenario({ estadoConteo: 'CERRADA' });
  const escriturasEstado = estado.escrituras.length;
  const r = atenderBotonConteo_(ss, estado, boton('conteo:501:si'), opciones());
  assert.deepEqual(sep.escrituras, []);
  assert.equal(estado.escrituras.length, escriturasEstado);
  assert.deepEqual(r.llamadas, [
    ['answerCallbackQuery', { callback_query_id: 'cb-1', text: TEXTO_CONTEO_ATENDIDO }],
  ]);
});

test('atenderBotonConteo_ con un botón que no es de conteo o sin clave conocida solo avisa', () => {
  const { ss, estado } = escenario();
  for (const data of ['otra-cosa', 'conteo:999:si']) {
    const r = atenderBotonConteo_(ss, estado, boton(data), opciones());
    assert.deepEqual(r.llamadas, [
      ['answerCallbackQuery', { callback_query_id: 'cb-1', text: TEXTO_CONTEO_ATENDIDO }],
    ]);
  }
  assert.equal(celda(estado, 'ESTADO'), 'ABIERTA');
});

test('atenderBotonConteo_ no intenta editar un mensaje inaccesible (date 0) ni uno que no vino', () => {
  for (const mensaje of [{ message_id: 900, date: 0, chat: { id: CHAT } }, undefined]) {
    const { ss, estado } = escenario();
    // Sin pasar por el valor por defecto de boton: `undefined` lo activaría.
    const r = atenderBotonConteo_(ss, estado, { ...boton('conteo:501:no'), message: mensaje }, opciones());
    assert.deepEqual(r.llamadas.map(([m]) => m), ['answerCallbackQuery', 'sendMessage']);
  }
});

test('atenderBotonConteo_ con _ESTADO solo con encabezado no falla', () => {
  const estado = hojaFalsa('_ESTADO', { protegerDesborde: false });
  estado.appendRow([...COLUMNAS_ESTADO]);
  const ss = libroFalso([hojaFalsa('Septiembre 2026'), estado]);
  const r = atenderBotonConteo_(ss, estado, boton('conteo:501:si'), opciones());
  assert.equal(r.llamadas[0][1].text, TEXTO_CONTEO_ATENDIDO);
});

test('atenderBotonConteo_ si falla la escritura del AJUSTE, el conteo sigue abierto', () => {
  const { ss, estado } = escenario();
  const fallido = { ...ss, getSheets: () => { throw new Error('Sheet caído'); } };
  assert.throws(() => atenderBotonConteo_(fallido, estado, boton('conteo:501:si'), opciones()), /Sheet caído/);
  assert.equal(celda(estado, 'ESTADO'), 'ABIERTA');
});
