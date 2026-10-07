/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCANVEIL · player/Legado.js
 * ---------------------------------------------------------------------------
 * Lo que un personaje muerto deja al siguiente.
 *
 * Decisión de Alejandro (7-oct-2026), CERRADA:
 *   · moneda: la EXPERIENCIA ACUMULADA del muerto (`player.xp`), nunca puntos
 *     de habilidad, talento o atributo;
 *   · fracción: 35 %, redondeada HACIA ABAJO;
 *   · una entrega por muerto, a un solo sucesor, al confirmar su creación;
 *   · el sucesor progresa por las reglas normales de SU clase: la experiencia
 *     entra por el canal de siempre (`player/xp`), que recalcula nivel, vida,
 *     maná y recompensas. No se copia nada más del muerto.
 *
 * «Acumulada» es el saldo guardado del muerto, incluida la experiencia que él
 * mismo heredó: B heredó 350, ganó 650 y muere con 1000 → C recibe 350
 * (35 % de 1000). No se resta lo heredado ni se suma dos veces; se apunta por
 * separado (heredada / ganada) para poder auditarlo.
 *
 * Aquí solo hay funciones puras: la foto al morir, el cálculo y la lectura de
 * fotos antiguas. La entrega persistente (reserva, guardado del sucesor,
 * confirmación, recuperación) está en `persistence/EntregaLegado.js`.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** La fracción, como entero sobre 100: 0,35 no es exacto en coma flotante. */
export const LEGADO_NUMERADOR = 35;
export const LEGADO_DENOMINADOR = 100;
export const FRACCION_LEGADO = LEGADO_NUMERADOR / LEGADO_DENOMINADOR;

/** La única moneda. */
export const MODALIDAD = Object.freeze({ XP_ACUMULADA: 'xp_acumulada' });

/** La decisión, ya tomada. */
export const LEGADO_CONFIRMADO = Object.freeze({ modalidad: MODALIDAD.XP_ACUMULADA, redondeo: 'abajo' });

/**
 * Formato de la foto. 1 = el del 7-oct (preparada sin aplicar); 2 = con la
 * experiencia separada en heredada y ganada. Las de la 1 se leen igual.
 */
export const VERSION_LEGADO = 2;

/**
 * Tope de experiencia que se acepta como base: muy por encima de lo que da
 * el juego y lejos de donde `xp * 35` dejaría de ser un entero exacto. Una
 * cifra mayor no es una partida, es un dato roto.
 */
export const XP_MAXIMA_LEGADO = 1_000_000_000;

/** ¿Es una cantidad de experiencia válida? Entero finito, ≥ 0 y dentro del tope. */
export function xpValida(v) {
  return Number.isSafeInteger(v) && v >= 0 && v <= XP_MAXIMA_LEGADO;
}

/**
 * El 35 % redondeado hacia abajo, en enteros.
 *
 * `0.35` no es representable en coma flotante; aquí se multiplica por 35 y se
 * divide entre 100 quitando el resto, sin pasar por decimales.
 *
 * @param {number} xp
 * @returns {number|null} null si la base no es válida.
 */
export function cantidadLegado(xp) {
  if (!xpValida(xp)) return null;
  const n = xp * LEGADO_NUMERADOR;
  return (n - (n % LEGADO_DENOMINADOR)) / LEGADO_DENOMINADOR;
}

/**
 * La experiencia del jugador, separada en heredada y ganada.
 * Partidas anteriores al legado no tienen contador: todo es ganado.
 */
export function procedenciaXP(jugador = {}) {
  const total = jugador.xp ?? 0;
  const heredada = jugador.xpHeredada ?? jugador.legadoRecibido?.xp ?? 0;
  return { total, heredada, ganada: total - heredada };
}

/**
 * La foto del muerto: su experiencia acumulada, verificable, con la
 * procedencia aparte. Si la experiencia no es válida, la foto nace bloqueada
 * con su motivo y el valor original a la vista (no se inventa una cifra).
 *
 * @param {Object} estado Estado completo al morir.
 * @param {{runId?: string, ahora?: number}} [opciones]
 */
export function fotoDeLegado(estado, { runId = null, ahora = Date.now() } = {}) {
  const p = estado?.player ?? {};
  const { total, heredada, ganada } = procedenciaXP(p);
  const valida = xpValida(total) && xpValida(heredada) && heredada <= total;
  return {
    version: VERSION_LEGADO,
    runOrigen: runId ?? estado?.meta?.runId ?? null,
    origen: { nombre: p.nombre ?? null, raza: p.raza ?? null, clase: p.clase ?? null, nivel: Number.isSafeInteger(p.nivel) ? p.nivel : null },
    fraccion: `${LEGADO_NUMERADOR}/${LEGADO_DENOMINADOR}`,
    modalidad: MODALIDAD.XP_ACUMULADA,
    base: valida
      ? { xpAcumulada: total, xpHeredada: heredada, xpGanada: ganada }
      : { xpAcumulada: null, xpOriginal: Number.isFinite(total) ? total : String(total), xpHeredada: null, xpGanada: null },
    cantidad: valida ? cantidadLegado(total) : null,
    estado: valida ? 'pendiente' : 'bloqueado',
    motivo: valida ? null : 'La experiencia guardada al morir no es un número válido.',
    destinatario: null,
    creado: ahora,
  };
}

const ESTADOS = ['pendiente', 'reservado', 'aplicado', 'bloqueado'];

/**
 * Lee una foto guardada (de cualquier versión) y dice qué vale. No la
 * modifica: lo que se escriba al entregarla conserva todo lo original.
 *
 * @param {Object} foto
 */
export function leerFoto(foto) {
  const f = foto && typeof foto === 'object' ? foto : {};
  const b = f.base ?? {};
  const xp = b.xpAcumulada;
  // Versión 1: `xpHeredadaIncluida`; versión 2: `xpHeredada`.
  const heredada = b.xpHeredada ?? b.xpHeredadaIncluida ?? 0;
  const vista = {
    version: Number.isInteger(f.version) ? f.version : 1,
    runOrigen: typeof f.runOrigen === 'string' && f.runOrigen ? f.runOrigen : null,
    origen: f.origen && typeof f.origen === 'object' ? f.origen : {},
    estado: f.estado ?? 'pendiente',
    xpAcumulada: xpValida(xp) ? xp : null,
    xpHeredada: xpValida(heredada) ? heredada : null,
    xpGanada: null,
    cantidad: null,
    motivo: f.motivo ?? null,
    destinatario: f.destinatario ?? null,
    ranura: f.ranura ?? null,
    transaccion: f.transaccion ?? null,
  };
  if (!ESTADOS.includes(vista.estado)) {
    return { ...vista, estado: 'bloqueado', motivo: `Estado desconocido («${String(vista.estado)}»).` };
  }
  if (!vista.runOrigen) return { ...vista, estado: 'bloqueado', motivo: 'La herencia no dice de qué partida viene.' };
  if (vista.estado === 'aplicado') {
    // Lo entregado se queda entregado aunque la base no se pueda releer.
    return { ...vista, cantidad: Number.isSafeInteger(f.aplicado?.cantidad) ? f.aplicado.cantidad : cantidadLegado(xp) };
  }
  if (vista.estado === 'bloqueado') return vista;
  if (vista.xpAcumulada === null || vista.xpHeredada === null || vista.xpHeredada > vista.xpAcumulada) {
    return { ...vista, estado: 'bloqueado', motivo: 'La experiencia guardada de ese personaje no es un número válido: no se puede calcular su herencia.' };
  }
  return { ...vista, xpGanada: vista.xpAcumulada - vista.xpHeredada, cantidad: cantidadLegado(vista.xpAcumulada) };
}

/**
 * Cuánto se hereda de una foto. Pura.
 * @returns {{ok: true, cantidad: number, moneda: 'xp'}|{ok: false, motivo: string}}
 */
export function calcularLegado(foto) {
  const v = leerFoto(foto);
  if (v.cantidad === null) return { ok: false, motivo: v.motivo ?? 'base no válida' };
  return { ok: true, cantidad: v.cantidad, moneda: 'xp' };
}

/** El texto del cálculo, igual en todas las pantallas. */
export function explicarLegado(v) {
  return `${v.cantidad} XP: el 35 % de ${v.xpAcumulada} XP, redondeado hacia abajo`;
}

export default {
  FRACCION_LEGADO, LEGADO_NUMERADOR, LEGADO_DENOMINADOR, MODALIDAD, LEGADO_CONFIRMADO, VERSION_LEGADO,
  XP_MAXIMA_LEGADO, xpValida, cantidadLegado, procedenciaXP, fotoDeLegado, leerFoto, calcularLegado, explicarLegado,
};
