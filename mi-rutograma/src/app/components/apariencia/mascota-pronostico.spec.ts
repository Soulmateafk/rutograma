import { responder } from './mascota-respuestas';

describe('mascota: pronóstico', () => {
  const S: any = { viajes: [], vehiculos: [], conductores: [], rutas: [], mes: 9, anio: 2026 };
  const hoy = new Date(2026, 9, 16);
  it.each([
    'pronóstico',
    'cuántos viajes vienen el próximo mes',
    'cuántos cupos necesito el mes que viene',
    'dónde veo la proyección del próximo mes',
    'pronostico de noviembre'
  ])('"%s" lleva a Pronóstico', (q) => {
    const r = responder(q, S, {}, hoy);
    expect(r.acciones.map((a: any) => a.valor)).toContain('/pronostico');
  });
});
