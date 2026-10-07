/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCANVEIL · progression/Milestones.js
 * ---------------------------------------------------------------------------
 * Hitos narrativos y estructura de la crónica.
 *
 * Una partida larga sin estructura se convierte en una lista de cosas que
 * pasaron. Este sistema le da forma de historia sin imponer una trama: detecta
 * cuándo la crónica ha cambiado de fase y se lo comunica al director.
 *
 * Dos mecanismos distintos:
 *
 *   · CAPÍTULOS — divisiones automáticas por acumulación de sucesos
 *     significativos. No por turnos: veinte turnos de camino tranquilo no son
 *     un capítulo, y tres turnos con un jefe muerto y una traición, sí.
 *
 *   · ARCOS — el tono general de la partida, deducido de lo que el jugador ha
 *     hecho. Cambia despacio y modifica cómo narra el director.
 *
 * El segundo es lo que hace que una partida violenta se sienta distinta de una
 * diplomática más allá de las cifras: el director recibe instrucciones de tono
 * acordes a lo que el personaje se ha vuelto.
 *
 * Dependencias: SystemBase, StatsTracker.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { SystemBase } from '../core/SystemBase.js';

/** Eventos publicados. */
export const EVENTOS_HITO = Object.freeze({
  CAPITULO: 'milestone:chapter',
  ARCO: 'milestone:arc',
  HITO: 'milestone:reached',
});

/* ═══════════════════════════════════════════════════════════════════════════
   PESOS DE SUCESO
   ---------------------------------------------------------------------------
   Cuánto «avanza la historia» cada cosa que pasa. Un capítulo se cierra al
   acumular suficiente peso, no al pasar N turnos.
   ═══════════════════════════════════════════════════════════════════════════ */

export const PESOS = Object.freeze({
  jefeDerrotado: 25,
  misionPrincipalCompletada: 20,
  faccionAliada: 15,
  faccionEnemiga: 15,
  lugarOcultoDescubierto: 12,
  misionCompletada: 8,
  misionFallida: 10,
  personaMuerta: 12,
  regionNueva: 10,
  nivelGanado: 6,
  promesaRota: 10,
  hazanaConseguida: 5,
  objetoLegendario: 12,
  salvavidas: 20,
});

/** Peso acumulado para cerrar un capítulo. */
const UMBRAL_CAPITULO = 70;

/* ═══════════════════════════════════════════════════════════════════════════
   ARCOS NARRATIVOS
   ---------------------------------------------------------------------------
   El tono de la crónica. Se deduce de lo que el jugador ha hecho, y cambia
   cómo narra el director.
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * @typedef {Object} Arco
 * @property {string} clave
 * @property {string} nombre
 * @property {Function} condicion (stats, derivadas) → boolean
 * @property {string} instruccion Lo que se le dice al director.
 * @property {number} prioridad Mayor gana si varios encajan.
 */

/** @type {Arco[]} */
export const ARCOS = Object.freeze([

  {
    clave: 'inicio',
    nombre: 'Los primeros pasos',
    prioridad: 0,
    condicion: (s) => s.turnos < 25,
    instruccion:
      'La crónica está empezando. El personaje es un desconocido y el mundo no le debe nada. ' +
      'Deja que las cosas se abran despacio; no hay prisa por revelar lo grande.',
  },

  {
    clave: 'sangre',
    nombre: 'El camino de sangre',
    prioridad: 3,
    condicion: (s, d) => d.indiceViolencia >= 0.8 && s.enemigosDerrotados >= 20,
    instruccion:
      'El personaje ha dejado un rastro de cadáveres detrás. La gente lo sabe o lo intuye. ' +
      'Que le teman más que le respeten, que las conversaciones sean más cortas y más tensas, ' +
      'y que alguien de vez en cuando le recuerde lo que ha hecho.',
  },

  {
    clave: 'palabra',
    nombre: 'La palabra dada',
    prioridad: 3,
    condicion: (s, d) => s.conflictosResueltosSinViolencia >= 8 && d.indiceViolencia <= 0.3,
    instruccion:
      'El personaje resuelve las cosas hablando y tiene fama de ello. Que la gente acuda a él ' +
      'con problemas en vez de con amenazas, y que los que buscan pelea se lleven una sorpresa ' +
      'cuando no la encuentran.',
  },

  {
    clave: 'proscrito',
    nombre: 'El proscrito',
    prioridad: 4,
    condicion: (s, d, e) => {
      const reputaciones = Object.values(e.factions?.reputacion ?? {});
      return reputaciones.filter((r) => r <= -60).length >= 2;
    },
    instruccion:
      'El personaje tiene enemigos poderosos y pocos sitios donde ser bienvenido. ' +
      'Que se note en las puertas cerradas, en las miradas y en la dificultad para conseguir ' +
      'lo básico. Pero también que haya quien lo respete precisamente por eso.',
  },

  {
    clave: 'nombre',
    nombre: 'Alguien con nombre',
    prioridad: 4,
    condicion: (s, d, e) => {
      const reputaciones = Object.values(e.factions?.reputacion ?? {});
      return reputaciones.filter((r) => r >= 60).length >= 2 && s.misionesCompletadas >= 12;
    },
    instruccion:
      'El personaje ya no es un desconocido: tiene nombre y respaldo. Que la gente lo reconozca, ' +
      'que le pidan cosas más importantes y que las consecuencias de lo que haga sean mayores. ' +
      'Con el nombre viene el peso.',
  },

  {
    clave: 'errante',
    nombre: 'El errante',
    prioridad: 2,
    condicion: (s) => s.lugaresDescubiertos >= 14 && s.misionesCompletadas < 6,
    instruccion:
      'El personaje va de un sitio a otro sin echar raíces ni cumplir encargos. ' +
      'Que se note el desarraigo: la gente lo trata como a un forastero eterno, y él conoce ' +
      'los caminos mejor que a las personas.',
  },

  {
    clave: 'deudor',
    nombre: 'El que debe',
    prioridad: 3,
    condicion: (s) => s.misionesFallidas >= 3 || s.promesasRotas >= 3,
    instruccion:
      'El personaje ha dejado promesas sin cumplir y hay gente que se acuerda. ' +
      'Que aparezcan las consecuencias: alguien que le reclama, una puerta que se cierra, ' +
      'una reputación que le precede y no le favorece.',
  },

  {
    clave: 'veterano',
    nombre: 'El veterano',
    prioridad: 1,
    condicion: (s, d, e) => (e.player?.nivel ?? 1) >= 8 && s.turnos >= 120,
    instruccion:
      'El personaje lleva mucho camino a la espalda y se le nota. Que las amenazas menores ' +
      'ya no le impresionen, y que el mundo le plantee cosas a su altura. ' +
      'También que arrastre cansancio: no todo es victoria.',
  },
]);

/* ═══════════════════════════════════════════════════════════════════════════
   SISTEMA
   ═══════════════════════════════════════════════════════════════════════════ */

export class Milestones extends SystemBase {
  static nombre = 'milestones';
  static dependencias = ['hazanas'];
  static canal = 'engine';

  constructor(contexto) {
    super(contexto);

    /** Peso acumulado desde el último capítulo. @private */
    this._peso = 0;

    /** Arco vigente. @private */
    this._arco = 'inicio';

    /** Sucesos del capítulo en curso, para su resumen. @private */
    this._sucesos = [];
  }

  /* ═══════════════════════════════════════════════════════════════════════
     CICLO DE VIDA
     ═══════════════════════════════════════════════════════════════════════ */

  alIniciar() {
    this.reductores({
      'milestones/capitulo': this._reducirCapitulo,
      'milestones/arco': this._reducirArco,
    });

    this._suscribirSucesos();
  }

  /**
   * Se engancha a los sucesos que hacen avanzar la historia.
   * @private
   */
  _suscribirSucesos() {
    const mapa = [
      ['combat:enemy:killed', (d) => (['jefe', 'jefeMayor'].includes(d.amenaza)
        ? { peso: 'jefeDerrotado', texto: `derrotó a ${d.nombre}` }
        : null)],

      ['quests:completed', (d) => ({
        peso: d.tipo === 'principal' ? 'misionPrincipalCompletada' : 'misionCompletada',
        texto: `completó «${d.titulo}»`,
      })],

      ['quests:failed', (d) => ({ peso: 'misionFallida', texto: `falló «${d.titulo}»` })],

      ['faction:level:change', (d) => {
        if (d.nuevo === 'aliado' || d.nuevo === 'venerado') {
          return { peso: 'faccionAliada', texto: `se ganó a ${d.nombre}` };
        }
        if (d.nuevo === 'hostil' || d.nuevo === 'odiado') {
          return { peso: 'faccionEnemiga', texto: `se enemistó con ${d.nombre}` };
        }
        return null;
      }],

      ['world:discovered', (d) => (['exploracion', 'registro'].includes(d.motivo)
        ? { peso: 'lugarOcultoDescubierto', texto: `descubrió ${d.nombre}` }
        : null)],

      ['world:region:change', (d) => ({ peso: 'regionNueva', texto: 'entró en una región nueva' })],

      ['npc:killed', (d) => ({ peso: 'personaMuerta', texto: `${d.nombre} murió` })],

      // Lo heredado no es un hito jugado: se cuenta como lo que es.
      ['player:levelup', (d) => ({ peso: 'nivelGanado', texto: d.legado ? `empezó en el nivel ${d.nivel} con lo heredado${d.legado.nombreOrigen ? ` de ${d.legado.nombreOrigen}` : ''}` : `alcanzó el nivel ${d.nivel}` })],

      ['player:lifesaver', () => ({ peso: 'salvavidas', texto: 'estuvo a punto de morir' })],

      ['achievement:unlocked', (d) => ({ peso: 'hazanaConseguida', texto: null })],
    ];

    for (const [evento, traductor] of mapa) {
      this.escuchar(evento, (datos) => {
        const r = traductor(datos ?? {});
        if (r) this.registrar(r.peso, r.texto);
      });
    }
  }

  /**
   * Cada turno se revisa si el arco ha cambiado.
   *
   * El arco cambia despacio a propósito: comprobarlo cada turno pero con
   * histéresis evita que oscile entre dos estados por un enemigo de más.
   *
   * @param {Object} contexto
   */
  alTurno(contexto) {
    if (contexto.turno % 10 !== 0) return;
    this._revisarArco();
  }

  /* ═══════════════════════════════════════════════════════════════════════
     CAPÍTULOS
     ═══════════════════════════════════════════════════════════════════════ */

  /**
   * Registra un suceso significativo.
   *
   * @param {string} clavePeso
   * @param {string} [texto] Descripción para el resumen del capítulo.
   */
  registrar(clavePeso, texto) {
    const peso = PESOS[clavePeso] ?? 0;
    if (peso === 0) return;

    this._peso += peso;

    if (texto) {
      this._sucesos.push(texto);
      // Se acota: un capítulo con veinte líneas de resumen no es un resumen.
      if (this._sucesos.length > 8) this._sucesos.shift();
    }

    this.emitir(EVENTOS_HITO.HITO, { tipo: clavePeso, peso, acumulado: this._peso });

    if (this._peso >= UMBRAL_CAPITULO) this._cerrarCapitulo();
  }

  /**
   * Cierra el capítulo en curso y abre el siguiente.
   * @private
   */
  _cerrarCapitulo() {
    const numero = this.leer('meta.capitulo', 1);
    const sucesos = [...this._sucesos];

    this._peso = 0;
    this._sucesos = [];

    this.despachar('milestones/capitulo', { numero: numero + 1 });

    this.emitir(EVENTOS_HITO.CAPITULO, {
      cerrado: numero,
      abierto: numero + 1,
      sucesos,
    });

    // El corte de capítulo es un buen momento para que la narración respire.
    this.emitir('narrative:sceneBreak', { motivo: 'capitulo' });

    // Y para que el director resuma: forzar el resumen aquí y no cada N turnos
    // hace que los resúmenes coincidan con divisiones narrativas reales.
    this.emitir('memory:summarize', {
      motivo: `fin del capítulo ${numero}`,
      sucesos,
    });

    this.emitir('ui:notice', {
      mensaje: `Fin del capítulo ${numero}`,
      tipo: 'info',
      icono: 'pergamino',
    });

    this.log.info(`capítulo ${numero} cerrado`, sucesos);
  }

  /* ═══════════════════════════════════════════════════════════════════════
     ARCOS
     ═══════════════════════════════════════════════════════════════════════ */

  /**
   * Revisa si el arco narrativo ha cambiado.
   * @private
   */
  _revisarArco() {
    const stats = this.sistema('hazanas');
    if (!stats) return;

    const todas = stats.todas();
    const derivadas = stats.derivadas();
    const estado = { player: this.leer('player'), factions: this.leer('factions') };

    // Se evalúan todos y gana el de mayor prioridad que encaje.
    const candidatos = ARCOS
      .filter((a) => {
        try {
          return Boolean(a.condicion(todas, derivadas, estado));
        } catch {
          return false;
        }
      })
      .sort((a, b) => b.prioridad - a.prioridad);

    const nuevo = candidatos[0]?.clave ?? 'inicio';

    if (nuevo === this._arco) return;

    const anterior = this._arco;
    this._arco = nuevo;

    this.despachar('milestones/arco', { arco: nuevo });

    const datos = ARCOS.find((a) => a.clave === nuevo);

    this.emitir(EVENTOS_HITO.ARCO, {
      anterior,
      nuevo,
      nombre: datos?.nombre,
    });

    this.log.info(`arco narrativo: ${anterior} → ${nuevo}`);

    // El cambio de arco se recuerda: es un hecho sobre quién se ha vuelto el
    // personaje, no un ajuste técnico.
    if (datos && anterior !== 'inicio') {
      this.emitir('memory:remember', {
        texto: `La crónica ha entrado en una fase distinta: ${datos.nombre.toLowerCase()}.`,
        peso: 3,
      });
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════
     REDUCTORES
     ═══════════════════════════════════════════════════════════════════════ */

  /** @private */
  _reducirCapitulo(estado, accion) {
    const { numero } = accion.payload ?? {};
    if (!numero) return null;

    return { meta: { capitulo: numero } };
  }

  /** @private */
  _reducirArco(estado, accion) {
    const { arco } = accion.payload ?? {};
    if (!arco) return null;

    return { meta: { arco } };
  }

  /* ═══════════════════════════════════════════════════════════════════════
     CONSULTAS
     ═══════════════════════════════════════════════════════════════════════ */

  /** @returns {string} Clave del arco vigente. */
  get arco() {
    return this._arco;
  }

  /** @returns {number} Capítulo en curso. */
  get capitulo() {
    return this.leer('meta.capitulo', 1);
  }

  /**
   * Progreso hacia el próximo corte de capítulo.
   * @returns {{peso: number, umbral: number, fraccion: number}}
   */
  progresoCapitulo() {
    return {
      peso: this._peso,
      umbral: UMBRAL_CAPITULO,
      fraccion: Math.min(1, this._peso / UMBRAL_CAPITULO),
    };
  }

  /**
   * Instrucción de tono para el director.
   *
   * Es la salida principal de este sistema. Va al contexto de cada turno y hace
   * que una partida violenta se narre distinto de una diplomática, más allá de
   * las cifras.
   *
   * @returns {string}
   */
  paraDirector() {
    const datos = ARCOS.find((a) => a.clave === this._arco);
    if (!datos) return '';

    const partes = [`TONO DE LA CRÓNICA — ${datos.nombre}:`, datos.instruccion];

    // El capítulo da contexto de escala.
    const capitulo = this.capitulo;
    if (capitulo > 1) {
      partes.push(`Va por el capítulo ${capitulo} de su historia.`);
    }

    return partes.join(' ');
  }

  /**
   * Datos para la interfaz.
   * @returns {Object}
   */
  paraInterfaz() {
    const datos = ARCOS.find((a) => a.clave === this._arco);

    return {
      capitulo: this.capitulo,
      arco: this._arco,
      nombreArco: datos?.nombre ?? 'Los primeros pasos',
      progreso: this.progresoCapitulo(),
      sucesosRecientes: [...this._sucesos],
    };
  }

  /* ═══════════════════════════════════════════════════════════════════════
     PERSISTENCIA
     ═══════════════════════════════════════════════════════════════════════ */

  /** @returns {Object} */
  serializar() {
    return { peso: this._peso, arco: this._arco, sucesos: this._sucesos };
  }

  /** @param {Object} datos */
  restaurar(datos) {
    this._peso = datos?.peso ?? 0;
    this._arco = datos?.arco ?? 'inicio';
    this._sucesos = datos?.sucesos ?? [];
  }

  /** @returns {Object} */
  inspeccionar() {
    return {
      capitulo: this.capitulo,
      arco: this._arco,
      peso: `${this._peso}/${UMBRAL_CAPITULO}`,
      sucesos: this._sucesos,
    };
  }
}

export default Milestones;
