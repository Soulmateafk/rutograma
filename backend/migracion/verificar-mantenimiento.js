// ============================================================
// VERIFICAR MANTENIMIENTO — estado real de un vehículo en la base
// ============================================================
// No modifica nada. Muestra el estado, fecha de inicio/fin de
// mantenimiento y el historial guardado para la placa que le pases.
//
// Uso:
//   node migracion/verificar-mantenimiento.js LUN428
//   node migracion/verificar-mantenimiento.js LUN428 pruebas   (para Modo Prueba)

const { conectar } = require('./db.js');

const placaBuscada = String(process.argv[2] || '').toUpperCase().trim();
const modo = String(process.argv[3] || 'real').toLowerCase().trim();

if (!placaBuscada) {
  console.log('Uso: node migracion/verificar-mantenimiento.js <PLACA> [real|pruebas]');
  process.exit(1);
}

const db = conectar(modo);

const placaSinEspacios = placaBuscada.replace(/\s+/g, '');
const v = db.prepare('SELECT * FROM vehiculos').all()
  .find(row => String(row.placa || '').toUpperCase().replace(/\s+/g, '') === placaSinEspacios);

if (!v) {
  console.log(`No se encontró ningún vehículo con placa "${placaBuscada}" en modo ${modo}.`);
  process.exit(0);
}

console.log(`=== ${v.placa} (modo ${modo}) ===`);
console.log(`estado:        ${v.estado}`);
console.log(`mant_inicio:   ${v.mant_inicio || '(vacío)'}`);
console.log(`mant_fin:      ${v.mant_fin || '(vacío)'}`);
console.log(`historial_mant: ${v.historial_mant}`);

// También revisamos si hay algún viaje de este mes con estado
// "Mantenimiento" para esta placa, por si la pantalla depende de eso
// en vez de (o además de) los campos del vehículo.
const viajesMant = db.prepare(`
  SELECT fecha, estado FROM viajes WHERE placa = ? AND estado = 'Mantenimiento'
  ORDER BY fecha
`).all(v.placa);
console.log(`\nViajes con estado "Mantenimiento" para esta placa: ${viajesMant.length}`);
viajesMant.forEach(vj => console.log(`  ${vj.fecha}`));