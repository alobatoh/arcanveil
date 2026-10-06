/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCANVEIL · engine/DifficultyDirector.js
 * ---------------------------------------------------------------------------
 * Dirección de ritmo.
 *
 * Vigila cómo va la partida y emite DIRECTRICES al director de juego para
 * corregir lo que va mal. No cambia las reglas: cambia lo que el narrador
 * propone.
 *
 * Cuatro problemas que detecta:
 *
 *   · MONOTONÍA — muchos turnos sin nada. Directriz: que pase algo.
 *   · AGOTAMIENTO — demasiada tensión seguida. Directriz: dar respiro.
 *   · ESTANCAMIENTO — el jugador repite acciones sin avanzar. Directriz:
 *     ofrecer una salida.
 *   · DESESPERACIÓN — recursos al límite y sin opciones. Directriz: una
 *     oportunidad, no un regalo.
 *
 * El cuarto merece defensa. Rescatar al jugador de un agujero que él mismo
 * cavó le quita el peso a sus decisiones. Pero dejarlo en un callejón sin
 * salida es peor: la partida termina no por una derrota narrativa sino por
 * inanición. La directriz pide una OPORTUNIDAD —algo que hay que aprovechar—,
 * no un regalo.
 *
 * Dependencias: SystemBase, balance.config.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { SystemBase } from '../core/SystemBase.js';
import { DIRECCION } from '../config/balance.config.js';

/** Eventos publicados. */
export const EVENTOS_RITMO = Object.freeze({
  DIRECTRIZ: 'pacing:directive',
  DIAGNOSTICO: 'pacing:diagnosis',
});

/* ═══════════════════════════════════════════════════════════════════════════
   DIRECTRICES
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * @typedef {Object} Directriz
 * @property {string} clave
 * @property {string} texto Lo que se le dice al director.
 * @property {number} prioridad Mayor gana si hay varias.
 */

/** @type {Record<string, Directriz>} */
export const DIRECTRICES = Object.freeze({
  introducir_tension: {
    clave: 'introducir_tension',
    prioridad: 2,
    texto: 'Lleva varios turnos sin pasar nada. Introduce algo que reclame atención: un ruido, un encuentro, una señal de que algo va mal. No tiene que ser un combate.',
  },

  dar_respiro: {
    clave: 'dar_respiro',
    prioridad: 3,
    texto: 'Ha habido mucha tensión seguida. Baja el ritmo: un momento de calma, una conversación, un sitio donde recuperar el aliento.',
  },

  ofrecer_salida: {
    clave: 'ofrecer_salida',
    prioridad: 4,
    texto: 'El personaje lleva varios turnos intentando lo mismo sin avanzar. Ofrécele una vía distinta: alguien que sugiera otra cosa, un detalle que abra otra posibilidad.',
  },

  dar_oportunidad: {
    clave: 'dar_oportunidad',
    prioridad: 5,
    texto: 'El personaje está al límite de recursos. Preséntale una OPORTUNIDAD que tenga que aprovechar: un refugio que hay que alcanzar, alguien que puede ayudar a cambio de algo, un hallazgo que hay que arriesgarse a coger. No se lo regales.',
  },

  cerrar_hilo: {
    clave: 'cerrar_hilo',
    prioridad: 3,
    texto: 'Hay hilos abiertos desde hace tiempo. Retoma alguno: que alguien mencione una promesa pendiente o que un asunto sin cerrar reaparezca.',
  },

  variar_escenario: {
    clave: 'variar_escenario',
    prioridad: 1,
    texto: 'Lleva mucho tiempo en el mismo sitio. Sugiere sutilmente que hay algo fuera: un rumor, una petición, una razón para moverse.',
  },
});

export class DifficultyDirector extends SystemBase {
  static nombre = 'pacing';
  static dependencias = ['player'];
  static canal = 'engine';

  constructor(contexto) {
    super(contexto);

    /**
     * Historial reciente de turnos, para el análisis.
     * @type {Array<Object>}
     * @private
     */
    this._historial = [];

    /** Directriz activa. @private */
    this._directriz = null;

    /** Turno en que se emitió. @private */
    this._turnoDirectriz = 0;
  }

  /* ═══════════════════════════════════════════════════════════════════════
     CICLO DE VIDA
     ═══════════════════════════════════════════════════════════════════════ */

  alIniciar() {
    this.escuchar('turn:resolved', (resumen) => this._registrar(resumen));

    // Las señales de tensión se anotan para el análisis.
    this.escuchar('combat:start', () => this._marcarTension('combate'));
    this.escuchar('exploration:encounter', () => this._marcarTension('encuentro'));
    this.escuchar('world:event:started', () => this._marcarTension('evento'));
  }

  /**
   * El diagnóstico se hace cada turno; la directriz, solo cuando hace falta.
   * @param {Object} contexto
   */
  alTurno(contexto) {
    if (contexto.tipo === 'combate') return;

    const diagnostico = this.diagnosticar();

    if (diagnostico.problema) {
      this._emitirDirectriz(diagnostico, contexto.turno);
    } else if (this._directriz && contexto.turno - this._turnoDirectriz > 3) {
      // La directriz caduca: no conviene insistir turno tras turno.
      this._directriz = null;
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════
     REGISTRO
     ═══════════════════════════════════════════════════════════════════════ */

  /**
   * Anota lo ocurrido en un turno.
   * @param {Object} resumen
   * @private
   */
  _registrar(resumen) {
    this._historial.push({
      turno: resumen.turno,
      intencion: resumen.intencion?.tipo,
      objetivo: resumen.intencion?.objetivo,
      exito: resumen.tirada?.exito ?? null,
      lugar: this.leer('world.ubicacion'),
      tension: false,
    });

    const ventana = DIRECCION.ventanaAnalisis * 2;
    if (this._historial.length > ventana) {
      this._historial = this._historial.slice(-ventana);
    }
  }

  /**
   * Marca el turno actual como tenso.
   * @private
   */
  _marcarTension(origen) {
    const ultimo = this._historial.at(-1);
    if (ultimo) {
      ultimo.tension = true;
      ultimo.origenTension = origen;
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════
     DIAGNÓSTICO
     ═══════════════════════════════════════════════════════════════════════ */

  /**
   * Evalúa el estado de la partida.
   *
   * @returns {{problema: string|null, detalle: Object}}
   */
  diagnosticar() {
    const ventana = this._historial.slice(-DIRECCION.ventanaAnalisis);

    const detalle = {
      turnos: ventana.length,
      tensos: ventana.filter((t) => t.tension).length,
      sinTension: this.leer('world.turnosSinTension', 0),
      repeticiones: this._contarRepeticiones(ventana),
      turnosMismoLugar: this._turnosEnMismoLugar(),
      recursos: this._evaluarRecursos(),
      hilosViejos: this._hilosViejos(),
    };

    // ─── Desesperación: lo más urgente ──────────────────────────────────
    if (detalle.recursos.critico) {
      return { problema: 'dar_oportunidad', detalle };
    }

    // ─── Estancamiento ──────────────────────────────────────────────────
    if (detalle.repeticiones >= 4) {
      return { problema: 'ofrecer_salida', detalle };
    }

    // ─── Agotamiento ────────────────────────────────────────────────────
    if (ventana.length >= 6 && detalle.tensos >= ventana.length * 0.6) {
      return { problema: 'dar_respiro', detalle };
    }

    // ─── Monotonía ──────────────────────────────────────────────────────
    if (detalle.sinTension >= DIRECCION.turnosSinTensionMax) {
      return { problema: 'introducir_tension', detalle };
    }

    // ─── Hilos olvidados ────────────────────────────────────────────────
    if (detalle.hilosViejos >= 2) {
      return { problema: 'cerrar_hilo', detalle };
    }

    // ─── Escenario estancado ────────────────────────────────────────────
    if (detalle.turnosMismoLugar >= 15) {
      return { problema: 'variar_escenario', detalle };
    }

    return { problema: null, detalle };
  }

  /**
   * Cuenta acciones repetidas sin éxito.
   *
   * Repetir lo mismo y fallar es la señal más clara de que el jugador está
   * atascado y no sabe qué otra cosa probar.
   *
   * @private
   */
  _contarRepeticiones(ventana) {
    if (ventana.length < 3) return 0;

    let maximo = 0;
    let actual = 1;

    for (let i = 1; i < ventana.length; i++) {
      const a = ventana[i - 1];
      const b = ventana[i];

      const misma = a.intencion === b.intencion
        && (a.objetivo ?? '') === (b.objetivo ?? '');

      // Solo cuenta si además no está funcionando.
      if (misma && b.exito !== true) {
        actual++;
        maximo = Math.max(maximo, actual);
      } else {
        actual = 1;
      }
    }

    return maximo;
  }

  /** @private */
  _turnosEnMismoLugar() {
    const actual = this.leer('world.ubicacion');
    let cuenta = 0;

    for (let i = this._historial.length - 1; i >= 0; i--) {
      if (this._historial[i].lugar !== actual) break;
      cuenta++;
    }

    return cuenta;
  }

  /**
   * Evalúa si el jugador está al límite.
   *
   * Crítico es la conjunción de varias carencias: estar herido no basta, estar
   * herido sin comida ni dinero ni forma de curarse, sí.
   *
   * @private
   */
  _evaluarRecursos() {
    const jugador = this.leer('player');

    const vida = (jugador.vida?.actual ?? 1) / Math.max(1, jugador.vida?.max ?? 1);
    const oro = jugador.oro ?? 0;

    const inventario = this.sistema('inventory');
    const tieneCuracion = (inventario?.cantidadDe('pocion_curacion') ?? 0) > 0;

    // Sin hambre, sed ni provisiones (6-oct-2026): ya no son carencias. Quedan
    // tres; el umbral de «callejón» pasa de 4 de 6 a las 3 (propuesta: misma
    // idea, todas las carencias a la vez y poca vida).
    const carencias = [
      vida < 0.25,
      oro < 5,
      !tieneCuracion,
    ].filter(Boolean).length;

    return {
      vida,
      oro,
      carencias,
      critico: carencias >= 3 && vida < 0.4,
    };
  }

  /**
   * Cuenta hilos narrativos abiertos hace mucho.
   * @private
   */
  _hilosViejos() {
    const turns = this.sistema('turns');
    const hilos = turns?.memoria?.hilosAbiertos?.() ?? [];
    const turno = this.leer('meta.turno', 0);

    return hilos.filter((h) => turno - (h.turno ?? 0) > 25).length;
  }

  /* ═══════════════════════════════════════════════════════════════════════
     DIRECTRICES
     ═══════════════════════════════════════════════════════════════════════ */

  /**
   * Emite una directriz al director.
   *
   * @param {Object} diagnostico
   * @param {number} turno
   * @private
   */
  _emitirDirectriz(diagnostico, turno) {
    const directriz = DIRECTRICES[diagnostico.problema];
    if (!directriz) return;

    // No se repite la misma directriz seguida: si no funcionó, insistir
    // tampoco funcionará.
    if (this._directriz?.clave === directriz.clave && turno - this._turnoDirectriz < 8) {
      return;
    }

    this._directriz = directriz;
    this._turnoDirectriz = turno;

    this.emitir(EVENTOS_RITMO.DIRECTRIZ, {
      clave: directriz.clave,
      texto: directriz.texto,
      diagnostico: diagnostico.detalle,
    });

    this.emitir(EVENTOS_RITMO.DIAGNOSTICO, diagnostico);

    this.log.debug(`directriz de ritmo: ${directriz.clave}`);
  }

  /* ═══════════════════════════════════════════════════════════════════════
     CONSULTAS
     ═══════════════════════════════════════════════════════════════════════ */

  /**
   * Directriz activa, para el prompt.
   * @returns {string|null}
   */
  directrizActual() {
    return this._directriz?.texto ?? null;
  }

  /**
   * Contexto de ritmo para el director.
   * @returns {string}
   */
  paraDirector() {
    return this._directriz?.texto ?? '';
  }

  /**
   * Fuerza una directriz. Para depuración.
   * @param {string} clave
   * @returns {boolean}
   */
  forzar(clave) {
    const directriz = DIRECTRICES[clave];
    if (!directriz) return false;

    this._directriz = directriz;
    this._turnoDirectriz = this.leer('meta.turno', 0);

    return true;
  }

  /** @returns {Object} */
  serializar() {
    return {
      historial: this._historial.slice(-DIRECCION.ventanaAnalisis),
      directriz: this._directriz?.clave ?? null,
      turnoDirectriz: this._turnoDirectriz,
    };
  }

  /** @param {Object} datos */
  restaurar(datos) {
    this._historial = datos?.historial ?? [];
    this._directriz = datos?.directriz ? DIRECTRICES[datos.directriz] : null;
    this._turnoDirectriz = datos?.turnoDirectriz ?? 0;
  }

  /** @returns {Object} */
  inspeccionar() {
    const d = this.diagnosticar();

    return {
      problema: d.problema,
      directrizActiva: this._directriz?.clave ?? null,
      ...d.detalle,
    };
  }
}

export default DifficultyDirector;
