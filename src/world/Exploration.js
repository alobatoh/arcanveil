/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCANVEIL · world/Exploration.js
 * ---------------------------------------------------------------------------
 * Exploración y encuentros.
 *
 * Distingue tres acciones que suelen confundirse:
 *
 *   · EXPLORAR — avanzar mirando. Barato, rápido, poco fructífero.
 *   · REGISTRAR — buscar a fondo en un sitio concreto. Cuesta tiempo y una
 *     prueba, pero es lo único que encuentra lo escondido.
 *   · DESCUBRIR — dar con un lugar nuevo. Consecuencia de lo anterior.
 *
 * La distinción importa porque tres lugares del mapa SOLO aparecen registrando.
 * No salen en ningún rumor ni los menciona nadie. Quien no se moleste en buscar
 * no los verá nunca, y eso hace que buscar tenga sentido.
 *
 * También gestiona la resolución de encuentros, que es donde se cumple la
 * promesa de que hablar vale más que pelear.
 *
 * Dependencias: SystemBase, EncounterTables, MapGraph, Location.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { SystemBase } from '../core/SystemBase.js';
import * as Tablas from './EncounterTables.js';
import * as Mapa from './MapGraph.js';
import { obtenerLugar } from '../data/locations.data.js';
import { MUNDO, ESPERA_RIESGO } from '../config/balance.config.js';

/** Eventos publicados. */
export const EVENTOS_EXPLORACION = Object.freeze({
  ENCUENTRO: 'exploration:encounter',
  RESUELTO: 'exploration:resolved',
  DESCUBRIMIENTO: 'exploration:discovery',
  NADA: 'exploration:nothing',
});

/** Cómo se cuenta cada salida de un encuentro, cuando sale bien. */
const DESENLACE = Object.freeze({
  dialogo: 'Habláis. La tensión se afloja y cada cual sigue a lo suyo.',
  persuasion: 'Te escuchan y acaban cediendo: te dejan seguir tu camino.',
  mediacion: 'Consigues que se calmen los ánimos. Nadie sale perdiendo del todo.',
  soborno: 'Unas monedas cambian de mano y, de pronto, nadie ha visto nada.',
  sumision: 'Te dejas registrar sin protestar. Después de mirarte con desconfianza, te dejan ir.',
  intimidacion: 'Se lo piensan dos veces y se apartan.',
  engano: 'Se lo creen. Por ahora.',
  sigilo: 'Te escurres sin que nadie te vea.',
  huida: 'Pones tierra de por medio. Nadie te sigue.',
  retirada: 'Retrocedes despacio, sin dar la espalda, y te dejan marchar.',
  distraccion: 'La distracción funciona: tienes tu oportunidad y la aprovechas.',
  fuego: 'El fuego los mantiene a raya, y acaban retirándose.',
  ritual: 'Las palabras antiguas surten efecto: aquello se aquieta.',
  ayuda: 'Echas una mano. Te lo agradecen con lo poco que tienen.',
  comercio: 'Hacéis trato.',
  acompanar: 'Os ponéis en marcha juntos.',
  ignorar: 'Sigues tu camino.',
});

export class Exploration extends SystemBase {
  static nombre = 'exploration';
  static dependencias = ['world', 'rules', 'clock'];
  static canal = 'world';

  constructor(contexto) {
    super(contexto);

    /**
     * Encuentro pendiente de resolver.
     * @type {Object|null}
     * @private
     */
    this._encuentro = null;
  }

  /* ═══════════════════════════════════════════════════════════════════════
     CICLO DE VIDA
     ═══════════════════════════════════════════════════════════════════════ */

  alIniciar() {
    this.reductores({
      'exploracion/turno': (estado) => ({
        world: { turnosDesdeEncuentro: (estado.world?.turnosDesdeEncuentro ?? 0) + 1 },
      }),
      'exploracion/encuentro': () => ({ world: { turnosDesdeEncuentro: 0 } }),
    });

    // El viaje delega aquí sus encuentros.
    this.escuchar('exploration:encounter:trigger', ({ encuentro, contexto }) => {
      this._presentar(encuentro, contexto);
    });
  }

  /** Cada turno cuenta para el periodo de gracia entre encuentros. */
  alTurno() {
    this.despachar('exploracion/turno');
  }

  /**
   * ¿Toca un encuentro aleatorio?
   *
   * Es la única puerta por la que pasan los encuentros de explorar y los de
   * viajar. Aplica la intensidad elegida —en Pacífica casi no hay— y el
   * periodo de gracia, que existía en la configuración y no hacía cumplir
   * nadie: podía saltar un encuentro detrás de otro.
   *
   * @param {number} probabilidad La del sitio y el momento, antes de la intensidad.
   * @param {import('../core/RNG.js').Flujo} flujo
   * @returns {boolean}
   */
  tocaEncuentro(probabilidad, flujo) {
    const intensidad = this.leer('settings.dificultad', 'equilibrado');
    const regla = MUNDO.exploracion.porIntensidad[intensidad] ?? MUNDO.exploracion.porIntensidad.equilibrado;

    if (this.leer('world.turnosDesdeEncuentro', 0) < regla.gracia) return false;
    return flujo.oportunidad(Math.min(0.5, probabilidad * regla.factor));
  }

  /* ═══════════════════════════════════════════════════════════════════════
     EXPLORAR
     ═══════════════════════════════════════════════════════════════════════ */

  /**
   * Explorar: avanzar mirando alrededor.
   *
   * Barato en tiempo, poco fructífero. Sube algo el grado de exploración del
   * lugar y puede producir un encuentro.
   *
   * @returns {Promise<Object>}
   */
  async explorar() {
    const refId = this.leer('world.ubicacion');
    const lugar = obtenerLugar(refId);
    const flujo = this.rng.flujo('mundo');

    // ─── Tiempo ─────────────────────────────────────────────────────────
    this.sistema('clock')?.avanzarTiempo(30, 'exploracion');

    // ─── Progreso ───────────────────────────────────────────────────────
    this.despachar('world/explorar', { refId, cantidad: 0.12 });

    // ─── Encuentro ──────────────────────────────────────────────────────
    const peligro = lugar?.peligro ?? 1;
    const efectos = this.sistema('events')?.efectos() ?? {};

    const probabilidad = Math.min(0.35, (peligro + (efectos.peligroRutas ?? 0)) * 0.07);

    if (this.tocaEncuentro(probabilidad, flujo)) {
      const encuentro = this.generarEncuentro({ terreno: lugar?.terreno, peligro });

      if (encuentro) {
        this._presentar(encuentro, { terreno: lugar?.terreno });
        return { tipo: 'encuentro', encuentro };
      }
    }

    // ─── Hallazgo menor ─────────────────────────────────────────────────
    // Explorar sin más rara vez encuentra algo, pero no nunca.
    if (flujo.oportunidad(0.15)) {
      return this._hallazgoMenor(flujo);
    }

    // ─── Nada ───────────────────────────────────────────────────────────
    this.emitir(EVENTOS_EXPLORACION.NADA, { accion: 'explorar' });

    return {
      tipo: 'nada',
      pistaDirector: 'El personaje avanza y observa sin encontrar nada relevante. Describe el entorno, no un hallazgo.',
    };
  }

  /* ═══════════════════════════════════════════════════════════════════════
     REGISTRAR
     ═══════════════════════════════════════════════════════════════════════ */

  /**
   * Registrar: buscar a fondo.
   *
   * Cuesta una hora y requiere una prueba de percepción. Es la única vía para
   * encontrar los lugares ocultos y lo que no está a la vista.
   *
   * @returns {Promise<Object>}
   */
  async registrar() {
    const refId = this.leer('world.ubicacion');
    const lugar = obtenerLugar(refId);
    const flujo = this.rng.flujo('mundo');

    const estado = this.leer(`world.localizaciones.porId.${refId}`);

    // ─── ¿Queda algo? ───────────────────────────────────────────────────
    // Decirlo evita que el jugador pierda tiempo buscando en un sitio agotado.
    if ((estado?.exploracion ?? 0) >= 1) {
      return {
        tipo: 'agotado',
        pistaDirector: 'El personaje ya ha registrado este sitio a fondo. No queda nada por encontrar y él lo sabe.',
      };
    }

    // ─── Tiempo ─────────────────────────────────────────────────────────
    this.sistema('clock')?.avanzarTiempo(60, 'registro');

    // ─── Prueba ─────────────────────────────────────────────────────────
    const rules = this.sistema('rules');

    const tirada = rules.resolver({
      habilidad: 'percepcion',
      umbral: this._umbralRegistro(lugar, estado),
      situacion: 'neutra',
    });

    this.despachar('world/explorar', { refId, cantidad: tirada.exito ? 0.35 : 0.15 });

    if (!tirada.exito) {
      return {
        tipo: 'fallo',
        tirada,
        pistaDirector: 'El personaje busca sin encontrar nada. Que se note el esfuerzo y el tiempo perdido.',
      };
    }

    // ─── Éxito: qué se encuentra ────────────────────────────────────────
    return this._resolverHallazgo(flujo, lugar, estado, tirada);
  }

  /**
   * Umbral de la prueba de registro.
   *
   * Sube conforme el lugar está más explorado: lo fácil ya se encontró.
   *
   * @private
   */
  _umbralRegistro(lugar, estado) {
    const base = 12;
    const yaExplorado = (estado?.exploracion ?? 0) * 8;
    const porPeligro = (lugar?.peligro ?? 0);

    return Math.round(base + yaExplorado + porPeligro);
  }

  /**
   * Decide qué se encuentra al registrar con éxito.
   *
   * Prioridad: lugar oculto > sublugar > gancho > botín. Los lugares son lo más
   * valioso y lo más raro.
   *
   * @private
   */
  _resolverHallazgo(flujo, lugar, estado, tirada) {
    // ─── 1. Lugar oculto ────────────────────────────────────────────────
    const oculto = this._buscarLugarOculto(lugar);

    if (oculto && tirada.margen >= 3) {
      this.despachar('world/descubrir', { refId: oculto.refId, motivo: 'exploracion' });

      this.emitir(EVENTOS_EXPLORACION.DESCUBRIMIENTO, {
        refId: oculto.refId,
        nombre: oculto.nombre,
        motivo: 'exploracion',
      });

      return {
        tipo: 'lugar',
        lugar: oculto.refId,
        tirada,
        pistaDirector: `El personaje encuentra el camino a ${oculto.nombre}. ${oculto.promptLore} Ya está en su mapa.`,
      };
    }

    // ─── 2. Sublugar no visto ───────────────────────────────────────────
    const sublugares = lugar?.sublugares ?? [];
    const vistos = new Set(estado?.sublugaresVistos ?? []);
    const nuevo = sublugares.find((s) => !vistos.has(s.refId));

    if (nuevo) {
      this.despachar('world/sublugar/ver', { refId: lugar.refId, sublugar: nuevo.refId });

      return {
        tipo: 'sublugar',
        sublugar: nuevo.refId,
        tirada,
        pistaDirector: `El personaje encuentra ${nuevo.nombre}. Descríbelo al entrar.`,
      };
    }

    // ─── 3. Gancho del lugar ────────────────────────────────────────────
    const world = this.sistema('world');
    const ganchos = world?.ganchosDisponibles() ?? [];

    if (ganchos.length && flujo.oportunidad(0.5)) {
      const gancho = flujo.elegir(ganchos);
      world?.usarGancho(gancho);

      this.emitir('memory:thread', {
        tipo: 'misterio',
        texto: gancho,
        relacionadoCon: lugar?.refId,
      });

      return {
        tipo: 'gancho',
        gancho,
        tirada,
        pistaDirector: `Registrando, el personaje da con esto: ${gancho}. Preséntalo como un hallazgo concreto, no como un rumor.`,
      };
    }

    // ─── 4. Botín ───────────────────────────────────────────────────────
    return this._hallazgoMenor(flujo, tirada);
  }

  /**
   * Busca un lugar oculto conectado al actual.
   * @private
   */
  _buscarLugarOculto(lugar) {
    const conocidos = new Set(this.leer('world.localizaciones.orden', []));

    const candidatos = (lugar?.conexiones ?? [])
      .map((c) => obtenerLugar(c.hasta))
      .filter((l) => l && !conocidos.has(l.refId))
      .filter((l) => l.descubrimiento === 'exploracion');

    return candidatos[0] ?? null;
  }

  /**
   * Genera un hallazgo pequeño: algo de valor, no gran cosa.
   * @private
   */
  _hallazgoMenor(flujo, tirada = null) {
    const lugar = obtenerLugar(this.leer('world.ubicacion'));

    const botin = this.sistema('inventory');

    // Un poco de oro o un objeto común: suficiente para que buscar no sea
    // nunca del todo inútil.
    if (flujo.oportunidad(0.5)) {
      const oro = flujo.entero(3, 15 + (lugar?.peligro ?? 0) * 5);
      this.despachar('inventory/oro', { delta: oro, motivo: 'hallazgo' });

      return {
        tipo: 'oro',
        cantidad: oro,
        tirada,
        pistaDirector: `El personaje encuentra ${oro} de oro. Que tenga una procedencia verosímil.`,
      };
    }

    return {
      tipo: 'menor',
      tirada,
      pistaDirector: 'El personaje encuentra algo de poco valor pero que encaja con el sitio. Decide tú qué es.',
    };
  }

  /* ═══════════════════════════════════════════════════════════════════════
     ENCUENTROS
     ═══════════════════════════════════════════════════════════════════════ */

  /**
   * Genera un encuentro adecuado al contexto.
   *
   * @param {Object} contexto
   * @returns {Object|null}
   */
  generarEncuentro(contexto) {
    const flujo = this.rng.flujo('mundo');
    return Tablas.elegir(flujo, contexto);
  }

  /**
   * Riesgo de encuentro mientras se espera (decisión del 6-oct-2026: esperar
   * en un sitio peligroso tiene riesgo).
   *
   * Mismo riesgo POR TIEMPO que explorar (la probabilidad de `explorar` es
   * por 30 minutos), repartido según los minutos reales del pulso: un pulso
   * parcial de 5 minutos cuenta 5, no 10, y partir 2 h en pulsos da el mismo
   * riesgo total que 2 h seguidas (1 − (1 − p)^(minutos/30)). Pasa por
   * `tocaEncuentro` (intensidad y gracia de siempre) y por las tablas de
   * siempre: no todo es pelea. Seguro: un asentamiento, un interior, peligro
   * 0. Un campamento no hace seguro un sitio. Con un encuentro o un combate ya
   * en marcha, nada.
   *
   * @param {number} minutos Del pulso.
   * @returns {Object|null} El encuentro, ya presentado, o null.
   */
  riesgoAlEsperar(minutos) {
    if (this._encuentro || this.leer('combat.activo', false)) return null;
    if (!(minutos > 0) || this.leer('world.sublugar')) return null;
    const lugar = obtenerLugar(this.leer('world.ubicacion'));
    const peligro = lugar?.peligro ?? 0;
    if (!lugar || lugar.tipo === 'asentamiento' || peligro <= 0) return null;

    const efectos = this.sistema('events')?.efectos() ?? {};
    const por30 = Math.min(0.35, (peligro + (efectos.peligroRutas ?? 0)) * 0.07) * ESPERA_RIESGO.factor;
    const probabilidad = 1 - (1 - por30) ** (minutos / 30);
    if (!this.tocaEncuentro(probabilidad, this.rng.flujo('mundo'))) return null;

    const encuentro = this.generarEncuentro({ terreno: lugar.terreno, peligro });
    if (!encuentro) return null;
    this._presentar(encuentro, { terreno: lugar.terreno, esperando: true });
    return encuentro;
  }

  /**
   * Presenta un encuentro y espera la reacción del jugador.
   *
   * @param {Object} encuentro
   * @param {Object} [contexto]
   * @private
   */
  _presentar(encuentro, contexto = {}) {
    // Empieza el periodo de gracia hasta el siguiente.
    this.despachar('exploracion/encuentro');

    this._encuentro = {
      ...encuentro,
      contexto,
      turnoInicio: this.leer('meta.turno', 0),
    };

    this.emitir(EVENTOS_EXPLORACION.ENCUENTRO, {
      refId: encuentro.refId,
      nombre: encuentro.nombre,
      familia: encuentro.familia,
      resoluciones: encuentro.resolucionesPosibles,
    });

    this.emitir('narrative:direct', { texto: encuentro.apertura, voz: 'system' });

    // El director recibe el contexto para desarrollarlo.
    this.emitir('memory:context', {
      texto: `ENCUENTRO EN CURSO: ${encuentro.promptDirector} Vías posibles: ${encuentro.resolucionesPosibles.join(', ')}.`,
      temporal: true,
    });
  }

  /**
   * Resuelve el encuentro pendiente según lo que hace el jugador.
   *
   * @param {Object} intencion
   * @returns {Promise<Object>}
   */
  async resolverEncuentro(intencion) {
    if (!this._encuentro) {
      return { resuelto: false, motivo: 'no hay encuentro' };
    }

    const encuentro = this._encuentro;

    // ─── ¿Qué vía intenta? ──────────────────────────────────────────────
    const resolucion = Tablas.resolucionDesdeIntencion(intencion, encuentro);

    if (!resolucion) {
      // Hace otra cosa. Quien tiene motivo y ocasión no se queda quieto (la
      // patrulla que venía a por él le corta el paso); quien no persigue
      // (una criatura en su territorio) le deja ir; lo que no era una
      // amenaza sigue su camino al cabo de un rato.
      encuentro.ignorado = (encuentro.ignorado ?? 0) + 1;
      if (encuentro.familia === 'hostil' && encuentro.persigue !== false && encuentro.combate) {
        return this._escalar(encuentro, 'No les gusta que les ignores: se mueven para cortarte el paso.');
      }
      if (encuentro.familia !== 'hostil' && encuentro.ignorado >= 2) {
        this._encuentro = null;
        return { resuelto: true, resultado: 'ignorado', narracion: 'Lo que tenías delante sigue su camino sin ti.' };
      }
      return {
        resuelto: false,
        motivo: 'via_no_contemplada',
        pistaDirector: 'Lo que intenta el personaje no resuelve la situación. Narra el intento y deja el encuentro abierto.',
      };
    }

    // ─── Combate ────────────────────────────────────────────────────────
    if (resolucion === 'combate') {
      this._encuentro = null;

      if (encuentro.combate) {
        // Si ataca él, golpea primero: la emboscada es suya, salvo que la
        // del encuentro ya fuera de ellos. Pero ya estaban cara a cara: se
        // dice contra quién, no que no le han visto.
        const nombre = String(encuentro.nombre ?? '').toLowerCase();
        this.emitir('combat:request', {
          ...encuentro.combate,
          playerAmbush: !encuentro.combate.ambush,
          teVen: true,
          contra: nombre ? `${/a$/.test(nombre) ? 'la' : 'el'} ${nombre} que tenías delante` : null,
        });
        return { resuelto: true, resultado: 'combate' };
      }

      return {
        resuelto: true,
        resultado: 'sin_combate',
        pistaDirector: 'El personaje ataca, pero no hay contra quién pelear de verdad.',
      };
    }

    // ─── Resolución con prueba ──────────────────────────────────────────
    const requierePrueba = ['intimidacion', 'persuasion', 'engano', 'sigilo', 'huida', 'mediacion'];

    let tirada = null;

    if (requierePrueba.includes(resolucion)) {
      const habilidades = {
        intimidacion: 'intimidacion',
        persuasion: 'trato_social',
        mediacion: 'trato_social',
        engano: 'engano',
        sigilo: 'sigilo',
        huida: 'acrobacias',
      };

      tirada = this.sistema('rules').resolver({
        habilidad: habilidades[resolucion],
        umbral: this._umbralResolucion(encuentro, resolucion),
      });

      if (!tirada.exito) {
        // Fallar una vía no cierra el encuentro: se puede intentar otra cosa.
        // Con los hostiles la tensión sube, pero una conversación que sale
        // mal no es una guerra: hace falta un segundo tropiezo.
        if (encuentro.familia === 'hostil' && encuentro.combate) {
          return { ...this._escalar(encuentro, 'No cuela. Se tensan, y un paso en falso más acabará mal.'), tirada };
        }

        return {
          resuelto: false,
          tirada,
          narracion: 'No sale. Lo que tienes delante sigue ahí, esperando qué haces.',
          pistaDirector: 'El intento falla. El encuentro sigue: el personaje puede probar otra cosa.',
        };
      }
    }

    // ─── Éxito ──────────────────────────────────────────────────────────
    this._encuentro = null;

    const peligro = encuentro.peligro?.[1] ?? 1;
    const xp = Tablas.xpPorResolucion(resolucion, peligro);

    this.despachar('player/xp', { cantidad: xp, motivo: 'encuentro' });

    // Los resueltos sin violencia se cuentan aparte: alimentan las hazañas de
    // estilo y el índice de violencia.
    if (resolucion !== 'combate') {
      this.despachar('hazanas/registrar', { clave: 'conflictosResueltosSinViolencia', delta: 1 });
    }

    this.emitir(EVENTOS_EXPLORACION.RESUELTO, {
      refId: encuentro.refId,
      resolucion,
      xp,
    });

    // Las recompensas declaradas del encuentro.
    this._aplicarRecompensa(encuentro, resolucion);

    return {
      resuelto: true,
      resultado: resolucion,
      tirada,
      xp,
      narracion: DESENLACE[resolucion] ?? 'Funciona: la situación se resuelve sin más.',
      pistaDirector: `El personaje resuelve la situación mediante ${resolucion}. Narra el desenlace.`,
    };
  }

  /**
   * La tensión sube un escalón; al segundo, se acaba la paciencia.
   * @private
   */
  _escalar(encuentro, aviso) {
    encuentro.tension = (encuentro.tension ?? 0) + 1;
    if (encuentro.tension >= 2 && encuentro.combate) {
      this._encuentro = null;
      this.emitir('combat:request', encuentro.combate);
      return { resuelto: true, resultado: 'combate', narracion: 'Se acabó la paciencia.' };
    }
    return {
      resuelto: false,
      tension: encuentro.tension,
      narracion: aviso,
      pistaDirector: `La tensión sube (${encuentro.tension} de 2). Aún hay margen para hablar, ceder, retirarse o pelear; si vuelve a torcerse, habrá pelea.`,
    };
  }

  /**
   * Umbral de una vía de resolución.
   * @private
   */
  _umbralResolucion(encuentro, resolucion) {
    const peligro = encuentro.peligro?.[1] ?? 1;

    // Las vías más ventajosas son más difíciles: resolver hablando un encuentro
    // hostil debe costar más que huir.
    const dificultadExtra = {
      persuasion: 3, mediacion: 3, intimidacion: 2,
      engano: 2, sigilo: 1, huida: 0,
    };

    return 10 + peligro + (dificultadExtra[resolucion] ?? 0);
  }

  /**
   * Aplica la recompensa declarada de un encuentro.
   * @private
   */
  _aplicarRecompensa(encuentro, resolucion) {
    const r = encuentro.recompensa;
    if (!r) return;

    const flujo = this.rng.flujo('botin');

    if (r.botin) {
      this.emitir('world:loot:found', { rareza: r.rareza ?? 'comun' });
    }

    if (r.agua) {
      // Rellenar odres: sin sed que reponer (6-oct-2026); se cuenta sin efecto.
    }

    if (r.descanso) {
      this.emitir('world:rest:available', { seguro: Boolean(r.seguro) });
    }

    if (r.reputacion) {
      const region = this.leer('world.region');
      this.emitir('faction:regional:adjust', { region, cantidad: r.reputacion });
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════
     CONSULTAS
     ═══════════════════════════════════════════════════════════════════════ */

  /** @returns {boolean} */
  get encuentroActivo() {
    return Boolean(this._encuentro);
  }

  /**
   * Encuentro pendiente, para la interfaz.
   * @returns {Object|null}
   */
  encuentroPendiente() {
    if (!this._encuentro) return null;

    return {
      refId: this._encuentro.refId,
      nombre: this._encuentro.nombre,
      familia: this._encuentro.familia,
      resoluciones: this._encuentro.resolucionesPosibles,
    };
  }

  /**
   * Contexto de exploración para el director.
   * @returns {string}
   */
  paraDirector() {
    if (this._encuentro) {
      return `ENCUENTRO SIN RESOLVER: ${this._encuentro.promptDirector}`;
    }

    const refId = this.leer('world.ubicacion');
    const estado = this.leer(`world.localizaciones.porId.${refId}`);

    if ((estado?.exploracion ?? 0) >= 1) {
      return 'El personaje ya ha registrado este lugar a fondo.';
    }

    return '';
  }

  /** @returns {Object} */
  serializar() {
    return { encuentro: this._encuentro };
  }

  /** @param {Object} datos */
  restaurar(datos) {
    this._encuentro = datos?.encuentro ?? null;
  }

  /** @returns {Object} */
  inspeccionar() {
    const refId = this.leer('world.ubicacion');
    const estado = this.leer(`world.localizaciones.porId.${refId}`);

    return {
      encuentroActivo: this.encuentroActivo,
      encuentro: this.encuentroPendiente(),
      exploracionAqui: estado?.exploracion ?? 0,
    };
  }
}

export default Exploration;
