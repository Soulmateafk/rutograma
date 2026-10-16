/**
 * PREGUNTAS LIBRES del furgoncito sobre la operación, escritas como se
 * habla: "¿qué carros viajan hoy?", "¿quiénes regresan mañana?", "¿a dónde
 * van los carros el viernes?", "¿cuánto llevamos facturado?", "¿la LUN 428
 * está libre mañana?", "¿qué conductor trabajó menos este mes?", "¿cómo
 * vamos hoy?"…
 *
 * Usa el intérprete del buscador hablado (services/buscar-hablado.ts) para
 * las fechas, placas, conductores, clientes, destinos, transportadoras y
 * estados, y aquí se decide QUÉ se pregunta (qué carros, quiénes, a dónde,
 * cuántos, cuántas cajas, cuánta plata, libres, el que más/menos…) y CUÁNDO
 * (salen, regresan o están de viaje). Si la pregunta no es de esto,
 * devuelve null (ver mascota-respuestas.ts).
 */
import type { Respuesta, Accion } from './mascota-respuestas';
import { interpretar, filtrarViajes, conductorDelViaje, titularesPorPlaca } from '../../services/buscar-hablado';
import {
  n, pegada, iso, sumar, fechaLarga, fechaCorta, diasEntre, plata, listar, ruta, resp, esCupo, placaDe, nombreCond,
  ocupaElDia, enMantenimiento, picoDelDia, descansosDelMes, elQueMas, mesPreguntado, MESES
} from './mascota-datos';

// ---------- Palabras (sin tildes) ----------
const VEH = /\b(carros?|carritos?|camion(es)?|camioncitos?|camionetas?|furgon(es)?|turbos?|mulas?|vehiculos?|placas?|unidades|flota|moviles?)\b/;
const COND = /\b(quien(es)?|conductor(es)?|chofer(es)?|choferes|manejador(es)?|muchachos|personal)\b/;
const DEST = /\b(a donde|adonde|para donde|hacia donde|pa donde|destinos?|ciudades|a que ciudad(es)?)\b/;
const CLI = /\b(clientes?|para quien(es)?|a quien(es)? (le )?(llevamos|entregamos|cargamos|despachamos))\b/;
const CAJAS = /\bcajas?\b/;
const PLATA = /\b(factur\w*|plata|dinero|ingres\w*|ventas?|ganamos|gana|gano|ganado|cobr\w*|tarifas?|vale|valen|cuesta|cuestan|valor|pesos)\b/;
const CONTAR = /\b(cuant[oa]s?|numero de|total de|cantidad de)\b/;
const LLEGA = /\b(lleg(a|an|o|aron|ando|ara|aran|ue)|regres\w*|vuelv\w*|volv\w*|retorn\w*|de vuelta)\b/;
const FUERA = /\b(afuera|por fuera|de viaje|andan|anda|viajando|ocupad[oa]s?|en la calle|rodando|en carretera)\b/;
const LIBRE = /\b(libres?|disponibles?|desocupad[oa]s?|sin viajes?|sin trabajo|no tienen? viajes?|no (trabaj|viaj|sal)\w*|quiet[oa]s|sueltos?|vacios?)\b/;
const RECOMIENDA = /\b(necesito|recomiend\w*|mando|mandamos|mandar|envio|enviar|sirve|sirven|puedo (usar|mandar|poner)|cual (uso|pongo|mando)|que (uso|pongo|mando)|asigno|tengo (carros?|vehiculos?|camiones))\b/;
const VIAJE = /\b(viaj\w*|sal(e|en|io|ieron|ida|idas|iendo|dra|dran)|trabaj\w*|program\w*|despach\w*|carg(a|an|aron|ando|o)|rued\w*|hay|habra|va|van|iba|iban|fue|fueron|lleva\w*|llev[oa]|mueve\w*|movi\w*|hici\w*|hace|hacen|hizo|tiene|tienen|tuvo|tuvieron|entreg\w*|toca|tocan|operan?|corren?|cubre|cubren|hubo|tenemos|anda|andan)\b/;
const PASADO = /\b(salio|salieron|fue|fueron|hubo|hicimos|hizo|tuvo|tuvieron|paso|llego|llegaron|entrego|entregaron|movimos|regreso|regresaron|volvio|volvieron|trabajo|viajo|ayer|pasad[oa]|anterior)\b/;
const DIAS_SEMANA = /\b(lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b/;

const capital = (s: string) => s ? s[0].toUpperCase() + s.slice(1) : s;
const plural = (k: number, uno: string, varios: string) => `${k} ${k === 1 ? uno : varios}`;
const diasDe = (v: any) => { const s = Number(v.salida || v.dia || 0), r = Number(v.retorno || 0); return r > s ? r - s : 1; };
/** Último día del viaje (el día que regresa; el siguiente ya queda libre). */
const ultimoDia = (v: any) => iso(sumar(new Date(String(v.fecha).slice(0, 10) + 'T00:00:00'), diasDe(v) - 1));
const destinoDe = (v: any) => String(v.destinoReal || v.destino || v.ruta || '').split('/')[0].trim() || 'sin destino';
const clienteDe = (v: any) => String(v.cliente || v.cli || '').split(',')[0].trim();
/** "Torres Huerfano Javier" → "Javier Torres". */
const nombreCorto = (nom: string) => { const p = String(nom || '').trim().split(/\s+/); return p.length >= 3 ? `${p[2]} ${p[0]}` : p.join(' '); };
const fechaMini = (f: string) => { const d = new Date(f + 'T00:00:00'); return d.toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric' }).replace('.', ''); };

function distancia(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 1) return 9;
  const fila = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let previo = fila[0]; fila[0] = i;
    for (let j = 1; j <= b.length; j++) { const t = fila[j]; fila[j] = Math.min(fila[j] + 1, fila[j - 1] + 1, previo + (a[i - 1] === b[j - 1] ? 0 : 1)); previo = t; }
  }
  return fila[b.length];
}
/** ¿El nombre está escrito en la pregunta? (no vale el parecido lejano: "faltan" no es "Fabian"). */
function escritoEnPregunta(nombre: string, q: string): boolean {
  const ws = q.split(' ').filter(w => w.length >= 3);
  return n(nombre).split(' ').some(p => p.length >= 3 && ws.some(w => w === p || (w.length >= 5 && distancia(w, p) <= 1)));
}

/** "hoy", "mañana", "el viernes, 16 de octubre", "esta semana"… */
function cuandoTexto(desde: string | null, hasta: string | null, hoy: string, entendido?: string): string {
  if (desde && desde === hasta) {
    const d = diasEntre(hoy, desde);
    return d === 0 ? 'hoy' : d === 1 ? 'mañana' : d === -1 ? 'ayer' : d === 2 ? 'pasado mañana' : `el ${fechaLarga(desde)}`;
  }
  if (entendido && MESES.includes(n(entendido))) return `en ${entendido}`;
  if (entendido && !/\d+\/\d+/.test(entendido)) return entendido;
  if (desde && hasta) return `del ${fechaCorta(desde)} al ${fechaCorta(hasta)}`;
  return entendido || '';
}

/** Cuenta repetidos: "Barranquilla (3), Cali (2) y Medellín". */
function agrupar(valores: string[], max = 6): string {
  const c = new Map<string, number>();
  valores.filter(Boolean).forEach(x => c.set(x, (c.get(x) || 0) + 1));
  return listar([...c.entries()].sort((a, b) => b[1] - a[1]).map(([x, k]) => k > 1 ? `${x} (${k})` : x), max);
}

const accionLista = (texto: string, busqueda: string): Accion => ({ texto, tipo: 'buscar', valor: busqueda });
const accionViaje = (v: any, texto = 'Ver el viaje'): Accion => ({ texto, tipo: 'viaje', valor: String(v.id) });

export function responderConsulta(pregunta: string, S: any, ahora = new Date()): Respuesta | null {
  const q = n(pregunta);
  if (!q || !Array.isArray(S?.viajes)) return null;
  const hoyD = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  const hoy = iso(hoyD);
  const tit = titularesPorPlaca(S);
  const condDe = (v: any) => conductorDelViaje(v, tit);
  const activos = (S.viajes as any[]).filter(v => v && /^\d{4}-\d{2}-\d{2}/.test(String(v.fecha || '')) && v.estado !== 'Cancelado');

  const interp = interpretar(pregunta, S, hoyD);
  const f = { ...interp.filtros, libres: [] as string[], limite: null, orden: 'asc' as const, soloFuturos: false };
  const sinPasadoManana = q.replace(/pasado manana/g, '');
  // Lo que el buscador no toma como filtro pero aquí sí.
  if (/\b(cancel\w*|anulad[oa]s?)\b/.test(q) && !/como|donde/.test(q) && !f.estados.includes('Cancelado')) { f.estados = ['Cancelado']; f.incluirCancelados = true; }
  // "carros saliendo hoy" es que salen (no "en ruta").
  if (/\bsaliendo\b/.test(q) && !/en ruta|en camino/.test(q)) f.estados = f.estados.filter(e => e !== 'En ruta');
  // "los viajes de mañana" es el día de mañana, no "en la mañana".
  if (f.horaDesde === 0 && f.horaHasta === 12 * 60 && !/(en|por|de) la manana|temprano|madrugada/.test(q) && !f.desde) {
    f.horaDesde = null; f.horaHasta = null; f.desde = f.hasta = iso(sumar(hoyD, 1));
    interp.entendidos = interp.entendidos.filter(e => e.tipo !== 'Horario');
    interp.entendidos.unshift({ tipo: 'Fecha', texto: 'mañana', icono: '' });
  }
  if (!f.desde && !f.hasta && /\b(de|en|para|toda) la semana\b/.test(q)) {
    const l = sumar(hoyD, -((hoyD.getDay() + 6) % 7)); f.desde = iso(l); f.hasta = iso(sumar(l, 6));
    interp.entendidos.unshift({ tipo: 'Fecha', texto: 'esta semana', icono: '' });
  }
  if (/\b(no tienen? (conductor|chofer)|sin chofer|falta\w* (el |de )?(conductor|chofer)|sin asignar)\b/.test(q)) f.sinConductor = true;
  f.conductores = f.conductores.filter(c => escritoEnPregunta(c, q));
  const entFecha = interp.entendidos.find(e => e.tipo === 'Fecha')?.texto;
  // "el lunes" sin hablar en pasado: el que viene.
  if (f.desde && f.desde === f.hasta && f.desde < hoy && !PASADO.test(sinPasadoManana) && DIAS_SEMANA.test(q) && !/pasad|anterior/.test(q)) {
    f.desde = f.hasta = iso(sumar(new Date(f.desde + 'T00:00:00'), 7));
  }
  const tieneFecha = !!(f.desde || f.hasta);
  const placa = f.placas.length === 1 ? f.placas[0] : '';
  const conductor = f.conductores.length === 1 ? f.conductores[0] : '';
  const otrosFiltros = f.clientes.length + f.destinos.length + f.transportadoras.length + f.estados.length + f.rutas.length + f.tiposVehiculo.length
    + (f.extra !== null ? 1 : 0) + (f.sinConductor !== null ? 1 : 0) + (f.urgente !== null ? 1 : 0) + (f.conNovedad !== null ? 1 : 0);
  const pasado = PASADO.test(sinPasadoManana);
  const filtrosTexto = interp.entendidos.filter(e => !['Fecha', 'Texto', 'Orden'].includes(e.tipo)).filter(e => e.tipo !== 'Conductor' || f.conductores.length || /sin conductor/.test(e.texto)).map(e => e.texto);
  const busqueda = (cuando: string) => [cuando, ...filtrosTexto].filter(Boolean).join(', ');
  // "entregados a Cali de D1": los filtros dichos como se hablan.
  const frase = [
    !f.estados.length ? '' : interp.entendidos.filter(e => e.tipo === 'Estado').map(e => e.texto).join(' ') || (f.estados.includes('Cancelado') ? 'cancelados' : ''),
    f.extra ? 'extra' : '', f.urgente ? 'urgentes' : '', f.sinConductor ? 'sin conductor' : '', f.conNovedad ? 'con novedad' : '',
    f.destinos.length ? `a ${listar(f.destinos)}` : '', f.clientes.length ? `de ${listar(f.clientes)}` : '',
    f.transportadoras.length ? `de ${listar(f.transportadoras)}` : '', f.rutas.length ? `de la ruta ${listar(f.rutas)}` : '',
    f.tiposVehiculo.length ? `en ${listar(f.tiposVehiculo)}` : ''
  ].filter(Boolean).join(' ');
  const delMes = () => { const { anio, mes } = mesPreguntado(q, ahora); const d = new Date(anio, mes, 1); return { desde: iso(d), hasta: iso(new Date(anio, mes + 1, 0)), texto: /mes pasado/.test(q) || mes !== ahora.getMonth() ? `en ${MESES[mes]}` : 'este mes' }; };

  // ===== 1. Listas de lo registrado: "¿qué clientes tenemos?", "lista de carros" =====
  const registro = q.match(/^(?:que|cuales|lista de|listado de|dame (?:la lista de )?|muestrame|dime)\s*(?:son\s+)?(?:todos\s+)?(?:los |las )?(clientes|carros|vehiculos|camiones|placas|conductores|choferes|rutas|destinos)(?:\s+(?:tenemos|hay|son|que hay|que tenemos|registrad\w*|existen))?$/);
  const registroDest = /^(a )?(que|cuales) (ciudades|destinos) (vamos|visitamos|cubrimos|llegamos|atendemos|tenemos|hay)$|^a donde (vamos|llegamos|viajamos)$/.test(q);
  if ((registro || registroDest) && !tieneFecha) {
    const t = registro ? registro[1] : 'destinos';
    if (/carros|vehiculos|camiones|placas/.test(t)) {
      const propios = (S.vehiculos || []).map(placaDe).filter((p: string) => p && !esCupo(p));
      const cupos = (S.vehiculos || []).map(placaDe).filter((p: string) => esCupo(p));
      return resp(`Tenemos ${plural(propios.length, 'vehículo propio', 'vehículos propios')}: ${listar(propios, 20)}.${cupos.length ? ` Y ${cupos.length} cupos de Polar/Arsitrans.` : ''} 🚛`, [ruta('Ir a Vehículos', '/vehiculos')]);
    }
    if (/conductores|choferes/.test(t)) {
      const c = (S.conductores || []).map(nombreCond).filter(Boolean);
      return resp(`Tenemos ${plural(c.length, 'conductor', 'conductores')}: ${listar(c.map(nombreCorto), 20)}. 👷`, [ruta('Ir a Conductores', '/conductores')]);
    }
    if (t === 'rutas') {
      const r = (S.rutas || []).map((x: any) => x.cod || x.codigo).filter(Boolean);
      return resp(`Hay ${plural(r.length, 'ruta', 'rutas')}: ${listar(r, 20)}. 🛣️`, [ruta('Ir a Rutas', '/rutas')]);
    }
    if (t === 'destinos') return resp(`Vamos a: ${agrupar(activos.map(destinoDe).filter(d => !/^[a-z]{3}-[a-z]{3}/i.test(d)), 15)}. 🗺️`, [ruta('Abrir el Mapa', '/mapa')]);
    const cl = new Map<string, number>();
    activos.forEach(v => { const c = clienteDe(v); if (c && c !== 'No definido') cl.set(c, (cl.get(c) || 0) + 1); });
    return resp(`Tenemos ${plural(cl.size, 'cliente', 'clientes')}: ${listar([...cl.entries()].sort((a, b) => b[1] - a[1]).map(([c, k]) => `${c} (${k} viajes)`), 12)}.`, [ruta('Ver el Comparativo', '/comparativo')]);
  }

  // ===== 2. Rutas: duración y tarifa ("¿cuánto dura el viaje a Cali?", "¿tarifa a Cali?") =====
  const pideDuracion = /\b(dura|duracion|demora|tarda|tardan|cuantos dias (es|son|dura|se demora|toma))\b/.test(q);
  const pideTarifa = /\b(tarifas?|cuanto (vale|cuesta|cobramos|se cobra|pagan)|precio)\b/.test(q);
  if ((pideDuracion || pideTarifa) && (f.destinos.length || f.rutas.length || f.clientes.length) && !placa && !conductor) {
    const rutas = (S.rutas || []).filter((r: any) => {
      const cod = String(r.cod || r.codigo || '');
      if (f.rutas.length) return f.rutas.some(x => pegada(x) === pegada(cod));
      const ok = (!f.destinos.length || f.destinos.some(d => n(r.dest || r.destino).includes(n(d))))
        && (!f.clientes.length || f.clientes.some(c => n(`${r.clientes} ${cod}`).includes(n(c))));
      return ok;
    }).slice(0, 4);
    if (rutas.length) {
      const partes = rutas.map((r: any) => {
        const cod = r.cod || r.codigo;
        const dur = `${plural(Number(r.diasTrans) || 1, 'día', 'días')} de viaje${Number(r.diasDesc) ? ` + ${plural(Number(r.diasDesc), 'día', 'días')} de descargue` : ''}`;
        const tar = [['Makand', r.tarifaMakand || r.tarifa], ['Arsitrans', r.tarifaArsitrans || r.tarifaArsitran], ['Polar', r.tarifaPolar]].filter(x => Number(x[1]) > 0).map(x => `${x[0]} ${plata(Number(x[1]))}`).join(' · ');
        return `${cod}: ${pideTarifa && !pideDuracion ? (tar || 'sin tarifa anotada') : pideDuracion && !pideTarifa ? dur : `${dur}; ${tar || 'sin tarifa anotada'}`}`;
      });
      return resp(`${partes.join('. ')}.`, [ruta('Ir a Rutas', '/rutas')]);
    }
  }

  if (/\brutas?\b/.test(q) && f.clientes.length && !CONTAR.test(q) && !tieneFecha && !f.destinos.length) {
    const rs = (S.rutas || []).filter((r: any) => f.clientes.some(c => n(`${r.clientes} ${r.cod || r.codigo}`).includes(n(c))));
    return resp(rs.length ? `${listar(f.clientes)} tiene ${plural(rs.length, 'ruta', 'rutas')}: ${listar(rs.map((r: any) => `${r.cod || r.codigo} (${String(r.dest || r.destino || '').split('/')[0]})`), 12)}. 🛣️` : `No encontré rutas de ${listar(f.clientes)}.`, [ruta('Ir a Rutas', '/rutas')]);
  }

  // ===== 3. Resumen del día, la semana o el mes: "¿cómo vamos?", "¿qué pasó ayer?" =====
  const pideResumen = /^(que (hay|tenemos|paso|pasa|hubo|esta pasando)( hoy| manana| ayer| para| de nuevo| en| este| esta| la| el|$)|como (va|vamos|esta|estamos|anda|andamos|fue|nos fue|estuvo|viene)\b|algo nuevo|que hay de nuevo|que novedad|resumen\b|dame un resumen|como va todo|novedades del dia)/.test(q)
    && !VEH.test(q) && !/\b(quien|conductor|chofer)\w*/.test(q) && !placa && !conductor && !f.clientes.length && !f.destinos.length && !f.rutas.length && !CAJAS.test(q) && !PLATA.test(q) && !/cumplimiento|a tiempo|puntual|tarde|retras|demora/.test(q);
  if (pideResumen) {
    if (/\bmes\b|mensual/.test(q) || MESES.some(m => q.includes(m))) return resumenMes(S, activos, q, ahora, condDe);
    if (/semana/.test(q)) {
      const d = f.desde && f.hasta ? { desde: f.desde, hasta: f.hasta } : (() => { const l = sumar(hoyD, -((hoyD.getDay() + 6) % 7)); return { desde: iso(l), hasta: iso(sumar(l, 6)) }; })();
      const sem = activos.filter(v => v.fecha >= d.desde && v.fecha <= d.hasta);
      const cajas = sem.reduce((s, v) => s + (Number(v.cajas) || 0), 0);
      const sinCond = sem.filter(v => !condDe(v)).length;
      return resp(`${capital(cuandoTexto(d.desde, d.hasta, hoy, entFecha || 'esta semana'))}: ${plural(sem.length, 'viaje', 'viajes')} y ${cajas.toLocaleString('es-CO')} cajas. Destinos: ${agrupar(sem.map(destinoDe), 4) || 'ninguno'}.${sinCond ? ` ⚠️ ${plural(sinCond, 'viaje sin conductor', 'viajes sin conductor')}.` : ''}`, [ruta('Ver el Rutograma', '/rutograma'), accionLista('Ver la lista', busqueda(entFecha || 'esta semana'))]);
    }
    const dia = f.desde && f.desde === f.hasta ? f.desde : hoy;
    return resumenDia(S, activos, dia, hoy, condDe);
  }

  // ===== 3b. Cumplimiento: quién sale a tiempo y quién tarde (con "Ya salí", tolerancia 30 min) =====
  const pideCumpl = /cumplimiento|a tiempo|puntual|impuntual|(sal|lleg)\w* tarde|tarde (a|al) salir|retras\w* (en|al) salir|se (atrasa|retrasa|demora)n? (en|al) salir|quien(es)? (se )?(atrasa|retrasa|demora)n?\b|quien(es)? (sale|salen|llega|llegan) tarde|(cuanto|cuantos) (se )?(atrasa|retrasa|demora)n?/.test(q)
    && !/despach|cargue|novedad/.test(q);
  if (pideCumpl) {
    const r = tieneFecha ? { desde: f.desde || '0000', hasta: f.hasta || '9999', texto: cuandoTexto(f.desde, f.hasta, hoy, entFecha) } : delMes();
    const DIAS_K = ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab'];
    const horaProg = (v: any): Date | null => {
      let h = /^\d{1,2}:\d{2}$/.test(String(v.hora || '').trim()) ? String(v.hora).trim() : '';
      if (!h) {
        const rt = (S.rutas || []).find((x: any) => n(x.cod || x.codigo) === n(v.ruta || v.codigo));
        const d = new Date(String(v.fecha).slice(0, 10) + 'T00:00:00');
        const hr = String(rt?.dias?.[DIAS_K[d.getDay()]]?.hora || '').trim();
        if (/^\d{1,2}:\d{2}$/.test(hr)) h = hr;
      }
      if (!h) return null;
      const [hh, mm] = h.split(':').map(Number);
      const d = new Date(String(v.fecha).slice(0, 10) + 'T00:00:00'); d.setHours(hh, mm, 0, 0); return d;
    };
    const lista = activos.filter(v => v.fecha >= r.desde && v.fecha <= r.hasta && v.fecha <= hoy)
      .filter(v => !placa || pegada(placaDe(v)) === pegada(placa)).filter(v => !conductor || n(condDe(v)) === n(conductor));
    const marcados = lista.filter(v => v.salidaReal);
    const conHora = marcados.map(v => ({ v, ret: horaProg(v) ? Math.round((new Date(v.salidaReal).getTime() - horaProg(v)!.getTime()) / 60000) : null })).filter(x => x.ret !== null) as Array<{ v: any; ret: number }>;
    const tarde = conHora.filter(x => x.ret > 30);
    const quien = placa ? `la ${placa}` : conductor ? nombreCorto(conductor) : '';
    if (!lista.length) return resp(`${capital(r.texto)} no hay viajes${quien ? ` de ${quien}` : ''} para medir.`, [ruta('Ver Cumplimiento', '/cumplimiento')]);
    const pct = (a: number, b: number) => b ? Math.round(a / b * 100) : 0;
    const partes = [`${capital(r.texto)}${quien ? `, ${quien}` : ''}: ${marcados.length} de ${plural(lista.length, 'viaje marcó', 'viajes marcaron')} «Ya salí» (${pct(marcados.length, lista.length)}%).`];
    if (conHora.length) {
      const prom = Math.round(conHora.reduce((s, x) => s + Math.max(0, x.ret), 0) / conHora.length);
      const durac = prom < 60 ? `${prom} min` : `${Math.floor(prom / 60)} h${prom % 60 ? ` ${prom % 60} min` : ''}`;
      partes.push(`Salieron a tiempo ${conHora.length - tarde.length} de ${conHora.length} (${pct(conHora.length - tarde.length, conHora.length)}%; se da media hora de margen), retraso promedio ${durac}.`);
    }
    if (tarde.length && !quien) {
      const porCond = new Map<string, number>();
      tarde.forEach(x => { const c = condDe(x.v) || placaDe(x.v); porCond.set(c, (porCond.get(c) || 0) + 1); });
      partes.push(`Los que más salen tarde: ${listar([...porCond.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([c, k]) => `${nombreCorto(c)} (${k})`))}. ⏰`);
    } else if (!marcados.length) partes.push('Los conductores marcan la salida en «Mis viajes».');
    return resp(partes.join(' '), [ruta('Ver Cumplimiento', '/cumplimiento')]);
  }

  // ===== 4. Libres / disponibles / "¿qué carro mando a Cali mañana?" =====
  const pideLibres = LIBRE.test(q) || (RECOMIENDA.test(q) && (VEH.test(q) || /\bcarro|vehiculo/.test(q)));
  if (pideLibres && !/descans/.test(q)) {
    const dia = f.desde || hoy;
    const cuando = cuandoTexto(dia, dia, hoy);
    const ocupado = (pred: (v: any) => boolean) => activos.find(v => pred(v) && ocupaElDia(v, dia));
    // Varios días ("esta semana"): cuántos quedan libres cada día, de hoy en adelante.
    if (f.desde && f.hasta && f.hasta > f.desde && !placa && !conductor) {
      const dias: string[] = [];
      for (let d = new Date((f.desde < hoy && f.hasta >= hoy ? hoy : f.desde) + 'T00:00:00'); iso(d) <= f.hasta && dias.length < 14; d = sumar(d, 1)) dias.push(iso(d));
      const soloCond = COND.test(q) && !VEH.test(q);
      const filas = dias.map(dia => {
        const dd = new Date(dia + 'T00:00:00');
        if (soloCond) {
          const ocup = new Set(activos.filter(v => ocupaElDia(v, dia)).map(v => n(condDe(v))));
          const lib = (S.conductores || []).filter((c: any) => !/inactiv|retirad/.test(n(c.est || c.estado)) && !ocup.has(n(nombreCond(c))) && !descansosDelMes(c, dd.getFullYear(), dd.getMonth()).includes(dd.getDate())).map((c: any) => nombreCorto(nombreCond(c)));
          return `${fechaMini(dia)}: ${lib.length ? listar(lib, 3) : 'nadie'}`;
        }
        const lib = (S.vehiculos || []).filter((v: any) => placaDe(v) && !esCupo(placaDe(v)) && String(v.categoria || 'Viajero') !== 'Urbano' && !enMantenimiento(v, dia) && !activos.some(x => placaDe(x) === placaDe(v) && ocupaElDia(x, dia))).map(placaDe);
        return `${fechaMini(dia)}: ${lib.length ? listar(lib, 3) : 'ninguno propio'}`;
      });
      return resp(`${capital(cuandoTexto(f.desde, f.hasta, hoy, entFecha))}, ${soloCond ? 'conductores' : 'vehículos'} libres por día — ${filas.join(' · ')}. 🗓️`, [ruta('Ver el Rutograma', '/rutograma')]);
    }
    if (placa) {
      const v = ocupado(x => pegada(placaDe(x)) === pegada(placa));
      const veh = (S.vehiculos || []).find((x: any) => pegada(placaDe(x)) === pegada(placa));
      const pico = picoDelDia(S, dia).find(x => x.placa === placa);
      if (veh && enMantenimiento(veh, dia)) return resp(`No: ${cuando} la ${placa} está en mantenimiento. 🔧`, [ruta('Ver la hoja de vida', `/hoja-de-vida/${encodeURIComponent(placa)}`)]);
      if (v) return resp(`No: ${cuando} la ${placa} está de viaje a ${destinoDe(v)} (sale el ${fechaMini(v.fecha)}, regresa el ${fechaMini(ultimoDia(v))}). Queda libre el ${fechaLarga(iso(sumar(new Date(ultimoDia(v) + 'T00:00:00'), 1)))}.`, [accionViaje(v)]);
      return resp(`Sí, ${cuando} la ${placa} está libre. ✅${pico ? ` Ojo: ese día tiene pico y placa (${pico.desde} a ${pico.hasta}). 🚫` : ''}`, [{ texto: 'Agregar un viaje extra', tipo: 'viaje-extra' }]);
    }
    if (conductor) {
      const v = ocupado(x => n(condDe(x)) === n(conductor));
      const d = new Date(dia + 'T00:00:00');
      const c = (S.conductores || []).find((x: any) => n(nombreCond(x)) === n(conductor));
      const descansa = c && descansosDelMes(c, d.getFullYear(), d.getMonth()).includes(d.getDate());
      if (descansa) return resp(`No: ${cuando} ${nombreCorto(conductor)} está de descanso. 😴`, [ruta('Ver su agenda', `/agenda/${encodeURIComponent(conductor)}`)]);
      if (v) return resp(`No: ${cuando} ${nombreCorto(conductor)} está de viaje a ${destinoDe(v)} con la ${placaDe(v)} (regresa el ${fechaMini(ultimoDia(v))}).`, [accionViaje(v)]);
      return resp(`Sí, ${cuando} ${nombreCorto(conductor)} está libre. ✅`, [ruta('Ver su agenda', `/agenda/${encodeURIComponent(conductor)}`)]);
    }
    if (COND.test(q) && !VEH.test(q)) {
      const d = new Date(dia + 'T00:00:00');
      const ocupados = new Set(activos.filter(v => ocupaElDia(v, dia)).map(v => n(condDe(v))));
      const libres = (S.conductores || []).filter((c: any) => !/inactiv|retirad/.test(n(c.est || c.estado)))
        .filter((c: any) => !ocupados.has(n(nombreCond(c))) && !descansosDelMes(c, d.getFullYear(), d.getMonth()).includes(d.getDate()))
        .map((c: any) => nombreCorto(nombreCond(c)));
      return resp(libres.length ? `${capital(cuando)} ${libres.length === 1 ? 'está libre' : `están libres ${libres.length} conductores`}: ${listar(libres, 12)}. 👷` : `${capital(cuando)} todos los conductores tienen viaje o descanso.`, [ruta('Ir a Conductores', '/conductores')]);
    }
    const pico = new Set(picoDelDia(S, dia).map(x => x.placa));
    const libres = (S.vehiculos || []).filter((v: any) => placaDe(v) && String(v.categoria || 'Viajero') !== 'Urbano' && !enMantenimiento(v, dia)
      && (!f.transportadoras.length || f.transportadoras.some(t => n(t) === n(v.tr || 'Makand')))
      && !activos.some(x => placaDe(x) === placaDe(v) && ocupaElDia(x, dia)));
    const propios = libres.filter((v: any) => !esCupo(placaDe(v))).map((v: any) => placaDe(v) + (pico.has(placaDe(v)) ? ' (pico y placa)' : ''));
    const cupos = libres.filter((v: any) => esCupo(placaDe(v))).map(placaDe);
    const txt = propios.length
      ? `${capital(cuando)} ${propios.length === 1 ? 'está libre' : `están libres ${propios.length} vehículos`}: ${listar(propios, 12)}.${cupos.length ? ` Y de cupos: ${listar(cupos, 8)}.` : ''} 🚚`
      : `${capital(cuando)} todos los vehículos propios están ocupados.${cupos.length ? ` De cupos quedan libres: ${listar(cupos, 8)}.` : ' Tampoco hay cupos libres.'}`;
    const acciones: Accion[] = RECOMIENDA.test(q) ? [{ texto: 'Agregar un viaje extra', tipo: 'viaje-extra' }, ruta('Ver el Rutograma', '/rutograma')] : [ruta('Ver el Rutograma', '/rutograma')];
    return resp(RECOMIENDA.test(q) && (propios.length || cupos.length) ? `${txt} En "+ Viaje Extra" te sugiero el mejor según el cliente.` : txt, acciones);
  }

  // ===== 5. El que más / el que menos =====
  const rank = q.match(/\b(mas|menos)\b(?!\s+de\s+\d)(?!\s+\d)/);
  const sobre = /\bel que (mas|menos)\b/.test(q) && !/clientes?|destinos?|rutas?|conductor|chofer|quien/.test(q) ? 'vehiculo' : /\bclientes?\b/.test(q) ? 'cliente' : DEST.test(q) || /\bvamos\b|ciudad/.test(q) ? 'destino' : /\brutas?\b/.test(q) ? 'ruta'
    : VEH.test(q) ? 'vehiculo' : COND.test(q) ? 'conductor' : '';
  if (rank && sobre && (/viaj|trabaj|frecuent|usad|sal|llev|carg|vamos|movi|hace|hizo|tiene|tuvo|cajas|ocupad|pedid|despach|factur|grande|importante|fuerte|top|principal|mejor|activ|rueda|cumpl/.test(q)) && !placa && !conductor) {
    const r = tieneFecha ? { desde: f.desde || '0000', hasta: f.hasta || '9999', texto: cuandoTexto(f.desde, f.hasta, hoy, entFecha) } : delMes();
    const lista = activos.filter(v => v.fecha >= r.desde && v.fecha <= r.hasta);
    const porCajas = CAJAS.test(q);
    const porPlata = !porCajas && PLATA.test(q);
    const valor = (v: any) => sobre === 'cliente' ? clienteDe(v) : sobre === 'destino' ? destinoDe(v) : sobre === 'ruta' ? String(v.codigo || v.ruta || '') : sobre === 'conductor' ? condDe(v) : placaDe(v);
    const cuenta = new Map<string, number>();
    // Para "el que menos" cuentan también los que no tuvieron ningún viaje.
    if (rank[1] === 'menos' && sobre === 'vehiculo') (S.vehiculos || []).filter((v: any) => !esCupo(placaDe(v)) && String(v.categoria || 'Viajero') !== 'Urbano').forEach((v: any) => cuenta.set(placaDe(v), 0));
    if (rank[1] === 'menos' && sobre === 'conductor') (S.conductores || []).filter((c: any) => !/inactiv|retirad/.test(n(c.est || c.estado))).forEach((c: any) => cuenta.set(nombreCond(c), 0));
    lista.forEach(v => { const k = valor(v); if (k && k !== 'No definido') cuenta.set(k, (cuenta.get(k) || 0) + (porCajas ? Number(v.cajas) || 0 : porPlata ? Number(v.tarifa) || 0 : 1)); });
    const orden = [...cuenta.entries()].sort((a, b) => rank[1] === 'mas' ? b[1] - a[1] : a[1] - b[1]).slice(0, 3);
    if (!orden.length) return resp(`No hay viajes ${r.texto} para comparar.`);
    const nombre = (k: string) => sobre === 'conductor' ? nombreCorto(k) : k;
    const unidad = porCajas ? 'cajas' : porPlata ? 'facturación' : 'viajes';
    const que: Record<string, string> = { cliente: 'Clientes', destino: 'Destinos', ruta: 'Rutas', vehiculo: 'Vehículos', conductor: 'Conductores' };
    return resp(`${que[sobre]} con ${rank[1] === 'mas' ? 'más' : 'menos'} ${unidad} ${r.texto}: ${orden.map(([k, c], i) => `${i + 1}. ${nombre(k)} (${porPlata ? plata(c) : c.toLocaleString('es-CO')})`).join(', ')}. ${rank[1] === 'mas' ? '🏆' : '📉'}`, [ruta('Ver el Comparativo', '/comparativo')]);
  }

  // ===== 6. Un vehículo o un conductor: dónde está, cuándo sale, cuándo vuelve, cuántos lleva =====
  if ((placa || conductor) && !f.rutas.length) {
    const quien = placa ? `la ${placa}` : nombreCorto(conductor);
    const suyos = activos.filter(v => placa ? pegada(placaDe(v)) === pegada(placa) || pegada(v.placaOriginal) === pegada(placa) : n(condDe(v)) === n(conductor))
      .filter(v => (!f.destinos.length || f.destinos.some(d => n(`${v.destino} ${v.destinoReal}`).includes(n(d)))) && (!f.clientes.length || f.clientes.some(c => n(v.cliente).includes(n(c)))))
      .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
    const sufijo = (v: any) => `${placa ? (condDe(v) ? ` con ${nombreCorto(condDe(v))}` : ' (sin conductor)') : ` en la ${placaDe(v)}`}`;
    if (CONTAR.test(q) || CAJAS.test(q) || PLATA.test(q)) {
      const r = tieneFecha ? { desde: f.desde || '0000', hasta: f.hasta || '9999', texto: cuandoTexto(f.desde, f.hasta, hoy, entFecha) } : delMes();
      const del = suyos.filter(v => v.fecha >= r.desde && v.fecha <= r.hasta);
      const cajas = del.reduce((s, v) => s + (Number(v.cajas) || 0), 0);
      const pesos = del.reduce((s, v) => s + (Number(v.tarifa) || 0), 0);
      const txt = PLATA.test(q) ? `${capital(quien)} lleva ${plata(pesos)} facturados ${r.texto} en ${plural(del.length, 'viaje', 'viajes')}. 💰`
        : CAJAS.test(q) ? `${capital(quien)} lleva ${cajas.toLocaleString('es-CO')} cajas ${r.texto} en ${plural(del.length, 'viaje', 'viajes')}. 📦`
          : `${capital(quien)} ${r.desde > hoy ? 'tiene' : 'lleva'} ${plural(del.length, 'viaje', 'viajes')} ${r.texto}${del.length ? ` (${cajas.toLocaleString('es-CO')} cajas): ${agrupar(del.map(destinoDe), 4)}` : ''}.`;
      return resp(txt, [accionLista('Ver la lista', busqueda(r.texto))]);
    }
    if (/\b(ultimo|ultima|anterior)\b/.test(q)) {
      const v = [...suyos].reverse().find(x => x.fecha <= hoy);
      return resp(v ? `El último viaje de ${quien} fue el ${fechaLarga(v.fecha)}: ${v.ruta || v.codigo} a ${destinoDe(v)}${sufijo(v)}${v.estado ? `. Estado: ${v.estado}` : ''}.` : `${capital(quien)} no tiene viajes anteriores.`, v ? [accionViaje(v)] : []);
    }
    const ayer = iso(sumar(hoyD, -1));
    const actual = suyos.find(v => ocupaElDia(v, hoy)) || suyos.find(v => v.salidaReal && !v.llegadaReal && v.fecha <= hoy && ultimoDia(v) >= ayer);
    const proximo = suyos.find(v => v.fecha > hoy || (v.fecha === hoy && !v.salidaReal));
    if (LLEGA.test(q)) {
      const v = actual || proximo;
      if (!v) return resp(`${capital(quien)} no está de viaje ni tiene viajes próximos.`);
      const ult = ultimoDia(v);
      return resp(v === actual ? `${capital(quien)} está de viaje a ${destinoDe(v)} y regresa ${cuandoTexto(ult, ult, hoy)}${v.llegadaReal ? ' (ya marcó que llegó ✅)' : ''}. 🔙` : `${capital(quien)} no está de viaje ahora. Su próximo viaje sale ${cuandoTexto(v.fecha, v.fecha, hoy)} a ${destinoDe(v)} y regresa ${cuandoTexto(ult, ult, hoy)}.`, [accionViaje(v)]);
    }
    if (/\b(proximo|proxima|siguiente|cuando (sale|viaja|le toca|tiene|va|se va|vuelve a salir|trabaja)|a que hora (sale|se va|carga|arranca))\b/.test(q) && !tieneFecha) {
      return resp(proximo ? `El próximo viaje de ${quien} sale ${cuandoTexto(proximo.fecha, proximo.fecha, hoy)}${proximo.hora && proximo.hora !== '--:--' ? ` a las ${proximo.hora}` : ''}: ${proximo.ruta || proximo.codigo} a ${destinoDe(proximo)}${sufijo(proximo)}. 🚚` : `${capital(quien)} no tiene viajes programados de aquí en adelante.`, proximo ? [accionViaje(proximo)] : []);
    }
    if (!otrosFiltros || /\b(donde|que hace|hace|anda|esta|trabaja|viaja|va|sale|tiene)\b/.test(q)) {
      if ((tieneFecha && f.desde !== f.hasta) || (!tieneFecha && /\bviajes\b/.test(q))) {
        const r = tieneFecha ? { desde: f.desde, hasta: f.hasta, texto: cuandoTexto(f.desde, f.hasta, hoy, entFecha) } : delMes();
        const del = suyos.filter(v => (!r.desde || ultimoDia(v) >= r.desde) && (!r.hasta || v.fecha <= r.hasta));
        const cuando = r.texto;
        return resp(del.length ? `${capital(cuando)} ${quien} tiene ${plural(del.length, 'viaje', 'viajes')}: ${listar(del.map(v => `${fechaMini(v.fecha)} → ${destinoDe(v)}`), 8)}.` : `${capital(cuando)} ${quien} no tiene viajes.`, del.length === 1 ? [accionViaje(del[0])] : [accionLista('Ver la lista', busqueda(cuando))]);
      }
      const dia = f.desde || hoy;
      const cuando = cuandoTexto(dia, dia, hoy);
      const nov = (S.novedades || []).filter((x: any) => !x.resuelta && (placa ? n(x.titulo).includes(n(placa)) : n(x.titulo).includes(n(conductor))));
      const novTxt = nov.length && /\b(pas[oa]|novedad|problema|lio|varad)/.test(q) ? ` 📝 Novedad sin resolver: ${listar([...new Set(nov.map((x: any) => String(x.tipo || x.titulo).split('·')[0].trim()))] as string[], 3)}.` : '';
      const ese = suyos.find(v => ocupaElDia(v, dia)) || (dia === hoy ? actual : undefined);
      if (ese) {
        const sale = ese.fecha === dia ? (dia >= hoy ? `sale ${cuando}${ese.hora && ese.hora !== '--:--' ? ` a las ${ese.hora}` : ''}` : `salió ${cuando}`) : `salió el ${fechaMini(ese.fecha)}`;
        return resp(`${capital(cuando)} ${quien} está de viaje: ${ese.ruta || ese.codigo} a ${destinoDe(ese)}${sufijo(ese)}. ${capital(sale)} y regresa el ${fechaMini(ultimoDia(ese))}.${ese.salidaReal && !ese.llegadaReal ? ' Ya marcó "Ya salí". 🚚' : ''}${novTxt}`, [accionViaje(ese)]);
      }
      const sig = suyos.find(v => v.fecha > dia);
      let extra = '';
      if (conductor) {
        const d = new Date(dia + 'T00:00:00');
        const c = (S.conductores || []).find((x: any) => n(nombreCond(x)) === n(conductor));
        if (c && descansosDelMes(c, d.getFullYear(), d.getMonth()).includes(d.getDate())) extra = ' Ese día está de descanso. 😴';
      }
      if (placa) {
        const veh = (S.vehiculos || []).find((x: any) => pegada(placaDe(x)) === pegada(placa));
        if (veh && enMantenimiento(veh, dia)) extra = ' Está en mantenimiento. 🔧';
      }
      return resp(`${capital(cuando)} ${quien} no tiene viaje.${extra}${novTxt}${sig ? ` Su próximo sale ${cuandoTexto(sig.fecha, sig.fecha, hoy)} a ${destinoDe(sig)}.` : ''}`, sig ? [accionViaje(sig, 'Ver el próximo viaje')] : []);
    }
    return null;
  }

  // ===== 7. Viajes en general, con lo que se pida de ellos =====
  // "¿Qué pasa con el viaje BOG-BAQ-EX de la LUN 428?" es de un viaje puntual (lo cuenta mascota-respuestas.ts).
  if (f.rutas.length && (placa || /\b(pasa|paso|como va|el viaje|ese viaje|cuentame|info)\b/.test(q))) return null;
  const proyeccion = CLI.test(q) && !f.clientes.length ? 'cliente' : DEST.test(q) && !f.destinos.length ? 'destino'
    : CAJAS.test(q) ? 'cajas' : PLATA.test(q) ? 'plata' : VEH.test(q) ? 'vehiculo' : COND.test(q) && !f.sinConductor ? 'conductor' : 'viajes';
  const evento = LLEGA.test(q) || (f.estados.includes('Entregado') && !/\bsal/.test(q)) ? 'llega' : FUERA.test(q) ? 'fuera' : 'sale';
  const habla = VIAJE.test(q) || LLEGA.test(q) || FUERA.test(q) || proyeccion !== 'viajes' || /\bviajes?\b/.test(q);
  if (!habla || (!tieneFecha && !otrosFiltros && proyeccion === 'viajes' && !/\bviajes?\b|\bsale|salen\b/.test(q))) return null;
  if (!tieneFecha && !otrosFiltros && !VIAJE.test(q) && !LLEGA.test(q) && !FUERA.test(q) && !/\bviajes?\b/.test(q)) return null;

  // Cuándo: lo que diga; si no dice, hoy (o el mes, si pide números o filtra por cliente/destino).
  let desde = f.desde, hasta = f.hasta, cuando = cuandoTexto(f.desde, f.hasta, hoy, entFecha);
  if (!tieneFecha) {
    const mensual = (CONTAR.test(q) || proyeccion === 'cajas' || proyeccion === 'plata' || otrosFiltros > 0 || /\bviajes\b/.test(q)) && evento === 'sale' && !/\b(sale|salen|ahora|ahorita)\b/.test(q);
    if (mensual) { const m = delMes(); desde = m.desde; hasta = m.hasta; cuando = m.texto; }
    else { desde = hasta = hoy; cuando = 'hoy'; }
  }
  const base = filtrarViajes({ ...f, desde: null, hasta: null, diasSemana: f.diasSemana }, S, (v: any) => v.hora || '', hoyD).filter((v: any) => v.estado !== 'Cancelado' || f.estados.includes('Cancelado'));
  const enRango = (d: string) => (!desde || d >= desde) && (!hasta || d <= hasta);
  const lista = base.filter((v: any) => evento === 'llega' ? enRango(ultimoDia(v)) : evento === 'fuera' ? (!hasta || v.fecha <= hasta) && (!desde || ultimoDia(v) >= desde) : enRango(String(v.fecha).slice(0, 10)))
    .sort((a: any, b: any) => String(a.fecha).localeCompare(String(b.fecha)) || String(a.hora || '').localeCompare(String(b.hora || '')));
  const yaPaso = (!!hasta && hasta < hoy) || (pasado && (!hasta || hasta <= hoy));
  const enCurso = !yaPaso && !!desde && !!hasta && desde < hoy && hasta >= hoy;
  const verbo = (k: number) => {
    const uno = k === 1;
    if (evento === 'llega') return yaPaso ? (uno ? 'regresó' : 'regresaron') : enCurso ? (uno ? 'regresa' : 'regresan') : (uno ? 'regresa' : 'regresan');
    if (evento === 'fuera') return yaPaso ? (uno ? 'estuvo de viaje' : 'estuvieron de viaje') : (uno ? 'está de viaje' : 'están de viaje');
    return yaPaso ? (uno ? 'salió' : 'salieron') : enCurso ? (uno ? 'va' : 'van') : (uno ? 'sale' : 'salen');
  };
  const con = frase ? ` ${frase}` : '';
  if (DIAS_SEMANA.test(q) && desde && desde === hasta && ['hoy', 'mañana', 'pasado mañana'].includes(cuando)) cuando += ` (${new Date(desde + 'T00:00:00').toLocaleDateString('es-CO', { weekday: 'long' })})`;
  const Cuando = capital(cuando);
  const acciones: Accion[] = lista.length === 1 ? [accionViaje(lista[0])] : lista.length ? [accionLista(`Ver ${lista.length === 1 ? 'el viaje' : `los ${lista.length}`}`, busqueda(cuando))] : [];

  if (!lista.length) {
    const sig = proyeccion !== 'plata' && proyeccion !== 'cajas' && evento === 'sale' && hasta && hasta >= hoy ? base.find((v: any) => v.fecha > hasta!) : null;
    const nada = frase ? `no ${yaPaso ? 'hubo' : 'hay'} viajes${con}` : evento === 'llega' ? 'no regresa ningún viaje' : evento === 'fuera' ? 'no hay vehículos de viaje' : yaPaso ? 'no salió ningún viaje' : 'no sale ningún viaje';
    if (!frase && desde && desde > hoy && !activos.some(v => v.fecha >= desde!)) return resp(`${Cuando} todavía no hay viajes programados. En el Pronóstico ves cuántos se esperan, con los meses anteriores. 🔮`, [ruta('Ver el pronóstico', '/pronostico'), ruta('Ver el Rutograma', '/rutograma')]);
    return resp(`${Cuando} ${nada}${frase ? '' : con}.${sig ? ` El siguiente sale ${cuandoTexto(sig.fecha, sig.fecha, hoy)}: ${placaDe(sig)} a ${destinoDe(sig)}.` : ''}`, sig ? [accionViaje(sig, 'Ver ese viaje')] : [ruta('Ver el Rutograma', '/rutograma')]);
  }
  const cajas = lista.reduce((s: number, v: any) => s + (Number(v.cajas) || 0), 0);
  switch (proyeccion) {
    case 'cliente': return resp(`${Cuando} ${verbo(lista.length)} ${plural(lista.length, 'viaje', 'viajes')}${con} para ${agrupar(lista.map(clienteDe), 8)}.`, acciones);
    case 'destino': return resp(`${Cuando} ${verbo(lista.length)} ${plural(lista.length, 'viaje', 'viajes')}${con} a ${agrupar(lista.map(destinoDe), 8)}. 🗺️`, acciones);
    case 'cajas': return resp(`${Cuando} ${verbo(2)} ${cajas.toLocaleString('es-CO')} cajas${con} en ${plural(lista.length, 'viaje', 'viajes')}. 📦`, acciones);
    case 'plata': {
      const pesos = lista.reduce((s: number, v: any) => s + (Number(v.tarifa) || 0), 0);
      const porTr = new Map<string, number>(); lista.forEach((v: any) => { const t = v.tr || 'Makand'; porTr.set(t, (porTr.get(t) || 0) + (Number(v.tarifa) || 0)); });
      return resp(`${Cuando}${con} ${yaPaso ? 'se facturaron' : 'van'} ${plata(pesos)} en ${plural(lista.length, 'viaje', 'viajes')}${porTr.size > 1 ? ` (${[...porTr.entries()].map(([t, k]) => `${t} ${plata(k)}`).join(' · ')})` : ''}. 💰`, [ruta('Ver el Comparativo', '/comparativo'), ...acciones]);
    }
    case 'vehiculo': {
      const vistos = new Map<string, any>(); lista.forEach((v: any) => { if (!vistos.has(placaDe(v))) vistos.set(placaDe(v), v); });
      const items = [...vistos.values()].map(v => `${placaDe(v)} → ${destinoDe(v)}${tieneFecha && desde !== hasta ? ` (${fechaMini(v.fecha)})` : ''}`);
      return resp(`${Cuando} ${verbo(vistos.size)} ${plural(vistos.size, 'vehículo', 'vehículos')}${con}: ${listar(items, 12)}. 🚚`, acciones);
    }
    case 'conductor': {
      const vistos = new Map<string, any>(); let sin = 0;
      lista.forEach((v: any) => { const c = condDe(v); if (!c) sin++; else if (!vistos.has(c)) vistos.set(c, v); });
      const items = [...vistos.entries()].map(([c, v]) => `${nombreCorto(c)} (${placaDe(v)}${f.destinos.length ? '' : ` → ${destinoDe(v)}`})`);
      const aviso = !sin ? '' : evento === 'sale' && !yaPaso ? ` ⚠️ ${plural(sin, 'viaje sigue', 'viajes siguen')} sin conductor.` : ` Y ${sin} sin conductor anotado.`;
      if (!vistos.size) return resp(`${Cuando} ${verbo(lista.length)}${con}: ${listar(lista.map((v: any) => `${placaDe(v)}${f.destinos.length ? '' : ` → ${destinoDe(v)}`}`), 12)}, sin conductor anotado.`, acciones);
      return resp(`${Cuando} ${verbo(vistos.size)}${con}: ${listar(items, 12)}.${aviso} 👷`, acciones);
    }
    default: {
      const porTr = new Map<string, number>(); lista.forEach((v: any) => porTr.set(v.tr || 'Makand', (porTr.get(v.tr || 'Makand') || 0) + 1));
      const desglose = porTr.size > 1 ? `: ${listar([...porTr.entries()].sort((a, b) => b[1] - a[1]).map(([t, k]) => `${k} de ${t}`))}` : '';
      if (CONTAR.test(q) || lista.length > 12) return resp(`${Cuando} ${verbo(lista.length)} ${plural(lista.length, 'viaje', 'viajes')}${con} con ${cajas.toLocaleString('es-CO')} cajas${desglose}. 🚚`, acciones);
      const items = lista.map((v: any) => `${placaDe(v)} → ${destinoDe(v)}${condDe(v) ? ` (${nombreCorto(condDe(v))})` : ''}${desde !== hasta ? ` el ${fechaMini(v.fecha)}` : ''}`);
      return resp(`${Cuando} ${verbo(lista.length)} ${plural(lista.length, 'viaje', 'viajes')}${con}: ${listar(items, 12)}. 🚚`, acciones);
    }
  }
}

/** "Hoy salen 10 viajes (Barranquilla 3, Cali 2…), 6 siguen de viaje, regresan 5…" */
function resumenDia(S: any, activos: any[], dia: string, hoy: string, condDe: (v: any) => string): Respuesta {
  const cuando = cuandoTexto(dia, dia, hoy);
  const paso = dia < hoy;
  const salen = activos.filter(v => v.fecha === dia);
  const siguen = activos.filter(v => v.fecha < dia && ocupaElDia(v, dia) && ultimoDia(v) !== dia);
  const regresan = activos.filter(v => ultimoDia(v) === dia && v.fecha !== dia);
  const sinCond = salen.filter(v => !condDe(v)).length;
  const novedades = (S?.novedades || []).filter((x: any) => !x.resuelta).length;
  const pico = picoDelDia(S, dia).map(x => x.placa);
  const cajas = salen.reduce((s, v) => s + (Number(v.cajas) || 0), 0);
  const partes = [
    salen.length ? `${capital(cuando)} ${paso ? 'salieron' : 'salen'} ${plural(salen.length, 'viaje', 'viajes')} con ${cajas.toLocaleString('es-CO')} cajas (${agrupar(salen.map(destinoDe), 4)}).` : `${capital(cuando)} no ${paso ? 'salió' : 'sale'} ningún viaje.`,
    siguen.length ? `${plural(siguen.length, 'vehículo', 'vehículos')} ${paso ? 'seguían' : 'siguen'} de viaje.` : '',
    regresan.length ? `${paso ? 'Regresaron' : 'Regresan'} ${regresan.length}.` : '',
    sinCond && !paso ? `⚠️ ${plural(sinCond, 'viaje sin conductor', 'viajes sin conductor')}.` : '',
    pico.length && !paso ? `Pico y placa: ${listar(pico)}. 🚫` : '',
    novedades && dia === hoy ? `📝 ${plural(novedades, 'novedad sin resolver', 'novedades sin resolver')}.` : ''
  ].filter(Boolean);
  return resp(partes.join(' '), [ruta('Ver el Resumen del día', '/resumen'), { texto: 'Ver la lista', tipo: 'buscar', valor: cuando }]);
}

/** "En octubre van 274 viajes, 45.471 cajas y $X facturados…" */
function resumenMes(S: any, activos: any[], q: string, ahora: Date, condDe: (v: any) => string): Respuesta {
  const { anio, mes } = mesPreguntado(q, ahora);
  const pref = `${anio}-${String(mes + 1).padStart(2, '0')}`;
  const del = activos.filter(v => String(v.fecha).startsWith(pref));
  const cajas = del.reduce((s, v) => s + (Number(v.cajas) || 0), 0);
  const pesos = del.reduce((s, v) => s + (Number(v.tarifa) || 0), 0);
  const entregados = del.filter(v => v.estado === 'Entregado' || v.llegadaReal).length;
  const sinCond = del.filter(v => !condDe(v) && v.fecha >= iso(ahora)).length;
  const cli = elQueMas(del.map(clienteDe).filter(Boolean));
  const cancelados = (S?.viajes || []).filter((v: any) => String(v.fecha || '').startsWith(pref) && v.estado === 'Cancelado').length;
  if (!del.length) return resp(`En ${MESES[mes]} ${anio} todavía no hay viajes.`, [ruta('Ver el Comparativo', '/comparativo')]);
  return resp([
    `En ${MESES[mes]} ${anio} van ${plural(del.length, 'viaje', 'viajes')}, ${cajas.toLocaleString('es-CO')} cajas y ${plata(pesos)} facturados.`,
    `Entregados: ${entregados}.`,
    cancelados ? `Cancelados: ${cancelados}.` : '',
    sinCond ? `⚠️ ${plural(sinCond, 'viaje', 'viajes')} por venir sin conductor.` : '',
    cli ? `El cliente con más viajes: ${cli[0]} (${cli[1]}). 📊` : ''
  ].filter(Boolean).join(' '), [ruta('Ver el Comparativo', '/comparativo')]);
}
