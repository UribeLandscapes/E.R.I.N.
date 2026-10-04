/**
 * Los 17 grupos de clase de gasto en español, lógica pura: la lista que ve
 * El usuario, cómo pasar de un número/palabra/etiqueta vieja a la etiqueta real de la hoja según casa y
 * fecha, la conversión inversa (etiqueta → grupo) y la deducción de clase por historial del
 * proveedor.
 * Usa normalizarProveedor_ y semanaDelMes_ de Reglas.js; sinTildes_ de Hoja.js; CONFIG de Config.js.
 */
const MARCA_PENDIENTE_CLASE = 'PENDIENTE';
// Mínimo de filas del historial del proveedor y qué tan clara debe verse la mayoría.
const MINIMO_HISTORIAL_PROVEEDOR = 2;
const UMBRAL_HISTORIAL_PROVEEDOR = 0.8;

// Los 17 grupos: número, nombre en español, ejemplos cortos para el usuario y palabras que ella usaría
// (se comparan sin tildes y en minúsculas). La etiqueta real la arma etiquetaGrupo_ con la casa y
// la fecha de la entrada.
const GRUPOS_CLASE = Object.freeze([
  {
    numero: 1,
    nombre: 'Supermercado',
    ejemplos: 'Riba Smith, Rey, Super 99, frutería',
    palabras: [
      'super', 'supermercado', 'riba smith', 'ribasmith', 'rey', 'super 99', 'super99', 'fruteria',
    ],
  },
  {
    numero: 2,
    nombre: 'Farmacia y medicinas',
    ejemplos: 'farmacia, medicinas',
    palabras: ['farmacia', 'medicina', 'medicinas'],
  },
  {
    numero: 3, nombre: 'Gasolina', ejemplos: 'gasolina, combustible', palabras: ['gasolina', 'combustible'],
  },
  {
    numero: 4,
    nombre: 'Lavandería',
    ejemplos: 'lavandería, lavado de ropa',
    palabras: ['lavanderia', 'lavado'],
  },
  {
    numero: 5,
    nombre: 'Veterinaria',
    ejemplos: 'veterinario, mascotas',
    palabras: ['veterinaria', 'veterinario', 'vet', 'perro', 'gato', 'mascota'],
  },
  {
    numero: 6,
    nombre: 'Mantenimiento y reparaciones',
    ejemplos: 'Novey, técnicos',
    palabras: ['mantenimiento', 'reparacion', 'reparaciones', 'novey', 'tecnico'],
  },
  {
    numero: 7,
    nombre: 'Servicios: luz, agua, internet, teléfono',
    ejemplos: 'recibos de ENSA, Naturgy, IDAAN, Tigo, +Móvil',
    palabras: ['luz', 'agua', 'internet', 'telefono', 'servicios', 'servicio'],
  },
  {
    numero: 8, nombre: 'Salarios', ejemplos: 'sueldos del personal', palabras: ['salario', 'salarios', 'sueldo'],
  },
  {
    numero: 9,
    nombre: 'Pagos especiales al personal',
    ejemplos: 'bonos, pagos extra',
    palabras: ['pago especial', 'pagos especiales', 'bono'],
  },
  {
    numero: 10, nombre: 'Carro', ejemplos: 'carro, vehículo', palabras: ['carro', 'vehiculo', 'auto'],
  },
  {
    numero: 11,
    nombre: 'Peajes y estacionamiento',
    ejemplos: 'peajes, parqueo',
    palabras: ['peaje', 'peajes', 'estacionamiento', 'parqueo'],
  },
  {
    numero: 12, nombre: 'Courier', ejemplos: 'mensajería, courier', palabras: ['courier', 'mensajeria'],
  },
  {
    numero: 13,
    nombre: 'Comida del personal',
    ejemplos: 'almuerzos o cenas para el equipo',
    palabras: ['comida del personal', 'comida personal', 'comida'],
  },
  {
    numero: 14,
    nombre: 'Garrafones de agua',
    ejemplos: 'garrafones y botellones de agua',
    palabras: ['garrafon', 'garrafones', 'garrafon de agua', 'garrafones de agua'],
    gana: [7],
  },
  {
    numero: 15,
    nombre: 'SIPE',
    ejemplos: 'pago de la SIPE / Caja de Seguro Social',
    palabras: ['sipe'],
  },
  {
    numero: 16,
    nombre: 'Décimo tercer mes',
    ejemplos: 'décimo tercer mes del personal',
    palabras: ['decimo', 'decimo tercer mes', 'xiii mes'],
    gana: [8],
  },
  {
    numero: 17,
    nombre: 'Varios',
    ejemplos: 'lo que no encaje en las demás',
    palabras: ['varios', 'miscelaneos'],
  },
]);

/** Nombres de los 17 grupos, en orden; van al esquema de Gemini junto a las etiquetas viejas. */
const nombresGrupos_ = () => GRUPOS_CLASE.map((g) => g.nombre);

/** El grupo cuyo nombre en español coincide (sin importar mayúsculas); null si no es ninguno. */
function grupoPorNombre_(nombre) {
  const buscado = String(nombre || '').trim().toLowerCase();
  return GRUPOS_CLASE.find((g) => g.nombre.toLowerCase() === buscado) || null;
}

const etiquetaCasa_ = (clave) => CONFIG.CASAS[clave].etiqueta;

/**
 * Etiqueta real de la hoja para un grupo (1-17) según la casa (PRINCIPAL/SECUNDARIA/null o
 * COMPARTIDO) y la fecha AAAA-MM-DD de la entrada (tabla de grupos por casa). Los sufijos de
 * casa salen de CONFIG.CASAS[...].etiqueta. null si el número no es un grupo válido.
 */
function etiquetaGrupo_(numero, casa, fecha) {
  const principal = etiquetaCasa_('PRINCIPAL');
  const secundaria = etiquetaCasa_('SECUNDARIA');
  switch (numero) {
    case 1:
      return casa === 'SECUNDARIA' ? `GROCERIES ${secundaria}` : `GROCERIES W${semanaDelMes_(fecha)} ${principal}`;
    case 2: return 'MEDS';
    case 3: return 'GAS & OIL';
    case 4: return 'LAUNDRY SERVICES';
    case 5: return 'VET';
    case 6:
      if (casa === 'PRINCIPAL') return `MAINTENANCE ${principal}`;
      if (casa === 'SECUNDARIA') return `MAINTENANCE ${secundaria}`;
      return 'MAINTENANCE';
    case 7: return casa === 'SECUNDARIA' ? `${secundaria} SERVICES` : `${principal} SERVICES`;
    case 8: return 'SALARIES';
    case 9: return 'SPECIAL SALARIES';
    case 10: return 'VEHICLE EXPENSES';
    case 11: return 'TOLL & PARKING FEE';
    case 12: return 'COURIER SERVICES';
    case 13: return 'STAFF DINNER';
    case 14: return casa === 'SECUNDARIA' ? `GARRAFONES DE AGUA ${secundaria}` : 'GARRAFONES DE AGUA';
    case 15: return 'SIPE';
    case 16: return 'SALARIES - DECIMO TERCER MES';
    case 17: return 'MISCELANEOS';
    default: return null;
  }
}

const listaPalabras_ = (palabras) => palabras.map((p) => `"${p}"`).join(', ');

/**
 * Líneas del prompt de Gemini que presentan las dos casas, todas desde CONFIG.CASAS: cómo se
 * describen y qué palabras del usuario apuntan a cada una (no son lugares aparte).
 */
function instruccionCasas_() {
  const { PRINCIPAL: p, SECUNDARIA: s } = CONFIG.CASAS;
  return [
    `El usuario tiene dos casas: ${p.descripcion} (clave PRINCIPAL) y ${s.descripcion}`,
    `(clave SECUNDARIA). ${listaPalabras_([p.nombre, ...p.palabras])} se refieren a la casa PRINCIPAL y`,
    `${listaPalabras_([s.nombre, ...s.palabras])} a la SECUNDARIA (no son un tercer lugar).`,
  ];
}

/** Etiquetas viejas y nuevas del grupo 7 (servicios), en mayúsculas, según CONFIG.CASAS. */
function etiquetasServicios_() {
  const [principal, secundaria] = ['PRINCIPAL', 'SECUNDARIA'].map((c) => etiquetaCasa_(c).toUpperCase());
  return [`${principal} SERVICES`, `SERVICES ${principal}`, `${secundaria} SERVICES`, `SERVICES ${secundaria}`, 'SERVICES'];
}

/**
 * De una etiqueta real de la hoja a su número de grupo (búsqueda inversa para deducir la clase por historial); null
 * si la etiqueta no encaja con ningún grupo.
 */
function etiquetaAGrupo_(etiqueta) {
  const e = String(etiqueta || '').trim().toUpperCase();
  if (e.startsWith('GROCERIES')) return 1;
  if (e === 'MEDS') return 2;
  if (e === 'GAS & OIL') return 3;
  if (e === 'LAUNDRY SERVICES') return 4;
  if (e === 'VET') return 5;
  if (e.startsWith('MAINTENANCE')) return 6;
  if (etiquetasServicios_().includes(e)) return 7;
  if (e === 'SALARIES') return 8;
  if (e === 'SPECIAL SALARIES') return 9;
  if (e === 'VEHICLE EXPENSES') return 10;
  if (e === 'TOLL & PARKING FEE') return 11;
  if (e === 'COURIER SERVICES') return 12;
  if (e === 'STAFF DINNER') return 13;
  if (e.startsWith('GARRAFONES DE AGUA')) return 14;
  if (e === 'SIPE') return 15;
  if (e === 'SALARIES - DECIMO TERCER MES') return 16;
  if (e === 'MISCELANEOS') return 17;
  return null;
}

/** "1. Supermercado (Riba Smith, Rey, Super 99, frutería)", una línea por grupo. */
const listaClases_ = () => GRUPOS_CLASE.map((g) => `${g.numero}. ${g.nombre} (${g.ejemplos})`);

/**
 * La lista de 17 grupos como la ve el usuario en la pregunta de clase: una línea por
 * grupo y, al final, cómo contestar (número o sus propias palabras).
 */
function textoListaClases_() {
  return [
    ...listaClases_(),
    'Respóndeme con el número de la lista, o dime la clase con tus palabras (por ejemplo "super").',
  ].join('\n');
}

/**
 * Explicación de los 17 grupos para la instrucción de Gemini: la misma lista,
 * más la regla de preferir el nombre del grupo sobre una etiqueta vieja.
 */
function instruccionClases_() {
  return [
    'Estos son los 17 grupos de clase de gasto y qué va en cada uno:',
    ...listaClases_(),
    'Prefiere el nombre de uno de estos 17 grupos para clase. Usa una etiqueta de la lista de',
    'categorías (la que venga en el esquema) solo si el mensaje la escribió tal cual, letra por',
    'letra. Si ninguno encaja con seguridad, usa PENDIENTE.',
  ].join('\n');
}

/** Escapa los caracteres especiales de regex de una palabra clave. */
function escaparRegex_(palabra) {
  return palabra.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * true si `normalizado` (ya sin tildes y en minúsculas) trae la palabra `p` completa: al inicio o
 * fin del texto, o separada por algo que no sea letra/número, con un plural en "s" opcional (pero
 * no "es": "rey" no debe hacer match con "reyes").
 */
function tienePalabraCompleta_(normalizado, p) {
  const re = new RegExp(`(?:^|[^a-z0-9])${escaparRegex_(p)}s?(?:$|[^a-z0-9])`);
  return re.test(normalizado);
}

/**
 * Mapeo determinístico de una respuesta abierta de clase, antes de confiar en
 * Gemini: un número 1-17, una palabra del usuario, o una etiqueta vieja escrita tal cual (de
 * `categorias`, sin importar mayúsculas ni espacios). Devuelve la etiqueta real ya armada con
 * `casa` y `fecha`; `MARCA_PENDIENTE_CLASE` si el texto trae palabras de más de un grupo (no se
 * adivina: el bot vuelve a preguntar); null si el texto no dice nada reconocible.
 */
function claseDeRespuesta_(texto, casa, fecha, categorias) {
  const limpio = String(texto || '').trim();
  if (!limpio) return null;
  const numero = Number(limpio);
  if (Number.isInteger(numero) && numero >= 1 && numero <= GRUPOS_CLASE.length) return etiquetaGrupo_(numero, casa, fecha);
  const exacta = (categorias || []).find((c) => String(c).trim().toLowerCase() === limpio.toLowerCase());
  if (exacta) return exacta;
  const normalizado = sinTildes_(limpio).toLowerCase();
  const detectados = GRUPOS_CLASE.filter((g) => g.palabras.some((p) => tienePalabraCompleta_(normalizado, p)));
  const vencidos = new Set(detectados.flatMap((g) => g.gana || []));
  const grupos = detectados.filter((g) => !vencidos.has(g.numero));
  if (grupos.length > 1) return MARCA_PENDIENTE_CLASE;
  return grupos.length === 1 ? etiquetaGrupo_(grupos[0].numero, casa, fecha) : null;
}

/**
 * Grupo de un nombre que Gemini haya elegido de la lista de 17; si `clase` es
 * una etiqueta vieja o PENDIENTE, se devuelve tal cual (no es un nombre de grupo).
 */
function claseDeExtraccion_(clase, casa, fecha) {
  const grupo = grupoPorNombre_(clase);
  return grupo ? etiquetaGrupo_(grupo.numero, casa, fecha) : clase;
}

/**
 * Clase deducida del historial del proveedor: entre las filas de
 * `historial` ({ proveedor, clase }) cuyo proveedor coincide (normalizarProveedor_), si hay al
 * menos `MINIMO_HISTORIAL_PROVEEDOR` y al menos el `UMBRAL_HISTORIAL_PROVEEDOR` caen en un mismo
 * grupo, la etiqueta de ese grupo con `casa` y `fecha`. Si no hay suficientes o no hay mayoría
 * clara, null (el bot debe volver a preguntar con la lista).
 */
function claseInferidaProveedor_(historial, proveedor, casa, fecha) {
  const objetivo = normalizarProveedor_(proveedor);
  if (!objetivo) return null;
  const coincidencias = (historial || []).filter((h) => normalizarProveedor_(h.proveedor) === objetivo);
  if (coincidencias.length < MINIMO_HISTORIAL_PROVEEDOR) return null;
  const conteo = new Map();
  coincidencias.forEach((h) => {
    const grupo = etiquetaAGrupo_(h.clase);
    if (grupo) conteo.set(grupo, (conteo.get(grupo) || 0) + 1);
  });
  let mejor = null;
  conteo.forEach((veces, grupo) => {
    if (!mejor || veces > mejor.veces) mejor = { grupo, veces };
  });
  if (!mejor || mejor.veces / coincidencias.length < UMBRAL_HISTORIAL_PROVEEDOR) return null;
  return etiquetaGrupo_(mejor.grupo, casa, fecha);
}

/**
 * Clase final de un gasto (texto y foto): el proveedor dominante
 * (claseInferidaProveedor_, ≥ 80 % del historial) gana a la elección de Gemini; si no hay
 * dominante, se usa la elección de Gemini (claseDeExtraccion_); PENDIENTE si ninguna resuelve.
 * `proveedor` PENDIENTE o vacío nunca consulta el historial (no hay proveedor real que buscar).
 */
function claseDeGasto_(historial, proveedor, claseGemini, casa, fecha) {
  const consultable = proveedor && proveedor !== MARCA_PENDIENTE_CLASE;
  const dominante = consultable ? claseInferidaProveedor_(historial, proveedor, casa, fecha) : null;
  return dominante || claseDeExtraccion_(claseGemini, casa, fecha);
}

if (typeof module !== 'undefined') {
  module.exports = {
    MARCA_PENDIENTE_CLASE, GRUPOS_CLASE, nombresGrupos_, grupoPorNombre_, etiquetaGrupo_, etiquetaAGrupo_,
    listaClases_, textoListaClases_, instruccionClases_, claseDeRespuesta_, claseDeExtraccion_,
    claseInferidaProveedor_, claseDeGasto_, escaparRegex_, instruccionCasas_, etiquetasServicios_,
  };
}
