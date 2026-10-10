#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCANVEIL · tools/diagnosticar-arranque.mjs
 * ---------------------------------------------------------------------------
 * Intenta REPRODUCIR el arranque que se queda en «Preparando el motor…»
 * (visto de forma intermitente en pestañas auxiliares de la regresión: el
 * documento carga, `ARCANVEIL` no existe y hay peticiones abortadas) y, si
 * ocurre, deja la evidencia: qué archivo no llegó, quién lo pidió, con qué
 * error, si `app.js` llegó a ejecutarse y qué trabajador de servicio mandaba.
 *
 * No arregla nada ni reintenta: abre pestañas y mira. Tres situaciones, en
 * un perfil temporal y con todas las pestañas en el MISMO almacenamiento:
 *   A. recién instalado: pestañas que se abren mientras el trabajador de
 *      servicio se instala y toma el control;
 *   B. con la pestaña principal recargando a la vez;
 *   C. en reposo, con el trabajador ya activo;
 *   D. como las abre la regresión: la pestaña nace ya navegando y el tamaño
 *      (móvil) se le aplica a media carga.
 *
 *   node tools/diagnosticar-arranque.mjs            (12 pestañas por situación)
 *   node tools/diagnosticar-arranque.mjs --n 30
 *   node tools/diagnosticar-arranque.mjs --escritorio
 *
 * Sale con 1 si alguna pestaña no arrancó (con su evidencia); con 0 si
 * arrancaron todas, que NO prueba que el fallo no exista.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { lanzar } from './dobles/chrome.mjs';

const N = Number(process.argv[process.argv.indexOf('--n') + 1]) || 12;
const movil = !process.argv.includes('--escritorio');
const tam = movil ? { ancho: 390, alto: 844, movil: true } : { ancho: 1440, alto: 900 };
const PLAZO = 15000;
const LISTA = 'window.ARCANVEIL?.motor?.listo && document.body.classList.contains("esta-listo")';
const ESTADO = `(() => ({ url: location.href, readyState: document.readyState, arcanveil: typeof window.ARCANVEIL, rotulo: document.getElementById('arranque-texto')?.textContent ?? null,
  arranque: window.__arcanveilArranque ? { fase: window.__arcanveilArranque.fase, fallidos: window.__arcanveilArranque.fallidos } : null,
  sw: navigator.serviceWorker?.controller ? navigator.serviceWorker.controller.state : 'sin controlador',
  recursos: performance.getEntriesByType('resource').length }))()`;

const c = await lanzar({ puerto: 8793, depuracion: 9243 });
const fallos = [];
const tiempos = [];
let abiertas = 0;

async function probar(situacion, ctx, alAbrir = null, extra = {}) {
  const t0 = Date.now();
  const p = await c.abrir({ contexto: ctx, ...tam, ...extra });
  abiertas += 1;
  if (alAbrir) await alAbrir();
  try {
    await p.hasta(LISTA, PLAZO);
    tiempos.push(Date.now() - t0);
  } catch {
    let estado = null;
    try { estado = await p.ev(ESTADO); } catch (e) { estado = { sinEstado: e.message }; }
    fallos.push({ situacion, ms: Date.now() - t0, estado, red: p.incidencias.filter((x) => x.tipo === 'red').slice(-25), otras: p.incidencias.filter((x) => x.tipo !== 'red').slice(-8), navegaciones: p.eventos.filter((e) => e.method === 'Page.frameNavigated').map((e) => e.url) });
  } finally { await p.cerrar(); }
}

try {
  // A · perfil recién estrenado: la primera pestaña instala el trabajador y las demás llegan a la vez.
  const ctxA = await c.contexto();
  const principal = await c.abrir({ contexto: ctxA, ...tam });
  await Promise.all(Array.from({ length: N }, (_, i) => c.esperar(i * 120).then(() => probar('A · durante la instalación', ctxA))));
  await principal.hasta(LISTA, PLAZO).catch(() => fallos.push({ situacion: 'A · principal', estado: 'no arrancó' }));

  // B · la principal recarga mientras se abren las auxiliares (y con fixtures de almacenamiento, como en la regresión).
  for (let i = 0; i < N; i++) {
    await probar('B · principal recargando', ctxA, async () => { principal.enviar('Page.reload', {}).catch(() => {}); });
    await principal.hasta(LISTA, PLAZO).catch(() => {});
  }

  // C · en reposo.
  for (let i = 0; i < N; i++) await probar('C · en reposo', ctxA);

  // D · al estilo de la regresión, solas y con la principal recargando.
  for (let i = 0; i < N; i++) await probar('D · tamaño a media carga', ctxA, null, { aMediaCarga: true });
  for (let i = 0; i < N; i++) {
    await probar('D · tamaño a media carga + principal recargando', ctxA, async () => { principal.enviar('Page.reload', {}).catch(() => {}); }, { aMediaCarga: true });
    await principal.hasta(LISTA, PLAZO).catch(() => {});
  }

  await principal.cerrar();
  await ctxA.cerrar();
} finally {
  await c.cerrar();
}

tiempos.sort((a, b) => a - b);
console.log(`Pestañas abiertas: ${abiertas} (${movil ? 'móvil 390×844' : 'escritorio 1440×900'}, ${N} por situación)`);
console.log(`Arrancaron: ${tiempos.length} · mediana ${tiempos[Math.floor(tiempos.length / 2)] ?? '—'} ms · la más lenta ${tiempos.at(-1) ?? '—'} ms`);
if (!fallos.length) {
  console.log('Ninguna se quedó sin arrancar. No se ha reproducido: sigue pendiente (esto no prueba que no exista).');
} else {
  console.log(`\nSIN ARRANCAR: ${fallos.length}`);
  for (const f of fallos) console.log(JSON.stringify(f, null, 1));
}
process.exitCode = fallos.length ? 1 : 0;
