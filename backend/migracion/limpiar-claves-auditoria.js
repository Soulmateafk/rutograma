// ============================================================
// LIMPIEZA ÚNICA — contraseñas que quedaron en el registro de auditoría
// ============================================================
// El botón "Restablecer contraseña" (Administrador) manda la clave nueva
// en el campo "nuevaClave", y el registro de auditoría solo censuraba
// "pass" y "passHash" — así que cada restablecimiento anterior dejó esa
// contraseña en texto plano dentro de la tabla "auditoria". El servidor
// ya quedó corregido para que no vuelva a pasar; este script borra las
// que ya se habían guardado.
//
// Por defecto SOLO MUESTRA cuántas entradas afectadas hay (no cambia
// nada). Para limpiarlas de verdad:
//
//   node migracion/limpiar-claves-auditoria.js aplicar
//
// IMPORTANTE: detén el servidor antes de correrlo.

const { conectar } = require('./db.js');

const CAMPOS_SENSIBLES = ['pass', 'passHash', 'nuevaClave', 'password', 'clave', 'contrasena', 'token'];
const aplicar = process.argv[2] === 'aplicar';

// La auditoría siempre vive en la base Real (ver registrarAuditoriaDB).
const db = conectar('real');
const filas = db.prepare('SELECT id, fecha, usuario, ruta, resumen FROM auditoria').all();

let afectadas = 0;
const actualizar = db.prepare('UPDATE auditoria SET resumen = @resumen WHERE id = @id');

const limpiar = db.transaction((lote) => {
  for (const { id, resumen } of lote) actualizar.run({ id, resumen });
});

const paraActualizar = [];

for (const fila of filas) {
  let obj;
  try { obj = JSON.parse(fila.resumen || '{}'); } catch { continue; }
  if (!obj || typeof obj !== 'object') continue;

  const encontrados = CAMPOS_SENSIBLES.filter(campo => Object.prototype.hasOwnProperty.call(obj, campo));
  if (!encontrados.length) continue;

  afectadas++;
  console.log(`- #${fila.id} | ${fila.fecha} | ${fila.usuario} | ${fila.ruta} | campos: ${encontrados.join(', ')}`);

  encontrados.forEach(campo => delete obj[campo]);
  paraActualizar.push({ id: fila.id, resumen: JSON.stringify(obj) });
}

if (afectadas === 0) {
  console.log('\nNo hay contraseñas guardadas en la auditoría. No hace falta hacer nada.');
} else if (aplicar) {
  limpiar(paraActualizar);
  console.log(`\nListo: se limpiaron ${afectadas} entrada(s) de la auditoría.`);
  console.log('Nota: los respaldos automáticos que se hicieron ANTES de esta limpieza siguen teniendo esos datos.');
} else {
  console.log(`\nSe encontraron ${afectadas} entrada(s) con contraseñas guardadas. No se cambió nada.`);
  console.log('Para limpiarlas: node migracion/limpiar-claves-auditoria.js aplicar');
}
