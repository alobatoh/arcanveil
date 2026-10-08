/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCANVEIL · tools/auditar-legado.mjs
 * ---------------------------------------------------------------------------
 * Encargo #6 del 7-oct-2026: el legado del 35 % de la experiencia acumulada,
 * redondeado hacia abajo, entregado una vez a un sucesor al confirmar su
 * creación, de forma atómica e idempotente en el almacenamiento local.
 *
 * Qué se comprueba:
 *   · la fórmula (0→0, 1→0, 3→1, 20→7, 100→35, 103→36, 1000→350…) y los
 *     valores rotos (no finitos, negativos, decimales, texto, enormes);
 *   · que la moneda es solo experiencia y que la decisión ya no está «pendiente»;
 *   · la entrega en el motor real: el muerto, su foto, el sucesor de OTRA clase
 *     por el flujo normal (nivel, vida, maná y puntos iguales a un testigo que
 *     gana esa experiencia jugando), su inventario propio, la procedencia,
 *     recargar, exportar e importar sin volver a cobrar;
 *   · generaciones (B heredó 350 y ganó 650 → C recibe 350), 0 XP, nivel
 *     máximo, mismos nombres, origen vivo, otra herencia intacta, muerte doble
 *     y experiencia tardía;
 *   · un corte DESPUÉS DE CADA ESCRITURA del protocolo y un fallo de cuota en
 *     cada una, con reapertura y recuperación; relectura que no cuadra; doble
 *     petición; transacción vieja; dos pestañas; sin Web Locks;
 *   · fotos de la versión 1 (pendiente, aplicada, sin experiencia válida) y
 *     un registro ilegible.
 *
 * FIXTURES (etiquetados donde se usan): la experiencia del muerto se le da
 * por `player/xp` antes de morir, y la muerte se provoca con `morir()`; las
 * «pestañas» y el candado de Web Locks son dobles en un solo proceso.
 *
 *   node tools/auditar-legado.mjs
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
async function caso(fn) {
  try { await fn(); } catch (e) { comprobar(false, 'el caso revienta antes de terminar', String(e?.stack ?? e).split('\n').slice(0, 3).join(' ')); }
}

const Legado = await import('../src/player/Legado.js');
const Entrega = await import('../src/persistence/EntregaLegado.js').catch(() => null);
const Registro = await import('../src/persistence/RegistroRuns.js');
const Coordinacion = await import('../src/persistence/Coordinacion.js');
const { nuevoRunId } = await import('../src/player/Muerte.js');
const { nivelParaXP } = await import('../src/player/Progression.js');
const Ser = await import('../src/persistence/Serializer.js');

/* ── dobles ──────────────────────────────────────────────────────────── */

/** Web Locks en un proceso: un candado por nombre, pedido sin esperar. */
function candadosFalsos() {
  const tomados = new Set();
  return {
    tomados,
    async request(nombre, opciones, fn) {
      // `ifAvailable` no espera (candado de la herencia); sin él se espera
      // como el Web Locks de verdad (candado global de ranuras, #7).
      if (opciones?.ifAvailable && tomados.has(nombre)) return fn(null);
      while (tomados.has(nombre)) await new Promise((r) => setTimeout(r, 3));
      tomados.add(nombre);
      try { return await fn({ name: nombre }); } finally { tomados.delete(nombre); }
    },
  };
}
const candados = candadosFalsos();
Entrega?.usarCandados(candados);

/** El almacenamiento del proceso, con un interruptor para cortes y fallos. */
const LS = globalThis.localStorage;
const original = { setItem: LS.setItem, removeItem: LS.removeItem, getItem: LS.getItem };
const trampa = { escrituras: 0, cortarTras: Infinity, cuotaEn: Infinity, caido: false, registro: [] };
LS.setItem = (k, v) => {
  if (trampa.caido) throw new Error('proceso caído');
  trampa.escrituras += 1;
  if (trampa.escrituras === trampa.cuotaEn) { const e = new Error('lleno'); e.name = 'QuotaExceededError'; throw e; }
  original.setItem(k, v);
  trampa.registro.push(k);
  if (trampa.escrituras >= trampa.cortarTras) trampa.caido = true;
};
LS.removeItem = (k) => {
  if (trampa.caido) throw new Error('proceso caído');
  original.removeItem(k);
};
// #7: el estado de cada herencia y el registro de ranuras viven en el
// almacén coordinado (IndexedDB; aquí en memoria). Sus escrituras también
// cuentan para cortar y para llenar la cuota, en el mismo orden.
{
  const interno = Coordinacion.crearEnMemoria();
  Coordinacion.usarCoordinacion({
    ...interno,
    async cas(a, k, decidir) {
      if (trampa.caido) throw new Error('proceso caído');
      const r = await interno.cas(a, k, (actual) => {
        const d = decidir(actual);
        if (d) {
          trampa.escrituras += 1;
          if (trampa.escrituras === trampa.cuotaEn) { const e = new Error('lleno'); e.name = 'QuotaExceededError'; throw e; }
        }
        return d;
      });
      if (r.cambiado) {
        trampa.registro.push(`[coordinado] ${a}/${k}`);
        if (trampa.escrituras >= trampa.cortarTras) trampa.caido = true;
      }
      return r;
    },
  });
}
function armar({ cortarTras = Infinity, cuotaEn = Infinity } = {}) {
  Object.assign(trampa, { escrituras: 0, cortarTras, cuotaEn, caido: false, registro: [] });
}
const desarmar = () => armar();
async function limpiarTodo() {
  await Coordinacion.vaciar();
  desarmar();
  for (const k of Array.from({ length: LS.length }, (_, i) => LS.key(i))) if (k?.startsWith('arcanveil:')) original.removeItem(k);
}
const leerJSON = (k) => { try { return JSON.parse(original.getItem(k) ?? 'null'); } catch { return 'ILEGIBLE'; } };
const ranuras = () => Array.from({ length: LS.length }, (_, i) => LS.key(i)).filter((k) => k?.startsWith('arcanveil:partida:'));
const sucesoresDe = (runOrigen) => ranuras().map((k) => ({ k, g: leerJSON(k) })).filter(({ g }) => g?.estado?.player?.legadoRecibido?.runOrigen === runOrigen);

/* ── partidas ────────────────────────────────────────────────────────── */

const BORRADOR = {
  A: { nombre: 'Sive', raza: 'valdes', clase: 'rastreador', trasfondo: 'errante', genero: 'f' },
  B: { nombre: 'Brun', raza: 'valdes', clase: 'glifista', trasfondo: 'errante', genero: 'm' },
  C: { nombre: 'Ena', raza: 'valdes', clase: 'baluarte', trasfondo: 'errante', genero: 'f' },
};

async function empezar(borrador, semilla = 9303, ranura = '1') {
  const m = await crearMotor({ semilla });
  await m.empezar(borrador);
  m.store.fijar('meta.ranura', ranura);
  return m;
}

/** FIXTURE: experiencia conocida por el canal normal y muerte provocada. */
async function morirCon(m, xp, ranura = m.ver('meta.ranura') ?? '1') {
  if (xp > 0) { m.store.dispatch('player/xp', { cantidad: xp, motivo: 'fixture' }); await new Promise((r) => setTimeout(r, 0)); }
  const muerte = m.sistema('muerte').morir({ origen: 'combate' });
  // Desde el #8 la marca y la foto se registran después (asíncrono): se
  // espera a ese registro real y al guardado del final.
  const guardado = muerte ? await m.sistema('muerte').registro : null;
  await m.sistema('saves').guardar(ranura, { silencioso: true });
  return muerte ? { ...muerte, guardado } : muerte;
}

/**
 * Crea un sucesor como lo hace la app: motor limpio, ajustes de partida
 * nueva y entrega con el protocolo.
 */
async function sucesor(runOrigen, borrador, { ranura = '2', transaccion = Entrega.nuevaTransaccion(), runDestino = nuevoRunId(), semilla = 9505, motor = null, alCrear = null } = {}) {
  const m = motor ?? await crearMotor({ semilla });
  m.store.fijar('settings.persistencia', true);
  m.store.fijar('settings.autoguardado', false);
  m.bus.emit('settings:change', { id: 'persistencia', valor: true });
  m.store.fijar('meta.ranura', ranura);
  const r = await Entrega.entregarLegado({
    runOrigen, transaccion, runDestino, ranura,
    crear: async ({ cantidad, legado }) => { await Entrega.crearEnMotor(m.store, { borrador, runDestino, cantidad, legado }); if (alCrear) await alCrear(); },
    guardar: async ({ lease, op } = {}) => { const g = await m.sistema('saves').guardar(ranura, { silencioso: true, lease, op }); return { ok: g.exito, motivo: g.motivo }; },
  });
  return { m, r, transaccion, runDestino };
}

/** Un testigo: el mismo personaje que gana esa experiencia jugando. */
async function testigo(borrador, xp) {
  const m = await crearMotor({ semilla: 9505 });
  await m.empezar(borrador);
  if (xp > 0) { m.store.dispatch('player/xp', { cantidad: xp, motivo: 'testigo' }); await new Promise((r) => setTimeout(r, 0)); }
  const p = m.ver('player');
  return { nivel: p.nivel, vida: p.vida.max, mana: p.mana.max, talento: p.puntosTalento ?? 0, habilidad: p.puntosHabilidad ?? 0, atributo: p.puntosAtributo ?? 0, inventario: Object.values(m.ver('inventory.objetos.porId') ?? {}).map((o) => o.refId).sort().join(',') };
}
const progreso = (m) => { const p = m.ver('player'); return { nivel: p.nivel, vida: p.vida.max, mana: p.mana.max, talento: p.puntosTalento ?? 0, habilidad: p.puntosHabilidad ?? 0, atributo: p.puntosAtributo ?? 0, inventario: Object.values(m.ver('inventory.objetos.porId') ?? {}).map((o) => o.refId).sort().join(',') }; };

/* ═══════════════════════════════════════════════════════════════════════ */

console.log('── Fórmula: 35 % de la experiencia acumulada, hacia abajo, en enteros ──');
{
  const ej = [[0, 0], [1, 0], [2, 0], [3, 1], [20, 7], [100, 35], [103, 36], [200, 70], [1000, 350]];
  for (const [xp, esperado] of ej) comprobar(Legado.cantidadLegado(xp) === esperado, `${xp} XP → ${esperado}`, Legado.cantidadLegado(xp));
  // Fronteras donde `Math.floor(x * 0.35)` se equivoca por coma flotante.
  let malos = 0;
  for (let x = 0; x <= 200000; x++) if (Legado.cantidadLegado(x) !== Math.trunc((x * 35) / 100) || Legado.cantidadLegado(x) * 100 > x * 35 || (Legado.cantidadLegado(x) + 1) * 100 <= x * 35) malos += 1;
  comprobar(malos === 0, '0…200 000: siempre ⌊35·x/100⌋ exacto (sin el error de 0,35 en coma flotante)', malos);
  comprobar(Legado.cantidadLegado(Legado.XP_MAXIMA_LEGADO) === 350_000_000, `tope (${Legado.XP_MAXIMA_LEGADO}) → 350 000 000 exacto`);
  for (const malo of [-1, 1.5, NaN, Infinity, -Infinity, '100', null, undefined, Legado.XP_MAXIMA_LEGADO + 1, 2 ** 60]) {
    comprobar(Legado.cantidadLegado(malo) === null, `valor roto (${String(malo)}): ninguna cantidad, ni truncada ni inventada`);
  }
  comprobar(Legado.LEGADO_CONFIRMADO && Legado.LEGADO_CONFIRMADO.modalidad === 'xp_acumulada' && Legado.LEGADO_CONFIRMADO.redondeo === 'abajo',
    'decisión fija: experiencia acumulada, hacia abajo (ya no «pendiente»)', JSON.stringify(Legado.LEGADO_CONFIRMADO));
  comprobar(Object.values(Legado.MODALIDAD).length === 1 && !('aplicarLegado' in Legado), 'una sola moneda; no hay vía de puntos de habilidad', Object.keys(Legado).join(','));
  const foto = Legado.fotoDeLegado({ meta: { runId: 'run-x' }, player: { nombre: 'X', xp: 1000, xpHeredada: 350, puntosHabilidad: 9, puntosTalento: 4 } }, { ahora: 1 });
  comprobar(foto.cantidad === 350 && foto.base.xpAcumulada === 1000 && foto.base.xpHeredada === 350 && foto.base.xpGanada === 650 && !('puntosHabilidadDisponibles' in foto.base),
    'foto: acumulada 1000 (350 heredada + 650 ganada) → 350; sin puntos en la base', JSON.stringify(foto.base));
  const foto2 = Legado.fotoDeLegado({ meta: { runId: 'run-y' }, player: { nombre: 'Y', xp: NaN } });
  comprobar(foto2.estado === 'bloqueado' && foto2.cantidad === null && foto2.motivo && foto2.base.xpOriginal === 'NaN', 'experiencia rota al morir: foto bloqueada, con motivo y el valor original a la vista', JSON.stringify(foto2));
}

if (!Entrega) {
  comprobar(false, 'no existe persistence/EntregaLegado.js: la herencia no se entrega');
} else {

console.log('\n── Entrega en el motor: muere con 103 XP, sucesor de otra clase ──');
await caso(async () => {
  await limpiarTodo();
  const a = await empezar(BORRADOR.A, 9303, '1');
  const invA = progreso(a).inventario;
  const muerte = await morirCon(a, 103);
  const runA = muerte.runId;
  comprobar(muerte.guardado.marca && muerte.guardado.legado, 'marca de muerte y herencia escritas al morir', JSON.stringify(muerte.guardado));
  comprobar((await Entrega.estadoLegado(runA))?.cantidad === 36 && (await Entrega.estadoLegado(runA))?.estado === 'pendiente', 'herencia pendiente: 36 XP (35 % de 103 hacia abajo)', JSON.stringify((await Entrega.estadoLegado(runA)))?.slice(0, 300));
  a.store.dispatch('player/xp', { cantidad: 500, motivo: 'tardía' });
  await new Promise((r) => setTimeout(r, 0));
  comprobar(a.ver('player.xp') === 103 && (await Entrega.estadoLegado(runA)).base.xpAcumulada === 103, 'experiencia tardía tras morir: no entra ni cambia la foto');
  a.sistema('muerte').morir({ origen: 'combate' });
  Registro.marcarMuerto(runA, { nombre: 'Sive' });
  comprobar(Object.keys(Registro.legados()).length === 1 && (await Entrega.estadoLegado(runA)).creado === muerte.legado.creado, 'morir o marcar dos veces: una sola herencia, sin reescribir');

  // Abrir el creador, mirar y cancelar no escribe nada: el listado es lectura.
  const antes = original.getItem(Registro.CLAVE_LEGADOS);
  const pendientes = (await Entrega.legadosPendientes());
  comprobar(pendientes.length === 1 && pendientes[0].cantidad === 36 && original.getItem(Registro.CLAVE_LEGADOS) === antes, 'listar (abrir el creador y cancelar) no consume ni escribe', JSON.stringify(pendientes));

  const { m: b, r, runDestino } = await sucesor(runA, BORRADOR.B, { ranura: '2' });
  comprobar(r.ok && r.cantidad === 36 && r.confirmado, 'entrega confirmada', JSON.stringify(r));
  const control = await testigo(BORRADOR.B, 36);
  // `b` ya no es el motor activo tras `testigo`: se compara lo guardado.
  const g = leerJSON('arcanveil:partida:2');
  const pB = g.estado.player;
  comprobar(pB.xp === 36 && pB.clase === 'glifista' && pB.nombre === 'Brun' && g.estado.meta.runId === runDestino && runDestino !== runA, 'el sucesor: 36 XP, su clase, su nombre, su run', JSON.stringify({ xp: pB.xp, clase: pB.clase, run: g.estado.meta.runId }));
  comprobar(pB.nivel === control.nivel && pB.vida.max === control.vida && pB.mana.max === control.mana && (pB.puntosHabilidad ?? 0) === control.habilidad && (pB.puntosTalento ?? 0) === control.talento,
    `nivel, vida, maná y puntos = los de un ${BORRADOR.B.clase} que gana 36 jugando (nivel ${control.nivel}, vida ${control.vida}, maná ${control.mana})`, JSON.stringify({ pB: { n: pB.nivel, v: pB.vida.max, m: pB.mana.max }, control }));
  const invB = Object.values(g.estado.inventory?.objetos?.porId ?? {}).map((o) => o.refId).sort().join(',');
  comprobar(invB === control.inventario && invB !== invA, 'inventario propio de su clase, no el del muerto', `${invB} | muerto: ${invA}`);
  const fotoA = (await Entrega.estadoLegado(runA));
  comprobar(pB.legadoRecibido?.runOrigen === runA && pB.legadoRecibido.xp === 36 && pB.legadoRecibido.xpOrigen === 103 && pB.xpHeredada === 36
    && pB.legadoRecibido.transaccion === fotoA.transaccion && Number.isFinite(pB.legadoRecibido.momento),
    'procedencia: origen, cantidad, experiencia del muerto, transacción y momento', JSON.stringify(pB.legadoRecibido));
  comprobar((g.estado.hazanas?.xpTotal ?? g.estado.stats?.xpTotal ?? 0) === 0, 'la experiencia ganada jugando sigue en 0 (la heredada va aparte)', JSON.stringify(g.estado.hazanas ?? {}).slice(0, 200));
  comprobar(fotoA.estado === 'aplicado' && fotoA.destinatario === runDestino && fotoA.ranura === '2' && fotoA.aplicado.cantidad === 36 && fotoA.base.xpAcumulada === 103,
    'herencia apuntada como entregada a ese run y esa ranura, con la foto original intacta', JSON.stringify(fotoA).slice(0, 400));

  // Recargar, exportar e importar: misma experiencia y sin volver a cobrar.
  const m2 = await crearMotor({ semilla: 1 });
  m2.store.fijar('settings.persistencia', true);
  m2.bus.emit('settings:change', { id: 'persistencia', valor: true });
  const c = await m2.sistema('saves').cargar('2');
  comprobar(c.exito && m2.ver('player.xp') === 36 && m2.ver('player.nivel') === pB.nivel && m2.ver('player.legadoRecibido.runOrigen') === runA, 'recargar: misma experiencia, nivel y procedencia', JSON.stringify(c));
  const texto = Ser.aTexto(m2.sistema('saves')._construir('exportada'));
  for (let i = 0; i < 3; i++) await m2.sistema('saves').importar(texto);
  await m2.sistema('saves').cargar('2');
  comprobar(m2.ver('player.xp') === 36 && m2.ver('player.xpHeredada') === 36 && m2.ver('player.puntosHabilidad') === pB.puntosHabilidad, 'exportar, importar tres veces y cargar otra vez: no se reotorga nada');
  m2.store.dispatch('player/xp', { cantidad: 36, motivo: 'legado', legado: { runOrigen: runA, transaccion: 'otra' } });
  await new Promise((rr) => setTimeout(rr, 0));
  comprobar(m2.ver('player.xp') === 36, 'el canal de experiencia rechaza una segunda herencia en el mismo personaje');

  const otra = await sucesor(runA, BORRADOR.C, { ranura: '3' });
  comprobar(!otra.r.ok && otra.r.codigo === 'entregado' && !leerJSON('arcanveil:partida:3'), 'segundo sucesor del mismo muerto: rechazado, sin ranura nueva', JSON.stringify(otra.r));
  // Contrato #7: el reintento lleva la misma transacción Y el mismo destino.
  const mismo = await Entrega.entregarLegado({ runOrigen: runA, transaccion: fotoA.transaccion, runDestino, ranura: '4', crear: () => { throw new Error('no debería crear'); }, guardar: () => ({ ok: true }) });
  comprobar(mismo.ok && mismo.yaHecho && mismo.runDestino === runDestino && !leerJSON('arcanveil:partida:4'), 'repetir la MISMA transacción (doble clic, recarga): el mismo resultado, sin crear otro', JSON.stringify(mismo));
  comprobar(sucesoresDe(runA).length === 1, 'un único sucesor guardado de ese muerto', sucesoresDe(runA).map((x) => x.k));
});

console.log('\n── Generaciones: B heredó 350, gana 650 y muere con 1000 → C recibe 350 ──');
await caso(async () => {
  await limpiarTodo();
  const a = await empezar(BORRADOR.A, 9303, '1');
  const mA = await morirCon(a, 1000);
  const { r: rB } = await sucesor(mA.runId, BORRADOR.B, { ranura: '2' });
  comprobar(rB.ok && rB.cantidad === 350, 'A (1000) → B recibe 350', JSON.stringify(rB));
  const b = await crearMotor({ semilla: 2 });
  b.store.fijar('settings.persistencia', true); b.bus.emit('settings:change', { id: 'persistencia', valor: true });
  await b.sistema('saves').cargar('2');
  b.store.fijar('meta.ranura', '2');
  const mB = await morirCon(b, 650);
  const fB = (await Entrega.estadoLegado(mB.runId));
  comprobar(fB.base.xpAcumulada === 1000 && fB.base.xpHeredada === 350 && fB.base.xpGanada === 650 && fB.cantidad === 350,
    'foto de B: 1000 acumulada = 350 heredada + 650 ganada → 350 (ni 577 ni 227)', JSON.stringify(fB.base));
  const { r: rC } = await sucesor(mB.runId, BORRADOR.C, { ranura: '3' });
  const pC = leerJSON('arcanveil:partida:3')?.estado?.player;
  comprobar(rC.ok && pC?.xp === 350 && pC.xpHeredada === 350 && pC.legadoRecibido.runOrigen === mB.runId && pC.legadoRecibido.xpOrigen === 1000, 'C: 350 de B, con B como origen', JSON.stringify(pC?.legadoRecibido));
  comprobar((await Entrega.estadoLegado(mA.runId)).estado === 'aplicado' && (await Entrega.estadoLegado(mA.runId)).destinatario === mB.runId, 'la herencia de A sigue entregada a B, sin tocarse', JSON.stringify((await Entrega.estadoLegado(mA.runId))).slice(0, 200));
});

console.log('\n── 0 XP, varios niveles, nivel máximo, mismos nombres, origen vivo ──');
await caso(async () => {
  await limpiarTodo();
  const a = await empezar(BORRADOR.A, 9303, '1');
  const m0 = await morirCon(a, 0);
  const { r } = await sucesor(m0.runId, BORRADOR.B, { ranura: '2' });
  const p = leerJSON('arcanveil:partida:2')?.estado?.player;
  comprobar(r.ok && r.cantidad === 0 && p.xp === 0 && p.nivel === 1 && p.legadoRecibido?.xp === 0 && (await Entrega.estadoLegado(m0.runId)).estado === 'aplicado', '0 XP: se entrega una vez sin premio y queda cerrada', JSON.stringify({ r, xp: p?.xp }));
  const otra = await sucesor(m0.runId, BORRADOR.C, { ranura: '3' });
  comprobar(!otra.r.ok && otra.r.codigo === 'entregado', '…y no queda «disponible» para siempre');

  await limpiarTodo();
  const a2 = await empezar(BORRADOR.A, 9303, '1');
  const m2 = await morirCon(a2, 3000);
  const { r: r2 } = await sucesor(m2.runId, BORRADOR.C, { ranura: '2' });
  const control = await testigo(BORRADOR.C, 1050);
  const p2 = leerJSON('arcanveil:partida:2')?.estado?.player;
  comprobar(r2.ok && p2.xp === 1050 && p2.nivel === nivelParaXP(1050) && p2.nivel === control.nivel && p2.nivel >= 4 && p2.vida.max === control.vida && (p2.puntosHabilidad ?? 0) === control.habilidad && (p2.puntosAtributo ?? 0) === control.atributo,
    `3000 → 1050: varios niveles de golpe (${p2?.nivel}), cada recompensa una vez, como el testigo`, JSON.stringify({ p2: { n: p2?.nivel, v: p2?.vida?.max, h: p2?.puntosHabilidad, a: p2?.puntosAtributo }, control }));

  await limpiarTodo();
  const a3 = await empezar(BORRADOR.A, 9303, '1');
  const m3 = await morirCon(a3, 50_000_000);
  const { r: r3 } = await sucesor(m3.runId, BORRADOR.B, { ranura: '2' });
  const control3 = await testigo(BORRADOR.B, 17_500_000);
  const p3 = leerJSON('arcanveil:partida:2')?.estado?.player;
  comprobar(r3.ok && p3.xp === 17_500_000 && p3.nivel === 20 && p3.nivel === control3.nivel && (p3.puntosHabilidad ?? 0) === control3.habilidad, 'nivel máximo: se queda en 20 con las recompensas de 19 niveles, una vez', JSON.stringify({ n: p3?.nivel, h: p3?.puntosHabilidad, c: control3 }));

  await limpiarTodo();
  const s1 = await empezar(BORRADOR.A, 9303, '1');
  const d1 = await morirCon(s1, 200);
  const s2 = await empezar(BORRADOR.A, 9304, '2');
  const d2 = await morirCon(s2, 400);
  const lista = (await Entrega.legadosPendientes());
  comprobar(d1.runId !== d2.runId && lista.length === 2 && lista.every((v) => v.origen.nombre === 'Sive'), 'dos «Sive» muertas: dos herencias distintas por run, no una por nombre', JSON.stringify(lista.map((v) => [v.runOrigen, v.cantidad])));
  const intacta = original.getItem(Registro.CLAVE_LEGADOS) && JSON.stringify((await Entrega.estadoLegado(d2.runId)));
  const { r: r4 } = await sucesor(d1.runId, BORRADOR.B, { ranura: '3' });
  const tras = JSON.parse(original.getItem(Registro.CLAVE_LEGADOS))[d2.runId];
  comprobar(r4.ok && r4.cantidad === 70 && JSON.stringify(tras) === intacta && tras.estado === 'pendiente', 'entregar la de una no toca la otra (byte a byte)', JSON.stringify(tras).slice(0, 200));

  // Una herencia apuntada para un run que no consta muerto: no se cobra.
  const vivo = 'run-vivo-123';
  const mapa = JSON.parse(original.getItem(Registro.CLAVE_LEGADOS));
  mapa[vivo] = Legado.fotoDeLegado({ meta: { runId: vivo }, player: { nombre: 'Vivo', xp: 900 } });
  original.setItem(Registro.CLAVE_LEGADOS, JSON.stringify(mapa));
  const rv = await sucesor(vivo, BORRADOR.C, { ranura: '4' });
  comprobar(!rv.r.ok && rv.r.codigo === 'no-muerto' && !leerJSON('arcanveil:partida:4') && !(await Entrega.legadosPendientes()).some((v) => v.runOrigen === vivo), 'origen sin muerte registrada: rechazado y fuera de la lista', JSON.stringify(rv.r));
  const propia = await Entrega.entregarLegado({ runOrigen: d2.runId, transaccion: 't', runDestino: d2.runId, ranura: '5', crear: () => {}, guardar: () => ({ ok: true }) });
  comprobar(!propia.ok, 'el muerto no es su propio sucesor');
});

console.log('\n── Corte DESPUÉS DE CADA ESCRITURA, reapertura y recuperación ──');
let escriturasProtocolo = 0;
await caso(async () => {
  // Cuántas escrituras hace una entrega normal.
  await limpiarTodo();
  const a = await empezar(BORRADOR.A, 9303, '1');
  const mA = await morirCon(a, 1000);
  armar();
  const { r } = await sucesor(mA.runId, BORRADOR.B, { ranura: '2' });
  escriturasProtocolo = trampa.escrituras;
  const orden = [...trampa.registro];
  desarmar();
  comprobar(r.ok && escriturasProtocolo >= 3, `una entrega escribe ${escriturasProtocolo} veces: ${orden.join(' → ')}`);
});

for (let k = 1; k <= escriturasProtocolo; k++) {
  await caso(async () => {
    await limpiarTodo();
    const a = await empezar(BORRADOR.A, 9303, '1');
    const mA = await morirCon(a, 1000);
    armar({ cortarTras: k });
    let r;
    try { ({ r } = await sucesor(mA.runId, BORRADOR.B, { ranura: '2' })); } catch (e) { r = { excepcion: e.message }; }
    desarmar();
    const enDisco = (await Entrega.estadoLegado(mA.runId))?.estado;
    // Reabrir: un motor nuevo y la recuperación.
    await crearMotor({ semilla: 3 });
    const rec = await Entrega.recuperarLegados();
    const f = (await Entrega.estadoLegado(mA.runId));
    const hijos = sucesoresDe(mA.runId);
    const coherente = (f.estado === 'aplicado' && hijos.length === 1 && hijos[0].g.estado.meta.runId === f.destinatario && hijos[0].g.estado.player.xp === 350)
      || (f.estado === 'pendiente' && hijos.length === 0);
    comprobar(coherente, `corte tras la escritura ${k}/${escriturasProtocolo} (en disco: ${enDisco}) → al reabrir: ${f.estado}, ${hijos.length} sucesor(es)`, JSON.stringify({ r, rec, f: { e: f.estado, d: f.destinatario }, hijos: hijos.map((h) => h.k) }));
    // Después, un intento nuevo: o se rechaza (ya entregada) o entrega una vez.
    const otra = await sucesor(mA.runId, BORRADOR.C, { ranura: '3' });
    const total = sucesoresDe(mA.runId).length;
    comprobar(total === 1 && (await Entrega.estadoLegado(mA.runId)).estado === 'aplicado' && (f.estado === 'aplicado' ? !otra.r.ok : otra.r.ok),
      `  …y un intento nuevo deja exactamente un sucesor (${f.estado === 'aplicado' ? 'rechazado' : 'entregado ahora'})`, JSON.stringify(otra.r));
  });
}

console.log('\n── Cuota llena en cada escritura: pendiente o recuperable, nunca premio sin guardar ──');
for (let k = 1; k <= escriturasProtocolo; k++) {
  await caso(async () => {
    await limpiarTodo();
    const a = await empezar(BORRADOR.A, 9303, '1');
    const mA = await morirCon(a, 1000);
    armar({ cuotaEn: k });
    const { r } = await sucesor(mA.runId, BORRADOR.B, { ranura: '2' });
    desarmar();
    const f = (await Entrega.estadoLegado(mA.runId));
    const hijos = sucesoresDe(mA.runId);
    const bien = r.ok
      ? (hijos.length === 1 && ['aplicado', 'reservado'].includes(f.estado))
      : (hijos.length === 0 && ['pendiente', 'reservado'].includes(f.estado) && r.motivo);
    comprobar(bien, `cuota llena en la escritura ${k}: ${r.ok ? 'entregada' : `falla con aviso («${r.motivo}»)`}; herencia ${f.estado}, ${hijos.length} sucesor(es)`, JSON.stringify(r));
    await Entrega.recuperarLegados();
    const reintento = await sucesor(mA.runId, BORRADOR.B, { ranura: '2', transaccion: r.ok ? 'otra' : 'reintento' });
    comprobar(sucesoresDe(mA.runId).length === 1 && (await Entrega.estadoLegado(mA.runId)).estado === 'aplicado', `  …reintentar deja un único sucesor y la herencia entregada`, JSON.stringify(reintento.r));
  });
}

console.log('\n── Relectura que no cuadra, transacción vieja, doble petición, dos pestañas ──');
await caso(async () => {
  await limpiarTodo();
  const a = await empezar(BORRADOR.A, 9303, '1');
  const mA = await morirCon(a, 1000);
  // La ranura se escribe, pero lo que se relee no es lo escrito (en el
  // espejo local y, desde el #8, en la copia autoritativa, que es la que se
  // relee).
  const getItem = LS.getItem;
  LS.getItem = (k) => { const v = getItem.call(LS, k); if (k === 'arcanveil:partida:2' && v) { const g = JSON.parse(v); g.estado.player.xp = 9999; return JSON.stringify(g); } return v; };
  const realCoord = Coordinacion.motorActual();
  Coordinacion.usarCoordinacion({ ...realCoord, async leer(a, k) { const v = await realCoord.leer(a, k); if (a === Coordinacion.ALMACENES.PARTIDAS && k === '2' && v) { const g = JSON.parse(v.texto); g.estado.player.xp = 9999; return { ...v, texto: JSON.stringify(g) }; } return v; } });
  const { r } = await sucesor(mA.runId, BORRADOR.B, { ranura: '2' });
  Coordinacion.usarCoordinacion(realCoord);
  LS.getItem = getItem;
  // Contrato #7 (más estricto que el del #6, que retiraba la ranura y
  // devolvía la herencia): si lo releído no es lo escrito, el estado es
  // dudoso; no se borra nada ni se libera la herencia: se bloquea y se
  // vuelve a comprobar con lecturas sanas.
  comprobar(!r.ok && r.fase === 'guardar' && !r.devuelto && (await Entrega.estadoLegado(mA.runId)).estado === 'reservado' && (await Entrega.estadoLegado(mA.runId)).bloqueo?.motivo && !(await Entrega.legadosPendientes()).some((v) => v.runOrigen === mA.runId),
    'relectura distinta de lo escrito: no se da por entregada ni se libera; queda bloqueada con motivo y sin borrar la ranura', JSON.stringify(r));
  await Entrega.recuperarLegados();
  comprobar((await Entrega.estadoLegado(mA.runId)).estado === 'aplicado' && sucesoresDe(mA.runId).length === 1, '  al volver a comprobar con lecturas sanas, el sucesor estaba bien escrito: aplicado, uno', (await Entrega.estadoLegado(mA.runId)).estado);

  await limpiarTodo();
  const a1 = await empezar(BORRADOR.A, 9303, '1');
  const m1 = await morirCon(a1, 1000);
  const t1 = Entrega.nuevaTransaccion();
  const { r: ok1 } = await sucesor(m1.runId, BORRADOR.B, { ranura: '2', transaccion: t1 });
  const vieja = await sucesor(m1.runId, BORRADOR.C, { ranura: '3', transaccion: 'leg-vieja' });
  comprobar(ok1.ok && !vieja.r.ok && vieja.r.codigo === 'entregado', 'transacción vieja o distinta tras entregar: rechazada');

  await limpiarTodo();
  const a2 = await empezar(BORRADOR.A, 9303, '1');
  const m2 = await morirCon(a2, 1000);
  // Doble petición: la segunda llega mientras la primera está creando.
  let soltar;
  const parada = new Promise((ok) => { soltar = ok; });
  const T = Entrega.nuevaTransaccion();
  const destinoT = nuevoRunId();
  const primera = sucesor(m2.runId, BORRADOR.B, { ranura: '2', transaccion: T, runDestino: destinoT, alCrear: () => parada });
  await new Promise((rr) => setTimeout(rr, 20));
  const segunda = await Entrega.entregarLegado({ runOrigen: m2.runId, transaccion: T, runDestino: nuevoRunId(), ranura: '3', crear: () => { throw new Error('no'); }, guardar: () => ({ ok: true }) });
  comprobar(!segunda.ok && segunda.codigo === 'ocupado', 'doble petición a la vez: la segunda espera fuera (candado ocupado), no crea', JSON.stringify(segunda));
  soltar();
  const { r: r1 } = await primera;
  const tercera = await Entrega.entregarLegado({ runOrigen: m2.runId, transaccion: T, runDestino: destinoT, ranura: '3', crear: () => { throw new Error('no'); }, guardar: () => ({ ok: true }) });
  comprobar(r1.ok && tercera.ok && tercera.yaHecho && sucesoresDe(m2.runId).length === 1, 'al terminar la primera, repetir la misma petición devuelve lo hecho, sin otro sucesor', JSON.stringify(tercera));

  // Dos pestañas: la reserva de una está en disco y su candado tomado.
  await limpiarTodo();
  const a3 = await empezar(BORRADOR.A, 9303, '1');
  const m3 = await morirCon(a3, 1000);
  await Entrega.cambiarLegado(m3.runId, { estado: 'pendiente' }, { estado: 'reservado', transaccion: 'leg-pestana-1', reserva: { runDestino: 'run-p1', ranura: '7', cantidad: 350 } });
  candados.tomados.add(`arcanveil:legado:${m3.runId}`);
  const rec = await Entrega.recuperarLegados();
  const p2 = await sucesor(m3.runId, BORRADOR.C, { ranura: '3' });
  comprobar((await Entrega.estadoLegado(m3.runId)).estado === 'reservado' && rec[0]?.codigo === 'ocupado' && !p2.r.ok && p2.r.codigo === 'ocupado',
    'otra pestaña trabajando (candado tomado): ni se recupera su reserva ni se crea otro sucesor', JSON.stringify({ rec, r: p2.r }));
  candados.tomados.delete(`arcanveil:legado:${m3.runId}`);
  // La otra pestaña murió sin guardar: su reserva es huérfana y se devuelve.
  const rec2 = await Entrega.recuperarLegados();
  comprobar((await Entrega.estadoLegado(m3.runId)).estado === 'pendiente' && rec2[0]?.estado === 'pendiente', 'pestaña muerta sin sucesor guardado: su reserva vuelve a pendiente', JSON.stringify(rec2));

  // Sin Web Locks no se puede asegurar: se bloquea con aviso.
  Entrega.usarCandados({});
  const sin = await sucesor(m3.runId, BORRADOR.C, { ranura: '3' });
  Entrega.usarCandados(candados);
  comprobar(!sin.r.ok && sin.r.codigo === 'sin-exclusion' && /sin herencia/.test(sin.r.motivo) && (await Entrega.estadoLegado(m3.runId)).estado === 'pendiente', 'navegador sin Web Locks: bloqueado con aviso, la herencia intacta', JSON.stringify(sin.r));
});

console.log('\n── Fotos de la versión 1 y registro ilegible ──');
await caso(async () => {
  await limpiarTodo();
  const v1 = (run, xp, estado = 'pendiente', extra = {}) => ({ version: 1, runOrigen: run, origen: { nombre: `N-${run}`, clase: 'filo', nivel: 2 }, fraccion: 0.35,
    base: { xpAcumulada: xp, xpHeredadaIncluida: 0, puntosHabilidadDisponibles: 3, habilidades: {} }, modalidad: 'pendiente', estado, destinatario: null, creado: 5, ...extra });
  original.setItem(Registro.CLAVE_LEGADOS, JSON.stringify({
    'run-v1-ok': v1('run-v1-ok', 200),
    'run-v1-aplicado': v1('run-v1-aplicado', 500, 'aplicado', { destinatario: 'run-z', aplicado: { cantidad: 175 } }),
    'run-v1-roto': v1('run-v1-roto', null),
  }));
  original.setItem(Registro.CLAVE_MUERTOS, JSON.stringify({ 'run-v1-ok': { nombre: 'a' }, 'run-v1-aplicado': { nombre: 'b' }, 'run-v1-roto': { nombre: 'c' } }));
  const lista = Object.fromEntries((await Entrega.listarLegados()).map((v) => [v.runOrigen, v]));
  comprobar(lista['run-v1-ok'].estado === 'pendiente' && lista['run-v1-ok'].cantidad === 70, 'v1 pendiente con 200 XP: se lee como 70 (35 % hacia abajo)', JSON.stringify(lista['run-v1-ok']));
  comprobar(lista['run-v1-aplicado'].estado === 'aplicado', 'v1 ya aplicada: sigue aplicada (no vuelve a pendiente al leerla)');
  comprobar(lista['run-v1-roto'].estado === 'bloqueado' && /no es un número válido/.test(lista['run-v1-roto'].motivo), 'v1 sin experiencia válida: bloqueada con motivo; las demás siguen', lista['run-v1-roto'].motivo);
  const { r } = await sucesor('run-v1-ok', BORRADOR.B, { ranura: '2' });
  const f = (await Entrega.estadoLegado('run-v1-ok'));
  comprobar(r.ok && r.cantidad === 70 && f.estado === 'aplicado' && f.version === 1 && f.base.puntosHabilidadDisponibles === 3, 'la v1 se entrega una vez y conserva sus datos originales', JSON.stringify(f).slice(0, 300));
  const r2 = await sucesor('run-v1-roto', BORRADOR.B, { ranura: '3' });
  comprobar(!r2.r.ok && r2.r.codigo === 'bloqueado' && (await Entrega.estadoLegado('run-v1-roto')).base.xpAcumulada === null, 'la rota no se entrega ni se reescribe', JSON.stringify(r2.r));

  original.setItem(Registro.CLAVE_LEGADOS, '{esto no es json');
  const ilegible = Registro.registroIlegible();
  const a = await empezar(BORRADOR.A, 9303, '1');
  const muerte = await morirCon(a, 100);
  // Contrato #8: la autoridad es el registro coordinado (una clave por run):
  // el mapa local dañado se conserva byte a byte y no se escribe encima, se
  // avisa al morir, y la herencia NO se pierde por él (antes, #6/#7, se
  // renunciaba a guardarla para no pisar el mapa).
  const fotoIlegible = await Entrega.estadoLegado(muerte.runId);
  comprobar(ilegible && muerte.guardado.marca && muerte.guardado.legado && /dañado/.test(muerte.guardado.aviso ?? '') && fotoIlegible?.cantidad === 35 && original.getItem(Registro.CLAVE_LEGADOS) === '{esto no es json',
    'registro local ilegible: no se escribe encima y su contenido se conserva; se avisa al morir y la herencia queda en el registro coordinado', JSON.stringify({ guardado: muerte.guardado, cantidad: fotoIlegible?.cantidad ?? null }));
});

}

console.log(`\n${casos - fallos}/${casos} comprobaciones correctas`);
process.exitCode = fallos ? 1 : 0;
