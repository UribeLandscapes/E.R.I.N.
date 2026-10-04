const test = require('node:test');
const assert = require('node:assert/strict');

global.CONFIG = require('./configPrueba.js').CONFIG;
Object.assign(global, require('../src/Espejo.js'));

const {
  copiarAExcelConDeps_, dependenciasEspejoReales_, copiarAExcel, CLAVE_ESPEJO_ULTIMA_COPIA,
  ESPERA_CANDADO_ESPEJO_MS,
} = require('../src/EspejoApp.js');

const { CONFIG } = global;

/** Entorno de fakes: avanzaAlExportar simula una edición hecha mientras dura el export. */
function entorno({
  modificada = 5000, previa = null, codigo = 200, candado = true, falloUpdate = null, avanzaAlExportar = 0,
} = {}) {
  const estado = { modificada, propiedad: previa, llamadas: [], logs: [], tipo: null };
  const blob = { setContentType: (t) => { estado.tipo = t; return blob; } };
  const deps = {
    candado: {
      tryLock: (ms) => { estado.llamadas.push(['tryLock', ms]); return candado; },
      releaseLock: () => estado.llamadas.push(['releaseLock']),
    },
    ultimaModificacion: () => estado.modificada,
    leerUltimaCopia: () => estado.propiedad,
    guardarUltimaCopia: (v) => { estado.propiedad = v; estado.llamadas.push(['guardar', v]); },
    exportarXlsx: () => {
      estado.llamadas.push(['exportar']);
      estado.modificada += avanzaAlExportar;
      return { getResponseCode: () => codigo, getContentText: () => 'cuerpo de error', getBlob: () => blob };
    },
    sobrescribirExcel: (b) => {
      estado.llamadas.push(['update', b]);
      if (falloUpdate) throw falloUpdate;
    },
    log: (t) => estado.logs.push(t),
  };
  return { deps, estado, blob };
}

const nombres = (estado) => estado.llamadas.map((l) => l[0]);

test('sin propiedad guardada copia y guarda la marca leída antes del export', () => {
  const { deps, estado, blob } = entorno({ modificada: 5000 });
  copiarAExcelConDeps_(deps);
  assert.deepEqual(nombres(estado), ['tryLock', 'exportar', 'update', 'guardar', 'releaseLock']);
  assert.equal(estado.propiedad, '5000');
  assert.equal(estado.tipo, TIPO_XLSX);
  assert.equal(estado.llamadas.find((l) => l[0] === 'update')[1], blob);
});

test('sin cambios no exporta, no escribe y no guarda nada', () => {
  const { deps, estado } = entorno({ modificada: 5000, previa: '5000' });
  copiarAExcelConDeps_(deps);
  assert.deepEqual(nombres(estado), ['tryLock', 'releaseLock']);
  assert.equal(estado.propiedad, '5000');
  assert.equal(estado.logs.length, 1);
  assert.match(estado.logs[0], /sin cambios/);
});

test('con cambios copia y avanza la marca', () => {
  const { deps, estado } = entorno({ modificada: 7000, previa: '5000' });
  copiarAExcelConDeps_(deps);
  assert.deepEqual(nombres(estado), ['tryLock', 'exportar', 'update', 'guardar', 'releaseLock']);
  assert.equal(estado.propiedad, '7000');
});

test('HTTP distinto de 200 lanza, no escribe el Excel ni cambia la propiedad', () => {
  const { deps, estado } = entorno({ modificada: 7000, previa: '5000', codigo: 500 });
  assert.throws(() => copiarAExcelConDeps_(deps), /HTTP 500/);
  assert.ok(!nombres(estado).includes('update'));
  assert.equal(estado.propiedad, '5000');
  assert.ok(nombres(estado).includes('releaseLock'));
  assert.ok(estado.logs.some((l) => l.includes('500') && l.includes('cuerpo de error')));
});

test('si Drive.Files.update falla el error sube y la propiedad no cambia', () => {
  const { deps, estado } = entorno({ modificada: 7000, previa: '5000', falloUpdate: new Error('cuota') });
  assert.throws(() => copiarAExcelConDeps_(deps), /cuota/);
  assert.equal(estado.propiedad, '5000');
  assert.ok(!nombres(estado).includes('guardar'));
  assert.ok(nombres(estado).includes('releaseLock'));
  assert.ok(estado.logs.some((l) => l.includes('cuota')));
});

test('candado ocupado: registra, no exporta ni libera un candado que no tomó', () => {
  const { deps, estado } = entorno({ modificada: 7000, previa: '5000', candado: false });
  copiarAExcelConDeps_(deps);
  assert.deepEqual(nombres(estado), ['tryLock']);
  assert.deepEqual(estado.llamadas[0], ['tryLock', ESPERA_CANDADO_ESPEJO_MS]);
  assert.match(estado.logs[0], /candado/);
});

test('guarda la marca leída antes del export aunque la hoja avance durante el export', () => {
  const { deps, estado } = entorno({ modificada: 7000, previa: '5000', avanzaAlExportar: 900 });
  copiarAExcelConDeps_(deps);
  assert.equal(estado.propiedad, '7000');
  // Próximo tick: la hoja (7900) es más nueva que la marca, vuelve a copiar.
  const otra = { ...deps, ultimaModificacion: () => estado.modificada };
  copiarAExcelConDeps_(otra);
  assert.equal(estado.propiedad, '7900');
});

test('si falla guardar la marca el error sube y el candado se libera', () => {
  const { deps, estado } = entorno({ modificada: 7000, previa: '5000' });
  deps.guardarUltimaCopia = () => { throw new Error('propiedades caídas'); };
  assert.throws(() => copiarAExcelConDeps_(deps), /propiedades caídas/);
  assert.ok(nombres(estado).includes('releaseLock'));
});

test('si leer la última modificación falla el error sube y se libera el candado', () => {
  const { deps, estado } = entorno();
  deps.ultimaModificacion = () => { throw new Error('sin acceso a la hoja'); };
  assert.throws(() => copiarAExcelConDeps_(deps), /sin acceso a la hoja/);
  assert.ok(nombres(estado).includes('releaseLock'));
});

// --- dependencias reales y función global ---

function simularGoogle({ modificada = 9000, previa = null, codigo = 200 } = {}) {
  const registro = { llamadas: [], logs: [], propiedades: previa === null ? {} : { [CLAVE_ESPEJO_ULTIMA_COPIA]: previa } };
  const blob = { setContentType: (t) => { registro.llamadas.push(['tipo', t]); return blob; } };
  global.DriveApp = {
    getFileById: (id) => (registro.llamadas.push(['getFileById', id]),
    { getLastUpdated: () => new Date(modificada) }),
  };
  global.UrlFetchApp = {
    fetch: (url, opciones) => (registro.llamadas.push(['fetch', url, opciones]),
    { getResponseCode: () => codigo, getContentText: () => 'error', getBlob: () => blob }),
  };
  global.ScriptApp = { getOAuthToken: () => 'TOKEN' };
  global.Drive = {
    Files: { update: (recurso, id, b) => registro.llamadas.push(['update', recurso, id, b]) },
  };
  global.PropertiesService = {
    getScriptProperties: () => ({
      getProperty: (k) => (k in registro.propiedades ? registro.propiedades[k] : null),
      setProperty: (k, v) => { registro.propiedades[k] = v; },
    }),
  };
  global.LockService = {
    getScriptLock: () => ({ tryLock: () => true, releaseLock: () => registro.llamadas.push(['releaseLock']) }),
  };
  global.Logger = { log: (t) => registro.logs.push(t) };
  return { registro, blob };
}

function limpiarGoogle() {
  for (const g of ['DriveApp', 'UrlFetchApp', 'ScriptApp', 'Drive', 'PropertiesService', 'LockService', 'Logger']) {
    delete global[g];
  }
}

test('copiarAExcel: usa URL, encabezado, tipo y archivo correctos y guarda la marca', () => {
  const { registro, blob } = simularGoogle({ modificada: 9000 });
  try {
    copiarAExcel();
    assert.deepEqual(registro.llamadas.find((l) => l[0] === 'getFileById'), ['getFileById', CONFIG.SHEET_ID]);
    const fetch = registro.llamadas.find((l) => l[0] === 'fetch');
    assert.equal(fetch[1], `https://docs.google.com/spreadsheets/d/${CONFIG.SHEET_ID}/export?format=xlsx`);
    assert.deepEqual(fetch[2], { headers: { Authorization: 'Bearer TOKEN' }, muteHttpExceptions: true });
    assert.deepEqual(registro.llamadas.find((l) => l[0] === 'tipo'), ['tipo', TIPO_XLSX]);
    assert.deepEqual(registro.llamadas.find((l) => l[0] === 'update'), ['update', {}, CONFIG.EXCEL_ESPEJO_ID, blob]);
    assert.equal(registro.propiedades[CLAVE_ESPEJO_ULTIMA_COPIA], '9000');
  } finally {
    limpiarGoogle();
  }
});

test('copiarAExcel: con la marca al día no llama a fetch ni a update', () => {
  const { registro } = simularGoogle({ modificada: 9000, previa: '9000' });
  try {
    copiarAExcel();
    assert.ok(!registro.llamadas.some((l) => l[0] === 'fetch' || l[0] === 'update'));
  } finally {
    limpiarGoogle();
  }
});

test('dependenciasEspejoReales_: expone las dependencias que usa el núcleo', () => {
  simularGoogle();
  try {
    const deps = dependenciasEspejoReales_();
    for (const clave of ['candado', 'ultimaModificacion', 'leerUltimaCopia', 'guardarUltimaCopia',
      'exportarXlsx', 'sobrescribirExcel', 'log']) {
      assert.ok(clave in deps, clave);
    }
  } finally {
    limpiarGoogle();
  }
});
