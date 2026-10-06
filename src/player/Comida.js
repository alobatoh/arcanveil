/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCANVEIL · player/Comida.js
 * ---------------------------------------------------------------------------
 * Comer y acampar, desde el 6-oct-2026.
 *
 * Decisión: el hambre y la sed dejan de ser presión de supervivencia. No
 * bajan con el tiempo, no hacen daño, no restan a las tiradas y no hay que
 * comer ni beber para mantenerlas. Comer sirve para una cosa: recuperar VIDA
 * en un CAMPAMENTO.
 *
 * Campamento: algo del estado (`world.campamento`, en el lugar donde está el
 * personaje y fuera de un interior), que se monta con una acción explícita
 * («acampo», «monto el campamento») y se deshace al desmontarlo o al irse
 * de ese lugar. Decir «estoy en un campamento» no lo crea, ni lo hace que
 * el nombre de un sitio contenga «campamento». Un campamento no hace seguro
 * un sitio.
 *
 * Funciones puras.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { sinAcentos } from '../utils/text.js';
import { COMIDA } from '../config/balance.config.js';

const llano = (t) => sinAcentos(String(t ?? '').toLowerCase()).replace(/[¿?¡!.,;:«»"]/g, ' ').replace(/\s+/g, ' ').trim();
const INICIO = '^(?:y |luego |entonces |ahora |primero )?';

/** Montar el campamento (no «levantar», que en castellano es desmontarlo). */
const MONTA = new RegExp(`${INICIO}(?:acampo|acampamos|monto (?:el |un |mi |nuestro )?campamento|montamos (?:el |un |nuestro )?campamento|hago (?:un )?campamento|hacemos (?:un )?campamento|planto (?:el |un )?campamento|plantamos (?:el |un )?campamento)\\b`);
/** Desmontarlo. */
const DESMONTA = new RegExp(`${INICIO}(?:levanto|levantamos|recojo|recogemos|desmonto|desmontamos|deshago|deshacemos) (?:el |mi |nuestro )?campamento\\b`);

/** Comer algo. */
const COME = new RegExp(`${INICIO}(?:como|me como|nos comemos|comemos|ceno|cenamos|almuerzo|desayuno|meriendo|pico)\\s+(.+)$`);
/** Lo que se come sin nombrar un objeto concreto. */
const GENERICO = /^(?:algo|un poco|un bocado|un trozo|lo que (?:llevo|tengo)|de lo que (?:llevo|tengo)|unas? (?:raciones?|provisiones?)|las? (?:raciones?|provisiones?)|mis? (?:raciones?|provisiones?))\b/;

/** ¿Monta o desmonta el campamento? */
export function leerCampamento(texto) {
  const t = llano(texto);
  if (DESMONTA.test(t)) return 'desmonta';
  if (MONTA.test(t)) return 'monta';
  return null;
}

/** ¿Es comida (de verdad, no un objeto cualquiera)? */
export function esComida(objeto) {
  return objeto?.categoria === 'consumible' && (objeto.subtipo === 'comida' || objeto.efecto?.tipo === 'comida');
}

/**
 * ¿Quiere comer, y qué? Sin efectos.
 * @param {string} texto
 * @param {Array<Object>} objetos Inventario.
 * @returns {null|{objeto: Object|null, dicho: string}} null: no habla de comer.
 */
export function leerComer(texto, objetos = []) {
  const t = llano(texto);
  const m = t.match(COME);
  if (!m) return null;
  const resto = m[1].replace(/^(?:el |la |los |las |un |una |mi |mis |algo de |un poco de |un trozo de )/, '');
  const comidas = objetos.filter((o) => esComida(o) && (o.cantidad ?? 1) > 0);
  const nombrada = comidas.find((o) => {
    const palabras = llano(o.nombre).split(/\s+/).filter((p) => p.length > 2 && p !== 'de');
    return palabras.some((p) => resto.startsWith(p.slice(0, Math.max(4, p.length - 2))));
  });
  if (nombrada) return { objeto: nombrada, dicho: m[1] };
  // «como algo», «como un bocado»: lo primero que sea comida.
  if (GENERICO.test(m[1])) return { objeto: comidas[0] ?? null, dicho: m[1] };
  // Nombra algo que no lleva («como queso»): se dice, sin crear nada.
  return { objeto: null, dicho: m[1] };
}

/** ¿Hay un campamento válido aquí? */
export function campamentoValido({ campamento, ubicacion, sublugar } = {}) {
  return Boolean(campamento && campamento.lugar && campamento.lugar === ubicacion && !sublugar);
}

/** Vida que devuelve una comida: una fracción de la máxima, al menos 1. */
export function curacionPorComida(vidaMax) {
  return Math.max(1, Math.round((Number(vidaMax) || 0) * COMIDA.curaVidaFraccion));
}

/**
 * ¿Se puede comer ESTO ahora? Sin efectos: lo usan el router (por texto) y
 * el inventario (botón «Usar»), con el mismo resultado.
 *
 * @returns {{ok: true, cura: number}|{ok: false, motivo: string, texto: string}}
 */
export function puedeComer({ objeto, vida, enCampamento }) {
  if (!objeto || (objeto.cantidad ?? 1) <= 0) {
    return { ok: false, motivo: 'sin_comida', texto: 'No llevas nada de comer. No has gastado nada.' };
  }
  if (!esComida(objeto)) {
    return { ok: false, motivo: 'no_es_comida', texto: `${objeto.nombre} no se come. No has gastado nada.` };
  }
  if (!enCampamento) {
    return { ok: false, motivo: 'fuera', texto: 'Comer solo te repone en un campamento: monta uno («acampo») y come allí. No has gastado nada.' };
  }
  const actual = vida?.actual ?? 0;
  const max = vida?.max ?? 0;
  if (actual >= max) {
    return { ok: false, motivo: 'vida_llena', texto: 'Tienes la vida llena: comer ahora no te serviría de nada. No has gastado nada.' };
  }
  return { ok: true, cura: Math.min(max - actual, curacionPorComida(max)) };
}

export default { leerCampamento, leerComer, esComida, campamentoValido, curacionPorComida, puedeComer };
