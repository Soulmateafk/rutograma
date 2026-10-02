const express = require('express');
const cors = require('cors');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const net = require('net');
const tls = require('tls');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

// ⚠️ Ajusta esta ruta si tu carpeta se llama distinto a "migracion"
// (la carpeta donde pusiste esquema.sql/db.js/migrar.js).
const { rangosMantenimiento, diasOcupadoViaje, mantenimientoQueChoca, agregarSesionConTope, colapsarSesionesDuplicadas, compararParaVariedad, anotarDestino } = require('./reglas');
const { leerLibroViajeros, armarImportacion, aplicarImportacion } = require('./importacion');
const { ROLES_VALIDOS, rolDeCuenta, requiereAprobacion, describirCambio, solicitudPublica, permisosDeCuenta, normalizarPermisos, necesitaAprobacion } = require('./aprobaciones');

// Marca secreta (cambia en cada arranque) para que el propio servidor
// vuelva a ejecutar la petición de un auxiliar cuando un jefe la aprueba.
// Solo vive en memoria: nadie de afuera puede conocerla.
const TOKEN_REPLAY_APROBACION = crypto.randomBytes(32).toString('hex');
const { leerDB, guardarEnDB, listarHistoricoMesesDB, guardarHistoricoMesDB, limpiarHistoricoMesesDB, crearRespaldoDB, listarRespaldosDB, restaurarRespaldoDB, registrarAuditoriaDB, listarAuditoriaDB, importarAuditoriaJSONLSiHaceFalta } = require('./migracion/db.js');

// Lee las credenciales de correo desde un archivo .env (nunca escritas
// directo en este código) — ver las instrucciones al final de este
// bloque sobre qué poner en ese archivo.
require('dotenv').config();
const nodemailer = require('nodemailer');

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
// La importación de viajes reales manda el Excel completo (en base64):
// necesita un límite más alto que el resto de la API.
app.use('/api/importar', express.json({ limit: '30mb' }));
// El cierre de mes trae todos los viajes del mes (la foto que se guarda).
app.use('/api/cerrar-mes', express.json({ limit: '20mb' }));
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

const registrarAuditoria = (usuario, metodo, ruta, cuerpo, modo) => {
    try {
        // Nunca guardamos contraseñas ni datos sensibles en el log, aunque
        // vengan en el cuerpo de la petición (ej. /api/auth/register).
        let resumen = {};
        if (cuerpo && typeof cuerpo === 'object') {
            resumen = { ...cuerpo };
            // BUG REAL encontrado y corregido: antes solo se borraban
            // "pass" y "passHash", pero "Restablecer contraseña" manda la
            // clave nueva en "nuevaClave" — así que cada restablecimiento
            // dejaba la contraseña en TEXTO PLANO dentro del registro de
            // auditoría (y de ahí, en los respaldos). Se listan aquí todos
            // los nombres posibles para que no vuelva a pasar con otro.
            // "archivo": el Excel completo de la importación (megas de texto).
            ['pass', 'passHash', 'nuevaClave', 'password', 'clave', 'contrasena', 'token', 'archivo']
                .forEach(campo => delete resumen[campo]);
        }

        const entrada = {
            fecha: new Date().toISOString(),
            usuario: usuario || 'desconocido',
            metodo,
            ruta,
            modo: modo || 'real',
            resumen
        };

        // Migrado de auditoria.jsonl a SQLite (tabla "auditoria", siempre
        // en la base Real — ver el porqué en registrarAuditoriaDB).
        registrarAuditoriaDB(entrada.modo, entrada);
    } catch (err) {
        // Un fallo en el log de auditoría NUNCA debe tumbar la petición real.
        console.error('⚠️ No se pudo registrar la auditoría:', err.message);
    }
};

// Importa una sola vez el historial viejo de auditoria.jsonl a SQLite
// (no hace nada si ya se importó en un arranque anterior, o si el
// archivo no existe). Se hace aquí, al arrancar, para no perder el
// historial de antes de esta migración.
try {
    importarAuditoriaJSONLSiHaceFalta(RUTA_AUDITORIA);
} catch (err) {
    console.error('⚠️ No se pudo importar el historial viejo de auditoría:', err.message);
}

// ============================================================================
// SESIONES CON "PASE" (TOKEN) FIRMADO
// ============================================================================
// Antes, el servidor le creía a cualquiera que escribiera un correo en la
// cabecera x-user-email — sin contraseña ni nada que lo demostrara — y una
// petición sin ningún correo simplemente pasaba. Ahora, al iniciar sesión
// con la contraseña correcta el servidor entrega un "pase": un texto firmado
// con una llave que solo el servidor conoce (HMAC-SHA256). El navegador lo
// manda en cada petición (cabecera Authorization) y el servidor lo verifica:
// si es válido, el correo del pase REEMPLAZA a la cabecera x-user-email —
// así todo el código que ya usa esa cabecera (roles, administrador,
// auditoría) pasa a usar una identidad que nadie puede falsificar, sin
// tener que tocar endpoint por endpoint.
//
// Dos modos (variable EXIGIR_TOKEN en el .env):
//  - TOLERANTE (por defecto): se aceptan peticiones sin pase como antes, pero
//    se avisa en la consola por cada ruta que llegue así — para poder
//    comprobar que la app ya manda el pase en todas partes antes de exigirlo.
//  - ESTRICTO (EXIGIR_TOKEN=true): toda petición a /api/ necesita un pase
//    válido (salvo login y registro), y la cuenta debe estar aprobada.
//
// El pase también deja de servir en cuanto: vence (30 días), la cuenta se
// elimina, o su contraseña cambia (restablecer contraseña cierra las
// sesiones abiertas de esa cuenta).
const EXIGIR_TOKEN = String(process.env.EXIGIR_TOKEN || '').trim().toLowerCase() === 'true';
const TOKEN_DIAS = (() => { const d = parseFloat(process.env.TOKEN_DIAS); return (Number.isFinite(d) && d > 0) ? d : 30; })();
const RUTAS_PUBLICAS_SIN_PASE = ['/api/auth/login', '/api/auth/register'];
// Rutas para las que basta estar identificado, aunque la cuenta aún no esté
// aprobada (en modo estricto, el resto exige cuenta APPROVED).
const RUTAS_PARA_CUALQUIER_CUENTA = ['/api/auth/estado'];

const ARCHIVO_SECRETO_SESION = path.join(CARPETA_DATOS, 'secreto-sesion.key');
const obtenerSecretoSesion = () => {
    const delEnv = String(process.env.AUTH_SECRET || '').trim();
    if (delEnv.length >= 32) return delEnv;
    try {
        if (fs.existsSync(ARCHIVO_SECRETO_SESION)) {
            const guardado = fs.readFileSync(ARCHIVO_SECRETO_SESION, 'utf8').trim();
            if (guardado.length >= 32) return guardado;
        }
        const nuevo = crypto.randomBytes(48).toString('hex');
        fs.writeFileSync(ARCHIVO_SECRETO_SESION, nuevo, { mode: 0o600 });
        console.log('🔑 Se creó la llave con la que se firman las sesiones (data/secreto-sesion.key). No la compartas ni la subas a ningún lado.');
        return nuevo;
    } catch (err) {
        // Sin poder guardarla, las sesiones se invalidan cada vez que se
        // reinicia el servidor: incómodo, pero seguro.
        console.error(`⚠️ No se pudo guardar la llave de sesiones (${err.message}). Las sesiones se cerrarán cada vez que se reinicie el servidor.`);
        return crypto.randomBytes(48).toString('hex');
    }
};
const SECRETO_SESION = obtenerSecretoSesion();

const firmarTexto = (texto) => crypto.createHmac('sha256', SECRETO_SESION).update(texto).digest('base64url');
// "Huella" de la contraseña guardada: viaja dentro del pase, así que si la
// contraseña cambia, todos los pases anteriores de esa cuenta dejan de servir.
const huellaClave = (passHash) => crypto.createHash('sha256').update(String(passHash || '')).digest('hex').slice(0, 16);

const crearPase = (cuenta, sid) => {
    const carga = {
        e: String(cuenta.email || '').toLowerCase().trim(),
        pv: huellaClave(cuenta.passHash),
        s: sid || undefined,
        exp: Math.floor(Date.now() / 1000 + TOKEN_DIAS * 86400)
    };
    const cuerpo = 'v1.' + Buffer.from(JSON.stringify(carga)).toString('base64url');
    return `${cuerpo}.${firmarTexto(cuerpo)}`;
};

const verificarPase = (pase) => {
    const partes = String(pase || '').split('.');
    if (partes.length !== 3 || partes[0] !== 'v1') return { ok: false, motivo: 'formato' };
    const esperada = Buffer.from(firmarTexto(`${partes[0]}.${partes[1]}`));
    const recibida = Buffer.from(partes[2]);
    if (esperada.length !== recibida.length || !crypto.timingSafeEqual(esperada, recibida)) return { ok: false, motivo: 'firma' };
    let carga;
    try { carga = JSON.parse(Buffer.from(partes[1], 'base64url').toString('utf8')); }
    catch { return { ok: false, motivo: 'formato' }; }
    if (!carga || !carga.e || !carga.exp) return { ok: false, motivo: 'formato' };
    if (carga.exp < Math.floor(Date.now() / 1000)) return { ok: false, motivo: 'vencido' };
    return { ok: true, email: carga.e, pv: carga.pv, sid: carga.s || null };
};

// ----------------------------------------------------------------------------
// SESIONES ACTIVAS (para ver desde dónde hay sesiones abiertas y poder cerrarlas)
// ----------------------------------------------------------------------------
// Cada inicio de sesión crea un registro con un id que viaja dentro del pase.
// Si el registro se borra (el usuario la cierra desde "Sesiones activas", cierra
// sesión, o el admin la saca), ese pase deja de servir aunque no haya vencido.
// Los pases emitidos ANTES de esta función no tienen id: siguen valiendo hasta
// que venzan, pero no aparecen en la lista.
const ARCHIVO_SESIONES = path.join(CARPETA_DATOS, 'sesiones-activas.json');
// Máximo de sesiones abiertas a la vez por cuenta.
const MAX_SESIONES_POR_CUENTA = 5;
let sesionesActivas = (() => {
    try {
        if (fs.existsSync(ARCHIVO_SESIONES)) {
            const lista = JSON.parse(fs.readFileSync(ARCHIVO_SESIONES, 'utf8'));
            if (Array.isArray(lista)) return lista;
        }
    } catch (err) {
        console.error('⚠️ No se pudo leer sesiones-activas.json:', err.message);
    }
    return [];
})();

let guardadoSesionesPendiente = null;
const escribirSesionesAhora = () => {
    try {
        fs.writeFileSync(ARCHIVO_SESIONES, JSON.stringify(sesionesActivas), { mode: 0o600 });
    } catch (err) {
        console.error('⚠️ No se pudo guardar sesiones-activas.json:', err.message);
    }
};
const guardarSesiones = () => {
    if (guardadoSesionesPendiente) return;
    guardadoSesionesPendiente = setTimeout(() => {
        guardadoSesionesPendiente = null;
        escribirSesionesAhora();
    }, 1500);
};
// BUG REAL encontrado y corregido: el guardado de sesiones se demora
// 1.5s a propósito (para no escribir el archivo en cada pequeño cambio),
// pero si el servidor se detiene (Ctrl+C, un reinicio, un gestor de
// procesos) DENTRO de esa ventana, esa última escritura nunca llegaba a
// pasar — se perdían sesiones recién creadas o recién cerradas, y al
// volver a arrancar, pases que deberían seguir siendo válidos (o que
// deberían seguir cerrados) quedaban en el estado de la versión vieja
// en disco. Lo reprodujimos de verdad: tras un reinicio limpio, hasta
// la sesión del administrador (que nadie había tocado) dejaba de servir.
// Ahora, al recibir la señal de apagado, se vuelca lo que haya pendiente
// de inmediato y de forma síncrona antes de salir.
const volcarSesionesAlSalir = () => {
    if (guardadoSesionesPendiente) {
        clearTimeout(guardadoSesionesPendiente);
        guardadoSesionesPendiente = null;
    }
    escribirSesionesAhora();
};
process.on('SIGINT', () => { volcarSesionesAlSalir(); process.exit(0); });
process.on('SIGTERM', () => { volcarSesionesAlSalir(); process.exit(0); });
process.on('exit', volcarSesionesAlSalir);

const purgarSesionesVencidas = () => {
    const ahora = Date.now();
    const antes = sesionesActivas.length;
    sesionesActivas = sesionesActivas.filter(x => Date.parse(x.expira) > ahora);
    if (sesionesActivas.length !== antes) guardarSesiones();
};
purgarSesionesVencidas();
// Duplicados de un mismo equipo que quedaron de antes (ver mismoEquipo en
// reglas.js): se deja solo la sesión usada más recientemente.
(() => {
    const antes = sesionesActivas.length;
    sesionesActivas = colapsarSesionesDuplicadas(sesionesActivas);
    if (sesionesActivas.length !== antes) {
        console.log(`🧹 Se juntaron ${antes - sesionesActivas.length} sesión(es) duplicadas del mismo equipo.`);
        guardarSesiones();
    }
})();
setInterval(purgarSesionesVencidas, 60 * 60 * 1000).unref();

const ipDeLaPeticion = (req) => {
    const reenviada = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    let ip = reenviada || req.socket?.remoteAddress || '';
    ip = ip.replace(/^::ffff:/, '');
    if (ip === '::1' || ip === '127.0.0.1') return 'Este mismo equipo (localhost)';
    return ip || 'Desconocida';
};

const describirDispositivo = (ua) => {
    ua = String(ua || '');
    const navegador =
        /Edg\//.test(ua) ? 'Edge' :
        /OPR\/|Opera/.test(ua) ? 'Opera' :
        /Firefox\//.test(ua) ? 'Firefox' :
        /Chrome\//.test(ua) ? 'Chrome' :
        /Safari\//.test(ua) ? 'Safari' : 'Navegador desconocido';
    const sistema =
        /Windows/.test(ua) ? 'Windows' :
        /Android/.test(ua) ? 'Android' :
        /iPhone|iPad|iOS/.test(ua) ? 'iOS' :
        /Mac OS X|Macintosh/.test(ua) ? 'macOS' :
        /Linux/.test(ua) ? 'Linux' : 'sistema desconocido';
    return `${navegador} en ${sistema}`;
};

const crearSesion = (email, req, dispositivoId) => {
    const ahora = new Date();
    const sesion = {
        id: crypto.randomBytes(12).toString('hex'),
        email: normalizarEmail(email),
        ip: ipDeLaPeticion(req),
        dispositivo: describirDispositivo(req.headers['user-agent']),
        // Id que el propio navegador genera y guarda la primera vez que entra
        // (ver account.service.ts) — es lo que permite reconocer "ese mismo
        // computador" después, para poder bloquearlo si alguien lo saca.
        // Puede venir vacío en un navegador viejo, de antes de esta función.
        dispositivoId: String(dispositivoId || '').trim() || null,
        creada: ahora.toISOString(),
        ultima: ahora.toISOString(),
        expira: new Date(ahora.getTime() + TOKEN_DIAS * 86400000).toISOString()
    };
    // Mismo dispositivo = reemplaza su sesión anterior; y si la cuenta
    // se pasa de MAX_SESIONES_POR_CUENTA, se cierran las que llevan más
    // tiempo sin usarse (ver agregarSesionConTope en reglas.js).
    const resultadoTope = agregarSesionConTope(sesionesActivas, sesion, MAX_SESIONES_POR_CUENTA);
    sesionesActivas = resultadoTope.sesiones;
    if (resultadoTope.cerradasPorTope > 0) {
        // Para avisarle a quien acaba de entrar (ver /api/auth/login).
        if (req) req.sesionesCerradasPorTope = resultadoTope.cerradasPorTope;
        console.log(`🔒 ${sesion.email} llegó al máximo de ${MAX_SESIONES_POR_CUENTA} sesiones — se cerraron ${resultadoTope.cerradasPorTope} sin usar.`);
    }
    guardarSesiones();
    return sesion.id;
};


// ----------------------------------------------------------------------------
// DISPOSITIVOS BLOQUEADOS — "Sacar" una sesión ahora también le impide a ESE
// mismo computador volver a entrar solo con la contraseña. Sin esto, "Sacar"
// era más limpieza que seguridad: si alguien más de verdad tenía tu
// contraseña, con solo volver a escribirla entraba otra vez sin ningún
// obstáculo. Ahora, para que ese dispositivo vuelva a entrar, el
// administrador tiene que desbloquearlo a mano desde el panel — sin
// depender del correo (que además no le llegaría a cualquier cuenta, por el
// filtro de destinatarios).
// ----------------------------------------------------------------------------
const ARCHIVO_DISPOSITIVOS_BLOQUEADOS = path.join(CARPETA_DATOS, 'dispositivos-bloqueados.json');
let dispositivosBloqueados = (() => {
    try {
        if (fs.existsSync(ARCHIVO_DISPOSITIVOS_BLOQUEADOS)) {
            const lista = JSON.parse(fs.readFileSync(ARCHIVO_DISPOSITIVOS_BLOQUEADOS, 'utf8'));
            if (Array.isArray(lista)) return lista;
        }
    } catch (err) {
        console.error('⚠️ No se pudo leer dispositivos-bloqueados.json:', err.message);
    }
    return [];
})();

const escribirDispositivosBloqueadosAhora = () => {
    try {
        fs.writeFileSync(ARCHIVO_DISPOSITIVOS_BLOQUEADOS, JSON.stringify(dispositivosBloqueados), { mode: 0o600 });
    } catch (err) {
        console.error('⚠️ No se pudo guardar dispositivos-bloqueados.json:', err.message);
    }
};

const claveDispositivo = (email, dispositivoId) => `${normalizarEmail(email)}|${String(dispositivoId || '').trim()}`;

const dispositivoEstaBloqueado = (email, dispositivoId) => {
    if (!dispositivoId) return false; // sin id (navegador viejo, antes de esta función) — nunca se bloquea
    const clave = claveDispositivo(email, dispositivoId);
    return dispositivosBloqueados.some(d => claveDispositivo(d.email, d.dispositivoId) === clave);
};

// Se llama al "Sacar" una sesión que no es la propia — bloquea ese
// dispositivo para esa cuenta, guardando algo reconocible (qué navegador
// era, desde qué IP) para que el administrador sepa qué está desbloqueando.
const bloquearDispositivoDeSesion = (sesion) => {
    if (!sesion || !sesion.dispositivoId) return; // sesión de antes de esta función — no hay nada que bloquear
    if (dispositivoEstaBloqueado(sesion.email, sesion.dispositivoId)) return; // ya estaba bloqueado
    dispositivosBloqueados.push({
        email: normalizarEmail(sesion.email),
        dispositivoId: sesion.dispositivoId,
        dispositivo: sesion.dispositivo,
        ip: sesion.ip,
        bloqueadoEn: new Date().toISOString()
    });
    escribirDispositivosBloqueadosAhora();
};

const desbloquearDispositivo = (email, dispositivoId) => {
    const clave = claveDispositivo(email, dispositivoId);
    const antes = dispositivosBloqueados.length;
    dispositivosBloqueados = dispositivosBloqueados.filter(d => claveDispositivo(d.email, d.dispositivoId) !== clave);
    if (dispositivosBloqueados.length !== antes) escribirDispositivosBloqueadosAhora();
    return dispositivosBloqueados.length !== antes;
};

const cerrarSesionesDe = (email) => {
    const correo = normalizarEmail(email);
    sesionesActivas = sesionesActivas.filter(x => x.email !== correo);
    guardarSesiones();
};

const avisosSinPase = new Map();
const registrarPeticionSinPase = (req) => {
    const clave = `${req.method} ${req.path}`;
    const veces = avisosSinPase.get(clave) || 0;
    avisosSinPase.set(clave, veces + 1);
    if (veces === 0) {
        console.log(`⚠️ [SIN PASE] ${clave} llegó sin sesión verificada (usuario declarado: ${req.headers['x-user-email'] || 'ninguno'}). Si esto sigue apareciendo con la app ya actualizada, todavía no conviene activar EXIGIR_TOKEN.`);
    }
};

// Las cuentas se verifican contra la base del modo actual Y contra la base
// REAL. El modo Prueba tiene su propia base, que es una copia vieja de la
// real: si solo se mirara la del modo actual, al entrar a modo Prueba se
// rechazarían los pases de quien se registró (o cambió su contraseña) DESPUÉS
// de esa copia — cambiar de modo sacaría a la gente de la app.
let cacheUsuariosReales = { ts: 0, usuarios: [] };
const usuariosDeLaBaseReal = () => {
    if (Date.now() - cacheUsuariosReales.ts < 10000) return cacheUsuariosReales.usuarios;
    try {
        cacheUsuariosReales = { ts: Date.now(), usuarios: leerDB('real').usuarios || [] };
    } catch (err) {
        console.error('⚠️ No se pudieron leer las cuentas de la base real:', err.message);
        cacheUsuariosReales = { ts: Date.now(), usuarios: [] };
    }
    return cacheUsuariosReales.usuarios;
};
const cuentasCandidatasParaPase = (email) => {
    const coincide = (u) => normalizarEmail(u.email) === email;
    const candidatas = [];
    const delModoActual = (leerExcel().usuarios || []).find(coincide);
    if (delModoActual) candidatas.push(delModoActual);
    if (modoActual !== 'real') {
        const delReal = usuariosDeLaBaseReal().find(coincide);
        if (delReal) candidatas.push(delReal);
    }
    return candidatas;
};

const identificarUsuario = (req, res, next) => {
    if (!req.path.startsWith('/api/')) return next();

    // Cambio de un auxiliar que un jefe acaba de aprobar: lo vuelve a
    // ejecutar el propio servidor (ver /api/aprobaciones/decidir).
    const marcaReplay = String(req.headers['x-replay-aprobacion'] || '');
    if (marcaReplay && marcaReplay.length === TOKEN_REPLAY_APROBACION.length &&
        crypto.timingSafeEqual(Buffer.from(marcaReplay), Buffer.from(TOKEN_REPLAY_APROBACION))) {
        req.esReplayAprobado = true;
        req.usuarioVerificado = normalizarEmail(req.headers['x-user-email']);
        return next();
    }

    const coincidencia = /^Bearer\s+(.+)$/i.exec(String(req.headers['authorization'] || ''));

    if (!coincidencia) {
        if (RUTAS_PUBLICAS_SIN_PASE.includes(req.path)) return next();
        if (EXIGIR_TOKEN) {
            return res.status(401).json({ ok: false, codigo: 'sin_pase', msg: 'Debes iniciar sesión.' });
        }
        registrarPeticionSinPase(req);
        return next();
    }

    const invalido = () => res.status(401).json({
        ok: false, codigo: 'pase_invalido',
        msg: 'Tu sesión expiró o ya no es válida. Inicia sesión de nuevo.'
    });

    const v = verificarPase(coincidencia[1]);
    if (!v.ok) return invalido();

    // Si el pase trae id de sesión, esa sesión tiene que seguir registrada
    // (si la cerraron desde "Sesiones activas", el pase ya no sirve).
    if (v.sid) {
        const registro = sesionesActivas.find(x => x.id === v.sid);
        // Código propio para que el equipo afectado sepa POR QUÉ se le
        // cerró (no es que "expiró").
        if (!registro) return res.status(401).json({
            ok: false, codigo: 'sesion_cerrada',
            msg: 'Se cerró esta sesión desde otro equipo o porque la cuenta llegó al máximo de sesiones. Inicia sesión de nuevo.'
        });
        if (Date.now() - Date.parse(registro.ultima) > 60000) {
            registro.ultima = new Date().toISOString();
            guardarSesiones();
        }
        req.sesionId = v.sid;
    }

    // Firma y vencimiento bien: se revisa que la cuenta siga existiendo y que
    // la contraseña no haya cambiado desde que se entregó este pase.
    let cuenta;
    try {
        // Vale la cuenta cuya contraseña coincide con la del pase (en modo
        // Prueba puede haber una copia vieja con otra contraseña).
        cuenta = cuentasCandidatasParaPase(v.email).find(c => huellaClave(c.passHash) === v.pv);
    } catch (err) {
        console.error('⚠️ Error consultando la cuenta al verificar un pase:', err.message);
        return res.status(500).json({ ok: false, msg: 'No se pudo verificar tu sesión.' });
    }
    if (!cuenta) return invalido();

    const esAdmin = v.email === normalizarEmail(ADMIN_EMAIL);
    if (EXIGIR_TOKEN && !esAdmin && cuenta.estado !== 'APPROVED' && !RUTAS_PARA_CUALQUIER_CUENTA.includes(req.path)) {
        return res.status(403).json({ ok: false, codigo: 'cuenta_no_aprobada', msg: 'Tu cuenta todavía no está aprobada.' });
    }

    // La identidad VERIFICADA manda: se sobrescribe la cabecera para que nada
    // de lo que venga después use un correo que haya escrito el cliente.
    req.headers['x-user-email'] = v.email;
    req.usuarioVerificado = v.email;
    next();
};
app.use(identificarUsuario);

// --- Bloqueo por intentos fallidos de login (fuerza bruta) ---
// Se cuenta por correo + dirección de quien intenta: así quien se equivoca
// muchas veces queda frenado, pero nadie puede dejar sin acceso a otra
// persona (ni al administrador) desde otro equipo, solo escribiendo su correo.
const LOGIN_INTENTOS_MAX = 8;
const LOGIN_VENTANA_MS = 10 * 60 * 1000;
const fallosLogin = new Map();
const claveIntentoLogin = (email, req) => `${email}|${req.socket?.remoteAddress || ''}`;

const minutosDeBloqueoLogin = (clave) => {
    const f = fallosLogin.get(clave);
    if (!f) return 0;
    if (Date.now() - f.desde > LOGIN_VENTANA_MS) { fallosLogin.delete(clave); return 0; }
    return f.cuenta >= LOGIN_INTENTOS_MAX ? Math.max(1, Math.ceil((f.desde + LOGIN_VENTANA_MS - Date.now()) / 60000)) : 0;
};
const registrarFalloLogin = (clave) => {
    const f = fallosLogin.get(clave);
    if (!f || Date.now() - f.desde > LOGIN_VENTANA_MS) fallosLogin.set(clave, { cuenta: 1, desde: Date.now() });
    else f.cuenta++;
    // Tope para que un ataque con correos inventados no llene la memoria.
    if (fallosLogin.size > 5000) fallosLogin.delete(fallosLogin.keys().next().value);
};
setInterval(() => {
    const ahora = Date.now();
    for (const [k, f] of fallosLogin) if (ahora - f.desde > LOGIN_VENTANA_MS) fallosLogin.delete(k);
}, 30 * 60 * 1000).unref();

// Guarda cuál fue la última acción (endpoint) que se ejecutó — se usa
// para nombrar los respaldos automáticos con algo más útil que solo la
// hora (ver crearRespaldoDB en guardarEnExcel).
let ultimaAccionParaRespaldo = '';

// Middleware: registra automáticamente CUALQUIER POST/PUT/DELETE a /api/*,
// sin tener que tocar cada endpoint uno por uno.
app.use((req, res, next) => {
    // Las llamadas "en seco" (previsualizar:true, ej. la vista previa de
    // Generar Matriz) no cambian nada de verdad — auditarlas ensuciaría
    // el log con eventos que nunca pasaron.
    const esPrevisualizacion = req.body && req.body.previsualizar === true;
    if (req.path.startsWith('/api/') && req.method !== 'GET' && !esPrevisualizacion) {
        // La cabecera x-user-email solo existe DESPUÉS de haber iniciado
        // sesión — en /api/auth/login y /api/auth/register (donde
        // todavía no hay sesión) esa cabecera siempre viene vacía, así
        // que el registro salía como "desconocido" aunque el correo SÍ
        // viaja en el cuerpo de esa misma petición ({email, pass}).
        // Se usa ese correo como respaldo cuando la cabecera no llega.
        const usuario = String(
            req.headers['x-user-email'] || req.body?.email || ''
        ).toLowerCase().trim();

        // Nombre corto y legible para el respaldo — ej. "/api/viajes" -> "viajes"
        // Esto SÍ se necesita YA, de forma síncrona: guardarEnExcel()
        // (dentro del handler que viene después) usa esta variable de
        // inmediato para nombrar el respaldo automático.
        ultimaAccionParaRespaldo = req.path
            .replace(/^\/api\//, '')
            .replace(/[^a-zA-Z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '') || 'accion';

        // El registro de auditoría, en cambio, se hace DESPUÉS de que el
        // handler termine (res.on('finish')) — no antes. Así el handler
        // alcanza a dejar contexto específico en res.locals.auditoriaExtra
        // (ej. la placa/ruta de un viaje justo antes de borrarlo) para
        // endpoints como /api/viajes/eliminar, cuyo body de la petición
        // solo trae un id sin nada legible.
        res.on('finish', () => {
            if (res.locals.auditoriaOmitir) return;
            // auditoriaResumen reemplaza el cuerpo cuando es muy grande (ej. cerrar mes).
            const resumenCompleto = { ...(res.locals.auditoriaResumen || req.body || {}), ...(res.locals.auditoriaExtra || {}) };
            // Cambio de un auxiliar aplicado tras la aprobación de un jefe:
            // queda a nombre del auxiliar, con quién lo aprobó.
            if (req.esReplayAprobado) {
                resumenCompleto.aprobadoPor = normalizarEmail(req.headers['x-aprobado-por']);
                resumenCompleto.aprobacionId = String(req.headers['x-aprobacion-id'] || '');
            }
            registrarAuditoria(usuario, req.method, req.path, resumenCompleto, modoActual);
        });
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
const ADMIN_EMAIL = 'adminMak@makand.com';

// ============================================================
// ENVÍO DE CORREOS — al registrarse una cuenta nueva, se avisa por
// correo tanto a quien se registró (confirmando que su solicitud llegó)
// como al administrador (para que sepa que hay algo pendiente de
// aprobar, sin tener que estar revisando el panel a cada rato).
//
// CÓMO CONFIGURARLO (una sola vez):
// 1. Crea un archivo llamado ".env" en esta misma carpeta (junto a
//    server.js) — NUNCA lo subas a Git ni lo compartas, ahí van tus
//    credenciales reales.
// 2. Pega dentro estas 4 líneas, con TUS datos reales:
//      EMAIL_SERVICE=gmail
//      EMAIL_USER=tu_correo@gmail.com
//      EMAIL_PASS=tu_contraseña_de_aplicación
//      EMAIL_FROM_NOMBRE=Makand Rutograma
//    EMAIL_SERVICE acepta exactamente uno de estos 3 valores:
//      - gmail     → para una cuenta de Gmail / Google Workspace
//      - outlook   → para una cuenta de Outlook.com / Hotmail / Live
//      - office365 → para una cuenta de Office 365 empresarial
// 3. La "contraseña de aplicación" NO es tu contraseña normal de todos
//    los días — se genera aparte:
//      - Gmail: myaccount.google.com/apppasswords (necesitas tener
//        activada la verificación en dos pasos primero).
//      - Outlook/Office 365: account.microsoft.com/security →
//        "Opciones de seguridad avanzadas" → "Contraseñas de
//        aplicación" (mismo requisito: verificación en dos pasos activa).
// 4. Instala el paquete que falta: en la terminal, dentro de la
//    carpeta del backend, corre: npm install nodemailer dotenv
// 5. Reinicia el servidor.
//
// Si no configuras esto, la app sigue funcionando normal — el envío de
// correos simplemente falla en silencio (se ve un aviso en la consola
// del servidor), sin tumbar el registro de la cuenta.
// ============================================================
const SERVICIOS_CORREO_VALIDOS = { gmail: 'gmail', outlook: 'hotmail', office365: 'Office365' };
const transportadorCorreo = nodemailer.createTransport({
    service: SERVICIOS_CORREO_VALIDOS[String(process.env.EMAIL_SERVICE || 'gmail').toLowerCase()] || 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// ¿A qué correos se permite enviar? (EMAIL_DESTINOS_PERMITIDOS en .env)
//   vacío  → como siempre: solo cuentas de Makand en Outlook (contienen
//            "makand" y son @outlook.), para no escribirle a correos de prueba.
//   *      → a cualquier correo.
//   lista  → separada por comas: dominios ("@gmail.com", "@makand.com")
//            o correos completos ("pepe@gmail.com").
const reglaDestinosCorreo = () => String(process.env.EMAIL_DESTINOS_PERMITIDOS || '').trim().toLowerCase();

const destinoCorreoPermitido = (correo) => {
    const c = String(correo || '').toLowerCase().trim();
    if (!c.includes('@')) return false;
    const regla = reglaDestinosCorreo();
    if (!regla) return c.includes('makand') && c.includes('@outlook.');
    if (regla === '*') return true;
    return regla.split(',').map(x => x.trim()).filter(Boolean)
        .some(x => x.startsWith('@') ? c.endsWith(x) : c === x);
};

const describirReglaDestinos = () => {
    const regla = reglaDestinosCorreo();
    if (!regla) return 'Solo cuentas de Makand en Outlook (valor por defecto)';
    if (regla === '*') return 'Cualquier correo';
    return `Solo: ${regla}`;
};

// Devuelve { enviado, motivo } — los usos que solo "disparan y olvidan"
// (registro, aprobado, rechazado...) simplemente lo ignoran; lo usa el
// botón de "Enviar resumen de vencimientos ahora" para poder decirle a
// la persona por qué un correo NO salió, en vez de fallar en silencio.
const enviarCorreo = async (destinatario, asunto, cuerpoHtml) => {
    if (!destinoCorreoPermitido(destinatario)) {
        console.log(`✉️ Correo NO enviado — "${destinatario}" no está permitido (EMAIL_DESTINOS_PERMITIDOS). Asunto: ${asunto}`);
        return { enviado: false, motivo: `El destinatario (${destinatario}) no está permitido. Regla actual: ${describirReglaDestinos()}. Cámbiala con EMAIL_DESTINOS_PERMITIDOS en el .env.` };
    }
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        console.log(`✉️ (Correo NO enviado — falta configurar EMAIL_USER/EMAIL_PASS en .env) Para: ${destinatario} | Asunto: ${asunto}`);
        return { enviado: false, motivo: 'Falta configurar EMAIL_USER/EMAIL_PASS en el archivo .env del servidor.' };
    }
    try {
        await transportadorCorreo.sendMail({
            from: `"${process.env.EMAIL_FROM_NOMBRE || 'Makand Rutograma'}" <${process.env.EMAIL_USER}>`,
            to: destinatario,
            subject: asunto,
            html: cuerpoHtml
        });
        console.log(`✉️ Correo enviado a ${destinatario}: ${asunto}`);
        return { enviado: true, motivo: '' };
    } catch (err) {
        // Un correo que falla NUNCA debe tumbar la petición real (el
        // registro de la cuenta ya se guardó bien en el Excel).
        console.error(`⚠️ No se pudo enviar el correo a ${destinatario}:`, err.message);
        return { enviado: false, motivo: `El servidor de correo rechazó el envío: ${err.message}` };
    }
};

// Normaliza un correo para comparar (minúsculas, sin espacios)
const normalizarEmail = (e) => String(e || '').toLowerCase().trim();

// ============================================================
// AVISOS AGRUPADOS — varios avisos al mismo correo en poco tiempo (ej.
// un auxiliar que guarda 10 viajes seguidos) salen en UN solo correo.
// ============================================================
const avisosPorCorreo = new Map(); // destinatario -> { asunto, lineas[], temporizador }
const ESPERA_AVISOS_MS = (Number(process.env.EMAIL_AVISOS_ESPERA_SEG) || 120) * 1000;

function avisarPorCorreo(destinatario, asunto, lineaHtml, pieHtml = '') {
    const para = normalizarEmail(destinatario);
    if (!para || !destinoCorreoPermitido(para)) return;
    let pendiente = avisosPorCorreo.get(para);
    if (!pendiente) {
        pendiente = { asunto, lineas: [], pie: pieHtml };
        pendiente.temporizador = setTimeout(() => {
            avisosPorCorreo.delete(para);
            const titulo = pendiente.lineas.length > 1 ? `${pendiente.asunto} (${pendiente.lineas.length})` : pendiente.asunto;
            enviarCorreo(para, `${titulo} — Makand`,
                `<ul>${pendiente.lineas.map(l => `<li>${l}</li>`).join('')}</ul>${pendiente.pie}`);
        }, ESPERA_AVISOS_MS);
        avisosPorCorreo.set(para, pendiente);
    }
    pendiente.lineas.push(lineaHtml);
}


// Correos que reciben los avisos dirigidos al administrador (ADMIN_EMAIL
// suele no ser un buzón real): EMAIL_AVISOS_ADMIN en .env, separados por coma.
const correosAvisosAdmin = () => String(process.env.EMAIL_AVISOS_ADMIN || '')
    .split(',').map(normalizarEmail).filter(Boolean);

// ============================================================
// RESUMEN SEMANAL DE VENCIMIENTOS (SOAT, Tecnomecánica, Licencias)
// ============================================================
// Cada lunes (a partir de las 7:00 a.m., hora del servidor) se manda al
// administrador un correo con lo que ya venció o vence en los próximos
// 30 días — así no depende de que alguien entre a mirar el Dashboard.
// Siempre usa los datos del modo REAL (aunque el servidor esté en modo
// Prueba en ese momento), y si no hay nada por vencer no manda nada.
// Pasa por el mismo filtro de destinatarios que el resto de correos.
const DIAS_AVISO_VENCIMIENTOS = 30;
const ARCHIVO_ESTADO_VENCIMIENTOS = path.join(CARPETA_DATOS, 'ultimo-resumen-vencimientos.json');

const escaparHtml = (t) => String(t == null ? '' : t)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const fechaLocalISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const diasHastaFecha = (fechaISO, hoy) => {
    if (!fechaISO) return null;
    const f = new Date(`${String(fechaISO).slice(0, 10)}T00:00:00`);
    if (isNaN(f.getTime())) return null;
    return Math.round((f.getTime() - hoy.getTime()) / 86400000);
};

const calcularVencimientos = (data) => {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const items = { soat: [], tecno: [], licencia: [] };

    (data.vehiculos || []).forEach(v => {
        const placa = String(v.p || v.placa || '').trim();
        if (!placa) return;
        [['soat', v.soatVence], ['tecno', v.tecnoVence]].forEach(([tipo, fecha]) => {
            const dias = diasHastaFecha(fecha, hoy);
            if (dias !== null && dias <= DIAS_AVISO_VENCIMIENTOS) {
                items[tipo].push({ nombre: placa, fecha: String(fecha).slice(0, 10), dias });
            }
        });
    });

    (data.conductores || []).forEach(c => {
        const nombre = String(c.nom || c.nombre || '').trim();
        if (!nombre) return;
        const dias = diasHastaFecha(c.licVence, hoy);
        if (dias !== null && dias <= DIAS_AVISO_VENCIMIENTOS) {
            items.licencia.push({ nombre, fecha: String(c.licVence).slice(0, 10), dias });
        }
    });

    Object.values(items).forEach(lista => lista.sort((a, b) => a.dias - b.dias));
    return items;
};

const construirHtmlVencimientos = (items) => {
    const textoDias = (d) => d < 0 ? `vencido hace ${Math.abs(d)} día(s)` : (d === 0 ? 'vence hoy' : `vence en ${d} día(s)`);
    const colorDias = (d) => d < 0 ? '#b91c1c' : (d <= 15 ? '#b45309' : '#374151');
    const celda = 'padding:7px 12px;border-bottom:1px solid #e5e7eb;';

    const seccion = (titulo, columna, lista) => {
        if (!lista.length) return '';
        const filas = lista.map(i => `
            <tr>
              <td style="${celda}">${escaparHtml(i.nombre)}</td>
              <td style="${celda}">${escaparHtml(i.fecha)}</td>
              <td style="${celda}color:${colorDias(i.dias)};font-weight:600;">${textoDias(i.dias)}</td>
            </tr>`).join('');
        return `
          <h3 style="margin:22px 0 8px;font-size:15px;color:#111827;">${titulo}</h3>
          <table style="border-collapse:collapse;width:100%;font-size:13px;color:#1f2937;">
            <thead>
              <tr style="background:#f3f4f6;text-align:left;">
                <th style="${celda}">${columna}</th>
                <th style="${celda}">Fecha de vencimiento</th>
                <th style="${celda}">Estado</th>
              </tr>
            </thead>
            <tbody>${filas}</tbody>
          </table>`;
    };

    return `
      <div style="font-family:Segoe UI,Arial,sans-serif;max-width:640px;">
        <h2 style="margin:0 0 6px;font-size:18px;color:#111827;">Resumen semanal de vencimientos</h2>
        <p style="margin:0;font-size:13px;color:#6b7280;">
          Documentos que ya vencieron o vencen en los próximos ${DIAS_AVISO_VENCIMIENTOS} días.
        </p>
        ${seccion('SOAT', 'Vehículo', items.soat)}
        ${seccion('Tecnomecánica', 'Vehículo', items.tecno)}
        ${seccion('Licencias de conducción', 'Conductor', items.licencia)}
        <p style="margin-top:24px;font-size:12px;color:#9ca3af;">
          Correo automático del Rutograma de Makand. Las fechas se editan en Vehículos y Conductores.
        </p>
      </div>`;
};

// Destinatarios del resumen: por defecto el administrador; si en el .env
// se define EMAIL_VENCIMIENTOS_DESTINO (uno o varios correos separados por
// coma) se manda a esos. Cada uno pasa por el filtro de correos por su
// cuenta — el filtro NO se toca aquí.
const destinatariosVencimientos = () => {
    const lista = String(process.env.EMAIL_VENCIMIENTOS_DESTINO || '')
        .split(',').map(s => s.trim()).filter(Boolean);
    if (lista.length) return lista;
    return correosAvisosAdmin().length ? correosAvisosAdmin() : [ADMIN_EMAIL];
};

// Calcula y envía el resumen. Devuelve { enviado, enviadoA, motivo, total }:
// "enviado" es true si llegó al menos a un destinatario; "motivo" lista a
// quiénes NO les llegó y por qué.
const enviarResumenVencimientos = async () => {
    const items = calcularVencimientos(leerDB('real'));
    const total = items.soat.length + items.tecno.length + items.licencia.length;
    if (total === 0) {
        return { enviado: false, enviadoA: [], motivo: `No hay nada vencido ni por vencer en los próximos ${DIAS_AVISO_VENCIMIENTOS} días.`, total: 0, sinPendientes: true };
    }

    const asunto = `Resumen semanal de vencimientos — ${total} pendiente(s)`;
    const html = construirHtmlVencimientos(items);
    const resultados = [];
    for (const destinatario of destinatariosVencimientos()) {
        resultados.push({ destinatario, ...(await enviarCorreo(destinatario, asunto, html)) });
    }

    const enviadoA = resultados.filter(r => r.enviado).map(r => r.destinatario);
    const motivo = resultados.filter(r => !r.enviado).map(r => `${r.destinatario}: ${r.motivo}`).join(' | ');
    return { enviado: enviadoA.length > 0, enviadoA, motivo, total };
};

const leerEstadoVencimientos = () => {
    try { return JSON.parse(fs.readFileSync(ARCHIVO_ESTADO_VENCIMIENTOS, 'utf8')); }
    catch { return {}; }
};
const guardarEstadoVencimientos = (estado) => {
    try { fs.writeFileSync(ARCHIVO_ESTADO_VENCIMIENTOS, JSON.stringify(estado)); }
    catch (err) { console.error('⚠️ No se pudo guardar el estado del resumen de vencimientos:', err.message); }
};

// Se llama cada 30 minutos (y una vez poco después de arrancar). Manda el
// resumen una sola vez por semana: el lunes desde las 7:00, o el primer
// momento después de eso en que el servidor esté encendido (si estaba
// apagado el lunes, se manda apenas arranque). Si el envío falla, no se
// reintenta hasta el día siguiente, para no llenar la consola de avisos.
const revisarResumenSemanalVencimientos = async () => {
    try {
        const ahora = new Date();
        if (ahora.getHours() < 7) return;

        const lunes = new Date(ahora);
        lunes.setDate(lunes.getDate() - ((lunes.getDay() + 6) % 7));
        const lunesStr = fechaLocalISO(lunes);
        const hoyStr = fechaLocalISO(ahora);

        const estado = leerEstadoVencimientos();
        if ((estado.ultimoEnvioLunes || '') >= lunesStr) return; // ya se resolvió esta semana
        if (estado.ultimoIntentoDia === hoyStr) return;          // ya se intentó hoy y falló

        const r = await enviarResumenVencimientos();
        if (r.enviado || r.sinPendientes) {
            if (r.enviado && r.motivo) console.log(`ℹ️ Resumen de vencimientos enviado, pero no a todos: ${r.motivo}`);
            guardarEstadoVencimientos({ ultimoEnvioLunes: lunesStr });
        } else {
            guardarEstadoVencimientos({ ...estado, ultimoIntentoDia: hoyStr });
            console.log(`ℹ️ Resumen semanal de vencimientos NO enviado: ${r.motivo}`);
        }
    } catch (err) {
        console.error('⚠️ Error en la revisión del resumen semanal de vencimientos:', err.message);
    }
};

// Mapa de nombre de mes a número — se usa en varios endpoints para
// convertir "Septiembre-2026" + día 6 en la fecha real "2026-09-06".
const MESES_MAP = { 'Enero':1,'Febrero':2,'Marzo':3,'Abril':4,'Mayo':5,'Junio':6,'Julio':7,'Agosto':8,'Septiembre':9,'Octubre':10,'Noviembre':11,'Diciembre':12 };

// Cancela automáticamente los viajes "Programado" de una placa que
// caigan dentro de un rango de fechas (mantenimiento) o en un día
// puntual (descanso) — para que dejen de contar en el Dashboard y en
// cualquier reporte, sin esperar a la próxima vez que se regenere la
// matriz del mes. Nunca toca viajes "En ruta", "Entregado" o ya
// "Cancelado" — solo los que todavía no habían pasado.
function cancelarViajesEnConflicto(data, placa, motivo, coincide) {
    // BUG encontrado y corregido: esto comparaba contra 'Programado',
    // pero Generar Matriz deja los viajes nuevos en 'Planificado' (y
    // 'Programado' es solo el TEXTO que se muestra en pantalla, no el
    // valor real guardado) — con eso, la cancelación automática nunca
    // se activaba para ningún viaje. Ahora se excluye por los estados
    // que sí representan algo que ya pasó o ya se resolvió, y todo lo
    // demás se considera "todavía pendiente" y sí se puede cancelar.
    const ESTADOS_NO_CANCELABLES = ['Cancelado', 'Entregado', 'En ruta', 'Mantenimiento'];
    let cancelados = 0;
    (data.viajes || []).forEach(vj => {
        if (String(vj.p || vj.placa || '').toUpperCase().trim() !== placa) return;
        if (ESTADOS_NO_CANCELABLES.includes(vj.estado)) return;
        if (!vj.fecha || !coincide(vj.fecha, vj)) return;
        vj.estado = 'Cancelado';
        vj.motivoCancelacion = motivo;
        cancelados++;
    });
    return cancelados;
}

// ============================================================
// BLOQUEO REAL de cuentas "lector" — antes solo se ocultaban los
// botones en la pantalla (rutas.ts/vehiculos.ts), pero eso es nada más
// una comodidad visual: cualquiera con conocimientos técnicos podía
// seguir mandando la petición directo al servidor sin pasar por la
// interfaz, y el servidor la aceptaba igual. Este middleware SÍ
// bloquea de verdad, revisando el rol guardado de la cuenta antes de
// dejar pasar cualquier escritura.
// ============================================================
const RUTAS_SIN_RESTRICCION_DE_ROL = [
    '/api/auth/check',
    '/api/auth/login',
    '/api/auth/register',
    '/api/sesiones/cerrar',
    '/api/sesiones/cerrar-otras',
    '/api/sesiones/cerrar-actual'
];
const RUTAS_CON_PERMISO_PROPIO = ['/api/auth/decidir', '/api/auth/rol', '/api/auth/resetear-clave', '/api/aprobaciones/decidir'];

app.use((req, res, next) => {
    if (!req.path.startsWith('/api/') || req.method === 'GET') return next();
    // Estas rutas tienen que funcionar ANTES de que exista una sesión —
    // no tiene sentido (ni es posible) revisar el rol todavía.
    if (RUTAS_SIN_RESTRICCION_DE_ROL.includes(req.path)) return next();
    // Cuentas y aprobaciones: cada endpoint revisa su propio permiso.
    if (RUTAS_CON_PERMISO_PROPIO.includes(req.path)) return next();
    // Ya aprobado por un jefe: se aplica tal cual.
    if (req.esReplayAprobado) return next();

    try {
        const email = normalizarEmail(req.headers['x-user-email']);

        // El administrador siempre puede escribir — nunca se le aplica
        // esta restricción, sin importar qué rol tenga guardado.
        if (email && email === normalizarEmail(ADMIN_EMAIL)) return next();

        const data = leerExcel();
        const cuenta = (data.usuarios || []).find(u => normalizarEmail(u.email) === email);

        // Sin cuenta encontrada (correo vacío, sesión vieja, etc.) — se
        // deja pasar tal cual estaba antes de este cambio, para no
        // bloquear por error algo que ya funcionaba. El rol solo
        // bloquea cuando SÍ sabemos con certeza que es "lector".
        const permisos = cuenta ? permisosDeCuenta(cuenta, false) : null;
        if (permisos && !permisos.editar) {
            return res.status(403).json({ ok: false, msg: 'Tu cuenta es de solo lectura — no puedes hacer cambios.' });
        }

        // Cuenta que necesita aprobación (auxiliar, o permisos así): el
        // cambio NO se aplica; queda pendiente hasta que alguien con
        // permiso de aprobar lo apruebe en Aprobaciones.
        if (permisos && necesitaAprobacion(permisos) && requiereAprobacion(req.method, req.path, req.body)) {
            const solicitud = {
                id: crypto.randomBytes(8).toString('hex'),
                estado: 'PENDIENTE',
                solicitante: email,
                nombreSolicitante: cuenta.nombre || email,
                metodo: req.method,
                ruta: req.path,
                cuerpo: req.body || {},
                descripcion: describirCambio(req.method, req.path, req.body || {}),
                modo: modoActual,
                creada: new Date().toISOString()
            };
            solicitudesAprobacion.push(solicitud);
            guardarSolicitudesAprobacion();
            res.locals.auditoriaExtra = { aprobacion: 'PENDIENTE', aprobacionId: solicitud.id, descripcion: solicitud.descripcion };
            console.log(`📝 ${email} pidió aprobación: ${solicitud.descripcion}`);
            avisarAprobadores(solicitud, data);
            return res.status(202).json({
                ok: true,
                pendiente: true,
                aprobacionId: solicitud.id,
                msg: `Enviado para aprobación del jefe: ${solicitud.descripcion}`
            });
        }

        next();
    } catch (err) {
        // Un fallo revisando el rol NUNCA debe tumbar la petición real
        // (mismo criterio que ya se usa en registrarAuditoria).
        console.error('⚠️ Error revisando el rol de la cuenta:', err.message);
        next();
    }
});

// ============================================================
// COLA DE APROBACIONES (cambios de cuentas "auxiliar")
// Se guarda en data/aprobaciones.json, con su historial (quién pidió,
// quién aprobó o rechazó, cuándo y por qué).
// ============================================================
const ARCHIVO_APROBACIONES = path.join(CARPETA_DATOS, 'aprobaciones.json');
const MAX_SOLICITUDES_GUARDADAS = 1000;
let solicitudesAprobacion = (() => {
    try {
        if (fs.existsSync(ARCHIVO_APROBACIONES)) {
            const lista = JSON.parse(fs.readFileSync(ARCHIVO_APROBACIONES, 'utf8'));
            if (Array.isArray(lista)) return lista;
        }
    } catch (err) {
        console.error('⚠️ No se pudo leer aprobaciones.json:', err.message);
    }
    return [];
})();
function guardarSolicitudesAprobacion() {
    try {
        // Las ya decididas más viejas se descartan primero; las pendientes nunca.
        if (solicitudesAprobacion.length > MAX_SOLICITUDES_GUARDADAS) {
            const pendientes = solicitudesAprobacion.filter(s => s.estado === 'PENDIENTE');
            const decididas = solicitudesAprobacion.filter(s => s.estado !== 'PENDIENTE')
                .slice(-(MAX_SOLICITUDES_GUARDADAS - pendientes.length));
            solicitudesAprobacion = [...decididas, ...pendientes].sort((a, b) => a.creada.localeCompare(b.creada));
        }
        fs.writeFileSync(ARCHIVO_APROBACIONES, JSON.stringify(solicitudesAprobacion), { mode: 0o600 });
    } catch (err) {
        console.error('⚠️ No se pudo guardar aprobaciones.json:', err.message);
    }
}

// Aviso por correo a quienes pueden aprobar (y a EMAIL_AVISOS_ADMIN).
function avisarAprobadores(solicitud, data) {
    try {
        const destinos = new Set(correosAvisosAdmin());
        (data.usuarios || []).forEach(u => {
            if (u.estado === 'APPROVED' && permisosDeCuenta(u, false).aprobarCambios) destinos.add(normalizarEmail(u.email));
        });
        destinos.delete(solicitud.solicitante);
        const linea = `<strong>${escaparHtml(solicitud.nombreSolicitante)}</strong> pidió: ${escaparHtml(solicitud.descripcion)}` +
            (solicitud.modo === 'pruebas' ? ' <em>(Modo Prueba)</em>' : '');
        destinos.forEach(d => avisarPorCorreo(d, 'Cambios esperando tu aprobación', linea,
            '<p>Entra al Rutograma, pestaña <strong>Aprobaciones</strong>, para aprobarlos o rechazarlos.</p>'));
    } catch (err) {
        console.error('⚠️ No se pudo avisar a los aprobadores:', err.message);
    }
}

// Aviso por correo a quien pidió el cambio, cuando se decide.
function avisarDecision(solicitud) {
    const aprobada = solicitud.estado === 'APROBADA';
    const linea = `${aprobada ? '✅ Aprobado' : '❌ Rechazado'}: ${escaparHtml(solicitud.descripcion)} — por ${escaparHtml(solicitud.decididaPor)}` +
        (solicitud.motivo ? `. Motivo: "${escaparHtml(solicitud.motivo)}"` : '');
    avisarPorCorreo(solicitud.solicitante, 'Respuesta a tus cambios', linea,
        '<p>Los ves todos en la pestaña <strong>Aprobaciones</strong> del Rutograma.</p>');
}

/** Permisos efectivos de quien hace la petición (null = sin sesión / sin cuenta). */
function permisosDelSolicitante(req) {
    const email = normalizarEmail(req.headers['x-user-email']);
    if (!email) return null;
    if (email === normalizarEmail(ADMIN_EMAIL)) return permisosDeCuenta(null, true);
    const cuenta = (leerExcel().usuarios || []).find(u => normalizarEmail(u.email) === email);
    return cuenta ? permisosDeCuenta(cuenta, false) : null;
}

// Jefe/admin: todas (pendientes primero). Auxiliar: solo las suyas.
app.get('/api/aprobaciones', (req, res) => {
    const email = normalizarEmail(req.headers['x-user-email']);
    const permisos = permisosDelSolicitante(req);
    if (!permisos) return res.status(401).json({ ok: false, msg: 'Debes iniciar sesión.' });
    const visibles = permisos.aprobarCambios
        ? solicitudesAprobacion
        : solicitudesAprobacion.filter(s => s.solicitante === email);
    const lista = [...visibles]
        .sort((a, b) => (a.estado === 'PENDIENTE' ? 0 : 1) - (b.estado === 'PENDIENTE' ? 0 : 1) ||
            String(b.decididaEn || b.creada).localeCompare(String(a.decididaEn || a.creada)))
        .slice(0, 300)
        .map(solicitudPublica);
    res.json({
        ok: true,
        puedeAprobar: permisos.aprobarCambios,
        pendientes: visibles.filter(s => s.estado === 'PENDIENTE').length,
        solicitudes: lista
    });
});

// Vuelve a ejecutar la petición original del auxiliar contra este mismo
// servidor, marcada como ya aprobada (pasa por las mismas validaciones
// que cualquier otro cambio).
function ejecutarSolicitudAprobada(solicitud, aprobador) {
    return new Promise((resolve) => {
        const cuerpo = JSON.stringify(solicitud.cuerpo || {});
        const peticion = require('http').request({
            host: '127.0.0.1',
            port: PORT,
            method: solicitud.metodo,
            path: solicitud.ruta,
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(cuerpo),
                'x-user-email': solicitud.solicitante,
                'x-replay-aprobacion': TOKEN_REPLAY_APROBACION,
                'x-aprobado-por': aprobador,
                'x-aprobacion-id': solicitud.id
            }
        }, (respuesta) => {
            let texto = '';
            respuesta.on('data', c => { texto += c; });
            respuesta.on('end', () => {
                let datos = {};
                try { datos = JSON.parse(texto); } catch { /* respuesta sin JSON */ }
                resolve({ status: respuesta.statusCode, datos });
            });
        });
        peticion.on('error', (err) => resolve({ status: 0, datos: { msg: err.message } }));
        peticion.end(cuerpo);
    });
}

app.post('/api/aprobaciones/decidir', async (req, res) => {
    try {
        const aprobador = normalizarEmail(req.headers['x-user-email']);
        // Solo las decisiones que de verdad se aplican van a la auditoría
        // (no los intentos rechazados ni las solicitudes ya decididas).
        res.locals.auditoriaOmitir = true;
        if (!permisosDelSolicitante(req)?.aprobarCambios) {
            return res.status(403).json({ ok: false, msg: 'Tu cuenta no tiene permiso para aprobar cambios.' });
        }
        const { id, accion, motivo } = req.body || {};
        const solicitud = solicitudesAprobacion.find(s => s.id === id);
        if (!solicitud) return res.status(404).json({ ok: false, msg: 'Esa solicitud no existe.' });
        if (solicitud.estado !== 'PENDIENTE') {
            return res.status(409).json({ ok: false, msg: `Esa solicitud ya fue ${solicitud.estado === 'APROBADA' ? 'aprobada' : 'rechazada'}.` });
        }
        res.locals.auditoriaExtra = { solicitante: solicitud.solicitante, descripcion: solicitud.descripcion };

        if (accion === 'RECHAZAR') {
            res.locals.auditoriaOmitir = false;
            solicitud.estado = 'RECHAZADA';
            solicitud.decididaPor = aprobador;
            solicitud.decididaEn = new Date().toISOString();
            solicitud.motivo = String(motivo || '').trim();
            guardarSolicitudesAprobacion();
            console.log(`❌ ${aprobador} rechazó: ${solicitud.descripcion} (de ${solicitud.solicitante})`);
            avisarDecision(solicitud);
            return res.json({ ok: true, solicitud: solicitudPublica(solicitud) });
        }
        if (accion !== 'APROBAR') return res.status(400).json({ ok: false, msg: "Acción inválida (usa 'APROBAR' o 'RECHAZAR')." });
        // Nadie aprueba su propio cambio (sí puede retirarlo rechazándolo).
        if (solicitud.solicitante === aprobador && aprobador !== normalizarEmail(ADMIN_EMAIL)) {
            return res.status(403).json({ ok: false, msg: 'No puedes aprobar tu propio cambio: debe aprobarlo otra persona.' });
        }

        if (solicitud.modo !== modoActual) {
            return res.status(409).json({
                ok: false,
                msg: `Este cambio se pidió en Modo ${solicitud.modo === 'pruebas' ? 'Prueba' : 'Real'}. Cambia a ese modo para aprobarlo.`
            });
        }

        const resultado = await ejecutarSolicitudAprobada(solicitud, aprobador);
        if (resultado.status < 200 || resultado.status >= 300 || resultado.datos.ok === false) {
            // No se pudo aplicar (ej. el vehículo entró en mantenimiento
            // mientras tanto): queda pendiente para corregir o rechazar.
            return res.status(422).json({
                ok: false,
                msg: `No se pudo aplicar el cambio: ${resultado.datos.msg || `error ${resultado.status}`}`
            });
        }
        res.locals.auditoriaOmitir = false;
        solicitud.estado = 'APROBADA';
        solicitud.decididaPor = aprobador;
        solicitud.decididaEn = new Date().toISOString();
        guardarSolicitudesAprobacion();
        console.log(`✅ ${aprobador} aprobó: ${solicitud.descripcion} (de ${solicitud.solicitante})`);
        avisarDecision(solicitud);
        return res.json({ ok: true, solicitud: solicitudPublica(solicitud), resultado: resultado.datos });
    } catch (error) {
        console.error('🚨 Error en /api/aprobaciones/decidir:', error);
        res.status(500).json({ ok: false, msg: error.message });
    }
});

// ============================================================
// CORREO — estado de la configuración y correo de prueba (solo admin).
// ============================================================
app.get('/api/correo/estado', (req, res) => {
    if (normalizarEmail(req.headers['x-user-email']) !== normalizarEmail(ADMIN_EMAIL)) {
        return res.status(403).json({ ok: false, msg: 'Solo el administrador.' });
    }
    const usuario = String(process.env.EMAIL_USER || '');
    res.json({
        ok: true,
        configurado: !!(usuario && process.env.EMAIL_PASS),
        servicio: String(process.env.EMAIL_SERVICE || 'gmail').toLowerCase(),
        remitente: usuario,
        destinos: describirReglaDestinos(),
        avisosAdmin: correosAvisosAdmin()
    });
});

app.post('/api/correo/probar', async (req, res) => {
    if (normalizarEmail(req.headers['x-user-email']) !== normalizarEmail(ADMIN_EMAIL)) {
        return res.status(403).json({ ok: false, msg: 'Solo el administrador.' });
    }
    const destino = normalizarEmail(req.body?.destino);
    if (!destino || !destino.includes('@')) return res.status(400).json({ ok: false, msg: 'Escribe un correo válido.' });
    const r = await enviarCorreo(destino, 'Correo de prueba — Makand Rutograma',
        '<p>¡Funciona! El Rutograma ya puede enviar correos desde este servidor.</p>');
    res.json({ ok: r.enviado, msg: r.enviado ? `Correo enviado a ${destino}. Revisa la bandeja (y la de spam).` : r.motivo });
});

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

        return res.json({ ok: true, email, estado: usuario.estado, esAdmin: false, motivoRechazo: usuario.estado === 'REJECTED' ? (usuario.motivoRechazo || '') : undefined });
    } catch (error) {
        console.error("🚨 Error en /api/auth/check:", error);
        res.status(500).json({ ok: false, msg: error.message });
    }
});

// --- Restaurar sesión al recargar la página (sin pedir contraseña de
// nuevo) — el navegador ya guardó el correo de quien inició sesión;
// esto solo confirma que la cuenta SIGUE existiendo y aprobada, y
// devuelve su rol actual. Mismo nivel de confianza que ya usa el resto
// de la app en la cabecera x-user-email (no hay contraseña ni token de
// por medio en ningún otro lado tampoco). ---
app.get('/api/auth/estado', (req, res) => {
    try {
        const data = leerExcel();
        // Con un pase válido, la identidad es la del PASE (req.usuarioVerificado):
        // el correo que llegue en la URL se ignora. Solo en modo tolerante y sin
        // pase se sigue usando el correo de la URL, como antes.
        const email = normalizarEmail(req.usuarioVerificado || req.query.email);
        if (!email) return res.status(400).json({ ok: false, msg: 'Falta el correo' });

        if (email === normalizarEmail(ADMIN_EMAIL)) {
            return res.json({ ok: true, estado: 'APPROVED', esAdmin: true, rol: 'admin', permisos: permisosDeCuenta(null, true) });
        }

        const usuario = (data.usuarios || []).find(u => normalizarEmail(u.email) === email);
        if (!usuario) return res.status(404).json({ ok: false, msg: 'Cuenta no encontrada' });

        return res.json({
            ok: true,
            estado: usuario.estado,
            esAdmin: false,
            rol: rolDeCuenta(usuario, false),
            permisos: permisosDeCuenta(usuario, false),
            motivoRechazo: usuario.estado === 'REJECTED' ? (usuario.motivoRechazo || '') : undefined
        });
    } catch (error) {
        console.error("🚨 Error en /api/auth/estado:", error);
        res.status(500).json({ ok: false, msg: error.message });
    }
});

// --- Listar cuentas pendientes (solo admin) ---
app.get('/api/auth/pendientes', (req, res) => {
    try {
        // El frontend manda el correo del que pregunta en la cabecera
        const solicitante = normalizarEmail(req.headers['x-user-email']);
        // Con permiso "Ver cuentas y auditoría" (el jefe, por defecto).
        if (!permisosDelSolicitante(req)?.verAdministracion) {
            return res.status(403).json({ ok: false, msg: 'Tu cuenta no tiene permiso para ver esta lista' });
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
        // Con permiso "Ver cuentas y auditoría" (el jefe, por defecto).
        if (!permisosDelSolicitante(req)?.verAdministracion) {
            return res.status(403).json({ ok: false, msg: 'Tu cuenta no tiene permiso para ver esta lista' });
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

// --- Aprobar o rechazar una cuenta (admin, o con permiso "Aceptar o
// rechazar cuentas nuevas") ---
// body: { email: 'x@y.com', accion: 'APPROVED' | 'REJECTED', rol?, permisos? }
// rol/permisos solo los toma del admin; quien no es admin solo decide
// cuentas que estén pendientes, y quedan con el rol por defecto.
app.post('/api/auth/decidir', (req, res) => {
    try {
        const solicitante = normalizarEmail(req.headers['x-user-email']);
        const esAdmin = solicitante === normalizarEmail(ADMIN_EMAIL);
        if (!esAdmin && !permisosDelSolicitante(req)?.gestionarCuentas) {
            return res.status(403).json({ ok: false, msg: 'Tu cuenta no tiene permiso para aceptar o rechazar cuentas' });
        }

        const data = leerExcel();
        if (!data.usuarios) data.usuarios = [];

        const email = normalizarEmail(req.body.email);
        const accion = String(req.body.accion || '').toUpperCase();
        const motivo = String(req.body.motivo || '').trim();

        if (!email) return res.status(400).json({ ok: false, msg: 'Falta el correo' });
        // 'PENDING' solo lo usa Deshacer (volver una cuenta a "por revisar").
        if (accion !== 'APPROVED' && accion !== 'REJECTED' && accion !== 'PENDING') {
            return res.status(400).json({ ok: false, msg: "Acción inválida (usa 'APPROVED', 'REJECTED' o 'PENDING')" });
        }

        const usuario = data.usuarios.find(u => normalizarEmail(u.email) === email);
        if (!usuario) return res.status(404).json({ ok: false, msg: 'Cuenta no encontrada' });
        if (!esAdmin && (usuario.estado !== 'PENDING' || accion === 'PENDING')) {
            return res.status(403).json({ ok: false, msg: 'Solo puedes aceptar o rechazar cuentas nuevas (pendientes). Lo demás lo hace el administrador.' });
        }

        usuario.estado = accion;
        // El motivo solo tiene sentido para un rechazo — si se aprueba
        // (incluso después de haber estado rechazada antes), se limpia.
        usuario.motivoRechazo = accion === 'REJECTED' ? motivo : '';
        // Si es la primera vez que se aprueba y no tiene rol, le damos 'editor'
        // (acceso completo) por defecto — el admin puede bajarlo a 'lector' después.
        if (accion === 'APPROVED' && !usuario.rol) {
            usuario.rol = 'editor';
        }
        // El admin puede elegir al aprobar el rol y, si quiere, permisos a medida.
        if (accion === 'APPROVED' && esAdmin && req.body.rol !== undefined) {
            const rol = String(req.body.rol || '').toLowerCase();
            if (!ROLES_VALIDOS.includes(rol)) {
                return res.status(400).json({ ok: false, msg: `Rol inválido (usa ${ROLES_VALIDOS.join(', ')})` });
            }
            usuario.rol = rol;
            usuario.permisos = req.body.permisos ? normalizarPermisos(req.body.permisos) : null;
        }
        usuario.actualizadoPor = solicitante;
        usuario.actualizadoEn = new Date().toISOString();

        guardarEnExcel(data);
        console.log(`✅ Cuenta ${email} => ${accion} (por ${solicitante})`);

        // BUG REAL encontrado y corregido: el correo de registro dice
        // "Te avisaremos apenas sea revisada", pero nunca se mandaba
        // ningún correo aquí — la persona no tenía forma de enterarse
        // salvo volviendo a intentar iniciar sesión por su cuenta.
        if (accion === 'APPROVED') {
            enviarCorreo(
                usuario.email,
                'Tu cuenta fue aprobada — Makand',
                `<p>Hola ${usuario.nombre || ''},</p>
                 <p>Tu cuenta en el Rutograma de Makand fue <strong>aprobada</strong> — ya puedes iniciar sesión normalmente.</p>`
            );
        } else {
            enviarCorreo(
                usuario.email,
                'Tu solicitud de acceso fue rechazada — Makand',
                `<p>Hola ${usuario.nombre || ''},</p>
                 <p>Tu solicitud de acceso al Rutograma de Makand fue <strong>rechazada</strong>.</p>
                 ${motivo ? `<p><strong>Motivo:</strong> ${motivo}</p>` : ''}`
            );
        }

        res.json({ ok: true, email, estado: accion, rol: usuario.rol, permisos: usuario.permisos || null });
    } catch (error) {
        console.error("🚨 Error en /api/auth/decidir:", error);
        res.status(500).json({ ok: false, msg: error.message });
    }
});

// --- Asignar rol (y opcionalmente permisos personalizados) a una cuenta (solo admin) ---
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
        if (!ROLES_VALIDOS.includes(rol)) {
            return res.status(400).json({ ok: false, msg: `Rol inválido (usa ${ROLES_VALIDOS.join(', ')})` });
        }

        const usuario = data.usuarios.find(u => normalizarEmail(u.email) === email);
        if (!usuario) return res.status(404).json({ ok: false, msg: 'Cuenta no encontrada' });

        usuario.rol = rol;
        // Sin "permisos" (o null) = los de su rol; con objeto = personalizados.
        usuario.permisos = req.body.permisos ? normalizarPermisos(req.body.permisos) : null;
        usuario.actualizadoPor = solicitante;
        usuario.actualizadoEn = new Date().toISOString();

        guardarEnExcel(data);
        console.log(`🔑 Rol de ${email} => ${rol}${usuario.permisos ? ' (permisos personalizados)' : ''} (por ${solicitante})`);

        res.json({ ok: true, email, rol, permisos: usuario.permisos });
    } catch (error) {
        console.error("🚨 Error en /api/auth/rol:", error);
        res.status(500).json({ ok: false, msg: error.message });
    }
});

// --- Restablecer la contraseña de una cuenta (solo admin) ---
// Para cuando alguien olvida su contraseña: en vez de un flujo de
// "recuperar por correo" (más grande y con más riesgo de dejar algo de
// seguridad mal hecho), el admin le pone una nueva directamente, igual
// que ya aprueba cuentas a mano.
app.post('/api/auth/resetear-clave', async (req, res) => {
    try {
        const solicitante = normalizarEmail(req.headers['x-user-email']);
        if (solicitante !== normalizarEmail(ADMIN_EMAIL)) {
            return res.status(403).json({ ok: false, msg: 'Solo el administrador puede restablecer contraseñas' });
        }

        const data = leerExcel();
        if (!data.usuarios) data.usuarios = [];

        const email = normalizarEmail(req.body.email);
        const nuevaClave = String(req.body.nuevaClave || '');

        if (!email) return res.status(400).json({ ok: false, msg: 'Falta el correo' });
        if (nuevaClave.length < 6) {
            return res.status(400).json({ ok: false, msg: 'La contraseña debe tener al menos 6 caracteres' });
        }

        const usuario = data.usuarios.find(u => normalizarEmail(u.email) === email);
        if (!usuario) return res.status(404).json({ ok: false, msg: 'Cuenta no encontrada' });

        usuario.passHash = await bcrypt.hash(nuevaClave, 10);
        usuario.actualizadoPor = solicitante;
        usuario.actualizadoEn = new Date().toISOString();

        guardarEnExcel(data);
        cerrarSesionesDe(email);
        console.log(`🔑 Contraseña restablecida para ${email} (por ${solicitante})`);

        // Se avisa por correo, igual que con el registro — así la
        // persona se entera sin que el admin tenga que decírselo aparte
        // (aunque de todos modos necesita que le compartan la clave nueva
        // por otro medio, ya que por seguridad nunca viaja por correo).
        enviarCorreo(
            email,
            'Tu contraseña fue restablecida — Makand',
            `<p>Hola ${usuario.nombre || ''},</p>
             <p>Un administrador restableció la contraseña de tu cuenta en el Rutograma de Makand.</p>
             <p>Pídele la nueva contraseña para poder iniciar sesión.</p>`
        );

        res.json({ ok: true });
    } catch (error) {
        console.error("🚨 Error en /api/auth/resetear-clave:", error);
        res.status(500).json({ ok: false, msg: error.message });
    }
});


// --- Enviar ahora el resumen de vencimientos (solo admin) ---
// Para probarlo sin esperar al lunes, o mandarlo cuando se necesite. No
// afecta el envío automático semanal.
app.post('/api/vencimientos/enviar-ahora', async (req, res) => {
    try {
        const solicitante = normalizarEmail(req.headers['x-user-email']);
        if (solicitante !== normalizarEmail(ADMIN_EMAIL)) {
            return res.status(403).json({ ok: false, msg: 'Solo el administrador puede enviar este resumen' });
        }
        const resultado = await enviarResumenVencimientos();
        return res.json({ ok: true, ...resultado });
    } catch (error) {
        console.error("🚨 Error en /api/vencimientos/enviar-ahora:", error);
        res.status(500).json({ ok: false, msg: error.message });
    }
});

// --- CONFIGURACIÓN ---
// Antes esto apuntaba a una carpeta de red ('//server/...'), lo que traía
// problemas de permisos/conexión fuera de nuestro control. Ahora el Excel
// vive LOCAL, en la misma carpeta "data" que ya se creó arriba — nada de
// red de por medio, solo el disco de este computador.
const RUTA_EXCEL_REAL = path.join(CARPETA_DATOS, 'DatabaseRutograma.XLSX');
const RUTA_EXCEL_PRUEBAS = path.join(CARPETA_DATOS, 'DatabaseRutograma_Pruebas.XLSX');
const RUTA_ARCHIVO_MODO = path.join(CARPETA_DATOS, 'modo-actual.json');
const CARPETA_RESPALDOS = path.join(CARPETA_DATOS, 'Backups');
const MAX_RESPALDOS = 30; // se guardan los últimos 30 respaldos, los más viejos se borran solos

// --- MODO REAL / PRUEBAS ---
// El botón de "Modo prueba" (Configuración) cambia esta bandera, guardada
// en un archivito aparte para que sobreviva a reinicios del servidor —
// así nadie se queda "en pruebas sin saberlo" después de reiniciar.
// Mientras está en modo prueba, TODA la app (Rutograma, Vehículos, Rutas,
// Conductores) lee y escribe en un Excel COMPLETAMENTE APARTE
// (DatabaseRutograma_Pruebas.XLSX) — el archivo real nunca se toca.
let modoActual = 'real';
try {
    if (fs.existsSync(RUTA_ARCHIVO_MODO)) {
        const guardado = JSON.parse(fs.readFileSync(RUTA_ARCHIVO_MODO, 'utf8'));
        if (guardado && (guardado.modo === 'real' || guardado.modo === 'pruebas')) {
            modoActual = guardado.modo;
        }
    }
} catch (err) {
    console.error('⚠️ No se pudo leer el modo guardado, se usa "real" por defecto:', err.message);
}

const obtenerRutaExcel = () => (modoActual === 'pruebas' ? RUTA_EXCEL_PRUEBAS : RUTA_EXCEL_REAL);

const guardarModoEnDisco = () => {
    try {
        fs.writeFileSync(RUTA_ARCHIVO_MODO, JSON.stringify({ modo: modoActual }));
        return true;
    } catch (err) {
        console.error('⚠️ No se pudo guardar el modo actual en disco:', err.message);
        return false;
    }
};

console.log("Modo activo al arrancar:", modoActual);
console.log("Ruta configurada como:", obtenerRutaExcel());
console.log("👉 Si tienes un Excel real con tus datos, cópialo/muévelo a esa ruta ANTES de seguir usando la app (con ese nombre exacto), o la app va a crear uno nuevo vacío.");

// --- RESPALDO AUTOMÁTICO ---
// Antes de escribir CUALQUIER cambio, guardamos una copia del archivo tal
// como estaba justo antes. Si algo sale mal en una escritura (o alguien
// borra algo por error), siempre hay una copia reciente de dónde recuperar.
// Antes esto usaba fs.copyFileSync/readdirSync/statSync — TODO
// BLOQUEANTE. Node.js corre en un solo hilo: mientras una copia de
// archivo síncrona estaba en curso, el servidor entero se congelaba
// para TODAS las peticiones (de cualquier computadora, incluida la que
// corre el servidor) hasta que terminara. Con muchas funciones nuevas
// que guardan varias veces seguido en cascada (reacomodar rutas,
// reasignar conductor a varios viajes...), cada guardado individual
// disparaba su propia copia completa del Excel, una tras otra — de ahí
// la lentitud general reciente. Ahora todo es asíncrono (fs.promises):
// el respaldo se sigue haciendo igual, pero de fondo, sin trabar nada.
const crearRespaldo = async () => {
    try {
        const rutaExcelActual = obtenerRutaExcel();
        if (!fs.existsSync(rutaExcelActual)) return; // nada que respaldar todavía

        if (!fs.existsSync(CARPETA_RESPALDOS)) {
            await fs.promises.mkdir(CARPETA_RESPALDOS, { recursive: true });
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const prefijo = modoActual === 'pruebas' ? 'DatabaseRutograma_Pruebas_' : 'DatabaseRutograma_';
        const nombreRespaldo = `${prefijo}${timestamp}.XLSX`;
        const rutaRespaldo = path.join(CARPETA_RESPALDOS, nombreRespaldo);

        await fs.promises.copyFile(rutaExcelActual, rutaRespaldo);
        console.log(`💾 Respaldo creado: ${nombreRespaldo}`);

        await limpiarRespaldosViejos();
    } catch (err) {
        // Un respaldo fallido NUNCA debe impedir que se guarde el cambio real.
        console.error('⚠️ No se pudo crear el respaldo (se continúa igual):', err.message);
    }
};

const limpiarRespaldosViejos = async () => {
    try {
        const nombresArchivos = await fs.promises.readdir(CARPETA_RESPALDOS);
        const archivosConFecha = (await Promise.all(
            nombresArchivos
                .filter(f => f.startsWith('DatabaseRutograma_') && f.toUpperCase().endsWith('.XLSX'))
                .map(async f => {
                    const ruta = path.join(CARPETA_RESPALDOS, f);
                    try {
                        const stat = await fs.promises.stat(ruta);
                        return { nombre: f, ruta, tiempo: stat.mtimeMs };
                    } catch {
                        // El archivo pudo desaparecer entre listar la carpeta y
                        // consultar su fecha — otra limpieza concurrente ya lo
                        // borró un instante antes. Se descarta en silencio, en
                        // vez de tumbar TODO el intento de limpieza por un
                        // solo archivo que ya no está.
                        return null;
                    }
                })
        )).filter((x) => x !== null);
        const archivos = archivosConFecha.sort((a, b) => b.tiempo - a.tiempo); // más reciente primero

        const sobrantes = archivos.slice(MAX_RESPALDOS);
        for (const a of sobrantes) {
            try {
                await fs.promises.unlink(a.ruta);
                console.log(`🗑️ Respaldo antiguo eliminado: ${a.nombre}`);
            } catch (errBorrado) {
                // ENOENT = "ya no existe" — normal cuando varios guardados
                // corren casi al mismo tiempo y OTRA limpieza concurrente
                // ya lo había borrado un instante antes. No es un error
                // real, no hace falta alarmar por esto ni detener el
                // resto de la limpieza.
                if (errBorrado.code !== 'ENOENT') {
                    console.error(`⚠️ No se pudo borrar el respaldo ${a.nombre}:`, errBorrado.message);
                }
            }
        }
    } catch (err) {
        console.error('⚠️ Error limpiando respaldos viejos:', err.message);
    }
};

// --- FUNCIONES ---
const inicializarArchivo = () => {
    try {
        const rutaExcelActual = obtenerRutaExcel();
        if (!fs.existsSync(rutaExcelActual)) {
            console.log("Archivo NO encontrado, creando plantilla inicial...");
            const wb = XLSX.utils.book_new();
            ['Vehiculos', 'Viajes', 'Rutas', 'Conductores', 'Novedades', 'Usuarios'].forEach(sheetName => {
                const ws = XLSX.utils.json_to_sheet([]);
                XLSX.utils.book_append_sheet(wb, ws, sheetName);
            });
            XLSX.writeFile(wb, rutaExcelActual);
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
        // leerDB() ya devuelve todo parseado (dias/descansosPorMes/
        // historialMantenimiento/etc. ya como objetos reales, no texto
        // JSON) — a diferencia del Excel, SQLite no necesita ese
        // segundo paso de "reconstruir" los campos anidados aquí.
        const data = leerDB(modoActual);
        cacheExcel = data;
        return data;
    } catch (error) {
        console.error("❌ Error al leer la base de datos (se reintentará en la próxima petición):", error.message);
        // OJO: a propósito NO guardamos esto en cacheExcel. Si lo
        // cacheáramos, un fallo pasajero dejaría a todos viendo "todo
        // en cero" para siempre, hasta reiniciar el servidor. Así, la
        // siguiente petición vuelve a intentar leer de verdad.
        return { vehiculos: [], viajes: [], rutas: [], conductores: [], novedades: [], usuarios: [], historialvehiculos: [], historialrutas: [], historialconductores: [] };
    }
};

const guardarEnExcel = (datosActualizados) => {
    console.log("Iniciando proceso de escritura...");

    // Se dispara SIN esperar — el respaldo es una red de seguridad de
    // fondo, nunca debe retrasar el guardado real que el usuario está
    // esperando ver reflejado. Ahora respalda el archivo .db real (con
    // la API nativa de backup de SQLite), no el Excel viejo.
    crearRespaldoDB(modoActual, ultimaAccionParaRespaldo).catch(err => console.error('⚠️ Error inesperado en el respaldo:', err.message));

    try {
        // Actualizamos el caché INMEDIATAMENTE — mismo motivo que
        // antes: cualquier lectura que llegue justo después ya ve el
        // dato fresco, sin depender de que termine la escritura.
        cacheExcel = datosActualizados; cacheUsuariosReales.ts = 0;

        // guardarEnDB() ya hace TODA la normalización que antes hacía
        // este archivo a mano (convertir dias/descansosPorMes/
        // historialMantenimiento/etc. a texto JSON) — y es síncrona,
        // así que no hace falta la danza de escribir a un archivo
        // temporal y renombrar: SQLite (con journal_mode=WAL) ya
        // garantiza que la escritura es atómica por su cuenta.
        guardarEnDB(datosActualizados, modoActual);
        console.log("✅ Datos guardados con éxito en la base de datos.");
    } catch (error) {
        console.error("❌ ERROR AL ESCRIBIR EN LA BASE DE DATOS:", error);
        throw error;
    }
};

// --- ENDPOINTS ---

// Consultar el modo activo (Real / Pruebas) — lo usa el botón de
// Configuración para saber qué mostrar al cargar la página.
app.get('/api/modo', (req, res) => {
    res.json({ ok: true, modo: modoActual });
});

// Cambiar de modo — body: { modo: 'real' | 'pruebas' }. Al entrar a
// "pruebas" por primera vez (el archivo de pruebas todavía no existe),
// se copia el Excel REAL tal cual está en ese momento, para empezar las
// pruebas desde datos reales sin arriesgar el archivo real — desde ese
// punto, cada uno sigue su propio camino de forma completamente aparte.
app.post('/api/modo', (req, res) => {
    try {
        // Cambiar de modo afecta a TODOS los que usan la app a la vez — se
        // restringe al administrador, igual que aprobar cuentas o restaurar
        // un respaldo, en vez de dejarlo abierto a cualquier editor.
        const solicitante = normalizarEmail(req.headers['x-user-email']);
        if (solicitante !== normalizarEmail(ADMIN_EMAIL)) {
            return res.status(403).json({ ok: false, msg: 'Solo el administrador puede cambiar el modo.' });
        }

        const { modo } = req.body;
        if (modo !== 'real' && modo !== 'pruebas') {
            return res.status(400).json({ ok: false, msg: 'El modo debe ser "real" o "pruebas".' });
        }

        if (modo === 'pruebas' && !fs.existsSync(RUTA_EXCEL_PRUEBAS)) {
            if (fs.existsSync(RUTA_EXCEL_REAL)) {
                fs.copyFileSync(RUTA_EXCEL_REAL, RUTA_EXCEL_PRUEBAS);
                console.log('📋 Copia de pruebas creada a partir del Excel real.');
            }
        }

        const modoAnterior = modoActual;
        modoActual = modo;

        // Si esto falla, el cambio de modo NO es real — se revierte aquí
        // mismo y se avisa con un error de verdad, en vez de responder
        // "ok" y dejar que el modo viva SOLO en memoria. Antes, si esto
        // fallaba en silencio, todo seguía funcionando normal hasta el
        // próximo reinicio del servidor — ahí el modo volvía a leerse
        // del archivo (todavía con el valor viejo) sin que nadie se
        // enterara de que nunca quedó guardado de verdad.
        if (!guardarModoEnDisco()) {
            modoActual = modoAnterior;
            return res.status(500).json({
                ok: false,
                msg: 'No se pudo guardar el cambio de modo en el servidor. Sigues en el modo anterior — intenta de nuevo o revisa los permisos de la carpeta del backend.'
            });
        }

        cacheExcel = null; cacheUsuariosReales.ts = 0; // se invalida — la próxima lectura toma el archivo del modo nuevo

        console.log(`🔀 Modo cambiado a: ${modoActual}`);
        res.json({ ok: true, modo: modoActual });
    } catch (error) {
        console.error('❌ Error cambiando de modo:', error);
        res.status(500).json({ ok: false, msg: 'No se pudo cambiar de modo.' });
    }
});

// ============================================================
// RESTAURAR DESDE RESPALDO — para deshacer operaciones grandes (como
// "Generar Matriz", que puede crear/reemplazar cientos de viajes de un
// solo golpe) que el Deshacer normal NO cubre (ese solo guarda cambios
// chiquitos, uno por uno). Cada guardado YA crea un respaldo automático
// antes de escribir — esto solo expone una forma de VOLVER a uno de
// esos respaldos, sin tener que ir a buscarlo a mano en la carpeta.
// ============================================================
app.get('/api/respaldos', async (req, res) => {
    try {
        // Solo admin: esta ruta es GET, así que el middleware global de
        // roles (arriba) la deja pasar sin revisar nada — el chequeo tiene
        // que hacerse aquí mismo, igual que en /api/auditoria.
        const solicitante = normalizarEmail(req.headers['x-user-email']);
        if (solicitante !== normalizarEmail(ADMIN_EMAIL)) {
            return res.status(403).json({ ok: false, msg: 'Solo el administrador puede ver los respaldos' });
        }
        const respaldos = listarRespaldosDB(modoActual);
        res.json({ ok: true, respaldos });
    } catch (error) {
        console.error('❌ Error listando respaldos:', error);
        res.status(500).json({ ok: false, msg: 'No se pudieron listar los respaldos.' });
    }
});

// ============================================================
// DESHACER ACCIONES MASIVAS (Generar Matriz, Importar viajes reales,
// Restaurar respaldo): antes de aplicarlas se toma un respaldo y su nombre
// vuelve a la app, que lo guarda en su historial de Deshacer. Deshacer =
// restaurar ese respaldo. Quien hizo la acción puede deshacerla aunque no
// sea admin (solo con SUS respaldos de deshacer; se olvidan al reiniciar
// el servidor, y entonces solo el admin puede restaurarlos).
// ============================================================
const respaldosParaDeshacer = new Map(); // nombre -> correo de quien hizo la acción
async function respaldoAntesDeAccion(etiqueta, solicitante) {
    const nombre = path.basename(await crearRespaldoDB(modoActual, etiqueta));
    respaldosParaDeshacer.set(nombre, normalizarEmail(solicitante));
    return nombre;
}

// ============================================================
// HISTÓRICO — meses cerrados, guardados en la base (antes vivían solo en
// el navegador de quien cerraba el mes, y el servidor no tenía estas rutas).
// Cerrar mes NO borra viajes: guarda una foto del mes con sus totales.
// ============================================================
const MESES_NOMBRE = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

app.get('/api/historico', (req, res) => {
    try {
        res.json({ ok: true, meses: listarHistoricoMesesDB(modoActual) });
    } catch (error) {
        console.error('🚨 Error en /api/historico:', error);
        res.status(500).json({ ok: false, msg: error.message });
    }
});

app.post('/api/cerrar-mes', (req, res) => {
    try {
        if (!permisosDelSolicitante(req)?.editarHistorico) {
            return res.status(403).json({ ok: false, msg: 'Tu cuenta no tiene permiso para cerrar meses.' });
        }
        const datos = req.body || {};
        const mes = Number(datos.mes), anio = Number(datos.anio);
        if (!Number.isInteger(mes) || mes < 0 || mes > 11 || !Number.isInteger(anio) || anio < 2000) {
            return res.status(400).json({ ok: false, msg: 'Mes o año inválido.' });
        }
        const label = `${MESES_NOMBRE[mes]} de ${anio}`;
        const yaEstaba = listarHistoricoMesesDB(modoActual).some(h => h.mes === mes && h.anio === anio);
        const cerradoPor = normalizarEmail(req.headers['x-user-email']);
        guardarHistoricoMesDB(modoActual, { mes, anio, datos: { ...datos, label }, cerradoPor });
        res.locals.auditoriaResumen = {
            mes: label, totalViajes: datos.totalViajes, costo: datos.costo, reemplazo: yaEstaba
        };
        console.log(`📦 ${cerradoPor} cerró ${label} (${datos.totalViajes || 0} viajes)${yaEstaba ? ' — reemplaza el cierre anterior' : ''}`);
        res.json({ ok: true, label, reemplazo: yaEstaba });
    } catch (error) {
        console.error('🚨 Error en /api/cerrar-mes:', error);
        res.status(500).json({ ok: false, msg: error.message });
    }
});

app.post('/api/limpiar-historial', async (req, res) => {
    try {
        if (!permisosDelSolicitante(req)?.editarHistorico) {
            return res.status(403).json({ ok: false, msg: 'Tu cuenta no tiene permiso para limpiar el histórico.' });
        }
        const respaldoAntes = await respaldoAntesDeAccion('antes-limpiar-historico', req.headers['x-user-email']);
        const borrados = limpiarHistoricoMesesDB(modoActual);
        res.locals.auditoriaExtra = { borrados };
        res.json({ ok: true, borrados, respaldoAntes });
    } catch (error) {
        console.error('🚨 Error en /api/limpiar-historial:', error);
        res.status(500).json({ ok: false, msg: error.message });
    }
});

app.post('/api/respaldos/restaurar', async (req, res) => {
    try {
        // Solo admin: el middleware global ya bloquea 'lector' aquí (es
        // POST), pero un 'editor' seguiría pasando. Restaurar un respaldo
        // reemplaza la base completa, así que se restringe a admin también.
        const solicitante = normalizarEmail(req.headers['x-user-email']);
        const { nombre } = req.body;
        if (!nombre || typeof nombre !== 'string') {
            return res.status(400).json({ ok: false, msg: 'Falta el nombre del respaldo a restaurar.' });
        }
        const esSuDeshacer = !!solicitante && respaldosParaDeshacer.get(path.basename(nombre)) === solicitante;
        if (solicitante !== normalizarEmail(ADMIN_EMAIL) && !esSuDeshacer) {
            return res.status(403).json({ ok: false, msg: 'Solo el administrador puede restaurar respaldos' });
        }

        // Antes de sobreescribir, se guarda un respaldo del estado ACTUAL
        // (así restaurar también se puede deshacer, restaurando ESE
        // respaldo nuevo si hace falta volver atrás de la restauración).
        const respaldoAntes = await respaldoAntesDeAccion('antes-restaurar', solicitante);

        restaurarRespaldoDB(path.basename(nombre), modoActual);
        cacheExcel = null; cacheUsuariosReales.ts = 0; // se invalida — la próxima lectura toma la base recién restaurada

        console.log(`♻️ Base de datos restaurada desde el respaldo: ${nombre}`);
        res.json({ ok: true, respaldoAntes });
    } catch (error) {
        console.error('❌ Error restaurando respaldo:', error);
        res.status(500).json({ ok: false, msg: error.message || 'No se pudo restaurar el respaldo.' });
    }
});

app.get('/api/dashboard-data', (req, res) => {
    try {
        console.log("-> Procesando solicitud de dashboard-data...");
        // Esta respuesta cambia todo el tiempo (viajes, vehículos...) — le
        // decimos al navegador explícitamente que nunca la guarde en
        // caché, para que cada consulta vaya de verdad al servidor.
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        // Se invalida el caché en memoria ANTES de leer, así esta
        // respuesta (la que alimenta TODA la app en ds.S, cada 20
        // segundos) siempre refleja lo que hay de verdad en la base de
        // datos ahora mismo — nunca una copia guardada de una lectura
        // anterior. Cuesta un poco más leer la base cada vez, pero para
        // el tamaño de esta base es insignificante, y elimina de raíz
        // cualquier duda de "¿el servidor tiene esto actualizado?".
        cacheExcel = null; cacheUsuariosReales.ts = 0;
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
                    // Estos dos se estaban perdiendo aquí (existían en la base
                    // pero esta transformación armaba su propio objeto sin
                    // incluirlos) — categoria además tenía el problema más
                    // grave de ni siquiera existir en la tabla; ver db.js.
                    categoria: v.categoria || 'Viajero',
                    soatVence: v.soatVence || null,
                    tecnoVence: v.tecnoVence || null,
                    // Control de versiones (protección contra choques) — sin
                    // esto, el propio endpoint que arma esta respuesta se
                    // comía estos 3 campos antes de que llegaran a la
                    // pantalla, igual que ya le había pasado con categoria/
                    // soatVence/tecnoVence arriba.
                    version: v.version || 1,
                    editadoPor: v.editadoPor,
                    editadoEn: v.editadoEn,
                    historialMantenimiento: (() => {
                        if (Array.isArray(v.historialMantenimiento)) return v.historialMantenimiento;
                        if (typeof v.historialMantenimiento === 'string') {
                            try { return JSON.parse(v.historialMantenimiento); } catch { return []; }
                        }
                        return [];
                    })(),
                    historialAverias: (() => {
                        if (Array.isArray(v.historialAverias)) return v.historialAverias;
                        if (typeof v.historialAverias === 'string') {
                            try { return JSON.parse(v.historialAverias); } catch { return []; }
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
        // Se manda el modo actual junto con todo lo demás — así
        // cualquier pantalla (no solo Configuración, que antes era la
        // única que lo sabía) puede mostrar un aviso si estás en Prueba.
        dataSegura.modo = modoActual;
        res.json({ ok: true, data: dataSegura });
    } catch (error) {
        res.status(500).json({ ok: false, message: "Error al leer el archivo", error: error.message });
    }
});

// ============================================================
// GUARDAR VEHÍCULOS / RUTAS / CONDUCTORES CON CONTROL DE VERSIONES
// ============================================================
// Mismo mecanismo que guardarViajeVersionado, pero genérico — sirve para
// las tres entidades: compara la versión que trae la petición contra la
// actual y devuelve un choque si no coinciden, o los datos ya listos
// para guardar (con la versión subida y quién/cuándo) si no hay choque.
const verificarYVersionarEntidad = (existente, entrante, solicitante) => {
    const versionActual = existente ? (Number(existente.version) || 1) : 0;
    const versionRecibida = Number(entrante.version);
    const traeVersion = entrante.version !== undefined && entrante.version !== null && Number.isFinite(versionRecibida);

    if (existente && traeVersion && versionRecibida !== versionActual) {
        return { conflicto: true, actual: existente };
    }
    return {
        conflicto: false,
        version: versionActual + 1,
        editadoPor: solicitante || '',
        editadoEn: new Date().toISOString()
    };
};

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

        // Protección contra choques — SOLO tiene sentido cuando llega UN
        // vehículo (el guardado normal desde el modal de edición). Las
        // cargas masivas (importar Excel) mandan la tabla completa de una
        // sola vez; ahí "chocar por versión" no tendría sentido.
        const solicitanteVehiculo = normalizarEmail(req.headers['x-user-email']);
        if (vehiculosAProcesar.length === 1) {
            const vf = vehiculosAProcesar[0];
            const placaChequeo = String(vf.p || vf.placa || vf.veh || '').toUpperCase().trim();
            const existentePrevio0 = (data.vehiculos || []).find(v => String(v.p || v.placa || '').toUpperCase().trim() === placaChequeo);
            const rChequeo = verificarYVersionarEntidad(existentePrevio0, vf, solicitanteVehiculo);
            if (rChequeo.conflicto) {
                res.locals.auditoriaOmitir = true;
                return res.status(409).json({
                    ok: false, conflicto: true,
                    msg: 'Este vehículo fue modificado por otra persona mientras lo editabas.',
                    actual: rChequeo.actual
                });
            }
        }

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
                mantFin: vehFront.mantFin || null,
                // Este endpoint armaba su PROPIO objeto sin estos dos campos,
                // así que se perdían aquí mismo (se reemplazaba toda la fila
                // de data.vehiculos con esta versión recortada) antes de
                // llegar a guardarEnExcel() — que sí sabía guardarlos, pero
                // ya recibía la versión sin ellos. Si el frontend los manda,
                // se usan; si no, se conserva lo que ya hubiera guardado
                // (nunca se borran por accidente en una actualización que
                // no los toca).
                historialMantenimiento: vehFront.historialMantenimiento !== undefined
                    ? vehFront.historialMantenimiento
                    : (data.vehiculos?.find(v => String(v.p || v.placa || '').toUpperCase().trim() === placa)?.historialMantenimiento || []),
                historialAverias: vehFront.historialAverias !== undefined
                    ? vehFront.historialAverias
                    : (data.vehiculos?.find(v => String(v.p || v.placa || '').toUpperCase().trim() === placa)?.historialAverias || []),
                // Urbano / Viajero / Tercero — mismo patrón que arriba:
                // si el frontend no lo manda, se conserva lo que ya
                // hubiera guardado (o "Viajero" si es un vehículo nuevo).
                categoria: vehFront.categoria || (data.vehiculos?.find(v => String(v.p || v.placa || '').toUpperCase().trim() === placa)?.categoria) || 'Viajero'
            };

            {
                const existentePrevio = data.vehiculos?.find(v => String(v.p || v.placa || '').toUpperCase().trim() === placa);
                if (vehiculosAProcesar.length === 1) {
                    // El único camino (guardado de a uno) ya pasó el chequeo de
                    // choque arriba — aquí solo se sube la versión de verdad.
                    vehiculoFormateado.version = (Number(existentePrevio?.version) || 0) + 1;
                    vehiculoFormateado.editadoPor = solicitanteVehiculo || existentePrevio?.editadoPor || null;
                    vehiculoFormateado.editadoEn = new Date().toISOString();
                } else {
                    // Carga masiva: se conserva la versión/autoría que ya
                    // hubiera — nunca se resetea a 1 solo por reimportar.
                    vehiculoFormateado.version = existentePrevio?.version || 1;
                    vehiculoFormateado.editadoPor = existentePrevio?.editadoPor || null;
                    vehiculoFormateado.editadoEn = existentePrevio?.editadoEn || null;
                }
            }

            if (!data.vehiculos) data.vehiculos = [];

            // Si el vehículo queda en mantenimiento con fechas, cualquier
            // viaje "Programado" de esta placa que caiga en ese rango se
            // cancela solo — así deja de contar de inmediato (Dashboard,
            // comparativos, etc.) sin esperar a que alguien regenere la
            // matriz del mes. No hace falta que el mantenimiento sea
            // "nuevo": revisarlo en cada guardado es inofensivo (un viaje
            // ya cancelado no se vuelve a tocar).
            if (vehiculoFormateado.mantInicio && vehiculoFormateado.mantFin) {
                const cancelados = cancelarViajesEnConflicto(
                    data, placa,
                    `Vehículo en mantenimiento (${vehiculoFormateado.mantInicio} a ${vehiculoFormateado.mantFin})`,
                    (fecha, vj) => !!mantenimientoQueChoca(
                        [{ inicio: vehiculoFormateado.mantInicio, fin: vehiculoFormateado.mantFin }],
                        fecha, diasOcupadoViaje(vj)
                    )
                );
                if (cancelados > 0) {
                    console.log(`🛠️ ${cancelados} viaje(s) de ${placa} cancelados automáticamente por mantenimiento.`);
                }
            }

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

        const esGuardadoDeUno = vehiculosAProcesar.length === 1;
        const vehiculoGuardado = esGuardadoDeUno
            ? data.vehiculos.find(v => String(v.p || v.placa || '').toUpperCase().trim() === String(vehiculosAProcesar[0].p || vehiculosAProcesar[0].placa || vehiculosAProcesar[0].veh || '').toUpperCase().trim())
            : null;

        return res.status(200).json({
            ok: true,
            msg: vehiculosAProcesar.length > 1 ? 'Maestro de vehículos actualizado y synchronized correctamente' : 'Vehículo guardado con éxito',
            // Igual que en /api/viajes — así el navegador sabe en qué
            // versión quedó, sin tener que volver a pedir todos los datos.
            version: vehiculoGuardado?.version,
            editadoPor: vehiculoGuardado?.editadoPor,
            editadoEn: vehiculoGuardado?.editadoEn
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
        cacheExcel = null; cacheUsuariosReales.ts = 0; // la próxima leerExcel() va a releer el archivo real
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
        if (!permisosDelSolicitante(req)?.verAdministracion) {
            return res.status(403).json({ ok: false, msg: 'Tu cuenta no tiene permiso para ver la auditoría' });
        }

        const limite = Math.min(Number(req.query.limite) || 200, 1000);
        // Migrado de auditoria.jsonl a SQLite — listarAuditoriaDB ya
        // devuelve los eventos más recientes primero, misma forma que
        // antes ({ fecha, usuario, metodo, ruta, modo, resumen }).
        const eventos = listarAuditoriaDB(limite);

        res.json({ ok: true, eventos });
    } catch (error) {
        console.error("🚨 Error en /api/auditoria:", error);
        res.status(500).json({ ok: false, msg: error.message });
    }
});

// --- Ver los respaldos disponibles (solo admin) ---
// (el endpoint GET /api/respaldos real está arriba, cerca de guardarEnExcel —
// aquí había una segunda definición duplicada que NUNCA se ejecutaba,
// porque Express usa la primera que coincide con la ruta. Se quitó.)

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

// Borrar una novedad (lo usa Deshacer al revertir una novedad recién creada).
app.post('/api/novedades/eliminar', (req, res) => {
    try {
        const data = leerExcel();
        const antes = (data.novedades || []).length;
        data.novedades = (data.novedades || []).filter(n => String(n.id) !== String(req.body.id));
        if (data.novedades.length === antes) return res.status(404).json({ ok: false, msg: 'Novedad no encontrada' });
        guardarEnExcel(data);
        res.json({ ok: true });
    } catch (error) {
        console.error('🚨 Error en /api/novedades/eliminar:', error);
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

        // Contexto para la auditoría — el body de la petición solo trae el id.
        res.locals.auditoriaExtra = { titulo: novedad.titulo, tipo: novedad.tipo };

        // resuelta:false = volver a abrirla (lo usa Deshacer).
        novedad.resuelta = req.body.resuelta === false ? false : true;
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
// ============================================================
// GUARDAR UN VIAJE CON CONTROL DE VERSIONES
// ============================================================
// Evita que dos personas se pisen los cambios sin darse cuenta. Cada viaje
// tiene una "version" que sube en 1 con cada guardado aceptado (junto con
// quién lo guardó y cuándo):
//  - Si la petición TRAE una versión y no coincide con la actual, alguien
//    más lo modificó en medio: NO se guarda y se devuelve el viaje actual,
//    para que quien editaba decida qué hacer (conflicto).
//  - Si la petición NO trae versión (guardados rápidos/automáticos, deshacer,
//    viajes nuevos), se guarda como siempre — solo el modal de edición y los
//    cambios hechos sin conexión mandan versión y quedan protegidos.
// Función pura (recibe y modifica "data"), para poder probarla sola.
const guardarViajeVersionado = (data, viaje, solicitante) => {
    if (!data.viajes) data.viajes = [];

    const index = viaje.id !== undefined
        ? data.viajes.findIndex(v => v.id === viaje.id)
        : -1;
    const existente = index !== -1 ? data.viajes[index] : null;
    const versionActual = existente ? (Number(existente.version) || 1) : 0;

    const versionRecibida = Number(viaje.version);
    const traeVersion = viaje.version !== undefined && viaje.version !== null && Number.isFinite(versionRecibida);

    if (existente && traeVersion && versionRecibida !== versionActual) {
        return { conflicto: true, actual: existente };
    }

    const guardado = {
        ...viaje,
        version: versionActual + 1,
        editadoPor: solicitante || '',
        editadoEn: new Date().toISOString()
    };
    if (index !== -1) data.viajes[index] = guardado;
    else data.viajes.push(guardado);

    return { conflicto: false, guardado, esNuevo: index === -1 };
};

app.post('/api/viajes', (req, res) => {
    try {
        console.log("\n📥 [PETICIÓN] POST /api/viajes");
        const data = leerExcel();
        const viaje = req.body;

        if (!viaje || !viaje.placa && !viaje.p) {
            return res.status(400).json({ ok: false, msg: 'Falta la placa del vehículo' });
        }

        // Ningún viaje puede quedar encima de un mantenimiento (salvo
        // salir el último día). Solo se revisa si el viaje es nuevo o si
        // cambió de vehículo/fechas — así se puede seguir marcando como
        // Entregado o cancelando un viaje viejo sin que se bloquee.
        const ESTADOS_SIN_VEHICULO = ['Cancelado', 'Mantenimiento'];
        if (viaje.fecha && !ESTADOS_SIN_VEHICULO.includes(viaje.estado)) {
            const placaViaje = String(viaje.placa || viaje.p || '').toUpperCase().trim();
            const previo = viaje.id !== undefined ? (data.viajes || []).find(v => v.id === viaje.id) : null;
            const cambioVehiculoOFechas = !previo ||
                String(previo.placa || previo.p || '').toUpperCase().trim() !== placaViaje ||
                previo.fecha !== viaje.fecha ||
                Number(previo.salida || 0) !== Number(viaje.salida || 0) ||
                Number(previo.retorno || 0) !== Number(viaje.retorno || 0);
            if (cambioVehiculoOFechas) {
                const vehiculo = (data.vehiculos || []).find(v => String(v.p || v.placa || '').toUpperCase().trim() === placaViaje);
                const choque = mantenimientoQueChoca(rangosMantenimiento(vehiculo), viaje.fecha, diasOcupadoViaje(viaje));
                if (choque) {
                    res.locals.auditoriaOmitir = true;
                    return res.status(400).json({
                        ok: false,
                        msg: `${placaViaje} está en mantenimiento del ${choque.inicio} al ${choque.fin}. Solo se le puede asignar un viaje que salga el último día (${choque.fin}).`
                    });
                }
            }
        }

        const solicitante = normalizarEmail(req.headers['x-user-email']);
        const resultado = guardarViajeVersionado(data, viaje, solicitante);

        if (resultado.conflicto) {
            console.log(`⚠️ Choque de edición en el viaje id=${viaje.id}: llegó versión ${viaje.version}, la actual es ${resultado.actual.version} (editado por ${resultado.actual.editadoPor || 'desconocido'}).`);
            // Un intento rechazado no cambió nada — no va a la auditoría
            // (saldría como "Guardó el viaje..." sin haberlo guardado).
            res.locals.auditoriaOmitir = true;
            return res.status(409).json({
                ok: false,
                conflicto: true,
                msg: 'Este viaje fue modificado por otra persona mientras lo editabas.',
                actual: resultado.actual
            });
        }

        const g = resultado.guardado;
        console.log(resultado.esNuevo
            ? `➕ Insertando nuevo viaje: ${g.placa || g.p} -> ${g.ruta}`
            : `🔄 Actualizando viaje id=${g.id} (versión ${g.version})`);

        guardarEnExcel(data);
        return res.status(200).json({
            ok: true,
            msg: 'Viaje guardado correctamente',
            version: g.version,
            editadoPor: g.editadoPor,
            editadoEn: g.editadoEn
        });
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

        // Se busca ANTES de borrar — el body de la petición solo trae el
        // id (no dice nada por sí solo en la auditoría), así que se deja
        // el contexto legible en res.locals para que el middleware lo
        // recoja al final.
        const viajeEncontrado = data.viajes.find(v => v.id === idViaje);
        if (viajeEncontrado) {
            res.locals.auditoriaExtra = {
                placa: viajeEncontrado.p || viajeEncontrado.placa,
                ruta: viajeEncontrado.ruta || viajeEncontrado.codigo,
                destino: viajeEncontrado.destino,
                fecha: viajeEncontrado.fecha
            };
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

        const solicitanteRuta = normalizarEmail(req.headers['x-user-email']);
        const existenteRuta = data.rutas.find(r => String(r.cod || r.codigo || '').toUpperCase().trim() === String(codBuscado).toUpperCase().trim());
        const vRuta = verificarYVersionarEntidad(existenteRuta, ruta, solicitanteRuta);
        if (vRuta.conflicto) {
            res.locals.auditoriaOmitir = true;
            return res.status(409).json({
                ok: false, conflicto: true,
                msg: 'Esta ruta fue modificada por otra persona mientras la editabas.',
                actual: vRuta.actual
            });
        }
        ruta.version = vRuta.version;
        ruta.editadoPor = vRuta.editadoPor;
        ruta.editadoEn = vRuta.editadoEn;

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
        res.status(200).json({ ok: true, msg: 'Ruta guardada correctamente', version: ruta.version, editadoPor: ruta.editadoPor, editadoEn: ruta.editadoEn });
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

        const solicitanteCond = normalizarEmail(req.headers['x-user-email']);
        if (!data.conductores) data.conductores = [];
        const existenteCond = data.conductores.find(c => String(c.ced || c.cedula || c.cc || '').trim() === cedula);
        const vCond = verificarYVersionarEntidad(existenteCond, entrada, solicitanteCond);
        if (vCond.conflicto) {
            res.locals.auditoriaOmitir = true;
            return res.status(409).json({
                ok: false, conflicto: true,
                msg: 'Este conductor fue modificado por otra persona mientras lo editabas.',
                actual: vCond.actual
            });
        }
        nuevoConductor.version = vCond.version;
        nuevoConductor.editadoPor = vCond.editadoPor;
        nuevoConductor.editadoEn = vCond.editadoEn;

        // Mismo criterio que con mantenimiento: si este conductor tiene
        // un vehículo asignado y descansos registrados, cualquier viaje
        // "Programado" de esa placa que caiga justo en un día de
        // descanso se cancela solo — sin esperar a regenerar el mes.
        if (nuevoConductor.veh && nuevoConductor.descansosPorMes) {
            let totalCancelados = 0;
            Object.entries(nuevoConductor.descansosPorMes).forEach(([claveMes, diasTexto]) => {
                const [nombreMes, anioTexto] = String(claveMes).split('-');
                const numeroMes = MESES_MAP[nombreMes];
                if (!numeroMes || !anioTexto) return; // clave con formato inesperado — se ignora

                const dias = String(diasTexto || '').split(',').map(x => Number(x.trim())).filter(x => !isNaN(x));
                dias.forEach(dia => {
                    const fechaDescanso = `${anioTexto}-${String(numeroMes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
                    totalCancelados += cancelarViajesEnConflicto(
                        data, nuevoConductor.veh,
                        `Conductor en descanso el ${fechaDescanso}`,
                        (fecha) => fecha === fechaDescanso
                    );
                });
            });
            if (totalCancelados > 0) {
                console.log(`💤 ${totalCancelados} viaje(s) de ${nuevoConductor.veh} cancelados automáticamente por descanso del conductor.`);
            }
        }

        const index = data.conductores.findIndex(c => String(c.ced || c.cedula || c.cc || '').trim() === cedula);
        if (index !== -1) {
            data.conductores[index] = nuevoConductor;
        } else {
            data.conductores.push(nuevoConductor);
        }

        guardarEnExcel(data);
        res.status(201).json({ ok: true, msg: 'Conductor guardado correctamente', version: nuevoConductor.version, editadoPor: nuevoConductor.editadoPor, editadoEn: nuevoConductor.editadoEn });
    } catch (error) {
        res.status(500).json({ ok: false, msg: error.message });
    }
});

app.post('/api/conductores/eliminar', (req, res) => {
    try {
        const data = leerExcel();
        const { id, ced } = req.body; 
        const cedulaBuscar = String(id || ced).trim();

        // Se busca ANTES de borrar, por la misma razón que en
        // viajes/eliminar — el body solo trae la cédula, no el nombre.
        const conductorEncontrado = data.conductores.find(c => String(c.ced).trim() === cedulaBuscar);
        if (conductorEncontrado) {
            res.locals.auditoriaExtra = {
                nombre: conductorEncontrado.nom || conductorEncontrado.nombre,
                placa: conductorEncontrado.veh || conductorEncontrado.placa
            };
        }

        data.conductores = data.conductores.filter(c => String(c.ced).trim() !== cedulaBuscar);
        guardarEnExcel(data);
        res.json({ ok: true, msg: 'Conductor eliminado correctamente' });
    } catch (error) {
        res.status(500).json({ ok: false, msg: error.message });
    }
});


//-------------------------------------------------------------------------


// --- SESIONES ACTIVAS: ver desde dónde hay sesiones abiertas y cerrarlas ---
const datosPublicosSesion = (x, sesionActualId) => ({
    id: x.id,
    email: x.email,
    ip: x.ip,
    dispositivo: x.dispositivo,
    creada: x.creada,
    ultima: x.ultima,
    actual: !!sesionActualId && x.id === sesionActualId
});

app.get('/api/sesiones', (req, res) => {
    const yo = req.usuarioVerificado;
    if (!yo) return res.status(401).json({ ok: false, codigo: 'sin_pase', msg: 'Debes iniciar sesión.' });
    const esAdmin = yo === normalizarEmail(ADMIN_EMAIL);
    const verTodas = esAdmin && String(req.query.todas || '') === '1';
    const lista = sesionesActivas
        .filter(x => verTodas || x.email === yo)
        .map(x => datosPublicosSesion(x, req.sesionId))
        .sort((a, b) => Date.parse(b.ultima) - Date.parse(a.ultima));
    res.json({ ok: true, esAdmin, sesiones: lista, maxSesiones: MAX_SESIONES_POR_CUENTA });
});

app.post('/api/sesiones/cerrar', (req, res) => {
    const yo = req.usuarioVerificado;
    if (!yo) return res.status(401).json({ ok: false, codigo: 'sin_pase', msg: 'Debes iniciar sesión.' });
    const esAdmin = yo === normalizarEmail(ADMIN_EMAIL);
    const id = String(req.body?.id || '');
    const sesion = sesionesActivas.find(x => x.id === id);
    if (!sesion) return res.status(404).json({ ok: false, msg: 'Esa sesión ya no existe.' });
    if (sesion.email !== yo && !esAdmin) {
        return res.status(403).json({ ok: false, msg: 'No puedes cerrar la sesión de otra cuenta.' });
    }
    // "Sacar" una sesión que no es la propia actual bloquea ese dispositivo
    // para esa cuenta — así no basta con volver a escribir la contraseña
    // para entrar de nuevo ahí. Cerrar tu PROPIA sesión actual (un logout
    // normal) nunca bloquea nada — eso seguiría dejándote sin poder volver
    // a entrar desde tu propio computador. El administrador nunca se
    // bloquea a sí mismo (ver el porqué en dispositivoEstaBloqueado/login).
    const esLaPropiaActual = id === req.sesionId;
    if (!esLaPropiaActual && sesion.email !== normalizarEmail(ADMIN_EMAIL)) {
        bloquearDispositivoDeSesion(sesion);
    }

    sesionesActivas = sesionesActivas.filter(x => x.id !== id);
    guardarSesiones();
    res.json({ ok: true, eraActual: esLaPropiaActual });
});

app.post('/api/sesiones/cerrar-otras', (req, res) => {
    const yo = req.usuarioVerificado;
    if (!yo) return res.status(401).json({ ok: false, codigo: 'sin_pase', msg: 'Debes iniciar sesión.' });
    const antes = sesionesActivas.length;
    sesionesActivas = sesionesActivas.filter(x => x.email !== yo || x.id === req.sesionId);
    guardarSesiones();
    res.json({ ok: true, cerradas: antes - sesionesActivas.length });
});

app.post('/api/sesiones/cerrar-actual', (req, res) => {
    if (req.sesionId) {
        sesionesActivas = sesionesActivas.filter(x => x.id !== req.sesionId);
        guardarSesiones();
    }
    res.json({ ok: true });
});

// --- Ver los dispositivos bloqueados (solo admin) ---
app.get('/api/dispositivos-bloqueados', (req, res) => {
    const solicitante = normalizarEmail(req.headers['x-user-email']);
    if (solicitante !== normalizarEmail(ADMIN_EMAIL)) {
        return res.status(403).json({ ok: false, msg: 'Solo el administrador puede ver los dispositivos bloqueados' });
    }
    const lista = [...dispositivosBloqueados].sort((a, b) => Date.parse(b.bloqueadoEn) - Date.parse(a.bloqueadoEn));
    res.json({ ok: true, dispositivos: lista });
});

// --- Desbloquear un dispositivo (solo admin) ---
// Volver a bloquear un dispositivo (lo usa Deshacer al revertir un desbloqueo).
app.post('/api/dispositivos/bloquear', (req, res) => {
    const solicitante = normalizarEmail(req.headers['x-user-email']);
    if (solicitante !== normalizarEmail(ADMIN_EMAIL)) {
        return res.status(403).json({ ok: false, msg: 'Solo el administrador puede bloquear dispositivos' });
    }
    const { email, dispositivoId, dispositivo, ip } = req.body || {};
    if (!email || !dispositivoId) {
        return res.status(400).json({ ok: false, msg: 'Faltan datos del dispositivo a bloquear.' });
    }
    bloquearDispositivoDeSesion({ email, dispositivoId, dispositivo, ip });
    res.json({ ok: true });
});

app.post('/api/dispositivos/desbloquear', (req, res) => {
    const solicitante = normalizarEmail(req.headers['x-user-email']);
    if (solicitante !== normalizarEmail(ADMIN_EMAIL)) {
        return res.status(403).json({ ok: false, msg: 'Solo el administrador puede desbloquear dispositivos' });
    }
    const { email, dispositivoId } = req.body || {};
    if (!email || !dispositivoId) {
        return res.status(400).json({ ok: false, msg: 'Faltan datos del dispositivo a desbloquear.' });
    }
    const encontrado = desbloquearDispositivo(email, dispositivoId);
    if (!encontrado) return res.status(404).json({ ok: false, msg: 'Ese dispositivo ya no estaba bloqueado.' });
    console.log(`🔓 Dispositivo de ${email} desbloqueado (por ${solicitante})`);
    res.json({ ok: true });
});

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

        // Bloqueo por intentos fallidos repetidos (ver LOGIN_INTENTOS_MAX).
        const claveIntento = claveIntentoLogin(email, req);
        const minutosBloqueo = minutosDeBloqueoLogin(claveIntento);
        if (minutosBloqueo > 0) {
            return res.status(429).json({
                ok: false, codigo: 'demasiados_intentos',
                msg: `Demasiados intentos fallidos. Espera ${minutosBloqueo} minuto(s) e inténtalo de nuevo.`
            });
        }

        const usuario = usuarios.find(u => normalizarEmail(u.email) === email);

        // No distinguimos "no existe" de "contraseña mala" por seguridad
        // (mismo mensaje genérico para no dar pistas a quien intenta adivinar).
        if (!usuario || !usuario.passHash) {
            registrarFalloLogin(claveIntento);
            return res.status(401).json({ ok: false, msg: 'Correo o contraseña incorrectos' });
        }

        const passOk = await bcrypt.compare(pass, usuario.passHash);
        if (!passOk) {
            registrarFalloLogin(claveIntento);
            return res.status(401).json({ ok: false, msg: 'Correo o contraseña incorrectos' });
        }
        fallosLogin.delete(claveIntento);

        // Contraseña correcta: ahora sí miramos el estado de aprobación
        const esAdmin = (email === normalizarEmail(ADMIN_EMAIL));
        const estado = esAdmin ? 'APPROVED' : usuario.estado;
        const rol = rolDeCuenta(usuario, esAdmin);

        // Dispositivo bloqueado (alguien lo "Sacó" antes) — aunque la
        // contraseña sea correcta, este computador en particular no entra
        // hasta que el administrador lo desbloquee desde el panel. El
        // administrador mismo NUNCA se bloquea: si se bloqueara su único
        // dispositivo, nadie más podría entrar a desbloquearlo.
        const dispositivoId = String(req.body.dispositivoId || '').trim();
        if (!esAdmin && dispositivoEstaBloqueado(email, dispositivoId)) {
            return res.status(403).json({
                ok: false, codigo: 'dispositivo_bloqueado',
                msg: 'Este dispositivo fue desconectado de tu cuenta. Pide al administrador que lo reactive desde el panel.'
            });
        }

        return res.json({
            ok: true,
            email: usuario.email,
            nombre: usuario.nombre,
            estado: estado,
            esAdmin: esAdmin,
            rol: rol,
            permisos: permisosDeCuenta(usuario, esAdmin),
            // El "pase" que el navegador debe mandar en cada petición. Se
            // entrega con cualquier contraseña correcta (incluso si la cuenta
            // aún está pendiente): el pase solo prueba QUIÉN eres — lo que
            // puedes hacer lo decide el estado de la cuenta en cada petición.
            token: crearPase(usuario, crearSesion(usuario.email, req, dispositivoId)),
            motivoRechazo: estado === 'REJECTED' ? (usuario.motivoRechazo || '') : undefined,
            // Cuántas sesiones viejas se cerraron por el tope de
            // MAX_SESIONES_POR_CUENTA al entrar ahora (0 casi siempre).
            sesionesCerradas: req.sesionesCerradasPorTope || 0,
            maxSesiones: MAX_SESIONES_POR_CUENTA
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

        // Se disparan SIN esperar (fire-and-forget) — si el correo tarda
        // o falla, la persona no debe quedarse esperando la respuesta
        // del registro por eso. La cuenta ya quedó guardada bien.
        enviarCorreo(
            email,
            'Tu solicitud de acceso fue recibida — Makand',
            `<p>Hola ${nombre},</p>
             <p>Tu solicitud de acceso al Rutograma de Makand fue recibida correctamente y está <strong>pendiente de aprobación</strong> por parte del administrador.</p>
             <p>Te avisaremos apenas sea revisada.</p>`
        );
        // Al admin (y EMAIL_AVISOS_ADMIN) y a quien tenga permiso de aceptar cuentas.
        const avisarA = new Set([normalizarEmail(ADMIN_EMAIL), ...correosAvisosAdmin()]);
        data.usuarios.forEach(u => {
            if (u.estado === 'APPROVED' && permisosDeCuenta(u, false).gestionarCuentas) avisarA.add(normalizarEmail(u.email));
        });
        avisarA.forEach(destino => enviarCorreo(
            destino,
            'Nueva solicitud de acceso pendiente — Makand',
            `<p>Hay una solicitud de acceso nueva esperando revisión:</p>
             <ul>
               <li><strong>Nombre:</strong> ${escaparHtml(nombre)}</li>
               <li><strong>Correo:</strong> ${escaparHtml(email)}</li>
               <li><strong>Departamento:</strong> ${escaparHtml(departamento)}</li>
             </ul>
             <p>Entra a Administración para aprobarla o rechazarla.</p>`
        ));

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
// ============================================================
// IMPORTAR VIAJES REALES (Excel de operación: "DT VIAJEROS." + "CONF")
// - previsualizar:true -> solo devuelve el resumen (qué entra, qué se
//   corrigió, qué no se pudo leer, qué cambiaría en las rutas).
// - previsualizar:false -> los viajes del archivo REEMPLAZAN a los que
//   había entre su primera y su última fecha (respaldo automático antes
//   de guardar, como cualquier escritura).
// La lógica está en importacion.js (con pruebas).
// ============================================================
app.post('/api/importar/viajes-reales', async (req, res) => {
    try {
        const { archivo, previsualizar, aplicarRutas } = req.body || {};
        if (!archivo || typeof archivo !== 'string') {
            return res.status(400).json({ ok: false, msg: 'No llegó ningún archivo.' });
        }

        let libro;
        try {
            libro = leerLibroViajeros(Buffer.from(archivo, 'base64'));
        } catch (e) {
            return res.status(400).json({ ok: false, msg: `No se pudo leer el Excel: ${e.message}` });
        }

        const data = leerExcel();
        const hoy = new Date();
        const importacion = armarImportacion({
            filas: libro.filas,
            tiempos: libro.tiempos,
            rutas: data.rutas || [],
            vehiculos: data.vehiculos || [],
            fecha1904: libro.fecha1904,
            hoy: `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`
        });
        const { resumen } = importacion;
        if (!resumen.total) {
            return res.status(400).json({ ok: false, msg: 'El archivo no tiene viajes que se puedan importar.', resumen });
        }

        // Cuántos viajes que ya hay en la app se reemplazarían.
        resumen.reemplazaria = (data.viajes || []).filter(v => v.fecha && v.fecha >= resumen.desde && v.fecha <= resumen.hasta).length;

        if (previsualizar) {
            return res.status(200).json({ ok: true, previsualizacion: true, resumen });
        }

        const respaldoAntes = await respaldoAntesDeAccion('antes-importar', req.headers['x-user-email']);
        const copia = JSON.parse(JSON.stringify(data));
        const resultado = aplicarImportacion(copia, importacion, { aplicarRutas: !!aplicarRutas });
        guardarEnExcel(copia);
        res.locals.auditoriaExtra = {
            importados: resumen.total, desde: resumen.desde, hasta: resumen.hasta,
            reemplazados: resultado.reemplazados, rutasCambiadas: resultado.rutasCambiadas
        };
        console.log(`📥 Importados ${resumen.total} viajes reales (${resumen.desde} a ${resumen.hasta}); reemplazados ${resultado.reemplazados}.`);
        return res.status(200).json({ ok: true, resumen, respaldoAntes, ...resultado });
    } catch (error) {
        console.error('🚨 Error en /api/importar/viajes-reales:', error);
        return res.status(500).json({ ok: false, msg: error.message });
    }
});

app.post('/api/configuracion/generar-matriz', async (req, res) => {
    try {
        const { mes, anio, festivos, previsualizar } = req.body; 

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
        
        const dataOriginal = leerExcel();
        // En modo previsualización trabajamos sobre una COPIA completa.
        // leerExcel() devuelve la MISMA referencia en memoria (cacheExcel)
        // — sin este clon, todo el motor de abajo (borrado de viajes del
        // mes, reseteo de vehículos, creación de cupos) mutaría los datos
        // reales en vivo aunque al final no se llame a guardarEnExcel(),
        // dejando el caché a medias hasta el próximo reinicio. Con el
        // clon, todo lo de abajo se queda en esta copia y se descarta
        // solo al terminar la petición.
        const esPrevisualizacion = !!previsualizar;
        const data = esPrevisualizacion ? JSON.parse(JSON.stringify(dataOriginal)) : dataOriginal;
        // Respaldo de ANTES de tocar nada, para poder deshacer la generación.
        const respaldoAntes = esPrevisualizacion ? null
            : await respaldoAntesDeAccion('antes-generar-matriz', req.headers['x-user-email']);

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
        const listaConductores = data.conductores || [];

        if (!listaRutas.length) return res.status(400).json({ ok: false, msg: 'La pestaÃ±a de Rutas estÃ¡ vacÃ­a.' });
        if (!listaVehiculos.length) return res.status(400).json({ ok: false, msg: 'La pestaÃ±a de VehÃ­culos estÃ¡ vacÃ­a.' });

        // Limpiamos cualquier viaje viejo de este mes ANTES de generar de
        // nuevo -- revisamos tanto el campo mes/anio guardado como la fecha
        // real, para no dejar pegado nada de una generacion anterior
        // (incluida gente que le haya dado clic mas de una vez seguida).
        const mesIndexLimpieza = { 'Enero':0,'Febrero':1,'Marzo':2,'Abril':3,'Mayo':4,'Junio':5,'Julio':6,'Agosto':7,'Septiembre':8,'Octubre':9,'Noviembre':10,'Diciembre':11 }[mes];
        const totalViajesAntesDeLimpiar = (data.viajes || []).length;
        data.viajes = (data.viajes || []).filter(v => {
            // Los viajes REALES (importados del Excel de operación) nunca
            // se borran: son lo que de verdad pasó, y la generación sigue
            // a partir de ellos (ver viajesRealesDelMes más abajo).
            if (v.tipo === 'real') return true;
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
        const viajesReemplazados = totalViajesAntesDeLimpiar - data.viajes.length;

        // Viajes reales de ESTE mes: ya pasaron, así que solo se generan los
        // días posteriores al último día con datos reales.
        const viajesRealesDelMes = data.viajes.filter(v => {
            if (v.tipo !== 'real' || !v.fecha) return false;
            const f = new Date(v.fecha + 'T00:00:00');
            return f.getFullYear() === Number(anio) && f.getMonth() === mesIndexLimpieza;
        }).sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
        const ultimoDiaReal = viajesRealesDelMes.reduce((max, v) => Math.max(max, Number(v.dia || v.salida || 0)), 0);
        // Filas de cupo (ARSITRANS n / POLAR n) que usan los viajes reales
        // que se conservan — no se borran en la limpieza de cupos.
        const cuposConViajeReal = new Set(
            data.viajes.filter(v => v.tipo === 'real').map(v => String(v.p || v.placa || '').toUpperCase().trim())
        );

        listaVehiculos.forEach(v => {
            v.viajes = 0;
        });

        // Al regenerar la matriz de un mes, también se borran los
        // registros de "Vehículo varado" (historialAverias) de ESE MISMO
        // mes en cada vehículo — quedan intactos los de otros meses. Esto
        // permite reiniciar limpio para hacer pruebas sin arrastrar
        // averías de una corrida anterior de este mismo mes.
        listaVehiculos.forEach(v => {
            if (Array.isArray(v.historialAverias)) {
                v.historialAverias = v.historialAverias.filter(
                    a => !(a.mes === mes && String(a.anio) === String(anio))
                );
            }
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
            if ((esOrigenAuto || esCupoNumerado) && !cuposConViajeReal.has(placaV)) {
                listaVehiculos.splice(i, 1);
            }
        }
        if (listaVehiculos.length !== antesDeLimpiar) {
            console.log(`🧹 Se limpiaron ${antesDeLimpiar - listaVehiculos.length} cupo(s) automático(s) sin viajes vigentes.`);
        }
        data.vehiculos = listaVehiculos;

        // Mes/año INMEDIATAMENTE ANTERIOR al que se está generando — el
        // único que puede tener un vehículo "todavía en tránsito" cuando
        // arranca este mes. Antes se miraba TODO data.viajes sin filtrar
        // por mes, así que un dato suelto de pruebas viejas (de cualquier
        // mes, incluso con una fecha rota muy en el futuro) podía dejar
        // una placa "bloqueada" para siempre, sin importar cuántas veces
        // se regenerara el mes actual — el dato corrupto seguía ahí.
        const mesAnteriorIndex = mesIndex === 0 ? 11 : mesIndex - 1;
        const anioMesAnterior = mesIndex === 0 ? Number(anio) - 1 : Number(anio);

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

            // Blindaje: solo cuenta si la fecha real del viaje cae en el
            // mes inmediatamente anterior al que se está generando ahora.
            // Cualquier otro mes (pasado lejano, futuro, o dato huérfano
            // de pruebas) se ignora para este cálculo.
            if (fechaSalidaV.getFullYear() !== anioMesAnterior || fechaSalidaV.getMonth() !== mesAnteriorIndex) return;

            const fechaLiberacionV = new Date(fechaSalidaV);
            fechaLiberacionV.setDate(fechaLiberacionV.getDate() + diasBloqueadoV);
            const tsLiberacionV = fechaLiberacionV.getTime();

            if (!ultimaLiberacionPorPlaca[placaV] || tsLiberacionV > ultimaLiberacionPorPlaca[placaV]) {
                ultimaLiberacionPorPlaca[placaV] = tsLiberacionV;
            }
        });

        // Los viajes reales de este mes también ocupan al vehículo: queda
        // libre cuando vuelve del último.
        viajesRealesDelMes.forEach(v => {
            const placaV = String(v.p || v.placa || '').toUpperCase().trim();
            const salidaV = Number(v.dia || v.salida || 0);
            const diasV = Math.max(1, Number(v.retorno || salidaV) - salidaV);
            const liberacion = new Date(v.fecha + 'T00:00:00');
            liberacion.setDate(liberacion.getDate() + diasV);
            if (!ultimaLiberacionPorPlaca[placaV] || liberacion.getTime() > ultimaLiberacionPorPlaca[placaV]) {
                ultimaLiberacionPorPlaca[placaV] = liberacion.getTime();
            }
        });

        const controlDisponibilidad = {};
        listaVehiculos.forEach(v => {
            const placaStr = String(v.p || v.placa || '').toUpperCase().trim();
            if (placaStr) controlDisponibilidad[placaStr] = ultimaLiberacionPorPlaca[placaStr] || 0;
            // Los viajes reales de este mes cuentan para repartir la carga.
            v.viajes = viajesRealesDelMes.filter(x => String(x.p || x.placa || '').toUpperCase().trim() === placaStr).length;
        });

        const totalDiasMes = new Date(anio, mesIndex + 1, 0).getDate();
        // Adónde ha ido cada vehículo en esta corrida (para la variedad).
        const historialDestinos = {};
        viajesRealesDelMes.forEach(v => {
            if (String(v.tr || v.transportadora || '').toLowerCase().includes('makand')) {
                anotarDestino(historialDestinos, String(v.p || v.placa || '').toUpperCase().trim(),
                    normalizarTexto(v.destino || v.dest || v.ruta || ''));
            }
        });
        let viajesEstructurados = 0;
        let viajesMakand = 0; // Solo flota propia — para el desglose Makand vs terceros en la respuesta
        let cuposNuevosCreados = 0; // Cupos Arsitrans/Polar nuevos (no reutilizados) — para la vista previa

        // Cupos automáticos de Arsitrans/Polar de este mes — cada uno con su
        // propia placa numerada, PERO reutilizable: si un cupo ya hizo su
        // viaje y ya volvió, se le puede asignar el siguiente en vez de
        // crear uno nuevo cada vez. Solo se crea un cupo nuevo cuando
        // ninguno de los existentes está libre todavía ese día.
        let contadorCupoArsitrans = 0;
        let contadorCupoPolar = 0;
        let viajesArsitransTotal = 0; // total de viajes (no solo cupos nuevos) que cayeron en Arsitrans esta corrida — para diagnóstico
        let viajesPolarTotal = 0;
        const cupoVehiculosArsitrans = []; // { placa, disponibleDesde }
        const cupoVehiculosPolar = [];

        // Con viajes reales importados, se arranca el día siguiente al último real.
        for (let dia = ultimoDiaReal + 1; dia <= totalDiasMes; dia++) {
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
                // Ruta cancelada/desactivada: no genera viajes, sin
                // importar qué días tenga marcados. "undefined" (rutas
                // guardadas antes de que existiera este campo) se trata
                // como activa — solo un false explícito la excluye.
                if (r.activa === false) return false;

                // Vigente desde: si la ruta tiene fecha de inicio y este
                // día es anterior, todavía no debe generar nada — así una
                // ruta creada a mitad de mes no "aparece" retroactivamente
                // desde el día 1.
                if (r.vigenteDesde && fechaString < r.vigenteDesde) return false;

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
                const destinoVariedad = normalizarTexto(ruta.dest || ruta.destino || ruta.cod || '');

                const vehiculosDisponibles = listaVehiculos
                    .filter(v => {
                        const p = String(v.p || v.placa || '').toUpperCase().trim();
                        if (!p || controlDisponibilidad[p] === undefined || controlDisponibilidad[p] > timestampActual) return false;

                        // Mantenimiento (activo o ya cerrado en el historial):
                        // se revisan TODOS los días que este viaje ocuparía al
                        // vehículo, no solo el día de salida — si no, un viaje
                        // que sale justo antes del mantenimiento quedaba encima
                        // de él. Solo se permite salir el último día del
                        // mantenimiento. El hueco lo cubre otro vehículo propio
                        // o, si no hay ninguno, el relleno automático.
                        const diasOcupado = Number(ruta.diasTrans || 1) + Number(ruta.diasDesc || 0);
                        if (mantenimientoQueChoca(rangosMantenimiento(v), fechaString, diasOcupado)) return false;

                        // BUG REAL encontrado y corregido: Generar Matriz tampoco
                        // revisaba si el CONDUCTOR asignado a este vehículo tenía
                        // descanso registrado justo este día — mismo problema que
                        // el mantenimiento de arriba: al borrar y recrear todo el
                        // mes desde cero, un viaje nuevo se montaba encima de un
                        // día que debía mostrar "DESCANSO", en vez de respetarlo.
                        const conductorAsignado = listaConductores.find(c =>
                            String(c.nom || c.nombre || '').trim() === String(v.cond || v.conductor || '').trim() ||
                            String(c.veh || '').toUpperCase().trim() === p
                        );
                        if (conductorAsignado?.descansosPorMes) {
                            const claveMes = `${mes}-${anio}`;
                            const diasDescanso = String(conductorAsignado.descansosPorMes[claveMes] || '')
                                .split(',').map(x => Number(x.trim())).filter(x => !isNaN(x));
                            if (diasDescanso.includes(dia)) return false;
                        }

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

                        // Los vehículos "Urbano" nunca entran al Rutograma —
                        // solo se usan Viajero y Tercero. No se filtran en
                        // listaVehiculos (esa lista se reasigna de vuelta a
                        // data.vehiculos más abajo, y filtrarla ahí borraría
                        // los Urbanos del Excel al guardar) — se excluyen
                        // solo aquí, en el reparto real de viajes.
                        const categoriaVeh = String(v.categoria || 'Viajero').trim();
                        if (categoriaVeh === 'Urbano') return false;

                        // Si este vehículo tiene una rutina restringida (como
                        // LUN 428, solo Barranquilla/Montería), lo saltamos
                        // para cualquier otra ruta — así el hueco lo cubre
                        // otro vehículo propio, o si no hay ninguno, el
                        // relleno automático de Arsitrans/Polar.
                        return rutaPermitidaParaVehiculo(p, ruta);
                    })
                    // Para que cada vehículo haga rutas variadas en el mes (y no
                    // siempre la misma porque vuelve en el mismo ciclo), se
                    // prefiere al que no viene de este destino y menos veces
                    // ha ido — ver compararParaVariedad en reglas.js. Los de
                    // rutina fija (LUN 428) quedan igual que antes.
                    .map(v => {
                        const placa = String(v.p || v.placa || '').toUpperCase().trim();
                        return {
                            v,
                            placa,
                            libreDesde: controlDisponibilidad[placa],
                            viajes: v.viajes || 0,
                            restringido: !!RESTRICCIONES_VEHICULOS[placa.replace(/\s/g, '')]
                        };
                    })
                    .sort((a, b) => compararParaVariedad(a, b, destinoVariedad, historialDestinos))
                    .map(c => c.v);

                if (vehiculosDisponibles.length > 0) {
                    const vehiculoAsignado = vehiculosDisponibles[0];
                    const placaAsignada = String(vehiculoAsignado.p || vehiculoAsignado.placa || '').toUpperCase().trim();

                    vehiculoAsignado.viajes = (vehiculoAsignado.viajes || 0) + 1;

                    const diasBloqueado = Number(ruta.diasTrans || 1);
                    // "Días de retorno" (diasDesc) es un campo APARTE que se
                    // SUMA encima de "Días en tránsito" — para rutas donde el
                    // vehículo entrega la carga un día, pero tarda días
                    // adicionales en volver de verdad a Bogotá antes de poder
                    // tomar otra ruta. Si diasDesc es 0 (o no está puesto),
                    // no cambia nada de lo que ya funciona.
                    const diasRetornoExtra = Number(ruta.diasDesc || 0);

                    // El vehículo YA está viajando de nuevo el ÚLTIMO día de
                    // su tránsito + retorno (no un día después). "diasTrans"
                    // cuenta los días de tránsito después de la salida (sin
                    // contar el propio día de salida): diasTrans=1 -> sale
                    // lunes, el martes ya puede tomar otra ruta. diasTrans=3
                    // -> sale lunes, martes/miércoles/jueves en tránsito, y
                    // el jueves (el último de esos 3 días) ya está viajando
                    // de nuevo. "diasDesc" (días de retorno) se suma aparte
                    // si la ruta lo necesita.
                    const fechaLiberacion = new Date(fechaActual);
                    fechaLiberacion.setDate(fechaLiberacion.getDate() + diasBloqueado + diasRetornoExtra);
                    
                    controlDisponibilidad[placaAsignada] = fechaLiberacion.getTime();
                    anotarDestino(historialDestinos, placaAsignada, destinoVariedad);

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
                        retorno: dia + diasBloqueado + diasRetornoExtra, // día en que el vehículo YA está viajando de nuevo — tránsito + retorno (ver comentario arriba)
                        cajas: Number(ruta.cajasMin || 660),
                        mes: mes,
                        anio: Number(anio),
                        tarifa: tarifaFinal,
                        costo: tarifaFinal,
                        estado: 'Planificado'
                    };

                    data.viajes.push(registroViaje);
                    viajesEstructurados++;
                    viajesMakand++;
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
                    if (nombreTrCupo === 'Arsitrans') viajesArsitransTotal++;
                    else viajesPolarTotal++;

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
                        cuposNuevosCreados++;
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

        if (!esPrevisualizacion) {
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
        }

        return res.status(200).json({
            ok: true,
            respaldoAntes,
            previsualizacion: esPrevisualizacion,
            total: viajesEstructurados,
            makand: viajesMakand,
            terceros: viajesEstructurados - viajesMakand,
            viajesArsitrans: viajesArsitransTotal,
            viajesPolar: viajesPolarTotal,
            viajesReemplazados,
            cuposNuevosCreados,
            msg: esPrevisualizacion
                ? `Previsualización de ${mes}: se generarían ${viajesEstructurados} viajes.`
                : `Se estructuró la programación mensual de ${mes} de manera exitosa.`
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

        // El campo "cond" del viaje a veces solo trae un valor genérico
        // ("Asignado", "Sin asignar") en vez del nombre real. El nombre
        // real puede vivir en CUALQUIERA de dos lugares según cómo se
        // haya cargado el dato: la lista de conductores (por placa), o
        // el campo "conductor"/"cond" del propio vehículo — se revisan
        // los dos, en ese orden, antes de rendirse.
        const conductoresPorPlaca = {};
        (data.conductores || []).forEach(c => {
            const placaCond = String(c.veh || c.vehiculo || c.placa || c.p || '').toUpperCase().trim();
            const nombreCond = c.nom || c.n || c.nombre || c.nombreCompleto || c.conductor || '';
            if (placaCond && nombreCond) conductoresPorPlaca[placaCond] = nombreCond;
        });
        const conductorPorVehiculo = {};
        (data.vehiculos || []).forEach(veh => {
            const placaVeh = String(veh.p || veh.placa || veh.veh || '').toUpperCase().trim();
            const nombreVeh = veh.conductor || veh.cond || '';
            if (placaVeh && nombreVeh) conductorPorVehiculo[placaVeh] = nombreVeh;
        });
        const esCondGenerico = (cond) => {
            const c = String(cond || '').trim().toUpperCase();
            return !c || ['ASIGNADO', 'SIN ASIGNAR', 'SIN CONDUCTOR', ''].includes(c);
        };

        const filas = viajesDelMes.map(v => {
            const placaViaje = String(v.p || v.placa || '').toUpperCase().trim();
            let conductorReal = v.cond;
            if (esCondGenerico(conductorReal)) conductorReal = conductoresPorPlaca[placaViaje];
            if (esCondGenerico(conductorReal)) conductorReal = conductorPorVehiculo[placaViaje];
            if (esCondGenerico(conductorReal)) conductorReal = 'Sin asignar';

            return {
                Vehiculo: v.p || v.placa || '',
                Conductor: conductorReal,
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
            };
        });

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

// ============================================================
// ARRANQUE — http:// siempre, y https:// si hay certificado
// ============================================================
// Si en la carpeta "certs" (junto a este archivo) están los dos archivos
// del certificado (key.pem y cert.pem), el servidor atiende http:// Y
// https:// por el MISMO puerto — así se puede migrar poco a poco: quien
// siga entrando por http:// no se queda sin servicio mientras los demás
// pasan a https://. Si esos archivos no están, arranca por http:// igual
// que siempre. HTTPS hace falta para que el celular permita funciones
// como "Compartir" con un archivo adjunto. Las rutas se pueden cambiar
// con HTTPS_KEY_FILE y HTTPS_CERT_FILE en el .env.
const RUTA_HTTPS_KEY = process.env.HTTPS_KEY_FILE || path.join(__dirname, 'certs', 'key.pem');
const RUTA_HTTPS_CERT = process.env.HTTPS_CERT_FILE || path.join(__dirname, 'certs', 'cert.pem');
const PORT = 5000;

const cargarCredencialesHttps = () => {
    if (!fs.existsSync(RUTA_HTTPS_KEY) || !fs.existsSync(RUTA_HTTPS_CERT)) return null;
    try {
        const credenciales = { key: fs.readFileSync(RUTA_HTTPS_KEY), cert: fs.readFileSync(RUTA_HTTPS_CERT) };
        tls.createSecureContext(credenciales); // lanza error si los archivos no sirven
        return credenciales;
    } catch (err) {
        console.error(`⚠️ Se encontraron los archivos del certificado pero no sirven (${err.message}). Se arranca solo por http:// como siempre.`);
        return null;
    }
};

// Atiende http y https en el mismo puerto: mira el primer byte de cada
// conexión (0x16 es el saludo de TLS -> https; cualquier otro -> http) y
// se la pasa al servidor que corresponde.
const crearServidorDual = (aplicacion, credenciales, esperaPrimerByteMs = 10000) => {
    const servidorHttp = http.createServer(aplicacion);
    const servidorHttps = https.createServer(credenciales, aplicacion);

    return net.createServer((socket) => {
        // Una conexión que abre y nunca manda nada no puede quedarse colgada.
        socket.setTimeout(esperaPrimerByteMs, () => socket.destroy());
        socket.on('error', () => socket.destroy());
        socket.once('data', (primerBloque) => {
            socket.setTimeout(0);
            socket.pause();
            socket.unshift(primerBloque);
            (primerBloque[0] === 0x16 ? servidorHttps : servidorHttp).emit('connection', socket);
            process.nextTick(() => socket.resume());
        });
    });
};

const alArrancar = (conHttps) => {
    console.log(`🚀 Servidor backend corriendo en: http://localhost:${PORT}`);
    if (conHttps) console.log(`🔒 Y también por HTTPS en: https://localhost:${PORT}`);
    console.log(EXIGIR_TOKEN
        ? '🔐 Sesiones: modo ESTRICTO — toda petición necesita un pase válido.'
        : '🔓 Sesiones: modo TOLERANTE — se aceptan peticiones sin pase (con aviso [SIN PASE] por cada ruta). Cuando ya no aparezcan avisos, se puede activar EXIGIR_TOKEN=true en el .env.');
    // Resumen semanal de vencimientos: una revisión poco después de arrancar
    // (por si el servidor estaba apagado el lunes) y luego cada 30 minutos.
    setTimeout(revisarResumenSemanalVencimientos, 30 * 1000);
    setInterval(revisarResumenSemanalVencimientos, 30 * 60 * 1000);
};

const credencialesHttps = cargarCredencialesHttps();
if (credencialesHttps) {
    crearServidorDual(app, credencialesHttps).listen(PORT, () => alArrancar(true));
} else {
    app.listen(PORT, () => alArrancar(false));
}