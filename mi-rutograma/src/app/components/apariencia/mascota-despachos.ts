/**
 * El furgoncito contesta de Despachos (a qué hora llegó cada vehículo a
 * cargar, cuándo terminó y cuándo salió) con lo que devuelve
 * GET /api/despachos?desde&hasta (ver backend/despachos.js). Función pura.
 */
import type { Pedido, Accion } from './mascota-respuestas';

const pegada = (t: any) => String(t ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const minutos = (m: number | null | undefined) => m === null || m === undefined ? '' : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`;
const listar = (xs: string[], max = 6) => !xs.length ? '' : xs.length <= max ? (xs.length === 1 ? xs[0] : `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`) : `${xs.slice(0, max).join(', ')} y ${xs.length - max} más`;
const capital = (s: string) => s ? s[0].toUpperCase() + s.slice(1) : s;

export function textoDespachos(data: any, p: Pedido): { texto: string; acciones: Accion[] } {
  const acciones: Accion[] = [{ texto: 'Ir a Despachos', tipo: 'ruta', valor: '/despachos' }];
  const regs: any[] = (data?.registros || []).slice().sort((a: any, b: any) => `${a.fecha} ${a.horaLlegada}`.localeCompare(`${b.fecha} ${b.horaLlegada}`));
  const Cuando = capital(p.cuando);
  if (p.que === 'placa' && p.placa) {
    const suyos = regs.filter(r => pegada(r.placa) === pegada(p.placa));
    const r = suyos[suyos.length - 1];
    if (!r) return { texto: `${Cuando} la ${p.placa} no tiene despacho anotado.`, acciones };
    const partes = [`La ${p.placa} llegó a cargar${p.desde !== p.hasta ? ` el ${r.fecha.slice(8)}/${r.fecha.slice(5, 7)}` : ''} a las ${r.horaLlegada}${r.destino ? ` (va a ${r.destino})` : ''}.`];
    if (r.horaFinCargue) partes.push(`Terminó de cargar a las ${r.horaFinCargue}${r.minutos !== null && r.minutos !== undefined ? ` (${minutos(r.minutos)})` : ''}.`);
    else partes.push('Todavía está cargando. ⏳');
    if (r.horaSalida) partes.push(`Salió a las ${r.horaSalida}.`);
    if (r.motivoDemora) partes.push(`Se demoró por: ${r.motivoDemora}${r.motivoDemoraDetalle ? ` (${r.motivoDemoraDetalle})` : ''}.`);
    if (r.totalCajas) partes.push(`Cargó ${r.totalCajas} cajas.`);
    return { texto: partes.join(' '), acciones };
  }
  if (!regs.length) return { texto: `${Cuando} no hay despachos anotados todavía.`, acciones };
  if (p.que === 'cargando') {
    const cargando = regs.filter(r => !r.horaFinCargue);
    return { texto: cargando.length ? `Están cargando ${cargando.length}: ${listar(cargando.map(r => `${r.placa} (desde las ${r.horaInicioCargue || r.horaLlegada})`))}. ⏳` : `${Cuando} nadie está cargando ahora. ✅`, acciones };
  }
  if (p.que === 'demoras') {
    const dem = regs.filter(r => r.motivoDemora);
    return { texto: dem.length ? `${Cuando} se demoraron ${dem.length} en el cargue: ${listar(dem.map(r => `${r.placa} (${minutos(r.minutos)}, ${r.motivoDemora})`))}.` : `${Cuando} ningún cargue pasó del límite${data?.limiteMin ? ` de ${minutos(data.limiteMin)}` : ''}. ✅`, acciones };
  }
  const res = data?.resumen || {};
  const partes = [`${Cuando} van ${regs.length} despacho${regs.length === 1 ? '' : 's'}`];
  if (res.terminados !== undefined) partes[0] += `: ${res.terminados} terminaron de cargar${res.enCargue ? ` y ${res.enCargue} siguen cargando` : ''}`;
  partes[0] += '.';
  if (res.promedioMin) partes.push(`El cargue tarda en promedio ${minutos(res.promedioMin)} (el más largo, ${minutos(res.maximoMin)}).`);
  if (res.conDemora) partes.push(`⚠️ ${res.conDemora} con demora.`);
  if (res.totalCajas) partes.push(`📦 ${Number(res.totalCajas).toLocaleString('es-CO')} cajas cargadas.`);
  return { texto: partes.join(' '), acciones };
}
