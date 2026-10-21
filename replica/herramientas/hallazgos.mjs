// Recuentos por HALLAZGO (más finos que los temas), sobre replica/reviews.csv,
// con la misma deduplicación que reviews.py. Imprime ids y fuentes, para que
// el revisor pueda repetir cada número.
import { readFileSync } from 'node:fs';
const csv = readFileSync(process.argv[2], 'utf8');
// Lector CSV mínimo (comillas dobles, saltos dentro de comillas).
const filas = []; let f = [], c = '', q = false;
for (let i = 0; i < csv.length; i++) {
  const ch = csv[i];
  if (q) { if (ch === '"') { if (csv[i + 1] === '"') { c += '"'; i++; } else q = false; } else c += ch; }
  else if (ch === '"') q = true; else if (ch === ',') { f.push(c); c = ''; } else if (ch === '\n') { f.push(c); filas.push(f); f = []; c = ''; } else if (ch !== '\r') c += ch;
}
const [cab, ...datos] = filas;
const vistos = new Set();
const rs = datos.map((r) => Object.fromEntries(cab.map((k, i) => [k, r[i] ?? '']))).filter((r) => {
  const k = r.text.toLowerCase().replace(/\W+/gu, ' ').trim(); if (vistos.has(k)) return false; vistos.add(k); return true;
});
const H = {
  'memoria-continuidad': /\bmemor|\bforg[eo]t|\bolvid|\bcontinuity\b|\bcontext\b|keep the story straight|lose their relevance|still an ongoing story thread|reminding the ai|mistakes about characters|rewriting a key character|se contradice|coherent story/i,
  'eco-apropiacion': /repetir tu respuesta|mis ideas como argumentos|repeticiones de lo que tu|takes your input and rewords|apoya cada cosa|won'?t take the initiative|no te lleva por una historia|does not listen to your inputs/i,
  'estado-motor': /\bhps?\b|heal|no se resta la vida|inventor|keeping tracks? of|didn'?t have a sword|weapons disappear|simple math|\bxp\b|no lo cuenta como tal|resucita o mata/i,
  'combate-frecuencia-dificultad': /forced deaths|every third turn|there'?s a fight|attacked by random|creature after creature|died|nerf low-level|city guard attack|evitar los enemigos|poorly balanced|monsters just attack first|getting cooked/i,
  'cuota-espera': /\b(4|cuatro|10|2) (horas|hours)\b|cada 4|wait|esperar|esperando|replenish|recargar|stack up|build up|se pierden|run out|runs out|start out with 20|22 turns/i,
  'aclarar-cuesta': /clarify|correction message|correcting the ai|costs you another token|spent hundreds of tokens trying to fix/i,
  'personaje-no-escucha': /acertar con el personaje|change avatars|make a character|forgot my character|portrait|ai creation was better/i,
  'partidas-largas': /turn 6000|2700 tokens|past 150 turns|140\+ moves|crash/i,
  'variedad': /same (story|thread|beats|basic goal|enemies|mechanics)|variety|stale|loops of narration|repetitive as you continue|space opera/i,
  'companeros-pasivos': /party members|servants who all seem to fail/i,
  'dados-reglas': /\bdice\b|tiradas de dados|reglas claras|ability checks|stats\b/i,
  'multijugador': /multiplayer|multijugador|online play|play with my friends|amigos d&d/i,
  'anuncios': /\bads\b|anuncios|publicidad|video watching|watch videos/i,
  'no-poder-pagar': /can'?t buy token|spend my money more openly|if you have money|si no pagas|sin usar dinero real|prefiero leer un libro/i,
};
for (const [k, re] of Object.entries(H)) {
  const m = rs.filter((r) => re.test(r.text));
  const fuentes = [...new Set(m.map((r) => r.source))];
  console.log(`${k}: ${m.length} reseñas · ${fuentes.length} fuentes (${fuentes.join(', ')}) · estrellas medias ${(m.reduce((s, r) => s + Number(r.rating), 0) / (m.length || 1)).toFixed(1)}`);
  console.log('   ' + m.map((r) => `${r.source === 'app-store' ? 'A' : 'G'}:${r.id.slice(0, 8)}:${r.rating}`).join(' '));
}
console.log(`\nTotal tras deduplicar: ${rs.length}`);
