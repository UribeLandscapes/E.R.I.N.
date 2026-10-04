const test = require('node:test');
const assert = require('node:assert/strict');

// En Apps Script CONFIG es global; en Node se pone a mano con la configuración falsa de prueba.
global.CONFIG = require('./configPrueba.js').CONFIG;

global.MESES = require('../src/Hoja.js').MESES;
Object.assign(global, require('../src/Hoja.js'));
global.textoSeguroCelda_ = require('../src/Escritura.js').textoSeguroCelda_;
Object.assign(global, require('../src/Historial.js'));
global.escaparRegex_ = require('../src/Clases.js').escaparRegex_;

const { COLUMNAS, leerPestanaMes_ } = require('../src/Hoja.js');
const { conClaves_ } = require('../src/Historial.js');
const {
  ORIGEN_ARCHIVO, mesDeArchivo_, archivoIncluido_, nombrePestanaArchivo_, pestanaDeGastos_,
  casaDeClase_, filasImportacion_, totalesImportacion_, planImportacion_, igualMonto_, dineroExacto_,
} = require('../src/Importacion.js');

const registro = (extra = {}) => ({
  fecha: '2026-07-01', proveedor: 'Tienda', clase: 'COMIDA', comentarios: '',
  deposito: null, gasto: 10, clave: 'clave-1', ...extra,
});
const fila = (valores) => COLUMNAS.map((nombre) => valores[nombre] ?? '');

test('mesDeArchivo_ encuentra el mes como palabra completa y el año de cuatro cifras', () => {
  assert.deepEqual(mesDeArchivo_('07. GASTOS DE JULIO 2026.xlsx'), { mes: 7, anio: 2026 });
  assert.deepEqual(mesDeArchivo_('08. GASTOS DE AGOSTO 2026 (1).xlsx'), { mes: 8, anio: 2026 });
  assert.deepEqual(mesDeArchivo_('gastos de ÁGOSTO 2026.XLSX'), { mes: 8, anio: 2026 });
  assert.deepEqual(mesDeArchivo_('JULIO-2026.xlsx'), { mes: 7, anio: 2026 });
  for (const nombre of ['GASTOS JULIOfalso 2026.xlsx', 'GASTOS JULIO 20260.xlsx',
    'GASTOS 2026.xlsx', 'GASTOS JULIO.xlsx']) assert.equal(mesDeArchivo_(nombre), null, nombre);
});

test('archivoIncluido_ limita la importación a enero a agosto de 2026', () => {
  for (let m = 1; m <= 8; m++) {
    assert.equal(archivoIncluido_({ mes: m, anio: 2026 }), true, `Mes ${m}`);
  }
  for (const valor of [null, { mes: 9, anio: 2026 }, { mes: 7, anio: 2025 }, { mes: 12, anio: 2026 }]) {
    assert.equal(archivoIncluido_(valor), false, JSON.stringify(valor));
  }
});

test('nombrePestanaArchivo_ queda fuera de las pestañas de mes del bot', () => {
  assert.equal(nombrePestanaArchivo_(2026, 7), 'Julio 2026 (archivo)');
  assert.equal(leerPestanaMes_(nombrePestanaArchivo_(2026, 7)), null);
});

test('pestanaDeGastos_ elige solo GASTOS del mes indicado', () => {
  const julio = { nombre: ' gastos   JULIO ', filas: [] };
  const libro = { pestanas: [{ nombre: 'Hoja4' }, { nombre: 'GASTOS AGOSTO' }, julio] };
  assert.equal(pestanaDeGastos_(libro, 7), julio);
  assert.equal(pestanaDeGastos_({ pestanas: [{ nombre: 'GASTOS JULIO 2026' }] }, 7).nombre, 'GASTOS JULIO 2026');
  assert.equal(pestanaDeGastos_({ pestanas: [{ nombre: ' gastos  julio 2025 ' }] }, 7).nombre, ' gastos  julio 2025 ');
  assert.equal(pestanaDeGastos_(libro, 6), null);
  assert.equal(pestanaDeGastos_({ pestanas: [] }, 7), null);
  for (const nombre of ['GASTOS JULIO 26', 'GASTOS JULIO 2026 B', 'GASTOS JULIO EXTRA']) {
    assert.equal(pestanaDeGastos_({ pestanas: [{ nombre }] }, 7), null, nombre);
  }
});

test('casaDeClase_ detecta nombres completos, sin tildes ni mayúsculas', () => {
  assert.equal(casaDeClase_('AGUA PLAYA'), 'SECUNDARIA');
  assert.equal(casaDeClase_('comida nórte'), 'PRINCIPAL');
  assert.equal(casaDeClase_('DESPLAYA'), '');
  assert.equal(casaDeClase_('NORTENA'), '');
  assert.equal(casaDeClase_('SERVICES'), '');
  assert.equal(casaDeClase_(null), '');
});

test('filasImportacion_ respeta COLUMNAS, protege textos y conserva ambos montos', () => {
  const registrado = new Date('2026-09-28T15:20:00Z');
  const registros = [registro({ proveedor: '=SUM(1)', clase: '+AGUA PLAYA',
    comentarios: '@nota', deposito: 25.5, gasto: 10 }),
  registro({ clave: 'clave-2', proveedor: 'Otro', clase: 'NORTE SERVICES',
    gasto: null, deposito: 8 })];
  assert.deepEqual(filasImportacion_(registros, registrado), [
    fila({ FECHA: '2026-07-01', PROVEEDOR: "'=SUM(1)", 'DEPÓSITO': 25.5,
      'GASTO (USD)': 10, 'CLASE DE GASTO': "'+AGUA PLAYA", COMENTARIOS: "'@nota",
      CASA: 'SECUNDARIA', TIPO: 'GASTO', ORIGEN: ORIGEN_ARCHIVO,
      REGISTRADO: registrado, 'ID FILA': 'clave-1' }),
    fila({ FECHA: '2026-07-01', PROVEEDOR: 'Otro', 'DEPÓSITO': 8,
      'CLASE DE GASTO': 'NORTE SERVICES', CASA: 'PRINCIPAL', TIPO: 'DEPÓSITO',
      ORIGEN: ORIGEN_ARCHIVO, REGISTRADO: registrado, 'ID FILA': 'clave-2' }),
  ]);
  assert.equal(ORIGEN_ARCHIVO, 'ARCHIVO');
  assert.equal(filasImportacion_([], registrado).length, 0);
  assert.deepEqual(filasImportacion_([registro({ comentarios: undefined, clave: '=clave' })], registrado)
    .map((valores) => [valores[COLUMNAS.indexOf('COMENTARIOS')], valores[COLUMNAS.indexOf('ID FILA')]]),
  [['', "'=clave"]]);
});

test('filasImportacion_ trata gasto cero como vacío solo en depósitos positivos', () => {
  const registrado = new Date('2026-09-28T15:20:00Z');
  const registros = [
    registro({ clave: 'deposito-cero-gasto', deposito: 500, gasto: 0 }),
    registro({ clave: 'cero-cero', deposito: 0, gasto: 0 }),
    registro({ clave: 'nulo-cero', deposito: null, gasto: 0 }),
  ];
  const montosYTipo = filasImportacion_(registros, registrado).map((valores) => [
    valores[COLUMNAS.indexOf('DEPÓSITO')],
    valores[COLUMNAS.indexOf('GASTO (USD)')],
    valores[COLUMNAS.indexOf('TIPO')],
  ]);
  assert.deepEqual(montosYTipo, [
    [500, '', 'DEPÓSITO'],
    [0, 0, 'GASTO'],
    ['', 0, 'GASTO'],
  ]);
});

test('totalesImportacion_ suma centavos sin error binario', () => {
  assert.deepEqual(totalesImportacion_([
    registro({ deposito: 0.1, gasto: 0.1 }), registro({ deposito: 0.2, gasto: 0.2 }),
    registro({ deposito: null, gasto: null }),
  ]), { filas: 3, depositos: 0.3, gastos: 0.3 });
  assert.deepEqual(totalesImportacion_([]), { filas: 0, depositos: 0, gastos: 0 });
});

test('totalesImportacion_ suma los valores sin redondear cada fila', () => {
  const totales = totalesImportacion_([
    registro({ deposito: 0.0025, gasto: 42.0955 }), registro({ deposito: null, gasto: 0.0025 }),
  ]);
  assert.ok(igualMonto_(totales.gastos, 42.098), `gastos ${totales.gastos}`);
  assert.equal(totales.gastos, 42.098);
  assert.notEqual(totales.gastos, 42.1);
  assert.equal(totales.depositos, 0.0025);
});

test('igualMonto_ ignora el ruido binario pero distingue el tercer y cuarto decimal', () => {
  assert.equal(igualMonto_(0.1 + 0.2, 0.3), true);
  assert.equal(igualMonto_(42.0955, 42.1), false);
  assert.equal(igualMonto_(42.0955, 42.0955), true);
});

test('dineroExacto_ muestra hasta 6 decimales, sin ceros de sobra y con al menos 2', () => {
  assert.equal(dineroExacto_(21645.52), '21645.52');
  assert.equal(dineroExacto_(25074.18935), '25074.18935');
  assert.equal(dineroExacto_(12), '12.00');
  assert.equal(dineroExacto_(0.1 + 0.2), '0.30');
  assert.equal(dineroExacto_(7.5), '7.50');
});

test('planImportacion_ devuelve los montos del Excel sin redondear', () => {
  const nombre = 'GASTOS JULIO';
  const libro = { fecha1904: false, pestanas: [{ nombre, filas: [
    { fila: 2, valores: [null, 'FECHA', 'DEPÓSITO', 'GASTO', 'PROVEEDOR', 'CLASE DE GASTO'] },
    { fila: 3, valores: [null, 46204, 10.0049, -42.0955, 'TIENDA', 'COMIDA'] },
  ] }] };
  const plan = planImportacion_('07. GASTOS DE JULIO 2026.xlsx', libro);
  assert.equal(plan.registros.length, 1);
  assert.equal(plan.registros[0].gasto, 42.0955);
  assert.equal(plan.registros[0].deposito, 10.0049);
});

test('planImportacion_ excluye septiembre y distingue falta de mes y pestaña', () => {
  const libro = { fecha1904: false, pestanas: [{ nombre: 'Hoja4', filas: [] }] };
  assert.deepEqual(planImportacion_('09. GASTOS SEPTIEMBRE 2026.xlsx', libro), {
    incluido: false, motivo: 'no incluido', mes: 9, anio: 2026, pestana: null, registros: [],
  });
  assert.deepEqual(planImportacion_('sin fecha.xlsx', libro), {
    incluido: false, motivo: 'sin mes', mes: null, anio: null, pestana: null, registros: [],
  });
  assert.deepEqual(planImportacion_('07. GASTOS JULIO 2026.xlsx', libro), {
    incluido: false, motivo: 'sin pestaña GASTOS', mes: 7, anio: 2026, pestana: null, registros: [],
  });
});

test('planImportacion_ lee solo GASTOS JULIO y entrega registros con clave y comentarios', () => {
  const encabezados = ['FECHA', 'DEPÓSITO', 'GASTO', 'PROVEEDOR', 'CLASE DE GASTO', 'COMENTARIOS'];
  const libro = { fecha1904: false, pestanas: [
    { nombre: 'Hoja4', filas: [{ fila: 1, valores: encabezados }] },
    { nombre: 'GASTOS JULIO', filas: [
      { fila: 2, valores: encabezados },
      { fila: 3, valores: [46204, null, -10, 'Tienda', 'COMIDA', 'nota'] },
    ] },
  ] };
  const esperado = conClaves_([registro({ clave: undefined, comentarios: 'nota' })]);
  assert.deepEqual(planImportacion_('07. GASTOS JULIO 2026.xlsx', libro), {
    incluido: true, motivo: '', mes: 7, anio: 2026, pestana: 'GASTOS JULIO', registros: esperado,
  });
});

test('archivoIncluido_ y casaDeClase_ leen el año, los meses y las etiquetas de CONFIG', () => {
  const configReal = global.CONFIG;
  global.CONFIG = { ...configReal, HISTORIAL_ANIO: 2024, HISTORIAL_MESES: [11, 12], CASAS: {
    ...configReal.CASAS, PRINCIPAL: { ...configReal.CASAS.PRINCIPAL, etiqueta: 'LOMA ALTA' },
  } };
  try {
    assert.equal(archivoIncluido_({ mes: 12, anio: 2024 }), true);
    assert.equal(archivoIncluido_({ mes: 12, anio: 2026 }), false);
    assert.equal(archivoIncluido_({ mes: 7, anio: 2024 }), false);
    assert.equal(casaDeClase_('COMIDA LOMA   ALTA'), 'PRINCIPAL');
    assert.equal(casaDeClase_('COMIDA NORTE'), '');
  } finally {
    global.CONFIG = configReal;
  }
});
