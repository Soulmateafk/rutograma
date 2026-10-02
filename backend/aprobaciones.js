// ============================================================
// APROBACIONES — los cambios de una cuenta "auxiliar" no se aplican
// directo: quedan pendientes hasta que un jefe (o el admin) los apruebe.
// Funciones puras (sin Express ni archivos); server.js guarda la cola y
// vuelve a ejecutar la petición original al aprobar.
// Pruebas: test/aprobaciones.test.js
// ============================================================

const ROLES_VALIDOS = ['editor', 'lector', 'jefe', 'auxiliar'];

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
    { clave: 'aprobarCambios', nombre: 'Aprobar o rechazar cambios de otros' },
    { clave: 'verAdministracion', nombre: 'Ver cuentas y auditoría' },
    { clave: 'gestionarCuentas', nombre: 'Aceptar o rechazar cuentas nuevas' },
    { clave: 'editarHistorico', nombre: 'Cerrar mes y limpiar el histórico' }
];
const CLAVES_PERMISOS = PERMISOS.map(p => p.clave);

const PERMISOS_POR_ROL = {
    editor: { editar: true, sinAprobacion: true, editarHistorico: true },
    lector: {},
    jefe: { editar: true, sinAprobacion: true, aprobarCambios: true, verAdministracion: true },
    auxiliar: { editar: true }
};

/** Deja solo claves conocidas en true/false y quita combinaciones sin sentido. */
function normalizarPermisos(entrada) {
    const p = {};
    CLAVES_PERMISOS.forEach(c => { p[c] = !!(entrada && entrada[c]); });
    if (!p.editar) { p.sinAprobacion = false; p.editarHistorico = false; }
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
    return propios && typeof propios === 'object'
        ? normalizarPermisos(propios)
        : permisosDeRol(rolDeCuenta(cuenta, false));
}

/** ¿Los cambios de esta cuenta esperan aprobación? */
const necesitaAprobacion = (permisos) => !!permisos.editar && !permisos.sinAprobacion;

// Peticiones de un auxiliar que NO pasan por aprobación: no cambian datos
// del negocio (sesión, vista previa), son de la propia cola, o de cuentas
// (cada una revisa su propio permiso).
const RUTAS_SIN_APROBACION = [
    '/api/auth/check', '/api/auth/login', '/api/auth/register',
    '/api/sesiones/cerrar', '/api/sesiones/cerrar-otras', '/api/sesiones/cerrar-actual',
    '/api/cache/refrescar',
    '/api/aprobaciones/decidir',
    '/api/auth/decidir', '/api/auth/rol', '/api/auth/resetear-clave'
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
        default: return `${metodo} ${ruta}`;
    }
}

/** Lo que se muestra de una solicitud (sin el Excel completo de una importación). */
function solicitudPublica(s) {
    const { cuerpo, ...resto } = s;
    const { archivo, ...cuerpoVisible } = cuerpo || {};
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
    requiereAprobacion,
    describirCambio,
    solicitudPublica
};
