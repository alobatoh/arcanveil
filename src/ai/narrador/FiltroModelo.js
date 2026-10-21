/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCANVEIL · ai/narrador/FiltroModelo.js
 * ---------------------------------------------------------------------------
 * El paso por el que pasa TODO lo que narra un modelo antes de entrar en la
 * partida. Un solo sitio, el mismo para Groq, un modelo local o el puente.
 *
 *   1. Verificar la narración contra el estado (Verificador).
 *   2. Si contradice, reparar en local quitando frases. Sin gastar nada.
 *   3. Si no basta, y se permite, UNA petición de corrección, avisando de
 *      que gasta otra solicitud. Si tampoco, se cae al procedural.
 *   4. Autorizar los efectos propuestos (Autorizacion). Lo mecánico se
 *      rechaza siempre; un rescate de prosa llega sin efectos.
 *   5. Devolver una respuesta LIMPIA: sin campos mecánicos. Lo aceptado se
 *      aplica aparte, cada cosa por su sistema.
 *
 * El turno se cuenta una vez: aquí no se tira, no se avanza el reloj ni se
 * aplica nada. Si se cae al procedural, el llamador narra con él sobre la
 * misma petición y aplica solo esa respuesta.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { verificar, repararLocal } from './Verificador.js';
import { autorizar, propuestasDe } from './Autorizacion.js';

/**
 * Datos de verificación, sacados del estado.
 *
 * @param {(ruta: string, d?: any) => any} leer
 * @param {Object} peticion
 * @param {Object} respuesta
 * @returns {Object}
 */
export function contextoDeVerificacion(leer, peticion, respuesta) {
  const porId = leer('npcs.conocidos.porId', {}) ?? {};
  const presentesIds = new Set(leer('npcs.presentes', []) ?? []);
  const caidos = new Set(leer('npcs.caidos', []) ?? []);
  const todos = Object.values(porId).filter(Boolean);
  const presentes = todos.filter((n) => presentesIds.has(n.refId));
  const lugares = leer('world.localizaciones.porId', {}) ?? {};
  const aqui = leer('world.ubicacion', null);
  const combate = leer('combat.activo', false) ? Object.values(leer('combat.combatientes', {}) ?? {}) : [];
  const nuevos = (respuesta.proposedEffects ?? []).filter((p) => p?.tipo === 'pnj_nuevo').map((p) => p?.datos?.nombre).filter(Boolean)
    .concat((respuesta.npcs ?? []).map((n) => n?.nombre).filter(Boolean));
  return {
    jugador: leer('player.nombre', ''),
    texto: peticion.instantanea?.jugador?.escribe ?? peticion.accion ?? '',
    presentes: presentes.map((n) => ({ nombre: n.nombre, refId: n.refId, vivo: n.situacion !== 'muerto' && !caidos.has(n.refId) })),
    ausentes: todos.filter((n) => !presentesIds.has(n.refId)).map((n) => n.nombre),
    muertos: [...todos.filter((n) => n.situacion === 'muerto' || caidos.has(n.refId)).map((n) => n.nombre), ...(peticion.canonMuertos ?? [])],
    nuevos,
    tirada: peticion.tirada ? { exito: Boolean(peticion.tirada.exito) } : null,
    negativa: Boolean(peticion.contexto?.negativa),
    lugar: lugares[aqui]?.nombre ?? '',
    lugares: Object.values(lugares).map((l) => l?.nombre).filter(Boolean),
    franja: leer('world.tiempo.franja', ''),
    secretos: presentes.flatMap((n) => n.conocimiento?.secretos ?? []),
    inexistentes: (peticion.contexto?.interpretacion?.segmentos ?? []).flatMap((s) => s.referentes ?? []).filter((r) => r.estado === 'inexistente').map((r) => r.palabra),
    caidos: combate.filter((c) => (c.vida?.actual ?? 1) <= 0).map((c) => c.nombre),
    enCombate: combate.length > 0,
    yaContado: peticion.instantanea?.yaContado ?? [],
    conocidos: todos.map((n) => n.nombre),
    cuentas: cuentasDelMotor(leer),
    ...evidenciaDelMotor(peticion),
  };
}

/**
 * Las cuentas del motor, para que el Verificador sepa qué cifra mecánica es
 * la buena: el estado y lo que el motor ha escrito ESTE turno (golpes,
 * compras, objetos dados), desde la última entrada del jugador.
 *
 * @param {(ruta: string, d?: any) => any} leer
 * @returns {Object}
 */
export function cuentasDelMotor(leer) {
  // Lo que el motor ha escrito este turno: golpes, compras, objetos dados.
  // Las tiradas no: «sacas un 17» no hace verdad «ganas 17 XP».
  const entradas = leer('narrative.entradas', []) ?? [];
  let i = entradas.length - 1;
  while (i >= 0 && entradas[i]?.voz !== 'player' && entradas[i]?.voz !== 'jugador') i -= 1;
  const textoTurno = entradas.slice(i + 1).filter((e) => e?.voz !== 'roll' && e?.voz !== 'tirada').map((e) => String(e?.texto ?? '')).join('\n');
  const turno = [...textoTurno.matchAll(/\d+/g)].map((m) => Number(m[0]));
  const enCombate = leer('combat.activo', false);
  return {
    vida: leer('player.vida', null),
    mana: leer('player.mana', null),
    xp: leer('player.xp', null),
    nivel: leer('player.nivel', null),
    oro: leer('player.oro', null),
    cantidades: Object.values(leer('inventory.objetos.porId', {}) ?? {}).map((o) => o?.cantidad ?? 1),
    objetos: Object.values(leer('inventory.objetos.porId', {}) ?? {}).map((o) => o?.nombre ?? '').filter(Boolean),
    combatientes: enCombate ? Object.values(leer('combat.combatientes', {}) ?? {}).map((c) => ({ nombre: c?.nombre, actual: c?.vida?.actual, max: c?.vida?.max })) : [],
    turno,
    textoTurno,
  };
}

/** Pruebas en las que una percepción cuenta como hallazgo. */
const HALLAZGO = /percep|investig|superviv|rastre|buscar|busqueda/;

/**
 * Lo que el MOTOR dice que ha pasado este turno, que es la única evidencia
 * que vale para un efecto. Que el modelo escriba un nombre en su narración
 * no prueba nada: la narración la escribe él.
 *
 *   · implicados: con quién ha tratado el jugador (a quién se dirigió según
 *     la interpretación, ante quién se negó, los actores de la situación en
 *     que intervino).
 *   · hallazgo: si el motor resolvió que ha encontrado o visto algo (una
 *     tirada de percepción o búsqueda con éxito, un detalle de la escena).
 *
 * @param {Object} peticion
 * @returns {{implicados: string[], hallazgo: boolean, tiradaExito: boolean|null}}
 */
export function evidenciaDelMotor(peticion) {
  const ctx = peticion.contexto ?? {};
  const implicados = new Set();
  for (const s of ctx.interpretacion?.segmentos ?? []) {
    if (s.destinatario?.estado === 'presente' && s.destinatario.refId) implicados.add(s.destinatario.refId);
  }
  if (ctx.negativa?.refId) implicados.add(ctx.negativa.refId);
  if (ctx.situacionResultado) for (const a of ctx.situacion?.actores ?? []) if (a?.refId) implicados.add(a.refId);
  const t = peticion.tirada;
  const hallazgo = Boolean(ctx.detalleEscena) || Boolean(t?.exito && HALLAZGO.test(String(t.habilidad ?? t.nombreHabilidad ?? '').toLowerCase()));
  return { implicados: [...implicados], hallazgo, tiradaExito: t ? Boolean(t.exito) : null };
}

/**
 * Quita de una narración lo que no es narración: restos de JSON y marcas de
 * bloque de código.
 * @param {string} story
 * @returns {string}
 */
export function limpiarRestos(story) {
  return String(story ?? '')
    .replace(/```[a-z]*\s*/gi, '')
    .replace(/\s*[{[]\s*"[A-Za-z_]+"\s*:[\s\S]*$/u, '')
    .replace(/\s*"(?:story|choices|proposedEffects|pregunta|memory|mood)"\s*:[\s\S]*$/u, '')
    .trim();
}

/** Campos que un modelo no puede traer a la partida por su cuenta. */
const MECANICOS = { playerUpdates: {}, newItems: [], quests: [], combat: {}, events: [], npcs: [], npcMemory: [] };

/**
 * Filtra una respuesta de modelo.
 *
 * @param {Object} op
 * @param {Object} op.resultado Lo que devolvió el proveedor: {respuesta, proveedor, avisos}.
 * @param {Object} op.peticion
 * @param {(ruta: string, d?: any) => any} op.leer
 * @param {Object|null} [op.proveedor] Si tiene `reparar()`, se puede pedir una corrección.
 * @param {boolean} [op.permitirReparacion=true]
 * @returns {Promise<{respuesta: Object|null, aceptados: Object[], rechazados: Object[], problemas: Object[],
 *   reparado: 'no'|'local'|'remota', caer: boolean, motivo: string|null, avisos: string[], solicitudesExtra: number}>}
 */
export async function filtrarModelo({ resultado, peticion, leer, proveedor = null, permitirReparacion = true }) {
  const avisos = [];
  let respuesta = resultado.respuesta;
  let reparado = 'no';
  let solicitudesExtra = 0;

  // Un rescate de prosa puede arrastrar el JSON roto del final («…Dallin
  // espera. {"proposedEffects":[…») o las marcas de bloque de código. Eso
  // no es narración y no llega a la bitácora.
  respuesta = { ...respuesta, story: limpiarRestos(respuesta.story) };

  let c = contextoDeVerificacion(leer, peticion, respuesta);
  let problemas = verificar(respuesta.story, c);
  const originales = problemas.slice();

  if (problemas.length) {
    const local = repararLocal(respuesta.story, problemas);
    const graves = problemas.some((p) => p.grave);
    if (local.reparable) {
      respuesta = { ...respuesta, story: local.story };
      reparado = 'local';
      avisos.push(`Se quitaron ${local.quitadas} frase(s) que contradecían el estado del juego.`);
    } else if (!graves) {
      // Solo fallos leves (una frase ya contada, la hora): no contradicen el
      // estado. Se queda lo que sobreviva y, si no queda nada, el original:
      // el procedural repetiría más, no menos.
      respuesta = { ...respuesta, story: local.story.trim().length >= 20 ? local.story : respuesta.story };
      reparado = 'local';
    } else if (graves && permitirReparacion && typeof proveedor?.reparar === 'function') {
      try {
        const segundo = await proveedor.reparar(peticion, respuesta._crudo ?? JSON.stringify({ story: respuesta.story }), problemas);
        solicitudesExtra += 1;
        avisos.push('Se usó una solicitud extra de la IA para corregir el turno.');
        c = contextoDeVerificacion(leer, peticion, segundo.respuesta);
        const otra = verificar(segundo.respuesta.story, c);
        const arreglo = repararLocal(segundo.respuesta.story, otra);
        if (arreglo.reparable) {
          respuesta = { ...segundo.respuesta, story: arreglo.story };
          problemas = otra;
          reparado = 'remota';
        } else {
          return { respuesta: null, aceptados: [], rechazados: [], problemas: originales, reparado: 'no', caer: true, motivo: 'la narración contradecía el estado del juego', avisos, solicitudesExtra };
        }
      } catch (e) {
        return { respuesta: null, aceptados: [], rechazados: [], problemas: originales, reparado: 'no', caer: true, motivo: e?.message ?? 'no se pudo corregir', avisos, solicitudesExtra };
      }
    } else {
      return { respuesta: null, aceptados: [], rechazados: [], problemas: originales, reparado: 'no', caer: true, motivo: 'la narración contradecía el estado del juego', avisos, solicitudesExtra };
    }
  }

  // Los efectos: solo lo narrativo, con evidencia. Un rescate de prosa, nada.
  const propuestas = respuesta._sinEfectos ? [] : propuestasDe(respuesta);
  const { aceptados, rechazados } = autorizar(propuestas, {
    presentes: c.presentes.filter((p) => p.vivo),
    conocidos: c.conocidos,
    story: respuesta.story,
    secretos: c.secretos,
    implicados: c.implicados,
    hallazgo: c.hallazgo,
    tiradaExito: c.tiradaExito,
    inexistentes: c.inexistentes,
  });
  if (respuesta._sinEfectos && (respuesta.proposedEffects?.length || Object.keys(respuesta.playerUpdates ?? {}).length)) {
    rechazados.push({ tipo: '*', motivo: 'respuesta rescatada de prosa: sin efectos' });
  }

  // Lo que el modelo quiere recordar entra como lo que es: una nota del
  // narrador, no un hecho del motor.
  const memoria = (respuesta.memory ?? []).slice(0, 3);
  const limpia = { ...respuesta, ...MECANICOS, memory: [], proposedEffects: [], timeAdvance: undefined, location: undefined };
  delete limpia._crudo;

  return {
    respuesta: limpia,
    aceptados: [...aceptados, ...memoria.map((texto) => ({ tipo: 'nota_narrador', texto: String(texto).slice(0, 200) }))],
    rechazados,
    problemas: originales,
    reparado,
    caer: false,
    motivo: null,
    avisos,
    solicitudesExtra,
  };
}

/**
 * Aplica lo aceptado, cada cosa por el sistema que la posee.
 *
 * @param {Array<Object>} aceptados
 * @param {Object} s
 * @param {Object} [s.npcs] FactionSystem
 * @param {Object} [s.relaciones] RelationshipSystem
 * @param {Object} s.memoria MemoryStore
 * @param {(texto: string, op: Object) => boolean} s.registrarElemento
 * @param {number} s.turno
 * @returns {string[]} Lo que se aplicó, para la traza.
 */
export function aplicarNarrativos(aceptados, s) {
  const hecho = [];
  for (const a of aceptados ?? []) {
    switch (a.tipo) {
      case 'actitud':
        if (s.relaciones?.ajustar) { s.relaciones.ajustar(a.refId, a.delta, a.motivo || 'narrador'); hecho.push(`actitud ${a.refId} ${a.delta > 0 ? '+' : ''}${a.delta}`); }
        break;
      case 'recuerdo_pnj':
        if (a.recuerdo === 'compartido') s.npcs?.compartir?.(a.refId, a.texto);
        else s.npcs?.recordar?.(a.refId, a.texto, { tipo: a.recuerdo });
        hecho.push(`recuerdo ${a.refId}`);
        break;
      case 'elemento_escena':
        if (s.registrarElemento(a.texto, { fuente: 'narrador' })) hecho.push(`escena: ${a.texto}`);
        break;
      case 'pnj_nuevo': {
        const npc = s.npcs?.introducir?.({ nombre: a.nombre, rol: a.rol, ...(a.genero ? { genero: a.genero } : {}) });
        if (npc) hecho.push(`pnj: ${a.nombre}`);
        break;
      }
      case 'pista':
        s.memoria.abrirHilo({ tipo: 'pista', texto: a.causa ? `${a.texto} (causa posible: ${a.causa})` : a.texto, turno: s.turno, relacionadoCon: 'narrador' });
        hecho.push('pista');
        break;
      case 'nota_narrador':
        // No es un hecho del mundo: va aparte, como nota del narrador, y
        // nadie la contará después como algo que pasó.
        s.memoria.anotarNarrador?.(a.texto, s.turno);
        hecho.push('nota');
        break;
      default:
        break;
    }
  }
  return hecho;
}

export default { filtrarModelo, aplicarNarrativos, contextoDeVerificacion };
