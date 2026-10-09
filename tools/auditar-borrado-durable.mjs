/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCANVEIL · tools/auditar-borrado-durable.mjs
 * ---------------------------------------------------------------------------
 * Encargo #11 del 9-oct-2026: lo borrado o reemplazado NO vuelve por un
 * guardado tardío de una pestaña vieja, y «Borrar» dice lo que de verdad pasó.
 *
 * Repros de la revisión externa sobre 388402c:
 *   · A guardada → Borrar todo → B ocupa la ranura → se borra B → el guardado
 *     tardío de A da éxito y la recrea (la lápida solo recordaba a B);
 *   · la automática ignora la lápida (guardar('auto') tras Borrar todo);
 *   · Borrar todo con el vaciado del estado coordinado fallando: «Se ha
 *     borrado todo», el espejo vacío y la autoridad todavía con la partida.
 *
 * «Otra pestaña» en Node es un SEGUNDO gestor de guardado en el mismo proceso
 * (mismo estado, misma memoria del juego: no es una pestaña real). La partida
 * vieja conserva así su gestor y lo que sabe; B, C y D se escriben por la API
 * del protocolo. Las pestañas de verdad se prueban en Chrome
 * (`tools/regresion-app.mjs`, etapa #11).
 *
 *   node tools/auditar-borrado-durable.mjs
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { crearMotor, candadosDePrueba } from './motor-sin-ventana.mjs';

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
const Registro = await import('../src/persistence/RegistroRuns.js');
const R = Coordinacion.ALMACENES.RANURAS;
const P = Coordinacion.ALMACENES.PARTIDAS;
const O = Coordinacion.ALMACENES.OPERACIONES;

const LS = globalThis.localStorage;
const orig = { getItem: LS.getItem, setItem: LS.setItem, key: LS.key, removeItem: LS.removeItem };
const restaurarLS = () => Object.assign(LS, orig);
const crudo = (k) => orig.getItem.call(LS, k);
const BORR = (nombre) => ({ nombre, raza: 'valdes', clase: 'rastreador', trasfondo: 'errante', genero: 'f' });
async function limpiar() {
  restaurarLS();
  Coordinacion.usarCoordinacion(Coordinacion.crearEnMemoria());
  Entrega.usarCandados(candadosDePrueba);
  for (const k of Array.from({ length: LS.length }, (_, i) => orig.key.call(LS, i))) if (k?.startsWith('arcanveil:') || k?.startsWith('otro-juego:')) orig.removeItem.call(LS, k);
}
async function partida(semilla, ranura = '1', nombre = 'Ana') {
  const m = await crearMotor({ semilla });
  await m.empezar(BORR(nombre));
  m.store.fijar('meta.ranura', ranura);
  return m;
}
const g = (m, n, opciones = {}) => m.sistema('saves').guardar(String(n), { silencioso: true, ...opciones });
/** Un SEGUNDO gestor de guardado sobre el mismo estado (otra «pestaña» de Node, sin su memoria). */
function otroGestor(m) {
  const SM = m.sistema('saves').constructor;
  const o = new SM({ store: m.store, bus: m.bus, rng: m.rng, registry: m.registry });
  o._disponible = true;
  return o;
}
const avisos = [];
function oirAvisos(m) { m.bus.on('ui:notice', (a) => avisos.push(a)); }
async function lectura(n) {
  return {
    rec: await Coordinacion.leer(R, String(n)),
    snap: await Coordinacion.leer(P, String(n)),
    espejo: crudo(`arcanveil:partida:${n}`),
  };
}
const runDe = (texto) => { try { return JSON.parse(texto)?.estado?.meta?.runId ?? null; } catch { return 'ILEGIBLE'; } };
/** Una partida válida con otro run (para B, C y D, por la API del protocolo). */
function textoCon(textoBase, runId, nombre) {
  const g2 = JSON.parse(textoBase);
  g2.estado.meta.runId = runId;
  g2.estado.player.nombre = nombre;
  g2.cabecera = { ...g2.cabecera, runId, nombre };
  return JSON.stringify(g2);
}
/** Crear una campaña nueva por el protocolo (reserva + escritura con su operación), sin tocar la partida en memoria. */
async function crearPorProtocolo(ranura, runId, texto, reemplazo = null) {
  return Entrega.crearPartidaNueva({
    runDestino: runId, ranura, reemplazo,
    crear: async () => {},
    guardar: async ({ lease, op, ranura: slot }) => {
      const w = await Ranuras.escribirPartida({ lease, ranura: slot, runId, texto, op });
      if (w.ok) orig.setItem.call(LS, `arcanveil:partida:${slot}`, w.texto ?? texto);
      return { ok: w.ok, motivo: w.motivo, texto: w.texto ?? texto };
    },
  });
}
async function permisoDe(n) {
  const c = (await Ranuras.ocupacion()).find((x) => x.ranura === String(n));
  return { ranura: c.ranura, runId: c.runId ?? null, guardadoEn: c.guardadoEn ?? null, huella: c.huella ?? null, rev: c.rev ?? null };
}
/** Una campaña nueva DE VERDAD (motor nuevo, creación con arriendo y operación), y que se pueda jugar y guardar. */
async function creacionReal(semilla, ranura, nombre, runId, reemplazo = null) {
  const m = await crearMotor({ semilla });
  m.store.fijar('settings.persistencia', true);
  m.bus.emit('settings:change', { id: 'persistencia', valor: true });
  const r = await Entrega.crearPartidaNueva({
    runDestino: runId, ranura, reemplazo,
    crear: async ({ ranura: slot }) => { m.store.reiniciar(); m.store.fijar('settings.persistencia', true); m.store.fijar('meta.ranura', slot); m.store.dispatch('player/crear', { borrador: BORR(nombre), runId }); await tic(); },
    guardar: async (p) => { const x = await m.sistema('saves').guardar(p.ranura, { silencioso: true, lease: p.lease, op: p.op }); return { ok: x.exito, motivo: x.motivo, texto: x.texto, intentado: x.intentado }; },
  });
  m.store.dispatch('player/xp', { cantidad: 3, motivo: 'jugado' }); await tic();
  const sigue = r.ok ? await g(m, ranura) : null;
  return { m, r, sigue };
}

/* ═══════════════════════════════════════════════════════════════════════ */

await caso('A · A guardada → Borrar todo → B → se borra B → guardado tardío de A', async () => {
  await limpiar();
  const ma = await partida(9303, '1', 'Ana');
  const runA = ma.ver('meta.runId');
  const gA0 = await g(ma, '1');
  const otro = otroGestor(ma);
  const todo = await otro.borrarTodo();
  const cb = await crearPorProtocolo('1', 'RUN-B', textoCon(gA0.texto, 'RUN-B', 'Bea'));
  const bb = await otro.borrar('1', { runId: 'RUN-B' });
  const antes = await lectura('1');
  const eventos = [];
  const quitar = ma.bus.on('save:done', (d) => eventos.push(d));
  const tardio = await g(ma, '1');
  quitar?.();
  const despues = await lectura('1');
  comprobar(gA0.exito && cb.ok && bb !== false && antes.rec?.estado === 'borrada' && !antes.snap && antes.espejo === null,
    'preparado: A guardada, Borrar todo, B creada y borrada (lápida, sin copia ni espejo)', JSON.stringify({ todo, cb: cb.ok, bb, antes: antes.rec }));
  comprobar(!tardio.exito && eventos.length === 0 && despues.rec?.estado === 'borrada' && despues.rec?.rev === antes.rec?.rev && !despues.snap && despues.espejo === null,
    'el guardado tardío de A se RECHAZA: sin save:done; la ranura sigue borrada (misma revisión, sin copia ni espejo)', JSON.stringify({ exito: tardio.exito, codigo: tardio.codigo, despues: { estado: despues.rec?.estado, run: despues.rec?.runId, rev: despues.rec?.rev, snap: Boolean(despues.snap), espejo: despues.espejo !== null } }));
  comprobar(/borr/i.test(tardio.motivo ?? ''), `el motivo lo dice en claro («${tardio.motivo}»)`);
  const c = await creacionReal(31, '1', 'Cira', 'RUN-C');
  const trasC = await lectura('1');
  comprobar(c.r.ok && c.sigue?.exito && trasC.rec?.runId === 'RUN-C' && runDe(trasC.snap?.texto) === 'RUN-C' && runDe(trasC.espejo) === 'RUN-C',
    'una campaña NUEVA (C) creada de verdad sí ocupa la ranura y sigue guardando', JSON.stringify({ r: c.r.ok, sigue: c.sigue?.motivo }));
  void runA;
});

await caso('B · A → B → C por reemplazos y borrado; otra ranura no se toca', async () => {
  await limpiar();
  const ma = await partida(1, '1', 'Ana');
  const gA = await g(ma, '1');
  const d = await crearPorProtocolo('2', 'RUN-D', textoCon(gA.texto, 'RUN-D', 'Dina'));
  const textoB = textoCon(gA.texto, 'RUN-B', 'Bea');
  const b = await crearPorProtocolo('1', 'RUN-B', textoB, await permisoDe('1'));
  const recB = await Coordinacion.leer(R, '1');
  const c = await crearPorProtocolo('1', 'RUN-C', textoCon(gA.texto, 'RUN-C', 'Cira'), await permisoDe('1'));
  const otro = otroGestor(ma);
  await otro.borrar('1', { runId: 'RUN-C' });
  const antes = await lectura('1');
  const retryA = await g(ma, '1');
  const retryB = await Ranuras.conCandadoGlobal((lease) => Ranuras.escribirPartida({ lease, ranura: '1', runId: 'RUN-B', texto: textoB, revBase: recB?.rev ?? null }));
  const retryB2 = await Ranuras.conCandadoGlobal((lease) => Ranuras.escribirPartida({ lease, ranura: '1', runId: 'RUN-B', texto: textoB }));
  const despues = await lectura('1');
  comprobar(d.ok && b.ok && c.ok && !retryA.exito && !retryB.ok && !retryB2.ok && despues.rec?.estado === 'borrada' && despues.rec?.rev === antes.rec?.rev && !despues.snap && despues.espejo === null,
    'ni A (su gestor) ni B (por la API, con y sin su revisión) reaparecen en la ranura ya libre', JSON.stringify({ retryA: retryA.codigo, retryB: retryB.codigo, retryB2: retryB2.codigo, despues: despues.rec }));
  const d1 = await lectura('2');
  const dGuarda = await Ranuras.conCandadoGlobal((lease) => Ranuras.escribirPartida({ lease, ranura: '2', runId: 'RUN-D', texto: d1.snap.texto, revBase: d1.rec.rev }));
  comprobar(d1.rec?.runId === 'RUN-D' && d1.espejo !== null && dGuarda.ok, 'la ranura 2 (D) no se ha tocado y D sigue guardando', JSON.stringify({ d: d1.rec, dGuarda: dGuarda.codigo }));
});

await caso('C · La automática tras Borrar todo, con y sin token', async () => {
  await limpiar();
  const ma = await partida(2, '1', 'Ana');
  const a1 = await g(ma, 'auto', { token: 'T-auto' });
  await otroGestor(ma).borrarTodo();
  const conToken = await g(ma, 'auto', { token: 'T-auto' });
  const sinToken = await g(ma, 'auto');
  const despues = await lectura('auto');
  comprobar(a1.exito && !conToken.exito && !sinToken.exito && !despues.snap && despues.espejo === null && despues.rec?.estado !== 'ocupada',
    'el guardado viejo en la automática (con y sin token) no la recrea', JSON.stringify({ conToken: [conToken.exito, conToken.codigo], sinToken: [sinToken.exito, sinToken.codigo], rec: despues.rec, snap: Boolean(despues.snap) }));
  const mn = await partida(3, '4', 'Nueva');
  const nueva = await g(mn, 'auto');
  const tras = await lectura('auto');
  comprobar(nueva.exito && tras.rec?.runId === mn.ver('meta.runId') && runDe(tras.espejo) === mn.ver('meta.runId'), 'una campaña nueva sí puede usar la automática', nueva.motivo);
});

await caso('D · Un guardado en cola antes del borrado, en los dos órdenes', async () => {
  for (const orden of ['guardar-primero', 'borrar-primero']) {
    await limpiar();
    const ma = await partida(4, '1', 'Ana');
    await g(ma, '1');
    const otro = otroGestor(ma);
    let soltar;
    const retenido = candadosDePrueba.request(Ranuras.CANDADO_GLOBAL, () => new Promise((r) => { soltar = r; }));
    await tic();
    let pGuardar;
    let pBorrar;
    if (orden === 'guardar-primero') { pGuardar = g(ma, '1'); await tic(5); pBorrar = otro.borrarTodo(); } else { pBorrar = otro.borrarTodo(); await tic(5); pGuardar = g(ma, '1'); }
    await tic(5);
    soltar(); await retenido;
    const [rg, rb] = await Promise.all([pGuardar, pBorrar]);
    const tardio = await g(ma, '1');
    const fin = await lectura('1');
    const coherente = orden === 'guardar-primero' ? rg.exito : !rg.exito;
    comprobar(coherente && (rb?.borradas ?? 0) >= 0 && !tardio.exito && !fin.snap && fin.espejo === null && fin.rec?.estado !== 'ocupada',
      `${orden}: el resultado del guardado en cola corresponde a su orden (${rg.exito ? 'guardó antes del borrado' : 'rechazado'}) y después no revive`, JSON.stringify({ rg: [rg.exito, rg.codigo], tardio: [tardio.exito, tardio.codigo], fin: fin.rec }));
  }
});

await caso('F · Parámetros manipulados no dan capacidad nueva', async () => {
  await limpiar();
  const ma = await partida(5, '1', 'Ana');
  const runA = ma.ver('meta.runId');
  const gA = await g(ma, '1', { token: 'T-viejo' });
  await otroGestor(ma).borrar('1', { runId: runA });
  const antes = await lectura('1');
  const conOp = await g(ma, '1', { op: 'cualquiera' });
  const conTokenNuevo = await g(ma, '1', { token: 'T-nuevo' });
  const conTokenViejo = await g(ma, '1', { token: 'T-viejo' });
  const identico = await Ranuras.conCandadoGlobal((lease) => Ranuras.escribirPartida({ lease, ranura: '1', runId: runA, texto: gA.texto }));
  const identicoOp = await Ranuras.conCandadoGlobal((lease) => Ranuras.escribirPartida({ lease, ranura: '1', runId: runA, texto: gA.texto, op: 'inventada' }));
  ma.store.dispatch('player/xp', { cantidad: 7, motivo: 'jugado' }); await tic();
  const cambiado = await g(ma, '1', { op: 'nueva-x' });
  const despues = await lectura('1');
  const todos = [conOp.exito, conTokenNuevo.exito, conTokenViejo.exito, identico.ok, identicoOp.ok, cambiado.exito];
  comprobar(todos.every((x) => !x) && despues.rec?.estado === 'borrada' && despues.rec?.rev === antes.rec?.rev && !despues.snap && despues.espejo === null,
    'con «op» inventado, token nuevo o viejo, la foto idéntica o cambiada: nada vuelve', JSON.stringify({ conOp: conOp.codigo, nuevo: conTokenNuevo.codigo, viejo: conTokenViejo.codigo, identico: identico.codigo, identicoOp: identicoOp.codigo, cambiado: cambiado.codigo }));
  const c = await creacionReal(32, '1', 'Cira', 'RUN-F-C');
  comprobar(c.r.ok && c.sigue?.exito, 'una creación con su arriendo y su operación válidos sí funciona', JSON.stringify(c.r));
});

await caso('G · Borrar una ranura frente a Borrar todo; manual y automática no se confunden', async () => {
  await limpiar();
  const ma = await partida(6, '1', 'Ana');
  const gA = await g(ma, '1');
  await g(ma, 'auto');
  await crearPorProtocolo('2', 'RUN-D', textoCon(gA.texto, 'RUN-D', 'Dina'));
  const otro = otroGestor(ma);
  await otro.borrar('1');
  const dos = await lectura('2');
  const auto = await lectura('auto');
  const autoOtraVez = await g(ma, 'auto');
  comprobar(dos.rec?.runId === 'RUN-D' && dos.espejo !== null && auto.snap && autoOtraVez.exito, 'borrar la ranura 1 no toca la 2 ni la automática (que A sigue pudiendo usar)', JSON.stringify({ dos: dos.rec?.runId, auto: Boolean(auto.snap), autoOtraVez: autoOtraVez.codigo }));
  await otro.borrarTodo();
  const [l1, l2, la] = [await lectura('1'), await lectura('2'), await lectura('auto')];
  comprobar([l1, l2, la].every((x) => !x.snap && x.espejo === null), 'Borrar todo: ni copia ni espejo en ninguna');
});

await caso('H · El vaciado del estado coordinado falla: no se anuncia éxito', async () => {
  await limpiar();
  const ma = await partida(7, '1', 'Ana');
  oirAvisos(ma);
  await g(ma, '1');
  const real = Coordinacion.motorActual();
  Coordinacion.usarCoordinacion({ ...real, async vaciar() { throw new Error('injected quota'); }, async transaccionCompleta() { throw new Error('injected quota'); } });
  avisos.length = 0;
  const r = await otroGestor(ma).borrarTodo();
  const aviso = avisos.at(-1);
  const tras = await lectura('1');
  Coordinacion.usarCoordinacion(real);
  comprobar(r?.ok === false && aviso?.tipo !== 'exito' && !/Se ha borrado todo/.test(aviso?.mensaje ?? ''),
    `el resultado y el aviso no dicen «borrado» (${JSON.stringify(r)}; «${aviso?.mensaje}»)`);
  comprobar(tras.snap && tras.espejo !== null && runDe(tras.espejo) === runDe(tras.snap.texto), 'nada a medias: la copia y el espejo siguen los dos (no se borra el espejo si la autoridad no se pudo)', JSON.stringify({ snap: Boolean(tras.snap), espejo: tras.espejo !== null }));
  const r2 = await otroGestor(ma).borrarTodo();
  const fin = await lectura('1');
  const tardio = await g(ma, '1');
  comprobar(r2?.ok === true && !fin.snap && fin.espejo === null && !tardio.exito, 'el reintento lo completa y la partida vieja no revive', JSON.stringify({ r2, tardio: tardio.codigo }));
});

await caso('E · Sin memoria de la pestaña: un gestor nuevo (como tras recargar) tampoco revive', async () => {
  await limpiar();
  const ma = await partida(17, '1', 'Ana');
  const gA = await g(ma, '1');
  const gAuto = await g(ma, 'auto');
  const runA = ma.ver('meta.runId');
  await otroGestor(ma).borrarTodo();
  // Un gestor recién hecho no sabe nada de épocas ni revisiones: lo que
  // impide revivir está en el estado coordinado, no en la memoria.
  const nuevo = otroGestor(ma);
  const enSuRanura = await nuevo.guardar('1', { silencioso: true });
  const enAuto = await nuevo.guardar('auto', { silencioso: true });
  const directo = await Ranuras.conCandadoGlobal((lease) => Ranuras.escribirPartida({ lease, ranura: '1', runId: runA, texto: gA.texto }));
  const directoAuto = await Ranuras.conCandadoGlobal((lease) => Ranuras.escribirPartida({ lease, ranura: 'auto', runId: runA, texto: gAuto.texto, compartida: true }));
  const [l1, la] = [await lectura('1'), await lectura('auto')];
  comprobar(!enSuRanura.exito && !enAuto.exito && !directo.ok && !directoAuto.ok && !l1.snap && !la.snap && l1.espejo === null && la.espejo === null,
    'ni por el gestor sin memoria ni por la API directa vuelve A a su ranura o a la automática', JSON.stringify({ enSuRanura: enSuRanura.codigo, enAuto: enAuto.codigo, directo: directo.codigo, directoAuto: directoAuto.codigo }));
  comprobar([enSuRanura, enAuto].every((x) => x.codigo === 'invalidada') && [directo, directoAuto].every((x) => x.codigo === 'invalidada'), 'el código es «invalidada» en los cuatro');
});

/**
 * Cortes en cada frontera del borrado total. Antes de la transacción o
 * dentro de ella no se aplica nada (todo o nada); después, cada paso del
 * espejo, el cierre de la intención y la relectura. Tras cada corte se
 * «reinicia» (un motor nuevo arranca) y se mira el resultado.
 */
await caso('I · Cortes en cada frontera del borrado total y recuperación al arrancar', async () => {
  const cortes = [
    { id: 'antes de la transacción', nada: true, poner(real) { return { ...real, async transaccionCompleta() { throw new Error('proceso caído'); } }; } },
    { id: 'dentro de la transacción (decidida, sin aplicar)', nada: true, poner(real) { return { ...real, async transaccionCompleta(decidir) { return real.transaccionCompleta((d) => { decidir(d); throw new Error('proceso caído'); }); } }; } },
    { id: 'tras la transacción, antes del espejo', espejo: 0 },
    { id: 'a mitad del espejo', espejo: 1 },
    { id: 'tras el espejo, al cerrar la intención', poner(real) { return { ...real, async cas(a, k, f) { if (a === Coordinacion.ALMACENES.META) throw new Error('proceso caído'); return real.cas(a, k, f); } }; } },
    { id: 'antes de la relectura', poner(real) { return { ...real, async listar(a) { if (a === P) throw new Error('proceso caído'); return real.listar(a); } }; } },
  ];
  for (const c of cortes) {
    await limpiar();
    const ma = await partida(8, '1', 'Ana');
    const gA = await g(ma, '1');
    // El estado del motor es compartido: el run de A se fija ahora (después se crean otros motores).
    const runA = ma.ver('meta.runId');
    await g(ma, '2');
    orig.setItem.call(LS, 'arcanveil:personajes', '[{"id":"p1"}]');
    const real = Coordinacion.motorActual();
    if (c.poner) Coordinacion.usarCoordinacion(c.poner(real));
    let quitadas = 0;
    if (c.espejo !== undefined) LS.removeItem = function (k) { if (String(k).startsWith('arcanveil:') && quitadas++ >= c.espejo) throw new Error('proceso caído'); return orig.removeItem.call(this, k); };
    const r = await otroGestor(ma).borrarTodo().catch((e) => ({ lanzo: e.message }));
    restaurarLS();
    Coordinacion.usarCoordinacion(real);
    const trasCorte = { uno: await lectura('1'), dos: await lectura('2'), pendiente: await Coordinacion.leer(Coordinacion.ALMACENES.META, 'borradoPendiente') };
    // Mientras tanto, una campaña nueva legítima guarda (su espejo no se debe perder).
    const mn = await partida(9, '3', 'Nueva');
    const gn = await g(mn, '3');
    // «Reinicio»: un motor nuevo arranca y termina lo pendiente.
    const m2 = await crearMotor({ semilla: 10 });
    await m2.sistema('saves').drenar?.(5000);
    const tardio = await Ranuras.conCandadoGlobal((lease) => Ranuras.escribirPartida({ lease, ranura: '1', runId: runA, texto: gA.texto, revBase: trasCorte.uno.rec?.rev ?? null }));
    const fin = { uno: await lectura('1'), dos: await lectura('2'), pendiente: await Coordinacion.leer(Coordinacion.ALMACENES.META, 'borradoPendiente') };
    const detalle = JSON.stringify({ r: { ok: r?.ok, autoridad: r?.autoridad, restos: r?.restos?.length, motivo: r?.motivo, lanzo: r?.lanzo }, trasCorte: { snap1: Boolean(trasCorte.uno.snap), pendiente: Boolean(trasCorte.pendiente) }, gn: gn.exito, espejo1: fin.uno.espejo !== null, espejo2: fin.dos.espejo !== null, personajes: crudo('arcanveil:personajes'), espejo3: crudo('arcanveil:partida:3') !== null, pendiente: Boolean(fin.pendiente), tardio: [tardio.ok, tardio.codigo] });
    if (c.nada) {
      // Sin falsa ausencia: A sigue entera (copia y espejo) y sigue guardando.
      comprobar(r?.ok === false && r?.autoridad === false && trasCorte.uno.snap && trasCorte.dos.snap && fin.uno.espejo !== null && crudo('arcanveil:personajes') !== null && !fin.pendiente && gn.exito && tardio.ok,
        `${c.id}: no se ha borrado nada y se dice; A sigue entera y guardando; nada pendiente`, detalle);
    } else {
      comprobar(r?.ok !== true, `${c.id}: el resultado no dice «completo»`, detalle);
      comprobar(!trasCorte.uno.snap && !trasCorte.dos.snap && gn.exito && fin.uno.espejo === null && fin.dos.espejo === null && crudo('arcanveil:personajes') === null && crudo('arcanveil:partida:3') !== null && !fin.pendiente && !tardio.ok,
        `${c.id}: al arrancar se termina el espejo, la campaña nueva conserva el suyo, no queda nada pendiente y la vieja no revive`, detalle);
    }
  }
});

await caso('J · Fallo al apuntar el borrado de UNA ranura', async () => {
  await limpiar();
  const ma = await partida(11, '1', 'Ana');
  oirAvisos(ma);
  await g(ma, '1');
  const real = Coordinacion.motorActual();
  Coordinacion.usarCoordinacion({ ...real, async casVarios() { throw new Error('injected'); }, async cas() { throw new Error('injected'); } });
  avisos.length = 0;
  const r = await otroGestor(ma).borrar('1');
  Coordinacion.usarCoordinacion(real);
  const tras = await lectura('1');
  comprobar(r === false && tras.snap && tras.espejo !== null && avisos.some((a) => a.tipo !== 'exito'), 'no se borra a medias y se dice (la copia y el espejo siguen)', JSON.stringify({ r, avisos: avisos.map((a) => a.mensaje) }));
  // Fallo al LISTAR (dueño o recibos): no se degrada a «vacío» ni se borra sin invalidar.
  for (const roto of ['leer', 'listar']) {
    Coordinacion.usarCoordinacion({ ...real, async [roto]() { throw new Error('injected'); } });
    avisos.length = 0;
    const r2 = await otroGestor(ma).borrar('1');
    Coordinacion.usarCoordinacion(real);
    const tras2 = await lectura('1');
    comprobar(r2 === false && tras2.snap && tras2.rec?.estado === 'ocupada' && tras2.espejo !== null && avisos.some((a) => a.tipo !== 'exito' && /sigue como estaba/.test(a.mensaje)),
      `con «${roto}» fallando no se borra nada y se dice que sigue como estaba`, JSON.stringify({ r2, avisos: avisos.map((a) => a.mensaje) }));
  }
  const r3 = await otroGestor(ma).borrar('1');
  const fin = await lectura('1');
  const inv = await Coordinacion.leer(Coordinacion.ALMACENES.INVALIDADOS, `1|${ma.ver('meta.runId')}`);
  comprobar(r3 === true && fin.rec?.estado === 'borrada' && !fin.snap && fin.espejo === null && inv?.motivo === 'borrada', 'el reintento borra e invalida (motivo «borrada»)', JSON.stringify({ r3, inv }));
});

await caso('K · Sin IndexedDB o sin Web Locks', async () => {
  await limpiar();
  const ma = await partida(12, '1', 'Ana');
  await g(ma, '1');
  oirAvisos(ma);
  avisos.length = 0;
  const real = Coordinacion.motorActual();
  Coordinacion.usarCoordinacion(null);
  const r = await otroGestor(ma).borrarTodo();
  const sinCoord = await g(ma, '1');
  Coordinacion.usarCoordinacion(real);
  comprobar(crudo('arcanveil:partida:1') === null && r?.sinCoordinacion === true && avisos.some((a) => /pestañas/i.test(a.mensaje ?? '')) && !sinCoord.exito,
    'sin IndexedDB: se borra lo local, se dice el límite entre pestañas y guardar sigue negándose', JSON.stringify({ r, avisos: avisos.map((a) => a.mensaje), sinCoord: sinCoord.codigo }));
  await limpiar();
  const mb = await partida(13, '1', 'Ana');
  await g(mb, '1');
  Entrega.usarCandados({});
  const r2 = await otroGestor(mb).borrarTodo();
  const sinLock = await g(mb, '1');
  Entrega.usarCandados(candadosDePrueba);
  comprobar(r2?.ok === true && r2?.sinCandado === true && !sinLock.exito && !(await lectura('1')).snap, 'sin Web Locks: el borrado (una transacción) se hace y lo dice; guardar sigue negándose', JSON.stringify({ r2, sinLock: sinLock.codigo }));
});

await caso('L · Tokens tras el borrado', async () => {
  await limpiar();
  const ma = await partida(14, '1', 'Ana');
  await g(ma, '1', { token: 'T-L' });
  await otroGestor(ma).borrarTodo();
  const r = await g(ma, '1', { token: 'T-L' });
  const recibos = await Coordinacion.listar(O);
  comprobar(!r.exito && !(await lectura('1')).snap && recibos.every(([, v]) => !v?.contenido), 'el token viejo no valida a la partida borrada; no queda contenido de partidas en los recibos', JSON.stringify({ r: r.codigo, recibos: recibos.length }));
});

await caso('M · Crear, importar y recuperar tras borrar', async () => {
  await limpiar();
  const ma = await partida(15, '1', 'Ana');
  const gA = await g(ma, '1');
  // Una herencia pendiente de otro personaje (no afectada por borrar UNA ranura).
  orig.setItem.call(LS, Registro.CLAVE_MUERTOS, JSON.stringify({ 'run-muerto-M': { nombre: 'Mia' } }));
  orig.setItem.call(LS, Registro.CLAVE_LEGADOS, JSON.stringify({ 'run-muerto-M': { version: 2, runOrigen: 'run-muerto-M', origen: { nombre: 'Mia', clase: 'filo', nivel: 2 }, fraccion: '35/100', modalidad: 'xp_acumulada', base: { xpAcumulada: 200, xpHeredada: 0, xpGanada: 200 }, cantidad: 70, estado: 'pendiente', creado: 1 } }));
  await otroGestor(ma).borrar('1');
  const pend = (await Entrega.legadosPendientes()).map((v) => v.runOrigen);
  comprobar(pend.includes('run-muerto-M'), 'borrar UNA ranura no quita herencias ajenas', JSON.stringify(pend));
  const c = await creacionReal(33, '1', 'Cira', 'RUN-M-C');
  comprobar(c.r.ok && c.sigue?.exito, 'crear una campaña nueva en la ranura borrada funciona');
  // Importar la copia exportada de A (el run borrado): se abre, pero no vuelve a ocupar la ranura.
  const mi = await crearMotor({ semilla: 34 });
  mi.store.fijar('settings.persistencia', true);
  mi.bus.emit('settings:change', { id: 'persistencia', valor: true });
  const imp = await mi.sistema('saves').importar(gA.texto);
  mi.store.fijar('meta.ranura', '1');
  const gi = await g(mi, '1');
  comprobar(imp.exito && !gi.exito && (await lectura('1')).rec?.runId === 'RUN-M-C', 'importar la copia de A la abre en memoria; guardarla en su ranura no revive el run borrado (ni pisa a C)', JSON.stringify({ imp: imp.motivo, gi: gi.codigo }));

  // Ranuras llenas: liberar una por borrado no da permiso para pisar otra.
  for (let n = 2; n <= 8; n++) await crearPorProtocolo(String(n), `RUN-M-${n}`, textoCon(gA.texto, `RUN-M-${n}`, `P${n}`));
  const llena = await crearPorProtocolo(null, 'RUN-M-X', textoCon(gA.texto, 'RUN-M-X', 'Xan'));
  await otroGestor(mi).borrar('5');
  const enLibre = await crearPorProtocolo(null, 'RUN-M-Y', textoCon(gA.texto, 'RUN-M-Y', 'Yago'));
  const otraMas = await crearPorProtocolo(null, 'RUN-M-Z', textoCon(gA.texto, 'RUN-M-Z', 'Zoe'));
  comprobar(llena.codigo === 'sin-ranura' && enLibre.ok && enLibre.ranura === '5' && otraMas.codigo === 'sin-ranura',
    'con todo lleno hace falta elegir; la ranura borrada se usa una vez y después vuelve a hacer falta elegir', JSON.stringify({ llena: llena.codigo, enLibre: [enLibre.ok, enLibre.ranura], otraMas: otraMas.codigo }));

  // Las muertes son definitivas también tras «Borrar todo» (sin guardar el nombre).
  await Coordinacion.cas(Coordinacion.ALMACENES.MUERTOS, 'RUN-MUERTO-D', () => ({ nuevo: { nombre: 'Dora', muerto: 7, causa: 'caída' } }));
  await otroGestor(mi).borrarTodo();
  const muerto = await Coordinacion.leer(Coordinacion.ALMACENES.MUERTOS, 'RUN-MUERTO-D');
  const impD = await mi.sistema('saves').importar(textoCon(gA.texto, 'RUN-MUERTO-D', 'Dora'));
  comprobar(muerto && !('nombre' in muerto) && !('causa' in muerto) && !impD.exito, 'tras «Borrar todo» un muerto exportado no vuelve (y de él solo queda que murió)', JSON.stringify({ muerto, impD: impD.motivo }));
  const nueva = await creacionReal(35, null, 'Nueva', 'RUN-M-N');
  comprobar(nueva.r.ok && nueva.sigue?.exito, 'y una campaña nueva se crea y guarda con normalidad', JSON.stringify(nueva.r));
});

await caso('N · Borrar todo respeta lo ajeno y cuenta partidas, no claves', async () => {
  await limpiar();
  const ma = await partida(16, '1', 'Ana');
  await g(ma, '1');
  orig.setItem.call(LS, 'otro-juego:dato', 'sigue');
  orig.setItem.call(LS, 'arcanveil:personajes', '[]');
  orig.setItem.call(LS, 'arcanveil:ajustes', '{}');
  oirAvisos(ma);
  avisos.length = 0;
  const r = await otroGestor(ma).borrarTodo();
  const aviso = avisos.at(-1);
  comprobar(crudo('otro-juego:dato') === 'sigue' && crudo('arcanveil:personajes') === null && r?.ok === true && r?.partidas === 1 && /1 partida/.test(aviso?.mensaje ?? ''),
    `lo ajeno sigue; el aviso cuenta 1 partida, no las claves («${aviso?.mensaje}»)`, JSON.stringify(r));
});

restaurarLS();
console.log(`\n${casos - fallos}/${casos} comprobaciones correctas`);
process.exitCode = fallos ? 1 : 0;
