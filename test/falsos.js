const assert = require('node:assert/strict');
const { COLUMNAS, numeroColumna_, nombrePestanaMes_ } = require('../src/Hoja.js');

const Y = numeroColumna_('GRUPO');
const PROHIBIDAS = [Y];

/**
 * Hoja falsa con celdas de verdad (1 = fila/columna 1). Lanza si algo escribe o borra en
 * GRUPO (Y): es el único desborde de fórmula que queda.
 */
function hojaFalsa(nombre, { filas = 20, protegerDesborde = true } = {}) {
  const celdas = new Map();
  const clave = (f, c) => `${f},${c}`;
  const hoja = {
    nombre, maxFilas: filas, escrituras: [], anexadas: [],
    getName: () => hoja.nombre,
    getMaxRows: () => hoja.maxFilas,
    getLastRow: () => Math.max(0, ...[...celdas.keys()].map((k) => Number(k.split(',')[0]))),
    insertRowsAfter: (despues, cuantas) => {
      assert.equal(despues, hoja.maxFilas);
      hoja.maxFilas += cuantas;
    },
    appendRow: (valores) => {
      const f = hoja.getLastRow() + 1;
      valores.forEach((v, i) => celdas.set(clave(f, i + 1), v));
      hoja.anexadas.push(valores);
    },
    leer: (f, c) => (celdas.has(clave(f, c)) ? celdas.get(clave(f, c)) : ''),
    poner: (f, c, v) => celdas.set(clave(f, c), v),
    getRange: (f, c, nf = 1, nc = 1) => {
      assert.ok(f >= 1 && f + nf - 1 <= hoja.maxFilas, `fila fuera de la hoja: ${f}+${nf} > ${hoja.maxFilas}`);
      const tocar = (metodo) => {
        for (let col = c; col < c + nc; col += 1) {
          if (protegerDesborde && PROHIBIDAS.includes(col)) throw new Error(`${metodo} tocó la columna ${col}`);
        }
        hoja.escrituras.push([metodo, f, c, nf, nc]);
      };
      return {
        getValues: () => Array.from({ length: nf }, (_, i) => Array.from({ length: nc }, (__, j) => hoja.leer(f + i, c + j))),
        getValue: () => hoja.leer(f, c),
        setValues: (valores) => {
          assert.equal(valores.length, nf);
          valores.forEach((fila) => assert.equal(fila.length, nc));
          tocar('setValues');
          valores.forEach((fila, i) => fila.forEach((v, j) => hoja.poner(f + i, c + j, v)));
        },
        setValue: (v) => { tocar('setValue'); hoja.poner(f, c, v); },
        clearContent: () => {
          tocar('clearContent');
          for (let i = 0; i < nf; i += 1) for (let j = 0; j < nc; j += 1) celdas.delete(clave(f + i, c + j));
        },
      };
    },
  };
  return hoja;
}

function libroFalso(hojas) {
  return {
    hojas,
    getSheets: () => [...hojas],
    getSheetByName: (n) => hojas.find((h) => h.nombre === n) || null,
  };
}

global.crearPestanaMes_ = (ss, anio, mes) => {
  const nombre = nombrePestanaMes_(anio, mes);
  ss.hojas.push(hojaFalsa(nombre));
  return { nombre };
};

/** Fila {columna: valor} de la hoja en el número de fila dado. */
const filaDe = (hoja, numero) => Object.fromEntries(COLUMNAS.map((c, i) => [c, hoja.leer(numero, i + 1)]));
const ponerFila = (hoja, numero, valores) => Object.entries(valores)
  .forEach(([c, v]) => hoja.poner(numero, numeroColumna_(c), v));

module.exports = { hojaFalsa, libroFalso, filaDe, ponerFila, PROHIBIDAS };
