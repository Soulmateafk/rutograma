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
