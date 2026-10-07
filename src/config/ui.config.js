/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCANVEIL · config/ui.config.js
 * ---------------------------------------------------------------------------
 * Configuración de la capa de presentación: pantallas, puntos de montaje,
 * catálogo de iconos, textos de interfaz, atajos y ajustes visibles.
 *
 * Este archivo es el contrato entre index.html y /src/ui. Si un selector del
 * HTML cambia, se cambia AQUÍ y en ningún otro sitio: ningún componente puede
 * escribir un `querySelector('#algo')` con una cadena literal.
 *
 * Como los demás config, NO importa nada.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * @template T
 * @param {T} obj
 * @returns {Readonly<T>}
 */
function congelar(obj) {
  if (obj === null || typeof obj !== 'object' || Object.isFrozen(obj)) return obj;
  for (const clave of Object.getOwnPropertyNames(obj)) congelar(obj[clave]);
  return Object.freeze(obj);
}

/* ═══════════════════════════════════════════════════════════════════════════
   1. PANTALLAS
   El valor se escribe en #app[data-active-screen] y layout.css hace el resto.
   ═══════════════════════════════════════════════════════════════════════════ */

export const PANTALLAS = congelar({
  ARRANQUE: 'boot',
  MENU: 'menu',
  CREACION: 'creation',
  AJUSTES: 'settings',
  PARTIDAS: 'saves',
  JUEGO: 'game',
});

/** Pantalla mostrada al terminar el arranque cuando no hay partida en curso. */
export const PANTALLA_INICIAL = PANTALLAS.MENU;

/**
 * Transiciones permitidas. UIManager las verifica antes de cambiar de pantalla:
 * un salto no declarado es un error de programación, no un caso a manejar.
 */
export const TRANSICIONES = congelar({
  [PANTALLAS.ARRANQUE]: [PANTALLAS.MENU, PANTALLAS.JUEGO],
  [PANTALLAS.MENU]: [PANTALLAS.CREACION, PANTALLAS.JUEGO, PANTALLAS.AJUSTES],
  [PANTALLAS.CREACION]: [PANTALLAS.MENU, PANTALLAS.JUEGO],
  [PANTALLAS.AJUSTES]: [PANTALLAS.MENU, PANTALLAS.JUEGO],
  [PANTALLAS.JUEGO]: [PANTALLAS.MENU, PANTALLAS.AJUSTES],
});

/* ═══════════════════════════════════════════════════════════════════════════
   2. SELECTORES
   Única fuente de verdad de los identificadores del DOM definidos en
   index.html. DOM.js resuelve estas claves; nadie más toca cadenas.
   ═══════════════════════════════════════════════════════════════════════════ */

export const SELECTORES = congelar({
  /** Raíz de la aplicación. */
  app: '#app',

  /** Pantallas completas. */
  pantallas: {
    boot: '#screen-boot',
    menu: '#screen-menu',
    creation: '#screen-creation',
    settings: '#screen-settings',
    game: '#screen-game',
  },

  /** Elementos de la pantalla de arranque. */
  arranque: {
    estado: '#boot-status',
  },

  /** Cabecera. */
  topbar: {
    toggleIzquierdo: '#btn-toggle-left',
    toggleDerecho: '#btn-toggle-right',
    ajustes: '#btn-settings',
    relojTexto: '#world-clock-text',
    relojIcono: '#world-clock-icon',
  },

  /** Paneles. */
  paneles: {
    izquierdo: '#panel-left',
    central: '#panel-center',
    derecho: '#panel-right',
  },

  /** Barra de acción inferior. */
  accion: {
    entrada: '#player-input',
    enviar: '#btn-send',
  },

  /** Bitácora narrativa y sus accesorios. */
  narrativa: {
    log: '#narrative-log',
    pensando: '#dm-thinking',
  },

  /** Raíces de las capas flotantes. */
  capas: {
    popup: '#popup-root',
    modal: '#modal-root',
    tooltip: '#tooltip-root',
    toast: '#toast-root',
  },

  /** Panel de error fatal de arranque (gestionado por el script inline). */
  fatal: {
    caja: '#fatal-error',
    mensaje: '#fatal-msg',
    detalle: '#fatal-detail',
  },
});

/**
 * Puntos de montaje de los componentes dentro de los paneles.
 * El valor es el atributo `data-mount` presente en index.html.
 * Cada componente declara aquí dónde vive; UIManager los instancia leyendo
 * este mapa, así que añadir un componente es añadir una entrada.
 */
export const MONTAJES = congelar({
  // Panel izquierdo
  personaje: 'character',
  vitales: 'vitals',
  progresion: 'progression',
  equipo: 'equipment',
  inventario: 'inventory',

  // Panel central
  combate: 'combat',
  narrativa: 'narrative',

  // Panel derecho
  mapa: 'map',
  misiones: 'quests',
  npcs: 'npcs',
  cronica: 'chronicle',

  // Barra inferior
  opcionesRapidas: 'quick-choices',

  // Cabecera
  relojMundo: 'world-clock',
});

/* ═══════════════════════════════════════════════════════════════════════════
   3. ICONOS
   Claves lógicas → identificadores del sprite SVG embebido en index.html.
   Ningún componente escribe "#ic-…" directamente.
   ═══════════════════════════════════════════════════════════════════════════ */

export const ICONOS = congelar({
  // Combate y equipo
  espada: 'ic-sword',
  escudo: 'ic-shield',
  // Vitales
  vida: 'ic-heart',
  mana: 'ic-mana',
  // Inventario y economía
  bolsa: 'ic-bag',
  oro: 'ic-coin',
  pocion: 'ic-flask',
  // Mundo
  mapa: 'ic-map',
  gente: 'ic-people',
  pergamino: 'ic-scroll',
  ojo: 'ic-eye',
  // Acciones
  huir: 'ic-run',
  enviar: 'ic-send',
  dado: 'ic-dice',
  // Interfaz
  menu: 'ic-menu',
  cerrar: 'ic-close',
  ajustes: 'ic-gear',
  // Ciclo día/noche
  sol: 'ic-sun',
  luna: 'ic-moon',
});

/**
 * Icono asociado a cada intención de acción. ChoicePopup lo usa para decorar
 * los botones; si una intención no aparece aquí, el botón va sin icono.
 */
export const ICONOS_INTENCION = congelar({
  attack: ICONOS.espada,
  talk: ICONOS.gente,
  persuade: ICONOS.gente,
  intimidate: ICONOS.espada,
  deceive: ICONOS.ojo,
  negotiate: ICONOS.oro,
  trade: ICONOS.oro,
  explore: ICONOS.mapa,
  travel: ICONOS.mapa,
  search: ICONOS.ojo,
  observe: ICONOS.ojo,
  hide: ICONOS.ojo,
  open: ICONOS.bolsa,
  use_item: ICONOS.pocion,
  cast: ICONOS.mana,
  rest: ICONOS.luna,
  flee: ICONOS.huir,
  wait: ICONOS.luna,
  custom: ICONOS.pergamino,
});

/** Icono por franja del día, para el reloj de la cabecera. */
export const ICONOS_FRANJA = congelar({
  madrugada: ICONOS.luna,
  alba: ICONOS.sol,
  manana: ICONOS.sol,
  mediodia: ICONOS.sol,
  tarde: ICONOS.sol,
  ocaso: ICONOS.sol,
  noche: ICONOS.luna,
});

/* ═══════════════════════════════════════════════════════════════════════════
   4. VOCES DE LA BITÁCORA
   El valor se escribe en .entry[data-voice] y components.css lo estiliza.
   ═══════════════════════════════════════════════════════════════════════════ */

export const VOCES = congelar({
  DM: 'dm',
  JUGADOR: 'player',
  NPC: 'npc',
  SISTEMA: 'system',
  TIRADA: 'roll',
  COMBATE: 'combat',
});

/** Voces que se escriben con máquina de escribir. El resto aparecen de golpe. */
export const VOCES_ANIMADAS = congelar([VOCES.DM, VOCES.NPC]);

/* ═══════════════════════════════════════════════════════════════════════════
   5. COMPORTAMIENTO DE LA INTERFAZ
   ═══════════════════════════════════════════════════════════════════════════ */

export const COMPORTAMIENTO = congelar({
  /** Desplaza la bitácora al final automáticamente al llegar contenido nuevo. */
  autoScroll: true,

  /**
   * Píxeles de margen desde el fondo dentro de los cuales se considera que el
   * jugador "está al día". Si ha subido más arriba, no se le arrastra abajo.
   */
  autoScrollMargen: 120,

  /** Devuelve el foco a la caja de acción tras cada turno. */
  refocoTrasTurno: true,

  /** Limpia la caja de acción al enviar. */
  limpiarAlEnviar: true,

  /** Cierra el popup de opciones al escribir manualmente. */
  cerrarPopupAlEscribir: true,

  /** El popup se cierra con Escape sin consumir el turno. */
  popupCancelable: true,

  /** Muestra el resultado de la tirada en la bitácora antes de la narración. */
  mostrarTiradas: true,

  /** Muestra el número de daño flotante sobre el panel central. */
  danoFlotante: true,

  /** Sacude el panel central al recibir daño. */
  sacudidaAlRecibirDano: true,

  /** Confirma antes de acciones irreversibles (abandonar partida, borrar guardado). */
  confirmarAccionesDestructivas: true,

  /** Abre automáticamente el modal de subida de nivel. */
  abrirModalNivel: true,

  /** Filas visibles de la caja de acción antes de desplazar. */
  entradaFilasMax: 6,

  /** Cierra los cajones laterales al elegir una opción, en móvil. */
  cerrarCajonAlActuar: true,
});

/* ═══════════════════════════════════════════════════════════════════════════
   6. AJUSTES VISIBLES PARA EL JUGADOR
   ---------------------------------------------------------------------------
   SettingsScreen construye su interfaz a partir de este catálogo. Cada entrada
   declara dónde vive en el estado, su tipo y su valor por defecto; la pantalla
   no contiene ni un solo control escrito a mano.
   ═══════════════════════════════════════════════════════════════════════════ */

export const AJUSTES = congelar([
  {
    id: 'maquinaEscribir',
    seccion: 'Narración',
    etiqueta: 'Máquina de escribir',
    descripcion: 'El texto aparece carácter a carácter.',
    tipo: 'switch',
    defecto: true,
    ruta: 'settings.maquinaEscribir',
  },
  {
    id: 'velocidadTexto',
    seccion: 'Narración',
    etiqueta: 'Velocidad del texto',
    descripcion: 'Milisegundos por carácter.',
    tipo: 'range',
    min: 0,
    max: 40,
    paso: 2,
    defecto: 14,
    ruta: 'settings.velocidadTexto',
    dependeDe: 'maquinaEscribir',
  },
  {
    id: 'tamanoLectura',
    seccion: 'Narración',
    etiqueta: 'Tamaño de lectura',
    descripcion: 'Afecta sólo al panel de narración.',
    tipo: 'select',
    opciones: [
      { valor: 'normal', etiqueta: 'Normal' },
      { valor: 'grande', etiqueta: 'Grande' },
      { valor: 'enorme', etiqueta: 'Enorme' },
    ],
    defecto: 'normal',
    ruta: 'settings.tamanoLectura',
    /** Se refleja como atributo data-reading en <html>. */
    atributoHtml: 'data-reading',
  },
  {
    id: 'densidad',
    seccion: 'Interfaz',
    etiqueta: 'Densidad',
    descripcion: 'Compacta el espaciado en pantallas pequeñas.',
    tipo: 'select',
    opciones: [
      { valor: 'normal', etiqueta: 'Normal' },
      { valor: 'compact', etiqueta: 'Compacta' },
    ],
    defecto: 'normal',
    ruta: 'settings.densidad',
    atributoHtml: 'data-density',
  },
  {
    id: 'mostrarTiradas',
    seccion: 'Interfaz',
    etiqueta: 'Mostrar tiradas de dados',
    descripcion: 'Añade a la bitácora el resultado de cada tirada.',
    tipo: 'switch',
    defecto: true,
    ruta: 'settings.mostrarTiradas',
  },
  {
    id: 'popupOpciones',
    seccion: 'Interfaz',
    etiqueta: 'Popup de opciones',
    descripcion: 'Muestra las acciones sugeridas en una ventana emergente. Siempre puedes escribir libremente.',
    tipo: 'switch',
    defecto: true,
    ruta: 'settings.popupOpciones',
  },
  {
    id: 'proveedorIA',
    seccion: 'Director de juego',
    etiqueta: 'Proveedor',
    descripcion: 'Quién narra la partida.',
    tipo: 'select',
    /** Las opciones se rellenan en tiempo de ejecución desde ai.config.js. */
    opcionesDinamicas: 'proveedores',
    defecto: 'procedural',
    ruta: 'settings.proveedorIA',
  },
  {
    id: 'urlProveedor',
    seccion: 'Director de juego',
    etiqueta: 'Dirección del servicio',
    descripcion: 'Endpoint compatible con OpenAI.',
    tipo: 'text',
    defecto: '',
    ruta: 'settings.urlProveedor',
    dependeDe: 'proveedorIA',
    visibleSi: ['local'],
  },
  {
    id: 'modeloProveedor',
    seccion: 'Director de juego',
    etiqueta: 'Modelo',
    tipo: 'text',
    defecto: '',
    ruta: 'settings.modeloProveedor',
    dependeDe: 'proveedorIA',
    visibleSi: ['local'],
  },
  {
    id: 'dificultad',
    seccion: 'Partida',
    etiqueta: 'Dureza',
    descripcion: 'Ajusta umbrales, daño y generosidad del botín.',
    tipo: 'select',
    opciones: [
      { valor: 'relato', etiqueta: 'Relato' },
      { valor: 'equilibrado', etiqueta: 'Equilibrado' },
      { valor: 'duro', etiqueta: 'Duro' },
      { valor: 'implacable', etiqueta: 'Implacable' },
    ],
    defecto: 'equilibrado',
    ruta: 'settings.dificultad',
  },
  {
    id: 'dificultadAdaptativa',
    seccion: 'Partida',
    etiqueta: 'Dificultad adaptativa',
    descripcion: 'El director ajusta la presión según cómo te vaya.',
    tipo: 'switch',
    defecto: true,
    ruta: 'settings.dificultadAdaptativa',
  },
  {
    id: 'guardadoAutomatico',
    seccion: 'Guardado',
    etiqueta: 'Guardar en este navegador',
    descripcion: 'Desactivado por defecto: la partida vive sólo en memoria y se pierde al cerrar la pestaña.',
    tipo: 'switch',
    defecto: false,
    ruta: 'settings.guardadoAutomatico',
    /** Al activarlo se pide confirmación explícita. */
    confirmarActivacion: true,
    textoConfirmacion:
      'Se guardará el progreso en el almacenamiento local de este navegador. ' +
      'No se enviará nada a ningún servidor y nunca se guardarán claves de acceso. ¿Continuar?',
  },
]);

/* ═══════════════════════════════════════════════════════════════════════════
   7. TEXTOS DE INTERFAZ
   ---------------------------------------------------------------------------
   Toda cadena visible del chrome de la aplicación vive aquí. La narración y el
   contenido del mundo NO: eso lo generan el director y /src/data.
   Estructura pensada para poder añadir otro idioma sin tocar componentes.
   ═══════════════════════════════════════════════════════════════════════════ */

export const TEXTOS = congelar({

  arranque: {
    faroles: 'Encendiendo los faroles…',
    forjando: 'Forjando el mundo…',
    convocando: 'Convocando al director…',
    listo: 'Todo dispuesto.',
  },

  menu: {
    nuevaPartida: 'Nueva crónica',
    continuar: 'Continuar',
    cargar: 'Cargar partida',
    ajustes: 'Ajustes',
    sinGuardado: 'No hay ninguna crónica guardada',
    privacidad:
      'Todo ocurre en tu navegador. No hay servidor, no hay cuenta y no se guarda nada ' +
      'salvo que lo actives expresamente en Ajustes.',
  },

  creacion: {
    titulo: 'Forja tu leyenda',
    pasos: ['Nombre', 'Linaje', 'Vocación', 'Trasfondo', 'Atributos', 'Alineamiento', 'Habilidades', 'Confirmar'],
    nombrePlaceholder: 'El nombre por el que te recordarán',
    nombreAleatorio: 'Sugerir nombre',
    puntosRestantes: 'Puntos por repartir',
    anterior: 'Atrás',
    siguiente: 'Continuar',
    comenzar: 'Comenzar la crónica',
    resumen: 'Así serás recordado',
  },

  juego: {
    entradaPlaceholder: '¿Qué haces? Escribe cualquier acción…',
    enviar: 'Enviar',
    pensando: 'El director medita tu destino…',
    turnoBloqueado: 'Espera a que termine el turno',
    entradaVacia: 'Escribe algo o elige una opción',
  },

  paneles: {
    personaje: 'Personaje',
    vitales: 'Estado',
    equipo: 'Equipo',
    inventario: 'Inventario',
    mapa: 'Mapa',
    misiones: 'Misiones',
    npcs: 'Presencias',
    combate: 'Combate',
  },

  vacios: {
    inventario: 'No llevas nada encima.',
    equipo: 'Sin equipar.',
    misiones: 'Ninguna misión abierta.',
    npcs: 'No hay nadie cerca.',
    mapa: 'Aún no has explorado nada.',
    narrativa: 'Tu historia empieza aquí.',
  },

  popup: {
    titulo: '¿Qué haces?',
    pie: 'También puedes escribir cualquier otra cosa en la caja de abajo.',
    cancelar: 'Decidir por mi cuenta',
  },

  combate: {
    inicio: 'El acero sale de las vainas.',
    ronda: 'Ronda',
    turnoDe: 'Turno de',
    victoria: 'El campo queda en silencio.',
    derrota: 'La oscuridad te alcanza.',
    huida: 'Consigues romper el cerco.',
    huidaFallida: 'No hay salida.',
  },

  avisos: {
    subidaNivel: 'Has alcanzado el nivel',
    objetoObtenido: 'Has obtenido',
    objetoRoto: 'se ha roto',
    misionNueva: 'Nueva misión',
    misionCompletada: 'Misión completada',
    misionFallida: 'Misión fallida',
    oroGanado: 'Has ganado',
    oroPerdido: 'Has perdido',
    sobrecargado: 'Vas sobrecargado',
    agotamiento: 'Estás agotado',
    guardado: 'Crónica guardada',
    cargado: 'Crónica recuperada',
  },

  errores: {
    directorFallo: 'El director ha perdido el hilo. Se reintenta…',
    directorRespaldo: 'El director externo no responde. Continúa el director interno.',
    jsonInvalido: 'La respuesta del director no era legible. Reintentando…',
    sinCredencial: 'Falta la clave de acceso del proveedor.',
    sinUrl: 'Falta la dirección del servicio.',
    guardadoFallo: 'No se ha podido guardar. ¿Almacenamiento lleno?',
    cargaFallo: 'La partida guardada no se ha podido leer.',
    guardadoIncompatible: 'Esa partida es de una versión anterior y no se puede abrir.',
  },

  puente: {
    titulo: 'Puente manual',
    copiar: 'Copiar prompt',
    copiado: 'Prompt copiado al portapapeles',
    instruccion:
      'Pega el prompt en tu asistente de IA y trae de vuelta el JSON que devuelva.',
    pegarPlaceholder: 'Pega aquí el JSON del director…',
    aplicar: 'Aplicar turno',
  },

  confirmaciones: {
    abandonar: '¿Abandonar la crónica en curso? Se perderá todo lo no guardado.',
    borrarGuardado: '¿Borrar esta partida guardada? No se puede deshacer.',
    sobrescribir: '¿Sobrescribir la partida de esta ranura?',
    si: 'Sí',
    no: 'No',
    cancelar: 'Cancelar',
  },
});

/* ═══════════════════════════════════════════════════════════════════════════
   8. TECLADO
   Mapa de código de tecla → acción lógica. InputBar y UIManager lo consultan;
   ningún componente compara `event.key` con una cadena literal.
   ═══════════════════════════════════════════════════════════════════════════ */

export const TECLAS = congelar({
  enviar: { code: 'Enter', shift: false },
  nuevaLinea: { code: 'Enter', shift: true },
  cerrar: { code: 'Escape' },
  enfocarEntrada: { code: 'Slash' },
  panelIzquierdo: { code: 'KeyI', alt: true },
  panelDerecho: { code: 'KeyM', alt: true },
  ajustes: { code: 'F1' },
  /** Dígitos 1-9 para elegir opción del popup. */
  opciones: ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9'],
  /** Historial de acciones escritas, estilo terminal. */
  historialAnterior: { code: 'ArrowUp', ctrl: true },
  historialSiguiente: { code: 'ArrowDown', ctrl: true },
});

/** Entradas conservadas en el historial de la caja de acción. */
export const HISTORIAL_ENTRADA_MAX = 40;

/* ═══════════════════════════════════════════════════════════════════════════
   9. ATRIBUTOS DE DOCUMENTO
   Atributos que el motor escribe en <html> o en #app para que el CSS reaccione.
   ═══════════════════════════════════════════════════════════════════════════ */

export const ATRIBUTOS_DOC = congelar({
  tema: 'data-theme',
  franjaDia: 'data-daypart',
  combate: 'data-combat',
  densidad: 'data-density',
  lectura: 'data-reading',
  pantallaActiva: 'data-active-screen',
  cajonIzquierdo: 'data-drawer-left',
  cajonDerecho: 'data-drawer-right',
});

/** Tema por defecto. Reservado para futuros temas alternativos. */
export const TEMA_DEFECTO = 'dark-medieval';

/* ═══════════════════════════════════════════════════════════════════════════
   EXPORTACIÓN AGRUPADA
   ═══════════════════════════════════════════════════════════════════════════ */

const UI = congelar({
  PANTALLAS,
  PANTALLA_INICIAL,
  TRANSICIONES,
  SELECTORES,
  MONTAJES,
  ICONOS,
  ICONOS_INTENCION,
  ICONOS_FRANJA,
  VOCES,
  VOCES_ANIMADAS,
  COMPORTAMIENTO,
  AJUSTES,
  TEXTOS,
  TECLAS,
  HISTORIAL_ENTRADA_MAX,
  ATRIBUTOS_DOC,
  TEMA_DEFECTO,
});

export default UI;
