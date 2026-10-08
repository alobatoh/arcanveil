/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCANVEIL · tools/auditar-muertes-coordinadas.mjs
 * ---------------------------------------------------------------------------
 * Encargo #8 del 8-oct-2026: dos muertes a la vez no pierden ninguna foto ni
 * ninguna marca, y una pestaña con la caché vieja no revive a un muerto.
 *
 * Riesgo de la revisión del #7 (confirmado por inspección, no por una
 * carrera natural en Chrome): `marcarMuerto` y `guardarLegado` leen un MAPA
 * de `localStorage`, añaden su run y escriben el mapa entero. Si B lee el
 * mapa antes de ver lo que escribió A, la escritura de B borra a A.
 *
 * Aquí, con FIXTURES de caché vieja (getItem devuelve el mapa anterior) y de
 * cortes, contra el registro autoritativo:
 *   8.  dos muertes de orígenes distintos con lecturas viejas: las dos fotos
 *       y las dos marcas; cada herencia, una vez; sus ranuras no cargan;
 *   9.  la misma muerte repetida y la XP tardía: una foto, la original;
 *   10. corte o cuota en cada escritura de la muerte: marca y foto juntas o
 *       ninguna; nunca «muerto sin foto» ni «foto de un vivo»;
 *   11. una pestaña vieja intenta cargar a un muerto: no revive; sin estado
 *       coordinado, no se da por vivo;
 *   12. mapas antiguos (v1, #6, #7: aplicado, reservado, bloqueado, JSON
 *       dañado): se importan sin reiniciar ni repetir premio.
 *
 *   node tools/auditar-muertes-coordinadas.mjs
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
const Muertes = await import('../src/persistence/Muertes.js').catch(() => null);

const tomados = new Set();
Entrega.usarCandados({ async request(n, o, fn) { if (o?.ifAvailable && tomados.has(n)) return fn(null); while (tomados.has(n)) await tic(2); tomados.add(n); try { return await fn({ name: n }); } finally { tomados.delete(n); } } });

const LS = globalThis.localStorage;
const orig = { getItem: LS.getItem, setItem: LS.setItem, key: LS.key, removeItem: LS.removeItem };
const restaurarLS = () => Object.assign(LS, orig);
const crudo = (k) => orig.getItem.call(LS, k);
async function limpiar() {
  restaurarLS();
  Coordinacion.usarCoordinacion(Coordinacion.crearEnMemoria());
  for (const k of Array.from({ length: LS.length }, (_, i) => orig.key.call(LS, i))) if (k?.startsWith('arcanveil:')) orig.removeItem.call(LS, k);
}
const BORR = (nombre, clase = 'rastreador') => ({ nombre, raza: 'valdes', clase, trasfondo: 'errante', genero: 'f' });

/** ¿Muerto según la autoridad? (Muertes, si existe; si no, el mapa de la base). */
async function muerto(run) {
  if (Muertes?.estaMuerto) return Muertes.estaMuerto(run);
  return Registro.estaMuerto(run);
}
/** Espera a que la muerte quede registrada (o falle), si hay registro asíncrono. */
async function registrada(m) {
  for (let i = 0; i < 200; i++) {
    const g = m.ver('meta.muerte.guardado');
    if (g && g.estado !== 'registrando') return g;
    await tic(5);
  }
  return m.ver('meta.muerte.guardado');
}

/** FIXTURE: una partida que muere con XP conocida, guardada en su ranura. */
async function morir(nombre, xp, semilla, ranura) {
  const m = await crearMotor({ semilla });
  await m.empezar(BORR(nombre));
  m.store.fijar('meta.ranura', ranura);
  await m.sistema('saves').guardar(ranura, { silencioso: true });
  if (xp) { m.store.dispatch('player/xp', { cantidad: xp, motivo: 'fixture' }); await tic(); }
  const muerte = m.sistema('muerte').morir({ origen: 'combate' });
  const g = await registrada(m);
  return { m, runId: muerte?.runId ?? m.ver('meta.runId'), muerte, guardado: g };
}

/* ═══════════════════════════════════════════════════════════════════════ */

await caso('8 · Dos muertes de orígenes distintos con lecturas viejas del mapa', async () => {
  await limpiar();
  // Lo que «ve» la pestaña de B: los mapas de ANTES de que muriera A.
  const mapasAntes = { muertos: crudo(Registro.CLAVE_MUERTOS), legados: crudo(Registro.CLAVE_LEGADOS) };
  const a = await morir('Ana', 1000, 9303, '1');
  LS.getItem = function (k) {
    if (k === Registro.CLAVE_MUERTOS) return mapasAntes.muertos;
    if (k === Registro.CLAVE_LEGADOS) return mapasAntes.legados;
    return orig.getItem.call(this, k);
  };
  const b = await morir('Bea', 600, 9505, '2');
  restaurarLS();
  const fa = await Entrega.estadoLegado(a.runId);
  const fb = await Entrega.estadoLegado(b.runId);
  comprobar(await muerto(a.runId) && await muerto(b.runId), 'las dos marcas de muerte se conservan', JSON.stringify({ a: await muerto(a.runId), b: await muerto(b.runId) }));
  comprobar(fa?.cantidad === 350 && fb?.cantidad === 210, 'las dos fotos se conservan (350 y 210)', JSON.stringify({ fa: fa?.cantidad ?? null, fb: fb?.cantidad ?? null }));
  const m = await crearMotor({ semilla: 3 });
  m.store.fijar('settings.persistencia', true);
  m.bus.emit('settings:change', { id: 'persistencia', valor: true });
  const ca = await m.sistema('saves').cargar('1');
  const cb = await m.sistema('saves').cargar('2');
  comprobar(!ca.exito && !cb.exito && ca.motivo === 'muerto' && cb.motivo === 'muerto', 'las ranuras anteriores de las dos no cargan', JSON.stringify({ ca: ca.motivo, cb: cb.motivo }));
  const pendientes = (await Entrega.legadosPendientes()).map((v) => v.runOrigen);
  comprobar(pendientes.includes(a.runId) && pendientes.includes(b.runId), 'las dos herencias se pueden elegir (una vez cada una)', JSON.stringify(pendientes));
});

await caso('9 · La misma muerte repetida y la XP tardía', async () => {
  await limpiar();
  const a = await morir('Ana', 1000, 9303, '1');
  const foto1 = await Entrega.estadoLegado(a.runId);
  a.m.store.dispatch('player/xp', { cantidad: 500, motivo: 'tardía' }); await tic();
  a.m.sistema('muerte').morir({ origen: 'combate' });
  a.m.bus.emit('player:defeated', { origen: 'combate' });
  a.m.bus.emit('player:down', {});
  await tic(50);
  const foto2 = await Entrega.estadoLegado(a.runId);
  comprobar(foto2?.cantidad === 350 && foto2?.base?.xpAcumulada === 1000 && foto2?.creado === foto1?.creado, 'una sola foto, la original (1000 → 350), sin la XP tardía ni otra muerte', JSON.stringify({ foto1: foto1?.base, foto2: foto2?.base }));
  if (Muertes?.registrar) {
    // Otra pestaña del MISMO run, con otra foto (más XP): no la sustituye.
    const otra = { ...foto1, base: { ...foto1.base, xpAcumulada: 9999 }, cantidad: 3499 };
    const r = await Muertes.registrar({ runId: a.runId, marca: { nombre: 'Ana' }, foto: otra });
    const foto3 = await Entrega.estadoLegado(a.runId);
    comprobar(foto3?.cantidad === 350 && r?.conflicto, 'otra foto distinta del mismo run: conflicto explicado, se queda la primera (no «la de más XP»)', JSON.stringify({ r, cantidad: foto3?.cantidad }));
  } else comprobar(false, 'existe el registro coordinado de muertes');
});

await caso('10 · Corte o cuota en cada escritura de la muerte', async () => {
  // Escrituras de la muerte: coordinadas (registro) y locales (espejo y final).
  const base = Coordinacion.crearEnMemoria();
  const corte = { n: 0, k: Infinity, caido: false, cuota: false };
  const tope = (d) => { if (d) { corte.n += 1; if (corte.n === corte.k) { if (!corte.cuota) corte.caido = true; throw Object.assign(new Error('lleno'), { name: 'QuotaExceededError' }); } } return d; };
  const envuelto = {
    ...base,
    async cas(a, c, decidir) { if (corte.caido) throw new Error('proceso caído'); return base.cas(a, c, (x) => tope(decidir(x))); },
    async casVarios(claves, decidir) { if (corte.caido) throw new Error('proceso caído'); return base.casVarios(claves, (x) => { const d = decidir(x); return d && d.some(Boolean) ? tope(d) : d; }); },
  };
  for (const cuota of [false, true]) {
    for (let k = 1; k <= 5; k++) {
      await limpiar();
      Coordinacion.usarCoordinacion(envuelto);
      await base.vaciar();
      Object.assign(corte, { n: 0, k: Infinity, caido: false, cuota });
      const m = await crearMotor({ semilla: 9303 });
      await m.empezar(BORR('Ana'));
      m.store.fijar('meta.ranura', '1');
      await m.sistema('saves').guardar('1', { silencioso: true });
      m.store.dispatch('player/xp', { cantidad: 1000, motivo: 'fixture' }); await tic();
      const run = m.ver('meta.runId');
      Object.assign(corte, { n: 0, k, caido: false, cuota });
      LS.setItem = function (kk, v) { if (corte.caido) throw new Error('proceso caído'); corte.n += 1; if (corte.n === k) { if (!cuota) corte.caido = true; throw Object.assign(new Error('lleno'), { name: 'QuotaExceededError' }); } return orig.setItem.call(this, kk, v); };
      m.sistema('muerte').morir({ origen: 'combate' });
      const g = await registrada(m);
      restaurarLS();
      Object.assign(corte, { n: 0, k: Infinity, caido: false });
      // Reabrir.
      const m2 = await crearMotor({ semilla: 1 });
      m2.store.fijar('settings.persistencia', true);
      m2.bus.emit('settings:change', { id: 'persistencia', valor: true });
      const esMuerto = await muerto(run);
      const foto = await Entrega.estadoLegado(run);
      const carga = await m2.sistema('saves').cargar('1');
      const coherente = (esMuerto && foto?.cantidad === 350 && !carga.exito) || (!esMuerto && !foto && Boolean(g && (g.marca === false || g.error)));
      comprobar(coherente, `${cuota ? 'cuota llena' : 'corte'} en la escritura ${k}: ${esMuerto ? 'muerto con su foto y la ranura no revive' : 'sin marca ni foto, y la pantalla no lo prometió'}`, JSON.stringify({ esMuerto, foto: foto?.cantidad ?? null, carga: carga.motivo ?? carga.exito, g }));
    }
  }
  Coordinacion.usarCoordinacion(Coordinacion.crearEnMemoria());
});

await caso('11 · Una pestaña vieja intenta cargar a un muerto', async () => {
  await limpiar();
  const a = await morir('Ana', 300, 9303, '1');
  const mapaMuertos = crudo(Registro.CLAVE_MUERTOS);
  // La caché de esta pestaña no ve la marca ni el final de la ranura.
  const finalBytes = crudo('arcanveil:partida:1');
  const m = await crearMotor({ semilla: 4 });
  m.store.fijar('settings.persistencia', true);
  m.bus.emit('settings:change', { id: 'persistencia', valor: true });
  LS.getItem = function (k) { if (k === Registro.CLAVE_MUERTOS || k === Registro.CLAVE_LEGADOS) return '{}'; return orig.getItem.call(this, k); };
  const c = await m.sistema('saves').cargar('1');
  restaurarLS();
  comprobar(!c.exito && c.motivo === 'muerto' && m.ver('meta.runId') !== a.runId, 'no revive aunque la caché local no vea la marca', JSON.stringify({ c: c.motivo }));
  // Sin estado coordinado: no se da por vivo.
  Coordinacion.usarCoordinacion({ ...Coordinacion.crearEnMemoria(), async leer() { throw new Error('IndexedDB abortada'); }, async listar() { throw new Error('IndexedDB abortada'); }, async cas() { throw new Error('IndexedDB abortada'); }, async casVarios() { throw new Error('IndexedDB abortada'); } });
  LS.getItem = function (k) { if (k === Registro.CLAVE_MUERTOS || k === Registro.CLAVE_LEGADOS) return '{}'; return orig.getItem.call(this, k); };
  const m3 = await crearMotor({ semilla: 5 });
  m3.store.fijar('settings.persistencia', true);
  m3.bus.emit('settings:change', { id: 'persistencia', valor: true });
  const c2 = await m3.sistema('saves').cargar('1');
  restaurarLS();
  Coordinacion.usarCoordinacion(Coordinacion.crearEnMemoria());
  comprobar(!c2.exito && m3.ver('meta.runId') !== a.runId, `estado coordinado inaccesible: no se carga como vivo (${c2.motivo})`, JSON.stringify(c2));
  void mapaMuertos; void finalBytes;
});

await caso('12 · Mapas antiguos: aplicado, reservado, bloqueado, v1 y JSON dañado', async () => {
  await limpiar();
  const v1 = (run, xp, estado = 'pendiente', extra = {}) => ({ version: 1, runOrigen: run, origen: { nombre: `N-${run}` }, fraccion: 0.35, base: { xpAcumulada: xp, xpHeredadaIncluida: 0 }, modalidad: 'pendiente', estado, creado: 5, ...extra });
  orig.setItem.call(LS, Registro.CLAVE_LEGADOS, JSON.stringify({
    'run-pend': v1('run-pend', 200),
    'run-apl': v1('run-apl', 500, 'aplicado', { destinatario: 'run-x', aplicado: { cantidad: 175 } }),
    'run-res': { ...v1('run-res', 400, 'reservado'), version: 2, transaccion: 'leg-1', reserva: { runDestino: 'run-y', ranura: '6', cantidad: 140 } },
    'run-roto': v1('run-roto', null),
  }));
  orig.setItem.call(LS, Registro.CLAVE_MUERTOS, JSON.stringify({ 'run-pend': { nombre: 'a' }, 'run-apl': { nombre: 'b' }, 'run-res': { nombre: 'c' }, 'run-roto': { nombre: 'd' } }));
  orig.setItem.call(LS, 'arcanveil:partida:6', '{"version":');
  await Entrega.recuperarLegados();
  const est = async (r) => (await Entrega.estadoLegado(r))?.estado;
  comprobar(await est('run-pend') === 'pendiente' && await est('run-apl') === 'aplicado' && await est('run-res') === 'reservado' && await muerto('run-pend') && await muerto('run-apl'), 'se importan sin reiniciar: pendiente, aplicada y reservada (bloqueada por la ranura dañada) tal cual', JSON.stringify({ p: await est('run-pend'), a: await est('run-apl'), r: await est('run-res') }));
  const r = await Entrega.entregarLegado({ runOrigen: 'run-apl', transaccion: 't', runDestino: 'run-z', ranura: null, crear: () => { throw new Error('no'); }, guardar: () => ({ ok: true }) });
  comprobar(!r.ok && crudo('arcanveil:partida:6') === '{"version":', 'la aplicada no se cobra otra vez; la ranura dañada se conserva', JSON.stringify(r));
  // Un mapa dañado no se reinicia: se conserva y no inventa muertes ni vidas.
  orig.setItem.call(LS, Registro.CLAVE_MUERTOS, '{roto');
  await Entrega.recuperarLegados();
  comprobar(crudo(Registro.CLAVE_MUERTOS) === '{roto' && await muerto('run-pend'), 'el mapa dañado se conserva tal cual y lo ya importado sigue valiendo', crudo(Registro.CLAVE_MUERTOS));
  // Una campaña viva ajena sigue jugable.
  const m = await crearMotor({ semilla: 6 });
  await m.empezar(BORR('Viva'));
  m.store.fijar('meta.ranura', '3');
  const g = await m.sistema('saves').guardar('3', { silencioso: true });
  const m2 = await crearMotor({ semilla: 7 });
  m2.store.fijar('settings.persistencia', true);
  m2.bus.emit('settings:change', { id: 'persistencia', valor: true });
  const c = await m2.sistema('saves').cargar('3');
  comprobar(c.exito, 'otra campaña viva carga y juega', JSON.stringify({ g: g?.motivo, c: c.motivo }));
});

restaurarLS();
console.log(`\n${casos - fallos}/${casos} comprobaciones correctas`);
process.exitCode = fallos ? 1 : 0;
