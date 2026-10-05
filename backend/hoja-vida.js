// ============================================================
// HOJA DE VIDA DEL VEHÍCULO — todo lo de una placa en un solo lugar:
// datos, documentos, conductores que lo han manejado, viajes por mes,
// destinos, mantenimientos, averías (vehículo varado) y novedades que lo
// mencionan. Función pura (sin Express). Pruebas: test/hoja-vida.test.js
// ============================================================

const pegada = (p) => String(p || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const SIN_CONDUCTOR = ['', 'SIN ASIGNAR', 'ASIGNADO', 'SIN CONDUCTOR'];

function diasEntre(desde, hasta) {
    const a = new Date(`${desde}T00:00:00`), b = new Date(`${hasta}T00:00:00`);
    if (isNaN(a.getTime()) || isNaN(b.getTime())) return null;
    return Math.round((b - a) / 86400000);
}

/** Estado de un documento según cuántos días le faltan. */
function estadoDocumento(nombre, vence, hoy) {
    if (!vence) return { nombre, vence: null, dias: null, estado: 'sin dato' };
    const dias = diasEntre(hoy, String(vence).slice(0, 10));
    if (dias === null) return { nombre, vence, dias: null, estado: 'sin dato' };
    return { nombre, vence, dias, estado: dias < 0 ? 'vencido' : dias <= 30 ? 'por vencer' : 'al día' };
}

function armarHojaDeVida(data, placaPedida, hoy) {
    const clave = pegada(placaPedida);
    const vehiculo = (data.vehiculos || []).find(v => pegada(v.p || v.placa) === clave);
    if (!vehiculo) return null;
    const placa = vehiculo.p || vehiculo.placa;

    // Viajes de la placa (también los que hizo como "placa real" de un cupo).
    const viajes = (data.viajes || [])
        .filter(v => v.fecha && (pegada(v.p || v.placa) === clave || pegada(v.placaReal) === clave))
        .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
    const hechos = viajes.filter(v => v.fecha <= hoy);
    const activos = (vs) => vs.filter(v => v.estado !== 'Cancelado');

    const porMesMapa = new Map();
    viajes.forEach(v => {
        const mes = v.fecha.slice(0, 7);
        if (!porMesMapa.has(mes)) porMesMapa.set(mes, { mes, nombre: `${MESES[Number(mes.slice(5, 7)) - 1]} ${mes.slice(0, 4)}`, viajes: 0, cancelados: 0, entregados: 0 });
        const m = porMesMapa.get(mes);
        if (v.estado === 'Cancelado') m.cancelados++; else m.viajes++;
        if (v.estado === 'Entregado') m.entregados++;
    });
    const porMes = [...porMesMapa.values()].sort((a, b) => b.mes.localeCompare(a.mes)).slice(0, 12);

    const condMapa = new Map();
    activos(hechos).forEach(v => {
        const nombre = String(v.cond || v.conductor || '').trim();
        if (SIN_CONDUCTOR.includes(nombre.toUpperCase())) return;
        const k = nombre.toUpperCase();
        if (!condMapa.has(k)) condMapa.set(k, { nombre, viajes: 0, desde: v.fecha, hasta: v.fecha });
        const c = condMapa.get(k);
        c.viajes++;
        if (v.fecha < c.desde) c.desde = v.fecha;
        if (v.fecha > c.hasta) c.hasta = v.fecha;
    });
    const conductores = [...condMapa.values()].sort((a, b) => b.hasta.localeCompare(a.hasta) || b.viajes - a.viajes);

    const destMapa = new Map();
    activos(viajes).forEach(v => {
        const d = String(v.destino || v.ruta || '').trim();
        if (d) destMapa.set(d, (destMapa.get(d) || 0) + 1);
    });
    const destinos = [...destMapa.entries()].map(([destino, n]) => ({ destino, viajes: n }))
        .sort((a, b) => b.viajes - a.viajes).slice(0, 6);

    const resumirViaje = (v) => ({
        id: v.id, fecha: v.fecha, ruta: v.ruta || v.codigo || '', destino: v.destino || '', cliente: v.cliente || '',
        conductor: v.cond || v.conductor || '', estado: v.estado || 'Planificado', tr: v.tr || v.transportadora || '',
        salidaReal: v.salidaReal || null, llegadaReal: v.llegadaReal || null
    });

    // Mantenimientos: el historial más el que esté en curso (sin repetir).
    const mantenimientos = [...(vehiculo.historialMantenimiento || [])];
    if (vehiculo.mantInicio && !mantenimientos.some(m => m.inicio === vehiculo.mantInicio)) {
        mantenimientos.push({ inicio: vehiculo.mantInicio, fin: vehiculo.mantFin || vehiculo.mantInicio });
    }
    const mants = mantenimientos
        .filter(m => m && m.inicio)
        .map(m => ({ inicio: m.inicio, fin: m.fin || m.inicio, dias: (diasEntre(m.inicio, m.fin || m.inicio) ?? 0) + 1, enCurso: m.inicio <= hoy && (m.fin || m.inicio) >= hoy }))
        .sort((a, b) => b.inicio.localeCompare(a.inicio));

    const averias = (vehiculo.historialAverias || []).map(a => {
        const mes = MESES.indexOf(a.mes);
        const fecha = mes >= 0 && a.anio && a.dia ? `${a.anio}-${String(mes + 1).padStart(2, '0')}-${String(a.dia).padStart(2, '0')}` : '';
        return { fecha, razon: a.razon || '', terminoElViaje: a.placaFinal || '' };
    }).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));

    // Novedades que mencionan la placa (con o sin espacio).
    const novedades = (data.novedades || [])
        .filter(n => pegada(`${n.titulo || ''} ${n.desc || n.descripcion || ''}`).includes(clave))
        .map(n => ({ id: n.id, fecha: n.fecha || '', tipo: n.tipo || '', titulo: n.titulo || '', descripcion: n.desc || n.descripcion || '', resuelta: !!n.resuelta }))
        .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));

    const conductorActual = (data.conductores || []).find(c => pegada(c.veh || c.placa) === clave);
    const nombreActual = (conductorActual && (conductorActual.nom || conductorActual.nombre)) || vehiculo.cond || vehiculo.conductor || '';
    const mesActual = hoy.slice(0, 7);

    return {
        vehiculo: {
            placa, tipo: vehiculo.t || vehiculo.tipo || '', categoria: vehiculo.categoria || '', transportadora: vehiculo.tr || vehiculo.transportadora || 'Makand',
            estado: vehiculo.est || vehiculo.estado || '', cajas: vehiculo.cap || vehiculo.cajas || null, kg: vehiculo.kg || null, m3: vehiculo.m3 || null,
            conductorActual: SIN_CONDUCTOR.includes(String(nombreActual).toUpperCase().trim()) ? '' : nombreActual,
            ultimoMantenimiento: vehiculo.um || (mants.find(m => m.fin <= hoy)?.fin) || ''
        },
        documentos: [
            estadoDocumento('SOAT', vehiculo.soatVence, hoy),
            estadoDocumento('Tecnomecánica', vehiculo.tecnoVence, hoy),
            ...(conductorActual?.licVence ? [estadoDocumento(`Licencia de ${conductorActual.nom || conductorActual.nombre}`, conductorActual.licVence, hoy)] : [])
        ],
        resumen: {
            viajesHechos: activos(hechos).length,
            viajesEsteMes: activos(viajes).filter(v => v.fecha.startsWith(mesActual)).length,
            proximos: activos(viajes).filter(v => v.fecha > hoy).length,
            cancelados: viajes.filter(v => v.estado === 'Cancelado').length,
            sinConductor: activos(hechos).filter(v => SIN_CONDUCTOR.includes(String(v.cond || v.conductor || '').trim().toUpperCase())).length,
            diasEnTaller: mants.reduce((t, m) => t + m.dias, 0),
            averias: averias.length,
            primerViaje: hechos.length ? hechos[hechos.length - 1].fecha : '',
            ultimoViaje: activos(hechos)[0]?.fecha || ''
        },
        porMes,
        conductores,
        destinos,
        ultimosViajes: hechos.slice(0, 20).map(resumirViaje),
        proximosViajes: viajes.filter(v => v.fecha > hoy).reverse().slice(0, 10).map(resumirViaje),
        mantenimientos: mants,
        averias,
        novedades
    };
}

module.exports = { armarHojaDeVida, estadoDocumento };
