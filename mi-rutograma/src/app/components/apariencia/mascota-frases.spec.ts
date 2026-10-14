import { datosDelRutograma, FIESTAS, CONSEJOS, DATOS, TONTERIAS } from './mascota-frases';

describe('datosDelRutograma', () => {
  const hoy = new Date(2026, 9, 14);
  const S = {
    viajes: [
      { fecha: '2026-10-02', destino: 'CALI', cliente: 'Exito', p: 'PRZ 065', cond: 'Moya Carrillo Orlando', cajas: 100, estado: 'Entregado' },
      { fecha: '2026-10-09', destino: 'Cali', cliente: 'Exito', p: 'PRZ 065', cond: 'Moya Carrillo Orlando', cajas: 50, estado: 'Entregado', tipo: 'extra' },
      { fecha: '2026-10-15', destino: 'Medellin', cliente: 'Ara', p: 'LUN 428', cond: 'Sin conductor', cajas: 20, estado: 'Planificado' },
      { fecha: '2026-10-20', destino: 'Cali', cliente: 'Ara', p: 'LUN 428', estado: 'Cancelado' }
    ],
    vehiculos: [{}, {}], conductores: [{}]
  };

  it('cuenta con los datos reales del mes (sin los cancelados)', () => {
    const f = datosDelRutograma(S, hoy).join('\n');
    expect(f).toContain('En octubre llevamos 3 viajes');
    expect(f).toContain('El destino estrella de octubre: Cali, con 2 viajes');
    expect(f).toContain('Moya Carrillo Orlando es quien más viaja este mes: 2 viajes');
    expect(f).toContain('170 cajas');
    expect(f).toContain('Ya van 2 viajes entregados');
    expect(f).toContain('Mañana salen 1 viaje');
    expect(f).toContain('La flota tiene 2 vehículos');
    expect(f).not.toContain('Sin Conductor');
  });

  it('sin viajes no inventa nada', () => {
    expect(datosDelRutograma({ viajes: [] }, hoy)).toEqual([]);
  });

  it('hay muchas frases para escoger', () => {
    expect(CONSEJOS.length).toBeGreaterThan(50);
    expect(DATOS.length).toBeGreaterThan(25);
    expect(Object.keys(FIESTAS).length).toBeGreaterThanOrEqual(15);
    expect(TONTERIAS.length).toBeGreaterThan(90);
  });
});
