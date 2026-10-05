// ============================================================
// BUSCAR UN NOMBRE AUNQUE ESTÉ MAL ESCRITO — para la cuenta compartida de
// conductores: "jaun peres" encuentra "Juan Pérez Gómez". Compara palabra
// por palabra (sin tildes ni mayúsculas) con distancia de edición.
// Funciones puras. Pruebas: test/buscar-nombre.test.js
// ============================================================

const limpiar = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/[^A-Z\s]/g, ' ').replace(/\s+/g, ' ').trim();

/** Distancia de Levenshtein (cuántas letras hay que cambiar). */
function distancia(a, b) {
    const m = a.length, n = b.length;
    if (!m) return n;
    if (!n) return m;
    let previo = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
        const fila = [i];
        for (let j = 1; j <= n; j++) {
            fila[j] = Math.min(previo[j] + 1, fila[j - 1] + 1, previo[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        }
        previo = fila;
    }
    return previo[n];
}

/** Parecido de dos palabras entre 0 y 1 (1 = iguales; prefijo cuenta como muy parecido). */
function parecidoPalabra(a, b) {
    if (a === b) return 1;
    if (a.length >= 3 && b.startsWith(a)) return 0.95;
    const d = distancia(a, b);
    return Math.max(0, 1 - d / Math.max(a.length, b.length));
}

/**
 * Qué tan parecido es lo que escribió a un nombre de la base (0 a 1): cada
 * palabra escrita busca su mejor pareja entre las palabras del nombre.
 */
function parecidoNombre(escrito, nombreBase) {
    const pal = limpiar(escrito).split(' ').filter(Boolean);
    const base = limpiar(nombreBase).split(' ').filter(Boolean);
    if (!pal.length || !base.length) return 0;
    const usadas = new Set();
    let total = 0;
    for (const p of pal) {
        let mejor = 0, idx = -1;
        base.forEach((b, i) => {
            if (usadas.has(i)) return;
            const s = parecidoPalabra(p, b);
            if (s > mejor) { mejor = s; idx = i; }
        });
        if (idx >= 0) usadas.add(idx);
        total += mejor;
    }
    return total / pal.length;
}

/**
 * Los nombres más parecidos a lo escrito, del más al menos parecido.
 * @param {string} escrito
 * @param {Array<{nombre: string}>} lista
 * @param {{ minimo?: number, maximo?: number }} [opciones]
 */
function nombresParecidos(escrito, lista, { minimo = 0.6, maximo = 5 } = {}) {
    return (lista || [])
        .map(x => ({ ...x, parecido: parecidoNombre(escrito, x.nombre) }))
        .filter(x => x.parecido >= minimo)
        .sort((a, b) => b.parecido - a.parecido)
        .slice(0, maximo);
}

/** ¿Lo escrito es exactamente ese nombre (o parte exacta de él)? */
const escritoIgual = (escrito, nombre) => {
    const pal = limpiar(escrito).split(' ').filter(Boolean);
    const base = limpiar(nombre).split(' ');
    return pal.length > 0 && pal.every(p => base.includes(p));
};

module.exports = { nombresParecidos, parecidoNombre, escritoIgual, limpiar };
