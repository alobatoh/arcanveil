/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCANVEIL · persistence/RegistroRuns.js
 * ---------------------------------------------------------------------------
 * Lo que sobrevive a una partida en ESTE navegador: qué runs han muerto y la
 * herencia pendiente que dejaron.
 *
 * Muerte permanente (decisión del 7-oct-2026): un personaje muerto no vuelve.
 * Cada partida lleva un `meta.runId`; al morir se apunta aquí, y cargar una
 * ranura anterior del MISMO run no lo resucita. Las demás partidas siguen
 * cargables. Se identifica por runId, nunca por nombre (dos «Sive» pueden ser
 * personas distintas).
 *
 * Es coherencia de juego local, no antifraude: borrar los datos del
 * navegador, editar el almacenamiento o importar un guardado en otro equipo
 * se lo salta. No hay servidor, ni se pretende.
 *
 * Claves:
 *   · `arcanveil:runs-muertos` → { [runId]: {nombre, muerto, causa} }
 *   · `arcanveil:legados`      → { [runId]: foto de `player/Legado.js` }
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const CLAVE_MUERTOS = 'arcanveil:runs-muertos';
export const CLAVE_LEGADOS = 'arcanveil:legados';

function almacen() {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

function leerMapa(clave) {
  const a = almacen();
  if (!a) return {};
  try {
    const v = JSON.parse(a.getItem(clave) ?? '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

/** Escribe y relee: «guardado» solo si de verdad está. */
function escribirMapa(clave, mapa) {
  const a = almacen();
  if (!a) return { ok: false, error: 'sin almacenamiento' };
  try {
    const texto = JSON.stringify(mapa);
    a.setItem(clave, texto);
    return a.getItem(clave) === texto ? { ok: true } : { ok: false, error: 'no se ha podido comprobar' };
  } catch (e) {
    return { ok: false, error: e?.name === 'QuotaExceededError' ? 'almacenamiento lleno' : String(e?.message ?? e) };
  }
}

/** ¿Este run ha muerto? */
export function estaMuerto(runId) {
  return Boolean(runId && leerMapa(CLAVE_MUERTOS)[runId]);
}

/**
 * Apunta un run como muerto. Idempotente: si ya estaba, no lo reescribe.
 * @returns {{ok: boolean, ya?: boolean, error?: string}}
 */
export function marcarMuerto(runId, datos = {}) {
  if (!runId) return { ok: false, error: 'sin runId' };
  const mapa = leerMapa(CLAVE_MUERTOS);
  if (mapa[runId]) return { ok: true, ya: true };
  return escribirMapa(CLAVE_MUERTOS, { ...mapa, [runId]: { nombre: datos.nombre ?? null, muerto: datos.muerto ?? Date.now(), causa: datos.causa ?? null } });
}

/** Los runs muertos apuntados. */
export function runsMuertos() {
  return leerMapa(CLAVE_MUERTOS);
}

/**
 * Guarda la herencia pendiente de un run. Una por run: no se pisa (una
 * recarga o un evento doble no crean una segunda herencia).
 */
export function guardarLegado(foto) {
  if (!foto?.runOrigen) return { ok: false, error: 'sin runOrigen' };
  const mapa = leerMapa(CLAVE_LEGADOS);
  if (mapa[foto.runOrigen]) return { ok: true, ya: true };
  return escribirMapa(CLAVE_LEGADOS, { ...mapa, [foto.runOrigen]: foto });
}

/** Las herencias guardadas, por run de origen. */
export function legados() {
  return leerMapa(CLAVE_LEGADOS);
}

export default { estaMuerto, marcarMuerto, runsMuertos, guardarLegado, legados, CLAVE_MUERTOS, CLAVE_LEGADOS };
