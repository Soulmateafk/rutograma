import { nombreDePila } from './nombre-de-pila';

describe('nombreDePila', () => {
  it('toma el nombre después de los dos apellidos', () => {
    expect(nombreDePila('Moya Carrillo Orlando')).toBe('Orlando');
    expect(nombreDePila('Baloco Chamorro Javier Manuel')).toBe('Javier');
  });
  it('con dos palabras toma la primera', () => {
    expect(nombreDePila('Pedro Pérez')).toBe('Pedro');
  });
  it('arregla las mayúsculas y los espacios de más', () => {
    expect(nombreDePila('  MARTÍNEZ  MARTÍNEZ BRAYAN ANDRES ')).toBe('Brayan');
  });
  it('sin nombre devuelve vacío', () => {
    expect(nombreDePila('')).toBe('');
  });
});
