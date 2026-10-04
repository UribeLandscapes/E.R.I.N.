/**
 * Bloque único de configuración. Cambiar de carpeta u hoja = editar solo este bloque.
 * Los secretos (token del bot, clave de Gemini, secreto del webhook, clave de Groq) NO van aquí:
 * van en Script Properties (ver verificarPropiedades en Instalacion.js).
 *
 * Todo valor que empieza con "TU_" es un ejemplo que debes reemplazar por el tuyo. Mientras quede
 * alguno, el bot se niega a trabajar (faltantesConfig_ lo detecta; verificarConfiguracion en el
 * editor lista lo que falta). TIMEZONE debe coincidir con "timeZone" de appsscript.json.
 */
const CONFIG = Object.freeze({
  ERIN_FOLDER_ID: 'TU_CARPETA_ERIN_ID', // carpeta raíz del proyecto en Drive
  FACTURAS_FOLDER_ID: 'TU_CARPETA_FACTURAS_ID', // subcarpeta "Facturas" (fotos archivadas)
  SHEET_ID: 'TU_SHEET_ID', // hoja de cálculo de la caja chica
  HISTORIAL_FOLDER_ID: 'TU_CARPETA_HISTORIAL_ID', // carpeta con los Excel de meses anteriores
  // Excel existente en Drive, destino del espejo de la hoja; se sobrescribe, conserva id y enlace.
  EXCEL_ESPEJO_ID: 'TU_EXCEL_ESPEJO_ID',
  ERIN_CHAT_ID: 'TU_CHAT_ID', // id numérico del chat de Telegram de la persona que usa el bot
  NOMBRE_USUARIO: 'TU_NOMBRE', // cómo saluda y anima el bot a esa persona
  TIMEZONE: 'America/Panama', // zona horaria IANA; cámbiala también en appsscript.json
  // URL /exec de la implementación web, sin el secreto.
  WEBAPP_URL: 'TU_WEBAPP_URL',
  MODELO_PRINCIPAL: 'gemini-3.5-flash-lite',
  MODELO_RELECTURA: 'gemini-3.8-flash',
  // Respaldo cuando Gemini falla: plan gratis de console.groq.com.
  MODELO_GROQ: 'qwen/qwen3.8-27b',
  // Quién hace los depósitos cuando el usuario no lo dice.
  DEPOSITANTE_POR_DEFECTO: 'TU_DEPOSITANTE',
  // Primer año y meses (1-12) de los Excel viejos que importarArchivosViejos trae como "(archivo)".
  HISTORIAL_ANIO: 2026,
  HISTORIAL_MESES: Object.freeze([1, 2, 3, 4, 5, 6, 7, 8]),
  // Las dos casas entre las que se reparten los gastos. nombre: como las dice el usuario;
  // etiqueta: sufijo en MAYÚSCULAS de la clase de gasto en la hoja (p. ej. "GROCERIES W1 <etiqueta>");
  // descripcion: cómo las presenta el prompt a Gemini; palabras: lo que el usuario escribe para elegirla.
  CASAS: Object.freeze({
    PRINCIPAL: Object.freeze({
      nombre: 'TU_CASA_PRINCIPAL',
      etiqueta: 'TU_ETIQUETA_PRINCIPAL',
      descripcion: 'TU_DESCRIPCION_PRINCIPAL',
      palabras: Object.freeze(['TU_PALABRA_PRINCIPAL']),
    }),
    SECUNDARIA: Object.freeze({
      nombre: 'TU_CASA_SECUNDARIA',
      etiqueta: 'TU_ETIQUETA_SECUNDARIA',
      descripcion: 'TU_DESCRIPCION_SECUNDARIA',
      palabras: Object.freeze(['TU_PALABRA_SECUNDARIA']),
    }),
  }),
});

const PREFIJO_VALOR_EJEMPLO = 'TU_';
const esValorFaltante_ = (valor) => typeof valor === 'string'
  && (valor.trim() === '' || valor.startsWith(PREFIJO_VALOR_EJEMPLO));

/**
 * Claves de `config` (con ruta, p. ej. "CASAS.PRINCIPAL.nombre") que siguen vacías o con el valor
 * de ejemplo "TU_...". Lista vacía = configuración completa. Pura: no lee globales.
 */
function faltantesConfig_(config, ruta = '') {
  return Object.entries(config).flatMap(([clave, valor]) => {
    const nombre = ruta ? `${ruta}.${clave}` : clave;
    if (Array.isArray(valor)) return valor.length === 0 || valor.some(esValorFaltante_) ? [nombre] : [];
    if (valor && typeof valor === 'object') return faltantesConfig_(valor, nombre);
    return esValorFaltante_(valor) ? [nombre] : [];
  });
}

const AVISO_CONFIG_INCOMPLETA = 'Falta completar src/Config.js. Valores pendientes: ';

/** Texto en español con lo que falta en `config`, o '' si está completa. */
function avisoConfigIncompleta_(config) {
  const faltan = faltantesConfig_(config);
  return faltan.length ? `${AVISO_CONFIG_INCOMPLETA}${faltan.join(', ')}` : '';
}

/** Lanza si `config` sigue con valores de ejemplo (para las funciones de instalación). */
function exigirConfigCompleta_(config) {
  const aviso = avisoConfigIncompleta_(config);
  if (aviso) throw new Error(aviso);
}

// En Apps Script `module` no existe y CONFIG queda global; en Node lo exporta para pruebas.
if (typeof module !== 'undefined') {
  module.exports = {
    CONFIG, faltantesConfig_, avisoConfigIncompleta_, exigirConfigCompleta_, AVISO_CONFIG_INCOMPLETA,
  };
}
