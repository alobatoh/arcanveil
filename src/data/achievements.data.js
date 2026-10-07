/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCANVEIL · data/achievements.data.js
 * ---------------------------------------------------------------------------
 * Hazañas.
 *
 * No son trofeos de escaparate: son un comentario sobre cómo juegas. Una
 * hazaña bien elegida le dice al jugador algo que no sabía de su propia
 * partida — que lleva veinte turnos sin desenvainar, que ha perdonado a más
 * gente de la que ha matado, que aquella promesa que hizo en el turno cinco
 * sigue sin cumplirse.
 *
 * Cuatro clases:
 *
 *   · PROGRESO — hitos objetivos. Nivel, lugares, misiones.
 *   · ESTILO — cómo juegas. Diplomático, carnicero, explorador.
 *   · MOMENTO — situaciones concretas y raras. Sobrevivir a un punto de vida.
 *   · OCULTAS — no se anuncian hasta cumplirse. Son las que más gustan.
 *
 * `condicion` es una función pura sobre las estadísticas y el estado. Que sea
 * una función y no un valor permite expresar cosas que un umbral no puede:
 * «más conflictos resueltos hablando que peleando», por ejemplo.
 *
 * Sin dependencias.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * @typedef {Object} Hazana
 * @property {string} refId
 * @property {string} nombre
 * @property {string} descripcion Qué hay que hacer.
 * @property {string} [texto] Lo que se dice al conseguirla.
 * @property {string} clase progreso|estilo|momento|oculta
 * @property {string} icono
 * @property {boolean} oculta Si se muestra antes de conseguirla.
 * @property {Function} condicion (stats, estado) → boolean
 * @property {Function} [progreso] (stats, estado) → {actual, total}
 * @property {number} peso Para ordenar la lista.
 */

/* ═══════════════════════════════════════════════════════════════════════════
   PROGRESO
   ═══════════════════════════════════════════════════════════════════════════ */

/** @type {Record<string, Hazana>} */
export const PROGRESO = Object.freeze({

  primer_paso: {
    refId: 'primer_paso',
    nombre: 'El primer paso',
    descripcion: 'Empezar una crónica.',
    texto: 'Toda historia empieza con alguien que decide salir de casa.',
    clase: 'progreso',
    icono: 'mapa',
    oculta: false,
    peso: 100,
    condicion: (s) => s.turnos >= 1,
  },

  veterano: {
    refId: 'veterano',
    nombre: 'Veterano',
    descripcion: 'Alcanzar el nivel 5.',
    clase: 'progreso',
    icono: 'xp',
    oculta: false,
    peso: 90,
    condicion: (s, e) => (e.player?.nivel ?? 1) >= 5,
    progreso: (s, e) => ({ actual: e.player?.nivel ?? 1, total: 5 }),
  },

  curtido: {
    refId: 'curtido',
    nombre: 'Curtido',
    descripcion: 'Alcanzar el nivel 10.',
    texto: 'Ya no eres quien salió de casa.',
    clase: 'progreso',
    icono: 'xp',
    oculta: false,
    peso: 85,
    condicion: (s, e) => (e.player?.nivel ?? 1) >= 10,
    progreso: (s, e) => ({ actual: e.player?.nivel ?? 1, total: 10 }),
  },

  cartografo: {
    refId: 'cartografo',
    nombre: 'Cartógrafo',
    descripcion: 'Descubrir diez lugares.',
    clase: 'progreso',
    icono: 'mapa',
    oculta: false,
    peso: 80,
    condicion: (s) => (s.lugaresDescubiertos ?? 0) >= 10,
    progreso: (s) => ({ actual: s.lugaresDescubiertos ?? 0, total: 10 }),
  },

  trotamundos: {
    refId: 'trotamundos',
    nombre: 'Trotamundos',
    descripcion: 'Pisar las seis regiones.',
    texto: 'Has visto los Reinos Quebrados enteros.',
    clase: 'progreso',
    icono: 'mapa',
    oculta: false,
    peso: 70,
    condicion: (s) => (s.regionesVisitadas?.length ?? 0) >= 6,
    progreso: (s) => ({ actual: s.regionesVisitadas?.length ?? 0, total: 6 }),
  },

  cumplidor: {
    refId: 'cumplidor',
    nombre: 'Cumplidor',
    descripcion: 'Completar diez misiones.',
    clase: 'progreso',
    icono: 'mision',
    oculta: false,
    peso: 75,
    condicion: (s) => (s.misionesCompletadas ?? 0) >= 10,
    progreso: (s) => ({ actual: s.misionesCompletadas ?? 0, total: 10 }),
  },

  superviviente: {
    refId: 'superviviente',
    nombre: 'Superviviente',
    descripcion: 'Sobrevivir cien turnos.',
    clase: 'progreso',
    icono: 'corazon',
    oculta: false,
    peso: 78,
    condicion: (s) => (s.turnos ?? 0) >= 100,
    progreso: (s) => ({ actual: s.turnos ?? 0, total: 100 }),
  },
});

/* ═══════════════════════════════════════════════════════════════════════════
   ESTILO
   ---------------------------------------------------------------------------
   Las más interesantes. Miden cómo juegas, no cuánto.
   ═══════════════════════════════════════════════════════════════════════════ */

/** @type {Record<string, Hazana>} */
export const ESTILO = Object.freeze({

  diplomatico: {
    refId: 'diplomatico',
    nombre: 'La palabra antes que el acero',
    descripcion: 'Resolver más conflictos hablando que peleando, con al menos diez resueltos.',
    texto: 'Hay quien cruza los reinos sin desenvainar. Tú eres de esos.',
    clase: 'estilo',
    icono: 'ojo',
    oculta: false,
    peso: 60,
    condicion: (s) => {
      const social = s.conflictosResueltosSinViolencia ?? 0;
      return social >= 10 && social > (s.victorias ?? 0);
    },
    progreso: (s) => ({ actual: s.conflictosResueltosSinViolencia ?? 0, total: 10 }),
  },

  carnicero: {
    refId: 'carnicero',
    nombre: 'Camino de sangre',
    descripcion: 'Derrotar a cincuenta enemigos.',
    texto: 'Detrás de ti queda un rastro que nadie olvidará.',
    clase: 'estilo',
    icono: 'espada',
    oculta: false,
    peso: 60,
    condicion: (s) => (s.enemigosDerrotados ?? 0) >= 50,
    progreso: (s) => ({ actual: s.enemigosDerrotados ?? 0, total: 50 }),
  },

  intachable: {
    refId: 'intachable',
    nombre: 'Intachable',
    descripcion: 'Completar quince misiones sin fallar ninguna.',
    texto: 'Tu palabra vale. Eso, en los reinos, es una moneda escasa.',
    clase: 'estilo',
    icono: 'mision',
    oculta: false,
    peso: 50,
    condicion: (s) => (s.misionesCompletadas ?? 0) >= 15 && (s.misionesFallidas ?? 0) === 0,
    progreso: (s) => ({ actual: s.misionesCompletadas ?? 0, total: 15 }),
  },

  buscavidas: {
    refId: 'buscavidas',
    nombre: 'Buscavidas',
    descripcion: 'Acumular mil de oro.',
    clase: 'estilo',
    icono: 'oro',
    oculta: false,
    peso: 55,
    condicion: (s, e) => (e.player?.oro ?? 0) >= 1000,
    progreso: (s, e) => ({ actual: e.player?.oro ?? 0, total: 1000 }),
  },

  bien_relacionado: {
    refId: 'bien_relacionado',
    nombre: 'Bien relacionado',
    descripcion: 'Ser aliado de tres facciones a la vez.',
    texto: 'Contentar a tres bandos distintos tiene mérito. Y peligro.',
    clase: 'estilo',
    icono: 'escudo',
    oculta: false,
    peso: 45,
    condicion: (s, e) => {
      const reputaciones = Object.values(e.factions?.reputacion ?? {});
      return reputaciones.filter((r) => r >= 60).length >= 3;
    },
  },

  proscrito: {
    refId: 'proscrito',
    nombre: 'Proscrito',
    descripcion: 'Ganarte el odio de dos facciones.',
    texto: 'Hay puertas que ya no se te abrirán.',
    clase: 'estilo',
    icono: 'huir',
    oculta: false,
    peso: 40,
    condicion: (s, e) => {
      const reputaciones = Object.values(e.factions?.reputacion ?? {});
      return reputaciones.filter((r) => r <= -75).length >= 2;
    },
  },

  ratón_de_biblioteca: {
    refId: 'raton_biblioteca',
    nombre: 'Ratón de biblioteca',
    descripcion: 'Conocer a treinta personas.',
    clase: 'estilo',
    icono: 'pergamino',
    oculta: false,
    peso: 42,
    condicion: (s) => (s.personasConocidas ?? 0) >= 30,
    progreso: (s) => ({ actual: s.personasConocidas ?? 0, total: 30 }),
  },
});

/* ═══════════════════════════════════════════════════════════════════════════
   MOMENTO
   ---------------------------------------------------------------------------
   Situaciones concretas y raras. Se comprueban en el instante en que ocurren.
   ═══════════════════════════════════════════════════════════════════════════ */

/** @type {Record<string, Hazana>} */
export const MOMENTO = Object.freeze({

  al_filo: {
    refId: 'al_filo',
    nombre: 'Al filo',
    descripcion: 'Ganar un combate con un solo punto de vida.',
    texto: 'Un punto. Uno.',
    clase: 'momento',
    icono: 'corazon',
    oculta: false,
    peso: 30,
    condicion: (s) => (s.victoriasAlLimite ?? 0) >= 1,
  },

  golpe_perfecto: {
    refId: 'golpe_perfecto',
    nombre: 'Golpe perfecto',
    descripcion: 'Sacar tres críticos en un mismo combate.',
    clase: 'momento',
    icono: 'espada',
    oculta: false,
    peso: 28,
    condicion: (s) => (s.mejorRachaCriticos ?? 0) >= 3,
  },

  mala_racha: {
    refId: 'mala_racha',
    nombre: 'Mala racha',
    descripcion: 'Fallar cinco tiradas seguidas.',
    texto: 'A veces los dados tienen algo personal contigo.',
    clase: 'momento',
    icono: 'dado',
    oculta: false,
    peso: 25,
    condicion: (s) => (s.peorRachaFallos ?? 0) >= 5,
  },

  cazador_de_jefes: {
    refId: 'cazador_de_jefes',
    nombre: 'Cazador de jefes',
    descripcion: 'Derrotar a un jefe.',
    texto: 'Lo que llevaba siglos en pie ya no lo está.',
    clase: 'momento',
    icono: 'espada',
    oculta: false,
    peso: 35,
    condicion: (s) => (s.jefesDerrotados ?? 0) >= 1,
  },

  coleccionista: {
    refId: 'coleccionista',
    nombre: 'Coleccionista',
    descripcion: 'Encontrar un objeto legendario.',
    clase: 'momento',
    icono: 'bolsa',
    oculta: false,
    peso: 32,
    condicion: (s) => (s.objetosLegendarios ?? 0) >= 1,
  },
});

/* ═══════════════════════════════════════════════════════════════════════════
   OCULTAS
   ---------------------------------------------------------------------------
   No se anuncian. Aparecer de la nada es precisamente su gracia.
   ═══════════════════════════════════════════════════════════════════════════ */

/** @type {Record<string, Hazana>} */
export const OCULTAS = Object.freeze({

  pacifista: {
    refId: 'pacifista',
    nombre: 'Sin desenvainar',
    descripcion: 'Llegar al nivel 5 sin matar a nadie.',
    texto: 'Cinco niveles y las manos limpias. Poca gente lo consigue.',
    clase: 'oculta',
    icono: 'escudo',
    oculta: true,
    peso: 20,
    condicion: (s, e) => (e.player?.nivel ?? 1) >= 5 && (s.enemigosDerrotados ?? 0) === 0,
  },

  el_que_vuelve: {
    refId: 'el_que_vuelve',
    nombre: 'El que vuelve',
    descripcion: 'Sobrevivir a una caída.',
    texto: 'Estabas muerto. Y aquí sigues.',
    clase: 'oculta',
    icono: 'corazon',
    oculta: true,
    peso: 18,
    condicion: (s) => (s.salvavidasUsados ?? 0) >= 1,
  },

  memoria_larga: {
    refId: 'memoria_larga',
    nombre: 'Memoria larga',
    descripcion: 'Cumplir una promesa hecha más de cincuenta turnos antes.',
    texto: 'Dijiste que lo harías. Tardaste, pero lo hiciste.',
    clase: 'oculta',
    icono: 'mision',
    oculta: true,
    peso: 15,
    condicion: (s) => (s.promesasTardias ?? 0) >= 1,
  },

  // RETIRADA (7-oct-2026): el hambre ya no cuenta (decisión del 6-oct) y
  // `turnosBienAlimentado` no sube, así que nadie podía conseguirla. No se
  // evalúa en partidas nuevas ni cuenta en el total; quien ya la tenga la
  // conserva y la ve. Si se sustituye o se reinterpreta lo decide Alejandro.
  glotón: {
    retirada: true,
    refId: 'gloton',
    nombre: 'Nunca con hambre',
    descripcion: 'Pasar cincuenta turnos sin bajar de la mitad de comida.',
    clase: 'oculta',
    icono: 'hambre',
    oculta: true,
    peso: 12,
    condicion: (s) => (s.turnosBienAlimentado ?? 0) >= 50,
  },

  el_ultimo_en_pie: {
    refId: 'el_ultimo_en_pie',
    nombre: 'El último en pie',
    descripcion: 'Ganar un combate contra cuatro o más enemigos a la vez.',
    texto: 'Cuatro contra uno. Y sigues aquí.',
    clase: 'oculta',
    icono: 'espada',
    oculta: true,
    peso: 16,
    condicion: (s) => (s.mayorVictoriaEnDesventaja ?? 0) >= 4,
  },

  arqueologo: {
    refId: 'arqueologo',
    nombre: 'Arqueólogo',
    descripcion: 'Encontrar los tres lugares que solo se descubren explorando.',
    texto: 'Hay sitios que no salen en ningún mapa. Los has encontrado todos.',
    clase: 'oculta',
    icono: 'mapa',
    oculta: true,
    peso: 14,
    condicion: (s) => (s.lugaresOcultos ?? 0) >= 3,
    progreso: (s) => ({ actual: s.lugaresOcultos ?? 0, total: 3 }),
  },
});

/* ═══════════════════════════════════════════════════════════════════════════
   CATÁLOGO
   ═══════════════════════════════════════════════════════════════════════════ */

/** Todas las hazañas. */
export const HAZANAS = Object.freeze({
  ...PROGRESO,
  ...ESTILO,
  ...MOMENTO,
  ...OCULTAS,
});

/* ═══════════════════════════════════════════════════════════════════════════
   CONSULTAS
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * @param {string} refId
 * @returns {Hazana|null}
 */
export function obtenerHazana(refId) {
  return HAZANAS[refId] ?? null;
}

/**
 * Hazañas de una clase.
 * @param {string} clase
 * @returns {Hazana[]}
 */
export function porClase(clase) {
  return Object.values(HAZANAS).filter((h) => h.clase === clase);
}

/**
 * Evalúa qué hazañas se cumplen con el estado actual.
 *
 * @param {Object} stats
 * @param {Object} estado
 * @param {string[]} yaConseguidas
 * @returns {Hazana[]} Las recién cumplidas.
 */
export function evaluar(stats, estado, yaConseguidas = []) {
  const conseguidas = new Set(yaConseguidas);

  return Object.values(HAZANAS).filter((h) => {
    if (conseguidas.has(h.refId) || h.retirada) return false;

    try {
      return Boolean(h.condicion(stats, estado));
    } catch {
      // Una condición que falla no debe romper la partida.
      return false;
    }
  });
}

/**
 * Progreso hacia una hazaña, si lo declara.
 *
 * @param {string} refId
 * @param {Object} stats
 * @param {Object} estado
 * @returns {{actual: number, total: number, fraccion: number}|null}
 */
export function progresoDe(refId, stats, estado) {
  const h = HAZANAS[refId];
  if (!h?.progreso) return null;

  try {
    const p = h.progreso(stats, estado);
    return {
      actual: Math.min(p.actual, p.total),
      total: p.total,
      fraccion: Math.min(1, p.actual / Math.max(1, p.total)),
    };
  } catch {
    return null;
  }
}

/**
 * Listado para la interfaz, con las ocultas veladas.
 *
 * @param {string[]} conseguidas
 * @param {Object} stats
 * @param {Object} estado
 * @returns {Array<Object>}
 */
export function listado(conseguidas, stats, estado) {
  const logradas = new Set(conseguidas);

  return Object.values(HAZANAS)
    .filter((h) => (!h.oculta && !h.retirada) || logradas.has(h.refId))
    .map((h) => ({
      refId: h.refId,
      nombre: h.nombre,
      descripcion: h.descripcion,
      texto: h.texto,
      clase: h.clase,
      icono: h.icono,
      conseguida: logradas.has(h.refId),
      progreso: logradas.has(h.refId) ? null : progresoDe(h.refId, stats, estado),
    }))
    .sort((a, b) => {
      // Las conseguidas al final; entre iguales, por peso.
      if (a.conseguida !== b.conseguida) return a.conseguida ? 1 : -1;
      return (HAZANAS[b.refId]?.peso ?? 0) - (HAZANAS[a.refId]?.peso ?? 0);
    });
}

/**
 * Cuántas hay en total, contando las ocultas.
 * @returns {{total: number, visibles: number, ocultas: number}}
 */
export function conteo() {
  const todas = Object.values(HAZANAS).filter((h) => !h.retirada);
  const ocultas = todas.filter((h) => h.oculta);

  return {
    total: todas.length,
    visibles: todas.length - ocultas.length,
    ocultas: ocultas.length,
  };
}

export default HAZANAS;
