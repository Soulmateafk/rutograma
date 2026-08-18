const express = require('express');
const cors = require('cors');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const app = express();

// Misma restricción que ya existe en el frontend (rutograma.utils.js) —
// como el servidor corre aparte, no puede "importarla" de ahí, así que se
// repite aquí para que "Generar Matriz" tampoco le asigne a LUN 428 nada
// fuera de su rutina (antes solo se lo escondíamos en pantalla, pero el
// generador igual le asignaba el viaje real "por debajo").
const RESTRICCIONES_VEHICULOS = {
    'LUN428': ['barranquilla', 'monteria']
};

function normalizarTexto(str) {
    return String(str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function rutaPermitidaParaVehiculo(placa, ruta) {
    const pClean = String(placa || '').toUpperCase().replace(/\s/g, '');
    const permitidos = RESTRICCIONES_VEHICULOS[pClean];
    if (!permitidos) return true; // sin restricción, cualquier vehículo normal

    const destino = normalizarTexto(ruta?.dest || ruta?.destino || '');
    return permitidos.some(p => destino.includes(normalizarTexto(p)));
}

app.use(cors());
app.use(express.json());

// ============================================================================
// REGISTRO DE AUDITORÍA — quién hizo qué y cuándo
// ============================================================================
// Se guarda en un archivo de texto aparte (una línea = un evento en formato
// JSON), NO en el Excel principal — así no compite por el mismo archivo ni
// lo hace más lento. Vive junto a tu Excel real (ahora local, no en red).
const CARPETA_DATOS = path.join(__dirname, 'data');
const RUTA_AUDITORIA = path.join(CARPETA_DATOS, 'auditoria.jsonl');

// Nos aseguramos de que la carpeta "data" exista (si no, la creamos) —
// se hace aquí, temprano, antes de que cualquier otra cosa la necesite.
if (!fs.existsSync(CARPETA_DATOS)) {
    fs.mkdirSync(CARPETA_DATOS, { recursive: true });
    console.log(`📁 Carpeta creada: ${CARPETA_DATOS}`);
}

const registrarAuditoria = (usuario, metodo, ruta, cuerpo) => {
    try {
        // Nunca guardamos contraseñas ni datos sensibles en el log, aunque
        // vengan en el cuerpo de la petición (ej. /api/auth/register).
        let resumen = {};
        if (cuerpo && typeof cuerpo === 'object') {
            resumen = { ...cuerpo };
            delete resumen.pass;
            delete resumen.passHash;
        }

        const entrada = {
            fecha: new Date().toISOString(),
            usuario: usuario || 'desconocido',
            metodo,
            ruta,
            resumen
        };

        fs.appendFileSync(RUTA_AUDITORIA, JSON.stringify(entrada) + '\n', 'utf8');
    } catch (err) {
        // Un fallo en el log de auditoría NUNCA debe tumbar la petición real.
        console.error('⚠️ No se pudo registrar la auditoría:', err.message);
    }
};

// Middleware: registra automáticamente CUALQUIER POST/PUT/DELETE a /api/*,
// sin tener que tocar cada endpoint uno por uno.
app.use((req, res, next) => {
    if (req.path.startsWith('/api/') && req.method !== 'GET') {
        const usuario = String(req.headers['x-user-email'] || '').toLowerCase().trim();
        registrarAuditoria(usuario, req.method, req.path, req.body);
    }
    next();
});


// ============================================================================
// GESTIÓN DE CUENTAS / APROBACIÓN DE USUARIOS
// ============================================================================
//
// CÓMO INSTALAR ESTO EN TU server.js:
//
// PASO 1. Agrega 'Usuarios' a las DOS listas de hojas que ya tienes:
//   - Línea ~23 (inicializarArchivo):
//       ['Vehiculos', 'Viajes', 'Rutas', 'Conductores', 'Novedades', 'Usuarios']
//   - Línea ~43 (leerExcel):
//       ['Vehiculos', 'Viajes', 'Rutas', 'Conductores', 'Novedades', 'Usuarios']
//
// PASO 2. Pega TODO el bloque de abajo justo ANTES de la línea
//   "// --- INICIO DEL SERVIDOR ---" (cerca del final del archivo).
//
// PASO 3. Cambia el correo del admin en ADMIN_EMAIL por el tuyo real.
//
// Con esto, las cuentas se guardan en la hoja "Usuarios" del mismo Excel
// compartido (//server/.../DatabaseRutograma.XLSX), así que cuando tú
// apruebas a alguien, la decisión la ven todos los computadores.
// ============================================================================

// El correo que SIEMPRE es admin (puede aprobar/rechazar). Cámbialo por el tuyo.
const ADMIN_EMAIL = 'admin@Makand.com';

// Normaliza un correo para comparar (minúsculas, sin espacios)
const normalizarEmail = (e) => String(e || '').toLowerCase().trim();

// --- Registrar / consultar una cuenta al iniciar sesión ---
// El frontend llama aquí tras el login de Microsoft. Si el correo no existe,
// se crea como 'PENDING'. Si ya existe, devuelve su estado guardado.
app.post('/api/auth/check', (req, res) => {
    try {
        const data = leerExcel();
        if (!data.usuarios) data.usuarios = [];

        const email = normalizarEmail(req.body.email);
        const nombre = String(req.body.nombre || email).trim();
        if (!email) return res.status(400).json({ ok: false, msg: 'Falta el correo' });

        // El admin siempre está aprobado, exista o no en la hoja
        if (email === normalizarEmail(ADMIN_EMAIL)) {
            return res.json({ ok: true, email, estado: 'APPROVED', esAdmin: true });
        }

        let usuario = data.usuarios.find(u => normalizarEmail(u.email) === email);

        if (!usuario) {
            usuario = {
                email: email,
                nombre: nombre,
                estado: 'PENDING',
                solicitadoEn: new Date().toISOString(),
                actualizadoPor: '',
                actualizadoEn: ''
            };
            data.usuarios.push(usuario);
            guardarEnExcel(data);
            console.log(`👤 Nueva cuenta pendiente: ${email}`);
        }

        return res.json({ ok: true, email, estado: usuario.estado, esAdmin: false });
    } catch (error) {
        console.error("🚨 Error en /api/auth/check:", error);
        res.status(500).json({ ok: false, msg: error.message });
    }
});

// --- Listar cuentas pendientes (solo admin) ---
app.get('/api/auth/pendientes', (req, res) => {
    try {
        // El frontend manda el correo del que pregunta en la cabecera
        const solicitante = normalizarEmail(req.headers['x-user-email']);
        if (solicitante !== normalizarEmail(ADMIN_EMAIL)) {
            return res.status(403).json({ ok: false, msg: 'Solo el administrador puede ver esta lista' });
        }

        const data = leerExcel();
        const pendientes = (data.usuarios || [])
            .filter(u => u.estado === 'PENDING')
            .map(({ passHash, ...resto }) => resto);
        res.json({ ok: true, pendientes });
    } catch (error) {
        res.status(500).json({ ok: false, msg: error.message });
    }
});

// --- Listar TODAS las cuentas (solo admin) ---
app.get('/api/auth/usuarios', (req, res) => {
    try {
        const solicitante = normalizarEmail(req.headers['x-user-email']);
        if (solicitante !== normalizarEmail(ADMIN_EMAIL)) {
            return res.status(403).json({ ok: false, msg: 'Solo el administrador puede ver esta lista' });
        }
        const data = leerExcel();
        // Ni siquiera al admin hace falta mandarle el hash de las
        // contraseñas — la pantalla de administración solo necesita
        // correo, nombre, departamento y estado de cada cuenta.
        const usuariosSinHash = (data.usuarios || []).map(({ passHash, ...resto }) => resto);
        res.json({ ok: true, usuarios: usuariosSinHash });
    } catch (error) {
        res.status(500).json({ ok: false, msg: error.message });
    }
});

// --- Aprobar o rechazar una cuenta (solo admin) ---
// body: { email: 'x@y.com', accion: 'APPROVED' | 'REJECTED' }
app.post('/api/auth/decidir', (req, res) => {
    try {
        const solicitante = normalizarEmail(req.headers['x-user-email']);
        if (solicitante !== normalizarEmail(ADMIN_EMAIL)) {
            return res.status(403).json({ ok: false, msg: 'Solo el administrador puede aprobar o rechazar' });
        }

        const data = leerExcel();
        if (!data.usuarios) data.usuarios = [];

        const email = normalizarEmail(req.body.email);
        const accion = String(req.body.accion || '').toUpperCase();

        if (!email) return res.status(400).json({ ok: false, msg: 'Falta el correo' });
        if (accion !== 'APPROVED' && accion !== 'REJECTED') {
            return res.status(400).json({ ok: false, msg: "Acción inválida (usa 'APPROVED' o 'REJECTED')" });
        }

        const usuario = data.usuarios.find(u => normalizarEmail(u.email) === email);
        if (!usuario) return res.status(404).json({ ok: false, msg: 'Cuenta no encontrada' });

        usuario.estado = accion;
        // Si es la primera vez que se aprueba y no tiene rol, le damos 'editor'
        // (acceso completo) por defecto — el admin puede bajarlo a 'lector' después.
        if (accion === 'APPROVED' && !usuario.rol) {
            usuario.rol = 'editor';
        }
        usuario.actualizadoPor = solicitante;
        usuario.actualizadoEn = new Date().toISOString();

        guardarEnExcel(data);
        console.log(`✅ Cuenta ${email} => ${accion} (por ${solicitante})`);

        res.json({ ok: true, email, estado: accion });
    } catch (error) {
        console.error("🚨 Error en /api/auth/decidir:", error);
        res.status(500).json({ ok: false, msg: error.message });
    }
});

// --- Asignar rol a una cuenta (solo admin): 'editor' (acceso completo) o 'lector' (solo lectura) ---
app.post('/api/auth/rol', (req, res) => {
    try {
        const solicitante = normalizarEmail(req.headers['x-user-email']);
        if (solicitante !== normalizarEmail(ADMIN_EMAIL)) {
            return res.status(403).json({ ok: false, msg: 'Solo el administrador puede cambiar roles' });
        }

        const data = leerExcel();
        if (!data.usuarios) data.usuarios = [];

        const email = normalizarEmail(req.body.email);
        const rol = String(req.body.rol || '').toLowerCase();

        if (!email) return res.status(400).json({ ok: false, msg: 'Falta el correo' });
        if (rol !== 'editor' && rol !== 'lector') {
            return res.status(400).json({ ok: false, msg: "Rol inválido (usa 'editor' o 'lector')" });
        }

        const usuario = data.usuarios.find(u => normalizarEmail(u.email) === email);
        if (!usuario) return res.status(404).json({ ok: false, msg: 'Cuenta no encontrada' });

        usuario.rol = rol;
        usuario.actualizadoPor = solicitante;
        usuario.actualizadoEn = new Date().toISOString();

        guardarEnExcel(data);
        console.log(`🔑 Rol de ${email} => ${rol} (por ${solicitante})`);

        res.json({ ok: true, email, rol });
    } catch (error) {
        console.error("🚨 Error en /api/auth/rol:", error);
        res.status(500).json({ ok: false, msg: error.message });
    }
});


// --- CONFIGURACIÓN ---
// Antes esto apuntaba a una carpeta de red ('//server/...'), lo que traía
// problemas de permisos/conexión fuera de nuestro control. Ahora el Excel
// vive LOCAL, en la misma carpeta "data" que ya se creó arriba — nada de
// red de por medio, solo el disco de este computador.
const RUTA_EXCEL = path.join(CARPETA_DATOS, 'DatabaseRutograma.XLSX');
const CARPETA_RESPALDOS = path.join(CARPETA_DATOS, 'Backups');
const MAX_RESPALDOS = 30; // se guardan los últimos 30 respaldos, los más viejos se borran solos

console.log("Ruta configurada como:", RUTA_EXCEL);
console.log("👉 Si tienes un Excel real con tus datos, cópialo/muévelo a esa ruta ANTES de seguir usando la app (con ese nombre exacto), o la app va a crear uno nuevo vacío.");

// --- RESPALDO AUTOMÁTICO ---
// Antes de escribir CUALQUIER cambio, guardamos una copia del archivo tal
// como estaba justo antes. Si algo sale mal en una escritura (o alguien
// borra algo por error), siempre hay una copia reciente de dónde recuperar.
const crearRespaldo = () => {
    try {
        if (!fs.existsSync(RUTA_EXCEL)) return; // nada que respaldar todavía

        if (!fs.existsSync(CARPETA_RESPALDOS)) {
            fs.mkdirSync(CARPETA_RESPALDOS, { recursive: true });
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const nombreRespaldo = `DatabaseRutograma_${timestamp}.XLSX`;
        const rutaRespaldo = path.join(CARPETA_RESPALDOS, nombreRespaldo);

        fs.copyFileSync(RUTA_EXCEL, rutaRespaldo);
        console.log(`💾 Respaldo creado: ${nombreRespaldo}`);

        limpiarRespaldosViejos();
    } catch (err) {
        // Un respaldo fallido NUNCA debe impedir que se guarde el cambio real.
        console.error('⚠️ No se pudo crear el respaldo (se continúa igual):', err.message);
    }
};

const limpiarRespaldosViejos = () => {
    try {
        const archivos = fs.readdirSync(CARPETA_RESPALDOS)
            .filter(f => f.startsWith('DatabaseRutograma_') && f.toUpperCase().endsWith('.XLSX'))
            .map(f => {
                const ruta = path.join(CARPETA_RESPALDOS, f);
                return { nombre: f, ruta, tiempo: fs.statSync(ruta).mtimeMs };
            })
            .sort((a, b) => b.tiempo - a.tiempo); // más reciente primero

        const sobrantes = archivos.slice(MAX_RESPALDOS);
        sobrantes.forEach(a => {
            fs.unlinkSync(a.ruta);
            console.log(`🗑️ Respaldo antiguo eliminado: ${a.nombre}`);
        });
    } catch (err) {
        console.error('⚠️ Error limpiando respaldos viejos:', err.message);
    }
};

// --- FUNCIONES ---
const inicializarArchivo = () => {
    try {
        if (!fs.existsSync(RUTA_EXCEL)) {
            console.log("Archivo NO encontrado, creando plantilla inicial...");
            const wb = XLSX.utils.book_new();
            ['Vehiculos', 'Viajes', 'Rutas', 'Conductores', 'Novedades', 'Usuarios'].forEach(sheetName => {
                const ws = XLSX.utils.json_to_sheet([]);
                XLSX.utils.book_append_sheet(wb, ws, sheetName);
            });
            XLSX.writeFile(wb, RUTA_EXCEL);
            console.log("Archivo creado correctamente.");
        } else {
            console.log("Archivo detectado correctamente.");
        }
    } catch (err) {
        console.error("ERROR CRÍTICO AL INICIALIZAR EL ARCHIVO:", err);
    }
};

inicializarArchivo();

// --- CACHÉ EN MEMORIA ---
// Leer el Excel completo desde la red es lento y BLOQUEA todo el
// servidor mientras dura (Node es de un solo hilo). Antes, cada
// petición de solo-lectura volvía a leer el archivo entero, así que si
// dos pestañas pedían datos casi al mismo tiempo, la segunda quedaba
// esperando en fila y podía sentirse como "nunca carga".
//
// Ahora guardamos el resultado en memoria (cacheExcel) y solo se vuelve
// a leer el archivo real cuando: (a) el servidor recién arrancó, o
// (b) alguien acaba de escribir un cambio (guardarEnExcel actualiza el
// caché directamente, sin tener que releer del disco).
let cacheExcel = null;

const leerExcel = () => {
    if (cacheExcel) return cacheExcel;

    try {
        const workbook = XLSX.readFile(RUTA_EXCEL);
        const data = {};
        ['Vehiculos', 'Viajes', 'Rutas', 'Conductores', 'Novedades', 'Usuarios', 'Historialvehiculos', 'Historialrutas', 'Historialconductores'].forEach(sheet => {
            const worksheet = workbook.Sheets[sheet];
            data[sheet.toLowerCase()] = worksheet ? XLSX.utils.sheet_to_json(worksheet) : [];
        });

        // El historial guarda una "foto" de vehículos/rutas por mes — cada
        // fila trae { mes, anio, dataJSON } con el arreglo completo guardado
        // como texto (igual que "dias" de las rutas, por la misma razón:
        // Excel no guarda arreglos/objetos anidados en una celda).
        (data.historialvehiculos || []).forEach(h => {
            if (h.dataJSON && typeof h.dataJSON === 'string') {
                try { h.datos = JSON.parse(h.dataJSON); } catch { h.datos = []; }
            }
        });
        (data.historialrutas || []).forEach(h => {
            if (h.dataJSON && typeof h.dataJSON === 'string') {
                try { h.datos = JSON.parse(h.dataJSON); } catch { h.datos = []; }
            }
        });
        (data.historialconductores || []).forEach(h => {
            if (h.dataJSON && typeof h.dataJSON === 'string') {
                try { h.datos = JSON.parse(h.dataJSON); } catch { h.datos = []; }
            }
        });

        // Reconstruimos "dias" de cada ruta (lo guardamos como texto JSON
        // porque Excel no soporta objetos anidados — ver /api/rutas).
        (data.rutas || []).forEach(r => {
            if (r.dias && typeof r.dias === 'string') {
                try {
                    r.dias = JSON.parse(r.dias);
                } catch {
                    // Si el texto no es un JSON válido (ej. datos viejos
                    // antes de este arreglo), lo dejamos como está en vez
                    // de tumbar toda la carga por una sola ruta con datos raros.
                }
            }
        });

        (data.vehiculos || []).forEach(v => {
            if (v.historialMantenimiento && typeof v.historialMantenimiento === 'string') {
                try {
                    v.historialMantenimiento = JSON.parse(v.historialMantenimiento);
                } catch {
                    v.historialMantenimiento = [];
                }
            } else if (!Array.isArray(v.historialMantenimiento)) {
                v.historialMantenimiento = [];
            }
        });

        cacheExcel = data;
        return data;
    } catch (error) {
        console.error("❌ Error al leer Excel (se reintentará en la próxima petición):", error.message);
        // OJO: a propósito NO guardamos esto en cacheExcel. Si lo
        // cacheáramos, un fallo pasajero (ej. la red tardó en estar
        // lista al arrancar) dejaría a todos viendo "todo en cero" para
        // siempre, hasta reiniciar el servidor. Así, la siguiente
        // petición vuelve a intentar leer el archivo real.
        return { vehiculos: [], viajes: [], rutas: [], conductores: [], novedades: [], usuarios: [], historialvehiculos: [], historialrutas: [], historialconductores: [] };
    }
};

const guardarEnExcel = (datosActualizados) => {
    console.log("Iniciando proceso de escritura...");
    crearRespaldo(); // primero guardamos cómo estaba, por si algo sale mal
    try {
        const workbook = XLSX.utils.book_new();
        Object.keys(datosActualizados).forEach(key => {
            const sheetName = key.charAt(0).toUpperCase() + key.slice(1);
            
            let dataToSheet = datosActualizados[key];
            
            // === Normalizar la estructura de los Vehículos antes de escribir ===
            if (key === 'vehiculos' && Array.isArray(dataToSheet)) {
                dataToSheet = dataToSheet.map(v => {
                    const placa = String(v.placa || v.p || v.veh || '').toUpperCase().trim();
                    return {
                        p: placa,
                        placa: placa,
                        veh: placa,
                        tipo: v.tipo || v.t || 'Furgon refrigerado',
                        cajas: Number(v.cajas || v.cap || v.capacidad || 660),
                        kg: Number(v.kg || 8000),
                        m3: Number(v.m3 || 32),
                        conductor: v.conductor || v.cond || 'Sin asignar',
                        transportadora: v.transportadora || v.tr || 'Makand',
                        estado: String(v.estado || v.est || v.Estado || 'Disponible').trim(),
                        viajes: Number(v.viajes || 0),
                        desc: v.desc || ((v.dc !== undefined || v.dm !== undefined || v.dl !== undefined) ? `${v.dc || 0}/${v.dm || 0}/${v.dl || 0} días` : '0/1/2 días'),
                        t: v.tipo || v.t || 'Furgon refrigerado',
                        cap: Number(v.cajas || v.cap || v.capacidad || 660),
                        cond: v.conductor || v.cond || 'Sin asignar',
                        tr: v.transportadora || v.tr || 'Makand',
                        est: String(v.estado || v.est || v.Estado || 'Disponible').trim(),
                        dc: v.dc !== undefined ? Number(v.dc) : 0,
                        dm: v.dm !== undefined ? Number(v.dm) : 1,
                        dl: v.dl !== undefined ? Number(v.dl) : 2,
                        mantInicio: v.mantInicio || null,
                        mantFin: v.mantFin || null,
                        um: v.um || '',
                        origenAuto: !!v.origenAuto,
                        // Se guarda como texto JSON porque una celda de Excel
                        // no puede tener una lista de objetos directamente.
                        historialMantenimiento: JSON.stringify(v.historialMantenimiento || [])
                    };
                });
            }

            // === Normalizar las Rutas antes de escribir ===
            // "dias" es un objeto anidado ({ lun: {checked, hora}, ... }) y
            // Excel no sabe guardar objetos anidados en una celda (los
            // convierte en texto roto tipo "[object Object]"). Por eso lo
            // pasamos a texto JSON AQUÍ, sobre una COPIA — nunca tocamos el
            // objeto original que vive en memoria/caché, para que la app
            // siga viendo "dias" como objeto normal en todo momento.
            if (key === 'rutas' && Array.isArray(dataToSheet)) {
                dataToSheet = dataToSheet.map(r => {
                    if (r.dias && typeof r.dias === 'object') {
                        return { ...r, dias: JSON.stringify(r.dias) };
                    }
                    return r;
                });
            }

            // === Normalizar el historial mensual (vehículos/rutas) ===
            // Cada fila trae "datos" (el arreglo completo de ese mes) como
            // objeto en memoria — lo pasamos a texto JSON en "dataJSON" para
            // guardarlo, y no escribimos "datos" tal cual (Excel no sabe
            // guardar arreglos anidados en una celda).
            if ((key === 'historialvehiculos' || key === 'historialrutas' || key === 'historialconductores') && Array.isArray(dataToSheet)) {
                dataToSheet = dataToSheet.map(h => {
                    const { datos, ...resto } = h;
                    return { ...resto, dataJSON: JSON.stringify(datos || []) };
                });
            }
            
            const worksheet = XLSX.utils.json_to_sheet(dataToSheet);
            XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
        });
        
        XLSX.writeFile(workbook, RUTA_EXCEL);
        console.log("✅ Archivo guardado con éxito en:", RUTA_EXCEL);

        // Actualizamos el caché con lo que se acaba de guardar, para que
        // la próxima lectura no tenga que volver a tocar el archivo real.
        cacheExcel = datosActualizados;
    } catch (error) {
        if (error.code === 'EBUSY') {
            console.error("❌ ERROR CRÍTICO: ¡El archivo Excel está abierto en tu computadora! Ciérralo.");
            throw new Error("El archivo Excel está abierto. Por favor ciérralo para guardar.");
        }
        console.error("❌ ERROR AL ESCRIBIR EN EXCEL:", error);
        throw error;
    }
};

// --- ENDPOINTS ---

app.get('/api/dashboard-data', (req, res) => {
    try {
        console.log("-> Procesando solicitud de dashboard-data...");
        // Esta respuesta cambia todo el tiempo (viajes, vehículos...) — le
        // decimos al navegador explícitamente que nunca la guarde en
        // caché, para que cada consulta vaya de verdad al servidor.
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        const data = leerExcel(); 

        // La hoja "Viajes" del Excel no tiene columna "id" (nunca se
        // guardó ahí), así que sin esto TODOS los viajes llegan al
        // frontend con id=undefined. Eso rompe verDetalle()/find(v =>
        // v.id === id): como ningún viaje tiene id real, siempre
        // devuelve el primero que encuentra con id=undefined — es
        // decir, casi cualquier clic abre el viaje equivocado.
        // Usamos la MISMA fórmula que ya usa generar-matriz
        // (placa+fecha+ruta) para que el id sea estable: el mismo
        // viaje real siempre calcula el mismo id, sin importar cuántas
        // veces se recargue o resincronice.
        if (data.viajes && Array.isArray(data.viajes)) {
            data.viajes = data.viajes.map(v => {
                if (v.id) return v; // ya tiene id propio (ej. viaje extra) — no lo tocamos
                const placa = String(v.p || v.placa || v.veh || '').toUpperCase().trim();
                const fecha = String(v.fecha || '').trim();
                const ruta = String(v.ruta || v.codigo || '').toUpperCase().trim();
                return { ...v, id: `${placa}-${fecha}-${ruta}` };
            });
        }
        
        if (data.vehiculos && Array.isArray(data.vehiculos)) {
            data.vehiculos = data.vehiculos.map(v => {
                const placa = String(v.placa || v.p || v.veh || '').toUpperCase().trim();
                const conductorFinal = (v.conductor && String(v.conductor).trim() !== "") ? v.conductor : ((v.cond && String(v.cond).trim() !== "") ? v.cond : 'Sin asignar');
                const cajasFinal = Number(v.cajas || v.cap || v.capacidad || 660);
                const tipoFinal = v.tipo || v.t || 'Furgon refrigerado';
                const transFinal = v.transportadora || v.tr || 'Makand';
                const estFinal = String(v.estado || v.est || v.Estado || 'Disponible').trim();

                return {
                    p: placa,
                    placa: placa,
                    veh: placa,
                    tipo: tipoFinal,
                    t: tipoFinal,
                    cajas: cajasFinal,
                    cap: cajasFinal,
                    kg: Number(v.kg || 8000),
                    m3: Number(v.m3 || 32),
                    conductor: conductorFinal,
                    cond: conductorFinal,
                    transportadora: transFinal,
                    tr: transFinal,
                    estado: estFinal,
                    est: estFinal,
                    viajes: Number(v.viajes || 0),
                    desc: v.desc || '0/1/2 días',
                    dc: v.dc !== undefined ? Number(v.dc) : 0,
                    dm: v.dm !== undefined ? Number(v.dm) : 1,
                    dl: v.dl !== undefined ? Number(v.dl) : 2,
                    mantInicio: v.mantInicio || null,
                    mantFin: v.mantFin || null,
                    um: v.um || '',
                    historialMantenimiento: (() => {
                        if (Array.isArray(v.historialMantenimiento)) return v.historialMantenimiento;
                        if (typeof v.historialMantenimiento === 'string') {
                            try { return JSON.parse(v.historialMantenimiento); } catch { return []; }
                        }
                        return [];
                    })()
                };
            });
        }
        
        if (data.rutas && Array.isArray(data.rutas)) {
            data.rutas = data.rutas.map(ruta => {
                // Si la ruta YA tiene "dias" como objeto real (el formulario
                // actual siempre lo manda así), lo respetamos tal cual —
                // nunca lo pisamos. Solo reconstruimos desde el texto viejo
                // "horaBase" como respaldo, para rutas viejas que nunca
                // llegaron a tener el campo "dias".
                if (ruta.dias && typeof ruta.dias === 'object' && !Array.isArray(ruta.dias)) {
                    return {
                        ...ruta,
                        codigo: ruta.codigo || ruta.cod || '',
                        cod: ruta.cod || ruta.codigo || '',
                        destino: ruta.destino || ruta.dest || '',
                        dest: ruta.dest || ruta.destino || '',
                        tarifaArsitrans: ruta.tarifaArsitrans || ruta.tarifaArsitran || 0,
                        tarifaArsitran: ruta.tarifaArsitran || ruta.tarifaArsitrans || 0
                    };
                }

                const textoHoraBase = ruta.horaBase || '';
                
                const diasDefault = {
                    lun: { checked: false, hora: '' },
                    mar: { checked: false, hora: '' },
                    mie: { checked: false, hora: '' },
                    jue: { checked: false, hora: '' },
                    vie: { checked: false, hora: '' },
                    sab: { checked: false, hora: '' },
                    dom: { checked: false, hora: '' },
                    fes: { checked: false, hora: '' }
                };
                
                if (textoHoraBase && textoHoraBase !== 'Variable') {
                    const mapaInverso = {
                        'Lu': 'lun', 'Ma': 'mar', 'Mi': 'mie', 'Ju': 'jue', 'Vi': 'vie', 'Sa': 'sab', 'Do': 'dom', 'Fes': 'fes'
                    };
                    
                    textoHoraBase.split(',').forEach(p => {
                        const limpio = p.trim();
                        const tokens = limpio.split(' ');
                        if (tokens.length >= 2) {
                            const abrev = tokens[0];
                            const hora = tokens[1];
                            const key = mapaInverso[abrev];
                            if (key && diasDefault[key]) {
                                diasDefault[key].checked = true;
                                diasDefault[key].hora = hora;
                            }
                        }
                    });
                }

                return {
                    ...ruta,
                    codigo: ruta.codigo || ruta.cod || '',
                    cod: ruta.cod || ruta.codigo || '',
                    destino: ruta.destino || ruta.dest || '',
                    dest: ruta.dest || ruta.destino || '',
                    tarifaArsitrans: ruta.tarifaArsitrans || ruta.tarifaArsitran || 0,
                    tarifaArsitran: ruta.tarifaArsitran || ruta.tarifaArsitrans || 0,
                    dias: diasDefault
                };
            });
        }

        // El frontend nunca usa "usuarios" para nada (ni la lista de
        // correos, ni mucho menos la contraseña encriptada de cada uno) —
        // así que no hace falta mandarlo. Antes esto iba dentro de "data"
        // completo, exponiendo el hash de cada contraseña a cualquiera que
        // revisara la respuesta de red en el navegador.
        const { usuarios, ...dataSegura } = data;
        res.json({ ok: true, data: dataSegura });
    } catch (error) {
        res.status(500).json({ ok: false, message: "Error al leer el archivo", error: error.message });
    }
});

// =================================================================
// --- VEHÍCULOS (CREAR / ACTUALIZAR INDIVIDUAL O MASIVO) ---
// =================================================================
app.post('/api/vehiculos', (req, res) => {
    try {
        console.log("\n📥 [PETICIÓN] POST /api/vehiculos");
        const data = leerExcel();
        const entrada = req.body;
        console.log("Datos recibidos:", req.body);
        
        console.log("Datos recibidos del frontend:", JSON.stringify(entrada, null, 2));

        let vehiculosAProcesar = [];

        if (entrada.vehiculos && Array.isArray(entrada.vehiculos)) {
            vehiculosAProcesar = entrada.vehiculos;
        } else if (Array.isArray(entrada)) {
            vehiculosAProcesar = entrada;
        } else {
            vehiculosAProcesar = [entrada];
        }

        let procesados = 0;

        vehiculosAProcesar.forEach((vehFront, i) => {
            const placa = String(vehFront.p || vehFront.placa || vehFront.veh || '').toUpperCase().trim();
            if (!placa) {
                console.log(`⚠️ Fila [${i}]: Saltada por placa vacía.`);
                return;
            }

           // ✨ CAPTURA INTELIGENTE DE ESTADO (Evita que se reseteje a 'Disponible')
            const estadoRecibido = (vehFront.estado && String(vehFront.estado).trim() !== "") ? vehFront.estado : 
                       ((vehFront.est && String(vehFront.est).trim() !== "") ? vehFront.est : 
                       ((vehFront.status && String(vehFront.status).trim() !== "") ? vehFront.status :
                       ((vehFront.state && String(vehFront.state).trim() !== "") ? vehFront.state : 'Disponible')));

            const conductorRecibido = (vehFront.conductor && String(vehFront.conductor).trim() !== "") ? vehFront.conductor : ((vehFront.cond && String(vehFront.cond).trim() !== "") ? vehFront.cond : 'Sin asignar');
            const cajasRecibidas = Number(vehFront.cajas || vehFront.cap || vehFront.capacidad || 660);

            const vehiculoFormateado = {
                p: placa,
                placa: placa,
                veh: placa,
                tipo: vehFront.tipo || vehFront.t || 'Furgon refrigerado',
                cajas: cajasRecibidas,
                kg: Number(vehFront.kg || 8000),
                m3: Number(vehFront.m3 || 32),
                conductor: conductorRecibido,
                transportadora: vehFront.transportadora || vehFront.tr || 'Makand',
                estado: estadoRecibido.trim(),
                viajes: Number(vehFront.viajes || 0),
                desc: vehFront.desc || '0/1/2 días',
                t: vehFront.tipo || vehFront.t || 'Furgon refrigerado',
                cap: cajasRecibidas,
                cond: conductorRecibido,
                tr: vehFront.transportadora || vehFront.tr || 'Makand',
                est: estadoRecibido.trim(),
                dc: vehFront.dc !== undefined ? Number(vehFront.dc) : 0,
                dm: vehFront.dm !== undefined ? Number(vehFront.dm) : 1, // ✨ CORREGIDO AQUÍ
                dl: vehFront.dl !== undefined ? Number(vehFront.dl) : 2,  // ✨ CORREGIDO AQUÍ
                mantInicio: vehFront.mantInicio || null,
                mantFin: vehFront.mantFin || null
            };

            if (!data.vehiculos) data.vehiculos = [];

            const index = data.vehiculos.findIndex(v => String(v.p || v.placa || '').toUpperCase().trim() === placa);
            
            if (index !== -1) {
                console.log(`🔄 Actualizando vehículo: ${placa}`);
                data.vehiculos[index] = vehiculoFormateado;
            } else {
                console.log(`➕ Insertando nuevo vehículo: ${placa}`);
                data.vehiculos.push(vehiculoFormateado);
            }
            procesados++;
        });

        if (procesados === 0) {
            return res.status(400).json({ ok: false, msg: 'No se procesaron placas válidas.' });
        }

        guardarEnExcel(data);
        
        return res.status(200).json({ 
            ok: true, 
            msg: vehiculosAProcesar.length > 1 ? 'Maestro de vehículos actualizado y synchronized correctamente' : 'Vehículo guardado con éxito' 
        });

    } catch (error) {
        console.error("🚨 Error en /api/vehiculos:", error);
        res.status(500).json({ ok: false, msg: error.message });
    }
});

app.delete('/api/vehiculos/:placa', (req, res) => {
    try {
        const data = leerExcel();
        const placaAEliminar = String(req.params.placa).toUpperCase().trim();
        
        const longitudInicial = data.vehiculos.length;
        data.vehiculos = data.vehiculos.filter(v => String(v.p || v.placa || '').toUpperCase().trim() !== placaAEliminar);

        if (data.vehiculos.length === longitudInicial) {
            return res.status(404).json({ ok: false, msg: 'Vehículo no encontrado' });
        }

        guardarEnExcel(data);
        res.json({ ok: true, msg: 'Vehículo eliminado correctamente' });
    } catch (error) {
        res.status(500).json({ ok: false, msg: error.message });
    }
});

// El frontend (data.ts: eliminarVehiculoBD) en realidad llama a esta ruta
// POST, no a la DELETE de arriba — la dejamos también para que no vuelva
// a pasar el mismo 404 con vehículos.
app.post('/api/vehiculos/eliminar', (req, res) => {
    try {
        const data = leerExcel();
        const placaAEliminar = String(req.body.p || req.body.placa || '').toUpperCase().trim();

        if (!placaAEliminar) {
            return res.status(400).json({ ok: false, msg: 'Falta la placa a eliminar' });
        }

        const longitudInicial = data.vehiculos.length;
        data.vehiculos = data.vehiculos.filter(v => String(v.p || v.placa || '').toUpperCase().trim() !== placaAEliminar);

        if (data.vehiculos.length === longitudInicial) {
            return res.status(404).json({ ok: false, msg: 'Vehículo no encontrado' });
        }

        guardarEnExcel(data);
        res.json({ ok: true, msg: 'Vehículo eliminado correctamente' });
    } catch (error) {
        console.error("🚨 Error en /api/vehiculos/eliminar:", error);
        res.status(500).json({ ok: false, msg: error.message });
    }
});

// --- Forzar recargar el caché desde el archivo real (solo admin) ---
// Úsalo si alguna vez editaste el Excel a mano mientras el servidor
// estaba corriendo, para que el servidor "se entere" del cambio.
app.post('/api/cache/refrescar', (req, res) => {
    try {
        const solicitante = normalizarEmail(req.headers['x-user-email']);
        if (solicitante !== normalizarEmail(ADMIN_EMAIL)) {
            return res.status(403).json({ ok: false, msg: 'Solo el administrador puede refrescar el caché' });
        }
        cacheExcel = null; // la próxima leerExcel() va a releer el archivo real
        leerExcel();
        res.json({ ok: true, msg: 'Caché recargado desde el archivo real' });
    } catch (error) {
        res.status(500).json({ ok: false, msg: error.message });
    }
});

// --- Consultar el registro de auditoría (solo admin) ---
app.get('/api/auditoria', (req, res) => {
    try {
        const solicitante = normalizarEmail(req.headers['x-user-email']);
        if (solicitante !== normalizarEmail(ADMIN_EMAIL)) {
            return res.status(403).json({ ok: false, msg: 'Solo el administrador puede ver la auditoría' });
        }

        if (!fs.existsSync(RUTA_AUDITORIA)) {
            return res.json({ ok: true, eventos: [] });
        }

        const limite = Math.min(Number(req.query.limite) || 200, 1000);

        const lineas = fs.readFileSync(RUTA_AUDITORIA, 'utf8')
            .split('\n')
            .filter(l => l.trim().length > 0);

        const eventos = lineas
            .slice(-limite) // los últimos N (el archivo crece hacia abajo)
            .map(l => {
                try { return JSON.parse(l); } catch { return null; }
            })
            .filter(Boolean)
            .reverse(); // más reciente primero

        res.json({ ok: true, eventos });
    } catch (error) {
        console.error("🚨 Error en /api/auditoria:", error);
        res.status(500).json({ ok: false, msg: error.message });
    }
});

// --- Ver los respaldos disponibles (solo admin) ---
app.get('/api/respaldos', (req, res) => {
    try {
        const solicitante = normalizarEmail(req.headers['x-user-email']);
        if (solicitante !== normalizarEmail(ADMIN_EMAIL)) {
            return res.status(403).json({ ok: false, msg: 'Solo el administrador puede ver los respaldos' });
        }

        if (!fs.existsSync(CARPETA_RESPALDOS)) {
            return res.json({ ok: true, respaldos: [] });
        }

        const respaldos = fs.readdirSync(CARPETA_RESPALDOS)
            .filter(f => f.startsWith('DatabaseRutograma_') && f.toUpperCase().endsWith('.XLSX'))
            .map(f => {
                const ruta = path.join(CARPETA_RESPALDOS, f);
                const stats = fs.statSync(ruta);
                return { nombre: f, fecha: stats.mtime, tamanoKB: Math.round(stats.size / 1024) };
            })
            .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

        res.json({ ok: true, respaldos });
    } catch (error) {
        console.error("🚨 Error en /api/respaldos:", error);
        res.status(500).json({ ok: false, msg: error.message });
    }
});

// =================================================================
// --- NOVEDADES ---
// =================================================================
app.post('/api/novedades', (req, res) => {
    try {
        const data = leerExcel();
        const novedad = req.body;

        if (!novedad || !novedad.titulo) {
            return res.status(400).json({ ok: false, msg: 'Falta el título de la novedad' });
        }

        if (!data.novedades) data.novedades = [];

        const nueva = {
            id: novedad.id || Date.now(),
            tipo: novedad.tipo || 'Aviso',
            titulo: novedad.titulo,
            desc: novedad.desc || '',
            fecha: novedad.fecha || new Date().toLocaleString('es-CO'),
            resuelta: false
        };

        data.novedades.push(nueva);
        guardarEnExcel(data);
        console.log(`⚡ Nueva novedad registrada: ${nueva.titulo}`);

        res.status(201).json({ ok: true, novedad: nueva });
    } catch (error) {
        console.error("🚨 Error en /api/novedades:", error);
        res.status(500).json({ ok: false, msg: error.message });
    }
});

app.post('/api/novedades/resolver', (req, res) => {
    try {
        const data = leerExcel();
        if (!data.novedades) data.novedades = [];

        const id = req.body.id;
        const novedad = data.novedades.find(n => n.id === id);
        if (!novedad) {
            return res.status(404).json({ ok: false, msg: 'Novedad no encontrada' });
        }

        novedad.resuelta = true;
        guardarEnExcel(data);
        res.json({ ok: true, novedad });
    } catch (error) {
        console.error("🚨 Error en /api/novedades/resolver:", error);
        res.status(500).json({ ok: false, msg: error.message });
    }
});

// =================================================================
// --- VIAJES ---
// =================================================================
app.post('/api/viajes', (req, res) => {
    try {
        console.log("\n📥 [PETICIÓN] POST /api/viajes");
        const data = leerExcel();
        const viaje = req.body;

        if (!viaje || !viaje.placa && !viaje.p) {
            return res.status(400).json({ ok: false, msg: 'Falta la placa del vehículo' });
        }

        if (!data.viajes) data.viajes = [];

        // Si el viaje ya trae un id y existe, lo actualizamos; si no, lo insertamos.
        const idViaje = viaje.id;
        const index = idViaje !== undefined
            ? data.viajes.findIndex(v => v.id === idViaje)
            : -1;

        if (index !== -1) {
            console.log(`🔄 Actualizando viaje id=${idViaje}`);
            data.viajes[index] = viaje;
        } else {
            console.log(`➕ Insertando nuevo viaje: ${viaje.placa || viaje.p} -> ${viaje.ruta}`);
            data.viajes.push(viaje);
        }

        guardarEnExcel(data);
        return res.status(200).json({ ok: true, msg: 'Viaje guardado correctamente' });
    } catch (error) {
        console.error("🚨 Error en /api/viajes:", error);
        res.status(500).json({ ok: false, msg: error.message });
    }
});

app.post('/api/viajes/eliminar', (req, res) => {
    try {
        const data = leerExcel();
        if (!data.viajes) data.viajes = [];

        const idViaje = req.body.id;
        if (idViaje === undefined || idViaje === null) {
            return res.status(400).json({ ok: false, msg: 'Falta el id del viaje a eliminar' });
        }

        const longitudInicial = data.viajes.length;
        data.viajes = data.viajes.filter(v => v.id !== idViaje);

        if (data.viajes.length === longitudInicial) {
            return res.status(404).json({ ok: false, msg: 'Viaje no encontrado' });
        }

        guardarEnExcel(data);
        console.log(`🗑️ Viaje id=${idViaje} eliminado`);
        res.json({ ok: true, msg: 'Viaje eliminado correctamente' });
    } catch (error) {
        console.error("🚨 Error en /api/viajes/eliminar:", error);
        res.status(500).json({ ok: false, msg: error.message });
    }
});

// =================================================================
// --- RUTAS ---
// =================================================================
app.post('/api/rutas', (req, res) => {
    try {
        const data = leerExcel();
        const { codOriginal, ...ruta } = req.body;

        if (!ruta || !ruta.cod) {
            return res.status(400).json({ ok: false, msg: 'Falta el código de la ruta' });
        }

        if (!data.rutas) data.rutas = [];

        // Si viene "codOriginal" y es distinto del código nuevo, es un
        // RENOMBRE — buscamos la ruta por su código de ANTES (no por el
        // nuevo, que todavía no existe) y la actualizamos ahí mismo. Antes
        // esto siempre buscaba por el código nuevo, así que renombrar una
        // ruta creaba una segunda ruta duplicada en vez de cambiar la
        // que ya existía, dejando la vieja huérfana.
        const codBuscado = (codOriginal && codOriginal !== ruta.cod) ? codOriginal : ruta.cod;
        const index = data.rutas.findIndex(r => String(r.cod || r.codigo || '').toUpperCase().trim() === String(codBuscado).toUpperCase().trim());

        if (index !== -1) {
            console.log(`🔄 Actualizando ruta ${codBuscado}${codOriginal && codOriginal !== ruta.cod ? ` → renombrada a ${ruta.cod}` : ''}`);
            data.rutas[index] = ruta;

            // Si de verdad cambió el código, todos los viajes que ya
            // existían con el código viejo se actualizan al nuevo — para
            // que no queden "huérfanos" apuntando a una ruta que ya no
            // existe con ese nombre.
            if (codOriginal && codOriginal !== ruta.cod) {
                let viajesActualizados = 0;
                (data.viajes || []).forEach(v => {
                    if (String(v.ruta || v.codigo || '').toUpperCase().trim() === String(codOriginal).toUpperCase().trim()) {
                        v.ruta = ruta.cod;
                        v.codigo = ruta.cod;
                        viajesActualizados++;
                    }
                });
                if (viajesActualizados > 0) {
                    console.log(`   → ${viajesActualizados} viaje(s) actualizado(s) al nuevo código.`);
                }
            }
        } else {
            console.log(`➕ Insertando nueva ruta: ${ruta.cod}`);
            data.rutas.push(ruta);
        }

        guardarEnExcel(data);
        res.status(200).json({ ok: true, msg: 'Ruta guardada correctamente' });
    } catch (error) {
        console.error("🚨 Error en /api/rutas:", error);
        res.status(500).json({ ok: false, msg: error.message });
    }
});

app.post('/api/rutas/eliminar', (req, res) => {
    try {
        const data = leerExcel();
        const { cod } = req.body;
        data.rutas = data.rutas.filter(r => String(r.cod).toUpperCase().trim() !== String(cod).toUpperCase().trim());
        guardarEnExcel(data);
        res.json({ ok: true, msg: 'Ruta eliminada correctamente' });
    } catch (error) {
        res.status(500).json({ ok: false, msg: error.message });
    }
});

// =================================================================
// --- CONDUCTORES ---
// =================================================================
app.post('/api/conductores', (req, res) => {
    try {
        const data = leerExcel();
        const entrada = req.body;

        // Antes esto solo guardaba 4 campos (nom, ced, tel, veh) y
        // descartaba TODO lo demás — estado, licencia, vencimiento,
        // observaciones, etc. Ahora se guarda el conductor completo tal
        // como llega, normalizando solo los nombres cortos/largos que tu
        // frontend usa indistintamente (nom/n, ced/cc, veh/p).
        const cedula = String(entrada.ced || entrada.cedula || entrada.cc || '').trim();
        if (!cedula) {
            return res.status(400).json({ ok: false, msg: 'La cédula del conductor es requerida.' });
        }

        const nombre = entrada.nom || entrada.nombre || entrada.nombreCompleto || entrada.n || '';
        const vehiculo = (entrada.veh || entrada.vehiculo || entrada.p || '').toUpperCase().trim();

        const nuevoConductor = {
            ...entrada,
            nom: nombre,
            n: nombre,
            ced: cedula,
            cc: cedula,
            cedula: cedula,
            tel: entrada.tel || entrada.telefono || '',
            veh: vehiculo,
            p: vehiculo,
            est: entrada.est || entrada.estado || 'activo',
            lic: entrada.lic || '',
            licVence: entrada.licVence || '',
            desc: entrada.desc || '',
            obs: entrada.obs || ''
        };

        if (!data.conductores) data.conductores = [];

        const index = data.conductores.findIndex(c => String(c.ced || c.cedula || c.cc || '').trim() === cedula);
        if (index !== -1) {
            data.conductores[index] = nuevoConductor;
        } else {
            data.conductores.push(nuevoConductor);
        }

        guardarEnExcel(data);
        res.status(201).json({ ok: true, msg: 'Conductor guardado correctamente' });
    } catch (error) {
        res.status(500).json({ ok: false, msg: error.message });
    }
});

app.post('/api/conductores/eliminar', (req, res) => {
    try {
        const data = leerExcel();
        const { id, ced } = req.body; 
        const cedulaBuscar = String(id || ced).trim();
        data.conductores = data.conductores.filter(c => String(c.ced).trim() !== cedulaBuscar);
        guardarEnExcel(data);
        res.json({ ok: true, msg: 'Conductor eliminado correctamente' });
    } catch (error) {
        res.status(500).json({ ok: false, msg: error.message });
    }
});


//-------------------------------------------------------------------------


// --- LOGIN: valida contraseña real (bcrypt) Y estado de aprobación ---
// El admin YA NO se salta la validación de contraseña: también necesita
// haberse registrado con una contraseña real (ver /api/auth/register).
// La única "ventaja" del admin es que, si la contraseña es correcta,
// siempre queda con estado APPROVED sin depender de que nadie lo apruebe.
app.post('/api/auth/login', async (req, res) => {
    try {
        const data = leerExcel();
        const usuarios = data.usuarios || [];

        const email = normalizarEmail(req.body.email);
        const pass = String(req.body.pass || '');

        if (!email || !pass) {
            return res.status(400).json({ ok: false, msg: 'Correo y contraseña son obligatorios' });
        }

        const usuario = usuarios.find(u => normalizarEmail(u.email) === email);

        // No distinguimos "no existe" de "contraseña mala" por seguridad
        // (mismo mensaje genérico para no dar pistas a quien intenta adivinar).
        if (!usuario || !usuario.passHash) {
            return res.status(401).json({ ok: false, msg: 'Correo o contraseña incorrectos' });
        }

        const passOk = await bcrypt.compare(pass, usuario.passHash);
        if (!passOk) {
            return res.status(401).json({ ok: false, msg: 'Correo o contraseña incorrectos' });
        }

        // Contraseña correcta: ahora sí miramos el estado de aprobación
        const esAdmin = (email === normalizarEmail(ADMIN_EMAIL));
        const estado = esAdmin ? 'APPROVED' : usuario.estado;
        const rol = esAdmin ? 'admin' : (usuario.rol || 'editor');

        return res.json({
            ok: true,
            email: usuario.email,
            nombre: usuario.nombre,
            estado: estado,
            esAdmin: esAdmin,
            rol: rol
        });
    } catch (error) {
        console.error('🚨 Error en /api/auth/login:', error);
        return res.status(500).json({ ok: false, msg: error.message });
    }
});

// --- REGISTRAR NUEVA CUENTA (contraseña hasheada con bcrypt) ---
app.post('/api/auth/register', async (req, res) => {
    try {
        const data = leerExcel();
        if (!data.usuarios) data.usuarios = [];

        const nombre = String(req.body.nombre || '').trim();
        const email = normalizarEmail(req.body.email);
        const pass = String(req.body.pass || '');
        const departamento = String(req.body.departamento || '').trim();

        if (!nombre || !email || !pass || !departamento) {
            return res.status(400).json({ ok: false, msg: 'Todos los campos son obligatorios' });
        }
        if (pass.length < 6) {
            return res.status(400).json({ ok: false, msg: 'La contraseña debe tener al menos 6 caracteres' });
        }

        const existe = data.usuarios.find(u => normalizarEmail(u.email) === email);
        if (existe) {
            return res.status(409).json({ ok: false, msg: 'El correo ya está registrado' });
        }

        // Nunca guardamos la contraseña en texto plano: la hasheamos.
        const passHash = await bcrypt.hash(pass, 10);

        const nuevoUsuario = {
            email,
            nombre,
            departamento,
            passHash,
            estado: 'PENDING',
            solicitadoEn: new Date().toISOString(),
            actualizadoPor: '',
            actualizadoEn: ''
        };

        data.usuarios.push(nuevoUsuario);
        guardarEnExcel(data);
        console.log(`👤 Nueva cuenta registrada: ${email}`);

        return res.status(201).json({
            ok: true,
            msg: 'Cuenta registrada correctamente',
            estado: 'PENDING'
        });
    } catch (error) {
        console.error('🚨 Error en /api/auth/register:', error);
        return res.status(500).json({ ok: false, msg: error.message });
    }
});



// =================================================================
// --- MOTOR LOGÍSTICO DE MATRIZ ---
// =================================================================
app.post('/api/configuracion/generar-matriz', async (req, res) => {
    try {
        const { mes, anio, festivos } = req.body; 

        if (!mes || !anio) {
            return res.status(400).json({ ok: false, msg: 'Faltan parámetros operativos (mes o año).' });
        }

        const mesesMap = {
            'Enero': 0, 'Febrero': 1, 'Marzo': 2, 'Abril': 3, 'Mayo': 4, 'Junio': 5,
            'Julio': 6, 'Agosto': 7, 'Septiembre': 8, 'Octubre': 9, 'Noviembre': 10, 'Diciembre': 11
        };

        const mapaDiasAbrev = { 0: 'Do', 1: 'Lu', 2: 'Ma', 3: 'Mi', 4: 'Ju', 5: 'Vi', 6: 'Sa' };
        const mesIndex = mesesMap[mes];
        
        if (mesIndex === undefined) {
            return res.status(400).json({ ok: false, msg: 'El mes proporcionado no es válido.' });
        }

        console.log(`🚀 Iniciando automatización para: ${mes} de ${anio}`);
        
        const data = leerExcel();

        // Blindaje: si por cualquier motivo quedaron rutas duplicadas (mismo
        // codigo repetido), nos quedamos solo con la primera de cada una --
        // asi nunca se asignan 2 vehiculos distintos a la misma ruta el
        // mismo dia por culpa de un duplicado en la configuracion.
        const rutasVistas = new Set();
        const listaRutas = (data.rutas || []).filter(r => {
            const codigo = String(r.cod || r.codigo || '').toUpperCase().trim();
            if (!codigo || rutasVistas.has(codigo)) return false;
            rutasVistas.add(codigo);
            return true;
        });
        const listaVehiculos = data.vehiculos || [];

        if (!listaRutas.length) return res.status(400).json({ ok: false, msg: 'La pestaÃ±a de Rutas estÃ¡ vacÃ­a.' });
        if (!listaVehiculos.length) return res.status(400).json({ ok: false, msg: 'La pestaÃ±a de VehÃ­culos estÃ¡ vacÃ­a.' });

        // Limpiamos cualquier viaje viejo de este mes ANTES de generar de
        // nuevo -- revisamos tanto el campo mes/anio guardado como la fecha
        // real, para no dejar pegado nada de una generacion anterior
        // (incluida gente que le haya dado clic mas de una vez seguida).
        const mesIndexLimpieza = { 'Enero':0,'Febrero':1,'Marzo':2,'Abril':3,'Mayo':4,'Junio':5,'Julio':6,'Agosto':7,'Septiembre':8,'Octubre':9,'Noviembre':10,'Diciembre':11 }[mes];
        data.viajes = (data.viajes || []).filter(v => {
            const coincidePorEtiqueta = v.mes === mes && String(v.anio) === String(anio);
            let coincidePorFecha = false;
            if (v.fecha) {
                const f = new Date(v.fecha + 'T00:00:00');
                if (!isNaN(f.getTime())) {
                    coincidePorFecha = f.getFullYear() === Number(anio) && f.getMonth() === mesIndexLimpieza;
                }
            }
            return !(coincidePorEtiqueta || coincidePorFecha);
        });

        listaVehiculos.forEach(v => {
            v.viajes = 0;
        });

        // Limpiamos los cupos automáticos de Arsitrans/Polar antes de
        // regenerar este mes. A partir de ahora la regla es POR MES: si el
        // cupo no tiene ningún viaje en EL MES que se está regenerando, se
        // borra — sin importar si tiene viajes en otros meses (esos meses
        // ya quedaron guardados en su propia "foto" del historial, así que
        // no se ven afectados por este borrado). Como en este punto ya se
        // limpiaron los viajes del mes actual (arriba), cualquier cupo
        // automático simplemente se borra aquí y, si el mes todavía lo
        // necesita, el bucle de abajo lo vuelve a crear desde cero con
        // numeración limpia. Los que sí se agregaron a mano nunca tienen
        // "origenAuto" ni el patrón de nombre, así que nunca se tocan aquí.
        const patronCupoNumerado = /^(POLAR|ARSITRANS)\s+\d+$/i;
        const antesDeLimpiar = listaVehiculos.length;
        for (let i = listaVehiculos.length - 1; i >= 0; i--) {
            const v = listaVehiculos[i];
            const placaV = String(v.p || v.placa || '').toUpperCase().trim();
            const esOrigenAuto = v.origenAuto === true || v.origenAuto === 'true' || v.origenAuto === 'TRUE' || v.origenAuto === 1;
            const esCupoNumerado = patronCupoNumerado.test(placaV);
            if (esOrigenAuto || esCupoNumerado) {
                listaVehiculos.splice(i, 1);
            }
        }
        if (listaVehiculos.length !== antesDeLimpiar) {
            console.log(`🧹 Se limpiaron ${antesDeLimpiar - listaVehiculos.length} cupo(s) automático(s) sin viajes vigentes.`);
        }
        data.vehiculos = listaVehiculos;

        // Antes de inicializar la disponibilidad, calculamos si algún
        // vehículo todavía está "en tránsito" arrastrado de un mes
        // anterior — es decir, si su último viaje conocido (de CUALQUIER
        // mes, no solo el que se está generando) todavía no llega a su
        // fecha real de liberación. Sin esto, un vehículo que salió el 30
        // de julio con 4 días de tránsito (libre hasta el 4 de agosto)
        // quedaba "libre desde siempre" al generar agosto, y el día 1 se
        // le asignaba un viaje nuevo encima del tránsito anterior.
        const ultimaLiberacionPorPlaca = {};
        (data.viajes || []).forEach(v => {
            const placaV = String(v.p || v.placa || '').toUpperCase().trim();
            if (!placaV || !v.fecha) return;
            const diaV = Number(v.dia || v.salida || 0);
            const retornoV = Number(v.retorno || diaV);
            const diasBloqueadoV = retornoV - diaV;
            if (!diaV || isNaN(diasBloqueadoV)) return;

            const fechaSalidaV = new Date(v.fecha + 'T00:00:00');
            if (isNaN(fechaSalidaV.getTime())) return;

            const fechaLiberacionV = new Date(fechaSalidaV);
            fechaLiberacionV.setDate(fechaLiberacionV.getDate() + diasBloqueadoV);
            const tsLiberacionV = fechaLiberacionV.getTime();

            if (!ultimaLiberacionPorPlaca[placaV] || tsLiberacionV > ultimaLiberacionPorPlaca[placaV]) {
                ultimaLiberacionPorPlaca[placaV] = tsLiberacionV;
            }
        });

        const controlDisponibilidad = {};
        listaVehiculos.forEach(v => {
            const placaStr = String(v.p || v.placa || '').toUpperCase().trim();
            if (placaStr) controlDisponibilidad[placaStr] = ultimaLiberacionPorPlaca[placaStr] || 0;
        });

        const totalDiasMes = new Date(anio, mesIndex + 1, 0).getDate();
        let viajesEstructurados = 0;

        // Cupos automáticos de Arsitrans/Polar de este mes — cada uno con su
        // propia placa numerada, PERO reutilizable: si un cupo ya hizo su
        // viaje y ya volvió, se le puede asignar el siguiente en vez de
        // crear uno nuevo cada vez. Solo se crea un cupo nuevo cuando
        // ninguno de los existentes está libre todavía ese día.
        let contadorCupoArsitrans = 0;
        let contadorCupoPolar = 0;
        const cupoVehiculosArsitrans = []; // { placa, disponibleDesde }
        const cupoVehiculosPolar = [];

        for (let dia = 1; dia <= totalDiasMes; dia++) {
            const fechaActual = new Date(anio, mesIndex, dia);
            const yyyy = fechaActual.getFullYear();
            const mm = String(fechaActual.getMonth() + 1).padStart(2, '0');
            const dd = String(fechaActual.getDate()).padStart(2, '0');
            const fechaString = `${yyyy}-${mm}-${dd}`;

            // Antes, un día festivo se saltaba por completo (con
            // "continue"), sin generar absolutamente nada — ni para la
            // flota propia, ni para Arsitrans/Polar. Pero cada ruta ya
            // trae su propio horario de "festivo" ("fes") en el
            // formulario de Rutas, separado de los días normales de la
            // semana. Así que en vez de saltarnos el día, usamos ESE
            // horario para decidir qué rutas sí corren ese día festivo.
            const esFestivo = !!(festivos && festivos.includes(fechaString));

            const abrevDiaActual = mapaDiasAbrev[fechaActual.getDay()];
            const mapaDiasClave = { 0: 'dom', 1: 'lun', 2: 'mar', 3: 'mie', 4: 'jue', 5: 'vie', 6: 'sab' };
            const claveDiaActual = esFestivo ? 'fes' : mapaDiasClave[fechaActual.getDay()];

            const rutasDelDia = listaRutas.filter(r => {
                // Preferimos el objeto real "dias" (el que arma tu formulario
                // actual de Rutas) — solo si la ruta no lo tiene, usamos el
                // texto viejo "horaBase" como respaldo para rutas antiguas.
                if (r.dias && typeof r.dias === 'object') {
                    const cfgDia = r.dias[claveDiaActual];
                    return !!(cfgDia && cfgDia.checked);
                }
                const hBase = String(r.horaBase || '').trim();
                if (!hBase || hBase === 'Variable') return true; 
                return hBase.includes(abrevDiaActual);
            });

            for (const ruta of rutasDelDia) {
                const timestampActual = fechaActual.getTime();

                const vehiculosDisponibles = listaVehiculos
                    .filter(v => {
                        const p = String(v.p || v.placa || '').toUpperCase().trim();
                        if (!p || controlDisponibilidad[p] === undefined || controlDisponibilidad[p] > timestampActual) return false;

                        // Arsitrans y Polar (cualquier vehículo con esa
                        // transportadora — el viejo "ARSI-?"/"POLAR-?" o los
                        // cupos numerados) NUNCA compiten en el reparto
                        // normal de la flota propia. Solo deben aparecer
                        // cuando de verdad falta un vehículo propio, a
                        // través del relleno automático (más abajo). Si no
                        // se excluyen aquí, absorben huecos que deberían
                        // ir al relleno, y el día se ve "cubierto" sin que
                        // el relleno automático siquiera se active.
                        const empresaVeh = String(v.transportadora || v.tr || '').toLowerCase();
                        if (empresaVeh.includes('arsitran') || empresaVeh.includes('polar')) return false;

                        // Si este vehículo tiene una rutina restringida (como
                        // LUN 428, solo Barranquilla/Montería), lo saltamos
                        // para cualquier otra ruta — así el hueco lo cubre
                        // otro vehículo propio, o si no hay ninguno, el
                        // relleno automático de Arsitrans/Polar.
                        return rutaPermitidaParaVehiculo(p, ruta);
                    })
                    .sort((a, b) => {
                        const pA = String(a.p || a.placa || '').toUpperCase().trim();
                        const pB = String(b.p || b.placa || '').toUpperCase().trim();
                        
                        if (controlDisponibilidad[pA] !== controlDisponibilidad[pB]) {
                            return controlDisponibilidad[pA] - controlDisponibilidad[pB];
                        }
                        return (a.viajes || 0) - (b.viajes || 0);
                    });

                if (vehiculosDisponibles.length > 0) {
                    const vehiculoAsignado = vehiculosDisponibles[0];
                    const placaAsignada = String(vehiculoAsignado.p || vehiculoAsignado.placa || '').toUpperCase().trim();

                    vehiculoAsignado.viajes = (vehiculoAsignado.viajes || 0) + 1;

                    const diasBloqueado = Number(ruta.diasTrans || 1);

                    // El vehículo queda libre el día SIGUIENTE a que termina
                    // su tránsito. "diasTrans" cuenta los días de tránsito
                    // después de la salida (sin contar el propio día de
                    // salida): diasTrans=1 -> sale lunes, el martes está en
                    // tránsito, el miércoles ya puede tomar otra ruta.
                    // diasTrans=2 -> sale lunes, martes y miércoles en
                    // tránsito, libre el jueves.
                    const fechaLiberacion = new Date(fechaActual);
                    fechaLiberacion.setDate(fechaLiberacion.getDate() + diasBloqueado + 1);
                    
                    controlDisponibilidad[placaAsignada] = fechaLiberacion.getTime();

                    let tarifaFinal = Number(ruta.tarifa || 0);
                    const empresa = String(vehiculoAsignado.transportadora || '').trim().toLowerCase();

                    if (empresa.includes('makan')) tarifaFinal = Number(ruta.tarifaMakand || tarifaFinal);
                    if (empresa.includes('arsitran')) tarifaFinal = Number(ruta.tarifaArsitran || ruta.tarifaArsitrans || tarifaFinal);
                    if (empresa.includes('polar')) tarifaFinal = Number(ruta.tarifaPolar || tarifaFinal);

                    const registroViaje = {
                        id: `${placaAsignada}-${fechaString}-${ruta.cod || ruta.codigo || ''}`, // ÚNICO por vehículo+fecha+ruta — sin esto, la app confunde un viaje con otro al abrir sus detalles
                        codigo: ruta.cod || ruta.codigo || '',
                        ruta: ruta.cod || ruta.codigo || '', // agruparViajes() busca "ruta", no solo "codigo"
                        destino: ruta.dest || ruta.destino || '',
                        cliente: String(ruta.clientes || '').split(',')[0].trim() || 'Sin Cliente',
                        placa: placaAsignada,
                        p: placaAsignada, 
                        transportadora: vehiculoAsignado.transportadora || '',
                        tr: vehiculoAsignado.transportadora || '',
                        fecha: fechaString,
                        dia: dia, // día del mes (entero) — varias partes de la app lo usan como respaldo
                        salida: dia, // OBLIGATORIO para agruparViajes(): sin esto, el viaje nunca aparece en el Rutograma
                        retorno: dia + diasBloqueado + 1, // día en que el vehículo queda libre — un día después de terminar el tránsito (ver comentario arriba)
                        cajas: Number(ruta.cajasMin || 660),
                        mes: mes,
                        anio: Number(anio),
                        tarifa: tarifaFinal,
                        costo: tarifaFinal,
                        estado: 'Planificado'
                    };

                    data.viajes.push(registroViaje);
                    viajesEstructurados++;
                } else {
                    // No hay vehículo propio libre ese día — en vez de dejar
                    // la ruta sin cubrir, se completa con un cupo externo.
                    // Regla: clientes "Ara" van a Arsitrans; cualquier otro
                    // cliente (D1, Éxito, etc.) va a Polar — así el día
                    // siempre queda completo, con todas las rutas que le
                    // tocaban, aunque la flota propia no alcance.
                    const clienteRuta = String(ruta.clientes || '').toLowerCase();
                    const nombreTrCupo = clienteRuta.includes('ara') ? 'Arsitrans' : 'Polar';
                    const poolCupo = nombreTrCupo === 'Arsitrans' ? cupoVehiculosArsitrans : cupoVehiculosPolar;
                    const timestampActualCupo = fechaActual.getTime();

                    // ¿Hay algún cupo de esta transportadora que ya volvió y
                    // está libre? Si sí, se reutiliza — si no, se crea uno
                    // nuevo (y ese pasa a estar disponible para la próxima).
                    let cupoReutilizable = poolCupo.find(c => c.disponibleDesde <= timestampActualCupo);
                    let placaCupo;
                    if (cupoReutilizable) {
                        placaCupo = cupoReutilizable.placa;
                    } else {
                        if (nombreTrCupo === 'Arsitrans') {
                            contadorCupoArsitrans++;
                            placaCupo = `ARSITRANS ${contadorCupoArsitrans}`;
                        } else {
                            contadorCupoPolar++;
                            placaCupo = `POLAR ${contadorCupoPolar}`;
                        }
                        cupoReutilizable = { placa: placaCupo, disponibleDesde: 0 };
                        poolCupo.push(cupoReutilizable);
                    }

                    // Arsitrans y Polar son terceros con su propia flota — no
                    // les aplican los días de tránsito de tus vehículos
                    // propios. Quedan libres al día siguiente sin importar
                    // cuántos días de tránsito tenga la ruta.
                    const diasBloqueadoCupo = 1;

                    const fechaLiberacionCupo = new Date(fechaActual);
                    fechaLiberacionCupo.setDate(fechaLiberacionCupo.getDate() + diasBloqueadoCupo);
                    cupoReutilizable.disponibleDesde = fechaLiberacionCupo.getTime();

                    let tarifaFinalCupo = Number(ruta.tarifa || 0);
                    if (nombreTrCupo === 'Arsitrans') tarifaFinalCupo = Number(ruta.tarifaArsitran || ruta.tarifaArsitrans || tarifaFinalCupo);
                    if (nombreTrCupo === 'Polar') tarifaFinalCupo = Number(ruta.tarifaPolar || tarifaFinalCupo);

                    const registroViajeCupo = {
                        id: `${placaCupo}-${fechaString}-${ruta.cod || ruta.codigo || ''}`,
                        codigo: ruta.cod || ruta.codigo || '',
                        ruta: ruta.cod || ruta.codigo || '',
                        destino: ruta.dest || ruta.destino || '',
                        cliente: String(ruta.clientes || '').split(',')[0].trim() || 'Sin Cliente',
                        placa: placaCupo,
                        p: placaCupo,
                        transportadora: nombreTrCupo,
                        tr: nombreTrCupo,
                        fecha: fechaString,
                        dia: dia,
                        salida: dia,
                        retorno: dia + diasBloqueadoCupo,
                        cajas: Number(ruta.cajasMin || 660),
                        mes: mes,
                        anio: Number(anio),
                        tarifa: tarifaFinalCupo,
                        costo: tarifaFinalCupo,
                        estado: 'Planificado'
                    };

                    data.viajes.push(registroViajeCupo);
                    viajesEstructurados++;

                    // Creamos el "vehículo" de este cupo si es la primera vez
                    // que se usa esta placa en la corrida — así aparece con
                    // su propia fila en la tabla de Vehículos, igual que los
                    // que se agregan a mano desde el Rutograma.
                    const yaExisteVehiculoCupo = listaVehiculos.some(v => String(v.p || v.placa || '').toUpperCase().trim() === placaCupo.toUpperCase());
                    if (!yaExisteVehiculoCupo) {
                        const nuevoVehiculoCupo = {
                            p: placaCupo, placa: placaCupo, veh: placaCupo,
                            t: 'Furgon refrigerado', tipo: 'Furgon refrigerado',
                            cap: 600, kg: 12000, m3: 45,
                            cond: 'Sin asignar', conductor: 'Sin asignar',
                            tr: nombreTrCupo, transportadora: nombreTrCupo,
                            est: 'Disponible', estado: 'Disponible',
                            viajes: 0, dc: 0, dm: 1, dl: 2,
                            mantInicio: null, mantFin: null, um: '',
                            // Marca para saber que este vehículo lo creó el
                            // propio "Generar Matriz" (no una persona a
                            // mano) — así, si en una regeneración futura ya
                            // no le queda ningún viaje asignado en NINGÚN
                            // mes, se puede borrar solo sin tocar los que
                            // sí se agregaron manualmente.
                            origenAuto: true
                        };
                        listaVehiculos.push(nuevoVehiculoCupo);
                        data.vehiculos = listaVehiculos;
                        // OJO: a propósito NO se registra en controlDisponibilidad.
                        // Si lo hiciéramos, el motor podría reutilizar esta misma
                        // placa para OTRA ruta distinta más adelante, como si
                        // fuera un vehículo real de la flota — rompiendo la idea
                        // de "una placa nueva por cada hueco sin cubrir". Cada
                        // cupo automático es de un solo uso.
                    }

                    console.log(`ℹ️ Sin flota propia libre para [${ruta.cod}] el ${fechaString} — se completó con ${placaCupo}.`);
                }
            }
        }

        // --- HISTÓRICO MENSUAL: guardamos una "foto" de cómo quedaron
        // configurados los vehículos y las rutas justo en el momento de
        // generar la matriz de este mes — es el punto donde de verdad se
        // "define" ese mes. Si ya existía una foto para este mes/año, la
        // reemplazamos (por si regeneras el mismo mes más de una vez).
        if (!data.historialvehiculos) data.historialvehiculos = [];
        if (!data.historialrutas) data.historialrutas = [];
        if (!data.historialconductores) data.historialconductores = [];

        data.historialvehiculos = data.historialvehiculos.filter(h => !(h.mes === mes && String(h.anio) === String(anio)));
        data.historialvehiculos.push({ mes, anio: Number(anio), datos: JSON.parse(JSON.stringify(data.vehiculos || [])) });

        data.historialrutas = data.historialrutas.filter(h => !(h.mes === mes && String(h.anio) === String(anio)));
        data.historialrutas.push({ mes, anio: Number(anio), datos: JSON.parse(JSON.stringify(data.rutas || [])) });

        data.historialconductores = data.historialconductores.filter(h => !(h.mes === mes && String(h.anio) === String(anio)));
        data.historialconductores.push({ mes, anio: Number(anio), datos: JSON.parse(JSON.stringify(data.conductores || [])) });

        guardarEnExcel(data);

        return res.status(200).json({
            ok: true,
            total: viajesEstructurados,
            msg: `Se estructuró la programación mensual de ${mes} de manera exitosa.`
        });

    } catch (error) {
        console.error("🚨 Error crítico en el motor de matriz:", error);
        return res.status(500).json({ 
            ok: false, 
            msg: `Error interno en el servidor: ${error.message}` 
        });
    }
});

// --- INICIO DEL SERVIDOR ---
const PORT = 5000;
// --- HISTÓRICO MENSUAL: consultar la foto de vehículos/rutas de un mes ---
app.get('/api/historial-vehiculos', (req, res) => {
    try {
        const { mes, anio } = req.query;
        if (!mes || !anio) {
            return res.status(400).json({ ok: false, msg: 'Faltan parámetros (mes o año).' });
        }
        const data = leerExcel();
        const fila = (data.historialvehiculos || []).find(h => h.mes === mes && String(h.anio) === String(anio));
        return res.status(200).json({ ok: true, vehiculos: fila ? (fila.datos || []) : [] });
    } catch (error) {
        console.error('❌ Error leyendo historial de vehículos:', error);
        return res.status(500).json({ ok: false, msg: 'Error interno del servidor.' });
    }
});

app.get('/api/historial-rutas', (req, res) => {
    try {
        const { mes, anio } = req.query;
        if (!mes || !anio) {
            return res.status(400).json({ ok: false, msg: 'Faltan parámetros (mes o año).' });
        }
        const data = leerExcel();
        const fila = (data.historialrutas || []).find(h => h.mes === mes && String(h.anio) === String(anio));
        return res.status(200).json({ ok: true, rutas: fila ? (fila.datos || []) : [] });
    } catch (error) {
        console.error('❌ Error leyendo historial de rutas:', error);
        return res.status(500).json({ ok: false, msg: 'Error interno del servidor.' });
    }
});

app.get('/api/historial-conductores', (req, res) => {
    try {
        const { mes, anio } = req.query;
        if (!mes || !anio) {
            return res.status(400).json({ ok: false, msg: 'Faltan parámetros (mes o año).' });
        }
        const data = leerExcel();
        const fila = (data.historialconductores || []).find(h => h.mes === mes && String(h.anio) === String(anio));
        return res.status(200).json({ ok: true, conductores: fila ? (fila.datos || []) : [] });
    } catch (error) {
        console.error('❌ Error leyendo historial de conductores:', error);
        return res.status(500).json({ ok: false, msg: 'Error interno del servidor.' });
    }
});

// --- EXPORTAR RUTOGRAMA: arma un Excel descargable con los viajes de un mes ---
app.get('/api/exportar-rutograma', (req, res) => {
    try {
        const { mes, anio } = req.query;
        if (!mes || !anio) {
            return res.status(400).json({ ok: false, msg: 'Faltan parámetros (mes o año).' });
        }
        const data = leerExcel();

        const viajesDelMes = (data.viajes || []).filter(v => v.mes === mes && String(v.anio) === String(anio));
        viajesDelMes.sort((a, b) => {
            const pA = String(a.p || a.placa || '');
            const pB = String(b.p || b.placa || '');
            if (pA !== pB) return pA.localeCompare(pB);
            return Number(a.dia) - Number(b.dia);
        });

        const filas = viajesDelMes.map(v => ({
            Vehiculo: v.p || v.placa || '',
            Transportadora: v.tr || v.transportadora || '',
            Dia: v.dia,
            Fecha: v.fecha || '',
            Ruta: v.ruta || v.codigo || '',
            Destino: v.destino || '',
            Cliente: v.cliente || '',
            Cajas: v.cajas || 0,
            Salida: v.salida,
            Retorno: v.retorno,
            Estado: v.estado || '',
            Tarifa: v.tarifa || 0
        }));

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(filas);
        XLSX.utils.book_append_sheet(wb, ws, 'Rutograma');

        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="Rutograma_${mes}_${anio}.xlsx"`);
        return res.send(buffer);
    } catch (error) {
        console.error('❌ Error exportando rutograma:', error);
        return res.status(500).json({ ok: false, msg: 'Error interno del servidor.' });
    }
});

// --- MIGRACIÓN ÚNICA: ajustar días de tránsito según el tipo de ruta ---
// Corta = 1 día, Media = 2 días, Larga = 3 días. Se puede borrar este
// endpoint después de usarlo una vez.
app.get('/api/migrar-dias-transito', (req, res) => {
    try {
        const data = leerExcel();
        const cambios = [];

        (data.rutas || []).forEach(r => {
            const tipo = String(r.tipo || '').toLowerCase().trim();
            let nuevoDias = null;
            if (tipo === 'corta') nuevoDias = 1;
            else if (tipo === 'media') nuevoDias = 1;
            else if (tipo === 'larga') nuevoDias = 2;

            if (nuevoDias !== null && Number(r.diasTrans) !== nuevoDias) {
                cambios.push({ ruta: r.cod || r.codigo, antes: r.diasTrans, ahora: nuevoDias });
                r.diasTrans = nuevoDias;
            }
        });

        guardarEnExcel(data);
        return res.status(200).json({ ok: true, cambios });
    } catch (error) {
        console.error('❌ Error en migración de días de tránsito:', error);
        return res.status(500).json({ ok: false, msg: 'Error interno del servidor.' });
    }
});

// --- LIMPIEZA ÚNICA: borrar cupos POLAR/ARSITRANS numerados que ya no
// tienen ningún viaje en ningún mes (los que quedaron de pruebas
// anteriores, antes de que existiera la marca "origenAuto"). Se puede
// borrar este endpoint después de usarlo una vez.
app.get('/api/limpiar-cupos-huerfanos', (req, res) => {
    try {
        const data = leerExcel();
        const placasConViaje = new Set(
            (data.viajes || []).map(v => String(v.p || v.placa || '').toUpperCase().trim())
        );

        const patronCupoNumerado = /^(POLAR|ARSITRANS)\s+\d+$/i;
        const eliminados = [];

        data.vehiculos = (data.vehiculos || []).filter(v => {
            const placaV = String(v.p || v.placa || '').toUpperCase().trim();
            const esCupoNumerado = patronCupoNumerado.test(placaV);
            if (esCupoNumerado && !placasConViaje.has(placaV)) {
                eliminados.push(placaV);
                return false;
            }
            return true;
        });

        guardarEnExcel(data);
        return res.status(200).json({ ok: true, eliminados });
    } catch (error) {
        console.error('❌ Error limpiando cupos huérfanos:', error);
        return res.status(500).json({ ok: false, msg: 'Error interno del servidor.' });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor backend corriendo en: http://localhost:${PORT}`);
});