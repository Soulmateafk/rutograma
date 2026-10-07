// ============================================================
// MAPA DE DESTINOS — dónde queda cada destino y cuántos viajes van a cada
// uno en el mes. Las coordenadas salen de una tabla de ciudades y
// municipios de Colombia (aproximadas, al centro del municipio); si un
// destino no está en la tabla, la oficina lo ubica una vez con un clic en
// el mapa y queda guardado para todos (configuración compartida
// "ubicaciones"). "Medellin/La Estrella" se ubica en La Estrella (lo más
// específico que se conozca). Funciones puras.
// ============================================================

export interface Punto { lat: number; lng: number; }

export const ORIGEN = { nombre: 'Bogotá', lat: 4.711, lng: -74.072 };

export const limpiarLugar = (t: any): string =>
  String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9 ]+/g, ' ').trim().replace(/\s+/g, ' ');

// [nombre, lat, lng] — aproximadas al centro urbano.
const CIUDADES: [string, number, number][] = [
  ['Bogota', 4.711, -74.072], ['Soacha', 4.579, -74.217], ['Mosquera', 4.706, -74.230], ['Funza', 4.716, -74.211],
  ['Madrid', 4.732, -74.264], ['Chia', 4.861, -74.058], ['Cajica', 4.918, -74.028], ['Tocancipa', 4.965, -73.912],
  ['Cota', 4.810, -74.103], ['Siberia', 4.775, -74.155], ['Zipaquira', 5.022, -74.004], ['Facatativa', 4.814, -74.354],
  ['Fusagasuga', 4.337, -74.364], ['Girardot', 4.303, -74.803],
  ['Medellin', 6.244, -75.581], ['La Estrella', 6.158, -75.643], ['Girardota', 6.377, -75.444], ['Guarne', 6.280, -75.443],
  ['Envigado', 6.171, -75.591], ['Itagui', 6.184, -75.599], ['Bello', 6.337, -75.558], ['Sabaneta', 6.151, -75.616],
  ['Rionegro', 6.155, -75.374], ['Caucasia', 7.986, -75.193], ['Apartado', 7.883, -76.626], ['Turbo', 8.093, -76.728],
  ['Cali', 3.452, -76.532], ['Palmira', 3.539, -76.303], ['Jamundi', 3.262, -76.539], ['Yumbo', 3.585, -76.495],
  ['Buenaventura', 3.882, -77.031], ['Tulua', 4.084, -76.195], ['Buga', 3.901, -76.297], ['Cartago', 4.746, -75.912],
  ['Barranquilla', 10.964, -74.796], ['Soledad', 10.917, -74.765], ['Malambo', 10.859, -74.774], ['Sabanalarga', 10.632, -74.922],
  ['Cartagena', 10.391, -75.479], ['Magangue', 9.241, -74.754], ['El Carmen de Bolivar', 9.718, -75.121],
  ['Santa Marta', 11.241, -74.205], ['Cienaga', 11.007, -74.247], ['Fundacion', 10.521, -74.185],
  ['Valledupar', 10.463, -73.253], ['Aguachica', 8.310, -73.616], ['Riohacha', 11.544, -72.907], ['Maicao', 11.378, -72.239],
  ['Monteria', 8.748, -75.881], ['Sincelejo', 9.304, -75.397],
  ['Bucaramanga', 7.119, -73.123], ['Floridablanca', 7.064, -73.090], ['Giron', 7.069, -73.169], ['Barrancabermeja', 7.065, -73.854],
  ['Cucuta', 7.894, -72.507], ['Ocana', 8.237, -73.356],
  ['Tunja', 5.535, -73.367], ['Duitama', 5.827, -73.033], ['Sogamoso', 5.714, -72.933], ['Chiquinquira', 5.617, -73.819], ['Puerto Boyaca', 5.976, -74.589],
  ['Ibague', 4.438, -75.232], ['Espinal', 4.149, -74.884], ['Honda', 5.204, -74.736], ['La Dorada', 5.454, -74.664],
  ['Neiva', 2.936, -75.281], ['Pitalito', 1.853, -76.051], ['Florencia', 1.614, -75.606],
  ['Villavicencio', 4.142, -73.627], ['Acacias', 3.987, -73.765], ['Granada', 3.546, -73.706], ['Yopal', 5.337, -72.395], ['Aguazul', 5.173, -72.555],
  ['Pereira', 4.813, -75.696], ['Dosquebradas', 4.839, -75.667], ['Manizales', 5.069, -75.517], ['Armenia', 4.533, -75.681],
  ['Pasto', 1.214, -77.281], ['Ipiales', 0.830, -77.644], ['Popayan', 2.444, -76.614], ['Mocoa', 1.149, -76.646], ['Puerto Asis', 0.505, -76.495],
  ['Quibdo', 5.692, -76.658], ['Arauca', 7.084, -70.759], ['San Jose del Guaviare', 2.570, -72.642], ['Leticia', -4.215, -69.940],
  // Regiones que se usan como destino: se ubican en su ciudad principal (se pueden mover).
  ['Eje Cafetero', 4.813, -75.696], ['Costa', 10.964, -74.796], ['Llanos', 4.142, -73.627], ['Uraba', 7.883, -76.626]
];
const TABLA = new Map(CIUDADES.map(([n, lat, lng]) => [limpiarLugar(n), { lat, lng }]));

/** Partes del destino de la más específica a la más general ("Medellin/La Estrella" -> La Estrella, Medellin). */
function partes(destino: string): string[] {
  const trozos = String(destino || '').split(/[\/,\-–>]+/).map(limpiarLugar).filter(Boolean);
  return [...trozos].reverse();
}

/**
 * Dónde queda un destino: primero lo que la oficina ubicó a mano, luego la
 * tabla. null si no se conoce.
 */
export function ubicarDestino(destino: string, ubicaciones: any[] = []): (Punto & { fuente: 'propia' | 'tabla' }) | null {
  const clave = limpiarLugar(destino);
  if (!clave) return null;
  const propia = (ubicaciones || []).find((u: any) => limpiarLugar(u.nombre) === clave);
  if (propia && isFinite(Number(propia.lat)) && isFinite(Number(propia.lng))) return { lat: Number(propia.lat), lng: Number(propia.lng), fuente: 'propia' };
  const directa = TABLA.get(clave);
  if (directa) return { ...directa, fuente: 'tabla' };
  for (const p of partes(destino)) {
    const t = TABLA.get(p);
    if (t) return { ...t, fuente: 'tabla' };
  }
  return null;
}

export interface ResumenDestino {
  destino: string;
  viajes: number;
  clientes: string[];
  placas: string[];
  punto: (Punto & { fuente: 'propia' | 'tabla' }) | null;
}

/** Viajes del mes por destino (sin cancelados), de más a menos. mes: 0-11. */
export function resumenDestinos(S: any, anio: number, mes: number): ResumenDestino[] {
  const prefijo = `${anio}-${String(mes + 1).padStart(2, '0')}`;
  const grupos = new Map<string, { destino: string; viajes: number; clientes: Map<string, number>; placas: Set<string> }>();
  (S?.viajes || []).forEach((v: any) => {
    if (!String(v.fecha || '').startsWith(prefijo) || v.estado === 'Cancelado') return;
    const ruta = (S?.rutas || []).find((r: any) => limpiarLugar(r.cod || r.codigo) === limpiarLugar(v.ruta || v.codigo));
    const destino = String(v.destino && v.destino !== 'No definido' ? v.destino : (ruta?.dest || ruta?.destino || '')).trim();
    if (!destino) return;
    const clave = limpiarLugar(destino);
    const g = grupos.get(clave) || { destino, viajes: 0, clientes: new Map<string, number>(), placas: new Set<string>() };
    g.viajes++;
    const cliente = String(v.cliente || v.cli || '').trim();
    if (cliente && cliente !== 'No definido') g.clientes.set(cliente, (g.clientes.get(cliente) || 0) + 1);
    const placa = String(v.placaReal || v.p || v.placa || '').toUpperCase().trim();
    if (placa) g.placas.add(placa);
    grupos.set(clave, g);
  });
  return [...grupos.values()].map(g => ({
    destino: g.destino,
    viajes: g.viajes,
    clientes: [...g.clientes.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c),
    placas: [...g.placas].sort(),
    punto: ubicarDestino(g.destino, S?.ubicaciones || [])
  })).sort((a, b) => b.viajes - a.viajes);
}
