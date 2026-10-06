/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCANVEIL · ui/components/MapPanel.js
 * ---------------------------------------------------------------------------
 * Mapa del mundo.
 *
 * SVG generado a partir del grafo: no hay imagen de fondo ni coordenadas en los
 * datos. Las posiciones se derivan de la estructura, agrupando por región.
 *
 * Tres decisiones de presentación:
 *
 *   · LOS INTUIDOS SE VEN ATENUADOS. Un lugar del que has oído hablar pero no
 *     sabes alcanzar aparece translúcido y sin conexiones. Saber que existe es
 *     un aliciente para buscarlo.
 *
 *   · LAS RUTAS PELIGROSAS SE VEN EN ROJO. El peligro de un tramo es
 *     información que el jugador tiene antes de salir, no una sorpresa.
 *
 *   · PULSAR UN DESTINO MUESTRA EL PLAN, NO INICIA EL VIAJE. Horas,
 *     provisiones y peligro antes de confirmar.
 *
 * Dependencias: Component, DOM, MapGraph, locations.data.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { Component } from '../Component.js';
import { h, svg, icono, vaciar, clase } from '../DOM.js';
import { cabecera, vacio } from './Panel.js';
import * as Mapa from '../../world/MapGraph.js';
import { obtenerLugar, obtenerRegion } from '../../data/locations.data.js';
import { TEXTOS } from '../../config/ui.config.js';

/** Dimensiones del lienzo SVG. */
const ANCHO = 100;
const ALTO = 100;

export class MapPanel extends Component {
  static nombre = 'mapa';
  static rama = 'world';

  constructor(contexto, opciones) {
    super(contexto, opciones);

    /** Lugar seleccionado para ver su plan de viaje. @private */
    this._seleccionado = null;
  }

  /* ═══════════════════════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════════════════════ */

  /**
   * @param {Object} world
   * @returns {Node}
   * @protected
   */
  render(world) {
    const conocidos = world?.localizaciones?.porId ?? {};
    const hayMapa = Object.keys(conocidos).length > 0;

    return h('div.stack.stack--sm', {},
      cabecera({
        titulo: TEXTOS.paneles.mapa,
        icono: 'mapa',
        contador: hayMapa ? String(Object.keys(conocidos).length) : null,
      }),

      hayMapa ? this._lienzo(world, conocidos) : vacio('Aún no conoces ningún sitio.'),

      // ─── Ubicación actual ─────────────────────────────────────────────
      this._fichaActual(world),

      // ─── Plan de viaje ────────────────────────────────────────────────
      this._seleccionado ? this._plan(this._seleccionado) : null,

      // ─── Destinos directos ────────────────────────────────────────────
      this._destinos(),
    );
  }

  /* ═══════════════════════════════════════════════════════════════════════
     LIENZO
     ═══════════════════════════════════════════════════════════════════════ */

  /**
   * Dibuja el mapa como SVG.
   * @private
   */
  _lienzo(world, conocidos) {
    // Solo los no intuidos entran en el grafo de rutas.
    const alcanzables = new Set(
      Object.entries(conocidos).filter(([, l]) => !l.intuido).map(([id]) => id),
    );

    const todos = new Set(Object.keys(conocidos));

    const opciones = {
      conocidos: alcanzables,
      estacion: world?.tiempo?.estacion,
      efectosEventos: this.ui?.registry?.obtener?.('events')?.efectos() ?? {},
    };

    const posiciones = Mapa.posiciones({ conocidos: todos });
    const aristas = Mapa.aristas(posiciones, opciones);

    const actual = world?.ubicacion;

    return h('div', {
      ref: this.ref('lienzo'),
      style: {
        background: 'var(--c-superficie-2)',
        borderRadius: 'var(--r-sm)',
        padding: 'var(--sp-1)',
      },
    },
      svg('svg', {
        viewBox: `0 0 ${ANCHO} ${ALTO}`,
        style: { width: '100%', height: 'auto', display: 'block' },
        attrs: { role: 'img', 'aria-label': 'Mapa de los reinos conocidos' },
      },
        // ─── Rutas ────────────────────────────────────────────────────────
        ...aristas.map((a) => svg('line', {
          attrs: {
            x1: a.x1, y1: a.y1, x2: a.x2, y2: a.y2,
            stroke: a.peligro >= 3 ? 'var(--c-peligro)'
              : a.peligro >= 2 ? 'var(--c-aviso)'
              : 'var(--c-borde-fuerte)',
            'stroke-width': a.tipo === 'camino' ? 0.6 : 0.35,
            'stroke-dasharray': a.tipo === 'sendero' || a.tipo === 'travesia' ? '1.5 1' : null,
            opacity: 0.7,
          },
        })),

        // ─── Nodos ────────────────────────────────────────────────────────
        ...[...posiciones.entries()].map(([refId, pos]) => {
          const estado = conocidos[refId];
          const lugar = obtenerLugar(refId);
          const esActual = refId === actual;
          const intuido = estado?.intuido;

          return svg('g', {
            attrs: { transform: `translate(${pos.x} ${pos.y})`, style: 'cursor: pointer' },
            dataset: { lugar: refId },
          },
            // Halo del lugar actual.
            esActual
              ? svg('circle', {
                  attrs: { r: 3.6, fill: 'var(--c-acento)', opacity: 0.25 },
                })
              : null,

            svg('circle', {
              attrs: {
                r: this._radio(lugar),
                fill: esActual ? 'var(--c-acento)'
                  : estado?.visitado ? 'var(--c-texto-suave)'
                  : 'var(--c-superficie-3)',
                stroke: intuido ? 'var(--c-texto-tenue)' : 'var(--c-borde-fuerte)',
                'stroke-width': 0.3,
                'stroke-dasharray': intuido ? '0.8 0.6' : null,
                opacity: intuido ? 0.45 : 1,
              },
            }),

            svg('text', {
              attrs: {
                y: this._radio(lugar) + 2.6,
                'text-anchor': 'middle',
                'font-size': 2.2,
                fill: esActual ? 'var(--c-acento-claro)' : 'var(--c-texto-tenue)',
                opacity: intuido ? 0.5 : 1,
              },
              text: lugar?.nombre ?? refId,
            }),
          );
        }),
      ),

      // ─── Leyenda ──────────────────────────────────────────────────────
      h('div.row', {
        style: {
          gap: 'var(--sp-2)',
          justifyContent: 'center',
          fontSize: 'var(--f-2xs)',
          color: 'var(--c-texto-tenue)',
          marginTop: 'var(--sp-1)',
          flexWrap: 'wrap',
        },
      },
        h('span', { text: '● aquí' }),
        h('span', { style: { color: 'var(--c-aviso)' }, text: '— ruta insegura' }),
        h('span', { style: { color: 'var(--c-peligro)' }, text: '— peligrosa' }),
        h('span', { style: { opacity: '0.5' }, text: '○ solo oído' }),
      ),
    );
  }

  /** @private */
  _radio(lugar) {
    if (!lugar) return 1.4;

    const porTipo = {
      asentamiento: 1.4 + (lugar.tamano ?? 0) * 0.35,
      mazmorra: 1.5,
      ruina: 1.4,
      natural: 1.2,
      punto: 1,
    };

    return porTipo[lugar.tipo] ?? 1.2;
  }

  /* ═══════════════════════════════════════════════════════════════════════
     FICHAS
     ═══════════════════════════════════════════════════════════════════════ */

  /** @private */
  _fichaActual(world) {
    const lugar = obtenerLugar(world?.ubicacion);
    if (!lugar) return null;

    const region = obtenerRegion(world.region);
    const estado = world.localizaciones?.porId?.[world.ubicacion];

    return h('div', {
      style: {
        padding: 'var(--sp-2)',
        background: 'var(--c-superficie-2)',
        borderRadius: 'var(--r-sm)',
        borderLeft: 'var(--bw-thick) solid var(--c-acento)',
      },
    },
      h('div.row.row--between', {},
        h('span', {
          style: {
            fontFamily: 'var(--f-display)',
            fontSize: 'var(--f-sm)',
            color: 'var(--c-texto-titulo)',
          },
          text: lugar.nombre,
        }),
        h('span.eyebrow', { text: region?.nombre ?? '' }),
      ),

      // Grado de exploración.
      estado
        ? h('div', { style: { marginTop: 'var(--sp-1)' } },
            h('div.statbar__track', { style: { height: '3px' } },
              h('div.statbar__fill', {
                style: {
                  width: `${Math.round((estado.exploracion ?? 0) * 100)}%`,
                  '--statbar-color': 'var(--c-info)',
                },
              }),
            ),
            h('span', {
              style: { fontSize: 'var(--f-2xs)', color: 'var(--c-texto-tenue)' },
              text: this._etiquetaExploracion(estado),
            }),
          )
        : null,

      // Servicios, con su estado de apertura.
      this._servicios(),
    );
  }

  /** @private */
  _etiquetaExploracion(estado) {
    const f = estado.exploracion ?? 0;
    if (f >= 1) return 'registrado a fondo';
    if (f >= 0.6) return 'bastante explorado';
    if (f >= 0.3) return 'apenas visto';
    return 'sin explorar';
  }

  /** @private */
  _servicios() {
    const time = this.ui?.registry?.obtener?.('time');
    const servicios = time?.serviciosDisponibles() ?? [];

    if (!servicios.length) return null;

    const iconos = {
      posada: 'corazon', herrero: 'espada', mercado: 'oro',
      templo: 'mana', archivo: 'pergamino', gremio: 'bolsa',
    };

    return h('div.row', {
      style: { gap: 'var(--sp-2)', marginTop: 'var(--sp-2)', flexWrap: 'wrap' },
    },
      ...servicios.map((s) => h('span.row', {
        style: { gap: '2px', opacity: s.abierto ? '1' : '0.35' },
        attrs: { title: s.abierto ? s.servicio : s.nota },
      },
        icono(iconos[s.servicio] ?? 'bolsa', { class: 'icon--sm' }),
        h('span', { style: { fontSize: 'var(--f-2xs)' }, text: s.servicio }),
      )),
    );
  }

  /* ═══════════════════════════════════════════════════════════════════════
     DESTINOS Y PLAN
     ═══════════════════════════════════════════════════════════════════════ */

  /** @private */
  _destinos() {
    const world = this.ui?.registry?.obtener?.('world');
    const destinos = world?.destinos() ?? [];

    if (!destinos.length) return null;

    return h('div.stack.stack--sm', {},
      h('span.eyebrow', { text: 'Desde aquí puedes ir a' }),

      ...destinos.map((d) => h('button.choice', {
        type: 'button',
        dataset: { destino: d.refId },
        style: { justifyContent: 'space-between', width: '100%' },
      },
        h('span.row', { style: { gap: 'var(--sp-1)' } },
          icono('mapa', { class: 'icon--sm' }),
          h('span', { text: d.nombre }),
        ),

        h('span.row', { style: { gap: 'var(--sp-1)' } },
          d.peligro >= 2
            ? h('span', {
                style: {
                  fontSize: 'var(--f-2xs)',
                  color: d.peligro >= 3 ? 'var(--c-peligro)' : 'var(--c-aviso)',
                },
                text: d.peligro >= 3 ? 'peligroso' : 'inseguro',
              })
            : null,
          h('span', {
            style: { fontSize: 'var(--f-2xs)', color: 'var(--c-texto-tenue)' },
            text: `${d.distancia} h`,
          }),
        ),
      )),
    );
  }

  /**
   * Plan de viaje a un destino.
   *
   * Se muestra antes de confirmar: el jugador debe saber a qué se compromete.
   *
   * @private
   */
  _plan(refId) {
    const travel = this.ui?.registry?.obtener?.('travel');
    const plan = travel?.planificar(refId);

    if (!plan) return null;

    const lugar = obtenerLugar(refId);

    return h('div', {
      style: {
        padding: 'var(--sp-3)',
        background: 'var(--c-superficie-3)',
        borderRadius: 'var(--r-sm)',
        border: 'var(--bw-hair) solid var(--c-acento)',
      },
    },
      h('div.row.row--between', {},
        h('span', {
          style: { fontFamily: 'var(--f-display)', color: 'var(--c-texto-titulo)' },
          text: `Viajar a ${lugar?.nombre}`,
        }),
        h('button.btn.btn--ghost.btn--sm.btn--icon', {
          type: 'button',
          attrs: { 'aria-label': 'Cerrar' },
          onClick: () => { this._seleccionado = null; this.refrescar(); },
        }, icono('cerrar', { class: 'icon--sm' })),
      ),

      !plan.viable
        ? h('p', {
            style: { fontSize: 'var(--f-xs)', color: 'var(--c-peligro)', marginTop: 'var(--sp-2)' },
            text: plan.motivo,
          })
        : h('div.stack.stack--sm', { style: { marginTop: 'var(--sp-2)' } },
            h('p', {
              style: { fontSize: 'var(--f-xs)', color: 'var(--c-texto-suave)' },
              text: plan.descripcion,
            }),

            // Sin provisiones obligatorias (6-oct-2026): viajar no gasta
            // raciones ni agua, y no hace falta llevarlas.

            plan.llegaDeNoche
              ? h('p', {
                  style: { fontSize: 'var(--f-2xs)', color: 'var(--c-aviso)' },
                  text: 'Se te hará de noche por el camino.',
                })
              : null,

            // ─── Confirmación ───────────────────────────────────────────
            h('button.btn.btn--primary.btn--sm.btn--block', {
              type: 'button',
              onClick: () => this._viajar(refId, plan),
            },
              icono('mapa', { class: 'icon--sm' }),
              h('span', { text: plan.sinProvisiones ? 'Ir de todos modos' : 'Emprender el viaje' }),
            ),
          ),
    );
  }

  /* ═══════════════════════════════════════════════════════════════════════
     INTERACCIÓN
     ═══════════════════════════════════════════════════════════════════════ */

  /** @protected */
  alMontar() {
    // Nodos del mapa.
    this.delegar(this.el, 'click', '[data-lugar]', (e, nodo) => {
      const refId = nodo.dataset.lugar;
      const actual = this.leer('world.ubicacion');

      if (refId === actual) return;

      const estado = this.leer(`world.localizaciones.porId.${refId}`);

      if (estado?.intuido) {
        this.ui?.avisar('Sabes que existe, pero no cómo llegar.', { tipo: 'info' });
        return;
      }

      this._seleccionado = this._seleccionado === refId ? null : refId;
      this.refrescar();
    });

    // Botones de destino.
    this.delegar(this.el, 'click', '[data-destino]', (e, boton) => {
      const refId = boton.dataset.destino;
      this._seleccionado = this._seleccionado === refId ? null : refId;
      this.refrescar();
    });

    // ─── Avisos ─────────────────────────────────────────────────────────
    this.escuchar('world:discovered', ({ nombre, intuido }) => {
      clase(this.el, 'is-levelup', true);
      this.espera(() => clase(this.el, 'is-levelup', false), 900);
    });

    this.escuchar('travel:arrived', () => {
      this._seleccionado = null;
      this.refrescar();
    });

    this.escuchar('travel:interrupted', () => this.refrescar());
  }

  /**
   * Emprende el viaje, confirmando si faltan provisiones.
   * @private
   */
  async _viajar(refId, plan) {
    const travel = this.ui?.registry?.obtener?.('travel');

    if (plan.sinProvisiones) {
      const seguro = await this.ui?.confirmar(
        'No llevas provisiones suficientes para este camino. ¿Salir igualmente?',
        { titulo: 'Sin provisiones', si: 'Salir', no: 'Cancelar', peligroso: true },
      );

      if (!seguro) return;
    }

    this._seleccionado = null;
    this.ui?.cajon?.('derecho', false);

    await travel?.viajar(refId, { forzar: true });

    this.refrescar();
  }

  /**
   * @param {Object} world
   * @param {Object} anterior
   * @returns {boolean}
   * @protected
   */
  actualizar(world, anterior) {
    // El mapa se rehace cuando cambia lo que muestra.
    if (world?.ubicacion !== anterior?.ubicacion) return false;
    if (world?.localizaciones !== anterior?.localizaciones) return false;
    if (world?.sublugar !== anterior?.sublugar) return false;

    return true;
  }

  /** @protected */
  alDestruir() {
    this._seleccionado = null;
  }
}

export default MapPanel;
