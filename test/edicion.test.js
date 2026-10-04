const test = require('node:test');
const assert = require('node:assert/strict');

// En Apps Script estos nombres son globales; en Node se ponen a mano antes de requerir Edicion.js
// (Hoja.js: MESES, COLUMNAS_VISIBLES, COLUMNAS_ESTADO, PRIMERA_FILA_DATOS, leerPestanaMes_;
// Reglas.js: leerFecha_; Escritura.js: MARCA_POR_COLUMNA, revisarSin_, fechaValida_, textoCelda_,
// preguntasAbiertas_, leerDatosEstado_, PREGUNTA_ABIERTA, TIPO_ESTADO_PREGUNTA; PorProcesar.js:
// TIPO_ESTADO_POR_PROCESAR, porProcesarAbiertas_).
global.MESES = require('../src/Hoja.js').MESES;
Object.assign(global, require('../src/Hoja.js'));
Object.assign(global, require('../src/Reglas.js'));
Object.assign(global, require('../src/Escritura.js'));
Object.assign(global, require('../src/Clases.js'));
Object.assign(global, require('../src/Texto.js'));
Object.assign(global, require('../src/Confirmacion.js'));
Object.assign(global, require('../src/Foto.js'));
Object.assign(global, require('../src/Botones.js'));
Object.assign(global, require('../src/PorProcesar.js'));

const {
  esPestanaMes_, filasDatosTocadas_, selloManual_, revisarTrasEdicion_, tienePendiente_,
  preguntasParaCerrar_, ORIGEN_MANUAL, TEXTO_PREGUNTA_CERRADA_HOJA,
  idArchivoDeUrl_, descripcionDeNombreFoto_, fotoAMover_,
} = require('../src/Edicion.js');
const { COLUMNAS, COLUMNAS_ESTADO } = require('../src/Hoja.js');
const { TIPO_ESTADO_PREGUNTA, PREGUNTA_ABIERTA } = require('../src/Escritura.js');
const { TIPO_ESTADO_POR_PROCESAR } = require('../src/PorProcesar.js');

/** Fila del Sheet como objeto {columna: valor}, con vacío donde no se indica. */
const fila = (valores = {}) => Object.fromEntries(COLUMNAS.map((c) => [c, c in valores ? valores[c] : '']));

/** Fila de _ESTADO sin encabezado, como las devuelve getValues. */
const filaEstado = (valores) => COLUMNAS_ESTADO.map((c) => (c in valores ? valores[c] : ''));

test('esPestanaMes_: nombre de mes (con año) es pestaña de mes', () => {
  assert.equal(esPestanaMes_('Septiembre 2026'), true);
  assert.equal(esPestanaMes_('agosto 2025'), true);
});

test('esPestanaMes_: _ESTADO, _HISTORIAL y cualquier otro nombre no son pestaña de mes', () => {
  assert.equal(esPestanaMes_('_ESTADO'), false);
  assert.equal(esPestanaMes_('_HISTORIAL'), false);
  assert.equal(esPestanaMes_('Resumen'), false);
  assert.equal(esPestanaMes_(''), false);
});

test('filasDatosTocadas_: pegar varias filas devuelve las que están desde la fila 6', () => {
  assert.deepEqual(filasDatosTocadas_(6, 3), [6, 7, 8]);
});

test('filasDatosTocadas_: filas 1 a 5 (título, saldo, encabezados) se ignoran', () => {
  assert.deepEqual(filasDatosTocadas_(1, 5), []);
  assert.deepEqual(filasDatosTocadas_(3, 5), [6, 7]);
});

test('selloManual_: fila del bot (ID FILA con ORIGEN distinto de MANUAL) nunca se toca', () => {
  const valores = fila({ 'ID FILA': 'BOT-20260926-161020-501-1', ORIGEN: 'BOT', PROVEEDOR: 'Xtra' });
  const r = selloManual_(valores, { sello: '20260928-093000', ahora: new Date(2026, 8, 28), numeroFila: 6 });
  assert.deepEqual(r, {});
});

test('selloManual_: fila vacía (nada visible) no se sella', () => {
  const valores = fila({});
  const r = selloManual_(valores, { sello: '20260928-093000', ahora: new Date(2026, 8, 28), numeroFila: 6 });
  assert.deepEqual(r, {});
});

test('selloManual_: fila manual nueva con algo visible sella ID FILA, ORIGEN y REGISTRADO', () => {
  const valores = fila({ PROVEEDOR: 'Whole Foods' });
  const ahora = new Date(2026, 8, 28, 9, 30, 0);
  const r = selloManual_(valores, { sello: '20260928-093000', ahora, numeroFila: 8 });
  assert.deepEqual(r, {
    'ID FILA': 'MANUAL-20260928-093000-8', ORIGEN: 'MANUAL', REGISTRADO: ahora,
  });
});

test('selloManual_: fila manual parcialmente sellada solo rellena lo que falta', () => {
  const valores = fila({
    PROVEEDOR: 'Whole Foods', ORIGEN: 'MANUAL',
  });
  const ahora = new Date(2026, 8, 28, 9, 30, 0);
  const r = selloManual_(valores, { sello: '20260928-093000', ahora, numeroFila: 8 });
  assert.deepEqual(r, { 'ID FILA': 'MANUAL-20260928-093000-8', REGISTRADO: ahora });
});

test('selloManual_: fila manual ya sellada del todo no cambia nada', () => {
  const ahoraVieja = new Date(2026, 8, 27);
  const valores = fila({
    PROVEEDOR: 'Whole Foods', 'ID FILA': 'MANUAL-20260927-100000-8', ORIGEN: 'MANUAL', REGISTRADO: ahoraVieja,
  });
  const r = selloManual_(valores, { sello: '20260928-093000', ahora: new Date(2026, 8, 28), numeroFila: 8 });
  assert.deepEqual(r, {});
});

test('selloManual_: nunca escribe una columna visible ni TIPO/GRUPO/ID MENSAJE TG', () => {
  const valores = fila({ PROVEEDOR: 'Whole Foods' });
  const r = selloManual_(valores, { sello: '20260928-093000', ahora: new Date(2026, 8, 28), numeroFila: 8 });
  assert.deepEqual(Object.keys(r).sort(), ['ID FILA', 'ORIGEN', 'REGISTRADO'].sort());
});

test('ORIGEN_MANUAL es la constante "MANUAL"', () => {
  assert.equal(ORIGEN_MANUAL, 'MANUAL');
});

test('revisarTrasEdicion_: FECHA con un Date válido quita la marca FECHA', () => {
  const valores = fila({ FECHA: new Date(2026, 8, 26), REVISAR: 'PENDIENTE: FECHA' });
  assert.equal(revisarTrasEdicion_(valores, ['FECHA']), '');
});

test('revisarTrasEdicion_: FECHA con texto que no es fecha real deja la marca', () => {
  const valores = fila({ FECHA: 'no es fecha', REVISAR: 'PENDIENTE: FECHA' });
  assert.equal(revisarTrasEdicion_(valores, ['FECHA']), null);
});

test('revisarTrasEdicion_: celda vacía deja la marca', () => {
  const valores = fila({ FECHA: '', REVISAR: 'PENDIENTE: FECHA' });
  assert.equal(revisarTrasEdicion_(valores, ['FECHA']), null);
});

test('revisarTrasEdicion_: GASTO (USD) con número 0 (válido) quita la marca TOTAL', () => {
  const valores = fila({ 'GASTO (USD)': 0, REVISAR: 'PENDIENTE: TOTAL' });
  assert.equal(revisarTrasEdicion_(valores, ['GASTO (USD)']), '');
});

test('revisarTrasEdicion_: GASTO (USD) con texto "PENDIENTE" deja la marca', () => {
  const valores = fila({ 'GASTO (USD)': 'PENDIENTE', REVISAR: 'PENDIENTE: TOTAL' });
  assert.equal(revisarTrasEdicion_(valores, ['GASTO (USD)']), null);
});

test('revisarTrasEdicion_: quita solo la marca con explicación entre paréntesis que corresponde', () => {
  const valores = fila({
    'MONTO ORIGINAL': 15.5, REVISAR: 'PENDIENTE: TOTAL (partes suman 15.00), FECHA',
  });
  assert.equal(revisarTrasEdicion_(valores, ['MONTO ORIGINAL']), 'PENDIENTE: FECHA');
});

test('revisarTrasEdicion_: varias columnas editadas a la vez quitan varias marcas', () => {
  const valores = fila({
    FECHA: new Date(2026, 8, 26), 'GASTO (USD)': 20, REVISAR: 'PENDIENTE: FECHA, TOTAL',
  });
  assert.equal(revisarTrasEdicion_(valores, ['FECHA', 'GASTO (USD)']), '');
});

test('revisarTrasEdicion_: columna editada que no está en MARCA_POR_COLUMNA no cambia nada', () => {
  const valores = fila({ PROVEEDOR: 'Xtra', REVISAR: 'PENDIENTE: FECHA' });
  assert.equal(revisarTrasEdicion_(valores, ['PROVEEDOR']), null);
});

test('revisarTrasEdicion_: sin columnas editadas (arreglo vacío) devuelve null', () => {
  const valores = fila({ REVISAR: 'PENDIENTE: FECHA' });
  assert.equal(revisarTrasEdicion_(valores, []), null);
});

test('revisarTrasEdicion_: la marca editada no está en el texto actual, resultado igual devuelve null', () => {
  const valores = fila({ FECHA: new Date(2026, 8, 26), REVISAR: 'PENDIENTE: OTRA' });
  assert.equal(revisarTrasEdicion_(valores, ['FECHA']), null);
});

test('tienePendiente_: alguna columna visible con "PENDIENTE" (sin importar mayúsculas)', () => {
  const valores = fila({ PROVEEDOR: 'pendiente' });
  assert.equal(tienePendiente_(valores), true);
});

test('tienePendiente_: REVISAR con PENDIENTE también cuenta', () => {
  const valores = fila({ REVISAR: 'PENDIENTE: TOTAL' });
  assert.equal(tienePendiente_(valores), true);
});

test('tienePendiente_: ninguna columna visible con PENDIENTE devuelve false', () => {
  const valores = fila({ PROVEEDOR: 'Xtra', 'GASTO (USD)': 20 });
  assert.equal(tienePendiente_(valores), false);
});

test('tienePendiente_: PENDIENTE en una columna oculta (ID FILA) no cuenta', () => {
  const valores = fila({ 'ID FILA': 'PENDIENTE-x' });
  assert.equal(tienePendiente_(valores), false);
});

test('TEXTO_PREGUNTA_CERRADA_HOJA tiene el texto aprobado', () => {
  assert.equal(TEXTO_PREGUNTA_CERRADA_HOJA, 'Vi que lo corregiste en la hoja. Ya cerré esta pregunta.');
});

// --- preguntasParaCerrar_ ---

const filaPreguntaAbierta = ({ clave, idFilas, tipo = 'total' }) => filaEstado({
  CREADO: new Date(2026, 8, 27),
  TIPO: TIPO_ESTADO_PREGUNTA,
  CLAVE: clave,
  'ID FILAS': idFilas.join(','),
  DATOS: JSON.stringify({ preguntas: [tipo], pestana: 'Septiembre 2026', escrito: {} }),
  ESTADO: PREGUNTA_ABIERTA,
});

const filaPorProcesarAbierta = ({ clave, idFilas, idPregunta }) => filaEstado({
  CREADO: new Date(2026, 8, 27),
  TIPO: TIPO_ESTADO_POR_PROCESAR,
  CLAVE: clave,
  'ID FILAS': idFilas.join(','),
  DATOS: JSON.stringify({ fechaMensaje: '2026-09-27', idMensaje: clave, ...(idPregunta ? { idPregunta } : {}) }),
  ESTADO: PREGUNTA_ABIERTA,
});

test('preguntasParaCerrar_: PREGUNTA con todas sus filas sin PENDIENTE se devuelve para cerrar', () => {
  const filasEstado = [filaPreguntaAbierta({ clave: 501, idFilas: ['BOT-1'] })];
  const filasPorId = new Map([['BOT-1', fila({ 'ID FILA': 'BOT-1', PROVEEDOR: 'Xtra', 'GASTO (USD)': 20 })]]);
  const r = preguntasParaCerrar_(filasEstado, filasPorId);
  assert.deepEqual(r, [{ fila: 2, tipo: TIPO_ESTADO_PREGUNTA, idMensajeBot: 501 }]);
});

test('preguntasParaCerrar_: si alguna de sus filas todavía tiene PENDIENTE, no se cierra', () => {
  const filasEstado = [filaPreguntaAbierta({ clave: 501, idFilas: ['BOT-1'] })];
  const filasPorId = new Map([['BOT-1', fila({ 'ID FILA': 'BOT-1', PROVEEDOR: 'PENDIENTE' })]]);
  assert.deepEqual(preguntasParaCerrar_(filasEstado, filasPorId), []);
});

test('preguntasParaCerrar_: id de fila que no está en el mapa no se cierra', () => {
  const filasEstado = [filaPreguntaAbierta({ clave: 501, idFilas: ['BOT-1', 'BOT-2'] })];
  const filasPorId = new Map([['BOT-1', fila({ 'ID FILA': 'BOT-1', PROVEEDOR: 'Xtra' })]]);
  assert.deepEqual(preguntasParaCerrar_(filasEstado, filasPorId), []);
});

test('preguntasParaCerrar_: CLAVE vacía (sin idMensajeBot) devuelve idMensajeBot null', () => {
  const filasEstado = [filaPreguntaAbierta({ clave: '', idFilas: ['BOT-1'] })];
  const filasPorId = new Map([['BOT-1', fila({ 'ID FILA': 'BOT-1', PROVEEDOR: 'Xtra' })]]);
  const r = preguntasParaCerrar_(filasEstado, filasPorId);
  assert.deepEqual(r, [{ fila: 2, tipo: TIPO_ESTADO_PREGUNTA, idMensajeBot: null }]);
});

test('preguntasParaCerrar_: POR-PROCESAR con idFilas resueltas se cierra, idMensajeBot de idPregunta', () => {
  const filasEstado = [filaPorProcesarAbierta({ clave: 777, idFilas: ['BOT-9'], idPregunta: 900 })];
  const filasPorId = new Map([['BOT-9', fila({ 'ID FILA': 'BOT-9', 'GASTO (USD)': 30 })]]);
  const r = preguntasParaCerrar_(filasEstado, filasPorId);
  assert.deepEqual(r, [{ fila: 2, tipo: TIPO_ESTADO_POR_PROCESAR, idMensajeBot: 900 }]);
});

test('preguntasParaCerrar_: POR-PROCESAR con ID FILAS vacío (total sin confirmar) no se cierra', () => {
  const filasEstado = [filaPorProcesarAbierta({ clave: 777, idFilas: [], idPregunta: 900 })];
  const filasPorId = new Map();
  assert.deepEqual(preguntasParaCerrar_(filasEstado, filasPorId), []);
});

test('preguntasParaCerrar_: otros TIPO (CONTEO, REGISTRO, BORRAR, FECHA, FECHA-FOTO) nunca se devuelven', () => {
  const otros = ['CONTEO', 'REGISTRO', 'BORRAR', 'FECHA', 'FECHA-FOTO'];
  const filasEstado = otros.map((tipo) => filaEstado({
    CREADO: new Date(2026, 8, 27), TIPO: tipo, CLAVE: '1', 'ID FILAS': 'BOT-1',
    DATOS: JSON.stringify({}), ESTADO: PREGUNTA_ABIERTA,
  }));
  const filasPorId = new Map([['BOT-1', fila({ 'ID FILA': 'BOT-1', PROVEEDOR: 'Xtra' })]]);
  assert.deepEqual(preguntasParaCerrar_(filasEstado, filasPorId), []);
});

test('preguntasParaCerrar_: ESTADO CERRADA se ignora aunque no tenga PENDIENTE', () => {
  const filasEstado = [filaEstado({
    CREADO: new Date(2026, 8, 27), TIPO: TIPO_ESTADO_PREGUNTA, CLAVE: '501', 'ID FILAS': 'BOT-1',
    DATOS: JSON.stringify({ preguntas: ['total'], pestana: 'Septiembre 2026', escrito: {} }),
    ESTADO: 'CERRADA',
  })];
  const filasPorId = new Map([['BOT-1', fila({ 'ID FILA': 'BOT-1', PROVEEDOR: 'Xtra' })]]);
  assert.deepEqual(preguntasParaCerrar_(filasEstado, filasPorId), []);
});

test('preguntasParaCerrar_: DATOS con JSON inválido se salta sin lanzar', () => {
  const filasEstado = [filaEstado({
    CREADO: new Date(2026, 8, 27), TIPO: TIPO_ESTADO_PREGUNTA, CLAVE: '501', 'ID FILAS': 'BOT-1',
    DATOS: '{no es json', ESTADO: PREGUNTA_ABIERTA,
  })];
  const filasPorId = new Map([['BOT-1', fila({ 'ID FILA': 'BOT-1', PROVEEDOR: 'Xtra' })]]);
  assert.doesNotThrow(() => preguntasParaCerrar_(filasEstado, filasPorId));
  assert.deepEqual(preguntasParaCerrar_(filasEstado, filasPorId), []);
});

// --- idArchivoDeUrl_ / descripcionDeNombreFoto_ / fotoAMover_ ---

test('idArchivoDeUrl_: forma /file/d/<id>/view saca el id', () => {
  assert.equal(
    idArchivoDeUrl_('https://drive.google.com/file/d/1AbC-xyz_9/view?usp=drivesdk'),
    '1AbC-xyz_9',
  );
});

test('idArchivoDeUrl_: forma open?id=<id> saca el id', () => {
  assert.equal(idArchivoDeUrl_('https://drive.google.com/open?id=1AbC-xyz_9'), '1AbC-xyz_9');
});

test('idArchivoDeUrl_: forma uc?id=<id> saca el id', () => {
  assert.equal(idArchivoDeUrl_('https://drive.google.com/uc?id=1AbC-xyz_9'), '1AbC-xyz_9');
});

test('idArchivoDeUrl_: uc?id=<id> con parámetros después también sirve', () => {
  assert.equal(idArchivoDeUrl_('https://drive.google.com/uc?export=view&id=1AbC-xyz_9'), '1AbC-xyz_9');
});

test('idArchivoDeUrl_: url que no es de Drive, texto suelto, vacío o ausente → null', () => {
  assert.equal(idArchivoDeUrl_('https://example.com/file/d/123/view'), null);
  assert.equal(idArchivoDeUrl_('no es una url'), null);
  assert.equal(idArchivoDeUrl_(''), null);
  assert.equal(idArchivoDeUrl_(undefined), null);
  assert.equal(idArchivoDeUrl_(null), null);
});

test('descripcionDeNombreFoto_: nombre "AAAA.MM.DD - descripción.ext" saca la descripción', () => {
  assert.equal(descripcionDeNombreFoto_('2026.07.03 - Seven 11 compra.jpg'), 'Seven 11 compra');
});

test('descripcionDeNombreFoto_: con contador " (2)" de nombreLibre_ lo quita también', () => {
  assert.equal(descripcionDeNombreFoto_('2026.07.03 - taxi (2).jpg'), 'taxi');
  assert.equal(descripcionDeNombreFoto_('2026.07.03 - taxi (12).pdf'), 'taxi');
});

test('descripcionDeNombreFoto_: sin extensión (mime desconocido) también funciona', () => {
  assert.equal(descripcionDeNombreFoto_('2026.07.03 - factura'), 'factura');
});

test('descripcionDeNombreFoto_: nombre que no trae el prefijo de fecha (aún en Por clasificar) → null', () => {
  assert.equal(descripcionDeNombreFoto_('tg-123.jpg'), null);
  assert.equal(descripcionDeNombreFoto_(''), null);
  assert.equal(descripcionDeNombreFoto_(undefined), null);
});

test('descripcionDeNombreFoto_: descripción vacía tras quitar la extensión → null', () => {
  assert.equal(descripcionDeNombreFoto_('2026.07.03 - .jpg'), null);
});

test('fotoAMover_: FECHA editada a una fecha válida con FOTO con enlace → { idArchivo, fecha }', () => {
  const valores = fila({ FECHA: '2026-07-03', FOTO: 'https://drive.google.com/file/d/ID123/view?usp=drivesdk' });
  assert.deepEqual(fotoAMover_(valores, ['FECHA']), { idArchivo: 'ID123', fecha: '2026-07-03' });
});

test('fotoAMover_: FECHA llega como objeto Date (edición del usuario en la hoja) también sirve', () => {
  const valores = fila({
    FECHA: new Date(2026, 6, 3), FOTO: 'https://drive.google.com/file/d/ID123/view?usp=drivesdk',
  });
  assert.deepEqual(fotoAMover_(valores, ['FECHA']), { idArchivo: 'ID123', fecha: '2026-07-03' });
});

test('fotoAMover_: FECHA no está entre las columnas editadas → null (no se toca Drive)', () => {
  const valores = fila({ FECHA: '2026-07-03', FOTO: 'https://drive.google.com/file/d/ID123/view' });
  assert.equal(fotoAMover_(valores, ['PROVEEDOR']), null);
  assert.equal(fotoAMover_(valores, []), null);
});

test('fotoAMover_: sin columnasEditadas (undefined) → null, no revienta', () => {
  const valores = fila({ FECHA: '2026-07-03', FOTO: 'https://drive.google.com/file/d/ID123/view' });
  assert.equal(fotoAMover_(valores, undefined), null);
});

test('fotoAMover_: FECHA inválida → null', () => {
  const valores = fila({ FECHA: '2026-02-30', FOTO: 'https://drive.google.com/file/d/ID123/view' });
  assert.equal(fotoAMover_(valores, ['FECHA']), null);
});

test('fotoAMover_: FECHA vacía → null', () => {
  const valores = fila({ FECHA: '', FOTO: 'https://drive.google.com/file/d/ID123/view' });
  assert.equal(fotoAMover_(valores, ['FECHA']), null);
});

test('fotoAMover_: sin FOTO (celda vacía) → null', () => {
  const valores = fila({ FECHA: '2026-07-03', FOTO: '' });
  assert.equal(fotoAMover_(valores, ['FECHA']), null);
});

test('fotoAMover_: FOTO con un enlace que no es de Drive → null', () => {
  const valores = fila({ FECHA: '2026-07-03', FOTO: 'https://example.com/foto.jpg' });
  assert.equal(fotoAMover_(valores, ['FECHA']), null);
});
