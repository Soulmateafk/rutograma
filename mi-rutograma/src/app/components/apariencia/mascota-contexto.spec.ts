import { placasDichas, conContexto, esSeguimiento } from './mascota-contexto';
import { textoDespachos } from './mascota-despachos';
import { responder } from './mascota-respuestas';

const S = {
  vehiculos: [{ p: 'LUN 428' }, { p: 'PRZ 065' }, { p: 'POLAR 1' }],
  conductores: [{ nom: 'Moya Carrillo Orlando' }, { nom: 'Torres Huerfano Javier' }],
  rutas: [{ cod: 'BOG-CAL-D1', dest: 'Cali' }, { cod: 'BOG-MED-EX', dest: 'Medellin' }],
  viajes: [{ id: 'a', p: 'LUN 428', fecha: '2026-10-15', salida: 15, retorno: 17, destino: 'Cali', cliente: 'D1', estado: 'Planificado' }]
};

describe('placas dichas', () => {
  it('letras separadas, números con palabras y letras mal oídas', () => {
    expect(placasDichas('donde esta la L U N 428', S)).toContain('LUN 428');
    expect(placasDichas('la lun cuatro dos ocho', S)).toContain('LUN 428');
    expect(placasDichas('la lun cuatrocientos veintiocho', S)).toContain('LUN 428');
    expect(placasDichas('cuando vuelve la luna 428', S)).toContain('LUN 428');
    expect(placasDichas('la prz cero seis cinco', S)).toContain('PRZ 065');
  });
  it('no inventa placas', () => {
    expect(placasDichas('que dos carros salen', S)).toBe('que dos carros salen');
    expect(placasDichas('mas de 300 cajas', S)).toBe('mas de 300 cajas');
  });
});

describe('preguntas que siguen a la anterior', () => {
  it('cambia la fecha, la placa o el conductor', () => {
    expect(conContexto('¿y mañana?', 'que carros salen hoy', S)).toBe('que carros salen manana');
    expect(conContexto('y la PRZ 065?', 'donde esta la LUN 428', S)).toBe('donde esta la prz 065');
    expect(conContexto('y javier?', 'que hace orlando hoy', S)).toContain('javier');
    expect(conContexto('y javier?', 'que hace orlando hoy', S)).not.toContain('orlando');
  });
  it('no toma cualquier cosa como seguimiento', () => {
    expect(esSeguimiento('que carros salen hoy')).toBe(false);
    expect(conContexto('gracias', 'que carros salen hoy', S)).toBeNull();
  });
  it('responder usa la anterior', () => {
    const r = responder('y mañana?', S, {}, new Date(2026, 9, 14, 9), { anterior: 'que carros salen hoy' });
    expect(r.entendida).toBe('que carros salen manana');
    expect(r.texto).toContain('LUN 428');
  });
});

describe('despachos', () => {
  const p = { tipo: 'despachos' as const, desde: '2026-10-15', hasta: '2026-10-15', cuando: 'hoy' };
  const data = { registros: [
    { fecha: '2026-10-15', placa: 'LUN 428', destino: 'Cali', horaLlegada: '06:00', horaFinCargue: '07:30', horaSalida: '07:45', minutos: 90 },
    { fecha: '2026-10-15', placa: 'PRZ 065', destino: 'Medellin', horaLlegada: '07:10', horaFinCargue: null, minutos: null }
  ], resumen: { terminados: 1, enCargue: 1, promedioMin: 90, maximoMin: 90, conDemora: 0, totalCajas: 0 } };
  it('resumen, quién carga y una placa', () => {
    expect(textoDespachos(data, { ...p, que: 'resumen' }).texto).toContain('Hoy van 2 despachos');
    expect(textoDespachos(data, { ...p, que: 'cargando' }).texto).toContain('PRZ 065');
    expect(textoDespachos(data, { ...p, que: 'placa', placa: 'LUN 428' }).texto).toContain('Terminó de cargar a las 07:30 (1 h 30 min)');
  });
  it('la pregunta pide los despachos al servidor', () => {
    const r = responder('quien esta cargando', S, {}, new Date(2026, 9, 15, 9));
    expect(r.pedir?.tipo).toBe('despachos');
    expect(r.pedir?.que).toBe('cargando');
  });
});
