// ============================================================
// BARRA DE PROGRESO (línea fina del color principal arriba de todo, como
// en YouTube): avanza mientras se cambia de pantalla o se guarda algo, y
// se completa al terminar. Funciones sueltas (sin Angular) para poder
// usarlas desde el interceptor, fetchAutenticado y el router.
// ============================================================
let enCurso = 0;
let reloj: any = null;

function barra(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  let el = document.getElementById('ap-progreso');
  if (!el) {
    el = document.createElement('div');
    el.id = 'ap-progreso';
    el.setAttribute('aria-hidden', 'true');
    document.body.appendChild(el);
  }
  return el;
}

export function iniciarProgreso(): void {
  const el = barra();
  if (!el) return;
  enCurso++;
  if (enCurso > 1) return;
  clearTimeout(reloj);
  el.className = '';
  void el.offsetWidth;            // reinicia la animación
  el.className = 'activo';
}

export function terminarProgreso(): void {
  const el = barra();
  if (!el || enCurso === 0) return;
  enCurso = Math.max(0, enCurso - 1);
  if (enCurso > 0) return;
  el.className = 'activo listo';
  clearTimeout(reloj);
  reloj = setTimeout(() => { if (enCurso === 0) el.className = ''; }, 650);
}
