/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCANVEIL · player/Player.js
 * ---------------------------------------------------------------------------
 * Sistema coordinador del personaje.
 *
 * Los módulos anteriores son funciones puras que no conocen el Store. Este es
 * el que los conecta con el motor: registra los reductores, escucha los eventos
 * y aplica el desgaste en cada turno.
 *
 * Esa separación no es ceremonia. Permite que la pantalla de creación calcule
 * un personaje hipotético sin tocar la partida, y que toda la lógica de reglas
 * sea verificable sin montar medio motor.
 *
 * Dependencias: SystemBase y todos los módulos de /player.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { SystemBase } from '../core/SystemBase.js';
import { obtenerClase } from '../data/classes.data.js';
import { obtenerRaza } from '../data/races.data.js';
import { FASE } from '../core/GameState.js';
import { VITALES } from '../config/balance.config.js';

const VITALES_MAX = VITALES.supervivencia.max;

import * as Atributos from './Attributes.js';
import * as Vitals from './Vitals.js';
import * as Progresion from './Progression.js';
import * as Habilidades from './SkillSystem.js';
import * as Alineamiento from './Alignment.js';
import * as Vocacion from './ClassSystem.js';
import { crearPersonaje, fichaParaDirector } from './CharacterFactory.js';
import { nuevoRunId } from './Muerte.js';

/** Eventos publicados por el sistema de jugador. */
export const EVENTOS_JUGADOR = Object.freeze({
  CREADO: 'player:created',
  DANADO: 'player:damaged',
  CURADO: 'player:healed',
  CAIDO: 'player:down',
  SUBE_NIVEL: 'player:levelup',
  XP_GANADA: 'player:xp',
  UMBRAL_RECURSO: 'player:resource:threshold',
  ALINEAMIENTO: 'player:alignment:shift',
  DESCANSO: 'player:rested',
});

export class Player extends SystemBase {
  static nombre = 'player';
  static dependencias = ['clock'];
  static canal = 'player';

  /* ─────────────────────────────────────────────────────────────────────────
     CICLO DE VIDA
     ───────────────────────────────────────────────────────────────────────── */

  alIniciar() {
    this.reductores({
      'player/crear': this._reducirCrear,
      'player/danar': this._reducirDanar,
      'player/curar': this._reducirCurar,
      'player/mana': this._reducirMana,
      'player/recurso': this._reducirRecurso,
      'player/xp': this._reducirXP,
      'player/descansar': this._reducirDescansar,
      'player/alineamiento': this._reducirAlineamiento,
      'player/habilidad/mejorar': this._reducirMejorarHabilidad,
      'player/atributo/subir': this._reducirSubirAtributo,
      'player/rasgo/usar': this._reducirUsarRasgo,
      'player/avanzada': this._reducirClaseAvanzada,
      'player/flag': this._reducirBandera,
      'player/desgaste': this._reducirDesgaste,
    });

    // La caída del personaje se detecta observando la vida, no dentro de cada
    // reductor que pueda restarla. Una sola vigilancia, ningún caso olvidado.
    this.observar('player.vida.actual', (actual, anterior) => {
      if (actual <= 0 && (anterior ?? 1) > 0) this._alCaer();
    });
  }

  /**
   * Desgaste de cada turno: fatiga y regeneración pasiva. Hambre y sed ya no
   * (6-oct-2026), ni con clima ni con viaje.
   * @param {Object} contexto
   */
  alTurno(contexto) {
    const jugador = this.leer('player');
    if (!jugador?.raza) return;   // Aún no hay personaje creado.

    const { parche, avisos, dano } = Vitals.desgasteTurno(jugador, {
      tipo: contexto.tipo,
      minutos: contexto.minutos,
    });

    this.store.transaccion(() => {
      // Antes se despachaba 'player/aplicarParche', que no tenía reductor: el
      // desgaste se calculaba (hambre 99,45, sed 99,15, fatiga 99,6 tras un
      // turno) y se tiraba. Hambre, sed y fatiga no bajaban nunca.
      this.despachar('player/desgaste', parche);
      for (const aviso of avisos) {
        this.emitir(EVENTOS_JUGADOR.UMBRAL_RECURSO, { mensaje: aviso });
      }
      if (dano > 0) this.emitir(EVENTOS_JUGADOR.DANADO, { cantidad: dano, origen: 'privación' });
    });
  }

  /* ─────────────────────────────────────────────────────────────────────────
     CREACIÓN
     ───────────────────────────────────────────────────────────────────────── */

  /**
   * Crea el personaje a partir del borrador de la entrevista y publica los
   * efectos secundarios para que los recojan otros sistemas.
   *
   * @param {Object} estado
   * @param {{payload: {borrador: Object}}} accion
   * @returns {Object|null}
   * @private
   */
  _reducirCrear(estado, accion) {
    const borrador = accion.payload?.borrador;
    if (!borrador) return null;

    const resultado = crearPersonaje(borrador);

    // El inventario, el contacto y la deuda pertenecen a otros sistemas. Se
    // publican en la microcola para no emitir a mitad de una mutación.
    queueMicrotask(() => {
      this.emitir(EVENTOS_JUGADOR.CREADO, {
        jugador: resultado.jugador,
        inventario: resultado.inventario,
        contacto: resultado.contacto,
        deuda: resultado.deuda,
      });
      for (const aviso of resultado.avisos) this.log.aviso(aviso);
    });

    return {
      player: resultado.jugador,
      meta: {
        titulo: `Crónica de ${resultado.jugador.nombre}`,
        creada: Date.now(),
        fase: 'exploracion',
        // Identidad de ESTA partida: la muerte se apunta por run, no por
        // nombre (ver `player/Muerte.js`).
        runId: nuevoRunId(),
        muerte: null,
      },
    };
  }

  /* ─────────────────────────────────────────────────────────────────────────
     VITALES
     ───────────────────────────────────────────────────────────────────────── */

  /** @private */
  _reducirDanar(estado, accion) {
    const { cantidad = 0, origen = 'desconocido' } = accion.payload ?? {};
    if (cantidad <= 0) return null;

    // Los rasgos de reducción de daño se aplican antes que nada.
    const reduccion = Vocacion.sumarEfecto(estado.player, 'reduccionDano');
    const efectivo = Math.max(1, cantidad - reduccion);

    const r = Vitals.modificarVida(estado.player, -efectivo);

    queueMicrotask(() => {
      this.emitir(EVENTOS_JUGADOR.DANADO, {
        cantidad: efectivo,
        bruto: cantidad,
        reducido: reduccion,
        origen,
        restante: r.nuevo,
      });
    });

    return r.parche;
  }

  /** @private */
  _reducirCurar(estado, accion) {
    const { cantidad = 0, origen = 'desconocido' } = accion.payload ?? {};
    // Un muerto no se cura (ver `player/Muerte.js`).
    if (cantidad <= 0 || estado.meta?.muerte) return null;

    const r = Vitals.modificarVida(estado.player, cantidad);

    queueMicrotask(() => {
      this.emitir(EVENTOS_JUGADOR.CURADO, {
        cantidad: r.aplicado,
        desperdiciado: r.desperdiciado,
        origen,
      });
    });

    return r.parche;
  }

  /** @private */
  _reducirMana(estado, accion) {
    const { delta = 0 } = accion.payload ?? {};
    const r = Vitals.modificarMana(estado.player, delta);
    if (!r.suficiente) {
      queueMicrotask(() => this.emitir('player:mana:insuficiente', { necesario: Math.abs(delta) }));
      return null;
    }
    return r.parche;
  }

  /**
   * El desgaste del turno que calcula `Vitals.desgasteTurno`.
   *
   * Acción interna del motor, no una puerta para escribir en la ficha: solo
   * pasan hambre, sed y fatiga (0-100) y la vida y el maná actuales dentro de
   * sus máximos. Lo demás se ignora.
   *
   * @private
   */
  _reducirDesgaste(estado, accion) {
    const p = accion.payload?.player;
    if (!p || typeof p !== 'object') return null;
    const jugador = estado.player ?? {};
    const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
    const salida = {};
    // Hambre y sed ya no se tocan (6-oct-2026): solo la fatiga.
    for (const clave of ['fatiga']) {
      const v = num(p[clave]);
      if (v !== null) salida[clave] = Math.max(0, Math.min(VITALES_MAX, Math.round(v * 100) / 100));
    }
    const vida = num(p.vida?.actual);
    if (vida !== null) salida.vida = { actual: Math.max(0, Math.min(jugador.vida?.max ?? vida, Math.round(vida))) };
    const mana = num(p.mana?.actual);
    if (mana !== null && jugador.mana) salida.mana = { actual: Math.max(0, Math.min(jugador.mana.max ?? mana, Math.round(mana))) };
    return Object.keys(salida).length ? { player: salida } : null;
  }

  /** @private */
  _reducirRecurso(estado, accion) {
    const { clave, delta = 0 } = accion.payload ?? {};
    if (!clave) return null;

    const r = Vitals.modificarRecurso(estado.player, clave, delta);

    if (r.cruzoUmbral) {
      queueMicrotask(() => {
        this.emitir(EVENTOS_JUGADOR.UMBRAL_RECURSO, { clave, umbral: r.cruzoUmbral });
      });
    }

    return r.parche;
  }

  /** @private */
  _reducirDescansar(estado, accion) {
    const { tipo = 'corto', conProvisiones = false, enPosada = false } = accion.payload ?? {};

    const r = Vitals.descansar(estado.player, tipo, { conProvisiones, enPosada });
    const recarga = Vocacion.recargarUsos(estado.player, tipo);

    queueMicrotask(() => {
      this.emitir(EVENTOS_JUGADOR.DESCANSO, { tipo, ...r.recuperado, avisos: r.avisos });
    });

    // Se funden los dos parches: vitales y recarga de usos de rasgos.
    return {
      player: { ...r.parche.player, usosRasgos: recarga.player.usosRasgos },
    };
  }

  /* ─────────────────────────────────────────────────────────────────────────
     PROGRESIÓN
     ───────────────────────────────────────────────────────────────────────── */

  /** @private */
  _reducirXP(estado, accion) {
    const { cantidad = 0, motivo = '' } = accion.payload ?? {};
    // Ni una recompensa tardía después de morir.
    if (cantidad <= 0 || estado.meta?.muerte) return null;

    const clase = obtenerClase(estado.player.clase);
    const r = Progresion.otorgarXP(estado.player, cantidad, {
      motivo,
      dadoVida: clase?.dadoVida ?? 8,
      manaBase: clase?.manaBase ?? 0,
    });

    queueMicrotask(() => {
      this.emitir(EVENTOS_JUGADOR.XP_GANADA, { cantidad: r.xpGanada, motivo });
      if (r.subioNivel) {
        this.emitir(EVENTOS_JUGADOR.SUBE_NIVEL, {
          niveles: r.nivelesGanados,
          nivelFinal: r.nivelesGanados.at(-1),
          recompensas: r.recompensas,
        });
      }
    });

    return r.parche;
  }

  /** @private */
  _reducirMejorarHabilidad(estado, accion) {
    const { refId } = accion.payload ?? {};
    if (!refId) return null;

    const r = Habilidades.mejorar(estado.player, refId);
    if (!r.exito) {
      queueMicrotask(() => this.emitir('player:skill:denied', { refId, motivo: r.motivo }));
      return null;
    }

    queueMicrotask(() => this.emitir('player:skill:improved', { refId, grado: r.grado }));
    return r.parche;
  }

  /** @private */
  _reducirSubirAtributo(estado, accion) {
    const { clave } = accion.payload ?? {};
    if (!clave) return null;

    const clase = obtenerClase(estado.player.clase);
    const r = Progresion.gastarPuntoAtributo(estado.player, clave, {
      dadoVida: clase?.dadoVida ?? 8,
      manaBase: clase?.manaBase ?? 0,
    });

    if (!r.exito) {
      queueMicrotask(() => this.emitir('player:attribute:denied', { clave, motivo: r.motivo }));
      return null;
    }
    return r.parche;
  }

  /** @private */
  _reducirClaseAvanzada(estado, accion) {
    const { refId } = accion.payload ?? {};
    const r = Vocacion.elegirAvanzada(estado.player, refId);
    if (!r.exito) {
      queueMicrotask(() => this.emitir('player:advanced:denied', { motivo: r.motivo }));
      return null;
    }
    queueMicrotask(() => this.emitir('player:advanced:chosen', { refId }));
    return r.parche;
  }

  /* ─────────────────────────────────────────────────────────────────────────
     RASGOS Y ALINEAMIENTO
     ───────────────────────────────────────────────────────────────────────── */

  /** @private */
  _reducirUsarRasgo(estado, accion) {
    const { refId, maximo = 1 } = accion.payload ?? {};
    if (!refId) return null;

    const r = Vocacion.consumirUso(estado.player, refId, maximo);
    if (!r.exito) {
      queueMicrotask(() => this.emitir('player:trait:exhausted', { refId }));
      return null;
    }
    return r.parche;
  }

  /** @private */
  _reducirAlineamiento(estado, accion) {
    const { accion: clave, cambio } = accion.payload ?? {};

    const r = clave
      ? Alineamiento.aplicarAccion(estado.player, clave)
      : Alineamiento.desplazar(estado.player, cambio ?? {});

    if (!r.parche) return null;

    if (r.cambioNotable) {
      queueMicrotask(() => {
        this.emitir(EVENTOS_JUGADOR.ALINEAMIENTO, { texto: r.texto, registro: r.registro });
      });
    }

    return r.parche;
  }

  /** @private */
  _reducirBandera(estado, accion) {
    const { clave, valor = true } = accion.payload ?? {};
    if (!clave) return null;
    return { player: { flags: { [clave]: valor } } };
  }

  /* ─────────────────────────────────────────────────────────────────────────
     CAÍDA
     ───────────────────────────────────────────────────────────────────────── */

  /** @private */
  _alCaer() {
    const jugador = this.leer('player');

    // Ciertos rasgos evitan la caída. Se comprueban aquí, en un solo punto.
    const salvavidas = Vocacion.buscarRasgo(jugador, 'evitarCaida')
      ?? Vocacion.buscarRasgo(jugador, 'evitarMuerte');

    if (salvavidas) {
      const usos = Vocacion.usosDisponibles(jugador, salvavidas.refId, salvavidas.efecto.usos ?? 1);
      if (usos.restantes > 0) {
        this.store.transaccion(() => {
          this.despachar('player/rasgo/usar', { refId: salvavidas.refId, maximo: salvavidas.efecto.usos ?? 1 });
          this.despachar('player/curar', { cantidad: 1, origen: salvavidas.nombre });
        });
        this.emitir('player:saved', { rasgo: salvavidas.nombre });
        return;
      }
    }

    // La partida se detiene AQUÍ, en el motor.
    //
    // Antes la caída solo pintaba un rótulo en la interfaz: la fase seguía en
    // `exploracion`, la caja de texto viva, y cada «ataco» abría un combate
    // nuevo con el personaje a cero de vida. El rótulo decía «la crónica
    // termina aquí» y la crónica no terminaba.
    //
    // `TurnResolver` ya rechazaba los turnos en fase `fin` desde siempre; lo
    // que faltaba era que alguien pusiera esa fase. La pone quien detecta la
    // caída, que es el único punto que la conoce sin depender de la pantalla.
    this.store.fijar('meta.fase', FASE.FIN);

    this.emitir(EVENTOS_JUGADOR.CAIDO, { nombre: jugador.nombre, turno: this.leer('meta.turno') });
  }

  /* ─────────────────────────────────────────────────────────────────────────
     API PÚBLICA
     ───────────────────────────────────────────────────────────────────────── */

  /**
   * Prepara una prueba de habilidad con todos sus modificadores.
   * Es lo que llama RulesEngine antes de tirar los dados.
   *
   * @param {Object} opciones
   * @returns {Object}
   */
  prepararPrueba(opciones) {
    const jugador = this.leer('player');
    return Habilidades.prepararPrueba(jugador, {
      ...opciones,
      rasgos: Vocacion.rasgosActivos(jugador),
    });
  }

  /**
   * Ficha narrativa completa, para el prompt del director.
   * @returns {string}
   */
  fichaNarrativa() {
    return fichaParaDirector(this.leer('player'));
  }

  /**
   * Estado resumido, para la interfaz.
   * @returns {Object}
   */
  resumen() {
    const jugador = this.leer('player');
    return {
      identidad: {
        nombre: jugador.nombre,
        raza: obtenerRaza(jugador.raza)?.nombre,
        clase: obtenerClase(jugador.clase)?.nombre,
        nivel: jugador.nivel,
      },
      atributos: Atributos.resumenAtributos(jugador),
      vitales: Vitals.resumenVitales(jugador),
      progresion: Progresion.resumenProgresion(jugador),
      habilidades: Habilidades.resumenHabilidades(jugador),
      alineamiento: Alineamiento.describir(jugador.alineamiento),
      rasgos: Vocacion.rasgosActivos(jugador),
    };
  }

  /**
   * Descripción del estado físico en lenguaje natural, para el director.
   * @returns {string}
   */
  estadoNarrativo() {
    return Vitals.describirEstado(this.leer('player'));
  }
}

export default Player;
