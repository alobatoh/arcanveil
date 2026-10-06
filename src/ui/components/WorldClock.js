/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCANVEIL · ui/components/WorldClock.js
 * ---------------------------------------------------------------------------
 * Reloj del mundo en la cabecera: día, franja horaria y clima.
 *
 * Adopta los nodos que index.html ya trae, en vez de construir los suyos: así
 * el marcado semántico vive en un solo sitio.
 *
 * El icono cambia entre sol y luna según la franja; el tooltip da la hora
 * exacta y el estado del clima, para no saturar una cabecera estrecha.
 *
 * Dependencias: Component, DOM, config, utils/format.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { Component } from '../Component.js';
import { qs, texto as fijarTexto, atributo } from '../DOM.js';
import { SELECTORES, ICONOS_FRANJA, ICONOS } from '../../config/ui.config.js';
import { reloj } from '../../utils/format.js';
import { nombreEstacion } from '../../world/Calendario.js';

/** Nombre visible de cada franja del día. */
const NOMBRE_FRANJA = Object.freeze({
  madrugada: 'Madrugada',
  alba: 'Alba',
  manana: 'Mañana',
  mediodia: 'Mediodía',
  tarde: 'Tarde',
  ocaso: 'Ocaso',
  noche: 'Noche',
});

/** Nombre visible de cada estado del clima. */
const NOMBRE_CLIMA = Object.freeze({
  despejado: 'Cielo despejado',
  nublado: 'Nublado',
  lluvia: 'Lluvia',
  tormenta: 'Tormenta',
  niebla: 'Niebla',
  nieve: 'Nieve',
  ventisca: 'Ventisca',
  calorSofocante: 'Calor sofocante',
});

export class WorldClock extends Component {
  static nombre = 'reloj-mundo';
  static rama = 'world.tiempo';

  /** @returns {null} @protected */
  render() {
    return null;   // Los nodos ya existen en index.html.
  }

  /** @protected */
  alMontar() {
    this._texto = qs(SELECTORES.topbar.relojTexto);
    this._icono = qs(SELECTORES.topbar.relojIcono);
    this._contenedor = this.el;

    // El clima vive en otra rama, así que se vigila aparte.
    this.observar('world.clima.actual', () => this._pintar(), { inmediato: false });

    this._pintar();
  }

  /**
   * @returns {boolean}
   * @protected
   */
  actualizar() {
    this._pintar();
    return true;
  }

  /** @private */
  _pintar() {
    const t = this.leer('world.tiempo');
    if (!t || !this._texto) return;

    const franja = NOMBRE_FRANJA[t.franja] ?? t.franja;
    fijarTexto(this._texto, `Día ${t.dia} · ${franja}`);

    // El icono se sustituye cambiando la referencia del <use>.
    const uso = this._icono?.querySelector('use');
    if (uso) {
      const clave = ICONOS_FRANJA[t.franja] ?? ICONOS.sol;
      uso.setAttribute('href', `#${clave}`);
    }

    // Detalle completo en el tooltip: hora exacta, estación y clima.
    const clima = this.leer('world.clima.actual', 'despejado');
    const detalle = [
      reloj(t.hora, t.minuto),
      NOMBRE_CLIMA[clima] ?? clima,
      this._capitalizar(nombreEstacion(t.estacion)),
    ].join(' · ');

    atributo(this._contenedor, 'data-tooltip', detalle);
    atributo(this._contenedor, 'title', detalle);
  }

  /**
   * @param {string} s
   * @returns {string}
   * @private
   */
  _capitalizar(s) {
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
  }
}

export default WorldClock;
