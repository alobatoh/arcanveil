/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCANVEIL · tools/auditar-guardado-coordinado.mjs
 * ---------------------------------------------------------------------------
 * Encargo #8 del 8-oct-2026: el guardado NORMAL tampoco puede pisar otra
 * campaña, aunque `localStorage` le enseñe una caché vieja.
 *
 * Repro de la revisión externa sobre 6afe016 (fixture, no carrera natural):
 *   1. Campaña A (OLD-RUN) en la ranura 2.
 *   2. Una creación la reemplaza por NEW-RUN: fichero e IndexedDB, NEW-RUN.
 *   3. La pestaña de A ve una caché vieja: `getItem(ranura 2)` devuelve los
 *      bytes de OLD-RUN; IndexedDB sigue diciendo NEW-RUN.
 *   4. A guarda en la 2 → en la base: éxito, el fichero vuelve a OLD-RUN y
 *      el sucesor nuevo desaparece.
 *
 * Aquí (motor sin ventana, guardado real, Web Locks con un doble que espera
 * y estado coordinado en memoria con la semántica de IndexedDB):
 *   · propiedad: caché vieja, «ausente» en local con dueño en el registro,
 *     lectura imposible, estado coordinado roto, sin Web Locks;
 *   · el guardado normal del mismo dueño sigue igual (guardar y cargar);
 *   · orden: dos guardados del mismo run, revisión atrasada, token repetido;
 *   · la partida cambia mientras el guardado espera;
 *   · fallos tras cada escritura del guardado;
 *   · creación (que ya tiene el candado global) sin interbloqueo;
 *   · ocho ranuras llenas con dos herencias, permisos de otra ranura o
 *     caducados, y la automática (caso 16);
 *   · reemplazo antes y después de un guardado de la campaña reemplazada,
 *     cuota llena al reemplazar, borrar con guardados en cola.
 *
 *   node tools/auditar-guardado-coordinado.mjs
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { crearMotor } from './motor-sin-ventana.mjs';

let fallos = 0;
let casos = 0;
function comprobar(bien, texto, detalle = '') {
  casos += 1;
  if (bien) console.log(`OK   ${texto}`);
  else { fallos += 1; console.log(`MAL  ${texto}`); if (detalle) console.log(`     ${String(detalle).replace(/\n/g, ' | ').slice(0, 700)}`); }
}
async function caso(nombre, fn) {
  console.log(`\n── ${nombre} ──`);
  try { await fn(); } catch (e) { comprobar(false, 'el caso revienta antes de terminar', String(e?.stack ?? e).split('\n').slice(0, 3).join(' ')); }
}
const tic = (ms = 0) => new Promise((r) => setTimeout(r, ms));

const Entrega = await import('../src/persistence/EntregaLegado.js');
const Ranuras = await import('../src/persistence/Ranuras.js');
const Coordinacion = await import('../src/persistence/Coordinacion.js');

/** Web Locks de un proceso: espera como el de verdad; se puede retener a mano. */
const tomados = new Set();
const retenidos = new Map();
const candados = {
  async request(n, o, fn) {
    if (o?.ifAvailable && tomados.has(n)) return fn(null);
    while (tomados.has(n)) await tic(2);
    tomados.add(n);
    try { return await fn({ name: n }); } finally { tomados.delete(n); }
  },
};
/** Retener un candado como si otra pestaña lo tuviera; devuelve cómo soltarlo. */
function retener(nombre) {
  let soltar;
  const suelto = new Promise((r) => { soltar = r; });
  const tomado = candados.request(nombre, {}, () => suelto);
  retenidos.set(nombre, tomado);
  return async () => { soltar(); await tomado; };
}
Entrega.usarCandados(candados);

const LS = globalThis.localStorage;
const orig = { getItem: LS.getItem, setItem: LS.setItem, key: LS.key, removeItem: LS.removeItem };
const restaurarLS = () => Object.assign(LS, orig);
const crudo = (k) => orig.getItem.call(LS, k);
async function limpiar() {
  restaurarLS();
  await Coordinacion.vaciar();
  for (const k of Array.from({ length: LS.length }, (_, i) => orig.key.call(LS, i))) if (k?.startsWith('arcanveil:')) orig.removeItem.call(LS, k);
}
const runEn = (n) => { try { return JSON.parse(crudo(`arcanveil:partida:${n}`))?.estado?.meta?.runId ?? null; } catch { return 'ILEGIBLE'; } };
const BORR = (nombre) => ({ nombre, raza: 'valdes', clase: 'rastreador', trasfondo: 'errante', genero: 'f' });

/** Dueño coordinado de la ranura (registro de ranuras). */
async function dueno(n) {
  if (typeof Ranuras.duenoRanura === 'function') return (await Ranuras.duenoRanura(n))?.runId ?? null;
  return (await Coordinacion.leer(Coordinacion.ALMACENES.RANURAS, String(n)))?.runId ?? null;
}

async function motorListo(semilla) {
  const m = await crearMotor({ semilla });
  m.store.fijar('settings.persistencia', true);
  m.store.fijar('settings.autoguardado', false);
  m.bus.emit('settings:change', { id: 'persistencia', valor: true });
  return m;
}
/** Guardar como lo hace la app, en la ranura dada (await sirve también si es síncrono). */
async function guardar(m, n, opciones = {}) {
  const r = await m.sistema('saves').guardar(String(n), { silencioso: true, ...opciones });
  return r ?? { exito: false, motivo: 'sin resultado' };
}
/** Una campaña nueva por el protocolo (candado global, reclamo de ranura). */
async function crearCampana(m, { nombre, runId, ranura = null, reemplazo = null }) {
  return Entrega.crearPartidaNueva({
    runDestino: runId, ranura, reemplazo,
    crear: async ({ ranura: slot }) => {
      m.store.reiniciar();
      m.store.fijar('settings.persistencia', true);
      m.store.fijar('meta.ranura', slot);
      m.store.dispatch('player/crear', { borrador: BORR(nombre), runId });
      await tic();
    },
    guardar: async (p) => {
      const g = await m.sistema('saves').guardar(p.ranura, { silencioso: true, reemplazo: p.reemplazo, lease: p.lease, op: p.op });
      return { ok: g.exito, motivo: g.motivo, texto: g.texto };
    },
  });
}
/** El permiso de reemplazo tal como lo construye el selector (con la revisión, si la hay). */
async function permisoDe(n) {
  const c = (await Ranuras.ocupacion()).find((x) => x.ranura === String(n));
  return { ranura: c.ranura, runId: c.runId ?? null, guardadoEn: c.guardadoEn ?? null, huella: c.huella ?? null, rev: c.rev ?? null };
}

/* ═══════════════════════════════════════════════════════════════════════ */

await caso('1 · Repro de la revisión: caché vieja OLD-RUN contra fichero e IndexedDB NEW-RUN', async () => {
  await limpiar();
  const m = await motorListo(1);
  const a = await crearCampana(m, { nombre: 'Vieja', runId: 'OLD-RUN', ranura: '2' });
  comprobar(a.ok && runEn('2') === 'OLD-RUN', 'campaña A creada en la ranura 2', JSON.stringify(a));
  const bytesA = crudo('arcanveil:partida:2');
  const estadoA = JSON.parse(bytesA);
  const b = await crearCampana(m, { nombre: 'Nueva', runId: 'NEW-RUN', ranura: '2', reemplazo: await permisoDe('2') });
  const bytesB = crudo('arcanveil:partida:2');
  comprobar(b.ok && runEn('2') === 'NEW-RUN' && (await dueno('2')) === 'NEW-RUN', 'otra creación la reemplaza: fichero y registro dicen NEW-RUN', JSON.stringify(b));
  // La pestaña de A: su partida en memoria y una caché vieja de la ranura 2.
  const ma = await motorListo(2);
  ma.sistema('saves').cargarDesde(estadoA);
  ma.store.fijar('meta.ranura', '2');
  LS.getItem = function (k) { return k === 'arcanveil:partida:2' ? bytesA : orig.getItem.call(this, k); };
  const g = await guardar(ma, '2');
  restaurarLS();
  comprobar(!g.exito, 'el guardado de A se rechaza (no hay éxito engañoso)', JSON.stringify({ exito: g.exito, motivo: g.motivo }));
  comprobar(crudo('arcanveil:partida:2') === bytesB && (await dueno('2')) === 'NEW-RUN', 'los bytes de NEW-RUN y su dueño en el registro siguen intactos', runEn('2'));
  comprobar(/otra (partida|campaña)|ya no es/i.test(g.motivo ?? ''), 'el motivo dice que la ranura es de otra campaña', g.motivo);
});

await caso('2 · Ausente en local con dueño en el registro; lecturas y coordinación que fallan', async () => {
  await limpiar();
  const m = await motorListo(3);
  await crearCampana(m, { nombre: 'Bea', runId: 'RUN-B', ranura: '3' });
  const bytesB = crudo('arcanveil:partida:3');
  const ma = await motorListo(4);
  await ma.empezar(BORR('Ana'));
  ma.store.fijar('meta.ranura', '3');
  LS.getItem = function (k) { return k === 'arcanveil:partida:3' ? null : orig.getItem.call(this, k); };
  const g = await guardar(ma, '3');
  restaurarLS();
  comprobar(!g.exito && crudo('arcanveil:partida:3') === bytesB, 'local dice «vacía» pero el registro la da a B: A no escribe', JSON.stringify({ exito: g.exito, motivo: g.motivo }));

  LS.getItem = function (k) { if (k === 'arcanveil:partida:3') throw new Error('acceso denegado'); return orig.getItem.call(this, k); };
  const g2 = await guardar(ma, '3');
  restaurarLS();
  comprobar(!g2.exito && crudo('arcanveil:partida:3') === bytesB, 'la ranura no se puede leer: no se escribe', JSON.stringify({ exito: g2.exito, motivo: g2.motivo }));

  // El estado coordinado falla: no se escribe «por si acaso».
  const interno = Coordinacion.crearEnMemoria();
  const roto = { ...interno, async cas() { throw new Error('IndexedDB abortada'); }, async leer() { throw new Error('IndexedDB abortada'); }, async listar() { throw new Error('IndexedDB abortada'); } };
  Coordinacion.usarCoordinacion(roto);
  const mb = await motorListo(5);
  await mb.empezar(BORR('Cris'));
  mb.store.fijar('meta.ranura', '4');
  const g3 = await guardar(mb, '4');
  Coordinacion.usarCoordinacion(Coordinacion.crearEnMemoria());
  comprobar(!g3.exito && crudo('arcanveil:partida:4') === null, 'estado coordinado inaccesible: error honesto y nada escrito', JSON.stringify({ exito: g3.exito, motivo: g3.motivo }));

  // Sin Web Locks.
  Entrega.usarCandados({});
  const mc = await motorListo(6);
  await mc.empezar(BORR('Dina'));
  mc.store.fijar('meta.ranura', '5');
  const g4 = await guardar(mc, '5');
  Entrega.usarCandados(candados);
  comprobar(!g4.exito && crudo('arcanveil:partida:5') === null, 'sin Web Locks: no se guarda sin coordinar (error honesto)', JSON.stringify({ exito: g4.exito, motivo: g4.motivo }));
});

await caso('3 · El guardado normal del mismo dueño sigue igual', async () => {
  await limpiar();
  const m = await motorListo(7);
  const c = await crearCampana(m, { nombre: 'Eli', runId: 'RUN-E', ranura: '1' });
  m.store.dispatch('player/xp', { cantidad: 50, motivo: 'jugado' });
  await tic();
  const g = await guardar(m, '1');
  const g2 = await guardar(m, '1');
  comprobar(c.ok && g.exito && g2.exito, 'crear y guardar dos veces la misma campaña: éxito', JSON.stringify({ c: c.ok, g: g.motivo, g2: g2.motivo }));
  const m2 = await motorListo(8);
  const r = await m2.sistema('saves').cargar('1');
  comprobar(r.exito && m2.ver('meta.runId') === 'RUN-E' && m2.ver('player.xp') === 50, 'cargar devuelve exactamente lo guardado', JSON.stringify({ r: r.exito, xp: m2.ver('player.xp') }));
  m2.store.dispatch('player/xp', { cantidad: 5, motivo: 'jugado' });
  await tic();
  const g3 = await guardar(m2, '1');
  comprobar(g3.exito, 'tras cargar, la misma campaña sigue guardando', g3.motivo);
});

await caso('4 · Dos guardados del mismo run en orden inverso; revisión atrasada; token repetido', async () => {
  await limpiar();
  const m = await motorListo(9);
  await crearCampana(m, { nombre: 'Fio', runId: 'RUN-F', ranura: '1' });
  // Dos guardados seguidos sin esperar: el segundo con más XP.
  m.store.dispatch('player/xp', { cantidad: 10, motivo: 'jugado' }); await tic();
  const p1 = guardar(m, '1');
  m.store.dispatch('player/xp', { cantidad: 20, motivo: 'jugado' }); await tic();
  const p2 = guardar(m, '1');
  const [g1, g2] = await Promise.all([p1, p2]);
  const xp = JSON.parse(crudo('arcanveil:partida:1')).estado.player.xp;
  comprobar(g1.exito && g2.exito && xp === 30, `el último guardado no lo tapa el anterior (XP en disco ${xp}, esperado 30)`, JSON.stringify({ g1: g1.motivo, g2: g2.motivo }));
  comprobar(typeof Ranuras.escribirPartida === 'function', 'existe la escritura coordinada con revisión');
  if (typeof Ranuras.escribirPartida !== 'function') return;
  const antes = await Ranuras.duenoRanura('1');
  const viejo = await Ranuras.conCandadoGlobal((lease) => Ranuras.escribirPartida({ lease, ranura: '1', runId: 'RUN-F', texto: crudo('arcanveil:partida:1'), revBase: antes.rev - 1 }));
  comprobar(!viejo.ok && viejo.codigo === 'revision' && (await Ranuras.duenoRanura('1')).rev === antes.rev, 'una escritura basada en una revisión anterior se rechaza (no tapa la nueva)', JSON.stringify(viejo));
  const t1 = await Ranuras.conCandadoGlobal((lease) => Ranuras.escribirPartida({ lease, ranura: '1', runId: 'RUN-F', texto: crudo('arcanveil:partida:1'), revBase: antes.rev, token: 'tok-1' }));
  const t2 = await Ranuras.conCandadoGlobal((lease) => Ranuras.escribirPartida({ lease, ranura: '1', runId: 'RUN-F', texto: crudo('arcanveil:partida:1'), revBase: antes.rev, token: 'tok-1' }));
  comprobar(t1.ok && t2.ok && t2.repetido && (await Ranuras.duenoRanura('1')).rev === antes.rev + 1, 'el mismo token dos veces: una sola revisión nueva', JSON.stringify({ t1, t2 }));
  const sinCandado = await Ranuras.escribirPartida({ lease: { falso: true }, ranura: '1', runId: 'RUN-F', texto: 'x', revBase: antes.rev + 1 });
  comprobar(!sinCandado.ok && sinCandado.codigo === 'sin-candado', 'sin un candado válido no hay escritura interna (no hay atajo por bandera)', JSON.stringify(sinCandado));
});

await caso('5 · La partida cambia mientras el guardado espera', async () => {
  await limpiar();
  const m = await motorListo(10);
  await crearCampana(m, { nombre: 'Gala', runId: 'RUN-G', ranura: '1' });
  const bytesG = crudo('arcanveil:partida:1');
  await crearCampana(m, { nombre: 'Hugo', runId: 'RUN-H', ranura: '2' });
  const bytesH = crudo('arcanveil:partida:2');
  // Vuelve a G, otra pestaña retiene el candado global y G pide guardar.
  await m.sistema('saves').cargar('1');
  m.store.dispatch('player/xp', { cantidad: 7, motivo: 'jugado' }); await tic();
  const soltar = retener(Ranuras.CANDADO_GLOBAL);
  const pendiente = guardar(m, '1');
  await tic(10);
  // Mientras espera, la pestaña pasa a H.
  await m.sistema('saves').cargar('2');
  await soltar();
  const g = await pendiente;
  const enUno = JSON.parse(crudo('arcanveil:partida:1'));
  comprobar(g.exito && enUno.estado.meta.runId === 'RUN-G' && enUno.estado.player.xp === 7 && crudo('arcanveil:partida:2') === bytesH, 'lo guardado es la foto de G (capturada al pedir), en la ranura de G; H intacta', JSON.stringify({ g: g.motivo, run: enUno.estado.meta.runId, xp: enUno.estado.player.xp }));
  comprobar(g.runId === 'RUN-G' || g.run === 'RUN-G' || /RUN-G/.test(JSON.stringify(g)), 'el resultado dice a qué partida pertenece (para no avisar en la pantalla de otra)', JSON.stringify(g));
  void bytesG;
});

await caso('6 · Fallos tras cada escritura del guardado: lo anterior o lo nuevo, nunca a medias', async () => {
  // El estado coordinado de prueba, envuelto: sus escrituras cuentan igual
  // que las de localStorage para el corte.
  const base = Coordinacion.crearEnMemoria();
  const corte = { n: 0, k: Infinity, caido: false };
  Coordinacion.usarCoordinacion({
    ...base,
    async cas(a, c, decidir) {
      if (corte.caido) throw new Error('proceso caído');
      return base.cas(a, c, (actual) => { const d = decidir(actual); if (d) { corte.n += 1; if (corte.n === corte.k) { corte.caido = true; throw Object.assign(new Error('lleno'), { name: 'QuotaExceededError' }); } } return d; });
    },
    async casVarios(claves, decidir) {
      if (corte.caido) throw new Error('proceso caído');
      return base.casVarios(claves, (actuales) => { const d = decidir(actuales); if (d && d.some(Boolean)) { corte.n += 1; if (corte.n === corte.k) { corte.caido = true; throw Object.assign(new Error('lleno'), { name: 'QuotaExceededError' }); } } return d; });
    },
  });
  for (let k = 1; k <= 4; k++) {
    await limpiar();
    Object.assign(corte, { n: 0, k: Infinity, caido: false });
    const m = await motorListo(11);
    await crearCampana(m, { nombre: 'Iris', runId: 'RUN-I', ranura: '1' });
    m.store.dispatch('player/xp', { cantidad: 15, motivo: 'jugado' }); await tic();
    // Corte: la k-ésima escritura del guardado (coordinada o local) falla y
    // las siguientes no ocurren (proceso caído).
    Object.assign(corte, { n: 0, k, caido: false });
    LS.setItem = function (kk, v) { if (corte.caido) throw new Error('proceso caído'); corte.n += 1; if (corte.n === k) { corte.caido = true; const e = new Error('lleno'); e.name = 'QuotaExceededError'; throw e; } return orig.setItem.call(this, kk, v); };
    const g = await guardar(m, '1');
    restaurarLS();
    Object.assign(corte, { n: 0, k: Infinity, caido: false });
    const m2 = await motorListo(12);
    const r = await m2.sistema('saves').cargar('1');
    const xp = m2.ver('player.xp');
    comprobar(r.exito && (xp === 0 || xp === 15) && (!g.exito || xp === 15), `fallo en la escritura local ${k}: al abrir, la campaña es la anterior (0) o la nueva (15), y el éxito solo si está la nueva (${g.exito ? 'éxito' : 'error'}, ${xp})`, JSON.stringify({ g: g.motivo, r: r.motivo }));
  }
});

await caso('7 · Una creación que ya tiene el candado global guarda sin interbloqueo', async () => {
  Coordinacion.usarCoordinacion(Coordinacion.crearEnMemoria());
  await limpiar();
  const m = await motorListo(13);
  const r = await Promise.race([crearCampana(m, { nombre: 'Juno', runId: 'RUN-J', ranura: null }), tic(8000).then(() => 'INTERBLOQUEO')]);
  comprobar(r !== 'INTERBLOQUEO' && r.ok && runEn(r.ranura) === 'RUN-J', 'crear (candado global + guardado dentro) termina', JSON.stringify(r));
});

await caso('13 · Guardado de A antes de reemplazarla: el permiso viejo caduca', async () => {
  await limpiar();
  const m = await motorListo(14);
  await crearCampana(m, { nombre: 'Kira', runId: 'RUN-K', ranura: '2' });
  const permiso = await permisoDe('2');
  // A guarda (otra revisión) después de que el selector leyera el permiso.
  m.store.dispatch('player/xp', { cantidad: 3, motivo: 'jugado' }); await tic();
  await tic(5);
  const g = await guardar(m, '2');
  const bytesA = crudo('arcanveil:partida:2');
  const mb = await motorListo(15);
  const r = await crearCampana(mb, { nombre: 'Lola', runId: 'RUN-L', ranura: '2', reemplazo: permiso });
  comprobar(g.exito && !r.ok && r.codigo === 'permiso-caducado' && crudo('arcanveil:partida:2') === bytesA, 'el guardado de A cambia su revisión: el reemplazo con el permiso viejo caduca y A sigue', JSON.stringify({ g: g.motivo, r }));
});

await caso('14 · Reemplazo antes del guardado atrasado de A: A se rechaza y B se queda', async () => {
  await limpiar();
  const m = await motorListo(16);
  await crearCampana(m, { nombre: 'Mar', runId: 'RUN-M', ranura: '2' });
  const estadoA = JSON.parse(crudo('arcanveil:partida:2'));
  const mb = await motorListo(17);
  const r = await crearCampana(mb, { nombre: 'Nil', runId: 'RUN-N', ranura: '2', reemplazo: await permisoDe('2') });
  const bytesB = crudo('arcanveil:partida:2');
  const ma = await motorListo(18);
  ma.sistema('saves').cargarDesde(estadoA);
  ma.store.fijar('meta.ranura', '2');
  const g = await guardar(ma, '2');
  comprobar(r.ok && !g.exito && crudo('arcanveil:partida:2') === bytesB && (await dueno('2')) === 'RUN-N', 'el guardado atrasado de A se rechaza; B sigue con sus bytes y su dueño', JSON.stringify({ r: r.ok, g: g.motivo }));
});

await caso('15 · Reemplazo con cuota llena: A recuperable, ningún B fantasma', async () => {
  await limpiar();
  const m = await motorListo(19);
  await crearCampana(m, { nombre: 'Olga', runId: 'RUN-O', ranura: '2' });
  const bytesA = crudo('arcanveil:partida:2');
  const mb = await motorListo(20);
  const permiso = await permisoDe('2');
  LS.setItem = function (k, v) { if (k === 'arcanveil:partida:2') { const e = new Error('lleno'); e.name = 'QuotaExceededError'; throw e; } return orig.setItem.call(this, k, v); };
  const r = await crearCampana(mb, { nombre: 'Pau', runId: 'RUN-P', ranura: '2', reemplazo: permiso });
  restaurarLS();
  const m2 = await motorListo(21);
  const c = await m2.sistema('saves').cargar('2');
  comprobar(!r.ok && c.exito && m2.ver('meta.runId') === 'RUN-O' && (await dueno('2')) === 'RUN-O', 'la creación falla y la 2 sigue siendo A (sin B a medias)', JSON.stringify({ r: r.motivo, run: m2.ver('meta.runId'), dueno: await dueno('2') }));
  void bytesA;
});

/** FIXTURE: un personaje que muere con XP conocida (sin ranura propia). */
async function muertoCon(nombre, xp, semilla) {
  const m = await motorListo(semilla);
  await m.empezar(BORR(nombre));
  m.store.dispatch('player/xp', { cantidad: xp, motivo: 'fixture' }); await tic();
  const muerte = m.sistema('muerte').morir({ origen: 'combate' });
  await m.sistema('muerte').registro;
  return muerte.runId;
}
/** Un sucesor con herencia, por el protocolo (como la app). */
async function heredar(m, { runOrigen, nombre, runId, ranura = null, reemplazo = null }) {
  return Entrega.entregarLegado({
    runOrigen, transaccion: Entrega.nuevaTransaccion(), runDestino: runId, ranura, reemplazo,
    crear: async ({ cantidad, legado, ranura: slot }) => {
      m.store.reiniciar();
      m.store.fijar('settings.persistencia', true);
      m.store.fijar('meta.ranura', slot);
      await Entrega.crearEnMotor(m.store, { borrador: BORR(nombre), runDestino: runId, cantidad, legado });
    },
    guardar: async (p) => {
      const g = await m.sistema('saves').guardar(p.ranura, { silencioso: true, lease: p.lease, op: p.op });
      return { ok: g.exito, motivo: g.motivo, texto: g.texto };
    },
  });
}

await caso('16 · Ocho ranuras llenas, dos herencias, permisos cambiados y la automática', async () => {
  await limpiar();
  const A = await muertoCon('Ana', 1000, 30);
  const B = await muertoCon('Bea', 600, 31);
  // Ranura 1: el sucesor de A (con herencia); 2-8: campañas sin herencia.
  const m = await motorListo(32);
  const s1 = await heredar(m, { runOrigen: A, nombre: 'Hija', runId: 'RUN-HA', ranura: '1' });
  for (let i = 2; i <= 8; i++) await crearCampana(m, { nombre: `C${i}`, runId: `RUN-C${i}`, ranura: String(i) });
  // La automática (de cualquiera) no cuenta como sitio libre ni toca las manuales.
  const ga = await guardar(m, 'auto');
  const foto = async () => Object.fromEntries(await Promise.all([...Array.from({ length: 8 }, (_, i) => String(i + 1)), 'auto'].map(async (n) => [n, { bytes: crudo(`arcanveil:partida:${n}`), rev: (await Ranuras.duenoRanura(n))?.rev ?? null }])));
  const iguales = (x, y, salvo = []) => Object.keys(x).every((n) => salvo.includes(n) || (x[n].bytes === y[n].bytes && x[n].rev === y[n].rev));
  const antes = await foto();
  comprobar(s1.ok && ga.exito && (await Entrega.estadoLegado(A))?.estado === 'aplicado' && (await Entrega.estadoLegado(B))?.estado === 'pendiente' && Object.values(antes).every((x) => x.bytes),
    'preparado: 8 ranuras manuales llenas (una con herencia), la automática escrita; A entregada y B pendiente', JSON.stringify({ s1: s1.ok, ga: ga.motivo }));

  // Sin ranura: lo dice, lista las 8 y no toca nada (cancelar = no seguir).
  const mb = await motorListo(33);
  const r0 = await heredar(mb, { runOrigen: B, nombre: 'Nieta', runId: 'RUN-HB' });
  comprobar(!r0.ok && r0.codigo === 'sin-ranura' && r0.campanas?.length === 8 && iguales(antes, await foto()) && (await Entrega.estadoLegado(B))?.estado === 'pendiente',
    'sin ranura libre: lista las 8, no consume la herencia de B ni toca ninguna ranura (tampoco la automática)', JSON.stringify({ r0: r0.codigo, n: r0.campanas?.length }));

  // Un permiso de la 3 no sirve para la 4.
  const p3 = await permisoDe('3');
  const r1 = await heredar(mb, { runOrigen: B, nombre: 'Nieta', runId: 'RUN-HB', ranura: '4', reemplazo: p3 });
  comprobar(!r1.ok && iguales(antes, await foto()) && (await Entrega.estadoLegado(B))?.estado === 'pendiente', 'el permiso de una ranura no autoriza otra: rechazado, nada tocado', JSON.stringify(r1));

  // La campaña de la 5 guarda (otra pestaña) después de leer su permiso.
  const p5 = await permisoDe('5');
  const m5 = await motorListo(34);
  const c5 = await m5.sistema('saves').cargar('5');
  m5.store.dispatch('player/xp', { cantidad: 9, motivo: 'jugado' }); await tic();
  const g5 = await guardar(m5, '5');
  const tras5 = await foto();
  const mc = await motorListo(35);
  const r2 = await heredar(mc, { runOrigen: B, nombre: 'Nieta', runId: 'RUN-HB', ranura: '5', reemplazo: p5 });
  comprobar(c5.exito && g5.exito && !r2.ok && r2.codigo === 'permiso-caducado' && iguales(tras5, await foto()) && (await Entrega.estadoLegado(B))?.estado === 'pendiente',
    'permiso leído antes de que la 5 guardara: caduca; la 5 conserva su guardado nuevo y B sigue pendiente', JSON.stringify({ g5: g5.motivo, r2 }));

  // Permiso vigente de la 1 (la campaña CON herencia): solo la 1 cambia.
  const p1 = await permisoDe('1');
  const r3 = await heredar(mc, { runOrigen: B, nombre: 'Nieta', runId: 'RUN-HB', ranura: '1', reemplazo: p1 });
  const despues = await foto();
  comprobar(r3.ok && runEn('1') === 'RUN-HB' && (await dueno('1')) === 'RUN-HB' && iguales(tras5, despues, ['1']),
    'con permiso vigente se reemplaza SOLO la 1; las otras siete y la automática, byte a byte y revisión a revisión, intactas', JSON.stringify(r3));
  comprobar((await Entrega.estadoLegado(B))?.estado === 'aplicado' && (await Entrega.estadoLegado(A))?.estado === 'aplicado' && (await Entrega.estadoLegado(B))?.destinatario === 'RUN-HB',
    'B entregada una vez a su sucesor; A sigue entregada (borrar a su sucesor no la devuelve)');
});

await caso('17 · Borrar con un guardado en cola: el tardío no la recrea', async () => {
  await limpiar();
  const m = await motorListo(22);
  await crearCampana(m, { nombre: 'Quim', runId: 'RUN-Q', ranura: '3' });
  const soltar = retener(Ranuras.CANDADO_GLOBAL);
  const pendiente = guardar(m, '3');
  await tic(10);
  await soltar();
  const borrado = await m.sistema('saves').borrar('3');
  const g = await pendiente;
  const tardio = await guardar(m, '3');
  comprobar(borrado !== false && crudo('arcanveil:partida:3') === null && !tardio.exito, `borrada: un guardado posterior de esa campaña no la recrea (${tardio.motivo})`, JSON.stringify({ g: g.exito, tardio }));
  // Y no toca otra ranura.
  await crearCampana(m, { nombre: 'Rut', runId: 'RUN-R', ranura: '4' });
  const bytesR = crudo('arcanveil:partida:4');
  await m.sistema('saves').borrar('3');
  comprobar(crudo('arcanveil:partida:4') === bytesR, 'borrar una ranura no toca las demás');
});

restaurarLS();
console.log(`\n${casos - fallos}/${casos} comprobaciones correctas`);
process.exitCode = fallos ? 1 : 0;
