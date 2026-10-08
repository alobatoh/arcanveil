/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCANVEIL · tools/auditar-narrador.mjs
 * ---------------------------------------------------------------------------
 * El narrador sin modelo cuenta lo que hay, no baraja frases.
 *
 * Cada comprobación sale de una partida real en la que el narrador interno
 * fallaba: «miro el río» recibía «Ves lo principal; los detalles, no tanto»,
 * el herrero contestaba «El paso del norte… mira» y no acababa la frase, y
 * al preguntarle otra vez reciclaba un rumor sobre hierro. Todas fallaban
 * con el narrador anterior.
 *
 *   node tools/auditar-narrador.mjs
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { crearMotor } from './motor-sin-ventana.mjs';
import { queSabe, responder, resolverTema } from '../src/ai/narrador/Conocimiento.js';
import { buscarRasgo, RASGOS } from '../src/data/rasgos.data.js';
import { LUGARES } from '../src/data/locations.data.js';

let fallos = 0;
function comprobar(bien, texto, detalle = '') {
  if (bien) console.log(`OK   ${texto}`);
  else { fallos += 1; console.log(`MAL  ${texto}`); if (detalle) console.log(`     ${String(detalle).slice(0, 700)}`); }
}

const FICHA = { nombre: 'Iselda', raza: 'valdes', clase: 'rastreador', trasfondo: 'errante', genero: 'f', retrato: 'mujer de capa gris', lore: 'Mi hermano desapareció cruzando el paso del norte.' };
const m = await crearMotor({ semilla: 7412 });
const cuerpo = (t) => t.split('\n').filter((l) => !l.startsWith('»')).join('\n');

/** La próxima tirada sale como se pide. */
function fijarDado(exito) {
  const r = m.sistema('rules');
  const o = r.resolver;
  r.resolver = (t) => { r.resolver = o; return { ...o.call(r, t), exito, grado: exito ? 'exitoClaro' : 'fracaso' }; };
}

async function partida() {
  m.store.reiniciar();
  await m.empezar(FICHA);
  const s = m.sistema('situations');
  for (const x of s.aqui()) m.store.dispatch('situaciones/guardar', { situacion: { ...x, estado: 'desenlace' } });
  return s;
}

/* ── 1. Los datos: cada lugar tiene qué mirar ────────────────────────────── */

{
  const sinRasgos = Object.values(LUGARES).filter((l) => l?.refId && l.descripcion && !RASGOS[l.refId]);
  comprobar(!sinRasgos.length, 'todos los lugares tienen rasgos propios', sinRasgos.map((l) => l.refId).join(', '));
  comprobar(buscarRasgo('miro el río', 'vado_yunque')?.clave === 'rio', 'en el Vado, «el río» es el río');
  comprobar(buscarRasgo('me acerco al pozo de la plaza', 'vado_yunque')?.clave === 'pozo', 'y «el pozo de la plaza» es el pozo, no la plaza');
}

/* ── 2. Mirar cuenta lo que hay ──────────────────────────────────────────── */

{
  await partida();
  fijarDado(false);
  const t = await m.jugar('miro el río');
  comprobar(/río/.test(cuerpo(t)) && /corriente|orilla|lecho|vado/i.test(cuerpo(t)), 'mirar el río describe el río', t);
  comprobar(!/Ves lo principal|los detalles, no tanto|Te haces una idea|Nada fuera de lo corriente/.test(t), 'sin resultado genérico de éxito o fracaso', t);

  fijarDado(true);
  const t2 = await m.jugar('examino la orilla del río con calma');
  comprobar(/huellas/.test(t2), 'mirando bien aparece lo escondido', t2);
  const hechos = m.sistema('turns').memoria.hechos.map((h) => h.texto);
  comprobar(hechos.filter((h) => /huellas frescas/.test(h)).length === 1, 'y se apunta una sola vez como descubierto', hechos.join(' | '));
  fijarDado(true);
  const t3 = await m.jugar('miro otra vez el río');
  comprobar(!/huellas frescas/.test(t3), 'lo ya descubierto no se descubre dos veces', t3);

  await m.guardarYCargar();
  const recordado = m.sistema('turns').memoria.hechos.some((h) => /huellas frescas/.test(h.texto));
  comprobar(recordado, 'lo descubierto sobrevive a guardar y cargar');

  const t4 = await m.jugar('miro alrededor');
  const t5 = await m.jugar('miro alrededor');
  comprobar(cuerpo(t4).split('\n')[1] !== cuerpo(t5).split('\n')[1], '«miro alrededor» dos veces no describe lo mismo', `${t4}\n---\n${t5}`);
}

{
  const s = await partida();
  s.abrir({ refId: 'colgante_en_el_pozo' });
  const t = await m.jugar('me acerco al pozo');
  comprobar(/pozo|brocal|colgante|cuerda/i.test(cuerpo(t)) && !/adoquines/i.test(t), 'acercarse al pozo trata del pozo, no de adoquines', t);
}

/* ── 3. Preguntar recibe respuesta ───────────────────────────────────────── */

{
  const npc = { refId: 'n', nombre: 'Vervek', rol: 'herrero', actitud: 0, memoria: [], conocimiento: { rumores: [], secretos: [], compartidos: [] } };
  comprobar(resolverTema('le pregunto a Vervek por el paso del norte', { lugar: 'vado_yunque' }).ref === 'paso_yunque', '«el paso del norte» es el Paso del Yunque');
  comprobar(resolverTema('le pregunto por el incendio de la forja', { lugar: 'vado_yunque' }).tipo === 'otro', '«el incendio de la forja» no es Forja Alta por compartir una palabra');

  const saber = queSabe({ npc, texto: 'le pregunto por el paso del norte', lugar: 'vado_yunque' });
  const r = responder(saber, npc);
  const dicho = r.lineas.join(' ');
  comprobar(/Paso del Yunque/.test(dicho) && /Camino del Norte|jornada/.test(dicho), 'el herrero cuenta por dónde se va y cuánto se tarda', dicho);
  comprobar(!/mira»|y no termina la frase|hierro/.test(dicho), 'sin frases a medias ni rumores de otra cosa', dicho);

  const otra = { ...npc, conocimiento: { ...npc.conocimiento, compartidos: r.contado } };
  const dicho2 = responder(queSabe({ npc: otra, texto: 'le pregunto otra vez por el paso', lugar: 'vado_yunque' }), otra).lineas.join(' ');
  comprobar(dicho2 !== dicho && !/hierro/.test(dicho2) && /paso|clanes|refugio|nieve|primavera|montaña/i.test(dicho2), 'preguntar otra vez da lo siguiente que sabe, no un rumor reciclado', dicho2);

  const nada = responder(queSabe({ npc, texto: 'le pregunto por la luna', lugar: 'vado_yunque' }), npc).lineas.join(' ');
  comprobar(/no sé/.test(nada) && /[Pp]regunta/.test(nada), 'si no lo sabe, lo dice y dice a quién preguntar', nada);

  const suyo = responder(queSabe({ npc, texto: 'le pregunto por mi hermano', lugar: 'vado_yunque', lore: FICHA.lore }), npc).lineas.join(' ');
  comprobar(/no sé nada/.test(suyo) && !/tu hermano (?:pasó|cruzó|estuvo)/.test(suyo), 'del pasado del personaje no se inventa nada', suyo);

  const secreto = { ...npc, conocimiento: { ...npc.conocimiento, secretos: ['La mina cerrada esconde algo que el clan tapió'] } };
  const esquiva = responder(queSabe({ npc: secreto, texto: 'le pregunto por la mina', lugar: 'vado_yunque' }), secreto).lineas.join(' ');
  comprobar(/tensa|duda/.test(esquiva) && !/tapió/.test(esquiva), 'solo esquiva con motivo, y el motivo se ve sin soltar el secreto', esquiva);
}

{
  await partida();
  const npcs = m.sistema('npcs');
  const vervek = npcs.introducir({ nombre: 'Vervek', rol: 'herrero', genero: 'm' });
  const t1 = await m.jugar('le pregunto a Vervek por el paso del norte');
  comprobar(/Paso del Yunque|Camino del Norte|jornada/.test(cuerpo(t1)), 'en partida, la respuesta trata del paso', t1);
  const compartidos = m.ver(`npcs.conocidos.porId.${vervek.refId}.conocimiento.compartidos`, []);
  comprobar(compartidos.length > 0, 'lo contado queda apuntado como compartido', JSON.stringify(compartidos));
  const creencias = m.sistema('turns').memoria.hechos.map((h) => h.texto).filter((h) => /^Según Vervek:/.test(h));
  comprobar(creencias.length > 0, 'y el mundo lo recuerda como dicho por él, no como hecho', creencias.join(' | '));
  await m.guardarYCargar();
  const t2 = await m.jugar('le pregunto a Vervek por el paso del norte');
  comprobar(cuerpo(t2) !== cuerpo(t1), 'tras guardar y cargar no repite lo mismo como nuevo', `${t1}\n---\n${t2}`);
}

/* ── 4. Sin coletillas ni frases hechas ─────────────────────────────────── */

{
  await partida();
  let todo = '';
  for (const t of ['miro alrededor', 'espero', 'me siento a descansar', 'miro el puente', 'escucho lo que se habla', 'espero', 'miro alrededor', 'corro hacia el puente', 'bebo agua del río', 'espero']) todo += `${await m.jugar(t)}\n`;
  const COLETILLAS = /La decisión es tuya|Algo cruje a tu espalda|no te quita ojo|te mira, esperando|Te mueves con intención|nada permanece del todo indiferente|Un gato salta|Ves lo principal/;
  comprobar(!COLETILLAS.test(todo), 'diez turnos sin coletillas', todo.match(COLETILLAS)?.[0]);
  comprobar(!/Escuchas lo que sabes/.test(todo), '«lo que se habla» no se convierte en «lo que sabes habla»', todo);
}

/* ── 5. El mundo cambia por causas ───────────────────────────────────────── */

{
  const s = await partida();
  const sit = s.abrir({ refId: 'encapuchado_vigila' });
  let texto = '';
  for (let i = 0; i < 4; i += 1) texto += `${await m.jugar('miro el río')}\n`;
  comprobar(/La figura del tejado se ha movido/.test(texto), 'antes del desenlace, el reloj se ve correr', texto);
  // Hasta que pasa y, después, hasta que llega la guardia.
  for (let i = 0; i < 10 && !s.todas().some((x) => x.refId === 'guardia_pregunta'); i += 1) texto += `${await m.jugar('miro el río')}\n`;
  comprobar(s.todas().find((x) => x.id === sit.id).estado === 'desenlace', 'y sin el jugador, pasa');
  comprobar(s.todas().some((x) => x.refId === 'guardia_pregunta'), 'lo que pasó trae otra cosa después: la guardia pregunta', texto);
  const guardia = s.todas().find((x) => x.refId === 'guardia_pregunta');
  comprobar(guardia && guardia.actores.mercader.refId === sit.actores.mercader.refId, 'con el mismo mercader, no otro');
  const t = await m.jugar('le cuento que vi a uno con capucha en el tejado');
  comprobar(/tablilla|cuadra/.test(t), 'y lo que el jugador vio le sirve a la guardia', t);
}

{
  const s = await partida();
  s.abrir({ refId: 'peaje_abusivo' });
  fijarDado(false);
  const t1 = await m.jugar('le digo al cobrador que cobre lo que pone la tabla');
  comprobar(!m.ver('combat.activo') && /tabla/i.test(t1), 'una negociación que sale mal tensa, pero no es pelea todavía', t1);
  fijarDado(false);
  const t2 = await m.jugar('le explico que es un abuso');
  const combate = await (async () => { for (let i = 0; i < 40 && !m.ver('combat.activo'); i += 1) await new Promise((r) => setTimeout(r, 25)); return m.ver('combat.activo'); })();
  comprobar(combate && /Se acabó la conversación/.test(t2), 'al segundo fallo, se acaba la paciencia y hay pelea', t2);
  const orden = m.entradas().map((e) => e.texto);
  const iNarr = orden.findIndex((x) => /Se acabó la conversación/.test(x));
  const iPelea = orden.findIndex((x) => /Todo se decide|guardias corruptos/.test(x));
  comprobar(iNarr >= 0 && iPelea > iNarr, 'y la pelea empieza después de contar por qué', orden.slice(-4).join(' | '));
}

{
  const s = await partida();
  s.abrir({ refId: 'peaje_abusivo' });
  m.store.dispatch('inventory/oro', { delta: 10, motivo: 'prueba' });
  const antes = m.ver('player.oro');
  const t = await m.jugar('pago yo lo del viejo');
  comprobar(m.ver('player.oro') === antes - 3 && /monedas/.test(t), 'pagar por otro cuesta oro de verdad y lo resuelve', t);
}

console.log(`\n${fallos ? `${fallos} fallos.` : 'Todo correcto.'}`);
process.exit(fallos ? 1 : 0);
