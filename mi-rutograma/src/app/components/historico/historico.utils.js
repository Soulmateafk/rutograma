/**
 * Traduce las claves técnicas de las transportadoras a nombres legibles.
 */
export function traducirTransportadoraJS(clave) {
  const nombres = { makand: 'Makand', arsi: 'Arsi', polar: 'Polar', tercero: 'Tercero' };
  return nombres[clave] || clave;
}

/**
 * Escapa comillas dobles para construir filas CSV válidas.
 */
export function escaparComillasCSV(valor) {
  return '"' + String(valor || '').replace(/"/g, '""') + '"';
}

/**
 * Construye y dispara la descarga del archivo CSV para un mes específico.
 */
export function exportarMesAExcelJS(itemHistorial, fechaLocalStr) {
  const h = itemHistorial;
  const q = escaparComillasCSV;
  const tNom = traducirTransportadoraJS;

  const rows = [
    [q('RUTOGRAMA VEHICULAR — ' + h.label.toUpperCase() + ' — MAKAND SAS')],
    [q('Generado:'), q(fechaLocalStr)], [],
    [q('RESUMEN')],
    [q('Viajes'), q(h.totalViajes), q('Extras'), q(h.viajesExtra), q('Cajas'), q(h.totalCajas), q('Kg'), q(h.totalKg), q('m3'), q(h.totalM3), q('Costo'), q('$' + (h.costo / 1e9).toFixed(2) + 'B')], [],
    [q('VIAJES DEL MES')],
    [q('Dia'), q('Placa'), q('Ruta'), q('Destino'), q('2do destino'), q('Transportadora'), q('Conductor'), q('Cajas'), q('Peso kg'), q('Vol m3'), q('Producto'), q('Cliente'), q('2do cliente'), q('Tipo'), q('Estado'), q('Costo $'), q('Manifiesto'), q('Prioridad'), q('Observaciones')]
  ];

  h.viajes.forEach(vj => {
    rows.push([q(vj.dia), q(vj.placa), q(vj.ruta), q(vj.dest), q(vj.dest2 || ''), q(tNom(vj.tr)), q(vj.cond), q(vj.cajas), q(vj.pesoKg || 0), q(vj.volM3 || 0), q(vj.prod || ''), q(vj.cli), q(vj.cli2 || ''), q(vj.tipo), q(vj.estado), q(vj.costo), q(vj.manif || ''), q(vj.prioridad || 'normal'), q(vj.obs || '')]);
  });

  rows.push([], [q('NOVEDADES')], [q('Tipo'), q('Titulo'), q('Descripcion'), q('Fecha')]);
  h.novedades.forEach(n => { 
    rows.push([q(n.tipo), q(n.titulo), q(n.desc || ''), q(n.fecha)]); 
  });

  const csv = rows.map(r => r.join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const nombreArchivo = 'Rutograma_' + h.label.replace(' ', '_') + '_' + h.anio + '.csv';

  return { blob, nombreArchivo };
}

/**
 * Construye y dispara la descarga del CSV del histórico consolidado de todos los meses.
 */
export function exportarHistoricoCompletoJS(historialCompleto, fechaLocalStr, anioActual) {
  const q = escaparComillasCSV;
  const tNom = traducirTransportadoraJS;

  const rows = [
    [q('HISTORICO COMPLETO — RUTOGRAMA VEHICULAR MAKAND SAS')],
    [q('Exportado:'), q(fechaLocalStr)], [],
    [q('Mes'), q('Viajes'), q('Extras'), q('Cajas'), q('Kg'), q('m3'), q('Costo total'), q('Fecha cierre')]
  ];

  historialCompleto.forEach(h => { 
    rows.push([q(h.label), q(h.totalViajes), q(h.viajesExtra), q(h.totalCajas), q(h.totalKg || 0), q(h.totalM3 || 0), q(h.costo), q(h.fecha)]); 
  });

  rows.push([], [q('DETALLE POR MES')]);
  rows.push([q('Mes'), q('Dia'), q('Placa'), q('Ruta'), q('Destino'), q('Transportadora'), q('Cajas'), q('Kg'), q('m3'), q('Producto'), q('Cliente'), q('Costo'), q('Tipo'), q('Estado')]);

  historialCompleto.forEach(h => {
    h.viajes.forEach(vj => {
      rows.push([q(h.label), q(vj.dia), q(vj.placa), q(vj.ruta), q(vj.dest), q(tNom(vj.tr)), q(vj.cajas), q(vj.pesoKg || 0), q(vj.volM3 || 0), q(vj.prod || ''), q(vj.cli), q(vj.costo), q(vj.tipo), q(vj.estado)]);
    });
  });

  const csv = rows.map(r => r.join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const nombreArchivo = 'Historico_Rutograma_Makand_' + anioActual + '.csv';

  return { blob, nombreArchivo };
}