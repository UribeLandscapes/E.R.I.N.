/**
 * Aviso de factura duplicada, lógica pura. Cuando el usuario manda por
 * foto una factura que ya está anotada, el bot le avisa ANTES de escribir y ella decide. Misma
 * factura = mismo proveedor (normalizado) + misma FECHA + mismo GASTO (USD) al centavo (D1, S1),
 * contra todas las filas del mes: BOT, MANUAL y ARCHIVO (D3). El aviso vive en _ESTADO con TIPO
 * DUPLICADO y CLAVE = id del mensaje del usuario (igual que la pregunta de fecha) y prefijo propio de
 * callback_data ('duplicado'), para no chocar con 'fecha' ni 'fechafoto'. callback_data mide 1-64
 * bytes; CLAVE_BOTON y MAX_BYTES_CALLBACK son de Botones.js.
 * Usa COLUMNAS y COLUMNAS_ESTADO de Hoja.js; normalizarProveedor_ de Reglas.js; textoCelda_,
 * PREGUNTA_ABIERTA y leerDatosEstado_ de Escritura.js; TIPO_GASTO de Texto.js; fechaConfirmacion_
 * de Confirmacion.js (AAAA-MM-DD → DD/MM/AAAA); ORIGEN_MANUAL de Edicion.js; ORIGEN_ARCHIVO de
 * Importacion.js.
 */
const TIPO_ESTADO_DUPLICADO = 'DUPLICADO';
const PREFIJO_DUPLICADO = 'duplicado';
const DATA_DUPLICADO = /^duplicado:([0-9A-Za-z-]+):(equivoque|agregar|seguro|cancelar)$/;
const PASO_AVISO = 'aviso';
const PASO_CONFIRMAR = 'confirmar';
const TEXTO_CONFIRMAR_DUPLICADO = '¿Estás segura de que quieres agregarla otra vez?';
const TEXTO_NO_AGREGADA = 'Listo, no la agregué.';

/** Monto de una celda en centavos enteros; null si no es un número (vacío, PENDIENTE, texto). */
function centavosDe_(valor) {
  if (valor === '' || valor === null || valor === undefined || typeof valor === 'boolean') return null;
  const numero = typeof valor === 'number' ? valor : Number(valor);
  return Number.isFinite(numero) ? Math.round(numero * 100) : null;
}

/** true si la fila cuenta como gasto (S2): TIPO GASTO, o TIPO vacío en filas MANUAL o ARCHIVO. */
function esGastoComparable_(tipo, origen) {
  const t = String(tipo || '').trim().toUpperCase();
  if (t !== '') return t === TIPO_GASTO;
  const o = String(origen || '').trim().toUpperCase();
  return o === ORIGEN_MANUAL || o === ORIGEN_ARCHIVO;
}

/** Fila de la hoja (arreglo en el orden de COLUMNAS) → datos comparables, o null si no cuenta. */
function leerComparable_(valores) {
  const celda = (nombre) => valores[COLUMNAS.indexOf(nombre)];
  if (!esGastoComparable_(celda('TIPO'), celda('ORIGEN'))) return null;
  const proveedor = textoCelda_(celda('PROVEEDOR')).trim();
  const centavos = centavosDe_(celda('GASTO (USD)'));
  if (!proveedor || centavos === null) return null;
  const registrado = celda('REGISTRADO');
  return {
    proveedor,
    clave: normalizarProveedor_(proveedor),
    fecha: textoCelda_(celda('FECHA')),
    centavos,
    origen: String(celda('ORIGEN') || '').trim().toUpperCase(),
    registrado: registrado instanceof Date && !Number.isNaN(registrado.getTime()) ? registrado : null,
  };
}

/**
 * Busca en las filas del mes (arreglos como los devuelve la hoja) la que coincide con `fila` (el
 * objeto {columna: valor} que planFoto_ armó). Devuelve la coincidencia más reciente por
 * REGISTRADO (S5; con empate, la de más abajo) como { proveedor, fecha, total, origen, registrado }
 * o null. Sin proveedor o sin monto en la fila nueva, o cualquier entrada inválida → null.
 */
function buscarDuplicado_(filasMes, fila) {
  if (!Array.isArray(filasMes) || !fila) return null;
  const proveedor = normalizarProveedor_(fila.PROVEEDOR);
  const centavos = centavosDe_(fila['GASTO (USD)']);
  const fecha = textoCelda_(fila.FECHA);
  if (!proveedor || proveedor === 'PENDIENTE' || centavos === null || !fecha) return null;
  const tiempo = (c) => (c.registrado ? c.registrado.getTime() : 0);
  const mejor = filasMes
    .map(leerComparable_)
    .filter((c) => c && c.clave === proveedor && c.fecha === fecha && c.centavos === centavos)
    .reduce((elegida, c) => (!elegida || tiempo(c) >= tiempo(elegida) ? c : elegida), null);
  if (!mejor) return null;
  return {
    proveedor: mejor.proveedor,
    fecha: mejor.fecha,
    total: mejor.centavos / 100,
    origen: mejor.origen,
    registrado: mejor.registrado,
  };
}

/** Date → "DD/MM/AAAA" con sus partes locales (la hoja guarda REGISTRADO en la hora del script). */
function diaMesAnio_(fecha) {
  const dos = (n) => String(n).padStart(2, '0');
  return `${dos(fecha.getDate())}/${dos(fecha.getMonth() + 1)}/${fecha.getFullYear()}`;
}

/**
 * Aviso al usuario. Fila del bot o a mano: "la agregaste el <REGISTRADO>". Fila del Excel viejo: el
 * REGISTRADO de lo importado es inventado, así que se usa la fecha de la factura.
 */
function textoDuplicado_(coincidencia) {
  const { proveedor, fecha, total, origen, registrado } = coincidencia;
  const detalle = `por ${total.toFixed(2)}, proveedor ${proveedor}.`;
  if (origen === ORIGEN_ARCHIVO) {
    return `Esta factura ya está anotada en el Excel viejo: factura del ${fechaConfirmacion_(fecha)} ${detalle}`;
  }
  const cuando = registrado ? diaMesAnio_(registrado) : fechaConfirmacion_(fecha);
  return `Esta factura ya está anotada: la agregaste el ${cuando} ${detalle}`;
}

/** Teclado con dos botones y callback_data `duplicado:<clave>:<opción>` (máximo 64 bytes). */
function tecladoDuplicadoCon_(clave, botones) {
  const texto = typeof clave === 'number' || typeof clave === 'string' ? String(clave) : '';
  if (!CLAVE_BOTON.test(texto)) throw new Error(`clave de botón no válida: ${clave}`);
  const armados = botones.map(([etiqueta, opcion]) => ({
    text: etiqueta, callback_data: `${PREFIJO_DUPLICADO}:${texto}:${opcion}`,
  }));
  if (armados.some((b) => b.callback_data.length > MAX_BYTES_CALLBACK)) {
    throw new Error(`callback_data pasa de ${MAX_BYTES_CALLBACK} bytes`);
  }
  return { inline_keyboard: [armados] };
}

/** Teclado del aviso: "1. Me equivoqué" / "2. Sí, la quiero agregar". */
const tecladoDuplicado_ = (clave) => tecladoDuplicadoCon_(clave, [
  ['1. Me equivoqué', 'equivoque'], ['2. Sí, la quiero agregar', 'agregar'],
]);

/** Teclado de "¿Estás segura?": Sí / No. */
const tecladoConfirmarDuplicado_ = (clave) => tecladoDuplicadoCon_(clave, [
  ['Sí', 'seguro'], ['No', 'cancelar'],
]);

/** callback_data de un botón de duplicado → { clave, opcion }; cualquier otra cosa → null. */
function leerBotonDuplicado_(data) {
  const partes = typeof data === 'string' ? data.match(DATA_DUPLICADO) : null;
  return partes ? { clave: partes[1], opcion: partes[2] } : null;
}

/** DATOS guardados en _ESTADO: la foto ya leída y en qué paso está la pregunta. */
const datosDuplicado_ = ({ datos, fechaMensaje, idMensaje, mimeType, paso }) => JSON.stringify({
  datos, fechaMensaje, idMensaje, mimeType, paso,
});

/** Fila de _ESTADO para un aviso de duplicado abierto, en el orden de COLUMNAS_ESTADO. */
function filaDuplicado_({ creado, idMensaje, datos, fechaMensaje, mimeType, paso }) {
  const fila = {
    CREADO: creado,
    TIPO: TIPO_ESTADO_DUPLICADO,
    CLAVE: String(idMensaje),
    'ID FILAS': '',
    DATOS: datosDuplicado_({ datos, fechaMensaje, idMensaje, mimeType, paso }),
    ESTADO: PREGUNTA_ABIERTA,
  };
  return COLUMNAS_ESTADO.map((c) => fila[c]);
}

/**
 * Aviso de _ESTADO (filas sin encabezado) con esa clave: { fila, abierto, datos, fechaMensaje,
 * idMensaje, mimeType, paso }, donde `fila` es el número de fila en la hoja. null si no está o sus
 * DATOS no sirven.
 */
function buscarDuplicadoAbierto_(filasEstado, clave) {
  const col = (nombre) => COLUMNAS_ESTADO.indexOf(nombre);
  const i = filasEstado.findIndex((f) => f[col('TIPO')] === TIPO_ESTADO_DUPLICADO
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
    mimeType: guardado.mimeType,
    paso: guardado.paso === PASO_CONFIRMAR ? PASO_CONFIRMAR : PASO_AVISO,
  };
}

if (typeof module !== 'undefined') {
  module.exports = {
    TIPO_ESTADO_DUPLICADO, PREFIJO_DUPLICADO, PASO_AVISO, PASO_CONFIRMAR, TEXTO_CONFIRMAR_DUPLICADO,
    TEXTO_NO_AGREGADA, buscarDuplicado_, textoDuplicado_, tecladoDuplicado_,
    tecladoConfirmarDuplicado_, leerBotonDuplicado_, datosDuplicado_, filaDuplicado_,
    buscarDuplicadoAbierto_,
  };
}
