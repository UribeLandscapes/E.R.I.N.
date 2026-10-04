/**
 * Limpieza de los datos de prueba. Dos funciones de editor, en este orden:
 *  1. revisarDatosDePrueba: solo lee. Registra qué hay (filas por pestaña de mes, entradas ABIERTAS
 *     de _ESTADO, archivos bajo Facturas) y guarda una "huella" (conteos) en la
 *     propiedad LIMPIEZA_REVISADA; es lo único que escribe.
 *  2. borrarDatosDePrueba: toma el candado, vuelve a contar y solo sigue si la huella es igual a la
 *     revisada. Etapas, en este orden: vaciar pestañas de mes (clearContent de la fila 6
 *     hacia abajo, menos las columnas de desborde como GRUPO), cerrar todo lo ABIERTO en _ESTADO,
 *     archivos de Facturas a la papelera (las carpetas se quedan) y, al final,
 *     borrar LIMPIEZA_REVISADA. Nunca toca _HISTORIAL.
 * Si una etapa falla se registra cuál y el error se vuelve a lanzar (ejecución en rojo); las etapas
 * anteriores quedan hechas y LIMPIEZA_REVISADA se conserva: corre la revisión de nuevo y luego borrar
 * (las etapas ya hechas son idempotentes, solo cambia la huella).
 * Usa CONFIG de Config.js; COLUMNAS, FILA_ENCABEZADOS (vía encabezadosDe_), PRIMERA_FILA_DATOS,
 * COLUMNAS_ESTADO y leerPestanaMes_ de Hoja.js; ORIGEN_BOT y PREGUNTA_ABIERTA de Escritura.js;
 * PREGUNTA_CERRADA y celdaEstado_ de EscrituraApp.js; PESTANA_ESTADO, encabezadosDe_, filasConDatos_,
 * valorColumna_, filasAjenas_ y COLUMNAS_DESBORDE_VIEJAS de HojaApp.js; contenidoCarpeta_ de
 * LimpiezaApp.js.
 * Usa leerRegistroEdiciones_ de EdicionesApp.js
 * y conteosProtegidosLimpieza_ de LimpiezaPrueba.js.
 */
const ESPERA_CANDADO_LIMPIEZA_MS = 30000;
const CLAVE_LIMPIEZA_REVISADA = 'LIMPIEZA_REVISADA';

const textoDe_ = (error) => (error && error.message) || String(error);

/** Valor de celda como texto de registro: las fechas de la hoja salen AAAA-MM-DD. */
const textoValor_ = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v));

/** Todos los archivos sin papelera bajo la carpeta, con su ruta ("Facturas/2026/9. Septiembre"). */
function archivosBajo_(carpeta, ruta) {
  const { subcarpetas, archivos } = contenidoCarpeta_(carpeta);
  const propios = archivos.filter((a) => !a.isTrashed()).map((archivo) => ({ archivo, ruta }));
  return subcarpetas.reduce(
    (todos, sub) => todos.concat(archivosBajo_(sub, `${ruta}/${sub.getName()}`)),
    propios,
  );
}

/** Entradas ABIERTAS de _ESTADO (de cualquier tipo): { fila (número en la hoja), tipo, clave }. */
function abiertasDeEstado_(hojaEstado) {
  if (!hojaEstado || hojaEstado.getLastRow() < 2) return [];
  const col = (nombre) => COLUMNAS_ESTADO.indexOf(nombre);
  return hojaEstado.getRange(2, 1, hojaEstado.getLastRow() - 1, COLUMNAS_ESTADO.length).getValues()
    .map((fila, i) => ({ fila: i + 2, tipo: fila[col('TIPO')], clave: fila[col('CLAVE')], estado: fila[col('ESTADO')] }))
    .filter((e) => e.estado === PREGUNTA_ABIERTA)
    .map(({ fila, tipo, clave }) => ({ fila, tipo, clave }));
}

/** Pestañas de mes con sus filas de datos: { hoja, nombre, encabezados, filas }. */
function pestanasMesDe_(libro) {
  return libro.getSheets().filter((hoja) => leerPestanaMes_(hoja.getName()) !== null).map((hoja) => {
    const encabezados = encabezadosDe_(hoja);
    return { hoja, nombre: hoja.getName(), encabezados, filas: filasConDatos_(hoja, encabezados) };
  });
}

/** Lo que hay hoy: pestañas, _ESTADO abierto, archivos de Drive (sin papelera). */
function inventarioPrueba_(deps) {
  const libro = deps.libro();
  const registro = leerRegistroEdiciones_(libro, deps.propiedades);
  const meses = pestanasMesDe_(libro).map((mes) => ({
    ...mes, ...conteosProtegidosLimpieza_(mes, registro),
  }));
  const raiz = deps.raiz();
  const hojaEstado = libro.getSheetByName(PESTANA_ESTADO);
  return {
    meses,
    registroDisponible: registro.disponible,
    hojaEstado,
    abiertas: abiertasDeEstado_(hojaEstado),
    archivos: archivosBajo_(raiz, raiz.getName()),
  };
}

/** Huella: solo conteos, en un JSON de orden fijo; si cambia algo entre revisar y borrar, cambia. */
const huellaDe_ = (inv) => JSON.stringify({
  meses: inv.meses.map((m) => [m.nombre, m.filas.length, m.manuales, m.anotadas]),
  registroDisponible: inv.registroDisponible,
  abiertas: inv.abiertas.length,
  archivos: inv.archivos.length,
});

/** Una línea por fila de una pestaña; marca las que no son del bot y si tiene foto. */
function lineasFilasMes_(mes) {
  const ajenas = new Set(filasAjenas_(mes.filas, mes.encabezados));
  const v = (fila, nombre) => valorColumna_(fila, mes.encabezados, nombre);
  return mes.filas.map((fila) => {
    const esDeposito = String(v(fila, 'DEPÓSITO')).trim() !== '';
    const monto = esDeposito ? `DEPÓSITO ${textoValor_(v(fila, 'DEPÓSITO'))}` : `GASTO (USD) ${textoValor_(v(fila, 'GASTO (USD)'))}`;
    const foto = String(v(fila, 'FOTO')).trim() !== '' ? 'sí' : 'no';
    const partes = [
      `  fila ${fila.numero}`, `FECHA ${textoValor_(v(fila, 'FECHA'))}`, `PROVEEDOR ${textoValor_(v(fila, 'PROVEEDOR'))}`,
      monto, `TIPO ${textoValor_(v(fila, 'TIPO'))}`, `ORIGEN ${textoValor_(v(fila, 'ORIGEN'))}`, `FOTO ${foto}`,
    ];
    if (ajenas.has(`fila ${fila.numero}`)) partes.push('no es del bot');
    return partes.join(' | ');
  });
}

/** Líneas de Drive: cada archivo con su ruta, "enlazada" si alguna FOTO de alguna fila contiene su id. */
function lineasArchivos_(inv) {
  const fotos = inv.meses.flatMap((m) => m.filas.map((f) => String(valorColumna_(f, m.encabezados, 'FOTO'))));
  return [
    `Drive: ${inv.archivos.length} archivo(s) sin papelera bajo Facturas`,
    ...inv.archivos.map(({ archivo, ruta }) => {
      const enlazada = fotos.some((url) => url.includes(archivo.getId()));
      return `  ${ruta}/${archivo.getName()} | ${enlazada ? 'enlazada' : 'suelta'}`;
    }),
  ];
}

/** Todas las líneas de la revisión, sin la huella. */
function lineasRevision_(inv) {
  const lineas = inv.meses.flatMap((m) => [
    `Pestaña ${m.nombre}: ${m.filas.length} fila(s) con datos`,
    `  ${m.manuales} fila(s) MANUAL; ${m.anotadas} fila(s) con celdas editadas a mano`,
    ...lineasFilasMes_(m),
  ]);
  lineas.push(`_EDICIONES: ${inv.registroDisponible ? 'disponible' : 'no disponible'}`);
  lineas.push(inv.hojaEstado ? `_ESTADO: ${inv.abiertas.length} entrada(s) abierta(s)` : '_ESTADO: no existe');
  inv.abiertas.forEach((a) => lineas.push(`  fila ${a.fila} | TIPO ${a.tipo} | CLAVE ${a.clave}`));
  return lineas.concat(lineasArchivos_(inv));
}

/**
 * REVISIÓN: solo lee y registra qué se borraría. Lo único que escribe es LIMPIEZA_REVISADA (la huella).
 * Devuelve las líneas del registro (también van a deps.log una por una).
 */
function revisarDatosDePrueba_(deps) {
  const inv = inventarioPrueba_(deps);
  const huella = huellaDe_(inv);
  const lineas = [
    ...lineasRevision_(inv), `Huella: ${huella}`,
    `Guardada en ${CLAVE_LIMPIEZA_REVISADA}. Siguiente paso: borrarDatosDePrueba`,
  ];
  deps.propiedades.setProperty(CLAVE_LIMPIEZA_REVISADA, huella);
  lineas.forEach((l) => deps.log(l));
  return lineas;
}

/** Bloques contiguos de columnas (1 = primera) cuyo encabezado no es de desborde: [{ inicio, ancho }]. */
function bloquesSinDesborde_(encabezados) {
  const bloques = [];
  encabezados.forEach((nombre, i) => {
    if (COLUMNAS_DESBORDE_VIEJAS.includes(nombre)) return;
    const ultimo = bloques[bloques.length - 1];
    if (ultimo && ultimo.inicio + ultimo.ancho === i + 1) ultimo.ancho += 1;
    else bloques.push({ inicio: i + 1, ancho: 1 });
  });
  return bloques;
}

/** ClearContent de la fila 6 al fondo, por bloque de columnas. Devuelve las filas con datos vaciadas. */
function vaciarPestanaMes_(mes) {
  const cuantas = mes.hoja.getMaxRows() - PRIMERA_FILA_DATOS + 1;
  if (cuantas < 1) return 0;
  bloquesSinDesborde_(mes.encabezados).forEach(({ inicio, ancho }) => {
    mes.hoja.getRange(PRIMERA_FILA_DATOS, inicio, cuantas, ancho).clearContent();
  });
  return mes.filas.length;
}

/** Etapa: corre `hacer`, registra su línea; si falla registra la etapa y relanza. */
function etapaLimpieza_(nombre, anotar, hacer) {
  try {
    anotar(hacer());
  } catch (error) {
    anotar(`ERROR en la etapa ${nombre}: ${textoDe_(error)}`);
    throw error;
  }
}

/** Las etapas de borrado, en orden; cada una devuelve su línea de registro. */
function etapasBorrado_(deps, inv) {
  return [
    ['Pestañas de mes', () => {
      const filas = inv.meses.reduce((n, mes) => n + vaciarPestanaMes_(mes), 0);
      return `Pestañas de mes: ${filas} fila(s) con datos vaciadas en ${inv.meses.length} pestaña(s)`;
    }],
    [PESTANA_ESTADO, () => {
      inv.abiertas.forEach((a) => celdaEstado_(inv.hojaEstado, a.fila, 'ESTADO').setValue(PREGUNTA_CERRADA));
      return `${PESTANA_ESTADO}: ${inv.abiertas.length} entrada(s) cerrada(s)`;
    }],
    ['Drive', () => {
      inv.archivos.forEach(({ archivo }) => archivo.setTrashed(true));
      return `Drive: ${inv.archivos.length} archivo(s) enviados a la papelera`;
    }],
    [CLAVE_LIMPIEZA_REVISADA, () => {
      deps.propiedades.deleteProperty(CLAVE_LIMPIEZA_REVISADA);
      return `${CLAVE_LIMPIEZA_REVISADA}: borrada`;
    }],
  ];
}

/** Motivo de paro (sin tocar nada) o null: falta la revisión o la huella ya no coincide. */
function motivoParoLimpieza_(deps, inv) {
  if (!inv.registroDisponible) return 'no se pudo leer _EDICIONES; no borro';
  const manuales = inv.meses.reduce((n, mes) => n + mes.manuales, 0);
  const anotadas = inv.meses.reduce((n, mes) => n + mes.anotadas, 0);
  if (manuales || anotadas) {
    return `hay ${manuales} fila(s) MANUAL y ${anotadas} fila(s) con celdas editadas a mano; no borro`;
  }
  const revisada = deps.propiedades.getProperty(CLAVE_LIMPIEZA_REVISADA);
  if (revisada === null || revisada === undefined || revisada === '') {
    return 'falta la revisión; corre revisarDatosDePrueba primero';
  }
  if (revisada !== huellaDe_(inv)) {
    return 'algo cambió desde la revisión; corre revisarDatosDePrueba de nuevo';
  }
  return null;
}

/**
 * BORRAR: con el candado, verifica la huella y corre las etapas. Devuelve las líneas del registro
 * (también van a deps.log). Sin candado, sin revisión o con huella distinta: una línea PARO y nada más.
 */
function borrarDatosDePrueba_(deps) {
  const lineas = [];
  const anotar = (linea) => { lineas.push(linea); deps.log(linea); };
  if (!deps.candado.tryLock(ESPERA_CANDADO_LIMPIEZA_MS)) {
    anotar('PARO: no se pudo tomar el candado; no se tocó nada');
    return lineas;
  }
  try {
    const inv = inventarioPrueba_(deps);
    const motivo = motivoParoLimpieza_(deps, inv);
    if (motivo) {
      anotar(`PARO: ${motivo}; no se tocó nada`);
      return lineas;
    }
    etapasBorrado_(deps, inv).forEach(([nombre, hacer]) => etapaLimpieza_(nombre, anotar, hacer));
    return lineas;
  } finally {
    deps.candado.releaseLock();
  }
}

/** Dependencias reales: libro y carpeta Facturas de CONFIG, Script Properties, candado y Logger. */
function dependenciasLimpieza_() {
  return {
    libro: () => SpreadsheetApp.openById(CONFIG.SHEET_ID),
    raiz: () => DriveApp.getFolderById(CONFIG.FACTURAS_FOLDER_ID),
    propiedades: PropertiesService.getScriptProperties(),
    candado: LockService.getScriptLock(),
    log: (linea) => Logger.log(linea),
  };
}

/** Ejecutar desde el editor PRIMERO: solo lee y guarda la huella; no borra nada. */
function revisarDatosDePrueba() {
  return revisarDatosDePrueba_(dependenciasLimpieza_());
}

/** Ejecutar desde el editor DESPUÉS de revisarDatosDePrueba: borra los datos de prueba (ver cabecera). */
function borrarDatosDePrueba() {
  return borrarDatosDePrueba_(dependenciasLimpieza_());
}

if (typeof module !== 'undefined') {
  module.exports = {
    ESPERA_CANDADO_LIMPIEZA_MS, CLAVE_LIMPIEZA_REVISADA, archivosBajo_, abiertasDeEstado_, huellaDe_,
    bloquesSinDesborde_, revisarDatosDePrueba_, borrarDatosDePrueba_, dependenciasLimpieza_,
    revisarDatosDePrueba, borrarDatosDePrueba,
  };
}
