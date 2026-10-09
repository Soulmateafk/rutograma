/**
 * Achica una imagen escogida por la persona (foto de perfil, fondo) antes
 * de guardarla: así pesa poco. cuadrada = recorta al centro (foto de perfil).
 */
export function reducirImagen(archivo: File, lado: number, calidad: number, cuadrada: boolean): Promise<string> {
  return new Promise((resolver, fallar) => {
    if (!archivo.type.startsWith('image/')) { fallar(new Error('No es una imagen')); return; }
    const url = URL.createObjectURL(archivo);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight;
      if (cuadrada) { const m = Math.min(sw, sh); sx = (sw - m) / 2; sy = (sh - m) / 2; sw = sh = m; }
      const escala = Math.min(1, lado / Math.max(sw, sh));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(sw * escala)); c.height = Math.max(1, Math.round(sh * escala));
      const ctx = c.getContext('2d');
      if (!ctx) { fallar(new Error('Sin canvas')); return; }
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height);   // fondo blanco para PNG transparentes
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
      resolver(c.toDataURL('image/jpeg', calidad));
    };
    img.onerror = () => { URL.revokeObjectURL(url); fallar(new Error('Imagen dañada')); };
    img.src = url;
  });
}
