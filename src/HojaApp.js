/**
 * Capa SpreadsheetApp: crea la pestaña del mes, _ESTADO y _HISTORIAL con el formato
 * de marca. La estructura (columnas, fórmulas, reglas) sale de Hoja.js; aquí solo se aplica.
 * El bot nunca escribe en GRUPO (Y): es el desborde de la fórmula del encabezado.
 * La migración de una fila por factura usa ORIGEN_BOT, PREGUNTA_ABIERTA y leerDatosEstado_ de
 * Escritura.js; PREGUNTA_CERRADA y celdaEstado_ de EscrituraApp.js (globales en Apps Script).
 * Las pestañas internas (_ESTADO, _HISTORIAL, _EDICIONES) nacen protegidas y solo el
 * dueño las edita; PESTANA_EDICIONES viene de Ediciones.js.
 */
const PESTANA_ESTADO = '_ESTADO';
const PESTANA_HISTORIAL = '_HISTORIAL';
const FUENTE_TITULO = 'Lora';
const FUENTE_DATOS = 'Poppins';
const TAMANO_TITULO = 16;
// Poppins Medium no se puede elegir desde Apps Script (solo normal o negrita).
const PESO_ENCABEZADO = 'bold';
const DESCRIPCION_PROTECCION_INTERNA = 'ERIN-PESTANA-INTERNA-v1';
const COLUMNAS_PROTEGIDAS = Object.freeze(['GRUPO']);

/** Título, resumen y encabezados de una pestaña de mes recién creada. */
function escribirCabeceraMes_(hoja, nombre, anterior) {
  const ultimaVisible = letraColumna_(COLUMNAS_VISIBLES.length);
  const ultima = letraColumna_(COLUMNAS.length);
  hoja.getRange(`A${FILA_TITULO}:${ultimaVisible}${FILA_TITULO}`).merge()
    .setValue(`Caja chica · ${nombre}`)
    .setFontFamily(FUENTE_TITULO).setFontStyle('italic').setFontSize(TAMANO_TITULO)
    .setFontColor(COLORES.CACAO).setBackground(COLORES.CREMA);

  const finResumen = letraColumna_(ETIQUETAS_RESUMEN.length);
  hoja.getRange(`A${FILA_ETIQUETAS_RESUMEN}:${finResumen}${FILA_ETIQUETAS_RESUMEN}`)
    .setValues([[...ETIQUETAS_RESUMEN]]).setFontWeight('bold');
  hoja.getRange(`A${FILA_RESUMEN}:${finResumen}${FILA_RESUMEN}`).setFormulas([formulasResumen_(anterior)]);
  hoja.getRange(`A${FILA_RESUMEN}:${letraColumna_(ETIQUETAS_RESUMEN.length - 1)}${FILA_RESUMEN}`)
    .setNumberFormat('#,##0.00');
  hoja.getRange(`A${FILA_ETIQUETAS_RESUMEN}:${finResumen}${FILA_RESUMEN}`)
    .setFontFamily(FUENTE_DATOS).setFontColor(COLORES.MUSGO);

  hoja.getRange(`A${FILA_ENCABEZADOS}:${ultima}${FILA_ENCABEZADOS}`).setValues([[...COLUMNAS]])
    .setBackground(COLORES.CACAO).setFontColor(COLORES.CREMA)
    .setFontFamily(FUENTE_DATOS).setFontWeight(PESO_ENCABEZADO);
  hoja.getRange(`${letra_('GRUPO')}${FILA_ENCABEZADOS}`).setFormula(formulaGrupo_());
}

/** Texto exacto que ponemos en la protección de una columna automática (para reconocerla luego). */
const descripcionProteccion_ = (nombre) => `${nombre}: fórmula automática, no escribir aquí`;

/**
 * Quita las protecciones de rango que este código puso antes (mismo texto de descripción), para
 * no dejar una protección repetida al volver a llamar darFormatoMes_ (p. ej. la migración de
 * CASA). No toca ninguna otra protección que exista en la pestaña.
 */
function quitarProteccionesAutomaticas_(hoja) {
  const descripciones = new Set(COLUMNAS_PROTEGIDAS.map(descripcionProteccion_));
  hoja.getProtections(SpreadsheetApp.ProtectionType.RANGE)
    .filter((p) => descripciones.has(p.getDescription()))
    .forEach((p) => p.remove());
}

/** Fuente y formatos de los datos, filas congeladas, columnas ocultas, colores y protección. */
function darFormatoMes_(hoja) {
  hoja.getRange(`A${PRIMERA_FILA_DATOS}:${letraColumna_(COLUMNAS.length)}`)
    .setFontFamily(FUENTE_DATOS).setFontColor(COLORES.MUSGO);
  FORMATOS_NUMERO.forEach(([nombre, patron]) => hoja.getRange(datos_(nombre)).setNumberFormat(patron));
  hoja.setFrozenRows(FILA_ENCABEZADOS);
  hoja.hideColumns(COLUMNAS_VISIBLES.length + 1, COLUMNAS_OCULTAS.length);
  hoja.setConditionalFormatRules(reglasFormato_().map((r) => construirRegla_(hoja, r)));
  quitarProteccionesAutomaticas_(hoja);
  COLUMNAS_PROTEGIDAS.forEach((nombre) => {
    const letra = letra_(nombre);
    hoja.getRange(`${letra}${FILA_ENCABEZADOS}:${letra}`).protect()
      .setDescription(descripcionProteccion_(nombre))
      .setWarningOnly(true);
  });
}

function construirRegla_(hoja, regla) {
  let b = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied(regla.formula)
    .setBackground(regla.fondo)
    .setRanges([hoja.getRange(regla.rango)]);
  if (regla.negrita) b = b.setBold(true);
  return b.build();
}

/**
 * Crea la pestaña del mes en su lugar cronológico. Si ya hay un mes posterior, su A3 (SALDO
 * INICIAL DEL MES) pasa a apuntar a la pestaña nueva SOLO si hoy está encadenada al mes anterior
 * (fórmula igual a la del anterior real). Un número literal (p. ej. el 0 de septiembre) u otra
 * fórmula no se toca: reescribirla dejaba #REF! al borrar la pestaña nueva. Devuelve { nombre,
 * indice, anterior, siguiente }.
 */
function crearPestanaMes_(ss, anio, mes) {
  const nombre = nombrePestanaMes_(anio, mes);
  const pos = posicionPestanaMes_(ss.getSheets().map((h) => h.getName()), anio, mes);
  const hoja = ss.insertSheet(nombre, pos.indice);
  escribirCabeceraMes_(hoja, nombre, pos.anterior);
  darFormatoMes_(hoja);
  reencadenarSiguiente_(ss, pos, nombre);
  return { nombre, ...pos };
}

/** Apunta el A3 del mes siguiente a la pestaña nueva, solo si estaba encadenado al mes anterior. */
function reencadenarSiguiente_(ss, pos, nombre) {
  if (!pos.siguiente || !pos.anterior) return;
  const celda = ss.getSheetByName(pos.siguiente).getRange(`A${FILA_RESUMEN}`);
  if (celda.getFormula() !== formulaSaldoInicialMes_(pos.anterior)) return;
  celda.setFormula(formulaSaldoInicialMes_(nombre));
}

/** Crea una pestaña oculta con encabezados en la fila 1 (congelada). */
function crearPestanaOculta_(ss, nombre, columnas) {
  const hoja = ss.insertSheet(nombre, ss.getSheets().length);
  hoja.getRange(1, 1, 1, columnas.length).setValues([[...columnas]]).setFontWeight('bold');
  hoja.setFrozenRows(1);
  hoja.hideSheet();
  protegerPestanaInterna_(hoja);
}

/**
 * Deja la pestaña protegida para que solo el dueño la edite. Reutiliza la protección con nuestra
 * descripción (nunca apila otra) y en cada corrida vuelve a quitar editores y endurece el aviso.
 * Devuelve 'protegida' (nueva) o 'ya protegida'.
 */
function protegerPestanaInterna_(hoja) {
  const existente = hoja.getProtections(SpreadsheetApp.ProtectionType.SHEET)
    .find((p) => p.getDescription() === DESCRIPCION_PROTECCION_INTERNA);
  const proteccion = existente || hoja.protect().setDescription(DESCRIPCION_PROTECCION_INTERNA);
  if (proteccion.isWarningOnly()) proteccion.setWarningOnly(false);
  proteccion.removeEditors(proteccion.getEditors());
  if (proteccion.canDomainEdit()) proteccion.setDomainEdit(false);
  return existente ? 'ya protegida' : 'protegida';
}

/** Protege las pestañas internas que existan; las que faltan nacerán protegidas. Devuelve las líneas. */
function protegerPestanasInternas_(ss) {
  return [PESTANA_ESTADO, PESTANA_HISTORIAL, PESTANA_EDICIONES].map((nombre) => {
    const hoja = ss.getSheetByName(nombre);
    return hoja
      ? `${nombre}: ${protegerPestanaInterna_(hoja)}`
      : `${nombre}: no existe, se protegerá al crearla`;
  });
}

/** Ejecutar desde el editor: protege _ESTADO, _HISTORIAL y _EDICIONES. */
function protegerPestanasInternas() {
  const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  const lineas = protegerPestanasInternas_(ss);
  lineas.forEach((linea) => Logger.log(linea));
  return lineas;
}

/** "2026-9" (lo que da Utilities.formatDate con 'yyyy-M') → { anio, mes }. */
function leerAnioMes_(texto) {
  const [anio, mes] = String(texto).split('-').map(Number);
  return { anio, mes };
}

/**
 * Pasos que faltan en la hoja: pestaña del mes actual, _ESTADO, _HISTORIAL. Nunca toca otras
 * pestañas existentes; correrla dos veces no cambia nada. Devuelve las líneas del registro.
 */
function configurarHoja_(ss, anio, mes) {
  const nombres = ss.getSheets().map((h) => h.getName());
  const lineas = [];
  const mesExiste = nombres.some((n) => {
    const m = leerPestanaMes_(n);
    return m !== null && m.anio === anio && m.mes === mes;
  });
  if (mesExiste) {
    lineas.push(`${nombrePestanaMes_(anio, mes)}: ya existe, sin cambios`);
  } else {
    const r = crearPestanaMes_(ss, anio, mes);
    lineas.push(`${r.nombre}: creada en la posición ${r.indice + 1}`
      + `${r.anterior ? `, saldo inicial desde ${r.anterior}` : ', saldo inicial 0'}`);
    if (r.siguiente) lineas.push(`${r.siguiente}: saldo inicial ahora sale de ${r.nombre}`);
  }
  [[PESTANA_ESTADO, COLUMNAS_ESTADO], [PESTANA_HISTORIAL, COLUMNAS_HISTORIAL]].forEach(([nombre, columnas]) => {
    if (nombres.includes(nombre)) {
      lineas.push(`${nombre}: ya existe, sin cambios`);
    } else {
      crearPestanaOculta_(ss, nombre, columnas);
      lineas.push(`${nombre}: creada y oculta`);
    }
  });
  return lineas;
}

/** Ejecutar desde el editor (del plan). */
function configurarHoja() {
  const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  const { anio, mes } = leerAnioMes_(Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-M'));
  const lineas = configurarHoja_(ss, anio, mes);
  lineas.forEach((linea) => Logger.log(linea));
  return lineas;
}

/**
 * Filas de datos tal como están AHORA, antes de insertar CASA (ancho = COLUMNAS.length - 1, la
 * columna todavía no existe). Igual que filasDatos_ de EscrituraApp.js pero con getMaxRows: el
 * desborde de GRUPO (VSTACK/MAP) suele llegar hasta el fondo de la hoja real, no
 * solo hasta la última fila con datos.
 */
function filasSinCasaTodavia_(hoja) {
  const cuantas = hoja.getMaxRows() - PRIMERA_FILA_DATOS + 1;
  if (cuantas < 1) return [];
  return hoja.getRange(PRIMERA_FILA_DATOS, 1, cuantas, COLUMNAS.length - 1).getValues();
}

/**
 * CASA para cada fila ya existente: COMPARTIDO donde ya hay algo escrito, vacío donde la fila
 * está libre para que filaEsLibre_ la siga viendo libre después de la migración; si
 * no, el bot escribiría siempre al final en vez de reusar esas filas. `fila` viene con el ancho
 * de antes de insertar CASA, así que se le mete un hueco vacío en su posición antes de preguntar.
 */
function valoresCasaExistente_(hoja, posicionCasa) {
  return filasSinCasaTodavia_(hoja).map((fila) => {
    const conHuecoCasa = [...fila.slice(0, posicionCasa - 1), '', ...fila.slice(posicionCasa - 1)];
    return [filaEsLibre_(conHuecoCasa) ? '' : 'COMPARTIDO'];
  });
}

/**
 * Migración: agrega la columna CASA (después de REVISAR) a cada pestaña de mes
 * que no la tenga todavía, con las filas que ya tienen datos escritas en COMPARTIDO (nadie nombró
 * casa antes de este cambio) y las filas libres sin tocar; vuelve a aplicar formato, ocultas,
 * formato condicional y protecciones para que quede igual que una pestaña creada con el código
 * actual. Nunca toca _ESTADO, _HISTORIAL ni pestañas que no son de mes; correrla de nuevo no
 * cambia nada (ya tienen CASA).
 */
function agregarColumnaCasa_(ss) {
  const posicionCasa = numeroColumna_('CASA');
  const lineas = [];
  ss.getSheets().forEach((hoja) => {
    if (!leerPestanaMes_(hoja.getName())) return;
    if (hoja.getRange(FILA_ENCABEZADOS, posicionCasa).getValue() === 'CASA') {
      lineas.push(`${hoja.getName()}: ya tiene CASA, sin cambios`);
      return;
    }
    const valoresCasa = valoresCasaExistente_(hoja, posicionCasa); // antes de insertar la columna
    hoja.insertColumnAfter(numeroColumna_('REVISAR'));
    hoja.getRange(FILA_ENCABEZADOS, posicionCasa).setValue('CASA')
      .setBackground(COLORES.CACAO).setFontColor(COLORES.CREMA)
      .setFontFamily(FUENTE_DATOS).setFontWeight(PESO_ENCABEZADO);
    if (valoresCasa.length) hoja.getRange(PRIMERA_FILA_DATOS, posicionCasa, valoresCasa.length, 1).setValues(valoresCasa);
    darFormatoMes_(hoja);
    hoja.getRange(FILA_ENCABEZADOS, numeroColumna_('GRUPO')).setFormula(formulaGrupo_());
    lineas.push(`${hoja.getName()}: CASA agregada`);
  });
  return lineas;
}

/** Ejecutar desde el editor: agrega CASA a las pestañas de mes que falten. */
function agregarColumnaCasa() {
  const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  const lineas = agregarColumnaCasa_(ss);
  lineas.forEach((linea) => Logger.log(linea));
  return lineas;
}

/** Solo lectura: nombre, visibilidad y tamaño usado de cada pestaña. */
function describirHoja_(ss) {
  return ss.getSheets().map((h, i) => `${i + 1}. ${h.getName()}`
    + ` | ${h.isSheetHidden() ? 'oculta' : 'visible'}`
    + ` | ${h.getLastRow()} filas × ${h.getLastColumn()} columnas con datos`);
}

/** Ejecutar desde el editor antes de configurarHoja, para revisar cómo está la hoja. */
function verHoja() {
  const lineas = describirHoja_(SpreadsheetApp.openById(CONFIG.SHEET_ID));
  lineas.forEach((linea) => Logger.log(linea));
  return lineas;
}

// --- Migración al formato de una fila por factura ---

// La única pestaña de mes que existe hoy; si aparece otra, la migración para y pregunta.
const PESTANA_UNA_FILA = 'Septiembre 2026';
// Columnas del formato viejo que eran desborde de fórmula: no cuentan como datos escritos.
const COLUMNAS_DESBORDE_VIEJAS = Object.freeze(['SUBTOTAL FACTURA', 'GRUPO']);
// Protección que el código viejo ponía en SUBTOTAL FACTURA (N); la de GRUPO la quita
// quitarProteccionesAutomaticas_ dentro de darFormatoMes_.
const COLUMNAS_PROTEGIDAS_VIEJAS = Object.freeze(['SUBTOTAL FACTURA']);

/** Encabezados tal como están hoy en la pestaña (ancho real de la hoja, no el del código). */
const encabezadosDe_ = (hoja) => hoja.getRange(FILA_ENCABEZADOS, 1, 1, hoja.getMaxColumns()).getValues()[0];

/**
 * Filas de datos de una pestaña: { numero, valores }. Una fila cuenta como dato si tiene algo
 * escrito fuera de las columnas de desborde (el desborde de GRUPO llega hasta el fondo de la
 * hoja y dejaría "llenas" filas que están libres).
 */
function filasConDatos_(hoja, encabezados) {
  const cuantas = hoja.getMaxRows() - PRIMERA_FILA_DATOS + 1;
  if (cuantas < 1) return [];
  const desborde = encabezados
    .map((nombre, i) => (COLUMNAS_DESBORDE_VIEJAS.includes(nombre) ? i : -1)).filter((i) => i >= 0);
  return hoja.getRange(PRIMERA_FILA_DATOS, 1, cuantas, encabezados.length).getValues()
    .map((valores, i) => ({ numero: PRIMERA_FILA_DATOS + i, valores }))
    .filter(({ valores }) => valores
      .some((v, j) => !desborde.includes(j) && String(v).trim() !== ''));
}

/** Valor de una columna (por nombre del encabezado de la hoja) en una fila leída. */
const valorColumna_ = (fila, encabezados, nombre) => {
  const i = encabezados.indexOf(nombre);
  return i < 0 ? '' : fila.valores[i];
};

/** Números de las filas que no escribió el bot: solo esas pueden ser datos de verdad. */
const filasAjenas_ = (filas, encabezados) => filas
  .filter((fila) => String(valorColumna_(fila, encabezados, 'ORIGEN')) !== ORIGEN_BOT)
  .map((fila) => `fila ${fila.numero}`);

/** ID FILA de cada fila que se va a borrar. */
const idsFilaDe_ = (filas, encabezados) => filas
  .map((fila) => String(valorColumna_(fila, encabezados, 'ID FILA'))).filter(Boolean);

/** La pestaña ya tiene los encabezados nuevos (GRUPO va aparte: es fórmula). */
function yaMigrada_(hoja) {
  const actuales = encabezadosDe_(hoja);
  return COLUMNAS.slice(0, -1).every((nombre, i) => actuales[i] === nombre);
}

/** Motivo para no tocar nada, o null si se puede seguir. */
function motivoParo_(meses, objetivo) {
  if (!objetivo) return `no encontré la pestaña ${PESTANA_UNA_FILA}`;
  const otras = meses.filter((h) => h !== objetivo).map((h) => h.getName());
  return otras.length ? `hay otra pestaña de mes (${otras.join(', ')})` : null;
}

/**
 * Cierra en _ESTADO las entradas ABIERTAS que apuntan a las filas que se van a borrar: por
 * ID FILAS (PREGUNTA, REGISTRO, FECHA-FOTO, BORRAR) o por la pestaña guardada en DATOS (las
 * FECHA-FOTO y FECHA que todavía no tienen filas escritas). Solo escribe la celda ESTADO, una
 * por entrada (son poquísimas); no toca nada más. Devuelve cuántas cerró.
 */
function cerrarEstadosDeFilas_(hojaEstado, idsFila, pestana) {
  if (!hojaEstado) return 0;
  const ultima = hojaEstado.getLastRow();
  if (ultima < 2) return 0;
  const col = (nombre) => COLUMNAS_ESTADO.indexOf(nombre);
  return hojaEstado.getRange(2, 1, ultima - 1, COLUMNAS_ESTADO.length).getValues()
    .reduce((cerradas, fila, i) => {
      if (fila[col('ESTADO')] !== PREGUNTA_ABIERTA) return cerradas;
      if (!apuntaAFilas_(fila, idsFila, pestana)) return cerradas;
      celdaEstado_(hojaEstado, i + 2, 'ESTADO').setValue(PREGUNTA_CERRADA);
      return cerradas + 1;
    }, 0);
}

/** Una entrada de _ESTADO apunta a las filas que se borran (por ID FILAS o por pestaña). */
function apuntaAFilas_(fila, idsFila, pestana) {
  const col = (nombre) => COLUMNAS_ESTADO.indexOf(nombre);
  const ids = String(fila[col('ID FILAS')] || '').split(',').filter(Boolean);
  if (ids.some((id) => idsFila.has(id))) return true;
  const datos = leerDatosEstado_(fila[col('DATOS')]);
  return Boolean(datos && datos.pestana === pestana);
}

/** Agrega las columnas que le falten a la pestaña para llegar al ancho del formato nuevo. */
function ensancharPestana_(hoja) {
  const faltan = COLUMNAS.length - hoja.getMaxColumns();
  if (faltan > 0) hoja.insertColumnsAfter(hoja.getMaxColumns(), faltan);
}

/** Quita las protecciones que este código puso en columnas que ya no existen (SUBTOTAL FACTURA). */
function quitarProteccionesViejas_(hoja) {
  const descripciones = new Set(COLUMNAS_PROTEGIDAS_VIEJAS.map(descripcionProteccion_));
  hoja.getProtections(SpreadsheetApp.ProtectionType.RANGE)
    .filter((p) => descripciones.has(p.getDescription()))
    .forEach((p) => p.remove());
}

/**
 * Deja la pestaña igual que una recién creada con crearPestanaMes_, sin borrarla: la ensancha,
 * muestra todas las columnas, deshace la combinación del título, borra contenido y formato de la
 * cabecera y de todas las filas de datos (así se van las fórmulas de desborde viejas y los
 * formatos de número en las posiciones de antes) y vuelve a escribir cabecera y formato.
 * darFormatoMes_ reemplaza el formato condicional viejo y vuelve a proteger GRUPO.
 */
function rehacerPestanaMes_(hoja, anterior) {
  ensancharPestana_(hoja);
  const ancho = hoja.getMaxColumns();
  hoja.showColumns(1, ancho);
  hoja.getRange(FILA_TITULO, 1, FILA_ENCABEZADOS, ancho).breakApart().clear();
  const filasDatos = hoja.getMaxRows() - PRIMERA_FILA_DATOS + 1;
  if (filasDatos > 0) hoja.getRange(PRIMERA_FILA_DATOS, 1, filasDatos, ancho).clear();
  quitarProteccionesViejas_(hoja);
  escribirCabeceraMes_(hoja, hoja.getName(), anterior);
  darFormatoMes_(hoja);
}

/** Nombre de la pestaña de mes anterior a `nombre` (para el saldo inicial), o null. */
function anteriorDe_(ss, nombre) {
  const { anio, mes } = leerPestanaMes_(nombre);
  const otros = ss.getSheets().map((h) => h.getName()).filter((n) => n !== nombre);
  return posicionPestanaMes_(otros, anio, mes).anterior;
}

/** Revisa las filas y, si todas son del bot, cierra _ESTADO y rehace la pestaña. */
function migrarPestanaObjetivo_(ss, hoja) {
  const nombre = hoja.getName();
  const encabezados = encabezadosDe_(hoja);
  const filas = filasConDatos_(hoja, encabezados);
  const ajenas = filasAjenas_(filas, encabezados);
  if (ajenas.length) {
    return [`PARO: ${nombre} tiene filas que no son del bot (${ajenas.join(', ')}); no se tocó nada`];
  }
  const idsFila = new Set(idsFilaDe_(filas, encabezados));
  const cerradas = cerrarEstadosDeFilas_(ss.getSheetByName(PESTANA_ESTADO), idsFila, nombre);
  rehacerPestanaMes_(hoja, anteriorDe_(ss, nombre));
  return [
    `_ESTADO: ${cerradas} entradas abiertas cerradas`,
    `${nombre}: ${filas.length} filas de prueba borradas`,
    `${nombre}: encabezados, fórmulas y formato nuevos aplicados`,
  ];
}

/**
 * Migración del plan de una fila por factura: primero solo lee (lista las pestañas de mes y sus
 * filas con datos) y para sin escribir nada si hay otra pestaña de mes o si alguna fila no la
 * escribió el bot (podría ser un dato de verdad). Si la pestaña ya tiene los encabezados nuevos
 * no cambia nada. Nunca toca _HISTORIAL ni otras pestañas; de _ESTADO solo la celda ESTADO de
 * las entradas abiertas que apuntan a las filas borradas. Devuelve las líneas del registro.
 */
function migrarUnaFila_(ss) {
  const meses = ss.getSheets().filter((h) => leerPestanaMes_(h.getName()) !== null);
  const lineas = meses.map((h) => `${h.getName()}: ${filasConDatos_(h, encabezadosDe_(h)).length} filas con datos`);
  const objetivo = meses.find((h) => h.getName() === PESTANA_UNA_FILA) || null;
  const paro = motivoParo_(meses, objetivo);
  if (paro) return [...lineas, `PARO: ${paro}; no se tocó nada`];
  if (yaMigrada_(objetivo)) return [...lineas, `${objetivo.getName()}: ya migrada, sin cambios`];
  return [...lineas, ...migrarPestanaObjetivo_(ss, objetivo)];
}

/** Ejecutar desde el editor: rehace Septiembre 2026 con el formato de una fila por factura. */
function migrarUnaFila() {
  const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  const lineas = migrarUnaFila_(ss);
  lineas.forEach((linea) => Logger.log(linea));
  return lineas;
}

if (typeof module !== 'undefined') {
  module.exports = {
    PESTANA_ESTADO, PESTANA_HISTORIAL, escribirCabeceraMes_, darFormatoMes_, crearPestanaMes_,
    crearPestanaOculta_, protegerPestanaInterna_, protegerPestanasInternas_, protegerPestanasInternas,
    DESCRIPCION_PROTECCION_INTERNA, leerAnioMes_, configurarHoja_, configurarHoja, describirHoja_, verHoja,
    agregarColumnaCasa_, agregarColumnaCasa, migrarUnaFila_, migrarUnaFila, anteriorDe_,
    encabezadosDe_, filasConDatos_, filasAjenas_, idsFilaDe_, cerrarEstadosDeFilas_,
    valorColumna_, COLUMNAS_DESBORDE_VIEJAS,
  };
}
