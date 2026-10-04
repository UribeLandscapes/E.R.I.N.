/**
 * Mensajes de Telegram, lógica pura: los textos fijos del bot y lo que se le pide a
 * Gemini para leer un mensaje de texto del usuario. No llama a ningún servicio de Google.
 * Usa esquemaExtraccion_ de Extraccion.js, sinTildes_ de Hoja.js, CONFIG de Config.js e
 * instruccionClases_ de Clases.js (los 17 grupos de clase de gasto).
 */
// Mensajes que se contestan con la guía (textoGuia_ de Texto.js) sin llamar a Gemini.
// "?" no está aquí: se reconoce aparte, porque al limpiar los signos no queda nada de texto.
const SALUDOS_AYUDA = Object.freeze(['hola', 'buenas', 'buenos dias', 'buenas tardes',
  'buenas noches', '/start', 'ayuda', '/ayuda']);
const ACUSES = Object.freeze(['ok', 'okay', 'oki', 'listo', 'esta bien', 'perfecto', 'gracias',
  'muchas gracias', 'dale', 'bien', 'vale']);
// Palabra sola que pide borrar, sin nada más ("borrar el último" no cuenta).
const PALABRAS_BORRAR = Object.freeze(['borrar', 'borra', 'borralo', 'borrala', 'borrarlo',
  'borrarla', 'elimina', 'eliminar', 'eliminalo', 'eliminala', 'eliminarlo', 'eliminarla']);
const TEXTO_GEMINI_FALLO = 'No pude leer tu mensaje ahora. Intenta de nuevo en un rato.';
// Cualquier adjunto que no sea una foto, una imagen o un PDF mandados como archivo (:
// el PDF ya se atiende igual que una foto; audios y otros documentos siguen sin leerse).
const TEXTO_SOLO_TEXTO = 'Solo leo texto, fotos y PDF. Si es una factura, mándamela como foto o PDF.';
const TEXTO_SIN_PREGUNTA = 'No tengo ninguna pregunta pendiente. Si quieres, mándame el gasto '
  + 'o el depósito otra vez.';
//: Gemini no pudo leer la foto que ya se archivó; el bot no la pierde, solo avisa.
// La foto no se pudo ni bajar de Telegram (nunca se archivó nada).
const TEXTO_FOTO_NO_BAJADA = 'No pude bajar tu foto de Telegram. Mándala otra vez, por favor.';
// Cuando llega un álbum, el candado se ocupa y un mensaje se queda sin atender a tiempo;
// se avisa sin usar el candado (WebhookApp.js: avisarSinCandado_) para que el usuario la vuelva a mandar.
// Varias fotos del mismo álbum (message.media_group_id) pierden el candado casi al mismo
// tiempo; cada una responde a su propia foto, pero el texto encadena según cuántas van avisadas.
const TEXTO_SIN_CANDADO_FOTO = 'Me llegaron varias fotos juntas y esta se me escapó. '
  + '¿Me la mandas otra vez, por favor?';
const TEXTO_SIN_CANDADO_FOTO_2 = 'Esta también.';
const TEXTO_SIN_CANDADO_FOTO_3 = 'Y esta otra.';
const TEXTO_SIN_CANDADO_MENSAJE = 'Me llegaron muchos mensajes a la vez y este no lo alcancé a leer. '
  + 'Mándamelo otra vez, por favor.';
// Un botón tocado con el candado ocupado se contesta con este aviso corto.
const TEXTO_SIN_CANDADO_BOTON = 'Estoy terminando otra cosa. Toca el botón otra vez en un minuto.';
// Algo truena al atender un mensaje; se intenta avisar una sola vez.
const TEXTO_FALLO_MENSAJE = 'Algo me falló con este mensaje. Revisa en la hoja si quedó anotado; '
  + 'si no, mándamelo otra vez.';
// Plantillas: {nombre} se reemplaza por CONFIG.NOMBRE_USUARIO en fraseAnimo_.
const FRASES_ANIMO = Object.freeze([
  '¡Gracias a ti, {nombre}! Todo en orden gracias a tu cuidado. ✨',
  '¡Excelente trabajo, {nombre}! Así da gusto. 👏',
  'Cuentas claras, casa tranquila. ¡Bien hecho, {nombre}! 🏡',
  '¡Vas súper bien, {nombre}! Cada detalle cuenta. 💪',
  'Tu orden hace la diferencia, {nombre}. ¡Gracias! 🙌',
  '¡Eso es, {nombre}! Constancia que se nota. 🌟',
  '¡Qué bien lo llevas, {nombre}! Sigue así. 🚀',
  'Pequeños pasos, grandes resultados. ¡Bravo, {nombre}! 👏',
  '¡Impecable, {nombre}! Da gusto trabajar contigo. ✨',
  'Tu esfuerzo se nota todos los días, {nombre}. ¡Gracias! 💛',
  '¡Lo estás haciendo increíble, {nombre}! 🌟',
  'Todo anotado y en su lugar. ¡Eres una crack, {nombre}! 💪',
  '¡{nombre}, tu dedicación brilla! ☀️',
  'Cada recibo cuenta, {nombre}, y tú no dejas pasar ninguno. 🧾',
  '¡Qué equipo hacemos, {nombre}! 🤝',
  '{nombre}, contigo todo fluye. ¡Gracias! 🌊',
  '¡Otro día bien llevado, {nombre}! 🎉',
  'Tu cuidado hace que todo funcione, {nombre}. 💚',
  '¡Así se hace, {nombre}! Paso a paso. 👣',
  '{nombre}, tu trabajo vale oro. 🏆',
  '¡Gracias por estar en todo, {nombre}! 🙏',
  '{nombre}, lo haces ver fácil. ¡Genial! 😄',
  '¡Detallista y constante, esa eres tú, {nombre}! 🌟',
  '{nombre}, gracias por tu cariño con esta casa. 🏠',
]);
const FORMATO_FECHA = 'yyyy-MM-dd';
const FORMATO_SELLO = 'yyyyMMdd-HHmmss';

/** Para comparar un saludo: sin tildes, en minúsculas y sin signos al principio ni al final. */
const normalizarSaludo_ = (texto) => sinTildes_(texto).toLowerCase().trim()
  .replace(/^[¿¡.,;:!?\s]+/, '')
  .replace(/[¿¡.,;:!?\s]+$/, '');

/**
 * true si el mensaje es un saludo o una petición de ayuda: el bot contesta la guía
 * sin llamar a Gemini y sin escribir nada. Un mensaje que empieza con "hola" pero sigue con un
 * gasto ("hola, gasté 25") no cuenta: solo el saludo solo.
 */
function esSaludoOAyuda_(texto) {
  const limpio = normalizarSaludo_(texto);
  if (!limpio) return /^[¿?]+$/.test(String(texto).trim());
  return SALUDOS_AYUDA.includes(limpio);
}

/**
 * true si el mensaje es solo un acuse de recibo: ok, listo, está bien, gracias,
 * etc. El mensaje debe ser SOLO el acuse, sin nada más ("ok, gasté 10" no cuenta). También
 * reconoce uno o más 👍 emojis solos. NO reconoce "sí" ni "no" porque contestan preguntas.
 */
function esAcuse_(texto) {
  const trimmed = String(texto).trim();
  if (!trimmed) return false;
  // Caso especial: solo 👍 emojis (con espacios opcionales)
  if (/^[\s👍]*👍[\s👍]*$/.test(trimmed)) return true;
  // Normalizar como los saludos: sin tildes, en minúsculas, sin signos al principio ni final
  const limpio = normalizarSaludo_(texto);
  return ACUSES.includes(limpio);
}

/**
 * true si el mensaje es SOLO una palabra de borrar: "borrar", "Bórralo!",
 * " BORRAR. ", etc. Con eso el bot pide confirmar el borrado sin llamar a Gemini (útil cuando
 * Gemini está caído). "borrar el último" u otro texto con más palabras NO cuenta: sigue el camino
 * normal por Gemini.
 */
function esBorrarSolo_(texto) {
  const limpio = normalizarSaludo_(texto);
  return PALABRAS_BORRAR.includes(limpio);
}

const conNombreUsuario_ = (plantilla) => plantilla.replaceAll('{nombre}', CONFIG.NOMBRE_USUARIO);

/**
 * Devuelve una frase de ánimo de FRASES_ANIMO (plantillas con {nombre} = CONFIG.NOMBRE_USUARIO)
 * rotando según idMensaje. Si idMensaje es un número no negativo, usa idMensaje % FRASES_ANIMO.length;
 * si no, devuelve la primera frase.
 */
function fraseAnimo_(idMensaje) {
  if (typeof idMensaje !== 'number' || !Number.isFinite(idMensaje) || idMensaje < 0) {
    return conNombreUsuario_(FRASES_ANIMO[0]);
  }
  return conNombreUsuario_(FRASES_ANIMO[idMensaje % FRASES_ANIMO.length]);
}

/**
 * Sección de la instrucción con las preguntas del bot sin contestar:
 * sin ella Gemini lee cada mensaje solo, sin saber qué preguntó el bot, y no entiende
 * "hoy"/"nada"/un nombre suelto como respuesta. Vacía si no hay preguntas abiertas.
 */
function instruccionPreguntas_(preguntas, hoy) {
  const textos = (preguntas && preguntas.textos) || [];
  if (!textos.length) return '';
  const citado = preguntas.citado ? ` El mensaje respondió con "Responder" a: "${preguntas.citado}".` : '';
  return [
    '',
    `El bot tiene estas preguntas sin contestar:${citado}`,
    ...textos.map((t) => `- ${t}`),
    `Si el mensaje es una respuesta corta a una de ellas, usa intención RESPUESTA y pon el dato en`,
    `su campo: una fecha en fecha ("hoy" = ${hoy}, "ayer" = día anterior), un monto en total`,
    '("nada", "cero", "no había" = 0), un nombre en proveedor, un tipo de gasto en',
    'clase de gasto (un grupo de la lista o una palabra como "super"). Si el mensaje es un gasto,',
    'depósito o conteo nuevo, usa esa intención aunque haya preguntas abiertas. Tolera errores de',
    'tipeo ("26 d esept" = 26 de septiembre).',
  ].join('\n');
}

/** Un monto para la instrucción; lo que no sea número se dice con palabras. */
const montoInstruccion_ = (valor) => (typeof valor === 'number' && Number.isFinite(valor)
  ? String(valor) : '(sin dato)');

/**
 * Sección con la entrada que una corrección tocaría: sin ella Gemini no
 * entiende "de esos 22.50, 1.50 fue propina". Vacía si el bot todavía no registró nada.
 */
function instruccionEntrada_(entrada) {
  if (!entrada) return '';
  const lineas = (entrada.lineas || [])
    .map((l) => `${l.tipo} ${l.descripcion || ''} ${montoInstruccion_(l.monto)}`.replace(/\s+/g, ' ').trim());
  return [
    '',
    'La última entrada que el bot registró (a esta apunta una corrección o un borrado):',
    `- proveedor: ${entrada.proveedor || '(sin dato)'}`,
    `- fecha: ${entrada.fecha || '(la del mensaje)'}`,
    `- total: ${montoInstruccion_(entrada.total)}`,
    `- líneas: ${lineas.length ? lineas.join(' | ') : '(una sola)'}`,
    `- forma de pago: ${entrada.forma_pago || 'DESCONOCIDA'}`,
    `- clase de gasto: ${entrada.clase || 'PENDIENTE'}`,
    `- casa: ${entrada.casa || 'COMPARTIDO'}`,
    `- comentario: ${entrada.comentario || '(ninguno)'}`,
    'Si el mensaje cambia algo de esa entrada, usa CORREGIR y llena SOLO lo que cambia (el resto',
    'en null, DESCONOCIDA o PENDIENTE). Si trae líneas, reemplazan todas las de la entrada.',
  ].join('\n');
}

/**
 * Instrucción de sistema para leer un mensaje de texto del usuario; `hoy` = 'AAAA-MM-DD' en la zona
 * del script. Nunca adivina: lo que el mensaje no diga queda null o PENDIENTE. `preguntas` (opcional)
 * = { textos, citado } con las preguntas abiertas del bot; `entrada` (opcional) =
 * los datos de la entrada que una corrección tocaría.
 */
function instruccionTexto_(hoy, preguntas, entrada) {
  return [
    'Eres el asistente de la caja chica de una casa. Lees mensajes cortos de WhatsApp/Telegram',
    'escritos por la persona que administra el efectivo y devuelves solo el JSON del esquema.',
    '',
    'Decide la intención del mensaje:',
    '- GASTO: gastó dinero de la caja ("25 efectivo taxi", "pagué 18.50 en el super").',
    '- DEPOSITO: entró dinero a la caja ("depósito 200", "me dieron 150").',
    '- CONTEO: dice cuánto efectivo hay ahora ("tengo 85", "quedan 40 en la caja").',
    '- SALDO_INICIAL: dice con cuánto empezó la caja ("saldo inicial 150").',
    '- RESPUESTA: contesta algo que el bot le preguntó (un nombre, una fecha, un monto suelto).',
    '- AYUDA: saluda, pide ayuda o pregunta cómo funciona esto ("¿cómo funciona esto?",',
    '  "qué puedo escribirte").',
    '- CORREGIR: cambia algo que ya se anotó ("corrige el último: el proveedor es Seven 11",',
    '  "de esos 22.50, 1.50 fue propina", "la forma de pago es tarjeta", "comentario: para la fiesta").',
    '- BORRAR: pide quitar lo que se anotó ("borra el último", "borrar", "no debí anotar eso").',
    '- OTRO: cualquier otra cosa.',
    '',
    'FORMA DE PAGO: si el mensaje dice "yappy" ("15 yappy farmacia"; al corregir, "lo pagué por yappy"),',
    'forma_pago es YAPPY, no TRANSFERENCIA; una transferencia bancaria es TRANSFERENCIA.',
    '"Yappy" mal escrito ("yapi", "yapy", "yappi", "yapii", "llapi", "japi", o parecido) también es forma_pago YAPPY.',
    '',
    `Hoy es ${hoy} en la zona ${CONFIG.TIMEZONE}. Con eso resuelve las fechas relativas`,
    '("ayer", "el lunes") y escribe la fecha como AAAA-MM-DD. Si el mensaje no dice ninguna',
    'fecha, deja fecha en null: el bot usa el día del mensaje, no hace falta adivinar.',
    '',
    'CLASE DE GASTO: elige solo un valor de la lista cerrada del esquema (los 17 grupos de abajo,',
    'más las etiquetas viejas que ya usa la hoja). Nunca inventes una categoría nueva.',
    '',
    instruccionClases_(),
    '',
    'Nunca adivines: cada dato que el mensaje no diga con claridad va en null (o PENDIENTE donde',
    'el esquema solo acepta texto). Es mejor dejarlo vacío que equivocarse; el bot pregunta',
    'después. Los montos van como número, sin símbolo de moneda y con punto decimal.',
    '',
    ...instruccionCasas_(),
    'Si el mensaje dice a cuál casa va el gasto, pon PRINCIPAL o SECUNDARIA en casa; si no lo dice,',
    'deja casa en null (el bot lo registra como compartido). No adivines la casa. Si el usuario nombra una casa y la',
    'lista de categorías tiene una variante para esa casa, elige esa variante en clase.',
    'Si el mensaje pide guardar una nota ("comentario: para la fiesta"), ponla en comentario; si no',
    'pide ninguna, deja comentario en null.',
    instruccionPreguntas_(preguntas, hoy),
    instruccionEntrada_(entrada),
  ].join('\n');
}

/**
 * Cuerpo de generateContent para un texto del usuario (salida JSON con el esquema de extracción).
 * `preguntas` (opcional) = { textos, citado }, las preguntas abiertas del bot;
 * `entrada` (opcional) = la entrada que una corrección tocaría.
 */
function cuerpoTextoGemini_(texto, categorias, hoy, preguntas, entrada) {
  return {
    systemInstruction: { parts: [{ text: instruccionTexto_(hoy, preguntas, entrada) }] },
    contents: [{ role: 'user', parts: [{ text: texto }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseJsonSchema: esquemaExtraccion_(categorias, true),
    },
  };
}

if (typeof module !== 'undefined') {
  module.exports = {
    TEXTO_GEMINI_FALLO, TEXTO_SOLO_TEXTO, TEXTO_SIN_PREGUNTA, TEXTO_FOTO_NO_BAJADA,
    TEXTO_SIN_CANDADO_FOTO, TEXTO_SIN_CANDADO_FOTO_2, TEXTO_SIN_CANDADO_FOTO_3, TEXTO_SIN_CANDADO_MENSAJE,
    TEXTO_SIN_CANDADO_BOTON, TEXTO_FALLO_MENSAJE,
    FRASES_ANIMO, FORMATO_FECHA, FORMATO_SELLO,
    instruccionTexto_, cuerpoTextoGemini_, esSaludoOAyuda_, esAcuse_, esBorrarSolo_, fraseAnimo_,
  };
}
