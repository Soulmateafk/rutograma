// ============================================================
// EN VIVO — un canal abierto con cada pestaña de la oficina (Server-Sent
// Events, sin instalar nada) para:
//  - CABECITAS: dónde tiene el mouse cada persona en el Rutograma (qué
//    vehículo, qué día y en qué parte de la celda), para dibujar su
//    cabecita de su color moviéndose en los demás computadores.
//  - CAMBIOS AL INSTANTE: cuando alguien guarda algo, los demás recargan
//    los datos de una vez (sin esperar los 20 s) y el viaje cambiado
//    destella con el color de quien lo cambió.
// Vive solo en memoria; no queda en ningún historial.
// Pruebas: test/vivo.test.js
// ============================================================

const corto = (t, max) => String(t ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
const COLOR = /^#[0-9a-f]{6}$/i;

function crearVivo() {
    // pestaña -> { res, email, nombre, color, avatar, aid, fotoV, modo }
    const conectados = new Map();

    const enviar = (c, evento) => {
        try { c.res.write(`data: ${JSON.stringify(evento)}\n\n`); } catch { /* se cerró: lo quita 'close' */ }
    };
    /** A todos los de ese modo menos a la misma persona (sus otras ventanas ya lo saben). */
    const repartir = (desdeEmail, modo, evento, incluirMismaPersona = false) => {
        for (const c of conectados.values()) {
            if (c.modo !== modo) continue;
            if (!incluirMismaPersona && c.email === desdeEmail) continue;
            enviar(c, evento);
        }
    };

    return {
        /** Abre el canal de una pestaña (res = respuesta de Express ya preparada para SSE). */
        conectar(pestana, datos, res) {
            const previo = conectados.get(pestana);
            if (previo && previo.res !== res) { try { previo.res.end(); } catch { /* nada */ } }
            conectados.set(pestana, {
                res, email: datos.email, nombre: corto(datos.nombre, 40), modo: datos.modo || 'real',
                color: COLOR.test(String(datos.color || '')) ? datos.color : '#2563eb',
                avatar: corto(datos.avatar, 8), aid: corto(datos.aid, 16), fotoV: corto(datos.fotoV, 16)
            });
            enviar(conectados.get(pestana), { tipo: 'hola' });
        },

        desconectar(pestana, res) {
            const c = conectados.get(pestana);
            if (!c || (res && c.res !== res)) return;
            conectados.delete(pestana);
            repartir(c.email, c.modo, { tipo: 'cursor', pestana, salir: true });
        },

        /**
         * Dónde está el mouse de esa pestaña: { pagina, placa, dia, fx, fy }
         * (fx/fy = parte de la celda, de 0 a 1), o salir.
         */
        cursor(pestana, datos) {
            const c = conectados.get(pestana);
            if (!c) return false;
            if (datos.color && COLOR.test(datos.color)) c.color = datos.color;
            const num = (x) => Math.min(1, Math.max(0, Number(x) || 0));
            const evento = datos.salir || !datos.placa
                ? { tipo: 'cursor', pestana, salir: true }
                : { tipo: 'cursor', pestana, nombre: c.nombre, color: c.color, avatar: c.avatar, aid: c.aid, fotoV: c.fotoV,
                    pagina: corto(datos.pagina, 40), placa: corto(datos.placa, 20), dia: Number(datos.dia) || 0,
                    fx: num(datos.fx), fy: num(datos.fy), viaje: corto(datos.viaje, 80) };
            repartir(c.email, c.modo, evento);
            return true;
        },

        /** Alguien guardó algo: los demás recargan ya. */
        cambio(email, modo, nombre, color) {
            const c = [...conectados.values()].find(x => x.email === email);
            repartir(email, modo || 'real', { tipo: 'cambio', nombre: corto(nombre || c?.nombre, 40), color: c?.color || color || '#2563eb', en: Date.now() });
        },

        /** Latido para que el canal no se corte por inactividad. */
        latir() { for (const c of conectados.values()) { try { c.res.write(': latido\n\n'); } catch { /* nada */ } } },

        cuantos() { return conectados.size; }
    };
}

module.exports = { crearVivo };
