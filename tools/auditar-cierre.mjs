/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCANVEIL · tools/auditar-cierre.mjs
 * ---------------------------------------------------------------------------
 * Encargo #5 del 7-oct-2026 (cierre seguro), lo que se prueba en el motor:
 *
 *   1. Un intensificador («con toda mi…») no concede objetos: «con toda mi
 *      katana» sin katana abría pelea (se trataba como «con toda mi fuerza»).
 *   3. El desgaste cae en el arma que de verdad atacó (por su ID):
 *      `_desgastarArma` leía `equipado.manoPrincipal` (no existe; la ranura es
 *      `armaPrincipal`) y no sabía qué arma se había elegido en el menú.
 *
 * La salida segura (2), la entrada clásica (4) y el escritorio (5) se prueban
 * en Chrome (`tools/regresion-app.mjs`). FIXTURE = estado preparado a mano.
 *
 *   node tools/auditar-cierre.mjs
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { crearMotor } from './motor-sin-ventana.mjs';
import { crear } from '../src/inventory/Item.js';

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

async function partida(semilla = 9303, clase = 'rastreador') {
  const m = await crearMotor({ semilla });
  await m.empezar({ nombre: 'Sive', raza: 'valdes', clase, trasfondo: 'errante', genero: 'f' });
  const reg = { combate: [], tiradas: 0 };
  m.bus.on('combat:request', (d) => reg.combate.push(d));
  m.bus.on('rules:roll', () => { reg.tiradas += 1; });
  const foto = () => {
    const p = m.ver('player') ?? {};
    const t = m.ver('world.tiempo') ?? {};
    return JSON.stringify({
      t: [t.diasTotales, t.hora, t.minuto, t.franja], turno: m.ver('meta.turno'), vida: p.vida?.actual, mana: p.mana?.actual, fatiga: p.fatiga,
      inv: m.ver('inventory.objetos.porId'), eq: m.ver('inventory.equipado'), rep: m.ver('factions.reputacion'),
      agr: m.ver('world.agresiones'), sit: m.ver('world.situaciones'), combate: m.ver('combat.activo', false), memoria: (m.ver('ai.memoria')?.hechos ?? []).length,
    });
  };
  async function turno(frase) {
    const antes = foto();
    const c0 = reg.combate.length; const t0 = reg.tiradas;
    const texto = visible(await m.jugar(frase));
    return { texto, igual: foto() === antes, combate: reg.combate.slice(c0), tiradas: reg.tiradas - t0 };
  }
  const objetos = (refId) => Object.values(m.ver('inventory.objetos.porId', {})).filter((o) => o.refId === refId);
  return { m, turno, foto, objetos, reg };
}
const sinGasto = (r) => r.igual && !r.combate.length && r.tiradas === 0;

/* ── 1. Intensificadores ─────────────────────────────────────────────────── */

console.log('\n── 1 · Un intensificador no concede objetos (9303; Sive lleva arco corto y cuchillo de caza, NO katana) ──');
for (const frase of [
  'Ataco a Korsa con toda mi katana', 'ataco a korsa con toda mi katana', 'ataco a Korsa usando toda mi katana', 'ataco a Korsa utilizando toda la katana',
  'ataco a Korsa empleando todo mi hacha', 'ataco a Korsa con todas mis katanas', 'ataco a Korsa con todo mi cuchillo mágico',
  'ataco a Korsa con toda mi fuerza y el hacha', 'ataco a Korsa con toda una katana', 'ataco a Korsa con todo el cuchillo de plata',
]) {
  await caso(async () => {
    const p = await partida();
    const r = await p.turno(frase);
    comprobar(sinGasto(r) && /^No llevas /.test(r.texto) && !/Atacas|Intentas/.test(r.texto), `«${frase}»: aclara sin gastar nada`, r.texto);
  });
}
for (const [frase, que] of [
  ['ataco a Korsa con toda mi fuerza', 'modo intensificado'], ['ataco a Korsa con todas mis fuerzas', 'modo intensificado (plural)'],
  ['ataco a Korsa con toda mi rabia', 'modo intensificado'], ['ataco a Korsa con todo mi peso', 'modo intensificado (peso)'],
  ['ataco a Korsa con toda calma', 'modo'], ['ataco a Korsa con sigilo', 'modo'], ['ataco a Korsa con fuerza', 'modo'],
  ['ataco a Korsa con todo mi cuchillo de caza', 'instrumento válido intensificado'], ['ataco a Korsa con todo el cuchillo', 'alias válido intensificado'],
  ['ataco a Korsa con los puños', 'cuerpo'], ['ataco a Korsa con toda la fuerza de mis puños', 'modo + cuerpo'],
]) {
  await caso(async () => {
    const p = await partida();
    const r = await p.turno(frase);
    comprobar(!/^No llevas|no en la mano|no sirve|¿Con cuál/.test(r.texto) && r.combate.length === 1 && r.combate[0].contra === 'Korsa', `${que}: «${frase}» ataca a Korsa`, r.texto);
  });
}
for (const [frase, que] of [['no ataco a Korsa con toda mi katana', 'negación'], ['Le digo a Korsa: «te ataco con toda mi katana»', 'cita'], ['si Korsa se mueve, le ataco con toda mi katana', 'condición']]) {
  await caso(async () => {
    const p = await partida();
    const r = await p.turno(frase);
    comprobar(!/No llevas katana/.test(r.texto) && !r.combate.length, `${que}: «${frase}» ni aclara armas ni ataca`, r.texto);
  });
}
await caso(async () => {
  const p = await partida();
  p.m.sistema('inventory').recibirBotin({ oro: 0, objetos: [crear('cuchillo_gastado')] });
  const r = await p.turno('ataco a Korsa con todo mi cuchillo');
  comprobar(sinGasto(r) && /¿Con cuál/.test(r.texto), 'FIXTURE dos cuchillos: «con todo mi cuchillo» pregunta cuál', r.texto);
});
await caso(async () => {
  // En combate: el texto bélico va al menú, también intensificado.
  const p = await partida();
  await p.m.jugar('ataco a Xivio');
  const c = p.m.sistema('combat');
  for (let i = 0; i < 400 && !c.esperandoJugador; i++) await espera(5);
  const antes = p.foto();
  const j = await c.jugadaLibre('ataco al guardia con toda mi katana');
  comprobar(j?.tipo === 'aclaracion' && p.foto() === antes && c.esperandoJugador, 'en combate, «con toda mi katana»: aclara sin golpe ni ronda', JSON.stringify(j));
});

/* ── 3. Desgaste del arma que atacó ─────────────────────────────────────── */

console.log('\n── 3 · Desgaste del arma que de verdad atacó (regla: 0,6 por golpe con daño) ──');
async function enCombate(p, contra) {
  await p.m.jugar(`ataco a ${contra}`);
  const c = p.m.sistema('combat');
  for (let i = 0; i < 400 && !c.esperandoJugador; i++) await espera(5);
  return c;
}
const durab = (p, id) => p.m.ver(`inventory.objetos.porId.${id}.durabilidad`);
/** Ataca con el ataque `id` hasta acertar con daño (la regla solo desgasta con daño). */
async function golpearHastaDanar(p, c, ataqueId, maximo = 30) {
  let danos = 0;
  const oir = (d) => { if (d?.atacante?.esJugador && d.dano) danos += 1; };
  p.m.bus.on('combat:attack', oir);
  for (let i = 0; i < maximo && danos === 0 && p.m.ver('combat.activo', false); i++) {
    for (let k = 0; k < 400 && !c.esperandoJugador && p.m.ver('combat.activo', false); k++) await espera(5);
    if (!p.m.ver('combat.activo', false)) break;
    p.m.store.fijar('player.vida.actual', p.m.ver('player.vida.max')); // FIXTURE: que el jugador aguante
    const menu = c.accionesDelJugador();
    const blanco = menu.enemigos[0];
    await c.ejecutar({ tipo: 'atacar', token: menu.token, ataqueId, objetivoId: blanco.id });
  }
  p.m.bus.off?.('combat:attack', oir);
  return danos;
}
await caso(async () => {
  // Escena natural 9303: la rastreadora lleva el cuchillo de caza en la mano secundaria.
  const p = await partida(9303, 'rastreador');
  const c = await enCombate(p, 'Xivio');
  const cuchillo = p.m.ver('inventory.equipado.armaSecundaria');
  const arco = p.objetos('arco_corto')[0];
  const d0 = durab(p, cuchillo); const a0 = arco?.durabilidad;
  const ataque = c.accionesDelJugador().ataques.find((a) => a.itemId === cuchillo);
  const danos = await golpearHastaDanar(p, c, ataque?.id);
  comprobar(danos >= 1 && Math.abs((d0 - durab(p, cuchillo)) - 0.6 * danos) < 1e-9, `9303 natural: el cuchillo de caza (mano secundaria) pierde 0,6 por golpe con daño (${d0} → ${durab(p, cuchillo)}, ${danos} golpe/s)`);
  comprobar(p.objetos('arco_corto')[0]?.durabilidad === a0, '  el arco (en la mochila) no se toca');
});
await caso(async () => {
  // FIXTURE: dos armas en las manos con durabilidades distintas.
  const p = await partida(9505, 'baluarte');
  const espada = p.m.ver('inventory.equipado.armaPrincipal');
  p.m.sistema('inventory').recibirBotin({ oro: 0, objetos: [crear('daga')] });
  const daga = p.objetos('daga')[0].id;
  p.m.store.fijar('inventory.equipado.armaSecundaria', daga);
  p.m.store.fijar(`inventory.objetos.porId.${daga}.durabilidad`, 20);
  const c = await enCombate(p, 'Berlo');
  const ataques = c.accionesDelJugador().ataques;
  comprobar(ataques.length === 2 && ataques.some((a) => a.itemId === espada) && ataques.some((a) => a.itemId === daga), `dos armas en las manos: dos ataques (${ataques.map((a) => a.nombre)})`);
  const e0 = durab(p, espada); const g0 = durab(p, daga);
  const danos = await golpearHastaDanar(p, c, `arma:${daga}`);
  comprobar(danos >= 1 && Math.abs((g0 - durab(p, daga)) - 0.6 * danos) < 1e-9 && durab(p, espada) === e0, `atacar con la daga (secundaria) desgasta la daga (${g0} → ${durab(p, daga)}) y no la espada (${e0} → ${durab(p, espada)})`);
});
await caso(async () => {
  // Rechazos y cancelación: ningún desgaste.
  const p = await partida(9505, 'baluarte');
  const espada = p.m.ver('inventory.equipado.armaPrincipal');
  const c = await enCombate(p, 'Berlo');
  const e0 = durab(p, espada);
  const menu = c.accionesDelJugador();
  await c.ejecutar({ tipo: 'atacar', token: menu.token, ataqueId: menu.ataques[0].id, objetivoId: 'no_existe' });
  await c.ejecutar({ tipo: 'atacar', token: 'viejo', ataqueId: menu.ataques[0].id, objetivoId: menu.enemigos[0].id });
  comprobar(durab(p, espada) === e0, 'blanco inválido o ficha vieja: ni un punto de desgaste');
});
await caso(async () => {
  // FIXTURE: la espada a 0,5 → un golpe con daño la rompe; queda en 0 y deja de ser un ataque válido.
  const p = await partida(9505, 'baluarte');
  const espada = p.m.ver('inventory.equipado.armaPrincipal');
  p.m.store.fijar(`inventory.objetos.porId.${espada}.durabilidad`, 0.5);
  const c = await enCombate(p, 'Berlo');
  const danos = await golpearHastaDanar(p, c, `arma:${espada}`);
  const d = durab(p, espada);
  comprobar(danos >= 1 && d === 0, `la espada llega a 0 (no a ${d}, ni negativa ni NaN)`);
  if (p.m.ver('combat.activo', false)) {
    for (let k = 0; k < 400 && !c.esperandoJugador && p.m.ver('combat.activo', false); k++) await espera(5);
    c.accionesDelJugador(); // una primera consulta (la interfaz consulta en cada repintado)
    const menu = c.accionesDelJugador();
    const suya = menu?.ataques.find((a) => a.itemId === espada);
    comprobar(menu && suya && !suya.disponible && /roto/.test(suya.motivo) && menu.ataques.some((a) => a.id === 'golpe' && a.disponible),
      `  el menú la sigue enseñando, «está roto» y sin poder elegirla, consulta tras consulta; y ofrece el golpe sin arma (${JSON.stringify(menu?.ataques.map((a) => [a.nombre, a.disponible, a.motivo]))})`);
    const r = await c.ejecutar({ tipo: 'atacar', token: menu.token, ataqueId: `arma:${espada}`, objetivoId: menu.enemigos[0].id });
    comprobar(!r.ok && durab(p, espada) === 0, '  y no se puede atacar con ella (sin caer a otra arma)', JSON.stringify(r));
    p.m.sistema('saves').guardar('6', { silencioso: true });
    p.m.sistema('saves').cargar('6');
    await espera(20);
    const c2 = p.m.sistema('combat');
    const tras = c2.accionesDelJugador()?.ataques.find((a) => a.itemId === espada);
    comprobar(durab(p, espada) === 0 && (!tras || !tras.disponible), '  tras guardar y cargar sigue rota (no revive sana)');
  }
});

/* ── 4. Interfaz clásica: RETIRADA (decisión del #6, 7-oct-2026) ───────── */
// El aviso provisional del #5 no era la retirada. Ahora: ninguna segunda
// interfaz jugable, y la dirección vieja solo lleva a `app/`. En Chrome:
// regresion-app (redirección con datos) y auditar-bundle (archivo único).

console.log('\n── 4 · Interfaz clásica retirada (código; en Chrome: regresion-app y auditar-bundle) ──');
await caso(async () => {
  const { readFileSync, existsSync } = await import('node:fs');
  const leer = (r) => readFileSync(new URL(`../${r}`, import.meta.url), 'utf8');
  comprobar(!existsSync(new URL('../src/ui/components/CombatPanel.js', import.meta.url)) && !existsSync(new URL('../src/main.js', import.meta.url)) && !existsSync(new URL('../styles', import.meta.url)),
    'su código (src/ui, src/main.js) y sus estilos (styles/) ya no están');
  const puente = leer('clasico.html');
  comprobar(!/<script[^>]+src=|type="module"|styles\//.test(puente) && /location\.replace\('\.\/app\/index\.html'\)/.test(puente) && /url=\.\/app\/index\.html/.test(puente),
    'clasico.html es solo un puente a app/ (sin código del juego), con y sin JavaScript');
  const portada = leer('index.html');
  comprobar(!/clasico\.html/.test(portada.replace(/<!--[\s\S]*?-->/g, '')) && /\.\/app\/index\.html/.test(portada), 'la portada ya no enlaza la interfaz antigua');
  comprobar(/const ENTRADA = 'app\/app\.js'/.test(leer('tools/bundle.mjs')) && /const HTML_BASE = 'app\/index\.html'/.test(leer('tools/bundle.mjs')), 'el archivo único parte de app/, no de la clásica');
});

console.log(`\n${casos - fallos}/${casos} comprobaciones bien.`);
process.exit(fallos ? 1 : 0);
