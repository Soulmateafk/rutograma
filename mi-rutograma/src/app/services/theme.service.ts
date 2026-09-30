import { Injectable } from '@angular/core';

/**
 * ThemeService — controla el modo Claro/Oscuro de toda la app.
 *
 * Cómo funciona: agrega o quita la clase "tema-claro" en el <body> del
 * documento. Las variables de color (ver theme-variables.css) cambian de
 * valor según esa clase esté presente o no — así CUALQUIER componente que
 * use esas variables (en vez de colores fijos como "#0f172a") cambia de
 * apariencia automáticamente, sin que ese componente sepa nada del tema.
 *
 * IMPORTANTE — esto es la BASE del sistema, no el trabajo completo. Para
 * que un componente de verdad reaccione al cambio de tema, sus estilos
 * tienen que usar las variables (var(--color-fondo), etc.) en vez de
 * colores fijos. Ese reemplazo hay que hacerlo archivo por archivo — ver
 * /areas/rutograma-makand.md para la lista de qué falta.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly CLAVE_LOCALSTORAGE = 'rutograma_tema';
  private readonly CLASE_TEMA_CLARO = 'tema-claro';

  public temaActual: 'claro' | 'oscuro' = 'oscuro';

  constructor() {
    this.cargarTemaGuardado();
  }

  private cargarTemaGuardado(): void {
    try {
      const guardado = localStorage.getItem(this.CLAVE_LOCALSTORAGE);
      this.temaActual = guardado === 'claro' ? 'claro' : 'oscuro';
    } catch {
      this.temaActual = 'oscuro';
    }
    this.aplicarClaseAlBody();
  }

  private aplicarClaseAlBody(): void {
    if (typeof document === 'undefined') return; // por si corre fuera del navegador (SSR)
    if (this.temaActual === 'claro') {
      document.body.classList.add(this.CLASE_TEMA_CLARO);
    } else {
      document.body.classList.remove(this.CLASE_TEMA_CLARO);
    }
  }

  public alternarTema(): void {
    this.temaActual = this.temaActual === 'claro' ? 'oscuro' : 'claro';
    try {
      localStorage.setItem(this.CLAVE_LOCALSTORAGE, this.temaActual);
    } catch {
      // si falla el guardado, el tema igual se aplica para esta sesión —
      // solo no se recordará la próxima vez que se abra la app.
    }
    this.aplicarClaseAlBody();
  }
}
