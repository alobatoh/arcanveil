/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCANVEIL · data/events.data.js
 * ---------------------------------------------------------------------------
 * Eventos dinámicos del mundo.
 *
 * Sucesos que ocurren sin que el jugador los provoque y que cambian las reglas
 * mientras duran. Existen para que el mundo no parezca esperar quieto: volver a
 * un pueblo tres semanas después debería encontrarlo distinto.
 *
 * Tres alcances:
 *   · LOCAL — afecta a un lugar concreto
 *   · REGIONAL — afecta a toda una región
 *   · GLOBAL — afecta a los reinos enteros
 *
 * Los EFECTOS son multiplicativos y se acumulan. Una feria (precios ×0,85)
 * durante una buena cosecha (×0,75) deja los precios al 64 % sin que nadie haya
 * programado esa combinación. Es lo que hace que el mundo se sienta vivo en vez
 * de guionizado.
 *
 * Los GANCHOS de cada evento alimentan al generador de misiones: un incendio
 * produce «hay alguien atrapado dentro», que es mejor punto de partida que
 * cualquier plantilla genérica.
 *
 * Sin dependencias.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * @typedef {Object} Evento
 * @property {string} refId
 * @property {string} nombre
 * @property {string} alcance local|regional|global
 * @property {number} peso Probabilidad relativa de aparecer.
 * @property {[number, number]} duracion Días, mínimo y máximo.
 * @property {Object} requisitos Condiciones para poder ocurrir.
 * @property {Object} efectos Multiplicadores y banderas mientras dura.
 * @property {string[]} ganchos Semillas de misión.
 * @property {string} anuncio Cómo se comunica al empezar.
 * @property {string} promptLore Contexto para el director.
 * @property {string} [cierre] Cómo se comunica al terminar.
 */

/* ═══════════════════════════════════════════════════════════════════════════
   EVENTOS LOCALES
   ═══════════════════════════════════════════════════════════════════════════ */

/** @type {Record<string, Evento>} */
export const EVENTOS_LOCALES = Object.freeze({

  feria: {
    refId: 'feria',
    nombre: 'Feria',
    alcance: 'local',
    peso: 60,
    duracion: [2, 4],
    requisitos: { tipoLugar: 'asentamiento', servicios: ['mercado'], tamanoMin: 1 },
    efectos: { precios: 0.85, variedadMercado: 1.5, densidadNPC: 1.8 },
    ganchos: [
      'un mercader busca escolta para el viaje de vuelta',
      'alguien ha perdido algo valioso entre la multitud',
      'hay una apuesta abierta que nadie ha ganado todavía',
    ],
    anuncio: 'El lugar está de feria: puestos por todas partes y gente que no es de aquí.',
    cierre: 'La feria se ha levantado. Quedan los restos y el silencio de después.',
    promptLore: 'Feria comercial. Hay más gente, más ruido y más oportunidades de todo tipo. Los precios están bajos y los carteristas trabajan.',
  },

  luto: {
    refId: 'luto',
    nombre: 'Luto',
    alcance: 'local',
    peso: 35,
    duracion: [3, 6],
    requisitos: { tipoLugar: 'asentamiento' },
    efectos: { precios: 1.1, densidadNPC: 0.6, actitudLocal: -10, serviciosCerrados: ['mercado'] },
    ganchos: [
      'la muerte no fue natural y alguien lo sabe',
      'la familia busca a quien pueda ocuparse de un asunto pendiente',
      'hay quien se alegra y no lo disimula bien',
    ],
    anuncio: 'El pueblo está de luto. Las contraventanas están cerradas y nadie tiene ganas de hablar.',
    cierre: 'El luto ha terminado. El pueblo vuelve poco a poco a lo suyo.',
    promptLore: 'Duelo colectivo por alguien importante del lugar. La gente está seca y poco dispuesta. El mercado está cerrado.',
  },

  incendio: {
    refId: 'incendio',
    nombre: 'Incendio',
    alcance: 'local',
    peso: 20,
    duracion: [1, 2],
    requisitos: { tipoLugar: 'asentamiento' },
    efectos: { precios: 1.3, actitudLocal: -5, serviciosCerrados: ['herrero', 'mercado'], urgente: true },
    ganchos: [
      'hay alguien atrapado dentro',
      'el fuego no empezó solo',
      'alguien está aprovechando el caos para robar',
    ],
    anuncio: 'Hay un incendio. La gente corre con cubos y grita nombres.',
    cierre: 'El fuego está apagado. Queda ceniza y un hueco donde había casas.',
    promptLore: 'Incendio en curso. Situación urgente: cada turno cuenta. La gente está desesperada y agradecerá cualquier ayuda.',
  },

  fiesta_patronal: {
    refId: 'fiesta_patronal',
    nombre: 'Fiesta patronal',
    alcance: 'local',
    peso: 40,
    duracion: [1, 3],
    requisitos: { tipoLugar: 'asentamiento', servicios: ['templo'] },
    efectos: { precios: 1.15, densidadNPC: 1.6, actitudLocal: 12, moralJugador: 8 },
    ganchos: [
      'la ceremonia requiere algo que se ha perdido',
      'dos familias van a resolver una vieja disputa esta noche',
      'un forastero ha llegado justo hoy y nadie sabe por qué',
    ],
    anuncio: 'Hay fiesta. Música, comida y gente que te ofrece de beber sin conocerte.',
    cierre: 'La fiesta se ha acabado. Hay resaca general y buen ánimo.',
    promptLore: 'Celebración religiosa local. La gente está de buen humor y es hospitalaria. Los precios suben porque todo el mundo está gastando.',
  },

  ley_marcial: {
    refId: 'ley_marcial',
    nombre: 'Ley marcial',
    alcance: 'local',
    peso: 25,
    duracion: [4, 10],
    requisitos: { tipoLugar: 'asentamiento', tamanoMin: 2 },
    efectos: {
      precios: 1.25, densidadNPC: 0.7, actitudLocal: -8,
      registrosFrecuentes: true, sigiloDificil: true,
    },
    ganchos: [
      'la guardia busca a alguien y no dice a quién',
      'hay un toque de queda y alguien lo está incumpliendo',
      'un inocente está detenido y nadie mueve un dedo',
    ],
    anuncio: 'Hay guardias en cada esquina y te miran las manos al pasar.',
    cierre: 'Han levantado las restricciones. La gente respira.',
    promptLore: 'La autoridad ha impuesto restricciones. Registros frecuentes, toque de queda y muy poca paciencia. Llevar armas visibles es problema.',
  },

  epidemia_local: {
    refId: 'epidemia_local',
    nombre: 'Fiebre',
    alcance: 'local',
    peso: 22,
    duracion: [6, 14],
    requisitos: { tipoLugar: 'asentamiento' },
    efectos: {
      precioMedicina: 2.2, densidadNPC: 0.5, actitudLocal: -6,
      serviciosCerrados: ['posada'], riesgoSalud: true,
    },
    ganchos: [
      'la sanadora se ha quedado sin lo que necesita',
      'alguien vende un remedio que no funciona',
      'la fiebre no se parece a nada que hayan visto antes',
    ],
    anuncio: 'Hay fiebre en el lugar. Las puertas están marcadas y la gente guarda distancia.',
    cierre: 'La fiebre ha pasado. Han quedado huecos en las casas.',
    promptLore: 'Brote de enfermedad. La posada no acoge a nadie, las medicinas están por las nubes y la gente desconfía de los forasteros. Quedarse aquí tiene riesgo.',
  },
});

/* ═══════════════════════════════════════════════════════════════════════════
   EVENTOS REGIONALES
   ═══════════════════════════════════════════════════════════════════════════ */

/** @type {Record<string, Evento>} */
export const EVENTOS_REGIONALES = Object.freeze({

  buena_cosecha: {
    refId: 'buena_cosecha',
    nombre: 'Buena cosecha',
    alcance: 'regional',
    peso: 45,
    duracion: [15, 30],
    requisitos: { regiones: ['valle_central', 'dunas_rojas'], estaciones: ['estio', 'otono'] },
    efectos: { precios: 0.75, precioComida: 0.6, actitudLocal: 10 },
    ganchos: [
      'hay más grano del que se puede almacenar',
      'los bandidos también saben que hay excedente',
    ],
    anuncio: 'La cosecha ha sido buena. Se nota en los precios y en las caras.',
    promptLore: 'Cosecha abundante en la región. Comida barata, gente contenta y caminos con más tránsito de carros cargados.',
  },

  bandidos_activos: {
    refId: 'bandidos_activos',
    nombre: 'Bandidos en los caminos',
    alcance: 'regional',
    peso: 50,
    duracion: [8, 20],
    requisitos: {},
    efectos: { peligroRutas: 2, precios: 1.2, encuentrosHostiles: 1.6 },
    ganchos: [
      'una caravana busca escolta y paga bien',
      'la guardia ofrece recompensa por el cabecilla',
      'los bandidos no atacan a todo el mundo, y eso es raro',
    ],
    anuncio: 'Corre la voz de que los caminos no están seguros.',
    cierre: 'Los caminos vuelven a estar transitables. Alguien se ocupó.',
    promptLore: 'Actividad de bandidos en la región. Viajar es más peligroso, el comercio se encarece y hay recompensas por sus cabezas.',
  },

  disputa_faccion: {
    refId: 'disputa_faccion',
    nombre: 'Tensión entre facciones',
    alcance: 'regional',
    peso: 35,
    duracion: [10, 25],
    requisitos: { minFacciones: 2 },
    efectos: { actitudLocal: -8, precios: 1.15, faccionesEnTension: true },
    ganchos: [
      'ambas partes buscan intermediarios y desconfían de los propios',
      'alguien se está beneficiando de que no haya acuerdo',
      'un incidente menor puede desencadenarlo todo',
    ],
    anuncio: 'Hay tensión en el aire. Dos bandos que se miran mal y una chispa pendiente.',
    cierre: 'La tensión se ha rebajado, al menos por ahora.',
    promptLore: 'Conflicto abierto entre dos facciones de la región. Tomar partido tiene consecuencias inmediatas; no tomarlo también.',
  },

  peregrinacion: {
    refId: 'peregrinacion',
    nombre: 'Peregrinación',
    alcance: 'regional',
    peso: 30,
    duracion: [7, 14],
    requisitos: {},
    efectos: { densidadNPC: 1.5, peligroRutas: -1, precios: 1.1, actitudLocal: 8 },
    ganchos: [
      'un peregrino lleva algo que no le pertenece',
      'alguien se ha separado del grupo y no aparece',
      'hay quien peregrina huyendo de otra cosa',
    ],
    anuncio: 'Los caminos están llenos de peregrinos. Se viaja más acompañado.',
    promptLore: 'Peregrinación estacional. Los caminos están concurridos, lo que los hace más seguros y más lentos. Buena ocasión para oír rumores de lejos.',
  },

  invierno_duro: {
    refId: 'invierno_duro',
    nombre: 'Invierno duro',
    alcance: 'regional',
    peso: 40,
    duracion: [20, 40],
    requisitos: { estaciones: ['invierno'], regiones: ['montanas_yunque', 'valle_central'] },
    efectos: {
      precioComida: 1.8, peligroRutas: 1, pasosCerrados: true,
      consumoRaciones: 1.5, actitudLocal: -5,
    },
    ganchos: [
      'un pueblo aislado se ha quedado sin provisiones',
      'alguien tiene que cruzar el paso y no puede esperar a la primavera',
      'los lobos bajan al valle porque arriba no hay nada',
    ],
    anuncio: 'El invierno ha llegado con fuerza. Los pasos están cerrados y la comida escasea.',
    cierre: 'El invierno cede. Los pasos se abren y llegan las primeras noticias del norte.',
    promptLore: 'Invierno especialmente severo. Los pasos de montaña están intransitables, la comida es cara y viajar consume más provisiones.',
  },
});

/* ═══════════════════════════════════════════════════════════════════════════
   EVENTOS GLOBALES
   ═══════════════════════════════════════════════════════════════════════════ */

/** @type {Record<string, Evento>} */
export const EVENTOS_GLOBALES = Object.freeze({

  velo_inestable: {
    refId: 'velo_inestable',
    nombre: 'El velo se agita',
    alcance: 'global',
    peso: 15,
    duracion: [5, 12],
    requisitos: {},
    efectos: {
      encuentrosSobrenaturales: 2, precioMedicina: 1.4,
      actitudLocal: -5, sueñoInquieto: true,
    },
    ganchos: [
      'la gente sueña lo mismo y no se atreve a contarlo',
      'los guardianes del velo han cerrado su templo',
      'algo ha cruzado y nadie sabe dónde está',
    ],
    anuncio: 'Algo va mal en un nivel que nadie sabe nombrar. La gente duerme peor y los animales están nerviosos.',
    cierre: 'La sensación se disipa. Lo que fuera, ha pasado.',
    promptLore: 'El velo entre mundos está inestable en todos los reinos. Más apariciones, sueños compartidos y una inquietud general que nadie sabe explicar. Los guardianes del velo saben más de lo que dicen.',
  },

  crisis_comercial: {
    refId: 'crisis_comercial',
    nombre: 'Crisis comercial',
    alcance: 'global',
    peso: 20,
    duracion: [15, 35],
    requisitos: {},
    efectos: { precios: 1.4, oroMercaderes: 0.6, variedadMercado: 0.7 },
    ganchos: [
      'el gremio culpa a los clanes y los clanes al gremio',
      'hay quien acumula mercancía esperando que suba más',
      'un cargamento clave no llegó y nadie sabe dónde está',
    ],
    anuncio: 'Los precios han subido en todas partes y nadie sabe explicar bien por qué.',
    cierre: 'El comercio se normaliza. Los precios bajan despacio.',
    promptLore: 'Crisis comercial en todos los reinos. Todo está caro, los mercaderes tienen poco efectivo y hay menos variedad en los mercados.',
  },
});

/* ═══════════════════════════════════════════════════════════════════════════
   CATÁLOGO
   ═══════════════════════════════════════════════════════════════════════════ */

/** Todos los eventos. */
export const EVENTOS = Object.freeze({
  ...EVENTOS_LOCALES,
  ...EVENTOS_REGIONALES,
  ...EVENTOS_GLOBALES,
});

/* ═══════════════════════════════════════════════════════════════════════════
   CONSULTAS
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * @param {string} refId
 * @returns {Evento|null}
 */
export function obtenerEvento(refId) {
  return EVENTOS[refId] ?? null;
}

/**
 * Eventos de un alcance.
 * @param {string} alcance
 * @returns {Evento[]}
 */
export function porAlcance(alcance) {
  return Object.values(EVENTOS).filter((e) => e.alcance === alcance);
}

/**
 * Eventos que podrían ocurrir en un contexto dado.
 *
 * Se filtran por requisitos: una feria necesita un mercado, un invierno duro
 * necesita que sea invierno. Descartar aquí evita anuncios absurdos.
 *
 * @param {Object} contexto
 * @param {string} contexto.alcance
 * @param {Object} [contexto.lugar]
 * @param {string} [contexto.region]
 * @param {string} [contexto.estacion]
 * @param {number} [contexto.numFacciones]
 * @returns {Evento[]}
 */
export function candidatos(contexto) {
  return porAlcance(contexto.alcance).filter((e) => {
    const r = e.requisitos ?? {};

    // Tipo de lugar.
    if (r.tipoLugar && contexto.lugar?.tipo !== r.tipoLugar) return false;

    // Tamaño mínimo.
    if (r.tamanoMin !== undefined && (contexto.lugar?.tamano ?? 0) < r.tamanoMin) return false;

    // Servicios necesarios.
    if (r.servicios?.length) {
      const tiene = contexto.lugar?.servicios ?? [];
      if (!r.servicios.every((s) => tiene.includes(s))) return false;
    }

    // Regiones admitidas.
    if (r.regiones?.length && !r.regiones.includes(contexto.region)) return false;

    // Estaciones admitidas.
    if (r.estaciones?.length && !r.estaciones.includes(contexto.estacion)) return false;

    // Facciones mínimas presentes.
    if (r.minFacciones !== undefined && (contexto.numFacciones ?? 0) < r.minFacciones) return false;

    return true;
  });
}

/**
 * Combina los efectos de varios eventos activos.
 *
 * Los multiplicadores se multiplican entre sí; las banderas se acumulan con OR;
 * los valores aditivos se suman. Eso hace que las combinaciones surjan solas.
 *
 * @param {string[]} refIds
 * @returns {Object}
 */
export function combinarEfectos(refIds) {
  const total = {};

  // Claves que se suman en vez de multiplicarse.
  const aditivas = ['peligroRutas', 'actitudLocal', 'moralJugador'];

  for (const refId of refIds ?? []) {
    const evento = EVENTOS[refId];
    if (!evento?.efectos) continue;

    for (const [clave, valor] of Object.entries(evento.efectos)) {
      if (typeof valor === 'boolean') {
        total[clave] = total[clave] || valor;
        continue;
      }

      if (Array.isArray(valor)) {
        total[clave] = [...new Set([...(total[clave] ?? []), ...valor])];
        continue;
      }

      if (aditivas.includes(clave)) {
        total[clave] = (total[clave] ?? 0) + valor;
        continue;
      }

      // Multiplicativo: la base es 1.
      total[clave] = (total[clave] ?? 1) * valor;
    }
  }

  return total;
}

/**
 * Recoge los ganchos de los eventos activos.
 * @param {string[]} refIds
 * @returns {string[]}
 */
export function ganchosDe(refIds) {
  return (refIds ?? []).flatMap((refId) => EVENTOS[refId]?.ganchos ?? []);
}

export default EVENTOS;
