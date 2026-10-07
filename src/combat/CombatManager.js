/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCANVEIL · combat/CombatManager.js
 * ---------------------------------------------------------------------------
 * Orquestador del combate.
 *
 * Coordina todos los módulos anteriores en un bucle de rondas. Su
 * responsabilidad es el ORDEN de las cosas, que en combate importa mucho:
 *
 *   Al empezar el turno de alguien:
 *     1. Efectos periódicos (el veneno actúa ANTES de que pueda moverse)
 *     2. Los jefes intentan sacudirse los estados incapacitantes
 *     3. Revisión de fase
 *     4. ¿Pierde el turno?
 *     5. Acción
 *     6. Salvaciones y decremento de duraciones
 *
 * El paso 1 antes del 4 es deliberado: el veneno puede matarte antes de que
 * llegues a actuar, y eso es coherente.
 *
 * La vida del jugador se sincroniza en ambas direcciones: el combatiente es una
 * proyección, no una copia. Recibir daño en combate baja la vida de verdad.
 *
 * Dependencias: SystemBase y todos los módulos de /combat.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { SystemBase } from '../core/SystemBase.js';
import { BORRAR } from '../core/Store.js';
import * as Comb from './Combatant.js';
import * as Estados from './StatusEffects.js';
import * as Ataques from './AttackResolver.js';
import * as Iniciativa from './InitiativeTracker.js';
import * as IA from './EnemyAI.js';
import * as Jefes from './BossPatterns.js';
import * as Registro from './CombatLog.js';
import { narrarBotin } from './CombatLog.js';
import { buscarPorNombre } from '../data/enemies.data.js';
import { deEnemigo as botinDeEnemigo } from '../inventory/LootGenerator.js';
import { leerJugada } from './Jugada.js';
import { aclararArma } from '../engine/ArmaPedida.js';
import { leerEspera } from '../engine/Espera.js';
import { segmentar } from '../engine/Segmentos.js';
import { curarConTexto } from '../player/Curacion.js';
import * as Comida from '../player/Comida.js';
import { obtenerPlantilla as obtenerPlantillaObjeto } from '../data/items.data.js';
import { obtenerEstado } from '../data/statuses.data.js';
import { concordar } from '../utils/text.js';
import { xpPorEnemigo } from '../player/Progression.js';
import { COMBATE } from '../config/balance.config.js';
import { TIEMPOS } from '../config/app.config.js';

/** Eventos del combate. */
export const EVENTOS_COMBATE = Object.freeze({
  INICIO: 'combat:start',
  RONDA: 'combat:round',
  TURNO: 'combat:turn',
  ATAQUE: 'combat:attack',
  MUERTE: 'combat:enemy:killed',
  FASE: 'combat:boss:phase',
  FIN: 'combat:end',
  ESPERANDO: 'combat:awaiting',
});

export class CombatManager extends SystemBase {
  static nombre = 'combat';
  static dependencias = ['player', 'inventory', 'rules'];
  static canal = 'combat';

  constructor(contexto) {
    super(contexto);

    /** Combatientes por identificador. @private */
    this._combatientes = {};
    /** Registro de la refriega. @private */
    this._registro = [];
    /** Entradas de la ronda en curso, para el director. @private */
    this._rondaActual = [];
    /** Cargas legendarias disponibles. @private */
    this._cargasLegendarias = 0;
    /** Estado del jugador al empezar, para el resumen. @private */
    this._jugadorInicial = null;
    /** true mientras se espera la acción del jugador. @private */
    this._esperando = false;
  }

  /* ═══════════════════════════════════════════════════════════════════════
     CICLO DE VIDA
     ═══════════════════════════════════════════════════════════════════════ */

  alIniciar() {
    this.reductores({
      'combat/iniciar': this._reducirIniciar,
      'combat/actualizar': this._reducirActualizar,
      'combat/turno': this._reducirTurno,
      'combat/terminar': this._reducirTerminar,
    });

    this.escuchar('combat:request', (peticion) => this.empezarCombate(peticion));
    this.escuchar('combat:action', (accion) => this.accionJugador(accion));
  }

  /* ═══════════════════════════════════════════════════════════════════════
     INICIO
     ═══════════════════════════════════════════════════════════════════════ */

  /**
   * Empieza un combate.
   *
   * No se llama `iniciar` porque ese nombre pertenece al ciclo de vida de
   * SystemBase: el Registry lo invoca al arrancar y se llevaría por delante
   * cualquier partida.
   *
   * @param {Object} peticion
   * @param {Array<Object>} peticion.enemies Declaración de enemigos.
   * @param {boolean} [peticion.ambush] Emboscada enemiga.
   * @param {boolean} [peticion.playerAmbush] Emboscada del jugador.
   * @returns {Promise<void>}
   */
  async empezarCombate(peticion) {
    // Una partida terminada no abre peleas (muerte permanente).
    if (this.leer('meta.muerte', null)) return;
    if (this.leer('combat.activo', false)) {
      this.log.aviso('ya hay un combate en curso');
      return;
    }
    CombatManager._contador = (CombatManager._contador ?? 0) + 1;
    this._combateId = `cmb-${Date.now().toString(36)}-${CombatManager._contador}`;
    this._turnoJugador = 0;

    const flujo = this.rng.combate;

    // ─── Enemigos ───────────────────────────────────────────────────────
    const declaracion = this._normalizarEnemigos(peticion.enemies);

    if (!declaracion.length) {
      this.log.aviso('combate solicitado sin enemigos reconocibles');
      return;
    }

    const enemigos = Comb.crearGrupo(declaracion, { flujo });

    if (!enemigos.length) {
      this.log.aviso('no se pudo crear ningún enemigo');
      return;
    }

    // ─── Jugador ────────────────────────────────────────────────────────
    const inventario = this.sistema('inventory');
    const jugador = Comb.desdeJugador(this.leer('player'), inventario?.bonificadores() ?? {});

    this._jugadorInicial = { vida: { ...jugador.vida } };

    // ─── El grupo ───────────────────────────────────────────────────────
    // Los compañeros pelean a su lado; los heridos se quedan atrás hasta que
    // descansen.
    const companeros = (this.sistema('party')?.miembros?.() ?? [])
      .filter((m) => !m.herido)
      .map((m) => Comb.desdeCompanero(m.ficha, m));

    // ─── Iniciativa ─────────────────────────────────────────────────────
    const todos = [jugador, ...companeros, ...enemigos];

    const tirada = Iniciativa.tirarIniciativa(flujo, todos, {
      emboscadaJugador: Boolean(peticion.playerAmbush),
      emboscadaEnemiga: Boolean(peticion.ambush),
    });

    this._combatientes = Object.fromEntries(tirada.combatientes.map((c) => [c.id, c]));
    // Cada combate empieza sin caídos apuntados ni órdenes dadas.
    this._caidos = new Set();
    this._ordenes = {};
    this._registro = [];
    this._rondaActual = [];

    // Los jefes empiezan con sus cargas.
    const jefe = enemigos.find((e) => Jefes.esJefe(e));
    this._cargasLegendarias = jefe ? Jefes.cargasPorRonda(jefe) : 0;

    // ─── Estado ─────────────────────────────────────────────────────────
    this.despachar('combat/iniciar', {
      combatientes: this._combatientes,
      orden: tirada.orden,
      emboscada: peticion.ambush ? 'enemiga' : peticion.playerAmbush ? 'jugador' : null,
    });

    // ─── Narración de apertura ──────────────────────────────────────────
    this.emitir('narrative:direct', {
      texto: Registro.apertura(flujo, enemigos, {
        emboscadaEnemiga: peticion.ambush,
        emboscadaJugador: peticion.playerAmbush,
        teVen: peticion.teVen,
        contra: peticion.contra,
      }),
      voz: 'system',
    });

    if (companeros.length) {
      const nombres = companeros.map((c) => c.nombre);
      const quienes = nombres.length > 1 ? `${nombres.slice(0, -1).join(', ')} y ${nombres.at(-1)}` : nombres[0];
      this.emitir('narrative:direct', {
        texto: `${quienes} ${nombres.length > 1 ? 'se ponen' : 'se pone'} a tu lado.`,
        voz: 'system',
      });
    }

    this.emitir(EVENTOS_COMBATE.INICIO, {
      enemigos: enemigos.map((e) => ({ id: e.id, nombre: e.nombre, amenaza: e.amenaza })),
      iniciativa: tirada.tiradas,
      hayJefe: Boolean(jefe),
    });

    this.log.info(`combate iniciado: ${enemigos.length} enemigos`);

    // ─── Primer turno ───────────────────────────────────────────────────
    // El índice arranca en -1 para que siguienteTurno lo lleve al 0.
    this.despachar('combat/turno', { indice: -1, ronda: 1 });
    await this._avanzar();
  }

  /**
   * Traduce la declaración del director a referencias del bestiario.
   * @private
   */
  _normalizarEnemigos(declaracion) {
    const salida = [];

    for (const entrada of declaracion ?? []) {
      // El director puede dar el refId exacto o un nombre aproximado.
      // `nombre` con `npc` es una persona de la escena: su ficha sale de la
      // plantilla (refId) y conserva su nombre y su referencia.
      const enemigo = buscarPorNombre(entrada.refId ?? entrada.name ?? (entrada.npc ? null : entrada.nombre));

      if (!enemigo) {
        this.log.aviso(`enemigo no reconocido: ${entrada.refId ?? entrada.name}`);
        continue;
      }

      salida.push({
        refId: enemigo.refId,
        count: entrada.npc ? 1 : Math.min(entrada.count ?? 1, COMBATE.enemigosMax),
        level: entrada.level,
        ...(entrada.npc ? { nombre: entrada.nombre, npc: entrada.npc } : {}),
      });
    }

    return salida;
  }

  /* ═══════════════════════════════════════════════════════════════════════
     BUCLE DE TURNOS
     ═══════════════════════════════════════════════════════════════════════ */

  /**
   * Avanza hasta el siguiente turno que requiera decisión del jugador.
   *
   * Los turnos enemigos se encadenan solos con una pausa entre ellos, para que
   * se puedan leer sin pulsar nada.
   *
   * @private
   */
  async _avanzar() {
    // El tope evita un bucle infinito si algo va mal en la lógica de turnos.
    for (let vueltas = 0; vueltas < 200; vueltas++) {
      const estado = this.leer('combat');

      // ─── ¿Ha terminado? ───────────────────────────────────────────────
      const fin = Iniciativa.comprobarFin(this._combatientes);
      if (fin.terminado) {
        await this._terminar(fin.resultado);
        return;
      }

      // ─── Siguiente ────────────────────────────────────────────────────
      const siguiente = Iniciativa.siguienteTurno(estado, this._combatientes);

      if (!siguiente.siguiente) {
        await this._terminar('tablas');
        return;
      }

      const ronda = siguiente.nuevaRonda ? (estado.ronda ?? 1) + 1 : (estado.ronda ?? 1);

      if (siguiente.nuevaRonda) {
        await this._iniciarRonda(ronda);

        // Un límite de rondas evita combates eternos.
        if (ronda > COMBATE.rondasMax) {
          await this._terminar('tablas');
          return;
        }
      }

      this.despachar('combat/turno', { indice: siguiente.indice, ronda });

      const actor = this._combatientes[siguiente.siguiente];
      if (!actor) continue;

      // ─── Inicio del turno del actor ───────────────────────────────────
      const puedeActuar = await this._iniciarTurnoDe(actor, ronda);

      // El actor puede haber caído por daño periódico.
      if (!this._combatientes[actor.id]?.vivo) continue;

      if (!puedeActuar) {
        await this._terminarTurnoDe(this._combatientes[actor.id]);
        continue;
      }

      // ─── Acción ───────────────────────────────────────────────────────
      if (actor.esJugador) {
        // Se cede el control y se espera la acción. Cada turno del jugador
        // lleva su ficha (`turnoToken`): una orden de otro turno, repetida
        // o de otro combate se rechaza antes de tocar nada.
        this._turnoJugador = (this._turnoJugador ?? 0) + 1;
        this._esperando = true;
        this.emitir(EVENTOS_COMBATE.ESPERANDO, {
          ronda,
          acciones: Iniciativa.accionesDisponibles(this._combatientes[actor.id]),
        });
        return;
      }

      if (actor.esCompanero) await this._turnoCompanero(this._combatientes[actor.id], ronda);
      else await this._turnoEnemigo(this._combatientes[actor.id], ronda);
      await this._terminarTurnoDe(this._combatientes[actor.id]);

      // Pausa para que los turnos enemigos se puedan leer.
      await this._pausa(TIEMPOS.pausaTurnoEnemigo);
    }

    this.log.error('el bucle de combate excedió el límite de vueltas');
    await this._terminar('tablas');
  }

  /**
   * Tareas de inicio de ronda.
   * @param {number} ronda
   * @private
   */
  async _iniciarRonda(ronda) {
    // El resumen de la ronda anterior va al director.
    if (this._rondaActual.length) {
      const texto = Registro.paraDirector(this._rondaActual);
      if (texto) this.emitir('memory:context', { texto, temporal: true });
    }

    this._rondaActual = [];

    // Los jefes recuperan cargas legendarias.
    const jefe = Object.values(this._combatientes).find((c) => c.vivo && Jefes.esJefe(c));
    if (jefe) this._cargasLegendarias = Jefes.cargasPorRonda(jefe);

    // Invocaciones periódicas.
    if (jefe?.invoca) {
      const fase = Jefes.faseActual(jefe);
      const decision = IA.decidir(this.rng.combate, {
        actor: jefe,
        combatientes: this._combatientes,
        ronda,
      });

      if (decision.accion === 'invocar') {
        await this._invocar(jefe, Boolean(fase?.invocaExtra));
      }
    }

    this.emitir(EVENTOS_COMBATE.RONDA, { ronda });
  }

  /**
   * Tareas de inicio del turno de un combatiente.
   *
   * @param {Object} actor
   * @param {number} ronda
   * @returns {Promise<boolean>} true si puede actuar.
   * @private
   */
  async _iniciarTurnoDe(actor, ronda) {
    let actual = actor;

    // ─── 1. Efectos periódicos ──────────────────────────────────────────
    // Antes de comprobar si puede actuar: el veneno puede matarlo primero.
    const periodicos = Estados.alIniciarTurno(actual);
    actual = periodicos.combatiente;

    for (const evento of periodicos.eventos) {
      const entrada = Registro.entradaPeriodico(evento, actual, ronda);
      this._anotar(entrada);
    }

    this._guardar(actual);

    if (periodicos.cayo) {
      await this._registrarCaida(actual);
      return false;
    }

    // ─── 2. Los jefes se sacuden los estados ────────────────────────────
    if (Jefes.esJefe(actual)) {
      const sacudida = Jefes.sacudirseEstados(this.rng.combate, actual);
      actual = sacudida.jefe;

      if (sacudida.narracion) {
        this.emitir('narrative:direct', { texto: sacudida.narracion, voz: 'system' });
        this._anotar(Registro.entradaSuceso('liberacion', {
          nombre: actual.nombre,
          estados: sacudida.liberado,
        }, ronda));
      }

      this._guardar(actual);
    }

    // ─── 3. Revisión de fase ────────────────────────────────────────────
    if (Jefes.esJefe(actual)) {
      const revision = Jefes.revisarFase(actual);

      if (revision.cambio) {
        actual = revision.jefe;
        this._guardar(actual);

        this.emitir('narrative:direct', { texto: revision.narracion, voz: 'system' });

        this.emitir(EVENTOS_COMBATE.FASE, {
          jefe: actual.nombre,
          fase: revision.fase.nombre,
          indice: actual.faseActual,
        });

        this._anotar(Registro.entradaSuceso('fase', {
          jefe: actual.nombre,
          narracion: revision.narracion,
        }, ronda));

        await this._pausa(600);
      }
    }

    // ─── 4. ¿Pierde el turno? ───────────────────────────────────────────
    const perdida = Iniciativa.pierdeTurno(actual);

    if (perdida.pierde) {
      this.emitir('narrative:direct', {
        texto: `${actual.nombre} no puede actuar.`,
        voz: 'system',
      });
      return false;
    }

    this.emitir(EVENTOS_COMBATE.TURNO, {
      id: actual.id,
      nombre: actual.nombre,
      esJugador: actual.esJugador,
      ronda,
    });

    return true;
  }

  /**
   * Tareas de fin de turno.
   * @param {Object} actor
   * @private
   */
  async _terminarTurnoDe(actor) {
    if (!actor) return;

    const flujo = this.rng.combate;

    const resultado = Estados.alTerminarTurno(actor, (atributo, umbral) =>
      Ataques.salvacion(flujo, actor, atributo, umbral));

    this._guardar(resultado.combatiente);

    for (const s of resultado.salvados) {
      this._anotar(Registro.entradaSuceso('salvacion', {
        nombre: actor.nombre,
        estado: s.nombre,
      }, this.leer('combat.ronda', 1)));
    }

    for (const e of resultado.expirados) {
      this._anotar(Registro.entradaSuceso('estado_expirado', {
        nombre: actor.nombre,
        estado: e.nombre,
      }, this.leer('combat.ronda', 1)));
    }

    // El jugador sincroniza sus estados con el estado real.
    if (actor.esJugador) this._sincronizarJugador(resultado.combatiente);
  }

  /* ═══════════════════════════════════════════════════════════════════════
     TURNO ENEMIGO
     ═══════════════════════════════════════════════════════════════════════ */

  /**
   * Ejecuta el turno de un enemigo.
   * @param {Object} actor
   * @param {number} ronda
   * @private
   */
  async _turnoEnemigo(actor, ronda) {
    const flujo = this.rng.combate;

    let decision = IA.decidir(flujo, {
      actor,
      combatientes: this._combatientes,
      ronda,
      historial: this._rondaActual,
    });

    decision = IA.coordinar(decision, actor, this._rondaActual);

    switch (decision.accion) {
      case 'atacar':
        await this._ejecutarAtaque(actor, decision, ronda);
        break;

      case 'atacar_area':
        await this._ejecutarArea(actor, decision, ronda);
        break;

      case 'huir':
        await this._huir(actor);
        break;

      case 'invocar':
        await this._invocar(actor, false);
        break;

      default:
        this.emitir('narrative:direct', {
          texto: IA.describir(decision, actor, this._combatientes),
          voz: 'system',
        });
    }
  }

  /**
   * El turno de un compañero.
   *
   * Si el jugador le ha dado una orden («Grom, cúbreme», «Grom, al herido»),
   * la cumple ahora. Si no, decide con la misma IA que los enemigos, que ya
   * elige objetivo en el otro bando.
   *
   * @private
   */
  async _turnoCompanero(actor, ronda) {
    const orden = this._ordenes?.[actor.id];
    if (orden) delete this._ordenes[actor.id];

    if (orden?.tipo === 'cubrir') {
      const jugador = this._combatientes.jugador;
      if (jugador?.vivo) {
        const r = Estados.aplicar(jugador, 'protegido', { rondas: 1 });
        this._guardar(r.combatiente);
        this.emitir('narrative:direct', { texto: `${actor.nombre} se pone delante de ti y te cubre.`, voz: 'system' });
        return;
      }
    }

    if (orden?.tipo === 'atacar' && this._combatientes[orden.objetivo]?.vivo) {
      await this._ejecutarAtaque(actor, { objetivo: orden.objetivo, ataque: actor.ataques[0] }, ronda);
      return;
    }

    await this._turnoEnemigo(actor, ronda);
  }

  /**
   * ¿Hay que aclarar la jugada antes de hacer nada? Sin efectos.
   * @returns {{motivo: string, texto: string}|null}
   * @private
   */
  _aclararAntes(texto, objetos) {
    const espera = leerEspera(texto);
    if (espera && espera.clase !== 'simple') {
      return { motivo: 'espera_en_combate', texto: 'En mitad de un combate no se puede dejar pasar el tiempo. Sigue siendo tu turno: ataca, defiéndete o huye.' };
    }
    const arma = aclararArma({
      segmentos: segmentar(texto).filter((s) => s.tipo === 'accion').map((s) => s.texto),
      objetos: Object.values(objetos ?? {}),
      equipado: this.leer('inventory.equipado', {}) ?? {},
      nombres: Object.values(this._combatientes ?? {}).map((c) => c?.nombre).filter(Boolean),
    });
    if (arma) return { motivo: arma.motivo, texto: arma.texto };

    // Un nombre que no está en esta pelea («ataco a Zorvak»): no se le pega
    // al objetivo de siempre en su lugar. Por clase («al guardia») o sin
    // nombre, manda la jugada de siempre.
    const llano = String(texto).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const m = llano.match(/\b(?:ataco|golpeo|pego|apunalo|disparo|embisto|arremeto|hiero|me lanzo)\b[^,.;]*?\b(?:a|contra)\s+([a-zñ]{3,})/);
    const LOCUCION = /^(?:traicion|ciegas|muerte|golpes|pedradas|mano|distancia|bocajarro|quemarropa|fondo|por|lo|la|las|los|el|un|una|unos|unas|ese|esa|este|esta|aquel|aquella|mi|tu|su|todos|todas|cualquiera|alguien|uno|otro|otra|quien)$/;
    if (m && !LOCUCION.test(m[1])) {
      const nombres = Object.values(this._combatientes ?? {}).flatMap((c) => [c.nombre, c.nombreBase].filter(Boolean))
        .map((n) => n.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''));
      if (!nombres.some((n) => n.split(/\s+/).includes(m[1]))) {
        const dicho = m[1].charAt(0).toUpperCase() + m[1].slice(1);
        return { motivo: 'blanco_ausente', texto: `${dicho} no está en esta pelea. Di a quién de los que tienes delante atacas; no se ha hecho el ataque.` };
      }
    }
    return null;
  }

  /**
   * Una orden a un compañero dentro de la jugada escrita.
   *
   * «Grom, cúbreme», «Grom, ataca al herido». Dar una orden no gasta el turno
   * del jugador: si la frase no trae nada más, se le vuelve a ceder la palabra.
   *
   * @returns {{orden: Object|null, resto: string, texto: string|null}}
   * @private
   */
  _leerOrden(texto) {
    const miembro = this.sistema('party')?.porNombreEn?.(texto);
    if (!miembro) return { orden: null, resto: texto, texto: null };

    const actor = Object.values(this._combatientes).find((c) => c.esCompanero && c.refId === miembro.refId && c.vivo);
    if (!actor) return { orden: null, resto: texto, texto: `${miembro.ficha.nombre} no puede ahora.` };

    const llano = (t) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const t = llano(texto);
    const nombre = llano(miembro.ficha.nombre);

    // Lo que va detrás del nombre es la orden; lo que va delante, la jugada
    // del propio jugador, si la hay («le golpeo y tú, Grom, cúbreme»).
    const i = t.indexOf(nombre);
    const tras = t.slice(i + nombre.length).replace(/^[\s,:]+/, '');
    const antes = texto.slice(0, i).replace(/\b(y tú|y tu|y)[\s,]*$/i, '').trim();

    let orden = null;
    if (/\b(cubre|cubreme|protege|protegeme|defiende|defiendeme|ponte delante)/.test(tras)) {
      orden = { tipo: 'cubrir' };
    } else if (/\b(ataca|a por|al |a la |golpea|carga)/.test(tras)) {
      const enemigos = Object.values(this._combatientes).filter((c) => c.vivo && c.bando === Comb.BANDO.ENEMIGO);
      const objetivo = leerJugada(`ataco ${tras}`, { enemigos }).objetivo ?? enemigos[0]?.id;
      orden = { tipo: 'atacar', objetivo };
    }

    if (!orden) return { orden: null, resto: texto, texto: null };

    this._ordenes[actor.id] = orden;
    const eco = orden.tipo === 'cubrir'
      ? `${actor.nombre} asiente y se acerca a ti.`
      : `${actor.nombre} asiente y va a por ${this._combatientes[orden.objetivo]?.nombre ?? 'ellos'}.`;
    return { orden, resto: antes, texto: eco };
  }

  /**
   * Ejecuta un ataque individual.
   * @private
   */
  async _ejecutarAtaque(atacante, decision, ronda) {
    const objetivo = this._combatientes[decision.objetivo];
    if (!objetivo?.vivo) return;

    const flujo = this.rng.combate;

    // Estar rodeado penaliza: se cuenta cuántos enemigos vivos hay.
    const rodeado = atacante.esJugador
      ? Object.values(this._combatientes).filter((c) => c.vivo && c.bando === Comb.BANDO.ENEMIGO).length >= 3
      : false;

    const resultado = Ataques.resolver(flujo, {
      atacante,
      objetivo,
      ataque: decision.ataque,
      ronda,
      circunstancias: { rodeado, creatividad: decision.creatividad ?? 0 },
    });

    // Una jugada que además de golpear deja al enemigo tocado —«le lanzo
    // arena a los ojos y le golpeo»— aplica su estado si el golpe entra.
    if (decision.estadoAlAcertar && resultado.dano && !resultado.cayo) {
      const { refId, rondas } = decision.estadoAlAcertar;
      const r = Estados.aplicar(resultado.objetivo, refId, { rondas });
      resultado.objetivo = r.combatiente;
      resultado.estadosAplicados = [...(resultado.estadosAplicados ?? []), { refId }];
    }

    this._guardar(resultado.atacante);
    this._guardar(resultado.objetivo);

    const entrada = Registro.entradaAtaque(resultado, {
      ronda,
      atacante,
      objetivo,
      ataque: decision.ataque,
    });

    this._anotar(entrada);

    this.emitir(EVENTOS_COMBATE.ATAQUE, entrada);

    // Sincronización del jugador en ambas direcciones.
    if (resultado.objetivo.esJugador) this._sincronizarJugador(resultado.objetivo);
    if (resultado.atacante.esJugador) this._sincronizarJugador(resultado.atacante);

    if (resultado.cayo) await this._registrarCaida(resultado.objetivo);

    // El desgaste del equipo es real: atacar gasta el arma.
    if (atacante.esJugador && resultado.dano) {
      this._desgastarArma();
    }
    if (objetivo.esJugador && resultado.dano) {
      this._desgastarArmadura(resultado.dano.total);
    }
  }

  /**
   * Ejecuta un ataque de área.
   * @private
   */
  async _ejecutarArea(atacante, decision, ronda) {
    const objetivos = decision.objetivos
      .map((id) => this._combatientes[id])
      .filter((c) => c?.vivo);

    if (!objetivos.length) return;

    const resultado = Ataques.resolverArea(this.rng.combate, {
      atacante,
      objetivos,
      ataque: decision.ataque,
      ronda,
    });

    this._guardar(resultado.atacante);
    for (const o of resultado.objetivos) this._guardar(o);

    this.emitir('narrative:direct', {
      texto: `${atacante.nombre} usa ${decision.ataque.nombre}.`,
      voz: 'system',
    });

    for (const r of resultado.resultados) {
      const objetivo = this._combatientes[r.objetivo];

      this._anotar({
        ronda,
        tipo: 'ataque',
        resultado: 'impacto',
        atacante: { id: atacante.id, nombre: atacante.nombre, esJugador: atacante.esJugador },
        objetivo: { id: r.objetivo, nombre: r.nombre, esJugador: objetivo?.esJugador },
        ataque: decision.ataque.nombre,
        dano: r.dano,
        estados: [],
        cayo: r.cayo,
        objetivoTras: {
          vida: objetivo?.vida.actual ?? 0,
          max: objetivo?.vida.max ?? 1,
          fraccion: Comb.fraccionVida(objetivo ?? { vida: { actual: 0, max: 1 } }),
        },
      });

      if (objetivo?.esJugador) this._sincronizarJugador(objetivo);
      if (r.cayo && objetivo) await this._registrarCaida(objetivo);
    }
  }

  /**
   * Un enemigo huye del combate.
   * @private
   */
  async _huir(actor) {
    const estado = this.leer('combat');
    const retirada = Iniciativa.retirar(estado, actor.id);

    delete this._combatientes[actor.id];

    this.despachar('combat/actualizar', {
      combatientes: this._combatientes,
      orden: retirada.orden,
      turnoActual: retirada.indiceAjustado,
    });

    this.emitir('narrative:direct', {
      texto: `${actor.nombre} escapa del combate.`,
      voz: 'system',
    });

    this._anotar(Registro.entradaSuceso('huida', { nombre: actor.nombre }, this.leer('combat.ronda', 1)));
  }

  /**
   * Un jefe invoca refuerzos.
   * @private
   */
  async _invocar(jefe, extra) {
    const flujo = this.rng.combate;
    const resultado = Jefes.invocar(flujo, jefe, { extra });

    if (!resultado.combatientes.length) return;

    const estado = this.leer('combat');
    let orden = estado.iniciativa ?? [];
    let indice = estado.turnoActual ?? 0;

    for (const nuevo of resultado.combatientes) {
      const insercion = Iniciativa.insertar(flujo, { iniciativa: orden, turnoActual: indice }, nuevo, this._combatientes);

      orden = insercion.orden;
      indice = insercion.indiceAjustado;
      this._combatientes[insercion.combatiente.id] = insercion.combatiente;
    }

    this.despachar('combat/actualizar', {
      combatientes: this._combatientes,
      orden,
      turnoActual: indice,
    });

    this.emitir('narrative:direct', { texto: resultado.narracion, voz: 'system' });

    this._anotar(Registro.entradaSuceso('invocacion', {
      narracion: resultado.narracion,
      cantidad: resultado.combatientes.length,
    }, this.leer('combat.ronda', 1)));

    await this._pausa(700);
  }

  /* ═══════════════════════════════════════════════════════════════════════
     ACCIÓN DEL JUGADOR
     ═══════════════════════════════════════════════════════════════════════ */

  /**
   * El jugador describe su jugada con palabras.
   *
   * Se lee con `leerJugada` —qué es, a quién, con qué y cuánto premia— y se
   * resuelve con el mismo d20 de siempre: la creatividad suma a la tirada, no
   * la sustituye. Lo que contradice el mundo o el inventario se dice en una
   * línea y resta.
   *
   * @param {string} texto
   * @param {Object} [opciones]
   * @param {string|null} [opciones.marcado] Objetivo marcado en el panel.
   * @returns {Promise<Object|null>} La jugada leída.
   */
  async jugadaLibre(texto, { marcado = null } = {}) {
    if (!this._esperando) return null;

    const jugador = this._combatientes.jugador;
    const objetos = this.leer('inventory.objetos.porId', {}) ?? {};
    const arma = objetos[this.leer('inventory.equipado.armaPrincipal')]?.nombre ?? jugador?.ataques?.[0]?.nombre ?? null;

    // Órdenes al grupo. Si la frase era solo eso, el jugador sigue teniendo
    // su turno: se le devuelve la palabra sin gastarlo.
    const orden = this._leerOrden(texto);
    if (orden.texto) this.emitir('narrative:direct', { texto: orden.texto, voz: 'system' });
    if (orden.orden && !orden.resto) {
      this.emitir(EVENTOS_COMBATE.ESPERANDO, { ronda: this.leer('combat.ronda', 1), acciones: Iniciativa.accionesDisponibles(jugador) });
      return { tipo: 'orden', orden: orden.orden };
    }
    if (orden.orden) texto = orden.resto;

    // Lo que hay que aclarar antes de gastar nada: atacar con un arma que no
    // está (o no en la mano), o dejar pasar horas en mitad de la pelea. Se
    // dice y el turno sigue siendo suyo: ni ronda, ni acciones, ni el enemigo
    // aprovecha (como con la magia). Es la misma comprobación que hace
    // `TurnResolver` fuera del combate (`engine/ArmaPedida.js`).
    const aclaracion = this._aclararAntes(texto, objetos);
    if (aclaracion) {
      this.emitir('narrative:direct', { texto: aclaracion.texto, voz: 'system' });
      this.emitir(EVENTOS_COMBATE.ESPERANDO, { ronda: this.leer('combat.ronda', 1), acciones: Iniciativa.accionesDisponibles(jugador) });
      return { tipo: 'aclaracion', motivo: aclaracion.motivo, texto: aclaracion.texto };
    }

    const jugada = leerJugada(texto, {
      enemigos: Object.values(this._combatientes).filter((c) => c.vivo && c.bando === Comb.BANDO.ENEMIGO),
      inventario: Object.values(objetos),
      arma,
      marcado,
      anterior: this._ultimaJugada ?? null,
    });

    if (jugada.aviso) this.emitir('narrative:direct', { texto: jugada.aviso, voz: 'system' });

    // Magia: no hay con qué resolverla todavía. Se ha dicho por qué (el
    // aviso) y el turno sigue siendo suyo: ni maná, ni ronda, ni el enemigo
    // aprovecha. Antes salía un golpe de bastón sin avisar.
    if (jugada.tipo === 'magia') {
      this.emitir(EVENTOS_COMBATE.ESPERANDO, { ronda: this.leer('combat.ronda', 1), acciones: Iniciativa.accionesDisponibles(jugador) });
      return jugada;
    }

    this._ultimaJugada = null;

    switch (jugada.tipo) {
      case 'huir':
        await this.accionJugador({ tipo: 'huir' });
        return jugada;

      case 'defender':
        await this.accionJugador({ tipo: 'defender' });
        return jugada;

      case 'parlamentar':
        this._esperando = false;
        if (await this._parlamentar(texto)) return jugada;
        await this._terminarTurnoDe(this._combatientes.jugador);
        await this._avanzar();
        return jugada;

      case 'curar':
        this._esperando = false;
        this._curarEnCombate(jugada);
        await this._terminarTurnoDe(this._combatientes.jugador);
        await this._avanzar();
        return jugada;

      case 'maniobra': {
        // Una maniobra (arena a los ojos) solo contra alguien NOMBRADO de los
        // que pelean: sin nombre, la lectura caía en el primero de la lista.
        const nombrado = this._nombradoEn(texto);
        if (!nombrado || nombrado.id !== jugada.objetivo) {
          return this._seguirSuTurno({ tipo: 'aclaracion', motivo: 'maniobra_sin_blanco', texto: `¿Contra quién? Nombra a uno de los que pelean (${this._enemigosVivos().map((e) => e.nombre).join(', ')}). No se ha hecho nada.` });
        }
        this._esperando = false;
        await this._maniobra(jugada);
        await this._terminarTurnoDe(this._combatientes.jugador);
        await this._avanzar();
        return jugada;
      }

      default:
        // Atacar se elige en el menú: ataque y a quién, cada vez. El texto
        // libre no puede resolver un golpe contra el primero de la lista ni
        // contra el más débil (decisión del 7-oct-2026).
        return this._seguirSuTurno({ tipo: 'aclaracion', motivo: 'ataque_por_menu', texto: 'En combate se ataca desde el menú: Atacar, elige el ataque y elige a quién. No se ha hecho nada.' });
    }
  }

  /** Aclara, deja el turno abierto y lo devuelve. @private */
  _seguirSuTurno(resultado) {
    this.emitir('narrative:direct', { texto: resultado.texto, voz: 'system' });
    this.emitir(EVENTOS_COMBATE.ESPERANDO, { ronda: this.leer('combat.ronda', 1), acciones: Iniciativa.accionesDisponibles(this._combatientes.jugador) });
    return resultado;
  }

  /** @private */
  _enemigosVivos() {
    return Object.values(this._combatientes).filter((c) => c.vivo && c.bando === Comb.BANDO.ENEMIGO);
  }

  /** El enemigo vivo nombrado en el texto, si es uno y solo uno. @private */
  _nombradoEn(texto) {
    const llano = String(texto ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const quien = this._enemigosVivos().filter((e) => {
      const n = String(e.nombre ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return n && llano.includes(n);
    });
    return quien.length === 1 ? quien[0] : null;
  }

  /* ═══════════════════════════════════════════════════════════════════════
     MENÚ: lo que se puede elegir y UNA acción validada
     ═══════════════════════════════════════════════════════════════════════ */

  /* ═══════════════════════════════════════════════════════════════════════
     GUARDAR Y CARGAR EN MITAD DE UN COMBATE
     ═══════════════════════════════════════════════════════════════════════ */

  /**
   * El combate en curso, para el guardado. Solo en el turno del jugador: a
   * mitad de la resolución (el enemigo actuando) no hay un punto estable que
   * guardar, y `SaveManager` lo dice en vez de guardar a medias.
   * @returns {null|Object}
   */
  serializar() {
    if (!this.leer('combat.activo', false) || !this._esperando) return null;
    return {
      version: 1,
      combateId: this._combateId,
      turnoJugador: this._turnoJugador ?? 0,
      combatientes: JSON.parse(JSON.stringify(this._combatientes)),
      ordenes: { ...(this._ordenes ?? {}) },
      estado: JSON.parse(JSON.stringify(this.leer('combat', {}))),
    };
  }

  /**
   * Restaura el combate guardado: participantes, vida, estados, iniciativa,
   * ronda. Vuelve a ser el turno del jugador con una ficha NUEVA: lo que
   * estuviera a medio elegir en la interfaz se descarta, y una orden de antes
   * de guardar no vale. Ni turno extra ni daño repetido.
   */
  restaurar(datos) {
    if (!datos?.combatientes || !datos.estado) return;
    this._combatientes = datos.combatientes;
    this._combateId = datos.combateId ?? `cmb-restaurado-${Date.now().toString(36)}`;
    this._turnoJugador = (datos.turnoJugador ?? 0) + 1;
    this._ordenes = datos.ordenes ?? {};
    this._registro = [];
    this.store.fijar('combat', { ...datos.estado, activo: true });
    this.store.fijar('meta.fase', 'combate');
    this._esperando = true;
    queueMicrotask(() => this.emitir(EVENTOS_COMBATE.ESPERANDO, {
      ronda: this.leer('combat.ronda', 1),
      acciones: Iniciativa.accionesDisponibles(this._combatientes.jugador),
    }));
  }

  /**
   * Ficha del turno del jugador en curso (combate + turno), o null si no es
   * su turno. La interfaz la manda con la acción; una ficha vieja o repetida
   * se rechaza.
   */
  turnoToken() {
    return this._esperando && this._combateId ? `${this._combateId}:${this._turnoJugador}` : null;
  }

  /**
   * Lo que el jugador puede elegir ahora, sacado del estado real: sus
   * ataques (del equipo), los enemigos vivos y los consumibles que lleva.
   * Sin catálogo inventado: si solo hay un ataque, sale uno (y se elige).
   *
   * @returns {null|{token: string, ronda: number, ataques: Object[], enemigos: Object[], consumibles: Object[]}}
   */
  accionesDelJugador() {
    if (!this._esperando) return null;
    const jugador = this._combatientes.jugador;
    const objetos = this.leer('inventory.objetos.porId', {}) ?? {};
    const enMano = new Set(Object.values(this.leer('inventory.equipado', {}) ?? {}).filter(Boolean));
    const ataques = (jugador?.ataques ?? []).map((a) => {
      const objeto = a.itemId ? objetos[a.itemId] : null;
      const durabilidad = typeof objeto?.durabilidad === 'number' ? objeto.durabilidad : objeto?.durabilidad?.actual;
      let motivo = null;
      if (a.itemId && !objeto) motivo = 'ya no lo llevas';
      else if (a.itemId && !enMano.has(a.itemId)) motivo = 'no está en la mano';
      else if (durabilidad === 0) motivo = 'está roto';
      return { id: a.id, itemId: a.itemId ?? null, nombre: a.nombre, dano: a.dano, tipo: a.tipo, alcance: a.alcance, coste: null, disponible: !motivo, motivo };
    });
    const enemigos = this._enemigosVivos().map((c) => {
      const ui = Comb.paraInterfaz(c);
      return { id: c.id, nombre: c.nombre, vida: c.vida.actual, max: c.vida.max, condicion: ui.condicion, npc: c.npc ?? null };
    });
    const consumibles = Object.values(objetos)
      .filter((o) => o.categoria === 'consumible' && (Number.isFinite(o.cantidad) ? o.cantidad : 1) > 0)
      .map((o) => {
        const v = this._validarObjeto(o.id);
        return { id: o.id, nombre: o.nombre, cantidad: o.cantidad ?? 1, disponible: v.ok, motivo: v.ok ? null : v.texto };
      });
    return { token: this.turnoToken(), ronda: this.leer('combat.ronda', 1), ataques, enemigos, consumibles };
  }

  /** ¿Se puede usar este objeto ahora, en combate? Sin efectos. @private */
  _validarObjeto(idObjeto) {
    const objeto = this.leer(`inventory.objetos.porId.${idObjeto}`, null);
    if (!objeto || (Number.isFinite(objeto.cantidad) && objeto.cantidad <= 0)) return { ok: false, motivo: 'objeto', texto: 'Ya no llevas eso.' };
    if (objeto.categoria !== 'consumible') return { ok: false, motivo: 'objeto', texto: `${objeto.nombre} no se usa así.` };
    const efecto = objeto.efecto?.tipo ?? obtenerPlantillaObjeto(objeto.refId)?.efecto?.tipo;
    if (efecto === 'comida') {
      const regla = Comida.puedeComer({
        objeto: { ...objeto, efecto: { tipo: 'comida' } },
        vida: this.leer('player.vida'),
        enCampamento: Comida.campamentoValido({ campamento: this.leer('world.campamento', null), ubicacion: this.leer('world.ubicacion'), sublugar: this.leer('world.sublugar') }),
      });
      if (!regla.ok) return { ok: false, motivo: 'objeto', texto: regla.texto };
    }
    if (efecto === 'bebida') return { ok: false, motivo: 'objeto', texto: 'Beber no hace nada en combate: el odre se queda como está.' };
    return { ok: true, objeto };
  }

  /**
   * Comprueba una acción del menú SIN tocar nada.
   * @returns {{ok: true, ataque?: Object, objetivo?: Object}|{ok: false, motivo: string, texto: string}}
   */
  validarAccion(accion = {}) {
    if (!this._esperando || !accion.token || accion.token !== this.turnoToken()) {
      return { ok: false, motivo: 'turno', texto: 'Esa orden ya no vale: no es este turno.' };
    }
    const jugador = this._combatientes.jugador;
    if (!jugador?.vivo) return { ok: false, motivo: 'turno', texto: 'No puedes actuar.' };
    switch (accion.tipo) {
      case 'atacar': {
        const ataque = (jugador.ataques ?? []).find((a) => a.id === accion.ataqueId);
        const disponible = this.accionesDelJugador()?.ataques.find((a) => a.id === accion.ataqueId);
        if (!accion.ataqueId) return { ok: false, motivo: 'ataque', texto: 'Elige el ataque.' };
        if (!ataque || !disponible) return { ok: false, motivo: 'ataque', texto: 'Ese ataque ya no está disponible. Elige otro.' };
        if (!disponible.disponible) return { ok: false, motivo: 'ataque', texto: `${ataque.nombre}: ${disponible.motivo}. Elige otro.` };
        if (accion.itemId !== undefined && accion.itemId !== (ataque.itemId ?? null)) return { ok: false, motivo: 'ataque', texto: 'Ese arma no es la del ataque elegido.' };
        const objetivo = accion.objetivoId ? this._combatientes[accion.objetivoId] : null;
        if (!objetivo) return { ok: false, motivo: 'objetivo', texto: 'Ese objetivo no está en esta pelea. Elige a quién.' };
        if (objetivo.bando !== Comb.BANDO.ENEMIGO) return { ok: false, motivo: 'objetivo', texto: `${objetivo.nombre} es de tu lado. Elige a un enemigo.` };
        if (!objetivo.vivo) return { ok: false, motivo: 'objetivo', texto: `${objetivo.nombre} ya ha caído. Elige a otro.` };
        return { ok: true, ataque, objetivo };
      }
      case 'usar_objeto': {
        const v = this._validarObjeto(accion.itemId ?? accion.idObjeto);
        return v.ok ? { ok: true, objeto: v.objeto } : v;
      }
      case 'defender':
      case 'huir':
        return { ok: true };
      default:
        return { ok: false, motivo: 'tipo', texto: 'Esa acción no existe.' };
    }
  }

  /**
   * Ejecuta UNA acción elegida en el menú. Valida antes de mutar; si no vale,
   * el turno sigue abierto y se dice por qué (sin coste, sin tirada, sin
   * atacar a otro). Una ficha de turno solo sirve una vez: el doble clic o
   * el Enter repetido no actúan dos veces.
   *
   * @param {{tipo: string, token: string, ataqueId?: string, itemId?: string, objetivoId?: string}} accion
   * @returns {Promise<{ok: boolean, motivo?: string, texto?: string}>}
   */
  async ejecutar(accion = {}) {
    const v = this.validarAccion(accion);
    if (!v.ok) {
      if (v.motivo !== 'turno') this._seguirSuTurno({ tipo: 'aclaracion', ...v });
      return v;
    }
    this._esperando = false;
    const jugador = this._combatientes.jugador;
    const ronda = this.leer('combat.ronda', 1);
    switch (accion.tipo) {
      case 'atacar':
        await this._ejecutarAtaque(jugador, { objetivo: v.objetivo.id, ataque: v.ataque }, ronda);
        break;
      case 'defender':
        this._defender(jugador);
        break;
      case 'usar_objeto':
        this.despachar('inventory/consumir', { idObjeto: v.objeto.id });
        this._refrescarJugador();
        break;
      case 'huir':
        await this._intentarHuir(jugador);
        return { ok: true };
    }
    await this._terminarTurnoDe(this._combatientes.jugador);
    await this._avanzar();
    return { ok: true };
  }

  /** Defenderse: protegido hasta el final de su próximo turno. @private */
  _defender(jugador) {
    // Defenderse protege hasta el final de tu próximo turno: una ronda
    // entera de ataques enemigos. Las rondas se descuentan al terminar el
    // turno de quien lleva el estado, así que con 1 caducaba en este mismo
    // turno, antes de que nadie atacara, y defenderse no servía de nada.
    const r = Estados.aplicar(jugador, 'protegido', { rondas: 2 });
    this._guardar(r.combatiente);
    this.emitir('narrative:direct', { texto: 'Te cubres y aguantas la posición.', voz: 'system' });
  }

  /**
   * Una maniobra sin golpe: arena a los ojos, un empujón al río.
   *
   * Se tira como un ataque —d20 más la jugada contra la defensa del enemigo—
   * y si entra, el enemigo queda en el estado de la maniobra. No hace daño:
   * lo que gana es la ronda siguiente.
   *
   * @private
   */
  async _maniobra(jugada) {
    const jugador = this._combatientes.jugador;
    const objetivo = this._combatientes[jugada.objetivo];
    if (!objetivo?.vivo || !jugador?.vivo) return;

    const tirada = this.sistema('rules').resolver({
      habilidad: 'atletismo',
      umbral: Comb.defensaEfectiva(objetivo),
      bonoExtra: jugada.creatividad.valor,
      fuenteExtra: 'Creativo',
    });

    const dados = `(d20 ${tirada.natural}${jugada.creatividad.valor ? `, ${jugada.creatividad.valor > 0 ? '+' : ''}${jugada.creatividad.valor} por la jugada` : ''}: ${tirada.total} contra ${tirada.umbral})`;

    if (!tirada.exito) {
      this.emitir('narrative:direct', { texto: `Lo intentas con ${objetivo.nombre}, pero no sale. ${dados}`, voz: 'system' });
      return;
    }

    const r = Estados.aplicar(objetivo, jugada.estado.refId, { rondas: jugada.estado.rondas });
    this._guardar(r.combatiente);
    this._ultimaJugada = { estado: jugada.estado.refId };

    const nombreEstado = concordar(obtenerEstado(jugada.estado.refId)?.nombre?.toLowerCase() ?? jugada.estado.refId, objetivo.genero);
    this.emitir('narrative:direct', { texto: `${objetivo.nombre} queda ${nombreEstado}. ${dados}`, voz: 'system' });
  }

  /**
   * Curarse en plena pelea: la poción si la lleva; si no, vendarse a toda prisa.
   * @private
   */
  _curarEnCombate(jugada) {
    const r = curarConTexto(this, jugada.objeto);
    this._refrescarJugador();
    this.emitir('narrative:direct', { texto: r.texto, voz: 'system' });
  }

  /**
   * La vía antigua (`combat:action`, el panel clásico): la misma validación
   * que el menú, con la ficha del turno en curso. Atacar exige ataque y
   * objetivo: ya no hay «el más débil» ni «el primer ataque» por defecto.
   *
   * @param {{tipo: string, objetivo?: string, ataqueId?: string, idObjeto?: string}} accion
   */
  async accionJugador(accion = {}) {
    if (accion.tipo === 'esperar') {
      if (!this._esperando) return { ok: false, motivo: 'turno' };
      this._esperando = false;
      this.emitir('narrative:direct', { texto: 'Esperas tu momento.', voz: 'system' });
      await this._terminarTurnoDe(this._combatientes.jugador);
      await this._avanzar();
      return { ok: true };
    }
    return this.ejecutar({
      tipo: accion.tipo,
      token: accion.token ?? this.turnoToken(),
      ataqueId: accion.ataqueId,
      objetivoId: accion.objetivoId ?? accion.objetivo,
      itemId: accion.itemId ?? accion.idObjeto,
    });
  }

  /**
   * El jugador intenta huir.
   * @private
   */
  async _intentarHuir(jugador) {
    const rules = this.sistema('rules');

    const tirada = rules.resolver({
      habilidad: 'acrobacias',
      umbral: 'dificil',
      condiciones: ['huyendo'],
    });

    if (tirada.exito) {
      this.emitir('narrative:direct', {
        texto: Registro.cierre(this.rng.combate, 'huida'),
        voz: 'system',
      });
      await this._terminar('huida');
      return;
    }

    this.emitir('narrative:direct', {
      texto: 'No encuentras por dónde salir. Pierdes el turno intentándolo.',
      voz: 'system',
    });

    await this._terminarTurnoDe(this._combatientes.jugador);
    await this._avanzar();
  }

  /* ═══════════════════════════════════════════════════════════════════════
     FIN DEL COMBATE
     ═══════════════════════════════════════════════════════════════════════ */

  /**
   * Cierra el combate y reparte las consecuencias.
   * @param {string} resultado
   * @private
   */
  /**
   * Hablar en mitad de la pelea.
   *
   * Con quien atiende a razones (bandidos, guardias: `negociable`) se tira
   * trato social; más fácil si ya van tocados. Si sale, la pelea se acaba
   * sin más sangre. Si no, se ha gastado el turno hablando. Con una bestia
   * no hay con quién hablar, y se dice.
   *
   * @param {string} texto
   * @returns {Promise<boolean>} true si el combate ha terminado.
   * @private
   */
  async _parlamentar(texto) {
    const enemigos = Object.values(this._combatientes).filter((c) => c.vivo && c.bando === Comb.BANDO.ENEMIGO);
    if (!enemigos.some((e) => e.negociable)) {
      this.emitir('narrative:direct', { texto: 'No hay con quién hablar: lo que tienes delante no entiende de palabras.', voz: 'system' });
      return false;
    }

    const tocados = enemigos.some((e) => Comb.fraccionVida(e) < 0.5);
    const tirada = this.sistema('rules')?.resolver({ habilidad: 'trato_social', umbral: tocados ? 'facil' : 'moderada' }) ?? null;
    const dados = tirada ? ` (d20 ${tirada.natural}: ${tirada.total} contra ${tirada.umbral})` : '';

    if (tirada?.exito) {
      this.emitir('narrative:direct', { texto: `Te escuchan${dados}. Uno baja el arma; luego, otro.`, voz: 'system' });
      this.despachar('hazanas/registrar', { clave: 'conflictosResueltosSinViolencia', delta: 1 });
      await this._terminar('acuerdo');
      return true;
    }

    this.emitir('narrative:direct', { texto: `No quieren saber nada${dados}: la pelea sigue.`, voz: 'system' });
    return false;
  }

  async _terminar(resultado) {
    const flujo = this.rng.combate;
    // Enemigos son los del otro bando: un compañero caído no da experiencia
    // ni botín.
    const enemigos = Object.values(this._combatientes).filter((c) => c.bando === Comb.BANDO.ENEMIGO);
    const jugador = this._combatientes.jugador;

    // ─── Resumen ────────────────────────────────────────────────────────
    const resumen = Registro.resumir(this._registro, {
      resultado,
      rondas: this.leer('combat.ronda', 1),
      enemigos,
      jugadorInicial: this._jugadorInicial,
      jugadorFinal: jugador,
    });

    // ─── Narración de cierre ────────────────────────────────────────────
    this.emitir('narrative:direct', {
      texto: Registro.cierre(flujo, resultado),
      voz: 'system',
    });

    // ─── Recompensas ────────────────────────────────────────────────────
    if (resultado === 'victoria') {
      await this._repartirRecompensas(enemigos, flujo);
    }

    // ─── Personas de la escena ──────────────────────────────────────────
    // Quien peleó con su nombre (Korsa, Xivio) sale del combate con lo que
    // le pasó de verdad: muerto, o herido y acordándose.
    const npcs = this.sistema('npcs');
    const quien = this.leer('player.nombre', 'el forastero');
    for (const e of enemigos.filter((c) => c.npc)) {
      if (!e.vivo || (e.vida?.actual ?? 1) <= 0) {
        npcs?.cambiarSituacion?.(e.npc, 'muerto', `en una pelea con ${quien}`);
      } else if ((e.vida?.actual ?? 0) < (e.vida?.max ?? 0)) {
        npcs?.recordar?.(e.npc, `${quien} le hirió en una pelea (${e.vida.max - e.vida.actual} de daño).`, { tipo: 'agresion', peso: 3 });
      }
    }

    // ─── El grupo ───────────────────────────────────────────────────────
    // Vida y heridas de vuelta al grupo. Solo en Brutal un compañero caído
    // no se levanta.
    const companeros = Object.values(this._combatientes).filter((c) => c.esCompanero);
    if (companeros.length) {
      const lineas = this.sistema('party')?.despuesDelCombate?.(companeros, {
        puedenMorir: this.leer('settings.dificultad', 'equilibrado') === 'implacable',
      }) ?? [];
      for (const texto of lineas) this.emitir('narrative:direct', { texto, voz: 'system' });
    }

    // ─── Memoria ────────────────────────────────────────────────────────
    this.emitir('memory:remember', { texto: resumen.texto, peso: 3 });

    // ─── Estado ─────────────────────────────────────────────────────────
    this.despachar('combat/terminar', {});

    this.emitir(EVENTOS_COMBATE.FIN, {
      resultado,
      estadisticas: resumen.estadisticas,
      resumen: resumen.texto,
    });

    this.log.info(`combate terminado: ${resultado}`);

    // ─── Derrota ────────────────────────────────────────────────────────
    if (resultado === 'derrota') {
      this.emitir('player:defeated', { origen: 'combate' });
    }

    this._combatientes = {};
    this._registro = [];
    this._rondaActual = [];
    this._esperando = false;
    this._ordenes = {};
  }

  /**
   * Reparte experiencia y botín.
   * @private
   */
  async _repartirRecompensas(enemigos, flujo) {
    const caidos = enemigos.filter((e) => !e.vivo);
    if (!caidos.length) return;

    // ─── Experiencia ────────────────────────────────────────────────────
    const xp = caidos.reduce((total, e) => total + xpPorEnemigo(e.amenaza, e.nivel), 0);

    if (xp > 0) {
      this.despachar('player/xp', { cantidad: xp, motivo: 'combate' });
    }

    // ─── Botín ──────────────────────────────────────────────────────────
    // El botín se genera por enemigo y se acumula: cada uno aporta lo suyo.
    const nivelJugador = this.leer('player.nivel', 1);
    const terreno = this.leer('world.terreno');
    const dificultad = this.leer('settings.dificultad', 'equilibrado');

    const botin = { oro: 0, objetos: [] };

    for (const caido of caidos) {
      const suyo = botinDeEnemigo(flujo, {
        amenaza: caido.amenaza,
        nivelJugador,
        terreno,
        dificultad,
        tipoEnemigo: caido.tipo,
      });

      botin.oro += suyo.oro ?? 0;
      botin.objetos.push(...(suyo.objetos ?? []));
    }

    const inventario = this.sistema('inventory');
    inventario?.recibirBotin(botin);

    // El botín también se cuenta, no solo se apunta en el inventario: «entre
    // sus cosas encuentras…». Si no hay nada, se dice, que también es algo.
    this.emitir('narrative:direct', { texto: narrarBotin(botin, caidos.length), voz: 'dm' });

    // ─── Reputación con la facción de los caídos ─────────────────────────
    // Matar a los miembros de una facción tiene consecuencias con toda ella.
    for (const caido of caidos) {
      if (!caido.faccion) continue;

      this.emitir('npc:killed', {
        refId: caido.refId,
        nombre: caido.nombre,
        faccion: caido.faccion,
      });
    }
  }

  /**
   * Registra la caída de un combatiente.
   * @private
   */
  async _registrarCaida(combatiente) {
    // Una caída se anota UNA vez.
    //
    // Hay tres caminos que pueden traer aquí al mismo combatiente —el daño
    // periódico de un estado, el golpe que lo remata y el ataque en área— y en
    // el parte salía «Brunhilda cae.» dos veces seguidas. Se cae una sola vez,
    // y leerlo dos veces resta en lugar de sumar.
    this._caidos ??= new Set();
    if (this._caidos.has(combatiente.id)) return;
    this._caidos.add(combatiente.id);

    this._anotar(Registro.entradaSuceso('caida', {
      nombre: combatiente.nombre,
      esJugador: combatiente.esJugador,
    }, this.leer('combat.ronda', 1)));

    if (combatiente.esJugador) {
      this._sincronizarJugador(combatiente);
      return;
    }

    // Un compañero no es una baja enemiga: ni experiencia, ni misiones de
    // «acabar con», ni «X cae» como quien derriba a un saqueador.
    if (combatiente.esCompanero) {
      this.emitir('narrative:direct', { texto: `${combatiente.nombre} cae, malherido.`, voz: 'system' });
      return;
    }

    this.emitir(EVENTOS_COMBATE.MUERTE, {
      refId: combatiente.refId,
      nombre: combatiente.nombre,
      amenaza: combatiente.amenaza,
      tipo: combatiente.tipo,
      faccion: combatiente.faccion,
    });

    this.emitir('narrative:direct', {
      texto: `${combatiente.nombre} cae.`,
      voz: 'system',
    });
  }

  /* ═══════════════════════════════════════════════════════════════════════
     SINCRONIZACIÓN
     ═══════════════════════════════════════════════════════════════════════ */

  /**
   * Propaga la vida y los estados del combatiente al estado real.
   *
   * El combatiente del jugador es una proyección, no una copia: lo que le pasa
   * en combate le pasa de verdad.
   *
   * @param {Object} jugador
   * @private
   */
  _sincronizarJugador(jugador) {
    const actual = this.leer('player.vida.actual', 0);
    const delta = jugador.vida.actual - actual;

    if (delta < 0) {
      this.despachar('player/danar', { cantidad: -delta, origen: 'combate' });
    } else if (delta > 0) {
      this.despachar('player/curar', { cantidad: delta, origen: 'combate' });
    }

    this.despachar('player/estados/fijar', { estados: jugador.estados ?? [] });
  }

  /**
   * Relee el estado del jugador y actualiza su combatiente.
   *
   * Se usa tras consumir un objeto: el efecto se aplica al estado real y hay que
   * traerlo de vuelta.
   *
   * @private
   */
  _refrescarJugador() {
    const jugador = this._combatientes.jugador;
    if (!jugador) return;

    const real = this.leer('player');

    this._guardar({
      ...jugador,
      vida: { actual: real.vida.actual, max: real.vida.max },
      estados: [...(real.estados ?? [])],
    });
  }

  /** @private */
  _desgastarArma() {
    const equipado = this.leer('inventory.equipado.manoPrincipal');
    if (equipado) {
      this.despachar('inventory/desgastar', { idObjeto: equipado, tipo: 'arma' });
    }
  }

  /** @private */
  _desgastarArmadura(dano) {
    const equipado = this.leer('inventory.equipado.torso');
    if (equipado) {
      this.despachar('inventory/desgastar', { idObjeto: equipado, tipo: 'armadura', dano });
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════
     AUXILIARES
     ═══════════════════════════════════════════════════════════════════════ */

  /** @private */
  _guardar(combatiente) {
    if (!combatiente?.id) return;

    this._combatientes[combatiente.id] = combatiente;
    this.despachar('combat/actualizar', { combatientes: this._combatientes });
  }

  /** @private */
  _anotar(entrada) {
    this._registro.push(entrada);
    this._rondaActual.push(entrada);

    const texto = Registro.paraJugador(entrada);
    if (texto) this.emitir('combat:log', { texto, entrada });
  }

  /** @private */
  _pausa(ms) {
    return new Promise((resolver) => this.espera(resolver, ms));
  }

  /* ═══════════════════════════════════════════════════════════════════════
     REDUCTORES
     ═══════════════════════════════════════════════════════════════════════ */

  /** @private */
  _reducirIniciar(estado, accion) {
    const { combatientes, orden, emboscada } = accion.payload ?? {};

    return {
      combat: {
        activo: true,
        ronda: 1,
        turnoActual: -1,
        iniciativa: orden ?? [],
        combatientes: combatientes ?? {},
        emboscada: emboscada ?? null,
      },
      meta: { fase: 'combate' },
    };
  }

  /** @private */
  _reducirActualizar(estado, accion) {
    const parche = { combat: {} };
    const { combatientes, orden, turnoActual } = accion.payload ?? {};

    if (combatientes) {
      // El almacén funde: quien ya no está (huye) se quita con BORRAR. Sin
      // eso, Dalwen huía y seguía en la ficha del combate de la pantalla.
      parche.combat.combatientes = { ...combatientes };
      for (const id of Object.keys(estado.combat?.combatientes ?? {})) {
        if (!(id in combatientes)) parche.combat.combatientes[id] = BORRAR;
      }
    }
    if (orden) parche.combat.iniciativa = orden;
    if (turnoActual !== undefined) parche.combat.turnoActual = turnoActual;

    return parche;
  }

  /** @private */
  _reducirTurno(estado, accion) {
    const { indice, ronda } = accion.payload ?? {};

    return {
      combat: {
        turnoActual: indice ?? estado.combat.turnoActual,
        ronda: ronda ?? estado.combat.ronda,
      },
    };
  }

  /** @private */
  _reducirTerminar(estado) {
    return {
      combat: {
        activo: false,
        ronda: 0,
        turnoActual: 0,
        iniciativa: [],
        combatientes: {},
        emboscada: null,
      },
      // Si el jugador cayó en la pelea, la partida sigue detenida.
      //
      // Caer pone la fase en `fin`; acabar el combate la devolvía a
      // `exploracion` justo después, así que la pantalla de caída se abría
      // pero el motor volvía a aceptar turnos. Solo la saca de ahí una de las
      // salidas de la caída.
      meta: { fase: estado?.meta?.fase === 'fin' ? 'fin' : 'exploracion' },
    };
  }

  /* ═══════════════════════════════════════════════════════════════════════
     CONSULTAS
     ═══════════════════════════════════════════════════════════════════════ */

  /** @returns {boolean} */
  get activo() {
    return this.leer('combat.activo', false);
  }

  /** @returns {boolean} */
  get esperandoJugador() {
    return this._esperando;
  }

  /**
   * Estado del combate para la interfaz.
   * @returns {Object|null}
   */
  paraInterfaz() {
    if (!this.activo) return null;

    const estado = this.leer('combat');
    const jefe = Object.values(this._combatientes).find((c) => c.vivo && Jefes.esJefe(c));

    return {
      ronda: estado.ronda,
      iniciativa: Iniciativa.paraInterfaz(estado, this._combatientes),
      combatientes: Object.values(this._combatientes).map((c) => Comb.paraInterfaz(c)),
      jefe: jefe ? Jefes.paraInterfaz(jefe) : null,
      esperando: this._esperando,
      turnoDelJugador: Iniciativa.actuando(estado, this._combatientes)?.esJugador ?? false,
    };
  }

  /**
   * Contexto de combate para el director.
   * @returns {string}
   */
  paraDirector() {
    if (!this.activo) return '';

    const estado = this.leer('combat');
    const partes = [`COMBATE, ronda ${estado.ronda}.`];

    partes.push(Iniciativa.paraDirector(estado, this._combatientes));

    const jefe = Object.values(this._combatientes).find((c) => c.vivo && Jefes.esJefe(c));
    if (jefe) partes.push(Jefes.paraDirector(jefe));

    if (this._rondaActual.length) {
      partes.push(`En esta ronda: ${Registro.paraDirector(this._rondaActual)}`);
    }

    return partes.join(' ');
  }

  /** @returns {Object} */
  inspeccionar() {
    return {
      activo: this.activo,
      ronda: this.leer('combat.ronda', 0),
      combatientes: Object.values(this._combatientes).map((c) => ({
        nombre: c.nombre,
        vida: `${c.vida.actual}/${c.vida.max}`,
        estados: (c.estados ?? []).map((e) => e.refId),
      })),
      entradas: this._registro.length,
      cargasLegendarias: this._cargasLegendarias,
      esperando: this._esperando,
    };
  }
}

export default CombatManager;
