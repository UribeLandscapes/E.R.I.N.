const test = require('node:test');
const assert = require('node:assert/strict');

// En Apps Script estos nombres son globales (Hoja.js, Escritura.js, Config.js); en
// Node se ponen a mano. filaEsLibre_ la usa agregarColumnaCasa_ para no pisar filas libres.
global.MESES = require('../src/Hoja.js').MESES;
Object.assign(global, require('../src/Hoja.js'));
Object.assign(global, require('../src/Escritura.js'));
Object.assign(global, require('../src/EscrituraApp.js')); // celdaEstado_, PREGUNTA_CERRADA
global.CONFIG = require('./configPrueba.js').CONFIG;
global.PESTANA_EDICIONES = require('../src/Ediciones.js').PESTANA_EDICIONES; // global en Apps Script

const {
  crearPestanaMes_, configurarHoja_, configurarHoja, leerAnioMes_, describirHoja_, verHoja,
  agregarColumnaCasa_, agregarColumnaCasa, migrarUnaFila_, migrarUnaFila, anteriorDe_,
  PESTANA_ESTADO, protegerPestanaInterna_, protegerPestanasInternas_, protegerPestanasInternas,
  crearPestanaOculta_, DESCRIPCION_PROTECCION_INTERNA,
} = require('../src/HojaApp.js');
const {
  COLORES, formulaGrupo_, reglasFormato_, FILA_ENCABEZADOS, PRIMERA_FILA_DATOS,
  numeroColumna_, letra_, COLUMNAS, COLUMNAS_ESTADO,
} = require('../src/Hoja.js');

/** Rango falso: guarda cada llamada como [método,...argumentos] y se devuelve a sí mismo. */
function rangoFalso(hoja, ref) {
  const rango = new Proxy({}, {
    get: (_, metodo) => (...args) => {
      // Como Sheets: getFormula devuelve '' si la celda no tiene fórmula (p. ej. un número literal).
      if (metodo === 'getFormula') return hoja.formulas[ref] ?? '';
      hoja.llamadas.push([ref, metodo, ...args]);
      if (metodo === 'protect') return proteccionFalsa(hoja, ref);
      return rango;
    },
  });
  return rango;
}

/**
 * Envuelve un registro {ref, descripcion, soloAviso} con los métodos de Protection que se
 * necesitan: seguir configurándolo (protect recién llamado) o, más tarde, leerlo/quitarlo
 * (getProtections). remove lo saca del arreglo `protecciones` de la hoja.
 */
function vistaProteccion_(hoja, registro) {
  const vista = {
    setDescription: (d) => { registro.descripcion = d; return vista; },
    setWarningOnly: (v) => { registro.soloAviso = v; return vista; },
    getDescription: () => registro.descripcion,
    remove: () => {
      const i = hoja.protecciones.indexOf(registro);
      if (i >= 0) hoja.protecciones.splice(i, 1);
    },
  };
  return vista;
}

function proteccionFalsa(hoja, ref) {
  const registro = { ref };
  hoja.protecciones.push(registro);
  return vistaProteccion_(hoja, registro);
}

const DUENO = 'dueno@x';

/** Protección de hoja completa falsa: editores, solo-aviso y edición por dominio. El dueño no se quita. */
function proteccionHojaFalsa_(registro) {
  const p = {
    setDescription: (d) => { registro.descripcion = d; return p; },
    getDescription: () => registro.descripcion,
    isWarningOnly: () => registro.soloAviso,
    setWarningOnly: (v) => { registro.soloAviso = v; return p; },
    getEditors: () => [...registro.editores],
    removeEditors: (lista) => { registro.editores = registro.editores.filter((e) => e === DUENO || !lista.includes(e)); return p; },
    canDomainEdit: () => registro.dominio,
    setDomainEdit: (v) => { registro.dominio = v; return p; },
  };
  return p;
}

function hojaFalsa(nombre, { oculta = false, filas = 0, columnas = 0 } = {}) {
  const hoja = {
    nombre, oculta, llamadas: [], formulas: {}, protecciones: [], proteccionesHoja: [], reglas: null, congeladas: 0, columnasOcultas: null,
    getName: () => hoja.nombre,
    isSheetHidden: () => hoja.oculta,
    getLastRow: () => filas,
    getLastColumn: () => columnas,
    getRange: (...args) => rangoFalso(hoja, args.join(',')),
    setFrozenRows: (n) => { hoja.congeladas = n; },
    hideColumns: (desde, cuantas) => { hoja.columnasOcultas = [desde, cuantas]; },
    hideSheet: () => { hoja.oculta = true; },
    setConditionalFormatRules: (r) => { hoja.reglas = r; },
    getProtections: (tipo) => (tipo === 'SHEET'
      ? hoja.proteccionesHoja.map(proteccionHojaFalsa_)
      : hoja.protecciones.map((r) => vistaProteccion_(hoja, r))),
    protect: () => {
      const registro = { descripcion: '', soloAviso: false, editores: [DUENO, 'usuario@x'], dominio: true };
      hoja.proteccionesHoja.push(registro);
      return proteccionHojaFalsa_(registro);
    },
  };
  return hoja;
}

function libroFalso(nombres) {
  const hojas = nombres.map((n) => (typeof n === 'string' ? hojaFalsa(n) : n));
  return {
    hojas,
    getSheets: () => [...hojas],
    getSheetByName: (n) => hojas.find((h) => h.nombre === n) || null,
    insertSheet: (nombre, indice) => {
      const h = hojaFalsa(nombre);
      hojas.splice(indice, 0, h);
      return h;
    },
  };
}

/** Constructor falso de reglas de formato condicional. */
global.SpreadsheetApp = {
  ProtectionType: { RANGE: 'RANGE', SHEET: 'SHEET' },
  newConditionalFormatRule: () => {
    const regla = {};
    const b = {
      whenFormulaSatisfied: (f) => { regla.formula = f; return b; },
      setBackground: (c) => { regla.fondo = c; return b; },
      setRanges: (r) => { regla.rangos = r; return b; },
      setBold: (v) => { regla.negrita = v; return b; },
      build: () => regla,
    };
    return b;
  },
};

const llamadasA = (hoja, ref, metodo) => hoja.llamadas.filter(([r, m]) => r === ref && m === metodo);

// --- crearPestanaMes_ ---

test('crea la pestaña del mes con título, resumen, encabezados y la fórmula de GRUPO (Y5)', () => {
  const ss = libroFalso(['Hoja 1']);
  const r = crearPestanaMes_(ss, 2026, 9);
  assert.deepEqual(r, { nombre: 'Septiembre 2026', indice: 0, anterior: null, siguiente: null });
  const hoja = ss.getSheetByName('Septiembre 2026');
  assert.equal(ss.hojas[0], hoja);
  assert.deepEqual(llamadasA(hoja, 'A1:S1', 'setValue'), [['A1:S1', 'setValue', 'Caja chica · Septiembre 2026']]);
  assert.deepEqual(llamadasA(hoja, 'A1:S1', 'setFontFamily'), [['A1:S1', 'setFontFamily', 'Lora']]);
  assert.deepEqual(llamadasA(hoja, 'A1:S1', 'setFontStyle'), [['A1:S1', 'setFontStyle', 'italic']]);
  assert.deepEqual(llamadasA(hoja, 'A1:S1', 'setBackground'), [['A1:S1', 'setBackground', COLORES.CREMA]]);
  assert.equal(llamadasA(hoja, 'A3:F3', 'setFormulas')[0][2][0][0], '=0');
  const encabezados = llamadasA(hoja, 'A5:Y5', 'setValues')[0][2][0];
  assert.equal(encabezados.length, 25);
  assert.deepEqual(llamadasA(hoja, 'A5:Y5', 'setBackground'), [['A5:Y5', 'setBackground', COLORES.CACAO]]);
  assert.deepEqual(llamadasA(hoja, 'A5:Y5', 'setFontWeight'), [['A5:Y5', 'setFontWeight', 'bold']]);
  // GRUPO es la única fórmula del encabezado: SUBTOTAL FACTURA ya no existe.
  assert.deepEqual(llamadasA(hoja, 'Y5', 'setFormula'), [['Y5', 'setFormula', formulaGrupo_()]]);
  assert.deepEqual(hoja.llamadas.filter((l) => l[1] === 'setFormula' && l[0] !== 'Y5' && l[0] !== 'A3:F3'), []);
});

test('congela 5 filas, oculta T–Y, pone formatos, colores y protege solo GRUPO con aviso', () => {
  const ss = libroFalso([]);
  crearPestanaMes_(ss, 2026, 9);
  const hoja = ss.hojas[0];
  assert.equal(hoja.congeladas, 5);
  assert.deepEqual(hoja.columnasOcultas, [20, 6]);
  assert.deepEqual(llamadasA(hoja, 'A6:Y', 'setFontColor'), [['A6:Y', 'setFontColor', COLORES.MUSGO]]);
  assert.deepEqual(llamadasA(hoja, 'A6:A', 'setNumberFormat'), [['A6:A', 'setNumberFormat', 'yyyy-mm-dd']]);
  assert.deepEqual(llamadasA(hoja, 'V6:V', 'setNumberFormat'), [['V6:V', 'setNumberFormat', 'yyyy-mm-dd hh:mm:ss']]);
  assert.deepEqual(hoja.reglas.map((r) => r.formula), reglasFormato_().map((r) => r.formula));
  assert.deepEqual(hoja.reglas.map((r) => r.fondo), reglasFormato_().map((r) => r.fondo));
  // Ya no hay regla en negrita: la del subtotal distinto se fue con SUBTOTAL FACTURA.
  assert.ok(hoja.reglas.every((r) => r.negrita === undefined));
  assert.deepEqual(hoja.protecciones.map((p) => [p.ref, p.soloAviso]), [['Y5:Y', true]]);
});

test('entre dos meses: saldo inicial desde el anterior y solo el A3 del siguiente cambia', () => {
  const ss = libroFalso(['Agosto 2026', 'Octubre 2026', '_ESTADO']);
  ss.getSheetByName('Octubre 2026').formulas.A3 = "='Agosto 2026'!E3"; // encadenado al anterior
  const r = crearPestanaMes_(ss, 2026, 9);
  assert.deepEqual(r, { nombre: 'Septiembre 2026', indice: 1, anterior: 'Agosto 2026', siguiente: 'Octubre 2026' });
  assert.deepEqual(ss.hojas.map((h) => h.nombre), ['Agosto 2026', 'Septiembre 2026', 'Octubre 2026', '_ESTADO']);
  assert.equal(llamadasA(ss.hojas[1], 'A3:F3', 'setFormulas')[0][2][0][0], "='Agosto 2026'!E3");
  assert.deepEqual(ss.getSheetByName('Octubre 2026').llamadas, [['A3', 'setFormula', "='Septiembre 2026'!E3"]]);
  assert.deepEqual(ss.getSheetByName('Agosto 2026').llamadas, []);
  assert.deepEqual(ss.getSheetByName('_ESTADO').llamadas, []);
});

test('mes siguiente con A3 literal 0 y sin mes anterior: su A3 no se toca (caso factura de julio 2025)', () => {
  const ss = libroFalso(['Julio 2025 (archivo)', 'Septiembre 2026', '_ESTADO']);
  const r = crearPestanaMes_(ss, 2025, 7);
  assert.deepEqual(r, { nombre: 'Julio 2025', indice: 1, anterior: null, siguiente: 'Septiembre 2026' });
  assert.deepEqual(ss.getSheetByName('Septiembre 2026').llamadas, []);
});

test('mes faltante en medio: el A3 del siguiente, encadenado al anterior, pasa a apuntar al nuevo', () => {
  const ss = libroFalso(['Agosto 2026', 'Octubre 2026']);
  ss.getSheetByName('Octubre 2026').formulas.A3 = "='Agosto 2026'!E3";
  crearPestanaMes_(ss, 2026, 9);
  assert.deepEqual(ss.getSheetByName('Octubre 2026').llamadas, [['A3', 'setFormula', "='Septiembre 2026'!E3"]]);
});

test('mes siguiente con otra fórmula en A3: no se toca', () => {
  const ss = libroFalso(['Agosto 2026', 'Octubre 2026']);
  ss.getSheetByName('Octubre 2026').formulas.A3 = '=100+5';
  crearPestanaMes_(ss, 2026, 9);
  assert.deepEqual(ss.getSheetByName('Octubre 2026').llamadas, []);
});

test('mes siguiente encadenado a un mes distinto del anterior real: no se toca', () => {
  const ss = libroFalso(['Julio 2026', 'Octubre 2026']);
  ss.getSheetByName('Octubre 2026').formulas.A3 = "='Agosto 2026'!E3";
  crearPestanaMes_(ss, 2026, 9);
  assert.deepEqual(ss.getSheetByName('Octubre 2026').llamadas, []);
});

test('creación hacia adelante: el saldo inicial de la pestaña nueva viene del E3 del anterior', () => {
  const ss = libroFalso(['Agosto 2026']);
  crearPestanaMes_(ss, 2026, 9);
  assert.equal(llamadasA(ss.getSheetByName('Septiembre 2026'), 'A3:F3', 'setFormulas')[0][2][0][0], "='Agosto 2026'!E3");
  assert.deepEqual(ss.getSheetByName('Agosto 2026').llamadas, []);
});

// --- configurarHoja_ ---

test('hoja vacía: crea el mes, _ESTADO y _HISTORIAL (ocultas, al final) sin tocar Hoja 1', () => {
  const ss = libroFalso(['Hoja 1']);
  const lineas = configurarHoja_(ss, 2026, 9);
  assert.deepEqual(lineas, [
    'Septiembre 2026: creada en la posición 1, saldo inicial 0',
    '_ESTADO: creada y oculta',
    '_HISTORIAL: creada y oculta',
  ]);
  assert.deepEqual(ss.hojas.map((h) => h.nombre), ['Septiembre 2026', 'Hoja 1', '_ESTADO', '_HISTORIAL']);
  assert.deepEqual(ss.getSheetByName('Hoja 1').llamadas, []);
  const estado = ss.getSheetByName('_ESTADO');
  assert.equal(estado.oculta, true);
  assert.equal(estado.congeladas, 1);
  assert.deepEqual(llamadasA(estado, '1,1,1,6', 'setValues')[0][2], [[...COLUMNAS_ESTADO]]);
  const historial = ss.getSheetByName('_HISTORIAL');
  assert.deepEqual(llamadasA(historial, '1,1,1,8', 'setValues')[0][2], [[...COLUMNAS_HISTORIAL]]);
});

test('correrla dos veces no cambia nada la segunda vez', () => {
  const ss = libroFalso(['Hoja 1']);
  configurarHoja_(ss, 2026, 9);
  const antes = ss.hojas.map((h) => [h.nombre, h.llamadas.length]);
  const lineas = configurarHoja_(ss, 2026, 9);
  assert.deepEqual(lineas, [
    'Septiembre 2026: ya existe, sin cambios',
    '_ESTADO: ya existe, sin cambios',
    '_HISTORIAL: ya existe, sin cambios',
  ]);
  assert.deepEqual(ss.hojas.map((h) => [h.nombre, h.llamadas.length]), antes);
});

test('reconoce la pestaña del mes aunque esté escrita en minúsculas', () => {
  const ss = libroFalso(['septiembre 2026', '_ESTADO', '_HISTORIAL']);
  assert.equal(configurarHoja_(ss, 2026, 9)[0], 'Septiembre 2026: ya existe, sin cambios');
  assert.equal(ss.hojas.length, 3);
});

test('si hay un mes posterior, el registro dice que su saldo inicial cambió', () => {
  const ss = libroFalso(['Agosto 2026', 'Octubre 2026', '_ESTADO', '_HISTORIAL']);
  const lineas = configurarHoja_(ss, 2026, 9);
  assert.deepEqual(lineas.slice(0, 2), [
    'Septiembre 2026: creada en la posición 2, saldo inicial desde Agosto 2026',
    'Octubre 2026: saldo inicial ahora sale de Septiembre 2026',
  ]);
});

test('configurarHoja abre la hoja de CONFIG, usa el mes de Panamá y registra cada línea', () => {
  const ss = libroFalso(['Septiembre 2026', '_ESTADO', '_HISTORIAL']);
  const registrado = [];
  const abiertas = [];
  const original = global.SpreadsheetApp;
  global.SpreadsheetApp = { ...original, openById: (id) => { abiertas.push(id); return ss; } };
  global.Utilities = { formatDate: (_, zona, patron) => (zona === 'America/Panama' && patron === 'yyyy-M' ? '2026-9' : 'mal') };
  global.Logger = { log: (t) => registrado.push(t) };
  try {
    const lineas = configurarHoja();
    assert.deepEqual(abiertas, [CONFIG.SHEET_ID]);
    assert.deepEqual(registrado, lineas);
    assert.equal(lineas[0], 'Septiembre 2026: ya existe, sin cambios');
  } finally {
    global.SpreadsheetApp = original;
    delete global.Utilities;
    delete global.Logger;
  }
});

test('leerAnioMes_ convierte "2026-9" y "2027-12"', () => {
  assert.deepEqual(leerAnioMes_('2026-9'), { anio: 2026, mes: 9 });
  assert.deepEqual(leerAnioMes_('2027-12'), { anio: 2027, mes: 12 });
});

// --- verHoja ---

test('describirHoja_ lista nombre, visibilidad y tamaño usado sin modificar nada', () => {
  const ss = libroFalso([hojaFalsa('Hoja 1', { filas: 0, columnas: 0 }), hojaFalsa('Julio 2026', { oculta: true, filas: 40, columnas: 17 })]);
  assert.deepEqual(describirHoja_(ss), [
    '1. Hoja 1 | visible | 0 filas × 0 columnas con datos',
    '2. Julio 2026 | oculta | 40 filas × 17 columnas con datos',
  ]);
  assert.ok(ss.hojas.every((h) => h.llamadas.length === 0));
});

test('verHoja abre la hoja de CONFIG y registra la descripción', () => {
  const ss = libroFalso(['Hoja 1']);
  const registrado = [];
  const original = global.SpreadsheetApp;
  global.SpreadsheetApp = { openById: () => ss };
  global.Logger = { log: (t) => registrado.push(t) };
  try {
    assert.deepEqual(verHoja(), ['1. Hoja 1 | visible | 0 filas × 0 columnas con datos']);
    assert.deepEqual(registrado, ['1. Hoja 1 | visible | 0 filas × 0 columnas con datos']);
  } finally {
    global.SpreadsheetApp = original;
    delete global.Logger;
  }
});

// --- agregarColumnaCasa_ (migración) ---

/**
 * Fila "de antes" (ancho 22, sin CASA todavía) por nombre de columna: para las columnas después
 * de REVISAR, la posición vieja es una menos que numeroColumna_ (CASA se mete en el medio).
 */
const posicionVieja_ = (nombre) => {
  const nueva = numeroColumna_(nombre);
  return nueva > numeroColumna_('CASA') ? nueva - 1 : nueva;
};
const ANCHO_VIEJO = numeroColumna_('GRUPO') - 1;
function filaVieja_(valores = {}) {
  const fila = Array(ANCHO_VIEJO).fill('');
  Object.entries(valores).forEach(([nombre, valor]) => { fila[posicionVieja_(nombre) - 1] = valor; });
  return fila;
}
function encabezadosViejos_() {
  const fila = filaVieja_({ REVISAR: 'REVISAR' });
  return fila;
}

/**
 * Pestaña falsa con celdas de verdad (para leer y escribir CASA) y, además, los métodos de
 * formato que llama darFormatoMes_ (que solo se usan por su efecto, se ignoran los detalles:
 * ya están probados en "congela 5 filas..." de arriba). `filas`: arreglo de filas (como las da
 * filaVieja_), desde PRIMERA_FILA_DATOS. `maxFilas`: total de filas de la hoja (getMaxRows);
 * puede ser mayor que `filas.length` para simular el desborde de GRUPO llegando
 * hasta el fondo de una hoja real, con filas visibles vacías de por medio.
 */
function hojaMigracion_(nombre, { encabezados = [], filas = [], maxFilas } = {}) {
  const celdas = new Map();
  const clave = (f, c) => `${f},${c}`;
  encabezados.forEach((valor, i) => celdas.set(clave(FILA_ENCABEZADOS, i + 1), valor));
  filas.forEach((fila, i) => fila.forEach((valor, j) => {
    if (valor !== '') celdas.set(clave(PRIMERA_FILA_DATOS + i, j + 1), valor);
  }));
  const totalFilas = maxFilas !== undefined ? maxFilas
    : (filas.length > 0 ? PRIMERA_FILA_DATOS + filas.length - 1 : FILA_ENCABEZADOS);
  const hoja = {
    nombre, llamadas: [], protecciones: [], reglas: null, congeladas: 0, columnasOcultas: null,
    getName: () => hoja.nombre,
    getMaxRows: () => totalFilas,
    insertColumnAfter: (col) => hoja.llamadas.push(['insertColumnAfter', col]),
    setFrozenRows: (n) => { hoja.congeladas = n; },
    hideColumns: (desde, cuantas) => { hoja.columnasOcultas = [desde, cuantas]; },
    setConditionalFormatRules: (r) => { hoja.reglas = r; },
    getProtections: () => hoja.protecciones.map((r) => vistaProteccion_(hoja, r)),
    getRange: (...args) => {
      if (typeof args[0] === 'string') return rangoFalso(hoja, args[0]);
      const [f, c, nf = 1, nc = 1] = args;
      const rango = {
        getValue: () => (celdas.has(clave(f, c)) ? celdas.get(clave(f, c)) : ''),
        getValues: () => Array.from({ length: nf }, (_, i) => Array.from({ length: nc },
          (__, j) => (celdas.has(clave(f + i, c + j)) ? celdas.get(clave(f + i, c + j)) : ''))),
        setValue: (v) => {
          for (let i = 0; i < nf; i += 1) for (let j = 0; j < nc; j += 1) celdas.set(clave(f + i, c + j), v);
          hoja.llamadas.push(['setValue', f, c, v]);
          return rango;
        },
        setValues: (valores) => {
          valores.forEach((filaVal, i) => filaVal.forEach((v, j) => celdas.set(clave(f + i, c + j), v)));
          hoja.llamadas.push(['setValues', f, c, valores]);
          return rango;
        },
        setBackground: () => rango,
        setFontColor: () => rango,
        setFontFamily: () => rango,
        setFontWeight: () => rango,
        setFormula: (fo) => { hoja.llamadas.push(['setFormula', f, c, fo]); return rango; },
      };
      return rango;
    },
  };
  return hoja;
}

test('agregarColumnaCasa_ nunca toca _ESTADO, _HISTORIAL ni pestañas que no son de mes', () => {
  const estado = hojaMigracion_('_ESTADO');
  const historial = hojaMigracion_('_HISTORIAL');
  const hoja1 = hojaMigracion_('Hoja 1');
  const ss = libroFalso([estado, historial, hoja1]);
  const lineas = agregarColumnaCasa_(ss);
  assert.deepEqual(lineas, []);
  assert.deepEqual(estado.llamadas, []);
  assert.deepEqual(historial.llamadas, []);
  assert.deepEqual(hoja1.llamadas, []);
});

test('agregarColumnaCasa_ agrega CASA después de REVISAR y rellena COMPARTIDO en las filas con datos', () => {
  const filas = [
    filaVieja_({ FECHA: '2026-09-01', 'ID FILA': 'BOT-1' }),
    filaVieja_({ FECHA: '2026-09-02', 'ID FILA': 'BOT-2' }),
  ];
  const hoja = hojaMigracion_('Septiembre 2026', { encabezados: encabezadosViejos_(), filas });
  const ss = libroFalso([hoja]);
  const lineas = agregarColumnaCasa_(ss);
  assert.deepEqual(lineas, ['Septiembre 2026: CASA agregada']);
  assert.deepEqual(hoja.llamadas.filter((l) => l[0] === 'insertColumnAfter'), [['insertColumnAfter', numeroColumna_('REVISAR')]]);
  const posicionCasa = numeroColumna_('CASA');
  assert.equal(hoja.getRange(FILA_ENCABEZADOS, posicionCasa).getValue(), 'CASA');
  assert.equal(hoja.getRange(PRIMERA_FILA_DATOS, posicionCasa).getValue(), 'COMPARTIDO');
  assert.equal(hoja.getRange(PRIMERA_FILA_DATOS + 1, posicionCasa).getValue(), 'COMPARTIDO');
  assert.equal(hoja.congeladas, 5);
  assert.deepEqual(hoja.columnasOcultas, [numeroColumna_('ID FILA'), 6]);
  assert.ok(hoja.reglas);
  assert.deepEqual(hoja.protecciones.map((p) => p.ref),
    [`${letra_('GRUPO')}${FILA_ENCABEZADOS}:${letra_('GRUPO')}`]);
  assert.deepEqual(hoja.llamadas.filter((l) => l[0] === 'setFormula' && l[1] === FILA_ENCABEZADOS && l[2] === numeroColumna_('GRUPO')),
    [['setFormula', FILA_ENCABEZADOS, numeroColumna_('GRUPO'), formulaGrupo_()]]);
});

test('agregarColumnaCasa_ no pone COMPARTIDO en filas donde solo llega el desborde de GRUPO (quedan libres para escribirFilas_)', () => {
  const filas = [
    filaVieja_({ FECHA: '2026-09-01', 'ID FILA': 'BOT-1', GRUPO: 1 }),
    filaVieja_({ GRUPO: 0 }), // libre: nada visible, solo el desborde de la fórmula de GRUPO
    filaVieja_({ GRUPO: 1 }), // libre, más abajo todavía (como en la hoja real, hasta el fondo)
  ];
  const hoja = hojaMigracion_('Septiembre 2026', {
    encabezados: encabezadosViejos_(),
    filas,
    maxFilas: PRIMERA_FILA_DATOS + 2, // el desborde llega hasta acá, como en la hoja real
  });
  const ss = libroFalso([hoja]);
  agregarColumnaCasa_(ss);
  const posicionCasa = numeroColumna_('CASA');
  assert.equal(hoja.getRange(PRIMERA_FILA_DATOS, posicionCasa).getValue(), 'COMPARTIDO');
  assert.equal(hoja.getRange(PRIMERA_FILA_DATOS + 1, posicionCasa).getValue(), '');
  assert.equal(hoja.getRange(PRIMERA_FILA_DATOS + 2, posicionCasa).getValue(), '');
});

test('agregarColumnaCasa_ no deja protecciones duplicadas en GRUPO (quita las viejas antes de re-protegerlas)', () => {
  const hoja = hojaMigracion_('Septiembre 2026', {
    encabezados: encabezadosViejos_(),
    filas: [filaVieja_({ FECHA: '2026-09-01', 'ID FILA': 'BOT-1' })],
  });
  // Simula que la pestaña ya tenía las protecciones puestas por una creación anterior; no se
  // verificó en vivo si Sheets corre solo el rango de una protección al insertar una columna
  // antes de ella, así que esta prueba cubre el caso en que queda apuntando al lugar de antes.
  hoja.protecciones.push({ ref: 'V5:V', descripcion: 'GRUPO: fórmula automática, no escribir aquí', soloAviso: true });
  hoja.protecciones.push({ ref: 'A1:A', descripcion: 'protección de otra persona, no tocar', soloAviso: false });
  const ss = libroFalso([hoja]);
  agregarColumnaCasa_(ss);
  const descripciones = hoja.protecciones.map((p) => p.descripcion);
  assert.deepEqual(descripciones, [
    'protección de otra persona, no tocar',
    'GRUPO: fórmula automática, no escribir aquí',
  ]);
  assert.equal(descripciones.filter((d) => d === 'GRUPO: fórmula automática, no escribir aquí').length, 1);
});

test('agregarColumnaCasa_ no hace nada si la pestaña ya tiene CASA (idempotente)', () => {
  const encabezados = filaVieja_({ REVISAR: 'REVISAR' }); // ancho viejo, de sobra para el índice de CASA
  encabezados[numeroColumna_('CASA') - 1] = 'CASA';
  const hoja = hojaMigracion_('Septiembre 2026', { encabezados });
  const ss = libroFalso([hoja]);
  const lineas = agregarColumnaCasa_(ss);
  assert.deepEqual(lineas, ['Septiembre 2026: ya tiene CASA, sin cambios']);
  assert.deepEqual(hoja.llamadas, []);
});

test('agregarColumnaCasa_ sin filas de datos no rellena nada, solo el encabezado', () => {
  const hoja = hojaMigracion_('Octubre 2026', { encabezados: encabezadosViejos_(), filas: [] });
  const ss = libroFalso([hoja]);
  agregarColumnaCasa_(ss);
  assert.deepEqual(hoja.llamadas.filter((l) => l[0] === 'setValue' && l[2] === numeroColumna_('CASA')),
    [['setValue', FILA_ENCABEZADOS, numeroColumna_('CASA'), 'CASA']]);
  assert.deepEqual(hoja.llamadas.filter((l) => l[0] === 'setValues' && l[2] === numeroColumna_('CASA')), []);
});

test('agregarColumnaCasa abre la hoja de CONFIG, corre la migración y registra cada línea', () => {
  const hoja = hojaMigracion_('Septiembre 2026', {
    encabezados: encabezadosViejos_(),
    filas: [filaVieja_({ FECHA: '2026-09-01', 'ID FILA': 'BOT-1' })],
  });
  const ss = libroFalso([hoja]);
  const registrado = [];
  const abiertas = [];
  const original = global.SpreadsheetApp;
  global.SpreadsheetApp = { ...original, openById: (id) => { abiertas.push(id); return ss; } };
  global.Logger = { log: (t) => registrado.push(t) };
  try {
    const lineas = agregarColumnaCasa();
    assert.deepEqual(abiertas, [CONFIG.SHEET_ID]);
    assert.deepEqual(lineas, ['Septiembre 2026: CASA agregada']);
    assert.deepEqual(registrado, lineas);
  } finally {
    global.SpreadsheetApp = original;
    delete global.Logger;
  }
});

// --- migrarUnaFila_ (migración al formato de una fila por factura) ---

/** Encabezados de la pestaña vieja (una fila por línea), como está hoy el Sheet en vivo. */
const COLUMNAS_VIEJAS = [
  'FECHA', 'ID FACTURA', 'TIPO LÍNEA', 'PROVEEDOR', 'DESCRIPCIÓN', 'DEPÓSITO', 'GASTO (USD)',
  'MONEDA', 'MONTO ORIGINAL', 'TASA USADA', 'FORMA DE PAGO', 'CLASE DE GASTO', 'TOTAL FACTURA',
  'SUBTOTAL FACTURA', 'COMENTARIOS', 'FOTO', 'REVISAR', 'CASA', 'ID FILA', 'ORIGEN', 'REGISTRADO',
  'ID MENSAJE TG', 'GRUPO',
];

/** Fila del formato viejo por nombre de columna vieja. */
function filaFormatoViejo_(valores = {}) {
  const fila = Array(COLUMNAS_VIEJAS.length).fill('');
  Object.entries(valores).forEach(([nombre, valor]) => { fila[COLUMNAS_VIEJAS.indexOf(nombre)] = valor; });
  return fila;
}

/**
 * Pestaña falsa con celdas de verdad y los métodos que usa la migración: tamaño de la hoja,
 * clear, breakApart, showColumns, insertColumnsAfter, protecciones y formato condicional.
 * Los rangos en A1 ('A5:Y5') pasan por rangoFalso: quedan como [ref, método,...argumentos].
 */
function hojaLibre_(nombre, { encabezados = [], filas = [], maxFilas, maxColumnas } = {}) {
  const celdas = new Map();
  const clave = (f, c) => `${f},${c}`;
  encabezados.forEach((v, i) => { if (v !== '') celdas.set(clave(FILA_ENCABEZADOS, i + 1), v); });
  filas.forEach((fila, i) => fila.forEach((v, j) => {
    if (v !== '') celdas.set(clave(PRIMERA_FILA_DATOS + i, j + 1), v);
  }));
  const hoja = {
    nombre,
    llamadas: [],
    protecciones: [],
    reglas: null,
    congeladas: 0,
    columnasOcultas: null,
    columnasMostradas: null,
    maxFilas: maxFilas !== undefined ? maxFilas : PRIMERA_FILA_DATOS + Math.max(filas.length, 1) - 1,
    maxColumnas: maxColumnas !== undefined ? maxColumnas : Math.max(encabezados.length, 1),
    getName: () => hoja.nombre,
    getMaxRows: () => hoja.maxFilas,
    getMaxColumns: () => hoja.maxColumnas,
    getLastRow: () => Math.max(0, ...[...celdas.keys()].map((k) => Number(k.split(',')[0]))),
    setFrozenRows: (n) => { hoja.congeladas = n; },
    hideColumns: (desde, cuantas) => { hoja.columnasOcultas = [desde, cuantas]; },
    showColumns: (desde, cuantas) => { hoja.columnasMostradas = [desde, cuantas]; },
    insertColumnsAfter: (col, cuantas) => {
      hoja.llamadas.push(['insertColumnsAfter', col, cuantas]);
      hoja.maxColumnas += cuantas;
    },
    setConditionalFormatRules: (r) => { hoja.reglas = r; },
    getProtections: () => hoja.protecciones.map((r) => vistaProteccion_(hoja, r)),
    leer: (f, c) => (celdas.has(clave(f, c)) ? celdas.get(clave(f, c)) : ''),
    getRange: (...args) => {
      if (typeof args[0] === 'string') return rangoFalso(hoja, args[0]);
      const [f, c, nf = 1, nc = 1] = args;
      assert.ok(f + nf - 1 <= hoja.maxFilas, `fila fuera de la hoja: ${f}+${nf} > ${hoja.maxFilas}`);
      assert.ok(c + nc - 1 <= hoja.maxColumnas, `columna fuera de la hoja: ${c}+${nc} > ${hoja.maxColumnas}`);
      const recorrer = (fn) => {
        for (let i = 0; i < nf; i += 1) for (let j = 0; j < nc; j += 1) fn(f + i, c + j);
      };
      const rango = {
        getValue: () => hoja.leer(f, c),
        getValues: () => Array.from({ length: nf }, (_, i) => Array.from({ length: nc },
          (__, j) => hoja.leer(f + i, c + j))),
        setValue: (v) => {
          hoja.llamadas.push(['setValue', f, c, v]);
          recorrer((x, y) => celdas.set(clave(x, y), v));
          return rango;
        },
        setValues: (valores) => {
          hoja.llamadas.push(['setValues', f, c, valores]);
          valores.forEach((filaVal, i) => filaVal.forEach((v, j) => celdas.set(clave(f + i, c + j), v)));
          return rango;
        },
        clear: () => {
          hoja.llamadas.push(['clear', f, c, nf, nc]);
          recorrer((x, y) => celdas.delete(clave(x, y)));
          return rango;
        },
        breakApart: () => { hoja.llamadas.push(['breakApart', f, c, nf, nc]); return rango; },
      };
      return rango;
    },
  };
  return hoja;
}

/** Pestaña _ESTADO falsa: encabezado en la fila 1 y `filas` (objetos por columna) desde la 2. */
function estadoFalso_(filas = []) {
  const valores = filas.map((f) => COLUMNAS_ESTADO.map((c) => (c in f ? f[c] : '')));
  const hoja = hojaLibre_(PESTANA_ESTADO, {
    maxFilas: valores.length + 1, maxColumnas: COLUMNAS_ESTADO.length,
  });
  hoja.getRange(1, 1, 1, COLUMNAS_ESTADO.length).setValues([[...COLUMNAS_ESTADO]]);
  if (valores.length) hoja.getRange(2, 1, valores.length, COLUMNAS_ESTADO.length).setValues(valores);
  hoja.llamadas.length = 0; // lo de arriba es el estado inicial, no escrituras de la migración
  return hoja;
}

const pestanaVieja_ = (nombre, filas, opciones = {}) => hojaLibre_(nombre, {
  encabezados: COLUMNAS_VIEJAS, filas, ...opciones,
});

/** Fila de prueba escrita por el bot, en el formato viejo (con los desbordes N y W). */
const filaBot_ = (n) => filaFormatoViejo_({
  FECHA: `2026-09-0${n}`, 'ID FACTURA': `F-${n}`, 'TIPO LÍNEA': 'ITEM', 'GASTO (USD)': n,
  'ID FILA': `BOT-${n}`, ORIGEN: 'BOT', 'SUBTOTAL FACTURA': n, GRUPO: 1,
});

test('migrarUnaFila_ para si hay otra pestaña de mes y no escribe nada', () => {
  const septiembre = pestanaVieja_('Septiembre 2026', [filaBot_(1)]);
  const octubre = pestanaVieja_('Octubre 2026', []);
  const estado = estadoFalso_([{ TIPO: 'REGISTRO', 'ID FILAS': 'BOT-1', ESTADO: 'ABIERTA' }]);
  const ss = libroFalso([septiembre, octubre, estado]);
  assert.deepEqual(migrarUnaFila_(ss), [
    'Septiembre 2026: 1 filas con datos',
    'Octubre 2026: 0 filas con datos',
    'PARO: hay otra pestaña de mes (Octubre 2026); no se tocó nada',
  ]);
  assert.deepEqual(septiembre.llamadas, []);
  assert.deepEqual(octubre.llamadas, []);
  assert.deepEqual(estado.llamadas, []);
});

test('migrarUnaFila_ para si alguna fila no es del bot (posible dato real)', () => {
  const filas = [filaBot_(1), filaFormatoViejo_({ FECHA: '2026-09-03', 'GASTO (USD)': 9 })];
  const septiembre = pestanaVieja_('Septiembre 2026', filas);
  const estado = estadoFalso_([]);
  const ss = libroFalso([septiembre, estado]);
  assert.deepEqual(migrarUnaFila_(ss), [
    'Septiembre 2026: 2 filas con datos',
    'PARO: Septiembre 2026 tiene filas que no son del bot (fila 7); no se tocó nada',
  ]);
  assert.deepEqual(septiembre.llamadas, []);
  assert.deepEqual(estado.llamadas, []);
});

test('migrarUnaFila_ rehace la pestaña en su sitio: encabezados, fórmulas, formato y filas vacías', () => {
  const septiembre = pestanaVieja_('Septiembre 2026', [filaBot_(1), filaBot_(2)]);
  septiembre.protecciones.push({ ref: 'N5:N', descripcion: 'SUBTOTAL FACTURA: fórmula automática, no escribir aquí', soloAviso: true });
  septiembre.protecciones.push({ ref: 'W5:W', descripcion: 'GRUPO: fórmula automática, no escribir aquí', soloAviso: true });
  septiembre.protecciones.push({ ref: 'A1:A', descripcion: 'protección de otra persona, no tocar', soloAviso: false });
  septiembre.reglas = ['regla vieja'];
  const ss = libroFalso([septiembre, estadoFalso_([])]);
  assert.deepEqual(migrarUnaFila_(ss), [
    'Septiembre 2026: 2 filas con datos',
    '_ESTADO: 0 entradas abiertas cerradas',
    'Septiembre 2026: 2 filas de prueba borradas',
    'Septiembre 2026: encabezados, fórmulas y formato nuevos aplicados',
  ]);
  // La pestaña es la misma de antes (nunca se borra ni se recrea) y quedó del ancho nuevo.
  assert.equal(ss.getSheetByName('Septiembre 2026'), septiembre);
  assert.equal(septiembre.maxColumnas, COLUMNAS.length);
  assert.deepEqual(septiembre.llamadas.filter((l) => l[0] === 'insertColumnsAfter'),
    [['insertColumnsAfter', COLUMNAS_VIEJAS.length, COLUMNAS.length - COLUMNAS_VIEJAS.length]]);
  // Encabezados, fórmula de GRUPO y resumen nuevos (saldo inicial 0: no hay mes anterior).
  assert.deepEqual(llamadasA(septiembre, 'A5:Y5', 'setValues')[0][2][0], [...COLUMNAS]);
  assert.equal(llamadasA(septiembre, 'A3:F3', 'setFormulas')[0][2][0][0], '=0');
  assert.deepEqual(llamadasA(septiembre, 'Y5', 'setFormula'), [['Y5', 'setFormula', formulaGrupo_()]]);
  // Datos viejos borrados (contenido y formato), fila 1 sin la combinación vieja.
  assert.equal(septiembre.leer(PRIMERA_FILA_DATOS, 1), '');
  assert.equal(septiembre.leer(PRIMERA_FILA_DATOS + 1, COLUMNAS_VIEJAS.indexOf('ID FILA') + 1), '');
  // Encabezados viejos borrados (los nuevos los escribe escribirCabeceraMes_ por rango A1).
  assert.equal(septiembre.leer(FILA_ENCABEZADOS, COLUMNAS_VIEJAS.indexOf('SUBTOTAL FACTURA') + 1), '');
  assert.ok(septiembre.llamadas.some((l) => l[0] === 'breakApart' && l[1] === 1));
  assert.ok(septiembre.llamadas.some((l) => l[0] === 'clear' && l[1] === 1));
  assert.ok(septiembre.llamadas.some((l) => l[0] === 'clear' && l[1] === PRIMERA_FILA_DATOS));
  // Columnas: primero se muestran todas, luego darFormatoMes_ oculta T–Y.
  assert.deepEqual(septiembre.columnasMostradas, [1, COLUMNAS.length]);
  assert.deepEqual(septiembre.columnasOcultas, [numeroColumna_('ID FILA'), 6]);
  assert.equal(septiembre.congeladas, FILA_ENCABEZADOS);
  // Formato condicional nuevo y protecciones: se va la de SUBTOTAL, quedan GRUPO y la ajena.
  assert.deepEqual(septiembre.reglas.map((r) => r.formula), reglasFormato_().map((r) => r.formula));
  assert.deepEqual(septiembre.protecciones.map((p) => p.descripcion), [
    'protección de otra persona, no tocar',
    'GRUPO: fórmula automática, no escribir aquí',
  ]);
});

test('migrarUnaFila_ cierra en _ESTADO solo las entradas abiertas que apuntan a las filas borradas', () => {
  const septiembre = pestanaVieja_('Septiembre 2026', [filaBot_(1), filaBot_(2)]);
  const estado = estadoFalso_([
    { TIPO: 'REGISTRO', 'ID FILAS': 'BOT-1,BOT-2', ESTADO: 'ABIERTA' },
    { TIPO: 'PREGUNTA', 'ID FILAS': 'BOT-2', ESTADO: 'ABIERTA' },
    { TIPO: 'FECHA-FOTO', 'ID FILAS': 'BOT-9', ESTADO: 'ABIERTA' },
    { TIPO: 'REGISTRO', 'ID FILAS': 'BOT-1', ESTADO: 'CERRADA' },
    { TIPO: 'UPDATE', CLAVE: '77', ESTADO: 'VISTO' },
    { TIPO: 'FECHA', 'ID FILAS': '', DATOS: JSON.stringify({ pestana: 'Septiembre 2026' }), ESTADO: 'ABIERTA' },
  ]);
  const ss = libroFalso([septiembre, estado]);
  assert.ok(migrarUnaFila_(ss).includes('_ESTADO: 3 entradas abiertas cerradas'));
  const columnaEstado = COLUMNAS_ESTADO.indexOf('ESTADO') + 1;
  assert.deepEqual(estado.llamadas, [
    ['setValue', 2, columnaEstado, 'CERRADA'],
    ['setValue', 3, columnaEstado, 'CERRADA'],
    ['setValue', 7, columnaEstado, 'CERRADA'],
  ]);
  assert.equal(estado.leer(4, columnaEstado), 'ABIERTA'); // FECHA-FOTO de otras filas, intacta
  assert.equal(estado.leer(6, columnaEstado), 'VISTO');
});

test('migrarUnaFila_ corrida de nuevo no escribe nada (ni en la pestaña ni en _ESTADO)', () => {
  const septiembre = hojaLibre_('Septiembre 2026', {
    encabezados: [...COLUMNAS], maxColumnas: COLUMNAS.length, maxFilas: PRIMERA_FILA_DATOS + 2,
  });
  const estado = estadoFalso_([{ TIPO: 'REGISTRO', 'ID FILAS': 'BOT-1', ESTADO: 'ABIERTA' }]);
  const ss = libroFalso([septiembre, estado]);
  assert.deepEqual(migrarUnaFila_(ss), [
    'Septiembre 2026: 0 filas con datos',
    'Septiembre 2026: ya migrada, sin cambios',
  ]);
  assert.deepEqual(septiembre.llamadas, []);
  assert.deepEqual(estado.llamadas, []);
});

test('migrarUnaFila_ ensancha la pestaña si tiene menos columnas que el formato nuevo', () => {
  const septiembre = hojaLibre_('Septiembre 2026', {
    // Sin ORIGEN ni ID FILA: una pestaña recortada a mano, sin filas de datos.
    encabezados: COLUMNAS_VIEJAS.slice(0, 18), maxColumnas: 18, maxFilas: PRIMERA_FILA_DATOS,
  });
  const ss = libroFalso([septiembre, estadoFalso_([])]);
  migrarUnaFila_(ss);
  assert.deepEqual(septiembre.llamadas.filter((l) => l[0] === 'insertColumnsAfter'),
    [['insertColumnsAfter', 18, COLUMNAS.length - 18]]);
  assert.equal(septiembre.maxColumnas, COLUMNAS.length);
});

test('migrarUnaFila_ sin la pestaña de septiembre para y no escribe nada', () => {
  const agosto = pestanaVieja_('Agosto 2026', []);
  const ss = libroFalso([agosto, estadoFalso_([])]);
  assert.deepEqual(migrarUnaFila_(ss), [
    'Agosto 2026: 0 filas con datos',
    'PARO: no encontré la pestaña Septiembre 2026; no se tocó nada',
  ]);
  assert.deepEqual(agosto.llamadas, []);
});

test('migrarUnaFila_ aguanta una hoja sin _ESTADO, sin filas de datos y con DATOS ilegibles', () => {
  const septiembre = pestanaVieja_('Septiembre 2026', [], { maxFilas: FILA_ENCABEZADOS });
  const ss = libroFalso([septiembre]);
  assert.deepEqual(migrarUnaFila_(ss), [
    'Septiembre 2026: 0 filas con datos',
    '_ESTADO: 0 entradas abiertas cerradas',
    'Septiembre 2026: 0 filas de prueba borradas',
    'Septiembre 2026: encabezados, fórmulas y formato nuevos aplicados',
  ]);
  const conEstado = libroFalso([
    pestanaVieja_('Septiembre 2026', [filaBot_(1)]),
    estadoFalso_([{ TIPO: 'PREGUNTA', DATOS: 'no es JSON', ESTADO: 'ABIERTA' }]),
  ]);
  assert.ok(migrarUnaFila_(conEstado).includes('_ESTADO: 0 entradas abiertas cerradas'));
  const sinFilasEstado = libroFalso([pestanaVieja_('Septiembre 2026', [filaBot_(1)]), estadoFalso_([])]);
  assert.ok(migrarUnaFila_(sinFilasEstado).includes('_ESTADO: 0 entradas abiertas cerradas'));
});

test('anteriorDe_ toma el mes anterior de las otras pestañas (saldo inicial encadenado)', () => {
  const ss = libroFalso(['Julio 2026', 'Agosto 2026', 'Septiembre 2026', '_ESTADO']);
  assert.equal(anteriorDe_(ss, 'Septiembre 2026'), 'Agosto 2026');
  assert.equal(anteriorDe_(libroFalso(['Septiembre 2026']), 'Septiembre 2026'), null);
});

test('migrarUnaFila abre la hoja de CONFIG, corre la migración y registra cada línea', () => {
  const ss = libroFalso([pestanaVieja_('Septiembre 2026', [filaBot_(1)]), estadoFalso_([])]);
  const registrado = [];
  const abiertas = [];
  const original = global.SpreadsheetApp;
  global.SpreadsheetApp = { ...original, openById: (id) => { abiertas.push(id); return ss; } };
  global.Logger = { log: (t) => registrado.push(t) };
  try {
    const lineas = migrarUnaFila();
    assert.deepEqual(abiertas, [CONFIG.SHEET_ID]);
    assert.deepEqual(registrado, lineas);
    assert.equal(lineas[0], 'Septiembre 2026: 1 filas con datos');
  } finally {
    global.SpreadsheetApp = original;
    delete global.Logger;
  }
});

// --- protección de pestañas internas (22a) ---

test('protege una pestaña interna nueva: descripción, sin aviso, solo el dueño y sin edición por dominio', () => {
  const hoja = hojaFalsa('_ESTADO');
  const estado = protegerPestanaInterna_(hoja);
  const [p] = hoja.proteccionesHoja;
  assert.equal(estado, 'protegida');
  assert.equal(hoja.proteccionesHoja.length, 1);
  assert.equal(p.descripcion, DESCRIPCION_PROTECCION_INTERNA);
  assert.equal(p.soloAviso, false);
  assert.deepEqual(p.editores, [DUENO]);
  assert.equal(p.dominio, false);
});

test('protegerPestanaInterna_ dos veces deja una sola protección y quita al editor agregado en medio', () => {
  const hoja = hojaFalsa('_HISTORIAL');
  protegerPestanaInterna_(hoja);
  hoja.proteccionesHoja[0].editores.push('otro@x');
  const estado = protegerPestanaInterna_(hoja);
  assert.equal(estado, 'ya protegida');
  assert.equal(hoja.proteccionesHoja.length, 1);
  assert.deepEqual(hoja.proteccionesHoja[0].editores, [DUENO]);
});

test('endurece una protección nuestra que quedó solo con aviso y con edición por dominio', () => {
  const hoja = hojaFalsa('_EDICIONES');
  hoja.proteccionesHoja.push({ descripcion: DESCRIPCION_PROTECCION_INTERNA, soloAviso: true, editores: [DUENO, 'usuario@x'], dominio: true });
  assert.equal(protegerPestanaInterna_(hoja), 'ya protegida');
  const [p] = hoja.proteccionesHoja;
  assert.equal(p.soloAviso, false);
  assert.equal(p.dominio, false);
  assert.deepEqual(p.editores, [DUENO]);
});

test('no reutiliza una protección de hoja ajena: crea la suya', () => {
  const hoja = hojaFalsa('_ESTADO');
  hoja.proteccionesHoja.push({ descripcion: 'otra', soloAviso: false, editores: [DUENO], dominio: false });
  assert.equal(protegerPestanaInterna_(hoja), 'protegida');
  assert.equal(hoja.proteccionesHoja.length, 2);
});

test('protegerPestanasInternas_ protege las tres, avisa la que falta y no toca meses ni archivo', () => {
  const ss = libroFalso(['Septiembre 2026', 'Julio 2026 (archivo)', '_ESTADO', '_HISTORIAL']);
  const lineas = protegerPestanasInternas_(ss);
  assert.deepEqual(lineas, [
    '_ESTADO: protegida',
    '_HISTORIAL: protegida',
    '_EDICIONES: no existe, se protegerá al crearla',
  ]);
  assert.deepEqual(ss.hojas.map((h) => h.proteccionesHoja.length), [0, 0, 1, 1]);
  assert.deepEqual(protegerPestanasInternas_(ss).slice(0, 2), ['_ESTADO: ya protegida', '_HISTORIAL: ya protegida']);
});

test('configurarHoja_ deja _ESTADO y _HISTORIAL recién creadas ya protegidas', () => {
  const ss = libroFalso(['Hoja 1']);
  configurarHoja_(ss, 2026, 9);
  assert.equal(ss.getSheetByName('_ESTADO').proteccionesHoja.length, 1);
  assert.equal(ss.getSheetByName('_HISTORIAL').proteccionesHoja.length, 1);
  assert.equal(ss.getSheetByName('Septiembre 2026').proteccionesHoja.length, 0);
});

test('crearPestanaOculta_ protege _EDICIONES al crearla (ruta de EdicionApp/EdicionesApp)', () => {
  const ss = libroFalso([]);
  crearPestanaOculta_(ss, '_EDICIONES', ['A']);
  const hoja = ss.getSheetByName('_EDICIONES');
  assert.equal(hoja.oculta, true);
  assert.deepEqual(hoja.proteccionesHoja.map((p) => [p.descripcion, p.editores.length]), [[DESCRIPCION_PROTECCION_INTERNA, 1]]);
});

test('protegerPestanasInternas abre la hoja de CONFIG y registra cada línea', () => {
  const ss = libroFalso(['_ESTADO']);
  const registrado = [];
  const abiertas = [];
  const original = global.SpreadsheetApp;
  global.SpreadsheetApp = { ...original, openById: (id) => { abiertas.push(id); return ss; } };
  global.Logger = { log: (t) => registrado.push(t) };
  try {
    const lineas = protegerPestanasInternas();
    assert.deepEqual(abiertas, [CONFIG.SHEET_ID]);
    assert.deepEqual(registrado, lineas);
    assert.equal(lineas[0], '_ESTADO: protegida');
  } finally {
    global.SpreadsheetApp = original;
    delete global.Logger;
  }
});
