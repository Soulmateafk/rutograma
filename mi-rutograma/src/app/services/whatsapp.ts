// ============================================================
// AVISAR POR WHATSAPP — arma el enlace wa.me que abre el chat del
// conductor con el mensaje ya escrito (sus próximos viajes). No usa
// ningún servicio de pago: solo abre WhatsApp y la persona toca Enviar.
// Funciones puras.
// ============================================================

import { esViajeDe } from './carga-conductores';

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const CLAVES_DIA = ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab'];

/** Número para wa.me (con 57 de Colombia), o '' si no es un celular. */
export function numeroWhatsApp(tel: any): string {
  let d = String(tel ?? '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('57')) d = d.slice(2);
  return d.length === 10 && d.startsWith('3') ? `57${d}` : '';
}

const fechaLocal = (f: string): Date => {
  const [a, m, d] = f.split('-').map(Number);
  return new Date(a, m - 1, d);
};
const aTexto = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Hora del viaje; si no la tiene, la de su ruta para ese día de la semana. */
export function horaDelViaje(v: any, rutas: any[]): string {
  if (/^\d{1,2}:\d{2}$/.test(String(v.hora || '').trim())) return String(v.hora).trim();
  const ruta = (rutas || []).find((r: any) => String(r.cod || r.codigo || '').toUpperCase() === String(v.ruta || v.codigo || '').toUpperCase());
  if (!ruta || !v.fecha) return '';
  let dias = ruta.dias;
  if (typeof dias === 'string') { try { dias = JSON.parse(dias); } catch { dias = null; } }
  const hora = String(dias?.[CLAVES_DIA[fechaLocal(v.fecha).getDay()]]?.hora || '').trim();
  return /^\d{1,2}:\d{2}$/.test(hora) ? hora : '';
}

/** Viajes del conductor desde hoy y los `dias` siguientes, en orden. */
export function proximosViajes(conductor: any, viajes: any[], hoy: Date, dias = 7): any[] {
  const nombre = String(conductor?.nom ?? conductor?.nombre ?? '').trim();
  const placa = String(conductor?.veh ?? conductor?.placa ?? '').trim();
  if (!nombre) return [];
  const desde = aTexto(hoy);
  const hasta = aTexto(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + dias));
  return (viajes || [])
    .filter(v => v.fecha && v.fecha >= desde && v.fecha <= hasta && v.estado !== 'Cancelado' && esViajeDe(v, nombre, placa))
    .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)) || String(a.hora || '').localeCompare(String(b.hora || '')));
}

/** El mensaje: saludo + una línea por viaje. */
export function mensajeViajes(conductor: any, viajes: any[], rutas: any[], hoy: Date, dias = 7): string {
  const nombre = String(conductor?.nom ?? conductor?.nombre ?? '').trim();
  const primerNombre = nombre.split(/\s+/)[0] || '';
  const lista = proximosViajes(conductor, viajes, hoy, dias);
  if (!lista.length) return `Hola ${primerNombre}, por ahora no tienes viajes programados en los próximos ${dias} días.`;
  const lineas = lista.map(v => {
    const f = fechaLocal(v.fecha);
    const partes = [
      `${DIAS[f.getDay()]} ${f.getDate()} ${MESES[f.getMonth()]}`,
      String(v.placaReal || v.p || v.placa || '').toUpperCase(),
      [v.ruta || v.codigo, v.destino && v.destino !== 'No definido' ? `→ ${v.destino}` : ''].filter(Boolean).join(' '),
      horaDelViaje(v, rutas),
      v.cliente || v.cli || ''
    ].filter(Boolean);
    const nota = String(v.obs || '').trim();
    return `• ${partes.join(' · ')}${nota ? `\n   Nota: ${nota}` : ''}`;
  });
  return `Hola ${primerNombre}, tus viajes de los próximos ${dias} días:\n${lineas.join('\n')}\n\nCualquier novedad, avísanos. MAKAND`;
}

/** Enlace que abre el chat con el mensaje escrito ('' si no hay celular). */
export function enlaceWhatsApp(tel: any, mensaje: string): string {
  const numero = numeroWhatsApp(tel);
  return numero ? `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}` : '';
}
