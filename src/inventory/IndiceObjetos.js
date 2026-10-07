/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCANVEIL · inventory/IndiceObjetos.js
 * ---------------------------------------------------------------------------
 * Qué objeto concreto nombra el jugador: por IDENTIDAD, no por palabra suelta.
 *
 * Pasaba: «ataco con katana» sin katana abría pelea («katana» sin artículo se
 * tomaba por un modo, como «con calma»), y «como raciones mágicas» se comía
 * una ración normal (bastaba con que empezara por «racion»). La palabra no es
 * la identidad: el permiso para usar algo sale del inventario REAL del
 * personaje, objeto por objeto, por su ID.
 *
 * Índice: `Map` derivado del inventario vigente (`inventory.objetos.porId`),
 * construido en cada consulta. No se guarda (el estado serializable sigue
 * siendo el objeto plano) ni se cachea, así que no puede quedarse viejo tras
 * cargar, coger, gastar, romper, equipar o cambiar de personaje.
 *
 * Claves de cada objeto (alias explícitos, documentados):
 *   · su nombre completo («cuchillo de caza», «ración de viaje»);
 *   · su sustantivo de cabeza («cuchillo», «ración»), que vale si es único;
 *   · «arma» para lo que se empuña.
 * Normalización: minúsculas, sin tildes, sin lo que va entre paréntesis
 * («Cuerda (15 m)» → «cuerda») y cada palabra en singular («raciones» →
 * «racion», «flechas» → «flecha»). Lo dicho tiene que ser UNA clave entera:
 * «cuchillo mágico» no es «cuchillo», ni «ración de oro» es «ración».
 *
 * Varias copias del mismo objeto (mismo `refId` y nombre: dos montones de
 * raciones) son lo mismo para quien juega: se toma la empuñada o la que
 * sirva. Objetos distintos que comparten clave («cuchillo» con dos cuchillos
 * distintos) son ambiguos: se pregunta, no se coge el primero.
 *
 * Funciones puras.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { sinAcentos } from '../utils/text.js';

/** Determinantes y cuantificadores que no forman parte del nombre. */
const DELANTE = /^(?:(?:el|la|los|las|lo|mi|mis|tu|tus|su|sus|un|una|unos|unas|este|esta|estos|estas|ese|esa|esos|esas|aquel|aquella|otro|otra)\s+|(?:algo|un poco|un trozo|un par|un pedazo|un bocado)\s+de\s+)+/;

/** Una palabra en singular (regla corta, la del castellano corriente). */
export function singular(p) {
  if (p.length <= 3) return p;
  if (/ces$/.test(p)) return `${p.slice(0, -3)}z`; // luces → luz
  if (/[lrndj]es$/.test(p)) return p.slice(0, -2); // raciones → racion
  if (/[aeiou]s$/.test(p)) return p.slice(0, -1); // flechas → flecha
  return p;
}

/** Texto a clave: minúsculas, sin tildes, sin paréntesis, en singular. */
export function normalizar(texto) {
  return sinAcentos(String(texto ?? '').toLowerCase())
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-zñ0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(DELANTE, '')
    .split(' ')
    .filter(Boolean)
    .map(singular)
    .join(' ');
}

/** Las claves de un objeto. */
export function clavesDe(objeto) {
  const entero = normalizar(objeto?.nombre);
  if (!entero) return [];
  const cabeza = entero.split(' ')[0];
  return [...new Set([entero, cabeza])];
}

/**
 * El índice del inventario vigente.
 * @param {Object|Array<Object>} objetos `inventory.objetos.porId` o su lista.
 * @param {{armaPrincipal?: string, armaSecundaria?: string}} [equipado]
 * @returns {{porId: Map<string, Object>, porClave: Map<string, string[]>}}
 */
export function indiceDe(objetos, equipado = {}) {
  const lista = Array.isArray(objetos) ? objetos : Object.values(objetos ?? {});
  const porId = new Map();
  const porClave = new Map();
  const anotar = (clave, id) => {
    if (!porClave.has(clave)) porClave.set(clave, []);
    if (!porClave.get(clave).includes(id)) porClave.get(clave).push(id);
  };
  const enMano = new Set([equipado?.armaPrincipal, equipado?.armaSecundaria].filter(Boolean));
  for (const o of lista) {
    if (!o?.id || !o.nombre) continue;
    porId.set(o.id, o);
    for (const c of clavesDe(o)) anotar(c, o.id);
    if (enMano.has(o.id)) anotar('arma', o.id);
  }
  return { porId, porClave };
}

const usable = (o) => (Number.isFinite(o.cantidad) ? o.cantidad : 1) > 0;

/**
 * ¿Qué objeto nombra `dicho`?
 *
 * @param {string} dicho «el cuchillo de caza», «katana», «raciones mágicas».
 * @param {Object|Array<Object>} objetos Inventario vigente.
 * @param {Object} [opciones]
 * @param {Object} [opciones.equipado] `inventory.equipado`.
 * @param {(o: Object) => boolean} [opciones.filtro] Solo entre estos (p. ej. comida).
 * @returns {{estado: 'unico', objeto: Object, id: string}
 *   | {estado: 'ambiguo', objetos: Object[]}
 *   | {estado: 'ninguno', clave: string}}
 */
export function resolver(dicho, objetos, { equipado = {}, filtro = null } = {}) {
  const { porId, porClave } = indiceDe(objetos, equipado);
  const clave = normalizar(dicho);
  const ids = (porClave.get(clave) ?? []).filter((id) => !filtro || filtro(porId.get(id)));
  if (!ids.length) return { estado: 'ninguno', clave };

  // Agrupa copias del mismo objeto; objetos distintos son una elección.
  const grupos = new Map();
  for (const id of ids) {
    const o = porId.get(id);
    const g = `${o.refId ?? ''}|${normalizar(o.nombre)}`;
    if (!grupos.has(g)) grupos.set(g, []);
    grupos.get(g).push(o);
  }
  if (grupos.size > 1) return { estado: 'ambiguo', objetos: [...grupos.values()].map((g) => g[0]) };

  const copias = [...grupos.values()][0];
  const enMano = new Set([equipado?.armaPrincipal, equipado?.armaSecundaria].filter(Boolean));
  const objeto = copias.find((o) => enMano.has(o.id)) ?? copias.find(usable) ?? copias[0];
  return { estado: 'unico', objeto, id: objeto.id };
}

export default { normalizar, singular, clavesDe, indiceDe, resolver };
