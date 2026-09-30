// ============================================================
// DIAGNÓSTICO — no modifica nada, solo muestra qué hay guardado
// ============================================================
// Uso: node migracion/diagnostico-rutas.js

const { conectar } = require('./db.js');

const modos = ['real', 'pruebas'];

for (const modo of modos) {
  console.log(`\n=== Modo: ${modo.toUpperCase()} ===`);
  try {
    const db = conectar(modo);

    // ¿Existen de verdad las columnas nuevas?
    const columnas = db.prepare("PRAGMA table_info(rutas)").all().map(c => c.name);
    const columnasEsperadas = ['clientes', 'tarifa_makand', 'tarifa_arsitrans', 'tarifa_polar', 'cajas_min', 'vigente_desde', 'activa'];
    const faltantes = columnasEsperadas.filter(c => !columnas.includes(c));
    if (faltantes.length) {
      console.log(`❌ Faltan columnas en la tabla rutas: ${faltantes.join(', ')} — necesitas reemplazar db.js/esquema.sql y reiniciar el servidor ANTES de seguir.`);
      continue;
    }
    console.log('✅ Todas las columnas nuevas existen.');

    const filas = db.prepare(`
      SELECT cod, clientes, tarifa_makand, tarifa_arsitrans, tarifa_polar, cajas_min, vigente_desde, activa
      FROM rutas
      ORDER BY cod
    `).all();

    console.log(`Total de rutas: ${filas.length}`);
    console.log('\nRutas cuyo cliente contiene "ara" (deberían ir a Arsitrans):');
    const conAra = filas.filter(f => String(f.clientes || '').toLowerCase().includes('ara'));
    if (!conAra.length) {
      console.log('  ⚠️ NINGUNA ruta tiene "ara" en el campo clientes — por eso nunca se asigna Arsitrans.');
    }
    conAra.forEach(f => {
      console.log(`  ${f.cod.padEnd(15)} clientes="${f.clientes}" activa=${f.activa} vigenteDesde=${f.vigente_desde || '(ninguna)'}`);
    });

    console.log('\nTodas las rutas (primeras 20) — clientes y activa:');
    filas.slice(0, 20).forEach(f => {
      console.log(`  ${f.cod.padEnd(15)} clientes="${f.clientes}" activa=${f.activa}`);
    });
  } catch (err) {
    console.error(`❌ Error: ${err.message}`);
  }
}
