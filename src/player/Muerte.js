/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCANVEIL · player/Muerte.js
 * ---------------------------------------------------------------------------
 * La muerte termina la partida (decisión del 7-oct-2026).
 *
 * Antes: tras perder un combate, la vida quedaba a 0 y la caja de texto no
 * contestaba («miro alrededor» no daba respuesta); `player:defeated` no lo
 * escuchaba nadie, y en la interfaz había un «Volver en ti» que devolvía al
 * personaje con 1 de vida. Ahora un único controlador observa la caída (sea
 * por combate o por agotamiento) y cierra ESTA partida:
 *
 *   · estado terminal en `meta.muerte` (run, causa, momento del mundo,
 *     resumen) y `meta.fase = 'fin'`, una sola vez (un evento doble o una
 *     recarga no crean otra muerte);
 *   · el viaje en curso y el encuentro pendiente se cierran;
 *   · marca durable del run muerto y foto de la herencia pendiente
 *     (`persistence/RegistroRuns.js`), sin aplicarla (`player/Legado.js`);
 *   · `run:ended`, para que la interfaz guarde el resultado y enseñe la
 *     pantalla final con «Nueva partida».
 *
 * Los rasgos que evitan caer (`evitarCaida`) siguen en `Player._alCaer`: son
 * reglas de clase, no una forma de curar la derrota. La muerte de un
 * compañero o de un PNJ no pasa por aquí.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { SystemBase } from '../core/SystemBase.js';
import { fotoDeLegado } from './Legado.js';
import * as Registro from '../persistence/RegistroRuns.js';

export const EVENTOS_MUERTE = Object.freeze({ FIN: 'run:ended' });

/** Un identificador de run nuevo (identidad, no azar de juego). */
export function nuevoRunId() {
  return `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export class Muerte extends SystemBase {
  static nombre = 'muerte';
  static dependencias = ['player'];

  alIniciar() {
    this._ultimoDano = null;
    this._enemigos = [];
    this.escuchar('player:damaged', (d) => { this._ultimoDano = d?.origen ?? null; });
    this.escuchar('combat:start', (d) => { this._enemigos = (d?.enemigos ?? []).map((e) => e.nombre).filter(Boolean); });
    this.escuchar('player:down', () => this.morir());
    this.escuchar('player:defeated', (d) => this.morir({ origen: d?.origen ?? 'combate' }));
  }

  /** ¿Esta partida ha terminado con la muerte del personaje? */
  get muerto() {
    return Boolean(this.leer('meta.muerte'));
  }

  /**
   * Cierra la partida. Idempotente.
   * @param {{origen?: string}} [opciones]
   * @returns {Object|null} La muerte registrada, o null si ya lo estaba.
   */
  morir({ origen = null } = {}) {
    if (this.leer('meta.muerte')) return null;
    const estado = this.store.getState();
    const jugador = estado.player ?? {};
    if (!jugador.nombre) return null;

    let runId = estado.meta?.runId;
    if (!runId) {
      runId = nuevoRunId();
      this.store.fijar('meta.runId', runId);
    }

    const de = origen ?? (this._ultimoDano === 'combate' ? 'combate' : this._ultimoDano);
    const causa = de === 'combate'
      ? `Cayó en combate${this._enemigos.length ? ` contra ${[...new Set(this._enemigos)].join(', ').replace(/, ([^,]*)$/, ' y $1')}` : ''}.`
      : de === 'privación' || de === 'privacion'
        ? 'Cayó agotado: el cuerpo no aguantó más.'
        : 'Cayó y no volvió a levantarse.';
    const t = estado.world?.tiempo ?? {};
    const muerte = {
      runId,
      nombre: jugador.nombre,
      clase: jugador.clase ?? null,
      raza: jugador.raza ?? null,
      nivel: jugador.nivel ?? 1,
      causa,
      origen: de ?? null,
      momento: { dia: t.dia ?? null, hora: t.hora ?? null, minuto: t.minuto ?? null, diasTotales: t.diasTotales ?? null, lugar: estado.world?.ubicacion ?? null },
      turno: estado.meta?.turno ?? 0,
      resumen: {
        turnos: estado.meta?.turno ?? 0,
        xp: jugador.xp ?? 0,
        oro: jugador.oro ?? estado.inventory?.oro ?? null,
        misionesCompletadas: (estado.quests?.completadas ?? []).length,
      },
      legado: fotoDeLegado(estado, { runId }),
      registrada: Date.now(),
    };

    // Todo de una vez: vida a 0 (una derrota es una muerte aunque quedara
    // algo), fase terminal y el hecho.
    this.store.transaccion(() => {
      if ((jugador.vida?.actual ?? 0) > 0) this.store.fijar('player.vida.actual', 0);
      this.store.fijar('meta.fase', 'fin');
      this.store.fijar('meta.muerte', muerte);
    });

    // Lo que estuviera en marcha se cierra sin resultado.
    const travel = this.sistema('travel');
    if (travel?._viaje) travel._viaje = null;
    const exploracion = this.sistema('exploration');
    if (exploracion?._encuentro) exploracion._encuentro = null;

    // La marca y la herencia, antes de ofrecer partida nueva. Si no se pueden
    // escribir, se dice: no se promete lo que no ha ocurrido.
    const marca = Registro.marcarMuerto(runId, { nombre: jugador.nombre, causa });
    const legado = Registro.guardarLegado(muerte.legado);
    const guardado = { marca: marca.ok, legado: legado.ok, error: marca.error ?? legado.error ?? null };
    this.store.fijar('meta.muerte.guardado', guardado);

    this.emitir(EVENTOS_MUERTE.FIN, { ...muerte, guardado });
    return { ...muerte, guardado };
  }
}

export default Muerte;
