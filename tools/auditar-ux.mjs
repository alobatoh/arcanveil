#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCANVEIL · tools/auditar-ux.mjs
 * ---------------------------------------------------------------------------
 * Encargo #12 del 10-oct-2026: la primera partida se entiende, el personaje
 * lo elige el jugador y hay una imagen útil aunque el equipo no tenga
 * generador. En Chrome de verdad (sin ventana), con las barras de
 * desplazamiento dibujadas, y con capturas para MIRARLAS: las medidas y el
 * DOM no bastan para aprobar una pantalla.
 *
 * Casos (los del encargo):
 *   A. PC 1366×768 sin puente: elegir linaje, oficio y pasado exactos,
 *      textos, intensidad, imagen local, revisar y empezar. Sin dado.
 *   B. Volver, avanzar y editar conservan todo; «Crear otro» no pisa; el
 *      error enfoca su campo; el dado no toca lo elegido.
 *   C. Puente con proveedor falso: disponibilidad antes de prometer, pintar,
 *      otra versión, usar, recarga y sin red. (Mecánica, no estética: el
 *      proveedor falso devuelve un PNG de 1×1.)
 *   D. Sin puente, otro programa, sin CORS, proveedor caído, sin clave,
 *      sondeo colgado, respuesta vieja, generación cancelada o fallida,
 *      galería que no deja guardar.
 *   E. Leer el historial mientras acaba un turno.
 *   F. 20 turnos: presente, lugar y entrada identificables; los paneles
 *      vuelven a la misma lectura.
 *   G. Tamaños: 1366×768, 1440×900, 1024×768, 390×844, 320×568, zoom 200 %
 *      y letra grande; teclado, Escape y toque.
 *   H. Narración larga, bolsa grande, combate con tres rivales, doble clic.
 *   I. Partida guardada sin imagen y ficha antigua sin `aspecto`.
 *   J. Sondeo del generador colgado (en Node y en el navegador).
 *   Y el arranque: si un archivo del juego no llega, se dice.
 *
 * El caso K del encargo (playtest) no es una prueba automática: está en el
 * informe.
 *
 *   node tools/auditar-ux.mjs                     (capturas en dist/ux-creacion)
 *   node tools/auditar-ux.mjs --salida dist/otra
 *   node tools/auditar-ux.mjs --solo G            (solo los casos que empiezan así; E, F y H necesitan A)
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { lanzar } from './dobles/chrome.mjs';
import { crearPersonajeUI } from './dobles/creacion-ui.mjs';
import { crearProxyImagen, PUERTO_IMAGEN } from './imagen-local-proxy.mjs';
import { previsualizar } from '../src/player/CharacterFactory.js';
import { estadoGenerador } from '../src/art/candidata.js';

const salida = resolve(process.argv.includes('--salida') ? process.argv[process.argv.indexOf('--salida') + 1] : 'dist/ux-creacion');
let fallos = 0;
let casos = 0;
function comprobar(bien, texto, detalle = '') {
  casos += 1;
  if (bien) console.log(`OK   ${texto}`);
  else { fallos += 1; console.log(`MAL  ${texto}`); if (detalle) console.log(`     ${String(detalle).replace(/\n/g, ' | ').slice(0, 900)}`); }
}
const solo = process.argv.includes('--solo') ? process.argv[process.argv.indexOf('--solo') + 1].split(',') : null;
async function caso(nombre, fn) {
  if (solo && !solo.some((s) => nombre.startsWith(s))) return;
  console.log(`\n── ${nombre} ──`);
  const t0 = Date.now();
  try { await fn(); } catch (e) { comprobar(false, 'el caso revienta antes de terminar', String(e?.message ?? e)); }
  console.log(`     (${Math.round((Date.now() - t0) / 1000)} s)`);
}
const tic = (ms) => new Promise((r) => setTimeout(r, ms));
/** Dos objetos con las mismas claves y valores, en el orden que sea. */
const igual = (a, b) => JSON.stringify(Object.entries(a ?? {}).sort()) === JSON.stringify(Object.entries(b ?? {}).sort());
const PNG_1X1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

const c = await lanzar({ puerto: 8791, depuracion: 9241, capturas: salida });
const cacheImagen = await mkdtemp(join(tmpdir(), 'arcanveil-ux-img-'));
const servidores = new Set();
/** Un servidor cualquiera en el puerto del generador (para los estados de D). */
function ocuparPuerto(manejar) {
  const s = createServer(manejar);
  servidores.add(s);
  return new Promise((ok, mal) => { s.once('error', mal); s.listen(PUERTO_IMAGEN, '127.0.0.1', () => ok({ cerrar: () => new Promise((r) => { servidores.delete(s); s.closeAllConnections?.(); s.close(() => r()); }) })); });
}
function puente(proveedor) {
  const p = crearProxyImagen({ origen: c.origen, cache: cacheImagen, proveedor });
  return p.escuchar().then(() => p);
}

const LISTA = 'window.ARCANVEIL?.motor?.listo && document.body.classList.contains("esta-listo")';
const PASO = `document.querySelector('[data-pantalla="creacion"]')?.dataset.paso`;
const GALERIA = `new Promise((ok) => { const p = indexedDB.open('arcanveil-imagenes'); p.onsuccess = () => { const d = p.result; if (!d.objectStoreNames.contains('aprobadas')) { d.close(); return ok([]); } const q = d.transaction('aprobadas').objectStore('aprobadas').getAll(); q.onsuccess = () => { d.close(); ok(q.result.map((r) => ({ clave: r.clave, estilo: r.estilo, bytes: r.blob.size, tipo: r.blob.type }))); }; q.onerror = () => { d.close(); ok([]); }; }; p.onerror = () => ok([]); })`;
/** Lo que mide una pantalla: desbordes y si los controles esenciales están a la vista. */
const MEDIDAS = `(() => {
  const dentro = (q) => { const n = document.querySelector(q); if (!n || n.offsetParent === null) return null; const r = n.getBoundingClientRect(); return r.top >= -1 && r.left >= -1 && r.bottom <= innerHeight + 1 && r.right <= innerWidth + 1; };
  const desplazables = [...document.querySelectorAll('*')].filter((n) => { if (n.offsetParent === null && n !== document.body) return false; const e = getComputedStyle(n); return /(auto|scroll)/.test(e.overflowY) && n.scrollHeight > n.clientHeight + 2 && n.clientHeight > 30; })
    .map((n) => ({ id: n.id || n.className.split(' ')[0], rotulo: n.getAttribute('aria-label') || (n.getAttribute('aria-labelledby') ? document.getElementById(n.getAttribute('aria-labelledby'))?.textContent?.trim() : '') || '', rol: n.getAttribute('role') ?? '', foco: n.tabIndex >= 0 }));
  return { ancho: innerWidth, alto: innerHeight, horizontal: document.documentElement.scrollWidth > innerWidth + 1, pagina: document.documentElement.scrollHeight > innerHeight + 1, desplazables,
    siguiente: dentro('#creacion-siguiente'), empezar: dentro('#creacion-empezar'), entrada: dentro('#entrada'), actuar: dentro('#enviar') };
})()`;
const sinRotulo = (m) => m.desplazables.filter((d) => !d.rotulo || !d.foco);

/** Espera a que acaben las animaciones de entrada (las medidas a media animación no valen). */
const quieta = async (p) => { await p.enviar('Page.bringToFront').catch(() => {}); return p.ev(`(async () => { for (let i = 0; i < 40; i++) { if (!document.getAnimations().some((a) => a.playState === 'running' && Number.isFinite(a.effect?.getComputedTiming?.().endTime ?? Infinity) && (a.effect?.getTiming?.().iterations ?? 1) !== Infinity)) return true; await new Promise((r) => setTimeout(r, 50)); } return false; })()`); };

async function pestana(op = {}) {
  const p = await c.abrir(op);
  // Al frente: en un Chrome sin ventana, una pestaña de fondo no avanza sus animaciones.
  await p.enviar('Page.bringToFront').catch(() => {});
  await p.hasta(LISTA);
  // Las capturas, con la pantalla quieta: a media animación de entrada salen veladas.
  const foto = p.foto;
  p.foto = async (...a) => { await quieta(p).catch(() => {}); return foto(...a); };
  return p;
}
/** De la portada a la creación (personaje nuevo). */
async function aCreacion(p) {
  await p.ev(`document.querySelector('#inicio-jugar')?.click(); document.querySelector('#menu-nueva').click(); true`);
  await p.hasta('["herencia", "personajes", "creacion"].includes(document.body.dataset.activeScreen)', 8000);
  if (await p.ev(`document.body.dataset.activeScreen === 'herencia'`)) { await p.ev(`document.querySelector('#herencia-sin').click(); true`); await p.hasta('["personajes", "creacion"].includes(document.body.dataset.activeScreen)'); }
  if (await p.ev(`document.body.dataset.activeScreen === 'personajes'`)) {
    await p.ev(`document.querySelector('#personajes-otro')?.click(); true`);
    await p.hasta('document.querySelector("#personajes-nuevo")');
    await p.ev(`document.querySelector('#personajes-nuevo').click(); true`);
  }
  await p.hasta(`${PASO} === 'origen'`);
  await quieta(p);
}
async function empezar(p) {
  await p.ev(`document.querySelector('#creacion-empezar').click(); true`);
  await p.hasta('document.body.dataset.activeScreen === "juego" && ARCANVEIL.ver("meta.ranura") && !ARCANVEIL.sistema("turns")._ocupado', 25000);
  await p.ev(`ARCANVEIL.interfaz.completarEscritura(); Promise.resolve(ARCANVEIL.sistema('saves').drenar?.(15000)).then(() => true)`);
}
const jugar = (p, texto) => p.ev(`ARCANVEIL.jugar(${JSON.stringify(texto)}).then(() => { ARCANVEIL.interfaz.completarEscritura(); return true; })`);
/** Abre «la imagen del personaje» en partida y, si se pide, comprueba el generador. */
async function abrirImagen(p, { comprobar: mirar = false } = {}) {
  await p.ev(`document.querySelector('#pj-pintar').click(); true`);
  await p.hasta('document.querySelector("#imagen-dialogo[open]") && document.querySelector("#aspecto")');
  if (mirar) {
    await p.ev(`document.querySelector('#aspecto-comprobar').click(); true`);
    await p.hasta('!["desconocido", "buscando"].includes(document.querySelector("#aspecto-generador")?.dataset.estado)', 9000);
  }
  return p.ev(`({ estado: document.querySelector('#aspecto-generador').dataset.estado, opcion: document.querySelector('#aspecto-modo-pintado').textContent, apagada: document.querySelector('#aspecto-modo-pintado').getAttribute('aria-disabled') === 'true', texto: document.querySelector('#imagen-dialogo').innerText, dibujo: Boolean(document.querySelector('#imagen-vista svg')) })`);
}
const cerrarImagen = async (p) => { await p.ev(`document.querySelector('#estudio-cerrar')?.click(); document.querySelector('#imagen-cerrar')?.click(); true`); await p.hasta('!document.querySelector("#imagen-dialogo") && !document.querySelector("#estudio")', 5000); };
const alGenerador = (p) => [...p.peticiones.values()].filter((x) => new RegExp(`:${PUERTO_IMAGEN}`).test(x.url)).length;

/* ═══════════════════════════════════════════════════════════════════════ */

let contextoA = null;      // el personaje de A sigue vivo para E, F y H
let pA = null;

await caso('J · El sondeo del generador con plazo (Node)', async () => {
  // Un `fetch` que no contesta nunca y solo termina si se le aborta.
  let senal = null;
  const colgado = (_, op = {}) => new Promise((_, mal) => { senal = op.signal ?? null; op.signal?.addEventListener('abort', () => mal(Object.assign(new Error('abortada'), { name: 'AbortError' }))); });
  const t0 = Date.now();
  // (La guarda de 2,5 s es de la PRUEBA: en la base el sondeo no termina nunca.)
  const r = await Promise.race([estadoGenerador({ fetch: colgado, plazo: 300 }), tic(2500).then(() => ({ sigueColgado: true }))]);
  const ms = Date.now() - t0;
  comprobar(r.estado === 'timeout' && r.ok === false && senal?.aborted === true && ms >= 290 && ms < 1500 && r.envia === undefined,
    `un sondeo colgado termina en su plazo (${ms} ms), con la petición ABORTADA y sin afirmar destino`, JSON.stringify({ r, abortada: senal?.aborted ?? null, ms }));
  // Aunque el `fetch` ignore la señal (ni contesta ni atiende al aborto).
  const sordo = () => new Promise(() => {});
  const r2 = await Promise.race([estadoGenerador({ fetch: sordo, plazo: 300 }), tic(2500).then(() => ({ sigueColgado: true }))]);
  comprobar(r2.estado === 'timeout', 'y aunque el fetch no atienda al aborto, la espera termina', JSON.stringify(r2));
  // Quien llama cancela (cerrar la ventana): no es un «tiempo agotado».
  const ctl = new AbortController();
  const p3 = Promise.race([estadoGenerador({ fetch: colgado, plazo: 5000, signal: ctl.signal }), tic(2500).then(() => ({ sigueColgado: true }))]);
  await tic(60); ctl.abort();
  const r3 = await p3;
  comprobar(r3.estado === 'cancelada', 'cancelar desde fuera corta el sondeo («cancelada», no «tiempo agotado»)', JSON.stringify(r3));
});

await caso('Arranque · si un archivo del juego no llega, se dice (y se puede recargar)', async () => {
  const p = await c.abrir({ url: null });
  await p.bloquear(['*/src/world/Travel.js']);
  await p.navegar(c.app);
  let estado = null;
  for (let i = 0; i < 60; i++) { await tic(250); estado = await p.ev(`({ rotulo: document.getElementById('arranque-texto')?.textContent ?? '', detalle: document.getElementById('arranque-detalle')?.textContent ?? '', recargar: document.getElementById('arranque-recargar') ? !document.getElementById('arranque-recargar').hidden : false, fase: window.__arcanveilArranque?.fase ?? null, motor: typeof window.ARCANVEIL })`).catch(() => null); if (estado?.recargar) break; }
  await p.foto('00-arranque-archivo-perdido-1366x768.png');
  // (La página solo sabe que falló su módulo principal o alguno de los que usa: CUÁL lo dice la regresión por CDP.)
  comprobar(estado?.recargar === true && /no ha podido cargar/.test(estado.rotulo) && /app\.js o alguno de los archivos que usa/.test(estado.detalle) && estado.fase === 'modulo-fallido' && estado.motor === 'undefined',
    'con un módulo bloqueado: «no ha podido cargar», que faltan archivos y botón «Recargar» (no un «Preparando el motor…» eterno)', JSON.stringify(estado));
  const abortada = p.incidencias.find((x) => x.tipo === 'red' && /Travel\.js/.test(x.url ?? ''));
  comprobar(Boolean(abortada?.desde || abortada?.por), 'y el diagnóstico dice QUÉ archivo no llegó y quién lo pidió', JSON.stringify(abortada ?? p.incidencias.slice(-3)));
  await p.cerrar();
});

await caso('A · PC 1366×768 sin puente: elegir, escribir, imagen local, revisar y empezar', async () => {
  contextoA = await c.contexto();
  const p = pA = await pestana({ contexto: contextoA });
  await aCreacion(p);
  const origen = await p.ev(`({ listas: ['raza', 'clase', 'trasfondo'].map((k) => document.querySelector('#origen-' + k)?.options.length ?? 0), medidas: ${MEDIDAS} })`);
  comprobar(origen.listas.join() === '8,8,10', `hay selección explícita: ${origen.listas[0]} linajes, ${origen.listas[1]} oficios y ${origen.listas[2]} pasados`, JSON.stringify(origen.listas));
  const promesas = [];     // todo lo que la creación le dice al jugador, paso a paso
  const elegido = { raza: 'albar', clase: 'glifista', trasfondo: 'erudito' };
  await p.ev(crearPersonajeUI({ ...elegido, nombre: 'x', descripcion: 'x', lore: 'x', hasta: 'origen' }));
  const motor = previsualizar(elegido);
  const ficha = await p.ev(`({ vida: document.querySelector('#ficha-previa-vida').textContent, anima: document.querySelector('#ficha-previa-anima').textContent, oro: document.querySelector('#ficha-previa-oro').textContent, atributos: Object.fromEntries([...document.querySelectorAll('#ficha-previa [data-atributo]')].map((n) => [n.dataset.atributo, Number(n.querySelector('strong').textContent)])), efecto: document.querySelector('#origen-raza-explica').textContent, fijos: document.querySelectorAll('.origen__fijo[data-soltar]').length, medidas: ${MEDIDAS} })`);
  comprobar(Number(ficha.vida) === motor.vida && Number(ficha.anima) === motor.mana && Number(ficha.oro) === motor.oro && igual(ficha.atributos, motor.atributos),
    `la ficha de pantalla es la del motor (vida ${motor.vida}, ánima ${motor.mana}, oro ${motor.oro}, atributos iguales)`, JSON.stringify({ ficha, motor: { vida: motor.vida, mana: motor.mana, oro: motor.oro, atributos: motor.atributos } }));
  comprobar(/\+2 Intelecto/.test(ficha.efecto) && ficha.fijos === 3, 'cada elección explica su efecto en reglas y queda marcada como elegida por el jugador', ficha.efecto);
  // El atributo principal que anuncia el oficio tiene que ser el que sale más alto en la ficha (Albar suma en el mismo).
  const fuerte = await p.ev(`(() => { const dicho = (document.querySelector('#origen-clase-explica').textContent.match(/Atributo principal: (\\p{L}+)/u) ?? [])[1] ?? ''; const filas = [...document.querySelectorAll('#ficha-previa [data-atributo]')].map((n) => ({ nombre: n.querySelector('dt')?.textContent ?? n.textContent, valor: Number(n.querySelector('strong').textContent) })); const max = Math.max(...filas.map((f) => f.valor)); return { dicho, altos: filas.filter((f) => f.valor === max).map((f) => f.nombre) }; })()`);
  comprobar(fuerte.dicho.length > 0 && fuerte.altos.some((n) => n.includes(fuerte.dicho)) && !/Atributos fuertes/.test(await p.ev(`document.querySelector('#origen-clase-explica').textContent`)),
    `el atributo principal que anuncia el oficio (${fuerte.dicho}) es el más alto de la ficha, y ya no se anuncian «atributos fuertes» que la ficha desmiente`, JSON.stringify(fuerte));
  promesas.push(await p.ev(`document.querySelector('[data-pantalla="creacion"]').innerText`));
  comprobar(!ficha.medidas.horizontal && !ficha.medidas.pagina && ficha.medidas.siguiente === true && !ficha.medidas.desplazables.length, 'el paso «origen» cabe entero: sin desplazar nada y con «Siguiente» a la vista', JSON.stringify(ficha.medidas));
  await p.foto('A1-origen-1366x768.png');

  await p.ev(crearPersonajeUI({ nombre: 'Nerea', genero: 'f', lore: 'Dejó el archivo cuando empezaron a faltar páginas.', intensidad: 'implacable', descripcion: 'x', hasta: 'quien' }));
  const quien = await p.ev(MEDIDAS);
  comprobar(!quien.horizontal && !quien.pagina && quien.siguiente === true && !quien.desplazables.length, 'el paso «quién eres» cabe entero', JSON.stringify(quien));
  await p.foto('A2-quien-1366x768.png');

  await p.ev(crearPersonajeUI({ nombre: 'Nerea', genero: 'f', lore: 'Dejó el archivo cuando empezaron a faltar páginas.', intensidad: 'implacable', descripcion: 'maga de pelo rojo y ojos verdes, con capucha y un cuaderno', hasta: 'aspecto' }));
  await tic(500);
  const aspecto = await p.ev(`({ modo: document.querySelector('#aspecto').dataset.modo, dibujo: document.querySelector('#creacion-cara svg')?.outerHTML.length ?? 0, entendido: document.querySelector('#aspecto-entendido')?.textContent ?? '', pelo: document.querySelector('#aspecto-pelo').value, ojos: document.querySelector('#aspecto-ojos').value, capucha: document.querySelector('#aspecto-rasgo-capucha').checked, nota: document.querySelector('#aspecto-dibujo-nota').textContent, generador: document.querySelector('#aspecto-generador').dataset.estado, pintado: document.querySelector('#aspecto-modo-pintado').getAttribute('aria-disabled'), promesa: document.querySelector('[data-pantalla="creacion"]').innerText, medidas: ${MEDIDAS} })`);
  comprobar(aspecto.modo === 'dibujo' && aspecto.dibujo > 5000 && aspecto.pelo === 'rojo' && aspecto.ojos === 'verdes' && aspecto.capucha && /pelo rojo, ojos verdes, capucha/.test(aspecto.entendido),
    'sin generador hay una cara de verdad: el dibujo del juego, con lo que entendió de la descripción', JSON.stringify({ ...aspecto, promesa: undefined, medidas: undefined }));
  comprobar(/No es una IA/.test(aspecto.nota) && !/la IA pintará/i.test(aspecto.promesa) && aspecto.generador === 'desconocido' && aspecto.pintado !== 'true' && /lo normal es no tenerlo\. Pulsa para comprobarlo/.test(aspecto.promesa) && alGenerador(p) === 0,
    'no promete IA: dice que el dibujo no lo es, «pintar con IA» avisa de que hace falta un generador («pulsa para comprobarlo») y no se ha pedido NADA al generador', JSON.stringify({ nota: aspecto.nota, generador: aspecto.generador, peticiones: alGenerador(p) }));
  comprobar(!/node tools|IMAGEN_LOCAL|ComfyUI/.test(aspecto.promesa), 'sin comandos ni documentación técnica a la vista');
  comprobar(!aspecto.medidas.horizontal && !aspecto.medidas.pagina && aspecto.medidas.siguiente === true && !aspecto.medidas.desplazables.length, 'el paso «aspecto» cabe entero', JSON.stringify(aspecto.medidas));
  await p.foto('A3-aspecto-sin-generador-1366x768.png');
  // Los controles cambian LO QUE SE VE.
  const antes = await p.ev(`document.querySelector('#creacion-cara svg').outerHTML.replace(/(id="|url\\(#|href="#)[\\w-]+/g, '$1X')`);
  await p.ev(`(() => { const s = document.querySelector('#aspecto-pelo'); s.value = 'negro'; s.dispatchEvent(new Event('change', { bubbles: true })); document.querySelector('#aspecto-rasgo-cicatriz').click(); return true; })()`);
  const despues = await p.ev(`document.querySelector('#creacion-cara svg').outerHTML.replace(/(id="|url\\(#|href="#)[\\w-]+/g, '$1X')`);
  await p.ev(`document.querySelector('#aspecto-otra-cara').click(); true`);
  const otraCara = await p.ev(`document.querySelector('#creacion-cara svg').outerHTML.replace(/(id="|url\\(#|href="#)[\\w-]+/g, '$1X')`);
  comprobar(antes !== despues && despues !== otraCara && /retrato-rasgo--cicatriz/.test(despues), 'cambiar pelo, rasgos u «Otra cara» cambia la vista previa');
  await p.foto('A4-aspecto-editado-1366x768.png');

  await p.ev(`document.querySelector('#creacion-siguiente').click(); true`);
  await p.hasta(`${PASO} === 'revisar' && document.querySelector('#creacion-cara img')?.complete`, 12000);
  const revision = await p.ev(`(async () => ({ origen: document.querySelector('#revision-origen').textContent, partida: document.querySelector('#revision-partida').textContent, vida: document.querySelector('#ficha-revision-vida').textContent, imagen: document.querySelector('#creacion-cara img').naturalWidth, estado: document.querySelector('#retrato-estado').textContent, descripcion: document.querySelector('#revision-descripcion').textContent, historia: document.querySelector('#revision-historia').textContent, galeria: await ${GALERIA}, medidas: ${MEDIDAS} }))()`);
  comprobar(/Albar · Glifista · Erudito/.test(revision.origen) && /Brutal/.test(revision.partida) && /ella/.test(revision.partida) && Number(revision.vida) === motor.vida && /pelo rojo/.test(revision.descripcion) && /archivo/.test(revision.historia),
    'la revisión enseña lo elegido y lo escrito, con la ficha del motor', JSON.stringify({ ...revision, galeria: undefined, medidas: undefined }));
  comprobar(revision.imagen === 400 && /Dibujo del juego/.test(revision.estado) && /No es IA/.test(revision.estado) && revision.galeria.length === 1 && revision.galeria[0].estilo === 'dibujo-del-juego' && revision.galeria[0].tipo === 'image/png',
    'la imagen elegida es el dibujo, guardado como imagen del personaje y dicho como lo que es', JSON.stringify({ estado: revision.estado, galeria: revision.galeria }));
  comprobar(!revision.medidas.horizontal && !revision.medidas.pagina && revision.medidas.empezar === true && !sinRotulo(revision.medidas).length, 'la revisión no desplaza la página: «Comenzar partida» a la vista, y lo que se desplaza tiene nombre y se alcanza con el teclado', JSON.stringify(revision.medidas));
  const pregunta = await p.ev(`(() => { const dentro = (q) => { const n = document.querySelector(q); if (!n || n.offsetParent === null) return null; const r = n.getBoundingClientRect(); return r.top >= -1 && r.bottom <= innerHeight + 1 && r.left >= -1 && r.right <= innerWidth + 1; }; return { pregunta: dentro('.revelacion__pregunta'), caja: dentro('#revelacion-cambio') }; })()`);
  comprobar(pregunta.pregunta === true && pregunta.caja === true, 'en la revisión, la pregunta («¿te gusta así…?») y la caja para contestar están A LA VISTA, sin desplazar nada', JSON.stringify(pregunta));
  promesas.push(aspecto.promesa, await p.ev(`document.querySelector('[data-pantalla="creacion"]').innerText`));
  await p.foto('A5-revisar-1366x768.png');

  await empezar(p);
  // Lo que la creación promete del comienzo tiene que ser lo que pasa. (El
  // motor empieza todas las campañas en el mismo sitio: la creación no dice otro.)
  const comienzo = await p.ev(`({ rotulo: document.querySelector('#escena-rotulo .escena__lugar')?.textContent ?? '', real: ARCANVEIL.sistema('world').lugarActual()?.plantilla?.nombre ?? '' })`);
  const prometido = promesas.flatMap((t) => String(t).match(/empiezas en [^.\n·]+/gi) ?? []);
  comprobar(comienzo.rotulo === comienzo.real && comienzo.real.length > 0 && prometido.every((x) => x.toLowerCase().includes(comienzo.real.toLowerCase())),
    `la creación no promete un lugar de inicio distinto del real (empiezas en «${comienzo.real}»; prometido: ${prometido.length ? prometido.join(' | ') : 'nada'})`, JSON.stringify({ comienzo, prometido }));
  const jugado = await p.ev(`(() => { const j = ARCANVEIL.ver('player'); return { raza: j.raza, clase: j.clase, trasfondo: j.trasfondo, genero: j.genero, nombre: j.nombre, retrato: j.retrato, lore: j.lore, vida: j.vida.max, mana: j.mana?.max ?? 0, atributos: j.atributos, dificultad: ARCANVEIL.ver('settings.dificultad'), cara: Boolean(document.querySelector('#retrato-pj img.arte--aprobada')), ficha: Object.fromEntries([...document.querySelectorAll('#ficha-atributos [data-atributo]')].map((n) => [n.dataset.atributo, Number(n.querySelector('strong').textContent)])), origenFicha: document.querySelector('#ficha-origen')?.textContent, peticiones: 0 }; })()`);
  comprobar(jugado.raza === 'albar' && jugado.clase === 'glifista' && jugado.trasfondo === 'erudito' && jugado.genero === 'f' && jugado.nombre === 'Nerea' && jugado.dificultad === 'implacable' && jugado.vida === motor.vida && jugado.mana === motor.mana && igual(jugado.atributos, motor.atributos) && /pelo rojo/.test(jugado.retrato),
    'lo elegido llega al motor tal cual: linaje, oficio, pasado, trato, intensidad, vida, ánima y atributos', JSON.stringify(jugado));
  comprobar(jugado.cara && igual(jugado.ficha, motor.atributos) && /Albar · Glifista · Erudito/.test(jugado.origenFicha) && alGenerador(p) === 0,
    'en la partida se ve su cara y la ficha enseña los seis atributos del motor; el generador sigue sin tocarse', JSON.stringify({ ficha: jugado.ficha, motor: motor.atributos, peticiones: alGenerador(p) }));
  await p.foto('A6-partida-inicio-1366x768.png');
  // A 1366×768 (la pantalla de la queja) la ficha y el mapa se ven enteros: sin barra en el panel.
  const panelFicha = await p.ev(`(() => { const cu = document.querySelector('#lateral-cuerpo'); return { pestana: document.querySelector('#pestana-ficha').getAttribute('aria-selected'), desplaza: cu.scrollHeight > cu.clientHeight + 2, atributos: cu.querySelectorAll('[data-atributo]').length, filasPestanas: new Set([...document.querySelectorAll('.pestanas .pestana')].map((b) => Math.round(b.getBoundingClientRect().top))).size, cortadas: [...document.querySelectorAll('.pestanas .pestana')].filter((b) => b.scrollWidth > b.clientWidth + 1).map((b) => b.textContent) }; })()`);
  await p.ev(`document.querySelector('#pestana-mapa').click(); true`);
  await tic(150);
  const panelMapa = await p.ev(`(() => { const cu = document.querySelector('#lateral-cuerpo'); const cr = cu.getBoundingClientRect(); const ds = [...cu.querySelectorAll('.destino')]; return { desplaza: cu.scrollHeight > cu.clientHeight + 2, destinos: ds.length, enteros: ds.filter((d) => { const x = d.getBoundingClientRect(); return x.top >= cr.top - 1 && x.bottom <= cr.bottom + 1; }).length }; })()`);
  await p.foto('A7-panel-mapa-1366x768.png');
  await p.ev(`document.querySelector('#pestana-ficha').click(); true`);
  comprobar(panelFicha.pestana === 'true' && !panelFicha.desplaza && panelFicha.atributos === 6 && panelFicha.filasPestanas === 1 && !panelFicha.cortadas.length && panelMapa.destinos >= 2 && panelMapa.enteros === panelMapa.destinos && !panelMapa.desplaza,
    `a 1366×768 el panel derecho no desplaza: la ficha entera (6 atributos), las pestañas en una fila sin cortar y los ${panelMapa.destinos} destinos del mapa a la vista`, JSON.stringify({ panelFicha, panelMapa }));
});

await caso('B · Volver, avanzar, editar y «Crear otro»', async () => {
  const p = await pestana();
  await aCreacion(p);
  await p.ev(crearPersonajeUI({ raza: 'ferrano', clase: 'baluarte', trasfondo: 'soldado', nombre: 'Bruna', genero: 'f', lore: 'Sirvió en la muralla del norte.', intensidad: 'relato', descripcion: 'mujer ancha de barba trenzada y cicatriz', imagen: 'dibujo' }));
  const leerPjs = `JSON.parse(localStorage.getItem('arcanveil:personajes') ?? '[]').map((x) => ({ id: x.id, nombre: x.nombre, raza: x.raza, creado: x.creado, aspecto: x.aspecto }))`;
  const uno = await p.ev(`(async () => ({ pjs: ${leerPjs}, galeria: await ${GALERIA} }))()`);
  // Atrás hasta el origen: todo sigue.
  const vistos = {};
  for (const destino of ['aspecto', 'quien', 'origen']) {
    await p.ev(`document.querySelector('#creacion-volver').click(); true`);
    await p.hasta(`${PASO} === '${destino}'`);
    if (destino === 'aspecto') {
      vistos.aspecto = await p.ev(`({ descripcion: document.querySelector('#retrato-descripcion').value, modo: document.querySelector('#aspecto').dataset.modo, barba: document.querySelector('#aspecto-rasgo-barba').checked, cicatriz: document.querySelector('#aspecto-rasgo-cicatriz').checked, barbaFija: document.querySelector('#aspecto-rasgo-barba').disabled, barbaRotulo: document.querySelector('label[for="aspecto-rasgo-barba"]').textContent, cicatrizFija: document.querySelector('#aspecto-rasgo-cicatriz').disabled })`);
      // Ferrano se dibuja SIEMPRE con barba: la casilla no puede fingir que la quita o la pone.
      comprobar(vistos.aspecto.barbaFija && vistos.aspecto.barba && /de su linaje/.test(vistos.aspecto.barbaRotulo) && !vistos.aspecto.cicatrizFija, 'en un linaje que ya se dibuja con barba (Ferrano), «Barba» sale marcada, fija y dicha («de su linaje»); los demás rasgos siguen libres', JSON.stringify(vistos.aspecto));
      await p.foto('B0-aspecto-ferrano-1366x768.png');
    }
    if (destino === 'quien') vistos.quien = await p.ev(`({ nombre: document.querySelector('#nombre').value, lore: document.querySelector('#lore-personaje').value, intensidad: document.querySelector('#intensidad [aria-checked="true"]').dataset.intensidad, genero: document.querySelector('#trato [aria-checked="true"]').dataset.genero })`);
    if (destino === 'origen') vistos.origen = await p.ev(`['raza', 'clase', 'trasfondo'].map((k) => document.querySelector('#origen-' + k).value).join()`);
  }
  comprobar(vistos.aspecto.descripcion.startsWith('mujer ancha') && vistos.aspecto.modo === 'dibujo' && vistos.aspecto.barba && vistos.aspecto.cicatriz && vistos.quien.nombre === 'Bruna' && /muralla/.test(vistos.quien.lore) && vistos.quien.intensidad === 'relato' && vistos.quien.genero === 'f' && vistos.origen === 'ferrano,baluarte,soldado',
    'volver atrás por los tres pasos conserva origen, nombre, trato, historia, intensidad, descripción y aspecto', JSON.stringify(vistos));
  // El dado no toca lo elegido a mano ni lo escrito.
  for (let i = 0; i < 5; i++) await p.ev(`document.querySelector('#creacion-aleatorio')?.click(); true`);
  const trasDado = await p.ev(`({ origen: ['raza', 'clase', 'trasfondo'].map((k) => document.querySelector('#origen-' + k).value).join(), apagado: document.querySelector('#creacion-aleatorio').disabled, nota: document.querySelector('#creacion-aleatorio-nota').textContent })`);
  comprobar(trasDado.origen === 'ferrano,baluarte,soldado' && trasDado.apagado && /no queda nada que tirar/.test(trasDado.nota), 'el dado no toca lo elegido a mano (y dice que no queda nada que tirar)', JSON.stringify(trasDado));
  // Soltar una elección: el dado ya la puede cambiar, y se dice cuál.
  await p.ev(`document.querySelector('[data-soltar="trasfondo"]').click(); true`);
  const suelto = await p.ev(`({ apagado: document.querySelector('#creacion-aleatorio').disabled, nota: document.querySelector('#creacion-aleatorio-nota').textContent })`);
  const pasados = new Set();
  for (let i = 0; i < 8; i++) { await p.ev(`document.querySelector('#creacion-aleatorio').click(); true`); pasados.add(await p.ev(`['raza', 'clase', 'trasfondo'].map((k) => document.querySelector('#origen-' + k).value).join()`)); }
  comprobar(!suelto.apagado && /El dado tira: pasado\./.test(suelto.nota) && pasados.size > 1 && [...pasados].every((x) => x.startsWith('ferrano,baluarte,')), 'al soltar el pasado, el dado tira SOLO el pasado', JSON.stringify({ suelto, pasados: [...pasados] }));
  // Error en un paso que no está a la vista: lleva a él, enfoca el campo y no borra nada.
  await p.ev(`document.querySelector('#creacion-siguiente').click(); true`);
  await p.hasta(`${PASO} === 'quien'`);
  await p.ev(`(() => { const n = document.querySelector('#lore-personaje'); n.value = ''; n.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('#creacion-volver').click(); return true; })()`);
  await p.hasta(`${PASO} === 'origen'`);
  await p.ev(`document.querySelector('.paso[data-paso="revisar"]').click(); true`);
  await p.hasta(`document.querySelector('.campo__error')`);
  const error = await p.ev(`({ paso: ${PASO}, foco: document.activeElement.id, texto: document.querySelector('.campo__error').textContent, invalido: document.querySelector('#lore-personaje').getAttribute('aria-invalid'), nombre: document.querySelector('#nombre').value })`);
  comprobar(error.paso === 'quien' && error.foco === 'lore-personaje' && error.invalido === 'true' && /historia/.test(error.texto) && error.nombre === 'Bruna', 'saltar a «revisar» con la historia vacía: lleva al paso, enfoca el campo, lo dice y no borra el nombre', JSON.stringify(error));
  await p.foto('B1-error-enfocado-1366x768.png');
  await p.ev(`(() => { const n = document.querySelector('#lore-personaje'); n.value = 'Sirvió en la muralla del norte, y volvió.'; n.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('.paso[data-paso="revisar"]').click(); return true; })()`);
  await p.hasta(`${PASO} === 'aspecto' || ${PASO} === 'revisar'`);
  if (await p.ev(`${PASO} === 'aspecto'`)) { const d = await p.ev(`document.querySelector('#retrato-descripcion').value`); comprobar(d.startsWith('mujer ancha'), 'la descripción escrita sigue ahí tras el error', d); await p.ev(`document.querySelector('#creacion-siguiente').click(); true`); }
  await p.hasta(`${PASO} === 'revisar' && document.querySelector('#creacion-cara img')?.complete`, 12000);
  const dos = await p.ev(`(async () => ({ pjs: ${leerPjs}, galeria: await ${GALERIA}, historia: document.querySelector('#revision-historia').textContent }))()`);
  comprobar(dos.pjs.length === 1 && dos.pjs[0].id === uno.pjs[0].id && dos.pjs[0].creado === uno.pjs[0].creado && dos.galeria.length === 1 && dos.galeria[0].clave === uno.galeria[0].clave && /y volvió/.test(dos.historia),
    'editar el mismo personaje conserva su id, su fecha y su imagen: no nace un gemelo', JSON.stringify({ uno: uno.pjs, dos: dos.pjs }));
  // «Crear otro»: identidad nueva, el primero intacto.
  await p.ev(`document.querySelector('#creacion-otro').click(); true`);
  await p.hasta(`${PASO} === 'origen'`);
  await p.ev(crearPersonajeUI({ raza: 'menudo', nombre: 'Pim', lore: 'Vende mapas que no ha dibujado.', descripcion: 'menudo de sombrero ancho', imagen: 'ninguno' }));
  const tres = await p.ev(`(async () => ({ pjs: ${leerPjs}, galeria: await ${GALERIA} }))()`);
  const bruna = tres.pjs.find((x) => x.id === uno.pjs[0].id);
  comprobar(tres.pjs.length === 2 && bruna?.nombre === 'Bruna' && bruna.raza === 'ferrano' && tres.galeria.length === 1 && tres.galeria[0].clave === uno.galeria[0].clave, '«Crear otro» crea otra identidad y no pisa al primero ni su imagen', JSON.stringify(tres));
  await p.cerrar();
});

await caso('B2 · Salir de «Aspecto» hacia atrás conserva el dibujo editado y la imagen elegida', async () => {
  const p = await pestana();
  try {
    await aCreacion(p);
    await p.ev(crearPersonajeUI({ raza: 'valdes', nombre: 'Tomás', genero: 'm', lore: 'Guarda un puente que nadie cruza.', descripcion: 'hombre de pelo rubio y ojos azules', hasta: 'aspecto' }));
    await tic(500);
    const leer = `({ modo: document.querySelector('#aspecto').dataset.modo, pelo: document.querySelector('#aspecto-pelo')?.value ?? null, ojos: document.querySelector('#aspecto-ojos')?.value ?? null, cicatriz: document.querySelector('#aspecto-rasgo-cicatriz')?.checked ?? null, cara: document.querySelector('#creacion-cara svg')?.outerHTML.replace(/(id="|url\\(#|href="#)[\\w-]+/g, '$1X') ?? null, entendido: Boolean(document.querySelector('#aspecto-entendido')) })`;
    const propuesto = await p.ev(leer);
    await p.ev(`(() => { const s = document.querySelector('#aspecto-pelo'); s.value = 'negro'; s.dispatchEvent(new Event('change', { bubbles: true })); document.querySelector('#aspecto-rasgo-cicatriz').click(); document.querySelector('#aspecto-otra-cara').click(); document.querySelector('#aspecto-otra-cara').click(); return true; })()`);
    const editado = await p.ev(leer);
    comprobar(propuesto.pelo === 'rubio' && propuesto.entendido && editado.pelo === 'negro' && editado.cicatriz && editado.cara !== propuesto.cara && !editado.entendido,
      'al tocar los controles, el dibujo cambia y «ha entendido…» deja de decir lo que ya no se ve', JSON.stringify({ propuesto: { ...propuesto, cara: undefined }, editado: { ...editado, cara: undefined } }));
    // 1 · «Volver» SIN haber pasado por «Siguiente», y regresar.
    await p.ev(`document.querySelector('#creacion-volver').click(); true`);
    await p.hasta(`${PASO} === 'quien'`);
    await p.ev(`document.querySelector('#creacion-siguiente').click(); true`);
    await p.hasta(`${PASO} === 'aspecto' && document.querySelector('#creacion-cara svg')`);
    await tic(500);
    const vuelto = await p.ev(leer);
    comprobar(vuelto.modo === 'dibujo' && vuelto.pelo === 'negro' && vuelto.ojos === editado.ojos && vuelto.cicatriz === true && vuelto.cara === editado.cara,
      'volver a «Quién eres» y regresar: el dibujo sigue como lo dejaste (pelo, rasgo y cara), no como lo propuso la descripción', JSON.stringify({ vuelto: { ...vuelto, cara: undefined }, mismaCara: vuelto.cara === editado.cara }));
    // …y ese dibujo es el que se guarda al seguir (no el de antes).
    await p.ev(`document.querySelector('#creacion-siguiente').click(); true`);
    await p.hasta(`${PASO} === 'revisar' && document.querySelector('#creacion-cara img')?.complete`, 12000);
    const guardado = await p.ev(`({ aspecto: JSON.parse(localStorage.getItem('arcanveil:personajes'))[0].aspecto, estado: document.querySelector('#retrato-estado').textContent })`);
    comprobar(guardado.aspecto?.pelo === 'negro' && guardado.aspecto?.rasgos?.includes('cicatriz') && /Dibujo del juego/.test(guardado.estado), 'y al seguir se guarda ESE dibujo', JSON.stringify(guardado));
    // 2 · Elegir «Sin imagen», seguir, y volver: sigue «Sin imagen».
    await p.ev(`document.querySelector('#creacion-volver').click(); true`);
    await p.hasta(`${PASO} === 'aspecto'`);
    await p.ev(`document.querySelector('#aspecto-modo-ninguno').click(); document.querySelector('#creacion-siguiente').click(); true`);
    await p.hasta(`${PASO} === 'revisar' && !document.querySelector('#creacion-cara img')`, 12000);
    await p.ev(`document.querySelector('#creacion-volver').click(); true`);
    await p.hasta(`${PASO} === 'aspecto'`);
    await tic(300);
    const sinImagen = await p.ev(`(async () => ({ modo: document.querySelector('#aspecto').dataset.modo, marcada: document.querySelector('#aspecto-modo-ninguno').getAttribute('aria-checked'), galeria: (await ${GALERIA}).length }))()`);
    comprobar(sinImagen.modo === 'ninguno' && sinImagen.marcada === 'true' && sinImagen.galeria === 0, 'elegir «Sin imagen», seguir y volver: sigue marcado «Sin imagen» (no vuelve a proponer el dibujo)', JSON.stringify(sinImagen));
    // …y si ahora vuelve al dibujo, es el suyo.
    await p.ev(`document.querySelector('#aspecto-modo-dibujo').click(); true`);
    await tic(300);
    const otraVez = await p.ev(leer);
    comprobar(otraVez.modo === 'dibujo' && otraVez.pelo === 'negro' && otraVez.cicatriz === true, 'y al volver a «Dibujo del juego» recupera el que había editado', JSON.stringify({ ...otraVez, cara: undefined }));
    await p.foto('B2-aspecto-recordado-1366x768.png');
  } finally { await p.cerrar(); }
});

await caso('C · Con generador (proveedor falso): disponibilidad antes de prometer, pintar, otra, usar, recarga y sin red', async () => {
  const generadas = [];
  const pu = await puente({ id: 'comfyui', salud: async () => ({ disponible: true }), generar: async ({ semilla }) => { generadas.push(semilla); return { bytes: PNG_1X1, tipo: 'image/png' }; } });
  const p = await pestana();
  try {
    await aCreacion(p);
    await p.ev(crearPersonajeUI({ raza: 'valdes', nombre: 'Cira', lore: 'Aprendió a leer en un taller de tintes.', descripcion: 'mujer joven de manos manchadas de tinta azul', hasta: 'aspecto' }));
    const antes = await p.ev(`({ estado: document.querySelector('#aspecto-generador').dataset.estado, pintado: document.querySelector('#aspecto-modo-pintado').getAttribute('aria-disabled'), boton: Boolean(document.querySelector('#aspecto-pintar')) })`);
    comprobar(antes.estado === 'desconocido' && !antes.boton && alGenerador(p) === 0, 'aunque haya generador, no se ofrece pintar ni se le pide nada hasta que el jugador lo comprueba', JSON.stringify({ antes, peticiones: alGenerador(p) }));
    // Lo que hizo el jugador de la queja: pulsar «Retrato pintado con IA». Ese
    // clic ya no cae en vacío: comprueba el generador y, si lo hay, la elige.
    await p.ev(`document.querySelector('#aspecto-modo-pintado').click(); true`);
    await p.hasta('document.querySelector("#aspecto-generador").dataset.estado === "disponible-local"', 8000);
    const hay = await p.ev(`({ opcion: document.querySelector('#aspecto-modo-pintado').textContent, apagada: document.querySelector('#aspecto-modo-pintado').getAttribute('aria-disabled'), modo: document.querySelector('#aspecto').dataset.modo, marcada: document.querySelector('#aspecto-modo-pintado').getAttribute('aria-checked'), foco: document.activeElement.id })`);
    comprobar(/Hay un generador de imágenes en este equipo/.test(hay.opcion) && /no sale de tu PC/.test(hay.opcion) && hay.apagada !== 'true' && hay.modo === 'pintado' && hay.marcada === 'true' && hay.foco === 'aspecto-modo-pintado',
      'pulsar «Retrato pintado con IA» comprueba el generador y, como lo hay, la deja elegida: «hay generador en este equipo, no sale de tu PC»', JSON.stringify(hay));
    await p.ev(`document.querySelector('#aspecto-modo-pintado').click(); true`);
    await p.hasta('document.querySelector("#aspecto-pintar")');
    await p.foto('C1-aspecto-con-generador-1366x768.png');
    await p.ev(`document.querySelector('#aspecto-pintar').click(); true`);
    await p.hasta('document.querySelector("#estudio[open]") && /Listo para pintar/.test(document.querySelector("#estudio-estado").textContent)', 8000);
    const nota = await p.ev(`document.querySelector('#estudio-nota').textContent`);
    comprobar(/no sale del equipo/.test(nota) && !/nube/.test(nota), 'el estudio dice lo que pasa con un generador local', nota);
    await p.ev(`document.querySelector('#estudio-pintar').click(); true`);
    await p.hasta('document.querySelector("#estudio .estudio__candidata")?.complete && document.querySelector("#estudio").dataset.estado === "candidata"', 10000);
    const privada = await p.ev(`(async () => ({ galeria: await ${GALERIA}, estado: document.querySelector('#estudio-estado').textContent }))()`);
    comprobar(privada.galeria.length === 0 && /no está guardada/.test(privada.estado), 'la candidata es privada: no está en la galería hasta elegirla', JSON.stringify(privada));
    await p.ev(`document.querySelector('#estudio-otra').click(); true`);
    await p.hasta('/Versión 2/.test(document.querySelector("#estudio-estado").textContent)', 10000);
    await p.foto('C2-estudio-candidata-1366x768.png');
    await p.ev(`document.querySelector('#estudio-usar').click(); true`);
    await p.hasta('!document.querySelector("#estudio")', 8000);
    const usada = await p.ev(`(async () => ({ galeria: await ${GALERIA}, modo: document.querySelector('#aspecto').dataset.modo, pie: document.querySelector('#aspecto-pie').textContent }))()`);
    comprobar(generadas.length === 2 && generadas[0] !== generadas[1] && usada.galeria.length === 1 && usada.galeria[0].estilo !== 'dibujo-del-juego' && usada.galeria[0].bytes === PNG_1X1.length && usada.modo === 'pintado' && /pintado/.test(usada.pie),
      '«Otra versión» pide otra semilla y «Usar» guarda los bytes exactos de esa versión', JSON.stringify({ generadas, usada }));
    await p.ev(`document.querySelector('#creacion-siguiente').click(); true`);
    await p.hasta(`${PASO} === 'revisar'`);
    await empezar(p);
    await p.navegar(c.app);
    await p.hasta(LISTA);
    await p.ev(`document.querySelector('#inicio-jugar').click(); document.querySelector('#menu-continuar').click(); true`);
    await p.hasta('document.body.dataset.activeScreen === "juego" && document.querySelector("#retrato-pj img.arte--aprobada")?.complete', 15000);
    const trasRecarga = await p.ev(GALERIA);
    comprobar(trasRecarga.length === 1 && trasRecarga[0].bytes === PNG_1X1.length, 'tras recargar, la imagen elegida sigue (mismos bytes)', JSON.stringify(trasRecarga));
    await p.ev(`navigator.serviceWorker.ready.then(() => true)`);
    await tic(800);
    await p.enviar('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
    await p.navegar(c.app);
    await p.hasta(LISTA, 20000);
    await p.ev(`document.querySelector('#inicio-jugar').click(); document.querySelector('#menu-continuar').click(); true`);
    await p.hasta('document.body.dataset.activeScreen === "juego" && document.querySelector("#retrato-pj img.arte--aprobada")?.complete', 15000);
    comprobar(true, 'y sin red también: vive en el navegador');
    await p.enviar('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  } finally { await p.cerrar(); await pu.cerrar(); }
});

await caso('D · Sin generador y sus variantes: lo que se dice es lo que hay', async () => {
  const p = await pestana();
  let srv = null;
  try {
    await aCreacion(p);
    await p.ev(crearPersonajeUI({ raza: 'brumal', nombre: 'Dalia', lore: 'Creció en los pilotes, entre niebla.', descripcion: 'brumal de ojos violetas y parche', imagen: 'dibujo' }));
    await empezar(p);
    const galeria0 = await p.ev(GALERIA);
    const run = await p.ev(`ARCANVEIL.ver('meta.runId')`);
    const sinInventos = (t) => !/nube|sale de tu equipo|caché|servicio en la nube/i.test(t);

    // 1 · nadie escucha.
    const d1 = await abrirImagen(p);
    comprobar(d1.estado === 'desconocido' && alGenerador(p) === 0, 'abrir la imagen del personaje no sondea nada por su cuenta', JSON.stringify({ estado: d1.estado, peticiones: alGenerador(p) }));
    // El clic del jugador de la queja, sin generador: la opción lo comprueba y lo DICE (antes no hacía nada).
    await p.ev(`document.querySelector('#aspecto-modo-pintado').click(); true`);
    const alPulsar = await p.ev(`document.querySelector('#aspecto-generador').dataset.estado`);
    await p.hasta('!["desconocido", "buscando"].includes(document.querySelector("#aspecto-generador").dataset.estado)', 9000);
    const trasPulsar = await p.ev(`({ modo: document.querySelector('#aspecto').dataset.modo, foco: document.activeElement.id, peticiones: 0 })`);
    comprobar(alPulsar !== 'desconocido' && trasPulsar.modo === 'dibujo' && trasPulsar.foco === 'aspecto-modo-pintado' && alGenerador(p) >= 1, 'pulsar «Retrato pintado con IA» sin generador no cae en vacío: lo comprueba, lo dice en la propia opción, deja el foco en ella y el dibujo sigue elegido', JSON.stringify({ alPulsar, trasPulsar, peticiones: alGenerador(p) }));
    const sin = await p.ev(`({ estado: document.querySelector('#aspecto-generador').dataset.estado, opcion: document.querySelector('#aspecto-modo-pintado').textContent, apagada: document.querySelector('#aspecto-modo-pintado').getAttribute('aria-disabled'), texto: document.querySelector('#imagen-dialogo').innerText, ayuda: document.querySelector('#aspecto-generador details')?.open, ayudaTexto: document.querySelector('#aspecto-generador details p')?.textContent ?? '', pintar: Boolean(document.querySelector('#aspecto-pintar')), dibujo: Boolean(document.querySelector('#imagen-vista svg')) })`);
    comprobar(sin.estado === 'no-disponible' && sin.apagada === 'true' && !sin.pintar && sin.dibujo && /no hay ningún generador/.test(sin.opcion) && sinInventos(sin.texto) && !/node tools|IMAGEN_LOCAL/.test(sin.texto),
      'sin puente: «no hay ningún generador», pintar no se ofrece, el dibujo sí; ni nube, ni envíos, ni cachés, ni comandos', JSON.stringify({ ...sin, texto: undefined }));
    comprobar(sin.ayuda === false && /ComfyUI/.test(sin.ayudaTexto) && /no instala nada/.test(sin.ayudaTexto) && !/node |tools\/|\.mjs|11437|puerto/i.test(sin.ayudaTexto), 'lo técnico existe, plegado, con los requisitos de verdad (ComfyUI, modelo, tarjeta gráfica; el juego no instala nada) y SIN comandos ni puertos', sin.ayudaTexto);
    await p.foto('D1-imagen-sin-generador-1366x768.png');

    // 2 · en ese puerto contesta OTRO programa.
    const cors = { 'Access-Control-Allow-Origin': c.origen, 'Content-Type': 'application/json' };
    srv = await ocuparPuerto((req, res) => { res.writeHead(200, cors); res.end(JSON.stringify({ servicio: 'otra-cosa/1' })); });
    await p.ev(`document.querySelector('#aspecto-comprobar').click(); true`);
    await p.hasta('/otro programa/.test(document.querySelector("#aspecto-modo-pintado").textContent)', 9000);
    const otro = await p.ev(`({ estado: document.querySelector('#aspecto-generador').dataset.estado, texto: document.querySelector('#imagen-dialogo').innerText })`);
    comprobar(otro.estado === 'no-disponible' && sinInventos(otro.texto), 'otro programa en el puerto: se dice y no se le pide nada más', otro.estado);
    await srv.cerrar();

    // 3 · contesta pero no deja leer (sin CORS).
    srv = await ocuparPuerto((req, res) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{}'); });
    await p.ev(`document.querySelector('#aspecto-comprobar').click(); true`);
    await p.hasta('/no deja leer/.test(document.querySelector("#aspecto-modo-pintado").textContent)', 9000);
    comprobar(sinInventos(await p.ev(`document.querySelector('#imagen-dialogo').innerText`)), 'sin permiso de lectura (CORS): «no deja leer», sin inventar nada');
    await srv.cerrar();

    // 4 y 5 · el puente está pero su generador no, o le faltan credenciales.
    let pu = await puente({ id: 'comfyui', salud: async () => ({ disponible: false, motivo: 'sin respuesta' }), generar: async () => { throw new Error('caído'); } });
    await p.ev(`document.querySelector('#aspecto-comprobar').click(); true`);
    await p.hasta('document.querySelector("#aspecto-generador").dataset.estado === "proveedor-fallo"', 9000);
    const caido = await p.ev(`({ opcion: document.querySelector('#aspecto-modo-pintado').textContent, apagada: document.querySelector('#aspecto-modo-pintado').getAttribute('aria-disabled') })`);
    comprobar(/su generador no responde/.test(caido.opcion) && caido.apagada === 'true', 'puente sin generador: «su generador no responde», y no deja pintar', JSON.stringify(caido));
    await pu.cerrar();
    pu = await puente({ id: 'cloudflare', salud: async () => ({ disponible: false, motivo: 'faltan credenciales' }), generar: async () => { throw new Error('sin clave'); } });
    await p.ev(`document.querySelector('#aspecto-comprobar').click(); true`);
    await p.hasta('/sin credenciales/.test(document.querySelector("#aspecto-modo-pintado").textContent)', 9000);
    comprobar(await p.ev(`document.querySelector('#aspecto-modo-pintado').getAttribute('aria-disabled')`) === 'true', 'puente de nube sin credenciales: se dice, y no deja pintar');
    await pu.cerrar();

    // 6 · el puerto acepta y no contesta nunca: «buscando» tiene salida, y la petición se aborta.
    let abiertas = 0; let cerradas = 0;
    srv = await ocuparPuerto((req) => { abiertas += 1; req.socket.on('close', () => { cerradas += 1; }); });
    const t0 = Date.now();
    await p.ev(`document.querySelector('#aspecto-comprobar').click(); true`);
    const buscando = await p.ev(`document.querySelector('#aspecto-generador').dataset.estado`);
    await p.hasta('document.querySelector("#aspecto-generador").dataset.estado === "timeout"', 9000);
    const ms = Date.now() - t0;
    await tic(300);
    const colgado = await p.ev(`({ opcion: document.querySelector('#aspecto-modo-pintado').textContent, boton: document.querySelector('#aspecto-comprobar')?.textContent, texto: document.querySelector('#imagen-dialogo').innerText, modo: document.querySelector('#aspecto').dataset.modo })`);
    comprobar(buscando === 'buscando' && ms >= 3500 && ms < 7000 && /Nada ha contestado a tiempo/.test(colgado.opcion) && /Volver a comprobar/.test(colgado.boton) && sinInventos(colgado.texto) && colgado.modo === 'dibujo',
      `sondeo colgado: sale de «Buscando» a los ${ms} ms con «nada ha contestado a tiempo» (sin dar por hecho que haya generador) y se puede volver a comprobar`, JSON.stringify({ buscando, ms, colgado: { ...colgado, texto: undefined } }));
    comprobar(abiertas >= 1 && cerradas === abiertas, `y la petición se ABORTÓ de verdad (el servidor vio ${abiertas} conexión(es) y ${cerradas} cerrada(s) por el cliente)`);
    await p.foto('D2-imagen-timeout-1366x768.png');

    // 7 · respuesta vieja: se pide comprobar y se cierra; lo que llegue después no pinta ni reabre nada.
    await p.ev(`document.querySelector('#aspecto-comprobar').click(); document.querySelector('#aspecto-modo-ninguno').click(); document.querySelector('#imagen-cerrar').click(); true`);
    await tic(5200);
    const viejo = await p.ev(`(async () => ({ dialogo: Boolean(document.querySelector('#imagen-dialogo')), estudio: Boolean(document.querySelector('#estudio')), cara: Boolean(document.querySelector('#retrato-pj img.arte--aprobada')), galeria: await ${GALERIA}, run: ARCANVEIL.ver('meta.runId') }))()`);
    comprobar(!viejo.dialogo && !viejo.estudio && viejo.cara && JSON.stringify(viejo.galeria) === JSON.stringify(galeria0) && viejo.run === run && !p.incidencias.some((x) => x.tipo === 'excepción'),
      'cerrar con un sondeo en vuelo: no reabre nada, «Sin imagen» sin confirmar no borra la cara, la partida sigue y no hay excepciones', JSON.stringify({ ...viejo, galeria: viejo.galeria.length, excepciones: p.incidencias.filter((x) => x.tipo === 'excepción') }));
    await srv.cerrar();

    // 8 · reintentar sin recargar la campaña: ahora sí hay generador.
    const pedidas = [];
    const canceladas = [];
    let soltar = null;
    pu = await puente({ id: 'comfyui', salud: async () => ({ disponible: true }), generar: ({ semilla }, signal) => new Promise((ok, mal) => { pedidas.push(semilla); soltar = () => ok({ bytes: PNG_1X1, tipo: 'image/png' }); canceladas.push(signal); signal?.addEventListener?.('abort', () => mal(Object.assign(new Error('cancelada'), { name: 'AbortError' }))); }) });
    const d8 = await abrirImagen(p, { comprobar: true });
    comprobar(d8.estado === 'disponible-local' && (await p.ev(`ARCANVEIL.ver('meta.runId')`)) === run, 'volver a comprobar encuentra el generador sin recargar la partida', d8.estado);
    await p.ev(`document.querySelector('#aspecto-modo-pintado').click(); true`);
    await p.hasta('document.querySelector("#aspecto-pintar")');
    await p.ev(`document.querySelector('#aspecto-pintar').click(); true`);
    await p.hasta('document.querySelector("#estudio[open]") && !document.querySelector("#estudio-pintar").hidden && !document.querySelector("#estudio-pintar").disabled', 8000);
    await p.ev(`document.querySelector('#estudio-pintar').click(); true`);
    await p.hasta('document.querySelector("#estudio").dataset.estado === "generando"', 5000);
    await p.foto('D3-estudio-generando-1366x768.png');
    // Cerrar a media generación: cancela, no aprueba y no toca la cara elegida.
    await cerrarImagen(p);
    await tic(400); soltar?.();
    await tic(400);
    const cancelada = await p.ev(`(async () => ({ galeria: await ${GALERIA}, cara: Boolean(document.querySelector('#retrato-pj img.arte--aprobada')), estudio: Boolean(document.querySelector('#estudio')) }))()`);
    comprobar(pedidas.length === 1 && canceladas[0]?.aborted === true && JSON.stringify(cancelada.galeria) === JSON.stringify(galeria0) && cancelada.cara && !cancelada.estudio, 'cerrar a media generación la CANCELA en el generador, y no aprueba ni guarda nada: la cara elegida sigue igual', JSON.stringify({ pedidas: pedidas.length, cancelada: canceladas[0]?.aborted ?? null, galeria: cancelada.galeria }));
    await pu.cerrar();

    // 9 · el generador falla al pintar: se dice, y la imagen que tenía sigue.
    pu = await puente({ id: 'comfyui', salud: async () => ({ disponible: true }), generar: async () => { throw new Error('el modelo no cargó'); } });
    await abrirImagen(p, { comprobar: true });
    await p.ev(`document.querySelector('#aspecto-modo-pintado').click(); true`);
    await p.hasta('document.querySelector("#aspecto-pintar")');
    await p.ev(`document.querySelector('#aspecto-pintar').click(); true`);
    await p.hasta('document.querySelector("#estudio[open]") && !document.querySelector("#estudio-pintar").hidden && !document.querySelector("#estudio-pintar").disabled', 8000);
    await p.ev(`document.querySelector('#estudio-pintar').click(); true`);
    await p.hasta('document.querySelector("#estudio").dataset.estado === "proveedor-fallo"', 10000).catch(async (e) => { throw new Error(`${e.message.split('\n')[0]} · estudio: ${JSON.stringify(await p.ev(`({ estado: document.querySelector('#estudio')?.dataset.estado, texto: document.querySelector('#estudio-estado')?.textContent, pintar: [document.querySelector('#estudio-pintar')?.hidden, document.querySelector('#estudio-pintar')?.disabled] })`))}`); });
    const falla = await p.ev(`(async () => ({ estado: document.querySelector('#estudio-estado').textContent, candidata: Boolean(document.querySelector('#estudio .estudio__candidata')), galeria: await ${GALERIA} }))()`);
    comprobar(/sigue igual/.test(falla.estado) && !falla.candidata && JSON.stringify(falla.galeria) === JSON.stringify(galeria0), 'si el generador falla al pintar: se dice, no hay candidata y la imagen que ya tenía sigue igual', falla.estado);
    await cerrarImagen(p);
    await pu.cerrar();

    // 10 · el navegador no deja guardar el dibujo: no se inventa éxito ni se cambia nada.
    await abrirImagen(p);
    await p.ev(`(() => { const s = document.querySelector('#aspecto-ojos'); s.value = 'rojos'; s.dispatchEvent(new Event('change', { bubbles: true })); window.__toBlob = HTMLCanvasElement.prototype.toBlob; HTMLCanvasElement.prototype.toBlob = function (cb) { cb(null); }; document.querySelector('#imagen-usar').click(); return true; })()`);
    await p.hasta('/No se ha cambiado nada/.test(document.querySelector("#imagen-estado").textContent)', 8000);
    const sinGuardar = await p.ev(`(async () => { HTMLCanvasElement.prototype.toBlob = window.__toBlob; return { estado: document.querySelector('#imagen-estado').textContent, abierto: Boolean(document.querySelector('#imagen-dialogo[open]')), galeria: await ${GALERIA} }; })()`);
    comprobar(sinGuardar.abierto && /No se ha podido guardar el dibujo/.test(sinGuardar.estado) && JSON.stringify(sinGuardar.galeria) === JSON.stringify(galeria0), 'si el navegador no deja guardar el dibujo: se dice, no se cierra como si nada y la imagen anterior sigue', sinGuardar.estado);
    // Y con todo en orden, «Usar esta imagen» sí cambia el dibujo.
    await p.ev(`document.querySelector('#imagen-usar').click(); true`);
    await p.hasta('!document.querySelector("#imagen-dialogo")', 8000);
    const cambiada = await p.ev(GALERIA);
    comprobar(cambiada.length === 1 && cambiada[0].estilo === 'dibujo-del-juego' && cambiada[0].bytes !== galeria0[0].bytes, '«Usar esta imagen» guarda el dibujo nuevo', JSON.stringify(cambiada));
  } finally { await srv?.cerrar?.().catch(() => {}); await p.cerrar(); }
});

await caso('E · Leer el historial mientras acaba un turno', async () => {
  const p = pA;
  if (!p) throw new Error('el caso A no dejó partida');
  for (const t of ['miro alrededor', 'pregunto qué se cuenta por aquí', 'examino el suelo']) await jugar(p, t);
  const entradas0 = await p.ev(`JSON.stringify(ARCANVEIL.ver('narrative.entradas').map((e) => e.texto))`);
  const turno = await p.ev(`document.querySelector('#bitacora .turno__cab').textContent`);
  // Actúa y, mientras se resuelve, se va a leer el historial.
  const leyendo = await p.ev(`(async () => { const b = document.querySelector('#bitacora'); const p = ARCANVEIL.jugar('espero y escucho'); document.querySelector('#relato-historial').click(); await new Promise((r) => setTimeout(r, 60)); b.scrollTop = 40; b.focus(); const antes = { top: b.scrollTop, foco: document.activeElement.id }; await p; await new Promise((r) => setTimeout(r, 900)); return { antes, despues: { top: b.scrollTop, foco: document.activeElement.id, vista: b.dataset.vista }, aviso: !document.querySelector('#relato-nuevo').hidden, textoAviso: document.querySelector('#relato-nuevo').textContent, sugerencias: !document.querySelector('#sugerencias').hidden }; })()`);
  comprobar(leyendo.despues.vista === 'historial' && leyendo.despues.top === leyendo.antes.top && leyendo.despues.foco === 'bitacora' && leyendo.aviso && /Respuesta nueva/.test(leyendo.textoAviso),
    'la respuesta nueva no mueve la lectura ni el foco: se avisa («Respuesta nueva · volver al presente»)', JSON.stringify(leyendo));
  await p.foto('E1-historial-con-respuesta-nueva-1366x768.png');
  const historial = await p.ev(`(() => { const b = document.querySelector('#bitacora'); const todo = ARCANVEIL.ver('narrative.entradas').filter((e) => e.voz !== 'roll' && e.voz !== 'tirada').flatMap((e) => String(e.texto ?? '').split('\\n').map((x) => x.trim()).filter(Boolean)); const visto = b.textContent; return { faltan: todo.filter((t) => !visto.includes(t)).length, parrafos: todo.length, turnos: [...b.querySelectorAll('.turno__cab')].map((x) => x.textContent), rotulo: document.getElementById(b.getAttribute('aria-labelledby'))?.textContent, donde: document.querySelector('#relato-donde').hidden }; })()`);
  comprobar(historial.faltan === 0 && historial.turnos[0] === 'Comienzo' && historial.turnos.length >= 5 && historial.rotulo === 'Historial', `el historial tiene TODO el relato (${historial.parrafos} párrafos, ninguno falta), partido por turnos`, JSON.stringify(historial));
  await p.ev(`document.querySelector('#relato-nuevo').click(); true`);
  await tic(300);
  const presente = await p.ev(`(() => { const b = document.querySelector('#bitacora'); const es = ARCANVEIL.ver('narrative.entradas'); const i = es.map((e) => e.voz).lastIndexOf('player'); const delTurno = es.slice(i).filter((e) => e.voz !== 'roll' && e.voz !== 'tirada').flatMap((e) => String(e.texto ?? '').split('\\n').map((x) => x.trim()).filter(Boolean)); return { vista: b.dataset.vista, top: b.scrollTop, cab: b.querySelector('.turno__cab').textContent, accion: b.querySelector('.linea--jugador')?.textContent, faltan: delTurno.filter((t) => !b.textContent.includes(t)).length, anteriores: es.slice(0, i).some((e) => e.voz === 'dm' && e.texto && b.textContent.includes(String(e.texto).split('\\n')[0]) && !delTurno.includes(String(e.texto).split('\\n')[0])), aviso: !document.querySelector('#relato-nuevo').hidden, fin: Boolean(b.querySelector('.turno__fin')) }; })()`);
  comprobar(presente.vista === 'ahora' && presente.top === 0 && presente.accion === 'espero y escucho' && presente.faltan === 0 && !presente.aviso && presente.fin && presente.cab !== turno,
    `«volver al presente» lleva al turno nuevo, desde su principio, entero y con su final (${presente.cab})`, JSON.stringify(presente));
  comprobar(!presente.anteriores, '«Ahora» enseña SOLO el turno en curso (lo anterior está en el historial)');
  comprobar(JSON.stringify(JSON.parse(entradas0)) === (await p.ev(`JSON.stringify(ARCANVEIL.ver('narrative.entradas').slice(0, ${JSON.parse(entradas0).length}).map((e) => e.texto))`)), 'cambiar de vista no altera el relato guardado');
  await p.foto('E2-ahora-tras-volver-1366x768.png');
});

await caso('F · 20 turnos: presente, lugar y entrada a la vista; los paneles vuelven a la misma lectura', async () => {
  const p = pA;
  if (!p) throw new Error('el caso A no dejó partida');
  const acciones = ['miro alrededor', 'escucho tras la puerta', 'exploro con cuidado', 'examino las huellas', 'pregunto por rumores', 'busco un camino seguro', 'registro el lugar', 'observo el cielo', 'recuerdo viejas historias', 'compruebo mi equipo', 'avanzo en silencio', 'busco agua', 'inspecciono las piedras', 'dejo una marca en el camino', 'vigilo los tejados', 'sigo las luces', 'investigo el ruido', 'anoto lo descubierto', 'descanso un momento', 'decido el siguiente paso'];
  const malos = [];
  for (const [i, a] of acciones.entries()) {
    await jugar(p, a);
    if (await p.ev(`ARCANVEIL.ver('combat.activo', false)`)) { await p.ev(`ARCANVEIL.sistema('combat')?.terminar?.('huida'); true`).catch(() => {}); }
    const v = await p.ev(`(() => { const b = document.querySelector('#bitacora'); const lugar = ARCANVEIL.sistema('world').lugarActual()?.plantilla?.nombre ?? ''; const m = ${MEDIDAS}; return { vista: b.dataset.vista, top: b.scrollTop, accion: b.querySelector('.linea--jugador')?.textContent ?? '', lugar, rotulo: document.querySelector('#escena-rotulo .escena__lugar')?.textContent ?? '', entrada: m.entrada, actuar: m.actuar, horizontal: m.horizontal, pagina: m.pagina, donde: document.querySelector('#relato-donde').textContent, combate: ARCANVEIL.ver('combat.activo', false), sinNombre: m.desplazables.filter((d) => !d.rotulo || !d.foco).map((d) => d.id) }; })()`);
    if (v.combate) continue;
    if (v.vista !== 'ahora' || v.accion.toLowerCase() !== a || v.rotulo !== v.lugar || !v.entrada || !v.actuar || v.horizontal || v.pagina || !/Turno \d+/.test(v.donde) || v.sinNombre.length) malos.push({ i, a, v });
  }
  comprobar(!malos.length, 'en los 20 turnos: «Ahora» abre con tu acción, el lugar está rotulado, la caja de escribir y «Actuar» a la vista, sin desplazar la página', JSON.stringify(malos.slice(0, 2)));
  // Los paneles: ir y volver no cambia ni la historia, ni dónde se leía, ni dónde estás.
  await p.ev(`document.querySelector('#relato-historial').click(); true`);
  await tic(200);
  await p.ev(`(() => { const b = document.querySelector('#bitacora'); b.scrollTop = Math.floor(b.scrollHeight / 3); return true; })()`);
  await tic(150);
  const antes = await p.ev(`({ top: document.querySelector('#bitacora').scrollTop, relato: JSON.stringify(ARCANVEIL.ver('narrative.entradas')), lugar: ARCANVEIL.ver('world.ubicacion'), vista: document.querySelector('#bitacora').dataset.vista })`);
  const paneles = [];
  for (const k of ['ficha', 'inventario', 'mapa', 'misiones', 'gente']) {
    await p.ev(`document.querySelector('#pestana-${k}').click(); true`);
    await tic(120);
    paneles.push(await p.ev(`({ k: '${k}', activa: document.querySelector('#pestana-${k}').getAttribute('aria-selected'), titulo: document.querySelector('#lateral-titulo').textContent, vacio: document.querySelector('#lateral-cuerpo').textContent.trim().length === 0, top: document.querySelector('#bitacora').scrollTop })`));
  }
  const despues = await p.ev(`({ top: document.querySelector('#bitacora').scrollTop, relato: JSON.stringify(ARCANVEIL.ver('narrative.entradas')), lugar: ARCANVEIL.ver('world.ubicacion'), vista: document.querySelector('#bitacora').dataset.vista })`);
  comprobar(paneles.every((x) => x.activa === 'true' && !x.vacio && x.top === antes.top) && despues.top === antes.top && despues.relato === antes.relato && despues.lugar === antes.lugar && despues.vista === 'historial',
    'ficha, bolsa, mapa, encargos y gente: se abren con su título y no mueven la lectura, el relato ni el lugar', JSON.stringify({ paneles, antes: antes.top, despues: despues.top }));
  await p.ev(`document.querySelector('#pestana-mapa').click(); true`);
  await tic(150);
  await p.foto('F1-historial-y-panel-mapa-1366x768.png');
  // Viajar desde el mapa abre SU turno: lo nuevo no se cuelga del anterior.
  const antesViaje = await p.ev(`({ turnos: ARCANVEIL.ver('narrative.entradas').filter((e) => e.voz === 'player').length, lugar: ARCANVEIL.ver('world.ubicacion'), destino: document.querySelector('#lateral-cuerpo .destino span')?.textContent ?? '' })`);
  await p.ev(`document.querySelector('#lateral-cuerpo .destino').click(); true`);
  await p.hasta(`ARCANVEIL.ver('world.ubicacion') !== ${JSON.stringify(antesViaje.lugar)} && !ARCANVEIL.sistema('turns')._ocupado && !ARCANVEIL.sistema('travel').enCurso`, 20000).catch(() => {});
  await p.ev(`ARCANVEIL.interfaz.completarEscritura(); true`);
  await tic(400);
  const viaje = await p.ev(`(() => { const b = document.querySelector('#bitacora'); const m = ${MEDIDAS}; return { vista: b.dataset.vista, top: b.scrollTop, accion: b.querySelector('.linea--jugador')?.textContent ?? '', cab: b.querySelector('.turno__cab')?.textContent ?? '', donde: document.querySelector('#relato-donde').textContent, turnos: ARCANVEIL.ver('narrative.entradas').filter((e) => e.voz === 'player').length, lugar: ARCANVEIL.sistema('world').lugarActual()?.plantilla?.nombre ?? '', rotulo: document.querySelector('#escena-rotulo .escena__lugar')?.textContent ?? '', entrada: m.entrada, pagina: m.pagina }; })()`);
  comprobar(viaje.vista === 'ahora' && viaje.top === 0 && /^Viajo a/.test(viaje.accion) && viaje.turnos === antesViaje.turnos + 1 && viaje.cab === `Turno ${viaje.turnos}` && new RegExp(`Turno ${viaje.turnos}`).test(viaje.donde) && viaje.rotulo === viaje.lugar && viaje.entrada && !viaje.pagina,
    `viajar desde el mapa («${antesViaje.destino}») abre su propio turno en «Ahora», desde su principio, con el lugar nuevo rotulado`, JSON.stringify({ antesViaje, viaje }));
  await p.foto('F2-tras-viajar-desde-el-mapa-1366x768.png');
  await p.ev(`document.querySelector('#pestana-ficha').click(); document.querySelector('#relato-ahora').click(); true`);
});

await caso('H · Narración larga, bolsa grande, doble clic y combate con tres rivales', async () => {
  const p = pA;
  if (!p) throw new Error('el caso A no dejó partida');
  // Doble clic en «Actuar»: un turno, no dos.
  const doble = await p.ev(`(async () => { const n = () => ARCANVEIL.ver('narrative.entradas').filter((e) => e.voz === 'player').length; const antes = n(); const c = document.querySelector('#entrada'); c.value = 'miro el cielo'; c.dispatchEvent(new Event('input', { bubbles: true })); const b = document.querySelector('#enviar'); b.click(); b.click(); for (let i = 0; i < 100 && ARCANVEIL.sistema('turns')._ocupado; i++) await new Promise((r) => setTimeout(r, 50)); await new Promise((r) => setTimeout(r, 400)); ARCANVEIL.interfaz.completarEscritura(); return n() - antes; })()`);
  comprobar(doble === 1, 'doble clic en «Actuar»: un solo turno', `turnos: ${doble}`);
  // FIXTURE: una narración muy larga (3 600 letras) como última respuesta.
  const largo = Array.from({ length: 30 }, (_, i) => `Párrafo ${i + 1} de la crónica: el camino sigue entre piedras viejas y nadie parece tener prisa por llegar al final del valle.`).join('\n');
  await p.ev(`(() => { const es = ARCANVEIL.ver('narrative.entradas'); ARCANVEIL.store.fijar('narrative.entradas', [...es, { id: 'fx-largo', voz: 'dm', texto: ${JSON.stringify(largo)} }]); document.querySelector('#relato-historial').click(); document.querySelector('#relato-ahora').click(); ARCANVEIL.interfaz.completarEscritura(); return true; })()`);
  await tic(200);
  const larga = await p.ev(`(() => { const b = document.querySelector('#bitacora'); const m = ${MEDIDAS}; return { completo: ${JSON.stringify(largo.split('\n'))}.every((t) => b.textContent.includes(t)), desplaza: b.scrollHeight > b.clientHeight, top: b.scrollTop, rotulo: document.getElementById(b.getAttribute('aria-labelledby'))?.textContent, foco: b.tabIndex, entrada: m.entrada, actuar: m.actuar, pagina: m.pagina, horizontal: m.horizontal, fin: Boolean(b.querySelector('.turno__fin')) }; })()`);
  comprobar(larga.completo && larga.desplaza && larga.top === 0 && larga.rotulo === 'Ahora' && larga.foco === 0 && larga.entrada && larga.actuar && !larga.pagina && !larga.horizontal && larga.fin,
    'una narración de 30 párrafos sale ENTERA: se lee desde su principio, se desplaza dentro de su zona (con nombre y teclado) y la caja de escribir sigue a la vista', JSON.stringify(larga));
  await p.foto('H1-narracion-larga-1366x768.png');
  // FIXTURE: una bolsa de 40 objetos.
  await p.ev(`(() => { const porId = { ...ARCANVEIL.ver('inventory.objetos.porId', {}) }; const base = Object.values(porId)[0]; for (let i = 0; i < 40; i++) porId['fx-' + i] = { ...base, id: 'fx-' + i, nombre: 'Trasto de prueba ' + (i + 1), equipado: false }; ARCANVEIL.store.fijar('inventory.objetos.porId', porId); document.querySelector('#pestana-inventario').click(); return true; })()`);
  await tic(200);
  const bolsa = await p.ev(`(() => { const cu = document.querySelector('#lateral-cuerpo'); const m = ${MEDIDAS}; return { filas: cu.querySelectorAll('*').length, ultimo: cu.textContent.includes('Trasto de prueba 40'), desplaza: cu.scrollHeight > cu.clientHeight, rotulo: document.getElementById(cu.getAttribute('aria-labelledby'))?.textContent, foco: cu.tabIndex, entrada: m.entrada, pagina: m.pagina, sinNombre: m.desplazables.filter((d) => !d.rotulo || !d.foco).map((d) => d.id) }; })()`);
  comprobar(bolsa.ultimo && bolsa.desplaza && bolsa.rotulo === 'Bolsa' && bolsa.foco === 0 && bolsa.entrada && !bolsa.pagina && !bolsa.sinNombre.length, 'una bolsa de 40 objetos: están todos, se desplaza SOLO su panel (rotulado «Bolsa») y nada tapa la caja de escribir', JSON.stringify(bolsa));
  await p.foto('H2-bolsa-grande-1366x768.png');
  await p.ev(`document.querySelector('#pestana-ficha').click(); true`);
  // Combate con tres rivales.
  await p.ev(`ARCANVEIL.bus.emit('combat:request', { enemies: [{ refId: 'guardia_corrupto', count: 3 }] }); true`);
  await p.hasta('ARCANVEIL.ver("combat.activo", false) && ARCANVEIL.sistema("combat").esperandoJugador && !document.querySelector("#combate").hidden', 40000);
  await tic(500);
  const combate = await p.ev(`(() => { const caja = (q) => { const n = document.querySelector(q); if (!n || n.offsetParent === null) return null; const r = n.getBoundingClientRect(); return { t: r.top, b: r.bottom, l: r.left, r: r.right }; }; const co = caja('#combate'); const en = caja('#entrada'); const botones = [...document.querySelectorAll('#combate button')].filter((b) => b.offsetParent !== null).map((b) => b.getBoundingClientRect()); const m = ${MEDIDAS}; const lista = document.querySelector('#combate .combate__lista'); const marco = lista.getBoundingClientRect(); const luchadores = [...document.querySelectorAll('#combate .luchador')].map((n) => { const r = n.getBoundingClientRect(); return r.height > 20 && r.top >= marco.top - 1 && r.bottom <= Math.min(marco.bottom, innerHeight) + 1; }); return { rivales: luchadores.length - 1, enteros: luchadores.filter(Boolean).length, listaDesplaza: lista.scrollHeight > lista.clientHeight + 2, arriba: co ? Math.round(co.t) : null, solapa: Boolean(co && en && co.b > en.t + 2 && co.t < en.b - 2 && co.r > en.l && co.l < en.r), fuera: botones.filter((r) => r.bottom > innerHeight + 1 || r.right > innerWidth + 1 || r.top < -1).length, nBotones: botones.length, entrada: m.entrada, pagina: m.pagina, horizontal: m.horizontal }; })()`);
  comprobar(combate.rivales >= 3 && combate.enteros === combate.rivales + 1 && !combate.listaDesplaza && combate.arriba >= 0 && !combate.solapa && combate.fuera === 0 && combate.nBotones >= 3 && combate.entrada && !combate.pagina && !combate.horizontal,
    'combate con tres rivales: los cuatro combatientes se ven ENTEROS (medido en píxeles, no contando nodos), el panel no se sale por arriba ni tapa la caja de escribir, y sus botones caben', JSON.stringify(combate));
  await p.foto('H3-combate-tres-rivales-1366x768.png');
  // La vida del panel lateral es la del motor DURANTE el combate, golpe a golpe.
  const golpes = await p.ev(`(async () => {
    const cifra = () => (document.querySelector('#panel-personaje .barra-caja__cifra')?.textContent ?? '');
    const motor = () => { const v = ARCANVEIL.ver('player.vida'); return Math.round(v.actual) + '/' + v.max; };
    const vistos = [];
    const alGolpe = (g) => { if (g?.objetivo?.esJugador && g?.dano?.total) setTimeout(() => vistos.push({ panel: cifra(), motor: motor() }), 250); };
    ARCANVEIL.bus.on('combat:attack', alGolpe);
    const combate = ARCANVEIL.sistema('combat');
    for (let ronda = 0; ronda < 6 && ARCANVEIL.ver('combat.activo', false) && !vistos.length; ronda++) {
      await combate.accionJugador({ tipo: 'defender' });
      for (let i = 0; i < 80 && ARCANVEIL.ver('combat.activo', false) && !combate.esperandoJugador; i++) await new Promise((r) => setTimeout(r, 100));
      await new Promise((r) => setTimeout(r, 400));
    }
    ARCANVEIL.bus.off?.('combat:attack', alGolpe);
    return { vistos, final: { panel: cifra(), motor: motor() }, max: ARCANVEIL.ver('player.vida.max'), activo: ARCANVEIL.ver('combat.activo', false) };
  })()`);
  comprobar(golpes.vistos.length > 0 && golpes.vistos.every((x) => x.panel === x.motor) && golpes.final.panel === golpes.final.motor && golpes.final.motor !== `${golpes.max}/${golpes.max}`,
    `en combate, la vida del panel es la del motor nada más recibir el golpe (${golpes.vistos.map((x) => x.panel).join(', ') || 'sin golpes'})`, JSON.stringify(golpes));
});

await caso('G · Tamaños, zoom, letra grande, teclado, Escape y toque', async () => {
  const tamanos = [
    { id: '1440x900', ancho: 1440, alto: 900 },
    { id: '1024x768', ancho: 1024, alto: 768 },
    // PC con poca altura: un portátil de 1366×768 con las barras del navegador deja unos 650 px.
    { id: '1366x650', ancho: 1366, alto: 650 },
    { id: '1280x600', ancho: 1280, alto: 600 },
    { id: '390x844', ancho: 390, alto: 844, movil: true },
    { id: '320x568', ancho: 320, alto: 568, movil: true },
    { id: '1366x768-zoom200', ancho: 1366, alto: 768, zoom: 2 },
  ];
  for (const t of tamanos) {
    const p = await pestana({ ancho: t.ancho, alto: t.alto, movil: Boolean(t.movil), zoom: t.zoom ?? 1 });
    try {
      await aCreacion(p);
      const pasos = {};
      for (const hasta of ['origen', 'quien', 'aspecto', 'revisar']) {
        // (El ayudante sigue desde el paso en el que esté la pantalla.)
        await p.ev(crearPersonajeUI({ raza: 'sombracorteza', clase: 'rastreador', trasfondo: 'errante', nombre: 'Sael', lore: 'Sigue rastros que otros no ven.', descripcion: 'rastreadora de pelo negro y ojos dorados', hasta }));
        await tic(250);
        pasos[hasta] = await p.ev(MEDIDAS);
        await p.foto(`G-${t.id}-${hasta}.png`);
      }
      const malos = Object.entries(pasos).filter(([k, m]) => m.horizontal || m.pagina || (k === 'revisar' ? m.empezar !== true : m.siguiente !== true) || sinRotulo(m).length);
      comprobar(!malos.length, `${t.id} · creación: sin desplazar la página ni de lado; «Siguiente» / «Comenzar» siempre a la vista; lo que se desplaza tiene nombre`, JSON.stringify(malos.map(([k, m]) => [k, { horizontal: m.horizontal, pagina: m.pagina, siguiente: m.siguiente, empezar: m.empezar, sin: sinRotulo(m) }])));
      await empezar(p);
      await jugar(p, 'miro alrededor');
      await tic(300);
      const j = await p.ev(MEDIDAS);
      const bit = await p.ev(`(() => { const b = document.querySelector('#bitacora'); return { alto: b.clientHeight, accion: b.querySelector('.linea--jugador')?.textContent }; })()`);
      const lugar = await p.ev(`({ rotulo: [...document.querySelectorAll('#escena-rotulo .escena__lugar, #relato-lugar')].filter((n) => n.offsetParent !== null).map((n) => n.textContent)[0] ?? '', real: ARCANVEIL.sistema('world').lugarActual()?.plantilla?.nombre ?? '' })`);
      comprobar(lugar.rotulo === lugar.real && lugar.real.length > 0, `${t.id} · el lugar está rotulado a la vista («${lugar.rotulo}»)`, JSON.stringify(lugar));
      comprobar(!j.horizontal && !j.pagina && j.entrada === true && j.actuar === true && !sinRotulo(j).length && bit.alto >= 110 && bit.accion === 'miro alrededor', `${t.id} · partida: caja de escribir y «Actuar» a la vista, sin desplazar la página, y el turno legible (${bit.alto} px de relato)`, JSON.stringify({ horizontal: j.horizontal, pagina: j.pagina, entrada: j.entrada, actuar: j.actuar, sin: sinRotulo(j), bit }));
      await p.foto(`G-${t.id}-partida.png`);
      if (t.movil || t.zoom) {
        // En estrecho el panel es una hoja: se abre con un toque, tiene título y vuelta, y Escape la cierra.
        await p.tocar('#pestana-mapa');
        await p.hasta('document.querySelector("#panel-lateral-envoltura").classList.contains("lateral--hoja")', 4000);
        const hoja = await p.ev(`(() => { const m = ${MEDIDAS}; const v = document.querySelector('#lateral-volver'); const r = v.getBoundingClientRect(); const cu = document.querySelector('#lateral-cuerpo'); const cr = cu.getBoundingClientRect(); return { titulo: document.querySelector('#lateral-titulo').textContent, foco: document.activeElement.id, volver: v.offsetParent !== null && r.bottom <= innerHeight && r.right <= innerWidth, alto: Math.round(r.height), cuerpo: Math.round(cu.clientHeight), destinos: [...cu.querySelectorAll('.destino')].filter((d) => { const x = d.getBoundingClientRect(); return x.top >= cr.top - 1 && x.bottom <= Math.min(cr.bottom, innerHeight) + 1; }).length, horizontal: m.horizontal, pagina: m.pagina, entrada: m.entrada, sin: m.desplazables.filter((d) => !d.rotulo || !d.foco).map((d) => d.id) }; })()`);
        await p.foto(`G-${t.id}-hoja-mapa.png`);
        await p.tecla('Escape', 'Escape', 27);
        await tic(200);
        const cerrada = await p.ev(`({ hoja: document.querySelector('#panel-lateral-envoltura').classList.contains('lateral--hoja'), foco: document.activeElement.id, accion: document.querySelector('#bitacora .linea--jugador')?.textContent })`);
        comprobar(hoja.cuerpo >= 150 && hoja.destinos >= 2, `${t.id} · la hoja del mapa tiene sitio de verdad: ${hoja.cuerpo} px de contenido y ${hoja.destinos} destinos enteros a la vista`, JSON.stringify({ cuerpo: hoja.cuerpo, destinos: hoja.destinos }));
        comprobar(hoja.titulo === 'Mapa' && hoja.foco === 'lateral-titulo' && hoja.volver && hoja.alto >= 32 && !hoja.horizontal && !hoja.pagina && !hoja.sin.length && !cerrada.hoja && cerrada.foco === 'pestana-mapa' && cerrada.accion === 'miro alrededor',
          `${t.id} · el panel se abre como hoja con un toque (título, «Volver a la historia»), Escape la cierra, devuelve el foco y la historia sigue donde estaba`, JSON.stringify({ hoja, cerrada }));
      } else {
        // Teclado: de la caja de escribir se llega a las pestañas del relato y a los paneles; las flechas cambian de vista.
        await p.ev(`document.querySelector('#relato-ahora').focus(); true`);
        await p.tecla('ArrowRight', 'ArrowRight', 39);
        await tic(150);
        const teclado = await p.ev(`({ vista: document.querySelector('#bitacora').dataset.vista, foco: document.activeElement.id })`);
        await p.tecla('ArrowLeft', 'ArrowLeft', 37);
        comprobar(teclado.vista === 'historial' && teclado.foco === 'relato-historial', `${t.id} · con el teclado: las flechas cambian entre «Ahora» e «Historial»`, JSON.stringify(teclado));
        // El panel derecho en PC: pestañas en una fila y sin cortar; y si la ficha no cabe, se dice cuánto falta.
        await p.ev(`document.querySelector('#relato-ahora').click(); document.querySelector('#pestana-ficha').click(); true`);
        await tic(150);
        const panel = await p.ev(`(() => { const cu = document.querySelector('#lateral-cuerpo'); const bs = [...document.querySelectorAll('.pestanas .pestana')]; return { filas: new Set(bs.map((b) => Math.round(b.getBoundingClientRect().top))).size, cortadas: bs.filter((b) => b.scrollWidth > b.clientWidth + 1).map((b) => b.textContent), letra: parseFloat(getComputedStyle(bs[0]).fontSize), sobra: cu.clientHeight - cu.scrollHeight, rotulo: document.getElementById(cu.getAttribute('aria-labelledby'))?.textContent ?? '' }; })()`);
        comprobar(panel.filas === 1 && !panel.cortadas.length && panel.letra >= 10 && (panel.sobra >= -2 || panel.rotulo === 'Ficha'),
          `${t.id} · panel derecho: pestañas en una fila, enteras y a ${panel.letra} px; la ficha ${panel.sobra >= -2 ? 'cabe sin desplazar' : `desplaza ${-panel.sobra} px dentro de su zona rotulada`}`, JSON.stringify(panel));
      }
    } finally { await p.cerrar(); }
  }
  // Letra grande (el navegador con el tamaño de letra subido): 22 px de base.
  const p = await pestana({ ancho: 1366, alto: 768 });
  try {
    await p.ev(`document.documentElement.style.fontSize = '22px'; true`);
    await aCreacion(p);
    await p.ev(crearPersonajeUI({ nombre: 'Lena', lore: 'Vino del norte con una carta.', descripcion: 'mujer alta de capa gris', hasta: 'aspecto' }));
    await tic(300);
    const m = await p.ev(MEDIDAS);
    await p.foto('G-letra-grande-aspecto.png');
    comprobar(!m.horizontal && !m.pagina && m.siguiente === true && !sinRotulo(m).length, 'letra grande (22 px): el paso «aspecto» no desplaza la página, «Siguiente» sigue a la vista y lo que se desplaza tiene nombre', JSON.stringify({ ...m, desplazables: m.desplazables }));
  } finally { await p.cerrar(); }
});

await caso('G2 · Móvil: los desplegables del dibujo se leen enteros, la imagen se cambia desde la ficha y los controles se pueden tocar', async () => {
  // Cada opción de cada desplegable, medida con SU letra, contra el hueco útil
  // (ancho menos relleno menos la flecha). La captura sola no bastaba: con
  // «pelo negro» salían valores cortos y el de por defecto es «De su linaje».
  const DESPLEGABLES = `(() => { const lienzo = document.createElement('canvas').getContext('2d'); return [...document.querySelectorAll('.aspecto__controles select')].map((s) => { const e = getComputedStyle(s); lienzo.font = e.fontStyle + ' ' + e.fontWeight + ' ' + e.fontSize + ' ' + e.fontFamily; const sep = parseFloat(e.letterSpacing) || 0; const ancho = (t) => { const x = e.textTransform === 'uppercase' ? t.toUpperCase() : t; return lienzo.measureText(x).width + sep * x.length; }; const hueco = s.clientWidth - parseFloat(e.paddingLeft) - parseFloat(e.paddingRight) - 22; const largas = [...s.options].map((o) => ({ texto: o.textContent, ancho: Math.round(ancho(o.textContent)) })).sort((a, b) => b.ancho - a.ancho); return { id: s.id, valor: s.selectedOptions[0]?.textContent ?? '', hueco: Math.round(hueco), masLarga: largas[0], noCaben: largas.filter((o) => o.ancho > hueco).map((o) => o.texto), alto: Math.round(s.getBoundingClientRect().height) }; }); })()`;
  for (const ancho of [390, 393, 412, 320]) {
    const p = await pestana({ ancho, alto: ancho === 320 ? 568 : 844, movil: true });
    try {
      await aCreacion(p);
      await p.ev(crearPersonajeUI({ raza: 'valdes', nombre: 'Lena', lore: 'Vino del norte con una carta.', descripcion: 'mujer alta de capa gris', hasta: 'aspecto' }));
      await tic(400);
      const d = await p.ev(DESPLEGABLES);
      await p.ev(`document.querySelector('#aspecto-pelo').scrollIntoView({ block: 'center' }); true`);
      if (ancho === 390 || ancho === 412) await p.foto(`G2-${ancho}-aspecto-de-su-linaje.png`);
      comprobar(d.length === 2 && d.every((s) => s.valor === 'De su linaje' && !s.noCaben.length && s.alto >= 44),
        `${ancho} px · creación: «De su linaje» y todas las opciones de pelo y ojos caben enteras (hueco ${d.map((s) => s.hueco).join(' y ')} px; la más larga, ${d[0]?.masLarga.ancho} px)`, JSON.stringify(d));
      if (ancho !== 390) continue;
      // En partida: desde la ficha (el resumen estrecho no tiene sitio para el botón).
      await p.ev(`document.querySelector('#creacion-siguiente').click(); true`);
      await p.hasta(`${PASO} === 'revisar' && document.querySelector('#creacion-cara img')?.complete`, 12000);
      await empezar(p);
      const tactil = await p.ev(`(() => { const alto = (q) => [...document.querySelectorAll(q)].filter((n) => n.offsetParent !== null).map((n) => Math.round(n.getBoundingClientRect().height)); return { pestanas: alto('.pestanas .pestana'), vistas: alto('.relato__vista'), barra: alto('.cab__acciones .btn'), plegar: alto('#escena-plegar') }; })()`);
      comprobar([...tactil.pestanas, ...tactil.vistas, ...tactil.barra, ...tactil.plegar].every((h) => h >= 44) && tactil.pestanas.length >= 5 && tactil.vistas.length === 2 && tactil.barra.length >= 3,
        '390 px · partida: pestañas, «Ahora»/«Historial», Menú/Narrador/Guardar y el botón de la ilustración miden al menos 44 px de alto', JSON.stringify(tactil));
      await p.tocar('#pestana-ficha');
      await p.hasta('document.querySelector("#panel-lateral-envoltura").classList.contains("lateral--hoja") && document.querySelector("#ficha-imagen")', 4000);
      const boton = await p.ev(`(() => { const b = document.querySelector('#ficha-imagen'); const r = b.getBoundingClientRect(); const v = document.querySelector('#lateral-volver').getBoundingClientRect(); return { texto: b.textContent, visible: b.offsetParent !== null && r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth, alto: Math.round(r.height), volver: Math.round(v.height), estado: document.querySelector('#ficha-estado')?.textContent ?? '' }; })()`);
      await p.foto('G2-390-ficha-cambiar-imagen.png');
      comprobar(boton.visible && /imagen/i.test(boton.texto) && boton.alto >= 44 && boton.volver >= 44 && /Vida \d+\/\d+/.test(boton.estado), `390 px · en la ficha hay un botón a la vista para la imagen («${boton.texto}», ${boton.alto} px) y la vida en cifras`, JSON.stringify(boton));
      await p.tocar('#ficha-imagen');
      await p.hasta('document.querySelector("#imagen-dialogo[open]") && document.querySelector("#aspecto-pelo")', 5000);
      await tic(300);
      const enDialogo = await p.ev(`(() => { const d = ${DESPLEGABLES}; const g = document.querySelector('#imagen-dialogo').getBoundingClientRect(); const dentro = (q) => { const n = document.querySelector(q); if (!n) return null; const r = n.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight + 1 && r.left >= 0 && r.right <= innerWidth + 1; }; return { d, ancho: Math.round(g.width), horizontal: document.documentElement.scrollWidth > innerWidth + 1, usar: dentro('#imagen-usar'), cerrar: dentro('#imagen-cerrar') }; })()`);
      await p.foto('G2-390-dialogo-imagen.png');
      comprobar(enDialogo.d.length === 2 && enDialogo.d.every((s) => !s.noCaben.length && s.alto >= 44) && !enDialogo.horizontal && enDialogo.usar === true && enDialogo.cerrar === true,
        `390 px · diálogo de imagen en partida: todas las opciones de los dos desplegables caben enteras (hueco ${enDialogo.d.map((s) => s.hueco).join(' y ')} px) y «Usar esta imagen» y «Cerrar sin cambiar» están a la vista`, JSON.stringify(enDialogo));
      await cerrarImagen(p);
    } finally { await p.cerrar(); }
  }
});

await caso('I · Partida guardada sin imagen y ficha antigua sin «aspecto»', async () => {
  const p = await pestana();
  try {
    await aCreacion(p);
    await p.ev(crearPersonajeUI({ raza: 'griscuerno', nombre: 'Ors', lore: 'Baja del paso cada invierno.', descripcion: 'griscuerno de barba gris', imagen: 'ninguno' }));
    await empezar(p);
    await jugar(p, 'miro alrededor');
    await p.ev(`Promise.resolve(ARCANVEIL.sistema('saves').drenar?.(15000)).then(() => true)`);
    const antes = await p.ev(`(async () => ({ galeria: await ${GALERIA}, partida: localStorage.getItem('arcanveil:partida:' + ARCANVEIL.ver('meta.ranura')), ranura: ARCANVEIL.ver('meta.ranura') }))()`);
    // FIXTURE: la ficha del plantel, como las de antes del #12 (sin `aspecto`).
    await p.ev(`(() => { const l = JSON.parse(localStorage.getItem('arcanveil:personajes')); for (const x of l) delete x.aspecto; localStorage.setItem('arcanveil:personajes', JSON.stringify(l)); return true; })()`);
    await p.navegar(c.app);
    await p.hasta(LISTA);
    await p.ev(`document.querySelector('#inicio-jugar').click(); document.querySelector('#menu-continuar').click(); true`);
    await p.hasta('document.body.dataset.activeScreen === "juego" && !ARCANVEIL.sistema("turns")._ocupado', 15000);
    const cargada = await p.ev(`(async () => ({ marcador: Boolean(document.querySelector('#retrato-pj .marcador-arte')), nombre: ARCANVEIL.ver('player.nombre'), vista: document.querySelector('#bitacora').dataset.vista, accion: document.querySelector('#bitacora .linea--jugador')?.textContent, galeria: await ${GALERIA}, partida: localStorage.getItem('arcanveil:partida:${antes.ranura}') }))()`);
    comprobar(cargada.marcador && cargada.nombre === 'Ors' && cargada.galeria.length === 0 && cargada.partida === antes.partida && cargada.vista === 'ahora' && cargada.accion === 'miro alrededor', 'una partida sin imagen se carga igual: su inicial, el último turno en «Ahora» y ni un byte del guardado cambia', JSON.stringify({ ...cargada, partida: cargada.partida === antes.partida }));
    const d = await abrirImagen(p);
    await p.foto('I1-imagen-ficha-antigua-1366x768.png');
    await cerrarImagen(p);
    const tras = await p.ev(`(async () => ({ galeria: await ${GALERIA}, marcador: Boolean(document.querySelector('#retrato-pj .marcador-arte')) }))()`);
    comprobar(d.dibujo && d.estado === 'desconocido' && tras.galeria.length === 0 && tras.marcador, 'con una ficha antigua (sin aspecto guardado) se propone el dibujo, y mirar y cerrar no guarda nada', JSON.stringify({ d: { ...d, texto: undefined }, tras }));
  } finally { await p.cerrar(); }
});

if (pA) await pA.cerrar().catch(() => {});
await contextoA?.cerrar?.();
for (const s of servidores) { s.closeAllConnections?.(); s.close(); }
await c.cerrar();
await rm(cacheImagen, { recursive: true, force: true }).catch(() => {});

console.log(`\n${casos - fallos}/${casos} comprobaciones correctas · capturas en ${salida}`);
// Salida explícita: los procesos hijos (Chrome, servidor) ya están cerrados y
// no se deja el puerto del generador ocupado por un proceso que no termina.
process.exit(fallos ? 1 : 0);
