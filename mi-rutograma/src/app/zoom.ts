// ============================================================
// ZOOM DE LA PÁGINA (tamaño de letra de Apariencia: zoom en <html>).
// El navegador da las posiciones del mouse y de los elementos
// (getBoundingClientRect, clientX, innerWidth) en píxeles de la pantalla,
// pero lo que se posiciona con top/left dentro de la página se vuelve a
// multiplicar por el zoom. Para que un cuadro quede justo encima de algo
// (guías, calendarios, ventanitas), esas medidas se dividen por esto.
// ============================================================
export function zoomPagina(): number {
  if (typeof document === 'undefined') return 1;
  const html = document.documentElement as any;
  const z = Number(html.currentCSSZoom) || parseFloat(getComputedStyle(html).zoom) || 1;
  return z > 0 ? z : 1;
}
