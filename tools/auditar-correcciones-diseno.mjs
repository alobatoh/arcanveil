/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCANVEIL · tools/auditar-correcciones-diseno.mjs
 * ---------------------------------------------------------------------------
 * Encargo del 6-oct-2026: tres fallos y cinco decisiones de diseño.
 *
 *   A. Armas inventadas y nombres parciales («con la katana», «con el
 *      cuchillo mágico», «con el cuchillo y el hacha»).
 *   B. Duraciones no soportadas («90 segundos», «1e9 horas»).
 *   C. Blanco ausente sustituido por el único hostil («Ataco a Zorvak»).
 *   D. Civiles atacables, con consecuencias del motor.
 *   E. El reloj es la única regla de tiempo.
 *   F. Ofertas de encargos por horas, sin cortar esperas.
 *   G. Riesgo de encuentro al esperar en un sitio peligroso.
 *   H. Hambre y sed fuera; comer cura vida en un campamento.
 *
 * Fotos del estado antes y después (reloj, turno, vida, maná, fatiga,
 * hambre, sed, inventario, reputación, actitudes, agresiones, combate,
 * peticiones de combate, tiradas) y el texto entero. FIXTURE = estado
 * preparado a mano (situaciones vacías, hostiles marcados, sitios, RNG
 * forzado…), y así se dice en cada caso.
 *
 *   node tools/auditar-correcciones-diseno.mjs [--salida carpeta]
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { crearMotor } from './motor-sin-ventana.mjs';
import { crear } from '../src/inventory/Item.js';
import { migrar } from '../src/persistence/Migrations.js';
import * as Vitales from '../src/player/Vitals.js';
import * as BALANCE from '../src/config/balance.config.js';

// Importaciones tolerantes: la auditoría también corre sobre la base
// (3d44aa9), donde no existen el Calendario ni los parámetros nuevos, para
// demostrar que cada caso falla allí por el defecto y no por un import.
const Calendario = await import('../src/world/Calendario.js').catch(() => ({
  minutoAbsoluto: (t = {}) => ((t.diasTotales ?? 0) * 24 + (t.hora ?? 0)) * 60 + (t.minuto ?? 0),
  franjaDe: () => null, estacionDe: () => null, AMANECER: 5, ANOCHECER: 21, DIAS_POR_ESTACION: 28, DIAS_POR_ANO: 112,
}));
const penalizacionSupervivencia = Vitales.penalizacionSupervivencia ?? (() => ({ total: 0, desglose: [] }));
const { VITALES, SOCIAL } = BALANCE;
const OFERTAS = BALANCE.OFERTAS ?? { cadenciaHoras: 3 };
const COMIDA = BALANCE.COMIDA ?? { curaVidaFraccion: 0.25 };

const args = process.argv.slice(2);
const salida = args.includes('--salida') ? args[args.indexOf('--salida') + 1] : null;

let fallos = 0;
let casos = 0;
const transcripcion = [];
function comprobar(bien, texto, detalle = '') {
  casos += 1;
  if (bien) console.log(`OK   ${texto}`);
  else { fallos += 1; console.log(`MAL  ${texto}`); if (detalle) console.log(`     ${String(detalle).replace(/\n/g, ' | ').slice(0, 600)}`); }
}
const visible = (t) => String(t).split('\n').filter((l) => l && !l.startsWith('»')).join('\n');
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
/** Un caso que revienta cuenta como fallo y no tumba los demás. */
async function caso(fn) {
  try { await fn(); } catch (e) { comprobar(false, 'el caso revienta antes de terminar', String(e?.stack ?? e).split('\n').slice(0, 2).join(' ')); }
}

async function partida(semilla, { clase = 'rastreador', fixture = false } = {}) {
  const m = await crearMotor({ semilla });
  await m.empezar({ nombre: 'Sive', raza: 'valdes', clase, trasfondo: 'errante', genero: 'f' });
  if (fixture) m.store.fijar('world.situaciones', { porId: {}, orden: [] });
  const reg = { combate: [], tiradas: 0, ofertas: 0 };
  m.bus.on('combat:request', (d) => reg.combate.push(d));
  m.bus.on('rules:roll', () => { reg.tiradas += 1; });
  m.bus.on('quests:offered', () => { reg.ofertas += 1; });
  const foto = () => {
    const p = m.ver('player') ?? {};
    const t = m.ver('world.tiempo') ?? {};
    return {
      min: Calendario.minutoAbsoluto(t), turno: m.ver('meta.turno'), franja: t.franja, estacion: t.estacion, dia: t.dia, hora: t.hora, minuto: t.minuto,
      vida: p.vida?.actual, vidaMax: p.vida?.max, mana: p.mana?.actual, fatiga: p.fatiga, hambre: p.hambre, sed: p.sed,
      inventario: JSON.stringify(m.ver('inventory.objetos.porId', {})),
      reputacion: JSON.stringify(m.ver('factions.reputacion', {})),
      actitudes: JSON.stringify(Object.values(m.ver('npcs.conocidos.porId', {}) ?? {}).map((n) => [n.refId, n.actitud])),
      agresiones: Object.keys(m.ver('world.agresiones', {}) ?? {}).length,
      combate: Boolean(m.ver('combat.activo', false)), ronda: m.ver('combat.ronda', null),
      ubicacion: m.ver('world.ubicacion'),
    };
  };
  async function turno(frase) {
    const antes = foto();
    const c0 = reg.combate.length; const t0 = reg.tiradas; const o0 = reg.ofertas;
    const texto = visible(await m.jugar(frase));
    transcripcion.push(`[${semilla} ${clase}${fixture ? ' FIXTURE' : ''}] > ${frase}\n${texto}\n`);
    return { texto, antes, despues: foto(), combate: reg.combate.slice(c0), tiradas: reg.tiradas - t0, ofertas: reg.ofertas - o0 };
  }
  const clave = (n) => (m.ver('npcs.presentes', []) ?? []).find((id) => m.ver(`npcs.conocidos.porId.${id}.nombre`) === n);
  const dar = (refId, cantidad = 1) => m.sistema('inventory').recibirBotin({ oro: 0, objetos: [crear(refId, { cantidad })] });
  const objeto = (refId) => Object.values(m.ver('inventory.objetos.porId', {})).find((o) => o.refId === refId);
  return { m, turno, foto, clave, dar, objeto, reg };
}

/** Nada de la acción ha pasado. */
const intacto = (r) => r.despues.min === r.antes.min && r.despues.turno === r.antes.turno && r.despues.vida === r.antes.vida
  && r.despues.mana === r.antes.mana && r.despues.inventario === r.antes.inventario && r.despues.reputacion === r.antes.reputacion
  && r.despues.actitudes === r.antes.actitudes && r.despues.agresiones === r.antes.agresiones
  && r.despues.combate === r.antes.combate && !r.combate.length && r.tiradas === 0;

async function enCombate(p) {
  await p.turno('ataco a Xivio');
  const c = p.m.sistema('combat');
  for (let i = 0; i < 300 && !c.esperandoJugador; i++) await espera(10);
  return c;
}

/* ═══════════════════════════════════════════════════════════════════════════
   A · ARMAS
   ═══════════════════════════════════════════════════════════════════════════ */

console.log('\n── A · Armas inventadas y nombres parciales (semilla 9303; Sive: arco corto sin equipar, cuchillo de caza en la mano) ──');
await caso(async () => { {
  const aclaran = [
    ['ataco a Korsa con la katana', /^No llevas katana\. Di con qué quieres atacar; no se ha hecho el ataque\.$/],
    ['ataco a Korsa con el cuchillo mágico', /^No llevas cuchillo mágico\./],
    ['ataco a Korsa con el cuchillo y el hacha', /^No llevas hacha\./],
    ['ataco a Korsa con el cuchillo y la katana', /^No llevas katana\./],
    ['ataco a Korsa con el cuchillo, el arco y la katana', /^No llevas katana\. Llevas el arco corto, pero no en la mano/],
    ['ataco a Korsa con el arco', /^Llevas el arco corto, pero no en la mano/],
    ['desenvaino la katana', /^No llevas katana\. No se ha hecho nada\.$/],
    ['primero cojo la katana y luego ataco a Korsa', /^Todavía no llevas katana/],
  ];
  for (const [frase, re] of aclaran) {
    const p = await partida(9303);
    const r = await p.turno(frase);
    comprobar(intacto(r) && re.test(r.texto) && !/Intentas|atacas|Atacas/.test(r.texto), `«${frase}»: aclara sin tirada, turno, reloj, consecuencias ni combate; no afirma ningún golpe`, r.texto);
  }
  {
    const p = await partida(9303);
    p.dar('cuchillo_gastado');
    const r = await p.turno('ataco a Korsa con el cuchillo');
    comprobar(p.objeto('cuchillo_gastado') && intacto(r) && /^¿Con cuál: el cuchillo de caza o el cuchillo gastado\?/.test(r.texto), 'FIXTURE dos cuchillos (caza y gastado): «con el cuchillo» pregunta cuál', r.texto);
  }
  {
    const p = await partida(9303);
    const cuchillo = p.objeto('cuchillo_caza');
    p.m.store.fijar(`inventory.objetos.porId.${cuchillo.id}.durabilidad`, 0);
    const r = await p.turno('ataco a Korsa con el cuchillo de caza');
    comprobar(intacto(r) && /no sirve/.test(r.texto), 'FIXTURE cuchillo con durabilidad 0: no sirve, aclara', r.texto);
  }
  {
    const p = await partida(9303);
    p.m.store.fijar('inventory.equipado.armaPrincipal', p.objeto('arco_corto').id);
    const r = await p.turno('ataco a Korsa con el arco y el cuchillo');
    comprobar(!/No llevas|no en la mano|no sirve|¿Con cuál/.test(r.texto) && r.combate.length === 1 && r.combate[0].contra === 'Korsa', 'FIXTURE arco y cuchillo empuñados: dos instrumentos válidos, el ataque se hace contra Korsa', r.texto);
  }
  const siguen = [
    ['ataco a Korsa con el cuchillo de caza', 'nombre completo'],
    ['ataco a Korsa con el cuchillo', 'alias de un único cuchillo'],
    ['ataco a Korsa con calma', 'modo, no objeto'],
    ['ataco a Korsa con toda mi fuerza', 'intensificador, no objeto'],
    ['ataco a Korsa con la cuerda', 'herramienta real no bélica (regla de siempre)'],
    ['ataco a Korsa', 'sin arma nombrada'],
  ];
  for (const [frase, que] of siguen) {
    const p = await partida(9303);
    const r = await p.turno(frase);
    comprobar(!/No llevas|no en la mano|no sirve|¿Con cuál/.test(r.texto) && r.combate.length === 1 && r.combate[0].enemies[0].nombre === 'Korsa', `${que}: «${frase}» se ejecuta contra Korsa`, r.texto);
  }
  for (const [frase, que] of [['no ataco a Korsa con la katana', 'negación'], ['Le digo a Korsa: «te ataco con la katana»', 'cita'], ['si Korsa se mueve, le ataco con la katana', 'condición']]) {
    const p = await partida(9303);
    const r = await p.turno(frase);
    comprobar(!/No llevas katana/.test(r.texto) && !r.combate.length && r.despues.agresiones === 0, `${que}: «${frase}» no aclara armas, no ataca ni deja consecuencias`, r.texto);
  }
  {
    const p = await partida(9303);
    const c = await enCombate(p);
    for (const frase of ['ataco al guardia con la katana', 'ataco al guardia con el cuchillo mágico', 'ataco al guardia con el cuchillo y el hacha']) {
      const a = p.foto(); const t0 = p.reg.tiradas;
      const j = await c.jugadaLibre(frase);
      const d = p.foto();
      comprobar(j?.tipo === 'aclaracion' && a.ronda === d.ronda && a.vida === d.vida && a.inventario === d.inventario && p.reg.tiradas === t0 && c.esperandoJugador,
        `en combate, «${frase}»: aclara, misma ronda, sin tirada, sigue su turno`, JSON.stringify(j));
    }
  }
} });

/* ═══════════════════════════════════════════════════════════════════════════
   B · DURACIONES
   ═══════════════════════════════════════════════════════════════════════════ */

console.log('\n── B · Duraciones no soportadas (escena original, semilla 9303) ──');
await caso(async () => { for (const frase of ['espero 90 segundos', 'espero cinco segundos', 'espero 1e9 horas', 'espero 1e+9 horas', 'espero una hora y 90 segundos', 'espero tres lunas', 'espero 1441 minutos', 'espero 25 horas', 'espero hasta las 24:30', 'espero 1.500 minutos', 'espero 0 minutos', 'espero -2 horas', 'espero infinitas horas']) {
  const p = await partida(9303);
  const r = await p.turno(frase);
  comprobar(intacto(r) && /No ha pasado el tiempo|no en segundos|No has gastado/.test(r.texto) && !/Esperas/.test(r.texto), `«${frase}»: aclara; ni reloj, ni turno, ni nada`, r.texto);
} });
await caso(async () => { {
  const p = await partida(9303);
  const r = await p.turno('espero');
  comprobar(r.despues.min - r.antes.min === 10, '«espero»: espera simple de un turno', r.texto);
} });
await caso(async () => { for (const [hora, frase, finMin, pulsos] of [[7, 'espero dos horas', 120, 12], [7, 'espero 30 minutos', 30, 3], [7, 'espero media hora', 30, 3], [7, 'espero hora y media', 90, 9], [7, 'espero 25 minutos', 25, 3], [7, 'espero 24 horas', 1440, 144]]) {
  const p = await partida(9505, { fixture: true });
  p.m.sistema('quests')._fijarOferta({ ultimaMinuto: 10 ** 9, revisadoMinuto: 10 ** 9 });
  p.m.store.dispatch('clock/fijar', { hora, minuto: 0 });
  const r = await p.turno(frase);
  comprobar(r.despues.min - r.antes.min === finMin && r.despues.turno - r.antes.turno === pulsos && r.texto.includes(`Día ${r.despues.dia}, ${String(r.despues.hora).padStart(2, '0')}:${String(r.despues.minuto).padStart(2, '0')}`),
    `FIXTURE «${frase}»: ${finMin} min de reloj real, ${pulsos} pulsos, la hora dicha es la guardada`, `${r.despues.min - r.antes.min} min, ${r.despues.turno - r.antes.turno} pulsos · ${r.texto}`);
} });
await caso(async () => { {
  const p = await partida(9505, { fixture: true });
  p.m.sistema('quests')._fijarOferta({ ultimaMinuto: 10 ** 9, revisadoMinuto: 10 ** 9 });
  p.m.store.dispatch('clock/fijar', { hora: 23, minuto: 0 });
  const r = await p.turno('espero hasta el amanecer');
  comprobar(r.despues.dia === 2 && r.despues.hora === Calendario.AMANECER && r.despues.franja === 'alba', `FIXTURE «hasta el amanecer» desde las 23:00: día 2, ${Calendario.AMANECER}:00, alba`, r.texto);
  p.m.guardarYCargar();
  const t = p.m.ver('world.tiempo');
  comprobar(t.dia === 2 && t.hora === Calendario.AMANECER, '  tras guardar y cargar, el mismo instante');
} });

/* ═══════════════════════════════════════════════════════════════════════════
   C · BLANCO AUSENTE
   ═══════════════════════════════════════════════════════════════════════════ */

console.log('\n── C · Blanco ausente (FIXTURE: semilla 9303, situaciones vacías, Xivio hostil con refId guardia_corrupto) ──');
async function conHostiles(n) {
  const p = await partida(9303, { fixture: true });
  const xivio = p.clave('Xivio'); const berger = p.clave('Berger');
  if (n >= 1) { p.m.store.fijar(`npcs.conocidos.porId.${xivio}.hostil`, true); p.m.store.fijar(`npcs.conocidos.porId.${xivio}.refId`, 'guardia_corrupto'); }
  if (n >= 2) p.m.store.fijar(`npcs.conocidos.porId.${berger}.hostil`, true);
  return p;
}
await caso(async () => { for (const n of [0, 1, 2]) {
  for (const frase of ['Ataco a Zorvak', 'ataco a zorvak']) {
    const p = await conHostiles(n);
    const r = await p.turno(frase);
    comprobar(intacto(r) && /^No ves a Zorvak por aquí\./.test(r.texto), `${n} hostiles, «${frase}»: aclara; ni combate, ni daño, ni reputación, ni tiempo`, r.texto);
  }
} });
await caso(async () => { {
  let p = await conHostiles(1);
  let r = await p.turno('ataco al herrero');
  comprobar(intacto(r) && /^Aquí no hay ningún herrero/.test(r.texto), 'oficio ausente («al herrero»): aclara, no cambia a otro', r.texto);
  p = await conHostiles(2);
  r = await p.turno('ataco a Berger');
  const e = p.m.ver('combat.combatientes', {});
  comprobar(r.combate[0]?.contra === 'Berger' && Object.values(e).some((c) => c.nombre === 'Berger' && c.npc), 'dos hostiles: el segundo nombrado (Berger) es el de la ficha de combate', JSON.stringify(r.combate));
  p = await conHostiles(2);
  r = await p.turno('ataco');
  comprobar(intacto(r) && /^¿A cuál\?/.test(r.texto), 'dos hostiles y sin blanco: pregunta', r.texto);
  p = await conHostiles(1);
  r = await p.turno('ataco');
  comprobar(r.combate[0]?.contra === 'Xivio' && r.combate[0].enemies[0].npc, 'un hostil y sin blanco: ese (falta de nombre no es nombre ausente)', JSON.stringify(r.combate));
  p = await conHostiles(1);
  r = await p.turno('ataco a Korsa');
  comprobar(r.combate[0]?.contra === 'Korsa' && r.combate[0].enemies[0].nombre === 'Korsa' && r.combate[0].enemies[0].refId === 'civil', 'Korsa junto a Xivio hostil: el combate es contra Korsa (ficha de civil con su nombre), no contra Xivio', JSON.stringify(r.combate));
  for (const [frase, que] of [['Le digo a Xivio: «ataco a Zorvak»', 'cita'], ['no ataco a Zorvak', 'negación']]) {
    p = await conHostiles(1);
    r = await p.turno(frase);
    comprobar(!r.combate.length && r.despues.agresiones === 0, `${que}: «${frase}» no ataca a nadie`, r.texto);
  }
  p = await partida(9303);
  const c = await enCombate(p);
  const a = p.foto();
  const j = await c.jugadaLibre('ataco a Zorvak');
  const d = p.foto();
  comprobar(j?.tipo === 'aclaracion' && /Zorvak no está en esta pelea/.test(j.texto) && a.ronda === d.ronda && a.vida === d.vida && c.esperandoJugador, 'en combate, «ataco a Zorvak»: aclara, no golpea al de siempre', JSON.stringify(j));
  const ids = Object.values(p.m.ver('combat.combatientes', {})).filter((x) => x.bando === 'enemigo');
  comprobar(ids.some((x) => x.nombre === 'Xivio' && x.npc), '  y la ficha del combate de la escena real lleva a Xivio por su nombre', JSON.stringify(ids.map((x) => x.nombre)));
} });

/* ═══════════════════════════════════════════════════════════════════════════
   D · CIVILES
   ═══════════════════════════════════════════════════════════════════════════ */

console.log('\n── D · Atacar a un civil (semilla 9303, escena real con testigos) ──');
await caso(async () => { {
  const p = await partida(9303);
  const korsa = p.clave('Korsa');
  const act0 = p.m.ver(`npcs.conocidos.porId.${korsa}.actitud`);
  const rep0 = p.m.ver('factions.reputacion.guardia_valle') ?? 0;
  const r = await p.turno('ataco a Korsa con el cuchillo');
  const hecho = Object.values(p.m.ver('world.agresiones', {}))[0];
  comprobar(r.combate.length === 1 && r.combate[0].enemies[0].npc === korsa && Object.values(p.m.ver('combat.combatientes', {})).some((c) => c.nombre === 'Korsa' && c.npc === korsa),
    'el combate es contra Korsa (su referencia en la ficha del combatiente)', JSON.stringify(r.combate));
  comprobar(hecho?.victima === korsa && hecho.testigos.length >= 1 && hecho.facciones.includes('guardia_valle'), `consecuencias guardadas una vez (testigos: ${hecho?.testigos?.length}, facciones: ${hecho?.facciones})`, JSON.stringify(hecho));
  comprobar(p.m.ver(`npcs.conocidos.porId.${korsa}.actitud`) < act0 && (p.m.ver('factions.reputacion.guardia_valle') ?? 0) === rep0 + SOCIAL.reputacion.porCrimenPresenciado,
    `  actitud de Korsa baja y reputación de la guardia ${SOCIAL.reputacion.porCrimenPresenciado} (crimen presenciado), una vez`, `${act0}→${p.m.ver(`npcs.conocidos.porId.${korsa}.actitud`)} · ${rep0}→${p.m.ver('factions.reputacion.guardia_valle')}`);
  comprobar(r.combate[0].enemies.some((e) => e.nombre === 'Xivio' && e.npc), '  Xivio (guardia presente) se mete con su nombre: no se teletransporta a nadie', JSON.stringify(r.combate[0].enemies));
  const rep1 = p.m.ver('factions.reputacion.guardia_valle');
  p.m.guardarYCargar();
  comprobar(Object.keys(p.m.ver('world.agresiones', {})).length === 1 && p.m.ver('factions.reputacion.guardia_valle') === rep1, 'tras guardar y cargar: el mismo hecho, sin aplicarlo otra vez');
} });
await caso(async () => { {
  const p = await partida(9303, { fixture: true });
  const korsa = p.clave('Korsa');
  p.m.store.fijar('npcs.presentes', [korsa]);
  const rep0 = JSON.stringify(p.m.ver('factions.reputacion'));
  const r = await p.turno('ataco a Korsa');
  const hecho = Object.values(p.m.ver('world.agresiones', {}))[0];
  comprobar(hecho && !hecho.testigos.length && JSON.stringify(p.m.ver('factions.reputacion')) === rep0 && r.combate[0].enemies.length === 1 && /Nadie más lo ha visto/.test(r.texto),
    'FIXTURE sin testigos (solo Korsa): sin reputación ni guardias; solo la víctima lo sabe', `${JSON.stringify(hecho)} · ${r.texto}`);
} });
await caso(async () => { for (const [frase, que] of [['ataco a Zorvak', 'nombre ausente'], ['ataco a Korsa con la katana', 'arma ausente'], ['no ataco a Korsa', 'negación'], ['saco el cuchillo delante de Korsa', 'gesto de arma'], ['le digo a Korsa: «te voy a atacar»', 'amenaza dicha']]) {
  const p = await partida(9303);
  const r = await p.turno(frase);
  comprobar(r.despues.agresiones === 0 && r.despues.reputacion === r.antes.reputacion && !r.combate.length, `${que}: «${frase}» sin consecuencias de agresión`, r.texto);
} });

/* ═══════════════════════════════════════════════════════════════════════════
   E · EL RELOJ MANDA
   ═══════════════════════════════════════════════════════════════════════════ */

console.log('\n── E · El reloj es la única regla de tiempo ──');
await caso(async () => { {
  const p = await partida(9303);
  const clock = p.m.sistema('clock');
  const ts = p.m.sistema('time');
  comprobar([...Array(24).keys()].every((h) => clock.calcularFranja(h) === Calendario.franjaDe(h)), 'franjas: reloj y Calendario iguales en las 24 horas');
  const dias = [0, 27, 28, 55, 56, 83, 84, 111, 112, 139, 140];
  const ok = dias.every((d) => { p.m.store.dispatch('clock/fijar', { diasTotales: d }); return p.m.ver('world.tiempo.estacion') === ts.estacionActual().clave && ts.estacionActual().clave === Calendario.estacionDe(d); });
  comprobar(ok, `estaciones cada ${Calendario.DIAS_POR_ESTACION} días: reloj, TimeSystem y Calendario iguales (días ${dias.join(', ')}; año de ${Calendario.DIAS_POR_ANO})`);
  p.m.store.dispatch('clock/fijar', { diasTotales: 0, hora: 7, minuto: 0 });
  comprobar(ts.horasDeLuz() === Calendario.ANOCHECER - 7, `horas de luz a las 07:00 = anochecer del reloj (${Calendario.ANOCHECER}:00) − 7`, ts.horasDeLuz());
  p.m.store.dispatch('clock/fijar', { hora: 22 });
  comprobar(ts.horasDeLuz() === 0 && ts.esDeNoche(), 'a las 22:00: sin luz y de noche, en las dos');
  p.m.store.dispatch('clock/fijar', { hora: 23, minuto: 50, diasTotales: 27 });
  await p.turno('espero 30 minutos');
  comprobar(p.m.ver('world.tiempo.estacion') === 'estio' && p.m.ver('world.tiempo.diasTotales') === 28, 'esperar más allá de medianoche del día 27 cambia a estío (día 28)', JSON.stringify(p.m.ver('world.tiempo')));
} });
await caso(async () => { {
  const viejo = { version: 8, estado: { world: { tiempo: { dia: 31, hora: 22, minuto: 15, franja: 'manana', estacion: 'verano', diasTotales: 30 } }, quests: {}, player: { hambre: 0, sed: 0, vida: { actual: 10, max: 30 } } } };
  const r = migrar(structuredClone(viejo));
  const t = r.guardado?.estado?.world?.tiempo;
  comprobar(r.guardado?.version >= 9 && t.estacion === 'estio' && t.franja === 'noche' && t.dia === 31 && t.hora === 22 && t.minuto === 15 && t.diasTotales === 30,
    'guardado viejo (v8, «verano», franja mal): estación y franja recalculadas; día, hora, minuto y días intactos', JSON.stringify(r.guardado?.estado?.world?.tiempo));
  comprobar(Number.isFinite(r.guardado.estado.quests.oferta?.ultimaMinuto) && r.guardado.estado.player.hambre === 0 && r.guardado.estado.player.vida.actual === 10,
    '  la última oferta toma el instante del guardado; hambre y vida, tal cual', JSON.stringify(r.guardado.estado.quests));
  const dos = migrar(structuredClone(r.guardado));
  comprobar(JSON.stringify(dos.guardado.estado.world.tiempo) === JSON.stringify(t), '  idempotente: migrar otra vez no cambia nada');
} });

/* ═══════════════════════════════════════════════════════════════════════════
   F · OFERTAS POR HORAS
   ═══════════════════════════════════════════════════════════════════════════ */

console.log('\n── F · Ofertas por horas, sin cortar esperas (FIXTURE situaciones vacías) ──');
await caso(async () => { {
  const p = await partida(9303, { fixture: true });
  const q = p.m.sistema('quests');
  const ahora = () => Calendario.minutoAbsoluto(p.m.ver('world.tiempo'));
  q._fijarOferta({ ultimaMinuto: ahora() - 10_000, revisadoMinuto: ahora() - 10_000 });
  let r = await p.turno('espero dos horas');
  comprobar(r.ofertas === 0 && r.despues.min - r.antes.min === 120 && !/se te acerca/.test(r.texto), 'oferta ya elegible: una espera de 2 h no la publica ni se corta por ella', r.texto);
  const flujo = p.m.rng.flujo('narrativa');
  const original = flujo.oportunidad.bind(flujo);
  const pedidas = [];
  flujo.oportunidad = (x) => { pedidas.push(x); return true; };
  r = await p.turno('miro alrededor');
  flujo.oportunidad = original;
  comprobar(r.ofertas === 1 && pedidas.length === 1, 'RNG forzado: el turno normal siguiente hace UNA tirada y publica una oferta (no doce)', `${pedidas} · ofertas ${r.ofertas}`);
  r = await p.turno('miro alrededor');
  comprobar(r.ofertas === 0, '  y el siguiente no ofrece otra: la cadencia empieza de nuevo');
  p.m.guardarYCargar();
  r = await p.turno('miro alrededor');
  comprobar(r.ofertas === 0 && Number.isFinite(p.m.ver('quests.oferta.ultimaMinuto')), 'recargar no duplica la oferta (el instante se guarda)');
} });
await caso(async () => { {
  const p = await partida(9303, { fixture: true });
  const q = p.m.sistema('quests');
  p.m.store.dispatch('clock/fijar', { hora: 23, minuto: 0 });
  q._fijarOferta({ ultimaMinuto: Calendario.minutoAbsoluto(p.m.ver('world.tiempo')), revisadoMinuto: Calendario.minutoAbsoluto(p.m.ver('world.tiempo')) });
  p.m.store.dispatch('clock/fijar', { hora: 1, minuto: 0, diasTotales: 1, dia: 2 });
  const flujo = p.m.rng.flujo('narrativa'); const pedidas = []; const o = flujo.oportunidad.bind(flujo);
  flujo.oportunidad = (x) => { pedidas.push(x); return o(x); };
  await p.turno('miro alrededor');
  flujo.oportunidad = o;
  comprobar(!pedidas.length, `cruzar la medianoche cuenta en tiempo absoluto: 2 h desde las 23:00 < ${OFERTAS.cadenciaHoras} h, sin tirada`, JSON.stringify(pedidas));
} });
await caso(async () => { {
  const p = await partida(9303, { fixture: true });
  p.m.sistema('quests')._fijarOferta({ ultimaMinuto: -10_000, revisadoMinuto: -10_000 });
  p.m.store.fijar('npcs.presentes', []);
  const flujo = p.m.rng.flujo('narrativa'); const o = flujo.oportunidad.bind(flujo); flujo.oportunidad = () => true;
  const r = await p.turno('miro alrededor');
  flujo.oportunidad = o;
  comprobar(r.ofertas === 0, 'sin nadie delante no se inventa quien ofrezca, aunque toque');
} });

/* ═══════════════════════════════════════════════════════════════════════════
   G · RIESGO AL ESPERAR
   ═══════════════════════════════════════════════════════════════════════════ */

console.log('\n── G · Riesgo al esperar (FIXTURE: Linde del Cenizo, peligro 2, sin gente) ──');
async function enLinde() {
  const p = await partida(9303, { fixture: true });
  p.m.store.fijar('world.ubicacion', 'linde_cenizo');
  p.m.store.fijar('npcs.presentes', []);
  p.m.sistema('quests')._fijarOferta({ ultimaMinuto: 10 ** 9, revisadoMinuto: 10 ** 9 });
  return p;
}
await caso(async () => { {
  const p = await enLinde();
  const ex = p.m.sistema('exploration');
  const o = ex.tocaEncuentro.bind(ex); const probs = [];
  ex.tocaEncuentro = (pr) => { probs.push(pr); return false; };
  const r = await p.turno('espero dos horas');
  ex.tocaEncuentro = o;
  const total = 1 - probs.reduce((a, x) => a * (1 - x), 1);
  const directa = 1 - (1 - Math.min(0.35, 2 * 0.07)) ** (120 / 30);
  comprobar(r.despues.min - r.antes.min === 120 && probs.length === 12 && Math.abs(total - directa) < 1e-9, `RNG forzado sin encuentro: 2 h enteras; el riesgo de 12 pulsos es el mismo que 2 h de golpe (${total.toFixed(4)})`, `${probs.length} · ${total} vs ${directa}`);
} });
await caso(async () => { {
  const p = await enLinde();
  const ex = p.m.sistema('exploration');
  const o = ex.tocaEncuentro.bind(ex); let n = 0;
  ex.tocaEncuentro = () => { n += 1; return n === 4; };
  const r = await p.turno('espero dos horas');
  ex.tocaEncuentro = o;
  comprobar(r.despues.min - r.antes.min === 40 && /^Esperas 40 minutos\. La espera se interrumpe:/m.test(r.texto) && ex.encuentroActivo && n === 4,
    'RNG forzado en el 4.º pulso: se corta a los 40 minutos exactos, con el encuentro, y no sigue', r.texto);
} });
await caso(async () => { {
  const p = await enLinde();
  const ex = p.m.sistema('exploration'); const probs = []; const o = ex.tocaEncuentro.bind(ex);
  ex.tocaEncuentro = (pr) => { probs.push(pr); return false; };
  await p.turno('espero 25 minutos');
  ex.tocaEncuentro = o;
  const p30 = Math.min(0.35, 2 * 0.07);
  comprobar(probs.length === 3 && Math.abs(probs[2] - (1 - (1 - p30) ** (5 / 30))) < 1e-12, 'paso parcial de 5 minutos: riesgo de 5 minutos, no de 10', JSON.stringify(probs));
} });
await caso(async () => { for (const [que, prep, frase] of [['aclaración', (p) => p, 'espero un rato'], ['sitio seguro (Vado, asentamiento)', (p) => { p.m.store.fijar('world.ubicacion', 'vado_yunque'); return p; }, 'espero dos horas']]) {
  const p = prep(await enLinde());
  const ex = p.m.sistema('exploration'); let n = 0; const o = ex.tocaEncuentro.bind(ex);
  ex.tocaEncuentro = () => { n += 1; return true; };
  await p.turno(frase);
  ex.tocaEncuentro = o;
  comprobar(n === 0, `${que}: no se tira riesgo de encuentro`);
} });

/* ═══════════════════════════════════════════════════════════════════════════
   H · HAMBRE Y SED FUERA; COMER EN CAMPAMENTO
   ═══════════════════════════════════════════════════════════════════════════ */

console.log('\n── H · Hambre y sed fuera; comer cura vida en un campamento ──');
await caso(async () => { {
  const p = await partida(9303, { fixture: true });
  p.m.sistema('quests')._fijarOferta({ ultimaMinuto: 10 ** 9, revisadoMinuto: 10 ** 9 });
  const a = p.foto();
  const raciones0 = p.objeto('racion_viaje').cantidad;
  for (let i = 0; i < 100; i++) await p.m.jugar(i % 2 ? 'miro alrededor' : 'escucho');
  await p.turno('espero 24 horas');
  p.m.store.fijar('world.clima.actual', 'calorSofocante');
  await p.turno('miro alrededor');
  const d = p.foto();
  comprobar(d.hambre === a.hambre && d.sed === a.sed && p.objeto('racion_viaje').cantidad === raciones0, '100 turnos, 24 h de espera y calor: hambre y sed quietas, raciones intactas', `${a.hambre}/${a.sed} → ${d.hambre}/${d.sed}`);
  const r = await p.turno('voy a Saucedo');
  comprobar(r.despues.ubicacion === 'saucedo' && p.objeto('racion_viaje').cantidad === raciones0 && !/comida|hambre/i.test(r.texto), 'viaje de 4 h: sin consumo ni avisos de comida', r.texto);
} });
await caso(async () => { {
  const p = await partida(9303, { fixture: true });
  p.m.store.fijar('player.hambre', 0);
  p.m.store.fijar('player.sed', 0);
  const pen = penalizacionSupervivencia(p.m.ver('player'));
  comprobar(pen.total === 0 || pen.desglose.every((x) => /Agotamiento/.test(x.fuente)), 'hambre y sed a 0: ninguna penalización en las tiradas', JSON.stringify(pen));
  const r = await p.turno('descanso');
  comprobar(!/hambre|provision/i.test(r.texto) && r.despues.vida >= r.antes.vida, 'descansar sin provisiones: sin aviso de hambre', r.texto);
} });
await caso(async () => { {
  const p = await partida(9505, { fixture: true });
  const racion = () => p.objeto('racion_viaje')?.cantidad ?? 0;
  let r = await p.turno('como una ración');
  comprobar(intacto(r) && /^Comer solo te repone en un campamento/.test(r.texto), 'fuera de campamento: aclara, no gasta ni cura', r.texto);
  r = await p.turno('estoy en un campamento y como una ración');
  comprobar(r.despues.vida === r.antes.vida && racion() === 4 && !p.m.ver('world.campamento'), '«estoy en un campamento…»: ni campamento, ni comida gastada', r.texto);
  await p.turno('acampo');
  comprobar(p.m.ver('world.campamento')?.lugar === p.m.ver('world.ubicacion'), '«acampo»: campamento en el estado, en este lugar');
  r = await p.turno('como una ración');
  comprobar(intacto(r) && /vida llena/.test(r.texto), 'con la vida llena: no gasta', r.texto);
  const max = p.m.ver('player.vida.max');
  p.m.store.fijar('player.vida.actual', max - 20);
  const mana0 = p.m.ver('player.mana.actual'); const fatiga0 = p.m.ver('player.fatiga');
  r = await p.turno('como una ración');
  const cura = Math.max(1, Math.round(max * COMIDA.curaVidaFraccion));
  comprobar(r.despues.vida === Math.min(max, max - 20 + cura) && racion() === 3 && p.m.ver('player.mana.actual') === mana0, `en campamento con daño: +${cura} de vida exactos, una ración, sin maná`, r.texto);
  comprobar(Math.abs(p.m.ver('player.fatiga') - (fatiga0 - VITALES.supervivencia.fatigaPorTurno)) < 0.02, '  la fatiga sigue sus reglas (un turno de desgaste, nada más)');
  p.m.store.fijar('player.vida.actual', max - 2);
  r = await p.turno('como una ración');
  comprobar(r.despues.vida === max && racion() === 2, '  cura limitada al máximo', `${r.antes.vida}→${r.despues.vida}`);
  p.m.guardarYCargar();
  comprobar(p.m.ver('world.campamento')?.lugar === p.m.ver('world.ubicacion') && racion() === 2, 'tras guardar y cargar: el campamento y las raciones siguen');
  p.m.store.fijar(`inventory.objetos.porId.${p.objeto('racion_viaje').id}.cantidad`, 0);
  p.m.store.fijar('player.vida.actual', max - 10);
  r = await p.turno('como una ración');
  comprobar(intacto(r) && /No llevas nada de comer/.test(r.texto), 'FIXTURE cantidad 0: no se crea comida', r.texto);
  await p.turno('levanto el campamento');
  comprobar(!p.m.ver('world.campamento'), '«levanto el campamento»: desmontado');
} });
await caso(async () => { {
  const p = await partida(9505, { fixture: true });
  await p.turno('acampo');
  await p.turno('voy a Saucedo');
  comprobar(!p.m.ver('world.campamento'), 'irse del lugar deshace el campamento');
} });
await caso(async () => { {
  const p = await partida(9505, { fixture: true });
  p.dar('pocion_curacion');
  const max = p.m.ver('player.vida.max');
  p.m.store.fijar('player.vida.actual', max - 15);
  p.m.store.dispatch('inventory/consumir', { idObjeto: p.objeto('pocion_curacion').id });
  await espera(5);
  comprobar(p.m.ver('player.vida.actual') > max - 15 && !p.objeto('pocion_curacion'), 'la poción conserva su contrato: cura fuera de campamento y se gasta');
  const odre = p.objeto('odre_agua');
  p.m.store.dispatch('inventory/consumir', { idObjeto: odre.id });
  await espera(5);
  comprobar(p.objeto('odre_agua')?.cantidad === odre.cantidad, 'el odre no se gasta al usarlo (beber no es obligación)');
} });

if (salida) {
  mkdirSync(salida, { recursive: true });
  writeFileSync(join(salida, 'correcciones-diseno.txt'), transcripcion.join('\n'), 'utf8');
  console.log(`\nTranscripción en ${join(salida, 'correcciones-diseno.txt')}`);
}
console.log(`\n${casos - fallos}/${casos} comprobaciones bien.`);
process.exit(fallos ? 1 : 0);
