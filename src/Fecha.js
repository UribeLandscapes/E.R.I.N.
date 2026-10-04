/**
 * Botones de "fecha de otro mes" y de "fecha no legible en la foto" (detalle
 * confirmado), lógica pura. pregunta con cuál fecha registrar cuando la del
 * recibo cae en un mes distinto al día en que el usuario lo mandó (mesDistinto_ de Reglas.js);
 * pregunta si la fecha del día en que el usuario mandó la foto (ya escrita en la fila) está bien,
 * cuando la foto no trajo una fecha legible. Los dos viven en _ESTADO con su propio TIPO y
 * CLAVE = id del mensaje del usuario (igual que el conteo), y usan prefijos distintos de
 * callback_data para no chocar entre sí. callback_data mide 1-64 bytes; CLAVE_BOTON y
 * MAX_BYTES_CALLBACK son de Botones.js. Usa COLUMNAS_ESTADO de Hoja.js; PREGUNTA_ABIERTA y
 * leerDatosEstado_ de Escritura.js; fechaConfirmacion_ de Confirmacion.js (AAAA-MM-DD → DD/MM/AAAA);
 * leerFecha_ de Reglas.js (para no aceptar una fecha escrita que no existe en el calendario);
 * comoFecha_ de Escritura.js (para comparar cuándo se tocó "Es otra fecha").
 */
const TIPO_ESTADO_FECHA = 'FECHA';
const PREFIJO_FECHA = 'fecha';
const DATA_FECHA = /^fecha:([0-9A-Za-z-]+):(recibo|envio)$/;
// TIPO y prefijo propios (nunca 'fecha'/'FECHA') para no leer ni contestar por error una
// pregunta, o viceversa.
const TIPO_ESTADO_FECHA_FOTO = 'FECHA-FOTO';
const PREFIJO_FECHA_FOTO = 'fechafoto';
const DATA_FECHA_FOTO = /^fechafoto:([0-9A-Za-z-]+):(si|otra)$/;
const TEXTO_OTRA_FECHA = 'Escríbeme la fecha del recibo (por ejemplo 25/09).';
// El usuario escribió la fecha pero el gasto de esa foto ya no existe (lo borró o lo rehizo otra
// corrección): la pregunta se cierra y no se llama a Gemini.
const TEXTO_FECHA_SIN_GASTO = 'Ya no encontré el gasto de esa foto para cambiarle la fecha; '
  + 'puede que ya lo hayan borrado.';
// Fecha escrita a mano: solo DD/MM o DD/MM/AAAA, el mensaje completo y nada más (formato
// fijo, sin Gemini).
const FORMA_FECHA_ESCRITA = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/;

/** Teclado inline para elegir con qué fecha registrar el gasto. */
function tecladoFecha_(clave, fechaRecibo, fechaEnvio) {
  const texto = typeof clave === 'number' || typeof clave === 'string' ? String(clave) : '';
  if (!CLAVE_BOTON.test(texto)) throw new Error(`clave de botón no válida: ${clave}`);
  const data = (opcion) => `${PREFIJO_FECHA}:${texto}:${opcion}`;
  if (data('recibo').length > MAX_BYTES_CALLBACK || data('envio').length > MAX_BYTES_CALLBACK) {
    throw new Error(`callback_data pasa de ${MAX_BYTES_CALLBACK} bytes`);
  }
  return {
    inline_keyboard: [[
      { text: `Fecha del recibo (${fechaRecibo})`, callback_data: data('recibo') },
      { text: `Día que lo mandé (${fechaEnvio})`, callback_data: data('envio') },
    ]],
  };
}

/** callback_data de un botón de fecha → { clave, recibo }; cualquier otra cosa → null. */
function leerBotonFecha_(data) {
  const partes = typeof data === 'string' ? data.match(DATA_FECHA) : null;
  return partes ? { clave: partes[1], recibo: partes[2] === 'recibo' } : null;
}

/** Fila de _ESTADO para una pregunta de fecha abierta, en el orden de COLUMNAS_ESTADO. */
function filaFecha_({ creado, idMensaje, datos, fechaMensaje }) {
  const fila = {
    CREADO: creado,
    TIPO: TIPO_ESTADO_FECHA,
    CLAVE: String(idMensaje),
    'ID FILAS': '',
    DATOS: JSON.stringify({ datos, fechaMensaje, idMensaje }),
    ESTADO: PREGUNTA_ABIERTA,
  };
  return COLUMNAS_ESTADO.map((c) => fila[c]);
}

/**
 * Pregunta de fecha de _ESTADO (filas sin encabezado) con esa clave: { fila, abierto, datos,
 * fechaMensaje, idMensaje }, donde `fila` es el número de fila en la hoja. null si no está o sus
 * DATOS no sirven.
 */
function buscarFecha_(filasEstado, clave) {
  const col = (nombre) => COLUMNAS_ESTADO.indexOf(nombre);
  const i = filasEstado.findIndex((f) => f[col('TIPO')] === TIPO_ESTADO_FECHA
    && String(f[col('CLAVE')]) === String(clave));
  if (i < 0) return null;
  const guardado = leerDatosEstado_(filasEstado[i][col('DATOS')]);
  if (!guardado || !guardado.datos || typeof guardado.fechaMensaje !== 'string') return null;
  return {
    fila: i + 2,
    abierto: filasEstado[i][col('ESTADO')] === PREGUNTA_ABIERTA,
    datos: guardado.datos,
    fechaMensaje: guardado.fechaMensaje,
    idMensaje: guardado.idMensaje,
  };
}

/**
 * Mensaje aparte (del detalle confirmado): la fila ya se escribió con la fecha del
 * día en que el usuario mandó la foto; esto solo le avisa y le pregunta si está bien. `fechaEnvio`
 * llega en AAAA-MM-DD; se muestra en DD/MM/AAAA (fechaConfirmacion_ de Confirmacion.js).
 */
const textoFechaIlegible_ = (fechaEnvio) => 'No pude leer la fecha en la foto. La anoté con el '
  + `día que la mandaste (${fechaConfirmacion_(fechaEnvio)}). ¿Está bien?`;

/** Teclado inline: aceptar la fecha de envío ya escrita, o corregirla escribiendo otra. */
function tecladoFechaFoto_(clave) {
  const texto = typeof clave === 'number' || typeof clave === 'string' ? String(clave) : '';
  if (!CLAVE_BOTON.test(texto)) throw new Error(`clave de botón no válida: ${clave}`);
  const data = (opcion) => `${PREFIJO_FECHA_FOTO}:${texto}:${opcion}`;
  if (data('si').length > MAX_BYTES_CALLBACK || data('otra').length > MAX_BYTES_CALLBACK) {
    throw new Error(`callback_data pasa de ${MAX_BYTES_CALLBACK} bytes`);
  }
  return {
    inline_keyboard: [[
      { text: 'Sí, esa fecha', callback_data: data('si') },
      { text: 'Es otra fecha', callback_data: data('otra') },
    ]],
  };
}

/** callback_data de un botón → { clave, otra }; cualquier otra cosa → null. */
function leerBotonFechaFoto_(data) {
  const partes = typeof data === 'string' ? data.match(DATA_FECHA_FOTO) : null;
  return partes ? { clave: partes[1], otra: partes[2] === 'otra' } : null;
}

/**
 * Fila de _ESTADO para una pregunta abierta, en el orden de COLUMNAS_ESTADO. A diferencia
 * de filaFecha_, las filas del gasto ya se escribieron (del detalle
 * confirmado): 'ID FILAS' guarda sus ID FILA, para poder ubicarlas si el usuario corrige la fecha.
 */
function filaFechaFoto_({ creado, idMensaje, idPregunta, idFilas, fechaMensaje }) {
  const fila = {
    CREADO: creado,
    TIPO: TIPO_ESTADO_FECHA_FOTO,
    CLAVE: String(idMensaje),
    'ID FILAS': (idFilas || []).join(','),
    DATOS: datosFechaFoto_({ fechaMensaje, idMensaje, idPregunta }),
    ESTADO: PREGUNTA_ABIERTA,
  };
  return COLUMNAS_ESTADO.map((c) => fila[c]);
}

/**
 * DATOS de una pregunta. Cada campo se guarda solo cuando existe, así los DATOS viejos se
 * siguen leyendo igual: `idPregunta` (mensaje del bot con los botones) e `idOtra` (mensaje que
 * pide la fecha) sirven para saber a qué pregunta contesta un "Responder" del usuario; `tocado` es
 * cuándo tocó "Es otra fecha" (con dos fotos esperando gana la más reciente); `esperando` dice
 * que el próximo mensaje suyo con una fecha escrita corrige este gasto. La pregunta sigue ABIERTA
 * mientras espera, así sigue abierta hasta que conteste.
 */
const datosFechaFoto_ = ({ fechaMensaje, idMensaje, idPregunta, idOtra, tocado, esperando }) => JSON.stringify({
  fechaMensaje,
  idMensaje,
  ...(idPregunta ? { idPregunta } : {}),
  ...(idOtra ? { idOtra } : {}),
  ...(tocado ? { tocado } : {}),
  ...(esperando ? { esperando: true } : {}),
});

/**
 * Una fila FECHA-FOTO ya ubicada (índice sin encabezado) → { fila, abierto, esperando, idFilas,
 * fechaMensaje, idMensaje, idPregunta, idOtra, tocado }; null si sus DATOS no sirven.
 */
function leerFilaFechaFoto_(fila, i) {
  const col = (nombre) => COLUMNAS_ESTADO.indexOf(nombre);
  const guardado = leerDatosEstado_(fila[col('DATOS')]);
  if (!guardado || typeof guardado.fechaMensaje !== 'string') return null;
  return {
    fila: i + 2,
    abierto: fila[col('ESTADO')] === PREGUNTA_ABIERTA,
    esperando: guardado.esperando === true,
    idFilas: String(fila[col('ID FILAS')] || '').split(',').filter(Boolean),
    fechaMensaje: guardado.fechaMensaje,
    idMensaje: guardado.idMensaje,
    idPregunta: guardado.idPregunta || null,
    idOtra: guardado.idOtra || null,
    tocado: guardado.tocado || null,
  };
}

/**
 * Pregunta de _ESTADO (filas sin encabezado) con esa clave, como la devuelve
 * leerFilaFechaFoto_. null si no está o sus DATOS no sirven.
 */
function buscarFechaFoto_(filasEstado, clave) {
  const col = (nombre) => COLUMNAS_ESTADO.indexOf(nombre);
  const i = filasEstado.findIndex((f) => f[col('TIPO')] === TIPO_ESTADO_FECHA_FOTO
    && String(f[col('CLAVE')]) === String(clave));
  return i < 0 ? null : leerFilaFechaFoto_(filasEstado[i], i);
}

/**
 * Todas las preguntas abiertas que esperan una fecha escrita, en el orden de _ESTADO. Con
 * esto, un mensaje que es SOLO una fecha se atiende sin Gemini.
 */
function fechasFotoEsperando_(filasEstado) {
  const col = (nombre) => COLUMNAS_ESTADO.indexOf(nombre);
  return filasEstado
    .map((fila, i) => (fila[col('TIPO')] === TIPO_ESTADO_FECHA_FOTO ? leerFilaFechaFoto_(fila, i) : null))
    .filter((leida) => leida && leida.abierto && leida.esperando);
}

/** Cuándo se tocó "Es otra fecha"; las preguntas viejas (sin ese dato) van al final de la cola. */
const tocadaEn_ = (pregunta) => (pregunta.tocado ? comoFecha_(pregunta.tocado).getTime() : 0);

/**
 * A cuál de las preguntas que esperan va esta fecha escrita: si el usuario usó "Responder" sobre la
 * pregunta, sobre el mensaje que le pidió la fecha, sobre la confirmación (su foto llega aquí como
 * `citados`) o sobre la foto misma, va a esa; si no, a la que tocó "Es otra fecha" más
 * recientemente. null si no hay ninguna esperando.
 */
function elegirFechaFoto_(esperando, citados) {
  const ids = (citados || []).filter((id) => id !== null && id !== undefined).map(String);
  const citada = esperando.find((p) => [p.idPregunta, p.idOtra, p.idMensaje]
    .some((id) => id !== null && id !== undefined && ids.includes(String(id))));
  if (citada) return citada;
  return esperando.reduce((mejor, p) => (!mejor || tocadaEn_(p) >= tocadaEn_(mejor) ? p : mejor), null) || null;
}

/** true si el mensaje entero tiene la forma de una fecha escrita (sin mirar el calendario). */
const pareceFechaEscrita_ = (texto) => FORMA_FECHA_ESCRITA
  .test(String(texto === null || texto === undefined ? '' : texto).trim());

/**
 * Texto que es SOLO una fecha DD/MM o DD/MM/AAAA → "AAAA-MM-DD" (el formato de todo el proyecto,
 * leerFecha_ de Reglas.js); cualquier otra cosa, o una fecha que no existe en el calendario →
 * null. Sin año escrito se usa `anio` (el del mensaje del usuario).
 */
function leerFechaEscrita_(texto, anio) {
  const partes = FORMA_FECHA_ESCRITA.exec(String(texto === null || texto === undefined ? '' : texto).trim());
  if (!partes) return null;
  const anioFinal = partes[3] ? Number(partes[3]) : Number(anio);
  if (!Number.isInteger(anioFinal) || anioFinal < 1000 || anioFinal > 9999) return null;
  const dos = (n) => String(Number(n)).padStart(2, '0');
  const fecha = `${anioFinal}-${dos(partes[2])}-${dos(partes[1])}`;
  try {
    leerFecha_(fecha);
  } catch (error) {
    return null;
  }
  return fecha;
}

if (typeof module !== 'undefined') {
  module.exports = {
    TIPO_ESTADO_FECHA, PREFIJO_FECHA, tecladoFecha_, leerBotonFecha_, filaFecha_, buscarFecha_,
    TIPO_ESTADO_FECHA_FOTO, PREFIJO_FECHA_FOTO, TEXTO_OTRA_FECHA, TEXTO_FECHA_SIN_GASTO,
    textoFechaIlegible_, tecladoFechaFoto_, leerBotonFechaFoto_, filaFechaFoto_, buscarFechaFoto_,
    datosFechaFoto_, fechasFotoEsperando_, elegirFechaFoto_,
    pareceFechaEscrita_, leerFechaEscrita_,
  };
}
