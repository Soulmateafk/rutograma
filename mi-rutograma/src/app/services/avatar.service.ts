import { Injectable, inject, signal, WritableSignal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { API } from '../api-base';

/**
 * Fotos de perfil de las demás cuentas (para "En línea" y "quién está
 * editando"). La presencia solo trae un id corto y la versión de la foto;
 * la foto se pide una sola vez por versión y queda en memoria.
 */
@Injectable({ providedIn: 'root' })
export class AvatarService {
  private http = inject(HttpClient);
  private fotos = new Map<string, WritableSignal<string>>();

  public foto(aid: string, version: string): WritableSignal<string> {
    const clave = aid + ':' + version;
    let s = this.fotos.get(clave);
    if (s) return s;
    s = signal('');
    this.fotos.set(clave, s);
    if (aid && version) {
      firstValueFrom(this.http.get<any>(`${API}/usuarios/avatar/${encodeURIComponent(aid)}`))
        .then(r => { if (typeof r?.foto === 'string' && r.foto.startsWith('data:image/')) s!.set(r.foto); })
        .catch(() => { /* sin foto: queda la inicial */ });
    }
    return s;
  }
}
