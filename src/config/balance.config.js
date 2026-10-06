/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCANVEIL · config/balance.config.js
 * ---------------------------------------------------------------------------
 * Todo el equilibrio numérico del juego en un único lugar. Ninguna fórmula ni
 * constante de reglas debe aparecer incrustada en un sistema: si un módulo
 * necesita un número, lo pide aquí.
 *
 * Esto no es una preferencia estética. Es lo que permite reequilibrar el juego
 * entero editando un archivo, y lo que hace que el director de juego (la IA)
 * tenga cotas duras que no puede desbordar por mucho que alucine.
 *
 * Como app.config.js, este archivo NO importa nada salvo el congelador local.
 *
 * SISTEMA NÚCLEO d20 (reglas propias, no derivadas de material protegido):
 *   Tirada = d20 + modificador de atributo + grado de competencia + situación
 *   Se compara contra un Umbral fijo por dificultad.
 *   20 natural = crítico. 1 natural = pifia.
 *   Ventaja / desventaja = 2d20 quedándose con el mejor / peor.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * Congela un objeto y sus anidados. Duplicado a propósito para no importar.
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
   1. ATRIBUTOS
   Seis atributos propios. Las claves son el identificador canónico usado por
   todo el motor; nunca se traduce en código, sólo en la interfaz.
   ═══════════════════════════════════════════════════════════════════════════ */

export const ATRIBUTOS = congelar({
  /** Orden canónico de presentación en la ficha y en la creación. */
  orden: ['vigor', 'destreza', 'temple', 'intelecto', 'astucia', 'carisma'],

  /** Valor mínimo alcanzable por cualquier vía. */
  min: 3,

  /** Valor máximo alcanzable por progresión normal. */
  max: 20,

  /** Techo absoluto incluyendo objetos y bendiciones. */
  maxAbsoluto: 26,

  /** Valor base de partida antes de repartir. */
  base: 8,

  /** Puntos disponibles para repartir en la creación de personaje. */
  puntosCreacion: 27,

  /**
   * Coste acumulativo de subir un atributo durante la creación (compra por
   * puntos). El índice es el valor de DESTINO.
   * Subir de 8 a 9 cuesta 1; de 14 a 15 cuesta 2; de 16 a 17 cuesta 3.
   */
  costeCompra: { 9: 1, 10: 1, 11: 1, 12: 1, 13: 1, 14: 2, 15: 2, 16: 3, 17: 3 },

  /** Valor máximo que se puede alcanzar mediante compra en la creación. */
  maxCreacion: 17,

  /**
   * Modificador derivado de un atributo: floor((valor - 10) / 2).
   * 10-11 → +0 · 14 → +2 · 8 → -1
   * Se declara como fórmula documentada; RulesEngine la implementa.
   */
  formulaModificador: 'floor((valor - 10) / 2)',

  /** Niveles en los que se concede una mejora de atributo. */
  nivelesMejora: [4, 8, 12, 16, 19],

  /** Puntos de atributo concedidos en cada uno de esos niveles. */
  puntosPorMejora: 2,
});

/* ═══════════════════════════════════════════════════════════════════════════
   2. TIRADAS Y UMBRALES
   ═══════════════════════════════════════════════════════════════════════════ */

export const TIRADAS = congelar({
  /** Dado base del sistema. */
  dado: 20,

  /** Resultado natural que provoca crítico (y superiores). */
  critico: 20,

  /** Resultado natural que provoca pifia (y inferiores). */
  pifia: 1,

  /**
   * Umbrales de dificultad. Son los ÚNICOS valores que el director puede
   * solicitar; cualquier otro se redondea al más cercano.
   */
  umbrales: {
    trivial: 5,
    facil: 10,
    moderada: 15,
    dificil: 20,
    ardua: 25,
    heroica: 30,
  },

  /** Umbral usado cuando el director no especifica ninguno. */
  umbralPorDefecto: 15,

  /**
   * Grados de competencia en una habilidad y su bonificador.
   * La progresión es deliberadamente plana para que el atributo siga pesando.
   */
  competencia: {
    inepto: -2,
    lego: 0,
    practicado: 2,
    experto: 4,
    maestro: 6,
    legendario: 9,
  },

  /** Modificadores situacionales que puede aplicar el motor o el director. */
  situacion: {
    muyFavorable: 4,
    favorable: 2,
    neutra: 0,
    adversa: -2,
    muyAdversa: -4,
  },

  /**
   * Grado de éxito según la diferencia entre la tirada y el umbral.
   * Permite narrativa matizada: no sólo "aciertas" o "fallas".
   */
  margenes: {
    fracasoGrave: -10,   // diferencia <= -10
    fracaso: -1,         // entre -9 y -1
    exitoJusto: 0,       // entre 0 y +4
    exitoClaro: 5,       // entre +5 y +9
    exitoRotundo: 10,    // >= +10
  },

  /** Cota dura de cualquier modificador total, para blindar contra la IA. */
  modificadorMin: -15,
  modificadorMax: 20,
});

/* ═══════════════════════════════════════════════════════════════════════════
   3. NIVEL Y EXPERIENCIA
   ═══════════════════════════════════════════════════════════════════════════ */

export const PROGRESION = congelar({
  nivelMin: 1,
  nivelMax: 20,

  /**
   * Experiencia ACUMULADA necesaria para alcanzar cada nivel.
   * Curva pensada para una partida narrativa: rápida al principio para que se
   * note el avance, y con mesetas largas a partir del nivel 12.
   * El índice del array es (nivel - 1).
   */
  umbralesXP: [
    0,      // 1
    120,    // 2
    320,    // 3
    640,    // 4
    1100,   // 5
    1750,   // 6
    2600,   // 7
    3700,   // 8
    5100,   // 9
    6900,   // 10
    9200,   // 11
    12000,  // 12
    15400,  // 13
    19500,  // 14
    24400,  // 15
    30200,  // 16
    37000,  // 17
    45000,  // 18
    54500,  // 19
    66000,  // 20
  ],

  /** Experiencia por enemigo derrotado, según su grado de amenaza. */
  xpPorAmenaza: {
    insignificante: 8,
    menor: 20,
    normal: 45,
    peligroso: 90,
    letal: 180,
    jefe: 400,
    jefeMayor: 900,
  },

  /** Experiencia por hitos narrativos. */
  xpMision: { menor: 60, secundaria: 150, principal: 400, capitulo: 900 },
  xpDescubrimiento: 35,
  xpResolucionSocial: 55,   // conflicto resuelto sin violencia
  xpPrimeraVisita: 25,

  /** Puntos de talento concedidos por nivel. */
  /** Niveles en que se reparten puntos de atributo. */
  nivelesMejora: [4, 8, 12, 16, 19],

  /** Puntos de atributo por cada nivel de mejora. */
  puntosPorMejora: 2,

  talentosPorNivel: 1,

  /** Niveles que otorgan un talento adicional. */
  talentosExtra: [5, 10, 15, 20],

  /** Nivel mínimo para optar a una clase avanzada. */
  nivelClaseAvanzada: 6,

  /** Nivel mínimo para la segunda especialización. */
  nivelSegundaEspecializacion: 14,

  /** Puntos de habilidad concedidos por nivel. */
  habilidadesPorNivel: 2,

  /** Multiplicador de XP aplicado si el enemigo es muy inferior al jugador. */
  penalizacionNivelSuperior: 0.35,

  /** Diferencia de nivel a partir de la cual se aplica esa penalización. */
  umbralPenalizacion: 4,
});

/* ═══════════════════════════════════════════════════════════════════════════
   4. VITALES
   Vida, maná y los recursos de supervivencia.
   ═══════════════════════════════════════════════════════════════════════════ */

export const VITALES = congelar({
  vida: {
    /** Vida base a nivel 1, antes de aplicar clase y Vigor. */
    base: 20,
    /** Vida adicional por punto de modificador de Vigor, por nivel. */
    porVigor: 2,
    /** Vida ganada por nivel además del dado de vida de la clase. */
    porNivel: 4,
    /** Fracción de vida por debajo de la cual se considera estado crítico. */
    umbralCritico: 0.25,
    /** Fracción por debajo de la cual la interfaz avisa. */
    umbralAlerta: 0.5,
    /**
     * Vida recuperada al descansar, como fracción del máximo.
     * corto = un alto de unas horas · largo = una noche completa.
     */
    descansoCorto: 0.25,
    descansoLargo: 1.0,
    /** Regeneración pasiva por turno de exploración (fracción del máximo). */
    regenPorTurno: 0.005,
  },

  mana: {
    base: 10,
    porIntelecto: 3,
    porNivel: 3,
    descansoCorto: 0.4,
    descansoLargo: 1.0,
    regenPorTurno: 0.02,
  },

  /**
   * Recursos de supervivencia. Todos van de 0 a 100.
   * IMPORTANTE: en hambre, sed y fatiga, 100 = pleno bienestar y 0 = colapso,
   * igual que vida y maná. Así todas las barras se leen igual.
   */
  supervivencia: {
    max: 100,
    /** Descenso por turno de exploración. */
    hambrePorTurno: 0.55,
    sedPorTurno: 0.85,
    fatigaPorTurno: 0.40,
    /** Descenso adicional por turno de combate. */
    fatigaPorRondaCombate: 1.2,
    /** Descenso adicional por hora de viaje. */
    hambrePorViaje: 2.0,
    sedPorViaje: 3.0,
    fatigaPorViaje: 2.5,

    /**
     * Umbrales de penalización. Al caer por debajo de cada valor se aplica el
     * modificador indicado a TODAS las tiradas.
     */
    umbrales: [
      { desde: 60, etiqueta: 'bien', modificador: 0 },
      { desde: 35, etiqueta: 'incomodo', modificador: -1 },
      { desde: 15, etiqueta: 'grave', modificador: -3 },
      { desde: 0, etiqueta: 'critico', modificador: -6 },
    ],

    /** Daño por turno cuando un recurso llega a 0. */
    danoPorInanicion: 2,
    danoPorDeshidratacion: 4,
    danoPorAgotamiento: 1,
  },

  moral: {
    max: 100,
    inicial: 65,
    /** Cambio por acontecimiento. */
    porVictoria: 8,
    porDerrota: -12,
    porAliadoCaido: -20,
    porMisionCompletada: 12,
    porDescansoEnPosada: 15,
    porHambreExtrema: -10,
    /** Modificador a tiradas sociales y de temple según la moral. */
    umbrales: [
      { desde: 80, etiqueta: 'exaltado', modificador: 2 },
      { desde: 50, etiqueta: 'firme', modificador: 0 },
      { desde: 25, etiqueta: 'vacilante', modificador: -2 },
      { desde: 0, etiqueta: 'quebrado', modificador: -5 },
    ],
  },
});

/* ═══════════════════════════════════════════════════════════════════════════
   5. COMBATE
   ═══════════════════════════════════════════════════════════════════════════ */

export const COMBATE = congelar({
  /** Defensa base antes de armadura y Destreza. */
  /** Enemigos simultáneos como máximo en un combate. */
  enemigosMax: 6,

  /**
   * Rondas máximas antes de dar el combate por tablas. Existe para que un
   * enfrentamiento mal equilibrado no se eternice.
   */
  rondasMax: 40,
  defensaBase: 10,

  /** Iniciativa = d20 + modificador de Destreza + este bonificador. */
  iniciativaBase: 0,

  /** Multiplicador de daño en un golpe crítico. */
  multiplicadorCritico: 2,

  /** Daño mínimo de cualquier ataque que impacta. */
  danoMinimo: 1,

  /** Probabilidad base de esquiva completa, antes de Destreza (0-1). */
  esquivaBase: 0.0,

  /** Esquiva ganada por punto de modificador de Destreza. */
  esquivaPorDestreza: 0.02,

  /** Techo de esquiva, para que nunca sea invulnerable. */
  esquivaMax: 0.35,

  /** Reducción de daño por punto de armadura, y su techo. */
  reduccionPorArmadura: 1,
  reduccionMax: 0.75,

  /** Bonificador al atacar por la espalda o con sorpresa. */
  bonoEmboscada: 4,

  /** Penalización por atacar mientras se está rodeado. */
  penalizacionRodeado: -2,

  /** Probabilidad base de huir con éxito de un combate (0-1). */
  huidaBase: 0.5,

  /** Modificador de huida por punto de diferencia de Destreza con el enemigo más rápido. */
  huidaPorDestreza: 0.05,

  /** Vida a la que un enemigo normal considera rendirse o huir (fracción). */
  umbralHuidaEnemigo: 0.2,

  /** Los jefes nunca huyen. */
  jefesHuyen: false,

  /**
   * Duración por defecto de un estado alterado, en rondas.
   * StatusEffects.js la usa cuando el efecto no declara la suya.
   */
  duracionEstadoDefecto: 3,

  /** Acumulaciones máximas de un mismo estado. */
  acumulacionesMax: 5,

  /** Daño por acumulación y ronda de los estados periódicos. */
  danoPorAcumulacion: { veneno: 2, sangrado: 3, quemadura: 4 },

  /** Umbral de amenaza por encima del cual un encuentro se marca como letal. */
  amenazaLetal: 1.6,

  /** Vida del jugador a la que el motor sugiere retirada en la interfaz. */
  sugerirRetirada: 0.2,
});

/* ═══════════════════════════════════════════════════════════════════════════
   6. INVENTARIO Y OBJETOS
   ═══════════════════════════════════════════════════════════════════════════ */

export const OBJETOS = congelar({
  /** Capacidad de carga base en unidades de peso, más Vigor. */
  cargaBase: 25,
  cargaPorVigor: 5,

  /**
   * Umbrales de impedimenta como fracción de la capacidad.
   * Al superarlos se aplica el modificador a Destreza y velocidad.
   */
  impedimenta: [
    { desde: 0.0, etiqueta: 'ligero', modificador: 0 },
    { desde: 0.7, etiqueta: 'cargado', modificador: -1 },
    { desde: 0.9, etiqueta: 'sobrecargado', modificador: -3 },
    { desde: 1.0, etiqueta: 'inmovilizado', modificador: -6 },
  ],

  /**
   * Rarezas. `peso` es la probabilidad relativa en las tablas de botín,
   * `multiplicador` afecta al precio y a la potencia de los afijos.
   */
  rarezas: {
    comun: { peso: 100, multiplicador: 1.0, afijos: 0 },
    tosco: { peso: 60, multiplicador: 0.6, afijos: 0 },
    fino: { peso: 30, multiplicador: 2.2, afijos: 1 },
    superior: { peso: 12, multiplicador: 5.0, afijos: 2 },
    arcano: { peso: 4, multiplicador: 12.0, afijos: 3 },
    legendario: { peso: 1, multiplicador: 35.0, afijos: 4 },
    mitico: { peso: 0.15, multiplicador: 90.0, afijos: 5 },
  },

  /** Durabilidad: 0-100. */
  durabilidad: {
    max: 100,
    /** Pérdida por golpe dado (armas) y recibido (armaduras). */
    porGolpeArma: 0.6,
    porGolpeArmadura: 0.8,
    /** Por debajo de este valor el objeto pierde eficacia. */
    umbralDesgastado: 40,
    /** Penalización a la eficacia del objeto desgastado. */
    penalizacionDesgastado: -1,
    /** A 0 el objeto queda inservible hasta ser reparado. */
    umbralRoto: 0,
    /** Coste de reparación como fracción del valor del objeto por punto perdido. */
    costeReparacion: 0.008,
  },

  /** Pilas máximas por tipo de objeto apilable. */
  pilaMax: { consumible: 20, material: 50, municion: 99, moneda: Infinity },

  /** Ranuras de equipo disponibles. */
  ranurasEquipo: [
    'cabeza', 'torso', 'manos', 'piernas', 'pies',
    'armaPrincipal', 'armaSecundaria', 'capa', 'amuleto', 'anillo1', 'anillo2',
  ],
});

/* ═══════════════════════════════════════════════════════════════════════════
   7. ECONOMÍA
   ═══════════════════════════════════════════════════════════════════════════ */

export const ECONOMIA = congelar({
  /** Oro inicial del personaje. */
  oroInicial: 25,

  /** Oro máximo transportable (evita desbordes por alucinación de la IA). */
  oroMax: 999_999,

  /** Fracción del valor base que paga un mercader al comprar al jugador. */
  ratioVenta: 0.35,

  /** Multiplicador que aplica el mercader al vender al jugador. */
  ratioCompra: 1.0,

  /** Efecto del Carisma en el regateo, por punto de modificador. */
  regateoPorCarisma: 0.03,

  /** Mejora máxima del precio conseguible regateando. */
  regateoMax: 0.25,

  /** Efecto de la reputación con la facción del mercader en el precio. */
  descuentoPorReputacion: { odiado: 0.5, hostil: 0.25, receloso: 0.1, neutral: 0, cordial: -0.05, aliado: -0.12, venerado: -0.2 },

  /** Oro que porta un enemigo según su amenaza. */
  botinOro: {
    insignificante: [0, 3],
    menor: [2, 10],
    normal: [8, 30],
    peligroso: [25, 80],
    letal: [60, 200],
    jefe: [150, 500],
    jefeMayor: [400, 1500],
  },

  /** Precios de referencia de servicios habituales. */
  servicios: { posadaCatre: 3, posadaHabitacion: 8, comida: 2, agua: 1, curacionMenor: 25, viajeCaravana: 12 },

  /** Fluctuación máxima de precios por región y oferta (±). */
  fluctuacionMax: 0.3,
});

/* ═══════════════════════════════════════════════════════════════════════════
   7b. ATACAR A CIVILES
   ---------------------------------------------------------------------------
   Decidido (6-oct-2026): a un civil se le puede atacar, con consecuencias.
   Las cifras de actitud y reputación son las que ya había (acción social
   «atacar» en RelationshipSystem y `SOCIAL.reputacion.porCrimenPresenciado`).
   Lo de aquí es PROPUESTA TÉCNICA ajustable, no una cifra dictada: con qué
   ficha pelea quien no tiene una de enemigo.
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Ofertas espontáneas de encargos, por TIEMPO DEL MUNDO (decisión del
 * 6-oct-2026: horas, no turnos ni pulsos). Las cifras son PROPUESTA TÉCNICA
 * ajustable: la cadencia no traduce los 12 turnos de antes a 12 horas; la
 * probabilidad es la de antes (0,2 por turno de 10 minutos), ahora por cada
 * 10 minutos de mundo transcurridos, se juegue como se juegue.
 */
export const OFERTAS = congelar({
  /** Horas de mundo, como mínimo, entre una oferta espontánea y la siguiente. */
  cadenciaHoras: 3,
  /** Probabilidad por cada 10 minutos de mundo, una vez cumplida la cadencia. */
  probabilidadCada10Min: 0.2,
});

/**
 * Riesgo de encuentro al esperar en un sitio peligroso (decisión del
 * 6-oct-2026). PROPUESTA TÉCNICA ajustable: `factor` 1 = el mismo riesgo por
 * hora que explorar ese sitio (ver `Exploration.riesgoAlEsperar`).
 */
export const ESPERA_RIESGO = congelar({
  factor: 1,
});

/**
 * Comer (decisión del 6-oct-2026: el hambre y la sed no son presión de
 * supervivencia; comer solo recupera VIDA en un campamento). PROPUESTA
 * TÉCNICA ajustable: cuánta vida devuelve una comida.
 */
export const COMIDA = congelar({
  /** Fracción de la vida máxima que devuelve una comida en campamento. */
  curaVidaFraccion: 0.25,
});

export const AGRESION = congelar({
  /** Ficha de combate de un civil sin ficha propia (ver `enemies.data.js`, `civil`). */
  plantillaCivil: 'civil',
  /** Ficha de un guardia de la escena que se mete (la única de guardia que hay). */
  plantillaGuardia: 'guardia_corrupto',
});

/* ═══════════════════════════════════════════════════════════════════════════
   8. REPUTACIÓN Y RELACIONES
   ═══════════════════════════════════════════════════════════════════════════ */

export const SOCIAL = congelar({
  /** Escala de reputación con facciones: -100 a +100. */
  reputacion: {
    min: -100,
    max: 100,
    inicial: 0,
    niveles: [
      { desde: -100, clave: 'odiado' },
      { desde: -60, clave: 'hostil' },
      { desde: -25, clave: 'receloso' },
      { desde: -10, clave: 'neutral' },
      { desde: 25, clave: 'cordial' },
      { desde: 60, clave: 'aliado' },
      { desde: 90, clave: 'venerado' },
    ],
    /** Cambios típicos por acción. */
    porFavorMenor: 5,
    porMisionFaccion: 15,
    porTraicion: -40,
    porCrimenPresenciado: -20,
    /** Contagio a facciones aliadas y enemigas (fracción del cambio). */
    contagioAliada: 0.3,
    contagioEnemiga: -0.4,
  },

  /** Afinidad individual con un PNJ: -100 a +100. */
  relacion: {
    min: -100,
    max: 100,
    inicial: 0,
    /** Modificador a tiradas sociales por cada 20 puntos de afinidad. */
    modificadorPor20: 1,
    /** Decaimiento hacia 0 por día sin interacción. */
    decaimientoDiario: 0.5,
    /** Umbral a partir del cual el PNJ puede ofrecer misiones personales. */
    umbralConfianza: 45,
  },

  /** Ejes de alineamiento: -100 (crueldad/caos) a +100 (bondad/ley). */
  /** Recuerdos que conserva un personaje no jugador sobre el jugador. */
  memoriaNPC: 12,

  /** Días entre revisiones de la deriva de actitud. */
  diasDeriva: 6,

  /**
   * Cuánto se enfría una actitud por revisión.
   * El rencor cede más despacio que el afecto: perder a alguien es más fácil
   * que ganárselo, y recuperarlo debe costar.
   */
  derivaPositiva: 3,
  derivaNegativa: 2,

  alineamiento: {
    min: -100,
    max: 100,
    inicialMoral: 0,
    inicialOrden: 0,
    /** Cambio por acción registrada por ConsequenceEngine. */
    pasoMenor: 3,
    pasoMedio: 8,
    pasoMayor: 20,
    /** Amplitud de la banda considerada "neutral" en cada eje. */
    bandaNeutral: 20,
  },
});

/* ═══════════════════════════════════════════════════════════════════════════
   9. MUNDO, TIEMPO Y CLIMA
   ═══════════════════════════════════════════════════════════════════════════ */

export const MUNDO = congelar({
  tiempo: {
    /** Minutos de mundo que avanza un turno de exploración. */
    minutosPorTurno: 10,
    /** Minutos que avanza una ronda de combate. */
    minutosPorRonda: 1,
    /** Minutos de un descanso corto y de uno largo. */
    minutosDescansoCorto: 60,
    minutosDescansoLargo: 480,
    /** Horas por día y días por estación. */
    horasPorDia: 24,
    diasPorEstacion: 28,
    /**
     * Franjas del día. La clave se escribe en <html data-daypart> y tiñe la
     * interfaz (ver tokens.css).
     */
    franjas: [
      { desde: 0, clave: 'madrugada' },
      { desde: 5, clave: 'alba' },
      { desde: 7, clave: 'manana' },
      { desde: 12, clave: 'mediodia' },
      { desde: 15, clave: 'tarde' },
      { desde: 19, clave: 'ocaso' },
      { desde: 21, clave: 'noche' },
    ],
    estaciones: ['primavera', 'estio', 'otono', 'invierno'],
  },

  clima: {
    /** Probabilidad de que el clima cambie en un turno dado (0-1). */
    probabilidadCambio: 0.08,
    /** Estados posibles y su modificador a tiradas de percepción y viaje. */
    estados: {
      despejado: { percepcion: 0, viaje: 0 },
      nublado: { percepcion: 0, viaje: 0 },
      lluvia: { percepcion: -1, viaje: -1 },
      tormenta: { percepcion: -3, viaje: -3 },
      niebla: { percepcion: -4, viaje: -2 },
      nieve: { percepcion: -2, viaje: -3 },
      ventisca: { percepcion: -5, viaje: -5 },
      calorSofocante: { percepcion: 0, viaje: -2 },
    },
    /** Multiplicador de sed y fatiga por clima extremo. */
    multiplicadorSed: { calorSofocante: 2.0, ventisca: 0.6, tormenta: 0.8 },
  },

  exploracion: {
    /** Probabilidad base de encuentro aleatorio por turno (0-1). */
    probabilidadEncuentro: 0.18,
    /** Modificador de esa probabilidad por tipo de terreno. */
    porTerreno: { ciudad: -0.14, camino: -0.06, bosque: 0.04, montana: 0.06, ruinas: 0.10, mazmorra: 0.16, oceano: 0.02 },
    /** Modificador nocturno. */
    bonoNoche: 0.07,
    /** Probabilidad de hallazgo al registrar una localización (0-1). */
    probabilidadHallazgo: 0.25,
    /** Turnos mínimos entre dos encuentros para evitar acoso. */
    turnosGracia: 3,
    /**
     * Encuentros aleatorios según la intensidad elegida al crear la partida.
     *
     * `factor` multiplica la probabilidad de cada tirada; `gracia` son los
     * turnos que tienen que pasar tras un encuentro (y al empezar) antes de que
     * pueda haber otro. En Pacífica la gracia es larga a propósito: en treinta
     * turnos cabe como mucho uno.
     */
    porIntensidad: {
      relato: { factor: 0.35, gracia: 16 },
      equilibrado: { factor: 1, gracia: 3 },
      duro: { factor: 1.2, gracia: 2 },
      implacable: { factor: 1.4, gracia: 1 },
    },
  },
});

/* ═══════════════════════════════════════════════════════════════════════════
   10. DIRECCIÓN DE JUEGO ADAPTATIVA
   ═══════════════════════════════════════════════════════════════════════════ */

export const DIRECCION = congelar({
  /** Multiplicador de dificultad por preajuste elegido en la creación. */
  preajustes: {
    relato: 0.6,     // énfasis narrativo, combate indulgente
    equilibrado: 1.0,
    duro: 1.35,
    implacable: 1.7, // muerte permanente recomendada
  },

  /** Ventana de turnos que analiza DifficultyDirector para ajustar el ritmo. */
  ventanaAnalisis: 12,

  /** Si el jugador supera esta tasa de éxitos, la dificultad sube. */
  umbralSubida: 0.8,

  /** Si baja de esta tasa, la dificultad se relaja. */
  umbralBajada: 0.35,

  /** Paso de ajuste por revisión. */
  pasoAjuste: 0.08,

  /** Cotas del ajuste dinámico. */
  ajusteMin: 0.7,
  ajusteMax: 1.4,

  /** Turnos sin conflicto tras los cuales el director introduce tensión. */
  turnosSinTensionMax: 8,

  /** Turnos de combate seguidos tras los cuales fuerza un respiro. */
  turnosSinRespiro: 4,
});

/* ═══════════════════════════════════════════════════════════════════════════
   11. COTAS DE SEGURIDAD PARA LA IA
   ---------------------------------------------------------------------------
   Éste es el bloque más importante del archivo. El director de juego propone
   cambios de estado; EffectApplier los recorta contra estos valores ANTES de
   aplicarlos. Sin esto, una alucinación del modelo arruina la partida.
   ═══════════════════════════════════════════════════════════════════════════ */

export const COTAS_IA = congelar({
  /** Cambio máximo por turno en cada recurso, en valor absoluto. */
  deltaMax: {
    hp: 60,
    mana: 40,
    xp: 1200,
    gold: 2000,
    hunger: 30,
    thirst: 30,
    fatigue: 30,
    morale: 35,
    reputation: 30,
    relation: 30,
  },

  /** Objetos nuevos que puede conceder el director en un solo turno. */
  objetosPorTurno: 4,

  /** Rareza máxima que puede conceder sin un hito narrativo declarado. */
  rarezaMaxSinHito: 'superior',

  /** Enemigos que puede invocar en un combate. */
  enemigosPorCombate: 6,

  /** Nivel máximo de enemigo relativo al del jugador. */
  nivelEnemigoMax: 4,

  /** Misiones que puede abrir en un turno. */
  misionesPorTurno: 2,

  /** Longitud máxima del texto narrativo, en caracteres. */
  narracionMax: 2400,

  /** Longitud máxima de la etiqueta de una opción. */
  etiquetaOpcionMax: 42,

  /** Hechos de memoria que puede registrar en un turno. */
  memoriaPorTurno: 3,

  /**
   * Acciones que el director NUNCA puede ejecutar por su cuenta. Si aparecen
   * en la respuesta, EffectApplier las descarta y registra un aviso.
   */
  prohibido: [
    'matarJugadorSinCombate',
    'vaciarInventario',
    'fijarNivel',
    'otorgarClaseAvanzada',
    'modificarAtributoBase',
    'borrarMisionCompletada',
  ],

  /** Reintentos de reparación de un JSON malformado antes de caer al modo procedural. */
  reintentosParseo: 2,
});

/* ═══════════════════════════════════════════════════════════════════════════
   EXPORTACIÓN AGRUPADA
   ═══════════════════════════════════════════════════════════════════════════ */

const BALANCE = congelar({
  ATRIBUTOS,
  TIRADAS,
  PROGRESION,
  VITALES,
  COMBATE,
  OBJETOS,
  ECONOMIA,
  SOCIAL,
  MUNDO,
  DIRECCION,
  COTAS_IA,
});

export default BALANCE;
