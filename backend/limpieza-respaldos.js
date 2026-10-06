// ============================================================
// LIMPIEZA DE RESPALDOS — cada guardado crea una copia completa de la base
// (unos 7 MB). Sin limpieza se acumulan gigas en pocos días. Se conservan:
//   - siempre los 30 más recientes,
//   - de los últimos 3 días, el más reciente de cada hora,
//   - de los últimos 60 días, el más reciente de cada día,
//   - los "antes-..." (antes de Generar Matriz, Reacomodar, Importar,
//     Restaurar...) aparte: los 20 más recientes de los últimos 60 días.
// El resto se borra. Función pura: decide qué borrar; quien la llama borra.
// Pruebas: test/limpieza-respaldos.test.js
// ============================================================

const HORA = 3600000;
const DIA = 24 * HORA;
const REGLAS = { recientes: 30, diasPorHora: 3, diasPorDia: 60, antesDeAccion: 20 };

const esAntesDeAccion = (nombre) => /_antes-[a-z0-9-]+\.db$/i.test(nombre);
const claveHora = (ms) => new Date(ms).toISOString().slice(0, 13);
const claveDia = (ms) => new Date(ms).toISOString().slice(0, 10);

/**
 * archivos: [{ nombre, ms }] (ms = fecha de modificación). ahora: ms.
 * Devuelve los nombres que se pueden borrar.
 */
function respaldosParaBorrar(archivos, ahora = Date.now(), reglas = REGLAS) {
    const guardar = new Set();
    const normales = archivos.filter(a => !esAntesDeAccion(a.nombre)).sort((a, b) => b.ms - a.ms);
    const antes = archivos.filter(a => esAntesDeAccion(a.nombre)).sort((a, b) => b.ms - a.ms);

    normales.slice(0, reglas.recientes).forEach(a => guardar.add(a.nombre));
    const horasVistas = new Set(), diasVistos = new Set();
    for (const a of normales) {
        const edad = ahora - a.ms;
        if (edad <= reglas.diasPorHora * DIA && !horasVistas.has(claveHora(a.ms))) {
            horasVistas.add(claveHora(a.ms));
            guardar.add(a.nombre);
        }
        if (edad <= reglas.diasPorDia * DIA && !diasVistos.has(claveDia(a.ms))) {
            diasVistos.add(claveDia(a.ms));
            guardar.add(a.nombre);
        }
    }
    antes.filter(a => ahora - a.ms <= reglas.diasPorDia * DIA)
        .slice(0, reglas.antesDeAccion)
        .forEach(a => guardar.add(a.nombre));

    return archivos.map(a => a.nombre).filter(n => !guardar.has(n));
}

module.exports = { respaldosParaBorrar, esAntesDeAccion, REGLAS };
