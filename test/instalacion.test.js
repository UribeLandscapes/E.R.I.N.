const test = require('node:test');
const assert = require('node:assert/strict');

const {
  PROPIEDADES_REQUERIDAS, PROPIEDADES_OPCIONALES, revisarPropiedades_, revisarOpcionales_, verificarPropiedades,
} = require('../src/Instalacion.js');

const TOKEN_OK = '123456789:AAHf-abc_DEF123';
const SECRETO_OK = 'a'.repeat(16) + 'B9_-'.repeat(4);
const CLAVE_OK = 'clave-gemini-de-prueba';

function lector(valores) {
  return (clave) => (clave in valores ? valores[clave] : null);
}

test('pide exactamente token de Telegram, clave de Gemini y secreto del webhook', () => {
  assert.deepEqual([...PROPIEDADES_REQUERIDAS], ['TELEGRAM_TOKEN', 'GEMINI_API_KEY', 'WEBHOOK_SECRET']);
});

test('con las tres propiedades bien formadas dice "existe" y ok', () => {
  const r = revisarPropiedades_(lector({ TELEGRAM_TOKEN: TOKEN_OK, GEMINI_API_KEY: CLAVE_OK, WEBHOOK_SECRET: SECRETO_OK }));
  assert.equal(r.ok, true);
  assert.deepEqual(r.lineas, ['TELEGRAM_TOKEN: existe', 'GEMINI_API_KEY: existe', 'WEBHOOK_SECRET: existe']);
});

test('una propiedad ausente o vacía sale como "falta" y no ok', () => {
  const r = revisarPropiedades_(lector({ TELEGRAM_TOKEN: TOKEN_OK, GEMINI_API_KEY: '' }));
  assert.equal(r.ok, false);
  assert.equal(r.lineas[1], 'GEMINI_API_KEY: falta');
  assert.equal(r.lineas[2], 'WEBHOOK_SECRET: falta');
});

test('avisa de espacios al inicio o al final', () => {
  const r = revisarPropiedades_(lector({ TELEGRAM_TOKEN: TOKEN_OK, GEMINI_API_KEY: CLAVE_OK + ' ', WEBHOOK_SECRET: SECRETO_OK }));
  assert.equal(r.ok, false);
  assert.match(r.lineas[1], /^GEMINI_API_KEY: existe, pero tiene espacios/);
});

test('avisa si el token no tiene forma de token de Telegram', () => {
  const r = revisarPropiedades_(lector({ TELEGRAM_TOKEN: 'sin-dos-puntos', GEMINI_API_KEY: CLAVE_OK, WEBHOOK_SECRET: SECRETO_OK }));
  assert.equal(r.ok, false);
  assert.match(r.lineas[0], /^TELEGRAM_TOKEN: existe, pero no tiene forma/);
});

test('avisa si el secreto del webhook es corto o trae caracteres que Telegram no acepta', () => {
  for (const malo of ['corto', 'a'.repeat(31), 'a'.repeat(32) + '!', 'a'.repeat(257)]) {
    const r = revisarPropiedades_(lector({ TELEGRAM_TOKEN: TOKEN_OK, GEMINI_API_KEY: CLAVE_OK, WEBHOOK_SECRET: malo }));
    assert.equal(r.ok, false, malo);
    assert.match(r.lineas[2], /^WEBHOOK_SECRET: existe, pero/, malo);
  }
});

test('nunca muestra el valor de un secreto', () => {
  const valores = { TELEGRAM_TOKEN: TOKEN_OK, GEMINI_API_KEY: CLAVE_OK + ' ', WEBHOOK_SECRET: 'corto!' };
  const texto = revisarPropiedades_(lector(valores)).lineas.join('\n');
  for (const valor of Object.values(valores)) assert.ok(!texto.includes(valor.trim()), valor);
});

test('verificarPropiedades lee Script Properties y registra una línea por propiedad, incluida GROQ_API_KEY (opcional)', () => {
  const registrado = [];
  global.PropertiesService = {
    getScriptProperties: () => ({ getProperty: lector({ TELEGRAM_TOKEN: TOKEN_OK, GEMINI_API_KEY: CLAVE_OK }) }),
  };
  global.Logger = { log: (t) => registrado.push(t) };
  try {
    assert.equal(verificarPropiedades(), false);
    assert.deepEqual(registrado, [
      'TELEGRAM_TOKEN: existe', 'GEMINI_API_KEY: existe', 'WEBHOOK_SECRET: falta',
      'GROQ_API_KEY: opcional, falta',
    ]);
  } finally {
    delete global.PropertiesService;
    delete global.Logger;
  }
});

// --- GROQ_API_KEY opcional ---

test('PROPIEDADES_OPCIONALES trae solo GROQ_API_KEY', () => {
  assert.deepEqual([...PROPIEDADES_OPCIONALES], ['GROQ_API_KEY']);
});

test('revisarOpcionales_ dice "opcional, falta" si no está configurada, nunca cuenta como error', () => {
  assert.deepEqual(revisarOpcionales_(lector({})), ['GROQ_API_KEY: opcional, falta']);
  assert.deepEqual(revisarOpcionales_(lector({ GROQ_API_KEY: '' })), ['GROQ_API_KEY: opcional, falta']);
  assert.deepEqual(revisarOpcionales_(lector({ GROQ_API_KEY: '   ' })), ['GROQ_API_KEY: opcional, falta']);
});

test('revisarOpcionales_ dice "existe" cuando GROQ_API_KEY está configurada', () => {
  assert.deepEqual(revisarOpcionales_(lector({ GROQ_API_KEY: 'gsk_algo' })), ['GROQ_API_KEY: existe']);
  assert.deepEqual(revisarOpcionales_(lector({ ULTIMO_CIERRE: '{}' })), ['GROQ_API_KEY: opcional, falta']);
});

test('verificarPropiedades sigue ok:true con las 3 requeridas bien y GROQ_API_KEY ausente', () => {
  global.PropertiesService = {
    getScriptProperties: () => ({ getProperty: lector({ TELEGRAM_TOKEN: TOKEN_OK, GEMINI_API_KEY: CLAVE_OK, WEBHOOK_SECRET: SECRETO_OK }) }),
  };
  global.Logger = { log: () => {} };
  try {
    assert.equal(verificarPropiedades(), true);
  } finally {
    delete global.PropertiesService;
    delete global.Logger;
  }
});

const { autorizar, URL_PRUEBA_INTERNET } = require('../src/Instalacion.js');

function simularGoogle({ fallaHoja = false, codigoInternet = 200 } = {}) {
  const llamadas = [];
  const registrado = [];
  global.CONFIG = require('./configPrueba.js').CONFIG;
  global.ScriptApp = {
    AuthMode: { FULL: 'FULL' },
    requireAllScopes: (modo) => llamadas.push(['requireAllScopes', modo]),
    getProjectTriggers: () => [{}, {}],
  };
  global.SpreadsheetApp = {
    openById: (id) => {
      if (fallaHoja) throw new Error('sin acceso');
      llamadas.push(['hoja', id]);
      return { getName: () => 'Caja Chica de Prueba' };
    },
  };
  global.DriveApp = {
    getFolderById: (id) => (llamadas.push(['carpeta', id]), { getName: () => 'Facturas' }),
    getFileById: (id) => (llamadas.push(['excel', id]), { getName: () => 'Espejo de prueba.xlsx' }),
  };
  global.Drive = { Files: { get: (id, opciones) => (llamadas.push(['drive', id, opciones]), { name: 'historial' }) } };
  global.UrlFetchApp = {
    fetch: (url, opciones) => (llamadas.push(['fetch', url, opciones]), { getResponseCode: () => codigoInternet }),
  };
  global.Logger = { log: (t) => registrado.push(t) };
  return { llamadas, registrado };
}

function limpiarGoogle() {
  for (const g of ['CONFIG', 'ScriptApp', 'SpreadsheetApp', 'DriveApp', 'Drive', 'UrlFetchApp', 'Logger']) delete global[g];
}

test('autorizar pide todos los permisos primero y luego prueba cada servicio', () => {
  const { llamadas, registrado } = simularGoogle();
  try {
    assert.equal(autorizar(), true);
    assert.deepEqual(llamadas[0], ['requireAllScopes', 'FULL']);
    assert.deepEqual(registrado, [
      'Hoja: ok (Caja Chica de Prueba)',
      'Carpeta Facturas: ok (Facturas)',
      'Drive avanzado: ok (historial)',
      'Internet: ok (HTTP 200)',
      'Disparadores: ok (2 instalados)',
      'Excel espejo: ok (Espejo de prueba.xlsx)',
    ]);
  } finally {
    limpiarGoogle();
  }
});

test('autorizar usa los IDs de CONFIG y no lanza errores HTTP', () => {
  const { llamadas } = simularGoogle();
  try {
    autorizar();
    const { CONFIG } = require('./configPrueba.js');
    assert.deepEqual(llamadas[1], ['hoja', CONFIG.SHEET_ID]);
    assert.deepEqual(llamadas[2], ['carpeta', CONFIG.FACTURAS_FOLDER_ID]);
    assert.deepEqual(llamadas[3], ['drive', CONFIG.HISTORIAL_FOLDER_ID, { fields: 'name' }]);
    assert.deepEqual(llamadas[4], ['fetch', URL_PRUEBA_INTERNET, { muteHttpExceptions: true }]);
    assert.deepEqual(llamadas[5], ['excel', CONFIG.EXCEL_ESPEJO_ID]);
  } finally {
    limpiarGoogle();
  }
});

test('autorizar informa cada falla sin detenerse y devuelve false', () => {
  const { registrado } = simularGoogle({ fallaHoja: true, codigoInternet: 503 });
  try {
    assert.equal(autorizar(), false);
    assert.equal(registrado[0], 'Hoja: falla (sin acceso)');
    assert.equal(registrado[3], 'Internet: falla (HTTP 503)');
    assert.equal(registrado.length, 6);
  } finally {
    limpiarGoogle();
  }
});

test('la prueba de internet no lleva secretos en la URL', () => {
  assert.match(URL_PRUEBA_INTERNET, /^https:\/\/api\.frankfurter\.dev\//);
});

// --- instalarDisparadores ---

const {
  MANEJADORES_DISPARADOR, MANEJADORES_RETIRADOS, disparadoresPropios_, instalarDisparadoresConDeps_,
  instalarDisparadores,
} = require('../src/Instalacion.js');
const { INTERVALO_ESPEJO_MINUTOS } = require('../src/Espejo.js');
global.INTERVALO_ESPEJO_MINUTOS = INTERVALO_ESPEJO_MINUTOS;

function trigger(nombre) {
  return { getHandlerFunction: () => nombre };
}

function logger() {
  const registrado = [];
  return { registrado, log: (t) => registrado.push(t) };
}

test('disparadoresPropios_: los de alEditar y copiarAExcel, más el cierreDiario retirado', () => {
  const disparadores = [trigger('alEditar'), trigger('otraCosa'), trigger('cierreDiario'), trigger('copiarAExcel')];
  assert.deepEqual(disparadoresPropios_(disparadores).map((d) => d.getHandlerFunction()),
    ['alEditar', 'cierreDiario', 'copiarAExcel']);
});

test('MANEJADORES_DISPARADOR no incluye cierreDiario y MANEJADORES_RETIRADOS sí', () => {
  assert.deepEqual([...MANEJADORES_DISPARADOR], ['alEditar', 'copiarAExcel']);
  assert.deepEqual([...MANEJADORES_RETIRADOS], ['cierreDiario']);
});

function entornoDisparadores({ existentes = [] } = {}) {
  let activos = [];
  let contador = 0;
  const crear = (nombre) => { contador += 1; const t = { ...trigger(nombre), id: contador }; activos.push(t); return t; };
  activos = existentes.map(crear);
  return {
    activos: () => activos,
    deps: {
      disparadores: () => activos,
      borrar: (d) => { activos = activos.filter((x) => x !== d); },
      crearAlEditar: () => crear('alEditar'),
      crearCopiaExcel: () => crear('copiarAExcel'),
    },
  };
}

const manejadores = (activos) => activos().map((d) => d.getHandlerFunction()).sort();

test('instalarDisparadoresConDeps_: crea alEditar y copiarAExcel y lo dice en el log', () => {
  const { deps, activos } = entornoDisparadores();
  const { registrado, log } = logger();
  global.Logger = { log };
  try {
    instalarDisparadoresConDeps_(deps);
    assert.deepEqual(manejadores(activos), ['alEditar', 'copiarAExcel']);
    assert.ok(registrado.some((l) => l.includes('copiarAExcel') && l.includes('cada 5 minutos')));
    assert.ok(!registrado.some((l) => l.includes('cierreDiario')));
  } finally {
    delete global.Logger;
  }
});

test('instalarDisparadoresConDeps_: borra un disparador cierreDiario viejo y no crea otro', () => {
  const { deps, activos } = entornoDisparadores({ existentes: ['cierreDiario', 'alEditar', 'copiarAExcel'] });
  const { registrado, log } = logger();
  global.Logger = { log };
  try {
    instalarDisparadoresConDeps_(deps);
    assert.deepEqual(manejadores(activos), ['alEditar', 'copiarAExcel']);
    assert.ok(registrado.includes('instalarDisparadores: borra cierreDiario (retirado)'));
  } finally {
    delete global.Logger;
  }
});

test('instalarDisparadoresConDeps_: correr dos veces deja un alEditar y un copiarAExcel (idempotente)', () => {
  const { deps, activos } = entornoDisparadores({ existentes: ['cierreDiario'] });
  global.Logger = logger();
  try {
    instalarDisparadoresConDeps_(deps);
    instalarDisparadoresConDeps_(deps);
    assert.deepEqual(manejadores(activos), ['alEditar', 'copiarAExcel']);
  } finally {
    delete global.Logger;
  }
});

test('instalarDisparadoresConDeps_: no toca disparadores de otros manejadores', () => {
  const { deps, activos } = entornoDisparadores();
  deps.disparadores = () => [trigger('otroManejador')];
  const borrados = [];
  deps.borrar = (d) => borrados.push(d);
  global.Logger = logger();
  try {
    instalarDisparadoresConDeps_(deps);
    assert.deepEqual(borrados, []);
    assert.ok(activos().some((d) => d.getHandlerFunction() === 'alEditar'));
  } finally {
    delete global.Logger;
  }
});

test('instalarDisparadores: arma el disparador real con ScriptApp/SpreadsheetApp y CONFIG', () => {
  const llamadas = [];
  const registrado = [];
  global.CONFIG = require('./configPrueba.js').CONFIG;
  global.Logger = { log: (t) => registrado.push(t) };
  const builderCopia = {
    timeBased: () => builderCopia,
    everyMinutes: (n) => { llamadas.push(['everyMinutes', n]); return builderCopia; },
    create: () => { llamadas.push(['create-copia']); return {}; },
  };
  const builderEdicion = {
    forSpreadsheet: (ss) => { llamadas.push(['forSpreadsheet', ss]); return builderEdicion; },
    onEdit: () => { llamadas.push(['onEdit']); return builderEdicion; },
    create: () => { llamadas.push(['create-edicion']); return {}; },
  };
  const disparadorViejo = { getHandlerFunction: () => 'alEditar' };
  const disparadorCierre = { getHandlerFunction: () => 'cierreDiario' };
  global.ScriptApp = {
    newTrigger: (nombre) => { llamadas.push(['newTrigger', nombre]); return nombre === 'alEditar' ? builderEdicion : builderCopia; },
    getProjectTriggers: () => [disparadorViejo, disparadorCierre],
    deleteTrigger: (d) => llamadas.push(['deleteTrigger', d]),
  };
  global.SpreadsheetApp = { openById: (id) => { llamadas.push(['openById', id]); return { nombre: 'ss' }; } };
  try {
    instalarDisparadores();
    assert.deepEqual(llamadas[0], ['openById', CONFIG.SHEET_ID]);
    assert.ok(llamadas.some((l) => l[0] === 'deleteTrigger' && l[1] === disparadorViejo));
    assert.ok(llamadas.some((l) => l[0] === 'newTrigger' && l[1] === 'alEditar'));
    assert.ok(llamadas.some((l) => l[0] === 'create-edicion'));
    assert.ok(llamadas.some((l) => l[0] === 'deleteTrigger' && l[1] === disparadorCierre));
    assert.ok(!llamadas.some((l) => l[0] === 'newTrigger' && l[1] === 'cierreDiario'));
    assert.ok(!llamadas.some((l) => l[0] === 'atHour' || l[0] === 'everyDays'));
    assert.ok(llamadas.some((l) => l[0] === 'newTrigger' && l[1] === 'copiarAExcel'));
    assert.ok(llamadas.some((l) => l[0] === 'everyMinutes' && l[1] === INTERVALO_ESPEJO_MINUTOS));
    assert.ok(registrado.includes('instalarDisparadores: borra cierreDiario (retirado)'));
  } finally {
    delete global.CONFIG;
    delete global.Logger;
    delete global.ScriptApp;
    delete global.SpreadsheetApp;
  }
});

// --- verificarConfiguracion y el rechazo con CONFIG sin completar ---

const { verificarConfiguracion } = require('../src/Instalacion.js');

function conConfig(config, hacer) {
  const registrado = [];
  global.CONFIG = config;
  global.Logger = { log: (t) => registrado.push(t) };
  try {
    return hacer(registrado);
  } finally {
    delete global.CONFIG;
    delete global.Logger;
    delete global.ScriptApp;
  }
}

test('verificarConfiguracion con la CONFIG de ejemplo lista lo que falta y devuelve false', () => {
  const { CONFIG: ejemplo } = require('../src/Config.js');
  conConfig(ejemplo, (registrado) => {
    assert.equal(verificarConfiguracion(), false);
    assert.equal(registrado.length, 1);
    assert.match(registrado[0], /^Config incompleta\. Faltan: ERIN_FOLDER_ID, .*SHEET_ID.*CASAS\.PRINCIPAL\.nombre/);
  });
});

test('verificarConfiguracion con la CONFIG completa lo dice y devuelve true', () => {
  conConfig(require('./configPrueba.js').CONFIG, (registrado) => {
    assert.equal(verificarConfiguracion(), true);
    assert.deepEqual(registrado, ['Config completa: no queda ningún valor de ejemplo.']);
  });
});

test('instalarDisparadores con la CONFIG de ejemplo lanza y no toca ningún disparador', () => {
  const { CONFIG: ejemplo } = require('../src/Config.js');
  const llamadas = [];
  conConfig(ejemplo, () => {
    global.ScriptApp = {
      getProjectTriggers: () => { llamadas.push('lee'); return []; },
      deleteTrigger: () => llamadas.push('borra'),
      newTrigger: () => { llamadas.push('crea'); },
    };
    assert.throws(() => instalarDisparadores(), /Falta completar src\/Config\.js\. Valores pendientes: .*SHEET_ID/);
  });
  assert.deepEqual(llamadas, []);
});
