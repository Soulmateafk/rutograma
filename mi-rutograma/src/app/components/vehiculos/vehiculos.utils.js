// 🚀 LÓGICA PURA PARA VEHÍCULOS
export function procesarVehiculos(vehiculos, viajes, conductores) {
  // 1. Mapas de conteo
  const viajesCount = viajes.reduce((acc, vj) => {
    acc[vj.placa] = (acc[vj.placa] || 0) + 1;
    return acc;
  }, {});

  const conductoresPorVeh = conductores.reduce((acc, c) => {
    if (!acc[c.veh]) acc[c.veh] = [];
    acc[c.veh].push(c);
    return acc;
  }, {});

  // 2. Construcción del mapa y la lista enriquecida
  const vehiculosMap = {};
  const vehiculosEnriquecidos = vehiculos.map((v, i) => {
    const vEn = {
      ...v,
      index: i,
      viajesCount: viajesCount[v.p] || 0,
      conductores: conductoresPorVeh[v.p] || [],
      isMantenimiento: v.est === 'mantenimiento',
      dotClass: v.est === 'disponible' ? 'g' : v.est === 'mantenimiento' ? 'r' : 'a',
      dcText: `${(v.dc?.c || 0)}/${(v.dc?.m || 1)}/${(v.dc?.l || 2)} días`
    };
    vehiculosMap[v.p] = vEn;
    return vEn;
  });

  return { vehiculosEnriquecidos, vehiculosMap };
}