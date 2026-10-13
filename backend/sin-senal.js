// ============================================================
// Modo sin señal del conductor (Mis viajes).
// Cuando el celular no tiene internet, "Ya salí", "Ya llegué" y las
// novedades se guardan en el celular con la hora en que se tocaron, y se
// envían solos cuando vuelve la señal. Aquí se decide si esa hora se
// puede creer: no puede ser del futuro ni de hace más de 3 días.
// ============================================================

const MAX_ATRASO_MS = 3 * 24 * 60 * 60 * 1000;
const TOLERANCIA_RELOJ_MS = 5 * 60 * 1000; // relojes de celular un poco adelantados

/**
 * Devuelve la fecha (Date) en que de verdad pasó la acción, o null si no
 * viene o no es creíble (entonces se usa la hora del servidor, como siempre).
 */
function horaReal(cuando, ahora = new Date()) {
    if (!cuando) return null;
    const d = new Date(String(cuando));
    if (isNaN(d.getTime())) return null;
    const dif = ahora.getTime() - d.getTime();
    if (dif < -TOLERANCIA_RELOJ_MS || dif > MAX_ATRASO_MS) return null;
    return dif < 0 ? ahora : d;
}

/** Nota para la novedad: "(Lo reportó sin señal a las 3:40 p. m.)" — solo si pasó hace más de 2 minutos. */
function notaSinSenal(real, ahora = new Date()) {
    if (!real || ahora.getTime() - real.getTime() < 2 * 60000) return '';
    const hora = real.toLocaleString('es-CO', { weekday: 'long', hour: 'numeric', minute: '2-digit' });
    return ` (Lo reportó sin señal el ${hora}.)`;
}

module.exports = { horaReal, notaSinSenal, MAX_ATRASO_MS };
