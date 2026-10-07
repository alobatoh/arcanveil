/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCANVEIL · player/Legado.js
 * ---------------------------------------------------------------------------
 * Lo que un personaje muerto deja al siguiente. PREPARADO, NO APLICADO.
 *
 * Decisión de Alejandro (7-oct-2026): la muerte es definitiva y se empieza
 * una partida nueva; el siguiente personaje hereda el 35 % de la
 * experiencia O de los puntos de habilidad del muerto.
 *
 * CONFIRMADO: la fracción (0,35) y que la recibe el siguiente personaje.
 * PENDIENTE (no lo decide el código):
 *   · ¿Experiencia acumulada (`player.xp`) o puntos de habilidad?
 *   · Si son puntos: ¿solo los disponibles o también los gastados?
 *   · Redondeo de las fracciones.
 *   · Qué hacer con lo heredado de generaciones anteriores.
 *
 * Por eso aquí hay:
 *   · `fotoDeLegado`: la foto al morir, con las bases posibles por separado
 *     (no se suman estadísticas para inventar un total);
 *   · `calcularLegado`: función pura por modalidad, para probar;
 *   · `aplicarLegado`: DESACTIVADA mientras `LEGADO_CONFIRMADO` sea null.
 *     Cuando se confirme, aplica por el canal normal de progresión del NUEVO
 *     personaje (`player/xp` recalcula niveles y sus recompensas normales),
 *     una vez, a un sucesor, sin copiar nivel, objetos ni habilidades.
 *
 * Funciones puras.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** La fracción: constante del contrato, no un parámetro de balance. */
export const FRACCION_LEGADO = 0.35;

/** Las bases posibles. Ninguna está elegida. */
export const MODALIDAD = Object.freeze({
  XP_ACUMULADA: 'xp_acumulada',
  PUNTOS_DISPONIBLES: 'puntos_habilidad_disponibles',
  PUNTOS_TOTALES: 'puntos_habilidad_totales',
});

/**
 * La decisión que falta. `null` = la herencia se guarda pero no se aplica.
 * Cuando Alejandro decida: `{ modalidad: MODALIDAD.X, redondeo: 'abajo' }`.
 */
export const LEGADO_CONFIRMADO = null;

export const VERSION_LEGADO = 1;

const entero = (v) => (Number.isFinite(v) && v >= 0 ? Math.floor(v) : null);

/**
 * La foto del muerto. Guarda cada base por separado, verificable.
 *
 * @param {Object} estado Estado completo al morir.
 * @param {Object} [opciones]
 * @param {string} [opciones.runId]
 * @param {number} [opciones.ahora] Marca de tiempo (inyectable en pruebas).
 */
export function fotoDeLegado(estado, { runId = null, ahora = Date.now() } = {}) {
  const p = estado?.player ?? {};
  const heredado = entero(p.legadoRecibido?.xp) ?? 0;
  return {
    version: VERSION_LEGADO,
    runOrigen: runId ?? estado?.meta?.runId ?? null,
    origen: { nombre: p.nombre ?? null, raza: p.raza ?? null, clase: p.clase ?? null, nivel: entero(p.nivel) },
    fraccion: FRACCION_LEGADO,
    base: {
      // Experiencia acumulada, con lo que ya venía heredado aparte: no se
      // decide aquí si cuenta otra vez.
      xpAcumulada: entero(p.xp),
      xpHeredadaIncluida: heredado,
      puntosHabilidadDisponibles: entero(p.puntosHabilidad),
      // Los gastados no se pueden reconstruir con seguridad desde el estado
      // (no hay un contador): se guarda lo invertido para decidir después.
      habilidades: p.habilidades && typeof p.habilidades === 'object' ? { ...p.habilidades } : {},
    },
    modalidad: LEGADO_CONFIRMADO?.modalidad ?? 'pendiente',
    estado: 'pendiente',
    destinatario: null,
    creado: ahora,
  };
}

/**
 * Cuánto se hereda con una modalidad. Pura; no aplica nada.
 *
 * @param {ReturnType<typeof fotoDeLegado>} foto
 * @param {string} modalidad Una de `MODALIDAD`.
 * @param {{redondeo?: 'abajo'|'cercano'|'arriba', excluirHeredado?: boolean}} [opciones]
 * @returns {{ok: true, cantidad: number, moneda: 'xp'|'puntosHabilidad'}|{ok: false, motivo: string}}
 */
export function calcularLegado(foto, modalidad, { redondeo = 'abajo', excluirHeredado = false } = {}) {
  const b = foto?.base ?? {};
  const redondear = { abajo: Math.floor, cercano: Math.round, arriba: Math.ceil }[redondeo];
  if (!redondear) return { ok: false, motivo: 'redondeo desconocido' };

  let base;
  let moneda;
  if (modalidad === MODALIDAD.XP_ACUMULADA) {
    if (b.xpAcumulada === null || b.xpAcumulada === undefined) return { ok: false, motivo: 'xp no válida' };
    base = b.xpAcumulada - (excluirHeredado ? (b.xpHeredadaIncluida ?? 0) : 0);
    moneda = 'xp';
  } else if (modalidad === MODALIDAD.PUNTOS_DISPONIBLES) {
    if (b.puntosHabilidadDisponibles === null || b.puntosHabilidadDisponibles === undefined) return { ok: false, motivo: 'puntos no válidos' };
    base = b.puntosHabilidadDisponibles;
    moneda = 'puntosHabilidad';
  } else if (modalidad === MODALIDAD.PUNTOS_TOTALES) {
    // Necesita saber cuántos puntos se gastaron: no hay contador fiable.
    return { ok: false, motivo: 'los puntos gastados no tienen una semántica definida todavía' };
  } else {
    return { ok: false, motivo: 'modalidad pendiente' };
  }
  if (!Number.isFinite(base) || base < 0) return { ok: false, motivo: 'base no válida' };
  return { ok: true, cantidad: redondear(base * FRACCION_LEGADO), moneda };
}

/**
 * Aplica la herencia a un sucesor. Devuelve las acciones a despachar (por el
 * canal normal) y la foto marcada como aplicada, o por qué no.
 *
 * DESACTIVADA en producción: sin `confirmado` (o con `LEGADO_CONFIRMADO`
 * null) no hace nada. Las pruebas pasan una confirmación de prueba.
 *
 * @param {ReturnType<typeof fotoDeLegado>} foto
 * @param {{runId: string, nombre?: string}} sucesor El NUEVO personaje.
 * @param {{modalidad: string, redondeo?: string}|null} [confirmado]
 */
export function aplicarLegado(foto, sucesor, confirmado = LEGADO_CONFIRMADO) {
  if (!confirmado?.modalidad) return { ok: false, motivo: 'pendiente: falta decidir la base del 35 %' };
  if (!foto || foto.estado !== 'pendiente') return { ok: false, motivo: 'ya aplicada o no disponible' };
  if (!sucesor?.runId || sucesor.runId === foto.runOrigen) return { ok: false, motivo: 'sucesor no válido' };
  const c = calcularLegado(foto, confirmado.modalidad, { redondeo: confirmado.redondeo });
  if (!c.ok) return c;
  const acciones = c.moneda === 'xp'
    ? [{ tipo: 'player/xp', payload: { cantidad: c.cantidad, motivo: 'legado', legado: true } }]
    : [{ tipo: 'player/legado/puntos', payload: { puntosHabilidad: c.cantidad } }];
  return {
    ok: true,
    cantidad: c.cantidad,
    moneda: c.moneda,
    acciones,
    foto: { ...foto, estado: 'aplicado', modalidad: confirmado.modalidad, destinatario: sucesor.runId, aplicado: { cantidad: c.cantidad, moneda: c.moneda } },
  };
}

export default { FRACCION_LEGADO, MODALIDAD, LEGADO_CONFIRMADO, fotoDeLegado, calcularLegado, aplicarLegado };
