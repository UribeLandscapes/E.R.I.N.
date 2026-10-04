const test = require('node:test');
const assert = require('node:assert/strict');

// En Apps Script CONFIG es global; en Node se pone a mano con la configuración falsa de prueba.
global.CONFIG = require('./configPrueba.js').CONFIG;

// En Apps Script estos nombres son globales (Reglas.js, Hoja.js); en Node se ponen a mano.
Object.assign(global, require('../src/Reglas.js'));
Object.assign(global, require('../src/Hoja.js'));

const {
  GRUPOS_CLASE, nombresGrupos_, grupoPorNombre_, etiquetaGrupo_, etiquetaAGrupo_, listaClases_,
  textoListaClases_, instruccionClases_, instruccionCasas_, claseDeRespuesta_, claseDeExtraccion_, claseInferidaProveedor_,
  claseDeGasto_,
} = require('../src/Clases.js');

test('GRUPOS_CLASE tiene los 17 grupos en orden, cada uno con nombre, ejemplos y palabras', () => {
  assert.equal(GRUPOS_CLASE.length, 17);
  GRUPOS_CLASE.forEach((g, i) => {
    assert.equal(g.numero, i + 1);
    assert.ok(g.nombre);
    assert.ok(g.ejemplos);
    assert.ok(g.palabras.length > 0);
  });
  assert.equal(nombresGrupos_().length, 17);
  assert.deepEqual(GRUPOS_CLASE.slice(13).map((g) => g.nombre), [
    'Garrafones de agua', 'SIPE', 'Décimo tercer mes', 'Varios',
  ]);
  assert.equal(GRUPOS_CLASE[13].ejemplos, 'garrafones y botellones de agua');
  assert.deepEqual(GRUPOS_CLASE[13].palabras, [
    'garrafon', 'garrafones', 'garrafon de agua', 'garrafones de agua',
  ]);
  assert.deepEqual(GRUPOS_CLASE[13].gana, [7]);
  assert.equal(GRUPOS_CLASE[14].ejemplos, 'pago de la SIPE / Caja de Seguro Social');
  assert.deepEqual(GRUPOS_CLASE[14].palabras, ['sipe']);
  assert.equal(GRUPOS_CLASE[15].ejemplos, 'décimo tercer mes del personal');
  assert.deepEqual(GRUPOS_CLASE[15].palabras, ['decimo', 'decimo tercer mes', 'xiii mes']);
  assert.deepEqual(GRUPOS_CLASE[15].gana, [8]);
  assert.ok(!GRUPOS_CLASE[0].palabras.includes('garrafon'));
  assert.ok(!GRUPOS_CLASE[0].palabras.includes('garrafones'));
});

test('grupoPorNombre_ encuentra por nombre exacto sin importar mayúsculas', () => {
  assert.equal(grupoPorNombre_('Supermercado').numero, 1);
  assert.equal(grupoPorNombre_('varios').numero, 17);
  assert.equal(grupoPorNombre_('no existe'), null);
});

test('etiquetaGrupo_: grupo 1 (Supermercado) usa GROCERIES PLAYA o la semana del mes', () => {
  assert.equal(etiquetaGrupo_(1, 'SECUNDARIA', '2026-09-26'), 'GROCERIES PLAYA');
  assert.equal(etiquetaGrupo_(1, 'PRINCIPAL', '2026-09-26'), 'GROCERIES W4 NORTE');
  assert.equal(etiquetaGrupo_(1, null, '2026-09-26'), 'GROCERIES W4 NORTE');
  assert.equal(etiquetaGrupo_(1, 'COMPARTIDO', '2026-09-01'), 'GROCERIES W1 NORTE');
});

test('etiquetaGrupo_: grupo 6 (mantenimiento) varía por casa', () => {
  assert.equal(etiquetaGrupo_(6, 'PRINCIPAL', '2026-09-26'), 'MAINTENANCE NORTE');
  assert.equal(etiquetaGrupo_(6, 'SECUNDARIA', '2026-09-26'), 'MAINTENANCE PLAYA');
  assert.equal(etiquetaGrupo_(6, null, '2026-09-26'), 'MAINTENANCE');
});

test('etiquetaGrupo_: grupo 7 (servicios) varía por casa', () => {
  assert.equal(etiquetaGrupo_(7, 'SECUNDARIA', '2026-09-26'), 'PLAYA SERVICES');
  assert.equal(etiquetaGrupo_(7, 'PRINCIPAL', '2026-09-26'), 'NORTE SERVICES');
  assert.equal(etiquetaGrupo_(7, null, '2026-09-26'), 'NORTE SERVICES');
});

test('etiquetaGrupo_: el resto de grupos no depende de la casa', () => {
  assert.equal(etiquetaGrupo_(2, null, '2026-09-26'), 'MEDS');
  assert.equal(etiquetaGrupo_(3, null, '2026-09-26'), 'GAS & OIL');
  assert.equal(etiquetaGrupo_(4, null, '2026-09-26'), 'LAUNDRY SERVICES');
  assert.equal(etiquetaGrupo_(5, null, '2026-09-26'), 'VET');
  assert.equal(etiquetaGrupo_(8, null, '2026-09-26'), 'SALARIES');
  assert.equal(etiquetaGrupo_(9, null, '2026-09-26'), 'SPECIAL SALARIES');
  assert.equal(etiquetaGrupo_(10, null, '2026-09-26'), 'VEHICLE EXPENSES');
  assert.equal(etiquetaGrupo_(11, null, '2026-09-26'), 'TOLL & PARKING FEE');
  assert.equal(etiquetaGrupo_(12, null, '2026-09-26'), 'COURIER SERVICES');
  assert.equal(etiquetaGrupo_(13, null, '2026-09-26'), 'STAFF DINNER');
  assert.equal(etiquetaGrupo_(15, null, '2026-09-26'), 'SIPE');
  assert.equal(etiquetaGrupo_(16, null, '2026-09-26'), 'SALARIES - DECIMO TERCER MES');
  assert.equal(etiquetaGrupo_(17, null, '2026-09-26'), 'MISCELANEOS');
});

test('etiquetaGrupo_: garrafones de agua varía por casa', () => {
  assert.equal(etiquetaGrupo_(14, 'SECUNDARIA', '2026-09-26'), 'GARRAFONES DE AGUA PLAYA');
  assert.equal(etiquetaGrupo_(14, 'PRINCIPAL', '2026-09-26'), 'GARRAFONES DE AGUA');
  assert.equal(etiquetaGrupo_(14, null, '2026-09-26'), 'GARRAFONES DE AGUA');
});

test('etiquetaGrupo_ con un número que no es grupo devuelve null', () => {
  assert.equal(etiquetaGrupo_(0, null, '2026-09-26'), null);
  assert.equal(etiquetaGrupo_(18, null, '2026-09-26'), null);
});

test('etiquetaAGrupo_ es la inversa de la tabla del punto B', () => {
  assert.equal(etiquetaAGrupo_('GROCERIES'), 1);
  assert.equal(etiquetaAGrupo_('GROCERIES W1 NORTE'), 1);
  assert.equal(etiquetaAGrupo_('GROCERIES PLAYA'), 1);
  assert.equal(etiquetaAGrupo_('MEDS'), 2);
  assert.equal(etiquetaAGrupo_('GAS & OIL'), 3);
  assert.equal(etiquetaAGrupo_('LAUNDRY SERVICES'), 4);
  assert.equal(etiquetaAGrupo_('VET'), 5);
  assert.equal(etiquetaAGrupo_('MAINTENANCE'), 6);
  assert.equal(etiquetaAGrupo_('MAINTENANCE NORTE'), 6);
  assert.equal(etiquetaAGrupo_('MAINTENANCE PLAYA'), 6);
  assert.equal(etiquetaAGrupo_('NORTE SERVICES'), 7);
  assert.equal(etiquetaAGrupo_('SERVICES NORTE'), 7);
  assert.equal(etiquetaAGrupo_('PLAYA SERVICES'), 7);
  assert.equal(etiquetaAGrupo_('SERVICES PLAYA'), 7);
  assert.equal(etiquetaAGrupo_('SERVICES'), 7);
  assert.equal(etiquetaAGrupo_('SALARIES'), 8);
  assert.equal(etiquetaAGrupo_('SALARIES  '), 8);
  assert.equal(etiquetaAGrupo_('SPECIAL SALARIES'), 9);
  assert.equal(etiquetaAGrupo_('VEHICLE EXPENSES'), 10);
  assert.equal(etiquetaAGrupo_('TOLL & PARKING FEE'), 11);
  assert.equal(etiquetaAGrupo_('COURIER SERVICES'), 12);
  assert.equal(etiquetaAGrupo_('STAFF DINNER'), 13);
  assert.equal(etiquetaAGrupo_('GARRAFONES DE AGUA'), 14);
  assert.equal(etiquetaAGrupo_('GARRAFONES DE AGUA PLAYA'), 14);
  assert.equal(etiquetaAGrupo_('GARRAFONES DE AGUA [PLAYA]'), 14);
  assert.equal(etiquetaAGrupo_('SIPE'), 15);
  assert.equal(etiquetaAGrupo_('SALARIES - DECIMO TERCER MES'), 16);
  assert.equal(etiquetaAGrupo_('MISCELANEOS'), 17);
  assert.equal(etiquetaAGrupo_('ALGO RARO'), null);
  assert.equal(etiquetaAGrupo_(''), null);
});

test('listaClases_ y textoListaClases_ traen las 17 líneas numeradas', () => {
  const lista = listaClases_();
  assert.equal(lista.length, 17);
  assert.equal(lista[0], '1. Supermercado (Whole Foods, Spar, Seven 11, frutería)');
  assert.equal(lista[13], '14. Garrafones de agua (garrafones y botellones de agua)');
  assert.equal(lista[14], '15. SIPE (pago de la SIPE / Caja de Seguro Social)');
  assert.equal(lista[15], '16. Décimo tercer mes (décimo tercer mes del personal)');
  assert.equal(lista[16], '17. Varios (lo que no encaje en las demás)');
  const texto = textoListaClases_();
  assert.match(texto, /^1\. Supermercado/);
  assert.match(texto, /número de la lista/);
});

test('listaClases_: los ejemplos de servicios y comida del personal ya no repiten el nombre del grupo', () => {
  const texto = textoListaClases_();
  assert.match(texto, /recibos de ENSA, Naturgy, IDAAN, Tigo, \+Móvil/);
  assert.match(texto, /almuerzos o cenas para el equipo/);
});

test('instruccionClases_ trae la lista y la regla de preferir el grupo', () => {
  const texto = instruccionClases_();
  assert.match(texto, /17 grupos/);
  assert.match(texto, /1\. Supermercado/);
  assert.match(texto, /Prefiere el nombre de uno de estos 17 grupos/);
});

test('claseDeRespuesta_: un número 1-17 da la etiqueta del grupo', () => {
  assert.equal(claseDeRespuesta_('1', null, '2026-09-26', []), 'GROCERIES W4 NORTE');
  assert.equal(claseDeRespuesta_('3', null, '2026-09-26', []), 'GAS & OIL');
  assert.equal(claseDeRespuesta_(' 14 ', null, '2026-09-26', []), 'GARRAFONES DE AGUA');
  assert.equal(claseDeRespuesta_('15', null, '2026-09-26', []), 'SIPE');
  assert.equal(claseDeRespuesta_('16', null, '2026-09-26', []), 'SALARIES - DECIMO TERCER MES');
  assert.equal(claseDeRespuesta_('17', null, '2026-09-26', []), 'MISCELANEOS');
});

test('claseDeRespuesta_: palabras del usuario dan el grupo (defecto E2)', () => {
  assert.equal(claseDeRespuesta_('super', null, '2026-09-26', []), 'GROCERIES W4 NORTE');
  assert.equal(claseDeRespuesta_('supermercado', 'SECUNDARIA', '2026-09-26', []), 'GROCERIES PLAYA');
  assert.equal(claseDeRespuesta_('era en la farmacia', null, '2026-09-26', []), 'MEDS');
  assert.equal(claseDeRespuesta_('gasolina', null, '2026-09-26', []), 'GAS & OIL');
});

test('claseDeRespuesta_: una etiqueta vieja escrita tal cual (sin mayúsculas) se usa tal cual', () => {
  assert.equal(claseDeRespuesta_('groceries', null, '2026-09-26', ['GROCERIES', 'MEDS']), 'GROCERIES');
  assert.equal(claseDeRespuesta_('  MEDS  ', null, '2026-09-26', ['GROCERIES', 'MEDS']), 'MEDS');
});

test('claseDeRespuesta_: sin número, palabra ni etiqueta conocida devuelve null', () => {
  assert.equal(claseDeRespuesta_('no sé', null, '2026-09-26', ['GROCERIES']), null);
  assert.equal(claseDeRespuesta_('', null, '2026-09-26', []), null);
  assert.equal(claseDeRespuesta_('20', null, '2026-09-26', []), null);
});

test('claseDeRespuesta_: compara palabras completas, no subcadenas (hallazgo de revisión)', () => {
  assert.equal(claseDeRespuesta_('spares', null, '2026-09-26', []), null);
  assert.equal(claseDeRespuesta_('autopista', null, '2026-09-26', []), null);
});

test('claseDeRespuesta_: si el texto trae palabras de dos grupos distintos, PENDIENTE (vuelve a preguntar)', () => {
  assert.equal(claseDeRespuesta_('lavado del carro', null, '2026-09-26', []), 'PENDIENTE');
  assert.equal(claseDeRespuesta_('comida del perro', null, '2026-09-26', []), 'PENDIENTE');
  assert.equal(claseDeRespuesta_('super y farmacia', null, '2026-09-26', []), 'PENDIENTE');
});

test('claseDeRespuesta_: los grupos específicos vencen a servicios y salarios', () => {
  const fecha = '2026-09-26';
  assert.equal(claseDeRespuesta_('garrafones de agua', null, fecha, []), 'GARRAFONES DE AGUA');
  assert.equal(claseDeRespuesta_('garrafón', 'SECUNDARIA', fecha, []), 'GARRAFONES DE AGUA PLAYA');
  assert.equal(claseDeRespuesta_('agua', null, fecha, []), 'NORTE SERVICES');
  assert.equal(claseDeRespuesta_('super', null, fecha, []), 'GROCERIES W4 NORTE');
  assert.equal(claseDeRespuesta_('sipe', null, fecha, []), 'SIPE');
  assert.equal(claseDeRespuesta_('décimo tercer mes', null, fecha, []), 'SALARIES - DECIMO TERCER MES');
  assert.equal(claseDeRespuesta_('decimo', null, fecha, []), 'SALARIES - DECIMO TERCER MES');
  assert.equal(claseDeRespuesta_('xiii mes', null, fecha, []), 'SALARIES - DECIMO TERCER MES');
  assert.equal(claseDeRespuesta_('salario décimo tercer mes', null, fecha, []), 'SALARIES - DECIMO TERCER MES');
  assert.equal(claseDeRespuesta_('salario', null, fecha, []), 'SALARIES');
});

test('claseDeRespuesta_: casos que deben seguir funcionando igual que antes', () => {
  assert.equal(claseDeRespuesta_('super', null, '2026-09-26', []), 'GROCERIES W4 NORTE');
  assert.equal(claseDeRespuesta_('spar', null, '2026-09-26', []), 'GROCERIES W4 NORTE');
  assert.equal(claseDeRespuesta_('en el Spar', null, '2026-09-26', []), 'GROCERIES W4 NORTE');
  assert.equal(claseDeRespuesta_('técnicos', null, '2026-09-26', []), 'MAINTENANCE');
  assert.equal(claseDeRespuesta_('era en la farmacia', null, '2026-09-26', []), 'MEDS');
  assert.equal(claseDeRespuesta_('comida', null, '2026-09-26', []), 'STAFF DINNER');
  assert.equal(claseDeRespuesta_('lavado', null, '2026-09-26', []), 'LAUNDRY SERVICES');
  assert.equal(claseDeRespuesta_('carro', null, '2026-09-26', []), 'VEHICLE EXPENSES');
  assert.equal(claseDeRespuesta_('Servicios: luz, agua, internet, teléfono', null, '2026-09-26', []), 'NORTE SERVICES');
  assert.equal(claseDeRespuesta_('comida del personal', null, '2026-09-26', []), 'STAFF DINNER');
});

test('claseDeExtraccion_: un nombre de grupo de Gemini se convierte a la etiqueta real', () => {
  assert.equal(claseDeExtraccion_('Supermercado', 'SECUNDARIA', '2026-09-26'), 'GROCERIES PLAYA');
  assert.equal(claseDeExtraccion_('Gasolina', null, '2026-09-26'), 'GAS & OIL');
});

test('claseDeExtraccion_: una etiqueta vieja o PENDIENTE se deja tal cual', () => {
  assert.equal(claseDeExtraccion_('GROCERIES', null, '2026-09-26'), 'GROCERIES');
  assert.equal(claseDeExtraccion_('PENDIENTE', null, '2026-09-26'), 'PENDIENTE');
});

test('claseInferidaProveedor_: 10 filas de Whole Foods todas GROCERIES* infieren el grupo (ejemplo del encargo)', () => {
  const historial = Array.from({ length: 10 }, (_, i) => ({
    proveedor: 'Whole Foods', clase: i % 2 ? 'GROCERIES' : 'GROCERIES W2 NORTE',
  }));
  assert.equal(claseInferidaProveedor_(historial, 'Whole Foods', 'PRINCIPAL', '2026-09-26'), 'GROCERIES W4 NORTE');
});

test('claseInferidaProveedor_: menos de 2 filas no infiere nada (PENDIENTE)', () => {
  const historial = [{ proveedor: 'Whole Foods', clase: 'GROCERIES' }];
  assert.equal(claseInferidaProveedor_(historial, 'Whole Foods', null, '2026-09-26'), null);
});

test('claseInferidaProveedor_: proveedor IKEA con clases divididas (MISCELANEOS/MAINTENANCE) no infiere', () => {
  const historial = [
    { proveedor: 'IKEA', clase: 'MISCELANEOS' },
    { proveedor: 'IKEA', clase: 'MISCELANEOS' },
    { proveedor: 'IKEA', clase: 'MAINTENANCE' },
    { proveedor: 'IKEA', clase: 'MAINTENANCE' },
  ];
  assert.equal(claseInferidaProveedor_(historial, 'IKEA', null, '2026-09-26'), null);
});

test('claseInferidaProveedor_ compara con normalizarProveedor_ (acentos, mayúsculas)', () => {
  const historial = [
    { proveedor: 'WHOLEFOODS', clase: 'GROCERIES' },
    { proveedor: 'whole foods', clase: 'GROCERIES' },
  ];
  assert.equal(claseInferidaProveedor_(historial, 'Whóle Foods', null, '2026-09-26'), 'GROCERIES W4 NORTE');
});

test('claseInferidaProveedor_ sin coincidencias del proveedor devuelve null', () => {
  assert.equal(claseInferidaProveedor_([{ proveedor: 'Otro', clase: 'GROCERIES' }], 'Whole Foods', null, '2026-09-26'), null);
});

// --- claseDeGasto_: dominante gana a la elección de Gemini ---

test('claseDeGasto_: proveedor dominante gana a la clase que eligió Gemini', () => {
  const historial = Array.from({ length: 3 }, () => ({ proveedor: 'Whole Foods', clase: 'GROCERIES' }));
  assert.equal(
    claseDeGasto_(historial, 'Whole Foods', 'Mantenimiento y reparaciones', 'PRINCIPAL', '2026-09-26'),
    'GROCERIES W4 NORTE',
  );
});

test('claseDeGasto_: sin dominante usa la elección de Gemini (nombre de grupo o etiqueta vieja)', () => {
  assert.equal(claseDeGasto_([], 'Whole Foods', 'Supermercado', 'PRINCIPAL', '2026-09-26'), 'GROCERIES W4 NORTE');
  assert.equal(claseDeGasto_([], 'Whole Foods', 'GROCERIES', null, '2026-09-26'), 'GROCERIES');
});

test('claseDeGasto_: sin dominante y sin elección clara de Gemini queda PENDIENTE', () => {
  assert.equal(claseDeGasto_([], 'Whole Foods', 'PENDIENTE', null, '2026-09-26'), 'PENDIENTE');
});

test('claseDeGasto_: proveedor PENDIENTE o vacío nunca usa el historial', () => {
  const historial = Array.from({ length: 5 }, () => ({ proveedor: 'PENDIENTE', clase: 'GROCERIES' }));
  assert.equal(claseDeGasto_(historial, 'PENDIENTE', 'Varios', null, '2026-09-26'), 'MISCELANEOS');
  assert.equal(claseDeGasto_(historial, '', 'Varios', null, '2026-09-26'), 'MISCELANEOS');
});

test('etiquetaGrupo_ y etiquetaAGrupo_ siguen las etiquetas de CONFIG.CASAS, no un texto fijo', () => {
  const configReal = global.CONFIG;
  const casas = configReal.CASAS;
  global.CONFIG = { ...configReal, CASAS: {
    PRINCIPAL: { ...casas.PRINCIPAL, etiqueta: 'LOMA ALTA' },
    SECUNDARIA: { ...casas.SECUNDARIA, etiqueta: 'LAGO' },
  } };
  try {
    assert.equal(etiquetaGrupo_(1, 'PRINCIPAL', '2026-09-26'), 'GROCERIES W4 LOMA ALTA');
    assert.equal(etiquetaGrupo_(7, 'SECUNDARIA', '2026-09-26'), 'LAGO SERVICES');
    assert.equal(etiquetaAGrupo_('SERVICES LOMA ALTA'), 7);
    assert.equal(etiquetaAGrupo_('lago services'), 7);
  } finally {
    global.CONFIG = configReal;
  }
});

test('instruccionCasas_ describe las dos casas y sus palabras desde CONFIG.CASAS', () => {
  const texto = instruccionCasas_().join(' ');
  assert.match(texto, /la Casa Norte en la ciudad \(clave PRINCIPAL\)/);
  assert.match(texto, /la Casa Playa en la costa/);
  assert.match(texto, /"Casa Norte", "norte" se refieren a la casa PRINCIPAL/);
  assert.match(texto, /"Casa Playa", "playa" a la SECUNDARIA/);
});
