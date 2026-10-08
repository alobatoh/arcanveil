/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCANVEIL · tools/auditar-narrador-ia.mjs
 * ---------------------------------------------------------------------------
 * El narrador con IA, probado sin IA: sin clave, sin red y sin gastar nada.
 *
 *   A. El puente de Groq contra un Groq falso en 127.0.0.1: host, origen,
 *      modelo único, topes, 429, pausa diaria, idempotencia, errores sin
 *      clave, trazas sin contenido, probar sin generar.
 *   B. El proveedor dentro del motor de verdad, con respuestas simuladas:
 *      qué se envía, qué efectos entran, cómo se repara, cuándo se cae al
 *      procedural y que el turno se cuenta una vez.
 *
 * Esto valida la MECÁNICA. No valida la calidad narrativa del modelo: eso
 * solo se sabe con partidas reales, que requieren cuenta, cuota y permiso.
 *
 *   node tools/auditar-narrador-ia.mjs
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createServer } from 'node:http';
import { crearProxyGroq, MODELO_PERMITIDO } from './groq-proxy.mjs';
import { procesarTeclas } from './iniciar-groq.mjs';
import { crearMotor } from './motor-sin-ventana.mjs';
import * as Prompt from '../src/ai/PromptBuilder.js';
import { verificar, repararLocal } from '../src/ai/narrador/Verificador.js';
import { autorizar } from '../src/ai/narrador/Autorizacion.js';

let fallos = 0;
let casos = 0;
function comprobar(bien, texto, detalle = '') {
  casos += 1;
  if (bien) console.log(`OK   ${texto}`);
  else {
    fallos += 1;
    console.log(`MAL  ${texto}`);
    if (detalle) console.log(`     ${String(detalle).replace(/\n/g, ' | ').slice(0, 600)}`);
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   A. EL PUENTE
   ═══════════════════════════════════════════════════════════════════════════ */

console.log('\n── A. Puente de Groq contra un Groq falso ──');

const CLAVE = `gsk_prueba_${'x'.repeat(40)}`;
const ORIGEN = 'http://localhost:8080';
const llamadas = [];
let guion = [];

const falso = createServer((req, res) => {
  let cuerpo = '';
  req.on('data', (b) => { cuerpo += b; });
  req.on('end', () => {
    llamadas.push({ ruta: req.url, metodo: req.method, auth: req.headers.authorization, cuerpo: cuerpo ? JSON.parse(cuerpo) : null });
    if (req.url.endsWith('/models')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ data: [{ id: MODELO_PERMITIDO }, { id: 'otro-modelo' }] }));
    }
    const paso = guion.shift() ?? { estado: 200 };
    const cab = { 'Content-Type': 'application/json', 'x-ratelimit-remaining-requests': String(paso.restantes ?? 800), 'x-ratelimit-reset-requests': '2m', ...(paso.retry ? { 'retry-after': String(paso.retry) } : {}) };
    res.writeHead(paso.estado, cab);
    if (paso.estado === 200) {
      return res.end(JSON.stringify({
        choices: [{ message: { role: 'assistant', content: paso.contenido ?? '{"story":"Hola."}', reasoning: 'razonamiento interno que no debe salir' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 900, completion_tokens: 150, total_tokens: 1050, prompt_tokens_details: { cached_tokens: 600 } },
      }));
    }
    return res.end(JSON.stringify({ error: { message: `fallo con ${CLAVE} dentro`, code: paso.codigo ?? 'rate_limit_exceeded' } }));
  });
});
await new Promise((r) => falso.listen(0, '127.0.0.1', r));
const upstream = `http://127.0.0.1:${falso.address().port}`;

const trazas = [];
const puente = crearProxyGroq({ clave: CLAVE, puerto: 0, origen: ORIGEN, upstream, rutaUso: null, trazar: (t) => trazas.push(t), limites: { porMinuto: 6 } });
const puertoPuente = await puente.escuchar();
// El puerto real, para que el Host cuadre.
const base = `http://127.0.0.1:${puertoPuente}`;

/** Petición cruda al puente (fetch no deja cambiar Host). */
async function pedir(ruta, { metodo = 'POST', origen = ORIGEN, host = `127.0.0.1:${puertoPuente}`, cuerpo = null, turno = null, tipo = 'application/json' } = {}) {
  const { request } = await import('node:http');
  return new Promise((ok, no) => {
    const datos = cuerpo == null ? null : (typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo));
    const req = request({ host: '127.0.0.1', port: puertoPuente, path: ruta, method: metodo, headers: {
      Host: host, ...(origen ? { Origin: origen } : {}), ...(datos ? { 'Content-Type': tipo, 'Content-Length': Buffer.byteLength(datos) } : {}), ...(turno ? { 'X-Arcanveil-Turno': turno } : {}),
    } }, (res) => {
      let t = '';
      res.on('data', (b) => { t += b; });
      res.on('end', () => ok({ estado: res.statusCode, cab: res.headers, texto: t, json: (() => { try { return JSON.parse(t); } catch { return null; } })() }));
    });
    req.on('error', no);
    if (datos) req.write(datos);
    req.end();
  });
}

const buena = (extra = 'Miro el río.') => ({ model: MODELO_PERMITIDO, messages: [{ role: 'system', content: 'política' }, { role: 'user', content: `PALABRA_SECRETA_DE_PARTIDA ${extra}` }], max_tokens: 5000, temperature: 3 });

let r = await pedir('/v1/chat/completions', { host: `evil.example:${puertoPuente}`, cuerpo: buena() });
comprobar(r.estado === 421, 'un Host ajeno (rebinding de DNS) se rechaza', r.estado);
r = await pedir('/v1/chat/completions', { origen: 'https://evil.example', cuerpo: buena() });
comprobar(r.estado === 403, 'un Origin ajeno se rechaza aunque CORS lo pararía después', r.estado);
r = await pedir('/v1/chat/completions', { origen: null, cuerpo: buena() });
comprobar(r.estado === 403, 'sin Origin tampoco', r.estado);
r = await pedir('/v1/chat/completions', { metodo: 'OPTIONS' });
comprobar(r.estado === 204 && r.cab['access-control-allow-origin'] === ORIGEN, 'el preflight contesta solo al origen exacto', JSON.stringify(r.cab));
r = await pedir('/v1/chat/completions', { cuerpo: buena(), tipo: 'text/plain' });
comprobar(r.estado === 415, 'sin JSON no se atiende (fuerza el preflight en navegador)', r.estado);

const antesLlamadas = llamadas.length;
r = await pedir('/v1/chat/completions', { cuerpo: { ...buena(), model: 'llama-3.3-70b-versatile' } });
comprobar(r.estado === 400 && llamadas.length === antesLlamadas, 'otro modelo se rechaza sin llamar a Groq', r.texto);
r = await pedir('/v1/chat/completions', { cuerpo: 'x'.repeat(200 * 1024) });
comprobar(r.estado === 413, 'un cuerpo enorme se corta', r.estado);

guion = [{ estado: 200, contenido: '{"story":"El agua baja turbia."}' }];
r = await pedir('/v1/chat/completions', { cuerpo: buena(), turno: 'p1-t1' });
const enviada = llamadas.at(-1);
comprobar(r.estado === 200 && r.json?.choices?.[0]?.message?.content?.includes('turbia'), 'una petición buena pasa y vuelve la narración', r.texto);
comprobar(enviada?.auth === `Bearer ${CLAVE}`, 'la clave la pone el puente, no el navegador');
comprobar(enviada?.cuerpo?.model === MODELO_PERMITIDO && enviada.cuerpo.reasoning_effort === 'low' && enviada.cuerpo.include_reasoning === false
  && enviada.cuerpo.response_format?.type === 'json_object' && enviada.cuerpo.max_completion_tokens <= 1200 && enviada.cuerpo.temperature <= 1.2,
  'a Groq va el modelo único, razonamiento bajo y oculto, JSON y topes de salida', JSON.stringify(enviada?.cuerpo).slice(0, 300));
comprobar(!r.texto.includes(CLAVE) && !r.texto.includes('razonamiento interno'), 'la respuesta no lleva la clave ni el razonamiento');
comprobar(r.json?.usage?.cached_tokens === 600, 'se informa de los tokens cacheados');

const n1 = llamadas.length;
r = await pedir('/v1/chat/completions', { cuerpo: buena(), turno: 'p1-t1' });
comprobar(r.estado === 200 && llamadas.length === n1, 'el mismo turno repetido no gasta otra solicitud');
r = await pedir('/v1/chat/completions', { cuerpo: buena('Otra cosa.'), turno: 'p1-t1' });
comprobar(r.estado === 409, 'el mismo turno con otro contenido se rechaza', r.estado);

guion = [{ estado: 429, retry: 1, codigo: 'rate_limit_exceeded' }, { estado: 200 }];
r = await pedir('/v1/chat/completions', { cuerpo: buena('a'), turno: 'p1-t2' });
comprobar(r.estado === 429 && r.cab['retry-after'] === '1' && !r.texto.includes(CLAVE), 'un 429 corto llega con su Retry-After y sin el error crudo', r.texto);
const n2 = llamadas.length;
r = await pedir('/v1/chat/completions', { cuerpo: buena('a'), turno: 'p1-t2' });
comprobar(r.estado === 429 && llamadas.length === n2, 'reintentar antes de lo que pidió Groq no llega a Groq', r.estado);
await new Promise((ok) => setTimeout(ok, 1100));
r = await pedir('/v1/chat/completions', { cuerpo: buena('a'), turno: 'p1-t2' });
comprobar(r.estado === 200 && llamadas.length === n2 + 1, 'pasada la espera, el reintento del mismo turno sí vuelve a pedir');

guion = [{ estado: 401, codigo: 'invalid_api_key' }];
r = await pedir('/v1/chat/completions', { cuerpo: buena('b'), turno: 'p1-t3' });
comprobar(r.estado === 401 && !r.texto.includes(CLAVE) && /clave/.test(r.json?.error?.message ?? ''), 'un error de Groq se traduce sin repetir lo que trae', r.texto);

guion = [{ estado: 429, retry: 3600, codigo: 'rate_limit_exceeded' }];
r = await pedir('/v1/chat/completions', { cuerpo: buena('c'), turno: 'p1-t4' });
const n3 = llamadas.length;
r = await pedir('/v1/chat/completions', { cuerpo: buena('d'), turno: 'p1-t5' });
comprobar(r.estado === 429 && llamadas.length === n3 && r.json?.error?.code === 'cuota_diaria', 'con la cuota del día agotada se pausa sin volver a llamar', r.texto);
comprobar(puente.estado().pausa !== null, 'y el estado lo dice');

const n4 = llamadas.length;
r = await pedir('/probar', { metodo: 'GET' });
comprobar(r.estado === 200 && r.json?.disponible === true && r.json?.generacion === false && llamadas.at(-1)?.ruta.endsWith('/models') && llamadas.length === n4 + 1,
  'probar la conexión pide la lista de modelos y no genera nada', r.texto);

const todoTrazas = JSON.stringify(trazas);
comprobar(!todoTrazas.includes(CLAVE) && !todoTrazas.includes('PALABRA_SECRETA_DE_PARTIDA') && !todoTrazas.includes('p1-t1'),
  'las trazas no llevan la clave, ni el texto de la partida, ni el id del turno en claro', todoTrazas.slice(0, 300));
comprobar(trazas.some((t) => t.tokens?.cacheados === 600), 'las trazas cuentan tokens (y cacheados) sin contenido');

// Topes propios: otro puente con 2 por minuto.
const puente2 = crearProxyGroq({ clave: CLAVE, puerto: 0, origen: ORIGEN, upstream, rutaUso: null, limites: { porMinuto: 2 } });
await puente2.escuchar();
await puente2.cerrar();
let lanzo = false;
try { crearProxyGroq({ clave: CLAVE, origen: ORIGEN, upstream: 'https://otra-nube.example/v1' }); } catch { lanzo = true; }
comprobar(lanzo, 'no se puede apuntar el puente a otra nube');
lanzo = false;
try { crearProxyGroq({ clave: CLAVE, origen: 'https://evil.example', upstream }); } catch { lanzo = true; }
comprobar(lanzo, 'ni servir a un origen que no sea local');

comprobar(procesarTeclas('', '\u001b[200~gsk_abc\u001b[201~').valor === 'gsk_abc' && procesarTeclas('abc', '\u007f\r').valor === 'ab'
  && procesarTeclas('abc', '\r').hecho && procesarTeclas('abc', '\u0003').cancelado,
  'la entrada sin eco limpia lo pegado, borra y cancela');

await puente.cerrar();

/* ═══════════════════════════════════════════════════════════════════════════
   B. EL PROVEEDOR DENTRO DEL MOTOR
   ═══════════════════════════════════════════════════════════════════════════ */

console.log('\n── B. El proveedor de Groq en el motor, con respuestas simuladas ──');

const m = await crearMotor({ semilla: 4242 });
const avisos = [];
m.bus.on('ui:notice', (a) => avisos.push(a.mensaje));
const trazasTurno = [];
m.bus.on('narrador:traza', (t) => trazasTurno.push(t));
await m.empezar({ nombre: 'Iselda', raza: 'valdes', clase: 'rastreador', trasfondo: 'errante', genero: 'f', lore: 'Mi hermano desapareció cruzando el paso del norte.' });

const s = m.sistema('situations');
for (const x of s.aqui()) { s._guardar({ ...x, estado: 'desenlace' }); for (const a of Object.values(x.actores)) m.sistema('npcs').retirar(a.refId); }
const npcs = m.sistema('npcs');
const vervek = npcs.introducir({ nombre: 'Vervek', rol: 'herrero', genero: 'm' });
npcs.actualizar(vervek.refId, { conocimiento: { ...vervek.conocimiento, secretos: ['Vervek esconde armas robadas debajo de la fragua vieja'] } });
const ausente = npcs.introducir({ nombre: 'Holda', rol: 'barquera', genero: 'f' });
npcs.retirar(ausente.refId);

const dm = m.sistema('dungeonmaster');
const groq = dm.proveedor('groq');
const envios = [];
let respuestas = [];
let impostor = false;
groq._fetch = async (url, op = {}) => {
  envios.push({ url, op, cuerpo: op.body ? JSON.parse(op.body) : null });
  // El puente se identifica; un impostor contesta sin decir quién es.
  if (/\/(?:probar|estado)$/.test(url)) {
    const datos = impostor ? { ok: true, disponible: true } : { servicio: 'arcanveil-puente-groq/2', ok: true, disponible: true, generacion: false, usoHoy: { peticiones: 0, tokens: 0 } };
    return { ok: true, status: 200, headers: { get: () => null }, json: async () => datos };
  }
  const paso = respuestas.shift() ?? { estado: 500 };
  if (paso.red) throw new TypeError('fetch failed');
  return {
    ok: paso.estado === 200,
    status: paso.estado,
    headers: { get: (k) => (k === 'retry-after' ? (paso.retry != null ? String(paso.retry) : null) : null) },
    json: async () => (paso.estado === 200 ? { choices: [{ message: { content: paso.contenido } }], usage: { total_tokens: 1000 } } : { error: { message: 'x', code: paso.codigo ?? null } }),
  };
};
groq._dormirMs = async () => {};
const turnoAhora = () => m.ver('meta.turno', 0);
const oro = () => m.ver('player.oro', 0);
const objetos = () => Object.keys(m.ver('inventory.objetos.porId', {}) ?? {}).length;
const jugar = async (t) => (await m.jugar(t)).split('\n').filter((l) => !l.startsWith('»')).join('\n');
const json = (o) => JSON.stringify(o);

// 1 · Sin consentimiento no se envía nada.
dm.cambiar('groq');
let t = await jugar('miro el río');
comprobar(envios.length === 0 && t.length > 0, 'sin consentimiento, Groq no recibe nada y el turno se narra igual', t);

// 2 · Con consentimiento: qué se envía.
// Probar no necesita el permiso de enviar, y no envía nada de la partida.
const ep = envios.length;
const prueba = await groq.probar();
comprobar(prueba.ok && envios.slice(ep).every((x) => !x.op?.body), 'probar la conexión funciona sin el permiso de enviar y no envía la partida');
groq.configurar({ consentido: true });
dm.cambiar('groq');
respuestas = [{ estado: 200, contenido: json({
  story: 'Vervek deja el martillo sobre el yunque y te mira de arriba abajo.\nVervek: «El paso del norte cierra con las nieves. Dos jornadas, si el tiempo aguanta.»\nUn cubo de agua turbia humea junto a la fragua.',
  pregunta: 'Vervek espera.',
  choices: [{ label: 'Preguntar por las nieves', intent: 'talk', risk: 'low' }],
  proposedEffects: [
    { tipo: 'oro', datos: { delta: 50 }, razon: 'le cae bien', evidencia: 'charla' },
    { tipo: 'objeto', datos: { nombre: 'Espada rúnica' }, razon: 'regalo', evidencia: 'charla' },
    { tipo: 'actitud', datos: { refId: vervek.refId, delta: 40 }, razon: 'pregunta con respeto', evidencia: 'le pregunta por el paso' },
    { tipo: 'elemento_escena', datos: { texto: 'un cubo de agua turbia junto a la fragua' }, razon: 'se describe', evidencia: 'narración' },
    { tipo: 'recuerdo_pnj', datos: { refId: vervek.refId, texto: 'Le contó que el paso cierra con las nieves.', tipo: 'compartido' }, razon: 'lo dijo', evidencia: 'diálogo' },
    { tipo: 'actitud', datos: { refId: ausente.refId, delta: 5 }, razon: 'x', evidencia: 'y' },
  ],
  playerUpdates: { gold: { delta: 999 }, hp: { delta: 20 } },
  newItems: [{ nombre: 'Anillo de poder' }],
  mood: 'tranquilo',
}) }];
const oro0 = oro();
const obj0 = objetos();
const turno0 = turnoAhora();
const actitud0 = m.ver(`npcs.conocidos.porId.${vervek.refId}.actitud`, 0);
t = await jugar('le pregunto a Vervek por el paso del norte');
const cuerpo = envios.at(-1)?.cuerpo;
comprobar(cuerpo?.messages?.[0]?.role === 'system' && cuerpo.messages[0].content === Prompt.sistema(), 'el proveedor envía la política completa como system, no un marcador');
comprobar(['1 · CONTROL', '2 · EL MOTOR MANDA', '5-6 · CERO REPETICIONES', '11 · COMBATE', '24 · EFECTOS', '25-26 · REGLA DE ORO'].every((k) => cuerpo.messages[0].content.includes(k)), 'la política lleva los apartados del motor narrativo');
comprobar(cuerpo?.messages?.[1]?.role === 'user' && cuerpo.messages[1].content.includes('INSTANTÁNEA') && cuerpo.messages[1].content.includes('le pregunto a Vervek por el paso del norte'), 'el estado del turno y lo que escribe el jugador van aparte, como user');
comprobar(!cuerpo.messages[1].content.includes('armas robadas') && /"guardaAlgo":true/.test(cuerpo.messages[1].content), 'el secreto de Vervek no viaja; solo que guarda algo');
comprobar(/"destinatario":\{"estado":"presente","nombre":"Vervek"/.test(cuerpo.messages[1].content), 'la interpretación del motor viaja: a quién habla');
const inst = JSON.parse(cuerpo.messages[1].content.slice(cuerpo.messages[1].content.indexOf('{'), cuerpo.messages[1].content.lastIndexOf('}') + 1));
comprobar(inst.medida.caracteres <= 6500, `la instantánea cabe en el presupuesto (${inst.medida.caracteres} caracteres, ~${inst.medida.tokensAprox} tokens)`);
comprobar(/X-Arcanveil-Turno/i.test(Object.keys(envios.at(-1).op.headers).join(',')), 'cada turno lleva su identificador para no cobrarse dos veces');
comprobar(t.includes('Vervek: «El paso del norte cierra') && t.includes('cubo de agua'), 'la narración del modelo llega a la bitácora', t);
comprobar(oro() === oro0 && objetos() === obj0, 'ni el oro ni los objetos que propone el modelo entran', `${oro0}→${oro()} ${obj0}→${objetos()}`);
const actitud1 = m.ver(`npcs.conocidos.porId.${vervek.refId}.actitud`, 0);
comprobar(actitud1 - actitud0 > 0 && actitud1 - actitud0 <= 10, `la actitud entra recortada (${actitud0}→${actitud1})`);
comprobar(JSON.stringify(m.ver('world.elementos', {})).includes('cubo de agua turbia'), 'el elemento de escena queda registrado con su lugar');
const tr = trazasTurno.at(-1);
comprobar(tr?.rechazados?.some((x) => x.tipo === 'oro') && tr.rechazados.some((x) => x.tipo === 'objeto') && tr.rechazados.some((x) => /presente/.test(x.motivo)),
  'la traza dice qué se rechazó y por qué (oro, objeto, PNJ ausente)', JSON.stringify(tr?.rechazados));
comprobar(turnoAhora() === turno0 + 1, 'el turno cuenta una vez');

// 3 · Un ausente que habla: se quita esa línea, sin otra petición.
respuestas = [{ estado: 200, contenido: json({ story: 'El fuego de la fragua cruje y suelta chispas hacia el techo.\nHolda: «Yo te cruzo el río por dos monedas.»\nVervek vuelve a su hierro sin prisa, como si nada.', choices: [], mood: 'tranquilo' }) }];
const e0 = envios.length;
t = await jugar('espero a ver qué hace Vervek');
comprobar(!t.includes('Holda') && t.includes('Vervek vuelve a su hierro') && envios.length === e0 + 1, 'quien no está no habla: se quita la línea en local, sin otra solicitud', t);

// 4 · Todo el turno contradice: se pide UNA corrección y se avisa.
respuestas = [
  { estado: 200, contenido: json({ story: 'Recibes una espada de oro.', choices: [] }) },
  { estado: 200, contenido: json({ story: 'Vervek niega con la cabeza y sigue golpeando el hierro al rojo. El taller huele a carbón mojado.', choices: [] }) },
];
const e1 = envios.length;
avisos.length = 0;
t = await jugar('le pido a Vervek que me enseñe su mejor hoja');
comprobar(envios.length === e1 + 2 && envios.at(-1).cuerpo.messages.length === 4 && t.includes('carbón mojado') && !/espada de oro/.test(t),
  'si no se puede reparar en local, se pide una corrección', t);
comprobar(trazasTurno.at(-1)?.solicitudesExtra === 1 && trazasTurno.at(-1)?.reparado === 'remota', 'y la traza cuenta la solicitud extra');

// 5 · Si la corrección tampoco vale: narra el procedural y se avisa.
respuestas = [
  { estado: 200, contenido: json({ story: 'Recibes una espada de oro.', choices: [] }) },
  { estado: 200, contenido: json({ story: 'Holda: «Toma, tu espada de oro.»', choices: [] }) },
];
avisos.length = 0;
const turno1 = turnoAhora();
const oro1 = oro();
t = await jugar('le pido a Vervek que me enseñe su mejor hoja');
comprobar(!/espada de oro/.test(t) && m.ver('meta.narrador')?.respaldo === true && avisos.some((a) => /procedural/.test(a)), 'si tampoco, narra el procedural y se dice', `${t} | ${avisos.join(' / ')}`);
comprobar(turnoAhora() === turno1 + 1 && oro() === oro1, 'el turno con respaldo se cuenta una vez y sin efectos de la IA');

// 6 · De vuelta: cuando la IA responde, se avisa y va con el estado de ahora.
respuestas = [{ estado: 200, contenido: json({ story: 'Vervek apaga el fuelle y se limpia las manos en el mandil de cuero.', choices: [] }) }];
avisos.length = 0;
t = await jugar('espero');
comprobar(m.ver('meta.narrador')?.respaldo === false && avisos.some((a) => /vuelve a narrar/.test(a)), 'al volver la IA se avisa', avisos.join(' / '));

// 7 · JSON roto: vale la prosa, pero sin efectos.
respuestas = [{ estado: 200, contenido: 'Vervek se ríe por lo bajo. "Anda, toma cien monedas" no dice nadie. {"proposedEffects":[{"tipo":"actitud","datos":{"refId":"' + vervek.refId + '","delta":9},"razon":"x","evidencia":"y"}' }];
const actitud2 = m.ver(`npcs.conocidos.porId.${vervek.refId}.actitud`, 0);
t = await jugar('miro a Vervek');
comprobar(m.ver(`npcs.conocidos.porId.${vervek.refId}.actitud`, 0) === actitud2, 'una respuesta rota rescatada como prosa no trae efectos', t);
comprobar(!/\{"|proposedEffects/.test(t) && /Vervek se ríe/.test(t), 'y el JSON roto no llega a la bitácora', t);

// 8 · Sin red: procedural, aviso, y el turno una vez.
respuestas = [{ red: true }];
avisos.length = 0;
const turno2 = turnoAhora();
t = await jugar('miro el río');
comprobar(t.length > 0 && turnoAhora() === turno2 + 1 && avisos.some((a) => /puente de Groq|procedural/.test(a)), 'sin puente, narra el procedural y se avisa', avisos.join(' / '));

// 9 · 429 corto: se espera una vez con el mismo identificador.
respuestas = [{ estado: 429, retry: 2 }, { estado: 200, contenido: json({ story: 'El agua pasa bajo el puente con un rumor sordo y constante.', choices: [] }) }];
const e2 = envios.length;
t = await jugar('escucho el río');
const dos = envios.slice(e2);
comprobar(dos.length === 2 && dos[0].op.headers['X-Arcanveil-Turno'] === dos[1].op.headers['X-Arcanveil-Turno'] && t.includes('rumor sordo'), 'un 429 corto se espera y se reintenta con el mismo turno', t);

// 10 · Cuota del día: pausa, procedural, y no se llama más.
respuestas = [{ estado: 429, retry: 3600, codigo: 'cuota_diaria' }];
avisos.length = 0;
t = await jugar('miro alrededor');
const e3 = envios.length;
t = await jugar('miro el cielo');
comprobar(envios.length === e3 && groq.comprobar().disponible === false && /cuota gratuita/.test(groq.comprobar().motivo), 'con la cuota del día agotada no se vuelve a llamar hasta que se renueve', groq.comprobar().motivo);
groq._pausaHasta = 0;

// 11 · Lo que no existe no llega al modelo.
const e4 = envios.length;
t = await jugar('le pregunto al carretero qué necesita');
comprobar(envios.length === e4 && /ningún carretero/.test(t), 'una pregunta a quien no existe la contesta el motor y no gasta solicitud', t);

// 12 · Guardar y cargar: el siguiente turno lleva lo de antes.
await m.guardarYCargar();
// Otra sesión: al arrancar de nuevo, el permiso no sigue.
const e6 = envios.length;
avisos.length = 0;
dm.alArrancar();
m.store.fijar('settings.proveedor', 'groq');
dm.alArrancar();
t = await jugar('miro el río');
comprobar(envios.length === e6 && avisos.some((a) => /otra sesión/.test(a)), 'tras reiniciar, no se envía nada hasta un gesto en esta sesión, y se dice', avisos.join(' / '));
comprobar(m.ver('settings.groqConsentido', null) === null && !JSON.stringify(m.ver('settings', {})).includes('onsentido'), 'el permiso no se guarda en los ajustes ni en la partida');
await groq.probar();
groq.configurar({ consentido: true });
dm.cambiar('groq');
respuestas = [{ estado: 200, contenido: json({ story: 'Vervek levanta la vista del hierro, todavía con el martillo en alto.', choices: [] }) }];
t = await jugar('le pregunto a Vervek si recuerda lo del paso');
const tras = envios.at(-1)?.cuerpo?.messages?.[1]?.content ?? '';
comprobar(tras.includes('paso cierra con las nieves') && tras.includes('mandil de cuero'), 'tras cargar, la instantánea recuerda lo que Vervek contó y lo ya narrado', tras.slice(0, 300));

// 13 · Una dirección que contesta pero no es el puente no recibe la historia.
impostor = true;
groq.configurar({ url: 'http://127.0.0.1:9999' });
const e7 = envios.length;
const pi = await groq.probar();
t = await jugar('escucho el río');
comprobar(!pi.ok && /no es el puente/.test(pi.motivo) && envios.slice(e7).every((x) => !x.op?.body), 'una dirección que no se identifica como el puente no recibe nada de la partida', pi.motivo);
impostor = false;
groq.configurar({ url: 'http://127.0.0.1:11436' });
comprobar(groq.comprobar().disponible === false, 'cambiar la dirección obliga a volver a probar');
await groq.probar();

// 14 · Probar la conexión no manda la partida.
respuestas = [];
const e5 = envios.length;
await groq.probar();
comprobar(envios.slice(e5).every((x) => !x.op?.body) && envios.slice(e5).some((x) => x.url.endsWith('/probar')), 'probar la conexión no envía nada de la partida');

// 15 · La evidencia de un efecto es lo que resolvió el motor, no la narración.
const bruna = npcs.introducir({ nombre: 'Bruna', rol: 'lavandera', genero: 'f' });
const actB = m.ver(`npcs.conocidos.porId.${bruna.refId}.actitud`, 0);
respuestas = [{ estado: 200, contenido: json({
  story: 'Vervek niega despacio con la cabeza.\nBruna, que tiende ropa al lado, suelta una carcajada.\nEn el barro junto al pozo hay marcas de rueda recientes.',
  choices: [],
  proposedEffects: [
    { tipo: 'actitud', datos: { refId: bruna.refId, delta: 8 }, razon: 'le hace gracia', evidencia: 'Bruna se ríe' },
    { tipo: 'pista', datos: { texto: 'marcas de rueda recientes junto al pozo', causa: 'alguien sacó un carro de noche' }, razon: 'se ve', evidencia: 'narración' },
  ],
  memory: ['Vervek odia a los recaudadores desde la guerra.'],
}) }];
const hilos0 = m.sistema('turns').memoria.hilos.length;
t = await jugar('le digo a Vervek que el paso no me asusta');
const tr15 = trazasTurno.at(-1);
comprobar(m.ver(`npcs.conocidos.porId.${bruna.refId}.actitud`, 0) === actB && tr15.rechazados.some((x) => x.tipo === 'actitud' && /trato/.test(x.motivo)),
  'la actitud de quien solo sale en la narración no cambia: el motor no registra trato con ella', JSON.stringify(tr15.rechazados));
comprobar(m.sistema('turns').memoria.hilos.length === hilos0 && tr15.rechazados.some((x) => x.tipo === 'pista'), 'una pista sin hallazgo del motor no entra');
const mem = m.sistema('turns').memoria;
comprobar(!mem.hechos.some((h) => /recaudadores/.test(h.texto)) && mem.notasNarrador.some((n) => /recaudadores/.test(n.texto)),
  'lo que el modelo quiere recordar va a notas del narrador, no a los hechos del mundo');

// 16 · Doble clic: dos envíos a la vez son un turno y una petición.
respuestas = [{ estado: 200, contenido: json({ story: 'Vervek se encoge de hombros y vuelve a su yunque sin prisa.', choices: [] }) }];
const e8 = envios.filter((x) => x.op?.body).length;
const t8 = turnoAhora();
await Promise.all([m.sistema('turns').procesar('le pregunto a Vervek si cierra pronto'), m.sistema('turns').procesar('le pregunto a Vervek si cierra pronto')]);
comprobar(envios.filter((x) => x.op?.body).length === e8 + 1 && turnoAhora() === t8 + 1, 'un doble clic es un solo turno y una sola petición');

// 17 · Recargar: el mismo turno con el mismo texto lleva el mismo identificador.
const g = await m.sistema('saves').guardar('7', { silencioso: true });
respuestas = [{ estado: 200, contenido: json({ story: 'El río baja crecido y arrastra ramas.', choices: [] }) }];
await jugar('miro el río desde la orilla');
const idA = envios.filter((x) => x.op?.body).at(-1).op.headers['X-Arcanveil-Turno'];
m.store.reiniciar(); await m.sistema('saves').cargar('7');
await groq.probar(); groq.configurar({ consentido: true }); dm.cambiar('groq', { silencioso: true });
respuestas = [{ estado: 200, contenido: json({ story: 'El río baja crecido y arrastra ramas.', choices: [] }) }, { estado: 200, contenido: json({ story: 'Las ranas callan de golpe junto al vado.', choices: [] }) }];
await jugar('miro el río desde la orilla');
const idB = envios.filter((x) => x.op?.body).at(-1).op.headers['X-Arcanveil-Turno'];
m.store.reiniciar(); await m.sistema('saves').cargar('7');
await groq.probar(); groq.configurar({ consentido: true }); dm.cambiar('groq', { silencioso: true });
await jugar('escucho a las ranas del vado');
const idC = envios.filter((x) => x.op?.body).at(-1).op.headers['X-Arcanveil-Turno'];
comprobar(g.exito && idA === idB && idA !== idC, 'tras recargar, el mismo texto repite identificador (el puente no cobra dos veces lo que ya vio) y otro texto es otra petición', `${idA} · ${idB} · ${idC}`);

// 18 · La reparación remota no repite la tirada ni el turno.
const tiradas = () => m.entradas().filter((e) => e.voz === 'roll' || e.voz === 'tirada').length;
respuestas = [
  { estado: 200, contenido: json({ story: 'Recibes una espada de oro.', choices: [] }) },
  { estado: 200, contenido: json({ story: 'Buscas entre las piedras de la orilla y solo sale barro frío entre los dedos.', choices: [] }) },
];
const t9 = turnoAhora();
const r9 = tiradas();
await jugar('busco con cuidado entre las piedras de la orilla');
comprobar(turnoAhora() === t9 + 1 && tiradas() - r9 <= 1, 'con una corrección remota, la tirada y el turno se cuentan una vez', `turno +${turnoAhora() - t9}, tiradas +${tiradas() - r9}`);

/* ═══════════════════════════════════════════════════════════════════════════
   C. PIEZAS SUELTAS
   ═══════════════════════════════════════════════════════════════════════════ */

console.log('\n── C. Verificador y política, sueltos ──');
const ctx = { jugador: 'Iselda', texto: 'le digo a Vervek: «No te daré el anillo»', presentes: [{ nombre: 'Vervek' }], ausentes: ['Holda'], muertos: ['Rurik'], negativa: true, tirada: { exito: false }, lugar: 'Vado del Yunque', lugares: ['Saucedo', 'Vado del Yunque'], franja: 'manana', secretos: ['Vervek esconde armas robadas debajo de la fragua vieja'], inexistentes: ['carro'], caidos: ['Lobo gris'], yaContado: ['El río baja ancho y pardo, con la corriente pegada a la orilla.'] };
const tipos = (story) => verificar(story, ctx).map((p) => p.tipo);
comprobar(tipos('Rurik: «Vuelve mañana.»').includes('muerto_habla'), 'un muerto no habla');
comprobar(tipos('Iselda: «Vale, te lo doy.»').includes('palabras_del_jugador'), 'no se ponen palabras en boca del jugador');
comprobar(tipos('Le entregas el anillo a Vervek.').includes('ignora_negativa'), 'una negativa no se convierte en entrega');
comprobar(tipos('Lo consigues sin esfuerzo.').includes('contradice_tirada'), 'un fracaso no se narra como éxito');
comprobar(tipos('Llegas a Saucedo al caer la tarde.').includes('lugar_alterado'), 'no se cambia de lugar por narración');
comprobar(tipos('La luna ilumina la plaza vacía.').includes('fase_horaria'), 'no se cambia la hora');
comprobar(tipos('El Lobo gris ataca de nuevo.').includes('caido_ataca'), 'un enemigo caído no ataca');
comprobar(tipos('Vervek: «Guardo armas robadas debajo de la fragua vieja.»').includes('secreto_filtrado'), 'un secreto no se escapa');
comprobar(tipos('El río baja ancho y pardo, con la corriente pegada a la orilla.').includes('repeticion'), 'lo ya contado se detecta');
comprobar(tipos('Vervek: «Si pagas, pasas.»').length === 0, 'lo que dice un PNJ entre comillas no decide por el jugador');
comprobar(verificar('Te cubres tras la columna mientras el lobo gira.', { ...ctx, enCombate: true }).some((p) => p.tipo === 'geometria_inventada')
  && verificar('El segundo bandido intenta flanquearte por la izquierda.', { ...ctx, enCombate: true }).some((p) => p.tipo === 'geometria_inventada'),
  'en combate no se narran coberturas ni flancos que el motor no tiene');
const rep = repararLocal('Vervek asiente despacio.\nHolda: «Hola.»\nEl fuelle respira.', verificar('Vervek asiente despacio.\nHolda: «Hola.»\nEl fuelle respira.', ctx));
comprobar(rep.reparable && !rep.story.includes('Holda'), 'la reparación local quita solo la línea mala');
const au = autorizar([
  { tipo: 'canon', datos: { texto: 'Iselda es hija del rey' }, razon: 'x', evidencia: 'y' },
  { tipo: 'pnj_nuevo', datos: { nombre: 'Brenna', rol: 'pescadora' }, razon: 'entra', evidencia: 'narración' },
  { tipo: 'pnj_nuevo', datos: { nombre: 'Otra', rol: 'x' }, razon: 'entra', evidencia: 'narración' },
  { tipo: 'pista', datos: { texto: 'huellas bajo la fragua vieja de armas robadas escondidas' }, razon: 'x', evidencia: 'y' },
  { tipo: 'actitud', datos: { refId: 'v', delta: 3 } },
], { presentes: [{ refId: 'v', nombre: 'Vervek' }], conocidos: ['Vervek'], story: 'Brenna saluda desde la barca. Otra también.', secretos: ctx.secretos, hallazgo: true, implicados: ['v'] });
const pistaBuena = autorizar([{ tipo: 'pista', datos: { texto: 'marcas de rueda junto al pozo' }, razon: 'se ve', evidencia: 'tirada de percepción' }], { presentes: [], conocidos: [], story: '', secretos: ctx.secretos, hallazgo: true });
const pistaSinHallazgo = autorizar([{ tipo: 'pista', datos: { texto: 'marcas de rueda junto al pozo' }, razon: 'se ve', evidencia: 'narración' }], { presentes: [], conocidos: [], story: '', secretos: ctx.secretos, hallazgo: false });
comprobar(pistaBuena.aceptados.length === 1 && pistaSinHallazgo.rechazados.some((x) => /hallazgo/.test(x.motivo)), 'una pista entra solo con un hallazgo resuelto por el motor');
comprobar(au.rechazados.some((x) => x.tipo === 'canon') && au.aceptados.filter((x) => x.tipo === 'pnj_nuevo').length === 1
  && au.rechazados.some((x) => x.tipo === 'pista') && au.rechazados.some((x) => /evidencia/.test(x.motivo)),
  'la política: canon no, un PNJ nuevo por turno, ninguna pista que destape un secreto, nada sin evidencia', JSON.stringify(au));

falso.close();
console.log(`\n${casos - fallos}/${casos} comprobaciones`);
console.log(fallos ? `\n${fallos} fallos.` : '\nTodo bien.');
process.exit(fallos ? 1 : 0);
