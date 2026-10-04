/**
 * (respaldo sin Gemini), lógica pura. Cuando Gemini falla con una foto ya
 * archivada, la entrada queda en _ESTADO con TIPO POR-PROCESAR y el bot le propone al usuario el total
 * que sacó el OCR de Drive; con el total confirmado se escribe UNA fila con
 * PROVEEDOR / FORMA DE PAGO / CLASE en PENDIENTE y sin más preguntas. Aquí no se llama a ningún
 * servicio de Google: el OCR y el cableado son de otras capas.
 * Usa COLUMNAS_ESTADO de Hoja.js y sinTildes_ de Hoja.js; PREGUNTA_ABIERTA, leerDatosEstado_ y
 * textoCelda_ de Escritura.js; MARCA_PENDIENTE, esMonto_, montoTexto_ y filasGasto_ de Texto.js;
 * CLAVE_BOTON y MAX_BYTES_CALLBACK de Botones.js (los mismos límites de callback_data).
 */
const TIPO_ESTADO_POR_PROCESAR = 'POR-PROCESAR';
// Prefijos propios de callback_data (como PREFIJO_FECHA_FOTO en Fecha.js): nunca chocan con los
// botones de conteo, de fecha ni de fecha-foto.
const PREFIJO_TOTAL_OCR = 'totalocr';
const PREFIJO_FORMA_PAGO = 'pago';
const DATA_TOTAL_OCR = /^totalocr:([0-9A-Za-z-]+):(si|no)$/;
const DATA_FORMA_PAGO = /^pago:([0-9A-Za-z-]+):(efectivo|tarjeta|transferencia|yappy)$/;
// Dos reintentos (a mano, con reintentarFotos). Al segundo reintento fallido se pasa a preguntas.
const MAX_INTENTOS_POR_PROCESAR = 2;
// Qué hace el reintento con lo que devolvió (o no) Gemini.
const ACCION_LLENAR = 'LLENAR';
const ACCION_ESPERAR = 'ESPERAR';
const ACCION_PREGUNTAR = 'PREGUNTAR';
// El total que confirmó el usuario no se sobrescribe nunca: estas columnas quedan fuera del relleno.
const COLUMNAS_TOTAL_CONFIRMADO = Object.freeze(['GASTO (USD)', 'MONTO ORIGINAL', 'TASA USADA', 'MONEDA']);
const MARCA_REVISAR_TOTAL = 'TOTAL';

// Drive solo convierte (y por lo tanto solo hace OCR de) estos tipos. HEIC y WEBP no están
// en la lista de la guía de subidas de Drive → a esas fotos se les pregunta el total directamente.
const MIME_CON_OCR = Object.freeze(['image/jpeg', 'image/png', 'image/gif', 'image/bmp', 'application/pdf']);

/** true si Drive puede sacarle texto a ese tipo de archivo. */
const ocrPosible_ = (mimeType) => MIME_CON_OCR.includes(String(mimeType || '').trim().toLowerCase());

// Una línea de TOTAL seguida de una de estas palabras es un total de impuesto, de descuento
// o un conteo de artículos, nunca el total a pagar.
const PALABRAS_NO_TOTAL = Object.freeze(['ITBMS', 'ITBM', 'IMPUESTO', 'IMPUESTOS', 'IVA', 'TAX',
  'DESCUENTO', 'DESCUENTOS', 'AHORRO', 'AHORROS', 'ARTICULO', 'ARTICULOS', 'ITEM', 'ITEMS',
  'UNIDADES', 'PIEZAS', 'CANTIDAD']);
const PALABRA_TOTAL = /\bTOTAL\b\s*:?\s*([A-Z]+)?/g;
const TOTAL_A_PAGAR = 'TOTAL A PAGAR';
// B/. y $ se quitan antes de buscar montos; los puntos de relleno ("TOTAL.....66.34") también.
const MARCAS_MONEDA_OCR = /B\s*\/\s*\.?|\$/gi;
const RELLENO_PUNTOS = /\.{2,}/g;
// Monto suelto: 1,234.56 o 66.34 o 50. Lo pegado a letras, guiones o barras (RUC, teléfonos,
// números de factura, fechas) no cuenta, y un porcentaje tampoco.
const MONTO_OCR = /(?<![\w.,\-/])(?:\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)(?![\w,%\-/])/g;
// Un entero suelto de más de estos dígitos, o con ceros al principio, es un número de factura, de
// caja o de autorización, no un monto de caja chica.
const MAX_DIGITOS_ENTERO_OCR = 4;

/** true si el número encontrado puede ser un monto de verdad y no un número de documento. */
const esMontoOcr_ = (texto) => !/^0\d/.test(texto)
  && (/[.,]/.test(texto) || texto.length <= MAX_DIGITOS_ENTERO_OCR);

const normalizarLinea_ = (linea) => sinTildes_(String(linea)).toUpperCase();

/** true si la línea (ya normalizada) dice TOTAL y no es SUBTOTAL ni un total de impuesto. */
function lineaDeTotal_(normalizada) {
  PALABRA_TOTAL.lastIndex = 0;
  let encontrada = PALABRA_TOTAL.exec(normalizada);
  while (encontrada) {
    if (!encontrada[1] || !PALABRAS_NO_TOTAL.includes(encontrada[1])) return true;
    encontrada = PALABRA_TOTAL.exec(normalizada);
  }
  return false;
}

/** Último monto de una línea de OCR, o null si no trae ninguno. */
function ultimoMontoLinea_(linea) {
  const limpia = String(linea).replace(MARCAS_MONEDA_OCR, ' ').replace(RELLENO_PUNTOS, ' ');
  const encontrados = (limpia.match(MONTO_OCR) || []).filter(esMontoOcr_);
  if (!encontrados.length) return null;
  const numero = Number(encontrados[encontrados.length - 1].replace(/,/g, ''));
  return Number.isFinite(numero) ? numero : null;
}

/**
 * Total propuesto a partir del texto del OCR de Drive: solo de una línea que diga TOTAL
 * (nunca SUBTOTAL ni "TOTAL ITBMS"), el último monto de esa línea o, si no trae, el de la
 * siguiente línea con algo escrito. Con varias líneas de TOTAL gana la de "TOTAL A PAGAR" y, si
 * no la hay, la última. Sin línea de TOTAL → null: nunca se propone "el número más grande".
 */
function totalDeOcr_(texto) {
  const lineas = String(texto === null || texto === undefined ? '' : texto).split(/\r?\n/);
  const normalizadas = lineas.map(normalizarLinea_);
  const candidatas = normalizadas
    .map((linea, i) => (lineaDeTotal_(linea) ? i : -1)).filter((i) => i >= 0);
  if (!candidatas.length) return null;
  const aPagar = candidatas.filter((i) => normalizadas[i].includes(TOTAL_A_PAGAR));
  const elegidas = aPagar.length ? aPagar : candidatas;
  const i = elegidas[elegidas.length - 1];
  const enLinea = ultimoMontoLinea_(lineas[i]);
  if (enLinea !== null) return enLinea;
  const siguiente = lineas.slice(i + 1).find((linea) => String(linea).trim() !== '');
  return siguiente === undefined ? null : ultimoMontoLinea_(siguiente);
}

/**
 * DATOS de una entrada POR-PROCESAR. Cada campo se guarda solo cuando existe, así los DATOS
 * viejos se siguen leyendo igual (mismo patrón que datosFechaFoto_ de Fecha.js). `intentos` es
 * cuántos reintentos de Gemini ya se hicieron; `totalOcr` es lo que propuso el OCR de Drive.
 */
const datosPorProcesar_ = ({ idFoto, enlace, idMensaje, idPregunta, fechaMensaje, leyenda, intentos,
  totalOcr, idProveedor, preguntado }) => JSON.stringify({
  fechaMensaje,
  idMensaje,
  intentos: Number.isInteger(intentos) ? intentos : 0,
  ...(idFoto ? { idFoto } : {}),
  ...(enlace ? { enlace } : {}),
  ...(idPregunta ? { idPregunta } : {}),
  ...(leyenda ? { leyenda } : {}),
  ...(esMonto_(totalOcr) ? { totalOcr } : {}),
  // Modo preguntas: con qué mensaje se preguntó el proveedor y qué ya se preguntó
  // (así el reintento del día siguiente no vuelve a preguntar lo mismo).
  ...(idProveedor ? { idProveedor } : {}),
  ...(Array.isArray(preguntado) && preguntado.length ? { preguntado } : {}),
});

/** Fila de _ESTADO para una foto por procesar, en el orden de COLUMNAS_ESTADO. */
function filaPorProcesar_(datos) {
  const fila = {
    CREADO: datos.creado,
    TIPO: TIPO_ESTADO_POR_PROCESAR,
    CLAVE: String(datos.idMensaje),
    'ID FILAS': '',
    DATOS: datosPorProcesar_(datos),
    ESTADO: PREGUNTA_ABIERTA,
  };
  return COLUMNAS_ESTADO.map((c) => fila[c]);
}

const columnaEstado_ = (nombre) => COLUMNAS_ESTADO.indexOf(nombre);

/**
 * Una fila POR-PROCESAR ya ubicada (índice sin encabezado) → { fila, creado, abierto, idFilas,
 * idFoto, enlace, idMensaje, idPregunta, fechaMensaje, leyenda, intentos, totalOcr }; null si sus
 * DATOS no sirven. `idFilas` con algo adentro significa que el total ya se confirmó y la fila de
 * gasto ya está escrita; la entrada sigue ABIERTA para los reintentos.
 * `idPregunta` es el mensaje con que el bot preguntó el total, para las respuestas con "Responder".
 */
function leerFilaPorProcesar_(fila, i) {
  const guardado = leerDatosEstado_(fila[columnaEstado_('DATOS')]);
  if (!guardado || typeof guardado.fechaMensaje !== 'string') return null;
  return {
    fila: i + 2,
    creado: fila[columnaEstado_('CREADO')],
    abierto: fila[columnaEstado_('ESTADO')] === PREGUNTA_ABIERTA,
    idFilas: String(fila[columnaEstado_('ID FILAS')] || '').split(',').filter(Boolean),
    idPregunta: guardado.idPregunta || null,
    idFoto: guardado.idFoto || null,
    enlace: guardado.enlace || '',
    idMensaje: guardado.idMensaje,
    fechaMensaje: guardado.fechaMensaje,
    leyenda: guardado.leyenda || '',
    intentos: Number.isInteger(guardado.intentos) ? guardado.intentos : 0,
    totalOcr: esMonto_(guardado.totalOcr) ? guardado.totalOcr : null,
    idProveedor: guardado.idProveedor || null,
    preguntado: Array.isArray(guardado.preguntado) ? guardado.preguntado : [],
  };
}

/**
 * Entrada POR-PROCESAR de _ESTADO (filas sin encabezado) con esa clave (el id del mensaje de la
 * foto), como la devuelve leerFilaPorProcesar_. null si no está o sus DATOS no sirven.
 */
function buscarPorProcesar_(filasEstado, clave) {
  const i = filasEstado.findIndex((f) => f[columnaEstado_('TIPO')] === TIPO_ESTADO_POR_PROCESAR
    && String(f[columnaEstado_('CLAVE')]) === String(clave));
  return i < 0 ? null : leerFilaPorProcesar_(filasEstado[i], i);
}

/** Todas las entradas POR-PROCESAR todavía abiertas, en el orden de _ESTADO. */
function porProcesarAbiertas_(filasEstado) {
  return filasEstado
    .map((fila, i) => (fila[columnaEstado_('TIPO')] === TIPO_ESTADO_POR_PROCESAR ? leerFilaPorProcesar_(fila, i) : null))
    .filter((leida) => leida && leida.abierto);
}

/**
 * La MISMA fila con un intento más en sus DATOS (arreglo nuevo, no se toca el original).
 * null si los DATOS no se pueden leer: quien llama deja la fila como estaba.
 */
function filaPorProcesarConIntento_(fila) {
  const leida = leerFilaPorProcesar_(fila, 0);
  if (!leida) return null;
  const datos = datosPorProcesar_({ ...leida, intentos: leida.intentos + 1 });
  return fila.map((valor, i) => (i === columnaEstado_('DATOS') ? datos : valor));
}

/**
 * Lo que necesita filasGasto_ para escribir la fila de una foto que Gemini no pudo leer:
 * el total que confirmó el usuario, el enlace de la foto y todo lo demás PENDIENTE. Sin fecha, para que
 * filasGasto_ use la del mensaje; sin líneas, para que el total sea la única línea.
 */
const datosTotalConfirmado_ = (total, guardado) => ({
  intencion: 'GASTO',
  total,
  lineas: [],
  moneda: 'USD',
  clase: MARCA_PENDIENTE,
  foto: (guardado && guardado.enlace) || '',
  ...(guardado && guardado.idFoto ? { idFoto: guardado.idFoto } : {}),
  ...(guardado && guardado.leyenda ? { comentario: guardado.leyenda } : {}),
});

/**
 * Plan de la fila de una foto con el total ya confirmado por el usuario: UNA fila de gasto por el
 * camino de siempre (filasGasto_), con la fecha del día del mensaje, el enlace de la foto y
 * PROVEEDOR / FORMA DE PAGO / CLASE DE GASTO en PENDIENTE (terracota en la hoja). Sin preguntas:
 * lo que falte lo llena el reintento de Gemini o el modo preguntas.
 */
function planTotalConfirmado_(total, guardado, ctx) {
  if (!esMonto_(total)) return { filas: [], preguntas: ['monto'], datos: null };
  const datos = datosTotalConfirmado_(total, guardado);
  const { filas } = filasGasto_(datos, ctx);
  const conPendientes = filas.map((fila) => ({ ...fila, 'FORMA DE PAGO': MARCA_PENDIENTE }));
  return { filas: conPendientes, preguntas: [], datos };
}

/**
 * Qué hacer después de un reintento de Gemini. `intentos` son los reintentos que ya se
 * habían hecho antes de este. Con Gemini respondiendo se llenan los campos PENDIENTE, y si su
 * total no es el que confirmó el usuario se marca PENDIENTE: TOTAL en vez de sobrescribirlo. Si falló y
 * ya van MAX_INTENTOS_POR_PROCESAR, se pasa a modo preguntas; si no, se espera al siguiente reintento.
 */
function decidirReintento_({ intentos, ok, totalGemini, totalConfirmado }) {
  const hechos = (Number.isInteger(intentos) ? intentos : 0) + 1;
  if (ok) {
    const difiere = esMonto_(totalGemini) && esMonto_(totalConfirmado)
      && Math.round(totalGemini * 100) !== Math.round(totalConfirmado * 100);
    return { accion: ACCION_LLENAR, marcarTotal: difiere, intentos: hechos };
  }
  return {
    accion: hechos >= MAX_INTENTOS_POR_PROCESAR ? ACCION_PREGUNTAR : ACCION_ESPERAR,
    marcarTotal: false,
    intentos: hechos,
  };
}

/**
 * Relleno del reintento: de `nuevos` ({columna: valor}) solo se escribe lo que en la hoja siga
 * diciendo PENDIENTE, y nunca el total confirmado ni su moneda. Devuelve un objeto nuevo.
 */
function llenarPendientes_(valores, nuevos) {
  const columnas = Object.keys(nuevos || {})
    .filter((c) => !COLUMNAS_TOTAL_CONFIRMADO.includes(c))
    .filter((c) => textoCelda_((valores || {})[c]) === MARCA_PENDIENTE)
    .filter((c) => nuevos[c] !== '' && nuevos[c] !== null && nuevos[c] !== undefined
      && nuevos[c] !== MARCA_PENDIENTE);
  return Object.fromEntries(columnas.map((c) => [c, nuevos[c]]));
}

/** REVISAR con una marca más (sin repetirla): "PENDIENTE: TOTAL", "PENDIENTE: FECHA, TOTAL". */
function agregarMarcaRevisar_(texto, marca) {
  const actuales = String(texto === null || texto === undefined ? '' : texto)
    .replace(/^\s*PENDIENTE:\s*/i, '').split(',').map((m) => m.trim()).filter(Boolean);
  const nombre = (m) => m.replace(/\s*\(.*$/, '').trim().toUpperCase();
  const marcas = actuales.some((m) => nombre(m) === nombre(marca)) ? actuales : [...actuales, marca];
  return marcas.length ? `PENDIENTE: ${marcas.join(', ')}` : '';
}

/** Teclado Sí/No para confirmar el total que propuso el OCR. */
function tecladoTotalOcr_(clave) {
  const texto = typeof clave === 'number' || typeof clave === 'string' ? String(clave) : '';
  if (!CLAVE_BOTON.test(texto)) throw new Error(`clave de botón no válida: ${clave}`);
  const data = (opcion) => `${PREFIJO_TOTAL_OCR}:${texto}:${opcion}`;
  if (data('si').length > MAX_BYTES_CALLBACK || data('no').length > MAX_BYTES_CALLBACK) {
    throw new Error(`callback_data pasa de ${MAX_BYTES_CALLBACK} bytes`);
  }
  return {
    inline_keyboard: [[
      { text: 'Sí', callback_data: data('si') },
      { text: 'No', callback_data: data('no') },
    ]],
  };
}

/** callback_data de un botón del total del OCR → { clave, si }; cualquier otra cosa → null. */
function leerBotonTotalOcr_(data) {
  const partes = typeof data === 'string' ? data.match(DATA_TOTAL_OCR) : null;
  return partes ? { clave: partes[1], si: partes[2] === 'si' } : null;
}

// Modo preguntas: las cuatro formas de pago que el bot ofrece con botones.
const FORMAS_PAGO_BOTON = Object.freeze([
  ['efectivo', 'EFECTIVO', 'Efectivo'],
  ['tarjeta', 'TARJETA', 'Tarjeta'],
  ['transferencia', 'TRANSFERENCIA', 'Transferencia'],
  ['yappy', 'YAPPY', 'Yappy'],
]);
const BOTONES_POR_FILA = 2;

/** Teclado de forma de pago del modo preguntas. */
function tecladoFormaPago_(clave) {
  const texto = typeof clave === 'number' || typeof clave === 'string' ? String(clave) : '';
  if (!CLAVE_BOTON.test(texto)) throw new Error(`clave de botón no válida: ${clave}`);
  const data = (opcion) => `${PREFIJO_FORMA_PAGO}:${texto}:${opcion}`;
  const botones = FORMAS_PAGO_BOTON.map(([opcion, , etiqueta]) => {
    if (data(opcion).length > MAX_BYTES_CALLBACK) {
      throw new Error(`callback_data pasa de ${MAX_BYTES_CALLBACK} bytes`);
    }
    return { text: etiqueta, callback_data: data(opcion) };
  });
  const filas = [];
  for (let i = 0; i < botones.length; i += BOTONES_POR_FILA) filas.push(botones.slice(i, i + BOTONES_POR_FILA));
  return { inline_keyboard: filas };
}

/** callback_data de un botón de forma de pago → { clave, forma }; cualquier otra cosa → null. */
function leerBotonFormaPago_(data) {
  const partes = typeof data === 'string' ? data.match(DATA_FORMA_PAGO) : null;
  if (!partes) return null;
  const encontrada = FORMAS_PAGO_BOTON.find(([opcion]) => opcion === partes[2]);
  return { clave: partes[1], forma: encontrada[1] };
}

// El usuario contesta el total escribiéndolo, sin Gemini. El mensaje tiene que ser SOLO el
// monto (con B/. o $ opcional, antes o después); cualquier otra cosa sigue el camino normal.
const FORMA_MONTO_ESCRITO = /^(?:B\s*\/\s*\.?|\$)?\s*(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*(?:B\s*\/\s*\.?|\$|USD|usd)?$/;

/**
 * Texto que es SOLO un monto → el número; cualquier otra cosa → null. Misma regla F que el OCR:
 * un entero de más de 4 dígitos o con cero al principio es un número de documento, no un monto.
 */
function leerMontoEscrito_(texto) {
  const partes = FORMA_MONTO_ESCRITO.exec(typeof texto === 'string' ? texto.trim() : '');
  if (!partes || !esMontoOcr_(partes[1])) return null;
  const numero = Number(partes[1].replace(/,(\d{3})/g, '$1').replace(',', '.'));
  return Number.isFinite(numero) && numero > 0 ? numero : null;
}

// Textos del usuario. El bot nunca dice que perdió la foto: ya está archivada.
const TEXTO_FOTO_GUARDADA = 'Guardé tu foto, pero ahora no la puedo leer.';
/** Propuesta del total que sacó el OCR de Drive, para contestar con los botones Sí/No. */
const textoTotalOcr_ = (total) => `${TEXTO_FOTO_GUARDADA} ¿El total es ${montoTexto_(total)}?`;
// Sin total del OCR, o foto HEIC/WEBP que Drive no convierte: se pregunta directo.
const TEXTO_PEDIR_TOTAL = `${TEXTO_FOTO_GUARDADA} ¿Cuánto es el total?`;
// Modo preguntas: una pregunta a la vez, con el mismo tono de textoPreguntas_.
const TEXTO_PREGUNTA_PROVEEDOR = '¿A quién le pagaste en esa foto?';
const TEXTO_PREGUNTA_FORMA_PAGO = '¿Cómo lo pagaste?';
// El usuario tocó "No" en la propuesta del OCR (texto propuesto, falta el visto del administrador).
const TEXTO_TOTAL_NO = 'Entonces, ¿cuánto es el total?';
// Nombre de la foto cuando se clasifica a su mes con el PROVEEDOR todavía en PENDIENTE: sin esto
// el archivo se llamaría "2026.09.27 - PENDIENTE.jpg" (texto propuesto, falta el visto).
const DESCRIPCION_FOTO_SIN_LEER = 'Factura sin leer';

if (typeof module !== 'undefined') {
  module.exports = {
    TIPO_ESTADO_POR_PROCESAR, PREFIJO_TOTAL_OCR, PREFIJO_FORMA_PAGO, MAX_INTENTOS_POR_PROCESAR,
    ACCION_LLENAR, ACCION_ESPERAR, ACCION_PREGUNTAR, MARCA_REVISAR_TOTAL, MIME_CON_OCR, ocrPosible_,
    totalDeOcr_, datosPorProcesar_, filaPorProcesar_, leerFilaPorProcesar_, buscarPorProcesar_,
    porProcesarAbiertas_, filaPorProcesarConIntento_, datosTotalConfirmado_, planTotalConfirmado_,
    decidirReintento_, llenarPendientes_, agregarMarcaRevisar_, tecladoTotalOcr_, leerBotonTotalOcr_,
    FORMAS_PAGO_BOTON, tecladoFormaPago_, leerBotonFormaPago_, textoTotalOcr_, TEXTO_PEDIR_TOTAL,
    TEXTO_FOTO_GUARDADA, TEXTO_PREGUNTA_PROVEEDOR, TEXTO_PREGUNTA_FORMA_PAGO, TEXTO_TOTAL_NO,
    DESCRIPCION_FOTO_SIN_LEER, leerMontoEscrito_,
  };
}
