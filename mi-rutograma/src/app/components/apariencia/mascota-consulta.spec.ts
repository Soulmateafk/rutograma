import { responder, corregirEscritura } from './mascota-respuestas';

// Jueves 15 de octubre de 2026.
const hoy = new Date(2026, 9, 15, 10, 0);
const S = {
  vehiculos: [
    { p: 'LUN 428', cond: 'Torres Huerfano Javier', tr: 'Makand' },
    { p: 'PRZ 065', cond: 'Moya Carrillo Orlando', tr: 'Makand' },
    { p: 'QTZ 898', cond: 'Baloco Chamorro Javier', tr: 'Makand' },
    { p: 'POLAR 1', tr: 'Polar' }
  ],
  conductores: [
    { nom: 'Torres Huerfano Javier', tel: '3001234567' },
    { nom: 'Moya Carrillo Orlando' },
    { nom: 'Baloco Chamorro Javier' },
    { nom: 'Perez Gomez Pedro' }
  ],
  rutas: [
    { cod: 'BOG-CAL-D1', dest: 'Cali', clientes: 'D1, Cali.', diasTrans: 1, diasDesc: 1, tarifaMakand: 3000000, tarifaPolar: 2700000 },
    { cod: 'BOG-BAQ-D1', dest: 'Barranquilla', clientes: 'D1', diasTrans: 2, diasDesc: 2, tarifaMakand: 4500000 }
  ],
  viajes: [
    // Hoy salen la LUN 428 a Cali y la POLAR 1 a Barranquilla.
    { id: 'a', p: 'LUN 428', fecha: '2026-10-15', salida: 15, retorno: 17, destino: 'Cali', ruta: 'BOG-CAL-D1', cliente: 'D1', cajas: 200, tarifa: 3000000, estado: 'Planificado', tr: 'Makand' },
    { id: 'b', p: 'POLAR 1', fecha: '2026-10-15', salida: 15, retorno: 16, destino: 'Barranquilla', ruta: 'BOG-BAQ-D1', cliente: 'Exito', cajas: 100, tarifa: 2700000, estado: 'Planificado', tr: 'Polar' },
    // La PRZ 065 salió el martes y regresa mañana.
    { id: 'c', p: 'PRZ 065', fecha: '2026-10-13', salida: 13, retorno: 17, destino: 'Barranquilla', ruta: 'BOG-BAQ-D1', cliente: 'D1', cajas: 300, tarifa: 4500000, estado: 'En ruta', tr: 'Makand' },
    // Mañana sale la QTZ 898 a Cali.
    { id: 'd', p: 'QTZ 898', fecha: '2026-10-16', salida: 16, retorno: 18, destino: 'Cali', ruta: 'BOG-CAL-D1', cliente: 'Ara', cajas: 150, tarifa: 3000000, estado: 'Planificado', tr: 'Makand' }
  ],
  novedades: [], picoPlaca: []
};
const r = (p: string) => responder(p, S, {}, hoy);

describe('furgoncito: preguntas libres de la operación', () => {
  it('"¿qué carros viajan hoy?" dice cuáles y a dónde', () => {
    const t = r('que carros viajan hoy').texto;
    expect(t).toContain('LUN 428 → Cali');
    expect(t).toContain('POLAR 1 → Barranquilla');
    expect(t).not.toContain('QTZ 898');
  });
  it('quiénes salen mañana, con el conductor', () => {
    expect(r('quienes salen mañana').texto).toContain('Javier Baloco');
  });
  it('a dónde van y para qué clientes', () => {
    expect(r('a donde van los carros hoy').texto).toMatch(/Cali.*Barranquilla|Barranquilla.*Cali/);
    expect(r('que clientes tienen viaje hoy').texto).toMatch(/D1/);
  });
  it('quién regresa (el último día del viaje)', () => {
    expect(r('que carros regresan mañana').texto).toContain('PRZ 065');
  });
  it('cuántas cajas y cuánta plata', () => {
    expect(r('cuantas cajas salen hoy').texto).toContain('300 cajas');
    expect(r('cuanto llevamos facturado').texto).toContain('$13.200.000');
  });
  it('un vehículo: dónde está, cuándo vuelve, si está libre', () => {
    expect(r('donde esta la PRZ 065').texto).toContain('está de viaje');
    expect(r('cuando vuelve la PRZ 065').texto).toContain('regresa mañana');
    expect(r('la LUN 428 esta libre mañana').texto).toMatch(/^No/);
    expect(r('la QTZ 898 esta libre hoy').texto).toMatch(/^Sí/);
  });
  it('un conductor: qué hace y si está libre', () => {
    expect(r('que hace orlando hoy').texto).toContain('PRZ 065');
    expect(r('que conductores estan libres hoy').texto).toContain('Pedro');
  });
  it('el que más y el que menos', () => {
    expect(r('que cliente tiene mas viajes').texto).toContain('1. D1');
    expect(r('que carro viaja menos').texto).toContain('1.');
  });
  it('rutas: duración y tarifa', () => {
    expect(r('cuanto dura el viaje a barranquilla').texto).toContain('2 días de viaje');
    expect(r('cual es la tarifa a cali').texto).toContain('$3.000.000');
  });
  it('resumen del día y del mes', () => {
    expect(r('como vamos hoy').texto).toContain('Hoy salen 2 viajes');
    expect(r('como va el mes').texto).toContain('4 viajes');
  });
  it('"¿cómo hago…?" lleva a la explicación, no a buscar viajes', () => {
    expect(r('como agrego un viaje').texto).toContain('viaje extra');
    expect(r('como cancelo un viaje').texto).toContain('Cancelado');
    expect(r('como exporto a excel').texto).toContain('Exportar');
  });
  it('entiende lo escrito rápido o dictado', () => {
    expect(corregirEscritura('q carros salen ai')).toBe('que carros salen hay');
    expect(corregirEscritura('la lun428 esta libre')).toBe('la LUN 428 esta libre');
    expect(r('kien sale mañana').entendio).toBe(true);
  });
  it('charla', () => {
    expect(r('como estas').entendio).toBe(true);
    expect(r('que puedes hacer').texto).toContain('carros salen hoy');
    expect(r('cuantos dias faltan para navidad').texto).toContain('70 días');
  });
});
