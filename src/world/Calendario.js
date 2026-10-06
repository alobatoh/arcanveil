/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCANVEIL · world/Calendario.js
 * ---------------------------------------------------------------------------
 * Las reglas del tiempo, en un solo sitio y derivadas del reloj.
 *
 * Había dos: el reloj (`core/Clock.js`) con estaciones de 28 días
 * (`MUNDO.tiempo`: primavera, estio, otono, invierno) y franjas fijas (la
 * noche a las 21:00, el alba a las 05:00), y `TimeSystem` con años de 360
 * días, estaciones de 90, «verano» en vez de «estio» y un anochecer de
 * round(19 × factor). Las dos escribían `world.tiempo.estacion` y no
 * coincidían; el clima buscaba «verano», que el reloj nunca guarda.
 *
 * Decidido (6-oct-2026): manda el reloj. Todo lo que necesite estación,
 * franja, amanecer, anochecer u horas de luz lo saca de aquí, y aquí todo
 * sale de `MUNDO.tiempo`. No hay otra copia de las constantes.
 *
 * Tiempo absoluto: día y minuto (`diasTotales`, `hora`, `minuto`), no una
 * hora que da la vuelta.
 *
 * Funciones puras.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { MUNDO } from '../config/balance.config.js';

const T = MUNDO.tiempo;

/** Claves de estación, en orden: las del reloj. */
export const ESTACIONES_CLAVES = Object.freeze([...T.estaciones]);

/** Días de cada estación y de un año entero. */
export const DIAS_POR_ESTACION = T.diasPorEstacion;
export const DIAS_POR_ANO = T.diasPorEstacion * T.estaciones.length;

/** Cómo se dice cada estación (la clave no lleva tildes). */
const NOMBRES = Object.freeze({ primavera: 'primavera', estio: 'estío', otono: 'otoño', invierno: 'invierno' });

/** Estación de un día absoluto (0 = primer día de la partida). */
export function estacionDe(diasTotales) {
  const d = Math.max(0, Math.floor(Number(diasTotales) || 0));
  return ESTACIONES_CLAVES[Math.floor(d / DIAS_POR_ESTACION) % ESTACIONES_CLAVES.length];
}

/** Día dentro de la estación (0 el primero). */
export function diaDeEstacion(diasTotales) {
  const d = Math.max(0, Math.floor(Number(diasTotales) || 0));
  return d % DIAS_POR_ESTACION;
}

/** Nombre legible de una estación. */
export function nombreEstacion(clave) {
  return NOMBRES[clave] ?? String(clave ?? '');
}

/** Franja de una hora (0-23), con las fronteras del reloj. */
export function franjaDe(hora) {
  let resultado = T.franjas[0].clave;
  for (const f of T.franjas) if (hora >= f.desde) resultado = f.clave;
  return resultado;
}

/** Hora en que empieza una franja. */
export function inicioDeFranja(clave) {
  return T.franjas.find((f) => f.clave === clave)?.desde ?? null;
}

/** Amanecer y anochecer: las fronteras de «alba» y «noche» del reloj. */
export const AMANECER = inicioDeFranja('alba');
export const ANOCHECER = inicioDeFranja('noche');

/** Horas de luz que quedan a esa hora (0 de noche). */
export function horasDeLuz(hora) {
  return hora >= AMANECER && hora < ANOCHECER ? ANOCHECER - hora : 0;
}

/** ¿Es de noche a esa hora? (noche o madrugada, como siempre). */
export function esDeNoche(hora) {
  const f = franjaDe(hora);
  return f === 'noche' || f === 'madrugada';
}

/** Minuto absoluto de un instante (día y minuto, no una hora que da la vuelta). */
export function minutoAbsoluto({ diasTotales = 0, hora = 0, minuto = 0 } = {}) {
  return (Math.max(0, Number(diasTotales) || 0) * T.horasPorDia + (Number(hora) || 0)) * 60 + (Number(minuto) || 0);
}

/** Lo derivado de un instante, para recalcular guardados sin tocar el instante. */
export function derivado({ hora = 0, diasTotales = 0 } = {}) {
  return { franja: franjaDe(hora), estacion: estacionDe(diasTotales) };
}

export default { ESTACIONES_CLAVES, DIAS_POR_ESTACION, DIAS_POR_ANO, AMANECER, ANOCHECER, estacionDe, diaDeEstacion, nombreEstacion, franjaDe, inicioDeFranja, horasDeLuz, esDeNoche, minutoAbsoluto, derivado };
