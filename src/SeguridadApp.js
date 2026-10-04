/**
 * Prueba en vivo de la deduplicación (Telegram reintenta el mismo update). No se puede
 * obligar a Telegram a reintentar, así que probarRepetido pasa un update falso del usuario ("hola",
 * update_id negativo único) por procesarUpdate_ con la caché y la pestaña _ESTADO reales, pero con un
 * envío a Telegram de mentira: el usuario no recibe nada. Usa procesarUpdate_, dependenciasReales_,
 * PREFIJO_CACHE_UPDATE, FILAS_REVISADAS_UPDATE y TIPO_ESTADO_UPDATE (WebhookApp.js), COLUMNAS_ESTADO
 * (Hoja.js), ocultarSecreto_ (Webhook.js) y CONFIG (Config.js).
 */
const TEXTO_PRUEBA_REPETIDO = 'hola';
const RESPUESTA_TELEGRAM_FALSA = Object.freeze({ codigo: 200, datos: { ok: true, result: { message_id: 1 } } });

/** El evento de doPost que Telegram mandaría para un mensaje del usuario. El secreto solo viaja aquí. */
function armarUpdateRepetido_(idUpdate, secreto) {
  const update = {
    update_id: idUpdate,
    message: {
      message_id: 1, date: Math.floor(Date.now() / 1000), text: TEXTO_PRUEBA_REPETIDO,
      chat: { id: CONFIG.ERIN_CHAT_ID, type: 'private' },
    },
  };
  return { parameter: { k: secreto }, postData: { contents: JSON.stringify(update) } };
}

/** Borra de _ESTADO las filas UPDATE con esa clave (de abajo hacia arriba). Devuelve cuántas borró. */
function borrarFilasUpdate_(hoja, idUpdate) {
  if (!hoja) return 0;
  const ultima = hoja.getLastRow();
  const filas = Math.min(ultima - 1, FILAS_REVISADAS_UPDATE);
  if (filas < 1) return 0;
  const iTipo = COLUMNAS_ESTADO.indexOf('TIPO');
  const iClave = COLUMNAS_ESTADO.indexOf('CLAVE');
  const inicio = ultima - filas + 1;
  const valores = hoja.getRange(inicio, iTipo + 1, filas, iClave - iTipo + 1).getValues();
  let borradas = 0;
  for (let i = valores.length - 1; i >= 0; i -= 1) {
    if (valores[i][0] === TIPO_ESTADO_UPDATE && String(valores[i][iClave - iTipo]) === String(idUpdate)) {
      hoja.deleteRow(inicio + i);
      borradas += 1;
    }
  }
  return borradas;
}

/** Un paso: corre procesarUpdate_ y compara con lo esperado. Un error del paso cuenta como FALLA. */
function pasoRepetido_(deps, evento, nombre, esperado) {
  let obtenido;
  try {
    obtenido = procesarUpdate_(evento, deps);
  } catch (error) {
    obtenido = `error: ${(error && error.message) || error}`;
  }
  const ok = obtenido === esperado;
  return ocultarSecreto_(`${nombre}: ${ok ? 'OK' : 'FALLA'} (esperado "${esperado}", salió "${obtenido}")`);
}

/**
 * Núcleo testeable. `deps` trae un `llamar` falso; `deps.log` recibe cada línea. Pasos: atendido,
 * repetido (caché), repetido (solo _ESTADO, sin caché). Al final limpia la caché y sus filas UPDATE.
 */
function probarRepetido_(deps, idUpdate) {
  const lineas = [];
  const anotar = (linea) => { lineas.push(linea); deps.log(linea); };
  const evento = armarUpdateRepetido_(idUpdate, deps.secreto);
  const clave = PREFIJO_CACHE_UPDATE + idUpdate;
  try {
    anotar(pasoRepetido_(deps, evento, 'paso 1, primera vez', `atendido (update ${idUpdate})`));
    anotar(pasoRepetido_(deps, evento, 'paso 2, repetido por la caché', `repetido (update ${idUpdate})`));
    deps.cache.remove(clave);
    anotar(pasoRepetido_(deps, evento, 'paso 3, sin caché (por _ESTADO)', `repetido (update ${idUpdate})`));
  } finally {
    try {
      deps.cache.remove(clave);
      const candado = deps.candadoLimpieza();
      if (!candado.tryLock(30000)) {
        anotar(`limpieza: OMITIDA (candado ocupado); borra a mano la fila UPDATE ${idUpdate} de ${PESTANA_ESTADO}`);
      } else {
        try {
          const borradas = borrarFilasUpdate_(deps.hojaEstado(), idUpdate);
          anotar(`limpieza: OK (${borradas} fila(s) UPDATE borrada(s)); envíos falsos: ${deps.llamadas ? deps.llamadas.length : 0}`);
        } finally {
          candado.releaseLock();
        }
      }
    } catch (error) {
      anotar(ocultarSecreto_(`limpieza: FALLA (${(error && error.message) || error}); borra a mano la fila UPDATE ${idUpdate} de ${PESTANA_ESTADO}`));
    }
  }
  return lineas;
}

/** Dependencias reales (caché, _ESTADO, candado) con el envío a Telegram cambiado por uno que solo anota. */
function dependenciasSeguridad_() {
  const llamadas = [];
  return {
    ...dependenciasReales_(),
    candadoLimpieza: () => LockService.getScriptLock(),
    llamadas,
    llamar: (token, metodo, cuerpo) => {
      llamadas.push({ metodo, cuerpo });
      return RESPUESTA_TELEGRAM_FALSA;
    },
    log: (linea) => Logger.log(linea),
  };
}

/** Ejecutar desde el editor (SeguridadApp.js): deduplicación de updates. El usuario no recibe nada. */
function probarRepetido() {
  return probarRepetido_(dependenciasSeguridad_(), -Date.now());
}

if (typeof module !== 'undefined') {
  module.exports = {
    armarUpdateRepetido_, borrarFilasUpdate_, probarRepetido_, dependenciasSeguridad_, probarRepetido,
  };
}
