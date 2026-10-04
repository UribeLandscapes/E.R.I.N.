/**
 * Botones Sí/No del conteo, lógica pura. El estado del conteo vive en _ESTADO con
 * TIPO CONTEO y CLAVE = id del mensaje del usuario. callback_data mide 1-64 bytes.
 * Usa COLUMNAS_ESTADO de Hoja.js; PREGUNTA_ABIERTA y leerDatosEstado_ de
 * Escritura.js; esMonto_ y confirmarAjuste_ de Texto.js.
 */
const TIPO_ESTADO_CONTEO = 'CONTEO';
const MAX_BYTES_CALLBACK = 64;
const TEXTO_CONTEO_ATENDIDO = 'Esto ya fue indicado, si quieres corregir algo, ve al archivo de Excel.';
const TEXTO_SIN_AJUSTE = 'Listo, no registro ningún ajuste.';
const PREFIJO_CONTEO = 'conteo';
const CLAVE_BOTON = /^[0-9A-Za-z-]+$/;
const DATA_CONTEO = /^conteo:([0-9A-Za-z-]+):(si|no)$/;

/** Teclado inline con Sí y No para el conteo de la clave dada (id del mensaje del usuario). */
function tecladoConteo_(clave) {
  const texto = typeof clave === 'number' || typeof clave === 'string' ? String(clave) : '';
  if (!CLAVE_BOTON.test(texto)) throw new Error(`clave de botón no válida: ${clave}`);
  const data = (respuesta) => `${PREFIJO_CONTEO}:${texto}:${respuesta}`;
  // Solo ASCII: cada carácter es un byte.
  if (data('si').length > MAX_BYTES_CALLBACK) {
    throw new Error(`callback_data pasa de ${MAX_BYTES_CALLBACK} bytes`);
  }
  return {
    inline_keyboard: [[
      { text: 'Sí', callback_data: data('si') },
      { text: 'No', callback_data: data('no') },
    ]],
  };
}

/** callback_data de un botón de conteo → { clave, si }; cualquier otra cosa → null. */
function leerBotonConteo_(data) {
  const partes = typeof data === 'string' ? data.match(DATA_CONTEO) : null;
  return partes ? { clave: partes[1], si: partes[2] === 'si' } : null;
}

/** Fila de _ESTADO para un conteo abierto, en el orden de COLUMNAS_ESTADO. */
function filaConteo_({ creado, idMensaje, contado, saldo }) {
  const fila = {
    CREADO: creado,
    TIPO: TIPO_ESTADO_CONTEO,
    CLAVE: String(idMensaje),
    'ID FILAS': '',
    DATOS: JSON.stringify({ idMensaje, contado, saldo }),
    ESTADO: PREGUNTA_ABIERTA,
  };
  return COLUMNAS_ESTADO.map((c) => fila[c]);
}

/**
 * Conteo de _ESTADO (filas sin encabezado) con esa clave: { fila, abierto, idMensaje, contado,
 * saldo }, donde `fila` es el número de fila en la hoja. null si no está o sus DATOS no sirven.
 */
function buscarConteo_(filasEstado, clave) {
  const col = (nombre) => COLUMNAS_ESTADO.indexOf(nombre);
  const i = filasEstado.findIndex((f) => f[col('TIPO')] === TIPO_ESTADO_CONTEO
    && String(f[col('CLAVE')]) === String(clave));
  if (i < 0) return null;
  const datos = leerDatosEstado_(filasEstado[i][col('DATOS')]);
  if (!datos || !esMonto_(datos.contado) || !esMonto_(datos.saldo)) return null;
  return {
    fila: i + 2,
    abierto: filasEstado[i][col('ESTADO')] === PREGUNTA_ABIERTA,
    idMensaje: datos.idMensaje,
    contado: datos.contado,
    saldo: datos.saldo,
  };
}

/**
 * Qué hacer cuando el usuario toca Sí o No: { filas, estado ('CERRADA' | 'ABIERTA' | null = no tocar),
 * saldo, respuesta, aviso (texto del botón), teclado (true = volver a preguntar con botones) }.
 * El AJUSTE lleva la fecha en que el usuario toca Sí y el id del mensaje del conteo.
 */
function planBotonConteo_(conteo, si, saldoAhora, ctx) {
  if (!conteo || !conteo.abierto) {
    return { filas: [], estado: null, saldo: null, respuesta: '', aviso: TEXTO_CONTEO_ATENDIDO, teclado: false };
  }
  if (!si) {
    return { filas: [], estado: 'CERRADA', saldo: conteo.saldo, respuesta: TEXTO_SIN_AJUSTE, aviso: '', teclado: false };
  }
  const ajuste = confirmarAjuste_(conteo.contado, conteo.saldo, saldoAhora, { ...ctx, idMensaje: conteo.idMensaje });
  return {
    filas: ajuste.filas,
    estado: ajuste.preguntarDeNuevo ? PREGUNTA_ABIERTA : 'CERRADA',
    saldo: ajuste.saldo,
    respuesta: ajuste.respuesta,
    aviso: '',
    teclado: ajuste.preguntarDeNuevo,
  };
}

if (typeof module !== 'undefined') {
  module.exports = {
    TIPO_ESTADO_CONTEO, MAX_BYTES_CALLBACK, TEXTO_CONTEO_ATENDIDO, TEXTO_SIN_AJUSTE, CLAVE_BOTON,
    tecladoConteo_, leerBotonConteo_, filaConteo_, buscarConteo_, planBotonConteo_,
  };
}
