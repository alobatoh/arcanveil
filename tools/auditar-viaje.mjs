/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCANVEIL · tools/auditar-viaje.mjs
 * ---------------------------------------------------------------------------
 * Encargo #4 del 7-oct-2026: un destino concreto se viaja o se explica.
 *
 * «voy a la Linde del Cenizo» desde Saucedo salía «Llegas a las afueras de
 * Saucedo… ¿Hacia dónde?», se quedaba en Saucedo y cobraba diez minutos: el
 * analizador perdía todo destino que empieza por artículo («a» casaba antes
 * que «a la»). «voy a Saucedo» estando allí narraba el camino y cobraba.
 *
 * Fotos de reloj, ubicación y progreso; nunca se toma el texto «llegas» por
 * llegada. FIXTURE = estado o azar preparado a mano.
 *
 *   node tools/auditar-viaje.mjs
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { crearMotor } from './motor-sin-ventana.mjs';
import * as Calendario from '../src/world/Calendario.js';

let fallos = 0;
let casos = 0;
function comprobar(bien, texto, detalle = '') {
  casos += 1;
  if (bien) console.log(`OK   ${texto}`);
  else { fallos += 1; console.log(`MAL  ${texto}`); if (detalle) console.log(`     ${String(detalle).replace(/\n/g, ' | ').slice(0, 600)}`); }
}
async function caso(fn) {
  try { await fn(); } catch (e) { comprobar(false, 'el caso revienta antes de terminar', String(e?.stack ?? e).split('\n').slice(0, 2).join(' ')); }
}
const visible = (t) => String(t).split('\n').filter((l) => l && !l.startsWith('»')).join('\n');
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function partida(semilla) {
  const m = await crearMotor({ semilla });
  await m.empezar({ nombre: 'Sive', raza: 'valdes', clase: 'rastreador', trasfondo: 'errante', genero: 'f' });
  const foto = () => ({
    min: Calendario.minutoAbsoluto(m.ver('world.tiempo')),
    lugar: m.ver('world.ubicacion'),
    viaje: JSON.stringify(m.sistema('travel').paraInterfaz()),
  });
  async function turno(frase) {
    const antes = foto();
    const texto = visible(await m.jugar(frase));
    await espera(20);
    return { texto, antes, despues: foto() };
  }
  return { m, turno, foto };
}

console.log('\n── Viajes naturales (semillas 9303 y 9505) ──');
for (const semilla of [9303, 9505]) {
  await caso(async () => {
    const p = await partida(semilla);
    let r = await p.turno('voy a Saucedo');
    comprobar(r.despues.lugar === 'saucedo' && r.despues.min - r.antes.min >= 4 * 60, `${semilla}: Vado → Saucedo llega (${((r.despues.min - r.antes.min) / 60).toFixed(1)} h)`, r.texto);
    r = await p.turno('voy a la Linde del Cenizo');
    const llego = r.despues.lugar === 'linde_cenizo';
    const cortado = JSON.parse(r.despues.viaje ?? 'null')?.interrumpido;
    comprobar((llego || cortado) && !/afueras|¿Hacia dónde\?/.test(r.texto) && r.despues.min - r.antes.min >= 60,
      `${semilla}: Saucedo → «la Linde del Cenizo» viaja (${llego ? 'llega' : 'encuentro en ruta'}, ${((r.despues.min - r.antes.min) / 60).toFixed(1)} h)`, r.texto);
  });
}
await caso(async () => {
  const p = await partida(9303);
  await p.turno('voy al Camino del Norte');
  const r = await p.turno('voy a las Tumbas Bajas');
  const llego = r.despues.lugar === 'tumbas_bajas';
  comprobar((llego || JSON.parse(r.despues.viaje ?? 'null')?.interrumpido) && !/afueras/.test(r.texto), '9303: Camino del Norte → «las Tumbas Bajas» viaja', r.texto);
});
for (const [frase, lugar] of [['voy a Linde del Cenizo', 'linde_cenizo'], ['viajo a la Linde', 'linde_cenizo'], ['me dirijo hacia la Linde del Cenizo', 'linde_cenizo'], ['voy a Saucedo', 'saucedo']]) {
  await caso(async () => {
    const p = await partida(9505);
    p.m.sistema('exploration').tocaEncuentro = () => false; // FIXTURE: sin encuentros en ruta
    const r = await p.turno(frase);
    comprobar(r.despues.lugar === lugar, `FIXTURE sin encuentros, «${frase}» desde el Vado: llega a ${lugar}`, `${r.despues.lugar} · ${r.texto}`);
  });
}

console.log('\n── Aclaraciones sin gasto ──');
for (const [frase, re] of [['voy', /^¿Adónde\? Desde aquí puedes ir a/], ['voy a Narnia', /^No conoces ningún sitio llamado «Narnia»/], ['me voy del pueblo', /^¿Adónde\?/]]) {
  await caso(async () => {
    const p = await partida(9303);
    const r = await p.turno(frase);
    comprobar(re.test(r.texto) && r.despues.min === r.antes.min && r.despues.lugar === r.antes.lugar, `«${frase}»: aclara, sin tiempo ni movimiento`, r.texto);
  });
}
await caso(async () => {
  const p = await partida(9505);
  await p.turno('voy a Saucedo');
  const r = await p.turno('voy a Saucedo');
  comprobar(/^Ya estás en Saucedo\.$/.test(r.texto) && r.despues.min === r.antes.min, '«voy a Saucedo» estando allí: «Ya estás en Saucedo.», sin gastar', r.texto);
  const t = await p.m.sistema('travel').viajar('saucedo');
  comprobar(t?.exito === false && p.foto().min === r.despues.min, '  y por el botón del mapa (`travel.viajar`) tampoco viaja', JSON.stringify(t));
});
await caso(async () => {
  const p = await partida(9505);
  let r = await p.turno('voy a la posada');
  comprobar(p.m.ver('world.sublugar') === 'posada_tres_clavos' && !/No conoces/.test(r.texto), '«voy a la posada»: entra en la posada (no es un destino del mapa)', r.texto);
  r = await p.turno('salgo de la posada');
  comprobar(!p.m.ver('world.sublugar') && /^Sales a la calle/.test(r.texto), '«salgo de la posada» estando dentro: sale', r.texto);
});

console.log('\n── Encuentro en ruta y reanudación (FIXTURE: encuentro forzado en el primer tramo) ──');
await caso(async () => {
  const p = await partida(9303);
  await p.turno('voy al Camino del Norte');
  const ex = p.m.sistema('exploration');
  const tr = p.m.sistema('travel');
  const original = tr._evaluarEncuentro.bind(tr);
  const forzado = ['camino', 'bosque', 'colinas', 'ruinas'].map((terreno) => ex.generarEncuentro({ terreno, peligro: 2, enViaje: true })).find(Boolean);
  let n = 0;
  tr._evaluarEncuentro = () => { n += 1; return n === 1 ? forzado : null; };
  const r = await p.turno('voy a las Tumbas Bajas');
  const v = JSON.parse(p.foto().viaje ?? 'null');
  comprobar(v?.interrumpido && v.destino === 'tumbas_bajas' && v.tramoActual >= 1, `se corta en ruta con el progreso guardado (tramo ${v?.tramoActual}/${v?.tramosTotales})`, `${r.texto} · ${p.foto().viaje}`);
  // Otro destino a medias: se explica, no se sale hacia otro sitio.
  const r2 = await p.turno('voy a Saucedo');
  comprobar(/^Vas camino de las Tumbas Bajas/i.test(r2.texto) && r2.despues.min === r2.antes.min && r2.despues.viaje === r2.antes.viaje, '  «voy a Saucedo» a medias: explica, sin gasto ni cambio de ruta', r2.texto);
  // Guardar y cargar con el viaje a medias.
  p.m.guardarYCargar();
  const v2 = JSON.parse(p.foto().viaje ?? 'null');
  comprobar(v2?.interrumpido && v2.tramoActual === v.tramoActual, '  tras guardar y cargar, el mismo viaje a medias', p.foto().viaje);
  p.m.sistema('exploration')._encuentro = null;
  const r3 = await p.turno('sigo el camino');
  const despues = p.foto();
  comprobar(despues.lugar === 'tumbas_bajas' && !JSON.parse(despues.viaje ?? 'null'), '  «sigo el camino»: reanuda lo que queda y llega', `${r3.texto} · ${despues.lugar}`);
  tr._evaluarEncuentro = original;
});
await caso(async () => {
  // Doble clic: dos `viajar` a la vez, un solo viaje.
  const p = await partida(9505);
  p.m.sistema('exploration').tocaEncuentro = () => false;
  const t0 = p.foto().min;
  const [a, b] = await Promise.all([p.m.sistema('travel').viajar('saucedo'), p.m.sistema('travel').viajar('saucedo')]);
  const horas = (p.foto().min - t0) / 60;
  comprobar(p.foto().lugar === 'saucedo' && [a, b].filter((x) => x?.exito).length === 1 && horas < 6, `doble viajar a la vez: un solo viaje (${horas.toFixed(1)} h)`, JSON.stringify([a, b]));
});

console.log(`\n${casos - fallos}/${casos} comprobaciones bien.`);
process.exit(fallos ? 1 : 0);
