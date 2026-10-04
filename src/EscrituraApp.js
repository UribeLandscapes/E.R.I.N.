/**
 * Escritura en el Sheet (capa SpreadsheetApp) sobre la lógica pura de Escritura.js.
 * Nunca escribe ni borra en GRUPO (Y, desborde de fórmula): todo va por tramosEscritura_.
 * Usa COLUMNAS, COLUMNAS_ESTADO, PRIMERA_FILA_DATOS, numeroColumna_, leerPestanaMes_ de Hoja.js;
 * leerFecha_ de Reglas.js; PESTANA_ESTADO y crearPestanaMes_ de HojaApp.js; textoPreguntas_,
 * esMonto_ de Texto.js. `opciones.texto` y `opciones.categorias` le dan
 * a cambiosRespuesta_ (Escritura.js) lo que necesita para el mapeo determinístico de clase.
 * Usa avisarChoques_ de EdicionesApp.js; tramosEscritura_ de Escritura.js; tieneEdicionesManuales_, filtrarCambiosManuales_, TEXTO_NO_CORRIJO_MANUAL,
 * textoColumnasSaltadas_ y textoNadaCambiado_ de Ediciones.js.
 */
const PREGUNTA_CERRADA = 'CERRADA';
const TEXTO_ANOTADO = 'Listo, lo anoté.';
const TEXTO_NO_CLARO = 'No me quedó claro.';
const TEXTO_FILA_NO_ESTA = 'Esa fila ya no está en la hoja. No cambié nada.';

/** Pestaña del mes (sin importar mayúsculas ni tildes), o null si no existe. */
function pestanaDelMes_(ss, anio, mes) {
  return ss.getSheets().find((h) => {
    const leida = leerPestanaMes_(h.getName());
    return leida && leida.anio === anio && leida.mes === mes;
  }) || null;
}

/** Pestaña del mes de la fecha 'AAAA-MM-DD'; la crea si no existe. */
function hojaMes_(ss, fecha) {
  const { anio, mes } = leerFecha_(fecha);
  const hoja = pestanaDelMes_(ss, anio, mes);
  if (hoja) return hoja;
  return ss.getSheetByName(crearPestanaMes_(ss, anio, mes).nombre);
}

/** Filas de datos (desde la fila 6 hasta el final de la hoja) como arreglos. */
function filasDatos_(hoja) {
  const cuantas = hoja.getMaxRows() - PRIMERA_FILA_DATOS + 1;
  if (cuantas < 1) return [];
  return hoja.getRange(PRIMERA_FILA_DATOS, 1, cuantas, COLUMNAS.length).getValues();
}

/** Escribe un bloque de filas seguidas en la primera parte libre; devuelve la primera fila. */
function escribirGrupo_(hoja, filas) {
  const primera = PRIMERA_FILA_DATOS + filaLibre_(filasDatos_(hoja), filas.length);
  const falta = primera + filas.length - 1 - hoja.getMaxRows();
  if (falta > 0) hoja.insertRowsAfter(hoja.getMaxRows(), falta);
  for (const tramo of tramosEscritura_()) {
    hoja.getRange(primera, tramo.desde, filas.length, tramo.columnas.length)
      .setValues(filas.map((fila) => valoresTramo_(fila, tramo)));
  }
  return primera;
}

/**
 * Escribe filas {columna: valor}, cada una en la pestaña del mes de su FECHA. Pone ID FILA y
 * REGISTRADO solo si faltan (una fila que se mueve conserva los suyos).
 * Devuelve [{ pestana, numero, fila }] en el mismo orden.
 */
function escribirFilas_(ss, filas, sello, ahora) {
  const ids = idsFila_(sello, filas[0]['ID MENSAJE TG'], filas.length);
  const grupos = new Map();
  const completas = filas.map((fila, i) => {
    const completa = { ...fila, 'ID FILA': fila['ID FILA'] || ids[i], REGISTRADO: fila.REGISTRADO || ahora };
    const hoja = hojaMes_(ss, textoCelda_(fila.FECHA));
    if (!grupos.has(hoja)) grupos.set(hoja, []);
    grupos.get(hoja).push(i);
    return completa;
  });
  const escritas = [];
  for (const [hoja, indices] of grupos) {
    const primera = escribirGrupo_(hoja, indices.map((i) => completas[i]));
    indices.forEach((i, j) => {
      escritas[i] = { pestana: hoja.getName(), numero: primera + j, fila: completas[i] };
    });
  }
  return escritas;
}

/** Pestañas de mes, con la sugerida primero. */
function hojasMes_(ss, pestana) {
  const meses = ss.getSheets().filter((h) => leerPestanaMes_(h.getName()));
  const sugerida = meses.filter((h) => h.getName() === pestana);
  return [...sugerida, ...meses.filter((h) => h.getName() !== pestana)];
}

/** [{ idFila, hoja, numero, valores }] en el orden de idsFila; las que no aparecen se omiten. */
function buscarFilas_(ss, idsFila, pestana) {
  const buscadas = new Set(idsFila);
  const halladas = new Map();
  const colId = numeroColumna_('ID FILA') - 1;
  for (const hoja of buscadas.size ? hojasMes_(ss, pestana) : []) {
    filasDatos_(hoja).forEach((arreglo, i) => {
      const id = textoCelda_(arreglo[colId]);
      if (!buscadas.has(id) || halladas.has(id)) return;
      halladas.set(id, { idFila: id, hoja, numero: PRIMERA_FILA_DATOS + i, valores: filaComoObjeto_(arreglo) });
    });
    if (halladas.size === buscadas.size) break;
  }
  return idsFila.filter((id) => halladas.has(id)).map((id) => halladas.get(id));
}

/** Agrega una pregunta abierta al final de _ESTADO (y de ninguna otra pestaña). */
function guardarPregunta_(hojaEstado, fila) {
  if (hojaEstado.getName() !== PESTANA_ESTADO) {
    throw new Error(`guardarPregunta_ solo escribe en ${PESTANA_ESTADO}, no en ${hojaEstado.getName()}`);
  }
  hojaEstado.appendRow(fila.map((valor, i) => COLUMNAS_ESTADO[i] === 'DATOS' ? valor : textoSeguroCelda_(valor)));
}

const celdaEstado_ = (hojaEstado, fila, columna) => hojaEstado
  .getRange(fila, COLUMNAS_ESTADO.indexOf(columna) + 1);

function cerrarPregunta_(hojaEstado, pregunta) {
  celdaEstado_(hojaEstado, pregunta.fila, 'ESTADO').setValue(PREGUNTA_CERRADA);
}

/** Deja la pregunta abierta con lo que falta y con lo que el bot escribió ahora. */
function reabrirPregunta_(hojaEstado, pregunta, restantes, porFila, pestana) {
  const celda = celdaEstado_(hojaEstado, pregunta.fila, 'DATOS');
  const datos = JSON.parse(celda.getValue());
  const escrito = Object.fromEntries(Object.entries(datos.escrito || {}).map(([id, columnas]) => {
    const cambio = porFila[id] || {};
    return [id, Object.fromEntries(Object.keys(columnas).map((c) => [c, c in cambio ? cambio[c] : columnas[c]]))];
  }));
  celda.setValue(JSON.stringify({ ...datos, preguntas: restantes, pestana, escrito }));
}

/** Pregunta de monto: devuelve los datos del mensaje completos para registrarlos de nuevo. */
function respuestaMonto_(hojaEstado, pregunta, respuesta) {
  const linea = (respuesta.lineas || []).find((l) => esMonto_(l.monto));
  const monto = esMonto_(respuesta.total) ? respuesta.total : linea && linea.monto;
  if (!esMonto_(monto)) return { texto: `${TEXTO_NO_CLARO} ${textoPreguntas_(['monto'])}`, cerrada: false };
  cerrarPregunta_(hojaEstado, pregunta);
  return {
    texto: '', cerrada: true, datosCompletos: datosConMonto_(pregunta.datos, monto),
    fechaMensaje: pregunta.fechaMensaje, idMensaje: pregunta.idMensaje,
    // La foto no traía fecha legible; quien registre estas filas tiene que preguntarla.
    fechaIlegible: pregunta.fechaIlegible || null,
  };
}

/** ID FACTURA ya usados en la pestaña, sin los del grupo propio. */
function idsFacturaDe_(hoja, propios) {
  if (!hoja) return [];
  const col = numeroColumna_('ID FACTURA') - 1;
  return filasDatos_(hoja).map((f) => textoCelda_(f[col])).filter((id) => id && !propios.includes(id));
}

/** Plan de la respuesta; si la fila cambia de mes, los ID FACTURA se cuentan en el mes nuevo. */
function planConIds_(ss, filas, pregunta, cambios) {
  const propios = filas.map((f) => textoCelda_(f.valores['ID FACTURA']));
  const leidas = filas.map(({ idFila, valores }) => ({ idFila, valores }));
  const plan = planRespuesta_(leidas, pregunta.escrito, cambios, idsFacturaDe_(filas[0].hoja, propios));
  if (!plan.moverA) return plan;
  const destino = pestanaDelMes_(ss, plan.moverA.anio, plan.moverA.mes);
  return planRespuesta_(leidas, pregunta.escrito, cambios, idsFacturaDe_(destino, propios));
}

/** true si la fila tiene FECHA nueva de otro mes que su pestaña. */
function cambiaDeMes_(hoja, cambio) {
  if (!cambio.FECHA) return false;
  const pestana = leerPestanaMes_(hoja.getName());
  const nueva = leerFecha_(cambio.FECHA);
  return !pestana || pestana.anio !== nueva.anio || pestana.mes !== nueva.mes;
}

/**
 * Aplica el plan: celda por celda en su lugar, o, si cambia de mes, escribe la fila en el mes
 * nuevo y luego limpia sus tramos en el viejo (sin borrar filas). Devuelve la pestaña nueva o ''.
 */
function aplicarPlan_(ss, filas, plan, opciones) {
  const mover = filas.filter((f) => cambiaDeMes_(f.hoja, plan.porFila[f.idFila]));
  const escritas = mover.length
    ? escribirFilas_(ss, mover.map((f) => ({ ...f.valores, ...plan.porFila[f.idFila] })), opciones.sello, opciones.ahora)
    : [];
  for (const f of filas) {
    if (mover.includes(f)) {
      tramosEscritura_().forEach((t) => f.hoja.getRange(f.numero, t.desde, 1, t.columnas.length).clearContent());
      continue;
    }
    Object.entries(plan.porFila[f.idFila]).forEach(([columna, valor]) => {
      f.hoja.getRange(f.numero, numeroColumna_(columna)).setValue(valorSeguroPorColumna_(columna, valor));
    });
  }
  return escritas.length ? escritas[0].pestana : '';
}

/** Celdas escritas aquí, incluidas ambas caras de una fila que cambió de mes. */
function escritosAplicados_(filas, plan, movida) {
  const completas = tramosEscritura_().flatMap((tramo) => tramo.columnas);
  return filas.flatMap((fila) => {
    const cambio = plan.porFila[fila.idFila];
    if (!cambiaDeMes_(fila.hoja, cambio)) {
      const columnas = Object.keys(cambio);
      return columnas.length ? [{ pestana: fila.hoja.getName(), idFila: fila.idFila, columnas }] : [];
    }
    return [
      { pestana: fila.hoja.getName(), idFila: fila.idFila, columnas: completas },
      { pestana: movida, idFila: fila.idFila, columnas: completas },
    ];
  });
}

/** Deja en el plan solo las columnas que la hoja todavía permite escribir. */
function filtrarPlanManual_(ss, registro, filas, pregunta, plan, cambios) {
  const filtrado = { porFila: {}, corregidas: [], resueltas: [], moverA: null, ajenas: [] };
  const propios = filas.map((fila) => textoCelda_(fila.valores['ID FACTURA']));
  const destino = plan.moverA && pestanaDelMes_(ss, plan.moverA.anio, plan.moverA.mes);
  const ids = idsFacturaDe_(plan.moverA ? destino : filas[0].hoja, propios);
  const saltadas = [];
  const vistas = new Set();
  for (const fila of filas) {
    const permitidos = filtrarCambiosManuales_(registro, fila.idFila, cambios, fila.valores);
    const uno = planRespuesta_([{ idFila: fila.idFila, valores: fila.valores }], pregunta.escrito, permitidos.escribir, ids);
    const final = filtrarCambiosManuales_(registro, fila.idFila, uno.porFila[fila.idFila], fila.valores);
    filtrado.porFila[fila.idFila] = final.escribir;
    for (const corregida of uno.corregidas) {
      const clave = `${corregida.columna}|${textoCelda_(corregida.valor)}`;
      if (!vistas.has(clave)) filtrado.corregidas.push(corregida);
      vistas.add(clave);
    }
    filtrado.resueltas.push(...uno.resueltas);
    filtrado.moverA = filtrado.moverA || uno.moverA;
    saltadas.push(...permitidos.saltadas, ...final.saltadas);
  }
  filtrado.resueltas = [...new Set(filtrado.resueltas)];
  return { plan: filtrado, saltadas: [...new Set(saltadas)] };
}

/**
 * Preguntas que la respuesta no contestó: una queda contestada si la respuesta cambió alguna de
 * sus columnas. El total (P2) escribe GASTO (USD) en USD y MONTO ORIGINAL en otra moneda, así que
 * no alcanza con mirar solo la primera.
 */
const preguntasRestantes_ = (preguntas, cambios) => preguntas
  .filter((p) => !(COLUMNAS_POR_PREGUNTA[p] || []).some((c) => c in cambios));

/** Construye la respuesta y deja la pregunta abierta o cerrada tras aplicar su plan. */
function finalizarRespuesta_(hojaEstado, pregunta, cambios, filtrado, movida) {
  const restantes = preguntasRestantes_(pregunta.preguntas, cambios);
  const escritos = Object.values(filtrado.plan.porFila).some((fila) => Object.keys(fila).length);
  const partes = [escritos || !filtrado.saltadas.length ? TEXTO_ANOTADO : textoNadaCambiado_(filtrado.saltadas)];
  if (movida) partes.push(`La pasé a ${movida}.`);
  if (restantes.length) partes.push(textoPreguntas_(restantes, CONFIG.DEPOSITANTE_POR_DEFECTO));
  if (escritos && filtrado.saltadas.length) partes.push(textoColumnasSaltadas_(filtrado.saltadas));
  const texto = [partes.join(' '), ...filtrado.plan.corregidas.map((c) => mensajeCorregido_(c.valor))].join('\n');
  if (restantes.length) {
    reabrirPregunta_(hojaEstado, pregunta, restantes, filtrado.plan.porFila, movida || pregunta.pestana);
    return { texto, cerrada: false };
  }
  cerrarPregunta_(hojaEstado, pregunta);
  return { texto, cerrada: true };
}

/**
 * Aplica la respuesta del usuario a una pregunta abierta de _ESTADO. Devuelve { texto, cerrada } y,
 * para la pregunta de monto, { datosCompletos, fechaMensaje, idMensaje } para registrar el gasto.
 */
function aplicarRespuesta_(ss, hojaEstado, pregunta, respuesta, opciones) {
  if (pregunta.preguntas.includes('monto')) return respuestaMonto_(hojaEstado, pregunta, respuesta);
  const filas = buscarFilas_(ss, pregunta.idFilas, pregunta.pestana);
  const ajena = filas.some((f) => f.valores.ORIGEN !== ORIGEN_BOT);
  if (!filas.length || filas.length < pregunta.idFilas.length || ajena) {
    cerrarPregunta_(hojaEstado, pregunta);
    return { texto: TEXTO_FILA_NO_ESTA, cerrada: true };
  }
  const cambios = cambiosRespuesta_(respuesta, pregunta.preguntas, {
    texto: opciones.texto,
    casa: filas[0].valores.CASA,
    fecha: textoCelda_(filas[0].valores.FECHA),
    categorias: opciones.categorias,
    // La ortografía ya usada del proveedor, si responde esa pregunta.
    historial: opciones.historial,
    // P2: con la moneda y la tasa de la fila, el total contestado se pasa a USD como se escribió.
    moneda: textoCelda_(filas[0].valores.MONEDA),
    tasa: textoCelda_(filas[0].valores['TASA USADA']),
  });
  if (!Object.keys(cambios).length) {
    return { texto: `${TEXTO_NO_CLARO} ${textoPreguntas_(pregunta.preguntas, CONFIG.DEPOSITANTE_POR_DEFECTO)}`, cerrada: false };
  }
  const plan = planConIds_(ss, filas, pregunta, cambios);
  const mueve = filas.some((fila) => cambiaDeMes_(fila.hoja, plan.porFila[fila.idFila]));
  if (mueve && tieneEdicionesManuales_(opciones.registro, pregunta.idFilas)) {
    cerrarPregunta_(hojaEstado, pregunta);
    return { texto: TEXTO_NO_CORRIJO_MANUAL, cerrada: true };
  }
  const filtrado = filtrarPlanManual_(ss, opciones.registro, filas, pregunta, plan, cambios);
  const movida = aplicarPlan_(ss, filas, filtrado.plan, opciones);
  avisarChoques_(ss, opciones.desde, () => escritosAplicados_(filas, filtrado.plan, movida), opciones.propiedades);
  return finalizarRespuesta_(hojaEstado, pregunta, cambios, filtrado, movida);
}

if (typeof module !== 'undefined') {
  module.exports = {
    PREGUNTA_CERRADA, TEXTO_ANOTADO, hojaMes_, escribirFilas_, buscarFilas_, guardarPregunta_, aplicarRespuesta_,
    pestanaDelMes_, idsFacturaDe_, celdaEstado_, filasDatos_, cerrarPregunta_, escritosAplicados_, finalizarRespuesta_,
  };
}
