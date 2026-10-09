// ============================================================
// PRESENCIA — quién está en la app ahora mismo y qué está haciendo
// ("Carlos · Rutograma · editando el viaje BOG-CAL de PRZ 065"), y quién
// más tiene abierto el mismo viaje/vehículo/conductor ("Carla está
// editando este viaje"). La misma cuenta abierta en otra ventana u otro
// equipo también sale, como "Tú" (solo se omite la ventana que pregunta).
// Vive solo en memoria y NO queda en ningún historial: cada pestaña avisa
// cada pocos segundos; si deja de avisar, al rato desaparece.
// Pruebas: test/presencia.test.js
// ============================================================

// Una ventana minimizada avisa cada ~25 s (y el navegador puede demorarla
// hasta ~1 min): se espera 90 s antes de darla por cerrada. Al cerrar la
// pestaña normal, se avisa al instante (salir).
const VIGENCIA_MS = 90 * 1000;

/** Foto/emoji de la cuenta (Apariencia → Mi foto): solo si tiene. */
function cara(p) {
    const c = {};
    if (p.avatar) c.avatar = p.avatar;
    if (p.aid && p.fotoV) { c.aid = p.aid; c.fotoV = p.fotoV; }
    return c;
}

/** "Carlos Bocanegra" -> "Carlos"; sin nombre, la parte del correo antes de @. */
function primerNombre(nombre, email = '') {
    const n = String(nombre || '').trim().split(/\s+/)[0];
    if (n) return n.charAt(0).toUpperCase() + n.slice(1).toLowerCase();
    return String(email || '').split('@')[0] || 'Alguien';
}

const corto = (t, max) => String(t || '').trim().replace(/\s+/g, ' ').slice(0, max);

function crearPresencia(vigenciaMs = VIGENCIA_MS) {
    // pestaña -> { email, nombre, dispositivo, pagina, accion, clave, editando, visto, desde }
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
         * La pestaña sigue ahí. datos: { email, nombre, dispositivo, pagina,
         * accion, clave, editando, oculta (minimizada), salir }. clave = lo que tiene abierto ("viaje:123"), si algo.
         */
        latido(pestana, datos, ahora = Date.now()) {
            if (datos.salir) { pestanas.delete(pestana); return; }
            const previo = pestanas.get(pestana);
            const accion = corto(datos.accion, 140);
            const pagina = corto(datos.pagina, 40);
            pestanas.set(pestana, {
                pestana,
                email: datos.email,
                nombre: primerNombre(datos.nombre, datos.email),
                avatar: corto(datos.avatar, 8),
                aid: corto(datos.aid, 16),
                fotoV: corto(datos.fotoV, 16),
                dispositivo: corto(datos.dispositivo, 60),
                pagina, accion,
                clave: corto(datos.clave, 120),
                editando: !!datos.editando,
                oculta: !!datos.oculta,
                visto: ahora,
                // Desde cuándo está en eso (se reinicia si cambia de página o de acción).
                desde: previo && previo.pagina === pagina && previo.accion === accion ? previo.desde : ahora
            });
        },

        /**
         * Quiénes más tienen ese objeto abierto: las demás personas (una por
         * persona) y la misma cuenta en otras ventanas o equipos (esYo).
         */
        otros(clave, email, pestana, ahora = Date.now()) {
            if (!clave) return [];
            const lista = vigentes(ahora).filter(p => p.clave === clave && p.pestana !== pestana);
            const yo = lista.filter(p => p.email === email);
            const demas = unaPorPersona(lista.filter(p => p.email !== email))
                .map(p => ({ nombre: p.nombre, editando: p.editando, esYo: false, ...cara(p) }))
                .sort((a, b) => Number(b.editando) - Number(a.editando) || a.nombre.localeCompare(b.nombre));
            if (yo.length) demas.push({ nombre: 'Tú', editando: yo.some(p => p.editando), esYo: true });
            return demas;
        },

        /**
         * Todos los que están en la app ahora, con qué hacen: las demás
         * personas (una por persona) y, aparte, cada otra ventana o equipo
         * de la misma cuenta ("Tú"). Solo se omite la ventana que pregunta.
         */
        enLinea(email, pestana, ahora = Date.now()) {
            const vivas = vigentes(ahora).filter(p => p.pestana !== pestana);
            const fila = (p, esYo) => ({ nombre: esYo ? 'Tú' : p.nombre, esYo, ...cara(p), dispositivo: p.dispositivo, pagina: p.pagina, accion: p.accion, editando: p.editando, oculta: p.oculta, haceSeg: Math.round((ahora - p.desde) / 1000) });
            const demas = unaPorPersona(vivas.filter(p => p.email !== email)).map(p => fila(p, false)).sort((a, b) => a.nombre.localeCompare(b.nombre));
            const yo = vivas.filter(p => p.email === email).sort((a, b) => b.desde - a.desde).map(p => fila(p, true));
            return [...demas, ...yo];
        }
    };
}

module.exports = { crearPresencia, primerNombre, VIGENCIA_MS };
