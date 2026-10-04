/**
 * Mensajes de texto, lógica pura: gasto, depósito, saldo inicial, conteo y respuestas.
 * Devuelve filas del Sheet como objetos {columna: valor}; ID FILA y REGISTRADO los pone.
 * Usa leerFecha_, idFactura_, cuadre_, mesDistinto_ y ortografiaProveedor_
 * de Reglas.js; cambiosRespuesta_ de Escritura.js (preguntaDestino_ la reusa para elegir entre
 * varias preguntas abiertas); claseDeGasto_, claseDeExtraccion_ y textoListaClases_ de Clases.js
 * (el proveedor dominante gana a la elección de Gemini);
 * sinTildes_ de Hoja.js (descripción ÍTEM vacía o igual al proveedor);
 * confirmacionFoto_ de Foto.js (un gasto con foto confirma con la línea de la foto).
 */
const MARCA_PENDIENTE = 'PENDIENTE';
const MONEDAS_PAR_TEXTO = Object.freeze(['USD', 'PAB']);
// CASA: COMPARTIDO si el mensaje no nombra ninguna de las dos casas del usuario.
const CASA_COMPARTIDO = 'COMPARTIDO';
const COLUMNAS_TEXTO = Object.freeze(['FECHA', 'ID FACTURA', 'PROVEEDOR', 'DESCRIPCIÓN',
  'DEPÓSITO', 'ARTÍCULOS', 'DESCUENTOS', 'ITBMS', 'OTROS CARGOS', 'GASTO (USD)', 'MONEDA',
  'MONTO ORIGINAL', 'TASA USADA', 'FORMA DE PAGO', 'CLASE DE GASTO', 'COMENTARIOS', 'FOTO',
  'REVISAR', 'CASA', 'ORIGEN', 'ID MENSAJE TG', 'TIPO']);
// Una fila por factura: a qué columna del desglose va cada tipo de línea que devuelve Gemini.
const PARTE_POR_TIPO = Object.freeze({
  ITEM: 'ARTÍCULOS',
  DESCUENTO: 'DESCUENTOS',
  ITBMS: 'ITBMS',
  PROPINA: 'OTROS CARGOS',
  OTROS: 'OTROS CARGOS',
});
const COLUMNAS_DESGLOSE = Object.freeze(['ARTÍCULOS', 'DESCUENTOS', 'ITBMS', 'OTROS CARGOS']);
// Cómo se nombra en la DESCRIPCIÓN cada parte que no es un artículo.
const ETIQUETA_PARTE = Object.freeze({ DESCUENTO: 'descuento', PROPINA: 'propina', OTROS: 'otros' });
// Columna TIPO (oculta): qué es la fila. Reemplaza a la vieja TIPO LÍNEA.
const TIPO_GASTO = 'GASTO';
const TIPO_DEPOSITO_FILA = 'DEPÓSITO';
const TIPO_SALDO_INICIAL_FILA = 'SALDO INICIAL';
const TIPO_AJUSTE = 'AJUSTE';
// Cómo se nombra cada dato que falta dentro de "¿Me dices …?".
const FRASES_PREGUNTA = Object.freeze({
  fecha: 'la fecha',
  proveedor: 'a quién le pagaste',
  clase: 'la clase de gasto',
  total: 'el total de la factura',
  monto: 'el monto',
});
// Guía de la intención AYUDA y de los saludos (con el texto (f)).
// Un solo lugar: la usan los saludos (sin Gemini), la intención AYUDA.
const textoGuia_ = () => [
  `¡Hola ${CONFIG.NOMBRE_USUARIO}! ¿Qué quieres hacer hoy? Puedes escribirme así:`,
  '1. Un gasto: "22.50 efectivo super Riba Smith" (con propina: "22.50 Riba, 1.50 de propina")',
  '2. Un depósito: "me depositaron 250"',
  '3. Revisar la caja: "tengo 85"',
  `4. La casa: agrega "${CONFIG.CASAS.SECUNDARIA.nombre}" o "${CONFIG.CASAS.PRINCIPAL.nombre}"`,
  '5. Corregir: responde a mi confirmación con el cambio, o escribe "corrige el último: ..."',
  '6. Borrar: responde "borrar" a mi confirmación, o escribe "borra el último"',
  `7. Una factura: mándame la foto (puedes agregar "${CONFIG.CASAS.SECUNDARIA.nombre}" o un comentario)`,
  'Escribe "ayuda" cuando quieras ver esto otra vez.',
].join('\n');
// Texto (g): dos ejemplos y el camino a la guía completa.
const TEXTO_NO_ENTENDI = 'No entendí bien. Puedes escribir, por ejemplo, '
  + '"22.50 efectivo super Riba Smith" o "me depositaron 250". Escribe "ayuda" para ver '
  + 'todo lo que puedo hacer.';

const esMonto_ = (m) => typeof m === 'number' && Number.isFinite(m);
/** CASA de una fila: la que nombró el usuario (Gemini ya la validó), o COMPARTIDO si no dijo ninguna. */
const casaDe_ = (datos) => datos.casa || CASA_COMPARTIDO;
const centavosTexto_ = (m) => Math.round(m * 100);
const montoTexto_ = (m) => (centavosTexto_(m) / 100).toFixed(2);

function filaVacia_(ctx) {
  const fila = {};
  for (const columna of COLUMNAS_TEXTO) fila[columna] = '';
  return { ...fila, ORIGEN: 'BOT', 'ID MENSAJE TG': ctx.idMensaje };
}

/** Fecha leída si es válida; si no, null (se usa la del mensaje, sin preguntar). */
function fechaLeida_(fecha) {
  try {
    leerFecha_(fecha);
    return fecha;
  } catch (e) {
    return null;
  }
}

/** Monto del mensaje: el total, o la primera línea si no hay total. */
function montoPrincipal_(datos) {
  if (esMonto_(datos.total)) return datos.total;
  const primera = (datos.lineas || [])[0];
  return primera && esMonto_(primera.monto) ? primera.monto : null;
}

const textoRevisar_ = (campos) => (campos.length ? `PENDIENTE: ${campos.join(', ')}` : '');

/** Líneas del gasto; sin líneas pero con total, una sola línea ÍTEM. null si falta algún monto. */
function lineasGasto_(datos) {
  const lineas = datos.lineas || [];
  if (lineas.length === 0) {
    return esMonto_(datos.total)
      ? [{ tipo: 'ITEM', descripcion: datos.descripcion_corta, monto: datos.total }]
      : null;
  }
  return lineas.every((l) => esMonto_(l.monto)) ? lineas : null;
}

/** Montos en USD de las líneas y del total; USD y PAB van a la par, sin tasa. */
function montosUsd_(montos, moneda, fecha, ctx) {
  if (MONEDAS_PAR_TEXTO.includes(moneda)) {
    return montos.map((m) => ({ gastoUsd: m, tasaUsada: '', original: '' }));
  }
  return montos.map((m) => ({ ...ctx.aUsd(m, moneda, fecha), original: m }));
}

/**
 * Solo se pregunta cuando la fecha del recibo es válida y cae en otro mes que el día
 * en que el usuario lo mandó (el mismo mes usa la fecha del recibo sin preguntar, como antes).
 * Reusable (fotos) además de por el texto.
 */
function fechaDistintaDeMes_(fechaDato, fechaMensaje) {
  return fechaDato && mesDistinto_(fechaDato, fechaMensaje)
    ? { fechaRecibo: fechaDato, fechaEnvio: fechaMensaje }
    : null;
}

/**
 * Qué le falta al gasto: { preguntas, revisar }. El total se pregunta cuando la factura trae un
 * total impreso y las partes del desglose no cuadran con él (P2); la marca de REVISAR dice cuánto
 * suman las partes para que el usuario vea la diferencia sin abrir la hoja.
 * `clase` es la CLASE DE GASTO ya resuelta (dominante o Gemini); solo se pregunta
 * cuando ninguna de las dos la resolvió.
 */
function pendientesGasto_(datos, montos, clase) {
  const preguntas = [];
  if (!datos.proveedor) preguntas.push('proveedor');
  if (clase === MARCA_PENDIENTE) preguntas.push('clase');
  if (!montos.descuadre) return { preguntas, revisar: [] };
  return {
    preguntas: [...preguntas, 'total'],
    revisar: [`TOTAL (partes suman ${montoTexto_(montos.sumaPartes)})`],
  };
}

/** Texto comparable de una descripción: sin tildes, en minúsculas y con un solo espacio. */
const textoComparable_ = (texto) => sinTildes_(texto).toLowerCase().trim().replace(/\s+/g, ' ');

/** La descripción de un ÍTEM vacía o igual al proveedor no dice nada. */
function descripcionItem_(descripcion, proveedor) {
  if (!descripcion) return '';
  return textoComparable_(descripcion) === textoComparable_(proveedor) ? '' : descripcion;
}

/**
 * Cómo se nombra en la DESCRIPCIÓN una parte que no es un artículo: "descuento: Club Arrocha",
 * "propina", "otros: servicio". Si el recibo ya la nombra ("propina muchacho"), se deja tal cual.
 * Las líneas de ITBMS no se nombran: el impuesto ya se ve en su columna.
 */
function textoParte_(linea) {
  const etiqueta = ETIQUETA_PARTE[linea.tipo];
  if (!etiqueta) return '';
  const texto = String(linea.descripcion || '').trim();
  if (!texto) return etiqueta;
  return textoComparable_(texto).startsWith(etiqueta) ? texto : `${etiqueta}: ${texto}`;
}

/**
 * DESCRIPCIÓN de la factura en una sola celda: los artículos separados por coma y después cada
 * descuento, propina u otro cargo. Sin ningún artículo con descripción → 'Agregar descripción'
 *.
 */
function descripcionFactura_(lineas, proveedor) {
  const items = lineas.filter((l) => l.tipo === 'ITEM')
    .map((l) => descripcionItem_(l.descripcion, proveedor))
    .filter(Boolean);
  const hayItems = lineas.some((l) => l.tipo === 'ITEM');
  const textoItems = items.length ? items.join(', ') : (hayItems ? 'Agregar descripción' : '');
  const partes = [textoItems, ...lineas.map(textoParte_)].filter(Boolean);
  return partes.length ? partes.join('; ') : 'Agregar descripción';
}

/** Centavos de cada parte del desglose, en la moneda del recibo; DESCUENTOS en positivo. */
function desgloseCentavos_(lineas) {
  const partes = {};
  for (const columna of COLUMNAS_DESGLOSE) partes[columna] = 0;
  for (const linea of lineas) {
    const columna = PARTE_POR_TIPO[linea.tipo] || 'OTROS CARGOS';
    const centavos = centavosTexto_(linea.monto);
    partes[columna] += columna === 'DESCUENTOS' ? Math.abs(centavos) : centavos;
  }
  return partes;
}

/** ARTÍCULOS − DESCUENTOS + ITBMS + OTROS CARGOS. */
const sumaCentavos_ = (porColumna) => COLUMNAS_DESGLOSE
  .reduce((suma, c) => suma + (c === 'DESCUENTOS' ? -porColumna[c] : porColumna[c]), 0);

/**
 * Pasa a USD solo los montos que no son cero: un cero no necesita tasa (y así una factura en otra
 * moneda consulta la tasa las mismas veces que antes, no una por columna del desglose).
 */
function montosUsdSinCeros_(montos, moneda, fecha, ctx) {
  const convertidos = montosUsd_(montos.filter((m) => centavosTexto_(m) !== 0), moneda, fecha, ctx);
  let siguiente = 0;
  return montos.map((m) => {
    if (centavosTexto_(m) === 0) return { gastoUsd: 0, tasaUsada: '', original: '' };
    siguiente += 1;
    return convertidos[siguiente - 1];
  });
}

/**
 * Montos de la fila: { partes, gasto, sumaPartes, montoOriginal, tasaUsada, descuadre }. Cada
 * parte va en USD con la misma tasa y GASTO es su suma; si hay total impreso y no cuadra con las
 * partes (P2), GASTO es ese total impreso pasado a USD y la fila queda marcada en REVISAR.
 * Una parte en cero se deja vacía; sin tasa, todo lo que dependa de ella queda PENDIENTE.
 */
function montosFactura_(lineas, datos, moneda, fecha, ctx) {
  const centavos = desgloseCentavos_(lineas);
  const sumaRecibo = sumaCentavos_(centavos) / 100;
  const impreso = esMonto_(datos.total) ? datos.total : null;
  const aConvertir = [...COLUMNAS_DESGLOSE.map((c) => centavos[c] / 100),
    ...(impreso === null ? [] : [impreso])];
  const usd = montosUsdSinCeros_(aConvertir, moneda, fecha, ctx);
  const valores = COLUMNAS_DESGLOSE.map((c, i) => usd[i].gastoUsd);
  const partes = {};
  COLUMNAS_DESGLOSE.forEach((c, i) => { partes[c] = centavos[c] === 0 ? '' : valores[i]; });
  const hayTasa = valores.every((v) => esMonto_(v));
  const conSigno = COLUMNAS_DESGLOSE.map((c, i) => (c === 'DESCUENTOS' ? -valores[i] : valores[i]));
  const sumaPartes = hayTasa
    ? conSigno.reduce((suma, v) => suma + centavosTexto_(v), 0) / 100
    : MARCA_PENDIENTE;
  const totalUsd = impreso === null ? null : usd[usd.length - 1].gastoUsd;
  const descuadre = hayTasa && esMonto_(totalUsd) && !cuadre_(conSigno, totalUsd).cuadra;
  return {
    partes,
    gasto: descuadre ? totalUsd : sumaPartes,
    sumaPartes,
    montoOriginal: MONEDAS_PAR_TEXTO.includes(moneda) ? '' : (impreso === null ? sumaRecibo : impreso),
    tasaUsada: (usd.find((u) => u.tasaUsada) || { tasaUsada: '' }).tasaUsada,
    descuadre,
  };
}

/** Una factura (o un gasto escrito) = una sola fila, con su desglose en las cuatro columnas. */
function filasGasto_(datos, ctx) {
  const lineas = lineasGasto_(datos);
  if (!lineas) return { filas: [], preguntas: ['monto'], fechaDistinta: null };

  const fechaDato = fechaLeida_(datos.fecha);
  const fechaDistinta = fechaDistintaDeMes_(fechaDato, ctx.fechaMensaje);
  if (fechaDistinta) return { filas: [], preguntas: [], fechaDistinta };
  const fecha = fechaDato || ctx.fechaMensaje;
  // La ortografía del proveedor que ya está en el historial (o mayúscula
  // inicial por palabra si el usuario lo escribió todo en minúsculas); PENDIENTE nunca cambia.
  const proveedor = ortografiaProveedor_(ctx.historial, datos.proveedor || MARCA_PENDIENTE);
  const moneda = datos.moneda || 'USD';
  const montos = montosFactura_(lineas, datos, moneda, fecha, ctx);
  // El proveedor dominante del historial gana a la clase que eligió Gemini.
  const clase = claseDeGasto_(ctx.historial, proveedor, datos.clase, casaDe_(datos), fecha);
  const { preguntas, revisar } = pendientesGasto_(datos, montos, clase);
  const fila = {
    ...filaVacia_(ctx),
    FECHA: fecha,
    'ID FACTURA': idFactura_(proveedor, fecha, ctx.idsFactura),
    PROVEEDOR: proveedor,
    'DESCRIPCIÓN': descripcionFactura_(lineas, proveedor),
    ...montos.partes,
    'GASTO (USD)': montos.gasto,
    MONEDA: moneda,
    'MONTO ORIGINAL': montos.montoOriginal,
    'TASA USADA': montos.tasaUsada,
    'FORMA DE PAGO': datos.forma_pago === 'DESCONOCIDA' ? '' : (datos.forma_pago || ''),
    'CLASE DE GASTO': clase,
    COMENTARIOS: datos.comentario || '',
    // El enlace de Drive de la foto de la factura (columna FOTO). Un gasto escrito a
    // mano la deja vacía; el enlace de Drive es por id, así que sigue sirviendo si la foto se mueve.
    FOTO: datos.foto || '',
    REVISAR: textoRevisar_(revisar),
    CASA: casaDe_(datos),
    TIPO: TIPO_GASTO,
  };
  return { filas: [fila], preguntas, fechaDistinta: null };
}

/**
 * Depósito: sin fecha usa la del mensaje sin preguntar; sin nombre usa
 * ctx.depositante (CONFIG.DEPOSITANTE_POR_DEFECTO) sin preguntar.
 */
function filasDeposito_(datos, ctx) {
  const monto = montoPrincipal_(datos);
  if (monto === null || monto <= 0) return { filas: [], preguntas: ['monto'] };

  const fechaDato = fechaLeida_(datos.fecha);
  const fecha = fechaDato || ctx.fechaMensaje;
  const primera = (datos.lineas || [])[0];

  const fila = {
    ...filaVacia_(ctx),
    FECHA: fecha,
    'ID FACTURA': idFactura_('DEPOSITO', fecha, ctx.idsFactura),
    TIPO: TIPO_DEPOSITO_FILA,
    // Mismo mapeo de ortografía que un gasto, sin caso especial.
    PROVEEDOR: ortografiaProveedor_(ctx.historial, datos.proveedor || ctx.depositante),
    'DEPÓSITO': monto,
    MONEDA: 'USD',
    COMENTARIOS: datos.comentario || (primera && primera.descripcion) || datos.descripcion_corta || '',
    REVISAR: '',
    CASA: casaDe_(datos),
  };
  return { filas: [fila], preguntas: [] };
}

function planSaldoInicial_(datos, ctx) {
  if (ctx.saldoInicialDefinido) {
    return {
      filas: [],
      preguntas: [],
      respuesta: 'El saldo inicial ya está definido. Si la caja no cuadra, hagamos un conteo: '
        + 'dime cuánto hay ahora ("tengo 85").',
    };
  }
  const monto = montoPrincipal_(datos);
  if (monto === null || monto < 0) {
    return { filas: [], preguntas: ['monto'], respuesta: '¿Cuánto había en la caja al empezar?' };
  }
  const fecha = fechaLeida_(datos.fecha) || ctx.fechaMensaje;
  const fila = {
    ...filaVacia_(ctx),
    FECHA: fecha,
    'ID FACTURA': idFactura_('SALDOINICIAL', fecha, ctx.idsFactura),
    TIPO: TIPO_SALDO_INICIAL_FILA,
    'DEPÓSITO': monto,
    MONEDA: 'USD',
    CASA: casaDe_(datos),
  };
  return { filas: [fila], preguntas: [], respuesta: `Anoté el saldo inicial: ${montoTexto_(monto)}.` };
}

/** Compara en centavos lo que el usuario contó con el saldo del sistema. */
function evaluarConteo_(contado, saldo) {
  const diferenciaCentavos = centavosTexto_(contado) - centavosTexto_(saldo);
  if (diferenciaCentavos === 0) {
    return { cuadra: true, diferencia: 0, respuesta: `Cuadra: ${montoTexto_(contado)}.` };
  }
  const tipo = diferenciaCentavos < 0 ? 'faltante' : 'sobrante';
  const diferencia = diferenciaCentavos / 100;
  return {
    cuadra: false,
    diferencia,
    respuesta: `El sistema calcula ${montoTexto_(saldo)}, dices ${montoTexto_(contado)}: `
      + `${tipo} de ${montoTexto_(Math.abs(diferencia))}. ¿Lo registro como ajuste?`,
  };
}

/**
 * El usuario dijo Sí al ajuste. Si el saldo cambió desde que se le mostró, no escribe: vuelve a
 * preguntar con el número nuevo.
 */
function confirmarAjuste_(contado, saldoMostrado, saldoAhora, ctx) {
  const conteo = evaluarConteo_(contado, saldoAhora);
  if (conteo.cuadra) return { filas: [], preguntarDeNuevo: false, saldo: saldoAhora, respuesta: conteo.respuesta };
  if (centavosTexto_(saldoMostrado) !== centavosTexto_(saldoAhora)) {
    return {
      filas: [],
      preguntarDeNuevo: true,
      saldo: saldoAhora,
      respuesta: `El saldo cambió mientras tanto. ${conteo.respuesta}`,
    };
  }
  const faltante = conteo.diferencia < 0;
  const monto = Math.abs(conteo.diferencia);
  const tipo = faltante ? 'faltante' : 'sobrante';
  const fila = {
    ...filaVacia_(ctx),
    FECHA: ctx.fechaMensaje,
    'ID FACTURA': idFactura_('AJUSTE', ctx.fechaMensaje, ctx.idsFactura),
    TIPO: TIPO_AJUSTE,
    'DESCRIPCIÓN': `Conteo: ${montoTexto_(contado)}, sistema: ${montoTexto_(saldoAhora)}`,
    'DEPÓSITO': faltante ? '' : monto,
    'GASTO (USD)': faltante ? monto : '',
    MONEDA: 'USD',
    CASA: CASA_COMPARTIDO,
  };
  return {
    filas: [fila],
    preguntarDeNuevo: false,
    saldo: saldoAhora,
    respuesta: `Anoté el ajuste: ${tipo} de ${montoTexto_(monto)}.`,
  };
}

/**
 * true si `respuesta` trae algo que le sirva a esta pregunta abierta. Con varias preguntas
 * abiertas el mismo día (p. ej. el proveedor de un gasto y el total de otro) la más reciente no
 * siempre es la que el usuario está contestando; cambiosRespuesta_ (Escritura.js) ya
 * sabe qué campo pide cada pregunta, así que se reusa en vez de repetir esa lógica aquí.
 */
function preguntaElegible_(pregunta, respuesta) {
  const preguntas = pregunta.preguntas || [];
  if (preguntas.includes('monto')) return montoPrincipal_(respuesta) !== null;
  return Object.keys(cambiosRespuesta_(respuesta, preguntas)).length > 0;
}

/**
 * A qué pregunta abierta va una respuesta: la citada con "Responder" siempre gana.
 * Sin cita, entre las que la respuesta puede contestar (`respuesta`, opcional) gana la más
 * reciente; si ninguna puede, o no se pasó `respuesta`, gana la más reciente de todas (como antes).
 */
function preguntaDestino_(abiertas, idRespondido, respuesta) {
  if (!abiertas.length) return null;
  const citada = abiertas.find((p) => idRespondido != null && p.idMensajeBot === idRespondido);
  if (citada) return citada;
  const elegibles = respuesta ? abiertas.filter((p) => preguntaElegible_(p, respuesta)) : [];
  const candidatas = elegibles.length ? elegibles : abiertas;
  return candidatas.reduce((reciente, p) => (
    new Date(p.creado).getTime() > new Date(reciente.creado).getTime() ? p : reciente));
}

const listaEnPalabras_ = (partes) => (partes.length < 2
  ? partes.join('')
  : `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`);

/**
 * Lo que falta, en una sola pregunta breve. Si se pregunta la clase, la lista
 * de los 17 grupos va después, para que el usuario conteste con el número o con sus propias palabras.
 */
function textoPreguntas_(claves, depositante = CONFIG.DEPOSITANTE_POR_DEFECTO) {
  const frases = claves.filter((c) => FRASES_PREGUNTA[c]).map((c) => FRASES_PREGUNTA[c]);
  const partes = [];
  if (frases.length) partes.push(`¿Me dices ${listaEnPalabras_(frases)}?`);
  if (claves.includes('depositante')) partes.push(`¿Quién hizo el depósito? Si no me dices, pongo ${depositante}.`);
  const pregunta = partes.join(' ');
  return claves.includes('clase') ? [pregunta, '', textoListaClases_()].join('\n') : pregunta;
}

/**
 * Confirmación detallada de lo que se anotó, con la pregunta de lo que falte al
 * final del mismo mensaje. `ctx.corregido` cambia el encabezado al texto (d) de la corrección.
 * `foto` (opcional) es el enlace de Drive de la factura, que se muestra debajo de Comentarios.
 */
function confirmacionEntrada_(filas, preguntas, ctx, foto) {
  return textoConfirmacion_({
    filas,
    preguntas,
    pregunta: textoPreguntas_(preguntas, ctx.depositante),
    corregido: Boolean(ctx.corregido),
    foto: foto || '',
  });
}

function planConteo_(datos, ctx) {
  const contado = montoPrincipal_(datos);
  if (contado === null) return { respuesta: '¿Me dices cuánto hay en la caja ahora?', conteo: null };
  const conteo = evaluarConteo_(contado, ctx.saldoCalculado);
  return {
    respuesta: conteo.respuesta,
    conteo: conteo.cuadra ? null : { contado, saldo: ctx.saldoCalculado },
  };
}

/** Pregunta corta con las dos fechas cuando el recibo cae en otro mes. */
const textoFechaDistinta_ = ({ fechaRecibo, fechaEnvio }) => `El recibo es del ${fechaRecibo} pero lo `
  + `mandaste el ${fechaEnvio}, de otro mes. ¿Con cuál lo registro?`;

/**
 * Confirmación detallada de un gasto: la de siempre, más la línea "Foto: ver foto" cuando el gasto
 * vino de una foto. Así todo camino que vuelve a planear (botón de fecha,
 * respuesta de monto, corrección) conserva el enlace sin cableado extra.
 * confirmacionFoto_ vive en Foto.js (global compartido de Apps Script).
 */
const confirmacionGasto_ = (filas, preguntas, ctx, datos) => (datos.foto
  ? confirmacionFoto_(filas, preguntas, ctx, datos.foto)
  : confirmacionEntrada_(filas, preguntas, ctx));

function planSegunIntencion_(datos, ctx) {
  const vacio = {
    filas: [], preguntas: [], respuesta: '', conteo: null, fechaDistinta: null, esRespuesta: false,
    confirmable: false, html: false,
  };
  switch (datos.intencion) {
    case 'GASTO': {
      const { filas, preguntas, fechaDistinta } = filasGasto_(datos, ctx);
      if (fechaDistinta) return { ...vacio, fechaDistinta, respuesta: textoFechaDistinta_(fechaDistinta) };
      // Solo el texto de confirmacionEntrada_ trae HTML (títulos en negrita); la pregunta sola no.
      const respuesta = filas.length
        ? confirmacionGasto_(filas, preguntas, ctx, datos)
        : textoPreguntas_(preguntas, ctx.depositante);
      return { ...vacio, filas, preguntas, respuesta, confirmable: filas.length > 0, html: filas.length > 0 };
    }
    case 'DEPOSITO': {
      const { filas, preguntas } = filasDeposito_(datos, ctx);
      const respuesta = filas.length
        ? confirmacionEntrada_(filas, preguntas, ctx)
        : textoPreguntas_(preguntas, ctx.depositante);
      return { ...vacio, filas, preguntas, respuesta, confirmable: filas.length > 0, html: filas.length > 0 };
    }
    case 'SALDO_INICIAL':
      return { ...vacio, ...planSaldoInicial_(datos, ctx) };
    case 'CONTEO':
      return { ...vacio, ...planConteo_(datos, ctx) };
    case 'RESPUESTA':
      return { ...vacio, esRespuesta: true };
    // La guía, sin escribir ni preguntar nada.
    case 'AYUDA':
      return { ...vacio, respuesta: textoGuia_() };
    default:
      return { ...vacio, respuesta: TEXTO_NO_ENTENDI };
  }
}

/**
 * Qué hacer con un mensaje de texto ya interpretado: { filas, preguntas, respuesta, conteo, esRespuesta }.
 * `conteo` trae { contado, saldo } cuando hay que ofrecer el ajuste con botones.
 * RESPUESTA no escribe aquí: quien lee _ESTADO la aplica. Ya no hay recordatorio de
 * saldo inicial (se quitó; el usuario aún puede decir "saldo inicial 150").
 */
function planTexto_(datos, ctx) {
  return planSegunIntencion_(datos, ctx);
}

if (typeof module !== 'undefined') {
  module.exports = {
    filasGasto_, filasDeposito_, planSaldoInicial_, evaluarConteo_, confirmarAjuste_,
    preguntaDestino_, planTexto_, textoPreguntas_, esMonto_, montoTexto_, MONEDAS_PAR_TEXTO,
    fechaDistintaDeMes_, textoGuia_, TEXTO_NO_ENTENDI, MARCA_PENDIENTE, fechaLeida_, confirmacionEntrada_, TIPO_GASTO,
  };
}
