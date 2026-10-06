/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCANVEIL · world/World.js
 * ---------------------------------------------------------------------------
 * Coordinador del mundo.
 *
 * Reúne lo que hacen los demás módulos de esta carpeta y se ocupa de lo que
 * ninguno cubre por separado:
 *
 *   · DÓNDE ESTÁ EL PERSONAJE — ubicación, región, sublugar
 *   · QUÉ CONOCE — descubrimiento de lugares y su estado
 *   · CONTEXTO ESPACIAL — la sección del prompt que sitúa la escena
 *
 * El tercero es el que más aporta al juego. Sin él, el director describe un
 * bosque genérico; con él, describe el Bosque Cenizo, de noche, con niebla,
 * sabiendo que el personaje ya estuvo aquí dos veces y que la última vez
 * encontró algo.
 *
 * Dependencias: SystemBase, Location, Region, MapGraph, datos del mundo.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { SystemBase } from '../core/SystemBase.js';
import * as Lugar from './Location.js';
import * as Region from './Region.js';
import * as Mapa from './MapGraph.js';
import {
  obtenerLugar, obtenerRegion, lugaresIniciales,
  obtenerSublugar, inicioSegunLinaje, buscarLugar,
} from '../data/locations.data.js';

/** Eventos publicados. */
export const EVENTOS_MUNDO = Object.freeze({
  LLEGADA: 'world:arrived',
  DESCUBRIMIENTO: 'world:discovered',
  REGION: 'world:region:change',
  SUBLUGAR: 'world:sublugar:change',
});

export class World extends SystemBase {
  static nombre = 'world';
  static dependencias = ['clock'];
  static canal = 'world';

  /* ═══════════════════════════════════════════════════════════════════════
     CICLO DE VIDA
     ═══════════════════════════════════════════════════════════════════════ */

  alIniciar() {
    this.reductores({
      'world/descubrir': this._reducirDescubrir,
      'world/llegar': this._reducirLlegar,
      'world/sublugar': this._reducirSublugar,
      'world/explorar': this._reducirExplorar,
      'world/sublugar/ver': this._reducirVerSublugar,
      'world/lugar/evolucionar': this._reducirEvolucionar,
      'world/lugar/anotar': this._reducirAnotar,
      'world/gancho': this._reducirGancho,
      'world/terreno': this._reducirTerreno,
    });

    // Al crear el personaje se sitúa según su linaje.
    this.escuchar('player:created', ({ raza }) => this._situarInicial(raza));

    // El director puede establecer hechos sobre el lugar.
    this.escuchar('world:note', ({ texto }) => {
      this.despachar('world/lugar/anotar', {
        refId: this.leer('world.ubicacion'),
        nota: texto,
      });
    });
  }

  alArrancar() {
    // Si no hay lugares conocidos, se abren los iniciales.
    if (!this.leer('world.localizaciones.orden', []).length) {
      this._abrirIniciales();
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════
     SITUACIÓN INICIAL
     ═══════════════════════════════════════════════════════════════════════ */

  /**
   * Abre los lugares visibles al empezar.
   * @private
   */
  _abrirIniciales() {
    for (const lugar of lugaresIniciales()) {
      this.despachar('world/descubrir', {
        refId: lugar.refId,
        motivo: 'inicial',
        silencioso: true,
      });
    }
  }

  /**
   * Sitúa al personaje según su linaje.
   *
   * Empezar donde vive tu gente hace que el mundo se sienta tuyo desde el
   * primer turno, en vez de aterrizar en un sitio neutro.
   *
   * @param {string} raza
   * @private
   */
  _situarInicial(raza) {
    const refId = inicioSegunLinaje(raza);

    // Por si el lugar de inicio no estaba entre los visibles.
    this.despachar('world/descubrir', { refId, motivo: 'inicial', silencioso: true });

    this.llegarA(refId, { silencioso: true });

    this.log.info(`personaje situado en ${obtenerLugar(refId)?.nombre}`);
  }

  /* ═══════════════════════════════════════════════════════════════════════
     MOVIMIENTO
     ═══════════════════════════════════════════════════════════════════════ */

  /**
   * Sitúa al personaje en un lugar.
   *
   * @param {string} refId
   * @param {Object} [opciones]
   * @returns {{exito: boolean, motivo: string|null}}
   */
  llegarA(refId, opciones = {}) {
    const lugar = obtenerLugar(refId);
    if (!lugar) return { exito: false, motivo: 'lugar desconocido' };

    const anterior = this.leer('world.ubicacion');
    const regionAnterior = this.leer('world.region');
    const dia = this.leer('world.tiempo.diasTotales', 0);

    // ─── Estado del lugar ───────────────────────────────────────────────
    const estado = this.leer(`world.localizaciones.porId.${refId}`)
      ?? Lugar.crear(refId, { dia });

    const visita = Lugar.visitar(estado, dia);

    this.despachar('world/llegar', {
      refId,
      region: lugar.region,
      terreno: lugar.terreno,
      estado: visita.estado,
    });

    // Un campamento se queda donde se montó: al irse, deja de existir (no
    // vuelve a valer al regresar). Ver `player/Comida.js`.
    if (this.leer('world.campamento', null) && refId !== anterior) this.store.fijar('world.campamento', null);

    // ─── Cambio de región ───────────────────────────────────────────────
    if (lugar.region !== regionAnterior) {
      this.emitir(EVENTOS_MUNDO.REGION, {
        anterior: regionAnterior,
        region: lugar.region,
        nombre: obtenerRegion(lugar.region)?.nombre,
      });
    }

    // ─── Aviso ──────────────────────────────────────────────────────────
    this.emitir(EVENTOS_MUNDO.LLEGADA, {
      refId,
      nombre: lugar.nombre,
      primeraVez: visita.primeraVez,
      cambios: visita.cambiosPendientes,
    });

    if (opciones.silencioso) return { exito: true, motivo: null };

    // ─── Narración ──────────────────────────────────────────────────────
    // Lo que cambió durante la ausencia se pasa al director, no se narra aquí:
    // él sabrá integrarlo mejor.
    if (visita.cambiosPendientes.length) {
      this.emitir('memory:context', {
        texto: `HA CAMBIADO DESDE LA ÚLTIMA VISITA: ${Lugar.describirCambios(visita.cambiosPendientes)}`,
        temporal: true,
      });
    }

    if (visita.primeraVez) {
      this.emitir('memory:remember', {
        texto: `Llegó por primera vez a ${lugar.nombre}.`,
        peso: 2,
      });
    }

    return { exito: true, motivo: null };
  }

  /**
   * Entra o sale de un interior.
   *
   * @param {string|null} refIdSublugar null para salir.
   * @returns {{exito: boolean, motivo: string|null}}
   */
  entrarEn(refIdSublugar) {
    if (refIdSublugar === null) {
      this.despachar('world/sublugar', { sublugar: null });
      this.emitir(EVENTOS_MUNDO.SUBLUGAR, { sublugar: null });
      return { exito: true, motivo: null };
    }

    const sublugar = obtenerSublugar(refIdSublugar);
    const actual = this.leer('world.ubicacion');

    if (!sublugar || sublugar.lugar !== actual) {
      return { exito: false, motivo: 'Eso no está aquí.' };
    }

    // ─── Horario ────────────────────────────────────────────────────────
    if (sublugar.tipo) {
      const time = this.sistema('time');
      const disponible = time?.puedeUsar(sublugar.tipo);

      if (disponible && !disponible.disponible) {
        this.emitir('narrative:direct', { texto: disponible.motivo, voz: 'system' });
        return { exito: false, motivo: disponible.motivo };
      }
    }

    this.despachar('world/sublugar', { sublugar: refIdSublugar });
    this.despachar('world/sublugar/ver', { refId: actual, sublugar: refIdSublugar });

    this.emitir(EVENTOS_MUNDO.SUBLUGAR, {
      sublugar: refIdSublugar,
      nombre: sublugar.nombre,
    });

    return { exito: true, motivo: null };
  }

  /* ═══════════════════════════════════════════════════════════════════════
     DESCUBRIMIENTO
     ═══════════════════════════════════════════════════════════════════════ */

  /**
   * Descubre un lugar.
   *
   * @param {string} refId
   * @param {string} motivo Cómo se descubrió.
   * @returns {boolean}
   */
  descubrir(refId, motivo = 'exploracion') {
    if (this.leer(`world.localizaciones.porId.${refId}`)) return false;

    this.despachar('world/descubrir', { refId, motivo });
    return true;
  }

  /**
   * Intuye un lugar: se sabe que existe pero no cómo llegar.
   *
   * Es un estado intermedio útil: un rumor puede mencionar un sitio sin
   * revelar su ubicación, y eso da al jugador algo que buscar.
   *
   * @param {string} refId
   * @returns {boolean}
   */
  intuir(refId) {
    if (this.leer(`world.localizaciones.porId.${refId}`)) return false;

    this.despachar('world/descubrir', { refId, motivo: 'rumor', intuido: true });
    return true;
  }

  /* ═══════════════════════════════════════════════════════════════════════
     GANCHOS
     ═══════════════════════════════════════════════════════════════════════ */

  /**
   * Ganchos del lugar actual sin usar.
   * @returns {string[]}
   */
  ganchosDisponibles() {
    const refId = this.leer('world.ubicacion');
    const estado = this.leer(`world.localizaciones.porId.${refId}`);

    return estado ? Lugar.ganchosDisponibles(estado) : [];
  }

  /**
   * Marca un gancho como usado.
   * @param {string} gancho
   */
  usarGancho(gancho) {
    this.despachar('world/gancho', {
      refId: this.leer('world.ubicacion'),
      gancho,
    });
  }

  /* ═══════════════════════════════════════════════════════════════════════
     REDUCTORES
     ═══════════════════════════════════════════════════════════════════════ */

  /** @private */
  _reducirDescubrir(estado, accion) {
    const { refId, motivo, intuido, silencioso } = accion.payload ?? {};
    if (!refId) return null;

    const localizaciones = estado.world.localizaciones;
    if (localizaciones.porId[refId]) return null;

    const dia = estado.world.tiempo?.diasTotales ?? 0;
    const nuevo = Lugar.crear(refId, { motivo, dia, intuido });

    if (!nuevo) return null;

    // ─── Región ─────────────────────────────────────────────────────────
    const regiones = { ...estado.world.regiones };

    if (!regiones[nuevo.region]) {
      regiones[nuevo.region] = Region.crear(nuevo.region, { dia });
    }

    if (!silencioso) {
      queueMicrotask(() => {
        const lugar = obtenerLugar(refId);

        this.emitir(EVENTOS_MUNDO.DESCUBRIMIENTO, {
          refId,
          nombre: lugar?.nombre,
          motivo,
          intuido: Boolean(intuido),
        });

        this.emitir('ui:notice', {
          mensaje: intuido
            ? `Has oído hablar de ${lugar?.nombre}.`
            : `Has descubierto ${lugar?.nombre}.`,
          tipo: 'exito',
          icono: 'mapa',
        });
      });
    }

    return {
      world: {
        localizaciones: {
          porId: { ...localizaciones.porId, [refId]: nuevo },
          orden: [...localizaciones.orden, refId],
        },
        regiones,
      },
    };
  }

  /** @private */
  _reducirLlegar(estado, accion) {
    const { refId, region, terreno, estado: estadoLugar } = accion.payload ?? {};
    if (!refId) return null;

    const dia = estado.world.tiempo?.diasTotales ?? 0;

    // La región se marca como visitada.
    const regiones = { ...estado.world.regiones };

    if (regiones[region]) {
      regiones[region] = Region.visitar(regiones[region], dia).estado;
    } else {
      regiones[region] = Region.crear(region, { dia, visitada: true });
    }

    return {
      world: {
        ubicacion: refId,
        region,
        terreno,
        sublugar: null,
        localizaciones: {
          ...estado.world.localizaciones,
          porId: { ...estado.world.localizaciones.porId, [refId]: estadoLugar },
        },
        regiones,
      },
    };
  }

  /** @private */
  _reducirSublugar(estado, accion) {
    return { world: { sublugar: accion.payload?.sublugar ?? null } };
  }

  /** @private */
  _reducirExplorar(estado, accion) {
    const { refId, cantidad } = accion.payload ?? {};

    const actual = estado.world.localizaciones.porId[refId];
    if (!actual) return null;

    const r = Lugar.explorar(actual, cantidad ?? 0.1);

    if (r.completo) {
      queueMicrotask(() => {
        this.emitir('ui:notice', {
          mensaje: 'Has registrado este lugar a fondo.',
          tipo: 'info',
        });
      });
    }

    return {
      world: {
        localizaciones: {
          ...estado.world.localizaciones,
          porId: { ...estado.world.localizaciones.porId, [refId]: r.estado },
        },
      },
    };
  }

  /** @private */
  _reducirVerSublugar(estado, accion) {
    const { refId, sublugar } = accion.payload ?? {};

    const actual = estado.world.localizaciones.porId[refId];
    if (!actual) return null;

    return {
      world: {
        localizaciones: {
          ...estado.world.localizaciones,
          porId: {
            ...estado.world.localizaciones.porId,
            [refId]: Lugar.verSublugar(actual, sublugar),
          },
        },
      },
    };
  }

  /** @private */
  _reducirEvolucionar(estado, accion) {
    const { refId, cambio } = accion.payload ?? {};

    const actual = estado.world.localizaciones.porId[refId];
    if (!actual) return null;

    return {
      world: {
        localizaciones: {
          ...estado.world.localizaciones,
          porId: {
            ...estado.world.localizaciones.porId,
            [refId]: Lugar.registrarCambio(actual, cambio),
          },
        },
      },
    };
  }

  /** @private */
  _reducirAnotar(estado, accion) {
    const { refId, nota } = accion.payload ?? {};

    const actual = estado.world.localizaciones.porId[refId];
    if (!actual) return null;

    return {
      world: {
        localizaciones: {
          ...estado.world.localizaciones,
          porId: {
            ...estado.world.localizaciones.porId,
            [refId]: Lugar.anotar(actual, nota),
          },
        },
      },
    };
  }

  /** @private */
  _reducirGancho(estado, accion) {
    const { refId, gancho } = accion.payload ?? {};

    const actual = estado.world.localizaciones.porId[refId];
    if (!actual) return null;

    return {
      world: {
        localizaciones: {
          ...estado.world.localizaciones,
          porId: {
            ...estado.world.localizaciones.porId,
            [refId]: Lugar.usarGancho(actual, gancho),
          },
        },
      },
    };
  }

  /** @private */
  _reducirTerreno(estado, accion) {
    return { world: { terreno: accion.payload?.terreno ?? estado.world.terreno } };
  }

  /* ═══════════════════════════════════════════════════════════════════════
     CONSULTAS
     ═══════════════════════════════════════════════════════════════════════ */

  /**
   * Lugar actual, plantilla y estado.
   * @returns {{plantilla: Object, estado: Object}|null}
   */
  lugarActual() {
    const refId = this.leer('world.ubicacion');
    if (!refId) return null;

    return {
      plantilla: obtenerLugar(refId),
      estado: this.leer(`world.localizaciones.porId.${refId}`),
    };
  }

  /**
   * Destinos alcanzables desde aquí.
   * @returns {Array<Object>}
   */
  destinos() {
    const origen = this.leer('world.ubicacion');

    const conocidos = new Set(
      Object.entries(this.leer('world.localizaciones.porId', {}))
        .filter(([, l]) => !l.intuido)
        .map(([refId]) => refId),
    );

    return Mapa.vecinos(origen, {
      conocidos,
      estacion: this.leer('world.tiempo.estacion'),
      efectosEventos: this.sistema('events')?.efectos() ?? {},
    });
  }

  /**
   * Busca un lugar por nombre, entre los conocidos.
   *
   * La usa el enrutador cuando el jugador escribe «voy a Forja Alta».
   *
   * @param {string} texto
   * @returns {{refId: string, nombre: string, conocido: boolean}|null}
   */
  buscarDestino(texto) {
    const lugar = buscarLugar(texto);
    if (!lugar) return null;

    const estado = this.leer(`world.localizaciones.porId.${lugar.refId}`);

    return {
      refId: lugar.refId,
      nombre: lugar.nombre,
      conocido: Boolean(estado) && !estado.intuido,
      intuido: Boolean(estado?.intuido),
    };
  }

  /**
   * Datos del mundo para la interfaz.
   * @returns {Object}
   */
  paraInterfaz() {
    const actual = this.lugarActual();
    const reputaciones = this.leer('factions.reputacion', {});
    const conocidos = this.leer('world.localizaciones.porId', {});

    const region = this.leer('world.region');
    const estadoRegion = this.leer(`world.regiones.${region}`);

    return {
      lugar: actual?.estado ? Lugar.paraInterfaz(actual.estado) : null,
      region: estadoRegion
        ? Region.paraInterfaz(estadoRegion, conocidos, reputaciones)
        : null,
      sublugar: this.leer('world.sublugar'),
      terreno: this.leer('world.terreno'),
      destinos: this.destinos(),
      eventos: this.sistema('events')?.activosAqui() ?? [],
      descubiertos: Object.keys(conocidos).length,
    };
  }

  /**
   * Contexto espacial para el director.
   *
   * Es la sección más valiosa del prompt: sitúa la escena en un lugar concreto
   * con su historia, en vez de un escenario genérico.
   *
   * @returns {string}
   */
  paraDirector() {
    const partes = [];

    const actual = this.lugarActual();

    // ─── Lugar ──────────────────────────────────────────────────────────
    if (actual?.estado) {
      partes.push(Lugar.paraDirector(actual.estado));
    }

    // ─── Sublugar ───────────────────────────────────────────────────────
    const sublugar = this.leer('world.sublugar');
    if (sublugar) {
      const s = obtenerSublugar(sublugar);
      if (s) partes.push(`El personaje está dentro de ${s.nombre}.`);
    }

    // ─── Región ─────────────────────────────────────────────────────────
    const region = this.leer('world.region');
    const estadoRegion = this.leer(`world.regiones.${region}`);

    if (estadoRegion) {
      partes.push(Region.paraDirector(estadoRegion, this.leer('factions.reputacion', {})));
    }

    // ─── Tiempo y clima ─────────────────────────────────────────────────
    const time = this.sistema('time')?.paraDirector();
    if (time) partes.push(time);

    const clima = this.sistema('weather')?.paraDirector();
    if (clima) partes.push(clima);

    // ─── Eventos ────────────────────────────────────────────────────────
    const eventos = this.sistema('events')?.paraDirector();
    if (eventos) partes.push(eventos);

    // ─── Viaje en curso ─────────────────────────────────────────────────
    const viaje = this.sistema('travel')?.paraDirector();
    if (viaje) partes.push(viaje);

    // ─── Exploración ────────────────────────────────────────────────────
    const exploracion = this.sistema('exploration')?.paraDirector();
    if (exploracion) partes.push(exploracion);

    return partes.filter(Boolean).join('\n\n');
  }

  /**
   * Resumen del mundo, para depuración.
   * @returns {Object}
   */
  inspeccionar() {
    const conocidos = this.leer('world.localizaciones.porId', {});
    const region = this.leer('world.region');

    return {
      ubicacion: obtenerLugar(this.leer('world.ubicacion'))?.nombre,
      sublugar: this.leer('world.sublugar'),
      region: obtenerRegion(region)?.nombre,
      terreno: this.leer('world.terreno'),
      descubiertos: Object.keys(conocidos).length,
      visitados: Object.values(conocidos).filter((l) => l.visitado).length,
      progresoRegion: Region.progreso(region, conocidos),
      destinos: this.destinos().map((d) => d.nombre),
      eventos: this.sistema('events')?.activosAqui().map((e) => e.nombre) ?? [],
    };
  }
}

export default World;
