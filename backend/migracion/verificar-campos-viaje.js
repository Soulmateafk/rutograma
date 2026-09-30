// ============================================================
// VERIFICAR CAMPOS NUEVOS DE UN VIAJE
// ============================================================
// No modifica nada. Muestra todos los campos (incluidos los nuevos:
// cli, cli2, split, motivo_cancelacion, peso_kg, vol_m3, prod, manif,
// obs, hora_real, fecha_entrega, cond_temporal, novedades) de un viaje,
// buscando por id o por placa+fecha.
//
// Uso:
//   node migracion/verificar-campos-viaje.js id 12345 real
//   node migracion/verificar-campos-viaje.js placa LUN428 2026-09-15 real

const { conectar } = require('./db.js');

const modoBusqueda = String(process.argv[2] || '').toLowerCase();
const db = conectar(String(process.argv[5] || process.argv[4] || 'real').toLowerCase() === 'pruebas' ? 'pruebas' : 'real');

let viajes = [];
if (modoBusqueda === 'id') {
  const id = String(process.argv[3] || '');
  viajes = db.prepare('SELECT * FROM viajes WHERE id = ?').all(id);
} else if (modoBusqueda === 'placa') {
  const placa = String(process.argv[3] || '').toUpperCase().replace(/\s+/g, '');
  const fecha = String(process.argv[4] || '');
  viajes = db.prepare('SELECT * FROM viajes').all()
    .filter(v => String(v.placa || '').toUpperCase().replace(/\s+/g, '') === placa && (!fecha || v.fecha === fecha));
} else {
  console.log('Uso:');
  console.log('  node migracion/verificar-campos-viaje.js id <ID> [real|pruebas]');
  console.log('  node migracion/verificar-campos-viaje.js placa <PLACA> <YYYY-MM-DD> [real|pruebas]');
  process.exit(1);
}

if (!viajes.length) {
  console.log('No se encontró ningún viaje con esos datos.');
  process.exit(0);
}

viajes.forEach(v => {
  console.log(`\n=== Viaje ${v.id} — ${v.placa} — ${v.fecha} — ${v.ruta} ===`);
  console.log(`cajas: ${v.cajas ?? '(vacío)'}`);
  console.log(`cli: ${v.cli || '(vacío)'}  |  cli2: ${v.cli2 || '(vacío)'}  |  cajas2: ${v.cajas2 ?? '(vacío)'}`);
  console.log(`split: ${!!v.split}  |  split_razon: ${v.split_razon || '(vacío)'}`);
  console.log(`motivo_cancelacion: ${v.motivo_cancelacion || '(vacío)'}`);
  console.log(`peso_kg: ${v.peso_kg ?? '(vacío)'}  |  vol_m3: ${v.vol_m3 ?? '(vacío)'}  |  prod: ${v.prod}`);
  console.log(`manif: ${v.manif || '(vacío)'}  |  obs: ${v.obs || '(vacío)'}`);
  console.log(`hora_real: ${v.hora_real || '(vacío)'}  |  fecha_entrega: ${v.fecha_entrega || '(vacío)'}`);
  console.log(`cond_temporal: ${v.cond_temporal || '(vacío)'}`);
  console.log(`novedades: ${v.novedades}`);
  console.log(`peso: ${v.peso ?? '(vacío)'}  |  volumen: ${v.volumen ?? '(vacío)'}  |  manifiesto: ${v.manifiesto || '(vacío)'}`);
  console.log(`costo: ${v.costo ?? '(vacío)'}  |  prioridad: ${v.prioridad}`);
});