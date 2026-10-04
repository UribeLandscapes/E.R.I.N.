/**
 * Fotos de facturas, lógica pura: elegir el tamaño más grande que manda Telegram,
 * armar el cuerpo de Gemini con la imagen (modo foto del esquema), el plan de filas de la foto
 * (reusa planTexto_) y la línea "Foto: <enlace>" de la confirmación detallada.
 * Usa esquemaExtraccion_ de Extraccion.js; instruccionClases_ de Clases.js; CONFIG de Config.js;
 * planTexto_, fechaLeida_ y confirmacionEntrada_ de Texto.js; htmlEscape_ de Confirmacion.js;
 * nombreFoto_ y descripcionCorta_ de Carpetas.js. Nunca llama a getFile ni a Gemini.
 */
// Bot API: JPEG, PNG, WEBP, HEIC, HEIF (documentación revisada); PDF
// (el usuario manda la factura como PDF: Gemini lo acepta inline igual que una imagen).
const MIME_FOTO_PERMITIDOS = Object.freeze([
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf',
]);

/** true si `f` trae lo mínimo de un PhotoSize de Telegram para comparar tamaño. */
function esFotoValida_(f) {
  return Boolean(f) && typeof f === 'object' && typeof f.file_id === 'string' && f.file_id !== ''
    && Number.isFinite(f.width) && f.width > 0 && Number.isFinite(f.height) && f.height > 0;
}

/**
 * La foto de mayor tamaño (ancho x alto) del arreglo `photo` de Telegram: su orden no está
 * documentado, así que nunca se elige por posición. Salta entradas mal formadas; empate → la
 * primera vista; sin ninguna válida → null.
 */
function fotoMayor_(fotos) {
  if (!Array.isArray(fotos)) return null;
  let mejor = null;
  let mejorArea = -1;
  fotos.forEach((f) => {
    if (!esFotoValida_(f)) return;
    const area = f.width * f.height;
    if (area > mejorArea) {
      mejor = f;
      mejorArea = area;
    }
  });
  return mejor;
}

/**
 * El archivo a bajar de un mensaje del usuario: la foto de mayor tamaño si `mensaje.photo` trae
 * algo (gana sobre un documento, sin cambiar el comportamiento de antes); si no, el documento
 * adjunto (mensaje.document) cuando su mime_type es uno de los que Gemini acepta (el usuario manda la
 * factura "como archivo", sin comprimir, incluido un PDF:). Cualquier otro adjunto
 * (audio, documento sin mime_type ni file_id) devuelve null.
 */
function fotoDeMensaje_(mensaje) {
  if (!mensaje || typeof mensaje !== 'object') return null;
  if (Array.isArray(mensaje.photo) && mensaje.photo.length) return fotoMayor_(mensaje.photo);
  const documento = mensaje.document;
  if (!documento || typeof documento !== 'object') return null;
  if (typeof documento.file_id !== 'string' || documento.file_id === '') return null;
  const mime = String(documento.mime_type || '').toLowerCase();
  if (!MIME_FOTO_PERMITIDOS.includes(mime)) return null;
  const foto = { file_id: documento.file_id, mime_type: mime };
  if (Number.isFinite(documento.file_size)) foto.file_size = documento.file_size;
  return foto;
}

/**
 * Instrucción de sistema para leer la foto de un recibo o factura (modo foto); `hoy` =
 * 'AAAA-MM-DD' en la zona del script. Nunca adivina montos (null si no se leen con claridad) ni
 * la fecha (null si no es legible: el bot le pregunta al usuario). La leyenda que el usuario
 * escriba junto a la foto sirve para la casa, la forma de pago y el comentario; lo que no se
 * entienda de esa leyenda va completo a comentario, en vez de perderse o adivinar qué es.
 * Incluye las 8 reglas (formatos reales de Panamá).
 */
function instruccionFoto_(hoy) {
  return [
    'Eres el asistente de la caja chica de una casa. Lees la foto de un recibo o factura y',
    'devuelves solo el JSON del esquema.',
    '',
    'Lee el recibo o factura de la imagen: proveedor, fecha, moneda, forma de pago, las líneas',
    'con su monto y el total. Nunca adivines un monto: si no se lee con claridad, va null (con',
    'confianza BAJA). Es mejor dejarlo vacío que equivocarse; el bot pregunta después.',
    '',
    `Hoy es ${hoy} en la zona ${CONFIG.TIMEZONE}. La fecha va como AAAA-MM-DD; si el recibo no`,
    'trae una fecha legible con claridad, deja fecha en null (el bot usa el día en que el usuario',
    'mandó la foto y le pregunta si está bien; no hace falta adivinar).',
    '',
    'CLASE DE GASTO: elige solo un valor de la lista cerrada del esquema (los 17 grupos de abajo,',
    'más las etiquetas viejas que ya usa la hoja). Nunca inventes una categoría nueva.',
    '',
    instruccionClases_(),
    '',
    ...instruccionCasas_(),
    'Si el texto junto a la foto dice a cuál casa va el gasto, pon PRINCIPAL o SECUNDARIA en casa;',
    'si no lo dice, deja casa en null (el bot lo registra como compartido). No adivines la casa.',
    '',
    'El mensaje puede traer una leyenda: un texto corto que el usuario escribió junto a la foto. Úsala',
    'para la casa (arriba) y para la forma de pago si la dice ("efectivo", "transferencia", "yappy"; una',
    'casa mencionada ahí no es forma de pago). Cualquier parte de la leyenda cuyo significado no',
    'te quede claro va completa y tal cual a comentario, en vez de perderse o adivinar qué es',
    '("para la fiesta" → comentario: "para la fiesta").',
    '',
    'YAPPY: una captura de Yappy, o la palabra "yappy" en la leyenda, es forma_pago YAPPY. Una',
    'transferencia ACH o bancaria sigue siendo TRANSFERENCIA. "Yappy" mal escrito en la leyenda',
    '("yapi", "yapy", "yappi", "yapii", "llapi", "japi", o parecido) también es forma_pago YAPPY.',
    '',
    'FACTURAS DE PANAMÁ:',
    '1. RUC, DV, CUFE, QR, número de autorización, terminal, lote, número de factura, de caja,',
    'de membresía, de cuenta, placa y teléfono nunca son montos ni fechas.',
    '2. El total es lo que dice TOTAL (o lo pagado). No es el SUBTOTAL, ni EFECTIVO RECIBIDO,',
    'ni el CAMBIO, ni el saldo de la cuenta.',
    '3. Cada ITBMS con monto va como línea ITBMS; descuentos y ahorros van como línea DESCUENTO',
    'con monto negativo.',
    '4. La propina solo va (línea PROPINA) si se pagó: sumada al total cobrado, en el voucher',
    'o escrita a mano. Una propina sugerida sola no se anota. Si hay dos totales y no se sabe',
    'cuál se pagó, total en null con confianza BAJA.',
    '5. Proveedor = nombre comercial del letrero (Super 99, Riba Smith, El Rey, PriceSmart),',
    'no la razón social "S.A." ni el RUC. En una captura de Yappy o transferencia, el',
    'proveedor es el destinatario.',
    '6. Fecha = la de la compra o del pago. En facturas de servicios, la de pago si se ve',
    'pagada; si no, la de emisión (nunca la de vencimiento ni el período de consumo). La',
    'hora del celular en una captura no cuenta.',
    '7. B/. (balboa) y USD son lo mismo: moneda USD. Un "$" en un recibo de otro país es la',
    'moneda de ese país; si no se sabe, moneda null.',
    '8. Ticket y voucher de la misma compra en una foto son un solo gasto (el voucher solo',
    'confirma TARJETA y, si la trae, la propina).',
  ].join('\n');
}

/**
 * Cuerpo de generateContent para la foto de un recibo (salida JSON con el esquema en modo foto,
 * conIntencion=false). `caption` es la leyenda que el usuario haya escrito junto a la foto; si
 * viene vacía (o solo espacios) no se manda ninguna parte de texto. Lanza si falta `base64` o si
 * `mimeType` no es uno de los que acepta la Bot API de Gemini (MIME_FOTO_PERMITIDOS).
 */
function cuerpoFotoGemini_(base64, mimeType, caption, categorias, hoy) {
  if (!base64) throw new Error('falta base64 de la foto');
  if (!MIME_FOTO_PERMITIDOS.includes(String(mimeType || '').toLowerCase())) {
    throw new Error(`mimeType no soportado: ${mimeType}`);
  }
  const textoLeyenda = typeof caption === 'string' ? caption.trim() : '';
  const parts = [{ inlineData: { mimeType, data: base64 } }];
  if (textoLeyenda) parts.push({ text: textoLeyenda });
  return {
    systemInstruction: { parts: [{ text: instruccionFoto_(hoy) }] },
    contents: [{ role: 'user', parts }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseJsonSchema: esquemaExtraccion_(categorias, false),
    },
  };
}

/**
 * Plan de una foto ya leída por Gemini: reusa planTexto_ tal cual (filas,
 * preguntas, moneda, y la confirmación ya armada, con la línea de la foto si `datos`
 * trae su enlace), así los caminos que vuelven a planear (botón de fecha, respuesta de monto,
 * corrección) dan el mismo resultado. `datos` debe traer intencion 'GASTO' (la pone la capa de
 * app: la extracción de una foto no la trae). Se llama UNA sola vez por mensaje: ctx.aUsd puede
 * consultar tasas por red. Agrega { fechaIlegible, nombreArchivo }:
 * - (fecha del recibo válida pero de otro mes) pasa igual que en texto: sin filas.
 * -: si la fecha no se pudo leer, las filas SÍ se escriben con ctx.fechaMensaje (como ya
 *   hace filasGasto_ dentro de planTexto_) y `fechaIlegible` = { fechaEnvio: ctx.fechaMensaje } para que el bot
 *   pregunte aparte si está bien. Sin filas (falta el monto), `fechaIlegible` viene igual: viaja
 *   con la pregunta de monto y la fecha se pregunta cuando esa respuesta escriba las filas.
 * - `nombreArchivo` = nombreFoto_ con la fecha y el proveedor ya escritos en la primera fila y la
 *   descripción corta de Gemini (o el proveedor si no trajo una); null si no hay filas.
 */
function planFoto_(datos, ctx) {
  const resultado = planTexto_(datos, ctx);
  const fechaIlegible = fechaLeida_(datos.fecha) === null ? { fechaEnvio: ctx.fechaMensaje } : null;
  if (resultado.fechaDistinta) return { ...resultado, fechaIlegible: null, nombreArchivo: null };
  if (!resultado.filas.length) return { ...resultado, fechaIlegible, nombreArchivo: null };
  const fila = resultado.filas[0];
  const nombreArchivo = nombreFoto_(
    fila.FECHA,
    descripcionCorta_(datos.descripcion_corta || fila.PROVEEDOR),
    ctx.mimeType,
  );
  return { ...resultado, fechaIlegible, nombreArchivo };
}

/**
 * Línea "Foto: ver foto" de la confirmación detallada: el texto visible es "ver foto"
 * (decidido, no la URL cruda), el href sigue llevando el enlace escapado.
 */
const lineaFoto_ = (url) => `<b>Foto:</b> <a href="${htmlEscape_(url)}">ver foto</a>`;

/**
 * Confirmación detallada de una foto: la de confirmacionEntrada_, que ya pone la línea de
 * la foto justo debajo de Comentarios (una fila por factura).
 */
function confirmacionFoto_(filas, preguntas, ctx, url) {
  return confirmacionEntrada_(filas, preguntas, ctx, url);
}

if (typeof module !== 'undefined') {
  module.exports = {
    MIME_FOTO_PERMITIDOS, fotoMayor_, fotoDeMensaje_, instruccionFoto_, cuerpoFotoGemini_, planFoto_,
    lineaFoto_, confirmacionFoto_,
  };
}
