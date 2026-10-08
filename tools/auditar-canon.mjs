/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCANVEIL · tools/auditar-canon.mjs
 * ---------------------------------------------------------------------------
 * El canon del jugador no se pierde, no se adivina y lo que no cabe se dice.
 *
 * Tres bloques:
 *   1. Registro y proyección: muchas ediciones, muchas entidades, historia
 *      larga, lo pertinente primero, nada cortado a medias.
 *   2. Hechos atómicos: frases compuestas, cambiar un solo atributo,
 *      correcciones de dos atributos, homónimos, negaciones, preguntas,
 *      conflictos, sin sujeto, quién muere de verdad, más de 50 entradas,
 *      migración, guardar/cargar y textos que no son canon.
 *   3. En el motor: ediciones, guardar/cargar, una IA simulada que
 *      contradice el canon y el límite de la capa gratuita.
 *
 * Las comprobaciones miran lo que se VE (lo que vale, lo que se proyecta,
 * quién está muerto, lo que se le dice al jugador), así que el mismo fichero
 * corre contra versiones anteriores de `Canon.js` para ver qué fallaba.
 *
 *   node tools/auditar-canon.mjs
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { crearMotor } from './motor-sin-ventana.mjs';
import { MemoryStore } from '../src/ai/MemoryStore.js';
import * as Canon from '../src/ai/narrador/Canon.js';
import { filtrarModelo } from '../src/ai/narrador/FiltroModelo.js';
import { importarHistoria } from '../src/ai/Importar.js';
import { POLITICA } from '../src/ai/PromptBuilder.js';
import { LIMITES_LOCALES } from './groq-proxy.mjs';
import { PRESUPUESTO } from '../src/ai/narrador/Instantanea.js';

let fallos = 0;
let casos = 0;
function comprobar(bien, texto, detalle = '') {
  casos += 1;
  if (bien) console.log(`OK   ${texto}`);
  else {
    fallos += 1;
    console.log(`MAL  ${texto}`);
    if (detalle) console.log(`     ${String(detalle).replace(/\n/g, ' | ').slice(0, 700)}`);
  }
}
/** Un caso que, si revienta, cuenta como fallo y no para la auditoría. */
async function caso(texto, fn) {
  try {
    const [bien, detalle] = await fn();
    comprobar(bien, texto, detalle);
  } catch (err) {
    comprobar(false, texto, `revienta: ${err.message}`);
  }
}

// Lo que vale, sea cual sea la forma del registro.
const vale = (r) => (Canon.vigentes ? Canon.vigentes(r).map((h) => h.texto) : (r.entradas ?? []).filter((e) => e.vigente).map((e) => e.texto));
const todo = (r) => vale(r).join(' ');
const serie = (textos, op = {}) => textos.reduce((r, t) => Canon.anotar(r, t, { turno: 1, ...op }).registro, Canon.crearRegistro());
const enviado = (fuentes, op = {}) => Canon.proyectar(fuentes, op).entradas.map((e) => e.texto).join(' ');
const mensaje = (res) => (Canon.mensajeDeEdicion ? Canon.mensajeDeEdicion(res) : '');

const NOMBRES = ['Aldo', 'Berin', 'Cessa', 'Dorne', 'Elva', 'Fiorn', 'Gadea', 'Hurel', 'Isna', 'Jorve', 'Kaela', 'Lusio', 'Mirte', 'Nolan', 'Orfa', 'Pelio', 'Quira', 'Rodel', 'Sibra', 'Tamer', 'Ulda', 'Varo', 'Wena', 'Xabe', 'Yerma', 'Zoril', 'Aroa', 'Bruma', 'Cirio', 'Dafne'];
const LORE = [
  'Nací en Pozoalto, un pueblo de mineros al pie de la sierra.',
  'Mi madre, Tessa, curaba fiebres con cortezas y no quería que yo bajara a la mina.',
  'A los doce años bajé igual, y a los trece vi hundirse la galería norte con mi tío Brando dentro.',
  ...Array.from({ length: 30 }, (_, i) => `Aprendí de ${NOMBRES[i]} el oficio número ${i + 1}, que consistía en guardar un secreto distinto de la cofradía de Pozoalto durante un invierno entero.`),
  'Juré a mi madre que volvería con la llave de hierro que se llevó el capataz Orvel.',
].join(' ');

/* ═══════════════════════════════════════════════════════════════════════════
   1. REGISTRO Y PROYECCIÓN
   ═══════════════════════════════════════════════════════════════════════════ */

console.log('\n── Registro y proyección ──');
{
  const frases = Array.from({ length: 30 }, (_, i) => `${NOMBRES[i]} guarda la llave número ${i + 1} de la cofradía y nunca la presta`);
  const r = serie(frases);
  await caso('treinta ediciones distintas: las treinta valen', () => [frases.every((f) => todo(r).includes(f.split(' y ')[0])), vale(r).length]);

  const p = Canon.proyectar({ registro: r, lore: LORE, entidades: [] }, { texto: 'le pregunto a Tamer por su llave', presupuesto: 2400 });
  const env = p.entradas.map((e) => e.texto).join(' ');
  await caso('si no cabe, la proyección dice cuántas se quedan fuera y cuáles', () => [!p.completa && p.omitidas.length > 0 && p.omitidas.length + p.entradas.length === p.total, `${p.entradas.length} + ${p.omitidas.length} de ${p.total}`]);
  await caso('lo pertinente (lo que nombra el jugador) entra primero', () => [env.includes('Tamer guarda la llave número 20'), env.slice(0, 200)]);
  await caso(`y cabe en el presupuesto (${JSON.stringify(p.entradas).length} de 2400 caracteres)`, () => [JSON.stringify(p.entradas).length <= 2400]);

  const entidades = NOMBRES.slice(0, 14).map((n, i) => ({ nombre: n, tipo: 'persona', rasgos: ['viejo', 'tuerto'], notas: [`nota una de ${n}`, `nota dos de ${n}, la que se perdía`], turno: i, menciones: 1 }));
  const pe = Canon.proyectar({ registro: Canon.crearRegistro(), lore: '', entidades }, { texto: 'miro alrededor', presupuesto: 4000 });
  await caso('catorce entidades con todas sus notas', () => [pe.entradas.length === 14 && pe.entradas.every((e) => /nota dos de/.test(e.texto)), pe.entradas.length]);

  const largo = Canon.proyectar({ registro: Canon.crearRegistro(), lore: LORE, entidades: [] }, { texto: 'pienso en mi madre Tessa y en la llave del capataz Orvel', presupuesto: 1200 });
  const fr = largo.entradas.map((e) => e.texto);
  await caso('una historia larga va por frases enteras: las pertinentes dentro y las demás listadas', () => [fr.some((f) => /Tessa/.test(f)) && fr.some((f) => /Orvel/.test(f)) && largo.omitidas.length > 0, fr.join(' / ').slice(0, 300)]);

  const mucho = new MemoryStore();
  for (let i = 0; i < 120; i += 1) mucho.registrarCanon({ nombre: `Persona${i}`, tipo: 'persona', rasgos: [] }, i);
  await caso('las entidades nombradas no se podan', () => [mucho.canon.length === 120, mucho.canon.length]);

  const filtro = await filtrarModelo({
    resultado: { proveedor: 'groq', respuesta: { story: 'El viento sopla desde la sierra.\nAldo: «Hermana, estoy aquí.»\nUna campana suena lejos.', choices: [] } },
    peticion: { accion: 'miro la sierra', instantanea: { jugador: { escribe: 'miro la sierra' }, yaContado: [], memoria: { canon: [] } }, canonMuertos: ['Aldo'] },
    leer: (ruta, d) => d,
    permitirReparacion: false,
  });
  await caso('sin canon en la petición, un muerto según el canon entero sigue sin hablar', () => [!/Aldo/.test(filtro.respuesta?.story ?? '') && /campana/.test(filtro.respuesta?.story ?? ''), filtro.respuesta?.story]);
}

/* ═══════════════════════════════════════════════════════════════════════════
   2. HECHOS ATÓMICOS
   ═══════════════════════════════════════════════════════════════════════════ */

console.log('\n── Hechos atómicos: corregir una cosa no borra las demás ──');
{
  // El caso exacto que perdía hechos en silencio.
  let r = Canon.crearRegistro();
  r = Canon.anotar(r, 'Aldo es mi hermano y murió en Saucedo.', { turno: 3 }).registro;
  const tras1 = Canon.anotar(r, 'Aldo está vivo.', { turno: 4 });
  r = tras1.registro;
  await caso('«Aldo está vivo» revisa SOLO la vida: sigue siendo su hermano y se conserva Saucedo', () => [/hermano/.test(todo(r)) && /Saucedo/.test(todo(r)) && /vivo/.test(todo(r)) && !vale(r).some((t) => /^Aldo murió/.test(t)), vale(r).join(' | ')]);
  await caso('el jugador ve qué se sustituye y qué sigue valiendo', () => [/sustituye a «Aldo murió en Saucedo\.»/.test(mensaje(tras1)) && /Sigue valiendo: «Aldo es mi hermano\.»/.test(mensaje(tras1)), mensaje(tras1)]);
  r = Canon.anotar(r, 'Aldo vive en Norte.', { turno: 5 }).registro;
  await caso('«Aldo vive en Norte» añade el paradero: vivo, hermano y Saucedo siguen', () => [/hermano/.test(todo(r)) && /Saucedo/.test(todo(r)) && /está vivo/.test(todo(r)) && /Norte/.test(todo(r)), vale(r).join(' | ')]);
  const env = enviado({ registro: r }, { texto: 'pienso en Aldo' });
  await caso('la proyección lleva el conjunto vigente entero de Aldo, junto', () => [/hermano/.test(env) && /vivo/.test(env) && /Saucedo/.test(env) && /Norte/.test(env) && Canon.proyectar({ registro: r }, { texto: 'pienso en Aldo' }).entradas.length === 1, env]);
  await caso('y el verificador no lo da por muerto', () => [Canon.muertosSegunCanon({ registro: r }).length === 0, Canon.muertosSegunCanon({ registro: r })]);
  await caso('[nuevo] cada hecho guarda su versión y su procedencia (edición, turno, fuente)', () => {
    const vida = Canon.vigentes(r).find((h) => h.predicado === 'vida');
    const vieja = r.hechos.find((h) => h.id === vida.sustituye[0]);
    return [vida.version === 2 && vieja && !vieja.vigente && vieja.turno === 3 && vida.turno === 4 && vida.fuente === 'jugador' && r.ediciones.length === 3 && r.ediciones[0].texto === 'Aldo es mi hermano y murió en Saucedo.', JSON.stringify(vida)];
  });

  const mismo = serie(['Aldo vive en Saucedo y su hermano vive en Norte.']);
  await caso('misma familia, sujetos distintos: «Aldo vive en Saucedo y su hermano vive en Norte» guarda las dos', () => [/Aldo vive en Saucedo/.test(todo(mismo)) && /hermano de Aldo vive en Norte/.test(todo(mismo)), vale(mismo).join(' | ')]);

  const compuesta = serie(['Tessa es mi madre, murió en Pozoalto y era curandera.']);
  await caso('relación + vida + lugar + rasgo en una frase: todo guardado, por separado', () => [/madre/.test(todo(compuesta)) && /murió en Pozoalto/.test(todo(compuesta)) && /curandera/.test(todo(compuesta)) && vale(compuesta).length >= 3, vale(compuesta).join(' | ')]);

  const uno = serie(['Aldo es mi hermano, vive en Saucedo y es herrero.', 'Aldo vive en Norte.']);
  await caso('cambiar un solo atributo (el paradero) no toca la relación ni el oficio', () => [/hermano/.test(todo(uno)) && /herrero/.test(todo(uno)) && /Norte/.test(todo(uno)) && !/vive en Saucedo/.test(todo(uno)), vale(uno).join(' | ')]);

  const dos = Canon.anotar(serie(['Aldo es mi hermano, murió en Saucedo y era herrero.']), 'Corrijo: Aldo es mi primo y está preso en Norte.');
  await caso('corrección explícita de dos atributos: cambian relación y vida/paradero, el oficio sigue', () => [/primo/.test(todo(dos.registro)) && !/hermano/.test(todo(dos.registro)) && /preso en Norte/.test(todo(dos.registro)) && /herrero/.test(todo(dos.registro)) && Canon.muertosSegunCanon({ registro: dos.registro }).length === 0, vale(dos.registro).join(' | ')]);
}

console.log('\n── No se adivina: sin sujeto, homónimos, preguntas ──');
{
  const base = serie(['Mi hermano Aldo murió en la guerra.']);
  const sin = Canon.anotar(base, 'Ahora está vivo.');
  await caso('sin sujeto («Ahora está vivo») no sustituye nada: Aldo sigue muerto', () => [Canon.muertosSegunCanon({ registro: sin.registro }).includes('Aldo') && !/está vivo/.test(todo(sin.registro)), vale(sin.registro).join(' | ')]);
  await caso('[nuevo] y se le pregunta al jugador de quién habla', () => [/no dice de quién/.test(mensaje(sin)) && /Aldo/.test(mensaje(sin)), mensaje(sin)]);

  let h = serie(['Aldo el herrero murió en Saucedo.', 'Aldo el guardia vive en Norte.']);
  const amb = Canon.anotar(h, 'Aldo está vivo.');
  await caso('dos Aldo: «Aldo está vivo» no revisa ninguno', () => [/herrero murió en Saucedo/.test(todo(amb.registro)) && !vale(amb.registro).some((t) => /^Aldo está vivo/.test(t)), vale(amb.registro).join(' | ')]);
  await caso('[nuevo] y pide cuál', () => [/más de uno con ese nombre/.test(mensaje(amb)), mensaje(amb)]);
  h = Canon.anotar(amb.registro, 'Aldo el herrero está vivo.').registro;
  await caso('nombrando cuál, se revisa ese y el otro no se toca', () => [/herrero está vivo/.test(todo(h)) && /guardia vive en Norte/.test(todo(h)), vale(h).join(' | ')]);
  await caso('con homónimos, el verificador solo bloquea el nombre si todos los que lo llevan están muertos', () => {
    const uno = serie(['Aldo el herrero murió en Saucedo.', 'Aldo el guardia vive en Norte.']);
    const ambos = serie(['Aldo el herrero murió en Saucedo.', 'Aldo el guardia murió en Norte.']);
    return [Canon.muertosSegunCanon({ registro: uno }).length === 0 && Canon.muertosSegunCanon({ registro: ambos }).includes('Aldo'), `${Canon.muertosSegunCanon({ registro: uno })} / ${Canon.muertosSegunCanon({ registro: ambos })}`];
  });

  for (const pregunta of ['¿Y si Aldo estuviera vivo?', 'Quizá Aldo está vivo.', 'Si Aldo vuelve, está vivo.', '¿Aldo está vivo?']) {
    const res = Canon.anotar(base, pregunta);
    await caso(`una pregunta o hipótesis no cambia el canon: «${pregunta}»`, () => [Canon.muertosSegunCanon({ registro: res.registro }).includes('Aldo') && !vale(res.registro).some((t) => /vivo/.test(t)), vale(res.registro).join(' | ')]);
  }
  const rumor = Canon.anotar(Canon.crearRegistro(), 'Dicen que Berin murió en Saucedo.');
  await caso('un rumor se guarda como rumor y no mata a nadie', () => [/Dicen que Berin/.test(todo(rumor.registro)) && Canon.muertosSegunCanon({ registro: rumor.registro }).length === 0, `${vale(rumor.registro)} / ${Canon.muertosSegunCanon({ registro: rumor.registro })}`]);
}

console.log('\n── Negaciones ──');
{
  const neg = serie(['Aldo es un traidor.', 'Aldo no es un traidor.']);
  await caso('«Aldo no es un traidor» retira ese rasgo concreto', () => [vale(neg).every((t) => !/^Aldo es un traidor/.test(t)) && /no es un traidor/.test(todo(neg)), vale(neg).join(' | ')]);
  const vivo = serie(['Aldo murió en Saucedo.', 'Aldo no murió.']);
  await caso('«Aldo no murió» es una corrección de la vida', () => [Canon.muertosSegunCanon({ registro: vivo }).length === 0, vale(vivo).join(' | ')]);
  const llave = serie(['Tengo la llave de hierro y un mapa de la sierra.', 'Perdí la llave.']);
  await caso('«Perdí la llave» retira la llave, no el mapa', () => [!vale(llave).some((t) => /^Tengo la llave/.test(t)) && /mapa/.test(todo(llave)), vale(llave).join(' | ')]);
  const dosLlaves = Canon.anotar(serie(['Tengo la llave de hierro.', 'Tengo la llave del faro.']), 'Perdí la llave.');
  await caso('[nuevo] con dos llaves, «perdí la llave» no adivina cuál y lo pregunta', () => [vale(dosLlaves.registro).filter((t) => /^Tengo la llave/.test(t)).length === 2 && /varias cosas así/.test(mensaje(dosLlaves)), `${vale(dosLlaves.registro)} / ${mensaje(dosLlaves)}`]);
  const paradero = serie(['Aldo vive en Saucedo.', 'Aldo ya no vive en Saucedo.']);
  await caso('«ya no vive en Saucedo» retira ese paradero', () => [!vale(paradero).some((t) => /^Aldo vive en Saucedo/.test(t)), vale(paradero).join(' | ')]);
}

console.log('\n── Canon en conflicto ──');
{
  const res = Canon.anotar(serie(['Aldo murió en Saucedo.']), 'Aldo vive en Norte.');
  await caso('una contradicción indirecta no borra: se guardan las dos', () => [/murió en Saucedo/.test(todo(res.registro)) && /vive en Norte/.test(todo(res.registro)), vale(res.registro).join(' | ')]);
  await caso('[nuevo] se marca el conflicto y se le dice al jugador cómo aclararlo', () => [/choca con el canon/.test(mensaje(res)) && /canon: Aldo está vivo/.test(mensaje(res)), mensaje(res)]);
  const p = Canon.proyectar({ registro: res.registro }, { texto: 'busco a Aldo' });
  await caso('[nuevo] la proyección lo lleva como conflicto sin resolver (vale: null)', () => [p.conflictos.some((c) => c.vale === null && c.versiones.length === 2) && /EN CONFLICTO/.test(p.entradas.map((e) => e.texto).join(' ')), JSON.stringify(p.conflictos)]);
  await caso('[nuevo] con la vida en duda, el verificador no lo trata como muerto', () => [Canon.muertosSegunCanon({ registro: res.registro }).length === 0, Canon.muertosSegunCanon({ registro: res.registro })]);
  const aclarado = Canon.anotar(res.registro, 'Aldo sigue muerto.');
  await caso('al aclararlo se cierra el conflicto y vale lo dicho', () => [Canon.proyectar({ registro: aclarado.registro }).conflictos.length === 0 && Canon.muertosSegunCanon({ registro: aclarado.registro }).includes('Aldo'), JSON.stringify(Canon.proyectar({ registro: aclarado.registro }).conflictos)]);
  const corrige = serie(['Aldo murió en Saucedo.', 'En realidad Aldo vive en Norte.']);
  await caso('con marca de corrección («en realidad») sí revisa, y conserva dónde se contó la muerte', () => [Canon.muertosSegunCanon({ registro: corrige }).length === 0 && /Saucedo/.test(todo(corrige)) && Canon.proyectar({ registro: corrige }).conflictos.length === 0, vale(corrige).join(' | ')]);
  const historia = Canon.proyectar({ registro: serie(['Aldo sigue vivo.']), lore: 'Mi hermano Aldo murió cruzando el paso.' }, { texto: 'pienso en Aldo' });
  await caso('una edición frente a la historia del personaje: vale la edición y se dice', () => [historia.conflictos.some((c) => /sigue vivo/.test(c.vale ?? '')), JSON.stringify(historia.conflictos)]);
  await caso('y lo último manda: Aldo ya no está muerto aunque la historia lo diga', () => [Canon.muertosSegunCanon({ registro: serie(['Aldo sigue vivo.']), lore: 'Mi hermano Aldo murió cruzando el paso.' }).length === 0]);
}

console.log('\n── Quién está muerto: solo el sujeto correcto y lo vigente ──');
{
  const m = (textos, extra = {}) => Canon.muertosSegunCanon({ registro: serie(textos), ...extra });
  await caso('«Aldo mató a Berin, que murió en Saucedo»: muere Berin, no Aldo ni Saucedo', () => { const x = m(['Aldo mató a Berin, que murió en Saucedo.']); return [x.length === 1 && x[0] === 'Berin', x]; });
  await caso('dos frases con varios nombres: solo muere el sujeto de «murió»', () => { const x = m(['Aldo lloró por Berin.', 'Cessa murió en Norte.']); return [x.length === 1 && x[0] === 'Cessa', x]; });
  await caso('en la historia, «mi madre Tessa murió; mi tío Brando la enterró en Pozoalto» solo mata a Tessa', () => { const x = Canon.muertosSegunCanon({ lore: 'Mi madre Tessa murió de fiebres. Mi tío Brando la enterró en Pozoalto.' }); return [x.length === 1 && x[0] === 'Tessa', x]; });
  await caso('muerto y luego vivo: vale lo vigente', () => { const x = m(['Aldo murió en Saucedo.', 'Aldo está vivo.']); return [x.length === 0, x]; });
  await caso('«Aldo y Berin murieron en Saucedo»: los dos, y Saucedo no', () => { const x = m(['Aldo y Berin murieron en Saucedo.']); return [x.includes('Aldo') && x.includes('Berin') && !x.includes('Saucedo'), x]; });
  await caso('las notas de una entidad hablan de ella, no de quien nombran', () => { const x = Canon.muertosSegunCanon({ entidades: [{ nombre: 'Orvel', notas: ['Vio morir a Tamer en la mina.', 'Murió en la galería norte.'] }] }); return [x.length === 1 && x[0] === 'Orvel', x]; });
}

console.log('\n── Más de 50 entradas ──');
{
  const textos = [];
  for (let i = 0; i < 60; i += 1) {
    const n = `${NOMBRES[i % 30]}${i >= 30 ? 'ra' : ''}`;
    textos.push(`${n} es mi ${i % 2 ? 'prima' : 'primo'}, vive en Villa${i} y guarda el sello ${i}.`);
    if (i % 10 === 0) textos.push(`${n} murió en Villa${i}.`);
  }
  const r = serie(textos);
  const p = Canon.proyectar({ registro: r }, { texto: 'pregunto por Tamer', presupuesto: 2400 });
  await caso(`sesenta sujetos: nada se pierde del registro (${vale(r).length} hechos vigentes)`, () => [vale(r).length >= 180, vale(r).length]);
  await caso('la proyección cabe, lista lo omitido y nunca parte a un sujeto', () => {
    const porSujeto = p.entradas.filter((e) => e.id.startsWith('canon-'));
    const partido = porSujeto.some((e) => { const x = e.texto.match(/Villa(\d+)/)?.[1]; return x && !new RegExp(`sello ${x}\\b`).test(e.texto); });
    return [!p.completa && JSON.stringify(p.entradas).length <= 2400 && p.omitidas.length > 0 && !partido, `${p.entradas.length} enviados, ${p.omitidas.length} omitidos`];
  });
  await caso('el verificador conoce los seis muertos aunque no quepan en la petición', () => { const x = Canon.muertosSegunCanon({ registro: r }); return [x.length === 6, x]; });
}

console.log('\n── Guardar, cargar y migrar ──');
{
  const r = serie(['Aldo es mi hermano y murió en Saucedo.', 'Aldo está vivo.', 'Aldo vive en Norte.']);
  const mem = new MemoryStore({ registroCanon: r });
  const cargada = MemoryStore.restaurar(JSON.parse(JSON.stringify(mem.serializar())));
  await caso('guardar y cargar conserva hechos, versiones y ediciones', () => [JSON.stringify(Canon.vigentes ? Canon.vigentes(cargada.registroCanon) : []) === JSON.stringify(Canon.vigentes ? Canon.vigentes(r) : [1]) && cargada.registroCanon.ediciones?.length === 3, vale(cargada.registroCanon).join(' | ')]);

  // Un registro de la versión 1 tal como lo dejaba la sustitución entera.
  const v1 = { version: 1, entradas: [
    { id: 'canon-3-mf0abc-0', sujeto: 'aldo', familia: ['vida', 'paradero'], texto: 'Aldo vive en Norte.', fuente: 'jugador', turno: 5, vigente: true,
      revisiones: [{ texto: 'Aldo es mi hermano y murió en Saucedo.', turno: 3, fuente: 'jugador' }, { texto: 'Aldo está vivo.', turno: 4, fuente: 'jugador' }] },
    { id: 'canon-4-mf0abd-1', sujeto: 'berin', familia: ['posesion'], texto: 'Berin tiene la llave del faro.', fuente: 'jugador', turno: 4, vigente: true, revisiones: [] },
  ] };
  const migrada = new MemoryStore({ registroCanon: v1 }).registroCanon;
  await caso('[nuevo] migrar la v1 recupera lo que la sustitución entera había dejado de valer', () => [/hermano/.test(todo(migrada)) && /Saucedo/.test(todo(migrada)) && /vivo/.test(todo(migrada)) && /Norte/.test(todo(migrada)) && /llave del faro/.test(todo(migrada)), vale(migrada).join(' | ')]);
  await caso('[nuevo] ninguna versión de la v1 se pierde: las cuatro están en las ediciones', () => [migrada.ediciones?.length === 4 && ['Aldo es mi hermano y murió en Saucedo.', 'Aldo está vivo.', 'Aldo vive en Norte.', 'Berin tiene la llave del faro.'].every((t) => migrada.ediciones.some((e) => e.texto === t)), JSON.stringify(migrada.ediciones?.map((e) => e.texto))]);
  await caso('[nuevo] migrar dos veces no cambia nada', () => { const otra = MemoryStore.restaurar(JSON.parse(JSON.stringify({ registroCanon: migrada }))).registroCanon; return [JSON.stringify(otra.hechos) === JSON.stringify(migrada.hechos), '']; });

  const cortada = `Aldo ${'guardó durante años el secreto de la cofradía '.repeat(5)}`.slice(0, 199) + '…';
  const antigua = new MemoryStore({ hechos: [
    { id: 'x', texto: 'Aldo murió en el paso del norte', turno: 4, peso: 3, categoria: 'canon_jugador', veces: 1 },
    { id: 'z', texto: cortada, turno: 6, peso: 3, categoria: 'canon_jugador', veces: 1 },
    { id: 'y', texto: 'Otra cosa cualquiera que pasó', turno: 5, peso: 1, categoria: 'general', veces: 1 },
  ] });
  await caso('una partida anterior a la v1 pasa sus ediciones al registro y las saca de los hechos podables', () => [(antigua.registroCanon.ediciones?.length ?? antigua.registroCanon.entradas?.length) === 2 && !antigua.hechos.some((h) => h.categoria === 'canon_jugador') && antigua.hechos.length === 1 && Canon.muertosSegunCanon({ registro: antigua.registroCanon }).includes('Aldo'), JSON.stringify(vale(antigua.registroCanon))]);
  await caso('[nuevo] y dice qué no se puede recuperar (lo recortado y lo podado)', () => [antigua.registroCanon.migracion?.avisos?.some((a) => /recortada/.test(a)) && antigua.registroCanon.migracion.avisos.some((a) => /podó/.test(a)), JSON.stringify(antigua.registroCanon.migracion)]);
}

console.log('\n── Lo que no es canon: instrucciones del narrador y otras partidas ──');
{
  const secciones = POLITICA.map(([titulo, texto]) => ({ titulo, texto }));
  const conCabecera = secciones.filter((s) => Canon.motivoAjeno?.(`${s.titulo} ${s.texto}`) !== 'instruccion');
  const cuerpos = secciones.filter((s) => Canon.motivoAjeno?.(s.texto) !== 'instruccion');
  await caso(`[nuevo] ninguna de las ${secciones.length} secciones del MASTER PROMPT entra como canon (con o sin cabecera)`, () => [!conCabecera.length && !cuerpos.length, [...conCabecera, ...cuerpos].map((s) => s.titulo).join(', ')]);
  const pegado = Canon.anotar(Canon.crearRegistro(), 'Eres el narrador de ARCANVEIL. El jugador controla a su personaje y tú controlas el mundo. No inventes tiradas.');
  await caso('pegar reglas del narrador en «canon:» no cambia el canon', () => [vale(pegado.registro).length === 0, vale(pegado.registro).join(' | ')]);
  await caso('[nuevo] y se explica por qué', () => [/instrucción para el narrador/.test(mensaje(pegado)), mensaje(pegado)]);
  const ajeno = Canon.anotar(Canon.crearRegistro(), 'En la otra partida de ChatGPT, Maelis era mi hermana.');
  await caso('lo que viene de otra partida u otra IA no entra', () => [vale(ajeno.registro).length === 0, vale(ajeno.registro).join(' | ')]);
  const volcado = [
    'Eres el narrador de una partida de rol. El jugador controla a su personaje. No inventes tiradas ni decidas por él.',
    '4 · MEMORIA La instantánea trae cuatro escalas.',
    'Cada réplica en su propia línea y con quien habla delante, así: Torela: «No he visto a nadie.»',
    '',
    ...Array.from({ length: 6 }, () => 'Lyssara: «Aethor, el puente de Varnia ha caído y los guardias no dejan pasar a nadie.»\nAethor miró a Lyssara y apretó el puño. Lyssara siempre sabía más de lo que decía.'),
  ].join('\n');
  const leida = importarHistoria(volcado);
  const notas = leida.personajes.flatMap((p) => p.notas ?? []).join(' ');
  await caso('importar un hilo con el MASTER PROMPT al principio: sus reglas no se vuelven personajes ni notas', () => [!leida.personajes.some((p) => /Torela|Narrador|Jugador/i.test(p.nombre)) && !/narrador|instantánea|inventes/i.test(notas) && leida.personajes.some((p) => p.nombre === 'Lyssara'), `${leida.personajes.map((p) => p.nombre)} / ${notas.slice(0, 200)}`]);
  await caso('una frase de reglas en la historia del personaje no se analiza como hecho', () => [Canon.muertosSegunCanon({ lore: 'El narrador debe matar a Aldo si el jugador falla. Nací en Pozoalto.' }).length === 0]);
}

/* ═══════════════════════════════════════════════════════════════════════════
   3. EN EL MOTOR, CON UNA IA SIMULADA
   ═══════════════════════════════════════════════════════════════════════════ */

console.log('\n── En el motor: guardar, cargar, una IA que contradice el canon y el límite gratuito ──');
{
  const m = await crearMotor({ semilla: 5150 });
  const avisos = [];
  m.bus.on('ui:notice', (a) => avisos.push(a.mensaje));
  await m.empezar({ nombre: 'Nerea', raza: 'valdes', clase: 'rastreador', trasfondo: 'errante', genero: 'f', lore: LORE });
  const jugar = async (t) => (await m.jugar(t)).split('\n').filter((l) => !l.startsWith('»')).join('\n');
  const registro = () => m.sistema('turns').memoria.registroCanon;

  await caso(`la historia del personaje se guarda entera (${LORE.length} caracteres)`, () => [m.ver('player.lore', '').length === LORE.length]);

  let t = await jugar('canon: mi hermano Aldo es herrero y murió en el paso del norte hace dos inviernos');
  await caso('se anota una edición', () => [/Canon anotado/.test(t), t]);
  for (let i = 1; i < 12; i += 1) await jugar(`canon: ${NOMBRES[i]} fue el ${i}.º guardián de la cofradía de Pozoalto y conoce la mina vieja`);
  await caso('doce ediciones, las doce valen', () => [NOMBRES.slice(1, 12).every((n) => todo(registro()).includes(n)), vale(registro()).length]);

  await m.guardarYCargar();
  await caso('tras guardar y cargar siguen las doce, enteras', () => [NOMBRES.slice(1, 12).every((n) => todo(registro()).includes(`${n} fue el`)) && /herrero/.test(todo(registro())), vale(registro()).slice(0, 3).join(' | ')]);

  const dm = m.sistema('dungeonmaster');
  const groq = dm.proveedor('groq');
  const enviados = [];
  let contenido = '';
  groq._fetch = async (url, op = {}) => {
    if (/\/(?:probar|estado)$/.test(url)) return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ servicio: 'arcanveil-puente-groq/2', disponible: true }) };
    if (op.body) enviados.push(JSON.parse(op.body));
    return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ choices: [{ message: { content: contenido } }] }) };
  };
  await groq.probar();
  groq.configurar({ consentido: true });
  dm.cambiar('groq', { silencioso: true });
  const instantaneaDe = (cuerpo) => JSON.parse(cuerpo.messages[1].content.replace(/^[^{]*/, '').replace(/[^}]*$/, ''));

  contenido = JSON.stringify({ story: 'El viento baja de la sierra y levanta polvo de carbón en la calle.\nAldo: «Hermana, te estaba esperando.»\nUna campana suena lejos, en la boca de la mina.', choices: [] });
  avisos.length = 0;
  t = await jugar('camino hacia la boca de la mina vieja pensando en los guardianes de la cofradía');
  const inst = instantaneaDe(enviados.at(-1));
  await caso(`la petición dice qué canon se queda fuera (${inst.canonOmitido?.n} de ${inst.canonOmitido?.total})`, () => [inst.canonOmitido && inst.canonOmitido.n > 0]);
  await caso('y el jugador recibe el aviso de que la continuidad no está garantizada', () => [avisos.some((a) => /no cabe entero/.test(a)), avisos.join(' / ')]);
  await caso('Aldo, muerto según el canon, no habla tras guardar y cargar', () => [!/Aldo: «/.test(t) && /campana/.test(t), t]);

  t = await jugar('canon: en realidad Aldo sigue vivo, preso en Saucedo');
  await caso('revisar la vida lo dice y conserva la versión anterior', () => [/Canon revisado/.test(t) && /sustituye a «[^»]*murió en el paso del norte/i.test(t), t]);
  await caso('[nuevo] y lo demás de Aldo sigue: hermano y herrero', () => [/hermano/.test(todo(registro())) && /herrero/.test(todo(registro())) && /Saucedo/.test(todo(registro())), vale(registro()).filter((x) => /Aldo/.test(x)).join(' | ')]);
  await m.guardarYCargar();
  await caso('tras cargar, la revisión y su historial siguen', () => { const h = Canon.hechosDe ? Canon.hechosDe(registro(), 'Aldo') : []; return [h.some((x) => x.predicado === 'vida' && x.valor === 'vivo' && x.sustituye.length) && /herrero/.test(h.map((x) => x.texto).join(' ')), h.map((x) => x.texto).join(' | ')]; });

  groq.configurar({ consentido: true });
  dm.cambiar('groq', { silencioso: true });
  contenido = JSON.stringify({ story: 'Un arriero se cruza contigo en el camino y te mira dos veces.\nNo dice nada, pero aprieta el paso hacia el pueblo.', choices: [] });
  await jugar('pregunto por Aldo en el camino');
  const inst2 = instantaneaDe(enviados.at(-1));
  const canon2 = inst2.memoria.canon.map((c) => c.texto).join(' ');
  await caso('la petición lleva la versión vigente y lo que no se tocó, no la sustituida', () => [/sigue vivo/.test(canon2) && /herrero/.test(canon2) && /hermano/.test(canon2) && !/murió en el paso del norte hace/.test(canon2.replace(/Lo que se contó[^.]*\./g, '')), canon2.slice(0, 400)]);

  t = await jugar('canon: Ahora vive en Norte.');
  await caso('[nuevo] una edición sin sujeto en el motor pregunta y no toca nada', () => [/no dice de quién/.test(t) && !/vive en Norte/.test(todo(registro())), t]);

  // Límite gratuito: con el canon lleno (sesenta sujetos más) una petición
  // entra en el minuto de la capa Free en el peor caso, sin contar caché.
  for (let i = 0; i < 60; i += 1) await jugar(`canon: ${NOMBRES[i % 30]}${i >= 30 ? 'ra' : 'n'} es mi ${i % 2 ? 'prima' : 'primo'}, vive en Villa${i} y guarda el sello ${i}`);
  contenido = JSON.stringify({ story: 'La calle sigue igual de vacía.\nAlguien cierra una contraventana.', choices: [] });
  await jugar('miro la calle');
  const cuerpo = enviados.at(-1);
  const chars = cuerpo.messages.map((x) => x.content).join('').length;
  const peor = Math.ceil(chars / 3.5) + cuerpo.max_tokens;
  const inst3 = instantaneaDe(cuerpo);
  await caso(`[estrés] con ${vale(registro()).length} hechos, una petición cuesta en el peor caso ${peor} tokens: cabe en el minuto (${LIMITES_LOCALES.tokensMinuto})`, () => [peor <= LIMITES_LOCALES.tokensMinuto, peor]);
  await caso(`[estrés] el día da para ${Math.floor(LIMITES_LOCALES.tokensDia / peor)} turnos así sin caché (mínimo exigido: 30)`, () => [Math.floor(LIMITES_LOCALES.tokensDia / peor) >= 30]);
  await caso('[estrés] el canon enviado respeta su presupuesto y lo que falta va listado', () => [JSON.stringify(inst3.memoria.canon).length <= 2400 && inst3.canonOmitido?.n > 0, `${JSON.stringify(inst3.memoria.canon).length} caracteres, ${inst3.canonOmitido?.n} omitidas`]);
  // El objetivo de 6.000 caracteres es blando: el canon, quién está y lo
  // resuelto no se recortan nunca. Lo que se exige es que todo lo recortable
  // se haya recortado y que la lista de omitidas no crezca con el canon
  // (antes, con este mismo canon, la instantánea pasaba de 11.000).
  const medida = JSON.stringify(inst3).length;
  await caso(`[estrés] la instantánea no crece con el canon: ${medida} caracteres (objetivo blando ${PRESUPUESTO.total}); lo recortable, recortado`, () => [
    medida <= PRESUPUESTO.total * 1.15 && (medida <= PRESUPUESTO.total || (inst3.canonOmitido.cuales.length <= 3 && inst3.yaContado.length <= 6 && inst3.memoria.inmediata.length <= 2)),
    Object.entries(inst3).map(([k, v]) => `${k}:${JSON.stringify(v).length}`).join(' '),
  ]);
  await caso('[estrés] y el verificador sigue sabiendo quién está vivo', () => [!Canon.muertosSegunCanon({ registro: registro() }).includes('Aldo'), Canon.muertosSegunCanon({ registro: registro() })]);
}

console.log(`\n${casos - fallos}/${casos} comprobaciones`);
console.log(fallos ? `\n${fallos} fallos.` : '\nTodo bien.');
process.exit(fallos ? 1 : 0);
