// Monta replica/reviews.csv con lo leído, SIN tocar el texto de ninguna reseña.
// Columnas: source,url,date,rating,text (las que usa reviews.py) + id,title,lang.
import { readFileSync, writeFileSync } from 'node:fs';
const [dir, salida] = process.argv.slice(2);
const leer = (f) => JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'));
const play = (lang, extra) => (r) => ({
  source: 'google-play',
  url: `https://play.google.com/store/apps/details?id=com.aisuccess.ai_game_master&reviewId=${r[0]}&hl=${extra}`,
  date: r[1], rating: String(r[2]), text: r[3], id: r[0], title: '', lang,
});
const filas = [
  ...leer('play-es.json').map(play('es', 'es')),
  ...leer('play-en.json').map(play('en', 'en&gl=US')),
];
const FEED = 'https://itunes.apple.com/us/rss/customerreviews/page=1/id=6475002750/sortBy=mostRecent/json';
for (const e of [].concat(leer('apple-us.json').feed.entry ?? [])) {
  filas.push({
    source: 'app-store', url: FEED, date: e.updated.label.slice(0, 10), rating: e['im:rating'].label,
    text: e.content.label, id: e.id.label, title: e.title.label, lang: 'en',
  });
}
const COLS = ['source', 'url', 'date', 'rating', 'text', 'id', 'title', 'lang'];
const celda = (v) => /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
writeFileSync(salida, [COLS.join(','), ...filas.map((f) => COLS.map((c) => celda(f[c] ?? '')).join(','))].join('\n') + '\n', 'utf8');
const por = {};
for (const f of filas) por[`${f.source}/${f.lang}`] = (por[`${f.source}/${f.lang}`] ?? 0) + 1;
console.log(`${filas.length} filas →`, por);
