/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCANVEIL · app/app.js
 * ---------------------------------------------------------------------------
 * La aplicación de juego.
 *
 * Arranca el motor directamente y dibuja su propia interfaz: es la ÚNICA del
 * juego (la original de las fases 1-3 se retiró el 7-oct-2026). Pantallas:
 * inicio, herencia, personajes, creación, cargar y partida.
 *
 * Todo lo que se ve sale del motor real: las tiradas, el mundo, el combate y
 * la narración del director interno.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { store } from '../src/core/Store.js';
import { bus } from '../src/core/EventBus.js';
import { Registry } from '../src/core/Registry.js';
import { GestorRNG } from '../src/core/RNG.js';

import { Clock } from '../src/core/Clock.js';
import { Player } from '../src/player/Player.js';
import { Muerte } from '../src/player/Muerte.js';
import { Inventory } from '../src/inventory/Inventory.js';
import { TimeSystem } from '../src/world/TimeSystem.js';
import { WeatherSystem } from '../src/world/WeatherSystem.js';
import { DynamicEvents } from '../src/world/DynamicEvents.js';
import { Travel } from '../src/world/Travel.js';
import { Exploration } from '../src/world/Exploration.js';
import { World } from '../src/world/World.js';
import { RelationshipSystem } from '../src/npc/RelationshipSystem.js';
import { ReputationSystem } from '../src/npc/ReputationSystem.js';
import { FactionSystem } from '../src/npc/FactionSystem.js';
import { PartySystem } from '../src/npc/PartySystem.js';
import { SceneSystem } from '../src/world/SceneSystem.js';
import { SituationSystem } from '../src/world/SituationSystem.js';
import { DialogueSystem } from '../src/npc/DialogueSystem.js';
import { MerchantSystem } from '../src/npc/MerchantSystem.js';
import { EconomySystem } from '../src/economy/EconomySystem.js';
import { QuestSystem } from '../src/quests/QuestSystem.js';
import { StatsTracker } from '../src/progression/StatsTracker.js';
import { AchievementSystem } from '../src/progression/AchievementSystem.js';
import { Milestones } from '../src/progression/Milestones.js';
import { SaveManager } from '../src/persistence/SaveManager.js';
import { RulesEngine } from '../src/engine/RulesEngine.js';
import { EffectApplier } from '../src/engine/EffectApplier.js';
import { CombatManager } from '../src/combat/CombatManager.js';
import { DungeonMaster } from '../src/ai/DungeonMaster.js';
import { ActionRouter } from '../src/engine/ActionRouter.js';
import { ConsequenceEngine } from '../src/engine/ConsequenceEngine.js';
import { DifficultyDirector } from '../src/engine/DifficultyDirector.js';
import { TurnResolver } from '../src/engine/TurnResolver.js';

import {
  pintarLugar, pintarRetrato, pintarCriatura, cargarManifiesto,
  especieNombrada, claveRetrato,
} from '../src/art/index.js';
import { abrirGaleria, aprobar, alCambiarGaleria, urlAprobada, borrarGaleria } from '../src/art/galeria.js';
import { pedirCandidata, estadoGenerador, olvidarCandidatas } from '../src/art/candidata.js';
import { sujetoRetrato } from '../src/art/rasgos.js';
import { obtenerEnemigo } from '../src/data/enemies.data.js';

import { fichaAleatoria } from '../src/player/CharacterRandom.js';
import { aplicarCorreccion, resumenPersonaje, sexoDescrito, PREGUNTA_CREACION } from '../src/player/Correccion.js';
import {
  listarPersonajes, obtenerPersonaje, guardarPersonaje,
} from '../src/persistence/CharacterRoster.js';
import * as Entrega from '../src/persistence/EntregaLegado.js';
import * as Ranuras from '../src/persistence/Ranuras.js';
import { explicarLegado, procedenciaXP } from '../src/player/Legado.js';
import { nuevoRunId } from '../src/player/Muerte.js';
import { nivelParaXP } from '../src/player/Progression.js';
import { RAZAS } from '../src/data/races.data.js';
import { CLASES } from '../src/data/classes.data.js';
import { TRASFONDOS } from '../src/data/backgrounds.data.js';
import { obtenerLugar } from '../src/data/locations.data.js';
import { ESTADOS } from '../src/data/statuses.data.js';
import { importarHistoria } from '../src/ai/Importar.js';
import { esGolpe } from '../src/ai/Cadencia.js';
import * as Comb from '../src/combat/Combatant.js';
import { PROVEEDORES } from '../src/config/ai.config.js';
import {
  rodarDado, numeroDano, sacudir, destello, rotuloMomento,
} from './efectos.js';

/* ═══════════════════════════════════════════════════════════════════════════
   UTILIDADES DE DOM
   ═══════════════════════════════════════════════════════════════════════════ */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

function el(tag, attrs = {}, ...hijos) {
  const n = document.createElement(tag);

  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = String(v);
    // Sin `html`: nadie lo usaba, y una puerta a innerHTML en el ayudante de
    // todo app.js es la que acaba abriéndose con texto del narrador.
    else if (k.startsWith('on')) { if (typeof v === 'function') n.addEventListener(k.slice(2).toLowerCase(), v); }
    else if (k === 'dataset') Object.assign(n.dataset, v);
    // `value` va como propiedad. Como atributo, un <textarea> lo ignora: la
    // descripción y la historia salían vacías al volver a la ficha aunque el
    // borrador las guardara.
    else if (k === 'value') n.value = String(v);
    else n.setAttribute(k, String(v));
  }

  for (const h of hijos.flat()) {
    if (h === null || h === undefined || h === false) continue;
    n.append(h.nodeType ? h : document.createTextNode(String(h)));
  }

  return n;
}

function vaciar(nodo) {
  if (nodo) nodo.innerHTML = '';
}

/** Muestra un fallo en pantalla en vez de dejar la página muda. */
function avisarFallo(donde, error) {
  console.error('[arcanveil] ' + donde, error);

  let caja = $('#fallos');
  if (!caja) {
    caja = el('div', { id: 'fallos', class: 'fallos' },
      el('p', { class: 'fallos__titulo', text: 'Algo ha fallado' }));
    document.body.prepend(caja);
  }

  caja.append(el('pre', {
    class: 'fallos__linea',
    text: `${donde} → ${error?.message ?? error}\n${String(error?.stack ?? '').split('\n').slice(1, 3).join('\n')}`,
  }));
}

// Cualquier error que se escape queda escrito en pantalla.
if (typeof window !== 'undefined') {
  window.addEventListener('error', (e) => {
    document.body?.classList.add('esta-listo');

    const err = e.error ?? new Error(e.message);

    // Si el motor aún no arrancó, el fallo se pinta en el rótulo, que es lo
    // único visible en ese momento.
    if (!motor.listo) arranqueFallido('error no capturado', err);
    else avisarFallo('error no capturado', err);
  });

  window.addEventListener('unhandledrejection', (e) => {
    document.body?.classList.add('esta-listo');
    avisarFallo('promesa rechazada', e.reason);
  });
}

const protegido = (donde, fn) => (...args) => {
  try {
    const r = fn(...args);
    // Una promesa rechazada también se dice (y no queda «sin capturar»).
    if (r && typeof r.then === 'function') return r.catch((e) => { avisarFallo(donde, e); return null; });
    return r;
  } catch (e) { avisarFallo(donde, e); return null; }
};

/* ═══════════════════════════════════════════════════════════════════════════
   MOTOR
   ═══════════════════════════════════════════════════════════════════════════ */

const motor = { registry: null, rng: null, listo: false };

async function arrancarMotor() {
  motor.rng = new GestorRNG();
  store.fijar('meta.semilla', motor.rng.semillaMaestra);

  motor.registry = new Registry({ store, bus, rng: motor.rng });

  // Se informa del avance: si un sistema cuelga el arranque, su nombre queda
  // en pantalla en vez de un rótulo mudo.
  const decir = (t) => {
    const n = document.getElementById('arranque-texto');
    if (n) n.textContent = t;
  };

  bus.on?.('system:started', ({ nombre }) => decir(`Iniciando ${nombre}…`));
  decir('Registrando sistemas…');

  motor.registry.registrarTodos([
    Clock, Player, Muerte, Inventory,
    TimeSystem, WeatherSystem, DynamicEvents, Travel, Exploration, World,
    RelationshipSystem, ReputationSystem, FactionSystem, DialogueSystem,
    MerchantSystem, EconomySystem, QuestSystem, PartySystem, SceneSystem, SituationSystem,
    StatsTracker, AchievementSystem, Milestones, SaveManager,
    RulesEngine, EffectApplier, CombatManager,
    DungeonMaster, ActionRouter, ConsequenceEngine, DifficultyDirector,
    TurnResolver,
  ]);

  await motor.registry.iniciar();

  if (typeof motor.registry.arrancar === 'function') {
    await motor.registry.arrancar();
  }

  motor.listo = true;

  return motor.registry;
}

const sistema = (nombre) => motor.registry?.obtener(nombre) ?? null;
const ver = (ruta, defecto) => store.select(ruta, defecto);

/* ═══════════════════════════════════════════════════════════════════════════
   PANTALLAS
   ═══════════════════════════════════════════════════════════════════════════ */

/** A partir del arranque, ir al inicio abre el menú. */
let menuTrasArrancar = false;

function mostrar(pantalla) {
  // Se acota a las secciones a propósito. La marca del cuerpo va en OTRO
  // atributo (`data-active-screen`, el mismo que usa ui.config.js) porque con
  // el mismo nombre el body entraba en esta lista en la segunda llamada, no
  // coincidía con el destino y se ponía `hidden` a sí mismo: el juego entero
  // desaparecía al pasar de la portada a la creación.
  for (const s of $$('section[data-pantalla]')) {
    s.hidden = s.dataset.pantalla !== pantalla;
  }

  document.body.setAttribute('data-active-screen', pantalla);

  // Volver al inicio desde otra pantalla («Atrás» en la creación o en
  // cargar) es volver al menú, no a la portada vacía.
  if (pantalla === 'inicio' && menuTrasArrancar) abrirMenuInicio({ foco: false });

  const activa = document.querySelector(`section[data-pantalla="${pantalla}"]`);
  if (activa) {
    activa.classList.remove('pantalla-entrando');
    void activa.offsetWidth;
    activa.classList.add('pantalla-entrando');
  }
}

/* ── inicio ───────────────────────────────────────────────────────────── */

/**
 * Pantalla de título, como la de cualquier videojuego: Continuar solo se
 * enciende si hay algo que continuar.
 */
/**
 * La portada tiene dos estados: la marca con «Pulsa para jugar», y el menú.
 * Pulsar no carga nada por su cuenta, ni siquiera si hay partida: abre el
 * menú, y ahí «Continuar» dice qué partida es. Cargar de golpe al tocar la
 * portada podía llevar a una ranura que no era la que se quería.
 */
function abrirMenuInicio({ foco = true } = {}) {
  const seccion = document.querySelector('section[data-pantalla="inicio"]');
  if (!seccion) return;
  seccion.dataset.estado = 'menu';
  $('#inicio-menu').hidden = false;
  $('#inicio-jugar')?.setAttribute('aria-expanded', 'true');
  if (foco) ($('#inicio-acciones button:not([disabled])') ?? $('#inicio-volver'))?.focus();
}

function cerrarMenuInicio() {
  const seccion = document.querySelector('section[data-pantalla="inicio"]');
  if (!seccion) return;
  seccion.dataset.estado = 'portada';
  $('#inicio-menu').hidden = true;
  const llamada = $('#inicio-jugar');
  llamada?.setAttribute('aria-expanded', 'false');
  llamada?.focus();
}

function pintarInicio() {
  const saves = sistema('saves');
  const reciente = partidaMasReciente();

  const caja = $('#inicio-acciones');
  vaciar(caja);

  caja.append(
    el('button', {
      class: 'btn btn--grande menu-btn', id: 'menu-continuar',
      disabled: reciente ? null : 'disabled',
      title: reciente ? `${reciente.cabecera?.nombre ?? ''} · nivel ${reciente.cabecera?.nivel ?? 1}` : 'Aún no hay partidas guardadas',
      onClick: protegido('continuar', () => continuar()),
    },
      el('span', { text: 'Continuar' }),
      reciente ? el('small', { class: 'menu-btn__nota', text: `${reciente.cabecera?.nombre ?? ''} · ${reciente.cabecera?.lugar ?? ''}` }) : null,
    ),
    el('button', {
      class: 'btn menu-btn', id: 'menu-nueva',
      onClick: protegido('nueva partida', () => abrirNuevaPartida()),
    }, 'Nueva partida'),
    el('button', {
      class: 'btn menu-btn', id: 'menu-cargar',
      disabled: saves && partidasGuardadas().length ? null : 'disabled',
      onClick: protegido('cargar', () => { mostrar('cargar'); pintarCargar(); }),
    }, 'Cargar'),
    el('button', {
      class: 'btn btn--fantasma menu-btn', id: 'menu-ajustes',
      onClick: protegido('ajustes', () => abrirAjustes()),
    }, 'Ajustes'),
  );
}

/* ── partidas guardadas ───────────────────────────────────────────────── */

/** Clave de la preferencia que recuerda que el jugador quiso guardar. */
const CLAVE_PERSISTENCIA = 'arcanveil:prefs:persistencia';

/**
 * Enciende el guardado en el navegador. Se llama al empezar una partida: quien
 * pulsa «Nueva partida» en un juego con «Continuar» está pidiendo que se
 * recuerde. El autoguardado propio del motor se apaga porque aquí cada
 * partida tiene su ranura y se guarda al final de cada turno.
 */
function activarPersistencia() {
  try { localStorage.setItem(CLAVE_PERSISTENCIA, '1'); } catch { /* modo privado */ }
  store.fijar('settings.persistencia', true);
  store.fijar('settings.autoguardado', false);
  bus.emit('settings:change', { id: 'persistencia', valor: true });
}

/** Al arrancar: si antes se guardó algo, se vuelve a poder leer y guardar. */
function recuperarPersistencia() {
  let recordada = false;
  try {
    recordada = localStorage.getItem(CLAVE_PERSISTENCIA) === '1'
      || Object.keys(localStorage).some((k) => k.startsWith('arcanveil:partida:'));
  } catch { /* sin almacenamiento */ }
  if (recordada) activarPersistencia();
}

/**
 * Las partidas guardadas, la más reciente primero. Las de un personaje muerto
 * (muerte permanente) no se pueden continuar: «Continuar» no las ofrece y
 * «Cargar» las enseña cerradas.
 */
function partidasGuardadas({ conMuertas = false } = {}) {
  return (sistema('saves')?.listar?.() ?? [])
    .filter((r) => !r.vacia && r.abrible !== false && (conMuertas || !r.muerto))
    .sort((a, b) => (b.guardadoEn ?? 0) - (a.guardadoEn ?? 0));
}

function partidaMasReciente() {
  return partidasGuardadas()[0] ?? null;
}

/**
 * Guarda la partida en curso en SU ranura (asíncrono: espera al resultado
 * real, coordinado entre pestañas). Nunca rechaza: devuelve el resultado.
 *
 * Una partida sin ranura asignada (importada, por ejemplo) toma una LIBRE
 * según el registro coordinado; si no hay ninguna, no guarda y lo dice.
 * Escribir encima de otra campaña se niega en `SaveManager.guardar` (dueño
 * y revisión en IndexedDB, no lo que diga la caché local).
 */
async function guardarPartidaActual({ silencioso = true, avisarSiFalla = false } = {}) {
  if (!ver('player.raza')) return null;
  const runId = ver('meta.runId');
  let ranura = ver('meta.ranura');
  try {
    if (!ranura) {
      ranura = await Ranuras.ranuraLibre();
      // Mientras se buscaba, la pestaña cambió de partida: esta foto no vale.
      if (ver('meta.runId') !== runId) return { exito: false, motivo: 'La partida cambió mientras se buscaba ranura.', runId };
      if (!ranura) {
        const motivo = 'No queda ninguna ranura libre para esta partida. Borra alguna desde «Cargar»; no se escribe encima de otra.';
        if (!silencioso) avisar(motivo, 'aviso');
        return { exito: false, motivo, runId };
      }
      store.fijar('meta.ranura', ranura);
    }
    const r = (await sistema('saves')?.guardar(ranura, { silencioso, nota: 'crónica' })) ?? null;
    // Los automáticos (turno, pelea, final) dicen su fallo una vez; el manual
    // y la salida lo dicen ellos mismos con el resultado.
    if (r && !r.exito && avisarSiFalla) avisarGuardadoFallido(r);
    return r;
  } catch (e) {
    const motivo = `No se ha podido guardar: ${e?.message ?? e}`;
    if (!silencioso) avisar(motivo, 'error');
    return { exito: false, motivo, runId };
  }
}

/**
 * Un guardado automático (fin de turno, de combate) que falla se dice UNA
 * vez por motivo y partida (no un aviso por turno), y solo si la pantalla
 * sigue siendo la de esa partida. Lo grave (la ranura ya es de otra campaña,
 * se borró, otra pestaña la guardó después) no se calla.
 */
const fallosAvisados = new Set();
function avisarGuardadoFallido(r) {
  if (!r?.motivo || (r.runId && r.runId !== ver('meta.runId'))) return;
  const clave = `${r.runId ?? ''}|${r.codigo ?? r.motivo}`;
  if (fallosAvisados.has(clave)) return;
  fallosAvisados.add(clave);
  avisar(`No se ha guardado: ${r.motivo}`, r.conflicto ? 'aviso' : 'error');
}

/**
 * Guardado tras cada turno o pelea: uno en marcha como mucho y, si mientras
 * tanto hubo otro turno, uno más al terminar (con la foto de entonces). No
 * se acumulan cientos de guardados en cola ni se congela el juego.
 */
const guardadoTurno = { enMarcha: null, otraVez: false };
function guardarTrasTurno() {
  if (guardadoTurno.enMarcha) { guardadoTurno.otraVez = true; return guardadoTurno.enMarcha; }
  guardadoTurno.enMarcha = guardarPartidaActual({ avisarSiFalla: true }).finally(() => {
    guardadoTurno.enMarcha = null;
    if (guardadoTurno.otraVez) { guardadoTurno.otraVez = false; guardarTrasTurno(); }
  });
  return guardadoTurno.enMarcha;
}

/**
 * ¿Se ha escrito de verdad? Espera al guardado y relee la copia AUTORITATIVA
 * de la ranura: tienen que ser exactamente los bytes escritos y la partida
 * en curso (run, turno y vida). Que `guardar` diga «éxito» no basta para
 * salir: la salida recarga la página y, si lo escrito no es lo jugado, se
 * pierde.
 * @returns {Promise<{ok: boolean, motivo?: string}>}
 */
async function guardarYComprobar() {
  const r = await guardarPartidaActual({ silencioso: true });
  if (!r) return { ok: false, motivo: 'No hay partida que guardar.' };
  if (!r.exito) return { ok: false, motivo: r.motivo ?? 'No se ha podido guardar.' };
  try {
    const l = await Ranuras.leerRanuraCoordinada(r.ranura);
    if (l.tipo !== 'valida' || l.texto !== r.texto) return { ok: false, motivo: 'Lo guardado no es lo que se escribió (otra pestaña ha escrito después): no se ha podido comprobar.' };
    const m = l.estado?.meta ?? {};
    const igual = m.runId === ver('meta.runId') && m.turno === ver('meta.turno')
      && l.estado?.player?.vida?.actual === ver('player.vida.actual');
    return igual ? { ok: true, rev: r.rev } : { ok: false, motivo: 'Lo guardado no coincide con la partida: no se ha podido comprobar la escritura.' };
  } catch (e) {
    return { ok: false, motivo: `No se ha podido leer lo guardado (${e?.message ?? 'error'}).` };
  }
}

/**
 * Salir de la partida (al menú, a otra partida, tras morir) SIN perder lo
 * jugado. Antes, «Menú» llamaba a guardar, no miraba el resultado y recargaba:
 * si no se podía guardar (el enemigo actuando, almacenamiento lleno,
 * persistencia apagada) se perdía todo desde el último guardado sin decirlo.
 *
 * Ahora:
 *   · Solo se recarga tras un guardado COMPROBADO (relectura de la ranura).
 *   · Con el enemigo actuando, se espera a la frontera segura (el turno del
 *     jugador o el fin de la pelea) y se sale entonces; se puede cancelar y
 *     la partida sigue viva. Nada se congela ni se fuerza.
 *   · Si muere entretanto, manda la pantalla de muerte (ya guarda el final).
 *   · Si no se puede guardar: la causa y «Reintentar», «Quedarme» o «Salir
 *     sin guardar» (con confirmación que dice qué se pierde).
 *   · Una sola salida a la vez: el doble clic no guarda ni recarga dos veces.
 *   · Tras una muerte, primero se espera a que la muerte quede registrada
 *     (marca y herencia) y después se guarda y comprueba el final.
 *
 * @param {() => void} irse Lo que se hace al salir (recargar, etc.).
 */
const salida = { pendiente: null, saliendo: false };

function salirConGuardado(irse) {
  // Ya saliendo (la recarga está en marcha): nada más, ni otro guardado.
  if (salida.saliendo) return;
  if (salida.pendiente) { $('#salida-acciones button')?.focus(); return; }
  if (!ver('player.raza')) { irse(); return; }
  const runId = ver('meta.runId');
  const quitar = [];
  salida.pendiente = { runId, irse, quitar };

  const terminar = () => {
    quitar.forEach((f) => { try { f(); } catch { /* ya fuera */ } });
    salida.pendiente = null;
    $('#salida-modal').hidden = true;
  };
  const cancelar = () => { terminar(); bloquear(false); refrescarTodo(); };

  const intentar = async () => {
    if (!salida.pendiente || salida.pendiente.guardando) return;
    // La partida ha cambiado (otra cargada): esta salida ya no vale.
    if (ver('meta.runId') !== runId) { cancelar(); return; }
    const manager = sistema('combat');
    if (ver('combat.activo', false) && !manager?.esperandoJugador) {
      mostrarSalida('Esperando para salir', 'El combate se está resolviendo. En cuanto termine la acción se guarda y se sale; si prefieres, sigue jugando.', [
        ['Cancelar y seguir jugando', cancelar, 'btn'],
      ]);
      return;
    }
    salida.pendiente.guardando = true;
    // Mientras guarda se dice (otra pestaña puede tener el candado un rato);
    // otro clic en «Menú» no pide nada más (ver la guarda de arriba).
    $('#menu')?.setAttribute('aria-busy', 'true');
    mostrarSalida('Guardando antes de salir', 'Un momento: se guarda la partida y se comprueba antes de salir.', []);
    let r;
    try {
      // Muerto: manda el registro de la muerte (y su final), no otro guardado.
      if (ver('meta.muerte')) await sistema('muerte')?.registro;
      r = await guardarYComprobar();
    } finally {
      if (salida.pendiente) salida.pendiente.guardando = false;
      $('#menu')?.removeAttribute('aria-busy');
    }
    if (!salida.pendiente || ver('meta.runId') !== runId) return;
    if (r.ok) { terminar(); salida.saliendo = true; irse(); return; }
    mostrarSalida('No se ha podido guardar', `${r.motivo} Si sales ahora, pierdes lo jugado desde el último guardado.`, [
      ['Reintentar', intentar, 'btn btn--grande'],
      ['Quedarme', cancelar, 'btn'],
      ['Salir sin guardar…', () => confirmarSinGuardar(), 'btn btn--fantasma'],
    ]);
  };

  const confirmarSinGuardar = () => {
    const t = ver('world.tiempo', {}) ?? {};
    mostrarSalida('Salir sin guardar', `Se perderá todo lo jugado desde el último guardado que funcionó (ahora es el día ${t.dia ?? '?'}, ${String(t.hora ?? 0).padStart(2, '0')}:${String(t.minuto ?? 0).padStart(2, '0')}). Esto no se puede deshacer.`, [
      ['Salir sin guardar', () => { terminar(); salida.saliendo = true; irse(); }, 'btn btn--peligro'],
      ['Volver', intentar, 'btn'],
    ]);
  };

  // Frontera segura: el turno del jugador, el fin de la pelea. Si muere,
  // manda la pantalla de muerte (que guarda el final): la salida se retira.
  quitar.push(bus.on('combat:awaiting', () => setTimeout(intentar, 0)));
  quitar.push(bus.on('combat:end', () => setTimeout(intentar, 0)));
  quitar.push(bus.on('run:ended', () => { quitar.forEach((f) => f()); salida.pendiente = null; $('#salida-modal').hidden = true; }));
  quitar.push(bus.on('save:loaded', () => cancelar()));
  intentar();
}

/** Pinta el aviso de salida con sus botones. */
function mostrarSalida(titulo, nota, botones) {
  const modal = $('#salida-modal');
  if (!modal) return;
  $('#salida-titulo').textContent = titulo;
  $('#salida-nota').textContent = nota;
  const acciones = $('#salida-acciones');
  vaciar(acciones);
  for (const [texto, accion, clase] of botones) {
    acciones.append(el('button', { class: clase, onClick: protegido('salir', accion) }, texto));
  }
  modal.hidden = false;
  // El foco, en lo que no hace perder nada: un Enter despistado no confirma
  // «Salir sin guardar».
  (acciones.querySelector('button:not(.btn--peligro)') ?? acciones.querySelector('button'))?.focus();
}

async function cargarRanura(ranura) {
  const r = await sistema('saves').cargar(ranura);
  if (!r.exito) {
    // Un run muerto no se reanuda: no es un fallo, es la regla.
    if (r.motivo === 'muerto') { avisar(r.texto, 'aviso'); pintarCargar(); return; }
    avisarFallo('cargar partida', new Error(r.motivo));
    return;
  }
  store.fijar('meta.ranura', ranura);
  mostrar('juego');
  // Si se carga desde la salida de una caída, la caja seguía cerrada.
  bloquear(false);
  refrescarTodo();
  bitacoraSinAnimar();
  programarSugerencias();
}

function continuar() {
  const reciente = partidaMasReciente();
  return reciente ? cargarRanura(reciente.ranura) : null;
}

function pintarCargar() {
  const caja = $('#cargar-lista');
  vaciar(caja);

  const partidas = partidasGuardadas({ conMuertas: true });
  if (!partidas.length) {
    caja.append(el('p', { class: 'cargar__vacio', text: 'No hay partidas guardadas todavía.' }));
    return;
  }

  for (const p of partidas) {
    const c = p.cabecera ?? {};
    const cara = el('div', { class: 'tarjeta-pj__cara' });
    const fecha = p.guardadoEn ? new Date(p.guardadoEn).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' }) : '';

    caja.append(el('div', { class: `tarjeta-pj tarjeta-pj--partida${p.muerto ? ' tarjeta-pj--muerta' : ''}` },
      el('button', {
        class: 'tarjeta-pj__abrir', dataset: { ranura: p.ranura, muerta: p.muerto ? '1' : '' },
        disabled: p.muerto ? true : undefined,
        'aria-label': p.muerto ? `${c.nombre ?? 'Personaje'}: murió, la crónica terminó` : undefined,
        onClick: protegido('cargar partida', () => cargarRanura(p.ranura)),
      },
        cara,
        el('span', { class: 'tarjeta-pj__texto' },
          el('strong', { class: 'tarjeta-pj__nombre', text: c.nombre ?? 'Sin nombre' }),
          el('span', { class: 'tarjeta-pj__dato', text: `${p.muerto ? 'Muerto · ' : ''}Nivel ${c.nivel ?? 1} · ${RAZAS[c.raza]?.nombre ?? ''} · ${CLASES[c.clase]?.nombre ?? ''}` }),
          el('span', { class: 'tarjeta-pj__dato tarjeta-pj__dato--tenue', text: `${c.lugar ?? ''} · ${nombreIntensidad(c.intensidad)} · día ${c.dia ?? 1} · ${fecha}` }),
        ),
      ),
      el('button', {
        class: 'btn btn--pequeno btn--peligro tarjeta-pj__borrar', title: 'Borrar esta partida',
        onClick: protegido('borrar partida', async () => {
          if (!confirm(`¿Borrar la partida de ${c.nombre ?? 'este personaje'}? No se puede deshacer.`)) return;
          // Solo esa campaña: si la ranura ya es de otra, no se borra.
          await sistema('saves').borrar(p.ranura, { runId: c.runId ?? null });
          pintarCargar();
          pintarInicio();
        }),
      }, 'Borrar'),
    ));

    pintarRetrato(cara, fichaRetrato(c));
  }
}

/* ── nueva partida: personajes ────────────────────────────────────────── */

/* ── nueva partida: herencia ──────────────────────────────────────────── */

/**
 * La herencia elegida para la partida que se va a crear. Elegirla no gasta
 * nada: se entrega al confirmar la creación (`comenzarPartida`), con una
 * transacción que se conserva en cada reintento de ESTA creación.
 */
const herencia = { elegida: null, transaccion: null, runDestino: null };

/**
 * «Nueva partida». Si hay herencias pendientes (o se viene de una muerte),
 * primero se elige de quién hereda el nuevo personaje, o ninguna: no se
 * suman ni se toma la primera por su cuenta.
 *
 * @param {{origen?: string|null}} [opciones] El run que acaba de morir.
 */
async function abrirNuevaPartida({ origen = null } = {}) {
  herencia.elegida = null;
  herencia.transaccion = null;
  herencia.runDestino = null;
  const todas = await Entrega.listarLegados();
  // También se enseña la pantalla si hay una entrega bloqueada: el jugador
  // tiene que saber por qué esa herencia no está disponible.
  const hay = todas.some((v) => v.estado === 'pendiente' && v.muerto && v.cantidad !== null)
    || todas.some((v) => v.runOrigen === origen)
    || todas.some((v) => v.estado === 'reservado' && v.bloqueo);
  if (hay) {
    mostrar('herencia');
    pintarHerencia(todas, origen);
    return;
  }
  seguirNuevaPartida();
}

/**
 * Si ya existe algún personaje, se ofrece a nivel 1 con un botón para crear
 * otro. Si no, va directo al generador.
 */
function seguirNuevaPartida() {
  if (!listarPersonajes().length) {
    abrirCreacion();
    return;
  }
  mostrar('personajes');
  pintarPersonajes(null);
}

function elegirHerencia(v) {
  herencia.elegida = v;
  // La operación (token) y su destino se fijan aquí y se conservan en cada
  // reintento: el mismo token nunca va a otro personaje.
  herencia.transaccion = v ? Entrega.nuevaTransaccion() : null;
  herencia.runDestino = v ? nuevoRunId() : null;
  seguirNuevaPartida();
}

/** Qué pasa con cada herencia, en una línea. */
function detalleHerencia(v) {
  if (v.estado === 'pendiente' && v.muerto && v.cantidad !== null) {
    return `Hereda ${explicarLegado(v)}. Estimación: empezaría en el nivel ${nivelParaXP(v.cantidad)} (su vida y sus puntos se calculan para él; nada se copia del caído).`;
  }
  if (v.estado === 'aplicado') return 'Esta herencia ya la recibió otro personaje.';
  if (v.estado === 'reservado' && v.bloqueo) return `${v.bloqueo.motivo} No he vuelto a entregar la herencia ni he borrado ninguna partida.`;
  if (v.estado === 'reservado') return 'Se está creando un sucesor con esta herencia (en otra pestaña).';
  if (!v.muerto) return 'No consta su muerte en este navegador: no se puede heredar.';
  return v.motivo ?? 'No se puede heredar.';
}

function pintarHerencia(todas, origen) {
  const caja = $('#herencia-lista');
  const pie = $('#herencia-pie');
  vaciar(caja);
  vaciar(pie);
  // El que acaba de caer, primero; las ya entregadas de otros no se enseñan.
  const lista = todas
    .filter((v) => v.estado !== 'aplicado' || v.runOrigen === origen)
    .sort((a, b) => Number(b.runOrigen === origen) - Number(a.runOrigen === origen));
  for (const v of lista) {
    const usable = v.estado === 'pendiente' && v.muerto && v.cantidad !== null;
    const reciente = v.runOrigen === origen;
    caja.append(el('button', {
      class: `tarjeta-pj tarjeta-herencia${reciente ? ' es-reciente' : ''}`,
      dataset: { origen: v.runOrigen }, disabled: usable ? undefined : true,
      onClick: protegido('elegir herencia', () => elegirHerencia(v)),
    },
      el('span', { class: 'tarjeta-pj__texto' },
        el('strong', { class: 'tarjeta-pj__nombre', text: `${v.origen.nombre ?? 'Sin nombre'}${reciente ? ' · acaba de caer' : ''}` }),
        el('span', { class: 'tarjeta-pj__dato', text: `Nivel ${v.origen.nivel ?? '?'} · ${CLASES[v.origen.clase]?.nombre ?? ''} · ${v.xpAcumulada ?? '?'} XP acumulada${v.xpHeredada ? ` (${v.xpHeredada} heredada)` : ''}` }),
        el('span', { class: 'tarjeta-pj__dato tarjeta-herencia__cuenta', text: detalleHerencia(v) }),
      ),
    ));
  }
  // (Sin «null» suelto: `append` lo escribía como texto entre los botones.)
  pie.append(...[
    el('button', { class: 'btn btn--fantasma', id: 'herencia-atras', onClick: () => mostrar('inicio') }, 'Atrás'),
    // Una entrega que no se pudo comprobar se puede volver a comprobar (no
    // se libera a ciegas ni se borra nada).
    lista.some((v) => v.estado === 'reservado' && v.bloqueo)
      ? el('button', { class: 'btn btn--fantasma', id: 'herencia-comprobar', onClick: protegido('volver a comprobar', async () => {
        const r = await Entrega.recuperarLegados();
        const siguen = r.filter((x) => x.bloqueado).length;
        avisar(siguen ? `Sigue sin poder comprobarse (${siguen}). No se ha tocado nada.` : 'Comprobado.', siguen ? 'aviso' : 'exito');
        pintarHerencia(await Entrega.listarLegados(), origen);
      }) }, 'Volver a comprobar')
      : null,
    el('button', { class: 'btn', id: 'herencia-sin', onClick: protegido('sin herencia', () => elegirHerencia(null)) }, 'Empezar sin herencia'),
  ].filter(Boolean));
  (caja.querySelector('button:not([disabled])') ?? $('#herencia-sin'))?.focus();
}

/** El aviso de la herencia elegida, antes de confirmar. Sin mutar nada. */
function avisoHerencia() {
  const v = herencia.elegida;
  if (!v) return null;
  return el('div', { class: 'aviso-herencia', id: 'aviso-herencia', role: 'note' },
    el('p', { text: `Hereda de ${v.origen.nombre ?? 'tu personaje anterior'}: ${explicarLegado(v)}. Se entrega al pulsar «Comenzar partida»; hasta entonces no se gasta.` }),
    el('p', { class: 'aviso-herencia__estimacion', text: `Estimación: empezará en el nivel ${nivelParaXP(v.cantidad)}. Su vida sale de su oficio, sus atributos y ese nivel; sus puntos de habilidad, talento y atributo, de los niveles que gane. Nada se copia del caído.` }),
    el('button', { class: 'btn btn--pequeno btn--fantasma', id: 'herencia-cambiar', type: 'button', onClick: protegido('cambiar herencia', () => abrirNuevaPartida({ origen: v.runOrigen })) }, 'Cambiar herencia'),
  );
}

function pintarPersonajes(elegidoId) {
  const caja = $('#personajes-lista');
  const pie = $('#personajes-pie');
  vaciar(caja);
  vaciar(pie);

  const personajes = listarPersonajes();
  const elegido = personajes.find((p) => p.id === elegidoId) ?? null;

  // Con un personaje elegido solo queda él y «Comenzar partida».
  for (const p of elegido ? [elegido] : personajes) {
    const cara = el('div', { class: 'tarjeta-pj__cara' });
    caja.append(el('button', {
      class: 'tarjeta-pj' + (elegido ? ' es-elegida' : ''),
      dataset: { personaje: p.id },
      onClick: protegido('elegir personaje', () => pintarPersonajes(elegido ? null : p.id)),
    },
      cara,
      el('span', { class: 'tarjeta-pj__texto' },
        el('strong', { class: 'tarjeta-pj__nombre', text: p.nombre }),
        el('span', { class: 'tarjeta-pj__dato', text: `Nivel 1 · ${RAZAS[p.raza]?.nombre ?? ''} · ${CLASES[p.clase]?.nombre ?? ''}` }),
        elegido && p.lore ? el('span', { class: 'tarjeta-pj__lore', text: p.lore.slice(0, 220) + (p.lore.length > 220 ? '…' : '') }) : null,
      ),
    ));
    pintarRetrato(cara, fichaRetrato(p));
  }

  if (elegido) {
    const aviso = avisoHerencia();
    if (aviso) caja.append(aviso);
    pie.append(
      el('button', { class: 'btn btn--fantasma', id: 'personajes-otro', onClick: () => pintarPersonajes(null) }, 'Elegir otro'),
      el('button', {
        class: 'btn btn--grande', id: 'personajes-comenzar',
        onClick: protegido('comenzar partida', () => comenzarPartida(elegido)),
      }, 'Comenzar partida'),
    );
  } else {
    pie.append(
      el('button', { class: 'btn btn--fantasma', onClick: () => mostrar('inicio') }, 'Atrás'),
      el('button', {
        class: 'btn', id: 'personajes-nuevo',
        onClick: protegido('nuevo personaje', () => abrirCreacion()),
      }, 'Nuevo personaje'),
    );
  }
}

/* ── creación: generador aleatorio ────────────────────────────────────── */

const borrador = {
  nombre: '', raza: 'valdes', clase: 'rastreador', trasfondo: 'errante',
  genero: 'm', retrato: '', lore: '', intensidad: 'equilibrado',
};

/** Personaje recién creado que se enseña con su ilustración. */
let personajeCreado = null;

/**
 * Si el nombre lo ha escrito el jugador y no el dado.
 *
 * Hace falta saberlo aparte: el campo copia cada tecla a `borrador.nombre`,
 * así que comparar el campo con el borrador no distingue un nombre escrito de
 * uno tirado, y volver a tirar se llevaba por delante el nombre del jugador.
 */
let nombreEscrito = false;

function tirarFicha() {
  Object.assign(borrador, fichaAleatoria());
}

function abrirCreacion() {
  personajeCreado = null;
  tirarFicha();
  borrador.retrato = '';
  borrador.lore = '';
  // Sin esto, volver desde la revelación y luego pulsar «Crear otro»
  // sobrescribía al personaje anterior en vez de crear uno.
  delete borrador.id;
  delete borrador.creado;
  delete borrador.semillaRetrato;
  nombreEscrito = false;
  mostrar('creacion');
  pintarCreacion();
}

/**
 * Primer paso: ficha al azar y los tres textos del jugador. Aquí no hay
 * retrato a propósito: la ilustración llega cuando el jugador envía su
 * descripción, no antes.
 */
function pintarCreacion() {
  const caja = $('#creacion-cuerpo');
  vaciar(caja);
  $('#creacion-titulo').textContent = '¿Quién eres?';
  $('#creacion-nota').textContent = 'Tira los dados hasta que te guste el origen. Después escribe quién eres: tu descripción será el encargo para la ilustración.';

  caja.append(el('div', { class: 'aleatoria', id: 'ficha-aleatoria' }));
  pintarFichaAleatoria();

  // Traer una partida que ya existe.
  //
  // Va arriba del todo porque quien llega con una historia escrita no quiere
  // empezar rellenando campos: quiere pegarla y seguir jugando.
  caja.append(el('div', { class: 'campo' },
    el('button', {
      class: 'btn btn--fantasma', id: 'creacion-importar',
      onClick: protegido('importar historia', abrirImportar),
    }, 'Ya tengo una historia'),
    el('p', { class: 'campo__ayuda', text: 'Pega una partida de otro sitio y el juego la lee: personajes, lugares y lo que quedó pendiente.' }),
  ));

  caja.append(
    el('div', { class: 'campo' },
      el('label', { class: 'campo__eti', for: 'nombre', text: 'Nombre' }),
      el('input', {
        id: 'nombre', class: 'campo__entrada', type: 'text',
        maxlength: '28', value: borrador.nombre, autocomplete: 'off',
        onInput: (e) => { borrador.nombre = e.target.value; nombreEscrito = Boolean(e.target.value.trim()); },
      }),
    ),
    el('div', { class: 'campo retrato-descripcion' },
      el('label', { class: 'campo__eti', for: 'retrato-descripcion', text: 'Descripción' }),
      el('textarea', {
        id: 'retrato-descripcion', class: 'campo__entrada campo__entrada--retrato',
        placeholder: 'Ej.: exploradora de pelo plateado, cicatriz en la ceja, capa violeta y brújula de bronce…',
        maxlength: '360', value: borrador.retrato,
        onInput: (e) => { borrador.retrato = e.target.value; },
      }),
      el('p', { class: 'campo__ayuda', text: 'Es lo que la IA pintará. Aspecto, ropa, rasgos, gesto.' }),
    ),
    el('div', { class: 'campo lore-personaje' },
      el('label', { class: 'campo__eti', for: 'lore-personaje', text: 'Historia' }),
      el('textarea', {
        id: 'lore-personaje', class: 'campo__entrada campo__entrada--retrato campo__entrada--lore',
        placeholder: 'Ej.: crecí junto al Umbral, mi hermana desapareció tras cruzarlo y llevo su medallón. Quiero encontrarla, aunque tema lo que haya al otro lado…',
        maxlength: '1200', value: borrador.lore,
        onInput: (e) => { borrador.lore = e.target.value; },
      }),
      el('p', { class: 'campo__ayuda', text: 'Es el pasado de tu personaje: el mundo lo respeta, pero la partida la haces tú. Nada de esto se convierte en misión si tú no quieres.' }),
    ),
    campoIntensidad(),
  );

  const pie = $('#creacion-pie');
  vaciar(pie);
  pie.append(
    el('button', { class: 'btn btn--fantasma', id: 'creacion-volver', onClick: protegido('volver', () => (listarPersonajes().length ? abrirNuevaPartida() : mostrar('inicio'))) }, 'Atrás'),
    el('button', { class: 'btn btn--grande', id: 'creacion-crear', onClick: protegido('crear personaje', crearPersonajeNuevo) }, 'Crear personaje'),
  );
}

/**
 * Las tres intensidades que se ofrecen al crear, con texto de mesa.
 *
 * Se guardan en `settings.dificultad` con sus claves del motor. «Duro» queda
 * en Ajustes para quien lo quiera: aquí se elige entre tres, que es lo que se
 * decide bien sin conocer todavía el juego.
 */
const INTENSIDADES = Object.freeze([
  { valor: 'relato', nombre: 'Pacífica', texto: 'La historia manda y casi no hay peleas.' },
  { valor: 'equilibrado', nombre: 'Equilibrada', texto: 'Aventura con riesgo: se pelea cuando toca.' },
  { valor: 'implacable', nombre: 'Brutal', texto: 'El mundo muerde y caer tiene precio.' },
]);

/** Nombre de mesa de una intensidad, incluido «Dura», que solo está en Ajustes. */
function nombreIntensidad(valor) {
  return INTENSIDADES.find((i) => i.valor === valor)?.nombre
    ?? ({ duro: 'Dura' })[valor]
    ?? 'Equilibrada';
}

/** Selector de intensidad de la creación. */
function campoIntensidad() {
  const elegida = borrador.intensidad ?? 'equilibrado';
  const grupo = el('div', { class: 'intensidad', role: 'radiogroup', 'aria-labelledby': 'intensidad-eti', id: 'intensidad' });

  for (const i of INTENSIDADES) {
    grupo.append(el('button', {
      type: 'button', role: 'radio',
      class: `intensidad__opcion${i.valor === elegida ? ' es-activa' : ''}`,
      'aria-checked': String(i.valor === elegida),
      'data-intensidad': i.valor,
      onClick: (e) => {
        borrador.intensidad = i.valor;
        for (const b of grupo.querySelectorAll('button')) {
          const activa = b === e.currentTarget;
          b.classList.toggle('es-activa', activa);
          b.setAttribute('aria-checked', String(activa));
        }
      },
    },
    el('strong', { class: 'intensidad__nombre', text: i.nombre }),
    el('span', { class: 'intensidad__texto', text: i.texto })));
  }

  return el('div', { class: 'campo' },
    el('p', { class: 'campo__eti', id: 'intensidad-eti', text: 'Intensidad' }),
    grupo,
  );
}

function pintarFichaAleatoria() {
  const caja = $('#ficha-aleatoria');
  if (!caja) return;
  vaciar(caja);

  const raza = RAZAS[borrador.raza];
  const clase = CLASES[borrador.clase];
  const fondo = TRASFONDOS[borrador.trasfondo];
  const inicio = obtenerLugar(LUGAR_INICIAL[borrador.raza] ?? 'vado_yunque');

  caja.append(
    el('div', { class: 'aleatoria__cab' },
      el('p', { class: 'aleatoria__eti', text: 'Tu origen' }),
      el('button', {
        class: 'btn aleatoria__dado', id: 'creacion-aleatorio', type: 'button', title: 'Volver a tirar',
        onClick: protegido('aleatorio', () => {
          const nombreAnterior = borrador.nombre;
          tirarFicha();
          const campo = $('#nombre');
          // El nombre también se tira, salvo que el jugador ya haya escrito el suyo.
          if (nombreEscrito) borrador.nombre = nombreAnterior;
          else if (campo) campo.value = borrador.nombre;
          pintarFichaAleatoria();
          caja.classList.remove('se-tira'); void caja.offsetWidth; caja.classList.add('se-tira');
        }),
      }, el('span', { class: 'aleatoria__glifo', text: '⚄' }), ' Aleatorio'),
    ),
    el('div', { class: 'aleatoria__rasgos' },
      el('div', { class: 'aleatoria__rasgo' }, el('small', { text: 'Linaje' }), el('strong', { id: 'aleatoria-raza', text: raza?.nombre ?? '' }), el('span', { text: raza?.lema ?? '' })),
      el('div', { class: 'aleatoria__rasgo' }, el('small', { text: 'Oficio' }), el('strong', { text: clase?.nombre ?? '' }), el('span', { text: clase?.lema ?? (clase?.descripcion ?? '').slice(0, 80) })),
      el('div', { class: 'aleatoria__rasgo' }, el('small', { text: 'Pasado' }), el('strong', { text: fondo?.nombre ?? '' }), el('span', { text: fondo?.lema ?? (fondo?.descripcion ?? '').slice(0, 80) })),
    ),
    inicio ? el('p', { class: 'aleatoria__inicio', text: `Empiezas en ${inicio.nombre}.` }) : null,
  );
}

const LUGAR_INICIAL = {
  ferrano: 'forja_alta', brumal: 'pilotes_brumal', sombracorteza: 'arboleda_madre',
  crisol: 'oasis_sal', albar: 'umbral_albar', griscuerno: 'paso_yunque',
  valdes: 'vado_yunque', menudo: 'saucedo',
};

/**
 * Segundo paso: el personaje queda creado y la IA pinta su ilustración a
 * partir de la descripción. Si el generador local no está encendido, el
 * retrato procedural ocupa su lugar y el juego sigue igual.
 */
function crearPersonajeNuevo() {
  const nombre = ($('#nombre')?.value ?? '').trim();
  const descripcion = ($('#retrato-descripcion')?.value ?? '').trim();
  const lore = ($('#lore-personaje')?.value ?? '').trim();

  const faltan = [];
  if (!nombre) faltan.push(['#nombre', 'Ponle nombre al personaje.']);
  if (descripcion.length < 8) faltan.push(['#retrato-descripcion', 'Describe su aspecto: es lo que pintará la IA.']);
  if (lore.length < 8) faltan.push(['#lore-personaje', 'Cuenta un poco de su historia.']);
  if (faltan.length) {
    $(faltan[0][0])?.focus();
    avisar(faltan[0][1], 'aviso');
    return;
  }

  // Si la descripción dice quién es, manda sobre el dado: «enana guerrera» es
  // una mujer aunque la ficha aleatoria saliera en masculino.
  const genero = sexoDescrito(descripcion) ?? borrador.genero;

  personajeCreado = guardarPersonaje({ ...borrador, nombre, genero, retrato: descripcion, lore });
  pintarRevelacion(personajeCreado);
}

/**
 * Lo que el retrato necesita de una ficha o del jugador en partida.
 *
 * El `id` es la identidad de la imagen aprobada (`pj:<id>`): en partida el
 * jugador no lo lleva en su rama, lo lleva `meta.personajeId`.
 */
function fichaRetrato(x = {}, id = x.id ?? null) {
  return {
    id, raza: x.raza, nombre: x.nombre, descripcion: x.retrato, genero: x.genero,
  };
}

/** Ficha de retrato del jugador en partida. */
function fichaRetratoJugador() {
  return fichaRetrato(ver('player', {}) ?? {}, ver('meta.personajeId') ?? null);
}

function pintarRevelacion(p, eco = null) {
  const caja = $('#creacion-cuerpo');
  vaciar(caja);
  $('#creacion-titulo').textContent = p.nombre;
  $('#creacion-nota').textContent = `${RAZAS[p.raza]?.nombre ?? ''} · ${CLASES[p.clase]?.nombre ?? ''} · ${TRASFONDOS[p.trasfondo]?.nombre ?? ''} · nivel 1 · ${nombreIntensidad(p.intensidad)}`;

  const cara = el('div', { class: 'eleccion__cara revelacion__cara', id: 'creacion-cara' });
  const estado = el('p', { class: 'revelacion__estado', id: 'retrato-estado', text: '' });

  // Si la descripción nombra una especie, se dice en voz alta qué pasa con ella.
  //
  // «Enana guerrera» con una ficha de Griscúerno pintaba una enana con piel
  // gris azulada y cuernos, y el jugador no tenía forma de saber de dónde
  // salían. Ahora el retrato obedece a la descripción, pero el linaje sigue
  // decidiendo las reglas, y eso tiene que verse. No se cambia el linaje solo:
  // «enana» no es ningún linaje de este mundo por decreto, y el linaje
  // cambia rasgos de juego. Se le enseña y decide él.
  const especie = especieNombrada(p.retrato);
  const linaje = RAZAS[p.raza]?.nombre ?? '';

  const aviso = especie && linaje
    ? el('div', { class: 'revelacion__aviso', id: 'revelacion-especie' },
      el('p', { text: `Tu descripción dice «${especie}»; tu linaje en la ficha es ${linaje}. El retrato sigue tu descripción; las reglas, tu linaje.` }),
      el('button', {
        class: 'btn btn--fantasma', id: 'revelacion-cambiar-linaje',
        onClick: protegido('cambiar linaje', () => {
          // Se vuelve a la ficha con todo lo escrito y con el MISMO id, para
          // que al enviarla se corrija este personaje y no nazca un gemelo.
          Object.assign(borrador, { id: p.id, creado: p.creado, semillaRetrato: p.semillaRetrato });
          personajeCreado = null;
          mostrar('creacion');
          pintarCreacion();
        }),
      }, 'Cambiar linaje'),
    )
    : null;

  // El retrato solo se pinta si el jugador lo pide, y solo se queda si elige
  // una versión (ver `abrirEstudio`). Antes se pedía solo, a un servicio de
  // fuera, y se ponía sin preguntar.
  const opcionesRetrato = el('div', { class: 'revelacion__opciones' },
    el('button', {
      class: 'btn btn--pequeno', id: 'retrato-pintar', type: 'button',
      onClick: protegido('pintar retrato', () => abrirEstudio(encargoDePersonaje(p), {
        alTerminar: () => { pintarRetrato(cara, fichaRetrato(p)); contarRetrato(); },
      })),
    }, 'Pintar retrato'),
  );

  caja.append(el('div', { class: 'revelacion' },
    el('div', { class: 'revelacion__marco' }, cara, estado, opcionesRetrato),
    el('div', { class: 'revelacion__texto' },
      el('p', { class: 'revelacion__eti', text: 'Descripción' }),
      el('p', { class: 'revelacion__cita', text: p.retrato }),
      aviso,
      el('p', { class: 'revelacion__eti', text: 'Historia' }),
      el('p', { class: 'revelacion__cita', text: p.lore }),
    ),
  ));

  // El narrador lo resume y pregunta, y el jugador contesta con sus palabras.
  //
  // Antes, para cambiar una sola cosa había que rehacer el personaje entero.
  // Ahora se escribe «mejor que sea hombre» o «ponle una cicatriz en el ojo»
  // y se corrige esto y nada más. «Vale, empezamos» arranca la partida.
  const entrada = el('input', {
    id: 'revelacion-cambio', class: 'campo__entrada', type: 'text',
    maxlength: '160', autocomplete: 'off',
    'aria-label': 'Cambiar algo del personaje, o confirmar para empezar',
    placeholder: 'Un cambio, o «vale» para empezar',
  });

  caja.append(
    avisoHerencia() ?? '',
    el('div', { class: 'revelacion__narrador', id: 'revelacion-resumen', 'aria-live': 'polite' },
      eco ? el('p', { class: 'revelacion__eco', text: eco }) : null,
      el('p', { text: resumenPersonaje(p) }),
      el('p', { class: 'revelacion__pregunta', text: PREGUNTA_CREACION }),
    ),
    el('form', {
      class: 'revelacion__cambio', id: 'revelacion-form',
      onSubmit: protegido('corregir personaje', (e) => {
        e.preventDefault();
        corregirPersonaje(p, entrada.value);
      }),
    }, entrada),
    el('p', { class: 'campo__ayuda', text: 'Por ejemplo: «que sea hombre», «ponle una cicatriz en el ojo», «que se llame Brun», «más joven». O «vale, empezamos».' }),
  );

  // Qué hay: su retrato elegido, o nada todavía (y cómo tenerlo).
  const contarRetrato = () => {
    const hay = Boolean(urlAprobada(claveRetrato(fichaRetrato(p))));
    estado.textContent = hay
      ? 'Este es el retrato que elegiste. Puedes pintar otro cuando quieras.'
      : 'Sin retrato todavía. Si tienes el generador de imágenes en este equipo, píntalo; si no, se juega igual.';
    estado.dataset.estado = hay ? 'listo' : 'sin';
  };
  pintarRetrato(cara, fichaRetrato(p));
  contarRetrato();

  const pie = $('#creacion-pie');
  vaciar(pie);
  pie.append(
    el('button', { class: 'btn btn--fantasma', id: 'creacion-otro', onClick: protegido('nuevo personaje', () => abrirCreacion()) }, 'Crear otro'),
    el('button', { class: 'btn btn--grande', id: 'creacion-empezar', onClick: protegido('comenzar partida', () => comenzarPartida(p)) }, 'Comenzar partida'),
  );
}

/**
 * Empieza una crónica nueva con un personaje del plantel, siempre a nivel 1.
 *
 * Si en esta sesión ya se jugó otra partida, se recarga la página antes: los
 * sistemas guardan estado propio (mundo, memoria del máster, eventos) y
 * empezar limpio es la única forma segura de no heredar nada de la anterior.
 */
/**
 * Aplica lo que el jugador ha escrito en la revelación.
 *
 * Lo que no se menciona se conserva, también el retrato elegido: no se
 * vuelve a pintar solo.
 *
 * @param {Object} p
 * @param {string} texto
 */
function corregirPersonaje(p, texto) {
  const r = aplicarCorreccion(p, texto);

  if (r.confirmar) { comenzarPartida(p); return; }

  if (!r.entendido) {
    pintarRevelacion(p, 'No te he entendido del todo. Prueba con «que sea hombre», «que sea elfa», «ponle una cicatriz en el ojo», «que se llame Brun» o «más joven».');
    $('#revelacion-cambio')?.focus();
    return;
  }

  // Mismo id: se corrige este personaje, no nace otro. El retrato elegido se
  // queda con él; si ya no se parece, el jugador pinta otro.
  personajeCreado = guardarPersonaje({ ...r.personaje });
  pintarRevelacion(personajeCreado, r.cambios.join(' '));
  $('#revelacion-cambio')?.focus();
}

/**
 * Una creación a la vez en esta pestaña: el doble clic o un Enter repetido
 * no crean dos personajes. Entre pestañas mandan los candados (el de la
 * herencia y el GLOBAL de ranuras, en `persistence/Ranuras.js`). Si algo
 * falla después de crear en memoria, se queda puesto: ese personaje no se
 * puede jugar ni guardar, solo recargar.
 */
let creandoPartida = false;

/** El run de una partida SIN herencia mientras se elige ranura (sin recargar). */
let runSinHerencia = null;

/** Lo que hay que recordar para reintentar ESTA creación tras recargar. */
function recordarCreacion(p) {
  try {
    sessionStorage.setItem('arcanveil:comenzar', p.id);
    if (herencia.elegida) {
      sessionStorage.setItem('arcanveil:comenzar-legado', JSON.stringify({ runOrigen: herencia.elegida.runOrigen, transaccion: herencia.transaccion, runDestino: herencia.runDestino }));
    } else sessionStorage.removeItem('arcanveil:comenzar-legado');
  } catch { /* sin sesión: se vuelve al menú */ }
}

/**
 * Empieza una crónica nueva con un personaje del plantel, con o sin herencia.
 *
 * La ranura NO se elige aquí: la elige el protocolo bajo el candado global
 * (la primera libre, releída en ese momento). Si no queda ninguna, se abre
 * el selector de ranuras llenas y se vuelve aquí con un permiso concreto.
 *
 * @param {Object} p
 * @param {{ranura?: string|null, reemplazo?: Object|null}} [destino]
 */
async function comenzarPartida(p, { ranura = null, reemplazo = null } = {}) {
  if (creandoPartida) return;
  if (ver('player.raza')) {
    // Con otra partida cargada: se guarda (comprobado) antes de recargar.
    salirConGuardado(() => {
      recordarCreacion(p);
      location.reload();
    });
    return;
  }
  creandoPartida = true;

  activarPersistencia();
  store.fijar('meta.personajeId', p.id);
  // La intensidad elegida al crear es de esta partida: la leen los encuentros,
  // el tamaño de los grupos, la caída y el tono del narrador.
  store.fijar('settings.dificultad', p.intensidad ?? 'equilibrado');

  const borrador = {
    nombre: p.nombre, raza: p.raza, clase: p.clase, trasfondo: p.trasfondo,
    retrato: p.retrato ?? '', lore: p.lore ?? '',
    genero: p.genero, semillaRetrato: p.semillaRetrato,
  };
  // Guarda con el arriendo del candado global que ya tiene la creación (no
  // lo vuelve a pedir: sin interbloqueo) y con la operación que reservó la
  // ranura. Espera al resultado real.
  const guardar = async ({ ranura: slot, lease, op }) => {
    const g = await sistema('saves')?.guardar(slot, { silencioso: true, nota: 'crónica', lease, op });
    return { ok: Boolean(g?.exito), motivo: g?.motivo ?? 'no hay partida que guardar', texto: g?.texto, intentado: g?.intentado };
  };

  let r;
  if (herencia.elegida) {
    herencia.runDestino ??= nuevoRunId();
    const runDestino = herencia.runDestino;
    r = await Entrega.entregarLegado({
      runOrigen: herencia.elegida.runOrigen, transaccion: herencia.transaccion, runDestino, ranura, reemplazo,
      crear: async ({ cantidad, legado, ranura: slot }) => {
        store.fijar('meta.ranura', slot);
        await Entrega.crearEnMotor(store, { borrador, runDestino, cantidad, legado });
      },
      guardar,
    });
  } else {
    runSinHerencia ??= nuevoRunId();
    const runDestino = runSinHerencia;
    r = await Entrega.crearPartidaNueva({
      runDestino, ranura, reemplazo,
      crear: async ({ ranura: slot }) => {
        store.fijar('meta.ranura', slot);
        store.dispatch('player/crear', { borrador, runId: runDestino });
        await new Promise((ok) => setTimeout(ok, 0));
      },
      guardar,
    });
  }

  if (r.ok && r.yaHecho) {
    // Esta misma creación ya se entregó antes (recarga tras guardarse): se
    // abre ese personaje, no se crea otro.
    creandoPartida = false;
    Object.assign(herencia, { elegida: null, transaccion: null, runDestino: null });
    await cargarRanura(r.ranura);
    return;
  }
  if (!r.ok) {
    // Sin sitio (o el elegido cambió): nada se ha creado todavía, se elige.
    if (['sin-ranura', 'ranura-ocupada', 'permiso-caducado'].includes(r.codigo)) {
      creandoPartida = false;
      if (r.codigo !== 'sin-ranura') avisar(r.motivo, 'aviso');
      abrirRanurasLlenas(p, r.codigo === 'sin-ranura' ? r.campanas : await Ranuras.ocupacion(), r.codigo === 'sin-ranura' ? null : r.motivo);
      return;
    }
    mostrarFalloCreacion(p, r);
    return;
  }

  mostrar('juego');
  refrescarTodo();

  const turns = sistema('turns');
  await turns?.abrirCronica?.();

  refrescarTodo();
  await guardarPartidaActual({ avisarSiFalla: true });
  programarSugerencias();
  if (herencia.elegida) {
    avisar(`Has heredado ${r.cantidad} XP de ${herencia.elegida.origen.nombre ?? 'tu personaje anterior'}: empiezas en el nivel ${ver('player.nivel') ?? 1}.`, 'exito');
  }
  Object.assign(herencia, { elegida: null, transaccion: null, runDestino: null });
  runSinHerencia = null;
  creandoPartida = false;
}

/**
 * Lo que se dice cuando la creación falla. El texto sale del estado
 * VERIFICADO: si la herencia volvió a pendiente, se dice; si no se puede
 * comprobar, se dice eso y nada más (sin prometer «no has perdido nada»).
 */
function mostrarFalloCreacion(p, r) {
  const v = herencia.elegida;
  const nombre = v?.origen?.nombre ?? 'tu personaje anterior';
  const recargar = (conCreacion) => {
    if (conCreacion) recordarCreacion(p);
    else { try { sessionStorage.setItem('arcanveil:abrir-menu', '1'); } catch { /* portada */ } }
    location.reload();
  };
  const botones = [];
  let titulo = v ? 'No se ha podido empezar con la herencia' : 'No se ha podido empezar la partida';
  let nota = `${r.motivo ?? ''} ${r.nota ?? ''}`.trim();
  if (r.bloqueado || r.codigo === 'verificacion' || r.codigo === 'bloqueado-verificacion') {
    titulo = 'No puedo comprobar la entrega';
    nota = `${r.nota ?? r.motivo} La herencia de ${nombre} queda apartada hasta poder comprobarla.`;
    botones.push(['Volver a comprobar', async () => {
      const res = await Entrega.recuperarLegados();
      const sigue = res.some((x) => x.bloqueado);
      avisar(sigue ? 'Sigue sin poder comprobarse. No se ha tocado nada.' : 'Comprobado: ya se puede seguir desde el menú.', sigue ? 'aviso' : 'exito');
      if (!sigue) recargar(false);
    }, 'btn btn--grande']);
  } else if (r.codigo === 'entregado' && r.ranura) {
    botones.push(['Continuar con ese personaje', () => { try { sessionStorage.setItem('arcanveil:cargar', r.ranura); } catch { /* menú */ } location.reload(); }, 'btn btn--grande']);
  } else if (['ocupado', 'ocupado-global', 'guardado', 'almacenamiento', 'conflicto', 'crear'].includes(r.codigo)) {
    botones.push(['Reintentar', () => recargar(true), 'btn btn--grande']);
  }
  if (v && ['sin-exclusion', 'bloqueado', 'no-muerto', 'sin-legado', 'entregado', 'token-destino'].includes(r.codigo)) {
    botones.push(['Empezar sin herencia', () => { Object.assign(herencia, { elegida: null, transaccion: null, runDestino: null }); recargar(true); }, 'btn']);
  }
  botones.push(['Volver al menú', () => recargar(false), 'btn btn--fantasma']);
  mostrarSalida(titulo, nota, botones);
}

/* ── ranuras llenas: elegir cuál reemplazar, con permiso concreto ─────── */

/** Fecha corta de una campaña. */
const fechaCampana = (t) => (Number.isFinite(t) ? new Date(t).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' }) : 'sin fecha');

/** Descarga una copia LOCAL de los bytes de una ranura (nada sale del equipo). */
async function descargarCopiaRanura(ranura, nombre = 'partida') {
  // La copia AUTORITATIVA (la caché local puede ir atrasada); si no la hay,
  // lo que tenga la ranura local (datos dañados incluidos, tal cual).
  let texto = null;
  try {
    const l = await Ranuras.leerRanuraCoordinada(ranura);
    texto = l.texto ?? l.local?.texto ?? null;
  } catch { /* abajo */ }
  if (texto === null) { try { texto = localStorage.getItem(`${Ranuras.PREFIJO}${ranura}`); } catch { /* abajo */ } }
  if (texto === null) { avisar('No se ha podido leer esa ranura.', 'aviso'); return; }
  const url = URL.createObjectURL(new Blob([texto], { type: 'application/json' }));
  const a = el('a', { href: url, download: `arcanveil-ranura-${ranura}-${String(nombre).replace(/[^\p{L}\p{N}_-]+/gu, '_')}.json` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * No queda ranura libre: se enseñan las campañas y se elige una para
 * reemplazar, o se cancela. Abrir esto no gasta nada ni toca ninguna ranura.
 * El permiso queda atado a la ranura, el run, la fecha y la huella de lo que
 * se leyó: si otra pestaña la cambia antes de confirmar, caduca.
 */
function abrirRanurasLlenas(p, campanas, motivo = null) {
  const modal = $('#ranuras-modal');
  const lista = $('#ranuras-lista');
  const acciones = $('#ranuras-acciones');
  const nota = $('#ranuras-nota');
  const cerrar = () => { modal.hidden = true; modal.dataset.etapa = ''; };
  const pintarLista = () => {
    modal.dataset.etapa = 'lista';
    $('#ranuras-titulo').textContent = 'No queda ninguna ranura libre';
    // Si se vuelve aquí porque lo elegido cambió, el porqué va dentro del
    // selector (el aviso de la esquina queda tapado por el propio modal).
    nota.textContent = `${motivo ? `${motivo} ` : ''}Para empezar esta partida hay que reemplazar una campaña guardada. Elige cuál, descarga antes una copia si la quieres conservar, o cancela: no se ha tocado nada.`;
    vaciar(lista);
    vaciar(acciones);
    for (const c of campanas) {
      const elegible = c.estado === 'ocupada' || c.estado === 'ilegible';
      const texto = c.estado === 'ocupada'
        ? `${c.nombre} · nivel ${c.nivel ?? '?'} · ${c.muerto ? 'muerto' : 'vivo'} · ${fechaCampana(c.guardadoEn)}${c.vinculo ? ` · ${c.vinculo}` : ''}`
        : c.estado === 'ilegible' ? `Datos dañados (${c.motivo ?? 'no se pueden leer'})`
          : c.estado === 'reservada' ? 'Apartada por una entrega de herencia sin cerrar' : (c.motivo ?? c.estado);
      lista.append(el('div', { class: `ranura-fila${elegible ? '' : ' ranura-fila--bloqueada'}`, dataset: { ranura: c.ranura } },
        el('span', { class: 'ranura-fila__texto' },
          el('strong', { text: `Ranura ${c.ranura}` }),
          el('span', { text: texto }),
          c.runId ? el('span', { class: 'ranura-fila__run', text: c.runId }) : null,
        ),
        el('span', { class: 'ranura-fila__botones' },
          elegible ? el('button', { class: 'btn btn--pequeno btn--fantasma', type: 'button', onClick: protegido('descargar copia', () => descargarCopiaRanura(c.ranura, c.nombre)) }, 'Descargar copia') : null,
          elegible ? el('button', { class: 'btn btn--pequeno', type: 'button', dataset: { reemplazar: c.ranura }, onClick: protegido('elegir ranura', () => pintarConfirmar(c)) }, 'Reemplazar…') : null,
        ),
      ));
    }
    acciones.append(el('button', { class: 'btn', id: 'ranuras-cancelar', type: 'button', onClick: () => { cerrar(); $('#personajes-comenzar, #creacion-empezar')?.focus(); } }, 'Cancelar'));
    // El foco, en lo que no toca nada. Después del gestor genérico de
    // modales (que al abrir enfoca el primer botón, aquí «Descargar copia»).
    $('#ranuras-cancelar').focus();
    setTimeout(() => $('#ranuras-cancelar')?.focus(), 0);
  };
  const pintarConfirmar = (c) => {
    modal.dataset.etapa = 'confirmar';
    $('#ranuras-titulo').textContent = `Reemplazar la ranura ${c.ranura}`;
    nota.textContent = c.estado === 'ocupada'
      ? `Se borrará para siempre la campaña de ${c.nombre} (nivel ${c.nivel ?? '?'}, ${c.muerto ? 'muerto' : 'vivo'}, guardada ${fechaCampana(c.guardadoEn)}) y en su lugar empezará la de ${p.nombre}. Esto no se puede deshacer.`
      : `Se borrarán para siempre los datos dañados de la ranura ${c.ranura} y en su lugar empezará la de ${p.nombre}. Esto no se puede deshacer.`;
    vaciar(lista);
    vaciar(acciones);
    acciones.append(
      el('button', { class: 'btn', id: 'ranuras-volver', type: 'button', onClick: () => pintarLista() }, 'Volver'),
      el('button', { class: 'btn btn--peligro', id: 'ranuras-confirmar', type: 'button', onClick: protegido('reemplazar ranura', () => {
        cerrar();
        comenzarPartida(p, { ranura: c.ranura, reemplazo: { ranura: c.ranura, runId: c.runId ?? null, guardadoEn: c.guardadoEn ?? null, huella: c.huella ?? null, rev: c.rev ?? null } });
      }) }, 'Reemplazar y empezar'),
    );
    $('#ranuras-volver').focus();
  };
  modal.hidden = false;
  pintarLista();
}

/** Tras la recarga de `comenzarPartida`, arranca directamente la crónica. */
async function comenzarPendiente() {
  let id = null;
  let legado = null;
  try {
    id = sessionStorage.getItem('arcanveil:comenzar'); sessionStorage.removeItem('arcanveil:comenzar');
    legado = JSON.parse(sessionStorage.getItem('arcanveil:comenzar-legado') ?? 'null'); sessionStorage.removeItem('arcanveil:comenzar-legado');
  } catch { /* sin sesión */ }
  const p = id ? obtenerPersonaje(id) : null;
  if (!p) return false;
  if (legado?.runOrigen && legado.transaccion) {
    const v = (await Entrega.listarLegados()).find((x) => x.runOrigen === legado.runOrigen);
    // La misma operación (token y destino): si la entrega anterior llegó a
    // guardarse, se reconoce como hecha; si no, se intenta de nuevo, una vez.
    if (v) Object.assign(herencia, { elegida: v, transaccion: legado.transaccion, runDestino: legado.runDestino ?? null });
  }
  comenzarPartida(p);
  return true;
}

/* ── ajustes ──────────────────────────────────────────────────────────── */

const AJUSTES_DEFECTO = { velocidadTexto: 'normal', esperaSugerencias: 7 };

function leerAjustes() {
  try { return { ...AJUSTES_DEFECTO, ...JSON.parse(localStorage.getItem('arcanveil:prefs:juego') ?? '{}') }; } catch { return { ...AJUSTES_DEFECTO }; }
}

function guardarAjustes(cambios) {
  const nuevos = { ...leerAjustes(), ...cambios };
  try { localStorage.setItem('arcanveil:prefs:juego', JSON.stringify(nuevos)); } catch { /* sin almacenamiento */ }
  return nuevos;
}

function abrirAjustes() {
  const a = leerAjustes();
  const caja = $('#ajustes-cuerpo');
  vaciar(caja);

  const grupo = (titulo, clave, opciones) => el('div', { class: 'ajuste' },
    el('p', { class: 'sub-eti', text: titulo }),
    el('div', { class: 'ajuste__opciones' }, ...opciones.map(([valor, eti]) => el('button', {
      class: 'ficha ajuste__opcion' + (String(a[clave]) === String(valor) ? ' es-elegida' : ''),
      dataset: { ajuste: clave, valor: String(valor) },
      onClick: () => { guardarAjustes({ [clave]: valor }); abrirAjustes(); },
    }, eti))),
  );

  // La intensidad es de la partida en curso, no una preferencia del
  // navegador: se guarda con ella. Aquí están las cuatro, «Dura» incluida,
  // que en la creación no se ofrece.
  const enPartida = Boolean(ver('player.raza'));
  const actual = ver('settings.dificultad', 'equilibrado');
  const intensidad = enPartida
    ? el('div', { class: 'ajuste' },
      el('p', { class: 'sub-eti', text: 'Intensidad de esta partida' }),
      el('div', { class: 'ajuste__opciones', id: 'ajuste-intensidad' },
        ...['relato', 'equilibrado', 'duro', 'implacable'].map((valor) => el('button', {
          class: `ficha ajuste__opcion${valor === actual ? ' es-elegida' : ''}`,
          dataset: { intensidad: valor },
          onClick: protegido('cambiar intensidad', () => {
            store.fijar('settings.dificultad', valor);
            guardarTrasTurno();
            abrirAjustes();
          }),
        }, nombreIntensidad(valor)))),
    )
    : null;

  caja.append(
    intensidad,
    grupo('Aparición del texto', 'velocidadTexto', [['lenta', 'Pausada'], ['normal', 'Normal'], ['rapida', 'Rápida'], ['instantanea', 'Instantánea']]),
    grupo('Sugerencias si no escribes', 'esperaSugerencias', [[5, 'A los 5 s'], [7, 'A los 7 s'], [10, 'A los 10 s'], [0, 'Nunca']]),
    el('div', { class: 'ajuste' },
      el('p', { class: 'sub-eti', text: 'Máster' }),
      el('button', { class: 'btn', onClick: () => { $('#ajustes-modal').hidden = true; abrirNarrador(); } }, 'Elegir narrador e IA'),
    ),
    el('div', { class: 'ajuste' },
      el('p', { class: 'sub-eti', text: 'Datos' }),
      el('button', {
        class: 'btn btn--peligro', id: 'ajustes-borrar',
        onClick: protegido('borrar datos', async () => {
          if (!confirm('¿Borrar todas las partidas, personajes y retratos elegidos guardados en este navegador?')) return;
          await sistema('saves')?.borrarTodo?.();
          try { Object.keys(localStorage).filter((k) => k.startsWith('arcanveil:')).forEach((k) => localStorage.removeItem(k)); } catch { /* nada */ }
          // Los retratos elegidos viven en IndexedDB: se esperan, y si el
          // navegador no deja, se dice. Antes se quedaban y volvían al recargar.
          const galeria = await borrarGaleria();
          // Las candidatas del generador están en otro programa de este PC: se
          // piden borrar; si no está en marcha, se dice cómo.
          const puente = await olvidarCandidatas({ todas: true });
          $('#ajustes-modal').hidden = true;
          pintarInicio();
          if (!galeria.ok) {
            avisar(`Partidas y personajes borrados, pero no los retratos elegidos: ${galeria.motivo}. Prueba otra vez.`, 'aviso');
            return;
          }
          avisar(puente.ok
            ? 'Borrados partidas, personajes, retratos elegidos y las candidatas del generador.'
            : 'Borrados partidas, personajes y retratos elegidos. Si usaste el generador de imágenes, sus candidatas (en este PC) caducan en 24 h o se borran con: node tools/imagen-local-proxy.mjs --limpiar', puente.ok ? 'exito' : 'info');
        }),
      }, 'Borrar partidas y personajes'),
    ),
  );

  $('#ajustes-modal').hidden = false;
}

function abrirNarrador() {
  pintarDirectores();
  $('#ia-url').value = ver('settings.urlLocal', '') || 'http://127.0.0.1:11434';
  $('#ia-modelo').value = ver('settings.modeloLocal', '') || '';
  $('#groq-url').value = ver('settings.urlGroq', '') || 'http://127.0.0.1:11436';
  // El permiso es de esta sesión: se ve marcado solo si se dio en ella.
  $('#groq-consiento').checked = sistema('dungeonmaster')?.proveedor(PROVEEDORES.GROQ)?.inspeccionar?.().consentido === true;
  $('#groq-activar').disabled = true;
  $('#groq-estado').textContent = '';
  mostrarPanelNarrador(null);
  $('#director-modal').hidden = false;
}

/** Enseña el panel de configuración de un narrador (o ninguno). */
function mostrarPanelNarrador(id) {
  $('#ia-groq').hidden = id !== PROVEEDORES.GROQ;
  $('#ia-local').hidden = id !== PROVEEDORES.LOCAL;
}

/**
 * Probar Groq: pide al puente la lista de modelos. No genera nada ni envía
 * la partida. Sin el consentimiento marcado no se prueba.
 */
async function probarGroq() {
  const estado = $('#groq-estado');
  const activar = $('#groq-activar');
  activar.disabled = true;
  // Probar no necesita el permiso de enviar la historia: solo pide la lista
  // de modelos. Ese permiso hace falta para «Usar IA Groq».
  const groq = sistema('dungeonmaster')?.proveedor(PROVEEDORES.GROQ);
  groq?.configurar({ url: ($('#groq-url').value ?? '').trim() });
  estado.textContent = 'Comprobando el puente…';
  const r = await groq.probar();
  if (!r.ok) {
    estado.textContent = r.motivo + (/Origen/.test(r.motivo ?? '') ? ' Abre el juego en http://localhost:8080.' : '');
    return;
  }
  const uso = r.estado?.usoHoy;
  estado.textContent = 'Conectado al puente y a openai/gpt-oss-120b (no se ha enviado nada de tu partida).' + (uso ? ' Hoy: ' + uso.peticiones + ' peticiones y ' + uso.tokens + ' tokens de este puente.' : '')
    + (r.estado?.pausa ? ' En pausa: ' + r.estado.pausa.motivo + '.' : '')
    + ($('#groq-consiento').checked ? '' : ' Para usarla, marca antes la casilla de envío.');
  activar.disabled = !$('#groq-consiento').checked;
}

function activarGroq() {
  if (!$('#groq-consiento').checked) return;
  const dm = sistema('dungeonmaster');
  const url = ($('#groq-url').value ?? '').trim();
  dm?.proveedor(PROVEEDORES.GROQ)?.configurar({ url, consentido: true });
  store.fijar('settings.urlGroq', url);
  const r = dm?.cambiar(PROVEEDORES.GROQ);
  if (!r?.exito || r.motivo) { avisar(r?.motivo ?? 'No se pudo activar Groq', 'aviso'); return; }
  store.fijar('settings.proveedor', PROVEEDORES.GROQ);
  avisar('Narra la IA Groq. Si falla o se agota la cuota, sigue el procedural.', 'exito');
  $('#director-modal').hidden = true;
  pintarNarrador();
}

/** Retirar el consentimiento: deja de enviarse nada desde ya. */
function retirarConsentimientoGroq() {
  const dm = sistema('dungeonmaster');
  const groq = dm?.proveedor(PROVEEDORES.GROQ);
  // Marcar solo habilita «Usar» si ya se probó en esta sesión; el permiso se
  // da al pulsar «Usar IA Groq», no al marcar.
  if ($('#groq-consiento').checked) {
    $('#groq-activar').disabled = !groq?.inspeccionar?.().verificado;
    $('#groq-estado').textContent = $('#groq-estado').textContent.replace(' Para usarla, marca antes la casilla de envío.', '');
    return;
  }
  groq?.configurar({ consentido: false });
  $('#groq-activar').disabled = true;
  if (dm?.inspeccionar?.()?.elegido === PROVEEDORES.GROQ) {
    dm.cambiar(PROVEEDORES.PROCEDURAL);
    store.fijar('settings.proveedor', PROVEEDORES.PROCEDURAL);
    avisar('Groq desactivado: no se envía nada más. Narra el procedural.', 'info');
    pintarDirectores();
    pintarNarrador();
  }
}

/**
 * Quién narra ahora, siempre a la vista: en el botón del narrador. Si la IA
 * elegida ha fallado y narra el respaldo, se ve.
 */
function pintarNarrador() {
  const boton = $('#director');
  if (!boton) return;
  const dm = sistema('dungeonmaster');
  const elegido = dm?.inspeccionar?.()?.elegido ?? PROVEEDORES.PROCEDURAL;
  const meta = ver('meta.narrador', null);
  const groq = dm?.proveedor?.(PROVEEDORES.GROQ)?.inspeccionar?.();
  const sinConfirmar = elegido === PROVEEDORES.GROQ && !(groq?.consentido && groq?.verificado);
  const respaldo = !sinConfirmar && (Boolean(meta?.respaldo) || (elegido !== PROVEEDORES.PROCEDURAL && dm?.proveedorId === PROVEEDORES.PROCEDURAL));
  const corto = { [PROVEEDORES.GROQ]: 'IA Groq', [PROVEEDORES.LOCAL]: 'IA local', [PROVEEDORES.PUENTE]: 'Puente', [PROVEEDORES.PROCEDURAL]: 'Procedural' };
  boton.textContent = sinConfirmar ? 'Narrador: Groq sin confirmar' : respaldo ? 'Narrador: respaldo' : 'Narrador: ' + (corto[elegido] ?? 'Procedural');
  boton.title = sinConfirmar ? 'No se envía nada a Groq hasta que lo confirmes en esta sesión; narra el procedural.'
    : respaldo ? 'La IA elegida no responde; narra el procedural hasta que vuelva.' : 'Quién narra la aventura';
  boton.classList.toggle('es-respaldo', respaldo);
}

/* ═══════════════════════════════════════════════════════════════════════════
   PANTALLA DE JUEGO
   ═══════════════════════════════════════════════════════════════════════════ */

function refrescarTodo() {
  pintarEscena();
  pintarBitacora();
  pintarPersonaje();
  pintarLateral();
  pintarOpciones();
  pintarCabecera();
  pintarCombate();
}

/* ── escena ───────────────────────────────────────────────────────────── */

/** Nombres legibles de las franjas horarias. */
const FRANJAS_TEXTO = {
  madrugada: 'madrugada', alba: 'al alba', manana: 'por la mañana',
  mediodia: 'a mediodía', tarde: 'por la tarde', ocaso: 'al ocaso',
  noche: 'de noche',
};

/**
 * Pinta la ilustración del lugar y su rótulo.
 *
 * El arte depende del lugar, de la franja y del clima, así que esto se llama
 * en cada refresco. `pintarLugar` compara una firma y no repinta si nada ha
 * cambiado, que es lo que evita el parpadeo turno a turno.
 */
function pintarEscena() {
  const lugar = obtenerLugar(ver('world.ubicacion'));
  if (!lugar) return;

  const t = ver('world.tiempo', {}) ?? {};
  const clima = ver('world.clima.actual', 'despejado');
  // Las entradas de región son ilustraciones clave. El resto del viaje usa
  // paisaje 100% procedural; en estas seis, el raster recibe encima la misma
  // hora, clima y partículas del mundo vivo.
  const hitosRegion = new Set([
    'vado_yunque', 'arboleda_madre', 'forja_alta',
    'pilotes_brumal', 'umbral_albar', 'oasis_sal',
  ]);
  const momentoClave = hitosRegion.has(lugar.refId);

  // El paisaje del sitio (procedural, o la ilustración que trae el juego en
  // los hitos). Ya no se pide una ilustración a un servicio de fuera en cada
  // cambio de escena: `pintarLugar` no repinta si nada ha cambiado.
  pintarLugar($('#escena-lienzo'), lugar, { franja: t.franja, clima, momentoClave });

  const rotulo = $('#escena-rotulo');
  if (!rotulo) return;

  vaciar(rotulo);

  const plegada = escenaPlegada();
  $('#escena')?.classList.toggle('escena--plegada', plegada);

  rotulo.append(
    el('span', { class: 'escena__lugar', text: lugar.nombre }),
    el('span', { class: 'escena__dato', text: `día ${t.dia ?? 1}` }),
    el('span', { class: 'escena__sep', text: '·' }),
    el('span', { class: 'escena__dato', text: FRANJAS_TEXTO[t.franja] ?? '' }),
    el('span', { class: 'escena__sep', text: '·' }),
    el('span', { class: 'escena__dato', text: clima }),
    el('button', {
      class: 'escena__plegar', id: 'escena-plegar', type: 'button',
      'aria-expanded': String(!plegada),
      'aria-label': plegada ? 'Desplegar la ilustración' : 'Plegar la ilustración',
      title: plegada ? 'Desplegar' : 'Plegar',
      onClick: protegido('plegar escena', () => {
        guardarAjustes({ escenaPlegada: !plegada });
        pintarEscena();
      }),
    }, plegada ? '▾' : '▴'),
  );
}

/**
 * ¿La cabecera de escena va plegada?
 *
 * Es una preferencia del jugador y se recuerda. Si nunca la ha tocado, en
 * pantallas bajas —un móvil tumbado, uno pequeño— empieza plegada: la
 * ilustración se comería media pantalla y no quedaría sitio para leer.
 */
function escenaPlegada() {
  const guardada = leerAjustes().escenaPlegada;
  return typeof guardada === 'boolean' ? guardada : window.innerHeight < 700;
}

/* ── estudio de retratos ──────────────────────────────────────────────── */

/**
 * Lo que se le pide al generador para un personaje del jugador: el sujeto
 * en inglés (ver `src/art/rasgos.js`), su clave estable y su nombre.
 */
function encargoDePersonaje(p, id = p.id) {
  return {
    tipo: 'personaje',
    clave: claveRetrato({ id }),
    nombre: p.nombre ?? '',
    descripcion: sujetoRetrato({ raza: p.raza, descripcion: p.retrato ?? p.descripcion, genero: p.genero }) ?? '',
  };
}

/** Lo mismo para un compañero o personaje con nombre. */
function encargoDePnj(f) {
  return {
    tipo: 'pnj',
    clave: claveRetrato({ refId: f.refId }),
    nombre: f.nombre ?? '',
    rol: f.rol,
    descripcion: sujetoRetrato({ raza: f.linaje, descripcion: f.descripcion ?? `${f.rol ?? ''} ${f.nombre ?? ''}`, genero: f.genero }) ?? '',
  };
}

/** Por dónde va cada clave: «Otra versión» sigue contando al volver a abrir. */
const variantes = new Map();

/**
 * El estudio: pintar, ver la candidata en privado, pedir otra versión y,
 * solo si el jugador quiere, quedársela.
 *
 * Nada se pinta sin que el jugador lo pida. Qué pasa con lo pedido se dice
 * antes de pintar, según el proveedor del puente: con ComfyUI no sale del
 * PC; con uno en la nube se enseña lo que viaja y hay que permitirlo. Las
 * candidatas quedan en la caché temporal del puente mientras el estudio está
 * abierto (volver a una versión no la repinta) y se olvidan al cerrarlo;
 * solo «Usar esta versión» guarda una en la galería del navegador (ver
 * `src/art/galeria.js`). Nunca en combate.
 *
 * @param {{tipo: string, clave: string, nombre: string, descripcion: string, rol?: string}} encargo
 * @param {{alTerminar?: Function}} [op]
 */
function abrirEstudio(encargo, { alTerminar } = {}) {
  if (ver('combat.activo', false)) {
    avisar('En combate no se pinta: termina la pelea primero.', 'aviso');
    return;
  }
  if (!encargo?.clave) {
    avisar('Este personaje no tiene identidad guardada: no se le puede asignar un retrato.', 'aviso');
    return;
  }
  document.getElementById('estudio')?.remove();

  const control = new AbortController();
  let peticion = 0;
  let candidata = null;          // { blob, url, variante }
  let estilo = null;

  const lienzo = el('div', { class: 'estudio__lienzo eleccion__cara', 'aria-live': 'polite' });
  const estado = el('p', { class: 'estudio__estado', role: 'status' });
  const pintar = el('button', { class: 'btn', id: 'estudio-pintar', type: 'button' }, 'Pintar');
  const otra = el('button', { class: 'btn btn--fantasma', id: 'estudio-otra', type: 'button', hidden: true }, 'Otra versión');
  const usar = el('button', { class: 'btn', id: 'estudio-usar', type: 'button', hidden: true }, 'Usar esta versión');
  const cerrar = el('button', { class: 'btn btn--fantasma', id: 'estudio-cerrar', type: 'button' }, 'Cerrar');
  const nota = el('p', { class: 'estudio__nota', id: 'estudio-nota', text: 'Mirando qué generador hay…' });
  // Solo con un proveedor en la nube: permiso expreso antes de enviar nada.
  const permiso = el('input', { type: 'checkbox', id: 'estudio-permiso' });
  const cajaPermiso = el('label', { class: 'estudio__permiso', for: 'estudio-permiso', hidden: true }, permiso, el('span', { id: 'estudio-permiso-texto' }));

  const dialogo = el('dialog', { class: 'estudio', id: 'estudio', 'aria-labelledby': 'estudio-titulo', 'aria-describedby': 'estudio-nota' },
    el('h2', { class: 'estudio__titulo', id: 'estudio-titulo', text: `Retrato de ${encargo.nombre || 'tu personaje'}` }),
    nota, cajaPermiso,
    lienzo, estado,
    el('div', { class: 'estudio__acciones' }, pintar, otra, usar, cerrar),
  );

  const soltar = () => { if (candidata?.url) URL.revokeObjectURL(candidata.url); candidata = null; };
  let necesitaPermiso = false;
  const ocupado = (si) => {
    for (const b of [pintar, otra, usar]) b.disabled = si;
    if (!si && necesitaPermiso && !permiso.checked) { pintar.disabled = true; otra.disabled = true; }
  };
  const actual = () => {
    // Lo que hay ahora: su retrato elegido, o el marcador.
    pintarRetrato(lienzo, { claveImagen: encargo.clave, nombre: encargo.nombre });
  };

  async function pedir(variante) {
    const esta = ++peticion;
    ocupado(true);
    estado.textContent = 'Pintando en tu equipo… puede tardar un minuto.';
    lienzo.dataset.estado = 'generando';
    try {
      const r = await pedirCandidata(encargo, { variante, signal: control.signal });
      if (esta !== peticion || !dialogo.isConnected) return;   // llegó tarde: ya se pidió otra
      soltar();
      candidata = { blob: r.blob, url: URL.createObjectURL(r.blob), variante };
      variantes.set(encargo.clave, variante);
      const img = el('img', { class: 'arte arte--imagen estudio__candidata', alt: `Versión ${variante + 1} del retrato de ${encargo.nombre}` });
      img.src = candidata.url;
      lienzo.dataset.firmaArte = '';
      lienzo.replaceChildren(img);
      estado.textContent = `Versión ${variante + 1}. ¿Te la quedas o pides otra?`;
      pintar.hidden = true; otra.hidden = false; usar.hidden = false;
    } catch (e) {
      if (esta !== peticion || !dialogo.isConnected) return;
      estado.textContent = e.message;
    } finally {
      if (esta === peticion) { ocupado(false); delete lienzo.dataset.estado; }
    }
  }

  pintar.addEventListener('click', protegido('pintar candidata', () => pedir((variantes.get(encargo.clave) ?? -1) + 1)));
  otra.addEventListener('click', protegido('otra versión', () => pedir((candidata?.variante ?? variantes.get(encargo.clave) ?? 0) + 1)));
  usar.addEventListener('click', protegido('usar versión', async () => {
    if (!candidata) return;
    ocupado(true);
    const r = await aprobar(encargo.clave, candidata.blob, { estilo: estilo ?? 'desconocido', tipo: encargo.tipo, nombre: encargo.nombre });
    if (!r.ok) { estado.textContent = r.motivo; ocupado(false); return; }
    if (!r.persistente) avisar('Retrato elegido, pero este navegador no deja guardarlo: se perderá al cerrar.', 'aviso');
    dialogo.close();
    alTerminar?.();
    refrescarTodo();
  }));
  cerrar.addEventListener('click', () => dialogo.close());
  dialogo.addEventListener('close', () => {
    control.abort(); soltar(); dialogo.remove();
    // Terminado de valorar: las candidatas de este personaje se borran del
    // puente. La elegida, si la hay, ya está en la galería.
    olvidarCandidatas({ clave: encargo.clave });
  });

  document.body.append(dialogo);
  actual();
  dialogo.showModal();

  // Abrir el estudio es pedirlo: se mira si hay generador, sin pintar nada.
  estado.textContent = 'Buscando el generador de imágenes de este equipo…';
  ocupado(true);
  estadoGenerador().then((g) => {
    if (!dialogo.isConnected) return;
    estilo = g.estilo ?? null;
    const horas = g.cache?.horas ?? 24;
    nota.textContent = g.envia === 'local'
      ? `Se pinta en este PC con ${g.proveedor === 'comfyui' ? 'ComfyUI' : 'el generador local'}: la descripción no sale del equipo. Mientras eliges, las versiones quedan en una caché temporal del puente, en este PC; se borran al cerrar esta ventana (y como tarde a las ${horas} h). Solo la versión que elijas se guarda en el juego.`
      : `Este puente pinta con un servicio en la nube (${g.proveedor ?? 'desconocido'}): la descripción en inglés sale de tu equipo hacia ese servicio. Las versiones quedan en una caché temporal del puente, en este PC, hasta que cierres esta ventana; solo la que elijas se guarda en el juego.`;
    if (!g.ok) { estado.textContent = g.motivo; pintar.disabled = true; return; }
    if ((encargo.descripcion ?? '').length < 8) { estado.textContent = 'Hace falta una descripción de su aspecto para pintarlo.'; pintar.disabled = true; return; }
    estado.textContent = urlAprobada(encargo.clave) ? 'Este es el que elegiste. Pinta otro si quieres cambiarlo.' : 'Listo para pintar.';
    ocupado(false);
    if (g.envia !== 'local') {
      // Qué viaja, tal cual, y pintar solo con permiso.
      $('#estudio-permiso-texto').textContent = ` Permito enviar a ${g.proveedor ?? 'ese servicio'}: «${encargo.descripcion}».`;
      cajaPermiso.hidden = false;
      necesitaPermiso = true;
      permiso.addEventListener('change', () => ocupado(false));
      ocupado(false);
    }
  });
}

/* ── sugerencias ──────────────────────────────────────────────────────── */

/**
 * La interfaz base es una caja de texto libre. Las sugerencias solo aparecen
 * si el jugador lleva unos segundos sin escribir, en un pop-up discreto con
 * tres frases que encajan con lo que está pasando.
 */
let temporizadorSugerencias = null;

function ocultarSugerencias() {
  clearTimeout(temporizadorSugerencias);
  const capa = $('#sugerencias');
  if (capa) capa.hidden = true;
}

function programarSugerencias() {
  ocultarSugerencias();
  const espera = Number(leerAjustes().esperaSugerencias) || 0;
  if (!espera) return;
  temporizadorSugerencias = setTimeout(mostrarSugerencias, espera * 1000);
}

function mostrarSugerencias() {
  const capa = $('#sugerencias');
  const campo = $('#entrada');
  if (!capa || document.body.dataset.activeScreen !== 'juego') return;
  // Si el jugador escribe o pelea, no se le interrumpe. Si el máster aún
  // narra, se espera a que termine y se vuelve a mirar.
  if (campo?.value.trim() || ver('combat.activo', false)) return;
  if (campo?.disabled || escribiendo) {
    temporizadorSugerencias = setTimeout(mostrarSugerencias, 1000);
    return;
  }

  const opciones = (ver('narrative.opciones', []) ?? []).slice(0, 3);
  if (!opciones.length) return;

  const lista = $('#sugerencias-lista');
  vaciar(lista);
  for (const o of opciones) {
    lista.append(el('button', {
      class: 'sugerencia',
      dataset: { intent: String(o.intent ?? o.intencion ?? 'accion').toLowerCase() },
      onClick: protegido('sugerencia', () => enviar(o.label, o.intent)),
    }, o.label));
  }
  capa.hidden = false;
}

/* Compatibilidad: el motor sigue llamando a pintarOpciones al refrescar. */
function pintarOpciones() {
  const caja = $('#opciones');
  if (caja) { vaciar(caja); caja.hidden = true; }
}

/* ── aparición del texto ──────────────────────────────────────────────── */

/** Caracteres por segundo de cada velocidad. */
const VELOCIDADES = { lenta: 40, normal: 85, rapida: 170, instantanea: Infinity };

/** Entradas de la bitácora que ya se han enseñado enteras. */
let entradasVistas = 0;
let firmaBitacora = '';

/**
 * Id de la última tirada cuyo dado ya rodó.
 *
 * La bitácora se repinta entera en cada refresco, así que sin recordar esto
 * los dados ya vistos volverían a rodar turno tras turno.
 */
let ultimaTiradaAnimada = null;
/** Cola de párrafos pendientes de escribirse. */
const colaEscritura = [];
let escribiendo = false;

/**
 * La tarea que YA tiene un bucle de escritura propio, y los temporizadores en
 * vuelo.
 *
 * Existen porque la máquina de escribir se corrompía sola. La cadena era:
 * un párrafo termina y encola `escribirSiguiente` a 140ms; antes de que salte,
 * llega un turno nuevo, `pintarBitacora` vacía la cola y arranca la escritura
 * de los párrafos nuevos; entonces salta el temporizador VIEJO y arranca un
 * SEGUNDO bucle sobre el párrafo que ya se estaba escribiendo. Los dos bucles
 * terminaban y los dos hacían `shift()`, así que la cola se consumía del doble
 * de rápido: por cada párrafo escrito, uno se perdía sin escribir y su `<p>`
 * se quedaba vacío para siempre en la pantalla.
 *
 * Se veía como líneas en blanco en mitad de la narración. Con la cola vacía y
 * el estado lleno: el texto SÍ estaba generado y guardado, solo que nunca se
 * pintó.
 *
 * La regla ahora: un solo dueño. `tareaActiva` marca quién tiene bucle, y los
 * temporizadores se cancelan siempre que la cola se toca.
 */
let tareaActiva = null;
let relojEscritura = 0;
let cuadroEscritura = 0;

/** Corta en seco cualquier escritura en vuelo. No toca el texto ya puesto. */
function detenerEscritura() {
  if (relojEscritura) { clearTimeout(relojEscritura); relojEscritura = 0; }
  if (cuadroEscritura) { cancelAnimationFrame(cuadroEscritura); cuadroEscritura = 0; }
  tareaActiva = null;
  escribiendo = false;
}

/** Al cargar una partida, lo ya jugado aparece entero, sin efecto. */
function bitacoraSinAnimar() {
  entradasVistas = (ver('narrative.entradas', []) ?? []).length;
  firmaBitacora = '';
  colaEscritura.length = 0;
  detenerEscritura();
  pintarBitacora();
}

/** Termina de golpe todo lo que se estaba escribiendo. */
function completarEscritura() {
  const pendientes = colaEscritura.splice(0);
  detenerEscritura();

  for (const t of pendientes) {
    t.nodo.textContent = t.texto;
    t.nodo.classList.remove('se-escribe');
  }

  const caja = $('#bitacora');
  if (caja) caja.scrollTop = caja.scrollHeight;
}

function escribirSiguiente() {
  relojEscritura = 0;

  const tarea = colaEscritura[0];
  const caja = $('#bitacora');
  if (!tarea) { detenerEscritura(); programarSugerencias(); return; }

  // Ya hay un bucle sobre este párrafo. Entrar otra vez lo escribiría dos
  // veces y, peor, consumiría la cola por duplicado.
  if (tarea === tareaActiva && cuadroEscritura) return;

  tareaActiva = tarea;
  escribiendo = true;

  const cps = VELOCIDADES[leerAjustes().velocidadTexto] ?? VELOCIDADES.normal;

  // Con la pestaña oculta, el navegador congela `requestAnimationFrame`. El
  // texto se quedaba a medias —párrafos vacíos en pantalla, el relato entero
  // guardado en el estado— hasta que el jugador volvía, y si volvía tras un
  // repintado ya no se recuperaba. Escribir despacio solo tiene sentido si
  // hay alguien mirando: si no lo hay, el texto aparece entero y ya está.
  if (!Number.isFinite(cps) || document.hidden
      || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    completarEscritura();
    programarSugerencias();
    return;
  }

  const inicio = performance.now();
  tarea.nodo.classList.add('se-escribe');

  const paso = (ahora) => {
    cuadroEscritura = 0;
    if (colaEscritura[0] !== tarea) return;          // se completó de golpe
    const n = Math.min(tarea.texto.length, Math.floor(((ahora - inicio) / 1000) * cps) + 1);
    tarea.nodo.textContent = tarea.texto.slice(0, n);
    if (caja) caja.scrollTop = caja.scrollHeight;
    if (n < tarea.texto.length) { cuadroEscritura = requestAnimationFrame(paso); return; }
    tarea.nodo.classList.remove('se-escribe');
    colaEscritura.shift();
    tareaActiva = null;
    relojEscritura = setTimeout(escribirSiguiente, 140);
  };

  cuadroEscritura = requestAnimationFrame(paso);
}

/* ── bitácora ─────────────────────────────────────────────────────────── */

/* ── has caído ─────────────────────────────────────────────────────────── */

/**
 * La muerte termina la partida (decisión del 7-oct-2026).
 *
 * La pone el motor (`player/Muerte.js`): fase terminal, causa, momento,
 * marca del run y herencia pendiente. Aquí solo se enseña el final y la
 * salida: una partida nueva. No hay «Volver en ti» ni ninguna forma de curar
 * la derrota: contradicen la muerte permanente.
 *
 * @param {Object} muerte `meta.muerte`.
 */
function abrirMuerte(muerte) {
  const modal = $('#caida-modal');
  if (!modal || !muerte) return;
  bloquear(true);

  // «en el Camino del Norte», no «en El Camino…»: el artículo, en minúscula.
  const lugar = (muerte.momento?.lugar ? (obtenerLugar(muerte.momento.lugar)?.nombre ?? '') : '').replace(/^(El|La|Los|Las) /, (m) => m.toLowerCase());
  const cuando = Number.isFinite(muerte.momento?.dia)
    ? `Día ${muerte.momento.dia}, ${String(muerte.momento.hora ?? 0).padStart(2, '0')}:${String(muerte.momento.minuto ?? 0).padStart(2, '0')}${lugar ? `, en ${lugar}` : ''}.`
    : '';
  $('#caida-titulo').textContent = `${muerte.nombre} ha muerto`;
  const nota = $('#caida-nota');
  vaciar(nota);
  nota.append(
    el('p', { text: `${muerte.causa ?? ''} ${cuando}`.trim() }),
    el('p', { class: 'caida__resumen', text: `Nivel ${muerte.nivel ?? 1} · ${muerte.resumen?.turnos ?? muerte.turno ?? 0} turnos. La crónica termina aquí.` }),
    el('p', { class: 'caida__legado', id: 'caida-legado', text: 'Comprobando su herencia…' }),
  );
  nota.append(el('p', { class: 'caida__registro', id: 'caida-registro', role: 'status' }));
  pintarRegistroMuerte(muerte);

  const acciones = $('#caida-acciones');
  vaciar(acciones);
  acciones.append(
    el('button', { class: 'btn btn--grande', onClick: protegido('nueva partida', irANuevaPartida) }, 'Nueva partida'),
    el('button', { class: 'btn btn--fantasma', onClick: protegido('volver al menú', () => salirConGuardado(() => {
      try { sessionStorage.setItem('arcanveil:abrir-menu', '1'); } catch { /* sin sesión, portada */ }
      location.reload();
    })) }, 'Volver al menú'),
  );

  modal.hidden = false;
  acciones.querySelector('button')?.focus();
}

/**
 * El estado DURABLE de la muerte en la pantalla final: la partida terminó
 * en memoria al instante; la marca y la herencia se apuntan después en el
 * registro coordinado. Se dice «registrando…», y luego lo que quedó de
 * verdad o el fallo, con «Reintentar» (misma muerte, misma foto).
 */
function pintarRegistroMuerte(muerte) {
  const g = ver('meta.muerte.guardado') ?? muerte.guardado ?? {};
  const linea = $('#caida-registro');
  const legado = $('#caida-legado');
  if (!linea) return;
  vaciar(linea);
  if (g.estado === 'registrando') {
    linea.textContent = 'La partida ha terminado. Registrando la muerte y su herencia en este navegador…';
    if (legado) legado.textContent = 'Su herencia se mostrará cuando quede registrada.';
    return;
  }
  if (g.estado === 'error' || g.marca === false) {
    linea.className = 'caida__aviso';
    linea.append(
      document.createTextNode(`No se ha podido registrar esta muerte en el navegador (${g.error ?? 'error'}). La partida no se puede continuar, pero su herencia no está apuntada todavía. `),
      el('button', { class: 'btn btn--pequeno', id: 'caida-reintentar', type: 'button', onClick: protegido('registrar muerte', async () => {
        linea.textContent = 'Reintentando…';
        await sistema('muerte')?.reintentarRegistro?.();
      }) }, 'Reintentar'),
    );
    if (legado) legado.textContent = 'Sin registro, tu próximo personaje no heredará su experiencia.';
    return;
  }
  linea.className = 'caida__registro';
  linea.textContent = ['Muerte registrada en este navegador.', g.conflicto, g.aviso].filter(Boolean).join(' ');
  // La cifra sale del estado compartido (asíncrono): se escribe al llegar.
  textoLegadoMuerte({ ...muerte, guardado: g })
    .then((t) => { const p = $('#caida-legado'); if (p) p.textContent = t; })
    .catch(() => { const p = $('#caida-legado'); if (p) p.textContent = 'No se ha podido comprobar su herencia ahora; se verá en «Nueva partida».'; });
}

/**
 * Lo que deja el caído, dicho con la cifra real. Solo se promete si la
 * herencia quedó escrita; si no, se dice que no.
 */
async function textoLegadoMuerte(muerte) {
  if (muerte.guardado && !muerte.guardado.legado) {
    return `No se ha podido guardar su herencia en este navegador (${muerte.guardado.error ?? 'error'}): tu próximo personaje no heredará su experiencia.`;
  }
  const v = (await Entrega.listarLegados()).find((x) => x.runOrigen === muerte.runId);
  if (!v) return 'No ha quedado herencia guardada de este personaje.';
  if (v.estado === 'aplicado') return 'Su herencia ya la recibió otro personaje.';
  if (v.cantidad === null) return `Su herencia no se puede calcular: ${v.motivo ?? 'la experiencia guardada no es válida'}.`;
  return `Deja ${explicarLegado(v)}. Tu próximo personaje puede heredarla: se entrega al confirmar su creación, una sola vez.`;
}

/**
 * Partida nueva tras morir: se recarga para tener un motor limpio (la forma
 * establecida de volver a empezar) y se abre la elección de herencia y de
 * personaje, con el caído primero. El mundo anterior no se toca ni se repone.
 */
function irANuevaPartida() {
  const origen = ver('meta.muerte.runId') ?? ver('meta.runId');
  // El final ya se guarda al morir; aquí se comprueba antes de recargar.
  salirConGuardado(() => {
    try {
      sessionStorage.setItem('arcanveil:nueva-partida', '1');
      if (origen) sessionStorage.setItem('arcanveil:legado-origen', origen);
    } catch { /* sin sesión */ }
    location.reload();
  });
}

/* ── traer una historia de fuera ───────────────────────────────────────── */

/** Lo último que se leyó, para no reanalizar al confirmar. */
let historiaLeida = null;

/** Abre el modal de importación, vacío. */
function abrirImportar() {
  historiaLeida = null;
  const texto = $('#importar-texto');
  if (texto) texto.value = '';
  vaciar($('#importar-resultado'));
  $('#importar-modal').hidden = false;
}

/**
 * Lee lo pegado y enseña lo que ha entendido, sin aplicar nada todavía.
 *
 * La vista previa no es un adorno. El jugador acaba de pegar meses de partida
 * y tiene que ver que el juego ha entendido a SU gente antes de dejarle tocar
 * nada. Si se equivoca de protagonista, que lo vea aquí y no tres turnos
 * después, con la partida ya empezada.
 */
function leerHistoriaPegada() {
  const bruto = $('#importar-texto')?.value ?? '';
  const caja = $('#importar-resultado');
  vaciar(caja);

  const r = importarHistoria(bruto);
  historiaLeida = r;

  if (r.vacio) {
    caja.append(el('p', { class: 'modal__error', text: 'Hace falta algo más de texto: con menos de cuarenta palabras no hay historia que leer.' }));
    return;
  }

  const personas = r.personajes.filter((p) => p.tipo === 'persona');

  if (!personas.length) {
    caja.append(el('p', { class: 'modal__error', text: 'No he encontrado personajes. Si el texto los marca con guiones de diálogo («Nombre:»), se reconocen mejor.' }));
    return;
  }

  caja.append(el('p', { class: 'sub-eti', text: `He leído ${r.palabras} palabras. ¿Quién eres tú?` }));

  // Elegir protagonista: el juego propone, decide el jugador. Acertar casi
  // siempre significa equivocarse a veces con el personaje de alguien, y eso
  // es lo único que no se puede fallar aquí.
  const lista = el('div', { class: 'etiquetas', id: 'importar-quien' });
  const pie = el('p', { class: 'campo__ayuda', id: 'importar-otros' });

  // El pie se recalcula al elegir: decía «los demás» y los listaba a todos,
  // incluido el que acabas de marcar como tú mismo.
  const refrescarOtros = (elegido) => {
    const otros = personas.filter((p) => p.nombre !== elegido).map((p) => p.nombre);
    pie.textContent = otros.length
      ? `Los demás entran como gente que ya conoces: ${otros.slice(0, 6).join(', ')}.`
      : 'No hay nadie más en la historia.';
  };

  for (const [i, p] of personas.entries()) {
    const marcado = p.protagonistaProbable || (i === 0 && !personas.some((x) => x.protagonistaProbable));

    lista.append(el('button', {
      class: `btn btn--pequeno${marcado ? ' es-activo' : ''}`,
      'data-quien': p.nombre,
      onClick: (e) => {
        for (const b of lista.querySelectorAll('button')) b.classList.remove('es-activo');
        e.currentTarget.classList.add('es-activo');
        refrescarOtros(p.nombre);
      },
    }, p.nombre));
  }

  caja.append(lista, pie);
  refrescarOtros(personas.find((p) => p.protagonistaProbable)?.nombre ?? personas[0].nombre);

  if (r.hilos.length) {
    caja.append(el('p', { class: 'sub-eti', text: 'Quedó pendiente' }));
    for (const h of r.hilos) caja.append(el('p', { class: 'campo__ayuda', text: `· ${h}` }));
  }

  caja.append(el('div', { class: 'modal__acciones' },
    el('button', { class: 'btn btn--grande', id: 'importar-aplicar', onClick: protegido('aplicar historia', aplicarHistoria) }, 'Continuar desde aquí'),
  ));
}

/**
 * Vuelca lo leído en la ficha y en el canon.
 *
 * El protagonista rellena el nombre y la historia; los demás entran al canon
 * como gente conocida, para que el director pueda nombrarlos desde el primer
 * turno diciendo de ellos lo que el propio jugador escribió.
 *
 * La descripción física NO se toca: de un texto narrativo no se saca el
 * aspecto de forma fiable, y lo que se pinte tiene que ser lo que él quiera
 * ver. Ese campo lo sigue escribiendo él.
 */
function aplicarHistoria() {
  if (!historiaLeida) return;

  const elegido = $('#importar-quien button.es-activo')?.dataset.quien;
  if (!elegido) { avisar('Elige quién eres tú.', 'aviso'); return; }

  const yo = historiaLeida.personajes.find((p) => p.nombre === elegido);
  const otros = historiaLeida.personajes.filter((p) => p.nombre !== elegido);

  // Ficha del protagonista.
  const nombre = $('#nombre');
  if (nombre) { nombre.value = elegido.slice(0, 28); nombre.dispatchEvent(new Event('input', { bubbles: true })); }

  const lore = $('#lore-personaje');
  if (lore) {
    const partes = [...(yo?.notas ?? [])];

    const compas = otros.filter((p) => p.tipo === 'persona').slice(0, 4).map((p) => p.nombre);
    if (compas.length) partes.push(`Viaja con ${compas.join(', ')}.`);
    if (historiaLeida.hilos.length) partes.push(`Quedó pendiente: ${historiaLeida.hilos[0]}.`);

    lore.value = partes.join(' ').slice(0, 1200);
    lore.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // El resto de la gente y los sitios, al canon. Se hace por el bus para no
  // atarse a cómo guarda la memoria por dentro.
  for (const p of otros) {
    bus.emit('canon:registrar', {
      nombre: p.nombre,
      tipo: p.tipo,
      rasgos: [],
      nota: p.notas[0] ?? '',
    });
  }

  for (const h of historiaLeida.hilos) {
    bus.emit('memory:thread', { tipo: 'misterio', texto: h, relacionadoCon: 'historia_importada' });
  }

  $('#importar-modal').hidden = true;
  avisar(`Historia leída: ${elegido} y ${otros.length} más.`, 'exito');
}

/* ── modales: Escape, foco atrapado y foco devuelto ────────────────────── */

/**
 * Da a los cuatro modales el comportamiento que se espera de un modal.
 *
 * Antes no tenían ninguno: Escape no hacía nada, el tabulador se escapaba del
 * panel y recorría la partida que había detrás —visible por debajo del velo,
 * pero inalcanzable con el ratón— y al cerrar, el foco caía en el `<body>`, o
 * sea que había que tabular desde el principio del documento para volver a
 * donde estabas.
 *
 * Se resuelve con dos piezas globales en vez de tocar los veinte sitios que
 * abren o cierran un modal. El observador reacciona al atributo `hidden`, que
 * es lo que todos ellos cambian, así que funciona para los cuatro de hoy y
 * para el que se añada mañana sin acordarse de nada.
 */
function conectarModales() {
  const modales = [...document.querySelectorAll('.modal')];
  if (!modales.length) return;

  /** Dónde estaba el foco antes de abrir, para devolverlo al cerrar. */
  let focoPrevio = null;

  const abierto = () => modales.find((m) => !m.hidden) ?? null;

  const focusables = (m) => [...m.querySelectorAll(
    'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )].filter((n) => n.offsetParent !== null);

  // Escape cierra; el tabulador da la vuelta dentro del panel.
  document.addEventListener('keydown', (ev) => {
    const m = abierto();
    if (!m) return;

    if (ev.key === 'Escape') {
      ev.preventDefault();
      // Un modal fijo no se cierra con Escape: la pantalla de caída deja la
      // partida detenida y la caja de texto bloqueada, y cerrarla sin elegir
      // una salida dejaba al jugador sin nada que pulsar.
      if (m.dataset.fijo === undefined) m.hidden = true;
      return;
    }

    if (ev.key !== 'Tab') return;

    const lista = focusables(m);
    if (!lista.length) return;

    const primero = lista[0];
    const ultimo = lista[lista.length - 1];

    if (ev.shiftKey && document.activeElement === primero) {
      ev.preventDefault(); ultimo.focus();
    } else if (!ev.shiftKey && document.activeElement === ultimo) {
      ev.preventDefault(); primero.focus();
    }
  });

  const observador = new MutationObserver((cambios) => {
    for (const c of cambios) {
      const m = c.target;
      if (m.hidden) {
        // Se devuelve el foco solo si sigue dentro del modal que se cierra:
        // si el jugador ya se ha ido a otro sitio, no se le mueve.
        if (m.contains(document.activeElement) || document.activeElement === document.body) {
          focoPrevio?.focus?.();
        }
        focoPrevio = null;
      } else {
        focoPrevio = document.activeElement;
        focusables(m)[0]?.focus();
      }
    }
  });

  for (const m of modales) observador.observe(m, { attributes: true, attributeFilter: ['hidden'] });
}

/**
 * Dicta las entradas nuevas a la región viva del lector de pantalla.
 *
 * La tirada se convierte en frase. Un `<span>` con «d20 14» y otro con «vs 12»
 * se leen como dos números sueltos sin relación; dicho entero se entiende:
 * «d20 14, total 17 contra dificultad 12: éxito».
 *
 * @param {Array<Object>} nuevas
 */
function anunciarRelato(nuevas) {
  const region = $('#relato-vivo');
  if (!region || !nuevas?.length) return;

  const VOZ = { player: 'Tú', jugador: 'Tú', dm: 'Narrador', combat: 'Combate', combate: 'Combate', system: 'Aviso', sistema: 'Aviso', escena: 'Ilustración' };

  const partes = nuevas.map((e) => {
    if (e.voz === 'roll' || e.voz === 'tirada') {
      const t = e.meta?.tirada;
      if (!t) return '';
      // La dificultad se llama `umbral`, y el nombre bonito de la habilidad ya
      // viene hecho en `nombreHabilidad`; `habilidad` es el identificador
      // interno y se leería «percepcion», sin tilde.
      const veredicto = t.critico ? 'crítico' : t.pifia ? 'pifia' : t.exito ? 'éxito' : 'fracaso';
      const hab = t.nombreHabilidad ?? t.habilidad ?? 'habilidad';
      return `Tirada de ${hab}: d20 ${t.natural ?? '?'}, total ${t.total ?? '?'} contra dificultad ${t.umbral ?? '?'}. ${capitalizarTexto(veredicto)}.`;
    }
    const texto = String(e.texto ?? '').replace(/\n+/g, ' ').trim();
    if (!texto) return '';
    return `${VOZ[e.voz] ?? ''}: ${texto}`.replace(/^:\s*/, '');
  }).filter(Boolean);

  if (partes.length) region.textContent = partes.join(' ');
}

/** Primera letra en mayúscula, sin traerse una dependencia por una línea. */
function capitalizarTexto(s) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

function pintarBitacora() {
  const caja = $('#bitacora');
  if (!caja) return;

  const entradas = ver('narrative.entradas', []) ?? [];

  // Refrescar sin cambios no repinta: así no se corta lo que se está escribiendo.
  const firma = `${entradas.length}|${entradas.at(-1)?.texto ?? ''}`;
  if (firma === firmaBitacora) return;
  firmaBitacora = firma;

  // Lo que se estaba escribiendo se da por leído antes de repintar, y el
  // escritor se para SIEMPRE, haya cola o no.
  //
  // El `if (colaEscritura.length)` que había aquí dejaba una ventana de 140ms
  // —entre que el último párrafo termina y salta el temporizador del
  // siguiente— en la que la cola está vacía pero `escribiendo` sigue en
  // cierto. Un repintado en ese hueco se saltaba la limpieza, encolaba
  // párrafos nuevos y luego no los arrancaba, porque la línea del final exige
  // `!escribiendo`. Resultado: la cola se quedaba parada para siempre con sus
  // `<p>` en blanco, y ni los turnos siguientes la desatascaban.
  //
  // Cada repintado es el único dueño del escritor. Nada sobrevive al anterior.
  completarEscritura();
  vaciar(caja);
  const primeraNueva = Math.max(0, entradas.length - 60);

  const visibles = entradas.slice(-60);
  const desdeReciente = Math.max(0, visibles.length - 3);

  for (const [indice, e] of visibles.entries()) {
    // El motor etiqueta esta voz como `roll`, no como `tirada`. Al buscar solo
    // `tirada` no coincidía nunca y las fichas de dados NO SE DIBUJABAN: el
    // juego resolvía las tiradas y no enseñaba ni una, que es justo lo que el
    // proyecto promete («el motor tira los dados y el director narra lo que ya
    // está decidido»). Se aceptan los dos nombres para no depender de cuál
    // emita cada sistema.
    if (e.voz === 'roll' || e.voz === 'tirada') {
      // El dado solo rueda para la tirada que acaba de ocurrir, y una sola
      // vez. La bitácora se repinta entera en cada refresco: sin este
      // candado, cada turno harían rodar de nuevo todos los dados visibles.
      const esNueva = Boolean(e.id) && e.id !== ultimaTiradaAnimada;

      const ficha = fichaTirada(e.meta?.tirada, {
        animar: esNueva && indice >= desdeReciente,
      });

      if (esNueva && indice >= desdeReciente) ultimaTiradaAnimada = e.id;

      if (indice >= desdeReciente) ficha.classList.add('es-reciente');
      caja.append(ficha);
      continue;
    }

    // Partidas antiguas guardaban aquí la dirección de una ilustración de un
    // servicio de fuera. Ya no se carga: pedirla filtraba que se estaba
    // jugando, y en un guardado manipulado podía apuntar a cualquier sitio.
    // Queda el pie, que es la parte de la historia.
    if (e.voz === 'escena') {
      if (e.texto) caja.append(el('p', { class: 'linea linea--escena', text: e.texto }));
      continue;
    }

    // Mismo desajuste con la voz del jugador: el motor dice `player` y aquí
    // solo estaba `jugador`, así que sus líneas perdían su estilo y salían
    // como texto corriente, indistinguibles de la narración.
    const clase = {
      dm: 'linea linea--dm',
      player: 'linea linea--jugador',
      jugador: 'linea linea--jugador',
      system: 'linea linea--sistema',
      sistema: 'linea linea--sistema',
      combat: 'linea linea--combate',
      combate: 'linea linea--combate',
    }[e.voz] ?? 'linea';

    // Solo la voz del máster se escribe; la acción del jugador aparece ya.
    const esNueva = primeraNueva + indice >= entradasVistas;
    const seEscribe = esNueva && (e.voz === 'dm' || e.voz === 'narrador');

    // La letra capital solo abre el turno, no cada línea.
    //
    // La narración va ahora por golpes —una frase por línea— y con la regla
    // anterior cada una llevaba su capitular de dos cuerpos: diez capitulares
    // seguidas no son una página iluminada, son un sarpullido. La capital
    // marca dónde empieza a hablar el máster, y eso ocurre una vez.
    let primeraDelTurno = true;

    for (const parrafo of String(e.texto ?? '').split('\n')) {
      if (!parrafo.trim()) continue;

      const clases = [clase];
      if (indice >= desdeReciente) clases.push('es-reciente');

      if (e.voz === 'dm' || e.voz === 'narrador') {
        // Los golpes —«CLANG.», «Y entonces...»— piden su propio peso: van
        // centrados, espaciados y sin capitular. Es la línea que el ojo tiene
        // que ver sola.
        if (esGolpe(parrafo)) clases.push('linea--golpe');
        else if (!primeraDelTurno) clases.push('linea--seguida');
        primeraDelTurno = false;
      }

      const nodo = el('p', { class: clases.join(' '), text: seEscribe ? '' : parrafo });
      caja.append(nodo);
      if (seEscribe) colaEscritura.push({ nodo, texto: parrafo });
    }
  }

  // Lo nuevo se dicta una sola vez y ya montado, para quien no ve la pantalla.
  // Va aquí y no en la bitácora porque la bitácora se reconstruye entera en
  // cada refresco: marcarla como región viva haría releer las sesenta
  // entradas cada turno.
  anunciarRelato(entradas.slice(entradasVistas));

  entradasVistas = entradas.length;
  caja.scrollTop = caja.scrollHeight;

  // Sin comprobar `escribiendo`: `completarEscritura` acaba de dejarlo en
  // falso unas líneas más arriba, y consultarlo aquí solo servía para no
  // arrancar cuando alguna bandera se había quedado colgada.
  if (colaEscritura.length) escribirSiguiente();
}

function fichaTirada(t, { animar = false } = {}) {
  if (!t) return el('span');

  const clase = t.pifia ? 'pifia' : t.critico ? 'critico' : t.exito ? 'exito' : 'fracaso';
  const etiqueta = t.pifia ? 'pifia' : t.critico ? 'crítico' : t.exito ? 'éxito' : 'fracaso';

  const dado = el('span', { class: 'tirada__dado', text: `d20 ${t.natural}` });

  const ficha = el('div', { class: `tirada tirada--${clase}` },
    dado,
    el('span', { class: 'tirada__cuenta', text: `${t.total} vs ${t.umbral}` }),
    el('span', { class: 'tirada__veredicto', text: etiqueta }),
    t.nombreHabilidad ? el('span', { class: 'tirada__hab', text: t.nombreHabilidad }) : null,
  );

  // Solo rueda la tirada recién ocurrida. Repintar la bitácora vuelve a crear
  // las fichas viejas, y verlas rodar todas de golpe cada turno sería absurdo.
  if (animar) {
    rodarDado(dado, t.natural, () => {
      // El crítico y la pifia son los dos momentos en que la tirada deja de
      // ser un trámite. Se subrayan al asentarse el dado, no antes.
      if (t.critico) sacudir(ficha, 'suave');
      if (t.pifia) sacudir(ficha, 'fuerte');
    });
  }

  return ficha;
}

/* ── cabecera ─────────────────────────────────────────────────────────── */

function pintarCabecera() {
  pintarNarrador();
  const caja = $('#cabecera-info');
  if (!caja) return;

  const lugar = obtenerLugar(ver('world.ubicacion'));
  const j = ver('player', {}) ?? {};

  vaciar(caja);

  // El lugar, el día y el clima viven ahora en el rótulo de la escena, encima
  // de la ilustración. Repetirlos aquí era ruido; la cabecera lleva lo que la
  // escena no dice: en qué región estás y quién eres.
  caja.append(
    el('span', { class: 'cab__lugar', text: j.nombre ?? 'ARCANVEIL' }),
    el('span', { class: 'cab__sep', text: '·' }),
    el('span', { text: `nivel ${j.nivel ?? 1}` }),
    lugar?.region ? el('span', { class: 'cab__sep', text: '·' }) : null,
    lugar?.region ? el('span', { text: String(lugar.region).replace(/_/g, ' ') }) : null,
  );
}

/* ── personaje ────────────────────────────────────────────────────────── */

function pintarPersonaje() {
  const caja = $('#panel-personaje');
  if (!caja) return;

  const j = ver('player', {}) ?? {};
  vaciar(caja);

  // Su retrato elegido, o el marcador. Pintar es cosa del jugador, y nunca
  // en combate.
  const ficha = fichaRetratoJugador();
  pintarRetrato($('#retrato-pj'), ficha);

  caja.append(
    el('div', { class: 'ficha-pj' },
      el('span', { class: 'ficha-pj__nombre', text: j.nombre ?? '—' }),
      el('span', { class: 'ficha-pj__clase', text: `nivel ${j.nivel ?? 1}` }),
      ficha.id && !ver('combat.activo', false) ? el('button', {
        class: 'btn btn--pequeno btn--fantasma', id: 'pj-pintar', type: 'button',
        onClick: protegido('pintar retrato', () => abrirEstudio(encargoDePersonaje(j, ficha.id))),
      }, urlAprobada(claveRetrato(ficha)) ? 'Cambiar retrato' : 'Pintar retrato') : null,
    ),
  );

  const atributos = j.atributos ?? {};
  const nombresAtributo = { fuerza:'FUE', destreza:'DES', constitucion:'CON', inteligencia:'INT', sabiduria:'SAB', carisma:'CAR' };
  caja.append(el('div', { class: 'medallones-atributos' },
    ...Object.entries(nombresAtributo).map(([clave, eti]) => {
      const valor = atributos[clave] ?? 10;
      const mod = Math.floor((valor - 10) / 2);
      return el('div', { class: 'medallon-atributo' },
        el('span', { class: 'medallon-atributo__eti', text: eti }),
        el('strong', { text: String(valor) }),
        el('span', { class: 'medallon-atributo__mod', text: mod >= 0 ? `+${mod}` : String(mod) }),
      );
    }),
  ));

  const barras = [
    ['Vida', j.vida?.actual ?? 0, j.vida?.max ?? 1, 'vida'],
    j.mana?.max ? ['Ánima', j.mana.actual, j.mana.max, 'mana'] : null,
    // Sin hambre ni sed (6-oct-2026): ya no son presión de supervivencia.
    ['Vigor', j.fatiga ?? 100, 100, 'fatiga'],
  ].filter(Boolean);

  for (const [eti, actual, max, clave] of barras) {
    const frac = Math.max(0, Math.min(1, actual / Math.max(1, max)));

    caja.append(el('div', { class: 'barra-caja' },
      el('div', { class: 'barra-caja__fila' },
        el('span', { text: eti }),
        el('span', { class: 'barra-caja__cifra', text: `${Math.round(actual)}/${max}` }),
      ),
      el('div', { class: 'barra' },
        el('div', {
          class: `barra__relleno barra__relleno--${clave}`,
          style: `width:${Math.round(frac * 100)}%`,
        }),
      ),
    ));
  }

  caja.append(el('div', { class: 'oro' },
    el('span', { text: 'Oro' }),
    el('span', { class: 'oro__cifra', text: String(j.oro ?? 0) }),
  ));

  // La experiencia, con lo heredado aparte: no se presenta como jugado.
  const px = procedenciaXP(j);
  caja.append(el('div', { class: 'oro xp-pj', id: 'pj-xp' },
    el('span', { text: 'Experiencia' }),
    el('span', { class: 'oro__cifra', text: String(px.total) }),
  ));
  if (px.heredada > 0 || j.legadoRecibido) {
    caja.append(el('p', { class: 'xp-pj__procedencia', id: 'pj-xp-procedencia', text: `${px.heredada} heredada de ${j.legadoRecibido?.nombreOrigen ?? 'tu personaje anterior'} · ${px.ganada} ganada jugando` }));
  }

  // Estados alterados.
  const estados = j.estados ?? [];
  if (estados.length) {
    caja.append(el('div', { class: 'etiquetas' },
      // Dos mentiras vivían en esta línea. Pintaba el identificador interno
      // («sangrado») en vez del nombre del catálogo («Sangrando»), y marcaba
      // TODO como daño: los seis estados beneficiosos —Bendecido, Protegido,
      // Acelerado, Regenerando, Invisible, Concentrado— salían en rosa de
      // herida, así que una bendición se leía como una desgracia.
      //
      // La flecha va además del color porque el color solo no vale: quien no
      // distingue rojo de verde necesita algo más que un tono para saber si lo
      // que le acaba de pasar es bueno o malo.
      ...estados.map((e) => {
        const est = ESTADOS[e.refId];
        const bueno = est?.categoria === 'beneficio';
        return el('span', {
          class: `etiqueta etiqueta--${bueno ? 'bien' : 'mal'}`,
          text: `${bueno ? '▲' : '▼'} ${est?.nombre ?? String(e.refId).replace(/_/g, ' ')}`,
        });
      }),
    ));
  }

  // El grupo, bajo el personaje. En pantallas estrechas se esconde por CSS y
  // se ve en su pestaña del lateral.
  if ((ver('party.miembros', []) ?? []).length) {
    const grupo = el('div', { class: 'grupo', id: 'grupo-pj' }, el('p', { class: 'sub-eti', text: 'Grupo' }));
    caja.append(grupo);
    pintarGrupo(grupo);
  }
}

/* ── lateral: inventario, mapa, misiones ──────────────────────────────── */

let pestanaActiva = 'inventario';
let mercaderActivo = null;

function pintarLateral() {
  const caja = $('#panel-lateral');
  if (!caja) return;

  vaciar(caja);

  // El grupo tiene pestaña propia cuando hay alguien: en móvil es donde se
  // ve, porque el bloque bajo el personaje no cabe.
  const hayGrupo = (ver('party.miembros', []) ?? []).length > 0;
  const pestanas = [
    ['inventario', 'Bolsa'],
    ['mapa', 'Mapa'],
    ['misiones', 'Encargos'],
    ['gente', 'Gente'],
    hayGrupo ? ['grupo', 'Grupo'] : null,
  ].filter(Boolean);
  if (pestanaActiva === 'grupo' && !hayGrupo) pestanaActiva = 'inventario';

  caja.append(el('div', { class: 'pestanas' },
    ...pestanas.map(([clave, eti]) => el('button', {
      class: 'pestana' + (pestanaActiva === clave ? ' es-activa' : ''),
      onClick: protegido('pestaña', () => { pestanaActiva = clave; pintarLateral(); }),
      text: eti,
    })),
  ));

  const cuerpo = el('div', { class: 'lateral__cuerpo' });
  caja.append(cuerpo);

  try {
    if (pestanaActiva === 'inventario') pintarInventario(cuerpo);
    else if (pestanaActiva === 'mapa') pintarMapa(cuerpo);
    else if (pestanaActiva === 'misiones') pintarMisiones(cuerpo);
    else if (pestanaActiva === 'grupo') pintarGrupo(cuerpo);
    else pintarGente(cuerpo);
  } catch (e) {
    avisarFallo('panel ' + pestanaActiva, e);
  }
}

/**
 * Quien viaja con el personaje: su cara, su vida y con qué pelea.
 *
 * Se pinta bajo la ficha del personaje y en la pestaña «Grupo», con la misma
 * función, para que las dos vistas no se contradigan nunca.
 */
function pintarGrupo(caja) {
  const miembros = sistema('party')?.miembros?.() ?? [];
  if (!miembros.length) {
    caja.append(el('p', { class: 'lateral__vacio', text: 'Viajas solo. Pregúntale a alguien si viene contigo.' }));
    return;
  }

  for (const m of miembros) {
    const f = m.ficha;
    const cara = el('div', { class: 'grupo__cara' });
    const vida = m.vida ?? { actual: f.vidaMax, max: f.vidaMax };

    caja.append(el('div', { class: `grupo__miembro${m.herido ? ' es-herido' : ''}`, 'data-companero': f.refId },
      cara,
      el('div', { class: 'grupo__datos' },
        el('strong', { class: 'grupo__nombre', text: f.nombre }),
        el('span', { class: 'grupo__rol', text: `${f.rol} · ${f.especialidad}` }),
        el('span', { class: 'grupo__vida', text: m.herido ? `Herido · ${vida.actual}/${vida.max}` : `Vida ${vida.actual}/${vida.max}` }),
        el('span', { class: 'grupo__ataque', text: `${f.ataque.nombre} ${f.ataque.dano} · ${f.rasgo}` }),
        ver('combat.activo', false) ? null : el('button', {
          class: 'btn btn--pequeno btn--fantasma grupo__pintar', type: 'button', 'data-pintar': f.refId,
          onClick: protegido('pintar compañero', () => abrirEstudio(encargoDePnj(f))),
        }, urlAprobada(claveRetrato({ refId: f.refId })) ? 'Cambiar retrato' : 'Pintar retrato'),
      ),
    ));

    // Su retrato sale con las mismas reglas que el del jugador: el elegido,
    // o el marcador con su nombre. Por su identidad, no por su linaje.
    pintarRetrato(cara, { refId: f.refId, nombre: f.nombre });
  }
}

function pintarInventario(caja) {
  const objetos = Object.values(ver('inventory.objetos.porId', {}) ?? {});

  if (!objetos.length) {
    caja.append(el('p', { class: 'vacio', text: 'No llevas nada.' }));
    return;
  }

  for (const o of objetos) {
    caja.append(el('button', {
      class: 'objeto' + (o.equipado ? ' es-equipado' : ''),
      onClick: protegido('usar objeto', () => usarObjeto(o)),
    },
      el('span', { class: 'objeto__nombre', text: o.nombre }),
      o.cantidad > 1 ? el('span', { class: 'objeto__cant', text: `×${o.cantidad}` }) : null,
      o.equipado ? el('span', { class: 'objeto__marca', text: 'puesto' }) : null,
    ));
  }
}

function usarObjeto(o) {
  if (o.categoria === 'consumible') {
    store.dispatch('inventory/consumir', { idObjeto: o.id });
  } else if (['arma', 'armadura', 'escudo'].includes(o.categoria)) {
    store.dispatch(o.equipado ? 'inventory/desequipar' : 'inventory/equipar', {
      idObjeto: o.id,
      ranura: o.equipado ? Object.keys(ver('inventory.equipado', {}) ?? {})
        .find((r) => ver('inventory.equipado')[r] === o.id) : undefined,
    });
  }

  refrescarTodo();
}

function pintarMapa(caja) {
  const world = sistema('world');
  const destinos = world?.destinos() ?? [];

  const lugar = obtenerLugar(ver('world.ubicacion'));

  caja.append(el('p', { class: 'lugar-actual', text: lugar?.nombre ?? '—' }));

  if (lugar?.descripcion) {
    caja.append(el('p', { class: 'vacio', text: lugar.descripcion }));
  }

  if (!destinos.length) {
    caja.append(el('p', { class: 'vacio', text: 'No hay adónde ir desde aquí.' }));
    return;
  }

  caja.append(el('p', { class: 'sub-eti', text: 'Puedes ir a' }));

  for (const d of destinos) {
    // El peligro se decía SOLO con el color del número de horas: naranja para
    // arriesgado, rosa para peligroso. Un daltónico rojo-verde —uno de cada
    // doce hombres— elegía ruta a ciegas. Ahora lo pone la palabra, y el color
    // acompaña en vez de cargar con todo el mensaje.
    const nivel = d.peligro >= 3 ? ' · peligroso' : d.peligro >= 2 ? ' · arriesgado' : '';

    caja.append(el('button', {
      class: 'destino',
      onClick: protegido('viajar', () => viajar(d.refId)),
    },
      el('span', { text: d.nombre }),
      el('span', {
        class: 'destino__dato' + (d.peligro >= 3 ? ' es-peligro' : d.peligro >= 2 ? ' es-aviso' : ''),
        text: `${d.distancia} h${nivel}`,
      }),
    ));
  }
}

async function viajar(refId) {
  const travel = sistema('travel');
  if (!travel) return;

  const plan = travel.planificar(refId);

  if (!plan.viable) {
    bus.emit('narrative:direct', { texto: plan.motivo, voz: 'system' });
    refrescarTodo();
    return;
  }

  bloquear(true);
  await travel.viajar(refId, { forzar: true });
  bloquear(false);

  refrescarTodo();
}

function pintarMisiones(caja) {
  const quests = sistema('quests');
  const datos = quests?.paraInterfaz() ?? { activas: [], ofrecidas: [] };

  if (!datos.ofrecidas.length && !datos.activas.length) {
    caja.append(el('p', { class: 'vacio', text: 'Nadie te ha encargado nada todavía.' }));
    return;
  }

  for (const m of datos.ofrecidas) {
    caja.append(el('div', { class: 'mision mision--oferta' },
      el('p', { class: 'mision__titulo', text: m.titulo }),
      el('p', { class: 'mision__texto', text: m.resumen }),
      el('button', {
        class: 'btn btn--pequeno',
        onClick: protegido('aceptar misión', () => { quests.aceptar(m.refId); pintarLateral(); }),
        text: 'Aceptar',
      }),
      // Antes no se podía decir que no: el encargo se quedaba ofrecido para
      // siempre. También se puede escribir «no me interesa».
      el('button', {
        class: 'btn btn--pequeno btn--fantasma',
        onClick: protegido('rechazar misión', () => { quests.rechazar(m.refId); pintarLateral(); }),
        text: 'Rechazar',
      }),
    ));
  }

  for (const m of datos.activas) {
    caja.append(el('div', { class: 'mision' },
      el('p', { class: 'mision__titulo', text: m.titulo }),
      ...m.objetivos.map((o) => el('p', {
        class: 'mision__obj' + (o.hecho ? ' es-hecho' : ''),
        text: (o.hecho ? '✓ ' : '· ') + o.texto,
      })),
      // Un objetivo propio no paga nada ni lo cierra el juego: lo da por
      // cumplido el jugador cuando lo considera.
      m.tipo === 'meta'
        ? el('p', { class: 'mision__recompensa', text: 'Objetivo propio' })
        : el('p', { class: 'mision__recompensa', text: `${m.recompensa?.xp ?? 0} XP · ${m.recompensa?.oro ?? 0} oro` }),
      m.tipo === 'meta' ? el('button', {
        class: 'btn btn--pequeno btn--fantasma', text: 'Dar por cumplido',
        onClick: protegido('cumplir objetivo', () => {
          const r = quests.completar(m.refId, { forzar: true });
          avisar(r.aplicada ? 'Objetivo cumplido' : r.motivo, r.aplicada ? 'exito' : 'aviso');
          refrescarTodo();
        }),
      }) : null,
      m.tipo !== 'meta' && m.objetivos.every((o) => o.hecho) ? el('button', {
        class: 'btn btn--pequeno', text: 'Entregar encargo',
        onClick: protegido('entregar misión', () => {
          const r = quests.completar(m.refId);
          avisar(r.aplicada ? 'Encargo completado' : r.motivo, r.aplicada ? 'exito' : 'aviso');
          refrescarTodo();
        }),
      }) : null,
    ));
  }
}

function pintarGente(caja) {
  const npcs = sistema('npcs');
  const presentes = npcs?.paraInterfaz() ?? [];

  if (!presentes.length) {
    caja.append(el('p', { class: 'vacio', text: 'No hay nadie cerca.' }));
    return;
  }

  for (const n of presentes) {
    caja.append(el('div', { class: 'persona' },
      el('p', { class: 'persona__nombre', text: n.nombre }),
      el('p', { class: 'persona__rol', text: `${n.rol} · ${n.etiquetaActitud}` }),
      el('div', { class: 'persona__acciones' },
        el('button', {
          class: 'btn btn--pequeno',
          onClick: protegido('hablar', () => enviar(`Hablo con ${n.nombre}`)),
          text: 'Hablar',
        }),
        n.esMercader ? el('button', {
          class: 'btn btn--pequeno',
          onClick: protegido('comerciar', () => abrirComercio(n.refId)),
          text: 'Comerciar',
        }) : null,
      ),
    ));
  }
}

/* ── opciones sugeridas ───────────────────────────────────────────────── */

function abrirComercio(refId) {
  mercaderActivo = refId;
  sistema('merchants')?.abrir(refId);
  pintarComercio();
  $('#comercio-modal').hidden = false;
}

function pintarComercio() {
  const caja = $('#comercio-cuerpo');
  const mercado = sistema('merchants');
  const economia = sistema('economy');
  const catalogo = mercado?.catalogoParaInterfaz(mercaderActivo);
  if (!caja || !catalogo) return;
  vaciar(caja);
  $('#comercio-titulo').textContent = catalogo.mercader.nombre;
  $('#comercio-nota').textContent = `Tu oro: ${ver('player.oro', 0)} · Su oro: ${catalogo.oro}`;
  const compra = el('section', { class: 'comercio__seccion' }, el('h3', { text: 'Comprar' }));
  for (const o of catalogo.objetos) compra.append(el('div', { class: 'comercio__fila' },
    el('span', { class: 'comercio__nombre', text: `${o.nombre}${o.stock > 1 ? ` ×${o.stock}` : ''}` }),
    el('span', { class: 'comercio__precio', text: `${o.precio} oro` }),
    el('button', { class: 'btn btn--pequeno', text: 'Comprar', onClick: protegido('comprar', () => {
      const r = economia.comprar({ refIdMercader: mercaderActivo, objeto: o, cantidad: 1, stock: o.stock });
      avisar(r.exito ? `Comprado: ${o.nombre}` : r.mensaje, r.exito ? 'exito' : 'aviso'); pintarComercio(); refrescarTodo();
    }) })));
  caja.append(compra);
  const vendibles = mercado.vendibleA(mercaderActivo);
  if (vendibles.length) {
    const venta = el('section', { class: 'comercio__seccion' }, el('h3', { text: 'Vender' }));
    for (const o of vendibles) venta.append(el('div', { class: 'comercio__fila' },
      el('span', { class: 'comercio__nombre', text: `${o.nombre}${o.cantidad > 1 ? ` ×${o.cantidad}` : ''}` }),
      el('span', { class: 'comercio__precio', text: `${o.precio} oro` }),
      el('button', { class: 'btn btn--pequeno', text: 'Vender', onClick: protegido('vender', () => {
        const r = economia.vender({ refIdMercader: mercaderActivo, idObjeto: o.id, cantidad: 1 });
        avisar(r.exito ? `Vendido: ${o.nombre}` : r.mensaje, r.exito ? 'exito' : 'aviso'); pintarComercio(); refrescarTodo();
      }) })));
    caja.append(venta);
  }
}

/* ── entrada ──────────────────────────────────────────────────────────── */

function bloquear(si) {
  const campo = $('#entrada');
  const boton = $('#enviar');

  // Si el personaje ha muerto, nada reabre la caja: la acción o el turno que
  // estaba en marcha cuando cayó termina después y llamaba a `bloquear(false)`.
  // La fase `fin` no se deshace (muerte permanente).
  const cerrada = !si && ver('meta.fase') === 'fin';

  if (campo) campo.disabled = si || cerrada;
  if (boton) boton.disabled = si || cerrada;

  $('#pensando').hidden = !si;
}

async function enviar(texto, intencion) {
  const campo = $('#entrada');
  const accion = (texto ?? campo?.value ?? '').trim();

  if (!accion) return;
  if (campo) { campo.value = ''; ajustarAltoEntrada(); }
  ocultarSugerencias();
  completarEscritura();

  // En combate, la caja principal ES la caja de combate.
  //
  // Había dos sitios donde escribir, y el de abajo —el que tiene el foco y el
  // que la mano busca— no hacía nada: mandaba el texto al turno normal, que
  // con un combate en curso devolvía «el momento pasa sin que ocurra nada
  // digno de mención». El jugador describía su jugada, leía una frase de
  // relleno y ningún punto de vida se movía.
  //
  // Una sola caja acaba con el problema de raíz: no se puede escribir en el
  // sitio equivocado si solo hay un sitio.
  if (ver('combat.activo', false)) {
    await accionCombateLibre(accion);
    return;
  }

  const turns = sistema('turns');
  if (!turns) return;

  bloquear(true);

  try {
    await turns.procesar(accion, { intencionSugerida: intencion });
  } catch (e) {
    avisarFallo('turno', e);
  } finally {
    bloquear(false);
  }

  refrescarTodo();
  guardarTrasTurno();
  $('#entrada')?.focus();
  if (!escribiendo) programarSugerencias();
}

/** La caja crece con el texto hasta un tope, como un chat. */
function ajustarAltoEntrada() {
  const campo = $('#entrada');
  if (!campo || campo.tagName !== 'TEXTAREA') return;
  campo.style.height = 'auto';
  campo.style.height = `${Math.min(campo.scrollHeight, 180)}px`;
}

/* ── combate ──────────────────────────────────────────────────────────── */

/**
 * El menú del turno del jugador (decisión del 7-oct-2026: combate por menús,
 * a la manera de los juegos por turnos clásicos, con el aspecto de Arcanveil).
 *
 *   principal → Atacar → elegir ataque → elegir enemigo → confirmar
 *             → Objeto → elegir objeto
 *             → Defender / Huir (directos, con su coste dicho)
 *
 * Atacar no golpea, elegir ataque no golpea: solo «Confirmar» ejecuta, y
 * manda al motor la ficha del turno, el ataque y el objetivo elegidos (el
 * motor vuelve a comprobarlo todo antes de tocar nada). Volver o cambiar no
 * gasta nada. Con la ficha de un turno nuevo la selección se borra: el
 * siguiente ataque exige elegir otra vez, aunque el enemigo de antes siga en
 * pie. Elegir el objetivo con un clic y confirmar con otro es una decisión de
 * interfaz (que se vea ataque, objetivo y coste antes de ejecutar), no algo
 * pedido tal cual.
 */
const menuCombate = { etapa: 'principal', token: null, ataqueId: null, objetivoId: null, resolviendo: false, aviso: null };

function reiniciarMenuCombate(token = null) {
  Object.assign(menuCombate, { etapa: 'principal', token, ataqueId: null, objetivoId: null, resolviendo: false, aviso: null });
}

/** Volver una etapa atrás (botón «Volver» o Escape). No gasta nada. */
function volverMenuCombate() {
  if (menuCombate.resolviendo) return;
  const atras = { ataque: 'principal', objeto: 'principal', objetivo: 'ataque', confirmar: 'objetivo' }[menuCombate.etapa] ?? 'principal';
  if (atras === 'ataque') menuCombate.ataqueId = null;
  if (atras === 'objetivo') menuCombate.objetivoId = null;
  menuCombate.etapa = atras;
  menuCombate.aviso = null;
  pintarCombate();
  $('#combate .combate__menu button:not([disabled])')?.focus();
}

/**
 * El parte del combate: una línea por golpe.
 *
 * El motor las emite por `combat:log` desde el principio. Lo que faltaba era
 * alguien que las guardara.
 */
const registroCombate = [];

function pintarCombate() {
  const capa = $('#combate');
  if (!capa) return;

  const activo = ver('combat.activo', false);
  capa.hidden = !activo;

  // La caja de abajo cambia de sombrero. Es la misma caja, pero durante el
  // combate lo que se escriba ahí va al combate, y conviene que lo diga.
  const entrada = $('#entrada');
  if (entrada) {
    entrada.placeholder = activo
      ? 'Habla o huye con palabras; ataca desde el menú'
      : 'Escribe lo que haces o dices…';
  }

  if (!activo) return;

  const manager = sistema('combat');
  const datos = manager?.paraInterfaz();
  if (!datos) return;

  vaciar(capa);

  capa.append(el('p', { class: 'combate__eti', text: `Combate · ronda ${datos.ronda}` }));

  // Retrato del enemigo vivo más amenazante. Si hay varios, manda el de más
  // nivel: es el que decide cómo va el combate y el que conviene mirar.
  // Solo se mira al otro bando: un compañero de más nivel se quedaba el
  // hueco y, sin ficha de enemigo, la del rival desaparecía.
  const esEnemigo = (c) => c.bando === 'enemigo';
  const rival = datos.combatientes
    .filter((c) => esEnemigo(c) && c.vivo)
    .sort((a, b) => (b.nivel ?? 0) - (a.nivel ?? 0))[0];

  if (rival?.refId) {
    const plantilla = obtenerEnemigo(rival.refId);

    if (plantilla) {
      const marco = el('div', { class: 'combate__criatura' });

      // Cuántos quedan en pie de esa misma plantilla: en un combate contra
      // cuatro lobos importa más «×3 en pie» que cualquier otra cifra.
      const enPie = datos.combatientes
        .filter((c) => !c.esJugador && c.vivo && c.refId === rival.refId).length;

      // Su ficha: con qué pega y cómo se comporta. Saber que el saqueador
      // tira piedras de lejos o que huye si pierde cambia lo que conviene
      // escribir, y para eso hay que verlo.
      const habilidades = [
        ...(plantilla.ataques ?? []).map((a) => `${a.nombre} ${a.dano}${a.alcance === 'distancia' ? ' a distancia' : ''}`),
        plantilla.huye ? 'huye si pierde' : null,
        plantilla.negociable ? 'se puede negociar' : null,
      ].filter(Boolean).slice(0, 3);

      capa.append(el('div', { class: 'combate__rival' },
        marco,
        el('div', { class: 'combate__quien' },
          el('span', { class: 'combate__nombre', text: plantilla.nombre }),
          el('span', {
            class: 'combate__rasgo',
            text: `${plantilla.tipo} · ${plantilla.tamano}`
              + (enPie > 1 ? ` · ${enPie} en pie` : ''),
          }),
          habilidades.length
            ? el('span', { class: 'combate__habilidades', id: 'combate-habilidades', text: habilidades.join(' · ') })
            : null,
        ),
      ));

      const jefes = new Set(['devorador_de_brumas', 'guardian_de_la_puerta', 'senora_del_pantano']);
      pintarCriatura(marco, { ...plantilla, momentoClave: jefes.has(plantilla.refId) });
    }
  }

  // El menú del turno: lo que se puede elegir sale del motor (ataques del
  // equipo, enemigos vivos, consumibles). Ficha nueva = turno nuevo =
  // selección limpia. Lo elegido que deje de valer (el enemigo cae o huye,
  // el arma sale de la mano) se borra y se dice; no se pasa a otro.
  const menu = manager.esperandoJugador ? manager.accionesDelJugador?.() : null;
  if (menu && menu.token !== menuCombate.token) reiniciarMenuCombate(menu.token);
  if (menu && menuCombate.objetivoId && !menu.enemigos.some((e) => e.id === menuCombate.objetivoId)) {
    menuCombate.objetivoId = null;
    if (menuCombate.etapa === 'confirmar') menuCombate.etapa = 'objetivo';
    menuCombate.aviso = 'El enemigo que habías elegido ya no está en pie. Elige a quién.';
  }
  if (menu && menuCombate.ataqueId && !menu.ataques.some((a) => a.id === menuCombate.ataqueId && a.disponible)) {
    menuCombate.ataqueId = null;
    menuCombate.objetivoId = null;
    if (['objetivo', 'confirmar'].includes(menuCombate.etapa)) menuCombate.etapa = 'ataque';
    menuCombate.aviso = 'Ese ataque ya no está disponible. Elige otro.';
  }
  const eligiendo = Boolean(menu) && !menuCombate.resolviendo && ['objetivo', 'confirmar'].includes(menuCombate.etapa);

  const lista = el('div', { class: 'combate__lista' });

  for (const c of datos.combatientes) {
    const frac = Math.round(c.fraccionVida * 100);
    const esObjetivo = c.id === menuCombate.objetivoId;
    // Solo se pulsa a un enemigo cuando toca elegir a quién: fuera de esa
    // etapa, tocar una fila no selecciona nada (ni un objetivo invisible).
    const elegible = eligiendo && esEnemigo(c) && c.vivo && menu.enemigos.some((e) => e.id === c.id);

    // Se puede elegir a quién pegar.
    //
    // El motor siempre aceptó un objetivo —`accionJugador({tipo, objetivo})`—
    // pero la interfaz no lo ofrecía, así que el golpe iba siempre al primero
    // de la lista. Con tres saqueadores delante, rematar al que está tocado es
    // una decisión de combate, y tomarla es media gracia del asunto.
    const atributos = {
      class: 'luchador'
        + (c.vivo ? '' : ' es-caido')
        + (esObjetivo ? ' es-objetivo' : '')
        + (elegible ? ' luchador--elegible' : ''),
      // El id permite que un golpe encuentre a SU objetivo en pantalla y le
      // lance el número encima. Sin esto, el daño saldría en un sitio genérico
      // y el jugador no vería a quién le pasó, que es media información.
      dataset: { luchador: c.id },
    };

    if (elegible) {
      atributos['aria-pressed'] = String(esObjetivo);
      atributos['aria-label'] = `Elegir a ${c.nombre} (${c.vida?.actual ?? '?'} de ${c.vida?.max ?? '?'} de vida)`;
      atributos.onClick = () => {
        menuCombate.objetivoId = c.id;
        menuCombate.etapa = 'confirmar';
        menuCombate.aviso = null;
        pintarCombate();
        $('#combate .combate__confirmar')?.focus();
      };
    }

    // Cada luchador con su cara.
    //
    // Estaba solo el retrato del rival principal, arriba y en grande. Con tres
    // saqueadores y un jugador, la lista era cuatro barras con nombre: hay que
    // leer para saber a quién estás apuntando. Una miniatura se reconoce de un
    // vistazo, que es lo que se necesita cuando lo que decides es a cuál
    // rematas.
    const cara = el('div', { class: 'luchador__cara' });

    lista.append(el(elegible ? 'button' : 'div', atributos,
      cara,
      el('div', { class: 'luchador__fila' },
        el('span', { text: c.nombre }),
        // La vida en números, no solo en palabras. «Tocado» no dice si aguanta
        // otro golpe; «7/22» sí, y esa es la cuenta que se hace en una mesa
        // antes de decidir si rematas o te cubres.
        el('span', {
          class: 'luchador__cond',
          text: c.vivo ? `${c.vida?.actual ?? '?'}/${c.vida?.max ?? '?'} · ${c.condicion}` : c.condicion,
        }),
      ),
      el('div', { class: 'barra' },
        el('div', {
          class: 'barra__relleno ' + (c.esJugador ? 'barra__relleno--vida' : 'barra__relleno--enemigo'),
          style: `width:${frac}%`,
        }),
      ),
      c.estados?.length
        ? el('div', { class: 'luchador__estados', text: c.estados.map((s) => s.nombre).join(' · ') })
        : null,
    ));

    // El retrato se pinta después de montar la fila: `pintarCriatura` compara
    // una firma contra el nodo y necesita que ya esté en su sitio.
    if (c.esJugador) pintarRetrato(cara, fichaRetratoJugador());
    else if (c.bando === 'aliado') {
      // Un compañero, con la misma cara que en la pestaña Grupo.
      const f = (sistema('party')?.miembros?.() ?? []).find((m) => m.ficha?.refId === c.refId)?.ficha;
      if (f) pintarRetrato(cara, { refId: f.refId, nombre: f.nombre });
    } else {
      const plantilla = obtenerEnemigo(c.refId);
      if (plantilla) pintarCriatura(cara, plantilla);
    }
  }

  capa.append(lista);

  // El parte del combate, golpe a golpe.
  //
  // El motor lleva desde siempre emitiendo `combat:log` con la línea de cada
  // ataque —quién pega a quién, cuánto saca, cuánto quita— y no lo recogía
  // nadie. El combate resolvía bien y el jugador solo veía barras moviéndose:
  // ganaba o perdía sin saber por qué, que en un juego de dados es lo único
  // que no puede pasar.
  if (registroCombate.length) {
    const parte = el('div', { class: 'combate__parte', id: 'combate-parte' });
    for (const linea of registroCombate.slice(-10)) {
      parte.append(el('p', { class: 'combate__linea', text: linea }));
    }
    capa.append(parte);
  }

  if (menu) {
    capa.append(menuDelTurno(menu, datos));
  } else {
    capa.append(el('p', { class: 'combate__espera', text: 'El enemigo actúa…' }));
  }

  // El parte se lee como cualquier registro: lo último es lo que acaba de
  // pasar, así que la vista se queda abajo.
  const parte = $('#combate-parte');
  if (parte) parte.scrollTop = parte.scrollHeight;
}

/** El menú del turno según su etapa. */
function menuDelTurno(menu, datos) {
  const caja = el('div', { class: 'combate__menu-caja' });
  const ataque = menu.ataques.find((a) => a.id === menuCombate.ataqueId) ?? null;
  const objetivo = menu.enemigos.find((e) => e.id === menuCombate.objetivoId) ?? null;
  const ocupado = menuCombate.resolviendo;
  const boton = (texto, accion, { clase = 'btn', deshabilitado = false, titulo, sub } = {}) => el('button', {
    class: clase, disabled: ocupado || deshabilitado ? true : undefined, title: titulo,
    onClick: protegido('combate', accion),
  }, sub ? el('span', { class: 'combate__opcion-nombre', text: texto }) : texto, sub ? el('span', { class: 'combate__opcion-dato', text: sub }) : null);
  const describirAtaque = (a) => `${a.dano} ${a.tipo ?? ''} · ${a.alcance === 'distancia' ? 'a distancia' : 'cuerpo a cuerpo'} · sin coste`.replace(/\s+·/g, ' ·');

  // Qué etapa es y qué hay elegido: se lee y se anuncia.
  const etapas = {
    principal: 'Tu turno: elige qué haces.',
    ataque: 'Atacar: elige el ataque.',
    objetivo: `${ataque?.nombre ?? 'Ataque'}: elige a quién atacas (toca su fila).`,
    confirmar: objetivo && ataque ? `Atacar a ${objetivo.nombre} con ${ataque.nombre}.` : 'Confirma el ataque.',
    objeto: 'Objeto: elige qué usas.',
  };
  caja.append(el('p', { class: 'combate__etapa', role: 'status', 'aria-live': 'polite', text: ocupado ? 'Resolviendo…' : etapas[menuCombate.etapa] }));
  if (menuCombate.aviso) caja.append(el('p', { class: 'combate__aviso', role: 'alert', text: menuCombate.aviso }));

  const opciones = el('div', { class: 'combate__menu', 'data-etapa': menuCombate.etapa });
  if (menuCombate.etapa === 'principal') {
    opciones.append(
      boton('Atacar', () => { menuCombate.etapa = 'ataque'; menuCombate.aviso = null; pintarCombate(); $('#combate .combate__menu button:not([disabled])')?.focus(); }, { clase: 'btn btn--peligro', sub: 'Elige ataque y enemigo' }),
      boton('Defender', () => ejecutarMenuCombate({ tipo: 'defender' }), { sub: 'Protegido hasta tu próximo turno' }),
      boton('Objeto', () => { menuCombate.etapa = 'objeto'; menuCombate.aviso = null; pintarCombate(); $('#combate .combate__menu button:not([disabled])')?.focus(); }, { sub: ((n) => `${n} ${n === 1 ? 'disponible' : 'disponibles'}`)(menu.consumibles.filter((o) => o.disponible).length), deshabilitado: !menu.consumibles.length }),
      boton('Huir', () => ejecutarMenuCombate({ tipo: 'huir' }), { clase: 'btn btn--fantasma', sub: 'Tirada difícil; si falla, pierdes el turno' }),
    );
  } else if (menuCombate.etapa === 'ataque') {
    if (!menu.ataques.length) opciones.append(el('p', { class: 'combate__aviso', text: 'No tienes con qué atacar.' }));
    for (const a of menu.ataques) {
      opciones.append(boton(a.nombre, () => {
        menuCombate.ataqueId = a.id; menuCombate.objetivoId = null; menuCombate.etapa = 'objetivo'; menuCombate.aviso = null;
        pintarCombate();
        $('#combate .luchador--elegible')?.focus();
      }, { clase: 'btn btn--peligro combate__opcion', deshabilitado: !a.disponible, sub: a.disponible ? describirAtaque(a) : a.motivo }));
    }
  } else if (menuCombate.etapa === 'confirmar' && ataque && objetivo) {
    opciones.append(
      boton(`Atacar a ${objetivo.nombre}`, () => ejecutarMenuCombate({ tipo: 'atacar', ataqueId: ataque.id, itemId: ataque.itemId ?? null, objetivoId: objetivo.id }), {
        clase: 'btn btn--peligro combate__confirmar', sub: `${ataque.nombre} · ${describirAtaque(ataque)} · ${objetivo.vida}/${objetivo.max} de vida`,
      }),
      boton('Cambiar de enemigo', () => { menuCombate.objetivoId = null; menuCombate.etapa = 'objetivo'; pintarCombate(); $('#combate .luchador--elegible')?.focus(); }),
    );
  } else if (menuCombate.etapa === 'objeto') {
    for (const o of menu.consumibles) {
      opciones.append(boton(`${o.nombre}${o.cantidad > 1 ? ` ×${o.cantidad}` : ''}`, () => ejecutarMenuCombate({ tipo: 'usar_objeto', itemId: o.id }), {
        clase: 'btn combate__opcion', deshabilitado: !o.disponible, sub: o.disponible ? 'Usar ahora (gasta el turno)' : o.motivo,
      }));
    }
  }
  if (menuCombate.etapa !== 'principal') {
    opciones.append(boton('Volver', volverMenuCombate, { clase: 'btn btn--fantasma combate__volver' }));
  }
  caja.append(opciones);
  caja.append(el('p', { class: 'combate__ayuda', text: 'Abajo puedes hablar, defenderte, huir o curarte con tus palabras; los ataques se eligen aquí.' }));
  return caja;
}

/**
 * Manda UNA acción del menú al motor, con la ficha del turno. Mientras se
 * resuelve, el menú se bloquea (el doble clic no actúa dos veces; además el
 * motor solo acepta la ficha una vez). Si el motor la rechaza, se dice y se
 * vuelve a la etapa que toca, sin atacar a nadie por su cuenta.
 */
async function ejecutarMenuCombate(accion) {
  const manager = sistema('combat');
  if (!manager?.esperandoJugador || menuCombate.resolviendo) return;
  menuCombate.resolviendo = true;
  menuCombate.aviso = null;
  pintarCombate();
  bloquear(true);
  let r = null;
  try {
    r = await manager.ejecutar({ ...accion, token: menuCombate.token });
  } finally {
    menuCombate.resolviendo = false;
    bloquear(false);
  }
  if (r && !r.ok) {
    menuCombate.aviso = r.texto ?? 'No se ha podido hacer.';
    if (r.motivo === 'objetivo') { menuCombate.objetivoId = null; menuCombate.etapa = 'objetivo'; }
    else if (r.motivo === 'ataque') { menuCombate.ataqueId = null; menuCombate.objetivoId = null; menuCombate.etapa = 'ataque'; }
    else if (r.motivo === 'objeto') menuCombate.etapa = 'objeto';
    else reiniciarMenuCombate(manager.turnoToken?.() ?? null);
  }
  refrescarTodo();
}

async function accionCombateLibre(desdeFuera) {
  const texto = String(desdeFuera ?? $('#combate-entrada')?.value ?? '').trim();
  if (!texto) return;

  const manager = sistema('combat');
  if (!manager?.esperandoJugador) return;

  bus.emit('narrative:direct', { texto, voz: 'player' });

  // La jugada escrita la lee el motor: qué es, a quién, con qué y cuánto
  // premia (ver `combat/Jugada.js`). Antes tres expresiones regulares la
  // reducían a atacar, defender o huir, y lo escrito no contaba. El objetivo
  // marcado vale si la frase no nombra otro: quien ha marcado al saqueador
  // tocado y escribe «le doy en la pierna» quiere decir a ÉSE.
  // Sin objetivo marcado: lo escrito no puede atacar a nadie por su cuenta
  // (los ataques van por el menú; ver `CombatManager.jugadaLibre`).
  bloquear(true);
  await manager.jugadaLibre(texto);
  bloquear(false);
  refrescarTodo();

  const campo = $('#combate-entrada');
  if (campo) campo.value = '';
}


/* ═══════════════════════════════════════════════════════════════════════════
   AVISOS
   ═══════════════════════════════════════════════════════════════════════════ */

function avisar(mensaje, tipo = 'info') {
  const caja = $('#avisos');
  if (!caja) return;

  const nodo = el('div', { class: `aviso aviso--${tipo}`, text: mensaje });
  caja.append(nodo);

  setTimeout(() => nodo.remove(), 4200);
}

/* ═══════════════════════════════════════════════════════════════════════════
   ARRANQUE
   ═══════════════════════════════════════════════════════════════════════════ */


async function probarIALocal() {
  const url = ($('#ia-url')?.value ?? '').trim();
  const modelo = ($('#ia-modelo')?.value ?? '').trim();
  const estado = $('#ia-estado'); const activar = $('#ia-activar');
  const dm = sistema('dungeonmaster'); const local = dm?.proveedor(PROVEEDORES.LOCAL);
  local?.configurar({ url, modelo });
  if (!url || !modelo) { estado.textContent = 'Indica la dirección y el modelo instalados.'; activar.disabled = true; return; }
  estado.textContent = 'Comprobando el modelo local…'; activar.disabled = true;
  const r = await local.probar();
  if (!r.ok) { estado.textContent = r.motivo; return; }
  estado.textContent = r.modelos.includes(modelo) ? `Conectado a ${modelo}.` : `Servidor conectado. Modelos: ${r.modelos.join(', ') || 'ninguno'}`;
  activar.disabled = !r.modelos.includes(modelo);
}

function activarIALocal() {
  const dm = sistema('dungeonmaster');
  const url = ($('#ia-url')?.value ?? '').trim(); const modelo = ($('#ia-modelo')?.value ?? '').trim();
  dm?.proveedor(PROVEEDORES.LOCAL)?.configurar({ url, modelo });
  const r = dm?.cambiar(PROVEEDORES.LOCAL);
  if (!r?.exito || r.motivo) { avisar(r?.motivo ?? 'No se pudo activar la IA local', 'aviso'); return; }
  store.fijar('settings.urlLocal', url); store.fijar('settings.modeloLocal', modelo); store.fijar('settings.proveedor', PROVEEDORES.LOCAL);
  avisar('Narra el modelo instalado en este PC. Si falla, sigue el procedural.', 'exito'); $('#director-modal').hidden = true;
  pintarNarrador();
}

function pintarDirectores() {
  const dm = sistema('dungeonmaster');
  const caja = $('#director-opciones');
  if (!dm || !caja) return;
  vaciar(caja);
  for (const opcion of dm.catalogo()) {
    const id = opcion.id ?? opcion.refId;
    caja.append(el('button', {
      class: 'director-opcion' + (dm.inspeccionar().elegido === id ? ' es-activo' : ''),
      onClick: protegido('cambiar narrador', () => {
        // Groq y el modelo local se configuran antes: Groq, además, no manda
        // nada hasta que el jugador acepta qué se envía.
        if (id === PROVEEDORES.GROQ || id === PROVEEDORES.LOCAL) { mostrarPanelNarrador(id); return; }
        const r = dm.cambiar(id);
        store.fijar('settings.proveedor', id);
        avisar(r.motivo ?? `Narrador: ${opcion.nombre}`, r.motivo ? 'aviso' : 'exito');
        pintarDirectores();
        pintarNarrador();
        $('#director-modal').hidden = true;
      }),
    // El catálogo trae `descripcion`; se leía `resumen`, que no existe, y
    // cada opción salía solo con su nombre. Y el límite, si lo tiene: el
    // director interno no improvisa como un modelo, y se dice aquí.
    }, el('strong', { text: opcion.nombre }), el('span', { text: opcion.descripcion ?? '' }),
    opcion.limite ? el('small', { class: 'director-opcion__limite', text: opcion.limite }) : null))
  }
}

function abrirPuente({ prompt }) {
  $('#puente-prompt').value = prompt ?? '';
  $('#puente-respuesta').value = '';
  $('#puente-error').hidden = true;
  $('#puente-modal').hidden = false;
}

function aplicarPuente() {
  const dm = sistema('dungeonmaster');
  const puente = dm?.proveedor(PROVEEDORES.PUENTE);
  const r = puente?.recibir($('#puente-respuesta')?.value ?? '');
  if (!r?.aceptada) {
    const error = $('#puente-error'); error.textContent = r?.motivo ?? 'La respuesta no es válida.'; error.hidden = false;
    return;
  }
  $('#puente-modal').hidden = true;
}

function conectarEventos() {
  $('#comercio-cerrar')?.addEventListener('click', () => { $('#comercio-modal').hidden = true; mercaderActivo = null; });
  $('#director')?.addEventListener('click', () => abrirNarrador());
  $('#ia-probar')?.addEventListener('click', protegido('probar IA local', probarIALocal));
  $('#ia-activar')?.addEventListener('click', protegido('activar IA local', activarIALocal));
  $('#groq-probar')?.addEventListener('click', protegido('probar Groq', probarGroq));
  $('#groq-activar')?.addEventListener('click', protegido('activar Groq', activarGroq));
  $('#groq-consiento')?.addEventListener('change', protegido('consentimiento Groq', retirarConsentimientoGroq));
  bus.on('turn:end', () => pintarNarrador());
  bus.on('dm:degraded', () => pintarNarrador());
  bus.on('dm:recovered', () => pintarNarrador());
  $('#director-cerrar')?.addEventListener('click', () => { $('#director-modal').hidden = true; });
  $('#puente-copiar')?.addEventListener('click', async () => { await navigator.clipboard.writeText($('#puente-prompt').value); avisar('Encargo copiado', 'exito'); });
  $('#puente-aplicar')?.addEventListener('click', protegido('respuesta del puente', aplicarPuente));
  $('#puente-cancelar')?.addEventListener('click', () => sistema('dungeonmaster')?.proveedor(PROVEEDORES.PUENTE)?.cancelar());
  bus.on('bridge:open', abrirPuente);
  bus.on('bridge:close', () => { $('#puente-modal').hidden = true; });

  // Entrada de texto.
  $('#enviar')?.addEventListener('click', protegido('enviar', () => enviar()));

  $('#entrada')?.addEventListener('input', () => { ajustarAltoEntrada(); ocultarSugerencias(); if (!$('#entrada').value.trim()) programarSugerencias(); });
  $('#bitacora')?.addEventListener('click', () => { if (escribiendo) { completarEscritura(); programarSugerencias(); } });

  // Al irse a otra pestaña se vuelca lo que quedara por escribir. Nadie lo
  // está viendo aparecer, y así al volver está el texto entero en vez de
  // párrafos en blanco esperando un fotograma que no llegó.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && escribiendo) { completarEscritura(); programarSugerencias(); }
  });

  conectarModales();

  $('#importar-cerrar')?.addEventListener('click', () => { $('#importar-modal').hidden = true; });
  $('#importar-leer')?.addEventListener('click', protegido('leer historia', leerHistoriaPegada));

  $('#sugerencias-cerrar')?.addEventListener('click', () => ocultarSugerencias());
  bus.on('combat:start', () => ocultarSugerencias());
  bus.on('combat:end', () => { guardarTrasTurno(); programarSugerencias(); });
  $('#entrada')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      enviar();
    }
  });

  $('#cargar-volver')?.addEventListener('click', () => { mostrar('inicio'); pintarInicio(); });
  $('#inicio-jugar')?.addEventListener('click', () => abrirMenuInicio());
  $('#inicio-volver')?.addEventListener('click', () => cerrarMenuInicio());
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const seccion = document.querySelector('section[data-pantalla="inicio"]');
    if (seccion && !seccion.hidden && seccion.dataset.estado === 'menu') cerrarMenuInicio();
  });
  $('#ajustes-cerrar')?.addEventListener('click', () => { $('#ajustes-modal').hidden = true; });
  $('#menu')?.addEventListener('click', protegido('menú', () => salirConGuardado(() => {
    // Tras recargar, directamente al menú: quien pulsa «Menú» no quiere ver
    // otra vez la portada.
    try { sessionStorage.setItem('arcanveil:abrir-menu', '1'); } catch { /* sin sesión, portada */ }
    // Volver al título recargando deja el motor limpio para la próxima partida.
    location.reload();
  })));
  // Escape en el selector de ranuras llenas: de la confirmación vuelve a la
  // lista; de la lista, cancela. Nunca reemplaza nada.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || $('#ranuras-modal')?.hidden !== false) return;
    ($('#ranuras-volver') ?? $('#ranuras-cancelar'))?.click();
  });
  // Escape en el aviso de salida: quedarse (nunca salir sin guardar).
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || $('#salida-modal')?.hidden !== false) return;
    const quedarme = [...document.querySelectorAll('#salida-acciones button')].find((b) => /Quedarme|Cancelar|Volver/.test(b.textContent));
    quedarme?.click();
  });

  $('#guardar')?.addEventListener('click', protegido('guardar', async () => {
    const boton = $('#guardar');
    // Un guardado a la vez: el doble clic no pide otro.
    if (boton?.getAttribute('aria-busy') === 'true') return;
    store.fijar('settings.persistencia', true);
    bus.emit('settings:change', { id: 'persistencia', valor: true });

    const runId = ver('meta.runId');
    const rotulo = boton?.textContent ?? 'Guardar';
    boton?.setAttribute('aria-busy', 'true');
    boton?.classList.add('es-guardando');
    if (boton) boton.textContent = 'Guardando…';
    let r;
    try {
      // Se dice lo que ha pasado de verdad (relectura de la copia que vale).
      r = await guardarYComprobar();
    } finally {
      boton?.removeAttribute('aria-busy');
      boton?.classList.remove('es-guardando');
      if (boton) boton.textContent = rotulo;
    }
    // Si entretanto se abrió otra partida, el aviso no es para esta pantalla.
    if (ver('meta.runId') !== runId) return;
    avisar(r.ok ? 'Partida guardada' : (r.motivo ?? 'No se pudo guardar'), r.ok ? 'exito' : 'aviso');
  }));

  // El motor avisa; la interfaz lo muestra (lo de otra partida, no).
  bus.on('ui:notice', ({ mensaje, tipo, runId }) => {
    if (runId && runId !== ver('meta.runId')) return;
    avisar(mensaje, tipo);
  });
  bus.on('achievement:unlocked', ({ nombre }) => avisar(`Hazaña: ${nombre}`, 'exito'));
  // Subir de nivel merece más que un aviso en la esquina: es de las pocas
  // cosas que cambian lo que puedes intentar.
  bus.on('player:levelup', ({ nivel }) => {
    rotuloMomento(`NIVEL ${nivel}`, 'oro');
    avisar(`Has subido a nivel ${nivel}`, 'exito');
  });

  // El parte de cada golpe, recogido.
  //
  // `combat:log` se emitía y se escuchaba solo para repintar; su texto —que es
  // justo lo que cuenta lo ocurrido— se tiraba. Aquí se guarda.
  bus.on('combat:log', ({ texto }) => {
    if (texto) registroCombate.push(texto);
    // Techo generoso: el panel enseña las diez últimas, pero el combate entero
    // cabe sin problema y un día puede querer leerse completo.
    if (registroCombate.length > 200) registroCombate.splice(0, registroCombate.length - 200);
  });

  // Cada combate empieza con el parte en blanco y sin puntería heredada.
  bus.on('combat:start', () => { registroCombate.length = 0; reiniciarMenuCombate(null); });
  // Escape vuelve una etapa del menú de combate (nunca ejecuta nada).
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || $('#combate')?.hidden || menuCombate.etapa === 'principal') return;
    e.preventDefault();
    volverMenuCombate();
  });

  // Cualquier cambio del mundo redibuja lo que corresponda.
  for (const evento of ['combat:start', 'combat:end', 'combat:turn', 'combat:awaiting', 'combat:log']) {
    bus.on(evento, () => { pintarCombate(); pintarBitacora(); });
  }

  // El golpe, en pantalla. Una barra que baja dice que pasó algo; esto dice
  // cuánto y a quién. Se engancha a `combat:attack`, que ya trae el daño
  // resuelto por el motor: aquí no se calcula nada, solo se enseña.
  bus.on('combat:attack', (golpe) => {
    if (!golpe?.dano?.total) return;

    // El repintado del panel ocurre en el mismo tic; se espera a que el
    // objetivo exista en el DOM o el número saldría sobre un nodo muerto.
    setTimeout(() => {
      const objetivo = $(`[data-luchador="${golpe.objetivo?.id}"]`);
      if (!objetivo) return;

      const critico = Boolean(golpe.tirada?.critico);

      numeroDano(objetivo, golpe.dano.total, {
        critico,
        esJugador: golpe.objetivo?.esJugador,
      });

      destello(objetivo, 'dano');

      // La sacudida se reserva: el crítico y el golpe que derriba. Si todo
      // tiembla, el temblor deja de significar nada.
      if (critico || golpe.cayo) {
        sacudir($('#combate'), golpe.cayo ? 'fuerte' : 'suave');
      }
    }, 30);
  });

  bus.on('narrative:direct', () => setTimeout(pintarBitacora, 10));
  bus.on('world:arrived', () => refrescarTodo());
  // La muerte la cierra el motor (`player/Muerte.js`), que escucha las dos
  // caídas (combate y agotamiento) y avisa una sola vez con `run:ended`.
  // Aquí: se guarda el resultado terminal ANTES de ofrecer partida nueva, y
  // se enseña el final. Si la pantalla ya está abierta, solo se asegura la
  // caja cerrada.
  bus.on('run:ended', (muerte) => {
    // El final (con la muerte dentro) va a la cola de guardados detrás de lo
    // que hubiera: el último que se escribe es el final.
    guardarPartidaActual({ avisarSiFalla: true });
    const modal = $('#caida-modal');
    if (modal && !modal.hidden) { bloquear(true); return; }
    rotuloMomento('HA MUERTO', 'sangre');
    abrirMuerte(muerte);
  });

  bus.on('run:registrado', ({ runId }) => {
    if (ver('meta.muerte.runId') !== runId) return;
    const muerte = ver('meta.muerte');
    if (muerte && $('#caida-modal') && !$('#caida-modal').hidden) pintarRegistroMuerte(muerte);
  });

  // Un retrato elegido (o la galería recién cargada) se ve en todas partes:
  // la galería llega después de pintar la primera pantalla, que suele ser la
  // de inicio con los personajes guardados.
  alCambiarGaleria(() => {
    const pantalla = document.body.getAttribute('data-active-screen');
    if (pantalla === 'juego') refrescarTodo();
    else if (pantalla === 'inicio') pintarInicio();
  });
}

/** Retira la pantalla de arranque y muestra el juego. */
function arranqueListo() {
  const capa = document.getElementById('arranque');

  if (capa) {
    capa.hidden = true;
    // El rótulo trae `display:flex` en línea para verse antes que la hoja de
    // estilos, y eso gana a cualquier regla: hay que apagarlo en línea también
    // o se queda tapando el juego con el motor ya en marcha.
    capa.style.display = 'none';
  }

  document.body.classList.add('esta-listo');
}

/** Deja el fallo escrito en la pantalla de arranque, que sí se ve. */
function arranqueFallido(donde, error) {
  const capa = document.getElementById('arranque');
  if (capa) capa.hidden = false;

  const texto = document.getElementById('arranque-texto');
  if (texto) {
    texto.style.color = '#E5A08C';
    texto.textContent = `No se pudo arrancar · ${donde}`;
  }

  // La traza completa, a la vista: es lo que hace falta para arreglarlo.
  const detalle = document.getElementById('arranque-detalle');
  if (detalle) {
    detalle.style.display = 'block';
    detalle.textContent = `${error?.name ?? 'Error'}: ${error?.message ?? error}\n\n`
      + String(error?.stack ?? '(sin traza)').split('\n').slice(0, 8).join('\n');
  }

  avisarFallo(donde, error);
}

async function arrancar() {
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('../sw.js').catch((e) => console.warn('[arcanveil] modo offline no disponible', e));
  }
  // Si algo se cuelga, a los ocho segundos se dice en pantalla en vez de
  // dejar al jugador mirando un rótulo eterno.
  const vigilante = setTimeout(() => {
    if (!motor.listo) {
      arranqueFallido('tiempo agotado', new Error('el motor tardó demasiado en arrancar'));
    }
  }, 8000);

  try {
    await arrancarMotor();
  } catch (e) {
    clearTimeout(vigilante);
    arranqueFallido('motor', e);
    return;
  }

  clearTimeout(vigilante);

  // Si hay imágenes declaradas en assets/, sustituirán al arte vectorial. No
  // se espera a que termine: sin manifiesto el juego funciona igual, y hacer
  // que el arranque dependa de una petición que casi siempre falla sería
  // pagar un retraso por nada.
  // La ruta es relativa a `app/index.html`, que es el documento que la pide.
  cargarManifiesto('../assets/manifest.json').then((hubo) => {
    if (!hubo) return;

    // Llega después de que la pantalla ya esté pintada, así que hay que
    // repintar la que esté a la vista para que las imágenes releven al vector.
    const pantalla = document.body.getAttribute('data-active-screen');

    if (pantalla === 'juego') refrescarTodo();
  });

  // Los retratos elegidos viven en el navegador (IndexedDB): se cargan sin
  // esperar, y al llegar se repinta lo que esté a la vista.
  abrirGaleria();

  try {
    recuperarPersistencia();
    // Una entrega de herencia que se cortó a medias (pestaña cerrada,
    // corte de luz) se termina o se devuelve ANTES de enseñar nada.
    // Las que no se pueden comprobar quedan apartadas (sin liberar ni borrar
    // nada) y se dice: el jugador las ve en «Nueva partida».
    let bloqueadas = 0;
    try { bloqueadas = (await Entrega.recuperarLegados()).filter((x) => x.bloqueado).length; } catch (e) { console.warn('[arcanveil] no se ha podido revisar las herencias', e); }
    if (bloqueadas) setTimeout(() => avisar(`Hay ${bloqueadas === 1 ? 'una herencia' : `${bloqueadas} herencias`} que no se ${bloqueadas === 1 ? 'puede' : 'pueden'} comprobar. No he vuelto a entregarla ni he borrado ninguna partida: está en «Nueva partida».`, 'aviso'), 600);
    conectarEventos();
    pintarInicio();
    mostrar('inicio');
    let alMenu = false;
    try { alMenu = sessionStorage.getItem('arcanveil:abrir-menu') === '1'; sessionStorage.removeItem('arcanveil:abrir-menu'); } catch { /* sin sesión */ }
    if (alMenu) abrirMenuInicio({ foco: false });
    let nueva = false;
    try { nueva = sessionStorage.getItem('arcanveil:nueva-partida') === '1'; sessionStorage.removeItem('arcanveil:nueva-partida'); } catch { /* sin sesión */ }
    let origen = null;
    try { origen = sessionStorage.getItem('arcanveil:legado-origen'); sessionStorage.removeItem('arcanveil:legado-origen'); } catch { /* sin sesión */ }
    if (nueva) await abrirNuevaPartida({ origen });
    let cargarTras = null;
    try { cargarTras = sessionStorage.getItem('arcanveil:cargar'); sessionStorage.removeItem('arcanveil:cargar'); } catch { /* sin sesión */ }
    if (cargarTras) await cargarRanura(cargarTras);
    menuTrasArrancar = true;
    arranqueListo();
    comenzarPendiente();
  } catch (e) {
    // Aunque la interfaz falle, la pantalla se descubre: es mejor ver el
    // error que un vacío.
    arranqueListo();
    arranqueFallido('interfaz', e);
  }

  // Para inspeccionar desde la consola del navegador.
  window.ARCANVEIL = {
    motor, store, bus, ver,
    sistema,
    jugar: (t) => enviar(t),
    interfaz: { mostrarSugerencias, completarEscritura, estado: () => ({ escribiendo, cola: colaEscritura.length, temporizador: Boolean(temporizadorSugerencias) }) },
    inspeccionar: (n) => (n ? sistema(n)?.inspeccionar?.() : motor.registry?.inspeccionar?.()),
  };
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', arrancar);
} else {
  arrancar();
}
