#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCANVEIL · tools/bundle.mjs
 * ---------------------------------------------------------------------------
 * Empaquetador a archivo único.
 *
 * Convierte la interfaz del juego (`app/`, la única desde el 7-oct-2026) con
 * su HTML, su CSS y todos sus módulos ES6 en un solo `arcanveil.html` que se
 * abre haciendo doble clic. Sin servidor, sin dependencias, sin instalación.
 *
 * Lo que el archivo único NO tiene, porque `file://` no lo permite: el modo
 * sin conexión instalable (sin trabajador de servicio), las imágenes de
 * `assets/` (se juega con los marcadores) y los puentes locales de IA e
 * imagen (el narrador interno funciona igual). Las partidas se guardan en el
 * almacenamiento del navegador para archivos locales, que es OTRO que el del
 * juego servido: no comparten partidas.
 *
 * Por qué existe: los módulos ES6 no funcionan desde `file://` por la política
 * de mismo origen. Durante el desarrollo eso se resuelve con un servidor
 * estático de dos comandos, pero pedirle eso a alguien que solo quiere jugar es
 * una barrera absurda. Este script la retira.
 *
 * Cómo funciona:
 *
 *   1. Recorre las importaciones desde `app/app.js` construyendo el grafo.
 *   2. Ordena topológicamente: cada módulo va después de los que necesita.
 *   3. Reescribe `import` y `export` a asignaciones sobre un registro interno.
 *   4. Inserta el resultado dentro del HTML, con el CSS en línea.
 *
 * No usa herramientas externas a propósito. Un empaquetador de verdad haría
 * esto mejor, pero añadiría una dependencia a un proyecto que se define por no
 * tener ninguna.
 *
 * Uso:
 *   node tools/bundle.mjs                      → dist/arcanveil.html
 *   node tools/bundle.mjs --salida juego.html
 *   node tools/bundle.mjs --verboso
 *
 * Requiere Node 18 o superior. Solo para construir: el resultado no lo necesita.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { resolve, dirname, relative, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/* ═══════════════════════════════════════════════════════════════════════════
   CONFIGURACIÓN
   ═══════════════════════════════════════════════════════════════════════════ */

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(AQUI, '..');

const ENTRADA = 'app/app.js';

// `index.html` y `clasico.html` son redirectores de la raíz, no interfaces.
// La plantilla es la de `app/`, que ya trae su CSS en línea.
const HTML_BASE = 'app/index.html';

/**
 * Hojas de estilo externas, en orden. La interfaz `app/` las lleva dentro de
 * su HTML; las de `styles/` eran de la interfaz retirada.
 */
const ESTILOS = [];

/* ═══════════════════════════════════════════════════════════════════════════
   ARGUMENTOS
   ═══════════════════════════════════════════════════════════════════════════ */

function leerArgumentos(argv) {
  const opciones = {
    salida: 'dist/arcanveil.html',
    entrada: ENTRADA,
    html: HTML_BASE,
    sinEstilos: false,
    verboso: false,
    minimizar: false,
  };

  for (let i = 2; i < argv.length; i++) {
    switch (argv[i]) {
      case '--salida':
      case '-o':
        opciones.salida = argv[++i] ?? opciones.salida;
        break;
      case '--entrada':
      case '-e':
        opciones.entrada = argv[++i] ?? opciones.entrada;
        break;
      case '--html':
        opciones.html = argv[++i] ?? opciones.html;
        break;
      case '--sin-estilos':
        opciones.sinEstilos = true;
        break;
      case '--verboso':
      case '-v':
        opciones.verboso = true;
        break;
      case '--minimizar':
      case '-m':
        opciones.minimizar = true;
        break;
      case '--ayuda':
      case '-h':
        console.log(AYUDA);
        process.exit(0);
        break;
    }
  }

  return opciones;
}

const AYUDA = `
ARCANVEIL · empaquetador

  node tools/bundle.mjs [opciones]

  -o, --salida <ruta>   Archivo de salida (por defecto dist/arcanveil.html)
  -v, --verboso         Muestra cada módulo procesado
  -m, --minimizar       Retira comentarios y líneas vacías del JavaScript
  -h, --ayuda           Esto

El archivo resultante se abre con doble clic. No necesita servidor.
`.trim();

/* ═══════════════════════════════════════════════════════════════════════════
   RESOLUCIÓN DE MÓDULOS
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Resuelve una ruta de importación relativa a un módulo.
 *
 * @param {string} desde Ruta del módulo que importa, relativa a la raíz.
 * @param {string} especificador Lo que aparece en el import.
 * @returns {string|null} Ruta normalizada, o null si no es local.
 */
function resolverImport(desde, especificador) {
  // Solo se empaquetan los módulos locales. Nada de node_modules, y este
  // proyecto no los usa.
  if (!especificador.startsWith('.')) return null;

  const carpeta = dirname(desde);
  let ruta = join(carpeta, especificador).replace(/\\/g, '/');

  // Se añade la extensión si falta.
  if (!ruta.endsWith('.js') && !ruta.endsWith('.mjs')) ruta += '.js';

  return ruta;
}

/**
 * Extrae las importaciones dinámicas con especificador literal.
 *
 * `await import('./x.js')` no lo ve el análisis estático, pero el módulo hay
 * que empaquetarlo igual: si no, la interfaz entera se queda fuera.
 *
 * Las que llevan `with { type: 'json' }` se descartan: los paquetes de datos
 * externos no viajan dentro del archivo único.
 *
 * @param {string} codigo
 * @returns {Array<{declaracion: string, especificador: string}>}
 */
function extraerDinamicos(codigo) {
  const salida = [];

  for (const m of codigo.matchAll(/import\(\s*['"]([^'"]+)['"]\s*(?:,\s*\{[^)]*\}\s*)?\)/g)) {
    // Los JSON con atributo de tipo se dejan fuera.
    if (/with\s*:/.test(m[0]) || m[1].endsWith('.json')) continue;

    salida.push({ declaracion: m[0], especificador: m[1] });
  }

  return salida;
}

/**
 * Extrae las importaciones de un módulo.
 *
 * El análisis es por expresión regular, que es frágil en general pero suficiente
 * aquí: el proyecto usa un estilo de importación uniforme y no hay trucos.
 *
 * @param {string} codigo
 * @returns {Array<{especificador: string, declaracion: string, nombres: Object}>}
 */
function extraerImports(codigo) {
  const imports = [];

  // import ... from '...'  /  import '...'
  const patron = /^[ \t]*import\s+(?:([\s\S]*?)\s+from\s+)?['"]([^'"]+)['"];?[ \t]*$/gm;

  let m;
  while ((m = patron.exec(codigo)) !== null) {
    imports.push({
      declaracion: m[0],
      clausula: (m[1] ?? '').trim(),
      especificador: m[2],
      nombres: analizarClausula(m[1] ?? ''),
    });
  }

  return imports;
}

/**
 * Analiza la cláusula de un import para saber qué nombres se traen.
 *
 * @param {string} clausula
 * @returns {{porDefecto: string|null, espacio: string|null, nombrados: Array<[string,string]>}}
 */
function analizarClausula(clausula) {
  const resultado = { porDefecto: null, espacio: null, nombrados: [] };

  const texto = clausula.trim();
  if (!texto) return resultado;

  // import * as X
  const espacio = texto.match(/^\*\s+as\s+([\p{L}\p{N}_$]+)$/u);
  if (espacio) {
    resultado.espacio = espacio[1];
    return resultado;
  }

  // Se separa la parte por defecto de las llaves.
  const conLlaves = texto.match(/^([\p{L}\p{N}_$]+\s*,\s*)?\{([\s\S]*)\}$/u);

  if (conLlaves) {
    if (conLlaves[1]) resultado.porDefecto = conLlaves[1].replace(/,\s*$/, '').trim();

    for (const parte of conLlaves[2].split(',')) {
      const limpio = parte.trim();
      if (!limpio) continue;

      const alias = limpio.match(/^([\p{L}\p{N}_$]+)\s+as\s+([\p{L}\p{N}_$]+)$/u);

      if (alias) resultado.nombrados.push([alias[1], alias[2]]);
      else resultado.nombrados.push([limpio, limpio]);
    }

    return resultado;
  }

  // Solo por defecto.
  if (/^[\p{L}\p{N}_$]+$/u.test(texto)) {
    resultado.porDefecto = texto;
    return resultado;
  }

  // Mezcla con espacio de nombres: import X, * as Y
  const mixto = texto.match(/^([\p{L}\p{N}_$]+)\s*,\s*\*\s+as\s+([\p{L}\p{N}_$]+)$/u);
  if (mixto) {
    resultado.porDefecto = mixto[1];
    resultado.espacio = mixto[2];
  }

  return resultado;
}

/* ═══════════════════════════════════════════════════════════════════════════
   GRAFO
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Recorre el grafo de módulos desde la entrada.
 *
 * @param {string} entrada
 * @param {Object} opciones
 * @returns {Promise<{modulos: Map, orden: string[], avisos: string[]}>}
 */
async function construirGrafo(entrada, opciones) {
  const modulos = new Map();
  const avisos = [];
  const pendientes = [entrada];

  while (pendientes.length) {
    const ruta = pendientes.shift();
    if (modulos.has(ruta)) continue;

    let codigo;

    try {
      codigo = await readFile(resolve(RAIZ, ruta), 'utf-8');
    } catch {
      avisos.push(`módulo no encontrado: ${ruta}`);
      // Se registra vacío para no volver a intentarlo.
      modulos.set(ruta, { ruta, codigo: '', imports: [], ausente: true });
      continue;
    }

    const imports = extraerImports(codigo);
    const dinamicos = extraerDinamicos(codigo);
    const dependencias = [];

    // Las dinámicas entran en el grafo pero NO en las dependencias de orden:
    // se resuelven cuando alguien las pide, no al cargar.
    for (const din of dinamicos) {
      const destino = resolverImport(ruta, din.especificador);
      if (!destino) continue;

      din.destino = destino;
      pendientes.push(destino);

      // También cuentan para el orden: un módulo cargado dinámicamente debe
      // estar definido antes de que alguien lo pida.
      dependencias.push(destino);
    }

    for (const imp of imports) {
      const destino = resolverImport(ruta, imp.especificador);

      if (!destino) {
        avisos.push(`importación externa ignorada en ${ruta}: ${imp.especificador}`);
        continue;
      }

      imp.destino = destino;
      dependencias.push(destino);
      pendientes.push(destino);
    }

    modulos.set(ruta, { ruta, codigo, imports, dinamicos, dependencias, ausente: false });

    if (opciones.verboso) {
      console.log(`  leído  ${ruta} (${imports.length} importaciones)`);
    }
  }

  const orden = ordenarTopologicamente(modulos, entrada, avisos);

  return { modulos, orden, avisos };
}

/**
 * Ordena los módulos para que cada uno vaya después de sus dependencias.
 *
 * Los ciclos se detectan y se avisan, pero no abortan: el proyecto tiene algún
 * ciclo intencionado —módulos que se importan entre sí para tipos— y romper el
 * empaquetado por eso sería excesivo. Se rompe el ciclo por donde se detecta y
 * se confía en que el uso sea diferido.
 *
 * @param {Map} modulos
 * @param {string} entrada
 * @param {string[]} avisos
 * @returns {string[]}
 */
function ordenarTopologicamente(modulos, entrada, avisos) {
  const orden = [];
  const visitado = new Set();
  const enPila = new Set();

  const visitar = (ruta, cadena) => {
    if (visitado.has(ruta)) return;

    if (enPila.has(ruta)) {
      const ciclo = [...cadena.slice(cadena.indexOf(ruta)), ruta];
      avisos.push(`ciclo de importación: ${ciclo.join(' → ')}`);
      return;
    }

    enPila.add(ruta);

    const modulo = modulos.get(ruta);

    for (const dep of modulo?.dependencias ?? []) {
      visitar(dep, [...cadena, ruta]);
    }

    enPila.delete(ruta);
    visitado.add(ruta);
    orden.push(ruta);
  };

  visitar(entrada, []);

  // Cualquier módulo alcanzado pero no visitado por el recorrido se añade al
  // final: puede ser una importación dinámica.
  for (const ruta of modulos.keys()) {
    if (!visitado.has(ruta)) orden.push(ruta);
  }

  return orden;
}

/* ═══════════════════════════════════════════════════════════════════════════
   TRANSFORMACIÓN
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Convierte un identificador de ruta en un nombre de variable válido.
 *
 * @param {string} ruta
 * @returns {string}
 */
function nombreModulo(ruta) {
  return `__m_${ruta.replace(/[^\w]/g, '_')}`;
}

/**
 * Reescribe un módulo para que funcione dentro del registro.
 *
 * Estrategia: cada módulo se envuelve en una función que recibe el registro y
 * devuelve sus exportaciones. Los imports se traducen a lecturas del registro y
 * los exports a propiedades del objeto devuelto.
 *
 * @param {Object} modulo
 * @param {Object} opciones
 * @returns {string}
 */
function transformar(modulo, opciones) {
  let codigo = modulo.codigo;

  if (modulo.ausente) {
    return `/* módulo ausente: ${modulo.ruta} */\nregistro['${modulo.ruta}'] = {};`;
  }

  // ─── Imports → lecturas del registro ────────────────────────────────────
  for (const imp of modulo.imports) {
    let reemplazo;

    if (!imp.destino) {
      // Importación externa: se comenta.
      reemplazo = `/* externo: ${imp.especificador} */`;
    } else {
      const fuente = `registro['${imp.destino}']`;
      const partes = [];

      if (imp.nombres.espacio) {
        partes.push(`const ${imp.nombres.espacio} = ${fuente};`);
      }

      if (imp.nombres.porDefecto) {
        partes.push(`const ${imp.nombres.porDefecto} = ${fuente}.default;`);
      }

      if (imp.nombres.nombrados.length) {
        const destructuracion = imp.nombres.nombrados
          .map(([original, alias]) => (original === alias ? original : `${original}: ${alias}`))
          .join(', ');

        partes.push(`const { ${destructuracion} } = ${fuente};`);
      }

      reemplazo = partes.join(' ') || `/* solo efectos: ${imp.destino} */`;
    }

    codigo = codigo.replace(imp.declaracion, reemplazo);
  }

  // ─── Importaciones dinámicas ────────────────────────────────────────────
  // Se convierten en una promesa ya resuelta sobre el registro, para que
  // `await import(...)` siga funcionando igual.
  for (const din of modulo.dinamicos ?? []) {
    if (!din.destino) continue;

    codigo = codigo.split(din.declaracion).join(
      `Promise.resolve(registro['${din.destino}'])`,
    );
  }

  // ─── Exports ────────────────────────────────────────────────────────────
  const exportados = [];

  // export const/let/function/class/async function
  codigo = codigo.replace(
    /^[ \t]*export\s+(const|let|var|function|class|async function)\s+([\p{L}\p{N}_$]+)/gmu,
    (_, tipo, nombre) => {
      exportados.push(nombre);
      return `${tipo} ${nombre}`;
    },
  );

  // export { a, b as c }
  codigo = codigo.replace(
    /^[ \t]*export\s*\{([^}]*)\}[ \t]*;?[ \t]*$/gm,
    (_, lista) => {
      const entradas = [];

      for (const parte of lista.split(',')) {
        const limpio = parte.trim();
        if (!limpio) continue;

        const alias = limpio.match(/^([\p{L}\p{N}_$]+)\s+as\s+([\p{L}\p{N}_$]+)$/u);

        if (alias) entradas.push(`${alias[2]}: ${alias[1]}`);
        else entradas.push(limpio);
      }

      // Se acumulan aparte para añadirlas al objeto final.
      exportados.push(...entradas.map((e) => e.includes(':') ? e : e));
      return `/* export {} */`;
    },
  );

  // export default
  let tieneDefecto = false;

  codigo = codigo.replace(/^[ \t]*export\s+default\s+/gm, () => {
    tieneDefecto = true;
    return 'const __default = ';
  });

  // ─── Ensamblado del objeto de exportación ───────────────────────────────
  const propiedades = [...new Set(exportados)];
  if (tieneDefecto) propiedades.push('default: __default');

  const retorno = propiedades.length
    ? `return { ${propiedades.join(', ')} };`
    : 'return {};';

  if (opciones.minimizar) codigo = minimizar(codigo);

  return [
    `/* ── ${modulo.ruta} ─────────────────────────────────────────── */`,
    `registro['${modulo.ruta}'] = (function () {`,
    codigo,
    retorno,
    `})();`,
  ].join('\n');
}

/**
 * Retira comentarios y líneas vacías.
 *
 * No es una minimización de verdad: no toca los nombres ni la estructura, y por
 * eso el resultado sigue siendo legible y depurable. Solo quita el peso muerto.
 *
 * @param {string} codigo
 * @returns {string}
 */
function minimizar(codigo) {
  return codigo
    // Comentarios de bloque, salvo los que empiezan por /*! (licencias).
    .replace(/\/\*(?!!)[\s\S]*?\*\//g, '')
    // Comentarios de línea que ocupan la línea entera.
    .replace(/^[ \t]*\/\/.*$/gm, '')
    // Líneas vacías consecutivas.
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/* ═══════════════════════════════════════════════════════════════════════════
   ENSAMBLADO
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Lee y concatena las hojas de estilo.
 *
 * Las reglas `@import` se retiran: en el archivo único todo va ya en línea y en
 * el orden correcto.
 *
 * @param {Object} opciones
 * @returns {Promise<{css: string, avisos: string[]}>}
 */
async function ensamblarEstilos(opciones) {
  const partes = [];
  const avisos = [];

  // El empaquetado de una demo trae sus propios estilos en el HTML.
  if (opciones.sinEstilos) return { css: '', avisos };

  for (const ruta of ESTILOS) {
    try {
      let css = await readFile(resolve(RAIZ, ruta), 'utf-8');

      // Los @import ya no hacen falta.
      css = css.replace(/@import\s+[^;]+;/g, '');

      // Las capas se conservan: el orden de cascada depende de ellas.
      partes.push(`/* ── ${ruta} ── */\n${css}`);

      if (opciones.verboso) console.log(`  estilo ${ruta}`);

    } catch {
      avisos.push(`hoja de estilo no encontrada: ${ruta}`);
    }
  }

  let css = partes.join('\n\n');

  if (opciones.minimizar) {
    css = css
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\n{3,}/g, '\n')
      .trim();
  }

  return { css, avisos };
}

/**
 * Construye el HTML final.
 *
 * @param {Object} datos
 * @returns {Promise<string>}
 */
async function ensamblarHTML(datos) {
  const { css, js, avisos } = datos;

  let html = await readFile(resolve(RAIZ, datos.htmlBase ?? HTML_BASE), 'utf-8');

  // ─── Se retiran los enlaces y scripts externos ──────────────────────────
  html = html.replace(/<link[^>]+rel=["']stylesheet["'][^>]*>/gi, '');
  // Manifiesto e iconos apuntan a `../` del servidor: desde un archivo suelto
  // no existen y solo darían errores en la consola.
  html = html.replace(/<link[^>]+rel=["'](?:manifest|icon|apple-touch-icon)["'][^>]*>/gi, '');
  html = html.replace(/<script[^>]+type=["']module["'][^>]*><\/script>/gi, '');
  html = html.replace(/<script[^>]+src=["'][^"']+["'][^>]*><\/script>/gi, '');

  // El aviso de CORS del index sobra: en el archivo único no puede ocurrir.
  html = html.replace(/<script>[\s\S]*?CORS[\s\S]*?<\/script>/gi, '');

  // ─── Estilos en línea ───────────────────────────────────────────────────
  // Reemplazo por función: una cadena interpretaría $$ y $& del contenido.
  html = html.replace('</head>', () => `<style>\n${css}\n</style>\n</head>`);

  // ─── Script en línea ────────────────────────────────────────────────────
  // Un script normal, no de módulo: el módulo volvería a exigir un origen.
  const cabeceraJS = [
    '/*! ARCANVEIL · archivo único generado por tools/bundle.mjs */',
    `/* generado el ${new Date().toISOString()} */`,
    avisos.length ? `/* avisos: ${avisos.length} — ver la consola de construcción */` : '',
  ].filter(Boolean).join('\n');

  const script = [
    '<script>',
    '(function () {',
    "'use strict';",
    cabeceraJS,
    '',
    '/* Registro de módulos: sustituye al sistema de importaciones. */',
    'const registro = Object.create(null);',
    '',
    js,
    '',
    '})();',
    '</script>',
  ].join('\n');

  html = html.replace('</body>', () => `${script}\n</body>`);

  return html;
}

/* ═══════════════════════════════════════════════════════════════════════════
   PRINCIPAL
   ═══════════════════════════════════════════════════════════════════════════ */

async function principal() {
  const opciones = leerArgumentos(process.argv);

  console.log('ARCANVEIL · empaquetando\n');

  // ─── Grafo de módulos ───────────────────────────────────────────────────
  console.log('Módulos:');
  const grafo = await construirGrafo(opciones.entrada, opciones);

  const reales = grafo.orden.filter((r) => !grafo.modulos.get(r)?.ausente);
  console.log(`  ${reales.length} módulos en el grafo\n`);

  // ─── Transformación ─────────────────────────────────────────────────────
  const js = grafo.orden
    .map((ruta) => transformar(grafo.modulos.get(ruta), opciones))
    .join('\n\n');

  // ─── Estilos ────────────────────────────────────────────────────────────
  console.log('Estilos:');
  const estilos = await ensamblarEstilos(opciones);
  console.log(`  ${ESTILOS.length - estilos.avisos.length} hojas incluidas\n`);

  // ─── Avisos ─────────────────────────────────────────────────────────────
  const avisos = [...grafo.avisos, ...estilos.avisos];

  if (avisos.length) {
    console.log('Avisos:');
    for (const a of avisos) console.log(`  · ${a}`);
    console.log();
  }

  // ─── HTML ───────────────────────────────────────────────────────────────
  const html = await ensamblarHTML({ css: estilos.css, js, avisos, htmlBase: opciones.html });

  // ─── Escritura ──────────────────────────────────────────────────────────
  const salida = resolve(RAIZ, opciones.salida);
  await mkdir(dirname(salida), { recursive: true });
  await writeFile(salida, html, 'utf-8');

  const info = await stat(salida);
  const kb = Math.round(info.size / 1024);

  console.log(`Listo: ${relative(RAIZ, salida)}  (${kb} KB)`);
  console.log('\nSe abre con doble clic. No necesita servidor.');

  // Un aviso final si hubo módulos ausentes: el resultado puede no funcionar.
  const ausentes = grafo.orden.filter((r) => grafo.modulos.get(r)?.ausente);

  if (ausentes.length) {
    console.log(`\n⚠ ${ausentes.length} módulos no se han encontrado.`);
    console.log('  El archivo se ha generado, pero puede fallar al ejecutarse.');
    console.log('  Faltan:');
    for (const r of ausentes) console.log(`    ${r}`);
    process.exitCode = 1;
  }
}

principal().catch((e) => {
  console.error('\nError al empaquetar:');
  console.error(e);
  process.exit(1);
});
