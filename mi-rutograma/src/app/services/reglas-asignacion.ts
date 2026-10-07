// ============================================================
// REGLAS DE ASIGNACIÓN — lo que la oficina configura y la app revisa al
// asignar un viaje (avisa; la persona puede guardar igual):
//  - Por cliente o ruta: "D1 solo en furgón refrigerado", "a Montería
//    mínimo 600 cajas". { id, aplicaA: 'cliente'|'ruta', valor,
//    tipoVehiculo?, cajasMin?, nota? }
//  - Pico y placa: placas terminadas en ciertos dígitos no pueden salir
//    ciertos días en un horario. { id, dias: ['lun',...], digitos: '1,2',
//    desde: '06:00', hasta: '20:00', nota? }
// Solo vehículos propios (los cupos ARSITRANS 1, POLAR 2... no son
// vehículos reales). Funciones puras.
// Espejo de backend/reglas-asignacion.js (el servidor es el que manda).
// ============================================================

export const DIAS = ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab'];
const NOMBRE_DIA: Record<string, string> = { dom: 'domingo', lun: 'lunes', mar: 'martes', mie: 'miércoles', jue: 'jueves', vie: 'viernes', sab: 'sábado' };
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const HORA = /^\d{1,2}:\d{2}$/;

const limpiar = (t: any): string => String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim().replace(/\s+/g, ' ');
const pegada = (p: any): string => String(p ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const esPlacaCupo = (p: any): boolean => /^(ARSITRANS|POLAR)\s*\d+$/i.test(String(p || '').trim());
const aMinutos = (h: string): number => { const [a, b] = String(h).split(':').map(Number); return a * 60 + b; };
const dosDigitos = (h: string): string => { const [a, b] = String(h).split(':'); return `${a.padStart(2, '0')}:${b}`; };

/** Hora de salida del viaje; si no la tiene, la de su ruta para ese día. */
export function horaDelViaje(v: any, rutas: any[] = []): string {
  const propia = String(v.hora || '').trim();
  if (HORA.test(propia)) return dosDigitos(propia);
  const ruta = (rutas || []).find((r: any) => limpiar(r.cod || r.codigo) === limpiar(v.ruta || v.codigo));
  if (!ruta || !FECHA.test(String(v.fecha || ''))) return '';
  let dias = ruta.dias;
  if (typeof dias === 'string') { try { dias = JSON.parse(dias); } catch { dias = null; } }
  const [a, m, d] = String(v.fecha).split('-').map(Number);
  const hora = String(dias?.[DIAS[new Date(a, m - 1, d).getDay()]]?.hora || ruta.horaSalida || ruta.hora || '').trim();
  return HORA.test(hora) ? dosDigitos(hora) : '';
}

/** Cliente del viaje (el anotado; si no, los de su ruta). */
export function clienteDelViaje(v: any, rutas: any[]): string {
  const propio = String(v.cliente || v.cli || '').trim();
  if (propio && propio !== 'No definido') return propio;
  const ruta = (rutas || []).find((r: any) => limpiar(r.cod || r.codigo) === limpiar(v.ruta || v.codigo));
  return String(ruta?.clientes || '').trim();
}

/**
 * Lo que incumple el viaje según las reglas. data: { vehiculos, rutas,
 * reglasAsignacion, picoPlaca }. Devuelve textos (vacío = todo bien).
 */
export function reglasIncumplidas(v: any, data: any): string[] {
  if (!v || ['Cancelado', 'Mantenimiento'].includes(v.estado)) return [];
  const placa = String(v.p ?? v.placa ?? '').toUpperCase().trim();
  if (!placa || esPlacaCupo(placa)) return [];
  const vehiculo = (data.vehiculos || []).find((x: any) => pegada(x.p ?? x.placa) === pegada(placa));
  const avisos: string[] = [];

  const cliente = limpiar(clienteDelViaje(v, data.rutas));
  const ruta = limpiar(v.ruta || v.codigo);
  (data.reglasAsignacion || []).forEach((r: any) => {
    const valor = limpiar(r.valor);
    if (!valor) return;
    const aplica = r.aplicaA === 'ruta' ? ruta === valor : cliente.includes(valor);
    if (!aplica || !vehiculo) return;
    const quien = r.aplicaA === 'ruta' ? `la ruta ${String(r.valor).trim()}` : `el cliente ${String(r.valor).trim()}`;
    const tipoPedido = String(r.tipoVehiculo || '').trim();
    const tipo = String(vehiculo.tipo || vehiculo.t || '');
    if (tipoPedido && !limpiar(tipo).includes(limpiar(tipoPedido))) {
      avisos.push(`${quien} pide vehículo "${tipoPedido}" y ${placa} es "${tipo || 'sin tipo'}"${r.nota ? ` (${r.nota})` : ''}`);
    }
    const cajasMin = Number(r.cajasMin) || 0;
    const cajas = Number(vehiculo.cajas || vehiculo.cap) || 0;
    if (cajasMin && cajas < cajasMin) {
      avisos.push(`${quien} pide mínimo ${cajasMin} cajas y ${placa} lleva ${cajas || 'sin dato'}${r.nota ? ` (${r.nota})` : ''}`);
    }
  });

  const ultimo = placa.replace(/\D/g, '').slice(-1);
  const hora = horaDelViaje(v, data.rutas);
  if (ultimo && hora && FECHA.test(String(v.fecha || ''))) {
    const [a, m, d] = String(v.fecha).split('-').map(Number);
    const dia = DIAS[new Date(a, m - 1, d).getDay()];
    (data.picoPlaca || []).forEach((r: any) => {
      const digitos = String(r.digitos || '').split(/[^0-9]+/).filter(Boolean);
      if (!(r.dias || []).includes(dia) || !digitos.includes(ultimo)) return;
      if (!HORA.test(String(r.desde || '')) || !HORA.test(String(r.hasta || ''))) return;
      const min = aMinutos(hora);
      if (min >= aMinutos(r.desde) && min < aMinutos(r.hasta)) {
        avisos.push(`${placa} (termina en ${ultimo}) tiene pico y placa el ${NOMBRE_DIA[dia]} de ${dosDigitos(r.desde)} a ${dosDigitos(r.hasta)} y sale a las ${hora}${r.nota ? ` (${r.nota})` : ''}`);
      }
    });
  }
  return avisos;
}

