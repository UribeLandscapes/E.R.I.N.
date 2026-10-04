/**
 * Escritura en el Sheet, lógica pura: ID FILA, tramos que se pueden escribir (nunca GRUPO, que es
 * el desborde de la fórmula del encabezado), primera fila libre, preguntas en _ESTADO
 * y cómo aplicar la respuesta del usuario sin pisar lo que ella ya corrigió en la hoja.
 * Usa COLUMNAS, COLUMNAS_VISIBLES, COLUMNAS_ESTADO y numeroColumna_ de Hoja.js;
 * leerFecha_, idFactura_ y ortografiaProveedor_ de Reglas.js (la
 * ortografía del historial al responder la pregunta de proveedor); claseDeRespuesta_ y
 * claseDeExtraccion_ de Clases.js (mapeo determinístico de una
 * respuesta abierta de clase, antes de confiar en Gemini, y conversión de un nombre de grupo que
 * Gemini haya elegido); MONEDAS_PAR_TEXTO de Texto.js y convertirAUsd_ de Moneda.js (P2: el total
 * que contesta el usuario en otra moneda se pasa a USD con la TASA USADA de la fila).
 */
const ORIGEN_BOT = 'BOT';
const TIPO_ESTADO_PREGUNTA = 'PREGUNTA';
const PREGUNTA_ABIERTA = 'ABIERTA';
// GRUPO es el único desborde de fórmula que queda (una fila por factura, sin SUBTOTAL).
const COLUMNAS_DESBORDE = Object.freeze(['GRUPO']);
// Qué columnas deja pendientes cada pregunta (lo que el bot escribió y la respuesta puede cambiar).
const COLUMNAS_POR_PREGUNTA = Object.freeze({
  fecha: ['FECHA', 'ID FACTURA', 'REVISAR'],
  proveedor: ['PROVEEDOR', 'ID FACTURA'],
  depositante: ['PROVEEDOR'],
  clase: ['CLASE DE GASTO'],
  // P2: el total contestado va a GASTO (USD) y, en otra moneda, también a MONTO ORIGINAL.
  total: ['GASTO (USD)', 'MONTO ORIGINAL', 'REVISAR'],
  monto: [],
});
// Qué marca de REVISAR se quita cuando se resuelve cada columna.
const MARCA_POR_COLUMNA = Object.freeze({
  FECHA: 'FECHA', 'GASTO (USD)': 'TOTAL', 'MONTO ORIGINAL': 'TOTAL',
});

/** { anio, mes, dia } si es AAAA-MM-DD real; si no, null. */
function fechaValida_(fecha) {
  try {
    return leerFecha_(fecha);
  } catch (e) {
    return null;
  }
}

/** ('20260926-161020', 501, 2) → ['BOT-20260926-161020-501-1', 'BOT-20260926-161020-501-2']. */
function idsFila_(sello, idMensaje, cuantas) {
  return Array.from({ length: cuantas }, (_, i) => `${ORIGEN_BOT}-${sello}-${idMensaje}-${i + 1}`);
}

/** Tramos seguidos de columnas que el bot puede escribir: [{ desde (1 = A), columnas }]. */
function tramosEscritura_() {
  const tramos = [];
  COLUMNAS.forEach((columna, i) => {
    if (COLUMNAS_DESBORDE.includes(columna)) return;
    const ultimo = tramos[tramos.length - 1];
    if (ultimo && ultimo.desde + ultimo.columnas.length === i + 1) ultimo.columnas.push(columna);
    else tramos.push({ desde: i + 1, columnas: [columna] });
  });
  return tramos;
}

const valorFila_ = (fila, columna) => (fila[columna] === undefined || fila[columna] === null ? '' : fila[columna]);

// Evita que texto externo se interprete como fórmula al llegar a una celda.
const textoSeguroCelda_ = (valor) => typeof valor === 'string' && /^[=+\-@\t\r]/.test(valor) ? `'${valor}` : valor;
const COLUMNAS_TEXTO_LIBRE_CELDA = Object.freeze([
  'PROVEEDOR', 'DESCRIPCIÓN', 'FORMA DE PAGO', 'CLASE DE GASTO', 'COMENTARIOS', 'REVISAR',
]);
const valorSeguroPorColumna_ = (columna, valor) => COLUMNAS_TEXTO_LIBRE_CELDA.includes(columna)
  ? textoSeguroCelda_(valor) : valor;

/** Valores de un tramo para una fila {columna: valor}; vacío donde la fila no trae dato. */
const valoresTramo_ = (fila, tramo) => tramo.columnas.map((c) => valorSeguroPorColumna_(c, valorFila_(fila, c)));

/** Texto comparable de una celda: Date → AAAA-MM-DD (hora local), número → 2 decimales. */
function textoCelda_(valor) {
  if (valor === null || valor === undefined) return '';
  if (valor instanceof Date) {
    const dos = (n) => String(n).padStart(2, '0');
    return `${valor.getFullYear()}-${dos(valor.getMonth() + 1)}-${dos(valor.getDate())}`;
  }
  if (typeof valor === 'number') return valor.toFixed(2);
  return String(valor).trim();
}

/** Libre: ID FILA vacío y todas las visibles vacías. */
function filaEsLibre_(fila) {
  if (textoCelda_(fila[numeroColumna_('ID FILA') - 1]) !== '') return false;
  return COLUMNAS_VISIBLES.every((c, i) => COLUMNAS_DESBORDE.includes(c) || textoCelda_(fila[i]) === '');
}

/**
 * Desde la primera fila de datos, índice (0 = fila 6) del primer bloque de `cuantas` filas
 * libres seguidas. Las filas después del final cuentan como libres (hay que agregarlas).
 */
function filaLibre_(valores, cuantas) {
  let inicio = 0;
  while (!valores.slice(inicio, inicio + cuantas).every(filaEsLibre_)) inicio += 1;
  return inicio;
}

/** Arreglo de una fila del Sheet → { columna: valor }. */
const filaComoObjeto_ = (arreglo) => Object.fromEntries(COLUMNAS.map((c, i) => [c, arreglo[i]]));

/** { idFila: { columna: valor } } con solo lo que las preguntas dejan pendiente. */
function escritoPendiente_(filas, preguntas) {
  const columnas = [...new Set(preguntas.flatMap((p) => COLUMNAS_POR_PREGUNTA[p] || []))];
  return Object.fromEntries(filas.map((fila) => [
    fila['ID FILA'],
    Object.fromEntries(columnas.filter((c) => c in fila).map((c) => [c, fila[c]])),
  ]));
}

/** Fila de _ESTADO para una pregunta abierta, en el orden de COLUMNAS_ESTADO. */
function preguntaEstado_({ creado, clave, preguntas, filas, pestana, extra }) {
  const datos = { preguntas, pestana, escrito: escritoPendiente_(filas, preguntas), ...(extra || {}) };
  const fila = {
    CREADO: creado,
    TIPO: TIPO_ESTADO_PREGUNTA,
    CLAVE: clave,
    'ID FILAS': filas.map((f) => f['ID FILA']).join(','),
    DATOS: JSON.stringify(datos),
    ESTADO: PREGUNTA_ABIERTA,
  };
  return COLUMNAS_ESTADO.map((c) => fila[c]);
}

function leerDatosEstado_(texto) {
  try {
    const datos = JSON.parse(texto);
    return datos && typeof datos === 'object' ? datos : null;
  } catch (e) {
    return null;
  }
}

/** Preguntas ABIERTAS de _ESTADO (sin encabezado); `fila` es el número de fila en la hoja. */
function preguntasAbiertas_(filasEstado) {
  const col = (nombre) => COLUMNAS_ESTADO.indexOf(nombre);
  const abiertas = [];
  filasEstado.forEach((fila, i) => {
    if (fila[col('TIPO')] !== TIPO_ESTADO_PREGUNTA || fila[col('ESTADO')] !== PREGUNTA_ABIERTA) return;
    const datos = leerDatosEstado_(fila[col('DATOS')]);
    if (!datos) return;
    const clave = fila[col('CLAVE')];
    const ids = String(fila[col('ID FILAS')] || '');
    abiertas.push({
      ...datos,
      fila: i + 2,
      creado: fila[col('CREADO')],
      idMensajeBot: clave === '' || clave === null || clave === undefined ? null : Number(clave),
      idFilas: ids ? ids.split(',') : [],
      preguntas: datos.preguntas || [],
      escrito: datos.escrito || {},
    });
  });
  return abiertas;
}

/**
 * Columnas que cambia la respuesta: solo lo que se preguntó y vino válido. `contexto` (opcional) =
 * { texto, casa, fecha, categorias, historial, moneda, tasa }: `historial` es
 * [{proveedor, clase}] para escribir el proveedor con su ortografía ya usada (ortografiaProveedor_).
 * Con el texto crudo del usuario, el mapeo determinístico de
 * claseDeRespuesta_ (Clases.js) gana aunque Gemini haya devuelto PENDIENTE para clase (defecto E2);
 * sin contexto (o sin mapeo), se usa lo que Gemini haya puesto en clase. Si claseDeRespuesta_
 * devuelve MARCA_PENDIENTE_CLASE (el texto trae palabras de más de un grupo), no se anota nada:
 * la clase se queda sin contestar y el bot vuelve a preguntar con la lista.
 * `moneda` y `tasa` son de la fila que se está corrigiendo y solo los usa el total (P2).
 */
/** La tasa de la fila ("4000 (2026-09-25)") como número; 0 si no se puede leer. */
function tasaDeFila_(tasa) {
  const numero = Number.parseFloat(String(tasa === null || tasa === undefined ? '' : tasa));
  return Number.isFinite(numero) && numero > 0 ? numero : 0;
}

/**
 * El total que contestó el usuario (P2): en USD o PAB va a GASTO (USD) tal cual; en otra moneda va a
 * MONTO ORIGINAL y GASTO (USD) se calcula con la TASA USADA que ya tiene la fila (la misma
 * división que usó montoEnUsd_ al escribirla). Sin tasa legible, GASTO se queda como estaba y la
 * marca de REVISAR se va igual: el monto original ya quedó anotado.
 */
function cambiosTotal_(total, contexto) {
  const moneda = String((contexto && contexto.moneda) || '');
  if (!moneda || MONEDAS_PAR_TEXTO.includes(moneda)) return { 'GASTO (USD)': total };
  const tasa = tasaDeFila_(contexto && contexto.tasa);
  return tasa
    ? { 'MONTO ORIGINAL': total, 'GASTO (USD)': convertirAUsd_(total, tasa) }
    : { 'MONTO ORIGINAL': total };
}

function cambiosRespuesta_(respuesta, preguntas, contexto) {
  const cambios = {};
  const pidio = (p) => preguntas.includes(p);
  if (pidio('fecha') && fechaValida_(respuesta.fecha)) cambios.FECHA = respuesta.fecha;
  if ((pidio('proveedor') || pidio('depositante')) && respuesta.proveedor) {
    cambios.PROVEEDOR = ortografiaProveedor_(contexto && contexto.historial, respuesta.proveedor);
  }
  if (pidio('clase')) {
    const determinada = contexto
      && claseDeRespuesta_(contexto.texto, contexto.casa, contexto.fecha, contexto.categorias);
    if (determinada === MARCA_PENDIENTE_CLASE) {
      // Ambigua entre varios grupos: no se adivina, se deja pendiente (defecto de la revisión).
    } else if (determinada) {
      cambios['CLASE DE GASTO'] = determinada;
    } else if (respuesta.clase && respuesta.clase !== 'PENDIENTE') {
      cambios['CLASE DE GASTO'] = contexto ? claseDeExtraccion_(respuesta.clase, contexto.casa, contexto.fecha) : respuesta.clase;
    }
  }
  if (pidio('total') && typeof respuesta.total === 'number' && Number.isFinite(respuesta.total)) {
    Object.assign(cambios, cambiosTotal_(respuesta.total, contexto));
  }
  return cambios;
}

const sigueIgual_ = (valores, escrito, columna) => columna in escrito
  && textoCelda_(valores[columna]) === textoCelda_(escrito[columna]);

/** ID FACTURA con la fecha y el proveedor que quedan; null si no se puede armar. */
function idNuevo_(valores, cambio, idsFactura) {
  const fecha = cambio.FECHA || textoCelda_(valores.FECHA);
  const proveedor = valores.TIPO === 'DEPÓSITO' ? 'DEPOSITO' : cambio.PROVEEDOR || valores.PROVEEDOR;
  try {
    return idFactura_(proveedor, fecha, idsFactura);
  } catch (e) {
    return null; // proveedor o fecha que no sirven para un ID: se deja el que estaba
  }
}

/**
 * REVISAR sin las marcas de las columnas ya resueltas. Una marca puede traer una explicación
 * entre paréntesis ("TOTAL (partes suman 15.00)", P2): se compara solo el nombre.
 */
function revisarSin_(texto, resueltas) {
  const quitar = resueltas.map((c) => MARCA_POR_COLUMNA[c]).filter(Boolean);
  const nombreMarca_ = (marca) => marca.replace(/\s*\(.*$/, '').trim();
  const marcas = String(texto).replace(/^\s*PENDIENTE:\s*/, '').split(',').map((m) => m.trim())
    .filter((m) => m && !quitar.includes(nombreMarca_(m)));
  return marcas.length ? `PENDIENTE: ${marcas.join(', ')}` : '';
}

/** Plan de una fila del bot: { cambio, corregidas, resueltas }. */
function planFila_(valores, escrito, cambios, idsFactura) {
  const cambio = {};
  const corregidas = [];
  const resueltas = Object.keys(cambios).filter((c) => c in escrito);
  for (const columna of resueltas) {
    if (sigueIgual_(valores, escrito, columna)) cambio[columna] = cambios[columna];
    else corregidas.push({ columna, valor: valores[columna] });
  }
  // Si el usuario ya corrigió la celda, ID FACTURA y REVISAR también quedan en sus manos.
  const tocaId = 'FECHA' in cambio || 'PROVEEDOR' in cambio;
  if (tocaId && sigueIgual_(valores, escrito, 'ID FACTURA')) {
    const id = idNuevo_(valores, cambio, idsFactura);
    if (id && id !== textoCelda_(valores['ID FACTURA'])) cambio['ID FACTURA'] = id;
  }
  if (sigueIgual_(valores, escrito, 'REVISAR')) {
    const revisar = revisarSin_(valores.REVISAR, Object.keys(cambio));
    if (revisar !== textoCelda_(valores.REVISAR)) cambio.REVISAR = revisar;
  }
  return { cambio, corregidas, resueltas };
}

/** { anio, mes } si la fecha nueva cae en otro mes que la fila; si no, null. */
function mesNuevo_(valores, cambio) {
  if (!cambio.FECHA) return null;
  const nueva = leerFecha_(cambio.FECHA);
  const antes = fechaValida_(textoCelda_(valores.FECHA));
  const mismoMes = antes && antes.anio === nueva.anio && antes.mes === nueva.mes;
  return mismoMes ? null : { anio: nueva.anio, mes: nueva.mes };
}

/**
 * Qué cambiar al responder el usuario. `filas`: [{ idFila, valores {columna: valor} }] releídas por
 * ID FILA; gana el Sheet si una celda ya no tiene lo que escribió el bot. `idsFactura`: los del
 * mes destino sin el grupo propio. Devuelve { porFila, corregidas, resueltas, moverA, ajenas }.
 */
function planRespuesta_(filas, escrito, cambios, idsFactura) {
  const plan = { porFila: {}, corregidas: [], resueltas: [], moverA: null, ajenas: [] };
  const vistas = new Set();
  for (const { idFila, valores } of filas) {
    if (valores.ORIGEN !== ORIGEN_BOT) {
      plan.ajenas.push(idFila);
      continue;
    }
    const fila = planFila_(valores, escrito[idFila] || {}, cambios, idsFactura);
    plan.porFila[idFila] = fila.cambio;
    plan.moverA = plan.moverA || mesNuevo_(valores, fila.cambio);
    for (const c of fila.corregidas) {
      const clave = `${c.columna}|${textoCelda_(c.valor)}`;
      if (!vistas.has(clave)) plan.corregidas.push(c);
      vistas.add(clave);
    }
    plan.resueltas = [...new Set([...plan.resueltas, ...fila.resueltas])];
  }
  return plan;
}

/** Aviso cuando el usuario ya había corregido la celda en la hoja. */
const mensajeCorregido_ = (valor) => `Ya lo corregiste en la hoja (quedó ${textoCelda_(valor)}). Lo dejé así.`;

/** Fecha (Date) de una celda CREADO de _ESTADO: puede venir como Date o como texto. */
const comoFecha_ = (creado) => (creado instanceof Date ? creado : new Date(creado));

/** Datos del mensaje con el monto que faltaba como total (una sola línea). */
const datosConMonto_ = (datos, monto) => ({ ...datos, total: monto, lineas: [] });

if (typeof module !== 'undefined') {
  module.exports = {
    ORIGEN_BOT, TIPO_ESTADO_PREGUNTA, PREGUNTA_ABIERTA, COLUMNAS_POR_PREGUNTA, MARCA_POR_COLUMNA, idsFila_,
    tramosEscritura_, valoresTramo_, textoSeguroCelda_, valorSeguroPorColumna_, filaEsLibre_, filaLibre_, filaComoObjeto_, textoCelda_, preguntaEstado_,
    preguntasAbiertas_, cambiosRespuesta_, planRespuesta_, mensajeCorregido_, datosConMonto_, leerDatosEstado_,
    comoFecha_, revisarSin_, fechaValida_,
  };
}
