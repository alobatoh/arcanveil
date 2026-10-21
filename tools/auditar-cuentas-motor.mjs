#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCANVEIL · tools/auditar-cuentas-motor.mjs
 * ---------------------------------------------------------------------------
 * Las cuentas las lleva el motor, también cuando narra un modelo (B3 del
 * backlog de 2026-10-21).
 *
 * Un «Groq» de mentira y malintencionado intenta, turno a turno, cambiar
 * la partida: curarte, darte XP, objetos, oro, matar a un enemigo, cerrar
 * una misión, moverte de sitio o adelantar el reloj. Lo intenta por todas
 * las vías a la vez:
 *
 *   · en la PROSA de la narración (en español, en inglés y como pregunta),
 *   · como `proposedEffects` de CADA tipo mecánico del esquema,
 *   · con los campos del contrato antiguo (playerUpdates, newItems…),
 *   · con tipos desconocidos y con JSON roto,
 *
 * dentro y fuera de combate.
 *
 * Cómo se mide que «no cambia nada»: cada turno se juega en DOS partidas
 * idénticas (misma semilla, misma preparación, misma acción del jugador).
 * En una narra un modelo limpio; en la otra, el malicioso. El estado
 * mecánico después del turno (vida, ánima, XP, nivel, oro, inventario por
 * id, misiones, lugar, reloj, combate y combatientes, caídos, canon) tiene
 * que ser IGUAL. Si el turno cae al procedural, se compara con una tercera
 * partida narrada solo por el procedural: lo que se aplica es esa respuesta
 * y ninguna otra.
 *
 * Además: la bitácora no contiene lo que el modelo intentó colar, ni cifras
 * mecánicas que el motor no produjo; de los efectos solo entra lo narrativo
 * y con su tope; y el turno se cuenta una vez.
 *
 * Sin red, sin clave, sin gasto: el proveedor es una función en memoria.
 *
 *   node tools/auditar-cuentas-motor.mjs
 *   node tools/auditar-cuentas-motor.mjs --detalle     (las narraciones)
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { crearMotor } from './motor-sin-ventana.mjs';
import { verificar } from '../src/ai/narrador/Verificador.js';

const DETALLE = process.argv.includes('--detalle');
let fallos = 0;
let casos = 0;
function comprobar(bien, texto, detalle = '') {
  casos += 1;
  if (bien) console.log(`OK   ${texto}`);
  else {
    fallos += 1;
    console.log(`MAL  ${texto}`);
    if (detalle) console.log(`     ${String(detalle).replace(/\n/g, ' | ').slice(0, 700)}`);
  }
}

const SEMILLA = 4242;
const PJ = { nombre: 'Iselda', raza: 'valdes', clase: 'rastreador', trasfondo: 'errante', genero: 'f', lore: 'Mi hermano desapareció cruzando el paso del norte.' };
const HERIDA = 9;

/* ═══════════════════════════════════════════════════════════════════════════
   Montaje: siempre la misma partida, en el mismo punto
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * @param {Object} op
 * @param {'fuera'|'combate'} op.ctx
 * @param {'groq'|'procedural'} op.narrador
 * @param {string|null} op.contenido Lo que contesta el modelo en el turno que se prueba.
 */
async function montar({ ctx, narrador, contenido }) {
  const m = await crearMotor({ semilla: SEMILLA });
  await m.empezar(PJ);
  // Sin situación de apertura (que mete actores y tiradas propias) y con un
  // PNJ presente con el que hablar: Vervek.
  const s = m.sistema('situations');
  for (const x of s.aqui()) { s._guardar({ ...x, estado: 'desenlace' }); for (const a of Object.values(x.actores)) m.sistema('npcs').retirar(a.refId); }
  const vervek = m.sistema('npcs').introducir({ nombre: 'Vervek', rol: 'herrero', genero: 'm' });
  // Herida: así «te curas del todo» contradice el estado.
  m.store.dispatch('player/danar', { cantidad: HERIDA, origen: 'prueba' });
  if (ctx === 'combate') {
    m.bus.emit('combat:request', { enemies: [{ refId: 'lobo_ceniciento', count: 2 }] });
    for (let i = 0; i < 200 && !(m.ver('combat.activo', false) && m.sistema('combat').esperandoJugador); i++) await new Promise((r) => setTimeout(r, 10));
  }

  const dm = m.sistema('dungeonmaster');
  const groq = dm.proveedor('groq');
  const peticiones = [];
  groq._fetch = async (url, op = {}) => {
    const ok = (datos) => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => datos });
    if (/\/(?:probar|estado)$/.test(url)) return ok({ servicio: 'arcanveil-puente-groq/2', ok: true, disponible: true });
    peticiones.push(op.body ? JSON.parse(op.body) : null);
    // Una lista: una respuesta por petición (la segunda es la corrección remota).
    const r = Array.isArray(contenido) ? contenido[Math.min(peticiones.length - 1, contenido.length - 1)] : contenido;
    return ok({ choices: [{ message: { content: r ?? LIMPIO } }], usage: { total_tokens: 0 } });
  };
  groq._dormirMs = async () => {};
  if (narrador === 'groq') { await groq.probar(); groq.configurar({ consentido: true }); dm.cambiar('groq', { silencioso: true }); }
  const trazas = [];
  m.bus.on('narrador:traza', (t) => trazas.push(t));
  return { m, vervek, peticiones, trazas };
}

/** Claves que llevan la hora o un id generado: cambian entre partidas idénticas. */
const VOLATIL = /^(id|creado|creada|modificado|modificada|desde|ts|marca|fecha|instante|cuando)$/;
const sinVolatil = (x) => JSON.parse(JSON.stringify(x ?? null, (k, val) => (VOLATIL.test(k) ? undefined : val)));

/** El estado mecánico de la partida, comparable: TODO el personaje y lo que le rodea. */
function foto(m) {
  const v = (r, d) => m.ver(r, d);
  const mem = m.sistema('turns').memoria;
  // Por lo que son, no por su id: los ids llevan la hora en que se crearon
  // y cambian de una partida a otra aunque todo lo demás sea igual.
  const combatientes = v('combat.activo', false)
    ? Object.values(v('combat.combatientes', {}) ?? {}).map((c) => `${c.esJugador ? 'jugador' : c.refId ?? c.nombre}:${c.vida?.actual}/${c.vida?.max}:${c.vivo === false ? 'x' : 'v'}:${(c.estados ?? []).length}`).sort()
    : [];
  const equipado = v('inventory.equipado', {}) ?? {};
  return {
    // El personaje entero (vida, ánima, XP, nivel, oro, hambre, sed,
    // fatiga, moral, atributos, rasgos, banderas…), menos el retrato.
    personaje: sinVolatil({ ...v('player', {}), retrato: undefined }),
    inventario: Object.values(v('inventory.objetos.porId', {}) ?? {}).map((o) => `${o.refId ?? o.nombre}:${o.cantidad ?? 1}:${o.equipado ? 'e' : ''}:${o.durabilidad?.actual ?? ''}`).sort(),
    equipado: Object.keys(equipado).filter((k) => equipado[k]).sort(),
    carga: v('inventory.carga', null),
    misiones: sinVolatil(v('quests', null)),
    lugar: [v('world.ubicacion'), v('world.sublugar', null)],
    reloj: v('world.tiempo'),
    clima: v('world.clima', null),
    lugares: Object.values(v('world.localizaciones.porId', {}) ?? {}).map((l) => `${l.refId ?? l.nombre}:${l.descubierta ?? ''}:${l.visitada ?? ''}:${l.conocida ?? ''}`).sort(),
    combate: { activo: v('combat.activo', false), ronda: v('combat.ronda', null), combatientes },
    caidos: v('npcs.caidos', []),
    relaciones: sinVolatil(v('npcs.relaciones', null)),
    reputacion: sinVolatil(v('factions.reputacion', null)),
    hazanas: sinVolatil(v('hazanas.estadisticas', null)),
    grupo: sinVolatil(v('party.miembros', null)),
    canon: { registro: mem?.registroCanon?.ediciones ?? [], entidades: mem?.canon ?? [] },
  };
}
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function diferencias(a, b) {
  return Object.keys(a).filter((k) => !igual(a[k], b[k])).map((k) => `${k}: ${JSON.stringify(a[k]).slice(0, 120)} → ${JSON.stringify(b[k]).slice(0, 120)}`);
}

/** Juega el turno que se prueba y devuelve lo que hace falta para juzgarlo. */
async function turno({ ctx, narrador, contenido, accion }) {
  const x = await montar({ ctx, narrador, contenido });
  const antes = foto(x.m);
  const turno0 = x.m.ver('meta.turno', 0);
  const e0 = x.m.entradas().length;
  await x.m.jugar(accion);
  const nuevas = x.m.entradas().slice(e0);
  return {
    ...x, antes, despues: foto(x.m), turnos: x.m.ver('meta.turno', 0) - turno0,
    narracion: nuevas.filter((e) => e.voz !== 'player' && e.voz !== 'jugador' && e.voz !== 'roll' && e.voz !== 'tirada').map((e) => e.texto).join('\n'),
    traza: x.trazas.at(-1) ?? null,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   El modelo: limpio y malicioso
   ═══════════════════════════════════════════════════════════════════════════ */

const PROSA_LIMPIA = 'Vervek sigue a lo suyo junto a la fragua, sin prisa.\nEl río baja tranquilo bajo el puente de piedra.\nUn perro ladra a lo lejos y vuelve a callar.';
const LIMPIO = JSON.stringify({ story: PROSA_LIMPIA, pregunta: '¿Qué haces?', choices: [{ label: 'Seguir', intent: 'custom', risk: 'low' }], proposedEffects: [], mood: 'tranquilo' });
const PROSA_LIMPIA_COMBATE = 'Los dos lobos cenicientos rondan sin perderte de vista.\nEl polvo del camino se levanta con cada paso.\nNadie más se acerca.';

/** Todos los tipos mecánicos del esquema, como propuestas. */
function efectosMecanicos(vervek) {
  return [
    { tipo: 'oro', datos: { delta: 20 }, razon: 'recompensa', evidencia: 'narración' },
    { tipo: 'vida', datos: { delta: 50 }, razon: 'curación', evidencia: 'narración' },
    { tipo: 'experiencia', datos: { delta: 100 }, razon: 'hazaña', evidencia: 'narración' },
    { tipo: 'objeto', datos: { nombre: 'Espada larga', refId: 'espada_larga' }, razon: 'hallazgo', evidencia: 'narración' },
    { tipo: 'mision', datos: { action: 'complete', title: 'El paso del norte' }, razon: 'cumplida', evidencia: 'narración' },
    { tipo: 'combate', datos: { start: false, end: true, victoria: true }, razon: 'el lobo muere', evidencia: 'narración' },
    { tipo: 'tiempo', datos: { horas: 3 }, razon: 'pasan tres horas', evidencia: 'narración' },
    { tipo: 'lugar', datos: { refId: 'saucedo', nombre: 'Saucedo' }, razon: 'apareces allí', evidencia: 'narración' },
    { tipo: 'canon', datos: { texto: 'Iselda es inmortal' }, razon: 'x', evidencia: 'y' },
    // Desconocidos o disfrazados.
    { tipo: 'nivel', datos: { nivel: 2 }, razon: 'sube', evidencia: 'narración' },
    { tipo: 'curacion', datos: { total: true }, razon: 'cura', evidencia: 'narración' },
    { tipo: 'Vida', datos: { delta: 50 }, razon: 'mayúsculas', evidencia: 'narración' },
    { tipo: '', datos: { delta: 50 }, razon: 'sin tipo', evidencia: 'narración' },
    { datos: { delta: 50 }, razon: 'sin campo tipo', evidencia: 'narración' },
    // Narrativos abusados: actitud enorme, PNJ que no aparece en la prosa.
    { tipo: 'actitud', datos: { refId: vervek.refId, delta: 99 }, razon: 'le cae bien', evidencia: 'charla' },
    { tipo: 'pnj_nuevo', datos: { nombre: 'Fantasmo', rol: 'guardia' }, razon: 'entra', evidencia: 'narración' },
    // Un elemento de escena que mete oro: no aparece en la narración. («cien»
    // está DENTRO de «cenicientos»: buscando trozos de palabra, entraba.)
    { tipo: 'elemento_escena', datos: { texto: 'un cofre con cien monedas de oro' }, razon: 'se ve', evidencia: 'narración' },
  ];
}
/** Los campos del contrato antiguo, todos a la vez (en la forma que acepta el esquema). */
const LEGADO = {
  playerUpdates: { hp: { delta: 50 }, mana: { delta: 10 }, gold: { delta: 20 }, xp: { delta: 100 }, hunger: { delta: -30 }, thirst: { delta: -30 }, fatigue: { delta: 30 }, morale: { delta: 30 }, flags: { inmortal: true } },
  newItems: [{ nombre: 'Espada larga' }, { nombre: 'Poción de curación', cantidad: 3 }],
  quests: [{ action: 'complete', title: 'El paso del norte' }],
  combat: { start: true, enemies: [{ refId: 'lobo_ceniciento', count: 3 }] },
  // Minutos, como lo lee el esquema (un objeto `{horas: 3}` se queda en 0 y no probaría nada).
  timeAdvance: 600,
  location: { refId: 'saucedo', nombre: 'Saucedo' },
  events: [
    { type: 'location', refId: 'saucedo' }, { type: 'time', minutos: 600 }, { type: 'npc_talk', refId: 'vervek' },
    { type: 'discovery', refId: 'saucedo' }, { type: 'faction', refId: 'guardia', delta: 50 }, { type: 'container', items: ['espada_larga'] },
  ],
  npcs: [{ nombre: 'Fantasma', rol: 'guardia' }],
  npcMemory: [{ refId: 'vervek', texto: 'Le regaló cien monedas.' }],
};

function malicioso({ prosa, base, vervek, roto = false, soloPrudente = false }) {
  const story = `${base}\n${prosa.join('\n')}`;
  if (roto) {
    // Un rescate de prosa: lo que sobrevive es texto, con un JSON roto detrás.
    return `${story} {"proposedEffects":[{"tipo":"vida","datos":{"delta":50}},{"tipo":"objeto","datos":{"nombre":"Espada larga"`;
  }
  return JSON.stringify({ story, pregunta: '¿Qué haces?', choices: [{ label: 'Seguir', intent: 'custom', risk: 'low' }],
    proposedEffects: soloPrudente ? [] : efectosMecanicos(vervek), ...(soloPrudente ? {} : LEGADO), mood: 'tenso' });
}

/* ═══════════════════════════════════════════════════════════════════════════
   La batería
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Cada intento, con sus variantes. `marca` es lo que NO puede llegar a la
 * bitácora (comparado sin mayúsculas ni acentos).
 */
const INTENTOS = [
  { id: 'cura', es: 'Te curas del todo.', en: 'You are fully healed.', q: '¿Te curas del todo?' },
  { id: 'dano', es: 'Le haces 50 de daño y cae.', en: 'You deal 50 damage and it falls.', q: '¿Le haces 50 de daño?' },
  { id: 'muere', es: 'El lobo muere.', en: 'The wolf dies.', q: '¿El lobo muere?' },
  { id: 'nivel', es: 'Subes al nivel 2.', en: 'You level up to level 2.', q: '¿Subes al nivel 2?' },
  { id: 'xp', es: 'Ganas 100 XP.', en: 'You gain 100 XP.', q: '¿Ganas 100 XP?' },
  { id: 'objeto', es: 'Encuentras una espada larga.', en: 'You find a longsword.', q: '¿Encuentras una espada larga?' },
  { id: 'oro', es: 'Recibes veinte monedas de oro.', en: 'You receive twenty gold coins.', q: '¿Recibes veinte monedas de oro?' },
  { id: 'mision', es: 'Has completado la misión.', en: 'You have completed the quest.', q: '¿Has completado la misión?' },
  { id: 'lugar', es: 'Apareces en Saucedo.', en: 'You appear in Saucedo.', q: '¿Apareces en Saucedo?' },
  { id: 'tiempo', es: 'Pasan tres horas.', en: 'Three hours pass.', q: '¿Pasan tres horas?' },
  { id: 'vida', es: 'Tu herida no era grave: sigues con toda la vida.', en: 'Your wound was not serious: you still have all your health.', q: '¿Tu herida no era grave y sigues con toda la vida?' },
];

const llano = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const contiene = (texto, marca) => llano(texto).includes(llano(marca).replace(/[¿?.]+$/u, '').replace(/^¿/u, ''));

// Controles: el mismo turno con el modelo limpio y con el procedural, una vez por contexto y acción.
const ACCIONES = { fuera: 'le pregunto a Vervek por el camino', combate: 'le grito a los lobos que se marchen' };
const controles = {};
for (const ctx of ['fuera', 'combate']) {
  controles[ctx] = {
    limpio: await turno({ ctx, narrador: 'groq', contenido: JSON.stringify({ ...JSON.parse(LIMPIO), story: ctx === 'combate' ? PROSA_LIMPIA_COMBATE : PROSA_LIMPIA }), accion: ACCIONES[ctx] }),
    procedural: await turno({ ctx, narrador: 'procedural', contenido: null, accion: ACCIONES[ctx] }),
    repetido: await turno({ ctx, narrador: 'groq', contenido: JSON.stringify({ ...JSON.parse(LIMPIO), story: ctx === 'combate' ? PROSA_LIMPIA_COMBATE : PROSA_LIMPIA }), accion: ACCIONES[ctx] }),
  };
}

console.log('\n── 0. El banco de pruebas es fiable ──');
for (const ctx of ['fuera', 'combate']) {
  const c = controles[ctx];
  comprobar(igual(c.limpio.despues, c.repetido.despues) && igual(c.limpio.antes, c.procedural.antes),
    `${ctx}: dos partidas con la misma semilla llegan al mismo estado (sin esto, comparar no prueba nada)`, diferencias(c.limpio.despues, c.repetido.despues).join(' · '));
  comprobar(c.limpio.peticiones.length === 1 && c.limpio.traza?.final === 'groq' && c.limpio.turnos === 1,
    `${ctx}: el modelo limpio narra el turno (1 petición, sin caer al procedural, 1 turno)`, JSON.stringify({ peticiones: c.limpio.peticiones.length, traza: c.limpio.traza, turnos: c.limpio.turnos }));
  comprobar(c.limpio.antes.personaje.vida.actual <= c.limpio.antes.personaje.vida.max - HERIDA, `${ctx}: el personaje empieza herido (${c.limpio.antes.personaje.vida.actual}/${c.limpio.antes.personaje.vida.max}), para que «te curas del todo» contradiga el estado`);
}
comprobar(controles.combate.limpio.antes.combate.activo && controles.combate.limpio.antes.combate.combatientes.length >= 3, 'combate: hay combate activo con dos lobos y el personaje', JSON.stringify(controles.combate.limpio.antes.combate));
const lugares = Object.values(controles.fuera.limpio.m.ver('world.localizaciones.porId', {}) ?? {}).map((l) => l?.nombre);
comprobar(lugares.includes('Saucedo') && controles.fuera.limpio.antes.lugar[0] !== 'saucedo', 'Saucedo es un lugar conocido y no es donde está el personaje');

/** Juzga un turno malicioso contra sus controles. */
async function probar({ id, via, ctx, prosa, marcas, roto = false, soloPrudente = false, correccion = null }) {
  const c = controles[ctx];
  const base = ctx === 'combate' ? PROSA_LIMPIA_COMBATE : PROSA_LIMPIA;
  const primera = malicioso({ prosa, base, vervek: c.limpio.vervek, roto, soloPrudente });
  const contenido = correccion ? [primera, malicioso({ prosa: correccion, base, vervek: c.limpio.vervek })] : primera;
  const r = await turno({ ctx, narrador: 'groq', contenido, accion: ACCIONES[ctx] });
  const cayo = r.traza?.final === 'procedural';
  const referencia = cayo ? c.procedural : c.limpio;
  const fugas = diferencias(referencia.despues, r.despues);
  const coladas = marcas.filter((mk) => contiene(r.narracion, mk));
  const aceptados = (r.traza?.aplicado ?? []);
  const soloNarrativo = aceptados.every((a) => /^(?:actitud|recuerdo|escena|pnj|pista|nota)\b/.test(a));
  const actitud = aceptados.map((a) => a.match(/^actitud \S+ ([+-]?\d+)/)?.[1]).filter(Boolean).map(Number);
  const fantasma = aceptados.some((a) => /Fantasm|cofre/.test(a));
  if (DETALLE) console.log(`     [${ctx}/${id}/${via}] ${cayo ? '(procedural) ' : ''}${r.narracion.replace(/\n/g, ' | ')}`);
  comprobar(!fugas.length && r.turnos === 1 && !coladas.length && soloNarrativo && actitud.every((d) => Math.abs(d) <= 10) && !fantasma
      && (!cayo || r.narracion === c.procedural.narracion),
    `${ctx} · ${id} · ${via}: estado intacto${cayo ? ' (cae al procedural y se aplica solo su respuesta)' : ''}, nada colado en la bitácora, 1 turno, solo efectos narrativos con tope`,
    JSON.stringify({ fugas, coladas, turnos: r.turnos, aceptados, cayo, narracion: r.narracion.slice(0, 300) }));
  return { r, cayo };
}

console.log('\n── 1. Cada intento, por todas las vías a la vez, dentro y fuera de combate ──');
const resumen = { turnos: 0, caidas: 0, porVia: {} };
for (const ctx of ['fuera', 'combate']) {
  for (const it of INTENTOS) {
    for (const [via, frase] of [['español', it.es], ['inglés', it.en], ['pregunta', it.q]]) {
      const { cayo } = await probar({ id: it.id, via, ctx, prosa: [frase], marcas: [frase] });
      resumen.turnos += 1; resumen.caidas += cayo ? 1 : 0; resumen.porVia[via] = (resumen.porVia[via] ?? 0) + 1;
    }
  }
}

console.log('\n── 2. Variantes de forma ──');
// Todo a la vez: la prosa ya no se sostiene y el turno cae al procedural.
const todas = INTENTOS.map((it) => it.es);
const t2 = await probar({ id: 'todo-a-la-vez', via: 'prosa + efectos + legado', ctx: 'fuera', prosa: todas, marcas: todas });
comprobar(t2.cayo, 'con los once intentos en la prosa, el turno no se sostiene y lo narra el procedural sobre la misma petición');
for (const ctx of ['fuera', 'combate']) {
  await probar({ id: 'json-roto', via: 'rescate de prosa con JSON roto', ctx, prosa: [INTENTOS[0].es, INTENTOS[5].es], marcas: [INTENTOS[0].es, INTENTOS[5].es], roto: true });
  await probar({ id: 'solo-efectos', via: 'efectos y legado sin prosa', ctx, prosa: [], marcas: [] });
  await probar({ id: 'solo-prosa', via: 'prosa sin efectos', ctx, prosa: [INTENTOS[1].es, INTENTOS[6].es], marcas: [INTENTOS[1].es, INTENTOS[6].es], soloPrudente: true });
  // En boca de un PNJ: también es mentira sobre el personaje.
  const cita = 'Vervek: «Ya estás curada del todo, y te has ganado 100 XP.»';
  await probar({ id: 'en-boca-de-un-pnj', via: 'cita de un PNJ', ctx, prosa: [cita], marcas: ['curada del todo', '100 XP'] });
  // Otras redacciones de lo mismo.
  const otras = ['Matas al lobo de un tajo.', 'Tus heridas sanan por completo.', 'Ahora llevas una espada larga.', 'Horas después, el sol se pone.'];
  for (const f of otras) await probar({ id: 'otra-redaccion', via: `«${f}»`, ctx, prosa: [f], marcas: [f] });
}
// La corrección remota: la primera respuesta no se sostiene (tres de seis
// frases inventadas) y se pide UNA corrección; el modelo la devuelve con la
// trampa reformulada. Ni la primera ni la segunda entran.
{
  const malas = [INTENTOS[0].es, INTENTOS[4].es, INTENTOS[5].es, 'Recibes veinte monedas de oro.'];
  const t = await probar({ id: 'correccion-remota', via: 'la corrección trae la trampa reformulada', ctx: 'fuera', prosa: malas,
    marcas: [...malas, 'Recuperas toda tu salud', 'te llevas la espada'], correccion: ['Recuperas toda tu salud.', 'Ganas 100 puntos de XP.', 'Te llevas la espada larga.', 'El encargo queda resuelto.'] });
  comprobar(t.r.peticiones.length === 2, 'se pidió una sola corrección (2 peticiones en el turno)', `peticiones: ${t.r.peticiones.length}`);
}

/* ═══════════════════════════════════════════════════════════════════════════
   3. La regla de cifras (Verificador, sin motor)
   ═══════════════════════════════════════════════════════════════════════════ */

console.log('\n── 3. Cifras mecánicas: las inventadas fuera, las del motor dentro ──');
const base = { jugador: 'Iselda', texto: 'miro alrededor', presentes: [{ nombre: 'Vervek', vivo: true }], lugar: 'Vado del Yunque', lugares: ['Vado del Yunque', 'Saucedo'], franja: 'manana' };
// Las cuentas como las da `cuentasDelMotor`: el estado y lo que el motor
// escribió este turno (`turno`: aquí, un golpe de 6).
const cuentas = { vida: { actual: 23, max: 32 }, mana: { actual: 16, max: 16 }, xp: 40, nivel: 1, oro: 33, cantidades: [3], combatientes: [{ nombre: 'Lobo ceniciento', actual: 7, max: 14 }], turno: [6] };
const conCuentas = (extra = {}) => ({ ...base, cuentas, ...extra });
const problemas = (frase, extra) => verificar(frase, conCuentas(extra)).map((p) => p.tipo);
const fuera = [
  ['Pierdes 18 de vida.', 'vida que el motor no ha restado'],
  ['Ganas 50 XP.', 'XP que no ha dado'],
  ['Te quedan 5 pociones.', 'cantidad de objetos que no es la del inventario'],
  ['Al lobo le quedan 2 puntos de vida.', 'vida de un enemigo que no es la suya'],
  ['Recibes 12 monedas.', 'oro que no ha movido'],
  ['You lose 18 health.', 'en inglés'],
  ['Subes al nivel 3.', 'nivel que no es el del personaje'],
];
for (const [frase, que] of fuera) comprobar(problemas(frase).some((t) => /cifra_inventada|oro_inventado/.test(t)), `fuera: «${frase}» (${que})`, problemas(frase).join(','));
const dentro = [
  ['Te quedan 23 puntos de vida.', 'la vida que de verdad tiene'],
  ['Al lobo le quedan 7 puntos de vida.', 'la del lobo, según el motor'],
  ['Le haces 6 de daño.', 'el daño que el motor resolvió este turno'],
  ['Llevas 3 pociones en la bolsa.', 'las que hay en el inventario'],
  ['Los dos lobos te rodean despacio.', 'cantidad de escena, no mecánica'],
  ['Vervek tarda tres golpes en enderezar la hoja.', 'número sin unidad mecánica'],
];
for (const [frase, que] of dentro) comprobar(!problemas(frase).length, `dentro: «${frase}» (${que})`, problemas(frase).join(','));
// Afirmaciones sin cifra, según el estado.
comprobar(problemas('Te curas del todo.').includes('mecanica_inventada'), 'herido: «te curas del todo» contradice el estado');
comprobar(!problemas('Sigues con toda la vida.', { cuentas: { ...cuentas, vida: { actual: 32, max: 32 } } }).length, 'con la vida llena, «sigues con toda la vida» es verdad y se queda');
comprobar(problemas('El lobo muere.').includes('mecanica_inventada') && !problemas('El lobo ceniciento muere.', { caidos: ['Lobo ceniciento'] }).length, '«el lobo muere» solo si el motor lo ha dejado caído');
comprobar(problemas('Pasan tres horas.').includes('mecanica_inventada') && !problemas('Pasan tres horas.', { texto: 'espero tres horas' }).length, '«pasan tres horas» solo si el jugador ha esperado');
comprobar(!problemas('Encuentras huellas frescas junto al agua.').length, 'una pista («encuentras huellas») no es un objeto');

// Redacciones que la primera versión del detector dejaba pasar (revisión).
const huecos = [
  'Matas al lobo de un tajo.', 'El lobo cae sin vida.', 'El lobo yace muerto a tus pies.', 'El lobo murió al instante.', 'Acabas con el lobo.',
  'You kill the wolf.', 'The wolf is slain.', 'Tu herida se cierra y recuperas las fuerzas.', 'Tus heridas sanan por completo.',
  'Te encuentras perfectamente, sin un rasguño.', 'Ganas 100 puntos de XP.', 'Alcanzas el tercer nivel.', 'La misión ha terminado.',
  'El encargo queda resuelto.', 'Horas después, el sol se pone.', 'Al día siguiente, partes.', 'Te plantas en Saucedo.',
  'Te llevas la espada larga.', 'Te guardas la espada larga.', 'Ahora llevas una espada larga.',
  'Vervek: «Ya estás curada del todo, y te has ganado 100 XP.»',
];
for (const f of huecos) comprobar(problemas(f).length > 0, `se quita: «${f}»`, problemas(f).join(','));
// Las cifras del jugador y las de una tirada no hacen verdad una cuenta.
comprobar(problemas('Ganas 100 XP.', { texto: 'quiero 100 XP y 500 monedas' }).length > 0 && problemas('Te quedan 500 monedas.', { texto: 'quiero 100 XP y 500 monedas' }).length > 0,
  'lo que pide el jugador («quiero 100 XP y 500 monedas») no hace verdad «ganas 100 XP» ni «te quedan 500 monedas»');

// Frases normales de un narrador que NO se pueden quitar (falsos positivos de la revisión).
const normales = [
  'El viejo cuenta que aquí muere la gente de frío.', 'La tarde muere sobre el río.', 'La luz muere detrás de los montes.',
  'El fuego muere poco a poco en la fragua.', 'La conversación muere ahí.', 'Dicen que el pozo está muerto desde hace años.',
  'El herrero pasa horas mirando el río.', 'Vervek pasa días sin dormir, dicen.', 'El carro está como nuevo.',
  'La espada queda como nueva tras el afilado.', 'Te quedan dos largos días de camino.', 'Te quedan dos opciones.',
  'A la aldea le quedan cuatro casas en pie.', 'Ofrecen cien monedas por la cabeza del bandido.', 'El mendigo cuenta tres monedas en la palma.',
  'Vervek cobra diez monedas por afilar una hoja.', 'Dos flechas silban junto a tu oreja.', 'El arquero lleva veinte flechas en la aljaba.',
  'El río sube al nivel dos del puente.', 'El viejo cuenta que aquí murió su hermano.', 'Pasan los carros.', 'Te quedan dos días de camino.',
  'Encuentras la puerta abierta.', 'La herida ya no sangra.', 'Respiras hondo y recuperas el aliento.',
  'Vervek tiene cincuenta años de experiencia en la forja.', 'Dicen que hace tres días pasó por aquí un mercader.', 'You find the door open.',
];
for (const f of normales) comprobar(!problemas(f).length, `se queda: «${f}»`, problemas(f).join(','));
// Lo que ya es tuyo, o lo que el motor acaba de dar, no es un objeto inventado.
comprobar(!problemas('Coges el mapa que llevas en la bolsa y lo despliegas.', { cuentas: { ...cuentas, objetos: ['Mapa de la comarca'] } }).length, 'coger lo que ya llevas no es un objeto inventado');
comprobar(!problemas('Encuentras una daga entre las cenizas.', { cuentas: { ...cuentas, textoTurno: 'Has obtenido: Daga oxidada.' } }).length, 'encontrar lo que el motor acaba de dar este turno no es invento');
comprobar(!problemas('Encuentras una daga entre las cenizas.', { hallazgo: true }).length && problemas('Encuentras una daga entre las cenizas.').length > 0, '«encuentras una daga» vale si el motor resolvió un hallazgo; si no, se quita');
comprobar(!problemas('Pasan dos horas.', { texto: 'me siento junto al fuego hasta que anochezca' }).length, 'si el jugador deja pasar el tiempo («hasta que anochezca»), «pasan dos horas» se queda');

/* ═══════════════════════════════════════════════════════════════════════════
   4. La interfaz enseña la cifra real
   ═══════════════════════════════════════════════════════════════════════════ */

console.log('\n── 4. La cifra del daño la pone el motor, no la prosa ──');
// El evento que pinta el número sobre el luchador (`app.js`, `combat:attack`)
// trae el daño resuelto por el motor; la narración no lo alimenta.
{
  const x = await montar({ ctx: 'combate', narrador: 'groq', contenido: malicioso({ prosa: ['Le haces 50 de daño y cae.'], base: PROSA_LIMPIA_COMBATE, vervek: { refId: 'x' } }) });
  const golpes = [];
  x.m.bus.on('combat:attack', (g) => golpes.push(g));
  // Primero el modelo narra su «50 de daño» en un turno de verdad: no llega.
  const e0 = x.m.entradas().length;
  await x.m.jugar(ACCIONES.combate);
  const narrado = x.m.entradas().slice(e0).map((e) => e.texto).join(' ');
  comprobar(x.peticiones.length >= 1 && !/50 de da/i.test(narrado), 'en combate, el «50 de daño» que narra el modelo no llega a la bitácora', narrado.slice(0, 300));
  const combate = x.m.sistema('combat');
  // Se ataca hasta que un golpe acierte (un fallo no dice nada de la cifra).
  // Atacar exige ataque y objetivo (el menú por etapas): el primero que ofrece la ficha del turno.
  // Una ronda: el personaje ataca y los lobos responden. Cada golpe que
  // acierta lleva su cifra (la que pinta la interfaz); la suma de los que
  // recibe el personaje tiene que ser la vida que de verdad pierde.
  let medida = null;
  for (let ronda = 0; ronda < 8 && !medida && x.m.ver('combat.activo', false); ronda++) {
    for (let i = 0; i < 200 && !combate.esperandoJugador && x.m.ver('combat.activo', false); i++) await new Promise((r) => setTimeout(r, 10));
    const ficha = combate.accionesDelJugador();
    const enemigo = ficha?.enemigos?.find((e) => e.vida > 0);
    if (!enemigo) break;
    const vida0 = x.m.ver('player.vida.actual');
    const n0 = golpes.length;
    await combate.accionJugador({ tipo: 'atacar', objetivo: enemigo.id, ataqueId: (ficha.ataques ?? []).find((a) => a.disponible)?.id });
    const recibidos = golpes.slice(n0).filter((g) => g.objetivo?.esJugador && (g.dano?.total ?? 0) > 0).map((g) => g.dano.total);
    if (recibidos.length) medida = { recibidos, vida0, vida1: x.m.ver('player.vida.actual') };
  }
  const suma = (medida?.recibidos ?? []).reduce((a, b) => a + b, 0);
  comprobar(medida && !medida.recibidos.includes(50) && (medida.vida0 - Math.max(0, medida.vida1) === Math.min(medida.vida0, suma)),
    `las cifras de daño que pinta la interfaz son las que restó el motor (golpes ${medida?.recibidos?.join(' + ') ?? 'ninguno'}: vida ${medida?.vida0}→${medida?.vida1}), no el «50» de la prosa`, JSON.stringify(medida));
}

console.log(`\n${resumen.turnos} turnos maliciosos (${INTENTOS.length} intentos × 3 formas × 2 contextos), ${resumen.caidas} cayeron al procedural.`);
console.log(`${casos - fallos}/${casos} comprobaciones ${fallos ? 'con fallos' : 'correctas'}`);
process.exit(fallos ? 1 : 0);
