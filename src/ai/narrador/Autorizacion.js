/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCANVEIL · ai/narrador/Autorizacion.js
 * ---------------------------------------------------------------------------
 * Qué de lo que propone un modelo puede cambiar la partida.
 *
 * Un modelo de lenguaje no toca el estado. Propone, y aquí se decide contra
 * una política fija:
 *
 *   · Lo MECÁNICO es de su sistema, siempre: oro, vida, experiencia,
 *     objetos, misiones aceptadas o cumplidas, combate, tiempo, lugar.
 *     Se rechaza aunque venga bien justificado; si hace falta, lo decide el
 *     sistema dueño por su propia vía (una compra, una tirada, un viaje).
 *   · Lo NARRATIVO entra con límites y con evidencia: cuánto cambia la
 *     actitud de un PNJ presente, qué recordará, un elemento de escena que
 *     describe, alguien de fondo que entra, una pista.
 *   · El canon no se toca: solo el jugador lo cambia, de forma deliberada y
 *     fuera de la ficción (lo registra el motor, no el modelo).
 *
 * También recoge los campos del contrato antiguo (playerUpdates, newItems,
 * quests, combat…) que un modelo pueda seguir mandando: se convierten en
 * propuestas y pasan por la misma política, de modo que no hay atajo.
 *
 * Funciones puras. El que llama aplica lo aceptado a través de cada sistema.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { sinAcentos } from '../../utils/text.js';
import { pareceSecreto } from './Verificador.js';

const llano = (t) => sinAcentos(String(t ?? '').toLowerCase());

/** Tipos que el motor nunca acepta de un modelo, y de quién son. */
export const DEL_MOTOR = Object.freeze({
  oro: 'la economía', vida: 'las reglas', experiencia: 'la progresión', objeto: 'el inventario',
  mision: 'las misiones', combate: 'el combate', tiempo: 'el reloj', lugar: 'los viajes', canon: 'el jugador',
});

/** Los que se aceptan con límites. */
export const NARRATIVOS = Object.freeze(['actitud', 'recuerdo_pnj', 'elemento_escena', 'pnj_nuevo', 'pista']);

/** Personas: un elemento de escena no puede meter gente (para eso, pnj_nuevo). */
const PERSONA = /\b(?:hombre|mujer|nino|nina|guardia|soldado|carretero|mercader|viejo|vieja|chico|chica|muchach\w|anciano|anciana|figura|alguien)\b/;

/**
 * Los campos del contrato antiguo, como propuestas.
 *
 * @param {Object} r Respuesta validada.
 * @returns {Array<Object>}
 */
export function propuestasDe(r) {
  const p = [...(r.proposedEffects ?? [])];
  const u = r.playerUpdates ?? {};
  // El esquema rellena con ceros lo que no viene: eso no es una propuesta.
  const cambia = (v) => (typeof v === 'number' ? v !== 0 : v && typeof v === 'object' ? ('delta' in v ? Number(v.delta) !== 0 : Object.keys(v).length > 0) : Boolean(v));
  if (cambia(u.gold)) p.push({ tipo: 'oro', datos: u.gold, razon: 'playerUpdates.gold' });
  for (const k of ['hp', 'mana']) if (cambia(u[k])) p.push({ tipo: 'vida', datos: u[k], razon: `playerUpdates.${k}` });
  if (cambia(u.xp)) p.push({ tipo: 'experiencia', datos: u.xp, razon: 'playerUpdates.xp' });
  for (const k of ['hunger', 'thirst', 'fatigue', 'morale', 'flags']) if (cambia(u[k])) p.push({ tipo: 'vida', datos: u[k], razon: `playerUpdates.${k}` });
  for (const o of r.newItems ?? []) p.push({ tipo: 'objeto', datos: o, razon: 'newItems' });
  for (const q of r.quests ?? []) p.push({ tipo: 'mision', datos: q, razon: 'quests' });
  if (r.combat?.start) p.push({ tipo: 'combate', datos: r.combat, razon: 'combat' });
  if (r.timeAdvance) p.push({ tipo: 'tiempo', datos: r.timeAdvance, razon: 'timeAdvance' });
  if (r.location?.refId || r.location?.nombre) p.push({ tipo: 'lugar', datos: r.location, razon: 'location' });
  for (const n of r.npcs ?? []) p.push({ tipo: 'pnj_nuevo', datos: n, razon: 'npcs', evidencia: 'aparece en la narración' });
  for (const x of r.npcMemory ?? []) p.push({ tipo: 'recuerdo_pnj', datos: x, razon: 'npcMemory', evidencia: 'lo dice la narración' });
  return p;
}

/**
 * Decide qué entra.
 *
 * @param {Array<Object>} propuestas
 * @param {Object} c
 * @param {Array<{refId: string, nombre: string}>} c.presentes
 * @param {string[]} c.conocidos Todos los nombres ya conocidos.
 * @param {string} c.story La narración (ya verificada).
 * @param {string[]} [c.secretos]
 * @returns {{aceptados: Array<Object>, rechazados: Array<{tipo: string, motivo: string}>}}
 */
export function autorizar(propuestas, c) {
  const aceptados = [];
  const rechazados = [];
  const presentes = new Map((c.presentes ?? []).map((p) => [p.refId, p]));
  const conocidos = new Set((c.conocidos ?? []).map((n) => llano(n)));
  const story = llano(c.story);
  const implicados = new Set(c.implicados ?? []);
  let nuevos = 0;
  let elementos = 0;

  const no = (p, motivo) => rechazados.push({ tipo: p?.tipo ?? '?', motivo });

  for (const p of propuestas ?? []) {
    const tipo = String(p?.tipo ?? '').trim();
    const d = p?.datos ?? {};

    if (DEL_MOTOR[tipo]) { no(p, `lo decide ${DEL_MOTOR[tipo]}, no el narrador`); continue; }
    if (!NARRATIVOS.includes(tipo)) { no(p, 'tipo desconocido'); continue; }
    if (!String(p.evidencia ?? p.razon ?? '').trim()) { no(p, 'sin evidencia'); continue; }

    switch (tipo) {
      case 'actitud': {
        const npc = presentes.get(d.refId);
        const delta = Math.round(Number(d.delta));
        if (!npc) { no(p, 'ese PNJ no está presente'); break; }
        if (!Number.isFinite(delta) || delta === 0) { no(p, 'sin cambio'); break; }
        // Solo cambia lo que siente quien ha tratado con el jugador según el
        // MOTOR, no según la narración.
        if (!implicados.has(npc.refId)) { no(p, 'el motor no registra trato con ese PNJ este turno'); break; }
        // Con tirada, el signo no puede contradecirla; sin tirada, cambios pequeños.
        if (c.tiradaExito === false && delta > 0) { no(p, 'la tirada falló: no mejora la actitud'); break; }
        const tope = c.tiradaExito === null || c.tiradaExito === undefined ? 5 : 10;
        aceptados.push({ tipo, refId: npc.refId, delta: Math.max(-tope, Math.min(tope, delta)), motivo: String(p.razon ?? '').slice(0, 120) });
        break;
      }
      case 'recuerdo_pnj': {
        const npc = presentes.get(d.refId);
        const texto = String(d.texto ?? '').trim().slice(0, 200);
        if (!npc || !texto) { no(p, 'sin PNJ presente o sin texto'); break; }
        const t = ['dicho', 'compartido', 'visto'].includes(d.tipo) ? d.tipo : 'dicho';
        // Lo que se dijo o se contó exige haber hablado con él; lo que vio,
        // solo estar allí.
        if (t !== 'visto' && !implicados.has(npc.refId)) { no(p, 'el motor no registra que hablara con ese PNJ'); break; }
        aceptados.push({ tipo, refId: npc.refId, texto, recuerdo: t });
        break;
      }
      case 'elemento_escena': {
        const texto = String(d.texto ?? '').trim().slice(0, 140);
        if (!texto) { no(p, 'sin texto'); break; }
        if (PERSONA.test(llano(texto))) { no(p, 'mete gente en escena: eso es pnj_nuevo'); break; }
        if (elementos >= 1) { no(p, 'un elemento de escena por turno'); break; }
        // Lo que el motor dijo que NO hay no lo crea el narrador.
        if ((c.inexistentes ?? []).some((w) => llano(texto).includes(llano(w).replace(/s$/, '')))) { no(p, 'el motor dijo que eso no está'); break; }
        // Solo lo que de verdad se ha narrado: no se registra lo que no se ve.
        // Por PALABRAS: buscando trozos, «cien» aparecía dentro de «cenicientos»
        // y entraba en escena un cofre con cien monedas que nadie había narrado.
        const claves = llano(texto).split(/[^\p{L}]+/u).filter((w) => w.length >= 4);
        const palabras = new Set(story.split(/[^\p{L}]+/u));
        if (claves.length && !claves.some((w) => palabras.has(w))) { no(p, 'no aparece en la narración'); break; }
        elementos += 1;
        aceptados.push({ tipo, texto });
        break;
      }
      case 'pnj_nuevo': {
        const nombre = String(d.nombre ?? '').trim();
        const rol = String(d.rol ?? '').trim().slice(0, 40) || 'lugareño';
        if (nuevos >= 1) { no(p, 'uno por turno'); break; }
        if (!/^\p{Lu}\p{Ll}{2,15}(?:\s\p{Lu}\p{Ll}{2,15})?$/u.test(nombre)) { no(p, 'nombre con forma extraña'); break; }
        if (conocidos.has(llano(nombre))) { no(p, 'ya existe alguien con ese nombre'); break; }
        if (!story.includes(llano(nombre))) { no(p, 'no aparece en la narración'); break; }
        nuevos += 1;
        aceptados.push({ tipo, nombre, rol, genero: d.genero === 'f' ? 'f' : d.genero === 'm' ? 'm' : null });
        break;
      }
      case 'pista': {
        const texto = String(d.texto ?? '').trim().slice(0, 200);
        if (!texto) { no(p, 'sin texto'); break; }
        // Una pista sale de algo que el motor ha resuelto: mirar bien, buscar,
        // el detalle de la escena. No de la inventiva del narrador.
        if (!c.hallazgo) { no(p, 'el motor no ha resuelto ningún hallazgo este turno'); break; }
        if ((c.secretos ?? []).some((s) => pareceSecreto(texto, s))) { no(p, 'revelaría un secreto antes de tiempo'); break; }
        aceptados.push({ tipo, texto, causa: String(d.causa ?? '').slice(0, 160) || null });
        break;
      }
      default:
        no(p, 'tipo desconocido');
    }
  }
  return { aceptados, rechazados };
}

export default { autorizar, propuestasDe, DEL_MOTOR, NARRATIVOS };
