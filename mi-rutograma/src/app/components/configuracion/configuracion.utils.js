/**
 * Genera un objeto molde limpio para un nuevo cupo con la fecha de hoy.
 */
export function inicializarNuevoCupoJS(transp) {
  return {
    transp: transp || 'arsi',
    fecha: new Date().toISOString().split('T')[0],
    placa: '', cond: '', cajas: '', cli: '', cli2: '', manif: '', prior: 'normal', ruta: ''
  };
}

/**
 * Valida si se alcanzó el límite de cupos permitidos para una transportadora en un día específico.
 */
export function verificarLimiteCuposJS(cuposExt, transp, dia) {
  const maxC = transp === 'polar' ? 2 : 10;
  const usados = cuposExt.filter(cp => cp.tr === transp && cp.dia === dia).length;
  return usados >= maxC ? maxC : 0;
}

/**
 * Procesa y calcula los datos finales para guardar un cupo.
 */
export function procesarDatosCupoJS(cupoBase, diasRuta) {
  const cupo = { ...cupoBase };
  const dia = new Date(cupo.fecha).getDate();
  
  cupo.id = Date.now();
  cupo.dia = dia;
  cupo.retorno = dia + (diasRuta || 1);
  cupo.manif = cupo.manif || `MF-${Date.now()}`;
  cupo.estado = 'programado';
  
  return cupo;
}