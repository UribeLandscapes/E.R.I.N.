const test = require('node:test');
const assert = require('node:assert/strict');

// En Apps Script CONFIG es global; en Node se pone a mano con la configuración falsa de prueba.
global.CONFIG = require('./configPrueba.js').CONFIG;

// En Apps Script estos nombres son globales; en Node se ponen a mano.
Object.assign(global, require('../src/Hoja.js'), require('../src/Moneda.js'));
Object.assign(global, require('../src/Hoja.js'));
Object.assign(global, require('../src/Reglas.js'));
Object.assign(global, require('../src/Escritura.js'));
Object.assign(global, require('../src/Clases.js'));
Object.assign(global, require('../src/Texto.js'));
Object.assign(global, require('../src/Confirmacion.js'));
// Foto.js: lineaFoto_ arma la línea "Foto: ver foto" que va debajo de Comentarios.
Object.assign(global, require('../src/Foto.js'));

const {
  textoConfirmacion_, resumenEntrada_, textoPedirBorrado_, TEXTO_CIERRE_CONFIRMACION,
} = require('../src/Confirmacion.js');

// Una fila por factura: el desglose vive en la misma fila y GASTO (USD) ya es el total.
const ITEM = Object.freeze({
  FECHA: '2026-09-26',
  'ID FACTURA': 'RIBASMITH-20260926',
  TIPO: 'GASTO',
  PROVEEDOR: 'Riba Smith',
  'DESCRIPCIÓN': 'Supermercado',
  'DEPÓSITO': '',
  'ARTÍCULOS': 21,
  'DESCUENTOS': '',
  ITBMS: '',
  'OTROS CARGOS': '',
  'GASTO (USD)': 21,
  MONEDA: 'USD',
  'FORMA DE PAGO': '',
  'CLASE DE GASTO': 'GROCERIES',
  COMENTARIOS: '',
  REVISAR: '',
  CASA: 'COMPARTIDO',
  ORIGEN: 'BOT',
  'ID MENSAJE TG': 501,
});
// La misma factura con propina: una sola fila, la propina en OTROS CARGOS.
const CON_PROPINA = Object.freeze({
  ...ITEM, 'DESCRIPCIÓN': 'Supermercado; propina', 'OTROS CARGOS': 1.5, 'GASTO (USD)': 22.5,
});
const DEPOSITO = Object.freeze({
  FECHA: '2026-09-26',
  'ID FACTURA': 'DEPOSITO-20260926',
  TIPO: 'DEPÓSITO',
  PROVEEDOR: 'Beto',
  'DESCRIPCIÓN': '',
  'DEPÓSITO': 500,
  'GASTO (USD)': '',
  MONEDA: 'USD',
  'FORMA DE PAGO': '',
  'CLASE DE GASTO': '',
  COMENTARIOS: '',
  REVISAR: '',
  CASA: 'COMPARTIDO',
  ORIGEN: 'BOT',
  'ID MENSAJE TG': 501,
});

const CIERRE = [
  '',
  '',
  '¿Algo está mal? Respóndeme a este mensaje con el cambio, por ejemplo:',
  '"la forma de pago es tarjeta", "el proveedor es Super 99", "comentario: para la fiesta".',
  'Si no debí anotarlo, respóndeme "borrar".',
].join('\n');

test('el cierre aprobado es el texto (a) del Supuesto AA', () => {
  assert.equal(TEXTO_CIERRE_CONFIRMACION, CIERRE.slice(2));
});

test('confirmación de una factura con desglose: texto (a) del Supuesto AA, sin "Total factura"', () => {
  const texto = textoConfirmacion_({ filas: [CON_PROPINA] });
  assert.equal(texto, [
    'Listo, agregué el gasto a tu reporte. Estos son los detalles:',
    '<b>Fecha:</b> 26/09/2026',
    '<b>Proveedor:</b> Riba Smith',
    '<b>Descripción:</b> Supermercado; propina',
    '<b>Gasto:</b> 22.50',
    '<b>Desglose:</b> artículos 21.00, otros cargos 1.50',
    '<b>Forma de pago:</b> (no indicada)',
    '<b>Clase de gasto:</b> GROCERIES',
    '<b>Casa:</b> Compartido',
    '<b>Comentarios:</b> (ninguno)',
  ].join('\n') + CIERRE);
});

test('la descripción es la de la fila y no repite el monto (ya sale en "Gasto")', () => {
  const texto = textoConfirmacion_({ filas: [ITEM] });
  assert.match(texto, /^<b>Descripción:<\/b> Supermercado$/m);
});

test('sin nada más que artículos no se muestra la línea "Desglose"', () => {
  const texto = textoConfirmacion_({ filas: [ITEM] });
  assert.ok(!texto.includes('Desglose'), texto);
});

test('el desglose nombra las cuatro partes, resta los descuentos y omite las que son cero', () => {
  const fila = {
    ...ITEM, 'ARTÍCULOS': 1.55, 'DESCUENTOS': 0.39, ITBMS: 0.11, 'OTROS CARGOS': '', 'GASTO (USD)': 1.27,
  };
  const texto = textoConfirmacion_({ filas: [fila] });
  assert.match(texto, /^<b>Desglose:<\/b> artículos 1\.55, descuentos −0\.39, ITBMS 0\.11$/m);
});

test('un gasto que es solo propina se desglosa sin hablar de artículos', () => {
  const fila = {
    ...ITEM, 'DESCRIPCIÓN': 'propina', 'ARTÍCULOS': '', 'OTROS CARGOS': 25, 'GASTO (USD)': 25,
  };
  assert.match(textoConfirmacion_({ filas: [fila] }), /^<b>Desglose:<\/b> otros cargos 25\.00$/m);
});

test('la línea de la foto va justo debajo de Comentarios', () => {
  const texto = textoConfirmacion_({ filas: [ITEM], foto: 'https://drive.google.com/file/d/abc/view' });
  const lineas = texto.split('\n');
  const iComentarios = lineas.findIndex((l) => l.startsWith('<b>Comentarios:</b>'));
  assert.equal(lineas[iComentarios + 1],
    '<b>Foto:</b> <a href="https://drive.google.com/file/d/abc/view">ver foto</a>');
});

test('sin foto no hay línea de foto', () => {
  assert.ok(!textoConfirmacion_({ filas: [ITEM] }).includes('Foto:'));
});

test('confirmación de un depósito: solo fecha, De, depósito, casa y comentarios (texto b), con negrita', () => {
  const texto = textoConfirmacion_({ filas: [DEPOSITO] });
  assert.equal(texto, [
    'Listo, agregué el depósito a tu reporte. Estos son los detalles:',
    '<b>Fecha:</b> 26/09/2026',
    '<b>De:</b> Beto',
    '<b>Depósito:</b> 500.00',
    '<b>Casa:</b> Compartido',
    '<b>Comentarios:</b> (ninguno)',
  ].join('\n') + CIERRE);
});

test('la casa y los comentarios que el usuario dio se muestran como están', () => {
  const fila = { ...DEPOSITO, CASA: 'SECUNDARIA', COMENTARIOS: 'para la fiesta' };
  const texto = textoConfirmacion_({ filas: [fila] });
  assert.match(texto, /^<b>Casa:<\/b> Casa Playa$/m);
  assert.match(texto, /^<b>Comentarios:<\/b> para la fiesta$/m);
});

test('la forma de pago y la clase que el usuario dio se muestran como están', () => {
  const texto = textoConfirmacion_({ filas: [{ ...ITEM, 'FORMA DE PAGO': 'TARJETA' }] });
  assert.match(texto, /^<b>Forma de pago:<\/b> TARJETA$/m);
  assert.match(texto, /^<b>Clase de gasto:<\/b> GROCERIES$/m);
});

test('"(falta)" solo en los datos que el bot preguntó (ajuste c)', () => {
  const fila = { ...ITEM, PROVEEDOR: 'PENDIENTE', 'CLASE DE GASTO': 'PENDIENTE' };
  const texto = textoConfirmacion_({
    filas: [fila],
    preguntas: ['proveedor', 'clase'],
    pregunta: '¿Me dices a quién le pagaste y la clase de gasto?',
  });
  assert.match(texto, /^<b>Proveedor:<\/b> \(falta\)$/m);
  assert.match(texto, /^<b>Clase de gasto:<\/b> \(falta\)$/m);
  // Los opcionales vacíos nunca dicen "(falta)".
  assert.match(texto, /^<b>Forma de pago:<\/b> \(no indicada\)$/m);
  assert.match(texto, /^<b>Comentarios:<\/b> \(ninguno\)$/m);
});

test('la pregunta de lo que falta va al final del mismo mensaje', () => {
  const texto = textoConfirmacion_({
    filas: [ITEM],
    preguntas: ['clase'],
    pregunta: '¿Me dices la clase de gasto?',
  });
  assert.ok(texto.endsWith('\n\n¿Me dices la clase de gasto?'), texto);
});

test('sin preguntas el mensaje termina en el cierre', () => {
  assert.ok(textoConfirmacion_({ filas: [ITEM] }).endsWith('respóndeme "borrar".'));
});

test('la pregunta de fecha sale como "(falta)"; con el total en duda el gasto avisa lo que asumí', () => {
  const texto = textoConfirmacion_({
    filas: [ITEM],
    preguntas: ['fecha', 'total'],
    pregunta: '¿Me dices la fecha y el total de la factura?',
  });
  assert.match(texto, /^<b>Fecha:<\/b> \(falta\)$/m);
  assert.ok(!texto.includes('Total factura'), texto);
  assert.match(texto,
    /^<b>Gasto:<\/b> 21\.00 \(no estoy seguro del total: asumí 21\.00, confírmame cuánto es\)$/m);
});

test('sin pregunta de total el gasto sale solo, sin aviso de duda', () => {
  const texto = textoConfirmacion_({ filas: [ITEM], preguntas: ['proveedor'], pregunta: '¿A quién le pagaste?' });
  assert.match(texto, /^<b>Gasto:<\/b> 21\.00$/m);
});

test('el aviso de total en duda también dice la moneda en que se pagó', () => {
  const fila = { ...ITEM, MONEDA: 'COP', 'ARTÍCULOS': 22.5, 'GASTO (USD)': 22.5 };
  const texto = textoConfirmacion_({ filas: [fila], preguntas: ['total'], pregunta: '¿Y el total?' });
  assert.match(texto,
    /^<b>Gasto:<\/b> 22\.50 USD \(pagado en COP\) \(no estoy seguro del total: asumí 22\.50, confírmame cuánto es\)$/m);
});

test('la pregunta de depositante deja "De: (falta)" en un depósito', () => {
  const texto = textoConfirmacion_({ filas: [DEPOSITO], preguntas: ['depositante'], pregunta: '¿Quién hizo el depósito?' });
  assert.match(texto, /^<b>De:<\/b> \(falta\)$/m);
});

test('una descripción vacía no se inventa (la fila siempre trae la suya)', () => {
  const texto = textoConfirmacion_({ filas: [{ ...ITEM, 'DESCRIPCIÓN': '' }] });
  assert.match(texto, /^<b>Descripción:<\/b> $/m);
});

test('un gasto en otra moneda dice el total en USD y en qué moneda se pagó', () => {
  const fila = { ...ITEM, MONEDA: 'COP', 'ARTÍCULOS': 22.5, 'GASTO (USD)': 22.5 };
  const texto = textoConfirmacion_({ filas: [fila] });
  assert.match(texto, /^<b>Gasto:<\/b> 22\.50 USD \(pagado en COP\)$/m);
});

test('un gasto sin tasa avisa que el monto queda pendiente', () => {
  const fila = { ...ITEM, MONEDA: 'COP', 'ARTÍCULOS': 'PENDIENTE', 'GASTO (USD)': 'PENDIENTE' };
  const texto = textoConfirmacion_({ filas: [fila] });
  assert.match(texto, /^<b>Gasto:<\/b> \(pendiente de la tasa\)$/m);
  assert.ok(!texto.includes('Desglose'), texto);
});

test('una FECHA que llega como Date (getValues) se muestra en DD/MM/AAAA', () => {
  const texto = textoConfirmacion_({ filas: [{ ...ITEM, FECHA: new Date(2026, 8, 26) }] });
  assert.match(texto, /^<b>Fecha:<\/b> 26\/09\/2026$/m);
});

test('la corrección usa el encabezado del texto (d)', () => {
  assert.match(textoConfirmacion_({ filas: [ITEM], corregido: true }),
    /^Listo, corregí el gasto\. Así quedó:$/m);
  assert.match(textoConfirmacion_({ filas: [DEPOSITO], corregido: true }),
    /^Listo, corregí el depósito\. Así quedó:$/m);
});

test('resumenEntrada_ guarda lo mínimo para la pregunta de borrar', () => {
  assert.deepEqual(resumenEntrada_([CON_PROPINA]),
    { tipo: 'gasto', proveedor: 'Riba Smith', monto: 22.5, fecha: '2026-09-26' });
  assert.deepEqual(resumenEntrada_([DEPOSITO]),
    { tipo: 'deposito', proveedor: 'Beto', monto: 500, fecha: '2026-09-26' });
});

test('resumenEntrada_ toma el GASTO (USD) de la fila, que ya es el total', () => {
  assert.equal(resumenEntrada_([ITEM]).monto, 21);
});

test('resumenEntrada_ deja el monto en null si no se puede sumar', () => {
  const sinTasa = { ...ITEM, 'GASTO (USD)': '' };
  assert.equal(resumenEntrada_([sinTasa]).monto, null);
});

test('textoPedirBorrado_ es el texto (e) del Supuesto AA', () => {
  assert.equal(textoPedirBorrado_(resumenEntrada_([CON_PROPINA])),
    '¿Segura que quieres borrar el gasto de Riba Smith por 22.50 del 26/09/2026?');
  assert.equal(textoPedirBorrado_(resumenEntrada_([DEPOSITO])),
    '¿Segura que quieres borrar el depósito de Beto por 500.00 del 26/09/2026?');
});

test('textoPedirBorrado_ aguanta un resumen incompleto', () => {
  assert.equal(textoPedirBorrado_({ tipo: 'gasto', proveedor: '', monto: null, fecha: '' }),
    '¿Segura que quieres borrar el gasto?');
});

test('textoPedirBorrado_ omite el proveedor cuando quedó PENDIENTE (defecto E)', () => {
  const SIN_PROVEEDOR = { ...ITEM, PROVEEDOR: MARCA_PENDIENTE, 'ARTÍCULOS': 25, 'GASTO (USD)': 25, FECHA: '2026-09-27' };
  assert.equal(textoPedirBorrado_(resumenEntrada_([SIN_PROVEEDOR])),
    '¿Segura que quieres borrar el gasto por 25.00 del 27/09/2026?');
});

test('una fila sin moneda ni casa no inventa nada', () => {
  const texto = textoConfirmacion_({ filas: [{ ...ITEM, MONEDA: '', CASA: '' }] });
  assert.match(texto, /^<b>Gasto:<\/b> 21\.00$/m);
  assert.match(texto, /^<b>Casa:<\/b> $/m);
});

// --- Escapado HTML (Bot API 10.3, parse_mode HTML: &, < y > deben ir como entidades) ---

test('el texto del usuario se escapa: "<b>" y "&" no rompen el HTML', () => {
  const fila = { ...ITEM, PROVEEDOR: 'Tom & Jerry', COMENTARIOS: 'precio <b>rebajado</b> & bueno' };
  const texto = textoConfirmacion_({ filas: [fila] });
  assert.match(texto, /^<b>Proveedor:<\/b> Tom &amp; Jerry$/m);
  assert.match(texto, /^<b>Comentarios:<\/b> precio &lt;b&gt;rebajado&lt;\/b&gt; &amp; bueno$/m);
});

test('una clase con "&" (GAS & OIL) se escapa en la confirmación', () => {
  const texto = textoConfirmacion_({ filas: [{ ...ITEM, 'CLASE DE GASTO': 'GAS & OIL' }] });
  assert.match(texto, /^<b>Clase de gasto:<\/b> GAS &amp; OIL$/m);
});

test('la pregunta al final también se escapa (por ejemplo, una lista con "&")', () => {
  const texto = textoConfirmacion_({
    filas: [ITEM],
    preguntas: ['clase'],
    pregunta: '¿Me dices la clase? 3. GAS & OIL',
  });
  assert.ok(texto.endsWith('¿Me dices la clase? 3. GAS &amp; OIL'), texto);
});

test('solo los títulos llevan HTML sin escapar; el resto del mensaje no trae otras etiquetas', () => {
  const texto = textoConfirmacion_({ filas: [ITEM] });
  const sinTitulos = texto.replace(/<b>[^<]*<\/b>/g, '');
  assert.ok(!/[<>]/.test(sinTitulos), sinTitulos);
});
