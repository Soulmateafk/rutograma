import { responderDatos } from './mascota-datos';

const S = {
  vehiculos: [
    { p: 'LUN 428', cond: 'Torres Huerfano Javier', tipo: 'Turbo', tr: 'Makand', soatVence: '2026-10-20' },
    { p: 'PRZ 065', cond: 'Moya Carrillo Orlando', tipo: 'Sencillo', tr: 'Makand' }
  ],
  conductores: [
    { nom: 'Torres Huerfano Javier', tel: '3001234567', licVence: '2027-01-10' },
    { nom: 'Moya Carrillo Orlando' }
  ],
  rutas: [{ cod: 'BOG-CAL-D1', destino: 'Cali' }],
  viajes: [
    { p: 'LUN 428', fecha: '2026-10-10', salida: 10, retorno: 13, destino: 'Cali', ruta: 'BOG-CAL-D1', cliente: 'D1', estado: 'Entregado' },
    { p: 'LUN 428', fecha: '2026-10-14', salida: 14, retorno: 17, destino: 'Cali', ruta: 'BOG-CAL-D1', cliente: 'D1', estado: 'En ruta' },
    { p: 'LUN 428', fecha: '2026-10-12', salida: 12, retorno: 14, destino: 'Cali', ruta: 'BOG-CAL-D1', cliente: 'D1', estado: 'En ruta', salidaReal: '2026-10-12T06:00' },
    { p: 'PRZ 065', fecha: '2026-10-12', salida: 12, retorno: 13, destino: 'Tunja', ruta: 'BOG-TUN', cliente: 'Exito', estado: 'Entregado' }
  ],
  novedades: [
    { titulo: 'Llanta pinchada', resuelta: false },
    { titulo: 'Llanta pinchada', resuelta: false },
    { titulo: 'Retraso', resuelta: true }
  ]
};
const ahora = new Date(2026, 9, 15, 10, 0);
const r = (p: string, extra = {}) => responderDatos(p, S, extra, ahora);

describe('responderDatos', () => {
  it('dice el teléfono de un conductor', () => {
    expect(r('cual es el telefono de javier torres')?.texto).toContain('3001234567');
  });
  it('las preguntas de viajes las deja para mascota-consulta', () => {
    expect(r('que cliente tiene mas viajes')).toBeNull();
  });
  it('avisa si la placa del pico y placa no existe', () => {
    expect(r('la XYZ 999 tiene pico y placa')?.texto).toContain('No encontré la placa XYZ 999');
  });
  it('licencia sin fecha se dice claro', () => {
    expect(r('licencia de orlando')?.texto).toContain('sin fecha registrada');
  });
  it('en ruta, un vehículo una sola vez', () => {
    const t = r('quien va en ruta')?.texto || '';
    expect(t.match(/LUN 428/g)?.length).toBe(1);
  });
  it('novedades sin repetir títulos y sin las resueltas', () => {
    const t = r('que novedades hay')?.texto || '';
    expect(t.match(/Llanta pinchada/g)?.length).toBe(1);
    expect(t).not.toContain('Retraso');
  });
  it('la acción lleva a la pantalla', () => {
    const a = r('soat de la LUN 428')?.acciones?.[0];
    expect(a?.valor).toContain('/hoja-de-vida/');
  });
  it('si no es de datos devuelve null', () => {
    expect(r('como agrego un viaje extra')).toBeNull();
  });
});
