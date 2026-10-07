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

/** Claves cuyo contenido no se ha podido leer: no se reescriben encima. */
const corruptas = new Set();

function leerMapa(clave) {
  const a = almacen();
  if (!a) return {};
  let texto = null;
  try { texto = a.getItem(clave); } catch { return {}; }
  try {
    const v = JSON.parse(texto ?? '{}');
    if (v && typeof v === 'object' && !Array.isArray(v)) { corruptas.delete(clave); return v; }
  } catch { /* abajo */ }
  // Ilegible: se lee como vacío, pero se marca para no escribir encima. Un
  // guardado nuevo borraría las herencias y muertes que hubiera dentro.
  corruptas.add(clave);
  return {};
}

/** ¿El registro de esa clave está ilegible? */
export function registroIlegible(clave = CLAVE_LEGADOS) {
  leerMapa(clave);
  return corruptas.has(clave);
}

/** Escribe y relee: «guardado» solo si de verdad está. */
function escribirMapa(clave, mapa) {
  const a = almacen();
  if (!a) return { ok: false, error: 'sin almacenamiento' };
  if (corruptas.has(clave)) return { ok: false, error: 'el registro guardado está dañado: no se escribe encima para no perder lo que contenga' };
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

/** La herencia de un run, o null. */
export function legado(runId) {
  return (runId && leerMapa(CLAVE_LEGADOS)[runId]) || null;
}

/**
 * Cambia el estado de una herencia SOLO si sigue como se espera (comparar y
 * cambiar): otra pestaña o un intento anterior pueden haberla movido. Se
 * conserva todo lo que ya tenía (la foto original) y se añade el paso al
 * historial. Escribe y relee.
 *
 * @param {string} runId
 * @param {{estado: string, transaccion?: string|null}} esperado
 * @param {Object} cambio Campos nuevos (incluido `estado`).
 * @returns {{ok: boolean, error?: string, conflicto?: boolean}}
 */
export function cambiarLegado(runId, esperado, cambio, ahora = Date.now()) {
  const mapa = leerMapa(CLAVE_LEGADOS);
  const actual = mapa[runId];
  if (!actual) return { ok: false, error: 'sin herencia', conflicto: true };
  const estado = actual.estado ?? 'pendiente';
  if (estado !== esperado.estado || ('transaccion' in esperado && (actual.transaccion ?? null) !== esperado.transaccion)) {
    return { ok: false, error: `la herencia ya no está como se esperaba (${estado})`, conflicto: true };
  }
  const historial = [...(Array.isArray(actual.historial) ? actual.historial : []), { de: estado, a: cambio.estado, transaccion: cambio.transaccion ?? actual.transaccion ?? null, momento: ahora }];
  return escribirMapa(CLAVE_LEGADOS, { ...mapa, [runId]: { ...actual, ...cambio, historial } });
}

export default { estaMuerto, marcarMuerto, runsMuertos, guardarLegado, legados, legado, cambiarLegado, CLAVE_MUERTOS, CLAVE_LEGADOS };
