// ============================================================
// CALENDARIO DEL CELULAR — arma un archivo .ics con los viajes del
// conductor para agregarlos al calendario del teléfono (Google Calendar,
// Calendario de iPhone...). Cada viaje es un evento de día(s) completo(s)
// de la salida al regreso. El identificador de cada evento es fijo (el id
// del viaje): si el conductor vuelve a descargarlo después de un cambio,
// los calendarios que lo soportan actualizan el evento en vez de
// duplicarlo, y un viaje cancelado sale como cancelado. Funciones puras.
// ============================================================

const pad = (n: number): string => String(n).padStart(2, '0');
const fechaIcs = (d: Date): string => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
const sellIcs = (d: Date): string =>
  `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;

/** Escapa texto según el formato iCalendar (comas, punto y coma, saltos). */
const escapar = (t: any): string => String(t ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Las líneas de más de 75 caracteres se parten (exigencia del formato). */
function plegar(linea: string): string {
  if (linea.length <= 75) return linea;
  const partes: string[] = [];
  for (let i = 0; i < linea.length; i += 74) partes.push((i ? ' ' : '') + linea.slice(i, i + 74));
  return partes.join('\r\n');
}

function diasOcupado(v: any): number {
  const salida = Number(v.salida || v.dia || 0);
  const retorno = Number(v.retorno || 0);
  return retorno > salida ? retorno - salida : 1;
}

/** Texto del .ics con los viajes (los que tengan fecha). */
export function armarIcs(viajes: any[], conductor: string, ahora: Date = new Date()): string {
  const lineas = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//MAKAND//Rutograma//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapar(`Viajes MAKAND${conductor ? ' · ' + conductor : ''}`)}`
  ];
  (viajes || []).filter(v => /^\d{4}-\d{2}-\d{2}$/.test(String(v.fecha || ''))).forEach(v => {
    const [a, m, d] = String(v.fecha).split('-').map(Number);
    const inicio = new Date(a, m - 1, d);
    const fin = new Date(a, m - 1, d + diasOcupado(v));
    const destino = v.destino && v.destino !== 'No definido' ? ` → ${v.destino}` : '';
    const resumen = `${v.ruta || 'Viaje'}${destino} · ${v.placa || ''}${v.hora ? ' · ' + v.hora : ''}`;
    const detalle = [
      v.hora ? `Salida: ${v.hora}` : '', v.cliente ? `Cliente: ${v.cliente}` : '', v.placa ? `Vehículo: ${v.placa}` : '',
      v.cajas ? `Cajas: ${v.cajas}` : '', v.nota ? `Nota: ${v.nota}` : ''
    ].filter(Boolean).join('\n');
    lineas.push(
      'BEGIN:VEVENT',
      `UID:${escapar(String(v.id || `${v.placa}-${v.fecha}-${v.ruta}`).replace(/\s+/g, '-'))}@rutograma-makand`,
      `DTSTAMP:${sellIcs(ahora)}`,
      `DTSTART;VALUE=DATE:${fechaIcs(inicio)}`,
      `DTEND;VALUE=DATE:${fechaIcs(fin)}`,
      plegar(`SUMMARY:${escapar(resumen)}`),
      plegar(`DESCRIPTION:${escapar(detalle)}`),
      `STATUS:${v.estado === 'Cancelado' ? 'CANCELLED' : 'CONFIRMED'}`,
      'TRANSP:OPAQUE',
      'END:VEVENT'
    );
  });
  lineas.push('END:VCALENDAR');
  return lineas.join('\r\n') + '\r\n';
}
