/**
 * Helpers de limpieza de Drive y de la hoja: contenido de una carpeta, volver a ocultar _ESTADO y
 * _HISTORIAL, y cerrar las entradas ABIERTAS de _ESTADO cuya pestaña ya no existe.
 * Nunca tocan _HISTORIAL. El flujo de limpieza de datos de prueba vigente es
 * `revisarDatosDePrueba` / `borrarDatosDePrueba` (LimpiezaPruebaApp.js).
 * Usa conteosProtegidosLimpieza_ de LimpiezaPrueba.js. cerrarRegistrosSinPestana_ usa además
 * PREGUNTA_ABIERTA y leerDatosEstado_ de Escritura.js, PREGUNTA_CERRADA y celdaEstado_ de EscrituraApp.js,
 * COLUMNAS_ESTADO de Hoja.js y ESPERA_CANDADO_LIMPIEZA_MS de LimpiezaPruebaApp.js.
 */
/** { subcarpetas, archivos } de una carpeta, como arreglos (los iteradores de Drive se consumen una vez). */
function contenidoCarpeta_(carpeta) {
  const subcarpetas = [];
  const itCarpetas = carpeta.getFolders();
  while (itCarpetas.hasNext()) subcarpetas.push(itCarpetas.next());
  const archivos = [];
  const itArchivos = carpeta.getFiles();
  while (itArchivos.hasNext()) archivos.push(itArchivos.next());
  return { subcarpetas, archivos };
}

/** Vuelve a ocultar _ESTADO y _HISTORIAL si algo (como la prueba en vivo) las dejó visibles. */
function ocultarPestanasAuxiliares_(ss) {
  return [PESTANA_ESTADO, PESTANA_HISTORIAL].map((nombre) => {
    const hoja = ss.getSheetByName(nombre);
    if (!hoja) return `${nombre}: no existe`;
    if (hoja.isSheetHidden()) return `${nombre}: ya oculta`;
    hoja.hideSheet();
    return `${nombre}: oculta`;
  });
}

/**
 * Cierra en _ESTADO las entradas ABIERTAS cuya pestaña (DATOS.pestana) ya no existe en el libro,
 * p. ej. una pestaña de prueba borrada a mano. No toca las cerradas, las que aún tienen pestaña ni
 * las que no dicen pestaña. Con el candado del script. Devuelve las líneas del registro (también van
 * a deps.log): una por entrada cerrada (clave, pestaña, ID FILAS) y el total.
 */
function cerrarRegistrosSinPestana_(deps) {
  const lineas = [];
  const anotar = (linea) => { lineas.push(linea); deps.log(linea); return lineas; };
  if (!deps.candado.tryLock(ESPERA_CANDADO_LIMPIEZA_MS)) {
    return anotar('PARO: no se pudo tomar el candado; no se tocó nada');
  }
  try {
    const ss = deps.libro();
    const estado = ss.getSheetByName(PESTANA_ESTADO);
    if (!estado) return anotar(`PARO: no existe ${PESTANA_ESTADO}; no se tocó nada`);
    const sinPestana = entradasAbiertasSinPestana_(ss, estado);
    sinPestana.forEach(({ fila, clave, pestana, idsFilas }) => {
      celdaEstado_(estado, fila, 'ESTADO').setValue(PREGUNTA_CERRADA);
      anotar(`Cerrada: clave ${clave}, pestaña ${pestana}, ID FILAS ${idsFilas}`);
    });
    return anotar(sinPestana.length ? `Total: ${sinPestana.length} registros cerrados` : 'Nada que cerrar');
  } finally {
    deps.candado.releaseLock();
  }
}

/** Entradas ABIERTAS de _ESTADO con { fila, clave, pestana, idsFilas } cuya pestaña no está en el libro. */
function entradasAbiertasSinPestana_(ss, estado) {
  const ultima = estado.getLastRow();
  if (ultima < 2) return [];
  const col = (nombre) => COLUMNAS_ESTADO.indexOf(nombre);
  return estado.getRange(2, 1, ultima - 1, COLUMNAS_ESTADO.length).getValues()
    .map((valores, i) => ({ valores, fila: i + 2 }))
    .filter(({ valores }) => valores[col('ESTADO')] === PREGUNTA_ABIERTA)
    .map(({ valores, fila }) => {
      const datos = leerDatosEstado_(valores[col('DATOS')]);
      return { fila, clave: valores[col('CLAVE')], pestana: datos && datos.pestana, idsFilas: valores[col('ID FILAS')] };
    })
    .filter(({ pestana }) => typeof pestana === 'string' && pestana !== '' && !ss.getSheetByName(pestana));
}

/** Ejecutar a mano desde el editor (LimpiezaApp.js), sin disparador. Correrla otra vez no cambia nada. */
function cerrarRegistrosSinPestana() {
  return cerrarRegistrosSinPestana_({
    libro: () => SpreadsheetApp.openById(CONFIG.SHEET_ID),
    candado: LockService.getScriptLock(),
    log: (linea) => Logger.log(linea),
  });
}

if (typeof module !== 'undefined') {
  module.exports = {
    contenidoCarpeta_,
    ocultarPestanasAuxiliares_, cerrarRegistrosSinPestana_, cerrarRegistrosSinPestana,
  };
}
