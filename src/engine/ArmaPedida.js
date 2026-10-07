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
import { resolver } from '../inventory/IndiceObjetos.js';

const llano = (t) => sinAcentos(String(t ?? '').toLowerCase());

/** «el arco corto», «la daga ritual». */
function conArticulo(objeto) {
  const nombre = objeto.nombre.charAt(0).toLowerCase() + objeto.nombre.slice(1);
  const primera = llano(nombre).split(/\s+/)[0];
  const genero = obtenerPlantilla(objeto.refId)?.genero ?? ARMAS[primera] ?? 'm';
  return `${articulo(nombre, genero)} ${nombre}`;
}

/** Verbos que atacan en primera persona. */
const ATACA = /\b(?:ataco|atacamos|golpeo|pego|apunalo|acuchillo|disparo|ensarto|embisto|arremeto|hiero|rajo|corto el cuello|le corto|le clavo|le doy|le pego|le disparo|le lanzo|lanzo un tajo|tiro un tajo|asesto|descargo|cargo contra|me lanzo contra|me echo encima)\b/;

/** Sacar o empuñar algo: prepara un ataque. Se lee el sintagma entero. */
const DESENVAINA = /\b(?:desenvaino|desenfundo|saco|empuno|blando|enarbolo|tenso|alzo|levanto|preparo|cargo)\s+(.+)$/;

/**
 * Lo que va tras «con», «usando», «utilizando», «empleando»…, hasta donde
 * empieza otra cosa (el blanco, una coma…). «Usando la katana» abría pelea:
 * solo se miraba «con».
 */
const INSTRUMENTO = /\b(?:con|usando|utilizando|empleando|mediante|valiendome de|sirviendome de|ayudandome de)\s+(.+)$/;

/** Hacerse con algo antes («primero cojo el hacha y luego ataco»). */
const ADQUIERE = /\b(?:cojo|tomo|agarro|compro|recojo|consigo|pillo|robo|le quito)\s+(.+)$/;

/** Donde acaba un sintagma de objeto. La coma no: enumera («el cuchillo, el arco y…»). */
const CORTE = /\s*(?:;|\.|[,\s]+(?:a|al|contra|para|porque|mientras|hasta|sin|que|cuando|antes|despues|y luego|y despues|y entonces)\s).*$/;

/** Verbos que solo pueden ser desenvainar/empuñar (cualquier cosa nombrada). */
const DESENVAINA_SIEMPRE = /\b(?:desenvaino|desenfundo|empuno|blando|enarbolo)\b/;

const NEGADO = /^(?:y |pero |luego )?(?:no|nunca|jamas|ni)\b/;

/** Determinantes: delante de un nombre lo convierten en «una cosa concreta». */
const DETERMINANTE = /^(?:el|la|los|las|lo|mi|mis|tu|tus|su|sus|un|una|unos|unas|este|esta|estos|estas|ese|esa|esos|esas|aquel|aquella)$/;
/** «Con toda mi fuerza», «con todas mis ganas»: intensifica un modo, no nombra un objeto. */
const INTENSIFICA = /^(?:todo|toda|todos|todas)$/;
/** El cuerpo: atacar sin arma, con la mecánica que ya hay. */
const CUERPO = new Set(['mano', 'manos', 'puno', 'punos', 'pie', 'pies', 'rodilla', 'rodillas', 'codo', 'codos', 'cabeza', 'frente', 'dientes', 'unas', 'cuerpo', 'hombro', 'patada', 'patadas', 'punetazo', 'punetazos', 'cabezazo']);
/** Lo que es magia la resuelve su propia regla (`Jugada.js`: se dice y no se concede). */
const MAGIA = new Set(['magia', 'hechizo', 'hechizos', 'conjuro', 'conjuros', 'poder', 'poderes', 'runa', 'runas', 'sortilegio']);
const VACIA = new Set(['de', 'del', 'y', 'e']);
/**
 * Modos y maniobras: cómo se ataca, no con qué. Lista CERRADA a propósito:
 * «con katana» (sin artículo) se tomaba por un modo como «con calma» porque
 * valía cualquier palabra desconocida. Ahora lo que no está aquí, en el
 * cuerpo o en la magia es un objeto pedido, y tiene que estar en el
 * inventario.
 */
const MODOS = new Set([
  'calma', 'cuidado', 'sigilo', 'fuerza', 'fuerzas', 'rabia', 'furia', 'ira', 'sana', 'precision', 'rapidez', 'prisa', 'velocidad',
  'cautela', 'tiento', 'mana', 'destreza', 'habilidad', 'astucia', 'decision', 'determinacion', 'valor', 'coraje', 'miedo', 'odio',
  'energia', 'violencia', 'brutalidad', 'contundencia', 'firmeza', 'suavidad', 'tranquilidad', 'serenidad', 'frialdad', 'sangre',
  'ganas', 'empeno', 'intencion', 'alevosia', 'ventaja', 'sorpresa', 'agilidad', 'elegancia', 'torpeza', 'esfuerzo', 'estilo', 'arte',
  'tecnica', 'disimulo', 'discrecion', 'decoro', 'grito', 'gritos', 'rugido', 'alarido', 'golpe', 'golpes', 'tajo', 'tajos',
  'estocada', 'estocadas', 'embestida', 'carga', 'salto', 'finta', 'amago', 'barrido', 'impulso', 'carrerilla', 'impetu',
  // Con «todo/toda mi…»: lo que se pone, no con qué se pega.
  'peso', 'alma', 'corazon', 'empuje', 'potencia', 'vigor', 'brio', 'arrojo', 'temple', 'nervio', 'voluntad', 'aliento',
]);

/** ¿Este trozo ataca? */
export function ataca(texto) {
  const t = llano(texto);
  return !NEGADO.test(t) && ATACA.test(t);
}

/**
 * Los objetos nombrados en un sintagma, separados por la coordinación:
 * «el cuchillo y el hacha», «el cuchillo, el arco», «el cuchillo y hacha».
 * Cada uno con lo que se escribió (con sus tildes) y sus palabras llanas.
 *
 * @param {string} trozo Texto tal y como se escribió, desde el sintagma.
 * @returns {Array<{dicho: string, palabras: string[], determinado: boolean, intensifica: boolean}>}
 */
function sintagmas(trozo) {
  const base = String(trozo).toLowerCase().replace(CORTE, '').trim();
  return base.split(/\s*(?:,|\by\b|\be\b)\s*/).map((s) => s.trim()).filter(Boolean).map((s) => {
    const todas = s.split(/\s+/);
    let i = 0;
    let intensifica = false;
    let determinado = false;
    while (i < todas.length && (DETERMINANTE.test(llano(todas[i])) || INTENSIFICA.test(llano(todas[i])))) {
      if (INTENSIFICA.test(llano(todas[i]))) intensifica = true;
      else determinado = true;
      i += 1;
    }
    const resto = todas.slice(i);
    return { dicho: resto.join(' '), palabras: resto.map(llano).filter((p) => p && !VACIA.has(p)), determinado, intensifica };
  }).filter((s) => s.palabras.length);
}

/**
 * ¿Este trozo saca o empuña un arma? «Desenvaino la katana» sí aunque la
 * katana no sea un arma del catálogo; «saco el mapa» no («sacar» solo cuenta
 * con un arma conocida o un arma que se lleva).
 */
export function desenvaina(texto, objetos = []) {
  const t = String(texto).toLowerCase();
  if (NEGADO.test(llano(t))) return false;
  const m = t.match(DESENVAINA);
  if (!m) return false;
  if (DESENVAINA_SIEMPRE.test(llano(t))) return sintagmas(m[1]).length > 0;
  return sintagmas(m[1]).some((s) => ARMAS[s.palabras[0]] || candidatos(s, objetos).some((o) => o.categoria === 'arma'));
}

/**
 * Lo que el trozo pide usar: tras «con» si ataca, y lo que desenvaina o
 * empuña. El blanco no cuenta («ataco a Korsa, el de la capa»).
 * @param {string} texto
 */
function herramientas(texto) {
  const t = String(texto).toLowerCase();
  if (NEGADO.test(llano(t))) return [];
  const salen = [];
  if (ATACA.test(llano(t))) {
    const m = t.match(INSTRUMENTO);
    if (m) salen.push(...sintagmas(m[1]));
  }
  const d = t.match(DESENVAINA);
  if (d) salen.push(...sintagmas(d[1]));
  return salen;
}

/**
 * Los objetos del inventario que nombra lo dicho, por identidad (ver
 * `inventory/IndiceObjetos.js`): una clave entera, no una palabra suelta.
 * «cuchillo» = el único cuchillo; «cuchillo de caza» también; «cuchillo
 * mágico» no es ninguno. Vacío si no hay; varios si es ambiguo.
 */
function candidatos(s, objetos, equipado = {}) {
  const r = resolver(s.dicho, objetos, { equipado });
  if (r.estado === 'unico') return [r.objeto];
  if (r.estado === 'ambiguo') return r.objetos;
  return [];
}

/**
 * ¿Es un modo («con calma», «con toda mi fuerza»), el cuerpo, magia o una
 * persona («con Korsa mirando»), y no un objeto?
 *
 * Un intensificador («todo», «toda», «todas»…) NO decide nada por sí solo:
 * se quita y se mira lo que queda. «Con toda mi katana» se trataba como
 * «con toda mi fuerza» y abría pelea sin katana.
 */
function noEsObjeto(s, nombres = []) {
  if (CUERPO.has(s.palabras[0]) || MAGIA.has(s.palabras[0]) || MODOS.has(s.palabras[0])) return true;
  if (nombres.some((n) => s.palabras[0] === llano(n).split(/\s+/)[0])) return true;
  return false;
}

/**
 * ¿Hay que aclarar con qué se ataca antes de hacer nada?
 *
 * @param {Object} entrada
 * @param {string[]} entrada.segmentos Los trozos que de verdad hace (sin citas
 *   ni condiciones; ver `Segmentos.ordenar`).
 * @param {Array<Object>} entrada.objetos Inventario (`inventory.objetos.porId`).
 * @param {{armaPrincipal?: string, armaSecundaria?: string}} entrada.equipado
 * @param {string[]} [entrada.nombres] Gente conocida: «con Korsa mirando» no pide un objeto.
 * @returns {null|{motivo: string, arma: string, texto: string}}
 */
export function aclararArma({ segmentos = [], objetos = [], equipado = {}, nombres = [] } = {}) {
  const trozos = segmentos.map(String).filter(Boolean);
  const hayAtaque = trozos.some(ataca);
  const hostiles = trozos.filter((s) => ataca(s) || desenvaina(s, objetos));
  if (!hostiles.length) return null;

  const enMano = new Set([equipado?.armaPrincipal, equipado?.armaSecundaria].filter(Boolean));
  const empunada = objetos.find((o) => enMano.has(o.id));
  const final = hayAtaque ? 'No se ha hecho el ataque.' : 'No se ha hecho nada.';
  const cierre = hayAtaque ? 'Di con qué quieres atacar; no se ha hecho el ataque.' : 'No se ha hecho nada.';
  const lista = (l) => (l.length > 1 ? `${l.slice(0, -1).join(', ')} ni ${l.at(-1)}` : l[0]);

  // Lo que se coge antes, en el mismo orden: no se puede validar aquí
  // después de tenerlo, así que se pide en dos turnos.
  const adquiridas = trozos.flatMap((s) => {
    const m = String(s).toLowerCase().match(ADQUIERE);
    return m ? sintagmas(m[1]) : [];
  });
  const seAdquiere = (s) => adquiridas.some((a) => a.palabras.join(' ') === s.palabras.join(' '));

  // «Primero cojo el hacha y luego ataco»: el arma va en el trozo de coger.
  if (hayAtaque) {
    const falta = adquiridas.filter((s) => (ARMAS[s.palabras[0]] || s.determinado) && !candidatos(s, objetos, equipado).length);
    if (falta.length) {
      return { motivo: 'adquisicion', arma: falta[0].palabras.join(' '), texto: `Todavía no llevas ${lista(falta.map((s) => s.dicho))}: hazte con ello en un turno y ataca en el siguiente. ${final}` };
    }
  }

  // Todos los instrumentos se miran antes de decir nada: «con el cuchillo y
  // el hacha» no puede atacar con el cuchillo y olvidar el hacha.
  const ausentes = [];
  const problemas = [];
  for (const s of hostiles.flatMap(herramientas)) {
    if (noEsObjeto(s, nombres)) continue;
    const encajan = candidatos(s, objetos, equipado);
    if (!encajan.length) {
      if (seAdquiere(s)) continue; // ya se ha pedido arriba
      ausentes.push(s.dicho);
      continue;
    }
    if (encajan.length > 1) {
      problemas.push({ motivo: 'ambigua', arma: s.dicho, texto: `¿Con cuál: ${encajan.map(conArticulo).join(' o ')}? ${final}` });
      continue;
    }
    const objeto = encajan[0];
    // Un objeto que no es arma: la regla de siempre (`Jugada.js`).
    if (objeto.categoria !== 'arma') continue;

    const nombre = conArticulo(objeto);
    const cantidad = Number.isFinite(objeto.cantidad) ? objeto.cantidad : 1;
    const durabilidad = typeof objeto.durabilidad === 'number' ? objeto.durabilidad : objeto.durabilidad?.actual;
    if (cantidad <= 0 || durabilidad === 0) {
      problemas.push({ motivo: 'inservible', arma: s.dicho, texto: `${capitalizar(nombre)} no sirve: está roto o no te queda. ${cierre}` });
      continue;
    }
    if (!enMano.has(objeto.id)) {
      const otra = empunada ? ` (en la mano llevas ${conArticulo(empunada)})` : '';
      problemas.push({ motivo: 'sin_equipar', arma: s.dicho, texto: `Llevas ${nombre}, pero no en la mano${otra}. Equípalo desde el inventario o ataca con lo que empuñas. ${final}` });
    }
  }
  if (ausentes.length) {
    const otros = problemas.map((p) => p.texto.replace(/ No se ha hecho (?:el ataque|nada)\.$/, '').replace(/ Di con qué quieres atacar; no se ha hecho el ataque\.$/, ''));
    return { motivo: 'ausente', arma: ausentes[0], ausentes, texto: `No llevas ${lista(ausentes)}.${otros.length ? ` ${otros.join(' ')}` : ''} ${cierre}` };
  }
  return problemas[0] ?? null;
}

export default { aclararArma, ataca, desenvaina };
