// ============================================================
// PRESENCIA — quién está en la app ahora mismo y qué está haciendo
// ("Carlos · Rutograma · editando el viaje BOG-CAL de PRZ 065"), y quién
// más tiene abierto el mismo viaje/vehículo/conductor ("Carla está
// editando este viaje"). Vive solo en memoria y NO queda en ningún
// historial: cada pestaña avisa cada pocos segundos; si deja de avisar,
// en 30 s desaparece.
// Pruebas: test/presencia.test.js
// ============================================================

const VIGENCIA_MS = 30 * 1000;

/** "Carlos Bocanegra" -> "Carlos"; sin nombre, la parte del correo antes de @. */
function primerNombre(nombre, email = '') {
    const n = String(nombre || '').trim().split(/\s+/)[0];
    if (n) return n.charAt(0).toUpperCase() + n.slice(1).toLowerCase();
    return String(email || '').split('@')[0] || 'Alguien';
}

const corto = (t, max) => String(t || '').trim().replace(/\s+/g, ' ').slice(0, max);

function crearPresencia(vigenciaMs = VIGENCIA_MS) {
    // pestaña -> { email, nombre, pagina, accion, clave, editando, visto, desde }
    const pestanas = new Map();

    const vigentes = (ahora) => {
        for (const [id, p] of pestanas) if (ahora - p.visto > vigenciaMs) pestanas.delete(id);
        return [...pestanas.values()];
    };

    /** De varias pestañas de la misma persona, la que más dice: la que edita, si no la más reciente. */
    const unaPorPersona = (lista) => {
        const porPersona = new Map();
        for (const p of lista) {
            const previo = porPersona.get(p.email);
            if (!previo || (p.editando && !previo.editando) || (p.editando === previo.editando && p.desde > previo.desde)) porPersona.set(p.email, p);
        }
        return [...porPersona.values()];
    };

    return {
        /**
         * La pestaña sigue ahí. datos: { email, nombre, pagina, accion, clave,
         * editando, salir }. clave = lo que tiene abierto ("viaje:123"), si algo.
         */
        latido(pestana, datos, ahora = Date.now()) {
            if (datos.salir) { pestanas.delete(pestana); return; }
            const previo = pestanas.get(pestana);
            const accion = corto(datos.accion, 140);
            const pagina = corto(datos.pagina, 40);
            pestanas.set(pestana, {
                email: datos.email,
                nombre: primerNombre(datos.nombre, datos.email),
                pagina, accion,
                clave: corto(datos.clave, 120),
                editando: !!datos.editando,
                visto: ahora,
                // Desde cuándo está en eso (se reinicia si cambia de página o de acción).
                desde: previo && previo.pagina === pagina && previo.accion === accion ? previo.desde : ahora
            });
        },

        /** Las demás personas (no la misma cuenta) con ese mismo objeto abierto. */
        otros(clave, email, ahora = Date.now()) {
            if (!clave) return [];
            return unaPorPersona(vigentes(ahora).filter(p => p.clave === clave && p.email !== email))
                .map(p => ({ nombre: p.nombre, editando: p.editando }))
                .sort((a, b) => Number(b.editando) - Number(a.editando) || a.nombre.localeCompare(b.nombre));
        },

        /** Todos los que están en la app ahora (menos quien pregunta), con qué hacen. */
        enLinea(email, ahora = Date.now()) {
            return unaPorPersona(vigentes(ahora).filter(p => p.email !== email))
                .map(p => ({ nombre: p.nombre, pagina: p.pagina, accion: p.accion, editando: p.editando, haceSeg: Math.round((ahora - p.desde) / 1000) }))
                .sort((a, b) => a.nombre.localeCompare(b.nombre));
        }
    };
}

module.exports = { crearPresencia, primerNombre, VIGENCIA_MS };
