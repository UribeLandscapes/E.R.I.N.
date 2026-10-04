/**
 * Celdas editadas a mano, lógica pura: anotación, protección de filas y columnas,
 * choques posteriores y avisos al usuario. Sin servicios de Google: EdicionApp.js y los demás App.js
 * conectan esta lógica con la hoja. Usa COLUMNAS de Hoja.js, ORIGEN_BOT y textoCelda_ de
 * Escritura.js, y ORIGEN_MANUAL de Edicion.js.
 */
const PESTANA_EDICIONES = '_EDICIONES';
const COLUMNAS_EDICIONES = Object.freeze(['FECHA', 'PESTAÑA', 'ID FILA', 'COLUMNAS']);
const COLUMNAS_SISTEMA = Object.freeze(['ID FILA', 'ORIGEN', 'REGISTRADO']);
const PROPIEDAD_EDICIONES_CREADA = 'EDICIONES_CREADA';
const PROPIEDAD_EDICIONES_PERDIDA = 'EDICIONES_PERDIDA';
const SEPARADOR_COLUMNAS = '|';

const TEXTO_NO_BORRO_MANUAL = 'Esa entrada tiene cambios hechos a mano en la hoja, así que no la borro. Si quieres quitarla, bórrala en la hoja.';
const TEXTO_NO_CORRIJO_MANUAL = 'Esa entrada tiene cambios hechos a mano en la hoja, así que no la cambio. Corrígela en la hoja.';

/** Solo filas del bot con identidad anterior al sellado de una edición. */
function esFilaBotAnotable_(valores) {
  const idFila = textoCelda_(valores['ID FILA']);
  return idFila !== '' && !idFila.startsWith(`${ORIGEN_MANUAL}-`)
    && textoCelda_(valores.ORIGEN) === ORIGEN_BOT;
}

/** Columnas válidas, en orden y sin las ocultas del sistema. */
function columnasAnotables_(columnas) {
  return [...new Set(columnas.filter((c) => COLUMNAS.includes(c) && !COLUMNAS_SISTEMA.includes(c)))];
}

/** Una fila de _EDICIONES o null cuando no hay nada anotable. */
function filaEdicion_(fecha, pestana, valores, columnas) {
  if (!esFilaBotAnotable_(valores)) return null;
  const anotables = columnasAnotables_(columnas);
  if (anotables.length === 0) return null;
  return [fecha, pestana, textoCelda_(valores['ID FILA']), anotables.join(SEPARADOR_COLUMNAS)];
}

/** Verifica las primeras cuatro celdas, aunque haya columnas extra. */
function encabezadosEdicionesOk_(fila) {
  return COLUMNAS_EDICIONES.every((columna, i) => textoCelda_(fila[i]) === columna);
}

/** La marca de pérdida tiene prioridad sobre cualquier otro estado. */
function estadoEdiciones_({ creada, perdida, pestanaExiste, encabezadosOk }) {
  if (textoCelda_(perdida) !== '') return 'PERDIDA';
  if (textoCelda_(creada) === '' && !pestanaExiste) return 'ARRANCAR';
  if (textoCelda_(creada) !== '' && pestanaExiste && encabezadosOk) return 'LISTA';
  return 'PERDIDA';
}

/** Sello de un ID BOT completo; no usa REGISTRADO, que puede cambiar. */
function selloDeIdFila_(idFila) {
  const partes = new RegExp(`^${ORIGEN_BOT}-(\\d{8}-\\d{6})-(.+)-(\\d+)$`).exec(idFila);
  return partes ? partes[1] : null;
}

/** El corte tiene la precisión de segundo de FORMATO_SELLO. */
function esCorte_(valor) {
  return /^\d{8}-\d{6}$/.test(valor);
}

/** Agrupa anotaciones por ID. porId es un Map que nadie debe cambiar; freeze no lo cubre. */
function registroEdiciones_({ filas, corte, disponible }) {
  const porId = new Map();
  for (const fila of filas) {
    const idFila = textoCelda_(fila[2]);
    if (idFila === '') continue;
    const anteriores = porId.get(idFila) || [];
    const nuevas = textoCelda_(fila[3]).split(SEPARADOR_COLUMNAS).map((c) => textoCelda_(c));
    porId.set(idFila, [...new Set([...anteriores, ...nuevas.filter((c) => c !== '')])]);
  }
  return Object.freeze({ disponible, corte, porId });
}

/** Una fila vieja, sin identidad o con registro dudoso queda protegida entera. */
function proteccionFila_(registro, idFila) {
  const id = textoCelda_(idFila);
  const sello = selloDeIdFila_(id);
  if (!registro.disponible || !esCorte_(registro.corte) || id === ''
    || id.startsWith(`${ORIGEN_MANUAL}-`) || sello === null || sello <= registro.corte) {
    return { entera: true, columnas: [] };
  }
  return { entera: false, columnas: [...(registro.porId.get(id) || [])] };
}

/** Una entrada se protege si alguna fila tiene anotaciones o protección entera. */
function tieneEdicionesManuales_(registro, idFilas) {
  return idFilas.some((idFila) => {
    const proteccion = proteccionFila_(registro, idFila);
    return proteccion.entera || proteccion.columnas.length > 0;
  });
}

/** Separar lo escribible de las columnas visibles editadas a mano. */
function filtrarCambiosManuales_(registro, idFila, cambios, actuales) {
  const proteccion = proteccionFila_(registro, idFila);
  const escribir = {};
  const saltadas = [];
  for (const columna of Object.keys(cambios)) {
    if (COLUMNAS_SISTEMA.includes(columna)) {
      if (textoCelda_(actuales[columna]) === '') escribir[columna] = cambios[columna];
    } else if (proteccion.entera || proteccion.columnas.includes(columna)) {
      saltadas.push(columna);
    } else {
      escribir[columna] = cambios[columna];
    }
  }
  return { escribir, saltadas };
}

/** REVISAR solo se ajusta en una fila BOT nueva y libre. */
function puedeCambiarRevisar_(registro, valoresAntes, columnasEditadas) {
  if (!esFilaBotAnotable_(valoresAntes) || columnasEditadas.includes('REVISAR')) return false;
  const proteccion = proteccionFila_(registro, valoresAntes['ID FILA']);
  return !proteccion.entera && !proteccion.columnas.includes('REVISAR');
}

/** Celdas escritas que recibieron una anotación posterior a la lectura. */
function choquesPosteriores_(filas, desde, escritos) {
  const choques = [];
  const vistos = new Set();
  for (const fila of filas) {
    const fecha = fila[0];
    if (fecha instanceof Date && !Number.isNaN(fecha.getTime()) && fecha <= desde) continue;
    const pestana = textoCelda_(fila[1]);
    const idFila = textoCelda_(fila[2]);
    const columnas = textoCelda_(fila[3]).split(SEPARADOR_COLUMNAS).map((c) => textoCelda_(c));
    for (const escrito of escritos) {
      if (escrito.pestana !== pestana || escrito.idFila !== idFila) continue;
      for (const columna of columnas) {
        const clave = JSON.stringify([pestana, idFila, columna]);
        if (!escrito.columnas.includes(columna) || vistos.has(clave)) continue;
        vistos.add(clave);
        choques.push({ pestana, idFila, columna });
      }
    }
  }
  return choques;
}

/** Aviso gramatical al saltar una o más columnas editadas a mano. */
function textoColumnasSaltadas_(columnas) {
  if (columnas.length === 0) return '';
  const nombres = columnas.length === 1 ? columnas[0]
    : `${columnas.slice(0, -1).join(', ')} y ${columnas[columnas.length - 1]}`;
  const verbo = columnas.length === 1 ? 'la editaron' : 'las editaron';
  return `Anoté lo demás, pero no cambié ${nombres}: ${verbo} a mano en la hoja.`;
}

/** Aviso cuando la respuesta no pudo escribir ninguna columna. */
function textoNadaCambiado_(columnas) {
  const nombres = columnas.length === 1 ? columnas[0]
    : `${columnas.slice(0, -1).join(', ')} y ${columnas[columnas.length - 1]}`;
  const verbo = columnas.length === 1 ? 'la editaron' : 'las editaron';
  return `No cambié ${nombres}: ${verbo} a mano en la hoja.`;
}

/** Texto de registro cuando una anotación pudo cruzarse con la escritura. */
function textoChoque_({ pestana, idFila, columna }) {
  return `posible choque con edición a mano: ${pestana} ${idFila} ${columna}`;
}

if (typeof module !== 'undefined') {
  module.exports = {
    PESTANA_EDICIONES, COLUMNAS_EDICIONES, COLUMNAS_SISTEMA,
    PROPIEDAD_EDICIONES_CREADA, PROPIEDAD_EDICIONES_PERDIDA, SEPARADOR_COLUMNAS,
    esFilaBotAnotable_, columnasAnotables_, filaEdicion_, encabezadosEdicionesOk_,
    estadoEdiciones_, selloDeIdFila_, esCorte_, registroEdiciones_, proteccionFila_,
    tieneEdicionesManuales_, filtrarCambiosManuales_, puedeCambiarRevisar_, choquesPosteriores_,
    TEXTO_NO_BORRO_MANUAL, TEXTO_NO_CORRIJO_MANUAL, textoColumnasSaltadas_, textoNadaCambiado_, textoChoque_,
  };
}
