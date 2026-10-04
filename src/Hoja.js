/**
 * Estructura del Sheet, lógica pura: columnas, nombre y orden de las pestañas de mes,
 * fórmulas del resumen, GRUPO, formato condicional.
 * Las fórmulas van en inglés y con comas: setFormula no acepta la sintaxis local de la hoja.
 */
const MESES = Object.freeze(['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']);
// CASA: PRINCIPAL, SECUNDARIA o COMPARTIDO; separa costos entre las dos casas (nombres en CONFIG.CASAS).
// Una fila por factura (plan de una fila): ARTÍCULOS, DESCUENTOS (positivos, se restan), ITBMS y
// OTROS CARGOS son el desglose y van justo antes de GASTO (USD), que es su suma.
const COLUMNAS_VISIBLES = Object.freeze([
  'FECHA', 'ID FACTURA', 'PROVEEDOR', 'DESCRIPCIÓN', 'DEPÓSITO', 'ARTÍCULOS', 'DESCUENTOS',
  'ITBMS', 'OTROS CARGOS', 'GASTO (USD)', 'MONEDA', 'MONTO ORIGINAL', 'TASA USADA',
  'FORMA DE PAGO', 'CLASE DE GASTO', 'COMENTARIOS', 'FOTO', 'REVISAR', 'CASA',
]);
// TIPO (oculta): GASTO, DEPÓSITO, SALDO INICIAL o AJUSTE; reemplaza a la vieja TIPO LÍNEA.
const COLUMNAS_OCULTAS = Object.freeze(['ID FILA', 'ORIGEN', 'REGISTRADO', 'ID MENSAJE TG',
  'TIPO', 'GRUPO']);
const COLUMNAS = Object.freeze([...COLUMNAS_VISIBLES, ...COLUMNAS_OCULTAS]);

const FILA_TITULO = 1;
const FILA_ETIQUETAS_RESUMEN = 2;
const FILA_RESUMEN = 3;
const FILA_ENCABEZADOS = 5;
const PRIMERA_FILA_DATOS = 6;

const ETIQUETAS_RESUMEN = Object.freeze(['SALDO INICIAL DEL MES', 'DEPÓSITOS', 'GASTOS', 'AJUSTES',
  'SALDO FINAL', 'PENDIENTES']);

const COLORES = Object.freeze({
  CACAO: '#6B4A34',
  CREMA: '#F6F0E4',
  SALVIA_CLARO: '#E5E8E2', // Salvia #7C8C6E mezclada 80% con blanco
  TERRACOTA: '#D9A38A',
  MUSGO: '#3A3F30',
});

const COLUMNAS_ESTADO = Object.freeze(['CREADO', 'TIPO', 'CLAVE', 'ID FILAS', 'DATOS', 'ESTADO']);
const COLUMNAS_HISTORIAL = Object.freeze(['FECHA', 'PROVEEDOR', 'CLASE DE GASTO', 'DEPÓSITO', 'GASTO',
  'ARCHIVO', 'PESTAÑA', 'CLAVE']);

/** 1 → "A", 22 → "V", 27 → "AA". */
function letraColumna_(numero) {
  if (!Number.isInteger(numero) || numero < 1) throw new Error(`columna inválida: ${numero}`);
  let resto = numero;
  let letras = '';
  while (resto > 0) {
    const m = (resto - 1) % 26;
    letras = String.fromCharCode(65 + m) + letras;
    resto = (resto - 1 - m) / 26;
  }
  return letras;
}

/** "GASTO (USD)" → 10 (1 = A). */
function numeroColumna_(nombre) {
  const i = COLUMNAS.indexOf(nombre);
  if (i < 0) throw new Error(`columna desconocida: ${nombre}`);
  return i + 1;
}

const letra_ = (nombre) => letraColumna_(numeroColumna_(nombre));
/** "B6:B": columna entera desde la primera fila de datos. */
const datos_ = (nombre) => `${letra_(nombre)}${PRIMERA_FILA_DATOS}:${letra_(nombre)}`;

const sinTildes_ = (texto) => String(texto).normalize('NFD').replace(/[̀-ͯ]/g, '');

/** (2026, 9) → "Septiembre 2026". */
function nombrePestanaMes_(anio, mes) {
  if (!Number.isInteger(anio) || !Number.isInteger(mes) || mes < 1 || mes > 12) {
    throw new Error(`mes inválido: ${anio}-${mes}`);
  }
  const nombre = MESES[mes - 1];
  return `${nombre[0].toUpperCase()}${nombre.slice(1)} ${anio}`;
}

/** "Septiembre 2026" (sin importar mayúsculas ni tildes) → { anio, mes }; otra cosa → null. */
function leerPestanaMes_(nombre) {
  const partes = /^\s*(\S+)\s+(\d{4})\s*$/.exec(sinTildes_(nombre).toLowerCase());
  if (!partes) return null;
  const mes = MESES.findIndex((m) => sinTildes_(m) === partes[1]) + 1;
  return mes > 0 ? { anio: Number(partes[2]), mes } : null;
}

/** 'Agosto 2026' → "'Agosto 2026'" para usar en una fórmula (el apóstrofo se duplica). */
const referenciaPestana_ = (nombre) => `'${String(nombre).replace(/'/g, "''")}'`;

/**
 * Dónde va la pestaña del mes entre las que ya existen (en su orden actual).
 * Devuelve { indice (0 = primera), anterior, siguiente } con los nombres de las pestañas de
 * mes vecinas, o error si ya existe.
 */
function posicionPestanaMes_(nombresPestanas, anio, mes) {
  const clave = anio * 12 + mes;
  let anterior = null;
  let siguiente = null;
  nombresPestanas.forEach((nombre, indice) => {
    const m = leerPestanaMes_(nombre);
    if (!m) return;
    const k = m.anio * 12 + m.mes;
    if (k === clave) throw new Error(`la pestaña ${nombre} ya existe`);
    if (k < clave && (!anterior || k > anterior.k)) anterior = { nombre, indice, k };
    if (k > clave && (!siguiente || k < siguiente.k)) siguiente = { nombre, indice, k };
  });
  let indice = 0;
  if (siguiente) indice = siguiente.indice;
  else if (anterior) indice = anterior.indice + 1;
  return {
    indice,
    anterior: anterior ? anterior.nombre : null,
    siguiente: siguiente ? siguiente.nombre : null,
  };
}

const celdaResumen_ = (etiqueta) => `${letraColumna_(ETIQUETAS_RESUMEN.indexOf(etiqueta) + 1)}${FILA_RESUMEN}`;

/** SALDO INICIAL DEL MES: SALDO FINAL de la pestaña anterior, o 0 si es la primera. */
function formulaSaldoInicialMes_(anterior) {
  return anterior ? `=${referenciaPestana_(anterior)}!${celdaResumen_('SALDO FINAL')}` : '=0';
}

/**
 * Fórmulas de la fila 3, en el orden de ETIQUETAS_RESUMEN. Las filas AJUSTE van aparte de
 * depósitos y gastos; SALDO FINAL = inicial + depósitos − gastos + ajustes.
 */
function formulasResumen_(anterior) {
  const tipo = datos_('TIPO');
  const deposito = datos_('DEPÓSITO');
  const gasto = datos_('GASTO (USD)');
  const [ini, dep, gas, aju] = ETIQUETAS_RESUMEN.slice(0, 4).map(celdaResumen_);
  const visibles = `A${PRIMERA_FILA_DATOS}:${letraColumna_(COLUMNAS_VISIBLES.length)}`;
  return [
    formulaSaldoInicialMes_(anterior),
    `=SUMIFS(${deposito},${tipo},"<>AJUSTE")`,
    `=SUMIFS(${gasto},${tipo},"<>AJUSTE")`,
    `=SUMIFS(${deposito},${tipo},"AJUSTE")-SUMIFS(${gasto},${tipo},"AJUSTE")`,
    `=${ini}+${dep}-${gas}+${aju}`,
    `=COUNTIF(BYROW(${visibles},LAMBDA(fila,COUNTIF(fila,"*PENDIENTE*"))),">0")`,
  ];
}

/**
 * Encabezado de GRUPO: 1 y 0 alternados por ID FACTURA en orden de aparición (colores). Con una
 * fila por factura alterna fila por fila, y es el único desborde de fórmula que queda.
 */
function formulaGrupo_() {
  const ids = datos_('ID FACTURA');
  return `=VSTACK("GRUPO",LET(ids,${ids},unicos,IFERROR(UNIQUE(FILTER(ids,ids<>"")),""),`
    + 'MAP(ids,LAMBDA(id,IF(id="","",MOD(MATCH(id,unicos,0),2))))))';
}

/**
 * Formato condicional de una pestaña de mes, en orden de prioridad (gana la primera regla).
 * `rango` en A1; las fórmulas usan la primera fila de datos como referencia relativa.
 */
function reglasFormato_() {
  const f = PRIMERA_FILA_DATOS;
  const visibles = `A${f}:${letraColumna_(COLUMNAS_VISIBLES.length)}`;
  const grupo = letra_('GRUPO');
  // El descuadre entre el desglose y el total impreso ya se marca en REVISAR (P2), así que no
  // hace falta una regla de color aparte.
  return [
    { nombre: 'pendiente', rango: visibles, formula: `=COUNTIF($A${f}:$${letraColumna_(COLUMNAS_VISIBLES.length)}${f},"*PENDIENTE*")>0`, fondo: COLORES.TERRACOTA },
    { nombre: 'grupo impar', rango: visibles, formula: `=$${grupo}${f}=1`, fondo: COLORES.CREMA },
    { nombre: 'grupo par', rango: visibles, formula: `=AND($${grupo}${f}<>"",$${grupo}${f}=0)`, fondo: COLORES.SALVIA_CLARO },
  ];
}

/** Formatos de número por columna: [nombre, patrón]. */
const FORMATOS_NUMERO = Object.freeze([
  ['FECHA', 'yyyy-mm-dd'], ['DEPÓSITO', '#,##0.00'], ['ARTÍCULOS', '#,##0.00'],
  ['DESCUENTOS', '#,##0.00'], ['ITBMS', '#,##0.00'], ['OTROS CARGOS', '#,##0.00'],
  ['GASTO (USD)', '#,##0.00'], ['MONTO ORIGINAL', '#,##0.00'],
  ['REGISTRADO', 'yyyy-mm-dd hh:mm:ss'],
]);

if (typeof module !== 'undefined') {
  module.exports = {
    MESES, COLUMNAS, COLUMNAS_VISIBLES, COLUMNAS_OCULTAS, COLUMNAS_ESTADO, COLUMNAS_HISTORIAL, COLORES,
    ETIQUETAS_RESUMEN, FILA_TITULO, FILA_ETIQUETAS_RESUMEN, FILA_RESUMEN, FILA_ENCABEZADOS,
    PRIMERA_FILA_DATOS, FORMATOS_NUMERO, letraColumna_, numeroColumna_, nombrePestanaMes_,
    leerPestanaMes_, referenciaPestana_, posicionPestanaMes_, formulaSaldoInicialMes_,
    formulasResumen_, formulaGrupo_, reglasFormato_, letra_, datos_, sinTildes_,
  };
}
