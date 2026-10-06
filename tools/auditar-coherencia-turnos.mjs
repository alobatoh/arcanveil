/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCANVEIL · tools/auditar-coherencia-turnos.mjs
 * ---------------------------------------------------------------------------
 * Lo que se narra tiene que haber pasado en el estado (encargo del 6-oct).
 *
 *   1. Esperas: «espero dos horas» decía «Esperas dos horas» y el reloj
 *      avanzaba 10 minutos. Ahora pasa el tiempo de verdad, pulso a pulso, y
 *      se corta si pasa algo; lo que no se puede medir se aclara.
 *   2. Arma inexistente: «ataco a Korsa con el hacha» sin hacha tiraba un
 *      ataque y gastaba turno. Ahora se aclara sin hacer nada, fuera y
 *      dentro del combate.
 *   3. Orden compuesta: «desenvaino el cuchillo y ataco a Korsa» abría
 *      combate contra un guardia corrupto sacado de la tabla. Ahora el blanco
 *      nombrado no se cambia.
 *   4. Desgaste: Vitals calculaba hambre, sed y fatiga y el parche no se
 *      aplicaba nunca.
 *
 * Cada caso compara el estado antes y después (reloj, turno, vida, maná,
 * hambre/sed/fatiga, inventario, reputación, presentes, combate, peticiones
 * de combate, tiradas) y el texto visible entero.
 *
 * FIXTURE (marcado así en la salida): para medir duraciones íntegras se
 * vacían `world.situaciones` y se apagan las ofertas espontáneas de
 * encargos; para casos de peligro se marcan PNJ como hostiles. No es la
 * escena real: la escena real se prueba aparte, con sus interrupciones.
 *
 *   node tools/auditar-coherencia-turnos.mjs [--salida carpeta]
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { crearMotor } from './motor-sin-ventana.mjs';
import { decirDuracion, decirReloj } from '../src/engine/Espera.js';
import { VITALES } from '../src/config/balance.config.js';

const args = process.argv.slice(2);
const salida = args.includes('--salida') ? args[args.indexOf('--salida') + 1] : null;

let fallos = 0;
let casos = 0;
const transcripcion = [];
function comprobar(bien, texto, detalle = '') {
  casos += 1;
  if (bien) console.log(`OK   ${texto}`);
  else { fallos += 1; console.log(`MAL  ${texto}`); if (detalle) console.log(`     ${String(detalle).replace(/\n/g, ' | ').slice(0, 600)}`); }
}

const visible = (t) => String(t).split('\n').filter((l) => l && !l.startsWith('»')).join('\n');
const S = VITALES.supervivencia;
const cerca = (a, b, tol = 0.03) => Math.abs(a - b) <= tol;

/** Una partida nueva con todo lo necesario para medir. */
async function partida(semilla, { clase = 'rastreador', raza = 'valdes', fixture = false } = {}) {
  const m = await crearMotor({ semilla });
  await m.empezar({ nombre: 'Sive', raza, clase, trasfondo: 'errante', genero: 'f' });
  if (fixture) {
    m.store.fijar('world.situaciones', { porId: {}, orden: [] });
    const q = m.sistema('quests');
    if (q) q._ultimaOferta = Number.MAX_SAFE_INTEGER;
  }
  const registro = { combate: [], tiradas: 0, hablado: [], umbrales: 0, caidas: 0 };
  m.bus.on('combat:request', (d) => registro.combate.push(d));
  m.bus.on('rules:roll', () => { registro.tiradas += 1; });
  m.bus.on('npc:talked', (d) => registro.hablado.push(d.refId));
  m.bus.on('player:resource:threshold', () => { registro.umbrales += 1; });
  m.bus.on('player:down', () => { registro.caidas += 1; });

  const foto = () => {
    const p = m.ver('player') ?? {};
    const t = m.ver('world.tiempo') ?? {};
    return {
      dia: t.dia, hora: t.hora, minuto: t.minuto, franja: t.franja, estacion: t.estacion,
      reloj: (t.dia * 24 + t.hora) * 60 + t.minuto,
      turno: m.ver('meta.turno'),
      vida: p.vida?.actual, mana: p.mana?.actual, hambre: p.hambre, sed: p.sed, fatiga: p.fatiga,
      inventario: JSON.stringify(m.ver('inventory.objetos.porId', {})),
      reputacion: JSON.stringify(m.ver('factions.reputacion', {})),
      actitudes: JSON.stringify(Object.values(m.ver('npcs.conocidos.porId', {}) ?? {}).map((n) => [n.refId, n.actitud])),
      presentes: JSON.stringify(m.ver('npcs.presentes', [])),
      ubicacion: m.ver('world.ubicacion'),
      combate: Boolean(m.ver('combat.activo', false)),
      ronda: m.ver('combat.ronda', null),
      entradas: (m.ver('narrative.entradas', []) ?? []).length,
    };
  };

  async function turno(frase) {
    const antes = foto();
    const c0 = registro.combate.length;
    const r0 = registro.tiradas;
    const h0 = registro.hablado.length;
    const texto = visible(await m.jugar(frase));
    transcripcion.push(`[${semilla} ${clase}${fixture ? ' FIXTURE' : ''}] ${decirReloj(antes)} > ${frase}\n${texto}\n`);
    return { texto, antes, despues: foto(), combate: registro.combate.slice(c0), tiradas: registro.tiradas - r0, hablo: registro.hablado.slice(h0) };
  }

  const fijarHora = (hora, minuto = 0, extra = {}) => m.store.dispatch('clock/fijar', { hora, minuto, ...extra });
  const nombre = (id) => m.ver(`npcs.conocidos.porId.${id}.nombre`);
  const presente = (n) => (m.ver('npcs.presentes', []) ?? []).find((id) => nombre(id) === n);
  return { m, turno, foto, fijarHora, registro, presente };
}

/** Nada ha cambiado: reloj, turno, vida, maná, recursos, inventario, reputación, combate. */
const intacto = (r) => r.despues.reloj === r.antes.reloj && r.despues.turno === r.antes.turno
  && r.despues.vida === r.antes.vida && r.despues.mana === r.antes.mana
  && r.despues.hambre === r.antes.hambre && r.despues.sed === r.antes.sed && r.despues.fatiga === r.antes.fatiga
  && r.despues.inventario === r.antes.inventario && r.despues.reputacion === r.antes.reputacion
  && r.despues.actitudes === r.antes.actitudes
  && r.despues.combate === r.antes.combate && r.despues.ronda === r.antes.ronda
  && !r.combate.length && r.tiradas === 0;

const minutos = (r) => r.despues.reloj - r.antes.reloj;

/* ═══════════════════════════════════════════════════════════════════════════
   1 · ESPERAS
   ═══════════════════════════════════════════════════════════════════════════ */

for (const semilla of [9303, 9505]) {
  console.log(`\n── Esperas en la escena real (semilla ${semilla}) ──`);
  for (const frase of ['espero dos horas', 'espero hasta que anochezca', 'me quedo quieta hasta que anochece']) {
    const p = await partida(semilla);
    const r = await p.turno(frase);
    const paso = minutos(r);
    const pulsos = r.despues.turno - r.antes.turno;
    const reloj = decirReloj(r.despues);
    const corta = /La espera se interrumpe: (.+?) Día/.exec(r.texto)?.[1];
    comprobar(paso > 10 && r.texto.startsWith(`Esperas ${decirDuracion(paso)}`) || r.texto.startsWith('Esperas hasta'),
      `«${frase}»: el texto dice lo que ha pasado de verdad (${decirDuracion(paso)}), no un turno de 10 minutos`, r.texto);
    comprobar(r.texto.includes(reloj), '  y la hora que dice es la guardada', `${reloj} · ${r.texto}`);
    comprobar(pulsos === Math.ceil(paso / 10), `  un pulso del motor por cada 10 minutos (${pulsos} pulsos, ${paso} min)`);
    if (corta) {
      comprobar(!/dos horas|anochece|anochezca/.test(r.texto.split('La espera se interrumpe')[0]) && corta.length > 10,
        `  interrumpida a los ${paso} min con su causa, sin afirmar el intervalo pedido`, r.texto);
      const sig = await p.turno('miro alrededor');
      comprobar(!sig.texto.includes(corta.slice(0, 40)), '  la causa no se vuelve a narrar en el turno siguiente', sig.texto);
      p.m.guardarYCargar();
      const ultima = (p.m.ver('narrative.entradas', []) ?? []).filter((e) => e.voz === 'dm').map((e) => e.texto).find((t) => t.includes('La espera se interrumpe'));
      comprobar(Boolean(ultima), '  y tras guardar y cargar, la entrada de la espera interrumpida sigue en la crónica');
    } else {
      comprobar(r.despues.franja === 'noche' || paso === 120, '  sin interrupción llega a lo pedido', r.texto);
    }
  }
}

for (const semilla of [9303, 9505]) {
  console.log(`\n── Esperas íntegras, FIXTURE sin situaciones ni ofertas (semilla ${semilla}) ──`);
  const casosReloj = [
    [7, 0, 'espero dos horas', 1, 9, 0, 'manana', 12],
    [7, 0, 'espero 2 horas', 1, 9, 0, 'manana', 12],
    [7, 0, 'espero 30 minutos', 1, 7, 30, 'manana', 3],
    [7, 0, 'espero media hora', 1, 7, 30, 'manana', 3],
    [23, 50, 'espero 30 minutos', 2, 0, 20, 'madrugada', 3],
    [23, 0, 'espero hasta el amanecer', 2, 5, 0, 'alba', 36],
    [20, 50, 'espero hasta que anochezca', 1, 21, 0, 'noche', 1],
    [7, 0, 'espero 25 minutos', 1, 7, 25, 'manana', 3],
  ];
  for (const [h, mi, frase, dia, hh, mm, franja, pulsos] of casosReloj) {
    const p = await partida(semilla, { fixture: true });
    p.fijarHora(h, mi);
    const r = await p.turno(frase);
    comprobar(r.despues.dia === dia && r.despues.hora === hh && r.despues.minuto === mm && r.despues.franja === franja && r.despues.turno - r.antes.turno === pulsos,
      `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')} «${frase}» → día ${dia} ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')} (${franja}), ${pulsos} pulsos`,
      `día ${r.despues.dia} ${r.despues.hora}:${r.despues.minuto} ${r.despues.franja}, ${r.despues.turno - r.antes.turno} pulsos · ${r.texto}`);
    comprobar(r.texto.includes(decirReloj(r.despues)) && !/interrumpe/.test(r.texto), '  el texto lleva la hora guardada y no inventa interrupciones', r.texto);
  }

  const p = await partida(semilla, { fixture: true });
  let r = await p.turno('espero');
  comprobar(minutos(r) === 10 && r.despues.turno - r.antes.turno === 1, '«espero» sin duración: un pulso normal de 10 minutos', r.texto);

  p.fijarHora(22, 0);
  r = await p.turno('espero hasta que anochezca');
  comprobar(intacto(r) && /^Ya es de noche/.test(r.texto) && /No ha pasado el tiempo/.test(r.texto), '22:00 «hasta que anochezca»: ya es de noche, se dice sin mover el reloj', r.texto);
}

console.log('\n── Estaciones: la frontera es la del reloj, y la deuda se dice ──');
for (const estacion of ['invierno', 'estio']) {
  const p = await partida(9303, { fixture: true });
  p.fijarHora(20, 50, { estacion });
  const r = await p.turno('espero hasta que anochezca');
  const ts = p.m.sistema('time') ?? p.m.sistema('tiempo');
  comprobar(r.despues.hora === 21 && r.despues.minuto === 0 && r.despues.franja === 'noche' && r.despues.estacion === estacion && /de noche/.test(r.texto),
    `${estacion}: «hasta que anochezca» acaba a las 21:00 con la franja «noche» guardada y dicha`, r.texto);
  const factor = ts?.efectosEstacion?.()?.horasLuz ?? 1;
  const suya = ts?.estacionActual?.()?.clave;
  console.log(`INFO deuda pendiente: el reloj guarda estación «${estacion}» y pone la noche a las 21:00; TimeSystem calcula la suya por diasTotales (estaciones de 90 días: «${suya}») y su anochecer, round(19 × ${factor}) = ${Math.round(19 * factor)}:00. Tres reglas que no coinciden (28 frente a 90 días, «estio» frente a «verano», 21:00 frente a 19×factor). No se ha reescrito.`);
}

console.log('\n── Lo que no es una espera pedida no ejecuta intervalos ──');
{
  const casosNo = [
    ['no espero nada', 'negación'],
    ['Le digo a Korsa: «espero dos horas»', 'cita'],
    ['si suena la campana, voy; mientras espero', 'condición'],
  ];
  for (const [frase, que] of casosNo) {
    const p = await partida(9303, { fixture: true });
    const ubic = p.m.ver('world.ubicacion');
    const r = await p.turno(frase);
    comprobar(minutos(r) <= 10 && p.m.ver('world.ubicacion') === ubic, `${que}: «${frase}» no pasa más de un turno ni mueve al personaje (${minutos(r)} min)`, r.texto);
  }
  const p = await partida(9303, { fixture: true });
  const r = await p.turno('compro pan y espero dos horas');
  comprobar(intacto(r) && /No ha pasado el tiempo/.test(r.texto), 'orden compuesta con espera larga: se aclara sin pasar tiempo ni comprar', r.texto);
}

console.log('\n── Duraciones inválidas o sin medida: todo intacto ──');
for (const frase of ['espero -2 horas', 'espero 0 minutos', 'espero 99999 horas', 'espero un rato', 'espero hasta las 25', 'espero hasta que se vaya el guardia', 'espero infinitas horas', 'espero hasta mañana']) {
  const p = await partida(9303, { fixture: true });
  const r = await p.turno(frase);
  comprobar(intacto(r) && /No ha pasado el tiempo/.test(r.texto), `«${frase}»: aclara; reloj, turno, vida, inventario y reputación intactos`, r.texto);
}

console.log('\n── Peligro y combate: esperar no salta nada ──');
{
  const p = await partida(9303, { fixture: true });
  const korsa = p.presente('Korsa');
  p.m.store.fijar(`npcs.conocidos.porId.${korsa}.hostil`, true);
  let r = await p.turno('espero dos horas');
  comprobar(intacto(r) && /Korsa/.test(r.texto) && /antes de esperar/.test(r.texto), 'FIXTURE hostil presente: pide decisión antes de avanzar horas', r.texto);

  const q = await partida(9303);
  await q.turno('ataco a Xivio');
  const c = q.m.sistema('combat');
  for (let i = 0; i < 300 && !c.esperandoJugador; i++) await new Promise((res) => setTimeout(res, 10));
  comprobar(c.esperandoJugador, 'combate abierto contra la guardia y esperando al jugador');
  r = await q.turno('espero dos horas');
  comprobar(intacto(r) && c.esperandoJugador && /combate/.test(r.texto), 'en combate, «espero dos horas» por la ruta del turno: aclara, misma ronda', r.texto);
  const antes = q.foto();
  const j = await c.jugadaLibre('espero dos horas');
  const despues = q.foto();
  comprobar(j?.tipo === 'aclaracion' && antes.ronda === despues.ronda && antes.reloj === despues.reloj && antes.vida === despues.vida && c.esperandoJugador,
    'en combate, por la jugada libre: aclara, ronda y reloj iguales, el turno sigue siendo suyo', JSON.stringify(j));
}

console.log('\n── Sucesos durante la espera (FIXTURE con aviso inyectado) ──');
{
  const p = await partida(9303, { fixture: true });
  let pulsos = 0;
  const baja = p.m.bus.on('clock:turn:end', () => { pulsos += 1; if (pulsos === 2) p.m.bus.emit('quests:failed', { titulo: 'Encargo de prueba' }); });
  const r = await p.turno('espero dos horas');
  baja();
  comprobar(minutos(r) === 20 && /La espera se interrumpe: has fallado «Encargo de prueba»/.test(r.texto) && r.texto.startsWith('Esperas 20 minutos'),
    'un plazo que vence a mitad: se corta a los 20 minutos con esa causa', r.texto);
}

console.log('\n── Esperar no es descansar ──');
{
  const p = await partida(9303, { clase: 'vinculado', fixture: true });
  const max = p.m.ver('player.vida.max');
  p.m.store.fijar('player.vida.actual', max - 8);
  const manaMax = p.m.ver('player.mana.max') ?? 0;
  if (manaMax) p.m.store.fijar('player.mana.actual', Math.max(0, manaMax - 3));
  const raciones = () => Object.values(p.m.ver('inventory.objetos.porId', {})).filter((o) => o.categoria === 'consumible').map((o) => `${o.refId}:${o.cantidad}`).join(',');
  const r0 = raciones();
  const r = await p.turno('espero dos horas');
  comprobar(r.despues.vida === r.antes.vida && r.despues.mana === r.antes.mana, `2 h de espera: ni vida (${r.antes.vida}) ni maná (${r.antes.mana}) suben`, `${r.despues.vida} · ${r.despues.mana}`);
  comprobar(raciones() === r0, '  provisiones intactas', `${r0} → ${raciones()}`);
  comprobar(cerca(r.antes.hambre - r.despues.hambre, 12 * S.hambrePorTurno) && cerca(r.antes.fatiga - r.despues.fatiga, 12 * S.fatigaPorTurno),
    `  desgaste de 12 pulsos: hambre −${(12 * S.hambrePorTurno).toFixed(2)}, fatiga −${(12 * S.fatigaPorTurno).toFixed(2)}`,
    `hambre ${r.antes.hambre}→${r.despues.hambre}, fatiga ${r.antes.fatiga}→${r.despues.fatiga}, sed ${r.antes.sed}→${r.despues.sed}`);
  comprobar(r.despues.sed < r.antes.sed, '  y la sed baja');

  const q = await partida(9303, { fixture: true });
  const s = await q.turno('espero 25 minutos');
  comprobar(cerca(s.antes.hambre - s.despues.hambre, 2.5 * S.hambrePorTurno), `pulso parcial: 25 minutos desgastan 2,5 turnos de hambre (−${(2.5 * S.hambrePorTurno).toFixed(3)}), no 3`,
    `${s.antes.hambre}→${s.despues.hambre}`);
}

console.log('\n── Guardar y cargar tras medianoche ──');
{
  const p = await partida(9505, { fixture: true });
  p.fijarHora(23, 50);
  await p.turno('espero 30 minutos');
  p.m.guardarYCargar();
  const t = p.m.ver('world.tiempo');
  const ultima = (p.m.ver('narrative.entradas', []) ?? []).filter((e) => e.voz === 'dm').at(-1)?.texto ?? '';
  comprobar(t.dia === 2 && t.hora === 0 && t.minuto === 20 && t.franja === 'madrugada' && ultima.includes('Día 2, 00:20'),
    'día 2, 00:20, madrugada tras cargar, y la última entrada de la crónica lo dice', ultima);
}

console.log('\n── Una espera que falla a mitad se deshace entera ──');
{
  const p = await partida(9303, { fixture: true });
  const clock = p.m.sistema('clock');
  const original = clock.turno.bind(clock);
  let n = 0;
  clock.turno = async (o) => { n += 1; if (n === 3) throw new Error('fallo de prueba'); return original(o); };
  const r = await p.turno('espero dos horas');
  clock.turno = original;
  comprobar(r.despues.reloj === r.antes.reloj && r.despues.turno === r.antes.turno && r.despues.hambre === r.antes.hambre && /Algo se ha torcido/.test(r.texto),
    'fallo en el tercer pulso: reloj, turno y desgaste vuelven a como estaban', r.texto);
  const s = await p.turno('espero');
  comprobar(minutos(s) === 10, '  y la entrada no se queda bloqueada: el siguiente turno se juega');
}

/* ═══════════════════════════════════════════════════════════════════════════
   4 · DESGASTE
   ═══════════════════════════════════════════════════════════════════════════ */

console.log('\n── Desgaste aplicado ──');
{
  const p = await partida(9303, { fixture: true });
  let r = await p.turno('miro alrededor');
  comprobar(cerca(r.antes.hambre - r.despues.hambre, S.hambrePorTurno, 0.001) && cerca(r.antes.fatiga - r.despues.fatiga, S.fatigaPorTurno, 0.001),
    `un turno normal aplica exactamente un desgaste (hambre −${S.hambrePorTurno}, fatiga −${S.fatigaPorTurno})`, `${r.antes.hambre}→${r.despues.hambre}`);

  p.m.store.fijar('player.hambre', 60.3);
  const u0 = p.registro.umbrales;
  await p.turno('miro alrededor');
  const u1 = p.registro.umbrales;
  await p.turno('miro alrededor');
  comprobar(u1 - u0 >= 1 && p.registro.umbrales === u1, 'cruzar de «bien» a «incómodo» avisa una vez, y no en el turno siguiente', `${u0}→${u1}→${p.registro.umbrales}`);

  p.m.store.fijar('player.hambre', 0.2);
  r = await p.turno('miro alrededor');
  comprobar(r.despues.hambre === 0 && r.antes.vida - r.despues.vida === S.danoPorInanicion, `hambre a 0: −${S.danoPorInanicion} de vida por inanición`, `vida ${r.antes.vida}→${r.despues.vida}`);

  p.m.store.fijar('player.vida.actual', 1);
  const c0 = p.registro.caidas;
  await p.turno('miro alrededor');
  comprobar(p.registro.caidas === c0 + 1 && p.m.ver('player.vida.actual') === 0, 'con 1 de vida y hambre a 0, el personaje cae (una vez)');
}
{
  const p = await partida(9303, { fixture: true });
  p.m.store.fijar('world.clima.actual', 'calorSofocante');
  const r = await p.turno('miro alrededor');
  comprobar(cerca(r.antes.sed - r.despues.sed, S.sedPorTurno * 2, 0.001), `calor sofocante: la sed baja el doble (−${S.sedPorTurno * 2})`, `${r.antes.sed}→${r.despues.sed}`);
}
{
  const p = await partida(9303, { raza: 'crisol', fixture: true });
  const r = await p.turno('miro alrededor');
  comprobar(r.despues.hambre === r.antes.hambre && r.despues.sed === r.antes.sed && r.despues.fatiga < r.antes.fatiga, 'crisol (inmune a hambre y sed): solo baja la fatiga', JSON.stringify([r.despues.hambre, r.despues.sed, r.despues.fatiga]));
}
{
  const p = await partida(9303, { fixture: true });
  // El viaje tiene su propia regla (Travel._consumirProvisiones): una ración
  // y un odre por cada 12 h de camino, y después el turno normal. Cuatro
  // horas a Saucedo no llegan a una ración: queda un solo desgaste de turno.
  // Se comprueba la regla vigente, sin cambiarla (ver informe: pendiente).
  const r = await p.turno('voy a Saucedo');
  const caida = r.antes.hambre - r.despues.hambre;
  comprobar(r.despues.ubicacion === 'saucedo' && cerca(caida, S.hambrePorTurno, 0.001) && r.despues.inventario === r.antes.inventario,
    `viaje de 4 h: un desgaste de turno (−${S.hambrePorTurno}) y 0 raciones, la regla vigente de Travel, sin aplicarlo dos veces`, `${r.antes.hambre}→${r.despues.hambre}`);
}
{
  const p = await partida(9303, { fixture: true });
  p.m.store.fijar('player.fatiga', 50);
  const r = await p.turno('descanso un rato');
  comprobar(r.despues.fatiga >= 50, 'descansar no gasta fatiga', `${r.antes.fatiga}→${r.despues.fatiga}`);
}
{
  const p = await partida(9303);
  await p.turno('ataco a Xivio');
  const c = p.m.sistema('combat');
  for (let i = 0; i < 300 && !c.esperandoJugador; i++) await new Promise((res) => setTimeout(res, 10));
  const a = p.foto();
  await c.jugadaLibre('ataco al guardia con el cuchillo');
  for (let i = 0; i < 300 && !c.esperandoJugador && p.m.ver('combat.activo', false); i++) await new Promise((res) => setTimeout(res, 10));
  const d = p.foto();
  const caida = a.hambre - d.hambre;
  comprobar(caida >= 0 && caida < S.hambrePorTurno, `una ronda de combate no gasta un turno de exploración de hambre (−${caida.toFixed(3)})`, `${a.hambre}→${d.hambre}`);
}

/* ═══════════════════════════════════════════════════════════════════════════
   2 · ARMA INEXISTENTE
   ═══════════════════════════════════════════════════════════════════════════ */

console.log('\n── Armas fuera de combate (semilla 9303, Sive: cuchillo en la mano, arco sin equipar, sin hacha) ──');
{
  const aclara = [
    ['ataco a Korsa con el hacha', /^No llevas hacha\. Di con qué quieres atacar; no se ha hecho el ataque\.$/],
    ['desenvaino el hacha y ataco a Korsa', /^No llevas hacha\. Di con qué quieres atacar; no se ha hecho el ataque\.$/],
    ['ataco a Korsa con el puñal', /^No llevas puñal\./],
    ['ataco a Korsa con el arco', /^Llevas el arco corto, pero no en la mano \(en la mano llevas el cuchillo de caza\)/],
    ['ataco a Korsa con el arco y el cuchillo', /^Llevas el arco corto, pero no en la mano/],
    ['primero cojo el hacha y luego ataco a Korsa', /^Todavía no llevas hacha/],
  ];
  for (const [frase, esperado] of aclara) {
    const p = await partida(9303);
    const r = await p.turno(frase);
    comprobar(intacto(r) && esperado.test(r.texto) && !/Intentas|Sale mal|atacas/i.test(r.texto),
      `«${frase}»: aclara sin tirada, turno, reloj, reputación ni combate`, r.texto);
  }
  {
    const p = await partida(9303);
    const cuchillo = Object.values(p.m.ver('inventory.objetos.porId')).find((o) => o.refId === 'cuchillo_caza');
    p.m.store.fijar(`inventory.objetos.porId.${cuchillo.id}.durabilidad`, 0);
    const r = await p.turno('ataco a Korsa con el cuchillo');
    comprobar(intacto(r) && /no sirve/.test(r.texto), 'FIXTURE cuchillo con durabilidad 0: no sirve, se aclara', r.texto);
  }
  const siguen = [
    ['ataco a Korsa con el cuchillo', 'arma en la mano'],
    ['ataco a Korsa con el cuchillo de caza', 'nombre completo'],
    ['ataco a Korsa con calma', 'modo, no objeto'],
    ['ataco con fuerza a Korsa', 'modo, no objeto'],
    ['ataco a Korsa con la cuerda', 'objeto que no es arma: regla de siempre'],
    ['ataco a Korsa', 'sin arma nombrada'],
    ['ataco a Korsa, el de la capa', 'el blanco no es un arma'],
  ];
  for (const [frase, que] of siguen) {
    const p = await partida(9303);
    const r = await p.turno(frase);
    comprobar(!/No llevas|no en la mano|no sirve/.test(r.texto) && r.despues.turno === r.antes.turno + 1 && /Korsa/.test(r.texto) && !r.combate.some((c) => c.contra && c.contra !== 'Korsa'),
      `${que}: «${frase}» sigue la ruta de siempre contra Korsa`, r.texto);
  }
  for (const [frase, que] of [['Le digo a Korsa: «te ataco con el hacha»', 'cita'], ['no ataco a Korsa con el hacha', 'negación'], ['si Korsa se mueve, le ataco con el hacha', 'condición']]) {
    const p = await partida(9303);
    const r = await p.turno(frase);
    comprobar(!/No llevas hacha/.test(r.texto) && !r.combate.length, `${que}: «${frase}» no dispara la aclaración hostil ni combate`, r.texto);
  }
  {
    const p = await partida(9303);
    const r = await p.turno('afilo el hacha');
    comprobar(intacto(r) && /^No llevas hacha\. ¿Quieres afilar el cuchillo de caza\?$/.test(r.texto), '«afilo el hacha» sigue ofreciendo solo lo compatible, sin afilar ni gastar turno', r.texto);
  }
  {
    const p = await partida(9303);
    await p.turno('ataco a Korsa con el hacha');
    const a = p.foto();
    p.m.guardarYCargar();
    const d = p.foto();
    const ultima = (p.m.ver('narrative.entradas', []) ?? []).at(-1)?.texto ?? '';
    comprobar(a.reloj === d.reloj && a.turno === d.turno && a.inventario === d.inventario && /No llevas hacha/.test(ultima), 'tras guardar y cargar, la aclaración sigue en la crónica y nada cambió');
  }
}

console.log('\n── Armas dentro del combate ──');
{
  const p = await partida(9303);
  await p.turno('ataco a Xivio');
  const c = p.m.sistema('combat');
  for (let i = 0; i < 300 && !c.esperandoJugador; i++) await new Promise((res) => setTimeout(res, 10));
  const enemigos = () => JSON.stringify(Object.values(p.m.ver('combat.combatientes', {})).map((x) => [x.id, x.vida?.actual, x.acciones ?? null]));
  for (const frase of ['ataco con el hacha al guardia', 'desenvaino el hacha y ataco', 'ataco al guardia con el arco']) {
    const a = { ...p.foto(), e: enemigos() };
    const t0 = p.registro.tiradas;
    const j = await c.jugadaLibre(frase, { marcado: null });
    const d = { ...p.foto(), e: enemigos() };
    comprobar(j?.tipo === 'aclaracion' && a.ronda === d.ronda && a.turno === d.turno && a.vida === d.vida && a.e === d.e && a.inventario === d.inventario && p.registro.tiradas === t0 && c.esperandoJugador,
      `«${frase}»: aclara, misma ronda, mismos enemigos, sin tirada, y sigue siendo su turno`, JSON.stringify(j));
  }
  const a = p.foto();
  await c.jugadaLibre('ataco al guardia con el cuchillo');
  for (let i = 0; i < 300 && !c.esperandoJugador && p.m.ver('combat.activo', false); i++) await new Promise((res) => setTimeout(res, 10));
  const d = p.foto();
  comprobar(d.ronda !== a.ronda || !d.combate, 'control: con el cuchillo en la mano el ataque se hace y la ronda avanza', `${a.ronda}→${d.ronda}`);
}

/* ═══════════════════════════════════════════════════════════════════════════
   3 · BLANCO EXPLÍCITO
   ═══════════════════════════════════════════════════════════════════════════ */

console.log('\n── El blanco nombrado no se cambia (semilla 9303) ──');
{
  const rutas = [];
  for (const frase of ['ataco a Korsa', 'ataco a Korsa con el cuchillo', 'desenvaino el cuchillo y ataco a Korsa']) {
    const p = await partida(9303);
    const r = await p.turno(frase);
    rutas.push(r);
    comprobar(!r.combate.length && !/Guardia corrupto|no te han visto/.test(r.texto) && /atac\w* a Korsa/.test(r.texto) && r.despues.turno === r.antes.turno + 1,
      `«${frase}»: agresión a Korsa por la ruta de siempre, sin abrir combate contra un guardia`, r.texto);
  }
  comprobar(rutas.every((r) => r.despues.reputacion === rutas[0].despues.reputacion && r.despues.vida === rutas[0].despues.vida),
    '  las tres frases dejan la misma vida y reputación (misma ruta)');

  const p = await partida(9303);
  const r = await p.turno('ataco a Xivio');
  const pedido = r.combate[0];
  comprobar(pedido && pedido.enemies?.[0]?.count === 2 && pedido.teVen === true && /Xivio ve venir el golpe/.test(r.texto),
    'control: «ataco a Xivio» abre contra dos guardias, te ven, y se narra la intervención', JSON.stringify(pedido));

  for (const [frase, que] of [['no ataco a Korsa', 'negación'], ['si Korsa se mueve, ataco a Korsa', 'condición'], ['guardo el cuchillo', 'guardar'], ['afilo el cuchillo', 'afilar'], ['miro el cuchillo', 'mirar'], ['toco el cuchillo', 'tocar'], ['el cuchillo brilla al sol', 'nombrar']]) {
    const q = await partida(9303);
    const s = await q.turno(frase);
    comprobar(!s.combate.length && !s.despues.combate, `${que}: «${frase}» no abre combate`, s.texto);
  }
  const q = await partida(9303);
  const s = await q.turno('ataco a Torket');
  comprobar(!s.combate.length, 'PNJ que no está («ataco a Torket»): no se sortea un enemigo', s.texto);
}
{
  const p = await partida(9303, { fixture: true });
  for (const n of ['Korsa', 'Berger']) p.m.store.fijar(`npcs.conocidos.porId.${p.presente(n)}.hostil`, true);
  let r = await p.turno('ataco a Berger');
  comprobar(r.combate[0]?.contra === 'Berger', 'FIXTURE dos hostiles (Korsa y Berger): «ataco a Berger» elige a Berger, no al primero', JSON.stringify(r.combate));
  const q = await partida(9303, { fixture: true });
  for (const n of ['Korsa', 'Berger']) q.m.store.fijar(`npcs.conocidos.porId.${q.presente(n)}.hostil`, true);
  r = await q.turno('ataco al primero que vea');
  comprobar(!r.combate.length && /A cuál|di a quién/i.test(r.texto), '  sin nombre y con dos hostiles: pregunta a cuál, no sortea', r.texto);
  const t = await partida(9303, { fixture: true });
  for (const n of ['Korsa', 'Berger']) t.m.store.fijar(`npcs.conocidos.porId.${t.presente(n)}.hostil`, true);
  r = await t.turno('ataco al arriero');
  comprobar(r.combate[0]?.contra === 'Berger', '  por su oficio («al arriero»): Berger', JSON.stringify(r.combate));
}

if (salida) {
  mkdirSync(salida, { recursive: true });
  writeFileSync(join(salida, 'coherencia-turnos.txt'), transcripcion.join('\n'), 'utf8');
  console.log(`\nTranscripción en ${join(salida, 'coherencia-turnos.txt')}`);
}

console.log(`\n${casos - fallos}/${casos} comprobaciones bien.`);
process.exit(fallos ? 1 : 0);
