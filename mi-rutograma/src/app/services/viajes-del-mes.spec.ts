import { viajesDelMes, buscarViajesDelMes, transportadoraDe } from './viajes-del-mes';

const S = {
  vehiculos: [{ p: 'LUN 428', cond: 'Moya Carrillo Orlando' }, { p: 'POLAR 1' }, { p: 'ARS 100' }],
  viajes: [
    { id: 'a', fecha: '2026-10-02', codigo: 'BOG-CAL-D1', p: 'LUN 428', tr: 'Makand', estado: 'Entregado', cajas: 100 },
    { id: 'b', fecha: '2026-10-05', codigo: 'BOG-MED-EX', p: 'POLAR 1', tr: 'Polar', cond: 'Pérez Gómez Juan', estado: 'Planificado', cajas: 50 },
    { id: 'c', fecha: '2026-10-07', codigo: 'BOG-BAQ-D1', p: 'ARS 100', tr: 'Arsitrans', cond: 'Moya Carrillo Orlando', estado: 'Planificado' },
    { id: 'd', fecha: '2026-11-01', codigo: 'BOG-CAL-D1', p: 'LUN 428', tr: 'Makand' }
  ]
};

describe('viajes del mes (Conductores)', () => {
  const filas = viajesDelMes(S, 2026, 9);

  it('solo trae los del mes y pone el conductor titular si no tiene', () => {
    expect(filas.map(f => f.id)).toEqual(['a', 'b', 'c']);
    expect(filas[0].conductor).toBe('Moya Carrillo Orlando');
  });

  it('buscar por conductor separa por transportadora', () => {
    const r = buscarViajesDelMes(filas, 'orlando moya');
    expect(r.total).toBe(2);
    expect(r.grupos.map(g => g.tr)).toEqual(['Makand', 'Arsitrans']);
  });

  it('buscar por placa', () => {
    expect(buscarViajesDelMes(filas, 'lun428').total).toBe(1);
    expect(buscarViajesDelMes(filas, 'POLAR 1').grupos[0].tr).toBe('Polar');
  });

  it('buscar "polar", "makand" o "arsitrans" deja solo esos', () => {
    expect(buscarViajesDelMes(filas, 'polar').grupos.map(g => g.tr)).toEqual(['Polar']);
    expect(buscarViajesDelMes(filas, 'makand').total).toBe(1);
    const r = buscarViajesDelMes(filas, 'arsitrans moya');
    expect(r.buscaTr).toBe('Arsitrans');
    expect(r.total).toBe(1);
  });

  it('transportadoraDe', () => {
    expect(transportadoraDe({ tr: 'arsi' })).toBe('Arsitrans');
    expect(transportadoraDe({})).toBe('Makand');
  });
});
