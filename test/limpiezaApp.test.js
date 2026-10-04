const test = require('node:test');
const assert = require('node:assert/strict');

// En Apps Script estos nombres son globales (Hoja.js, Escritura.js, EscrituraApp.js,
// Carpetas.js, HojaApp.js, Config.js); en Node se ponen a mano, igual que en hojaApp.test.js.
global.MESES = require('../src/Hoja.js').MESES;
Object.assign(global, require('../src/Hoja.js'));
Object.assign(global, require('../src/Escritura.js'));
Object.assign(global, require('../src/EscrituraApp.js'));
Object.assign(global, require('../src/Carpetas.js'));
Object.assign(global, require('../src/HojaApp.js'));
Object.assign(global, require('../src/Edicion.js'));
Object.assign(global, require('../src/LimpiezaPrueba.js'));
global.ESPERA_CANDADO_LIMPIEZA_MS = require('../src/LimpiezaPruebaApp.js').ESPERA_CANDADO_LIMPIEZA_MS; // global en Apps Script
global.CONFIG = require('./configPrueba.js').CONFIG;

const { ocultarPestanasAuxiliares_, cerrarRegistrosSinPestana_ } = require('../src/LimpiezaApp.js');
const { COLUMNAS_ESTADO } = require('../src/Hoja.js');
const { PESTANA_ESTADO, PESTANA_HISTORIAL } = require('../src/HojaApp.js');

// --- fakes: Sheets ---

/** Pestaña simple, sin datos: solo nombre y visibilidad (_ESTADO/_HISTORIAL/otros meses de relleno). */
function hojaSimple_(nombre, { oculta = false } = {}) {
  const hoja = {
    nombre, oculta,
    getName: () => hoja.nombre,
    isSheetHidden: () => hoja.oculta,
    hideSheet: () => { hoja.oculta = true; },
  };
  return hoja;
}

/** _ESTADO con celdas de verdad: encabezados en la fila 1 y `filas` (objetos por columna) desde la 2. */
function estadoFalso_(filas = []) {
  const celdas = new Map();
  const clave = (f, c) => `${f},${c}`;
  COLUMNAS_ESTADO.forEach((v, i) => celdas.set(clave(1, i + 1), v));
  filas.forEach((fila, i) => COLUMNAS_ESTADO.forEach((c, j) => {
    celdas.set(clave(2 + i, j + 1), c in fila ? fila[c] : '');
  }));
  const hoja = {
    nombre: PESTANA_ESTADO,
    llamadas: [],
    oculta: false,
    getName: () => hoja.nombre,
    isSheetHidden: () => hoja.oculta,
    hideSheet: () => { hoja.oculta = true; },
    getLastRow: () => filas.length + 1,
    getRange: (f, c, nf = 1, nc = 1) => {
      const rango = {
        getValue: () => (celdas.has(clave(f, c)) ? celdas.get(clave(f, c)) : ''),
        getValues: () => Array.from({ length: nf }, (_, i) => Array.from({ length: nc },
          (__, j) => (celdas.has(clave(f + i, c + j)) ? celdas.get(clave(f + i, c + j)) : ''))),
        setValue: (v) => { hoja.llamadas.push(['setValue', f, c, v]); celdas.set(clave(f, c), v); return rango; },
      };
      return rango;
    },
  };
  return hoja;
}

/** Pestaña "de mes" a la que solo se le toca A3 (saldo inicial): guarda la fórmula que le pongan. */
function hojaSaldo_(nombre) {
  const hoja = {
    nombre, llamadas: [],
    getName: () => hoja.nombre,
    getRange: (ref) => ({
      setFormula: (f) => { hoja.llamadas.push(['setFormula', ref, f]); },
    }),
  };
  return hoja;
}

function libroFalso(hojas) {
  const lista = [...hojas];
  return {
    lista,
    getSheets: () => [...lista],
    getSheetByName: (n) => lista.find((h) => h.getName() === n) || null,
    deleteSheet: (hoja) => {
      hoja.borrada = true;
      const i = lista.indexOf(hoja);
      if (i >= 0) lista.splice(i, 1);
    },
  };
}

// --- ocultarPestanasAuxiliares_ ---

test('ocultarPestanasAuxiliares_ oculta, avisa si ya estaba oculta, o si no existe', () => {
  const ss1 = libroFalso([hojaSimple_(PESTANA_ESTADO, { oculta: false }), hojaSimple_(PESTANA_HISTORIAL, { oculta: false })]);
  assert.deepEqual(ocultarPestanasAuxiliares_(ss1), ['_ESTADO: oculta', '_HISTORIAL: oculta']);
  assert.equal(ss1.getSheetByName(PESTANA_ESTADO).isSheetHidden(), true);

  const ss2 = libroFalso([hojaSimple_(PESTANA_ESTADO, { oculta: true }), hojaSimple_(PESTANA_HISTORIAL, { oculta: true })]);
  assert.deepEqual(ocultarPestanasAuxiliares_(ss2), ['_ESTADO: ya oculta', '_HISTORIAL: ya oculta']);

  const ss3 = libroFalso([]);
  assert.deepEqual(ocultarPestanasAuxiliares_(ss3), ['_ESTADO: no existe', '_HISTORIAL: no existe']);
});

// --- cerrarRegistrosSinPestana_ ---

const entradaEstado_ = (clave, pestana, estado = 'ABIERTA', idsFilas = `${clave}-1`) => ({
  TIPO: 'PREGUNTA', CLAVE: clave, 'ID FILAS': idsFilas, DATOS: JSON.stringify({ pestana, preguntas: [] }), ESTADO: estado,
});

function depsCierre_(hojas, { concede = true } = {}) {
  const logs = [];
  const candado = { intentos: [], liberado: 0, tryLock: (ms) => { candado.intentos.push(ms); return concede; }, releaseLock: () => { candado.liberado += 1; } };
  return { logs, candado, libro: () => libroFalso(hojas), log: (l) => logs.push(l) };
}
const estadosDe_ = (estado) => estado.getRange(2, COLUMNAS_ESTADO.indexOf('ESTADO') + 1, estado.getLastRow() - 1, 1)
  .getValues().map(([e]) => e);

test('cerrarRegistrosSinPestana_ cierra solo las ABIERTAS cuya pestaña ya no existe', () => {
  const estado = estadoFalso_([
    entradaEstado_('1', 'Julio 2025'), // abierta, pestaña borrada: se cierra
    entradaEstado_('2', 'Septiembre 2026'), // abierta, pestaña existe: se queda
    entradaEstado_('3', 'Julio 2025', 'CERRADA'), // ya cerrada: no se toca
    entradaEstado_('4', 'Junio 2025', 'ABIERTA', 'a,b'), // abierta, pestaña borrada
  ]);
  const deps = depsCierre_([hojaSimple_('Septiembre 2026'), estado]);
  const lineas = cerrarRegistrosSinPestana_(deps);
  assert.deepEqual(estadosDe_(estado), ['CERRADA', 'ABIERTA', 'CERRADA', 'CERRADA']);
  assert.deepEqual(estado.llamadas.map(([m, f]) => [m, f]), [['setValue', 2], ['setValue', 5]]);
  assert.deepEqual(lineas, [
    'Cerrada: clave 1, pestaña Julio 2025, ID FILAS 1-1',
    'Cerrada: clave 4, pestaña Junio 2025, ID FILAS a,b',
    'Total: 2 registros cerrados',
  ]);
  assert.deepEqual(deps.logs, lineas);
  assert.equal(deps.candado.liberado, 1);
});

test('cerrarRegistrosSinPestana_ sin nada que cerrar lo dice y no escribe', () => {
  const estado = estadoFalso_([entradaEstado_('1', 'Septiembre 2026'), entradaEstado_('2', 'Julio 2025', 'CERRADA')]);
  const lineas = cerrarRegistrosSinPestana_(depsCierre_([hojaSimple_('Septiembre 2026'), estado]));
  assert.deepEqual(lineas, ['Nada que cerrar']);
  assert.deepEqual(estado.llamadas, []);
});

test('cerrarRegistrosSinPestana_ deja intactas las entradas sin pestaña legible en DATOS', () => {
  const estado = estadoFalso_([
    { ...entradaEstado_('1', 'x'), DATOS: 'no es json' },
    { ...entradaEstado_('2', 'x'), DATOS: JSON.stringify({ preguntas: [] }) },
  ]);
  const lineas = cerrarRegistrosSinPestana_(depsCierre_([estado]));
  assert.deepEqual(lineas, ['Nada que cerrar']);
  assert.deepEqual(estado.llamadas, []);
});

test('cerrarRegistrosSinPestana_ sin _ESTADO o con _ESTADO vacío no falla', () => {
  assert.deepEqual(cerrarRegistrosSinPestana_(depsCierre_([])), ['PARO: no existe _ESTADO; no se tocó nada']);
  assert.deepEqual(cerrarRegistrosSinPestana_(depsCierre_([estadoFalso_([])])), ['Nada que cerrar']);
});

test('cerrarRegistrosSinPestana_ sin candado no toca nada', () => {
  const estado = estadoFalso_([entradaEstado_('1', 'Julio 2025')]);
  const deps = depsCierre_([estado], { concede: false });
  assert.deepEqual(cerrarRegistrosSinPestana_(deps), ['PARO: no se pudo tomar el candado; no se tocó nada']);
  assert.deepEqual(estado.llamadas, []);
  assert.equal(deps.candado.liberado, 0);
  assert.deepEqual(deps.candado.intentos, [30000]);
});
