// ============================================================
// DÍAS CERRADOS — copia de la regla de backend/dias-cerrados.js para
// avisar en pantalla. Un viaje cuyo día de regreso es anterior a hoy está
// cerrado: sin el permiso "editarDiasPasados" solo se anota el estado y lo
// que pasó después. El servidor es el que de verdad lo hace cumplir.
// ============================================================

export function fechaLocal(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function finDeViaje(viaje: any): string {
  const fecha = String(viaje?.fecha || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return '';
  const salida = Number(viaje.salida || viaje.dia || 0);
  const retorno = Number(viaje.retorno || 0);
  const d = new Date(`${fecha}T00:00:00`);
  d.setDate(d.getDate() + (retorno > salida ? retorno - salida : 0));
  return fechaLocal(d);
}

export function viajeCerrado(viaje: any, hoy: string = fechaLocal()): boolean {
  const fin = finDeViaje(viaje);
  return !!fin && fin < hoy;
}

// Fechas anteriores a hoy al editar (copia de backend/dias-cerrados.js):
// un viaje que todavía no pasa no se manda a antes de hoy.
const fechaBonita = (f: string): string => { const [a, m, d] = String(f).split('-'); return `${d}/${m}/${a}`; };

function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T00:00:00`);
  d.setDate(d.getDate() + dias);
  return fechaLocal(d);
}

/** Último día del viaje (el "Retorno" que se ve al editar). */
export function ultimoDiaDeViaje(viaje: any): string {
  const fecha = String(viaje?.fecha || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return '';
  const salida = Number(viaje.salida || viaje.dia || 0);
  const retorno = Number(viaje.retorno || 0);
  return sumarDias(fecha, retorno > salida + 1 ? retorno - 1 - salida : 0);
}

/** Fecha del día "dia" en el mes del viaje (la salida es un número de día). */
export function fechaDelDia(fechaViaje: string, dia: number): string {
  const [a, m] = String(fechaViaje || '').split('-').map(Number);
  if (!a || !m || !Number.isFinite(Number(dia))) return String(fechaViaje || '');
  return fechaLocal(new Date(a, m - 1, Number(dia)));
}

export function motivoFechaAnterior(previo: any, nuevo: any, hoy: string = fechaLocal()): string {
  if (!previo || !nuevo) return '';
  const antes = String(previo.fecha || '').slice(0, 10);
  const ahora = String(nuevo.fecha ?? previo.fecha ?? '').slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(ahora) && ahora !== antes && ahora < hoy && antes >= hoy) {
    return `No se puede poner la salida el ${fechaBonita(ahora)}: es un día anterior a hoy (${fechaBonita(hoy)}) y no sería un dato real.`;
  }
  const finAntes = ultimoDiaDeViaje(previo);
  const finAhora = ultimoDiaDeViaje({ ...previo, ...nuevo });
  if (finAhora && finAhora !== finAntes && finAhora < hoy && finAntes >= hoy) {
    return `No se puede poner el retorno el ${fechaBonita(finAhora)}: es un día anterior a hoy (${fechaBonita(hoy)}) y no sería un dato real.`;
  }
  return '';
}
