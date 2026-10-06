/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCANVEIL · player/Vitals.js
 * ---------------------------------------------------------------------------
 * Vida, maná y recursos de supervivencia.
 *
 * Convención que atraviesa todo el motor: TODAS las barras van de máximo
 * (bienestar) a cero (colapso). Hambre 100 significa saciado; hambre 0
 * significa inanición. Una sola regla de lectura para StatBar y para el
 * jugador.
 *
 * Las penalizaciones son acumulativas y se aplican a TODAS las tiradas: un
 * personaje hambriento, sediento y agotado puede arrastrar −9. Es deliberado.
 * La gestión de recursos debe importar, no ser un adorno.
 *
 * Funciones puras: reciben estado y devuelven parches. Nadie muta aquí.
 *
 * Dependencias: config/balance.config.js, Attributes, utils/math.js.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { VITALES, PROGRESION, MUNDO } from '../config/balance.config.js';
import { modificadorEfectivo } from './Attributes.js';
import { saturar, aplicarDelta, escalon, fraccion } from '../utils/math.js';

/* ═══════════════════════════════════════════════════════════════════════════
   METADATOS
   ═══════════════════════════════════════════════════════════════════════════ */

/** Definición de cada barra, para VitalsWidget. */
export const META_VITALES = Object.freeze({
  vida: { nombre: 'Vida', icono: 'vida', clave: 'vida', critico: true },
  mana: { nombre: 'Maná', icono: 'mana', clave: 'mana', critico: false },
  hambre: { nombre: 'Hambre', icono: 'bolsa', clave: 'hambre', critico: true },
  sed: { nombre: 'Sed', icono: 'pocion', clave: 'sed', critico: true },
  fatiga: { nombre: 'Vigor restante', icono: 'huir', clave: 'fatiga', critico: true },
  moral: { nombre: 'Moral', icono: 'escudo', clave: 'moral', critico: false },
});

/* ═══════════════════════════════════════════════════════════════════════════
   CÁLCULO DE MÁXIMOS
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Vida máxima según nivel, Vigor y dado de vida de la vocación.
 *
 * @param {Object} jugador
 * @param {number} dadoVida Dado de vida de la clase.
 * @returns {number}
 */
export function vidaMaxima(jugador, dadoVida = 8) {
  const nivel = jugador?.nivel ?? 1;
  const modVigor = modificadorEfectivo(jugador, 'vigor');

  // Nivel 1 recibe el dado completo; los siguientes, la media del dado.
  const porNivel = Math.floor(dadoVida / 2) + 1;

  const total =
    VITALES.vida.base +
    dadoVida +
    (nivel - 1) * (porNivel + VITALES.vida.porVigor * Math.max(0, modVigor)) +
    modVigor * VITALES.vida.porVigor;

  return Math.max(1, Math.floor(total));
}

/**
 * Maná máximo según nivel, Intelecto y vocación.
 * @param {Object} jugador
 * @param {number} manaBase Maná inicial de la clase.
 * @returns {number}
 */
export function manaMaximo(jugador, manaBase = 0) {
  const nivel = jugador?.nivel ?? 1;
  const modInt = modificadorEfectivo(jugador, 'intelecto');

  const total =
    VITALES.mana.base +
    manaBase +
    (nivel - 1) * VITALES.mana.porNivel +
    modInt * VITALES.mana.porIntelecto;

  return Math.max(0, Math.floor(total));
}

/* ═══════════════════════════════════════════════════════════════════════════
   PENALIZACIONES
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Penalización de un recurso de supervivencia según su nivel actual.
 *
 * @param {number} valor 0-100
 * @returns {{etiqueta: string, modificador: number}}
 */
export function estadoRecurso(valor) {
  const fila = escalon(VITALES.supervivencia.umbrales, valor);
  return { etiqueta: fila.etiqueta, modificador: fila.modificador };
}

/**
 * Estado de moral y su efecto en tiradas sociales y de temple.
 * @param {number} valor
 * @returns {{etiqueta: string, modificador: number}}
 */
export function estadoMoral(valor) {
  const fila = escalon(VITALES.moral.umbrales, valor);
  return { etiqueta: fila.etiqueta, modificador: fila.modificador };
}

/**
 * Penalización total acumulada por hambre, sed y fatiga.
 *
 * Es la que RulesEngine añade a cada tirada. Se devuelve desglosada para que
 * el jugador vea de dónde sale el número, no solo el resultado.
 *
 * @param {Object} jugador
 * @returns {{total: number, desglose: Array<{fuente: string, valor: number}>}}
 */
export function penalizacionSupervivencia(jugador) {
  const desglose = [];
  let total = 0;

  const fuentes = [
    { clave: 'hambre', nombre: 'Hambre' },
    { clave: 'sed', nombre: 'Sed' },
    { clave: 'fatiga', nombre: 'Agotamiento' },
  ];

  for (const f of fuentes) {
    const estado = estadoRecurso(jugador?.[f.clave] ?? VITALES.supervivencia.max);
    if (estado.modificador !== 0) {
      desglose.push({ fuente: `${f.nombre} (${estado.etiqueta})`, valor: estado.modificador });
      total += estado.modificador;
    }
  }

  return { total, desglose };
}

/**
 * Penalización de moral, aplicable solo a tiradas sociales y de temple.
 * @param {Object} jugador
 * @returns {{total: number, desglose: Array<{fuente: string, valor: number}>}}
 */
export function penalizacionMoral(jugador) {
  const estado = estadoMoral(jugador?.moral ?? VITALES.moral.inicial);
  if (estado.modificador === 0) return { total: 0, desglose: [] };
  return {
    total: estado.modificador,
    desglose: [{ fuente: `Moral (${estado.etiqueta})`, valor: estado.modificador }],
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   MODIFICACIÓN DE RECURSOS
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Aplica daño o curación a la vida.
 *
 * Devuelve también `desperdiciado`, y eso importa: si curas 40 a alguien al
 * que le faltan 10, la narración debería decir «te sientes pleno», no
 * «recuperas 40». El director recibe ese dato.
 *
 * @param {Object} jugador
 * @param {number} delta Negativo para daño.
 * @returns {{parche: Object, aplicado: number, desperdiciado: number, caido: boolean, nuevo: number}}
 */
export function modificarVida(jugador, delta) {
  const actual = jugador?.vida?.actual ?? 0;
  const max = jugador?.vida?.max ?? 1;

  const r = aplicarDelta(actual, delta, 0, max);

  return {
    parche: { player: { vida: { actual: r.valor } } },
    aplicado: r.aplicado,
    desperdiciado: r.desperdiciado,
    caido: r.valor <= 0,
    nuevo: r.valor,
  };
}

/**
 * Aplica un cambio al maná.
 * @param {Object} jugador
 * @param {number} delta
 * @returns {{parche: Object, aplicado: number, suficiente: boolean, nuevo: number}}
 */
export function modificarMana(jugador, delta) {
  const actual = jugador?.mana?.actual ?? 0;
  const max = jugador?.mana?.max ?? 0;

  // Un gasto que no se puede pagar no se aplica a medias: se rechaza entero.
  if (delta < 0 && actual + delta < 0) {
    return { parche: null, aplicado: 0, suficiente: false, nuevo: actual };
  }

  const r = aplicarDelta(actual, delta, 0, max);
  return {
    parche: { player: { mana: { actual: r.valor } } },
    aplicado: r.aplicado,
    suficiente: true,
    nuevo: r.valor,
  };
}

/**
 * Modifica un recurso de supervivencia o la moral.
 *
 * @param {Object} jugador
 * @param {'hambre'|'sed'|'fatiga'|'moral'} clave
 * @param {number} delta
 * @returns {{parche: Object, aplicado: number, nuevo: number, cruzoUmbral: string|null}}
 */
export function modificarRecurso(jugador, clave, delta) {
  const max = clave === 'moral' ? VITALES.moral.max : VITALES.supervivencia.max;
  const actual = jugador?.[clave] ?? max;

  const r = aplicarDelta(actual, delta, 0, max);

  // Se detecta el cruce de umbral para poder avisar al jugador solo cuando
  // cambia su situación, no en cada punto perdido.
  const antes = clave === 'moral' ? estadoMoral(actual) : estadoRecurso(actual);
  const despues = clave === 'moral' ? estadoMoral(r.valor) : estadoRecurso(r.valor);
  const cruzoUmbral = antes.etiqueta !== despues.etiqueta ? despues.etiqueta : null;

  return {
    parche: { player: { [clave]: r.valor } },
    aplicado: r.aplicado,
    nuevo: r.valor,
    cruzoUmbral,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   DESGASTE POR TURNO
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Calcula el desgaste de un turno: hambre, sed, fatiga y el daño por colapso.
 *
 * Lo invoca el gancho `alTurno` del sistema de jugador. Devuelve un parche
 * único con todos los cambios, para que el Store notifique una sola vez.
 *
 * @param {Object} jugador
 * @param {Object} [opciones]
 * @param {string} [opciones.tipo='exploracion'] Tipo de turno.
 * @param {number} [opciones.multiplicadorSed=1] Efecto del clima.
 * @param {boolean} [opciones.inmuneHambre=false] Rasgo del linaje Crisol.
 * @param {number} [opciones.minutos] Minutos del pulso. Solo cuenta en
 *   `tipo: 'espera'`: el desgaste va en proporción a los minutos de un turno
 *   (el último pulso de una espera puede ser de 5 minutos y no vale como 10).
 * @returns {{parche: Object, avisos: string[], dano: number}}
 */
export function desgasteTurno(jugador, opciones = {}) {
  const { tipo = 'exploracion', multiplicadorSed = 1, inmuneHambre = false, minutos } = opciones;
  const s = VITALES.supervivencia;

  const parche = { player: {} };
  const avisos = [];
  let dano = 0;

  // — Consumo según el tipo de turno —
  let hambre = s.hambrePorTurno;
  let sed = s.sedPorTurno * multiplicadorSed;
  let fatiga = s.fatigaPorTurno;

  if (tipo === 'combate') {
    fatiga = s.fatigaPorRondaCombate;
    hambre *= 0.3;
    sed *= 0.5;
  } else if (tipo === 'viaje') {
    hambre = s.hambrePorViaje;
    sed = s.sedPorViaje * multiplicadorSed;
    fatiga = s.fatigaPorViaje;
  } else if (tipo === 'descanso') {
    // Descansar no consume fatiga: la recupera. Eso lo gestiona descansar().
    fatiga = 0;
  } else if (tipo === 'espera') {
    // Esperar desgasta como explorar, en proporción a los minutos del pulso.
    // Un pulso parcial de 5 minutos es medio turno: ni castiga ni cuenta como
    // uno entero. El daño por privación sigue siendo por pulso (no se reparte).
    const turno = MUNDO.tiempo.minutosPorTurno;
    const escala = Math.max(0, Math.min(1, (Number(minutos) || turno) / turno));
    hambre *= escala;
    sed *= escala;
    fatiga *= escala;
  }

  const aplicar = (clave, consumo) => {
    if (consumo <= 0) return;
    const r = modificarRecurso(jugador, clave, -consumo);
    parche.player[clave] = r.nuevo;
    if (r.cruzoUmbral && r.cruzoUmbral !== 'bien') {
      avisos.push(`${META_VITALES[clave].nombre}: ${r.cruzoUmbral}`);
    }
    // A cero, el recurso empieza a costar vida.
    if (r.nuevo <= 0) {
      const castigos = { hambre: s.danoPorInanicion, sed: s.danoPorDeshidratacion, fatiga: s.danoPorAgotamiento };
      dano += castigos[clave] ?? 0;
    }
  };

  if (!inmuneHambre) {
    aplicar('hambre', hambre);
    aplicar('sed', sed);
  }
  aplicar('fatiga', fatiga);

  // — Regeneración pasiva fuera de combate —
  // Esperar no es descansar: ni cura ni devuelve maná (eso es `descansar`).
  if (tipo !== 'combate' && tipo !== 'espera') {
    const vidaMax = jugador?.vida?.max ?? 1;
    const manaMax = jugador?.mana?.max ?? 0;

    const regenVida = Math.floor(vidaMax * VITALES.vida.regenPorTurno);
    const regenMana = Math.floor(manaMax * VITALES.mana.regenPorTurno);

    if (regenVida > 0 && (jugador?.vida?.actual ?? 0) < vidaMax) {
      parche.player.vida = { actual: saturar((jugador.vida.actual ?? 0) + regenVida, 0, vidaMax) };
    }
    if (regenMana > 0 && (jugador?.mana?.actual ?? 0) < manaMax) {
      parche.player.mana = { actual: saturar((jugador.mana.actual ?? 0) + regenMana, 0, manaMax) };
    }
  }

  // — Daño por colapso, aplicado sobre lo ya calculado —
  if (dano > 0) {
    const vidaActual = parche.player.vida?.actual ?? jugador?.vida?.actual ?? 0;
    parche.player.vida = { actual: saturar(vidaActual - dano, 0, jugador?.vida?.max ?? 1) };
    avisos.push(`Sufres ${dano} de daño por privación`);
  }

  return { parche, avisos, dano };
}

/* ═══════════════════════════════════════════════════════════════════════════
   DESCANSO
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Aplica un descanso.
 *
 * El descanso corto restaura parcialmente; el largo devuelve todo y limpia los
 * recursos de supervivencia solo si hay provisiones. Sin comida ni agua, dormir
 * no arregla el hambre — y eso es intencionado.
 *
 * @param {Object} jugador
 * @param {'corto'|'largo'} tipo
 * @param {Object} [opciones]
 * @param {boolean} [opciones.conProvisiones=false]
 * @param {boolean} [opciones.enPosada=false]
 * @returns {{parche: Object, recuperado: Object, avisos: string[]}}
 */
export function descansar(jugador, tipo = 'corto', opciones = {}) {
  const { conProvisiones = false, enPosada = false } = opciones;

  const vidaMax = jugador?.vida?.max ?? 1;
  const manaMax = jugador?.mana?.max ?? 0;

  const fraccionVida = tipo === 'largo' ? VITALES.vida.descansoLargo : VITALES.vida.descansoCorto;
  const fraccionMana = tipo === 'largo' ? VITALES.mana.descansoLargo : VITALES.mana.descansoCorto;

  const vidaNueva = saturar(
    (jugador?.vida?.actual ?? 0) + Math.ceil(vidaMax * fraccionVida), 0, vidaMax,
  );
  const manaNuevo = saturar(
    (jugador?.mana?.actual ?? 0) + Math.ceil(manaMax * fraccionMana), 0, manaMax,
  );

  const parche = { player: { vida: { actual: vidaNueva }, mana: { actual: manaNuevo } } };
  const avisos = [];

  // La fatiga se recupera siempre al descansar.
  const fatigaGanada = tipo === 'largo' ? VITALES.supervivencia.max : 35;
  parche.player.fatiga = saturar((jugador?.fatiga ?? 0) + fatigaGanada, 0, VITALES.supervivencia.max);

  // Hambre y sed solo se recuperan si hay con qué.
  if (conProvisiones) {
    parche.player.hambre = VITALES.supervivencia.max;
    parche.player.sed = VITALES.supervivencia.max;
  } else if (tipo === 'largo') {
    avisos.push('Has descansado, pero sin provisiones el hambre sigue ahí');
  }

  // Una cama de verdad levanta el ánimo.
  if (enPosada) {
    const r = modificarRecurso(jugador, 'moral', VITALES.moral.porDescansoEnPosada);
    parche.player.moral = r.nuevo;
    avisos.push('Una cama de verdad. Te sienta bien');
  }

  return {
    parche,
    recuperado: {
      vida: vidaNueva - (jugador?.vida?.actual ?? 0),
      mana: manaNuevo - (jugador?.mana?.actual ?? 0),
    },
    avisos,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   CONSULTAS
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Estado general del personaje, para la interfaz y para el prompt del director.
 * @param {Object} jugador
 * @returns {Object}
 */
export function resumenVitales(jugador) {
  const salida = {};

  salida.vida = {
    actual: jugador?.vida?.actual ?? 0,
    max: jugador?.vida?.max ?? 1,
    fraccion: fraccion(jugador?.vida?.actual ?? 0, jugador?.vida?.max ?? 1),
    critico: fraccion(jugador?.vida?.actual ?? 0, jugador?.vida?.max ?? 1) <= VITALES.vida.umbralCritico,
  };

  salida.mana = {
    actual: jugador?.mana?.actual ?? 0,
    max: jugador?.mana?.max ?? 0,
    fraccion: fraccion(jugador?.mana?.actual ?? 0, jugador?.mana?.max ?? 1),
  };

  for (const clave of ['hambre', 'sed', 'fatiga']) {
    const valor = jugador?.[clave] ?? VITALES.supervivencia.max;
    salida[clave] = { valor, max: VITALES.supervivencia.max, ...estadoRecurso(valor) };
  }

  const moral = jugador?.moral ?? VITALES.moral.inicial;
  salida.moral = { valor: moral, max: VITALES.moral.max, ...estadoMoral(moral) };

  return salida;
}

/**
 * Descripción del estado físico en lenguaje natural, para el director.
 *
 * @param {Object} jugador
 * @returns {string}
 */
export function describirEstado(jugador) {
  const partes = [];

  const f = fraccion(jugador?.vida?.actual ?? 0, jugador?.vida?.max ?? 1);
  if (f <= 0.15) partes.push('malherido, a punto de caer');
  else if (f <= 0.35) partes.push('gravemente herido');
  else if (f <= 0.6) partes.push('herido');
  else if (f < 1) partes.push('con algún rasguño');
  else partes.push('ileso');

  for (const [clave, adjetivo] of [['hambre', 'hambriento'], ['sed', 'sediento'], ['fatiga', 'agotado']]) {
    const estado = estadoRecurso(jugador?.[clave] ?? 100);
    if (estado.etiqueta === 'grave') partes.push(adjetivo);
    else if (estado.etiqueta === 'critico') partes.push(`${adjetivo} hasta el límite`);
  }

  const moral = estadoMoral(jugador?.moral ?? 65);
  if (moral.etiqueta === 'quebrado') partes.push('con el ánimo por los suelos');
  else if (moral.etiqueta === 'exaltado') partes.push('exultante');

  return partes.join(', ');
}

/** @param {Object} jugador @returns {boolean} */
export function estaCaido(jugador) {
  return (jugador?.vida?.actual ?? 0) <= 0;
}

export default {
  META_VITALES,
  vidaMaxima,
  manaMaximo,
  estadoRecurso,
  estadoMoral,
  penalizacionSupervivencia,
  penalizacionMoral,
  modificarVida,
  modificarMana,
  modificarRecurso,
  desgasteTurno,
  descansar,
  resumenVitales,
  describirEstado,
  estaCaido,
};
