/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCANVEIL · ui/components/VitalsWidget.js
 * ---------------------------------------------------------------------------
 * Las barras de estado: vida, maná, vigor y moral (hambre y sed ya no, 6-oct-2026).
 *
 * Todas siguen la misma convención de lectura —máximo es bienestar, cero es
 * colapso— así que el jugador no tiene que recordar cuál va al revés.
 *
 * Las barras de supervivencia muestran su etiqueta cualitativa junto al número:
 * ver «hambriento» pesa más que ver «28».
 *
 * Dependencias: Component, DOM, StatBar, Vitals.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { Component } from '../Component.js';
import { h, texto as fijarTexto } from '../DOM.js';
import { cabecera } from './Panel.js';
import { StatBar } from './StatBar.js';
import { META_VITALES, resumenVitales } from '../../player/Vitals.js';
import { VITALES } from '../../config/balance.config.js';

export class VitalsWidget extends Component {
  static nombre = 'vitales';
  static rama = 'player';

  constructor(contexto, opciones) {
    super(contexto, opciones);
    /** @type {Map<string, StatBar>} @private */
    this._barras = new Map();
  }

  /**
   * @param {Object} jugador
   * @returns {Node}
   * @protected
   */
  render(jugador) {
    if (!jugador?.raza) return h('p.block__empty', { text: '—' });

    const v = resumenVitales(jugador);
    this._barras.clear();

    const nodos = [];

    // — Vida y maná —
    nodos.push(this._barra('vida', {
      etiqueta: META_VITALES.vida.nombre,
      icono: META_VITALES.vida.icono,
      actual: v.vida.actual,
      max: v.vida.max,
      umbralAlerta: VITALES.vida.umbralAlerta,
      umbralCritico: VITALES.vida.umbralCritico,
    }));

    if (v.mana.max > 0) {
      nodos.push(this._barra('mana', {
        etiqueta: META_VITALES.mana.nombre,
        icono: META_VITALES.mana.icono,
        actual: v.mana.actual,
        max: v.mana.max,
        alarma: false,
      }));
    }

    nodos.push(h('div.filo'));

    // — Supervivencia, con su etiqueta cualitativa —
    for (const clave of ['fatiga', 'moral']) {
      const datos = v[clave];
      nodos.push(h('div', { dataset: { vital: clave } },
        this._barra(clave, {
          etiqueta: META_VITALES[clave].nombre,
          icono: META_VITALES[clave].icono,
          actual: datos.valor,
          max: datos.max,
          delgada: true,
          formato: 'ninguno',
          alarma: clave !== 'moral',
        }),
        h('span.attralloc__hint', {
          ref: this.ref(`etiqueta_${clave}`),
          text: datos.etiqueta,
          style: { display: 'block', textAlign: 'right', marginTop: '-2px' },
        }),
      ));
    }

    return h('div.stack.stack--sm', {},
      cabecera({ titulo: 'Estado', icono: 'vida' }),
      ...nodos,
    );
  }

  /**
   * Crea una barra y la registra para poder actualizarla luego.
   * @private
   */
  _barra(clave, config) {
    const barra = new StatBar({ clave, ...config });
    this._barras.set(clave, barra);
    return barra.render();
  }

  /**
   * @param {Object} jugador
   * @param {Object} anterior
   * @returns {boolean}
   * @protected
   */
  actualizar(jugador, anterior) {
    if (!jugador?.raza || !this._barras.size) return false;

    // Si el maná pasa de cero a positivo (o al revés), hay que rehacer.
    const teniaMana = (anterior?.mana?.max ?? 0) > 0;
    const tieneMana = (jugador?.mana?.max ?? 0) > 0;
    if (teniaMana !== tieneMana) return false;

    const v = resumenVitales(jugador);

    this._barras.get('vida')?.actualizar(v.vida.actual, v.vida.max);
    this._barras.get('mana')?.actualizar(v.mana.actual, v.mana.max);

    for (const clave of ['fatiga', 'moral']) {
      this._barras.get(clave)?.actualizar(v[clave].valor, v[clave].max);
      fijarTexto(this.refs[`etiqueta_${clave}`], v[clave].etiqueta);
    }

    return true;
  }

  /** @protected */
  alMontar() {
    // El daño sacude el panel central: la señal visual llega antes que el texto.
    this.escuchar('player:damaged', ({ cantidad }) => {
      if (cantidad >= 5) this.emitir('ui:shake', { intensidad: cantidad });
    });
  }

  /** @protected */
  alDestruir() {
    this._barras.clear();
  }
}

export default VitalsWidget;
