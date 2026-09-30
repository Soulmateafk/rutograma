import { Injectable } from '@angular/core';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class SharePointService {

  constructor(private auth: AuthService) {}

  /**
   * Escribe/Sobreescribe el archivo JSON en SharePoint/OneDrive.
   * @param data Objeto con la información a guardar.
   */
  public async spEscribir(data: any): Promise<boolean> {
    const token = await this.auth.getToken();
    if (!token) {
      console.error('No se pudo obtener el token para escribir.');
      return false;
    }

    try {
      const res = await fetch(this.auth.spFileUrl, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      });

      if (!res.ok) {
        console.error('Error al escribir en SP. Status:', res.status, await res.text());
        return false;
      }
      return true;
    } catch (e) {
      console.error('SP write exception:', e);
      return false;
    }
  }

  /**
   * Lee el archivo JSON desde SharePoint/OneDrive.
   * Retorna null si hay error, o un objeto vacío {} si el archivo no existe.
   */
  public async spLeer(): Promise<any> {
    const token = await this.auth.getToken();
    if (!token) return null;

    try {
      const res = await fetch(this.auth.spFileUrl, {
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      // Si el archivo no existe (404), devolvemos un objeto vacío para empezar de cero
      if (res.status === 404) {
        console.warn('El archivo de datos no existe en SharePoint, creando uno nuevo al guardar.');
        return {}; 
      }

      if (!res.ok) {
        console.error('SP read error. Status:', res.status);
        return null;
      }

      // Intentamos procesar el JSON
      return await res.json();
    } catch (e) {
      console.error('SP read exception (posible formato JSON inválido):', e);
      return null;
    }
  }
}