const test = require('node:test');
const assert = require('node:assert/strict');

// En Apps Script sinTildes_ es global (viene de Hoja.js); en Node se pone a mano.
global.sinTildes_ = require('../src/Hoja.js').sinTildes_;

const {
  decodificarXml_, atributosXml_, leerCadenasCompartidas_, columnaDeReferencia_, leerHojaXml_,
  leerLibroXlsx_, pestanaExcluida_, fechaDeSerie_, buscarEncabezados_, registrosDePestana_,
  conClaves_, filasNuevasHistorial_, contarCategorias_,
} = require('../src/Historial.js');

// Todo lo de abajo es XML inventado: nunca se copian datos reales de los Excel del usuario.

const libroXml = (hojas, workbookPr = '') => `<?xml version="1.0"?><workbook>${workbookPr}<sheets>${
  hojas.map((h, i) => `<sheet name="${h.nombre}" sheetId="${i + 1}"${h.estado ? ` state="${h.estado}"` : ''} r:id="rId${i + 1}"/>`).join('')
}</sheets></workbook>`;

const relsXml = (hojas) => `<Relationships>${
  hojas.map((h, i) => `<Relationship Id="rId${i + 1}" Type="x" Target="${h.destino || `worksheets/sheet${i + 1}.xml`}"/>`).join('')
}</Relationships>`;

/** Arma los textos por ruta de un.xlsx descomprimido. */
function xlsx(hojas, { workbookPr = '', cadenas } = {}) {
  const archivos = {
    'xl/workbook.xml': libroXml(hojas, workbookPr),
    'xl/_rels/workbook.xml.rels': relsXml(hojas),
  };
  if (cadenas !== undefined) archivos['xl/sharedStrings.xml'] = cadenas;
  hojas.forEach((h, i) => {
    const ruta = h.destino ? h.destino.replace(/^\//, '') : `xl/worksheets/sheet${i + 1}.xml`;
    if (h.xml !== undefined) archivos[ruta] = h.xml;
  });
  return archivos;
}

const fila = (n, celdas) => `<row r="${n}">${celdas}</row>`;
const txt = (ref, t) => `<c r="${ref}" t="inlineStr"><is><t>${t}</t></is></c>`;
const num = (ref, v) => `<c r="${ref}"><v>${v}</v></c>`;
const hojaXml = (filas) => `<worksheet><sheetData>${filas.join('')}</sheetData></worksheet>`;

const ENCABEZADOS = fila(2, [
  txt('B2', 'FECHA'), txt('C2', 'DEPÓSITO'), txt('D2', 'GASTO'), txt('E2', 'PROVEEDOR'),
  txt('F2', 'CLASE DE GASTO'), txt('G2', 'COMENTARIOS'),
].join(''));

// serie 46204 = 2026-07-01 en el sistema 1900
const gastoFila = (n, { serie = 46204, deposito, gasto, proveedor = 'TIENDA X', clase = 'COMIDA', comentarios } = {}) => fila(n, [
  serie === null ? '' : num(`B${n}`, serie),
  deposito === undefined ? '' : num(`C${n}`, deposito),
  gasto === undefined ? '' : num(`D${n}`, gasto),
  txt(`E${n}`, proveedor), txt(`F${n}`, clase),
  comentarios === undefined ? '' : txt(`G${n}`, comentarios),
].join(''));

// --- decodificarXml_ / atributosXml_ ---

test('decodificarXml_ traduce entidades con nombre, decimales y hexadecimales', () => {
  assert.equal(decodificarXml_('a &amp; b &lt;c&gt; &quot;d&quot; &apos;e&apos;'), 'a & b <c> "d" \'e\'');
  assert.equal(decodificarXml_('&#211; &#xE9; &#XE9; &AMP;'), 'Ó é é &');
  assert.equal(decodificarXml_('&desconocida; sin cambios'), '&desconocida; sin cambios');
});

test('atributosXml_ lee atributos con prefijo y los decodifica', () => {
  assert.deepEqual(atributosXml_(' r="B4" t="s" r:id="rId2" name="A &amp; B"'), {
    r: 'B4', t: 's', 'r:id': 'rId2', name: 'A & B',
  });
  assert.deepEqual(atributosXml_(''), {});
});

// --- cadenas compartidas ---

test('leerCadenasCompartidas_ une runs con formato y quita la guía fonética', () => {
  const xml = '<sst><si><t>simple</t></si>'
    + '<si><r><rPr><b/></rPr><t>ne</t></r><r><t xml:space="preserve">gri ta</t></r><rPh sb="0" eb="1"><t>X</t></rPh></si>'
    + '<si/><si><t>&amp;co</t></si></sst>';
  assert.deepEqual(leerCadenasCompartidas_(xml), ['simple', 'negri ta', '', '&co']);
});

test('leerCadenasCompartidas_ sin archivo de cadenas → lista vacía', () => {
  assert.deepEqual(leerCadenasCompartidas_(undefined), []);
});

// --- columnas y celdas ---

test('columnaDeReferencia_ convierte letras a número y rechaza lo que no es referencia', () => {
  assert.equal(columnaDeReferencia_('A1'), 1);
  assert.equal(columnaDeReferencia_('b4'), 2);
  assert.equal(columnaDeReferencia_('AA10'), 27);
  assert.equal(columnaDeReferencia_('XFD'), 16384);
  assert.equal(columnaDeReferencia_(undefined), null);
  assert.equal(columnaDeReferencia_('4B'), null);
});

test('leerHojaXml_ interpreta cada tipo de celda', () => {
  const cadenas = ['cero', 'uno'];
  const xml = hojaXml([fila(1, [
    '<c r="A1" t="s"><v>1</v></c>',
    '<c r="B1" t="s"><v>9</v></c>', // índice fuera de rango
    '<c r="C1" t="str"><v>a &lt; b</v></c>',
    '<c r="D1" t="b"><v>1</v></c>',
    '<c r="E1" t="b"><v>0</v></c>',
    '<c r="F1" t="e"><v>#N/A</v></c>',
    '<c r="G1"><v>-12.5</v></c>',
    '<c r="H1" t="n"><v> </v></c>',
    '<c r="I1"><v>abc</v></c>',
    '<c r="J1" s="3"/>',
    '<c r="K1" t="inlineStr"><is><r><t>en</t></r><r><t>línea</t></r></is></c>',
    '<c r="L1" t="d"><v>2026-07-01T00:00:00</v></c>',
    '<c r="M1"><f>SUM(A1)</f></c>',
  ].join(''))]);
  assert.deepEqual(leerHojaXml_(xml, cadenas), [{
    fila: 1,
    valores: ['uno', null, 'a < b', true, false, null, -12.5, null, null, null, 'enlínea', '2026-07-01T00:00:00', null],
  }]);
});

test('leerHojaXml_ sin atributo r cuenta columnas y filas en orden', () => {
  const xml = '<sheetData><row><c><v>1</v></c><c><v>2</v></c><c r="E1"><v>5</v></c><c><v>6</v></c></row>'
    + '<row/><row r="10"><c r="C10"><v>3</v></c></row><row><c><v>4</v></c></row></sheetData>';
  assert.deepEqual(leerHojaXml_(xml, []), [
    { fila: 1, valores: [1, 2, null, null, 5, 6] },
    { fila: 2, valores: [] },
    { fila: 10, valores: [null, null, 3] },
    { fila: 11, valores: [4] },
  ]);
});

test('leerHojaXml_ no crea filas vacías por una celda suelta muy abajo', () => {
  const xml = hojaXml([fila(1, num('A1', 1)), fila(1043520, txt('A1043520', '.'))]);
  const filas = leerHojaXml_(xml, []);
  assert.equal(filas.length, 2);
  assert.deepEqual(filas[1], { fila: 1043520, valores: ['.'] });
});

// --- libro ---

test('leerLibroXlsx_ sigue las relaciones relativas y absolutas y marca las ocultas', () => {
  const archivos = xlsx([
    { nombre: 'GASTOS JULIO', xml: hojaXml([fila(1, '<c r="A1" t="s"><v>0</v></c>')]) },
    { nombre: 'Hoja4', estado: 'hidden', destino: '/xl/worksheets/otra.xml', xml: hojaXml([fila(1, num('A1', 7))]) },
    { nombre: 'Secreta', estado: 'veryHidden', xml: hojaXml([]) },
  ], { cadenas: '<sst><si><t>hola</t></si></sst>' });
  const libro = leerLibroXlsx_(archivos);
  assert.equal(libro.fecha1904, false);
  assert.deepEqual(libro.pestanas, [
    { nombre: 'GASTOS JULIO', oculta: false, filas: [{ fila: 1, valores: ['hola'] }] },
    { nombre: 'Hoja4', oculta: true, filas: [{ fila: 1, valores: [7] }] },
    { nombre: 'Secreta', oculta: true, filas: [] },
  ]);
});

test('leerLibroXlsx_ nunca lee las pestañas PLANILLA, aunque su XML falte o esté roto', () => {
  const archivos = xlsx([
    { nombre: 'GASTOS AGOSTO', xml: hojaXml([]) },
    { nombre: 'PLANILLA' }, // sin XML: si se intentara leer, lanzaría "falta la pestaña"
    { nombre: 'planilla quincena', xml: '<roto' },
  ]);
  assert.deepEqual(leerLibroXlsx_(archivos).pestanas.map((p) => p.nombre), ['GASTOS AGOSTO']);
  assert.equal(pestanaExcluida_('Planilla 2'), true);
  assert.equal(pestanaExcluida_('GASTOS PLANILLA'), false);
});

test('leerLibroXlsx_ reconoce el sistema de fechas 1904', () => {
  assert.equal(leerLibroXlsx_(xlsx([], { workbookPr: '<workbookPr date1904="1"/>' })).fecha1904, true);
  assert.equal(leerLibroXlsx_(xlsx([], { workbookPr: '<workbookPr date1904="true"/>' })).fecha1904, true);
  assert.equal(leerLibroXlsx_(xlsx([], { workbookPr: '<workbookPr date1904="0"/>' })).fecha1904, false);
});

test('leerLibroXlsx_ falla con mensaje claro si no es un .xlsx o falta una pestaña', () => {
  assert.throws(() => leerLibroXlsx_({}), /no parece un \.xlsx/);
  assert.throws(() => leerLibroXlsx_({ 'xl/workbook.xml': '<workbook/>' }), /no parece un \.xlsx/);
  assert.throws(() => leerLibroXlsx_(xlsx([{ nombre: 'GASTOS JULIO' }])), /falta la pestaña GASTOS JULIO/);
});

test('leerLibroXlsx_ con libro sin pestañas ni relaciones → sin pestañas', () => {
  const archivos = { 'xl/workbook.xml': '<workbook/>', 'xl/_rels/workbook.xml.rels': '<Relationships/>' };
  assert.deepEqual(leerLibroXlsx_(archivos), { fecha1904: false, pestanas: [] });
});

// --- fechas ---

test('fechaDeSerie_ convierte series de Excel en ambos sistemas y descarta la hora', () => {
  assert.equal(fechaDeSerie_(46204, false), '2026-07-01');
  assert.equal(fechaDeSerie_(46204.75, false), '2026-07-01');
  assert.equal(fechaDeSerie_(1, false), '1899-12-31');
  assert.equal(fechaDeSerie_(2958465, false), '9999-12-31');
  assert.equal(fechaDeSerie_(44742, true), '2026-07-01');
});

test('fechaDeSerie_ rechaza lo que no es una fecha válida', () => {
  [0, -3, 2958466, NaN, Infinity, '46204', null, undefined, true].forEach((v) => {
    assert.equal(fechaDeSerie_(v, false), null, String(v));
  });
});

// --- encabezados y registros ---

test('buscarEncabezados_ encuentra la fila sin importar tildes, mayúsculas ni espacios', () => {
  const filas = leerHojaXml_(hojaXml([
    fila(1, txt('B1', 'GASTOS JULIO')),
    fila(3, [txt('A3', ' fecha '), txt('B3', 'Deposito'), txt('C3', 'gasto'), txt('D3', 'Proveedor'), txt('E3', 'Clase de Gasto')].join('')),
  ]), []);
  assert.deepEqual(buscarEncabezados_(filas), {
    fila: 3, indices: { fecha: 0, deposito: 1, gasto: 2, proveedor: 3, clase: 4 },
  });
});

test('buscarEncabezados_ solo mira las primeras 10 filas y exige todos los encabezados', () => {
  const completos = [txt('A11', 'FECHA'), txt('B11', 'DEPOSITO'), txt('C11', 'GASTO'), txt('D11', 'PROVEEDOR'), txt('E11', 'CLASE DE GASTO')].join('');
  assert.equal(buscarEncabezados_(leerHojaXml_(hojaXml([fila(11, completos)]), [])), null);
  const incompletos = fila(1, [txt('A1', 'FECHA'), txt('B1', 'GASTO'), txt('C1', 'PROVEEDOR')].join(''));
  assert.equal(buscarEncabezados_(leerHojaXml_(hojaXml([incompletos]), [])), null);
  assert.equal(buscarEncabezados_([]), null);
});

test('registrosDePestana_ invierte el signo de GASTO, redondea y salta filas sin fecha o sin monto', () => {
  const filas = leerHojaXml_(hojaXml([
    fila(1, txt('B1', 'GASTOS JULIO')),
    ENCABEZADOS,
    gastoFila(3, { deposito: 500 }),
    gastoFila(4, { gasto: -0.125, proveedor: 'SUPER &amp; CIA', comentarios: 'nota &amp; más' }),
    gastoFila(5, { gasto: 0, deposito: 0.004 }),
    gastoFila(6, {}), // sin monto
    gastoFila(7, { serie: null, gasto: -99, proveedor: 'TOTAL' }), // sin fecha
    fila(8, [txt('B8', 'Nota:'), num('D8', -1)].join('')),
    fila(9, [num('B9', 46205), '<c r="D9" t="str"><v>n/a</v></c>', txt('F9', 'OTROS')].join('')), // monto de texto
    fila(10, [num('B10', 46206), num('D10', -3)].join('')), // sin proveedor ni clase
  ]), []);
  assert.deepEqual(registrosDePestana_(filas, false), [
    { fecha: '2026-07-01', proveedor: 'TIENDA X', clase: 'COMIDA', comentarios: '', deposito: 500, gasto: null },
    { fecha: '2026-07-01', proveedor: 'SUPER & CIA', clase: 'COMIDA', comentarios: 'nota & más', deposito: null, gasto: 0.13 },
    { fecha: '2026-07-01', proveedor: 'TIENDA X', clase: 'COMIDA', comentarios: '', deposito: 0, gasto: 0 },
    { fecha: '2026-07-03', proveedor: '', clase: '', comentarios: '', deposito: null, gasto: 3 },
  ]);
  assert.ok(Object.is(registrosDePestana_(filas, false)[2].gasto, 0), 'gasto 0 no queda como -0');
});

test('registrosDePestana_ en modo exacto conserva los decimales del Excel; el modo normal sigue redondeando', () => {
  const filas = leerHojaXml_(hojaXml([
    ENCABEZADOS,
    gastoFila(3, { gasto: -42.0955, deposito: 10.0049 }),
    gastoFila(4, { gasto: 0, deposito: 0.004 }),
    gastoFila(5, { gasto: 42.0955 }), // gasto positivo en el Excel: sale negativo
    fila(6, [num('B6', 46205), '<c r="D6" t="str"><v>n/a</v></c>', num('C6', 1.5)].join('')),
  ]), []);
  const exacto = registrosDePestana_(filas, false, { exacto: true });
  assert.deepEqual(exacto.map((r) => [r.deposito, r.gasto]), [[10.0049, 42.0955], [0.004, 0], [null, -42.0955], [1.5, null]]);
  assert.ok(Object.is(exacto[1].gasto, 0), 'gasto 0 no queda como -0');
  assert.deepEqual(registrosDePestana_(filas, false, { exacto: false }), registrosDePestana_(filas, false));
  assert.deepEqual(registrosDePestana_(filas, false, undefined)[0], { ...exacto[0], deposito: 10, gasto: 42.1 });
});

test('registrosDePestana_ ignora las columnas de la tabla dinámica a la derecha', () => {
  const filas = leerHojaXml_(hojaXml([
    ENCABEZADOS,
    fila(3, [num('B3', 46204), num('D3', -5), txt('E3', 'A'), txt('F3', 'B'), txt('I3', 'COMIDA'), num('J3', 999)].join('')),
    fila(4, [txt('I4', 'Total general'), num('J4', 999)].join('')),
  ]), []);
  assert.deepEqual(registrosDePestana_(filas, false), [
    { fecha: '2026-07-01', proveedor: 'A', clase: 'B', comentarios: '', deposito: null, gasto: 5 },
  ]);
});

test('registrosDePestana_ usa el sistema 1904 cuando el libro lo pide', () => {
  const filas = leerHojaXml_(hojaXml([ENCABEZADOS, gastoFila(3, { serie: 44742, gasto: -1 })]), []);
  assert.equal(registrosDePestana_(filas, true)[0].fecha, '2026-07-01');
});

test('registrosDePestana_ no exige encabezado COMENTARIOS', () => {
  const encabezados = fila(2, [txt('B2', 'FECHA'), txt('C2', 'DEPÓSITO'),
    txt('D2', 'GASTO'), txt('E2', 'PROVEEDOR'), txt('F2', 'CLASE DE GASTO')].join(''));
  const filas = leerHojaXml_(hojaXml([encabezados, gastoFila(3, { gasto: -1 })]), []);
  assert.equal(registrosDePestana_(filas, false)[0].comentarios, '');
});

test('registrosDePestana_ de una pestaña sin encabezados de gastos → []', () => {
  const filas = leerHojaXml_(hojaXml([fila(1, txt('A1', 'Etiquetas de fila')), fila(2, num('A2', 46204))]), []);
  assert.deepEqual(registrosDePestana_(filas, false), []);
});

// --- claves y deduplicación ---

const reg = (extra = {}) => ({ fecha: '2026-07-01', proveedor: 'P', clase: 'C', deposito: null, gasto: 10, ...extra });

test('conClaves_ numera las filas idénticas dentro de la pestaña sin cambiar las originales', () => {
  const registros = [reg(), reg({ gasto: 11 }), reg()];
  const conClave = conClaves_(registros);
  assert.deepEqual(conClave.map((r) => r.clave), [
    '["2026-07-01","P","C",null,10]#1',
    '["2026-07-01","P","C",null,11]#1',
    '["2026-07-01","P","C",null,10]#2',
  ]);
  assert.equal(registros[0].clave, undefined);
});

test('conClaves_ y filasNuevasHistorial_ ignoran los comentarios para la clave', () => {
  const [a, b] = conClaves_([reg({ comentarios: 'primera' }), reg({ comentarios: 'segunda' })]);
  assert.equal(a.clave.replace(/#\d+$/, ''), b.clave.replace(/#\d+$/, ''));
  assert.equal(filasNuevasHistorial_([
    { archivo: 'a.xlsx', pestana: 'GASTOS JULIO', registros: [a] },
    { archivo: 'b.xlsx', pestana: 'GASTOS JULIO', registros: [conClaves_([reg({ comentarios: 'otra' })])[0]] },
  ], []).repetidas, 1);
});

test('filasNuevasHistorial_ arma filas en orden de _HISTORIAL y salta claves ya vistas', () => {
  const julio = conClaves_([reg({ deposito: 100, gasto: null }), reg()]);
  const hoja4 = conClaves_([reg({ fecha: '2026-03-02' })]);
  const lotes = [
    { archivo: '07. GASTOS.xlsx', pestana: 'GASTOS JULIO', registros: julio },
    { archivo: '07. GASTOS.xlsx', pestana: 'Hoja4', registros: hoja4 },
    { archivo: '08. GASTOS.xlsx', pestana: 'Hoja4', registros: conClaves_([reg({ fecha: '2026-03-02' })]) },
  ];
  const { filas, repetidas } = filasNuevasHistorial_(lotes, []);
  assert.deepEqual(filas, [
    ['2026-07-01', 'P', 'C', 100, '', '07. GASTOS.xlsx', 'GASTOS JULIO', julio[0].clave],
    ['2026-07-01', 'P', 'C', '', 10, '07. GASTOS.xlsx', 'GASTOS JULIO', julio[1].clave],
    ['2026-03-02', 'P', 'C', '', 10, '07. GASTOS.xlsx', 'Hoja4', hoja4[0].clave],
  ]);
  assert.equal(repetidas, 1, 'Hoja4 repetida en el segundo archivo entra una sola vez');
});

test('filasNuevasHistorial_ correr de nuevo con las claves ya guardadas no agrega nada', () => {
  const lotes = [{ archivo: 'a.xlsx', pestana: 'GASTOS', registros: conClaves_([reg(), reg(), reg({ gasto: 2 })]) }];
  const primera = filasNuevasHistorial_(lotes, []);
  assert.equal(primera.filas.length, 3, 'dos filas idénticas en la misma pestaña son dos gastos');
  const segunda = filasNuevasHistorial_(lotes, primera.filas.map((f) => f[7]));
  assert.deepEqual(segunda, { filas: [], repetidas: 3 });
});

test('contarCategorias_ cuenta clases distintas sin vacías', () => {
  assert.equal(contarCategorias_(['COMIDA', 'COMIDA', 'GAS', '', '  ', null, undefined, 5]), 3);
  assert.equal(contarCategorias_([]), 0);
});

// --- de punta a punta con un libro inventado ---

test('libro completo: pestañas de gastos → filas nuevas, sin PLANILLA ni tablas dinámicas', () => {
  const cadenas = '<sst><si><t>FECHA</t></si><si><t>DEPÓSITO</t></si><si><t>GASTO</t></si>'
    + '<si><t>PROVEEDOR</t></si><si><t>CLASE DE GASTO</t></si><si><t>FARMACIA</t></si><si><t>SALUD</t></si></sst>';
  const s = (ref, i) => `<c r="${ref}" t="s"><v>${i}</v></c>`;
  const gastos = hojaXml([
    fila(2, [s('B2', 0), s('C2', 1), s('D2', 2), s('E2', 3), s('F2', 4)].join('')),
    fila(3, [num('B3', 46204), num('D3', -20), s('E3', 5), s('F3', 6)].join('')),
    fila(40, [txt('B40', 'TOTAL'), num('D40', -20)].join('')),
  ]);
  const archivos = xlsx([
    { nombre: 'GASTOS JULIO', xml: gastos },
    { nombre: 'Tabla dinámica', xml: hojaXml([fila(1, s('A1', 6))]) },
    { nombre: 'PLANILLA', xml: gastos },
  ], { cadenas });
  const lotes = leerLibroXlsx_(archivos).pestanas.map((p) => ({
    archivo: 'x.xlsx', pestana: p.nombre, registros: conClaves_(registrosDePestana_(p.filas, false)),
  }));
  const { filas, repetidas } = filasNuevasHistorial_(lotes, []);
  assert.equal(repetidas, 0);
  assert.equal(filas.length, 1);
  assert.deepEqual(filas[0].slice(0, 7), ['2026-07-01', 'FARMACIA', 'SALUD', '', 20, 'x.xlsx', 'GASTOS JULIO']);
});
