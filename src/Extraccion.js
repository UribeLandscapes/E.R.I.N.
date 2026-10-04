/**
 * Extracción con Gemini (pura): el esquema JSON que se le pide (responseJsonSchema) y la
 * lectura prudente de lo que devuelve. Nunca adivina: lo que no se entiende queda null,
 * PENDIENTE o con confianza BAJA. Usa `leerFecha_` de Reglas.js.
 */
const NIVELES_CONFIANZA = Object.freeze(['ALTA', 'MEDIA', 'BAJA']);
const TIPOS_DOCUMENTO = Object.freeze(['TICKET', 'FACTURA', 'MANUSCRITO', 'OTRO']);
const FORMAS_PAGO = Object.freeze(['EFECTIVO', 'TRANSFERENCIA', 'YAPPY', 'TARJETA', 'DESCONOCIDA']);
const TIPOS_LINEA = Object.freeze(['ITEM', 'ITBMS', 'DESCUENTO', 'PROPINA', 'OTROS']);
// AYUDA: pide ayuda o pregunta cómo funciona el bot; se responde con la guía.
// CORREGIR y BORRAR: cambian o quitan la entrada que el bot ya anotó.
const INTENCIONES = Object.freeze(['GASTO', 'DEPOSITO', 'CONTEO', 'SALDO_INICIAL', 'RESPUESTA',
  'AYUDA', 'CORREGIR', 'BORRAR', 'OTRO']);
// Casa a la que va el gasto; COMPARTIDO no es una opción de Gemini, es lo que
// pone Texto.js cuando esto queda en null (el usuario no nombró ninguna casa).
const CASAS = Object.freeze(['PRINCIPAL', 'SECUNDARIA']);
const CAMPOS_CON_CONFIANZA = Object.freeze(['proveedor', 'fecha', 'moneda', 'total', 'clase']);
const CLASE_PENDIENTE = 'PENDIENTE';
const FORMA_ISO_MONEDA = /^[A-Z]{3}$/;

const textoONulo_ = (descripcion) => ({ type: ['string', 'null'], description: descripcion });
const numeroONulo_ = (descripcion) => ({ type: ['number', 'null'], description: descripcion });
const opciones_ = (lista, descripcion) => ({ type: 'string', enum: [...lista], description: descripcion });
const opcionONula_ = (lista, descripcion) => ({ type: ['string', 'null'], enum: [...lista, null], description: descripcion });

// En texto libre (conIntencion) la descripción va corta y sin montos,
// moneda, forma de pago ni proveedor (esos ya salen en sus propias líneas/columnas); en una foto
// (conIntencion=false) se sigue pidiendo el texto de la línea tal como se lee.
const DESCRIPCION_LINEA_TEXTO = 'Qué se compró en 2 a 4 palabras, sin montos, moneda, forma de '
  + 'pago ni proveedor; vacío si el mensaje no lo dice';
const DESCRIPCION_LINEA_FOTO = 'Texto de la línea tal como se lee';

function esquemaLinea_(conIntencion) {
  return {
    type: 'object',
    properties: {
      tipo: opciones_(TIPOS_LINEA, 'Tipo de línea de la factura'),
      descripcion: { type: 'string', description: conIntencion ? DESCRIPCION_LINEA_TEXTO : DESCRIPCION_LINEA_FOTO },
      monto: numeroONulo_('Monto de la línea; null si no se lee con claridad. Nunca adivinar'),
      confianza: opciones_(NIVELES_CONFIANZA, 'Qué tan seguro es el monto leído'),
    },
    required: ['tipo', 'descripcion', 'monto', 'confianza'],
  };
}

function esquemaConfianza_() {
  const properties = {};
  CAMPOS_CON_CONFIANZA.forEach((c) => { properties[c] = opciones_(NIVELES_CONFIANZA, `Confianza en ${c}`); });
  return { type: 'object', properties, required: [...CAMPOS_CON_CONFIANZA] };
}

/** Esquema de la extracción; con `conIntencion` agrega la intención del texto libre. */
function esquemaExtraccion_(categorias, conIntencion) {
  const clases = [...new Set(categorias.filter((c) => c !== CLASE_PENDIENTE)), CLASE_PENDIENTE];
  const properties = {
    legible: { type: 'boolean', description: 'false si la imagen o el texto no se pueden leer' },
    tipo_documento: opciones_(TIPOS_DOCUMENTO, 'MANUSCRITO si el comprobante está escrito a mano'),
    proveedor: textoONulo_('Nombre del comercio o persona; null si no se lee'),
    fecha: { ...textoONulo_('Fecha de la factura AAAA-MM-DD; null si no se lee'), format: 'date' },
    moneda: textoONulo_('Código ISO 4217 en mayúsculas (USD, PAB, COP, EUR…); null si no se sabe'),
    forma_pago: opciones_(FORMAS_PAGO, 'Forma de pago; YAPPY si es Yappy; DESCONOCIDA si no aparece'),
    lineas: { type: 'array', items: esquemaLinea_(conIntencion) },
    total: numeroONulo_('Total de la factura; null si no se lee. Nunca adivinar'),
    clase: opciones_(clases, 'Categoría de la lista; PENDIENTE si ninguna encaja con seguridad'),
    casa: opcionONula_(CASAS, 'Casa a la que va el gasto si el texto la nombra; null si no la nombra. Nunca adivinar'),
    comentario: textoONulo_('Nota que la persona pide guardar ("comentario: para la fiesta"); null si no pide ninguna'),
    descripcion_corta: { type: 'string', description: 'De 3 a 5 palabras para el nombre del archivo' },
    confianza: esquemaConfianza_(),
  };
  if (conIntencion) properties.intencion = opciones_(INTENCIONES, 'Qué quiere registrar el mensaje');
  return { type: 'object', properties, required: Object.keys(properties) };
}

function textoRespuesta_(respuesta) {
  const candidato = ((respuesta && respuesta.candidates) || [])[0];
  if (!candidato) return { motivo: 'sin candidatos' };
  if (candidato.finishReason !== 'STOP') return { motivo: `finishReason ${candidato.finishReason}` };
  const partes = (candidato.content && candidato.content.parts) || [];
  const texto = partes.filter((p) => !p.thought).map((p) => p.text || '').join('');
  return texto ? { texto } : { motivo: 'respuesta sin texto' };
}

const deLista_ = (valor, lista, prudente) => (lista.includes(valor) ? valor : prudente);
const numeroONull_ = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const textoLimpio_ = (v) => (typeof v === 'string' ? v.trim() : '');

function fechaONull_(valor) {
  try {
    leerFecha_(valor);
    return valor;
  } catch (error) {
    return null;
  }
}

function monedaONull_(valor) {
  const moneda = textoLimpio_(valor).toUpperCase();
  return FORMA_ISO_MONEDA.test(moneda) ? moneda : null;
}

function leerLinea_(linea) {
  const l = linea && typeof linea === 'object' ? linea : {};
  const tipo = deLista_(l.tipo, TIPOS_LINEA, 'OTROS');
  const monto = numeroONull_(l.monto);
  return {
    tipo,
    descripcion: textoLimpio_(l.descripcion),
    monto: tipo === 'DESCUENTO' && monto !== null ? -Math.abs(monto) : monto,
    confianza: deLista_(l.confianza, NIVELES_CONFIANZA, 'BAJA'),
  };
}

function leerConfianza_(confianza) {
  const c = confianza && typeof confianza === 'object' ? confianza : {};
  const leida = {};
  CAMPOS_CON_CONFIANZA.forEach((campo) => { leida[campo] = deLista_(c[campo], NIVELES_CONFIANZA, 'BAJA'); });
  return leida;
}

function limpiarDatos_(j, categorias, conIntencion) {
  const datos = {
    legible: j.legible,
    tipo_documento: deLista_(j.tipo_documento, TIPOS_DOCUMENTO, 'OTRO'),
    proveedor: textoLimpio_(j.proveedor) || null,
    fecha: fechaONull_(j.fecha),
    moneda: monedaONull_(j.moneda),
    forma_pago: deLista_(j.forma_pago, FORMAS_PAGO, 'DESCONOCIDA'),
    lineas: Array.isArray(j.lineas) ? j.lineas.map(leerLinea_) : [],
    total: numeroONull_(j.total),
    clase: categorias.includes(j.clase) ? j.clase : CLASE_PENDIENTE,
    casa: deLista_(j.casa, CASAS, null),
    comentario: textoLimpio_(j.comentario) || null,
    descripcion_corta: textoLimpio_(j.descripcion_corta),
    confianza: leerConfianza_(j.confianza),
  };
  if (conIntencion) datos.intencion = deLista_(j.intencion, INTENCIONES, 'OTRO');
  return datos;
}

/** Lee la respuesta de generateContent → { ok: true, datos } o { ok: false, motivo }. */
function leerExtraccion_(respuesta, categorias, conIntencion) {
  const bloqueo = respuesta && respuesta.promptFeedback && respuesta.promptFeedback.blockReason;
  if (bloqueo) return { ok: false, motivo: `bloqueado: ${bloqueo}` };
  const { texto, motivo } = textoRespuesta_(respuesta);
  if (!texto) return { ok: false, motivo };
  let json;
  try {
    json = JSON.parse(texto);
  } catch (error) {
    return { ok: false, motivo: 'el texto no es JSON' };
  }
  if (!json || typeof json !== 'object' || Array.isArray(json) || typeof json.legible !== 'boolean') {
    return { ok: false, motivo: 'forma inesperada' };
  }
  return { ok: true, datos: limpiarDatos_(json, categorias, conIntencion) };
}

/** Campos a marcar PENDIENTE o a releer: confianza BAJA, valor null o clase PENDIENTE. */
function camposDudosos_(datos) {
  const dudosos = CAMPOS_CON_CONFIANZA.filter((campo) => datos.confianza[campo] === 'BAJA'
    || datos[campo] === null || (campo === 'clase' && datos.clase === CLASE_PENDIENTE));
  datos.lineas.forEach((l, i) => {
    if (l.monto === null || l.confianza === 'BAJA') dudosos.push(`linea ${i + 1}`);
  });
  return dudosos;
}

/** Relectura con CONFIG.MODELO_RELECTURA solo en foto manuscrita con campos dudosos. */
function debeReleer_(datos) {
  return datos.tipo_documento === 'MANUSCRITO' && camposDudosos_(datos).length > 0;
}

if (typeof module !== 'undefined') {
  module.exports = {
    NIVELES_CONFIANZA, INTENCIONES, CASAS, esquemaExtraccion_, leerExtraccion_, camposDudosos_, debeReleer_,
  };
}
