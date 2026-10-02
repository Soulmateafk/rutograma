// ============================================================
// migrar.js — Lee tu Excel actual y lo copia a la base de datos
// SQLite nueva. NO borra ni modifica el Excel — se queda intacto
// como respaldo.
//
// CÓMO USARLO:
//   1. Copia esta carpeta completa ("migracion-db") dentro de tu
//      carpeta del backend (junto a server.js).
//   2. npm install better-sqlite3
//   3. Ajusta RUTA_EXCEL más abajo si tu archivo no se llama igual.
//   4. node migracion-db/migrar.js            (para el Excel REAL)
//      node migracion-db/migrar.js pruebas     (para el de Pruebas)
//   5. Revisa los números que imprime al final — deben coincidir
//      con lo que ves en la app.
// ============================================================

const XLSX = require('xlsx');
const path = require('path');
const { guardarEnDB } = require('./db.js');

const modo = process.argv[2] === 'pruebas' ? 'pruebas' : 'real';
const nombreArchivo = modo === 'pruebas' ? 'DatabaseRutograma_Pruebas.XLSX' : 'DatabaseRutograma.XLSX';

// Ajusta esta ruta a donde esté tu Excel real de verdad.
const RUTA_EXCEL = path.join(__dirname, '..', 'data', nombreArchivo);

console.log(`📂 Modo: ${modo}`);
console.log(`📂 Leyendo: ${RUTA_EXCEL}`);
const libro = XLSX.readFile(RUTA_EXCEL);

const leerHoja = (nombre) => {
  const hoja = libro.Sheets[nombre];
  return hoja ? XLSX.utils.sheet_to_json(hoja) : [];
};

const aJSON = (valor, porDefecto) => {
  if (!valor) return porDefecto;
  if (typeof valor === 'object') return valor;
  try { return JSON.parse(valor); } catch { return porDefecto; }
};

// --- Vehículos ---
const vehiculos = leerHoja('Vehiculos').map(v => ({
  ...v,
  historialMantenimiento: aJSON(v.historialMantenimiento, []),
  historialAverias: aJSON(v.historialAverias, [])
}));
console.log(`🚚 Vehículos encontrados: ${vehiculos.length}`);

// --- Rutas ---
const rutas = leerHoja('Rutas').map(r => ({
  ...r,
  dias: aJSON(r.dias, {}),
  entregaManual: aJSON(r.entregaManual, {})
}));
console.log(`🛣️  Rutas encontradas: ${rutas.length}`);

// --- Conductores ---
const conductores = leerHoja('Conductores').map(c => ({
  ...c,
  descansosPorMes: aJSON(c.descansosPorMes, {})
}));
console.log(`👤 Conductores encontrados: ${conductores.length}`);

// --- Viajes ---
const viajes = leerHoja('Viajes');
console.log(`🚛 Viajes encontrados: ${viajes.length}`);

// --- Usuarios ---
const usuarios = leerHoja('Usuarios');
console.log(`🔑 Usuarios encontrados: ${usuarios.length}`);

// --- Novedades ---
const novedades = leerHoja('Novedades');
console.log(`⚡ Novedades encontradas: ${novedades.length}`);

// --- Historial (3 hojas separadas — una "foto" completa por mes) ---
const armarHistorial = (nombreHoja) => leerHoja(nombreHoja).map(h => {
  const { dataJSON, ...resto } = h;
  return { ...resto, datos: aJSON(dataJSON, []) };
});
const historialvehiculos = armarHistorial('Historialvehiculos');
const historialrutas = armarHistorial('Historialrutas');
const historialconductores = armarHistorial('Historialconductores');
console.log(`📊 Historial vehículos: ${historialvehiculos.length} meses`);
console.log(`📊 Historial rutas: ${historialrutas.length} meses`);
console.log(`📊 Historial conductores: ${historialconductores.length} meses`);

// --- Guardar todo en SQLite ---
guardarEnDB({
  vehiculos, rutas, conductores, viajes, usuarios, novedades,
  historialvehiculos, historialrutas, historialconductores
}, modo);

console.log(`\n✅ Migración completa (modo: ${modo}). El Excel original NO se tocó — sigue intacto como respaldo.`);
console.log('   Revisa los números de arriba contra lo que ves en la app antes de seguir.');