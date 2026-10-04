const assert = require('node:assert/strict');

/**
 * Falsos compartidos por las pruebas: Excel inventado (nunca datos reales del usuario),
 * carpeta de Drive, libro y hojas con celdas de verdad, candado y los globales de Apps Script.
 */

/** En Apps Script estos nombres son globales; en Node se ponen a mano. */
function instalarGlobales() {
  Object.assign(global, require('../src/Hoja.js'));
  Object.assign(global, require('../src/Historial.js'));
  Object.assign(global, require('../src/Escritura.js'));
  Object.assign(global, require('../src/Clases.js')); // escaparRegex_ (Importacion.js lo usa)
  Object.assign(global, require('../src/Importacion.js'));
  global.PESTANA_HISTORIAL = require('../src/HojaApp.js').PESTANA_HISTORIAL;
  Object.assign(global, require('../src/HojaApp.js'));
  Object.assign(global, require('../src/HistorialApp.js'));
  global.CONFIG = require('./configPrueba.js').CONFIG;
  global.SpreadsheetApp = {
    ProtectionType: { RANGE: 'RANGE' },
    newConditionalFormatRule: () => {
      const regla = new Proxy({}, { get: (_, m) => (m === 'build' ? () => ({}) : () => regla) });
      return regla;
    },
  };
  global.Utilities = {
    unzip: (blob) => {
      assert.equal(blob.tipo, 'application/zip', 'el blob se marca como zip antes de descomprimir');
      return Object.entries(blob.textos).map(([ruta, texto]) => ({
        getName: () => ruta,
        getDataAsString: () => { blob.leidos.push(ruta); return texto; },
      }));
    },
  };
}

// --- Excel falso ---
const txt = (ref, t) => `<c r="${ref}" t="inlineStr"><is><t>${t}</t></is></c>`;
const num = (ref, v) => `<c r="${ref}"><v>${v}</v></c>`;
const ENCABEZADOS = `<row r="2">${txt('B2', 'FECHA')}${txt('C2', 'DEPÓSITO')}${txt('D2', 'GASTO')}${txt('E2', 'PROVEEDOR')}${txt('F2', 'CLASE DE GASTO')}${txt('G2', 'COMENTARIOS')}</row>`;

/** movimientos = [{ serie, deposito, gasto (negativo en Excel), proveedor, clase, comentarios }] */
const hojaGastos = (movimientos) => `<worksheet><sheetData>${ENCABEZADOS}${movimientos.map((m, i) => {
  const n = i + 3;
  const deposito = m.deposito === undefined ? '' : num(`C${n}`, m.deposito);
  const gasto = m.gasto === undefined ? '' : num(`D${n}`, m.gasto);
  return `<row r="${n}">${num(`B${n}`, m.serie)}${deposito}${gasto}${txt(`E${n}`, m.proveedor)}${txt(`F${n}`, m.clase)}${txt(`G${n}`, m.comentarios || '')}</row>`;
}).join('')}</sheetData></worksheet>`;

function textosLibro(pestanas) {
  const textos = {
    '[Content_Types].xml': '<Types/>',
    'xl/workbook.xml': `<workbook><sheets>${pestanas.map((p, i) => `<sheet name="${p.nombre}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `<Relationships>${pestanas.map((_, i) => `<Relationship Id="rId${i + 1}" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}</Relationships>`,
  };
  pestanas.forEach((p, i) => { textos[`xl/worksheets/sheet${i + 1}.xml`] = p.xml; });
  return textos;
}

/** Archivo falso de Drive; `leidos` anota qué textos se abrieron (vacío = nunca se abrió). */
function archivoFalso(nombre, textos) {
  const leidos = [];
  const blob = { tipo: null, textos, leidos };
  blob.setContentType = (t) => { blob.tipo = t; return blob; };
  const archivo = { leidos, getName: () => nombre, getMimeType: () => require('../src/HistorialApp.js').MIME_XLSX };
  archivo.getBlob = () => { archivo.abierto = true; return blob; };
  return archivo;
}

function carpetaFalsa(archivos) {
  return {
    getFiles: () => {
      let i = 0;
      return { hasNext: () => i < archivos.length, next: () => archivos[i++] };
    },
  };
}

/** Movimientos inventados de julio: 1 depósito, 2 gastos (uno con texto peligroso). */
const MOV_JULIO = [
  { serie: 46204, deposito: 500, proveedor: 'DEPOSITO ANA', clase: 'DEPOSITO' },
  { serie: 46205, gasto: -10.1, proveedor: '=CMD()', clase: 'COMIDA PLAYA', comentarios: 'ñandú 😀' },
  { serie: 46206, gasto: -5.2, proveedor: 'FARMACIA', clase: 'SALUD NORTE' },
];
const MOV_AGOSTO = [
  { serie: 46235, gasto: -7, proveedor: 'TIENDA A', clase: 'COMIDA' },
  { serie: 46236, deposito: 100.25, proveedor: 'DEPOSITO', clase: 'DEPOSITO' },
];

const archivoJulio = (movimientos = MOV_JULIO) => archivoFalso('07. GASTOS DE JULIO 2026.xlsx', textosLibro([
  { nombre: 'GASTOS JULIO', xml: hojaGastos(movimientos) },
  { nombre: 'Hoja4', xml: hojaGastos([{ serie: 46083, gasto: -3, proveedor: 'TAXI', clase: 'TRANSPORTE' }]) },
]));
const archivoAgosto = (movimientos = MOV_AGOSTO) => archivoFalso('08. GASTOS DE AGOSTO 2026.xlsx', textosLibro([
  { nombre: 'GASTOS AGOSTO', xml: hojaGastos(movimientos) },
]));
const archivoSeptiembre = () => archivoFalso('09. GASTOS DE SEPTIEMBRE 2026.xlsx', textosLibro([
  { nombre: 'GASTOS SEPTIEMBRE', xml: hojaGastos([{ serie: 46266, gasto: -1, proveedor: 'X', clase: 'Y' }]) },
]));

// --- Hoja y libro falsos ---
const MUTADORES_IGNORADOS = new Set(['getValues', 'getValue', 'getNote']);

/** Referencia A1 ("A1:S1", "B6:B", "A3") o (fila, columna, alto, ancho) → { f, c, nf, nc }. */
function resolverRango(hoja, args) {
  if (typeof args[0] === 'number') {
    const [f, c, nf = 1, nc = 1] = args;
    return { f, c, nf, nc };
  }
  const m = /^([A-Z]+)(\d+)?(?::([A-Z]+)(\d+)?)?$/.exec(args[0]);
  assert.ok(m, `referencia A1 rara: ${args[0]}`);
  const col = (letras) => [...letras].reduce((t, ch) => t * 26 + ch.charCodeAt(0) - 64, 0);
  const f = Number(m[2] || 1);
  const c = col(m[1]);
  const cFin = m[3] ? col(m[3]) : c;
  const fFin = m[3] ? Number(m[4] || hoja.maxFilas) : f;
  return { f, c, nf: fFin - f + 1, nc: cFin - c + 1 };
}

/** Sheets consume el apóstrofo de escape ("'=CMD" se lee "=CMD"); lo demás vuelve igual. */
const comoLoDevuelveSheets = (v) => (typeof v === 'string' && /^'[=+\-@\t\r]/.test(v) ? v.slice(1) : v);

const FECHA_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const NUMERO_TEXTO = /^-?\d+(\.\d+)?$/;

/**
 * Lo que Sheets guarda al escribir un texto en una celda SIN formato de texto: 'AAAA-MM-DD' pasa a
 * Date (medianoche local) y un texto con pinta de número pasa a número. Con formato '@' queda igual.
 */
function comoLoGuardaSheets(valor, esTexto) {
  if (esTexto || typeof valor !== 'string') return valor;
  const fecha = FECHA_ISO.exec(valor);
  if (fecha) return new Date(Number(fecha[1]), Number(fecha[2]) - 1, Number(fecha[3]));
  return NUMERO_TEXTO.test(valor) ? Number(valor) : valor;
}

/** Clave comparable para ordenar como Sheets: fechas y números por valor, vacío al final, texto alfabético. */
function claveOrden(valor) {
  if (valor === '' || valor === null || valor === undefined) return [2, 0];
  const v = comoLoGuardaSheets(valor, false);
  if (v instanceof Date) return [0, v.getTime()];
  if (typeof v === 'number') return [0, v];
  return [1, String(v)];
}
const compararClaves = (a, b) => (a[0] - b[0]) || (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0);

/**
 * Hoja falsa con celdas de verdad. Todo método que no sea lectura se anota en `mutaciones`
 * ([método, referencia,...]) para comprobar el orden; `falla(metodo, hoja)` inyecta errores.
 * `transformarEscritura(valores)` deforma lo escrito para probar el cuadre.
 */
function hojaLibroFalsa(nombre, { filas = 1000, falla = null, transformarEscritura = null } = {}) {
  const celdas = new Map();
  const clave = (f, c) => `${f},${c}`;
  const hoja = {
    nombre, maxFilas: filas, formatosTexto: [], mutaciones: [], lecturas: 0, insertadas: [], borrada: false, protecciones: 0,
    getName: () => hoja.nombre,
    getMaxRows: () => hoja.maxFilas,
    getMaxColumns: () => 26,
    getLastRow: () => Math.max(0, ...[...celdas.keys()].map((k) => Number(k.split(',')[0]))),
    leer: (f, c) => (celdas.has(clave(f, c)) ? celdas.get(clave(f, c)) : ''),
    poner: (f, c, v) => celdas.set(clave(f, c), v),
    esTexto: (f, c) => hoja.formatosTexto.some((t) => f >= t.f && f < t.f + t.nf && c >= t.c && c < t.c + t.nc),
    insertRowsAfter: (despues, cuantas) => {
      hoja.registrar('insertRowsAfter', despues, cuantas);
      hoja.insertadas.push([despues, cuantas]);
      hoja.maxFilas += cuantas;
    },
    setFrozenRows: (n) => hoja.registrar('setFrozenRows', n),
    hideColumns: (a, b) => hoja.registrar('hideColumns', a, b),
    setConditionalFormatRules: (r) => hoja.registrar('setConditionalFormatRules', r.length),
    getProtections: () => [],
    registrar: (metodo, ...args) => {
      hoja.mutaciones.push([metodo, ...args]);
      if (falla && falla(metodo, hoja, args)) throw new Error(`fallo inyectado en ${metodo}`);
    },
    getRange: (...args) => {
      const r = resolverRango(hoja, args);
      assert.ok(r.f >= 1 && r.f + r.nf - 1 <= hoja.maxFilas, `fila fuera de la hoja: ${r.f}+${r.nf} > ${hoja.maxFilas}`);
      const propios = {
        getValues: () => {
          hoja.lecturas += 1;
          return Array.from({ length: r.nf }, (_, i) => Array.from({ length: r.nc }, (__, j) => comoLoDevuelveSheets(hoja.leer(r.f + i, r.c + j))));
        },
        getValue: () => hoja.leer(r.f, r.c),
        // Como Sheets: '' si la celda no tiene fórmula; si la tiene, el texto de la fórmula.
        getFormula: () => { const v = hoja.leer(r.f, r.c); return typeof v === 'string' && v.startsWith('=') ? v : ''; },
        sort: (especificaciones) => {
          hoja.registrar('sort', args[0], especificaciones);
          const filasOrdenadas = Array.from({ length: r.nf }, (_, i) => Array.from({ length: r.nc }, (__, j) => hoja.leer(r.f + i, r.c + j)))
            .map((fila, i) => ({ fila, i }))
            .sort((a, b) => especificaciones.reduce((d, { column, ascending }) => d || (ascending ? 1 : -1)
              * compararClaves(claveOrden(a.fila[column - r.c]), claveOrden(b.fila[column - r.c])), 0) || a.i - b.i);
          filasOrdenadas.forEach(({ fila }, i) => fila.forEach((v, j) => hoja.poner(r.f + i, r.c + j, v)));
          return rango;
        },
        getNote: () => hoja.notas?.get(clave(r.f, r.c)) || '',
        setValues: (valores) => {
          assert.equal(valores.length, r.nf);
          valores.forEach((fila) => assert.equal(fila.length, r.nc));
          hoja.registrar('setValues', args[0], r.f, r.c, r.nf, r.nc);
          const escritos = transformarEscritura && r.f >= 6 ? transformarEscritura(valores) : valores;
          escritos.forEach((fila, i) => fila.forEach((v, j) => hoja.poner(r.f + i, r.c + j, comoLoGuardaSheets(v, hoja.esTexto(r.f + i, r.c + j)))));
          return rango;
        },
        setValue: (v) => { hoja.registrar('setValue', args[0], v); hoja.poner(r.f, r.c, comoLoGuardaSheets(v, hoja.esTexto(r.f, r.c))); return rango; },
        setFormula: (v) => { hoja.registrar('setFormula', args[0], v); hoja.poner(r.f, r.c, v); return rango; },
        setFormulas: (m) => {
          hoja.registrar('setFormulas', args[0], m);
          m[0].forEach((v, j) => hoja.poner(r.f, r.c + j, v));
          return rango;
        },
        setNote: (nota) => {
          hoja.registrar('setNote', args[0], nota);
          hoja.notas = hoja.notas || new Map();
          hoja.notas.set(clave(r.f, r.c), nota);
          return rango;
        },
        setNumberFormat: (f) => {
          hoja.registrar('setNumberFormat', args[0], f);
          if (f === '@') hoja.formatosTexto.push(r);
          return rango;
        },
      };
      const rango = new Proxy(propios, {
        get: (objeto, metodo) => {
          if (metodo in objeto) return objeto[metodo];
          if (MUTADORES_IGNORADOS.has(metodo)) return undefined;
          return (...a) => {
            hoja.registrar(metodo, args[0], ...a);
            if (metodo === 'protect') hoja.protecciones += 1;
            return rango;
          };
        },
      });
      return rango;
    },
  };
  return hoja;
}

/** Libro falso; `opcionesNuevas` se pasa a cada hoja creada con insertSheet. */
function libroFalso(hojas, opcionesNuevas = {}) {
  const libro = {
    hojas, opcionesNuevas, borradas: [],
    getSheets: () => [...libro.hojas],
    getSheetByName: (n) => libro.hojas.find((h) => h.nombre === n) || null,
    insertSheet: (nombre, indice) => {
      assert.ok(!libro.getSheetByName(nombre), `ya existe la pestaña ${nombre}`);
      const hoja = hojaLibroFalsa(nombre, typeof libro.opcionesNuevas === 'function' ? libro.opcionesNuevas(nombre) : libro.opcionesNuevas);
      libro.hojas.splice(indice, 0, hoja);
      return hoja;
    },
    deleteSheet: (hoja) => {
      libro.hojas.splice(libro.hojas.indexOf(hoja), 1);
      hoja.borrada = true;
      libro.borradas.push(hoja.nombre);
    },
    nombres: () => libro.hojas.map((h) => h.nombre),
  };
  return libro;
}

function candadoFalso(concede = true) {
  const candado = {
    intentos: [], liberado: 0,
    tryLock: (ms) => { candado.intentos.push(ms); return concede; },
    releaseLock: () => { candado.liberado += 1; },
  };
  return candado;
}

/** Septiembre como lo deja el bot: título, A3 con fórmula propia y una fila de datos. */
function septiembreFalsa(opciones) {
  const hoja = hojaLibroFalsa('Septiembre 2026', opciones);
  hoja.poner(3, 1, '=0');
  COLUMNAS.forEach((c, i) => hoja.poner(5, i + 1, c));
  const fila = Object.fromEntries(COLUMNAS.map((c) => [c, '']));
  Object.assign(fila, {
    FECHA: '2026-09-02', PROVEEDOR: 'PANADERIA', 'GASTO (USD)': 4, 'CLASE DE GASTO': 'Supermercado',
    ORIGEN: 'BOT', 'ID FILA': 'sep-1', TIPO: 'GASTO', REGISTRADO: new Date('2026-09-02T12:00:00Z'),
  });
  COLUMNAS.forEach((c, i) => hoja.poner(6, i + 1, fila[c]));
  return hoja;
}

const libroBase = (opciones) => libroFalso([
  septiembreFalsa(), hojaLibroFalsa('_ESTADO'), hojaLibroFalsa('_HISTORIAL'),
], opciones);

const FECHA_IMPORTACION = new Date('2026-09-28T15:20:00Z');

/** deps de importarArchivosViejos_: libro, carpeta, candado, reloj y log en memoria. */
function depsImportacion({ libro, archivos, candado = candadoFalso() }) {
  const logs = [];
  return {
    logs, candado,
    libro: () => libro, carpeta: () => carpetaFalsa(archivos), ahora: () => FECHA_IMPORTACION,
    log: (linea) => logs.push(linea),
  };
}

module.exports = {
  instalarGlobales, archivoFalso, archivoJulio, archivoAgosto, archivoSeptiembre, carpetaFalsa,
  textosLibro, hojaGastos, hojaLibroFalsa, libroFalso, libroBase, septiembreFalsa, candadoFalso,
  depsImportacion, FECHA_IMPORTACION, MOV_JULIO, MOV_AGOSTO,
};
