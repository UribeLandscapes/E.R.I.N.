const test = require('node:test');
const assert = require('node:assert/strict');

// En Apps Script estos nombres son globales; en Node se ponen a mano.
global.MESES = require('../src/Hoja.js').MESES;
Object.assign(global, require('../src/Reglas.js'));
Object.assign(global, require('../src/Extraccion.js'));
global.sinTildes_ = require('../src/Hoja.js').sinTildes_;
global.CONFIG = require('./configPrueba.js').CONFIG;
// Clases.js: la instrucción de los 17 grupos que se le explica a Gemini.
Object.assign(global, require('../src/Clases.js'));

const {
  TEXTO_GEMINI_FALLO, TEXTO_SOLO_TEXTO, TEXTO_SIN_PREGUNTA, TEXTO_FOTO_NO_BAJADA,
  FORMATO_FECHA, FORMATO_SELLO,
  instruccionTexto_, cuerpoTextoGemini_, esSaludoOAyuda_, FRASES_ANIMO, fraseAnimo_,
} = require('../src/Mensajes.js');

const CATEGORIAS = ['GROCERIES', 'MAINTENANCE', 'SERVICES'];
const HOY = '2026-09-27';

test('textos fijos del bot: falla de Gemini, solo texto y sin pregunta abierta', () => {
  assert.equal(TEXTO_GEMINI_FALLO, 'No pude leer tu mensaje ahora. Intenta de nuevo en un rato.');
  // El rechazo de un adjunto sin leer ahora menciona el PDF (ya se lee como foto).
  assert.equal(TEXTO_SOLO_TEXTO, 'Solo leo texto, fotos y PDF. Si es una factura, mándamela como foto o PDF.');
  assert.match(TEXTO_SIN_PREGUNTA, /pregunta/);
});

test('textos fijos de foto del paso 16b: AE-f (no se pudo leer) y falla al bajarla', () => {
    assert.equal(TEXTO_FOTO_NO_BAJADA, 'No pude bajar tu foto de Telegram. Mándala otra vez, por favor.');
});

test('formatos de fecha y sello para Utilities.formatDate', () => {
  assert.equal(FORMATO_FECHA, 'yyyy-MM-dd');
  assert.equal(FORMATO_SELLO, 'yyyyMMdd-HHmmss');
});

test('instruccionTexto_ nombra las intenciones, la fecha de hoy y la lista cerrada', () => {
  const instruccion = instruccionTexto_(HOY);
  ['GASTO', 'DEPOSITO', 'CONTEO', 'SALDO_INICIAL', 'RESPUESTA', 'AYUDA', 'CORREGIR', 'BORRAR', 'OTRO']
    .forEach((intencion) => assert.match(instruccion, new RegExp(intencion)));
  assert.match(instruccion, new RegExp(HOY));
  assert.match(instruccion, /America\/Panama/);
  assert.match(instruccion, /PENDIENTE/);
  assert.match(instruccion, /nunca adivines/i);
  assert.match(instruccion, /null/);
});

test('instruccionTexto_ manda "yappy" a la forma de pago YAPPY, también al corregir', () => {
  const instruccion = instruccionTexto_(HOY);
  assert.match(instruccion, /"15 yappy farmacia"/);
  assert.match(instruccion, /yappy[^.]*YAPPY/i);
  assert.match(instruccion, /"lo pagué por yappy"/);
});

test('instruccionTexto_ acepta "yappy" mal escrito ("yapi", "yapy", "yappi", "llapi") como YAPPY', () => {
  const instruccion = instruccionTexto_(HOY);
  for (const variante of ['"yapi"', '"yapy"', '"yappi"', '"llapi"']) {
    assert.ok(instruccion.includes(variante), `falta la variante ${variante}`);
  }
  assert.match(instruccion, /mal escrit[^.]*YAPPY/i);
});

test('instruccionTexto_ explica los 17 grupos de clase y prefiere el nombre del grupo (Supuesto AB (c))', () => {
  const instruccion = instruccionTexto_(HOY);
  assert.match(instruccion, /17 grupos/);
  assert.match(instruccion, /1\. Supermercado/);
  assert.match(instruccion, /17\. Varios/);
  assert.match(instruccion, /Prefiere el nombre de uno de estos 17 grupos/);
});

test('instruccionPreguntas_ enseña que un tipo de gasto contesta la pregunta de clase', () => {
  const instruccion = instruccionTexto_(HOY, { textos: ['¿Me dices la clase de gasto?'], citado: null });
  assert.match(instruccion, /clase de gasto \(un grupo de la lista o una palabra como "super"\)/);
});

test('instruccionTexto_ explica las dos casas, NORTE y la variante de categoría (Supuesto R confirmado)', () => {
  const instruccion = instruccionTexto_(HOY);
  assert.match(instruccion, /Casa Playa/);
  assert.match(instruccion, /la Casa Norte en la ciudad/);
  assert.match(instruccion, /la Casa Playa en la costa/);
  assert.match(instruccion, /"norte"/);
  assert.match(instruccion, /SECUNDARIA/);
  assert.match(instruccion, /casa/i);
});

test('cuerpoTextoGemini_ arma generateContent con el esquema de extracción e intención', () => {
  const cuerpo = cuerpoTextoGemini_('25 efectivo taxi', CATEGORIAS, HOY);
  assert.deepEqual(cuerpo.systemInstruction, { parts: [{ text: instruccionTexto_(HOY) }] });
  assert.deepEqual(cuerpo.contents, [{ role: 'user', parts: [{ text: '25 efectivo taxi' }] }]);
  assert.equal(cuerpo.generationConfig.responseMimeType, 'application/json');
  const esquema = cuerpo.generationConfig.responseJsonSchema;
  assert.deepEqual(esquema, esquemaExtraccion_(CATEGORIAS, true));
  assert.ok(esquema.properties.intencion);
  assert.deepEqual(esquema.properties.clase.enum, [...CATEGORIAS, 'PENDIENTE']);
});

// --- Preguntas abiertas para Gemini ---

test('instruccionTexto_ sin preguntas abiertas no menciona nada de "preguntas sin contestar"', () => {
  const instruccion = instruccionTexto_(HOY);
  assert.ok(!instruccion.includes('preguntas sin contestar'));
});

test('instruccionTexto_ con preguntas abiertas las lista y explica cómo tratar la respuesta', () => {
  const instruccion = instruccionTexto_(HOY, { textos: ['¿Me dices la fecha?'], citado: null });
  assert.match(instruccion, /preguntas sin contestar/);
  assert.match(instruccion, /¿Me dices la fecha\?/);
  assert.match(instruccion, /RESPUESTA/);
  assert.match(instruccion, new RegExp(HOY));
  assert.match(instruccion, /"26 d esept"/);
});

test('instruccionTexto_ con "Responder" cita el texto del mensaje del bot', () => {
  const instruccion = instruccionTexto_(HOY, { textos: ['la fecha'], citado: '¿Me dices el monto?' });
  assert.match(instruccion, /"Responder"/);
  assert.ok(instruccion.includes('¿Me dices el monto?'));
});

test('cuerpoTextoGemini_ pasa las preguntas abiertas a instruccionTexto_', () => {
  const preguntas = { textos: ['¿Me dices a quién le pagaste?'], citado: null };
  const cuerpo = cuerpoTextoGemini_('hola', CATEGORIAS, HOY, preguntas);
  assert.deepEqual(cuerpo.systemInstruction, { parts: [{ text: instruccionTexto_(HOY, preguntas) }] });
});

// --- Saludos y ayuda sin llamar a Gemini ---

test('esSaludoOAyuda_ reconoce los saludos y las peticiones de ayuda, con o sin tildes y signos', () => {
  ['hola', 'Hola', '  HOLA  ', 'hola!', 'buenas', 'buenos días', 'Buenos dias',
    'buenas tardes', 'buenas noches', '/start', 'ayuda', '/ayuda', '¿ayuda?', '?', '??']
    .forEach((texto) => assert.equal(esSaludoOAyuda_(texto), true, texto));
});

test('esSaludoOAyuda_ no confunde un gasto ni un depósito con un saludo', () => {
  ['25 efectivo taxi', 'me depositaron 250', 'tengo 85', 'hola, gasté 25 en el super',
    'nada', 'saldo inicial 150', '']
    .forEach((texto) => assert.equal(esSaludoOAyuda_(texto), false, texto));
});

test('instruccionTexto_ explica la intención AYUDA con un ejemplo', () => {
  const instruccion = instruccionTexto_(HOY);
  assert.match(instruccion, /- AYUDA:/);
  assert.match(instruccion, /cómo funciona/);
});

// --- Entrada que una corrección tocaría ---

test('instruccionTexto_ sin entrada no habla de la última entrada', () => {
  assert.ok(!instruccionTexto_(HOY).includes('última entrada que el bot registró'));
});

test('instruccionTexto_ con entrada pone sus detalles y cómo corregirla', () => {
  const entrada = {
    proveedor: 'Riba Smith', fecha: '2026-09-26', total: 22.5, forma_pago: 'EFECTIVO',
    clase: 'GROCERIES', casa: 'SECUNDARIA', comentario: 'para la fiesta',
    lineas: [
      { tipo: 'ITEM', descripcion: 'compras', monto: 21 },
      { tipo: 'PROPINA', descripcion: '', monto: 1.5 },
    ],
  };
  const instruccion = instruccionTexto_(HOY, null, entrada);
  assert.match(instruccion, /- proveedor: Riba Smith/);
  assert.match(instruccion, /- fecha: 2026-09-26/);
  assert.match(instruccion, /- total: 22\.5/);
  assert.match(instruccion, /- líneas: ITEM compras 21 \| PROPINA 1\.5/);
  assert.match(instruccion, /- forma de pago: EFECTIVO/);
  assert.match(instruccion, /- clase de gasto: GROCERIES/);
  assert.match(instruccion, /- casa: SECUNDARIA/);
  assert.match(instruccion, /- comentario: para la fiesta/);
  assert.match(instruccion, /usa CORREGIR y llena SOLO lo que cambia/);
});

test('instruccionTexto_ con una entrada a medias dice qué no se sabe', () => {
  const instruccion = instruccionTexto_(HOY, null, { total: null, lineas: [] });
  assert.match(instruccion, /- proveedor: \(sin dato\)/);
  assert.match(instruccion, /- fecha: \(la del mensaje\)/);
  assert.match(instruccion, /- total: \(sin dato\)/);
  assert.match(instruccion, /- líneas: \(una sola\)/);
  assert.match(instruccion, /- forma de pago: DESCONOCIDA/);
  assert.match(instruccion, /- clase de gasto: PENDIENTE/);
  assert.match(instruccion, /- casa: COMPARTIDO/);
  assert.match(instruccion, /- comentario: \(ninguno\)/);
});

test('cuerpoTextoGemini_ pasa la entrada a la instrucción', () => {
  const cuerpo = cuerpoTextoGemini_('corrige el último', CATEGORIAS, HOY, null, { proveedor: 'Riba Smith' });
  assert.match(cuerpo.systemInstruction.parts[0].text, /- proveedor: Riba Smith/);
});

// --- Acuses: ok, listo, está bien, gracias, etc. ---

const { esAcuse_ } = require('../src/Mensajes.js');

test('esAcuse_ reconoce acuses simples: ok, listo, está bien, gracias, etc.', () => {
  ['ok', 'okay', 'oki', 'listo', 'esta bien', 'perfecto', 'gracias', 'muchas gracias',
    'dale', 'bien', 'vale']
    .forEach((texto) => assert.equal(esAcuse_(texto), true, texto));
});

test('esAcuse_ reconoce variaciones con mayúsculas, tildes y puntuación', () => {
  ['OK', 'Ok', 'Listo!', '  listo  ', 'Está bien.', 'GRACIAS!!', 'Muchas gracias,',
    'Vale?', 'perfecto,,,', 'DALE']
    .forEach((texto) => assert.equal(esAcuse_(texto), true, texto));
});

test('esAcuse_ reconoce uno o más 👍 emojis solos', () => {
  ['👍', '👍👍', '👍 ', ' 👍', '👍👍👍']
    .forEach((texto) => assert.equal(esAcuse_(texto), true, texto));
});

test('esAcuse_ rechaza "sí" y "no" aunque sean acuses porque contestan preguntas', () => {
  ['si', 'sí', 'SI', 'SÍ', 'no', 'NO'].forEach((texto) => assert.equal(esAcuse_(texto), false, texto));
});

test('esAcuse_ rechaza acuses con contexto: "ok, gasté 10 en el super"', () => {
  ['ok, gasté 10', 'listo! 25 en el taxi', 'gracias 150 depósito'].forEach((texto) => assert.equal(esAcuse_(texto), false, texto));
});

test('esAcuse_ rechaza texto vacío', () => {
  assert.equal(esAcuse_(''), false);
  assert.equal(esAcuse_('   '), false);
});

test('FRASES_ANIMO tiene exactamente 24 frases', () => {
  assert.equal(FRASES_ANIMO.length, 24);
});

test('FRASES_ANIMO todas son no vacías', () => {
  FRASES_ANIMO.forEach((frase, i) => {
    assert.ok(typeof frase === 'string' && frase.length > 0, `frase ${i} está vacía`);
  });
});

test('FRASES_ANIMO todas llevan la plantilla {nombre}', () => {
  FRASES_ANIMO.forEach((frase, i) => {
    assert.match(frase, /\{nombre\}/, `frase ${i} no lleva {nombre}: ${frase}`);
  });
});

test('fraseAnimo_ pone CONFIG.NOMBRE_USUARIO y no deja la plantilla', () => {
  for (let i = 0; i < FRASES_ANIMO.length; i++) {
    const frase = fraseAnimo_(i);
    assert.ok(frase.includes(CONFIG.NOMBRE_USUARIO), frase);
    assert.ok(!frase.includes('{nombre}'), frase);
  }
});

test('FRASES_ANIMO no tiene duplicados', () => {
  const conjunto = new Set(FRASES_ANIMO);
  assert.equal(conjunto.size, FRASES_ANIMO.length, 'hay frases duplicadas');
});

const conNombre_ = (plantilla) => plantilla.replaceAll('{nombre}', CONFIG.NOMBRE_USUARIO);

test('fraseAnimo_ rota con el índice del mensaje', () => {
  assert.equal(fraseAnimo_(0), conNombre_(FRASES_ANIMO[0]));
  assert.equal(fraseAnimo_(1), conNombre_(FRASES_ANIMO[1]));
  assert.equal(fraseAnimo_(23), conNombre_(FRASES_ANIMO[23]));
  assert.equal(fraseAnimo_(24), conNombre_(FRASES_ANIMO[0])); // vuelve a empezar
  assert.equal(fraseAnimo_(25), conNombre_(FRASES_ANIMO[1]));
  assert.equal(fraseAnimo_(48), conNombre_(FRASES_ANIMO[0])); // 48 % 24 = 0
});

test('fraseAnimo_ devuelve la primera frase para IDs inválidos', () => {
  assert.equal(fraseAnimo_(undefined), conNombre_(FRASES_ANIMO[0]));
  assert.equal(fraseAnimo_(NaN), conNombre_(FRASES_ANIMO[0]));
  assert.equal(fraseAnimo_(-1), conNombre_(FRASES_ANIMO[0]));
  assert.equal(fraseAnimo_(-100), conNombre_(FRASES_ANIMO[0]));
  assert.equal(fraseAnimo_('texto'), conNombre_(FRASES_ANIMO[0]));
  assert.equal(fraseAnimo_(null), conNombre_(FRASES_ANIMO[0]));
});

const { esBorrarSolo_ } = require('../src/Mensajes.js');

test('esBorrarSolo_ reconoce palabras de borrar solas: borrar, borra, elimina, etc.', () => {
  ['borrar', 'borra', 'borralo', 'borrala', 'borrarlo', 'borrarla',
    'elimina', 'eliminar', 'eliminalo', 'eliminala', 'eliminarlo', 'eliminarla']
    .forEach((texto) => assert.equal(esBorrarSolo_(texto), true, texto));
});

test('esBorrarSolo_ reconoce variaciones con mayúsculas, tildes y puntuación', () => {
  ['Bórralo!', ' BORRAR. ', 'Borra?', 'Eliminalo!!', '  borrar  ']
    .forEach((texto) => assert.equal(esBorrarSolo_(texto), true, texto));
});

test('esBorrarSolo_ rechaza texto con más palabras: "borrar el último", "borrar y anota 20"', () => {
  ['borrar el último', 'borra el de ayer', 'borrar y anota 20', 'no borrar']
    .forEach((texto) => assert.equal(esBorrarSolo_(texto), false, texto));
});

test('esBorrarSolo_ rechaza texto vacío y otras palabras sueltas', () => {
  assert.equal(esBorrarSolo_(''), false);
  assert.equal(esBorrarSolo_('   '), false);
  assert.equal(esBorrarSolo_('sí'), false);
  assert.equal(esBorrarSolo_('no'), false);
  assert.equal(esBorrarSolo_('ok'), false);
});
