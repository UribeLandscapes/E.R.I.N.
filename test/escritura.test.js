const test = require('node:test');
const assert = require('node:assert/strict');

// En Apps Script estos nombres son globales (Hoja.js, Reglas.js); en Node se ponen a mano.
global.MESES = require('../src/Hoja.js').MESES;
Object.assign(global, require('../src/Hoja.js'));
Object.assign(global, require('../src/Reglas.js'));
global.CONFIG = require('./configPrueba.js').CONFIG; // Clases.js lee CONFIG.CASAS
// Clases.js: mapeo determinístico de una respuesta abierta de clase.
Object.assign(global, require('../src/Clases.js'));
// MONEDAS_PAR_TEXTO (Texto.js) y convertirAUsd_ (Moneda.js): el total contestado en otra moneda.
global.MONEDAS_PAR_TEXTO = require('../src/Texto.js').MONEDAS_PAR_TEXTO;
global.convertirAUsd_ = require('../src/Moneda.js').convertirAUsd_;

const {
  ORIGEN_BOT, TIPO_ESTADO_PREGUNTA, idsFila_, tramosEscritura_, valoresTramo_, textoSeguroCelda_, filaLibre_,
  filaComoObjeto_, textoCelda_, preguntaEstado_, preguntasAbiertas_, cambiosRespuesta_,
  planRespuesta_, mensajeCorregido_, datosConMonto_,
} = require('../src/Escritura.js');
const { COLUMNAS, COLUMNAS_ESTADO, numeroColumna_ } = require('../src/Hoja.js');

const Y = numeroColumna_('GRUPO');
const filaHoja = (valores = {}) => COLUMNAS.map((c) => (c in valores ? valores[c] : ''));

test('idsFila_: BOT-sello-mensaje-n, uno por fila', () => {
  assert.deepEqual(idsFila_('20260926-161020', 501, 2), ['BOT-20260926-161020-501-1', 'BOT-20260926-161020-501-2']);
  assert.deepEqual(idsFila_('20260926-161020', 501, 0), []);
});

test('tramosEscritura_ salta solo GRUPO (Y, el único desborde que queda)', () => {
  const tramos = tramosEscritura_();
  assert.deepEqual(tramos.map((t) => [t.desde, t.columnas.length]), [[1, 24]]);
  const escritas = tramos.flatMap((t) => t.columnas.map((_, i) => t.desde + i));
  assert.ok(!escritas.includes(Y));
  assert.equal(escritas.length, COLUMNAS.length - 1);
});

test('valoresTramo_ pone vacío en las columnas que la fila no trae', () => {
  const [a] = tramosEscritura_();
  const v = valoresTramo_({ FECHA: '2026-09-26', 'GASTO (USD)': 25 }, a);
  assert.equal(v.length, 24);
  assert.equal(v[0], '2026-09-26');
  assert.equal(v[9], 25);
  assert.equal(v[1], '');
});

test('textoSeguroCelda_ neutraliza fórmulas de texto y conserva números y texto normal', () => {
  assert.equal(textoSeguroCelda_('=IMPORTDATA("https://ejemplo")'), "'=IMPORTDATA(\"https://ejemplo\")");
  assert.equal(textoSeguroCelda_('+1'), "'+1");
  assert.equal(textoSeguroCelda_('Proveedor normal'), 'Proveedor normal');
  assert.equal(textoSeguroCelda_(25), 25);
});

test('valoresTramo_ protege solo seis columnas (PROVEEDOR, DESCRIPCIÓN, FORMA DE PAGO, CLASE DE GASTO, COMENTARIOS, REVISAR) de fórmulas', () => {
  const [tramo] = tramosEscritura_();
  const valores = valoresTramo_({ PROVEEDOR: '=IMPORTDATA("https://ejemplo")', 'GASTO (USD)': 25 }, tramo);
  assert.equal(valores[tramo.columnas.indexOf('PROVEEDOR')], "'=IMPORTDATA(\"https://ejemplo\")");
  assert.equal(valores[tramo.columnas.indexOf('GASTO (USD)')], 25);
});

test('valoresTramo_ conserva fecha y enlace aunque empiecen como fórmula', () => {
  const [tramo] = tramosEscritura_();
  const valores = valoresTramo_({ FECHA: '=fecha', FOTO: '=enlace' }, tramo);
  assert.equal(valores[tramo.columnas.indexOf('FECHA')], '=fecha');
  assert.equal(valores[tramo.columnas.indexOf('FOTO')], '=enlace');
});

test('filaLibre_: primera fila con ID FILA y visibles vacíos', () => {
  const valores = [
    filaHoja({ FECHA: '2026-09-01', 'ID FILA': 'X' }),
    filaHoja({ GRUPO: '' }),
    filaHoja(),
  ];
  assert.equal(filaLibre_(valores, 1), 1);
});

test('filaLibre_: una fila manual sin sellar (visibles llenos, ID FILA vacío) no está libre', () => {
  const valores = [filaHoja({ PROVEEDOR: 'Manual' }), filaHoja()];
  assert.equal(filaLibre_(valores, 1), 1);
});

test('filaLibre_: el desborde de la fórmula en Y no cuenta como contenido', () => {
  const valores = [filaHoja({ GRUPO: 1 })];
  assert.equal(filaLibre_(valores, 1), 0);
});

test('filaLibre_: una fila con ID FILA pero sin visibles no está libre', () => {
  const valores = [filaHoja({ 'ID FILA': 'M-1' }), filaHoja()];
  assert.equal(filaLibre_(valores, 1), 1);
});

test('filaLibre_: busca un bloque seguido para varias líneas de una factura', () => {
  const valores = [filaHoja(), filaHoja({ FECHA: 'x' }), filaHoja(), filaHoja()];
  assert.equal(filaLibre_(valores, 2), 2);
});

test('filaLibre_: si no cabe, el bloque sigue después del final (hay que agregar filas)', () => {
  const valores = [filaHoja({ FECHA: 'x' }), filaHoja()];
  assert.equal(filaLibre_(valores, 3), 1);
  assert.equal(filaLibre_([], 2), 0);
  assert.equal(filaLibre_([filaHoja({ FECHA: 'x' })], 1), 1);
});

test('filaComoObjeto_ nombra cada valor por su columna', () => {
  const o = filaComoObjeto_(filaHoja({ PROVEEDOR: 'Whole Foods', 'ID FILA': 'B-1' }));
  assert.equal(o.PROVEEDOR, 'Whole Foods');
  assert.equal(o['ID FILA'], 'B-1');
});

test('textoCelda_: fechas como AAAA-MM-DD, números con 2 decimales, texto tal cual', () => {
  assert.equal(textoCelda_(new Date(2026, 8, 5)), '2026-09-05');
  assert.equal(textoCelda_(25), '25.00');
  assert.equal(textoCelda_(' Beto '), 'Beto');
  assert.equal(textoCelda_(''), '');
  assert.equal(textoCelda_(null), '');
});

const filasEscritas = [
  {
    'ID FILA': 'BOT-1', FECHA: '2026-09-26', 'ID FACTURA': 'PENDIENTE-20260926', PROVEEDOR: 'PENDIENTE',
    'CLASE DE GASTO': 'PENDIENTE', 'GASTO (USD)': 30, REVISAR: 'PENDIENTE: FECHA, TOTAL', TIPO: 'GASTO',
  },
  {
    'ID FILA': 'BOT-2', FECHA: '2026-09-26', 'ID FACTURA': 'PENDIENTE-20260926', PROVEEDOR: 'PENDIENTE',
    'CLASE DE GASTO': 'PENDIENTE', 'GASTO (USD)': 30, REVISAR: 'PENDIENTE: FECHA, TOTAL', TIPO: 'GASTO',
  },
];

test('preguntaEstado_: fila PREGUNTA/ABIERTA con los ID FILA y lo que escribió el bot', () => {
  const creado = new Date(2026, 8, 26, 16, 0);
  const fila = preguntaEstado_({
    creado, clave: 900, preguntas: ['fecha', 'proveedor', 'total'], filas: filasEscritas, pestana: 'Septiembre 2026',
  });
  assert.equal(fila.length, COLUMNAS_ESTADO.length);
  const o = Object.fromEntries(COLUMNAS_ESTADO.map((c, i) => [c, fila[i]]));
  assert.equal(o.CREADO, creado);
  assert.equal(o.TIPO, TIPO_ESTADO_PREGUNTA);
  assert.equal(o.CLAVE, 900);
  assert.equal(o['ID FILAS'], 'BOT-1,BOT-2');
  assert.equal(o.ESTADO, 'ABIERTA');
  const datos = JSON.parse(o.DATOS);
  assert.deepEqual(datos.preguntas, ['fecha', 'proveedor', 'total']);
  assert.equal(datos.pestana, 'Septiembre 2026');
  assert.deepEqual(datos.escrito['BOT-1'], {
    FECHA: '2026-09-26', PROVEEDOR: 'PENDIENTE', 'ID FACTURA': 'PENDIENTE-20260926', 'GASTO (USD)': 30,
    REVISAR: 'PENDIENTE: FECHA, TOTAL',
  });
});

test('preguntaEstado_: depositante guarda el "Beto" que puso el bot', () => {
  const fila = preguntaEstado_({
    creado: new Date(), clave: '', preguntas: ['depositante'], pestana: 'Septiembre 2026',
    filas: [{ 'ID FILA': 'BOT-9', PROVEEDOR: 'Beto', TIPO: 'DEPÓSITO' }],
  });
  const datos = JSON.parse(fila[COLUMNAS_ESTADO.indexOf('DATOS')]);
  assert.deepEqual(datos.escrito['BOT-9'], { PROVEEDOR: 'Beto' });
});

test('preguntaEstado_: monto ilegible no tiene filas y guarda los datos para escribir después', () => {
  const fila = preguntaEstado_({
    creado: new Date(), clave: 7, preguntas: ['monto'], filas: [], pestana: '',
    extra: { datos: { intencion: 'GASTO', proveedor: 'Taxi' }, fechaMensaje: '2026-09-26', idMensaje: 55 },
  });
  assert.equal(fila[COLUMNAS_ESTADO.indexOf('ID FILAS')], '');
  const datos = JSON.parse(fila[COLUMNAS_ESTADO.indexOf('DATOS')]);
  assert.equal(datos.datos.proveedor, 'Taxi');
  assert.equal(datos.idMensaje, 55);
  assert.deepEqual(datos.escrito, {});
});

test('preguntasAbiertas_: solo PREGUNTA/ABIERTA, con número de fila de _ESTADO', () => {
  const datos = JSON.stringify({ preguntas: ['fecha'], pestana: 'Septiembre 2026', escrito: {} });
  const filas = [
    ['2026-09-26T10:00:00', 'UPDATE', 1, '', '', 'VISTO'],
    ['2026-09-26T11:00:00', 'PREGUNTA', 900, 'BOT-1,BOT-2', datos, 'ABIERTA'],
    ['2026-09-26T12:00:00', 'PREGUNTA', '', 'BOT-3', datos, 'CERRADA'],
    ['2026-09-26T13:00:00', 'PREGUNTA', '', 'BOT-4', 'no es json', 'ABIERTA'],
  ];
  const abiertas = preguntasAbiertas_(filas);
  assert.equal(abiertas.length, 1);
  assert.equal(abiertas[0].fila, 3);
  assert.equal(abiertas[0].idMensajeBot, 900);
  assert.deepEqual(abiertas[0].idFilas, ['BOT-1', 'BOT-2']);
  assert.deepEqual(abiertas[0].preguntas, ['fecha']);
  assert.equal(abiertas[0].creado, '2026-09-26T11:00:00');
});

test('preguntasAbiertas_: sin CLAVE el idMensajeBot es null; sin ID FILAS la lista va vacía', () => {
  const datos = JSON.stringify({ preguntas: ['monto'], escrito: {} });
  const [p] = preguntasAbiertas_([['x', 'PREGUNTA', '', '', datos, 'ABIERTA']]);
  assert.equal(p.idMensajeBot, null);
  assert.deepEqual(p.idFilas, []);
  assert.deepEqual(p.escrito, {});
});

test('cambiosRespuesta_: solo lo que se preguntó y vino válido', () => {
  const r = { proveedor: 'Whole Foods', fecha: '2026-08-30', clase: 'COMIDA', total: 31, lineas: [] };
  assert.deepEqual(cambiosRespuesta_(r, ['fecha', 'proveedor']), { FECHA: '2026-08-30', PROVEEDOR: 'Whole Foods' });
  assert.deepEqual(cambiosRespuesta_(r, ['clase', 'total']), { 'CLASE DE GASTO': 'COMIDA', 'GASTO (USD)': 31 });
  assert.deepEqual(cambiosRespuesta_(r, ['depositante']), { PROVEEDOR: 'Whole Foods' });
});

test('cambiosRespuesta_: el total en otra moneda va a MONTO ORIGINAL y a GASTO con la tasa de la fila', () => {
  const r = { total: 44000, lineas: [] };
  const contexto = { moneda: 'COP', tasa: '4000 (2026-09-25)' };
  assert.deepEqual(cambiosRespuesta_(r, ['total'], contexto),
    { 'MONTO ORIGINAL': 44000, 'GASTO (USD)': 11 });
});

test('cambiosRespuesta_: el total en otra moneda sin tasa legible solo anota MONTO ORIGINAL', () => {
  const r = { total: 44000, lineas: [] };
  for (const tasa of ['PENDIENTE', '', undefined, '0 (2026-09-25)']) {
    assert.deepEqual(cambiosRespuesta_(r, ['total'], { moneda: 'COP', tasa }),
      { 'MONTO ORIGINAL': 44000 }, String(tasa));
  }
});

test('cambiosRespuesta_: el total en PAB va a GASTO (USD), como en USD', () => {
  const r = { total: 31, lineas: [] };
  assert.deepEqual(cambiosRespuesta_(r, ['total'], { moneda: 'PAB' }), { 'GASTO (USD)': 31 });
});

test('cambiosRespuesta_: el proveedor de la respuesta usa la ortografía del historial (Supuesto AB, punto F)', () => {
  const r = { proveedor: 'seven 11', fecha: null, clase: null, total: null, lineas: [] };
  const contexto = { historial: [{ proveedor: 'Seven 11', clase: 'GROCERIES' }, { proveedor: 'Seven 11', clase: 'GROCERIES' }] };
  assert.deepEqual(cambiosRespuesta_(r, ['proveedor'], contexto), { PROVEEDOR: 'Seven 11' });
});

test('cambiosRespuesta_: ignora fecha inválida, clase PENDIENTE y total no numérico', () => {
  const r = { proveedor: null, fecha: '30/08', clase: 'PENDIENTE', total: null };
  assert.deepEqual(cambiosRespuesta_(r, ['fecha', 'proveedor', 'clase', 'total']), {});
});

test('cambiosRespuesta_: con contexto, el mapeo determinístico de clase gana aunque Gemini diga PENDIENTE (defecto E2)', () => {
  const r = { proveedor: null, fecha: null, clase: 'PENDIENTE', total: null };
  const contexto = { texto: 'super', casa: null, fecha: '2026-09-26', categorias: [] };
  assert.deepEqual(cambiosRespuesta_(r, ['clase'], contexto), { 'CLASE DE GASTO': 'GROCERIES W4 NORTE' });
});

test('cambiosRespuesta_: sin mapeo determinístico, cae a lo que dijo Gemini', () => {
  const r = { clase: 'MEDS' };
  const contexto = { texto: 'no sé qué fue', casa: null, fecha: '2026-09-26', categorias: [] };
  assert.deepEqual(cambiosRespuesta_(r, ['clase'], contexto), { 'CLASE DE GASTO': 'MEDS' });
});

test('cambiosRespuesta_: sin contexto sigue usando solo lo que dijo Gemini', () => {
  const r = { clase: 'MEDS' };
  assert.deepEqual(cambiosRespuesta_(r, ['clase']), { 'CLASE DE GASTO': 'MEDS' });
});

test('cambiosRespuesta_: si Gemini elige un nombre de grupo (no una palabra del usuario), se convierte a la etiqueta real', () => {
  const r = { clase: 'Mantenimiento y reparaciones' };
  const contexto = { texto: 'quedó arreglado ese problema de la casa', casa: 'PRINCIPAL', fecha: '2026-09-26', categorias: [] };
  assert.deepEqual(cambiosRespuesta_(r, ['clase'], contexto), { 'CLASE DE GASTO': 'MAINTENANCE NORTE' });
});

test('cambiosRespuesta_: texto ambiguo (dos grupos) no se anota y no cae a lo que dijo Gemini (hallazgo de revisión)', () => {
  const r = { clase: 'Carro' };
  const contexto = { texto: 'lavado del carro', casa: null, fecha: '2026-09-26', categorias: [] };
  assert.deepEqual(cambiosRespuesta_(r, ['clase'], contexto), {});
});

const actual = (cambios = {}) => ({ ...filasEscritas[0], ORIGEN: ORIGEN_BOT, ...cambios });
const escritoDe = (fila) => ({
  FECHA: fila.FECHA, PROVEEDOR: fila.PROVEEDOR, 'ID FACTURA': fila['ID FACTURA'],
  'GASTO (USD)': fila['GASTO (USD)'], REVISAR: fila.REVISAR, 'CLASE DE GASTO': fila['CLASE DE GASTO'],
});

test('planRespuesta_: aplica lo pendiente y rehace ID FACTURA y REVISAR', () => {
  const filas = [{ idFila: 'BOT-1', valores: actual() }, { idFila: 'BOT-2', valores: actual({ 'ID FILA': 'BOT-2' }) }];
  const escrito = { 'BOT-1': escritoDe(filasEscritas[0]), 'BOT-2': escritoDe(filasEscritas[1]) };
  const plan = planRespuesta_(filas, escrito, { PROVEEDOR: 'Whole Foods', 'GASTO (USD)': 32 }, []);
  assert.deepEqual(plan.porFila['BOT-1'], {
    PROVEEDOR: 'Whole Foods', 'GASTO (USD)': 32, 'ID FACTURA': 'WHOLEFOODS-20260926', REVISAR: 'PENDIENTE: FECHA',
  });
  assert.deepEqual(plan.porFila['BOT-2'], plan.porFila['BOT-1']);
  assert.deepEqual(plan.corregidas, []);
  assert.equal(plan.moverA, null);
  assert.deepEqual(plan.resueltas.sort(), ['GASTO (USD)', 'PROVEEDOR']);
});

test('planRespuesta_: quita la marca TOTAL aunque traiga la explicación entre paréntesis (P2)', () => {
  const conExplicacion = { ...filasEscritas[0], REVISAR: 'PENDIENTE: FECHA, TOTAL (partes suman 15.00)' };
  const filas = [{ idFila: 'BOT-1', valores: { ...conExplicacion, ORIGEN: ORIGEN_BOT } }];
  const plan = planRespuesta_(filas, { 'BOT-1': escritoDe(conExplicacion) }, { 'GASTO (USD)': 32 }, []);
  assert.equal(plan.porFila['BOT-1'].REVISAR, 'PENDIENTE: FECHA');
});

test('planRespuesta_: gana el Sheet si el usuario ya corrigió la celda', () => {
  const filas = [{ idFila: 'BOT-1', valores: actual({ 'GASTO (USD)': 25 }) }];
  const plan = planRespuesta_(filas, { 'BOT-1': escritoDe(filasEscritas[0]) }, { 'GASTO (USD)': 32 }, []);
  assert.deepEqual(plan.porFila['BOT-1'], {});
  assert.deepEqual(plan.corregidas, [{ columna: 'GASTO (USD)', valor: 25 }]);
  assert.deepEqual(plan.resueltas, ['GASTO (USD)']);
});

test('planRespuesta_: la fecha del Sheet (Date) cuenta igual que la escrita por el bot', () => {
  const filas = [{ idFila: 'BOT-1', valores: actual({ FECHA: new Date(2026, 8, 26) }) }];
  const plan = planRespuesta_(filas, { 'BOT-1': escritoDe(filasEscritas[0]) }, { FECHA: '2026-09-25' }, []);
  assert.equal(plan.porFila['BOT-1'].FECHA, '2026-09-25');
  assert.equal(plan.porFila['BOT-1']['ID FACTURA'], 'PENDIENTE-20260925');
  assert.equal(plan.porFila['BOT-1'].REVISAR, 'PENDIENTE: TOTAL');
  assert.equal(plan.moverA, null);
});

test('planRespuesta_: fecha de otro mes pide mover la fila', () => {
  const filas = [{ idFila: 'BOT-1', valores: actual() }];
  const plan = planRespuesta_(filas, { 'BOT-1': escritoDe(filasEscritas[0]) }, { FECHA: '2026-08-30' }, ['PENDIENTE-20260830']);
  assert.deepEqual(plan.moverA, { anio: 2026, mes: 8 });
  assert.equal(plan.porFila['BOT-1']['ID FACTURA'], 'PENDIENTE-20260830-2');
});

test('planRespuesta_: si el usuario cambió REVISAR o ID FACTURA a mano, no se tocan', () => {
  const filas = [{ idFila: 'BOT-1', valores: actual({ REVISAR: 'ok', 'ID FACTURA': 'MIA-1' }) }];
  const plan = planRespuesta_(filas, { 'BOT-1': escritoDe(filasEscritas[0]) }, { PROVEEDOR: 'Whole Foods', FECHA: '2026-09-25' }, []);
  assert.deepEqual(plan.porFila['BOT-1'], { PROVEEDOR: 'Whole Foods', FECHA: '2026-09-25' });
});

test('planRespuesta_: depósito cambia "Beto" solo si sigue igual', () => {
  const deposito = (proveedor) => ({
    'ID FILA': 'BOT-9', ORIGEN: ORIGEN_BOT, PROVEEDOR: proveedor, TIPO: 'DEPÓSITO',
    FECHA: '2026-09-26', 'ID FACTURA': 'DEPOSITO-20260926',
  });
  const escrito = { 'BOT-9': { PROVEEDOR: 'Beto' } };
  const a = planRespuesta_([{ idFila: 'BOT-9', valores: deposito('Beto') }], escrito, { PROVEEDOR: 'Carlos' }, []);
  assert.deepEqual(a.porFila['BOT-9'], { PROVEEDOR: 'Carlos' });
  const b = planRespuesta_([{ idFila: 'BOT-9', valores: deposito('Ana') }], escrito, { PROVEEDOR: 'Carlos' }, []);
  assert.deepEqual(b.porFila['BOT-9'], {});
  assert.deepEqual(b.corregidas, [{ columna: 'PROVEEDOR', valor: 'Ana' }]);
});

test('planRespuesta_: fecha de un depósito rehace el ID con prefijo DEPOSITO', () => {
  const valores = {
    'ID FILA': 'BOT-9', ORIGEN: ORIGEN_BOT, PROVEEDOR: 'Beto', TIPO: 'DEPÓSITO', FECHA: '2026-09-26',
    'ID FACTURA': 'DEPOSITO-20260926', REVISAR: 'PENDIENTE: FECHA',
  };
  const escrito = { 'BOT-9': { FECHA: '2026-09-26', 'ID FACTURA': 'DEPOSITO-20260926', REVISAR: 'PENDIENTE: FECHA' } };
  const plan = planRespuesta_([{ idFila: 'BOT-9', valores }], escrito, { FECHA: '2026-09-24' }, []);
  assert.deepEqual(plan.porFila['BOT-9'], { FECHA: '2026-09-24', 'ID FACTURA': 'DEPOSITO-20260924', REVISAR: '' });
});

test('planRespuesta_: un proveedor que no sirve para ID (solo símbolos) deja el ID FACTURA como estaba', () => {
  const filas = [{ idFila: 'BOT-1', valores: actual() }];
  const plan = planRespuesta_(filas, { 'BOT-1': escritoDe(filasEscritas[0]) }, { PROVEEDOR: '***' }, []);
  assert.deepEqual(plan.porFila['BOT-1'], { PROVEEDOR: '***' });
});

test('planRespuesta_: nunca toca filas que no son del bot', () => {
  const filas = [{ idFila: 'BOT-1', valores: actual({ ORIGEN: 'MANUAL' }) }];
  const plan = planRespuesta_(filas, { 'BOT-1': escritoDe(filasEscritas[0]) }, { PROVEEDOR: 'X' }, []);
  assert.deepEqual(plan.porFila, {});
  assert.deepEqual(plan.ajenas, ['BOT-1']);
});

test('planRespuesta_: una columna que el bot no marcó como pendiente no se cambia', () => {
  const filas = [{ idFila: 'BOT-1', valores: actual() }];
  const plan = planRespuesta_(filas, { 'BOT-1': { PROVEEDOR: 'PENDIENTE' } }, { 'GASTO (USD)': 99 }, []);
  assert.deepEqual(plan.porFila['BOT-1'], {});
  assert.deepEqual(plan.resueltas, []);
});

test('mensajeCorregido_ usa el valor que quedó en la hoja', () => {
  assert.equal(mensajeCorregido_(25), 'Ya lo corregiste en la hoja (quedó 25.00). Lo dejé así.');
  assert.equal(mensajeCorregido_('Ana'), 'Ya lo corregiste en la hoja (quedó Ana). Lo dejé así.');
});

test('datosConMonto_: el monto que faltaba pasa a ser el total, con una sola línea', () => {
  const d = datosConMonto_({ intencion: 'GASTO', total: null, lineas: [{ monto: null }] }, 12.5);
  assert.equal(d.total, 12.5);
  assert.deepEqual(d.lineas, []);
  assert.equal(d.intencion, 'GASTO');
});
