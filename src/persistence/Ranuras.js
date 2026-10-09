/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCANVEIL · persistence/Ranuras.js
 * ---------------------------------------------------------------------------
 * Las ranuras de partida: de quién es cada una, en qué revisión va y qué
 * bytes valen, con una sola regla para TODOS los que escriben.
 *
 * AUTORIDAD (IndexedDB, `Coordinacion`):
 *   · `ranuras[n]`  → dueño y revisión: `{estado: 'ocupada', runId, rev}`,
 *                     `{estado: 'reservada', op, runId, previo}` mientras una
 *                     creación la tiene apartada, o `{estado: 'borrada'}`
 *                     (lápida: lo borrado no se resucita desde una caché).
 *   · `partidas[n]` → los bytes autoritativos de esa revisión.
 *   `localStorage` (`arcanveil:partida:<n>`) es un ESPEJO: se escribe después,
 *   sirve para listar sin esperar y para compatibilidad. Si va atrasado o
 *   miente (caché vieja de otra pestaña), manda IndexedDB.
 *
 * ESCRIBIR (`escribirPartida`), siempre bajo el candado GLOBAL de Web Locks y
 * en UNA transacción coordinada sobre `ranuras[n]` + `partidas[n]`:
 *   · ocupada por OTRO run → no (aunque los bytes locales digan lo contrario);
 *   · ocupada por el mismo run → sí, si la revisión en la que se basa es la
 *     vigente (otra pestaña del mismo run no queda tapada por una vieja); un
 *     token repetido no crea otra revisión;
 *   · reservada → solo la operación que la reservó;
 *   · libre (sin registro, sin bytes y sin lápida) → la escritura la ocupa;
 *   · sin registro pero con bytes de antes del #8 → se importa (una vez) y se
 *     aplica la regla de dueño.
 *
 * TOKEN DE OPERACIÓN (#9). Quien pasa un `token` nombra UNA operación
 * inmutable: esa ranura, ese run, esa operación y ESE contenido. Su recibo
 * vive en `operaciones[token]` (coordinado, global a todas las ranuras):
 *   · mismo token, misma identidad y mismo contenido, y su revisión sigue
 *     siendo la vigente → «repetido»: no se escribe nada y se devuelven los
 *     bytes y la revisión AUTORITATIVOS (los de la primera vez);
 *   · mismo token con otro contenido, otra ranura, otro run u otra
 *     operación → `token-contenido` (conflicto): nada cambia;
 *   · mismo token cuya revisión ya no es la vigente (después hubo otro
 *     guardado) → `token-superado`: no se reaplica ni se tapa lo posterior;
 *   · el recibo de una escritura que se deshizo (falló el espejo) guarda su
 *     contenido canónico: con el MISMO contenido se puede rehacer; con otro,
 *     conflicto. Una escritura que no llegó a confirmarse no deja recibo.
 * «Mismo contenido» = el guardado entero salvo `guardadoEn` y `firma`
 * (metadatos de la escritura, que cambian en cada serialización), con las
 * claves ordenadas: comparación EXACTA de esos bytes canónicos, no de una
 * huella. Turno, XP, inventario, vida, combate o cualquier otro campo
 * distinto es contenido distinto.
 *
 * LOS RECIBOS SON DURABLES (#10). No se borran nunca: el token es opaco y,
 * sin su recibo, «nunca usado» y «usado hace mucho» serían indistinguibles
 * (en el #9 una poda de los 200 más recientes volvía a aceptar un token
 * superado como operación NUEVA). Coste: un recibo por guardado CON token
 * (~150 B; los «deshechos» guardan además su contenido canónico, del tamaño
 * de una partida, hasta que se rehacen). La interfaz no usa tokens: solo
 * crece con quien los pasa por la API. Sin compactación: almacenamiento NO
 * acotado para ese uso. Un token cuyo recibo ya borró la poda del #9 no se
 * puede reconocer (no queda evidencia): ese límite es anterior a esta versión.
 * No hay estado «pendiente»: recibo, dueño y bytes se escriben en UNA
 * transacción; una escritura no confirmada no deja recibo (no se usó).
 *
 * El candado global se pide UNA vez por operación. Quien ya lo tiene (una
 * creación que guarda dentro) pasa su «arriendo»: un objeto que solo existe
 * mientras el candado está tomado; no hay atajo por bandera.
 *
 * Lecturas discriminadas (ausente / inaccesible / ilegible / inválida /
 * válida), también para la copia autoritativa. Coherencia LOCAL, no
 * antifraude.
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
export const RANURA_AUTO = 'auto';
const R = Coordinacion.ALMACENES.RANURAS;
const P = Coordinacion.ALMACENES.PARTIDAS;
const O = Coordinacion.ALMACENES.OPERACIONES;

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

/** Huella corta de unos bytes (para atar un permiso o una comprobación). */
export function huella(texto) {
  let h = 5381;
  const s = String(texto ?? '');
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return `${s.length.toString(36)}-${h.toString(36)}`;
}

/* ── el candado global y su arriendo ────────────────────────────────────── */

const arriendos = new Set();

/** ¿Este arriendo es de un candado global tomado AHORA en esta pestaña? */
export function leaseValido(lease) {
  return Boolean(lease && arriendos.has(lease) && lease.activo === true);
}

/**
 * Ejecuta `fn(lease)` con el candado global de ranuras. Espera a que lo
 * suelte otra pestaña (con tope); sin Web Locks o sin estado coordinado no se
 * puede asegurar y se dice.
 */
export async function conCandadoGlobal(fn, { espera = 15000 } = {}) {
  const locks = proveedorCandados();
  if (!locks?.request || !Coordinacion.disponible()) {
    return { ok: false, exito: false, codigo: 'sin-exclusion', motivo: 'Este navegador no permite coordinar el guardado entre pestañas (falta Web Locks o IndexedDB): no se escribe sin coordinar.' };
  }
  const signal = typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(espera) : undefined;
  try {
    return await locks.request(CANDADO_GLOBAL, signal ? { signal } : {}, async () => {
      const lease = { id: `arriendo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, activo: true };
      arriendos.add(lease);
      try { return await fn(lease); } finally { lease.activo = false; arriendos.delete(lease); }
    });
  } catch (e) {
    if (e?.name === 'AbortError' || e?.name === 'TimeoutError') return { ok: false, exito: false, codigo: 'ocupado-global', motivo: 'Otra pestaña está guardando o creando una partida ahora mismo. Vuelve a intentarlo en un momento.' };
    throw e;
  }
}

/* ── lecturas ───────────────────────────────────────────────────────────── */

/**
 * ¿Es un guardado que el juego puede abrir? Con la migración y la
 * deserialización de verdad.
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

/** Clasifica unos bytes ya leídos. */
function clasificar(ranura, texto, extra = {}) {
  if (texto === null || texto === undefined) return { tipo: 'ausente', ranura, ...extra };
  const { objeto, error } = Ser.parsearSeguro(String(texto));
  if (error) return { tipo: 'ilegible', ranura, texto, huella: huella(texto), motivo: 'no es JSON válido', ...extra };
  const v = validarGuardado(objeto);
  if (!v.ok) return { tipo: 'invalida', ranura, texto, huella: huella(texto), motivo: `no es una partida que se pueda abrir: ${v.motivo}`, ...extra };
  return { tipo: 'valida', ranura, texto, huella: huella(texto), guardado: objeto, estado: v.estado, runId: v.estado.meta.runId, guardadoEn: objeto.guardadoEn ?? null, ...extra };
}

/** Lo que dice el ESPEJO local (`localStorage`), sin coordinar. */
export function leerRanura(ranura) {
  const a = almacen();
  if (!a) return { tipo: 'inaccesible', ranura, motivo: 'el navegador no deja usar el almacenamiento' };
  let texto;
  try { texto = a.getItem(`${PREFIJO}${ranura}`); } catch (e) { return { tipo: 'inaccesible', ranura, motivo: `no se puede leer (${e?.message ?? e})` }; }
  return clasificar(ranura, texto, { fuente: 'local' });
}

/** Dueño y revisión coordinados de una ranura (o undefined). */
export async function duenoRanura(ranura) {
  return Coordinacion.leer(R, String(ranura));
}

/**
 * Lo que vale de una ranura: la copia AUTORITATIVA si la hay; si la ranura
 * no está coordinada (de antes del #8), el espejo local.
 */
export async function leerRanuraCoordinada(ranura) {
  const n = String(ranura);
  const [rec, snap] = await Promise.all([Coordinacion.leer(R, n), Coordinacion.leer(P, n)]);
  if (rec?.estado === 'borrada') return { tipo: 'ausente', ranura: n, fuente: 'coordinada', registro: rec };
  // Reservada sin copia: una creación en curso (o una del #7, que escribía
  // primero la ranura local): se adjunta lo que diga el espejo.
  if (rec?.estado === 'reservada' && !snap) return { tipo: 'reservada', ranura: n, fuente: 'coordinada', registro: rec, local: leerRanura(n) };
  if (snap) {
    const l = clasificar(n, snap.texto, { fuente: 'coordinada', registro: rec ?? null, rev: snap.rev ?? null });
    return l;
  }
  if (rec) return { tipo: 'inaccesible', ranura: n, fuente: 'coordinada', registro: rec, motivo: 'el registro dice que tiene dueño, pero falta su copia' };
  return { ...leerRanura(n), legado: true };
}

/**
 * Las ranuras con partida, o por qué no se ha podido saber: las coordinadas
 * y las de antes del #8 que solo están en el espejo local.
 * @returns {Promise<{ok: true, ranuras: string[]}|{ok: false, motivo: string}>}
 */
export async function enumerarPartidas() {
  const a = almacen();
  if (!a) return { ok: false, motivo: 'el navegador no deja usar el almacenamiento' };
  const ranuras = new Set();
  try {
    for (const [k] of await Coordinacion.listar(P)) ranuras.add(String(k));
  } catch (e) {
    return { ok: false, motivo: `no se puede leer el estado compartido (${e?.message ?? e})` };
  }
  try {
    const n = a.length;
    if (!Number.isInteger(n) || n < 0) return { ok: false, motivo: 'el almacenamiento no dice cuántas claves tiene' };
    for (let i = 0; i < n; i++) {
      const k = a.key(i);
      if (k === null || k === undefined) return { ok: false, motivo: 'el almacenamiento cambió mientras se leía' };
      if (k.startsWith(PREFIJO)) ranuras.add(k.slice(PREFIJO.length));
    }
  } catch (e) {
    return { ok: false, motivo: `no se pueden enumerar las partidas (${e?.message ?? e})` };
  }
  return { ok: true, ranuras: [...ranuras].sort() };
}

/* ── ocupación y reclamo ────────────────────────────────────────────────── */

/** Ranuras apartadas por entregas de herencia sin cerrar (diario coordinado). */
async function reservadasPorEntregas() {
  const s = new Map();
  for (const [run, f] of await Coordinacion.listar(Coordinacion.ALMACENES.LEGADOS)) {
    if (f?.estado === 'reservado' && f.reserva?.ranura) s.set(String(f.reserva.ranura), run);
  }
  return s;
}

/** Herencias y muertes (vista mínima) para describir una campaña. */
async function contexto() {
  const herencias = new Map(Object.entries(Registro.legados()).map(([k, v]) => [k, v?.estado ?? 'pendiente']));
  for (const [k, v] of await Coordinacion.listar(Coordinacion.ALMACENES.LEGADOS)) herencias.set(k, v?.estado ?? 'pendiente');
  const muertos = new Set(Object.keys(Registro.runsMuertos()));
  for (const [k] of await Coordinacion.listar(Coordinacion.ALMACENES.MUERTOS)) muertos.add(k);
  return { herencias, muertos };
}

/**
 * Qué hay en cada ranura manual, para elegir o reemplazar. Manda el registro
 * coordinado; las ranuras sin registro (de antes del #8) se leen del espejo.
 * La ocupación es DURABLE: no caduca con el tiempo.
 */
export async function ocupacion() {
  const [reservas, registros, copias, ctx] = await Promise.all([
    reservadasPorEntregas(), Coordinacion.listar(R).then((l) => new Map(l)), Coordinacion.listar(P).then((l) => new Map(l)), contexto(),
  ]);
  return ranurasManuales().map((ranura) => {
    const rec = registros.get(ranura) ?? null;
    const snap = copias.get(ranura) ?? null;
    if (reservas.has(ranura)) return { ranura, estado: 'reservada', motivo: 'apartada por una entrega de herencia sin cerrar', registro: rec };
    if (rec?.estado === 'reservada') return { ranura, estado: 'reservada', motivo: 'otra pestaña está creando una partida aquí', registro: rec, runId: rec.runId ?? null };
    let l;
    if (rec?.estado === 'borrada' || (!rec && !snap && leerRanura(ranura).tipo === 'ausente')) return { ranura, estado: 'libre', registro: rec };
    if (snap) l = clasificar(ranura, snap.texto, { rev: snap.rev ?? null });
    else if (rec) return { ranura, estado: 'inaccesible', motivo: 'el registro dice que tiene dueño, pero falta su copia', registro: rec };
    else l = leerRanura(ranura);
    if (l.tipo === 'ausente') return { ranura, estado: 'libre', registro: rec };
    if (l.tipo !== 'valida') return { ranura, estado: l.tipo === 'inaccesible' ? 'inaccesible' : 'ilegible', huella: l.huella ?? null, motivo: l.motivo, registro: rec, rev: rec?.rev ?? null };
    const p = l.estado.player ?? {};
    const runId = l.runId;
    const suya = ctx.herencias.get(runId);
    const vinculo = [
      p.legadoRecibido ? `heredó ${p.legadoRecibido.xp} XP de ${p.legadoRecibido.nombreOrigen ?? 'otro personaje'}` : null,
      suya === 'pendiente' ? 'su herencia está pendiente' : null,
      suya === 'aplicado' ? 'su herencia ya la recibió otro' : null,
    ].filter(Boolean).join(' · ');
    return {
      ranura, estado: 'ocupada', runId, huella: l.huella, registro: rec, rev: rec?.rev ?? null,
      nombre: p.nombre ?? l.guardado.cabecera?.nombre ?? 'Sin nombre', nivel: p.nivel ?? null,
      guardadoEn: l.guardadoEn, muerto: Boolean(l.estado.meta?.muerte) || ctx.muertos.has(runId), vinculo,
    };
  });
}

/** La primera ranura manual libre, o null. NUNCA la más antigua. */
export async function ranuraLibre(ocup = null) {
  return (ocup ?? await ocupacion()).find((o) => o.estado === 'libre')?.ranura ?? null;
}

/**
 * La primera ranura manual libre según el ESPEJO local (sin esperar), o
 * null; nunca la más antigua. Solo informativa (listados): no autoriza
 * ninguna escritura, que decide siempre el registro coordinado.
 */
export function ranuraLibreLocal() {
  return ranurasManuales().find((n) => leerRanura(n).tipo === 'ausente') ?? null;
}

/**
 * Elige o comprueba (bajo el candado global) dónde va una campaña NUEVA y la
 * RECLAMA en el registro coordinado: queda «reservada» para esa operación
 * (con lo que hubiera antes guardado en `previo`, para poder devolverlo).
 *
 * El permiso de reemplazo se compara con el dueño y la REVISIÓN vigentes del
 * registro (y, para ranuras de antes del #8, con lo que se ve): un permiso
 * leído de una caché vieja no vale.
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
    if (o.estado === 'inaccesible') return { ok: false, codigo: 'ranura-ocupada', motivo: `No se puede comprobar la ranura ${ranura}: no se escribe encima.` };
    if (o.estado !== 'libre') {
      if (!reemplazo || String(reemplazo.ranura) !== o.ranura) {
        return { ok: false, codigo: 'ranura-ocupada', motivo: `La ranura ${ranura} ya es de otra campaña${o.nombre ? ` (${o.nombre})` : ''}: no se escribe encima sin elegirla para reemplazar.`, campana: o };
      }
      const coincide = (reemplazo.runId ?? null) === (o.runId ?? null)
        && (reemplazo.guardadoEn ?? null) === (o.guardadoEn ?? null)
        && (!reemplazo.huella || reemplazo.huella === o.huella)
        && ((reemplazo.rev ?? null) === (o.rev ?? null));
      if (!coincide) return { ok: false, codigo: 'permiso-caducado', motivo: `La ranura ${ranura} ha cambiado desde que la elegiste: vuelve a elegir.`, campana: o };
      permiso = { ranura: o.ranura, runId: o.runId ?? null, guardadoEn: o.guardadoEn ?? null, huella: o.huella ?? null, rev: o.rev ?? null };
    }
    elegida = o.ranura;
  }
  let porque = null;
  const visto = ocup.find((x) => x.ranura === elegida)?.registro ?? null;
  const r = await Coordinacion.cas(R, elegida, (actual) => {
    if (JSON.stringify(actual ?? null) !== JSON.stringify(visto)) { porque = 'otra pestaña acaba de usar esa ranura'; return null; }
    return { nuevo: { estado: 'reservada', op, runId: runDestino, momento: Date.now(), reemplaza: permiso, previo: actual ?? null } };
  });
  if (!r.cambiado) return { ok: false, codigo: 'ranura-ocupada', motivo: `La ranura ${elegida}: ${porque ?? 'no se ha podido reclamar'}.` };
  return { ok: true, ranura: elegida, reemplazo: permiso };
}

/**
 * No se llegó a escribir nada propio: se suelta la reclamación (solo la
 * nuestra) y vuelve lo que hubiera antes.
 */
export async function soltarRanura(ranura, op) {
  return Coordinacion.cas(R, String(ranura), (actual) => {
    if (actual?.estado !== 'reservada' || actual.op !== op) return null;
    return actual.previo ? { nuevo: actual.previo } : { borrar: true };
  });
}

/* ── escribir ───────────────────────────────────────────────────────────── */

/**
 * Escribe una partida en su ranura, coordinadamente. SOLO bajo el candado
 * global (con su arriendo). Ver la regla en la cabecera.
 *
 * @param {Object} p
 * @param {Object} p.lease Arriendo del candado global.
 * @param {string} p.ranura
 * @param {string} p.runId El run de la foto que se escribe.
 * @param {string} p.texto Los bytes.
 * @param {string} [p.op] Operación que reservó la ranura (creación).
 * @param {number|null} [p.revBase] Revisión en la que se basa (si se conoce).
 * @param {string} [p.token] Para que un reintento no cree otra revisión.
 * @param {boolean} [p.compartida] La ranura automática (de cualquiera).
 * @returns {Promise<{ok: true, rev: number, repetido?: boolean}|{ok: false, codigo: string, motivo: string}>}
 */
export async function escribirPartida({ lease, ranura, runId, texto, op = null, revBase = null, token = null, compartida = false, guardadoEn = Date.now() }) {
  if (!leaseValido(lease)) return { ok: false, codigo: 'sin-candado', motivo: 'Escritura sin el candado global: no se hace.' };
  const n = String(ranura);
  // Una ranura sin registro con bytes de antes del #8: se importa una vez
  // (el espejo local es lo único que hay de ella).
  const local = leerRanura(n);
  const canonico = token ? contenidoCanonico(texto) : null;
  if (token && canonico === null) return { ok: false, codigo: 'datos', motivo: 'Lo que se iba a guardar no es un guardado legible: no se escribe.' };
  let motivo = null;
  let codigo = null;
  let repetido = null;

  /** La decisión de siempre (dueño, revisión, reserva, lápida): [rec, snap] nuevos o null. */
  const decidir = (rec, snap) => {
    let base = rec;
    if (!base && !snap && local.tipo === 'valida') base = { estado: 'ocupada', runId: local.runId, rev: 0, importada: true };
    if (!base && !snap && (local.tipo === 'ilegible' || local.tipo === 'invalida' || local.tipo === 'inaccesible') && !compartida) {
      codigo = 'ranura-ilegible'; motivo = `La ranura ${n} tiene datos que no se pueden leer (${local.motivo}). No se escribe encima.`; return null;
    }
    const copia = (rev) => ({ runId, rev, texto, huella: huella(texto), guardadoEn });
    if (compartida) {
      // La automática es de todos: se ordena por revisión, sin dueño.
      const rev = (base?.rev ?? 0) + 1;
      return [{ estado: 'ocupada', runId, rev, compartida: true, momento: Date.now() }, copia(rev)];
    }
    if (!base || base.estado === 'borrada') {
      // Lo que el jugador borró no lo resucita un guardado tardío de esa
      // misma campaña (sí puede ocuparla otra, o una creación).
      if (base?.estado === 'borrada' && base.runId && base.runId === runId && !op) { codigo = 'borrada'; motivo = `La ranura ${n} se borró: esta partida ya no está guardada ahí y no se ha recreado. Puedes seguir jugando en esta pestaña, pero lo que juegues no se guardará.`; return null; }
      if (snap) { codigo = 'otro-dueno'; motivo = `La ranura ${n} no tiene un dueño claro. No se escribe encima.`; return null; }
      // Libre de verdad: la escritura la ocupa (la revisión sigue subiendo).
      const rev = (base?.rev ?? 0) + 1;
      return [{ estado: 'ocupada', runId, rev, momento: Date.now() }, copia(rev)];
    }
    if (base.estado === 'reservada') {
      if (!op || base.op !== op || base.runId !== runId) { codigo = 'otro-dueno'; motivo = `La ranura ${n} está apartada por otra operación: no se escribe encima.`; return null; }
      const rev = (base.previo?.rev ?? 0) + 1;
      return [{ estado: 'ocupada', runId, rev, momento: Date.now(), creadaPor: op }, copia(rev)];
    }
    if (base.runId !== runId) {
      codigo = 'otro-dueno';
      motivo = `La ranura ${n} ahora es de otra partida (se ha usado desde otra pestaña). No se ha guardado encima. Esta partida sigue abierta aquí, pero ya no se guarda: si sales, se pierde lo jugado desde su último guardado.`;
      return null;
    }
    if (revBase !== null && revBase !== undefined && revBase !== base.rev) {
      codigo = 'revision';
      motivo = `Esta campaña se ha guardado desde otra pestaña después (revisión ${base.rev}, aquí ${revBase}). No se ha tapado: recarga para seguir desde la más reciente.`;
      return null;
    }
    const rev = (base.rev ?? 0) + 1;
    const { importada, ...resto } = base;
    void importada;
    return [{ ...resto, estado: 'ocupada', runId, rev, momento: Date.now() }, copia(rev)];
  };

  const claves = token ? [[R, n], [P, n], [O, token]] : [[R, n], [P, n]];
  const r = await Coordinacion.casVarios(claves, ([rec, snap, recibo]) => {
    if (token && recibo) {
      const mismaIdentidad = recibo.ranura === n && recibo.runId === runId && (recibo.op ?? null) === (op ?? null);
      if (!mismaIdentidad) {
        codigo = 'token-contenido';
        motivo = `Esa operación (${token}) ya se usó para otra partida u otra ranura (${recibo.runId} en la ${recibo.ranura}). No se ha guardado nada.`;
        return null;
      }
      if (recibo.estado === 'hecho') {
        if (!rec || rec.rev !== recibo.rev || !snap || snap.rev !== recibo.rev) {
          codigo = 'token-superado';
          motivo = `Esa operación ya se guardó (revisión ${recibo.rev}) y después hubo otro guardado: no se vuelve a aplicar ni se tapa lo posterior.`;
          return null;
        }
        if (contenidoCanonico(snap.texto) !== canonico) {
          codigo = 'token-contenido';
          motivo = `Esa operación ya guardó otro contenido (revisión ${recibo.rev}). Lo nuevo NO se ha guardado: hace falta una operación nueva.`;
          return null;
        }
        repetido = { rev: snap.rev, texto: snap.texto };
        return null;
      }
      // Deshecha (falló el espejo y se volvió atrás): solo se rehace la MISMA.
      if (recibo.contenido !== canonico) {
        codigo = 'token-contenido';
        motivo = 'Esa operación se intentó con otro contenido y no llegó a quedar guardada. Lo nuevo NO se ha guardado: hace falta una operación nueva.';
        return null;
      }
    }
    const d = decidir(rec, snap);
    if (!d) return null;
    const cambios = [{ nuevo: d[0] }, { nuevo: d[1] }];
    if (token) cambios.push({ nuevo: { token, ranura: n, runId, op: op ?? null, rev: d[0].rev, estado: 'hecho', momento: Date.now() } });
    return cambios;
  });
  if (repetido) return { ok: true, repetido: true, rev: repetido.rev, texto: repetido.texto };
  if (!r.cambiado) return { ok: false, codigo: codigo ?? 'otro-dueno', motivo: motivo ?? `No se ha podido escribir la ranura ${n}.` };
  return { ok: true, rev: r.nuevos[0].rev, texto, previo: { rec: r.actuales[0] ?? null, snap: r.actuales[1] ?? null, recibo: token ? (r.actuales[2] ?? null) : undefined } };
}

/**
 * Deshace una escritura PROPIA si sigue siendo la vigente (los mismos bytes
 * del mismo run en la copia autoritativa): vuelve exactamente lo de antes.
 * Si alguien escribió después, no se toca. Con token, su recibo queda como
 * «deshecho» con el contenido canónico: el token no queda libre para otro
 * contenido.
 */
export async function deshacerEscritura({ lease, ranura, runId, texto, previo, token = null }) {
  if (!leaseValido(lease)) return { ok: false, motivo: 'sin el candado global' };
  const n = String(ranura);
  const claves = token ? [[R, n], [P, n], [O, token]] : [[R, n], [P, n]];
  const r = await Coordinacion.casVarios(claves, ([rec, snap, recibo]) => {
    if (snap?.texto !== texto || rec?.runId !== runId || rec?.estado !== 'ocupada') return null;
    const cambios = [previo?.rec ? { nuevo: previo.rec } : { borrar: true }, previo?.snap ? { nuevo: previo.snap } : { borrar: true }];
    if (token) cambios.push(recibo ? { nuevo: { ...recibo, estado: 'deshecho', rev: null, contenido: contenidoCanonico(texto) } } : null);
    return cambios;
  });
  return { ok: r.cambiado };
}

/** Lo que se compara de dos guardados: todo salvo los metadatos de la escritura, claves en orden. */
export function contenidoCanonico(texto) {
  let g;
  try { g = JSON.parse(String(texto)); } catch { return null; }
  if (!g || typeof g !== 'object') return null;
  const { guardadoEn, firma, ...resto } = g;
  void guardadoEn; void firma;
  const ordenar = (v) => (Array.isArray(v) ? v.map(ordenar)
    : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, ordenar(v[k])])) : v);
  return JSON.stringify(ordenar(resto));
}

/** El registro y la copia autoritativa de una ranura, tal cual (para poder volver). */
export async function instantanea(ranura) {
  const n = String(ranura);
  const [rec, snap] = await Promise.all([Coordinacion.leer(R, n), Coordinacion.leer(P, n)]);
  return { rec: rec ?? null, snap: snap ?? null };
}

/**
 * Compatibilidad con reservas del #7 (escribían primero la ranura local y
 * después confirmaban): si la reserva de esta operación sigue abierta y hay
 * copia del sucesor, pasa a ocupada con ella. Desde el #8 la escritura ya
 * ocupa la ranura en la misma transacción y esto no cambia nada.
 */
export async function confirmarRanura(ranura, op, runId) {
  const n = String(ranura);
  const local = leerRanura(n);
  return Coordinacion.casVarios([[R, n], [P, n]], ([rec, snap]) => {
    if (rec?.estado !== 'reservada' || rec.op !== op) return null;
    const texto = snap?.runId === runId ? snap.texto : (local.tipo === 'valida' && local.runId === runId ? local.texto : null);
    if (!texto) return null;
    const rev = (rec.previo?.rev ?? 0) + 1;
    return [{ nuevo: { estado: 'ocupada', runId, rev, momento: Date.now(), creadaPor: op } }, { nuevo: { runId, rev, texto, huella: huella(texto), guardadoEn: Date.now() } }];
  });
}

/**
 * Borrar una campaña: solo la que el jugador eligió (mismo run, si se dice)
 * y dejando una lápida: un guardado tardío de esa campaña no la recrea.
 */
export async function borrarRanura({ lease, ranura, runId = null }) {
  if (!leaseValido(lease)) return { ok: false, motivo: 'sin el candado global' };
  const n = String(ranura);
  const local = leerRanura(n);
  let motivo = null;
  const r = await Coordinacion.casVarios([[R, n], [P, n]], ([rec, snap]) => {
    const dueno = rec?.runId ?? (local.tipo === 'valida' ? local.runId : null);
    if (runId && dueno && dueno !== runId) { motivo = 'la ranura ya es de otra campaña'; return null; }
    if (rec?.estado === 'reservada') { motivo = 'la ranura está apartada por una operación en curso'; return null; }
    return [{ nuevo: { estado: 'borrada', momento: Date.now(), runId: dueno, rev: rec?.rev ?? 0 } }, snap ? { borrar: true } : null];
  });
  if (!r.cambiado) return { ok: false, motivo: motivo ?? 'no se ha podido borrar' };
  try { almacen()?.removeItem(`${PREFIJO}${n}`); } catch { /* el espejo; la autoridad ya dice borrada */ }
  return { ok: true };
}

/**
 * «Borrar partidas y personajes»: tras vaciar, cada ranura que tenía dueño
 * queda con su lápida (un guardado tardío de esa campaña no la recrea).
 * @param {Array<[string, Object]>} antes Los registros de antes de vaciar.
 */
export async function lapidasTodas(antes) {
  for (const [n, rec] of antes) {
    if (!rec?.runId) continue;
    await Coordinacion.cas(R, String(n), (a) => (a ? null : { nuevo: { estado: 'borrada', momento: Date.now(), runId: rec.runId, rev: rec.rev ?? 0 } }));
  }
}

export default {
  PREFIJO, CANDADO_GLOBAL, RANURA_AUTO, usarCandados, ranurasManuales, huella, leaseValido, conCandadoGlobal,
  validarGuardado, leerRanura, duenoRanura, leerRanuraCoordinada, enumerarPartidas, ocupacion, ranuraLibre, ranuraLibreLocal,
  reclamarDestino, soltarRanura, escribirPartida, deshacerEscritura, contenidoCanonico, instantanea, confirmarRanura, borrarRanura, lapidasTodas,
};
