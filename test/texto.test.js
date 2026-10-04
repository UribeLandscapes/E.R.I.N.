const test = require('node:test');
const assert = require('node:assert/strict');

// En Apps Script CONFIG es global; en Node se pone a mano con la configuración falsa de prueba.
global.CONFIG = require('./configPrueba.js').CONFIG;

// En Apps Script estos nombres son globales (Reglas.js); en Node se ponen a mano.
const reglas = require('../src/Reglas.js');

global.leerFecha_ = reglas.leerFecha_;
global.idFactura_ = reglas.idFactura_;
global.cuadre_ = reglas.cuadre_;
global.mesDistinto_ = reglas.mesDistinto_;
global.semanaDelMes_ = reglas.semanaDelMes_;
// ortografiaProveedor_: la ortografía del proveedor según el historial.
global.ortografiaProveedor_ = reglas.ortografiaProveedor_;
// normalizarProveedor_ (Reglas.js): lo usa claseInferidaProveedor_ desde claseDeGasto_.
global.normalizarProveedor_ = reglas.normalizarProveedor_;
// cambiosRespuesta_ (Escritura.js): preguntaDestino_ la reusa para elegir entre preguntas abiertas.
global.cambiosRespuesta_ = require('../src/Escritura.js').cambiosRespuesta_;
global.textoCelda_ = require('../src/Escritura.js').textoCelda_;
// sinTildes_ (Hoja.js): normalización de texto (sin tildes) para.
global.sinTildes_ = require('../src/Hoja.js').sinTildes_;
// Clases.js: la lista de 17 grupos y su conversión a etiqueta real.
Object.assign(global, require('../src/Clases.js'));
// Confirmacion.js arma el texto detallado que devuelve planTexto_.
Object.assign(global, require('../src/Texto.js'));
Object.assign(global, require('../src/Confirmacion.js'));
// Foto.js: confirmacionFoto_ agrega la línea "Foto: ver foto" cuando el gasto vino de
// una foto; planSegunIntencion_ la llama como global, igual que en Apps Script.
Object.assign(global, require('../src/Foto.js'));

const {
  filasGasto_, filasDeposito_, planSaldoInicial_, evaluarConteo_, confirmarAjuste_,
  preguntaDestino_, planTexto_, textoPreguntas_, textoGuia_, TEXTO_NO_ENTENDI,
} = require('../src/Texto.js');

const confianzaAlta = {
  proveedor: 'ALTA', fecha: 'ALTA', moneda: 'ALTA', total: 'ALTA', clase: 'ALTA',
};

function datos(cambios) {
  return {
    legible: true,
    tipo_documento: 'OTRO',
    proveedor: null,
    fecha: null,
    moneda: null,
    forma_pago: 'DESCONOCIDA',
    lineas: [],
    total: null,
    clase: 'PENDIENTE',
    descripcion_corta: '',
    confianza: confianzaAlta,
    intencion: 'OTRO',
    ...cambios,
  };
}

function contexto(cambios) {
  return {
    fechaMensaje: '2026-09-26',
    idMensaje: 501,
    idsFactura: [],
    saldoInicialDefinido: true,
    saldoCalculado: 90,
    depositante: 'Beto',
    aUsd: () => { throw new Error('no debería convertir'); },
    ...cambios,
  };
}

// Caso 4 del plan: "efectivo, 25, propina muchacho del supermercado".
const propina = datos({
  intencion: 'GASTO',
  forma_pago: 'EFECTIVO',
  lineas: [{ tipo: 'PROPINA', descripcion: 'propina muchacho del supermercado', monto: 25, confianza: 'ALTA' }],
  total: 25,
  descripcion_corta: 'propina supermercado',
});

// --- Casa ---

test('filasGasto_ sin casa nombrada pone CASA COMPARTIDO', () => {
  const { filas } = filasGasto_(propina, contexto());
  assert.equal(filas[0].CASA, 'COMPARTIDO');
});

test('filasGasto_ con casa PRINCIPAL o SECUNDARIA la usa en CASA', () => {
  const conPrincipal = filasGasto_({ ...propina, casa: 'PRINCIPAL' }, contexto());
  assert.equal(conPrincipal.filas[0].CASA, 'PRINCIPAL');
  const conSecundaria = filasGasto_({ ...propina, casa: 'SECUNDARIA' }, contexto());
  assert.equal(conSecundaria.filas[0].CASA, 'SECUNDARIA');
});

// --- Clase por grupo ---

test('filasGasto_ convierte un nombre de grupo de Gemini a la etiqueta real, según casa y fecha', () => {
  const sinCasa = filasGasto_({ ...propina, clase: 'Supermercado' }, contexto());
  assert.equal(sinCasa.filas[0]['CLASE DE GASTO'], 'GROCERIES W4 NORTE');
  const conSecundaria = filasGasto_({ ...propina, clase: 'Supermercado', casa: 'SECUNDARIA' }, contexto());
  assert.equal(conSecundaria.filas[0]['CLASE DE GASTO'], 'GROCERIES PLAYA');
});

// --- Clase por proveedor dominante ---

test('filasGasto_ usa el proveedor dominante del historial aunque Gemini elija otra clase', () => {
  const historial = Array.from({ length: 3 }, () => ({ proveedor: 'Riba Smith', clase: 'GROCERIES' }));
  const entrada = { ...propina, proveedor: 'Riba Smith', clase: 'Mantenimiento y reparaciones' };
  const { filas } = filasGasto_(entrada, contexto({ historial }));
  assert.equal(filas[0]['CLASE DE GASTO'], 'GROCERIES W4 NORTE');
});

test('filasGasto_ sin proveedor dominante no pregunta la clase si Gemini ya la resolvió', () => {
  const entrada = { ...propina, proveedor: 'Riba Smith', clase: 'Supermercado' };
  const { filas, preguntas } = filasGasto_(entrada, contexto({ historial: [] }));
  assert.equal(filas[0]['CLASE DE GASTO'], 'GROCERIES W4 NORTE');
  assert.ok(!preguntas.includes('clase'));
});

test('filasGasto_ sin dominante y sin clase clara de Gemini sí pregunta la clase (PENDIENTE)', () => {
  const entrada = { ...propina, proveedor: 'Riba Smith', clase: 'PENDIENTE' };
  const { filas, preguntas } = filasGasto_(entrada, contexto({ historial: [] }));
  assert.equal(filas[0]['CLASE DE GASTO'], 'PENDIENTE');
  assert.ok(preguntas.includes('clase'));
});

test('filasGasto_ deja una etiqueta vieja o PENDIENTE tal cual', () => {
  const vieja = filasGasto_({ ...propina, clase: 'GROCERIES' }, contexto());
  assert.equal(vieja.filas[0]['CLASE DE GASTO'], 'GROCERIES');
  const pendiente = filasGasto_({ ...propina, proveedor: 'Taxi' }, contexto());
  assert.equal(pendiente.filas[0]['CLASE DE GASTO'], 'PENDIENTE');
});

test('filasDeposito_ sin casa nombrada pone CASA COMPARTIDO; con casa la usa', () => {
  const deposito = datos({ intencion: 'DEPOSITO', total: 200, proveedor: 'Beto' });
  const sinCasa = filasDeposito_(deposito, contexto());
  assert.equal(sinCasa.filas[0].CASA, 'COMPARTIDO');
  const conCasa = filasDeposito_({ ...deposito, casa: 'PRINCIPAL' }, contexto());
  assert.equal(conCasa.filas[0].CASA, 'PRINCIPAL');
});

test('planSaldoInicial_ sin casa nombrada pone CASA COMPARTIDO; con casa la usa', () => {
  const saldo = datos({ intencion: 'SALDO_INICIAL', total: 150 });
  const sinCasa = planSaldoInicial_(saldo, contexto({ saldoInicialDefinido: false }));
  assert.equal(sinCasa.filas[0].CASA, 'COMPARTIDO');
  const conCasa = planSaldoInicial_({ ...saldo, casa: 'SECUNDARIA' }, contexto({ saldoInicialDefinido: false }));
  assert.equal(conCasa.filas[0].CASA, 'SECUNDARIA');
});

test('confirmarAjuste_ siempre pone CASA COMPARTIDO (el conteo no distingue casa)', () => {
  const r = confirmarAjuste_(80, 90, 90, contexto());
  assert.equal(r.filas[0].CASA, 'COMPARTIDO');
});

// --- Gasto ---

test('filasGasto_ caso 4: una fila con la propina en OTROS CARGOS, sin bloquear', () => {
  const { filas, preguntas } = filasGasto_(propina, contexto());
  assert.equal(filas.length, 1);
  const f = filas[0];
  assert.equal(f.FECHA, '2026-09-26');
  assert.equal(f.TIPO, 'GASTO');
  assert.equal(f['OTROS CARGOS'], 25);
  assert.equal(f['ARTÍCULOS'], '');
  assert.equal(f['GASTO (USD)'], 25);
  assert.equal(f['FORMA DE PAGO'], 'EFECTIVO');
  assert.equal(f.MONEDA, 'USD');
  assert.equal(f['DESCRIPCIÓN'], 'propina muchacho del supermercado');
  assert.equal(f.ORIGEN, 'BOT');
  assert.equal(f['ID MENSAJE TG'], 501);
  assert.deepEqual(preguntas, ['proveedor', 'clase']);
});

test('filasGasto_ sin proveedor usa PENDIENTE en PROVEEDOR e ID PENDIENTE-AAAAMMDD', () => {
  const { filas } = filasGasto_(propina, contexto({ idsFactura: ['PENDIENTE-20260926'] }));
  assert.equal(filas[0].PROVEEDOR, 'PENDIENTE');
  assert.equal(filas[0]['ID FACTURA'], 'PENDIENTE-20260926-2');
});

test('filasGasto_ sin fecha leída usa la fecha del mensaje sin preguntar ni marcar REVISAR', () => {
  const { filas, preguntas } = filasGasto_(propina, contexto());
  assert.equal(filas[0].FECHA, '2026-09-26');
  assert.equal(filas[0].REVISAR, '');
  assert.ok(!preguntas.includes('fecha'));
});

test('filasGasto_ con proveedor, fecha y clase no pregunta nada', () => {
  const completo = { ...propina, proveedor: 'Riba Smith', fecha: '2026-09-20', clase: 'GROCERIES' };
  const { filas, preguntas } = filasGasto_(completo, contexto());
  assert.deepEqual(preguntas, []);
  assert.equal(filas[0]['ID FACTURA'], 'RIBASMITH-20260920');
  assert.equal(filas[0].PROVEEDOR, 'Riba Smith');
  assert.equal(filas[0].FECHA, '2026-09-20');
  assert.equal(filas[0]['CLASE DE GASTO'], 'GROCERIES');
  assert.equal(filas[0].REVISAR, '');
});

test('filasGasto_ escribe el proveedor con la ortografía del historial (Supuesto AB, punto F)', () => {
  const historial = [
    { proveedor: 'Super 99', clase: 'GROCERIES' },
    { proveedor: 'Super 99', clase: 'GROCERIES' },
    { proveedor: 'SUPER 99', clase: 'GROCERIES' },
  ];
  const entrada = { ...propina, proveedor: 'super 99', fecha: '2026-09-20', clase: 'GROCERIES' };
  const { filas } = filasGasto_(entrada, contexto({ historial }));
  assert.equal(filas[0].PROVEEDOR, 'Super 99');
});

test('filasGasto_ sin historial y proveedor todo en minúsculas usa mayúscula inicial por palabra', () => {
  const entrada = { ...propina, proveedor: 'riba smith', fecha: '2026-09-20', clase: 'GROCERIES' };
  const { filas } = filasGasto_(entrada, contexto({ historial: [] }));
  assert.equal(filas[0].PROVEEDOR, 'Riba Smith');
});

test('filasGasto_ nunca toca el proveedor cuando queda PENDIENTE', () => {
  const { filas } = filasGasto_(propina, contexto({ historial: [{ proveedor: 'Super 99', clase: 'GROCERIES' }] }));
  assert.equal(filas[0].PROVEEDOR, 'PENDIENTE');
});

// --- Fecha de otro mes ---

test('filasGasto_ con fecha del recibo de otro mes no escribe nada y devuelve fechaDistinta', () => {
  const otroMes = { ...propina, proveedor: 'Riba Smith', fecha: '2026-08-15', clase: 'GROCERIES' };
  const { filas, preguntas, fechaDistinta } = filasGasto_(otroMes, contexto({ fechaMensaje: '2026-09-26' }));
  assert.deepEqual(filas, []);
  assert.deepEqual(preguntas, []);
  assert.deepEqual(fechaDistinta, { fechaRecibo: '2026-08-15', fechaEnvio: '2026-09-26' });
});

test('filasGasto_ con fecha del recibo del mismo mes (otro día) no pregunta nada de fecha', () => {
  const mismoMes = { ...propina, proveedor: 'Riba Smith', fecha: '2026-09-01', clase: 'GROCERIES' };
  const { filas, fechaDistinta } = filasGasto_(mismoMes, contexto({ fechaMensaje: '2026-09-26' }));
  assert.equal(fechaDistinta, null);
  assert.equal(filas[0].FECHA, '2026-09-01');
});

test('filasGasto_ sin fecha leída no pregunta por mes distinto (usa la del mensaje y pregunta fecha, como antes)', () => {
  const { fechaDistinta } = filasGasto_(propina, contexto({ fechaMensaje: '2026-09-26' }));
  assert.equal(fechaDistinta, null);
});

test('planTexto_ gasto con fecha de otro mes pregunta con las dos fechas y no escribe', () => {
  const otroMes = { ...propina, proveedor: 'Riba Smith', fecha: '2026-08-15', clase: 'GROCERIES' };
  const plan = planTexto_(otroMes, contexto({ fechaMensaje: '2026-09-26', saldoInicialDefinido: true }));
  assert.deepEqual(plan.filas, []);
  assert.deepEqual(plan.fechaDistinta, { fechaRecibo: '2026-08-15', fechaEnvio: '2026-09-26' });
  assert.equal(plan.respuesta, 'El recibo es del 2026-08-15 pero lo mandaste el 2026-09-26, de otro mes. ¿Con cuál lo registro?');
});

test('filasGasto_ junta ITEM e ITBMS en una sola fila, cada uno en su columna', () => {
  const dos = datos({
    proveedor: 'Farmacia', fecha: '2026-09-20', clase: 'MEDS',
    lineas: [
      { tipo: 'ITEM', descripcion: 'pastillas', monto: 10, confianza: 'ALTA' },
      { tipo: 'ITBMS', descripcion: 'impuesto', monto: 0.7, confianza: 'ALTA' },
    ],
    total: 10.7,
  });
  const { filas, preguntas } = filasGasto_(dos, contexto());
  assert.equal(filas.length, 1);
  assert.equal(filas[0]['ARTÍCULOS'], 10);
  assert.equal(filas[0].ITBMS, 0.7);
  assert.equal(filas[0]['GASTO (USD)'], 10.7);
  // El ITBMS no se nombra en la descripción: ya se ve en su columna.
  assert.equal(filas[0]['DESCRIPCIÓN'], 'pastillas');
  assert.deepEqual(preguntas, []);
});

test('filasGasto_ suma varios artículos en ARTÍCULOS y junta sus descripciones', () => {
  const varios = datos({
    proveedor: 'Super 99', fecha: '2026-09-20', clase: 'GROCERIES',
    lineas: [
      { tipo: 'ITEM', descripcion: 'arroz', monto: 3.25, confianza: 'ALTA' },
      { tipo: 'ITEM', descripcion: 'pollo', monto: 7.4, confianza: 'ALTA' },
    ],
    total: 10.65,
  });
  const { filas } = filasGasto_(varios, contexto());
  assert.equal(filas[0]['ARTÍCULOS'], 10.65);
  assert.equal(filas[0]['GASTO (USD)'], 10.65);
  assert.equal(filas[0]['DESCRIPCIÓN'], 'arroz, pollo');
});

test('filasGasto_ guarda el DESCUENTO en positivo y lo resta del gasto (ejemplo del plan)', () => {
  const conDescuento = datos({
    proveedor: 'Arrocha', fecha: '2026-09-26', clase: 'MEDS',
    lineas: [
      { tipo: 'ITEM', descripcion: 'Crema dental', monto: 1.55, confianza: 'ALTA' },
      { tipo: 'DESCUENTO', descripcion: 'Club Arrocha', monto: -0.39, confianza: 'ALTA' },
    ],
    total: 1.16,
  });
  const { filas, preguntas } = filasGasto_(conDescuento, contexto());
  assert.equal(filas[0]['ARTÍCULOS'], 1.55);
  assert.equal(filas[0]['DESCUENTOS'], 0.39);
  assert.equal(filas[0]['GASTO (USD)'], 1.16);
  assert.equal(filas[0]['DESCRIPCIÓN'], 'Crema dental; descuento: Club Arrocha');
  assert.deepEqual(preguntas, []);
});

test('filasGasto_ manda PROPINA y OTROS a OTROS CARGOS y los suma', () => {
  const conCargos = datos({
    proveedor: 'Cool Crepes', fecha: '2026-09-20', clase: 'COMIDA',
    lineas: [
      { tipo: 'ITEM', descripcion: 'crepe', monto: 12, confianza: 'ALTA' },
      { tipo: 'PROPINA', descripcion: '', monto: 1.5, confianza: 'ALTA' },
      { tipo: 'OTROS', descripcion: 'servicio', monto: 0.5, confianza: 'ALTA' },
    ],
    total: 14,
  });
  const { filas } = filasGasto_(conCargos, contexto());
  assert.equal(filas[0]['OTROS CARGOS'], 2);
  assert.equal(filas[0]['GASTO (USD)'], 14);
  assert.equal(filas[0]['DESCRIPCIÓN'], 'crepe; propina; otros: servicio');
});

test('filasGasto_ suma en centavos, sin arrastrar el error de los decimales', () => {
  const centavos = datos({
    proveedor: 'Super 99', fecha: '2026-09-20', clase: 'GROCERIES',
    lineas: [
      { tipo: 'ITEM', descripcion: 'a', monto: 0.1, confianza: 'ALTA' },
      { tipo: 'ITEM', descripcion: 'b', monto: 0.2, confianza: 'ALTA' },
      { tipo: 'ITBMS', descripcion: '', monto: 0.07, confianza: 'ALTA' },
    ],
    total: 0.37,
  });
  const { filas, preguntas } = filasGasto_(centavos, contexto());
  assert.equal(filas[0]['GASTO (USD)'], 0.37);
  assert.deepEqual(preguntas, []);
});

test('filasGasto_ descuadre (P2): GASTO es el total impreso y REVISAR dice cuánto suman las partes', () => {
  const descuadre = datos({
    proveedor: 'Farmacia', fecha: '2026-09-20', clase: 'MEDS',
    lineas: [{ tipo: 'ITEM', descripcion: 'a', monto: 10, confianza: 'ALTA' },
      { tipo: 'ITEM', descripcion: 'b', monto: 5, confianza: 'ALTA' }],
    total: 20,
  });
  const { filas, preguntas } = filasGasto_(descuadre, contexto());
  assert.equal(filas.length, 1);
  assert.equal(filas[0]['ARTÍCULOS'], 15);
  assert.equal(filas[0]['GASTO (USD)'], 20);
  assert.equal(filas[0].REVISAR, 'PENDIENTE: TOTAL (partes suman 15.00)');
  assert.deepEqual(preguntas, ['total']);
});

test('filasGasto_ con un centavo de diferencia cuadra y no pregunta nada (tolerancia)', () => {
  const casi = datos({
    proveedor: 'Farmacia', fecha: '2026-09-20', clase: 'MEDS',
    lineas: [{ tipo: 'ITEM', descripcion: 'a', monto: 10, confianza: 'ALTA' }],
    total: 10.01,
  });
  const { filas, preguntas } = filasGasto_(casi, contexto());
  assert.equal(filas[0].REVISAR, '');
  assert.deepEqual(preguntas, []);
});

test('filasGasto_ sin total impreso usa la suma de las partes y no pregunta el total', () => {
  const sinTotal = { ...propina, total: null };
  const { filas, preguntas } = filasGasto_(sinTotal, contexto());
  assert.equal(filas[0]['GASTO (USD)'], 25);
  assert.equal(filas[0].REVISAR, '');
  assert.ok(!preguntas.includes('total'));
});

test('filasGasto_ con solo total y sin líneas lo anota como ARTÍCULOS (gasto escrito a mano)', () => {
  const soloTotal = datos({ proveedor: 'Kiosco', fecha: '2026-09-20', total: 3.5, descripcion_corta: 'agua' });
  const { filas } = filasGasto_(soloTotal, contexto());
  assert.equal(filas.length, 1);
  assert.equal(filas[0].TIPO, 'GASTO');
  assert.equal(filas[0]['ARTÍCULOS'], 3.5);
  assert.equal(filas[0]['GASTO (USD)'], 3.5);
  assert.equal(filas[0]['DESCRIPCIÓN'], 'agua');
});

test('filasGasto_ sin monto no escribe filas y pregunta el monto', () => {
  const sinMonto = datos({ lineas: [{ tipo: 'ITEM', descripcion: 'taxi', monto: null, confianza: 'BAJA' }] });
  assert.deepEqual(filasGasto_(sinMonto, contexto()), { filas: [], preguntas: ['monto'], fechaDistinta: null });
  assert.deepEqual(filasGasto_(datos({}), contexto()), { filas: [], preguntas: ['monto'], fechaDistinta: null });
});

test('filasGasto_ PAB va a la par, sin tasa', () => {
  const pab = { ...propina, moneda: 'PAB' };
  const { filas } = filasGasto_(pab, contexto());
  assert.equal(filas[0].MONEDA, 'PAB');
  assert.equal(filas[0]['GASTO (USD)'], 25);
  assert.equal(filas[0]['MONTO ORIGINAL'], '');
  assert.equal(filas[0]['TASA USADA'], '');
});

test('filasGasto_ otra moneda convierte cada parte con la misma tasa y suma en USD', () => {
  const llamadas = [];
  const aUsd = (monto, moneda, fecha) => {
    llamadas.push([monto, moneda, fecha]);
    return { gastoUsd: monto / 4000, tasaUsada: '4000 (2026-09-25)' };
  };
  const cop = datos({
    proveedor: 'Bar', fecha: '2026-09-25', clase: 'COMIDA', moneda: 'COP',
    lineas: [
      { tipo: 'ITEM', descripcion: 'almuerzo', monto: 40000, confianza: 'ALTA' },
      { tipo: 'PROPINA', descripcion: '', monto: 4000, confianza: 'ALTA' },
    ],
    total: 44000,
  });
  const { filas } = filasGasto_(cop, contexto({ aUsd }));
  assert.equal(filas[0].MONEDA, 'COP');
  assert.equal(filas[0]['ARTÍCULOS'], 10);
  assert.equal(filas[0]['OTROS CARGOS'], 1);
  assert.equal(filas[0]['GASTO (USD)'], 11);
  // MONTO ORIGINAL es el total en la moneda del recibo.
  assert.equal(filas[0]['MONTO ORIGINAL'], 44000);
  assert.equal(filas[0]['TASA USADA'], '4000 (2026-09-25)');
  // Las partes en cero no consultan la tasa.
  assert.deepEqual(llamadas, [[40000, 'COP', '2026-09-25'], [4000, 'COP', '2026-09-25'],
    [44000, 'COP', '2026-09-25']]);
});

test('filasGasto_ otra moneda sin total impreso deja MONTO ORIGINAL con la suma del recibo', () => {
  const aUsd = (monto) => ({ gastoUsd: monto / 4000, tasaUsada: '4000 (2026-09-25)' });
  const cop = { ...propina, moneda: 'COP', proveedor: 'Bar', fecha: '2026-09-25', clase: 'COMIDA', total: null, lineas: [{ ...propina.lineas[0], monto: 40000 }] };
  const { filas } = filasGasto_(cop, contexto({ aUsd }));
  assert.equal(filas[0]['MONTO ORIGINAL'], 40000);
  assert.equal(filas[0]['GASTO (USD)'], 10);
});

test('filasGasto_ otra moneda sin tasa deja GASTO PENDIENTE y no marca descuadre', () => {
  const aUsd = () => ({ gastoUsd: 'PENDIENTE', tasaUsada: 'PENDIENTE' });
  const eur = { ...propina, moneda: 'EUR', proveedor: 'Bar', fecha: '2026-09-25', clase: 'MISCELANEOS' };
  const { filas, preguntas } = filasGasto_(eur, contexto({ aUsd }));
  assert.equal(filas[0]['GASTO (USD)'], 'PENDIENTE');
  assert.equal(filas[0]['OTROS CARGOS'], 'PENDIENTE');
  assert.equal(filas[0]['TASA USADA'], 'PENDIENTE');
  assert.equal(filas[0].REVISAR, '');
  assert.deepEqual(preguntas, []);
});

test('filasGasto_ forma de pago desconocida queda vacía', () => {
  const { filas } = filasGasto_({ ...propina, forma_pago: 'DESCONOCIDA' }, contexto());
  assert.equal(filas[0]['FORMA DE PAGO'], '');
});

// ---: descripción ÍTEM vacía o igual al proveedor ---

test('filasGasto_ ITEM con descripción vacía → "Agregar descripción"', () => {
  const item = datos({
    proveedor: 'Super 99', fecha: '2026-09-20', clase: 'GROCERIES',
    lineas: [{ tipo: 'ITEM', descripcion: '', monto: 25, confianza: 'ALTA' }],
    total: 25,
  });
  const { filas } = filasGasto_(item, contexto());
  assert.equal(filas[0]['DESCRIPCIÓN'], 'Agregar descripción');
});

test('filasGasto_ ITEM descripción "super 99" con proveedor "SUPER 99" → "Agregar descripción"', () => {
  const item = datos({
    proveedor: 'SUPER 99', fecha: '2026-09-20', clase: 'GROCERIES',
    lineas: [{ tipo: 'ITEM', descripcion: 'super 99', monto: 25, confianza: 'ALTA' }],
    total: 25,
  });
  const { filas } = filasGasto_(item, contexto());
  assert.equal(filas[0]['DESCRIPCIÓN'], 'Agregar descripción');
});

test('filasGasto_ ITEM descripción "Farmácia  Arrocha" con proveedor "FARMACIA ARROCHA" → "Agregar descripción"', () => {
  const item = datos({
    proveedor: 'FARMACIA ARROCHA', fecha: '2026-09-20', clase: 'MEDS',
    lineas: [{ tipo: 'ITEM', descripcion: 'Farmácia  Arrocha', monto: 15, confianza: 'ALTA' }],
    total: 15,
  });
  const { filas } = filasGasto_(item, contexto());
  assert.equal(filas[0]['DESCRIPCIÓN'], 'Agregar descripción');
});

test('filasGasto_ ITEM con descripción diferente "agua" → "agua" sin cambios', () => {
  const item = datos({
    proveedor: 'Kiosco', fecha: '2026-09-20', clase: 'GROCERIES',
    lineas: [{ tipo: 'ITEM', descripcion: 'agua', monto: 2, confianza: 'ALTA' }],
    total: 2,
  });
  const { filas } = filasGasto_(item, contexto());
  assert.equal(filas[0]['DESCRIPCIÓN'], 'agua');
});

test('filasGasto_ PROPINA con descripción se deja tal cual; sin ella dice solo "propina"', () => {
  const { filas } = filasGasto_(propina, contexto());
  assert.equal(filas[0]['DESCRIPCIÓN'], 'propina muchacho del supermercado');
  const propinaSinDesc = datos({
    intencion: 'GASTO',
    forma_pago: 'EFECTIVO',
    lineas: [{ tipo: 'PROPINA', descripcion: '', monto: 5, confianza: 'ALTA' }],
    total: 5,
  });
  const { filas: filas2 } = filasGasto_(propinaSinDesc, contexto());
  assert.equal(filas2[0]['DESCRIPCIÓN'], 'propina');
});

test('filasGasto_ sin ningún artículo con descripción avisa "Agregar descripción" y conserva las partes', () => {
  const sinDescripcion = datos({
    proveedor: 'Super 99', fecha: '2026-09-20', clase: 'GROCERIES',
    lineas: [
      { tipo: 'ITEM', descripcion: '', monto: 20, confianza: 'ALTA' },
      { tipo: 'PROPINA', descripcion: '', monto: 1, confianza: 'ALTA' },
    ],
    total: 21,
  });
  const { filas } = filasGasto_(sinDescripcion, contexto());
  assert.equal(filas[0]['DESCRIPCIÓN'], 'Agregar descripción; propina');
});

// --- Depósito ---

const deposito = datos({
  intencion: 'DEPOSITO',
  fecha: '2026-09-26',
  total: 200,
  lineas: [{ tipo: 'OTROS', descripcion: 'por compras de la semana', monto: 200, confianza: 'ALTA' }],
  descripcion_corta: 'depósito compras semana',
});

test('filasDeposito_ en otra moneda convierte a USD con la misma tasa que un gasto', () => {
  const llamadas = [];
  const aUsd = (monto, moneda, fecha) => {
    llamadas.push([monto, moneda, fecha]);
    return { gastoUsd: monto / 4000, tasaUsada: '4000 (2026-09-26)' };
  };
  const cop = { ...deposito, moneda: 'COP', total: 100000, lineas: [] };
  const { filas } = filasDeposito_(cop, contexto({ aUsd }));
  assert.equal(filas[0]['DEPÓSITO'], 25);
  assert.equal(filas[0].MONEDA, 'COP');
  assert.equal(filas[0]['MONTO ORIGINAL'], 100000);
  assert.equal(filas[0]['TASA USADA'], '4000 (2026-09-26)');
  assert.equal(filas[0].REVISAR, '');
  assert.deepEqual(llamadas, [[100000, 'COP', '2026-09-26']]);
});

test('filasDeposito_ en otra moneda sin tasa deja DEPÓSITO PENDIENTE, nunca un número inventado', () => {
  const aUsd = () => ({ gastoUsd: 'PENDIENTE', tasaUsada: 'PENDIENTE' });
  const { filas } = filasDeposito_({ ...deposito, moneda: 'EUR', total: 100, lineas: [] }, contexto({ aUsd }));
  assert.equal(filas[0]['DEPÓSITO'], 'PENDIENTE');
  assert.equal(filas[0].MONEDA, 'EUR');
  assert.equal(filas[0]['MONTO ORIGINAL'], 100);
  assert.equal(filas[0]['TASA USADA'], 'PENDIENTE');
});

test('filasDeposito_ en USD, PAB o sin moneda no convierte ni llena MONTO ORIGINAL', () => {
  const pab = filasDeposito_({ ...deposito, moneda: 'PAB' }, contexto()).filas[0];
  assert.equal(pab['DEPÓSITO'], 200);
  assert.equal(pab.MONEDA, 'PAB');
  assert.equal(pab['MONTO ORIGINAL'], '');
  assert.equal(pab['TASA USADA'], '');
  const sin = filasDeposito_({ ...deposito, moneda: null }, contexto()).filas[0];
  assert.equal(sin['DEPÓSITO'], 200);
  assert.equal(sin.MONEDA, 'USD');
});

test('filasDeposito_ caso 5: DEPÓSITO 200, concepto en COMENTARIOS, Beto sin preguntar', () => {
  const { filas, preguntas } = filasDeposito_(deposito, contexto());
  assert.equal(filas.length, 1);
  const f = filas[0];
  assert.equal(f.TIPO, 'DEPÓSITO');
  assert.equal(f['ID FACTURA'], 'DEPOSITO-20260926');
  assert.equal(f['DEPÓSITO'], 200);
  assert.equal(f['GASTO (USD)'], '');
  assert.equal(f.COMENTARIOS, 'por compras de la semana');
  assert.equal(f.PROVEEDOR, 'Beto');
  assert.equal(f.MONEDA, 'USD');
  assert.equal(f.REVISAR, '');
  assert.deepEqual(preguntas, []);
});

test('filasDeposito_ con quien depositó en el mensaje no pregunta', () => {
  const { filas, preguntas } = filasDeposito_({ ...deposito, proveedor: 'Carlos' }, contexto());
  assert.equal(filas[0].PROVEEDOR, 'Carlos');
  assert.deepEqual(preguntas, []);
});

test('filasDeposito_ escribe el depositante con la ortografía del historial (Supuesto AB, punto F)', () => {
  const historial = [{ proveedor: 'Beto', clase: '' }, { proveedor: 'Beto', clase: '' }];
  const { filas } = filasDeposito_(deposito, contexto({ historial, depositante: 'beto' }));
  assert.equal(filas[0].PROVEEDOR, 'Beto');
});

test('filasDeposito_ agrega -2 si ya hubo un depósito ese día', () => {
  const { filas } = filasDeposito_(deposito, contexto({ idsFactura: ['DEPOSITO-20260926'] }));
  assert.equal(filas[0]['ID FACTURA'], 'DEPOSITO-20260926-2');
});

test('filasDeposito_ sin fecha usa la del mensaje sin preguntar (Supuesto W-bis b)', () => {
  const { filas, preguntas } = filasDeposito_({ ...deposito, fecha: null }, contexto());
  assert.equal(filas[0].FECHA, '2026-09-26');
  assert.equal(filas[0].REVISAR, '');
  assert.deepEqual(preguntas, []);
});

test('filasDeposito_ toma el monto de la línea si no hay total, y el concepto corto si no hay línea', () => {
  const soloLinea = filasDeposito_({ ...deposito, total: null }, contexto());
  assert.equal(soloLinea.filas[0]['DEPÓSITO'], 200);
  const soloTotal = filasDeposito_({ ...deposito, lineas: [] }, contexto());
  assert.equal(soloTotal.filas[0].COMENTARIOS, 'depósito compras semana');
});

test('filasDeposito_ sin monto válido no escribe y pregunta el monto', () => {
  assert.deepEqual(filasDeposito_({ ...deposito, total: null, lineas: [] }, contexto()),
    { filas: [], preguntas: ['monto'] });
  assert.deepEqual(filasDeposito_({ ...deposito, total: -5, lineas: [] }, contexto()),
    { filas: [], preguntas: ['monto'] });
});

// --- Saldo inicial ---

const saldoInicial = datos({ intencion: 'SALDO_INICIAL', total: 150 });

test('planSaldoInicial_ sin saldo previo escribe una fila SALDO INICIAL con ID SALDOINICIAL-AAAAMMDD', () => {
  const plan = planSaldoInicial_(saldoInicial, contexto({ saldoInicialDefinido: false }));
  assert.equal(plan.filas.length, 1);
  const f = plan.filas[0];
  assert.equal(f.TIPO, 'SALDO INICIAL');
  assert.equal(f['ID FACTURA'], 'SALDOINICIAL-20260926');
  assert.equal(f['DEPÓSITO'], 150);
  assert.equal(f.FECHA, '2026-09-26');
  assert.match(plan.respuesta, /150\.00/);
});

test('planSaldoInicial_ se niega si ya existe y ofrece un conteo', () => {
  const plan = planSaldoInicial_(saldoInicial, contexto({ saldoInicialDefinido: true }));
  assert.deepEqual(plan.filas, []);
  assert.match(plan.respuesta, /ya está definido/);
  assert.match(plan.respuesta, /conteo/);
});

test('planSaldoInicial_ sin monto pregunta el monto', () => {
  const plan = planSaldoInicial_(datos({ intencion: 'SALDO_INICIAL' }), contexto({ saldoInicialDefinido: false }));
  assert.deepEqual(plan.filas, []);
  assert.deepEqual(plan.preguntas, ['monto']);
});

// --- Conteo ---

test('evaluarConteo_ que cuadra responde "Cuadra: 85.00." sin pedir ajuste', () => {
  const r = evaluarConteo_(85, 85);
  assert.equal(r.cuadra, true);
  assert.equal(r.respuesta, 'Cuadra: 85.00.');
});

test('evaluarConteo_ con faltante da el texto del plan', () => {
  const r = evaluarConteo_(85, 90);
  assert.equal(r.cuadra, false);
  assert.equal(r.diferencia, -5);
  assert.equal(r.respuesta, 'El sistema calcula 90.00, dices 85.00: faltante de 5.00. ¿Lo registro como ajuste?');
});

test('evaluarConteo_ con sobrante y centavos de coma flotante', () => {
  const r = evaluarConteo_(90.3, 90.1);
  assert.equal(r.diferencia, 0.2);
  assert.match(r.respuesta, /sobrante de 0\.20/);
  assert.equal(evaluarConteo_(0.1 + 0.2, 0.3).cuadra, true);
});

test('confirmarAjuste_ con Sí y saldo igual escribe AJUSTE: faltante en GASTO', () => {
  const r = confirmarAjuste_(85, 90, 90, contexto());
  assert.equal(r.preguntarDeNuevo, false);
  assert.equal(r.filas.length, 1);
  const f = r.filas[0];
  assert.equal(f.TIPO, 'AJUSTE');
  assert.equal(f['ID FACTURA'], 'AJUSTE-20260926');
  assert.equal(f['GASTO (USD)'], 5);
  assert.equal(f['DEPÓSITO'], '');
  assert.match(r.respuesta, /faltante de 5\.00/);
});

test('confirmarAjuste_ sobrante va en DEPÓSITO', () => {
  const f = confirmarAjuste_(95, 90, 90, contexto()).filas[0];
  assert.equal(f['DEPÓSITO'], 5);
  assert.equal(f['GASTO (USD)'], '');
});

test('confirmarAjuste_ si el saldo cambió muestra el número nuevo y vuelve a preguntar', () => {
  const r = confirmarAjuste_(85, 90, 88, contexto());
  assert.deepEqual(r.filas, []);
  assert.equal(r.preguntarDeNuevo, true);
  assert.equal(r.saldo, 88);
  assert.match(r.respuesta, /88\.00/);
  assert.match(r.respuesta, /faltante de 3\.00/);
});

test('confirmarAjuste_ si con el saldo nuevo ya cuadra no escribe nada', () => {
  const r = confirmarAjuste_(85, 90, 85, contexto());
  assert.deepEqual(r.filas, []);
  assert.equal(r.preguntarDeNuevo, false);
  assert.match(r.respuesta, /Cuadra: 85\.00\./);
});

// --- Respuestas (decisión b) ---

const abiertas = [
  { clave: 'q1', idMensajeBot: 10, creado: new Date('2026-09-26T10:00:00Z') },
  { clave: 'q2', idMensajeBot: 20, creado: new Date('2026-09-26T12:00:00Z') },
  { clave: 'q3', idMensajeBot: 30, creado: new Date('2026-09-26T11:00:00Z') },
];

test('preguntaDestino_ usa la pregunta a la que el usuario respondió con "Responder"', () => {
  assert.equal(preguntaDestino_(abiertas, 10).clave, 'q1');
});

test('preguntaDestino_ sin "Responder" (o a otro mensaje) va a la pregunta abierta más reciente', () => {
  assert.equal(preguntaDestino_(abiertas, null).clave, 'q2');
  assert.equal(preguntaDestino_(abiertas, 999).clave, 'q2');
});

test('preguntaDestino_ sin preguntas abiertas devuelve null', () => {
  assert.equal(preguntaDestino_([], 10), null);
});

// --- preguntaDestino_ elige entre varias preguntas abiertas según lo que trae la respuesta
// (defecto: la más reciente no siempre es la que el usuario está contestando) ---

const conPreguntas = (clave, preguntas, creado) => ({ clave, preguntas, creado, idMensajeBot: null });

test('preguntaDestino_ sin "Responder": un nombre va a la pregunta de proveedor, no a la más reciente', () => {
  const abiertas = [
    conPreguntas('gasto', ['proveedor'], new Date('2026-09-27T10:00:00Z')),
    conPreguntas('total', ['total'], new Date('2026-09-27T11:00:00Z')), // más reciente
  ];
  const respuesta = { proveedor: 'Riba Smith', total: null, lineas: [] };
  assert.equal(preguntaDestino_(abiertas, null, respuesta).clave, 'gasto');
});

test('preguntaDestino_ sin "Responder": un monto ("nada" = 0) va a la pregunta del total', () => {
  const abiertas = [
    conPreguntas('gasto', ['proveedor'], new Date('2026-09-27T10:00:00Z')),
    conPreguntas('total', ['total'], new Date('2026-09-27T11:00:00Z')),
  ];
  const respuesta = { proveedor: null, total: 0, lineas: [] };
  assert.equal(preguntaDestino_(abiertas, null, respuesta).clave, 'total');
});

test('preguntaDestino_ sin "Responder" y ninguna pregunta elegible: cae a la más reciente (como antes)', () => {
  const abiertas = [
    conPreguntas('gasto', ['proveedor'], new Date('2026-09-27T10:00:00Z')),
    conPreguntas('total', ['total'], new Date('2026-09-27T11:00:00Z')),
  ];
  const respuesta = { proveedor: null, total: null, lineas: [] };
  assert.equal(preguntaDestino_(abiertas, null, respuesta).clave, 'total');
});

test('preguntaDestino_ con "Responder" cita la pregunta aunque otra sea más elegible', () => {
  const abiertas = [
    { clave: 'gasto', preguntas: ['proveedor'], creado: new Date('2026-09-27T10:00:00Z'), idMensajeBot: 10 },
    { clave: 'total', preguntas: ['total'], creado: new Date('2026-09-27T11:00:00Z'), idMensajeBot: 20 },
  ];
  const respuesta = { proveedor: null, total: 0, lineas: [] }; // "eligible" para total, no para gasto
  assert.equal(preguntaDestino_(abiertas, 10, respuesta).clave, 'gasto');
});

// --- Preguntas en palabras ---

test('textoPreguntas_ junta lo que falta en una sola pregunta breve', () => {
  assert.equal(textoPreguntas_([]), '');
  assert.equal(textoPreguntas_(['fecha']), '¿Me dices la fecha?');
  assert.equal(textoPreguntas_(['fecha', 'proveedor']), '¿Me dices la fecha y a quién le pagaste?');
  assert.equal(textoPreguntas_(['depositante']), '¿Quién hizo el depósito? Si no me dices, pongo Beto.');
});

test('textoPreguntas_ agrega la lista de 17 grupos cuando se pregunta la clase (Supuesto AB (a))', () => {
  const texto = textoPreguntas_(['fecha', 'proveedor', 'clase']);
  assert.ok(texto.startsWith('¿Me dices la fecha, a quién le pagaste y la clase de gasto?\n\n1. Supermercado'),
    texto);
  assert.match(texto, /14\. Garrafones de agua/);
  assert.match(texto, /17\. Varios/);
  assert.match(texto, /número de la lista/);
});

test('textoPreguntas_ solo con clase: la pregunta sigue de la lista', () => {
  const texto = textoPreguntas_(['clase']);
  assert.ok(texto.startsWith('¿Me dices la clase de gasto?\n\n1. Supermercado'), texto);
});

// --- planTexto_ ---

test('planTexto_ gasto: filas, confirmación detallada y preguntas', () => {
  const plan = planTexto_(propina, contexto());
  assert.equal(plan.filas.length, 1);
  assert.deepEqual(plan.preguntas, ['proveedor', 'clase']);
  assert.equal(plan.confirmable, true);
  assert.equal(plan.html, true);
  assert.match(plan.respuesta, /^Listo, agregué el gasto a tu reporte\. Estos son los detalles:/);
  assert.match(plan.respuesta, /^<b>Gasto:<\/b> 25\.00$/m);
  assert.match(plan.respuesta, /^<b>Proveedor:<\/b> \(falta\)$/m);
  assert.match(plan.respuesta, /¿Me dices a quién le pagaste y la clase de gasto\?\n\n1\. Supermercado/);
  assert.ok(plan.respuesta.endsWith('número de la lista, o dime la clase con tus palabras (por ejemplo "super").'),
    plan.respuesta);
});

test('planTexto_ gasto: la confirmación de un gasto corregido usa el texto (d)', () => {
  const plan = planTexto_(propina, contexto({ corregido: true }));
  assert.match(plan.respuesta, /^Listo, corregí el gasto\. Así quedó:/);
});

test('planTexto_ escribe el comentario del usuario en COMENTARIOS', () => {
  const plan = planTexto_({ ...propina, comentario: 'para la fiesta' }, contexto());
  assert.equal(plan.filas[0].COMENTARIOS, 'para la fiesta');
  assert.match(plan.respuesta, /^<b>Comentarios:<\/b> para la fiesta$/m);
});

test('planTexto_ gasto sin monto pide el monto y no escribe', () => {
  const plan = planTexto_(datos({ intencion: 'GASTO' }), contexto());
  assert.deepEqual(plan.filas, []);
  assert.equal(plan.confirmable, false);
  assert.equal(plan.html, false);
  assert.match(plan.respuesta, /monto/);
});

test('planTexto_ depósito sin nombre confirma con "Beto", sin preguntar', () => {
  const plan = planTexto_(deposito, contexto());
  assert.equal(plan.confirmable, true);
  assert.equal(plan.html, true);
  assert.match(plan.respuesta, /^Listo, agregué el depósito a tu reporte\. Estos son los detalles:/);
  assert.match(plan.respuesta, /^<b>De:<\/b> Beto$/m);
  assert.match(plan.respuesta, /^<b>Depósito:<\/b> 200\.00$/m);
  assert.deepEqual(plan.preguntas, []);
});

test('planTexto_ depósito: el comentario del usuario gana sobre la descripción de la línea', () => {
  const plan = planTexto_({ ...deposito, comentario: 'de la venta' }, contexto());
  assert.equal(plan.filas[0].COMENTARIOS, 'de la venta');
});

test('planTexto_ conteo devuelve los datos para los botones sin escribir filas', () => {
  const plan = planTexto_(datos({ intencion: 'CONTEO', total: 85 }), contexto());
  assert.deepEqual(plan.filas, []);
  assert.deepEqual(plan.conteo, { contado: 85, saldo: 90 });
  assert.match(plan.respuesta, /faltante de 5\.00/);
});

test('planTexto_ conteo que cuadra no pide botones', () => {
  const plan = planTexto_(datos({ intencion: 'CONTEO', total: 90 }), contexto());
  assert.equal(plan.conteo, null);
  assert.equal(plan.respuesta, 'Cuadra: 90.00.');
});

test('planTexto_ conteo sin número pregunta cuánto tiene', () => {
  const plan = planTexto_(datos({ intencion: 'CONTEO' }), contexto());
  assert.equal(plan.conteo, null);
  assert.match(plan.respuesta, /cuánto/);
});

test('planTexto_ saldo inicial y OTRO', () => {
  const plan = planTexto_(saldoInicial, contexto({ saldoInicialDefinido: false }));
  assert.equal(plan.filas.length, 1);
  const otro = planTexto_(datos({ intencion: 'OTRO' }), contexto());
  assert.deepEqual(otro.filas, []);
  assert.match(otro.respuesta, /No entendí bien/);
});

test('planTexto_ RESPUESTA no escribe: la aplica quien lee _ESTADO', () => {
  const plan = planTexto_(datos({ intencion: 'RESPUESTA' }), contexto());
  assert.deepEqual(plan.filas, []);
  assert.equal(plan.esRespuesta, true);
});

test('planTexto_ ya no agrega ningún recordatorio de saldo inicial (Supuesto Z: se quitó la pregunta diaria)', () => {
  const plan = planTexto_(propina, contexto({ saldoInicialDefinido: false }));
  assert.equal(plan.filas.length, 1);
  assert.ok(!plan.respuesta.includes('saldo inicial'));
});

// --- Guía y "no entendí" ---

test('textoGuia_ es la guía aprobada: saludo, 7 puntos numerados y el cierre "ayuda"', () => {
  assert.match(textoGuia_(), /^¡Hola Ana! ¿Qué quieres hacer hoy\? Puedes escribirme así:/);
  assert.match(textoGuia_(), /1\. Un gasto: "22\.50 efectivo super Riba Smith" \(con propina: "22\.50 Riba, 1\.50 de propina"\)/);
  assert.match(textoGuia_(), /2\. Un depósito: "me depositaron 250"/);
  assert.match(textoGuia_(), /3\. Revisar la caja: "tengo 85"/);
  assert.match(textoGuia_(), /4\. La casa: agrega "Casa Playa" o "Casa Norte"/);
  assert.match(textoGuia_(), /5\. Corregir: responde a mi confirmación con el cambio, o escribe "corrige el último: \.\.\."/);
  assert.match(textoGuia_(), /6\. Borrar: responde "borrar" a mi confirmación, o escribe "borra el último"/);
  assert.match(textoGuia_(), /7\. Una factura: mándame la foto \(puedes agregar "Casa Playa" o un comentario\)/);
  assert.ok(!textoGuia_().includes('muy pronto'));
  assert.match(textoGuia_(), /Escribe "ayuda" cuando quieras ver esto otra vez\.$/);
});

test('TEXTO_NO_ENTENDI es el texto (g) aprobado y manda a escribir "ayuda"', () => {
  assert.equal(TEXTO_NO_ENTENDI, 'No entendí bien. Puedes escribir, por ejemplo, '
    + '"22.50 efectivo super Riba Smith" o "me depositaron 250". Escribe "ayuda" para ver '
    + 'todo lo que puedo hacer.');
});

test('planTexto_ AYUDA responde la guía y no escribe ni pregunta nada', () => {
  const plan = planTexto_(datos({ intencion: 'AYUDA' }), contexto());
  assert.deepEqual(plan.filas, []);
  assert.deepEqual(plan.preguntas, []);
  assert.equal(plan.respuesta, textoGuia_());
  assert.equal(plan.conteo, null);
});

// --- Foto del gasto: columna FOTO y línea "Foto: ver foto" ---

test('filasGasto_ escribe el enlace de la foto en FOTO; un gasto de texto la deja vacía', () => {
  const conFoto = filasGasto_({ ...propina, foto: 'https://drive.google.com/file/d/abc/view' }, contexto());
  assert.equal(conFoto.filas[0].FOTO, 'https://drive.google.com/file/d/abc/view');
  assert.equal(filasGasto_(propina, contexto()).filas[0].FOTO, '');
});

test('planTexto_ gasto con foto confirma con la línea "Foto: ver foto" al final', () => {
  const plan = planTexto_({ ...propina, foto: 'https://drive.google.com/abc' }, contexto());
  assert.equal(plan.html, true);
  assert.equal(plan.confirmable, true);
  assert.match(plan.respuesta, /<b>Foto:<\/b> <a href="https:\/\/drive\.google\.com\/abc">ver foto<\/a>/);
});

test('planTexto_ gasto sin foto no agrega ninguna línea de foto', () => {
  assert.ok(!planTexto_(propina, contexto()).respuesta.includes('ver foto'));
});

test('planTexto_ gasto con foto pero sin monto solo pregunta el monto (sin línea de foto)', () => {
  const plan = planTexto_(datos({ intencion: 'GASTO', foto: 'https://drive.google.com/abc' }), contexto());
  assert.deepEqual(plan.filas, []);
  assert.equal(plan.respuesta, '¿Me dices el monto?');
});

// --- Auditoría P2: el ID FACTURA sale de los IDs del mes de la fecha de la fila, no del mes del mensaje ---

test('filasDeposito_ con fecha de otro mes toma los IDs de ese mes (idsFacturaDe), no los del mes del mensaje', () => {
  const consultas = [];
  const idsFacturaDe = (fecha) => { consultas.push(fecha); return ['DEPOSITO-20260930']; };
  const { filas } = filasDeposito_({ ...deposito, fecha: '2026-09-30' },
    contexto({ fechaMensaje: '2026-10-02', idsFactura: [], idsFacturaDe }));
  assert.equal(filas[0]['ID FACTURA'], 'DEPOSITO-20260930-2');
  assert.deepEqual(consultas, ['2026-09-30']);
});

test('filasDeposito_ con fecha del mismo mes usa ctx.idsFactura sin consultar idsFacturaDe', () => {
  const idsFacturaDe = () => { throw new Error('no debería consultar otro mes'); };
  const { filas } = filasDeposito_({ ...deposito, fecha: '2026-09-30' },
    contexto({ fechaMensaje: '2026-09-30', idsFactura: ['DEPOSITO-20260930'], idsFacturaDe }));
  assert.equal(filas[0]['ID FACTURA'], 'DEPOSITO-20260930-2');
});

test('filasDeposito_ con fecha de otro mes y sin idsFacturaDe conserva ctx.idsFactura', () => {
  const { filas } = filasDeposito_({ ...deposito, fecha: '2026-09-30' },
    contexto({ fechaMensaje: '2026-10-02', idsFactura: ['DEPOSITO-20260930'] }));
  assert.equal(filas[0]['ID FACTURA'], 'DEPOSITO-20260930-2');
});

test('planSaldoInicial_ con fecha de otro mes toma los IDs de ese mes (idsFacturaDe)', () => {
  const plan = planSaldoInicial_({ ...saldoInicial, fecha: '2026-09-01' },
    contexto({ saldoInicialDefinido: false, fechaMensaje: '2026-10-02', idsFactura: [],
      idsFacturaDe: () => ['SALDOINICIAL-20260901'] }));
  assert.equal(plan.filas[0]['ID FACTURA'], 'SALDOINICIAL-20260901-2');
});
