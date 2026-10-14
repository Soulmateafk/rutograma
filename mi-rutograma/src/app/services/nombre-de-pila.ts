/**
 * Nombre para saludar a un conductor. En la empresa los nombres se guardan
 * con los apellidos primero ("Moya Carrillo Orlando"), así que con 3 o más
 * palabras el nombre de pila es la tercera; con 2 se toma la primera
 * ("Pedro Pérez"). Si viene en mayúsculas, se deja como "Orlando".
 */
export function nombreDePila(nombre: string): string {
  const partes = String(nombre || '').trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return '';
  const elegido = partes.length >= 3 ? partes[2] : partes[0];
  return elegido.charAt(0).toLocaleUpperCase('es') + elegido.slice(1).toLocaleLowerCase('es');
}
