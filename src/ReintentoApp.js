/**
 * Capa de app de los reintentos de Gemini sobre las fotos POR-PROCESAR y del modo
 * preguntas cuando Gemini no vuelve. `reintentarPorProcesar_` se corre
 * a mano con `reintentarFotos` desde el editor.
 * Usa lo puro de Reintento.js y de PorProcesar.js; leerFotoGemini_ y clasificarFotoLeida_ de
 * FotoApp.js (con el respaldo de Groq, misma cadena que la primera lectura); planFoto_ de Foto.js; filasGasto_ de Texto.js; buscarFilas_, celdaEstado_ y
 * PREGUNTA_CERRADA de EscrituraApp.js; filasEstado_ de BotonesApp.js; cerrarEstado_ de
 * RegistroApp.js; enviarTelegram_, quitarBotones_, respuestaFechaAtendida_, resumenHoja_,
 * contextoTexto_ y registrarPlan_ de MensajesApp.js; moverFotoDelPlan_ de MensajesFoto.js;
 * preguntarFechaFotoSiHace_ de FechaFotoApp.js; esLaPreguntaMasNueva_ e instanteEstado_ de
 * PorProcesarApp.js; ortografiaProveedor_ de Reglas.js; claseInferidaProveedor_ de Clases.js;
 * numeroColumna_ de Hoja.js; CONFIG de Config.js.
 * Usa sincronizarRegistros_ de RegistroApp.js, registroParaEscribir_ y avisarChoques_ de EdicionesApp.js y filtrarCambiosManuales_, textoNadaCambiado_,
 * textoColumnasSaltadas_ de Ediciones.js.
 */
const TEXTO_SIN_FOTOS_POR_PROCESAR = 'No hay ninguna foto por procesar';
// Cuánto espera reintentarFotos el candado del script antes de rendirse.
const ESPERA_CANDADO_REINTENTO_MS = 30000;

/** Respuesta al usuario cuando contesta a quién le pagó: le muestra lo que quedó guardado. */
function textoProveedorAnotado_(proveedor) {
  return `Listo, anoté el proveedor: ${proveedor}.`;
}

/** El "momento" que el editor usa: no hay mensaje del usuario, así que manda el reloj. */
function momentoReintento_(deps) {
  const ahora = deps.ahora();
  return {
    ahora,
    chatId: CONFIG.ERIN_CHAT_ID,
    sello: deps.formatear(ahora, FORMATO_SELLO),
    fechaMensaje: deps.formatear(ahora, FORMATO_FECHA),
  };
}

/** Entorno completo (libro y resumen incluidos) para escribir por el camino de siempre. */
function entornoReintento_(deps, hojaEstado) {
  const ss = deps.libro();
  return {
    ss,
    hojaEstado,
    deps,
    momento: momentoReintento_(deps),
    resumen: resumenHoja_(ss),
    registros: { citado: null, ultimo: null },
  };
}

/**
 * La foto archivada, leída otra vez con Gemini por el mismo camino de siempre (leerFotoGemini_).
 * Nunca lanza: sin idFoto, con la foto borrada o con Gemini caído devuelve { ok: false, motivo }.
 */
function releerConGemini_(deps, entrada, resumen) {
  if (!entrada.idFoto) return { ok: false, motivo: 'la entrada no guardó el id de la foto' };
  let archivo;
  try {
    archivo = deps.archivoPorId(entrada.idFoto);
  } catch (error) {
    return { ok: false, motivo: 'la foto ya no está en Drive' };
  }
  let leido;
  try {
    leido = leerFotoGemini_(deps.base64(archivo.getBlob()), archivo.getMimeType(), entrada.leyenda,
      resumen.categorias, deps.claveGemini, entrada.fechaMensaje, deps.claveGroq,
      () => deps.ocr(archivo.getBlob(), deps.carpetaFacturas()));
  } catch (error) {
    return { ok: false, motivo: 'no se pudo leer la foto archivada' };
  }
  return { ...leido, archivo };
}

/** Escribe {columna: valor} celda por celda en una fila ya ubicada (nunca toca GRUPO). */
const escribirCeldas_ = (ubicada, cambios) => Object.entries(cambios).forEach(([columna, valor]) => {
  ubicada.hoja.getRange(ubicada.numero, numeroColumna_(columna)).setValue(valorSeguroPorColumna_(columna, valor));
});

/**
 * Escribe en cada fila solo lo que sigue en PENDIENTE (llenarPendientes_) y, si el total de Gemini
 * no coincide con el confirmado, la marca PENDIENTE: TOTAL. Devuelve las filas ya actualizadas.
 */
function llenarFilas_(filas, nuevos, marcarTotal, registro) {
  return filas.map((ubicada) => {
    const cambios = llenarPendientes_(ubicada.valores, nuevos);
    if (marcarTotal) cambios.REVISAR = agregarMarcaRevisar_(ubicada.valores.REVISAR, MARCA_REVISAR_TOTAL);
    const filtrado = filtrarCambiosManuales_(registro, ubicada.idFila, cambios, ubicada.valores);
    escribirCeldas_(ubicada, filtrado.escribir);
    return { ...ubicada, valores: { ...ubicada.valores, ...filtrado.escribir }, cambios: filtrado.escribir,
      saltadas: filtrado.saltadas };
  });
}

/**
 * Pone lo que llenarFilas_ escribió de verdad en los datos de cada REGISTRO abierto de esas filas
 * (incluida la forma de pago), para que una corrección posterior no regrese lo recuperado.
 */
function sincronizarLlenas_(hojaEstado, llenas) {
  const porFila = {};
  llenas.filter((fila) => Object.keys(fila.cambios).length)
    .forEach((fila) => { porFila[fila.idFila] = fila.cambios; });
  const ids = Object.keys(porFila);
  if (ids.length) sincronizarRegistros_(hojaEstado, ids, porFila);
}

/** Las celdas que llenarFilas_ escribió de verdad, por pestaña y fila. */
const escritosLlenados_ = (llenas) => llenas.map((fila) => ({
  pestana: fila.hoja.getName(), idFila: fila.idFila, columnas: Object.keys(fila.cambios),
})).filter((fila) => fila.columnas.length);

/**
 * La fila que Gemini habría escrito para esa foto, con la fecha que ya tiene la fila de la hoja
 * (el reintento no mueve de mes lo que el usuario ya confirmó). {} si no se pudo armar.
 */
function filaDeGemini_(entorno, entrada, datos, valores) {
  const fecha = textoCelda_(valores.FECHA) || entrada.fechaMensaje;
  const ctx = contextoTexto_(entorno, { idMensaje: entrada.idMensaje, fechaMensaje: fecha });
  const { filas } = filasGasto_({ ...datos, intencion: 'GASTO', fecha, foto: entrada.enlace }, ctx);
  return filas.length ? filas[0] : {};
}

/**
 * La foto pasa a llamarse con el proveedor de verdad (y va a la carpeta de su mes si seguía en
 * "Por clasificar"). Si Drive falla solo se registra: la fila ya quedó bien escrita.
 */
function renombrarFoto_(deps, entrada, fila, proveedor) {
  if (!entrada.idFoto || !proveedor || proveedor === MARCA_PENDIENTE) return;
  try {
    // Google Sheets devuelve FECHA como Date; la clasificación de la foto la lee como "AAAA-MM-DD".
    const filaTexto = { ...fila, FECHA: textoCelda_(fila.FECHA) };
    moverFotoDelPlan_(deps, { filas: [filaTexto] }, { idFoto: entrada.idFoto, descripcion_corta: proveedor });
  } catch (error) {
    console.warn(`foto ${entrada.idMensaje}: no se pudo renombrar en Drive (${(error && error.message) || error})`);
  }
}

/**
 * Gemini volvió y el total ya estaba confirmado: solo se llenan los campos PENDIENTE de las
 * filas escritas, nunca el total ni su moneda. Devuelve cuántas celdas llenó.
 */
function llenarFilasEscritas_(entorno, entrada, filas, datos, marcarTotal) {
  if (!filas.length) return 0;
  const nuevos = filaDeGemini_(entorno, entrada, datos, filas[0].valores);
  const desde = entorno.deps.ahora();
  const registro = registroParaEscribir_(entorno.ss, entorno.deps);
  const llenas = llenarFilas_(filas, nuevos, marcarTotal, registro);
  sincronizarLlenas_(entorno.hojaEstado, llenas);
  llenas.filter((fila) => fila.saltadas.length).forEach((fila) => console.log(
    `${fila.hoja.getName()} ${fila.idFila}: no cambié ${fila.saltadas.join(', ')}, editadas a mano`,
  ));
  avisarChoques_(entorno.ss, desde, () => escritosLlenados_(llenas), entorno.deps.propiedades);
  renombrarFoto_(entorno.deps, entrada, llenas[0].valores, llenas[0].cambios.PROVEEDOR);
  return llenas.reduce((cuantas, fila) => cuantas + Object.keys(fila.cambios).length, 0);
}

/**
 * Gemini volvió y el total nunca se confirmó: la foto se escribe por el camino normal (el mismo
 * resultado que si Gemini la hubiera leído al llegar), con su confirmación y su pregunta de fecha.
 * `alRegistrar` corre apenas la fila queda escrita, antes de responder: ahí se cierra la entrada.
 */
function escribirFotoReleida_(entorno, entrada, leido, alRegistrar) {
  const { deps } = entorno;
  const datos = {
    ...leido.datos,
    intencion: 'GASTO',
    foto: entrada.enlace || leido.archivo.getUrl(),
    idFoto: entrada.idFoto,
  };
  const ctx = {
    ...contextoTexto_(entorno, { idMensaje: entrada.idMensaje, fechaMensaje: entrada.fechaMensaje }),
    mimeType: leido.archivo.getMimeType(),
  };
  const plan = planFoto_(datos, ctx);
  if (plan.filas.length) clasificarFotoLeida_(leido.archivo, plan, datos, deps.carpetaFacturas());
  const escritas = registrarPlan_(entorno, plan, ctx, datos, alRegistrar);
  preguntarFechaFotoSiHace_(entorno, {
    fechaIlegible: plan.fechaIlegible, escritas, idMensaje: entrada.idMensaje,
  });
  return escritas.length;
}

/** Los botones Sí/No de la propuesta vieja del OCR ya no sirven: se quitan del mensaje del bot. */
function quitarBotonesPropuesta_(deps, chatId, idPregunta) {
  if (!idPregunta) return;
  enviarTelegram_(deps, 'editMessageReplyMarkup', { chat_id: chatId, message_id: idPregunta });
}

/** Gemini respondió: se llena lo pendiente o se escribe la fila, y la entrada se cierra. */
function aplicarGemini_(entorno, entrada, filas, leido, decision) {
  const { hojaEstado, deps, momento } = entorno;
  if (entrada.idFilas.length) {
    const llenas = llenarFilasEscritas_(entorno, entrada, filas, leido.datos, decision.marcarTotal);
    cerrarEstado_(hojaEstado, entrada.fila);
    return `foto ${entrada.idMensaje}: Gemini llenó ${llenas} campos pendientes`;
  }
  // La entrada se cierra apenas se escribe la fila (antes de los mensajes): si algo falla después,
  // el siguiente reintento no la vuelve a insertar.
  const escritas = escribirFotoReleida_(entorno, entrada, leido, () => cerrarEstado_(hojaEstado, entrada.fila));
  quitarBotonesPropuesta_(deps, momento.chatId, entrada.idPregunta);
  return `foto ${entrada.idMensaje}: Gemini la leyó y se escribió ${escritas} fila(s)`;
}

/** +1 intento en los DATOS de la entrada, sin tocar nada más de su fila de _ESTADO. */
function guardarIntento_(hojaEstado, entrada) {
  const filas = filasEstado_(hojaEstado);
  const nueva = filaPorProcesarConIntento_(filas[entrada.fila - 2]);
  if (!nueva) {
    console.warn(`foto ${entrada.idMensaje}: no se pudo anotar el intento (DATOS ilegibles)`);
    return;
  }
  celdaEstado_(hojaEstado, entrada.fila, 'DATOS').setValue(nueva[COLUMNAS_ESTADO.indexOf('DATOS')]);
}

/** Manda una de las preguntas del modo preguntas y devuelve el id del mensaje del bot. */
function enviarPregunta_(deps, chatId, campo, clave) {
  const cuerpos = {
    [CAMPO_TOTAL]: { text: TEXTO_PEDIR_TOTAL },
    [CAMPO_PROVEEDOR]: { text: TEXTO_PREGUNTA_PROVEEDOR },
    [CAMPO_PAGO]: { text: TEXTO_PREGUNTA_FORMA_PAGO, reply_markup: tecladoFormaPago_(clave) },
  };
  return enviarTelegram_(deps, 'sendMessage', { chat_id: chatId, ...cuerpos[campo] }).message_id;
}

/** Deja anotado en los DATOS qué se preguntó y con qué mensaje, para no repetirlo mañana. */
function guardarPreguntado_(hojaEstado, entrada, nuevas, ids) {
  celdaEstado_(hojaEstado, entrada.fila, 'DATOS').setValue(datosPorProcesar_({
    ...entrada,
    idPregunta: ids[CAMPO_TOTAL] || entrada.idPregunta,
    idProveedor: ids[CAMPO_PROVEEDOR] || entrada.idProveedor,
    preguntado: [...entrada.preguntado, ...nuevas],
  }));
}

/** Cierra la entrada POR-PROCESAR si ya no queda nada PENDIENTE que preguntar. */
function cerrarSiNadaFalta_(hojaEstado, entrada, filas) {
  if (pendientesPorProcesar_(entrada, filas.length ? filas[0].valores : {}).length) return false;
  cerrarEstado_(hojaEstado, entrada.fila);
  return true;
}

/**
 * Con Gemini desaparecido el bot le pregunta al usuario lo que siga PENDIENTE de esa foto (el
 * total, el proveedor y la forma de pago), cada cosa una sola vez.
 */
function preguntarPendientes_(entorno, entrada, filas) {
  const { hojaEstado, deps, momento } = entorno;
  const pendientes = pendientesPorProcesar_(entrada, filas.length ? filas[0].valores : {});
  if (!pendientes.length) {
    cerrarEstado_(hojaEstado, entrada.fila);
    return `foto ${entrada.idMensaje}: ya no falta nada, entrada cerrada`;
  }
  const nuevas = porPreguntar_(pendientes, entrada.preguntado);
  if (!nuevas.length) return `foto ${entrada.idMensaje}: ya se preguntó ${pendientes.join(', ')}`;
  const ids = {};
  nuevas.forEach((campo) => {
    ids[campo] = enviarPregunta_(deps, momento.chatId, campo, entrada.idMensaje);
  });
  guardarPreguntado_(hojaEstado, entrada, nuevas, ids);
  return `foto ${entrada.idMensaje}: modo preguntas (${nuevas.join(', ')})`;
}

/** Una entrada POR-PROCESAR: se relee con Gemini y se decide qué hacer. */
function reintentarEntrada_(deps, hojaEstado, entrada) {
  const entorno = entornoReintento_(deps, hojaEstado);
  const filas = entrada.idFilas.length ? buscarFilas_(entorno.ss, entrada.idFilas, '') : [];
  const leido = releerConGemini_(deps, entrada, entorno.resumen);
  const decision = decidirReintento_({
    intentos: entrada.intentos,
    ok: leido.ok,
    totalGemini: leido.ok ? leido.datos.total : null,
    totalConfirmado: filas.length ? Number(filas[0].valores['GASTO (USD)']) : null,
  });
  if (decision.accion === ACCION_LLENAR) return aplicarGemini_(entorno, entrada, filas, leido, decision);
  console.warn(`reintento de la foto ${entrada.idMensaje}: ${leido.motivo}`);
  guardarIntento_(hojaEstado, entrada);
  if (decision.accion !== ACCION_PREGUNTAR) {
    return `foto ${entrada.idMensaje}: Gemini falló, intento ${decision.intentos}`;
  }
  return preguntarPendientes_(entorno, { ...entrada, intentos: decision.intentos }, filas);
}

/**
 * Vuelve a intentar con Gemini todas las fotos POR-PROCESAR que sigan abiertas y devuelve
 * una línea por foto. La llama reintentarFotos. Una
 * entrada que falle no detiene a las demás (queda registrada), y correrlo dos veces no repite nada.
 */
function reintentarPorProcesar_(deps, hojaEstado) {
  return porProcesarAbiertas_(filasEstado_(hojaEstado)).map((entrada) => {
    try {
      return reintentarEntrada_(deps, hojaEstado, entrada);
    } catch (error) {
      const detalle = (error && error.message) || error;
      console.warn(`reintento de la foto ${entrada.idMensaje}: ${detalle}`);
      return `foto ${entrada.idMensaje}: el reintento falló (${detalle})`;
    }
  });
}

/**
 * Núcleo de reintentarFotos. Toma el candado del script (el mismo del webhook
 * y alEditar) para no reintentar la misma foto ni crear carpetas dos veces. Sin candado
 * no hace nada. reintentarPorProcesar_ NO lo toma: lo toma quien la llama.
 */
function reintentarFotosConCandado_(deps) {
  if (!deps.candado.tryLock(ESPERA_CANDADO_REINTENTO_MS)) {
    const aviso = 'reintentarFotos: ocupado, vuelve a correrlo en un minuto';
    Logger.log(aviso);
    return [aviso];
  }
  try {
    const hoja = deps.hojaEstado();
    let lineas;
    if (!hoja) lineas = [`falta la pestaña ${PESTANA_ESTADO} (ejecuta configurarHoja)`];
    else lineas = reintentarPorProcesar_(deps, hoja);
    const salida = lineas.length ? lineas : [TEXTO_SIN_FOTOS_POR_PROCESAR];
    salida.forEach((linea) => Logger.log(linea));
    return salida;
  } finally {
    deps.candado.releaseLock();
  }
}

/**
 * Ejecutar desde el editor: corre los reintentos a mano durante las pruebas en vivo y
 * registra una línea por foto.
 */
function reintentarFotos() {
  return reintentarFotosConCandado_(dependenciasReales_());
}

/**
 * El toque de EFECTIVO / TARJETA / TRANSFERENCIA / YAPPY. Escribe la forma de pago solo donde seguía
 * PENDIENTE y cierra la entrada si con eso ya no falta nada. Una entrada desconocida, cerrada o sin
 * fila escrita recibe el aviso corto de siempre.
 */
function atenderBotonFormaPago_(entorno, callbackQuery) {
  const { ss, hojaEstado, deps } = entorno;
  const boton = leerBotonFormaPago_(callbackQuery.data);
  const entrada = boton ? buscarPorProcesar_(filasEstado_(hojaEstado), boton.clave) : null;
  const filas = entrada && entrada.abierto ? buscarFilas_(ss, entrada.idFilas, '') : [];
  if (!filas.length) {
    respuestaFechaAtendida_(deps, callbackQuery);
    return;
  }
  enviarTelegram_(deps, 'answerCallbackQuery', { callback_query_id: callbackQuery.id });
  quitarBotones_(entorno, callbackQuery);
  const desde = deps.ahora();
  const llenas = llenarFilas_(filas, { 'FORMA DE PAGO': boton.forma }, false, registroParaEscribir_(ss, deps));
  sincronizarLlenas_(hojaEstado, llenas);
  avisarChoques_(ss, desde, () => escritosLlenados_(llenas), deps.propiedades);
  if (llenas.some((fila) => fila.saltadas.includes('FORMA DE PAGO'))) {
    enviarTelegram_(deps, 'sendMessage', { chat_id: entorno.momento.chatId,
      text: textoNadaCambiado_(['FORMA DE PAGO']) });
  }
  cerrarSiNadaFalta_(hojaEstado, entrada, llenas);
}

/**
 * A qué foto le contesta un nombre escrito: a la que el usuario citó con "Responder" (la pregunta del
 * proveedor, la del total o la foto misma) y, sin cita, a la más nueva solo si además es la última
 * pregunta abierta de todas (la misma regla que el total escrito).
 */
function elegirPreguntaProveedor_(filasEstado, mensaje) {
  const candidatas = porProcesarAbiertas_(filasEstado)
    .filter((entrada) => entrada.idFilas.length && entrada.preguntado.includes(CAMPO_PROVEEDOR));
  if (!candidatas.length) return null;
  const citado = (mensaje.reply_to_message && mensaje.reply_to_message.message_id) || null;
  if (citado !== null) {
    return candidatas.find((entrada) => [entrada.idProveedor, entrada.idPregunta, entrada.idMensaje]
      .some((id) => id !== null && String(id) === String(citado))) || null;
  }
  const nueva = candidatas.reduce((reciente, entrada) => (
    instanteEstado_(entrada.creado) > instanteEstado_(reciente.creado) ? entrada : reciente));
  return esLaPreguntaMasNueva_(filasEstado, nueva) ? nueva : null;
}

/**
 * El usuario contesta a quién le pagó. Escribe PROVEEDOR (con la ortografía que ya usa la hoja) y,
 * si su historial tiene una clase dominante, también CLASE DE GASTO; la foto se renombra con ese
 * nombre. Devuelve true cuando atendió el mensaje; cualquier otro texto devuelve false y sigue el
 * camino normal (Gemini).
 */
function atenderProveedorEscrito_(entorno, mensaje, texto) {
  if (!pareceProveedorEscrito_(texto)) return false;
  const { hojaEstado, deps } = entorno;
  const entrada = elegirPreguntaProveedor_(filasEstado_(hojaEstado), mensaje);
  if (!entrada) return false;
  const ss = deps.libro();
  const filas = buscarFilas_(ss, entrada.idFilas, '');
  if (!filas.length) return false;
  const { historialProveedores } = resumenHoja_(ss);
  const { valores } = filas[0];
  const proveedor = ortografiaProveedor_(historialProveedores, texto.trim());
  const clase = claseInferidaProveedor_(historialProveedores, proveedor,
    textoCelda_(valores.CASA) || 'COMPARTIDO', textoCelda_(valores.FECHA) || entrada.fechaMensaje);
  const desde = deps.ahora();
  const llenas = llenarFilas_(filas, { PROVEEDOR: proveedor, ...(clase ? { 'CLASE DE GASTO': clase } : {}) }, false,
    registroParaEscribir_(ss, deps));
  const saltadas = [...new Set(llenas.flatMap((fila) => fila.saltadas))];
  const proveedorSaltado = saltadas.includes('PROVEEDOR');
  sincronizarLlenas_(hojaEstado, llenas);
  avisarChoques_(ss, desde, () => escritosLlenados_(llenas), deps.propiedades);
  if (!proveedorSaltado) renombrarFoto_(deps, entrada, llenas[0].valores, llenas[0].cambios.PROVEEDOR);
  const respuesta = proveedorSaltado ? textoNadaCambiado_(['PROVEEDOR'])
    : `${textoProveedorAnotado_(proveedor)}${saltadas.length ? `\n${textoColumnasSaltadas_(saltadas)}` : ''}`;
  enviarTelegram_(deps, 'sendMessage', { chat_id: entorno.momento.chatId, text: respuesta });
  cerrarSiNadaFalta_(hojaEstado, entrada, llenas);
  return true;
}

if (typeof module !== 'undefined') {
  module.exports = {
    TEXTO_SIN_FOTOS_POR_PROCESAR, textoProveedorAnotado_, momentoReintento_, entornoReintento_, releerConGemini_,
    llenarFilas_, filaDeGemini_, renombrarFoto_, llenarFilasEscritas_, escribirFotoReleida_, escribirCeldas_,
    aplicarGemini_, guardarIntento_, enviarPregunta_, guardarPreguntado_, cerrarSiNadaFalta_,
    preguntarPendientes_, reintentarEntrada_, reintentarPorProcesar_, reintentarFotos,
    reintentarFotosConCandado_, ESPERA_CANDADO_REINTENTO_MS,
    atenderBotonFormaPago_, elegirPreguntaProveedor_, atenderProveedorEscrito_,
    // Para EdicionApp.js: quita los botones de una pregunta que ya no aplica.
    quitarBotonesPropuesta_,
  };
}
