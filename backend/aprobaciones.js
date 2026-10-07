// ============================================================
// APROBACIONES — los cambios de una cuenta "auxiliar" no se aplican
// directo: quedan pendientes hasta que un jefe (o el admin) los apruebe.
// Funciones puras (sin Express ni archivos); server.js guarda la cola y
// vuelve a ejecutar la petición original al aprobar.
// Pruebas: test/aprobaciones.test.js
// ============================================================

const ROLES_VALIDOS = ['editor', 'lector', 'jefe', 'auxiliar', 'conductor'];

/** Rol efectivo de una cuenta: el admin siempre es 'admin'; sin rol = 'editor'. */
function rolDeCuenta(cuenta, esAdmin) {
    if (esAdmin) return 'admin';
    const rol = String(cuenta?.rol || '').toLowerCase();
    return ROLES_VALIDOS.includes(rol) ? rol : 'editor';
}

const puedeAprobar = (rol) => rol === 'admin' || rol === 'jefe';

// ============================================================
// PERMISOS — cada rol trae unos por defecto; el admin puede
// personalizarlos cuenta por cuenta (columna "permisos" de usuarios).
// Cambiar roles/permisos y restablecer contraseñas es SOLO del admin.
// ============================================================
const PERMISOS = [
    { clave: 'editar', nombre: 'Hacer cambios' },
    { clave: 'sinAprobacion', nombre: 'Sus cambios se aplican sin esperar aprobación' },
    { clave: 'eliminar', nombre: 'Eliminar viajes, vehículos, rutas, conductores y novedades' },
    { clave: 'generarMatriz', nombre: 'Generar la Matriz del mes' },
    { clave: 'editarDiasPasados', nombre: 'Cambiar o borrar viajes de días ya cerrados' },
    { clave: 'importarExcel', nombre: 'Importar viajes reales desde Excel' },
    { clave: 'reacomodarCupos', nombre: 'Reacomodar cupos de Arsitrans y Polar' },
    { clave: 'editarConfiguracion', nombre: 'Cambiar transportadoras, cupos de Configuración y festivos' },
    { clave: 'editarHistorico', nombre: 'Cerrar mes y limpiar el histórico' },
    { clave: 'cambiarModo', nombre: 'Cambiar entre modo Real y modo Prueba' },
    { clave: 'restaurarRespaldos', nombre: 'Ver y restaurar respaldos' },
    { clave: 'aprobarCambios', nombre: 'Aprobar o rechazar cambios de otros' },
    { clave: 'verAdministracion', nombre: 'Ver cuentas y auditoría' },
    { clave: 'gestionarCuentas', nombre: 'Aceptar, rechazar y eliminar solicitudes de cuenta' },
    { clave: 'verSesionesTodas', nombre: 'Ver las sesiones de todas las cuentas' },
    { clave: 'gestionarDispositivos', nombre: 'Ver y desbloquear dispositivos' },
    { clave: 'enviarVencimientos', nombre: 'Enviar el resumen de vencimientos por correo' }
];
const CLAVES_PERMISOS = PERMISOS.map(p => p.clave);

// Permisos que solo tienen sentido si la cuenta puede hacer cambios.
const REQUIEREN_EDITAR = ['sinAprobacion', 'eliminar', 'generarMatriz', 'editarDiasPasados', 'importarExcel', 'reacomodarCupos',
    'editarConfiguracion', 'editarHistorico', 'cambiarModo', 'restaurarRespaldos'];

const EDICION_COMPLETA = { editar: true, sinAprobacion: true, eliminar: true, generarMatriz: true, importarExcel: true, reacomodarCupos: true, editarConfiguracion: true };

const PERMISOS_POR_ROL = {
    editor: { ...EDICION_COMPLETA, editarHistorico: true },
    lector: {},
    // Solo ve sus propios viajes (pantalla Mis viajes); no cambia nada.
    conductor: {},
    jefe: { ...EDICION_COMPLETA, editarDiasPasados: true, aprobarCambios: true, verAdministracion: true, verSesionesTodas: true },
    // El auxiliar puede pedir casi todo; cada cambio espera aprobación.
    auxiliar: { editar: true, eliminar: true, generarMatriz: true, reacomodarCupos: true, editarConfiguracion: true }
};

/** Deja solo claves conocidas en true/false y quita combinaciones sin sentido. */
function normalizarPermisos(entrada) {
    const p = {};
    CLAVES_PERMISOS.forEach(c => { p[c] = !!(entrada && entrada[c]); });
    if (!p.editar) REQUIEREN_EDITAR.forEach(c => { p[c] = false; });
    if (p.gestionarCuentas) p.verAdministracion = true; // para aceptar cuentas hay que verlas
    return p;
}

const permisosDeRol = (rol) => normalizarPermisos(PERMISOS_POR_ROL[rol] || PERMISOS_POR_ROL.editor);

/** Permisos efectivos: admin = todos; si la cuenta tiene personalizados, esos; si no, los de su rol. */
function permisosDeCuenta(cuenta, esAdmin) {
    if (esAdmin) {
        const todos = {};
        CLAVES_PERMISOS.forEach(c => { todos[c] = true; });
        return todos;
    }
    let propios = cuenta?.permisos;
    if (typeof propios === 'string') {
        try { propios = JSON.parse(propios); } catch { propios = null; }
    }
    const delRol = permisosDeRol(rolDeCuenta(cuenta, false));
    if (!propios || typeof propios !== 'object') return delRol;
    // Personalizados guardados antes de que existiera un permiso: ese
    // permiso toma el valor por defecto de su rol (nadie pierde acceso).
    const completos = { ...delRol };
    Object.keys(propios).forEach(c => { if (CLAVES_PERMISOS.includes(c)) completos[c] = propios[c]; });
    return normalizarPermisos(completos);
}

// Qué permiso pide cada acción (además de "Hacer cambios"). Las vistas
// previas no lo piden: no cambian nada.
const RUTAS_ELIMINAR = ['/api/viajes/eliminar', '/api/rutas/eliminar', '/api/vehiculos/eliminar', '/api/conductores/eliminar', '/api/novedades/eliminar'];
const PERMISO_POR_RUTA = {
    '/api/configuracion/generar-matriz': 'generarMatriz',
    '/api/importar/viajes-reales': 'importarExcel',
    '/api/cupos/reacomodar': 'reacomodarCupos',
    '/api/configuracion/compartida': 'editarConfiguracion',
    '/api/cerrar-mes': 'editarHistorico',
    '/api/limpiar-historial': 'editarHistorico',
    '/api/modo': 'cambiarModo'
};

const CLAVES_COMPARTIDAS_DEL_DIA = ['anuncios', 'comparendos', 'quejas', 'ubicaciones'];

/** Permiso que necesita esta petición, o null si basta con "Hacer cambios". */
function permisoRequerido(metodo, ruta, cuerpo) {
    if (cuerpo && cuerpo.previsualizar === true) return null;
    if (RUTAS_ELIMINAR.includes(ruta) || (metodo === 'DELETE' && String(ruta).startsWith('/api/vehiculos/'))) return 'eliminar';
    // La pizarra y los comparendos son trabajo del día, no configuración:
    // basta con "Hacer cambios".
    if (ruta === '/api/configuracion/compartida' && CLAVES_COMPARTIDAS_DEL_DIA.includes(cuerpo?.clave)) return null;
    return PERMISO_POR_RUTA[ruta] || null;
}

const nombrePermiso = (clave) => (PERMISOS.find(p => p.clave === clave) || {}).nombre || clave;

/** ¿Los cambios de esta cuenta esperan aprobación? */
const necesitaAprobacion = (permisos) => !!permisos.editar && !permisos.sinAprobacion;

// Peticiones de un auxiliar que NO pasan por aprobación: no cambian datos
// del negocio (sesión, vista previa), son de la propia cola, o de cuentas
// (cada una revisa su propio permiso).
const RUTAS_SIN_APROBACION = [
    '/api/auth/check', '/api/auth/login', '/api/auth/register',
    '/api/guias/vista', '/api/guias/reiniciar',
    '/api/sesiones/cerrar', '/api/sesiones/cerrar-otras', '/api/sesiones/cerrar-actual',
    '/api/cache/refrescar',
    '/api/aprobaciones/decidir',
    '/api/auth/decidir', '/api/auth/rol', '/api/auth/resetear-clave', '/api/auth/eliminar', '/api/auth/cambiar-clave'
];

/** ¿Esta petición de un auxiliar debe quedar pendiente de aprobación? */
function requiereAprobacion(metodo, ruta, cuerpo) {
    if (!String(ruta).startsWith('/api/') || metodo === 'GET') return false;
    if (RUTAS_SIN_APROBACION.includes(ruta)) return false;
    if (cuerpo && cuerpo.previsualizar === true) return false;
    return true;
}

const txt = (v) => String(v ?? '').trim();

/** Frase corta y legible de qué cambio pide la petición. */
function describirCambio(metodo, ruta, cuerpo = {}) {
    const b = cuerpo || {};
    if (metodo === 'DELETE' && ruta.startsWith('/api/vehiculos/')) {
        return `Eliminar el vehículo ${decodeURIComponent(ruta.split('/').pop())}`;
    }
    switch (ruta) {
        case '/api/viajes': {
            const partes = [txt(b.ruta || b.codigo), txt(b.placa || b.p), txt(b.fecha)].filter(Boolean);
            return `Guardar viaje ${partes.join(' · ')}${b.estado ? ` (${b.estado})` : ''}`;
        }
        case '/api/viajes/eliminar': return `Eliminar el viaje ${txt(b.id)}`;
        case '/api/rutas': return `Guardar la ruta ${txt(b.cod || b.codigo)}`;
        case '/api/rutas/eliminar': return `Eliminar la ruta ${txt(b.cod)}`;
        case '/api/vehiculos':
            return Array.isArray(b.vehiculos)
                ? `Guardar ${b.vehiculos.length} vehículo(s)`
                : `Guardar el vehículo ${txt(b.placa || b.p)}`;
        case '/api/vehiculos/eliminar': return `Eliminar el vehículo ${txt(b.placa || b.p)}`;
        case '/api/conductores': return `Guardar el conductor ${txt(b.nom || b.nombre)}`;
        case '/api/conductores/eliminar': return `Eliminar el conductor ${txt(b.id)}`;
        case '/api/novedades': return `Crear la novedad "${txt(b.titulo)}"`;
        case '/api/novedades/resolver': return b.resuelta === false ? 'Reabrir una novedad' : 'Marcar una novedad como resuelta';
        case '/api/novedades/eliminar': return 'Eliminar una novedad';
        case '/api/configuracion/generar-matriz': return `Generar Matriz de ${txt(b.mes)} ${txt(b.anio)}`;
        case '/api/importar/viajes-reales': return 'Importar viajes reales desde Excel';
        case '/api/modo': return `Cambiar a modo ${txt(b.modo)}`;
        case '/api/cerrar-mes': return `Cerrar el mes ${txt(b.label)} en el histórico`;
        case '/api/limpiar-historial': return 'Borrar todo el histórico';
        case '/api/configuracion/compartida': {
            const nombres = { transportadoras: 'las transportadoras', cuposExt: 'los cupos de Configuración', festivos: 'los festivos', reglasAsignacion: 'las reglas por cliente o ruta', picoPlaca: 'el pico y placa', anuncios: 'la pizarra de anuncios', comparendos: 'los comparendos', quejas: 'las quejas de clientes', ubicaciones: 'las ubicaciones del mapa' };
            return `Cambiar ${nombres[b.clave] || txt(b.clave)}`;
        }
        case '/api/cupos/reacomodar': return `Reacomodar los cupos de ${txt(b.tr)} (${Number(b.mes) + 1}/${txt(b.anio)})`;
        default: return `${metodo} ${ruta}`;
    }
}

/** Lo que se muestra de una solicitud (sin el Excel completo de una importación). */
function solicitudPublica(s) {
    const { cuerpo, ...resto } = s;
    // Sin lo pesado: el Excel de una importación o los viajes de un cierre de mes.
    const { archivo, viajes, novedades, ...cuerpoVisible } = cuerpo || {};
    return { ...resto, cuerpo: cuerpoVisible };
}

module.exports = {
    ROLES_VALIDOS,
    rolDeCuenta,
    puedeAprobar,
    PERMISOS,
    normalizarPermisos,
    permisosDeRol,
    permisosDeCuenta,
    necesitaAprobacion,
    permisoRequerido,
    nombrePermiso,
    requiereAprobacion,
    describirCambio,
    solicitudPublica
};
