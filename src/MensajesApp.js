/**
 * Conecta un mensaje de Telegram con Gemini, la lógica de texto y el Sheet.
 * Todo lo de Google entra por `deps` (libro, ahora, formatear, llamar, obtenerJson, claves), así
 * las pruebas en Node usan dobles. Escribe solo con escribirFilas_ (nunca las columnas N ni GRUPO).
 * Usa COLUMNAS, COLUMNAS_HISTORIAL, numeroColumna_ y leerPestanaMes_ de Hoja.js; PESTANA_ESTADO
 * y PESTANA_HISTORIAL de HojaApp.js; centavosCelda_, netoCentavos_ y tipoNormalizado_ de Moneda.js;
 * textoCelda_, preguntaEstado_, preguntasAbiertas_ y celdaEstado_ (PREGUNTA_CERRADA) de
 * Escritura.js/EscrituraApp.js; planTexto_, preguntaDestino_, textoPreguntas_ y textoGuia_ de
 * Texto.js; esSaludoOAyuda_, esAcuse_, esBorrarSolo_ y fraseAnimo_ de Mensajes.js (la
 * guía sin llamar a Gemini; los acuses sin escribir nada; "borrar" solo, citando
 * una confirmación abierta, pide el borrado sin Gemini);
 * escribirFilas_, guardarPregunta_, cerrarPregunta_ y aplicarRespuesta_ de EscrituraApp.js; sincronizarRegistros_ de RegistroApp.js; filasEstado_, idsFacturaDelMes_, abrirConteo_ y atenderBotonConteo_ de
 * BotonesApp.js; tecladoConteo_ de Botones.js; PREFIJO_FECHA, tecladoFecha_, leerBotonFecha_,
 * filaFecha_ y buscarFecha_ de Fecha.js (fecha del recibo de otro mes que el día en
 * que el usuario lo mandó); llamarGeminiConReintento_ y describirError_ de Gemini.js; leerExtraccion_ de
 * Extraccion.js; geminiFallo_ de Groq.js; llamarConRespaldoGroq_ de GroqApp.js (el
 * respaldo de Groq si Gemini falla del todo); montoEnUsd_ de Moneda.js; detalleTelegram_ de
 * WebhookApp.js; nombresGrupos_ y claseInferidaProveedor_ de Clases.js;
 * atenderFoto_ y moverFotoDelPlan_ de MensajesFoto.js (el camino de una foto de factura);
 * PREFIJO_DUPLICADO de Duplicado.js y atenderBotonDuplicado_ de DuplicadoApp.js (aviso de
 * factura duplicada).
 * Usa asegurarEdiciones_, registroParaEscribir_ y avisarChoques_ de EdicionesApp.js; tramosEscritura_ de Escritura.js; tieneEdicionesManuales_, TEXTO_NO_BORRO_MANUAL,
 * TEXTO_NO_CORRIJO_MANUAL de Ediciones.js.
 */
const TIPO_SALDO_INICIAL = 'SALDO INICIAL';

/**
 * `obtenerJson(url)` de verdad para Moneda.js: el JSON de un 200, null si la fuente no tiene el
 * dato (404) y un error si la fuente está caída (no responde, 5xx u otro código).
 */
function obtenerJsonRed_(url) {
  let respuesta;
  try {
    respuesta = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  } catch (error) {
    throw new Error('no se pudo consultar la fuente de tasas');
  }
  const codigo = respuesta.getResponseCode();
  if (codigo === 404) return null;
  if (codigo !== 200) throw new Error(`la fuente de tasas respondió HTTP ${codigo}`);
  try {
    return JSON.parse(respuesta.getContentText());
  } catch (error) {
    throw new Error('la fuente de tasas no devolvió JSON');
  }
}

/**
 * Lo que hace falta antes de leer un mensaje: saldo de TODAS las pestañas de mes (
 * incluidas las filas manuales sin REGISTRADO; el texto cuenta 0), si ya hay una fila de saldo
 * inicial, y las categorías (pestañas de mes + _HISTORIAL). Una lectura por pestaña.
 */
function resumenHoja_(ss) {
  const iDeposito = numeroColumna_('DEPÓSITO') - 1;
  const iGasto = numeroColumna_('GASTO (USD)') - 1;
  const iTipo = numeroColumna_('TIPO') - 1;
  const iClase = numeroColumna_('CLASE DE GASTO') - 1;
  const clases = new Set();
  let centavos = 0;
  let saldoInicialDefinido = false;
  for (const hoja of ss.getSheets()) {
    if (!leerPestanaMes_(hoja.getName())) continue;
    for (const fila of filasDatos_(hoja)) {
      centavos += netoCentavos_({ deposito: fila[iDeposito], gasto: fila[iGasto] });
      if (tipoNormalizado_(fila[iTipo]) === TIPO_SALDO_INICIAL) saldoInicialDefinido = true;
      const clase = textoCelda_(fila[iClase]);
      if (clase) clases.add(clase);
    }
  }
  const historial = ss.getSheetByName(PESTANA_HISTORIAL);
  const iClaseHistorial = COLUMNAS_HISTORIAL.indexOf('CLASE DE GASTO');
  const iProveedorHistorial = COLUMNAS_HISTORIAL.indexOf('PROVEEDOR');
  // Proveedor y clase de cada fila, para deducir la clase tras una
  // corrección de proveedor (una sola lectura, la misma que ya se hacía para las categorías).
  const historialProveedores = [];
  if (historial) {
    for (const fila of filasHistorial_(historial)) {
      const clase = textoCelda_(fila[iClaseHistorial]);
      if (clase) clases.add(clase);
      historialProveedores.push({ proveedor: textoCelda_(fila[iProveedorHistorial]), clase });
    }
  }
  return {
    saldo: centavos / 100, saldoInicialDefinido, categorias: [...clases], historialProveedores,
  };
}

/**
 * Lee un mensaje de texto con Gemini: { ok: true, datos } o { ok: false, motivo }. Nunca lanza:
 * cualquier falla (sin clave, sin red, HTTP != 200, bloqueo, JSON raro) es un motivo.
 * `preguntas` (opcional) = { textos, citado }, las preguntas abiertas del bot;
 * `entrada` (opcional) = los datos de la entrada que una corrección tocaría.
 * `claveGroq` (opcional): si Gemini falla del todo y hay clave de Groq, se intenta el
 * respaldo antes de rendirse; sin clave de Groq el comportamiento es el de hoy.
 */
function leerTextoGemini_(texto, categorias, clave, hoy, preguntas, entrada, claveGroq) {
  if (!clave) return { ok: false, motivo: 'falta GEMINI_API_KEY (ejecuta verificarPropiedades)' };
  // Gemini puede elegir un grupo de los 17 además de una etiqueta vieja de la hoja.
  const categoriasClase = [...categorias, ...nombresGrupos_()];
  const armarCuerpo = () => cuerpoTextoGemini_(texto, categoriasClase, hoy, preguntas, entrada);
  const { intento, lectura, groq } = llamarConRespaldoGroq_(
    () => llamarGeminiConReintento_(clave, CONFIG.MODELO_PRINCIPAL, armarCuerpo, undefined, Boolean(claveGroq)),
    armarCuerpo, categoriasClase, true, claveGroq,
  );
  if (groq) return groq;
  if (intento.error) return { ok: false, motivo: 'no se pudo conectar con Gemini' };
  if (intento.resultado.codigo !== 200) return { ok: false, motivo: describirError_(intento.resultado) };
  return lectura;
}

/** Texto de una pregunta abierta para Gemini: lo que todavía le falta a esa pregunta. */
const textoPreguntaAbierta_ = (p) => textoPreguntas_(p.preguntas || [], CONFIG.DEPOSITANTE_POR_DEFECTO);

/**
 * Preguntas abiertas que el bot todavía atiende: la pregunta diaria de saldo inicial
 * se quitó, pero en el _ESTADO en vivo pueden quedar filas `saldo_inicial` abiertas; se ignoran
 * (no van a Gemini y ninguna respuesta puede caer en ellas, ni citándolas con "Responder").
 */
const preguntasVigentes_ = (hojaEstado) => preguntasAbiertas_(filasEstado_(hojaEstado))
  .filter((p) => !(p.preguntas || []).includes('saldo_inicial'));

/**
 * Preguntas abiertas para dar contexto a Gemini: las 3 más recientes en palabras, más el
 * texto citado si el usuario usó "Responder" sobre un mensaje del bot.
 */
function preguntasParaGemini_(abiertas, mensaje) {
  const recientes = [...abiertas]
    .sort((a, b) => comoFecha_(b.creado).getTime() - comoFecha_(a.creado).getTime())
    .slice(0, 3);
  const textos = recientes.map(textoPreguntaAbierta_).filter(Boolean);
  const citaTexto = mensaje.reply_to_message && mensaje.reply_to_message.text;
  return { textos, citado: typeof citaTexto === 'string' ? citaTexto : null };
}

/** Manda algo a Telegram y devuelve su `result`; una respuesta que no es ok corta el trabajo. */
function enviarTelegram_(deps, metodo, cuerpo) {
  const resultado = deps.llamar(deps.token, metodo, cuerpo);
  if (!resultado.datos.ok) throw new Error(`Telegram ${metodo}: ${detalleTelegram_(resultado)}`);
  return resultado.datos.result || {};
}

/** Fecha del mensaje de Telegram (segundos Unix); sin ella, la hora del servidor. */
function fechaDeMensaje_(mensaje, ahora) {
  const segundos = mensaje.date;
  return typeof segundos === 'number' && Number.isFinite(segundos) ? new Date(segundos * 1000) : ahora;
}

/**
 * Lo común a cualquier mensaje: la hora del servidor, el chat, el sello de escritura y la fecha del
 * mensaje. Lo comparten el camino de texto y el de foto (MensajesFoto.js).
 */
function momentoDeMensaje_(mensaje, deps, chatId) {
  const ahora = deps.ahora();
  return {
    ahora,
    chatId,
    sello: deps.formatear(ahora, FORMATO_SELLO),
    fechaMensaje: deps.formatear(fechaDeMensaje_(mensaje, ahora), FORMATO_FECHA),
  };
}

/** Contexto de planTexto_ para un mensaje ya leído. */
function contextoTexto_(entorno, { idMensaje, fechaMensaje }) {
  const { ss, deps, resumen } = entorno;
  return {
    idMensaje,
    fechaMensaje,
    idsFactura: idsFacturaDelMes_(ss, fechaMensaje),
    // Un depósito atrasado se numera con los ID de su propio mes.
    idsFacturaDe: (fecha) => idsFacturaDelMes_(ss, fecha),
    depositante: CONFIG.DEPOSITANTE_POR_DEFECTO,
    // La ortografía ya usada de cada proveedor.
    historial: resumen.historialProveedores,
    saldoInicialDefinido: resumen.saldoInicialDefinido,
    saldoCalculado: resumen.saldo,
    aUsd: (monto, moneda, fecha) => montoEnUsd_(monto, moneda, fecha, deps.obtenerJson),
  };
}

/**
 * Escribe las filas del plan, responde por Telegram y solo entonces guarda en _ESTADO lo que
 * queda abierto (la clave de una pregunta es el message_id de esa respuesta). La fecha de otro
 * mes no escribe nada todavía: se resuelve aparte con botones.
 * `alRegistrar` (opcional) corre una sola vez cuando el registro ya quedó firme (filas escritas o
 * pregunta de fecha abierta; recibe las filas escritas) y antes de responder: ahí se cierra la pregunta que originó este
 * registro, para que un fallo al escribir la deje abierta y un reintento no duplique filas.
 * Devuelve las filas que escribió ([{ pestana, numero, fila }], vacío si no escribió ninguna), que
 * es lo que MensajesFoto.js necesita para la pregunta.
 */
function registrarPlan_(entorno, plan, ctx, datos, alRegistrar) {
  if (plan.fechaDistinta) {
    registrarFechaDistinta_(entorno, plan, ctx, datos);
    if (alRegistrar) alRegistrar([]);
    return [];
  }
  const { ss, momento } = entorno;
  // El registro de ediciones arranca antes de la primera fila del bot: su corte no puede quedar después de ella.
  if (plan.filas.length) asegurarEdiciones_(ss, entorno.deps, momento.sello);
  const escritas = plan.filas.length ? escribirFilas_(ss, plan.filas, momento.sello, momento.ahora) : [];
  if (alRegistrar) alRegistrar(escritas);
  responderPlan_(entorno, plan, ctx, datos, escritas);
  return escritas;
}

/**
 * Manda la respuesta y deja en _ESTADO lo que queda abierto: el conteo, la pregunta de lo que
 * falte y el REGISTRO de la confirmación. La clave de la pregunta y del REGISTRO es el message_id
 * de la respuesta que se acaba de enviar, así "Responder" sobre ella encuentra a qué apunta.
 * Si el envío falla las filas ya están escritas: igual se guarda todo, con el id del mensaje del
 * usuario como clave (responderle a su propio mensaje lo encuentra), y se relanza el error original
 * para que el webhook avise que revise la hoja. Nunca reescribe filas.
 */
function responderPlan_(entorno, plan, ctx, datos, escritas) {
  const { deps, momento } = entorno;
  const envio = {
    chat_id: momento.chatId,
    text: plan.respuesta || TEXTO_ANOTADO,
    // Solo el texto de confirmacionEntrada_ (Confirmacion.js) trae HTML y ya viene escapado; un
    // plan.respuesta cualquiera con "&" sin escapar tumbaría el envío (Telegram 400) y se perdería.
    ...(plan.html ? { parse_mode: 'HTML' } : {}),
  };
  let enviado;
  try {
    enviado = enviarTelegram_(deps, 'sendMessage',
      plan.conteo ? { ...envio, reply_markup: tecladoConteo_(ctx.idMensaje) } : envio);
  } catch (error) {
    guardarEstadoPlan_(entorno, plan, ctx, datos, escritas, ctx.idMensaje);
    throw error;
  }
  guardarEstadoPlan_(entorno, plan, ctx, datos, escritas, enviado.message_id);
}

/** Guarda en _ESTADO el conteo, la pregunta y el REGISTRO de un plan, con `clave` como llave. */
function guardarEstadoPlan_(entorno, plan, ctx, datos, escritas, clave) {
  const { hojaEstado, momento } = entorno;
  if (plan.conteo) abrirConteo_(hojaEstado, { idMensaje: ctx.idMensaje, ...plan.conteo }, momento.ahora);
  if (plan.preguntas.length) {
    guardarPregunta_(hojaEstado, preguntaEstado_({
      creado: momento.ahora,
      clave,
      preguntas: plan.preguntas,
      filas: escritas.map((e) => e.fila),
      pestana: escritas.length ? escritas[0].pestana : '',
      // La pregunta de monto no escribió nada: guarda el mensaje entero para registrarlo después.
      // `fechaIlegible` viaja con la pregunta de monto porque esa respuesta será la que
      // escriba las filas de la foto, y solo entonces se puede preguntar por la fecha.
      extra: plan.preguntas.includes('monto')
        ? {
          datos,
          fechaMensaje: ctx.fechaMensaje,
          idMensaje: ctx.idMensaje,
          ...(plan.fechaIlegible ? { fechaIlegible: plan.fechaIlegible } : {}),
        }
        : null,
    }));
  }
  if (plan.confirmable && escritas.length) {
    abrirRegistro_(hojaEstado, {
      clave,
      filas: escritas.map((e) => e.fila),
      pestana: escritas[0].pestana,
      datos,
      idFactura: escritas[0].fila['ID FACTURA'],
      fechaMensaje: ctx.fechaMensaje,
      idMensaje: ctx.idMensaje,
    }, momento.ahora);
  }
}

/** Agrega la pregunta de fecha distinta al final de _ESTADO (y de ninguna otra pestaña). */
function abrirFecha_(hojaEstado, { idMensaje, datos, fechaMensaje }, creado) {
  guardarPregunta_(hojaEstado, filaFecha_({ creado, idMensaje, datos, fechaMensaje }));
}

/** Fecha del recibo en otro mes: manda los dos botones y guarda la pregunta. */
function registrarFechaDistinta_(entorno, plan, ctx, datos) {
  const { hojaEstado, deps, momento } = entorno;
  const { fechaRecibo, fechaEnvio } = plan.fechaDistinta;
  enviarTelegram_(deps, 'sendMessage', {
    chat_id: momento.chatId,
    text: plan.respuesta,
    reply_markup: tecladoFecha_(ctx.idMensaje, fechaRecibo, fechaEnvio),
  });
  abrirFecha_(hojaEstado, { idMensaje: ctx.idMensaje, datos, fechaMensaje: ctx.fechaMensaje }, momento.ahora);
}

/**
 * A qué entrada ya registrada puede apuntar un mensaje: la confirmación que el usuario citó con
 * "Responder" y la última que el bot registró ("el último").
 * Se lee antes de llamar a Gemini, porque sus detalles van en la instrucción.
 */
function registrosDelMensaje_(hojaEstado, mensaje) {
  const abiertos = registrosAbiertos_(filasEstado_(hojaEstado));
  const citado = (mensaje.reply_to_message && mensaje.reply_to_message.message_id) || null;
  return {
    citado: citado === null ? null : buscarRegistro_(abiertos, citado),
    ultimo: ultimoRegistro_(abiertos),
  };
}

/** Contexto para rearmar una entrada corregida: la misma fecha, el mismo ID FACTURA. */
function contextoCorreccion_(entorno, registro, datos) {
  const ctx = contextoTexto_(entorno, {
    idMensaje: registro.idMensaje,
    // La fecha que el usuario acaba de dar manda; así una corrección no vuelve a preguntar el mes.
    fechaMensaje: datos.fecha || registro.fechaMensaje,
  });
  return {
    ...ctx,
    idsFactura: ctx.idsFactura.filter((id) => id !== registro.idFactura),
    idsFacturaDe: (fecha) => ctx.idsFacturaDe(fecha).filter((id) => id !== registro.idFactura),
    corregido: true,
    // claseTrasCorregirProveedor_ ya decidió la clase final antes de
    // llegar aquí; sin esto, claseDeGasto_ volvería a mirar el historial y
    // podría pisar una clase que la corrección trajo explícitamente.
    historial: [],
  };
}

/**
 * Deduce la clase del historial del proveedor cuando la corrección cambia el proveedor y no trae
 * su propia clase: si el historial no alcanza o no hay mayoría clara, la
 * deja PENDIENTE para que el bot vuelva a preguntar con la lista.
 */
function claseTrasCorregirProveedor_(entorno, registro, cambios, fusion) {
  const proveedorCambio = typeof cambios.proveedor === 'string' && cambios.proveedor.trim() !== '';
  const claseSinCambio = !cambios.clase || cambios.clase === 'PENDIENTE';
  if (!proveedorCambio || !claseSinCambio) return fusion.clase;
  const casa = fusion.casa || 'COMPARTIDO';
  const fecha = fusion.fecha || registro.fechaMensaje;
  const historial = (entorno.resumen && entorno.resumen.historialProveedores) || [];
  return claseInferidaProveedor_(historial, fusion.proveedor, casa, fecha) || 'PENDIENTE';
}

/** La corrección escribe el destino completo y limpia por tramos el origen completo. */
function escritosCorreccion_(filas, escritas) {
  const columnas = tramosEscritura_().flatMap((tramo) => tramo.columnas);
  return [
    ...filas.map((fila) => ({ pestana: fila.hoja.getName(), idFila: fila.idFila, columnas })),
    ...escritas.map((fila) => ({ pestana: fila.pestana, idFila: fila.fila['ID FILA'], columnas })),
  ];
}

/**
 * Reescribe la entrada con la corrección del usuario: escribe las filas nuevas,
 * luego limpia las viejas (nunca N ni GRUPO), cierra sus preguntas y su REGISTRO, y manda la
 * confirmación nueva con su propio REGISTRO. Si sus filas ya no están, no cambia nada. Devuelve
 * false solo si no corrigió por celdas editadas a mano.
 */
function corregirEntrada_(entorno, registro, cambios) {
  const { ss, hojaEstado, deps, momento } = entorno;
  const filas = filasDelRegistro_(ss, registro);
  if (!filas.length) {
    cerrarEstado_(hojaEstado, registro.fila);
    enviarTelegram_(deps, 'sendMessage', { chat_id: momento.chatId, text: TEXTO_REGISTRO_NO_ESTA });
    return;
  }
  const fusion = fusionarCorreccion_(registro.datos, cambios);
  const datos = { ...fusion, clase: claseTrasCorregirProveedor_(entorno, registro, cambios, fusion) };
  // Nada que cambiar (p. ej. un mensaje que no se entendió): la entrada se queda como está.
  if (!hayCambio_(registro.datos, datos)) {
    enviarTelegram_(deps, 'sendMessage', { chat_id: momento.chatId, text: TEXTO_NO_ENTENDI });
    return;
  }
  const ctx = contextoCorreccion_(entorno, registro, datos);
  const plan = planTexto_(datos, ctx);
  if (!plan.filas.length) {
    enviarTelegram_(deps, 'sendMessage', { chat_id: momento.chatId, text: plan.respuesta || TEXTO_NO_CLARO });
    return;
  }
  const desde = deps.ahora();
  const ediciones = registroParaEscribir_(ss, deps);
  if (tieneEdicionesManuales_(ediciones, filas.map((fila) => fila.valores['ID FILA']))) {
    enviarTelegram_(deps, 'sendMessage', { chat_id: momento.chatId, text: TEXTO_NO_CORRIJO_MANUAL });
    return false;
  }
  const escritas = escribirFilas_(ss, plan.filas, momento.sello, momento.ahora);
  limpiarFilas_(filas);
  avisarChoques_(ss, desde, () => escritosCorreccion_(filas, escritas), deps.propiedades);
  cerrarPreguntasDeFilas_(hojaEstado, registro.idFilas);
  cerrarEstado_(hojaEstado, registro.fila);
  responderPlan_(entorno, plan, ctx, datos, escritas);
  // Si la entrada vino de una foto y la corrección la pasó a otro mes, la foto se va
  // con ella (clasificarFoto_ no hace nada si ya está en la carpeta que le toca).
  moverFotoDelPlan_(deps, plan, datos);
}

/** Pide confirmar el borrado con botones; nada se borra sin el botón "Sí". */
function pedirBorrado_(entorno, registro) {
  const { ss, hojaEstado, deps, momento } = entorno;
  const ediciones = registroParaEscribir_(ss, deps);
  if (tieneEdicionesManuales_(ediciones, registro.idFilas)) {
    enviarTelegram_(deps, 'sendMessage', { chat_id: momento.chatId, text: TEXTO_NO_BORRO_MANUAL });
    return;
  }
  enviarTelegram_(deps, 'sendMessage', {
    chat_id: momento.chatId,
    text: textoPedirBorrado_(registro.resumen),
    reply_markup: tecladoBorrar_(registro.clave),
  });
  abrirBorrado_(hojaEstado, registro.clave, momento.ahora);
}

/**
 * Atajo de "borrar" sin Gemini (útil cuando Gemini está caído): citando una
 * confirmación con REGISTRO abierto pide ese borrado; sin citar nada, el de la
 * última entrada, o avisa si no hay ninguna. Citando un mensaje sin REGISTRO abierto
 * no entra aquí: sigue el camino de Gemini, igual que cualquier texto más largo que "borrar".
 * Nada se borra todavía sin el botón "Sí".
 */
function atenderBorrarSolo_(entorno, mensaje, texto, registros) {
  const { deps, momento } = entorno;
  if (!esBorrarSolo_(texto) || !(registros.citado || !mensaje.reply_to_message)) return false;
  const registro = registros.citado || registros.ultimo;
  if (!registro) {
    enviarTelegram_(deps, 'sendMessage', { chat_id: momento.chatId, text: TEXTO_REGISTRO_NO_ESTA });
    return true;
  }
  pedirBorrado_({ ...entorno, ss: deps.libro() }, registro);
  return true;
}

/**
 * Corrige o borra la entrada a la que apunta el mensaje. `soloCitado` atiende solo cuando el usuario
 * usó "Responder" sobre una confirmación (eso gana antes que las preguntas abiertas: es la forma
 * que le enseñamos); sin él atiende CORREGIR y BORRAR sobre la última entrada.
 * Devuelve true si el mensaje ya quedó atendido.
 */
function atenderCorreccion_(entorno, datos, soloCitado) {
  const { deps, momento, registros } = entorno;
  if (INTENCIONES_NO_CORRECCION.includes(datos.intencion)) return false;
  const pedido = INTENCIONES_CORRECCION.includes(datos.intencion);
  if (soloCitado ? !registros.citado : !pedido) return false;
  const registro = registros.citado || registros.ultimo;
  if (!registro) {
    enviarTelegram_(deps, 'sendMessage', { chat_id: momento.chatId, text: TEXTO_REGISTRO_NO_ESTA });
    return true;
  }
  if (datos.intencion === 'BORRAR') pedirBorrado_(entorno, registro);
  else corregirEntrada_(entorno, registro, datos);
  return true;
}

/**
 * La pregunta abierta a la que va este mensaje: la citada con "Responder" o la más reciente.
 * Una confirmación citada que ya no espera ningún dato no es una pregunta: es una corrección.
 * Tampoco lo es una confirmación con "(falta)" si el usuario pidió CORREGIR o BORRAR: eso gana a la
 * pregunta abierta y lo atiende atenderCorreccion_ (soloCitado) más abajo.
 */
function preguntaDelMensaje_(entorno, mensaje, datos) {
  const { hojaEstado, registros } = entorno;
  const citado = (mensaje.reply_to_message && mensaje.reply_to_message.message_id) || null;
  const abiertas = preguntasVigentes_(hojaEstado);
  const citada = citado === null ? null : abiertas.find((p) => p.idMensajeBot === citado);
  const pideCorreccion = registros.citado && INTENCIONES_CORRECCION.includes(datos.intencion);
  if (citada && !pideCorreccion) return { esRespuesta: true, pregunta: citada };
  if (registros.citado || datos.intencion !== 'RESPUESTA') return { esRespuesta: false, pregunta: null };
  return { esRespuesta: true, pregunta: preguntaDestino_(abiertas, citado, datos) };
}

/**
 * Si el mensaje contesta una pregunta abierta, la aplica y devuelve true. La respuesta de monto
 * vuelve a pasar por planTexto_ con la fecha y el id del mensaje original.
 */
function atenderRespuesta_(entorno, mensaje, datos) {
  const { ss, hojaEstado, deps, momento } = entorno;
  const { esRespuesta, pregunta } = preguntaDelMensaje_(entorno, mensaje, datos);
  if (!esRespuesta) return false;
  if (!pregunta) {
    enviarTelegram_(deps, 'sendMessage', { chat_id: momento.chatId, text: TEXTO_SIN_PREGUNTA });
    return true;
  }
  const opciones = {
    sello: momento.sello,
    ahora: momento.ahora,
    fechaMensaje: momento.fechaMensaje,
    idMensaje: mensaje.message_id,
    // El texto crudo y las categorías, para el mapeo determinístico de clase.
    texto: mensaje.text,
    categorias: entorno.resumen.categorias,
    // La ortografía ya usada de cada proveedor.
    historial: entorno.resumen.historialProveedores,
  };
  opciones.desde = deps.ahora();
  opciones.propiedades = deps.propiedades;
  opciones.registro = registroParaEscribir_(ss, deps, momento.sello);
  const aplicada = aplicarRespuesta_(ss, hojaEstado, pregunta, datos, opciones);
  // El REGISTRO de esas filas guarda los datos de cuando se anotaron: se pone al día con lo contestado.
  if (aplicada.porFila) sincronizarRegistros_(hojaEstado, pregunta.idFilas, aplicada.porFila);
  if (!aplicada.datosCompletos) {
    enviarTelegram_(deps, 'sendMessage', { chat_id: momento.chatId, text: aplicada.texto });
    return true;
  }
  const ctx = contextoTexto_(entorno, aplicada);
  const completos = aplicada.datosCompletos;
  const plan = planTexto_(completos, ctx);
  const escritas = registrarPlan_(entorno, plan, ctx, completos, () => cerrarPregunta_(hojaEstado, pregunta));
  // Si la foto tampoco traía fecha legible, esta respuesta es la que escribió las filas, así
  // que ahora es cuando se pregunta si la fecha del día en que la mandó está bien.
  preguntarFechaFotoSiHace_(entorno, {
    fechaIlegible: aplicada.fechaIlegible, escritas, idMensaje: aplicada.idMensaje,
  });
  // La foto de esta entrada se va a la carpeta del mes de sus filas (hasta ahora
  // estaba en "Por clasificar": el plan no había escrito nada).
  moverFotoDelPlan_(deps, plan, completos);
  return true;
}

/**
 * Atiende un acuse de recibo: manda una frase de ánimo, o la frase + recordatorio de lo que falta
 * si hay preguntas abiertas. Devuelve true.
 */
function responderAcuse_(mensaje, deps, hojaEstado) {
  const chatId = mensaje.chat.id;
  const abiertas = preguntasVigentes_(hojaEstado);
  const fraseAnimada = fraseAnimo_(mensaje.message_id);
  if (!abiertas.length) {
    enviarTelegram_(deps, 'sendMessage', { chat_id: chatId, text: fraseAnimada });
    return true;
  }
  const pregunta = [...abiertas]
    .sort((a, b) => comoFecha_(b.creado).getTime() - comoFecha_(a.creado).getTime())
    .shift();
  const textoRespuesta = fraseAnimada + '\n\n' + 'Todavía me falta esto: ' + textoPreguntaAbierta_(pregunta);
  enviarTelegram_(deps, 'sendMessage', { chat_id: chatId, text: textoRespuesta });
  return true;
}

/** Un mensaje del usuario: Gemini → plan de texto → Sheet → respuesta. */
function atenderMensaje_(mensaje, deps, hojaEstado) {
  const chatId = mensaje.chat.id;
  const texto = typeof mensaje.text === 'string' ? mensaje.text.trim() : '';
  // Una foto de factura tiene su propio camino (MensajesFoto.js); su leyenda solo va a
  // Gemini, así que se atiende antes de cualquier revisión del texto. Una foto mandada
  // "como archivo" llega en mensaje.document en vez de mensaje.photo (fotoDeMensaje_ decide).
  if (fotoDeMensaje_(mensaje)) {
    atenderFoto_(mensaje, deps, hojaEstado);
    return;
  }
  // Los demás adjuntos (documentos, audios, ubicaciones): se avisa y no se escribe nada.
  if (!texto) {
    enviarTelegram_(deps, 'sendMessage', { chat_id: chatId, text: TEXTO_SOLO_TEXTO });
    return;
  }
  // Un saludo o una petición de ayuda se contesta con la guía, sin Gemini ni Sheet.
  if (esSaludoOAyuda_(texto)) {
    enviarTelegram_(deps, 'sendMessage', { chat_id: chatId, text: textoGuia_() });
    return;
  }
  // Acuse de recibo (ok, listo, está bien, etc.) sin escribir nada ni llamar Gemini.
  if (esAcuse_(texto)) {
    responderAcuse_(mensaje, deps, hojaEstado);
    return;
  }
  const momento = momentoDeMensaje_(mensaje, deps, chatId);
  // Si hay una pregunta de fecha de foto esperando y el mensaje es SOLO una fecha
  // (DD/MM o DD/MM/AAAA), se aplica tal cual, sin Gemini.
  if (atenderFechaEscrita_({ hojaEstado, deps, momento }, mensaje, texto)) return;
  // Si una foto quedó esperando el total porque Gemini no la pudo leer y el
  // mensaje es SOLO un monto, se escribe la fila con ese total, también sin Gemini.
  if (atenderTotalEscrito_({ hojaEstado, deps, momento }, mensaje, texto)) return;
  // La respuesta a "¿A quién le pagaste en esa foto?" del modo preguntas.
  if (atenderProveedorEscrito_({ hojaEstado, deps, momento }, mensaje, texto)) return;
  const registros = registrosDelMensaje_(hojaEstado, mensaje);
  // "borrar" solo, sin Gemini (ver atenderBorrarSolo_).
  if (atenderBorrarSolo_({ hojaEstado, deps, momento }, mensaje, texto, registros)) return;
  const ss = deps.libro();
  const resumen = resumenHoja_(ss);
  const abiertas = preguntasVigentes_(hojaEstado);
  const entrada = registros.citado || registros.ultimo;
  const leido = leerTextoGemini_(texto, resumen.categorias, deps.claveGemini, momento.fechaMensaje,
    preguntasParaGemini_(abiertas, mensaje), entrada && entrada.datos, deps.claveGroq);
  if (!leido.ok) {
    console.warn(`Gemini de texto: ${leido.motivo}`);
    enviarTelegram_(deps, 'sendMessage', { chat_id: chatId, text: TEXTO_GEMINI_FALLO });
    return;
  }
  const entorno = { ss, hojaEstado, deps, momento, resumen, registros };
  // Una pregunta citada gana, salvo que la confirmación citada tenga CORREGIR o BORRAR: eso gana
  // a la pregunta abierta, con o sin nada pendiente.
  if (atenderRespuesta_(entorno, mensaje, leido.datos)) return;
  if (atenderCorreccion_(entorno, leido.datos, true)) return;
  if (atenderCorreccion_(entorno, leido.datos, false)) return;
  const ctx = contextoTexto_(entorno, { idMensaje: mensaje.message_id, fechaMensaje: momento.fechaMensaje });
  registrarPlan_(entorno, planTexto_(leido.datos, ctx), ctx, leido.datos);
}

/** Quita los botones del mensaje tocado; uno inaccesible llega con date 0 y no se puede editar. */
function quitarBotones_(entorno, callbackQuery) {
  const { deps, momento } = entorno;
  const mensaje = callbackQuery.message;
  if (mensaje && mensaje.date !== 0) {
    enviarTelegram_(deps, 'editMessageReplyMarkup', { chat_id: momento.chatId, message_id: mensaje.message_id });
  }
}

/** Aviso corto si el botón de fecha ya no corresponde a nada abierto (mismo texto del conteo). */
function respuestaFechaAtendida_(deps, callbackQuery) {
  enviarTelegram_(deps, 'answerCallbackQuery', { callback_query_id: callbackQuery.id, text: TEXTO_CONTEO_ATENDIDO });
}

/**
 * Atiende el toque de "fecha del recibo" / "día que lo mandé": vuelve a correr
 * planTexto_ con la fecha elegida (sus ID FACTURA salen del mes de esa fecha, no del de hoy),
 * cierra la pregunta (cuando ya registró, no antes) y sigue el camino normal de un mensaje (escribe, responde, abre una pregunta
 * nueva si algo más queda pendiente). Ya atendida o desconocida: solo contesta el botón.
 */
function atenderBotonFecha_(entorno, callbackQuery) {
  const { hojaEstado, deps, momento } = entorno;
  const boton = leerBotonFecha_(callbackQuery.data);
  const pregunta = boton ? buscarFecha_(filasEstado_(hojaEstado), boton.clave) : null;
  if (!pregunta || !pregunta.abierto) {
    respuestaFechaAtendida_(deps, callbackQuery);
    return;
  }
  enviarTelegram_(deps, 'answerCallbackQuery', { callback_query_id: callbackQuery.id });
  quitarBotones_(entorno, callbackQuery);
  const elegida = boton.recibo ? pregunta.datos.fecha : pregunta.fechaMensaje;
  const ctx = contextoTexto_(entorno, { idMensaje: pregunta.idMensaje, fechaMensaje: elegida });
  const datosElegidos = { ...pregunta.datos, fecha: elegida };
  const plan = planTexto_(datosElegidos, ctx);
  registrarPlan_(entorno, plan, ctx, datosElegidos, () => cerrarPregunta_(hojaEstado, pregunta));
  // Si la entrada vino de una foto, ahora que hay filas la foto va a la carpeta del mes.
  moverFotoDelPlan_(deps, plan, datosElegidos);
}

/**
 * Toque de "Sí, bórralo" / "No, déjalo". Cierra el borrado antes de limpiar, así
 * un segundo toque solo contesta "ya fue indicado" y nunca borra dos veces.
 */
function atenderBotonBorrar_(entorno, callbackQuery) {
  const { ss, hojaEstado, deps, momento } = entorno;
  const boton = leerBotonBorrar_(callbackQuery.data);
  const pedido = boton ? buscarBorrar_(filasEstado_(hojaEstado), boton.clave) : null;
  if (!pedido || !pedido.abierto) {
    respuestaFechaAtendida_(deps, callbackQuery);
    return;
  }
  enviarTelegram_(deps, 'answerCallbackQuery', { callback_query_id: callbackQuery.id });
  quitarBotones_(entorno, callbackQuery);
  cerrarEstado_(hojaEstado, pedido.fila);
  const texto = boton.si ? borrarEntrada_(ss, hojaEstado, boton.clave, deps) : TEXTO_NO_BORRADO;
  enviarTelegram_(deps, 'sendMessage', { chat_id: momento.chatId, text: texto });
}

/**
 * Un toque de botón: fecha de otro mes, borrado y aviso de duplicado se atienden aquí
 * mismo; conteo, y cualquier dato desconocido, lo resuelve BotonesApp.js (ya contesta "atendido"
 * si no encuentra nada).
 */
function atenderBoton_(callbackQuery, deps, hojaEstado) {
  const ss = deps.libro();
  const ahora = deps.ahora();
  const mensaje = callbackQuery.message;
  const momento = {
    ahora,
    chatId: (mensaje && mensaje.chat && mensaje.chat.id) || CONFIG.ERIN_CHAT_ID,
    sello: deps.formatear(ahora, FORMATO_SELLO),
    fechaMensaje: deps.formatear(ahora, FORMATO_FECHA),
  };
  const data = typeof callbackQuery.data === 'string' ? callbackQuery.data : '';
  // Cada prefijo tiene su propio atendedor; el conteo (y cualquier dato desconocido) queda abajo.
  const atendedores = [
    [PREFIJO_BORRAR, atenderBotonBorrar_],
    [PREFIJO_TOTAL_OCR, atenderBotonTotalOcr_],
    [PREFIJO_FORMA_PAGO, atenderBotonFormaPago_],
    [PREFIJO_FECHA_FOTO, atenderBotonFechaFoto_],
    [PREFIJO_FECHA, atenderBotonFecha_],
    [PREFIJO_DUPLICADO, atenderBotonDuplicado_],
  ];
  const elegido = atendedores.find(([prefijo]) => data.startsWith(`${prefijo}:`));
  if (elegido) {
    elegido[1]({ ss, hojaEstado, deps, momento, resumen: resumenHoja_(ss) }, callbackQuery);
    return;
  }
  const opciones = {
    saldoAhora: resumenHoja_(ss).saldo,
    fechaMensaje: momento.fechaMensaje,
    sello: momento.sello,
    ahora,
    chatId: momento.chatId,
  };
  const { llamadas } = atenderBotonConteo_(ss, hojaEstado, callbackQuery, opciones);
  llamadas.forEach(([metodo, cuerpo]) => enviarTelegram_(deps, metodo, cuerpo));
}

if (typeof module !== 'undefined') {
  module.exports = {
    obtenerJsonRed_, resumenHoja_, leerTextoGemini_, enviarTelegram_, fechaDeMensaje_,
    momentoDeMensaje_, contextoTexto_, registrarPlan_, atenderMensaje_, atenderBoton_,
    // Para FechaFotoApp.js (en Apps Script son globales; en Node las pruebas las ponen en global).
    quitarBotones_, respuestaFechaAtendida_, corregirEntrada_, escritosCorreccion_,
  };
}
