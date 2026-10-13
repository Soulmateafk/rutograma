// ============================================================
// DETALLE DE UN CAMBIO EN PALABRAS (Aprobaciones → "Ver detalle")
// En vez de los datos crudos que viajan al servidor, arma una tabla
// "Antes → Ahora" con nombres que cualquiera entiende ("Vehículo",
// "Fecha de salida", "Conductor"), comparando con lo que hay guardado hoy.
// Lo que cambió va resaltado; lo técnico (ids, versiones...) no se muestra.
// ============================================================

export interface FilaDetalle { etiqueta: string; antes: string; ahora: string; cambio: boolean; }
export interface BloqueDetalle { titulo: string; icono: string; tipo: 'nuevo' | 'cambio' | 'borrar' | 'accion'; filas: FilaDetalle[]; nota?: string; }

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const pegada = (p: any) => String(p ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

const CAMPOS_VIAJE: Array<[string[], string]> = [
  [['ruta', 'codigo'], 'Ruta'], [['destinoReal', 'destino'], 'Destino'], [['cliente', 'cli'], 'Cliente'], [['cli2'], 'Segundo cliente'], [['dest2'], 'Segundo destino'],
  [['fecha'], 'Fecha de salida'], [['hora'], 'Hora de salida'], [['retorno'], 'Día en que regresa'], [['p', 'placa'], 'Vehículo'], [['tr', 'transportadora'], 'Transportadora'],
  [['cond'], 'Conductor'], [['condTemporal'], 'Conductor de reemplazo'], [['estado'], 'Estado'], [['tipo'], 'Tipo de viaje'], [['cajas'], 'Cajas'], [['cajas2'], 'Cajas (2.ª entrega)'],
  [['pesoKg', 'peso'], 'Peso (kg)'], [['volM3', 'volumen'], 'Volumen (m³)'], [['prod'], 'Producto'], [['manif', 'manifiesto'], 'Manifiesto'], [['tarifa'], 'Tarifa'], [['costo'], 'Costo'],
  [['prioridad'], 'Prioridad'], [['split'], 'Dividido (split)'], [['splitRazon'], 'Motivo del split'], [['motivoCancelacion'], 'Motivo de cancelación'],
  [['salidaReal'], 'Salió de verdad'], [['llegadaReal'], 'Llegó de verdad'], [['fechaEntrega'], 'Fecha de entrega'], [['obs'], 'Observaciones'], [['motivoCambio'], 'Motivo del cambio']
];
const CAMPOS_VEHICULO: Array<[string[], string]> = [
  [['p', 'placa'], 'Placa'], [['tipo', 't'], 'Tipo'], [['cajas', 'cap'], 'Capacidad (cajas)'], [['maxKg'], 'Peso máximo (kg)'], [['tr', 'transportadora'], 'Transportadora'],
  [['categoria'], 'Categoría'], [['est', 'estado'], 'Estado'], [['cond', 'conductor'], 'Conductor'], [['soatVence'], 'SOAT vence'], [['tecnoVence'], 'Tecnomecánica vence'],
  [['mantInicio'], 'Mantenimiento desde'], [['mantFin'], 'Mantenimiento hasta'], [['mantMotivo', 'motivoMant'], 'Motivo del mantenimiento'], [['um'], 'Último mantenimiento'], [['obs'], 'Observaciones']
];
const CAMPOS_CONDUCTOR: Array<[string[], string]> = [
  [['nom', 'nombre'], 'Nombre'], [['ced', 'cedula'], 'Cédula'], [['tel', 'telefono'], 'Teléfono'], [['veh', 'placa'], 'Vehículo'], [['est', 'estado'], 'Estado'],
  [['lic', 'licencia'], 'Licencia'], [['licVence', 'vencLicencia'], 'Licencia vence'], [['obs'], 'Observaciones']
];
const CAMPOS_RUTA: Array<[string[], string]> = [
  [['cod', 'codigo'], 'Código'], [['dest', 'destino'], 'Destino'], [['clientes'], 'Clientes'], [['diasTrans'], 'Días de tránsito'], [['dias'], 'Días y horas de salida'], [['obs'], 'Observaciones']
];
const CAMPOS_NOVEDAD: Array<[string[], string]> = [[['tipo'], 'Tipo'], [['titulo'], 'Título'], [['desc', 'descripcion'], 'Qué pasó']];
const NOMBRES_CONFIG: Record<string, string> = { transportadoras: 'Transportadoras', cuposExt: 'Cupos de Configuración', festivos: 'Festivos', reglasAsignacion: 'Reglas por cliente o ruta', picoPlaca: 'Pico y placa', anuncios: 'Pizarra de anuncios', comparendos: 'Comparendos', quejas: 'Quejas de clientes', ubicaciones: 'Ubicaciones del mapa', celebraciones: 'Celebraciones' };

/** Valor legible: fechas "mar 13 oct 2026", sí/no, listas, horarios por día. */
export function legible(v: any, etiqueta = ''): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Sí' : 'No';
  if (etiqueta === 'Tipo de viaje') return v === 'extra' ? 'Viaje extra' : String(v);
  if (etiqueta === 'Días y horas de salida') {
    let d = v; if (typeof d === 'string') { try { d = JSON.parse(d); } catch { return String(v); } }
    if (d && typeof d === 'object') {
      const orden = ['lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom'];
      const txt = orden.filter(k => d[k]?.checked || d[k] === true).map(k => `${k}${d[k]?.hora ? ' ' + d[k].hora : ''}`).join(', ');
      return txt || 'Ningún día';
    }
  }
  const s = String(v);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
  if (m) {
    const f = new Date(+m[1], +m[2] - 1, +m[3]);
    return `${DIAS[f.getDay()]} ${+m[3]} ${MESES[+m[2] - 1]} ${m[1]}${m[4] ? ` ${m[4]}:${m[5]}` : ''}`;
  }
  if (Array.isArray(v)) return v.length ? `${v.length} elemento${v.length === 1 ? '' : 's'}` : 'ninguno';
  if (typeof v === 'object') return '(varios datos)';
  if (typeof v === 'number') return v.toLocaleString('es-CO');
  return s;
}

const valorDe = (obj: any, claves: string[]) => { for (const k of claves) if (obj && obj[k] !== undefined && obj[k] !== null && obj[k] !== '') return obj[k]; return undefined; };
const igual = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Compara lo pedido con lo que hay hoy, campo por campo. */
function comparar(campos: Array<[string[], string]>, antes: any, ahora: any, soloLlenos: boolean): FilaDetalle[] {
  return campos.map(([claves, etiqueta]) => {
    const a = antes ? legible(valorDe(antes, claves), etiqueta) : '—';
    const vAhora = valorDe(ahora, claves);
    // Si el cambio no trae ese dato, queda como estaba.
    const n = vAhora === undefined && antes ? a : legible(vAhora, etiqueta);
    return { etiqueta, antes: a, ahora: n, cambio: !!antes && !igual(a, n) };
  }).filter(f => soloLlenos ? f.ahora !== '—' : (f.ahora !== '—' || f.antes !== '—'));
}

function bloque(titulo: string, icono: string, campos: Array<[string[], string]>, antes: any, ahora: any): BloqueDetalle {
  const filas = comparar(campos, antes, ahora, !antes);
  const nuevo = !antes;
  return { titulo, icono, tipo: nuevo ? 'nuevo' : 'cambio', filas, nota: nuevo ? 'Es nuevo: no existía antes.' : (filas.some(f => f.cambio) ? undefined : 'No cambia ningún dato visible (puede ser un ajuste interno).') };
}

/** Arma el detalle de una solicitud. S: los datos que hay hoy en la app. */
export function detalleCambio(s: { ruta: string; metodo: string; cuerpo: any; descripcion?: string }, S: any): BloqueDetalle[] {
  const b = s.cuerpo || {};
  const viajes = S?.viajes || [], vehiculos = S?.vehiculos || [], conductores = S?.conductores || [], rutas = S?.rutas || [];
  const vehiculoDe = (p: any) => vehiculos.find((v: any) => pegada(v.p || v.placa) === pegada(p));
  const rutaDe = (c: any) => rutas.find((r: any) => pegada(r.cod || r.codigo) === pegada(c));
  const conductorDe = (x: any) => conductores.find((c: any) => (x.id && c.id === x.id) || (x.ced && String(c.ced) === String(x.ced)) || pegada(c.nom || c.nombre) === pegada(x.nom || x.nombre));

  if (s.metodo === 'DELETE' && s.ruta.startsWith('/api/vehiculos/')) {
    const placa = decodeURIComponent(s.ruta.split('/').pop() || '');
    return [{ ...bloque(`Eliminar el vehículo ${placa}`, 'bi-trash', CAMPOS_VEHICULO, null, vehiculoDe(placa) || { p: placa }), tipo: 'borrar', nota: 'Se borrará este vehículo.' }];
  }
  switch (s.ruta) {
    case '/api/viajes': {
      const antes = viajes.find((v: any) => v.id === b.id) || null;
      const t = antes ? `Viaje ${b.ruta || antes.ruta || ''} del ${legible(b.fecha || antes.fecha)}` : `Viaje nuevo ${b.ruta || ''}`;
      return [bloque(t, 'bi-truck', CAMPOS_VIAJE, antes, b)];
    }
    case '/api/viajes/eliminar': {
      const v = viajes.find((x: any) => x.id === b.id);
      return [{ ...bloque(v ? `Eliminar el viaje ${v.ruta || ''} del ${legible(v.fecha)}` : 'Eliminar un viaje', 'bi-trash', CAMPOS_VIAJE, null, v || {}), tipo: 'borrar', nota: v ? 'Se borrará este viaje (queda en la papelera).' : 'Ese viaje ya no existe.' }];
    }
    case '/api/vehiculos': {
      const lista = Array.isArray(b.vehiculos) ? b.vehiculos : [b];
      const bloques = lista.map((x: any) => bloque(vehiculoDe(x.p || x.placa) ? `Vehículo ${x.p || x.placa}` : `Vehículo nuevo ${x.p || x.placa || ''}`, 'bi-truck-front', CAMPOS_VEHICULO, vehiculoDe(x.p || x.placa) || null, x));
      // Cuando se guarda toda la flota, solo se muestran los que cambian.
      const conCambio = bloques.filter((k: BloqueDetalle) => k.tipo === 'nuevo' || k.filas.some(f => f.cambio));
      return conCambio.length ? conCambio : [{ titulo: `${lista.length} vehículos`, icono: 'bi-truck-front', tipo: 'cambio', filas: [], nota: 'Ninguno cambia en algo visible.' }];
    }
    case '/api/vehiculos/eliminar': {
      const v = vehiculoDe(b.placa || b.p);
      return [{ ...bloque(`Eliminar el vehículo ${b.placa || b.p}`, 'bi-trash', CAMPOS_VEHICULO, null, v || b), tipo: 'borrar', nota: 'Se borrará este vehículo.' }];
    }
    case '/api/conductores': {
      const lista = Array.isArray(b.conductores) ? b.conductores : [b];
      return lista.map((x: any) => bloque(conductorDe(x) ? `Conductor ${x.nom || x.nombre}` : `Conductor nuevo ${x.nom || x.nombre || ''}`, 'bi-person', CAMPOS_CONDUCTOR, conductorDe(x) || null, x));
    }
    case '/api/conductores/eliminar': {
      const c = conductores.find((x: any) => x.id === b.id || String(x.ced) === String(b.id));
      return [{ ...bloque(`Eliminar al conductor ${c?.nom || ''}`, 'bi-trash', CAMPOS_CONDUCTOR, null, c || b), tipo: 'borrar', nota: 'Se borrará este conductor.' }];
    }
    case '/api/rutas': return [bloque(rutaDe(b.cod || b.codigo) ? `Ruta ${b.cod || b.codigo}` : `Ruta nueva ${b.cod || b.codigo || ''}`, 'bi-signpost-split', CAMPOS_RUTA, rutaDe(b.cod || b.codigo) || null, b)];
    case '/api/rutas/eliminar': return [{ ...bloque(`Eliminar la ruta ${b.cod}`, 'bi-trash', CAMPOS_RUTA, null, rutaDe(b.cod) || b), tipo: 'borrar', nota: 'Se borrará esta ruta.' }];
    case '/api/novedades': return [bloque('Novedad nueva', 'bi-megaphone', CAMPOS_NOVEDAD, null, b)];
    case '/api/configuracion/compartida': {
      const nombre = NOMBRES_CONFIG[b.clave] || b.clave;
      const antes = Array.isArray(S?.[b.clave]) ? S[b.clave].length : null;
      const ahora = Array.isArray(b.valor) ? b.valor.length : null;
      const filas: FilaDetalle[] = antes !== null || ahora !== null
        ? [{ etiqueta: 'Cantidad', antes: antes === null ? '—' : String(antes), ahora: ahora === null ? '—' : String(ahora), cambio: antes !== ahora }] : [];
      // Qué elementos entran y cuáles salen (por su nombre o texto principal).
      const nombreDe = (x: any) => typeof x === 'string' ? x : String(x?.nombre || x?.texto || x?.titulo || x?.valor || x?.fecha || x?.placa || x?.id || '');
      if (Array.isArray(S?.[b.clave]) && Array.isArray(b.valor)) {
        const viejos = new Set(S[b.clave].map((x: any) => JSON.stringify(x)));
        const nuevos = new Set(b.valor.map((x: any) => JSON.stringify(x)));
        const entran = b.valor.filter((x: any) => !viejos.has(JSON.stringify(x))).map(nombreDe).filter(Boolean);
        const salen = S[b.clave].filter((x: any) => !nuevos.has(JSON.stringify(x))).map(nombreDe).filter(Boolean);
        if (entran.length) filas.push({ etiqueta: 'Se agrega o cambia', antes: '—', ahora: entran.slice(0, 6).join(' · ') + (entran.length > 6 ? ` y ${entran.length - 6} más` : ''), cambio: true });
        if (salen.length) filas.push({ etiqueta: 'Se quita o reemplaza', antes: salen.slice(0, 6).join(' · ') + (salen.length > 6 ? ` y ${salen.length - 6} más` : ''), ahora: '—', cambio: true });
      }
      return [{ titulo: nombre, icono: 'bi-gear', tipo: 'cambio', filas }];
    }
    case '/api/configuracion/generar-matriz': return [{ titulo: `Generar la matriz de ${b.mes} ${b.anio}`, icono: 'bi-grid-3x3', tipo: 'accion', filas: [], nota: 'Arma los viajes del mes a partir de las rutas fijas. Los viajes reales que ya existen se respetan.' }];
    case '/api/cerrar-mes': return [{ titulo: `Cerrar el mes ${b.label || ''}`, icono: 'bi-archive', tipo: 'accion', filas: [], nota: 'Guarda una foto del mes en el Histórico. No borra viajes.' }];
    case '/api/limpiar-historial': return [{ titulo: 'Borrar todo el histórico', icono: 'bi-trash', tipo: 'borrar', filas: [], nota: 'Se borran las fotos guardadas de meses anteriores.' }];
    case '/api/modo': return [{ titulo: `Cambiar a modo ${b.modo}`, icono: 'bi-toggles', tipo: 'accion', filas: [], nota: b.modo === 'pruebas' ? 'Todos pasarían a trabajar con datos de prueba.' : 'Todos volverían a los datos reales.' }];
  }
  // Cualquier otro cambio: sus datos con nombres legibles.
  const filas = Object.entries(b).filter(([k, v]) => !/^(id|version|editado|confirmar|_)/i.test(k) && v !== null && v !== '' && typeof v !== 'object')
    .map(([k, v]) => ({ etiqueta: k.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, c => c.toUpperCase()), antes: '—', ahora: legible(v), cambio: false }));
  return [{ titulo: s.descripcion || 'Cambio', icono: 'bi-pencil', tipo: 'accion', filas }];
}
