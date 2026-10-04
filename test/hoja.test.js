const test = require('node:test');
const assert = require('node:assert/strict');

// En Apps Script MESES es global (viene de Hoja.js); en Node se pone a mano.
global.MESES = require('../src/Hoja.js').MESES;

const {
  COLUMNAS, COLUMNAS_VISIBLES, COLUMNAS_OCULTAS, ETIQUETAS_RESUMEN, COLORES, FORMATOS_NUMERO,
  letraColumna_, numeroColumna_, nombrePestanaMes_, leerPestanaMes_, referenciaPestana_,
  posicionPestanaMes_, formulaSaldoInicialMes_, formulasResumen_,
  formulaGrupo_, reglasFormato_,
} = require('../src/Hoja.js');

// --- columnas ---

test('19 columnas visibles A–S y 6 ocultas T–Y, en ese orden (una fila por factura)', () => {
  assert.equal(COLUMNAS_VISIBLES.length, 19);
  assert.equal(COLUMNAS_VISIBLES[COLUMNAS_VISIBLES.length - 1], 'CASA');
  assert.deepEqual([...COLUMNAS_OCULTAS], ['ID FILA', 'ORIGEN', 'REGISTRADO', 'ID MENSAJE TG', 'TIPO', 'GRUPO']);
  assert.equal(COLUMNAS.length, 25);
  assert.equal(letraColumna_(numeroColumna_('REVISAR')), 'R');
  assert.equal(letraColumna_(numeroColumna_('CASA')), 'S');
  assert.equal(letraColumna_(numeroColumna_('ID FILA')), 'T');
  assert.equal(letraColumna_(numeroColumna_('TIPO')), 'X');
  assert.equal(letraColumna_(numeroColumna_('GRUPO')), 'Y');
});

test('el desglose va entre DEPÓSITO y GASTO (USD), en el orden en que se lee la factura', () => {
  assert.deepEqual(COLUMNAS_VISIBLES.slice(4, 10),
    ['DEPÓSITO', 'ARTÍCULOS', 'DESCUENTOS', 'ITBMS', 'OTROS CARGOS', 'GASTO (USD)']);
  assert.equal(letraColumna_(numeroColumna_('ARTÍCULOS')), 'F');
  assert.equal(letraColumna_(numeroColumna_('OTROS CARGOS')), 'I');
});

test('ya no existen TIPO LÍNEA, TOTAL FACTURA ni SUBTOTAL FACTURA', () => {
  for (const vieja of ['TIPO LÍNEA', 'TOTAL FACTURA', 'SUBTOTAL FACTURA']) {
    assert.throws(() => numeroColumna_(vieja), /columna desconocida/);
  }
});

test('letraColumna_ convierte número a letra de columna', () => {
  assert.equal(letraColumna_(1), 'A');
  assert.equal(letraColumna_(22), 'V');
  assert.equal(letraColumna_(26), 'Z');
  assert.equal(letraColumna_(27), 'AA');
  assert.equal(letraColumna_(52), 'AZ');
  assert.equal(letraColumna_(703), 'AAA');
});

test('letraColumna_ rechaza cero, negativos, decimales y texto', () => {
  for (const malo of [0, -1, 1.5, '3', null]) assert.throws(() => letraColumna_(malo), /columna inválida/);
});

test('numeroColumna_ da la posición 1-based y rechaza nombres desconocidos', () => {
  assert.equal(numeroColumna_('FECHA'), 1);
  assert.equal(numeroColumna_('GASTO (USD)'), 10);
  assert.equal(numeroColumna_('TIPO'), 24);
  assert.throws(() => numeroColumna_('NO EXISTE'), /columna desconocida: NO EXISTE/);
});

// --- nombres de pestaña ---

test('nombrePestanaMes_ arma "Septiembre 2026" con mayúscula inicial', () => {
  assert.equal(nombrePestanaMes_(2026, 9), 'Septiembre 2026');
  assert.equal(nombrePestanaMes_(2027, 1), 'Enero 2027');
  assert.equal(nombrePestanaMes_(2026, 12), 'Diciembre 2026');
});

test('nombrePestanaMes_ rechaza mes fuera de 1–12 o valores no enteros', () => {
  for (const [a, m] of [[2026, 0], [2026, 13], [2026, 1.5], ['2026', 9]]) {
    assert.throws(() => nombrePestanaMes_(a, m), /mes inválido/);
  }
});

test('leerPestanaMes_ acepta mayúsculas, minúsculas, tildes y espacios de más', () => {
  assert.deepEqual(leerPestanaMes_('septiembre 2026'), { anio: 2026, mes: 9 });
  assert.deepEqual(leerPestanaMes_('SEPTIEMBRE 2026'), { anio: 2026, mes: 9 });
  assert.deepEqual(leerPestanaMes_('  Enero 2027 '), { anio: 2027, mes: 1 });
  assert.deepEqual(leerPestanaMes_(nombrePestanaMes_(2026, 3)), { anio: 2026, mes: 3 });
});

test('leerPestanaMes_ devuelve null para pestañas que no son de mes', () => {
  for (const nombre of ['Hoja 1', '_ESTADO', '_HISTORIAL', 'Septiembre', 'Septiembre 26', 'Septiembre 2026 copia', 'Mes 2026']) {
    assert.equal(leerPestanaMes_(nombre), null, nombre);
  }
});

test('referenciaPestana_ pone comillas simples y duplica apóstrofos internos', () => {
  assert.equal(referenciaPestana_('Agosto 2026'), "'Agosto 2026'");
  assert.equal(referenciaPestana_("Ana's"), "'Ana''s'");
});

// --- posición de la pestaña nueva ---

test('sin pestañas de mes la nueva va primera y no tiene vecinas', () => {
  assert.deepEqual(posicionPestanaMes_(['Hoja 1', '_ESTADO'], 2026, 9), { indice: 0, anterior: null, siguiente: null });
  assert.deepEqual(posicionPestanaMes_([], 2026, 9), { indice: 0, anterior: null, siguiente: null });
});

test('solo meses anteriores: va justo después del más reciente', () => {
  const r = posicionPestanaMes_(['Julio 2026', 'Agosto 2026', '_ESTADO'], 2026, 9);
  assert.deepEqual(r, { indice: 2, anterior: 'Agosto 2026', siguiente: null });
});

test('solo meses posteriores: va justo antes del más cercano', () => {
  const r = posicionPestanaMes_(['Hoja 1', 'Noviembre 2026', 'Octubre 2026'], 2026, 9);
  assert.deepEqual(r, { indice: 2, anterior: null, siguiente: 'Octubre 2026' });
});

test('entre dos meses: toma el anterior y el siguiente más cercanos, cruzando de año', () => {
  const r = posicionPestanaMes_(['Noviembre 2026', 'Febrero 2027', 'Octubre 2026'], 2027, 1);
  assert.deepEqual(r, { indice: 1, anterior: 'Noviembre 2026', siguiente: 'Febrero 2027' });
});

test('si la pestaña del mes ya existe (aunque cambien mayúsculas) da error', () => {
  assert.throws(() => posicionPestanaMes_(['Agosto 2026', 'septiembre 2026'], 2026, 9), /la pestaña septiembre 2026 ya existe/);
});

// --- fórmulas ---

test('formulaSaldoInicialMes_ apunta al SALDO FINAL (E3) de la pestaña anterior, o 0', () => {
  assert.equal(formulaSaldoInicialMes_('Agosto 2026'), "='Agosto 2026'!E3");
  assert.equal(formulaSaldoInicialMes_(null), '=0');
});

test('formulasResumen_ da una fórmula por etiqueta, en inglés y con comas', () => {
  const f = formulasResumen_('Agosto 2026');
  assert.equal(f.length, ETIQUETAS_RESUMEN.length);
  assert.deepEqual(f, [
    "='Agosto 2026'!E3",
    '=SUMIFS(E6:E,X6:X,"<>AJUSTE")',
    '=SUMIFS(J6:J,X6:X,"<>AJUSTE")',
    '=SUMIFS(E6:E,X6:X,"AJUSTE")-SUMIFS(J6:J,X6:X,"AJUSTE")',
    '=A3+B3-C3+D3',
    '=COUNTIF(BYROW(A6:S,LAMBDA(fila,COUNTIF(fila,"*PENDIENTE*"))),">0")',
  ]);
  assert.ok(f.every((x) => !x.includes(';')));
});

test('formulasResumen_ sin pestaña anterior empieza en 0', () => {
  assert.equal(formulasResumen_(null)[0], '=0');
});

test('formulaGrupo_ alterna 1 y 0 por ID FACTURA en orden de aparición', () => {
  const f = formulaGrupo_();
  assert.match(f, /^=VSTACK\("GRUPO",/);
  assert.ok(f.includes('LET(ids,B6:B,'));
  assert.ok(f.includes('MOD(MATCH(id,unicos,0),2)'));
  assert.ok(!f.includes(';') && !f.includes('{'));
});

test('fórmulas con paréntesis balanceados', () => {
  const balance = (s) => [...s].reduce((n, c) => n + (c === '(') - (c === ')'), 0);
  for (const f of [...formulasResumen_('Agosto 2026'), formulaGrupo_(), ...reglasFormato_().map((r) => r.formula)]) {
    assert.equal(balance(f), 0, f);
  }
});

// --- formato condicional ---

test('reglasFormato_ en orden de prioridad: pendiente, grupo impar, grupo par (sin subtotal)', () => {
  const r = reglasFormato_();
  assert.deepEqual(r.map((x) => x.nombre), ['pendiente', 'grupo impar', 'grupo par']);
  assert.deepEqual(r[0], {
    nombre: 'pendiente', rango: 'A6:S', formula: '=COUNTIF($A6:$S6,"*PENDIENTE*")>0', fondo: COLORES.TERRACOTA,
  });
  assert.deepEqual(r[1], { nombre: 'grupo impar', rango: 'A6:S', formula: '=$Y6=1', fondo: COLORES.CREMA });
  assert.deepEqual(r[2], { nombre: 'grupo par', rango: 'A6:S', formula: '=AND($Y6<>"",$Y6=0)', fondo: COLORES.SALVIA_CLARO });
});

test('FORMATOS_NUMERO solo nombra columnas que existen', () => {
  for (const [nombre] of FORMATOS_NUMERO) assert.doesNotThrow(() => numeroColumna_(nombre), nombre);
});
