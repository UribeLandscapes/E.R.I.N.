const test = require('node:test');
const assert = require('node:assert/strict');

// En Apps Script estos nombres son globales; en Node se ponen a mano.
global.MESES = require('../src/Hoja.js').MESES;
Object.assign(global, require('../src/Hoja.js'));
Object.assign(global, require('../src/Reglas.js'));
Object.assign(global, require('../src/Escritura.js'));
Object.assign(global, require('../src/Clases.js'));
Object.assign(global, require('../src/Texto.js'));
Object.assign(global, require('../src/Edicion.js'));
Object.assign(global, require('../src/Ediciones.js'));
Object.assign(global, require('../src/EdicionesApp.js'));
// Moneda.js: convertirAUsd_ pasa a USD el total que el usuario contesta en otra moneda (P2).
Object.assign(global, require('../src/Moneda.js'));
global.CONFIG = require('./configPrueba.js').CONFIG;
global.PESTANA_ESTADO = '_ESTADO';

const {
  hojaMes_, escribirFilas_, buscarFilas_, guardarPregunta_, aplicarRespuesta_, escritosAplicados_,
} = require('../src/EscrituraApp.js');
const { COLUMNAS, COLUMNAS_ESTADO, numeroColumna_, PRIMERA_FILA_DATOS } = require('../src/Hoja.js');
const { preguntaEstado_, preguntasAbiertas_ } = require('../src/Escritura.js');
const { registroEdiciones_, TEXTO_NO_CORRIJO_MANUAL } = require('../src/Ediciones.js');
const { registroParaEscribir_ } = require('../src/EdicionesApp.js');

const { hojaFalsa, libroFalso, filaDe, ponerFila } = require('./falsos.js');

const AHORA = new Date(2026, 8, 26, 16, 10, 20);
const SELLO = '20260926-161020';

const gasto = (extra = {}) => ({
  FECHA: '2026-09-26', 'ID FACTURA': 'PENDIENTE-20260926', TIPO: 'GASTO', PROVEEDOR: 'PENDIENTE',
  'ARTÍCULOS': 15, 'GASTO (USD)': 15, MONEDA: 'USD', 'MONTO ORIGINAL': '', 'TASA USADA': '',
  'FORMA DE PAGO': 'EFECTIVO', 'CLASE DE GASTO': 'PENDIENTE',
  REVISAR: 'PENDIENTE: FECHA, TOTAL (partes suman 15.00)', ORIGEN: 'BOT', 'ID MENSAJE TG': 501, ...extra,
});

test('hojaMes_: usa la pestaña del mes aunque cambien mayúsculas o tildes', () => {
  const sep = hojaFalsa('septiembre 2026');
  const ss = libroFalso([sep]);
  assert.equal(hojaMes_(ss, '2026-09-05'), sep);
  assert.equal(ss.hojas.length, 1);
});

test('hojaMes_: crea la pestaña si no existe', () => {
  const ss = libroFalso([hojaFalsa('Septiembre 2026')]);
  const ago = hojaMes_(ss, '2026-08-30');
  assert.equal(ago.getName(), 'Agosto 2026');
  assert.equal(ss.hojas.length, 2);
});

test('escribirFilas_: primera fila libre, ID FILA y REGISTRADO, sin tocar GRUPO', () => {
  const sep = hojaFalsa('Septiembre 2026');
  ponerFila(sep, 6, { FECHA: '2026-09-01', 'ID FILA': 'M-1' });
  ponerFila(sep, 7, { GRUPO: 1 });
  const ss = libroFalso([sep]);
  const escritas = escribirFilas_(ss, [gasto(), gasto({ 'GASTO (USD)': 15 })], SELLO, AHORA);
  assert.deepEqual(escritas.map((e) => [e.pestana, e.numero]), [['Septiembre 2026', 7], ['Septiembre 2026', 8]]);
  const f7 = filaDe(sep, 7);
  assert.equal(f7['ID FILA'], 'BOT-20260926-161020-501-1');
  assert.equal(filaDe(sep, 8)['ID FILA'], 'BOT-20260926-161020-501-2');
  assert.equal(f7.REGISTRADO, AHORA);
  assert.equal(f7.PROVEEDOR, 'PENDIENTE');
  assert.equal(f7.GRUPO, 1);
  assert.equal(escritas[0].fila['ID FILA'], 'BOT-20260926-161020-501-1');
  // Un solo tramo (A–X), con todas las filas del bloque juntas.
  assert.deepEqual(sep.escrituras, [['setValues', 7, 1, 2, 24]]);
});

test('escribirFilas_: agrega filas al final si no caben', () => {
  const sep = hojaFalsa('Septiembre 2026', { filas: 7 });
  ponerFila(sep, 6, { FECHA: 'x' });
  const ss = libroFalso([sep]);
  const escritas = escribirFilas_(ss, [gasto(), gasto(), gasto()], SELLO, AHORA);
  assert.equal(sep.maxFilas, 9);
  assert.deepEqual(escritas.map((e) => e.numero), [7, 8, 9]);
});

test('escribirFilas_: una hoja sin filas de datos también sirve', () => {
  const sep = hojaFalsa('Septiembre 2026', { filas: 5 });
  const escritas = escribirFilas_(libroFalso([sep]), [gasto()], SELLO, AHORA);
  assert.equal(escritas[0].numero, PRIMERA_FILA_DATOS);
  assert.equal(sep.maxFilas, 6);
});

test('escribirFilas_: una fila que se mueve conserva su ID FILA y su REGISTRADO', () => {
  const sep = hojaFalsa('Septiembre 2026');
  const antes = new Date(2026, 8, 1);
  escribirFilas_(libroFalso([sep]), [gasto({ 'ID FILA': 'BOT-VIEJO', REGISTRADO: antes })], SELLO, AHORA);
  assert.equal(filaDe(sep, 6)['ID FILA'], 'BOT-VIEJO');
  assert.equal(filaDe(sep, 6).REGISTRADO, antes);
});

test('escribirFilas_: cada fila va a la pestaña del mes de su FECHA', () => {
  const sep = hojaFalsa('Septiembre 2026');
  const ss = libroFalso([sep]);
  const escritas = escribirFilas_(ss, [gasto(), gasto({ FECHA: '2026-08-30' })], SELLO, AHORA);
  assert.deepEqual(escritas.map((e) => e.pestana), ['Septiembre 2026', 'Agosto 2026']);
  assert.equal(filaDe(ss.getSheetByName('Agosto 2026'), 6)['ID FILA'], 'BOT-20260926-161020-501-2');
});

test('buscarFilas_: encuentra por ID FILA, primero en la pestaña sugerida y luego en las demás', () => {
  const sep = hojaFalsa('Septiembre 2026');
  const ago = hojaFalsa('Agosto 2026');
  ponerFila(sep, 9, { 'ID FILA': 'BOT-1', PROVEEDOR: 'A' });
  ponerFila(ago, 6, { 'ID FILA': 'BOT-2', PROVEEDOR: 'B' });
  const otra = hojaFalsa('_ESTADO');
  const ss = libroFalso([otra, ago, sep]);
  const r = buscarFilas_(ss, ['BOT-1', 'BOT-2', 'BOT-X'], 'Septiembre 2026');
  assert.deepEqual(r.map((x) => [x.idFila, x.hoja.getName(), x.numero, x.valores.PROVEEDOR]), [
    ['BOT-1', 'Septiembre 2026', 9, 'A'], ['BOT-2', 'Agosto 2026', 6, 'B'],
  ]);
});

test('buscarFilas_: sin pestaña sugerida (o ya borrada) busca en todos los meses', () => {
  const sep = hojaFalsa('Septiembre 2026');
  ponerFila(sep, 7, { 'ID FILA': 'BOT-1' });
  assert.equal(buscarFilas_(libroFalso([sep]), ['BOT-1'], 'Julio 2026')[0].numero, 7);
  assert.deepEqual(buscarFilas_(libroFalso([sep]), [], ''), []);
});

test('escritosAplicados_ anota la escritura local y ambos lados de un cambio de mes', () => {
  const sep = hojaFalsa('Septiembre 2026');
  const filas = [{ idFila: 'BOT-1', hoja: sep }];
  const plan = { porFila: { 'BOT-1': { PROVEEDOR: 'Riba Smith' } } };
  assert.deepEqual(escritosAplicados_(filas, plan, ''), [
    { pestana: 'Septiembre 2026', idFila: 'BOT-1', columnas: ['PROVEEDOR'] },
  ]);
  plan.porFila['BOT-1'] = { FECHA: '2026-08-30' };
  const escritos = escritosAplicados_(filas, plan, 'Agosto 2026');
  assert.deepEqual(escritos.map((e) => [e.pestana, e.idFila]), [['Septiembre 2026', 'BOT-1'], ['Agosto 2026', 'BOT-1']]);
  assert.ok(!escritos[0].columnas.includes('GRUPO'));
});

test('guardarPregunta_ agrega la fila al final de _ESTADO y a ninguna otra', () => {
  const estado = hojaFalsa('_ESTADO', { protegerDesborde: false });
  guardarPregunta_(estado, ['a', 'PREGUNTA']);
  assert.deepEqual(estado.anexadas, [['a', 'PREGUNTA']]);
  assert.throws(() => guardarPregunta_(hojaFalsa('Septiembre 2026'), ['x']), /_ESTADO/);
});

test('guardarPregunta_: escapa =fórmula en columnas no-DATOS, deja DATOS sin tocar, números sin cambiar', () => {
  const estado = hojaFalsa('_ESTADO', { protegerDesborde: false });
  estado.appendRow([...COLUMNAS_ESTADO]);
  const fila = [
    new Date(2026, 8, 26),
    '=IMPORTDATA("https://ejemplo")',
    '=FORMULA',
    42,
    '{"escrito":{"PROVEEDOR":"=fórmula"}}',
    '+estado',
  ];
  guardarPregunta_(estado, fila);
  // Fila escrita: CREADO (Date), TIPO (=formula -> '=formula), CLAVE (=FORMULA -> '=FORMULA), ID FILAS, DATOS (sin tocar), ESTADO (+estado -> '+estado)
  const escrita = estado.leer(2, COLUMNAS_ESTADO.indexOf('TIPO') + 1);
  assert.equal(escrita, "'=IMPORTDATA(\"https://ejemplo\")");
  const datos = estado.leer(2, COLUMNAS_ESTADO.indexOf('DATOS') + 1);
  assert.equal(datos, '{"escrito":{"PROVEEDOR":"=fórmula"}}');
  assert.equal(estado.leer(2, COLUMNAS_ESTADO.indexOf('ID FILAS') + 1), 42);
  assert.deepEqual(estado.leer(2, COLUMNAS_ESTADO.indexOf('CREADO') + 1), new Date(2026, 8, 26));
  const estado_col = estado.leer(2, COLUMNAS_ESTADO.indexOf('ESTADO') + 1);
  assert.equal(estado_col, "'+estado");
});

/** Libro con un gasto escrito por el bot y su pregunta abierta en _ESTADO (fila 2). */
function escenario(preguntas, { filaGasto = gasto(), cantidad = 1 } = {}) {
  const sep = hojaFalsa('Septiembre 2026');
  const estado = hojaFalsa('_ESTADO', { protegerDesborde: false });
  estado.appendRow([...COLUMNAS_ESTADO]);
  const ss = libroFalso([sep, estado]);
  const escritas = escribirFilas_(ss, Array.from({ length: cantidad }, () => ({ ...filaGasto })), SELLO, AHORA);
  guardarPregunta_(estado, preguntaEstado_({
    creado: AHORA, clave: 900, preguntas, filas: escritas.map((e) => e.fila), pestana: 'Septiembre 2026',
  }));
  sep.escrituras.length = 0;
  const leerPregunta = () => preguntasAbiertas_(
    Array.from({ length: estado.getLastRow() - 1 }, (_, i) => COLUMNAS_ESTADO.map((__, j) => estado.leer(i + 2, j + 1))),
  );
  const estadoDe = () => estado.leer(2, COLUMNAS_ESTADO.indexOf('ESTADO') + 1);
  return { ss, sep, estado, pregunta: leerPregunta()[0], leerPregunta, estadoDe };
}

const registroSano = () => registroEdiciones_({ filas: [], corte: '20260926-000000', disponible: true });
const opciones = { sello: '20260927-090000', ahora: new Date(2026, 8, 27, 9), registro: registroSano() };

test('respuesta avisa la anotación llegada durante setValue y conserva su respuesta', () => {
  const { ss, sep, estado, pregunta } = escenario(['proveedor']);
  const id = filaDe(sep, 6)['ID FILA'];
  const ediciones = hojaFalsa('_EDICIONES', { protegerDesborde: false });
  ediciones.appendRow(['FECHA', 'PESTAÑA', 'ID FILA', 'COLUMNAS']);
  ss.hojas.push(ediciones);
  const props = { getProperty: (n) => n === PROPIEDAD_EDICIONES_CREADA ? '20260926-000000' : null };
  const desde = new Date(AHORA.getTime());
  const registro = registroParaEscribir_(ss, { propiedades: props, sello: () => '20260926-000000' });
  const rango = sep.getRange;
  let anoto = false;
  sep.getRange = (...args) => {
    const celda = rango.apply(sep, args);
    return { ...celda, setValue: (valor) => {
      celda.setValue(valor);
      if (!anoto) { anoto = true; ediciones.appendRow([new Date(desde.getTime() + 1000), 'Septiembre 2026', id, 'PROVEEDOR']); }
    } };
  };
  const real = console.error; const avisos = []; console.error = (x) => avisos.push(x);
  let respuesta;
  try { respuesta = aplicarRespuesta_(ss, estado, pregunta, { proveedor: 'Riba Smith' }, { ...opciones, registro, desde, propiedades: props }); } finally { console.error = real; }
  assert.equal(respuesta.texto, 'Listo, lo anoté.');
  assert.ok(avisos.includes(`posible choque con edición a mano: Septiembre 2026 ${id} PROVEEDOR`));
});

test('fallo al releer ediciones después de responder no altera la respuesta ni propiedades', () => {
  const { ss, sep, estado, pregunta } = escenario(['proveedor']);
  const ediciones = hojaFalsa('_EDICIONES', { protegerDesborde: false });
  ediciones.appendRow(['FECHA', 'PESTAÑA', 'ID FILA', 'COLUMNAS']); ss.hojas.push(ediciones);
  const props = { llamadas: [], getProperty: (n) => n === PROPIEDAD_EDICIONES_CREADA ? '20260926-000000' : null };
  const registro = registroParaEscribir_(ss, { propiedades: props, sello: () => '20260926-000000' });
  ediciones.getRange = () => { throw new Error('rota'); };
  const real = console.error; const avisos = []; console.error = (x) => avisos.push(x);
  let respuesta;
  try { respuesta = aplicarRespuesta_(ss, estado, pregunta, { proveedor: 'Riba Smith' }, { ...opciones, registro, desde: AHORA, propiedades: props }); } finally { console.error = real; }
  assert.equal(respuesta.texto, 'Listo, lo anoté.'); assert.equal(filaDe(sep, 6).PROVEEDOR, 'Riba Smith');
  assert.deepEqual(props.llamadas, []); assert.ok(avisos.some((x) => /no se pudieron leer encabezados/.test(x)));
});

test('aplicarRespuesta_: escribe solo las celdas que cambian y cierra la pregunta', () => {
  const { ss, sep, estado, pregunta, estadoDe } = escenario(['proveedor', 'total'], { cantidad: 2 });
  const r = aplicarRespuesta_(ss, estado, pregunta, { proveedor: 'Riba Smith', total: 32 }, opciones);
  assert.equal(r.texto, 'Listo, lo anoté.');
  assert.equal(r.cerrada, true);
  assert.equal(estadoDe(), 'CERRADA');
  for (const n of [6, 7]) {
    const f = filaDe(sep, n);
    assert.equal(f.PROVEEDOR, 'Riba Smith');
    assert.equal(f['GASTO (USD)'], 32);
    assert.equal(f['ID FACTURA'], 'RIBASMITH-20260926');
    assert.equal(f.REVISAR, 'PENDIENTE: FECHA');
  }
  assert.ok(sep.escrituras.every(([m]) => m === 'setValue'));
});

test('aplicarRespuesta_ (aplicarPlan_): escapa fórmulas en las columnas de texto libre que escribe la respuesta (PROVEEDOR, CLASE DE GASTO)', () => {
  const { ss, sep, estado, pregunta } = escenario(['proveedor', 'clase']);
  // Respuesta con valores que empiezan como fórmula
  const r = aplicarRespuesta_(ss, estado, pregunta, { proveedor: '=IMPORTDATA("x")', clase: '=FORMULA' }, opciones);
  assert.equal(r.cerrada, true);
  // PROVEEDOR y CLASE DE GASTO son guarded, así que deben escaparse
  const f = filaDe(sep, 6);
  assert.equal(f.PROVEEDOR, "'=IMPORTDATA(\"x\")");
  assert.equal(f['CLASE DE GASTO'], "'=FORMULA");
});

test('aplicarRespuesta_: el proveedor de la respuesta usa la ortografía del historial (Supuesto AB, punto F)', () => {
  const { ss, sep, estado, pregunta } = escenario(['proveedor']);
  // "SUPER 99" (mayúsculas) es la del historial; sin ella, "super 99" quedaría "Super 99"
  // (mayúscula inicial por palabra) — así se comprueba que opciones.historial sí se usó.
  const historial = [{ proveedor: 'SUPER 99', clase: 'GROCERIES' }, { proveedor: 'SUPER 99', clase: 'GROCERIES' }];
  const r = aplicarRespuesta_(ss, estado, pregunta, { proveedor: 'super 99' }, { ...opciones, historial });
  assert.equal(r.texto, 'Listo, lo anoté.');
  assert.equal(filaDe(sep, 6).PROVEEDOR, 'SUPER 99');
});

test('aplicarRespuesta_: "super" a la pregunta de clase escribe la etiqueta real, aunque Gemini diga PENDIENTE (defecto E2)', () => {
  const { ss, sep, estado, pregunta } = escenario(['clase']);
  const r = aplicarRespuesta_(ss, estado, pregunta, { clase: 'PENDIENTE' },
    { ...opciones, texto: 'super', categorias: [] });
  assert.equal(r.texto, 'Listo, lo anoté.');
  assert.equal(r.cerrada, true);
  assert.equal(filaDe(sep, 6)['CLASE DE GASTO'], 'GROCERIES W4 NORTE');
});

test('aplicarRespuesta_: si el usuario ya corrigió la celda, gana la hoja y se le avisa', () => {
  const { ss, sep, estado, pregunta } = escenario(['total']);
  ponerFila(sep, 6, { 'GASTO (USD)': 25 });
  const r = aplicarRespuesta_(ss, estado, pregunta, { total: 32 }, opciones);
  assert.equal(r.texto, 'Listo, lo anoté.\nYa lo corregiste en la hoja (quedó 25.00). Lo dejé así.');
  assert.equal(filaDe(sep, 6)['GASTO (USD)'], 25);
  assert.deepEqual(sep.escrituras, []);
});

test('salta la columna anotada y escribe las demás de la respuesta', () => {
  const { ss, sep, estado, pregunta } = escenario(['proveedor', 'total']);
  const id = filaDe(sep, 6)['ID FILA'];
  const registro = registroEdiciones_({
    filas: [[AHORA, 'Septiembre 2026', id, 'PROVEEDOR']], corte: '20260926-000000', disponible: true,
  });
  const r = aplicarRespuesta_(ss, estado, pregunta, { proveedor: 'Riba Smith', total: 32 }, { ...opciones, registro });
  assert.equal(r.texto, 'Listo, lo anoté. Anoté lo demás, pero no cambié PROVEEDOR: la editaron a mano en la hoja.');
  assert.equal(filaDe(sep, 6).PROVEEDOR, 'PENDIENTE');
  assert.equal(filaDe(sep, 6)['GASTO (USD)'], 32);
  assert.equal(filaDe(sep, 6)['ID FACTURA'], 'PENDIENTE-20260926');
});

test('si todo quedó anotado no dice "Anoté" y cierra la pregunta', () => {
  const { ss, sep, estado, pregunta, estadoDe } = escenario(['proveedor']);
  const id = filaDe(sep, 6)['ID FILA'];
  const registro = registroEdiciones_({
    filas: [[AHORA, 'Septiembre 2026', id, 'PROVEEDOR']], corte: '20260926-000000', disponible: true,
  });
  const r = aplicarRespuesta_(ss, estado, pregunta, { proveedor: 'Riba Smith' }, { ...opciones, registro });
  assert.equal(r.texto, 'No cambié PROVEEDOR: la editaron a mano en la hoja.');
  assert.equal(r.cerrada, true);
  assert.equal(estadoDe(), 'CERRADA');
  assert.deepEqual(sep.escrituras, []);
});

test('una anotación avisa aunque la hoja ya difiera de lo que el bot escribió', () => {
  const { ss, sep, estado, pregunta } = escenario(['proveedor']);
  const id = filaDe(sep, 6)['ID FILA'];
  ponerFila(sep, 6, { PROVEEDOR: 'Manual' });
  sep.escrituras.length = 0;
  const registro = registroEdiciones_({
    filas: [[AHORA, 'Septiembre 2026', id, 'PROVEEDOR']], corte: '20260926-000000', disponible: true,
  });
  const r = aplicarRespuesta_(ss, estado, pregunta, { proveedor: 'Riba Smith' }, { ...opciones, registro });
  assert.equal(r.texto, 'No cambié PROVEEDOR: la editaron a mano en la hoja.');
  assert.equal(filaDe(sep, 6).PROVEEDOR, 'Manual');
});

test('proveedor protegido no altera ID FACTURA ni REVISAR al escribir clase', () => {
  const { ss, sep, estado, pregunta } = escenario(['proveedor', 'clase']);
  const id = filaDe(sep, 6)['ID FILA'];
  ponerFila(sep, 6, { REVISAR: 'PENDIENTE: PROVEEDOR, CLASE' });
  const conRevisar = {
    ...pregunta,
    escrito: { ...pregunta.escrito, [id]: { ...pregunta.escrito[id], REVISAR: 'PENDIENTE: PROVEEDOR, CLASE' } },
  };
  const registro = registroEdiciones_({
    filas: [[AHORA, 'Septiembre 2026', id, 'PROVEEDOR']], corte: '20260926-000000', disponible: true,
  });
  aplicarRespuesta_(ss, estado, conRevisar, { proveedor: 'Riba Smith', clase: 'GROCERIES' }, { ...opciones, registro });
  assert.equal(filaDe(sep, 6)['CLASE DE GASTO'], 'GROCERIES');
  assert.equal(filaDe(sep, 6)['ID FACTURA'], 'PENDIENTE-20260926');
  assert.equal(filaDe(sep, 6).REVISAR, 'PENDIENTE: PROVEEDOR, CLASE');
});

test('fecha permitida no calcula ID FACTURA con proveedor protegido', () => {
  const { ss, sep, estado, pregunta } = escenario(['fecha', 'proveedor']);
  const id = filaDe(sep, 6)['ID FILA'];
  const registro = registroEdiciones_({
    filas: [[AHORA, 'Septiembre 2026', id, 'PROVEEDOR']], corte: '20260926-000000', disponible: true,
  });
  aplicarRespuesta_(ss, estado, pregunta, { fecha: '2026-09-27', proveedor: 'Riba Smith' }, { ...opciones, registro });
  assert.equal(filaDe(sep, 6).FECHA, '2026-09-27');
  assert.equal(filaDe(sep, 6).PROVEEDOR, 'PENDIENTE');
  assert.equal(filaDe(sep, 6)['ID FACTURA'], 'PENDIENTE-20260927');
});

test('REVISAR anotado no pierde su marca al contestar total', () => {
  const { ss, sep, estado, pregunta } = escenario(['total']);
  const id = filaDe(sep, 6)['ID FILA'];
  const registro = registroEdiciones_({
    filas: [[AHORA, 'Septiembre 2026', id, 'REVISAR']], corte: '20260926-000000', disponible: true,
  });
  aplicarRespuesta_(ss, estado, pregunta, { total: 32 }, { ...opciones, registro });
  assert.equal(filaDe(sep, 6)['GASTO (USD)'], 32);
  assert.equal(filaDe(sep, 6).REVISAR, 'PENDIENTE: FECHA, TOTAL (partes suman 15.00)');
});

test('ID FACTURA anotado no cambia al contestar proveedor', () => {
  const { ss, sep, estado, pregunta } = escenario(['proveedor']);
  const id = filaDe(sep, 6)['ID FILA'];
  const registro = registroEdiciones_({
    filas: [[AHORA, 'Septiembre 2026', id, 'ID FACTURA']], corte: '20260926-000000', disponible: true,
  });
  aplicarRespuesta_(ss, estado, pregunta, { proveedor: 'Riba Smith' }, { ...opciones, registro });
  assert.equal(filaDe(sep, 6).PROVEEDOR, 'Riba Smith');
  assert.equal(filaDe(sep, 6)['ID FACTURA'], 'PENDIENTE-20260926');
});

test('una columna saltada cuenta contestada y no entra como escrita al reabrir', () => {
  const { ss, sep, estado, pregunta, leerPregunta } = escenario(['proveedor', 'total']);
  const id = filaDe(sep, 6)['ID FILA'];
  const registro = registroEdiciones_({
    filas: [[AHORA, 'Septiembre 2026', id, 'PROVEEDOR']], corte: '20260926-000000', disponible: true,
  });
  const r = aplicarRespuesta_(ss, estado, pregunta, { proveedor: 'Riba Smith', total: null }, { ...opciones, registro });
  assert.equal(r.cerrada, false);
  assert.deepEqual(leerPregunta()[0].preguntas, ['total']);
  assert.equal(leerPregunta()[0].escrito[id].PROVEEDOR, 'PENDIENTE');
});

test('mover de mes con una celda anotada no mueve ni escribe y cierra', () => {
  const { ss, sep, estado, pregunta, estadoDe } = escenario(['fecha']);
  const id = filaDe(sep, 6)['ID FILA'];
  const registro = registroEdiciones_({
    filas: [[AHORA, 'Septiembre 2026', id, 'PROVEEDOR']], corte: '20260926-000000', disponible: true,
  });
  const r = aplicarRespuesta_(ss, estado, pregunta, { fecha: '2026-08-30' }, { ...opciones, registro });
  assert.equal(r.texto, TEXTO_NO_CORRIJO_MANUAL);
  assert.equal(r.cerrada, true);
  assert.equal(estadoDe(), 'CERRADA');
  assert.equal(filaDe(sep, 6).FECHA, '2026-09-26');
  assert.deepEqual(sep.escrituras, []);
});

test('fecha ya fuera de su pestaña también bloquea el movimiento protegido', () => {
  const { ss, sep, estado, pregunta, estadoDe } = escenario(['fecha']);
  const id = filaDe(sep, 6)['ID FILA'];
  ponerFila(sep, 6, { FECHA: '2026-08-30' });
  pregunta.escrito[id].FECHA = '2026-08-30';
  sep.escrituras.length = 0;
  const registro = registroEdiciones_({
    filas: [[AHORA, 'Septiembre 2026', id, 'PROVEEDOR']], corte: '20260926-000000', disponible: true,
  });
  const r = aplicarRespuesta_(ss, estado, pregunta, { fecha: '2026-08-30' }, { ...opciones, registro });
  assert.equal(r.texto, TEXTO_NO_CORRIJO_MANUAL);
  assert.equal(estadoDe(), 'CERRADA');
  assert.deepEqual(sep.escrituras, []);
});

test('varias filas ya corregidas a mano no repiten el mismo aviso', () => {
  const { ss, sep, estado, pregunta } = escenario(['proveedor'], { cantidad: 2 });
  ponerFila(sep, 6, { PROVEEDOR: 'Manual' });
  ponerFila(sep, 7, { PROVEEDOR: 'Manual' });
  const r = aplicarRespuesta_(ss, estado, pregunta, { proveedor: 'Riba Smith' }, opciones);
  assert.equal((r.texto.match(/Ya lo corregiste/g) || []).length, 1);
});

test('aplicarRespuesta_: fecha de otro mes mueve la fila (limpia la vieja sin tocar GRUPO)', () => {
  const { ss, sep, estado, pregunta, estadoDe } = escenario(['fecha'], { cantidad: 2 });
  const ago = hojaFalsa('Agosto 2026');
  ponerFila(ago, 6, { FECHA: '2026-08-30', 'ID FACTURA': 'PENDIENTE-20260830', 'ID FILA': 'M-1' });
  ss.hojas.push(ago);
  const r = aplicarRespuesta_(ss, estado, pregunta, { fecha: '2026-08-30' }, opciones);
  assert.equal(r.texto, 'Listo, lo anoté. La pasé a Agosto 2026.');
  assert.equal(estadoDe(), 'CERRADA');
  for (const n of [7, 8]) {
    const f = filaDe(ago, n);
    assert.equal(f.FECHA, '2026-08-30');
    assert.equal(f['ID FACTURA'], 'PENDIENTE-20260830-2');
    assert.equal(f.REVISAR, 'PENDIENTE: TOTAL (partes suman 15.00)');
    assert.equal(f.REGISTRADO, AHORA);
    assert.match(f['ID FILA'], /^BOT-20260926-161020-501-/);
  }
  assert.equal(filaDe(sep, 6).FECHA, '');
  assert.equal(filaDe(sep, 6)['ID FILA'], '');
  assert.ok(sep.escrituras.every(([m]) => m === 'clearContent'));
});

test('aplicarRespuesta_: respuesta parcial deja la pregunta abierta con lo que falta', () => {
  const { ss, sep, estado, pregunta, leerPregunta, estadoDe } = escenario(['proveedor', 'total']);
  const r = aplicarRespuesta_(ss, estado, pregunta, { proveedor: 'Riba Smith', total: null }, opciones);
  assert.equal(r.cerrada, false);
  assert.equal(r.texto, 'Listo, lo anoté. ¿Me dices el total de la factura?');
  assert.equal(estadoDe(), 'ABIERTA');
  assert.deepEqual(leerPregunta()[0].preguntas, ['total']);
  assert.equal(filaDe(sep, 6).PROVEEDOR, 'Riba Smith');
});

test('aplicarRespuesta_: si no vino nada útil, vuelve a preguntar sin cambiar nada', () => {
  const { ss, sep, estado, pregunta, estadoDe } = escenario(['fecha']);
  const r = aplicarRespuesta_(ss, estado, pregunta, { fecha: '30/08' }, opciones);
  assert.equal(r.texto, 'No me quedó claro. ¿Me dices la fecha?');
  assert.equal(r.cerrada, false);
  assert.equal(estadoDe(), 'ABIERTA');
  assert.deepEqual(sep.escrituras, []);
});

test('aplicarRespuesta_: si la fila ya no está en la hoja, cierra sin cambiar nada', () => {
  const { ss, sep, estado, pregunta, estadoDe } = escenario(['proveedor']);
  sep.getRange(6, 1, 1, 13).clearContent();
  sep.getRange(6, 15, 1, 7).clearContent();
  sep.escrituras.length = 0;
  const r = aplicarRespuesta_(ss, estado, pregunta, { proveedor: 'X' }, opciones);
  assert.equal(r.texto, 'Esa fila ya no está en la hoja. No cambié nada.');
  assert.equal(estadoDe(), 'CERRADA');
  assert.deepEqual(sep.escrituras, []);
});

test('aplicarRespuesta_: una fila que ya no es del bot cuenta como que no está', () => {
  const { ss, sep, estado, pregunta } = escenario(['proveedor']);
  ponerFila(sep, 6, { ORIGEN: 'MANUAL' });
  sep.escrituras.length = 0;
  const r = aplicarRespuesta_(ss, estado, pregunta, { proveedor: 'X' }, opciones);
  assert.equal(r.texto, 'Esa fila ya no está en la hoja. No cambié nada.');
  assert.deepEqual(sep.escrituras, []);
});

test('aplicarRespuesta_: monto ilegible devuelve los datos completos y deja la pregunta abierta para quien registra', () => {
  const estado = hojaFalsa('_ESTADO', { protegerDesborde: false });
  estado.appendRow([...COLUMNAS_ESTADO]);
  guardarPregunta_(estado, preguntaEstado_({
    creado: AHORA, clave: 7, preguntas: ['monto'], filas: [], pestana: '',
    extra: { datos: { intencion: 'GASTO', proveedor: 'Taxi', total: null, lineas: [] }, fechaMensaje: '2026-09-26', idMensaje: 55 },
  }));
  const leer = () => preguntasAbiertas_([COLUMNAS_ESTADO.map((_, j) => estado.leer(2, j + 1))]);
  const ss = libroFalso([estado]);
  const nada = aplicarRespuesta_(ss, estado, leer()[0], { total: null, lineas: [] }, opciones);
  assert.equal(nada.cerrada, false);
  assert.equal(nada.texto, 'No me quedó claro. ¿Me dices el monto?');
  const r = aplicarRespuesta_(ss, estado, leer()[0], { total: null, lineas: [{ monto: 12.5 }] }, opciones);
  assert.equal(r.cerrada, false);
  assert.equal(r.texto, '');
  assert.deepEqual(r.datosCompletos, { intencion: 'GASTO', proveedor: 'Taxi', total: 12.5, lineas: [] });
  assert.equal(r.fechaMensaje, '2026-09-26');
  assert.equal(r.idMensaje, 55);
  assert.equal(estado.leer(2, COLUMNAS_ESTADO.indexOf('ESTADO') + 1), 'ABIERTA');
});

test('aplicarRespuesta_: fecha de un mes sin pestaña la crea y mueve la fila ahí', () => {
  const { ss, sep, estado, pregunta } = escenario(['fecha']);
  const r = aplicarRespuesta_(ss, estado, pregunta, { fecha: '2026-07-15' }, opciones);
  assert.equal(r.texto, 'Listo, lo anoté. La pasé a Julio 2026.');
  const jul = ss.getSheetByName('Julio 2026');
  assert.equal(filaDe(jul, 6)['ID FACTURA'], 'PENDIENTE-20260715');
  assert.equal(filaDe(sep, 6)['ID FILA'], '');
});

test('si armar los escritos falla, la respuesta y la escritura no cambian', () => {
  const { ss, sep, estado, pregunta } = escenario(['proveedor']);
  const nombre = sep.getName;
  let escribio = false;
  const rango = sep.getRange;
  sep.getRange = (...args) => {
    const celda = rango.apply(sep, args);
    return { ...celda, setValue: (valor) => { celda.setValue(valor); escribio = true; } };
  };
  sep.getName = () => { if (escribio) throw new Error('sin nombre'); return nombre.call(sep); };
  const props = { getProperty: () => null };
  const real = console.error; const avisos = []; console.error = (x) => avisos.push(x);
  let respuesta;
  try {
    respuesta = aplicarRespuesta_(ss, estado, pregunta, { proveedor: 'Riba Smith' },
      { ...opciones, desde: AHORA, propiedades: props });
  } finally { console.error = real; }
  assert.equal(respuesta.texto, 'Listo, lo anoté.');
  assert.equal(filaDe(sep, 6).PROVEEDOR, 'Riba Smith');
  assert.ok(avisos.includes('_EDICIONES: no se pudo revisar choques: sin nombre'));
});

test('mover a un mes sin pestaña cuenta ID FACTURA en ese mes, no en el de origen', () => {
  const { ss, sep, estado, pregunta } = escenario(['fecha']);
  ponerFila(sep, 7, { FECHA: '2026-07-15', 'ID FACTURA': 'PENDIENTE-20260715', 'ID FILA': 'OTRA-1' });
  aplicarRespuesta_(ss, estado, pregunta, { fecha: '2026-07-15' }, opciones);
  assert.equal(filaDe(ss.getSheetByName('Julio 2026'), 6)['ID FACTURA'], 'PENDIENTE-20260715');
});

test('aplicarRespuesta_: tras una respuesta parcial, la siguiente sigue actualizando ID FACTURA', () => {
  const { ss, sep, estado, pregunta, leerPregunta, estadoDe } = escenario(['proveedor', 'fecha']);
  aplicarRespuesta_(ss, estado, pregunta, { proveedor: 'Riba Smith' }, opciones);
  assert.equal(filaDe(sep, 6)['ID FACTURA'], 'RIBASMITH-20260926');
  const r = aplicarRespuesta_(ss, estado, leerPregunta()[0], { fecha: '2026-09-20' }, opciones);
  assert.equal(r.texto, 'Listo, lo anoté.');
  assert.equal(filaDe(sep, 6)['ID FACTURA'], 'RIBASMITH-20260920');
  assert.equal(filaDe(sep, 6).REVISAR, 'PENDIENTE: TOTAL (partes suman 15.00)');
  assert.equal(estadoDe(), 'CERRADA');
});

test('aplicarRespuesta_: el monto también sirve si viene como total', () => {
  const estado = hojaFalsa('_ESTADO', { protegerDesborde: false });
  estado.appendRow([...COLUMNAS_ESTADO]);
  guardarPregunta_(estado, preguntaEstado_({
    creado: AHORA, clave: 7, preguntas: ['monto'], filas: [], pestana: '',
    extra: { datos: { intencion: 'GASTO', total: null, lineas: [] }, fechaMensaje: '2026-09-26', idMensaje: 55 },
  }));
  const [pregunta] = preguntasAbiertas_([COLUMNAS_ESTADO.map((_, j) => estado.leer(2, j + 1))]);
  const r = aplicarRespuesta_(libroFalso([estado]), estado, pregunta, { total: 8 }, opciones);
  assert.equal(r.datosCompletos.total, 8);
});

// --- P2: la respuesta del total (una fila por factura) ---

test('aplicarRespuesta_ del total en USD escribe GASTO (USD) y quita la marca TOTAL de REVISAR', () => {
  const { ss, sep, estado, pregunta, estadoDe } = escenario(['total']);
  const r = aplicarRespuesta_(ss, estado, pregunta, { total: 32 }, opciones);
  assert.equal(r.texto, 'Listo, lo anoté.');
  assert.equal(r.cerrada, true);
  assert.equal(estadoDe(), 'CERRADA');
  const f = filaDe(sep, 6);
  assert.equal(f['GASTO (USD)'], 32);
  assert.equal(f['MONTO ORIGINAL'], '');
  assert.equal(f.REVISAR, 'PENDIENTE: FECHA');
});

test('aplicarRespuesta_ del total en otra moneda escribe MONTO ORIGINAL y el GASTO con la TASA USADA de la fila', () => {
  const filaGasto = gasto({
    MONEDA: 'COP', 'TASA USADA': '4000 (2026-09-25)', 'ARTÍCULOS': 10, 'GASTO (USD)': 10,
    'MONTO ORIGINAL': 40000, REVISAR: 'PENDIENTE: TOTAL (partes suman 10.00)',
  });
  const { ss, sep, estado, pregunta } = escenario(['total'], { filaGasto });
  const r = aplicarRespuesta_(ss, estado, pregunta, { total: 44000 }, opciones);
  assert.equal(r.cerrada, true);
  const f = filaDe(sep, 6);
  assert.equal(f['MONTO ORIGINAL'], 44000);
  // 44000 / 4000 = 11.00 USD, la misma división que hizo montoEnUsd_ al escribir la fila.
  assert.equal(f['GASTO (USD)'], 11);
  assert.equal(f.REVISAR, '');
});

test('aplicarRespuesta_ del total en otra moneda sin tasa legible anota el monto original y deja el gasto como estaba', () => {
  const filaGasto = gasto({
    MONEDA: 'COP', 'TASA USADA': 'PENDIENTE', 'GASTO (USD)': 'PENDIENTE',
    REVISAR: 'PENDIENTE: TOTAL (partes suman 10.00)',
  });
  const { ss, sep, estado, pregunta } = escenario(['total'], { filaGasto });
  aplicarRespuesta_(ss, estado, pregunta, { total: 44000 }, opciones);
  const f = filaDe(sep, 6);
  assert.equal(f['MONTO ORIGINAL'], 44000);
  assert.equal(f['GASTO (USD)'], 'PENDIENTE');
  // La pregunta queda contestada igual: el monto original ya está anotado.
  assert.equal(f.REVISAR, '');
});

test('la hoja falsa falla si algo escribe en GRUPO (Y): protege el desborde de la fórmula', () => {
  const sep = hojaFalsa('Septiembre 2026');
  const y = numeroColumna_('GRUPO');
  assert.throws(() => sep.getRange(6, y).setValue(1), /tocó la columna 25/);
  assert.throws(() => sep.getRange(6, 1, 1, y).setValues([Array.from({ length: y }, () => '')]),
    /tocó la columna 25/);
  // Las 24 columnas que el bot sí escribe (A–X) no fallan.
  assert.doesNotThrow(() => sep.getRange(6, 1, 1, y - 1).setValues([Array.from({ length: y - 1 }, () => '')]));
});
