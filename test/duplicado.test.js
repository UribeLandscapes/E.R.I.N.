const test = require('node:test');
const assert = require('node:assert/strict');

global.MESES = require('../src/Hoja.js').MESES;
Object.assign(global, require('../src/Hoja.js'));
Object.assign(global, require('../src/Reglas.js'));
Object.assign(global, require('../src/Escritura.js'));
Object.assign(global, require('../src/Texto.js'));
Object.assign(global, require('../src/Confirmacion.js'));
Object.assign(global, require('../src/Botones.js'));
Object.assign(global, require('../src/Importacion.js'));
Object.assign(global, require('../src/Edicion.js'));

const {
  TIPO_ESTADO_DUPLICADO, PREFIJO_DUPLICADO, buscarDuplicado_, textoDuplicado_, tecladoDuplicado_,
  tecladoConfirmarDuplicado_, leerBotonDuplicado_, filaDuplicado_, buscarDuplicadoAbierto_,
  TEXTO_NO_AGREGADA, TEXTO_CONFIRMAR_DUPLICADO,
} = require('../src/Duplicado.js');

const REGISTRADO = new Date(2026, 8, 15, 10, 0, 0);

/** Fila de la hoja (arreglo en el orden de COLUMNAS) a partir de {columna: valor}. */
const filaHoja = (valores) => COLUMNAS.map((c) => (c in valores ? valores[c] : ''));

const existente = (extra = {}) => filaHoja({
  FECHA: '2026-09-15', PROVEEDOR: 'Riba Smith', 'GASTO (USD)': 22.5, TIPO: 'GASTO',
  ORIGEN: 'BOT', REGISTRADO, ...extra,
});

const nueva = (extra = {}) => ({
  FECHA: '2026-09-15', PROVEEDOR: 'Riba Smith', 'GASTO (USD)': 22.5, TIPO: 'GASTO', ...extra,
});

test('encuentra la misma factura: mismo proveedor, fecha y total', () => {
  const dup = buscarDuplicado_([existente()], nueva());
  assert.equal(dup.proveedor, 'Riba Smith');
  assert.equal(dup.fecha, '2026-09-15');
  assert.equal(dup.total, 22.5);
  assert.equal(dup.origen, 'BOT');
  assert.equal(dup.registrado, REGISTRADO);
});

test('el proveedor con otra ortografía cuenta como el mismo', () => {
  assert.ok(buscarDuplicado_([existente({ PROVEEDOR: 'RIBA SMITH' })], nueva({ PROVEEDOR: 'riba smith' })));
  assert.ok(buscarDuplicado_([existente({ PROVEEDOR: 'ribasmith' })], nueva()));
});

test('el total se compara al centavo: 22.504 de la hoja es 22.50', () => {
  assert.ok(buscarDuplicado_([existente({ 'GASTO (USD)': 22.504 })], nueva()));
  assert.equal(buscarDuplicado_([existente({ 'GASTO (USD)': 22.51 })], nueva()), null);
});

test('otro total, otra fecha u otro proveedor no son duplicado', () => {
  assert.equal(buscarDuplicado_([existente()], nueva({ 'GASTO (USD)': 23 })), null);
  assert.equal(buscarDuplicado_([existente()], nueva({ FECHA: '2026-09-16' })), null);
  assert.equal(buscarDuplicado_([existente()], nueva({ PROVEEDOR: 'Super 99' })), null);
});

test('un depósito, saldo inicial o ajuste que coincide no cuenta', () => {
  ['DEPOSITO', 'SALDO INICIAL', 'AJUSTE'].forEach((tipo) => {
    assert.equal(buscarDuplicado_([existente({ TIPO: tipo })], nueva()), null, tipo);
  });
});

test('TIPO vacío cuenta solo en filas MANUAL o ARCHIVO', () => {
  assert.ok(buscarDuplicado_([existente({ TIPO: '', ORIGEN: 'MANUAL' })], nueva()));
  assert.ok(buscarDuplicado_([existente({ TIPO: '', ORIGEN: 'ARCHIVO' })], nueva()));
  assert.equal(buscarDuplicado_([existente({ TIPO: '', ORIGEN: 'BOT' })], nueva()), null);
  assert.equal(buscarDuplicado_([existente({ TIPO: '', ORIGEN: '' })], nueva()), null);
});

test('filas sin proveedor o sin monto no cuentan, ni la fila nueva sin ellos', () => {
  assert.equal(buscarDuplicado_([existente({ PROVEEDOR: '' })], nueva({ PROVEEDOR: '' })), null);
  assert.equal(buscarDuplicado_([existente({ 'GASTO (USD)': '' })], nueva({ 'GASTO (USD)': '' })), null);
  assert.equal(buscarDuplicado_([existente({ 'GASTO (USD)': 'PENDIENTE' })], nueva({ 'GASTO (USD)': 'PENDIENTE' })), null);
  assert.equal(buscarDuplicado_([existente()], nueva({ PROVEEDOR: 'PENDIENTE', 'GASTO (USD)': 22.5 })), null);
});

test('la FECHA de la hoja puede ser un Date', () => {
  assert.ok(buscarDuplicado_([existente({ FECHA: new Date(2026, 8, 15) })], nueva()));
});

test('con varias coincidencias devuelve la de REGISTRADO más reciente', () => {
  const vieja = existente({ REGISTRADO: new Date(2026, 8, 1), ORIGEN: 'ARCHIVO' });
  const reciente = existente({ REGISTRADO: new Date(2026, 8, 20), ORIGEN: 'BOT' });
  assert.equal(buscarDuplicado_([reciente, vieja], nueva()).origen, 'BOT');
  assert.equal(buscarDuplicado_([vieja, reciente], nueva()).origen, 'BOT');
});

test('sin REGISTRADO válido la coincidencia igual se encuentra', () => {
  const dup = buscarDuplicado_([existente({ REGISTRADO: '' })], nueva());
  assert.equal(dup.registrado, null);
});

test('entradas vacías o inválidas no lanzan y devuelven null', () => {
  assert.equal(buscarDuplicado_([], nueva()), null);
  assert.equal(buscarDuplicado_(null, nueva()), null);
  assert.equal(buscarDuplicado_([existente()], null), null);
  assert.equal(buscarDuplicado_([existente()], {}), null);
});

test('texto de fila del bot o a mano: "la agregaste el <REGISTRADO>"', () => {
  const dup = buscarDuplicado_([existente()], nueva());
  assert.equal(textoDuplicado_(dup),
    'Esta factura ya está anotada: la agregaste el 15/09/2026 por 22.50, proveedor Riba Smith.');
  const manual = buscarDuplicado_([existente({ ORIGEN: 'MANUAL', REGISTRADO: new Date(2026, 8, 20) })], nueva());
  assert.match(textoDuplicado_(manual), /la agregaste el 20\/09\/2026 por 22\.50/);
});

test('texto de fila del Excel viejo: usa la fecha de la factura', () => {
  const dup = buscarDuplicado_([existente({ ORIGEN: 'ARCHIVO', REGISTRADO: new Date(2026, 8, 30) })], nueva());
  assert.equal(textoDuplicado_(dup),
    'Esta factura ya está anotada en el Excel viejo: factura del 15/09/2026 por 22.50, proveedor Riba Smith.');
});

test('texto de una fila del bot sin REGISTRADO usa la fecha de la factura', () => {
  const dup = buscarDuplicado_([existente({ REGISTRADO: '' })], nueva());
  assert.match(textoDuplicado_(dup), /la agregaste el 15\/09\/2026 por 22\.50/);
});

test('constantes con prefijo y TIPO propios, distintos de los de fecha', () => {
  assert.equal(TIPO_ESTADO_DUPLICADO, 'DUPLICADO');
  assert.equal(PREFIJO_DUPLICADO, 'duplicado');
  assert.equal(TEXTO_NO_AGREGADA, 'Listo, no la agregué.');
  assert.equal(TEXTO_CONFIRMAR_DUPLICADO, '¿Estás segura de que quieres agregarla otra vez?');
});

test('teclado del aviso: dos botones con callback_data propio y de menos de 64 bytes', () => {
  const teclado = tecladoDuplicado_(501);
  const botones = teclado.inline_keyboard.flat();
  assert.deepEqual(botones.map((b) => b.text), ['1. Me equivoqué', '2. Sí, la quiero agregar']);
  botones.forEach((b) => {
    assert.ok(Buffer.byteLength(b.callback_data) <= 64);
    assert.ok(b.callback_data.startsWith('duplicado:501:'));
  });
});

test('teclado de confirmación: Sí y No', () => {
  const botones = tecladoConfirmarDuplicado_(501).inline_keyboard.flat();
  assert.deepEqual(botones.map((b) => b.text), ['Sí', 'No']);
});

test('los teclados rechazan una clave no válida', () => {
  assert.throws(() => tecladoDuplicado_('a:b'), /clave de botón no válida/);
  assert.throws(() => tecladoConfirmarDuplicado_(undefined), /clave de botón no válida/);
  assert.throws(() => tecladoDuplicado_('x'.repeat(60)), /64 bytes/);
});

test('leerBotonDuplicado_ devuelve clave y opción de cada botón', () => {
  const [uno, dos] = tecladoDuplicado_(501).inline_keyboard.flat();
  const [si, no] = tecladoConfirmarDuplicado_(501).inline_keyboard.flat();
  assert.deepEqual(leerBotonDuplicado_(uno.callback_data), { clave: '501', opcion: 'equivoque' });
  assert.deepEqual(leerBotonDuplicado_(dos.callback_data), { clave: '501', opcion: 'agregar' });
  assert.deepEqual(leerBotonDuplicado_(si.callback_data), { clave: '501', opcion: 'seguro' });
  assert.deepEqual(leerBotonDuplicado_(no.callback_data), { clave: '501', opcion: 'cancelar' });
});

test('leerBotonDuplicado_ devuelve null con datos ajenos o mal formados', () => {
  ['fecha:501:recibo', 'duplicado:501:otra', 'duplicado::si', '', null, undefined, 5]
    .forEach((data) => assert.equal(leerBotonDuplicado_(data), null, String(data)));
});

test('filaDuplicado_ arma la fila de _ESTADO abierta y buscarDuplicadoAbierto_ la lee', () => {
  const fila = filaDuplicado_({
    creado: new Date(2026, 8, 27), idMensaje: 501, datos: { total: 22.5 }, fechaMensaje: '2026-09-27',
    mimeType: 'image/jpeg', paso: 'aviso',
  });
  assert.equal(fila.length, COLUMNAS_ESTADO.length);
  assert.equal(fila[COLUMNAS_ESTADO.indexOf('TIPO')], 'DUPLICADO');
  assert.equal(fila[COLUMNAS_ESTADO.indexOf('CLAVE')], '501');
  assert.equal(fila[COLUMNAS_ESTADO.indexOf('ESTADO')], 'ABIERTA');
  const otra = filaDuplicado_({ creado: 1, idMensaje: 9, datos: {}, fechaMensaje: '2026-09-27', mimeType: 'x', paso: 'aviso' });
  const leida = buscarDuplicadoAbierto_([otra, fila], '501');
  assert.equal(leida.fila, 3);
  assert.equal(leida.abierto, true);
  assert.equal(leida.paso, 'aviso');
  assert.equal(leida.mimeType, 'image/jpeg');
  assert.deepEqual(leida.datos, { total: 22.5 });
  assert.equal(leida.fechaMensaje, '2026-09-27');
  assert.equal(leida.idMensaje, 501);
});

test('buscarDuplicadoAbierto_: no está, DATOS malos o cerrada', () => {
  assert.equal(buscarDuplicadoAbierto_([], '501'), null);
  const mala = filaDuplicado_({ creado: 1, idMensaje: 501, datos: {}, fechaMensaje: '2026-09-27', mimeType: 'x', paso: 'aviso' });
  mala[COLUMNAS_ESTADO.indexOf('DATOS')] = 'no es json';
  assert.equal(buscarDuplicadoAbierto_([mala], '501'), null);
  const cerrada = filaDuplicado_({ creado: 1, idMensaje: 501, datos: {}, fechaMensaje: '2026-09-27', mimeType: 'x', paso: 'aviso' });
  cerrada[COLUMNAS_ESTADO.indexOf('ESTADO')] = 'CERRADA';
  assert.equal(buscarDuplicadoAbierto_([cerrada], '501').abierto, false);
});
