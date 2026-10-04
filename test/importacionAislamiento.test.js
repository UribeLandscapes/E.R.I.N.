const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// los caminos REALES del bot ignoran las pestañas "(archivo)". Las pestañas salen de correr
// importarArchivosViejos_ de verdad sobre hojas falsas; cada prueba tiene un control que renombra la
// pestaña a "Julio 2026" para demostrar que, sin el sufijo, ese mismo camino sí la habría leído.
const F = require('./falsosImportacion.js');

F.instalarGlobales();
// En Apps Script todos los archivos comparten un ámbito global: aquí se cargan todos los de src/.
const SRC = path.join(__dirname, '..', 'src');
fs.readdirSync(SRC).filter((a) => a.endsWith('.js')).forEach((a) => Object.assign(global, require(path.join(SRC, a))));
global.PESTANA_ESTADO = '_ESTADO';

const { importarArchivosViejos_ } = require('../src/ImportacionApp.js');
const { procesarEdicion_ } = require('../src/EdicionApp.js');
const { revisarDatosDePrueba_, borrarDatosDePrueba_ } = require('../src/LimpiezaPruebaApp.js');

const JULIO = 'Julio 2026 (archivo)';
const AGOSTO = 'Agosto 2026 (archivo)';
const col = (nombre) => numeroColumna_(nombre);

/** Libro con septiembre, _ESTADO, _HISTORIAL y las dos pestañas de archivo ya importadas. */
function libroImportado() {
  const libro = F.libroBase();
  importarArchivosViejos_(F.depsImportacion({ libro, archivos: [F.archivoJulio(), F.archivoAgosto()] }));
  return libro;
}

/** Mismo libro pero con julio "colado" como pestaña normal: el control negativo. */
function libroConJulioColado() {
  const libro = libroImportado();
  libro.getSheetByName(JULIO).nombre = 'Julio 2026';
  return libro;
}

const sinCambios = (hoja, antes) => {
  assert.equal(hoja.lecturas, antes.lecturas, `${hoja.nombre}: no se leyó`);
  assert.equal(hoja.mutaciones.length, antes.mutaciones, `${hoja.nombre}: no se escribió`);
};
const foto = (libro) => Object.fromEntries([JULIO, AGOSTO].map((n) => {
  const h = libro.getSheetByName(n);
  return [n, { lecturas: h.lecturas, mutaciones: h.mutaciones.length }];
}));

// --- saldo y categorías (MensajesApp.resumenHoja_) ---

test('saldo y categorías del bot no cuentan las pestañas de archivo', () => {
  const libro = libroImportado();
  const antes = foto(libro);
  const resumen = resumenHoja_(libro);
  assert.equal(resumen.saldo, -4, 'solo septiembre: gasto de 4');
  assert.deepEqual(resumen.categorias, ['Supermercado']);
  assert.equal(resumen.saldoInicialDefinido, false);
  [JULIO, AGOSTO].forEach((n) => sinCambios(libro.getSheetByName(n), antes[n]));
});

test('control: sin el sufijo, julio sí entraría en el saldo y las categorías', () => {
  const resumen = resumenHoja_(libroConJulioColado());
  assert.equal(resumen.saldo, -4 + 500 - 15.3);
  assert.ok(resumen.categorias.includes('COMIDA PLAYA'));
});

// --- alEditar (Edicion.js / EdicionApp.procesarEdicion_) ---

function eventoEn(libro, hoja) {
  return {
    source: libro,
    range: {
      getSheet: () => hoja, getRow: () => PRIMERA_FILA_DATOS, getNumRows: () => 1,
      getColumn: () => col('PROVEEDOR'), getNumColumns: () => 1,
    },
  };
}
const depsEdicion = () => {
  const d = { relojes: 0 };
  d.ahora = () => { d.relojes += 1; return new Date('2026-09-28T15:00:00Z'); };
  d.formatear = () => '20260928-100000';
  return d;
};

test('editar una celda de una pestaña de archivo no hace nada: sin sellos, sin preguntas', () => {
  const libro = libroImportado();
  const antes = foto(libro);
  const d = depsEdicion();
  [JULIO, AGOSTO].forEach((n) => procesarEdicion_(eventoEn(libro, libro.getSheetByName(n)), d));
  assert.equal(d.relojes, 0, 'ni siquiera tomó la hora');
  [JULIO, AGOSTO].forEach((n) => sinCambios(libro.getSheetByName(n), antes[n]));
});

test('control: en una pestaña de mes normal alEditar sí actúa', () => {
  const libro = libroConJulioColado();
  const d = depsEdicion();
  procesarEdicion_(eventoEn(libro, libro.getSheetByName('Julio 2026')), d);
  assert.ok(d.relojes > 0);
});

// --- búsqueda de filas (EscrituraApp) ---

test('la búsqueda de filas y de la pestaña del mes no encuentran las de archivo', () => {
  const libro = libroImportado();
  const idArchivo = libro.getSheetByName(JULIO).leer(PRIMERA_FILA_DATOS, col('ID FILA'));
  assert.ok(idArchivo);
  assert.deepEqual(buscarFilas_(libro, [idArchivo], JULIO), []);
  assert.equal(pestanaDelMes_(libro, 2026, 7), null);
  assert.equal(pestanaDelMes_(libro, 2026, 8), null);
  assert.equal(libro.getSheetByName(JULIO).lecturas, 1, 'solo la lectura de cuadre de la importación');
});

test('un movimiento fechado en julio crea su pestaña normal en vez de usar la de archivo', () => {
  const libro = libroImportado();
  const original = global.crearPestanaMes_;
  const creadas = [];
  global.crearPestanaMes_ = (ss, anio, mes) => {
    creadas.push([anio, mes]);
    ss.hojas.splice(ss.hojas.length - 2, 0, F.hojaLibroFalsa('Julio 2026'));
    return { nombre: 'Julio 2026' };
  };
  const hoja = hojaMes_(libro, '2026-07-15');
  global.crearPestanaMes_ = original;
  assert.deepEqual(creadas, [[2026, 7]]);
  assert.equal(hoja.getName(), 'Julio 2026');
});

test('control: buscarFilas_ sí halla la fila si la pestaña se llama Julio 2026', () => {
  const libro = libroConJulioColado();
  const id = libro.getSheetByName('Julio 2026').leer(PRIMERA_FILA_DATOS, col('ID FILA'));
  assert.equal(buscarFilas_(libro, [id], 'Julio 2026').length, 1);
});

// --- limpieza de datos de prueba (LimpiezaPruebaApp) ---
global.leerRegistroEdiciones_ = () => ({ disponible: true, porId: new Map() });
global.registroParaEscribir_ = global.leerRegistroEdiciones_;

function depsLimpieza(libro) {
  const props = new Map();
  const vacia = (nombre) => ({
    getName: () => nombre, getFolders: () => ({ hasNext: () => false }), getFiles: () => ({ hasNext: () => false }),
  });
  return {
    registro: [], props,
    libro: () => libro, raiz: () => vacia('Facturas'),
    propiedades: {
      getProperty: (k) => (props.has(k) ? props.get(k) : null),
      setProperty: (k, v) => props.set(k, v),
      deleteProperty: (k) => props.delete(k),
    },
    candado: { tryLock: () => true, releaseLock: () => {} },
    log(l) { this.registro.push(l); },
  };
}

test('la limpieza de prueba ni lista ni borra las pestañas de archivo', () => {
  const libro = libroImportado();
  const antes = foto(libro);
  const deps = depsLimpieza(libro);
  const revision = revisarDatosDePrueba_(deps);
  assert.ok(revision.some((l) => l.startsWith('Pestaña Septiembre 2026')));
  assert.ok(!revision.some((l) => l.includes('(archivo)')), revision.join('\n'));
  const borrado = borrarDatosDePrueba_(deps);
  assert.ok(borrado.some((l) => l.startsWith('Pestañas de mes:') && l.endsWith('en 1 pestaña(s)')), borrado.join('\n'));
  assert.ok(libro.getSheetByName('Septiembre 2026').mutaciones.some(([m]) => m === 'clearContent'), 'sí vació septiembre');
  [JULIO, AGOSTO].forEach((n) => sinCambios(libro.getSheetByName(n), antes[n]));
});

test('control: sin el sufijo, la limpieza sí listaría (y vaciaría) julio', () => {
  const revision = revisarDatosDePrueba_(depsLimpieza(libroConJulioColado()));
  assert.ok(revision.some((l) => l.startsWith('Pestaña Julio 2026:')));
});

// --- encadenado de saldo (posicionPestanaMes_ / anteriorDe_) y migraciones de HojaApp ---

test('posicionPestanaMes_ y anteriorDe_ ignoran las pestañas de archivo', () => {
  const libro = libroImportado();
  const nombres = libro.nombres();
  assert.deepEqual(nombres.slice(0, 3), [JULIO, AGOSTO, 'Septiembre 2026']);
  const agosto = posicionPestanaMes_(nombres, 2026, 8);
  assert.deepEqual(agosto, { indice: 2, anterior: null, siguiente: 'Septiembre 2026' });
  assert.doesNotThrow(() => posicionPestanaMes_(nombres, 2026, 7), 'julio real no choca con "Julio 2026 (archivo)"');
  assert.equal(anteriorDe_(libro, 'Septiembre 2026'), null);
  assert.equal(formulaSaldoInicialMes_(anteriorDe_(libro, 'Septiembre 2026')), '=0');
});

test('control: con un Agosto 2026 normal el encadenado sí lo tomaría como anterior', () => {
  const libro = libroImportado();
  libro.getSheetByName(AGOSTO).nombre = 'Agosto 2026';
  assert.equal(anteriorDe_(libro, 'Septiembre 2026'), 'Agosto 2026');
});

test('agregarColumnaCasa_ y migrarUnaFila_ no tratan las de archivo como pestañas de mes', () => {
  const libro = libroImportado();
  const antes = foto(libro);
  const casa = agregarColumnaCasa_(libro);
  assert.deepEqual(casa, ['Septiembre 2026: ya tiene CASA, sin cambios']);
  const migracion = migrarUnaFila_(libro);
  assert.ok(migracion.every((l) => !l.includes('(archivo)')), migracion.join('\n'));
  assert.ok(migracion.some((l) => l === 'Septiembre 2026: ya migrada, sin cambios'), migracion.join('\n'));
  assert.ok(!migracion.some((l) => l.startsWith('PARO')));
  [JULIO, AGOSTO].forEach((n) => sinCambios(libro.getSheetByName(n), antes[n]));
});

test('control: con julio como pestaña de mes normal, migrarUnaFila_ paría por "otra pestaña de mes"', () => {
  const migracion = migrarUnaFila_(libroConJulioColado());
  assert.ok(migracion.some((l) => l.startsWith('PARO: hay otra pestaña de mes (Julio 2026')), migracion.join('\n'));
});

// --- la importación tampoco mueve septiembre ---

test('septiembre conserva su A3 y no recibe escrituras al importar', () => {
  const libro = libroImportado();
  const sep = libro.getSheetByName('Septiembre 2026');
  assert.equal(sep.leer(3, 1), '=0');
  assert.deepEqual(sep.mutaciones, []);
});
