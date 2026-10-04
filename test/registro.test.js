const test = require('node:test');
const assert = require('node:assert/strict');

// En Apps Script estos nombres son globales; en Node se ponen a mano.
Object.assign(global, require('../src/Hoja.js'), require('../src/Moneda.js'));
Object.assign(global, require('../src/Hoja.js'));
Object.assign(global, require('../src/Reglas.js'));
Object.assign(global, require('../src/Escritura.js'));
Object.assign(global, require('../src/Clases.js'));
Object.assign(global, require('../src/Texto.js'));
Object.assign(global, require('../src/Confirmacion.js'));
Object.assign(global, require('../src/Botones.js'));
Object.assign(global, require('../src/Registro.js'));

const { COLUMNAS_ESTADO } = require('../src/Hoja.js');
const {
  hayCambio_,
  TIPO_ESTADO_REGISTRO, TIPO_ESTADO_BORRAR, PREFIJO_BORRAR, INTENCIONES_CORRECCION,
  INTENCIONES_NO_CORRECCION, TEXTO_REGISTRO_NO_ESTA, TEXTO_BORRADO, TEXTO_NO_BORRADO,
  filaRegistro_, registrosAbiertos_, buscarRegistro_, ultimoRegistro_, fusionarCorreccion_,
  tecladoBorrar_, leerBotonBorrar_, filaBorrar_, buscarBorrar_,
} = require('../src/Registro.js');

const AHORA = new Date(2026, 8, 27, 9, 30, 0);
const col = (nombre) => COLUMNAS_ESTADO.indexOf(nombre);

const FILA_GASTO = Object.freeze({
  FECHA: '2026-09-26',
  'ID FACTURA': 'RIBASMITH-20260926',
  TIPO: 'GASTO',
  PROVEEDOR: 'Riba Smith',
  'DESCRIPCIÓN': 'Supermercado',
  'ARTÍCULOS': 22.5,
  'GASTO (USD)': 22.5,
  MONEDA: 'USD',
  CASA: 'COMPARTIDO',
  'ID FILA': 'BOT-20260927-093000-501-1',
  ORIGEN: 'BOT',
  'ID MENSAJE TG': 501,
});

const DATOS_GEMINI = Object.freeze({
  intencion: 'GASTO', proveedor: 'Riba Smith', fecha: '2026-09-26', moneda: 'USD',
  forma_pago: 'DESCONOCIDA', lineas: [], total: 22.5, clase: 'GROCERIES', casa: null,
  comentario: null, descripcion_corta: 'super',
});

const registro = (cambios = {}) => filaRegistro_({
  creado: AHORA,
  clave: 901,
  filas: [FILA_GASTO],
  pestana: 'Septiembre 2026',
  datos: DATOS_GEMINI,
  idFactura: 'RIBASMITH-20260926',
  fechaMensaje: '2026-09-27',
  idMensaje: 501,
  ...cambios,
});

// --- Fila REGISTRO de _ESTADO ---

test('filaRegistro_ arma la fila de _ESTADO en el orden de las columnas', () => {
  const fila = registro();
  assert.equal(fila.length, COLUMNAS_ESTADO.length);
  assert.equal(fila[col('CREADO')], AHORA);
  assert.equal(fila[col('TIPO')], TIPO_ESTADO_REGISTRO);
  assert.equal(fila[col('TIPO')], 'REGISTRO');
  assert.equal(fila[col('CLAVE')], '901');
  assert.equal(fila[col('ID FILAS')], 'BOT-20260927-093000-501-1');
  assert.equal(fila[col('ESTADO')], 'ABIERTA');
  const datos = JSON.parse(fila[col('DATOS')]);
  assert.equal(datos.pestana, 'Septiembre 2026');
  assert.equal(datos.idFactura, 'RIBASMITH-20260926');
  assert.equal(datos.fechaMensaje, '2026-09-27');
  assert.equal(datos.idMensaje, 501);
  assert.deepEqual(datos.datos, DATOS_GEMINI);
  assert.deepEqual(datos.resumen,
    { tipo: 'gasto', proveedor: 'Riba Smith', monto: 22.5, fecha: '2026-09-26' });
});

test('filaRegistro_ junta los ID FILA de todas las líneas', () => {
  const fila = registro({ filas: [FILA_GASTO, { ...FILA_GASTO, 'ID FILA': 'BOT-x-2' }] });
  assert.equal(fila[col('ID FILAS')], 'BOT-20260927-093000-501-1,BOT-x-2');
});

test('registrosAbiertos_ lee los REGISTRO ABIERTOS con su número de fila', () => {
  const abiertos = registrosAbiertos_([registro()]);
  assert.equal(abiertos.length, 1);
  assert.equal(abiertos[0].fila, 2);
  assert.equal(abiertos[0].clave, '901');
  assert.deepEqual(abiertos[0].idFilas, ['BOT-20260927-093000-501-1']);
  assert.equal(abiertos[0].pestana, 'Septiembre 2026');
  assert.equal(abiertos[0].idMensaje, 501);
  assert.deepEqual(abiertos[0].datos, DATOS_GEMINI);
});

test('registrosAbiertos_ ignora cerrados, otros tipos y DATOS que no se pueden leer', () => {
  const cerrado = registro();
  cerrado[col('ESTADO')] = 'CERRADA';
  const otroTipo = registro();
  otroTipo[col('TIPO')] = 'PREGUNTA';
  const roto = registro();
  roto[col('DATOS')] = 'no es json';
  const sinDatos = registro();
  sinDatos[col('DATOS')] = JSON.stringify({ pestana: 'x' });
  assert.deepEqual(registrosAbiertos_([cerrado, otroTipo, roto, sinDatos]), []);
});

test('registrosAbiertos_ aguanta un REGISTRO sin ID FILAS', () => {
  const fila = registro();
  fila[col('ID FILAS')] = '';
  assert.deepEqual(registrosAbiertos_([fila])[0].idFilas, []);
});

test('buscarRegistro_ encuentra por clave, venga como número o como texto', () => {
  const abiertos = registrosAbiertos_([registro()]);
  assert.equal(buscarRegistro_(abiertos, 901).clave, '901');
  assert.equal(buscarRegistro_(abiertos, '901').clave, '901');
  assert.equal(buscarRegistro_(abiertos, 902), null);
});

test('ultimoRegistro_ devuelve el más nuevo (Supuesto Y: "el último")', () => {
  const viejo = registro({ clave: 900, creado: new Date(2026, 8, 27, 8, 0, 0) });
  const nuevo = registro({ clave: 901, creado: new Date(2026, 8, 27, 9, 0, 0) });
  assert.equal(ultimoRegistro_(registrosAbiertos_([nuevo, viejo])).clave, '901');
  assert.equal(ultimoRegistro_(registrosAbiertos_([viejo, nuevo])).clave, '901');
});

test('ultimoRegistro_ con la misma hora se queda con el de más abajo, y null si no hay ninguno', () => {
  const a = registro({ clave: 900 });
  const b = registro({ clave: 901 });
  assert.equal(ultimoRegistro_(registrosAbiertos_([a, b])).clave, '901');
  assert.equal(ultimoRegistro_([]), null);
});

test('registrosAbiertos_ lee un CREADO guardado como texto', () => {
  const fila = registro({ creado: '2026-09-27T09:30:00.000Z' });
  assert.equal(ultimoRegistro_(registrosAbiertos_([fila])).clave, '901');
});

// --- Fusión de la corrección ---

test('fusionarCorreccion_ solo cambia lo que Gemini llenó', () => {
  const cambios = {
    intencion: 'CORREGIR', proveedor: 'Super 99', fecha: null, moneda: null, forma_pago: 'DESCONOCIDA',
    lineas: [], total: null, clase: 'PENDIENTE', casa: null, comentario: null,
  };
  assert.deepEqual(fusionarCorreccion_(DATOS_GEMINI, cambios), { ...DATOS_GEMINI, proveedor: 'Super 99' });
});

test('fusionarCorreccion_ conserva la foto y su id cuando la entrada vino de una foto', () => {
  const guardados = { ...DATOS_GEMINI, foto: 'https://drive.google.com/abc', idFoto: 'archivo-1' };
  const fusion = fusionarCorreccion_(guardados, { intencion: 'CORREGIR', proveedor: 'Super 99' });
  assert.equal(fusion.foto, 'https://drive.google.com/abc');
  assert.equal(fusion.idFoto, 'archivo-1');
});

test('fusionarCorreccion_ conserva la intención original de la entrada', () => {
  const fusion = fusionarCorreccion_({ ...DATOS_GEMINI, intencion: 'DEPOSITO' }, { intencion: 'CORREGIR' });
  assert.equal(fusion.intencion, 'DEPOSITO');
});

test('fusionarCorreccion_ cambia fecha, moneda, total, forma de pago, clase, casa y comentario', () => {
  const cambios = {
    intencion: 'CORREGIR', proveedor: null, fecha: '2026-09-25', moneda: 'COP', forma_pago: 'TARJETA',
    lineas: [], total: 30, clase: 'GROCERIES 2', casa: 'SECUNDARIA', comentario: 'para la fiesta',
  };
  assert.deepEqual(fusionarCorreccion_(DATOS_GEMINI, cambios), {
    ...DATOS_GEMINI, fecha: '2026-09-25', moneda: 'COP', forma_pago: 'TARJETA', total: 30,
    clase: 'GROCERIES 2', casa: 'SECUNDARIA', comentario: 'para la fiesta',
  });
});

test('fusionarCorreccion_ reemplaza las líneas cuando la corrección trae líneas', () => {
  const lineas = [
    { tipo: 'ITEM', descripcion: 'compras', monto: 21, confianza: 'ALTA' },
    { tipo: 'PROPINA', descripcion: 'propina', monto: 1.5, confianza: 'ALTA' },
  ];
  const fusion = fusionarCorreccion_({ ...DATOS_GEMINI, lineas: [{ tipo: 'ITEM', descripcion: 'x', monto: 22.5, confianza: 'ALTA' }] }, { lineas });
  assert.deepEqual(fusion.lineas, lineas);
});

test('fusionarCorreccion_ acepta un total de 0 y no se traga un comentario vacío', () => {
  assert.equal(fusionarCorreccion_(DATOS_GEMINI, { total: 0 }).total, 0);
  assert.equal(fusionarCorreccion_({ ...DATOS_GEMINI, comentario: 'algo' }, { comentario: '' }).comentario, 'algo');
});

test('fusionarCorreccion_ ajusta la única línea guardada al nuevo total si la corrección no trae líneas (defecto E1)', () => {
  const guardados = {
    ...DATOS_GEMINI,
    lineas: [{ tipo: 'ITEM', descripcion: 'efectivo', monto: 25, confianza: 'ALTA' }],
    total: 25,
  };
  const fusion = fusionarCorreccion_(guardados, { intencion: 'CORREGIR', total: 22.5, lineas: [] });
  assert.equal(fusion.total, 22.5);
  assert.deepEqual(fusion.lineas, [{ tipo: 'ITEM', descripcion: 'efectivo', monto: 22.5, confianza: 'ALTA' }]);
});

test('fusionarCorreccion_ no toca las líneas guardadas cuando son dos o más (las deja para la pregunta de descuadre)', () => {
  const guardados = {
    ...DATOS_GEMINI,
    lineas: [
      { tipo: 'ITEM', descripcion: 'compras', monto: 21, confianza: 'ALTA' },
      { tipo: 'PROPINA', descripcion: 'propina', monto: 1.5, confianza: 'ALTA' },
    ],
    total: 22.5,
  };
  const fusion = fusionarCorreccion_(guardados, { intencion: 'CORREGIR', total: 20, lineas: [] });
  assert.equal(fusion.total, 20);
  assert.deepEqual(fusion.lineas, guardados.lineas);
});

test('fusionarCorreccion_ no crea una línea de la nada si la entrada guardada no tenía ninguna', () => {
  const fusion = fusionarCorreccion_({ ...DATOS_GEMINI, lineas: [] }, { intencion: 'CORREGIR', total: 30, lineas: [] });
  assert.equal(fusion.total, 30);
  assert.deepEqual(fusion.lineas, []);
});

// --- Intenciones que apuntan a una entrada ---

test('las intenciones de corrección y las que nunca corrigen están separadas', () => {
  assert.deepEqual(INTENCIONES_CORRECCION, ['CORREGIR', 'BORRAR']);
  assert.deepEqual(INTENCIONES_NO_CORRECCION, ['CONTEO', 'SALDO_INICIAL', 'AYUDA']);
});

// --- Botones de borrar (texto (e)) ---

test('tecladoBorrar_ da los dos botones aprobados con callback_data corto en ASCII', () => {
  const teclado = tecladoBorrar_(901);
  assert.deepEqual(teclado, {
    inline_keyboard: [[
      { text: 'Sí, bórralo', callback_data: 'borrar:901:si' },
      { text: 'No, déjalo', callback_data: 'borrar:901:no' },
    ]],
  });
  assert.equal(PREFIJO_BORRAR, 'borrar');
  teclado.inline_keyboard[0].forEach((boton) => {
    assert.ok(Buffer.byteLength(boton.callback_data, 'utf8') <= 64);
  });
});

test('tecladoBorrar_ rechaza claves vacías, con otros caracteres o que pasen de 64 bytes', () => {
  assert.throws(() => tecladoBorrar_(''), /clave de botón no válida/);
  assert.throws(() => tecladoBorrar_('901:si'), /clave de botón no válida/);
  assert.throws(() => tecladoBorrar_(null), /clave de botón no válida/);
  assert.throws(() => tecladoBorrar_('9'.repeat(60)), /64 bytes/);
});

test('leerBotonBorrar_ entiende si y no, y devuelve null para cualquier otra cosa', () => {
  assert.deepEqual(leerBotonBorrar_('borrar:901:si'), { clave: '901', si: true });
  assert.deepEqual(leerBotonBorrar_('borrar:901:no'), { clave: '901', si: false });
  for (const data of ['conteo:901:si', 'borrar:901:tal vez', 'borrar::si', '', null, 7]) {
    assert.equal(leerBotonBorrar_(data), null, String(data));
  }
});

test('leerBotonBorrar_ lee lo que arma tecladoBorrar_', () => {
  const [si, no] = tecladoBorrar_('901').inline_keyboard[0];
  assert.deepEqual(leerBotonBorrar_(si.callback_data), { clave: '901', si: true });
  assert.deepEqual(leerBotonBorrar_(no.callback_data), { clave: '901', si: false });
});

// --- Pregunta de borrar abierta en _ESTADO ---

test('filaBorrar_ guarda la pregunta de borrar con la clave del REGISTRO', () => {
  const fila = filaBorrar_({ creado: AHORA, clave: '901' });
  assert.equal(fila[col('TIPO')], TIPO_ESTADO_BORRAR);
  assert.equal(fila[col('TIPO')], 'BORRAR');
  assert.equal(fila[col('CLAVE')], '901');
  assert.equal(fila[col('ID FILAS')], '');
  assert.equal(fila[col('ESTADO')], 'ABIERTA');
  assert.deepEqual(JSON.parse(fila[col('DATOS')]), { clave: '901' });
});

test('buscarBorrar_ encuentra la pregunta de borrar y dice si sigue abierta', () => {
  const abierta = filaBorrar_({ creado: AHORA, clave: '901' });
  assert.deepEqual(buscarBorrar_([abierta], '901'), { fila: 2, abierto: true, clave: '901' });
  assert.equal(buscarBorrar_([abierta], 901).abierto, true);
  const cerrada = filaBorrar_({ creado: AHORA, clave: '902' });
  cerrada[col('ESTADO')] = 'CERRADA';
  assert.equal(buscarBorrar_([abierta, cerrada], '902').abierto, false);
  assert.equal(buscarBorrar_([abierta], '903'), null);
});

test('los textos de borrar son los aprobados', () => {
  assert.equal(TEXTO_REGISTRO_NO_ESTA, 'No encontré ese registro; puede que ya lo hayan borrado.');
  assert.equal(TEXTO_BORRADO, 'Listo, lo borré de tu reporte.');
  assert.equal(TEXTO_NO_BORRADO, 'Listo, lo dejé como estaba.');
});

test('registrosAbiertos_ aguanta un REGISTRO viejo sin idMensaje ni resumen', () => {
  const fila = registro();
  fila[col('DATOS')] = JSON.stringify({ pestana: 'Septiembre 2026', datos: DATOS_GEMINI });
  const abierto = registrosAbiertos_([fila])[0];
  assert.equal(abierto.idMensaje, 901);
  assert.deepEqual(abierto.resumen, {});
});

test('fusionarCorreccion_ no cambia nada con un campo ausente o indefinido', () => {
  assert.deepEqual(fusionarCorreccion_(DATOS_GEMINI, {}), DATOS_GEMINI);
  assert.deepEqual(fusionarCorreccion_(DATOS_GEMINI, { proveedor: undefined, clase: '' }), DATOS_GEMINI);
});

test('hayCambio_ dice si la corrección cambió algo de la entrada', () => {
  assert.equal(hayCambio_(DATOS_GEMINI, fusionarCorreccion_(DATOS_GEMINI, {})), false);
  assert.equal(hayCambio_(DATOS_GEMINI, fusionarCorreccion_(DATOS_GEMINI, { total: 30 })), true);
});

test('buscarBorrar_ se queda con la petición más nueva si el usuario pidió borrar dos veces', () => {
  const vieja = filaBorrar_({ creado: AHORA, clave: '901' });
  vieja[col('ESTADO')] = 'CERRADA';
  const nueva = filaBorrar_({ creado: AHORA, clave: '901' });
  assert.deepEqual(buscarBorrar_([vieja, nueva], '901'), { fila: 3, abierto: true, clave: '901' });
});
