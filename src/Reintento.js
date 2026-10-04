/**
 * Lógica pura del reintento de Gemini y del modo preguntas: qué le sigue
 * faltando a una foto POR-PROCESAR, qué de eso todavía no se le ha preguntado al usuario, y cuándo un
 * texto suyo es de verdad la respuesta de "¿A quién le pagaste en esa foto?". Aquí no se llama a
 * ningún servicio de Google: el cableado es de ReintentoApp.js.
 * Usa MARCA_PENDIENTE de Texto.js y textoCelda_ de Escritura.js.
 */
// Lo que el modo preguntas puede pedir. La CLASE DE GASTO no se pregunta: sale del proveedor
// (claseInferidaProveedor_) o se queda en PENDIENTE para editarla en la hoja.
const CAMPO_TOTAL = 'total';
const CAMPO_PROVEEDOR = 'proveedor';
const CAMPO_PAGO = 'pago';
const COLUMNA_DE_CAMPO = Object.freeze({ [CAMPO_PROVEEDOR]: 'PROVEEDOR', [CAMPO_PAGO]: 'FORMA DE PAGO' });

// Un nombre de comercio no pasa de esto; más largo ya es una frase (un gasto nuevo, por ejemplo).
const LARGO_TEXTO_PROVEEDOR = 60;
// Señales de que el texto es un gasto y no un nombre: un monto con decimales o una moneda escrita.
// "Super 99" sigue siendo un proveedor válido: el entero suelto no cuenta.
const MONTO_CON_DECIMALES = /(?<![\w.,\-/])\d+[.,]\d{1,2}(?![\w\-/])/;
const MONEDA_ESCRITA = /B\s*\/|\$|\bUSD\b/i;

/**
 * Qué le falta todavía a una foto POR-PROCESAR: el total mientras no haya fila escrita y, con la
 * fila ya escrita, el proveedor y la forma de pago que sigan diciendo PENDIENTE en la hoja.
 * `valores` es la fila tal como está (columna → valor).
 */
function pendientesPorProcesar_(entrada, valores) {
  if (!entrada || !entrada.idFilas || !entrada.idFilas.length) return [CAMPO_TOTAL];
  return [CAMPO_PROVEEDOR, CAMPO_PAGO]
    .filter((campo) => textoCelda_((valores || {})[COLUMNA_DE_CAMPO[campo]]) === MARCA_PENDIENTE);
}

/** De lo que falta, lo que todavía no se le ha preguntado al usuario (no se repite ninguna pregunta). */
const porPreguntar_ = (pendientes, preguntado) => (pendientes || [])
  .filter((campo) => !(preguntado || []).includes(campo));

/**
 * true si ese texto se puede tomar como la respuesta de "¿A quién le pagaste en esa foto?": un
 * nombre corto, sin montos con decimales ni monedas escritas. Ante la duda devuelve false y el
 * mensaje sigue el camino normal (Gemini), que es lo conservador: nunca se traga un gasto nuevo.
 */
function pareceProveedorEscrito_(texto) {
  const limpio = typeof texto === 'string' ? texto.trim() : '';
  if (!limpio || limpio.length > LARGO_TEXTO_PROVEEDOR) return false;
  return !MONTO_CON_DECIMALES.test(limpio) && !MONEDA_ESCRITA.test(limpio);
}

if (typeof module !== 'undefined') {
  module.exports = {
    CAMPO_TOTAL, CAMPO_PROVEEDOR, CAMPO_PAGO, COLUMNA_DE_CAMPO, LARGO_TEXTO_PROVEEDOR,
    pendientesPorProcesar_, porPreguntar_, pareceProveedorEscrito_,
  };
}
