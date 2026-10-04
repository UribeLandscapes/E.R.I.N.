// Configuración COMPLETA y falsa para las pruebas: ningún valor es real ni empieza con "TU_".
// Al cargarla también se publican, como globales, las funciones de Config.js que en Apps Script
// ya son globales (faltantesConfig_, etc.). Cada prueba asigna global.CONFIG a mano si la necesita.
const reales = require('../src/Config.js');

const CONFIG = Object.freeze({
  ERIN_FOLDER_ID: 'carpetaUsuarioDePrueba0000000001',
  FACTURAS_FOLDER_ID: 'carpetaFacturasDePrueba00000002',
  SHEET_ID: 'hojaDeCalculoDePrueba000000003',
  HISTORIAL_FOLDER_ID: 'carpetaHistorialDePrueba0000004',
  EXCEL_ESPEJO_ID: 'excelEspejoDePrueba00000000005',
  ERIN_CHAT_ID: '1000000001',
  NOMBRE_USUARIO: 'Ana',
  TIMEZONE: 'America/Panama',
  WEBAPP_URL: 'https://script.google.com/macros/s/AKprueba0123456789/exec',
  MODELO_PRINCIPAL: reales.CONFIG.MODELO_PRINCIPAL,
  MODELO_RELECTURA: reales.CONFIG.MODELO_RELECTURA,
  MODELO_GROQ: reales.CONFIG.MODELO_GROQ,
  DEPOSITANTE_POR_DEFECTO: 'Beto',
  HISTORIAL_ANIO: 2026,
  HISTORIAL_MESES: Object.freeze([1, 2, 3, 4, 5, 6, 7, 8]),
  CASAS: Object.freeze({
    PRINCIPAL: Object.freeze({
      nombre: 'Casa Norte', etiqueta: 'NORTE', descripcion: 'la Casa Norte en la ciudad', palabras: Object.freeze(['norte']),
    }),
    SECUNDARIA: Object.freeze({
      nombre: 'Casa Playa', etiqueta: 'PLAYA', descripcion: 'la Casa Playa en la costa', palabras: Object.freeze(['playa']),
    }),
  }),
});

const { faltantesConfig_, avisoConfigIncompleta_, exigirConfigCompleta_ } = reales;
Object.assign(global, { faltantesConfig_, avisoConfigIncompleta_, exigirConfigCompleta_ });

module.exports = { CONFIG };
