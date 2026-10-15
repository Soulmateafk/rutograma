import { responder, contarViaje, normalizarPregunta } from './mascota-respuestas';

const hoy = new Date(2026, 9, 14);
const S = {
  vehiculos: [{ p: 'LUN 428', tr: 'Makand', cond: 'Moya Carrillo Orlando' }, { p: 'POLAR 1', tr: 'Polar' }],
  conductores: [{ nom: 'Moya Carrillo Orlando', placa: 'LUN 428' }],
  rutas: [{ codigo: 'BOG-BAQ-EX', destino: 'Barranquilla' }, { codigo: 'BOG-CAL-D1', destino: 'Cali' }],
  transportadoras: [{ clave: 'makand', nombre: 'Makand SAS' }, { clave: 'polar', nombre: 'Polar' }],
  viajes: [
    { id: 'v1', ruta: 'BOG-BAQ-EX', codigo: 'BOG-BAQ-EX', destino: 'Barranquilla', cliente: 'D1', p: 'LUN 428', placa: 'LUN 428', tr: 'Makand', fecha: '2026-10-16', hora: '08:00', estado: 'Planificado', cajas: 200 },
    { id: 'v2', ruta: 'BOG-CAL-D1', codigo: 'BOG-CAL-D1', destino: 'Cali', p: 'POLAR 1', placa: 'POLAR 1', tr: 'Polar', fecha: '2026-10-15', estado: 'Planificado' },
    { id: 'v3', ruta: 'BOG-CAL-D1', codigo: 'BOG-CAL-D1', destino: 'Cali', p: 'LUN 428', placa: 'LUN 428', tr: 'Makand', fecha: '2026-10-14', estado: 'En ruta', salidaReal: '2026-10-14T12:30:00.000Z' }
  ]
};

describe('responder (pregúntale al furgoncito)', () => {
  it('cuenta cómo va un viaje por ruta y placa', () => {
    const r = responder('qué pasa con el viaje BOG-BAQ-EX de la placa LUN 428', S, {}, hoy);
    expect(r.entendio).toBe(true);
    expect(r.texto).toContain('BOG-BAQ-EX');
    expect(r.texto).toContain('LUN 428');
    expect(r.texto).toContain('Moya Carrillo Orlando');
    expect(r.acciones[0]).toEqual(expect.objectContaining({ tipo: 'viaje', valor: 'v1' }));
  });

  it('cuenta viajes en general', () => {
    const r = responder('cuántos viajes salen mañana', S, {}, hoy);
    expect(r.entendio).toBe(true);
    expect(r.texto).toMatch(/1 viaje/);
  });

  it('lleva a la pantalla o a la guía', () => {
    expect(responder('dónde veo los comparendos', S, {}, hoy).acciones[0].valor).toBe('/comparendos');
    expect(responder('cómo agrego un viaje extra', S, {}, hoy).acciones[0]).toEqual(expect.objectContaining({ tipo: 'tarea', valor: 'viaje-extra' }));
  });

  it('si no entiende ofrece opciones, y lo aprendido lo responde después', () => {
    const r = responder('el chisme de la semana', S, {}, hoy);
    expect(r.entendio).toBe(false);
    expect(r.opciones.length).toBeGreaterThan(0);
    const aprendido = { [normalizarPregunta('el chisme de la semana')]: 'p:presentacion' };
    const r2 = responder('¿El chisme de la semana?', S, aprendido, hoy);
    expect(r2.entendio).toBe(true);
    expect(r2.acciones[0].valor).toBe('/presentacion');
  });

  it('contarViaje dice si ya salió', () => {
    expect(contarViaje(S.viajes[2], S, hoy)).toContain('Va en camino');
  });
});
