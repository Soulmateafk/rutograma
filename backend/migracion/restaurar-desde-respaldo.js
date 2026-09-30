// ============================================================
// RESTAURAR EL RESPALDO MÁS RECIENTE — automático
// ============================================================
// IMPORTANTE: antes de correr esto, DETÉN el servidor (Ctrl+C en la
// ventana donde corre `node server.js`). Si el servidor sigue corriendo,
// puede que no deje reemplazar el archivo.
//
// Qué hace, en orden:
//   1. Busca en migracion/data/respaldos/ el respaldo más reciente del
//      modo que le indiques (real o pruebas).
//   2. Guarda el archivo actual (el dañado) con otro nombre, por si
//      hace falta más adelante — NO lo borra.
//   3. Copia ese respaldo al lugar del archivo actual.
//   4. Borra los archivos -wal/-shm viejos si quedaron ahí, para que
//      SQLite no intente "reaplicar" cambios que ya no corresponden.
//
// Uso:
//   node migracion/restaurar-desde-respaldo.js real
//   node migracion/restaurar-desde-respaldo.js pruebas
//
// Si no le pones nada, usa "real" por defecto.

const fs = require('fs');
const path = require('path');

const modo = String(process.argv[2] || 'real').toLowerCase().trim();
if (modo !== 'real' && modo !== 'pruebas') {
  console.log('El modo debe ser "real" o "pruebas". Ejemplo: node migracion/restaurar-desde-respaldo.js real');
  process.exit(1);
}

const CARPETA_DATOS = path.join(__dirname, 'data');
const CARPETA_RESPALDOS = path.join(CARPETA_DATOS, 'respaldos');
const rutaActual = path.join(CARPETA_DATOS, modo === 'pruebas' ? 'rutograma_pruebas.db' : 'rutograma.db');
const prefijo = modo === 'pruebas' ? 'rutograma_pruebas_' : 'rutograma_';
const prefijoAExcluir = modo === 'real' ? 'rutograma_pruebas_' : null;

if (!fs.existsSync(CARPETA_RESPALDOS)) {
  console.log(`❌ No existe la carpeta de respaldos: ${CARPETA_RESPALDOS}`);
  process.exit(1);
}

const respaldos = fs.readdirSync(CARPETA_RESPALDOS)
  .filter(f => f.startsWith(prefijo) && (!prefijoAExcluir || !f.startsWith(prefijoAExcluir)) && f.endsWith('.db'))
  .map(nombre => ({ nombre, ruta: path.join(CARPETA_RESPALDOS, nombre), fecha: fs.statSync(path.join(CARPETA_RESPALDOS, nombre)).mtime }))
  .sort((a, b) => b.fecha - a.fecha);

if (!respaldos.length) {
  console.log(`❌ No encontré ningún respaldo de modo "${modo}" en ${CARPETA_RESPALDOS}`);
  process.exit(1);
}

const elegido = respaldos[0];
console.log(`📦 Respaldo más reciente encontrado: ${elegido.nombre} (${elegido.fecha.toLocaleString()})`);

// Paso 2: guardar el archivo dañado a un lado, sin borrarlo.
if (fs.existsSync(rutaActual)) {
  const marcaTiempo = new Date().toISOString().replace(/[:.]/g, '-');
  const rutaDanado = path.join(CARPETA_DATOS, `DANADO_${marcaTiempo}_${path.basename(rutaActual)}`);
  fs.renameSync(rutaActual, rutaDanado);
  console.log(`🗄️  El archivo actual se guardó como: ${path.basename(rutaDanado)} (por si hace falta después)`);
}

// Paso 3: copiar el respaldo al lugar del archivo actual.
fs.copyFileSync(elegido.ruta, rutaActual);
console.log(`✅ Se restauró ${elegido.nombre} como ${path.basename(rutaActual)}`);

// Paso 4: limpiar -wal/-shm viejos.
['-wal', '-shm'].forEach(sufijo => {
  const rutaExtra = rutaActual + sufijo;
  if (fs.existsSync(rutaExtra)) {
    fs.unlinkSync(rutaExtra);
    console.log(`🧹 Se borró el archivo temporal: ${path.basename(rutaExtra)}`);
  }
});

console.log('\nListo. Ahora vuelve a arrancar el servidor (node server.js) e intenta iniciar sesión.');
