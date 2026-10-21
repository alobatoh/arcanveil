// Cada cita «…» de un documento debe ser un trozo LITERAL del texto de la
// reseña que la línea enlaza (reviewId=… de Google Play o [id] de Apple).
// Uso: node citas.mjs replica/reviews.csv doc1.md [doc2.md…]
import { readFileSync } from 'node:fs';
const [csvPath, ...docs] = process.argv.slice(2);
const csv = readFileSync(csvPath, 'utf8');
const filas = []; let f = [], c = '', q = false;
for (let i = 0; i < csv.length; i++) {
  const ch = csv[i];
  if (q) { if (ch === '"') { if (csv[i + 1] === '"') { c += '"'; i++; } else q = false; } else c += ch; }
  else if (ch === '"') q = true; else if (ch === ',') { f.push(c); c = ''; } else if (ch === '\n') { f.push(c); filas.push(f); f = []; c = ''; } else if (ch !== '\r') c += ch;
}
const [cab, ...datos] = filas;
const porId = new Map(datos.map((r) => { const o = Object.fromEntries(cab.map((k, i) => [k, r[i] ?? ''])); return [o.id, o]; }));
let total = 0, malas = 0;
for (const doc of docs) {
  for (const [n, linea] of readFileSync(doc, 'utf8').split('\n').entries()) {
    const citas = [...linea.matchAll(/«([^»]+)»/g)].map((m) => m[1]);
    if (!citas.length) continue;
    const g = linea.match(/reviewId=([0-9a-f-]{36})/);
    const a = linea.match(/\[(\d{7,})\]/);
    const id = g?.[1] ?? a?.[1];
    for (const cita of citas) {
      if (!id) continue;            // citas sin enlace (por ejemplo textos propios entre comillas) no son reseñas
      total++;
      const r = porId.get(id);
      const ok = r && r.text.includes(cita);
      if (!ok) { malas++; console.log(`MAL ${doc}:${n + 1} [${id}] «${cita.slice(0, 70)}» ${r ? '(no está en el texto)' : '(id no encontrado)'}`); }
    }
  }
}
console.log(`${total - malas}/${total} citas literales y en su reseña`);
process.exit(malas ? 1 : 0);
