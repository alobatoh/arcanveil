/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCANVEIL · tools/auditar-tokens-durables.mjs
 * ---------------------------------------------------------------------------
 * Encargo #10 del 9-oct-2026: un token de guardado sigue siendo la MISMA
 * operación después de mucha actividad. Que se acumulen recibos no puede
 * volver a dejarlo «libre».
 *
 * Repro de la revisión externa sobre 7283b5a (API real, sin tocar recibos a
 * mano ni forzar una poda): T guarda, U guarda después, T → superado. Tras
 * 225 guardados normales con tokens nuevos, la poda automática borra el
 * recibo de T, y T con el turno 500 se acepta como operación NUEVA.
 *
 *   A. el repro natural: T sigue superado tras la actividad, y lo posterior
 *      intacto; una operación de verdad nueva sigue guardando;
 *   B. la actividad viene de OTRA ranura: T no se reaplica (ni con A ni con C);
 *   C. campaña tranquila: su último commit (T) sigue idempotente y su
 *      conflicto sigue siendo conflicto aunque otra campaña genere actividad;
 *   D. recibo deshecho (falló el espejo): tras la actividad, otro contenido es
 *      conflicto y el mismo contenido se rehace una sola vez;
 *   E. otra instancia del gestor (recarga): la evidencia es la durable;
 *   F. dos «pestañas»: retry viejo y guardado nuevo a la vez; mismo token
 *      y contenido, una operación; contenido distinto, un conflicto;
 *   G. ningún mantenimiento borra recibos, tampoco con cortes y cuota a mitad;
 *   H. turno, XP, vida, inventario, combate, run, ranura y operación distintos;
 *   I. relojes iguales y hacia atrás no cambian la garantía;
 *   J. volumen: crecimiento y tiempo medidos con datos ficticios.
 *
 * «Mantenimiento»: si el producto tiene una poda (la base), se espera a que
 * acabe mirando el almacén de recibos (inspección explícita, con tope), para
 * no dar un verde falso por una limpieza aún pendiente.
 *
 *   node tools/auditar-tokens-durables.mjs
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

const Ranuras = await import('../src/persistence/Ranuras.js');
const Coordinacion = await import('../src/persistence/Coordinacion.js');
const Entrega = await import('../src/persistence/EntregaLegado.js');
const O = Coordinacion.ALMACENES.OPERACIONES;

const LS = globalThis.localStorage;
const orig = { getItem: LS.getItem, setItem: LS.setItem, key: LS.key, removeItem: LS.removeItem };
const restaurarLS = () => Object.assign(LS, orig);
const crudo = (k) => orig.getItem.call(LS, k);
const BORR = (nombre) => ({ nombre, raza: 'valdes', clase: 'rastreador', trasfondo: 'errante', genero: 'f' });
async function limpiar() {
  restaurarLS();
  Coordinacion.usarCoordinacion(Coordinacion.crearEnMemoria());
  for (const k of Array.from({ length: LS.length }, (_, i) => orig.key.call(LS, i))) if (k?.startsWith('arcanveil:')) orig.removeItem.call(LS, k);
}
async function partida(semilla, ranura = '1', nombre = 'Tana') {
  const m = await crearMotor({ semilla });
  await m.empezar(BORR(nombre));
  m.store.fijar('meta.ranura', ranura);
  return m;
}
const g = (m, n, opciones = {}) => m.sistema('saves').guardar(String(n), { silencioso: true, ...opciones });
const autoridad = async (n) => ({
  rec: await Coordinacion.leer(Coordinacion.ALMACENES.RANURAS, String(n)),
  snap: await Coordinacion.leer(Coordinacion.ALMACENES.PARTIDAS, String(n)),
  espejo: crudo(`arcanveil:partida:${n}`),
});
const turnoDe = (texto) => { try { return JSON.parse(texto)?.estado?.meta?.turno ?? null; } catch { return 'ILEGIBLE'; } };
const concuerdan = (a) => a.snap?.texto === a.espejo && a.rec?.rev === a.snap?.rev;
const nadaCambia = (antes, despues) => antes.espejo === despues.espejo && antes.snap?.texto === despues.snap?.texto && antes.rec?.rev === despues.rec?.rev;
const recibo = (token) => Coordinacion.leer(O, token);
const recibos = async () => (await Coordinacion.listar(O)).length;

/**
 * Barrera de mantenimiento: si existe una poda (la base), espera a que el
 * almacén de recibos deje de cambiar por ella (tope 10 s); si no existe,
 * no hay nada que esperar. Devuelve qué vio.
 */
async function trasMantenimiento() {
  if (typeof Ranuras.podarOperaciones !== 'function') return { poda: false, recibos: await recibos() };
  const t0 = Date.now();
  // La poda de la base borra de uno en uno: se da por acabada cuando el
  // almacén lleva 4 lecturas seguidas sin cambiar (o a los 10 s, y se dice).
  let antes = await recibos();
  let quietas = 0;
  for (;;) {
    await tic(50);
    const ahora = await recibos();
    quietas = ahora === antes ? quietas + 1 : 0;
    if (quietas >= 4) return { poda: true, recibos: ahora, ms: Date.now() - t0 };
    if (Date.now() - t0 > 10000) return { poda: true, recibos: ahora, ms: Date.now() - t0, sinTerminar: true };
    antes = ahora;
  }
}
/** Mucha actividad normal: `n` guardados válidos con tokens nuevos. */
async function actividad(m, ranura, n, { prefijo = 'new', turno0 = 101 } = {}) {
  for (let i = 0; i < n; i++) {
    m.store.fijar('meta.turno', turno0 + i);
    const r = await g(m, ranura, { token: `${prefijo}-${i}` });
    if (!r.exito) throw new Error(`la actividad ${prefijo}-${i} no guardó: ${r.motivo}`);
  }
}

/* ═══════════════════════════════════════════════════════════════════════ */

await caso('A · Repro natural: 225 guardados después, T sigue superado', async () => {
  await limpiar();
  const m = await partida(9303);
  m.store.fijar('meta.turno', 0);
  const rT = await g(m, '1', { token: 'T' });
  m.store.fijar('meta.turno', 100);
  const rU = await g(m, '1', { token: 'U' });
  const antes = await g(m, '1', { token: 'T' });
  comprobar(rT.exito && rU.exito && !antes.exito && antes.codigo === 'token-superado', 'antes de la actividad: T superado');
  await actividad(m, '1', 225);
  const mant = await trasMantenimiento();
  const conB = await autoridad('1');
  const rec = await recibo('T');
  comprobar(Boolean(rec) && rec.estado === 'hecho', `tras 225 guardados (y su mantenimiento, ${JSON.stringify(mant)}): el recibo de T sigue`, JSON.stringify(rec));
  m.store.fijar('meta.turno', 500);
  const eventos = [];
  const quitar = m.bus.on('save:done', (d) => eventos.push(d));
  const r = await g(m, '1', { token: 'T' });
  quitar?.();
  const despues = await autoridad('1');
  comprobar(!r.exito && r.codigo === 'token-superado' && eventos.length === 0 && nadaCambia(conB, despues) && turnoDe(despues.snap.texto) === 325 && concuerdan(despues),
    'T con el turno 500 NO se acepta: superado, sin save:done; autoridad y espejo siguen en el 325', JSON.stringify({ exito: r.exito, codigo: r.codigo, rev: despues.rec.rev, turno: turnoDe(despues.snap.texto) }));
  const m2 = await crearMotor({ semilla: 2 });
  m2.store.fijar('settings.persistencia', true);
  m2.bus.emit('settings:change', { id: 'persistencia', valor: true });
  const c = await m2.sistema('saves').cargar('1');
  comprobar(c.exito && m2.ver('meta.turno') === 325, 'cargar devuelve el 325 (lo posterior intacto)');
  m2.store.fijar('meta.turno', 600);
  const v = await g(m2, '1', { token: 'V-nueva' });
  comprobar(v.exito && !v.repetido && turnoDe((await autoridad('1')).snap.texto) === 600, 'una operación de verdad nueva sigue guardando');
});

await caso('B · La actividad viene de otra ranura', async () => {
  await limpiar();
  const m = await partida(1);
  m.store.fijar('meta.turno', 1);
  await g(m, '1', { token: 'T-B' });
  const textoA = (await autoridad('1')).snap.texto;
  m.store.fijar('meta.turno', 2);
  await g(m, '1', { token: 'U-B' });
  const conB = await autoridad('1');
  const otra = await partida(2, '2', 'Otra');
  await actividad(otra, '2', 225, { prefijo: 'otra' });
  await trasMantenimiento();
  const m3 = await crearMotor({ semilla: 3 });
  m3.store.fijar('settings.persistencia', true);
  m3.bus.emit('settings:change', { id: 'persistencia', valor: true });
  await m3.sistema('saves').cargar('1');
  m3.store.fijar('meta.turno', turnoDe(textoA));
  const conA = await g(m3, '1', { token: 'T-B' });
  m3.store.fijar('meta.turno', 77);
  const conC = await g(m3, '1', { token: 'T-B' });
  const otraRanura = await g(m3, '3', { token: 'T-B' });
  comprobar(!conA.exito && conA.codigo === 'token-superado' && !conC.exito && conC.codigo === 'token-superado' && nadaCambia(conB, await autoridad('1')),
    'retry de T con A o con C: superado; B sigue (autoridad y espejo)', JSON.stringify({ conA: conA.codigo, conC: conC.codigo }));
  comprobar(!otraRanura.exito && otraRanura.codigo === 'token-contenido' && crudo('arcanveil:partida:3') === null, 'T en otra ranura: conflicto de identidad (no se relaja)', otraRanura.codigo);
});

await caso('C · Campaña tranquila y otra muy activa', async () => {
  await limpiar();
  const m = await partida(4);
  const rT = await g(m, '1', { token: 'T-C' });
  const quieta = await autoridad('1');
  const otra = await partida(5, '2', 'Otra');
  await actividad(otra, '2', 225, { prefijo: 'act' });
  await trasMantenimiento();
  const m3 = await crearMotor({ semilla: 6 });
  m3.store.fijar('settings.persistencia', true);
  m3.bus.emit('settings:change', { id: 'persistencia', valor: true });
  await m3.sistema('saves').cargar('1');
  const igual = await g(m3, '1', { token: 'T-C' });
  const tras = await autoridad('1');
  comprobar(igual.exito && igual.repetido && igual.rev === rT.rev && igual.texto === rT.texto && nadaCambia(quieta, tras),
    'retry de T con el mismo contenido: repetido (misma revisión, bytes originales), nada nuevo', JSON.stringify({ exito: igual.exito, repetido: igual.repetido, codigo: igual.codigo, rev: tras.rec.rev, revT: rT.rev }));
  m3.store.dispatch('player/xp', { cantidad: 5, motivo: 'jugado' }); await tic();
  const distinto = await g(m3, '1', { token: 'T-C' });
  comprobar(!distinto.exito && distinto.codigo === 'token-contenido' && nadaCambia(quieta, await autoridad('1')), 'con otro contenido: conflicto y nada cambia', distinto.codigo);
});

await caso('D · Recibo deshecho y mucha actividad después', async () => {
  await limpiar();
  const m = await partida(7);
  await g(m, '1');
  const antes = await autoridad('1');
  // XP cambiada y restaurada EXACTA (sin las estadísticas que suma player/xp),
  // para poder repetir después el mismo contenido.
  const xp0 = m.ver('player.xp');
  m.store.fijar('player.xp', xp0 + 5);
  LS.setItem = function (k, v) { if (k === 'arcanveil:partida:1') throw Object.assign(new Error('lleno'), { name: 'QuotaExceededError' }); return orig.setItem.call(this, k, v); };
  const r1 = await g(m, '1', { token: 'T-D' });
  restaurarLS();
  const rec = await recibo('T-D');
  // Actividad de otra campaña por la escritura coordinada (en este arnés un
  // motor nuevo borraría la partida en memoria, que hace falta para repetir).
  const otraBase = JSON.parse(antes.snap.texto);
  otraBase.estado.meta.runId = 'run-otra-D';
  for (let i = 0; i < 225; i++) {
    otraBase.estado.meta.turno = i;
    const w = await Ranuras.conCandadoGlobal((lease) => Ranuras.escribirPartida({ lease, ranura: '2', runId: 'run-otra-D', texto: JSON.stringify(otraBase), token: `d-${i}` }));
    if (!w.ok) throw new Error(`actividad d-${i}: ${w.motivo}`);
  }
  await trasMantenimiento();
  comprobar(!r1.exito && r1.escritura === 'deshecha' && rec?.estado === 'deshecho' && nadaCambia(antes, await autoridad('1')) && (await recibo('T-D'))?.estado === 'deshecho',
    'el espejo no cupo: escritura deshecha, y su recibo «deshecho» sigue tras la actividad', JSON.stringify({ r1: r1.escritura, rec: (await recibo('T-D'))?.estado ?? null }));
  m.store.fijar('player.xp', xp0 + 9);
  const otroContenido = await g(m, '1', { token: 'T-D' });
  comprobar(!otroContenido.exito && otroContenido.codigo === 'token-contenido' && nadaCambia(antes, await autoridad('1')), 'mismo token con otro contenido: conflicto', otroContenido.codigo);
  m.store.fijar('player.xp', xp0 + 5);
  const rehecha = await g(m, '1', { token: 'T-D' });
  const tras = await autoridad('1');
  const otraVez = await g(m, '1', { token: 'T-D' });
  comprobar(rehecha.exito && !rehecha.repetido && tras.rec.rev === antes.rec.rev + 1 && concuerdan(tras) && otraVez.exito && otraVez.repetido && nadaCambia(tras, await autoridad('1')),
    'el mismo contenido se rehace UNA vez (una revisión más); repetirlo da «repetido»', JSON.stringify({ rehecha: [rehecha.exito, rehecha.repetido, rehecha.codigo], rev: tras.rec.rev, antes: antes.rec.rev, otraVez: [otraVez.exito, otraVez.repetido] }));
});

await caso('E · Otra instancia del gestor: la evidencia es la durable', async () => {
  await limpiar();
  const m = await partida(10);
  m.store.fijar('meta.turno', 3);
  await g(m, '1', { token: 'T-E' });
  m.store.fijar('meta.turno', 4);
  await g(m, '1', { token: 'U-E' });
  await actividad(m, '1', 225, { prefijo: 'e', turno0: 10 });
  await trasMantenimiento();
  const conB = await autoridad('1');
  const m2 = await crearMotor({ semilla: 11 });
  m2.store.fijar('settings.persistencia', true);
  m2.bus.emit('settings:change', { id: 'persistencia', valor: true });
  await m2.sistema('saves').cargar('1');
  m2.store.fijar('meta.turno', 3);
  const r = await g(m2, '1', { token: 'T-E' });
  comprobar(!r.exito && r.codigo === 'token-superado' && nadaCambia(conB, await autoridad('1')), 'un gestor nuevo (sin caché de la anterior) también lo rechaza: superado', r.codigo);
});

await caso('F · Dos «pestañas»: retry viejo y guardado nuevo a la vez', async () => {
  await limpiar();
  const m = await partida(12);
  m.store.fijar('meta.turno', 1);
  const rT = await g(m, '1', { token: 'T-F' });
  await actividad(m, '1', 225, { prefijo: 'f', turno0: 2 });
  await trasMantenimiento();
  const runId = m.ver('meta.runId');
  const viejoTexto = rT.texto;
  m.store.fijar('meta.turno', 999);
  const [viejo, nuevo] = await Promise.all([
    Ranuras.conCandadoGlobal((lease) => Ranuras.escribirPartida({ lease, ranura: '1', runId, texto: viejoTexto, token: 'T-F' })),
    g(m, '1', { token: 'N-F' }),
  ]);
  const tras = await autoridad('1');
  comprobar(!viejo.ok && viejo.codigo === 'token-superado' && nuevo.exito && turnoDe(tras.snap.texto) === 999 && concuerdan(tras),
    'el retry viejo se rechaza y el guardado nuevo queda; autoridad = espejo', JSON.stringify({ viejo: viejo.codigo, nuevo: nuevo.exito, turno: turnoDe(tras.snap.texto) }));
  const textoB = JSON.parse(tras.snap.texto); textoB.estado.player.xp = 4242;
  const [a, b] = await Promise.all([
    Ranuras.conCandadoGlobal((lease) => Ranuras.escribirPartida({ lease, ranura: '1', runId, texto: tras.snap.texto, token: 'F-dos' })),
    Ranuras.conCandadoGlobal((lease) => Ranuras.escribirPartida({ lease, ranura: '1', runId, texto: tras.snap.texto, token: 'F-dos' })),
  ]);
  const [c, d] = await Promise.all([
    Ranuras.conCandadoGlobal((lease) => Ranuras.escribirPartida({ lease, ranura: '1', runId, texto: tras.snap.texto, token: 'F-tres' })),
    Ranuras.conCandadoGlobal((lease) => Ranuras.escribirPartida({ lease, ranura: '1', runId, texto: JSON.stringify(textoB), token: 'F-tres' })),
  ]);
  comprobar([a, b].filter((x) => x.ok && x.repetido).length === 1 && [a, b].every((x) => x.ok) && [c, d].filter((x) => x.ok).length === 1 && [c, d].find((x) => !x.ok)?.codigo === 'token-contenido',
    'tras la actividad: mismo token y contenido a la vez = una operación; contenido distinto = un conflicto', JSON.stringify({ a: [a.ok, a.repetido], b: [b.ok, b.repetido], c: [c.ok, c.codigo], d: [d.ok, d.codigo] }));
});

await caso('G · Ningún mantenimiento borra recibos (también con cortes y cuota)', async () => {
  const base = Coordinacion.crearEnMemoria();
  let n = 0;
  const cortes = new Set([30, 31, 90, 150]);
  const envuelto = {
    ...base,
    async casVarios(claves, decidir) { return base.casVarios(claves, (x) => { const dd = decidir(x); if (dd && dd.some(Boolean) && claves.some(([al]) => al === O)) { n += 1; if (cortes.has(n)) throw Object.assign(new Error('lleno'), { name: 'QuotaExceededError' }); } return dd; }); },
  };
  restaurarLS();
  Coordinacion.usarCoordinacion(envuelto);
  for (const k of Array.from({ length: LS.length }, (_, i) => orig.key.call(LS, i))) if (k?.startsWith('arcanveil:')) orig.removeItem.call(LS, k);
  const m = await partida(13);
  m.store.fijar('meta.turno', 1);
  await g(m, '1', { token: 'T-G' });
  let hechos = 1;
  let fallidos = 0;
  for (let i = 0; i < 225; i++) {
    m.store.fijar('meta.turno', 2 + i);
    const r = await g(m, '1', { token: `g-${i}` });
    if (r.exito) hechos += 1; else fallidos += 1;
  }
  const mant = await trasMantenimiento();
  const todos = await Coordinacion.listar(O);
  const rec = await recibo('T-G');
  comprobar(typeof Ranuras.podarOperaciones !== 'function', 'no hay ninguna poda de recibos en el producto (no hay borrado que pueda cruzarse con un escritor)');
  comprobar(todos.length === hechos && rec?.estado === 'hecho' && fallidos === cortes.size,
    `tras 225 guardados con ${fallidos} cortes de cuota: ${todos.length} recibos = ${hechos} operaciones confirmadas; T sigue (${JSON.stringify(mant)})`, JSON.stringify({ recibos: todos.length, hechos, fallidos, T: rec?.estado ?? null }));
  m.store.fijar('meta.turno', 5000);
  const r = await g(m, '1', { token: 'T-G' });
  comprobar(!r.exito && r.codigo === 'token-superado', 'T sigue sin poder reaplicarse', r.codigo);
  Coordinacion.usarCoordinacion(Coordinacion.crearEnMemoria());
});

await caso('H · Variantes del contenido y de la identidad, tras la actividad', async () => {
  const variantes = [
    ['turno', (m) => m.store.fijar('meta.turno', 31337)],
    ['XP', (m) => m.store.dispatch('player/xp', { cantidad: 40, motivo: 'jugado' })],
    ['vida', (m) => m.store.fijar('player.vida.actual', 2)],
    ['inventario', (m) => { const ids = Object.keys(m.ver('inventory.objetos.porId', {})); m.store.fijar(`inventory.objetos.porId.${ids[0]}.cantidad`, 9); }],
  ];
  for (const [que, cambiar] of variantes) {
    await limpiar();
    const m = await partida(14);
    await g(m, '1', { token: `T-H-${que}` });
    const quieta = await autoridad('1');
    const otra = await partida(15, '2', 'Otra');
    await actividad(otra, '2', 225, { prefijo: `h-${que}` });
    await trasMantenimiento();
    const m3 = await crearMotor({ semilla: 16 });
    m3.store.fijar('settings.persistencia', true);
    m3.bus.emit('settings:change', { id: 'persistencia', valor: true });
    await m3.sistema('saves').cargar('1');
    cambiar(m3); await tic();
    const r = await g(m3, '1', { token: `T-H-${que}` });
    comprobar(!r.exito && r.codigo === 'token-contenido' && nadaCambia(quieta, await autoridad('1')), `cambia ${que}: conflicto, nada cambia`, r.codigo);
  }
  // Combate.
  await limpiar();
  const mc = await partida(17);
  await g(mc, '1', { token: 'T-H-combate' });
  const quietaC = await autoridad('1');
  await actividad(await partida(18, '2', 'Otra'), '2', 225, { prefijo: 'hc' });
  await trasMantenimiento();
  const m3 = await crearMotor({ semilla: 19 });
  m3.store.fijar('settings.persistencia', true);
  m3.bus.emit('settings:change', { id: 'persistencia', valor: true });
  await m3.sistema('saves').cargar('1');
  m3.bus.emit('combat:request', { enemies: [{ refId: 'guardia_corrupto', count: 1 }] });
  for (let i = 0; i < 400 && !(m3.ver('combat.activo', false) && m3.sistema('combat').esperandoJugador); i++) await tic(5);
  const rc = await g(m3, '1', { token: 'T-H-combate' });
  comprobar(m3.ver('combat.activo', false) && !rc.exito && rc.codigo === 'token-contenido' && nadaCambia(quietaC, await autoridad('1')), 'en combate: conflicto, nada cambia', rc.codigo);
  // Run, ranura y operación.
  m3.store.fijar('meta.runId', 'run-otro-H');
  const rr = await g(m3, '1', { token: 'T-H-combate' });
  const rs = await g(m3, '4', { token: 'T-H-combate' });
  comprobar(!rr.exito && rr.codigo === 'token-contenido' && !rs.exito && rs.codigo === 'token-contenido' && crudo('arcanveil:partida:4') === null, 'otro run u otra ranura: conflicto', JSON.stringify([rr.codigo, rs.codigo]));
  await limpiar();
  const mk = await crearMotor({ semilla: 20 });
  mk.store.fijar('settings.persistencia', true);
  mk.bus.emit('settings:change', { id: 'persistencia', valor: true });
  await Entrega.crearPartidaNueva({
    runDestino: 'RUN-H', ranura: '3',
    crear: async ({ ranura }) => { mk.store.reiniciar(); mk.store.fijar('settings.persistencia', true); mk.store.fijar('meta.ranura', ranura); mk.store.dispatch('player/crear', { borrador: BORR('Kira'), runId: 'RUN-H' }); await tic(); },
    guardar: async (p) => { const x = await mk.sistema('saves').guardar(p.ranura, { silencioso: true, lease: p.lease, op: p.op, token: 'T-H-op' }); return { ok: x.exito, motivo: x.motivo, texto: x.texto, intentado: x.intentado }; },
  });
  const quieta3 = await autoridad('3');
  await actividad(await partida(21, '2', 'Otra'), '2', 225, { prefijo: 'hop' });
  await trasMantenimiento();
  const mk2 = await crearMotor({ semilla: 22 });
  mk2.store.fijar('settings.persistencia', true);
  mk2.bus.emit('settings:change', { id: 'persistencia', valor: true });
  await mk2.sistema('saves').cargar('3');
  const sinOp = await g(mk2, '3', { token: 'T-H-op' });
  comprobar(!sinOp.exito && sinOp.codigo === 'token-contenido' && nadaCambia(quieta3, await autoridad('3')), 'el token de una creación (otra operación): conflicto', sinOp.codigo);
});

await caso('I · Relojes iguales y hacia atrás', async () => {
  await limpiar();
  const realNow = Date.now;
  const m = await partida(23);
  m.store.fijar('meta.turno', 1);
  try {
    Date.now = () => 1700000000000;
    await g(m, '1', { token: 'T-I' });
    m.store.fijar('meta.turno', 2);
    await g(m, '1', { token: 'U-I' });
    let t = 1700000000000;
    Date.now = () => (t -= 1000);
    await actividad(m, '1', 225, { prefijo: 'i', turno0: 3 });
    await trasMantenimiento();
    const conB = await autoridad('1');
    m.store.fijar('meta.turno', 1);
    const r = await g(m, '1', { token: 'T-I' });
    comprobar(!r.exito && r.codigo === 'token-superado' && nadaCambia(conB, await autoridad('1')), 'con la misma hora en todo y el reloj hacia atrás: T sigue superado', r.codigo);
    // Campaña tranquila con empates de hora: su último commit no se pierde.
    Date.now = () => 1600000000000;
    const q = await partida(24, '2', 'Quieta');
    const rq = await g(q, '2', { token: 'T-I-quieta' });
    await actividad(await partida(25, '3', 'Activa'), '3', 225, { prefijo: 'i2' });
    await trasMantenimiento();
    const q2 = await crearMotor({ semilla: 26 });
    q2.store.fijar('settings.persistencia', true);
    q2.bus.emit('settings:change', { id: 'persistencia', valor: true });
    await q2.sistema('saves').cargar('2');
    const rr = await g(q2, '2', { token: 'T-I-quieta' });
    comprobar(rr.exito && rr.repetido && rr.rev === rq.rev, 'empates de hora: el último commit de la campaña tranquila sigue idempotente', JSON.stringify({ exito: rr.exito, repetido: rr.repetido, codigo: rr.codigo }));
  } finally {
    Date.now = realNow;
  }
});

await caso('J · Volumen: crecimiento y tiempo con datos ficticios', async () => {
  await limpiar();
  const m = await partida(27);
  const N = 2000;
  const t0 = performance.now();
  for (let i = 0; i < N; i++) {
    m.store.fijar('meta.turno', i);
    const r = await g(m, '1', { token: `vol-${i}` });
    if (!r.exito) throw new Error(`volumen ${i}: ${r.motivo}`);
  }
  const ms = performance.now() - t0;
  const todos = await Coordinacion.listar(O);
  const bytes = todos.reduce((s, [k, v]) => s + k.length + JSON.stringify(v).length, 0);
  const partidaBytes = (await autoridad('1')).snap.texto.length;
  console.log(`     medido: ${N} guardados con token en ${Math.round(ms)} ms (${(ms / N).toFixed(2)} ms/guardado, motor en Node, doble de candados y estado en memoria);`);
  console.log(`     recibos: ${todos.length}, ${bytes} B en total (${(bytes / todos.length).toFixed(0)} B/recibo); una partida ocupa ${partidaBytes} B`);
  comprobar(todos.length === N && (await recibo('vol-0'))?.estado === 'hecho', `${N} operaciones con token: ${N} recibos, el primero intacto (crecimiento lineal, sin poda)`);
});

restaurarLS();
console.log(`\n${casos - fallos}/${casos} comprobaciones correctas`);
process.exitCode = fallos ? 1 : 0;
