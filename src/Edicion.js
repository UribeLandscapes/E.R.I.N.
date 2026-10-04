/**
 * alEditar, lógica pura: qué pestaña y qué filas
 * mirar, cómo sellar una fila manual nueva, qué marca de REVISAR quita una edición del usuario y qué
 * preguntas abiertas del bot ya se pueden cerrar. Sin SpreadsheetApp ni Telegram: eso vive en
 * EdicionApp.js. Usa COLUMNAS_VISIBLES, COLUMNAS_ESTADO, PRIMERA_FILA_DATOS y
 * leerPestanaMes_ de Hoja.js; MARCA_POR_COLUMNA, revisarSin_, fechaValida_, textoCelda_,
 * preguntasAbiertas_, TIPO_ESTADO_PREGUNTA de Escritura.js; TIPO_ESTADO_POR_PROCESAR y
 * porProcesarAbiertas_ de PorProcesar.js.
 * (fecha corregida en la hoja mueve la foto): idArchivoDeUrl_, descripcionDeNombreFoto_ y
 * fotoAMover_ son la parte pura; sin DriveApp, eso vive en moverFotoSiCambioFecha_ de EdicionApp.js.
 */
const ORIGEN_MANUAL = 'MANUAL';

// Aviso al usuario al cerrar una pregunta porque ya la corrigió en la hoja.
const TEXTO_PREGUNTA_CERRADA_HOJA = 'Vi que lo corregiste en la hoja. Ya cerré esta pregunta.';

/** true si `nombre` es una pestaña de mes ("Septiembre 2026"); false para _ESTADO, _HISTORIAL, etc. */
const esPestanaMes_ = (nombre) => leerPestanaMes_(nombre) !== null;

/** Filas de la hoja tocadas por una edición, solo las de datos (desde PRIMERA_FILA_DATOS). */
function filasDatosTocadas_(filaInicio, numFilas) {
  const filas = [];
  for (let i = 0; i < numFilas; i += 1) {
    const fila = filaInicio + i;
    if (fila >= PRIMERA_FILA_DATOS) filas.push(fila);
  }
  return filas;
}

/**
 * Ocultas a rellenar en una fila manual nueva: solo si es una fila manual (ID FILA vacío,
 * o ya sellada como MANUAL) con algo en alguna visible; solo las ocultas que estén vacías. `{}` si
 * no hay nada que sellar: fila del bot, o fila sin ningún dato visible.
 */
function selloManual_(valores, { sello, ahora, numeroFila }) {
  const idFila = textoCelda_(valores['ID FILA']);
  const origen = textoCelda_(valores.ORIGEN);
  if (idFila !== '' && origen !== ORIGEN_MANUAL) return {}; // fila del bot: nunca se toca
  const tieneAlgo = COLUMNAS_VISIBLES.some((c) => textoCelda_(valores[c]) !== '');
  if (!tieneAlgo) return {};
  const relleno = {};
  if (idFila === '') relleno['ID FILA'] = `${ORIGEN_MANUAL}-${sello}-${numeroFila}`;
  if (origen === '') relleno.ORIGEN = ORIGEN_MANUAL;
  if (textoCelda_(valores.REGISTRADO) === '') relleno.REGISTRADO = ahora;
  return relleno;
}

/** true si el valor nuevo de esa columna editada sirve para quitar su marca de REVISAR. */
function valorUtil_(columna, valor) {
  if (columna === 'FECHA') return fechaValida_(textoCelda_(valor)) !== null;
  return typeof valor === 'number' && Number.isFinite(valor);
}

/**
 * REVISAR tras una edición, o null si no cambia nada: quita la marca de cada columna
 * editada que trae un valor que sirve (número para los montos, fecha real para FECHA); si el usuario
 * vacía la celda o pone texto, la marca se queda.
 */
function revisarTrasEdicion_(valores, columnasEditadas) {
  const resueltas = (columnasEditadas || [])
    .filter((c) => c in MARCA_POR_COLUMNA && valorUtil_(c, valores[c]));
  if (!resueltas.length) return null;
  const nuevo = revisarSin_(valores.REVISAR, resueltas);
  return nuevo === textoCelda_(valores.REVISAR) ? null : nuevo;
}

/** true si alguna columna VISIBLE (incluida REVISAR) tiene "PENDIENTE", sin importar mayúsculas. */
const tienePendiente_ = (valores) => COLUMNAS_VISIBLES
  .some((c) => textoCelda_(valores[c]).toUpperCase().includes('PENDIENTE'));

/**
 * Preguntas ABIERTAS de tipo PREGUNTA (fila.idMensajeBot de CLAVE) o POR-PROCESAR (de DATOS.idPregunta)
 * listas para cerrar: su lista de ID FILAS no está vacía, todos esos ID FILA están en
 * `filasPorId` y ninguna de esas filas tienePendiente_. Cualquier otro TIPO nunca se devuelve.
 */
function preguntasParaCerrar_(filasEstado, filasPorId) {
  const candidatas = [
    ...preguntasAbiertas_(filasEstado)
      .map((p) => ({ fila: p.fila, tipo: TIPO_ESTADO_PREGUNTA, idFilas: p.idFilas, idMensajeBot: p.idMensajeBot })),
    ...porProcesarAbiertas_(filasEstado)
      .map((p) => ({ fila: p.fila, tipo: TIPO_ESTADO_POR_PROCESAR, idFilas: p.idFilas, idMensajeBot: p.idPregunta })),
  ];
  return candidatas
    .filter((p) => p.idFilas.length > 0 && p.idFilas.every((id) => filasPorId.has(id)))
    .filter((p) => p.idFilas.every((id) => !tienePendiente_(filasPorId.get(id))))
    .map((p) => ({ fila: p.fila, tipo: p.tipo, idMensajeBot: p.idMensajeBot }));
}

// Formas de enlace de Drive que trae la celda FOTO (archivo.getUrl y variantes antiguas).
const PATRON_ID_RUTA = /^https:\/\/drive\.google\.com\/file\/d\/([^/?]+)/;
const PATRON_ID_QUERY = /^https:\/\/drive\.google\.com\/(?:open|uc)\?.*[?&]?id=([^&]+)/;

/** Id de archivo de Drive de un enlace de FOTO (file/d/, open?id=, uc?id=); cualquier otra cosa → null. */
function idArchivoDeUrl_(url) {
  const texto = String(url || '');
  const porRuta = PATRON_ID_RUTA.exec(texto);
  if (porRuta) return porRuta[1];
  const porQuery = PATRON_ID_QUERY.exec(texto);
  return porQuery ? porQuery[1] : null;
}

// Nombre que pone nombreFoto_ (Carpetas.js), con el contador opcional de nombreLibre_.
const PATRON_NOMBRE_FOTO = /^\d{4}\.\d{2}\.\d{2} - (.+)$/;

/**
 * Descripción de un nombre de foto ya clasificada ("AAAA.MM.DD - descripción.ext", quizás con
 * " (2)" de nombreLibre_); nombres que todavía no tienen ese formato (p. ej. "tg-123.jpg", en
 * Por clasificar) → null, para que quien llama use otra fuente (PROVEEDOR de la fila).
 */
function descripcionDeNombreFoto_(nombre) {
  const resto = (PATRON_NOMBRE_FOTO.exec(String(nombre || '')) || [])[1];
  if (!resto) return null;
  const sinExtension = resto.replace(/\.[A-Za-z0-9]{1,5}$/, '');
  const sinContador = sinExtension.replace(/ \(\d+\)$/, '').trim();
  return sinContador || null;
}

/**
 * Qué foto mover porque el usuario corrigió FECHA a mano. `null` si FECHA no fue una de las
 * columnas editadas, si el valor nuevo no es una fecha válida, o si FOTO no trae un enlace de
 * Drive reconocible; en cualquiera de esos casos no se toca Drive.
 */
function fotoAMover_(valores, columnasEditadas) {
  if (!(columnasEditadas || []).includes('FECHA')) return null;
  const fecha = textoCelda_(valores.FECHA);
  if (fechaValida_(fecha) === null) return null;
  const idArchivo = idArchivoDeUrl_(textoCelda_(valores.FOTO));
  if (!idArchivo) return null;
  return { idArchivo, fecha };
}

if (typeof module !== 'undefined') {
  module.exports = {
    ORIGEN_MANUAL, TEXTO_PREGUNTA_CERRADA_HOJA, esPestanaMes_, filasDatosTocadas_, selloManual_,
    revisarTrasEdicion_, tienePendiente_, preguntasParaCerrar_,
    idArchivoDeUrl_, descripcionDeNombreFoto_, fotoAMover_,
  };
}
