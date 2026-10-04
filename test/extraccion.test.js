const test = require('node:test');
const assert = require('node:assert/strict');

global.leerFecha_ = require('../src/Reglas.js').leerFecha_;
const {
  NIVELES_CONFIANZA, INTENCIONES, CASAS, esquemaExtraccion_, leerExtraccion_, camposDudosos_, debeReleer_,
} = require('../src/Extraccion.js');

const CATEGORIAS = ['GROCERIES', 'MEDS', 'POLLOS  DE PASTOREO'];

function respuesta(datos, extra = {}) {
  const texto = typeof datos === 'string' ? datos : JSON.stringify(datos);
  return { candidates: [{ content: { parts: [{ text: texto }] }, finishReason: 'STOP', ...extra }] };
}

function extraccionBuena(cambios = {}) {
  return {
    legible: true,
    tipo_documento: 'TICKET',
    proveedor: 'Whole Foods',
    fecha: '2026-07-03',
    moneda: 'USD',
    forma_pago: 'TARJETA',
    lineas: [
      { tipo: 'ITEM', descripcion: 'Leche', monto: 1.55, confianza: 'ALTA' },
      { tipo: 'DESCUENTO', descripcion: 'Promo', monto: 0.39, confianza: 'ALTA' },
    ],
    total: 1.16,
    clase: 'GROCERIES',
    casa: null,
    comentario: null,
    descripcion_corta: 'leche whole foods',
    confianza: { proveedor: 'ALTA', fecha: 'ALTA', moneda: 'ALTA', total: 'ALTA', clase: 'MEDIA' },
    ...cambios,
  };
}

// --- Esquema ---

test('esquemaExtraccion_ cierra clase a la lista actual + PENDIENTE, sin repetidos y tal cual', () => {
  const esquema = esquemaExtraccion_([...CATEGORIAS, 'MEDS', 'PENDIENTE'], false);
  assert.deepEqual(esquema.properties.clase.enum, ['GROCERIES', 'MEDS', 'POLLOS  DE PASTOREO', 'PENDIENTE']);
});

test('esquemaExtraccion_ sin categorías solo permite PENDIENTE', () => {
  assert.deepEqual(esquemaExtraccion_([], false).properties.clase.enum, ['PENDIENTE']);
});

test('esquemaExtraccion_ trae los campos de la pieza 4, todos obligatorios', () => {
  const esquema = esquemaExtraccion_(CATEGORIAS, false);
  const campos = ['legible', 'tipo_documento', 'proveedor', 'fecha', 'moneda', 'forma_pago', 'lineas',
    'total', 'clase', 'casa', 'comentario', 'descripcion_corta', 'confianza'];
  assert.equal(esquema.type, 'object');
  assert.deepEqual(Object.keys(esquema.properties), campos);
  assert.deepEqual(esquema.required, campos);
  assert.deepEqual(esquema.properties.forma_pago.enum, ['EFECTIVO', 'TRANSFERENCIA', 'YAPPY', 'TARJETA', 'DESCONOCIDA']);
  assert.deepEqual(esquema.properties.fecha.type, ['string', 'null']);
  assert.equal(esquema.properties.fecha.format, 'date');
  assert.deepEqual(esquema.properties.total.type, ['number', 'null']);
  assert.deepEqual(esquema.properties.casa.type, ['string', 'null']);
  assert.deepEqual(esquema.properties.casa.enum, [...CASAS, null]);
  assert.deepEqual(esquema.properties.comentario.type, ['string', 'null']);
  assert.deepEqual(CASAS, ['PRINCIPAL', 'SECUNDARIA']);
  const linea = esquema.properties.lineas.items;
  assert.deepEqual(linea.properties.tipo.enum, ['ITEM', 'ITBMS', 'DESCUENTO', 'PROPINA', 'OTROS']);
  assert.deepEqual(linea.properties.monto.type, ['number', 'null']);
  assert.deepEqual(linea.properties.confianza.enum, NIVELES_CONFIANZA);
  assert.deepEqual(linea.required, ['tipo', 'descripcion', 'monto', 'confianza']);
  const porCampo = esquema.properties.confianza;
  assert.deepEqual(Object.keys(porCampo.properties), ['proveedor', 'fecha', 'moneda', 'total', 'clase']);
  assert.deepEqual(porCampo.properties.total.enum, NIVELES_CONFIANZA);
});

test('esquemaExtraccion_ agrega intención solo para texto libre', () => {
  assert.equal(esquemaExtraccion_(CATEGORIAS, false).properties.intencion, undefined);
  const conIntencion = esquemaExtraccion_(CATEGORIAS, true);
  assert.deepEqual(conIntencion.properties.intencion.enum, INTENCIONES);
  assert.deepEqual(INTENCIONES, ['GASTO', 'DEPOSITO', 'CONTEO', 'SALDO_INICIAL', 'RESPUESTA', 'AYUDA',
    'CORREGIR', 'BORRAR', 'OTRO']);
  assert.ok(conIntencion.required.includes('intencion'));
});

// En texto libre (conIntencion), la descripción de la línea debe ser corta
// y sin montos/moneda/forma de pago/proveedor; la foto (conIntencion=false) no cambia.
test('esquemaExtraccion_ pide una descripción corta solo para texto libre; la foto no cambia', () => {
  const foto = esquemaExtraccion_(CATEGORIAS, false).properties.lineas.items.properties.descripcion;
  assert.equal(foto.description, 'Texto de la línea tal como se lee');
  const texto = esquemaExtraccion_(CATEGORIAS, true).properties.lineas.items.properties.descripcion;
  assert.match(texto.description, /2 a 4 palabras/);
  assert.doesNotMatch(texto.description, /tal como se lee/);
});

test('esquemaExtraccion_ solo usa palabras de JSON Schema que Gemini acepta', () => {
  const permitidas = new Set(['type', 'properties', 'required', 'items', 'enum', 'format', 'description',
    'minimum', 'maximum', 'anyOf', 'title', 'minItems', 'maxItems', 'additionalProperties']);
  const revisar = (nodo) => {
    for (const [clave, valor] of Object.entries(nodo)) {
      assert.ok(permitidas.has(clave), clave);
      if (clave === 'properties') Object.values(valor).forEach(revisar);
      if (clave === 'items') revisar(valor);
    }
  };
  revisar(esquemaExtraccion_(CATEGORIAS, true));
});

// --- Lectura: errores de la respuesta ---

test('leerExtraccion_ rechaza un prompt bloqueado', () => {
  const r = leerExtraccion_({ promptFeedback: { blockReason: 'SAFETY' } }, CATEGORIAS);
  assert.deepEqual(r, { ok: false, motivo: 'bloqueado: SAFETY' });
});

test('leerExtraccion_ rechaza respuestas sin candidatos, cortadas, vacías o sin JSON', () => {
  assert.deepEqual(leerExtraccion_({}, CATEGORIAS), { ok: false, motivo: 'sin candidatos' });
  assert.deepEqual(leerExtraccion_(null, CATEGORIAS), { ok: false, motivo: 'sin candidatos' });
  assert.deepEqual(leerExtraccion_(respuesta('{"legible":', { finishReason: 'MAX_TOKENS' }), CATEGORIAS),
    { ok: false, motivo: 'finishReason MAX_TOKENS' });
  assert.deepEqual(leerExtraccion_({ candidates: [{ finishReason: 'STOP' }] }, CATEGORIAS),
    { ok: false, motivo: 'respuesta sin texto' });
  assert.deepEqual(leerExtraccion_(respuesta('no es json'), CATEGORIAS), { ok: false, motivo: 'el texto no es JSON' });
  assert.deepEqual(leerExtraccion_(respuesta('[1,2]'), CATEGORIAS), { ok: false, motivo: 'forma inesperada' });
  assert.deepEqual(leerExtraccion_(respuesta('null'), CATEGORIAS), { ok: false, motivo: 'forma inesperada' });
  assert.deepEqual(leerExtraccion_(respuesta({ proveedor: 'x' }), CATEGORIAS), { ok: false, motivo: 'forma inesperada' });
});

test('leerExtraccion_ ignora partes de pensamiento y une el texto', () => {
  const texto = JSON.stringify(extraccionBuena());
  const r = leerExtraccion_({
    candidates: [{
      finishReason: 'STOP',
      content: { parts: [{ text: 'pensando…', thought: true }, { text: texto.slice(0, 10) }, { text: texto.slice(10) }] },
    }],
  }, CATEGORIAS);
  assert.equal(r.ok, true);
});

// --- Lectura: normalización de campos ---

test('leerExtraccion_ devuelve los datos limpios de una factura normal', () => {
  const r = leerExtraccion_(respuesta(extraccionBuena()), CATEGORIAS);
  assert.equal(r.ok, true);
  assert.equal(r.datos.proveedor, 'Whole Foods');
  assert.equal(r.datos.fecha, '2026-07-03');
  assert.equal(r.datos.moneda, 'USD');
  assert.equal(r.datos.clase, 'GROCERIES');
  assert.equal(r.datos.total, 1.16);
  assert.equal(r.datos.intencion, undefined);
});

test('leerExtraccion_ fuerza DESCUENTO a negativo, venga como venga', () => {
  const lineas = [
    { tipo: 'DESCUENTO', descripcion: 'a', monto: 0.39, confianza: 'ALTA' },
    { tipo: 'DESCUENTO', descripcion: 'b', monto: -0.5, confianza: 'ALTA' },
    { tipo: 'DESCUENTO', descripcion: 'c', monto: null, confianza: 'BAJA' },
  ];
  const r = leerExtraccion_(respuesta(extraccionBuena({ lineas })), CATEGORIAS);
  assert.deepEqual(r.datos.lineas.map((l) => l.monto), [-0.39, -0.5, null]);
});

test('leerExtraccion_ manda a PENDIENTE una clase fuera de la lista (nunca crea categorías)', () => {
  for (const clase of ['GROCERIES W9', 'pollos de pastoreo', '', null]) {
    const r = leerExtraccion_(respuesta(extraccionBuena({ clase })), CATEGORIAS);
    assert.equal(r.datos.clase, 'PENDIENTE', String(clase));
  }
  const exacta = leerExtraccion_(respuesta(extraccionBuena({ clase: 'POLLOS  DE PASTOREO' })), CATEGORIAS);
  assert.equal(exacta.datos.clase, 'POLLOS  DE PASTOREO');
});

test('leerExtraccion_ deja null fecha inválida, moneda no ISO, proveedor vacío y montos no numéricos', () => {
  const r = leerExtraccion_(respuesta(extraccionBuena({
    fecha: '03/07/2026', moneda: 'pesos', proveedor: '   ', total: '1.16',
    lineas: [{ tipo: 'ITEM', descripcion: 'x', monto: 'uno', confianza: 'ALTA' }],
  })), CATEGORIAS);
  assert.equal(r.datos.fecha, null);
  assert.equal(r.datos.moneda, null);
  assert.equal(r.datos.proveedor, null);
  assert.equal(r.datos.total, null);
  assert.equal(r.datos.lineas[0].monto, null);
});

test('leerExtraccion_ pasa la moneda a mayúsculas y limpia espacios', () => {
  const r = leerExtraccion_(respuesta(extraccionBuena({ moneda: ' cop ', proveedor: ' Séven 11 ' })), CATEGORIAS);
  assert.equal(r.datos.moneda, 'COP');
  assert.equal(r.datos.proveedor, 'Séven 11');
});

test('leerExtraccion_ corrige valores fuera de enum a su opción prudente', () => {
  const r = leerExtraccion_(respuesta(extraccionBuena({
    tipo_documento: 'PAPIRO',
    forma_pago: 'BITCOIN',
    lineas: [{ tipo: 'RARO', descripcion: 5, monto: 2, confianza: 'SEGURA' }],
    confianza: { proveedor: 'ALTA' },
    descripcion_corta: null,
  })), CATEGORIAS);
  assert.equal(r.datos.tipo_documento, 'OTRO');
  assert.equal(r.datos.forma_pago, 'DESCONOCIDA');
  assert.deepEqual(r.datos.lineas[0], { tipo: 'OTROS', descripcion: '', monto: 2, confianza: 'BAJA' });
  assert.deepEqual(r.datos.confianza, { proveedor: 'ALTA', fecha: 'BAJA', moneda: 'BAJA', total: 'BAJA', clase: 'BAJA' });
  assert.equal(r.datos.descripcion_corta, '');
});

test('leerExtraccion_ tolera lineas que no son arreglo o traen basura', () => {
  const r = leerExtraccion_(respuesta(extraccionBuena({ lineas: 'nada' })), CATEGORIAS);
  assert.deepEqual(r.datos.lineas, []);
  const r2 = leerExtraccion_(respuesta(extraccionBuena({ lineas: [null, 3] })), CATEGORIAS);
  assert.equal(r2.datos.lineas.length, 2);
  assert.deepEqual(r2.datos.lineas[0], { tipo: 'OTROS', descripcion: '', monto: null, confianza: 'BAJA' });
});

test('leerExtraccion_ lee la intención del texto libre, OTRO si no es válida', () => {
  const r = leerExtraccion_(respuesta(extraccionBuena({ intencion: 'DEPOSITO' })), CATEGORIAS, true);
  assert.equal(r.datos.intencion, 'DEPOSITO');
  const mala = leerExtraccion_(respuesta(extraccionBuena({ intencion: 'ROBO' })), CATEGORIAS, true);
  assert.equal(mala.datos.intencion, 'OTRO');
});

// --- Casa ---

test('leerExtraccion_ deja casa null cuando Gemini no la manda o no dice ninguna', () => {
  const r = leerExtraccion_(respuesta(extraccionBuena()), CATEGORIAS);
  assert.equal(r.datos.casa, null);
});

test('leerExtraccion_ acepta PRINCIPAL o SECUNDARIA en casa', () => {
  const principal = leerExtraccion_(respuesta(extraccionBuena({ casa: 'PRINCIPAL' })), CATEGORIAS);
  assert.equal(principal.datos.casa, 'PRINCIPAL');
  const playa = leerExtraccion_(respuesta(extraccionBuena({ casa: 'SECUNDARIA' })), CATEGORIAS);
  assert.equal(playa.datos.casa, 'SECUNDARIA');
});

test('leerExtraccion_ manda a null cualquier valor de casa fuera de PRINCIPAL/SECUNDARIA (nunca adivina)', () => {
  for (const casa of ['COMPARTIDO', 'NORTE', 'otra cosa', '']) {
    const r = leerExtraccion_(respuesta(extraccionBuena({ casa })), CATEGORIAS);
    assert.equal(r.datos.casa, null, String(casa));
  }
});

// --- Campos dudosos y relectura ---

test('camposDudosos_ no marca nada en una factura clara', () => {
  const { datos } = leerExtraccion_(respuesta(extraccionBuena()), CATEGORIAS);
  assert.deepEqual(camposDudosos_(datos), []);
});

test('camposDudosos_ marca confianza BAJA, valores null, clase PENDIENTE y líneas dudosas', () => {
  const { datos } = leerExtraccion_(respuesta(extraccionBuena({
    proveedor: null,
    fecha: null,
    total: null,
    clase: 'OTRA',
    confianza: { proveedor: 'ALTA', fecha: 'ALTA', moneda: 'BAJA', total: 'ALTA', clase: 'ALTA' },
    lineas: [
      { tipo: 'ITEM', descripcion: 'a', monto: 1, confianza: 'ALTA' },
      { tipo: 'ITEM', descripcion: 'b', monto: null, confianza: 'ALTA' },
      { tipo: 'ITEM', descripcion: 'c', monto: 2, confianza: 'BAJA' },
    ],
  })), CATEGORIAS);
  assert.deepEqual(camposDudosos_(datos), ['proveedor', 'fecha', 'moneda', 'total', 'clase', 'linea 2', 'linea 3']);
});

test('debeReleer_ solo en foto manuscrita con campos dudosos', () => {
  const dudosa = { fecha: null };
  const manuscrita = leerExtraccion_(respuesta(extraccionBuena({ tipo_documento: 'MANUSCRITO', ...dudosa })), CATEGORIAS).datos;
  const ticket = leerExtraccion_(respuesta(extraccionBuena(dudosa)), CATEGORIAS).datos;
  const clara = leerExtraccion_(respuesta(extraccionBuena({ tipo_documento: 'MANUSCRITO' })), CATEGORIAS).datos;
  assert.equal(debeReleer_(manuscrita), true);
  assert.equal(debeReleer_(ticket), false);
  assert.equal(debeReleer_(clara), false);
});

test('leerExtraccion_ lee el comentario y lo deja en null si no hay', () => {
  const con = leerExtraccion_(respuesta(extraccionBuena({ comentario: '  para la fiesta ' })), CATEGORIAS);
  assert.equal(con.datos.comentario, 'para la fiesta');
  const sin = leerExtraccion_(respuesta(extraccionBuena({ comentario: '   ' })), CATEGORIAS);
  assert.equal(sin.datos.comentario, null);
  const raro = leerExtraccion_(respuesta(extraccionBuena({ comentario: 7 })), CATEGORIAS);
  assert.equal(raro.datos.comentario, null);
});

test('leerExtraccion_ acepta las intenciones CORREGIR y BORRAR', () => {
  for (const intencion of ['CORREGIR', 'BORRAR']) {
    const r = leerExtraccion_(respuesta(extraccionBuena({ intencion })), CATEGORIAS, true);
    assert.equal(r.datos.intencion, intencion);
  }
});
