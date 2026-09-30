// ============================================================
// VERIFICAR DESCANSO — descansos registrados de un conductor
// ============================================================
// No modifica nada. Muestra los descansos guardados para el conductor
// que le pases (por nombre, aunque sea parcial) y si el vehículo que
// tiene asignado recibió algún viaje justo en esos días.
//
// Uso:
//   node migracion/verificar-descanso.js "Julian David" Septiembre 2026 real

const { conectar } = require('./db.js');

const nombreBuscado = String(process.argv[2] || '').toLowerCase().trim();
const mes = String(process.argv[3] || '');
const anio = String(process.argv[4] || '');
const modo = String(process.argv[5] || 'real').toLowerCase().trim();

if (!nombreBuscado || !mes || !anio) {
  console.log('Uso: node migracion/verificar-descanso.js "<nombre o parte>" <Mes> <Anio> [real|pruebas]');
  console.log('Ej:  node migracion/verificar-descanso.js "Julian David" Septiembre 2026 real');
  process.exit(1);
}

const db = conectar(modo);

const conductores = db.prepare('SELECT * FROM conductores').all()
  .filter(c => String(c.nombre || '').toLowerCase().includes(nombreBuscado));

if (!conductores.length) {
  console.log(`No se encontró ningún conductor cuyo nombre contenga "${nombreBuscado}" en modo ${modo}.`);
  process.exit(0);
}

const claveMes = `${mes}-${anio}`;

for (const c of conductores) {
  console.log(`\n=== ${c.nombre} (cédula ${c.cedula}, placa asignada: ${c.placa || '(ninguna)'}) — modo ${modo} ===`);

  let descansos;
  try { descansos = JSON.parse(c.descansos_por_mes || '{}'); } catch { descansos = {}; }

  const diasTexto = descansos[claveMes];
  console.log(`descansosPorMes["${claveMes}"] = ${JSON.stringify(diasTexto ?? null)}`);

  if (!diasTexto) {
    console.log('(No hay descansos registrados para ese mes con esta clave exacta — revisa mayúsculas/acentos si esperabas que sí hubiera.)');
    continue;
  }

  const dias = String(diasTexto).split(',').map(x => Number(x.trim())).filter(x => !isNaN(x));
  console.log(`Días de descanso: ${dias.join(', ')}`);

  if (!c.placa) {
    console.log('Este conductor no tiene placa asignada — no se puede cruzar contra viajes.');
    continue;
  }

  for (const dia of dias) {
    const fechaString = `${anio}-${String(mesNumero(mes)).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
    const viaje = db.prepare('SELECT placa, ruta, estado FROM viajes WHERE placa = ? AND fecha = ?').get(c.placa, fechaString);
    if (viaje) {
      console.log(`  ${fechaString}: ❌ HAY UN VIAJE asignado (${viaje.ruta}, estado ${viaje.estado}) — el descanso NO se respetó.`);
    } else {
      console.log(`  ${fechaString}: ✅ sin viaje asignado — el descanso se respetó.`);
    }
  }
}

function mesNumero(nombreMes) {
  const mapa = { 'Enero':1,'Febrero':2,'Marzo':3,'Abril':4,'Mayo':5,'Junio':6,'Julio':7,'Agosto':8,'Septiembre':9,'Octubre':10,'Noviembre':11,'Diciembre':12 };
  return mapa[nombreMes] || 1;
}
