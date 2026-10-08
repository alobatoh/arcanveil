/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCANVEIL · tools/auditar-historia.mjs
 * ---------------------------------------------------------------------------
 * ¿La partida es una historia viva o la adaptación de la biografía?
 *
 * El autor corrigió el rumbo: el jugador escribe libremente y el mundo
 * reacciona a lo que hace, dice, pregunta, ignora o deja a medias. La
 * historia personal aporta datos, pero no dicta la campaña.
 *
 * Esta auditoría juega partidas de verdad con el motor completo, en Node y
 * con el narrador interno (ver `motor-sin-ventana.mjs`), y comprueba el
 * contrato con criterios de aceptación. Las tiradas de las situaciones se
 * fijan cuando lo que se prueba es la consecuencia y no el dado: el dado
 * tiene sus propias auditorías.
 *
 *   node tools/auditar-historia.mjs
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { crearMotor } from './motor-sin-ventana.mjs';
import { segmentar, ordenar } from '../src/engine/Segmentos.js';
import { resultadosDe, categoriaDe } from '../src/data/narrative.templates.js';
import { obtenerEncuentro } from '../src/world/EncounterTables.js';
import * as Prompt from '../src/ai/PromptBuilder.js';
import { ContextComposer } from '../src/ai/ContextComposer.js';
import { paraInterfaz } from '../src/ai/providers/index.js';

let fallos = 0;

function comprobar(bien, texto, detalle = '') {
  if (bien) {
    console.log(`OK   ${texto}`);
  } else {
    fallos += 1;
    console.log(`MAL  ${texto}`);
    if (detalle) console.log(`     ${String(detalle).slice(0, 600)}`);
  }
}

const HISTORIA = 'Perdí la forja de mi padre en un incendio. Busco al que la quemó.';
const FICHA = { nombre: 'Brunhilda', raza: 'ferrano', clase: 'vinculado', trasfondo: 'gente_campo', retrato: 'enana guerrera de barba trenzada', genero: 'f' };

const m = await crearMotor();

/** Hace que la próxima tirada de reglas salga como se pide. */
function fijarDado(exito) {
  const reglas = m.sistema('rules');
  const original = reglas.resolver;
  reglas.resolver = (t) => {
    reglas.resolver = original;
    const r = original.call(reglas, t);
    return { ...r, exito, grado: exito ? 'exitoClaro' : 'fracaso' };
  };
}

/** Empieza de cero con otra partida en el mismo proceso. */
async function nuevaPartida(ficha, opciones) {
  m.store.reiniciar();
  return m.empezar(ficha, opciones);
}

const misiones = () => {
  const a = m.ver('quests.activas', { porId: {}, orden: [] });
  return (a.orden ?? []).map((id) => a.porId[id]).filter(Boolean);
};

/* ── 1. La misma biografía no decide la campaña ─────────────────────────── */

{
  const aperturas = [];
  for (const nombre of ['Brunhilda', 'Hrodna']) {
    const apertura = await nuevaPartida({ ...FICHA, nombre, lore: HISTORIA });
    aperturas.push(apertura);

    comprobar(!misiones().length, `${nombre}: la partida no empieza con misiones impuestas`, misiones().map((q) => q.titulo).join(', '));
    comprobar(m.ver('player.lore') === HISTORIA, `${nombre}: la historia se conserva como canon en la ficha`);
    comprobar(!/forja|incendio|padre|quem/i.test(apertura), `${nombre}: la apertura no vuelca el pasado del personaje`, apertura);
    comprobar(m.sistema('situations').aqui().length === 1, `${nombre}: la apertura pone en marcha algo del mundo`, JSON.stringify(m.sistema('situations').inspeccionar()));
    const actores = Object.values(m.sistema('situations').aqui()[0]?.actores ?? {});
    comprobar(actores.length && actores.every((a) => m.ver('npcs.presentes', []).includes(a.refId)),
      `${nombre}: quienes están metidos en ello están en escena de verdad`);
    comprobar(/\?$/.test(apertura.trim().split('\n').at(-1)), `${nombre}: la apertura devuelve la palabra`, apertura.split('\n').at(-1));
    comprobar(!(m.ver('ai.memoria.hilos', []) ?? []).some((h) => /^player_lore/.test(h.relacionadoCon ?? '')),
      `${nombre}: el pasado no se abre como hilos de memoria`);
  }

  const sinHistoria = await nuevaPartida({ ...FICHA, nombre: 'Sinpasado', lore: '' });
  comprobar(!misiones().length && /\?$/.test(sinHistoria.trim()), 'sin historia tampoco hay objetivo obligatorio, y se juega igual');
}

/* ── 2. Ignorar algo no lo borra, y el mundo sigue a su ritmo ───────────── */

{
  await nuevaPartida({ ...FICHA, lore: HISTORIA });
  const situaciones = m.sistema('situations');
  // Se fuerza la del encapuchado: es la que la especificación pone de ejemplo.
  for (const s of situaciones.aqui()) m.store.dispatch('situaciones/guardar', { situacion: { ...s, estado: 'desenlace' } });
  const sit = situaciones.abrir({ refId: 'encapuchado_vigila' });
  const vigia = sit.actores.vigia;
  const mercader = sit.actores.mercader;

  const hablados = [];
  m.bus.on('npc:talked', (e) => hablados.push(e.refId));

  const turno1 = await m.jugar('Ignoro al encapuchado; examino el pozo');
  const ahora = situaciones.todas().find((s) => s.id === sit.id);
  comprobar(ahora.estado === 'abierta' && ahora.ignoradaAProposito, 'ignorarlo lo deja en marcha, apuntado como ignorado a propósito', JSON.stringify(ahora));
  comprobar(!hablados.includes(vigia.refId), 'ignorarlo no es hablar con él');
  comprobar(m.ver('npcs.presentes', []).includes(vigia.refId), 'el encapuchado sigue en su sitio', turno1);
  comprobar(/pozo/i.test(turno1), 'el turno trata del pozo, que es lo que hizo', turno1);

  // Pocos turnos después, sin causa suficiente, no cambia nada.
  await m.jugar('miro el agua del pozo');
  comprobar(situaciones.todas().find((s) => s.id === sit.id).estado === 'abierta', 'dos turnos no bastan para que pase nada por su cuenta');

  // Con el plazo cumplido, lo que el vigía venía a hacer ocurre, y queda en la memoria.
  let desenlace = '';
  for (let i = 0; i < 5; i += 1) desenlace += `${await m.jugar('sigo sentada junto al pozo')}\n`;
  const fin = situaciones.todas().find((s) => s.id === sit.id);
  comprobar(fin.estado === 'desenlace', 'cumplido el plazo, el robo ocurre sin ella', JSON.stringify(fin));
  comprobar(new RegExp(mercader.nombre).test(desenlace) && /bolsa/.test(desenlace), 'y se cuenta en escena, con causa', desenlace);
  comprobar((m.ver('ai.memoria.hechos', []) ?? []).some((h) => h.texto.includes(mercader.nombre) && /robaron/.test(h.texto)),
    'el mundo lo recuerda como hecho');
  comprobar(!/culpa|por no|deberías|castig/i.test(desenlace), 'sin reproches ni castigo al jugador por no intervenir', desenlace);
}

/* ── 3. Intervenir cambia el mundo, y el mundo lo recuerda ──────────────── */

{
  await nuevaPartida({ ...FICHA, lore: HISTORIA });
  const situaciones = m.sistema('situations');
  for (const s of situaciones.aqui()) m.store.dispatch('situaciones/guardar', { situacion: { ...s, estado: 'desenlace' } });
  const sit = situaciones.abrir({ refId: 'carro_atascado' });
  const carretero = sit.actores.carretero;
  const actitudAntes = m.ver(`npcs.conocidos.porId.${carretero.refId}.actitud`);

  fijarDado(true);
  const turno = await m.jugar(`ayudo a ${carretero.nombre} a levantar el carro y calzar la rueda`);
  comprobar(/calzar el eje|Rueda coja/.test(turno), 'lo que se narra es lo que pasa en la situación', turno);
  comprobar(situaciones.todas().find((s) => s.id === sit.id).estado === 'resuelta', 'con éxito, la situación termina');
  comprobar(m.ver(`npcs.conocidos.porId.${carretero.refId}.actitud`) > actitudAntes, 'el carretero le tiene más aprecio');
  const recuerda = (m.ver(`npcs.conocidos.porId.${carretero.refId}.memoria`, []) ?? []).map((r) => r.texto).join(' | ');
  comprobar(/sacar el carro/.test(recuerda), 'el carretero lo recuerda', recuerda);

  // Guardar y cargar: el mismo mundo, los mismos nombres, los mismos recuerdos.
  const nombreAntes = m.ver(`npcs.conocidos.porId.${carretero.refId}.nombre`);
  await m.guardarYCargar();
  const tras = m.sistema('situations').todas().find((s) => s.id === sit.id);
  comprobar(tras?.estado === 'resuelta', 'tras guardar y cargar, la situación sigue resuelta');
  comprobar(m.ver(`npcs.conocidos.porId.${carretero.refId}.nombre`) === nombreAntes
    && (m.ver(`npcs.conocidos.porId.${carretero.refId}.memoria`, []) ?? []).some((r) => /sacar el carro/.test(r.texto)),
  'y el carretero conserva su nombre y su recuerdo');
}

/* ── 4. El texto se lee entero y en orden ────────────────────────────────── */

{
  const tipos = (t) => segmentar(t).map((x) => x.tipo).join(' + ');
  comprobar(tipos('le pregunto por el puente, le enseño la carta y si miente me voy') === 'dialogo + accion + condicional',
    'pregunta, gesto y condición son tres cosas', tipos('le pregunto por el puente, le enseño la carta y si miente me voy'));
  comprobar(tipos('Ignoro al encapuchado; examino el pozo') === 'omision + accion', 'dejar algo de lado y hacer otra cosa');
  comprobar(tipos('Que mi compañera negocie; yo observo').startsWith('delegacion'), 'delegar en un compañero');
  const neg = segmentar('Le digo a Mara: «No os entregaré la llave». Luego espero');
  comprobar(neg[0].tipo === 'dialogo' && neg[0].negativa && neg[0].texto.includes('«No os entregaré la llave»') && neg[1]?.tipo === 'espera',
    'la negativa se reconoce y su cita queda literal', JSON.stringify(neg));
  const cond = segmentar('si el guardia se niega, lo empujo al río')[0];
  comprobar(cond.tipo === 'condicional' && cond.condicion === 'el guardia se niega' && cond.consecuencia === 'lo empujo al río',
    'la condición conserva su consecuencia', JSON.stringify(cond));
  comprobar(segmentar('voy con cuidado y mucho sigilo').length === 1, '«y mucho sigilo» no es otra acción');
}

{
  await nuevaPartida({ ...FICHA, lore: '' });
  const npcs = m.sistema('npcs');
  // Sin la situación de apertura ni su gente: la prueba no depende de cuál
  // haya tocado (si sale la del carro, hay un carretero de verdad).
  for (const s of m.sistema('situations').aqui()) {
    m.store.dispatch('situaciones/guardar', { situacion: { ...s, estado: 'desenlace' } });
    for (const a of Object.values(s.actores)) npcs.retirar(a.refId);
  }
  const mara = npcs.introducir({ nombre: 'Mara', rol: 'contrabandista', genero: 'f' });
  const lugar = m.ver('world.ubicacion');

  const t1 = await m.jugar('le pregunto a Mara por el puente, le enseño la carta y si miente me voy');
  comprobar(!/te vas|te marchas/i.test(t1) && m.ver('world.ubicacion') === lugar, 'lo condicional no se ejecuta: no se va', t1);
  comprobar(/Queda en el aire lo que harás si miente/.test(t1), 'y se le devuelve la palabra con la condición pendiente', t1);
  comprobar(/\bel puente\b/i.test(t1) && !/puente y le enseño/.test(t1), 'la respuesta trata de lo que preguntó', t1);

  const objetos = () => Object.keys(m.ver('inventory.objetos.porId', {}) ?? {}).length;
  const antes = objetos();
  const t2 = await m.jugar('Le digo a Mara: «No os entregaré la llave». Luego espero');
  comprobar(t2.includes('«No os entregaré la llave»'), 'la negativa se narra con sus palabras exactas', t2);
  comprobar(objetos() === antes && !/le das|le entregas|entregas la llave/i.test(t2), 'no entrega nada', t2);
  comprobar(/Mara/.test(t2) && !/¿En qué te ayudo\?|Pasa, pasa/.test(t2), 'Mara reacciona a la negativa, no con un saludo de catálogo', t2);
  comprobar((m.ver(`npcs.conocidos.porId.${mara.refId}.memoria`, []) ?? []).some((r) => r.tipo === 'negativa'), 'Mara lo recuerda');

  const t3 = await m.jugar('ayudo al carretero a levantar el carro');
  comprobar(/No has visto a ningún carretero|El carretero, \p{Lu}\p{L}+, ya se ha ido/u.test(t3) && !/Ayudas al carretero/.test(t3), 'lo que se hace con alguien que no está no se narra como hecho', t3);

  // Diez turnos después, y tras guardar y cargar, Mara sigue acordándose.
  for (let i = 0; i < 9; i += 1) await m.jugar(['miro alrededor', 'compruebo mi equipo', 'escucho la calle'][i % 3]);
  await m.guardarYCargar();
  const t12 = await m.jugar('le pregunto a Mara por el puerto');
  comprobar(m.ver('meta.turno') >= 12 && t12.includes('«No os entregaré la llave»'),
    'en el turno 12 y tras guardar y cargar, Mara recuerda la negativa con sus palabras', t12);
  comprobar(m.ver(`npcs.conocidos.porId.${mara.refId}.nombre`) === 'Mara', 'sin cambiarle el nombre');
}

{
  await nuevaPartida({ ...FICHA, lore: '' });
  const npcs = m.sistema('npcs');
  const nera = npcs.introducir({ nombre: 'Nera', rol: 'cazadora', genero: 'f' });
  npcs.introducir({ nombre: 'Mara', rol: 'contrabandista', genero: 'f' });
  fijarDado(true);
  m.sistema('party').reclutar(m.ver(`npcs.conocidos.porId.${nera.refId}`));

  const t = await m.jugar('Que mi compañera negocie con Mara; yo observo');
  comprobar(/Dejas que Nera negocie con Mara/.test(t) && /Nera/.test(t.split('\n')[1] ?? ''), 'actúa la compañera y él observa', t);
  comprobar(!/(le )?ofreces|propones|le dices/i.test(t), 'no se inventa una oferta ni palabras del jugador', t);
}

/* ── 5. Los encargos nacen del mundo, y se aceptan o no ─────────────────── */

{
  await nuevaPartida({ ...FICHA, lore: HISTORIA });
  const quests = m.sistema('quests');
  const npcs = m.sistema('npcs');
  const tobal = npcs.introducir({ nombre: 'Tobal', rol: 'molinero', genero: 'm' });

  const oferta = quests.generarOferta({ npc: m.ver(`npcs.conocidos.porId.${tobal.refId}`) });
  comprobar(oferta && quests.ofrecidas().length === 1 && !quests.activas().length, 'lo que ofrece alguien es una oferta, no una misión aceptada',
    JSON.stringify(quests.inspeccionar?.() ?? {}));
  const t1 = await m.jugar('no me interesa');
  comprobar(!quests.ofrecidas().length && !quests.activas().length, 'se puede rechazar con palabras', t1);
  comprobar(/Tobal/.test(t1) && /sin dueño/.test(t1), 'y el mundo lo toma sin castigo', t1);
  comprobar((m.ver(`npcs.conocidos.porId.${tobal.refId}.memoria`, []) ?? []).length > 0, 'Tobal recuerda que le dijeron que no');

  quests.generarOferta({ npc: m.ver(`npcs.conocidos.porId.${tobal.refId}`) });
  const t2 = await m.jugar('acepto el encargo');
  comprobar(quests.activas().length === 1 && /Trato hecho|trato hecho/.test(t2), 'o aceptarlo, y entonces es un compromiso', t2);

  const t3 = await m.jugar('me propongo averiguar quién quemó la forja de mi padre');
  const meta = quests.activas().find((q) => q.tipo === 'meta');
  comprobar(meta && /forja/.test(JSON.stringify(meta)), 'un objetivo propio lo marca el jugador, no el juego', JSON.stringify(meta));
  // La primera línea es el eco del jugador, con su «mi padre».
  comprobar(/tu padre/.test(t3) && !/mi padre/.test(t3.split('\n').slice(1).join(' ')), 'y se le devuelve en segunda persona', t3);
  await m.guardarYCargar();
  comprobar(m.sistema('quests').activas().some((q) => q.tipo === 'meta'), 'el objetivo propio sobrevive a guardar y cargar');
}

/* ── 6. Un enfrentamiento se puede hablar, esquivar o pelear ────────────── */

const esperar = async (cond, ms = 4000) => {
  const t0 = Date.now();
  while (!cond() && Date.now() - t0 < ms) await new Promise((r) => setTimeout(r, 20));
  return cond();
};

/** Monta un encuentro concreto sin pasar por el azar de las tablas. */
async function encuentro(refId = 'patrulla_hostil') {
  await nuevaPartida({ ...FICHA, lore: '' });
  m.sistema('exploration')._presentar(obtenerEncuentro(refId));
}

{
  await encuentro();
  fijarDado(true);
  const t = await m.jugar('les hablo con calma: solo estoy de paso y no busco problemas');
  comprobar(!m.ver('combat.activo') && !m.sistema('exploration').encuentroPendiente(), 'hablar bien con la patrulla la resuelve sin pelea', t);
}

{
  await encuentro();
  fijarDado(false);
  const t1 = await m.jugar('les hablo con calma: solo estoy de paso y no busco problemas');
  comprobar(!m.ver('combat.activo') && m.sistema('exploration').encuentroPendiente(), 'un mal intento de hablar tensa la cosa, pero aún no es pelea', t1);
  fijarDado(false);
  const t2 = await m.jugar('insisto en que no he hecho nada');
  comprobar(m.ver('combat.activo'), 'al segundo fallo se acaba la paciencia y hay pelea', t2);
}

{
  await encuentro();
  fijarDado(true);
  const t = await m.jugar('huyo por el callejón');
  comprobar(!m.ver('combat.activo') && !m.sistema('exploration').encuentroPendiente(), 'se puede huir', t);
}

{
  await encuentro();
  const t1 = await m.jugar('miro los tejados');
  comprobar(!m.ver('combat.activo'), 'ignorar a la patrulla una vez no es pelear', t1);
  const t2 = await m.jugar('sigo mirando los tejados');
  comprobar(m.ver('combat.activo'), 'pero una patrulla hostil no se queda esperando', t2);
}

{
  await encuentro();
  const t = await m.jugar('ataco al primer guardia');
  comprobar(m.ver('combat.activo') && await esperar(() => m.sistema('combat').esperandoJugador), 'atacar primero es pelear, y con la iniciativa', t);

  // Hablar en mitad de la pelea.
  const antes = m.entradas().length;
  fijarDado(true);
  await m.sistema('combat').jugadaLibre('bajad las armas, os ofrezco una tregua');
  await esperar(() => !m.ver('combat.activo'));
  const dicho = m.entradas().slice(antes).map((e) => e.texto).join('\n');
  comprobar(!m.ver('combat.activo') && /Te escuchan/.test(dicho) && /nadie más va a sangrar/.test(dicho),
    'con quien atiende a razones, una tregua bien dicha para la pelea sin más muertos', dicho);
}

{
  await encuentro();
  await m.jugar('ataco al primer guardia');
  await esperar(() => m.sistema('combat').esperandoJugador);
  const antes = m.entradas().length;
  fijarDado(false);
  await m.sistema('combat').jugadaLibre('me rindo, no quiero pelear');
  await esperar(() => m.sistema('combat').esperandoJugador || !m.ver('combat.activo'));
  const dicho = m.entradas().slice(antes).map((e) => e.texto).join('\n');
  comprobar(m.ver('combat.activo') && /No quieren saber nada/.test(dicho), 'si no convence, la pelea sigue y el turno se ha ido hablando', dicho);
}

{
  await encuentro('manada_hambrienta');
  await m.jugar('ataco al lobo más cercano');
  await esperar(() => m.sistema('combat').esperandoJugador);
  const antes = m.entradas().length;
  await m.sistema('combat').jugadaLibre('les hablo despacio, no quiero pelear');
  await esperar(() => m.sistema('combat').esperandoJugador || !m.ver('combat.activo'));
  const dicho = m.entradas().slice(antes).map((e) => e.texto).join('\n');
  comprobar(/No hay con quién hablar/.test(dicho), 'con bestias no hay con quién parlamentar, y se dice', dicho);
}

/* ── 7. Cada narrador dice lo que es, y el prompt separa las cosas ───────── */

{
  const sistemaPrompt = Prompt.sistema();
  comprobar(['CANON', 'POSIBILIDAD', 'INTENCIÓN', 'RESULTADO'].every((k) => sistemaPrompt.includes(`· ${k}:`)),
    'el prompt distingue canon, posibilidad, intención y resultado');
  comprobar(/OPCIONALES/.test(sistemaPrompt), 'y declara opcionales las sugerencias');
  comprobar(/intención, no hecho/.test(Prompt.turno({ accion: 'lo mato', contextoTexto: '' })), 'lo que escribe el jugador va como intención, no como hecho');

  await nuevaPartida({ ...FICHA, lore: '' });
  const { texto: contexto } = new ContextComposer({ store: m.store, registry: m.registry, memoria: m.sistema('turns').memoria })
    .componer({ accion: 'lo mato' });
  comprobar(!/HA DECIDIDO/.test(contexto) && /intención, no hecho/.test(contexto), 'también en el contexto compuesto', contexto.slice(0, 300));

  const interno = paraInterfaz({}).find((p) => p.id === 'procedural');
  comprobar(interno?.limite && /plantillas/.test(interno.limite) && /Puente manual o una IA/.test(interno.limite),
    'el director interno dice su techo al elegirlo', interno?.limite);
}

/* ── 8. Lo que destapó la partida de prueba de catorce turnos ────────────── */

{
  const cond = segmentar('si el herrero me sigue mirando, me voy al puente');
  comprobar(cond.length === 1 && cond[0].condicion === 'el herrero me sigue mirando' && cond[0].consecuencia === 'me voy al puente',
    'con la coma del jugador, la condición acaba en la coma («herrero» no es un verbo)', JSON.stringify(cond));
  comprobar(ordenar(segmentar('me acerco al herrero y le pregunto por el paso del norte')).foco?.texto === 'le pregunto por el paso del norte',
    'si acercarse solo prepara la pregunta, el foco es la pregunta');
  comprobar(ordenar(segmentar('abro la puerta y le pregunto quién es')).foco?.texto === 'abro la puerta', 'pero una acción de verdad sigue siendo el foco');
}

{
  await nuevaPartida({ ...FICHA, lore: '' });
  const situaciones = m.sistema('situations');
  for (const s of situaciones.aqui()) m.store.dispatch('situaciones/guardar', { situacion: { ...s, estado: 'desenlace' } });
  const sit = situaciones.abrir({ refId: 'encapuchado_vigila' });
  m.sistema('npcs').introducir({ nombre: 'Vervek', rol: 'herrero', genero: 'm' });

  const presentesAntes = [...m.ver('npcs.presentes', [])].sort().join();
  const t1 = await m.jugar('si el herrero me sigue mirando, me voy al puente');
  comprobar([...m.ver('npcs.presentes', [])].sort().join() === presentesAntes && !/^Te vas al puente/m.test(t1),
    'una condición sola no mueve al personaje', t1);
  comprobar(/si el herrero te sigue mirando\./.test(t1), 'y lo pendiente se le devuelve en segunda persona', t1);

  const t2 = await m.jugar('Ignoro al encapuchado; me acerco al herrero y le pregunto por el paso del norte');
  comprobar(!/Desde aquí se ve mejor/.test(t2) && situaciones.todas().find((s) => s.id === sit.id).ignoradaAProposito,
    'acercarse al herrero no es atender lo que acaba de ignorar', t2);
  // En el lugar puede haber ya un herrero: contesta el que esté, pero contesta.
  const respuesta = t2.split('\n').slice(2).join(' ');
  // Con el nombre del jugador o con el del mapa: «el paso del norte» es el
  // Paso del Yunque, y lo que cuenta tiene que ser de ese paso.
  comprobar(/«[^»]*(?:paso del norte|Paso del Yunque)[^»]*»/i.test(respuesta) && !/hierro/.test(respuesta),
    'y el herrero contesta a lo que se le pregunta, sin irse a otra cosa', t2);

  const rolls = [];
  m.bus.on('rules:roll', (t) => rolls.push(t));
  await m.jugar('compro pan en el puesto');
  comprobar(!rolls.length, 'comprar pan no se tira', JSON.stringify(rolls.map((r) => r.habilidad)));

  fijarDado(false);
  const t3 = await m.jugar('intento trepar al tejado donde estaba el encapuchado');
  const fallo = resultadosDe('fracaso', categoriaDe('atletismo')).concat(resultadosDe('fracasoGrave', categoriaDe('atletismo')));
  comprobar(!/No hay ningún encapuchado/.test(t3) && fallo.some((f) => t3.includes(f)), 'trepar al tejado donde estaba alguien se intenta, y se cuenta cómo sale', t3);

  // El robo pasa sin el jugador: el vigía se va y el mercader lo cuenta si se le pregunta.
  for (let i = 0; i < 6; i += 1) await m.jugar('miro el río');
  comprobar(situaciones.todas().find((s) => s.id === sit.id).estado === 'desenlace', 'el robo ocurre a su ritmo');
  comprobar(!m.ver('npcs.presentes', []).includes(sit.actores.vigia.refId), 'quien se ha ido ya no está en escena');
  await m.guardarYCargar();
  const t4 = await m.jugar(`le pregunto a ${sit.actores.mercader.nombre} qué le ha pasado`);
  comprobar(/Me han quitado la bolsa/.test(t4), 'preguntado qué le ha pasado, el mercader cuenta el robo, también tras guardar y cargar', t4);
}

console.log(`\n${fallos ? `${fallos} fallos.` : 'Todo correcto.'}`);
process.exit(fallos ? 1 : 0);
