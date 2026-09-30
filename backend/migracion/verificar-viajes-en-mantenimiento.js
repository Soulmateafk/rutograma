// ============================================================
// VERIFICAR VIAJES DE UNA PLACA CONTRA SUS MANTENIMIENTOS
// ============================================================
// No modifica nada. Muestra todos los viajes del mes de una placa y
// si caen dentro de un mantenimiento (activo o del historial) — y si
// siguen contando (cualquier estado que no sea Cancelado) cuando no
// deberían.
//
// Uso: node migracion/verificar-viajes-en-mantenimiento.js LUN429 Septiembre 2026 real

const { conectar } = require('./db.js');

const placaBuscada = String(process.argv[2] || '').toUpperCase().replace(/\s+/g, '');
const mesTexto = String(process.argv[3] || '');
const anio = String(process.argv[4] || '');
const modo = String(process.argv[5] || 'real').toLowerCase().trim();

if (!placaBuscada || !mesTexto || !anio) {
  console.log('Uso: node migracion/verificar-viajes-en-mantenimiento.js <PLACA> <Mes> <Anio> [real|pruebas]');
  process.exit(1);
}

const db = conectar(modo);

const vehiculo = db.prepare('SELECT * FROM vehiculos').all()
  .find(v => String(v.placa || '').toUpperCase().replace(/\s+/g, '') === placaBuscada);

if (!vehiculo) {
  console.log(`No se encontró ningún vehículo con placa "${placaBuscada}" en modo ${modo}.`);
  process.exit(0);
}

console.log(`=== ${vehiculo.placa} (modo ${modo}) ===`);
console.log(`estado actual: ${vehiculo.estado}`);
console.log(`mantenimiento activo: ${vehiculo.mant_inicio || '(ninguno)'} a ${vehiculo.mant_fin || '(ninguno)'}`);

let historial;
try { historial = JSON.parse(vehiculo.historial_mant || '[]'); } catch { historial = []; }
console.log(`historial de mantenimientos: ${historial.length ? historial.map(h => `${h.inicio} a ${h.fin}`).join(' | ') : '(ninguno)'}`);

const rangos = [];
if (vehiculo.mant_inicio && vehiculo.mant_fin) rangos.push({ inicio: vehiculo.mant_inicio, fin: vehiculo.mant_fin, tipo: 'ACTIVO' });
historial.forEach(h => { if (h.inicio && h.fin) rangos.push({ inicio: h.inicio, fin: h.fin, tipo: 'historial' }); });

const viajes = db.prepare('SELECT * FROM viajes WHERE placa = ? AND mes = ? AND anio = ? ORDER BY fecha').all(vehiculo.placa, mesTexto, Number(anio));

console.log(`\nViajes de ${mesTexto} ${anio} para ${vehiculo.placa}: ${viajes.length}`);

let problemas = 0;
viajes.forEach(v => {
  const rangoQueChoca = rangos.find(r => v.fecha >= r.inicio && v.fecha <= r.fin);
  const cuentaComoViaje = v.estado !== 'Cancelado';
  if (rangoQueChoca && cuentaComoViaje) {
    console.log(`  ❌ ${v.fecha} — ruta ${v.ruta} — estado "${v.estado}" — cae dentro del mantenimiento ${rangoQueChoca.tipo} (${rangoQueChoca.inicio} a ${rangoQueChoca.fin}) y SIGUE CONTANDO.`);
    problemas++;
  } else if (rangoQueChoca) {
    console.log(`  ✅ ${v.fecha} — ruta ${v.ruta} — estado "${v.estado}" — cae dentro del mantenimiento ${rangoQueChoca.tipo}, pero ya está Cancelado (no cuenta).`);
  } else {
    console.log(`  •  ${v.fecha} — ruta ${v.ruta} — estado "${v.estado}" — fuera de cualquier mantenimiento, normal.`);
  }
});

console.log(`\n${problemas === 0 ? '✅ No hay ningún viaje contando dentro de un mantenimiento.' : `⚠️ ${problemas} viaje(s) siguen contando dentro de un mantenimiento — esto sí es un bug.`}`);
