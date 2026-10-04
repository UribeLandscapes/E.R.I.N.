/**
 * Importación de Excel viejos, lógica pura. Usa CONFIG de Config.js; MESES, COLUMNAS, sinTildes_ y
 * nombrePestanaMes_ de Hoja.js; registrosDePestana_ y conClaves_ de Historial.js;
 * textoSeguroCelda_ de Escritura.js; escaparRegex_ de Clases.js. En Apps Script esos nombres son globales.
 */
const ORIGEN_ARCHIVO = 'ARCHIVO';

/** Mes y año escritos en el nombre del archivo; ambos deben ser palabras/números completos. */
function mesDeArchivo_(nombre) {
  const texto = sinTildes_(nombre).toLowerCase();
  const mes = MESES.findIndex((m) => new RegExp(`(^|[^a-z])${sinTildes_(m)}(?=$|[^a-z])`).test(texto)) + 1;
  const anio = /(?:^|\D)(\d{4})(?!\d)/.exec(texto);
  return mes && anio ? { mes, anio: Number(anio[1]) } : null;
}

/** Solo los meses de CONFIG.HISTORIAL_MESES del año CONFIG.HISTORIAL_ANIO. */
const archivoIncluido_ = (mesAnio) => !!mesAnio && mesAnio.anio === CONFIG.HISTORIAL_ANIO
  && CONFIG.HISTORIAL_MESES.includes(mesAnio.mes);

const nombrePestanaArchivo_ = (anio, mes) => `${nombrePestanaMes_(anio, mes)} (archivo)`;

/** Solo la pestaña de movimientos del mes que dice el archivo. */
function pestanaDeGastos_(libro, mes) {
  const mesTexto = sinTildes_(MESES[mes - 1]).toUpperCase();
  const patron = new RegExp(`^GASTOS ${mesTexto}( \\d{4})?$`);
  return libro.pestanas.find((p) => patron.test(sinTildes_(p.nombre).trim().replace(/\s+/g, ' ').toUpperCase())) || null;
}

// Se prueba primero la secundaria, como siempre; el resultado es la clave interna de la casa.
const ORDEN_CASAS_IMPORTACION = Object.freeze(['SECUNDARIA', 'PRINCIPAL']);

/** ¿La etiqueta de la casa aparece como palabra completa en `texto` (sin tildes, mayúsculas)? */
function etiquetaEnTexto_(casa, texto) {
  const etiqueta = escaparRegex_(sinTildes_(CONFIG.CASAS[casa].etiqueta).toUpperCase()).replace(/\s+/g, '\\s+');
  return new RegExp(`(^|[^A-Z])${etiqueta}(?=$|[^A-Z])`).test(texto);
}

/** Casa (PRINCIPAL/SECUNDARIA) cuya etiqueta de CONFIG.CASAS está escrita en la clase del Excel; '' si ninguna. */
function casaDeClase_(clase) {
  const texto = sinTildes_(clase || '').toUpperCase();
  return ORDEN_CASAS_IMPORTACION.find((casa) => etiquetaEnTexto_(casa, texto)) || '';
}

/** Registros con clave → valores en el orden de las columnas de la hoja del bot. */
function filasImportacion_(registros, registrado) {
  return registros.map((r) => {
    const esDeposito = r.deposito > 0
      && (r.gasto === null || r.gasto === undefined || r.gasto === 0);
    const valores = {
      FECHA: r.fecha, PROVEEDOR: r.proveedor, 'DEPÓSITO': r.deposito ?? '',
      'GASTO (USD)': esDeposito ? '' : r.gasto ?? '', 'CLASE DE GASTO': r.clase,
      COMENTARIOS: r.comentarios ?? '', CASA: casaDeClase_(r.clase),
      TIPO: esDeposito ? 'DEPÓSITO' : 'GASTO',
      ORIGEN: ORIGEN_ARCHIVO, REGISTRADO: registrado, 'ID FILA': r.clave,
    };
    return COLUMNAS.map((columna) => {
      const valor = valores[columna] ?? '';
      return typeof valor === 'string' ? textoSeguroCelda_(valor) : valor;
    });
  });
}

const DECIMALES_TOTAL = 1e6;
/** Total sin el ruido binario de sumar decimales (0.1 + 0.2): 6 decimales, nunca por fila. */
const redondearTotal_ = (v) => Math.round(v * DECIMALES_TOTAL) / DECIMALES_TOTAL;
/** Dos totales son iguales si coinciden hasta el sexto decimal. */
const igualMonto_ = (a, b) => Math.round(a * DECIMALES_TOTAL) === Math.round(b * DECIMALES_TOTAL);
/** Dinero para el registro: hasta 6 decimales sin ceros de sobra y con al menos 2. */
const dineroExacto_ = (v) => {
  const [entero, decimales = ''] = redondearTotal_(v).toFixed(6).split('.');
  return `${entero}.${decimales.replace(/0+$/, '').padEnd(2, '0')}`;
};

/** Suma de los valores exactos del Excel, en el orden de las filas. */
function totalesImportacion_(registros) {
  const suma = (campo) => redondearTotal_(registros.reduce((total, r) => total + (r[campo] ?? 0), 0));
  return { filas: registros.length, depositos: suma('deposito'), gastos: suma('gasto') };
}

/** Selección del archivo y de su única pestaña de gastos, sin efectos externos. */
function planImportacion_(nombreArchivo, libro) {
  const mesAnio = mesDeArchivo_(nombreArchivo);
  if (!mesAnio) return { incluido: false, motivo: 'sin mes', mes: null, anio: null, pestana: null, registros: [] };
  const { mes, anio } = mesAnio;
  if (!archivoIncluido_(mesAnio)) {
    return { incluido: false, motivo: 'no incluido', mes, anio, pestana: null, registros: [] };
  }
  const pestana = pestanaDeGastos_(libro, mes);
  if (!pestana) return { incluido: false, motivo: 'sin pestaña GASTOS', mes, anio, pestana: null, registros: [] };
  return { incluido: true, motivo: '', mes, anio, pestana: pestana.nombre,
    registros: conClaves_(registrosDePestana_(pestana.filas, libro.fecha1904, { exacto: true })) };
}

if (typeof module !== 'undefined') {
  module.exports = {
    ORIGEN_ARCHIVO, mesDeArchivo_, archivoIncluido_, nombrePestanaArchivo_, pestanaDeGastos_,
    casaDeClase_, filasImportacion_, totalesImportacion_, planImportacion_,
    redondearTotal_, igualMonto_, dineroExacto_,
  };
}
