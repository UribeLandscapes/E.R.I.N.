const test = require('node:test');
const assert = require('node:assert/strict');

// En Apps Script estos nombres son globales (Hoja.js, Historial.js, HojaApp.js, Config.js).
global.MESES = require('../src/Hoja.js').MESES;
Object.assign(global, require('../src/Hoja.js'));
Object.assign(global, require('../src/Historial.js'));
global.PESTANA_HISTORIAL = require('../src/HojaApp.js').PESTANA_HISTORIAL;
global.CONFIG = require('./configPrueba.js').CONFIG;

const {
  MIME_XLSX, esExcel_, textosXlsx_, archivosExcel_, fechaLocal_, importarHistorial_, importarHistorial,
  reimportarHistorialExacto_, reimportarHistorialExacto,
} = require('../src/HistorialApp.js');

// XML inventado: nunca datos reales de los Excel del usuario.
const txt = (ref, t) => `<c r="${ref}" t="inlineStr"><is><t>${t}</t></is></c>`;
const num = (ref, v) => `<c r="${ref}"><v>${v}</v></c>`;
const ENCABEZADOS = `<row r="2">${txt('B2', 'FECHA')}${txt('C2', 'DEPÓSITO')}${txt('D2', 'GASTO')}${txt('E2', 'PROVEEDOR')}${txt('F2', 'CLASE DE GASTO')}</row>`;
/** gastos = [[serie, gasto, proveedor, clase]] */
const hojaGastos = (gastos) => `<worksheet><sheetData>${ENCABEZADOS}${gastos.map(([serie, gasto, proveedor, clase], i) => {
  const n = i + 3;
  return `<row r="${n}">${num(`B${n}`, serie)}${num(`D${n}`, gasto)}${txt(`E${n}`, proveedor)}${txt(`F${n}`, clase)}</row>`;
}).join('')}</sheetData></worksheet>`;

/** pestanas = [{ nombre, xml }] → textos por ruta de un.xlsx descomprimido. */
function textosLibro(pestanas) {
  const textos = {
    '[Content_Types].xml': '<Types/>',
    'xl/workbook.xml': `<workbook><sheets>${pestanas.map((p, i) => `<sheet name="${p.nombre}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `<Relationships>${pestanas.map((_, i) => `<Relationship Id="rId${i + 1}" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}</Relationships>`,
    'xl/media/image1.png': 'binario',
  };
  pestanas.forEach((p, i) => { textos[`xl/worksheets/sheet${i + 1}.xml`] = p.xml; });
  return textos;
}

/** Archivo falso de Drive: su blob "descomprime" a los textos dados y anota cuáles se leyeron. */
function archivoFalso(nombre, textos, { mime = MIME_XLSX } = {}) {
  const leidos = [];
  const blob = { tipo: null, textos, leidos };
  blob.setContentType = (t) => { blob.tipo = t; return blob; };
  return { leidos, blob, getName: () => nombre, getMimeType: () => mime, getBlob: () => blob };
}

global.Utilities = {
  unzip: (blob) => {
    assert.equal(blob.tipo, 'application/zip', 'el blob se marca como zip antes de descomprimir');
    return Object.entries(blob.textos).map(([ruta, texto]) => ({
      getName: () => ruta,
      getDataAsString: (charset) => {
        assert.equal(charset, 'UTF-8');
        blob.leidos.push(ruta);
        return texto;
      },
    }));
  },
};

function carpetaFalsa(archivos) {
  return {
    getFiles: () => {
      let i = 0;
      return { hasNext: () => i < archivos.length, next: () => archivos[i++] };
    },
  };
}

/** _HISTORIAL falsa: fila 1 de encabezados + filas; guarda formatos y escrituras. */
function hojaHistorialFalsa(filas = []) {
  const hoja = {
    filas: [[...COLUMNAS_HISTORIAL], ...filas.map((f) => [...f])],
    formatos: [],
    escrituras: 0,
    borrados: [],
    // como Sheets: la última fila con contenido (después de clearContent baja)
    getLastRow: () => {
      let n = hoja.filas.length;
      while (n > 0 && hoja.filas[n - 1].every((c) => c === '')) n -= 1;
      return n;
    },
    getRange: (fila, columna, alto, ancho) => ({
      getValues: () => hoja.filas.slice(fila - 1, fila - 1 + alto).map((f) => f.slice(columna - 1, columna - 1 + ancho)),
      clearContent: () => {
        hoja.borrados.push([fila, columna, alto, ancho]);
        for (let i = 0; i < alto; i += 1) hoja.filas[fila - 1 + i] = hoja.filas[fila - 1 + i].map((c, j) => (j >= columna - 1 && j < columna - 1 + ancho ? '' : c));
      },
      setNumberFormat: (f) => { hoja.formatos.push([fila, columna, alto, ancho, f]); },
      setValues: (valores) => {
        assert.equal(valores.length, alto);
        valores.forEach((v) => assert.equal(v.length, ancho));
        hoja.escrituras += 1;
        valores.forEach((v, i) => { hoja.filas[fila - 1 + i] = v; });
      },
    }),
  };
  return hoja;
}

const julio = () => archivoFalso('07. GASTOS DE JULIO 2026.xlsx', textosLibro([
  { nombre: 'GASTOS JULIO', xml: hojaGastos([[46204, -10, 'TIENDA A', 'COMIDA'], [46205, -5.5, 'FARMACIA', 'SALUD']]) },
  { nombre: 'Hoja4', xml: hojaGastos([[46083, -3, 'TAXI', 'TRANSPORTE']]) },
  { nombre: 'Tabla dinámica', xml: '<worksheet><sheetData/></worksheet>' },
  { nombre: 'PLANILLA', xml: hojaGastos([[46204, -999, 'NO LEER', 'NO LEER']]) },
]));
const agosto = () => archivoFalso('08. GASTOS DE AGOSTO 2026.xlsx', textosLibro([
  { nombre: 'GASTOS AGOSTO', xml: hojaGastos([[46235, -7, 'TIENDA A', 'COMIDA']]) },
  { nombre: 'Hoja4', xml: hojaGastos([[46083, -3, 'TAXI', 'TRANSPORTE']]) },
]));

// --- archivos ---

test('esExcel_ acepta .xlsx por nombre o por tipo, y nada más', () => {
  assert.equal(esExcel_(archivoFalso('a.XLSX', {}, { mime: 'application/octet-stream' })), true);
  assert.equal(esExcel_(archivoFalso('sin extension', {})), true);
  assert.equal(esExcel_(archivoFalso('notas.pdf', {}, { mime: 'application/pdf' })), false);
  assert.equal(esExcel_(archivoFalso('hoja', {}, { mime: 'application/vnd.google-apps.spreadsheet' })), false);
});

test('archivosExcel_ ordena por nombre y deja fuera lo que no es Excel', () => {
  const otro = archivoFalso('leeme.txt', {}, { mime: 'text/plain' });
  const nombres = archivosExcel_(carpetaFalsa([agosto(), otro, julio()])).map((a) => a.getName());
  assert.deepEqual(nombres, ['07. GASTOS DE JULIO 2026.xlsx', '08. GASTOS DE AGOSTO 2026.xlsx']);
});

test('textosXlsx_ no lee ningún texto hasta que se pide', () => {
  const archivo = julio();
  const textos = textosXlsx_(archivo);
  assert.ok(Object.keys(textos).includes('xl/workbook.xml'));
  assert.deepEqual(archivo.leidos, []);
  assert.match(textos['xl/workbook.xml'], /GASTOS JULIO/);
  assert.deepEqual(archivo.leidos, ['xl/workbook.xml']);
});

test('fechaLocal_ arma la fecha a medianoche local', () => {
  const d = fechaLocal_('2026-07-01');
  assert.deepEqual([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()], [2026, 6, 1, 0]);
});

// --- importación ---

test('importarHistorial_ agrega las filas nuevas en una escritura y registra conteos', () => {
  const archivoJulio = julio();
  const hoja = hojaHistorialFalsa();
  const lineas = importarHistorial_(carpetaFalsa([agosto(), archivoJulio]), hoja);

  assert.equal(hoja.escrituras, 1);
  assert.equal(hoja.filas.length, 1 + 4);
  const [fecha, ...resto] = hoja.filas[1];
  assert.ok(fecha instanceof Date);
  assert.deepEqual(resto.slice(0, 6), ['TIENDA A', 'COMIDA', '', 10, '07. GASTOS DE JULIO 2026.xlsx', 'GASTOS JULIO']);
  assert.deepEqual(hoja.filas.map((f) => f[6]).slice(1), ['GASTOS JULIO', 'GASTOS JULIO', 'Hoja4', 'GASTOS AGOSTO']);
  assert.deepEqual(lineas, [
    '07. GASTOS DE JULIO 2026.xlsx / GASTOS JULIO: 2 leídas, 2 nuevas',
    '07. GASTOS DE JULIO 2026.xlsx / Hoja4: 1 leídas, 1 nuevas',
    '08. GASTOS DE AGOSTO 2026.xlsx / GASTOS AGOSTO: 1 leídas, 1 nuevas',
    '08. GASTOS DE AGOSTO 2026.xlsx / Hoja4: 1 leídas, 0 nuevas',
    'Total: 4 filas nuevas, 1 repetidas saltadas',
    '_HISTORIAL: 4 filas, 3 categorías distintas',
  ]);
  assert.ok(!archivoJulio.leidos.includes('xl/worksheets/sheet4.xml'), 'PLANILLA nunca se lee');
  assert.ok(!archivoJulio.leidos.includes('xl/media/image1.png'));
});

test('importarHistorial_ pone formato de texto en PROVEEDOR, CLASE, ARCHIVO, PESTAÑA y CLAVE antes de escribir', () => {
  const hoja = hojaHistorialFalsa();
  importarHistorial_(carpetaFalsa([julio()]), hoja);
  assert.deepEqual(hoja.formatos, [2, 3, 6, 7, 8].map((col) => [2, col, 3, 1, '@']));
});

test('importarHistorial_ corrida dos veces no duplica y cuenta lo que ya había', () => {
  const hoja = hojaHistorialFalsa();
  importarHistorial_(carpetaFalsa([julio(), agosto()]), hoja);
  const lineas = importarHistorial_(carpetaFalsa([julio(), agosto()]), hoja);
  assert.equal(hoja.escrituras, 1);
  assert.equal(hoja.filas.length, 5);
  assert.deepEqual(lineas.slice(-2), ['Total: 0 filas nuevas, 5 repetidas saltadas', '_HISTORIAL: 4 filas, 3 categorías distintas']);
});

test('importarHistorial_ agrega debajo de lo que ya había', () => {
  const hoja = hojaHistorialFalsa([[new Date(2026, 0, 1), 'VIEJO', 'OTRA', '', 1, 'x.xlsx', 'X', 'clave-vieja']]);
  const lineas = importarHistorial_(carpetaFalsa([agosto()]), hoja);
  assert.equal(hoja.filas[1][7], 'clave-vieja');
  assert.equal(hoja.filas.length, 4);
  assert.equal(lineas.at(-1), '_HISTORIAL: 3 filas, 3 categorías distintas');
});

test('importarHistorial_ con carpeta sin Excel no escribe nada', () => {
  const hoja = hojaHistorialFalsa();
  assert.deepEqual(importarHistorial_(carpetaFalsa([]), hoja), [
    'Total: 0 filas nuevas, 0 repetidas saltadas', '_HISTORIAL: 0 filas, 0 categorías distintas',
  ]);
  assert.equal(hoja.escrituras, 0);
});

test('importarHistorial_ si un Excel está roto no escribe nada y dice cuál fue', () => {
  const hoja = hojaHistorialFalsa();
  const roto = archivoFalso('09. roto.xlsx', { 'algo.xml': '<x/>' });
  assert.throws(() => importarHistorial_(carpetaFalsa([julio(), roto]), hoja), /^Error: 09\. roto\.xlsx: no parece un \.xlsx/);
  assert.equal(hoja.escrituras, 0);
});

// --- montos exactos ---

const exactos = () => archivoFalso('07. GASTOS DE JULIO 2026.xlsx', textosLibro([
  { nombre: 'GASTOS JULIO', xml: hojaGastos([[46204, -46.25999999999999, 'TIENDA A', 'COMIDA'], [46205, -10.125, 'FARMACIA', 'SALUD']]) },
]));
const filaVieja = (proveedor, clave) => [new Date(2026, 6, 1), proveedor, 'COMIDA', '', 10.13, 'x.xlsx', 'X', clave];

test('importarHistorial_ guarda los montos exactos del Excel, sin redondear a centavos', () => {
  const hoja = hojaHistorialFalsa();
  importarHistorial_(carpetaFalsa([exactos()]), hoja);
  assert.deepEqual(hoja.filas.slice(1).map((f) => f[4]), [46.25999999999999, 10.125]);
});

// --- reimportación exacta ---

test('reimportarHistorialExacto_ vacía las filas viejas redondeadas y escribe las exactas desde la fila 2', () => {
  const hoja = hojaHistorialFalsa([filaVieja('TIENDA A', 'a'), filaVieja('FARMACIA', 'b')]);
  const lineas = reimportarHistorialExacto_(carpetaFalsa([exactos()]), hoja);

  assert.deepEqual(hoja.borrados, [[2, 1, 2, COLUMNAS_HISTORIAL.length]]);
  assert.equal(hoja.escrituras, 1);
  assert.equal(hoja.filas.length, 3);
  assert.deepEqual(hoja.filas.slice(1).map((f) => f[4]), [46.25999999999999, 10.125]);
  assert.deepEqual(hoja.filas.slice(1).map((f) => f[1]), ['TIENDA A', 'FARMACIA']);
  assert.deepEqual(hoja.formatos.map((f) => f[0]), [2, 2, 2, 2, 2]);
  assert.deepEqual(lineas, [
    '07. GASTOS DE JULIO 2026.xlsx / GASTOS JULIO: 2 leídas',
    'Antes: 2 filas; ahora: 2 filas',
    '_HISTORIAL: 2 categorías distintas',
  ]);
});

test('reimportarHistorialExacto_ con más filas nuevas que viejas no deja duplicados y salta Hoja4 repetida', () => {
  const hoja = hojaHistorialFalsa([filaVieja('TIENDA A', 'a')]);
  const lineas = reimportarHistorialExacto_(carpetaFalsa([julio(), agosto()]), hoja);
  assert.equal(hoja.filas.length, 5);
  assert.equal(new Set(hoja.filas.slice(1).map((f) => f[7])).size, 4);
  assert.equal(lineas.includes('Antes: 1 filas; ahora: 4 filas'), true);
});

test('reimportarHistorialExacto_ con hoja vacía solo escribe', () => {
  const hoja = hojaHistorialFalsa();
  reimportarHistorialExacto_(carpetaFalsa([julio()]), hoja);
  assert.deepEqual(hoja.borrados, []);
  assert.equal(hoja.filas.length, 4);
});

test('reimportarHistorialExacto_ PARO si hay menos filas nuevas que existentes: no borra ni escribe', () => {
  const viejas = [filaVieja('A', 'a'), filaVieja('B', 'b'), filaVieja('C', 'c'), filaVieja('D', 'd')];
  const hoja = hojaHistorialFalsa(viejas);
  const lineas = reimportarHistorialExacto_(carpetaFalsa([exactos()]), hoja);
  assert.equal(lineas.length, 1);
  assert.match(lineas[0], /^PARO:/);
  assert.match(lineas[0], /4/);
  assert.match(lineas[0], /2/);
  assert.match(lineas[0], /falta un Excel/);
  assert.deepEqual(hoja.borrados, []);
  assert.equal(hoja.escrituras, 0);
  assert.equal(hoja.filas.length, 5);
});

test('reimportarHistorialExacto_ PARO con carpeta sin Excel: no toca la hoja', () => {
  const hoja = hojaHistorialFalsa([filaVieja('A', 'a')]);
  const lineas = reimportarHistorialExacto_(carpetaFalsa([]), hoja);
  assert.match(lineas[0], /^PARO: .*no hay Excel/);
  assert.deepEqual(hoja.borrados, []);
  assert.equal(hoja.escrituras, 0);
});

test('reimportarHistorialExacto_ si un Excel está roto lanza antes de borrar y no toca la hoja', () => {
  const hoja = hojaHistorialFalsa([filaVieja('A', 'a')]);
  const roto = archivoFalso('09. roto.xlsx', { 'algo.xml': '<x/>' });
  assert.throws(() => reimportarHistorialExacto_(carpetaFalsa([julio(), roto]), hoja), /^Error: 09\. roto\.xlsx: no parece un \.xlsx/);
  assert.deepEqual(hoja.borrados, []);
  assert.equal(hoja.escrituras, 0);
  assert.equal(hoja.filas.length, 2);
});

// --- punto de entrada ---

test('reimportarHistorialExacto abre la hoja y la carpeta de CONFIG y registra cada línea', () => {
  const hoja = hojaHistorialFalsa();
  const pedidos = [];
  const registro = [];
  global.SpreadsheetApp = { openById: (id) => { pedidos.push(id); return { getSheetByName: (n) => (n === '_HISTORIAL' ? hoja : null) }; } };
  global.DriveApp = { getFolderById: (id) => { pedidos.push(id); return carpetaFalsa([julio()]); } };
  global.Logger = { log: (l) => registro.push(l) };
  const lineas = reimportarHistorialExacto();
  assert.deepEqual(pedidos, [CONFIG.SHEET_ID, CONFIG.HISTORIAL_FOLDER_ID]);
  assert.deepEqual(registro, lineas);
  assert.equal(hoja.filas.length, 4);
});

test('reimportarHistorialExacto sin _HISTORIAL pide correr configurarHoja primero', () => {
  global.SpreadsheetApp = { openById: () => ({ getSheetByName: () => null }) };
  assert.throws(() => reimportarHistorialExacto(), /falta la pestaña _HISTORIAL: corre configurarHoja primero/);
});

test('importarHistorial abre la hoja y la carpeta de CONFIG y registra cada línea', () => {
  const hoja = hojaHistorialFalsa();
  const pedidos = [];
  const registro = [];
  global.SpreadsheetApp = { openById: (id) => { pedidos.push(id); return { getSheetByName: (n) => (n === '_HISTORIAL' ? hoja : null) }; } };
  global.DriveApp = { getFolderById: (id) => { pedidos.push(id); return carpetaFalsa([julio()]); } };
  global.Logger = { log: (l) => registro.push(l) };
  const lineas = importarHistorial();
  assert.deepEqual(pedidos, [CONFIG.SHEET_ID, CONFIG.HISTORIAL_FOLDER_ID]);
  assert.deepEqual(registro, lineas);
  assert.equal(hoja.filas.length, 4);
});

test('importarHistorial sin _HISTORIAL pide correr configurarHoja primero', () => {
  global.SpreadsheetApp = { openById: () => ({ getSheetByName: () => null }) };
  assert.throws(() => importarHistorial(), /falta la pestaña _HISTORIAL: corre configurarHoja primero/);
});
