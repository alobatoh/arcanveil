/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCANVEIL · ui/UIManager.js
 * ---------------------------------------------------------------------------
 * Orquestador de la capa de presentación.
 *
 * Responsabilidades:
 *   · Gobernar qué pantalla está activa, validando las transiciones declaradas.
 *   · Instanciar los componentes en sus puntos de montaje y destruirlos al salir.
 *   · Sincronizar con el documento los atributos que gobiernan el CSS.
 *   · Gestionar los cajones laterales y los atajos globales de teclado.
 *   · Servir de puerta única a las capas flotantes (toast, modal, popup).
 *
 * Lo que NO hace: dibujar nada por sí mismo. Cada píxel es responsabilidad de
 * un componente. UIManager solo decide quién vive, dónde y cuándo muere.
 *
 * Dependencias: DOM, Component, config/ui.config.js, core/*.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import {
  PANTALLAS, PANTALLA_INICIAL, TRANSICIONES, SELECTORES, MONTAJES,
  ATRIBUTOS_DOC, TECLAS, COMPORTAMIENTO, TEXTOS,
} from '../config/ui.config.js';
import { crearCanal } from '../core/Logger.js';
import { ErrorInterfaz, CODIGO, registrar } from '../core/Errors.js';
import { qs, montaje, atributo, visible, enfocar } from './DOM.js';

const log = crearCanal('ui');

/** Eventos publicados por la interfaz. */
export const EVENTOS_UI = Object.freeze({
  PANTALLA_CAMBIA: 'ui:screen:change',
  CAJON_CAMBIA: 'ui:drawer:toggle',
  CAPA_ABIERTA: 'ui:layer:open',
  CAPA_CERRADA: 'ui:layer:close',
  ACCION_ENVIADA: 'ui:action:submit',
  OPCION_ELEGIDA: 'ui:choice:pick',
});

export class UIManager {
  /**
   * @param {Object} contexto
   * @param {import('../core/Store.js').Store} contexto.store
   * @param {import('../core/EventBus.js').EventBus} contexto.bus
   * @param {import('../core/Registry.js').Registry} [contexto.registry]
   */
  constructor(contexto) {
    this.store = contexto.store;
    this.bus = contexto.bus;
    this.registry = contexto.registry;
    this.log = log;

    /** Contexto que se pasa a cada componente. @private */
    this._ctx = { store: this.store, bus: this.bus, ui: this };

    /**
     * Componentes montados, indexados por clave de montaje.
     * @type {Map<string, import('./Component.js').Component>}
     * @private
     */
    this._componentes = new Map();

    /**
     * Pantallas instanciadas. Se conservan entre cambios para no reconstruir
     * el asistente de creación cada vez que se consulta el menú.
     * @type {Map<string, import('./Component.js').Component>}
     * @private
     */
    this._pantallas = new Map();

    /** Pantalla activa. @private */
    this._pantalla = PANTALLAS.ARRANQUE;

    /** Bajas de oyentes globales. @type {Array<() => void>} @private */
    this._bajas = [];

    /** Gestores de capas flotantes, asignados en iniciar(). */
    this.toasts = null;
    this.modales = null;
    this.popup = null;
    this.tooltip = null;
  }

  /* ─────────────────────────────────────────────────────────────────────────
     ARRANQUE
     ───────────────────────────────────────────────────────────────────────── */

  /**
   * Pone en marcha la interfaz: capas flotantes, atajos y suscripciones.
   * @returns {Promise<void>}
   */
  async iniciar() {
    const fin = log.cronometro('iniciar interfaz');

    this._verificarEsqueleto();
    await this._montarCapas();
    this._registrarAtajos();
    this._registrarControles();
    this._sincronizarPreferencias();

    fin();
    log.info('Interfaz lista');
  }

  /**
   * Comprueba que index.html contiene los nodos imprescindibles.
   * Fallar aquí con un mensaje claro ahorra horas de depuración frente a un
   * "null is not an object" veinte llamadas más adelante.
   * @private
   */
  _verificarEsqueleto() {
    const criticos = [
      SELECTORES.app,
      SELECTORES.pantallas.game,
      SELECTORES.capas.toast,
      SELECTORES.capas.modal,
      SELECTORES.capas.popup,
    ];
    const faltan = criticos.filter((sel) => !qs(sel));
    if (faltan.length) {
      throw new ErrorInterfaz('El documento no contiene los nodos requeridos', {
        code: CODIGO.MONTAJE_AUSENTE,
        contexto: { faltan },
        usuario: 'La interfaz no ha podido montarse.',
      });
    }
  }

  /**
   * Instancia los gestores de capas flotantes.
   * Se importan de forma dinámica para que la Fase 2 pueda avanzar aunque
   * alguno todavía no exista.
   * @private
   */
  async _montarCapas() {
    this.toasts = await this._cargarCapa(() => import('./components/Toast.js'), 'GestorToast', SELECTORES.capas.toast);
    this.modales = await this._cargarCapa(() => import('./components/Modal.js'), 'GestorModal', SELECTORES.capas.modal);
    this.popup = await this._cargarCapa(() => import('./components/ChoicePopup.js'), 'ChoicePopup', SELECTORES.capas.popup);
    this.tooltip = await this._cargarCapa(() => import('./components/Tooltip.js'), 'GestorTooltip', SELECTORES.capas.tooltip);

    // Capas que se montan sobre el cuerpo: no tienen contenedor propio.
    this.puente = await this._cargarCapa(() => import('./components/BridgePanel.js'), 'BridgePanel', 'body');
    this.accionesObjeto = await this._cargarCapa(() => import('./components/ItemActions.js'), 'ItemActions', 'body');
    this.hazanas = await this._cargarCapa(() => import('./components/AchievementToast.js'), 'AchievementToast', 'body');
  }

  /**
   * @param {string} ruta
   * @param {string} exportado
   * @param {string} selector
   * @returns {Promise<Object|null>}
   * @private
   */
  async _cargarCapa(cargar, exportado, selector) {
    try {
      const modulo = await cargar();
      const Clase = modulo[exportado] ?? modulo.default;
      if (!Clase) return null;
      const instancia = new Clase(this._ctx);
      // Montar vacía el contenedor: con «body», la capa de hazañas borraba la
      // página entera (la interfaz clásica salía en negro). Se le da su
      // propio hueco dentro del body.
      let destino = qs(selector);
      if (destino === document.body) {
        destino = document.createElement('div');
        destino.dataset.capa = exportado;
        document.body.appendChild(destino);
      }
      instancia.montar(destino);
      return instancia;
    } catch (e) {
      log.aviso(`Capa ${exportado} no disponible todavía`);
      return null;
    }
  }

  /* ─────────────────────────────────────────────────────────────────────────
     PANTALLAS
     ───────────────────────────────────────────────────────────────────────── */

  /**
   * Cambia la pantalla activa.
   *
   * @param {string} destino Valor de PANTALLAS.
   * @param {Object} [datos] Datos entregados a la pantalla al montarse.
   * @returns {Promise<boolean>} false si la transición no está permitida.
   */
  async irA(destino, datos = {}) {
    if (destino === this._pantalla) return true;

    const permitidas = TRANSICIONES[this._pantalla] ?? [];
    if (!permitidas.includes(destino)) {
      registrar(
        new ErrorInterfaz(`Transición no permitida: ${this._pantalla} → ${destino}`, {
          code: CODIGO.TRANSICION_INVALIDA,
          contexto: { desde: this._pantalla, hasta: destino, permitidas },
        }),
        'ui',
      );
      return false;
    }

    const anterior = this._pantalla;

    // Salir de la pantalla de juego implica desmontar todos sus paneles.
    if (anterior === PANTALLAS.JUEGO) this._desmontarPaneles();

    this._pantalla = destino;
    atributo(qs(SELECTORES.app), ATRIBUTOS_DOC.pantallaActiva, destino);
    this.store.fijar('ui.pantalla', destino);

    // Las pantallas se ocultan con `hidden` además del CSS, para que los
    // lectores de pantalla no anuncien contenido invisible.
    for (const [clave, selector] of Object.entries(SELECTORES.pantallas)) {
      visible(qs(selector), clave === destino);
    }

    if (destino === PANTALLAS.JUEGO) await this._montarPaneles();
    else await this._montarPantalla(destino, datos);

    this.bus.emit(EVENTOS_UI.PANTALLA_CAMBIA, { desde: anterior, hasta: destino, datos });
    log.debug(`pantalla: ${anterior} → ${destino}`);
    return true;
  }

  /** @returns {string} Pantalla activa. */
  get pantalla() {
    return this._pantalla;
  }

  /**
   * Monta la pantalla correspondiente, cargándola de forma perezosa.
   * @param {string} pantalla
   * @param {Object} datos
   * @private
   */
  async _montarPantalla(pantalla, datos) {
    const rutas = {
      [PANTALLAS.MENU]: [() => import('./screens/MainMenuScreen.js'), 'MainMenuScreen'],
      [PANTALLAS.CREACION]: [() => import('./screens/CreationScreen.js'), 'CreationScreen'],
      [PANTALLAS.AJUSTES]: [() => import('./screens/SettingsScreen.js'), 'SettingsScreen'],
      [PANTALLAS.PARTIDAS]: [() => import('./screens/SaveScreen.js'), 'SaveScreen'],
    };
    const entrada = rutas[pantalla];
    if (!entrada) return;

    // Una pantalla ya instanciada solo se refresca.
    const existente = this._pantallas.get(pantalla);
    if (existente) {
      existente.opciones = { ...existente.opciones, ...datos };
      existente.refrescar();
      return;
    }

    try {
      const modulo = await entrada[0]();
      const Clase = modulo[entrada[1]] ?? modulo.default;
      if (!Clase) return;
      const instancia = new Clase(this._ctx, datos);
      instancia.montar(qs(SELECTORES.pantallas[pantalla]));
      this._pantallas.set(pantalla, instancia);
    } catch (e) {
      log.aviso(`Pantalla "${pantalla}" no disponible todavía`);
    }
  }

  /* ─────────────────────────────────────────────────────────────────────────
     PANELES DE JUEGO
     ───────────────────────────────────────────────────────────────────────── */

  /**
   * Catálogo de componentes de la pantalla de juego.
   * Añadir un panel nuevo es añadir una fila aquí.
   * @private
   */
  static get CATALOGO() {
    return [
      // El importador es una función con la ruta literal dentro: un
      // `import(variable)` no lo puede seguir ningún empaquetador, y el
      // archivo único se quedaría sin interfaz.
      [MONTAJES.personaje, () => import('./components/CharacterPanel.js'), 'CharacterPanel'],
      [MONTAJES.vitales, () => import('./components/VitalsWidget.js'), 'VitalsWidget'],
      [MONTAJES.equipo, () => import('./components/EquipmentSlots.js'), 'EquipmentSlots'],
      [MONTAJES.inventario, () => import('./components/InventoryPanel.js'), 'InventoryPanel'],
      [MONTAJES.narrativa, () => import('./components/NarrativeLog.js'), 'NarrativeLog'],
      [MONTAJES.combate, () => import('./components/CombatPanel.js'), 'CombatPanel'],
      [MONTAJES.mapa, () => import('./components/MapPanel.js'), 'MapPanel'],
      [MONTAJES.misiones, () => import('./components/QuestPanel.js'), 'QuestPanel'],
      [MONTAJES.npcs, () => import('./components/NPCPanel.js'), 'NPCPanel'],
      [MONTAJES.cronica, () => import('./components/StatsPanel.js'), 'StatsPanel'],
      [MONTAJES.opcionesRapidas, () => import('./components/QuickChoices.js'), 'QuickChoices'],
      [MONTAJES.relojMundo, () => import('./components/WorldClock.js'), 'WorldClock'],
    ];
  }

  /**
   * Monta todos los componentes de la pantalla de juego.
   * Los que aún no existen se omiten con un aviso, de modo que la fase actual
   * siempre es ejecutable.
   * @private
   */
  async _montarPaneles() {
    for (const [clave, cargar, exportado] of UIManager.CATALOGO) {
      if (this._componentes.has(clave)) continue;

      const contenedor = montaje(clave);
      if (!contenedor) {
        log.aviso(`Punto de montaje ausente: [data-mount="${clave}"]`);
        continue;
      }

      try {
        const modulo = await cargar();
        const Clase = modulo[exportado] ?? modulo.default;
        if (!Clase) continue;
        const instancia = new Clase(this._ctx);
        instancia.montar(contenedor);
        this._componentes.set(clave, instancia);
      } catch {
        log.aviso(`Componente ${exportado} no disponible todavía`);
      }
    }

    // La barra de acción es un caso aparte: vive en el pie, no en un panel.
    if (!this._componentes.has('inputbar')) {
      try {
        const modulo = await import('./components/InputBar.js');
        const Clase = modulo.InputBar ?? modulo.default;
        const instancia = new Clase(this._ctx);
        instancia.montar(qs('.actionbar__input'));
        this._componentes.set('inputbar', instancia);
      } catch {
        log.aviso('InputBar no disponible todavía');
      }
    }

    log.info(`${this._componentes.size} componentes montados`);
  }

  /** Destruye todos los componentes de juego. @private */
  _desmontarPaneles() {
    for (const componente of this._componentes.values()) componente.destruir();
    this._componentes.clear();
  }

  /**
   * Obtiene un componente montado.
   * @param {string} clave
   * @returns {import('./Component.js').Component|undefined}
   */
  componente(clave) {
    return this._componentes.get(clave);
  }

  /* ─────────────────────────────────────────────────────────────────────────
     CAJONES LATERALES
     ───────────────────────────────────────────────────────────────────────── */

  /**
   * Abre o cierra un cajón lateral.
   * @param {'izquierdo'|'derecho'} lado
   * @param {boolean} [forzar] Si se omite, alterna.
   */
  cajon(lado, forzar) {
    const app = qs(SELECTORES.app);
    if (!app) return;

    const attr = lado === 'izquierdo' ? ATRIBUTOS_DOC.cajonIzquierdo : ATRIBUTOS_DOC.cajonDerecho;
    const abierto = app.getAttribute(attr) === 'open';
    const nuevo = forzar === undefined ? !abierto : forzar;

    atributo(app, attr, nuevo ? 'open' : null);
    this.store.fijar(lado === 'izquierdo' ? 'ui.cajonIzquierdo' : 'ui.cajonDerecho', nuevo);

    const boton = qs(lado === 'izquierdo' ? SELECTORES.topbar.toggleIzquierdo : SELECTORES.topbar.toggleDerecho);
    atributo(boton, 'aria-expanded', String(nuevo));

    this.bus.emit(EVENTOS_UI.CAJON_CAMBIA, { lado, abierto: nuevo });
  }

  /** Cierra ambos cajones. */
  cerrarCajones() {
    this.cajon('izquierdo', false);
    this.cajon('derecho', false);
  }

  /* ─────────────────────────────────────────────────────────────────────────
     CAPAS FLOTANTES — puerta única
     ───────────────────────────────────────────────────────────────────────── */

  /**
   * Muestra un aviso flotante.
   * @param {string} mensaje
   * @param {Object} [opciones]
   * @param {'info'|'exito'|'aviso'|'peligro'|'loot'} [opciones.tipo='info']
   * @param {number} [opciones.duracion]
   * @param {string} [opciones.icono]
   */
  avisar(mensaje, opciones = {}) {
    if (this.toasts) this.toasts.mostrar(mensaje, opciones);
    else log.info(`(aviso) ${mensaje}`);
  }

  /**
   * Abre un modal.
   * @param {Object} config
   * @returns {Promise<*>} Resuelve con el resultado del modal.
   */
  abrirModal(config) {
    if (!this.modales) return Promise.resolve(null);
    return this.modales.abrir(config);
  }

  /**
   * Pide confirmación al jugador.
   * @param {string} mensaje
   * @param {Object} [opciones]
   * @returns {Promise<boolean>}
   */
  confirmar(mensaje, opciones = {}) {
    if (!this.modales) return Promise.resolve(true);
    return this.modales.confirmar(mensaje, opciones);
  }

  /**
   * Muestra el popup de opciones.
   * @param {Array<Object>} opciones
   * @param {Object} [config]
   */
  mostrarOpciones(opciones, config = {}) {
    if (!this.popup) return;
    if (!this.leerAjuste('popupOpciones')) return;
    this.popup.mostrar(opciones, config);
  }

  /** Cierra el popup de opciones. */
  cerrarOpciones() {
    this.popup?.cerrar();
  }

  /**
   * Cierra la capa flotante más superficial que esté abierta.
   * Es lo que hace Escape: cierra una cosa, no todas.
   * @returns {boolean} true si cerró algo.
   */
  cerrarCapaSuperior() {
    if (this.modales?.hayAbierto) { this.modales.cerrar(); return true; }
    if (this.popup?.abierto && COMPORTAMIENTO.popupCancelable) { this.popup.cerrar(); return true; }
    const app = qs(SELECTORES.app);
    if (app?.getAttribute(ATRIBUTOS_DOC.cajonIzquierdo) === 'open') { this.cajon('izquierdo', false); return true; }
    if (app?.getAttribute(ATRIBUTOS_DOC.cajonDerecho) === 'open') { this.cajon('derecho', false); return true; }
    return false;
  }

  /* ─────────────────────────────────────────────────────────────────────────
     ENTRADA
     ───────────────────────────────────────────────────────────────────────── */

  /**
   * Punto de entrada único de toda acción del jugador, venga de la caja de
   * texto, del popup o de un atajo.
   *
   * UIManager no la resuelve: la publica. Quien la interprete será el motor de
   * turno, en la Fase 6. Hasta entonces, queda registrada en la bitácora.
   *
   * @param {string} texto Acción escrita o etiqueta elegida.
   * @param {Object} [meta] Origen, intención asociada, identificador de opción.
   */
  enviarAccion(texto, meta = {}) {
    const limpio = String(texto ?? '').trim();
    if (!limpio) {
      this.avisar(TEXTOS.juego.entradaVacia, { tipo: 'aviso' });
      return;
    }

    if (this.leer('ui.entradaBloqueada')) {
      this.avisar(TEXTOS.juego.turnoBloqueado, { tipo: 'aviso' });
      return;
    }

    this.cerrarOpciones();
    if (COMPORTAMIENTO.cerrarCajonAlActuar) this.cerrarCajones();

    this.bus.emit(EVENTOS_UI.ACCION_ENVIADA, { texto: limpio, ...meta });
  }

  /**
   * Bloquea o desbloquea la entrada mientras se resuelve un turno.
   * @param {boolean} bloqueada
   */
  bloquearEntrada(bloqueada) {
    this.store.fijar('ui.entradaBloqueada', bloqueada);
    const boton = qs(SELECTORES.accion.enviar);
    const campo = qs(SELECTORES.accion.entrada);
    if (boton) boton.disabled = bloqueada;
    if (campo) campo.disabled = bloqueada;
    if (!bloqueada && COMPORTAMIENTO.refocoTrasTurno) enfocar(campo);
  }

  /**
   * Muestra u oculta el indicador de que el director está pensando.
   * @param {boolean} pensando
   */
  pensando(pensando_) {
    this.store.fijar('ui.pensando', pensando_);
    const el = qs(SELECTORES.narrativa.pensando);
    visible(el, pensando_);
    if (el) el.setAttribute('aria-hidden', String(!pensando_));
  }

  /* ─────────────────────────────────────────────────────────────────────────
     ATAJOS Y CONTROLES
     ───────────────────────────────────────────────────────────────────────── */

  /** @private */
  _registrarAtajos() {
    const manejador = (e) => {
      // Dentro de un campo de texto solo se atienden Escape y el envío.
      const enCampo = e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement;

      if (e.code === TECLAS.cerrar.code) {
        if (this.cerrarCapaSuperior()) e.preventDefault();
        return;
      }

      if (enCampo) return;

      // "/" enfoca la caja de acción, como en una terminal.
      if (e.code === TECLAS.enfocarEntrada.code && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        enfocar(qs(SELECTORES.accion.entrada));
        return;
      }

      // Dígitos 1-9 eligen opción del popup.
      if (COMPORTAMIENTO.atajosNumericos !== false && this.popup?.abierto) {
        const indice = TECLAS.opciones.indexOf(e.code);
        if (indice >= 0) {
          e.preventDefault();
          this.popup.elegirPorIndice(indice);
          return;
        }
      }

      if (e.altKey && e.code === TECLAS.panelIzquierdo.code) { e.preventDefault(); this.cajon('izquierdo'); }
      if (e.altKey && e.code === TECLAS.panelDerecho.code) { e.preventDefault(); this.cajon('derecho'); }
      if (e.code === TECLAS.ajustes.code) { e.preventDefault(); this.irA(PANTALLAS.AJUSTES); }
    };

    document.addEventListener('keydown', manejador);
    this._bajas.push(() => document.removeEventListener('keydown', manejador));
  }

  /** Conecta los botones fijos de la cabecera. @private */
  _registrarControles() {
    const conectar = (selector, fn) => {
      const el = qs(selector);
      if (!el) return;
      el.addEventListener('click', fn);
      this._bajas.push(() => el.removeEventListener('click', fn));
    };

    conectar(SELECTORES.topbar.toggleIzquierdo, () => this.cajon('izquierdo'));
    conectar(SELECTORES.topbar.toggleDerecho, () => this.cajon('derecho'));
    conectar(SELECTORES.topbar.ajustes, () => this.irA(PANTALLAS.AJUSTES));
  }

  /**
   * Refleja en el documento los ajustes que afectan al CSS.
   * @private
   */
  _sincronizarPreferencias() {
    const aplicar = (ajustes) => {
      const raiz = document.documentElement;
      atributo(raiz, ATRIBUTOS_DOC.densidad, ajustes.densidad ?? 'normal');
      atributo(raiz, ATRIBUTOS_DOC.lectura, ajustes.tamanoLectura ?? 'normal');
      raiz.style.setProperty('--t-typewriter', `${ajustes.velocidadTexto ?? 14}ms`);
    };
    aplicar(this.store.select('settings'));
    const baja = this.store.subscribe('settings', aplicar);
    this._bajas.push(baja);

    // El combate tiñe la interfaz de rojo mediante un atributo del documento.
    const bajaCombate = this.store.subscribe('combat.activo', (activo) => {
      atributo(document.documentElement, ATRIBUTOS_DOC.combate, activo ? 'true' : null);
    });
    this._bajas.push(bajaCombate);
  }

  /* ─────────────────────────────────────────────────────────────────────────
     ATAJOS DE LECTURA
     ───────────────────────────────────────────────────────────────────────── */

  /** @param {string} ruta @param {*} [defecto] */
  leer(ruta, defecto) {
    return this.store.select(ruta, defecto);
  }

  /** @param {string} clave Nombre del ajuste. */
  leerAjuste(clave) {
    return this.store.select(`settings.${clave}`);
  }

  /* ─────────────────────────────────────────────────────────────────────────
     DESTRUCCIÓN
     ───────────────────────────────────────────────────────────────────────── */

  /** Desmonta toda la interfaz y libera sus oyentes. */
  destruir() {
    this._desmontarPaneles();
    for (const p of this._pantallas.values()) p.destruir();
    this._pantallas.clear();

    for (const capa of [this.toasts, this.modales, this.popup, this.tooltip]) capa?.destruir?.();

    for (const baja of this._bajas) {
      try { baja(); } catch (e) { registrar(e, 'ui'); }
    }
    this._bajas.length = 0;
    log.info('Interfaz desmontada');
  }
}

export default UIManager;
