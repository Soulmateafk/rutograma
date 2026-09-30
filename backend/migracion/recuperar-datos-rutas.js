// ============================================================
// RECUPERACIÓN ÚNICA — datos de "rutas" perdidos en la migración a SQLite
// ============================================================
// La tabla "rutas" de SQLite nunca tuvo columnas para "clientes" ni las
// tarifas por transportadora (tarifaMakand/tarifaArsitrans/tarifaPolar)
// ni "cajasMin" — no se borraron después, es que no existía dónde
// guardarlas desde el día 1 de la migración. Por eso Arsitrans nunca
// recibía viajes (el reparto decide mirando "clientes"), y las tarifas
// de los viajes generados quedaban en 0.
//
// Este script trae de vuelta esos valores exactos desde el Excel
// original (DatabaseRutograma.xlsx), emparejando por código de ruta
// ("cod"). Se corre UNA sola vez, después de reemplazar db.js y
// esquema.sql (que ya agregan las columnas que faltaban) — no hace daño
// correrlo más de una vez, simplemente vuelve a poner los mismos valores.
//
// Uso:
//   node migracion/recuperar-datos-rutas.js
//
// Actualiza TANTO la base Real como la de Prueba, porque las dos se
// crearon con el mismo esquema incompleto.

const { conectar } = require('./db.js');

const datosRecuperados = [
  { cod: 'BOG-CAL-EX',  clientes: 'Exito, Cali.',           tarifaMakand: 3000000, tarifaArsitrans: 2800000, tarifaPolar: 2700000, cajasMin: 150 },
  { cod: 'BOG-CAL-D1',  clientes: 'D1, Cali',               tarifaMakand: 3000000, tarifaArsitrans: 2800000, tarifaPolar: 2700000, cajasMin: 150 },
  { cod: 'BOG-EJE-D1',  clientes: 'D1, Eje Cafetero',       tarifaMakand: 2500000, tarifaArsitrans: 2300000, tarifaPolar: 2200000, cajasMin: 120 },
  { cod: 'BOG-MED-EX',  clientes: 'Exito, Medellin.',       tarifaMakand: 2800000, tarifaArsitrans: 2600000, tarifaPolar: 2500000, cajasMin: 150 },
  { cod: 'BOG-GIR-D1',  clientes: 'D1, Girardota.',         tarifaMakand: 2800000, tarifaArsitrans: 2600000, tarifaPolar: 2500000, cajasMin: 120 },
  { cod: 'BOG-GUA-D1',  clientes: 'D1, Guarne.',            tarifaMakand: 2800000, tarifaArsitrans: 2600000, tarifaPolar: 2500000, cajasMin: 120 },
  { cod: 'BOG-EST-D1',  clientes: 'D1, La Estrella.',       tarifaMakand: 2800000, tarifaArsitrans: 2600000, tarifaPolar: 2500000, cajasMin: 120 },
  { cod: 'BOG-BAQ-ARA', clientes: 'Ara, Barranquilla.',     tarifaMakand: 4500000, tarifaArsitrans: 4200000, tarifaPolar: 4000000, cajasMin: 200 },
  { cod: 'BOG-BAQ-D1',  clientes: 'D1, Barranquilla.',      tarifaMakand: 4500000, tarifaArsitrans: 4200000, tarifaPolar: 4000000, cajasMin: 200 },
  { cod: 'BOG-BAQ-EX',  clientes: 'Exito, Barranquilla.',   tarifaMakand: 4800000, tarifaArsitrans: 4500000, tarifaPolar: 4300000, cajasMin: 200 },
  { cod: 'BOG-MON-ARA', clientes: 'Ara, Monteria.',         tarifaMakand: 5000000, tarifaArsitrans: 4700000, tarifaPolar: 4500000, cajasMin: 150 },
  { cod: 'BOG-MON-D1',  clientes: 'D1, Monteria.',          tarifaMakand: 5000000, tarifaArsitrans: 4700000, tarifaPolar: 4500000, cajasMin: 100 },
  { cod: 'BOG-VDU-ARA', clientes: 'Ara, Valledupar.',       tarifaMakand: 5000000, tarifaArsitrans: 4700000, tarifaPolar: 4500000, cajasMin: 200 },
  { cod: 'BOG-VDU-D1',  clientes: 'D1, Valledupar',         tarifaMakand: 5000000, tarifaArsitrans: 4700000, tarifaPolar: 4500000, cajasMin: 200 },
  { cod: 'BOG-IBA-D1',  clientes: 'D1, Ibague.',            tarifaMakand: 1800000, tarifaArsitrans: 1600000, tarifaPolar: 1500000, cajasMin: 100 },
  { cod: 'BOG-CTG-ARA', clientes: 'Ara, Cartagena.',        tarifaMakand: 4800000, tarifaArsitrans: 4500000, tarifaPolar: 4300000, cajasMin: 200 },
  { cod: 'BOG-BAR-OLI', clientes: 'Olimpica, Barranquilla', tarifaMakand: 0,       tarifaArsitrans: 0,       tarifaPolar: 0,       cajasMin: 400 },
  { cod: 'BOG-TUN-D1',  clientes: 'D1, Tunja',              tarifaMakand: 0,       tarifaArsitrans: 0,       tarifaPolar: 0,       cajasMin: 200 },
  { cod: 'BOG-APA-D1',  clientes: 'D1, Apartado',           tarifaMakand: 0,       tarifaArsitrans: 0,       tarifaPolar: 0,       cajasMin: 300 }
];

const modosAActualizar = ['real', 'pruebas'];

for (const modo of modosAActualizar) {
  try {
    const db = conectar(modo);
    const upd = db.prepare(`
      UPDATE rutas
      SET clientes = @clientes,
          tarifa_makand = @tarifaMakand,
          tarifa_arsitrans = @tarifaArsitrans,
          tarifa_polar = @tarifaPolar,
          cajas_min = @cajasMin
      WHERE cod = @cod
    `);

    let actualizadas = 0;
    for (const r of datosRecuperados) {
      const resultado = upd.run(r);
      if (resultado.changes > 0) actualizadas++;
    }
    console.log(`[${modo}] ${actualizadas} de ${datosRecuperados.length} rutas recuperadas.`);

    const faltantes = datosRecuperados.filter(r => {
      const existe = db.prepare('SELECT 1 FROM rutas WHERE cod = ?').get(r.cod);
      return !existe;
    });
    if (faltantes.length) {
      console.log(`[${modo}] ⚠️ Estos códigos del Excel no existen hoy en la base (se ignoraron): ${faltantes.map(f => f.cod).join(', ')}`);
    }
  } catch (err) {
    console.error(`[${modo}] ❌ Error recuperando datos:`, err.message);
  }
}

console.log('\nListo. Revisa en Rutas que "Almacen / Cliente" y las tarifas ya no salgan vacías/en 0.');
