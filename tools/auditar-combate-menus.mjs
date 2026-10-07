/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCANVEIL · tools/auditar-combate-menus.mjs
 * ---------------------------------------------------------------------------
 * Encargo #4 del 7-oct-2026: combate por menús. Una acción elegida hace
 * exactamente lo elegido contra el destinatario elegido.
 *
 * En 996e073: `accionJugador` caía al enemigo más débil si el objetivo no
 * valía (inexistente, aliado, caído) y usaba siempre `ataques[0]`; el texto
 * libre atacaba al primero de la lista; no había ficha de turno, así que una
 * orden repetida o vieja actuaba.
 *
 * Aquí, contra el motor (la interfaz se mira en `regresion-app`): menú del
 * turno con ataques y enemigos reales, validación ANTES de mutar (ficha,
 * ataque, arma, objetivo), una sola acción por ficha, ficha nueva cada turno,
 * objetos, defender y huir, texto libre y vía antigua.
 *
 *   node tools/auditar-combate-menus.mjs
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
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

/** 9505: atacar a Dalwen; Berlo (guardia) se mete. Dos enemigos con nombre. */
async function pelea() {
  const m = await crearMotor({ semilla: 9505 });
  await m.empezar({ nombre: 'Sive', raza: 'valdes', clase: 'baluarte', trasfondo: 'errante', genero: 'f' });
  let tiradas = 0;
  m.bus.on('rules:roll', () => { tiradas += 1; });
  await m.jugar('ataco a Dalwen');
  const c = m.sistema('combat');
  const turno = async () => { for (let i = 0; i < 400 && !c.esperandoJugador && m.ver('combat.activo', false); i++) await espera(5); };
  await turno();
  const foto = () => JSON.stringify({
    ronda: m.ver('combat.ronda'), vida: m.ver('player.vida.actual'),
    enemigos: Object.values(c._combatientes).map((x) => [x.id, x.vida?.actual, x.vivo]),
    inventario: m.ver('inventory.objetos.porId'), tiradas, token: c.turnoToken(),
  });
  return { m, c, turno, foto, tiradas: () => tiradas };
}

console.log('\n── Menú del turno (9505: Dalwen y Berlo) ──');
await caso(async () => {
  const { c } = await pelea();
  const menu = c.accionesDelJugador();
  comprobar(menu && /^cmb-.*:\d+$/.test(menu.token), `ficha del turno: ${menu?.token}`);
  comprobar(menu.ataques.length >= 1 && menu.ataques.every((a) => a.id && a.nombre && a.dano) && menu.ataques[0].id.startsWith('arma:'), `ataques reales del equipo, con id: ${JSON.stringify(menu.ataques.map((a) => [a.id, a.nombre, a.dano, a.disponible]))}`);
  const nombres = menu.enemigos.map((e) => e.nombre).sort().join(',');
  comprobar(nombres === 'Berlo,Dalwen' && new Set(menu.enemigos.map((e) => e.id)).size === 2, `enemigos con nombre e id distintos: ${nombres}`);
});

await caso(async () => {
  // Leído en la campaña 9303: la rastreadora lleva el cuchillo en la mano
  // secundaria y el menú solo daba «Golpe 1d3» (se miraba la principal).
  const m = await crearMotor({ semilla: 9303 });
  await m.empezar({ nombre: 'Sive', raza: 'valdes', clase: 'rastreador', trasfondo: 'errante', genero: 'f' });
  await m.jugar('ataco a Xivio');
  const c = m.sistema('combat');
  for (let i = 0; i < 400 && !c.esperandoJugador; i++) await espera(5);
  const ataques = c.accionesDelJugador()?.ataques ?? [];
  comprobar(ataques.length === 1 && ataques[0].nombre === 'Cuchillo de caza' && ataques[0].itemId === m.ver('inventory.equipado.armaSecundaria'), `9303 rastreadora: el cuchillo de la otra mano es su ataque (${JSON.stringify(ataques.map((a) => a.nombre))})`);
});

console.log('\n── Validación antes de mutar: el turno sigue abierto y no se ataca a nadie ──');
const malos = [
  ['sin ficha', (c, m) => ({ tipo: 'atacar', ataqueId: m.ataques[0].id, objetivoId: m.enemigos[0].id })],
  ['ficha de otro combate', (c, m) => ({ tipo: 'atacar', token: 'cmb-viejo:1', ataqueId: m.ataques[0].id, objetivoId: m.enemigos[0].id })],
  ['objetivo inexistente', (c, m) => ({ tipo: 'atacar', token: m.token, ataqueId: m.ataques[0].id, objetivoId: 'cbt_no_existe' })],
  ['objetivo: el propio jugador', (c, m) => ({ tipo: 'atacar', token: m.token, ataqueId: m.ataques[0].id, objetivoId: 'jugador' })],
  ['sin objetivo', (c, m) => ({ tipo: 'atacar', token: m.token, ataqueId: m.ataques[0].id })],
  ['ataque inexistente', (c, m) => ({ tipo: 'atacar', token: m.token, ataqueId: 'bola_de_fuego', objetivoId: m.enemigos[0].id })],
  ['sin ataque (el «primer ataque» implícito)', (c, m) => ({ tipo: 'atacar', token: m.token, objetivoId: m.enemigos[0].id })],
  ['arma que no es la del ataque', (c, m) => ({ tipo: 'atacar', token: m.token, ataqueId: m.ataques[0].id, itemId: 'itm_otro', objetivoId: m.enemigos[0].id })],
];
for (const [que, accion] of malos) {
  await caso(async () => {
    const { c, foto } = await pelea();
    const menu = c.accionesDelJugador();
    const antes = foto();
    const r = await c.ejecutar(accion(c, menu));
    comprobar(!r.ok && foto() === antes && c.esperandoJugador, `${que}: rechazada (${r.motivo}), nada cambia y sigue su turno`, `${JSON.stringify(r)} · ${foto() === antes}`);
  });
}
await caso(async () => {
  // FIXTURE: Dalwen cae (vida 0) con el menú abierto.
  const { c, foto } = await pelea();
  const menu = c.accionesDelJugador();
  const dalwen = Object.values(c._combatientes).find((x) => x.nombre === 'Dalwen');
  c._combatientes[dalwen.id] = { ...dalwen, vivo: false, vida: { ...dalwen.vida, actual: 0 } };
  const antes = foto();
  const r = await c.ejecutar({ tipo: 'atacar', token: menu.token, ataqueId: menu.ataques[0].id, objetivoId: dalwen.id });
  comprobar(!r.ok && r.motivo === 'objetivo' && foto() === antes && c.esperandoJugador, 'FIXTURE Dalwen cae con el menú abierto: no se ataca a Berlo en su lugar', JSON.stringify(r));
  comprobar(!c.accionesDelJugador().enemigos.some((e) => e.id === dalwen.id), '  y la lista de enemigos ya no lo trae');
});
await caso(async () => {
  // FIXTURE: Dalwen huye con el menú abierto.
  const { c, foto } = await pelea();
  const menu = c.accionesDelJugador();
  const dalwen = Object.values(c._combatientes).find((x) => x.nombre === 'Dalwen');
  await c._huir(dalwen);
  const antes = foto();
  const r = await c.ejecutar({ tipo: 'atacar', token: menu.token, ataqueId: menu.ataques[0].id, objetivoId: dalwen.id });
  comprobar(!r.ok && r.motivo === 'objetivo' && foto() === antes, 'FIXTURE Dalwen huye con el menú abierto: se rechaza, sin cambiar de blanco', JSON.stringify(r));
});
await caso(async () => {
  // FIXTURE: el arma sale de la mano con el menú abierto.
  const { m, c, foto } = await pelea();
  const menu = c.accionesDelJugador();
  m.store.fijar('inventory.equipado.armaPrincipal', null);
  const antes = foto();
  const r = await c.ejecutar({ tipo: 'atacar', token: menu.token, ataqueId: menu.ataques[0].id, objetivoId: menu.enemigos[0].id });
  comprobar(!r.ok && r.motivo === 'ataque' && foto() === antes, 'FIXTURE arma fuera de la mano con el menú abierto: se revalida y se rechaza', JSON.stringify(r));
});

console.log('\n── Una acción válida: exactamente la elegida, una vez ──');
await caso(async () => {
  const { m, c, turno } = await pelea();
  const menu = c.accionesDelJugador();
  const berlo = menu.enemigos.find((e) => e.nombre === 'Berlo');
  const dalwen = menu.enemigos.find((e) => e.nombre === 'Dalwen');
  const ataques = [];
  m.bus.on('combat:attack', (d) => { if (d?.atacante?.esJugador) ataques.push(d); });
  const vDalwen = c._combatientes[dalwen.id].vida.actual;
  const accion = { tipo: 'atacar', token: menu.token, ataqueId: menu.ataques[0].id, objetivoId: berlo.id };
  const [a, b] = await Promise.all([c.ejecutar(accion), c.ejecutar(accion)]);
  comprobar([a, b].filter((x) => x.ok).length === 1 && [a, b].find((x) => !x.ok)?.motivo === 'turno', 'doble clic (dos órdenes con la misma ficha): una sola se ejecuta', JSON.stringify([a, b]));
  comprobar(ataques.length === 1 && ataques[0].objetivo?.nombre === 'Berlo' && c._combatientes[dalwen.id]?.vida.actual === vDalwen,
    'el golpe va a Berlo (el elegido); Dalwen intacto', JSON.stringify(ataques.map((x) => x.objetivo?.nombre)));
  await turno();
  if (m.ver('combat.activo', false)) {
    const nuevo = c.accionesDelJugador();
    comprobar(nuevo.token !== menu.token, `turno siguiente: ficha nueva (${nuevo.token})`);
    const r = await c.ejecutar(accion);
    comprobar(!r.ok && r.motivo === 'turno', '  la orden del turno anterior (mismo enemigo vivo) no vale: hay que elegir otra vez', JSON.stringify(r));
  }
});

console.log('\n── Defender, objetos y huir conservan su mecánica ──');
await caso(async () => {
  const { m, c } = await pelea();
  m.sistema('inventory').recibirBotin({ oro: 0, objetos: [crear('pocion_curacion')] });
  m.store.fijar('player.vida.actual', 10);
  let menu = c.accionesDelJugador();
  const pocion = menu.consumibles.find((o) => /Poción de curación/.test(o.nombre));
  const racion = menu.consumibles.find((o) => /Ración/.test(o.nombre));
  comprobar(pocion?.disponible && racion && !racion.disponible && /campamento/.test(racion.motivo), 'consumibles reales: la poción se puede; la ración no (fuera de campamento)', JSON.stringify(menu.consumibles));
  const nRacion = racion ? m.ver(`inventory.objetos.porId.${racion.id}.cantidad`) : null;
  const r1 = await c.ejecutar({ tipo: 'usar_objeto', token: menu.token, itemId: racion.id });
  comprobar(!r1.ok && m.ver(`inventory.objetos.porId.${racion.id}.cantidad`) === nRacion && c.esperandoJugador, '  la ración: rechazada sin gastarla ni perder el turno', JSON.stringify(r1));
  let curado = 0;
  m.bus.on('player:healed', (d) => { curado += d?.cantidad ?? 0; });
  const r2 = await c.ejecutar({ tipo: 'usar_objeto', token: menu.token, itemId: pocion.id });
  await espera(10);
  comprobar(r2.ok && curado > 0 && !m.ver(`inventory.objetos.porId.${pocion.id}`), '  la poción: se bebe, cura y gasta el turno (sin elegir enemigo)');
});
await caso(async () => {
  const { c } = await pelea();
  const menu = c.accionesDelJugador();
  const r = await c.ejecutar({ tipo: 'defender', token: menu.token });
  comprobar(r.ok && (c._combatientes.jugador.estados ?? []).some((e) => e.refId === 'protegido'), 'defender: protegido, sin elegir enemigo');
});

console.log('\n── Texto libre y vía antigua: no se saltan el menú ──');
await caso(async () => {
  const { c, foto } = await pelea();
  for (const frase of ['ataco a Berlo', 'le golpeo', 'ataco al más débil', 'le doy una patada en la rodilla']) {
    const antes = foto();
    const r = await c.jugadaLibre(frase);
    comprobar(r?.tipo === 'aclaracion' && r.motivo === 'ataque_por_menu' && foto() === antes && c.esperandoJugador, `texto «${frase}»: al menú, sin golpe ni tirada`, JSON.stringify(r));
  }
  const antes = foto();
  const r = await c.jugadaLibre('le lanzo arena a los ojos');
  comprobar(r?.tipo === 'aclaracion' && foto() === antes, 'maniobra sin nombrar a nadie: pregunta contra quién (no el primero de la lista)', JSON.stringify(r));
});
await caso(async () => {
  const { c, foto } = await pelea();
  const berlo = Object.values(c._combatientes).find((x) => x.nombre === 'Berlo');
  const antes = foto();
  let r = await c.accionJugador({ tipo: 'atacar' });
  comprobar(!r.ok && foto() === antes, 'vía antigua sin objetivo: rechazada (ya no hay «el más débil»)', JSON.stringify(r));
  r = await c.accionJugador({ tipo: 'atacar', objetivo: berlo.id });
  comprobar(!r.ok && r.motivo === 'ataque' && foto() === antes, 'vía antigua sin ataque elegido: rechazada (ya no hay «el primer ataque»)', JSON.stringify(r));
});

console.log('\n── Guardar y cargar en mitad de la pelea ──');
await caso(async () => {
  const { m, c, turno } = await pelea();
  const menu = c.accionesDelJugador();
  const vidas = () => JSON.stringify(Object.values(m.sistema('combat')._combatientes).map((x) => [x.nombre, x.vida.actual]));
  const antes = { vidas: vidas(), ronda: m.ver('combat.ronda') };
  const g = m.sistema('saves').guardar('6', { silencioso: true });
  const r = m.sistema('saves').cargar('6');
  await espera(20);
  const c2 = m.sistema('combat');
  const menu2 = c2.accionesDelJugador();
  comprobar(g.exito && r.exito && m.ver('combat.activo') && c2.esperandoJugador && vidas() === antes.vidas && m.ver('combat.ronda') === antes.ronda,
    'guardar en tu turno y cargar: la misma pelea (participantes, vida, ronda) y sigue siendo tu turno', JSON.stringify({ g, r }));
  comprobar(menu2?.token && menu2.token !== menu.token, `  con ficha nueva (${menu2?.token}): lo elegido a medias se descarta`);
  const viejo = await c2.ejecutar({ tipo: 'atacar', token: menu.token, ataqueId: menu.ataques[0].id, objetivoId: menu.enemigos[0].id });
  comprobar(!viejo.ok && viejo.motivo === 'turno' && vidas() === antes.vidas, '  una orden de antes de guardar no actúa (ni turno extra ni daño repetido)', JSON.stringify(viejo));
  const golpes = [];
  m.bus.on('combat:attack', (d) => { if (d?.atacante?.esJugador) golpes.push(d.objetivo?.nombre); });
  const berlo = menu2.enemigos.find((e) => e.nombre === 'Berlo');
  const nuevo = await c2.ejecutar({ tipo: 'atacar', token: menu2.token, ataqueId: menu2.ataques[0].id, objetivoId: berlo.id });
  await turno();
  comprobar(nuevo.ok && golpes.length === 1 && golpes[0] === 'Berlo', '  la orden nueva: un golpe, al elegido', JSON.stringify(golpes));
  // FIXTURE: el enemigo está actuando (no es el turno del jugador).
  if (m.ver('combat.activo')) {
    c2._esperando = false;
    const r2 = m.sistema('saves').guardar('6', { silencioso: true });
    c2._esperando = true;
    comprobar(!r2.exito && /tu turno/.test(r2.motivo), 'FIXTURE resolviendo: no se guarda a medias; se dice cuándo', JSON.stringify(r2));
  }
});
await caso(async () => {
  // Un guardado de antes: fase «combate» sin el combate (no se guardaba).
  const m = await crearMotor({ semilla: 9505 });
  await m.empezar({ nombre: 'Sive', raza: 'valdes', clase: 'baluarte', trasfondo: 'errante', genero: 'f' });
  m.store.fijar('meta.fase', 'combate');
  const saves = m.sistema('saves');
  const g = saves._construir('prueba');
  delete g.sistemas.combat;
  const r = saves.cargarDesde(g);
  comprobar(r.exito && m.ver('meta.fase') === 'exploracion' && !m.ver('combat.activo'), 'guardado viejo con fase «combate» y sin pelea: se sigue explorando (no queda atascado)', JSON.stringify({ r, fase: m.ver('meta.fase') }));
});

console.log(`\n${casos - fallos}/${casos} comprobaciones bien.`);
process.exit(fallos ? 1 : 0);
