/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCANVEIL · persistence/EntregaLegado.js
 * ---------------------------------------------------------------------------
 * Entrega la herencia de un muerto a su sucesor: una vez, a uno, sin que un
 * corte a mitad la duplique o la pierda, y sin pisar otra campaña.
 *
 * DÓNDE VIVE CADA COSA
 *   · La foto del muerto la escribe la muerte en `localStorage`
 *     (`arcanveil:legados`). Es la entrada.
 *   · El ESTADO de cada herencia (pendiente → reservado → aplicado, y los
 *     bloqueos) vive en el almacén coordinado (`Coordinacion`, IndexedDB),
 *     que es coherente entre pestañas. `localStorage` no lo es: medido, dos
 *     pestañas con Web Locks aún leían valores viejos (118 de 120). La foto
 *     se importa al almacén la primera vez que se toca, sin pisar nada.
 *   · El sucesor, en su ranura: copia autoritativa coordinada y espejo en
 *     `localStorage` (`Ranuras.escribirPartida`). La ranura se RECLAMA en el
 *     registro coordinado antes de escribir (`Ranuras.reclamarDestino`) y el
 *     guardado usa el arriendo del candado global que ya tiene la operación.
 *   · Las muertes (marca + foto), en `Muertes` (coordinado).
 *
 * EL DIARIO
 *
 *   pendiente ──reservar──▶ reservado(T, runDestino, ranura, cantidad[, reemplazo])
 *        ▲                        │                     │
 *        │  (ausencia comprobada) │      (compromiso    │  (no se puede
 *        └────────────────────────┘       coherente)     │   comprobar)
 *                                 ▼                     ▼
 *                         aplicado(T, destino)   reservado + bloqueo{motivo}
 *
 *   1. Candados en orden fijo: el de la herencia (Web Locks, sin esperar) y
 *      el GLOBAL de ranuras (esperando, con tope).
 *   2. Se reclama la ranura: libre, o una ocupada con permiso concreto y
 *      vigente para reemplazarla.
 *   3. Reservar: `pendiente → reservado`, atado a T, destino, ranura y
 *      cantidad (comparar y cambiar en UNA transacción coordinada).
 *   4. Crear el sucesor en memoria (flujo normal) con la XP marcada con T.
 *   5. Guardar la ranura y releerla: EXACTAMENTE el sucesor esperado (run,
 *      origen, T, XP inicial = cantidad, y los bytes escritos). Es el punto
 *      de compromiso.
 *   6. Confirmar: `reservado → aplicado`; la ranura, ocupada por ese run.
 *
 * RECUPERACIÓN (al abrir y antes de cada intento): una reserva con el
 * candado libre es huérfana y se VERIFICA, no se adivina (ver
 * `verificarReserva`): ausencia COMPROBADA → pendiente; compromiso
 * coherente → aplicado una vez; cualquier otra cosa → bloqueo con motivo,
 * sin tocar bytes, reserva ni destinatario, y se puede volver a comprobar.
 *
 * Aplicado es definitivo: borrar después al sucesor no devuelve la herencia.
 * Coherencia LOCAL, no antifraude.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import * as Registro from './RegistroRuns.js';
import * as Ranuras from './Ranuras.js';
import * as Coordinacion from './Coordinacion.js';
import * as Muertes from './Muertes.js';
import { leerFoto, explicarLegado } from '../player/Legado.js';

export const PREFIJO_PARTIDA = Ranuras.PREFIJO;
const LEGADOS = Coordinacion.ALMACENES.LEGADOS;

/** Para las pruebas: sustituir el candado (dos «pestañas» en un proceso). */
let candados = null;
export function usarCandados(c) { candados = c; Ranuras.usarCandados(c); }
function proveedorCandados() {
  if (candados) return candados;
  try { return globalThis.navigator?.locks ?? null; } catch { return null; }
}

function almacen() {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

/** Bytes en crudo de una ranura: `{ok, texto}` (texto null = no existe). */
function bytesDe(ranura) {
  try { return { ok: true, texto: almacen()?.getItem(`${PREFIJO_PARTIDA}${ranura}`) ?? null }; } catch (e) { return { ok: false, motivo: String(e?.message ?? e) }; }
}

const SIN_COORDINACION = { ok: false, codigo: 'sin-exclusion', motivo: 'Este navegador no permite asegurar que la herencia se entregue una sola vez entre pestañas (falta Web Locks o IndexedDB). Puedes empezar sin herencia.' };

/** Una transacción nueva. */
export function nuevaTransaccion() {
  const azar = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `leg-${azar}`;
}

/* ── estado coordinado de cada herencia ─────────────────────────────────── */

/**
 * El estado de la herencia de un run: el del almacén coordinado, o la foto
 * de la muerte importada (sin pisar nada si otra pestaña ya la importó).
 */
export async function estadoLegado(runOrigen) {
  const actual = await Coordinacion.leer(LEGADOS, runOrigen);
  if (actual) return actual;
  const foto = Registro.legado(runOrigen);
  if (!foto) return null;
  const r = await Coordinacion.cas(LEGADOS, runOrigen, (a) => (a ? null : { nuevo: foto }));
  return r.cambiado ? r.nuevo : r.actual;
}

/**
 * Cambia el estado SOLO si sigue como se espera (comparar y cambiar en una
 * transacción coordinada). Conserva la foto original y apunta el paso.
 * @returns {Promise<{ok: boolean, error?: string, conflicto?: boolean}>}
 */
export async function cambiarLegado(runOrigen, esperado, cambio) {
  try {
    await estadoLegado(runOrigen);
    let error = null;
    const r = await Coordinacion.cas(LEGADOS, runOrigen, (actual) => {
      if (!actual) { error = 'sin herencia'; return null; }
      const estado = actual.estado ?? 'pendiente';
      if (estado !== esperado.estado || ('transaccion' in esperado && (actual.transaccion ?? null) !== esperado.transaccion)) {
        error = `la herencia ya no está como se esperaba (${estado})`;
        return null;
      }
      const historial = [...(Array.isArray(actual.historial) ? actual.historial : []), { de: estado, a: cambio.estado, transaccion: cambio.transaccion ?? actual.transaccion ?? null, momento: Date.now() }];
      return { nuevo: { ...actual, ...cambio, historial } };
    });
    return r.cambiado ? { ok: true } : { ok: false, error, conflicto: true };
  } catch (e) {
    return { ok: false, error: `no se ha podido escribir el estado compartido (${e?.message ?? e})` };
  }
}

/**
 * Las herencias: las fotos de `localStorage` con el estado coordinado
 * encima. Cada una con su vista (`leerFoto`), si consta la muerte de su
 * origen y, si está bloqueada, por qué.
 */
export async function listarLegados() {
  const mapa = { ...Registro.legados() };
  if (Coordinacion.disponible()) {
    for (const [k, v] of await Coordinacion.listar(LEGADOS)) mapa[k] = v;
  }
  // Muertos según la autoridad (un mapa local pisado por otra pestaña no
  // esconde una herencia).
  const muertos = await Muertes.runsMuertos();
  return Object.entries(mapa).map(([run, foto]) => {
    const v = leerFoto(foto);
    if (v.runOrigen && v.runOrigen !== run) return { ...v, runOrigen: run, estado: 'bloqueado', motivo: 'La herencia no coincide con su partida.' };
    return { ...v, runOrigen: run, muerto: muertos.has(run), bloqueo: foto?.bloqueo ?? null, reserva: foto?.reserva ?? null };
  });
}

/** Las que se pueden elegir ahora. */
export async function legadosPendientes() {
  return (await listarLegados()).filter((v) => v.estado === 'pendiente' && v.muerto && v.cantidad !== null);
}

/* ── verificación ───────────────────────────────────────────────────────── */

/**
 * ¿La ranura guarda exactamente el sucesor de esta reserva?
 * @param {Object} l Lectura de `Ranuras.leerRanura`.
 * @param {{runOrigen: string, T: string, runDestino: string, cantidad: number}} e Esperado.
 * @param {{inicial?: boolean}} [o] Recién escrito: el total también es la cantidad.
 */
function cuadra(l, e, { inicial = false } = {}) {
  if (l.tipo !== 'valida') return { ok: false, motivo: l.motivo ?? `ranura ${l.tipo}` };
  const p = l.estado.player ?? {};
  const rec = p.legadoRecibido ?? {};
  const fallos = [];
  if (rec.transaccion !== e.T) fallos.push('la transacción no es la de la reserva');
  if (rec.runOrigen !== e.runOrigen) fallos.push('el origen no es el de la reserva');
  if (l.runId !== e.runDestino) fallos.push(`la partida es ${l.runId}, no ${e.runDestino}`);
  if (e.runDestino === e.runOrigen) fallos.push('el destino es el propio muerto');
  if (rec.xp !== e.cantidad) fallos.push(`recibió ${rec.xp} XP, no ${e.cantidad}`);
  const heredada = p.xpHeredada ?? rec.xp;
  if (heredada !== e.cantidad) fallos.push(`su XP heredada es ${heredada}, no ${e.cantidad}`);
  // Puede haber jugado después (350 heredados + 20 ganados = 370): se
  // reconoce, sin sumar nada; menos de lo heredado no cuadra.
  if (!Number.isSafeInteger(p.xp) || p.xp < e.cantidad) fallos.push(`su XP total (${p.xp}) es menor que lo heredado`);
  if (inicial && p.xp !== e.cantidad) fallos.push(`recién creado tiene ${p.xp} XP, no ${e.cantidad}`);
  return fallos.length ? { ok: false, motivo: fallos.join('; ') } : { ok: true };
}

/**
 * Qué se puede afirmar de una reserva, leyendo sin tocar nada.
 *
 * Alcance: decide la ranura RESERVADA (el protocolo solo escribe el sucesor
 * ahí). Las demás se recorren para encontrar copias con la misma
 * transacción; las ajenas que no se pueden leer no bloquean (no pueden ser
 * el sucesor de esta entrega), pero si no se pueden ENUMERAR, no hay
 * «ausencia comprobada».
 *
 * @returns {{decision: 'aplicar'|'liberar'|'bloquear', motivo?: string, evidencia?: Object, sucesor?: Object}}
 */
export async function verificarReserva(runOrigen, foto) {
  const T = foto?.transaccion ?? null;
  const r = foto?.reserva ?? null;
  if (!T || !r?.runDestino || !r?.ranura || !Number.isSafeInteger(r?.cantidad)) {
    return { decision: 'bloquear', motivo: 'La reserva no guarda todos sus datos (transacción, destino, ranura y cantidad).' };
  }
  const e = { runOrigen, T, runDestino: r.runDestino, cantidad: r.cantidad };
  // Lo que vale de cada ranura es su copia AUTORITATIVA (una caché local
  // vieja no decide una entrega). Si no se puede leer, no hay comprobación.
  let lista;
  let propia;
  const copias = [];
  try {
    lista = await Ranuras.enumerarPartidas();
    if (!lista.ok) return { decision: 'bloquear', motivo: `No se puede comprobar la entrega: ${lista.motivo}.` };
    for (const n of lista.ranuras) {
      if (n === String(r.ranura)) continue;
      const l = await Ranuras.leerRanuraCoordinada(n);
      if (l.tipo === 'valida' && l.estado.player?.legadoRecibido?.transaccion === T) copias.push(n);
    }
    propia = await Ranuras.leerRanuraCoordinada(r.ranura);
  } catch (e) {
    return { decision: 'bloquear', motivo: `No se puede comprobar la entrega: el estado compartido no se puede leer (${e?.message ?? e}).` };
  }
  // Reservada sin copia autoritativa: no se escribió nada por el protocolo
  // del #8; una reserva del #7 pudo dejar el sucesor solo en la ranura local.
  if (propia.tipo === 'reservada') propia = propia.registro?.op === T ? propia.local : { tipo: 'inaccesible', motivo: 'la ranura está reservada por otra operación' };
  const evidencia = { ranura: String(r.ranura), lectura: propia.tipo, copias };
  if (propia.tipo === 'ausente') {
    if (copias.length) return { decision: 'bloquear', motivo: `Hay un sucesor con esta entrega en otra ranura (${copias.join(', ')}), no en la reservada.`, evidencia };
    return { decision: 'liberar', evidencia };
  }
  if (propia.tipo !== 'valida') {
    return { decision: 'bloquear', motivo: `No puedo comprobar la entrega: la ranura ${r.ranura} ${propia.tipo === 'inaccesible' ? 'no se puede leer' : 'está dañada'} (${propia.motivo}).`, evidencia };
  }
  const rec = propia.estado.player?.legadoRecibido;
  if (rec?.transaccion === T) {
    const c = cuadra(propia, e);
    if (!c.ok) return { decision: 'bloquear', motivo: `La partida de la ranura ${r.ranura} no coincide con la entrega: ${c.motivo}.`, evidencia };
    if (copias.length) return { decision: 'bloquear', motivo: `Hay dos sucesores con la misma entrega (ranuras ${r.ranura} y ${copias.join(', ')}).`, evidencia };
    return { decision: 'aplicar', evidencia, sucesor: { runId: propia.runId, ranura: String(r.ranura) } };
  }
  // La ranura reservada tiene otra partida sin esta entrega. Solo es seguro
  // devolver si era un reemplazo que no llegó a escribirse: sigue ahí
  // exactamente la partida que se iba a reemplazar.
  const re = r.reemplazo;
  if (re && re.runId === propia.runId && (re.guardadoEn ?? null) === (propia.guardadoEn ?? null) && (!re.huella || re.huella === propia.huella) && !copias.length) {
    return { decision: 'liberar', evidencia };
  }
  return { decision: 'bloquear', motivo: `La ranura ${r.ranura} tiene otra partida (${propia.estado.player?.nombre ?? propia.runId}) y no la de esta entrega.`, evidencia };
}

/** Aplica lo verificado a una reserva huérfana (con el candado de la herencia). */
async function resolverReserva(runOrigen) {
  const foto = await estadoLegado(runOrigen);
  if (foto?.estado !== 'reservado') return { ok: true, estado: foto?.estado ?? null };
  const T = foto.transaccion ?? null;
  const v = await verificarReserva(runOrigen, foto);
  if (v.decision === 'aplicar') {
    const r = await cambiarLegado(runOrigen, { estado: 'reservado', transaccion: T }, {
      estado: 'aplicado', destinatario: v.sucesor.runId, ranura: v.sucesor.ranura, bloqueo: null,
      aplicado: { cantidad: foto.reserva.cantidad, momento: Date.now(), recuperado: true },
    });
    if (r.ok) await Ranuras.confirmarRanura(v.sucesor.ranura, T, v.sucesor.runId).catch(() => null);
    return r.ok ? { ok: true, estado: 'aplicado' } : { ok: false, estado: 'reservado', motivo: r.error };
  }
  if (v.decision === 'liberar') {
    const r = await cambiarLegado(runOrigen, { estado: 'reservado', transaccion: T }, { estado: 'pendiente', transaccion: null, reserva: null, bloqueo: null });
    if (r.ok) await Ranuras.soltarRanura(String(foto.reserva.ranura), T).catch(() => null);
    return r.ok ? { ok: true, estado: 'pendiente' } : { ok: false, estado: 'reservado', motivo: r.error };
  }
  // Bloquear: se apunta el motivo (sin tocar la reserva) para enseñarlo y
  // para volver a comprobar después.
  if (foto.bloqueo?.motivo !== v.motivo) {
    await cambiarLegado(runOrigen, { estado: 'reservado', transaccion: T }, { estado: 'reservado', bloqueo: { motivo: v.motivo, momento: Date.now(), evidencia: v.evidencia ?? null } });
  }
  return { ok: false, estado: 'reservado', bloqueado: true, motivo: v.motivo };
}

/** Ejecuta `fn` con el candado de esa herencia (sin esperar), o dice por qué no. */
async function conCandado(runOrigen, fn) {
  const locks = proveedorCandados();
  if (!locks?.request || !Coordinacion.disponible()) return SIN_COORDINACION;
  return locks.request(`arcanveil:legado:${runOrigen}`, { ifAvailable: true }, async (candado) => {
    if (!candado) return { ok: false, codigo: 'ocupado', motivo: 'Otra pestaña está creando ahora mismo el sucesor de ese personaje. Termina allí o ciérrala y vuelve a intentarlo.' };
    return fn();
  });
}

/**
 * Al abrir y cuando se pida «volver a comprobar»: resuelve las reservas que
 * se quedaron a medias. Las que tienen el candado ocupado (otra pestaña
 * trabajando) no se tocan.
 */
export async function recuperarLegados() {
  if (!Coordinacion.disponible()) return [];
  // Las marcas de muerte de antes del #8 pasan al registro coordinado (añadir
  // si falta; un mapa dañado no se toca).
  await Muertes.importarMapas().catch(() => null);
  const resultados = [];
  for (const v of await listarLegados()) {
    if (v.estado !== 'reservado') continue;
    resultados.push({ runOrigen: v.runOrigen, ...(await conCandado(v.runOrigen, () => conCaptura(() => resolverReserva(v.runOrigen)))) });
  }
  return resultados;
}

/**
 * Deshace un intento fallido SIN borrar nada que no sea, byte a byte, lo que
 * este intento escribió en su ranura. Si la ranura cambió desde entonces, o
 * no se puede leer, no se toca y la reserva queda bloqueada.
 */
async function deshacer({ runOrigen, T, ranura, previos, escrito, fase, motivo, lease = null, runDestino = null, antes = null }) {
  const limpia = previos !== undefined && await retirarPropio({ lease, ranura, runId: runDestino, escrito, antes, previos });
  const ahora = bytesDe(ranura);
  if (limpia) {
    const v = await cambiarLegado(runOrigen, { estado: 'reservado', transaccion: T }, { estado: 'pendiente', transaccion: null, reserva: null, bloqueo: null });
    if (v.ok) await Ranuras.soltarRanura(ranura, T).catch(() => null);
    return { ok: false, codigo: 'guardado', fase, motivo, devuelto: v.ok, estado: v.ok ? 'pendiente' : 'reservado',
      nota: v.ok ? 'La herencia sigue pendiente y no se ha guardado ningún personaje nuevo.' : 'La herencia queda reservada; se volverá a comprobar al abrir el juego.' };
  }
  const duda = !ahora.ok ? `no se puede leer la ranura ${ranura}` : `la ranura ${ranura} ya no tiene exactamente lo que se escribió`;
  await cambiarLegado(runOrigen, { estado: 'reservado', transaccion: T }, { estado: 'reservado', bloqueo: { motivo: `No puedo comprobar la entrega: ${duda}.`, momento: Date.now() } });
  return { ok: false, codigo: 'verificacion', fase, motivo, devuelto: false, estado: 'reservado', bloqueado: true,
    nota: `No puedo comprobar si el personaje nuevo quedó guardado (${duda}). No he vuelto a entregar la herencia ni he borrado ninguna partida.` };
}

/**
 * Retira SOLO lo que escribió este intento: en la copia autoritativa (si
 * sigue siendo la suya) y en el espejo local (si tiene exactamente sus
 * bytes). Dice si la ranura ha quedado exactamente como estaba antes.
 */
async function retirarPropio({ lease, ranura, runId, escrito, antes, previos }) {
  // Solo si lo que se LEE es exactamente lo escrito: una relectura que no
  // cuadra es un estado dudoso y no se toca (queda bloqueado con motivo).
  if (escrito && lease && antes) {
    const ya = await Ranuras.instantanea(ranura).catch(() => null);
    if (ya?.snap?.texto === escrito) await Ranuras.deshacerEscritura({ lease, ranura, runId, texto: escrito, previo: antes }).catch(() => null);
  }
  const ahora = bytesDe(ranura);
  if (ahora.ok && escrito && ahora.texto === escrito && ahora.texto !== previos) {
    try {
      if (previos === null) almacen().removeItem(`${PREFIJO_PARTIDA}${ranura}`);
      else almacen().setItem(`${PREFIJO_PARTIDA}${ranura}`, previos);
    } catch { /* se comprueba abajo */ }
  }
  const local = bytesDe(ranura);
  if (!local.ok || local.texto !== previos) return false;
  if (!antes) return true;
  try {
    const ya = await Ranuras.instantanea(ranura);
    return (ya.snap?.texto ?? null) === (antes.snap?.texto ?? null);
  } catch { return false; }
}

/**
 * Entrega la herencia de `runOrigen` a un sucesor nuevo.
 *
 * @param {Object} op
 * @param {string} op.runOrigen El muerto elegido.
 * @param {string} op.transaccion La misma en cada reintento de esta creación.
 * @param {string} op.runDestino El run del sucesor (el mismo en cada reintento).
 * @param {string|null} [op.ranura] null = la primera libre bajo el candado global.
 * @param {Object|null} [op.reemplazo] Permiso concreto para reemplazar una ranura ocupada.
 * @param {(e: {cantidad: number, legado: Object, ranura: string}) => Promise<void>|void} op.crear
 * @param {(e: {ranura: string, reemplazo: Object|null, lease: Object, op: string}) => Promise<{ok: boolean, motivo?: string, texto?: string}>} op.guardar
 *   Guarda con el arriendo del candado global que ya tiene la operación (no
 *   lo vuelve a pedir) y con la operación que reservó la ranura.
 */
export async function entregarLegado({ runOrigen, transaccion, runDestino, ranura = null, reemplazo = null, crear, guardar }) {
  if (!runOrigen || !transaccion || !runDestino) return { ok: false, codigo: 'datos', motivo: 'Faltan datos para entregar la herencia.' };
  if (runDestino === runOrigen) return { ok: false, codigo: 'datos', motivo: 'El muerto no puede ser su propio sucesor.' };

  return conCandado(runOrigen, () => conCaptura(() => entregarConCandado({ runOrigen, transaccion, runDestino, ranura, reemplazo, crear, guardar })));
}

/**
 * Un fallo del almacenamiento (cuota, transacción abortada) es un resultado,
 * no una excepción: antes de reservar no queda nada a medias; después, cada
 * paso ya devuelve su fallo (o la verificación lo resolverá).
 */
async function conCaptura(fn) {
  try {
    return await fn();
  } catch (e) {
    const cuota = /quota|exceeded/i.test(`${e?.name ?? ''} ${e?.message ?? ''}`);
    return { ok: false, codigo: 'almacenamiento', motivo: cuota ? 'No queda espacio en el navegador para apuntar la entrega.' : `No se ha podido escribir el estado compartido (${e?.message ?? e}).`, estado: 'sin cambios' };
  }
}

async function entregarConCandado({ runOrigen, transaccion, runDestino, ranura, reemplazo, crear, guardar }) {
  {
    // Una reserva anterior (de un intento que murió) se verifica antes.
    const previa = await resolverReserva(runOrigen);
    const foto = await estadoLegado(runOrigen);
    if (!foto) return { ok: false, codigo: 'sin-legado', motivo: 'Ese personaje no dejó herencia en este navegador.' };
    const v = leerFoto(foto);

    // El token ata el destino: con el mismo token, el mismo personaje o nada.
    if (foto.transaccion === transaccion) {
      const destino = v.estado === 'aplicado' ? v.destinatario : foto.reserva?.runDestino;
      if (destino && destino !== runDestino) return { ok: false, codigo: 'token-destino', motivo: 'Esa operación ya iba dirigida a otro personaje.' };
    }
    if (v.estado === 'aplicado') {
      if (v.transaccion === transaccion) return { ok: true, yaHecho: true, cantidad: v.cantidad, runDestino: v.destinatario, ranura: v.ranura };
      return { ok: false, codigo: 'entregado', motivo: `La herencia de ${v.origen.nombre ?? 'ese personaje'} ya la recibió otro personaje.`, destinatario: v.destinatario, ranura: v.ranura };
    }
    if (v.estado === 'reservado') {
      return { ok: false, codigo: 'bloqueado-verificacion', bloqueado: true, motivo: previa.motivo ?? foto.bloqueo?.motivo ?? 'No se ha podido comprobar una entrega anterior de esta herencia.' };
    }
    if (v.estado !== 'pendiente') return { ok: false, codigo: 'bloqueado', motivo: v.motivo ?? 'Esa herencia no se puede entregar.' };
    if (!(await Muertes.estaMuerto(runOrigen))) return { ok: false, codigo: 'no-muerto', motivo: 'No consta que ese personaje haya muerto: su experiencia no se hereda.' };

    const cantidad = v.cantidad;
    const legado = { runOrigen, transaccion, xp: cantidad, xpOrigen: v.xpAcumulada, nombreOrigen: v.origen.nombre ?? null, claseOrigen: v.origen.clase ?? null };

    return Ranuras.conCandadoGlobal(async (lease) => {
      // La ranura, bajo el candado global, releída y reclamada AHORA.
      const destino = await Ranuras.reclamarDestino({ ranura, reemplazo, op: transaccion, runDestino });
      if (!destino.ok) return { ...destino, herencia: 'pendiente' };
      const slot = destino.ranura;

      // Reservar (atado a token, destino, ranura, cantidad y reemplazo).
      const reserva = await cambiarLegado(runOrigen, { estado: 'pendiente' }, {
        estado: 'reservado', transaccion, bloqueo: null,
        reserva: { runDestino, ranura: slot, cantidad, reemplazo: destino.reemplazo, momento: Date.now() },
      });
      if (!reserva.ok) {
        await Ranuras.soltarRanura(slot, transaccion).catch(() => null);
        return { ok: false, codigo: reserva.conflicto ? 'conflicto' : 'almacenamiento', fase: 'reservar', motivo: `No se ha podido reservar la herencia: ${reserva.error}`, devuelto: true, estado: 'pendiente' };
      }

      const antes = bytesDe(slot);
      if (!antes.ok) return deshacer({ runOrigen, T: transaccion, ranura: slot, previos: undefined, escrito: null, fase: 'leer', motivo: `No se puede leer la ranura ${slot}.` });
      const previos = antes.texto;
      const coord = await Ranuras.instantanea(slot);
      const base = { runOrigen, T: transaccion, ranura: slot, previos, lease, runDestino, antes: coord };

      try {
        await crear({ cantidad, legado, ranura: slot });
      } catch (e) {
        return deshacer({ ...base, escrito: null, fase: 'crear', motivo: `No se ha podido crear el personaje: ${e?.message ?? e}` });
      }

      let g;
      try { g = await guardar({ ranura: slot, reemplazo: destino.reemplazo, lease, op: transaccion }); } catch (e) { g = { ok: false, motivo: e?.message ?? String(e) }; }
      let l;
      try { l = await Ranuras.leerRanuraCoordinada(slot); } catch (e) { l = { tipo: 'inaccesible', motivo: String(e?.message ?? e) }; }
      const c = cuadra(l, { runOrigen, T: transaccion, runDestino, cantidad }, { inicial: true });
      const exacto = !g?.texto || l.texto === g.texto;
      if (!g?.ok || !c.ok || !exacto) {
        return deshacer({ ...base, escrito: g?.texto ?? null, fase: 'guardar',
          motivo: g?.ok ? `Lo guardado no coincide con el personaje nuevo (${c.ok ? 'bytes distintos' : c.motivo}).` : `No se ha podido guardar el personaje nuevo: ${g?.motivo ?? 'error'}` });
      }

      // Confirmar. Si esta escritura falla, el sucesor ya existe y la
      // verificación lo terminará (no se devuelve nada).
      const fin = await cambiarLegado(runOrigen, { estado: 'reservado', transaccion }, {
        estado: 'aplicado', destinatario: runDestino, ranura: slot, bloqueo: null, aplicado: { cantidad, momento: Date.now() },
      });
      // (La ranura ya quedó ocupada por el sucesor en la misma transacción
      // que escribió sus bytes: no hay paso aparte que pueda quedarse a medias.)
      return { ok: true, cantidad, runDestino, ranura: slot, reemplazada: destino.reemplazo, confirmado: fin.ok, nota: fin.ok ? null : 'La entrega se terminará de apuntar al volver a abrir el juego.', texto: explicarLegado(v) };
    });
  }
}

/**
 * Crea una campaña NUEVA sin herencia, bajo el mismo candado global y con
 * las mismas reglas de ranura (libre, o reemplazo con permiso vigente).
 * Sin diario de herencia: una sola escritura; si falla, lo que hubiera sigue.
 */
export async function crearPartidaNueva({ runDestino, ranura = null, reemplazo = null, crear, guardar }) {
  if (!runDestino) return { ok: false, codigo: 'datos', motivo: 'Falta el run de la partida nueva.' };
  if (!Coordinacion.disponible()) return { ...SIN_COORDINACION, motivo: 'Este navegador no permite asegurar que dos pestañas no creen una partida en la misma ranura (falta Web Locks o IndexedDB).' };
  const op = `nueva-${runDestino}`;
  return conCaptura(() => Ranuras.conCandadoGlobal(async (lease) => {
    const destino = await Ranuras.reclamarDestino({ ranura, reemplazo, op, runDestino });
    if (!destino.ok) return destino;
    const slot = destino.ranura;
    const antes = bytesDe(slot);
    if (!antes.ok) { await Ranuras.soltarRanura(slot, op).catch(() => null); return { ok: false, codigo: 'almacenamiento', motivo: `No se puede leer la ranura ${slot}.` }; }
    const coord = await Ranuras.instantanea(slot);
    try {
      await crear({ ranura: slot });
    } catch (e) {
      await Ranuras.soltarRanura(slot, op).catch(() => null);
      return { ok: false, codigo: 'crear', motivo: `No se ha podido crear el personaje: ${e?.message ?? e}` };
    }
    let g;
    try { g = await guardar({ ranura: slot, reemplazo: destino.reemplazo, lease, op }); } catch (e) { g = { ok: false, motivo: e?.message ?? String(e) }; }
    let l;
    try { l = await Ranuras.leerRanuraCoordinada(slot); } catch (e) { l = { tipo: 'inaccesible', motivo: String(e?.message ?? e) }; }
    if (g?.ok && l.tipo === 'valida' && l.runId === runDestino && (!g.texto || l.texto === g.texto)) {
      return { ok: true, ranura: slot, runDestino, reemplazada: destino.reemplazo };
    }
    // Solo se retira lo propio (copia autoritativa y espejo), byte a byte.
    const intacta = await retirarPropio({ lease, ranura: slot, runId: runDestino, escrito: g?.texto ?? null, antes: coord, previos: antes.texto });
    if (intacta) await Ranuras.soltarRanura(slot, op).catch(() => null);
    return { ok: false, codigo: 'guardado', motivo: g?.ok ? 'Lo guardado no coincide con la partida nueva.' : `No se ha podido guardar la partida nueva: ${g?.motivo ?? 'error'}`,
      nota: intacta ? 'No se ha guardado ninguna partida nueva y la ranura sigue como estaba.' : `No puedo comprobar el estado de la ranura ${slot}; no la he tocado.` };
  }));
}

/**
 * El paso 4 tal como lo hacen la app y las pruebas: el sucesor nace por el
 * flujo normal de SU personaje (`player/crear`, con el run reservado) y la
 * herencia entra por el canal normal de experiencia, marcada con su origen.
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

export default {
  crearEnMotor, crearPartidaNueva, estadoLegado, cambiarLegado, listarLegados, legadosPendientes,
  verificarReserva, recuperarLegados, entregarLegado, nuevaTransaccion, usarCandados, PREFIJO_PARTIDA,
};
