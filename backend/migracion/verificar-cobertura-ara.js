// ============================================================
// VERIFICAR COBERTURA — rutas de cliente "Ara"
// ============================================================
// No modifica nada. Revisa, para cada día de un mes, si una ruta que
// debía salir (según su horario configurado en "dias") de verdad tiene
// un viaje generado — y si lo tiene, con qué transportadora.
//
// IMPORTANTE: corre esto DESPUÉS de haber generado la matriz DE VERDAD
// (no solo la vista previa) para el mes que quieres revisar — si no,
// vas a estar mirando viajes de una corrida vieja.
//
// Uso: node migracion/verificar-cobertura-ara.js

const { conectar } = require('./db.js');

const MODO = 'real';          // cambia a 'pruebas' si quieres revisar esa base
const MES_TEXTO = 'Septiembre';
const ANIO = 2026;
const MES_INDEX = 8;          // Septiembre = 8 (Enero = 0)
const CODIGOS_ARA = ['BOG-BAQ-ARA', 'BOG-MON-ARA', 'BOG-VDU-ARA', 'BOG-CTG-ARA'];

// Si generaste la matriz con días festivos marcados, ponlos aquí en
// formato "YYYY-MM-DD" — si no usaste festivos ese mes, deja el arreglo
// vacío.
const FESTIVOS = [];

const mapaDiasClave = { 0: 'dom', 1: 'lun', 2: 'mar', 3: 'mie', 4: 'jue', 5: 'vie', 6: 'sab' };
const totalDiasMes = new Date(ANIO, MES_INDEX + 1, 0).getDate();

const db = conectar(MODO);

console.log(`=== Cobertura de rutas Ara — ${MES_TEXTO} ${ANIO} (modo ${MODO}) ===\n`);

for (const cod of CODIGOS_ARA) {
  const ruta = db.prepare('SELECT * FROM rutas WHERE cod = ?').get(cod);
  if (!ruta) {
    console.log(`${cod}: ⚠️ no existe en la base — se salta.\n`);
    continue;
  }

  let dias;
  try { dias = JSON.parse(ruta.dias || '{}'); } catch { dias = {}; }

  console.log(`--- ${cod} (clientes: "${ruta.clientes}", activa: ${ruta.activa}) ---`);

  let huecos = 0;
  let diasQueDebiaCorrer = 0;

  for (let dia = 1; dia <= totalDiasMes; dia++) {
    const fecha = new Date(ANIO, MES_INDEX, dia);
    const yyyy = fecha.getFullYear();
    const mm = String(fecha.getMonth() + 1).padStart(2, '0');
    const dd = String(fecha.getDate()).padStart(2, '0');
    const fechaString = `${yyyy}-${mm}-${dd}`;

    const esFestivo = FESTIVOS.includes(fechaString);
    const claveDia = esFestivo ? 'fes' : mapaDiasClave[fecha.getDay()];
    const cfgDia = dias[claveDia];
    const debeCorrer = !!(cfgDia && cfgDia.checked);

    if (!debeCorrer) continue;
    diasQueDebiaCorrer++;

    const viaje = db.prepare(`
      SELECT placa, transportadora, estado FROM viajes
      WHERE ruta = ? AND fecha = ?
    `).get(cod, fechaString);

    if (!viaje) {
      console.log(`  ${fechaString} (${claveDia}): ❌ HUECO — no hay ningún viaje generado este día.`);
      huecos++;
    } else {
      console.log(`  ${fechaString} (${claveDia}): ${viaje.transportadora} — placa ${viaje.placa} (${viaje.estado})`);
    }
  }

  console.log(`  Resumen: ${diasQueDebiaCorrer} días programados, ${huecos} sin cubrir.\n`);
}

console.log('Si algún día sale "HUECO", ahí sí hay un bug real que cubrir (la ruta se quedó sin transporte).');
console.log('Si todos los días muestran MAKAND, la ruta se cubrió siempre con flota propia — 0 Arsitrans es correcto ese mes, no un bug.');
