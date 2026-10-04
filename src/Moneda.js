/**
 * Tipo de cambio (pura): qué tasa usar y cómo pasar un monto a USD. No llama a la red:
 * recibe `obtenerJson(url)` (la capa Google le pasa UrlFetchApp). Usa `leerFecha_` de Reglas.js.
 * `obtenerJson` devuelve el JSON, null si la fuente no tiene ese dato (404), o lanza si la fuente está caída.
 */
const MONEDAS_A_LA_PAR = Object.freeze(['USD', 'PAB']); // PAB está a la par con el dólar: sin consulta
const DIAS_ATRAS_TASA = 7;
const FORMA_MONEDA = /^[A-Z]{3}$/;
const DIA_EN_MS = 24 * 60 * 60 * 1000;

function leerFrankfurter_(json, moneda) {
  if (String(json.quote || '').toUpperCase() !== moneda) return null;
  return { tasa: json.rate, fecha: json.date };
}

function leerFawazahmed0_(json, moneda) {
  return { tasa: (json.usd || {})[moneda.toLowerCase()], fecha: json.date };
}

const FUENTES_TASA = Object.freeze([
  {
    fuente: 'frankfurter',
    url: (m, f) => `https://api.frankfurter.dev/v2/rate/usd/${m.toLowerCase()}?date=${f}`,
    leer: leerFrankfurter_,
  },
  {
    fuente: 'jsdelivr',
    url: (m, f) => `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${f}/v1/currencies/usd.min.json`,
    leer: leerFawazahmed0_,
  },
  {
    fuente: 'pages.dev',
    url: (m, f) => `https://${f}.currency-api.pages.dev/v1/currencies/usd.min.json`,
    leer: leerFawazahmed0_,
  },
]);

/** URLs a probar para una moneda y fecha, en orden de preferencia. */
function urlsTasa_(moneda, fecha) {
  return FUENTES_TASA.map((f) => ({ fuente: f.fuente, url: f.url(moneda, fecha), leer: f.leer }));
}

function diasAntes_(fecha, dias) {
  const { anio, mes, dia } = leerFecha_(fecha);
  return new Date(Date.UTC(anio, mes - 1, dia) - dias * DIA_EN_MS).toISOString().slice(0, 10);
}

/** Tasa válida: número > 0 y fecha real que no pase de la pedida. */
function tasaValida_(leida, fechaPedida) {
  if (!leida || typeof leida.tasa !== 'number' || !Number.isFinite(leida.tasa) || leida.tasa <= 0) return false;
  try {
    leerFecha_(leida.fecha);
  } catch (error) {
    return false;
  }
  return leida.fecha <= fechaPedida;
}

/**
 * Tasa USD→moneda para la fecha de la factura, retrocediendo un día a la vez hasta 7 días.
 * Devuelve { tasa, fecha (la de la API), fuente } o null si ninguna fuente la tiene.
 */
function buscarTasa_(moneda, fecha, obtenerJson) {
  if (!FORMA_MONEDA.test(String(moneda || ''))) throw new Error(`moneda inválida: ${moneda}`);
  leerFecha_(fecha);
  if (MONEDAS_A_LA_PAR.includes(moneda)) return { tasa: 1, fecha, fuente: 'fija' };
  const caidas = new Set();
  for (let atras = 0; atras <= DIAS_ATRAS_TASA; atras += 1) {
    const dia = diasAntes_(fecha, atras);
    for (const { fuente, url, leer } of urlsTasa_(moneda, dia)) {
      if (caidas.has(fuente)) continue;
      let json;
      try {
        json = obtenerJson(url);
      } catch (error) {
        caidas.add(fuente); // caída: no insistir con las fechas siguientes
        continue;
      }
      const leida = json && typeof json === 'object' ? leer(json, moneda) : null;
      if (tasaValida_(leida, dia)) return { tasa: leida.tasa, fecha: leida.fecha, fuente };
    }
  }
  return null;
}

/** monto / tasa redondeado a centavos (mismo redondeo para negativos, sin -0). */
function convertirAUsd_(monto, tasa) {
  if (typeof monto !== 'number' || !Number.isFinite(monto)) throw new Error(`monto inválido: ${monto}`);
  if (typeof tasa !== 'number' || !Number.isFinite(tasa) || tasa <= 0) throw new Error(`tasa inválida: ${tasa}`);
  const usd = monto / tasa;
  return (Math.sign(usd) * Math.round(Math.abs(usd) * 100)) / 100 + 0;
}

/** TASA USADA = "tasa (fecha de la API)". */
function textoTasaUsada_({ tasa, fecha }) {
  return `${tasa} (${fecha})`;
}

/** GASTO (USD) y TASA USADA de un monto; sin tasa en ninguna fuente → PENDIENTE en ambos. */
function montoEnUsd_(monto, moneda, fecha, obtenerJson) {
  const tasa = buscarTasa_(moneda, fecha, obtenerJson);
  if (!tasa) return { gastoUsd: 'PENDIENTE', tasaUsada: 'PENDIENTE' };
  return { gastoUsd: convertirAUsd_(monto, tasa.tasa), tasaUsada: textoTasaUsada_(tasa) };
}

/** Celda de monto → centavos. Texto o vacío cuentan 0, igual que SUM en el Sheet. */
const centavosCelda_ = (valor) => (typeof valor === 'number' && Number.isFinite(valor) ? Math.round(valor * 100) : 0);

const netoCentavos_ = (fila) => centavosCelda_(fila.deposito) - centavosCelda_(fila.gasto);

/** "Depósito" / "DEPOSITO" / "depósito " → "DEPOSITO", para que las filas manuales también cuenten. */
const tipoNormalizado_ = (tipo) => String(tipo || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .trim().toUpperCase();

if (typeof module !== 'undefined') {
  module.exports = {
    urlsTasa_, buscarTasa_, convertirAUsd_, textoTasaUsada_, montoEnUsd_,
    centavosCelda_, netoCentavos_, tipoNormalizado_,
  };
}
