-- ============================================================
-- ESQUEMA SQLite para Rutograma Makand
-- ============================================================
-- Los campos que en el Excel eran objetos anidados (dias,
-- descansosPorMes, historialMantenimiento, etc.) se guardan aquí
-- IGUAL que en el Excel: como texto JSON — el código del servidor
-- los convierte a objeto real al leer y a texto al guardar, EXACTO
-- como ya hace ahora con el Excel. Esto evita tener que reescribir
-- toda la lógica de negocio que ya funciona.

CREATE TABLE IF NOT EXISTS vehiculos (
  placa               TEXT PRIMARY KEY,
  tipo                TEXT NOT NULL DEFAULT 'Furgon refrigerado',
  cajas               INTEGER NOT NULL DEFAULT 660,
  kg                  INTEGER NOT NULL DEFAULT 8000,
  m3                  INTEGER NOT NULL DEFAULT 32,
  conductor           TEXT NOT NULL DEFAULT 'Sin asignar',
  transportadora      TEXT NOT NULL DEFAULT 'Makand',
  estado              TEXT NOT NULL DEFAULT 'Disponible',
  viajes              INTEGER NOT NULL DEFAULT 0,
  dc                  INTEGER NOT NULL DEFAULT 0,
  dm                  INTEGER NOT NULL DEFAULT 1,
  dl                  INTEGER NOT NULL DEFAULT 2,
  mant_inicio         TEXT,
  soat_vence          TEXT,
  tecno_vence         TEXT,
  mant_fin            TEXT,
  um                  TEXT DEFAULT '',
  origen_auto         INTEGER NOT NULL DEFAULT 0,
  historial_mant      TEXT NOT NULL DEFAULT '[]',
  historial_averias   TEXT NOT NULL DEFAULT '[]',
  categoria           TEXT DEFAULT 'Viajero',
  -- Control de versiones (evita que dos personas se pisen los cambios):
  version             INTEGER NOT NULL DEFAULT 1,
  editado_por         TEXT,
  editado_en          TEXT
);

CREATE TABLE IF NOT EXISTS rutas (
  cod                 TEXT PRIMARY KEY,
  destino             TEXT NOT NULL,
  dias_trans          INTEGER NOT NULL DEFAULT 1,
  dias_desc           INTEGER NOT NULL DEFAULT 0,
  km                  INTEGER,
  tipo                TEXT DEFAULT 'media',
  dias                TEXT NOT NULL DEFAULT '{}',
  entrega_manual      TEXT NOT NULL DEFAULT '{}',
  clientes            TEXT DEFAULT '',
  tarifa              REAL DEFAULT 0,
  tarifa_makand       REAL DEFAULT 0,
  tarifa_arsitrans    REAL DEFAULT 0,
  tarifa_polar        REAL DEFAULT 0,
  cajas_min           INTEGER DEFAULT 100,
  vigente_desde       TEXT,
  activa              INTEGER NOT NULL DEFAULT 1,
  -- Control de versiones (evita que dos personas se pisen los cambios):
  version             INTEGER NOT NULL DEFAULT 1,
  editado_por         TEXT,
  editado_en          TEXT
);

CREATE TABLE IF NOT EXISTS conductores (
  cedula              TEXT PRIMARY KEY,
  nombre              TEXT NOT NULL,
  telefono            TEXT,
  placa               TEXT,
  estado              TEXT NOT NULL DEFAULT 'Activo',
  licencia            TEXT,
  licencia_vence      TEXT,
  descansos_por_mes   TEXT NOT NULL DEFAULT '{}',
  descripcion         TEXT DEFAULT '',
  observaciones       TEXT DEFAULT '',
  -- Control de versiones (evita que dos personas se pisen los cambios):
  version             INTEGER NOT NULL DEFAULT 1,
  editado_por         TEXT,
  editado_en          TEXT
);

CREATE TABLE IF NOT EXISTS viajes (
  id                  TEXT PRIMARY KEY,
  ruta                TEXT NOT NULL,
  destino             TEXT,
  destino_real        TEXT,
  cliente             TEXT,
  placa               TEXT NOT NULL,
  placa_real          TEXT,
  placa_original      TEXT,
  transportadora      TEXT NOT NULL DEFAULT 'Makand',
  fecha               TEXT NOT NULL,
  dia                 INTEGER NOT NULL,
  salida              INTEGER,
  retorno             INTEGER,
  retorno_manual      INTEGER NOT NULL DEFAULT 0,
  cajas               INTEGER,
  mes                 TEXT NOT NULL,
  anio                INTEGER NOT NULL,
  tarifa              REAL,
  estado              TEXT NOT NULL DEFAULT 'Programado',
  conductor           TEXT,
  hora                TEXT,
  tipo                TEXT,
  cli                 TEXT,
  cli2                TEXT,
  cajas2              INTEGER,
  dest2               TEXT,
  split               INTEGER NOT NULL DEFAULT 0,
  split_razon         TEXT,
  motivo_cancelacion  TEXT,
  peso_kg             REAL,
  vol_m3              REAL,
  prod                TEXT DEFAULT 'frescos',
  manif               TEXT,
  obs                 TEXT,
  hora_real           TEXT,
  fecha_entrega       TEXT,
  salida_real         TEXT,
  llegada_real        TEXT,
  cond_temporal       TEXT,
  novedades           TEXT NOT NULL DEFAULT '[]',
  peso                REAL,
  volumen             REAL,
  manifiesto          TEXT,
  costo               REAL,
  prioridad           TEXT DEFAULT 'Normal',
  -- Control de versiones (evita que dos personas se pisen los cambios):
  version             INTEGER NOT NULL DEFAULT 1,
  editado_por         TEXT,
  editado_en          TEXT
);
-- Los índices más usados en las consultas reales de la app —
-- buscar por mes/año (el más frecuente) y por placa+día (conflictos).
CREATE INDEX IF NOT EXISTS idx_viajes_mes_anio ON viajes(mes, anio);
CREATE INDEX IF NOT EXISTS idx_viajes_placa_dia ON viajes(placa, dia);
CREATE INDEX IF NOT EXISTS idx_viajes_estado ON viajes(estado);

CREATE TABLE IF NOT EXISTS usuarios (
  email               TEXT PRIMARY KEY,
  nombre              TEXT NOT NULL,
  pass_hash           TEXT NOT NULL,
  departamento        TEXT,
  estado              TEXT NOT NULL DEFAULT 'PENDING',
  rol                 TEXT NOT NULL DEFAULT 'editor',
  solicitado_en       TEXT,
  actualizado_por     TEXT,
  actualizado_en      TEXT,
  motivo_rechazo      TEXT,
  permisos            TEXT,  -- JSON con permisos personalizados; NULL = los de su rol
  conductor_ced       TEXT,  -- rol conductor: cédula del conductor enlazado
  preferencias        TEXT   -- apariencia de la cuenta (JSON { tema, letra })
);

CREATE TABLE IF NOT EXISTS auditoria (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  fecha               TEXT NOT NULL,
  usuario             TEXT,
  metodo              TEXT,
  ruta                TEXT,
  modo                TEXT NOT NULL DEFAULT 'real',
  resumen             TEXT
);
CREATE INDEX IF NOT EXISTS idx_auditoria_fecha ON auditoria(fecha DESC);

CREATE TABLE IF NOT EXISTS novedades (
  id                  TEXT PRIMARY KEY,
  tipo                TEXT NOT NULL DEFAULT 'Aviso',
  titulo              TEXT NOT NULL,
  descripcion         TEXT,
  fecha               TEXT,
  resuelta            INTEGER NOT NULL DEFAULT 0
);

-- Cada una de estas 3 tablas guarda una "foto" completa del arreglo
-- correspondiente (vehiculos/rutas/conductores), una fila por mes
-- cerrado — igual que ya hacia el Excel (dataJSON = el arreglo
-- completo de ese mes, como texto JSON).
CREATE TABLE IF NOT EXISTS historial_vehiculos (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  mes                 TEXT,
  anio                INTEGER,
  datos_json          TEXT NOT NULL DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS historial_rutas (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  mes                 TEXT,
  anio                INTEGER,
  datos_json          TEXT NOT NULL DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS historial_conductores (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  mes                 TEXT,
  anio                INTEGER,
  datos_json          TEXT NOT NULL DEFAULT '[]'
);
-- Meses cerrados desde la pantalla Histórico (una fila por mes/año).
CREATE TABLE IF NOT EXISTS historico_meses (
  anio                INTEGER NOT NULL,
  mes                 INTEGER NOT NULL,   -- 0 = enero (como Date.getMonth)
  datos_json          TEXT NOT NULL,      -- el resumen completo del mes
  cerrado_por         TEXT,
  cerrado_en          TEXT,
  PRIMARY KEY (anio, mes)
);

-- Configuración que antes vivía solo en el navegador de cada equipo
-- (transportadoras, cupos de Configuración, festivos): ahora la comparten
-- todos los equipos. Una fila por clave, con su valor en JSON.
CREATE TABLE IF NOT EXISTS configuracion_compartida (
  clave               TEXT PRIMARY KEY,
  valor_json          TEXT NOT NULL,
  editado_por         TEXT,
  editado_en          TEXT
);

-- Despachos: a qué hora llega cada vehículo a cargar, a dónde va y a qué
-- hora terminó de cargar (pantalla Despachos, ver despachos.js).
CREATE TABLE IF NOT EXISTS despachos (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  fecha               TEXT NOT NULL,      -- AAAA-MM-DD, día en que llegó
  placa               TEXT NOT NULL,
  viaje_id            TEXT,               -- el viaje escogido (si se escogió uno)
  ruta                TEXT DEFAULT '',
  conductor           TEXT DEFAULT '',
  destino             TEXT NOT NULL,
  hora_llegada        TEXT NOT NULL,      -- HH:MM
  hora_fin_cargue     TEXT DEFAULT '',    -- HH:MM; vacío = sigue cargando
  observacion         TEXT DEFAULT '',
  despachador         TEXT DEFAULT '',    -- nombre de quien despacha
  hora_programada     TEXT DEFAULT '',
  hora_inicio_cargue  TEXT DEFAULT '',
  hora_salida         TEXT DEFAULT '',
  cargas_json         TEXT DEFAULT '[]',  -- [{ tipo, cantidad }]
  motivo_demora       TEXT DEFAULT '',    -- si el cargue pasó del límite
  motivo_demora_detalle TEXT DEFAULT '',
  cliente_id          TEXT,               -- lo pone el celular: evita duplicados al reenviar
  creado_por          TEXT,
  creado_en           TEXT,
  editado_por         TEXT,
  editado_en          TEXT
);
CREATE INDEX IF NOT EXISTS idx_despachos_fecha ON despachos (fecha);

-- Papelera: lo eliminado queda 30 días y se puede recuperar (ver papelera.js).
CREATE TABLE IF NOT EXISTS papelera (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo                TEXT NOT NULL,      -- viaje, vehiculo, ruta, conductor, novedad, despacho
  clave               TEXT NOT NULL,
  etiqueta            TEXT DEFAULT '',
  datos_json          TEXT NOT NULL,
  eliminado_por       TEXT,
  eliminado_en        TEXT NOT NULL,
  restaurado_por      TEXT,
  restaurado_en       TEXT
);
CREATE INDEX IF NOT EXISTS idx_papelera_fecha ON papelera (eliminado_en);
