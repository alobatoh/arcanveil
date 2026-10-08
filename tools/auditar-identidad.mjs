/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCANVEIL · tools/auditar-identidad.mjs
 * ---------------------------------------------------------------------------
 * Encargo #4 del 7-oct-2026: una acción hace exactamente lo elegido.
 *
 *   1. Objetos por identidad (ID del inventario real), no por palabra suelta:
 *      armas («con katana», «usando la katana») y comida («como raciones
 *      mágicas»).
 *   2. Destinatario del ataque, no quien se menciona («ataco a Zorvak
 *      mientras Korsa mira»).
 *
 * Fotos del estado antes y después; FIXTURE = estado preparado a mano.
 *
 *   node tools/auditar-identidad.mjs
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

async function partida(semilla = 9303, { clase = 'rastreador', fixture = false } = {}) {
  const m = await crearMotor({ semilla });
  await m.empezar({ nombre: 'Sive', raza: 'valdes', clase, trasfondo: 'errante', genero: 'f' });
  if (fixture) m.store.fijar('world.situaciones', { porId: {}, orden: [] });
  const reg = { combate: [], tiradas: 0 };
  m.bus.on('combat:request', (d) => reg.combate.push(d));
  m.bus.on('rules:roll', () => { reg.tiradas += 1; });
  const foto = () => {
    const p = m.ver('player') ?? {};
    const t = m.ver('world.tiempo') ?? {};
    return {
      reloj: `${t.diasTotales}:${t.hora}:${t.minuto}`, turno: m.ver('meta.turno'), vida: p.vida?.actual, mana: p.mana?.actual,
      inventario: JSON.stringify(m.ver('inventory.objetos.porId', {})),
      reputacion: JSON.stringify(m.ver('factions.reputacion', {})),
      actitudes: JSON.stringify(Object.values(m.ver('npcs.conocidos.porId', {}) ?? {}).map((n) => [n.refId, n.actitud])),
      agresiones: Object.keys(m.ver('world.agresiones', {}) ?? {}).length,
      situaciones: JSON.stringify(m.ver('world.situaciones', {})),
      combate: Boolean(m.ver('combat.activo', false)),
    };
  };
  async function turno(frase) {
    const antes = foto();
    const c0 = reg.combate.length; const t0 = reg.tiradas;
    const texto = visible(await m.jugar(frase));
    return { texto, antes, despues: foto(), combate: reg.combate.slice(c0), tiradas: reg.tiradas - t0 };
  }
  const dar = (refId, cantidad = 1) => m.sistema('inventory').recibirBotin({ oro: 0, objetos: [crear(refId, { cantidad })] });
  const objetos = (refId) => Object.values(m.ver('inventory.objetos.porId', {})).filter((o) => o.refId === refId);
  return { m, turno, foto, dar, objetos, reg };
}

const intacto = (r) => Object.keys(r.antes).every((k) => r.antes[k] === r.despues[k]) && !r.combate.length && r.tiradas === 0;

/* ── 1. Armas por identidad ─────────────────────────────────────────────── */

console.log('\n── 1 · Armas por identidad (semilla 9303; Sive lleva arco corto y cuchillo de caza, NO katana) ──');
for (const frase of [
  'ataco a Korsa con katana', 'ataco a Korsa usando la katana', 'ataco a Korsa utilizando una katana', 'ataco a Korsa empleando mi katana',
  'ataco a Korsa con la katana', 'ataco a Korsa con cuchillo mágico', 'ataco a Korsa usando el cuchillo mágico', 'ataco a Korsa con el cuchillo y katana',
  'ataco a Korsa con espada', 'ataco a Korsa con la espada de Xivio',
]) {
  await caso(async () => {
    const p = await partida();
    const r = await p.turno(frase);
    comprobar(intacto(r) && /^No llevas /.test(r.texto), `«${frase}»: aclara sin gastar nada (ni combate, ni tiempo, ni reputación)`, r.texto);
  });
}
for (const [frase, que] of [
  ['ataco a Korsa con el cuchillo de caza', 'nombre completo'], ['ataco a Korsa usando el cuchillo de caza', '«usando» + nombre completo'],
  ['ataco a Korsa con cuchillo', 'alias sin artículo de un único cuchillo'], ['ataco a Korsa con mi arma', '«mi arma» = lo empuñado'],
  ['ataco a Korsa con calma', 'modo'], ['ataco a Korsa con sigilo', 'modo'], ['ataco a Korsa con fuerza', 'modo'], ['ataco a Korsa con toda mi rabia', 'intensificador'],
  ['ataco a Korsa con los puños', 'cuerpo'], ['ataco a Korsa con la cuerda', 'herramienta real no bélica'],
]) {
  await caso(async () => {
    const p = await partida();
    const r = await p.turno(frase);
    comprobar(!/^No llevas|no en la mano|no sirve|¿Con cuál/.test(r.texto) && r.combate.length === 1 && r.combate[0].contra === 'Korsa', `${que}: «${frase}» ataca a Korsa`, r.texto);
  });
}
await caso(async () => {
  const p = await partida();
  p.dar('cuchillo_gastado');
  const r = await p.turno('ataco a Korsa con cuchillo');
  comprobar(intacto(r) && /¿Con cuál/.test(r.texto), 'FIXTURE dos cuchillos distintos: «con cuchillo» pregunta cuál', r.texto);
  const r2 = await p.turno('ataco a Korsa con el cuchillo gastado');
  comprobar(/no en la mano/.test(r2.texto) && intacto(r2), '  «con el cuchillo gastado» (en la mochila): no lo confunde con el de caza', r2.texto);
});
for (const [frase, que] of [['no ataco a Korsa con katana', 'negación'], ['Le digo a Korsa: «te ataco con katana»', 'cita'], ['si Korsa se mueve, le ataco usando la katana', 'condición']]) {
  await caso(async () => {
    const p = await partida();
    const r = await p.turno(frase);
    comprobar(!/No llevas katana/.test(r.texto) && !r.combate.length && r.despues.agresiones === 0, `${que}: «${frase}» ni aclara armas ni ataca`, r.texto);
  });
}
await caso(async () => {
  // Lo que se tenía y ya no: tras perderlo, ya no existe por decirlo.
  const p = await partida();
  const cuchillo = p.objetos('cuchillo_caza')[0];
  p.m.store.dispatch('inventory/retirar', { idObjeto: cuchillo.id, cantidad: 1 });
  const r = await p.turno('ataco a Korsa con el cuchillo de caza');
  comprobar(intacto(r) && /^No llevas cuchillo de caza/.test(r.texto), 'FIXTURE cuchillo retirado: «con el cuchillo de caza» aclara', r.texto);
});
await caso(async () => {
  // Guardar y cargar: el índice sale del inventario cargado, no de memoria.
  const p = await partida();
  await p.m.guardarYCargar();
  const r = await p.turno('ataco a Korsa usando la katana');
  comprobar(intacto(r) && /^No llevas katana/.test(r.texto), 'tras guardar y cargar, la katana sigue sin existir', r.texto);
  const r2 = await p.turno('ataco a Korsa con el cuchillo de caza');
  comprobar(r2.combate.length === 1, '  y el cuchillo de caza sí', r2.texto);
});

/* ── 2. Destinatario ────────────────────────────────────────────────────── */

console.log('\n── 2 · Destinatario: quién recibe el ataque, no quién se menciona (semilla 9303) ──');
for (const frase of ['ataco a Zorvak mientras Korsa mira', 'ataco a Zorvak delante de Korsa', 'ataco a Zorvak, que está junto a Korsa', 'mientras Korsa mira, ataco a Zorvak', 'ataco a Zorvak con Korsa mirando']) {
  await caso(async () => {
    const p = await partida();
    const r = await p.turno(frase);
    comprobar(intacto(r) && /No ves a Zorvak/.test(r.texto), `«${frase}»: Zorvak no está; Korsa, testigo, no recibe nada`, r.texto);
  });
}
for (const [frase, quien] of [['ataco a Korsa mientras Xivio mira', 'Korsa'], ['ataco a Xivio delante de Korsa', 'Xivio'], ['mientras Cormir mira, ataco a Korsa', 'Korsa'], ['ataco al guardia mientras Korsa mira', 'Xivio']]) {
  await caso(async () => {
    const p = await partida();
    const r = await p.turno(frase);
    comprobar(r.combate[0]?.contra === quien && r.combate[0].enemies[0].nombre === quien, `«${frase}»: el combate es contra ${quien}`, JSON.stringify(r.combate));
  });
}
for (const frase of ['Korsa dice que ataque a Zorvak', 'Le digo a Korsa: «ataco a Xivio»', 'recuerdo cuando ataqué a Korsa']) {
  await caso(async () => {
    const p = await partida();
    const r = await p.turno(frase);
    comprobar(!r.combate.length && r.despues.agresiones === 0, `«${frase}»: no es un ataque`, r.texto);
  });
}

/* ── 3. Comida por identidad ────────────────────────────────────────────── */

console.log('\n── 3 · Comida por identidad (FIXTURE: 9303, situaciones vacías, vida 10/32, campamento) ──');
async function enCampamento() {
  const p = await partida(9303, { fixture: true });
  await p.turno('acampo');
  p.m.store.fijar('player.vida.actual', 10);
  return p;
}
const raciones = (p) => p.objetos('racion_viaje').filter((o) => o.nombre === 'Ración de viaje').reduce((a, o) => a + (o.cantidad ?? 0), 0);
await caso(async () => {
  const p = await enCampamento();
  let r = await p.turno('como una ración');
  comprobar(r.despues.vida === 18 && raciones(p) === 3, '«como una ración»: +8, una ración', r.texto);
  for (const frase of ['como raciones mágicas', 'como una ración mágica', 'como el pan de elfo', 'como queso', 'me como la ración de oro']) {
    const n0 = raciones(p);
    r = await p.turno(frase);
    comprobar(intacto(r) && raciones(p) === n0 && /No llevas/.test(r.texto), `«${frase}»: aclara sin consumir ni curar`, r.texto);
  }
  r = await p.turno('como una ración de viaje');
  comprobar(r.despues.vida === 26 && raciones(p) === 2, '«como una ración de viaje» (nombre completo): sí', r.texto);
});
await caso(async () => {
  // Dos comidas distintas: lo genérico pregunta cuál, no coge la primera.
  // FIXTURE: el catálogo solo tiene una comida (la ración); se añade un queso de
  // prueba con las reglas de la ración (su refId) y otro nombre.
  const p = await enCampamento();
  p.m.store.fijar('inventory.objetos.porId.itm_fixture_queso', { ...crear('racion_viaje'), id: 'itm_fixture_queso', nombre: 'Queso curado', cantidad: 1 });
  p.m.store.fijar('inventory.objetos.orden', [...p.m.ver('inventory.objetos.orden'), 'itm_fixture_queso']);
  const r = await p.turno('como algo');
  comprobar(intacto(r) && /¿Cuál/.test(r.texto), 'FIXTURE ración y queso: «como algo» pregunta cuál', r.texto);
  const r2 = await p.turno('como el queso');
  comprobar(r2.despues.vida > r2.antes.vida && !p.m.ver('inventory.objetos.porId.itm_fixture_queso') && raciones(p) === 4, '  «como el queso»: se come el queso, no una ración', r2.texto);
});
await caso(async () => {
  const p = await enCampamento();
  p.m.store.fijar(`inventory.objetos.porId.${p.objetos('racion_viaje')[0].id}.cantidad`, 0);
  const r = await p.turno('como algo');
  comprobar(intacto(r) && /No llevas nada de comer/.test(r.texto), 'FIXTURE sin comida: «como algo» aclara', r.texto);
});

console.log(`\n${casos - fallos}/${casos} comprobaciones bien.`);
process.exit(fallos ? 1 : 0);
