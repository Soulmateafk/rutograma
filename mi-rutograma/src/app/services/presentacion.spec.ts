import { metricas, periodoMes, periodoSemana, conclusiones, periodosDisponibles } from './presentacion';

const HOY = new Date(2026, 9, 13);
const S = {
  vehiculos: [{ p: 'LUN 428', tr: 'Makand' }, { p: 'POLAR 2', tr: 'Polar' }],
  conductores: [{ nom: 'Torres Huerfano Javier', veh: 'LUN 428' }],
  viajes: [
    { fecha: '2026-09-07', p: 'LUN 428', cliente: 'D1', tr: 'Makand', estado: 'Entregado', cajas: 100 },
    { fecha: '2026-09-08', p: 'POLAR 2', cliente: 'Ara', tr: 'Polar', estado: 'Entregado', cajas: 50 },
    { fecha: '2026-10-12', p: 'LUN 428', cliente: 'D1', tr: 'Makand', estado: 'Entregado', cajas: 200 },
    { fecha: '2026-10-13', p: 'LUN 428', cliente: 'D1', tr: 'Makand', estado: 'Planificado', cajas: 100 },
    { fecha: '2026-10-14', p: 'LUN 428', cliente: 'Exito', tr: 'Makand', estado: 'Planificado' },
    { fecha: '2026-10-15', p: 'POLAR 2', cliente: 'D1', tr: 'Polar', estado: 'Cancelado', motivoCancelacion: 'Cliente' }
  ],
  quejas: [{ fecha: '2026-10-14' }], comparendos: [], novedades: [{ fecha: '13/10/2026, 7:00 p. m.', resuelta: false }]
};

describe('Modo presentación', () => {
  it('métricas de un mes', () => {
    const m = metricas(S, periodoMes(2026, 9), HOY);
    expect(m.total).toBe(3);
    expect(m.cancelados).toBe(1);
    expect(m.cumplimiento).toBe(50);                 // hasta hoy debían salir 2, salió 1
    expect(m.conductores[0]).toEqual({ nombre: 'Torres Huerfano Javier', n: 3 });
    expect(m.partePropia).toBe(100);
    expect(m.quejas).toBe(1);
    expect(m.novedades).toBe(1);
    expect(m.motivosCancelacion[0].nombre).toBe('Cliente');
  });
  it('semana: serie por día de lunes a domingo', () => {
    const m = metricas(S, periodoSemana('2026-10-14'), HOY);
    expect(m.periodo.desde).toBe('2026-10-12');
    expect(m.serie.length).toBe(7);
    expect(m.serie[0].n).toBe(1);
  });
  it('comparación y conclusiones', () => {
    const a = metricas(S, periodoMes(2026, 8), HOY), b = metricas(S, periodoMes(2026, 9), HOY);
    const c = conclusiones([a, b]);
    expect(c[0]).toContain('subieron 50%');
    expect(c.some(x => x.includes('flota propia'))).toBe(true);
  });
  it('períodos disponibles', () => {
    const d = periodosDisponibles(S, HOY);
    expect(d.meses.map(m => m.etiqueta)).toEqual(['Octubre 2026', 'Septiembre 2026']);
    expect(d.semanas[0].desde).toBe('2026-10-12');
  });
});
