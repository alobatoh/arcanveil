/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCANVEIL · tools/auditar-muerte.mjs
 * ---------------------------------------------------------------------------
 * Encargo #4 del 7-oct-2026: la muerte termina la partida, no la caja de texto.
 *
 * Reproducido en 996e073 (semilla 9505, Sive baluarte): tras atacar a Dalwen
 * y pelear con Berlo, vida 0/34, el combate acaba y el siguiente «miro
 * alrededor» no contesta nada; `player:defeated` no lo escucha nadie.
 *
 * Aquí: muerte natural, por agotamiento, eventos dobles, nada después de
 * morir (turno, combate, curas, experiencia), guardados del mismo run y de
 * otros, dos personajes con el mismo nombre, migración 9→10, almacenamiento
 * que falla, y el legado del 35 % (preparado, no aplicado).
 *
 *   node tools/auditar-muerte.mjs
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { crearMotor } from './motor-sin-ventana.mjs';
import { migrar } from '../src/persistence/Migrations.js';

let fallos = 0;
let casos = 0;
function comprobar(bien, texto, detalle = '') {
  casos += 1;
  if (bien) console.log(`OK   ${texto}`);
  else { fallos += 1; console.log(`MAL  ${texto}`); if (detalle) console.log(`     ${String(detalle).replace(/\n/g, ' | ').slice(0, 600)}`); }
}
async function caso(fn) {
  try { await fn(); } catch (e) { comprobar(false, 'el caso revienta antes de terminar', String(e?.stack ?? e).split('\n').slice(0, 2).join(' ')); }
}
const visible = (t) => String(t).split('\n').filter((l) => l && !l.startsWith('»')).join('\n');
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const Legado = await import('../src/player/Legado.js').catch(() => null);
const Registro = await import('../src/persistence/RegistroRuns.js').catch(() => null);

async function partida(semilla = 9505, clase = 'baluarte', nombre = 'Sive') {
  const m = await crearMotor({ semilla });
  await m.empezar({ nombre, raza: 'valdes', clase, trasfondo: 'errante', genero: 'f' });
  const fin = [];
  m.bus.on('run:ended', (d) => fin.push(d));
  return { m, fin };
}

/** Pelea hasta que alguien caiga, atacando a Berlo (el guardia). */
async function pelearHastaMorir(p) {
  const c = p.m.sistema('combat');
  for (let i = 0; i < 80 && p.m.ver('combat.activo', false); i++) {
    for (let k = 0; k < 300 && !c.esperandoJugador && p.m.ver('combat.activo', false); k++) await espera(5);
    if (!p.m.ver('combat.activo', false)) break;
    // FIXTURE: el baluarte va con 3 de vida para que la pelea acabe pronto.
    if (i === 0) p.m.store.fijar('player.vida.actual', 3);
    const berlo = Object.values(c._combatientes).find((x) => x.nombre === 'Berlo');
    if (typeof c.ejecutar === 'function') {
      const accion = c.accionesDelJugador?.()?.ataques?.[0];
      await c.ejecutar({ tipo: 'atacar', ataqueId: accion?.id, objetivoId: berlo?.id, token: c.turnoToken?.() });
    } else {
      await c.accionJugador({ tipo: 'defender' });
    }
  }
  await espera(30);
}

console.log('\n── Muerte en combate (semilla 9505: atacar a Dalwen, Berlo se mete; FIXTURE: 3 de vida) ──');
await caso(async () => {
  const p = await partida();
  const runId = p.m.ver('meta.runId');
  await p.m.jugar('ataco a Dalwen');
  await pelearHastaMorir(p);
  const muerte = p.m.ver('meta.muerte');
  comprobar(Boolean(runId) && muerte?.runId === runId && p.m.ver('meta.fase') === 'fin' && p.m.ver('player.vida.actual') === 0,
    `estado terminal del run ${runId}: fase fin, vida 0`, JSON.stringify(muerte)?.slice(0, 300));
  comprobar(/combate contra .*Berlo/.test(muerte?.causa ?? '') && Number.isFinite(muerte?.momento?.dia) && muerte?.momento?.lugar === 'vado_yunque',
    `causa y momento: «${muerte?.causa}» (día ${muerte?.momento?.dia}, ${muerte?.momento?.lugar})`);
  comprobar(p.fin.length === 1, 'un solo `run:ended`', p.fin.length);
  const t0 = JSON.stringify(p.m.ver('world.tiempo'));
  const texto = visible(await p.m.jugar('miro alrededor'));
  comprobar(/ha muerto/.test(texto) && JSON.stringify(p.m.ver('world.tiempo')) === t0, '«miro alrededor» tras morir: lo dice (no es una caja muda) y no pasa el tiempo', texto);
  p.m.bus.emit('player:defeated', { origen: 'combate' });
  p.m.bus.emit('player:down', {});
  await espera(10);
  comprobar(p.fin.length === 1 && p.m.ver('meta.muerte.registrada') === muerte.registrada, 'eventos repetidos: ni otra muerte ni otro legado', p.fin.length);
  const xp = p.m.ver('player.xp');
  p.m.store.dispatch('player/xp', { cantidad: 500, motivo: 'tardía' });
  p.m.store.dispatch('player/curar', { cantidad: 10 });
  comprobar(p.m.ver('player.xp') === xp && p.m.ver('player.vida.actual') === 0, 'después de morir: ni experiencia tardía ni curas');
  p.m.bus.emit('combat:request', { enemies: [{ refId: 'lobo', count: 1 }] });
  await espera(20);
  comprobar(!p.m.ver('combat.activo', false), 'ni se abre otro combate');
  comprobar(Registro?.estaMuerto(runId), 'marca durable del run en el almacenamiento local');
  const legados = Registro?.legados() ?? {};
  comprobar(legados[runId]?.estado === 'pendiente' && legados[runId].fraccion === 0.35, 'herencia guardada, pendiente y sin aplicar (35 %)', JSON.stringify(legados[runId])?.slice(0, 200));
});

console.log('\n── Muerte por agotamiento (FIXTURE: fatiga 0 y 1 de vida) ──');
await caso(async () => {
  const p = await partida(9303, 'rastreador');
  p.m.store.fijar('world.situaciones', { porId: {}, orden: [] });
  p.m.store.fijar('player.fatiga', 0);
  p.m.store.fijar('player.vida.actual', 1);
  await p.m.jugar('miro alrededor');
  await espera(20);
  comprobar(p.m.ver('meta.muerte') && /agotad/.test(p.m.ver('meta.muerte.causa')), `causa: «${p.m.ver('meta.muerte.causa')}»`, JSON.stringify(p.m.ver('meta.muerte'))?.slice(0, 200));
});

console.log('\n── Guardados del mismo run y de otros ──');
await caso(async () => {
  const p = await partida();
  const saves = p.m.sistema('saves');
  const runId = p.m.ver('meta.runId');
  saves.guardar('2', { silencioso: true }); // ranura anterior, viva, del mismo run
  p.m.store.dispatch('player/danar', { cantidad: 999, origen: 'combate' });
  await espera(20);
  saves.guardar('1', { silencioso: true }); // el final
  const lista = saves.listar();
  comprobar(lista.find((r) => r.ranura === '1')?.muerto && lista.find((r) => r.ranura === '2')?.muerto, 'la lista marca muertas las dos ranuras del run (final y anterior)');
  let r = saves.cargar('1');
  comprobar(!r.exito && r.motivo === 'muerto', 'cargar el final: no reabre la exploración', JSON.stringify(r));
  r = saves.cargar('2');
  comprobar(!r.exito && r.motivo === 'muerto', 'cargar la ranura ANTERIOR del mismo run: no resucita', JSON.stringify(r));

  // Otro personaje, mismo nombre, otro run: sigue vivo y carga.
  const q = await partida(9303, 'rastreador', 'Sive');
  comprobar(q.m.ver('meta.runId') !== runId, 'otra «Sive»: otro run');
  q.m.sistema('saves').guardar('3', { silencioso: true });
  r = q.m.sistema('saves').cargar('3');
  comprobar(r.exito && q.m.ver('player.vida.actual') > 0, '  y su partida carga: el nombre no la mata', JSON.stringify(r));
});

console.log('\n── Migración 9 → 10 ──');
await caso(async () => {
  const base = (vida) => ({ version: 9, estado: { meta: { semilla: 77, creada: 1700000000000, turno: 12, fase: 'exploracion' }, player: { nombre: 'Ena', raza: 'valdes', clase: 'filo', nivel: 2, vida: { actual: vida, max: 30 } }, world: { ubicacion: 'saucedo', tiempo: { dia: 3, hora: 9, minuto: 0 } } } });
  const viva = migrar(structuredClone(base(12)));
  const muerta = migrar(structuredClone(base(0)));
  comprobar(viva.guardado.version >= 10 && /^run-v9-/.test(viva.guardado.estado.meta.runId) && !viva.guardado.estado.meta.muerte && viva.guardado.estado.meta.fase === 'exploracion',
    'guardado vivo: recibe un runId estable y sigue vivo', JSON.stringify(viva.guardado.estado.meta));
  comprobar(muerta.guardado.estado.meta.muerte?.migrada && muerta.guardado.estado.meta.fase === 'fin', 'guardado a 0 de vida: pasa a resultado terminal', JSON.stringify(muerta.guardado.estado.meta));
  const otra = migrar(structuredClone(base(12)));
  comprobar(otra.guardado.estado.meta.runId === viva.guardado.estado.meta.runId, 'el mismo guardado da el mismo runId (estable)');
  const dos = migrar(structuredClone(viva.guardado));
  comprobar(JSON.stringify(dos.guardado.estado.meta) === JSON.stringify(viva.guardado.estado.meta), 'idempotente');
  const b = base(12);
  b.estado.meta.creada = 1700000009999;
  comprobar(migrar(b).guardado.estado.meta.runId !== viva.guardado.estado.meta.runId, 'otra creación, otro run (no se juntan por nombre)');
});

console.log('\n── Almacenamiento que falla ──');
await caso(async () => {
  const p = await partida();
  const original = globalThis.localStorage.setItem;
  globalThis.localStorage.setItem = (k, v) => { if (String(k).startsWith('arcanveil:runs') || String(k).startsWith('arcanveil:legados')) { const e = new Error('lleno'); e.name = 'QuotaExceededError'; throw e; } return original.call(globalThis.localStorage, k, v); };
  p.m.store.dispatch('player/danar', { cantidad: 999, origen: 'combate' });
  await espera(20);
  globalThis.localStorage.setItem = original;
  const g = p.m.ver('meta.muerte.guardado');
  comprobar(g && g.marca === false && /lleno/.test(g.error ?? ''), 'FIXTURE almacenamiento lleno: no se promete la marca (queda dicho)', JSON.stringify(g));
});

console.log('\n── Legado del 35 % (preparado, sin decidir la base) ──');
await caso(async () => {
  const { calcularLegado, aplicarLegado, fotoDeLegado, MODALIDAD, FRACCION_LEGADO, LEGADO_CONFIRMADO } = Legado;
  comprobar(FRACCION_LEGADO === 0.35 && LEGADO_CONFIRMADO === null, 'fracción 0,35 fija; la modalidad sigue sin confirmar');
  const foto = (xp, puntos = 0, heredado = 0) => fotoDeLegado({ meta: { runId: 'run-a' }, player: { nombre: 'Ena', xp, puntosHabilidad: puntos, legadoRecibido: heredado ? { xp: heredado } : undefined } }, { ahora: 1 });
  const xp = (n, o) => calcularLegado(foto(n), MODALIDAD.XP_ACUMULADA, o);
  comprobar(xp(100).cantidad === 35 && xp(200).cantidad === 70 && xp(0).cantidad === 0, '100 → 35, 200 → 70, 0 → 0 de experiencia');
  comprobar(xp(103).cantidad === 36 && xp(1).cantidad === 0 && xp(103, { redondeo: 'cercano' }).cantidad === 36 && xp(1, { redondeo: 'arriba' }).cantidad === 1, '103 y 1: la fracción se calcula; el redondeo productivo sigue pendiente');
  comprobar(calcularLegado(foto(0, 10), MODALIDAD.PUNTOS_DISPONIBLES).cantidad === 3, '10 puntos disponibles → 3 (a la baja)');
  comprobar(!calcularLegado(foto(0, 10), MODALIDAD.PUNTOS_TOTALES).ok, 'puntos gastados: sin semántica definida, no se calcula');
  comprobar(calcularLegado(foto(1000, 0, 400), MODALIDAD.XP_ACUMULADA, { excluirHeredado: true }).cantidad === 210, 'lo heredado de antes se puede excluir (1000 − 400 → 210), sin decidirlo aquí');
  for (const malo of [NaN, -5, Infinity, 'x']) {
    comprobar(!calcularLegado(fotoDeLegado({ player: { xp: malo } }), MODALIDAD.XP_ACUMULADA).ok, `valor corrupto (${String(malo)}): no hereda nada`);
  }
  const f = foto(200);
  comprobar(!aplicarLegado(f, { runId: 'run-b' }).ok, 'aplicar SIN confirmación: no hace nada');
  const prueba = { modalidad: MODALIDAD.XP_ACUMULADA, redondeo: 'abajo' }; // confirmación de PRUEBA
  const r1 = aplicarLegado(f, { runId: 'run-b' }, prueba);
  comprobar(r1.ok && r1.cantidad === 70 && r1.acciones.length === 1 && r1.acciones[0].tipo === 'player/xp' && r1.foto.estado === 'aplicado', 'con confirmación de prueba: 70 de experiencia por el canal normal, una sola acción (ni puntos extra)');
  comprobar(!aplicarLegado(r1.foto, { runId: 'run-c' }, prueba).ok, 'una vez aplicada, no se aplica a otro sucesor');
  comprobar(!aplicarLegado(f, { runId: 'run-a' }, prueba).ok, 'el muerto no es su propio sucesor');
});

console.log(`\n${casos - fallos}/${casos} comprobaciones bien.`);
process.exit(fallos ? 1 : 0);
