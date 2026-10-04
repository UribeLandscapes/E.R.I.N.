/**
 * Reglas puras de la caja chica (sin servicios de Google): proveedor, ID FACTURA,
 * semana Wn y cuadre. Se prueban en Node.
 */
const LARGO_MAX_PROVEEDOR = 15;
const TOLERANCIA_CENTAVOS = 1; // 0.01
const FORMA_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "Riba Smith" → "RIBASMITH": mayúsculas, sin tildes, solo A-Z y 0-9, máximo 15. */
function normalizarProveedor_(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, LARGO_MAX_PROVEEDOR);
}

/** "super 99" → "Super 99"; cada palabra separada por espacios con su inicial en mayúscula. */
const conMayusculaPorPalabra_ = (texto) => texto
  .split(' ')
  .map((palabra) => (palabra ? `${palabra[0].toUpperCase()}${palabra.slice(1)}` : palabra))
  .join(' ');

/**
 * Cómo escribir un proveedor nuevo: la ortografía más frecuente entre las
 * filas del historial que normalizan igual (empate → la primera vista); sin historial, mayúscula
 * inicial por palabra si el usuario lo escribió todo en minúsculas, o tal cual si usó alguna mayúscula.
 * 'PENDIENTE' y vacío nunca cambian.
 */
function ortografiaProveedor_(historial, escrito) {
  const texto = String(escrito || '');
  if (!texto || texto === 'PENDIENTE') return texto;
  const normalizado = normalizarProveedor_(texto);
  const conteo = new Map();
  (historial || []).forEach(({ proveedor }) => {
    if (proveedor && normalizarProveedor_(proveedor) === normalizado) {
      conteo.set(proveedor, (conteo.get(proveedor) || 0) + 1);
    }
  });
  if (conteo.size) {
    let mejor = null;
    for (const [nombre, veces] of conteo) {
      if (!mejor || veces > conteo.get(mejor)) mejor = nombre;
    }
    return mejor;
  }
  return texto === texto.toLowerCase() ? conMayusculaPorPalabra_(texto) : texto;
}

/** "AAAA-MM-DD" → { anio, mes, dia } o error si no es una fecha real. */
function leerFecha_(fecha) {
  const partes = FORMA_FECHA.exec(String(fecha || ''));
  if (!partes) throw new Error(`fecha inválida: ${fecha}`);
  const [anio, mes, dia] = partes.slice(1).map(Number);
  const real = new Date(Date.UTC(anio, mes - 1, dia));
  if (real.getUTCMonth() !== mes - 1 || real.getUTCDate() !== dia) throw new Error(`fecha inválida: ${fecha}`);
  return { anio, mes, dia };
}

/** PROVEEDOR-AAAAMMDD, con -2, -3… si ya existe en el archivo. */
function idFactura_(proveedor, fecha, idsExistentes) {
  const prefijo = normalizarProveedor_(proveedor);
  if (!prefijo) throw new Error('proveedor vacío');
  leerFecha_(fecha);
  const base = `${prefijo}-${fecha.replace(/-/g, '')}`;
  const usados = new Set(idsExistentes);
  if (!usados.has(base)) return base;
  let n = 2;
  while (usados.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

/** Wn: W1 es la semana (lunes a domingo) que contiene el día 1 del mes. */
function semanaDelMes_(fecha) {
  const { anio, mes, dia } = leerFecha_(fecha);
  const diaSemanaDel1 = (new Date(Date.UTC(anio, mes - 1, 1)).getUTCDay() + 6) % 7; // lunes = 0
  return Math.floor((dia - 1 + diaSemanaDel1) / 7) + 1;
}

/** true si dos fechas AAAA-MM-DD válidas caen en meses (o años) distintos. */
function mesDistinto_(fechaA, fechaB) {
  const a = leerFecha_(fechaA);
  const b = leerFecha_(fechaB);
  return a.anio !== b.anio || a.mes !== b.mes;
}

const aCentavos_ = (monto) => Math.round(monto * 100);

/**
 * Suma de las partes del desglose (artículos, descuentos en negativo, ITBMS y otros cargos)
 * contra el total impreso de la factura, con tolerancia de 0.01.
 */
function cuadre_(montos, total) {
  const numeros = [...montos, total];
  if (montos.length === 0 || !numeros.every((m) => typeof m === 'number' && Number.isFinite(m))) {
    return { cuadra: false, suma: null, diferencia: null };
  }
  const suma = montos.reduce((acumulado, m) => acumulado + aCentavos_(m), 0);
  const diferencia = suma - aCentavos_(total);
  return {
    cuadra: Math.abs(diferencia) <= TOLERANCIA_CENTAVOS,
    suma: suma / 100,
    diferencia: diferencia / 100,
  };
}

if (typeof module !== 'undefined') {
  module.exports = {
    normalizarProveedor_, ortografiaProveedor_, leerFecha_, idFactura_, semanaDelMes_, cuadre_, mesDistinto_,
  };
}
