/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCANVEIL · progression/StatsTracker.js
 * ---------------------------------------------------------------------------
 * Estadísticas de la crónica.
 *
 * Lleva la cuenta de todo lo que ocurre, y lo hace escuchando los eventos del
 * motor en vez de exigir que cada sistema recuerde apuntar. Esa inversión
 * importa: si el registro dependiera de que cada módulo llame a un contador,
 * el primer módulo que se olvide deja un hueco silencioso.
 *
 * Tres capas de dato:
 *
 *   · CONTADORES — cuántas veces ha pasado algo. La mayoría.
 *   · RÉCORDS — el mejor y el peor. Racha de críticos, golpe más duro.
 *   · RASTROS — listas acotadas. Regiones visitadas, enemigos únicos.
 *
 * Los récords son los que producen las hazañas más interesantes, porque miden
 * momentos y no acumulación. Que alguien gane un combate con un punto de vida
 * dice más de su partida que el número de enemigos derrotados.
 *
 * Dependencias: SystemBase.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { SystemBase } from '../core/SystemBase.js';

/** Eventos publicados. */
export const EVENTOS_STATS = Object.freeze({
  RECORD: 'stats:record',
  HITO: 'stats:milestone',
});

/**
 * Estadísticas iniciales.
 *
 * Declararlas todas de entrada evita que un `undefined` se cuele en una
 * condición de hazaña y la evalúe mal.
 */
export function estadisticasIniciales() {
  return {
    // ─── Tiempo ───────────────────────────────────────────────────────────
    turnos: 0,
    diasJugados: 0,
    msJugados: 0,

    // ─── Combate ──────────────────────────────────────────────────────────
    combates: 0,
    victorias: 0,
    derrotas: 0,
    huidas: 0,
    enemigosDerrotados: 0,
    jefesDerrotados: 0,
    danoInfligido: 0,
    danoRecibido: 0,
    criticos: 0,
    pifias: 0,
    victoriasAlLimite: 0,
    mayorVictoriaEnDesventaja: 0,
    mejorRachaCriticos: 0,
    golpeMasFuerte: 0,

    // ─── Tiradas ──────────────────────────────────────────────────────────
    tiradas: 0,
    tiradasExitosas: 0,
    peorRachaFallos: 0,
    mejorRachaExitos: 0,

    // ─── Mundo ────────────────────────────────────────────────────────────
    lugaresDescubiertos: 0,
    lugaresOcultos: 0,
    regionesVisitadas: [],
    distanciaViajada: 0,
    encuentros: 0,
    conflictosResueltosSinViolencia: 0,

    // ─── Personas ─────────────────────────────────────────────────────────
    personasConocidas: 0,
    personasMuertas: 0,
    promesasHechas: 0,
    promesasCumplidas: 0,
    promesasRotas: 0,
    promesasTardias: 0,

    // ─── Misiones ─────────────────────────────────────────────────────────
    misionesAceptadas: 0,
    misionesCompletadas: 0,
    misionesFallidas: 0,

    // ─── Economía ─────────────────────────────────────────────────────────
    oroGanado: 0,
    oroGastado: 0,
    objetosComprados: 0,
    objetosVendidos: 0,
    objetosEncontrados: 0,
    objetosLegendarios: 0,

    // ─── Supervivencia ────────────────────────────────────────────────────
    descansos: 0,
    salvavidasUsados: 0,
    turnosBienAlimentado: 0,
    turnosHambriento: 0,

    // ─── Progresión ───────────────────────────────────────────────────────
    nivelesGanados: 0,
    xpTotal: 0,
  };
}

export class StatsTracker extends SystemBase {
  static nombre = 'hazanas';
  static dependencias = [];
  static canal = 'engine';

  constructor(contexto) {
    super(contexto);

    /** Racha de críticos del combate en curso. @private */
    this._rachaCriticos = 0;
    /** Racha de fallos consecutivos. @private */
    this._rachaFallos = 0;
    /** Racha de éxitos consecutivos. @private */
    this._rachaExitos = 0;

    /** Momento de inicio de la sesión. @private */
    this._inicioSesion = Date.now();
  }

  /* ═══════════════════════════════════════════════════════════════════════
     CICLO DE VIDA
     ═══════════════════════════════════════════════════════════════════════ */

  alIniciar() {
    this.reductores({
      'hazanas/registrar': this._reducirRegistrar,
      'hazanas/record': this._reducirRecord,
      'hazanas/rastro': this._reducirRastro,
    });

    this._suscribirEventos();
  }

  /**
   * Se engancha a los eventos del motor.
   *
   * Escuchar en vez de exigir que cada sistema apunte: así ningún módulo puede
   * olvidarse de contar algo.
   *
   * @private
   */
  _suscribirEventos() {
    // ─── Combate ────────────────────────────────────────────────────────
    this.escuchar('combat:start', () => this.registrar('combates'));

    this.escuchar('combat:end', ({ resultado, estadisticas }) => {
      this._alTerminarCombate(resultado, estadisticas);
    });

    this.escuchar('combat:enemy:killed', ({ amenaza }) => {
      this.registrar('enemigosDerrotados');
      if (['jefe', 'jefeMayor'].includes(amenaza)) this.registrar('jefesDerrotados');
    });

    this.escuchar('combat:attack', (entrada) => this._alAtacar(entrada));

    // ─── Tiradas ────────────────────────────────────────────────────────
    this.escuchar('rules:roll', (tirada) => this._alTirar(tirada));

    // ─── Mundo ──────────────────────────────────────────────────────────
    this.escuchar('world:discovered', ({ motivo }) => {
      this.registrar('lugaresDescubiertos');
      // Los que solo aparecen buscando merecen su propia cuenta.
      if (motivo === 'exploracion' || motivo === 'registro') {
        this.registrar('lugaresOcultos');
      }
    });

    this.escuchar('world:region:change', ({ region }) => {
      if (region) this.anadirRastro('regionesVisitadas', region);
    });

    this.escuchar('exploration:encounter', () => this.registrar('encuentros'));

    this.escuchar('travel:arrived', () => this.registrar('distanciaViajada'));

    // ─── Personas ───────────────────────────────────────────────────────
    this.escuchar('npc:met', () => this.registrar('personasConocidas'));
    this.escuchar('npc:killed', () => this.registrar('personasMuertas'));

    this.escuchar('npc:commitment', () => this.registrar('promesasHechas'));

    // ─── Misiones ───────────────────────────────────────────────────────
    this.escuchar('quests:accepted', () => this.registrar('misionesAceptadas'));
    this.escuchar('quests:completed', () => this.registrar('misionesCompletadas'));
    this.escuchar('quests:failed', () => this.registrar('misionesFallidas'));

    // ─── Objetos ────────────────────────────────────────────────────────
    this.escuchar('inventory:added', ({ objeto }) => {
      this.registrar('objetosEncontrados');
      if (objeto?.rareza === 'legendario') this.registrar('objetosLegendarios');
    });

    // ─── Progresión ─────────────────────────────────────────────────────
    this.escuchar('player:levelup', () => this.registrar('nivelesGanados'));
    this.escuchar('player:xp', ({ cantidad }) => this.registrar('xpTotal', cantidad));
    // Los nombres estaban mal: el motor emite `player:rested` y `player:saved`.
    // Mismo desajuste que tuvieron `roll`/`tirada` y `player`/`jugador`, con la
    // misma consecuencia silenciosa: los dos contadores se quedaban a cero para
    // siempre y las hazañas que dependen de ellos no se desbloqueaban nunca.
    this.escuchar('player:rested', () => this.registrar('descansos'));
    this.escuchar('player:saved', () => this.registrar('salvavidasUsados'));
  }

  /**
   * Cada turno se actualizan los contadores de tiempo y supervivencia.
   * @param {Object} contexto
   */
  alTurno(contexto) {
    this.registrar('turnos');

    // Sin hambre que muestrear (6-oct-2026): ya no se cuentan turnos bien
    // alimentado ni hambriento.

    // Días de mundo transcurridos.
    const dias = this.leer('world.tiempo.diasTotales', 0);
    this.store.fijar('hazanas.estadisticas.diasJugados', dias);
  }

  /* ═══════════════════════════════════════════════════════════════════════
     REGISTRO
     ═══════════════════════════════════════════════════════════════════════ */

  /**
   * Incrementa un contador.
   *
   * @param {string} clave
   * @param {number} [delta=1]
   */
  registrar(clave, delta = 1) {
    if (!clave || delta === 0) return;
    this.despachar('hazanas/registrar', { clave, delta });
  }

  /**
   * Actualiza un récord si el valor lo supera.
   *
   * @param {string} clave
   * @param {number} valor
   * @returns {boolean} true si es un récord nuevo.
   */
  record(clave, valor) {
    const actual = this.leer(`hazanas.estadisticas.${clave}`, 0);
    if (valor <= actual) return false;

    this.despachar('hazanas/record', { clave, valor });

    this.emitir(EVENTOS_STATS.RECORD, { clave, valor, anterior: actual });
    return true;
  }

  /**
   * Añade un elemento a una lista sin duplicar.
   *
   * @param {string} clave
   * @param {string} valor
   */
  anadirRastro(clave, valor) {
    if (!valor) return;
    this.despachar('hazanas/rastro', { clave, valor });
  }

  /* ═══════════════════════════════════════════════════════════════════════
     MANEJADORES
     ═══════════════════════════════════════════════════════════════════════ */

  /**
   * @param {Object} entrada Entrada del registro de combate.
   * @private
   */
  _alAtacar(entrada) {
    if (!entrada.dano) {
      // Un fallo corta la racha de críticos.
      if (entrada.atacante?.esJugador) this._rachaCriticos = 0;
      return;
    }

    if (entrada.atacante?.esJugador) {
      this.registrar('danoInfligido', entrada.dano.total);
      this.record('golpeMasFuerte', entrada.dano.total);

      if (entrada.resultado === 'critico') {
        this.registrar('criticos');
        this._rachaCriticos++;
        this.record('mejorRachaCriticos', this._rachaCriticos);
      } else {
        this._rachaCriticos = 0;
      }
    }

    if (entrada.objetivo?.esJugador) {
      this.registrar('danoRecibido', entrada.dano.total);
    }
  }

  /**
   * @param {Object} tirada
   * @private
   */
  _alTirar(tirada) {
    this.registrar('tiradas');

    if (tirada.exito) {
      this.registrar('tiradasExitosas');
      this._rachaExitos++;
      this._rachaFallos = 0;
      this.record('mejorRachaExitos', this._rachaExitos);
    } else {
      this._rachaFallos++;
      this._rachaExitos = 0;
      this.record('peorRachaFallos', this._rachaFallos);
    }

    if (tirada.pifia) this.registrar('pifias');
  }

  /**
   * @param {string} resultado
   * @param {Object} estadisticas
   * @private
   */
  _alTerminarCombate(resultado, estadisticas) {
    this._rachaCriticos = 0;

    switch (resultado) {
      case 'victoria': {
        this.registrar('victorias');

        // Ganar al límite es de las cosas que más se recuerdan.
        const vida = this.leer('player.vida.actual', 1);
        if (vida <= 1) this.registrar('victoriasAlLimite');

        // Y ganar en inferioridad numérica, también.
        const enemigos = estadisticas?.enemigosDerrotados ?? 0;
        if (enemigos >= 3) this.record('mayorVictoriaEnDesventaja', enemigos);
        break;
      }

      case 'derrota':
        this.registrar('derrotas');
        break;

      case 'huida':
        this.registrar('huidas');
        break;
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════
     REDUCTORES
     ═══════════════════════════════════════════════════════════════════════ */

  /** @private */
  _reducirRegistrar(estado, accion) {
    const { clave, delta = 1 } = accion.payload ?? {};
    if (!clave) return null;

    const estadisticas = estado.hazanas?.estadisticas ?? {};
    const actual = estadisticas[clave] ?? 0;

    // Solo se acumulan los numéricos: un rastro no se suma.
    if (typeof actual !== 'number') return null;

    return {
      hazanas: {
        estadisticas: { ...estadisticas, [clave]: actual + delta },
      },
    };
  }

  /** @private */
  _reducirRecord(estado, accion) {
    const { clave, valor } = accion.payload ?? {};
    if (!clave) return null;

    const estadisticas = estado.hazanas?.estadisticas ?? {};

    if ((estadisticas[clave] ?? 0) >= valor) return null;

    return {
      hazanas: {
        estadisticas: { ...estadisticas, [clave]: valor },
      },
    };
  }

  /** @private */
  _reducirRastro(estado, accion) {
    const { clave, valor } = accion.payload ?? {};
    if (!clave || !valor) return null;

    const estadisticas = estado.hazanas?.estadisticas ?? {};
    const lista = estadisticas[clave] ?? [];

    if (!Array.isArray(lista) || lista.includes(valor)) return null;

    return {
      hazanas: {
        estadisticas: { ...estadisticas, [clave]: [...lista, valor] },
      },
    };
  }

  /* ═══════════════════════════════════════════════════════════════════════
     CONSULTAS
     ═══════════════════════════════════════════════════════════════════════ */

  /**
   * Todas las estadísticas.
   * @returns {Object}
   */
  todas() {
    return this.leer('hazanas.estadisticas', estadisticasIniciales());
  }

  /**
   * Una estadística concreta.
   * @param {string} clave
   * @returns {number|Array}
   */
  obtener(clave) {
    return this.leer(`hazanas.estadisticas.${clave}`, 0);
  }

  /**
   * Estadísticas derivadas, calculadas al vuelo.
   *
   * No se guardan porque son función de las demás: guardarlas invitaría a que
   * divergieran.
   *
   * @returns {Object}
   */
  derivadas() {
    const s = this.todas();

    return {
      precision: s.tiradas > 0 ? s.tiradasExitosas / s.tiradas : 0,
      tasaVictoria: s.combates > 0 ? s.victorias / s.combates : 0,
      danoPorCombate: s.combates > 0 ? Math.round(s.danoInfligido / s.combates) : 0,
      oroNeto: s.oroGanado - s.oroGastado,
      tasaCumplimiento: s.misionesAceptadas > 0
        ? s.misionesCompletadas / s.misionesAceptadas
        : 0,
      // Cuánto de la partida ha sido violencia. Es la cifra que mejor
      // caracteriza un estilo de juego.
      indiceViolencia: (s.enemigosDerrotados + s.conflictosResueltosSinViolencia) > 0
        ? s.enemigosDerrotados / (s.enemigosDerrotados + s.conflictosResueltosSinViolencia)
        : 0,
    };
  }

  /**
   * Resumen de la crónica, para la pantalla de estadísticas.
   * @returns {Object}
   */
  resumen() {
    const s = this.todas();
    const d = this.derivadas();

    return {
      cronica: {
        turnos: s.turnos,
        dias: s.diasJugados,
        nivel: this.leer('player.nivel', 1),
      },
      combate: {
        combates: s.combates,
        victorias: s.victorias,
        derrotas: s.derrotas,
        huidas: s.huidas,
        enemigos: s.enemigosDerrotados,
        jefes: s.jefesDerrotados,
        tasaVictoria: d.tasaVictoria,
        golpeMasFuerte: s.golpeMasFuerte,
      },
      mundo: {
        lugares: s.lugaresDescubiertos,
        regiones: s.regionesVisitadas.length,
        encuentros: s.encuentros,
      },
      social: {
        personas: s.personasConocidas,
        misiones: s.misionesCompletadas,
        falladas: s.misionesFallidas,
        sinViolencia: s.conflictosResueltosSinViolencia,
      },
      economia: {
        ganado: s.oroGanado,
        gastado: s.oroGastado,
        neto: d.oroNeto,
        objetos: s.objetosEncontrados,
      },
      estilo: {
        indiceViolencia: d.indiceViolencia,
        precision: d.precision,
        etiqueta: this._etiquetaEstilo(d),
      },
    };
  }

  /**
   * Caracteriza el estilo de juego en una palabra.
   *
   * Es un espejo, no un juicio: sirve para que el jugador reconozca su propia
   * partida al verla resumida.
   *
   * @param {Object} d
   * @returns {string}
   * @private
   */
  _etiquetaEstilo(d) {
    const s = this.todas();

    if (s.combates === 0 && s.turnos > 30) return 'contemplativo';
    if (d.indiceViolencia >= 0.85 && s.enemigosDerrotados >= 20) return 'implacable';
    if (d.indiceViolencia <= 0.3 && s.conflictosResueltosSinViolencia >= 5) return 'diplomático';
    if (s.lugaresDescubiertos >= 12) return 'explorador';
    if (s.misionesCompletadas >= 10 && s.misionesFallidas === 0) return 'de fiar';
    if (s.oroGanado >= 800) return 'buscavidas';

    return 'equilibrado';
  }

  /**
   * Contexto de la crónica para el director.
   *
   * Le permite hacer referencias a la trayectoria del personaje: alguien que
   * lleva cuarenta enemigos derrotados no se presenta igual que alguien que no
   * ha desenvainado.
   *
   * @returns {string}
   */
  paraDirector() {
    const s = this.todas();
    const d = this.derivadas();

    if (s.turnos < 10) return '';

    const partes = [];

    if (d.indiceViolencia >= 0.8 && s.enemigosDerrotados >= 15) {
      partes.push('El personaje tiene fama de resolver las cosas por la fuerza.');
    } else if (d.indiceViolencia <= 0.25 && s.conflictosResueltosSinViolencia >= 5) {
      partes.push('El personaje tiene fama de resolver las cosas hablando.');
    }

    if (s.misionesFallidas > 2) {
      partes.push('Ha dejado varios encargos sin cumplir, y eso se sabe.');
    } else if (s.misionesCompletadas >= 8 && s.misionesFallidas === 0) {
      partes.push('Tiene fama de cumplir lo que promete.');
    }

    return partes.join(' ');
  }

  /** @returns {Object} */
  inspeccionar() {
    return { ...this.derivadas(), estilo: this._etiquetaEstilo(this.derivadas()) };
  }
}

export default StatsTracker;
