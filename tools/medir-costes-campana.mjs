/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCANVEIL · tools/medir-costes-campana.mjs
 * ---------------------------------------------------------------------------
 * Cuánto se ENVIARÍA a un modelo en campañas largas. Offline, sin red y sin
 * claves: es una medición de tamaño y de número de peticiones, no una
 * factura ni una prueba de calidad.
 *
 * Qué hace:
 *   · Juega partidas nuevas con el motor entero (semillas 9303 y 9505 por
 *     defecto, personajes ficticios), guardando y cargando cada N turnos.
 *   · El narrador es el proveedor Groq del juego con un TRANSPORTE DOBLE
 *     inyectado: nada sale del equipo. `fetch` global, `http(s).request` y
 *     `net.connect` quedan bloqueados y cuentan los intentos; si alguno
 *     ocurre, la herramienta falla (código 2).
 *   · Cuenta TODAS las peticiones al modelo: de turno, reparaciones,
 *     reintentos (mismo identificador de turno) y cualquier otra forma
 *     («otro»: p. ej. un resumen, si algún día se pide). Las comprobaciones
 *     locales del puente (/probar, /estado) van aparte: no son del modelo.
 *   · Mide los mensajes enteros, system incluido, en caracteres; lo que
 *     devuelve el doble; si la instantánea pasó del presupuesto y cuánto
 *     canon quedó fuera; y el tamaño al principio, a la mitad y al final.
 *
 * Qué NO es:
 *   · Tokens: son una ESTIMACIÓN desde caracteres (divisores 4 / 3,5 / 3).
 *     Un proveedor real dará `usage` del servidor; esta herramienta no lo
 *     pide ni hace recuento remoto de tokens.
 *   · Salida: la del doble no es la de un modelo. Para el coste se usan
 *     salidas SUPUESTAS (400 / 600 / 800 tokens por petición), aparte.
 *   · Errores: el doble «adversario» provoca fallos A PROPÓSITO (ver
 *     `narrador-simulado.mjs`); su tasa de reparaciones es ARTIFICIAL, no la
 *     de un modelo real ni una medida de calidad narrativa.
 *   · Coste: tarifa configurable con fecha, moneda y fuente. Sin caché
 *     gratis ni descuentos supuestos; sin razonamiento extendido (thinking)
 *     en el escenario base. Fuera del cálculo: tienda, impuestos,
 *     infraestructura, imágenes, reembolsos y tipo de cambio (solo USD).
 *   · Permiso: no autoriza ninguna prueba de pago.
 *
 *   node tools/medir-costes-campana.mjs --turnos 100 --salida costes.json
 *     [--semillas 9303,9505] [--modo adversario|limpio] [--guardar-cada 25]
 *     [--tarifa-entrada 1 --tarifa-salida 5 --tarifa-fecha 2026-10-06
 *      --tarifa-fuente URL --tarifa-modelo "Claude Haiku 4.5"]
 *   node tools/medir-costes-campana.mjs --autoprueba
 * ═══════════════════════════════════════════════════════════════════════════
 */

import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { writeFileSync } from 'node:fs';

export const VERSION_HERRAMIENTA = '1.0.0';
const LIMITE_DURO_TURNOS = 500;

/* ─── Red bloqueada antes de cargar nada del motor ─────────────────────── */

const intentosRed = [];
const bloquear = (que) => (...a) => {
  intentosRed.push({ que, destino: String(a[0]?.href ?? a[0]?.host ?? a[0] ?? '').slice(0, 120) });
  throw new Error(`red bloqueada (${que})`);
};
globalThis.fetch = async (url) => { intentosRed.push({ que: 'fetch', destino: String(url).slice(0, 120) }); throw new Error('red bloqueada (fetch)'); };
http.request = bloquear('http.request');
http.get = bloquear('http.get');
https.request = bloquear('https.request');
https.get = bloquear('https.get');
net.connect = bloquear('net.connect');
net.createConnection = bloquear('net.createConnection');

const { crearMotor } = await import('./motor-sin-ventana.mjs');
const { modeloAdversario } = await import('./narrador-simulado.mjs');

/* ─── Argumentos ───────────────────────────────────────────────────────── */

const args = process.argv.slice(2);
const valor = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
function salir(msg, codigo = 1) { console.error(msg); process.exit(codigo); }

/* ─── Clasificador de peticiones (lo prueba --autoprueba) ──────────────── */

/**
 * Lleva la cuenta de lo que pasa por el transporte.
 * @returns {{anotar: Function, registro: Array, resumen: Function}}
 */
export function contador() {
  const registro = [];
  const vistos = new Set();
  function anotar({ url, cuerpo, idTurno, turnoMotor, semilla, salida, estado, ms }) {
    if (!/\/v1\/chat\/completions$/.test(url)) {
      registro.push({ tipo: 'control', url: url.replace(/^https?:\/\/[^/]+/, ''), semilla, turno: turnoMotor });
      return;
    }
    const mensajes = cuerpo?.messages ?? [];
    const reparacion = mensajes.length === 4 && /contradice el estado/.test(mensajes[3]?.content ?? '');
    const clave = `${semilla}:${idTurno}`;
    const reintento = vistos.has(clave);
    vistos.add(clave);
    const tipo = reintento ? 'reintento' : reparacion ? 'reparacion' : mensajes.length === 2 && mensajes[0]?.role === 'system' ? 'turno' : 'otro';
    const porRol = {};
    for (const m of mensajes) porRol[m.role] = (porRol[m.role] ?? 0) + String(m.content ?? '').length;
    let inst = null;
    const user = mensajes[1]?.content ?? '';
    try { inst = JSON.parse(user.slice(user.indexOf('{'), user.lastIndexOf('}') + 1)); } catch { inst = null; }
    registro.push({
      tipo, semilla, turno: turnoMotor, idTurno, estado, ms,
      entradaCaracteres: mensajes.reduce((a, m) => a + String(m.content ?? '').length, 0),
      porRol,
      salidaCaracteresDoble: String(salida ?? '').length,
      instantanea: inst ? { caracteres: inst.medida?.caracteres ?? null, sobrePresupuesto: (inst.medida?.caracteres ?? 0) > 6000, canonOmitido: inst.canonOmitido?.n ?? 0 } : null,
      maxTokensPedidos: cuerpo?.max_tokens ?? null,
    });
  }
  function resumen(filtro = () => true) {
    const r = registro.filter(filtro);
    const modelo = r.filter((x) => x.tipo !== 'control');
    const cuenta = (t) => modelo.filter((x) => x.tipo === t).length;
    return {
      peticiones: modelo.length,
      porTipo: { turno: cuenta('turno'), reparacion: cuenta('reparacion'), reintento: cuenta('reintento'), otro: cuenta('otro') },
      controlesPuente: r.length - modelo.length,
      entradaCaracteres: modelo.reduce((a, x) => a + x.entradaCaracteres, 0),
      systemCaracteres: modelo.reduce((a, x) => a + (x.porRol.system ?? 0), 0),
      salidaCaracteresDoble: modelo.reduce((a, x) => a + x.salidaCaracteresDoble, 0),
      instantaneasSobrePresupuesto: modelo.filter((x) => x.instantanea?.sobrePresupuesto).length,
      peticionesConCanonOmitido: modelo.filter((x) => (x.instantanea?.canonOmitido ?? 0) > 0).length,
    };
  }
  return { anotar, registro, resumen };
}

/**
 * Un transporte doble: responde lo que diga `responder` y avisa al contador.
 * @param {Object} opciones
 * @param {(cuerpo: Object, n: number) => ({status?: number, texto?: string, retryAfter?: number})} opciones.responder
 */
export function transporte({ responder, cont, semilla, turnoMotor }) {
  let n = 0;
  return async (url, op = {}) => {
    const t0 = Date.now();
    const ok = (status, datos, cabeceras = {}) => ({ ok: status >= 200 && status < 300, status, headers: { get: (h) => cabeceras[h.toLowerCase()] ?? null }, json: async () => datos });
    if (/\/(?:probar|estado)$/.test(url)) {
      cont.anotar({ url, semilla, turnoMotor: turnoMotor() });
      return ok(200, { servicio: 'arcanveil-puente-groq/2', ok: true, disponible: true });
    }
    const cuerpo = JSON.parse(op.body ?? '{}');
    const idTurno = op.headers?.['X-Arcanveil-Turno'] ?? '';
    n += 1;
    const r = responder(cuerpo, n) ?? {};
    const status = r.status ?? 200;
    cont.anotar({ url, cuerpo, idTurno, turnoMotor: turnoMotor(), semilla, salida: r.texto ?? '', estado: status, ms: Date.now() - t0 });
    if (status !== 200) return ok(status, { error: { message: 'doble' } }, r.retryAfter ? { 'retry-after': String(r.retryAfter) } : {});
    return ok(200, { choices: [{ message: { content: r.texto } }], usage: null });
  };
}

/** Respuesta limpia y válida: nunca provoca reparación. */
function respuestaLimpia(cuerpo) {
  const user = cuerpo.messages?.[1]?.content ?? '';
  let inst = {};
  try { inst = JSON.parse(user.slice(user.indexOf('{'), user.lastIndexOf('}') + 1)); } catch { inst = {}; }
  const lugar = inst.lugar?.nombre ?? 'el camino';
  return JSON.stringify({ story: `Sigues en ${lugar}. Nada cambia por ahora.`, choices: [{ label: 'Mirar alrededor', intent: 'observe', risk: 'low' }], proposedEffects: [], playerUpdates: {}, mood: 'neutro' });
}

/* ─── Una campaña ───────────────────────────────────────────────────────── */

const ACCIONES = [
  'miro alrededor', 'hablo con {a}', 'le pregunto a {a} qué se cuenta por aquí', 'le pregunto a {b} por el camino del norte',
  'examino el suelo con cuidado', 'escucho lo que dice la gente', 'compro una ración a {a}', 'cuento las monedas que llevo',
  'me acerco al puente', 'le pregunto a {b} si ha visto algo raro', 'espero media hora', 'busco un sitio tranquilo',
  'le digo a {a} que vuelvo luego', 'reviso mi equipo', 'observo el cielo', 'pregunto por trabajo',
  'me fijo en lo que está pasando', 'le pregunto a {a} quién manda aquí', 'sigo por la calle principal', 'descanso un momento',
];

async function campana({ semilla, turnos, modo, guardarCada, cont }) {
  const m = await crearMotor({ semilla });
  await m.empezar({ nombre: semilla % 2 ? 'Sive' : 'Orin', raza: 'valdes', clase: semilla % 2 ? 'rastreador' : 'portavoz', trasfondo: 'errante', genero: semilla % 2 ? 'f' : 'm' });

  const adversario = modo === 'adversario' ? modeloAdversario() : null;
  const responder = (cuerpo) => ({ texto: adversario ? adversario.responder(cuerpo) : respuestaLimpia(cuerpo) });
  const dm = m.sistema('dungeonmaster');
  const groq = dm.proveedor('groq');
  groq._fetch = transporte({ responder, cont, semilla, turnoMotor: () => m.ver('meta.turno') });
  groq._dormirMs = async () => {};
  await groq.probar();
  groq.configurar({ consentido: true });
  dm.cambiar('groq', { silencioso: true });

  let ejecutados = 0;
  let aclaraciones = 0;
  let combates = 0;
  let cargas = 0;
  const t0 = Date.now();
  for (let i = 0; i < turnos; i++) {
    if (m.ver('combat.activo', false)) {
      combates += 1;
      const c = m.sistema('combat');
      for (let k = 0; k < 40 && m.ver('combat.activo', false); k++) {
        for (let w = 0; w < 100 && !c.esperandoJugador && m.ver('combat.activo', false); w++) await new Promise((r) => setTimeout(r, 5));
        if (c.esperandoJugador) await c.jugadaLibre(k % 3 === 2 ? 'huyo' : 'ataco');
      }
    }
    const gente = (m.ver('npcs.presentes', []) ?? []).map((id) => m.ver(`npcs.conocidos.porId.${id}.nombre`)).filter(Boolean);
    const frase = ACCIONES[i % ACCIONES.length].replace('{a}', gente[0] ?? 'alguien').replace('{b}', gente[1] ?? gente[0] ?? 'alguien');
    const antes = m.ver('meta.turno');
    const r = await m.sistema('turns').procesar(frase);
    if (r?.aclaracion || r?.rechazada) aclaraciones += 1;
    else if (m.ver('meta.turno') > antes) ejecutados += 1;
    if (guardarCada && (i + 1) % guardarCada === 0) { await m.guardarYCargar(); cargas += 1; }
  }
  return {
    semilla, turnosPedidos: turnos, turnosEjecutados: ejecutados, aclaraciones, combates, guardarCargar: cargas,
    pulsosMotor: m.ver('meta.turno'), latenciaLocalMs: Date.now() - t0,
  };
}

/* ─── Coste estimado ───────────────────────────────────────────────────── */

function estimar(resumen, tarifa) {
  const divisores = [4, 3.5, 3];
  const salidas = [400, 600, 800];
  const escenarios = [];
  for (const d of divisores) {
    for (const s of salidas) {
      const entrada = Math.ceil(resumen.entradaCaracteres / d);
      const salida = s * resumen.peticiones;
      const usd = entrada / 1e6 * tarifa.entradaUSDporM + salida / 1e6 * tarifa.salidaUSDporM;
      escenarios.push({ caracteresPorToken: d, salidaSupuestaPorPeticion: s, tokensEntradaEstimados: entrada, tokensSalidaSupuestos: salida, usd: Number(usd.toFixed(4)) });
    }
  }
  return escenarios;
}

/* ─── Autoprueba del contador ──────────────────────────────────────────── */

async function autoprueba() {
  let fallos = 0;
  const ok = (bien, t, d = '') => { console.log(`${bien ? 'OK ' : 'MAL'}  ${t}${bien ? '' : `  ${d}`}`); if (!bien) fallos += 1; };
  const sis = { role: 'system', content: 'S'.repeat(100) };
  const usr = { role: 'user', content: '{"medida":{"caracteres":7000},"canonOmitido":{"n":2}}' };

  // Sin reparaciones: tres turnos limpios.
  let c = contador();
  for (let i = 1; i <= 3; i++) c.anotar({ url: 'http://x/v1/chat/completions', cuerpo: { messages: [sis, usr] }, idTurno: `t${i}`, semilla: 1, turnoMotor: i, salida: 'abc' });
  let r = c.resumen();
  ok(r.peticiones === 3 && r.porTipo.turno === 3 && r.porTipo.reparacion === 0, 'tres turnos limpios: 3 peticiones de turno, 0 reparaciones', JSON.stringify(r.porTipo));
  ok(r.entradaCaracteres === 3 * (100 + usr.content.length) && r.systemCaracteres === 300, 'mide los mensajes enteros, system incluido', `${r.entradaCaracteres}`);
  ok(r.instantaneasSobrePresupuesto === 3 && r.peticionesConCanonOmitido === 3, 'detecta instantánea sobre presupuesto y canon omitido');

  // Una reparación.
  c = contador();
  c.anotar({ url: 'http://x/v1/chat/completions', cuerpo: { messages: [sis, usr] }, idTurno: 't1', semilla: 1, turnoMotor: 1 });
  c.anotar({ url: 'http://x/v1/chat/completions', cuerpo: { messages: [sis, usr, { role: 'assistant', content: 'x' }, { role: 'user', content: 'Tu respuesta contradice el estado del juego:' }] }, idTurno: 't1-r', semilla: 1, turnoMotor: 1 });
  r = c.resumen();
  ok(r.peticiones === 2 && r.porTipo.turno === 1 && r.porTipo.reparacion === 1, 'turno + reparación: 2 peticiones, 1 reparación', JSON.stringify(r.porTipo));

  // Error y reintento: el mismo identificador de turno dos veces.
  c = contador();
  c.anotar({ url: 'http://x/v1/chat/completions', cuerpo: { messages: [sis, usr] }, idTurno: 't1', semilla: 1, turnoMotor: 1, estado: 429 });
  c.anotar({ url: 'http://x/v1/chat/completions', cuerpo: { messages: [sis, usr] }, idTurno: 't1', semilla: 1, turnoMotor: 1, estado: 200 });
  r = c.resumen();
  ok(r.peticiones === 2 && r.porTipo.turno === 1 && r.porTipo.reintento === 1, '429 y reintento: el reintento cuenta como petición aparte', JSON.stringify(r.porTipo));

  // Un resumen u otra forma desconocida, y controles del puente aparte.
  c = contador();
  c.anotar({ url: 'http://x/v1/chat/completions', cuerpo: { messages: [{ role: 'user', content: 'resume esto' }] }, idTurno: 'res', semilla: 1, turnoMotor: 5 });
  c.anotar({ url: 'http://x/probar', semilla: 1, turnoMotor: 0 });
  r = c.resumen();
  ok(r.peticiones === 1 && r.porTipo.otro === 1 && r.controlesPuente === 1, 'un resumen cuenta como «otro»; /probar no es una petición al modelo', JSON.stringify(r));

  // Extremo a extremo con el proveedor de verdad y un 429 corto.
  const cont = contador();
  const m = await crearMotor({ semilla: 9303 });
  await m.empezar({ nombre: 'Sive', raza: 'valdes', clase: 'rastreador', trasfondo: 'errante', genero: 'f' });
  const groq = m.sistema('dungeonmaster').proveedor('groq');
  let llamada = 0;
  groq._fetch = transporte({ responder: (cuerpo) => { llamada += 1; return llamada === 1 ? { status: 429, retryAfter: 1 } : { texto: respuestaLimpia(cuerpo) }; }, cont, semilla: 9303, turnoMotor: () => m.ver('meta.turno') });
  groq._dormirMs = async () => {};
  await groq.probar();
  groq.configurar({ consentido: true });
  m.sistema('dungeonmaster').cambiar('groq', { silencioso: true });
  await m.jugar('miro alrededor');
  await m.jugar('le pregunto a Cormir qué se cuenta');
  r = cont.resumen();
  ok(r.porTipo.reintento === 1 && r.porTipo.turno >= 1 && r.controlesPuente >= 1 && groq.solicitudes === r.peticiones - 1,
    `motor real: un 429 corto se reintenta y se cuenta (${JSON.stringify(r.porTipo)}; el proveedor anota ${groq.solicitudes} con éxito)`);
  ok(intentosRed.length === 0, 'ninguna petición salió del equipo', JSON.stringify(intentosRed));
  console.log(fallos ? `\n${fallos} fallos.` : '\nTodo bien.');
  process.exit(fallos ? 1 : 0);
}

/* ─── Principal ─────────────────────────────────────────────────────────── */

if (args.includes('--autoprueba')) await autoprueba();

const turnos = Number(valor('--turnos', '100'));
if (!Number.isInteger(turnos) || turnos < 1 || turnos > LIMITE_DURO_TURNOS) salir(`--turnos tiene que ser un entero entre 1 y ${LIMITE_DURO_TURNOS} (llegó «${valor('--turnos')}»).`);
const semillas = String(valor('--semillas', '9303,9505')).split(',').map(Number);
if (!semillas.length || semillas.some((s) => !Number.isInteger(s) || s < 0)) salir('--semillas: enteros separados por comas.');
const modo = valor('--modo', 'adversario');
if (!['adversario', 'limpio'].includes(modo)) salir('--modo: adversario o limpio.');
const guardarCada = Number(valor('--guardar-cada', '25'));
if (!Number.isInteger(guardarCada) || guardarCada < 0) salir('--guardar-cada: entero ≥ 0.');
const tarifa = {
  modelo: valor('--tarifa-modelo', 'Claude Haiku 4.5'),
  entradaUSDporM: Number(valor('--tarifa-entrada', '1')),
  salidaUSDporM: Number(valor('--tarifa-salida', '5')),
  moneda: 'USD',
  fecha: valor('--tarifa-fecha', '2026-10-06'),
  fuente: valor('--tarifa-fuente', 'https://platform.claude.com/docs/en/about-claude/pricing'),
  nota: 'Tarifa de referencia dada en el encargo del 6-oct-2026; no consultada por esta herramienta. Sin caché, lotes ni descuentos.',
};
if (![tarifa.entradaUSDporM, tarifa.salidaUSDporM].every((x) => Number.isFinite(x) && x >= 0)) salir('Tarifas: números ≥ 0.');

const cont = contador();
const campanas = [];
for (const semilla of semillas) {
  const c = await campana({ semilla, turnos, modo, guardarCada, cont });
  const resumen = cont.resumen((x) => x.semilla === semilla);
  const deEsta = cont.registro.filter((x) => x.semilla === semilla && x.tipo !== 'control');
  const tercio = Math.max(1, Math.floor(deEsta.length / 10));
  const media = (l) => (l.length ? Math.round(l.reduce((a, x) => a + x.entradaCaracteres, 0) / l.length) : 0);
  campanas.push({
    ...c, ...resumen,
    entradaMediaCaracteres: { principio: media(deEsta.slice(0, tercio)), mitad: media(deEsta.slice(Math.floor(deEsta.length / 2) - Math.floor(tercio / 2), Math.floor(deEsta.length / 2) + Math.ceil(tercio / 2))), final: media(deEsta.slice(-tercio)) },
    escenarios: estimar(resumen, tarifa),
  });
}

const conjunto = cont.resumen();
const informe = {
  herramienta: 'medir-costes-campana', version: VERSION_HERRAMIENTA, fecha: new Date().toISOString(),
  modo, aviso: modo === 'adversario' ? 'Las reparaciones las provoca el doble a propósito: tasa ARTIFICIAL, no la de un modelo real.' : 'Doble limpio: no provoca reparaciones.',
  semillas, turnosPedidosPorCampana: turnos,
  tokens: 'ESTIMACIÓN desde caracteres; no es usage de un servidor.',
  salida: 'La del doble no es la de un modelo: el coste usa salidas SUPUESTAS por petición.',
  fueraDelCalculo: ['tienda', 'impuestos', 'infraestructura', 'imágenes', 'reembolsos', 'tipo de cambio (solo USD)', 'caché (no se supone gratis)', 'razonamiento extendido (thinking)'],
  tarifa,
  red: { intentos: intentosRed.length, detalle: intentosRed },
  campanas,
  conjunto: {
    ...conjunto,
    turnosPedidos: campanas.reduce((a, c) => a + c.turnosPedidos, 0),
    turnosEjecutados: campanas.reduce((a, c) => a + c.turnosEjecutados, 0),
    aclaraciones: campanas.reduce((a, c) => a + c.aclaraciones, 0),
    escenarios: estimar(conjunto, tarifa),
  },
};

const destino = valor('--salida', null);
if (destino) writeFileSync(destino, JSON.stringify(informe, null, 2));

console.log(`medir-costes-campana ${VERSION_HERRAMIENTA} · modo ${modo} · ${semillas.length} campañas de ${turnos} turnos pedidos`);
for (const c of campanas) {
  console.log(`  semilla ${c.semilla}: ${c.turnosEjecutados}/${c.turnosPedidos} turnos ejecutados, ${c.aclaraciones} aclaraciones, ${c.combates} combates, ${c.guardarCargar} guardar/cargar · ${c.peticiones} peticiones (turno ${c.porTipo.turno}, reparación ${c.porTipo.reparacion}, reintento ${c.porTipo.reintento}, otro ${c.porTipo.otro}) · entrada ${c.entradaCaracteres} car. (system ${c.systemCaracteres}) · media principio/mitad/final ${c.entradaMediaCaracteres.principio}/${c.entradaMediaCaracteres.mitad}/${c.entradaMediaCaracteres.final} · sobre presupuesto ${c.instantaneasSobrePresupuesto} · con canon omitido ${c.peticionesConCanonOmitido} · ${c.latenciaLocalMs} ms`);
}
const esc = informe.conjunto.escenarios;
const pick = (d, s) => esc.find((e) => e.caracteresPorToken === d && e.salidaSupuestaPorPeticion === s).usd;
console.log(`  conjunto: ${conjunto.peticiones} peticiones (${conjunto.porTipo.reparacion} reparaciones${modo === 'adversario' ? ' INDUCIDAS' : ''}), ${informe.conjunto.turnosEjecutados}/${informe.conjunto.turnosPedidos} turnos ejecutados`);
console.log(`  ESTIMACIÓN USD (${tarifa.modelo}, $${tarifa.entradaUSDporM}/M entrada, $${tarifa.salidaUSDporM}/M salida, ${tarifa.fecha}): ÷3,5 con 400/600/800 tok de salida supuesta = $${pick(3.5, 400)} / $${pick(3.5, 600)} / $${pick(3.5, 800)} · rango completo $${Math.min(...esc.map((e) => e.usd))}–$${Math.max(...esc.map((e) => e.usd))}`);
console.log(`  red: ${intentosRed.length} intentos de salir del equipo${destino ? ` · JSON en ${destino}` : ''}`);
console.log('  No es una factura: tokens estimados, salida supuesta, sin usage real.');
if (intentosRed.length) process.exit(2);
