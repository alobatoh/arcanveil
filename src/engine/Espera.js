/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCANVEIL · engine/Espera.js
 * ---------------------------------------------------------------------------
 * Esperar un rato concreto: cuánto, o hasta cuándo.
 *
 * «espero dos horas» se narraba «Esperas dos horas.» y el reloj avanzaba
 * diez minutos, un turno normal. «Me quedo quieta hasta que anochece», lo
 * mismo, y seguía siendo por la mañana. El texto afirmaba un intervalo que no
 * había pasado.
 *
 * Aquí solo se LEE la frase (funciones puras). Quien la ejecuta, pulso a
 * pulso y con interrupciones, es `TurnResolver._esperar`.
 *
 * Qué se distingue:
 *   · Espera simple («espero», «espero a ver qué hace»): un turno normal.
 *   · Duración: «dos horas», «2 horas», «30 minutos», «media hora», «una
 *     hora y media», «un cuarto de hora», «al menos dos horas».
 *   · Hasta un momento: una frontera de franja del reloj («hasta que
 *     anochezca» = la de «noche»; «hasta el amanecer» = la de «alba»), o
 *     una hora («hasta las nueve», «hasta las 21:30»).
 *   · Lo que no se puede medir o es ambiguo: una condición («hasta que se
 *     vaya el guardia», «a que llegue»), «un rato», «hasta mañana», cifras
 *     imposibles. Eso se aclara antes de fingir que ha pasado.
 *
 * Las fronteras son las de `MUNDO.tiempo.franjas`, las mismas con que el
 * reloj guarda la franja: lo que se narra coincide con lo guardado. Ojo:
 * `TimeSystem.horasDeLuz` calcula el anochecer con otra regla (19 h por un
 * factor de estación) y las dos no coinciden. Esa deuda sigue abierta; aquí
 * se usa la del reloj, que es la que ve el jugador.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { sinAcentos } from '../utils/text.js';
import { MUNDO } from '../config/balance.config.js';

/** Lo más que se espera de una vez en esta fase: un día. */
export const ESPERA_MAXIMA_MIN = 24 * 60;

/** Cada pulso del motor durante una espera: lo que dura un turno. */
export const PULSO_MIN = MUNDO.tiempo.minutosPorTurno;

// Las horas («21:30») y los decimales («1.5») se conservan antes de quitar
// la puntuación: si no, «21:30» se leía como las nueve en punto y «1.5
// horas» como cinco.
const llano = (t) => sinAcentos(String(t ?? '').toLowerCase())
  .replace(/(\d):(\d{2})/g, '$1h$2')
  .replace(/(\d)\.(\d)/g, '$1,$2')
  .replace(/[¿?¡!.;:«»"“”]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

/** El verbo de esperar, al principio de lo que hace. */
const VERBO = /^(?:y |luego |despues |entonces |ahora )?(?:espero|esperamos|aguardo|aguardamos|me pongo a esperar|me quedo (?:esperando|quiet[oa]s?|aqui|ahi|alli|sentad[oa]s?|de pie|en silencio|a cubierto|escondid[oa]s?|agazapad[oa]s?)|nos quedamos (?:esperando|quiet[oa]s|aqui|ahi|alli|en silencio)|dejo pasar(?: el tiempo)?|hago tiempo|paso el rato)(?=\s|$)(.*)$/;

/** «Mientras espero»: acompaña a otra cosa; es una espera simple. */
const MIENTRAS = /^mientras (?:espero|aguardo|tanto)\b/;

const NUMEROS = {
  un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9,
  diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17,
  dieciocho: 18, diecinueve: 19, veinte: 20, veintiuno: 21, veintidos: 22, veintitres: 23, veinticuatro: 24,
  veinticinco: 25, treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, cien: 100, mil: 1000,
};
const PALABRA_NUM = Object.keys(NUMEROS).sort((a, b) => b.length - a.length).join('|');
/** Una cantidad: cifra (también con signo o decimales, para rechazarlos bien) o palabra. */
const CANT = `(-?\\d+(?:[.,]\\d+)?|${PALABRA_NUM})`;

/** Lo que no se puede medir. */
const VAGO = /\b(?:un rato|un ratito|un tiempo|un poco|un momento largo|lo que haga falta|lo que sea|lo necesario|todo el tiempo|para siempre|eternamente|indefinidamente|infinit\w*)\b/;

/** Fronteras de franja que se pueden nombrar. */
const FRONTERAS = [
  { clave: 'noche', nombre: 'el anochecer', re: /\bhasta (?:que )?(?:anochezca|anochece|oscurezca|oscurece|se haga de noche|caiga la noche|llegue la noche|sea de noche|se ponga oscuro)\b|\bhasta (?:el )?anochecer\b|\bhasta (?:la )?noche\b/ },
  { clave: 'alba', nombre: 'el amanecer', re: /\bhasta (?:que )?(?:amanezca|amanece|salga el sol|sale el sol|clarea|clare|se haga de dia|despunte el dia)\b|\bhasta (?:el )?(?:amanecer|alba)\b/ },
  { clave: 'ocaso', nombre: 'el atardecer', re: /\bhasta (?:que )?(?:atardezca|atardece|se ponga el sol|se pone el sol)\b|\bhasta (?:el )?(?:atardecer|ocaso)\b/ },
  { clave: 'mediodia', nombre: 'el mediodía', re: /\bhasta (?:el )?mediodia\b/ },
  { clave: 'tarde', nombre: 'la tarde', re: /\bhasta (?:la )?tarde\b/ },
  { clave: 'manana', nombre: 'la mañana', re: /\bhasta (?:por )?la manana\b/ },
];

/** Hora de inicio de una franja del reloj. */
export function inicioDeFranja(clave) {
  return MUNDO.tiempo.franjas.find((f) => f.clave === clave)?.desde ?? null;
}

function cantidad(palabra) {
  if (palabra == null) return NaN;
  if (/^-?\d/.test(palabra)) return Number(palabra.replace(',', '.'));
  return NUMEROS[palabra] ?? NaN;
}

/**
 * Minutos de una duración dicha, o null si no la hay.
 * @param {string} t Texto llano.
 * @returns {number|null} Puede ser NaN, negativo o enorme: lo valida quien llama.
 */
export function leerDuracion(t) {
  return leerDuracionCompleta(t).minutos;
}

/** Palabras que acompañan a una duración sin cambiarla. */
const RELLENO = /\b(?:aqui|ahi|alli|en silencio|sentad[oa]s?|quiet[oa]s?|de pie|tranquil[oa]s?|tranquilamente|pacientemente|durante|unos|unas|al menos|como mucho|como|mas o menos|aproximadamente|exactamente|justo|por|y|e|a cubierto|escondid[oa]s?|agazapad[oa]s?|esperando|largos?|largas?|enteras?|enteros?|mas)\b/g;

/** Lo que huele a tiempo: si queda algo así sin entender, no se ejecuta nada. */
const HUELE_A_TIEMPO = /\d|\b(?:segundos?|seg|minutos?|min|horas?|h|dias?|jornadas?|semanas?|mes(?:es)?|anos?|siglos?|lunas?|infinit\w*|eternidad)\b/;

/**
 * La duración y lo que queda sin entender. «una hora y 90 segundos» no es
 * una hora: queda «90 segundos», y eso hay que aclararlo.
 * @param {string} t Texto llano.
 * @returns {{minutos: number|null, residuo: string}}
 */
export function leerDuracionCompleta(t) {
  let total = 0;
  let algo = false;
  let resto = ` ${t} `;

  // «una hora y media», «dos horas y media»
  resto = resto.replace(new RegExp(`\\b(?:al menos |unos |unas |como |durante |por )?${CANT} horas? y media\\b`, 'g'), (_m, n) => { total += cantidad(n) * 60 + 30; algo = true; return ' '; });
  // «hora y media»
  resto = resto.replace(/\bhora y media\b/g, () => { total += 90; algo = true; return ' '; });
  // «media hora», «tres cuartos de hora», «un cuarto de hora»
  resto = resto.replace(/\bmedia hora\b/g, () => { total += 30; algo = true; return ' '; });
  resto = resto.replace(/\btres cuartos de hora\b/g, () => { total += 45; algo = true; return ' '; });
  resto = resto.replace(/\b(?:un )?cuarto de hora\b/g, () => { total += 15; algo = true; return ' '; });
  // «dos horas», «2 horas», «1,5 horas»
  resto = resto.replace(new RegExp(`\\b${CANT} horas?\\b`, 'g'), (_m, n) => { total += cantidad(n) * 60; algo = true; return ' '; });
  // «treinta minutos», «30 min»
  resto = resto.replace(new RegExp(`\\b${CANT} (?:minutos?|min)\\b`, 'g'), (_m, n) => { total += cantidad(n); algo = true; return ' '; });
  // «una hora» sin cifra delante ya está cubierto por CANT (una = 1).
  const residuo = resto.replace(RELLENO, ' ').replace(/\s+/g, ' ').trim();
  return { minutos: algo ? total : null, residuo };
}

/**
 * Una hora dicha: «las nueve», «las 21:30», «las ocho y media de la tarde».
 * @returns {{hora: number, minuto: number, ambigua: boolean}|null}
 */
function leerHora(t) {
  const m = t.match(new RegExp(`\\bhasta (?:las?|eso de las?) ${CANT}(?:[:.h](\\d{2})| y (media|cuarto)| menos cuarto)?(?: de la (manana|tarde|noche|madrugada))?\\b`));
  if (!m) return null;
  let hora = cantidad(m[1]);
  // 0-23 en el reloj: «24:30» no se convierte en «00:30» por sorpresa.
  if (!Number.isInteger(hora) || hora < 0 || hora > 23) return { invalida: true };
  let minuto = m[2] ? Number(m[2]) : m[3] === 'media' ? 30 : m[3] === 'cuarto' ? 15 : 0;
  if (/menos cuarto/.test(m[0])) { hora -= 1; minuto = 45; }
  if (minuto > 59 || hora < 0) return { invalida: true };
  if (m[4] === 'noche' && hora === 12) hora = 0;
  else if (m[4] === 'tarde' || m[4] === 'noche') { if (hora < 12) hora += 12; }
  if (m[4] === 'madrugada' || m[4] === 'manana') { if (hora === 12) hora = 0; }
  return { hora, minuto, ambigua: !m[4] && !m[2] && hora >= 1 && hora <= 12 };
}

/**
 * ¿Es una espera, y de qué clase?
 *
 * @param {string} texto Lo que hace (un segmento ya separado, sin citas).
 * @returns {null
 *   | {clase: 'simple'}
 *   | {clase: 'duracion', minutos: number, dicho: string}
 *   | {clase: 'hasta', franja?: string, hora?: number, minuto?: number, ambigua?: boolean, dicho: string}
 *   | {clase: 'aclarar', motivo: string}}
 */
export function leerEspera(texto) {
  const t = llano(texto);
  if (!t) return null;
  if (MIENTRAS.test(t)) return { clase: 'simple' };
  const m = t.match(VERBO);
  if (!m) return null;
  const resto = m[1] ?? '';

  // Cuando lo que se espera es que pase algo: no se sabe cuánto tarda.
  if (/\ba que\b/.test(resto)) return { clase: 'aclarar', motivo: 'condicion' };

  if (/\bhasta\b/.test(resto)) {
    for (const f of FRONTERAS) if (f.re.test(resto)) return { clase: 'hasta', franja: f.clave, dicho: f.nombre };
    const h = leerHora(resto);
    if (h?.invalida) return { clase: 'aclarar', motivo: 'hora_invalida' };
    if (h) return { clase: 'hasta', hora: h.hora, minuto: h.minuto, ambigua: h.ambigua, dicho: 'hora' };
    if (/\bhasta manana\b/.test(resto)) return { clase: 'aclarar', motivo: 'ambigua' };
    return { clase: 'aclarar', motivo: 'condicion' };
  }

  // Una cifra negativa no es una duración: no se le quita el signo.
  if (/(?:^|\s)-\s?\d/.test(resto)) return { clase: 'aclarar', motivo: 'invalida' };
  // «1.500»: ¿mil quinientos o uno y medio? Sin una convención clara, se pregunta.
  if (/\d[.,]\d{3}(?!\d)/.test(resto)) return { clase: 'aclarar', motivo: 'formato' };
  if (VAGO.test(resto)) return { clase: 'aclarar', motivo: 'vaga' };
  const { minutos, residuo } = leerDuracionCompleta(resto);
  // Lo que suena a tiempo y no se ha entendido entero no se ejecuta a medias:
  // «90 segundos», «1e9 horas», «una hora y 90 segundos», «tres lunas».
  if (HUELE_A_TIEMPO.test(residuo)) {
    return { clase: 'aclarar', motivo: /\bseg(?:undos?)?\b/.test(residuo) ? 'segundos' : 'no_soportada' };
  }
  if (minutos !== null) return { clase: 'duracion', minutos, dicho: resto.trim() };
  return { clase: 'simple' };
}

/**
 * Minutos desde ahora hasta el destino, siempre hacia delante.
 *
 * @param {{franja?: string, hora?: number, minuto?: number, ambigua?: boolean}} destino
 * @param {{hora: number, minuto: number, franja: string}} ahora
 * @returns {{minutos: number}|{ya: string}|{invalida: true}}
 */
export function minutosHasta(destino, ahora) {
  const actual = ahora.hora * 60 + (ahora.minuto ?? 0);
  const adelante = (objetivo) => {
    const d = ((objetivo - actual) % 1440 + 1440) % 1440;
    return d;
  };

  if (destino.franja) {
    // Ya es esa franja (o, para la noche, la madrugada que la sigue): no hay
    // que esperar a que llegue; se dice.
    const yaEs = ahora.franja === destino.franja || (destino.franja === 'noche' && ahora.franja === 'madrugada');
    if (yaEs) return { ya: destino.franja };
    const inicio = inicioDeFranja(destino.franja);
    if (inicio == null) return { invalida: true };
    return { minutos: adelante(inicio * 60) };
  }

  if (!Number.isInteger(destino.hora)) return { invalida: true };
  const opciones = [destino.hora * 60 + destino.minuto];
  // «Hasta las nueve» sin decir de la mañana o de la noche: la próxima.
  if (destino.ambigua) opciones.push(((destino.hora + 12) % 24) * 60 + destino.minuto);
  const minutos = Math.min(...opciones.map(adelante).map((d) => (d === 0 ? 1440 : d)));
  return { minutos };
}

/** ¿Una duración que se puede ejecutar? */
export function duracionValida(minutos) {
  return Number.isFinite(minutos) && Number.isInteger(minutos) && minutos > 0 && minutos <= ESPERA_MAXIMA_MIN;
}

/** «2 horas y 10 minutos», «20 minutos», «una hora». */
export function decirDuracion(minutos) {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  const horas = h === 0 ? '' : h === 1 ? 'una hora' : `${h} horas`;
  const mins = m === 0 ? '' : m === 1 ? 'un minuto' : `${m} minutos`;
  if (horas && mins) return `${horas} y ${mins}`;
  return horas || mins || 'nada';
}

/** «Día 1, 07:20». */
export function decirReloj({ dia, hora, minuto }) {
  return `Día ${dia}, ${String(hora).padStart(2, '0')}:${String(minuto ?? 0).padStart(2, '0')}`;
}

export default { leerEspera, leerDuracion, minutosHasta, duracionValida, decirDuracion, decirReloj, inicioDeFranja, ESPERA_MAXIMA_MIN, PULSO_MIN };
