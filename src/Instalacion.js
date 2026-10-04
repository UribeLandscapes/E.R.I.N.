/**
 * Funciones de instalación que el administrador ejecuta a mano desde el editor de Apps Script.
 * Nunca imprimen el valor de un secreto: solo si existe y si tiene la forma esperada.
 */
const PROPIEDADES_REQUERIDAS = Object.freeze(['TELEGRAM_TOKEN', 'GEMINI_API_KEY', 'WEBHOOK_SECRET']);
// Respaldo de Groq, opcional. Sin ella todo sigue igual que hoy: no cuenta para
// el `ok` de revisarPropiedades_/verificarPropiedades, solo se informa aparte.
const PROPIEDADES_OPCIONALES = Object.freeze(['GROQ_API_KEY']);

// Token de BotFather: "<id numérico>:<letras, números, _ o ->".
const FORMA_TOKEN_TELEGRAM = /^\d+:[A-Za-z0-9_-]+$/;
// secret_token de Telegram: 1–256 de A-Za-z0-9_-; el plan pide al menos 32 (va en la URL como ?k=).
const FORMA_SECRETO_WEBHOOK = /^[A-Za-z0-9_-]{32,256}$/;

const AVISOS_DE_FORMA = Object.freeze({
  TELEGRAM_TOKEN: [FORMA_TOKEN_TELEGRAM, 'no tiene forma de token de Telegram (números:letras)'],
  WEBHOOK_SECRET: [FORMA_SECRETO_WEBHOOK, 'debe tener de 32 a 256 caracteres, solo letras, números, _ o -'],
});

function revisarUna_(clave, valor) {
  if (valor === null || valor === undefined || valor.trim() === '') return `${clave}: falta`;
  if (valor !== valor.trim()) return `${clave}: existe, pero tiene espacios al inicio o al final`;
  const aviso = AVISOS_DE_FORMA[clave];
  if (aviso && !aviso[0].test(valor)) return `${clave}: existe, pero ${aviso[1]}`;
  return `${clave}: existe`;
}

/** Lógica pura (el _ final la oculta del menú Ejecutar): `leer(clave)` devuelve el texto guardado o null. */
function revisarPropiedades_(leer) {
  const lineas = PROPIEDADES_REQUERIDAS.map((clave) => revisarUna_(clave, leer(clave)));
  return { ok: lineas.every((l) => l.endsWith(': existe')), lineas };
}

/**
 * Lógica pura de las propiedades opcionales: "<clave>: existe" o "<clave>: opcional,
 * falta" (nunca cuenta como falla). Mismo `leer(clave)` que revisarPropiedades_.
 */
function revisarOpcionales_(leer) {
  return PROPIEDADES_OPCIONALES.map((clave) => {
    const valor = leer(clave);
    return valor === null || valor === undefined || String(valor).trim() === ''
      ? `${clave}: opcional, falta` : `${clave}: existe`;
  });
}

/** Ejecutar desde el editor; el resultado sale en el registro de ejecución. */
function verificarPropiedades() {
  const propiedades = PropertiesService.getScriptProperties();
  const leer = (clave) => propiedades.getProperty(clave);
  const { ok, lineas } = revisarPropiedades_(leer);
  [...lineas, ...revisarOpcionales_(leer)].forEach((linea) => Logger.log(linea));
  return ok;
}

/**
 * Ejecutar desde el editor antes que nada: registra qué valores de src/Config.js siguen con el
 * ejemplo "TU_..." (o vacíos). Devuelve true si la configuración está completa.
 */
function verificarConfiguracion() {
  const faltan = faltantesConfig_(CONFIG);
  Logger.log(faltan.length
    ? `Config incompleta. Faltan: ${faltan.join(', ')}`
    : 'Config completa: no queda ningún valor de ejemplo.');
  return faltan.length === 0;
}

// Tasa del día sin fecha ni clave: solo prueba que el script puede salir a internet.
const URL_PRUEBA_INTERNET = 'https://api.frankfurter.dev/v2/rate/usd/eur';

function probarAcceso_(nombre, prueba) {
  try {
    return `${nombre}: ok (${prueba()})`;
  } catch (error) {
    return `${nombre}: falla (${error.message})`;
  }
}

function probarInternet_() {
  const codigo = UrlFetchApp.fetch(URL_PRUEBA_INTERNET, { muteHttpExceptions: true }).getResponseCode();
  if (codigo !== 200) throw new Error(`HTTP ${codigo}`);
  return `HTTP ${codigo}`;
}

/**
 * Ejecutar una vez desde el editor. Pide todos los permisos del proyecto (si falta alguno,
 * Google corta la ejecución y muestra la pantalla de permisos) y luego prueba cada servicio.
 */
function autorizar() {
  ScriptApp.requireAllScopes(ScriptApp.AuthMode.FULL);
  const lineas = [
    probarAcceso_('Hoja', () => SpreadsheetApp.openById(CONFIG.SHEET_ID).getName()),
    probarAcceso_('Carpeta Facturas', () => DriveApp.getFolderById(CONFIG.FACTURAS_FOLDER_ID).getName()),
    probarAcceso_('Drive avanzado', () => Drive.Files.get(CONFIG.HISTORIAL_FOLDER_ID, { fields: 'name' }).name),
    probarAcceso_('Internet', probarInternet_),
    probarAcceso_('Disparadores', () => `${ScriptApp.getProjectTriggers().length} instalados`),
    probarAcceso_('Excel espejo', () => DriveApp.getFileById(CONFIG.EXCEL_ESPEJO_ID).getName()),
  ];
  lineas.forEach((linea) => Logger.log(linea));
  return lineas.every((l) => l.includes(': ok ('));
}

// AlEditar (EdicionApp.js) y copiarAExcel (EspejoApp.js: espejo
// hoja -> Excel cada INTERVALO_ESPEJO_MINUTOS).
const MANEJADORES_DISPARADOR = Object.freeze(['alEditar', 'copiarAExcel']);
// Funciones que ya no existen: si el proyecto en vivo aún tiene su disparador, se borra y no se
// vuelve a crear (si no, dispararía a diario una función inexistente y mandaría correos de falla).
const MANEJADORES_RETIRADOS = Object.freeze(['cierreDiario']);

/** Disparadores del proyecto que instala esta función (y los retirados por borrar), de `existentes`. */
const disparadoresPropios_ = (existentes) => existentes
  .filter((d) => MANEJADORES_DISPARADOR.includes(d.getHandlerFunction())
    || MANEJADORES_RETIRADOS.includes(d.getHandlerFunction()));

/**
 * Idempotente: borra los disparadores existentes de alEditar/copiarAExcel y los vuelve a
 * crear; el de cierreDiario (retirado) solo se borra. `deps` los aísla de ScriptApp/SpreadsheetApp
 * para las pruebas.
 */
function instalarDisparadoresConDeps_(deps) {
  disparadoresPropios_(deps.disparadores()).forEach((disparador) => {
    const manejador = disparador.getHandlerFunction();
    Logger.log(`instalarDisparadores: borra ${manejador}${MANEJADORES_RETIRADOS.includes(manejador) ? ' (retirado)' : ''}`);
    deps.borrar(disparador);
  });
  deps.crearAlEditar();
  Logger.log('instalarDisparadores: crea alEditar (onEdit)');
  deps.crearCopiaExcel();
  Logger.log(`instalarDisparadores: crea copiarAExcel (cada ${INTERVALO_ESPEJO_MINUTOS} minutos)`);
}

function dependenciasDisparadoresReales_() {
  const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  return {
    disparadores: () => ScriptApp.getProjectTriggers(),
    borrar: (disparador) => ScriptApp.deleteTrigger(disparador),
    crearAlEditar: () => ScriptApp.newTrigger('alEditar').forSpreadsheet(ss).onEdit().create(),
    crearCopiaExcel: () => ScriptApp.newTrigger('copiarAExcel').timeBased()
      .everyMinutes(INTERVALO_ESPEJO_MINUTOS).create(),
  };
}

/** Ejecutar desde el editor; también quita el disparador viejo de cierreDiario si sigue ahí. */
function instalarDisparadores() {
  exigirConfigCompleta_(CONFIG);
  instalarDisparadoresConDeps_(dependenciasDisparadoresReales_());
}

if (typeof module !== 'undefined') {
  module.exports = {
    PROPIEDADES_REQUERIDAS, PROPIEDADES_OPCIONALES, revisarPropiedades_, revisarOpcionales_,
    verificarPropiedades, verificarConfiguracion, URL_PRUEBA_INTERNET, autorizar,
    MANEJADORES_DISPARADOR, MANEJADORES_RETIRADOS, disparadoresPropios_, instalarDisparadoresConDeps_,
    dependenciasDisparadoresReales_, instalarDisparadores,
  };
}
