// ============================================================
// db.js — Módulo de conexión a SQLite para Rutograma Makand
// ============================================================
// DISEÑO CLAVE: leerDB()/guardarEnDB() devuelven/reciben el MISMO
// objeto "data" con la MISMA forma que ya usa todo server.js
// (data.vehiculos, data.rutas, data.viajes, data.conductores,
// data.usuarios, data.novedades, data.historialvehiculos,
// data.historialrutas, data.historialconductores) — así el resto del
// código de negocio (generar matriz, mantenimiento, etc.) NO se toca,
// solo se reemplazan las llamadas a leerExcel()/guardarEnExcel() por
// estas.
//
// MODO REAL / PRUEBA: igual que ya tenías con dos archivos Excel
// separados, aquí hay dos archivos .db separados — se elige cuál
// abrir según el modo actual (ver conectar() más abajo).
//
// INSTALAR PRIMERO: npm install better-sqlite3
// ============================================================

const { respaldosParaBorrar } = require('../limpieza-respaldos');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const CARPETA_DATOS = path.join(__dirname, 'data');
const RUTA_DB_REAL = path.join(CARPETA_DATOS, 'rutograma.db');
const RUTA_DB_PRUEBAS = path.join(CARPETA_DATOS, 'rutograma_pruebas.db');
const RUTA_ESQUEMA = path.join(__dirname, 'esquema.sql');

if (!fs.existsSync(CARPETA_DATOS)) fs.mkdirSync(CARPETA_DATOS, { recursive: true });

const conexiones = {}; // una conexión abierta por modo, reusada

function conectar(modo = 'real') {
  const rutaDb = modo === 'pruebas' ? RUTA_DB_PRUEBAS : RUTA_DB_REAL;
  if (conexiones[modo]) return conexiones[modo];

  const db = new Database(rutaDb);
  db.pragma('journal_mode = WAL');
  db.exec(fs.readFileSync(RUTA_ESQUEMA, 'utf-8'));

  // Migraciones de columnas nuevas para bases YA EXISTENTES (creadas
  // antes de que esta columna se agregara al esquema) — CREATE TABLE
  // IF NOT EXISTS no agrega columnas a una tabla que ya existe, así
  // que se intenta agregar cada una por separado; si ya existe, SQLite
  // avisa con error y simplemente se ignora ese caso puntual.
  const agregarColumnaSiFalta = (tabla, columna, definicion) => {
    try {
      db.exec(`ALTER TABLE ${tabla} ADD COLUMN ${columna} ${definicion}`);
    } catch (e) {
      if (!String(e.message).includes('duplicate column name')) throw e;
    }
  };
  agregarColumnaSiFalta('vehiculos', 'soat_vence', 'TEXT');
  agregarColumnaSiFalta('vehiculos', 'tecno_vence', 'TEXT');
  agregarColumnaSiFalta('conductores', 'licencia_vence', 'TEXT');
  agregarColumnaSiFalta('auditoria', 'modo', "TEXT NOT NULL DEFAULT 'real'");
  // BUG REAL encontrado: estas 6 columnas nunca existieron en la tabla
  // "rutas" desde el día 1 de la migración a SQLite — no es que se
  // hayan borrado después, es que nunca tuvieron dónde guardarse. Eso
  // rompía en silencio: (1) el reparto a Arsitrans (que decide mirando
  // "clientes"), y (2) las tarifas de cada viaje generado (siempre
  // caían en 0). Ver migracion/recuperar-datos-rutas.js para
  // recuperar los valores reales desde el Excel original.
  agregarColumnaSiFalta('rutas', 'clientes', "TEXT DEFAULT ''");
  agregarColumnaSiFalta('rutas', 'tarifa', 'REAL DEFAULT 0');
  agregarColumnaSiFalta('rutas', 'tarifa_makand', 'REAL DEFAULT 0');
  agregarColumnaSiFalta('rutas', 'tarifa_arsitrans', 'REAL DEFAULT 0');
  agregarColumnaSiFalta('rutas', 'tarifa_polar', 'REAL DEFAULT 0');
  agregarColumnaSiFalta('rutas', 'cajas_min', 'INTEGER DEFAULT 100');
  agregarColumnaSiFalta('rutas', 'vigente_desde', 'TEXT');
  agregarColumnaSiFalta('rutas', 'activa', 'INTEGER NOT NULL DEFAULT 1');
  // Mismo tipo de hueco que tenía "rutas": estos campos los usa/lee el
  // formulario del frontend, pero nunca tuvieron columna en la base —
  // se perdían en cada guardado desde el día 1 de la migración.
  agregarColumnaSiFalta('vehiculos', 'categoria', "TEXT DEFAULT 'Viajero'");
  agregarColumnaSiFalta('conductores', 'descripcion', "TEXT DEFAULT ''");
  agregarColumnaSiFalta('conductores', 'observaciones', "TEXT DEFAULT ''");
  // Control de versiones — mismo criterio que en viajes: cada guardado
  // aceptado sube la versión y anota quién y cuándo, para detectar cuando
  // dos personas editan lo mismo y evitar que una pise a la otra.
  for (const tabla of ['vehiculos', 'rutas', 'conductores']) {
    agregarColumnaSiFalta(tabla, 'version', 'INTEGER NOT NULL DEFAULT 1');
    agregarColumnaSiFalta(tabla, 'editado_por', 'TEXT');
    agregarColumnaSiFalta(tabla, 'editado_en', 'TEXT');
  }
  // Mismo hueco otra vez, esta vez en "viajes" — el modal de crear/editar
  // viaje de Dashboard usa todos estos campos, pero ninguno tenía
  // columna: se perdían en cada guardado desde el día 1 de la migración.
  agregarColumnaSiFalta('viajes', 'cli', 'TEXT');
  agregarColumnaSiFalta('viajes', 'cli2', 'TEXT');
  agregarColumnaSiFalta('viajes', 'cajas2', 'INTEGER');
  agregarColumnaSiFalta('viajes', 'dest2', 'TEXT');
  agregarColumnaSiFalta('viajes', 'split', 'INTEGER NOT NULL DEFAULT 0');
  agregarColumnaSiFalta('viajes', 'split_razon', 'TEXT');
  agregarColumnaSiFalta('viajes', 'motivo_cancelacion', 'TEXT');
  agregarColumnaSiFalta('viajes', 'peso_kg', 'REAL');
  agregarColumnaSiFalta('viajes', 'vol_m3', 'REAL');
  agregarColumnaSiFalta('viajes', 'prod', "TEXT DEFAULT 'frescos'");
  agregarColumnaSiFalta('viajes', 'manif', 'TEXT');
  agregarColumnaSiFalta('viajes', 'obs', 'TEXT');
  agregarColumnaSiFalta('viajes', 'hora_real', 'TEXT');
  agregarColumnaSiFalta('viajes', 'fecha_entrega', 'TEXT');
  // "Ya salí" / "Ya llegué" del conductor (fecha y hora ISO de cada uno).
  agregarColumnaSiFalta('viajes', 'salida_real', 'TEXT');
  agregarColumnaSiFalta('viajes', 'llegada_real', 'TEXT');
  agregarColumnaSiFalta('viajes', 'cond_temporal', 'TEXT');
  agregarColumnaSiFalta('viajes', 'novedades', "TEXT NOT NULL DEFAULT '[]'");
  // Novedad de conductor con foto (el archivo va en data/fotos-novedades).
  agregarColumnaSiFalta('novedades', 'foto', 'INTEGER NOT NULL DEFAULT 0');
  // Estas 5 son las que de verdad usa la TARJETA del Rutograma (una
  // pantalla distinta al modal de Dashboard de arriba) — nombres
  // distintos para conceptos parecidos: peso/volumen en vez de
  // pesoKg/volM3, manifiesto en vez de manif, y costo/prioridad que
  // ni siquiera estaban contempladas.
  agregarColumnaSiFalta('viajes', 'peso', 'REAL');
  agregarColumnaSiFalta('viajes', 'volumen', 'REAL');
  agregarColumnaSiFalta('viajes', 'manifiesto', 'TEXT');
  agregarColumnaSiFalta('viajes', 'costo', 'REAL');
  agregarColumnaSiFalta('viajes', 'prioridad', "TEXT DEFAULT 'Normal'");
  // Control de versiones de viajes — cada guardado aceptado sube la versión
  // en 1 y anota quién y cuándo, para detectar cuando dos personas editan
  // lo mismo y evitar que una pise a la otra sin avisar.
  agregarColumnaSiFalta('viajes', 'version', 'INTEGER NOT NULL DEFAULT 1');
  agregarColumnaSiFalta('viajes', 'editado_por', 'TEXT');
  agregarColumnaSiFalta('viajes', 'editado_en', 'TEXT');
  agregarColumnaSiFalta('usuarios', 'motivo_rechazo', 'TEXT');
  // Permisos personalizados (JSON). NULL = los de su rol.
  agregarColumnaSiFalta('usuarios', 'permisos', 'TEXT');
  // Cuenta de rol "conductor": cédula del conductor al que está enlazada.
  agregarColumnaSiFalta('usuarios', 'conductor_ced', 'TEXT');

  conexiones[modo] = db;
  return db;
}

const aJSON = (valor, porDefecto) => {
  try {
    return valor ? JSON.parse(valor) : porDefecto;
  } catch {
    return porDefecto;
  }
};

function leerDB(modo = 'real') {
  const db = conectar(modo);

  const vehiculos = db.prepare('SELECT * FROM vehiculos').all().map(v => ({
    p: v.placa, placa: v.placa, veh: v.placa,
    tipo: v.tipo, t: v.tipo,
    cajas: v.cajas, cap: v.cajas,
    kg: v.kg, m3: v.m3,
    conductor: v.conductor, cond: v.conductor,
    transportadora: v.transportadora, tr: v.transportadora,
    estado: v.estado, est: v.estado,
    viajes: v.viajes,
    dc: v.dc, dm: v.dm, dl: v.dl,
    desc: `${v.dc}/${v.dm}/${v.dl} días`,
    mantInicio: v.mant_inicio, mantFin: v.mant_fin,
    soatVence: v.soat_vence, tecnoVence: v.tecno_vence,
    um: v.um || '',
    origenAuto: !!v.origen_auto,
    historialMantenimiento: aJSON(v.historial_mant, []),
    historialAverias: aJSON(v.historial_averias, []),
    categoria: v.categoria || 'Viajero',
    version: v.version || 1, editadoPor: v.editado_por, editadoEn: v.editado_en
  }));

  const rutas = db.prepare('SELECT * FROM rutas').all().map(r => ({
    cod: r.cod, codigo: r.cod,
    dest: r.destino, destino: r.destino,
    diasTrans: r.dias_trans, diasDesc: r.dias_desc,
    km: r.km, tipo: r.tipo,
    dias: aJSON(r.dias, {}),
    entregaManual: aJSON(r.entrega_manual, {}),
    clientes: r.clientes || '',
    tarifa: r.tarifa,
    tarifaMakand: r.tarifa_makand,
    tarifaArsitrans: r.tarifa_arsitrans,
    tarifaArsitran: r.tarifa_arsitrans, // alias legado — varias partes del código revisan ambos nombres
    tarifaPolar: r.tarifa_polar,
    cajasMin: r.cajas_min,
    vigenteDesde: r.vigente_desde,
    activa: r.activa !== 0, // undefined/1 -> activa; solo 0 explícito es inactiva
    version: r.version || 1, editadoPor: r.editado_por, editadoEn: r.editado_en
  }));

  const conductores = db.prepare('SELECT * FROM conductores').all().map(c => ({
    ced: c.cedula, cedula: c.cedula,
    nom: c.nombre, nombre: c.nombre,
    telefono: c.telefono, tel: c.telefono,
    veh: c.placa, placa: c.placa,
    est: c.estado, estado: c.estado,
    licencia: c.licencia,
    licVence: c.licencia_vence,
    descansosPorMes: aJSON(c.descansos_por_mes, {}),
    desc: c.descripcion || '',
    obs: c.observaciones || '',
    version: c.version || 1, editadoPor: c.editado_por, editadoEn: c.editado_en
  }));

  const viajes = db.prepare('SELECT * FROM viajes').all().map(v => ({
    id: v.id,
    ruta: v.ruta, codigo: v.ruta,
    destino: v.destino, destinoReal: v.destino_real,
    cliente: v.cliente,
    p: v.placa, placa: v.placa,
    placaReal: v.placa_real, placaOriginal: v.placa_original,
    tr: v.transportadora, transportadora: v.transportadora,
    fecha: v.fecha,
    dia: v.dia, salida: v.salida ?? v.dia,
    retorno: v.retorno, retornoManual: !!v.retorno_manual,
    cajas: v.cajas,
    mes: v.mes, anio: v.anio,
    tarifa: v.tarifa,
    estado: v.estado,
    cond: v.conductor,
    hora: v.hora,
    tipo: v.tipo,
    cli: v.cli,
    cli2: v.cli2,
    cajas2: v.cajas2,
    dest2: v.dest2,
    split: !!v.split,
    splitRazon: v.split_razon,
    motivoCancelacion: v.motivo_cancelacion,
    pesoKg: v.peso_kg,
    volM3: v.vol_m3,
    prod: v.prod || 'frescos',
    manif: v.manif,
    obs: v.obs,
    horaReal: v.hora_real,
    fechaEntrega: v.fecha_entrega,
    salidaReal: v.salida_real,
    llegadaReal: v.llegada_real,
    condTemporal: v.cond_temporal,
    novedades: aJSON(v.novedades, []),
    peso: v.peso,
    volumen: v.volumen,
    manifiesto: v.manifiesto,
    costo: v.costo,
    prioridad: v.prioridad || 'Normal',
    version: v.version || 1,
    editadoPor: v.editado_por,
    editadoEn: v.editado_en
  }));

  const usuarios = db.prepare('SELECT * FROM usuarios').all().map(u => ({
    email: u.email, nombre: u.nombre, passHash: u.pass_hash,
    departamento: u.departamento, estado: u.estado, rol: u.rol,
    solicitadoEn: u.solicitado_en, actualizadoPor: u.actualizado_por,
    actualizadoEn: u.actualizado_en, motivoRechazo: u.motivo_rechazo,
    permisos: aJSON(u.permisos, null),
    conductorCed: u.conductor_ced || null
  }));

  const novedades = db.prepare('SELECT * FROM novedades').all().map(n => ({
    id: n.id, tipo: n.tipo, titulo: n.titulo,
    desc: n.descripcion, fecha: n.fecha, resuelta: !!n.resuelta,
    ...(n.foto ? { foto: true } : {})
  }));

  const armarHistorial = (tabla) => db.prepare(`SELECT * FROM ${tabla}`).all().map(h => ({
    mes: h.mes, anio: h.anio, datos: aJSON(h.datos_json, [])
  }));
  const historialvehiculos = armarHistorial('historial_vehiculos');
  const historialrutas = armarHistorial('historial_rutas');
  const historialconductores = armarHistorial('historial_conductores');

  return {
    vehiculos, rutas, conductores, viajes, usuarios, novedades,
    historialvehiculos, historialrutas, historialconductores
  };
}

function guardarEnDB(data, modo = 'real') {
  const db = conectar(modo);

  const guardarTodo = db.transaction((data) => {
    if (data.vehiculos) {
      db.prepare('DELETE FROM vehiculos').run();
      const ins = db.prepare(`INSERT INTO vehiculos
        (placa, tipo, cajas, kg, m3, conductor, transportadora, estado, viajes, dc, dm, dl, mant_inicio, mant_fin, soat_vence, tecno_vence, um, origen_auto, historial_mant, historial_averias, categoria, version, editado_por, editado_en)
        VALUES (@placa, @tipo, @cajas, @kg, @m3, @conductor, @transportadora, @estado, @viajes, @dc, @dm, @dl, @mant_inicio, @mant_fin, @soat_vence, @tecno_vence, @um, @origen_auto, @historial_mant, @historial_averias, @categoria, @version, @editado_por, @editado_en)`);
      for (const v of data.vehiculos) {
        const placa = String(v.placa || v.p || v.veh || '').toUpperCase().trim();
        ins.run({
          placa,
          tipo: v.tipo || v.t || 'Furgon refrigerado',
          cajas: Number(v.cajas || v.cap || 660),
          kg: Number(v.kg || 8000),
          m3: Number(v.m3 || 32),
          conductor: v.conductor || v.cond || 'Sin asignar',
          transportadora: v.transportadora || v.tr || 'Makand',
          estado: String(v.estado || v.est || 'Disponible').trim(),
          viajes: Number(v.viajes || 0),
          dc: Number(v.dc ?? 0), dm: Number(v.dm ?? 1), dl: Number(v.dl ?? 2),
          mant_inicio: v.mantInicio || null,
          mant_fin: v.mantFin || null,
          soat_vence: v.soatVence || null,
          tecno_vence: v.tecnoVence || null,
          um: v.um || '',
          origen_auto: v.origenAuto ? 1 : 0,
          historial_mant: JSON.stringify(v.historialMantenimiento || []),
          historial_averias: JSON.stringify(v.historialAverias || []),
          categoria: v.categoria || 'Viajero',
          version: Number(v.version) || 1,
          editado_por: v.editadoPor || null,
          editado_en: v.editadoEn || null
        });
      }
    }

    if (data.rutas) {
      db.prepare('DELETE FROM rutas').run();
      const ins = db.prepare(`INSERT INTO rutas
        (cod, destino, dias_trans, dias_desc, km, tipo, dias, entrega_manual, clientes, tarifa, tarifa_makand, tarifa_arsitrans, tarifa_polar, cajas_min, vigente_desde, activa, version, editado_por, editado_en)
        VALUES (@cod, @destino, @dias_trans, @dias_desc, @km, @tipo, @dias, @entrega_manual, @clientes, @tarifa, @tarifa_makand, @tarifa_arsitrans, @tarifa_polar, @cajas_min, @vigente_desde, @activa, @version, @editado_por, @editado_en)`);
      for (const r of data.rutas) {
        ins.run({
          cod: r.cod || r.codigo,
          destino: r.dest || r.destino || '',
          dias_trans: Number(r.diasTrans ?? 1),
          dias_desc: Number(r.diasDesc ?? 0),
          km: r.km ?? null,
          tipo: r.tipo || 'media',
          dias: JSON.stringify(r.dias || {}),
          entrega_manual: JSON.stringify(r.entregaManual || {}),
          clientes: r.clientes || '',
          tarifa: Number(r.tarifa || 0),
          tarifa_makand: Number(r.tarifaMakand || 0),
          tarifa_arsitrans: Number(r.tarifaArsitrans || r.tarifaArsitran || 0),
          tarifa_polar: Number(r.tarifaPolar || 0),
          cajas_min: Number(r.cajasMin || 100),
          vigente_desde: r.vigenteDesde || null,
          activa: (r.activa === false) ? 0 : 1,
          version: Number(r.version) || 1,
          editado_por: r.editadoPor || null,
          editado_en: r.editadoEn || null
        });
      }
    }

    if (data.conductores) {
      db.prepare('DELETE FROM conductores').run();
      const ins = db.prepare(`INSERT INTO conductores
        (cedula, nombre, telefono, placa, estado, licencia, licencia_vence, descansos_por_mes, descripcion, observaciones, version, editado_por, editado_en)
        VALUES (@cedula, @nombre, @telefono, @placa, @estado, @licencia, @licencia_vence, @descansos_por_mes, @descripcion, @observaciones, @version, @editado_por, @editado_en)`);
      for (const c of data.conductores) {
        ins.run({
          cedula: String(c.ced || c.cedula || '').trim(),
          nombre: c.nom || c.nombre || '',
          telefono: c.telefono || c.tel || null,
          placa: c.veh || c.placa || null,
          estado: c.est || c.estado || 'Activo',
          licencia: c.licencia || null,
          licencia_vence: c.licVence || null,
          descansos_por_mes: JSON.stringify(c.descansosPorMes || {}),
          descripcion: c.desc || '',
          observaciones: c.obs || '',
          version: Number(c.version) || 1,
          editado_por: c.editadoPor || null,
          editado_en: c.editadoEn || null
        });
      }
    }

    if (data.viajes) {
      db.prepare('DELETE FROM viajes').run();
      const ins = db.prepare(`INSERT INTO viajes
        (id, ruta, destino, destino_real, cliente, placa, placa_real, placa_original, transportadora, fecha, dia, salida, retorno, retorno_manual, cajas, mes, anio, tarifa, estado, conductor, hora, tipo, cli, cli2, cajas2, dest2, split, split_razon, motivo_cancelacion, peso_kg, vol_m3, prod, manif, obs, hora_real, fecha_entrega, salida_real, llegada_real, cond_temporal, novedades, peso, volumen, manifiesto, costo, prioridad, version, editado_por, editado_en)
        VALUES (@id, @ruta, @destino, @destino_real, @cliente, @placa, @placa_real, @placa_original, @transportadora, @fecha, @dia, @salida, @retorno, @retorno_manual, @cajas, @mes, @anio, @tarifa, @estado, @conductor, @hora, @tipo, @cli, @cli2, @cajas2, @dest2, @split, @split_razon, @motivo_cancelacion, @peso_kg, @vol_m3, @prod, @manif, @obs, @hora_real, @fecha_entrega, @salida_real, @llegada_real, @cond_temporal, @novedades, @peso, @volumen, @manifiesto, @costo, @prioridad, @version, @editado_por, @editado_en)`);
      for (const v of data.viajes) {
        ins.run({
          id: String(v.id),
          ruta: v.ruta || v.codigo || '',
          destino: v.destino || null,
          destino_real: v.destinoReal || null,
          cliente: v.cliente || null,
          placa: v.p || v.placa || '',
          placa_real: v.placaReal || null,
          placa_original: v.placaOriginal || null,
          transportadora: v.tr || v.transportadora || 'Makand',
          fecha: v.fecha || '',
          dia: Number(v.dia ?? v.salida ?? 0),
          salida: v.salida != null ? Number(v.salida) : null,
          retorno: v.retorno != null ? Number(v.retorno) : null,
          retorno_manual: v.retornoManual ? 1 : 0,
          cajas: v.cajas != null ? Number(v.cajas) : null,
          mes: v.mes || '',
          anio: Number(v.anio || 0),
          tarifa: v.tarifa != null ? Number(v.tarifa) : null,
          estado: v.estado || 'Programado',
          conductor: v.cond || null,
          hora: v.hora || null,
          tipo: v.tipo || null,
          cli: v.cli || null,
          cli2: v.cli2 || null,
          cajas2: v.cajas2 != null ? Number(v.cajas2) : null,
          dest2: v.dest2 || null,
          split: v.split ? 1 : 0,
          split_razon: v.splitRazon || null,
          motivo_cancelacion: v.motivoCancelacion || null,
          peso_kg: v.pesoKg != null ? Number(v.pesoKg) : null,
          vol_m3: v.volM3 != null ? Number(v.volM3) : null,
          prod: v.prod || 'frescos',
          manif: v.manif || null,
          obs: v.obs || null,
          hora_real: v.horaReal || null,
          fecha_entrega: v.fechaEntrega || null,
          salida_real: v.salidaReal || null,
          llegada_real: v.llegadaReal || null,
          cond_temporal: v.condTemporal || null,
          novedades: JSON.stringify(v.novedades || []),
          peso: v.peso != null ? Number(v.peso) : null,
          volumen: v.volumen != null ? Number(v.volumen) : null,
          manifiesto: v.manifiesto || null,
          costo: v.costo != null ? Number(v.costo) : null,
          prioridad: v.prioridad || 'Normal',
          version: Number(v.version) || 1,
          editado_por: v.editadoPor || null,
          editado_en: v.editadoEn || null
        });
      }
    }

    if (data.usuarios) {
      db.prepare('DELETE FROM usuarios').run();
      const ins = db.prepare(`INSERT INTO usuarios
        (email, nombre, pass_hash, departamento, estado, rol, solicitado_en, actualizado_por, actualizado_en, motivo_rechazo, permisos, conductor_ced)
        VALUES (@email, @nombre, @pass_hash, @departamento, @estado, @rol, @solicitado_en, @actualizado_por, @actualizado_en, @motivo_rechazo, @permisos, @conductor_ced)`);
      for (const u of data.usuarios) {
        ins.run({
          email: String(u.email || '').toLowerCase().trim(),
          nombre: u.nombre || '',
          pass_hash: u.passHash || '',
          departamento: u.departamento || null,
          estado: u.estado || 'PENDING',
          rol: u.rol || 'editor',
          solicitado_en: u.solicitadoEn || null,
          actualizado_por: u.actualizadoPor || null,
          actualizado_en: u.actualizadoEn || null,
          motivo_rechazo: u.motivoRechazo || null,
          permisos: u.permisos && typeof u.permisos === 'object' ? JSON.stringify(u.permisos) : null,
          conductor_ced: u.conductorCed || null
        });
      }
    }

    if (data.novedades) {
      db.prepare('DELETE FROM novedades').run();
      const ins = db.prepare(`INSERT INTO novedades
        (id, tipo, titulo, descripcion, fecha, resuelta, foto)
        VALUES (@id, @tipo, @titulo, @descripcion, @fecha, @resuelta, @foto)`);
      for (const n of data.novedades) {
        ins.run({
          id: String(n.id),
          tipo: n.tipo || 'Aviso',
          titulo: n.titulo || '',
          descripcion: n.desc || '',
          fecha: n.fecha || null,
          resuelta: n.resuelta ? 1 : 0,
          foto: n.foto ? 1 : 0
        });
      }
    }

    const guardarHistorial = (tabla, lista) => {
      if (!lista) return;
      db.prepare(`DELETE FROM ${tabla}`).run();
      const ins = db.prepare(`INSERT INTO ${tabla} (mes, anio, datos_json) VALUES (@mes, @anio, @datos_json)`);
      for (const h of lista) {
        ins.run({
          mes: h.mes != null ? String(h.mes) : null,
          anio: h.anio != null && !isNaN(Number(h.anio)) ? Number(h.anio) : null,
          datos_json: JSON.stringify(h.datos || [])
        });
      }
    };
    guardarHistorial('historial_vehiculos', data.historialvehiculos);
    guardarHistorial('historial_rutas', data.historialrutas);
    guardarHistorial('historial_conductores', data.historialconductores);
  });

  guardarTodo(data);
}

const CARPETA_RESPALDOS = path.join(CARPETA_DATOS, 'respaldos');
if (!fs.existsSync(CARPETA_RESPALDOS)) fs.mkdirSync(CARPETA_RESPALDOS, { recursive: true });

// ------------------------------------------------------------
// AUDITORÍA — a diferencia de vehiculos/rutas/etc. (que se guardan como
// una "foto" completa cada vez, borra-y-reinserta), la auditoría es un
// LOG que solo CRECE — nunca se reemplaza entero. Por eso tiene sus
// propias funciones en vez de pasar por leerDB()/guardarEnDB().
//
// Se guarda SIEMPRE en la base REAL, sin importar en qué modo (Real o
// Prueba) se hizo la acción que se está registrando — igual que antes
// auditoria.jsonl era UN SOLO archivo compartido entre ambos modos. El
// campo "modo" de cada fila es la etiqueta que distingue de cuál se
// trató (la insignia de color que ya pinta admin.ts), no una base de
// datos aparte.
// ------------------------------------------------------------
function registrarAuditoriaDB(modo, entrada) {
  const db = conectar('real');
  db.prepare(`INSERT INTO auditoria (fecha, usuario, metodo, ruta, modo, resumen)
    VALUES (@fecha, @usuario, @metodo, @ruta, @modo, @resumen)`).run({
    fecha: entrada.fecha,
    usuario: entrada.usuario || 'desconocido',
    metodo: entrada.metodo || '',
    ruta: entrada.ruta || '',
    modo: modo || entrada.modo || 'real',
    resumen: JSON.stringify(entrada.resumen || {})
  });
}

function listarAuditoriaDB(limite = 200) {
  const db = conectar('real');
  const filas = db.prepare(
    `SELECT fecha, usuario, metodo, ruta, modo, resumen FROM auditoria ORDER BY fecha DESC LIMIT ?`
  ).all(Math.min(Number(limite) || 200, 1000));
  return filas.map(f => ({
    fecha: f.fecha,
    usuario: f.usuario,
    metodo: f.metodo,
    ruta: f.ruta,
    modo: f.modo,
    resumen: aJSON(f.resumen, {})
  }));
}

/** Eventos de auditoría de UN viaje (guardados, eliminación), del más viejo al más nuevo. */
function listarAuditoriaViajeDB(idViaje, modo = 'real') {
  const db = conectar('real');
  const filas = db.prepare(
    `SELECT fecha, usuario, metodo, ruta, modo, resumen FROM auditoria
      WHERE ruta IN ('/api/viajes', '/api/viajes/eliminar')
        AND modo = ?
        AND CAST(json_extract(resumen, '$.id') AS TEXT) = ?
      ORDER BY fecha ASC LIMIT 300`
  ).all(modo, String(idViaje));
  return filas.map(f => ({ fecha: f.fecha, usuario: f.usuario, ruta: f.ruta, resumen: aJSON(f.resumen, {}) }));
}

// Migración ÚNICA del auditoria.jsonl viejo — se corre una vez al
// arrancar el servidor. Si la tabla ya tiene registros (ya se importó
// antes, o ya hay actividad nueva desde que se instaló esto), no hace
// nada — así no se duplica en cada reinicio.
function importarAuditoriaJSONLSiHaceFalta(rutaJsonl) {
  const db = conectar('real');
  const yaHayRegistros = db.prepare('SELECT COUNT(*) AS n FROM auditoria').get().n > 0;
  if (yaHayRegistros) return 0;
  if (!fs.existsSync(rutaJsonl)) return 0;

  const lineas = fs.readFileSync(rutaJsonl, 'utf8').split('\n').filter(l => l.trim().length > 0);
  if (!lineas.length) return 0;

  const ins = db.prepare(`INSERT INTO auditoria (fecha, usuario, metodo, ruta, modo, resumen)
    VALUES (@fecha, @usuario, @metodo, @ruta, @modo, @resumen)`);
  const importarTodo = db.transaction((lineas) => {
    for (const linea of lineas) {
      try {
        const e = JSON.parse(linea);
        ins.run({
          fecha: e.fecha || new Date().toISOString(),
          usuario: e.usuario || 'desconocido',
          metodo: e.metodo || '',
          ruta: e.ruta || '',
          modo: e.modo || 'real',
          resumen: JSON.stringify(e.resumen || {})
        });
      } catch {
        // Línea corrupta — se ignora, igual que ya hacía el GET viejo
        // con cada línea del jsonl al parsearla.
      }
    }
  });
  importarTodo(lineas);
  console.log(`📋 Auditoría: se importaron ${lineas.length} eventos históricos desde auditoria.jsonl a SQLite.`);
  return lineas.length;
}

// ------------------------------------------------------------
// RESPALDOS — se usa la API nativa de backup de better-sqlite3 en vez
// de copiar el archivo .db a mano: con journal_mode=WAL, el archivo
// principal puede no tener todavía los cambios más recientes (viven
// en un archivo -wal aparte hasta que se "checkpointea") — copiar solo
// el .db a mano podría dejar un respaldo incompleto. db.backup() sí
// hace esto correctamente, tomando una foto consistente de verdad.
// ------------------------------------------------------------
async function crearRespaldoDB(modo = 'real', etiqueta = '') {
  const db = conectar(modo);
  const marcaTiempo = new Date().toISOString().replace(/[:.]/g, '-');
  const prefijo = modo === 'pruebas' ? 'rutograma_pruebas' : 'rutograma';
  const sufijoEtiqueta = etiqueta ? `_${etiqueta}` : '';
  const rutaDestino = path.join(CARPETA_RESPALDOS, `${prefijo}_${marcaTiempo}${sufijoEtiqueta}.db`);
  await db.backup(rutaDestino);
  limpiarRespaldosDB(modo);
  return rutaDestino;
}

// Borra los respaldos que sobran según la regla de limpieza-respaldos.js
// (sin esto se acumulaban gigas: una copia completa por cada guardado).
function limpiarRespaldosDB(modo = 'real') {
  try {
    const lista = listarRespaldosDB(modo).map(r => ({ nombre: r.nombre, ms: new Date(r.fecha).getTime() }));
    const borrar = respaldosParaBorrar(lista);
    for (const nombre of borrar) {
      try { fs.unlinkSync(path.join(CARPETA_RESPALDOS, nombre)); } catch { /* ya no estaba */ }
    }
    if (borrar.length) console.log(`🧹 Respaldos (${modo}): se borraron ${borrar.length} que sobraban; quedan ${lista.length - borrar.length}.`);
    return borrar.length;
  } catch (err) {
    console.error('⚠️ No se pudieron limpiar los respaldos viejos:', err.message);
    return 0;
  }
}

function listarRespaldosDB(modo = 'real') {
  const prefijo = modo === 'pruebas' ? 'rutograma_pruebas_' : 'rutograma_';
  const prefijoAExcluir = modo === 'pruebas' ? null : 'rutograma_pruebas_';
  return fs.readdirSync(CARPETA_RESPALDOS)
    .filter(f => f.startsWith(prefijo) && (!prefijoAExcluir || !f.startsWith(prefijoAExcluir)) && f.endsWith('.db'))
    .map(nombre => ({ nombre, fecha: fs.statSync(path.join(CARPETA_RESPALDOS, nombre)).mtime }))
    .sort((a, b) => b.fecha - a.fecha);
}

function restaurarRespaldoDB(nombreArchivo, modo = 'real') {
  const rutaRespaldo = path.join(CARPETA_RESPALDOS, nombreArchivo);
  if (!fs.existsSync(rutaRespaldo)) throw new Error('Ese respaldo ya no existe.');

  // Se cierra la conexión activa antes de reemplazar el archivo — no
  // se puede sobreescribir un .db mientras better-sqlite3 lo tiene
  // abierto.
  if (conexiones[modo]) {
    conexiones[modo].close();
    delete conexiones[modo];
  }
  const rutaActual = modo === 'pruebas' ? RUTA_DB_PRUEBAS : RUTA_DB_REAL;
  fs.copyFileSync(rutaRespaldo, rutaActual);
  // Se limpian los archivos -wal/-shm viejos si quedaron de la sesión
  // anterior — si no, SQLite podría "reaplicar" cambios que ya no
  // corresponden al respaldo que se acaba de restaurar.
  [`${rutaActual}-wal`, `${rutaActual}-shm`].forEach(f => {
    if (fs.existsSync(f)) fs.unlinkSync(f);
  });
  conectar(modo); // reabre con el archivo restaurado
}

// ============================================================
// HISTÓRICO DE MESES CERRADOS (pantalla Histórico). Cerrar otra vez el
// mismo mes reemplaza la foto anterior.
// ============================================================
function listarHistoricoMesesDB(modo = 'real') {
  const db = conectar(modo);
  return db.prepare('SELECT * FROM historico_meses ORDER BY anio, mes').all().map(f => ({
    ...aJSON(f.datos_json, {}),
    mes: f.mes, anio: f.anio, cerradoPor: f.cerrado_por, cerradoEn: f.cerrado_en
  }));
}

function guardarHistoricoMesDB(modo, registro) {
  const db = conectar(modo);
  db.prepare(`INSERT OR REPLACE INTO historico_meses (anio, mes, datos_json, cerrado_por, cerrado_en)
    VALUES (@anio, @mes, @datos_json, @cerrado_por, @cerrado_en)`).run({
    anio: registro.anio,
    mes: registro.mes,
    datos_json: JSON.stringify(registro.datos || {}),
    cerrado_por: registro.cerradoPor || null,
    cerrado_en: registro.cerradoEn || new Date().toISOString()
  });
}

function limpiarHistoricoMesesDB(modo = 'real') {
  return conectar(modo).prepare('DELETE FROM historico_meses').run().changes;
}

// ============================================================
// CONFIGURACIÓN COMPARTIDA (transportadoras, cupos de Configuración,
// festivos) — antes se guardaba solo en el navegador de cada equipo.
// ============================================================
function leerConfigCompartidaDB(modo = 'real') {
  const filas = conectar(modo).prepare('SELECT clave, valor_json FROM configuracion_compartida').all();
  const config = {};
  filas.forEach(f => { config[f.clave] = aJSON(f.valor_json, null); });
  return config;
}

function guardarConfigCompartidaDB(modo, clave, valor, editadoPor) {
  conectar(modo).prepare(`INSERT OR REPLACE INTO configuracion_compartida (clave, valor_json, editado_por, editado_en)
    VALUES (?, ?, ?, ?)`).run(clave, JSON.stringify(valor), editadoPor || null, new Date().toISOString());
}

// ============================================================
// DESPACHOS (pantalla Despachos, ver ../despachos.js): una fila por
// vehículo que llegó a cargar. Se consulta por rango de fechas.
// ============================================================
const filaADespacho = (f) => ({
  id: f.id, fecha: f.fecha, placa: f.placa, viajeId: f.viaje_id, ruta: f.ruta || '', conductor: f.conductor || '',
  destino: f.destino, horaLlegada: f.hora_llegada, horaFinCargue: f.hora_fin_cargue || '', observacion: f.observacion || '',
  creadoPor: f.creado_por || '', creadoEn: f.creado_en || '', editadoPor: f.editado_por || '', editadoEn: f.editado_en || ''
});

function listarDespachosDB(modo, desde, hasta) {
  return conectar(modo).prepare('SELECT * FROM despachos WHERE fecha BETWEEN ? AND ? ORDER BY fecha DESC, hora_llegada DESC, id DESC')
    .all(desde, hasta).map(filaADespacho);
}

function leerDespachoDB(modo, id) {
  const f = conectar(modo).prepare('SELECT * FROM despachos WHERE id = ?').get(id);
  return f ? filaADespacho(f) : null;
}

/** Crea (sin id) o corrige (con id) un registro. Devuelve el registro guardado. */
function guardarDespachoDB(modo, r, usuario) {
  const db = conectar(modo);
  const ahora = new Date().toISOString();
  const valores = {
    fecha: r.fecha, placa: r.placa, viaje_id: r.viajeId ?? null, ruta: r.ruta || '', conductor: r.conductor || '',
    destino: r.destino, hora_llegada: r.horaLlegada, hora_fin_cargue: r.horaFinCargue || '', observacion: r.observacion || ''
  };
  if (r.id) {
    db.prepare(`UPDATE despachos SET fecha=@fecha, placa=@placa, viaje_id=@viaje_id, ruta=@ruta, conductor=@conductor, destino=@destino,
      hora_llegada=@hora_llegada, hora_fin_cargue=@hora_fin_cargue, observacion=@observacion, editado_por=@usuario, editado_en=@ahora WHERE id=@id`)
      .run({ ...valores, usuario, ahora, id: r.id });
    return leerDespachoDB(modo, r.id);
  }
  const info = db.prepare(`INSERT INTO despachos (fecha, placa, viaje_id, ruta, conductor, destino, hora_llegada, hora_fin_cargue, observacion, creado_por, creado_en)
    VALUES (@fecha, @placa, @viaje_id, @ruta, @conductor, @destino, @hora_llegada, @hora_fin_cargue, @observacion, @usuario, @ahora)`)
    .run({ ...valores, usuario, ahora });
  return leerDespachoDB(modo, Number(info.lastInsertRowid));
}

function eliminarDespachoDB(modo, id) {
  return conectar(modo).prepare('DELETE FROM despachos WHERE id = ?').run(id).changes;
}

/** Meses con registros (para el histórico): [{ mes: 'AAAA-MM', total }], el más reciente primero. */
function mesesDespachosDB(modo) {
  return conectar(modo).prepare("SELECT substr(fecha, 1, 7) AS mes, COUNT(*) AS total FROM despachos GROUP BY mes ORDER BY mes DESC").all();
}

module.exports = {
  listarDespachosDB, leerDespachoDB, guardarDespachoDB, eliminarDespachoDB, mesesDespachosDB,
  leerConfigCompartidaDB, guardarConfigCompartidaDB,
  listarHistoricoMesesDB, guardarHistoricoMesDB, limpiarHistoricoMesesDB,
  leerDB, guardarEnDB, conectar, crearRespaldoDB, listarRespaldosDB, restaurarRespaldoDB, limpiarRespaldosDB,
  registrarAuditoriaDB, listarAuditoriaDB, listarAuditoriaViajeDB, importarAuditoriaJSONLSiHaceFalta
};