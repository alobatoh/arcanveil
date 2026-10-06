/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCANVEIL · world/Travel.js
 * ---------------------------------------------------------------------------
 * Viaje entre lugares.
 *
 * Viajar no es teletransportarse con una pausa. Consume tiempo real, provisiones
 * reales del inventario, y puede interrumpirse a mitad de camino.
 *
 * Tres decisiones que definen cómo se siente:
 *
 *   · SE AVISA ANTES DE SALIR. Coste en horas, provisiones necesarias y nivel de
 *     peligro. Emprender un viaje sin comida debe ser una decisión, no un
 *     descubrimiento a mitad del páramo.
 *
 *   · SE CONSUME DE VERDAD. Las raciones salen del inventario. Si no las hay, el
 *     hambre sube y las tiradas se resienten.
 *
 *   · SE PUEDE INTERRUMPIR Y REANUDAR. Un encuentro a mitad de ruta no cancela
 *     el viaje: lo pausa. Al resolverlo, se continúa desde el tramo donde se
 *     quedó.
 *
 * Dependencias: SystemBase, MapGraph, locations.data.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { SystemBase } from '../core/SystemBase.js';
import * as Mapa from './MapGraph.js';
import { obtenerLugar } from '../data/locations.data.js';
import { capitalizar, trasPreposicion } from '../utils/text.js';

/** Eventos publicados. */
export const EVENTOS_VIAJE = Object.freeze({
  INICIO: 'travel:start',
  TRAMO: 'travel:leg',
  INTERRUMPIDO: 'travel:interrupted',
  REANUDADO: 'travel:resumed',
  LLEGADA: 'travel:arrived',
  CANCELADO: 'travel:cancelled',
});

export class Travel extends SystemBase {
  static nombre = 'travel';
  static dependencias = ['clock', 'world', 'inventory'];
  static canal = 'world';

  constructor(contexto) {
    super(contexto);

    /**
     * Viaje en curso, o null.
     * @type {Object|null}
     * @private
     */
    this._viaje = null;
  }

  /* ═══════════════════════════════════════════════════════════════════════
     CICLO DE VIDA
     ═══════════════════════════════════════════════════════════════════════ */

  alIniciar() {
    // Un combate interrumpe el viaje; al terminar, se puede reanudar.
    this.escuchar('combat:end', ({ resultado }) => {
      if (resultado === 'victoria' || resultado === 'huida' || resultado === 'acuerdo') {
        this._ofrecerReanudar();
      } else {
        this._cancelar('el combate acabó mal');
      }
    });

    this.escuchar('travel:resume', () => this.reanudar());
    this.escuchar('travel:cancel', () => this._cancelar('decisión del jugador'));
  }

  /* ═══════════════════════════════════════════════════════════════════════
     PLANIFICACIÓN
     ═══════════════════════════════════════════════════════════════════════ */

  /**
   * Planifica un viaje sin emprenderlo.
   *
   * Se muestra al jugador antes de confirmar: debe saber a qué se compromete.
   *
   * @param {string} destino
   * @param {Object} [opciones]
   * @param {string} [opciones.criterio]
   * @returns {Object}
   */
  planificar(destino, opciones = {}) {
    const origen = this.leer('world.ubicacion');

    const conocidos = new Set(
      Object.entries(this.leer('world.localizaciones.porId', {}))
        .filter(([, l]) => !l.intuido)
        .map(([refId]) => refId),
    );

    const estacion = this.leer('world.tiempo.estacion');
    const efectosEventos = this.sistema('events')?.efectos() ?? {};

    const ruta = Mapa.ruta(origen, destino, {
      criterio: opciones.criterio ?? Mapa.CRITERIO.DISTANCIA,
      conocidos,
      estacion,
      efectosEventos,
    });

    if (!ruta.encontrada) {
      return { viable: false, motivo: ruta.motivo, ruta: null };
    }

    // ─── Clima ──────────────────────────────────────────────────────────
    const clima = this.sistema('weather');
    const impedimento = clima?.impideViaje() ?? { impide: false };

    if (impedimento.impide) {
      return { viable: false, motivo: impedimento.motivo, ruta };
    }

    // Sin provisiones obligatorias (6-oct-2026): el hambre y la sed no son
    // presión de supervivencia, así que el plan ya no cuenta raciones ni agua.

    // ─── Duración con el clima ──────────────────────────────────────────
    const factorClima = clima?.factorViaje() ?? 1;
    const horas = Math.round(ruta.tiempoTotal * factorClima);

    // ─── Luz disponible ─────────────────────────────────────────────────
    const time = this.sistema('time');
    const horasLuz = time?.horasDeLuz() ?? 12;

    return {
      viable: true,
      motivo: null,
      ruta,
      horas,
      llegaDeNoche: horas > horasLuz,
      peligro: ruta.peligroMaximo + (efectosEventos.peligroRutas ?? 0),
      descripcion: Mapa.describir(ruta),
    };
  }

  /**
   * Alternativas de ruta a un destino.
   * @param {string} destino
   * @returns {Array<Object>}
   */
  alternativas(destino) {
    const origen = this.leer('world.ubicacion');

    const conocidos = new Set(Object.keys(this.leer('world.localizaciones.porId', {})));

    return Mapa.alternativas(origen, destino, {
      conocidos,
      estacion: this.leer('world.tiempo.estacion'),
      efectosEventos: this.sistema('events')?.efectos() ?? {},
    });
  }

  /* ═══════════════════════════════════════════════════════════════════════
     EJECUCIÓN
     ═══════════════════════════════════════════════════════════════════════ */

  /**
   * Emprende un viaje.
   *
   * @param {string} destino
   * @param {Object} [opciones]
   * @param {boolean} [opciones.forzar=false] Salir sin provisiones suficientes.
   * @returns {Promise<{exito: boolean, motivo: string|null}>}
   */
  async viajar(destino, opciones = {}) {
    if (this._viaje) {
      return { exito: false, motivo: 'Ya estás en camino.' };
    }

    const plan = this.planificar(destino, opciones);

    if (!plan.viable) {
      this.emitir('narrative:direct', { texto: plan.motivo, voz: 'system' });
      return { exito: false, motivo: plan.motivo };
    }

    // Sin provisiones obligatorias (6-oct-2026): no se pide confirmación por
    // salir sin raciones ni agua.

    // ─── Se inicia ──────────────────────────────────────────────────────
    this._viaje = {
      origen: plan.ruta.ruta[0],
      destino,
      tramos: plan.ruta.tramos,
      tramoActual: 0,
      horasTotales: plan.horas,
      horasRecorridas: 0,
      provisionesConsumidas: { raciones: 0, agua: 0 },
      interrumpido: false,
    };

    this.emitir(EVENTOS_VIAJE.INICIO, {
      destino,
      nombreDestino: obtenerLugar(destino)?.nombre,
      tramos: plan.ruta.tramos.length,
      horas: plan.horas,
    });

    this.emitir('narrative:direct', {
      // «hacia El Camino del Norte. unas 3 horas de camino.»: el artículo del
      // nombre a media frase iba en mayúscula y la descripción, que sale de
      // `Mapa.describir` pensada para ir detrás de una coma, empezaba en
      // minúscula tras el punto.
      texto: `Emprendes el camino ${trasPreposicion('hacia', obtenerLugar(destino)?.nombre)}${this._conQuien()}. ${capitalizar(plan.descripcion)}`,
      voz: 'system',
    });

    return this._recorrer();
  }

  /**
   * « con Grom», « con Grom y Maela», o nada si viaja solo: el grupo va con
   * el personaje a todas partes.
   * @private
   */
  _conQuien() {
    const nombres = (this.sistema('party')?.miembros?.() ?? []).map((m) => m.ficha.nombre);
    if (!nombres.length) return '';
    return ` con ${nombres.length > 1 ? `${nombres.slice(0, -1).join(', ')} y ${nombres.at(-1)}` : nombres[0]}`;
  }

  /**
   * Recorre los tramos pendientes.
   *
   * Cada tramo consume tiempo y provisiones, y puede producir un encuentro. Si
   * lo hace, el viaje se interrumpe y se reanuda después.
   *
   * @returns {Promise<{exito: boolean, motivo: string|null}>}
   * @private
   */
  async _recorrer() {
    if (!this._viaje) return { exito: false, motivo: 'no hay viaje en curso' };

    const flujo = this.rng.flujo('mundo');

    while (this._viaje.tramoActual < this._viaje.tramos.length) {
      const tramo = this._viaje.tramos[this._viaje.tramoActual];

      // ─── Tiempo ───────────────────────────────────────────────────────
      const clima = this.sistema('weather');
      const factor = clima?.factorViaje() ?? 1;
      const horas = tramo.distancia * (Mapa.COSTE_TIPO[tramo.tipo] ?? 1) * factor;

      this.sistema('clock')?.avanzarTiempo(Math.round(horas * 60), 'viaje');
      this._viaje.horasRecorridas += horas;

      this.emitir(EVENTOS_VIAJE.TRAMO, {
        desde: tramo.desde,
        hasta: tramo.hasta,
        nombre: tramo.nombreHasta,
        indice: this._viaje.tramoActual,
        total: this._viaje.tramos.length,
      });

      // ─── Encuentro ────────────────────────────────────────────────────
      const encuentro = this._evaluarEncuentro(tramo, flujo);

      if (encuentro) {
        this._viaje.interrumpido = true;
        this._viaje.tramoActual++;   // El tramo se completó antes del encuentro.

        this.emitir(EVENTOS_VIAJE.INTERRUMPIDO, {
          motivo: 'encuentro',
          tramosPendientes: this._viaje.tramos.length - this._viaje.tramoActual,
        });

        // El sistema de exploración se hace cargo del encuentro.
        this.emitir('exploration:encounter:trigger', {
          encuentro,
          contexto: { enViaje: true, terreno: this._terrenoDe(tramo) },
        });

        return { exito: false, motivo: 'interrumpido', interrumpido: true };
      }

      this._viaje.tramoActual++;
    }

    // ─── Llegada ────────────────────────────────────────────────────────
    return this._llegar();
  }

  /**
   * Decide si un tramo produce un encuentro.
   *
   * @param {Object} tramo
   * @param {import('../core/RNG.js').Flujo} flujo
   * @returns {Object|null}
   * @private
   */
  _evaluarEncuentro(tramo, flujo) {
    const efectos = this.sistema('events')?.efectos() ?? {};

    // La probabilidad base sale del peligro del tramo.
    const peligro = (tramo.peligro ?? 0) + (efectos.peligroRutas ?? 0);
    let probabilidad = peligro * 0.06;

    // La noche y el mal tiempo lo empeoran.
    if (this.sistema('time')?.esDeNoche()) probabilidad *= 1.5;

    const climaEfectos = this.sistema('weather')?.efectos() ?? {};
    if (climaEfectos.encuentrosSorpresa) probabilidad *= climaEfectos.encuentrosSorpresa;
    if (efectos.encuentrosHostiles) probabilidad *= efectos.encuentrosHostiles;

    // La intensidad de la partida y el periodo de gracia se aplican en un
    // solo sitio para explorar y para viajar.
    const exploracion = this.sistema('exploration');
    const toca = exploracion?.tocaEncuentro
      ? exploracion.tocaEncuentro(probabilidad, flujo)
      : flujo.oportunidad(Math.min(probabilidad, 0.5));
    if (!toca) return null;

    // El sistema de encuentros elige cuál.
    return this.sistema('exploration')?.generarEncuentro({
      terreno: this._terrenoDe(tramo),
      peligro,
      enViaje: true,
    }) ?? null;
  }

  /** @private */
  _terrenoDe(tramo) {
    return obtenerLugar(tramo.hasta)?.terreno ?? 'camino';
  }

  /* ═══════════════════════════════════════════════════════════════════════
     LLEGADA Y REANUDACIÓN
     ═══════════════════════════════════════════════════════════════════════ */

  /**
   * Completa el viaje.
   * @returns {{exito: boolean, motivo: null}}
   * @private
   */
  _llegar() {
    const destino = this._viaje.destino;
    const consumidas = this._viaje.provisionesConsumidas;
    const horas = Math.round(this._viaje.horasRecorridas);

    this._viaje = null;

    // El sistema de mundo se encarga del cambio de ubicación.
    this.sistema('world')?.llegarA(destino);

    this.emitir(EVENTOS_VIAJE.LLEGADA, {
      destino,
      nombre: obtenerLugar(destino)?.nombre,
      horas,
      consumidas,
    });

    return { exito: true, motivo: null };
  }

  /**
   * Reanuda un viaje interrumpido.
   * @returns {Promise<Object>}
   */
  async reanudar() {
    if (!this._viaje?.interrumpido) {
      return { exito: false, motivo: 'No hay ningún viaje que reanudar.' };
    }

    // El clima puede haber cambiado durante la interrupción.
    const impedimento = this.sistema('weather')?.impideViaje() ?? { impide: false };

    if (impedimento.impide) {
      this.emitir('narrative:direct', { texto: impedimento.motivo, voz: 'system' });
      return { exito: false, motivo: impedimento.motivo };
    }

    this._viaje.interrumpido = false;

    const pendientes = this._viaje.tramos.length - this._viaje.tramoActual;

    this.emitir(EVENTOS_VIAJE.REANUDADO, { tramosPendientes: pendientes });

    this.emitir('narrative:direct', {
      texto: 'Retomas el camino.',
      voz: 'system',
    });

    return this._recorrer();
  }

  /**
   * Ofrece reanudar tras una interrupción.
   * @private
   */
  _ofrecerReanudar() {
    if (!this._viaje?.interrumpido) return;

    const destino = obtenerLugar(this._viaje.destino)?.nombre;
    const pendientes = this._viaje.tramos.length - this._viaje.tramoActual;

    this.emitir('ui:notice', {
      mensaje: `Tienes el camino a ${destino} a medias: ${pendientes} tramo${pendientes === 1 ? '' : 's'} por delante.`,
      tipo: 'info',
      accion: { etiqueta: 'Continuar', evento: 'travel:resume' },
    });

    // El director lo sabe, para poder mencionarlo.
    this.emitir('memory:context', {
      texto: `El personaje iba camino de ${destino} y se ha detenido. Puede continuar cuando quiera.`,
      temporal: true,
    });
  }

  /**
   * Cancela el viaje en curso.
   * @param {string} motivo
   * @private
   */
  _cancelar(motivo) {
    if (!this._viaje) return;

    const destino = obtenerLugar(this._viaje.destino)?.nombre;
    this._viaje = null;

    this.emitir(EVENTOS_VIAJE.CANCELADO, { motivo });

    this.emitir('narrative:direct', {
      texto: `Abandonas el camino a ${destino}.`,
      voz: 'system',
    });
  }

  /* ═══════════════════════════════════════════════════════════════════════
     CONSULTAS
     ═══════════════════════════════════════════════════════════════════════ */

  /** @returns {boolean} */
  get enViaje() {
    return Boolean(this._viaje);
  }

  /** @returns {boolean} */
  get interrumpido() {
    return Boolean(this._viaje?.interrumpido);
  }

  /**
   * Estado del viaje para la interfaz.
   * @returns {Object|null}
   */
  paraInterfaz() {
    if (!this._viaje) return null;

    return {
      destino: this._viaje.destino,
      nombreDestino: obtenerLugar(this._viaje.destino)?.nombre,
      tramoActual: this._viaje.tramoActual,
      tramosTotales: this._viaje.tramos.length,
      fraccion: this._viaje.tramoActual / Math.max(1, this._viaje.tramos.length),
      interrumpido: this._viaje.interrumpido,
      horasRecorridas: Math.round(this._viaje.horasRecorridas),
    };
  }

  /**
   * Contexto de viaje para el director.
   * @returns {string}
   */
  paraDirector() {
    if (!this._viaje) return '';

    const destino = obtenerLugar(this._viaje.destino)?.nombre;

    if (this._viaje.interrumpido) {
      return `El personaje iba hacia ${destino} y se ha detenido a mitad de camino.`;
    }

    const siguiente = this._viaje.tramos[this._viaje.tramoActual];

    return `El personaje viaja hacia ${destino}${siguiente ? `, ahora por ${siguiente.nombreHasta}` : ''}.`;
  }

  /** @returns {Object} */
  serializar() {
    return { viaje: this._viaje };
  }

  /** @param {Object} datos */
  restaurar(datos) {
    this._viaje = datos?.viaje ?? null;
  }

  /** @returns {Object} */
  inspeccionar() {
    return {
      enViaje: this.enViaje,
      interrumpido: this.interrumpido,
      detalle: this.paraInterfaz(),
    };
  }
}

export default Travel;
