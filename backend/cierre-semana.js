// ============================================================
// CIERRE DE SEMANA — el resumen de lunes a domingo: qué se cumplió, qué se
// canceló (y por qué), qué quedó pendiente, novedades, quejas y
// comparendos, quién trabajó más y cómo viene la próxima semana. Se arma
// solo el viernes por la tarde (server.js lo manda por correo) y también se
// puede ver o enviar cuando se quiera desde el Dashboard.
// Funciones puras (sin Express ni archivos).
// Pruebas: test/cierre-semana.test.js
// ============================================================

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const pegada = (p) => String(p ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const sumar = (fecha, n) => { const [a, m, d] = fecha.split('-').map(Number); return iso(new Date(a, m - 1, d + n)); };
const SIN_CONDUCTOR = /^(|sin conductor|sin asignar|asignado|no definido|-)$/i;
const POR_SALIR = ['Programado', 'Planificado', '', undefined, null];

/** Lunes (AAAA-MM-DD) de la semana de una fecha. */
function lunesDe(fecha) {
    const [a, m, d] = String(fecha).slice(0, 10).split('-').map(Number);
    const f = new Date(a, m - 1, d);
    f.setDate(f.getDate() - ((f.getDay() + 6) % 7));
    return iso(f);
}

/** "5/10/2026, 7:06 p. m." o "2026-10-05" -> "2026-10-05". */
function fechaDeTexto(t) {
    const s = String(t || '');
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    if (/^\d{12,}$/.test(s)) return iso(new Date(Number(s)));
    return '';
}

function contar(lista, clave) {
    const mapa = new Map();
    lista.forEach(x => { const k = clave(x); if (k) mapa.set(k, (mapa.get(k) || 0) + 1); });
    return [...mapa.entries()].map(([nombre, n]) => ({ nombre, n })).sort((a, b) => b.n - a.n || a.nombre.localeCompare(b.nombre));
}

const textoFecha = (f) => { const [a, m, d] = f.split('-').map(Number); return `${DIAS[new Date(a, m - 1, d).getDay()]} ${d} de ${MESES[m - 1]}`; };

/**
 * Resumen de la semana que empieza en "lunes". hoy: para saber qué días ya
 * pasaron (lo que quedó sin hacer en un día que ya pasó es "pendiente").
 */
function resumenSemana(data, lunes, hoy = iso(new Date())) {
    const desde = lunesDe(lunes), hasta = sumar(desde, 6);
    const titular = new Map();
    (data.vehiculos || []).forEach(v => { const c = String(v.cond || '').trim(); if (c && !SIN_CONDUCTOR.test(c)) titular.set(pegada(v.p || v.placa), c); });
    (data.conductores || []).forEach(c => { const p = pegada(c.veh || c.placa); const n = String(c.nom || c.nombre || '').trim(); if (p && n) titular.set(p, n); });
    const conductorDe = (v) => { const c = String(v.cond || '').trim(); return c && !SIN_CONDUCTOR.test(c) ? c : (titular.get(pegada(v.p || v.placa)) || ''); };
    const enSemana = (f) => f >= desde && f <= hasta;

    const viajes = (data.viajes || []).filter(v => enSemana(String(v.fecha || '').slice(0, 10)));
    const activos = viajes.filter(v => v.estado !== 'Cancelado');
    const cancelados = viajes.filter(v => v.estado === 'Cancelado');
    const entregados = activos.filter(v => v.estado === 'Entregado');
    const enRuta = activos.filter(v => v.estado === 'En ruta');
    const porSalir = activos.filter(v => POR_SALIR.includes(v.estado));
    // Pendientes: debían salir en un día que ya pasó y siguen sin salir.
    const pendientes = porSalir.filter(v => String(v.fecha).slice(0, 10) < hoy)
        .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
    const yaDebian = activos.filter(v => String(v.fecha).slice(0, 10) <= hoy);
    const cumplidos = yaDebian.filter(v => v.estado === 'Entregado' || v.estado === 'En ruta').length;
    const cajas = activos.reduce((s, v) => s + (Number(v.cajas) || 0), 0);

    const novedades = (data.novedades || []).filter(n => enSemana(fechaDeTexto(n.fecha) || fechaDeTexto(String(n.id).replace(/\D/g, '').slice(-13))));
    const quejas = (data.quejas || []).filter(q => enSemana(fechaDeTexto(q.fecha)));
    const comparendos = (data.comparendos || []).filter(c => enSemana(fechaDeTexto(c.fecha)));
    const reasignados = activos.filter(v => v.planBDe || v.viajeVaradoDe || v.placaOriginal);

    const proxDesde = sumar(desde, 7), proxHasta = sumar(desde, 13);
    const proxima = (data.viajes || []).filter(v => { const f = String(v.fecha || '').slice(0, 10); return f >= proxDesde && f <= proxHasta && v.estado !== 'Cancelado'; });
    const proximaSinConductor = proxima.filter(v => !conductorDe(v) && !/polar|arsitran/i.test(String(v.tr || ''))).length;

    const porDia = [];
    for (let i = 0; i < 7; i++) {
        const f = sumar(desde, i);
        const delDia = activos.filter(v => String(v.fecha).slice(0, 10) === f);
        porDia.push({ fecha: f, dia: DIAS[(i + 1) % 7], viajes: delDia.length, entregados: delDia.filter(v => v.estado === 'Entregado').length });
    }

    return {
        desde, hasta, titulo: `Semana del ${textoFecha(desde)} al ${textoFecha(hasta)}`, generado: new Date().toISOString(),
        total: activos.length, entregados: entregados.length, enRuta: enRuta.length, porSalir: porSalir.length,
        cancelados: cancelados.length, cumplimiento: yaDebian.length ? Math.round((cumplidos / yaDebian.length) * 100) : null,
        cajas, extras: activos.filter(v => v.tipo === 'extra').length, reasignados: reasignados.length,
        vehiculos: new Set(activos.map(v => pegada(v.p || v.placa))).size,
        porTransportadora: contar(activos, v => String(v.tr || v.transportadora || 'Makand')),
        porCliente: contar(activos, v => String(v.cliente || v.cli || '').split(',')[0].trim()).slice(0, 6),
        porDestino: contar(activos, v => String(v.destinoReal || v.destino || '').split('/')[0].trim()).slice(0, 6),
        conductoresTop: contar(activos.filter(v => !/polar|arsitran/i.test(String(v.tr || ''))), conductorDe).slice(0, 5),
        motivosCancelacion: contar(cancelados, v => String(v.motivoCancelacion || 'Sin motivo escrito').trim()),
        pendientes: pendientes.slice(0, 15).map(v => ({ id: v.id, fecha: String(v.fecha).slice(0, 10), placa: v.p || v.placa, ruta: v.ruta || v.codigo, cliente: v.cliente || v.cli || '', conductor: conductorDe(v) })),
        totalPendientes: pendientes.length,
        novedades: novedades.map(n => ({ tipo: n.tipo || 'Novedad', titulo: n.titulo || '', resuelta: !!n.resuelta })),
        quejas: quejas.length, comparendos: comparendos.length,
        valorComparendos: comparendos.reduce((s, c) => s + (Number(c.valor) || 0), 0),
        porDia,
        proxima: { desde: proxDesde, hasta: proxHasta, viajes: proxima.length, sinConductor: proximaSinConductor }
    };
}

/** Texto listo para pegar en WhatsApp (con *negritas*). */
function textoWhatsApp(r) {
    const l = [];
    l.push(`*Cierre de semana · MAKAND*`);
    l.push(`${r.titulo}`);
    l.push('');
    l.push(`🚚 *${r.total}* viajes${r.cumplimiento !== null ? ` · *${r.cumplimiento}%* cumplido` : ''}`);
    l.push(`✅ ${r.entregados} entregados · 🛣️ ${r.enRuta} en ruta · ⏳ ${r.porSalir} por salir`);
    if (r.cancelados) l.push(`❌ ${r.cancelados} cancelados${r.motivosCancelacion.length ? ` (${r.motivosCancelacion.slice(0, 3).map(m => `${m.nombre}: ${m.n}`).join(', ')})` : ''}`);
    if (r.cajas) l.push(`📦 ${r.cajas.toLocaleString('es-CO')} cajas · ${r.vehiculos} vehículos`);
    if (r.extras || r.reasignados) l.push(`➕ ${r.extras} extras · 🔁 ${r.reasignados} reasignados`);
    if (r.porTransportadora.length) l.push(`🏢 ${r.porTransportadora.map(t => `${t.nombre} ${t.n}`).join(' · ')}`);
    if (r.porCliente.length) l.push(`🏬 ${r.porCliente.slice(0, 4).map(t => `${t.nombre} ${t.n}`).join(' · ')}`);
    if (r.totalPendientes) {
        l.push('');
        l.push(`⚠️ *Quedaron ${r.totalPendientes} sin salir:*`);
        r.pendientes.slice(0, 8).forEach(p => l.push(`• ${p.fecha.slice(8)}/${p.fecha.slice(5, 7)} ${p.placa} ${p.ruta}${p.cliente ? ' (' + p.cliente + ')' : ''}`));
        if (r.totalPendientes > 8) l.push(`• …y ${r.totalPendientes - 8} más`);
    }
    if (r.novedades.length || r.quejas || r.comparendos) {
        l.push('');
        l.push(`📝 ${r.novedades.length} novedades (${r.novedades.filter(n => !n.resuelta).length} sin resolver) · ${r.quejas} quejas · ${r.comparendos} comparendos`);
    }
    if (r.conductoresTop.length) l.push(`🏆 Más viajes: ${r.conductoresTop.slice(0, 3).map(c => `${c.nombre.split(' ').slice(0, 2).join(' ')} (${c.n})`).join(', ')}`);
    l.push('');
    l.push(`📅 Próxima semana: ${r.proxima.viajes} viajes${r.proxima.sinConductor ? ` · ⚠️ ${r.proxima.sinConductor} sin conductor` : ''}`);
    return l.join('\n');
}

const esc = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Correo HTML del cierre. */
function htmlCorreo(r) {
    const kpi = (n, t, color) => `<td style="padding:10px 12px;border:1px solid #e5e7eb;border-radius:8px;text-align:center;"><div style="font-size:22px;font-weight:800;color:${color};">${n}</div><div style="font-size:12px;color:#6b7280;">${t}</div></td>`;
    const lista = (titulo, items) => items.length ? `<h3 style="margin:18px 0 6px;font-size:14px;color:#111827;">${titulo}</h3><ul style="margin:0;padding-left:18px;font-size:13px;color:#374151;">${items.map(i => `<li>${i}</li>`).join('')}</ul>` : '';
    return `
      <div style="font-family:Segoe UI,Arial,sans-serif;max-width:680px;color:#111827;">
        <h2 style="margin:0 0 4px;font-size:19px;">Cierre de semana · MAKAND</h2>
        <p style="margin:0 0 12px;font-size:13px;color:#6b7280;">${esc(r.titulo)}</p>
        <table style="border-collapse:separate;border-spacing:6px;width:100%;"><tr>
          ${kpi(r.total, 'viajes', '#1d4ed8')}${kpi(r.cumplimiento === null ? '—' : r.cumplimiento + '%', 'cumplido', '#047857')}
          ${kpi(r.entregados, 'entregados', '#059669')}${kpi(r.cancelados, 'cancelados', '#b91c1c')}${kpi(r.totalPendientes, 'sin salir', '#b45309')}
        </tr></table>
        ${lista('Por transportadora', r.porTransportadora.map(t => `${esc(t.nombre)}: <b>${t.n}</b>`))}
        ${lista('Clientes con más viajes', r.porCliente.map(t => `${esc(t.nombre)}: <b>${t.n}</b>`))}
        ${lista('Motivos de cancelación', r.motivosCancelacion.map(t => `${esc(t.nombre)}: <b>${t.n}</b>`))}
        ${lista(`Quedaron sin salir (${r.totalPendientes})`, r.pendientes.map(p => `${esc(p.fecha)} · <b>${esc(p.placa)}</b> · ${esc(p.ruta)}${p.cliente ? ' · ' + esc(p.cliente) : ''}${p.conductor ? ' · ' + esc(p.conductor) : ''}`))}
        ${lista('Novedades', r.novedades.map(n => `${esc(n.tipo)}: ${esc(n.titulo)}${n.resuelta ? ' (resuelta)' : ' <b style="color:#b91c1c;">(sin resolver)</b>'}`))}
        ${lista('Conductores con más viajes', r.conductoresTop.map(c => `${esc(c.nombre)}: <b>${c.n}</b>`))}
        <p style="margin:18px 0 0;font-size:13px;color:#374151;">Quejas: <b>${r.quejas}</b> · Comparendos: <b>${r.comparendos}</b> · Extras: <b>${r.extras}</b> · Reasignados: <b>${r.reasignados}</b> · Cajas: <b>${r.cajas.toLocaleString('es-CO')}</b></p>
        <p style="margin:6px 0 0;font-size:13px;color:#374151;">Próxima semana: <b>${r.proxima.viajes}</b> viajes${r.proxima.sinConductor ? ` · <b style="color:#b45309;">${r.proxima.sinConductor} sin conductor</b>` : ''}.</p>
        <p style="margin-top:22px;font-size:12px;color:#9ca3af;">Correo automático del Rutograma de Makand (cada viernes en la tarde). También se puede ver en el Dashboard → Cierre de semana.</p>
      </div>`;
}

module.exports = { resumenSemana, textoWhatsApp, htmlCorreo, lunesDe, fechaDeTexto };
