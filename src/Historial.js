/**
 * Historial, lógica pura: lee un.xlsx ya descomprimido (textos XML por ruta) y saca las filas
 * de gasto para _HISTORIAL. Se lee el Excel directo, sin convertirlo a hoja de Google: los Excel
 * del usuario tienen una celda suelta cerca de la fila 1 043 000 y la conversión pasaría del límite
 * de 20 millones de celdas. Usa sinTildes_ de Hoja.js (global compartido en Apps Script).
 */
const PESTANAS_EXCLUIDAS = Object.freeze([/^PLANILLA/i]); // números de cuenta: nunca se leen
const ENCABEZADOS_HISTORIAL = Object.freeze({
  fecha: 'FECHA', deposito: 'DEPOSITO', gasto: 'GASTO', proveedor: 'PROVEEDOR', clase: 'CLASE DE GASTO',
});
const FILAS_BUSCAR_ENCABEZADO = 10;
const DIA_EXCEL_MAXIMO = 2958465; // 9999-12-31
const EPOCA_EXCEL_1900 = Date.UTC(1899, 11, 30);
const EPOCA_EXCEL_1904 = Date.UTC(1904, 0, 1);
const MS_POR_DIA = 24 * 60 * 60 * 1000;

const ENTIDADES_XML = Object.freeze({ lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" });

function decodificarXml_(texto) {
  return String(texto).replace(/&(#x[0-9a-f]+|#\d+|lt|gt|amp|quot|apos);/gi, (todo, e) => {
    if (e[0] !== '#') return ENTIDADES_XML[e.toLowerCase()];
    const codigo = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return String.fromCodePoint(codigo);
  });
}

/** ' r="B4" t="s"' → { r: 'B4', t: 's' }. Los prefijos (r:id) se conservan. */
function atributosXml_(texto) {
  const atributos = {};
  const patron = /([\w:.-]+)\s*=\s*"([^"]*)"/g;
  let m;
  while ((m = patron.exec(texto)) !== null) atributos[m[1]] = decodificarXml_(m[2]);
  return atributos;
}

/** Todo el texto de los <t> de un elemento, sin las guías fonéticas (<rPh>). */
function textoDeRuns_(xml) {
  const sinFonetica = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '');
  const partes = [];
  const patron = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
  let m;
  while ((m = patron.exec(sinFonetica)) !== null) partes.push(decodificarXml_(m[1]));
  return partes.join('');
}

/** xl/sharedStrings.xml → lista de textos por índice. */
function leerCadenasCompartidas_(xml) {
  if (!xml) return [];
  const cadenas = [];
  const patron = /<si\b[^>]*?(?:\/>|>([\s\S]*?)<\/si>)/g;
  let m;
  while ((m = patron.exec(xml)) !== null) cadenas.push(m[1] === undefined ? '' : textoDeRuns_(m[1]));
  return cadenas;
}

/** "B4" → 2; sin referencia → null. */
function columnaDeReferencia_(referencia) {
  const letras = /^([A-Z]+)\d*$/i.exec(referencia || '');
  if (!letras) return null;
  return [...letras[1].toUpperCase()].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);
}

function valorCelda_(atributos, interior, cadenas) {
  const tipo = atributos.t || 'n';
  if (tipo === 'inlineStr') return textoDeRuns_(interior);
  const v = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(interior);
  if (!v) return null;
  const crudo = decodificarXml_(v[1]);
  if (tipo === 's') return cadenas[Number(crudo)] ?? null;
  if (tipo === 'str' || tipo === 'd') return crudo;
  if (tipo === 'b') return crudo === '1';
  if (tipo === 'e') return null;
  const numero = Number(crudo);
  return crudo.trim() !== '' && Number.isFinite(numero) ? numero : null;
}

/** Celdas de una fila → arreglo denso (índice 0 = columna A). */
function leerCeldas_(xml, cadenas) {
  const valores = [];
  const patron = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
  let columna = 0;
  let m;
  while ((m = patron.exec(xml)) !== null) {
    const atributos = atributosXml_(m[1]);
    columna = columnaDeReferencia_(atributos.r) ?? columna + 1;
    valores[columna - 1] = valorCelda_(atributos, m[2] || '', cadenas);
  }
  return Array.from(valores, (v) => (v === undefined ? null : v));
}

/**
 * xl/worksheets/sheetN.xml → [{ fila, valores }] solo con las filas que existen en el XML
 * (una celda suelta en la fila 1 000 000 no crea un millón de filas vacías).
 */
function leerHojaXml_(xml, cadenas) {
  const filas = [];
  const patron = /<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g;
  let numero = 0;
  let m;
  while ((m = patron.exec(xml)) !== null) {
    const r = Number(atributosXml_(m[1]).r);
    numero = Number.isInteger(r) && r > 0 ? r : numero + 1;
    filas.push({ fila: numero, valores: leerCeldas_(m[2] || '', cadenas) });
  }
  return filas;
}

/** "worksheets/sheet3.xml" o "/xl/worksheets/sheet3.xml" → "xl/worksheets/sheet3.xml". */
const rutaEnLibro_ = (destino) => (destino.startsWith('/') ? destino.slice(1) : `xl/${destino}`);

const pestanaExcluida_ = (nombre) => PESTANAS_EXCLUIDAS.some((p) => p.test(nombre));

/**
 * Textos XML del.xlsx por ruta → { fecha1904, pestanas: [{ nombre, oculta, filas }] }.
 * Las pestañas excluidas (PLANILLA …) no se leen.
 */
function leerLibroXlsx_(archivos) {
  const libro = archivos['xl/workbook.xml'];
  const relaciones = archivos['xl/_rels/workbook.xml.rels'];
  if (!libro || !relaciones) throw new Error('no parece un .xlsx: falta xl/workbook.xml');
  const destinos = {};
  (relaciones.match(/<Relationship\b[^>]*>/g) || []).forEach((etiqueta) => {
    const a = atributosXml_(etiqueta);
    destinos[a.Id] = rutaEnLibro_(a.Target);
  });
  const opciones = atributosXml_((/<workbookPr\b[^>]*>/.exec(libro) || [''])[0]);
  const cadenas = leerCadenasCompartidas_(archivos['xl/sharedStrings.xml']);
  const pestanas = (libro.match(/<sheet\b[^>]*>/g) || [])
    .map(atributosXml_)
    .filter((a) => !pestanaExcluida_(a.name))
    .map((a) => {
      const xml = archivos[destinos[a['r:id']]];
      if (!xml) throw new Error(`falta la pestaña ${a.name} dentro del .xlsx`);
      return { nombre: a.name, oculta: a.state === 'hidden' || a.state === 'veryHidden', filas: leerHojaXml_(xml, cadenas) };
    });
  return { fecha1904: opciones.date1904 === '1' || opciones.date1904 === 'true', pestanas };
}

/** Número de serie de Excel → "AAAA-MM-DD"; si no es una fecha válida → null. */
function fechaDeSerie_(serie, fecha1904) {
  if (typeof serie !== 'number' || !Number.isFinite(serie) || serie < 1 || serie > DIA_EXCEL_MAXIMO) return null;
  const epoca = fecha1904 ? EPOCA_EXCEL_1904 : EPOCA_EXCEL_1900;
  return new Date(epoca + Math.floor(serie) * MS_POR_DIA).toISOString().slice(0, 10);
}

const normalizarEncabezado_ = (v) => sinTildes_(v === null ? '' : v).trim().toUpperCase();

/** Fila de encabezados de una pestaña de gastos → { fecha: índice, … }; si no la tiene → null. */
function buscarEncabezados_(filas) {
  for (const { fila, valores } of filas) {
    if (fila > FILAS_BUSCAR_ENCABEZADO) break;
    const normalizados = valores.map(normalizarEncabezado_);
    const indices = Object.fromEntries(Object.entries(ENCABEZADOS_HISTORIAL)
      .map(([campo, texto]) => [campo, normalizados.indexOf(texto)]));
    if (Object.values(indices).every((i) => i >= 0)) return { fila, indices };
  }
  return null;
}

/** Redondeado a centavos; -0 → 0; lo que no es número → null. */
const centavos_ = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 100) / 100 + 0 : null);
/** Sin redondear (solo -0 → 0); lo que no es número → null. */
const exacto_ = (v) => (typeof v === 'number' && Number.isFinite(v) ? v + 0 : null);
const texto_ = (v) => (v === null || v === undefined ? '' : String(v));

/**
 * Filas de una pestaña → registros { fecha, proveedor, clase, comentarios, deposito, gasto }. GASTO cambia
 * de signo (el Excel lo guarda negativo). Se saltan filas sin fecha (TOTAL, Nota:, notas sueltas)
 * y sin ningún monto. Pestaña sin los encabezados de gastos (tablas dinámicas, borradores) → [].
 * Con { exacto: true } los montos quedan tal cual el Excel, sin redondear; así lo usan _HISTORIAL
 * (HistorialApp.js) y la importación del archivo (Importacion.js). Sin opciones redondea a centavos
 * (ya nadie en src/ lo usa; queda por compatibilidad). Las claves de conClaves_ llevan el monto, así
 * que cambiar de modo cambia las claves: por eso existe reimportarHistorialExacto.
 */
function registrosDePestana_(filas, fecha1904, opciones) {
  const monto_ = opciones && opciones.exacto === true ? exacto_ : centavos_;
  const encabezado = buscarEncabezados_(filas);
  if (!encabezado) return [];
  const { indices } = encabezado;
  const filaEncabezado = filas.find(({ fila }) => fila === encabezado.fila);
  const columnaComentarios = filaEncabezado.valores.map(normalizarEncabezado_).indexOf('COMENTARIOS');
  return filas
    .filter(({ fila }) => fila > encabezado.fila)
    .map(({ valores }) => {
      const gasto = valores[indices.gasto]; // se voltea antes de redondear: -0.125 → 0.13, no 0.12
      return {
        fecha: fechaDeSerie_(valores[indices.fecha], fecha1904),
        proveedor: texto_(valores[indices.proveedor]),
        clase: texto_(valores[indices.clase]),
        comentarios: columnaComentarios < 0 ? '' : texto_(valores[columnaComentarios]),
        deposito: monto_(valores[indices.deposito] ?? null),
        gasto: monto_(typeof gasto === 'number' ? -gasto : null),
      };
    })
    .filter((r) => r.fecha !== null && (r.deposito !== null || r.gasto !== null));
}

/**
 * Clave para no duplicar: contenido de la fila + cuántas veces se repitió ese contenido antes en
 * la misma pestaña. No depende del archivo ni de la pestaña: una pestaña repetida que
 * viene igual en varios Excel entra una sola vez; correr la importación de nuevo no duplica.
 */
function conClaves_(registros) {
  const vistas = new Map();
  return registros.map((r) => {
    const contenido = JSON.stringify([r.fecha, r.proveedor, r.clase, r.deposito, r.gasto]);
    const n = (vistas.get(contenido) || 0) + 1;
    vistas.set(contenido, n);
    return { ...r, clave: `${contenido}#${n}` };
  });
}

/**
 * lotes = [{ archivo, pestana, registros }] (registros ya con clave) → filas nuevas para
 * _HISTORIAL (en el orden de COLUMNAS_HISTORIAL, fecha como "AAAA-MM-DD") y cuántas se saltaron.
 */
function filasNuevasHistorial_(lotes, clavesExistentes) {
  const vistas = new Set(clavesExistentes);
  const filas = [];
  let repetidas = 0;
  lotes.forEach(({ archivo, pestana, registros }) => registros.forEach((r) => {
    if (vistas.has(r.clave)) {
      repetidas += 1;
      return;
    }
    vistas.add(r.clave);
    filas.push([r.fecha, r.proveedor, r.clase, r.deposito ?? '', r.gasto ?? '', archivo, pestana, r.clave]);
  }));
  return { filas, repetidas };
}

/** Valores de CLASE DE GASTO → cuántas categorías distintas (sin contar vacías). */
const contarCategorias_ = (clases) => new Set(clases.map(texto_).filter((c) => c.trim() !== '')).size;

if (typeof module !== 'undefined') {
  module.exports = {
    PESTANAS_EXCLUIDAS, decodificarXml_, atributosXml_, leerCadenasCompartidas_, columnaDeReferencia_,
    leerHojaXml_, leerLibroXlsx_, pestanaExcluida_, fechaDeSerie_, buscarEncabezados_,
    registrosDePestana_, conClaves_, filasNuevasHistorial_, contarCategorias_,
  };
}
