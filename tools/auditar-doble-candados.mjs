/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCANVEIL · tools/auditar-doble-candados.mjs
 * ---------------------------------------------------------------------------
 * Encargo #9: el doble de Web Locks de la fixture común
 * (`tools/dobles/candados.mjs`, instalado por `motor-sin-ventana.mjs`).
 *
 *   1. dos peticiones al mismo candado no se solapan; nombres distintos, sí;
 *   2. `ifAvailable` da null si está tomado;
 *   3. la función que lanza suelta el candado; abortar mientras espera no
 *      ejecuta ni deja el candado tomado;
 *   4. quitar los candados en una prueba se conserva aunque se cree otro
 *      motor, y se restaura explícitamente;
 *   5. las auditorías oficiales de identidad, menús, viaje y muerte, en
 *      procesos NUEVOS y tal cual, con Web Locks en Node y SIN ellos
 *      (`dobles/sin-web-locks.mjs` imita un Node que no los trae): exit 0 y
 *      todas sus comprobaciones;
 *   6. una creación que ya tiene el arriendo global no lo vuelve a pedir.
 *
 * El doble es de UN proceso: esto no prueba Web Locks reales (eso, en Chrome).
 *
 *   node tools/auditar-doble-candados.mjs
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { spawnSync } from 'node:child_process';
import { crearMotor, candadosDePrueba } from './motor-sin-ventana.mjs';
import { crearCandados } from './dobles/candados.mjs';

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

await caso('1 · Exclusión por nombre', async () => {
  const L = crearCandados();
  let dentro = 0; let maximo = 0; const orden = [];
  const tarea = (i) => L.request('x', async () => { dentro += 1; maximo = Math.max(maximo, dentro); orden.push(i); await tic(5); dentro -= 1; });
  await Promise.all([tarea(1), tarea(2), tarea(3)]);
  comprobar(maximo === 1 && orden.join() === '1,2,3', 'tres peticiones al mismo candado: nunca dos dentro, en orden de llegada', JSON.stringify({ maximo, orden }));
  let a = false; let b = false;
  const pa = L.request('a', async () => { a = true; await tic(20); });
  const pb = L.request('b', async () => { b = a; });
  await Promise.all([pa, pb]);
  comprobar(b, 'nombres distintos no se esperan entre sí');
});

await caso('2 · ifAvailable', async () => {
  const L = crearCandados();
  let soltar;
  const retenido = L.request('x', () => new Promise((r) => { soltar = r; }));
  await tic();
  const visto = await L.request('x', { ifAvailable: true }, async (c) => c);
  soltar(); await retenido;
  const libre = await L.request('x', { ifAvailable: true }, async (c) => c);
  comprobar(visto === null && libre?.name === 'x', 'tomado: la función recibe null y no espera; libre: recibe el candado');
});

await caso('3 · Errores y abortos', async () => {
  const L = crearCandados();
  const r = await L.request('x', async () => { throw new Error('falla'); }).catch((e) => e.message);
  const despues = await L.request('x', { ifAvailable: true }, async (c) => c?.name ?? null);
  comprobar(r === 'falla' && despues === 'x', 'la función que lanza suelta el candado (el siguiente lo obtiene)');
  let soltar;
  const retenido = L.request('x', () => new Promise((ok) => { soltar = ok; }));
  await tic();
  const ctl = new AbortController();
  let ejecutada = false;
  const esperando = L.request('x', { signal: ctl.signal }, async () => { ejecutada = true; }).catch((e) => e.name);
  await tic();
  ctl.abort();
  const motivo = await esperando;
  soltar(); await retenido;
  const q = await L.query();
  const tras = await L.request('x', { ifAvailable: true }, async (c) => c?.name ?? null);
  comprobar(motivo === 'AbortError' && !ejecutada && q.held.length === 0 && q.pending.length === 0 && tras === 'x', 'abortar mientras espera: no se ejecuta y no queda tomado ni en cola', JSON.stringify({ motivo, ejecutada, q }));
  // (En Node el temporizador de AbortSignal.timeout no mantiene vivo el
  // proceso: sin esto, Node saldría mientras la petición espera.)
  const vivo = setInterval(() => {}, 1000);
  const vencido = await L.request('x', { signal: AbortSignal.timeout(0) }, async () => 'no').catch((e) => e.name);
  await tic(5);
  const tiempo = await (async () => { let s; const ret = L.request('x', () => new Promise((ok) => { s = ok; })); await tic(); const r2 = await L.request('x', { signal: AbortSignal.timeout(20) }, async () => 'no').catch((e) => e.name); s(); await ret; return r2; })();
  clearInterval(vivo);
  comprobar(['AbortError', 'TimeoutError', 'no'].includes(vencido) && tiempo === 'TimeoutError', 'con un tope (AbortSignal.timeout) se rinde con TimeoutError, como el candado global espera', JSON.stringify({ vencido, tiempo }));
});

await caso('4 · Quitar los candados en una prueba se conserva', async () => {
  const m = await crearMotor({ semilla: 1 });
  await m.empezar({ nombre: 'Ola', raza: 'valdes', clase: 'rastreador', trasfondo: 'errante', genero: 'f' });
  m.store.fijar('meta.ranura', '1');
  Entrega.usarCandados({});
  const m2 = await crearMotor({ semilla: 2 });
  await m2.empezar({ nombre: 'Pía', raza: 'valdes', clase: 'rastreador', trasfondo: 'errante', genero: 'f' });
  m2.store.fijar('meta.ranura', '2');
  const sin = await m2.sistema('saves').guardar('2', { silencioso: true });
  comprobar(!sin.exito && /Web Locks|coordinar/i.test(sin.motivo ?? ''), 'sin candados: el motor nuevo NO los vuelve a poner y guardar se niega con motivo', sin.motivo);
  Entrega.usarCandados(candadosDePrueba);
  const con = await m2.sistema('saves').guardar('2', { silencioso: true });
  comprobar(con.exito, 'restaurados explícitamente con candadosDePrueba: guarda', con.motivo);
});

await caso('5 · Auditorías oficiales en procesos nuevos, con y sin Web Locks en Node', async () => {
  const esperadas = { identidad: 50, 'combate-menus': 37, viaje: 21, muerte: 34 };
  for (const [nombre, total] of Object.entries(esperadas)) {
    for (const sinLocks of [false, true]) {
      const args = [...(sinLocks ? ['--import', './tools/dobles/sin-web-locks.mjs'] : []), `tools/auditar-${nombre}.mjs`];
      const t0 = Date.now();
      const r = spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 300000 });
      const cuenta = (r.stdout.match(/(\d+)\/(\d+) comprobaciones/g) ?? []).at(-1) ?? '';
      const [bien, de] = cuenta.split(' ')[0]?.split('/').map(Number) ?? [];
      comprobar(r.status === 0 && bien === total && de === total && !/revienta/.test(r.stdout),
        `${nombre} ${sinLocks ? 'SIN Web Locks en Node' : 'tal cual'}: exit ${r.status}, ${cuenta} (${Math.round((Date.now() - t0) / 1000)} s)`, r.stdout.split('\n').filter((l) => /^MAL|revienta/.test(l)).slice(0, 3).join(' | '));
    }
  }
});

await caso('6 · Una creación con el arriendo no vuelve a pedir el candado global', async () => {
  const m = await crearMotor({ semilla: 3 });
  m.store.fijar('settings.persistencia', true);
  m.bus.emit('settings:change', { id: 'persistencia', valor: true });
  const pedidos = [];
  const contados = { request: (n, o, f) => { pedidos.push(n); return candadosDePrueba.request(n, o, f); } };
  Entrega.usarCandados(contados);
  const r = await Promise.race([
    Entrega.crearPartidaNueva({
      runDestino: 'RUN-6', ranura: null,
      crear: async ({ ranura }) => { m.store.reiniciar(); m.store.fijar('settings.persistencia', true); m.store.fijar('meta.ranura', ranura); m.store.dispatch('player/crear', { borrador: { nombre: 'Seis', raza: 'valdes', clase: 'rastreador', trasfondo: 'errante', genero: 'f' }, runId: 'RUN-6' }); await tic(); },
      guardar: async (p) => { const g = await m.sistema('saves').guardar(p.ranura, { silencioso: true, lease: p.lease, op: p.op }); return { ok: g.exito, motivo: g.motivo, texto: g.texto, intentado: g.intentado }; },
    }),
    tic(8000).then(() => 'INTERBLOQUEO'),
  ]);
  Entrega.usarCandados(candadosDePrueba);
  const globales = pedidos.filter((n) => n === Ranuras.CANDADO_GLOBAL).length;
  comprobar(r !== 'INTERBLOQUEO' && r.ok && globales === 1, `crear y guardar dentro: termina y pide el candado global UNA vez (${globales})`, JSON.stringify({ r, pedidos }));
});

console.log(`\n${casos - fallos}/${casos} comprobaciones correctas`);
process.exitCode = fallos ? 1 : 0;
