/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCANVEIL · tools/auditar-recuperacion.mjs
 * ---------------------------------------------------------------------------
 * Encargo #7 del 8-oct-2026: recuperar una entrega de herencia a medias SIN
 * confundir «no puedo leer» con «no está».
 *
 * La revisión externa del #6 (f81efd9) reprodujo:
 *   · Caso A: reserva 1000→350 para el run B en la ranura 2, y la ranura 2
 *     con JSON roto. La recuperación la daba por ausente y devolvía la
 *     herencia a pendiente: se podía cobrar otra vez con el estado desconocido.
 *   · Caso B: la ranura 2 con run «wrong-run», 999 XP y la transacción buena.
 *     La recuperación la daba por entregada a wrong-run con 999.
 *
 * Aquí, contra el protocolo real (`EntregaLegado`) y el guardado real
 * (`SaveManager`), en el motor sin ventana:
 *   · lecturas imposibles (JSON roto, esquema inválido, getItem/key/length que
 *     fallan) → bloqueo con motivo, bytes intactos, nada liberado;
 *   · token, origen, destino, ranura y cantidad que no cuadran, uno a uno →
 *     bloqueo, sin destinatario inventado ni ficheros borrados;
 *   · dos sucesores con la misma transacción → conflicto, se conservan ambos;
 *   · ausencia comprobada → pendiente; compromiso coherente → aplicado una vez,
 *     también si el sucesor ya ganó XP (350 heredados + 20 ganados = 370);
 *   · entregada sigue entregada aunque se borre el sucesor;
 *   · reintento con la misma transacción y el mismo destino → el mismo
 *     personaje; con otro destino → rechazo;
 *   · deshacer no borra lo ajeno ni lo que cambió desde la escritura.
 *
 * FIXTURES: el muerto y su XP se crean por el canal normal; las reservas
 * «cortadas» y los ficheros dañados se escriben a mano (es lo que se prueba).
 *
 *   node tools/auditar-recuperacion.mjs
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

const Entrega = await import('../src/persistence/EntregaLegado.js');
const Registro = await import('../src/persistence/RegistroRuns.js');
const Coordinacion = await import('../src/persistence/Coordinacion.js');

const tomados = new Set();
Entrega.usarCandados({ async request(n, o, fn) { if (o?.ifAvailable && tomados.has(n)) return fn(null); while (tomados.has(n)) await new Promise((r) => setTimeout(r, 5)); tomados.add(n); try { return await fn({ name: n }); } finally { tomados.delete(n); } } });

const LS = globalThis.localStorage;
const orig = { getItem: LS.getItem, setItem: LS.setItem, key: LS.key, removeItem: LS.removeItem };
const restaurar = () => { LS.getItem = orig.getItem; LS.setItem = orig.setItem; LS.key = orig.key; LS.removeItem = orig.removeItem; delete LS.__longitudRota; };
const crudo = (k) => orig.getItem.call(LS, k);
const poner = (k, v) => orig.setItem.call(LS, k, v);
async function limpiar() {
  await Coordinacion.vaciar();
  restaurar();
  for (const k of Array.from({ length: LS.length }, (_, i) => orig.key.call(LS, i))) if (k?.startsWith('arcanveil:')) LS.removeItem(k);
}

const BORR = { nombre: 'Sive', raza: 'valdes', clase: 'rastreador', trasfondo: 'errante', genero: 'f' };
const BORR_B = { nombre: 'Brun', raza: 'valdes', clase: 'glifista', trasfondo: 'errante', genero: 'm' };

/** FIXTURE: muerto A con 1000 XP por el canal normal. */
async function muertoCon(xp = 1000, semilla = 9303) {
  const m = await crearMotor({ semilla });
  await m.empezar(BORR);
  m.store.dispatch('player/xp', { cantidad: xp, motivo: 'fixture' });
  await new Promise((r) => setTimeout(r, 0));
  return m.sistema('muerte').morir({ origen: 'combate' }).runId;
}

/** Guardado real de un sucesor (bytes que produce SaveManager), sin pasar por la entrega. */
async function guardadoDeSucesor({ runId, runOrigen, transaccion, xpHeredada = 350, xpTotal = xpHeredada }) {
  const m = await crearMotor({ semilla: 77 });
  await m.empezar(BORR_B);
  m.store.fijar('meta.runId', runId);
  m.store.dispatch('player/xp', { cantidad: xpHeredada, motivo: 'legado', legado: { runOrigen, transaccion, xpOrigen: 1000, nombreOrigen: 'Sive' } });
  await new Promise((r) => setTimeout(r, 0));
  if (xpTotal > xpHeredada) { m.store.dispatch('player/xp', { cantidad: xpTotal - xpHeredada, motivo: 'jugado' }); await new Promise((r) => setTimeout(r, 0)); }
  return JSON.stringify(m.sistema('saves')._construir('prueba'));
}

/** La reserva de un corte: A → run-B en la ranura 2, 350 XP, transacción T. */
async function reservar(runA, { T = 'leg-T', destino = 'run-B', ranura = '2', cantidad = 350 } = {}) {
  const r = await Entrega.cambiarLegado(runA, { estado: 'pendiente' }, { estado: 'reservado', transaccion: T, reserva: { runDestino: destino, ranura, cantidad, momento: Date.now() } });
  if (!r.ok) throw new Error(`no se pudo preparar la reserva: ${r.error}`);
  return { T, destino, ranura, cantidad };
}
const estadoDe = async (runA) => (await Entrega.estadoLegado(runA))?.estado;
const pendienteVisible = async (runA) => (await Entrega.legadosPendientes()).some((v) => v.runOrigen === runA);
const intento = (runA, extra = {}) => Entrega.entregarLegado({ runOrigen: runA, transaccion: Entrega.nuevaTransaccion(), runDestino: `run-otro-${Math.random().toString(36).slice(2, 7)}`, ranura: '6',
  crear: () => { throw new Error('NO DEBERÍA CREAR'); }, guardar: () => ({ ok: false, motivo: 'no' }), ...extra });

/** Lo común de los bloqueos: ni pendiente, ni aplicado a otro; bytes intactos; un intento nuevo no crea. */
async function bloqueado(runA, claveBytes, antes, etiqueta) {
  const rec = await Entrega.recuperarLegados();
  const f = (await Entrega.estadoLegado(runA));
  comprobar(f?.estado !== 'pendiente' && f?.estado !== 'aplicado' && !(await pendienteVisible(runA)), `${etiqueta}: no se libera ni se da por entregada (queda ${f?.estado}${f?.bloqueo ? ', bloqueada' : ''})`, JSON.stringify({ rec, f: f && { estado: f.estado, destinatario: f.destinatario, bloqueo: f.bloqueo } }));
  comprobar(Boolean(f?.bloqueo?.motivo) || rec.some((x) => x.runOrigen === runA && x.motivo), `${etiqueta}: el bloqueo dice por qué`, JSON.stringify(rec));
  comprobar(f?.transaccion === 'leg-T' && f?.reserva?.runDestino === 'run-B' && f?.reserva?.ranura === '2', `${etiqueta}: se conserva la reserva (token, destino, ranura) para volver a comprobar`, JSON.stringify(f?.reserva));
  for (const [k, v] of Object.entries(antes)) comprobar(crudo(k) === v, `${etiqueta}: ${k} intacta, byte a byte`);
  const otro = await intento(runA);
  comprobar(!otro.ok && !crudo('arcanveil:partida:6'), `${etiqueta}: un intento nuevo no cobra la herencia`, JSON.stringify(otro));
  void claveBytes;
}

/* ═══════════════════════════════════════════════════════════════════════ */

await caso('Caso A de la revisión: la ranura reservada tiene JSON roto', async () => {
  await limpiar();
  const A = await muertoCon();
  await reservar(A);
  poner('arcanveil:partida:2', '{"version":');
  await bloqueado(A, 'arcanveil:partida:2', { 'arcanveil:partida:2': '{"version":' }, 'JSON roto');
});

await caso('Caso B de la revisión: run, XP y cantidad que no son los de la reserva', async () => {
  await limpiar();
  const A = await muertoCon();
  await reservar(A);
  const malo = await guardadoDeSucesor({ runId: 'wrong-run', runOrigen: A, transaccion: 'leg-T', xpHeredada: 999 });
  poner('arcanveil:partida:2', malo);
  await bloqueado(A, 'arcanveil:partida:2', { 'arcanveil:partida:2': malo }, 'wrong-run con 999');
  comprobar((await Entrega.estadoLegado(A))?.destinatario !== 'wrong-run', 'no se apunta wrong-run como destinatario');
});

await caso('Lecturas que fallan: getItem, key y length', async () => {
  for (const [que, romper] of [
    ['getItem de la ranura reservada', () => { LS.getItem = function (k) { if (k === 'arcanveil:partida:2') throw new Error('acceso denegado'); return orig.getItem.call(this, k); }; }],
    ['key (enumerar)', () => { LS.key = function () { throw new Error('enumeración imposible'); }; }],
  ]) {
    await limpiar();
    const A = await muertoCon();
    await reservar(A);
    romper();
    const rec = await Entrega.recuperarLegados();
    const f = (await Entrega.estadoLegado(A));
    restaurar();
    comprobar(f?.estado === 'reservado' && !(await pendienteVisible(A)), `${que} falla: no es «ausente», la reserva se queda (${f?.estado})`, JSON.stringify({ rec, estado: f?.estado }));
  }
  await limpiar();
  const A = await muertoCon();
  await reservar(A);
  // Una longitud mentirosa: dice que hay más claves de las que key() devuelve.
  const desc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(LS), 'length') ?? Object.getOwnPropertyDescriptor(LS, 'length');
  Object.defineProperty(LS, 'length', { configurable: true, get: () => { throw new Error('longitud ilegible'); } });
  const rec = await Entrega.recuperarLegados();
  if (desc) Object.defineProperty(LS, 'length', desc); else delete LS.length;
  const f = (await Entrega.estadoLegado(A));
  comprobar(f?.estado === 'reservado' && !(await pendienteVisible(A)), `length falla: no es «ausente» (${f?.estado})`, JSON.stringify({ rec, estado: f?.estado }));
});

await caso('Esquema legible pero inválido (campos que faltan, versión ajena)', async () => {
  for (const [que, bytes] of [
    ['sin meta ni versión', JSON.stringify({ estado: { player: { xp: 350, legadoRecibido: { transaccion: 'leg-T', runOrigen: 'X', xp: 350 } } } })],
    ['versión de formato desconocida', JSON.stringify({ version: 999, estado: { meta: { runId: 'run-B' }, player: { xp: 350, xpHeredada: 350, legadoRecibido: { transaccion: 'leg-T', xp: 350 } } } })],
    ['un array', '[1,2,3]'],
  ]) {
    await limpiar();
    const A = await muertoCon();
    await reservar(A);
    const b = bytes.replace('"X"', JSON.stringify(A));
    poner('arcanveil:partida:2', b);
    await Entrega.recuperarLegados();
    const f = (await Entrega.estadoLegado(A));
    comprobar(f?.estado === 'reservado' && !(await pendienteVisible(A)) && crudo('arcanveil:partida:2') === b, `${que}: bloqueo, sin destinatario y bytes intactos (${f?.estado})`, JSON.stringify({ estado: f?.estado, dest: f?.destinatario }));
  }
});

await caso('Token, origen, destino, ranura y cantidad que no cuadran (uno a uno)', async () => {
  const variantes = [
    ['token', { transaccion: 'leg-OTRO' }],
    ['origen', { runOrigen: 'run-ajeno' }],
    ['destino', { runId: 'run-C' }],
    ['cantidad', { xpHeredada: 351 }],
  ];
  for (const [que, cambio] of variantes) {
    await limpiar();
    const A = await muertoCon();
    await reservar(A);
    const bytes = await guardadoDeSucesor({ runId: 'run-B', runOrigen: A, transaccion: 'leg-T', xpHeredada: 350, ...cambio });
    poner('arcanveil:partida:2', bytes);
    await Entrega.recuperarLegados();
    const f = (await Entrega.estadoLegado(A));
    comprobar(f?.estado === 'reservado' && !f?.destinatario && crudo('arcanveil:partida:2') === bytes && !(await pendienteVisible(A)), `${que} distinto: bloqueo, sin destinatario inventado, el fichero sigue`, JSON.stringify({ estado: f?.estado, dest: f?.destinatario }));
  }
  // Ranura: el sucesor correcto, pero en la 3 (la reserva dice 2).
  await limpiar();
  const A = await muertoCon();
  await reservar(A);
  const bytes = await guardadoDeSucesor({ runId: 'run-B', runOrigen: A, transaccion: 'leg-T' });
  poner('arcanveil:partida:3', bytes);
  await Entrega.recuperarLegados();
  const f = (await Entrega.estadoLegado(A));
  comprobar(f?.estado === 'reservado' && !f?.destinatario && crudo('arcanveil:partida:3') === bytes, `ranura distinta (3 en vez de 2): bloqueo, no se da por entregada ni se libera (${f?.estado})`, JSON.stringify({ estado: f?.estado, dest: f?.destinatario }));
});

await caso('Dos sucesores con la misma transacción', async () => {
  await limpiar();
  const A = await muertoCon();
  await reservar(A);
  const b2 = await guardadoDeSucesor({ runId: 'run-B', runOrigen: A, transaccion: 'leg-T' });
  const b5 = await guardadoDeSucesor({ runId: 'run-B', runOrigen: A, transaccion: 'leg-T' });
  poner('arcanveil:partida:2', b2);
  poner('arcanveil:partida:5', b5);
  await Entrega.recuperarLegados();
  const f = (await Entrega.estadoLegado(A));
  comprobar(f?.estado === 'reservado' && !f?.destinatario && crudo('arcanveil:partida:2') === b2 && crudo('arcanveil:partida:5') === b5, `conflicto: no se elige la primera, se conservan las dos (${f?.estado})`, JSON.stringify({ estado: f?.estado, dest: f?.destinatario, ranura: f?.ranura }));
});

await caso('Ausencia comprobada y compromiso coherente', async () => {
  await limpiar();
  const A = await muertoCon();
  await reservar(A);
  // Otra partida ajena e ILEGIBLE en otra ranura no impide comprobar la
  // reservada: el protocolo solo escribe el sucesor en la ranura reservada.
  poner('arcanveil:partida:7', '{roto');
  const rec = await Entrega.recuperarLegados();
  comprobar((await estadoDe(A)) === 'pendiente' && (await pendienteVisible(A)) && crudo('arcanveil:partida:7') === '{roto', 'ranura reservada vacía y enumeración completa: vuelve a pendiente (la ilegible ajena se respeta y no bloquea)', JSON.stringify(rec));

  await limpiar();
  const A2 = await muertoCon();
  await reservar(A2);
  const bytes = await guardadoDeSucesor({ runId: 'run-B', runOrigen: A2, transaccion: 'leg-T' });
  poner('arcanveil:partida:2', bytes);
  await Entrega.recuperarLegados();
  await Entrega.recuperarLegados();
  const f = (await Entrega.estadoLegado(A2));
  comprobar(f?.estado === 'aplicado' && f?.destinatario === 'run-B' && f?.ranura === '2' && f?.aplicado?.cantidad === 350 && crudo('arcanveil:partida:2') === bytes, 'sucesor coherente en su ranura: aplicado una vez, a run-B, 350', JSON.stringify(f && { e: f.estado, d: f.destinatario, r: f.ranura, a: f.aplicado }));

  await limpiar();
  const A3 = await muertoCon();
  await reservar(A3);
  const jugado = await guardadoDeSucesor({ runId: 'run-B', runOrigen: A3, transaccion: 'leg-T', xpHeredada: 350, xpTotal: 370 });
  poner('arcanveil:partida:2', jugado);
  await Entrega.recuperarLegados();
  const f3 = (await Entrega.estadoLegado(A3));
  const g = JSON.parse(crudo('arcanveil:partida:2'));
  comprobar(f3?.estado === 'aplicado' && f3?.aplicado?.cantidad === 350 && g.estado.player.xp === 370 && g.estado.player.xpHeredada === 350, 'el sucesor ya ganó 20 (370 en total): se reconoce, aplicado con 350 y sin sumarle nada', JSON.stringify({ e: f3?.estado, a: f3?.aplicado, xp: g.estado.player.xp }));
});

await caso('Entregada sigue entregada; reintentos con el mismo token', async () => {
  await limpiar();
  const A = await muertoCon();
  const motor = await crearMotor({ semilla: 5 });
  motor.store.fijar('settings.persistencia', true);
  motor.bus.emit('settings:change', { id: 'persistencia', valor: true });
  const T = Entrega.nuevaTransaccion();
  const op = { runOrigen: A, transaccion: T, runDestino: 'run-B', ranura: '2',
    crear: ({ cantidad, legado }) => Entrega.crearEnMotor(motor.store, { borrador: BORR_B, runDestino: 'run-B', cantidad, legado }),
    guardar: async ({ lease, op } = {}) => { const r = await motor.sistema('saves').guardar('2', { silencioso: true, lease, op }); return { ok: r.exito, motivo: r.motivo, texto: r.texto, intentado: r.intentado }; } };
  const r1 = await Entrega.entregarLegado(op);
  comprobar(r1.ok && (await estadoDe(A)) === 'aplicado', 'entrega normal', JSON.stringify(r1));
  const r2 = await Entrega.entregarLegado({ ...op, crear: () => { throw new Error('no'); } });
  comprobar(r2.ok && r2.yaHecho && r2.runDestino === 'run-B', 'mismo token y mismo destino: el mismo personaje, sin crear otro', JSON.stringify(r2));
  const r3 = await Entrega.entregarLegado({ ...op, runDestino: 'run-Z', crear: () => { throw new Error('no'); } });
  comprobar(!r3.ok && (await estadoDe(A)) === 'aplicado' && (await Entrega.estadoLegado(A)).destinatario === 'run-B', 'mismo token con OTRO destino: rechazado (el token no cambia de destino)', JSON.stringify(r3));
  orig.removeItem.call(LS, 'arcanveil:partida:2');
  await Entrega.recuperarLegados();
  const otra = await intento(A);
  comprobar((await estadoDe(A)) === 'aplicado' && !otra.ok, 'se borra el sucesor: la herencia sigue entregada, sin devolverla', JSON.stringify(otra));
});

await caso('Deshacer: no borra lo ajeno ni lo que cambió desde la escritura', async () => {
  await limpiar();
  const A = await muertoCon();
  const T = Entrega.nuevaTransaccion();
  // Una copia ajena con ese token en otra ranura (importada, editada…).
  const ajena = await guardadoDeSucesor({ runId: 'run-B', runOrigen: A, transaccion: T });
  poner('arcanveil:partida:5', ajena);
  const motor = await crearMotor({ semilla: 6 });
  motor.store.fijar('settings.persistencia', true);
  motor.bus.emit('settings:change', { id: 'persistencia', valor: true });
  const r = await Entrega.entregarLegado({ runOrigen: A, transaccion: T, runDestino: 'run-B', ranura: '2',
    crear: ({ cantidad, legado }) => Entrega.crearEnMotor(motor.store, { borrador: BORR_B, runDestino: 'run-B', cantidad, legado }),
    guardar: () => ({ ok: false, motivo: 'FIXTURE: el guardado falla' }) });
  comprobar(!r.ok && crudo('arcanveil:partida:5') === ajena, 'el guardado falla: la copia ajena con el mismo token NO se borra', JSON.stringify(r));
  comprobar(!(await pendienteVisible(A)) || (await estadoDe(A)) === 'pendiente', `la herencia queda en un estado honesto (${(await estadoDe(A))})`);

  await limpiar();
  const A2 = await muertoCon();
  const motor2 = await crearMotor({ semilla: 7 });
  motor2.store.fijar('settings.persistencia', true);
  motor2.bus.emit('settings:change', { id: 'persistencia', valor: true });
  // La relectura no coincide con lo escrito (otra cosa cambió la ranura).
  LS.getItem = function (k) { const v = orig.getItem.call(this, k); if (k === 'arcanveil:partida:2' && v) { const g = JSON.parse(v); g.estado.player.xp = 9999; return JSON.stringify(g); } return v; };
  // Desde el #8 se relee la copia autoritativa: también ahí.
  const realCoord = Coordinacion.motorActual();
  Coordinacion.usarCoordinacion({ ...realCoord, async leer(a, k) { const v = await realCoord.leer(a, k); if (a === Coordinacion.ALMACENES.PARTIDAS && k === '2' && v) { const g = JSON.parse(v.texto); g.estado.player.xp = 9999; return { ...v, texto: JSON.stringify(g) }; } return v; } });
  const r2 = await Entrega.entregarLegado({ runOrigen: A2, transaccion: Entrega.nuevaTransaccion(), runDestino: 'run-B', ranura: '2',
    crear: ({ cantidad, legado }) => Entrega.crearEnMotor(motor2.store, { borrador: BORR_B, runDestino: 'run-B', cantidad, legado }),
    guardar: async ({ lease, op } = {}) => { const x = await motor2.sistema('saves').guardar('2', { silencioso: true, lease, op }); return { ok: x.exito, motivo: x.motivo, texto: x.texto, intentado: x.intentado }; } });
  Coordinacion.usarCoordinacion(realCoord);
  restaurar();
  const quedan = crudo('arcanveil:partida:2');
  comprobar(!r2.ok && quedan !== null && (await estadoDe(A2)) === 'reservado' && !(await pendienteVisible(A2)), `relectura distinta: no se borra la ranura escrita ni se libera la herencia (dudoso → se conserva y se bloquea; queda ${(await estadoDe(A2))})`, JSON.stringify({ r2, hay: quedan !== null }));
  comprobar(!/no ha perdido nada|no se ha creado/.test(`${r2.motivo ?? ''} ${r2.nota ?? ''}`), 'y no promete «no se ha creado nada»', `${r2.motivo} ${r2.nota}`);
  await Entrega.recuperarLegados();
  comprobar((await estadoDe(A2)) === 'aplicado' && (await Entrega.estadoLegado(A2)).destinatario === 'run-B', 'al volver a comprobar con lecturas sanas: el sucesor estaba bien escrito → aplicado', (await estadoDe(A2)));
});

await caso('Fotos v1 y otras campañas', async () => {
  await limpiar();
  const A = await muertoCon();
  await reservar(A);
  poner('arcanveil:partida:2', '{"version":');
  // Una v1 pendiente de otro muerto sigue jugable aunque A esté bloqueada.
  const mapa = JSON.parse(crudo(Registro.CLAVE_LEGADOS));
  mapa['run-v1'] = { version: 1, runOrigen: 'run-v1', origen: { nombre: 'Ena' }, base: { xpAcumulada: 200, xpHeredadaIncluida: 0 }, estado: 'pendiente', modalidad: 'pendiente', fraccion: 0.35 };
  poner(Registro.CLAVE_LEGADOS, JSON.stringify(mapa));
  const muertos = JSON.parse(crudo(Registro.CLAVE_MUERTOS)); muertos['run-v1'] = { nombre: 'Ena' }; poner(Registro.CLAVE_MUERTOS, JSON.stringify(muertos));
  await Entrega.recuperarLegados();
  const v1 = (await Entrega.legadosPendientes()).find((v) => v.runOrigen === 'run-v1');
  comprobar(v1?.cantidad === 70 && (await estadoDe(A)) === 'reservado', 'una herencia bloqueada no bloquea las demás (v1 pendiente: 70)', JSON.stringify(v1));
});

restaurar();
console.log(`\n${casos - fallos}/${casos} comprobaciones correctas`);
process.exitCode = fallos ? 1 : 0;
