/**
 * El Resumen sale a cada cuenta de oficina la primera vez de cada día
 * (ver pages/auth.guard). Se recuerda por cuenta y por equipo.
 */
const CLAVE = 'resumen-visto:';

function hoy(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function resumenPendienteHoy(email: string): boolean {
  if (!email) return false;
  try { return localStorage.getItem(CLAVE + email.toLowerCase()) !== hoy(); } catch { return false; }
}

export function marcarResumenVisto(email: string): void {
  if (!email) return;
  try { localStorage.setItem(CLAVE + email.toLowerCase(), hoy()); } catch { /* sin almacenamiento */ }
}
