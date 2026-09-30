// ============================================================
// RECUPERACIÓN ÚNICA — teléfonos de conductores
// ============================================================
// El formulario de Conductores usa el campo "tel", pero guardarEnDB()
// (antes de este arreglo) solo leía "telefono" al guardar — como el
// objeto nunca tenía esa clave, cada guardado escribía NULL. El campo
// telefono existe en la tabla desde el día 1, simplemente se quedó
// vacío en cada edición. Esto trae de vuelta los números reales desde
// el Excel original, emparejando por cédula.
//
// Uso: node migracion/recuperar-datos-conductores.js

const { conectar } = require('./db.js');

const telefonosRecuperados = [
  { cedula: '72266642',   telefono: '3219448085' },
  { cedula: '80452107',   telefono: '3212680766' },
  { cedula: '80657176',   telefono: '3013396708' },
  { cedula: '80800622',   telefono: '3133160151' },
  { cedula: '79223015',   telefono: '3138900771' },
  { cedula: '1113308425', telefono: '3105603057' },
  { cedula: '80658205',   telefono: '3224402264' },
  { cedula: '1109840308', telefono: '3227000441' }
];

const modosAActualizar = ['real', 'pruebas'];

for (const modo of modosAActualizar) {
  try {
    const db = conectar(modo);
    const upd = db.prepare('UPDATE conductores SET telefono = @telefono WHERE cedula = @cedula');

    let actualizados = 0;
    for (const r of telefonosRecuperados) {
      const resultado = upd.run(r);
      if (resultado.changes > 0) actualizados++;
    }
    console.log(`[${modo}] ${actualizados} de ${telefonosRecuperados.length} teléfonos recuperados.`);
  } catch (err) {
    console.error(`[${modo}] ❌ Error: ${err.message}`);
  }
}

console.log('\nListo. Revisa en Conductores que el teléfono ya no salga vacío.');
