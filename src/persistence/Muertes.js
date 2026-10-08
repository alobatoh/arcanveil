/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCANVEIL · persistence/Muertes.js
 * ---------------------------------------------------------------------------
 * Registro AUTORITATIVO de las muertes: la marca de cada run muerto y la
 * foto de su herencia, juntas, en el estado coordinado (IndexedDB).
 *
 * Por qué: hasta el #7 la marca y la foto se apuntaban en dos MAPAS de
 * `localStorage` (leer el mapa, añadir el run, escribir el mapa entero). Con
 * la caché de otra pestaña atrasada, la segunda muerte escribía un mapa sin
 * la primera: una foto o una marca perdidas. Aquí cada run es su propia
 * clave y la marca y la foto se escriben en UNA transacción: las dos o
 * ninguna. Nunca «muerto sin foto» ni «foto de un vivo».
 *
 *   · añadir si falta: la misma muerte repetida no crea otra foto;
 *   · si ya hay OTRA foto distinta del mismo run, se queda la primera y se
 *     devuelve el conflicto (no gana «la de más XP»);
 *   · los mapas de `localStorage` quedan como ESPEJO (se rellenan después,
 *     sin quitar nada) y como fuente de lo apuntado antes del #8, que se
 *     importa sin reiniciar ni repetir premio. Un mapa dañado no se toca.
 *
 * Sin estado coordinado (navegador sin IndexedDB) se usa solo el registro
 * local, y se dice. Coherencia LOCAL, no antifraude.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import * as Registro from './RegistroRuns.js';
import * as Coordinacion from './Coordinacion.js';

const MUERTOS = Coordinacion.ALMACENES.MUERTOS;
const LEGADOS = Coordinacion.ALMACENES.LEGADOS;

/** ¿Es la misma foto? (lo que decide la herencia: base y cantidad). */
function mismaFoto(a, b) {
  if (!a || !b) return false;
  return a.cantidad === b.cantidad
    && (a.base?.xpAcumulada ?? null) === (b.base?.xpAcumulada ?? null)
    && (a.base?.xpHeredadaIncluida ?? null) === (b.base?.xpHeredadaIncluida ?? null);
}

/**
 * Registra una muerte: marca y (si la hay) foto, en una transacción.
 * @param {{runId: string, marca: Object, foto?: Object|null}} m
 * @returns {Promise<{ok: boolean, marca: boolean, legado: boolean, ya?: boolean, conflicto?: string|null, error?: string, sinCoordinacion?: boolean}>}
 */
export async function registrar({ runId, marca = {}, foto = null }) {
  if (!runId) return { ok: false, marca: false, legado: false, error: 'sin runId' };
  if (foto && foto.runOrigen && foto.runOrigen !== runId) return { ok: false, marca: false, legado: false, error: 'la foto no es de este run' };
  const datos = { nombre: marca.nombre ?? null, muerto: marca.muerto ?? Date.now(), causa: marca.causa ?? null };

  if (!Coordinacion.disponible()) {
    const a = Registro.marcarMuerto(runId, datos);
    const b = foto ? Registro.guardarLegado(foto) : { ok: true };
    return { ok: a.ok && b.ok, marca: a.ok, legado: foto ? b.ok : false, error: a.error ?? b.error ?? null, sinCoordinacion: true };
  }

  let conflicto = null;
  let ya = false;
  let hayFoto = false;
  await Coordinacion.casVarios([[MUERTOS, runId], [LEGADOS, runId]], ([m, l]) => {
    const cambios = [null, null];
    if (!m) cambios[0] = { nuevo: datos };
    if (foto) {
      if (!l) cambios[1] = { nuevo: foto };
      else if (!mismaFoto(l, foto)) conflicto = `Ya había una herencia apuntada para este personaje (${l.cantidad ?? '?'} XP); se conserva la primera y no se sustituye por esta (${foto.cantidad ?? '?'} XP).`;
    }
    hayFoto = Boolean(l || cambios[1]);
    if (!cambios[0] && !cambios[1]) { ya = true; return null; }
    return cambios;
  });
  // El espejo local, después y sin quitar nada. Si falla, manda lo de arriba.
  try { await espejar(runId); } catch { /* espejo: la autoridad ya está escrita */ }
  // Un mapa local dañado no se toca (ni se reescribe): se dice.
  const danado = Registro.registroIlegible(Registro.CLAVE_LEGADOS) || Registro.registroIlegible(Registro.CLAVE_MUERTOS);
  const aviso = danado ? 'El registro local antiguo de herencias está dañado: se conserva tal cual y no se escribe encima; esta muerte queda apuntada en el registro coordinado.' : null;
  return { ok: true, marca: true, legado: hayFoto, ya, conflicto, aviso };
}

/**
 * Rellena los mapas de `localStorage` con lo que dice la autoridad para
 * este run, sin quitar nada de lo que ya tengan. Si un mapa está dañado, no
 * se escribe encima (lo protege `RegistroRuns`).
 */
async function espejar(runId) {
  const [m, l] = await Promise.all([Coordinacion.leer(MUERTOS, runId), Coordinacion.leer(LEGADOS, runId)]);
  if (m && !Registro.estaMuerto(runId)) Registro.marcarMuerto(runId, m);
  if (l && !Registro.legado(runId)) Registro.guardarLegado(l);
}

/**
 * ¿Este run ha muerto? Lo dice la autoridad; lo apuntado solo en el mapa
 * local de antes del #8 se importa (añadir si falta) y cuenta. Si el estado
 * coordinado no se puede leer, LANZA: quien pregunta no debe dar por vivo a
 * nadie por no haber podido comprobarlo.
 */
export async function estaMuerto(runId) {
  if (!runId) return false;
  if (!Coordinacion.disponible()) return Registro.estaMuerto(runId);
  if (await Coordinacion.leer(MUERTOS, runId)) return true;
  const local = Registro.runsMuertos()[runId];
  if (!local) return false;
  await Coordinacion.cas(MUERTOS, runId, (a) => (a ? null : { nuevo: { nombre: local.nombre ?? null, muerto: local.muerto ?? null, causa: local.causa ?? null, importado: true } }));
  return true;
}

/** Todos los runs muertos (autoridad + lo apuntado antes en el mapa local). */
export async function runsMuertos() {
  const todos = new Set(Object.keys(Registro.runsMuertos()));
  if (Coordinacion.disponible()) for (const [k] of await Coordinacion.listar(MUERTOS)) todos.add(String(k));
  return todos;
}

/**
 * Importa las marcas de los mapas locales (antes del #8) que la autoridad
 * aún no tenga. Añadir si falta: nunca reinicia ni cambia lo ya importado.
 * Un mapa dañado se deja tal cual (se lee como vacío y no se escribe).
 */
export async function importarMapas() {
  if (!Coordinacion.disponible()) return { importados: 0 };
  let importados = 0;
  for (const [run, local] of Object.entries(Registro.runsMuertos())) {
    const r = await Coordinacion.cas(MUERTOS, run, (a) => (a ? null : { nuevo: { nombre: local?.nombre ?? null, muerto: local?.muerto ?? null, causa: local?.causa ?? null, importado: true } }));
    if (r.cambiado) importados += 1;
  }
  return { importados };
}

export default { registrar, estaMuerto, runsMuertos, importarMapas };
