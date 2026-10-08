/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCANVEIL · persistence/Ranuras.js
 * ---------------------------------------------------------------------------
 * Las ranuras de partida (`arcanveil:partida:<n>`) vistas con honestidad:
 * qué hay en cada una, sin confundir «no puedo leerla» con «está vacía», y
 * quién puede escribir dónde.
 *
 * Lecturas discriminadas (`leerRanura`):
 *   · `ausente`      → la clave no existe (comprobado);
 *   · `inaccesible`  → el navegador no deja leerla;
 *   · `ilegible`     → hay bytes, pero no son JSON;
 *   · `invalida`     → JSON, pero no un guardado que el juego pueda abrir
 *                      (se valida con la migración y la deserialización
 *                      reales, no con una forma inventada);
 *   · `valida`       → un guardado abrible, con su run.
 * `enumerarPartidas` dice también si NO se ha podido enumerar.
 *
 * Exclusión global (`conCandadoGlobal`): elegir ranura, reservarla y
 * escribir una campaña NUEVA (con o sin herencia) va bajo un candado Web
 * Locks único para todo el almacenamiento, que ESPERA (con tope) en vez de
 * fallar. Orden fijo: primero el candado de la herencia (si hay), después
 * este. Así dos creaciones nunca eligen la misma ranura libre.
 *
 * Una ranura ocupada solo se reemplaza con un permiso concreto: la ranura, el
 * run, la fecha de guardado y la huella de los bytes leídos al elegirla. Si
 * algo cambió desde entonces, el permiso caduca.
 *
 * Coherencia local, no antifraude.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import * as Ser from './Serializer.js';
import * as Mig from './Migrations.js';
import * as Registro from './RegistroRuns.js';
import * as Coordinacion from './Coordinacion.js';
import { crearEstadoInicial } from '../core/GameState.js';
import { PERSISTENCIA } from '../config/app.config.js';

export const PREFIJO = 'arcanveil:partida:';
export const CANDADO_GLOBAL = 'arcanveil:ranuras';

/** Para las pruebas: sustituir Web Locks (dos «pestañas» en un proceso). */
let candados = null;
export function usarCandados(c) { candados = c; }
export function proveedorCandados() {
  if (candados) return candados;
  try { return globalThis.navigator?.locks ?? null; } catch { return null; }
}

function almacen() {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

/** Las ranuras que el jugador usa (la automática no cuenta como sitio libre). */
export function ranurasManuales() {
  return Array.from({ length: PERSISTENCIA.ranuras }, (_, i) => String(i + 1));
}

/** Huella corta de unos bytes (para atar un permiso a lo que se leyó). */
export function huella(texto) {
  let h = 5381;
  const s = String(texto ?? '');
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return `${s.length.toString(36)}-${h.toString(36)}`;
}

/**
 * ¿Es un guardado que el juego puede abrir? Con la migración y la
 * deserialización de verdad.
 * @returns {{ok: true, estado: Object}|{ok: false, motivo: string}}
 */
export function validarGuardado(g) {
  if (!g || typeof g !== 'object' || Array.isArray(g)) return { ok: false, motivo: 'no es un guardado' };
  if (!Number.isInteger(g.version)) return { ok: false, motivo: 'no tiene versión de formato' };
  if (!g.estado || typeof g.estado !== 'object') return { ok: false, motivo: 'no tiene estado' };
  let mig;
  try { mig = Mig.migrar(structuredClone(g)); } catch (e) { return { ok: false, motivo: `no se puede migrar: ${e?.message ?? e}` }; }
  if (mig.error) return { ok: false, motivo: mig.error };
  let d;
  try { d = Ser.deserializar(mig.guardado, crearEstadoInicial()); } catch (e) { return { ok: false, motivo: `no se puede leer: ${e?.message ?? e}` }; }
  if (!d.valido) return { ok: false, motivo: d.error ?? 'guardado inválido' };
  const runId = d.estado?.meta?.runId;
  if (typeof runId !== 'string' || !runId) return { ok: false, motivo: 'no dice de qué partida es' };
  if (!d.estado.player || typeof d.estado.player !== 'object') return { ok: false, motivo: 'no tiene personaje' };
  return { ok: true, estado: d.estado };
}

/**
 * Lee una ranura y dice exactamente qué hay.
 * @param {string} ranura
 */
export function leerRanura(ranura) {
  const a = almacen();
  if (!a) return { tipo: 'inaccesible', ranura, motivo: 'el navegador no deja usar el almacenamiento' };
  let texto;
  try { texto = a.getItem(`${PREFIJO}${ranura}`); } catch (e) { return { tipo: 'inaccesible', ranura, motivo: `no se puede leer (${e?.message ?? e})` }; }
  if (texto === null || texto === undefined) return { tipo: 'ausente', ranura };
  const { objeto, error } = Ser.parsearSeguro(String(texto));
  if (error) return { tipo: 'ilegible', ranura, texto, huella: huella(texto), motivo: 'no es JSON válido' };
  const v = validarGuardado(objeto);
  if (!v.ok) return { tipo: 'invalida', ranura, texto, huella: huella(texto), motivo: `no es una partida que se pueda abrir: ${v.motivo}` };
  return { tipo: 'valida', ranura, texto, huella: huella(texto), guardado: objeto, estado: v.estado, runId: v.estado.meta.runId, guardadoEn: objeto.guardadoEn ?? null };
}

/**
 * Las ranuras con partida, o por qué no se ha podido saber.
 * @returns {{ok: true, ranuras: string[]}|{ok: false, motivo: string}}
 */
export function enumerarPartidas() {
  const a = almacen();
  if (!a) return { ok: false, motivo: 'el navegador no deja usar el almacenamiento' };
  try {
    const n = a.length;
    if (!Number.isInteger(n) || n < 0) return { ok: false, motivo: 'el almacenamiento no dice cuántas claves tiene' };
    const ranuras = [];
    for (let i = 0; i < n; i++) {
      const k = a.key(i);
      if (k === null || k === undefined) return { ok: false, motivo: 'el almacenamiento cambió mientras se leía' };
      if (k.startsWith(PREFIJO)) ranuras.push(k.slice(PREFIJO.length));
    }
    return { ok: true, ranuras: ranuras.sort() };
  } catch (e) {
    return { ok: false, motivo: `no se pueden enumerar las partidas (${e?.message ?? e})` };
  }
}

/**
 * Ventana de propagación entre pestañas: lo que otra pestaña acaba de
 * escribir en `localStorage` puede tardar en verse aquí. Un registro
 * reciente de IndexedDB manda sobre una ranura que aquí aún parece vacía.
 */
export const VENTANA_PROPAGACION_MS = 30000;

/** Ranuras apartadas por entregas de herencia sin cerrar (diario coordinado). */
async function reservadasPorEntregas() {
  const s = new Map();
  for (const [run, f] of await Coordinacion.listar(Coordinacion.ALMACENES.LEGADOS)) {
    if (f?.estado === 'reservado' && f.reserva?.ranura) s.set(String(f.reserva.ranura), run);
  }
  return s;
}

/** El registro coordinado de ranuras de campañas nuevas. */
async function registroRanuras() {
  return new Map(await Coordinacion.listar(Coordinacion.ALMACENES.RANURAS));
}

/** Herencias (vista mínima) para describir el vínculo de una campaña. */
async function estadosDeHerencia() {
  const m = new Map(Object.entries(Registro.legados()).map(([k, v]) => [k, v?.estado ?? 'pendiente']));
  for (const [k, v] of await Coordinacion.listar(Coordinacion.ALMACENES.LEGADOS)) m.set(k, v?.estado ?? 'pendiente');
  return m;
}

/**
 * Qué hay en cada ranura manual, para elegir o reemplazar. Mezcla lo que se
 * ve en `localStorage` con el registro coordinado (IndexedDB): una ranura que
 * otra pestaña acaba de ocupar o está ocupando no sale como libre aunque aquí
 * aún no se vean sus bytes.
 */
export async function ocupacion({ ahora = Date.now() } = {}) {
  const [reservas, registro, herencias] = await Promise.all([reservadasPorEntregas(), registroRanuras(), estadosDeHerencia()]);
  return ranurasManuales().map((ranura) => {
    const l = leerRanura(ranura);
    const r = registro.get(ranura);
    // Apartada por una entrega sin cerrar: manda sobre lo que haya dentro
    // (aunque esté dañado, es la prueba que hay que poder volver a comprobar).
    if (reservas.has(ranura)) return { ranura, estado: 'reservada', motivo: 'apartada por una entrega de herencia sin cerrar', runId: l.runId ?? null };
    if (l.tipo === 'ausente') {
      if (r && ahora - (r.momento ?? 0) < VENTANA_PROPAGACION_MS) return { ranura, estado: 'reservada', motivo: 'otra pestaña acaba de crear una partida aquí', runId: r.runId ?? null, registro: r };
      return { ranura, estado: 'libre', registro: r ?? null };
    }
    if (l.tipo !== 'valida') return { ranura, estado: l.tipo === 'inaccesible' ? 'inaccesible' : 'ilegible', huella: l.huella ?? null, motivo: l.motivo, registro: r ?? null };
    const p = l.estado.player ?? {};
    const runId = l.runId;
    const suya = herencias.get(runId);
    const vinculo = [
      p.legadoRecibido ? `heredó ${p.legadoRecibido.xp} XP de ${p.legadoRecibido.nombreOrigen ?? 'otro personaje'}` : null,
      suya === 'pendiente' ? 'su herencia está pendiente' : null,
      suya === 'aplicado' ? 'su herencia ya la recibió otro' : null,
    ].filter(Boolean).join(' · ');
    return {
      ranura, estado: 'ocupada', runId, huella: l.huella, registro: r ?? null,
      nombre: p.nombre ?? l.guardado.cabecera?.nombre ?? 'Sin nombre', nivel: p.nivel ?? null,
      guardadoEn: l.guardadoEn, muerto: Boolean(l.estado.meta?.muerte) || Registro.estaMuerto(runId), vinculo,
    };
  });
}

/** La primera ranura manual libre, o null. NUNCA la más antigua. */
export async function ranuraLibre(ocup = null) {
  return (ocup ?? await ocupacion()).find((o) => o.estado === 'libre')?.ranura ?? null;
}

/**
 * Lo mismo, solo con lo que se ve aquí (síncrono, sin coordinar). Para la
 * partida que se guarda sin ranura asignada: nunca la más antigua.
 */
export function ranuraLibreLocal() {
  return ranurasManuales().find((n) => leerRanura(n).tipo === 'ausente') ?? null;
}

/**
 * Elige o comprueba (bajo el candado global) dónde va una campaña NUEVA, y
 * la RECLAMA en el registro coordinado en la misma operación: otra pestaña
 * ya no la verá libre aunque su `localStorage` vaya con retraso.
 *
 * @param {{ranura?: string|null, reemplazo?: Object|null, op: string, runDestino: string}} pedido
 */
export async function reclamarDestino({ ranura = null, reemplazo = null, op, runDestino }) {
  const ocup = await ocupacion();
  let elegida;
  let permiso = null;
  if (!ranura) {
    elegida = await ranuraLibre(ocup);
    if (!elegida) return { ok: false, codigo: 'sin-ranura', motivo: 'No queda ninguna ranura libre. Elige qué campaña reemplazar, o cancela.', campanas: ocup };
  } else {
    const o = ocup.find((x) => x.ranura === String(ranura));
    if (!o) return { ok: false, codigo: 'ranura-invalida', motivo: `No existe la ranura ${ranura}.` };
    if (o.estado === 'reservada') return { ok: false, codigo: 'ranura-ocupada', motivo: `La ranura ${ranura}: ${o.motivo ?? 'está apartada'}.` };
    if (o.estado === 'inaccesible') return { ok: false, codigo: 'ranura-ocupada', motivo: `No se puede leer la ranura ${ranura}: no se escribe encima.` };
    if (o.estado !== 'libre') {
      if (!reemplazo || String(reemplazo.ranura) !== o.ranura) {
        return { ok: false, codigo: 'ranura-ocupada', motivo: `La ranura ${ranura} ya es de otra campaña${o.nombre ? ` (${o.nombre})` : ''}: no se escribe encima sin elegirla para reemplazar.`, campana: o };
      }
      const coincide = (reemplazo.runId ?? null) === (o.runId ?? null)
        && (reemplazo.guardadoEn ?? null) === (o.guardadoEn ?? null)
        && (!reemplazo.huella || reemplazo.huella === o.huella)
        // Lo creado hace poco en otra pestaña manda sobre lo que se ve aquí.
        && (!o.registro || o.registro.runId === (o.runId ?? null));
      if (!coincide) return { ok: false, codigo: 'permiso-caducado', motivo: `La ranura ${ranura} ha cambiado desde que la elegiste: vuelve a elegir.`, campana: o };
      permiso = { ranura: o.ranura, runId: o.runId ?? null, guardadoEn: o.guardadoEn ?? null, huella: o.huella ?? null };
    }
    elegida = o.ranura;
  }
  // La reclamación, atómica y coordinada: si el registro cambió desde que
  // se miró, otra pestaña se adelantó.
  let porque = null;
  const visto = ocup.find((x) => x.ranura === elegida)?.registro ?? null;
  const r = await Coordinacion.cas(Coordinacion.ALMACENES.RANURAS, elegida, (actual) => {
    if (JSON.stringify(actual ?? null) !== JSON.stringify(visto)) { porque = 'otra pestaña acaba de usar esa ranura'; return null; }
    return { nuevo: { estado: 'reservada', op, runId: runDestino, momento: Date.now(), reemplaza: permiso } };
  });
  if (!r.cambiado) return { ok: false, codigo: 'ranura-ocupada', motivo: `La ranura ${elegida}: ${porque ?? 'no se ha podido reclamar'}.` };
  return { ok: true, ranura: elegida, reemplazo: permiso };
}

/** La campaña quedó escrita: la ranura pasa a ocupada por ese run. */
export async function confirmarRanura(ranura, op, runId) {
  return Coordinacion.cas(Coordinacion.ALMACENES.RANURAS, ranura, (actual) => (actual?.op === op ? { nuevo: { estado: 'ocupada', runId, momento: Date.now() } } : null));
}

/** No se llegó a escribir nada propio: se suelta la reclamación (solo la nuestra). */
export async function soltarRanura(ranura, op) {
  return Coordinacion.cas(Coordinacion.ALMACENES.RANURAS, ranura, (actual) => (actual?.op === op ? { borrar: true } : null));
}

/** La campaña se borró conscientemente: la ranura queda libre en el registro. */
export async function liberarRegistro(ranura) {
  if (!Coordinacion.disponible()) return null;
  return Coordinacion.cas(Coordinacion.ALMACENES.RANURAS, String(ranura), (actual) => (actual ? { borrar: true } : null));
}

/**
 * Ejecuta `fn` con el candado global de ranuras. Espera a que lo suelte otra
 * pestaña (con tope); sin Web Locks no se puede asegurar y se dice.
 */
export async function conCandadoGlobal(fn, { espera = 15000 } = {}) {
  const locks = proveedorCandados();
  if (!locks?.request) {
    return { ok: false, codigo: 'sin-exclusion', motivo: 'Este navegador no permite asegurar que dos pestañas no creen una partida en la misma ranura. Usa un navegador actual (Chrome, Edge, Firefox o Safari recientes) o una sola pestaña sin crear partidas nuevas.' };
  }
  const signal = typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(espera) : undefined;
  try {
    return await locks.request(CANDADO_GLOBAL, signal ? { signal } : {}, async () => fn());
  } catch (e) {
    if (e?.name === 'AbortError' || e?.name === 'TimeoutError') return { ok: false, codigo: 'ocupado-global', motivo: 'Otra pestaña está creando una partida ahora mismo. Vuelve a intentarlo en un momento.' };
    throw e;
  }
}

/**
 * ¿Puede ESTA partida (run) escribir en esa ranura? Para el guardado normal:
 * actualizar la misma campaña sí; escribir encima de otra, no (salvo un
 * permiso de reemplazo que siga vigente).
 * @returns {{ok: true}|{ok: false, motivo: string}}
 */
export function puedeEscribir(ranura, runId, reemplazo = null) {
  // Camino corto del caso de siempre (guardar la misma campaña cada turno):
  // si la ranura dice ser de este run, no hace falta validarla entera.
  try {
    const t = almacen()?.getItem(`${PREFIJO}${ranura}`);
    if (t === null) return { ok: true };
    if (runId && JSON.parse(t)?.estado?.meta?.runId === runId) return { ok: true };
  } catch { /* abajo, con la lectura completa */ }
  const l = leerRanura(ranura);
  if (l.tipo === 'ausente') return { ok: true };
  if (l.tipo === 'valida' && l.runId === runId) return { ok: true };
  const permiso = reemplazo && String(reemplazo.ranura) === String(ranura)
    && (reemplazo.runId ?? null) === (l.runId ?? null)
    && (l.tipo === 'valida' ? (reemplazo.guardadoEn ?? null) === (l.guardadoEn ?? null) : true)
    && (!reemplazo.huella || reemplazo.huella === l.huella);
  if (permiso && l.tipo !== 'inaccesible') return { ok: true };
  if (l.tipo === 'valida') {
    const nombre = l.estado.player?.nombre ?? 'otra partida';
    return { ok: false, motivo: `La ranura ${ranura} ahora es de otra partida (${nombre}). No se ha guardado encima: tu partida sigue abierta; guárdala en otra ranura desde el menú.` };
  }
  return { ok: false, motivo: `La ranura ${ranura} tiene datos que no se pueden leer (${l.motivo}). No se escribe encima.` };
}

export default { PREFIJO, CANDADO_GLOBAL, VENTANA_PROPAGACION_MS, usarCandados, ranurasManuales, huella, validarGuardado, leerRanura, enumerarPartidas, ocupacion, ranuraLibre, ranuraLibreLocal, reclamarDestino, confirmarRanura, soltarRanura, liberarRegistro, conCandadoGlobal, puedeEscribir };
