import { interpretar, filtrarViajes } from './buscar-hablado';

// Flota y viajes de ejemplo. "Hoy" es martes 13 de octubre de 2026.
const HOY = new Date(2026, 9, 13);
const S = {
  vehiculos: [
    { p: 'LUN 428', tipo: 'Furgon refrigerado', tr: 'Makand' },
    { p: 'NOW 031', tipo: 'Furgon refrigerado', tr: 'Makand' },
    { p: 'POLAR 2', tr: 'Polar' }
  ],
  conductores: [
    { nom: 'Torres Huerfano Javier', veh: 'LUN 428' },
    { nom: 'Moya Carrillo Orlando', veh: 'NOW 031' }
  ],
  rutas: [
    { cod: 'BOG-CAL-D1', dest: 'Cali', clientes: 'D1, Cali' },
    { cod: 'BOG-BAQ-ARA', dest: 'Barranquilla', clientes: 'Ara, Barranquilla.' },
    { cod: 'BOG-MED-EX', dest: 'Medellin', clientes: 'Exito, Medellin.' }
  ],
  viajes: [
    { id: 1, fecha: '2026-10-06', p: 'LUN 428', ruta: 'BOG-CAL-D1', destino: 'Cali', cliente: 'D1', tr: 'Makand', estado: 'Entregado', hora: '06:00', cajas: 500 },
    { id: 2, fecha: '2026-10-07', p: 'NOW 031', ruta: 'BOG-BAQ-ARA', destino: 'Barranquilla', cliente: 'Ara', tr: 'Makand', estado: 'Entregado', hora: '15:00', cajas: 300 },
    { id: 3, fecha: '2026-10-13', p: 'LUN 428', ruta: 'BOG-MED-EX', destino: 'Medellin', cliente: 'Exito', tr: 'Makand', estado: 'En ruta', hora: '07:30', cajas: 650 },
    { id: 4, fecha: '2026-10-14', p: 'POLAR 2', ruta: 'BOG-CAL-D1', destino: 'Cali', cliente: 'D1', tr: 'Polar', estado: 'Programado', tipo: 'extra', hora: '16:00', cajas: 200 },
    { id: 5, fecha: '2026-10-16', p: 'NOW 031', ruta: 'BOG-CAL-D1', destino: 'Cali', cliente: 'D1', tr: 'Makand', estado: 'Programado', hora: '05:00', cajas: 600 },
    { id: 6, fecha: '2026-09-18', p: 'LUN 428', ruta: 'BOG-BAQ-ARA', destino: 'Barranquilla', cliente: 'Ara', tr: 'Makand', estado: 'Entregado', hora: '06:00', cajas: 400 },
    { id: 7, fecha: '2026-10-15', p: 'NOW 031', ruta: 'BOG-MED-EX', destino: 'Medellin', cliente: 'Exito', tr: 'Makand', estado: 'Cancelado', cajas: 100 }
  ]
};
const ids = (frase: string) => filtrarViajes(interpretar(frase, S, HOY).filtros, S, v => v.hora || '', HOY).map((v: any) => v.id).sort((a: number, b: number) => a - b);

describe('Búsqueda hablada', () => {
  it('fechas relativas', () => {
    expect(ids('hoy')).toEqual([3]);
    expect(ids('mañana')).toEqual([4]);
    expect(ids('la semana pasada')).toEqual([1, 2]);
    expect(ids('esta semana')).toEqual([3, 4, 5]);
    expect(ids('el martes pasado')).toEqual([1]);
    expect(ids('el próximo viernes')).toEqual([5]);
    expect(ids('en septiembre')).toEqual([6]);
    expect(ids('del 6 al 7 de octubre')).toEqual([1, 2]);
    expect(ids('13/10')).toEqual([3]);
  });
  it('placas, conductores (aunque estén mal escritos) y destinos', () => {
    expect(ids('LUN 428')).toEqual([1, 3, 6]);
    expect(ids('viajes de torez')).toEqual([1, 3, 6]);
    expect(ids('moya a cali')).toEqual([5]);
    expect(ids('a baq')).toEqual([2, 6]);
    expect(ids('BOG-MED-EX')).toEqual([3]);
  });
  it('"LUN 428" no se confunde con "lunes"', () => {
    const it = interpretar('viajes de LUN 428 esta semana', S, HOY);
    expect(it.entendidos.some(e => e.tipo === 'Día')).toBe(false);
    expect(ids('viajes de LUN 428 esta semana')).toEqual([3]);
  });
  it('estados, tipos, cajas, horario y negaciones', () => {
    expect(ids('entregados')).toEqual([1, 2, 6]);
    expect(ids('por salir')).toEqual([4, 5]);
    expect(ids('cancelados')).toEqual([7]);
    expect(ids('extras')).toEqual([4]);
    expect(ids('más de 500 cajas')).toEqual([3, 5]);
    expect(ids('en la tarde')).toEqual([2, 4]);
    expect(ids('antes de las 7')).toEqual([1, 5, 6]);
    expect(ids('D1 sin polar')).toEqual([1, 5]);
    expect(ids('terceros')).toEqual([4]);
  });
  it('orden y cantidad', () => {
    expect(ids('último viaje de LUN 428')).toEqual([3]);
    expect(ids('próximo viaje de moya')).toEqual([5]);
    expect(interpretar('cuántos viajes a cali', S, HOY).pregunta).toBe('contar');
  });
  it('lo que no entiende no deja la búsqueda vacía', () => {
    const r: any = filtrarViajes(interpretar('cali xyzzy', S, HOY).filtros, S, v => v.hora || '', HOY);
    expect(r.length).toBe(3);
    expect(r.ignoradas).toEqual(['xyzzy']);
  });
});
