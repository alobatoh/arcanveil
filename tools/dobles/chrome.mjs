/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCANVEIL · tools/dobles/chrome.mjs
 * ---------------------------------------------------------------------------
 * Un Chrome sin ventana y el servidor del juego, para las pruebas de
 * navegador que no son la regresión (auditoría de UX, diagnóstico de
 * arranque). Perfil temporal que se borra al cerrar; puertos propios para no
 * chocar con la regresión; nada sale de este equipo.
 *
 * A diferencia de la regresión, aquí las barras de desplazamiento SE DIBUJAN
 * (sin `--hide-scrollbars`): lo que se quiere mirar es justo eso.
 *
 * Cada pestaña apunta lo que le pasa: excepciones, consola, y de cada
 * petición que falla, QUÉ ruta era, quién la pidió y con qué error (solo
 * rutas y tipos; ni cuerpos ni cabeceras).
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

function buscarChrome() {
  if (process.env.CHROME_BIN) return process.env.CHROME_BIN;
  const candidatos = {
    win32: [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      `${process.env.LOCALAPPDATA ?? ''}\\Google\\Chrome\\Application\\chrome.exe`,
    ],
    darwin: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium'],
  }[process.platform] ?? ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'];
  for (const c of candidatos) {
    if (!c.includes('/') && !c.includes('\\')) return c;
    if (existsSync(c)) return c;
  }
  throw new Error('No encuentro Chrome. Indícalo con CHROME_BIN=/ruta/a/chrome');
}

async function json(url, init) {
  for (let i = 0; i < 150; i++) {
    try { const r = await fetch(url, init); if (r.ok) { const t = await r.text(); try { return JSON.parse(t); } catch { return t; } } } catch { /* aún no */ }
    await esperar(100);
  }
  throw new Error(`No responde ${url}`);
}

/** Un canal CDP sobre un WebSocket. */
async function canal(url, alEvento = () => {}) {
  const s = new WebSocket(url);
  await new Promise((ok, mal) => { s.onopen = ok; s.onerror = () => mal(new Error(`no se pudo abrir ${url}`)); });
  let n = 0;
  const esperan = new Map();
  s.onmessage = ({ data }) => {
    const m = JSON.parse(data);
    if (m.id && esperan.has(m.id)) { const p = esperan.get(m.id); esperan.delete(m.id); if (m.error) p.reject(new Error(m.error.message)); else p.resolve(m.result); return; }
    alEvento(m, (method, params = {}) => s.send(JSON.stringify({ id: ++n, method, params })));
  };
  const enviar = (method, params = {}) => new Promise((resolve, reject) => { const id = ++n; esperan.set(id, { resolve, reject }); s.send(JSON.stringify({ id, method, params })); });
  return { enviar, cerrar: () => { try { s.close(); } catch { /* cerrado */ } }, alCerrar: (fn) => s.addEventListener('close', fn) };
}

/**
 * Arranca el servidor del juego y un Chrome sin ventana.
 *
 * @param {Object} [o]
 * @param {number} [o.puerto=8791] Del servidor del juego.
 * @param {number} [o.depuracion=9241] De Chrome.
 * @param {string} [o.capturas] Carpeta donde dejar las capturas (si se piden).
 */
export async function lanzar({ puerto = 8791, depuracion = 9241, capturas = null } = {}) {
  const raiz = process.cwd();
  const perfil = await mkdtemp(join(tmpdir(), 'arcanveil-ux-'));
  const hijos = [];
  const arrancar = (cmd, args) => { const p = spawn(cmd, args, { cwd: raiz, stdio: ['ignore', 'pipe', 'pipe'] }); hijos.push(p); return p; };
  arrancar(process.execPath, ['tools/servir.mjs', '--puerto', String(puerto)]);
  arrancar(buscarChrome(), ['--headless=new', '--no-sandbox', '--disable-gpu', '--window-size=1366,768', `--remote-debugging-port=${depuracion}`, `--user-data-dir=${perfil}`, 'about:blank']);
  const origen = `http://127.0.0.1:${puerto}`;
  const app = `${origen}/app/index.html`;
  await json(app);
  const version = await json(`http://127.0.0.1:${depuracion}/json/version`);
  const nav = await canal(version.webSocketDebuggerUrl);
  let pestanas = 0;

  /** Un contexto aislado: sus pestañas comparten almacenamiento entre sí y con nadie más. */
  async function contexto() {
    const { browserContextId } = await nav.enviar('Target.createBrowserContext', {});
    return { id: browserContextId, cerrar: () => nav.enviar('Target.disposeBrowserContext', { browserContextId }).catch(() => {}) };
  }

  /**
   * Abre una pestaña.
   * @param {Object} [op]
   * @param {string} [op.url]
   * @param {Object} [op.contexto] De `contexto()`; si falta, uno nuevo (almacenamiento limpio).
   * @param {number} [op.ancho] @param {number} [op.alto] @param {boolean} [op.movil] @param {number} [op.zoom=1]
   * @param {boolean} [op.aMediaCarga] La pestaña nace YA navegando y el tamaño
   *   se le aplica después, a media carga (como abre sus auxiliares la regresión).
   */
  async function abrir({ url = app, contexto: ctx = null, ancho = 1366, alto = 768, movil = false, zoom = 1, aMediaCarga = false } = {}) {
    const numero = ++pestanas;
    const propio = ctx ?? await contexto();
    const { targetId } = await nav.enviar('Target.createTarget', { url: aMediaCarga && url ? url : 'about:blank', browserContextId: propio.id });
    const eventos = [];
    const incidencias = [];
    const dialogos = [];
    const peticiones = new Map();
    let aceptar = false;
    const ruta = (u) => { try { const x = new URL(u); return x.origin === origen ? x.pathname : `${x.origin}${x.pathname}`; } catch { return String(u).slice(0, 80); } };
    const apuntar = (x) => { incidencias.push({ ...x, t: Date.now() }); if (incidencias.length > 200) incidencias.shift(); };
    const c = await canal(`ws://127.0.0.1:${depuracion}/devtools/page/${targetId}`, (m, responder) => {
      const p = m.params ?? {};
      if (m.method === 'Page.frameNavigated' || m.method === 'Page.loadEventFired') eventos.push({ method: m.method, url: p.frame?.url ?? null, t: Date.now() });
      else if (m.method === 'Runtime.exceptionThrown') apuntar({ tipo: 'excepción', texto: String(p.exceptionDetails?.exception?.description ?? p.exceptionDetails?.text ?? '').slice(0, 240) });
      else if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(p.type)) apuntar({ tipo: `consola ${p.type}`, texto: (p.args ?? []).map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 240) });
      else if (m.method === 'Network.requestWillBeSent') {
        const ini = p.initiator ?? {};
        peticiones.set(p.requestId, { url: ruta(p.request.url), por: ini.type ?? null, desde: ini.url ? ruta(ini.url) : (ini.stack?.callFrames?.[0]?.url ? ruta(ini.stack.callFrames[0].url) : null) });
      } else if (m.method === 'Network.loadingFailed') apuntar({ tipo: 'red', texto: `${p.errorText}${p.canceled ? ' (cancelada)' : ''}${p.blockedReason ? ` (${p.blockedReason})` : ''}`, recurso: p.type ?? null, ...(peticiones.get(p.requestId) ?? { url: '(no vista)' }) });
      else if (m.method === 'Network.responseReceived' && p.response.status >= 400) apuntar({ tipo: 'red', texto: `HTTP ${p.response.status}`, recurso: p.type ?? null, ...(peticiones.get(p.requestId) ?? { url: ruta(p.response.url) }) });
      else if (m.method === 'Page.javascriptDialogOpening') { dialogos.push({ tipo: p.type, mensaje: p.message, aceptado: aceptar }); responder('Page.handleJavaScriptDialog', { accept: aceptar }); }
    });
    const { enviar } = c;
    await enviar('Runtime.enable'); await enviar('Page.enable'); await enviar('Network.enable');
    // El zoom del navegador (Ctrl +) equivale a un viewport más pequeño en píxeles CSS.
    await enviar('Emulation.setDeviceMetricsOverride', { width: Math.round(ancho / zoom), height: Math.round(alto / zoom), deviceScaleFactor: zoom, mobile: movil });
    if (movil) await enviar('Emulation.setTouchEmulationEnabled', { enabled: true });
    const ev = async (expression) => {
      const r = await enviar('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(`pestaña ${numero}: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
      return r.result?.value;
    };
    const hasta = async (expression, ms = 15000) => {
      const t0 = Date.now();
      let ultimo = null;
      while (Date.now() - t0 < ms) {
        try { if (await ev(`Boolean(${expression})`)) return; ultimo = null; } catch (e) { ultimo = e.message; }
        await esperar(80);
      }
      throw new Error(`pestaña ${numero}: tiempo agotado (${ms} ms) esperando ${expression}${ultimo ? ` · ${ultimo}` : ''}\n  incidencias: ${JSON.stringify(incidencias.slice(-12))}`);
    };
    const foto = async (nombre) => {
      if (!capturas) return null;
      await mkdir(capturas, { recursive: true });
      await enviar('Page.bringToFront').catch(() => {});
      await esperar(350);
      const r = await enviar('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      await writeFile(join(capturas, nombre), Buffer.from(r.data, 'base64'));
      return nombre;
    };
    const navegar = async (destino = url) => { await enviar('Page.navigate', { url: destino }); };
    if (url && !aMediaCarga) await navegar(url);
    return {
      numero, ev, hasta, enviar, foto, navegar, eventos, incidencias, dialogos, peticiones,
      responder: (si) => { aceptar = Boolean(si); },
      /** Bloquea (o deja de bloquear) las peticiones a esas URL: fixture de «no hay red para esto». */
      bloquear: (patrones) => enviar('Network.setBlockedURLs', { urls: patrones }),
      /** Pulsa una tecla de verdad (no un evento sintético). */
      tecla: async (key, code = key, vk = 0) => { await enviar('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk }); await enviar('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk }); },
      /** Un toque (táctil) o clic en el centro de un elemento. */
      tocar: async (selector) => {
        const caja = await ev(`(() => { const n = document.querySelector(${JSON.stringify(selector)}); if (!n) return null; n.scrollIntoView({ block: 'center' }); const r = n.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
        if (!caja) throw new Error(`pestaña ${numero}: no está ${selector}`);
        if (movil) {
          await enviar('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: caja.x, y: caja.y }] });
          await enviar('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        } else {
          await enviar('Input.dispatchMouseEvent', { type: 'mousePressed', x: caja.x, y: caja.y, button: 'left', clickCount: 1 });
          await enviar('Input.dispatchMouseEvent', { type: 'mouseReleased', x: caja.x, y: caja.y, button: 'left', clickCount: 1 });
        }
      },
      contexto: propio,
      cerrar: async () => { c.cerrar(); await nav.enviar('Target.closeTarget', { targetId }).catch(() => {}); if (!ctx) await propio.cerrar(); },
    };
  }

  async function cerrar() {
    nav.cerrar();
    for (const p of hijos) { try { p.kill('SIGTERM'); } catch { /* ya */ } }
    await esperar(400);
    for (let i = 0; i < 6; i++) { try { await rm(perfil, { recursive: true, force: true }); break; } catch { await esperar(200); } }
  }
  process.on('SIGINT', () => cerrar().finally(() => process.exit(130)));
  process.on('SIGTERM', () => cerrar().finally(() => process.exit(143)));

  return { origen, app, abrir, contexto, cerrar, esperar };
}

export default { lanzar };
