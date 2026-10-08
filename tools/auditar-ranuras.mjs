/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCANVEIL · tools/auditar-ranuras.mjs
 * ---------------------------------------------------------------------------
 * Encargo #7 del 8-oct-2026: crear una campaña nueva (con o sin herencia) no
 * pisa NUNCA otra campaña.
 *
 * Repro de la revisión externa en f81efd9: la app elegía la ranura libre ANTES
 * de entregar, y el candado era por origen. Dos herencias de muertos
 * distintos veían libre la 2: A→DA 350 en la 2, confirmada; B→DB 350 en la 2,
 * confirmada. Las dos «aplicadas», y en la 2 solo DB: DA perdida y la
 * herencia de A consumida.
 *
 * Aquí (motor sin ventana, protocolo real, Web Locks con un doble de un
 * proceso que ESPERA como el de verdad, y otro que se niega):
 *   · dos orígenes distintos con la misma ranura elegida antes, intercalados;
 *   · ranura elegida bajo el candado global (sin ranura fija): se reparten;
 *   · con y sin herencia a la vez;
 *   · guardado de una pestaña vieja contra una ranura que ya es de otra;
 *   · todas llenas: no se elige la más antigua, se pide permiso concreto
 *     (ranura + run + versión leída) y caduca si la ranura cambia;
 *   · cuota llena al reemplazar: lo anterior sigue;
 *   · sin Web Locks: bloqueo con aviso; orden de candados sin interbloqueo.
 *
 *   node tools/auditar-ranuras.mjs
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
const Registro = await import('../src/persistence/RegistroRuns.js');
const Coordinacion = await import('../src/persistence/Coordinacion.js');
const Ranuras = await import('../src/persistence/Ranuras.js').catch(() => null);

/** Doble de Web Locks de un proceso: espera como el de verdad; `ifAvailable` no espera. */
const tomados = new Set();
const candados = { async request(n, o, fn) { if (o?.ifAvailable && tomados.has(n)) return fn(null); while (tomados.has(n)) await tic(3); tomados.add(n); try { return await fn({ name: n }); } finally { tomados.delete(n); } } };
Entrega.usarCandados(candados);
Ranuras?.usarCandados?.(candados);

const LS = globalThis.localStorage;
const orig = { setItem: LS.setItem };
const crudo = (k) => LS.getItem(k);
async function limpiar() {
  await Coordinacion.vaciar();
  LS.setItem = orig.setItem;
  for (const k of Array.from({ length: LS.length }, (_, i) => LS.key(i))) if (k?.startsWith('arcanveil:')) LS.removeItem(k);
}
const BORR = (nombre, clase = 'rastreador') => ({ nombre, raza: 'valdes', clase, trasfondo: 'errante', genero: 'f' });

async function muerto(nombre, xp, semilla) {
  const m = await crearMotor({ semilla });
  await m.empezar(BORR(nombre));
  m.store.dispatch('player/xp', { cantidad: xp, motivo: 'fixture' });
  await tic();
  return m.sistema('muerte').morir({ origen: 'combate' }).runId;
}

/** Un motor preparado para crear (cada flujo, su «pestaña» lógica). */
async function motorNuevo(semilla) {
  const m = await crearMotor({ semilla });
  m.store.fijar('settings.persistencia', true);
  m.store.fijar('settings.autoguardado', false);
  m.bus.emit('settings:change', { id: 'persistencia', valor: true });
  return m;
}

/**
 * Entrega con herencia. Cada motor comparte el store del proceso, así que
 * los flujos «a la vez» crean y guardan dentro de su propia sección crítica
 * (bajo el candado global en el código nuevo; sin él en la base).
 */
function herencia(m, runOrigen, { ranura = null, reemplazo = null, pausa = null, nombre = 'Brun', runDestino = `run-${nombre}-${Math.random().toString(36).slice(2, 6)}`, transaccion = Entrega.nuevaTransaccion() } = {}) {
  return Entrega.entregarLegado({
    runOrigen, transaccion, runDestino, ranura, reemplazo,
    crear: async ({ cantidad, legado, ranura: elegida }) => {
      if (pausa) await pausa;
      m.store.reiniciar?.();
      m.store.fijar('settings.persistencia', true);
      m.store.fijar('meta.ranura', elegida ?? ranura);
      await Entrega.crearEnMotor(m.store, { borrador: BORR(nombre, 'glifista'), runDestino, cantidad, legado });
    },
    guardar: async ({ ranura: elegida, reemplazo: permiso, lease, op } = {}) => { const g = await m.sistema('saves').guardar(elegida ?? ranura, { silencioso: true, reemplazo: permiso ?? reemplazo, lease, op }); return { ok: g.exito, motivo: g.motivo, texto: g.texto, intentado: g.intentado }; },
  });
}

const runDe = (n) => { try { return JSON.parse(crudo(`arcanveil:partida:${n}`))?.estado?.meta?.runId ?? null; } catch { return 'ILEGIBLE'; } };
const ocupadas = () => Array.from({ length: 8 }, (_, i) => String(i + 1)).filter((n) => crudo(`arcanveil:partida:${n}`));

/* ═══════════════════════════════════════════════════════════════════════ */

await caso('Dos herencias de muertos distintos, la misma ranura vista libre (repro de la revisión)', async () => {
  await limpiar();
  const A = await muerto('Ana', 1000, 9303);
  const B = await muerto('Bea', 1000, 9505);
  const m = await motorNuevo(1);
  let soltar;
  const pausa = new Promise((r) => { soltar = r; });
  // Las dos eligieron la 2 ANTES de entregar (como hacía la app).
  const flujoA = herencia(m, A, { ranura: '2', pausa, nombre: 'Dara' });
  await tic(20);
  const flujoB = herencia(m, B, { ranura: '2', nombre: 'Dbel' });
  await tic(20);
  soltar();
  const [ra, rb] = await Promise.all([flujoA, flujoB]);
  const estados = { [A]: (await Entrega.estadoLegado(A))?.estado, [B]: (await Entrega.estadoLegado(B))?.estado };
  const aplicadas = [A, B].filter((r) => estados[r] === 'aplicado');
  const enDos = runDe('2');
  const vivos = [ra, rb].filter((r) => r.ok).map((r) => r.runDestino);
  comprobar(vivos.every((run) => Object.values({ 2: runDe('2'), 3: runDe('3') }).includes(run) || ocupadas().some((n) => runDe(n) === run)), 'cada sucesor confirmado existe en alguna ranura', JSON.stringify({ ra, rb, ocupadas: ocupadas().map((n) => [n, runDe(n)]) }));
  comprobar(aplicadas.length === vivos.length && !(aplicadas.length === 2 && ocupadas().length === 1), `nunca dos herencias aplicadas con un solo sucesor (aplicadas ${aplicadas.length}, ranura 2 = ${enDos})`, JSON.stringify({ ra, rb }));
  const perdida = [ra, rb].find((r) => !r.ok);
  comprobar(perdida && ['ranura-ocupada'].includes(perdida.codigo) && (await Entrega.estadoLegado(perdida === ra ? A : B))?.estado === 'pendiente', 'la segunda ve la 2 ocupada al revalidar bajo el candado: se rechaza sin consumir su herencia', JSON.stringify(perdida));
});

await caso('Ranura elegida bajo el candado global: dos herencias a la vez se reparten', async () => {
  await limpiar();
  const A = await muerto('Ana', 1000, 9303);
  const B = await muerto('Bea', 200, 9505);
  const m = await motorNuevo(2);
  const [ra, rb] = await Promise.all([herencia(m, A, { nombre: 'Dara' }), herencia(m, B, { nombre: 'Dbel' })]);
  comprobar(ra.ok && rb.ok && ra.ranura !== rb.ranura && runDe(ra.ranura) === ra.runDestino && runDe(rb.ranura) === rb.runDestino, `ranuras distintas (${ra.ranura}, ${rb.ranura}) y cada una con su sucesor`, JSON.stringify({ ra, rb }));
  comprobar((await Entrega.estadoLegado(A))?.estado === 'aplicado' && (await Entrega.estadoLegado(B))?.estado === 'aplicado' && (await Entrega.estadoLegado(A)).ranura !== (await Entrega.estadoLegado(B)).ranura, 'dos herencias aplicadas, cada una a su ranura');
});

await caso('Con y sin herencia a la vez', async () => {
  await limpiar();
  const A = await muerto('Ana', 1000, 9303);
  const m = await motorNuevo(3);
  comprobar(typeof Entrega.crearPartidaNueva === 'function', 'existe la creación SIN herencia bajo el mismo candado global');
  if (typeof Entrega.crearPartidaNueva !== 'function') return;
  let soltar;
  const pausa = new Promise((r) => { soltar = r; });
  const sin = Entrega.crearPartidaNueva({ runDestino: 'run-sin', ranura: null,
    crear: async ({ ranura }) => { await pausa; m.store.reiniciar?.(); m.store.fijar('settings.persistencia', true); m.store.fijar('meta.ranura', ranura); m.store.dispatch('player/crear', { borrador: BORR('Sola'), runId: 'run-sin' }); await tic(); },
    guardar: async ({ ranura, reemplazo, lease, op }) => { const g = await m.sistema('saves').guardar(ranura, { silencioso: true, reemplazo, lease, op }); return { ok: g.exito, motivo: g.motivo, texto: g.texto, intentado: g.intentado }; } });
  await tic(20);
  const con = herencia(m, A, { nombre: 'Dara' });
  await tic(20);
  soltar();
  const [rs, rc] = await Promise.all([sin, con]);
  comprobar(rs.ok && rc.ok && rs.ranura !== rc.ranura && runDe(rs.ranura) === 'run-sin' && runDe(rc.ranura) === rc.runDestino, `una no pisa a la otra (sin herencia en ${rs.ranura}, con herencia en ${rc.ranura})`, JSON.stringify({ rs, rc }));
});

await caso('Pestaña vieja: guardar con una ranura que ya es de otra campaña', async () => {
  await limpiar();
  const x = await motorNuevo(4);
  await x.empezar(BORR('Xena'));
  x.store.fijar('meta.ranura', '2');
  await x.sistema('saves').guardar('2', { silencioso: true });
  const bytesX = crudo('arcanveil:partida:2');
  const runX = runDe('2');
  // Otra campaña cuyo estado aún cree que su ranura es la 2.
  const y = await motorNuevo(5);
  await y.empezar(BORR('Yago'));
  y.store.fijar('meta.ranura', '2');
  const g = await y.sistema('saves').guardar('2', { silencioso: true });
  comprobar(!g.exito && crudo('arcanveil:partida:2') === bytesX && runDe('2') === runX, 'no escribe encima de otra campaña: avisa y la deja intacta', JSON.stringify(g));
  comprobar(/otra partida|otra campaña|de otra/i.test(g.motivo ?? ''), 'el aviso dice que la ranura es de otra campaña', g.motivo);
  // La misma campaña sí guarda en su ranura (actualizar no se bloquea).
  y.store.fijar('meta.ranura', '3');
  const g3a = await y.sistema('saves').guardar('3', { silencioso: true });
  const g3b = await y.sistema('saves').guardar('3', { silencioso: true });
  comprobar(g3a.exito && g3b.exito, 'actualizar la MISMA campaña sigue funcionando');
});

await caso('Todas llenas: ni la más antigua ni a ciegas', async () => {
  await limpiar();
  const A = await muerto('Ana', 1000, 9303);
  const relleno = await motorNuevo(6);
  await relleno.empezar(BORR('Rell'));
  for (let i = 1; i <= 8; i++) {
    relleno.store.fijar('meta.runId', `run-lleno-${i}`);
    relleno.store.fijar('meta.ranura', String(i));
    await relleno.sistema('saves').guardar(String(i), { silencioso: true });
  }
  const antes = Object.fromEntries(Array.from({ length: 8 }, (_, i) => [i + 1, crudo(`arcanveil:partida:${i + 1}`)]));
  const m = await motorNuevo(7);
  const r = await herencia(m, A, { nombre: 'Dara' });
  comprobar(!r.ok && r.codigo === 'sin-ranura' && Array.isArray(r.campanas) && r.campanas.length === 8, 'sin ranura libre: lo dice y lista las 8 campañas para elegir', JSON.stringify({ ...r, campanas: r.campanas?.length }));
  comprobar((await Entrega.estadoLegado(A))?.estado === 'pendiente' && Object.entries(antes).every(([n, b]) => crudo(`arcanveil:partida:${n}`) === b), 'nada consumido ni tocado al abrir el selector');
  if (r.codigo !== 'sin-ranura') return;
  const c3 = r.campanas.find((c) => c.ranura === '3');
  comprobar(c3?.runId === 'run-lleno-3' && Number.isFinite(c3?.guardadoEn) && 'muerto' in c3, 'cada campaña trae run, fecha y si está viva o muerta', JSON.stringify(c3));

  // Permiso caducado: la ranura cambia (otra pestaña guarda) tras elegirla.
  // (Con la revisión que enseña el selector: desde el #8 el permiso se ata
  // al dueño y la revisión del registro coordinado.)
  const permiso = { ranura: '3', runId: c3.runId, guardadoEn: c3.guardadoEn, rev: c3.rev ?? null };
  // Lo que haría otra pestaña al guardar esa campaña: la misma partida, una
  // versión más nueva (un motor por proceso: se reescribe la ranura tal cual).
  // Desde el #8 «guardar» es la escritura coordinada (sube la revisión) y
  // su espejo local; una escritura local suelta no cambia la autoridad.
  const g3 = JSON.parse(crudo('arcanveil:partida:3'));
  g3.guardadoEn += 1000;
  const otraPestana = await Ranuras.conCandadoGlobal((lease) => Ranuras.escribirPartida({ lease, ranura: '3', runId: 'run-lleno-3', texto: JSON.stringify(g3), guardadoEn: g3.guardadoEn }));
  if (otraPestana.ok) LS.setItem('arcanveil:partida:3', JSON.stringify(g3));
  const cambiada = crudo('arcanveil:partida:3');
  const rc = await herencia(m, A, { nombre: 'Dara', ranura: '3', reemplazo: permiso });
  comprobar(!rc.ok && rc.codigo === 'permiso-caducado' && crudo('arcanveil:partida:3') === cambiada && (await Entrega.estadoLegado(A))?.estado === 'pendiente', 'la ranura cambió tras elegirla: el permiso caduca y no se borra nada', JSON.stringify(rc));

  // Permiso vigente: reemplaza SOLO esa.
  const vigente = { ranura: '3', runId: 'run-lleno-3', guardadoEn: JSON.parse(cambiada).guardadoEn, rev: (await Ranuras.duenoRanura('3'))?.rev ?? null };
  const ok = await herencia(m, A, { nombre: 'Dara', ranura: '3', reemplazo: vigente });
  comprobar(ok.ok && runDe('3') === ok.runDestino && [1, 2, 4, 5, 6, 7, 8].every((n) => crudo(`arcanveil:partida:${n}`) === antes[n]), 'con permiso concreto se reemplaza solo la 3; las otras siete intactas', JSON.stringify(ok));
  // Un número a secas no es permiso.
  const B = await muerto('Bea', 300, 9505);
  const sinPermiso = await herencia(m, B, { nombre: 'Dbel', ranura: '5' });
  comprobar(!sinPermiso.ok && crudo('arcanveil:partida:5') === antes[5] && (await Entrega.estadoLegado(B))?.estado === 'pendiente', 'pedir la 5 sin permiso: rechazado, intacta', JSON.stringify(sinPermiso));
  const libre = await Ranuras?.ranuraLibre?.();
  comprobar(libre === null && Ranuras?.ranuraLibreLocal?.() === null, 'la búsqueda de ranura libre (coordinada y local) devuelve «ninguna», no la más antigua', String(libre));
});

await caso('Cuota llena al reemplazar: lo anterior sigue', async () => {
  await limpiar();
  const A = await muerto('Ana', 1000, 9303);
  const relleno = await motorNuevo(8);
  await relleno.empezar(BORR('Rell'));
  relleno.store.fijar('meta.runId', 'run-viejo');
  relleno.store.fijar('meta.ranura', '4');
  await relleno.sistema('saves').guardar('4', { silencioso: true });
  const viejo = crudo('arcanveil:partida:4');
  const permiso = { ranura: '4', runId: 'run-viejo', guardadoEn: JSON.parse(viejo).guardadoEn };
  const m = await motorNuevo(9);
  LS.setItem = function (k, v) { if (k === 'arcanveil:partida:4') { const e = new Error('lleno'); e.name = 'QuotaExceededError'; throw e; } return orig.setItem.call(this, k, v); };
  const r = await herencia(m, A, { nombre: 'Dara', ranura: '4', reemplazo: permiso });
  LS.setItem = orig.setItem;
  comprobar(!r.ok && crudo('arcanveil:partida:4') === viejo && (await Entrega.estadoLegado(A))?.estado === 'pendiente', 'no se ha borrado la campaña vieja antes de poder guardar la nueva; la herencia sigue pendiente', JSON.stringify(r));
});

await caso('Sin Web Locks, candado ocupado y orden de candados', async () => {
  await limpiar();
  const A = await muerto('Ana', 1000, 9303);
  const B = await muerto('Bea', 1000, 9505);
  const m = await motorNuevo(10);
  Entrega.usarCandados({});
  Ranuras?.usarCandados?.({});
  const r = await herencia(m, A, { nombre: 'Dara' });
  const r2 = typeof Entrega.crearPartidaNueva === 'function'
    ? await Entrega.crearPartidaNueva({ runDestino: 'run-x', ranura: null, crear: () => { throw new Error('no'); }, guardar: () => ({ ok: false }) })
    : { ok: false, codigo: 'no existe' };
  Entrega.usarCandados(candados);
  Ranuras?.usarCandados?.(candados);
  comprobar(!r.ok && r.codigo === 'sin-exclusion' && !r2.ok && r2.codigo === 'sin-exclusion' && !ocupadas().length && (await Entrega.estadoLegado(A))?.estado === 'pendiente', 'sin Web Locks: con y sin herencia se bloquean con aviso, sin escribir nada', JSON.stringify({ r, r2 }));

  // Interbloqueo: dos orígenes, a la vez, cada uno con su candado de origen y el global.
  const t0 = Date.now();
  const res = await Promise.race([
    Promise.all([herencia(m, A, { nombre: 'Dara' }), herencia(m, B, { nombre: 'Dbel' })]),
    tic(10000).then(() => 'INTERBLOQUEO'),
  ]);
  comprobar(res !== 'INTERBLOQUEO' && res.every((x) => x.ok), `orden fijo (origen → global): sin interbloqueo, terminan las dos en ${Date.now() - t0} ms`, JSON.stringify(res));
});

console.log(`\n${casos - fallos}/${casos} comprobaciones correctas`);
process.exitCode = fallos ? 1 : 0;
