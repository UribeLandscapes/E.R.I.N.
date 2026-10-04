const test = require('node:test');
const assert = require('node:assert/strict');

// En Apps Script estos nombres son globales; en Node se ponen a mano, igual que en limpiezaApp.test.js.
global.MESES = require('../src/Hoja.js').MESES;
Object.assign(global, require('../src/Hoja.js'));
Object.assign(global, require('../src/Escritura.js'));
Object.assign(global, require('../src/EscrituraApp.js'));
Object.assign(global, require('../src/Carpetas.js'));
Object.assign(global, require('../src/HojaApp.js'));
Object.assign(global, require('../src/LimpiezaApp.js'));
Object.assign(global, require('../src/Edicion.js'));
Object.assign(global, require('../src/LimpiezaPrueba.js'));
global.leerRegistroEdiciones_ = () => ({ disponible: true, porId: new Map() });
global.registroParaEscribir_ = global.leerRegistroEdiciones_;
global.CONFIG = require('./configPrueba.js').CONFIG;
global.FORMATO_SELLO = require('../src/Mensajes.js').FORMATO_SELLO;

const {
  ESPERA_CANDADO_LIMPIEZA_MS, CLAVE_LIMPIEZA_REVISADA, revisarDatosDePrueba_, borrarDatosDePrueba_,
  dependenciasLimpieza_, revisarDatosDePrueba, borrarDatosDePrueba, huellaDe_,
} = require('../src/LimpiezaPruebaApp.js');
const {
  COLUMNAS, COLUMNAS_ESTADO, FILA_ENCABEZADOS, PRIMERA_FILA_DATOS,
} = require('../src/Hoja.js');
const { PESTANA_ESTADO, PESTANA_HISTORIAL } = require('../src/HojaApp.js');

// --- fakes: Sheets ---

/**
 * Pestaña de mes con celdas de verdad. `filas` desde la fila 6; `extra` filas vacías más al fondo.
 * Anota cada clearContent en `limpiezas` como [fila, columna, filas, columnas].
 */
function hojaMes_(nombre, { filas = [], extra = 0, encabezados = COLUMNAS } = {}) {
  const celdas = new Map();
  const clave = (f, c) => `${f},${c}`;
  encabezados.forEach((v, i) => celdas.set(clave(FILA_ENCABEZADOS, i + 1), v));
  filas.forEach((fila, i) => fila.forEach((v, j) => {
    if (v !== '') celdas.set(clave(PRIMERA_FILA_DATOS + i, j + 1), v);
  }));
  const maxFilas = FILA_ENCABEZADOS + filas.length + extra;
  const hoja = {
    limpiezas: [],
    getName: () => nombre,
    getMaxRows: () => maxFilas,
    getMaxColumns: () => encabezados.length,
    getRange: (f, c, nf = 1, nc = 1) => ({
      getValues: () => Array.from({ length: nf }, (_, i) => Array.from({ length: nc },
        (__, j) => (celdas.has(clave(f + i, c + j)) ? celdas.get(clave(f + i, c + j)) : ''))),
      clearContent: () => { hoja.limpiezas.push([f, c, nf, nc]); },
    }),
  };
  return hoja;
}

function filaFactura_(valores = {}) {
  const fila = Array(COLUMNAS.length).fill('');
  Object.entries(valores).forEach(([nombre, valor]) => { fila[COLUMNAS.indexOf(nombre)] = valor; });
  return fila;
}
const filaBot_ = (n, extra = {}) => filaFactura_({
  FECHA: `2026-09-0${n}`, PROVEEDOR: `Prov ${n}`, 'GASTO (USD)': n, TIPO: 'GASTO', ORIGEN: 'BOT',
  'ID FILA': `BOT-${n}`, ...extra,
});

/** _ESTADO con celdas de verdad; anota cada setValue en `llamadas`. */
function estadoFalso_(filas = []) {
  const celdas = new Map();
  const clave = (f, c) => `${f},${c}`;
  COLUMNAS_ESTADO.forEach((v, i) => celdas.set(clave(1, i + 1), v));
  filas.forEach((fila, i) => COLUMNAS_ESTADO.forEach((c, j) => {
    celdas.set(clave(2 + i, j + 1), c in fila ? fila[c] : '');
  }));
  const hoja = {
    llamadas: [],
    getName: () => PESTANA_ESTADO,
    getLastRow: () => filas.length + 1,
    getRange: (f, c, nf = 1, nc = 1) => {
      const rango = {
        getValues: () => Array.from({ length: nf }, (_, i) => Array.from({ length: nc },
          (__, j) => (celdas.has(clave(f + i, c + j)) ? celdas.get(clave(f + i, c + j)) : ''))),
        setValue: (v) => { hoja.llamadas.push(['setValue', f, c, v]); celdas.set(clave(f, c), v); return rango; },
      };
      return rango;
    },
  };
  return hoja;
}

/** _HISTORIAL: solo se le puede pedir el nombre; cualquier otra cosa revienta. */
function historialIntocable_() {
  return new Proxy({ getName: () => PESTANA_HISTORIAL }, {
    get: (objeto, propiedad) => {
      if (propiedad in objeto) return objeto[propiedad];
      throw new Error(`se tocó _HISTORIAL: ${String(propiedad)}`);
    },
  });
}

function libroFalso_(hojas) {
  const libro = {
    pedidas: [],
    getSheets: () => [...hojas],
    getSheetByName: (n) => { libro.pedidas.push(n); return hojas.find((h) => h.getName() === n) || null; },
  };
  return libro;
}

// --- fakes: Drive ---

const iterador_ = (lista) => {
  let i = 0;
  return { hasNext: () => i < lista.length, next: () => lista[i++] };
};

function archivo_(id, nombre, { enPapelera = false, falla = false } = {}) {
  const a = {
    id, nombre, papelera: enPapelera,
    getId: () => id,
    getName: () => nombre,
    isTrashed: () => a.papelera,
    setTrashed: (v) => {
      if (falla) throw new Error('boom');
      a.papelera = v;
    },
  };
  return a;
}

function carpeta_(nombre, { subcarpetas = [], archivos = [] } = {}) {
  const c = {
    trashed: false,
    getName: () => nombre,
    getFolders: () => iterador_(subcarpetas),
    getFiles: () => iterador_(archivos),
    setTrashed: (v) => { c.trashed = v; },
  };
  return c;
}

// --- fakes: propiedades, candado, dependencias ---

function propiedades_(inicial = {}) {
  const valores = new Map(Object.entries(inicial));
  return {
    valores,
    escrituras: [],
    getProperty: (k) => (valores.has(k) ? valores.get(k) : null),
    setProperty: (k, v) => { valores.set(k, v); },
    deleteProperty: (k) => { valores.delete(k); },
  };
}

/** Escenario típico: septiembre con 2 filas (una manual), _ESTADO con 2 abiertas y 1 cerrada, 3 fotos. */
function escenario_({ conLlave = true, estado = true, manual = false } = {}) {
  const septiembre = hojaMes_('Septiembre 2026', {
    filas: [
      filaBot_(1, { FOTO: 'https://drive.google.com/file/d/ID-ENLAZADA/view' }),
      filaFactura_({ FECHA: '2026-09-02', PROVEEDOR: 'Kiosco', 'DEPÓSITO': 50, TIPO: 'DEPÓSITO',
        ORIGEN: manual ? 'MANUAL' : 'BOT', 'ID FILA': manual ? 'MANUAL-2' : 'BOT-20260929-093000-2-1' }),
    ],
    extra: 10,
  });
  const octubre = hojaMes_('Octubre 2026', { extra: 4 });
  const hojaEstado = estadoFalso_([
    { TIPO: 'PREGUNTA', CLAVE: 99, ESTADO: 'ABIERTA' },
    { TIPO: 'REGISTRO', CLAVE: 'k', ESTADO: 'CERRADA' },
    { TIPO: 'POR-PROCESAR', CLAVE: 'p1', ESTADO: 'ABIERTA' },
  ]);
  const historial = historialIntocable_();
  const hojas = [septiembre, octubre, historial, ...(estado ? [hojaEstado] : [])];
  const enlazada = archivo_('ID-ENLAZADA', 'a.jpg');
  const suelta = archivo_('ID-SUELTA', 'b.jpg');
  const vieja = archivo_('ID-VIEJA', 'c.jpg', { enPapelera: true });
  const mes = carpeta_('9. Septiembre', { archivos: [enlazada, vieja] });
  const carpetaAnio = carpeta_('2026', { subcarpetas: [mes] });
  const porClasificar = carpeta_('Por clasificar', { archivos: [suelta] });
  const raiz = carpeta_('Facturas', { subcarpetas: [porClasificar, carpetaAnio] });
  const props = propiedades_({});
  const candado = { pedidos: [], liberado: 0, tryLock: (ms) => { candado.pedidos.push(ms); return conLlave; },
    releaseLock: () => { candado.liberado += 1; } };
  const registro = [];
  // un solo libro para poder ver qué pestañas se pidieron por nombre
  const libro = libroFalso_(hojas);
  const deps = {
    libro: () => libro, raiz: () => raiz, propiedades: props, candado, log: (l) => registro.push(l),
  };
  return {
    deps, septiembre, octubre, hojaEstado, libro, enlazada, suelta, vieja, mes, carpetaAnio,
    porClasificar, raiz, props, candado, registro,
  };
}

/** Corre la revisión y devuelve el escenario ya revisado (LIMPIEZA_REVISADA guardada). */
function revisado_(opciones) {
  const e = escenario_(opciones);
  revisarDatosDePrueba_(e.deps);
  e.registro.length = 0;
  return e;
}

function conRegistro_(registro, hacer) {
  const leer = global.leerRegistroEdiciones_;
  const escribir = global.registroParaEscribir_;
  global.leerRegistroEdiciones_ = () => registro;
  global.registroParaEscribir_ = () => registro;
  try { hacer(); } finally {
    global.leerRegistroEdiciones_ = leer;
    global.registroParaEscribir_ = escribir;
  }
}

test('fila MANUAL para el borrado aun con huella revisada', () => {
  const e = revisado_({ manual: true });
  assert.deepEqual(borrarDatosDePrueba_(e.deps), [
    'PARO: hay 1 fila(s) MANUAL y 0 fila(s) con celdas editadas a mano; no borro; no se tocó nada',
  ]);
  sinCambios_(e);
});

test('anotación real para el borrado y aparece en revisión', () => {
  const registro = { disponible: true, porId: new Map([['BOT-1', ['PROVEEDOR']]]) };
  conRegistro_(registro, () => {
    const e = escenario_();
    const lineas = revisarDatosDePrueba_(e.deps);
    assert.ok(lineas.includes('  0 fila(s) MANUAL; 1 fila(s) con celdas editadas a mano'));
    assert.deepEqual(borrarDatosDePrueba_(e.deps), [
      'PARO: hay 0 fila(s) MANUAL y 1 fila(s) con celdas editadas a mano; no borro; no se tocó nada',
    ]);
    sinCambios_(e);
  });
});

test('_EDICIONES ilegible para antes de comparar la huella', () => {
  conRegistro_({ disponible: false, porId: new Map() }, () => {
    const e = escenario_();
    assert.deepEqual(borrarDatosDePrueba_(e.deps), [
      'PARO: no se pudo leer _EDICIONES; no borro; no se tocó nada',
    ]);
    sinCambios_(e);
  });
});

test('cambia la huella con los nuevos conteos y con disponibilidad', () => {
  const base = { meses: [{ nombre: 'Septiembre 2026', filas: [1], manuales: 0, anotadas: 0 }],
    registroDisponible: true, abiertas: [], archivos: [] };
  assert.notEqual(huellaDe_(base), huellaDe_({ ...base, meses: [{ ...base.meses[0], anotadas: 1 }] }));
  assert.notEqual(huellaDe_(base), huellaDe_({ ...base, registroDisponible: false }));
});

const sinCambios_ = (e) => {
  assert.deepEqual(e.septiembre.limpiezas, []);
  assert.deepEqual(e.octubre.limpiezas, []);
  assert.deepEqual(e.hojaEstado.llamadas, []);
  assert.equal(e.suelta.papelera, false);
  assert.equal(e.enlazada.papelera, false);
};

// --- revisarDatosDePrueba_ ---

test('revisión lista cada pestaña de mes con sus filas, marca las que no son del bot y la foto', () => {
  const e = escenario_({ manual: true });
  const lineas = revisarDatosDePrueba_(e.deps);
  assert.ok(lineas.includes('Pestaña Septiembre 2026: 2 fila(s) con datos'));
  assert.ok(lineas.includes(
    '  fila 6 | FECHA 2026-09-01 | PROVEEDOR Prov 1 | GASTO (USD) 1 | TIPO GASTO | ORIGEN BOT | FOTO sí',
  ));
  assert.ok(lineas.includes(
    '  fila 7 | FECHA 2026-09-02 | PROVEEDOR Kiosco | DEPÓSITO 50 | TIPO DEPÓSITO | ORIGEN MANUAL | FOTO no | no es del bot',
  ));
  assert.ok(lineas.includes('Pestaña Octubre 2026: 0 fila(s) con datos'));
  assert.equal(lineas.some((l) => l.includes(PESTANA_HISTORIAL)), false);
});

test('revisión muestra la FECHA de una celda de fecha como AAAA-MM-DD', () => {
  const fila = filaBot_(1, { FECHA: new Date('2026-09-03T12:00:00Z') });
  const hoja = hojaMes_('Septiembre 2026', { filas: [fila] });
  const e = escenario_();
  e.deps.libro = () => libroFalso_([hoja]);
  const lineas = revisarDatosDePrueba_(e.deps);
  assert.ok(lineas.some((l) => l.startsWith('  fila 6 | FECHA 2026-09-03 |')));
});

test('revisión lista las entradas ABIERTAS de _ESTADO y los archivos de Drive', () => {
  const e = escenario_();
  const lineas = revisarDatosDePrueba_(e.deps);
  assert.ok(lineas.includes('_ESTADO: 2 entrada(s) abierta(s)'));
  assert.ok(lineas.includes('  fila 2 | TIPO PREGUNTA | CLAVE 99'));
  assert.ok(lineas.includes('  fila 4 | TIPO POR-PROCESAR | CLAVE p1'));
  assert.ok(lineas.includes('Drive: 2 archivo(s) sin papelera bajo Facturas'));
  assert.ok(lineas.includes('  Facturas/Por clasificar/b.jpg | suelta'));
  assert.ok(lineas.includes('  Facturas/2026/9. Septiembre/a.jpg | enlazada'));
  assert.equal(lineas.some((l) => l.includes('c.jpg')), false);
});

test('revisión sin _ESTADO lo dice', () => {
  const e = escenario_({ estado: false });
  const lineas = revisarDatosDePrueba_(e.deps);
  assert.ok(lineas.includes('_ESTADO: no existe'));
});

test('revisión solo escribe LIMPIEZA_REVISADA con la huella y no toca hojas, _ESTADO ni Drive', () => {
  const e = escenario_();
  const escritas = [];
  e.props.setProperty = (k, v) => { escritas.push([k, v]); e.props.valores.set(k, v); };
  const lineas = revisarDatosDePrueba_(e.deps);
  const huella = JSON.stringify({
    meses: [['Septiembre 2026', 2, 0, 0], ['Octubre 2026', 0, 0, 0]],
    registroDisponible: true, abiertas: 2, archivos: 2,
  });
  assert.deepEqual(escritas, [[CLAVE_LIMPIEZA_REVISADA, huella]]);
  assert.ok(lineas.includes(`Huella: ${huella}`));
  assert.deepEqual(e.registro, lineas);
  sinCambios_(e);
  assert.equal(e.libro.pedidas.includes(PESTANA_HISTORIAL), false);
});

// --- borrarDatosDePrueba_: paros ---

test('borrar sin candado para sin tocar nada', () => {
  const e = revisado_();
  e.candado.tryLock = (ms) => { e.candado.pedidos.push(ms); return false; };
  const lineas = borrarDatosDePrueba_(e.deps);
  assert.deepEqual(lineas, ['PARO: no se pudo tomar el candado; no se tocó nada']);
  assert.deepEqual(e.candado.pedidos, [ESPERA_CANDADO_LIMPIEZA_MS]);
  assert.equal(e.candado.liberado, 0);
  sinCambios_(e);
  assert.ok(e.props.valores.has(CLAVE_LIMPIEZA_REVISADA));
});

test('borrar sin revisión previa para y libera el candado', () => {
  const e = escenario_();
  const lineas = borrarDatosDePrueba_(e.deps);
  assert.deepEqual(lineas, ['PARO: falta la revisión; corre revisarDatosDePrueba primero; no se tocó nada']);
  assert.equal(e.candado.liberado, 1);
  sinCambios_(e);
});

test('borrar con la huella distinta para: algo cambió desde la revisión', () => {
  const e = revisado_();
  e.porClasificar.getFiles = () => iterador_([e.suelta, archivo_('ID-NUEVA', 'nueva.jpg')]);
  const lineas = borrarDatosDePrueba_(e.deps);
  assert.deepEqual(lineas, [
    'PARO: algo cambió desde la revisión; corre revisarDatosDePrueba de nuevo; no se tocó nada',
  ]);
  assert.equal(e.candado.liberado, 1);
  sinCambios_(e);
  assert.ok(e.props.valores.has(CLAVE_LIMPIEZA_REVISADA));
});

test('la huella detecta también una fila nueva en una pestaña', () => {
  const e = revisado_();
  const otra = hojaMes_('Septiembre 2026', { filas: [filaBot_(1), filaBot_(2), filaBot_(3)] });
  e.deps.libro = () => libroFalso_([otra, e.hojaEstado]);
  assert.match(borrarDatosDePrueba_(e.deps)[0], /^PARO: algo cambió/);
});

// --- borrarDatosDePrueba_: camino feliz ---

test('borrar vacía pestañas menos GRUPO, cierra _ESTADO, manda archivos a la papelera y borra las propiedades', () => {
  const e = revisado_();
  const lineas = borrarDatosDePrueba_(e.deps);
  const ultimaColumna = COLUMNAS.length - 1; // GRUPO es la última y se salta
  // filas 6..max (17 en septiembre, 9 en octubre), todas las columnas menos GRUPO, un solo bloque
  assert.deepEqual(e.septiembre.limpiezas, [[PRIMERA_FILA_DATOS, 1, 12, ultimaColumna]]);
  assert.deepEqual(e.octubre.limpiezas, [[PRIMERA_FILA_DATOS, 1, 4, ultimaColumna]]);
  assert.deepEqual(e.hojaEstado.llamadas, [
    ['setValue', 2, COLUMNAS_ESTADO.indexOf('ESTADO') + 1, 'CERRADA'],
    ['setValue', 4, COLUMNAS_ESTADO.indexOf('ESTADO') + 1, 'CERRADA'],
  ]);
  assert.equal(e.suelta.papelera, true);
  assert.equal(e.enlazada.papelera, true);
  assert.equal(e.vieja.papelera, true); // ya lo estaba; no se le pidió nada
  assert.equal([e.raiz, e.carpetaAnio, e.mes, e.porClasificar].some((c) => c.trashed), false);
  assert.equal(e.props.valores.has(CLAVE_LIMPIEZA_REVISADA), false);
  assert.equal(e.candado.liberado, 1);
  assert.deepEqual(lineas, [
    'Pestañas de mes: 2 fila(s) con datos vaciadas en 2 pestaña(s)',
    '_ESTADO: 2 entrada(s) cerrada(s)',
    'Drive: 2 archivo(s) enviados a la papelera',
    'LIMPIEZA_REVISADA: borrada',
  ]);
  assert.deepEqual(e.registro, lineas);
});

test('borrar nunca toca _HISTORIAL (ni siquiera la pide por nombre)', () => {
  const e = revisado_();
  borrarDatosDePrueba_(e.deps);
  assert.equal(e.libro.pedidas.includes(PESTANA_HISTORIAL), false);
});

test('borrar limpia por bloques contiguos de columnas, saltando las de desborde', () => {
  const encabezados = ['FECHA', 'SUBTOTAL FACTURA', 'PROVEEDOR', 'FOTO', 'GRUPO', 'ORIGEN'];
  const hoja = hojaMes_('Septiembre 2026', { encabezados, extra: 3 });
  const e = escenario_();
  e.deps.libro = () => libroFalso_([hoja]);
  revisarDatosDePrueba_(e.deps);
  borrarDatosDePrueba_(e.deps);
  assert.deepEqual(hoja.limpiezas, [
    [PRIMERA_FILA_DATOS, 1, 3, 1],
    [PRIMERA_FILA_DATOS, 3, 3, 2],
    [PRIMERA_FILA_DATOS, 6, 3, 1],
  ]);
});

test('borrar no limpia nada en una pestaña sin filas de datos (solo encabezados)', () => {
  const hoja = hojaMes_('Septiembre 2026');
  const e = escenario_();
  e.deps.libro = () => libroFalso_([hoja]);
  revisarDatosDePrueba_(e.deps);
  borrarDatosDePrueba_(e.deps);
  assert.deepEqual(hoja.limpiezas, []);
});

test('borrar sin _ESTADO igual termina y lo dice', () => {
  const e = revisado_({ estado: false });
  const lineas = borrarDatosDePrueba_(e.deps);
  assert.ok(lineas.includes('_ESTADO: 0 entrada(s) cerrada(s)'));
  assert.equal(e.props.valores.has(CLAVE_LIMPIEZA_REVISADA), false);
});

// --- borrarDatosDePrueba_: fallas ---

test('si una etapa falla registra cuál, relanza, deja hechas las anteriores y no borra la revisión', () => {
  const e = revisado_();
  const mala = archivo_('ID-MALA', 'mala.jpg', { falla: true });
  e.porClasificar.getFiles = () => iterador_([e.suelta, mala]);
  // la huella cuenta 3 archivos ahora: se repite la revisión con la carpeta ya modificada
  revisarDatosDePrueba_(e.deps);
  e.registro.length = 0;
  assert.throws(() => borrarDatosDePrueba_(e.deps), /boom/);
  assert.equal(e.registro.some((l) => l === 'ERROR en la etapa Drive: boom'), true);
  assert.equal(e.septiembre.limpiezas.length, 1);
  assert.equal(e.hojaEstado.llamadas.length, 2);
  assert.equal(e.props.valores.has(CLAVE_LIMPIEZA_REVISADA), true);
  assert.equal(e.candado.liberado, 1);
});

test('un error que no es Error también se registra', () => {
  const e = revisado_();
  e.deps.propiedades.deleteProperty = () => { throw 'texto plano'; }; // eslint-disable-line no-throw-literal
  assert.throws(() => borrarDatosDePrueba_(e.deps), (x) => x === 'texto plano');
  assert.ok(e.registro.includes('ERROR en la etapa LIMPIEZA_REVISADA: texto plano'));
});

// --- entradas del editor ---

test('dependenciasLimpieza_ arma libro, carpeta, propiedades, candado y registro reales', () => {
  const ss = libroFalso_([]);
  const raiz = carpeta_('Facturas');
  const abiertas = [];
  const registrado = [];
  const props = propiedades_();
  const candado = {};
  global.SpreadsheetApp = { openById: (id) => { abiertas.push(['hoja', id]); return ss; } };
  global.DriveApp = { getFolderById: (id) => { abiertas.push(['carpeta', id]); return raiz; } };
  global.PropertiesService = { getScriptProperties: () => props };
  global.LockService = { getScriptLock: () => candado };
  global.Logger = { log: (t) => registrado.push(t) };
  try {
    const d = dependenciasLimpieza_();
    assert.equal(d.libro(), ss);
    assert.equal(d.raiz(), raiz);
    assert.equal(d.propiedades, props);
    assert.equal(d.candado, candado);
    d.log('hola');
    assert.deepEqual(abiertas, [['hoja', CONFIG.SHEET_ID], ['carpeta', CONFIG.FACTURAS_FOLDER_ID]]);
    assert.deepEqual(registrado, ['hola']);
  } finally {
    ['SpreadsheetApp', 'DriveApp', 'PropertiesService', 'LockService', 'Logger'].forEach((n) => delete global[n]);
  }
});

test('revisarDatosDePrueba y borrarDatosDePrueba corren el núcleo con las dependencias reales', () => {
  const e = escenario_();
  global.SpreadsheetApp = { openById: () => e.libro };
  global.DriveApp = { getFolderById: () => e.raiz };
  global.PropertiesService = { getScriptProperties: () => e.props };
  global.LockService = { getScriptLock: () => e.candado };
  global.Logger = { log: (t) => e.registro.push(t) };
  try {
    const revision = revisarDatosDePrueba();
    assert.ok(revision.some((l) => l.startsWith('Huella: ')));
    const borrado = borrarDatosDePrueba();
    assert.ok(borrado.includes('LIMPIEZA_REVISADA: borrada'));
  } finally {
    ['SpreadsheetApp', 'DriveApp', 'PropertiesService', 'LockService', 'Logger'].forEach((n) => delete global[n]);
  }
});
