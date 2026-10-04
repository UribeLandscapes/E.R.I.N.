const test = require('node:test');
const assert = require('node:assert/strict');

// En Apps Script estos nombres son globales; en Node se ponen a mano.
Object.assign(global, require('../src/Hoja.js'));
Object.assign(global, require('../src/Reglas.js'));
Object.assign(global, require('../src/Escritura.js'));
Object.assign(global, require('../src/Clases.js'));
Object.assign(global, require('../src/Texto.js'));

const {
  TIPO_ESTADO_CONTEO, MAX_BYTES_CALLBACK, TEXTO_CONTEO_ATENDIDO, TEXTO_SIN_AJUSTE,
  tecladoConteo_, leerBotonConteo_, filaConteo_, buscarConteo_, planBotonConteo_,
} = require('../src/Botones.js');
const { COLUMNAS_ESTADO } = require('../src/Hoja.js');

const bytes = (texto) => Buffer.byteLength(texto, 'utf8');
const CREADO = new Date(2026, 8, 26, 16, 10, 20);

function contexto(cambios) {
  return { fechaMensaje: '2026-09-27', idMensaje: 777, idsFactura: [], ...cambios };
}

/** Filas de _ESTADO sin encabezado, como las devuelve getValues. */
const filaEstado = (valores) => COLUMNAS_ESTADO.map((c) => (c in valores ? valores[c] : ''));

test('tecladoConteo_ da una fila con Sí y No, y callback_data corto en ASCII', () => {
  const teclado = tecladoConteo_('783694033');
  assert.deepEqual(teclado, {
    inline_keyboard: [[
      { text: 'Sí', callback_data: 'conteo:783694033:si' },
      { text: 'No', callback_data: 'conteo:783694033:no' },
    ]],
  });
  teclado.inline_keyboard[0].forEach((b) => assert.ok(bytes(b.callback_data) <= MAX_BYTES_CALLBACK));
});

test('tecladoConteo_ acepta un número como clave', () => {
  assert.equal(tecladoConteo_(501).inline_keyboard[0][0].callback_data, 'conteo:501:si');
});

test('tecladoConteo_ rechaza claves vacías, con otros caracteres o que pasen de 64 bytes', () => {
  assert.throws(() => tecladoConteo_(''), /clave/);
  assert.throws(() => tecladoConteo_('año'), /clave/);
  assert.throws(() => tecladoConteo_('a:b'), /clave/);
  assert.throws(() => tecladoConteo_(null), /clave/);
  const larga = '1'.repeat(MAX_BYTES_CALLBACK);
  assert.throws(() => tecladoConteo_(larga), /64 bytes/);
  // La más larga que cabe: 'conteo:' + clave + ':si' = 64 bytes.
  const justa = '1'.repeat(MAX_BYTES_CALLBACK - 'conteo::si'.length);
  assert.equal(bytes(tecladoConteo_(justa).inline_keyboard[0][0].callback_data), 64);
});

test('leerBotonConteo_ entiende Sí y No, y devuelve null para cualquier otra cosa', () => {
  assert.deepEqual(leerBotonConteo_('conteo:501:si'), { clave: '501', si: true });
  assert.deepEqual(leerBotonConteo_('conteo:501:no'), { clave: '501', si: false });
  assert.equal(leerBotonConteo_('conteo:501:tal-vez'), null);
  assert.equal(leerBotonConteo_('otro:501:si'), null);
  assert.equal(leerBotonConteo_('conteo::si'), null);
  assert.equal(leerBotonConteo_(undefined), null);
});

test('leerBotonConteo_ lee lo que arma tecladoConteo_', () => {
  const [si, no] = tecladoConteo_('783694033').inline_keyboard[0];
  assert.deepEqual(leerBotonConteo_(si.callback_data), { clave: '783694033', si: true });
  assert.deepEqual(leerBotonConteo_(no.callback_data), { clave: '783694033', si: false });
});

test('filaConteo_ arma la fila de _ESTADO en el orden de COLUMNAS_ESTADO', () => {
  const fila = filaConteo_({ creado: CREADO, idMensaje: 501, contado: 85, saldo: 90 });
  const col = (c) => fila[COLUMNAS_ESTADO.indexOf(c)];
  assert.equal(fila.length, COLUMNAS_ESTADO.length);
  assert.equal(TIPO_ESTADO_CONTEO, 'CONTEO');
  assert.equal(col('CREADO'), CREADO);
  assert.equal(col('TIPO'), 'CONTEO');
  assert.equal(col('CLAVE'), '501');
  assert.equal(col('ID FILAS'), '');
  assert.deepEqual(JSON.parse(col('DATOS')), { idMensaje: 501, contado: 85, saldo: 90 });
  assert.equal(col('ESTADO'), 'ABIERTA');
});

test('buscarConteo_ encuentra el conteo por clave (fila de la hoja = índice + 2)', () => {
  const filas = [
    filaEstado({ TIPO: 'UPDATE', CLAVE: 501, ESTADO: 'VISTO' }),
    filaEstado({ TIPO: 'PREGUNTA', CLAVE: 501, DATOS: '{}', ESTADO: 'ABIERTA' }),
    filaConteo_({ creado: CREADO, idMensaje: 501, contado: 85, saldo: 90 }),
  ];
  assert.deepEqual(buscarConteo_(filas, '501'), {
    fila: 4, abierto: true, idMensaje: 501, contado: 85, saldo: 90,
  });
});

test('buscarConteo_ compara la clave como texto (la hoja puede devolver número)', () => {
  const filas = [filaEstado({
    TIPO: 'CONTEO', CLAVE: 501, DATOS: '{"idMensaje":501,"contado":85,"saldo":90}', ESTADO: 'CERRADA',
  })];
  assert.deepEqual(buscarConteo_(filas, '501'), {
    fila: 2, abierto: false, idMensaje: 501, contado: 85, saldo: 90,
  });
});

test('buscarConteo_ devuelve null si no está o si DATOS no se puede leer', () => {
  assert.equal(buscarConteo_([], '501'), null);
  const rota = filaEstado({ TIPO: 'CONTEO', CLAVE: '501', DATOS: 'no es json', ESTADO: 'ABIERTA' });
  assert.equal(buscarConteo_([rota], '501'), null);
  const sinMontos = filaEstado({ TIPO: 'CONTEO', CLAVE: '501', DATOS: '{"contado":"x"}', ESTADO: 'ABIERTA' });
  assert.equal(buscarConteo_([sinMontos], '501'), null);
});

const abierto = (cambios) => ({ fila: 3, abierto: true, idMensaje: 501, contado: 85, saldo: 90, ...cambios });

test('planBotonConteo_ con No cierra el conteo sin escribir nada', () => {
  const plan = planBotonConteo_(abierto(), false, 90, contexto());
  assert.deepEqual(plan, {
    filas: [], estado: 'CERRADA', saldo: 90, respuesta: TEXTO_SIN_AJUSTE, aviso: '', teclado: false,
  });
});

test('planBotonConteo_ con Sí y saldo igual escribe el AJUSTE y cierra', () => {
  const plan = planBotonConteo_(abierto(), true, 90, contexto());
  assert.equal(plan.estado, 'CERRADA');
  assert.equal(plan.teclado, false);
  assert.equal(plan.filas.length, 1);
  const fila = plan.filas[0];
  assert.equal(fila.TIPO, 'AJUSTE');
  assert.equal(fila['GASTO (USD)'], 5);
  assert.equal(fila.FECHA, '2026-09-27');
  assert.equal(fila['ID MENSAJE TG'], 501);
  assert.equal(fila['ID FACTURA'], 'AJUSTE-20260927');
  assert.equal(plan.respuesta, 'Anoté el ajuste: faltante de 5.00.');
});

test('planBotonConteo_ usa los ID FACTURA del contexto para no repetir', () => {
  const plan = planBotonConteo_(abierto(), true, 90, contexto({ idsFactura: ['AJUSTE-20260927'] }));
  assert.equal(plan.filas[0]['ID FACTURA'], 'AJUSTE-20260927-2');
});

test('planBotonConteo_ con Sí y saldo cambiado vuelve a preguntar con el número nuevo', () => {
  const plan = planBotonConteo_(abierto(), true, 88, contexto());
  assert.deepEqual(plan.filas, []);
  assert.equal(plan.estado, 'ABIERTA');
  assert.equal(plan.saldo, 88);
  assert.equal(plan.teclado, true);
  assert.match(plan.respuesta, /cambió/);
  assert.match(plan.respuesta, /faltante de 3\.00/);
});

test('planBotonConteo_ con Sí cuando ya cuadra cierra sin escribir', () => {
  const plan = planBotonConteo_(abierto(), true, 85, contexto());
  assert.deepEqual(plan.filas, []);
  assert.equal(plan.estado, 'CERRADA');
  assert.equal(plan.respuesta, 'Cuadra: 85.00.');
});

test('planBotonConteo_ con un conteo cerrado o que no existe solo avisa', () => {
  const esperado = {
    filas: [], estado: null, saldo: null, respuesta: '', aviso: TEXTO_CONTEO_ATENDIDO, teclado: false,
  };
  assert.deepEqual(planBotonConteo_(abierto({ abierto: false }), true, 90, contexto()), esperado);
  assert.deepEqual(planBotonConteo_(null, false, 90, contexto()), esperado);
});
