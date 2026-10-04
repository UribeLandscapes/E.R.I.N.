const test = require('node:test');
const assert = require('node:assert/strict');

// En Apps Script todos estos nombres son globales; en Node se ponen a mano antes de requerir
// PorProcesar.js (sinTildes_ de Hoja.js, leerFecha_/idFactura_/ortografiaProveedor_ de Reglas.js,
// PREGUNTA_ABIERTA/leerDatosEstado_/textoCelda_ de Escritura.js, filasGasto_/esMonto_/
// montoTexto_/MARCA_PENDIENTE de Texto.js, CLAVE_BOTON/MAX_BYTES_CALLBACK de Botones.js).
Object.assign(global, require('../src/Hoja.js'));
Object.assign(global, require('../src/Reglas.js'));
Object.assign(global, require('../src/Escritura.js'));
Object.assign(global, require('../src/Clases.js'));
Object.assign(global, require('../src/Texto.js'));
Object.assign(global, require('../src/Confirmacion.js'));
Object.assign(global, require('../src/Foto.js'));
Object.assign(global, require('../src/Botones.js'));

const {
  TIPO_ESTADO_POR_PROCESAR, PREFIJO_TOTAL_OCR, PREFIJO_FORMA_PAGO, MAX_INTENTOS_POR_PROCESAR,
  ACCION_LLENAR, ACCION_ESPERAR, ACCION_PREGUNTAR, ocrPosible_, totalDeOcr_, datosPorProcesar_,
  filaPorProcesar_, leerFilaPorProcesar_, buscarPorProcesar_, porProcesarAbiertas_,
  filaPorProcesarConIntento_, datosTotalConfirmado_, planTotalConfirmado_, decidirReintento_,
  llenarPendientes_, agregarMarcaRevisar_, tecladoTotalOcr_, leerBotonTotalOcr_, tecladoFormaPago_,
  leerBotonFormaPago_, textoTotalOcr_, TEXTO_PEDIR_TOTAL, TEXTO_PREGUNTA_PROVEEDOR,
  TEXTO_PREGUNTA_FORMA_PAGO, TEXTO_TOTAL_NO, DESCRIPCION_FOTO_SIN_LEER, leerMontoEscrito_,
} = require('../src/PorProcesar.js');
const { COLUMNAS_ESTADO } = require('../src/Hoja.js');
const { PREGUNTA_ABIERTA } = require('../src/Escritura.js');
const { MAX_BYTES_CALLBACK } = require('../src/Botones.js');
const { planTexto_ } = require('../src/Texto.js');

const bytes = (texto) => Buffer.byteLength(texto, 'utf8');
const CREADO = new Date(2026, 8, 27, 16, 10, 20);
const col = (nombre) => COLUMNAS_ESTADO.indexOf(nombre);

/** Filas de _ESTADO sin encabezado, como las devuelve getValues. */
const filaEstado = (valores) => COLUMNAS_ESTADO.map((c) => (c in valores ? valores[c] : ''));

const guardado = {
  idFoto: '1AbC', enlace: 'https://drive.google.com/file/d/1AbC/view', idMensaje: 777,
  fechaMensaje: '2026-09-27', leyenda: '', intentos: 0, totalOcr: 66.34,
};

function contexto(cambios) {
  return {
    fechaMensaje: '2026-09-27',
    idMensaje: 777,
    idsFactura: [],
    historial: [],
    depositante: 'Beto',
    aUsd: () => { throw new Error('no debería convertir'); },
    ...cambios,
  };
}

// ---: el total sale de la línea que dice TOTAL, nunca del número más grande ---

// Ticket de súper sintético, con RUC, número de factura y caja.
const TICKET_SUPER = [
  'SEVEN 11, S.A.',
  'RUC 1234567-1-2020 DV 12',
  'TEL 6123-4567',
  'FACTURA No. 0001234567',
  'CAJA 07  CAJERO 12',
  'ARROZ 5 LB           G   4.95',
  'LECHE 1 LT               2.10',
  'AHORRO CLUB             -1.00',
  'SUBTOTAL                62.00',
  'ITBMS 7%                 4.34',
  'TOTAL               B/. 66.34',
  'EFECTIVO RECIBIDO       70.00',
  'CAMBIO                   3.66',
].join('\n');

test('totalDeOcr_ toma el monto de la línea TOTAL y no el número más grande del ticket', () => {
  assert.equal(totalDeOcr_(TICKET_SUPER), 66.34);
});

test('totalDeOcr_ no confunde SUBTOTAL ni TOTAL ITBMS con el total', () => {
  const texto = ['SUBTOTAL        62.00', 'TOTAL ITBMS      4.34', 'TOTAL           66.34'].join('\n');
  assert.equal(totalDeOcr_(texto), 66.34);
});

test('totalDeOcr_ sin ninguna línea TOTAL devuelve null', () => {
  const texto = ['FARMACIA ARROCHA', 'RUC 8-123-456', 'SUBTOTAL 12.00', 'ITBMS 0.84'].join('\n');
  assert.equal(totalDeOcr_(texto), null);
});

test('totalDeOcr_ con SUBTOTAL como única línea de total devuelve null', () => {
  assert.equal(totalDeOcr_('SUBTOTAL   62.00'), null);
});

test('totalDeOcr_ toma el monto de la línea siguiente cuando la de TOTAL no trae ninguno', () => {
  const texto = ['ITBMS 7%   4.34', 'TOTAL A PAGAR', '', 'B/. 66.34', 'GRACIAS POR SU COMPRA'].join('\n');
  assert.equal(totalDeOcr_(texto), 66.34);
});

test('totalDeOcr_ prefiere TOTAL A PAGAR cuando hay varias líneas de total', () => {
  const texto = ['TOTAL SIN PROPINA    50.00', 'TOTAL A PAGAR        55.00', 'TOTAL TARJETAS  55.00'].join('\n');
  assert.equal(totalDeOcr_(texto), 55);
});

test('totalDeOcr_ sin TOTAL A PAGAR se queda con la última línea de total', () => {
  const texto = ['TOTAL            50.00', 'PROPINA 10%       5.00', 'TOTAL            55.00'].join('\n');
  assert.equal(totalDeOcr_(texto), 55);
});

test('totalDeOcr_ lee miles con coma y el prefijo $', () => {
  assert.equal(totalDeOcr_('TOTAL A PAGAR: $1,234.56'), 1234.56);
});

test('totalDeOcr_ lee B/. pegado al monto y con puntos de relleno', () => {
  assert.equal(totalDeOcr_('TOTAL.......B/.66.34'), 66.34);
});

test('totalDeOcr_ toma el último monto de la línea de total', () => {
  assert.equal(totalDeOcr_('TOTAL 3 ARTICULOS        66.34'), 66.34);
});

test('totalDeOcr_ ignora el RUC, el teléfono y el número de factura de la misma línea', () => {
  const texto = 'TOTAL FACTURA No. 0001234567 RUC 1234567-1-2020 TEL 6123-4567';
  assert.equal(totalDeOcr_(texto), null);
});

test('totalDeOcr_ no toma un número de autorización largo como total', () => {
  assert.equal(totalDeOcr_('TOTAL AUTORIZACION 4839201'), null);
  assert.equal(totalDeOcr_('TOTAL CAJA 07'), null);
});

test('totalDeOcr_ no toma un porcentaje como total', () => {
  assert.equal(totalDeOcr_('TOTAL DESC 10%\nITBMS 7%'), null);
});

test('totalDeOcr_ de un texto vacío o nulo devuelve null', () => {
  assert.equal(totalDeOcr_(''), null);
  assert.equal(totalDeOcr_(null), null);
  assert.equal(totalDeOcr_(undefined), null);
});

test('totalDeOcr_ lee un total sin decimales escrito a mano', () => {
  assert.equal(totalDeOcr_('nota de lavanderia\nTotal 50'), 50);
});

test('totalDeOcr_ acepta minúsculas y tildes ("Total a Pagar")', () => {
  assert.equal(totalDeOcr_('Sub Total 60.00\nTotal a Pagar  B/. 64.20'), 64.2);
});

// ---: qué fotos puede leer el OCR de Drive ---

test('ocrPosible_ es verdadero para JPEG, PNG, GIF, BMP y PDF', () => {
  ['image/jpeg', 'image/png', 'image/gif', 'image/bmp', 'application/pdf']
    .forEach((mime) => assert.equal(ocrPosible_(mime), true, mime));
  assert.equal(ocrPosible_('IMAGE/JPEG'), true);
});

test('ocrPosible_ es falso para HEIC, HEIF, WEBP y para lo que no se sabe', () => {
  ['image/heic', 'image/heif', 'image/webp', '', null, undefined]
    .forEach((mime) => assert.equal(ocrPosible_(mime), false, String(mime)));
});

// ---: la entrada POR-PROCESAR en _ESTADO ---

test('filaPorProcesar_ arma la fila en el orden de COLUMNAS_ESTADO', () => {
  const fila = filaPorProcesar_({ creado: CREADO, ...guardado });
  assert.equal(fila.length, COLUMNAS_ESTADO.length);
  assert.equal(fila[col('CREADO')], CREADO);
  assert.equal(fila[col('TIPO')], 'POR-PROCESAR');
  assert.equal(fila[col('CLAVE')], '777');
  assert.equal(fila[col('ID FILAS')], '');
  assert.equal(fila[col('ESTADO')], PREGUNTA_ABIERTA);
  assert.deepEqual(JSON.parse(fila[col('DATOS')]), {
    fechaMensaje: '2026-09-27',
    idMensaje: 777,
    intentos: 0,
    idFoto: '1AbC',
    enlace: 'https://drive.google.com/file/d/1AbC/view',
    totalOcr: 66.34,
  });
});

test('datosPorProcesar_ omite lo que no hay y deja intentos en 0', () => {
  const datos = JSON.parse(datosPorProcesar_({ idMensaje: 5, fechaMensaje: '2026-09-27' }));
  assert.deepEqual(datos, { fechaMensaje: '2026-09-27', idMensaje: 5, intentos: 0 });
});

test('datosPorProcesar_ guarda la leyenda de la foto cuando la hay', () => {
  const datos = JSON.parse(datosPorProcesar_({ ...guardado, leyenda: 'Playa' }));
  assert.equal(datos.leyenda, 'Playa');
});

test('buscarPorProcesar_ devuelve la entrada abierta con todos sus datos', () => {
  const filas = [
    filaEstado({ TIPO: 'FECHA-FOTO', CLAVE: '777', DATOS: '{"fechaMensaje":"2026-09-27"}' }),
    filaPorProcesar_({ creado: CREADO, ...guardado }),
  ];
  assert.deepEqual(buscarPorProcesar_(filas, 777), {
    fila: 3,
    creado: CREADO,
    abierto: true,
    idFilas: [],
    idFoto: '1AbC',
    enlace: 'https://drive.google.com/file/d/1AbC/view',
    idMensaje: 777,
    idPregunta: null,
    idProveedor: null,
    preguntado: [],
    fechaMensaje: '2026-09-27',
    leyenda: '',
    intentos: 0,
    totalOcr: 66.34,
  });
});

// ---: el mensaje del bot que hizo la pregunta y las filas ya escritas ---

test('filaPorProcesar_ guarda el id del mensaje con que el bot preguntó el total', () => {
  const fila = filaPorProcesar_({ creado: CREADO, ...guardado, idPregunta: 901 });
  assert.equal(JSON.parse(fila[col('DATOS')]).idPregunta, 901);
  assert.equal(leerFilaPorProcesar_(fila, 0).idPregunta, 901);
});

test('leerFilaPorProcesar_ lee las filas ya escritas de ID FILAS (el total ya confirmado)', () => {
  const fila = filaPorProcesar_({ creado: CREADO, ...guardado });
  fila[col('ID FILAS')] = 'BOT-1,BOT-2';
  assert.deepEqual(leerFilaPorProcesar_(fila, 0).idFilas, ['BOT-1', 'BOT-2']);
});

test('leerFilaPorProcesar_ devuelve CREADO tal cual para poder comparar cuál es más nueva', () => {
  const fila = filaPorProcesar_({ creado: CREADO, ...guardado });
  assert.equal(leerFilaPorProcesar_(fila, 0).creado, CREADO);
});

// ---: un mensaje que es SOLO un monto (sin Gemini) ---

test('leerMontoEscrito_ lee un monto suelto con o sin símbolo de moneda', () => {
  assert.equal(leerMontoEscrito_('66.34'), 66.34);
  assert.equal(leerMontoEscrito_(' 66,34 '), 66.34);
  assert.equal(leerMontoEscrito_('B/. 66.34'), 66.34);
  assert.equal(leerMontoEscrito_('$66.34'), 66.34);
  assert.equal(leerMontoEscrito_('1,234.56'), 1234.56);
  assert.equal(leerMontoEscrito_('50'), 50);
});

test('leerMontoEscrito_ rechaza lo que no es SOLO un monto', () => {
  ['gasté 66.34', '66.34 en el super', 'hola', '', null, 7, '12/09', '0', '-5']
    .forEach((t) => assert.equal(leerMontoEscrito_(t), null, String(t)));
});

test('leerMontoEscrito_ rechaza números de documento (regla F): >4 dígitos o con cero al inicio', () => {
  assert.equal(leerMontoEscrito_('00123'), null);
  assert.equal(leerMontoEscrito_('123456'), null);
  assert.equal(leerMontoEscrito_('1234'), 1234);
});

test('los textos nuevos del paso 17b están fijados', () => {
  assert.equal(TEXTO_TOTAL_NO, 'Entonces, ¿cuánto es el total?');
  assert.equal(DESCRIPCION_FOTO_SIN_LEER, 'Factura sin leer');
});

test('buscarPorProcesar_ no encuentra nada con otra clave ni con otro TIPO', () => {
  const filas = [filaPorProcesar_({ creado: CREADO, ...guardado })];
  assert.equal(buscarPorProcesar_(filas, 778), null);
  assert.equal(buscarPorProcesar_([filaEstado({ TIPO: 'CONTEO', CLAVE: '777' })], 777), null);
});

test('buscarPorProcesar_ tolera DATOS que no son JSON', () => {
  const fila = filaPorProcesar_({ creado: CREADO, ...guardado });
  fila[col('DATOS')] = 'no es json';
  assert.equal(buscarPorProcesar_([fila], 777), null);
});

test('buscarPorProcesar_ descarta DATOS sin fechaMensaje', () => {
  const fila = filaPorProcesar_({ creado: CREADO, ...guardado });
  fila[col('DATOS')] = JSON.stringify({ idMensaje: 777 });
  assert.equal(buscarPorProcesar_([fila], 777), null);
});

test('leerFilaPorProcesar_ deja totalOcr en null cuando no es un monto', () => {
  const fila = filaPorProcesar_({ creado: CREADO, ...guardado, totalOcr: null });
  assert.equal(leerFilaPorProcesar_(fila, 0).totalOcr, null);
});

test('porProcesarAbiertas_ solo trae las POR-PROCESAR todavía abiertas', () => {
  const cerrada = filaPorProcesar_({ creado: CREADO, ...guardado, idMensaje: 778 });
  cerrada[col('ESTADO')] = 'CERRADA';
  const rota = filaPorProcesar_({ creado: CREADO, ...guardado, idMensaje: 779 });
  rota[col('DATOS')] = '{';
  const filas = [filaPorProcesar_({ creado: CREADO, ...guardado }), cerrada, rota,
    filaEstado({ TIPO: 'PREGUNTA', CLAVE: '800' })];
  assert.deepEqual(porProcesarAbiertas_(filas).map((p) => p.idMensaje), [777]);
});

test('filaPorProcesarConIntento_ devuelve una fila NUEVA con un intento más', () => {
  const fila = filaPorProcesar_({ creado: CREADO, ...guardado });
  const antes = [...fila];
  const nueva = filaPorProcesarConIntento_(fila);
  assert.notEqual(nueva, fila);
  assert.deepEqual(fila, antes);
  assert.equal(leerFilaPorProcesar_(nueva, 0).intentos, 1);
  assert.equal(leerFilaPorProcesar_(filaPorProcesarConIntento_(nueva), 0).intentos, 2);
});

test('filaPorProcesarConIntento_ conserva el resto de los DATOS', () => {
  const fila = filaPorProcesar_({ creado: CREADO, ...guardado, leyenda: 'Playa' });
  const leida = leerFilaPorProcesar_(filaPorProcesarConIntento_(fila), 0);
  assert.equal(leida.enlace, guardado.enlace);
  assert.equal(leida.idFoto, '1AbC');
  assert.equal(leida.leyenda, 'Playa');
  assert.equal(leida.totalOcr, 66.34);
});

test('filaPorProcesarConIntento_ con DATOS ilegibles devuelve null', () => {
  const fila = filaPorProcesar_({ creado: CREADO, ...guardado });
  fila[col('DATOS')] = 'roto';
  assert.equal(filaPorProcesarConIntento_(fila), null);
});

// ---: la fila con el total confirmado ---

test('planTotalConfirmado_ escribe UNA fila con el total, la fecha del mensaje y sin preguntas', () => {
  const plan = planTotalConfirmado_(66.34, guardado, contexto());
  assert.equal(plan.filas.length, 1);
  assert.deepEqual(plan.preguntas, []);
  const fila = plan.filas[0];
  assert.equal(fila['GASTO (USD)'], 66.34);
  assert.equal(fila.FECHA, '2026-09-27');
  assert.equal(fila.TIPO, 'GASTO');
  assert.equal(fila.MONEDA, 'USD');
  assert.equal(fila['ID MENSAJE TG'], 777);
});

test('planTotalConfirmado_ deja PROVEEDOR, FORMA DE PAGO y CLASE DE GASTO en PENDIENTE', () => {
  const fila = planTotalConfirmado_(66.34, guardado, contexto()).filas[0];
  assert.equal(fila.PROVEEDOR, 'PENDIENTE');
  assert.equal(fila['FORMA DE PAGO'], 'PENDIENTE');
  assert.equal(fila['CLASE DE GASTO'], 'PENDIENTE');
});

test('planTotalConfirmado_ conserva el enlace de la foto en la columna FOTO', () => {
  const fila = planTotalConfirmado_(66.34, guardado, contexto()).filas[0];
  assert.equal(fila.FOTO, guardado.enlace);
});

test('planTotalConfirmado_ pasa la leyenda de la foto a COMENTARIOS', () => {
  const fila = planTotalConfirmado_(66.34, { ...guardado, leyenda: 'gas' }, contexto()).filas[0];
  assert.equal(fila.COMENTARIOS, 'gas');
});

test('planTotalConfirmado_ sin un monto válido no escribe nada y pregunta el monto', () => {
  assert.deepEqual(planTotalConfirmado_(null, guardado, contexto()),
    { filas: [], preguntas: ['monto'], datos: null });
});

test('datosTotalConfirmado_ arma los datos de un gasto sin fecha ni proveedor', () => {
  const datos = datosTotalConfirmado_(66.34, guardado);
  assert.equal(datos.intencion, 'GASTO');
  assert.equal(datos.total, 66.34);
  assert.deepEqual(datos.lineas, []);
  assert.equal(datos.fecha, undefined);
  assert.equal(datos.proveedor, undefined);
  assert.equal(datos.clase, 'PENDIENTE');
  assert.equal(datos.idFoto, '1AbC');
});

test('datosTotalConfirmado_ sin nada guardado deja la foto vacía', () => {
  const datos = datosTotalConfirmado_(66.34, null);
  assert.equal(datos.foto, '');
  assert.equal(datos.idFoto, undefined);
  assert.equal(datos.comentario, undefined);
});

test('leerFilaPorProcesar_ toma intentos raros como 0 y sin enlace como vacío', () => {
  const fila = filaEstado({
    TIPO: 'POR-PROCESAR',
    CLAVE: '777',
    DATOS: JSON.stringify({ fechaMensaje: '2026-09-27', idMensaje: 777, intentos: 'dos' }),
    ESTADO: PREGUNTA_ABIERTA,
  });
  const leida = leerFilaPorProcesar_(fila, 0);
  assert.equal(leida.intentos, 0);
  assert.equal(leida.enlace, '');
  assert.equal(leida.idFoto, null);
  assert.equal(leida.leyenda, '');
});

// --- /: el reintento ---

test('decidirReintento_ con Gemini respondiendo llena lo PENDIENTE', () => {
  assert.deepEqual(decidirReintento_({ intentos: 0, ok: true, totalGemini: 66.34, totalConfirmado: 66.34 }),
    { accion: ACCION_LLENAR, marcarTotal: false, intentos: 1 });
});

test('decidirReintento_ marca el total cuando Gemini no coincide con el que confirmó el usuario', () => {
  const decision = decidirReintento_({ intentos: 1, ok: true, totalGemini: 70, totalConfirmado: 66.34 });
  assert.deepEqual(decision, { accion: ACCION_LLENAR, marcarTotal: true, intentos: 2 });
});

test('decidirReintento_ no marca el total cuando Gemini no trajo ninguno', () => {
  const decision = decidirReintento_({ intentos: 0, ok: true, totalGemini: null, totalConfirmado: 66.34 });
  assert.equal(decision.marcarTotal, false);
});

test('decidirReintento_ tras el primer fallo espera al siguiente cierre', () => {
  assert.deepEqual(decidirReintento_({ intentos: 0, ok: false }),
    { accion: ACCION_ESPERAR, marcarTotal: false, intentos: 1 });
});

test('decidirReintento_ tras el segundo fallo pasa a modo preguntas', () => {
  assert.deepEqual(decidirReintento_({ intentos: 1, ok: false }),
    { accion: ACCION_PREGUNTAR, marcarTotal: false, intentos: 2 });
  assert.equal(decidirReintento_({ intentos: 5, ok: false }).accion, ACCION_PREGUNTAR);
  assert.equal(MAX_INTENTOS_POR_PROCESAR, 2);
});

test('llenarPendientes_ solo escribe donde la hoja sigue diciendo PENDIENTE', () => {
  const valores = {
    PROVEEDOR: 'PENDIENTE', 'FORMA DE PAGO': 'EFECTIVO', 'CLASE DE GASTO': 'PENDIENTE',
  };
  const nuevos = { PROVEEDOR: 'Seven 11', 'FORMA DE PAGO': 'TARJETA', 'CLASE DE GASTO': 'S5. Alimentación' };
  assert.deepEqual(llenarPendientes_(valores, nuevos),
    { PROVEEDOR: 'Seven 11', 'CLASE DE GASTO': 'S5. Alimentación' });
});

test('llenarPendientes_ nunca toca el total confirmado ni su moneda', () => {
  const valores = { 'GASTO (USD)': 'PENDIENTE', MONEDA: 'PENDIENTE', PROVEEDOR: 'PENDIENTE' };
  assert.deepEqual(llenarPendientes_(valores, { 'GASTO (USD)': 70, MONEDA: 'EUR', PROVEEDOR: 'Whole Foods' }),
    { PROVEEDOR: 'Whole Foods' });
});

test('llenarPendientes_ no escribe valores vacíos ni otro PENDIENTE', () => {
  const valores = { PROVEEDOR: 'PENDIENTE', 'CLASE DE GASTO': 'PENDIENTE', COMENTARIOS: 'PENDIENTE' };
  assert.deepEqual(llenarPendientes_(valores, { PROVEEDOR: '', 'CLASE DE GASTO': 'PENDIENTE', COMENTARIOS: null }), {});
  assert.deepEqual(llenarPendientes_(undefined, undefined), {});
});

test('agregarMarcaRevisar_ pone PENDIENTE: TOTAL en una celda vacía', () => {
  assert.equal(agregarMarcaRevisar_('', 'TOTAL'), 'PENDIENTE: TOTAL');
  assert.equal(agregarMarcaRevisar_(null, 'TOTAL'), 'PENDIENTE: TOTAL');
  assert.equal(agregarMarcaRevisar_(undefined, 'TOTAL'), 'PENDIENTE: TOTAL');
});

test('agregarMarcaRevisar_ suma la marca a las que ya estaban, sin repetirla', () => {
  assert.equal(agregarMarcaRevisar_('PENDIENTE: FECHA', 'TOTAL'), 'PENDIENTE: FECHA, TOTAL');
  assert.equal(agregarMarcaRevisar_('PENDIENTE: TOTAL', 'TOTAL'), 'PENDIENTE: TOTAL');
  assert.equal(agregarMarcaRevisar_('PENDIENTE: TOTAL (partes suman 15.00)', 'TOTAL'),
    'PENDIENTE: TOTAL (partes suman 15.00)');
});

// --- Textos y botones del usuario ---

test('textoTotalOcr_ propone el total del OCR con dos decimales', () => {
  assert.equal(textoTotalOcr_(66.34), 'Guardé tu foto, pero ahora no la puedo leer. ¿El total es 66.34?');
  assert.equal(textoTotalOcr_(50), 'Guardé tu foto, pero ahora no la puedo leer. ¿El total es 50.00?');
});

test('TEXTO_PEDIR_TOTAL avisa que la foto quedó guardada y pregunta el total', () => {
  assert.equal(TEXTO_PEDIR_TOTAL, 'Guardé tu foto, pero ahora no la puedo leer. ¿Cuánto es el total?');
});

test('los textos del modo preguntas son cortos y en el tono del bot', () => {
  assert.equal(TEXTO_PREGUNTA_PROVEEDOR, '¿A quién le pagaste en esa foto?');
  assert.equal(TEXTO_PREGUNTA_FORMA_PAGO, '¿Cómo lo pagaste?');
});

test('tecladoTotalOcr_ da Sí/No con callback_data corto y con su propio prefijo', () => {
  const teclado = tecladoTotalOcr_(777);
  assert.deepEqual(teclado, {
    inline_keyboard: [[
      { text: 'Sí', callback_data: 'totalocr:777:si' },
      { text: 'No', callback_data: 'totalocr:777:no' },
    ]],
  });
  teclado.inline_keyboard[0].forEach((b) => assert.ok(bytes(b.callback_data) <= MAX_BYTES_CALLBACK));
  assert.equal(PREFIJO_TOTAL_OCR, 'totalocr');
  assert.equal(TIPO_ESTADO_POR_PROCESAR, 'POR-PROCESAR');
});

test('tecladoTotalOcr_ rechaza una clave que no sirve para callback_data', () => {
  assert.throws(() => tecladoTotalOcr_('777:si'), /clave de botón no válida/);
  assert.throws(() => tecladoTotalOcr_({}), /clave de botón no válida/);
  assert.throws(() => tecladoTotalOcr_('7'.repeat(80)), /pasa de 64 bytes/);
});

test('leerBotonTotalOcr_ lee el Sí y el No, y nada más', () => {
  assert.deepEqual(leerBotonTotalOcr_('totalocr:777:si'), { clave: '777', si: true });
  assert.deepEqual(leerBotonTotalOcr_('totalocr:777:no'), { clave: '777', si: false });
  ['fechafoto:777:si', 'totalocr:777:quizas', 'totalocr::si', '', null, 7]
    .forEach((data) => assert.equal(leerBotonTotalOcr_(data), null, String(data)));
});

test('tecladoFormaPago_ ofrece EFECTIVO, TARJETA, TRANSFERENCIA y YAPPY en dos filas de dos', () => {
  const teclado = tecladoFormaPago_('777');
  assert.deepEqual(teclado.inline_keyboard.map((fila) => fila.map((b) => b.text)),
    [['Efectivo', 'Tarjeta'], ['Transferencia', 'Yappy']]);
  const botones = teclado.inline_keyboard.flat();
  assert.deepEqual(botones.map((b) => b.callback_data),
    ['pago:777:efectivo', 'pago:777:tarjeta', 'pago:777:transferencia', 'pago:777:yappy']);
  botones.forEach((b) => assert.ok(bytes(b.callback_data) <= MAX_BYTES_CALLBACK));
  assert.equal(PREFIJO_FORMA_PAGO, 'pago');
});

test('tecladoFormaPago_ rechaza claves malas y callback_data largo', () => {
  assert.throws(() => tecladoFormaPago_('a b'), /clave de botón no válida/);
  assert.throws(() => tecladoFormaPago_('7'.repeat(60)), /pasa de 64 bytes/);
});

test('leerBotonFormaPago_ devuelve la forma de pago en mayúsculas', () => {
  assert.deepEqual(leerBotonFormaPago_('pago:777:efectivo'), { clave: '777', forma: 'EFECTIVO' });
  assert.deepEqual(leerBotonFormaPago_('pago:777:tarjeta'), { clave: '777', forma: 'TARJETA' });
  assert.deepEqual(leerBotonFormaPago_('pago:777:transferencia'), { clave: '777', forma: 'TRANSFERENCIA' });
  assert.deepEqual(leerBotonFormaPago_('pago:777:yappy'), { clave: '777', forma: 'YAPPY' });
  ['pago:777:yapi', 'conteo:777:si', null, 7].forEach((d) => assert.equal(leerBotonFormaPago_(d), null, String(d)));
});

// --- Caso 9 con Gemini funcionando (ya cubierto; aquí queda fijado) ---

test('caso 9: una foto sin monto legible no escribe filas, pregunta el monto y guarda el enlace', () => {
  const datos = {
    intencion: 'GASTO',
    proveedor: 'Seven 11',
    fecha: '2026-09-27',
    total: null,
    lineas: [],
    clase: 'PENDIENTE',
    foto: guardado.enlace,
    idFoto: guardado.idFoto,
  };
  const plan = planTexto_(datos, contexto());
  assert.deepEqual(plan.filas, []);
  assert.deepEqual(plan.preguntas, ['monto']);
  assert.equal(plan.confirmable, false);
  // El enlace de la foto viaja en `datos` (extra.datos de registrarPlan_), no en la fila.
  assert.equal(datos.foto, guardado.enlace);
});
