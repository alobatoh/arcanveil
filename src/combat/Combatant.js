/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCANVEIL · combat/Combatant.js
 * ---------------------------------------------------------------------------
 * Modelo unificado de participante en combate.
 *
 * Jugador y enemigos comparten forma. Es lo que permite que `AttackResolver`
 * no tenga que preguntar quién ataca a quién: resuelve entre combatientes, sin
 * más.
 *
 * El combatiente del jugador es una PROYECCIÓN del estado real, no una copia
 * independiente. Sus estadísticas se leen del personaje en el momento de
 * crearlo, y la vida se sincroniza en ambas direcciones: recibir daño en
 * combate baja la vida de verdad.
 *
 * Funciones puras.
 *
 * Dependencias: enemies.data, statuses.data, Attributes, balance.config.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { obtenerEnemigo } from '../data/enemies.data.js';
import { obtenerEstado } from '../data/statuses.data.js';
import { modificadorEfectivo } from '../player/Attributes.js';
import { COMBATE } from '../config/balance.config.js';
import { idEntidad, TIPO } from '../utils/id.js';
import { saturar, fraccion as fraccionar } from '../utils/math.js';

/** Bandos posibles. */
export const BANDO = Object.freeze({
  ALIADO: 'aliado',
  ENEMIGO: 'enemigo',
  NEUTRAL: 'neutral',
});

/**
 * @typedef {Object} Combatiente
 * @property {string} id
 * @property {string} refId Plantilla de origen, o 'jugador'.
 * @property {string} nombre
 * @property {string} bando
 * @property {boolean} esJugador
 * @property {{actual: number, max: number}} vida
 * @property {number} defensa
 * @property {number} reduccionDano
 * @property {number} esquiva Fracción 0-1.
 * @property {Record<string, number>} atributos
 * @property {Array<Object>} ataques
 * @property {Array<Object>} estados
 * @property {string} tactica
 * @property {number} iniciativa
 * @property {boolean} vivo
 * @property {Object} recargas Contador de rondas por ataque con recarga.
 */

/* ═══════════════════════════════════════════════════════════════════════════
   CREACIÓN
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Crea el combatiente del jugador a partir de su estado real.
 *
 * @param {Object} jugador Rama `player` del estado.
 * @param {Object} bonificadores Salida de Equipment.bonificadores().
 * @returns {Combatiente}
 */
export function desdeJugador(jugador, bonificadores = {}) {
  const modDestreza = modificadorEfectivo(jugador, 'destreza');

  // La esquiva base sale de la Destreza y se acota al techo del sistema.
  const esquiva = saturar(
    COMBATE.esquivaBase
      + modDestreza * COMBATE.esquivaPorDestreza
      + (bonificadores.esquivaExtra ?? 0),
    0,
    COMBATE.esquivaMax,
  );

  return {
    id: 'jugador',
    refId: 'jugador',
    nombre: jugador.nombre || 'Tú',
    // Sin esto el parte trataba a todo jugador en masculino: «Brunhilda queda
    // envenenado».
    genero: jugador.genero ?? 'm',
    bando: BANDO.ALIADO,
    esJugador: true,

    vida: { actual: jugador.vida?.actual ?? 1, max: jugador.vida?.max ?? 1 },
    mana: { actual: jugador.mana?.actual ?? 0, max: jugador.mana?.max ?? 0 },

    defensa: COMBATE.defensaBase + (bonificadores.defensa ?? 0),
    reduccionDano: bonificadores.reduccion ?? 0,
    esquiva,

    atributos: { ...jugador.atributos },
    nivel: jugador.nivel ?? 1,

    // El arma equipada se convierte en el ataque disponible.
    ataques: _ataquesDelJugador(bonificadores),

    // Los estados del jugador se arrastran al combate: envenenarse antes de
    // pelear tiene consecuencias en la pelea.
    estados: [...(jugador.estados ?? [])],

    tactica: 'jugador',
    iniciativa: 0,
    vivo: (jugador.vida?.actual ?? 1) > 0,
    recargas: {},

    resistencias: [],
    inmunidades: [],
    vulnerabilidades: [],
  };
}

/**
 * Un compañero del grupo, en el bando del jugador.
 *
 * Lo mueve la misma IA que a los enemigos: elige objetivo entre los del otro
 * bando, así que pelea contra ellos sin reglas nuevas. La vida es la que trae
 * del viaje, no la máxima: si llegó herido, pelea herido.
 *
 * @param {Object} ficha De `npc/Companero.fichaDeCompanero`.
 * @param {{vida: {actual: number, max: number}}} [miembro] Lo que guarda el grupo.
 * @returns {Object}
 */
export function desdeCompanero(ficha, miembro = {}) {
  const max = miembro.vida?.max ?? ficha.vidaMax;
  const actual = Math.max(1, Math.min(miembro.vida?.actual ?? max, max));

  return {
    id: `companero_${ficha.refId}`,
    refId: ficha.refId,
    nombre: ficha.nombre,
    genero: ficha.genero,
    bando: BANDO.ALIADO,
    esJugador: false,
    esCompanero: true,

    vida: { actual, max },
    mana: { actual: 0, max: 0 },

    defensa: ficha.defensa,
    reduccionDano: 0,
    esquiva: 0.05,

    atributos: { vigor: 12, destreza: 12, temple: 11, intelecto: 10, astucia: 11, carisma: 10 },
    nivel: 1,
    ataques: [{ ...ficha.ataque }],
    estados: [],

    // Mantiene la posición y usa la cabeza: un compañero no se tira a lo loco.
    tactica: 'disciplinado',
    iniciativa: 0,
    vivo: true,
    recargas: {},

    resistencias: [],
    inmunidades: [],
    vulnerabilidades: [],
    // No huye: si cae, cae herido (ver CombatManager).
    huye: false,
  };
}

/**
 * Construye los ataques disponibles del jugador desde su equipo.
 *
 * @param {Object} bonificadores
 * @returns {Array<Object>}
 * @private
 */
function _ataquesDelJugador(bonificadores) {
  const arma = bonificadores.armaPrincipal;

  if (!arma) {
    // Sin arma se pelea igual, solo que peor.
    return [{
      nombre: 'Golpe',
      dano: '1d3',
      tipo: 'contundente',
      bonoAtaque: 0,
      bonoDano: 0,
      alcance: 'cuerpo',
    }];
  }

  const stats = arma.stats ?? {};

  return [{
    nombre: arma.objeto?.nombre ?? 'Arma',
    dano: stats.dano?.notacion ?? '1d6',
    tipo: stats.dano?.tipo ?? 'contundente',
    bonoAtaque: stats.bonoAtaque ?? 0,
    bonoDano: stats.bonoDano ?? 0,
    alcance: (stats.propiedades ?? []).includes('distancia') ? 'distancia' : 'cuerpo',
    umbralCritico: stats.umbralCritico ?? 20,
    danoElemental: stats.danoElemental ?? null,
    robarVida: stats.robarVida ?? 0,
    estadosAlImpactar: stats.estadosAlImpactar ?? [],
    municion: stats.municion ?? null,
  }];
}

/**
 * Crea un combatiente enemigo desde una plantilla del bestiario.
 *
 * @param {string} refId
 * @param {Object} [opciones]
 * @param {number} [opciones.nivel] Escala las estadísticas si difiere del base.
 * @param {string} [opciones.sufijo] Para distinguir varios iguales: 'A', 'B'…
 * @param {import('../core/RNG.js').Flujo} [opciones.flujo] Para variación de vida.
 * @returns {Combatiente|null}
 */
export function desdeEnemigo(refId, opciones = {}) {
  const plantilla = obtenerEnemigo(refId);
  if (!plantilla) return null;

  const nivel = opciones.nivel ?? plantilla.nivel;

  // El escalado por nivel es suave: un lobo de nivel 5 sigue siendo un lobo.
  const factor = 1 + (nivel - plantilla.nivel) * 0.15;

  // Variación de vida: dos lobos no tienen exactamente los mismos puntos.
  const variacion = opciones.flujo ? opciones.flujo.flotante(0.9, 1.1) : 1;

  const vidaMax = Math.max(1, Math.round(plantilla.vida * factor * variacion));

  const modDestreza = Math.floor(((plantilla.atributos?.destreza ?? 10) - 10) / 2);
  const esquiva = saturar(modDestreza * COMBATE.esquivaPorDestreza, 0, COMBATE.esquivaMax);

  // Una persona concreta de la escena (Korsa, Xivio) pelea con las cifras de
  // una plantilla pero sigue siendo ella: su nombre en el texto y en la
  // ficha, y su referencia de PNJ para las consecuencias. Antes salía
  // «Guardia corrupto» aunque se hubiera atacado a Xivio.
  const nombrePropio = opciones.nombre ? String(opciones.nombre) : null;
  return {
    id: idEntidad(TIPO.COMBATIENTE),
    refId,
    npc: opciones.npc ?? null,
    nombre: nombrePropio ?? (opciones.sufijo ? `${plantilla.nombre} ${opciones.sufijo}` : plantilla.nombre),
    nombreBase: nombrePropio ?? plantilla.nombre,
    genero: plantilla.genero ?? 'm',
    plural: plantilla.plural,
    bando: BANDO.ENEMIGO,
    esJugador: false,

    vida: { actual: vidaMax, max: vidaMax },

    defensa: Math.round(plantilla.defensa + (nivel - plantilla.nivel) * 0.5),
    reduccionDano: plantilla.reduccionDano ?? 0,
    esquiva,

    atributos: { ...plantilla.atributos },
    nivel,
    tipo: plantilla.tipo,
    tamano: plantilla.tamano,
    amenaza: plantilla.amenaza,
    faccion: plantilla.faccion ?? null,

    ataques: (plantilla.ataques ?? []).map((a) => ({
      ...a,
      bonoAtaque: Math.round((a.bonoAtaque ?? 0) * factor),
    })),

    estados: [],
    tactica: plantilla.tactica ?? 'agresivo',
    iniciativa: 0,
    vivo: true,
    recargas: {},

    resistencias: plantilla.resistencias ?? [],
    inmunidades: plantilla.inmunidades ?? [],
    vulnerabilidades: plantilla.vulnerabilidades ?? [],

    // Comportamiento
    huye: plantilla.huye ?? true,
    umbralHuida: plantilla.umbralHuida ?? COMBATE.umbralHuidaEnemigo,
    negociable: plantilla.negociable ?? false,
    sobornable: plantilla.sobornable ?? false,

    // Jefes
    fases: plantilla.fases ?? null,
    faseActual: 0,
    invoca: plantilla.invoca ?? null,
    legendarias: plantilla.legendarias ?? null,

    promptLore: plantilla.promptLore,
  };
}

/**
 * Crea un grupo de enemigos, con sufijos si hay repetidos.
 *
 * @param {Array<{refId: string, count?: number, level?: number}>} declaracion
 * @param {Object} [opciones]
 * @returns {Combatiente[]}
 */
export function crearGrupo(declaracion, opciones = {}) {
  const salida = [];
  const letras = 'ABCDEFGH';

  for (const entrada of declaracion ?? []) {
    const cantidad = Math.max(1, Math.min(entrada.count ?? 1, 8));

    for (let i = 0; i < cantidad; i++) {
      const sufijo = cantidad > 1 ? letras[i] : null;

      const combatiente = desdeEnemigo(entrada.refId, {
        nivel: entrada.level,
        sufijo,
        flujo: opciones.flujo,
        // Con nombre propio, una sola persona.
        nombre: cantidad === 1 ? entrada.nombre : null,
        npc: cantidad === 1 ? entrada.npc : null,
      });

      if (combatiente) salida.push(combatiente);
    }
  }

  return salida;
}

/* ═══════════════════════════════════════════════════════════════════════════
   ESTADÍSTICAS EFECTIVAS
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Modificadores acumulados de todos los estados activos.
 *
 * Punto único donde se suman: nadie más tiene que recorrer la lista de estados
 * para saber cuánto penaliza un combatiente.
 *
 * @param {Combatiente} c
 * @returns {Record<string, number|boolean>}
 */
export function modificadoresDeEstados(c) {
  const total = {};

  for (const activo of c.estados ?? []) {
    const estado = obtenerEstado(activo.refId);
    if (!estado?.modificadores) continue;

    const acumulaciones = activo.acumulaciones ?? 1;

    for (const [clave, valor] of Object.entries(estado.modificadores)) {
      if (typeof valor === 'boolean') {
        total[clave] = total[clave] || valor;
        continue;
      }

      // Los estados acumulables multiplican su efecto.
      const efectivo = estado.acumulable ? valor * acumulaciones : valor;
      total[clave] = (total[clave] ?? 0) + efectivo;
    }
  }

  return total;
}

/**
 * Defensa efectiva, con los estados aplicados.
 * @param {Combatiente} c
 * @returns {number}
 */
export function defensaEfectiva(c) {
  const mods = modificadoresDeEstados(c);
  return Math.max(1, c.defensa + (mods.defensa ?? 0));
}

/**
 * Esquiva efectiva.
 * @param {Combatiente} c
 * @returns {number}
 */
export function esquivaEfectiva(c) {
  const mods = modificadoresDeEstados(c);
  return saturar(c.esquiva + (mods.esquiva ?? 0), 0, COMBATE.esquivaMax);
}

/**
 * Reducción de daño efectiva.
 * @param {Combatiente} c
 * @returns {number}
 */
export function reduccionEfectiva(c) {
  const mods = modificadoresDeEstados(c);
  return Math.max(0, c.reduccionDano + (mods.reduccionDano ?? 0));
}

/**
 * Bonificador de ataque de los estados.
 * @param {Combatiente} c
 * @returns {number}
 */
export function bonoAtaqueEstados(c) {
  const mods = modificadoresDeEstados(c);
  return (mods.ataque ?? 0) + (mods.todasLasTiradas ?? 0);
}

/**
 * Bonificador de daño de los estados.
 * @param {Combatiente} c
 * @returns {number}
 */
export function bonoDanoEstados(c) {
  return modificadoresDeEstados(c).dano ?? 0;
}

/* ═══════════════════════════════════════════════════════════════════════════
   RESTRICCIONES
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Comprueba si un combatiente puede realizar una acción.
 *
 * @param {Combatiente} c
 * @param {string} accion 'atacar' | 'lanzar' | 'mover' | 'huir' | 'usar_objeto'
 * @returns {{puede: boolean, motivo: string|null}}
 */
export function puede(c, accion) {
  if (!c.vivo) return { puede: false, motivo: 'está fuera de combate' };

  for (const activo of c.estados ?? []) {
    const estado = obtenerEstado(activo.refId);
    if (estado?.impide?.includes(accion)) {
      return { puede: false, motivo: `está ${estado.nombre.toLowerCase()}` };
    }
  }

  return { puede: true, motivo: null };
}

/**
 * @param {Combatiente} c
 * @returns {boolean} true si pierde su turno por completo.
 */
export function pierdeElTurno(c) {
  return !puede(c, 'atacar').puede && !puede(c, 'mover').puede;
}

/* ═══════════════════════════════════════════════════════════════════════════
   ATAQUES Y RECARGAS
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Ataques disponibles ahora mismo, con las recargas ya comprobadas.
 *
 * @param {Combatiente} c
 * @param {number} ronda
 * @returns {Array<Object>}
 */
export function ataquesDisponibles(c, ronda) {
  return (c.ataques ?? []).filter((a) => {
    if (!a.recarga) return true;

    const ultimoUso = c.recargas?.[a.nombre];
    if (ultimoUso === undefined) return true;

    return ronda - ultimoUso >= a.recarga;
  });
}

/**
 * Marca un ataque como usado, para su recarga.
 *
 * @param {Combatiente} c
 * @param {string} nombreAtaque
 * @param {number} ronda
 * @returns {Combatiente}
 */
export function marcarUso(c, nombreAtaque, ronda) {
  return { ...c, recargas: { ...c.recargas, [nombreAtaque]: ronda } };
}

/* ═══════════════════════════════════════════════════════════════════════════
   VIDA Y ESTADO
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Aplica un cambio de vida.
 *
 * @param {Combatiente} c
 * @param {number} delta
 * @returns {{combatiente: Combatiente, aplicado: number, cayo: boolean}}
 */
export function modificarVida(c, delta) {
  const antes = c.vida.actual;
  const despues = saturar(antes + delta, 0, c.vida.max);

  const cayo = despues <= 0 && antes > 0;

  return {
    combatiente: {
      ...c,
      vida: { ...c.vida, actual: despues },
      vivo: despues > 0,
    },
    aplicado: despues - antes,
    cayo,
  };
}

/**
 * Fracción de vida restante.
 * @param {Combatiente} c
 * @returns {number}
 */
export function fraccionVida(c) {
  return fraccionar(c.vida.actual, c.vida.max);
}

/**
 * Determina si un enemigo debería huir.
 *
 * @param {Combatiente} c
 * @returns {boolean}
 */
export function deberiaHuir(c) {
  if (c.esJugador || !c.huye) return false;
  if (!puede(c, 'huir').puede) return false;

  // Un enemigo enfurecido no huye aunque esté al límite.
  const enfurecido = (c.estados ?? []).some((e) => e.refId === 'enfurecido');
  if (enfurecido) return false;

  return fraccionVida(c) <= (c.umbralHuida ?? COMBATE.umbralHuidaEnemigo);
}

/* ═══════════════════════════════════════════════════════════════════════════
   FASES DE JEFE
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Comprueba si un jefe debe cambiar de fase.
 *
 * @param {Combatiente} c
 * @returns {{cambia: boolean, fase: Object|null, indice: number}}
 */
export function revisarFase(c) {
  if (!c.fases?.length) return { cambia: false, fase: null, indice: c.faseActual ?? 0 };

  const f = fraccionVida(c);

  // Se busca la fase más avanzada cuyo umbral se haya cruzado.
  let indice = 0;
  for (let i = 0; i < c.fases.length; i++) {
    if (f <= c.fases[i].hasta) indice = i;
  }

  const cambia = indice > (c.faseActual ?? 0);

  return { cambia, fase: cambia ? c.fases[indice] : null, indice };
}

/**
 * Aplica el cambio de fase de un jefe.
 *
 * @param {Combatiente} c
 * @param {number} indice
 * @returns {Combatiente}
 */
export function aplicarFase(c, indice) {
  const fase = c.fases?.[indice];
  if (!fase) return c;

  const ataques = (c.ataques ?? []).map((a) => ({
    ...a,
    bonoAtaque: (a.bonoAtaque ?? 0) + (fase.bonoAtaque ?? 0),
    bonoDano: (a.bonoDano ?? 0) + (fase.bonoDano ?? 0),
  }));

  return { ...c, faseActual: indice, ataques };
}

/* ═══════════════════════════════════════════════════════════════════════════
   PRESENTACIÓN
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Estado del combatiente para la interfaz.
 * @param {Combatiente} c
 * @returns {Object}
 */
export function paraInterfaz(c) {
  const f = fraccionVida(c);

  return {
    id: c.id,
    // La plantilla de origen, no la instancia. La interfaz la necesita para
    // saber qué criatura dibujar: `id` es único por combate y no sirve.
    refId: c.refId,
    nombre: c.nombre,
    bando: c.bando,
    esJugador: c.esJugador,
    vida: c.vida,
    fraccionVida: f,
    vivo: c.vivo,
    nivel: c.nivel,
    estados: (c.estados ?? []).map((activo) => {
      const estado = obtenerEstado(activo.refId);
      return {
        refId: activo.refId,
        nombre: estado?.nombre ?? activo.refId,
        familia: estado?.familia ?? 'perjuicio',
        acumulaciones: activo.acumulaciones ?? 1,
        rondas: activo.rondas,
      };
    }),
    // Etiqueta cualitativa: en combate importa más «malherido» que «23/68».
    condicion: f > 0.75 ? 'entero'
      : f > 0.5 ? 'tocado'
      : f > 0.25 ? 'herido'
      : f > 0 ? 'malherido'
      : 'caído',
  };
}

/**
 * Descripción del combatiente para el director.
 * @param {Combatiente} c
 * @returns {string}
 */
export function paraDirector(c) {
  const partes = [c.nombre];

  const f = fraccionVida(c);
  if (!c.vivo) partes.push('(caído)');
  else if (f <= 0.25) partes.push('(malherido)');
  else if (f <= 0.5) partes.push('(herido)');

  const estados = (c.estados ?? [])
    .map((e) => obtenerEstado(e.refId)?.nombre)
    .filter(Boolean);

  if (estados.length) partes.push(`[${estados.join(', ')}]`);

  return partes.join(' ');
}

export default {
  BANDO,
  desdeJugador,
  desdeCompanero,
  desdeEnemigo,
  crearGrupo,
  modificadoresDeEstados,
  defensaEfectiva,
  esquivaEfectiva,
  reduccionEfectiva,
  bonoAtaqueEstados,
  bonoDanoEstados,
  puede,
  pierdeElTurno,
  ataquesDisponibles,
  marcarUso,
  modificarVida,
  fraccionVida,
  deberiaHuir,
  revisarFase,
  aplicarFase,
  paraInterfaz,
  paraDirector,
};
