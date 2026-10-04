/** Conteos puros para. Usa ORIGEN_MANUAL de Edicion.js
 * y valorColumna_ de HojaApp.js. */

/** Filas MANUAL y filas BOT con anotaciones reales; no cuenta en esta limpieza. */
function conteosProtegidosLimpieza_(mes, registro) {
  let manuales = 0;
  let anotadas = 0;
  for (const fila of mes.filas) {
    const id = String(valorColumna_(fila, mes.encabezados, 'ID FILA')).trim();
    const origen = String(valorColumna_(fila, mes.encabezados, 'ORIGEN')).trim();
    if (origen === ORIGEN_MANUAL || id.startsWith(`${ORIGEN_MANUAL}-`)) manuales += 1;
    else if (registro.porId.has(id)) anotadas += 1;
  }
  return { manuales, anotadas };
}

if (typeof module !== 'undefined') module.exports = { conteosProtegidosLimpieza_ };
