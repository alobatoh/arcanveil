#!/usr/bin/env node
/** Regresión real de la PWA en Chrome, sin dependencias externas. */
import { spawn, spawnSync } from 'node:child_process';
import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { existsSync, readdirSync, writeFileSync as escribirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { sujetoRetrato as encargoRetrato } from '../src/art/rasgos.js';
import { crearProxyImagen } from './imagen-local-proxy.mjs';
import { decirDuracion } from '../src/engine/Espera.js';
import { nivelParaXP } from '../src/player/Progression.js';
import { crearPersonajeUI } from './dobles/creacion-ui.mjs';

const ROOT = process.cwd();
const PORT = 8765;
const DEBUG = 9228;
const URL_APP = `http://127.0.0.1:${PORT}/app/index.html`;
const out = process.argv.includes('--capturas') ? resolve('dist/regresion') : null;
const desktop = process.argv.includes('--desktop');

/**
 * `--sin-ia` bloquea el servicio de imágenes para probar el respaldo.
 *
 * La regresión tiene que valer con red y sin ella, porque las dos son
 * situaciones reales del jugador. Con la opción puesta, el retrato de IA no
 * puede cargar y el vectorial es la única salida posible: si el juego sigue
 * en pie y con cara, el respaldo funciona de verdad y no de palabra.
 */
const sinIA = process.argv.includes('--sin-ia');
/**
 * `--solo-pestanas`: solo la etapa #8 (guardado coordinado entre pestañas)
 * tras preparar una campaña real y llenar las demás ranuras (FIXTURE). Sirve
 * para comparar la base y el HEAD en Chrome real sin la regresión entera.
 */
const soloPestanas = process.argv.includes('--solo-pestanas');
/** `--semilla N`: la semilla del azar de la página (FIXTURE; ver más abajo). */
const semilla = Number(process.argv[process.argv.indexOf('--semilla') + 1]) || (process.argv.includes('--semilla') ? 0 : 20261008);
console.log(`semilla de la partida: ${semilla}`);
const viewport = desktop ? { width: 1440, height: 900, label: '1440x900' } : { width: 390, height: 844, label: '390x844' };
// Antes de abrir el navegador: ¿el trabajador de servicio conoce el código
// actual?
//
// Tres módulos que se cargan al arrancar pasaron días fuera del cache y esta
// regresión no lo vio: su prueba sin red corre con el cache HTTP del
// navegador todavía caliente, así que el archivo aparecía aunque el
// trabajador no lo tuviera. Instalado de verdad y sin conexión, el juego no
// arrancaba. Comprobarlo aquí cuesta un instante y no depende del navegador.
{
  const sw = spawnSync(process.execPath, ['tools/generar-sw.mjs', '--revisar'], { cwd: ROOT, encoding: 'utf8' });
  if (sw.status !== 0) {
    console.error((sw.stdout || sw.stderr || '').trim() || 'sw.js está desfasado.');
    process.exit(1);
  }
}

const profile = await mkdtemp(join(tmpdir(), 'arcanveil-chrome-'));
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const children = [];
const stop = async () => {
  for (const p of children) { try { p.kill('SIGTERM'); } catch {} }
  await wait(400);
  for (let i=0;i<5;i++){ try { await rm(profile,{recursive:true,force:true}); break; } catch { await wait(200); } }
};
process.on('SIGINT', () => stop().finally(() => process.exit(130)));
process.on('SIGTERM', () => stop().finally(() => process.exit(143)));

function launch(cmd, args) {
  const p = spawn(cmd, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(p);
  return p;
}
async function json(url, init) {
  for (let i = 0; i < 150; i++) {
    try { const r = await fetch(url, init); if (r.ok) { const t=await r.text(); try{return JSON.parse(t)}catch{return t} } } catch {}
    await wait(100);
  }
  throw new Error(`No responde ${url}`);
}

const server = launch(process.execPath, ['tools/servir.mjs', '--puerto', String(PORT)]);
let serverErr = ''; server.stderr.on('data', d => { serverErr += d; });

// El generador de imágenes: el puente de verdad en su puerto, con un
// proveedor falso que devuelve un PNG de 1×1 (ni ComfyUI ni red). Cada
// generación apunta su semilla: dos versiones tienen que ser dos semillas.
const PNG_1X1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const generadas = [];
let estudio = 'sin probar';
let borrado = 'sin probar';
let puenteImagen = null;
const cacheImagen = await mkdtemp(join(tmpdir(), 'arcanveil-imagenes-'));
if (!sinIA) {
  const candidato = crearProxyImagen({
    origen: `http://127.0.0.1:${PORT}`,
    cache: cacheImagen,
    proveedor: { id: 'falso', salud: async () => ({ disponible: true }), generar: async ({ semilla }) => { generadas.push(semilla); return { bytes: PNG_1X1, tipo: 'image/png' }; } },
  });
  puenteImagen = await candidato.escuchar().then(() => candidato, () => null);
}
/** Candidatas que el puente tiene en disco (de un dueño, o todas). */
const enCache = (prefijo = '') => { try { return readdirSync(cacheImagen).filter((n) => n.endsWith('.img') && n.startsWith(prefijo)); } catch { return []; } };
async function esperarCache(cond, ms = 8000) {
  const t0 = Date.now();
  while (!cond() && Date.now() - t0 < ms) await new Promise((ok) => setTimeout(ok, 100));
  return cond();
}
/** Claves y fechas de lo que hay en la galería del navegador. */
const GALERIA = `new Promise((ok) => { const p = indexedDB.open('arcanveil-imagenes'); p.onsuccess = () => { const d = p.result; if (!d.objectStoreNames.contains('aprobadas')) { d.close(); return ok([]); } const q = d.transaction('aprobadas').objectStore('aprobadas').getAll(); q.onsuccess = () => { d.close(); ok(q.result.map((x) => ({ clave: x.clave, creada: x.creada }))); }; q.onerror = () => ok([]); }; p.onerror = () => ok([]); })`;
const pararPuenteImagen = async () => {
  if (puenteImagen) await puenteImagen.cerrar().catch(() => {});
  await rm(cacheImagen, { recursive: true, force: true }).catch(() => {});
};
/**
 * Dónde está Chrome.
 *
 * Estaba escrito `google-chrome` a secas, que solo existe en Linux: en un
 * Windows recién clonado la regresión no arrancaba y el error era un ENOENT
 * sin pistas. Se prueban los sitios de siempre de cada sistema y se puede
 * forzar con `CHROME_BIN` para los casos raros.
 */
function buscarChrome() {
  if (process.env.CHROME_BIN) return process.env.CHROME_BIN;

  const candidatos = {
    win32: [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      `${process.env.LOCALAPPDATA ?? ''}\\Google\\Chrome\\Application\\chrome.exe`,
    ],
    darwin: [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
    ],
  }[process.platform] ?? ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'];

  for (const c of candidatos) {
    // En Linux los candidatos son nombres sueltos y los resuelve el PATH.
    if (!c.includes('/') && !c.includes('\\')) return c;
    if (existsSync(c)) return c;
  }

  throw new Error('No encuentro Chrome. Indícalo con CHROME_BIN=/ruta/a/chrome');
}

const chrome = launch(buscarChrome(), [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
  `--window-size=${viewport.width},${viewport.height}`, `--remote-debugging-port=${DEBUG}`,
  `--user-data-dir=${profile}`, 'about:blank',
]);
let chromeErr = ''; chrome.stderr.on('data', d => { chromeErr += d; });

let ws;
let seq = 0;
const pending = new Map();
const exceptions = [];
/**
 * Peticiones de la página a cualquier sitio que no sea esta máquina. El
 * juego no pide nada fuera: ni retratos ni ilustraciones (antes, a
 * Pollinations en cada escena). Tiene que quedar vacío.
 */
const externos = [];
/**
 * Eventos de navegación de la pestaña principal (marco, carga, contexto,
 * cierre), para no evaluar en un documento provisional (ver `navegarHasta`).
 */
const EVENTOS_NAVEGACION = new Set(['Page.frameNavigated', 'Page.loadEventFired', 'Runtime.executionContextCreated', 'Inspector.detached', 'Target.detachedFromTarget']);
const eventosPrincipal = [];
/**
 * Peticiones vistas (id → URL y quién la pidió), para que una petición
 * abortada diga QUÉ archivo era y desde dónde se pidió, no solo su id (#12).
 * Solo ruta y tipo: ni cuerpos ni cabeceras.
 */
const peticionesPrincipal = new Map();
function apuntarPeticion(mapa, p) {
  const ruta = (u) => { try { const x = new URL(u); return x.origin === `http://127.0.0.1:${PORT}` ? x.pathname : `${x.origin}${x.pathname}`; } catch { return String(u).slice(0, 80); } };
  const ini = p.initiator ?? {};
  mapa.set(p.requestId, { url: ruta(p.request.url), por: ini.type ?? null, desde: ini.url ? ruta(ini.url) : (ini.stack?.callFrames?.[0]?.url ? ruta(ini.stack.callFrames[0].url) : null) });
  if (mapa.size > 1500) mapa.delete(mapa.keys().next().value);
}
const peticionDe = (mapa, id, tipo) => ({ ...(mapa.get(id) ?? { url: `(petición ${id} no vista)` }), recurso: tipo ?? null });
/** Últimas incidencias de la pestaña principal (texto del error y URL; nada de la partida). */
const incidenciasPrincipal = [];
const apuntarPrincipal = (x) => { incidenciasPrincipal.push({ ...x, t: Date.now() }); if (incidenciasPrincipal.length > 30) incidenciasPrincipal.shift(); };
function cdp(method, params = {}) {
  const id = ++seq;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}
/** Etapa en curso, con hora: el registro dice dónde se paró y cuándo. */
const T0 = Date.now();
let etapaActual = 'arranque';
function etapa(nombre) {
  etapaActual = nombre;
  console.log(`[${((Date.now() - T0) / 1000).toFixed(1).padStart(6)} s] ${nombre}`);
}
async function evaluate(expression, awaitPromise = true) {
  let r;
  try {
    r = await cdp('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
  } catch (e) {
    // Una navegación a mitad de una evaluación corta la respuesta. Si no se
    // esperaba, es un fallo con su etapa, no algo que ignorar.
    throw new Error(`${e.message} (etapa «${etapaActual}», al evaluar: ${expression.slice(0, 120)})`);
  }
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
  return r.result?.value;
}
/** El estado del motor cuando algo no llega: para saber POR QUÉ. */
const DIAGNOSTICO = `(() => { try { const A = window.ARCANVEIL; if (!A?.motor?.listo) return { motor: 'sin arrancar', arcanveil: typeof A, url: location.href, readyState: document.readyState, pantalla: document.body?.dataset?.activeScreen ?? null, clases: document.body?.className ?? null, rotulo: document.getElementById('arranque-texto')?.textContent ?? null, fallos: document.querySelector('#fallos')?.textContent?.slice(0, 300) ?? null, controlada: Boolean(navigator.serviceWorker?.controller),
    // #12: ¿llegó a ejecutarse app.js? ¿qué archivo no llegó? ¿qué trabajador de servicio manda?
    arranque: window.__arcanveilArranque ? { fase: window.__arcanveilArranque.fase, fallidos: window.__arcanveilArranque.fallidos, ms: Date.now() - window.__arcanveilArranque.inicio } : null,
    sw: navigator.serviceWorker?.controller ? { script: navigator.serviceWorker.controller.scriptURL.split('/').pop(), estado: navigator.serviceWorker.controller.state } : null,
    modulos: performance.getEntriesByType('resource').filter((r) => r.initiatorType === 'script' || /\\.js$/.test(r.name)).length };
  const c = A.sistema('combat'); return { pantalla: document.body.dataset.activeScreen, fase: A.ver('meta.fase'), run: A.ver('meta.runId'), muerte: A.ver('meta.muerte')?.causa ?? null,
  vida: A.ver('player.vida.actual'), combate: A.ver('combat.activo', false), esperando: c?.esperandoJugador ?? null, encuentro: Boolean(A.sistema('exploration')?.encuentroActivo),
  viaje: A.sistema('travel')?.paraInterfaz?.() ?? null, ultimas: A.ver('narrative.entradas', []).slice(-4).map((e) => e.voz + ': ' + String(e.texto ?? '').slice(0, 90)) }; } catch (e) { return { error: String(e) }; } })()`;
async function until(expression, timeout = 12000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await evaluate(`Boolean(${expression})`)) return;
    await wait(100);
  }
  let estado = null;
  try { estado = await evaluate(DIAGNOSTICO); } catch (e) { estado = { sinDiagnostico: e.message }; }
  const recientes = incidenciasPrincipal.filter((x) => x.t >= start - 5000).map(({ t, ...x }) => x);
  const navs = eventosPrincipal.filter((e) => e.t >= start - 5000 && e.method === 'Page.frameNavigated' && !e.params.frame.parentId).map((e) => e.params.frame.url);
  const nombreFoto = `principal-fallo-${viewport.label}.png`;
  await fotoRapida(nombreFoto).catch(() => null);
  throw new Error(`Tiempo agotado (${timeout} ms, etapa «${etapaActual}») esperando: ${expression}\n  estado: ${JSON.stringify(estado)}\n  navegaciones recientes: ${JSON.stringify(navs)}\n  incidencias recientes: ${JSON.stringify(recientes)}${out ? `\n  captura: ${nombreFoto}` : ''}`);
}
/**
 * Pulsar algo que NAVEGA (recarga). Se pulsa desde un temporizador de la
 * página para que la evaluación responda antes de que la página se vaya: si
 * no, CDP contesta «Inspected target navigated or closed» según quién llegue
 * antes (carrera vista en escritorio). Luego se espera al documento nuevo.
 */
async function pulsarYNavegar(selectorExpr, listo) {
  const marca = `m${Date.now()}`;
  await evaluate(`(() => { window.__marcaNavegacion = '${marca}'; const b = ${selectorExpr}; if (!b) throw new Error('no está el botón'); setTimeout(() => b.click(), 30); return true; })()`);
  const inicio = Date.now();
  while (Date.now() - inicio < 15000) {
    await wait(150);
    let sigue;
    try { sigue = await evaluate(`window.__marcaNavegacion === '${marca}'`); } catch { sigue = true; }
    if (!sigue) break;
  }
  await until(listo, 15000);
}

/**
 * Tras una muerte: «Nueva partida» (recarga), se elige el primer personaje
 * guardado y se empieza un run NUEVO. No se revive al muerto ni se le cura:
 * es otro run, independiente, para seguir probando.
 */
async function empezarRunNuevo() {
  await pulsarYNavegar(`[...document.querySelectorAll('#caida-acciones button')].find((b) => b.textContent.trim() === 'Nueva partida')`,
    'window.ARCANVEIL?.motor?.listo && ["herencia", "personajes", "creacion"].includes(document.body.dataset.activeScreen)');
  // Con herencia pendiente, primero se elige: aquí, sin herencia (la de este
  // caído queda pendiente para la prueba del legado de más abajo).
  if (await evaluate(`document.body.dataset.activeScreen === 'herencia'`)) {
    await evaluate(`document.querySelector('#herencia-sin').click()`);
    await until('document.querySelector(".tarjeta-pj[data-personaje]")');
  }
  await evaluate(`document.querySelector('.tarjeta-pj[data-personaje]').click()`);
  await until('document.querySelector("#personajes-comenzar")');
  await evaluate(`document.querySelector('#personajes-comenzar').click()`);
  await until('document.body.dataset.activeScreen === "juego" && ARCANVEIL.ver("player.vida.actual") > 0 && !ARCANVEIL.ver("meta.muerte")', 15000);
  await evaluate(`window.__ataquesGrupo = []; ARCANVEIL.bus.on('combat:attack', (e) => window.__ataquesGrupo.push(e)); true`);
}

/**
 * Otra pestaña del MISMO navegador (mismo perfil, mismo almacenamiento y
 * mismos Web Locks), con su propio canal CDP. Con `contexto` (un contexto
 * de navegador aislado, ver `contextoAislado`), la pestaña nace en él: las
 * pestañas de ese contexto comparten almacenamiento y Web Locks entre sí,
 * no con las demás.
 *
 * Los diálogos nativos (`confirm`) se responden de verdad por CDP con lo que
 * diga `responder(true|false)` (por omisión, «Cancelar») y se apuntan en
 * `dialogos` (tipo y texto).
 */
let pestanasAbiertas = 0;
async function abrirPestana(url, { contexto = null } = {}) {
  const numero = ++pestanasAbiertas;
  const t = contexto
    ? await contexto.nav.enviar('Target.createTarget', { url, browserContextId: contexto.id }).then(({ targetId }) => ({ id: targetId, webSocketDebuggerUrl: `ws://127.0.0.1:${DEBUG}/devtools/page/${targetId}` }))
    : await json(`http://127.0.0.1:${DEBUG}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
  const socket = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((ok, mal) => { socket.onopen = ok; socket.onerror = mal; });
  let n = 0;
  const esperan = new Map();
  const eventos = [];
  const dialogos = [];
  let aceptarDialogo = false;
  const peticiones = new Map();
  // Lo que pasa en esta pestaña, para diagnosticar un arranque que no llega:
  // excepciones, errores de consola y peticiones que fallan (sin contenido de
  // la partida: solo el texto del error y la URL).
  const incidencias = [];
  const apuntar = (x) => { incidencias.push(x); if (incidencias.length > 40) incidencias.shift(); };
  socket.onmessage = ({ data }) => {
    const m = JSON.parse(data);
    if (m.id && esperan.has(m.id)) { const p = esperan.get(m.id); esperan.delete(m.id); if (m.error) p.reject(new Error(m.error.message)); else p.resolve(m.result); return; }
    if (EVENTOS_NAVEGACION.has(m.method)) eventos.push({ method: m.method, params: m.params, t: Date.now() });
    else if (m.method === 'Runtime.exceptionThrown') apuntar({ tipo: 'excepción', texto: String(m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text ?? '').slice(0, 200) });
    else if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) apuntar({ tipo: `consola ${m.params.type}`, texto: (m.params.args ?? []).map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 200) });
    else if (m.method === 'Network.loadingFailed') apuntar({ tipo: 'red', texto: `${m.params.errorText}${m.params.blockedReason ? ` (${m.params.blockedReason})` : ''}${m.params.canceled ? ' (cancelada)' : ''}`, ...peticionDe(peticiones, m.params.requestId, m.params.type) });
    else if (m.method === 'Network.responseReceived') { if (m.params.response.status >= 400) apuntar({ tipo: 'red', texto: `HTTP ${m.params.response.status}`, ...peticionDe(peticiones, m.params.requestId, m.params.type) }); }
    else if (m.method === 'Network.requestWillBeSent') { const u = m.params.request.url; apuntarPeticion(peticiones, m.params); if (/^(?:https?|wss?):/.test(u) && !/^(?:https?|wss?):\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?\//.test(u)) externos.push(u.slice(0, 120)); }
    else if (m.method === 'Page.javascriptDialogOpening') {
      dialogos.push({ tipo: m.params.type, mensaje: m.params.message, aceptado: aceptarDialogo });
      socket.send(JSON.stringify({ id: ++n, method: 'Page.handleJavaScriptDialog', params: { accept: aceptarDialogo } }));
    }
  };
  socket.addEventListener('close', () => eventos.push({ method: 'Inspector.detached', params: { reason: 'canal cerrado' }, t: Date.now() }));
  const enviar = (method, params = {}) => new Promise((resolve, reject) => { const id = ++n; esperan.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
  const ev = async (expression) => { const r = await enviar('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(`pestaña ${numero + 1}: ${r.exceptionDetails.text}`); return r.result?.value; };
  /**
   * Espera una condición. Si no llega, dice QUÉ documento llegó a existir
   * (URL, estado de carga, navegaciones) aparte de cómo está el motor, con
   * las incidencias de la pestaña y una captura. Nunca reintenta ni recarga.
   */
  const hasta = async (expression, ms = 15000) => {
    const t0 = Date.now();
    let ultimoError = null;
    while (Date.now() - t0 < ms) {
      try { if (await ev(`Boolean(${expression})`)) return; ultimoError = null; } catch (e) { ultimoError = e.message; }
      await wait(120);
    }
    let documento = null;
    let motor = null;
    try { documento = await ev(`({ url: location.href, readyState: document.readyState, titulo: document.title, pantalla: document.body?.dataset?.activeScreen ?? null, clases: document.body?.className ?? null })`); } catch (e) { documento = { sinDocumento: e.message }; }
    try { motor = await ev(`({ ...${DIAGNOSTICO}, avisos: [...document.querySelectorAll('#avisos .aviso')].map((x) => x.textContent), fallos: document.querySelector('#fallos')?.textContent ?? null, salida: document.getElementById('salida-modal')?.hidden === false ? document.getElementById('salida-nota')?.textContent : null })`); } catch (e) { motor = { sinMotor: e.message }; }
    const navegaciones = eventos.filter((e) => e.method === 'Page.frameNavigated' && !e.params.frame.parentId).map((e) => e.params.frame.url);
    const cargas = eventos.filter((e) => e.method === 'Page.loadEventFired').length;
    const nombreFoto = `aux-fallo-${numero}-${viewport.label}.png`;
    await fotoRapida(nombreFoto, enviar).catch(() => null);
    throw new Error(`pestaña ${numero + 1}: tiempo agotado (${ms} ms) esperando ${expression}\n  documento: ${JSON.stringify(documento)}\n  navegaciones: ${JSON.stringify(navegaciones)} · cargas: ${cargas}${ultimoError ? ` · última evaluación: ${ultimoError}` : ''}\n  motor: ${JSON.stringify(motor)}\n  incidencias: ${JSON.stringify(incidencias)}${out ? `\n  captura: ${nombreFoto}` : ''}`);
  };
  await enviar('Runtime.enable'); await enviar('Page.enable'); await enviar('Inspector.enable'); await enviar('Network.enable');
  // Mismo tamaño que la principal (en «headless» una pestaña nueva nace con otro).
  await enviar('Emulation.setDeviceMetricsOverride', { width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: !desktop });
  return { ev, hasta, enviar, eventos, incidencias, dialogos, responder: (si) => { aceptarDialogo = Boolean(si); }, id: t.id, foto: (nombre) => fotoRapida(nombre, enviar), cerrar: async () => { try { socket.close(); } catch { /* cerrada */ } await fetch(`http://127.0.0.1:${DEBUG}/json/close/${t.id}`).catch(() => {}); } };
}

/**
 * Navegar (`Page.navigate`, `Page.reload` o un clic que navega) y esperar
 * al documento FINAL: la última navegación del marco principal va a uno de
 * `finales`, ese documento ha cargado y su contexto de ejecución existe.
 * Hasta entonces NO se evalúa nada (un `Runtime.evaluate` en el documento
 * provisional de una redirección muere con «Inspected target navigated or
 * closed»). Las redirecciones esperadas pasan por `permitidas`; una
 * navegación a otro sitio, o que la pestaña se cierre, es un error con su
 * diagnóstico, no un reintento.
 *
 * @param {() => Promise<any>} accion
 * @param {{eventos: Array, finales: string[], permitidas?: string[], tope?: number, quien?: string}} o
 */
async function navegarHasta(accion, { eventos = eventosPrincipal, finales, permitidas = finales, tope = 15000, quien = 'pestaña principal' }) {
  const desde = eventos.length;
  const ruta = (u) => { try { return new URL(u).pathname; } catch { return String(u); } };
  const acaba = (u, lista) => lista.some((p) => ruta(u).endsWith(p));
  const t0 = Date.now();
  let accionHecha = false;
  const promesa = Promise.resolve().then(accion).then(() => { accionHecha = true; }, (e) => { accionHecha = e; });
  while (Date.now() - t0 < tope) {
    await wait(40);
    if (accionHecha instanceof Error && !/navigated|closed/i.test(accionHecha.message)) throw new Error(`${quien}: la navegación no se pudo pedir: ${accionHecha.message}`);
    const ev = eventos.slice(desde);
    const cierre = ev.find((e) => e.method === 'Inspector.detached' || e.method === 'Target.detachedFromTarget');
    if (cierre) throw new Error(`${quien}: la pestaña se cerró durante la navegación (${cierre.params?.reason ?? cierre.method})`);
    const navs = ev.filter((e) => e.method === 'Page.frameNavigated' && !e.params.frame.parentId);
    const inesperada = navs.find((e) => !acaba(e.params.frame.url, permitidas));
    if (inesperada) throw new Error(`${quien}: navegación inesperada a ${inesperada.params.frame.url} (se esperaba ${finales.join(' o ')}); navegaciones: ${navs.map((e) => ruta(e.params.frame.url)).join(' → ')}`);
    const ultima = navs.at(-1);
    if (!ultima || !acaba(ultima.params.frame.url, finales)) continue;
    const despues = ev.slice(ev.indexOf(ultima));
    const cargada = despues.some((e) => e.method === 'Page.loadEventFired');
    const contexto = despues.some((e) => e.method === 'Runtime.executionContextCreated' && e.params.context?.auxData?.isDefault && e.params.context?.auxData?.frameId === ultima.params.frame.id);
    if (cargada && contexto) { await promesa; return { url: ultima.params.frame.url, navegaciones: navs.map((e) => ruta(e.params.frame.url)) }; }
  }
  const navs = eventos.slice(desde).filter((e) => e.method === 'Page.frameNavigated' && !e.params.frame.parentId).map((e) => ruta(e.params.frame.url));
  throw new Error(`${quien}: no se llegó a un documento final (${finales.join(' o ')}) en ${tope} ms; navegaciones: ${navs.join(' → ') || 'ninguna'}`);
}
const RECARGAR = () => cdp('Page.reload', { ignoreCache: false });
const APP = ['/app/index.html'];

/** Un toque de verdad (eventos táctiles), para el móvil. */
async function tocar(selector) {
  const r = await evaluate(`(() => { const b = document.querySelector(${JSON.stringify(selector)}); if (!b) return null; b.scrollIntoView({ block: 'center' }); const c = b.getBoundingClientRect(); return { x: c.left + c.width / 2, y: c.top + c.height / 2 }; })()`);
  if (!r) throw new Error(`no está ${selector} para tocarlo`);
  await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: r.x, y: r.y }] });
  await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await wait(250);
}

/** Pulsar Enter en lo que tenga el foco, como un teclado. */
async function enter() {
  await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await wait(200);
}

/** FIXTURE: una herencia apuntada a mano (muerto ficticio con XP conocida). */
const herenciaFicticia = (run, nombre, xp) => `(() => {
  const m = JSON.parse(localStorage.getItem('arcanveil:runs-muertos') ?? '{}'); m[${JSON.stringify(run)}] = { nombre: ${JSON.stringify(nombre)}, muerto: Date.now(), causa: 'FIXTURE' };
  localStorage.setItem('arcanveil:runs-muertos', JSON.stringify(m));
  const l = JSON.parse(localStorage.getItem('arcanveil:legados') ?? '{}');
  l[${JSON.stringify(run)}] = { version: 2, runOrigen: ${JSON.stringify(run)}, origen: { nombre: ${JSON.stringify(nombre)}, raza: 'valdes', clase: 'filo', nivel: 2 }, fraccion: '35/100', modalidad: 'xp_acumulada', base: { xpAcumulada: ${xp}, xpHeredada: 0, xpGanada: ${xp} }, cantidad: ${Math.trunc((xp * 35) / 100)}, estado: 'pendiente', motivo: null, destinatario: null, creado: Date.now() };
  localStorage.setItem('arcanveil:legados', JSON.stringify(l)); return true; })()`;
/** Cuántos sucesores guardados hay de un muerto (lectura de las ranuras). */
const sucesoresDe = (run) => `Object.keys(localStorage).filter((k) => k.startsWith('arcanveil:partida:')).map((k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }).filter((g) => g?.estado?.player?.legadoRecibido?.runOrigen === ${JSON.stringify(run)}).map((g) => ({ run: g.estado.meta.runId, xp: g.estado.player.xp, nivel: g.estado.player.nivel }))`;
// #7: el estado de la herencia vive en el almacén coordinado (IndexedDB),
// no en la foto de localStorage. Se lee con el mismo módulo que usa la app.
const legadoDe = (run) => `(await import('/src/persistence/EntregaLegado.js').then((m) => m.estadoLegado(${JSON.stringify(run)})))`;

/** Desde el menú de inicio, «Continuar» la partida guardada. */
async function continuarPartida(runId) {
  await until('document.querySelector("#menu-continuar") && !document.querySelector("#menu-continuar").closest("[hidden]")', 8000);
  await evaluate(`document.querySelector('#menu-continuar').click()`);
  await until(`document.body.dataset.activeScreen === "juego" && ARCANVEIL.ver("meta.runId") === ${JSON.stringify(runId)}`, 15000);
  await evaluate(`window.__ataquesGrupo = window.__ataquesGrupo ?? []; ARCANVEIL.bus.on('combat:attack', (e) => window.__ataquesGrupo.push(e)); true`);
}
/**
 * Espera a que la pantalla esté quieta: sin texto a medio escribir ni
 * animaciones finitas en curso. Las capturas de la partida salían con
 * «Guar█» a medio teclear y las últimas líneas a medio aparecer: no sirven
 * para juzgar lectura ni contraste. Hace lo que haría un jugador con prisa
 * (un clic en la bitácora termina de escribir) y espera a que el texto lleve
 * 300 ms sin cambiar. Tope de 8 s: si no se asienta, se dice.
 */
async function asentar() {
  return evaluate(`(async () => {
    document.querySelector('#bitacora')?.click();
    const quietas = () => document.getAnimations().filter((a) => a.playState === 'running' && Number.isFinite(a.effect?.getTiming?.().iterations ?? 1) && (a.effect?.getTiming?.().iterations ?? 1) !== Infinity).length === 0;
    let antes = null; let estable = 0;
    for (let i = 0; i < 80; i++) {
      const texto = document.querySelector('#bitacora')?.textContent ?? '';
      if (texto === antes && quietas()) { estable += 100; if (estable >= 300) return true; } else estable = 0;
      antes = texto;
      await new Promise((r) => setTimeout(r, 100));
    }
    return false;
  })()`);
}
async function shot(name) {
  if (!out) return;
  await import('node:fs/promises').then(m => m.mkdir(out, { recursive: true }));
  const quieta = await asentar();
  if (!quieta) console.warn(`captura ${name}: la pantalla no se asentó en 8 s; se toma igual`);
  const r = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await writeFile(join(out, name), Buffer.from(r.data, 'base64'));
}

/** Captura sin esperar a que la pantalla se asiente (para avisos que se van). */
async function fotoRapida(nombre, enviar = cdp) {
  if (!out) return;
  await import('node:fs/promises').then((m) => m.mkdir(out, { recursive: true }));
  // Al frente: en Chrome sin ventana, una pestaña de fondo no avanza sus
  // animaciones y los avisos se quedaban invisibles (opacidad 0) en la foto.
  await enviar('Page.bringToFront').catch(() => {});
  await wait(450);
  const r = await enviar('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await writeFile(join(out, nombre), Buffer.from(r.data, 'base64'));
}

/* ── #8: guardado coordinado entre pestañas ──────────────────────────────
 * Lecturas de comprobación en CRUDO (IndexedDB y localStorage), sin los
 * módulos del juego: valen igual en la base y en el HEAD. */
const idbLeer = (almacen, clave) => `new Promise((ok) => { const p = indexedDB.open('arcanveil-coordinacion'); p.onsuccess = () => { const db = p.result; if (!db.objectStoreNames.contains(${JSON.stringify(almacen)})) { db.close(); ok(null); return; } const q = db.transaction(${JSON.stringify(almacen)}).objectStore(${JSON.stringify(almacen)}).get(${JSON.stringify(String(clave))}); q.onsuccess = () => { db.close(); ok(q.result ?? null); }; q.onerror = () => { db.close(); ok(null); }; }; p.onerror = () => ok(null); })`;
const lsBytes = (n) => `localStorage.getItem('arcanveil:partida:' + ${JSON.stringify(String(n))})`;
const lsRun = (n) => `(() => { try { return JSON.parse(${lsBytes(n)})?.estado?.meta?.runId ?? null; } catch { return 'ILEGIBLE'; } })()`;
const todasLsBytes = `Object.fromEntries(Array.from({ length: 8 }, (_, i) => [i + 1, localStorage.getItem('arcanveil:partida:' + (i + 1))]))`;
/** Apunta los avisos que salen (se borran a los 4 s). */
const GRABAR_AVISOS = `(() => { if (window.__avisos) return true; window.__avisos = []; const c = document.getElementById('avisos'); if (c) new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) if (n.textContent) window.__avisos.push(n.textContent); }).observe(c, { childList: true }); return true; })()`;
/** Desde la portada hasta «Comenzar partida» sin herencia, con el primer personaje. */
const HASTA_COMENZAR = `(async () => { document.querySelector('#inicio-jugar')?.click(); document.querySelector('#menu-nueva').click(); for (let i = 0; i < 100 && !['herencia', 'personajes', 'creacion'].includes(document.body.dataset.activeScreen); i++) await new Promise((r) => setTimeout(r, 50));
  if (document.body.dataset.activeScreen === 'herencia') { document.querySelector('#herencia-sin').click(); await new Promise((r) => setTimeout(r, 200)); }
  document.querySelector('.tarjeta-pj[data-personaje]').click(); await new Promise((r) => setTimeout(r, 200));
  return Boolean(document.querySelector('#personajes-comenzar')); })()`;
/** Pulsar «Guardar» y esperar al resultado (el aviso que sale y el botón libre). */
async function guardarConBoton(ev, hasta, { doble = false } = {}) {
  await ev(GRABAR_AVISOS);
  const n = await ev('window.__avisos.length');
  await ev(`(() => { const b = document.querySelector('#guardar'); b.click(); ${doble ? 'b.click();' : ''} return true; })()`);
  await hasta(`window.__avisos.length > ${n} && document.querySelector('#guardar')?.getAttribute('aria-busy') !== 'true'`, 20000);
  return ev(`window.__avisos.slice(${n})`);
}
/** Clic que NAVEGA en otra pestaña (desde un temporizador) y espera al documento nuevo. */
async function navegarEn(p, accionExpr, listo) {
  const marca = `n${Date.now()}`;
  await p.ev(`(() => { window.__marcaNav = '${marca}'; const b = ${accionExpr}; if (!b) throw new Error('no está el botón'); setTimeout(() => b.click(), 30); return true; })()`);
  const t0 = Date.now();
  while (Date.now() - t0 < 20000) {
    await wait(150);
    let sigue;
    try { sigue = await p.ev(`window.__marcaNav === '${marca}'`); } catch { sigue = true; }
    if (!sigue) break;
  }
  await p.hasta(listo, 20000);
}
const LISTA_APP = 'window.ARCANVEIL?.motor?.listo && document.body.classList.contains("esta-listo")';

/**
 * #9 · TOKEN DE GUARDADO en Chrome, con IndexedDB y Web Locks de verdad:
 *   · el repro de la revisión (mismo token, turno +500): conflicto con el
 *     aviso honesto, y la autoridad y el espejo siguen en el original;
 *   · dos pestañas del MISMO perfil con la misma partida cargada guardan a
 *     la vez con el mismo token: una operación (la otra, «repetida»);
 *   · a la vez, mismo token y contenidos distintos: uno durable, el otro
 *     conflicto; nunca dos éxitos.
 * Precondición: esta pestaña juega una campaña viva y guardada.
 */
async function tokenEnChrome() {
  etapa('#9 · token de guardado: repro de la revisión y dos pestañas con el mismo token');
  await evaluate(GRABAR_AVISOS);
  const S = await evaluate(`ARCANVEIL.ver('meta.ranura')`);
  const g = (opciones) => `ARCANVEIL.sistema('saves').guardar(${JSON.stringify(S)}, ${JSON.stringify(opciones)}).then((r) => ({ exito: r.exito, repetido: r.repetido ?? false, codigo: r.codigo ?? null, rev: r.rev ?? null, motivo: r.motivo ?? null }))`;
  const leer = `(async () => { const rec = await ${idbLeer('ranuras', S)}; const snap = await ${idbLeer('partidas', S)}; const ls = ${lsBytes(S)}; const t = (x) => { try { return JSON.parse(x)?.estado?.meta?.turno ?? null; } catch { return 'ILEGIBLE'; } }; return { rev: rec?.rev ?? null, run: rec?.runId ?? null, idb: snap?.texto ?? null, ls, turnoIdb: t(snap?.texto), turnoLs: t(ls) }; })()`;
  const r1 = await evaluate(g({ token: 'T-9-repro' }));
  const antes = await evaluate(leer);
  const t0 = await evaluate(`ARCANVEIL.ver('meta.turno')`);
  await evaluate(`ARCANVEIL.store.fijar('meta.turno', ${t0} + 500); true`);
  // Sin avisos anteriores en pantalla: la captura enseña solo el de este intento.
  await until('!document.querySelector("#avisos")?.children.length', 8000);
  const n = await evaluate('window.__avisos.length');
  const r2 = await evaluate(g({ token: 'T-9-repro' }));
  await until(`window.__avisos.length > ${n}`, 5000);
  await wait(500);
  await fotoRapida(`17a-token-conflicto-${viewport.label}.png`);
  const aviso = await evaluate(`window.__avisos.slice(${n})`);
  const despues = await evaluate(leer);
  await evaluate(`ARCANVEIL.store.fijar('meta.turno', ${t0}); true`);
  if (!r1.exito || r2.exito || r2.codigo !== 'token-contenido' || !aviso.some((a) => /otro contenido/.test(a)) || aviso.some((a) => /Partida guardada/.test(a))
    || despues.rev !== antes.rev || despues.idb !== antes.idb || despues.ls !== antes.ls || despues.turnoIdb !== t0 || despues.turnoLs !== t0) {
    throw new Error(`#9 repro del token: ${JSON.stringify({ r1, r2, aviso, antes: { rev: antes.rev, t: antes.turnoIdb }, despues: { rev: despues.rev, idb: despues.turnoIdb, ls: despues.turnoLs } })}`);
  }
  console.log(`  #9 repro: el mismo token con el turno +500 es conflicto («${aviso[0].slice(0, 60)}…»); autoridad y espejo siguen en el turno ${t0} (rev ${despues.rev})`);

  // Dos pestañas, la misma partida cargada desde la misma copia.
  const otra = await abrirPestana(URL_APP);
  try {
    await otra.hasta(LISTA_APP);
    await otra.ev(GRABAR_AVISOS);
    await otra.ev(`document.querySelector('#inicio-jugar')?.click(); document.querySelector('#menu-cargar').click(); true`);
    await otra.hasta('document.body.dataset.activeScreen === "cargar"');
    await otra.ev(`document.querySelector('#cargar-lista .tarjeta-pj__abrir[data-ranura="${S}"]').click(); true`);
    await otra.hasta(`document.body.dataset.activeScreen === "juego" && ARCANVEIL.ver("meta.ranura") === ${JSON.stringify(S)}`, 15000);
    await otra.hasta('!ARCANVEIL.sistema("turns")._ocupado', 15000);
    await otra.ev(`Promise.resolve(ARCANVEIL.sistema('saves').drenar?.(15000)).then(() => true)`);
    // Esta pestaña también abre ESA copia (misma foto en las dos).
    await evaluate(`ARCANVEIL.sistema('saves').cargar(${JSON.stringify(S)}).then((r) => r.exito)`);
    const canon = `(async () => (await import('/src/persistence/Ranuras.js')).contenidoCanonico(JSON.stringify(ARCANVEIL.sistema('saves')._construir('crónica'))))()`;
    const [ca, cb] = [await evaluate(canon), await otra.ev(canon)];
    if (ca !== cb) throw new Error('#9: las dos pestañas no tienen la misma foto tras cargar la misma copia (precondición del caso «mismo contenido»)');
    const revAntes = (await evaluate(leer)).rev;
    const mismo = await Promise.all([evaluate(g({ token: 'T-9-dos', nota: 'crónica' })), otra.ev(g({ token: 'T-9-dos', nota: 'crónica' }))]);
    const trasMismo = await evaluate(leer);
    const repetidas = mismo.filter((x) => x.exito && x.repetido).length;
    const nuevas = mismo.filter((x) => x.exito && !x.repetido).length;
    if (nuevas !== 1 || repetidas !== 1 || trasMismo.rev !== revAntes + 1 || trasMismo.idb !== trasMismo.ls) throw new Error(`#9 dos pestañas, mismo token y contenido: ${JSON.stringify({ mismo, revAntes, rev: trasMismo.rev })}`);
    // Contenidos distintos a la vez con el mismo token.
    await otra.ev(`ARCANVEIL.store.dispatch('player/xp', { cantidad: 3, motivo: 'fixture' }); true`);
    await wait(100);
    await until('!document.querySelector("#avisos")?.children.length', 8000);
    await otra.hasta('!document.querySelector("#avisos")?.children.length', 8000);
    const nOtra = await otra.ev('window.__avisos.length');
    const distinto = await Promise.all([evaluate(g({ token: 'T-9-tres', nota: 'crónica', silencioso: false })), otra.ev(g({ token: 'T-9-tres', nota: 'crónica', silencioso: false }))]);
    const trasDistinto = await evaluate(leer);
    const ok = distinto.filter((x) => x.exito);
    const conflicto = distinto.filter((x) => !x.exito && x.codigo === 'token-contenido');
    if (ok.length !== 1 || conflicto.length !== 1 || ok[0].repetido || trasDistinto.rev !== trasMismo.rev + 1 || trasDistinto.idb !== trasDistinto.ls) throw new Error(`#9 dos pestañas, mismo token y contenidos distintos: ${JSON.stringify({ distinto, rev: trasDistinto.rev })}`);
    if (!distinto[1].exito) {
      await otra.hasta(`window.__avisos.length > ${nOtra}`, 5000);
      await wait(500);
      await otra.foto(`17b-token-dos-pestanas-conflicto-${viewport.label}.png`);
    } else {
      await wait(500);
      await fotoRapida(`17b-token-dos-pestanas-conflicto-${viewport.label}.png`);
    }
    console.log(`  #9 dos pestañas: mismo token y contenido → 1 guardado + 1 repetido (rev ${revAntes} → ${trasMismo.rev}); contenidos distintos → 1 guardado + 1 conflicto (rev ${trasDistinto.rev}); espejo = autoridad`);
  } finally {
    await otra.cerrar();
  }
  // Esta pestaña sigue con la copia VIGENTE (la otra pudo ganar la última).
  const recargada = await evaluate(`ARCANVEIL.sistema('saves').cargar(${JSON.stringify(S)}).then((r) => r.exito)`);
  if (!recargada) throw new Error('#9: no se pudo volver a abrir la copia vigente tras la prueba del token');
}

/**
 * #10 · TOKENS DURABLES en Chrome, con IndexedDB y Web Locks de verdad: un
 * token viejo sigue siendo la MISMA operación después de mucha actividad
 * normal (225 guardados con tokens nuevos), tras recargar la pestaña, desde
 * otra pestaña del mismo perfil y a la vez que un guardado nuevo. Se lee la
 * autoridad (IndexedDB) y el espejo (localStorage), no solo el resultado.
 * Precondición: esta pestaña juega una campaña viva, guardada y vigente.
 */
async function tokensDurablesEnChrome() {
  etapa('#10 · token durable: 225 guardados después, recarga, otra pestaña y guardado concurrente');
  const S = await evaluate(`ARCANVEIL.ver('meta.ranura')`);
  const run = await evaluate(`ARCANVEIL.ver('meta.runId')`);
  const viejo = `review-old-${viewport.label}-${semilla}`;
  const g = (opciones) => `ARCANVEIL.sistema('saves').guardar(${JSON.stringify(S)}, ${JSON.stringify(opciones)}).then((r) => ({ exito: r.exito, repetido: r.repetido ?? false, codigo: r.codigo ?? null, rev: r.rev ?? null }))`;
  const leer = `(async () => { const R = await import('/src/persistence/Ranuras.js'); const l = await R.leerRanuraCoordinada(${JSON.stringify(S)}); const rec = await ${idbLeer('ranuras', S)}; const op = await ${idbLeer('operaciones', viejo)}; const ls = ${lsBytes(S)}; const t = (x) => { try { return JSON.parse(x)?.estado?.meta?.turno ?? null; } catch { return 'ILEGIBLE'; } }; return { rev: rec?.rev ?? null, run: rec?.runId ?? null, turnoIdb: t(l.texto), turnoLs: t(ls), iguales: l.texto === ls, recibo: op ? op.estado : null }; })()`;
  await evaluate(`Promise.resolve(ARCANVEIL.sistema('saves').drenar?.(15000)).then(() => true)`);
  const t0 = Date.now();
  const r0 = await evaluate(g({ token: viejo, silencioso: true }));
  // Actividad natural: 225 guardados válidos con tokens nuevos (turnos 1000+i).
  const actividad = await evaluate(`(async () => { let mal = 0; for (let i = 0; i < 225; i++) { ARCANVEIL.store.fijar('meta.turno', 1000 + i); const r = await ARCANVEIL.sistema('saves').guardar(${JSON.stringify(S)}, { silencioso: true, token: ${JSON.stringify(`${viejo}-act-`)} + i }); if (!r.exito) mal += 1; } await ARCANVEIL.sistema('saves').drenar(15000); return mal; })()`);
  const trasActividad = await evaluate(leer);
  if (!r0.exito || actividad !== 0 || trasActividad.turnoIdb !== 1224 || !trasActividad.iguales) throw new Error(`#10 actividad: ${JSON.stringify({ r0, actividad, trasActividad })}`);
  // Mismo pestaña, turno 2000, token viejo.
  await evaluate(`ARCANVEIL.store.fijar('meta.turno', 2000); true`);
  const misma = await evaluate(g({ token: viejo, silencioso: true }));
  const trasMisma = await evaluate(leer);
  if (trasActividad.recibo !== 'hecho' || misma.exito || misma.codigo !== 'token-superado' || trasMisma.rev !== trasActividad.rev || trasMisma.turnoIdb !== 1224 || trasMisma.turnoLs !== 1224) throw new Error(`#10 token viejo tras 225 guardados (recibo tras la actividad: ${trasActividad.recibo}): ${JSON.stringify({ misma, antes: { rev: trasActividad.rev, turno: trasActividad.turnoIdb }, despues: trasMisma })}`);
  await evaluate(`ARCANVEIL.store.fijar('meta.turno', 1224); true`);
  // Recarga: nada en memoria de esta pestaña sobrevive; la evidencia es la durable.
  await navegarHasta(RECARGAR, { finales: APP });
  await until('window.ARCANVEIL?.motor?.listo && document.body.classList.contains("esta-listo")', 15000);
  await evaluate(`ARCANVEIL.store.fijar('settings.persistencia', true); ARCANVEIL.bus.emit('settings:change', { id: 'persistencia', valor: true }); true`);
  const cargada = await evaluate(`ARCANVEIL.sistema('saves').cargar(${JSON.stringify(S)}).then((r) => r.exito)`);
  await evaluate(`ARCANVEIL.store.fijar('meta.turno', 2000); true`);
  const trasRecargar = await evaluate(g({ token: viejo, silencioso: true }));
  if (!cargada || trasRecargar.exito || trasRecargar.codigo !== 'token-superado' || (await evaluate(leer)).rev !== trasActividad.rev) throw new Error(`#10 token viejo tras recargar: ${JSON.stringify({ cargada, trasRecargar })}`);
  // Otra pestaña del mismo perfil, y a la vez un guardado nuevo en esta.
  const otra = await abrirPestana(URL_APP);
  try {
    await otra.hasta(LISTA_APP);
    await otra.ev(`ARCANVEIL.store.fijar('settings.persistencia', true); ARCANVEIL.bus.emit('settings:change', { id: 'persistencia', valor: true }); true`);
    const cOtra = await otra.ev(`ARCANVEIL.sistema('saves').cargar(${JSON.stringify(S)}).then((r) => r.exito)`);
    await otra.ev(`ARCANVEIL.store.fijar('meta.turno', 3000); true`);
    await evaluate(`ARCANVEIL.store.fijar('meta.turno', 1225); true`);
    const [desdeOtra, nuevo] = await Promise.all([otra.ev(g({ token: viejo, silencioso: true })), evaluate(g({ token: `${viejo}-nuevo`, silencioso: true }))]);
    const fin = await evaluate(leer);
    if (!cOtra || desdeOtra.exito || desdeOtra.codigo !== 'token-superado' || !nuevo.exito || nuevo.repetido || fin.rev !== trasActividad.rev + 1 || fin.turnoIdb !== 1225 || !fin.iguales || fin.run !== run) throw new Error(`#10 otra pestaña con el token viejo y un guardado nuevo a la vez: ${JSON.stringify({ cOtra, desdeOtra, nuevo, fin, revActividad: trasActividad.rev })}`);
    console.log(`  #10 token durable: tras 225 guardados (${Math.round((Date.now() - t0) / 1000)} s), el token viejo sigue superado en esta pestaña, tras recargar y desde otra; el guardado nuevo concurrente queda (rev ${trasActividad.rev} → ${fin.rev}, turno ${fin.turnoIdb} en IndexedDB y en el espejo)`);
  } finally {
    await otra.cerrar();
  }
  // De vuelta a la partida por la interfaz (lo siguiente la necesita en pantalla).
  await evaluate(`document.querySelector('#inicio-jugar')?.click(); document.querySelector('#menu-cargar').click(); true`);
  await until('document.body.dataset.activeScreen === "cargar"', 5000);
  await evaluate(`document.querySelector('#cargar-lista .tarjeta-pj__abrir[data-ranura="${S}"]').click(); true`);
  await until(`document.body.dataset.activeScreen === "juego" && ARCANVEIL.ver("meta.ranura") === ${JSON.stringify(S)}`, 15000);
  await until('!ARCANVEIL.sistema("turns")._ocupado', 15000);
  await evaluate(`window.__ataquesGrupo = window.__ataquesGrupo ?? []; ARCANVEIL.bus.on('combat:attack', (e) => window.__ataquesGrupo.push(e)); true`);
}

/**
 * Un contexto de navegador AISLADO (como otra ventana privada del mismo
 * Chrome): sus pestañas comparten IndexedDB, localStorage y Web Locks entre
 * sí, y nada con la pestaña principal. Para probar borrados de verdad sin
 * tocar la campaña que la regresión sigue jugando.
 */
async function contextoAislado() {
  const v = await json(`http://127.0.0.1:${DEBUG}/json/version`);
  const s = new WebSocket(v.webSocketDebuggerUrl);
  await new Promise((ok, mal) => { s.onopen = ok; s.onerror = mal; });
  let n = 0;
  const esperan = new Map();
  s.onmessage = ({ data }) => { const m = JSON.parse(data); if (m.id && esperan.has(m.id)) { const p = esperan.get(m.id); esperan.delete(m.id); if (m.error) p.reject(new Error(m.error.message)); else p.resolve(m.result); } };
  const enviar = (method, params = {}) => new Promise((resolve, reject) => { const id = ++n; esperan.set(id, { resolve, reject }); s.send(JSON.stringify({ id, method, params })); });
  const { browserContextId } = await enviar('Target.createBrowserContext', {});
  return { id: browserContextId, nav: { enviar }, cerrar: async () => { await enviar('Target.disposeBrowserContext', { browserContextId }).catch(() => {}); try { s.close(); } catch { /* cerrado */ } } };
}

/** El aviso que da una pestaña cuya partida se borró (texto exacto del #11). */
const AVISO_BORRADA = 'Esta partida se borró (desde otra pestaña o en Ajustes): ya no se puede guardar aquí. Puedes seguir jugando en esta pestaña, pero no se guardará.';
const PERSISTIR = `ARCANVEIL.store.fijar('settings.persistencia', true); ARCANVEIL.bus.emit('settings:change', { id: 'persistencia', valor: true }); true`;

/**
 * #11 · BORRADO DURABLE en Chrome: dos pestañas REALES (P y Q) de un
 * contexto aislado, con IndexedDB, localStorage y Web Locks compartidos.
 *   §1 manual: A en P → Q «Borrar partidas y personajes» (primero Cancelar
 *      en el diálogo nativo: nada cambia) → Q crea B en esa ranura → Q borra
 *      B desde «Cargar» → P (A en memoria) guarda con el botón y al pasar
 *      turnos: rechazado, con el aviso UNA vez; la ranura sigue borrada.
 *   §2 automática: P recarga y juega C, guardada en la automática → Q borra
 *      todo → la automática vieja de P (con y sin token) no se recrea.
 *   Borrado que falla (FIXTURE: IndexedDB rechaza la transacción), a medias
 *   (FIXTURE: el navegador no deja quitar la copia local) y reintento; a
 *   medias y recarga: se termina al arrancar.
 * Captura de cada pantalla, en móvil y escritorio (según la pasada).
 */
async function borradoDurableEnChrome() {
  etapa('#11 · borrado durable: dos pestañas reales (contexto aislado), §1 historial manual y §2 automática');
  const ctx = await contextoAislado();
  const P = await abrirPestana(URL_APP, { contexto: ctx });
  const Q = await abrirPestana(URL_APP, { contexto: ctx });
  const estado = (n) => `(async () => { const rec = await ${idbLeer('ranuras', n)}; const snap = await ${idbLeer('partidas', n)}; const ls = ${lsBytes(n)}; const run = (x) => { try { return JSON.parse(x)?.estado?.meta?.runId ?? null; } catch { return 'ILEGIBLE'; } }; return { estado: rec?.estado ?? null, run: rec?.runId ?? null, rev: rec?.rev ?? null, snap: snap ? run(snap.texto) : null, ls: ls === null ? null : run(ls) }; })()`;
  const meta = (k) => idbLeer('meta', k);
  const nAvisos = (p) => p.ev('window.__avisos.length');
  const avisosDesde = (p, desde) => p.ev(`window.__avisos.slice(${desde})`);
  const preparar = async (p) => { await p.hasta(LISTA_APP); await p.ev(GRABAR_AVISOS); await p.ev(PERSISTIR); };
  const recargar = async (p, quien) => {
    await navegarHasta(() => p.enviar('Page.reload', {}), { eventos: p.eventos, finales: APP, quien });
    await preparar(p);
  };
  /** Una campaña nueva por la interfaz (personaje nuevo, sin herencia). */
  const crear = async (p, nombre) => {
    await p.ev(`document.querySelector('#inicio-jugar')?.click(); document.querySelector('#menu-nueva').click(); true`);
    await p.hasta('["herencia", "personajes", "creacion"].includes(document.body.dataset.activeScreen)', 8000);
    if (await p.ev(`document.body.dataset.activeScreen === 'herencia'`)) { await p.ev(`document.querySelector('#herencia-sin').click(); true`); await p.hasta('["personajes", "creacion"].includes(document.body.dataset.activeScreen)', 8000); }
    if (await p.ev(`document.body.dataset.activeScreen === 'personajes'`)) {
      await p.ev(`document.querySelector('#personajes-otro')?.click(); true`);
      await p.hasta('document.querySelector("#personajes-nuevo")', 5000);
      await p.ev(`document.querySelector('#personajes-nuevo').click(); true`);
    }
    await p.hasta('document.body.dataset.activeScreen === "creacion" && document.querySelector("#origen-raza")', 8000);
    await p.ev(crearPersonajeUI({ nombre, descripcion: 'viajera de capa gris', lore: 'Busca un camino propio.', intensidad: 'relato', imagen: 'ninguno' }));
    await p.hasta('document.querySelector("#creacion-empezar") && document.querySelector("#creacion-cara .arte")', 15000);
    await p.ev(`document.querySelector('#creacion-empezar').click(); true`);
    await p.hasta('document.body.dataset.activeScreen === "juego" && ARCANVEIL.ver("meta.ranura") && !ARCANVEIL.sistema("turns")._ocupado', 25000);
    await p.ev(`Promise.resolve(ARCANVEIL.sistema('saves').drenar?.(15000)).then(() => true)`);
    return { ranura: await p.ev(`ARCANVEIL.ver('meta.ranura')`), run: await p.ev(`ARCANVEIL.ver('meta.runId')`) };
  };
  /** Ajustes → «Borrar partidas y personajes», respondiendo al diálogo nativo. Devuelve el diálogo y los avisos. */
  const borrarTodoUI = async (p, aceptar, foto = null) => {
    await p.ev(`document.querySelector('#inicio-jugar')?.click(); true`);
    await p.hasta('document.querySelector("#menu-ajustes") && !document.querySelector("#menu-ajustes").closest("[hidden]")', 5000);
    await p.ev(`document.querySelector('#menu-ajustes').click(); true`);
    await p.hasta('document.querySelector("#ajustes-borrar")', 5000);
    if (foto) await p.foto(foto);
    // Sin avisos anteriores en pantalla: la captura enseña solo el de este intento.
    await p.hasta('!document.querySelector("#avisos")?.children.length', 10000);
    p.responder(aceptar);
    const d0 = p.dialogos.length;
    const n0 = await nAvisos(p);
    await p.ev(`document.querySelector('#ajustes-borrar').click(); true`);
    for (let i = 0; i < 50 && p.dialogos.length === d0; i++) await wait(100);
    if (p.dialogos.length === d0) throw new Error('#11: «Borrar partidas y personajes» no pidió confirmación');
    if (aceptar) await p.hasta(`window.__avisos.slice(${n0}).some((a) => /Borrados partidas|Borrado a medias|No se ha borrado|Partidas y personajes borrados/.test(a))`, 15000);
    else await wait(600);
    return { dialogo: p.dialogos.at(-1), avisos: await avisosDesde(p, n0) };
  };
  /** «Cargar» → «Borrar» en la tarjeta de esa ranura, aceptando el diálogo. */
  const borrarRanuraUI = async (p, ranura) => {
    await p.ev(`document.querySelector('#inicio-jugar')?.click(); document.querySelector('#menu-cargar').click(); true`);
    await p.hasta('document.body.dataset.activeScreen === "cargar"', 5000);
    p.responder(true);
    const d0 = p.dialogos.length;
    await p.ev(`[...document.querySelectorAll('.tarjeta-pj--partida')].find((c) => c.querySelector('.tarjeta-pj__abrir')?.dataset.ranura === ${JSON.stringify(String(ranura))}).querySelector('.tarjeta-pj__borrar').click(); true`);
    for (let i = 0; i < 50 && p.dialogos.length === d0; i++) await wait(100);
    let e = null;
    for (let i = 0; i < 100; i++) {
      e = await p.ev(estado(ranura));
      if (e.estado === 'borrada' && e.ls === null) break;
      await wait(100);
    }
    if (!(e?.estado === 'borrada' && e.ls === null)) throw new Error(`#11: la ranura ${ranura} no quedó borrada desde «Cargar»: ${JSON.stringify(e)}`);
    return p.dialogos.at(-1);
  };
  /** Turnos en una pestaña (cada uno intenta guardar al terminar). */
  const turnos = async (p, n) => {
    for (let i = 0; i < n; i++) {
      await p.ev(`ARCANVEIL.jugar('miro alrededor con calma').then(() => true)`);
      await p.hasta('!ARCANVEIL.sistema("turns")._ocupado', 15000);
    }
    await p.ev(`Promise.resolve(ARCANVEIL.sistema('saves').drenar?.(15000)).then(() => true)`);
    await wait(300);
  };

  try {
    await preparar(P);
    await preparar(Q);

    // ── §1 · historial manual ───────────────────────────────────────────
    const A = await crear(P, 'Ana');
    const s = String(A.ranura);
    const e0 = await P.ev(estado(s));
    if (e0.estado !== 'ocupada' || e0.run !== A.run || e0.snap !== A.run || e0.ls !== A.run) throw new Error(`#11 §1: A no quedó guardada en la ${s}: ${JSON.stringify(e0)}`);
    // Cancelar en el diálogo nativo: nada cambia, ni intención ni época.
    const cancelado = await borrarTodoUI(Q, false, `19a-borrar-ajustes-${viewport.label}.png`);
    const trasCancelar = { e: await Q.ev(estado(s)), epoca: await Q.ev(meta('epoca')), pendiente: await Q.ev(meta('borradoPendiente')) };
    if (!/Borrar todas las partidas/.test(cancelado.dialogo?.mensaje ?? '') || cancelado.dialogo.aceptado || trasCancelar.e.estado !== 'ocupada' || trasCancelar.e.ls !== A.run || trasCancelar.epoca !== null || trasCancelar.pendiente !== null) throw new Error(`#11 cancelar el borrado cambió algo: ${JSON.stringify({ cancelado, trasCancelar })}`);
    await recargar(Q, 'pestaña Q (#11)');
    const todo1 = await borrarTodoUI(Q, true);
    await Q.foto(`19b-borrado-completo-${viewport.label}.png`);
    const e1 = await Q.ev(estado(s));
    const inv1 = await Q.ev(idbLeer('invalidados', `${s}|${A.run}`));
    // Lo que no es la condición previa se apunta y se sigue: así una base
    // vieja enseña TODO el repro (el aviso y si A revive), no solo lo primero.
    const problemas = [];
    if (todo1.avisos.length !== 1 || !/^Borrados partidas \(1\), personajes/.test(todo1.avisos[0]) || e1.estado !== 'borrada' || e1.snap !== null || e1.ls !== null || inv1?.motivo !== 'borrado-todo' || (await Q.ev(meta('epoca'))) !== 1) problemas.push(`borrar todo: ${JSON.stringify({ avisos: todo1.avisos, e1, inv1 })}`);
    // Q crea B: ocupa la ranura liberada; después la borra desde «Cargar».
    await recargar(Q, 'pestaña Q (#11)');
    const B = await crear(Q, 'Bea');
    if (String(B.ranura) !== s) throw new Error(`#11 §1: B no ocupó la ranura liberada (${B.ranura} en vez de ${s})`);
    await recargar(Q, 'pestaña Q (#11)');
    const dB = await borrarRanuraUI(Q, s);
    const antes = await Q.ev(estado(s));
    if (!/Borrar la partida de Bea/.test(dB?.mensaje ?? '') || antes.estado !== 'borrada' || antes.run !== B.run) throw new Error(`#11 §1 borrar B: ${JSON.stringify({ dB, antes })}`);
    // P, con A en memoria: guardar con el botón y pasar turnos.
    const manual = await guardarConBoton(P.ev, P.hasta);
    const n0 = await nAvisos(P);
    await turnos(P, 3);
    const deTurnos = (await avisosDesde(P, n0)).filter((a) => a.includes(AVISO_BORRADA));
    await P.foto(`19c-pestana-vieja-aviso-${viewport.label}.png`);
    const despues = await P.ev(estado(s));
    if (!manual.some((a) => a.includes(AVISO_BORRADA)) || manual.some((a) => /Partida guardada/.test(a)) || deTurnos.length !== 1
      || despues.estado !== 'borrada' || despues.run !== B.run || despues.rev !== antes.rev || despues.snap !== null || despues.ls !== null) {
      problemas.push(`guardado tardío de A (${A.run}): ${JSON.stringify({ manual, deTurnos: deTurnos.length, antes, despues })}`);
    }
    // §1 y §2 son independientes (§2 empieza con P recargada): si §1 falla,
    // §2 corre igual y los dos fallos se dicen juntos al final.
    const fallo1 = problemas.length ? `§1 historial manual:\n  ${problemas.join('\n  ')}` : null;
    if (!fallo1) console.log(`  #11 §1: A guardada → Borrar todo (Cancelar no cambió nada) → B en la ${s} → B borrada → P guarda A: rechazado, «${AVISO_BORRADA}» (botón y 1 aviso en 3 turnos); ranura ${s} sigue borrada (rev ${despues.rev}, sin copia ni espejo)`);

    // ── §2 · automática ─────────────────────────────────────────────────
    await recargar(P, 'pestaña P (#11)');
    const C = await crear(P, 'Cira');
    const auto = (opciones) => `ARCANVEIL.sistema('saves').guardar('auto', ${JSON.stringify({ silencioso: true, nota: 'automático', ...opciones })}).then((r) => ({ exito: r.exito, codigo: r.codigo ?? null }))`;
    const a0 = await P.ev(auto({ token: 'T-11-auto' }));
    const ea0 = await P.ev(estado('auto'));
    if (!a0.exito || ea0.run !== C.run || ea0.ls !== C.run) throw new Error(`#11 §2: la automática de C no se guardó: ${JSON.stringify({ a0, ea0 })}`);
    await recargar(Q, 'pestaña Q (#11)');
    await borrarTodoUI(Q, true);
    const conToken = await P.ev(auto({ token: 'T-11-auto' }));
    const sinToken = await P.ev(auto({}));
    const n2 = await nAvisos(P);
    await turnos(P, 3);
    const deTurnos2 = (await avisosDesde(P, n2)).filter((a) => a.includes(AVISO_BORRADA));
    await P.foto(`19d-automatica-vieja-aviso-${viewport.label}.png`);
    const ea1 = await P.ev(estado('auto'));
    const fallo2 = conToken.exito || sinToken.exito || conToken.codigo !== 'invalidada' || sinToken.codigo !== 'invalidada' || ea1.snap !== null || ea1.ls !== null || ea1.estado === 'ocupada' || deTurnos2.length !== 1
      ? `§2 automática vieja (${C.run}): ${JSON.stringify({ conToken, sinToken, ea1, deTurnos2: deTurnos2.length })}` : null;
    if (fallo1 || fallo2) throw new Error(`#11 ${[fallo1, fallo2].filter(Boolean).join('\n')}`);
    console.log(`  #11 §2: C guardada en la automática → Borrar todo en Q → la automática de C (con y sin token) se rechaza («invalidada»), sin copia ni espejo; 1 aviso en 3 turnos`);

    // ── Borrado que falla, a medias, reintento y recuperación al arrancar ──
    await recargar(Q, 'pestaña Q (#11)');
    const D = await crear(Q, 'Dana');
    await recargar(Q, 'pestaña Q (#11)');
    await Q.ev(`(async () => { const C = await import('/src/persistence/Coordinacion.js'); window.__coordReal = C.motorActual(); C.usarCoordinacion({ ...window.__coordReal, async transaccionCompleta() { throw new Error('FIXTURE: IndexedDB rechaza la transacción'); } }); return true; })()`);
    const fallido = await borrarTodoUI(Q, true);
    await Q.foto(`19e-borrado-fallido-${viewport.label}.png`);
    await Q.ev(`(async () => { (await import('/src/persistence/Coordinacion.js')).usarCoordinacion(window.__coordReal); return true; })()`);
    const eF = await Q.ev(estado(D.ranura));
    if (!fallido.avisos.some((a) => /^No se ha borrado todo: .*No se ha borrado nada; puedes volver a intentarlo/.test(a)) || fallido.avisos.some((a) => /Borrados partidas|^Borrado:/.test(a)) || eF.estado !== 'ocupada' || eF.snap !== D.run || eF.ls !== D.run) throw new Error(`#11 borrado fallido: ${JSON.stringify({ avisos: fallido.avisos, eF })}`);
    await Q.ev(`(() => { window.__quitarReal = Storage.prototype.removeItem; Storage.prototype.removeItem = function (k) { if (String(k).startsWith('arcanveil:partida:')) throw new Error('FIXTURE: el navegador no deja quitar la copia'); return window.__quitarReal.call(this, k); }; return true; })()`);
    const medias = await borrarTodoUI(Q, true);
    await Q.foto(`19f-borrado-a-medias-${viewport.label}.png`);
    await Q.ev(`(() => { Storage.prototype.removeItem = window.__quitarReal; return true; })()`);
    const eM = await Q.ev(estado(D.ranura));
    const pendM = await Q.ev(meta('borradoPendiente'));
    // La copia local que queda no se ofrece en esta pestaña («Continuar» ni «Cargar»).
    const ofrecidas = await Q.ev(`ARCANVEIL.sistema('saves').listar().filter((r) => !r.vacia).length`);
    if (medias.avisos.length !== 1 || !/^Borrado a medias: las partidas ya no se pueden abrir ni guardar, pero (queda 1 dato|quedan \d+ datos) de este navegador/.test(medias.avisos[0]) || eM.snap !== null || eM.ls !== D.run || !pendM || ofrecidas !== 0) throw new Error(`#11 borrado a medias: ${JSON.stringify({ avisos: medias.avisos, eM, pendM: Boolean(pendM), ofrecidas })}`);
    // Reintento con el botón, sin recargar (recargar ya lo terminaría al arrancar).
    const reintento = await borrarTodoUI(Q, true);
    await Q.foto(`19g-borrado-reintento-${viewport.label}.png`);
    const eR = await Q.ev(estado(D.ranura));
    if (!reintento.avisos.some((a) => /Borrados partidas/.test(a)) || eR.ls !== null || eR.snap !== null || (await Q.ev(meta('borradoPendiente')))) throw new Error(`#11 reintento: ${JSON.stringify({ avisos: reintento.avisos, eR })}`);
    // A medias otra vez y, en vez de reintentar, se recarga: el arranque lo termina.
    const E = await crear(Q, 'Eli');
    await recargar(Q, 'pestaña Q (#11)');
    await Q.ev(`(() => { window.__quitarReal = Storage.prototype.removeItem; Storage.prototype.removeItem = function (k) { if (String(k).startsWith('arcanveil:partida:')) throw new Error('FIXTURE: el navegador no deja quitar la copia'); return window.__quitarReal.call(this, k); }; return true; })()`);
    await borrarTodoUI(Q, true);
    const antesDeArrancar = await Q.ev(estado(E.ranura));
    await recargar(Q, 'pestaña Q (#11)');
    await Q.ev(`Promise.resolve(ARCANVEIL.sistema('saves').drenar?.(15000)).then(() => true)`);
    const eArr = await Q.ev(estado(E.ranura));
    if (antesDeArrancar.ls !== E.run || eArr.ls !== null || eArr.snap !== null || (await Q.ev(meta('borradoPendiente')))) throw new Error(`#11 recuperación al arrancar: ${JSON.stringify({ antesDeArrancar, eArr })}`);
    console.log(`  #11 borrar todo: falla → «${fallido.avisos.find((a) => /^No se ha borrado todo/.test(a)).slice(0, 80)}…» (nada tocado); a medias → «${medias.avisos.find((a) => /^Borrado a medias/.test(a)).slice(0, 80)}…»; reintento completo; a medias + recarga → el arranque quita la copia local y cierra la intención`);
  } finally {
    await P.cerrar();
    await Q.cerrar();
    await ctx.cerrar();
  }
}

/**
 * #8 · GUARDADO COORDINADO ENTRE PESTAÑAS, en Chrome real: pestañas del
 * MISMO perfil (mismo localStorage, misma IndexedDB, mismos Web Locks).
 * Precondición: esta pestaña juega una campaña guardada en su ranura E y
 * las ocho ranuras están llenas. Lo que es FIXTURE se dice (caché vieja de
 * localStorage, candado retenido, mapas viejos, XP conocida); lo demás es el
 * flujo real de la interfaz. Que no se reproduzca una carrera NATURAL no se
 * afirma: la caché vieja es simulada; el candado y el commit, reales.
 */
async function pestanasCoordinadas() {
  etapa('#8 · otra pestaña reemplaza la ranura de esta partida; el guardado de esta se rechaza');
  await evaluate(GRABAR_AVISOS);
  const E = await evaluate(`ARCANVEIL.ver('meta.ranura')`);
  const runOld = await evaluate(`ARCANVEIL.ver('meta.runId')`);
  const g0 = await guardarConBoton(evaluate, until);
  if (!g0.some((t) => /Partida guardada/.test(t))) throw new Error(`#8: la partida de esta pestaña no se pudo guardar al empezar: ${JSON.stringify(g0)}`);
  const bytesOld = await evaluate(lsBytes(E));
  const dueno = async (n) => (await evaluate(idbLeer('ranuras', n)))?.runId ?? null;
  const otra = await abrirPestana(URL_APP);
  let tercera = null;
  try {
    await otra.hasta(LISTA_APP);
    if (!await otra.ev(HASTA_COMENZAR)) throw new Error('#8: la otra pestaña no llegó a «Comenzar partida»');
    await otra.ev(`document.querySelector('#personajes-comenzar').click(); true`);
    await otra.hasta('!document.getElementById("ranuras-modal").hidden', 10000);
    await otra.ev(`document.querySelector('[data-reemplazar="${E}"]').click(); true`);
    await otra.ev(`document.querySelector('#ranuras-confirmar').click(); true`);
    await otra.hasta(`document.body.dataset.activeScreen === "juego" && ARCANVEIL.ver("meta.ranura") === ${JSON.stringify(E)}`, 20000);
    await otra.hasta('!ARCANVEIL.sistema("turns")._ocupado', 15000);
    const runNew = await otra.ev(`ARCANVEIL.ver('meta.runId')`);
    // La pestaña nueva puede seguir guardando (el guardado de tras abrir la
    // crónica): se espera a su cola (barrera `drenar`) antes de tomar la
    // referencia, y la pestaña nueva no hace nada más mientras se prueba.
    // (En la base 6afe016 el guardado es síncrono: no hay cola que esperar.)
    await otra.ev(`Promise.resolve(ARCANVEIL.sistema('saves').drenar?.(15000)).then(() => true)`);
    const bytesNew = await otra.ev(lsBytes(E));
    const revNew = (await evaluate(idbLeer('ranuras', E)))?.rev ?? null;
    if (runNew === runOld || (await evaluate(lsRun(E))) !== runNew || (await dueno(E)) !== runNew) throw new Error(`#8: el reemplazo desde la otra pestaña no dejó NEW-RUN en la ranura ${E}: ${JSON.stringify({ runOld, runNew, ls: await evaluate(lsRun(E)), idb: await dueno(E) })}`);

    // (1) Sin fixture: Chrome real, mismo perfil, sin tocar la caché.
    const natural = await guardarConBoton(evaluate, until);
    const tras1 = { bytes: (await evaluate(lsBytes(E))) === bytesNew, run: await evaluate(lsRun(E)), dueno: await dueno(E), rev: (await evaluate(idbLeer('ranuras', E)))?.rev ?? null, revNew, avisos: natural };
    if (natural.length !== 1 || natural.some((t) => /Partida guardada/.test(t)) || !natural.some((t) => /otra (partida|campaña)/.test(t)) || !tras1.bytes || tras1.run !== runNew || tras1.dueno !== runNew || tras1.rev !== revNew) throw new Error(`#8 (sin fixture): la pestaña vieja guardó encima de la nueva o no lo dijo: ${JSON.stringify(tras1)}`);
    // (2) FIXTURE: caché vieja; getItem de la ranura E devuelve los bytes de OLD-RUN.
    await evaluate(`(() => { window.__getItemReal = Storage.prototype.getItem; const viejo = ${JSON.stringify(bytesOld)}; Storage.prototype.getItem = function (k) { return k === 'arcanveil:partida:' + ${JSON.stringify(E)} ? viejo : window.__getItemReal.call(this, k); }; return true; })()`);
    let cache;
    try {
      // Sin avisos anteriores en pantalla: la captura enseña solo el de este intento.
      await until('!document.querySelector("#avisos")?.children.length', 8000);
      cache = await guardarConBoton(evaluate, until);
      await wait(500);
      await fotoRapida(`16a-guardado-bloqueado-old-new-${viewport.label}.png`);
    } finally {
      await evaluate(`Storage.prototype.getItem = window.__getItemReal; true`);
    }
    const tras2 = { bytes: (await evaluate(lsBytes(E))) === bytesNew, run: await evaluate(lsRun(E)), rev: (await evaluate(idbLeer('ranuras', E)))?.rev ?? null, revNew, dueno: await dueno(E), copia: JSON.parse((await evaluate(idbLeer('partidas', E)))?.texto ?? 'null')?.estado?.meta?.runId ?? null, avisos: cache };
    if (cache.length !== 1 || cache.some((t) => /Partida guardada/.test(t)) || !cache.some((t) => /otra (partida|campaña)/.test(t)) || !tras2.bytes || tras2.run !== runNew || tras2.rev !== revNew || tras2.dueno !== runNew) throw new Error(`#8 (FIXTURE caché vieja OLD-RUN): ${JSON.stringify(tras2)}`);
    // (3) Un turno: su guardado silencioso tampoco escribe, y se dice una vez.
    await evaluate(`ARCANVEIL.jugar('miro alrededor')`);
    await until('!ARCANVEIL.sistema("turns")._ocupado', 15000);
    await wait(800);
    if ((await evaluate(lsRun(E))) !== runNew || (await dueno(E)) !== runNew) throw new Error('#8: el guardado de fin de turno de la pestaña vieja pisó la ranura');
    console.log(`  #8 caché vieja: ${runOld} no pisa ${runNew} en la ranura ${E} (sin fixture y con caché vieja simulada); motivo «${cache.find((t) => /otra/.test(t))?.slice(0, 70)}…»`);

    // La nueva sigue tras recargar su pestaña.
    await navegarEn(otra, '({ click: () => location.reload() })', LISTA_APP);
    await otra.ev(`document.querySelector('#inicio-jugar')?.click(); document.querySelector('#menu-cargar').click(); true`);
    await otra.hasta('document.body.dataset.activeScreen === "cargar"');
    await otra.ev(`document.querySelector('#cargar-lista .tarjeta-pj__abrir[data-ranura="${E}"]').click(); true`);
    await otra.hasta(`document.body.dataset.activeScreen === "juego" && ARCANVEIL.ver("meta.runId") === ${JSON.stringify(runNew)}`, 15000);
    await otra.hasta('!ARCANVEIL.sistema("turns")._ocupado', 15000);
    await otra.foto(`16b-nueva-preservada-tras-recargar-${viewport.label}.png`);

    etapa('#8 · guardado pendiente (otra pestaña retiene el candado), doble clic y éxito');
    // FIXTURE: esta pestaña retiene el candado global de ranuras.
    await evaluate(`navigator.locks.request('arcanveil:ranuras', () => new Promise((r) => { window.__soltarCandado = r; })); true`);
    await until('typeof window.__soltarCandado === "function"');
    await otra.ev(GRABAR_AVISOS);
    await otra.hasta('!document.querySelector("#avisos")?.children.length', 8000);
    const revAntes = (await otra.ev(idbLeer('ranuras', E)))?.rev ?? null;
    const n0 = await otra.ev('window.__avisos.length');
    await otra.ev(`(() => { const b = document.querySelector('#guardar'); b.click(); b.click(); return true; })()`);
    await otra.hasta(`document.querySelector('#guardar').getAttribute('aria-busy') === 'true'`, 5000);
    await wait(500);
    const pend = await otra.ev(`(async () => ({ texto: document.querySelector('#guardar').textContent, avisos: window.__avisos.length - ${n0}, rev: (await ${idbLeer('ranuras', E)})?.rev ?? null }))()`);
    if (pend.texto !== 'Guardando…' || pend.avisos !== 0 || pend.rev !== revAntes) throw new Error(`#8: guardado pendiente: ${JSON.stringify({ pend, revAntes })}`);
    await otra.foto(`16c-guardado-pendiente-${viewport.label}.png`);
    await evaluate('window.__soltarCandado(); true');
    await otra.hasta(`window.__avisos.length > ${n0} && document.querySelector('#guardar').getAttribute('aria-busy') !== 'true'`, 10000);
    await wait(500);
    await otra.foto(`16d-guardado-exito-${viewport.label}.png`);
    const fin = await otra.ev(`(async () => ({ avisos: window.__avisos.slice(${n0}), texto: document.querySelector('#guardar').textContent, rec: await ${idbLeer('ranuras', E)} }))()`);
    if (fin.avisos.length !== 1 || !/Partida guardada/.test(fin.avisos[0]) || fin.texto !== 'Guardar' || fin.rec?.rev !== revAntes + 1 || fin.rec?.runId !== runNew) throw new Error(`#8: guardado tras soltar el candado (doble clic = un guardado): ${JSON.stringify({ fin, revAntes })}`);
    console.log(`  #8 guardado pendiente: «Guardando…» sin aviso mientras otra pestaña tiene el candado; al soltarlo, un aviso y una revisión (${revAntes} → ${fin.rec.rev})`);

    etapa('#8 · la pestaña vieja sale sin pisar nada');
    await evaluate(`document.querySelector('#menu').click(); true`);
    await until('!document.getElementById("salida-modal").hidden && /otra partida/.test(document.getElementById("salida-nota").textContent)', 15000);
    await fotoRapida(`16e-salida-pestana-vieja-${viewport.label}.png`);
    await evaluate(`[...document.querySelectorAll('#salida-acciones button')].find((b) => b.textContent.trim() === 'Salir sin guardar…').click(); true`);
    await pulsarYNavegar(`[...document.querySelectorAll('#salida-acciones button')].find((b) => b.textContent.trim() === 'Salir sin guardar')`, 'window.ARCANVEIL?.motor?.listo && document.body.dataset.activeScreen === "inicio"');
    if ((await evaluate(lsRun(E))) !== runNew || (await dueno(E)) !== runNew) throw new Error('#8: salir de la pestaña vieja tocó la ranura de la nueva');

    etapa('#8 · permiso de reemplazo caducado: otra pestaña guarda esa campaña tras elegirla');
    await evaluate(GRABAR_AVISOS);
    if (!await evaluate(HASTA_COMENZAR)) throw new Error('#8: no se llegó a «Comenzar partida»');
    await evaluate(`document.querySelector('#personajes-comenzar').click(); true`);
    await until('!document.getElementById("ranuras-modal").hidden', 10000);
    const filas = await evaluate(`[...document.querySelectorAll('#ranuras-lista .ranura-fila')].map((f) => ({ ranura: f.dataset.ranura, bloqueada: f.classList.contains('ranura-fila--bloqueada'), texto: f.textContent }))`);
    const T = filas.find((x) => !x.bloqueada && x.ranura !== E && /· vivo ·/.test(x.texto))?.ranura;
    if (!T) throw new Error(`#8: no hay otra campaña viva para el permiso caducado: ${JSON.stringify(filas)}`);
    await evaluate(`document.querySelector('[data-reemplazar="${T}"]').click(); true`);
    // La otra pestaña: sale (guardando la suya), abre la campaña T y la guarda.
    await navegarEn(otra, `document.querySelector('#menu')`, 'window.ARCANVEIL?.motor?.listo && document.body.dataset.activeScreen === "inicio"');
    await otra.ev(`document.querySelector('#inicio-jugar')?.click(); document.querySelector('#menu-cargar').click(); true`);
    await otra.hasta('document.body.dataset.activeScreen === "cargar"');
    await otra.ev(`document.querySelector('#cargar-lista .tarjeta-pj__abrir[data-ranura="${T}"]').click(); true`);
    await otra.hasta(`document.body.dataset.activeScreen === "juego" && ARCANVEIL.ver("meta.ranura") === ${JSON.stringify(T)}`, 15000);
    await otra.hasta('!ARCANVEIL.sistema("turns")._ocupado', 15000);
    const runT = await otra.ev(`ARCANVEIL.ver('meta.runId')`);
    const gT = await guardarConBoton(otra.ev, otra.hasta);
    if (!gT.some((t) => /Partida guardada/.test(t))) throw new Error(`#8: la otra pestaña no pudo guardar la campaña ${T}: ${JSON.stringify(gT)}`);
    const bytesT = await evaluate(lsBytes(T));
    const recT = await evaluate(idbLeer('ranuras', T));
    const nAv = await evaluate('window.__avisos.length');
    await evaluate(`document.querySelector('#ranuras-confirmar').click(); true`);
    await until('!document.getElementById("ranuras-modal").hidden && document.getElementById("ranuras-modal").dataset.etapa === "lista"', 10000);
    const caducado = await evaluate(`(async () => ({ avisos: window.__avisos.slice(${nAv}), bytes: ${lsBytes(T)}, rec: await ${idbLeer('ranuras', T)}, jugador: ARCANVEIL.ver('player.raza') ?? null }))()`);
    await fotoRapida(`16f-permiso-caducado-${viewport.label}.png`);
    if (!caducado.avisos.some((t) => /ha cambiado/.test(t)) || caducado.bytes !== bytesT || caducado.rec?.runId !== runT || caducado.rec?.rev !== recT?.rev || caducado.jugador) throw new Error(`#8: permiso caducado: ${JSON.stringify({ ...caducado, bytes: caducado.bytes === bytesT, recT })}`);
    // Con el permiso leído de nuevo: solo T.
    const antesTodo = await evaluate(todasLsBytes);
    await evaluate(`document.querySelector('[data-reemplazar="${T}"]').click(); true`);
    await evaluate(`document.querySelector('#ranuras-confirmar').click(); true`);
    await until(`document.body.dataset.activeScreen === "juego" && ARCANVEIL.ver("meta.ranura") === ${JSON.stringify(T)}`, 20000);
    await until('!ARCANVEIL.sistema("turns")._ocupado', 15000);
    const runM = await evaluate(`ARCANVEIL.ver('meta.runId')`);
    const despuesTodo = await evaluate(todasLsBytes);
    const tocadas = Object.keys(antesTodo).filter((k) => despuesTodo[k] !== antesTodo[k]);
    if (tocadas.length !== 1 || tocadas[0] !== String(T) || (await dueno(T)) !== runM) throw new Error(`#8: el reemplazo con permiso vigente tocó otras ranuras: ${JSON.stringify({ tocadas, T })}`);
    console.log(`  #8 permiso caducado: la ranura ${T} se guardó en otra pestaña tras elegirla (rev ${recT?.rev}); reemplazo solo con el permiso releído`);

    etapa('#8 · dos muertes a la vez en dos pestañas (mapas viejos en una): dos marcas y dos fotos');
    // La otra pestaña sigue con la campaña T (ya reemplazada: su final no se
    // podrá guardar en T y se dirá). La tercera abre la nueva (ranura E).
    tercera = await abrirPestana(URL_APP);
    await tercera.hasta(LISTA_APP);
    await tercera.ev(`document.querySelector('#inicio-jugar')?.click(); document.querySelector('#menu-cargar').click(); true`);
    await tercera.hasta('document.body.dataset.activeScreen === "cargar"');
    await tercera.ev(`document.querySelector('#cargar-lista .tarjeta-pj__abrir[data-ranura="${E}"]').click(); true`);
    await tercera.hasta(`document.body.dataset.activeScreen === "juego" && ARCANVEIL.ver("meta.runId") === ${JSON.stringify(runNew)}`, 15000);
    await tercera.hasta('!ARCANVEIL.sistema("turns")._ocupado', 15000);
    // FIXTURE: la tercera ve los mapas locales de ANTES de las dos muertes.
    const mapas = await evaluate(`({ m: localStorage.getItem('arcanveil:runs-muertos'), l: localStorage.getItem('arcanveil:legados') })`);
    await tercera.ev(`(() => { const r = Storage.prototype.getItem; const v = ${JSON.stringify(mapas)}; window.__getItemReal = r; Storage.prototype.getItem = function (k) { if (k === 'arcanveil:runs-muertos') return v.m; if (k === 'arcanveil:legados') return v.l; return r.call(this, k); }; return true; })()`);
    // FIXTURE: XP conocida y sin el rasgo que evita la muerte.
    const prep = (xp) => `(() => { const x = ARCANVEIL.ver('player.xp') ?? 0; if (x < ${xp}) ARCANVEIL.store.dispatch('player/xp', { cantidad: ${xp} - x, motivo: 'fixture' }); ARCANVEIL.store.fijar('player._rasgoTrasfondo', null); return ARCANVEIL.ver('player.xp'); })()`;
    const xpT = await otra.ev(prep(1000));
    const xpN = await tercera.ev(prep(600));
    const golpes = `(async () => { for (let i = 0; i < 3 && ARCANVEIL.ver('meta.fase') !== 'fin'; i++) { ARCANVEIL.store.dispatch('player/danar', { cantidad: 999, origen: 'regresion' }); await new Promise((r) => setTimeout(r, 150)); } return ARCANVEIL.ver('meta.fase'); })()`;
    const fases = await Promise.all([otra.ev(golpes), tercera.ev(golpes)]);
    if (fases.some((x) => x !== 'fin')) throw new Error(`#8: las dos no murieron: ${JSON.stringify(fases)}`);
    const regs = await Promise.all([otra.ev('ARCANVEIL.sistema("muerte").registro'), tercera.ev('ARCANVEIL.sistema("muerte").registro')]);
    await tercera.ev('Storage.prototype.getItem = window.__getItemReal; true');
    const autoridad = await evaluate(`(async () => ({ mT: await ${idbLeer('muertos', runT)}, mN: await ${idbLeer('muertos', runNew)}, lT: await ${idbLeer('legados', runT)}, lN: await ${idbLeer('legados', runNew)} }))()`);
    const espT = Math.trunc((xpT * 35) / 100);
    const espN = Math.trunc((xpN * 35) / 100);
    if (!regs.every((g) => g?.estado === 'registrada') || !autoridad.mT || !autoridad.mN || autoridad.lT?.cantidad !== espT || autoridad.lN?.cantidad !== espN) throw new Error(`#8: dos muertes: ${JSON.stringify({ regs, autoridad: { mT: Boolean(autoridad.mT), mN: Boolean(autoridad.mN), lT: autoridad.lT?.cantidad, lN: autoridad.lN?.cantidad }, espT, espN })}`);
    // Final durable de la nueva (ranura E) y la ranura T intacta (es de M).
    await tercera.hasta(`/Muerte registrada/.test(document.getElementById('caida-registro')?.textContent ?? '') && /${espN} XP/.test(document.getElementById('caida-legado')?.textContent ?? '')`, 10000);
    // El final (con la muerte dentro) se escribe tras el registro: se espera
    // a leerlo en las dos copias, con tope.
    let final = null;
    for (let i = 0; i < 50; i++) {
      final = await evaluate(`(async () => ({ ls: (() => { try { return JSON.parse(${lsBytes(E)})?.estado?.meta?.muerte?.runId ?? null; } catch { return null; } })(), idb: JSON.parse((await ${idbLeer('partidas', E)})?.texto ?? 'null')?.estado?.meta?.muerte?.runId ?? null, duenoE: (await ${idbLeer('ranuras', E)})?.runId, duenoT: (await ${idbLeer('ranuras', T)})?.runId }))()`);
      if (final.ls === runNew && final.idb === runNew) break;
      await wait(200);
    }
    if (final.ls !== runNew || final.idb !== runNew || final.duenoE !== runNew || final.duenoT !== runM) throw new Error(`#8: final durable: ${JSON.stringify({ final, runNew, runM })}`);
    await tercera.foto(`16g-muerte-registrada-durable-${viewport.label}.png`);
    // Una pestaña que intenta cargar al muerto (la otra, ya en su final): no revive.
    const revive = await otra.ev(`ARCANVEIL.sistema('saves').cargar(${JSON.stringify(E)}).then((r) => ({ exito: r.exito, motivo: r.motivo, run: ARCANVEIL.ver('meta.runId') }))`);
    if (revive.exito || revive.motivo !== 'muerto') throw new Error(`#8: cargar la ranura del muerto lo revivió: ${JSON.stringify(revive)}`);
    // Las dos herencias, elegibles.
    await navegarEn(tercera, `[...document.querySelectorAll('#caida-acciones button')].find((b) => b.textContent.trim() === 'Nueva partida')`, 'window.ARCANVEIL?.motor?.listo && document.body.dataset.activeScreen === "herencia"');
    const tarjetas = await tercera.ev(`[...document.querySelectorAll('.tarjeta-herencia')].map((b) => ({ origen: b.dataset.origen, activa: !b.disabled, texto: b.textContent }))`);
    const tT = tarjetas.find((x) => x.origen === runT);
    const tN = tarjetas.find((x) => x.origen === runNew);
    if (!tT?.activa || !tN?.activa || !tT.texto.includes(`${espT} XP`) || !tN.texto.includes(`${espN} XP`)) throw new Error(`#8: las dos herencias no se pueden elegir: ${JSON.stringify(tarjetas)}`);
    await tercera.foto(`16h-dos-herencias-${viewport.label}.png`);
    console.log(`  #8 dos muertes: ${runT} (${espT} XP) y ${runNew} (${espN} XP) con marca y foto en el registro coordinado; final durable en la ${E}; no revive; las dos herencias elegibles`);
  } finally {
    await otra.cerrar();
    if (tercera) await tercera.cerrar();
  }
}

try {
  await json(`http://127.0.0.1:${PORT}/app/index.html`);
  const target = await json(`http://127.0.0.1:${DEBUG}/json/new?${encodeURIComponent(URL_APP)}`, { method: 'PUT' });
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  ws.onmessage = ({ data }) => {
    const m = JSON.parse(data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id); pending.delete(m.id);
      if (m.error) p.reject(new Error(m.error.message)); else p.resolve(m.result);
    } else if (EVENTOS_NAVEGACION.has(m.method)) {
      eventosPrincipal.push({ method: m.method, params: m.params, t: Date.now() });
      if (eventosPrincipal.length > 2000) eventosPrincipal.splice(0, 1000);
    } else if (m.method === 'Runtime.exceptionThrown') {
      exceptions.push(m.params.exceptionDetails?.text ?? 'excepción');
      apuntarPrincipal({ tipo: 'excepción', texto: String(m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text ?? '').slice(0, 200) });
    } else if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) {
      apuntarPrincipal({ tipo: `consola ${m.params.type}`, texto: (m.params.args ?? []).map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 200) });
    } else if (m.method === 'Network.loadingFailed') {
      apuntarPrincipal({ tipo: 'red', texto: `${m.params.errorText}${m.params.blockedReason ? ` (${m.params.blockedReason})` : ''}${m.params.canceled ? ' (cancelada)' : ''}`, ...peticionDe(peticionesPrincipal, m.params.requestId, m.params.type) });
    } else if (m.method === 'Network.responseReceived') {
      if (m.params.response.status >= 400) apuntarPrincipal({ tipo: 'red', texto: `HTTP ${m.params.response.status}`, ...peticionDe(peticionesPrincipal, m.params.requestId, m.params.type) });
    } else if (m.method === 'Network.requestWillBeSent') {
      apuntarPeticion(peticionesPrincipal, m.params);
      const url = m.params.request.url;
      if (/^(?:https?|wss?):/.test(url) && !/^(?:https?|wss?):\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?\//.test(url)) externos.push(url.slice(0, 120));
    }
  };
  await cdp('Runtime.enable'); await cdp('Page.enable'); await cdp('Network.enable'); await cdp('Inspector.enable');
  ws.addEventListener('close', () => eventosPrincipal.push({ method: 'Inspector.detached', params: { reason: 'canal cerrado' }, t: Date.now() }));

  // FIXTURE de semilla (#7): el azar de la página (la ficha aleatoria, la
  // semilla maestra del motor, las variantes del narrador) sale de
  // `--semilla N`, sembrado ANTES de que cargue nada. Misma semilla, misma
  // partida: así una prueba que depende del dado se puede repetir igual en
  // la base y en el HEAD. No toca reglas: solo de dónde sale el azar.
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
    let s = ${semilla} >>> 0;
    const azar = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    Math.random = azar;
    const original = crypto.getRandomValues.bind(crypto);
    crypto.getRandomValues = (a) => { if (a instanceof Uint32Array) { for (let i = 0; i < a.length; i++) a[i] = (azar() * 4294967296) >>> 0; return a; } return original(a); };
  })();` });
  await navegarHasta(RECARGAR, { finales: APP });

  // `--sin-ia`: sin generador de imágenes en el equipo. El juego tiene que
  // seguir igual, con marcadores, y el estudio decir por qué no pinta.
  if (sinIA) {
    await cdp('Network.setBlockedURLs', { urls: ['*127.0.0.1:11437*', '*localhost:11437*'] });
    await navegarHasta(() => cdp('Page.reload', { ignoreCache: true }), { finales: APP });
    etapa(`arranque ${viewport.label}${sinIA ? ' sin generador' : ''}`);
    await until('window.ARCANVEIL?.motor?.listo && document.body.classList.contains("esta-listo")');
  }

  await until('window.ARCANVEIL?.motor?.listo && document.body.classList.contains("esta-listo")');
  const boot = await evaluate(`({screen:document.body.dataset.activeScreen, systems:ARCANVEIL.inspeccionar().total, failures:document.querySelectorAll('#fallos').length})`);
  if (boot.screen !== 'inicio' || boot.failures) throw new Error(`arranque inválido ${JSON.stringify(boot)}`);
  await shot(`01-inicio-${viewport.label}.png`);

  // La portada es la marca y «Pulsa para jugar»; el menú aún no se ve.
  const visibles = () => evaluate(`[...document.querySelectorAll('.menu-btn')].filter(b=>b.offsetParent!==null).map(b=>b.id)`);
  if ((await visibles()).length) throw new Error(`el menú se ve antes de pulsar: ${await visibles()}`);

  // La tinta del título, medida sobre los píxeles de la captura: dentro de la
  // pantalla y centrada. La caja del texto no sirve: el trazo de la última
  // ele sobra de ella, y en escritorio salía 80 px fuera con la caja «dentro».
  {
    await evaluate(`document.getAnimations().forEach((a) => { try { a.finish(); } catch { try { a.cancel(); } catch {} } })`);
    await wait(300);
    const foto = await cdp('Page.captureScreenshot', { format: 'png' });
    const tinta = await evaluate(`(async () => {
      const h = document.querySelector('.inicio__marca').getBoundingClientRect();
      const img = new Image(); img.src = 'data:image/png;base64,${foto.data}'; await img.decode();
      const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
      const cx = cv.getContext('2d'); cx.drawImage(img, 0, 0);
      const k = img.width / innerWidth;
      const y0 = Math.max(0, Math.floor((h.top - 10) * k)), y1 = Math.min(img.height, Math.ceil((h.bottom + 25) * k));
      const d = cx.getImageData(0, y0, img.width, y1 - y0).data;
      let min = Infinity, max = -1;
      for (let y = 0; y < y1 - y0; y++) for (let x = 0; x < img.width; x++) {
        const i = (y * img.width + x) * 4;
        if (d[i] > 170 && d[i + 1] > 130 && d[i + 2] < 170 && d[i] - d[i + 2] > 45) { if (x < min) min = x; if (x > max) max = x; }
      }
      return { izq: min / k, der: innerWidth - max / k, ancho: innerWidth };
    })()`);
    if (!(tinta.izq > 0 && tinta.der > 0)) throw new Error(`la tinta del título se sale: ${JSON.stringify(tinta)}`);
    if (Math.abs(tinta.izq - tinta.der) > 8) throw new Error(`el título no está centrado: ${JSON.stringify(tinta)}`);
  }

  // Pulsar abre el menú y lleva el foco dentro; Escape lo cierra y vuelve.
  await evaluate(`document.querySelector('#inicio-jugar').click()`);
  const menu = await visibles();
  for (const id of ['menu-nueva', 'menu-cargar', 'menu-ajustes']) if (!menu.includes(id)) throw new Error(`falta ${id} en el menú: ${menu}`);
  const foco = await evaluate(`document.activeElement?.id`);
  if (!/^menu-/.test(foco ?? '')) throw new Error(`al abrir el menú el foco no entra: ${foco}`);
  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`);
  if ((await visibles()).length || (await evaluate(`document.activeElement?.id`)) !== 'inicio-jugar') throw new Error('Escape no cierra el menú o no devuelve el foco');
  await evaluate(`document.querySelector('#inicio-jugar').click()`);
  await shot(`01b-menu-${viewport.label}.png`);

  principal: {
  if (soloPestanas) {
    etapa('solo pestañas: una campaña real y las demás ranuras llenas (FIXTURE)');
    await evaluate(`document.querySelector('#menu-nueva').click()`);
    await until('document.body.dataset.activeScreen === "creacion" && document.querySelector("#origen-raza")');
    await evaluate(crearPersonajeUI({ nombre: 'Lyra', descripcion: 'exploradora de pelo plateado y armadura de cuero negro', lore: 'Busca a su hermana desde hace años.', intensidad: 'relato', imagen: 'ninguno' }));
    await until('document.querySelector("#creacion-empezar") && document.querySelector("#creacion-cara .arte")', 15000);
    await evaluate(`document.querySelector('#creacion-empezar').click()`);
    await until('document.body.dataset.activeScreen === "juego" && ARCANVEIL.ver("meta.ranura") && !ARCANVEIL.sistema("turns")._ocupado', 25000);
    // FIXTURE: campañas de relleno (copias válidas con otro run) en las demás.
    await evaluate(`(() => { const yo = ARCANVEIL.ver('meta.ranura'); const base = localStorage.getItem('arcanveil:partida:' + yo); let i = 0;
      for (const n of ['1','2','3','4','5','6','7','8']) { if (n === String(yo) || localStorage.getItem('arcanveil:partida:' + n) !== null) continue; const g = JSON.parse(base); i += 1; g.estado.meta.runId = 'run-relleno-' + n; g.estado.meta.muerte = null; g.estado.player.nombre = 'Relleno ' + n; g.cabecera = { ...g.cabecera, nombre: 'Relleno ' + n, runId: 'run-relleno-' + n, muerto: false }; g.guardadoEn = Date.now() - i * 60000; localStorage.setItem('arcanveil:partida:' + n, JSON.stringify(g)); } return i; })()`);
    await pestanasCoordinadas();
    await tokenEnChrome();
    await tokensDurablesEnChrome();
    await borradoDurableEnChrome();
    if (externos.length) throw new Error(`la página pidió cosas fuera de este equipo: ${[...new Set(externos)].slice(0, 5).join(' · ')}`);
    console.log(JSON.stringify({ viewport: viewport.label, solo: 'pestanas', semilla, exceptions: exceptions.length, externos: externos.length, sinIA }, null, 2));
    break principal;
  }

  etapa('creación de personaje');
  await evaluate(`document.querySelector('#menu-nueva').click()`);
  await until('document.body.dataset.activeScreen === "creacion" && document.querySelector("#origen-raza")');
  // #12: el origen se ELIGE en tres listas (antes solo se podía tirar). El
  // dado sigue variando lo que el jugador no ha elegido.
  const listas = await evaluate(`['raza', 'clase', 'trasfondo'].map((k) => document.querySelector('#origen-' + k)?.options.length ?? 0)`);
  if (listas[0] !== 8 || listas[1] !== 8 || listas[2] !== 10) throw new Error(`las listas de origen no ofrecen todos los linajes, oficios y pasados: ${listas}`);
  const tiradas = new Set();
  for (let i = 0; i < 6; i++) {
    tiradas.add(await evaluate(`['raza', 'clase', 'trasfondo'].map((k) => document.querySelector('#origen-' + k).value).join('|')`));
    await evaluate(`document.querySelector('#creacion-aleatorio').click()`);
  }
  if (tiradas.size < 3) throw new Error(`el generador aleatorio no varía: ${[...tiradas]}`);
  await shot(`02a-creacion-${viewport.label}.png`);
  // Pasos «origen» y «quién eres». Intensidad elegida en la creación:
  // Pacífica. Se comprueba al empezar que llega a la partida y, tras 30
  // turnos, que casi no ha habido encuentros.
  const DESCRIPCION = 'elfa exploradora de pelo plateado, ojos azul brillante, cicatriz en la ceja y armadura de cuero negro';
  await evaluate(crearPersonajeUI({ nombre: 'Lyra', descripcion: DESCRIPCION, lore: 'Mi hermana cruzó el Umbral con nuestro medallón. La busco desde entonces.', intensidad: 'relato', hasta: 'aspecto' }));
  // Paso «aspecto»: lo que el juego propone es SU dibujo (sin IA), a la vista,
  // y llegar aquí no pide nada a ningún generador: eso solo al pedirlo.
  const aspecto = await evaluate(`(() => ({
    modo: document.querySelector('#aspecto')?.dataset.modo,
    dibujo: Boolean(document.querySelector('#creacion-cara svg')),
    generador: document.querySelector('#aspecto-generador')?.dataset.estado,
    pintadoApagado: document.querySelector('#aspecto-modo-pintado')?.getAttribute('aria-disabled'),
  }))()`);
  const alGenerador = [...peticionesPrincipal.values()].filter((p) => /:11437/.test(p.url)).length;
  // (Antes se exigía «pintar con IA» apagada mientras no se comprobara el
  // generador. Apagada, el clic del jugador caía en vacío —la queja—. Ahora
  // pulsarla lo comprueba; la garantía de fondo es la misma y sigue aquí: el
  // dibujo es lo elegido y al generador no se le pide NADA sin un gesto.)
  if (aspecto.modo !== 'dibujo' || !aspecto.dibujo || aspecto.generador !== 'desconocido' || aspecto.pintadoApagado === 'true' || alGenerador || generadas.length) throw new Error(`el paso «aspecto» no propone el dibujo del juego o pide algo al generador sin que se lo pidan: ${JSON.stringify({ aspecto, alGenerador, generadas: generadas.length })}`);
  await shot(`02b-creacion-aspecto-${viewport.label}.png`);
  // Esta partida sigue SIN imagen (lo elige el jugador): más abajo se pinta
  // con el generador. El dibujo del juego se prueba en `tools/auditar-ux.mjs`.
  await evaluate(`document.querySelector('#aspecto-modo-ninguno').click(); true`);
  await evaluate(`document.querySelector('#creacion-siguiente').click(); true`);
  await until('document.querySelector("#creacion-empezar") && document.querySelector("#creacion-cara .arte")');
  // Sin imagen: el marcador con el nombre, y el botón para ponérsela.
  const retrato = await evaluate(`(() => ({
    marcador: document.querySelector('#creacion-cara .marcador-arte')?.textContent ?? '',
    vector: Boolean(document.querySelector('#creacion-cara svg')),
    pintar: Boolean(document.querySelector('#retrato-pintar')),
  }))()`);
  if (!/Lyra/.test(retrato.marcador) || retrato.vector || !retrato.pintar) throw new Error(`la revisión no enseña el marcador con el nombre y el botón de la imagen: ${JSON.stringify(retrato)}`);

  // «Elfa» en la descripción y un linaje cualquiera en la ficha: la revisión
  // tiene que decirlo, y volver al origen no puede crear un gemelo.
  const aviso = await evaluate(`document.querySelector('#revelacion-especie')?.textContent ?? ''`);
  if (!/«elfa»/.test(aviso)) throw new Error(`la revisión no avisa de la especie escrita: «${aviso}»`);

  const contarPjs = `JSON.parse(localStorage.getItem('arcanveil:personajes') ?? '[]').length`;
  const pjsAntes = await evaluate(contarPjs);

  await evaluate(`document.querySelector('#revelacion-cambiar-linaje').click()`);
  await until('document.querySelector(\'[data-pantalla="creacion"]\').dataset.paso === "origen" && document.querySelector("#origen-raza")');
  // Volver a tirar no borra el nombre escrito (ni lo que se escribió después).
  await evaluate(`document.querySelector('#creacion-aleatorio').click()`);
  await evaluate(`document.querySelector('#creacion-siguiente').click(); true`);
  await until('document.querySelector("#nombre")');
  const nombreTrasTirar = await evaluate(`document.querySelector('#nombre').value`);
  if (nombreTrasTirar !== 'Lyra') throw new Error(`volver a tirar borró el nombre escrito: «${nombreTrasTirar}»`);
  await evaluate(`document.querySelector('#creacion-siguiente').click(); true`);
  await until('document.querySelector("#retrato-descripcion")');
  const conservado = await evaluate(`document.querySelector('#retrato-descripcion').value`);
  if (!conservado.startsWith('elfa exploradora')) throw new Error(`volver atrás perdió la descripción: «${conservado}»`);
  // (Antes aquí se exigía que volviera a proponer el dibujo. Era el fallo que
  // vio la revisión: el jugador había elegido «Sin imagen» y al volver se le
  // cambiaba. La garantía es ahora la contraria: se recuerda lo que eligió.)
  if (await evaluate(`document.querySelector('#aspecto')?.dataset.modo`) !== 'ninguno') throw new Error('al volver al paso «aspecto» no se recuerda que el jugador eligió «Sin imagen»');
  await evaluate(`document.querySelector('#aspecto-modo-ninguno').click(); document.querySelector('#creacion-siguiente').click(); true`);
  await until('document.querySelector("#creacion-empezar") && document.querySelector("#creacion-cara .arte")');

  const pjsDespues = await evaluate(contarPjs);
  if (pjsDespues !== pjsAntes) throw new Error(`cambiar de linaje creó un personaje gemelo: ${pjsAntes} → ${pjsDespues}`);

  // Corregir con palabras en la revelación: cambia el sexo, conserva el
  // nombre y el retrato pide un hombre.
  const leerPj = `JSON.parse(localStorage.getItem('arcanveil:personajes'))[0]`;
  const pjAntes = await evaluate(leerPj);
  const escribirCambio = (texto) => evaluate(`(() => {
    const i = document.querySelector('#revelacion-cambio');
    i.value = ${JSON.stringify(texto)};
    document.querySelector('#revelacion-form').requestSubmit();
  })()`);

  await escribirCambio('mejor que sea hombre');
  await until('document.querySelector("#revelacion-resumen")?.textContent.includes("Ahora es un hombre")');
  const pjHombre = await evaluate(leerPj);
  if (pjHombre.genero !== 'm') throw new Error(`«mejor que sea hombre» dejó el sexo en ${pjHombre.genero}`);
  if (pjHombre.nombre !== pjAntes.nombre) throw new Error(`«mejor que sea hombre» cambió el nombre: ${pjAntes.nombre} → ${pjHombre.nombre}`);
  if (pjHombre.id !== pjAntes.id) throw new Error('la corrección creó otro personaje');
  const encargo = encargoRetrato({ raza: pjHombre.raza, descripcion: pjHombre.retrato, genero: pjHombre.genero });
  // «a man» o, con especie, «an elf man»: sexo y especie van juntos.
  if (!/\ban? (?:\w+ )?man\b/.test(encargo) || /\bwoman\b/.test(encargo)) throw new Error(`tras «mejor que sea hombre» el retrato pide: ${encargo}`);

  // La forja visual dura 720 ms; la captura valida el estado final nítido.
  await new Promise(resolve => setTimeout(resolve, 850));
  await shot(`02-creacion-${viewport.label}.png`);

  // Y se empieza escribiendo, sin buscar el botón.
  await escribirCambio('vale, empezamos');
  await until('document.body.dataset.activeScreen === "juego" && !document.querySelector("#entrada").disabled && ARCANVEIL.sistema("turns").inspeccionar().ocupado === false && ARCANVEIL.ver("narrative.entradas",[]).length > 0 && ARCANVEIL.ver("player.lore","").includes("hermana")', 15000);
  const intensidad = await evaluate(`ARCANVEIL.ver('settings.dificultad')`);
  if (intensidad !== 'relato') throw new Error(`la partida empezó en ${intensidad}, no en Pacífica`);
  await evaluate(`window.__encuentros = 0; ARCANVEIL.bus.on('exploration:encounter', () => { window.__encuentros += 1; })`);
  await evaluate(`window.__escenas = []; ARCANVEIL.bus.on('scene:changed', (e) => { window.__escenas.push(e.motivo); })`);
  // El pasado del personaje es canon, no guion. Se conserva en la ficha,
  // pero la partida NO empieza con una misión sacada de él, la apertura no
  // lo vuelca y no se abre como hilos de memoria. Antes esta prueba exigía lo
  // contrario —«hermana» en la apertura y una principal aceptada en el turno
  // 1—, que es justo lo que el autor rechazó.
  const apertura = await evaluate(`(() => {
    const a = ARCANVEIL.ver('quests.activas', { porId: {}, orden: [] });
    return {
      lore: ARCANVEIL.ver('player.lore', ''),
      misiones: a.orden.map((id) => a.porId[id]).filter(Boolean).map((m) => m.tipo + ':' + m.estado),
      hilosDelPasado: ARCANVEIL.ver('ai.memoria.hilos', []).filter((h) => /^player_lore/.test(h.relacionadoCon ?? '')).length,
      texto: ARCANVEIL.ver('narrative.entradas', []).filter((e) => e.voz === 'dm').at(-1)?.texto ?? '',
    };
  })()`);
  if (!apertura.lore.includes('hermana')) throw new Error('la historia del personaje no se conservó en la ficha');
  if (apertura.misiones.length) throw new Error(`la partida empezó con misiones impuestas: ${apertura.misiones.join(', ')}`);
  if (apertura.hilosDelPasado) throw new Error(`el pasado se abrió como ${apertura.hilosDelPasado} hilos de memoria`);
  if (/hermana|medallón|Umbral/i.test(apertura.texto)) throw new Error(`la apertura vuelca el pasado del personaje: «${apertura.texto.slice(0, 160)}»`);
  if (!/\?$/.test(apertura.texto.trim().split('\n').at(-1))) throw new Error(`la apertura no pregunta: «${apertura.texto.split('\n').at(-1)}»`);

  const acciones = [
    'miro alrededor','escucho tras la puerta','exploro con cuidado','examino las huellas',
    'pregunto por rumores','busco un camino seguro','registro el lugar','observo el cielo',
    'recuerdo viejas historias','compruebo mi equipo','avanzo en silencio','busco agua',
    'inspecciono las piedras','dejo una marca en el camino','vigilo los tejados','sigo las luces',
    'investigo el ruido','anoto lo descubierto','descanso un momento','decido el siguiente paso',
  ];
  etapa('20 turnos');
  const turns = [];
  for (const a of acciones) {
    const result = await evaluate(`ARCANVEIL.jugar(${JSON.stringify(a)}).then(()=>({disabled:document.querySelector('#entrada').disabled, lines:ARCANVEIL.ver('narrative.entradas',[]).length, failures:document.querySelectorAll('#fallos .fallos__linea').length}))`);
    turns.push(result);
    if (result.disabled || result.failures) throw new Error(`turno fallido: ${a}`);
  }

  // Cada turno del máster termina devolviendo la palabra. Por TURNO, no por
  // entrada: si llega un aviso del mundo en el mismo turno, la pregunta pasa
  // a su propia entrada detrás del aviso (`_reducirAnadirEntrada`), y la
  // narración de antes queda sin ella. Comprobarlo por entrada fallaba solo
  // en las partidas con aviso («Decides el siguiente paso.», según semilla).
  // Una pregunta dentro de lo que dice alguien también devuelve la palabra
  // (`terminaEnPregunta`).
  const sinPregunta = await evaluate(`(() => {
    const ultimas = new Map();
    for (const e of ARCANVEIL.ver('narrative.entradas', [])) {
      if (e.voz === 'dm' && (e.texto ?? '').trim()) ultimas.set(e.turno ?? e.id, e.texto.trim().split('\\n').at(-1));
    }
    return [...ultimas.values()].filter(u => !/\\?[»"]?$/.test(u) && !/«[^»]*\\?[^»]*»/.test(u));
  })()`);
  if (sinPregunta.length) throw new Error(`turnos que no terminan en pregunta: ${sinPregunta.slice(0, 3).join(' | ')}`);

  // Ninguna frase de las que abrían desde el pasado del personaje: ni en la
  // apertura ni en los turnos siguientes.
  const aperturas = await evaluate(`ARCANVEIL.ver('narrative.entradas', [])
    .map(e => e.texto ?? '')
    .filter(t => /Tu pasado no te ha dejado llegar|Hay una razón personal detrás|Lo que dejaste atrás sigue viajando/.test(t))
    .length`);
  if (aperturas !== 0) throw new Error(`el narrador abrió desde el pasado del personaje ${aperturas} veces`);

  // Pacífica: en los treinta primeros turnos, como mucho un encuentro.
  for (let i = 0; i < 10; i += 1) {
    await evaluate(`ARCANVEIL.jugar('exploro los alrededores con calma')`);
  }
  const encuentros = await evaluate('window.__encuentros');
  const turnosJugados = await evaluate(`ARCANVEIL.ver('meta.turno', 0)`);
  if (turnosJugados < 30) throw new Error(`solo se jugaron ${turnosJugados} turnos`);
  if (encuentros > 1) throw new Error(`en Pacífica hubo ${encuentros} encuentros en ${turnosJugados} turnos`);

  // Guardar un arma no se tira ni suena, y se narra con lo que se lleva.
  const gesto = await evaluate(`(async () => {
    const antes = ARCANVEIL.ver('narrative.entradas', []).length;
    await ARCANVEIL.jugar('guardo la espada');
    const nuevas = ARCANVEIL.ver('narrative.entradas', []).slice(antes);
    return {
      tiradas: nuevas.filter(e => e.voz === 'roll').length,
      texto: nuevas.map(e => e.texto ?? '').join(' '),
      voces: nuevas.map(e => e.voz),
    };
  })()`);
  if (gesto.tiradas) throw new Error('guardar la espada tiró dados');
  if (!/guardas|no llevas/i.test(gesto.texto)) throw new Error(`guardar la espada narró otra cosa: «${gesto.texto}»`);
  if (/[A-Z]{4,}\.?$/.test(gesto.texto.trim())) throw new Error(`guardar la espada acabó en sonido: «${gesto.texto}»`);
  if (turns.at(-1).lines < 20) throw new Error(`la bitácora no avanzó: ${turns.at(-1).lines}`);

  // Esperar pasa de verdad en la app: lo narrado coincide con el reloj
  // guardado y con la cabecera. Si la escena pide decisión, se aclara sin
  // mover el reloj; si algo la corta, dice cuánto pasó de verdad.
  const espera = await evaluate(`(async () => {
    const t0 = ARCANVEIL.ver('world.tiempo');
    const antes = ARCANVEIL.ver('narrative.entradas', []).length;
    await ARCANVEIL.jugar('espero 30 minutos');
    const t1 = ARCANVEIL.ver('world.tiempo');
    const nuevas = ARCANVEIL.ver('narrative.entradas', []).slice(antes);
    await new Promise((r) => setTimeout(r, 400));
    return {
      min: ((t1.dia - t0.dia) * 24 + t1.hora - t0.hora) * 60 + t1.minuto - t0.minuto,
      dm: nuevas.filter((e) => e.voz === 'dm').map((e) => e.texto).join(' '),
      sistema: nuevas.filter((e) => e.voz === 'system').map((e) => e.texto).join(' '),
      dia: t1.dia, hora: t1.hora, minuto: t1.minuto,
      cabecera: [...document.querySelectorAll('.escena__dato')].map((x) => x.textContent).join('|'),
    };
  })()`);
  if (espera.min === 0) {
    if (!/No ha pasado el tiempo/.test(espera.sistema)) throw new Error(`«espero 30 minutos» no movió el reloj y no lo aclaró: «${espera.dm || espera.sistema}»`);
  } else {
    const reloj = `Día ${espera.dia}, ${String(espera.hora).padStart(2, '0')}:${String(espera.minuto).padStart(2, '0')}`;
    if (espera.min > 30) throw new Error(`«espero 30 minutos» pasó ${espera.min} minutos`);
    if (!espera.dm.startsWith(`Esperas ${decirDuracion(espera.min)}`) || !espera.dm.includes(reloj)) throw new Error(`la espera no narra lo que pasó (${espera.min} min, ${reloj}): «${espera.dm}»`);
    if (!espera.cabecera.includes(`día ${espera.dia}`)) throw new Error(`la cabecera no muestra el día guardado: ${espera.cabecera}`);
  }

  await shot(`03-partida-20-turnos-${viewport.label}.png`);

  // Texto hostil por todas las puertas que acaban en pantalla: el nombre y el
  // oficio de un PNJ (y su retrato), lo que escribe el jugador, una línea
  // narrada, un aviso y un objeto. Nada de eso puede ejecutarse ni volverse
  // etiqueta: todo va como texto (ver auditar-xss.mjs para el código).
  const CEBO = '<img src=x onerror="window.__xss=(window.__xss||0)+1"><svg onload="window.__xss=(window.__xss||0)+1"></svg>';
  await evaluate(`(async () => {
    window.__xss = 0;
    const cebo = ${JSON.stringify(CEBO)};
    ARCANVEIL.sistema('npcs').introducir({ nombre: 'Cebo' + cebo, rol: 'mercader' + cebo, actitud: 'amable' });
    ARCANVEIL.bus.emit('narrative:direct', { texto: 'Narrado ' + cebo, voz: 'dm' });
    ARCANVEIL.bus.emit('narrative:direct', { texto: cebo, voz: 'system' });
    ARCANVEIL.bus.emit('ui:notice', { mensaje: 'Aviso ' + cebo, tipo: 'info' });
    ARCANVEIL.store.dispatch('inventory/anadir', { silencioso: true, objeto: {
      id: 'itm_cebo', refId: 'pocion_curacion', nombre: 'Cebo' + cebo, categoria: 'consumible', subtipo: 'pocion',
      rareza: 'comun', cantidad: 1, peso: 0.5, valor: 1, afijos: [], equipado: false, ranura: null, origen: { tipo: 'desconocido' } } });
    await ARCANVEIL.jugar('le digo al mercader: ' + cebo);
  })()`);
  await wait(900);
  const xss = await evaluate(`({ ejecutado: window.__xss, etiquetas: document.querySelectorAll('img[src="x"], svg[onload], [onerror]').length, visible: document.body.textContent.includes('onerror') })`);
  if (xss.ejecutado || xss.etiquetas) throw new Error(`texto hostil convertido en HTML: ${JSON.stringify(xss)}`);
  if (!xss.visible) throw new Error('el texto hostil no aparece como texto en ninguna parte: la prueba no ha llegado a pintarlo');
  // Control: el mismo cebo metido como HTML sí se dispara. Si no, la prueba
  // de arriba no demostraba nada.
  await evaluate(`(() => { const d = document.createElement('div'); d.id = 'control-xss'; d.hidden = true; d.innerHTML = ${JSON.stringify(CEBO)}; document.body.append(d); })()`);
  await wait(400);
  const control = await evaluate(`(() => { const n = window.__xss; document.getElementById('control-xss')?.remove(); window.__xss = 0; return n; })()`);
  if (!control) throw new Error('el cebo no se dispara ni metido como HTML: la prueba de XSS no mide nada');
  await evaluate(`(() => { const n = ARCANVEIL.sistema('npcs'); const id = ARCANVEIL.ver('npcs.presentes', []).find((i) => /Cebo/.test(ARCANVEIL.ver('npcs.conocidos.porId.' + i + '.nombre') ?? '')); if (id) n.retirar?.(id); ARCANVEIL.store.dispatch('inventory/retirar', { idObjeto: 'itm_cebo' }); })()`);

  // ─── El estudio de retratos ─────────────────────────────────────────
  // Pintar solo cuando se pide; la candidata, privada; «Otra versión» pide
  // otra; «Usar esta versión» la guarda y se ve en la ficha. Con el
  // generador de verdad (el puente) y un proveedor falso: ni ComfyUI ni red.
  // #12: desde la partida se abre «la imagen del personaje» (dibujo del
  // juego, retrato pintado o nada). El generador se mira SOLO al pedirlo
  // («Comprobar»), y al estudio se llega si lo hay.
  /** Imagen → comprobar el generador → (si lo hay) abrir el estudio. Devuelve el estado comprobado. */
  const alEstudio = async () => {
    await evaluate(`document.querySelector('#pj-pintar').click()`);
    await until('document.querySelector("#imagen-dialogo[open]") && document.querySelector("#aspecto-comprobar")');
    if (await evaluate(`document.querySelector('#aspecto-generador').dataset.estado`) !== 'desconocido') throw new Error('abrir la imagen del personaje ya había mirado el generador sin que se le pidiera');
    await evaluate(`document.querySelector('#aspecto-comprobar').click(); true`);
    await until('!["desconocido", "buscando"].includes(document.querySelector("#aspecto-generador")?.dataset.estado)', 9000);
    const estado = await evaluate(`document.querySelector('#aspecto-generador').dataset.estado`);
    if (!/^disponible/.test(estado)) return estado;
    await evaluate(`document.querySelector('#aspecto-modo-pintado').click(); true`);
    await until('document.querySelector("#aspecto-pintar")');
    await evaluate(`document.querySelector('#aspecto-pintar').click(); true`);
    await until('document.querySelector("#estudio[open]")');
    return estado;
  };
  const cerrarImagen = async () => {
    await evaluate(`document.querySelector('#estudio-cerrar')?.click(); true`);
    await until('!document.querySelector("#estudio")', 5000);
    await evaluate(`document.querySelector('#imagen-cerrar')?.click(); true`);
    await until('!document.querySelector("#imagen-dialogo")', 5000);
  };
  const estadoGenerador = await alEstudio();
  if (sinIA) {
    // Sin generador: se dice sin tecnicismos ni inventos (ni nube, ni envíos),
    // pintar no se ofrece, y el dibujo del juego sí.
    const sinGenerador = await evaluate(`({ estado: document.querySelector('#aspecto-generador').dataset.estado, pintado: document.querySelector('#aspecto-modo-pintado').getAttribute('aria-disabled'), texto: document.querySelector('#aspecto-modo-pintado').textContent, pintar: Boolean(document.querySelector('#aspecto-pintar')), dibujo: Boolean(document.querySelector('#aspecto-modo-dibujo')) && Boolean(document.querySelector('#imagen-vista svg')), todo: document.querySelector('#imagen-dialogo').textContent })`);
    if (estadoGenerador !== 'no-disponible' || sinGenerador.pintado !== 'true' || sinGenerador.pintar || !sinGenerador.dibujo || !/no hay ningún generador|no deja leer/.test(sinGenerador.texto) || /nube|sale de tu equipo|caché/i.test(sinGenerador.todo)) throw new Error(`sin generador, la imagen no lo dice bien o deja pintar: ${JSON.stringify({ estadoGenerador, ...sinGenerador, todo: undefined })}`);
    await shot(`05-imagen-sin-generador-${viewport.label}.png`);
    await cerrarImagen();
    estudio = 'sin generador: lo dice, no pinta y ofrece el dibujo del juego';
  } else if (puenteImagen) {
    await until('/Listo para pintar/.test(document.querySelector(".estudio__estado")?.textContent ?? "")', 8000);
    // Lo que dice antes de pintar es lo que pasa: con el generador local la
    // descripción no sale del PC, y las versiones quedan en una caché del
    // puente hasta cerrar. Antes decía «no se guarda ni se envía».
    const nota = await evaluate(`document.querySelector('#estudio-nota').textContent`);
    if (!/no sale del equipo/.test(nota) || !/caché temporal/.test(nota) || /no se guarda ni se envía/.test(nota)) throw new Error(`la nota del estudio no dice lo que pasa: «${nota}»`);
    await evaluate(`document.querySelector('#estudio-pintar').click()`);
    await until('document.querySelector("#estudio .estudio__candidata")?.complete', 10000);
    const primera = await evaluate(`(async () => ({ enFicha: Boolean(document.querySelector('#retrato-pj img.arte--aprobada')), galeria: await ${GALERIA} }))()`);
    if (primera.enFicha || primera.galeria.length) throw new Error(`la candidata salió antes de elegirla: ${JSON.stringify(primera)}`);
    if (enCache('pj_').length !== 1) throw new Error(`tras pintar, el puente tendría que tener una candidata en su caché: ${enCache().join(' ')}`);
    await evaluate(`document.querySelector('#estudio-otra').click()`);
    await until('/Versión 2/.test(document.querySelector(".estudio__estado")?.textContent ?? "")', 10000);
    if (enCache('pj_').length !== 2 || (await evaluate(GALERIA)).length) throw new Error('«Otra versión»: dos candidatas en caché y nada en la galería');
    await shot(`05-estudio-${viewport.label}.png`);
    await evaluate(`document.querySelector('#estudio-usar').click()`);
    await until('!document.querySelector("#estudio") && document.querySelector("#retrato-pj img.arte--aprobada")?.complete', 8000);
    await cerrarImagen();
    if (generadas.length !== 2 || generadas[0] === generadas[1]) throw new Error(`el estudio no pidió dos versiones distintas: ${JSON.stringify(generadas)}`);
    if (!(await esperarCache(() => enCache().length === 0))) throw new Error(`al cerrar el estudio, las candidatas siguen en la caché del puente: ${enCache().join(' ')}`);
    const elegida = await evaluate(GALERIA);
    if (elegida.length !== 1 || !/^pj:/.test(elegida[0].clave)) throw new Error(`la versión elegida no está sola en la galería: ${JSON.stringify(elegida)}`);
    const srcElegida = await evaluate(`document.querySelector('#retrato-pj img.arte--aprobada').src`);

    // Otra vez al estudio: pintar y cerrar sin elegir no toca lo elegido.
    await alEstudio();
    await until('/imagen que tiene ahora/.test(document.querySelector(".estudio__estado")?.textContent ?? "")', 8000);
    await evaluate(`document.querySelector('#estudio-pintar').click()`);
    await until('document.querySelector("#estudio .estudio__candidata")?.complete', 10000);
    await cerrarImagen();
    if (!(await esperarCache(() => enCache().length === 0))) throw new Error('cerrar sin elegir dejó la candidata en la caché del puente');
    const despues = await evaluate(GALERIA);
    const srcDespues = await evaluate(`document.querySelector('#retrato-pj img.arte--aprobada')?.src`);
    if (JSON.stringify(despues) !== JSON.stringify(elegida) || srcDespues !== srcElegida) throw new Error('una versión rechazada cambió el retrato elegido');

    // Con un proveedor en la nube, el estudio dice que el encargo sale del PC
    // y no pinta sin permiso. (Un doble con el nombre del proveedor: nada real.)
    await puenteImagen.cerrar();
    const nube = crearProxyImagen({ origen: `http://127.0.0.1:${PORT}`, cache: cacheImagen, proveedor: { id: 'cloudflare', salud: async () => ({ disponible: true }), generar: async ({ semilla }) => { generadas.push(semilla); return { bytes: PNG_1X1, tipo: 'image/png' }; } } });
    puenteImagen = await nube.escuchar().then(() => nube, () => null);
    if (!puenteImagen) throw new Error('no se pudo levantar el doble de nube en 11437');
    const antesNube = generadas.length;
    if (await alEstudio() !== 'disponible-nube') throw new Error('con un proveedor en la nube, el estado comprobado no es «disponible-nube»');
    await until('/sale de tu equipo/.test(document.querySelector("#estudio-nota")?.textContent ?? "") && !document.querySelector("#estudio-permiso").closest("label").hidden', 8000);
    const sinPermiso = await evaluate(`document.querySelector('#estudio-pintar').disabled`);
    await evaluate(`document.querySelector('#estudio-permiso').click()`);
    const conPermiso = await evaluate(`document.querySelector('#estudio-pintar').disabled`);
    const textoPermiso = await evaluate(`document.querySelector('#estudio-permiso-texto').textContent`);
    await shot(`05b-estudio-nube-${viewport.label}.png`);
    await cerrarImagen();
    if (!sinPermiso || conPermiso || !/cloudflare/.test(textoPermiso) || generadas.length !== antesNube) throw new Error(`con la nube, pintar sin permiso: ${JSON.stringify({ sinPermiso, conPermiso, textoPermiso })}`);
    estudio = 'pintar, otra versión y usar: en la ficha; cerrar olvida; nube con permiso';
  } else {
    await cerrarImagen();
    estudio = 'omitido: el puerto 11437 lo usa otro programa';
  }

  // El grupo: reclutar a alguien de la escena, viajar con él, pelear juntos
  // y verlo en el parte.
  await evaluate(`(() => {
    const npcs = ARCANVEIL.sistema('npcs');
    if (!ARCANVEIL.ver('npcs.presentes', []).length) npcs.introducir({ nombre: 'Grom', rol: 'herrero', actitud: 'amable' });
    const id = ARCANVEIL.ver('npcs.presentes', [])[0];
    npcs.actualizar(id, { actitud: 100 });
  })()`);
  // La tirada de reclutar ya la fija la auditoría de coherencia; aquí se
  // prueba el recorrido (reclutar, viajar, pelear). Con seis intentos y el
  // dado de verdad fallaba una de cada quince veces: los personajes de
  // partida van cargados (−3) y la suerte decidía. Se fuerza el éxito solo
  // durante este paso y se devuelve el motor como estaba.
  const reclutado = await evaluate(`(async () => {
    const reglas = ARCANVEIL.sistema('rules');
    const resolver = reglas.resolver;
    reglas.resolver = (t) => ({ ...resolver.call(reglas, t), exito: true });
    try {
      const id = ARCANVEIL.ver('npcs.presentes', [])[0];
      const nombre = ARCANVEIL.ver('npcs.conocidos.porId.' + id + '.nombre');
      await ARCANVEIL.jugar(nombre + ', ¿vienes conmigo?');
      return { nombre, miembros: (ARCANVEIL.ver('party.miembros', []) ?? []).map((m) => m.refId), presentes: ARCANVEIL.ver('npcs.presentes', []) };
    } finally {
      reglas.resolver = resolver;
    }
  })()`);
  if (!reclutado.miembros.length) throw new Error(`nadie se unió al grupo: ${JSON.stringify(reclutado)}`);
  // #12: el grupo tiene su pestaña (antes, además, un bloque bajo la ficha).
  await evaluate(`document.querySelector('#pestana-grupo')?.click(); true`);
  const panelGrupo = await evaluate(`document.querySelector('.grupo__miembro')?.textContent ?? ''`);
  await evaluate(`document.querySelector('#lateral-volver')?.click(); true`);
  if (!panelGrupo.includes(reclutado.nombre)) throw new Error('el compañero no sale en el lateral');

  const viaje = await evaluate(`(async () => {
    const destino = ARCANVEIL.sistema('world').lugarActual()?.plantilla?.conexiones?.[0]?.hasta;
    const desde = ARCANVEIL.ver('world.ubicacion');
    const antes = ARCANVEIL.ver('narrative.entradas', []).length;
    const escenasAntes = window.__escenas.length;
    await ARCANVEIL.sistema('travel').viajar(destino, { forzar: true });
    return { texto: ARCANVEIL.ver('narrative.entradas', []).slice(antes).map((e) => e.texto ?? '').join(' '), desde, destino, ubicacion: ARCANVEIL.ver('world.ubicacion'), escenas: window.__escenas.slice(escenasAntes), encuentro: Boolean(ARCANVEIL.sistema('exploration')?.encuentroActivo) || ARCANVEIL.ver('combat.activo', false) };
  })()`);
  const viajeGrupo = viaje.texto;
  if (!viajeGrupo.includes(`con ${reclutado.nombre}`)) throw new Error(`el viaje no lleva al compañero: «${viajeGrupo.slice(0, 160)}»`);
  // #7: llegar o ser interrumpido por un encuentro son los dos desenlaces
  // legítimos de un viaje por un camino con peligro (la semilla decide). No
  // se oculta el encuentro para forzar la llegada; se exige que el estado
  // cuadre con el desenlace. Antes la prueba daba por hecha la llegada y
  // fallaba en la base y en el HEAD con la misma semilla (505).
  const llego = viaje.ubicacion === viaje.destino;
  if (llego && !viaje.escenas.includes('llegada')) throw new Error(`llegó a ${viaje.destino} sin escena de llegada: ${JSON.stringify(viaje)}`);
  if (!llego && !(viaje.escenas.includes('encuentro') || viaje.encuentro)) throw new Error(`el viaje no llegó y ningún encuentro lo explica: ${JSON.stringify(viaje)}`);
  console.log(`  viaje con el compañero ${viaje.desde} → ${viaje.destino}: ${llego ? 'llegada' : `interrumpido por un encuentro (sigue en ${viaje.ubicacion})`}`);

  await until('!ARCANVEIL.ver("combat.activo", false)', 8000);
  await evaluate(`window.__ataquesGrupo = []; ARCANVEIL.bus.on('combat:attack', (e) => window.__ataquesGrupo.push(e))`);
  await evaluate(`ARCANVEIL.bus.emit('combat:request', { enemies: [{ refId: 'saqueador', count: 2 }], playerAmbush: true })`);
  await until('ARCANVEIL.ver("combat.activo", false) && ARCANVEIL.sistema("combat").esperandoJugador', 8000);

  // Al compañero no se le apunta: ni el panel lo ofrece ni el motor acepta
  // un ataque contra él. El botón llegó a decir «Atacar a Cornis».
  const apuntado = await evaluate(`({
    elegibles: [...document.querySelectorAll('.luchador--elegible')].map((b) => b.dataset.luchador),
    marcado: document.querySelector('.luchador.es-objetivo')?.dataset.luchador ?? null,
    cara: Boolean(document.querySelector('[data-luchador^="companero_"] .luchador__cara .arte')),
  })`);
  if (apuntado.elegibles.some((id) => id.startsWith('companero_')) || apuntado.marcado?.startsWith('companero_')) {
    throw new Error(`el panel deja apuntar al compañero: ${JSON.stringify(apuntado)}`);
  }
  if (!apuntado.cara) throw new Error('el compañero sale sin cara en el combate');
  const golpeAlAliado = await evaluate(`(async () => {
    const id = Object.keys(ARCANVEIL.sistema('combat')._combatientes).find((k) => k.startsWith('companero_'));
    const antes = window.__ataquesGrupo.length;
    await ARCANVEIL.sistema('combat').accionJugador({ tipo: 'atacar', objetivo: id });
    return window.__ataquesGrupo.slice(antes).filter((e) => e.atacante?.esJugador).map((e) => e.objetivo?.id ?? e.objetivo);
  })()`);
  if (golpeAlAliado.some((id) => String(id).startsWith('companero_'))) {
    throw new Error(`el motor dejó al jugador atacar a su compañero: ${golpeAlAliado}`);
  }

  // Combate por menús (decisión del 7-oct-2026): Atacar → ataque → enemigo
  // → confirmar, y en cada turno se vuelve a elegir. Las etapas se
  // fotografían en el primer turno; el doble clic en «Confirmar» no puede
  // golpear dos veces.
  const etapaMenu = () => evaluate(`({
    etapa: document.querySelector('.combate__menu')?.dataset.etapa ?? null,
    elegibles: [...document.querySelectorAll('.luchador--elegible')].map((b) => b.dataset.luchador),
    marcado: document.querySelector('.luchador.es-objetivo')?.dataset.luchador ?? null,
    estado: document.querySelector('.combate__etapa')?.textContent ?? '',
    botones: [...document.querySelectorAll('.combate__menu button')].map((b) => b.textContent.trim() + (b.disabled ? ' [no]' : '')),
  })`);
  async function pelearPorMenu({ fotos = null, maximo = 25 } = {}) {
    let primera = Boolean(fotos);
    for (let i = 0; i < maximo; i += 1) {
      await until('!ARCANVEIL.ver("combat.activo", false) || (ARCANVEIL.sistema("combat").esperandoJugador && document.querySelector(".combate__menu[data-etapa=principal]"))', 10000);
      if (!await evaluate('ARCANVEIL.ver("combat.activo", false)')) return;
      const e0 = await etapaMenu();
      if (e0.elegibles.length || e0.marcado) throw new Error(`turno nuevo con un enemigo elegible o elegido antes de pulsar Atacar: ${JSON.stringify(e0)}`);
      if (primera) await shot(`07a-menu-principal-${fotos}.png`);
      await evaluate(`document.querySelector('.combate__menu .btn--peligro').click()`);
      const e1 = await etapaMenu();
      if (e1.etapa !== 'ataque') throw new Error(`Atacar no lleva a elegir ataque: ${JSON.stringify(e1)}`);
      if (primera) await shot(`07b-menu-ataque-${fotos}.png`);
      await evaluate(`document.querySelector('.combate__menu .combate__opcion:not([disabled])').click()`);
      const e2 = await etapaMenu();
      if (e2.etapa !== 'objetivo' || !e2.elegibles.length || e2.elegibles.some((id) => id.startsWith('companero_'))) throw new Error(`elegir ataque no lleva a elegir enemigo (o deja elegir al compañero): ${JSON.stringify(e2)}`);
      if (primera) await shot(`07c-menu-objetivo-${fotos}.png`);
      await evaluate(`document.querySelector('.luchador--elegible').click()`);
      const e3 = await etapaMenu();
      if (e3.etapa !== 'confirmar' || !e3.marcado) throw new Error(`elegir enemigo no lleva a confirmar: ${JSON.stringify(e3)}`);
      if (primera) await shot(`07d-menu-confirmar-${fotos}.png`);
      const antes = await evaluate('window.__ataquesGrupo.filter((e) => e.atacante?.esJugador).length');
      await evaluate(`(() => { const b = document.querySelector('.combate__confirmar'); b.click(); b.click(); b.click(); })()`);
      await until('!ARCANVEIL.ver("combat.activo", false) || !ARCANVEIL.sistema("combat").esperandoJugador || window.__ataquesGrupo.filter((e) => e.atacante?.esJugador).length > ' + antes, 8000);
      await wait(150);
      const golpes = (await evaluate('window.__ataquesGrupo.filter((e) => e.atacante?.esJugador).map((e) => e.objetivo?.id ?? e.objetivo)')).slice(antes);
      if (golpes.length !== 1 || golpes[0] !== e3.marcado) throw new Error(`confirmar (pulsado tres veces) dio ${golpes.length} golpes, contra ${golpes}; elegido ${e3.marcado}`);
      if (primera) await shot(`07e-menu-tras-golpe-${fotos}.png`);
      primera = false;
    }
  }
  etapa('pelea del grupo por menús');
  await pelearPorMenu({ fotos: viewport.label });
  const peleaGrupo = await evaluate(`(async () => {
    const { paraJugador } = await import('/src/combat/CombatLog.js');
    const suyos = window.__ataquesGrupo.filter((e) => e.atacante?.nombre === ${JSON.stringify(reclutado.nombre)});
    return { lineas: suyos.map(paraJugador), activo: ARCANVEIL.ver('combat.activo', false) };
  })()`);
  if (!peleaGrupo.lineas.length) throw new Error(`${reclutado.nombre} no actuó en el combate`);
  // Si el enemigo esquiva, el parte lo cuenta desde el enemigo («Saqueador A
  // esquiva el ataque de Bregard»): también es su acción, dicha con su
  // nombre. Exigir solo «ataca a» hacía fallar la prueba según el dado.
  const suyo = peleaGrupo.lineas[0];
  if (!(suyo.startsWith(`${reclutado.nombre} ataca a`) || suyo.includes(`el ataque de ${reclutado.nombre}`))) throw new Error(`el parte no cuenta al compañero: «${suyo}»`);
  if (peleaGrupo.activo) throw new Error('el combate del grupo no terminó');

  // La escena cambia al llegar y al pelear, y solo entonces se pide imagen.
  // Los treinta turnos anteriores no la cambiaron.
  const escenas = await evaluate('window.__escenas');
  // La llegada solo se exige si el viaje llegó (ver arriba); combate y fin
  // de combate, siempre.
  for (const motivo of [...(llego ? ['llegada'] : ['encuentro']), 'combate', 'fin_combate']) {
    if (!escenas.includes(motivo)) throw new Error(`no hubo cambio de escena por «${motivo}»: ${escenas.join(', ')}`);
  }

  // La cabecera se pliega a una franja, y se recuerda.
  const pliegue = await evaluate(`(async () => {
    const esc = document.getElementById('escena');
    const antes = esc.classList.contains('escena--plegada');
    document.getElementById('escena-plegar').click();
    await new Promise((r) => setTimeout(r, 50));
    const despues = document.getElementById('escena').classList.contains('escena--plegada');
    const guardado = JSON.parse(localStorage.getItem('arcanveil:prefs:juego') ?? '{}').escenaPlegada;
    document.getElementById('escena-plegar').click();
    return { antes, despues, guardado };
  })()`);
  if (pliegue.antes === pliegue.despues || pliegue.guardado !== pliegue.despues) throw new Error(`plegar la escena no funciona: ${JSON.stringify(pliegue)}`);

  // Ninguna ilustración pedida por su cuenta: la cabecera es el paisaje.
  const cabecera = await evaluate(`({
    miniaturas: ARCANVEIL.ver('narrative.entradas', []).filter((e) => e.voz === 'escena').length,
    paisaje: Boolean(document.querySelector('#escena-lienzo svg, #escena-lienzo .arte')),
  })`);
  if (cabecera.miniaturas) throw new Error('apareció una ilustración de escena sin pedirla');
  if (!cabecera.paisaje) throw new Error('la cabecera se quedó sin paisaje');

  // El retrato vale por cualquiera de sus dos vías.
  //
  // Esto buscaba `.retrato-rasgo--cicatriz`, que solo existe en el retrato
  // vectorial. Con el retrato de IA cargado ese nodo no está —la imagen
  // sustituye al SVG entero— y la prueba fallaba con «el rasgo visual no llegó
  // a la partida» teniendo el retrato delante. El juego no estaba roto: la
  // prueba se había quedado atrás.
  //
  // Lo que importa es que la cara del personaje esté puesta, por la vía que
  // sea. Se aceptan las dos y el informe dice cuál fue.
  const libre = await evaluate(`(() => ({
    texto: ARCANVEIL.ver('narrative.entradas', []).map(e => e.texto ?? '').join(' '),
    marcador: Boolean(document.querySelector('#retrato-pj .marcador-arte')),
    aprobado: Boolean(document.querySelector('#retrato-pj img.arte--aprobada')),
  }))()`);

  if (/intentas\s+anoto/i.test(libre.texto)) throw new Error('acción libre mal integrada');
  if (!libre.marcador && !libre.aprobado) throw new Error('en la partida no hay ni retrato elegido ni marcador');

  // Con muerte permanente, la pelea del grupo PUEDE matar (visto en
  // escritorio: «La oscuridad te alcanza», y el combate siguiente no podía
  // abrirse; la espera vencía). Si muere, se comprueba esa muerte natural y se
  // sigue con un run nuevo. Ni se cura al muerto ni se alarga la espera.
  if (await evaluate('Boolean(ARCANVEIL.ver("meta.muerte"))')) {
    etapa('muerte natural en la pelea del grupo: se comprueba y run nuevo');
    await until('!document.getElementById("caida-modal").hidden', 8000);
    const natural = await evaluate(`({ titulo: document.getElementById('caida-titulo').textContent, botones: [...document.querySelectorAll('#caida-acciones button')].map((b) => b.textContent.trim()), combate: ARCANVEIL.ver('combat.activo', false) })`);
    if (!/ha muerto/.test(natural.titulo) || !natural.botones.includes('Nueva partida') || natural.combate) throw new Error(`muerte natural sin su pantalla: ${JSON.stringify(natural)}`);
    await empezarRunNuevo();
  }
  etapa('texto libre en combate');
  // En combate, el texto libre no ataca: los ataques van por el menú (la
  // caja no puede golpear al primero de la lista). El rival enseña su ficha.
  await evaluate(`ARCANVEIL.store.dispatch('player/curar', { cantidad: 99, origen: 'regresion' })`);
  await evaluate(`ARCANVEIL.bus.emit('combat:request', { enemies: [{ refId: 'saqueador', count: 1 }], playerAmbush: true })`);
  await until('ARCANVEIL.ver("combat.activo", false) && ARCANVEIL.sistema("combat").esperandoJugador', 8000);
  const fichaRival = await evaluate(`document.querySelector('#combate-habilidades')?.textContent ?? ''`);
  if (!/Machete/.test(fichaRival)) throw new Error(`la ficha del enemigo no enseña sus armas: «${fichaRival}»`);
  const textoEnCombate = await evaluate(`(async () => {
    const antes = window.__ataquesGrupo.filter((e) => e.atacante?.esJugador).length;
    await ARCANVEIL.jugar('le golpeo');
    return { golpes: window.__ataquesGrupo.filter((e) => e.atacante?.esJugador).length - antes, ultima: ARCANVEIL.ver('narrative.entradas', []).slice(-1)[0]?.texto ?? '', esperando: ARCANVEIL.sistema('combat').esperandoJugador };
  })()`);
  if (textoEnCombate.golpes || !/menú/.test(textoEnCombate.ultima) || !textoEnCombate.esperando) throw new Error(`«le golpeo» en combate no fue al menú: ${JSON.stringify(textoEnCombate)}`);
  await pelearPorMenu();

  etapa('salida segura: Menú con doble clic (guardado comprobado, una sola navegación)');
  const antesSalir = await evaluate(`({ turno: ARCANVEIL.ver('meta.turno'), run: ARCANVEIL.ver('meta.runId'), ranura: ARCANVEIL.ver('meta.ranura'), vida: ARCANVEIL.ver('player.vida.actual') })`);
  // Precondición del TEST (no del producto): ningún guardado anterior en
  // cola cuando empieza el conteo. Se provoca uno a propósito (FIXTURE: el
  // candado global retenido) para comprobar que, sin barrera, se contaría
  // (la discrepancia 2 ≠ 1 de la revisión externa), y se vacía con la
  // barrera REAL `drenar`, que falla con error si no termina.
  const previo = await evaluate(`(async () => {
    window.__soltarPrevio = null;
    navigator.locks.request('arcanveil:ranuras', () => new Promise((r) => { window.__soltarPrevio = r; }));
    for (let i = 0; i < 100 && !window.__soltarPrevio; i++) await new Promise((r) => setTimeout(r, 20));
    window.__previo = ARCANVEIL.sistema('saves').guardar(ARCANVEIL.ver('meta.ranura'), { silencioso: true });
    window.__contados = 0; window.__quitarConteo = ARCANVEIL.bus.on('save:done', () => { window.__contados += 1; });
    const enCola = ARCANVEIL.sistema('saves').inspeccionar().guardadosPendientes;
    window.__soltarPrevio();
    const barrera = await ARCANVEIL.sistema('saves').drenar(15000).then(() => 'vacía', (e) => 'ERROR: ' + e.message);
    window.__quitarConteo?.();
    return { enCola, barrera, contadosSinBarrera: window.__contados, quedan: ARCANVEIL.sistema('saves').inspeccionar().guardadosPendientes, previo: (await window.__previo).exito };
  })()`);
  if (previo.enCola < 1 || previo.barrera !== 'vacía' || previo.quedan !== 0 || previo.contadosSinBarrera !== 1 || !previo.previo) throw new Error(`salida: la barrera antes del conteo no se cumplió: ${JSON.stringify(previo)}`);
  // El conteo de ESTA salida (por ranura y run), y la navegación por CDP.
  await evaluate(`sessionStorage.setItem('reg:guardados', '[]'); ARCANVEIL.bus.on('save:done', (d) => { const l = JSON.parse(sessionStorage.getItem('reg:guardados') ?? '[]'); l.push({ ranura: d.ranura, run: d.runId, rev: d.rev, repetido: d.repetido ?? false }); sessionStorage.setItem('reg:guardados', JSON.stringify(l)); }); true`);
  // FIXTURE: candado retenido para que la salida quede guardando; el doble
  // clic llega en ese momento (no debe pedir otra operación).
  await evaluate(`(async () => { window.__soltarSalida = null; navigator.locks.request('arcanveil:ranuras', () => new Promise((r) => { window.__soltarSalida = r; })); for (let i = 0; i < 100 && !window.__soltarSalida; i++) await new Promise((r) => setTimeout(r, 20)); const b = document.querySelector('#menu'); b.click(); await new Promise((r) => setTimeout(r, 120)); b.click(); return true; })()`);
  await until('!document.getElementById("salida-modal").hidden && /Guardando antes de salir/.test(document.getElementById("salida-titulo").textContent)', 5000);
  const guardando = await evaluate(`({ titulo: document.getElementById('salida-titulo').textContent, botones: document.querySelectorAll('#salida-acciones button').length, guardados: JSON.parse(sessionStorage.getItem('reg:guardados')).length, enCola: ARCANVEIL.sistema('saves').inspeccionar().guardadosPendientes, ocupado: document.querySelector('#menu').getAttribute('aria-busy') })`);
  if (guardando.guardados !== 0 || guardando.enCola !== 1 || guardando.ocupado !== 'true') throw new Error(`salida: con el guardado pendiente, el doble clic pidió otra cosa: ${JSON.stringify(guardando)}`);
  await fotoRapida(`10a-salida-guardando-${viewport.label}.png`);
  const navAntes = eventosPrincipal.length;
  await pulsarYNavegar(`({ click: () => window.__soltarSalida() })`,
    'window.ARCANVEIL?.motor?.listo && document.body.dataset.activeScreen === "inicio"');
  const navegaciones = eventosPrincipal.slice(navAntes).filter((e) => e.method === 'Page.frameNavigated' && !e.params.frame.parentId).length;
  const trasSalir = await evaluate(`(() => { const g = JSON.parse(localStorage.getItem('arcanveil:partida:' + ${JSON.stringify(antesSalir.ranura)}) ?? 'null'); return { guardados: JSON.parse(sessionStorage.getItem('reg:guardados') ?? '[]'), turno: g?.estado?.meta?.turno, run: g?.estado?.meta?.runId, vida: g?.estado?.player?.vida?.actual }; })()`);
  const propios = trasSalir.guardados.filter((x) => x.ranura === String(antesSalir.ranura) && x.run === antesSalir.run && !x.repetido);
  if (trasSalir.guardados.length !== 1 || propios.length !== 1 || navegaciones !== 1 || trasSalir.turno !== antesSalir.turno || trasSalir.run !== antesSalir.run || trasSalir.vida !== antesSalir.vida) {
    throw new Error(`Menú (doble clic): ${JSON.stringify({ antesSalir, trasSalir, navegaciones })}`);
  }
  console.log(`  salida: guardado previo en cola drenado antes de contar (sin barrera habría contado 1 de más); doble clic mientras guarda = 1 guardado (rev ${propios[0].rev}) y 1 navegación`);
  await shot(`10-menu-tras-salir-${viewport.label}.png`);
  await continuarPartida(antesSalir.run);

  etapa('salida segura: persistencia apagada (no se recarga; Escape = quedarse)');
  await evaluate(`window.__sigo = 1; ARCANVEIL.bus.emit('settings:change', { id: 'persistencia', valor: false }); document.querySelector('#menu').click(); true`);
  await wait(400);
  const apagada = await evaluate(`({ sigo: window.__sigo, visible: !document.getElementById('salida-modal').hidden, titulo: document.getElementById('salida-titulo').textContent, nota: document.getElementById('salida-nota').textContent, botones: [...document.querySelectorAll('#salida-acciones button')].map((b) => b.textContent.trim()), foco: document.activeElement?.textContent?.trim() })`);
  if (apagada.sigo !== 1 || !apagada.visible || apagada.titulo !== 'No se ha podido guardar' || !/desactivada/.test(apagada.nota) || !apagada.botones.includes('Salir sin guardar…')) throw new Error(`persistencia apagada: ${JSON.stringify(apagada)}`);
  await shot(`11-salida-error-${viewport.label}.png`);
  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); true`);
  await wait(200);
  const quedado = await evaluate(`({ sigo: window.__sigo, oculto: document.getElementById('salida-modal').hidden, pantalla: document.body.dataset.activeScreen, entrada: document.getElementById('entrada').disabled })`);
  if (quedado.sigo !== 1 || !quedado.oculto || quedado.pantalla !== 'juego' || quedado.entrada) throw new Error(`Escape no deja quedarse: ${JSON.stringify(quedado)}`);
  await evaluate(`ARCANVEIL.bus.emit('settings:change', { id: 'persistencia', valor: true }); true`);

  etapa('salida segura: almacenamiento lleno (reintentar, «Salir sin guardar» con confirmación, reintento con éxito)');
  await evaluate(`window.__setItem = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (String(k).startsWith('arcanveil:partida:')) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; } return window.__setItem.call(this, k, v); }; document.querySelector('#menu').click(); true`);
  await wait(300);
  const lleno = await evaluate(`({ sigo: window.__sigo, nota: document.getElementById('salida-nota').textContent })`);
  if (lleno.sigo !== 1 || !/espacio/.test(lleno.nota)) throw new Error(`almacenamiento lleno: ${JSON.stringify(lleno)}`);
  await evaluate(`[...document.querySelectorAll('#salida-acciones button')].find((b) => b.textContent.trim() === 'Salir sin guardar…').click(); true`);
  const confirma = await evaluate(`({ sigo: window.__sigo, titulo: document.getElementById('salida-titulo').textContent, nota: document.getElementById('salida-nota').textContent, botones: [...document.querySelectorAll('#salida-acciones button')].map((b) => b.textContent.trim()), foco: document.activeElement?.textContent?.trim() })`);
  if (confirma.sigo !== 1 || confirma.titulo !== 'Salir sin guardar' || !/Se perderá/.test(confirma.nota) || !confirma.botones.includes('Volver') || confirma.foco !== 'Volver') throw new Error(`salir sin guardar sin confirmación clara (o con el foco en lo destructivo): ${JSON.stringify(confirma)}`);
  await shot(`12-salir-sin-guardar-${viewport.label}.png`);
  await evaluate(`[...document.querySelectorAll('#salida-acciones button')].find((b) => b.textContent.trim() === 'Volver').click(); true`);
  await wait(200);
  if (await evaluate(`document.getElementById('salida-titulo').textContent`) !== 'No se ha podido guardar') throw new Error('«Volver» no vuelve al error');
  const antesReintento = await evaluate(`({ turno: ARCANVEIL.ver('meta.turno'), run: ARCANVEIL.ver('meta.runId'), ranura: ARCANVEIL.ver('meta.ranura') })`);
  await evaluate(`Storage.prototype.setItem = window.__setItem; true`);
  await pulsarYNavegar(`[...document.querySelectorAll('#salida-acciones button')].find((b) => b.textContent.trim() === 'Reintentar')`,
    'window.ARCANVEIL?.motor?.listo && document.body.dataset.activeScreen === "inicio"');
  const reintento = await evaluate(`(() => { const g = JSON.parse(localStorage.getItem('arcanveil:partida:' + ${JSON.stringify(antesReintento.ranura)}) ?? 'null'); return { turno: g?.estado?.meta?.turno, run: g?.estado?.meta?.runId }; })()`);
  if (reintento.turno !== antesReintento.turno || reintento.run !== antesReintento.run) throw new Error(`reintento: ${JSON.stringify({ antesReintento, reintento })}`);
  await continuarPartida(antesReintento.run);

  etapa('salida segura: con el enemigo actuando (esperar, cancelar, salir en la frontera)');
  // FIXTURE: vida llena para que el enemigo no lo mate en mitad de la prueba,
  // y un rival que no huye (el saqueador es cobarde: huía, la pelea acababa y
  // la salida, bien hecha, salía en ESA frontera; aquí se quiere la del turno).
  await evaluate(`ARCANVEIL.store.dispatch('player/curar', { cantidad: 99, origen: 'regresion' }); ARCANVEIL.bus.emit('combat:request', { enemies: [{ refId: 'guardia_corrupto', count: 1 }], playerAmbush: true }); true`);
  await until('ARCANVEIL.ver("combat.activo", false) && ARCANVEIL.sistema("combat").esperandoJugador', 8000);

  // Arma rota (FIXTURE: durabilidad 0 en la que se empuña): en la etapa de
  // ataque sale «está roto» y no se puede elegir. Se deja como estaba.
  {
    const rota = await evaluate(`(() => { const id = ARCANVEIL.sistema('combat').accionesDelJugador()?.ataques.find((x) => x.itemId)?.itemId; window.__rota = { id, antes: ARCANVEIL.ver('inventory.objetos.porId.' + id + '.durabilidad') }; ARCANVEIL.store.fijar('inventory.objetos.porId.' + id + '.durabilidad', 0); ARCANVEIL.bus.emit('combat:awaiting', {}); document.querySelector('.combate__menu .btn--peligro').click(); const b = [...document.querySelectorAll('.combate__menu .combate__opcion')].find((x) => /roto/.test(x.textContent)); return { id, boton: b ? b.textContent.trim() : null, deshabilitado: b?.disabled ?? null, etapa: document.querySelector('.combate__menu')?.dataset.etapa, opciones: [...document.querySelectorAll('.combate__menu button')].map((x) => x.textContent.trim() + (x.disabled ? '[no]' : '')), motor: ARCANVEIL.sistema('combat').accionesDelJugador()?.ataques.map((x) => [x.nombre, x.disponible, x.motivo]) }; })()`);
    if (!rota.id || !rota.boton || !rota.deshabilitado) throw new Error(`arma rota en el menú: ${JSON.stringify(rota)}`);
    await shot(`15-arma-rota-${viewport.label}.png`);
    await evaluate(`ARCANVEIL.store.fijar('inventory.objetos.porId.' + window.__rota.id + '.durabilidad', window.__rota.antes); [...document.querySelectorAll('.combate__menu button')].find((b) => b.textContent.trim() === 'Volver').click(); true`);
  }
  const enVuelo =`(() => { const c = ARCANVEIL.sistema('combat'); const m = c.accionesDelJugador(); c.ejecutar({ tipo: 'defender', token: m.token }); document.querySelector('#menu').click(); return { esperando: c.esperandoJugador, titulo: document.getElementById('salida-titulo').textContent, visible: !document.getElementById('salida-modal').hidden }; })()`;
  // FIXTURE de cadencia (no de reglas): la pausa del turno enemigo espera a
  // que la prueba la suelte. El turno enemigo dura ~750 ms y la captura de la
  // espera tardaba más: la salida (correctamente) ocurría en mitad de la foto.
  await evaluate(`(() => { const c = ARCANVEIL.sistema('combat'); window.__pausaReal = c._pausa; window.__soltar = null; c._pausa = (ms) => new Promise((ok) => { window.__soltar = ok; }); return true; })()`);
  const espera1 = await evaluate(`window.__sigo = 1; ${enVuelo}`);
  if (espera1.esperando || !espera1.visible || espera1.titulo !== 'Esperando para salir') throw new Error(`Menú con el enemigo actuando: ${JSON.stringify(espera1)}`);
  await until('typeof window.__soltar === "function"', 8000);
  await shot(`13-salida-esperando-${viewport.label}.png`);
  await evaluate(`[...document.querySelectorAll('#salida-acciones button')].find((b) => /Cancelar/.test(b.textContent)).click(); ARCANVEIL.sistema('combat')._pausa = window.__pausaReal; window.__soltar?.(); true`);
  await until('ARCANVEIL.sistema("combat").esperandoJugador || !ARCANVEIL.ver("combat.activo", false)', 8000);
  await wait(800);
  const cancelado = await evaluate(`({ sigo: window.__sigo, oculto: document.getElementById('salida-modal').hidden, pantalla: document.body.dataset.activeScreen })`);
  if (cancelado.sigo !== 1 || !cancelado.oculto || cancelado.pantalla !== 'juego') throw new Error(`cancelar la salida no deja la partida viva: ${JSON.stringify(cancelado)}`);
  // Sin un `if` que se salte la prueba en silencio: si la pelea acabó, se dice.
  if (!await evaluate('ARCANVEIL.ver("combat.activo", false)')) throw new Error(`la pelea de prueba terminó antes de probar la salida en la frontera: ${JSON.stringify(await evaluate(DIAGNOSTICO))}`);
  etapa('salida segura: salir en la frontera (turno del jugador) y cargar sin repetir nada');
  {
    // Ahora sí: se pide salir con el enemigo actuando y se sale en la frontera
    // (su turno), con lo que haya pasado guardado. Se apunta el estado en la
    // frontera para compararlo tras cargar (sin golpes repetidos).
    await evaluate(`ARCANVEIL.bus.on('combat:awaiting', () => { const c = ARCANVEIL.sistema('combat'); sessionStorage.setItem('reg:frontera', JSON.stringify({ vida: ARCANVEIL.ver('player.vida.actual'), enemigos: Object.values(c._combatientes).filter((x) => x.bando === 'enemigo').map((x) => [x.nombre, x.vida.actual]), ronda: ARCANVEIL.ver('combat.ronda') })); }); true`);
    const run = await evaluate('ARCANVEIL.ver("meta.runId")');
    await evaluate(`setTimeout(() => ${enVuelo}, 30); true`);
    const inicio = Date.now();
    while (Date.now() - inicio < 15000) { await wait(150); let sigue; try { sigue = await evaluate('window.__sigo === 1'); } catch { sigue = true; } if (!sigue) break; }
    await until('window.ARCANVEIL?.motor?.listo && document.body.dataset.activeScreen === "inicio"', 15000);
    const frontera = JSON.parse(await evaluate(`sessionStorage.getItem('reg:frontera') ?? 'null'`));
    await continuarPartida(run);
    await until('ARCANVEIL.ver("combat.activo", false) && ARCANVEIL.sistema("combat").esperandoJugador', 8000);
    const cargado = await evaluate(`(() => { const c = ARCANVEIL.sistema('combat'); return { vida: ARCANVEIL.ver('player.vida.actual'), enemigos: Object.values(c._combatientes).filter((x) => x.bando === 'enemigo').map((x) => [x.nombre, x.vida.actual]), ronda: ARCANVEIL.ver('combat.ronda') }; })()`);
    if (JSON.stringify(cargado) !== JSON.stringify(frontera)) throw new Error(`la salida en la frontera no guardó el estado exacto (o se repitió algo al cargar): ${JSON.stringify({ frontera, cargado })}`);
  }

  // FIXTURE: experiencia conocida antes de morir (por el canal normal), para
  // comprobar la cifra exacta de la herencia en pantalla y en el sucesor. La
  // muerte llega en el paso siguiente; después, la experiencia ya no entra.
  const xpAntesDeMorir = await evaluate(`(() => { const x = ARCANVEIL.ver('player.xp') ?? 0; if (x < 1000) ARCANVEIL.store.dispatch('player/xp', { cantidad: 1000 - x, motivo: 'fixture' }); return Math.max(x, 1000); })()`);
  await wait(200);
  if (await evaluate(`ARCANVEIL.ver('player.xp')`) !== xpAntesDeMorir) throw new Error('la experiencia de prueba no entró');
  const herenciaEsperada = Math.trunc((xpAntesDeMorir * 35) / 100);

  /**
   * Muerte con la salida pendiente, con el daño por el canal real y la
   * protección FIJADA (FIXTURE de ficha: `player._rasgoTrasfondo`), no
   * neutralizada en el juego. Golpes acotados: con protección, el primero lo
   * para el rasgo (vida 1, una vez) y el segundo mata; sin ella, mata el
   * primero. Se comprueba después de CADA golpe (vida, fase, eventos, que la
   * salida sigue esperando y que no se ha navegado) y la muerte se confirma
   * ANTES de soltar la frontera. La pausa (FIXTURE de cadencia) se restaura
   * en `finally` aunque falle.
   */
  async function muerteConSalidaPendiente({ proteccion, etiqueta }) {
    const PROTECCION = { nombre: 'Instinto de conservación', descripcion: 'FIXTURE de la regresión: el rasgo del trasfondo superviviente.', efecto: { tipo: 'evitarMuerte', usos: 1, recarga: 'descansoLargo' } };
    await evaluate(`(() => {
      window.__salvados = 0; window.__finRun = 0;
      if (!window.__oyentesMuerte) { window.__oyentesMuerte = true; ARCANVEIL.bus.on('player:saved', () => { window.__salvados += 1; }); ARCANVEIL.bus.on('run:ended', () => { window.__finRun += 1; }); }
      ARCANVEIL.store.fijar('player._rasgoTrasfondo', ${proteccion ? JSON.stringify(PROTECCION) : 'null'});
      ARCANVEIL.store.fijar('player.usosRasgos', { ...(ARCANVEIL.ver('player.usosRasgos') ?? {}), instinto_de_conservacion: 0 });
      const c = ARCANVEIL.sistema('combat'); window.__pausaReal = window.__pausaReal ?? c._pausa; window.__soltar = null;
      c._pausa = (ms) => new Promise((ok) => { window.__soltar = ok; });
      return true; })()`);
    const golpes = [];
    try {
      const espera = await evaluate(`window.__sigo = 1; ${enVuelo}`);
      if (espera.esperando || !espera.visible || espera.titulo !== 'Esperando para salir') throw new Error(`${etiqueta}: Menú con el enemigo actuando no espera: ${JSON.stringify(espera)}`);
      // Límite: protección (1) + golpe letal (1) + uno de margen que NO debe hacer falta.
      for (let i = 0; i < 3; i++) {
        await evaluate(`ARCANVEIL.store.dispatch('player/danar', { cantidad: 999, origen: 'regresion' }); true`);
        await wait(200);
        const e = await evaluate(`({ vida: ARCANVEIL.ver('player.vida.actual'), fase: ARCANVEIL.ver('meta.fase'), salvados: window.__salvados, fin: window.__finRun, esperando: !document.getElementById('salida-modal').hidden && document.getElementById('salida-titulo').textContent === 'Esperando para salir', sigo: window.__sigo })`);
        golpes.push(e);
        if (e.fase === 'fin') break;
        if (!proteccion || e.salvados !== 1 || e.vida !== 1 || !e.esperando || e.sigo !== 1 || e.fin) throw new Error(`${etiqueta}: tras el golpe ${i + 1} sigue vivo sin una protección que lo explique, o la salida dejó de esperar: ${JSON.stringify(golpes)}`);
      }
      const ultimo = golpes.at(-1);
      if (ultimo.fase !== 'fin' || ultimo.sigo !== 1 || ultimo.fin !== 1) throw new Error(`${etiqueta}: la muerte no se confirmó antes de soltar la frontera: ${JSON.stringify(golpes)}`);
      if (proteccion ? (golpes.length !== 2 || golpes[0].salvados !== 1) : golpes.length !== 1) throw new Error(`${etiqueta}: golpes inesperados: ${JSON.stringify(golpes)}`);
      // #8: la marca y la foto se registran después de la muerte (asíncrono,
      // en el registro coordinado): se espera a ESE registro y se lee de ahí.
      const reg = await evaluate(`(async () => { const g = await ARCANVEIL.sistema('muerte').registro; const run = ARCANVEIL.ver('meta.runId');
        const leer = (a) => new Promise((ok) => { const p = indexedDB.open('arcanveil-coordinacion'); p.onsuccess = () => { const db = p.result; const q = db.transaction(a).objectStore(a).get(run); q.onsuccess = () => { db.close(); ok(q.result ?? null); }; q.onerror = () => { db.close(); ok(null); }; }; p.onerror = () => ok(null); });
        return { run, registro: g?.estado ?? null, legado: (await leer('legados'))?.estado ?? null, marca: Boolean(await leer('muertos')) }; })()`);
      if (reg.registro !== 'registrada' || !reg.marca || reg.legado !== 'pendiente') throw new Error(`${etiqueta}: marca o herencia no persistidas antes de soltar: ${JSON.stringify(reg)}`);
    } finally {
      await evaluate(`(() => { const c = ARCANVEIL.sistema('combat'); if (window.__pausaReal) c._pausa = window.__pausaReal; window.__soltar?.(); return true; })()`).catch(() => {});
    }
    await until('!document.getElementById("caida-modal").hidden', 8000);
    await wait(500);
    // Los eventos de caída repetidos no crean otra muerte ni otra herencia.
    await evaluate(`ARCANVEIL.bus.emit('player:defeated', { origen: 'combate' }); ARCANVEIL.bus.emit('player:down', {}); true`);
    await wait(250);
    const fin = await evaluate(`(() => { const run = ARCANVEIL.ver('meta.runId'); const g = JSON.parse(localStorage.getItem('arcanveil:partida:' + ARCANVEIL.ver('meta.ranura')) ?? 'null'); return { sigo: window.__sigo, salida: document.getElementById('salida-modal').hidden, fase: ARCANVEIL.ver('meta.fase'), fin: window.__finRun, herencias: Object.keys(JSON.parse(localStorage.getItem('arcanveil:legados') ?? '{}')).filter((k) => k === run).length, finalGuardado: g?.estado?.meta?.muerte?.runId === run }; })()`);
    if (fin.sigo !== 1 || !fin.salida || fin.fase !== 'fin' || fin.fin !== 1 || fin.herencias !== 1) throw new Error(`${etiqueta}: tras morir con la salida pendiente: ${JSON.stringify(fin)}`);
    await until(`JSON.parse(localStorage.getItem('arcanveil:partida:' + ARCANVEIL.ver('meta.ranura')) ?? 'null')?.estado?.meta?.muerte?.runId === ARCANVEIL.ver('meta.runId')`, 8000);
    console.log(`  ${etiqueta}: ${golpes.length} golpe(s)${proteccion ? ' (el primero lo paró la protección: vida 1)' : ''}; muerte confirmada antes de soltar la frontera; sin navegar; una sola herencia; final guardado`);
  }

  etapa('muerte entre el clic y la frontera');
  if (!await evaluate('ARCANVEIL.ver("combat.activo", false)')) throw new Error(`no hay pelea para probar la muerte con la salida pendiente: ${JSON.stringify(await evaluate(DIAGNOSTICO))}`);
  // Caso B (con protección): el trasfondo «superviviente» trae «Instinto de
  // conservación» (evitarMuerte, una vez). El #6 mataba con UN golpe de 999 y,
  // si el dado de la ficha daba ese trasfondo, el personaje quedaba a 1, la
  // salida pendiente se completaba y la prueba fallaba (visto en la base).
  await muerteConSalidaPendiente({ proteccion: true, etiqueta: 'caso B (con protección)' });

  etapa('muerte');
  // ─── Caer detiene la partida de verdad ──────────────────────────────
  //
  // El fallo que esto sujeta: la caída pintaba «la crónica termina aquí» y la
  // crónica seguía. La fase volvía a `exploracion`, la caja quedaba activa y
  // cada «ataco» abría un combate nuevo con el personaje a cero de vida.
  //
  // Se golpea hasta tres veces: algunos linajes y oficios tienen un rasgo que
  // salva de la primera caída y deja al personaje a 1 de vida. Es un rasgo de
  // juego, no un fallo; lo que se comprueba es que, gastado el salvavidas,
  // caer sí termina la partida. Con un solo golpe la prueba dependía de lo
  // que hubiera salido en el dado de la ficha.
  for (let golpe = 0; golpe < 3; golpe += 1) {
    await evaluate(`ARCANVEIL.store.dispatch('player/danar', { cantidad: 999, origen: 'regresion' })`);
    await wait(300);
    if (await evaluate(`ARCANVEIL.store.select('meta.fase')`) === 'fin') break;
  }
  await wait(600);

  const caida = await evaluate(`({
    fase: ARCANVEIL.store.select('meta.fase'),
    modal: !document.getElementById('caida-modal').hidden,
    entrada: document.getElementById('entrada').disabled,
    salidas: [...document.querySelectorAll('#caida-acciones button')].length,
  })`);

  if (caida.fase !== 'fin') {
    const diag = await evaluate(`({
      vida: ARCANVEIL.store.select('player.vida'), estados: ARCANVEIL.store.select('player.estados'),
      usos: ARCANVEIL.store.select('player.usosRasgos'), combate: ARCANVEIL.store.select('combat.activo'),
      clase: ARCANVEIL.store.select('player.clase'), raza: ARCANVEIL.store.select('player.raza'),
      ultimas: ARCANVEIL.ver('narrative.entradas', []).slice(-5).map((e) => e.voz + ': ' + e.texto),
    })`);
    throw new Error(`al caer, la fase quedó en ${caida.fase}: ${JSON.stringify(diag)}`);
  }
  if (!caida.modal) throw new Error('al caer no se abrió la salida');
  if (!caida.entrada) throw new Error('al caer, la caja de texto siguió activa');
  if (caida.salidas < 2) throw new Error(`al caer solo había ${caida.salidas} salidas`);

  // Escape no la cierra: sin elegir salida, el jugador se quedaba sin nada
  // que pulsar y con la caja bloqueada.
  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  const trasEscape = await evaluate(`!document.getElementById('caida-modal').hidden`);
  if (!trasEscape) throw new Error('Escape cerró la pantalla de caída');

  // Y el turno tiene que estar cerrado: nada de abrir combates desde el suelo.
  const desdeElSuelo = await evaluate(`ARCANVEIL.jugar('ataco al primer bandido que vea').then(() => ({
    combate: ARCANVEIL.store.select('combat.activo'),
    fase: ARCANVEIL.store.select('meta.fase'),
  }))`);
  if (desdeElSuelo.combate) throw new Error('caído, «ataco» abrió un combate');
  // El turno que acaba de terminar no reabre la caja: al acabar llamaba a
  // `bloquear(false)` y la caída quedaba con la caja activa detrás.
  if (!await evaluate(`document.getElementById('entrada').disabled`)) {
    throw new Error('caído, un turno terminado volvió a abrir la caja de texto');
  }

  // Muerte permanente (7-oct-2026): pantalla final con la causa, la herencia
  // pendiente dicha sin prometerla, y «Nueva partida». Ni «Volver en ti» ni
  // ninguna forma de curar la derrota. La cifra llega del estado compartido
  // (asíncrono, #7): se espera a que esté escrita.
  // #8: primero «registrando…»; la cifra, cuando la muerte queda registrada.
  await until('/Muerte registrada/.test(document.getElementById("caida-registro")?.textContent ?? "") && !/Comprobando|se mostrará/.test(document.getElementById("caida-legado")?.textContent ?? "Comprobando")', 8000);
  const final = await evaluate(`({
    titulo: document.getElementById('caida-titulo')?.textContent ?? '',
    nota: document.getElementById('caida-nota')?.textContent ?? '',
    botones: [...document.querySelectorAll('#caida-acciones button')].map((b) => b.textContent.trim()),
    foco: document.activeElement?.textContent?.trim() ?? '',
    muerte: ARCANVEIL.store.select('meta.muerte'),
  })`);
  const textoHerencia = `${herenciaEsperada} XP: el 35 % de ${xpAntesDeMorir} XP, redondeado hacia abajo`;
  if (!/ha muerto/.test(final.titulo) || !final.nota.includes(textoHerencia) || /pendiente|decidir|Todavía no se aplica/.test(final.nota)) throw new Error(`la pantalla de muerte no dice la herencia real («${textoHerencia}»): ${JSON.stringify(final)}`);
  if (!final.botones.includes('Nueva partida') || final.botones.some((t) => /volver en ti/i.test(t))) throw new Error(`salidas de la muerte: ${final.botones}`);
  if (!final.muerte?.runId) throw new Error('la muerte no quedó registrada en el estado');
  await shot(`08-muerte-${viewport.label}.png`);
  const ranuras = await evaluate(`ARCANVEIL.sistema('saves').listar().filter((r) => !r.vacia).map((r) => ({ ranura: r.ranura, muerto: r.muerto, run: r.cabecera?.runId }))`);
  if (!ranuras.some((r) => r.muerto && r.run === final.muerte.runId)) throw new Error(`el final no se guardó como muerto: ${JSON.stringify(ranuras)}`);

  const runCaido = final.muerte.runId;
  await pulsarYNavegar(`[...document.querySelectorAll('#caida-acciones button')].find((b) => b.textContent.trim() === 'Nueva partida')`,
    'window.ARCANVEIL?.motor?.listo && document.body.classList.contains("esta-listo") && document.body.dataset.activeScreen === "herencia"');
  await shot(`09-nueva-partida-${viewport.label}.png`);
  const trasMorir = await evaluate(`(async () => ({
    pantalla: document.body.dataset.activeScreen,
    jugador: ARCANVEIL.store.select('player.nombre'),
    muerte: ARCANVEIL.store.select('meta.muerte'),
    cargar: await (async () => { const r = ARCANVEIL.sistema('saves').listar().find((x) => !x.vacia && x.muerto); return r ? ARCANVEIL.sistema('saves').cargar(r.ranura) : null; })(),
  }))()`);
  if (trasMorir.muerte || (trasMorir.jugador && trasMorir.jugador !== 'Sin nombre' && trasMorir.jugador !== null && trasMorir.jugador !== '')) {
    // El motor nuevo no trae al muerto.
    if (trasMorir.muerte) throw new Error(`la partida nueva arrastra la muerte anterior: ${JSON.stringify(trasMorir)}`);
  }
  if (!trasMorir.cargar || trasMorir.cargar.exito || trasMorir.cargar.motivo !== 'muerto') throw new Error(`la ranura del muerto se dejó cargar: ${JSON.stringify(trasMorir.cargar)}`);

  // ─── Legado: el 35 % de la experiencia pasa al sucesor, una vez ────────
  etapa('legado: elegir herencia, vista previa cancelable, confirmar y recargar');
  {
    // La pantalla de herencia: el caído primero, con su cifra, y el foco en él.
    const pantalla = await evaluate(`(async () => ({ tarjetas: [...document.querySelectorAll('.tarjeta-herencia')].map((b) => ({ origen: b.dataset.origen, texto: b.textContent, activa: !b.disabled })), foco: document.activeElement?.dataset?.origen ?? document.activeElement?.id ?? null, legado: ${legadoDe(runCaido)} }))()`);
    const suya = pantalla.tarjetas[0];
    if (!suya || suya.origen !== runCaido || !suya.activa || !suya.texto.includes('acaba de caer') || !suya.texto.includes(`${herenciaEsperada} XP`) || /man[aá]/i.test(suya.texto)) throw new Error(`la herencia del caído no sale primero con su cifra (o menciona maná): ${JSON.stringify(pantalla.tarjetas)}`);
    if (pantalla.foco !== runCaido) throw new Error(`el foco no está en la herencia del caído: ${pantalla.foco}`);
    if (pantalla.legado?.estado !== 'pendiente') throw new Error(`la herencia no está pendiente: ${JSON.stringify(pantalla.legado)}`);
    const antes = await evaluate(`localStorage.getItem('arcanveil:legados')`);

    // Teclado: Enter sobre la herencia enfocada la elige.
    await enter();
    await until('document.body.dataset.activeScreen === "personajes" && document.querySelector(".tarjeta-pj[data-personaje]")', 8000);
    // Móvil: un toque de verdad; escritorio: clic.
    if (!desktop) await tocar('.tarjeta-pj[data-personaje]');
    else await evaluate(`document.querySelector('.tarjeta-pj[data-personaje]').click()`);
    await until('document.querySelector("#aviso-herencia") && document.querySelector("#personajes-comenzar")', 8000);
    const aviso = await evaluate(`document.querySelector('#aviso-herencia').textContent`);
    if (!aviso.includes(textoHerencia) || !/Estimación: empezará en el nivel \d+/.test(aviso) || !/hasta entonces no se gasta/.test(aviso)) throw new Error(`el aviso antes de confirmar no dice origen, cantidad y estimación: «${aviso}»`);
    // #10: el texto dice lo que de verdad se calcula para el nuevo personaje
    // (vida y puntos) y no promete maná.
    if (/man[aá]/i.test(aviso) || !/Su vida sale de su oficio, sus atributos y ese nivel; sus puntos de habilidad, talento y atributo, de los niveles que gane\. Nada se copia del caído\./.test(aviso)) throw new Error(`el aviso de herencia no dice vida y puntos reales (o menciona maná): «${aviso}»`);
    await shot(`09b-herencia-confirmar-${viewport.label}.png`);

    // Cancelar (Elegir otro → Atrás → la portada): no se gasta nada.
    await evaluate(`document.querySelector('#personajes-otro').click()`);
    await evaluate(`[...document.querySelectorAll('#personajes-pie button')].find((b) => b.textContent.trim() === 'Atrás').click()`);
    await until('document.body.dataset.activeScreen === "inicio"', 5000);
    if (await evaluate(`localStorage.getItem('arcanveil:legados')`) !== antes) throw new Error('abrir el creador y cancelar cambió la herencia');

    // Otra vez desde el menú, y ahora confirmar (con doble clic).
    await evaluate(`document.querySelector('#menu-nueva').click()`);
    await until('document.body.dataset.activeScreen === "herencia"', 5000);
    await evaluate(`document.querySelector('.tarjeta-herencia[data-origen="${runCaido}"]').click()`);
    await until('document.querySelector(".tarjeta-pj[data-personaje]")', 5000);
    await evaluate(`document.querySelector('.tarjeta-pj[data-personaje]').click()`);
    await until('document.querySelector("#personajes-comenzar")', 5000);
    await evaluate(`(() => { const b = document.querySelector('#personajes-comenzar'); b.click(); b.click(); return true; })()`);
    await until('document.body.dataset.activeScreen === "juego" && ARCANVEIL.ver("player.legadoRecibido.runOrigen") === ' + JSON.stringify(runCaido), 15000);
    await until('!ARCANVEIL.sistema("turns")._ocupado', 15000);
    const sucesor = await evaluate(`(async () => ({ xp: ARCANVEIL.ver('player.xp'), heredada: ARCANVEIL.ver('player.xpHeredada'), nivel: ARCANVEIL.ver('player.nivel'), vida: ARCANVEIL.ver('player.vida.max'), puntos: ARCANVEIL.ver('player.puntosHabilidad'), run: ARCANVEIL.ver('meta.runId'), ranura: ARCANVEIL.ver('meta.ranura'), recibido: ARCANVEIL.ver('player.legadoRecibido'), procedencia: document.querySelector('#pj-xp-procedencia')?.textContent ?? '', legado: ${legadoDe(runCaido)}, sucesores: ${sucesoresDe(runCaido)} }))()`);
    if (sucesor.xp !== herenciaEsperada || sucesor.heredada !== herenciaEsperada || sucesor.run === runCaido || sucesor.nivel !== nivelParaXP(herenciaEsperada)) throw new Error(`el sucesor no tiene la herencia exacta y su nivel normal (${nivelParaXP(herenciaEsperada)}): ${JSON.stringify(sucesor)}`);
    if (sucesor.legado?.estado !== 'aplicado' || sucesor.legado.destinatario !== sucesor.run || sucesor.sucesores.length !== 1) throw new Error(`la entrega no quedó apuntada una sola vez (doble clic): ${JSON.stringify({ legado: sucesor.legado, sucesores: sucesor.sucesores })}`);
    if (!sucesor.procedencia.includes(`${herenciaEsperada} heredada`) || !/0 ganada jugando/.test(sucesor.procedencia)) throw new Error(`la ficha no separa lo heredado: «${sucesor.procedencia}»`);
    const escrito = await evaluate(`(() => { const g = JSON.parse(localStorage.getItem('arcanveil:partida:' + ARCANVEIL.ver('meta.ranura'))); return { run: g.estado.meta.runId, xp: g.estado.player.xp, origen: g.estado.player.legadoRecibido?.runOrigen }; })()`);
    if (escrito.run !== sucesor.run || escrito.xp !== herenciaEsperada || escrito.origen !== runCaido) throw new Error(`lo releído de la ranura no es el sucesor: ${JSON.stringify(escrito)}`);
    await shot(`09c-sucesor-${viewport.label}.png`);

    // Recargar de verdad y continuar: misma experiencia, mismo nivel, nada otra vez.
    await navegarHasta(RECARGAR, { finales: APP });
    await until('window.ARCANVEIL?.motor?.listo && document.body.classList.contains("esta-listo")', 15000);
    await evaluate(`document.querySelector('#inicio-jugar')?.click(); true`);
    await continuarPartida(sucesor.run);
    const recargado = await evaluate(`({ xp: ARCANVEIL.ver('player.xp'), nivel: ARCANVEIL.ver('player.nivel'), vida: ARCANVEIL.ver('player.vida.max'), puntos: ARCANVEIL.ver('player.puntosHabilidad'), sucesores: ${sucesoresDe(runCaido)} })`);
    if (recargado.xp !== sucesor.xp || recargado.nivel !== sucesor.nivel || recargado.vida !== sucesor.vida || recargado.puntos !== sucesor.puntos || recargado.sucesores.length !== 1) throw new Error(`tras recargar cambió algo: ${JSON.stringify({ sucesor, recargado })}`);
    const lineas = await evaluate(`ARCANVEIL.ver('narrative.entradas', []).length`);
    await evaluate(`ARCANVEIL.jugar('miro alrededor')`);
    if (await evaluate(`ARCANVEIL.ver('narrative.entradas', []).length`) <= lineas) throw new Error('el sucesor no puede jugar tras recargar');
    await shot(`09d-sucesor-recargado-${viewport.label}.png`);
  }

  etapa('legado: almacenamiento lleno al crear el sucesor (sigue pendiente; reintentar)');
  {
    const run = `run-fixture-cuota-${viewport.label}`;
    await evaluate(herenciaFicticia(run, 'Orla', 300));
    await pulsarYNavegar(`document.querySelector('#menu')`, 'window.ARCANVEIL?.motor?.listo && document.body.dataset.activeScreen === "inicio"');
    await evaluate(`document.querySelector('#inicio-jugar')?.click(); document.querySelector('#menu-nueva').click(); true`);
    await until('document.body.dataset.activeScreen === "herencia"', 5000);
    const lista = await evaluate(`[...document.querySelectorAll('.tarjeta-herencia')].map((b) => b.dataset.origen)`);
    if (lista.includes(runCaido)) throw new Error(`la herencia ya entregada sigue ofreciéndose: ${JSON.stringify(lista)}`);
    await evaluate(`document.querySelector('.tarjeta-herencia[data-origen="${run}"]').click()`);
    await until('document.querySelector(".tarjeta-pj[data-personaje]")', 5000);
    await evaluate(`document.querySelector('.tarjeta-pj[data-personaje]').click()`);
    await until('document.querySelector("#personajes-comenzar")', 5000);
    // FIXTURE: la ranura no se puede escribir (cuota llena).
    await evaluate(`(() => { const o = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (String(k).startsWith('arcanveil:partida:')) { const e = new Error('lleno'); e.name = 'QuotaExceededError'; throw e; } return o.call(this, k, v); }; document.querySelector('#personajes-comenzar').click(); return true; })()`);
    await until('!document.getElementById("salida-modal").hidden', 10000);
    const error = await evaluate(`(async () => ({ titulo: document.getElementById('salida-titulo').textContent, nota: document.getElementById('salida-nota').textContent, botones: [...document.querySelectorAll('#salida-acciones button')].map((b) => b.textContent.trim()), foco: document.activeElement?.textContent?.trim(), legado: ${legadoDe(run)}, sucesores: ${sucesoresDe(run)}, pantalla: document.body.dataset.activeScreen }))()`);
    if (!/No se ha podido empezar con la herencia/.test(error.titulo) || !/sigue pendiente/.test(error.nota) || !/No queda espacio/.test(error.nota) || error.legado?.estado !== 'pendiente' || error.sucesores.length || error.pantalla === 'juego') throw new Error(`fallo al guardar el sucesor: ${JSON.stringify(error)}`);
    if (!error.botones.includes('Reintentar') || error.foco !== 'Reintentar') throw new Error(`el aviso no ofrece Reintentar con el foco: ${JSON.stringify(error)}`);
    await shot(`09e-herencia-error-${viewport.label}.png`);
    // Reintentar recarga (sin el doble) y repite la MISMA creación.
    await pulsarYNavegar(`[...document.querySelectorAll('#salida-acciones button')].find((b) => b.textContent.trim() === 'Reintentar')`,
      `window.ARCANVEIL?.motor?.listo && document.body.dataset.activeScreen === "juego" && ARCANVEIL.ver("player.legadoRecibido.runOrigen") === ${JSON.stringify(run)}`);
    const bien = await evaluate(`(async () => ({ xp: ARCANVEIL.ver('player.xp'), legado: ${legadoDe(run)}, sucesores: ${sucesoresDe(run)} }))()`);
    if (bien.xp !== 105 || bien.legado?.estado !== 'aplicado' || bien.sucesores.length !== 1) throw new Error(`reintentar no entregó una vez: ${JSON.stringify(bien)}`);
    await until('!ARCANVEIL.sistema("turns")._ocupado', 15000);
  }

  etapa('legado: dos pestañas confirman a la vez el mismo sucesor');
  {
    const run = `run-fixture-pestanas-${viewport.label}`;
    await evaluate(herenciaFicticia(run, 'Tesa', 200));
    await pulsarYNavegar(`document.querySelector('#menu')`, 'window.ARCANVEIL?.motor?.listo && document.body.dataset.activeScreen === "inicio"');
    const hastaConfirmar = `(async () => { document.querySelector('#inicio-jugar')?.click(); document.querySelector('#menu-nueva').click(); await (async () => { for (let i = 0; i < 100 && !['herencia', 'personajes', 'creacion'].includes(document.body.dataset.activeScreen); i++) await new Promise((r) => setTimeout(r, 50)); })(); document.querySelector('.tarjeta-herencia[data-origen="${run}"]').click(); await new Promise((r) => setTimeout(r, 200)); document.querySelector('.tarjeta-pj[data-personaje]').click(); await new Promise((r) => setTimeout(r, 200)); return Boolean(document.querySelector('#personajes-comenzar') && document.querySelector('#aviso-herencia')); })()`;
    const otra = await abrirPestana(URL_APP);
    try {
      await otra.hasta('window.ARCANVEIL?.motor?.listo && document.body.classList.contains("esta-listo")');
      const listas = [await evaluate(hastaConfirmar), await otra.ev(hastaConfirmar)];
      if (!listas.every(Boolean)) throw new Error(`las dos pestañas no llegaron a confirmar: ${JSON.stringify(listas)}`);
      // A la vez.
      await Promise.all([evaluate(`document.querySelector('#personajes-comenzar').click(); true`), otra.ev(`document.querySelector('#personajes-comenzar').click(); true`)]);
      const fin = `document.body.dataset.activeScreen === "juego" || !document.getElementById("salida-modal").hidden`;
      await until(fin, 15000);
      await otra.hasta(fin);
      await wait(600);
      const estado = (ev) => ev(`({ juego: document.body.dataset.activeScreen === 'juego' && ARCANVEIL.ver('player.legadoRecibido.runOrigen') === ${JSON.stringify(run)}, aviso: document.getElementById('salida-modal').hidden ? null : document.getElementById('salida-nota').textContent })`);
      const a = await estado(evaluate);
      const b = await estado(otra.ev);
      const total = await evaluate(`(async () => ({ legado: ${legadoDe(run)}, sucesores: ${sucesoresDe(run)} }))()`);
      const ganadoras = [a, b].filter((x) => x.juego).length;
      const perdedora = [a, b].find((x) => !x.juego);
      if (ganadoras !== 1 || total.sucesores.length !== 1 || total.legado?.estado !== 'aplicado' || !/Otra pestaña|ya la recibió/.test(perdedora?.aviso ?? '')) throw new Error(`dos pestañas: ${JSON.stringify({ a, b, total })}`);
      if (!a.juego) await shot(`09f-herencia-otra-pestana-${viewport.label}.png`);
      console.log(`  dos pestañas: gana ${a.juego ? 'la primera' : 'la segunda'}; la otra dice «${perdedora.aviso.slice(0, 80)}…»; un sucesor`);
      // Si perdió esta pestaña, vuelve al menú y continúa la ganadora.
      if (!a.juego) {
        await pulsarYNavegar(`[...document.querySelectorAll('#salida-acciones button')].find((x) => x.textContent.trim() === 'Volver al menú')`, 'window.ARCANVEIL?.motor?.listo && document.body.dataset.activeScreen === "inicio"');
      }
    } finally {
      await otra.cerrar();
    }
  }

  /** Volver al menú desde donde se esté (partida: con salida segura). */
  const alMenu = async () => {
    if (await evaluate(`document.body.dataset.activeScreen === 'juego'`)) {
      await pulsarYNavegar(`document.querySelector('#menu')`, 'window.ARCANVEIL?.motor?.listo && document.body.dataset.activeScreen === "inicio"');
    } else {
      await navegarHasta(RECARGAR, { finales: APP });
      await until('window.ARCANVEIL?.motor?.listo && document.body.classList.contains("esta-listo")', 15000);
    }
  };
  /** Hasta «Comenzar partida» con una herencia (o ninguna) y el primer personaje. */
  const hastaConfirmarCon = (run) => `(async () => { document.querySelector('#inicio-jugar')?.click(); document.querySelector('#menu-nueva').click(); await (async () => { for (let i = 0; i < 100 && !['herencia', 'personajes', 'creacion'].includes(document.body.dataset.activeScreen); i++) await new Promise((r) => setTimeout(r, 50)); })();
    if (document.body.dataset.activeScreen === 'herencia') { ${run ? `document.querySelector('.tarjeta-herencia[data-origen="${run}"]').click();` : `document.querySelector('#herencia-sin').click();`} await new Promise((r) => setTimeout(r, 200)); }
    document.querySelector('.tarjeta-pj[data-personaje]').click(); await new Promise((r) => setTimeout(r, 200));
    return Boolean(document.querySelector('#personajes-comenzar')); })()`;
  const bytesRanuras = `Object.fromEntries(Array.from({ length: 8 }, (_, i) => [i + 1, localStorage.getItem('arcanveil:partida:' + (i + 1))]))`;

  etapa('legado: dos herencias DISTINTAS en dos pestañas a la vez (ranuras distintas)');
  {
    const x = `run-fixture-x-${viewport.label}`;
    const y = `run-fixture-y-${viewport.label}`;
    await evaluate(herenciaFicticia(x, 'Uxo', 400));
    await evaluate(herenciaFicticia(y, 'Vela', 600));
    await alMenu();
    const otra = await abrirPestana(URL_APP);
    try {
      await otra.hasta('window.ARCANVEIL?.motor?.listo && document.body.classList.contains("esta-listo")');
      const listas = [await evaluate(hastaConfirmarCon(x)), await otra.ev(hastaConfirmarCon(y))];
      if (!listas.every(Boolean)) throw new Error(`no llegaron a confirmar: ${JSON.stringify(listas)}`);
      await Promise.all([evaluate(`document.querySelector('#personajes-comenzar').click(); true`), otra.ev(`document.querySelector('#personajes-comenzar').click(); true`)]);
      await until(`document.body.dataset.activeScreen === "juego" && ARCANVEIL.ver("player.legadoRecibido.runOrigen") === ${JSON.stringify(x)}`, 20000);
      await otra.hasta(`document.body.dataset.activeScreen === "juego" && ARCANVEIL.ver("player.legadoRecibido.runOrigen") === ${JSON.stringify(y)}`, 20000);
      const a = await evaluate(`({ run: ARCANVEIL.ver('meta.runId'), ranura: ARCANVEIL.ver('meta.ranura'), xp: ARCANVEIL.ver('player.xp') })`);
      const b = await otra.ev(`({ run: ARCANVEIL.ver('meta.runId'), ranura: ARCANVEIL.ver('meta.ranura'), xp: ARCANVEIL.ver('player.xp') })`);
      const disco = await evaluate(`(async () => ({ x: ${sucesoresDe(x)}, y: ${sucesoresDe(y)}, lx: ${legadoDe(x)}, ly: ${legadoDe(y)} }))()`);
      if (a.ranura === b.ranura || a.xp !== 140 || b.xp !== 210 || disco.x.length !== 1 || disco.y.length !== 1 || disco.lx?.destinatario !== a.run || disco.ly?.destinatario !== b.run || disco.lx?.ranura !== a.ranura || disco.ly?.ranura !== b.ranura) {
        throw new Error(`dos herencias distintas a la vez: ${JSON.stringify({ a, b, disco })}`);
      }
      console.log(`  dos herencias a la vez: Uxo → ranura ${a.ranura} (140 XP), Vela → ranura ${b.ranura} (210 XP); ninguna pisa a la otra`);
    } finally {
      await otra.cerrar();
    }
    // Recargar y verlas las dos en «Cargar», y abrir cada una.
    await alMenu();
    await evaluate(`document.querySelector('#inicio-jugar')?.click(); document.querySelector('#menu-cargar').click(); true`);
    await until('document.body.dataset.activeScreen === "cargar"', 5000);
    const lista = await evaluate(`[...document.querySelectorAll('#cargar-lista .tarjeta-pj__abrir')].map((b) => ({ ranura: b.dataset.ranura, texto: b.textContent }))`);
    const ambos = await evaluate(`({ x: ${sucesoresDe(x)}, y: ${sucesoresDe(y)} })`);
    await shot(`09g-dos-herencias-cargar-${viewport.label}.png`);
    for (const s of [...ambos.x, ...ambos.y]) {
      const fila = lista.find((l) => l.ranura && JSON.stringify(ambos).includes(s.run));
      if (!fila) throw new Error(`tras recargar no se ve el sucesor ${s.run}: ${JSON.stringify(lista)}`);
    }
    const r = await evaluate(`(async () => { const out = []; for (const n of ['1','2','3','4','5','6','7','8']) { const g = JSON.parse(localStorage.getItem('arcanveil:partida:' + n) ?? 'null'); const o = g?.estado?.player?.legadoRecibido?.runOrigen; if (o === ${JSON.stringify(x)} || o === ${JSON.stringify(y)}) { const c = await ARCANVEIL.sistema('saves').cargar(n); out.push({ n, ok: c.exito, xp: ARCANVEIL.ver('player.xp'), heredada: ARCANVEIL.ver('player.xpHeredada'), origen: ARCANVEIL.ver('player.legadoRecibido.runOrigen'), token: ARCANVEIL.ver('player.legadoRecibido.transaccion') }); } } return out; })()`);
    if (r.length !== 2 || !r.every((s) => s.ok && s.xp === s.heredada && s.token)) throw new Error(`abrir los dos sucesores tras recargar: ${JSON.stringify(r)}`);
    await navegarHasta(RECARGAR, { finales: APP });
    await until('window.ARCANVEIL?.motor?.listo && document.body.classList.contains("esta-listo")', 15000);
  }

  etapa('legado: recuperación bloqueada por una ranura reservada dañada');
  let ranuraDanada = null;
  {
    const z = `run-fixture-z-${viewport.label}`;
    await evaluate(herenciaFicticia(z, 'Zoe', 1000));
    // FIXTURE: el corte del #7 (Caso A de la revisión): reserva hacia una
    // ranura libre que contiene JSON roto.
    ranuraDanada = await evaluate(`(() => { const n = ['1','2','3','4','5','6','7','8'].find((k) => localStorage.getItem('arcanveil:partida:' + k) === null);
      const l = JSON.parse(localStorage.getItem('arcanveil:legados')); l[${JSON.stringify(z)}] = { ...l[${JSON.stringify(z)}], estado: 'reservado', transaccion: 'leg-fixture-z', reserva: { runDestino: 'run-z-sucesor', ranura: n, cantidad: 350, momento: Date.now() } };
      localStorage.setItem('arcanveil:legados', JSON.stringify(l)); localStorage.setItem('arcanveil:partida:' + n, '{"version":'); return n; })()`);
    if (!ranuraDanada) throw new Error('no quedaba ranura libre para el fixture de recuperación');
    await navegarHasta(RECARGAR, { finales: APP });
    await until('window.ARCANVEIL?.motor?.listo && document.body.classList.contains("esta-listo")', 15000);
    await until('/no se (puede|pueden) comprobar/.test(document.getElementById("avisos")?.textContent ?? "")', 8000);
    await evaluate(`document.querySelector('#inicio-jugar')?.click(); document.querySelector('#menu-nueva').click(); true`);
    await until('document.body.dataset.activeScreen === "herencia"', 5000);
    const tarjeta = await evaluate(`(() => { const b = document.querySelector('.tarjeta-herencia[data-origen="${z}"]'); return b ? { activa: !b.disabled, texto: b.textContent } : null; })()`);
    if (!tarjeta || tarjeta.activa || !/dañada/.test(tarjeta.texto) || !/No he vuelto a entregar la herencia ni he borrado ninguna partida/.test(tarjeta.texto) || !await evaluate(`Boolean(document.querySelector('#herencia-comprobar'))`)) {
      throw new Error(`la herencia bloqueada no se enseña con su motivo y «Volver a comprobar»: ${JSON.stringify(tarjeta)}`);
    }
    await shot(`09h-recuperacion-bloqueada-${viewport.label}.png`);
    await evaluate(`document.querySelector('#herencia-comprobar').click(); true`);
    await wait(500);
    const tras = await evaluate(`(async () => ({ estado: ${legadoDe(z)}?.estado, bytes: localStorage.getItem('arcanveil:partida:${ranuraDanada}'), activa: !document.querySelector('.tarjeta-herencia[data-origen="${z}"]')?.disabled }))()`);
    if (tras.estado !== 'reservado' || tras.bytes !== '{"version":' || tras.activa) throw new Error(`volver a comprobar liberó o tocó algo: ${JSON.stringify(tras)}`);
    await evaluate(`document.querySelector('#herencia-atras').click(); true`);
  }

  etapa('ranuras llenas: selector, Escape, permiso caducado y reemplazo concreto');
  {
    // FIXTURE: campañas de relleno (copias válidas con otro run) hasta llenar.
    await evaluate(`(() => { const base = ['1','2','3','4','5','6','7','8'].map((n) => localStorage.getItem('arcanveil:partida:' + n)).find((t) => { try { return JSON.parse(t)?.estado?.meta?.runId; } catch { return false; } });
      let i = 0; for (const n of ['1','2','3','4','5','6','7','8']) { if (localStorage.getItem('arcanveil:partida:' + n) !== null) continue; const g = JSON.parse(base); i += 1; g.estado.meta.runId = 'run-relleno-' + n; g.estado.meta.muerte = null; g.estado.player.nombre = 'Relleno ' + n; g.estado.player.legadoRecibido = undefined; g.estado.player.xpHeredada = 0; g.cabecera = { ...g.cabecera, nombre: 'Relleno ' + n, runId: 'run-relleno-' + n, muerto: false }; g.guardadoEn = Date.now() - i * 60000; localStorage.setItem('arcanveil:partida:' + n, JSON.stringify(g)); } return i; })()`);
    const antes = await evaluate(bytesRanuras);
    if (Object.values(antes).some((b) => b === null)) throw new Error('no se llenaron las ocho ranuras');
    const listo = await evaluate(hastaConfirmarCon(null));
    if (!listo) throw new Error('no se llegó a «Comenzar partida» para probar ranuras llenas');
    await evaluate(`document.querySelector('#personajes-comenzar').click(); true`);
    await until('!document.getElementById("ranuras-modal").hidden', 10000);
    const modal = await evaluate(`({ filas: [...document.querySelectorAll('#ranuras-lista .ranura-fila')].map((f) => ({ ranura: f.dataset.ranura, texto: f.textContent, bloqueada: f.classList.contains('ranura-fila--bloqueada') })), foco: document.activeElement?.id })`);
    if (modal.filas.length !== 8 || modal.foco !== 'ranuras-cancelar' || !modal.filas.find((f) => f.ranura === ranuraDanada)?.bloqueada) throw new Error(`selector de ranuras llenas: ${JSON.stringify(modal)}`);
    await shot(`09i-ranuras-llenas-${viewport.label}.png`);
    // Escape cancela: nada tocado, el borrador sigue.
    await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await wait(200);
    const tras = await evaluate(`({ oculto: document.getElementById('ranuras-modal').hidden, pantalla: document.body.dataset.activeScreen, comenzar: Boolean(document.querySelector('#personajes-comenzar')), bytes: ${bytesRanuras}, jugador: ARCANVEIL.ver('player.raza') ?? null })`);
    if (!tras.oculto || tras.pantalla !== 'personajes' || !tras.comenzar || JSON.stringify(tras.bytes) !== JSON.stringify(antes) || tras.jugador) throw new Error(`Escape en ranuras llenas: ${JSON.stringify({ ...tras, bytes: undefined })}`);
    // Elegir una para reemplazar; la confirmación nombra la campaña y el foco va a «Volver».
    const elegida = modal.filas.find((f) => /Relleno/.test(f.texto) && !f.bloqueada).ranura;
    await evaluate(`document.querySelector('#personajes-comenzar').click(); true`);
    await until('!document.getElementById("ranuras-modal").hidden', 10000);
    await evaluate(`document.querySelector('[data-reemplazar="${elegida}"]').click(); true`);
    const conf = await evaluate(`({ titulo: document.getElementById('ranuras-titulo').textContent, nota: document.getElementById('ranuras-nota').textContent, foco: document.activeElement?.id })`);
    if (!new RegExp(`ranura ${elegida}`).test(conf.titulo) || !new RegExp(`Relleno ${elegida}`).test(conf.nota) || !/no se puede deshacer/.test(conf.nota) || conf.foco !== 'ranuras-volver') throw new Error(`confirmación de reemplazo: ${JSON.stringify(conf)}`);
    await shot(`09j-ranuras-confirmar-${viewport.label}.png`);
    await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await wait(150);
    if (await evaluate(`document.getElementById('ranuras-modal').dataset.etapa`) !== 'lista') throw new Error('Escape en la confirmación no vuelve a la lista');
    // Otra pestaña cambia esa campaña DESPUÉS de elegirla: el permiso caduca.
    await evaluate(`document.querySelector('[data-reemplazar="${elegida}"]').click(); true`);
    await evaluate(`(() => { const k = 'arcanveil:partida:${elegida}'; const g = JSON.parse(localStorage.getItem(k)); g.guardadoEn += 1000; localStorage.setItem(k, JSON.stringify(g)); return true; })()`);
    const cambiada = await evaluate(`localStorage.getItem('arcanveil:partida:${elegida}')`);
    await evaluate(`document.querySelector('#ranuras-confirmar').click(); true`);
    await until('!document.getElementById("ranuras-modal").hidden && document.getElementById("ranuras-modal").dataset.etapa === "lista"', 10000);
    const caducado = await evaluate(`({ aviso: document.getElementById('avisos')?.textContent ?? '', bytes: localStorage.getItem('arcanveil:partida:${elegida}'), jugador: ARCANVEIL.ver('player.raza') ?? null })`);
    if (!/ha cambiado/.test(caducado.aviso) || caducado.bytes !== cambiada || caducado.jugador) throw new Error(`permiso caducado: ${JSON.stringify({ ...caducado, bytes: caducado.bytes === cambiada })}`);
    // Ahora sí, con permiso leído de nuevo: solo esa ranura cambia.
    await evaluate(`document.querySelector('[data-reemplazar="${elegida}"]').click(); true`);
    await evaluate(`document.querySelector('#ranuras-confirmar').click(); true`);
    await until(`document.body.dataset.activeScreen === "juego" && ARCANVEIL.ver("meta.ranura") === ${JSON.stringify(elegida)}`, 15000);
    await until('!ARCANVEIL.sistema("turns")._ocupado', 15000);
    const despues = await evaluate(bytesRanuras);
    const tocadas = Object.keys(antes).filter((n) => despues[n] !== antes[n]);
    if (tocadas.length !== 1 || tocadas[0] !== String(elegida)) throw new Error(`el reemplazo tocó otras ranuras: ${tocadas}`);
    console.log(`  ranuras llenas: Escape no toca nada; permiso caducado al cambiar la ${elegida}; reemplazo solo de la ${elegida}`);
    await shot(`09k-reemplazo-${viewport.label}.png`);
  }

  await pestanasCoordinadas();
  await tokenEnChrome();
  await tokensDurablesEnChrome();
  await borradoDurableEnChrome();

  etapa('muerte con la salida pendiente, caso A (sin protección)');
  {
    await evaluate(`ARCANVEIL.bus.emit('combat:request', { enemies: [{ refId: 'guardia_corrupto', count: 1 }] }); true`);
    await until('ARCANVEIL.ver("combat.activo", false) && ARCANVEIL.sistema("combat").esperandoJugador', 10000);
    await muerteConSalidaPendiente({ proteccion: false, etiqueta: 'caso A (sin protección)' });
    await shot(`08b-muerte-sin-proteccion-${viewport.label}.png`);
  }

  // ─── Interfaz clásica: RETIRADA. La dirección vieja lleva a la vigente ──
  etapa('interfaz clásica retirada: la dirección antigua lleva a app/ con los datos');
  await cdp('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  const portada = await (await fetch(`http://127.0.0.1:${PORT}/index.html`)).text();
  if (!/href="\.\/app\/index\.html"/.test(portada) || /<a[^>]+clasico\.html/.test(portada)) throw new Error('la portada no lleva solo a la interfaz vigente');
  for (const viejo of ['/src/main.js', '/styles/main.css', '/src/ui/components/CombatPanel.js']) {
    const r = await fetch(`http://127.0.0.1:${PORT}${viejo}`);
    if (r.status !== 404) throw new Error(`la interfaz retirada se sigue sirviendo: ${viejo} → ${r.status}`);
  }
  const conPartida = await evaluate(`ARCANVEIL.sistema('saves').listar().filter((r) => !r.vacia && !r.muerto).length`);
  // El ayudante de navegación, primero contra lo que NO debe dar verde: un
  // destino equivocado y una pestaña que se cierra a mitad (otra pestaña del
  // mismo perfil, para no perder la principal).
  {
    const aux = await abrirPestana(`http://127.0.0.1:${PORT}/app/index.html`);
    await aux.hasta('window.ARCANVEIL?.motor?.listo');
    const mal = await navegarHasta(() => aux.enviar('Page.navigate', { url: `http://127.0.0.1:${PORT}/ATTRIBUTION.md` }), { eventos: aux.eventos, finales: APP, permitidas: ['/clasico.html', ...APP], tope: 8000, quien: 'pestaña auxiliar' }).then(() => 'VERDE', (e) => e.message);
    const t0 = Date.now();
    const cerrada = await navegarHasta(() => fetch(`http://127.0.0.1:${DEBUG}/json/close/${aux.id}`), { eventos: aux.eventos, finales: APP, permitidas: ['/clasico.html', ...APP], tope: 8000, quien: 'pestaña auxiliar' }).then(() => 'VERDE', (e) => e.message);
    await aux.cerrar();
    if (!/navegación inesperada a .*ATTRIBUTION\.md/.test(mal) || !/se cerró|no se llegó/.test(cerrada) || Date.now() - t0 > 9000) throw new Error(`el ayudante de navegación dio por buena una navegación mala: ${JSON.stringify({ mal, cerrada })}`);
    console.log(`  ayudante de navegación: destino equivocado → «${mal.slice(0, 60)}…»; pestaña cerrada → «${cerrada.slice(0, 50)}…»`);
    // Y el diagnóstico de una pestaña cuyo motor no arranca: dice qué
    // documento llegó a existir (aquí, uno sin juego), no solo «sin arrancar».
    const sinMotor = await abrirPestana(`http://127.0.0.1:${PORT}/ATTRIBUTION.md`);
    const diag = await sinMotor.hasta('window.ARCANVEIL?.motor?.listo', 3000).then(() => 'VERDE', (e) => e.message);
    await sinMotor.cerrar();
    if (!/documento: \{"url":"[^"]*ATTRIBUTION\.md"/.test(diag) || !/readyState/.test(diag) || !/navegaciones: \[/.test(diag)) throw new Error(`el diagnóstico de una pestaña sin motor no dice qué documento hay: ${diag.slice(0, 400)}`);
    console.log(`  diagnóstico de pestaña sin motor: «${diag.split('\n')[1]?.trim().slice(0, 90)}…»`);
  }
  const puenteNav = await navegarHasta(() => cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/clasico.html` }), { finales: APP, permitidas: ['/clasico.html', ...APP] });
  if (puenteNav.navegaciones[0] !== '/clasico.html' || !puenteNav.navegaciones.at(-1).endsWith('/app/index.html')) throw new Error(`el puente no pasó por la clásica hasta app/: ${JSON.stringify(puenteNav)}`);
  await until(`location.pathname.endsWith('/app/index.html') && location.origin === ${JSON.stringify(`http://127.0.0.1:${PORT}`)} && window.ARCANVEIL?.motor?.listo && document.body.classList.contains('esta-listo')`, 15000);
  await evaluate(`document.querySelector('#inicio-jugar')?.click(); true`);
  const puente = await evaluate(`({ ruta: location.pathname, continuar: !document.querySelector('#menu-continuar')?.disabled, atacarViejo: document.querySelectorAll('[data-accion="atacar"]').length, partidas: ARCANVEIL.sistema('saves').listar().filter((r) => !r.vacia && !r.muerto).length })`);
  if (!puente.continuar || puente.atacarViejo || puente.partidas !== conPartida) throw new Error(`el puente de la clásica no lleva a la vigente con las mismas partidas: ${JSON.stringify({ puente, conPartida })}`);
  console.log(`  puente clásico: ${puenteNav.navegaciones.join(' → ')}; ${puente.partidas} partidas vivas, las mismas que antes`);
  await shot(`14-clasica-puente-${viewport.label}.png`);

  etapa('sin red');
  const beforeOffline = await evaluate(`navigator.serviceWorker.ready.then(()=>({controlled:Boolean(navigator.serviceWorker.controller),lines:ARCANVEIL.ver('narrative.entradas',[]).length}))`);
  await wait(700);
  await cdp('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  await navegarHasta(RECARGAR, { finales: APP });
  await until('window.ARCANVEIL?.motor?.listo && document.body.classList.contains("esta-listo")', 15000);
  const offline = await evaluate(`({screen:document.body.dataset.activeScreen, title:document.title, failures:document.querySelectorAll('#fallos .fallos__linea').length})`);
  await shot(`04-offline-${viewport.label}.png`);
  if (offline.title !== 'ARCANVEIL' || offline.failures) throw new Error(`offline inválido ${JSON.stringify(offline)}`);

  // El retrato elegido sigue ahí sin red y tras recargar: vive en el
  // navegador (IndexedDB), no en una dirección de fuera ni en un blob muerto.
  if (estudio.startsWith('pintar')) {
    const guardadas = await evaluate(`new Promise((ok) => { const p = indexedDB.open('arcanveil-imagenes'); p.onsuccess = () => { const q = p.result.transaction('aprobadas').objectStore('aprobadas').getAllKeys(); q.onsuccess = () => ok(q.result); q.onerror = () => ok([]); }; p.onerror = () => ok([]); })`);
    if (!guardadas.some((k) => /^pj:/.test(k))) throw new Error(`sin red y tras recargar, el retrato elegido no está en el navegador: ${JSON.stringify(guardadas)}`);
    // Y se ve: en la lista de personajes, con su imagen y no con el marcador.
    await evaluate(`document.querySelector('#menu-nueva').click()`);
    // Si queda alguna herencia pendiente, antes se elige: aquí, ninguna.
    await until('["herencia", "personajes", "creacion"].includes(document.body.dataset.activeScreen)', 8000);
    if (await evaluate(`document.body.dataset.activeScreen === 'herencia'`)) await evaluate(`document.querySelector('#herencia-sin').click()`);
    await until('document.querySelector("img.arte--aprobada")?.complete && document.querySelector("img.arte--aprobada").naturalWidth > 0', 8000);
    await shot(`06-retrato-sin-red-${viewport.label}.png`);

    // «Borrar partidas y personajes»: también los retratos elegidos (antes se
    // quedaban en IndexedDB y volvían al recargar) y las candidatas del
    // puente. Lo que no es del juego no se toca.
    await cdp('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await evaluate(`localStorage.setItem('otro-juego:dato', 'sigue'); new Promise((ok) => { const p = indexedDB.open('otra-base', 1); p.onupgradeneeded = () => p.result.createObjectStore('x'); p.onsuccess = () => { const t = p.result.transaction('x', 'readwrite'); t.objectStore('x').put('sigue', 'k'); t.oncomplete = () => { p.result.close(); ok(true); }; }; })`);
    escribirSync(join(cacheImagen, 'pnj_npc_x__prueba.img'), 'candidata de prueba');
    await navegarHasta(RECARGAR, { finales: APP });
    await until('window.ARCANVEIL?.motor?.listo && document.body.classList.contains("esta-listo")', 15000);
    await evaluate(`window.confirm = () => true; document.querySelector('#inicio-jugar')?.click()`);
    await until('document.querySelector("#menu-ajustes") && !document.querySelector("#menu-ajustes").closest("[hidden]")', 5000);
    await evaluate(`document.querySelector('#menu-ajustes').click()`);
    await until('document.querySelector("#ajustes-borrar")', 5000);
    await evaluate(`document.querySelector('#ajustes-borrar').click()`);
    await until('/Borrados partidas/.test(document.body.textContent)', 8000);
    const tras = { galeria: await evaluate(GALERIA), candidatas: enCache() };
    if (tras.galeria.length || tras.candidatas.length) throw new Error(`«Borrar partidas y personajes» dejó imágenes: ${JSON.stringify(tras)}`);
    await navegarHasta(RECARGAR, { finales: APP });
    await until('window.ARCANVEIL?.motor?.listo && document.body.classList.contains("esta-listo")', 15000);
    const recargado = await evaluate(`(async () => ({ galeria: await ${GALERIA}, ajeno: localStorage.getItem('otro-juego:dato'), otraBase: await new Promise((ok) => { const p = indexedDB.open('otra-base', 1); p.onsuccess = () => { const q = p.result.transaction('x').objectStore('x').get('k'); q.onsuccess = () => { p.result.close(); ok(q.result); }; }; }), personajes: localStorage.getItem('arcanveil:personajes') }))()`);
    if (recargado.galeria.length || recargado.ajeno !== 'sigue' || recargado.otraBase !== 'sigue' || recargado.personajes) throw new Error(`tras borrar y recargar: ${JSON.stringify(recargado)}`);
    borrado = 'galería y candidatas vacías tras recargar; lo ajeno intacto';
  }


  if (externos.length) throw new Error(`la página pidió cosas fuera de este equipo: ${[...new Set(externos)].slice(0, 5).join(' · ')}`);

  const report = {
    viewport: viewport.label, systems: boot.systems, turns: turns.length,
    maxLogLines: Math.max(...turns.map(t => t.lines)),
    exceptions: exceptions.length, serviceWorkerControlled: beforeOffline.controlled,
    offlineScreen: offline.screen, failures: offline.failures,
    retrato: libre.aprobado ? 'elegido' : 'marcador',
    estudio,
    borrado,
    externos: externos.length,
    sinIA,
  };
  console.log(JSON.stringify(report, null, 2));
  }
} catch (e) {
  console.error(e.stack || e);
  if (serverErr) console.error('server:', serverErr.slice(-1000));
  if (chromeErr) console.error('chrome:', chromeErr.slice(-1000));
  process.exitCode = 1;
} finally {
  if (ws?.readyState === WebSocket.OPEN) ws.close();
  await pararPuenteImagen();
  await stop();
}