const test = require('node:test');
const assert = require('node:assert/strict');

const {
  mismoSecreto_, chatDeUpdate_, revisarUpdate_, ocultarSecreto_, urlWebhook_, cuerpoSetWebhook_,
  lineasWebhook_, TIPOS_UPDATE,
} = require('../src/Webhook.js');

const SECRETO = 'a'.repeat(32);
const USUARIO = '1000000001';
const URL_APP = 'https://script.google.com/macros/s/AKfycbx-abc_123/exec';

const mensaje = (chat, extra = {}) => ({ update_id: 7, message: { message_id: 1, chat, text: 'hola' }, ...extra });
const privado = (id) => ({ id: Number(id), type: 'private' });
const evento = (k, cuerpo) => ({
  parameter: k === undefined ? {} : { k },
  postData: cuerpo === undefined ? undefined : { contents: typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo) },
});

test('mismoSecreto_ solo acepta dos textos idénticos y no vacíos', () => {
  assert.equal(mismoSecreto_(SECRETO, SECRETO), true);
  assert.equal(mismoSecreto_(SECRETO, `${SECRETO}b`), false);
  assert.equal(mismoSecreto_(SECRETO, 'b'.repeat(32)), false);
  assert.equal(mismoSecreto_('', ''), false);
  assert.equal(mismoSecreto_(undefined, SECRETO), false);
  assert.equal(mismoSecreto_(SECRETO, null), false);
});

test('chatDeUpdate_ encuentra el chat en un mensaje o en un botón', () => {
  assert.deepEqual(chatDeUpdate_(mensaje(privado(USUARIO))), privado(USUARIO));
  const boton = { update_id: 8, callback_query: { id: 'q', data: 'si', message: { chat: privado(USUARIO) } } };
  assert.deepEqual(chatDeUpdate_(boton), privado(USUARIO));
  assert.equal(chatDeUpdate_({ update_id: 9, callback_query: { id: 'q' } }), null);
  assert.equal(chatDeUpdate_({ update_id: 9, edited_message: { chat: privado(USUARIO) } }), null);
});

test('revisarUpdate_ acepta un mensaje privado del usuario con el secreto correcto', () => {
  const update = mensaje(privado(USUARIO));
  assert.deepEqual(revisarUpdate_(evento(SECRETO, update), SECRETO, USUARIO), { ok: true, update });
});

test('revisarUpdate_ acepta un botón del usuario', () => {
  const update = { update_id: 8, callback_query: { id: 'q', data: 'si', message: { chat: privado(USUARIO) } } };
  assert.deepEqual(revisarUpdate_(evento(SECRETO, update), SECRETO, USUARIO), { ok: true, update });
});

test('revisarUpdate_ rechaza sin secreto, con secreto malo o sin secreto guardado', () => {
  const update = mensaje(privado(USUARIO));
  assert.deepEqual(revisarUpdate_(evento(undefined, update), SECRETO, USUARIO), { ok: false, motivo: 'secreto' });
  assert.deepEqual(revisarUpdate_(evento('x', update), SECRETO, USUARIO), { ok: false, motivo: 'secreto' });
  assert.deepEqual(revisarUpdate_(evento('', update), '', USUARIO), { ok: false, motivo: 'secreto' });
  assert.deepEqual(revisarUpdate_({}, SECRETO, USUARIO), { ok: false, motivo: 'secreto' });
});

test('revisarUpdate_ revisa el secreto antes de leer el cuerpo', () => {
  assert.deepEqual(revisarUpdate_(evento('x', '{roto'), SECRETO, USUARIO), { ok: false, motivo: 'secreto' });
});

test('revisarUpdate_ rechaza cuerpo ausente, JSON roto o sin update_id numérico', () => {
  assert.deepEqual(revisarUpdate_(evento(SECRETO), SECRETO, USUARIO), { ok: false, motivo: 'json' });
  assert.deepEqual(revisarUpdate_(evento(SECRETO, '{roto'), SECRETO, USUARIO), { ok: false, motivo: 'json' });
  assert.deepEqual(revisarUpdate_(evento(SECRETO, 'null'), SECRETO, USUARIO), { ok: false, motivo: 'json' });
  const sinId = { message: { chat: privado(USUARIO) } };
  assert.deepEqual(revisarUpdate_(evento(SECRETO, sinId), SECRETO, USUARIO), { ok: false, motivo: 'update_id' });
  const idTexto = { update_id: '7', message: { chat: privado(USUARIO) } };
  assert.deepEqual(revisarUpdate_(evento(SECRETO, idTexto), SECRETO, USUARIO), { ok: false, motivo: 'update_id' });
});

test('revisarUpdate_ ignora tipos de update que no son mensaje ni botón', () => {
  const editado = { update_id: 9, edited_message: { chat: privado(USUARIO) } };
  assert.deepEqual(revisarUpdate_(evento(SECRETO, editado), SECRETO, USUARIO), { ok: false, motivo: 'tipo' });
});

test('revisarUpdate_ rechaza grupos aunque el id coincida', () => {
  const grupo = mensaje({ id: Number(USUARIO), type: 'group' });
  assert.deepEqual(revisarUpdate_(evento(SECRETO, grupo), SECRETO, USUARIO), { ok: false, motivo: 'privado' });
});

test('revisarUpdate_ rechaza chats privados de otra persona', () => {
  const otro = mensaje(privado('123456'));
  assert.deepEqual(revisarUpdate_(evento(SECRETO, otro), SECRETO, USUARIO), { ok: false, motivo: 'chat' });
});

test('TIPOS_UPDATE son los que el bot pide a Telegram', () => {
  assert.deepEqual([...TIPOS_UPDATE], ['message', 'callback_query']);
});

test('ocultarSecreto_ tapa el valor de k en una URL', () => {
  assert.equal(ocultarSecreto_(`${URL_APP}?k=${SECRETO}`), `${URL_APP}?k=***`);
  assert.equal(ocultarSecreto_(`${URL_APP}?a=1&k=${SECRETO}&b=2`), `${URL_APP}?a=1&k=***&b=2`);
  assert.equal(ocultarSecreto_(URL_APP), URL_APP);
  assert.equal(ocultarSecreto_(''), '');
  assert.equal(ocultarSecreto_(undefined), '');
});

test('ocultarSecreto_ tapa tokens del bot en URLs de API y de archivos', () => {
  assert.equal(ocultarSecreto_('https://api.telegram.org/bot123456:Ab_c-9/sendMessage'),
    'https://api.telegram.org/bot***/sendMessage');
  assert.equal(ocultarSecreto_('https://api.telegram.org/file/bot123456:Ab_c-9/fotos/x.jpg'),
    'https://api.telegram.org/file/bot***/fotos/x.jpg');
});

test('ocultarSecreto_ tapa tokens de Telegram sueltos (sin prefijo bot, 6+ dígitos:30+ chars)', () => {
  // Token suelto válido: 6+ dígitos: 30+ caracteres
  const tokenSuelto = '123456:ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890';
  assert.equal(ocultarSecreto_(`error ${tokenSuelto} en API`), 'error *** en API');
  assert.equal(ocultarSecreto_(`webhook ${tokenSuelto}`), `webhook ***`);
  // Verificar que bot-prefix sigue funcionando
  assert.equal(ocultarSecreto_('url/bot123456:AbCd1234567890123456789012/send'),
    'url/bot***/send');
  // Verificar que ?k= sigue funcionando
  assert.equal(ocultarSecreto_(`URL?k=${SECRETO}`), 'URL?k=***');
});

test('ocultarSecreto_ NO tapa texto normal con : y números cortos (p. ej. "hora 12:30")', () => {
  assert.equal(ocultarSecreto_('hora 12:30'), 'hora 12:30');
  assert.equal(ocultarSecreto_('update 123456:abc'), 'update 123456:abc');
  assert.equal(ocultarSecreto_('mensaje: 12345:no_enough'), 'mensaje: 12345:no_enough');
});

test('urlWebhook_ agrega el secreto a una URL /exec de Apps Script', () => {
  assert.equal(urlWebhook_(URL_APP, SECRETO), `${URL_APP}?k=${SECRETO}`);
});

test('urlWebhook_ rechaza URL vacía, /dev, con parámetros o de otro sitio', () => {
  assert.throws(() => urlWebhook_('', SECRETO), /CONFIG.WEBAPP_URL/);
  assert.throws(() => urlWebhook_(URL_APP.replace('/exec', '/dev'), SECRETO), /\/exec/);
  assert.throws(() => urlWebhook_(`${URL_APP}?k=x`, SECRETO), /\/exec/);
  assert.throws(() => urlWebhook_('https://ejemplo.com/macros/s/abc/exec', SECRETO), /\/exec/);
});

test('urlWebhook_ rechaza un secreto con forma inválida sin mostrarlo', () => {
  assert.throws(() => urlWebhook_(URL_APP, 'corto'), (e) => /WEBHOOK_SECRET/.test(e.message) && !e.message.includes('corto'));
  assert.throws(() => urlWebhook_(URL_APP, `${'a'.repeat(31)}&`), /WEBHOOK_SECRET/);
  assert.throws(() => urlWebhook_(URL_APP, undefined), /WEBHOOK_SECRET/);
});

test('cuerpoSetWebhook_ pide solo mensajes y botones, de a uno, sin borrar pendientes', () => {
  assert.deepEqual(cuerpoSetWebhook_('https://x/exec?k=s'), {
    url: 'https://x/exec?k=s', allowed_updates: ['message', 'callback_query'], max_connections: 1,
    drop_pending_updates: false,
  });
});

test('lineasWebhook_ resume getWebhookInfo sin mostrar el secreto', () => {
  const lineas = lineasWebhook_({
    url: `${URL_APP}?k=${SECRETO}`, pending_update_count: 2, last_error_date: 1790000000,
    last_error_message: 'Wrong response from the webhook: 302 Moved Temporarily', max_connections: 1,
    allowed_updates: ['message', 'callback_query'],
  });
  assert.deepEqual(lineas, [
    `url: ${URL_APP}?k=***`,
    'pendientes: 2',
    'último error: 2026-09-21T14:13:20.000Z — Wrong response from the webhook: 302 Moved Temporarily',
    'conexiones máximas: 1',
    'tipos: message, callback_query',
  ]);
  assert.ok(lineas.every((l) => !l.includes(SECRETO)));
});

test('lineasWebhook_ sin webhook ni errores', () => {
  assert.deepEqual(lineasWebhook_({ url: '', pending_update_count: 0 }), [
    'url: (sin webhook)', 'pendientes: 0', 'último error: ninguno', 'conexiones máximas: -', 'tipos: todos',
  ]);
});

test('lineasWebhook_ oculta el secreto también dentro del mensaje de error', () => {
  const lineas = lineasWebhook_({ url: '', pending_update_count: 0, last_error_date: 1790000000,
    last_error_message: `falló ${URL_APP}?k=${SECRETO}` });
  assert.ok(lineas.every((l) => !l.includes(SECRETO)));
});
