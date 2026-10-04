/**
 * Lógica pura del webhook de Telegram (sin servicios de Google). Decide si un update se atiende
 * y arma lo que se manda a setWebhook. El secreto nunca aparece en un texto que se registre.
 */
const TIPOS_UPDATE = Object.freeze(['message', 'callback_query']);
// Web app publicada: https://script.google.com/macros/s/<id>/exec (la de /dev solo sirve a editores).
const FORMA_URL_WEBAPP = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/;
const FORMA_SECRETO_URL = /^[A-Za-z0-9_-]{32,256}$/;
const PARAMETRO_SECRETO = /([?&]k=)[^&#]*/g;
const TOKEN_BOT_TELEGRAM = /bot\d+:[A-Za-z0-9_-]+/g;
const TOKEN_TELEGRAM_SUELTO = /\b\d{6,}:[A-Za-z0-9_-]{30,}\b/g;

/** Compara sin salir antes al primer carácter distinto. */
function mismoSecreto_(recibido, guardado) {
  if (typeof recibido !== 'string' || typeof guardado !== 'string') return false;
  if (guardado === '' || recibido.length !== guardado.length) return false;
  let diferencia = 0;
  for (let i = 0; i < guardado.length; i += 1) diferencia |= recibido.charCodeAt(i) ^ guardado.charCodeAt(i);
  return diferencia === 0;
}

function chatDeUpdate_(update) {
  if (update.message) return update.message.chat || null;
  const mensaje = update.callback_query && update.callback_query.message;
  return (mensaje && mensaje.chat) || null;
}

function leerCuerpo_(e) {
  try {
    const update = JSON.parse(e.postData.contents);
    return update !== null && typeof update === 'object' ? update : null;
  } catch (error) {
    return null;
  }
}

/**
 * `e` es el evento de doPost. Devuelve { ok: true, update } o { ok: false, motivo } con
 * motivo = secreto | json | update_id | tipo | privado | chat. El secreto se revisa primero.
 */
function revisarUpdate_(e, secreto, chatId) {
  const parametros = (e && e.parameter) || {};
  if (!mismoSecreto_(parametros.k, secreto)) return { ok: false, motivo: 'secreto' };
  const update = e.postData ? leerCuerpo_(e) : null;
  if (!update) return { ok: false, motivo: 'json' };
  if (!Number.isInteger(update.update_id)) return { ok: false, motivo: 'update_id' };
  const chat = TIPOS_UPDATE.some((t) => update[t]) ? chatDeUpdate_(update) : null;
  if (!chat) return { ok: false, motivo: 'tipo' };
  if (chat.type !== 'private') return { ok: false, motivo: 'privado' };
  if (String(chat.id) !== String(chatId)) return { ok: false, motivo: 'chat' };
  return { ok: true, update };
}

const ocultarSecreto_ = (texto) => String(texto || '')
  .replace(PARAMETRO_SECRETO, '$1***')
  .replace(TOKEN_BOT_TELEGRAM, 'bot***')
  .replace(TOKEN_TELEGRAM_SUELTO, '***');

function urlWebhook_(urlApp, secreto) {
  if (!urlApp) throw new Error('falta CONFIG.WEBAPP_URL (la URL /exec de la implementación)');
  if (!FORMA_URL_WEBAPP.test(urlApp)) {
    throw new Error('CONFIG.WEBAPP_URL debe ser https://script.google.com/macros/s/<id>/exec, sin parámetros');
  }
  if (typeof secreto !== 'string' || !FORMA_SECRETO_URL.test(secreto)) {
    throw new Error('WEBHOOK_SECRET falta o no tiene forma válida (ver verificarPropiedades)');
  }
  return `${urlApp}?k=${secreto}`;
}

// Un solo envío a la vez: el usuario es una sola persona y así casi nunca hay espera por el candado.
const cuerpoSetWebhook_ = (url) => ({
  url, allowed_updates: [...TIPOS_UPDATE], max_connections: 1, drop_pending_updates: false,
});

function lineaError_(info) {
  if (!info.last_error_date) return 'último error: ninguno';
  const fecha = new Date(info.last_error_date * 1000).toISOString();
  return `último error: ${fecha} — ${ocultarSecreto_(info.last_error_message || 'sin detalle')}`;
}

/** Resumen de getWebhookInfo para el registro de ejecución. */
function lineasWebhook_(info) {
  return [
    `url: ${info.url ? ocultarSecreto_(info.url) : '(sin webhook)'}`,
    `pendientes: ${info.pending_update_count}`,
    lineaError_(info),
    `conexiones máximas: ${info.max_connections || '-'}`,
    `tipos: ${info.allowed_updates && info.allowed_updates.length ? info.allowed_updates.join(', ') : 'todos'}`,
  ];
}

if (typeof module !== 'undefined') {
  module.exports = {
    TIPOS_UPDATE, mismoSecreto_, chatDeUpdate_, revisarUpdate_, ocultarSecreto_, urlWebhook_,
    cuerpoSetWebhook_, lineasWebhook_,
  };
}
