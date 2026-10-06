/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCANVEIL · core/Clock.js
 * ---------------------------------------------------------------------------
 * Reloj del mundo y contador de turnos.
 *
 * No es un reloj de tiempo real: el tiempo del mundo sólo avanza cuando ocurre
 * algo. Un turno de exploración son diez minutos; una ronda de combate, uno;
 * una noche de descanso, ocho horas. Nada corre mientras el jugador piensa.
 *
 * Responsabilidades:
 *   · Contar turnos y avanzar la hora del mundo.
 *   · Calcular la franja del día y publicar sus cambios.
 *   · Disparar el gancho alTurno() de todos los sistemas, en orden.
 *   · Emitir los eventos de tiempo que consumen clima, hambre y encuentros.
 *
 * El Clock NO decide qué pasa al amanecer: sólo anuncia que ha amanecido.
 *
 * Dependencias: SystemBase, config/balance.config.js, config/ui.config.js.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { SystemBase } from './SystemBase.js';
import { MUNDO } from '../config/balance.config.js';
import * as Calendario from '../world/Calendario.js';
import { ATRIBUTOS_DOC, ICONOS_FRANJA } from '../config/ui.config.js';

/** Eventos publicados por el reloj. */
export const EVENTOS_RELOJ = Object.freeze({
  TURNO_INICIO: 'clock:turn:start',
  TURNO_FIN: 'clock:turn:end',
  TIEMPO_AVANZA: 'clock:time:advance',
  FRANJA_CAMBIA: 'clock:daypart:change',
  DIA_NUEVO: 'clock:day:new',
  ESTACION_CAMBIA: 'clock:season:change',
});

export class Clock extends SystemBase {
  static nombre = 'clock';
  static dependencias = [];
  static canal = 'core';

  /* ─────────────────────────────────────────────────────────────────────────
     CICLO DE VIDA
     ───────────────────────────────────────────────────────────────────────── */

  alIniciar() {
    this.reductores({
      'clock/avanzar': this._reducirAvanzar,
      'clock/fijar': this._reducirFijar,
    });

    // El atributo data-daypart del documento tiñe toda la interfaz según la
    // hora. Se sincroniza aquí para que ningún componente tenga que saberlo.
    this.observar('world.tiempo.franja', (franja) => this._sincronizarDocumento(franja), { inmediato: true });
  }

  /* ─────────────────────────────────────────────────────────────────────────
     TURNOS
     ───────────────────────────────────────────────────────────────────────── */

  /**
   * Ejecuta un turno completo de juego.
   *
   * Secuencia:
   *   1. anuncia el inicio
   *   2. avanza el tiempo del mundo
   *   3. deja actuar a todos los sistemas (hambre, clima, estados, encuentros)
   *   4. anuncia el final
   *
   * @param {Object} [opciones]
   * @param {number} [opciones.minutos] Minutos a avanzar. Por defecto, los de
   *   un turno de exploración; en combate, los de una ronda.
   * @param {string} [opciones.tipo='exploracion'] 'exploracion'|'combate'|'descanso'|'viaje'
   * @param {Object} [opciones.datos] Información adicional para los sistemas.
   * @returns {Promise<number>} Número del turno recién ejecutado.
   */
  async turno(opciones = {}) {
    const tipo = opciones.tipo ?? 'exploracion';
    const minutos = opciones.minutos ?? this._minutosPorTipo(tipo);

    const numero = this.leer('meta.turno', 0) + 1;
    const contexto = { turno: numero, tipo, minutos, datos: opciones.datos ?? {} };

    this.emitir(EVENTOS_RELOJ.TURNO_INICIO, contexto);

    this.store.transaccion(() => {
      this.despachar('clock/avanzar', { minutos, turno: numero });
    });

    // Los sistemas actúan después de que el tiempo haya avanzado: así el
    // sistema de clima ya sabe qué hora es cuando decide si empieza a llover.
    await this.registry.turno(contexto);

    this.emitir(EVENTOS_RELOJ.TURNO_FIN, contexto);
    this.log.debug(`Turno ${numero} (${tipo}, +${minutos} min)`);

    return numero;
  }

  /**
   * Avanza el tiempo sin consumir un turno. Se usa para descansos y viajes,
   * donde pasan horas pero no hay decisiones intermedias.
   *
   * @param {number} minutos
   * @param {string} [motivo='transcurso']
   */
  avanzarTiempo(minutos, motivo = 'transcurso') {
    this.despachar('clock/avanzar', { minutos, motivo });
  }

  /**
   * Minutos que consume cada tipo de turno.
   * @param {string} tipo
   * @returns {number}
   * @private
   */
  _minutosPorTipo(tipo) {
    const t = MUNDO.tiempo;
    switch (tipo) {
      case 'combate': return t.minutosPorRonda;
      case 'descanso': return t.minutosDescansoCorto;
      case 'viaje': return t.minutosPorTurno * 6;
      default: return t.minutosPorTurno;
    }
  }

  /* ─────────────────────────────────────────────────────────────────────────
     REDUCTORES
     ───────────────────────────────────────────────────────────────────────── */

  /**
   * Avanza el reloj del mundo y, de paso, el contador de turnos.
   * @param {Object} estado
   * @param {{payload: {minutos: number, turno?: number}}} accion
   * @returns {Object|null} Parche.
   * @private
   */
  _reducirAvanzar(estado, accion) {
    const { minutos = 0, turno } = accion.payload ?? {};
    if (minutos <= 0 && turno === undefined) return null;

    const t = estado.world.tiempo;
    const cfg = MUNDO.tiempo;

    let totalMinutos = t.minuto + minutos;
    let hora = t.hora + Math.floor(totalMinutos / 60);
    const minuto = ((totalMinutos % 60) + 60) % 60;

    let dia = t.dia;
    let diasTotales = t.diasTotales;

    const diasSumados = Math.floor(hora / cfg.horasPorDia);
    if (diasSumados > 0) {
      hora = hora % cfg.horasPorDia;
      dia += diasSumados;
      diasTotales += diasSumados;
    }

    // La estación se deriva siempre del día absoluto, con la regla única
    // (`world/Calendario.js`): no se arrastra la que hubiera guardada.
    const estacion = Calendario.estacionDe(diasTotales);

    const franja = this.calcularFranja(hora);

    // Los avisos de cambio se emiten fuera del reductor: un reductor debe ser
    // puro. Se aplaza a la microcola para no emitir a mitad de la mutación.
    if (franja !== t.franja) {
      queueMicrotask(() => this.emitir(EVENTOS_RELOJ.FRANJA_CAMBIA, { anterior: t.franja, franja, hora }));
    }
    if (diasSumados > 0) {
      queueMicrotask(() => this.emitir(EVENTOS_RELOJ.DIA_NUEVO, { dia, diasTotales, estacion }));
    }
    if (estacion !== t.estacion) {
      queueMicrotask(() => this.emitir(EVENTOS_RELOJ.ESTACION_CAMBIA, { anterior: t.estacion, estacion }));
    }
    queueMicrotask(() => this.emitir(EVENTOS_RELOJ.TIEMPO_AVANZA, { minutos, hora, minuto, dia, franja }));

    /** @type {Object} */
    const parche = {
      world: { tiempo: { dia, hora, minuto, franja, estacion, diasTotales } },
    };

    if (turno !== undefined) {
      parche.meta = { turno };
      parche.hazanas = { estadisticas: { turnos: turno, diasSobrevividos: diasTotales } };
    }

    return parche;
  }

  /**
   * Fija el tiempo de forma absoluta. Se usa al cargar una partida y en la
   * consola de depuración.
   * @param {Object} estado
   * @param {{payload: Object}} accion
   * @returns {Object|null}
   * @private
   */
  _reducirFijar(estado, accion) {
    const p = accion.payload ?? {};
    const t = estado.world.tiempo;
    const hora = p.hora ?? t.hora;
    let diasTotales = p.diasTotales ?? t.diasTotales;
    // La estación sale del día: pedir una estación (consola de depuración,
    // pruebas) mueve el día a esa estación del mismo año, mismo día dentro de
    // la estación. Antes se guardaba la estación pedida sin tocar el día, y el
    // siguiente cambio de día la deshacía.
    if (p.estacion && p.diasTotales === undefined) {
      const i = Calendario.ESTACIONES_CLAVES.indexOf(p.estacion);
      if (i >= 0) {
        const ano = Math.floor(diasTotales / Calendario.DIAS_POR_ANO);
        diasTotales = ano * Calendario.DIAS_POR_ANO + i * Calendario.DIAS_POR_ESTACION + Calendario.diaDeEstacion(diasTotales);
      }
    }
    return {
      world: {
        tiempo: {
          dia: p.dia ?? t.dia,
          hora,
          minuto: p.minuto ?? t.minuto,
          estacion: Calendario.estacionDe(diasTotales),
          diasTotales,
          franja: this.calcularFranja(hora),
        },
      },
    };
  }

  /* ─────────────────────────────────────────────────────────────────────────
     CONSULTAS
     ───────────────────────────────────────────────────────────────────────── */

  /**
   * Determina la franja del día correspondiente a una hora.
   * @param {number} hora 0-23
   * @returns {string} 'madrugada'|'alba'|'manana'|'mediodia'|'tarde'|'ocaso'|'noche'
   */
  calcularFranja(hora) {
    return Calendario.franjaDe(hora);
  }

  /** @returns {boolean} true entre el ocaso y el alba. */
  esDeNoche() {
    const franja = this.leer('world.tiempo.franja');
    return franja === 'noche' || franja === 'madrugada';
  }

  /**
   * Hora del mundo formateada para la interfaz.
   * @returns {string} 'Día 3 · 21:40'
   */
  formatear() {
    const t = this.leer('world.tiempo');
    const hh = String(t.hora).padStart(2, '0');
    const mm = String(t.minuto).padStart(2, '0');
    return `Día ${t.dia} · ${hh}:${mm}`;
  }

  /**
   * Etiqueta legible de la franja actual, para el reloj de la cabecera.
   * @returns {{texto: string, icono: string}}
   */
  descripcion() {
    const t = this.leer('world.tiempo');
    const nombres = {
      madrugada: 'Madrugada', alba: 'Alba', manana: 'Mañana', mediodia: 'Mediodía',
      tarde: 'Tarde', ocaso: 'Ocaso', noche: 'Noche',
    };
    return {
      texto: `Día ${t.dia} · ${nombres[t.franja] ?? t.franja}`,
      icono: ICONOS_FRANJA[t.franja] ?? ICONOS_FRANJA.mediodia,
    };
  }

  /* ─────────────────────────────────────────────────────────────────────────
     INTERNO
     ───────────────────────────────────────────────────────────────────────── */

  /**
   * Refleja la franja del día en el documento, para que el CSS tiña la
   * interfaz sin que ningún componente intervenga.
   * @param {string} franja
   * @private
   */
  _sincronizarDocumento(franja) {
    if (typeof document === 'undefined' || !franja) return;
    document.documentElement.setAttribute(ATRIBUTOS_DOC.franjaDia, franja);
  }
}

export default Clock;
