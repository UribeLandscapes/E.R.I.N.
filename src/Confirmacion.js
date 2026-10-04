/**
 * Confirmación detallada de lo que se anotó, lógica pura. Un solo constructor para
 * el texto y para las fotos: recibe las filas que se escribieron
 * ({columna: valor}) y devuelve el mensaje que el usuario lee. Sin emojis.
 * Usa CONFIG de Config.js; montoTexto_, esMonto_, MONEDAS_PAR_TEXTO y MARCA_PENDIENTE de Texto.js; textoCelda_ de
 * Escritura.js; lineaFoto_ de Foto.js (la línea "Foto: ver foto" va debajo de Comentarios).
 */
// Cierre fijo aprobado: cómo corregir y cómo borrar, siempre con las mismas palabras.
const TEXTO_CIERRE_CONFIRMACION = [
  '¿Algo está mal? Respóndeme a este mensaje con el cambio, por ejemplo:',
  '"la forma de pago es tarjeta", "el proveedor es Super 99", "comentario: para la fiesta".',
  'Si no debí anotarlo, respóndeme "borrar".',
].join('\n');
// Ajuste (c): "(falta)" solo en lo que el bot necesita y va a preguntar.
const TEXTO_FALTA = '(falta)';
const TEXTO_SIN_COMENTARIOS = '(ninguno)';
const TEXTO_SIN_FORMA_PAGO = '(no indicada)';
const TEXTO_SIN_TASA = '(pendiente de la tasa)';
const TIPO_FILA_DEPOSITO = 'DEPÓSITO';
// Con el total en duda (P2) el gasto dice cuánto asumió el bot, para que el usuario lo reconfirme.
const avisoTotalEnDuda_ = (monto) => ` (no estoy seguro del total: asumí ${monto}, confírmame cuánto es)`;
// Qué dato de la confirmación queda en "(falta)" con cada pregunta abierta del bot. El total ya no
// está: con una fila por factura el total ES el gasto, y el bot siempre anota alguno (P2); su duda
// va como aviso en la línea del gasto (lineaGasto_).
const DATO_POR_PREGUNTA = Object.freeze({
  fecha: 'fecha',
  proveedor: 'proveedor',
  depositante: 'proveedor',
  clase: 'clase',
});
// Cómo se nombra cada parte del desglose y si se resta, en el orden en que se lee la factura.
const PARTES_CONFIRMACION = Object.freeze([
  ['ARTÍCULOS', 'artículos', false],
  ['DESCUENTOS', 'descuentos', true],
  ['ITBMS', 'ITBMS', false],
  ['OTROS CARGOS', 'otros cargos', false],
]);

/**
 * Escapa &, < y > para mandar el mensaje con parse_mode HTML (Bot API 10.3): todo el texto salvo
 * las etiquetas <b> de los títulos debe ir así, o Telegram rechaza el mensaje (400 can't parse
 * entities) y, como las respuestas son a lo mucho una vez, se perdería.
 */
function htmlEscape_(valor) {
  return String(valor).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** 'PROPINA' → 'Propina'; 'COMPARTIDO' → 'Compartido'. */
function conMayusculaInicial_(valor) {
  const texto = textoCelda_(valor);
  return texto ? `${texto[0].toUpperCase()}${texto.slice(1).toLowerCase()}` : '';
}

/** Casa para el mensaje: el nombre de CONFIG.CASAS si es PRINCIPAL/SECUNDARIA; si no ('COMPARTIDO'), con mayúscula inicial. */
function nombreCasaConfirmacion_(valor) {
  const casa = CONFIG.CASAS[textoCelda_(valor)];
  return casa ? casa.nombre : conMayusculaInicial_(valor);
}

/** '2026-09-26' (o un Date de getValues) → '26/09/2026'; lo que no sea fecha va tal cual. */
function fechaConfirmacion_(fecha) {
  const texto = textoCelda_(fecha);
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
  return partes ? `${partes[3]}/${partes[2]}/${partes[1]}` : texto;
}

/** Monto en dos decimales; si no es número (falta la tasa) lo dice con palabras. */
const montoConfirmacion_ = (valor) => (esMonto_(valor) ? montoTexto_(valor) : TEXTO_SIN_TASA);

/** Monto en USD, diciendo en qué moneda se pagó cuando no es USD ni PAB. */
function montoConMoneda_(valor, moneda) {
  const texto = montoConfirmacion_(valor);
  const codigo = textoCelda_(moneda);
  return esMonto_(valor) && codigo && !MONEDAS_PAR_TEXTO.includes(codigo)
    ? `${texto} USD (pagado en ${codigo})`
    : texto;
}

/** Suma de GASTO (USD) de las filas; null si alguna no tiene número (falta la tasa). */
function sumaGastos_(filas) {
  const montos = filas.map((f) => f['GASTO (USD)']);
  if (!montos.every((m) => esMonto_(m))) return null;
  return montos.reduce((total, m) => total + Math.round(m * 100), 0) / 100;
}

/**
 * "artículos 1.55, descuentos −0.39": el desglose de la factura, sin las partes en cero. Vacío
 * cuando no hay nada más que artículos (el gasto ya lo dice todo) y no se muestra esa línea.
 */
function desgloseConfirmacion_(fila) {
  const partes = PARTES_CONFIRMACION
    .map(([columna, nombre, resta]) => ({ nombre, resta, monto: fila[columna] }))
    .filter((p) => esMonto_(p.monto) && Math.round(p.monto * 100) !== 0);
  if (!partes.some((p) => p.nombre !== 'artículos')) return '';
  return partes.map((p) => `${p.nombre} ${p.resta ? '−' : ''}${montoTexto_(p.monto)}`).join(', ');
}

/** "21.00", y si el total está en duda (pregunta 'total') el aviso con lo que se asumió. */
function lineaGasto_(filas, totalEnDuda) {
  const suma = sumaGastos_(filas);
  const texto = montoConMoneda_(suma, filas[0].MONEDA);
  return totalEnDuda && esMonto_(suma) ? `${texto}${avisoTotalEnDuda_(montoTexto_(suma))}` : texto;
}

/** Datos del gasto, en el orden aprobado (texto (a)); el desglose solo si hay algo que desglosar. */
function datosGastoConfirmacion_(filas, falta, totalEnDuda) {
  const fila = filas[0];
  const desglose = desgloseConfirmacion_(fila);
  return [
    ['Fecha', falta('fecha') ? TEXTO_FALTA : fechaConfirmacion_(fila.FECHA)],
    ['Proveedor', falta('proveedor') ? TEXTO_FALTA : textoCelda_(fila.PROVEEDOR)],
    ['Descripción', textoCelda_(fila['DESCRIPCIÓN'])],
    ['Gasto', lineaGasto_(filas, totalEnDuda)],
    ...(desglose ? [['Desglose', desglose]] : []),
    ['Forma de pago', textoCelda_(fila['FORMA DE PAGO']) || TEXTO_SIN_FORMA_PAGO],
    ['Clase de gasto', falta('clase') ? TEXTO_FALTA : textoCelda_(fila['CLASE DE GASTO'])],
    ['Casa', nombreCasaConfirmacion_(fila.CASA)],
    ['Comentarios', textoCelda_(fila.COMENTARIOS) || TEXTO_SIN_COMENTARIOS],
  ];
}

/** Datos del depósito (texto (b)): sin forma de pago, ni clase, ni total de factura. */
function datosDepositoConfirmacion_(filas, falta) {
  const fila = filas[0];
  return [
    ['Fecha', falta('fecha') ? TEXTO_FALTA : fechaConfirmacion_(fila.FECHA)],
    ['De', falta('proveedor') ? TEXTO_FALTA : textoCelda_(fila.PROVEEDOR)],
    ['Depósito', montoConfirmacion_(fila['DEPÓSITO'])],
    ['Casa', nombreCasaConfirmacion_(fila.CASA)],
    ['Comentarios', textoCelda_(fila.COMENTARIOS) || TEXTO_SIN_COMENTARIOS],
  ];
}

const esDepositoFilas_ = (filas) => textoCelda_(filas[0].TIPO) === TIPO_FILA_DEPOSITO;

/** Primera línea: lo que se agregó (textos (a) y (b)) o lo que se corrigió (texto (d)). */
function encabezadoConfirmacion_(esDeposito, corregido) {
  const que = esDeposito ? 'el depósito' : 'el gasto';
  return corregido
    ? `Listo, corregí ${que}. Así quedó:`
    : `Listo, agregué ${que} a tu reporte. Estos son los detalles:`;
}

/**
 * Confirmación de una entrada: encabezado, un dato por línea, el cierre fijo y, si algo falta, la
 * pregunta al final del mismo mensaje (ajuste (c)). `preguntas` son las claves abiertas
 * (proveedor, clase…) y `pregunta` su texto ya armado con textoPreguntas_. `foto` (opcional) es el
 * enlace de Drive de la factura: su línea va justo debajo de Comentarios.
 */
function textoConfirmacion_({ filas, preguntas = [], pregunta = '', corregido = false, foto = '' }) {
  const faltantes = preguntas.map((p) => DATO_POR_PREGUNTA[p]).filter(Boolean);
  const falta = (dato) => faltantes.includes(dato);
  const esDeposito = esDepositoFilas_(filas);
  const datos = esDeposito
    ? datosDepositoConfirmacion_(filas, falta)
    : datosGastoConfirmacion_(filas, falta, preguntas.includes('total'));
  return [
    htmlEscape_(encabezadoConfirmacion_(esDeposito, corregido)),
    ...datos.map(([etiqueta, valor]) => `<b>${etiqueta}:</b> ${htmlEscape_(valor)}`),
    ...(foto ? [lineaFoto_(foto)] : []),
    '',
    htmlEscape_(TEXTO_CIERRE_CONFIRMACION),
    ...(pregunta ? ['', htmlEscape_(pregunta)] : []),
  ].join('\n');
}

/**
 * Lo mínimo para recordar una entrada sin volver a leer la hoja: { tipo, proveedor, monto, fecha }.
 * Se guarda en el REGISTRO de _ESTADO y con eso se arma la pregunta de borrar (texto (e)).
 */
function resumenEntrada_(filas) {
  const fila = filas[0];
  const esDeposito = esDepositoFilas_(filas);
  // Con una fila por factura, GASTO (USD) ya es el total de la entrada.
  const monto = esDeposito ? fila['DEPÓSITO'] : sumaGastos_(filas);
  return {
    tipo: esDeposito ? 'deposito' : 'gasto',
    proveedor: textoCelda_(fila.PROVEEDOR),
    monto: esMonto_(monto) ? monto : null,
    fecha: textoCelda_(fila.FECHA),
  };
}

/** Texto (e): la pregunta antes de borrar; los botones Sí/No van en Registro.js. */
function textoPedirBorrado_(resumen) {
  const que = resumen.tipo === 'deposito' ? 'el depósito' : 'el gasto';
  const proveedor = resumen.proveedor && resumen.proveedor !== MARCA_PENDIENTE ? resumen.proveedor : '';
  const detalles = [
    proveedor ? ` de ${proveedor}` : '',
    esMonto_(resumen.monto) ? ` por ${montoTexto_(resumen.monto)}` : '',
    resumen.fecha ? ` del ${fechaConfirmacion_(resumen.fecha)}` : '',
  ];
  return `¿Segura que quieres borrar ${que}${detalles.join('')}?`;
}

if (typeof module !== 'undefined') {
  module.exports = {
    TEXTO_CIERRE_CONFIRMACION, TEXTO_FALTA, textoConfirmacion_, resumenEntrada_,
    textoPedirBorrado_, fechaConfirmacion_, htmlEscape_,
  };
}
