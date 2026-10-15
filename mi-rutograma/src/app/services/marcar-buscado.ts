/**
 * MARCAR LO BUSCADO: al llegar desde el buscador (Ctrl+K), la mascota o la
 * búsqueda hablada, la pantalla baja hasta lo que se buscó y lo marca con
 * el mismo borde de las guías (el resto se oscurece) y un letrerito
 * "Aquí está". Después de un momento (o al tocar) sigue con lo de siempre,
 * por ejemplo abrir su detalle. Si el elemento no aparece, sigue de una.
 */

import { zoomPagina } from '../zoom';

let activo: (() => void) | null = null;

export function marcarBuscado(buscar: () => Element | null, texto: string, alTerminar?: () => void, ms = 2600): void {
  if (typeof document === 'undefined') { alTerminar?.(); return; }
  activo?.();                          // solo una marca a la vez
  const inicio = Date.now();
  const esperar = () => {
    const el = buscar() as HTMLElement | null;
    if (!el) {
      if (Date.now() - inicio < 1500) { setTimeout(esperar, 120); return; }
      alTerminar?.();
      return;
    }
    marcar(el, texto, alTerminar, ms);
  };
  esperar();
}

function marcar(el: HTMLElement, texto: string, alTerminar: (() => void) | undefined, ms: number): void {
  const sinAnimaciones = document.documentElement.classList.contains('sin-animaciones');
  el.scrollIntoView({ behavior: sinAnimaciones ? 'auto' : 'smooth', block: 'center', inline: 'nearest' });
  const letrero = document.createElement('div');
  letrero.className = 'buscado-letrero';
  letrero.textContent = `🔎 Aquí está: ${texto}`;
  // El "hueco": un recuadro encima de lo buscado con borde naranja; su sombra
  // gigante oscurece todo lo demás (sirve igual para filas de tabla y tarjetas).
  const hueco = document.createElement('div');
  hueco.className = 'buscado-hueco';
  let terminado = false;
  let reloj: any = null;
  const ubicar = () => {
    // Con el tamaño de letra de Apariencia la página tiene zoom: las medidas se dividen por él.
    const z = zoomPagina();
    const b = el.getBoundingClientRect();
    const r = { left: b.left / z, top: b.top / z, width: b.width / z, height: b.height / z, bottom: b.bottom / z };
    const ancho = window.innerWidth / z;
    hueco.style.left = `${r.left - 4}px`; hueco.style.top = `${r.top - 4}px`;
    hueco.style.width = `${r.width + 8}px`; hueco.style.height = `${r.height + 8}px`;
    letrero.style.left = `${Math.max(8, Math.min(ancho - letrero.offsetWidth - 8, r.left + r.width / 2 - letrero.offsetWidth / 2))}px`;
    letrero.style.top = `${r.top > 60 ? r.top - 44 : r.bottom + 12}px`;
  };
  const terminar = () => {
    if (terminado) return;
    terminado = true;
    activo = null;
    clearTimeout(reloj);
    el.classList.remove('buscado-foco');
    letrero.remove();
    hueco.remove();
    window.removeEventListener('scroll', ubicar, true);
    window.removeEventListener('resize', ubicar);
    document.removeEventListener('pointerdown', terminar, true);
    document.removeEventListener('keydown', terminar, true);
    alTerminar?.();
  };
  activo = terminar;
  // Se espera a que termine de bajar para marcar (si no, el borde se ve "volando").
  setTimeout(() => {
    if (terminado) return;
    el.classList.add('buscado-foco');
    document.body.appendChild(hueco);
    document.body.appendChild(letrero);
    ubicar();
    window.addEventListener('scroll', ubicar, true);
    window.addEventListener('resize', ubicar);
    document.addEventListener('pointerdown', terminar, true);
    document.addEventListener('keydown', terminar, true);
    reloj = setTimeout(terminar, ms);
  }, sinAnimaciones ? 50 : 450);
}
