/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCANVEIL · tools/auditar-token-guardado.mjs
 * ---------------------------------------------------------------------------
 * Encargo #9 del 8-oct-2026: un token de guardado nombra UNA operación
 * inmutable. El éxito describe lo que está guardado; nunca bytes que no se
 * guardaron.
 *
 * Repro de la revisión externa sobre 9e1ccde (API real, no un flujo de la
 * interfaz): guardar('1', {token: 'T'}) en el turno 0; turno → 500; guardar
 * otra vez con T → éxito, el resultado y el espejo dicen turno 500 y la copia
 * autoritativa sigue en 0 (al cargar vuelve el 0).
 *
 *   A. mismo token y mismo estado: una revisión, el mismo resultado y espejo;
 *   B. el repro 0 → 500: rechazo, nada cambia, cargar lo confirma;
 *   C. XP, inventario, vida, combate, run, ranura, operación y la automática
 *      cambiados con el mismo token: ningún éxito con otro contenido;
 *   D. mismo contenido con otros metadatos de escritura: estable;
 *   E. T guarda A, U guarda B, reintento de T: B no se tapa;
 *   F. cortes y cuota en cada escritura con token: reintentar sin revisiones
 *      falsas ni espejo contradictorio; el token no queda libre;
 *   G. «dos pestañas» con el mismo token (en un proceso, con el doble de Web
 *      Locks; en Chrome lo prueba la regresión con candados de verdad).
 *
 *   node tools/auditar-token-guardado.mjs
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
/** Una partida viva, guardada sin token en su ranura (precondición). */
async function partida(semilla, ranura = '1') {
  const m = await crearMotor({ semilla });
  await m.empezar(BORR('Tana'));
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
const xpDe = (texto) => { try { return JSON.parse(texto)?.estado?.player?.xp ?? null; } catch { return 'ILEGIBLE'; } };
/** ¿Lo que se ve, lo que vale y lo que dice el resultado son lo mismo? */
const concuerdan = (a) => a.snap?.texto === a.espejo && a.rec?.rev === a.snap?.rev;
const nadaCambia = (antes, despues) => antes.espejo === despues.espejo && antes.snap?.texto === despues.snap?.texto && antes.rec?.rev === despues.rec?.rev;

/* ═══════════════════════════════════════════════════════════════════════ */

await caso('A · Mismo token y mismo estado dos veces', async () => {
  await limpiar();
  const m = await partida(1);
  const eventos = [];
  m.bus.on('save:done', (d) => eventos.push(d));
  const r1 = await g(m, '1', { token: 'T-A' });
  const a1 = await autoridad('1');
  await tic(3);
  const r2 = await g(m, '1', { token: 'T-A' });
  const a2 = await autoridad('1');
  comprobar(r1.exito && !r1.repetido && r2.exito && r2.repetido && r2.rev === r1.rev && a2.rec.rev === a1.rec.rev,
    'la segunda es «repetida»: una sola revisión', JSON.stringify({ r1: [r1.exito, r1.rev], r2: [r2.exito, r2.repetido, r2.rev], rev: a2.rec.rev }));
  comprobar(r2.texto === r1.texto && r2.texto === a2.snap.texto && concuerdan(a2) && a2.espejo === a1.espejo,
    'el resultado repetido trae los bytes AUTORITATIVOS (los de la primera vez) y el espejo no cambia');
  comprobar(eventos.length === 2 && !eventos[0].repetido && eventos[1].repetido === true,
    'el evento de la repetida dice «repetido» (no es otro guardado indistinguible)', JSON.stringify(eventos.map((e) => e.repetido ?? false)));
  // La automática (compartida) sigue el mismo contrato.
  const t1 = await g(m, 'auto', { token: 'T-AUTO' });
  const t2 = await g(m, 'auto', { token: 'T-AUTO' });
  const aa = await autoridad('auto');
  comprobar(t1.exito && t2.exito && t2.repetido && aa.rec.rev === t1.rev && concuerdan(aa), 'la automática: mismo token y estado, una revisión');
});

await caso('B · Repro de la revisión: turno 0 → 500 con el mismo token', async () => {
  await limpiar();
  const m = await partida(2);
  m.store.fijar('meta.turno', 0);
  const r1 = await g(m, '1', { token: 'T' });
  const antes = await autoridad('1');
  m.store.fijar('meta.turno', 500);
  const r2 = await g(m, '1', { token: 'T' });
  const despues = await autoridad('1');
  comprobar(r1.exito && !r2.exito && r2.codigo === 'token-contenido' && r2.texto === undefined && r2.rev === undefined,
    'el reintento con otro contenido se rechaza (conflicto tipado; sin texto ni revisión de éxito)', JSON.stringify({ exito: r2.exito, codigo: r2.codigo, motivo: r2.motivo }));
  comprobar(nadaCambia(antes, despues) && turnoDe(despues.espejo) === 0 && turnoDe(despues.snap.texto) === 0,
    'ni la copia autoritativa ni el espejo ni la revisión cambian (turno 0 en los dos)', JSON.stringify({ espejo: turnoDe(despues.espejo), idb: turnoDe(despues.snap?.texto) }));
  const m2 = await crearMotor({ semilla: 3 });
  m2.store.fijar('settings.persistencia', true);
  m2.bus.emit('settings:change', { id: 'persistencia', valor: true });
  const c = await m2.sistema('saves').cargar('1');
  comprobar(c.exito && m2.ver('meta.turno') === 0, 'cargar devuelve el turno 0 (lo que de verdad está guardado)');
  // Guardar el progreso nuevo es OTRA operación.
  const m3 = m2;
  m3.store.fijar('meta.turno', 500);
  const r3 = await g(m3, '1', { token: 'U' });
  comprobar(r3.exito && turnoDe((await autoridad('1')).snap.texto) === 500, 'el progreso nuevo se guarda con una operación nueva (otro token)');
});

await caso('C · Otro contenido, otro destinatario u otra operación con el mismo token', async () => {
  const cambios = [
    ['XP', (m) => m.store.dispatch('player/xp', { cantidad: 40, motivo: 'jugado' })],
    ['inventario', (m) => { const ids = Object.keys(m.ver('inventory.objetos.porId', {})); m.store.fijar(`inventory.objetos.porId.${ids[0]}.cantidad`, 7); }],
    ['vida', (m) => m.store.fijar('player.vida.actual', 3)],
    ['nota', null],
  ];
  for (const [que, cambiar] of cambios) {
    await limpiar();
    const m = await partida(4);
    const r1 = await g(m, '1', { token: `T-${que}` });
    const antes = await autoridad('1');
    if (cambiar) { cambiar(m); await tic(); }
    const r2 = await g(m, '1', { token: `T-${que}`, ...(cambiar ? {} : { nota: 'otra nota' }) });
    const despues = await autoridad('1');
    comprobar(r1.exito && !r2.exito && r2.codigo === 'token-contenido' && nadaCambia(antes, despues), `cambia ${que}: conflicto y nada cambia`, JSON.stringify({ codigo: r2.codigo, motivo: r2.motivo }));
  }

  // Combate (la pelea en curso se guarda en el turno del jugador).
  await limpiar();
  const mc = await partida(5);
  const rc1 = await g(mc, '1', { token: 'T-combate' });
  const antesC = await autoridad('1');
  mc.bus.emit('combat:request', { enemies: [{ refId: 'guardia_corrupto', count: 1 }] });
  for (let i = 0; i < 400 && !(mc.ver('combat.activo', false) && mc.sistema('combat').esperandoJugador); i++) await tic(5);
  const rc2 = await g(mc, '1', { token: 'T-combate' });
  comprobar(rc1.exito && mc.ver('combat.activo', false) && !rc2.exito && rc2.codigo === 'token-contenido' && nadaCambia(antesC, await autoridad('1')), 'en combate: conflicto y nada cambia', JSON.stringify({ activo: mc.ver('combat.activo', false), codigo: rc2.codigo }));

  // Otra ranura, otro run y otra operación con el mismo token.
  await limpiar();
  const m = await partida(6);
  await g(m, '1', { token: 'T-id' });
  const antes1 = await autoridad('1');
  const otraRanura = await g(m, '2', { token: 'T-id' });
  comprobar(!otraRanura.exito && otraRanura.codigo === 'token-contenido' && crudo('arcanveil:partida:2') === null && !(await Coordinacion.leer(Coordinacion.ALMACENES.PARTIDAS, '2')), 'otra ranura con el mismo token: conflicto; la 2 sigue vacía', otraRanura.motivo);
  m.store.fijar('meta.runId', 'run-otro');
  const otroRun = await g(m, '1', { token: 'T-id' });
  comprobar(!otroRun.exito && otroRun.codigo === 'token-contenido' && nadaCambia(antes1, await autoridad('1')), 'otro run con el mismo token: conflicto y nada cambia', otroRun.motivo);

  // Creación con arriendo y operación: el token queda atado a esa operación.
  await limpiar();
  const mk = await crearMotor({ semilla: 7 });
  mk.store.fijar('settings.persistencia', true);
  mk.bus.emit('settings:change', { id: 'persistencia', valor: true });
  const creada = await Entrega.crearPartidaNueva({
    runDestino: 'RUN-K', ranura: '3',
    crear: async ({ ranura }) => { mk.store.reiniciar(); mk.store.fijar('settings.persistencia', true); mk.store.fijar('meta.ranura', ranura); mk.store.dispatch('player/crear', { borrador: BORR('Kira'), runId: 'RUN-K' }); await tic(); },
    guardar: async (p) => { const x = await mk.sistema('saves').guardar(p.ranura, { silencioso: true, lease: p.lease, op: p.op, token: 'T-crea' }); return { ok: x.exito, motivo: x.motivo, texto: x.texto, intentado: x.intentado }; },
  });
  const antes3 = await autoridad('3');
  const sinOp = await g(mk, '3', { token: 'T-crea' });
  comprobar(creada.ok && !sinOp.exito && sinOp.codigo === 'token-contenido' && nadaCambia(antes3, await autoridad('3')), 'el token de una creación no vale para un guardado normal (otra operación): conflicto', JSON.stringify({ creada: creada.ok, codigo: sinOp.codigo }));

  // La automática: otro contenido con el mismo token, conflicto.
  await limpiar();
  const ma = await partida(8);
  await g(ma, 'auto', { token: 'T-auto' });
  const antesA = await autoridad('auto');
  ma.store.dispatch('player/xp', { cantidad: 9, motivo: 'jugado' }); await tic();
  const ra = await g(ma, 'auto', { token: 'T-auto' });
  comprobar(!ra.exito && ra.codigo === 'token-contenido' && nadaCambia(antesA, await autoridad('auto')), 'la automática con otro contenido: conflicto y nada cambia', ra.codigo);
});

await caso('D · Mismo contenido con otros metadatos de la escritura', async () => {
  await limpiar();
  const m = await partida(9);
  const r1 = await g(m, '1', { token: 'T-D' });
  await tic(25);
  const r2 = await g(m, '1', { token: 'T-D' });
  const a = await autoridad('1');
  const g1 = JSON.parse(r1.texto);
  comprobar(r2.exito && r2.repetido && r2.texto === r1.texto && JSON.parse(a.espejo).guardadoEn === g1.guardadoEn && a.rec.rev === r1.rev,
    'otra hora de escritura (guardadoEn y firma) con el mismo estado: repetida y estable, con la hora original', JSON.stringify({ r2: [r2.exito, r2.repetido], rev: a.rec.rev }));
  const canon = Ranuras.contenidoCanonico(r1.texto);
  const otro = JSON.parse(r1.texto);
  otro.guardadoEn += 999; otro.firma = 'ffffffff';
  const reordenado = JSON.stringify(Object.fromEntries(Object.entries(otro).reverse()));
  comprobar(Ranuras.contenidoCanonico(reordenado) === canon, 'el contenido canónico ignora solo guardadoEn, firma y el orden de las claves');
  const conTurno = JSON.parse(r1.texto); conTurno.estado.meta.turno += 1;
  comprobar(Ranuras.contenidoCanonico(JSON.stringify(conTurno)) !== canon, 'un turno distinto es contenido distinto');
});

await caso('E · T guarda A, U guarda B, reintento de T', async () => {
  await limpiar();
  const m = await partida(10);
  const rT = await g(m, '1', { token: 'T-E' });
  m.store.dispatch('player/xp', { cantidad: 30, motivo: 'jugado' }); await tic();
  const rU = await g(m, '1', { token: 'U-E' });
  const conB = await autoridad('1');
  const reT = await g(m, '1', { token: 'T-E' });
  const despues = await autoridad('1');
  comprobar(rT.exito && rU.exito && !reT.exito && reT.codigo === 'token-superado' && nadaCambia(conB, despues) && xpDe(despues.snap.texto) === 30,
    'el reintento de T se rechaza como superado: B (30 XP) sigue, sin revisión nueva', JSON.stringify({ codigo: reT.codigo, motivo: reT.motivo, rev: despues.rec.rev }));
  // Con el contenido de A (como si T se reintentara con su foto original).
  m.store.dispatch('player/xp', { cantidad: -30, motivo: 'fixture' }); await tic();
  const reTA = await g(m, '1', { token: 'T-E' });
  comprobar(!reTA.exito && reTA.codigo === 'token-superado' && nadaCambia(conB, await autoridad('1')), 'tampoco con el contenido original: no revive la foto vieja encima de B');
});

await caso('F · Cortes y cuota en cada escritura con token', async () => {
  const base = Coordinacion.crearEnMemoria();
  const corte = { n: 0, k: Infinity, caido: false, cuota: false };
  const tope = () => { corte.n += 1; if (corte.n === corte.k) { if (!corte.cuota) corte.caido = true; throw Object.assign(new Error('lleno'), { name: 'QuotaExceededError' }); } };
  const envuelto = {
    ...base,
    async cas(a, c, decidir) { if (corte.caido) throw new Error('proceso caído'); return base.cas(a, c, (x) => { const d = decidir(x); if (d) tope(); return d; }); },
    async casVarios(claves, decidir) { if (corte.caido) throw new Error('proceso caído'); return base.casVarios(claves, (x) => { const d = decidir(x); if (d && d.some(Boolean)) tope(); return d; }); },
  };
  for (const cuota of [false, true]) {
    for (let k = 1; k <= 3; k++) {
      await limpiar();
      Coordinacion.usarCoordinacion(envuelto);
      await base.vaciar();
      Object.assign(corte, { n: 0, k: Infinity, caido: false, cuota });
      const m = await partida(11);
      await g(m, '1');
      const rev0 = (await autoridad('1')).rec.rev;
      m.store.dispatch('player/xp', { cantidad: 15, motivo: 'jugado' }); await tic();
      Object.assign(corte, { n: 0, k, caido: false, cuota });
      LS.setItem = function (kk, v) { if (corte.caido) throw new Error('proceso caído'); tope(); return orig.setItem.call(this, kk, v); };
      const r1 = await g(m, '1', { token: 'T-F' });
      restaurarLS();
      Object.assign(corte, { n: 0, k: Infinity, caido: false });
      const tras1 = await autoridad('1');
      // Lo que dice el resultado cuadra con lo que pasó.
      const dice = r1.exito ? 'confirmada' : r1.escritura;
      const real = tras1.rec.rev === rev0 ? 'sin cambio' : 'confirmada';
      const honesto = r1.exito ? (real === 'confirmada' && concuerdan(tras1) && r1.texto === tras1.snap.texto)
        : (r1.texto === undefined && ((dice === 'confirmada-sin-espejo') === (real === 'confirmada')));
      comprobar(honesto, `${cuota ? 'cuota' : 'corte'} en la escritura ${k}: el resultado dice lo que pasó (${dice}; ${real})`, JSON.stringify({ exito: r1.exito, escritura: r1.escritura, codigo: r1.codigo, rev: tras1.rec.rev, rev0 }));
      // Reintento con el MISMO token y la misma foto: una sola revisión más y todo concordante.
      const r2 = await g(m, '1', { token: 'T-F' });
      const tras2 = await autoridad('1');
      comprobar(r2.exito && tras2.rec.rev === rev0 + 1 && concuerdan(tras2) && xpDe(tras2.snap.texto) === 15 && r2.texto === tras2.snap.texto,
        `  …el reintento con el mismo token deja UNA revisión más (${rev0} → ${tras2.rec.rev}), espejo y autoridad iguales`, JSON.stringify({ r2: [r2.exito, r2.repetido, r2.codigo], rev: tras2.rec.rev }));
      // Y el token no queda libre para otro contenido.
      m.store.dispatch('player/xp', { cantidad: 1, motivo: 'jugado' }); await tic();
      const r3 = await g(m, '1', { token: 'T-F' });
      comprobar(!r3.exito && r3.codigo === 'token-contenido' && nadaCambia(tras2, await autoridad('1')), '  …y el mismo token con otro contenido sigue siendo conflicto', r3.codigo);
    }
  }
  Coordinacion.usarCoordinacion(Coordinacion.crearEnMemoria());

  // Deshecha por el espejo (cuota), y reintento con OTRO contenido: conflicto.
  await limpiar();
  const m = await partida(12);
  await g(m, '1');
  const antes = await autoridad('1');
  m.store.dispatch('player/xp', { cantidad: 5, motivo: 'jugado' }); await tic();
  LS.setItem = function (k, v) { if (k === 'arcanveil:partida:1') throw Object.assign(new Error('lleno'), { name: 'QuotaExceededError' }); return orig.setItem.call(this, k, v); };
  const r1 = await g(m, '1', { token: 'T-F2' });
  restaurarLS();
  m.store.dispatch('player/xp', { cantidad: 5, motivo: 'jugado' }); await tic();
  const r2 = await g(m, '1', { token: 'T-F2' });
  comprobar(!r1.exito && r1.escritura === 'deshecha' && nadaCambia(antes, await autoridad('1')) && !r2.exito && r2.codigo === 'token-contenido',
    'escritura deshecha (no cupo el espejo): el token no queda libre para otro contenido', JSON.stringify({ r1: r1.escritura, r2: r2.codigo }));
});

await caso('G · Dos «pestañas» con el mismo token (un proceso, doble de Web Locks)', async () => {
  await limpiar();
  const m = await partida(13);
  const r0 = await g(m, '1');
  const textoA = r0.texto;
  const gB = JSON.parse(textoA); gB.estado.player.xp = 77; gB.guardadoEn += 5;
  const textoB = JSON.stringify(gB);
  const runId = m.ver('meta.runId');
  const escribe = (texto) => Ranuras.conCandadoGlobal((lease) => Ranuras.escribirPartida({ lease, ranura: '1', runId, texto, token: 'T-G' }));
  // Mismo contenido a la vez: una operación.
  const [a, b] = await Promise.all([escribe(textoA), escribe(textoA)]);
  const tras = await autoridad('1');
  comprobar(a.ok && b.ok && [a, b].filter((x) => x.repetido).length === 1 && tras.rec.rev === r0.rev + 1 && a.texto === b.texto,
    'mismo token y mismo contenido a la vez: una revisión; la otra, repetida con los mismos bytes', JSON.stringify({ a: [a.ok, a.repetido, a.rev], b: [b.ok, b.repetido, b.rev] }));
  // Contenidos distintos a la vez con otro token: uno durable, el otro conflicto.
  const escribeH = (texto) => Ranuras.conCandadoGlobal((lease) => Ranuras.escribirPartida({ lease, ranura: '1', runId, texto, token: 'T-H' }));
  const [c, d] = await Promise.all([escribeH(textoA), escribeH(textoB)]);
  const fin = await Coordinacion.leer(Coordinacion.ALMACENES.PARTIDAS, '1');
  const ganador = c.ok ? textoA : textoB;
  comprobar([c, d].filter((x) => x.ok).length === 1 && [c, d].find((x) => !x.ok)?.codigo === 'token-contenido' && fin.texto === ganador,
    'mismo token y contenidos distintos a la vez: uno queda (el durable es el suyo) y el otro es conflicto; nunca dos éxitos', JSON.stringify({ c: [c.ok, c.codigo], d: [d.ok, d.codigo] }));
});

restaurarLS();
console.log(`\n${casos - fallos}/${casos} comprobaciones correctas`);
process.exitCode = fallos ? 1 : 0;
