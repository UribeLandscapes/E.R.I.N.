const test = require('node:test');
const assert = require('node:assert/strict');

// En Apps Script estos nombres son globales; en Node se ponen a mano. CLAVE_BOTON y
// MAX_BYTES_CALLBACK son de Botones.js (Fecha.js los reusa, no los vuelve a declarar).
Object.assign(global, require('../src/Hoja.js'));
Object.assign(global, require('../src/Reglas.js'));
Object.assign(global, require('../src/Escritura.js'));
Object.assign(global, require('../src/Clases.js'));
Object.assign(global, require('../src/Texto.js'));
Object.assign(global, require('../src/Botones.js'));
// fechaConfirmacion_ (Confirmacion.js): formatea AAAA-MM-DD → DD/MM/AAAA (y textoFechaIlegible_).
Object.assign(global, require('../src/Confirmacion.js'));

const {
  TIPO_ESTADO_FECHA, PREFIJO_FECHA, tecladoFecha_, leerBotonFecha_, filaFecha_, buscarFecha_,
  TIPO_ESTADO_FECHA_FOTO, PREFIJO_FECHA_FOTO, TEXTO_OTRA_FECHA,
  textoFechaIlegible_, tecladoFechaFoto_, leerBotonFechaFoto_, filaFechaFoto_, buscarFechaFoto_,
  datosFechaFoto_, fechasFotoEsperando_, elegirFechaFoto_, leerFechaEscrita_,
  pareceFechaEscrita_,
  TEXTO_FECHA_SIN_GASTO,
} = require('../src/Fecha.js');
const { MAX_BYTES_CALLBACK } = require('../src/Botones.js');
const { COLUMNAS_ESTADO } = require('../src/Hoja.js');

const bytes = (texto) => Buffer.byteLength(texto, 'utf8');
const CREADO = new Date(2026, 8, 26, 16, 10, 20);
const datosGasto = { intencion: 'GASTO', proveedor: 'Whole Foods', fecha: '2026-08-15', total: 25, clase: 'GROCERIES' };

/** Filas de _ESTADO sin encabezado, como las devuelve getValues. */
const filaEstado = (valores) => COLUMNAS_ESTADO.map((c) => (c in valores ? valores[c] : ''));

test('PREFIJO_FECHA y TIPO_ESTADO_FECHA son los que espera el callback_data y _ESTADO', () => {
  assert.equal(PREFIJO_FECHA, 'fecha');
  assert.equal(TIPO_ESTADO_FECHA, 'FECHA');
});

test('tecladoFecha_ da un botón por cada fecha, con callback_data corto en ASCII', () => {
  const teclado = tecladoFecha_('501', '2026-08-15', '2026-09-27');
  assert.deepEqual(teclado, {
    inline_keyboard: [[
      { text: 'Fecha del recibo (2026-08-15)', callback_data: 'fecha:501:recibo' },
      { text: 'Día que lo mandé (2026-09-27)', callback_data: 'fecha:501:envio' },
    ]],
  });
  teclado.inline_keyboard[0].forEach((b) => assert.ok(bytes(b.callback_data) <= MAX_BYTES_CALLBACK));
});

test('tecladoFecha_ acepta un número como clave', () => {
  assert.equal(tecladoFecha_(501, '2026-08-15', '2026-09-27').inline_keyboard[0][0].callback_data, 'fecha:501:recibo');
});

test('tecladoFecha_ rechaza claves vacías, con otros caracteres o que pasen de 64 bytes', () => {
  assert.throws(() => tecladoFecha_('', '2026-08-15', '2026-09-27'), /clave/);
  assert.throws(() => tecladoFecha_('año', '2026-08-15', '2026-09-27'), /clave/);
  assert.throws(() => tecladoFecha_(null, '2026-08-15', '2026-09-27'), /clave/);
  const larga = '1'.repeat(MAX_BYTES_CALLBACK);
  assert.throws(() => tecladoFecha_(larga, '2026-08-15', '2026-09-27'), /64 bytes/);
});

test('leerBotonFecha_ entiende recibo y envio, y devuelve null para cualquier otra cosa', () => {
  assert.deepEqual(leerBotonFecha_('fecha:501:recibo'), { clave: '501', recibo: true });
  assert.deepEqual(leerBotonFecha_('fecha:501:envio'), { clave: '501', recibo: false });
  assert.equal(leerBotonFecha_('fecha:501:tal-vez'), null);
  assert.equal(leerBotonFecha_('conteo:501:si'), null);
  assert.equal(leerBotonFecha_('fecha::recibo'), null);
  assert.equal(leerBotonFecha_(undefined), null);
});

test('leerBotonFecha_ lee lo que arma tecladoFecha_', () => {
  const [recibo, envio] = tecladoFecha_('501', '2026-08-15', '2026-09-27').inline_keyboard[0];
  assert.deepEqual(leerBotonFecha_(recibo.callback_data), { clave: '501', recibo: true });
  assert.deepEqual(leerBotonFecha_(envio.callback_data), { clave: '501', recibo: false });
});

test('filaFecha_ arma la fila de _ESTADO en el orden de COLUMNAS_ESTADO', () => {
  const fila = filaFecha_({
    creado: CREADO, idMensaje: 501, datos: datosGasto, fechaMensaje: '2026-09-27',
  });
  const col = (c) => fila[COLUMNAS_ESTADO.indexOf(c)];
  assert.equal(fila.length, COLUMNAS_ESTADO.length);
  assert.equal(col('CREADO'), CREADO);
  assert.equal(col('TIPO'), 'FECHA');
  assert.equal(col('CLAVE'), '501');
  assert.equal(col('ID FILAS'), '');
  assert.deepEqual(JSON.parse(col('DATOS')), { datos: datosGasto, fechaMensaje: '2026-09-27', idMensaje: 501 });
  assert.equal(col('ESTADO'), 'ABIERTA');
});

test('buscarFecha_ encuentra la pregunta por clave (fila de la hoja = índice + 2)', () => {
  const filas = [
    filaEstado({ TIPO: 'CONTEO', CLAVE: 501, DATOS: '{}', ESTADO: 'ABIERTA' }),
    filaFecha_({
      creado: CREADO, idMensaje: 501, datos: datosGasto, fechaMensaje: '2026-09-27',
    }),
  ];
  assert.deepEqual(buscarFecha_(filas, '501'), {
    fila: 3, abierto: true, datos: datosGasto, fechaMensaje: '2026-09-27', idMensaje: 501,
  });
});

test('buscarFecha_ compara la clave como texto (la hoja puede devolver número)', () => {
  const filas = [filaEstado({
    TIPO: 'FECHA',
    CLAVE: 501,
    DATOS: JSON.stringify({ datos: datosGasto, fechaMensaje: '2026-09-27', idMensaje: 501 }),
    ESTADO: 'CERRADA',
  })];
  assert.deepEqual(buscarFecha_(filas, '501'), {
    fila: 2, abierto: false, datos: datosGasto, fechaMensaje: '2026-09-27', idMensaje: 501,
  });
});

test('buscarFecha_ devuelve null si no está o si DATOS no se puede leer', () => {
  assert.equal(buscarFecha_([], '501'), null);
  const rota = filaEstado({ TIPO: 'FECHA', CLAVE: '501', DATOS: 'no es json', ESTADO: 'ABIERTA' });
  assert.equal(buscarFecha_([rota], '501'), null);
  const sinFechaMensaje = filaEstado({ TIPO: 'FECHA', CLAVE: '501', DATOS: '{"datos":{}}', ESTADO: 'ABIERTA' });
  assert.equal(buscarFecha_([sinFechaMensaje], '501'), null);
  const sinDatos = filaEstado({ TIPO: 'FECHA', CLAVE: '501', DATOS: '{"fechaMensaje":"2026-09-27"}', ESTADO: 'ABIERTA' });
  assert.equal(buscarFecha_([sinDatos], '501'), null);
});

// ---: foto sin fecha legible (detalle confirmado) ---

test('PREFIJO_FECHA_FOTO y TIPO_ESTADO_FECHA_FOTO no chocan con los de Supuesto V', () => {
  assert.equal(PREFIJO_FECHA_FOTO, 'fechafoto');
  assert.equal(TIPO_ESTADO_FECHA_FOTO, 'FECHA-FOTO');
  assert.notEqual(PREFIJO_FECHA_FOTO, PREFIJO_FECHA);
  assert.notEqual(TIPO_ESTADO_FECHA_FOTO, TIPO_ESTADO_FECHA);
});

test('textoFechaIlegible_ da el texto exacto confirmado, con la fecha en DD/MM/AAAA', () => {
  assert.equal(
    textoFechaIlegible_('2026-09-27'),
    'No pude leer la fecha en la foto. La anoté con el día que la mandaste (27/09/2026). ¿Está bien?',
  );
});

test('TEXTO_OTRA_FECHA es el texto exacto confirmado', () => {
  assert.equal(TEXTO_OTRA_FECHA, 'Escríbeme la fecha del recibo (por ejemplo 25/09).');
});

test('tecladoFechaFoto_ da los dos botones confirmados con callback_data corto en ASCII', () => {
  const teclado = tecladoFechaFoto_('501');
  assert.deepEqual(teclado, {
    inline_keyboard: [[
      { text: 'Sí, esa fecha', callback_data: 'fechafoto:501:si' },
      { text: 'Es otra fecha', callback_data: 'fechafoto:501:otra' },
    ]],
  });
  teclado.inline_keyboard[0].forEach((b) => assert.ok(bytes(b.callback_data) <= MAX_BYTES_CALLBACK));
});

test('tecladoFechaFoto_ rechaza claves vacías, con otros caracteres o que pasen de 64 bytes', () => {
  assert.throws(() => tecladoFechaFoto_(''), /clave/);
  assert.throws(() => tecladoFechaFoto_('año'), /clave/);
  assert.throws(() => tecladoFechaFoto_(null), /clave/);
  const larga = '1'.repeat(MAX_BYTES_CALLBACK);
  assert.throws(() => tecladoFechaFoto_(larga), /64 bytes/);
});

test('leerBotonFechaFoto_ entiende si y otra, y devuelve null para cualquier otra cosa', () => {
  assert.deepEqual(leerBotonFechaFoto_('fechafoto:501:si'), { clave: '501', otra: false });
  assert.deepEqual(leerBotonFechaFoto_('fechafoto:501:otra'), { clave: '501', otra: true });
  assert.equal(leerBotonFechaFoto_('fechafoto:501:tal-vez'), null);
  assert.equal(leerBotonFechaFoto_('fecha:501:si'), null);
  assert.equal(leerBotonFechaFoto_(undefined), null);
});

test('filaFechaFoto_ arma la fila de _ESTADO con ID FILAS ya escritas (no re-escribe DATOS)', () => {
  const fila = filaFechaFoto_({
    creado: CREADO, idMensaje: 501, idFilas: ['BOT-1', 'BOT-2'], fechaMensaje: '2026-09-27',
  });
  const col = (c) => fila[COLUMNAS_ESTADO.indexOf(c)];
  assert.equal(fila.length, COLUMNAS_ESTADO.length);
  assert.equal(col('CREADO'), CREADO);
  assert.equal(col('TIPO'), 'FECHA-FOTO');
  assert.equal(col('CLAVE'), '501');
  assert.equal(col('ID FILAS'), 'BOT-1,BOT-2');
  assert.deepEqual(JSON.parse(col('DATOS')), { fechaMensaje: '2026-09-27', idMensaje: 501 });
  assert.equal(col('ESTADO'), 'ABIERTA');
});

test('buscarFechaFoto_ encuentra la pregunta por clave y devuelve las filas ya escritas', () => {
  const filas = [
    filaEstado({ TIPO: 'CONTEO', CLAVE: 501, DATOS: '{}', ESTADO: 'ABIERTA' }),
    filaFechaFoto_({ creado: CREADO, idMensaje: 501, idFilas: ['BOT-1', 'BOT-2'], fechaMensaje: '2026-09-27' }),
  ];
  assert.deepEqual(buscarFechaFoto_(filas, '501'), {
    fila: 3,
    abierto: true,
    esperando: false,
    idFilas: ['BOT-1', 'BOT-2'],
    fechaMensaje: '2026-09-27',
    idMensaje: 501,
    idPregunta: null,
    idOtra: null,
    tocado: null,
  });
});

test('buscarFechaFoto_ devuelve null si no está o si DATOS no se puede leer', () => {
  assert.equal(buscarFechaFoto_([], '501'), null);
  const rota = filaEstado({ TIPO: 'FECHA-FOTO', CLAVE: '501', DATOS: 'no es json', ESTADO: 'ABIERTA' });
  assert.equal(buscarFechaFoto_([rota], '501'), null);
  const sinFechaMensaje = filaEstado({ TIPO: 'FECHA-FOTO', CLAVE: '501', DATOS: '{"idMensaje":501}', ESTADO: 'ABIERTA' });
  assert.equal(buscarFechaFoto_([sinFechaMensaje], '501'), null);
});

// ---: "Es otra fecha" deja la pregunta esperando una fecha escrita ---

test('datosFechaFoto_ solo guarda "esperando" cuando la pregunta espera una fecha escrita', () => {
  assert.deepEqual(JSON.parse(datosFechaFoto_({ fechaMensaje: '2026-09-27', idMensaje: 501 })), {
    fechaMensaje: '2026-09-27', idMensaje: 501,
  });
  assert.deepEqual(JSON.parse(datosFechaFoto_({ fechaMensaje: '2026-09-27', idMensaje: 501, esperando: true })), {
    fechaMensaje: '2026-09-27', idMensaje: 501, esperando: true,
  });
});

test('buscarFechaFoto_ dice si la pregunta ya espera una fecha escrita', () => {
  const fila = filaFechaFoto_({ creado: CREADO, idMensaje: 501, idFilas: ['BOT-1'], fechaMensaje: '2026-09-27' });
  fila[COLUMNAS_ESTADO.indexOf('DATOS')] = datosFechaFoto_({
    fechaMensaje: '2026-09-27', idMensaje: 501, esperando: true,
  });
  assert.equal(buscarFechaFoto_([fila], '501').esperando, true);
});

test('fechasFotoEsperando_ da la fila de la hoja de cada pregunta que espera (índice + 2)', () => {
  const esperando = (idMensaje) => {
    const fila = filaFechaFoto_({ creado: CREADO, idMensaje, idFilas: [`BOT-${idMensaje}`], fechaMensaje: '2026-09-27' });
    fila[COLUMNAS_ESTADO.indexOf('DATOS')] = datosFechaFoto_({
      fechaMensaje: '2026-09-27', idMensaje, esperando: true,
    });
    return fila;
  };
  const filas = [esperando(501), esperando(502)];
  assert.deepEqual(fechasFotoEsperando_(filas).map((p) => p.fila), [2, 3]);
});

test('fechasFotoEsperando_ no ve preguntas cerradas, sin esperar, de otro tipo ni con DATOS rotos', () => {
  const sinEsperar = filaFechaFoto_({ creado: CREADO, idMensaje: 501, idFilas: ['BOT-1'], fechaMensaje: '2026-09-27' });
  assert.deepEqual(fechasFotoEsperando_([sinEsperar]), []);
  const cerrada = filaFechaFoto_({ creado: CREADO, idMensaje: 502, idFilas: ['BOT-2'], fechaMensaje: '2026-09-27' });
  cerrada[COLUMNAS_ESTADO.indexOf('DATOS')] = datosFechaFoto_({
    fechaMensaje: '2026-09-27', idMensaje: 502, esperando: true,
  });
  cerrada[COLUMNAS_ESTADO.indexOf('ESTADO')] = 'CERRADA';
  assert.deepEqual(fechasFotoEsperando_([cerrada]), []);
  const otroTipo = filaEstado({ TIPO: 'FECHA', CLAVE: 503, DATOS: '{"esperando":true}', ESTADO: 'ABIERTA' });
  assert.deepEqual(fechasFotoEsperando_([otroTipo]), []);
  const rota = filaEstado({ TIPO: 'FECHA-FOTO', CLAVE: 504, DATOS: 'no es json', ESTADO: 'ABIERTA' });
  assert.deepEqual(fechasFotoEsperando_([rota]), []);
});

// --- Fecha escrita a mano: formato fijo DD/MM o DD/MM/AAAA, sin Gemini ---

test('leerFechaEscrita_ entiende DD/MM con el año del mensaje y DD/MM/AAAA con su propio año', () => {
  assert.equal(leerFechaEscrita_('25/09', 2026), '2026-09-25');
  assert.equal(leerFechaEscrita_('5/9', 2026), '2026-09-05');
  assert.equal(leerFechaEscrita_('05/09/2025', 2026), '2025-09-05');
  assert.equal(leerFechaEscrita_('31/12/2026', 2026), '2026-12-31');
  assert.equal(leerFechaEscrita_('  25/09  ', 2026), '2026-09-25');
});

test('leerFechaEscrita_ devuelve null si el texto no es SOLO una fecha de ese formato', () => {
  assert.equal(leerFechaEscrita_('el 25/09', 2026), null);
  assert.equal(leerFechaEscrita_('25/09 gracias', 2026), null);
  assert.equal(leerFechaEscrita_('25-09', 2026), null);
  assert.equal(leerFechaEscrita_('25 de septiembre', 2026), null);
  assert.equal(leerFechaEscrita_('2026-09-25', 2026), null);
  assert.equal(leerFechaEscrita_('25/09/26', 2026), null);
  assert.equal(leerFechaEscrita_('', 2026), null);
  assert.equal(leerFechaEscrita_(undefined, 2026), null);
  assert.equal(leerFechaEscrita_(null, 2026), null);
});

test('leerFechaEscrita_ devuelve null si la fecha no existe en el calendario', () => {
  assert.equal(leerFechaEscrita_('31/02', 2026), null);
  assert.equal(leerFechaEscrita_('00/09', 2026), null);
  assert.equal(leerFechaEscrita_('25/13', 2026), null);
  assert.equal(leerFechaEscrita_('29/02/2025', 2026), null);
  assert.equal(leerFechaEscrita_('29/02/2024', 2026), '2024-02-29');
});

test('leerFechaEscrita_ devuelve null si el año del mensaje no sirve', () => {
  assert.equal(leerFechaEscrita_('25/09', undefined), null);
  assert.equal(leerFechaEscrita_('25/09', 'dos mil'), null);
});

test('TEXTO_FECHA_SIN_GASTO avisa que el gasto de la foto ya no está', () => {
  assert.match(TEXTO_FECHA_SIN_GASTO, /fecha/i);
  assert.ok(TEXTO_FECHA_SIN_GASTO.length < 200);
});

// --- Varias preguntas esperando a la vez: a cuál va la fecha escrita ---

const esperandoFila = ({ idMensaje, idPregunta, idOtra, tocado }) => {
  const fila = filaFechaFoto_({
    creado: CREADO, idMensaje, idPregunta, idFilas: [`BOT-${idMensaje}`], fechaMensaje: '2026-09-27',
  });
  fila[COLUMNAS_ESTADO.indexOf('DATOS')] = datosFechaFoto_({
    fechaMensaje: '2026-09-27', idMensaje, idPregunta, idOtra, tocado, esperando: true,
  });
  return fila;
};

test('filaFechaFoto_ guarda el id del mensaje de la pregunta (para las respuestas citadas)', () => {
  const fila = filaFechaFoto_({
    creado: CREADO, idMensaje: 501, idPregunta: 902, idFilas: ['BOT-1'], fechaMensaje: '2026-09-27',
  });
  assert.deepEqual(JSON.parse(fila[COLUMNAS_ESTADO.indexOf('DATOS')]), {
    fechaMensaje: '2026-09-27', idMensaje: 501, idPregunta: 902,
  });
});

test('datosFechaFoto_ guarda el mensaje de "Es otra fecha" y cuándo lo tocó', () => {
  const datos = JSON.parse(datosFechaFoto_({
    fechaMensaje: '2026-09-27', idMensaje: 501, idPregunta: 902, idOtra: 903, tocado: '2026-09-27T10:00:00.000Z', esperando: true,
  }));
  assert.equal(datos.idOtra, 903);
  assert.equal(datos.tocado, '2026-09-27T10:00:00.000Z');
  assert.equal(datos.esperando, true);
});

test('fechasFotoEsperando_ devuelve todas las preguntas que esperan, en el orden de la hoja', () => {
  const filas = [
    filaEstado({ TIPO: 'CONTEO', CLAVE: 1, DATOS: '{}', ESTADO: 'ABIERTA' }),
    esperandoFila({ idMensaje: 501, idPregunta: 902 }),
    filaFechaFoto_({ creado: CREADO, idMensaje: 503, idPregunta: 906, idFilas: ['BOT-3'], fechaMensaje: '2026-09-27' }),
    esperandoFila({ idMensaje: 502, idPregunta: 904 }),
  ];
  assert.deepEqual(fechasFotoEsperando_(filas).map((p) => p.idMensaje), [501, 502]);
  assert.deepEqual(fechasFotoEsperando_([]), []);
});

test('elegirFechaFoto_ toma la pregunta citada con "Responder" (pregunta, "otra fecha" o la foto)', () => {
  const esperando = fechasFotoEsperando_([
    esperandoFila({ idMensaje: 501, idPregunta: 902, idOtra: 903, tocado: '2026-09-27T10:00:00.000Z' }),
    esperandoFila({ idMensaje: 502, idPregunta: 904, idOtra: 905, tocado: '2026-09-27T11:00:00.000Z' }),
  ]);
  assert.equal(elegirFechaFoto_(esperando, [902]).idMensaje, 501);
  assert.equal(elegirFechaFoto_(esperando, [903]).idMensaje, 501);
  assert.equal(elegirFechaFoto_(esperando, [501]).idMensaje, 501);
  assert.equal(elegirFechaFoto_(esperando, [null, 501]).idMensaje, 501);
  assert.equal(elegirFechaFoto_(esperando, [904]).idMensaje, 502);
});

test('elegirFechaFoto_ sin cita toma la que tocó "Es otra fecha" más recientemente, no la última fila', () => {
  const esperando = fechasFotoEsperando_([
    esperandoFila({ idMensaje: 501, idPregunta: 902, tocado: '2026-09-27T12:00:00.000Z' }),
    esperandoFila({ idMensaje: 502, idPregunta: 904, tocado: '2026-09-27T11:00:00.000Z' }),
  ]);
  assert.equal(elegirFechaFoto_(esperando, []).idMensaje, 501);
  assert.equal(elegirFechaFoto_(esperando, [999]).idMensaje, 501);
  assert.equal(elegirFechaFoto_(esperando, null).idMensaje, 501);
});

test('elegirFechaFoto_ sin nada esperando devuelve null; sin "tocado" vale la última fila', () => {
  assert.equal(elegirFechaFoto_([], [902]), null);
  const esperando = fechasFotoEsperando_([
    esperandoFila({ idMensaje: 501, idPregunta: 902 }),
    esperandoFila({ idMensaje: 502, idPregunta: 904 }),
  ]);
  assert.equal(elegirFechaFoto_(esperando, []).idMensaje, 502);
});

test('pareceFechaEscrita_ solo dice que sí a un texto que es únicamente DD/MM o DD/MM/AAAA', () => {
  assert.equal(pareceFechaEscrita_(' 25/09 '), true);
  assert.equal(pareceFechaEscrita_('25/09/2026'), true);
  assert.equal(pareceFechaEscrita_('31/02'), true);
  assert.equal(pareceFechaEscrita_('el 25/09'), false);
  assert.equal(pareceFechaEscrita_(''), false);
  assert.equal(pareceFechaEscrita_(undefined), false);
});
