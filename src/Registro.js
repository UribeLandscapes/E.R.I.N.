/**
 * Entradas que el bot registró y se pueden corregir o borrar, lógica pura.
 * Cada confirmación deja una fila REGISTRO en `_ESTADO` con CLAVE = message_id de ese mensaje del
 * bot; con eso una corrección sabe qué filas reescribir. El borrado pide confirmación con botones
 * y guarda su propia fila BORRAR (así un botón ya tocado no borra dos veces).
 * callback_data mide 1-64 bytes; CLAVE_BOTON y MAX_BYTES_CALLBACK son de Botones.js.
 * Usa COLUMNAS_ESTADO de Hoja.js; PREGUNTA_ABIERTA, leerDatosEstado_ y comoFecha_ de Escritura.js;
 * esMonto_ de Texto.js; resumenEntrada_ de Confirmacion.js.
 */
const TIPO_ESTADO_REGISTRO = 'REGISTRO';
const TIPO_ESTADO_BORRAR = 'BORRAR';
const PREFIJO_BORRAR = 'borrar';
const DATA_BORRAR = /^borrar:([0-9A-Za-z-]+):(si|no)$/;
const TEXTO_REGISTRO_NO_ESTA = 'No encontré ese registro; puede que ya lo hayan borrado.';
const TEXTO_BORRADO = 'Listo, lo borré de tu reporte.';
const TEXTO_NO_BORRADO = 'Listo, lo dejé como estaba.';
// Lo que Gemini marca como "sin cambio" en una corrección.
const SIN_CAMBIO = Object.freeze({ forma_pago: 'DESCONOCIDA', clase: 'PENDIENTE' });
// Intenciones que apuntan a una entrada ya registrada.
const INTENCIONES_CORRECCION = Object.freeze(['CORREGIR', 'BORRAR']);
// Responder a una confirmación con esto no es corregirla: se atiende por su intención.
const INTENCIONES_NO_CORRECCION = Object.freeze(['CONTEO', 'SALDO_INICIAL', 'AYUDA']);

/** Fila de _ESTADO para el REGISTRO de una confirmación, en el orden de COLUMNAS_ESTADO. */
function filaRegistro_({ creado, clave, filas, pestana, datos, idFactura, fechaMensaje, idMensaje }) {
  const guardado = {
    pestana, datos, idFactura, fechaMensaje, idMensaje, resumen: resumenEntrada_(filas),
  };
  const fila = {
    CREADO: creado,
    TIPO: TIPO_ESTADO_REGISTRO,
    CLAVE: String(clave),
    'ID FILAS': filas.map((f) => f['ID FILA']).join(','),
    DATOS: JSON.stringify(guardado),
    ESTADO: PREGUNTA_ABIERTA,
  };
  return COLUMNAS_ESTADO.map((c) => fila[c]);
}

/**
 * REGISTRO ABIERTOS de _ESTADO (filas sin encabezado), en el orden de la hoja: { fila, creado,
 * clave, idFilas, pestana, datos, idFactura, fechaMensaje, idMensaje, resumen }.
 */
function registrosAbiertos_(filasEstado) {
  const col = (nombre) => COLUMNAS_ESTADO.indexOf(nombre);
  const abiertos = [];
  filasEstado.forEach((fila, i) => {
    if (fila[col('TIPO')] !== TIPO_ESTADO_REGISTRO || fila[col('ESTADO')] !== PREGUNTA_ABIERTA) return;
    const guardado = leerDatosEstado_(fila[col('DATOS')]);
    if (!guardado || !guardado.datos) return;
    const clave = String(fila[col('CLAVE')]);
    const ids = String(fila[col('ID FILAS')] || '');
    abiertos.push({
      ...guardado,
      fila: i + 2,
      creado: fila[col('CREADO')],
      clave,
      idFilas: ids ? ids.split(',') : [],
      idMensaje: guardado.idMensaje || Number(clave),
      resumen: guardado.resumen || {},
    });
  });
  return abiertos;
}

const buscarRegistro_ = (abiertos, clave) => abiertos.find((r) => r.clave === String(clave)) || null;

/** La última entrada que el bot registró; a igual hora, la de más abajo. */
function ultimoRegistro_(abiertos) {
  return abiertos.reduce((ultimo, registro) => (!ultimo
    || comoFecha_(registro.creado).getTime() >= comoFecha_(ultimo.creado).getTime()
    ? registro : ultimo), null);
}

/** true si Gemini llenó ese campo de la corrección (null, DESCONOCIDA y PENDIENTE = sin cambio). */
const cambia_ = (cambios, campo) => campo in cambios && cambios[campo] !== null
  && cambios[campo] !== undefined && cambios[campo] !== '' && cambios[campo] !== SIN_CAMBIO[campo];

/**
 * Datos de la entrada corregida: los guardados más lo que la corrección cambia.
 * La intención sigue siendo la de la entrada (un gasto sigue siendo gasto) y unas líneas nuevas
 * reemplazan las viejas. Si la corrección solo trae un total nuevo y la entrada tenía una sola
 * línea guardada, esa línea se ajusta a ese total (defecto E1); con dos o más líneas se dejan
 * como están, para que la pregunta de descuadre existente las resuelva.
 */
function fusionarCorreccion_(guardados, cambios) {
  const fusion = { ...guardados };
  for (const campo of ['proveedor', 'fecha', 'moneda', 'forma_pago', 'clase', 'casa', 'comentario']) {
    if (cambia_(cambios, campo)) fusion[campo] = cambios[campo];
  }
  if (esMonto_(cambios.total)) fusion.total = cambios.total;
  const lineasViejas = guardados.lineas || [];
  if ((cambios.lineas || []).length) {
    fusion.lineas = cambios.lineas;
  } else if (esMonto_(cambios.total) && lineasViejas.length === 1) {
    fusion.lineas = [{ ...lineasViejas[0], monto: cambios.total }];
  }
  return fusion;
}

/**
 * Datos guardados de una entrada tras contestar una pregunta: las celdas que la respuesta escribió
 * (`porFila` = { idFila: { columna: valor } }) se pasan a los campos de la extracción y se funden como
 * una corrección. Así el REGISTRO sigue diciendo lo mismo que la hoja y una corrección posterior
 * no deshace lo contestado. El total en otra moneda se guarda en esa moneda (MONTO ORIGINAL).
 */
function datosTrasRespuesta_(guardados, porFila) {
  const campos = { FECHA: 'fecha', PROVEEDOR: 'proveedor', 'CLASE DE GASTO': 'clase' };
  const cambios = {};
  for (const cambio of Object.values(porFila || {})) {
    for (const [columna, campo] of Object.entries(campos)) {
      if (!(campo in cambios) && cambio[columna] !== undefined) cambios[campo] = cambio[columna];
    }
    const total = cambio['MONTO ORIGINAL'] !== undefined ? cambio['MONTO ORIGINAL'] : cambio['GASTO (USD)'];
    if (!('total' in cambios) && esMonto_(total)) cambios.total = total;
  }
  return fusionarCorreccion_(guardados, cambios);
}

/** true si la corrección cambió algo; si no, no vale la pena reescribir la entrada. */
const hayCambio_ = (guardados, fusion) => JSON.stringify(guardados) !== JSON.stringify(fusion);

/** Teclado inline para confirmar el borrado (texto (e)). */
function tecladoBorrar_(clave) {
  const texto = typeof clave === 'number' || typeof clave === 'string' ? String(clave) : '';
  if (!CLAVE_BOTON.test(texto)) throw new Error(`clave de botón no válida: ${clave}`);
  const data = (opcion) => `${PREFIJO_BORRAR}:${texto}:${opcion}`;
  if (data('si').length > MAX_BYTES_CALLBACK || data('no').length > MAX_BYTES_CALLBACK) {
    throw new Error(`callback_data pasa de ${MAX_BYTES_CALLBACK} bytes`);
  }
  return {
    inline_keyboard: [[
      { text: 'Sí, bórralo', callback_data: data('si') },
      { text: 'No, déjalo', callback_data: data('no') },
    ]],
  };
}

/** callback_data de un botón de borrar → { clave, si }; cualquier otra cosa → null. */
function leerBotonBorrar_(data) {
  const partes = typeof data === 'string' ? data.match(DATA_BORRAR) : null;
  return partes ? { clave: partes[1], si: partes[2] === 'si' } : null;
}

/** Fila de _ESTADO para un borrado esperando respuesta; CLAVE = la del REGISTRO. */
function filaBorrar_({ creado, clave }) {
  const fila = {
    CREADO: creado,
    TIPO: TIPO_ESTADO_BORRAR,
    CLAVE: String(clave),
    'ID FILAS': '',
    DATOS: JSON.stringify({ clave: String(clave) }),
    ESTADO: PREGUNTA_ABIERTA,
  };
  return COLUMNAS_ESTADO.map((c) => fila[c]);
}

/**
 * Borrado esperando respuesta con esa clave: { fila, abierto, clave }; null si no está. Si el usuario
 * pidió borrar la misma entrada más de una vez, vale la petición más nueva (la de más abajo).
 */
function buscarBorrar_(filasEstado, clave) {
  const col = (nombre) => COLUMNAS_ESTADO.indexOf(nombre);
  const i = filasEstado.reduce((ultima, f, n) => (f[col('TIPO')] === TIPO_ESTADO_BORRAR
    && String(f[col('CLAVE')]) === String(clave) ? n : ultima), -1);
  if (i < 0) return null;
  return {
    fila: i + 2,
    abierto: filasEstado[i][col('ESTADO')] === PREGUNTA_ABIERTA,
    clave: String(filasEstado[i][col('CLAVE')]),
  };
}

if (typeof module !== 'undefined') {
  module.exports = {
    TIPO_ESTADO_REGISTRO, TIPO_ESTADO_BORRAR, PREFIJO_BORRAR, INTENCIONES_CORRECCION,
    INTENCIONES_NO_CORRECCION, TEXTO_REGISTRO_NO_ESTA, TEXTO_BORRADO, TEXTO_NO_BORRADO,
    filaRegistro_, registrosAbiertos_, buscarRegistro_, ultimoRegistro_, fusionarCorreccion_, datosTrasRespuesta_, hayCambio_,
    tecladoBorrar_, leerBotonBorrar_, filaBorrar_, buscarBorrar_,
  };
}
