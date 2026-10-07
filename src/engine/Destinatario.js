/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCANVEIL · engine/Destinatario.js
 * ---------------------------------------------------------------------------
 * Quién RECIBE el ataque, no quién se menciona.
 *
 * «Ataco a Zorvak mientras Korsa mira» pegaba a Korsa, que solo miraba: se
 * buscaba cualquier nombre presente en toda la frase. Aquí se aísla el
 * destinatario: el verbo de ataque, su «a / al / contra» y lo que sigue hasta
 * donde empieza otra cosa (testigos, compañía, instrumento, «mientras»,
 * «delante de», «y», la coma…). Lo usan el router (`_blancoDelAtaque`) y las
 * situaciones (`SituationSystem.intervenir`), con la misma regla.
 *
 * Funciones puras.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const VERBO = /\b(?:ataco|atacamos|golpeo|pego|apunalo|acuchillo|disparo|ensarto|embisto|arremeto|hiero|rajo|mato|asesino|me lanzo|me echo|cargo|asesto|descargo|lanzo|le doy|le pego|le clavo|le corto)\b/;
const CORTA = /\s*(?:[,.;:«»"]|\b(?:mientras|que|con|usando|utilizando|empleando|mediante|y|e|porque|para|cuando|hasta|sin|delante|frente|ante|desde|junto|aunque|pues|si|bajo|tras)\b).*$/;
const QUITA = /\b(?:mientras|delante de|frente a|ante|junto a|con)\b[^,.;]*/g;

/**
 * El trozo que nombra al destinatario.
 *
 * @param {string} llano Frase en minúsculas y sin tildes.
 * @returns {string} «ataco a korsa»; vacío si el verbo no lleva destinatario
 *   («le golpeo»). Sin verbo conocido, la frase sin lo que es escena alrededor.
 */
export function sintagmaDestinatario(llano) {
  const t = String(llano ?? '');
  const v = t.match(VERBO);
  if (!v) return t.replace(QUITA, ' ').replace(/\s+/g, ' ').trim();
  const tras = t.slice(v.index + v[0].length);
  const p = tras.match(/^[^,.;]*?\b(a la|a las|a los|al|a|contra el|contra la|contra los|contra las|contra)\s+(.+)$/);
  if (!p) return '';
  return `${v[0]} ${p[1]} ${p[2].replace(CORTA, '')}`.trim();
}

export default { sintagmaDestinatario };
