const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('./falsosImportacion.js');

F.instalarGlobales();

const {
  MARCA_ARCHIVO_IMPORTADO, ESPERA_CANDADO_IMPORTACION_MS, importarArchivosViejos_,
  importarArchivosViejos, dependenciasImportacion_,
} = require('../src/ImportacionApp.js');

const col = (nombre) => numeroColumna_(nombre);
const JULIO = 'Julio 2026 (archivo)';
const AGOSTO = 'Agosto 2026 (archivo)';
const SEPTIEMBRE = 'Septiembre 2026';
const marcada = (hoja) => hoja.getRange('A1').getNote() === MARCA_ARCHIVO_IMPORTADO;
const fila = (hoja, n) => Object.fromEntries(COLUMNAS.map((c, i) => [c, hoja.leer(n, i + 1)]));

function correr({ libro = F.libroBase(), archivos = [F.archivoAgosto(), F.archivoJulio()], candado } = {}) {
  libro.deleteSheet = () => { throw new Error('el importador nunca borra pestañas'); };
  const deps = F.depsImportacion({ libro, archivos, candado });
  return { libro, deps, archivos, resultado: () => importarArchivosViejos_(deps) };
}

// --- contrato con el resto del proyecto ---

test('GRUPO es la última columna: los datos se escriben sin tocar su desborde', () => {
  assert.equal(COLUMNAS[COLUMNAS.length - 1], 'GRUPO');
});

test('la marca es un identificador específico y el candado espera lo mismo que la limpieza', () => {
  assert.match(MARCA_ARCHIVO_IMPORTADO, /^ERIN-IMPORTACION-ARCHIVO/);
  assert.equal(ESPERA_CANDADO_IMPORTACION_MS, 30000);
});

// --- importación feliz ---

test('crea julio y agosto en orden cronológico a la izquierda de septiembre aunque Drive dé agosto primero', () => {
  const { libro, resultado } = correr();
  resultado();
  assert.deepEqual(libro.nombres(), [JULIO, AGOSTO, SEPTIEMBRE, '_ESTADO', '_HISTORIAL']);
});

test('escribe la cabecera del bot con saldo inicial =0 y NO llama crearPestanaMes_', () => {
  global.crearPestanaMes_ = () => { throw new Error('no debe llamarse: mueve el saldo del mes siguiente'); };
  const { libro, resultado } = correr();
  resultado();
  const julio = libro.getSheetByName(JULIO);
  assert.equal(julio.leer(3, 1), '=0');
  assert.equal(julio.leer(3, 2), formulasResumen_(null)[1]);
  assert.equal(julio.leer(1, 1), `Caja chica · ${JULIO}`);
  assert.deepEqual(COLUMNAS.map((_, i) => julio.leer(FILA_ENCABEZADOS, i + 1)).slice(0, -1), COLUMNAS.slice(0, -1));
  assert.equal(julio.leer(FILA_ENCABEZADOS, col('GRUPO')), formulaGrupo_());
  assert.ok(julio.mutaciones.some(([m]) => m === 'setFrozenRows'), 'aplicó darFormatoMes_');
  delete global.crearPestanaMes_;
});

test('escribe todas las filas en un único setValues desde la fila 6, sin tocar GRUPO', () => {
  const { libro, resultado } = correr();
  resultado();
  const julio = libro.getSheetByName(JULIO);
  const escrituras = julio.mutaciones.filter(([m, , f]) => m === 'setValues' && f >= PRIMERA_FILA_DATOS);
  assert.equal(escrituras.length, 1);
  const [, , f, c, nf, nc] = escrituras[0];
  assert.deepEqual([f, c, nf, nc], [PRIMERA_FILA_DATOS, 1, 3, col('GRUPO') - 1]);
  assert.equal(julio.leer(PRIMERA_FILA_DATOS, col('GRUPO')), '');
});

test('FECHA queda como texto AAAA-MM-DD, REGISTRADO como Date y los textos peligrosos escapados', () => {
  const { libro, resultado } = correr();
  resultado();
  const julio = libro.getSheetByName(JULIO);
  const dep = fila(julio, 6);
  const gasto = fila(julio, 7);
  assert.equal(typeof dep.FECHA, 'string');
  assert.equal(dep.FECHA, '2026-07-01');
  assert.ok(dep.REGISTRADO instanceof Date);
  assert.equal(dep.REGISTRADO.getTime(), F.FECHA_IMPORTACION.getTime());
  assert.deepEqual([dep.TIPO, dep.ORIGEN, dep['DEPÓSITO'], dep['GASTO (USD)']], ['DEPÓSITO', 'ARCHIVO', 500, '']);
  assert.equal(gasto.PROVEEDOR, "'=CMD()");
  assert.equal(gasto.COMENTARIOS, 'ñandú 😀');
  assert.equal(gasto.CASA, 'SECUNDARIA');
  assert.equal(gasto['GASTO (USD)'], 10.1);
  assert.equal(fila(julio, 8).CASA, 'PRINCIPAL');
  assert.match(gasto['ID FILA'], /#1$/);
});

test('FECHA se pone con formato de texto ANTES de escribir los datos, para que Sheets no la vuelva Date', () => {
  const { libro, resultado } = correr();
  resultado();
  const mut = libro.getSheetByName(JULIO).mutaciones;
  const deFecha = ([m, ref]) => m === 'setNumberFormat' && ref.startsWith(`${letra_('FECHA')}${PRIMERA_FILA_DATOS}`);
  const iDatos = mut.findIndex(([m, , f]) => m === 'setValues' && f === PRIMERA_FILA_DATOS);
  const iUltimoFormato = mut.findLastIndex(deFecha);
  assert.equal(mut[iUltimoFormato][2], '@', 'el último formato de FECHA antes de los datos es texto');
  assert.ok(iUltimoFormato < iDatos);
});

test('COMENTARIOS va con formato de texto antes de los datos: un comentario "438.8752631578947" no se vuelve número', () => {
  const { libro, resultado } = correr();
  resultado();
  const mut = libro.getSheetByName(JULIO).mutaciones;
  const deComentarios = ([m, ref]) => m === 'setNumberFormat'
    && ref.startsWith(`${letra_('COMENTARIOS')}${PRIMERA_FILA_DATOS}`);
  const iDatos = mut.findIndex(([m, , f]) => m === 'setValues' && f === PRIMERA_FILA_DATOS);
  const iUltimoFormato = mut.findLastIndex(deComentarios);
  assert.ok(iUltimoFormato >= 0, 'COMENTARIOS recibe formato');
  assert.equal(mut[iUltimoFormato][2], '@');
  assert.ok(iUltimoFormato < iDatos);
});

test('la marca es la última mutación de cada pestaña y solo ella la lleva', () => {
  const { libro, resultado } = correr();
  resultado();
  [JULIO, AGOSTO].forEach((nombre) => {
    const hoja = libro.getSheetByName(nombre);
    const ultima = hoja.mutaciones[hoja.mutaciones.length - 1];
    assert.deepEqual(ultima, ['setNote', 'A1', MARCA_ARCHIVO_IMPORTADO]);
    assert.equal(marcada(hoja), true);
  });
  assert.equal(marcada(libro.getSheetByName(SEPTIEMBRE)), false);
});

test('septiembre y las pestañas internas no reciben ni una escritura; A3 sigue igual', () => {
  const { libro, resultado } = correr();
  const sep = libro.getSheetByName(SEPTIEMBRE);
  const antes = sep.leer(3, 1);
  resultado();
  assert.equal(sep.leer(3, 1), antes);
  assert.equal(sep.leer(3, 1), '=0');
  assert.deepEqual(sep.mutaciones, []);
  assert.deepEqual(libro.getSheetByName('_ESTADO').mutaciones, []);
  assert.deepEqual(libro.getSheetByName('_HISTORIAL').mutaciones, []);
});

test('el registro trae por archivo filas leídas, depósitos y gastos con centavos exactos', () => {
  const { deps, resultado } = correr();
  const lineas = resultado();
  assert.deepEqual(lineas, deps.logs);
  assert.ok(lineas.some((l) => /07\. GASTOS DE JULIO 2026\.xlsx.*3 filas.*depósitos 500\.00.*gastos 15\.30/.test(l)), lineas.join('\n'));
  assert.ok(lineas.some((l) => /08\. GASTOS DE AGOSTO 2026\.xlsx.*2 filas.*depósitos 100\.25.*gastos 7\.00/.test(l)));
});

test('una fila del Excel con 4 decimales se escribe sin redondear, cuadra y el registro muestra el total exacto', () => {
  const archivo = F.archivoJulio([
    { serie: 46204, deposito: 100.0049, proveedor: 'DEPOSITO', clase: 'DEPOSITO' },
    { serie: 46205, gasto: -42.0955, proveedor: 'TIENDA', clase: 'COMIDA NORTE' },
  ]);
  const { libro, resultado } = correr({ archivos: [archivo] });
  const lineas = resultado();
  const julio = libro.getSheetByName(JULIO);
  assert.equal(julio.leer(7, col('GASTO (USD)')), 42.0955);
  assert.equal(julio.leer(6, col('DEPÓSITO')), 100.0049);
  assert.equal(marcada(julio), true);
  assert.ok(lineas.some((l) => /2 filas.*depósitos 100\.0049.*gastos 42\.0955/.test(l)), lineas.join('\n'));
});

test('una diferencia en el tercer o cuarto decimal ya no cuadra', () => {
  const libro = F.libroBase({
    transformarEscritura: (valores) => valores.map((f) => f.map((v, j) => (j === col('GASTO (USD)') - 1 && v === 42.0955 ? 42.1 : v))),
  });
  const archivo = F.archivoJulio([{ serie: 46205, gasto: -42.0955, proveedor: 'TIENDA', clase: 'COMIDA' }]);
  assert.throws(() => correr({ libro, archivos: [archivo] }).resultado(),
    /no cuadra: gastos \(Excel 42\.0955, hoja 42\.1\)/);
  assert.equal(marcada(libro.getSheetByName(JULIO)), false);
});

test('lee de vuelta lo escrito una sola vez para cuadrar antes de marcar', () => {
  const { libro, resultado } = correr();
  resultado();
  const julio = libro.getSheetByName(JULIO);
  assert.equal(julio.lecturas, 1, 'una lectura de vuelta para cuadrar');
});

test('asegura capacidad: agrega filas si la pestaña nueva no alcanza', () => {
  const libro = F.libroBase({ filas: 6 });
  correr({ libro }).resultado();
  const julio = libro.getSheetByName(JULIO);
  assert.deepEqual(julio.insertadas, [[6, 2]]);
  assert.equal(fila(julio, 8).PROVEEDOR, 'FARMACIA');
});

test('un archivo grande entra en un solo setValues', () => {
  const muchos = Array.from({ length: 3000 }, (_, i) => ({ serie: 46204, gasto: -(i + 1) / 100, proveedor: `P${i}`, clase: 'C' }));
  const { libro, resultado } = correr({ archivos: [F.archivoJulio(muchos)] });
  resultado();
  const julio = libro.getSheetByName(JULIO);
  assert.equal(julio.mutaciones.filter(([m, , f]) => m === 'setValues' && f >= 6).length, 1);
  assert.equal(marcada(julio), true);
});

// --- exclusiones ---

test('excluye antes de abrir el contenido: septiembre, otros meses y sin mes', () => {
  const otro = F.archivoFalso('12. GASTOS DE DICIEMBRE 2026.xlsx', {});
  const sinMes = F.archivoFalso('notas.xlsx', {});
  const sep = F.archivoSeptiembre();
  const julio = F.archivoJulio();
  const { libro, resultado } = correr({ archivos: [otro, sinMes, sep, julio] });
  const lineas = resultado();
  assert.equal(otro.abierto, undefined);
  assert.equal(sinMes.abierto, undefined);
  assert.equal(sep.abierto, undefined);
  assert.deepEqual(sep.leidos, []);
  assert.ok(lineas.includes('12. GASTOS DE DICIEMBRE 2026.xlsx: no incluido'));
  assert.ok(lineas.includes('09. GASTOS DE SEPTIEMBRE 2026.xlsx: no incluido'));
  assert.ok(lineas.includes('notas.xlsx: sin mes'));
  assert.deepEqual(libro.nombres(), [JULIO, SEPTIEMBRE, '_ESTADO', '_HISTORIAL']);
});

test('si falta la pestaña GASTOS registra el motivo, no toca la hoja y sigue con los demás', () => {
  const sinGastos = F.archivoFalso('07. GASTOS DE JULIO 2026.xlsx', F.textosLibro([
    { nombre: 'Hoja4', xml: F.hojaGastos([]) },
  ]));
  const { libro, resultado } = correr({ archivos: [sinGastos, F.archivoAgosto()] });
  const lineas = resultado();
  assert.ok(lineas.includes('07. GASTOS DE JULIO 2026.xlsx: sin pestaña GASTOS'));
  assert.deepEqual(libro.nombres(), [AGOSTO, SEPTIEMBRE, '_ESTADO', '_HISTORIAL']);
});

test('un archivo de gastos sin ningún movimiento no crea pestaña', () => {
  const { libro, resultado } = correr({ archivos: [F.archivoJulio([])] });
  const lineas = resultado();
  assert.ok(lineas.includes('07. GASTOS DE JULIO 2026.xlsx: sin registros'));
  assert.deepEqual(libro.nombres(), [SEPTIEMBRE, '_ESTADO', '_HISTORIAL']);
});

test('sin ningún Excel en la carpeta no toca la hoja y lo dice con un PARO (nunca corre en silencio)', () => {
  const { libro, deps, resultado } = correr({ archivos: [] });
  const lineas = resultado();
  assert.equal(lineas.length, 1);
  assert.match(lineas[0], /^PARO: la carpeta no tiene Excel de los meses a importar \(CONFIG\.HISTORIAL_MESES\); no se tocó nada/);
  assert.deepEqual(deps.logs, lineas);
  assert.deepEqual(libro.nombres(), [SEPTIEMBRE, '_ESTADO', '_HISTORIAL']);
});

test('si la carpeta solo tiene Excel excluidos anota cada uno y termina con el PARO', () => {
  const { libro, resultado } = correr({ archivos: [F.archivoSeptiembre()] });
  const lineas = resultado();
  assert.deepEqual(lineas.slice(0, 1), ['09. GASTOS DE SEPTIEMBRE 2026.xlsx: no incluido']);
  assert.match(lineas[1], /^PARO: la carpeta no tiene Excel de los meses a importar/);
  assert.equal(lineas.length, 2);
  assert.deepEqual(libro.nombres(), [SEPTIEMBRE, '_ESTADO', '_HISTORIAL']);
});

test('dos archivos del mismo mes paran antes de tocar la hoja', () => {
  const otroJulio = F.archivoFalso('07b. GASTOS DE JULIO 2026 copia.xlsx', {});
  const { libro, resultado } = correr({ archivos: [F.archivoJulio(), otroJulio] });
  assert.throws(resultado, /dos archivos.*julio 2026/i);
  assert.deepEqual(libro.nombres(), [SEPTIEMBRE, '_ESTADO', '_HISTORIAL']);
});

// --- repetición y recuperación ---

test('correrla dos veces no duplica: la segunda salta "ya importado" sin abrir los archivos', () => {
  const libro = F.libroBase();
  const julio = F.archivoJulio();
  const agosto = F.archivoAgosto();
  correr({ libro, archivos: [julio, agosto] }).resultado();
  const escrituras = libro.hojas.map((h) => h.mutaciones.length);
  julio.abierto = undefined; agosto.abierto = undefined;
  const { resultado } = correr({ libro, archivos: [julio, agosto] });
  const lineas = resultado();
  assert.ok(lineas.includes(`07. GASTOS DE JULIO 2026.xlsx: ya importado (${JULIO})`));
  assert.ok(lineas.includes(`08. GASTOS DE AGOSTO 2026.xlsx: ya importado (${AGOSTO})`));
  assert.equal(julio.abierto, undefined);
  assert.deepEqual(libro.hojas.map((h) => h.mutaciones.length), escrituras);
  assert.equal(libro.borradas.length, 0);
});

test('una pestaña de archivo sin marca PARA ese mes: ni se borra ni se toca, y los demás siguen', () => {
  const libro = F.libroBase();
  const vieja = F.hojaLibroFalsa(JULIO);
  vieja.poner(6, 1, 'edición a mano');
  libro.hojas.unshift(vieja);
  const { deps, resultado } = correr({ libro, archivos: [F.archivoJulio(), F.archivoAgosto()] });
  const lineas = resultado();
  assert.ok(lineas.includes('07. GASTOS DE JULIO 2026.xlsx: PARO: la pestaña "Julio 2026 (archivo)" existe a medias '
    + '(sin marca); revísala y bórrala a mano si no tiene cambios tuyos, luego vuelve a correr'), lineas.join('\n'));
  assert.deepEqual(deps.logs, lineas);
  assert.deepEqual(vieja.mutaciones, []);
  assert.equal(vieja.leer(6, 1), 'edición a mano');
  assert.equal(marcada(vieja), false);
  assert.deepEqual(libro.nombres(), [JULIO, AGOSTO, SEPTIEMBRE, '_ESTADO', '_HISTORIAL']);
  assert.equal(marcada(libro.getSheetByName(AGOSTO)), true, 'agosto se importó igual');
});

test('la pestaña sin marca para ese mes ni siquiera abre el Excel', () => {
  const libro = F.libroBase();
  libro.hojas.unshift(F.hojaLibroFalsa(JULIO));
  const julio = F.archivoJulio();
  correr({ libro, archivos: [julio] }).resultado();
  assert.equal(julio.abierto, undefined);
});

test('si agosto ya existe marcada, julio se inserta a su izquierda', () => {
  const libro = F.libroBase();
  const agosto = F.hojaLibroFalsa(AGOSTO);
  agosto.getRange('A1').setNote(MARCA_ARCHIVO_IMPORTADO);
  libro.hojas.unshift(agosto);
  correr({ libro, archivos: [F.archivoAgosto(), F.archivoJulio()] }).resultado();
  assert.deepEqual(libro.nombres(), [JULIO, AGOSTO, SEPTIEMBRE, '_ESTADO', '_HISTORIAL']);
});

test('si julio ya existe marcada, agosto va después de julio y antes de septiembre', () => {
  const libro = F.libroBase();
  const julio = F.hojaLibroFalsa(JULIO);
  julio.getRange('A1').setNote(MARCA_ARCHIVO_IMPORTADO);
  libro.hojas.unshift(julio);
  correr({ libro }).resultado();
  assert.deepEqual(libro.nombres(), [JULIO, AGOSTO, SEPTIEMBRE, '_ESTADO', '_HISTORIAL']);
});

test('si ya hay una pestaña real del mismo mes, la de archivo va justo antes sin tocarla', () => {
  const libro = F.libroBase();
  const julio = F.hojaLibroFalsa(JULIO);
  julio.getRange('A1').setNote(MARCA_ARCHIVO_IMPORTADO);
  const agostoReal = F.hojaLibroFalsa('Agosto 2026');
  libro.hojas.unshift(F.hojaLibroFalsa('Febrero 2023'), julio, agostoReal);
  const lineas = correr({ libro }).resultado();
  assert.deepEqual(libro.nombres(),
    ['Febrero 2023', JULIO, AGOSTO, 'Agosto 2026', SEPTIEMBRE, '_ESTADO', '_HISTORIAL']);
  assert.equal(marcada(libro.getSheetByName(AGOSTO)), true);
  assert.deepEqual(agostoReal.mutaciones, []);
  assert.ok(lineas.some((l) => l.startsWith('08. GASTOS DE AGOSTO 2026.xlsx: ') && l.endsWith(`(${AGOSTO})`)),
    lineas.join('\n'));
});

test('una pestaña con el mismo nombre y otra nota no se confunde con la marcada: PARO sin tocarla', () => {
  const libro = F.libroBase();
  const falsa = F.hojaLibroFalsa(JULIO);
  falsa.getRange('A1').setNote('otra nota cualquiera');
  libro.hojas.unshift(falsa);
  const lineas = correr({ libro, archivos: [F.archivoJulio()] }).resultado();
  assert.ok(lineas.some((l) => l.includes('PARO') && l.includes('existe a medias')));
  assert.equal(falsa.borrada, false);
});

// --- fallos: nunca dejan marca de éxito ---

test('un fallo al escribir los datos deja la pestaña sin marca y el reintento termina sin duplicar', () => {
  let fallar = true;
  const libro = F.libroBase({
    falla: (metodo, hoja, args) => fallar && hoja.nombre === AGOSTO && metodo === 'setValues' && args[0] === PRIMERA_FILA_DATOS,
  });
  const primero = correr({ libro });
  assert.throws(primero.resultado, /08\. GASTOS DE AGOSTO 2026\.xlsx: fallo inyectado en setValues/);
  assert.equal(marcada(libro.getSheetByName(JULIO)), true, 'julio terminó antes');
  assert.equal(marcada(libro.getSheetByName(AGOSTO)), false, 'agosto quedó sin marca');
  assert.ok(primero.deps.logs.some((l) => /07\. GASTOS DE JULIO 2026\.xlsx.*3 filas/.test(l)), 'el log conserva lo terminado');
  assert.ok(primero.deps.logs.some((l) => /08\. GASTOS DE AGOSTO 2026\.xlsx: ERROR/.test(l)));
  assert.equal(primero.deps.candado.liberado, 1, 'candado liberado tras el fallo');

  fallar = false;
  const agostoAMedias = libro.getSheetByName(AGOSTO);
  const mutaciones = agostoAMedias.mutaciones.length;
  const segundo = correr({ libro });
  const lineas = segundo.resultado();
  assert.ok(lineas.some((l) => l.includes('07. GASTOS DE JULIO 2026.xlsx: ya importado')));
  assert.ok(lineas.some((l) => /08\. GASTOS DE AGOSTO 2026\.xlsx: PARO: la pestaña "Agosto 2026 \(archivo\)" existe a medias/.test(l)));
  assert.equal(libro.getSheetByName(AGOSTO), agostoAMedias, 'la pestaña a medias sigue ahí');
  assert.equal(agostoAMedias.mutaciones.length, mutaciones, 'el segundo intento no la tocó');
  assert.equal(marcada(agostoAMedias), false);

  libro.hojas.splice(libro.hojas.indexOf(agostoAMedias), 1); // la revisa y borra el administrador a mano
  const tercero = correr({ libro }).resultado();
  assert.ok(tercero.some((l) => /08\. GASTOS DE AGOSTO 2026\.xlsx: 2 filas/.test(l)));
  assert.deepEqual(libro.nombres(), [JULIO, AGOSTO, SEPTIEMBRE, '_ESTADO', '_HISTORIAL']);
  assert.equal(marcada(libro.getSheetByName(AGOSTO)), true);
  assert.equal(libro.getSheetByName(AGOSTO).leer(8, col('PROVEEDOR')), '', 'sin filas duplicadas');
  assert.equal(libro.getSheetByName(AGOSTO).leer(7, col('PROVEEDOR')), 'DEPOSITO');
});

test('un fallo de formato deja la pestaña sin marca', () => {
  const libro = F.libroBase({ falla: (metodo, hoja) => hoja.nombre === JULIO && metodo === 'hideColumns' });
  assert.throws(() => correr({ libro }).resultado(), /07\. GASTOS DE JULIO 2026\.xlsx: fallo inyectado en hideColumns/);
  assert.equal(marcada(libro.getSheetByName(JULIO)), false);
  assert.equal(libro.getSheetByName(AGOSTO), null, 'no siguió con agosto');
});

test('un fallo de cabecera deja la pestaña sin marca', () => {
  const libro = F.libroBase({ falla: (metodo, hoja) => hoja.nombre === JULIO && metodo === 'setFormulas' });
  assert.throws(() => correr({ libro }).resultado(), /fallo inyectado en setFormulas/);
  assert.equal(marcada(libro.getSheetByName(JULIO)), false);
});

test('un fallo al escribir la marca no cuenta como importada', () => {
  const libro = F.libroBase({ falla: (metodo, hoja) => hoja.nombre === JULIO && metodo === 'setNote' });
  assert.throws(() => correr({ libro }).resultado(), /fallo inyectado en setNote/);
  assert.equal(marcada(libro.getSheetByName(JULIO)), false);
});

test('si lo leído no cuadra con el Excel al centavo no hay marca', () => {
  const libro = F.libroBase({
    transformarEscritura: (valores) => valores.map((f) => f.map((v, j) => (j === col('GASTO (USD)') - 1 && v === 5.2 ? 5.21 : v))),
  });
  assert.throws(() => correr({ libro }).resultado(), /07\. GASTOS DE JULIO 2026\.xlsx: no cuadra.*gastos/);
  assert.equal(marcada(libro.getSheetByName(JULIO)), false);
});

test('si faltan filas o depósitos al leer de vuelta no hay marca', () => {
  const sinDeposito = F.libroBase({
    transformarEscritura: (valores) => valores.map((f) => f.map((v, j) => (j === col('DEPÓSITO') - 1 ? '' : v))),
  });
  assert.throws(() => correr({ libro: sinDeposito }).resultado(), /no cuadra.*depósitos/);
  const sinIds = F.libroBase({
    transformarEscritura: (valores) => valores.map((f) => f.map((v, j) => (j === col('ID FILA') - 1 ? '' : v))),
  });
  assert.throws(() => correr({ libro: sinIds }).resultado(), /no cuadra.*filas/);
  assert.equal(marcada(sinIds.getSheetByName(JULIO)), false);
});

test('un valor no numérico leído de vuelta tampoco cuadra', () => {
  const libro = F.libroBase({
    transformarEscritura: (valores) => valores.map((f) => f.map((v, j) => (j === col('GASTO (USD)') - 1 && v === 10.1 ? 'abc' : v))),
  });
  assert.throws(() => correr({ libro }).resultado(), /no cuadra/);
});

const cambiarCelda = (columna, de, a) => (valores) => valores.map((f) => f.map((v, j) => (j === col(columna) - 1 && v === de ? a : v)));

test('un texto alterado al escribir no cuadra: sin marca y el error nombra fila y columna', () => {
  [['PROVEEDOR', 'FARMACIA', 'FARMACIA X', 8], ['COMENTARIOS', 'ñandú 😀', 'nandu', 7],
    ['CLASE DE GASTO', 'COMIDA PLAYA', 'COMIDA', 7], ['CASA', 'PRINCIPAL', 'OTRA', 8]].forEach(([columna, de, a, fila]) => {
    const libro = F.libroBase({ transformarEscritura: cambiarCelda(columna, de, a) });
    assert.throws(() => correr({ libro }).resultado(), new RegExp(`07\\. GASTOS DE JULIO 2026\\.xlsx: no cuadra: fila ${fila} columna ${columna}`));
    assert.equal(marcada(libro.getSheetByName(JULIO)), false);
  });
});

test('el apóstrofo de escape que Sheets consume no es diferencia (el proveedor "=CMD()" cuadra)', () => {
  const { libro, resultado } = correr();
  resultado();
  const julio = libro.getSheetByName(JULIO);
  assert.equal(julio.leer(7, col('PROVEEDOR')), "'=CMD()", 'se escribió con escape');
  assert.equal(julio.getRange(7, col('PROVEEDOR')).getValues()[0][0], '=CMD()', 'Sheets lo devuelve sin apóstrofo');
  assert.equal(marcada(julio), true);
});

test('un texto seguro que vuelve CON el apóstrofo tampoco cuadra', () => {
  const libro = F.libroBase({ transformarEscritura: cambiarCelda('PROVEEDOR', "'=CMD()", "''=CMD()") });
  assert.throws(() => correr({ libro }).resultado(), /no cuadra: fila 7 columna PROVEEDOR/);
});

test('FECHA que Sheets convirtió en Date: mismo día cuadra, otro día no', () => {
  const conFecha = (fecha) => F.libroBase({ transformarEscritura: cambiarCelda('FECHA', '2026-07-01', fecha) });
  const mismoDia = conFecha(new Date(2026, 6, 1));
  correr({ libro: mismoDia }).resultado();
  assert.equal(marcada(mismoDia.getSheetByName(JULIO)), true);
  const otroDia = conFecha(new Date(2026, 6, 2));
  assert.throws(() => correr({ libro: otroDia }).resultado(), /no cuadra: fila 6 columna FECHA/);
  assert.equal(marcada(otroDia.getSheetByName(JULIO)), false);
});

test('si falla más de una cosa el mensaje trae los totales y el primer texto distinto', () => {
  const libro = F.libroBase({ transformarEscritura: (v) => cambiarCelda('PROVEEDOR', 'FARMACIA', 'X')(cambiarCelda('GASTO (USD)', 5.2, 5.21)(v)) });
  assert.throws(() => correr({ libro }).resultado(), /no cuadra: gastos \(Excel 15\.3, hoja 15\.31\), fila 8 columna PROVEEDOR/);
});

test('un Excel ilegible identifica el archivo en el error y se relanza', () => {
  const roto = F.archivoFalso('08. GASTOS DE AGOSTO 2026.xlsx', { 'xl/workbook.xml': '<workbook/>' });
  const { deps, resultado } = correr({ archivos: [F.archivoJulio(), roto] });
  assert.throws(resultado, /08\. GASTOS DE AGOSTO 2026\.xlsx: no parece un \.xlsx/);
  assert.ok(deps.logs.some((l) => /07\. GASTOS DE JULIO 2026\.xlsx/.test(l) && /3 filas/.test(l)));
});

test('un error que no es Error también se convierte en un error con el archivo', () => {
  const libro = F.libroBase({ falla: () => { throw 'texto suelto'; } });
  assert.throws(() => correr({ libro }).resultado(), /07\. GASTOS DE JULIO 2026\.xlsx: texto suelto/);
});

// --- candado ---

test('sin candado no toca nada y lo dice', () => {
  const libro = F.libroBase();
  const { deps, resultado } = correr({ libro, candado: F.candadoFalso(false) });
  const lineas = resultado();
  assert.deepEqual(lineas, ['PARO: no se pudo tomar el candado; no se tocó nada']);
  assert.deepEqual(deps.candado.intentos, [ESPERA_CANDADO_IMPORTACION_MS]);
  assert.equal(deps.candado.liberado, 0);
  assert.deepEqual(libro.nombres(), [SEPTIEMBRE, '_ESTADO', '_HISTORIAL']);
});

test('con candado lo libera al terminar', () => {
  const { deps, resultado } = correr();
  resultado();
  assert.equal(deps.candado.liberado, 1);
});

// --- función de editor ---

test('importarArchivosViejos usa CONFIG, el candado del script y Logger', () => {
  const libro = F.libroBase();
  const candado = F.candadoFalso();
  const pedidos = [];
  const registro = [];
  global.SpreadsheetApp.openById = (id) => { pedidos.push(['libro', id]); return libro; };
  global.DriveApp = { getFolderById: (id) => { pedidos.push(['carpeta', id]); return F.carpetaFalsa([F.archivoJulio()]); } };
  global.LockService = { getScriptLock: () => candado };
  global.Logger = { log: (l) => registro.push(l) };
  const lineas = importarArchivosViejos();
  assert.deepEqual(pedidos, [['libro', CONFIG.SHEET_ID], ['carpeta', CONFIG.HISTORIAL_FOLDER_ID]]);
  assert.equal(marcada(libro.getSheetByName(JULIO)), true);
  assert.deepEqual(registro, lineas);
  assert.equal(candado.liberado, 1);
  const deps = dependenciasImportacion_();
  assert.ok(deps.ahora() instanceof Date);
  delete global.SpreadsheetApp.openById;
  delete global.DriveApp;
  delete global.LockService;
  delete global.Logger;
});
