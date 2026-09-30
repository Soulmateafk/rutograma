import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root' // Esto hace que el servicio sea global y no tengas que declararlo en ningún lado
})
export class ModalService {

  public abrir(id: string): void {
    const el = document.getElementById(id);
    if (el) el.classList.remove('hide');
  }

  public cerrar(id: string): void {
    const el = document.getElementById(id);
    if (el) el.classList.add('hide');
  }
}