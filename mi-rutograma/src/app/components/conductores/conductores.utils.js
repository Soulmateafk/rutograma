/**
 * BLOQUE DE UTILIDADES PARA CONDUCTORES
 * Importa este archivo en tu componente como: 
 * import * as ConductoresUtils from './conductores.utils.js';
 */

const ConductoresUtils = {
  
  // Lógica para filtrar conductores
  // BUG REAL encontrado y corregido: el campo de búsqueda dice "por
  // nombre, cédula o vehículo", pero esto nunca revisaba la cédula, y
  // usaba solo los nombres de campo viejos (c.nombre/c.placa) en vez de
  // los que de verdad usa el resto de la app (c.nom/c.veh) — con
  // respaldo a los viejos por si algún registro solo los tuviera a esos.
  filtrarConductoresJS: (conductores, filtro) => {
    if (!filtro || filtro.trim() === '') return conductores || [];
    const f = filtro.toLowerCase().trim();
    return conductores.filter(c => {
      const nombre = String(c.nom || c.nombre || '').toLowerCase();
      const cedula = String(c.ced || c.cedula || c.cc || '').toLowerCase();
      const placa = String(c.veh || c.placa || '').toLowerCase();
      return nombre.includes(f) || cedula.includes(f) || placa.includes(f);
    });
  },

  // Sincroniza vehículos con la lista de conductores
  // Mismo arreglo de nombres de campo que en filtrarConductoresJS.
  sincronizarVehiculosJS: (vehiculos, conductores) => {
    if (!vehiculos || !conductores) return;
    vehiculos.forEach(v => {
      const placaVeh = String(v.p || v.placa || '').toUpperCase().trim();
      const cn = conductores.find(c => String(c.veh || c.placa || '').toUpperCase().trim() === placaVeh);
      v.cond = cn ? (cn.nom || cn.nombre) : (v.sinPlaca ? v.cond : '');
    });
  },

  // Clona un objeto conductor
  clonarConductorJS: (conductor) => ({ ...conductor }),

  // Molde vacío para formularios
  obtenerMoldeVacioJS: () => ({ 
    nombre: '', placa: '', est: 'activo', desc: '', cedula: '', cel: '', lic: '', obs: '' 
  }),

  // Función maestra para procesar el Excel
  procesarExcelConductores: (evento, callbackRender, S) => {
    const archivo = evento.target.files[0];
    if (!archivo) return;

    const lector = new FileReader();
    lector.onload = function(e) {
      const data = e.target.result;
      const workbook = window.XLSX.read(data, { type: 'binary' });
      const hoja = workbook.Sheets["Conductores"];
      const datosRaw = window.XLSX.utils.sheet_to_json(hoja);

      S.conductores = datosRaw.map(fila => ({
        nombre: fila['NOMBRE'] || '',
        placa: fila['PLACA'] || '',
        cedula: fila['CEDULA']?.toString() || '',
        cel: fila['CEL']?.toString() || '',
        est: 'activo',
        desc: '',
        lic: '',
        obs: ''
      }));

      if (callbackRender) callbackRender();
    };
    lector.readAsBinaryString(archivo);
  },

  // Guardar y refrescar
  guardarYRefrescar: (nuevoConductor, vehiculos, S, callbackRender) => {
    const index = S.conductores.findIndex(c => c.placa === nuevoConductor.placa);
    if (index > -1) {
      S.conductores[index] = { ...S.conductores[index], ...nuevoConductor };
    } else {
      S.conductores.push(nuevoConductor);
    }
    ConductoresUtils.sincronizarVehiculosJS(vehiculos, S.conductores);
    if (callbackRender) callbackRender();
  }
};

export default ConductoresUtils;