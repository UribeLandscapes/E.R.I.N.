const test = require('node:test');
const assert = require('node:assert/strict');

// En Apps Script estos nombres son globales; en Node se ponen a mano (mismo patrón que
// texto.test.js y mensajes.test.js).
global.MESES = require('../src/Hoja.js').MESES;
Object.assign(global, require('../src/Reglas.js'));
Object.assign(global, require('../src/Extraccion.js'));
global.sinTildes_ = require('../src/Hoja.js').sinTildes_;
global.CONFIG = require('./configPrueba.js').CONFIG;
Object.assign(global, require('../src/Clases.js'));
global.cambiosRespuesta_ = require('../src/Escritura.js').cambiosRespuesta_;
global.textoCelda_ = require('../src/Escritura.js').textoCelda_;
Object.assign(global, require('../src/Texto.js'));
Object.assign(global, require('../src/Confirmacion.js'));
Object.assign(global, require('../src/Carpetas.js'));

// PlanTexto_ (Texto.js) llama confirmacionFoto_ de este mismo archivo como global.
Object.assign(global, require('../src/Foto.js'));

const {
  fotoMayor_, fotoDeMensaje_, instruccionFoto_, cuerpoFotoGemini_, planFoto_, lineaFoto_,
  confirmacionFoto_,
} = require('../src/Foto.js');

const CATEGORIAS = ['GROCERIES', 'MAINTENANCE', 'SERVICES'];
const HOY = '2026-09-27';

function contexto(cambios) {
  return {
    fechaMensaje: '2026-09-27',
    idMensaje: 501,
    idsFactura: [],
    saldoInicialDefinido: true,
    saldoCalculado: 90,
    depositante: 'Beto',
    mimeType: 'image/jpeg',
    aUsd: () => { throw new Error('no debería convertir'); },
    ...cambios,
  };
}

const confianzaAlta = {
  proveedor: 'ALTA', fecha: 'ALTA', moneda: 'ALTA', total: 'ALTA', clase: 'ALTA',
};

function datosFoto(cambios) {
  return {
    legible: true,
    tipo_documento: 'TICKET',
    proveedor: 'Whole Foods',
    fecha: '2026-09-27',
    moneda: 'USD',
    forma_pago: 'EFECTIVO',
    lineas: [],
    total: 22.5,
    clase: 'GROCERIES',
    descripcion_corta: 'super whole foods',
    confianza: confianzaAlta,
    // La extracción de una foto no trae intención (esquemaExtraccion_ en modo foto); la
    // pone la capa de app antes de planear, porque planFoto_ ahora pasa por planTexto_.
    intencion: 'GASTO',
    ...cambios,
  };
}

// --- fotoMayor_: elegir la foto de mayor tamaño (ancho x alto), sin fiarse del orden ---

test('fotoMayor_ elige la de mayor área, sin importar el orden del arreglo', () => {
  const fotos = [
    { file_id: 'a', width: 100, height: 100 },
    { file_id: 'b', width: 800, height: 600 },
    { file_id: 'c', width: 300, height: 300 },
  ];
  assert.equal(fotoMayor_(fotos).file_id, 'b');
});

test('fotoMayor_ con empate se queda con la primera vista', () => {
  const fotos = [
    { file_id: 'a', width: 200, height: 200 },
    { file_id: 'b', width: 400, height: 100 },
  ];
  assert.equal(fotoMayor_(fotos).file_id, 'a');
});

test('fotoMayor_ salta entradas mal formadas', () => {
  const fotos = [
    { file_id: '', width: 900, height: 900 },
    { file_id: 'b', width: 'x', height: 100 },
    null,
    { file_id: 'd', width: 50, height: 50 },
  ];
  assert.equal(fotoMayor_(fotos).file_id, 'd');
});

test('fotoMayor_ sin arreglo, vacío o sin ninguna válida devuelve null', () => {
  assert.equal(fotoMayor_(null), null);
  assert.equal(fotoMayor_(undefined), null);
  assert.equal(fotoMayor_('no es arreglo'), null);
  assert.equal(fotoMayor_([]), null);
  assert.equal(fotoMayor_([{ file_id: '', width: 0, height: 0 }]), null);
});

// --- fotoDeMensaje_: la foto o, si el usuario la mandó "como archivo", el documento de imagen ---

test('fotoDeMensaje_ con mensaje.photo devuelve la foto de mayor tamaño', () => {
  const mensaje = { photo: [{ file_id: 'a', width: 100, height: 100 }, { file_id: 'b', width: 800, height: 600 }] };
  assert.equal(fotoDeMensaje_(mensaje).file_id, 'b');
});

test('fotoDeMensaje_ con document de imagen (mime_type permitido) devuelve el documento', () => {
  const mensaje = { document: { file_id: 'doc-1', mime_type: 'image/png', file_size: 4000 } };
  const foto = fotoDeMensaje_(mensaje);
  assert.equal(foto.file_id, 'doc-1');
  assert.equal(foto.file_size, 4000);
});

test('fotoDeMensaje_ con document en mayúsculas (IMAGE/JPEG) igual lo reconoce', () => {
  const mensaje = { document: { file_id: 'doc-2', mime_type: 'IMAGE/JPEG' } };
  assert.equal(fotoDeMensaje_(mensaje).file_id, 'doc-2');
});

// Una factura mandada como PDF se atiende igual que una imagen.
test('fotoDeMensaje_ con document PDF devuelve el documento', () => {
  const mensaje = { document: { file_id: 'doc-3', mime_type: 'application/pdf', file_size: 9000 } };
  const foto = fotoDeMensaje_(mensaje);
  assert.equal(foto.file_id, 'doc-3');
  assert.equal(foto.file_size, 9000);
});

test('fotoDeMensaje_ con document que no es imagen ni PDF (audio) devuelve null', () => {
  const mensaje = { document: { file_id: 'doc-3b', mime_type: 'audio/ogg' } };
  assert.equal(fotoDeMensaje_(mensaje), null);
});

test('fotoDeMensaje_ con document sin mime_type devuelve null', () => {
  const mensaje = { document: { file_id: 'doc-4' } };
  assert.equal(fotoDeMensaje_(mensaje), null);
});

test('fotoDeMensaje_ sin photo ni document devuelve null', () => {
  assert.equal(fotoDeMensaje_({ voice: { file_id: 'v-1' } }), null);
  assert.equal(fotoDeMensaje_({}), null);
  assert.equal(fotoDeMensaje_(null), null);
  assert.equal(fotoDeMensaje_(undefined), null);
});

test('fotoDeMensaje_ con photo Y document se queda con la foto (gana photo)', () => {
  const mensaje = {
    photo: [{ file_id: 'p-1', width: 100, height: 100 }],
    document: { file_id: 'doc-5', mime_type: 'image/png' },
  };
  assert.equal(fotoDeMensaje_(mensaje).file_id, 'p-1');
});

// --- instruccionFoto_ / cuerpoFotoGemini_ ---

test('instruccionFoto_ pide leer el recibo, nunca adivinar montos y deja la fecha null si no se lee', () => {
  const instruccion = instruccionFoto_(HOY);
  assert.match(instruccion, /recibo/);
  assert.match(instruccion, /[Nn]unca adivin/);
  assert.match(instruccion, /null/);
  assert.match(instruccion, new RegExp(HOY));
});

test('instruccionFoto_ explica los 17 grupos de clase (Supuesto AB, punto B)', () => {
  const instruccion = instruccionFoto_(HOY);
  assert.match(instruccion, /17 grupos/);
  assert.match(instruccion, /Supermercado/);
  assert.match(instruccion, /17\. Varios/);
});

test('instruccionFoto_ explica las dos casas y AE-b (la leyenda del usuario junto a la foto)', () => {
  const instruccion = instruccionFoto_(HOY);
  assert.match(instruccion, /la Casa Norte en la ciudad/);
  assert.match(instruccion, /la Casa Playa en la costa/);
  assert.match(instruccion, /PRINCIPAL o SECUNDARIA/);
  assert.match(instruccion, /leyenda/);
  assert.match(instruccion, /comentario/);
});

// Reglas (formatos reales de Panamá).

test('instruccionFoto_ regla 1: RUC, DV, CUFE, QR y números de autorización nunca son montos ni fechas', () => {
  const instruccion = instruccionFoto_(HOY);
  ['RUC', 'DV', 'CUFE', 'QR', 'autorización', 'terminal', 'membresía', 'placa'].forEach((palabra) => {
    assert.ok(instruccion.includes(palabra), `falta "${palabra}"`);
  });
  assert.match(instruccion, /nunca son montos ni fechas/);
});

test('instruccionFoto_ regla 2: el total es TOTAL, no SUBTOTAL, EFECTIVO RECIBIDO, CAMBIO ni saldo', () => {
  const instruccion = instruccionFoto_(HOY);
  assert.match(instruccion, /SUBTOTAL/);
  assert.match(instruccion, /EFECTIVO RECIBIDO/);
  assert.match(instruccion, /CAMBIO/);
  assert.match(instruccion, /saldo/);
});

test('instruccionFoto_ regla 3: cada ITBMS es una línea ITBMS y los descuentos van como DESCUENTO negativo', () => {
  const instruccion = instruccionFoto_(HOY);
  assert.match(instruccion, /ITBMS/);
  assert.match(instruccion, /DESCUENTO/);
  assert.match(instruccion, /negativo/);
});

test('instruccionFoto_ regla 4: propina solo si se pagó; "propina sugerida" sola no se anota', () => {
  const instruccion = instruccionFoto_(HOY);
  assert.match(instruccion, /PROPINA/);
  assert.match(instruccion, /propina sugerida/);
  assert.match(instruccion, /dos totales/);
});

test('instruccionFoto_ regla 5: proveedor = nombre comercial, no la razón social; en Yappy el destinatario', () => {
  const instruccion = instruccionFoto_(HOY);
  assert.match(instruccion, /nombre comercial/);
  assert.match(instruccion, /razón social/);
  assert.match(instruccion, /Yappy/);
  assert.match(instruccion, /destinatario/);
});

test('instruccionFoto_ regla 6: fecha de compra o pago, nunca vencimiento ni período ni hora del celular', () => {
  const instruccion = instruccionFoto_(HOY);
  assert.match(instruccion, /emisión/);
  assert.match(instruccion, /vencimiento/);
  assert.match(instruccion, /período/);
  assert.match(instruccion, /hora del celular/);
});

test('instruccionFoto_ regla 7: B/. es USD; "$" en un recibo de otro país es la moneda de ese país', () => {
  const instruccion = instruccionFoto_(HOY);
  assert.ok(instruccion.includes('B/.'), 'falta "B/."');
  assert.match(instruccion, /otro país/);
});

test('instruccionFoto_ regla 8: ticket y voucher de la misma compra son un solo gasto', () => {
  const instruccion = instruccionFoto_(HOY);
  assert.match(instruccion, /voucher/);
  assert.match(instruccion, /un solo gasto/);
});

test('cuerpoFotoGemini_ arma generateContent con la imagen y el esquema en modo foto', () => {
  const cuerpo = cuerpoFotoGemini_('BASE64==', 'image/jpeg', '', CATEGORIAS, HOY);
  assert.deepEqual(cuerpo.systemInstruction, { parts: [{ text: instruccionFoto_(HOY) }] });
  assert.deepEqual(cuerpo.contents, [{
    role: 'user',
    parts: [{ inlineData: { mimeType: 'image/jpeg', data: 'BASE64==' } }],
  }]);
  assert.equal(cuerpo.generationConfig.responseMimeType, 'application/json');
  assert.deepEqual(cuerpo.generationConfig.responseJsonSchema, esquemaExtraccion_(CATEGORIAS, false));
});

test('cuerpoFotoGemini_ agrega la leyenda como parte de texto solo si no está vacía', () => {
  const conLeyenda = cuerpoFotoGemini_('BASE64==', 'image/png', '  playa, efectivo  ', CATEGORIAS, HOY);
  assert.deepEqual(conLeyenda.contents[0].parts[1], { text: 'playa, efectivo' });
  const sinLeyenda = cuerpoFotoGemini_('BASE64==', 'image/png', null, CATEGORIAS, HOY);
  assert.equal(sinLeyenda.contents[0].parts.length, 1);
  const soloEspacios = cuerpoFotoGemini_('BASE64==', 'image/png', '   ', CATEGORIAS, HOY);
  assert.equal(soloEspacios.contents[0].parts.length, 1);
});

test('cuerpoFotoGemini_ exige base64 y un mimeType soportado', () => {
  assert.throws(() => cuerpoFotoGemini_('', 'image/jpeg', '', CATEGORIAS, HOY), /base64/);
  assert.throws(() => cuerpoFotoGemini_(null, 'image/jpeg', '', CATEGORIAS, HOY), /base64/);
  assert.throws(() => cuerpoFotoGemini_('BASE64==', 'audio/ogg', '', CATEGORIAS, HOY), /mimeType/);
  assert.throws(() => cuerpoFotoGemini_('BASE64==', '', '', CATEGORIAS, HOY), /mimeType/);
  for (const mime of ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']) {
    assert.doesNotThrow(() => cuerpoFotoGemini_('BASE64==', mime, '', CATEGORIAS, HOY));
  }
});

// --- planFoto_: filas, preguntas, fechaDistinta, fechaIlegible, nombreArchivo ---

test('planFoto_ con fecha legible del mismo mes escribe las filas de filasGasto_ sin fechaIlegible', () => {
  const { filas, fechaIlegible, fechaDistinta } = planFoto_(datosFoto({}), contexto());
  assert.equal(filas.length, 1);
  assert.equal(fechaIlegible, null);
  assert.equal(fechaDistinta, null);
});

test('planFoto_ devuelve el plan completo de planTexto_ (respuesta, html, confirmable, preguntas)', () => {
  const plan = planFoto_(datosFoto({}), contexto());
  assert.equal(plan.html, true);
  assert.equal(plan.confirmable, true);
  assert.deepEqual(plan.preguntas, []);
  assert.equal(plan.conteo, null);
  assert.match(plan.respuesta, /^Listo, agregué el gasto a tu reporte\. Estos son los detalles:/);
});

test('planFoto_ con el enlace de la foto en datos confirma con la línea "Foto: ver foto"', () => {
  const datos = datosFoto({ foto: 'https://drive.google.com/abc' });
  const plan = planFoto_(datos, contexto());
  assert.ok(plan.respuesta.includes(lineaFoto_('https://drive.google.com/abc')), plan.respuesta);
  // La línea va debajo de Comentarios, no al final del mensaje.
  assert.ok(plan.respuesta.endsWith('respóndeme "borrar".'), plan.respuesta);
});

test('planFoto_ Supuesto V: la respuesta es la pregunta de las dos fechas', () => {
  const plan = planFoto_(datosFoto({ fecha: '2026-08-15' }), contexto());
  assert.match(plan.respuesta, /^El recibo es del 2026-08-15 pero lo mandaste el 2026-09-27, de otro mes\./);
});

test('planFoto_ sin monto responde la pregunta del monto', () => {
  const plan = planFoto_(datosFoto({ total: null }), contexto());
  assert.deepEqual(plan.preguntas, ['monto']);
  assert.equal(plan.respuesta, '¿Me dices el monto?');
  assert.equal(plan.html, false);
});

test('planFoto_ Supuesto V: recibo de otro mes no escribe nada y pasa fechaDistinta (sin tocar fechaIlegible)', () => {
  const datos = datosFoto({ fecha: '2026-08-15' });
  const { filas, fechaDistinta, fechaIlegible, nombreArchivo } = planFoto_(datos, contexto());
  assert.deepEqual(filas, []);
  assert.deepEqual(fechaDistinta, { fechaRecibo: '2026-08-15', fechaEnvio: '2026-09-27' });
  assert.equal(fechaIlegible, null);
  assert.equal(nombreArchivo, null);
});

test('planFoto_ AE-a: sin fecha legible escribe la fila con la fecha del mensaje y avisa fechaIlegible', () => {
  const datos = datosFoto({ fecha: null });
  const { filas, fechaIlegible } = planFoto_(datos, contexto());
  assert.equal(filas.length, 1);
  assert.equal(filas[0].FECHA, '2026-09-27');
  assert.deepEqual(fechaIlegible, { fechaEnvio: '2026-09-27' });
});

test('planFoto_ sin monto no escribe filas pero sí avisa que la fecha no se leyó', () => {
  // La pregunta de monto se lleva ese aviso: cuando el usuario conteste el monto y las filas se
  // escriban, ahí se le pregunta por la fecha.
  const datos = datosFoto({ fecha: null, total: null });
  const { filas, fechaIlegible, nombreArchivo } = planFoto_(datos, contexto());
  assert.deepEqual(filas, []);
  assert.deepEqual(fechaIlegible, { fechaEnvio: '2026-09-27' });
  assert.equal(nombreArchivo, null);
});

test('planFoto_ arma nombreArchivo con la fecha usada, la descripción corta y el mimeType', () => {
  const { nombreArchivo } = planFoto_(datosFoto({}), contexto());
  assert.equal(nombreArchivo, '2026.09.27 - super whole foods.jpg');
});

test('planFoto_ AE-e: Supuesto AD también aplica en fotos (descripción vacía o igual al proveedor)', () => {
  const datos = datosFoto({
    lineas: [{ tipo: 'ITEM', descripcion: '', monto: 22.5, confianza: 'ALTA' }],
  });
  const { filas } = planFoto_(datos, contexto());
  assert.equal(filas[0]['DESCRIPCIÓN'], 'Agregar descripción');
});

// Fixtures sintéticos: lo que Gemini devolvería (ya limpio por
// leerExtraccion_) para cada tipo de comprobante; ningún dato real.

test('planFoto_ ticket de súper con ITBMS y descuento: una fila con el desglose en sus columnas', () => {
  const datos = datosFoto({
    proveedor: 'Seven 11',
    lineas: [
      { tipo: 'ITEM', descripcion: 'Leche', monto: 20, confianza: 'ALTA' },
      { tipo: 'DESCUENTO', descripcion: 'Ahorro tarjeta', monto: -2, confianza: 'ALTA' },
      { tipo: 'ITBMS', descripcion: 'ITBMS 7%', monto: 1.26, confianza: 'ALTA' },
    ],
    total: 19.26,
  });
  const { filas, preguntas } = planFoto_(datos, contexto());
  assert.equal(filas.length, 1);
  assert.equal(filas[0].TIPO, 'GASTO');
  assert.equal(filas[0]['ARTÍCULOS'], 20);
  // El descuento se guarda en positivo y se resta.
  assert.equal(filas[0]['DESCUENTOS'], 2);
  assert.equal(filas[0].ITBMS, 1.26);
  assert.equal(filas[0]['GASTO (USD)'], 19.26);
  assert.equal(filas[0]['DESCRIPCIÓN'], 'Leche; descuento: Ahorro tarjeta');
  assert.deepEqual(preguntas, []);
});

test('planFoto_ restaurante con propina pagada: la propina va a OTROS CARGOS', () => {
  const datos = datosFoto({
    proveedor: 'Restaurante La Esquina',
    forma_pago: 'TARJETA',
    lineas: [
      { tipo: 'ITEM', descripcion: 'Almuerzo', monto: 30, confianza: 'ALTA' },
      { tipo: 'PROPINA', descripcion: 'Propina 10%', monto: 3, confianza: 'ALTA' },
    ],
    total: 33,
  });
  const { filas } = planFoto_(datos, contexto());
  assert.equal(filas.length, 1);
  assert.equal(filas[0]['ARTÍCULOS'], 30);
  assert.equal(filas[0]['OTROS CARGOS'], 3);
  assert.equal(filas[0]['GASTO (USD)'], 33);
  assert.equal(filas[0]['DESCRIPCIÓN'], 'Almuerzo; Propina 10%');
  assert.equal(filas[0]['FORMA DE PAGO'], 'TARJETA');
});

test('instruccionFoto_ manda la captura de Yappy o la palabra "yappy" a YAPPY, no a TRANSFERENCIA', () => {
  const instruccion = instruccionFoto_(HOY);
  assert.match(instruccion, /Yappy[^.]*YAPPY/);
  assert.match(instruccion, /transferencia ACH[^.]*TRANSFERENCIA/);
});

test('instruccionFoto_ acepta "yappy" mal escrito en la leyenda ("yapi", "yapy", "yappi", "llapi") como YAPPY', () => {
  const instruccion = instruccionFoto_(HOY);
  for (const variante of ['"yapi"', '"yapy"', '"yappi"', '"llapi"']) {
    assert.ok(instruccion.includes(variante), `falta la variante ${variante}`);
  }
  assert.match(instruccion, /mal escrit[^.]*YAPPY/i);
});

test('planFoto_ captura de Yappy: el destinatario es el proveedor y la forma de pago YAPPY', () => {
  const datos = datosFoto({
    tipo_documento: 'OTRO',
    proveedor: 'Juan Jardinero',
    forma_pago: 'YAPPY',
    total: 40,
    clase: 'MAINTENANCE',
  });
  const { filas } = planFoto_(datos, contexto());
  assert.equal(filas.length, 1);
  assert.equal(filas[0].PROVEEDOR, 'Juan Jardinero');
  assert.equal(filas[0]['FORMA DE PAGO'], 'YAPPY');
  assert.equal(filas[0]['GASTO (USD)'], 40);
});

test('planFoto_ recibo en balboas (PAB) va a la par con USD, sin tasa', () => {
  const { filas } = planFoto_(datosFoto({ moneda: 'PAB', total: 12 }), contexto());
  assert.equal(filas[0]['GASTO (USD)'], 12);
  assert.equal(filas[0]['TASA USADA'], '');
});

test('planFoto_ recibo en otra moneda convierte con aUsd y guarda monto original y tasa', () => {
  const llamadas = [];
  const aUsd = (monto, moneda, fecha) => {
    llamadas.push([monto, moneda, fecha]);
    return { gastoUsd: monto / 4000, tasaUsada: 4000 };
  };
  const datos = datosFoto({ proveedor: 'Tienda Bogotá', moneda: 'COP', total: 80000 });
  const { filas } = planFoto_(datos, contexto({ aUsd }));
  assert.equal(filas[0].MONEDA, 'COP');
  assert.equal(filas[0]['GASTO (USD)'], 20);
  assert.equal(filas[0]['MONTO ORIGINAL'], 80000);
  assert.equal(filas[0]['TASA USADA'], 4000);
  assert.deepEqual(llamadas[0], [80000, 'COP', '2026-09-27']);
});

// --- lineaFoto_ / confirmacionFoto_ ---

test('lineaFoto_ arma la línea "Foto:" en negrita con el texto "ver foto" y el enlace escapado', () => {
  const linea = lineaFoto_('https://drive.google.com/file?id=1&x=2');
  assert.equal(
    linea,
    '<b>Foto:</b> <a href="https://drive.google.com/file?id=1&amp;x=2">ver foto</a>',
  );
});

test('confirmacionFoto_ pone la línea de la foto justo debajo de Comentarios', () => {
  const { filas } = planFoto_(datosFoto({}), contexto());
  const texto = confirmacionFoto_(filas, [], contexto(), 'https://drive.google.com/abc');
  const lineas = texto.split('\n');
  const iComentarios = lineas.findIndex((l) => l.startsWith('<b>Comentarios:</b>'));
  assert.equal(lineas[iComentarios + 1],
    '<b>Foto:</b> <a href="https://drive.google.com/abc">ver foto</a>');
  // El cierre fijo sigue siendo lo último del mensaje.
  assert.ok(texto.endsWith('respóndeme "borrar".'), texto);
});
