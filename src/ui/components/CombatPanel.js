/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCANVEIL · ui/components/CombatPanel.js
 * ---------------------------------------------------------------------------
 * Interfaz de combate.
 *
 * Tres zonas:
 *   · ORDEN DE INICIATIVA — quién actúa, en qué orden, y a quién le toca ahora
 *   · COMBATIENTES — vida y estados de cada uno
 *   · ACCIONES — solo cuando es tu turno
 *
 * Dos decisiones de diseño:
 *
 *   · LAS ACCIONES SOLO APARECEN EN TU TURNO. Un panel de botones inertes
 *     invita a pulsarlos y produce frustración. Si no es tu turno, no hay
 *     botones que pulsar.
 *
 *   · EL OBJETIVO POR DEFECTO ES EL MÁS DÉBIL. Es lo que la mayoría elegiría si
 *     tuviera que pensarlo, así que atacar sin seleccionar hace lo razonable.
 *
 * El jefe, si lo hay, tiene su propia barra grande con las marcas de fase: ver
 * que te acercas al umbral es parte de la tensión.
 *
 * Dependencias: Component, DOM, StatBar, statuses.data.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { Component } from '../Component.js';
import { h, icono, vaciar, clase, texto as fijarTexto } from '../DOM.js';
import { obtenerEstado } from '../../data/statuses.data.js';

export class CombatPanel extends Component {
  static nombre = 'combate';
  static rama = 'combat';

  constructor(contexto, opciones) {
    super(contexto, opciones);

    /** Objetivo seleccionado, o null para el automático. @private */
    this._objetivo = null;
  }

  /* ═══════════════════════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════════════════════ */

  /**
   * @param {Object} combat
   * @returns {Node|null}
   * @protected
   */
  render(combat) {
    if (!combat?.activo) return h('div', { style: { display: 'none' } });

    const manager = this.ui?.registry?.obtener?.('combat');
    const datos = manager?.paraInterfaz();

    if (!datos) return h('div', { style: { display: 'none' } });

    return h('div.combat', { ref: this.ref('raiz') },
      // ─── Cabecera ─────────────────────────────────────────────────────
      h('div.row.row--between', {},
        h('span.eyebrow', {
          style: { color: 'var(--c-peligro)' },
          text: `Combate · ronda ${datos.ronda}`,
        }),
        datos.turnoDelJugador
          ? h('span', {
              style: { fontSize: 'var(--f-2xs)', color: 'var(--c-acento)' },
              text: 'Tu turno',
            })
          : null,
      ),

      // ─── Barra de jefe ────────────────────────────────────────────────
      datos.jefe ? this._barraJefe(datos.jefe) : null,

      // ─── Orden de iniciativa ──────────────────────────────────────────
      this._iniciativa(datos.iniciativa),

      // ─── Combatientes ─────────────────────────────────────────────────
      h('div.stack.stack--sm', { ref: this.ref('combatientes') },
        ...datos.combatientes
          .filter((c) => !c.esJugador)
          .map((c) => this._fichaCombatiente(c, datos.turnoDelJugador)),
      ),

      // ─── Acciones ─────────────────────────────────────────────────────
      datos.esperando ? this._acciones(datos) : this._esperando(datos),
    );
  }

  /* ═══════════════════════════════════════════════════════════════════════
     BARRA DE JEFE
     ═══════════════════════════════════════════════════════════════════════ */

  /**
   * Barra grande del jefe, con las marcas de fase.
   *
   * Ver que te acercas al umbral siguiente es parte de la tensión: sabes que va
   * a cambiar algo y no sabes qué.
   *
   * @private
   */
  _barraJefe(jefe) {
    return h('div', {
      ref: this.ref('jefe'),
      style: {
        padding: 'var(--sp-2)',
        background: 'var(--c-superficie-3)',
        borderRadius: 'var(--r-sm)',
        border: 'var(--bw-hair) solid var(--c-peligro)',
      },
    },
      h('div.row.row--between', {},
        h('span', {
          style: {
            fontFamily: 'var(--f-display)',
            fontSize: 'var(--f-sm)',
            color: 'var(--c-texto-titulo)',
          },
          text: jefe.nombre,
        }),
        jefe.fase
          ? h('span', {
              style: { fontSize: 'var(--f-2xs)', color: 'var(--c-peligro)' },
              text: jefe.fase,
            })
          : null,
      ),

      // Barra con las marcas de umbral superpuestas.
      h('div', { style: { position: 'relative', marginTop: 'var(--sp-1)' } },
        h('div.statbar__track', { style: { height: '12px' } },
          h('div.statbar__fill', {
            style: {
              width: `${Math.round(jefe.fraccion * 100)}%`,
              '--statbar-color': 'var(--c-peligro)',
            },
          }),
        ),

        ...jefe.umbrales.map((u) => h('span', {
          style: {
            position: 'absolute',
            left: `${u * 100}%`,
            top: '0',
            bottom: '0',
            width: '2px',
            background: 'var(--c-texto-titulo)',
            opacity: '0.5',
            pointerEvents: 'none',
          },
        })),
      ),

      jefe.cercaDeCambiar
        ? h('p', {
            style: {
              fontSize: 'var(--f-2xs)',
              color: 'var(--c-aviso)',
              marginTop: '2px',
              fontStyle: 'italic',
            },
            text: 'Algo va a cambiar.',
          })
        : null,
    );
  }

  /* ═══════════════════════════════════════════════════════════════════════
     INICIATIVA
     ═══════════════════════════════════════════════════════════════════════ */

  /** @private */
  _iniciativa(orden) {
    return h('div.initiative', { ref: this.ref('iniciativa') },
      ...orden.map((c) => h('div.initiative__slot', {
        dataset: { combatiente: c.id },
        style: {
          opacity: c.vivo ? '1' : '0.35',
          borderColor: c.activo ? 'var(--c-acento)' : undefined,
          background: c.activo ? 'var(--c-superficie-3)' : undefined,
        },
        attrs: { title: `${c.nombre} · iniciativa ${c.iniciativa}` },
      },
        icono(c.esJugador ? 'corazon' : 'espada', {
          class: 'icon--sm',
          style: {
            color: c.esJugador ? 'var(--c-exito)' : 'var(--c-peligro)',
          },
        }),

        h('span.truncate', {
          style: {
            fontSize: 'var(--f-2xs)',
            textDecoration: c.vivo ? 'none' : 'line-through',
          },
          text: c.nombre,
        }),

        // El siguiente en actuar se marca: ayuda a decidir.
        c.siguiente && !c.activo
          ? h('span', {
              style: { fontSize: 'var(--f-2xs)', color: 'var(--c-texto-tenue)' },
              text: '·',
            })
          : null,
      )),
    );
  }

  /* ═══════════════════════════════════════════════════════════════════════
     COMBATIENTES
     ═══════════════════════════════════════════════════════════════════════ */

  /**
   * Ficha de un enemigo, seleccionable como objetivo.
   * @private
   */
  _fichaCombatiente(c, esMiTurno) {
    const seleccionado = this._objetivo === c.id;

    return h('button', {
      type: 'button',
      dataset: { objetivo: c.id },
      disabled: !c.vivo || !esMiTurno,
      style: {
        display: 'block',
        width: '100%',
        textAlign: 'left',
        padding: 'var(--sp-2)',
        background: seleccionado ? 'var(--c-superficie-3)' : 'var(--c-superficie-2)',
        border: `var(--bw-hair) solid ${seleccionado ? 'var(--c-acento)' : 'transparent'}`,
        borderRadius: 'var(--r-sm)',
        opacity: c.vivo ? '1' : '0.4',
        cursor: c.vivo && esMiTurno ? 'pointer' : 'default',
      },
    },
      h('div.row.row--between', {},
        h('span.truncate', {
          style: {
            fontSize: 'var(--f-xs)',
            textDecoration: c.vivo ? 'none' : 'line-through',
          },
          text: c.nombre,
        }),

        // La condición cualitativa dice más que los números en combate.
        h('span', {
          style: {
            fontSize: 'var(--f-2xs)',
            color: c.fraccionVida > 0.5 ? 'var(--c-texto-tenue)'
              : c.fraccionVida > 0.25 ? 'var(--c-aviso)'
              : 'var(--c-peligro)',
          },
          text: c.condicion,
        }),
      ),

      h('div.statbar__track', { style: { height: '4px', marginTop: '3px' } },
        h('div.statbar__fill', {
          style: {
            width: `${Math.round(c.fraccionVida * 100)}%`,
            '--statbar-color': 'var(--c-peligro)',
          },
        }),
      ),

      // Estados activos, con su color de familia.
      c.estados.length
        ? h('div.row', { style: { gap: '3px', marginTop: '3px', flexWrap: 'wrap' } },
            ...c.estados.map((e) => h('span', {
              attrs: { title: obtenerEstado(e.refId)?.descripcion ?? '' },
              style: {
                fontSize: 'var(--f-2xs)',
                padding: '0 4px',
                borderRadius: 'var(--r-xs)',
                background: `var(--est-${e.familia}, var(--c-superficie-3))`,
                color: 'var(--c-texto)',
              },
              text: e.acumulaciones > 1 ? `${e.nombre} ×${e.acumulaciones}` : e.nombre,
            })),
          )
        : null,
    );
  }

  /* ═══════════════════════════════════════════════════════════════════════
     ACCIONES
     ═══════════════════════════════════════════════════════════════════════ */

  /**
   * Botones de acción. Solo se dibujan cuando es el turno del jugador.
   * @private
   */
  _acciones(datos) {
    const objetivo = this._objetivo
      ? datos.combatientes.find((c) => c.id === this._objetivo)
      : null;

    return h('div.stack.stack--sm', { ref: this.ref('acciones') },
      h('div.filo'),

      objetivo
        ? h('p', {
            style: { fontSize: 'var(--f-2xs)', color: 'var(--c-texto-tenue)' },
            text: `Objetivo: ${objetivo.nombre}`,
          })
        : null,

      // Interfaz antigua (7-oct-2026): el combate actual se juega por menús
      // (ataque y enemigo elegidos, ficha de turno) y este panel no los tiene.
      // No se ofrece un «Atacar» que el motor rechazaría ni se vuelve al
      // «atacar al más débil». Adaptarla o retirarla queda por decidir.
      h('p.combate-clasico__aviso', {
        role: 'note',
        style: { fontSize: 'var(--f-2xs)', color: 'var(--c-peligro)', textAlign: 'center' },
      },
        h('span', { text: 'Interfaz antigua: aquí no se puede atacar con el combate actual. ' }),
        h('a', { attrs: { href: './app/index.html' }, text: 'Juega en la versión vigente' }),
      ),

      h('div.actionbar__quick', {},
        h('button.choice', {
          type: 'button',
          dataset: { accion: 'defender' },
        }, icono('escudo', { class: 'icon--sm' }), h('span', { text: 'Defender' })),

        h('button.choice', {
          type: 'button',
          dataset: { accion: 'objeto' },
        }, icono('pocion', { class: 'icon--sm' }), h('span', { text: 'Objeto' })),

        h('button.choice', {
          type: 'button',
          dataset: { accion: 'huir' },
        }, icono('huir', { class: 'icon--sm' }), h('span', { text: 'Huir' })),
      ),

      h('p', {
        style: { fontSize: 'var(--f-2xs)', color: 'var(--c-texto-tenue)', textAlign: 'center' },
        text: 'También puedes escribir lo que quieras hacer.',
      }),
    );
  }

  /**
   * Aviso de espera cuando no es tu turno.
   *
   * Sin botones: un panel de controles inertes invita a pulsarlos y produce
   * frustración.
   *
   * @private
   */
  _esperando(datos) {
    const actuando = datos.iniciativa.find((c) => c.activo);

    return h('div', { style: { textAlign: 'center', padding: 'var(--sp-2)' } },
      h('span', {
        style: { fontSize: 'var(--f-2xs)', color: 'var(--c-texto-tenue)', fontStyle: 'italic' },
        text: actuando ? `Turno de ${actuando.nombre}…` : 'Esperando…',
      }),
    );
  }

  /* ═══════════════════════════════════════════════════════════════════════
     INTERACCIÓN
     ═══════════════════════════════════════════════════════════════════════ */

  /** @protected */
  alMontar() {
    // Selección de objetivo.
    this.delegar(this.el, 'click', '[data-objetivo]', (e, objetivo) => {
      const id = objetivo.dataset.objetivo;
      this._objetivo = this._objetivo === id ? null : id;
      this.refrescar();
    });

    // Acciones.
    this.delegar(this.el, 'click', '[data-accion]', (e, boton) => {
      this._ejecutar(boton.dataset.accion);
    });

    // ─── Atajos de teclado ──────────────────────────────────────────────
    this.on(document, 'keydown', (e) => {
      if (!this.leer('combat.activo', false)) return;

      const manager = this.ui?.registry?.obtener?.('combat');
      if (!manager?.esperandoJugador) return;

      // Los números ejecutan las acciones; Tab cambia de objetivo. El 1
      // (atacar) ya no: en esta interfaz antigua no se ataca (ver arriba).
      const mapa = { 2: 'defender', 3: 'objeto', 4: 'huir' };

      if (mapa[e.key]) {
        e.preventDefault();
        this._ejecutar(mapa[e.key]);
        return;
      }

      if (e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault();
        this._siguienteObjetivo();
      }
    });

    // ─── Reacciones visuales ────────────────────────────────────────────
    this.escuchar('combat:attack', (entrada) => this._sacudir(entrada));

    this.escuchar('combat:log', ({ texto }) => {
      this.emitir('narrative:direct', { texto, voz: 'combate' });
    });

    this.escuchar('combat:boss:phase', () => {
      clase(this.refs.jefe, 'is-levelup', true);
      this.espera(() => clase(this.refs.jefe, 'is-levelup', false), 900);
    });

    // Al terminar el combate se limpia la selección.
    this.escuchar('combat:end', () => {
      this._objetivo = null;
    });

    this.escuchar('combat:awaiting', () => this.refrescar());
    this.escuchar('combat:round', () => this.refrescar());
    this.escuchar('combat:turn', () => this.refrescar());
  }

  /**
   * Ejecuta una acción del jugador.
   * @param {string} accion
   * @private
   */
  _ejecutar(accion) {
    const manager = this.ui?.registry?.obtener?.('combat');
    if (!manager?.esperandoJugador) return;

    switch (accion) {
      case 'atacar':
        this.emitir('combat:action', { tipo: 'atacar', objetivo: this._objetivo });
        this._objetivo = null;
        break;

      case 'defender':
        this.emitir('combat:action', { tipo: 'defender' });
        break;

      case 'objeto':
        this._elegirObjeto();
        break;

      case 'huir':
        this.emitir('combat:action', { tipo: 'huir' });
        break;
    }
  }

  /**
   * Abre la selección de consumibles.
   * @private
   */
  async _elegirObjeto() {
    const objetos = Object.values(this.leer('inventory.objetos.porId', {}))
      .filter((o) => o.categoria === 'consumible');

    if (!objetos.length) {
      this.ui?.avisar('No llevas nada que puedas usar ahora', { tipo: 'aviso' });
      return;
    }

    const elegido = await this.ui?.abrirModal({
      titulo: 'Usar objeto',
      contenido: h('div.stack.stack--sm', {},
        ...objetos.map((o) => h('button.choice', {
          type: 'button',
          style: { justifyContent: 'flex-start', width: '100%' },
          dataset: { valor: o.id },
        },
          icono('pocion', { class: 'icon--sm' }),
          h('span', { text: o.nombre }),
          o.cantidad > 1
            ? h('span', { style: { marginLeft: 'auto' }, text: `×${o.cantidad}` })
            : null,
        )),
      ),
      botones: [{ etiqueta: 'Cancelar', valor: null }],
      capturarValores: true,
    });

    if (elegido) {
      this.emitir('combat:action', { tipo: 'usar_objeto', idObjeto: elegido });
    }
  }

  /**
   * Cicla entre los objetivos vivos.
   * @private
   */
  _siguienteObjetivo() {
    const manager = this.ui?.registry?.obtener?.('combat');
    const datos = manager?.paraInterfaz();
    if (!datos) return;

    const vivos = datos.combatientes.filter((c) => !c.esJugador && c.vivo);
    if (!vivos.length) return;

    const indice = vivos.findIndex((c) => c.id === this._objetivo);
    this._objetivo = vivos[(indice + 1) % vivos.length].id;

    this.refrescar();
  }

  /**
   * Sacude el panel al recibir un golpe.
   *
   * Es la única señal no textual del combate, y hace bastante: un golpe que se
   * siente pega más que un golpe que se lee.
   *
   * @private
   */
  _sacudir(entrada) {
    if (!entrada.dano) return;

    if (entrada.objetivo?.esJugador) {
      clase(document.body, 'is-hit', true);
      this.espera(() => clase(document.body, 'is-hit', false), 400);
      return;
    }

    // Un crítico propio también merece señal.
    if (entrada.resultado === 'critico' && entrada.atacante?.esJugador) {
      clase(this.el, 'is-shaking', true);
      this.espera(() => clase(this.el, 'is-shaking', false), 400);
    }
  }

  /**
   * @param {Object} combat
   * @param {Object} anterior
   * @returns {boolean}
   * @protected
   */
  actualizar(combat, anterior) {
    // El combate cambia de forma estructural en cada turno: se rehace entero.
    if (combat?.activo !== anterior?.activo) return false;
    if (combat?.combatientes !== anterior?.combatientes) return false;
    if (combat?.turnoActual !== anterior?.turnoActual) return false;

    return true;
  }

  /** @protected */
  alDestruir() {
    this._objetivo = null;
    clase(document.body, 'is-hit', false);
  }
}

export default CombatPanel;
