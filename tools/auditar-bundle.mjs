/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCANVEIL · tools/auditar-bundle.mjs
 * ---------------------------------------------------------------------------
 * El archivo único (`tools/bundle.mjs`) abierto de verdad en Chrome desde
 * `file://`, con un perfil temporal: que arranque la interfaz vigente (`app/`,
 * no la retirada), que se cree un personaje, se juegue, se guarde, se recargue
 * y se continúe, y que una muerte deje su herencia y un sucesor la reciba.
 * Sin servidor, sin red: cualquier petición fuera del archivo es un fallo.
 *
 * Antes partía de `clasico.html`: el «archivo único» era la interfaz antigua,
 * que no podía atacar con el combate actual. Generarlo sin errores no
 * probaba que se pudiera jugar.
 *
 *   node tools/auditar-bundle.mjs [--capturas]
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile, mkdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const capturas = process.argv.includes('--capturas');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let fallos = 0;
let casos = 0;
function comprobar(bien, texto, detalle = '') {
  casos += 1;
  if (bien) console.log(`OK   ${texto}`);
  else { fallos += 1; console.log(`MAL  ${texto}`); if (detalle) console.log(`     ${String(detalle).slice(0, 600)}`); }
}

const temporal = await mkdtemp(join(tmpdir(), 'arcanveil-bundle-'));
const salida = join(temporal, 'arcanveil.html');
const perfil = join(temporal, 'perfil');
const construido = spawnSync(process.execPath, ['tools/bundle.mjs', '--salida', salida], { cwd: RAIZ, encoding: 'utf8' });
comprobar(construido.status === 0 && existsSync(salida), 'el empaquetador termina y escribe el archivo', construido.stderr || construido.stdout.slice(-300));
const tamano = existsSync(salida) ? Math.round((await stat(salida)).size / 1024) : 0;

function buscarChrome() {
  if (process.env.CHROME_BIN) return process.env.CHROME_BIN;
  const c = {
    win32: ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe', `${process.env.LOCALAPPDATA ?? ''}\\Google\\Chrome\\Application\\chrome.exe`],
    darwin: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'],
  }[process.platform] ?? ['google-chrome'];
  return c.find((x) => !x.includes('/') && !x.includes('\\') ? true : existsSync(x));
}

const PUERTO = 9400 + Math.floor(Math.random() * 400);
const chrome = spawn(buscarChrome(), ['--headless=new', '--no-sandbox', '--disable-gpu', '--window-size=1280,900', `--remote-debugging-port=${PUERTO}`, `--user-data-dir=${perfil}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });

let ws;
let seq = 0;
const pendientes = new Map();
const excepciones = [];
const externos = [];
const cdp = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; pendientes.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); });
async function evaluar(expresion) {
  const r = await cdp('Runtime.evaluate', { expression: expresion, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(`${r.exceptionDetails.text} ${r.exceptionDetails.exception?.description ?? ''}`.slice(0, 400));
  return r.result?.value;
}
async function hasta(expresion, ms = 12000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { try { if (await evaluar(`Boolean(${expresion})`)) return true; } catch { /* navegando */ } await wait(120); }
  throw new Error(`tiempo agotado esperando: ${expresion}`);
}
/** Recargar sin carrera: se pide la recarga y se espera al motor nuevo. */
async function recargarY(listo) {
  await evaluar(`window.__marca = 1; setTimeout(() => location.reload(), 30); true`);
  const t0 = Date.now();
  while (Date.now() - t0 < 15000) { await wait(150); let sigue; try { sigue = await evaluar('window.__marca === 1'); } catch { sigue = true; } if (!sigue) break; }
  await hasta(listo, 15000);
}
async function foto(nombre) {
  if (!capturas) return;
  const dir = join(RAIZ, 'dist', 'regresion', 'bundle');
  await mkdir(dir, { recursive: true });
  const r = await cdp('Page.captureScreenshot', { format: 'png' });
  await writeFile(join(dir, nombre), Buffer.from(r.data, 'base64'));
}

try {
  let objetivo = null;
  for (let i = 0; i < 100 && !objetivo; i++) {
    try { objetivo = await (await fetch(`http://127.0.0.1:${PUERTO}/json/new?about:blank`, { method: 'PUT' })).json(); } catch { await wait(100); }
  }
  ws = new WebSocket(objetivo.webSocketDebuggerUrl);
  await new Promise((ok, mal) => { ws.onopen = ok; ws.onerror = mal; });
  ws.onmessage = ({ data }) => {
    const m = JSON.parse(data);
    if (m.id && pendientes.has(m.id)) { const p = pendientes.get(m.id); pendientes.delete(m.id); if (m.error) p.reject(new Error(m.error.message)); else p.resolve(m.result); }
    else if (m.method === 'Runtime.exceptionThrown') excepciones.push(m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text);
    // Lo que la interfaz atrapa y solo escribe en la consola también cuenta.
    else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') excepciones.push(`consola: ${m.params.args.map((a) => a.value ?? a.description ?? '').join(' ')}`.slice(0, 300));
    else if (m.method === 'Network.requestWillBeSent' && /^(https?|wss?):/.test(m.params.request.url)) externos.push(m.params.request.url.slice(0, 120));
  };
  await cdp('Runtime.enable'); await cdp('Page.enable'); await cdp('Network.enable');
  await cdp('Page.navigate', { url: pathToFileURL(salida).href });

  await hasta('window.ARCANVEIL?.motor?.listo && document.body.classList.contains("esta-listo")', 15000);
  const arranque = await evaluar(`({ pantalla: document.body.dataset.activeScreen, sistemas: ARCANVEIL.inspeccionar().total, fallos: document.querySelectorAll('#fallos .fallos__linea').length, herencia: Boolean(document.querySelector('section[data-pantalla="herencia"]')), protocolo: location.protocol, candados: Boolean(navigator.locks?.request) })`);
  comprobar(arranque.pantalla === 'inicio' && arranque.sistemas >= 30 && !arranque.fallos && arranque.herencia && arranque.protocolo === 'file:',
    `arranca la interfaz vigente desde file:// (${arranque.sistemas} sistemas, ${tamano} KB)`, JSON.stringify(arranque));
  await foto('01-inicio.png');

  // Crear y jugar.
  await evaluar(`document.querySelector('#inicio-jugar').click(); document.querySelector('#menu-nueva').click(); true`);
  await hasta('document.querySelector("#creacion-crear")');
  await evaluar(`(() => { const f = (q, v) => { const n = document.querySelector(q); n.value = v; n.dispatchEvent(new Event('input', { bubbles: true })); }; f('#nombre', 'Brisa'); f('#retrato-descripcion', 'mujer de pelo corto y capa gris de viaje'); f('#lore-personaje', 'Cruzó el vado buscando a su hermano.'); document.querySelector('#creacion-crear').click(); return true; })()`);
  await hasta('document.querySelector("#creacion-empezar")');
  await evaluar(`document.querySelector('#creacion-empezar').click(); true`);
  await hasta('document.body.dataset.activeScreen === "juego" && ARCANVEIL.ver("player.nombre") === "Brisa"', 15000);
  // Como un jugador: la entrada está bloqueada hasta que termina la apertura.
  await hasta('ARCANVEIL.ver("narrative.entradas", []).length > 0 && !ARCANVEIL.sistema("turns")._ocupado', 15000);
  const antes = await evaluar(`ARCANVEIL.ver('narrative.entradas', []).length`);
  await evaluar(`ARCANVEIL.jugar('miro alrededor').then(() => ARCANVEIL.jugar('hablo con quien tenga cerca')).then(() => true)`);
  const despues = await evaluar(`ARCANVEIL.ver('narrative.entradas', []).length`);
  comprobar(despues > antes + 2, `se juega: la crónica crece (${antes} → ${despues} entradas)`);
  await foto('02-partida.png');

  // Guardar, recargar y continuar.
  const run = await evaluar(`ARCANVEIL.ver('meta.runId')`);
  await evaluar(`document.querySelector('#guardar')?.click(); true`);
  await recargarY('window.ARCANVEIL?.motor?.listo && document.body.classList.contains("esta-listo")');
  await evaluar(`document.querySelector('#inicio-jugar')?.click(); true`);
  await hasta('document.querySelector("#menu-continuar") && !document.querySelector("#menu-continuar").disabled', 8000);
  await evaluar(`document.querySelector('#menu-continuar').click(); true`);
  await hasta(`document.body.dataset.activeScreen === "juego" && ARCANVEIL.ver("meta.runId") === ${JSON.stringify(run)}`, 15000);
  comprobar(true, 'guardar, recargar el archivo y «Continuar»: la misma partida');

  // Morir y heredar (FIXTURE: 400 XP por el canal normal y daño de prueba).
  await evaluar(`ARCANVEIL.store.dispatch('player/xp', { cantidad: 400 - ARCANVEIL.ver('player.xp'), motivo: 'fixture' }); true`);
  for (let i = 0; i < 3 && await evaluar(`ARCANVEIL.ver('meta.fase') !== 'fin'`); i++) { await evaluar(`ARCANVEIL.store.dispatch('player/danar', { cantidad: 999, origen: 'prueba' }); true`); await wait(300); }
  await hasta('!document.getElementById("caida-modal").hidden', 8000);
  const nota = await evaluar(`document.getElementById('caida-legado')?.textContent ?? ''`);
  comprobar(/140 XP: el 35 % de 400 XP, redondeado hacia abajo/.test(nota), 'la muerte dice la herencia exacta (400 → 140)', nota);
  await evaluar(`window.__marca = 1; setTimeout(() => [...document.querySelectorAll('#caida-acciones button')].find((b) => b.textContent.trim() === 'Nueva partida').click(), 30); true`);
  await wait(400);
  await hasta('window.ARCANVEIL?.motor?.listo && document.body.dataset.activeScreen === "herencia"', 15000);
  await evaluar(`document.querySelector('.tarjeta-herencia:not([disabled])').click(); true`);
  await hasta('document.querySelector(".tarjeta-pj[data-personaje]")', 8000);
  await evaluar(`document.querySelector('.tarjeta-pj[data-personaje]').click(); true`);
  await hasta('document.querySelector("#personajes-comenzar") && document.querySelector("#aviso-herencia")', 8000);
  await evaluar(`document.querySelector('#personajes-comenzar').click(); true`);
  await hasta('document.body.dataset.activeScreen === "juego" || !document.getElementById("salida-modal").hidden', 15000);
  const sucesor = await evaluar(`({ xp: ARCANVEIL.ver('player.xp'), origen: ARCANVEIL.ver('player.legadoRecibido.nombreOrigen'), modal: document.getElementById('salida-modal').hidden ? null : document.getElementById('salida-nota').textContent })`);
  comprobar(sucesor.xp === 140 && sucesor.origen === 'Brisa' && !sucesor.modal, 'el sucesor recibe 140 XP con su origen (Web Locks también desde file://)', JSON.stringify(sucesor));
  await foto('03-sucesor.png');

  comprobar(!externos.length, 'ninguna petición de red', externos.slice(0, 3).join(' · '));
  comprobar(!excepciones.length, 'ninguna excepción en la página', excepciones.slice(0, 3).join(' | '));
} catch (e) {
  comprobar(false, 'la prueba revienta antes de terminar', e?.stack ?? e);
} finally {
  try { ws?.close(); } catch { /* cerrado */ }
  chrome.kill();
  await wait(300);
  await rm(temporal, { recursive: true, force: true }).catch(() => {});
}

console.log(`\n${casos - fallos}/${casos} comprobaciones`);
process.exitCode = fallos ? 1 : 0;
