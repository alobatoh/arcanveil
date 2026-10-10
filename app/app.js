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
  pintarLugar, pintarRetrato, pintarCriatura, pintarMarcador, pintarArte, cargarManifiesto,
  especieNombrada, claveRetrato,
} from '../src/art/index.js';
import { abrirGaleria, aprobar, alCambiarGaleria, urlAprobada, estiloAprobada, olvidar as olvidarRetrato, borrarGaleria } from '../src/art/galeria.js';
import { pedirCandidata, estadoGenerador, olvidarCandidatas } from '../src/art/candidata.js';
import {
  ESTILO_DIBUJO, PELOS, OJOS, RASGOS, normalizarAspecto, aspectoDesdeDescripcion, opcionesDibujo, svgDibujo, describirDibujo, rasterizar,
} from '../src/art/dibujo.js';
import { sujetoRetrato } from '../src/art/rasgos.js';
import { obtenerEnemigo } from '../src/data/enemies.data.js';

import { fichaAleatoria, nombreAleatorio } from '../src/player/CharacterRandom.js';
import { previsualizar } from '../src/player/CharacterFactory.js';
import { ATRIBUTOS } from '../src/config/balance.config.js';
import { HABILIDADES } from '../src/data/skills.data.js';
import { aplicarCorreccion, resumenPersonaje, sexoDescrito, PREGUNTA_CREACION } from '../src/player/Correccion.js';
import {
  listarPersonajes, obtenerPersonaje, guardarPersonaje,
} from '../src/persistence/CharacterRoster.js';
import * as Entrega from '../src/persistence/EntregaLegado.js';
import * as Ranuras from '../src/persistence/Ranuras.js';
import { explicarLegado, procedenciaXP } from '../src/player/Legado.js';
import { nuevoRunId } from '../src/player/Muerte.js';
import { nivelParaXP } from '../src/player/Progression.js';
import { RAZAS, atributosDe, rasgosDe } from '../src/data/races.data.js';
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

// Todos los módulos han llegado y este se está ejecutando: a partir de aquí
// manda el vigilante de `arrancar()`, no el de la página (ver index.html).
if (globalThis.__arcanveilArranque) globalThis.__arcanveilArranque.fase = 'modulo';

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

/** `append` sin los huecos: el del DOM escribe «null» si se le pasa un nulo. */
function poner(nodo, ...hijos) {
  nodo.append(...hijos.flat().filter((h) => h !== null && h !== undefined && h !== false));
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

/* ── creación: por pasos, eligiendo ───────────────────────────────────── */

const borrador = {
  nombre: '', raza: 'valdes', clase: 'rastreador', trasfondo: 'errante',
  genero: 'm', retrato: '', lore: '', intensidad: 'equilibrado', aspecto: null,
};

/** El personaje ya guardado en el plantel (existe desde el paso «Aspecto»). */
let personajeCreado = null;

/**
 * Si el nombre lo ha escrito el jugador y no el dado.
 *
 * Hace falta saberlo aparte: el campo copia cada tecla a `borrador.nombre`,
 * así que comparar el campo con el borrador no distingue un nombre escrito de
 * uno tirado, y volver a tirar se llevaba por delante el nombre del jugador.
 */
let nombreEscrito = false;

/**
 * Los pasos de la creación. Cada uno cabe en la pantalla: antes era un
 * formulario largo con «Crear personaje» a la vista y la mitad de los campos
 * debajo, fuera de ella.
 */
const PASOS = Object.freeze([
  { id: 'origen', nombre: 'Origen', nota: 'Elige tu linaje, tu oficio y tu pasado en las listas. El dado es opcional: tira solo lo que no hayas elegido tú.' },
  { id: 'quien', nombre: 'Quién eres', nota: 'Tu nombre, tu historia y lo dura que quieres la partida.' },
  { id: 'aspecto', nombre: 'Aspecto', nota: 'Cómo eres, con tus palabras, y qué imagen te acompaña.' },
  { id: 'revisar', nombre: 'Revisar', nota: 'Así queda tu personaje. Vuelve atrás para cambiar lo que quieras: no se pierde nada.' },
]);
let pasoCreacion = 'origen';

/** Lo que el jugador ha elegido a mano: el dado no lo toca. */
const fijado = { raza: false, clase: false, trasfondo: false, genero: false };

/** El control de imagen del paso «Aspecto» (ver `montarAspecto`). */
let aspectoCreacion = null;

const NOMBRE_ATRIBUTO = Object.freeze({ vigor: 'Vigor', destreza: 'Destreza', temple: 'Temple', intelecto: 'Intelecto', astucia: 'Astucia', carisma: 'Carisma' });
const ETI_ATRIBUTO = Object.freeze({ vigor: 'VIG', destreza: 'DES', temple: 'TEM', intelecto: 'INT', astucia: 'AST', carisma: 'CAR' });
const nombreHabilidad = (id) => HABILIDADES[id]?.nombre ?? String(id).replace(/_/g, ' ');

/**
 * Tira el origen. Solo lo que el jugador NO ha elegido a mano, salvo `todo`
 * (personaje nuevo). El nombre se tira si no lo ha escrito él.
 */
function tirarFicha({ todo = false } = {}) {
  const f = fichaAleatoria();
  for (const k of ['raza', 'clase', 'trasfondo', 'genero']) if (todo || !fijado[k]) borrador[k] = f[k];
  if (todo || !nombreEscrito) borrador.nombre = nombreAleatorio(borrador.raza, borrador.genero);
}

function abrirCreacion() {
  personajeCreado = null;
  for (const k of Object.keys(fijado)) fijado[k] = false;
  nombreEscrito = false;
  tirarFicha({ todo: true });
  borrador.retrato = '';
  borrador.lore = '';
  borrador.aspecto = null;
  // Sin esto, volver desde la revisión y luego pulsar «Crear otro»
  // sobrescribía al personaje anterior en vez de crear uno.
  delete borrador.id;
  delete borrador.creado;
  delete borrador.semillaRetrato;
  pasoCreacion = 'origen';
  mostrar('creacion');
  pintarCreacion();
}

/** Pinta el paso en curso: barra de pasos, cuerpo y pie. */
function pintarCreacion({ foco = '#creacion-titulo', eco = null } = {}) {
  aspectoCreacion?.cerrar();
  aspectoCreacion = null;
  const caja = $('#creacion-cuerpo');
  vaciar(caja);
  const paso = PASOS.find((p) => p.id === pasoCreacion) ?? PASOS[0];
  $('#creacion-titulo').textContent = pasoCreacion === 'revisar' ? (borrador.nombre || 'Tu personaje') : '¿Quién eres?';
  $('#creacion-nota').textContent = paso.nota;
  $('[data-pantalla="creacion"]').dataset.paso = paso.id;
  pintarPasos();

  if (paso.id === 'origen') pasoOrigen(caja);
  else if (paso.id === 'quien') pasoQuien(caja);
  else if (paso.id === 'aspecto') pasoAspecto(caja);
  else pasoRevisar(caja, eco);

  pintarPieCreacion();
  caja.scrollTop = 0;
  if (foco) $(foco)?.focus?.({ preventScroll: true });
}

/** La barra de pasos: dónde estás, qué llevas hecho y cómo volver. */
function pintarPasos() {
  const nav = $('#creacion-pasos');
  if (!nav) return;
  vaciar(nav);
  const actual = PASOS.findIndex((p) => p.id === pasoCreacion);
  nav.append(el('ol', { class: 'pasos' },
    ...PASOS.map((p, i) => el('li', { class: 'pasos__item' },
      el('button', {
        type: 'button',
        class: `paso${i === actual ? ' es-actual' : ''}${i < actual ? ' es-hecho' : ''}`,
        dataset: { paso: p.id },
        'aria-current': i === actual ? 'step' : undefined,
        onClick: protegido('ir a un paso', () => irAPaso(p.id)),
      },
      el('span', { class: 'paso__n', 'aria-hidden': 'true', text: i < actual ? '✓' : String(i + 1) }),
      el('span', { class: 'paso__nombre', text: p.nombre }),
      el('span', { class: 'solo-lector', text: i < actual ? ' (hecho)' : i === actual ? ` (paso ${i + 1} de ${PASOS.length}, en curso)` : '' }))))));
}

/** El pie del paso: atrás y adelante, siempre a la vista. */
function pintarPieCreacion() {
  const pie = $('#creacion-pie');
  vaciar(pie);
  const i = PASOS.findIndex((p) => p.id === pasoCreacion);
  const atras = i === 0
    ? el('button', { class: 'btn btn--fantasma', id: 'creacion-volver', type: 'button', onClick: protegido('volver', () => (listarPersonajes().length ? abrirNuevaPartida() : mostrar('inicio'))) }, 'Atrás')
    : el('button', { class: 'btn btn--fantasma', id: 'creacion-volver', type: 'button', onClick: protegido('volver', () => irAPaso(PASOS[i - 1].id)) }, `Atrás: ${PASOS[i - 1].nombre.toLowerCase()}`);
  if (pasoCreacion === 'revisar') {
    pie.append(
      el('button', { class: 'btn btn--fantasma', id: 'creacion-otro', type: 'button', onClick: protegido('nuevo personaje', () => abrirCreacion()) }, 'Crear otro'),
      atras,
      el('button', { class: 'btn btn--grande', id: 'creacion-empezar', type: 'button', onClick: protegido('comenzar partida', () => comenzarPartida(personajeCreado)) }, 'Comenzar partida'),
    );
    return;
  }
  pie.append(atras, el('button', {
    class: 'btn btn--grande', id: 'creacion-siguiente', type: 'button',
    onClick: protegido('siguiente paso', () => irAPaso(PASOS[i + 1].id)),
  }, `Siguiente: ${PASOS[i + 1].nombre.toLowerCase()}`));
}

/**
 * Cambia de paso. Hacia atrás, siempre (nada se pierde: todo vive en el
 * borrador). Hacia delante, cada paso intermedio tiene que estar completo:
 * si falta algo se queda en ESE paso, con el campo enfocado y dicho por qué.
 */
let cambiandoPaso = false;
async function irAPaso(destino) {
  if (cambiandoPaso) return false;
  const orden = PASOS.map((p) => p.id);
  const j = orden.indexOf(destino);
  let i = orden.indexOf(pasoCreacion);
  if (j < 0) return false;
  cambiandoPaso = true;
  try {
    if (j <= i) { pasoCreacion = destino; pintarCreacion(); return true; }
    while (i < j) {
      // La imagen se elige mirándola: no se salta el paso «Aspecto» sin haberlo abierto.
      if (orden[i] === 'aspecto' && !aspectoCreacion) { pasoCreacion = 'aspecto'; pintarCreacion(); return true; }
      const v = await validarPaso(orden[i]);
      if (!v.ok) {
        if (pasoCreacion !== orden[i]) { pasoCreacion = orden[i]; pintarCreacion({ foco: null }); }
        marcarError(v.campo, v.mensaje);
        return false;
      }
      i += 1;
      pasoCreacion = orden[i];
    }
    pintarCreacion();
    return true;
  } finally { cambiandoPaso = false; }
}

/** El error, junto a su campo, enfocado y anunciado. No borra nada. */
function marcarError(selector, mensaje) {
  const campo = selector ? $(selector) : null;
  for (const viejo of $$('.campo__error')) viejo.remove();
  for (const c of $$('[aria-invalid="true"]')) { c.removeAttribute('aria-invalid'); c.removeAttribute('aria-describedby'); }
  if (!campo) { avisar(mensaje, 'aviso'); return; }
  const id = `${campo.id}-error`;
  campo.setAttribute('aria-invalid', 'true');
  campo.setAttribute('aria-describedby', id);
  campo.after(el('p', { class: 'campo__error', id, role: 'alert', text: mensaje }));
  campo.scrollIntoView({ block: 'center' });
  campo.focus();
}

/**
 * ¿Está completo este paso? Al dar por bueno «Quién eres» el personaje se
 * guarda en el plantel (con su id de siempre si se está corrigiendo: no nace
 * un gemelo), porque la imagen del paso siguiente va atada a ese id.
 * @returns {Promise<{ok: boolean, campo?: string, mensaje?: string}>}
 */
async function validarPaso(id) {
  if (id === 'origen') return { ok: true };
  if (id === 'quien') {
    const nombre = String(borrador.nombre ?? '').trim();
    const lore = String(borrador.lore ?? '').trim();
    if (!nombre) return { ok: false, campo: '#nombre', mensaje: 'Ponle nombre al personaje.' };
    if (lore.length < 8) return { ok: false, campo: '#lore-personaje', mensaje: 'Cuenta un poco de su historia (al menos unas palabras).' };
    personajeCreado = guardarPersonaje({ ...borrador, nombre, lore, retrato: String(borrador.retrato ?? '').trim() });
    Object.assign(borrador, { id: personajeCreado.id, creado: personajeCreado.creado, nombre, lore });
    return { ok: true };
  }
  if (id === 'aspecto') {
    const descripcion = String(borrador.retrato ?? '').trim();
    if (descripcion.length < 8) return { ok: false, campo: '#retrato-descripcion', mensaje: 'Describe su aspecto con unas palabras: el narrador lo tiene en cuenta.' };
    // Si la descripción dice quién es y el jugador no ha elegido el trato a
    // mano, manda la descripción: «enana guerrera» es una mujer aunque el
    // dado saliera en masculino.
    if (!fijado.genero) borrador.genero = sexoDescrito(descripcion) ?? borrador.genero;
    const r = await aspectoCreacion?.aplicar();
    if (r && !r.ok) return { ok: false, campo: '#aspecto-modo-ninguno', mensaje: `${r.motivo} Puedes elegir «Sin imagen» y seguir: se juega igual.` };
    if (aspectoCreacion) borrador.aspecto = aspectoCreacion.aspecto();
    personajeCreado = guardarPersonaje({ ...borrador, retrato: descripcion });
    return { ok: true };
  }
  return { ok: true };
}

/* ── paso 1: origen ───────────────────────────────────────────────────── */

const LUGAR_INICIAL = {
  ferrano: 'forja_alta', brumal: 'pilotes_brumal', sombracorteza: 'arboleda_madre',
  crisol: 'oasis_sal', albar: 'umbral_albar', griscuerno: 'paso_yunque',
  valdes: 'vado_yunque', menudo: 'saucedo',
};

/** Lo que cada elección cambia EN REGLAS, leído de la configuración real. */
function efectoDe(clave, refId) {
  if (clave === 'raza') {
    const mods = Object.entries(atributosDe(refId) ?? {}).filter(([k]) => NOMBRE_ATRIBUTO[k]).map(([k, v]) => `${v > 0 ? '+' : ''}${v} ${NOMBRE_ATRIBUTO[k]}`);
    const inicio = obtenerLugar(LUGAR_INICIAL[refId] ?? 'vado_yunque');
    return [
      mods.length ? `Atributos: ${mods.join(', ')}.` : null,
      (RAZAS[refId]?.habilidadesGratis ?? []).length ? `Se te da bien: ${RAZAS[refId].habilidadesGratis.map(nombreHabilidad).join(', ')}.` : null,
      (rasgosDe(refId) ?? []).length ? `Rasgos: ${rasgosDe(refId).map((r) => r.nombre).join(', ')}.` : null,
      inicio ? `Empiezas en ${inicio.nombre}.` : null,
    ].filter(Boolean);
  }
  if (clave === 'clase') {
    const c = CLASES[refId] ?? {};
    return [
      `Atributos fuertes: ${NOMBRE_ATRIBUTO[c.atributoPrincipal] ?? '—'} y ${NOMBRE_ATRIBUTO[c.atributoSecundario] ?? '—'}.`,
      `Vida: dado d${c.dadoVida ?? 8} por nivel. ${c.manaBase ? `Ánima: base ${c.manaBase} (el total, en tu ficha).` : 'Apenas usa ánima.'}`,
      (c.habilidadesGratis ?? []).length ? `Se te da bien: ${c.habilidadesGratis.map(nombreHabilidad).join(', ')}.` : null,
      (c.rasgos ?? []).filter((r) => (r.nivel ?? 1) === 1).length ? `Rasgos: ${c.rasgos.filter((r) => (r.nivel ?? 1) === 1).map((r) => r.nombre).join(', ')}.` : null,
    ].filter(Boolean);
  }
  const t = TRASFONDOS[refId] ?? {};
  return [
    (t.habilidades ?? []).length ? `Se te da bien: ${t.habilidades.map(nombreHabilidad).join(', ')}.` : null,
    `Oro de partida: ${25 + (t.oroExtra ?? 0)}.`,
    t.rasgo?.nombre ? `Rasgo: ${t.rasgo.nombre}.` : null,
  ].filter(Boolean);
}

/** Un selector de origen con su explicación y su estado (elegido o al azar). */
function campoOrigen(clave, etiqueta, datos) {
  const id = `origen-${clave}`;
  const actual = datos[borrador[clave]] ?? Object.values(datos)[0];
  const select = el('select', {
    id, class: 'campo__entrada campo__select', 'aria-describedby': `${id}-explica`,
    onChange: protegido('elegir origen', (e) => {
      borrador[clave] = e.target.value;
      fijado[clave] = true;
      // Un nombre tirado va con su linaje: si el jugador no ha escrito el
      // suyo, se vuelve a tirar para el linaje nuevo.
      if (clave === 'raza' && !nombreEscrito) borrador.nombre = nombreAleatorio(borrador.raza, borrador.genero);
      pintarCreacion({ foco: `#${id}` });
    }),
  }, ...Object.values(datos).map((o) => el('option', { value: o.refId, text: o.nombre })));
  select.value = actual.refId;

  return el('div', { class: `campo origen origen--${clave}` },
    el('div', { class: 'origen__cab' },
      el('label', { class: 'campo__eti', for: id, text: etiqueta }),
      fijado[clave]
        ? el('button', {
          type: 'button', class: 'origen__fijo', dataset: { soltar: clave }, title: 'Dejar que el dado lo cambie',
          onClick: protegido('soltar elección', () => { fijado[clave] = false; pintarCreacion({ foco: `#${id}` }); }),
        }, 'Elegido por ti · soltar')
        : el('span', { class: 'origen__azar', text: 'Lo tiró el dado' }),
    ),
    select,
    el('div', { class: 'origen__explica', id: `${id}-explica` },
      el('p', { class: 'origen__lema', text: actual.lema ?? '' }),
      el('ul', { class: 'origen__efectos' }, ...efectoDe(clave, actual.refId).map((t) => el('li', { text: t }))),
    ),
  );
}

/** La ficha tal como la calcula el motor para este borrador. */
function fichaReglas(datos, { id = 'ficha-previa', detalle = false } = {}) {
  const f = previsualizar(datos);
  const caja = el('div', { class: 'ficha-previa', id },
    el('p', { class: 'campo__eti', text: 'Tu ficha a nivel 1 (la calcula el juego)' }),
    // Con el nombre entero: un número sin rótulo legible no dice nada a
    // quien juega por primera vez.
    el('dl', { class: 'atributos-claros' },
      ...ATRIBUTOS.orden.map((clave) => {
        const valor = f.atributos?.[clave] ?? 10;
        const mod = Math.floor((valor - 10) / 2);
        return el('div', { class: 'atributo-claro', dataset: { atributo: clave } },
          el('dt', { text: NOMBRE_ATRIBUTO[clave] }),
          el('dd', {}, el('strong', { text: String(valor) }), el('span', { class: 'atributo-claro__mod', text: mod >= 0 ? `+${mod}` : String(mod) })),
        );
      }),
    ),
    el('dl', { class: 'ficha-previa__cifras' },
      el('div', {}, el('dt', { text: 'Vida' }), el('dd', { id: `${id}-vida`, text: String(f.vida) })),
      el('div', {}, el('dt', { text: 'Ánima' }), el('dd', { id: `${id}-anima`, text: String(f.mana) })),
      el('div', {}, el('dt', { text: 'Oro' }), el('dd', { id: `${id}-oro`, text: String(f.oro) })),
    ),
  );
  if (detalle) {
    caja.append(
      el('p', { class: 'ficha-previa__linea', text: `Se te da bien: ${f.competencias.map(nombreHabilidad).join(', ') || '—'}.` }),
      el('p', { class: 'ficha-previa__linea', text: `Rasgos: ${f.rasgos.map((r) => r.nombre).join(', ') || '—'}.` }),
    );
  }
  return caja;
}

function pasoOrigen(caja) {
  const queTira = [
    !fijado.raza ? 'linaje' : null, !fijado.clase ? 'oficio' : null, !fijado.trasfondo ? 'pasado' : null,
    !nombreEscrito ? 'nombre' : null,
  ].filter(Boolean);
  const nadaQueTirar = !queTira.length;

  caja.append(el('div', { class: 'origen-rejilla' },
    el('div', { class: 'origen-rejilla__elegir' },
      campoOrigen('raza', 'Linaje', RAZAS),
      campoOrigen('clase', 'Oficio', CLASES),
      campoOrigen('trasfondo', 'Pasado', TRASFONDOS),
    ),
    el('div', { class: 'origen-rejilla__ficha' },
      fichaReglas(borrador),
      el('div', { class: 'aleatoria', id: 'ficha-aleatoria' },
        el('button', {
          class: 'btn aleatoria__dado', id: 'creacion-aleatorio', type: 'button',
          disabled: nadaQueTirar ? '' : undefined, 'aria-describedby': 'creacion-aleatorio-nota',
          onClick: protegido('aleatorio', () => { tirarFicha(); pintarCreacion({ foco: '#creacion-aleatorio' }); }),
        }, el('span', { class: 'aleatoria__glifo', 'aria-hidden': 'true', text: '⚄' }), ' Tirar al azar'),
        el('p', { class: 'campo__ayuda', id: 'creacion-aleatorio-nota', text: nadaQueTirar
          ? 'Lo has elegido todo tú: no queda nada que tirar. Suelta alguna elección si quieres que el dado la cambie.'
          : `El dado tira: ${queTira.join(', ')}. No toca lo que has elegido tú ni lo que has escrito.` }),
      ),
    ),
  ));
}

/* ── paso 2: quién eres ───────────────────────────────────────────────── */

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

/** Un grupo de opciones excluyentes (radios con aspecto de fichas). */
function grupoRadio({ id, etiqueta, opciones, elegida, alElegir, clase = 'intensidad', dato = 'valor' }) {
  const grupo = el('div', { class: clase, role: 'radiogroup', 'aria-labelledby': `${id}-eti`, id });
  for (const o of opciones) {
    grupo.append(el('button', {
      type: 'button', role: 'radio',
      class: `intensidad__opcion${o.valor === elegida ? ' es-activa' : ''}`,
      'aria-checked': String(o.valor === elegida),
      tabindex: o.valor === elegida ? '0' : '-1',
      [`data-${dato}`]: o.valor,
      onClick: (e) => {
        alElegir(o.valor);
        for (const b of grupo.querySelectorAll('button')) {
          const activa = b === e.currentTarget;
          b.classList.toggle('es-activa', activa);
          b.setAttribute('aria-checked', String(activa));
          b.setAttribute('tabindex', activa ? '0' : '-1');
        }
      },
    },
    el('strong', { class: 'intensidad__nombre', text: o.nombre }),
    o.texto ? el('span', { class: 'intensidad__texto', text: o.texto }) : null));
  }
  // Flechas, como en cualquier grupo de radios.
  grupo.addEventListener('keydown', (e) => {
    const paso = ({ ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 })[e.key];
    if (!paso) return;
    const botones = [...grupo.querySelectorAll('button')];
    const i = botones.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    const destino = botones[(i + paso + botones.length) % botones.length];
    destino.focus();
    destino.click();
  });
  return el('div', { class: 'campo' }, el('p', { class: 'campo__eti', id: `${id}-eti`, text: etiqueta }), grupo);
}

function pasoQuien(caja) {
  caja.append(
    el('div', { class: 'campo' },
      el('label', { class: 'campo__eti', for: 'nombre', text: 'Nombre' }),
      el('div', { class: 'campo__fila' },
        el('input', {
          id: 'nombre', class: 'campo__entrada', type: 'text',
          maxlength: '28', value: borrador.nombre, autocomplete: 'off',
          onInput: (e) => { borrador.nombre = e.target.value; nombreEscrito = Boolean(e.target.value.trim()); },
        }),
        el('button', {
          type: 'button', class: 'btn btn--fantasma btn--pequeno', id: 'nombre-otro', title: 'Otro nombre de tu linaje, al azar',
          onClick: protegido('otro nombre', () => {
            borrador.nombre = nombreAleatorio(borrador.raza, borrador.genero);
            nombreEscrito = false;
            const campo = $('#nombre');
            if (campo) campo.value = borrador.nombre;
          }),
        }, el('span', { 'aria-hidden': 'true', text: '⚄ ' }), 'Otro nombre'),
      ),
    ),
    grupoRadio({
      id: 'trato', etiqueta: 'El narrador habla de ti como', clase: 'intensidad intensidad--corta', dato: 'genero',
      opciones: [{ valor: 'f', nombre: 'Ella' }, { valor: 'm', nombre: 'Él' }],
      elegida: borrador.genero,
      alElegir: (v) => { borrador.genero = v; fijado.genero = true; },
    }),
    el('div', { class: 'campo lore-personaje' },
      el('div', { class: 'origen__cab' },
        el('label', { class: 'campo__eti', for: 'lore-personaje', text: 'Historia' }),
        // Traer una partida que ya existe: rellena el nombre y la historia de aquí.
        el('button', {
          class: 'origen__fijo origen__fijo--enlace', id: 'creacion-importar', type: 'button',
          title: 'Pega una partida de otro sitio y el juego rellena el nombre y la historia con ella',
          onClick: protegido('importar historia', abrirImportar),
        }, 'Ya tengo una historia escrita'),
      ),
      el('textarea', {
        id: 'lore-personaje', class: 'campo__entrada campo__entrada--retrato campo__entrada--lore',
        placeholder: 'Ej.: crecí junto al Umbral, mi hermana desapareció tras cruzarlo y llevo su medallón. Quiero encontrarla, aunque tema lo que haya al otro lado…',
        maxlength: '1200', value: borrador.lore, 'aria-describedby': 'lore-ayuda',
        onInput: (e) => { borrador.lore = e.target.value; },
      }),
      el('p', { class: 'campo__ayuda', id: 'lore-ayuda', text: 'Es el pasado de tu personaje: el mundo lo respeta, pero la partida la haces tú. Nada de esto se convierte en misión si tú no quieres.' }),
    ),
    grupoRadio({
      id: 'intensidad', etiqueta: 'Intensidad', opciones: INTENSIDADES, dato: 'intensidad',
      elegida: borrador.intensidad ?? 'equilibrado',
      alElegir: (v) => { borrador.intensidad = v; },
    }),
  );
}

/* ── paso 3: aspecto ──────────────────────────────────────────────────── */

/**
 * Si la descripción nombra una especie, se dice ANTES de empezar qué pasa
 * con ella. «Elfa» no es ningún linaje de este mundo por decreto, y el
 * linaje cambia reglas: no se cambia solo, ni se cambian las reglas para que
 * una imagen encaje. Se enseña, y decide el jugador.
 */
function avisoEspecie(descripcion, razaId) {
  const especie = especieNombrada(descripcion);
  const linaje = RAZAS[razaId]?.nombre ?? '';
  if (!especie || !linaje) return null;
  return el('div', { class: 'revelacion__aviso', id: 'revelacion-especie' },
    el('p', { text: `Tu descripción dice «${especie}»; tu linaje en la ficha es ${linaje}. Los linajes de este mundo son los de la lista del paso «Origen»: la imagen puede seguir tu descripción, pero las reglas siguen a tu linaje.` }),
    el('button', {
      class: 'btn btn--fantasma btn--pequeno', id: 'revelacion-cambiar-linaje', type: 'button',
      // Se vuelve al origen con todo lo escrito y con el MISMO id: se corrige
      // este personaje, no nace un gemelo.
      onClick: protegido('cambiar linaje', () => irAPaso('origen')),
    }, 'Cambiar linaje'),
  );
}

function pasoAspecto(caja) {
  const p = personajeCreado ?? borrador;
  const huecoEspecie = el('div', { id: 'aspecto-especie' });
  const refrescarEspecie = () => { vaciar(huecoEspecie); const a = avisoEspecie(borrador.retrato, borrador.raza); if (a) huecoEspecie.append(a); };

  caja.append(
    el('div', { class: 'campo retrato-descripcion' },
      el('label', { class: 'campo__eti', for: 'retrato-descripcion', text: 'Descripción' }),
      el('textarea', {
        id: 'retrato-descripcion', class: 'campo__entrada campo__entrada--retrato',
        placeholder: 'Ej.: exploradora de pelo plateado, cicatriz en la ceja, capa violeta y brújula de bronce…',
        maxlength: '360', value: borrador.retrato, 'aria-describedby': 'retrato-ayuda',
        onInput: (e) => { borrador.retrato = e.target.value; refrescarEspecie(); aspectoCreacion?.descripcion(e.target.value); },
      }),
      el('p', { class: 'campo__ayuda', id: 'retrato-ayuda', text: 'Tu aspecto, con tus palabras: ropa, rasgos, gesto. El narrador lo tiene en cuenta. La imagen se elige justo debajo.' }),
    ),
    huecoEspecie,
  );
  refrescarEspecie();

  const hueco = el('div', { class: 'campo aspecto-hueco' }, el('p', { class: 'campo__eti', id: 'aspecto-eti', text: 'Tu imagen' }));
  caja.append(hueco);
  aspectoCreacion = montarAspecto(hueco, {
    personaje: { id: p.id, nombre: borrador.nombre, raza: borrador.raza, genero: borrador.genero },
    descripcion: borrador.retrato,
    aspecto: borrador.aspecto,
    idVista: 'creacion-cara',
  });
}

/* ── paso 4: revisar ──────────────────────────────────────────────────── */

function pasoRevisar(caja, eco = null) {
  const p = personajeCreado;
  const cara = el('div', { class: 'eleccion__cara revelacion__cara', id: 'creacion-cara' });
  const estado = el('p', { class: 'revelacion__estado', id: 'retrato-estado', text: '' });
  const inicio = obtenerLugar(LUGAR_INICIAL[p.raza] ?? 'vado_yunque');

  caja.append(el('div', { class: 'revelacion' },
    el('div', { class: 'revelacion__marco' }, cara, estado,
      el('button', { class: 'btn btn--pequeno btn--fantasma', id: 'retrato-pintar', type: 'button', onClick: protegido('cambiar imagen', () => irAPaso('aspecto')) }, 'Cambiar imagen'),
    ),
    el('div', { class: 'revelacion__texto' },
      el('p', { class: 'revelacion__ficha', id: 'revision-origen', text: `${RAZAS[p.raza]?.nombre ?? ''} · ${CLASES[p.clase]?.nombre ?? ''} · ${TRASFONDOS[p.trasfondo]?.nombre ?? ''} · nivel 1` }),
      el('p', { class: 'revelacion__ficha revelacion__ficha--tenue', id: 'revision-partida', text: `Intensidad ${nombreIntensidad(p.intensidad)} · el narrador habla de ti como ${p.genero === 'f' ? 'ella' : 'él'}${inicio ? ` · empiezas en ${inicio.nombre}` : ''}` }),
      fichaReglas(p, { id: 'ficha-revision', detalle: true }),
      el('p', { class: 'revelacion__eti', text: 'Descripción' }),
      el('p', { class: 'revelacion__cita', id: 'revision-descripcion', text: p.retrato }),
      avisoEspecie(p.retrato, p.raza),
      el('p', { class: 'revelacion__eti', text: 'Historia' }),
      el('p', { class: 'revelacion__cita', id: 'revision-historia', text: p.lore }),
    ),
  ));

  // El narrador lo resume y pregunta, y el jugador contesta con sus palabras.
  //
  // Para cambiar una sola cosa no hace falta volver atrás: se escribe «mejor
  // que sea hombre» o «ponle una cicatriz en el ojo» y se corrige esto y
  // nada más. «Vale, empezamos» arranca la partida.
  const entrada = el('input', {
    id: 'revelacion-cambio', class: 'campo__entrada', type: 'text',
    maxlength: '160', autocomplete: 'off',
    'aria-label': 'Cambiar algo del personaje con tus palabras, o confirmar para empezar',
    placeholder: 'Un cambio con tus palabras, o «vale» para empezar',
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

  // Qué imagen lleva, dicho como es.
  const clave = claveRetrato(fichaRetrato(p));
  const estilo = estiloAprobada(clave);
  pintarRetrato(cara, fichaRetrato(p));
  estado.textContent = !urlAprobada(clave)
    ? 'Sin imagen: se verá tu inicial. Puedes ponerle una cuando quieras, también en mitad de la partida.'
    : estilo === ESTILO_DIBUJO
      ? `Dibujo del juego (${describirDibujo(p.aspecto)}). No es IA: no sigue toda tu descripción.`
      : 'El retrato pintado que elegiste.';
  estado.dataset.estado = !urlAprobada(clave) ? 'sin' : estilo === ESTILO_DIBUJO ? 'dibujo' : 'listo';
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
    pintarCreacion({ foco: '#revelacion-cambio', eco: 'No te he entendido del todo. Prueba con «que sea hombre», «que sea elfa», «ponle una cicatriz en el ojo», «que se llame Brun» o «más joven».' });
    return;
  }

  // Mismo id: se corrige este personaje, no nace otro. La imagen elegida se
  // queda con él; si ya no se parece, el jugador la cambia. El borrador se
  // pone al día para que volver atrás enseñe lo corregido.
  personajeCreado = guardarPersonaje({ ...r.personaje, aspecto: p.aspecto });
  Object.assign(borrador, personajeCreado);
  if (personajeCreado.nombre !== p.nombre) nombreEscrito = true;
  if (personajeCreado.genero !== p.genero) fijado.genero = true;
  if (personajeCreado.raza !== p.raza) fijado.raza = true;
  pintarCreacion({ foco: '#revelacion-cambio', eco: r.cambios.join(' ') });
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
          // El resultado dice lo que de verdad pasó; el aviso, uno solo, lo
          // compone esta pantalla con él. Si el estado del juego no se pudo
          // borrar, no se sigue con nada más: no se ha borrado nada y se
          // puede reintentar.
          const r = await sistema('saves')?.borrarTodo?.({ silencioso: true });
          if (!r || (!r.ok && !r.autoridad && !r.sinCoordinacion)) {
            $('#ajustes-modal').hidden = true;
            pintarInicio();
            avisar(r?.aviso?.mensaje ?? 'No se ha podido borrar nada. Vuelve a intentarlo.', 'error');
            return;
          }
          const parcial = !r.ok;
          const cuantas = `partidas (${r.partidas})`;
          // Los retratos elegidos viven en IndexedDB: se esperan, y si el
          // navegador no deja, se dice. Antes se quedaban y volvían al recargar.
          const galeria = await borrarGaleria();
          // Las candidatas del generador están en otro programa de este PC: se
          // piden borrar; si no está en marcha, se dice cómo.
          const puente = await olvidarCandidatas({ todas: true });
          $('#ajustes-modal').hidden = true;
          pintarInicio();
          if (parcial) {
            avisar(`${r.aviso.mensaje} ${galeria.ok ? 'Los retratos elegidos sí se han borrado.' : `Tampoco los retratos elegidos: ${galeria.motivo}.`}`, 'aviso');
            return;
          }
          if (!galeria.ok) {
            avisar(`Borrados ${cuantas} y personajes, pero no los retratos elegidos: ${galeria.motivo}. Prueba otra vez.${r.limite}`, 'aviso');
            return;
          }
          avisar(`${puente.ok
            ? `Borrados ${cuantas}, personajes, retratos elegidos y las candidatas del generador.`
            : `Borrados ${cuantas}, personajes y retratos elegidos. Si usaste el generador de imágenes, sus candidatas (en este PC) caducan en 24 h o se borran con: node tools/imagen-local-proxy.mjs --limpiar`}${r.limite}`, r.limite ? 'aviso' : puente.ok ? 'exito' : 'info');
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

/* ── tu imagen: dibujo del juego, retrato pintado o nada ──────────────── */

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
    raza: f.linaje ?? null,
    descripcion: sujetoRetrato({ raza: f.linaje, descripcion: f.descripcion ?? `${f.rol ?? ''} ${f.nombre ?? ''}`, genero: f.genero }) ?? '',
    descripcionOriginal: f.descripcion ?? '',
  };
}

/** Texto de cada estado del generador, para el jugador. Nada que no se sepa. */
function fraseGenerador(g) {
  switch (g?.estado) {
    case 'buscando': return 'Comprobando si este equipo tiene un generador de imágenes…';
    case 'disponible-local': return 'Hay un generador de imágenes en este equipo. Lo que se pinta no sale de tu PC.';
    case 'disponible-nube': return `El puente de este equipo pinta con un servicio en la nube (${g.proveedor ?? 'sin nombre'}). Antes de enviar nada se te enseña qué sale y se te pide permiso.`;
    case 'cancelada': return 'Comprobación cancelada.';
    case 'desconocido': case undefined: case null: return 'Necesita un generador de imágenes instalado en este equipo; lo normal es no tenerlo. Sin comprobar todavía.';
    default: return g.motivo ?? 'No se puede pintar con IA ahora.';
  }
}
const generadorDisponible = (g) => g?.estado === 'disponible-local' || g?.estado === 'disponible-nube';

/**
 * El control «Tu imagen». Tres opciones de verdad, con vista previa real:
 *
 *   · Dibujo del juego: lo dibuja el navegador, sin IA y sin instalar nada.
 *     Cambia SOLO lo de sus controles, y se dice.
 *   · Retrato pintado con IA: solo si este equipo tiene generador (se
 *     comprueba, con plazo, antes de ofrecerlo) o si ya hay uno elegido.
 *   · Sin imagen: la inicial y el nombre.
 *
 * Nada se guarda hasta `aplicar()` (en la creación, al seguir; en partida,
 * con «Usar esta imagen»). El generador NO se sondea solo: llegar a esta
 * pantalla no pide nada a ningún puerto del equipo. Se mira cuando el
 * jugador pulsa «Comprobar si lo hay» (con plazo); el sondeo se cancela al
 * cerrar, y la respuesta de uno viejo no pinta nada.
 *
 * @returns {{aplicar: () => Promise<{ok: boolean, motivo?: string}>, aspecto: () => Object|null, modo: () => string, descripcion: (t: string) => void, cerrar: () => void}}
 */
function montarAspecto(caja, { personaje, descripcion = '', aspecto = null, idVista = 'aspecto-vista' }) {
  const clave = claveRetrato({ id: personaje.id });
  const linaje = RAZAS[personaje.raza]?.nombre ?? 'tu linaje';
  let cerrado = false;
  let sondeo = 0;
  let control = null;
  let generador = { estado: 'desconocido' };
  let texto = String(descripcion ?? '');
  let reloj = 0;

  const hayImagen = () => Boolean(urlAprobada(clave));
  const hayPintado = () => hayImagen() && estiloAprobada(clave) !== ESTILO_DIBUJO;
  const hayDibujo = () => hayImagen() && estiloAprobada(clave) === ESTILO_DIBUJO;

  let propuesta = aspectoDesdeDescripcion(texto);
  let actual = normalizarAspecto(aspecto ?? propuesta.aspecto);
  /** El jugador ya ha tocado los controles: la descripción deja de proponer. */
  let tocado = Boolean(aspecto);
  let modo = hayPintado() ? 'pintado' : 'dibujo';
  /** El dibujo que ya está guardado tal cual (no se vuelve a guardar igual). */
  let aplicado = hayDibujo() && aspecto ? JSON.stringify([personaje.raza, normalizarAspecto(aspecto)]) : null;

  const vista = el('div', { class: 'eleccion__cara aspecto__vista', id: idVista });
  const pie = el('p', { class: 'aspecto__pie', id: 'aspecto-pie', 'aria-live': 'polite' });
  const radios = el('div', { class: 'aspecto__modos', role: 'radiogroup', 'aria-labelledby': 'aspecto-eti', id: 'aspecto-modos' });
  const panel = el('div', { class: 'aspecto__panel', id: 'aspecto-panel' });
  const cajaGenerador = el('div', { class: 'aspecto__generador', id: 'aspecto-generador' });
  const raiz = el('div', { class: 'aspecto', id: 'aspecto', dataset: { modo } },
    el('div', { class: 'aspecto__marco' }, vista, pie),
    el('div', { class: 'aspecto__lado' }, radios, panel, cajaGenerador),
  );
  caja.append(raiz);

  const elegirModo = (m) => {
    if (m === 'pintado' && !hayPintado() && !generadorDisponible(generador)) return;
    modo = m;
    pintarTodo();
    $(`#aspecto-modo-${m}`)?.focus();
  };

  function pintarVista() {
    vista.dataset.firmaArte = '';
    if (modo === 'dibujo') {
      // Por la vía de siempre (`pintarArte`): el generador vectorial del
      // juego, sin buscar ilustración de archivo.
      pintarArte(vista, { familia: 'retratos', clave: 'dibujo', opciones: { ...opcionesDibujo(personaje, actual), sinRaster: true } });
      vista.dataset.claveImagen = '';
      pie.textContent = `Dibujo del juego: ${describirDibujo(actual)}.`;
    } else if (modo === 'pintado' && hayPintado()) {
      pintarRetrato(vista, { claveImagen: clave, nombre: personaje.nombre });
      pie.textContent = 'El retrato pintado que elegiste.';
    } else {
      pintarMarcador(vista, { nombre: personaje.nombre, familia: 'retratos' });
      pie.textContent = modo === 'pintado' ? 'Todavía no has pintado ninguno.' : 'Sin imagen: tu inicial y tu nombre.';
    }
  }

  function pintarModos() {
    vaciar(radios);
    const puedePintado = hayPintado() || generadorDisponible(generador);
    const opciones = [
      { id: 'dibujo', nombre: 'Dibujo del juego', texto: 'Sin IA y sin instalar nada: lo dibuja el propio juego.' },
      { id: 'pintado', nombre: 'Retrato pintado con IA', texto: hayPintado() && !generadorDisponible(generador) ? 'Conservar el que ya elegiste.' : fraseGenerador(generador), apagada: !puedePintado },
      { id: 'ninguno', nombre: 'Sin imagen', texto: 'Tu inicial y tu nombre.' },
    ];
    for (const o of opciones) {
      radios.append(el('button', {
        type: 'button', role: 'radio', id: `aspecto-modo-${o.id}`,
        class: `aspecto__modo${modo === o.id ? ' es-activa' : ''}${o.apagada ? ' es-apagada' : ''}`,
        'aria-checked': String(modo === o.id),
        'aria-disabled': o.apagada ? 'true' : undefined,
        tabindex: modo === o.id ? '0' : '-1',
        dataset: { modo: o.id },
        onClick: protegido('elegir imagen', () => elegirModo(o.id)),
      },
      el('strong', { class: 'aspecto__modo-nombre', text: o.nombre }),
      el('span', { class: 'aspecto__modo-texto', text: o.texto })));
    }
  }
  radios.addEventListener('keydown', (e) => {
    const paso = ({ ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 })[e.key];
    if (!paso) return;
    const orden = ['dibujo', 'pintado', 'ninguno'].filter((m) => m !== 'pintado' || hayPintado() || generadorDisponible(generador));
    e.preventDefault();
    elegirModo(orden[(orden.indexOf(modo) + paso + orden.length) % orden.length]);
  });

  function pintarPanel() {
    vaciar(panel);
    if (modo === 'dibujo') {
      const cambiar = (cambio) => { tocado = true; actual = normalizarAspecto({ ...actual, ...cambio }); pintarVista(); };
      const lista = (id, etiqueta, opciones, valor, campo) => {
        const s = el('select', { id, class: 'campo__entrada campo__select', onChange: (e) => cambiar({ [campo]: e.target.value }) },
          ...opciones.map((o) => el('option', { value: o.id, text: o.nombre })));
        s.value = valor;
        return el('div', { class: 'aspecto__control' }, el('label', { class: 'campo__eti', for: id, text: etiqueta }), s);
      };
      poner(panel,
        el('div', { class: 'aspecto__controles' },
          lista('aspecto-pelo', 'Pelo', PELOS, actual.pelo, 'pelo'),
          lista('aspecto-ojos', 'Ojos', OJOS, actual.ojos, 'ojos'),
          el('button', {
            type: 'button', class: 'btn btn--pequeno btn--fantasma', id: 'aspecto-otra-cara',
            onClick: protegido('otra cara', () => cambiar({ cara: actual.cara + 1 })),
          }, 'Otra cara'),
        ),
        el('fieldset', { class: 'aspecto__rasgos' },
          el('legend', { class: 'campo__eti', text: 'Rasgos' }),
          ...RASGOS.map((r) => {
            const marca = el('input', {
              type: 'checkbox', id: `aspecto-rasgo-${r.id}`, dataset: { rasgo: r.id },
              onChange: (e) => cambiar({ rasgos: e.target.checked ? [...actual.rasgos, r.id] : actual.rasgos.filter((x) => x !== r.id) }),
            });
            marca.checked = actual.rasgos.includes(r.id);
            return el('label', { class: 'aspecto__rasgo', for: `aspecto-rasgo-${r.id}` }, marca, el('span', { text: r.nombre }));
          }),
        ),
        el('p', { class: 'aspecto__nota', id: 'aspecto-dibujo-nota', text: `No es una IA: dibuja una cara de ${linaje} y solo cambia lo que elijas aquí. No sabe dibujar el resto de tu descripción.` }),
        !tocado && propuesta.reconocido.length
          ? el('p', { class: 'aspecto__nota aspecto__nota--entendido', id: 'aspecto-entendido', text: `De tu descripción ha entendido: ${propuesta.reconocido.join(', ')}.` })
          : null,
        hayPintado() ? el('p', { class: 'aspecto__nota aspecto__nota--aviso', text: 'Si sigues con el dibujo, sustituirá al retrato pintado que elegiste.' }) : null,
      );
      return;
    }
    if (modo === 'pintado') {
      const puede = generadorDisponible(generador);
      poner(panel,
        el('p', { class: 'aspecto__nota', text: hayPintado() ? 'Este es el retrato que elegiste. Se conserva.' : 'Pinta una versión, mírala en privado y quédate con la que quieras. Hasta entonces no hay imagen.' }),
        puede ? el('button', {
          type: 'button', class: 'btn btn--pequeno', id: 'aspecto-pintar',
          onClick: protegido('pintar retrato', () => {
            if (String(texto).trim().length < 8) { avisar('Escribe antes una descripción de su aspecto: es lo que se pinta.', 'aviso'); $('#retrato-descripcion')?.focus(); return; }
            abrirEstudio(encargoDePersonaje({ ...personaje, retrato: texto }, personaje.id), { alTerminar: () => { if (!cerrado) pintarTodo(); } });
          }),
        }, hayPintado() ? 'Pintar otro' : 'Pintar con el generador') : null,
      );
      return;
    }
    panel.append(el('p', { class: 'aspecto__nota', text: `Se verá tu inicial y tu nombre. Puedes ponerle imagen cuando quieras, también en mitad de la partida.${hayImagen() ? ' Si sigues así, se quitará la imagen que tiene ahora.' : ''}` }));
  }

  /** El estado del generador, siempre a la vista y siempre el de verdad. */
  function pintarGenerador() {
    vaciar(cajaGenerador);
    cajaGenerador.dataset.estado = generador.estado ?? 'desconocido';
    if (generadorDisponible(generador)) return;      // ya lo dice la opción
    // La frase del estado ya está en la opción «Retrato pintado con IA»
    // (y aquí, para quien no ve la pantalla). Debajo, solo qué se puede hacer.
    const buscando = generador.estado === 'buscando';
    const sinMirar = (generador.estado ?? 'desconocido') === 'desconocido';
    poner(cajaGenerador,
      el('p', { class: 'solo-lector', id: 'aspecto-generador-texto', role: 'status', text: buscando || sinMirar
        ? fraseGenerador(generador)
        : `${fraseGenerador(generador)} No hace falta para jugar: tienes el dibujo del juego.` }),
      buscando ? null : el('div', { class: 'aspecto__generador-fila' },
        el('span', { class: 'aspecto__nota', text: 'Pintar con IA no hace falta para jugar.' }),
        el('button', {
          type: 'button', class: 'origen__fijo origen__fijo--enlace', id: 'aspecto-comprobar',
          onClick: protegido('comprobar generador', () => comprobar()),
        }, sinMirar ? 'Comprobar si hay generador' : 'Volver a comprobar'),
        generador.ayuda ? el('details', { class: 'aspecto__ayuda' },
          el('summary', { text: '¿Qué haría falta? (avanzado)' }),
          el('p', { text: generador.ayuda }),
        ) : null,
      ),
    );
  }

  function pintarTodo() {
    if (cerrado) return;
    if (modo === 'pintado' && !hayPintado() && !generadorDisponible(generador)) modo = 'dibujo';
    raiz.dataset.modo = modo;
    pintarModos(); pintarVista(); pintarPanel(); pintarGenerador();
  }

  /** Mira si hay generador: SOLO cuando el jugador lo pide; con plazo y cancelable. */
  function comprobar() {
    control?.abort();
    control = new AbortController();
    const este = ++sondeo;
    generador = { estado: 'buscando' };
    const conFoco = document.activeElement?.id === 'aspecto-comprobar';
    pintarModos(); pintarGenerador();
    estadoGenerador({ signal: control.signal }).then((g) => {
      // Un sondeo viejo (se cerró, o se pidió otro) no pinta nada.
      if (cerrado || este !== sondeo) return;
      generador = g;
      pintarModos(); pintarGenerador();
      if (conFoco) ($('#aspecto-comprobar') ?? $(`#aspecto-modo-${modo}`))?.focus();
    });
  }

  pintarTodo();

  return {
    modo: () => modo,
    aspecto: () => (modo === 'dibujo' ? { ...actual } : null),
    estadoGenerador: () => generador.estado,
    /** La descripción cambió: propone controles de nuevo si el jugador no los ha tocado. */
    descripcion(t) {
      texto = String(t ?? '');
      clearTimeout(reloj);
      reloj = setTimeout(() => {
        if (cerrado || tocado) return;
        propuesta = aspectoDesdeDescripcion(texto);
        actual = normalizarAspecto({ ...propuesta.aspecto, cara: actual.cara });
        if (modo === 'dibujo') { pintarVista(); pintarPanel(); }
      }, 300);
    },
    /** Guarda lo elegido. Nunca inventa éxito: si no se pudo, lo dice y no cambia nada. */
    async aplicar() {
      if (modo === 'dibujo') {
        const firma = JSON.stringify([personaje.raza, actual]);
        if (hayDibujo() && aplicado === firma) return { ok: true };
        let blob;
        try { blob = await rasterizar(svgDibujo(personaje, actual)); } catch (e) {
          return { ok: false, motivo: `No se ha podido guardar el dibujo en este navegador (${e?.message ?? 'error'}).` };
        }
        const r = await aprobar(clave, blob, { estilo: ESTILO_DIBUJO, tipo: 'personaje', nombre: personaje.nombre });
        if (!r.ok) return { ok: false, motivo: `No se ha podido guardar el dibujo (${r.motivo}).` };
        aplicado = firma;
        return { ok: true, persistente: r.persistente };
      }
      if (modo === 'ninguno') { if (hayImagen()) await olvidarRetrato(clave); return { ok: true }; }
      return { ok: true };
    },
    cerrar() { cerrado = true; clearTimeout(reloj); control?.abort(); },
  };
}

/**
 * «Tu imagen» en mitad de la partida: el mismo control que en la creación.
 * Cerrar no cambia nada; «Usar esta imagen» guarda lo elegido.
 */
function abrirImagenJugador() {
  if (ver('combat.activo', false)) { avisar('En combate no se cambia la imagen: termina la pelea primero.', 'aviso'); return; }
  const j = ver('player', {}) ?? {};
  const id = ver('meta.personajeId') ?? null;
  if (!id) { avisar('Este personaje no tiene identidad guardada: no se le puede asignar una imagen.', 'aviso'); return; }
  document.getElementById('imagen-dialogo')?.remove();
  const guardado = obtenerPersonaje(id);
  const abridor = document.activeElement;

  const cuerpo = el('div', {}, el('p', { class: 'campo__eti', id: 'aspecto-eti', text: 'Qué imagen quieres' }));
  const usar = el('button', { class: 'btn', id: 'imagen-usar', type: 'button' }, 'Usar esta imagen');
  const cerrar = el('button', { class: 'btn btn--fantasma', id: 'imagen-cerrar', type: 'button' }, 'Cerrar sin cambiar');
  const estado = el('p', { class: 'aspecto__nota aspecto__nota--aviso', id: 'imagen-estado', role: 'status' });
  const dialogo = el('dialog', { class: 'estudio estudio--ancho', id: 'imagen-dialogo', 'aria-labelledby': 'imagen-titulo' },
    el('h2', { class: 'estudio__titulo', id: 'imagen-titulo', text: `Imagen de ${j.nombre ?? 'tu personaje'}` }),
    cuerpo, estado,
    el('div', { class: 'estudio__acciones' }, usar, cerrar),
  );
  document.body.append(dialogo);
  const control = montarAspecto(cuerpo, {
    personaje: { id, nombre: j.nombre, raza: j.raza, genero: j.genero },
    descripcion: j.retrato ?? '', aspecto: guardado?.aspecto ?? null, idVista: 'imagen-vista',
  });

  usar.addEventListener('click', protegido('usar imagen', async () => {
    usar.disabled = true;
    const r = await control.aplicar();
    usar.disabled = false;
    if (!r.ok) { estado.textContent = `${r.motivo} No se ha cambiado nada.`; return; }
    if (guardado) guardarPersonaje({ ...guardado, aspecto: control.aspecto() });
    if (r.persistente === false) avisar('Imagen elegida, pero este navegador no deja guardarla: se perderá al cerrar.', 'aviso');
    dialogo.close();
    refrescarTodo();
  }));
  cerrar.addEventListener('click', () => dialogo.close());
  dialogo.addEventListener('close', () => { control.cerrar(); dialogo.remove(); abridor?.focus?.(); });
  dialogo.showModal();
}

/* ── estudio de retratos (pintar con el generador) ────────────────────── */

/** Por dónde va cada clave: «Otra versión» sigue contando al volver a abrir. */
const variantes = new Map();

/**
 * El estudio: pintar, ver la candidata en privado, pedir otra versión y,
 * solo si el jugador quiere, quedársela.
 *
 * Nada se pinta sin que el jugador lo pida. Lo que se dice sale SIEMPRE del
 * estado comprobado del generador (`estadoGenerador`, con plazo): mientras
 * no se sabe, no se habla de nube, de envíos ni de cachés. Con ComfyUI el
 * encargo no sale del PC; con un proveedor en la nube se enseña el proveedor
 * REAL y lo que viaja, y hay que permitirlo. Sin generador se dice, se
 * ofrece volver a comprobar y, para un compañero, el dibujo del juego. Las
 * candidatas quedan en la caché temporal del puente mientras el estudio
 * está abierto y se olvidan al cerrarlo; solo «Usar esta versión» guarda
 * una en la galería del navegador (`src/art/galeria.js`). Cerrar no aprueba
 * nada. Nunca en combate.
 *
 * @param {{tipo: string, clave: string, nombre: string, descripcion: string, rol?: string, raza?: string}} encargo
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
  const abridor = document.activeElement;
  let peticion = 0;
  let sondeo = 0;
  let candidata = null;          // { blob, url, variante }
  let generador = { estado: 'buscando' };
  let necesitaPermiso = false;

  const lienzo = el('div', { class: 'estudio__lienzo eleccion__cara', 'aria-live': 'polite' });
  const estado = el('p', { class: 'estudio__estado', id: 'estudio-estado', role: 'status' });
  const pintar = el('button', { class: 'btn', id: 'estudio-pintar', type: 'button', hidden: true }, 'Pintar');
  const otra = el('button', { class: 'btn btn--fantasma', id: 'estudio-otra', type: 'button', hidden: true }, 'Otra versión');
  const usar = el('button', { class: 'btn', id: 'estudio-usar', type: 'button', hidden: true }, 'Usar esta versión');
  const reintentar = el('button', { class: 'btn btn--fantasma', id: 'estudio-comprobar', type: 'button', hidden: true }, 'Volver a comprobar');
  const dibujo = el('button', { class: 'btn', id: 'estudio-dibujo', type: 'button', hidden: true }, 'Usar el dibujo del juego');
  const cerrar = el('button', { class: 'btn btn--fantasma', id: 'estudio-cerrar', type: 'button' }, 'Cerrar');
  const nota = el('p', { class: 'estudio__nota', id: 'estudio-nota' });
  const ayuda = el('details', { class: 'aspecto__ayuda', id: 'estudio-ayuda', hidden: true }, el('summary', { text: '¿Qué hace falta para pintar con IA? (avanzado)' }), el('p', { id: 'estudio-ayuda-texto' }));
  // Solo con un proveedor en la nube: permiso expreso antes de enviar nada.
  const permiso = el('input', { type: 'checkbox', id: 'estudio-permiso' });
  const cajaPermiso = el('label', { class: 'estudio__permiso', for: 'estudio-permiso', hidden: true }, permiso, el('span', { id: 'estudio-permiso-texto' }));

  const dialogo = el('dialog', { class: 'estudio', id: 'estudio', 'aria-labelledby': 'estudio-titulo', 'aria-describedby': 'estudio-nota', dataset: { estado: 'buscando' } },
    el('h2', { class: 'estudio__titulo', id: 'estudio-titulo', text: `Retrato de ${encargo.nombre || 'tu personaje'}` }),
    nota, cajaPermiso,
    lienzo, estado, ayuda,
    el('div', { class: 'estudio__acciones' }, pintar, otra, usar, dibujo, reintentar, cerrar),
  );

  const soltar = () => { if (candidata?.url) URL.revokeObjectURL(candidata.url); candidata = null; };
  const ocupado = (si) => {
    for (const b of [pintar, otra, usar]) b.disabled = si;
    if (!si && necesitaPermiso && !permiso.checked) { pintar.disabled = true; otra.disabled = true; }
  };
  const actual = () => {
    // Lo que hay ahora: su imagen elegida, o el marcador.
    pintarRetrato(lienzo, { claveImagen: encargo.clave, nombre: encargo.nombre });
  };
  const fase = (nombre) => { dialogo.dataset.estado = nombre; };

  /** Todo lo que se ve depende del estado comprobado; nada se dice antes. */
  function pintarEstado() {
    const g = generador;
    const puede = generadorDisponible(g);
    cajaPermiso.hidden = true; necesitaPermiso = false;
    ayuda.hidden = true; reintentar.hidden = true; dibujo.hidden = true;
    if (g.estado === 'buscando') {
      fase('buscando');
      nota.textContent = '';
      estado.textContent = fraseGenerador(g);
      pintar.hidden = true; otra.hidden = true; usar.hidden = true;
      return;
    }
    if (!puede) {
      // Sin generador: ni nube, ni envíos, ni cachés. Solo lo que se sabe.
      fase(g.estado ?? 'no-disponible');
      nota.textContent = '';
      estado.textContent = `${fraseGenerador(g)} No hace falta para jugar.`;
      pintar.hidden = true; otra.hidden = true; usar.hidden = true;
      reintentar.hidden = false;
      dibujo.hidden = !(encargo.tipo === 'pnj');
      if (g.ayuda) { $('#estudio-ayuda-texto').textContent = g.ayuda; ayuda.hidden = false; }
      return;
    }
    const horas = g.cache?.horas ?? 24;
    nota.textContent = g.estado === 'disponible-local'
      ? `Se pinta en este PC${g.proveedor === 'comfyui' ? ' con ComfyUI' : ''}: la descripción no sale del equipo. Mientras eliges, las versiones quedan en una caché temporal del puente, en este PC; se borran al cerrar esta ventana (y como tarde a las ${horas} h). Solo la versión que elijas se guarda en el juego.`
      : `El puente de este equipo pinta con un servicio en la nube (${g.proveedor ?? 'sin nombre'}): la descripción en inglés sale de tu equipo hacia ese servicio. Las versiones quedan en una caché temporal del puente, en este PC, hasta que cierres esta ventana; solo la que elijas se guarda en el juego.`;
    if (!candidata) { pintar.hidden = false; otra.hidden = true; usar.hidden = true; }
    if ((encargo.descripcion ?? '').length < 8) {
      fase('sin-descripcion');
      estado.textContent = 'Hace falta una descripción de su aspecto para pintarlo.';
      pintar.disabled = true;
      return;
    }
    if (g.estado === 'disponible-nube') {
      // Qué viaja, tal cual, y pintar solo con permiso.
      $('#estudio-permiso-texto').textContent = ` Permito enviar a ${g.proveedor ?? 'ese servicio'}: «${encargo.descripcion}».`;
      cajaPermiso.hidden = false;
      necesitaPermiso = true;
    }
    if (!candidata) {
      fase(g.estado);
      estado.textContent = urlAprobada(encargo.clave) ? 'Esta es la imagen que tiene ahora. Pinta otra si quieres cambiarla.' : 'Listo para pintar.';
    }
    ocupado(false);
  }

  /** Mira si hay generador (con plazo). La respuesta de un sondeo viejo se ignora. */
  function sondear() {
    const este = ++sondeo;
    generador = { estado: 'buscando' };
    pintarEstado();
    estadoGenerador({ signal: control.signal }).then((g) => {
      if (!dialogo.isConnected || este !== sondeo) return;
      generador = g;
      pintarEstado();
    });
  }

  async function pedir(variante) {
    const esta = ++peticion;
    ocupado(true);
    fase('generando');
    estado.textContent = generador.estado === 'disponible-local' ? 'Pintando en tu equipo… puede tardar un minuto.' : 'Pintando… puede tardar un minuto.';
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
      fase('candidata');
      estado.textContent = `Versión ${variante + 1}. Todavía no está guardada: ¿te la quedas o pides otra?`;
      pintar.hidden = true; otra.hidden = false; usar.hidden = false;
    } catch (e) {
      if (esta !== peticion || !dialogo.isConnected) return;
      fase(e?.causa === 'cancelada' ? 'cancelada' : 'proveedor-fallo');
      // La imagen que ya tenía sigue siendo la suya: no se inventa otra.
      estado.textContent = `${e.message}${urlAprobada(encargo.clave) ? ' La imagen que ya tenía sigue igual.' : ''}`;
    } finally {
      if (esta === peticion) { ocupado(false); delete lienzo.dataset.estado; }
    }
  }

  pintar.addEventListener('click', protegido('pintar candidata', () => pedir((variantes.get(encargo.clave) ?? -1) + 1)));
  otra.addEventListener('click', protegido('otra versión', () => pedir((candidata?.variante ?? variantes.get(encargo.clave) ?? 0) + 1)));
  usar.addEventListener('click', protegido('usar versión', async () => {
    if (!candidata) return;
    ocupado(true);
    const r = await aprobar(encargo.clave, candidata.blob, { estilo: generador.estilo ?? 'desconocido', tipo: encargo.tipo, nombre: encargo.nombre });
    if (!r.ok) { estado.textContent = `${r.motivo} No se ha guardado; la imagen anterior sigue igual.`; ocupado(false); return; }
    if (!r.persistente) avisar('Retrato elegido, pero este navegador no deja guardarlo: se perderá al cerrar.', 'aviso');
    fase('elegida');
    dialogo.close();
    alTerminar?.();
    refrescarTodo();
  }));
  reintentar.addEventListener('click', protegido('comprobar generador', () => sondear()));
  dibujo.addEventListener('click', protegido('usar dibujo', async () => {
    // Para un compañero: una cara de su linaje, con lo que se entienda de su descripción.
    dibujo.disabled = true;
    const aspecto = aspectoDesdeDescripcion(encargo.descripcionOriginal ?? '').aspecto;
    try {
      const blob = await rasterizar(svgDibujo({ raza: encargo.raza, nombre: encargo.nombre }, aspecto));
      const r = await aprobar(encargo.clave, blob, { estilo: ESTILO_DIBUJO, tipo: encargo.tipo, nombre: encargo.nombre });
      if (!r.ok) throw new Error(r.motivo);
      dialogo.close();
      alTerminar?.();
      refrescarTodo();
    } catch (e) {
      estado.textContent = `No se ha podido guardar el dibujo (${e?.message ?? 'error'}). No se ha cambiado nada.`;
      dibujo.disabled = false;
    }
  }));
  permiso.addEventListener('change', () => ocupado(false));
  cerrar.addEventListener('click', () => dialogo.close());
  dialogo.addEventListener('close', () => {
    control.abort(); soltar(); dialogo.remove();
    // Terminado de valorar: las candidatas de este personaje se borran del
    // puente (si lo hay: sin generador no se llama a nadie). La elegida, si
    // la hay, ya está en la galería.
    if (generadorDisponible(generador)) olvidarCandidatas({ clave: encargo.clave });
    abridor?.focus?.();
  });

  document.body.append(dialogo);
  actual();
  dialogo.showModal();

  // Abrir el estudio es pedirlo: se mira si hay generador, sin pintar nada.
  sondear();
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
  // Tampoco mientras lee el historial o consulta un panel: las sugerencias
  // son para el presente, y no se ponen delante de lo que está leyendo.
  if (campo?.disabled || escribiendo || vistaRelato !== 'ahora' || hojaAbierta || document.querySelector('dialog[open]')) {
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
  // En estrecho salen plegadas en una línea («¿Sin ideas?»): abiertas se
  // comían el sitio del relato. Se despliegan al pulsar el rótulo.
  plegarSugerencias(esEstrecho());
  capa.hidden = false;
}

function plegarSugerencias(si) {
  const capa = $('#sugerencias');
  const titulo = $('#sugerencias-titulo');
  if (!capa || !titulo) return;
  capa.classList.toggle('sugerencias--plegada', si);
  titulo.setAttribute('aria-expanded', String(!si));
  titulo.textContent = si ? '¿Sin ideas? Ver 3 sugerencias' : '¿Sin ideas? Prueba con…';
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
  vistaRelato = 'ahora';
  scrollHistorial = null;
  historialPintado = false;
  respuestaNueva = false;
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

  // Sin saltar al final: quien estaba leyendo sigue donde estaba.
  delete $('#bitacora')?.dataset.escribiendo;
}

function escribirSiguiente() {
  relojEscritura = 0;

  const tarea = colaEscritura[0];
  const caja = $('#bitacora');
  if (!tarea) { detenerEscritura(); delete caja?.dataset.escribiendo; programarSugerencias(); return; }

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
    // Se acompaña la línea que se escribe SOLO si se sale por abajo y el
    // jugador no ha subido a releer: el texto no arrastra la lectura.
    if (caja && seguirEscritura) {
      const fondo = tarea.nodo.offsetTop + tarea.nodo.offsetHeight + 14 - caja.clientHeight;
      if (fondo > caja.scrollTop) caja.scrollTop = fondo;
    }
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

/* ── el relato: «Ahora» e «Historial» ─────────────────────────────────── */

/**
 * Qué parte del relato se ve.
 *
 *   · «ahora»: SOLO el turno en curso (tu acción y lo que pasa), con su
 *     principio y su final a la vista. Un turno nuevo se lee desde arriba.
 *   · «historial»: todo lo anterior, entero, por turnos. Mientras se lee
 *     aquí, una respuesta nueva no mueve ni el foco ni la lectura: se avisa
 *     y se vuelve al presente cuando el jugador quiere.
 *
 * Antes era un registro único que crecía hacia abajo y se pegaba al final a
 * cada letra: para saber qué acababa de pasar había que buscar dónde empezaba.
 */
let vistaRelato = 'ahora';
/** Dónde se quedó leyendo en el historial (null: al final, lo más reciente). */
let scrollHistorial = null;
/** Llegó una respuesta mientras se leía el historial. */
let respuestaNueva = false;
/** En «Ahora», lo que se escribe se sigue con la vista salvo que el jugador suba a leer. */
let seguirEscritura = true;
/** Lo que hay pintado ahora mismo en la bitácora es el historial. */
let historialPintado = false;

const esDelJugador = (e) => e?.voz === 'player' || e?.voz === 'jugador';

/**
 * Parte el relato en turnos: cada acción del jugador abre uno. Lo anterior a
 * la primera acción es el comienzo (turno 0).
 * @returns {Array<{n: number, desde: number, entradas: Object[]}>}
 */
function turnosDelRelato(entradas) {
  const turnos = [];
  let n = 0;
  let actual = null;
  entradas.forEach((e, i) => {
    if (esDelJugador(e) || !actual) {
      if (esDelJugador(e)) n += 1;
      actual = { n: esDelJugador(e) ? n : 0, desde: i, entradas: [] };
      turnos.push(actual);
    }
    actual.entradas.push(e);
  });
  return turnos;
}

/** Cambia de vista conservando dónde se leía en el historial. */
function verRelato(vista, { foco = false } = {}) {
  const caja = $('#bitacora');
  if (vista === vistaRelato) { if (foco) caja?.focus(); return; }
  if (vistaRelato === 'historial' && caja && historialPintado) scrollHistorial = caja.scrollTop;
  vistaRelato = vista;
  if (vista === 'ahora') respuestaNueva = false;
  else ocultarSugerencias();
  firmaBitacora = '';
  pintarBitacora();
  if (foco) caja?.focus();
}

/** Las pestañas del relato, el rótulo de dónde estás y el aviso de respuesta nueva. */
function pintarVistasRelato(turnos) {
  const ahora = $('#relato-ahora');
  const historial = $('#relato-historial');
  const caja = $('#bitacora');
  if (!ahora || !historial || !caja) return;
  const enAhora = vistaRelato === 'ahora';
  for (const [b, activa] of [[ahora, enAhora], [historial, !enAhora]]) {
    b.classList.toggle('es-activa', activa);
    b.setAttribute('aria-selected', String(activa));
    b.setAttribute('tabindex', activa ? '0' : '-1');
  }
  const total = turnos.at(-1)?.n ?? 0;
  caja.setAttribute('aria-labelledby', enAhora ? 'relato-ahora' : 'relato-historial');
  caja.dataset.vista = vistaRelato;
  const donde = $('#relato-donde');
  if (donde) donde.textContent = enAhora
    ? (total ? `Turno ${total}: lo último que ha pasado` : 'El comienzo de tu historia')
    : `Todo lo ocurrido, del comienzo al turno ${total}`;
  const aviso = $('#relato-nuevo');
  const hayAviso = respuestaNueva && !enAhora;
  if (aviso) aviso.hidden = !hayAviso;
  if (donde) donde.hidden = hayAviso;
}

/** El rótulo que abre un turno. */
function cabeceraTurno(t, { ahora = false } = {}) {
  return el('p', { class: `turno__cab${ahora ? ' turno__cab--ahora' : ''}`, dataset: { turno: String(t.n) } },
    el('span', { text: t.n ? `Turno ${t.n}` : 'Comienzo' }));
}

/**
 * Pinta una entrada del relato en `caja`. Devuelve nada: los párrafos que
 * hay que escribir letra a letra se apuntan en la cola.
 */
function pintarEntrada(caja, e, { nueva = false, escribir = false } = {}) {
  // El motor etiqueta esta voz como `roll`, no como `tirada`. Al buscar solo
  // `tirada` no coincidía nunca y las fichas de dados NO SE DIBUJABAN: el
  // juego resolvía las tiradas y no enseñaba ni una, que es justo lo que el
  // proyecto promete («el motor tira los dados y el director narra lo que ya
  // está decidido»). Se aceptan los dos nombres para no depender de cuál
  // emita cada sistema.
  if (e.voz === 'roll' || e.voz === 'tirada') {
    // El dado solo rueda para la tirada que acaba de ocurrir, y una sola
    // vez: la bitácora se repinta entera en cada refresco.
    const rueda = nueva && Boolean(e.id) && e.id !== ultimaTiradaAnimada;
    const ficha = fichaTirada(e.meta?.tirada, { animar: rueda });
    if (rueda) ultimaTiradaAnimada = e.id;
    if (nueva) ficha.classList.add('es-reciente');
    caja.append(ficha);
    return;
  }

  // Partidas antiguas guardaban aquí la dirección de una ilustración de un
  // servicio de fuera. Ya no se carga: pedirla filtraba que se estaba
  // jugando, y en un guardado manipulado podía apuntar a cualquier sitio.
  // Queda el pie, que es la parte de la historia.
  if (e.voz === 'escena') {
    if (e.texto) caja.append(el('p', { class: 'linea linea--escena', text: e.texto }));
    return;
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
  const seEscribe = escribir && (e.voz === 'dm' || e.voz === 'narrador');

  // La letra capital solo abre el turno, no cada línea: la narración va por
  // golpes —una frase por línea— y diez capitulares seguidas no son una
  // página iluminada, son un sarpullido.
  let primeraDelTurno = true;

  for (const parrafo of String(e.texto ?? '').split('\n')) {
    if (!parrafo.trim()) continue;

    const clases = [clase];
    if (nueva) clases.push('es-reciente');

    if (e.voz === 'dm' || e.voz === 'narrador') {
      // Los golpes —«CLANG.», «Y entonces...»— piden su propio peso: van
      // centrados, espaciados y sin capitular.
      if (esGolpe(parrafo)) clases.push('linea--golpe');
      else if (!primeraDelTurno) clases.push('linea--seguida');
      primeraDelTurno = false;
    }

    const nodo = el('p', { class: clases.join(' '), text: seEscribe ? '' : parrafo });
    caja.append(nodo);
    if (seEscribe) colaEscritura.push({ nodo, texto: parrafo });
  }
}

function pintarBitacora() {
  const caja = $('#bitacora');
  if (!caja) return;

  const entradas = ver('narrative.entradas', []) ?? [];

  // Refrescar sin cambios no repinta: así no se corta lo que se está escribiendo.
  const firma = `${vistaRelato}|${entradas.length}|${entradas.at(-1)?.texto ?? ''}`;
  if (firma === firmaBitacora) return;
  firmaBitacora = firma;

  // Cada repintado es el único dueño del escritor: lo que se estaba
  // escribiendo se da por leído y el escritor se para SIEMPRE, haya cola o
  // no (una ventana de 140 ms entre párrafos dejaba la cola parada para
  // siempre con sus `<p>` en blanco).
  completarEscritura();

  const turnos = turnosDelRelato(entradas);
  const nuevas = entradas.slice(entradasVistas);

  if (vistaRelato === 'historial') {
    // TODO el relato que guarda la partida, sin recortar y sin efecto. Lo
    // nuevo no mueve la lectura: se queda donde estaba y se avisa. El punto
    // de lectura se toma de la caja ANTES de repintar (no de un evento de
    // desplazamiento, que puede llegar tarde con la pestaña en segundo plano).
    const donde = historialPintado ? caja.scrollTop : scrollHistorial;
    vaciar(caja);
    for (const t of turnos) {
      caja.append(cabeceraTurno(t));
      for (const e of t.entradas) pintarEntrada(caja, e);
    }
    caja.append(el('p', { class: 'turno__fin turno__fin--historial' },
      el('button', { type: 'button', class: 'btn btn--pequeno', id: 'historial-volver', onClick: protegido('volver al presente', () => verRelato('ahora', { foco: true })) }, 'Volver al presente')));
    anunciarRelato(nuevas);
    if (nuevas.length && entradasVistas > 0) respuestaNueva = true;
    entradasVistas = entradas.length;
    caja.scrollTop = donde === null ? caja.scrollHeight : donde;
    scrollHistorial = caja.scrollTop;
    historialPintado = true;
    pintarVistasRelato(turnos);
    return;
  }

  // «Ahora»: el turno en curso, entero, de su principio a su final.
  const ultimo = turnos.at(-1) ?? { n: 0, desde: 0, entradas: [] };
  historialPintado = false;
  vaciar(caja);
  caja.append(cabeceraTurno(ultimo, { ahora: true }));
  ultimo.entradas.forEach((e, k) => {
    const nueva = ultimo.desde + k >= entradasVistas;
    pintarEntrada(caja, e, { nueva, escribir: nueva });
  });
  caja.append(el('p', { class: 'turno__fin', 'aria-hidden': 'true', text: '◆' }));

  // Lo nuevo se dicta una sola vez y ya montado, para quien no ve la pantalla.
  // Va aquí y no en la bitácora porque la bitácora se reconstruye entera en
  // cada refresco: marcarla como región viva haría releerlo todo cada turno.
  anunciarRelato(nuevas);

  if (nuevas.length) {
    // Un turno nuevo se lee desde su principio, no desde su última línea.
    caja.scrollTop = 0;
    seguirEscritura = true;
  }
  entradasVistas = entradas.length;
  pintarVistasRelato(turnos);

  if (colaEscritura.length) { caja.dataset.escribiendo = '1'; escribirSiguiente(); } else delete caja.dataset.escribiendo;
}

/** Conecta las pestañas del relato, el aviso de respuesta nueva y la lectura. */
function conectarRelato() {
  const caja = $('#bitacora');
  $('#relato-ahora')?.addEventListener('click', protegido('ver el presente', () => verRelato('ahora')));
  $('#relato-historial')?.addEventListener('click', protegido('ver el historial', () => verRelato('historial')));
  $('#relato-nuevo')?.addEventListener('click', protegido('volver al presente', () => verRelato('ahora', { foco: true })));
  // Flechas entre las dos pestañas, como en cualquier grupo de pestañas.
  $('#relato-vistas')?.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    verRelato(vistaRelato === 'ahora' ? 'historial' : 'ahora');
    $(vistaRelato === 'ahora' ? '#relato-ahora' : '#relato-historial')?.focus();
  });
  if (!caja) return;
  // El punto de lectura del historial se recuerda.
  caja.addEventListener('scroll', () => { if (vistaRelato === 'historial' && historialPintado) scrollHistorial = caja.scrollTop; }, { passive: true });
  // Si el jugador sube a releer mientras se escribe, el texto deja de arrastrarle.
  const soltar = () => { if (vistaRelato === 'ahora' && escribiendo) seguirEscritura = false; };
  caja.addEventListener('wheel', soltar, { passive: true });
  caja.addEventListener('touchmove', soltar, { passive: true });
  caja.addEventListener('keydown', (e) => { if (['ArrowUp', 'PageUp', 'Home'].includes(e.key)) soltar(); });
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

/**
 * El resumen del personaje: siempre a la vista. Quién eres y cómo estás
 * (vida, ánima, vigor, oro). Lo demás va en la pestaña «Ficha».
 */
function pintarPersonaje() {
  const caja = $('#panel-personaje');
  if (!caja) return;

  const j = ver('player', {}) ?? {};
  vaciar(caja);

  // Su imagen elegida, o el marcador. Cambiarla es cosa del jugador, y nunca
  // en combate.
  const ficha = fichaRetratoJugador();
  pintarRetrato($('#retrato-pj'), ficha);

  poner(caja,
    el('div', { class: 'ficha-pj' },
      el('span', { class: 'ficha-pj__nombre', text: j.nombre ?? '—' }),
      el('span', { class: 'ficha-pj__clase', text: `nivel ${j.nivel ?? 1}` }),
      ficha.id && !ver('combat.activo', false) ? el('button', {
        class: 'btn btn--pequeno btn--fantasma', id: 'pj-pintar', type: 'button',
        onClick: protegido('imagen del personaje', () => abrirImagenJugador()),
      }, urlAprobada(claveRetrato(ficha)) ? 'Cambiar imagen' : 'Ponerle imagen') : null,
    ),
  );

  const barras = [
    ['Vida', j.vida?.actual ?? 0, j.vida?.max ?? 1, 'vida'],
    j.mana?.max ? ['Ánima', j.mana.actual, j.mana.max, 'mana'] : null,
    // Sin hambre ni sed (6-oct-2026): ya no son presión de supervivencia.
    ['Vigor', j.fatiga ?? 100, 100, 'fatiga'],
  ].filter(Boolean);

  const cajaBarras = el('div', { class: 'barras-pj' });
  for (const [eti, actual, max, clave] of barras) {
    const frac = Math.max(0, Math.min(1, actual / Math.max(1, max)));

    cajaBarras.append(el('div', { class: 'barra-caja' },
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
  caja.append(cajaBarras);

  caja.append(el('div', { class: 'oro' },
    el('span', { text: 'Oro' }),
    el('span', { class: 'oro__cifra', text: String(j.oro ?? 0) }),
  ));
}

/** La pestaña «Ficha»: atributos, experiencia y estados, como los tiene el motor. */
function pintarFicha(caja) {
  const j = ver('player', {}) ?? {};

  caja.append(el('p', { class: 'sub-eti', id: 'ficha-origen', text: [RAZAS[j.raza]?.nombre, CLASES[j.clase]?.nombre, TRASFONDOS[j.trasfondo]?.nombre].filter(Boolean).join(' · ') || '—' }));

  // Los seis atributos DEL MOTOR (vigor, destreza, temple, intelecto,
  // astucia, carisma), con su nombre. Antes se leían claves que el motor no
  // tiene (fuerza, constitución, inteligencia, sabiduría) y cuatro medallones
  // salían siempre en 10, dijera lo que dijera la ficha.
  const atributos = j.atributos ?? {};
  caja.append(el('dl', { class: 'atributos-claros', id: 'ficha-atributos' },
    ...ATRIBUTOS.orden.map((clave) => {
      const valor = atributos[clave] ?? 10;
      const mod = Math.floor((valor - 10) / 2);
      return el('div', { class: 'atributo-claro', dataset: { atributo: clave } },
        el('dt', { text: NOMBRE_ATRIBUTO[clave] }),
        el('dd', {}, el('strong', { text: String(valor) }), el('span', { class: 'atributo-claro__mod', text: mod >= 0 ? `+${mod}` : String(mod) })),
      );
    }),
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
}

/* ── lateral: ficha, bolsa, mapa, encargos, gente, grupo ──────────────── */

let pestanaActiva = 'ficha';
let mercaderActivo = null;

/**
 * En pantallas estrechas el panel elegido se abre como una HOJA sobre la
 * historia, con su título y «Volver a la historia»: antes era una franja de
 * pocos renglones con su propio desplazamiento metida bajo el relato.
 */
let hojaAbierta = false;
const esEstrecho = () => matchMedia('(max-width:800px)').matches;

function pintarLateral() {
  const caja = $('#panel-lateral');
  if (!caja) return;

  // El punto de lectura del panel sobrevive al repintado de cada turno.
  const previo = caja.dataset.pestana === pestanaActiva ? (caja.querySelector('.lateral__cuerpo')?.scrollTop ?? 0) : 0;
  vaciar(caja);

  const hayGrupo = (ver('party.miembros', []) ?? []).length > 0;
  const pestanas = [
    ['ficha', 'Ficha'],
    ['inventario', 'Bolsa'],
    ['mapa', 'Mapa'],
    ['misiones', 'Encargos'],
    ['gente', 'Gente'],
    hayGrupo ? ['grupo', 'Grupo'] : null,
  ].filter(Boolean);
  if (pestanaActiva === 'grupo' && !hayGrupo) pestanaActiva = 'ficha';

  const estrecho = esEstrecho();
  if (!estrecho) hojaAbierta = false;
  $('#panel-lateral-envoltura')?.classList.toggle('lateral--hoja', hojaAbierta);
  caja.dataset.pestana = pestanaActiva;
  const titulo = pestanas.find(([c]) => c === pestanaActiva)?.[1] ?? '';
  const visible = !estrecho || hojaAbierta;

  caja.append(el('div', { class: 'pestanas', role: 'tablist', 'aria-label': 'Tu personaje y tus cosas' },
    ...pestanas.map(([clave, eti]) => el('button', {
      type: 'button', role: 'tab', id: `pestana-${clave}`,
      class: 'pestana' + (pestanaActiva === clave && visible ? ' es-activa' : ''),
      'aria-selected': String(pestanaActiva === clave && visible),
      'aria-controls': 'lateral-cuerpo',
      dataset: { pestana: clave },
      onClick: protegido('pestaña', () => abrirPestanaLateral(clave)),
      text: eti,
    })),
  ));

  const cuerpo = el('div', { class: 'lateral__cuerpo', id: 'lateral-cuerpo', role: 'tabpanel', 'aria-labelledby': 'lateral-titulo', tabindex: '0' });
  caja.append(
    el('div', { class: 'lateral__cab' },
      el('h3', { class: 'lateral__titulo', id: 'lateral-titulo', tabindex: '-1', text: titulo }),
      el('button', { type: 'button', class: 'btn btn--pequeno lateral__volver', id: 'lateral-volver', onClick: protegido('volver a la historia', () => cerrarHoja()) }, 'Volver a la historia'),
    ),
    cuerpo,
  );

  try {
    if (pestanaActiva === 'ficha') pintarFicha(cuerpo);
    else if (pestanaActiva === 'inventario') pintarInventario(cuerpo);
    else if (pestanaActiva === 'mapa') pintarMapa(cuerpo);
    else if (pestanaActiva === 'misiones') pintarMisiones(cuerpo);
    else if (pestanaActiva === 'grupo') pintarGrupo(cuerpo);
    else pintarGente(cuerpo);
  } catch (e) {
    avisarFallo('panel ' + pestanaActiva, e);
  }
  cuerpo.scrollTop = previo;
}

/** Abre una pestaña. En estrecho, como hoja; pulsar la que ya está abierta la cierra. */
function abrirPestanaLateral(clave) {
  const estrecho = esEstrecho();
  if (estrecho && hojaAbierta && pestanaActiva === clave) { cerrarHoja(); return; }
  pestanaActiva = clave;
  if (estrecho) hojaAbierta = true;
  pintarLateral();
  (estrecho ? $('#lateral-titulo') : $(`#pestana-${clave}`))?.focus();
}

/** Cierra la hoja y devuelve el foco a la pestaña que la abrió. La historia sigue donde estaba. */
function cerrarHoja() {
  if (!hojaAbierta) return false;
  hojaAbierta = false;
  pintarLateral();
  $(`#pestana-${pestanaActiva}`)?.focus();
  return true;
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
          onClick: protegido('imagen del compañero', () => abrirEstudio(encargoDePnj(f))),
        }, urlAprobada(claveRetrato({ refId: f.refId })) ? 'Cambiar imagen' : 'Ponerle imagen'),
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
  // Actuar es estar en el presente: la respuesta se verá en «Ahora».
  if (vistaRelato !== 'ahora') verRelato('ahora');

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
  // El foco vuelve a la caja de escribir, salvo que el jugador esté leyendo
  // el historial o consultando un panel: una respuesta nueva no se lo quita.
  if (vistaRelato === 'ahora' && !document.activeElement?.closest?.('#bitacora, .lateral, dialog, .modal:not([hidden])')) $('#entrada')?.focus();
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
  conectarRelato();
  // Escape cierra la hoja del panel (en estrecho) y devuelve a la historia.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !hojaAbierta) return;
    if (document.querySelector('dialog[open], .modal:not([hidden])') || !$('#combate')?.hidden) return;
    if (cerrarHoja()) e.preventDefault();
  });
  // Al cambiar de ancho (girar el móvil, zoom), el panel se recoloca.
  matchMedia('(max-width:800px)').addEventListener?.('change', () => { if (ver('player.raza')) pintarLateral(); });
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
  $('#sugerencias-titulo')?.addEventListener('click', () => { if ($('#sugerencias')?.classList.contains('sugerencias--plegada')) plegarSugerencias(false); });
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
  if (globalThis.__arcanveilArranque) globalThis.__arcanveilArranque.fase = 'motor';

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
