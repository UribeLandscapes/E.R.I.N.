const test = require('node:test');
const assert = require('node:assert/strict');

// En Apps Script estos nombres son globales (Reglas.js, Carpetas.js, Config.js).
global.MESES = require('../src/Hoja.js').MESES;
global.leerFecha_ = require('../src/Reglas.js').leerFecha_;
Object.assign(global, require('../src/Carpetas.js'));
global.CONFIG = require('./configPrueba.js').CONFIG;

const {
  CARPETA_POR_CLASIFICAR, carpetaHija_, carpetaMes_, archivarFoto_, clasificarFoto_, probarCarpetas,
} = require('../src/CarpetasApp.js');

const iterador = (lista) => {
  let i = 0;
  return { hasNext: () => i < lista.length, next: () => lista[i++] };
};

let siguienteId = 0;

/** Archivo falso de Drive: guarda nombre, carpeta y si está en la papelera. */
function archivoFalso(nombre, mime, carpeta) {
  const archivo = {
    id: `archivo-${siguienteId += 1}`, nombre, mime, carpeta, papelera: false, movidas: 0,
    getId: () => archivo.id,
    getName: () => archivo.nombre,
    setName: (n) => { archivo.nombre = n; return archivo; },
    getMimeType: () => archivo.mime,
    getParents: () => iterador([archivo.carpeta]),
    getUrl: () => `https://drive/${archivo.id}`,
    moveTo: (destino) => {
      archivo.carpeta.archivos = archivo.carpeta.archivos.filter((a) => a !== archivo);
      destino.archivos.push(archivo);
      archivo.carpeta = destino;
      archivo.movidas += 1;
      return archivo;
    },
    setTrashed: (valor) => { archivo.papelera = valor; return archivo; },
  };
  return archivo;
}

/** Carpeta falsa de Drive con hijas y archivos; anota cuántas carpetas creó. */
function carpetaFalsa(nombre) {
  const carpeta = {
    id: `carpeta-${siguienteId += 1}`, nombre, hijas: [], archivos: [], creadas: 0,
    getId: () => carpeta.id,
    getName: () => carpeta.nombre,
    getFoldersByName: (n) => iterador(carpeta.hijas.filter((h) => h.nombre === n)),
    getFilesByName: (n) => iterador(carpeta.archivos.filter((a) => a.nombre === n)),
    createFolder: (n) => {
      const hija = carpetaFalsa(n);
      carpeta.hijas.push(hija);
      carpeta.creadas += 1;
      return hija;
    },
    createFile: (blob) => {
      const archivo = archivoFalso(blob.getName(), blob.getContentType(), carpeta);
      carpeta.archivos.push(archivo);
      return archivo;
    },
  };
  return carpeta;
}

const blobFalso = (nombre, tipo) => ({ getName: () => nombre, getContentType: () => tipo });
const hija = (carpeta, nombre) => carpeta.hijas.find((h) => h.nombre === nombre);

test('carpetaHija_ usa la carpeta que ya existe', () => {
  const raiz = carpetaFalsa('Facturas');
  const existente = raiz.createFolder('2026');
  raiz.creadas = 0;
  assert.equal(carpetaHija_(raiz, '2026'), existente);
  assert.equal(raiz.creadas, 0);
});

test('carpetaHija_ crea la carpeta si no existe', () => {
  const raiz = carpetaFalsa('Facturas');
  const nueva = carpetaHija_(raiz, '2026');
  assert.equal(nueva.nombre, '2026');
  assert.equal(raiz.creadas, 1);
});

test('carpetaMes_ crea AAAA/N. Mes una sola vez y la reusa', () => {
  const raiz = carpetaFalsa('Facturas');
  const julio = carpetaMes_(raiz, '2026-07-03');
  assert.equal(julio.nombre, '7. Julio');
  assert.equal(hija(raiz, '2026').hijas[0], julio);
  assert.equal(carpetaMes_(raiz, '2026-07-28'), julio);
  assert.equal(raiz.hijas.length, 1);
  assert.equal(hija(raiz, '2026').hijas.length, 1);
});

test('carpetaMes_ separa meses y años distintos', () => {
  const raiz = carpetaFalsa('Facturas');
  carpetaMes_(raiz, '2026-07-03');
  carpetaMes_(raiz, '2026-08-01');
  carpetaMes_(raiz, '2027-01-02');
  assert.deepEqual(hija(raiz, '2026').hijas.map((h) => h.nombre), ['7. Julio', '8. Agosto']);
  assert.deepEqual(hija(raiz, '2027').hijas.map((h) => h.nombre), ['1. Enero']);
});

test('archivarFoto_ guarda la foto en "Por clasificar" con nombre temporal tg-<id>', () => {
  const raiz = carpetaFalsa('Facturas');
  const archivo = archivarFoto_(blobFalso('file_12.jpg', 'image/jpeg'), 345, raiz);
  assert.equal(archivo.carpeta, hija(raiz, CARPETA_POR_CLASIFICAR));
  assert.equal(archivo.nombre, 'tg-345.jpg');
});

test('archivarFoto_ reusa "Por clasificar" en la segunda foto', () => {
  const raiz = carpetaFalsa('Facturas');
  archivarFoto_(blobFalso('a.jpg', 'image/jpeg'), 1, raiz);
  archivarFoto_(blobFalso('b.pdf', 'application/pdf'), 2, raiz);
  assert.equal(raiz.hijas.length, 1);
  assert.deepEqual(hija(raiz, CARPETA_POR_CLASIFICAR).archivos.map((a) => a.nombre), ['tg-1.jpg', 'tg-2.pdf']);
});

test('archivarFoto_ rechaza un id de mensaje vacío', () => {
  const raiz = carpetaFalsa('Facturas');
  assert.throws(() => archivarFoto_(blobFalso('a.jpg', 'image/jpeg'), '', raiz), /id de mensaje vacío/);
  assert.throws(() => archivarFoto_(blobFalso('a.jpg', 'image/jpeg'), null, raiz), /id de mensaje vacío/);
  assert.equal(raiz.hijas.length, 0);
});

test('clasificarFoto_ mueve y renombra la foto a AAAA/N. Mes', () => {
  const raiz = carpetaFalsa('Facturas');
  const archivo = archivarFoto_(blobFalso('a.jpg', 'image/jpeg'), 7, raiz);
  const resultado = clasificarFoto_(archivo, '2026-07-03', 'Seven 11 compra', raiz);
  const julio = hija(hija(raiz, '2026'), '7. Julio');
  assert.equal(archivo.carpeta, julio);
  assert.equal(archivo.nombre, '2026.07.03 - Seven 11 compra.jpg');
  assert.deepEqual(resultado, {
    ruta: 'Facturas/2026/7. Julio/2026.07.03 - Seven 11 compra.jpg', url: `https://drive/${archivo.id}`,
  });
  assert.deepEqual(hija(raiz, CARPETA_POR_CLASIFICAR).archivos, []);
});

test('clasificarFoto_ no pisa otra foto con el mismo nombre', () => {
  const raiz = carpetaFalsa('Facturas');
  const primera = archivarFoto_(blobFalso('a.jpg', 'image/jpeg'), 1, raiz);
  const segunda = archivarFoto_(blobFalso('b.jpg', 'image/jpeg'), 2, raiz);
  clasificarFoto_(primera, '2026-07-03', 'taxi', raiz);
  clasificarFoto_(segunda, '2026-07-03', 'taxi', raiz);
  assert.equal(primera.nombre, '2026.07.03 - taxi.jpg');
  assert.equal(segunda.nombre, '2026.07.03 - taxi (2).jpg');
});

test('clasificarFoto_ dos veces con los mismos datos no cambia nada (no choca consigo misma)', () => {
  const raiz = carpetaFalsa('Facturas');
  const archivo = archivarFoto_(blobFalso('a.jpg', 'image/jpeg'), 1, raiz);
  clasificarFoto_(archivo, '2026-07-03', 'taxi', raiz);
  const otra = clasificarFoto_(archivo, '2026-07-03', 'taxi', raiz);
  assert.equal(archivo.nombre, '2026.07.03 - taxi.jpg');
  assert.equal(archivo.movidas, 1);
  assert.equal(otra.ruta, 'Facturas/2026/7. Julio/2026.07.03 - taxi.jpg');
});

test('clasificarFoto_ con otra fecha la mueve al mes nuevo (el usuario corrigió la fecha)', () => {
  const raiz = carpetaFalsa('Facturas');
  const archivo = archivarFoto_(blobFalso('a.jpg', 'image/jpeg'), 1, raiz);
  clasificarFoto_(archivo, '2026-07-31', 'taxi', raiz);
  clasificarFoto_(archivo, '2026-08-01', 'taxi', raiz);
  assert.equal(archivo.carpeta, hija(hija(raiz, '2026'), '8. Agosto'));
  assert.equal(archivo.nombre, '2026.08.01 - taxi.jpg');
  assert.deepEqual(hija(hija(raiz, '2026'), '7. Julio').archivos, []);
});

test('clasificarFoto_ con fecha inválida no mueve ni renombra', () => {
  const raiz = carpetaFalsa('Facturas');
  const archivo = archivarFoto_(blobFalso('a.jpg', 'image/jpeg'), 1, raiz);
  assert.throws(() => clasificarFoto_(archivo, '2026-02-30', 'taxi', raiz), /fecha inválida/);
  assert.equal(archivo.nombre, 'tg-1.jpg');
  assert.equal(archivo.movidas, 0);
  assert.equal(hija(raiz, '2026'), undefined);
});

test('probarCarpetas archiva, clasifica, registra la ruta y manda la prueba a la papelera', () => {
  const raiz = carpetaFalsa('Facturas');
  const registro = [];
  let pedida;
  global.DriveApp = { getFolderById: (id) => { pedida = id; return raiz; } };
  global.Utilities = {
    newBlob: (datos, tipo, nombre) => ({ datos, ...blobFalso(nombre, tipo) }),
    formatDate: (fecha, zona, formato) => {
      assert.equal(zona, CONFIG.TIMEZONE);
      assert.equal(formato, 'yyyy-MM-dd');
      return '2026-09-26';
    },
  };
  global.Logger = { log: (l) => registro.push(l) };

  const lineas = probarCarpetas();

  assert.equal(pedida, CONFIG.FACTURAS_FOLDER_ID);
  const septiembre = hija(hija(raiz, '2026'), '9. Septiembre');
  const [archivo] = septiembre.archivos;
  assert.equal(archivo.nombre, '2026.09.26 - prueba de carpetas.jpg');
  assert.equal(archivo.papelera, true);
  assert.ok(hija(raiz, CARPETA_POR_CLASIFICAR));
  assert.deepEqual(registro, lineas);
  assert.ok(lineas.some((l) => l.includes('Facturas/2026/9. Septiembre/2026.09.26 - prueba de carpetas.jpg')));
  assert.ok(lineas.some((l) => l.includes('papelera')));
});

test('probarCarpetas manda la prueba a la papelera aunque falle al clasificar', () => {
  const raiz = carpetaFalsa('Facturas');
  global.DriveApp = { getFolderById: () => raiz };
  global.Utilities = {
    newBlob: (datos, tipo, nombre) => blobFalso(nombre, tipo),
    formatDate: () => 'no-es-fecha',
  };
  global.Logger = { log: () => {} };

  assert.throws(() => probarCarpetas(), /fecha inválida/);
  const [archivo] = hija(raiz, CARPETA_POR_CLASIFICAR).archivos;
  assert.equal(archivo.papelera, true);
});
