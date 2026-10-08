/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCANVEIL · tools/auditar-interpretacion.mjs
 * ---------------------------------------------------------------------------
 * Lo que escribe el jugador se entiende antes de narrarlo.
 *
 * Congela los siete fallos de una partida real (semilla 75313, Ena, la cabra
 * de Marlo) y los comprueba con el motor de verdad, y después un conjunto
 * aparte que no se escribió mirando esos siete: paráfrasis, erratas, nombres
 * parecidos, otra semilla, cosas vistas en otro lugar, guardar y cargar.
 *
 * Una respuesta en boca de quien no era cuenta como fallo aunque diga algo
 * del tema: es la métrica de destinatario errado.
 *
 *   node tools/auditar-interpretacion.mjs
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { crearMotor } from './motor-sin-ventana.mjs';
import { vigentes } from '../src/ai/narrador/Canon.js';
import { segmentar, TIPO_SEGMENTO } from '../src/engine/Segmentos.js';

let fallos = 0;
let casos = 0;
const errados = [];

function comprobar(bien, texto, detalle = '') {
  casos += 1;
  if (bien) {
    console.log(`OK   ${texto}`);
  } else {
    fallos += 1;
    console.log(`MAL  ${texto}`);
    if (detalle) console.log(`     ${String(detalle).replace(/\n/g, ' | ').slice(0, 700)}`);
  }
}

/** Quién habla entre comillas en un texto: el nombre pegado a la cita. */
function hablantes(texto, nombres) {
  const quien = new Set();
  for (const n of nombres) {
    const re = new RegExp(`(?:${n}[^.«\\n]{0,40}«|»[^.«\\n]{0,30}${n}|${n}:\\s*[«—-])`, 'u');
    if (re.test(texto)) quien.add(n);
  }
  return [...quien];
}

/** Métrica de destinatario: si contesta alguien, tiene que ser el esperado. */
function destinatario(texto, esperado, nombres, etiqueta) {
  const h = hablantes(texto, nombres);
  const mal = h.filter((n) => n !== esperado);
  if (mal.length) errados.push(`${etiqueta}: contesta ${mal.join(', ')}`);
  return mal.length === 0;
}

const m = await crearMotor({ semilla: 75313 });
// Lo narrado, sin la línea del jugador: su texto no cuenta como respuesta.
const jugarOriginal = m.jugar.bind(m);
m.jugar = async (t) => (await jugarOriginal(t)).split('\n').filter((l) => !l.startsWith('»')).join('\n');
const oro = () => m.ver('player.oro', 0);
const objetos = () => Object.keys(m.ver('inventory.objetos.porId', {}) ?? {}).length;
const tiradas = () => (m.entradas() ?? []).filter((e) => e.voz === 'roll' || e.voz === 'tirada').length;
const nombresAqui = () => (m.ver('npcs.presentes', []) ?? []).map((id) => m.ver(`npcs.conocidos.porId.${id}.nombre`)).filter(Boolean);

async function nuevaPartida(ficha, semilla) {
  m.store.reiniciar();
  if (semilla) m.rng.reiniciar?.(semilla);
  return m.empezar(ficha);
}

/* ═══════════════════════════════════════════════════════════════════════════
   1. LOS SIETE DE LA PARTIDA REAL
   ═══════════════════════════════════════════════════════════════════════════ */

console.log('\n── Los siete fallos de la partida de Ena (semilla 75313) ──');
{
  const apertura = await m.empezar({ nombre: 'Ena', raza: 'valdes', clase: 'rastreador', trasfondo: 'errante', genero: 'f', retrato: 'mujer joven' });
  comprobar(/cabra/i.test(apertura) && /Marlo/.test(apertura), 'la apertura es la de la cabra de Marlo', apertura);
  const nombres = nombresAqui();

  let t = await m.jugar('Miro alrededor y escucho la disputa sin meterme');
  comprobar(!/sin meterme/.test(t) && !/escuchas la disputa/i.test(t), '1 · ni mezcla personas ni da por hecha una disputa que no hay', t);
  comprobar(/ninguna disputa/.test(t), '1 · dice que no hay disputa a la vista', t);

  const antesTiradas = tiradas();
  t = await m.jugar('Le pregunto al carretero qué necesita para mover el carro');
  comprobar(/ningún carretero/.test(t) && !/«/.test(t), '2 · sin carretero, nadie contesta por él', t);
  comprobar(destinatario(t, null, nombres, 'caso 2'), '2 · Torela no se queda la pregunta', t);

  t = await m.jugar('Examinó el eje y ayudo a sostener la rueda');
  comprobar(/ningún eje|ningún carro|ninguna rueda/.test(t) && !/río|orilla/.test(t), '3 · sin carro no hay eje que examinar ni ambiente de relleno', t);
  comprobar(tiradas() === antesTiradas, '3 · y no se tira por algo que no existe');

  t = await m.jugar('Si el guardia me amenaza, me aparto; de momento espero');
  comprobar(/Queda en el aire lo que harás si el guardia te amenaza/.test(t) && !/te apartas/.test(t), '4 · la condición queda pendiente y no se ejecuta', t);
  comprobar(!/De momento espero\b/.test(t), '4 · y la espera se cuenta en segunda persona', t);

  t = await m.jugar('Le pregunto al guardia qué hará con la fruta si no apartamos el carro');
  comprobar(/ningún guardia/.test(t) && !/«/.test(t), '5 · sin guardia, ni rumor de sustituto ni hipótesis tomada por hecho', t);
  comprobar(destinatario(t, null, nombres, 'caso 5'), '5 · nadie contesta en su lugar', t);

  t = await m.jugar('Vuelvo y le pregunto al carretero qué pasó mientras estuve fuera');
  comprobar(/ningún carretero/.test(t) && !/«/.test(t), '6 · un carretero que nunca estuvo no se recuerda', t);

  const o1 = oro();
  const i1 = objetos();
  t = await m.jugar('No voy a darte mis monedas. Espero');
  comprobar(t.includes('«No voy a darte mis monedas»') && !/tus monedas|darte tus/.test(t), '7 · la negativa se cita con sus palabras exactas', t);
  comprobar(oro() === o1 && objetos() === i1, '7 · y nada cambia de manos');

  t = await m.jugar('Le pregunto a Marlo por la cabra');
  comprobar(/Marlo/.test(t) && /«/.test(t), 'con Marlo delante, Marlo contesta', t);
  comprobar(destinatario(t, 'Marlo', nombres, 'Marlo y la cabra'), 'y contesta él, no Torela', t);

  await m.guardarYCargar();
  const recuerdos = JSON.stringify(m.ver('ai.memoria', {}));
  comprobar(/si el guardia me amenaza, me aparto/.test(recuerdos), '4 · la condición sigue guardada tras guardar y cargar');
}

/* ═══════════════════════════════════════════════════════════════════════════
   2. CON CARRO DE VERDAD, Y FUERA DE SU ESCENA
   ═══════════════════════════════════════════════════════════════════════════ */

console.log('\n── Con el carro atascado delante, y después lejos de él ──');
{
  await nuevaPartida({ nombre: 'Tavi', raza: 'valdes', clase: 'rastreador', trasfondo: 'errante', genero: 'm' });
  const s = m.sistema('situations');
  for (const x of s.aqui()) {
    s._guardar({ ...x, estado: 'desenlace' });
    for (const a of Object.values(x.actores)) m.sistema('npcs').retirar(a.refId);
  }
  const carro = s.abrir({ refId: 'carro_atascado' });
  const carretero = carro.actores.carretero.nombre;
  const guardia = carro.actores.guardia.nombre;
  const nombres = nombresAqui();

  let t = await m.jugar('Le pregunto al carretero qué necesita para mover el carro');
  comprobar(!/ningún carretero/.test(t) && t.includes(carretero), `con carretero delante, contesta ${carretero}`, t);
  comprobar(destinatario(t, carretero, nombres, 'carretero presente'), `y no ${guardia}`, t);

  t = await m.jugar('examino el eje del carro');
  comprobar(!/ningún eje|ningún carro/.test(t), 'el eje del carro que está delante sí se examina', t);

  const i0 = objetos();
  const lugar0 = m.ver('world.ubicacion');
  t = await m.jugar(`Le digo al guardia: «No os daré mi anillo». Si insiste, me marcho; mientras espero`);
  comprobar(t.includes('«No os daré mi anillo»'), 'la negativa entrecomillada se conserva', t);
  comprobar(objetos() === i0 && m.ver('world.ubicacion') === lugar0, 'nada cambia de manos y la marcha espera a que insista', t);
  comprobar(/Queda en el aire lo que harás si insiste/.test(t), 'la condición se devuelve pendiente', t);

  t = await m.jugar('le pregunto a Marlo por la cabra');
  comprobar(/No conoces a nadie con ese nombre/.test(t) && !/«/.test(t), 'un nombre que no existe no se lo queda otro', t);

  // Lejos del carro.
  const destino = m.sistema('world').lugarActual()?.plantilla?.conexiones?.[0]?.hasta;
  m.sistema('world').descubrir(destino, 'prueba');
  const viaje = await m.sistema('travel').viajar(destino, { forzar: true });
  if (m.ver('world.ubicacion') === lugar0) console.log('     (viaje:', JSON.stringify(viaje), ')');
  const lejos = m.ver('world.ubicacion') !== lugar0;
  comprobar(lejos, 'el viaje llega a otro sitio', m.ver('world.ubicacion'));

  t = await m.jugar('examino el carro');
  comprobar(/El carro que viste estaba en/.test(t), 'el carro visto en otro lugar se sitúa donde estaba', t);
  t = await m.jugar('examino la carreta');
  comprobar(/Aquí no hay ninguna carreta/.test(t), 'una carreta que nunca existió no se confunde con el carro', t);

  await m.guardarYCargar();
  t = await m.jugar('examino el carro');
  comprobar(/El carro que viste estaba en/.test(t), 'y lo mismo tras guardar y cargar', t);
  t = await m.jugar(`le pregunto a ${carretero} qué tal el eje`);
  comprobar(new RegExp(`${carretero} no está aquí`).test(t) && !/«/.test(t), `${carretero}, conocido pero lejos, no contesta desde aquí`, t);
}

/* ═══════════════════════════════════════════════════════════════════════════
   3. CONJUNTO APARTE: OTRA SEMILLA, OTROS NOMBRES, OTRAS PALABRAS
   ═══════════════════════════════════════════════════════════════════════════ */

console.log('\n── Conjunto aparte (paráfrasis, erratas, nombres parecidos) ──');
{
  await nuevaPartida({ nombre: 'Oren', raza: 'valdes', clase: 'guerrero', trasfondo: 'soldado', genero: 'm' }, 31337);
  const s = m.sistema('situations');
  for (const x of s.aqui()) {
    s._guardar({ ...x, estado: 'desenlace' });
    for (const a of Object.values(x.actores)) m.sistema('npcs').retirar(a.refId);
  }
  const npcs = m.sistema('npcs');
  const marla = npcs.introducir({ nombre: 'Marla', rol: 'pastora', genero: 'f' });
  npcs.introducir({ nombre: 'Gedo', rol: 'herrero', genero: 'm' });
  const nombres = ['Marla', 'Gedo'];

  let t = await m.jugar('pregunto a marla por el paso del norte');
  comprobar(/Marla/.test(t) && !/No conoces a nadie/.test(t), 'el nombre en minúscula se reconoce', t);
  comprobar(destinatario(t, 'Marla', nombres, 'marla minúscula'), 'y contesta Marla, no Gedo', t);

  t = await m.jugar('le pregunto a Marlo si ha visto lobos');
  comprobar(/No conoces a nadie con ese nombre/.test(t), '«Marlo» no es «Marla»: un nombre parecido no se da por bueno', t);

  t = await m.jugar('Inspeccionó el cofre con cuidado');
  comprobar(/Aquí no hay ningún cofre/.test(t), 'errata de tilde y un cofre que no hay', t);

  t = await m.jugar('miro los caballos del establo');
  comprobar(/ningún caballo|ningún establo/.test(t), 'en plural tampoco se inventan caballos', t);

  t = await m.jugar('le hablo al tabernero de la guerra');
  comprobar(/ningún tabernero/.test(t) && !/«/.test(t), 'hablar con un tabernero que no hay', t);

  const o0 = oro();
  t = await m.jugar('le digo a Marla que no pienso pagarle nada');
  comprobar(oro() === o0 && /Marla/.test(t), 'una negativa dicha con «que» no mueve dinero', t);

  t = await m.jugar('Gedo, te lo advierto: no toques mi espada');
  comprobar(!/tu espada.*toques|no toques tu/.test(t), 'lo que se le dice a Gedo sin verbo de decir conserva sus palabras', t);

  t = await m.jugar('le pregunto al herrero por el paso');
  comprobar(/Gedo/.test(t) && destinatario(t, 'Gedo', nombres, 'herrero por oficio'), 'el herrero por su oficio es Gedo', t);

  t = await m.jugar('le vuelvo a preguntar al herrero por el paso');
  comprobar(/Gedo/.test(t) && destinatario(t, 'Gedo', nombres, 'repregunta'), 'la repregunta sigue siendo a Gedo', t);

  // Guardar entre la pregunta y la respuesta: la siguiente pregunta sin
  // nombre va a quien se hablaba.
  await m.guardarYCargar();
  t = await m.jugar('y qué más sabes del paso?');
  comprobar(destinatario(t, 'Gedo', nombres, 'tras cargar'), 'tras cargar, la pregunta sin nombre sigue yendo a Gedo', t);

  // Una hipótesis dentro de una pregunta no deja nada pendiente.
  const pendientes0 = JSON.stringify(m.ver('ai.memoria', {})).match(/Dejó dicho/g)?.length ?? 0;
  t = await m.jugar('le pregunto a Marla qué haría si llegaran los lobos');
  const pendientes1 = JSON.stringify(m.ver('ai.memoria', {})).match(/Dejó dicho/g)?.length ?? 0;
  comprobar(pendientes1 === pendientes0 && !/Queda en el aire/.test(t), 'una hipótesis preguntada no es una condición del jugador', t);
  comprobar(marla?.refId && destinatario(t, 'Marla', nombres, 'hipótesis'), 'y contesta Marla', t);
}

/* ═══════════════════════════════════════════════════════════════════════════
   4. CANON: SOLO A PROPÓSITO Y FUERA DE LA HISTORIA
   ═══════════════════════════════════════════════════════════════════════════ */

console.log('\n── Canon: se cambia a propósito, no por una frase de la historia ──');
{
  const canonJugador = () => vigentes(m.sistema('turns').memoria.registroCanon).map((h) => h.texto);
  const turno0 = m.ver('meta.turno', 0);
  let t = await m.jugar('canon: mi hermano Aldo murió en el paso del norte hace dos inviernos');
  comprobar(/Canon anotado/.test(t) && canonJugador().some((c) => /Aldo murió/.test(c)), 'una edición fuera de la historia se anota como canon del jugador', t);
  comprobar(m.ver('meta.turno', 0) === turno0, 'y no gasta turno ni mueve el mundo');

  await m.jugar('le digo a Marla: «Mi hermano sigue vivo, lo sé»');
  await m.jugar('si mi hermano estuviera vivo, iría a buscarlo');
  comprobar(m.sistema('turns').memoria.registroCanon.ediciones.length === 1 && canonJugador().some((c) => /Aldo murió/.test(c)) && !canonJugador().some((c) => /vivo/.test(c)),
    'lo que dice el personaje o una hipótesis no reescribe el canon', JSON.stringify(canonJugador()));

  await m.guardarYCargar();
  const turnos = m.sistema('turns');
  const inst = turnos._instantanea({ contexto: turnos._compositor.componerEstructurado({ accion: '', tipo: 'narracion' }) }, '');
  comprobar(inst.memoria.canon.some((c) => /Aldo murió/.test(c.texto) && /deliberada/.test(c.fuente)), 'tras guardar y cargar, viaja en el canon de la instantánea con su procedencia', JSON.stringify(inst.memoria.canon).slice(0, 300));
}

/* ═══════════════════════════════════════════════════════════════════════════
   5. LO QUE DESTAPÓ LEER SEIS PARTIDAS ENTERAS
   ═══════════════════════════════════════════════════════════════════════════ */

console.log('\n── Lo que destapó la revisión manual de partidas ──');
{
  await nuevaPartida({ nombre: 'Korr', raza: 'ferrano', clase: 'vinculado', trasfondo: 'soldado', genero: 'm' }, 9303);
  const s = m.sistema('situations');
  for (const x of s.aqui()) { s._guardar({ ...x, estado: 'desenlace' }); for (const a of Object.values(x.actores)) m.sistema('npcs').retirar(a.refId); }
  const pozo = s.abrir({ refId: 'colgante_en_el_pozo' });
  const dallin = m.sistema('npcs').introducir({ nombre: 'Dallin', rol: 'tasadora', genero: 'f' });
  const tiradasAhora = () => (m.entradas() ?? []).filter((e) => e.voz === 'roll' || e.voz === 'tirada').length;

  // Con el pozo recién abierto y el dado a favor: mirar a otra cosa no lo
  // resuelve (con éxito, la vía de «pescar» sacaba el colgante).
  const reglas = m.sistema('rules');
  const resolverOriginal = reglas.resolver;
  reglas.resolver = (x) => ({ ...resolverOriginal.call(reglas, x), exito: true, grado: 'exitoClaro' });
  let t = await m.jugar('examino el suelo buscando rastros de lobo');
  reglas.resolver = resolverOriginal;
  const tras = s.todas().find((x) => x.id === pozo.id);
  comprobar(tras?.estado === 'abierta' && !/colgante sube/.test(t), 'buscar rastros de lobo no resuelve la situación del pozo', `${tras?.estado} · ${tras?.resolucion} · ${t}`);

  t = await m.jugar('le pregunto a Dallin si necesita ayuda');
  comprobar(!/De (?:necesita|Dallin|dallin) no sé/.test(t), 'el tema no es a quien se pregunta ni una palabra suelta', t);
  const r0 = tiradasAhora();
  t = await m.jugar('le digo a Dallin que busco trabajo de espada');
  comprobar(tiradasAhora() === r0 && !/No cuela|ceden|Cede|empeorado/.test(t), 'contarle algo a alguien no se tira ni saca un resultado de catálogo', t);
  t = await m.jugar('le pregunto a Dallin por el camino y si hay trabajo allí');
  comprobar(!/Queda en el aire/.test(t), '«y si hay trabajo» dentro de una pregunta no es una condición', t);
  t = await m.jugar('si alguien me sigue, me escondo; mientras, sigo esperando');
  comprobar(!/Mientras y/.test(t), 'un «mientras» suelto va con lo que sigue', t);
  t = await m.jugar('escupo al suelo y me detengo a mirar');
  comprobar(/Escupes/.test(t) && /te detienes/.test(t), 'los verbos de -er, -ir e irregulares se conjugan bien', t);
  t = await m.jugar('le pregunto a la anciana del pueblo por la campana');
  comprobar(/ninguna anciana/.test(t) && !/«/.test(t), 'una persona por cómo es («la anciana») también se resuelve', t);
  t = await m.jugar('le pregunto al capitán si necesita hombres');
  comprobar(/ningún capitán/.test(t), 'el aviso usa la palabra con su tilde', t);
  t = await m.jugar('miro el cielo');
  comprobar(/cielo/i.test(t) && !/río|puente|garita/.test(t), 'mirar el cielo da el cielo, no un rasgo al azar', t);
  comprobar(dallin?.refId, 'hay alguien a quien preguntar');
}

/* ═══════════════════════════════════════════════════════════════════════════
   6. UNA NEGATIVA Y UNA ESPERA, APARTE
   ---------------------------------------------------------------------------
   «No voy a darte mis monedas. Espero» salía «Le dices: «No voy a darte mis
   monedas., Espero»»: la regla del vocativo del final tomaba «Espero» por un
   nombre y lo cosía a la frase anterior. Un nombre suelto solo es vocativo
   si una coma lo ata o va entre exclamaciones.
   ═══════════════════════════════════════════════════════════════════════════ */

console.log('\n── Una negativa y una espera, aparte ──');
{
  for (const entrada of ['No voy a darte mis monedas. Espero', 'No voy a darte mis monedas. Espero.', 'No voy a darte mis monedas; espero']) {
    const partes = segmentar(entrada);
    comprobar(partes.length === 2 && partes[0].tipo === TIPO_SEGMENTO.DIALOGO && partes[1].tipo === TIPO_SEGMENTO.ESPERA,
      `«${entrada}»: la negativa y la espera son dos segmentos`, JSON.stringify(partes.map((s) => [s.tipo, s.texto])));
    const o = oro();
    const i = objetos();
    const t = await m.jugar(entrada);
    comprobar(t.includes('«No voy a darte mis monedas»') && !/monedas\.?,\s*Espero|Espero»/.test(t), `«${entrada}»: la negativa se cita literal y sin la espera dentro`, t);
    comprobar(oro() === o && objetos() === i, `«${entrada}»: ni el oro ni el inventario cambian`, `${o}→${oro()} · ${i}→${objetos()}`);
  }

  // Lo que sí tiene que seguir unido.
  const juntos = [
    ['¿Te echo una mano, Ianvio?', 'el nombre del final, tras coma, es a quien se habla'],
    ['Corvane, si ves al encapuchado, avísame', 'el nombre del principio, con coma, es a quien se habla'],
    ['¡Rensa! ¿Sabes algo de un incendio?', 'el nombre entre exclamaciones es a quien se habla'],
    ['me acerco a la puerta, mucho cuidado', '«mucho cuidado» no es otra acción'],
    ['si el guardia se niega, lo empujo al río', 'la condición se lleva su consecuencia'],
  ];
  for (const [entrada, que] of juntos) {
    const partes = segmentar(entrada);
    comprobar(partes.length === 1, `«${entrada}»: ${que}`, JSON.stringify(partes.map((s) => [s.tipo, s.texto])));
  }
  const vuelta = segmentar('Espero. No voy a darte mis monedas');
  comprobar(vuelta.length === 2 && vuelta[0].tipo === TIPO_SEGMENTO.ESPERA, '«Espero» al principio tampoco es un nombre', JSON.stringify(vuelta.map((s) => [s.tipo, s.texto])));
}

console.log(`\n${casos - fallos}/${casos} comprobaciones · destinatario errado: ${errados.length}${errados.length ? ` (${errados.join('; ')})` : ''}`);
console.log(fallos ? `\n${fallos} fallos.` : '\nTodo bien.');
process.exit(fallos ? 1 : 0);
