const test = require('node:test');
const assert = require('node:assert/strict');
const manifiesto = require('../src/appsscript.json');

const {
  CONFIG, faltantesConfig_, avisoConfigIncompleta_, exigirConfigCompleta_, AVISO_CONFIG_INCOMPLETA,
} = require('../src/Config.js');
const { CONFIG: CONFIG_PRUEBA } = require('./configPrueba.js');

const CLAVES_CON_EJEMPLO = [
  'ERIN_FOLDER_ID', 'FACTURAS_FOLDER_ID', 'SHEET_ID', 'HISTORIAL_FOLDER_ID', 'EXCEL_ESPEJO_ID',
  'ERIN_CHAT_ID', 'NOMBRE_USUARIO', 'WEBAPP_URL', 'DEPOSITANTE_POR_DEFECTO',
];

test('la CONFIG que se publica trae solo valores de ejemplo "TU_..." en lo personal', () => {
  for (const clave of CLAVES_CON_EJEMPLO) assert.match(CONFIG[clave], /^TU_/, clave);
  for (const casa of Object.values(CONFIG.CASAS)) {
    for (const campo of ['nombre', 'etiqueta', 'descripcion']) assert.match(casa[campo], /^TU_/, campo);
    assert.ok(casa.palabras.every((p) => p.startsWith('TU_')));
  }
});

test('faltantesConfig_ lista todo lo que sigue con el ejemplo, con la ruta de las casas', () => {
  const faltan = faltantesConfig_(CONFIG);
  for (const clave of CLAVES_CON_EJEMPLO) assert.ok(faltan.includes(clave), clave);
  assert.ok(faltan.includes('CASAS.PRINCIPAL.nombre'));
  assert.ok(faltan.includes('CASAS.SECUNDARIA.etiqueta'));
  assert.ok(faltan.includes('CASAS.SECUNDARIA.palabras'));
  assert.ok(!faltan.includes('TIMEZONE'));
  assert.ok(!faltan.includes('MODELO_PRINCIPAL'));
});

test('faltantesConfig_ de una configuración completa devuelve lista vacía', () => {
  assert.deepEqual(faltantesConfig_(CONFIG_PRUEBA), []);
});

test('faltantesConfig_ cuenta como faltante un texto vacío, en blanco o una lista vacía', () => {
  const casas = CONFIG_PRUEBA.CASAS;
  const config = { ...CONFIG_PRUEBA, SHEET_ID: '', NOMBRE_USUARIO: '   ', CASAS: { ...casas, PRINCIPAL: { ...casas.PRINCIPAL, palabras: [] } } };
  assert.deepEqual(faltantesConfig_(config), ['SHEET_ID', 'NOMBRE_USUARIO', 'CASAS.PRINCIPAL.palabras']);
});

test('faltantesConfig_ detecta el ejemplo dentro de la lista de palabras de una casa', () => {
  const casas = CONFIG_PRUEBA.CASAS;
  const config = { ...CONFIG_PRUEBA, CASAS: { ...casas, SECUNDARIA: { ...casas.SECUNDARIA, palabras: ['playa', 'TU_PALABRA'] } } };
  assert.deepEqual(faltantesConfig_(config), ['CASAS.SECUNDARIA.palabras']);
});

test('avisoConfigIncompleta_ nombra lo que falta y queda vacío si todo está completo', () => {
  assert.equal(avisoConfigIncompleta_(CONFIG_PRUEBA), '');
  const aviso = avisoConfigIncompleta_({ ...CONFIG_PRUEBA, SHEET_ID: 'TU_SHEET_ID' });
  assert.equal(aviso, `${AVISO_CONFIG_INCOMPLETA}SHEET_ID`);
});

test('exigirConfigCompleta_ lanza un error claro con el ejemplo y no lanza con la config completa', () => {
  assert.throws(() => exigirConfigCompleta_(CONFIG), /Falta completar src\/Config\.js.*SHEET_ID.*ERIN_CHAT_ID/);
  assert.doesNotThrow(() => exigirConfigCompleta_(CONFIG_PRUEBA));
});

test('la CONFIG de prueba es completa y sus IDs de Drive tienen forma válida', () => {
  for (const clave of ['ERIN_FOLDER_ID', 'FACTURAS_FOLDER_ID', 'SHEET_ID', 'HISTORIAL_FOLDER_ID', 'EXCEL_ESPEJO_ID']) {
    assert.match(CONFIG_PRUEBA[clave], /^[A-Za-z0-9_-]{25,}$/, clave);
  }
  assert.match(CONFIG_PRUEBA.ERIN_CHAT_ID, /^\d+$/);
});

test('CONFIG fija la zona horaria de ejemplo en America/Panama', () => {
  assert.equal('CIERRE_HORA' in CONFIG, false);
  assert.equal(CONFIG.TIMEZONE, 'America/Panama');
});

test('CONFIG no guarda secretos', () => {
  const claves = Object.keys(CONFIG).join(' ');
  assert.doesNotMatch(claves, /TOKEN|KEY|SECRET|CLAVE/i);
});

test('CONFIG no se puede modificar en ejecución', () => {
  assert.equal(typeof CONFIG, 'object');
  assert.ok(Object.isFrozen(CONFIG));
  assert.ok(Object.isFrozen(CONFIG.CASAS));
  assert.ok(Object.isFrozen(CONFIG.CASAS.PRINCIPAL));
});

test('el manifiesto usa la misma zona horaria, V8 y Drive v3', () => {
  assert.equal(manifiesto.timeZone, CONFIG.TIMEZONE);
  assert.equal(manifiesto.runtimeVersion, 'V8');
  const drive = manifiesto.dependencies.enabledAdvancedServices.find((s) => s.serviceId === 'drive');
  assert.deepEqual(drive, { userSymbol: 'Drive', serviceId: 'drive', version: 'v3' });
});

test('el manifiesto publica la web app como quien la despliega y abierta a Telegram', () => {
  assert.deepEqual(manifiesto.webapp, { executeAs: 'USER_DEPLOYING', access: 'ANYONE_ANONYMOUS' });
});

test('CONFIG.WEBAPP_URL de prueba es una URL /exec sin parámetros', () => {
  assert.match(CONFIG_PRUEBA.WEBAPP_URL, /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/);
});

test('CONFIG trae el año y los meses de los Excel viejos a importar', () => {
  assert.equal(typeof CONFIG.HISTORIAL_ANIO, 'number');
  assert.ok(CONFIG.HISTORIAL_MESES.every((m) => Number.isInteger(m) && m >= 1 && m <= 12));
});
