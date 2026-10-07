/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCANVEIL · persistence/EntregaLegado.js
 * ---------------------------------------------------------------------------
 * Entrega la herencia de un muerto a su sucesor: una vez, a uno, y sin que un
 * corte a mitad la duplique o la pierda.
 *
 * El problema: la herencia vive en `arcanveil:legados` y el sucesor en su
 * ranura `arcanveil:partida:<n>`. Son dos claves de `localStorage`; cada
 * `setItem` es atómico por sí solo, pero las dos juntas no forman una
 * transacción (y `Store.transaccion` solo agrupa memoria). Se resuelve con la
 * propia herencia como diario, con estados que se pueden recuperar:
 *
 *   pendiente ──reservar──▶ reservado(T) ──confirmar──▶ aplicado(T)
 *        ▲                      │
 *        └──────deshacer────────┘   (solo si NINGUNA ranura guarda T)
 *
 *   1. Reservar: la herencia pasa a `reservado` con una transacción T, el run
 *      del sucesor y su ranura. Se escribe y se relee.
 *   2. Crear el sucesor en memoria (flujo normal de su clase) y darle la
 *      experiencia por el canal de siempre, marcada con T.
 *   3. Guardar su ranura y releerla: run, T y experiencia. ESTE es el punto
 *      de compromiso: desde que hay una ranura con T, el premio existe.
 *   4. Confirmar: la herencia pasa a `aplicado(T)` con el destinatario.
 *
 * Recuperación (al abrir y antes de cada intento), para una herencia que se
 * quedó en `reservado(T)` porque el proceso murió entre escrituras: si alguna
 * ranura guarda un sucesor con T, se termina (→ aplicado); si ninguna, se
 * devuelve (→ pendiente). Determinista, sin «elegir lo más útil». Nunca se
 * devuelve a pendiente mientras exista una ranura con T.
 *
 * Exclusión entre pestañas: `navigator.locks` (Web Locks), un candado por
 * herencia, pedido sin esperar. Una variable o un botón desactivado no valen:
 * cada pestaña tiene los suyos. El candado se suelta solo si la pestaña muere,
 * por eso una reserva que se encuentra con el candado libre es huérfana y se
 * puede recuperar. Sin Web Locks no se puede asegurar: se bloquea con aviso
 * (se puede jugar sin herencia).
 *
 * Límite: coherencia LOCAL. Borrar los datos del navegador, editarlos o
 * importar un guardado en otro equipo se lo salta. No hay servidor.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import * as Registro from './RegistroRuns.js';
import { leerFoto, explicarLegado } from '../player/Legado.js';

export const PREFIJO_PARTIDA = 'arcanveil:partida:';

/** Para las pruebas: sustituir el candado (dos «pestañas» en un proceso). */
let candados = null;
export function usarCandados(c) { candados = c; }
function proveedorCandados() {
  if (candados) return candados;
  try { return globalThis.navigator?.locks ?? null; } catch { return null; }
}

function almacen() {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

/** Una transacción nueva. */
export function nuevaTransaccion() {
  const azar = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `leg-${azar}`;
}

/**
 * Las herencias, leídas. Cada una con su vista (`leerFoto`) y si consta la
 * muerte de su origen.
 */
export function listarLegados() {
  return Object.entries(Registro.legados()).map(([run, foto]) => {
    const v = leerFoto(foto);
    // La clave del mapa manda: una foto con otro run dentro es incoherente.
    if (v.runOrigen && v.runOrigen !== run) return { ...v, runOrigen: run, estado: 'bloqueado', motivo: 'La herencia no coincide con su partida.' };
    return { ...v, runOrigen: run, muerto: Registro.estaMuerto(run) };
  });
}

/** Las que se pueden elegir ahora. */
export function legadosPendientes() {
  return listarLegados().filter((v) => v.estado === 'pendiente' && v.muerto && v.cantidad !== null);
}

/**
 * Busca en las ranuras un sucesor guardado con esa transacción.
 * @returns {{ranura: string, runId: string, xp: number, legado: Object}|null}
 */
export function buscarSucesor(transaccion, runOrigen) {
  const a = almacen();
  if (!a || !transaccion) return null;
  let claves = [];
  try { claves = Array.from({ length: a.length }, (_, i) => a.key(i)).filter((k) => k?.startsWith(PREFIJO_PARTIDA)); } catch { return null; }
  for (const clave of claves.sort()) {
    let g = null;
    try { g = JSON.parse(a.getItem(clave) ?? 'null'); } catch { continue; }
    const p = g?.estado?.player;
    const recibido = p?.legadoRecibido;
    if (recibido?.transaccion === transaccion && recibido.runOrigen === runOrigen) {
      return { ranura: clave.slice(PREFIJO_PARTIDA.length), runId: g.estado.meta?.runId ?? null, xp: p.xp, legado: recibido };
    }
  }
  return null;
}

/**
 * Resuelve una reserva huérfana. Solo con el candado en la mano.
 * @returns {{ok: boolean, estado?: string, error?: string}}
 */
function resolverReserva(runOrigen) {
  const foto = Registro.legado(runOrigen);
  if (foto?.estado !== 'reservado') return { ok: true, estado: foto?.estado ?? null };
  const T = foto.transaccion ?? null;
  const s = buscarSucesor(T, runOrigen);
  if (s) {
    const r = Registro.cambiarLegado(runOrigen, { estado: 'reservado', transaccion: T }, {
      estado: 'aplicado', destinatario: s.runId, ranura: s.ranura,
      aplicado: { cantidad: s.legado.xp, momento: s.legado.momento ?? null, recuperado: true },
    });
    return r.ok ? { ok: true, estado: 'aplicado' } : { ok: false, error: r.error };
  }
  const r = Registro.cambiarLegado(runOrigen, { estado: 'reservado', transaccion: T }, { estado: 'pendiente', transaccion: null, reserva: null });
  return r.ok ? { ok: true, estado: 'pendiente' } : { ok: false, error: r.error };
}

/** Ejecuta `fn` con el candado de esa herencia, o dice por qué no. */
async function conCandado(runOrigen, fn) {
  const locks = proveedorCandados();
  if (!locks?.request) {
    return { ok: false, codigo: 'sin-exclusion', motivo: 'Este navegador no permite asegurar que la herencia se entregue una sola vez (otra pestaña podría cobrarla a la vez). Puedes empezar sin herencia.' };
  }
  return locks.request(`arcanveil:legado:${runOrigen}`, { ifAvailable: true }, async (candado) => {
    if (!candado) return { ok: false, codigo: 'ocupado', motivo: 'Otra pestaña está creando ahora mismo el sucesor de ese personaje. Termina allí o ciérrala y vuelve a intentarlo.' };
    return fn();
  });
}

/**
 * Al abrir: termina o devuelve las reservas que se quedaron a medias.
 * Las que tienen el candado ocupado (otra pestaña trabajando) no se tocan.
 */
export async function recuperarLegados() {
  const resultados = [];
  for (const v of listarLegados()) {
    if (v.estado !== 'reservado') continue;
    resultados.push({ runOrigen: v.runOrigen, ...(await conCandado(v.runOrigen, async () => resolverReserva(v.runOrigen))) });
  }
  return resultados;
}

/**
 * Entrega la herencia de `runOrigen` a un sucesor nuevo.
 *
 * @param {Object} op
 * @param {string} op.runOrigen El muerto elegido.
 * @param {string} op.transaccion La misma en cada reintento de esta creación.
 * @param {string} op.runDestino El run del sucesor (nuevo).
 * @param {string} op.ranura Donde se guardará.
 * @param {(entrega: {cantidad: number, legado: Object}) => Promise<void>|void} op.crear
 *        Crea el sucesor en memoria y le da la experiencia (`player/xp` con `legado`).
 * @param {() => {ok: boolean, motivo?: string}} op.guardar Guarda su ranura.
 * @returns {Promise<Object>}
 */
export async function entregarLegado({ runOrigen, transaccion, runDestino, ranura, crear, guardar }) {
  if (!runOrigen || !transaccion || !runDestino || !ranura) return { ok: false, codigo: 'datos', motivo: 'Faltan datos para entregar la herencia.' };
  if (runDestino === runOrigen) return { ok: false, codigo: 'datos', motivo: 'El muerto no puede ser su propio sucesor.' };

  return conCandado(runOrigen, async () => {
    // Una reserva anterior (de un intento que murió) se resuelve antes.
    const previa = resolverReserva(runOrigen);
    if (!previa.ok) return { ok: false, codigo: 'almacenamiento', fase: 'recuperar', motivo: `No se ha podido revisar la herencia: ${previa.error}` };

    const foto = Registro.legado(runOrigen);
    if (!foto) return { ok: false, codigo: 'sin-legado', motivo: 'Ese personaje no dejó herencia en este navegador.' };
    const v = leerFoto(foto);
    if (v.estado === 'aplicado') {
      // El mismo intento ya terminó (doble clic, recarga): es éxito, no otro premio.
      if (v.transaccion === transaccion) return { ok: true, yaHecho: true, cantidad: v.cantidad, runDestino: v.destinatario, ranura: v.ranura };
      return { ok: false, codigo: 'entregado', motivo: `La herencia de ${v.origen.nombre ?? 'ese personaje'} ya la recibió otro personaje.`, destinatario: v.destinatario, ranura: v.ranura };
    }
    if (v.estado !== 'pendiente') return { ok: false, codigo: 'bloqueado', motivo: v.motivo ?? 'Esa herencia no se puede entregar.' };
    if (!Registro.estaMuerto(runOrigen)) return { ok: false, codigo: 'no-muerto', motivo: 'No consta que ese personaje haya muerto: su experiencia no se hereda.' };

    const cantidad = v.cantidad;
    const legado = { runOrigen, transaccion, xp: cantidad, xpOrigen: v.xpAcumulada, nombreOrigen: v.origen.nombre ?? null, claseOrigen: v.origen.clase ?? null };

    // 1. Reservar.
    const reserva = Registro.cambiarLegado(runOrigen, { estado: 'pendiente' }, { estado: 'reservado', transaccion, reserva: { runDestino, ranura, cantidad, momento: Date.now() } });
    if (!reserva.ok) return { ok: false, codigo: reserva.conflicto ? 'conflicto' : 'almacenamiento', fase: 'reservar', motivo: `No se ha podido reservar la herencia: ${reserva.error}` };

    // Si algo falla después: se devuelve SOLO si ninguna ranura guarda T. Si
    // hay una ranura con T que no cuadra, es nuestra (run nuevo, recién
    // escrito): se quita; si no se puede, la reserva se queda y la resolverá
    // la recuperación (que verá la ranura y la dará por entregada).
    const deshacer = (fase, motivo) => {
      const suelta = buscarSucesor(transaccion, runOrigen);
      if (suelta) {
        try { almacen()?.removeItem(`${PREFIJO_PARTIDA}${suelta.ranura}`); } catch { /* abajo se comprueba */ }
      }
      const queda = buscarSucesor(transaccion, runOrigen);
      const vuelta = queda ? { ok: false, error: 'queda un sucesor guardado' } : Registro.cambiarLegado(runOrigen, { estado: 'reservado', transaccion }, { estado: 'pendiente', transaccion: null, reserva: null });
      return { ok: false, codigo: 'guardado', fase, motivo, devuelto: vuelta.ok, nota: vuelta.ok ? 'La herencia sigue pendiente.' : 'La herencia queda reservada y se resolverá al volver a abrir el juego.' };
    };

    // 2. Crear en memoria.
    try {
      await crear({ cantidad, legado });
    } catch (e) {
      return deshacer('crear', `No se ha podido crear el personaje: ${e?.message ?? e}`);
    }

    // 3. Guardar y releer: el punto de compromiso.
    let g;
    try { g = await guardar(); } catch (e) { g = { ok: false, motivo: e?.message ?? String(e) }; }
    const escrito = buscarSucesor(transaccion, runOrigen);
    const cuadra = escrito && escrito.ranura === String(ranura) && escrito.runId === runDestino && escrito.xp === cantidad;
    if (!g?.ok || !cuadra) {
      return deshacer('guardar', g?.ok ? 'Lo guardado no coincide con el personaje nuevo.' : `No se ha podido guardar el personaje nuevo: ${g?.motivo ?? 'error'}`);
    }

    // 4. Confirmar. Si esta escritura falla, el sucesor ya existe: la
    //    recuperación la terminará (no se devuelve nada).
    const fin = Registro.cambiarLegado(runOrigen, { estado: 'reservado', transaccion }, {
      estado: 'aplicado', destinatario: runDestino, ranura: String(ranura), aplicado: { cantidad, momento: Date.now() },
    });
    return { ok: true, cantidad, runDestino, ranura: String(ranura), confirmado: fin.ok, nota: fin.ok ? null : 'La entrega se terminará de apuntar al volver a abrir el juego.', texto: explicarLegado(v) };
  });
}

/**
 * El paso 2 tal como lo hacen la app y las pruebas: el sucesor nace por el
 * flujo normal de SU personaje (`player/crear`, con el run reservado) y la
 * herencia entra por el canal normal de experiencia, marcada con su origen.
 * Se espera a la microcola entre medias: el inventario inicial y lo demás
 * que publica la creación tienen que estar antes de guardar.
 *
 * @param {Object} store
 * @param {{borrador: Object, runDestino: string, cantidad: number, legado: Object}} datos
 */
export async function crearEnMotor(store, { borrador, runDestino, cantidad, legado }) {
  const tic = () => new Promise((r) => setTimeout(r, 0));
  store.dispatch('player/crear', { borrador, runId: runDestino });
  await tic();
  if (store.select('meta.runId') !== runDestino) throw new Error('el personaje no se ha creado');
  store.dispatch('player/xp', { cantidad, motivo: 'legado', legado });
  await tic();
  if (store.select('player.legadoRecibido.transaccion') !== legado.transaccion) throw new Error('la herencia no ha entrado');
}

export default { crearEnMotor, listarLegados, legadosPendientes, buscarSucesor, recuperarLegados, entregarLegado, nuevaTransaccion, usarCandados, PREFIJO_PARTIDA };
