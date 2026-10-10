/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCANVEIL · art/dibujo.js
 * ---------------------------------------------------------------------------
 * El DIBUJO DEL JUEGO: un retrato que el propio navegador dibuja, sin IA,
 * sin red y sin ningún programa instalado. Es la alternativa que siempre
 * está: quien no tiene generador de imágenes en su equipo (lo normal) no se
 * queda con una inicial en un rectángulo.
 *
 * No es una generación fiel de un texto: dibuja una cara del LINAJE del
 * personaje y solo cambia lo que hay en los controles (color de pelo, color
 * de ojos, cuatro rasgos y la variante de cara). Eso es lo que se le dice al
 * jugador, y eso es lo que hace. La descripción escrita se usa solo para
 * PROPONER los controles (si dice «pelo plateado», sale plateado marcado):
 * el jugador ve qué se entendió y lo cambia. Ni la descripción ni las reglas
 * se tocan para que coincidan con el dibujo.
 *
 * El dibujo elegido se guarda como una imagen más de la galería
 * (`galeria.js`, PNG): recarga, sin red y borrado funcionan igual que con
 * cualquier retrato elegido. La conversión a PNG (`rasterizar`) necesita un
 * navegador; el resto del módulo es puro y se prueba en Node.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { retrato } from './retrato.js';
import { LINAJES } from './paleta.js';

/** Estilo con el que el dibujo queda apuntado en la galería. */
export const ESTILO_DIBUJO = 'dibujo-del-juego';

/** Lo que el dibujo sabe cambiar. `id: ''` es «el de su linaje». */
export const PELOS = Object.freeze([
  { id: '', nombre: 'De su linaje' },
  { id: 'negro', nombre: 'Negro' },
  { id: 'rojo', nombre: 'Rojo' },
  { id: 'plateado', nombre: 'Plateado' },
  { id: 'rubio', nombre: 'Rubio' },
]);
export const OJOS = Object.freeze([
  { id: '', nombre: 'De su linaje' },
  { id: 'azules', nombre: 'Azules' },
  { id: 'verdes', nombre: 'Verdes' },
  { id: 'dorados', nombre: 'Dorados' },
  { id: 'rojos', nombre: 'Rojos' },
  { id: 'violetas', nombre: 'Violetas' },
]);
export const RASGOS = Object.freeze([
  { id: 'cicatriz', nombre: 'Cicatriz' },
  { id: 'parche', nombre: 'Parche en el ojo' },
  { id: 'barba', nombre: 'Barba' },
  { id: 'capucha', nombre: 'Capucha' },
]);
/** Los rasgos que el dibujo de un linaje lleva SIEMPRE (marcarlos no cambia nada). */
export const rasgosDeLinaje = (raza) => RASGOS.filter((r) => LINAJES[raza]?.rasgo === r.id).map((r) => r.id);
/** Cuántas caras distintas hay por linaje («Otra cara» da la vuelta). */
export const CARAS = 6;

/** El aspecto por defecto: todo «el de su linaje», primera cara. */
export function aspectoBase() {
  return { tipo: 'dibujo', pelo: '', ojos: '', rasgos: [], cara: 0 };
}

/** Deja un aspecto en valores que el dibujo entiende (lo demás se descarta). */
export function normalizarAspecto(a) {
  const base = aspectoBase();
  if (!a || typeof a !== 'object') return base;
  const en = (lista, v) => (lista.some((x) => x.id === v) ? v : '');
  return {
    tipo: 'dibujo',
    pelo: en(PELOS, String(a.pelo ?? '')),
    ojos: en(OJOS, String(a.ojos ?? '')),
    rasgos: RASGOS.map((r) => r.id).filter((id) => Array.isArray(a.rasgos) && a.rasgos.includes(id)),
    cara: Number.isInteger(a.cara) ? ((a.cara % CARAS) + CARAS) % CARAS : 0,
  };
}

const plano = (texto) => String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Propone un aspecto a partir de la descripción escrita: SOLO lo que el
 * dibujo sabe hacer. Devuelve también qué palabras reconoció, para decirlo.
 *
 * @param {string} texto
 * @returns {{aspecto: Object, reconocido: string[]}}
 */
export function aspectoDesdeDescripcion(texto) {
  const d = plano(texto);
  const a = aspectoBase();
  const reconocido = [];
  const pelo = /(?:pelo|cabello|melena) (?:\w+ ){0,2}?(rojo|rojiz\w*|pelirroj\w*|negro|azabache|blanco|plateado|cano|canoso|dorado|rubi\w*)/.exec(d)?.[1] ?? (/pelirroj/.test(d) ? 'pelirroj' : null);
  if (pelo) {
    a.pelo = /roj/.test(pelo) ? 'rojo' : /negro|azabache/.test(pelo) ? 'negro' : /blanco|plateado|cano/.test(pelo) ? 'plateado' : 'rubio';
    reconocido.push(`pelo ${PELOS.find((x) => x.id === a.pelo).nombre.toLowerCase()}`);
  }
  const ojos = /ojos? (?:\w+ ){0,2}?(rojos?|carmesi|escarlata|azul(?:es)?|celestes?|verdes?|dorados?|ambar|violetas?|morados?)/.exec(d)?.[1];
  if (ojos) {
    a.ojos = /roj|carmesi|escarlata/.test(ojos) ? 'rojos' : /azul|celeste/.test(ojos) ? 'azules' : /verde/.test(ojos) ? 'verdes' : /dorad|ambar/.test(ojos) ? 'dorados' : 'violetas';
    reconocido.push(`ojos ${a.ojos}`);
  }
  for (const [id, patron, nombre] of [['cicatriz', /cicatri/, 'cicatriz'], ['parche', /parche/, 'parche'], ['barba', /barba|barbud/, 'barba'], ['capucha', /capucha|encapuchad/, 'capucha']]) {
    if (patron.test(d)) { a.rasgos.push(id); reconocido.push(nombre); }
  }
  return { aspecto: normalizarAspecto(a), reconocido };
}

/** Las palabras que el generador vectorial entiende, a partir de los controles. */
function palabrasDe(aspecto) {
  const a = normalizarAspecto(aspecto);
  const partes = [];
  if (a.pelo) partes.push(`pelo ${a.pelo}`);
  if (a.ojos) partes.push(`ojos ${a.ojos}`);
  partes.push(...a.rasgos);
  return partes.join(', ');
}

/**
 * Lo que el generador vectorial (`retrato.js`) necesita para dibujar a un
 * personaje con ese aspecto. Sirve para pintarlo en pantalla por la vía de
 * siempre (`pintarArte`, familia «retratos») y para sacar su SVG.
 *
 * @param {{raza?: string, nombre?: string}} personaje
 * @param {Object} aspecto
 * @returns {{raza: string, nombre: string, semilla: string, descripcion: string}}
 */
export function opcionesDibujo(personaje = {}, aspecto = null) {
  const a = normalizarAspecto(aspecto);
  return {
    raza: personaje.raza,
    nombre: personaje.nombre ?? '',
    // La cara depende del linaje y de la variante elegida, no del nombre ni
    // del id: «Otra cara» es lo único que la cambia.
    semilla: `dibujo:${a.cara}`,
    descripcion: palabrasDe(a),
  };
}

/**
 * El SVG del dibujo de un personaje con ese aspecto.
 *
 * @param {{raza?: string, nombre?: string}} personaje
 * @param {Object} aspecto
 * @returns {string} SVG completo.
 */
export function svgDibujo(personaje = {}, aspecto = null) {
  return retrato(opcionesDibujo(personaje, aspecto));
}

/** Qué se ve en el dibujo, en una frase (para el texto alternativo y la revisión). */
export function describirDibujo(aspecto) {
  const a = normalizarAspecto(aspecto);
  const partes = [];
  if (a.pelo) partes.push(`pelo ${PELOS.find((x) => x.id === a.pelo).nombre.toLowerCase()}`);
  if (a.ojos) partes.push(`ojos ${a.ojos}`);
  for (const r of a.rasgos) partes.push(RASGOS.find((x) => x.id === r).nombre.toLowerCase());
  return partes.length ? partes.join(', ') : 'rasgos de su linaje';
}

/**
 * Convierte el SVG en un PNG (lo que la galería guarda). Solo en navegador.
 *
 * @param {string} svg
 * @param {{ancho?: number, alto?: number}} [tam]
 * @returns {Promise<Blob>}
 */
export function rasterizar(svg, { ancho = 400, alto = 480 } = {}) {
  return new Promise((ok, mal) => {
    if (typeof document === 'undefined' || typeof Image === 'undefined') { mal(new Error('sin navegador')); return; }
    const conTamano = String(svg).replace(/^<svg /, `<svg width="${ancho}" height="${alto}" `);
    const url = URL.createObjectURL(new Blob([conTamano], { type: 'image/svg+xml' }));
    const img = new Image();
    const soltar = () => URL.revokeObjectURL(url);
    img.onload = () => {
      try {
        const lienzo = document.createElement('canvas');
        lienzo.width = ancho; lienzo.height = alto;
        lienzo.getContext('2d').drawImage(img, 0, 0, ancho, alto);
        lienzo.toBlob((b) => { soltar(); if (b) ok(b); else mal(new Error('el navegador no pudo guardar el dibujo')); }, 'image/png');
      } catch (e) { soltar(); mal(e); }
    };
    img.onerror = () => { soltar(); mal(new Error('el navegador no pudo dibujar el retrato')); };
    img.src = url;
  });
}

export default {
  ESTILO_DIBUJO, PELOS, OJOS, RASGOS, CARAS,
  aspectoBase, normalizarAspecto, aspectoDesdeDescripcion, opcionesDibujo, svgDibujo, describirDibujo, rasterizar,
};
