/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCANVEIL · world/WeatherSystem.js
 * ---------------------------------------------------------------------------
 * Clima con inercia.
 *
 * El clima NO se sortea cada turno. Cada estado tiene una duración mínima y una
 * máxima, y las transiciones solo ocurren entre estados vecinos: de despejado no
 * se pasa a ventisca sin cruzar por nublado y nieve.
 *
 * Esa inercia es la diferencia entre un clima creíble y un generador de ruido.
 * Sin ella, el jugador aprende a ignorar el clima porque cambia demasiado rápido
 * para planificar.
 *
 * El clima tiene consecuencias reales: la niebla penaliza percepción y favorece
 * el sigilo, la ventisca impide viajar y la tormenta apaga las antorchas.
 *
 * Dependencias: SystemBase, locations.data, narrative.templates.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { SystemBase } from '../core/SystemBase.js';
import { obtenerLugar, obtenerRegion } from '../data/locations.data.js';
import { CLIMA as PLANTILLAS } from '../data/narrative.templates.js';

/** Eventos publicados. */
export const EVENTOS_CLIMA = Object.freeze({
  CAMBIO: 'world:weather:change',
  EXTREMO: 'world:weather:extreme',
});

/* ═══════════════════════════════════════════════════════════════════════════
   ESTADOS DE CLIMA
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * @typedef {Object} EstadoClima
 * @property {string} clave
 * @property {string} nombre
 * @property {number} minHoras Duración mínima.
 * @property {number} maxHoras Duración máxima.
 * @property {string[]} transiciones A qué estados puede pasar.
 * @property {Object} efectos
 * @property {boolean} [extremo] Si merece aviso destacado.
 */

/** @type {Record<string, EstadoClima>} */
export const CLIMAS = Object.freeze({
  despejado: {
    clave: 'despejado', nombre: 'despejado',
    minHoras: 6, maxHoras: 48,
    transiciones: ['nublado', 'calorSofocante'],
    efectos: {},
  },

  nublado: {
    clave: 'nublado', nombre: 'nublado',
    minHoras: 4, maxHoras: 36,
    transiciones: ['despejado', 'lluvia', 'niebla', 'nieve'],
    efectos: { visibilidad: -1 },
  },

  lluvia: {
    clave: 'lluvia', nombre: 'lluvioso',
    minHoras: 3, maxHoras: 18,
    transiciones: ['nublado', 'tormenta', 'niebla'],
    efectos: {
      percepcion: -1, sigilo: 1, visibilidad: -2,
      apagaFuego: true, ralentizaViaje: 1.2,
    },
  },

  tormenta: {
    clave: 'tormenta', nombre: 'de tormenta',
    minHoras: 2, maxHoras: 8,
    transiciones: ['lluvia', 'nublado'],
    efectos: {
      percepcion: -3, sigilo: 2, atletismo: -2, visibilidad: -3,
      apagaFuego: true, ralentizaViaje: 1.6, peligroRutas: 1,
    },
    extremo: true,
  },

  niebla: {
    clave: 'niebla', nombre: 'con niebla',
    minHoras: 3, maxHoras: 14,
    transiciones: ['nublado', 'despejado', 'lluvia'],
    efectos: {
      percepcion: -4, sigilo: 3, visibilidad: -4,
      ralentizaViaje: 1.4, encuentrosSorpresa: 1.5,
    },
  },

  nieve: {
    clave: 'nieve', nombre: 'nevado',
    minHoras: 4, maxHoras: 24,
    transiciones: ['nublado', 'ventisca', 'despejado'],
    efectos: {
      percepcion: -2, atletismo: -1, supervivencia: -1,
      ralentizaViaje: 1.5, consumoRaciones: 1.2, rastroVisible: true,
    },
  },

  ventisca: {
    clave: 'ventisca', nombre: 'de ventisca',
    minHoras: 2, maxHoras: 10,
    transiciones: ['nieve', 'nublado'],
    efectos: {
      percepcion: -5, atletismo: -3, supervivencia: -2,
      impideViaje: true, apagaFuego: true, peligroRutas: 2,
    },
    extremo: true,
  },

  calorSofocante: {
    clave: 'calorSofocante', nombre: 'sofocante',
    minHoras: 4, maxHoras: 20,
    transiciones: ['despejado', 'tormenta'],
    efectos: {
      resistencia: -2, atletismo: -2,
      consumoAgua: 1.8, ralentizaViaje: 1.2,
    },
    extremo: true,
  },
});

/* ═══════════════════════════════════════════════════════════════════════════
   PESOS POR TERRENO
   ---------------------------------------------------------------------------
   No todos los climas son igual de probables en todas partes: no nieva en el
   desierto y la niebla del pantano es casi permanente.
   ═══════════════════════════════════════════════════════════════════════════ */

export const PESOS_TERRENO = Object.freeze({
  camino: { despejado: 40, nublado: 25, lluvia: 15, niebla: 8, tormenta: 5, nieve: 5, ventisca: 1, calorSofocante: 1 },
  bosque: { despejado: 30, nublado: 30, lluvia: 20, niebla: 12, tormenta: 5, nieve: 3 },
  montana: { despejado: 25, nublado: 25, lluvia: 10, niebla: 10, tormenta: 8, nieve: 15, ventisca: 7 },
  pantano: { nublado: 30, niebla: 35, lluvia: 20, despejado: 10, tormenta: 5 },
  desierto: { despejado: 45, calorSofocante: 35, nublado: 12, tormenta: 8 },
  ruinas: { despejado: 35, nublado: 30, lluvia: 15, niebla: 15, tormenta: 5 },
  ciudad: { despejado: 40, nublado: 28, lluvia: 18, niebla: 8, tormenta: 6 },
  // Bajo tierra no hay clima, pero se mantiene el estado del exterior.
  mazmorra: { despejado: 100 },
  oceano: { nublado: 30, despejado: 25, lluvia: 20, tormenta: 15, niebla: 10 },
});

export class WeatherSystem extends SystemBase {
  static nombre = 'weather';
  static dependencias = ['clock'];
  static canal = 'world';

  constructor(contexto) {
    super(contexto);

    /** Hora del mundo en que empezó el clima actual. @private */
    this._inicioClima = 0;

    /** Duración prevista del clima actual. @private */
    this._duracionPrevista = 12;
  }

  /* ═══════════════════════════════════════════════════════════════════════
     CICLO DE VIDA
     ═══════════════════════════════════════════════════════════════════════ */

  alIniciar() {
    this.reductores({
      'world/clima': this._reducirClima,
    });

    // Se comprueba al avanzar el tiempo si toca cambiar.
    //
    // Escuchaba `clock:hour:new`, un evento que el reloj NO emite y que ni
    // siquiera figura en `EVENTOS_RELOJ`. Con eso, `_revisar()` no se llamaba
    // jamás: el clima salía al arrancar la partida y solo cambiaba al viajar a
    // otro terreno. Cuarenta turnos en el mismo sitio, tres días de reloj, y
    // el mismo cielo.
    //
    // `clock:time:advance` salta más de una vez por turno, y da igual: la
    // inercia de `_revisar` decide si toca cambio y dos llamadas seguidas sin
    // que el reloj avance no hacen nada.
    this.escuchar('clock:time:advance', () => this._revisar());

    // Cambiar de terreno puede forzar un clima distinto: entrar en el pantano
    // desde el valle debería traer niebla.
    this.escuchar('world:arrived', () => this._alCambiarTerreno());
  }

  alArrancar() {
    // Si no hay clima guardado, se elige uno coherente con el terreno.
    if (!this.leer('world.clima.actual')) {
      this._fijar(this._elegirInicial(), { silencioso: true });
    }

    this._inicioClima = this._horasTotales();
  }

  /**
   * Horas de mundo transcurridas desde el principio de la partida.
   *
   * Aquí se leía `world.tiempo.horasTotales`, que NO existe: el estado del
   * mundo guarda `dia, hora, minuto, franja, estacion, diasTotales` y ningún
   * reductor escribe nunca esa clave. El valor por defecto era 0, así que la
   * resta de abajo daba siempre 0, siempre menor que el mínimo de inercia, y
   * el clima no cambiaba aunque el evento hubiera llegado. Eran dos fallos
   * apilados sobre el mismo mecanismo.
   *
   * Se deriva de lo que sí hay. No hace falta guardar nada nuevo.
   *
   * @returns {number}
   * @private
   */
  _horasTotales() {
    const t = this.leer('world.tiempo', {}) ?? {};
    return (Number(t.diasTotales ?? 0) * 24) + Number(t.hora ?? 0);
  }

  /* ═══════════════════════════════════════════════════════════════════════
     TRANSICIONES
     ═══════════════════════════════════════════════════════════════════════ */

  /**
   * Comprueba si toca cambiar el clima.
   *
   * La inercia se implementa aquí: no se cambia antes del mínimo, y a partir
   * del mínimo la probabilidad crece hasta el máximo, donde el cambio es
   * seguro.
   *
   * @private
   */
  _revisar() {
    const actual = CLIMAS[this.leer('world.clima.actual', 'despejado')];
    if (!actual) return;

    const horasTotales = this._horasTotales();
    const transcurridas = horasTotales - this._inicioClima;

    // ─── Duración mínima: no se cambia todavía ──────────────────────────
    if (transcurridas < actual.minHoras) return;

    // ─── Duración máxima: cambio seguro ─────────────────────────────────
    if (transcurridas >= actual.maxHoras) {
      this._transicionar(actual);
      return;
    }

    // ─── Entre el mínimo y el máximo: probabilidad creciente ────────────
    const margen = actual.maxHoras - actual.minHoras;
    const avance = (transcurridas - actual.minHoras) / Math.max(1, margen);

    // Por hora, no de golpe: da una curva suave.
    const probabilidad = avance * 0.25;

    if (this.rng.flujo('mundo').oportunidad(probabilidad)) {
      this._transicionar(actual);
    }
  }

  /**
   * Cambia a un clima vecino.
   *
   * Solo se admiten las transiciones declaradas: de despejado no se pasa a
   * ventisca sin cruzar por nublado y nieve. Es lo que hace el clima verosímil.
   *
   * @param {EstadoClima} actual
   * @private
   */
  _transicionar(actual) {
    const flujo = this.rng.flujo('mundo');
    const terreno = this.leer('world.terreno', 'camino');
    const pesosTerreno = PESOS_TERRENO[terreno] ?? PESOS_TERRENO.camino;

    // Los candidatos son los vecinos que además son plausibles en este terreno.
    const candidatos = actual.transiciones
      .filter((clave) => CLIMAS[clave])
      .map((clave) => ({
        valor: clave,
        peso: (pesosTerreno[clave] ?? 1) * this._factorEstacional(clave),
      }))
      .filter((c) => c.peso > 0);

    if (!candidatos.length) return;

    const nuevo = flujo.elegirPonderado(candidatos);
    if (nuevo) this._fijar(nuevo);
  }

  /**
   * Factor estacional de un clima.
   *
   * La nieve es casi imposible en verano y muy probable en invierno. Sin esto,
   * las estaciones serían decorativas.
   *
   * @param {string} clave
   * @returns {number}
   * @private
   */
  _factorEstacional(clave) {
    const estacion = this.leer('world.tiempo.estacion', 'primavera');

    const factores = {
      primavera: { lluvia: 1.5, nieve: 0.3, ventisca: 0.1, calorSofocante: 0.2 },
      estio: { calorSofocante: 2, tormenta: 1.4, nieve: 0, ventisca: 0 },
      otono: { niebla: 1.8, lluvia: 1.3, nieve: 0.4, calorSofocante: 0.2 },
      invierno: { nieve: 2.5, ventisca: 2, lluvia: 0.5, calorSofocante: 0 },
    };

    return factores[estacion]?.[clave] ?? 1;
  }

  /**
   * Al cambiar de terreno, el clima puede ajustarse.
   *
   * Entrar en el pantano desde el valle debería traer niebla: el clima es local,
   * no global.
   *
   * @private
   */
  _alCambiarTerreno() {
    const terreno = this.leer('world.terreno', 'camino');
    const actual = this.leer('world.clima.actual', 'despejado');

    const pesos = PESOS_TERRENO[terreno] ?? PESOS_TERRENO.camino;

    // Si el clima actual es imposible en el terreno nuevo, se cambia.
    if ((pesos[actual] ?? 0) === 0) {
      this._fijar(this._elegirInicial());
      return;
    }

    // Si es solo improbable, hay una posibilidad de que cambie.
    const peso = pesos[actual] ?? 1;
    if (peso < 10 && this.rng.flujo('mundo').oportunidad(0.4)) {
      this._fijar(this._elegirInicial());
    }
  }

  /**
   * Elige un clima adecuado al terreno actual, sin restricción de transición.
   * @returns {string}
   * @private
   */
  _elegirInicial() {
    const terreno = this.leer('world.terreno', 'camino');
    const pesos = PESOS_TERRENO[terreno] ?? PESOS_TERRENO.camino;

    const candidatos = Object.entries(pesos)
      .map(([clave, peso]) => ({ valor: clave, peso: peso * this._factorEstacional(clave) }))
      .filter((c) => c.peso > 0);

    return this.rng.flujo('mundo').elegirPonderado(candidatos) ?? 'despejado';
  }

  /**
   * Fija un clima y publica el cambio.
   *
   * @param {string} clave
   * @param {Object} [opciones]
   * @private
   */
  _fijar(clave, opciones = {}) {
    const clima = CLIMAS[clave];
    if (!clima) return;

    const anterior = this.leer('world.clima.actual');
    if (anterior === clave) return;

    const flujo = this.rng.flujo('mundo');

    this._inicioClima = this._horasTotales();
    this._duracionPrevista = flujo.entero(clima.minHoras, clima.maxHoras);

    this.despachar('world/clima', {
      clima: clave,
      descripcion: flujo.elegir(PLANTILLAS[clave] ?? [clima.nombre]),
    });

    if (opciones.silencioso) return;

    this.emitir(EVENTOS_CLIMA.CAMBIO, {
      anterior,
      nuevo: clave,
      nombre: clima.nombre,
      efectos: clima.efectos,
    });

    // ─── Narración ──────────────────────────────────────────────────────
    const descripcion = flujo.elegir(PLANTILLAS[clave] ?? [`El tiempo cambia: ${clima.nombre}.`]);

    this.emitir('narrative:direct', { texto: `${descripcion}.`, voz: 'system' });

    // ─── Clima extremo ──────────────────────────────────────────────────
    if (clima.extremo) {
      this.emitir(EVENTOS_CLIMA.EXTREMO, { clima: clave, efectos: clima.efectos });

      if (clima.efectos.impideViaje) {
        this.emitir('ui:notice', {
          mensaje: 'Con esta ventisca no se puede viajar. Hay que esperar a que pase.',
          tipo: 'aviso',
        });
      }
    }

    // El fuego se apaga con lluvia o ventisca.
    if (clima.efectos.apagaFuego) {
      this.emitir('world:fire:out', { motivo: clima.nombre });
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════
     REDUCTOR
     ═══════════════════════════════════════════════════════════════════════ */

  /** @private */
  _reducirClima(estado, accion) {
    const { clima, descripcion } = accion.payload ?? {};
    if (!clima) return null;

    return {
      world: {
        clima: {
          actual: clima,
          descripcion: descripcion ?? null,
          // Mismo cálculo que `_horasTotales`, escrito aquí a mano porque un
          // reductor es una función pura y no ve la instancia del sistema.
          desde: (Number(estado.world?.tiempo?.diasTotales ?? 0) * 24)
            + Number(estado.world?.tiempo?.hora ?? 0),
        },
      },
    };
  }

  /* ═══════════════════════════════════════════════════════════════════════
     CONSULTAS
     ═══════════════════════════════════════════════════════════════════════ */

  /**
   * Clima actual, completo.
   * @returns {EstadoClima}
   */
  actual() {
    return CLIMAS[this.leer('world.clima.actual', 'despejado')] ?? CLIMAS.despejado;
  }

  /**
   * Efectos del clima actual.
   *
   * Bajo tierra el clima exterior no se aplica: en una mazmorra no llueve.
   *
   * @returns {Object}
   */
  efectos() {
    const terreno = this.leer('world.terreno', 'camino');
    if (terreno === 'mazmorra') return {};

    return this.actual().efectos ?? {};
  }

  /**
   * Modificador del clima a una habilidad concreta.
   * @param {string} habilidad
   * @returns {number}
   */
  modificador(habilidad) {
    return this.efectos()[habilidad] ?? 0;
  }

  /**
   * Comprueba si el clima impide viajar.
   * @returns {{impide: boolean, motivo: string|null}}
   */
  impideViaje() {
    const clima = this.actual();

    if (clima.efectos?.impideViaje) {
      return {
        impide: true,
        motivo: `No se puede viajar con este tiempo ${clima.nombre}. Hay que esperar.`,
      };
    }

    return { impide: false, motivo: null };
  }

  /**
   * Multiplicador de duración del viaje por el clima.
   * @returns {number}
   */
  factorViaje() {
    return this.efectos().ralentizaViaje ?? 1;
  }

  /**
   * Fuerza un clima concreto. Solo para depuración y para el director.
   *
   * @param {string} clave
   * @returns {boolean}
   */
  forzar(clave) {
    if (!CLIMAS[clave]) return false;
    this._fijar(clave);
    return true;
  }

  /**
   * Contexto de clima para el director.
   * @returns {string}
   */
  paraDirector() {
    const clima = this.actual();
    const terreno = this.leer('world.terreno', 'camino');

    if (terreno === 'mazmorra') return 'Bajo tierra: el tiempo exterior no llega aquí.';

    const partes = [`Tiempo: ${clima.nombre}.`];

    const descripcion = this.leer('world.clima.descripcion');
    if (descripcion) partes.push(`${descripcion}.`);

    // Los efectos que cambian lo que se puede hacer se declaran explícitos.
    if (clima.efectos.visibilidad <= -3) partes.push('La visibilidad es muy mala.');
    if (clima.efectos.impideViaje) partes.push('Es imposible viajar con este tiempo.');
    if (clima.efectos.apagaFuego) partes.push('No se puede mantener un fuego.');

    return partes.join(' ');
  }

  /** @returns {Object} */
  serializar() {
    return {
      inicioClima: this._inicioClima,
      duracionPrevista: this._duracionPrevista,
    };
  }

  /** @param {Object} datos */
  restaurar(datos) {
    this._inicioClima = datos?.inicioClima ?? 0;
    this._duracionPrevista = datos?.duracionPrevista ?? 12;
  }

  /** @returns {Object} */
  inspeccionar() {
    const horasTotales = this._horasTotales();

    return {
      actual: this.actual().nombre,
      horasEnEsteClima: horasTotales - this._inicioClima,
      duracionPrevista: this._duracionPrevista,
      efectos: this.efectos(),
      transicionesPosibles: this.actual().transiciones,
    };
  }
}

export default WeatherSystem;
