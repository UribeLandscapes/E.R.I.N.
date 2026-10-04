const test = require('node:test');
const assert = require('node:assert/strict');

// En Apps Script son globales; en Node se cargan antes de Ediciones.js.
Object.assign(global, require('../src/Hoja.js'));
Object.assign(global, require('../src/Escritura.js'));
Object.assign(global, require('../src/Edicion.js'));

const {
  PESTANA_EDICIONES, COLUMNAS_EDICIONES, COLUMNAS_SISTEMA,
  PROPIEDAD_EDICIONES_CREADA, PROPIEDAD_EDICIONES_PERDIDA, SEPARADOR_COLUMNAS,
  esFilaBotAnotable_, columnasAnotables_, filaEdicion_, encabezadosEdicionesOk_,
  estadoEdiciones_, selloDeIdFila_, esCorte_, registroEdiciones_, proteccionFila_,
  tieneEdicionesManuales_, filtrarCambiosManuales_, puedeCambiarRevisar_, choquesPosteriores_,
  TEXTO_NO_BORRO_MANUAL, TEXTO_NO_CORRIJO_MANUAL, textoColumnasSaltadas_, textoNadaCambiado_, textoChoque_,
} = require('../src/Ediciones.js');

const idNuevo = 'BOT-20260929-110001-501-1';
const idViejo = 'BOT-20260928-110001-501-1';
const corte = '20260929-110000';
const bot = (datos = {}) => ({ 'ID FILA': idNuevo, ORIGEN: 'BOT', ...datos });
const registro = (filas = [], disponible = true, sello = corte) =>
  registroEdiciones_({ filas, corte: sello, disponible });

test('constantes de _EDICIONES y columnas del sistema son las aprobadas e inmutables', () => {
  assert.equal(PESTANA_EDICIONES, '_EDICIONES');
  assert.deepEqual(COLUMNAS_EDICIONES, ['FECHA', 'PESTAÑA', 'ID FILA', 'COLUMNAS']);
  assert.deepEqual(COLUMNAS_SISTEMA, ['ID FILA', 'ORIGEN', 'REGISTRADO']);
  assert.equal(Object.isFrozen(COLUMNAS_EDICIONES), true);
  assert.equal(Object.isFrozen(COLUMNAS_SISTEMA), true);
  assert.equal(PROPIEDAD_EDICIONES_CREADA, 'EDICIONES_CREADA');
  assert.equal(PROPIEDAD_EDICIONES_PERDIDA, 'EDICIONES_PERDIDA');
  assert.equal(SEPARADOR_COLUMNAS, '|');
});

test('solo fila BOT con ID lleno sin prefijo MANUAL- se anota', () => {
  assert.equal(esFilaBotAnotable_(bot()), true);
  for (const datos of [
    { 'ID FILA': '' }, { 'ID FILA': 'MANUAL-20260929-110001-6' },
    { ORIGEN: 'MANUAL' }, { ORIGEN: ' BOT otro ' }, { ORIGEN: '' },
  ]) assert.equal(esFilaBotAnotable_(bot(datos)), false);
  assert.equal(esFilaBotAnotable_(bot({ ORIGEN: ' BOT ' })), true);
});

test('columnasAnotables_ conserva orden, elimina repetidas, ocultas del sistema y nombres ajenos', () => {
  const columnas = ['ID FILA', 'PROVEEDOR', 'REGISTRADO', 'FECHA', 'PROVEEDOR',
    'ORIGEN', 'OTRA', 'REVISAR'];
  assert.deepEqual(columnasAnotables_(columnas), ['PROVEEDOR', 'FECHA', 'REVISAR']);
  assert.deepEqual(columnas, ['ID FILA', 'PROVEEDOR', 'REGISTRADO', 'FECHA',
    'PROVEEDOR', 'ORIGEN', 'OTRA', 'REVISAR']);
});

test('filaEdicion_ crea una fila con solo columnas anotables; ignora filas sin identidad', () => {
  const fecha = new Date(2026, 8, 29, 11);
  assert.deepEqual(filaEdicion_(fecha, 'Septiembre 2026', bot(),
    ['ID FILA', 'PROVEEDOR', 'PROVEEDOR', 'FECHA']),
  [fecha, 'Septiembre 2026', idNuevo, 'PROVEEDOR|FECHA']);
  assert.equal(filaEdicion_(fecha, 'Septiembre 2026', bot(), ['ORIGEN', 'REGISTRADO']), null);
  assert.equal(filaEdicion_(fecha, 'Septiembre 2026', bot({ 'ID FILA': '' }), ['FECHA']), null);
});

test('encabezadosEdicionesOk_ compara las cuatro primeras celdas como texto', () => {
  assert.equal(encabezadosEdicionesOk_([...COLUMNAS_EDICIONES, 'EXTRA']), true);
  assert.equal(encabezadosEdicionesOk_([' FECHA ', 'PESTAÑA', 'ID FILA', 'COLUMNAS']), true);
  assert.equal(encabezadosEdicionesOk_(['FECHA', 'PESTAÑA', 'ID FILA']), false);
  assert.equal(encabezadosEdicionesOk_(['FECHA', 'PESTAÑA', 'ID FILA', 'COLUMNAS MAL']), false);
});

test('estadoEdiciones_ cubre arranque, lista y todas las mezclas perdidas', () => {
  const casos = [
    [{ creada: '', perdida: '', pestanaExiste: false, encabezadosOk: false }, 'ARRANCAR'],
    [{ creada: null, perdida: null, pestanaExiste: false, encabezadosOk: true }, 'ARRANCAR'],
    [{ creada: corte, perdida: '', pestanaExiste: true, encabezadosOk: true }, 'LISTA'],
    [{ creada: corte, perdida: 'sí', pestanaExiste: true, encabezadosOk: true }, 'PERDIDA'],
    [{ creada: '', perdida: 'sí', pestanaExiste: false, encabezadosOk: false }, 'PERDIDA'],
    [{ creada: corte, perdida: '', pestanaExiste: false, encabezadosOk: false }, 'PERDIDA'],
    [{ creada: corte, perdida: '', pestanaExiste: false, encabezadosOk: true }, 'PERDIDA'],
    [{ creada: '', perdida: '', pestanaExiste: true, encabezadosOk: true }, 'PERDIDA'],
    [{ creada: '', perdida: '', pestanaExiste: true, encabezadosOk: false }, 'PERDIDA'],
    [{ creada: corte, perdida: '', pestanaExiste: true, encabezadosOk: false }, 'PERDIDA'],
  ];
  for (const [entrada, esperado] of casos) assert.equal(estadoEdiciones_(entrada), esperado);
  for (const creada of ['', corte]) {
    for (const pestanaExiste of [false, true]) {
      for (const encabezadosOk of [false, true]) {
        assert.equal(estadoEdiciones_({ creada, perdida: 'sí', pestanaExiste, encabezadosOk }), 'PERDIDA');
      }
    }
  }
});

test('selloDeIdFila_ extrae solo IDs BOT completos; esCorte_ exige sello exacto', () => {
  assert.equal(selloDeIdFila_(idNuevo), '20260929-110001');
  assert.equal(selloDeIdFila_('BOT-20260929-110001-mensaje-con-guiones-12'), '20260929-110001');
  for (const id of ['MANUAL-20260929-110001-6', 'BOT-20260929-110001--1',
    'BOT-20260929-110001-501-x', 'BOT-20260929-11000-501-1',
    'BOT-20260929-110001-501-1-extra', ' BOT-20260929-110001-501-1']) {
    assert.equal(selloDeIdFila_(id), null);
  }
  assert.equal(esCorte_(corte), true);
  for (const valor of ['', null, '20260929-11000', '20260929-110000x']) {
    assert.equal(esCorte_(valor), false);
  }
});

test('registroEdiciones_ une columnas por ID en orden e ignora ID vacío', () => {
  const filas = [
    [new Date(), 'Septiembre 2026', idNuevo, 'PROVEEDOR|FECHA'],
    [new Date(), 'Septiembre 2026', '', 'REVISAR'],
    [new Date(), 'Septiembre 2026', idNuevo, 'FECHA|REVISAR'],
  ];
  const r = registro(filas);
  assert.equal(Object.isFrozen(r), true);
  assert.equal(r.disponible, true);
  assert.equal(r.corte, corte);
  assert.deepEqual([...r.porId], [[idNuevo, ['PROVEEDOR', 'FECHA', 'REVISAR']]]);
  assert.equal(filas[0][3], 'PROVEEDOR|FECHA');
});

test('proteccionFila_ protege entera si registro, corte o identidad no son fiables', () => {
  for (const [r, id] of [
    [registro([], false), idNuevo], [registro([], true, 'malo'), idNuevo],
    [registro(), ''], [registro(), 'MANUAL-20260929-110001-6'],
    [registro(), 'BOT-1'], [registro(), idViejo],
    [registro(), 'BOT-20260929-110000-501-1'],
  ]) assert.deepEqual(proteccionFila_(r, id), { entera: true, columnas: [] });
});

test('proteccionFila_ permite ID posterior al corte y devuelve sus anotaciones', () => {
  const r = registro([[new Date(), 'Septiembre 2026', idNuevo, 'FECHA|REVISAR']]);
  assert.deepEqual(proteccionFila_(r, idNuevo), { entera: false, columnas: ['FECHA', 'REVISAR'] });
  assert.deepEqual(proteccionFila_(registro(), idNuevo), { entera: false, columnas: [] });
});

test('tieneEdicionesManuales_ atiende lista vacía, celdas anotadas y protección entera', () => {
  assert.equal(tieneEdicionesManuales_(registro(), []), false);
  assert.equal(tieneEdicionesManuales_(registro(), [idNuevo]), false);
  assert.equal(tieneEdicionesManuales_(registro([[new Date(), 'Mes', idNuevo, 'FECHA']]), [idNuevo]), true);
  assert.equal(tieneEdicionesManuales_(registro(), [idNuevo, idViejo]), true);
});

test('filtrarCambiosManuales_ rellena solo ocultas vacías y omite las ya llenas', () => {
  const cambios = { 'ID FILA': idNuevo, ORIGEN: 'BOT', REGISTRADO: new Date(), FECHA: 'hoy' };
  const actuales = { 'ID FILA': '', ORIGEN: 'MANUAL', REGISTRADO: null, FECHA: '' };
  const r = filtrarCambiosManuales_(registro(), idNuevo, cambios, actuales);
  assert.deepEqual(r, { escribir: {
    'ID FILA': idNuevo, REGISTRADO: cambios.REGISTRADO, FECHA: 'hoy',
  }, saltadas: [] });
  assert.deepEqual(actuales, { 'ID FILA': '', ORIGEN: 'MANUAL', REGISTRADO: null, FECHA: '' });
  assert.deepEqual(Object.keys(cambios), ['ID FILA', 'ORIGEN', 'REGISTRADO', 'FECHA']);
});

test('filtrarCambiosManuales_ salta todas las visibles si protección es entera', () => {
  const cambios = { FECHA: 'hoy', ORIGEN: 'BOT', PROVEEDOR: 'Xtra', 'ID FILA': idViejo };
  assert.deepEqual(filtrarCambiosManuales_(registro(), idViejo, cambios,
    { ORIGEN: 'BOT', 'ID FILA': '' }),
  { escribir: { 'ID FILA': idViejo }, saltadas: ['FECHA', 'PROVEEDOR'] });
});

test('filtrarCambiosManuales_ salta solo columnas anotadas en orden de cambios', () => {
  const r = registro([[new Date(), 'Mes', idNuevo, 'REVISAR|PROVEEDOR']]);
  assert.deepEqual(filtrarCambiosManuales_(r, idNuevo,
    { FECHA: 'hoy', PROVEEDOR: 'Xtra', REVISAR: '', 'CLASE DE GASTO': 'Comida' }, {}),
  { escribir: { FECHA: 'hoy', 'CLASE DE GASTO': 'Comida' },
    saltadas: ['PROVEEDOR', 'REVISAR'] });
});

test('puedeCambiarRevisar_ exige BOT anotable y REVISAR libre, incluida edición actual', () => {
  assert.equal(puedeCambiarRevisar_(registro(), bot(), ['FECHA']), true);
  assert.equal(puedeCambiarRevisar_(registro(), bot(), ['REVISAR']), false);
  assert.equal(puedeCambiarRevisar_(registro([[new Date(), 'Mes', idNuevo, 'REVISAR']]),
    bot(), ['FECHA']), false);
  assert.equal(puedeCambiarRevisar_(registro(), bot({ ORIGEN: 'MANUAL' }), ['FECHA']), false);
  assert.equal(puedeCambiarRevisar_(registro(), bot({ 'ID FILA': 'MANUAL-1' }), ['FECHA']), false);
  assert.equal(puedeCambiarRevisar_(registro([], false), bot(), ['FECHA']), false);
});

test('choquesPosteriores_ detecta celdas coincidentes, sin duplicados y con fecha inválida', () => {
  const desde = new Date(2026, 8, 29, 11);
  const escrito = [{ pestana: 'Septiembre 2026', idFila: idNuevo,
    columnas: ['PROVEEDOR', 'FECHA'] }];
  const fila = (fecha, pestana = 'Septiembre 2026', id = idNuevo, columnas = 'PROVEEDOR') =>
    [fecha, pestana, id, columnas];
  const filas = [
    fila(new Date(2026, 8, 29, 10)), fila(desde),
    fila(new Date(2026, 8, 29, 12), 'Otro mes'),
    fila(new Date(2026, 8, 29, 12), 'Septiembre 2026', 'otro'),
    fila(new Date(2026, 8, 29, 12), 'Septiembre 2026', idNuevo, 'REVISAR'),
    fila(new Date(2026, 8, 29, 12), 'Septiembre 2026', idNuevo, 'FECHA|PROVEEDOR'),
    fila('fecha mala', 'Septiembre 2026', idNuevo, 'PROVEEDOR'),
    fila(new Date(NaN), 'Septiembre 2026', idNuevo, 'FECHA'),
  ];
  assert.deepEqual(choquesPosteriores_(filas, desde, escrito), [
    { pestana: 'Septiembre 2026', idFila: idNuevo, columna: 'FECHA' },
    { pestana: 'Septiembre 2026', idFila: idNuevo, columna: 'PROVEEDOR' },
  ]);
  assert.deepEqual(choquesPosteriores_(filas, desde, []), []);
});

test('textos para el usuario conservan redacción exacta y enumeran una o varias columnas', () => {
  assert.equal(TEXTO_NO_BORRO_MANUAL,
    'Esa entrada tiene cambios hechos a mano en la hoja, así que no la borro. Si quieres quitarla, bórrala en la hoja.');
  assert.equal(TEXTO_NO_CORRIJO_MANUAL,
    'Esa entrada tiene cambios hechos a mano en la hoja, así que no la cambio. Corrígela en la hoja.');
  assert.equal(textoColumnasSaltadas_([]), '');
  assert.equal(textoColumnasSaltadas_(['PROVEEDOR']),
    'Anoté lo demás, pero no cambié PROVEEDOR: la editaron a mano en la hoja.');
  assert.equal(textoColumnasSaltadas_(['PROVEEDOR', 'FECHA']),
    'Anoté lo demás, pero no cambié PROVEEDOR y FECHA: las editaron a mano en la hoja.');
  assert.equal(textoColumnasSaltadas_(['PROVEEDOR', 'FECHA', 'CLASE DE GASTO']),
    'Anoté lo demás, pero no cambié PROVEEDOR, FECHA y CLASE DE GASTO: las editaron a mano en la hoja.');
  assert.equal(textoNadaCambiado_(['PROVEEDOR']),
    'No cambié PROVEEDOR: la editaron a mano en la hoja.');
  assert.equal(textoNadaCambiado_(['PROVEEDOR', 'FECHA']),
    'No cambié PROVEEDOR y FECHA: las editaron a mano en la hoja.');
  assert.equal(textoChoque_({ pestana: 'Septiembre 2026', idFila: idNuevo, columna: 'FECHA' }),
    `posible choque con edición a mano: Septiembre 2026 ${idNuevo} FECHA`);
});
