/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCANVEIL · engine/ArmaPedida.js
 * ---------------------------------------------------------------------------
 * ¿Con qué ataca? Comprobación previa, sin tocar nada.
 *
 * «ataco a Korsa con el hacha», sin hacha, salía «Intentas atacar a Korsa con
 * el hacha. Sale mal, y además llama la atención…» y gastaba un turno: se
 * tiraba un ataque con un arma que no existe. En combate, «No llevas hacha:
 * atacas con tu cuchillo», que es atacar por el jugador con otra cosa.
 *
 * Contrato: antes de tirar, intervenir en una situación, mover reputación o
 * abrir combate, si la orden ataca (o desenvaina, empuña…) con un arma que no
 * está, no se puede usar o no está en la mano, se aclara y NO se hace nada.
 * Lo usan las dos rutas: `TurnResolver.procesar` y
 * `CombatManager.jugadaLibre`.
 *
 * Qué cuenta como herramienta pedida:
 *   · Lo que va tras «con» en un trozo que ataca («con el hacha», «con mi
 *     cuchillo de caza»), y lo que se desenvaina o empuña («desenvaino el
 *     hacha»). El blanco no: «ataco a Korsa, el de la capa» no pide una capa.
 *   · Solo si es un arma conocida (`ARMAS`) o un objeto del inventario. «Con
 *     calma», «con fuerza», «con sigilo» no son objetos: no es una lista de
 *     adverbios, es que no hay ningún arma ni objeto que se llame así.
 *   · Un objeto que no es arma («con la cuerda») sigue la regla de siempre de
 *     `Jugada.js` (ingenio, +1): no se aclara ni se convierte en arma.
 *
 * Funciones puras.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { sinAcentos, articulo, capitalizar } from '../utils/text.js';
import { ARMAS } from './IntentParser.js';
import { obtenerPlantilla } from '../data/items.data.js';

const llano = (t) => sinAcentos(String(t ?? '').toLowerCase());

/** «el arco corto», «la daga ritual». */
function conArticulo(objeto) {
  const nombre = objeto.nombre.charAt(0).toLowerCase() + objeto.nombre.slice(1);
  const primera = llano(nombre).split(/\s+/)[0];
  const genero = obtenerPlantilla(objeto.refId)?.genero ?? ARMAS[primera] ?? 'm';
  return `${articulo(nombre, genero)} ${nombre}`;
}

/** Nombres de arma con tilde, tal y como se escriben. */
const CON_TILDE = Object.freeze({ punal: 'puñal', baston: 'bastón' });
const dicha = (w) => CON_TILDE[w] ?? w;

const DET = '(?:el |la |los |las |mi |mis |tu |su |sus |un |una |este |esta |ese |esa |aquel |aquella )?';

/** Verbos que atacan en primera persona. */
const ATACA = /\b(?:ataco|atacamos|golpeo|pego|apunalo|acuchillo|disparo|ensarto|embisto|arremeto|hiero|rajo|corto el cuello|le corto|le clavo|le doy|le pego|le disparo|le lanzo|lanzo un tajo|tiro un tajo|asesto|descargo|cargo contra|me lanzo contra|me echo encima)\b/;

/** Sacar o empuñar un arma: prepara un ataque. */
const DESENVAINA = new RegExp(`\\b(?:desenvaino|desenfundo|saco|empuno|blando|enarbolo|tenso|alzo|levanto|preparo|cargo)\\s+${DET}([a-zñ]+)`, 'g');

/** Lo que va tras «con». */
const INSTRUMENTO = new RegExp(`\\bcon\\s+${DET}([a-zñ]+)`, 'g');

/** Hacerse con algo antes («primero cojo el hacha y luego ataco»). */
const ADQUIERE = new RegExp(`\\b(?:cojo|tomo|agarro|compro|recojo|consigo|pillo|robo|le quito)\\s+${DET}([a-zñ]+)`, 'g');

const NEGADO = /^(?:y |pero |luego )?(?:no|nunca|jamas|ni)\b/;

/** ¿Este trozo ataca? */
export function ataca(texto) {
  const t = llano(texto);
  return !NEGADO.test(t) && ATACA.test(t);
}

/** ¿Este trozo saca o empuña un arma conocida? */
export function desenvaina(texto) {
  const t = llano(texto);
  if (NEGADO.test(t)) return false;
  return [...t.matchAll(DESENVAINA)].some((m) => ARMAS[m[1]]);
}

/**
 * Las palabras de herramienta de un trozo, sin decidir aún si existen.
 * @param {string} texto
 * @returns {string[]}
 */
function herramientas(texto) {
  const t = llano(texto);
  if (NEGADO.test(t)) return [];
  const salen = [];
  if (ATACA.test(t)) for (const m of t.matchAll(INSTRUMENTO)) salen.push(m[1]);
  for (const m of t.matchAll(DESENVAINA)) salen.push(m[1]);
  return salen;
}

/** El objeto del inventario que se llama así, por la primera palabra o el arma que es. */
function buscar(palabra, objetos) {
  return objetos.find((o) => {
    const n = llano(o.nombre).split(/\s+/);
    return n[0] === palabra || n.includes(palabra) || (palabra.length >= 5 && n[0].startsWith(palabra.slice(0, -1)));
  }) ?? null;
}

/**
 * ¿Hay que aclarar con qué se ataca antes de hacer nada?
 *
 * @param {Object} entrada
 * @param {string[]} entrada.segmentos Los trozos que de verdad hace (sin citas
 *   ni condiciones; ver `Segmentos.ordenar`).
 * @param {Array<Object>} entrada.objetos Inventario (`inventory.objetos.porId`).
 * @param {{armaPrincipal?: string, armaSecundaria?: string}} entrada.equipado
 * @returns {null|{motivo: string, arma: string, texto: string}}
 */
export function aclararArma({ segmentos = [], objetos = [], equipado = {} } = {}) {
  const trozos = segmentos.map(String).filter(Boolean);
  const hayAtaque = trozos.some(ataca);
  const hostiles = trozos.filter((s) => ataca(s) || desenvaina(s));
  if (!hostiles.length) return null;

  const enMano = new Set([equipado?.armaPrincipal, equipado?.armaSecundaria].filter(Boolean));
  const empunada = objetos.find((o) => enMano.has(o.id));
  const cierre = hayAtaque ? 'Di con qué quieres atacar; no se ha hecho el ataque.' : 'No se ha hecho nada.';

  // Lo que se coge antes, en el mismo orden: no se puede validar aquí
  // después de tenerlo, así que se pide en dos turnos.
  const adquiridas = new Set(trozos.flatMap((s) => [...llano(s).matchAll(ADQUIERE)].map((m) => m[1])));

  // «Primero cojo el hacha y luego ataco»: el arma va en el trozo de coger.
  // Si no la lleva aún, el ataque dependería de algo que no ha pasado.
  if (hayAtaque) {
    for (const palabra of adquiridas) {
      if (ARMAS[palabra] && !buscar(palabra, objetos)) {
        return { motivo: 'adquisicion', arma: palabra, texto: `Todavía no llevas ${dicha(palabra)}: hazte con ella en un turno y ataca en el siguiente. No se ha hecho el ataque.` };
      }
    }
  }

  for (const palabra of hostiles.flatMap(herramientas)) {
    const objeto = buscar(palabra, objetos);
    if (!objeto) {
      if (!ARMAS[palabra]) continue; // «con calma»: no es un arma ni algo que lleve.
      if (adquiridas.has(palabra)) {
        return { motivo: 'adquisicion', arma: palabra, texto: `Todavía no llevas ${dicha(palabra)}: hazte con ella en un turno y ataca en el siguiente. ${hayAtaque ? 'No se ha hecho el ataque.' : 'No se ha hecho nada.'}` };
      }
      return { motivo: 'ausente', arma: palabra, texto: `No llevas ${dicha(palabra)}. ${cierre}` };
    }
    // Un objeto que no es arma: la regla de siempre (`Jugada.js`).
    if (objeto.categoria !== 'arma') continue;

    const nombre = conArticulo(objeto);
    const cantidad = Number.isFinite(objeto.cantidad) ? objeto.cantidad : 1;
    const durabilidad = typeof objeto.durabilidad === 'number' ? objeto.durabilidad : objeto.durabilidad?.actual;
    if (cantidad <= 0 || durabilidad === 0) {
      return { motivo: 'inservible', arma: palabra, texto: `${capitalizar(nombre)} no sirve: está roto o no te queda. ${cierre}` };
    }
    if (!enMano.has(objeto.id)) {
      const otra = empunada ? ` (en la mano llevas ${conArticulo(empunada)})` : '';
      return { motivo: 'sin_equipar', arma: palabra, texto: `Llevas ${nombre}, pero no en la mano${otra}. Equípalo desde el inventario o ataca con lo que empuñas. ${hayAtaque ? 'No se ha hecho el ataque.' : 'No se ha hecho nada.'}` };
    }
  }
  return null;
}

export default { aclararArma, ataca, desenvaina };
