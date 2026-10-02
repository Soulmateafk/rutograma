/**
 * rutograma.utils.js - VERSIÓN FINAL INTEGRADA Y COMPLETA
 */

// 1. REGLA MAESTRA DE ASIGNACIONES (Filtro por Vehículo)
export const ASIGNACIONES_VEHICULOS = {
  'LUN428': ['barranquilla', 'montería'],
  'LUN429': ['cali', 'ibagué', 'eje cafetero'],
  'PRZ064': ['medellín', 'guarne', 'la estrella', 'girardota'],
  'PRZ065': ['eje cafetero', 'medellín', 'ibagué', 'cali'],
  'PRZ067': ['bogotá', 'girardota', 'guarne', 'la estrella'],
  'NUX577': ['medellín', 'ibagué', 'eje cafetero', 'cali'],
  'NUX579': ['cali', 'ibagué', 'eje cafetero'],
  'NUX580': ['medellín', 'eje cafetero', 'montería', 'cali', 'ibagué'],
  'NHR632': ['medellín', 'girardota', 'cali'],
  'NOW031': ['medellín', 'girardota', 'montería', 'cali', 'cartagena', 'ibagué'],
  'NOW033': ['medellín', 'guarne', 'valledupar', 'barranquilla', 'cali', 'montería', 'eje cafetero'],
  'QJZ764': ['cali', 'cartagena', 'montería'],
  'QJZ765': ['valledupar', 'barranquilla']
};

// Quita tildes/acentos y pasa a minúsculas (lo usa buscarRutaEnExcel), para que "Monteria" y "montería" se reconozcan como lo mismo.
function norm(str) {
  return String(str || '')
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

// 2. BUSCADOR INTELIGENTE EN TU EXCEL
function buscarRutaEnExcel(vj, S) {
  if (!S?.rutas || !Array.isArray(S.rutas)) return null;

  const rTarget = String(vj.ruta || '').toUpperCase().trim();
  const dTarget = String(vj.destino || vj.dest || '').toLowerCase().trim();

  // Paso 1: código exacto
  if (rTarget) {
    const porCodigo = S.rutas.find(
      r => String(r.cod || '').toUpperCase().trim() === rTarget
    );

    if (porCodigo) return porCodigo;
  }

  // Paso 2: destino exacto
  if (dTarget) {
    const porDestinoExacto = S.rutas.find(
      r => norm(String(r.dest || r.nombre || '')) === norm(dTarget)
    );

    if (porDestinoExacto) return porDestinoExacto;
  }

  // Paso 3: código parecido
  if (rTarget) {
    const porCodigoDifuso = S.rutas.find(r => {
      const c = norm(String(r.cod || ''));

      return c && (
        c.includes(norm(rTarget)) ||
        norm(rTarget).includes(c)
      );
    });

    if (porCodigoDifuso) return porCodigoDifuso;
  }

  // Paso 4: destino parecido
  if (dTarget) {
    const porDestinoDifuso = S.rutas.find(r => {
      const d = norm(String(r.dest || r.nombre || ''));

      return d && (
        d.includes(norm(dTarget)) ||
        norm(dTarget).includes(d)
      );
    });

    if (porDestinoDifuso) return porDestinoDifuso;
  }

  return null;
}

// 4. LÓGICA DE TIEMPOS DINÁMICA
export function descViaje(vj, S) {
  if (
    vj.diasDesc !== undefined &&
    vj.diasDesc !== null &&
    vj.diasDesc !== ''
  ) {
    return Number(vj.diasDesc);
  }

  const r = buscarRutaEnExcel(vj, S);

  if (r && r.diasDesc !== undefined) {
    return Number(r.diasDesc);
  }

  return 1;
}

export function obtenerDiasViaje(vj, S) {
  if (
    vj.retorno &&
    vj.salida &&
    !isNaN(Number(vj.retorno)) &&
    !isNaN(Number(vj.salida))
  ) {
    const diasCalculados =
      Number(vj.retorno) -
      Number(vj.salida) +
      1;

    return diasCalculados > 0
      ? diasCalculados
      : 1;
  }

  const r = buscarRutaEnExcel(vj, S);

  return (
    r &&
    r.diasTrans !== undefined
  )
    ? Number(r.diasTrans) + 2
    : 3;
}

const NOMBRES_MESES_CONFLICTO = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre'
];

// Reconstruye la fecha REAL de un viaje.
function fechaRealDeViaje(v, S) {
  if (v.fecha) {
    const f = new Date(v.fecha + 'T00:00:00');

    if (!isNaN(f.getTime())) {
      return f;
    }
  }

  const anio =
    (v.anio !== undefined && v.anio !== null)
      ? Number(v.anio)
      : Number(S?.anio);

  let mesIdx = Number(S?.mes);

  if (v.mes) {
    const idx = NOMBRES_MESES_CONFLICTO.findIndex(
      m =>
        m.toLowerCase() ===
        String(v.mes).toLowerCase()
    );

    if (idx !== -1) {
      mesIdx = idx;
    }
  }

  return new Date(
    anio,
    mesIdx,
    Number(v.salida ?? v.dia ?? 1)
  );
}

// 5. VALIDACIÓN DE CONFLICTOS / SUPERPOSICIONES
function esTransportadoraTercero(v) {
  const tr = String(
    v?.tr ||
    v?.transportadora ||
    ''
  )
    .toLowerCase()
    .trim();

  return (
    tr.includes('arsitran') ||
    tr.includes('polar')
  );
}

function chocaConViajeExistente(
  v,
  fechaNewStart,
  fechaNewEnd,
  S
) {
  // BUG REAL encontrado con un caso concreto: un viaje CANCELADO (por
  // ejemplo, por mantenimiento del vehículo — ver "no arrancado aún ->
  // Cancelado") seguía bloqueando asignaciones nuevas en ese mismo
  // rango de días, como si siguiera activo. Un viaje cancelado nunca
  // ocupó de verdad el vehículo — no debe contar como conflicto.
  if (String(v.estado || '').toLowerCase() === 'cancelado') {
    return false;
  }

  const fechaExistingStart =
    fechaRealDeViaje(v, S);

  if (esTransportadoraTercero(v)) {
    return (
      fechaNewStart.getTime() <=
        fechaExistingStart.getTime() &&
      fechaNewEnd.getTime() >=
        fechaExistingStart.getTime()
    );
  }

  const diasViaje =
    obtenerDiasViaje(v, S);

  const diasABloquear =
    Math.max(diasViaje - 2, 0);

  const finTransito =
    new Date(fechaExistingStart);

  finTransito.setDate(
    finTransito.getDate() +
    diasABloquear
  );

  return (
    fechaNewStart.getTime() <=
      finTransito.getTime() &&
    fechaNewEnd.getTime() >=
      fechaExistingStart.getTime()
  );
}

/**
 * @param {string} placa
 * @param {number} diaIni
 * @param {number} diaFin
 * @param {any} S
 * @param {string|number|object|null} [viajeExcluido]
 */
export function hayConflicto(
  placa,
  diaIni,
  diaFin,
  S,
  viajeExcluido = null
) {
  const pTarget = String(
    placa || ''
  )
    .toUpperCase()
    .trim();

  const anioBase =
    Number(S?.anio);

  const mesBase =
    Number(S?.mes);

  const fechaNewStart =
    new Date(
      anioBase,
      mesBase,
      Number(diaIni)
    );

  const fechaNewEnd =
    new Date(
      anioBase,
      mesBase,
      Number(diaFin) - 1
    );

  return S?.viajes?.some(v => {

    if (
      viajeExcluido !== null &&
      viajeExcluido !== undefined
    ) {
      if (v === viajeExcluido) {
        return false;
      }

      if (
        v.id !== undefined &&
        v.id !== null &&
        v.id !== '' &&
        v.id === viajeExcluido
      ) {
        return false;
      }
    }

    const vP = String(
      v.p ||
      v.placa ||
      ''
    )
      .toUpperCase()
      .trim();

    if (vP !== pTarget) {
      return false;
    }

    return chocaConViajeExistente(
      v,
      fechaNewStart,
      fechaNewEnd,
      S
    );
  });
}

// 5.1 CUPOS DE TERCEROS

const NOMBRES_MESES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre'
];

export function siguienteNumeroCupo(
  nombreTr,
  S
) {
  const mesTexto =
    NOMBRES_MESES[
      Number(S?.mes)
    ];

  const anioActual =
    Number(S?.anio);

  let maxN = 0;

  (S?.viajes || [])
    .forEach((v) => {

      const esMismaTr =
        String(v.tr || '')
          .toLowerCase()
          .trim() ===
        nombreTr
          .toLowerCase()
          .trim();

      const esMesActual =
        v.mes === mesTexto &&
        Number(v.anio) ===
          anioActual;

      if (
        !esMismaTr ||
        !esMesActual
      ) {
        return;
      }

      const match =
        String(
          v.p ||
          v.placa ||
          ''
        ).match(
          /(\d+)\s*$/
        );

      if (match) {
        const n =
          parseInt(
            match[1],
            10
          );

        if (n > maxN) {
          maxN = n;
        }
      }
    });

  return maxN + 1;
}

export function buscarCupoLibre(
  nombreTr,
  diaIni,
  diaFin,
  viajeExcluidoId,
  S
) {
  const patron =
    new RegExp(
      `^${nombreTr}\\s+\\d+$`,
      'i'
    );

  const candidatos =
    (S?.vehiculos || [])
      .filter((v) =>
        patron.test(
          String(
            v.p ||
            v.placa ||
            ''
          ).trim()
        )
      )
      .map((v) =>
        String(
          v.p ||
          v.placa ||
          ''
        )
          .toUpperCase()
          .trim()
      )
      .sort((a, b) => {
        const na =
          parseInt(
            a.match(
              /(\d+)\s*$/
            )?.[1] || '0',
            10
          );

        const nb =
          parseInt(
            b.match(
              /(\d+)\s*$/
            )?.[1] || '0',
            10
          );

        return na - nb;
      });

  for (const placa of candidatos) {

    if (
      !hayConflicto(
        placa,
        diaIni,
        diaFin,
        S,
        viajeExcluidoId
      )
    ) {
      return placa;
    }
  }

  return null;
}

/**
 * @param {string} placa
 * @param {number} diaIni
 * @param {number} diaFin
 * @param {any} S
 * @param {string|number|object|null} [viajeExcluido]
 */
export function obtenerViajesEnConflicto(
  placa,
  diaIni,
  diaFin,
  S,
  viajeExcluido = null
) {
  const pTarget =
    String(placa || '')
      .toUpperCase()
      .trim();

  const anioBase =
    Number(S?.anio);

  const mesBase =
    Number(S?.mes);

  const fechaNewStart =
    new Date(
      anioBase,
      mesBase,
      Number(diaIni)
    );

  const fechaNewEnd =
    new Date(
      anioBase,
      mesBase,
      Number(diaFin) - 1
    );

  // Blindaje: un viaje candidato a "chocar" solo puede venir del mes
  // anterior, el actual, o el siguiente al que se está viendo — nunca de
  // meses lejanos ni de datos huérfanos de pruebas viejas. Antes se
  // comparaba contra TODA la historia de la placa sin límite, así que un
  // viaje corrupto de cualquier mes (fecha rota, diasTrans absurdo) podía
  // "estirarse" y marcar en rojo un viaje real que en la vida real nunca
  // choca con nada.
  const rangoValido = new Set([-1, 0, 1].map(offset => {
    let m = mesBase + offset;
    let a = anioBase;
    if (m < 0) { m = 11; a -= 1; }
    if (m > 11) { m = 0; a += 1; }
    return `${a}-${m}`;
  }));

  return (S?.viajes || [])
    .filter(v => {

      if (
        viajeExcluido !== null &&
        viajeExcluido !== undefined
      ) {
        if (v === viajeExcluido) {
          return false;
        }

        if (
          v.id !== undefined &&
          v.id !== null &&
          v.id !== '' &&
          v.id === viajeExcluido
        ) {
          return false;
        }
      }

      const vP =
        String(
          v.p ||
          v.placa ||
          ''
        )
          .toUpperCase()
          .trim();

      if (vP !== pTarget) {
        return false;
      }

      const fechaCandidato = fechaRealDeViaje(v, S);
      const claveMesCandidato = `${fechaCandidato.getFullYear()}-${fechaCandidato.getMonth()}`;
      if (!rangoValido.has(claveMesCandidato)) {
        return false;
      }

      return chocaConViajeExistente(
        v,
        fechaNewStart,
        fechaNewEnd,
        S
      );
    });
}

// 6. MOTOR DE AGRUPACIÓN
// CORREGIDO: ahora todos los viajes válidos se pintan.
// No se elimina un viaje porque exista otro viaje
// de la misma placa en esa fecha.

export function agruparViajes(
  viajes,
  S = null
) {
  const agrupado = {};

  if (
    !viajes ||
    !Array.isArray(viajes)
  ) {
    return agrupado;
  }

  const viajesUnicos =
    new Map();

  viajes.forEach((vj) => {

    const placa =
      String(
        vj.p ||
        vj.placa ||
        'SIN_PLACA'
      )
        .toUpperCase()
        .trim();

    const uniqueId =
      vj.id ||
      vj.manifiesto ||
      `${placa}-${
        vj.fecha ||
        vj.salida
      }-${
        vj.ruta ||
        vj.destino
      }`;

    if (
      !viajesUnicos.has(uniqueId)
    ) {
      viajesUnicos.set(
        uniqueId,
        vj
      );
    }
  });

  const viajesOrdenados =
    Array.from(
      viajesUnicos.values()
    ).sort(
      (a, b) =>
        Number(
          a.salida ??
          a.dia ??
          0
        ) -
        Number(
          b.salida ??
          b.dia ??
          0
        )
    );

  viajesOrdenados.forEach(
    (vj) => {

      const placa =
        String(
          vj.p ||
          vj.placa ||
          'SIN_PLACA'
        ).trim();

      const inicio =
        Number(
          vj.salida ??
          vj.dia
        );

      if (
        !inicio ||
        inicio < 1
      ) {
        return;
      }

      const rExcel =
        buscarRutaEnExcel(
          vj,
          S
        );

      // Antes aquí se ESCONDÍAN los viajes de LUN 428 que no fueran a
      // Barranquilla/Montería: existían (Vehículos los mostraba) pero el
      // Rutograma pintaba "Vehículo disponible" ese día. La restricción
      // de rutas aplica al GENERAR (server.js), no al mostrar lo que ya
      // existe — y los viajes reales importados pueden ir a cualquier lado.

      const codigoRuta =
        rExcel?.cod ||
        vj.ruta ||
        vj.codigo ||
        vj.destino ||
        'N/A';

      // Viaje cancelado:
      // se muestra únicamente
      // en su día original.
      if (
        vj.estado ===
        'Cancelado'
      ) {
        const keyDia =
          `${placa}-${inicio}`;

        if (
          !agrupado[keyDia]
        ) {
          agrupado[keyDia] = [];
        }

        agrupado[keyDia].push({
          ...vj,
          isStart: true,
          type: 'cancelado',
          destinoReal:
            vj.destino,
          destino:
            codigoRuta,
          displayLabel:
            codigoRuta
        });

        return;
      }

      /*
       * CORRECCIÓN PRINCIPAL
       *
       * Antes se utilizaba un Set de ocupación:
       *
       * ocupacionVehiculos
       *
       * y si la placa ya estaba ocupada,
       * el viaje podía terminar sin pintarse.
       *
       * Ahora cada viaje válido se pinta
       * directamente.
       */

      const esTercero =
        esTransportadoraTercero(vj);

      let diasOcupados;

      if (esTercero) {
        // Polar / Arsitrans:
        // solo se pinta el día de salida.
        diasOcupados = 1;
      } else {
        const diasViaje =
          obtenerDiasViaje(
            vj,
            S
          );

        // Incluye el día de salida
        // y los días de tránsito.
        diasOcupados =
          Math.max(
            diasViaje - 1,
            1
          );
      }

      for (
        let offset = 0;
        offset < diasOcupados;
        offset++
      ) {

        const dia =
          inicio + offset;

        const keyDia =
          `${placa}-${dia}`;

        if (
          !agrupado[keyDia]
        ) {
          agrupado[keyDia] = [];
        }

        const esDiaDeInicio =
          offset === 0;

        agrupado[keyDia].push({
          ...vj,
          isStart:
            esDiaDeInicio,
          type: 'viaje',
          // "destino" se sobreescribe con el código de ruta a propósito
          // (así se ve en las tarjetas de la matriz, ej. "BOG-MED-EX").
          // Se guarda el destino REAL aparte, en "destinoReal" — sin
          // esto, cualquier otra vista que necesite el destino de
          // verdad (como el resumen semanal, para colorear cada
          // parada por ciudad) terminaba viendo el código de ruta en
          // su lugar, y por eso todos los puntos salían del mismo
          // color gris (ningún código de ruta calza con un nombre de
          // ciudad conocido).
          destinoReal:
            vj.destino,
          destino:
            codigoRuta,
          displayLabel:
            codigoRuta
        });
      }
    }
  );

  return agrupado;
}

// 8. REPROGRAMACIÓN AUTOMÁTICA DE VIAJES EN CONFLICTO

export function reprogramarViajeConflictivo(
  viajeExistente,
  S
) {
  if (
    !viajeExistente ||
    !S
  ) {
    return null;
  }

  const rExcel =
    buscarRutaEnExcel(
      viajeExistente,
      S
    );

  const anio =
    Number(S.anio);

  const mes =
    Number(S.mes);

  const totalDiasMes =
    new Date(
      anio,
      mes + 1,
      0
    ).getDate();

  const mapaDiasClave = [
    'dom',
    'lun',
    'mar',
    'mie',
    'jue',
    'vie',
    'sab'
  ];

  const diasViaje =
    obtenerDiasViaje(
      viajeExistente,
      S
    );

  const salidaOriginal =
    Number(
      viajeExistente.salida
    );

  const esValido =
    (dia) => {

      if (
        rExcel &&
        rExcel.dias &&
        typeof rExcel.dias ===
          'object'
      ) {
        const fechaCandidata =
          new Date(
            anio,
            mes,
            dia
          );

        const claveDia =
          mapaDiasClave[
            fechaCandidata.getDay()
          ];

        const cfgDia =
          rExcel.dias[
            claveDia
          ];

        if (
          !cfgDia ||
          !cfgDia.checked
        ) {
          return null;
        }
      }

      const nuevoFin =
        dia +
        diasViaje -
        1;

      if (
        hayConflicto(
          viajeExistente.p ||
            viajeExistente.placa,
          dia,
          nuevoFin,
          S,
          viajeExistente
        )
      ) {
        return null;
      }

      return {
        dia,
        fin: nuevoFin
      };
    };

  for (
    let distancia = 1;
    distancia <= totalDiasMes;
    distancia++
  ) {

    const haciaAdelante =
      salidaOriginal +
      distancia;

    if (
      haciaAdelante <=
      totalDiasMes
    ) {
      const resultado =
        esValido(
          haciaAdelante
        );

      if (resultado) {
        return resultado;
      }
    }
  }

  return null;
}

// Corre los viajes de un vehículo hacia adelante
// para llenar huecos.

// Cuando un vehículo sale de mantenimiento y ese día exacto queda libre
// (no tenía ningún viaje propio ya agendado para acomodar ahí), en vez de
// dejarlo parado se puede "recuperar" un viaje que ese mismo día ya tenía
// asignado un tercero (Arsitrans/Polar) — solo si la ruta de ese viaje es
// de duración corta (1 o 2 días de tránsito), para no comprometerlo con
// algo largo justo al salir del taller.
export function buscarViajesTercerosRobables(diaObjetivo, S) {
  return (S.viajes || []).filter(v => {
    const tr = String(v.tr || v.transportadora || '').toLowerCase();
    if (!tr.includes('polar') && !tr.includes('arsitran')) return false;
    if (v.estado === 'Cancelado') return false;
    if (Number(v.salida ?? v.dia) !== Number(diaObjetivo)) return false;

    const ruta = (S.rutas || []).find(
      r => (r.cod || r.codigo) === (v.ruta || v.codigo)
    );
    const diasTrans = ruta ? Number(ruta.diasTrans) : null;
    return diasTrans === 1 || diasTrans === 2;
  });
}

// Traspasa un viaje de tercero a la placa Makand que acaba de quedar
// libre — recalcula el retorno con LA FÓRMULA DE MAKAND (salida +
// diasTrans + 1), no la de terceros (salida + 1), porque ahora sí importa
// el tránsito real de ese vehículo propio.
export function tomarViajeTerceroParaVehiculo(viaje, placaNueva, S) {
  const ruta = (S.rutas || []).find(
    r => (r.cod || r.codigo) === (viaje.ruta || viaje.codigo)
  );
  const diasTrans = ruta && !isNaN(Number(ruta.diasTrans)) ? Number(ruta.diasTrans) : 1;

  viaje.p = placaNueva;
  viaje.placa = placaNueva;
  viaje.veh = placaNueva;
  viaje.tr = 'Makand';
  viaje.transportadora = 'Makand';
  viaje.retorno = Number(viaje.salida ?? viaje.dia) + diasTrans + 1;
  viaje.tipo = 'extra';
  return viaje;
}

// ============================================================
// VEHÍCULO VARADO — otro vehículo (de cualquier transportadora) termina
// de llevar el viaje cuando el original se avería a mitad de camino.
// ============================================================

// Candidatos para tomar el viaje varado: TODOS los vehículos (Makand y
// cupos de terceros ya existentes) excepto el que se averió, con un
// indicador de si están libres o ya tienen algo ese mismo día (y cuál).
// Libres primero, y entre los ocupados, Makand antes que terceros.
export function buscarVehiculosDisponiblesParaVarado(diaObjetivo, S, placaExcluir, mesTexto, anio) {
  const placaExcluirLimpia = String(placaExcluir || '').toUpperCase().trim();

  return (S.vehiculos || [])
    .filter(v => String(v.p || v.placa || '').toUpperCase().trim() !== placaExcluirLimpia)
    // Los vehículos "Urbano" nunca entran al Rutograma — no pueden tomar
    // un viaje varado.
    .filter(v => String(v.categoria || 'Viajero').trim() !== 'Urbano')
    .map(v => {
      const placa = String(v.p || v.placa || '').toUpperCase().trim();
      const tr = v.tr || v.transportadora || 'Makand';
      // OJO: obtenerViajesEnConflicto espera que "diaFin" sea el RETORNO
      // (le resta 1 internamente para armar el rango real) — pasarle el
      // mismo día en diaIni y diaFin armaba un rango invertido (día X
      // hasta día X-1) que nunca coincidía con nada, así que SIEMPRE
      // reportaba "sin conflicto" sin importar si el vehículo estaba
      // realmente ocupado o en tránsito ese día. Se le suma 1 para que,
      // tras la resta interna, quede el mismo día en ambos extremos.
      const conflictos = obtenerViajesEnConflicto(placa, diaObjetivo, diaObjetivo + 1, S);

      // Un vehículo que ya está marcado "Varado" ese mismo día (el suyo
      // propio, o porque ya tomó el viaje varado de otro) NO tiene
      // ningún viaje asignado ahí — se lo quitamos al transferirlo — así
      // que obtenerViajesEnConflicto() nunca lo va a ver ocupado por esa
      // vía. Hay que revisar el historial de averías aparte.
      const varadoEseDia = (mesTexto && anio) ? esDiaVarado(v, diaObjetivo, mesTexto, anio) : null;

      return {
        placa,
        tr,
        libre: conflictos.length === 0 && !varadoEseDia,
        viajeConflicto: conflictos[0] || null,
        varadoEseDia
      };
    })
    .sort((a, b) => {
      if (a.libre !== b.libre) return a.libre ? -1 : 1;
      const ordenTr = t => (String(t).toLowerCase().includes('makand') ? 0 : 1);
      return ordenTr(a.tr) - ordenTr(b.tr);
    });
}

// Transfiere un viaje a OTRO vehículo/transportadora — a diferencia de
// tomarViajeTerceroParaVehiculo (que siempre asigna a Makand), esta
// recalcula el retorno según la fórmula de la transportadora DE DESTINO,
// sea cual sea (Makand: salida+diasTrans+1 · Polar/Arsitrans: salida+1).
export function transferirViajeAOtroVehiculo(viaje, placaNueva, trNueva, S) {
  const diaSalida = Number(viaje.salida ?? viaje.dia);
  const trNormalizado = String(trNueva || '').toLowerCase();
  const esTerceroDestino = trNormalizado.includes('polar') || trNormalizado.includes('arsitran');

  if (esTerceroDestino) {
    viaje.retorno = diaSalida + 1;
  } else {
    const ruta = (S.rutas || []).find(r => (r.cod || r.codigo) === (viaje.ruta || viaje.codigo));
    const diasTrans = ruta && !isNaN(Number(ruta.diasTrans)) ? Number(ruta.diasTrans) : 1;
    viaje.retorno = diaSalida + diasTrans + 1;
  }

  viaje.p = placaNueva;
  viaje.placa = placaNueva;
  viaje.veh = placaNueva;
  viaje.tr = trNueva;
  viaje.transportadora = trNueva;
  viaje.tipo = 'extra';
  return viaje;
}

// El día que un vehículo se avería queda marcado como "Varado" con su
// razón — INDEPENDIENTE del estado general del vehículo (est/estado,
// mantInicio/mantFin). Así, si días después ese mismo vehículo entra en
// mantenimiento (un rango de fechas distinto), el día puntual en que se
// averió sigue mostrando "Varado", sin que el mantenimiento posterior lo
// borre ni lo tape.
export function esDiaVarado(vehiculo, dia, mesTexto, anio) {
  if (!vehiculo?.historialAverias?.length) return null;
  return vehiculo.historialAverias.find(
    a => Number(a.dia) === Number(dia) && a.mes === mesTexto && Number(a.anio) === Number(anio)
  ) || null;
}

export function reprogramarViajesDesde(
  placa,
  diaInicioDisponible,
  S,
  idsExcluir = []
) {
  const anio =
    Number(S.anio);

  const mes =
    Number(S.mes);

  const totalDiasMes =
    new Date(
      anio,
      mes + 1,
      0
    ).getDate();

  const mapaDiasClave = [
    'dom',
    'lun',
    'mar',
    'mie',
    'jue',
    'vie',
    'sab'
  ];

  const placaLimpia =
    String(
      placa || ''
    )
      .toUpperCase()
      .trim();

  const idsExcluirSet =
    new Set(
      (idsExcluir || []).filter(Boolean)
    );

  const viajesVehiculo =
    (S.viajes || [])
      .filter(
        v =>
          String(
            v.p ||
            v.placa ||
            ''
          )
            .toUpperCase()
            .trim() ===
            placaLimpia &&
          v.estado !==
            'Cancelado' &&
          Number(v.salida) >=
            1 &&
          Number(v.salida) <=
            totalDiasMes &&
          Number(v.salida) >=
            diaInicioDisponible &&
          // Un viaje que el paso anterior (resolución de choques
          // directos con reprogramarViajeConflictivo) ya movió a un día
          // específico elegido para NO chocar con el viaje recién
          // agregado no debe volver a tocarse aquí — este algoritmo solo
          // mira si la ruta corre ese día de la semana, no si el día ya
          // fue elegido a propósito para evitar un choque puntual, así
          // que podía jalarlo de regreso justo al problema que el paso
          // anterior ya había resuelto.
          !idsExcluirSet.has(v.id)
      )
      .sort(
        (a, b) =>
          Number(a.salida) -
          Number(b.salida)
      );

  const cambiados = [];

  let disponibleDesde =
    Math.max(
      diaInicioDisponible,
      1
    );

  for (
    const vj of viajesVehiculo
  ) {

    const rExcel =
      buscarRutaEnExcel(
        vj,
        S
      );

    const diasViaje =
      obtenerDiasViaje(
        vj,
        S
      );

    const correEseDia =
      (dia) => {

        if (
          rExcel &&
          rExcel.dias &&
          typeof rExcel.dias ===
            'object'
        ) {
          const fecha =
            new Date(
              anio,
              mes,
              dia
            );

          const clave =
            mapaDiasClave[
              fecha.getDay()
            ];

          const cfg =
            rExcel.dias[
              clave
            ];

          if (
            !cfg ||
            !cfg.checked
          ) {
            return false;
          }
        }

        return true;
      };

    let nuevoDia = null;

    for (
      let d =
        disponibleDesde;
      d <=
        Number(vj.salida);
      d++
    ) {
      if (
        correEseDia(d)
      ) {
        nuevoDia = d;
        break;
      }
    }

    if (
      nuevoDia !== null &&
      nuevoDia <
        Number(vj.salida)
    ) {

      const diff =
        nuevoDia -
        Number(vj.salida);

      vj.salida =
        nuevoDia;

      vj.retorno =
        Number(
          vj.retorno
        ) + diff;

      vj.dia =
        nuevoDia;

      const nuevaFechaObj =
        new Date(
          anio,
          mes,
          nuevoDia
        );

      const yyyy =
        nuevaFechaObj
          .getFullYear();

      const mm =
        String(
          nuevaFechaObj
            .getMonth() + 1
        ).padStart(2, '0');

      const dd =
        String(
          nuevaFechaObj
            .getDate()
        ).padStart(2, '0');

      vj.fecha =
        `${yyyy}-${mm}-${dd}`;

      cambiados.push(vj);
    }

    disponibleDesde =
      Number(vj.salida) +
      (diasViaje - 1);
  }

  return cambiados;
}

// Se mantiene con el nombre anterior
// por compatibilidad.

export function reprogramarSiguientesTrasEliminar(
  placa,
  S
) {
  return reprogramarViajesDesde(
    placa,
    1,
    S
  );
}

// 7. SERVICIOS ADICIONALES

export function prepararRutasEnriquecidas(
  rutas
) {
  if (!rutas) return [];

  return rutas.map(
    r => ({
      ...r,
      label:
        `${r.cod || r.codigo} - ${
          r.dest || r.nombre
        }`
    })
  );
}

export function calcularProximaEntrega(
  diasSem,
  meses
) {
  return 'Calculado';
}

export function validarPlaca(
  placa
) {
  return /^[A-Z]{3}\s?\d{3}$/.test(
    String(
      placa || ''
    )
      .toUpperCase()
      .trim()
  );
}