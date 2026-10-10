/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCANVEIL · src/art/retrato.js
 * ---------------------------------------------------------------------------
 * Retrato procedural de fantasía oscura, con acabado de concept art.
 *
 * Los ocho linajes comparten encuadre cercano, contraluz fría, fondo con
 * atmósfera y silueta afilada. La descripción libre gobierna pelo, ojos y
 * marcas. El volumen se construye por veladuras y después recibe pinceladas,
 * filos de luz y hebras: debe sentirse pintado, no como un icono vectorial.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { hashSemilla, Flujo } from '../core/RNG.js';
import { LINAJES, LINAJE_POR_DEFECTO, BASE } from './paleta.js';
import {
  lienzo, idUnico, num, brillo, mezclar, degradadoLuz,
} from './lienzo.js';

const ANCHO = 400;
const ALTO = 480;

/* ═══ Anclas del encuadre ═════════════════════════════════════════════════
   Cambiar una de estas seis cambia los ocho retratos a la vez, que es lo que
   se quiere. Cambiarla para un solo linaje es lo que rompe la serie.
   ═══════════════════════════════════════════════════════════════════════════ */

const OJOS_Y = 190;           // Primer plano: ojos cerca del tercio superior.
const CX = ANCHO * 0.5;
const RX = 112;                // Rostro cercano, pómulos dominantes.
const RY = 146;               // Cráneo largo y mandíbula afilada.
const GIRO = 16;               // Tres cuartos muy leve.               // Desplazamiento de tres cuartos.

/* ═══════════════════════════════════════════════════════════════════════════
   PROPORCIONES POR LINAJE
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Desviaciones respecto de la cabeza media.
 *
 * Pequeñas a propósito: lo justo para reconocer el linaje sin romper el
 * encuadre común.
 */
const FORMA = Object.freeze({
  valdes: { ancho: 1.00, largo: 1.00, menton: 1.00, hombros: 1.00 },
  sombracorteza: { ancho: 0.90, largo: 1.10, menton: 0.78, hombros: 0.92 },
  ferrano: { ancho: 1.14, largo: 0.92, menton: 1.22, hombros: 1.24 },
  albar: { ancho: 0.92, largo: 1.06, menton: 0.80, hombros: 0.94 },
  griscuerno: { ancho: 1.10, largo: 1.02, menton: 1.16, hombros: 1.28 },
  menudo: { ancho: 1.06, largo: 0.90, menton: 0.88, hombros: 0.84 },
  brumal: { ancho: 0.96, largo: 1.02, menton: 0.86, hombros: 0.92 },
  crisol: { ancho: 1.02, largo: 1.00, menton: 1.08, hombros: 1.10 },
});

const FORMA_POR_DEFECTO = FORMA.valdes;

/* ═══════════════════════════════════════════════════════════════════════════
   SILUETA
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Contorno de la cabeza: cráneo ancho, pómulo, ángulo de mandíbula y mentón.
 *
 * Las proporciones son las clásicas del retrato —los ojos a media altura de la
 * cabeza, el mentón a un cuarto por debajo de la mandíbula— porque son las que
 * el ojo reconoce como una persona y no como un óvalo.
 *
 * @param {Object} forma
 * @returns {string} Atributo `d`.
 */
function siluetaCabeza(forma) {
  const rx = RX * forma.ancho;
  const ry = RY * forma.largo;
  const cx = CX + GIRO;
  const cy = OJOS_Y;
  const mandibula = rx * (0.48 * forma.menton);
  const menton = rx * (0.20 * forma.menton);
  return `M${num(cx-rx*.94)} ${num(cy-ry*.12)}`
    + `C${num(cx-rx*1.02)} ${num(cy-ry*.82)} ${num(cx-rx*.48)} ${num(cy-ry*1.02)} ${num(cx)} ${num(cy-ry)}`
    + `C${num(cx+rx*.68)} ${num(cy-ry*.98)} ${num(cx+rx*1.02)} ${num(cy-ry*.66)} ${num(cx+rx*.98)} ${num(cy-ry*.08)}`
    + `C${num(cx+rx*.96)} ${num(cy+ry*.26)} ${num(cx+rx*.80)} ${num(cy+ry*.54)} ${num(cx+mandibula)} ${num(cy+ry*.77)}`
    + `C${num(cx+menton)} ${num(cy+ry*1.02)} ${num(cx-menton)} ${num(cy+ry*1.02)} ${num(cx-mandibula)} ${num(cy+ry*.77)}`
    + `C${num(cx-rx*.80)} ${num(cy+ry*.54)} ${num(cx-rx*.98)} ${num(cy+ry*.25)} ${num(cx-rx*.94)} ${num(cy-ry*.12)}Z`;
}

/* ═══════════════════════════════════════════════════════════════════════════
   BUSTO
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Cuello y hombros.
 *
 * El cuello sale de detrás de la mandíbula y los hombros llenan el tercio
 * inferior del cuadro. Un cuello estrecho sobre nada es lo que hace que un
 * retrato parezca una piruleta.
 *
 * @param {Object} forma
 * @param {Object} tonos
 * @param {string} idTela
 * @returns {string}
 */
function busto(forma, tonos, idTela) {
  const ry = RY * forma.largo;
  const anchoCuello = 32 * forma.ancho;
  const cuelloY = OJOS_Y + ry * 0.72;
  const hombroY = ALTO * 0.83;
  const anchoHombro = 150 * forma.hombros;

  // Cuello. Va en sombra entero: la mandíbula lo tapa de la luz. Baja hasta
  // bien dentro de la ropa para que no quede un escalón entre los dos.
  const cuello = `<path d="M${num(CX - anchoCuello)} ${num(cuelloY)}`
    + `L${num(CX - anchoCuello * 1.20)} ${num(hombroY + 40)}`
    + `L${num(CX + anchoCuello * 1.20)} ${num(hombroY + 40)}`
    + `L${num(CX + anchoCuello)} ${num(cuelloY)}Z" `
    + `fill="${brillo(tonos.pielSombra, 0.72)}"/>`;

  // Hombros. La clave es que la línea de hombro sea ANCHA y casi horizontal, y
  // que el trapecio suba al cuello con una pendiente corta. Una sola curva de
  // lado a lado daba una cúpula: parecía una colina, no una persona.
  const bordeIzq = CX - anchoHombro * 1.5;
  const bordeDer = CX + anchoHombro * 1.5;
  const hombroAlto = hombroY + 16;      // Dónde cae el deltoides.
  const cuelloAlto = hombroY - 34;      // Dónde arranca el trapecio.

  const ropa = `<path d="M${num(bordeIzq)} ${num(ALTO + 12)}`
    + `L${num(bordeIzq)} ${num(hombroAlto + 26)}`
    // Deltoides izquierdo: redondeo corto.
    + `C${num(bordeIzq + 18)} ${num(hombroAlto - 4)} `
    + `${num(CX - anchoHombro * 0.86)} ${num(hombroAlto - 10)} `
    + `${num(CX - anchoHombro * 0.66)} ${num(hombroAlto - 12)}`
    // Trapecio izquierdo: sube al cuello.
    + `C${num(CX - anchoHombro * 0.34)} ${num(hombroAlto - 16)} `
    + `${num(CX - anchoCuello * 1.5)} ${num(cuelloAlto + 12)} `
    + `${num(CX)} ${num(cuelloAlto)}`
    // Y lo mismo en espejo.
    + `C${num(CX + anchoCuello * 1.5)} ${num(cuelloAlto + 12)} `
    + `${num(CX + anchoHombro * 0.34)} ${num(hombroAlto - 16)} `
    + `${num(CX + anchoHombro * 0.66)} ${num(hombroAlto - 12)}`
    + `C${num(CX + anchoHombro * 0.86)} ${num(hombroAlto - 10)} `
    + `${num(bordeDer - 18)} ${num(hombroAlto - 4)} `
    + `${num(bordeDer)} ${num(hombroAlto + 26)}`
    + `L${num(bordeDer)} ${num(ALTO + 12)}Z" `
    + `fill="url(#${idTela})"/>`;

  // Sombra que el mentón proyecta sobre el pecho. Estrecha y pegada al cuello:
  // ancha se convertía en una banda oscura cruzando el retrato.
  const sombra = `<ellipse cx="${num(CX)}" cy="${num(cuelloAlto + 10)}" `
    + `rx="${num(anchoCuello * 2.1)}" ry="14" fill="#000" opacity="0.28"/>`;

  const armadura = `<path d="M${num(CX-180)} ${num(hombroY+2)} Q${num(CX-126)} ${num(hombroY-34)} ${num(CX-60)} ${num(hombroY-18)} L${num(CX-86)} ${num(ALTO)} L${num(CX-194)} ${num(ALTO)}Z" fill="#242C34" stroke="#788690" stroke-width="2" opacity=".82"/>`
    + `<path d="M${num(CX+58)} ${num(hombroY-18)} Q${num(CX+128)} ${num(hombroY-34)} ${num(CX+182)} ${num(hombroY+4)} L${num(CX+194)} ${num(ALTO)} L${num(CX+84)} ${num(ALTO)}Z" fill="#171D24" stroke="#596773" stroke-width="2" opacity=".84"/>`
    + `<path d="M${num(CX-148)} ${num(hombroY+20)} l72 76 M${num(CX+145)} ${num(hombroY+20)} l-68 76" stroke="#8FA0A9" stroke-width="1.2" opacity=".32"/>`;
  return cuello + ropa + armadura + sombra;
}

/** Pelo exterior: masa y mechones que caen fuera del recorte de la cara. */
function cabelloExterior(forma, tonos, flujo) {
  const rx = RX * forma.ancho;
  const ry = RY * forma.largo;
  const cx = CX + GIRO;
  const base = OJOS_Y - ry * 0.28;
  const largo = OJOS_Y + ry * flujo.flotante(1.45, 1.9);
  const piezas = [];

  piezas.push(`<path d="M${num(cx-rx*.98)} ${num(base)}`
    + `C${num(cx-rx*1.34)} ${num(OJOS_Y+ry*.25)} ${num(cx-rx*1.3)} ${num(largo)} ${num(cx-rx*.62)} ${num(largo+42)}`
    + `L${num(cx-rx*.30)} ${num(largo+10)}`
    + `C${num(cx-rx*.78)} ${num(OJOS_Y+ry*.42)} ${num(cx-rx*.76)} ${num(base+10)} ${num(cx-rx*.98)} ${num(base)}Z" fill="${brillo(tonos.pelo,.72)}" opacity=".76"/>`);
  piezas.push(`<path d="M${num(cx+rx*.98)} ${num(base)}`
    + `C${num(cx+rx*1.34)} ${num(OJOS_Y+ry*.22)} ${num(cx+rx*1.34)} ${num(largo)} ${num(cx+rx*.68)} ${num(largo+46)}`
    + `L${num(cx+rx*.34)} ${num(largo+8)}`
    + `C${num(cx+rx*.84)} ${num(OJOS_Y+ry*.40)} ${num(cx+rx*.76)} ${num(base+10)} ${num(cx+rx*.98)} ${num(base)}Z" fill="${brillo(tonos.pelo,.64)}" opacity=".76"/>`);

  for (const lado of [-1, 1]) {
    for (let i=0;i<4;i++) {
      const x=cx+lado*(rx*(.72+i*.12));
      piezas.push(`<path d="M${num(x)} ${num(base+18+i*5)} Q${num(x+lado*flujo.flotante(12,28))} ${num(OJOS_Y+ry*.68)} ${num(x+lado*flujo.flotante(-8,18))} ${num(largo+i*7)}" stroke="${brillo(tonos.pelo,1.25+i*.08)}" stroke-width="${num(2.2+i*.45)}" fill="none" opacity=".5" stroke-linecap="round"/>`);
    }
  }
  return piezas.join('');
}

/* ═══════════════════════════════════════════════════════════════════════════
   VOLUMEN DE LA CARA
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Las sombras que modelan el rostro, recortadas contra la cabeza.
 *
 * Ninguna es una línea: son manchas suaves. Cuencas, pómulo, lateral de la
 * nariz y hueco bajo el labio. Puestas en el sitio correcto bastan para leer
 * una cara, y dejan el «rostro cansado» que pide el ancla sin dibujar arrugas.
 *
 * @param {Object} forma
 * @param {Object} tonos
 * @returns {string}
 */
function modeladoPiel(forma, tonos, idRecorte, idSuave, idTextura) {
  const rx=RX*forma.ancho, ry=RY*forma.largo, cx=CX+GIRO;
  return `<g clip-path="url(#${idRecorte})">`
    + `<ellipse cx="${num(cx-rx*.35)}" cy="${num(OJOS_Y-ry*.18)}" rx="${num(rx*.62)}" ry="${num(ry*.78)}" fill="${brillo(tonos.piel,1.28)}" opacity=".22" filter="url(#${idSuave})"/>`
    + `<ellipse cx="${num(cx+rx*.62)}" cy="${num(OJOS_Y+ry*.04)}" rx="${num(rx*.54)}" ry="${num(ry*.86)}" fill="#0B1018" opacity=".34" filter="url(#${idSuave})"/>`
    + `<ellipse cx="${num(cx-rx*.48)}" cy="${num(OJOS_Y+ry*.30)}" rx="${num(rx*.30)}" ry="${num(ry*.20)}" fill="${brillo(tonos.piel,1.18)}" opacity=".24" filter="url(#${idSuave})"/>`
    + `<path d="M${num(cx-rx*.86)} ${num(OJOS_Y-ry*.34)} Q${num(cx-rx*1.04)} ${num(OJOS_Y+ry*.30)} ${num(cx-rx*.45)} ${num(OJOS_Y+ry*.78)}" stroke="#D9EEF4" stroke-width="8" fill="none" opacity=".18" filter="url(#${idSuave})"/>`
    + `<path d="M${num(cx-rx*.74)} ${num(OJOS_Y-ry*.55)} Q${num(cx-rx*.12)} ${num(OJOS_Y-ry*.92)} ${num(cx+rx*.64)} ${num(OJOS_Y-ry*.50)}" stroke="#E8F0F2" stroke-width="8" fill="none" opacity=".13" filter="url(#${idSuave})"/>`
    + `<ellipse cx="${num(cx-rx*.18)}" cy="${num(OJOS_Y+ry*.48)}" rx="${num(rx*.44)}" ry="${num(ry*.20)}" fill="#5C3242" opacity=".09" filter="url(#${idSuave})"/>`
    + `<ellipse cx="${num(cx-rx*.53)}" cy="${num(OJOS_Y+ry*.08)}" rx="${num(rx*.22)}" ry="${num(ry*.28)}" fill="#DCEAF0" opacity=".12" filter="url(#${idSuave})"/>`
    + `<path d="M${num(cx-rx*.82)} ${num(OJOS_Y-ry*.02)} Q${num(cx-rx*.66)} ${num(OJOS_Y+ry*.14)} ${num(cx-rx*.26)} ${num(OJOS_Y+ry*.23)}" stroke="#EEF6F5" stroke-width="10" fill="none" opacity=".15" filter="url(#${idSuave})"/>`
    + `<path d="M${num(cx+rx*.16)} ${num(OJOS_Y+ry*.16)} Q${num(cx+rx*.54)} ${num(OJOS_Y+ry*.12)} ${num(cx+rx*.80)} ${num(OJOS_Y+ry*.34)}" stroke="#070B11" stroke-width="13" fill="none" opacity=".18" filter="url(#${idSuave})"/>`
    + `<rect x="${num(cx-rx)}" y="${num(OJOS_Y-ry)}" width="${num(rx*2)}" height="${num(ry*2)}" filter="url(#${idTextura})" opacity=".28" style="mix-blend-mode:soft-light"/>`
    + '</g>';
}

function volumenRostro(forma, tonos) {
  const rx = RX * forma.ancho;
  const ry = RY * forma.largo;
  const cx = CX + GIRO;
  const sombra = tonos.pielSombra;
  const piezas = [];

  // Cuenca de los ojos: una sombra suave bajo el hueso de la ceja. Aporta el
  // cansancio que pide el ancla, pero floja: subida de opacidad, las dos
  // manchas se juntan con el iris y el resultado son unas gafas de buzo.
  for (const lado of [-1, 1]) {
    const x = cx + lado * rx * 0.40;
    const escala = lado < 0 ? 1 : 0.9;   // El lado en sombra, algo menor.

    piezas.push(`<ellipse cx="${num(x)}" cy="${num(OJOS_Y - 1)}" `
      + `rx="${num(24 * escala)}" ry="${num(9 * escala)}" `
      + `fill="#080A10" opacity="0.30" filter="blur(4px)"/>`);
  }

  // Hueso de la ceja: una franja clara justo encima de las cuencas.
  for (const lado of [-1,1]) {
    piezas.push(`<path d="M${num(cx+lado*rx*.10)} ${num(OJOS_Y-ry*.22)} Q${num(cx+lado*rx*.48)} ${num(OJOS_Y-ry*.32)} ${num(cx+lado*rx*.82)} ${num(OJOS_Y-ry*.20)}" stroke="${brillo(tonos.piel,1.14)}" stroke-width="6" fill="none" opacity=".22" stroke-linecap="round"/>`);
  }

  // Lateral de la nariz: una sola sombra, del lado contrario a la luz.
  // Medida en fracciones de `ry` y no en píxeles: los linajes de cara larga
  // llevan la nariz más abajo, como debe ser.
  const nz = (f) => OJOS_Y + ry * f;

  piezas.push(`<path d="M${num(cx+8)} ${num(nz(-.10))} C${num(cx+18)} ${num(nz(.12))} ${num(cx+24)} ${num(nz(.32))} ${num(cx+18)} ${num(nz(.44))} C${num(cx+10)} ${num(nz(.50))} ${num(cx-3)} ${num(nz(.47))} ${num(cx-8)} ${num(nz(.40))} Q${num(cx+4)} ${num(nz(.40))} ${num(cx+8)} ${num(nz(-.10))}Z" fill="${sombra}" opacity=".34" filter="blur(2px)"/>`);
  piezas.push(`<path d="M${num(cx+3)} ${num(nz(-.05))} Q${num(cx+5)} ${num(nz(.20))} ${num(cx+1)} ${num(nz(.36))}" stroke="${brillo(tonos.piel,1.38)}" stroke-width="3.2" fill="none" opacity=".42" filter="blur(.5px)"/>`);
  piezas.push(`<path d="M${num(cx-5)} ${num(nz(.43))} Q${num(cx+6)} ${num(nz(.49))} ${num(cx+20)} ${num(nz(.43))}" stroke="#17131A" stroke-width="1.5" fill="none" opacity=".48" filter="blur(.35px)"/>`);

  // Pómulos: dos manchas que hunden las mejillas.
  for (const lado of [-1, 1]) {
    piezas.push(`<path d="M${num(cx+lado*rx*.30)} ${num(OJOS_Y+ry*.24)} Q${num(cx+lado*rx*.76)} ${num(OJOS_Y+ry*.10)} ${num(cx+lado*rx*.91)} ${num(OJOS_Y+ry*.38)} Q${num(cx+lado*rx*.66)} ${num(OJOS_Y+ry*.61)} ${num(cx+lado*rx*.26)} ${num(OJOS_Y+ry*.46)}Z" fill="${sombra}" opacity=".26" filter="blur(2.6px)"/>`);
  }

  // Hueco bajo el labio inferior. Insinúa la boca sin dibujarla.
  piezas.push(`<ellipse cx="${num(cx)}" cy="${num(OJOS_Y + ry * 0.66)}" `
    + `rx="${num(rx * 0.30)}" ry="${num(ry * 0.07)}" `
    + `fill="${sombra}" opacity="0.45"/>`);

  // Línea de la boca: lo único parecido a un trazo, y muy tenue.
  piezas.push(`<path d="M${num(cx-rx*.25)} ${num(OJOS_Y+ry*.56)} Q${num(cx-rx*.08)} ${num(OJOS_Y+ry*.49)} ${num(cx)} ${num(OJOS_Y+ry*.54)} Q${num(cx+rx*.10)} ${num(OJOS_Y+ry*.48)} ${num(cx+rx*.34)} ${num(OJOS_Y+ry*.54)} Q${num(cx)} ${num(OJOS_Y+ry*.67)} ${num(cx-rx*.3)} ${num(OJOS_Y+ry*.56)}Z" fill="${mezclar('#583845', tonos.pielSombra, .44)}" opacity=".78" filter="blur(.35px)"/>`);
  piezas.push(`<path d="M${num(cx-rx*.25)} ${num(OJOS_Y+ry*.56)} Q${num(cx)} ${num(OJOS_Y+ry*.60)} ${num(cx+rx*.25)} ${num(OJOS_Y+ry*.55)}" stroke="${brillo(sombra,.5)}" stroke-width="1" fill="none" opacity=".62"/>`);

  return piezas.join('');
}

/**
 * Los ojos: iris en la parte oscura de la cuenca, con un punto de luz.
 *
 * @param {Object} forma
 * @param {Object} tonos
 * @returns {string}
 */
function mirada(forma, tonos) {
  const rx = RX * forma.ancho;
  const ry = RY * forma.largo;
  const cx = CX + GIRO;
  const piezas = [];

  // El ojo mide una quinta parte de la anchura de la cara: la proporción
  // clásica, y la que evita que parezcan botones pegados.
  const w = rx * 0.25;

  for (const lado of [-1, 1]) {
    const escala = lado < 0 ? 1 : 0.72;
    const x = cx + lado * rx * (lado < 0 ? 0.39 : 0.35);
    const a = w * escala;

    // Hendidura del párpado: almendra, más alta por dentro que por fuera.
    piezas.push(`<path d="M${num(x - a)} ${num(OJOS_Y + 1)}`
      + `Q${num(x)} ${num(OJOS_Y + a * 0.62)} ${num(x + a)} ${num(OJOS_Y - 1)}`
      + `Q${num(x)} ${num(OJOS_Y - a * 0.55)} ${num(x - a)} ${num(OJOS_Y + 1)}Z" `
      + `fill="${brillo(tonos.pielSombra, 0.34)}"/>`);
    piezas.push(`<path d="M${num(x-a*.88)} ${num(OJOS_Y)} Q${num(x)} ${num(OJOS_Y-a*.42)} ${num(x+a*.88)} ${num(OJOS_Y-1)} Q${num(x)} ${num(OJOS_Y+a*.34)} ${num(x-a*.88)} ${num(OJOS_Y)}Z" fill="#B8C6CA" opacity=".78"/>`);

    // Iris.
    piezas.push(`<circle class="retrato-mirada" cx="${num(x + lado * 0.8)}" cy="${num(OJOS_Y)}" `
      + `r="${num(a * 0.29)}" fill="${tonos.ojo}" style="filter:drop-shadow(0 0 2px ${tonos.ojo})"/>`);
    piezas.push(`<circle cx="${num(x+lado*.8)}" cy="${num(OJOS_Y)}" r="${num(a*.12)}" fill="#071016"/>`);
    piezas.push(`<path d="M${num(x-a*.72)} ${num(OJOS_Y+1)} Q${num(x)} ${num(OJOS_Y+5)} ${num(x+a*.78)} ${num(OJOS_Y-1)}" stroke="${brillo(tonos.ojo,1.25)}" stroke-width="1.2" fill="none" opacity=".92"/>`);

    // Reflejo, siempre arriba a la izquierda: es la misma lámpara de todo el
    // juego, y ponerlo en otro sitio rompe la serie entera.
    piezas.push(`<circle cx="${num(x - a * 0.16)}" cy="${num(OJOS_Y - a * 0.14)}" `
      + `r="${num(a * 0.07)}" fill="#FFF" opacity="0.72"/>`);

    // Pestaña superior: sombra fina, no línea negra.
    piezas.push(`<path d="M${num(x - a)} ${num(OJOS_Y)}`
      + `Q${num(x)} ${num(OJOS_Y - a * 0.52)} ${num(x + a)} ${num(OJOS_Y - 2)}" `
      + `stroke="#111217" stroke-width="2.2" `
      + 'fill="none" stroke-linecap="round"/>');
    piezas.push(`<path d="M${num(x-lado*a*.22)} ${num(OJOS_Y-1)} L${num(x+lado*a*1.42)} ${num(OJOS_Y-8)}" stroke="#111217" stroke-width="1.4" opacity=".58"/>`);
    piezas.push(`<path d="M${num(x+a*.20)} ${num(OJOS_Y+7)} Q${num(x+a*.46)} ${num(OJOS_Y+18)} ${num(x+a*.34)} ${num(OJOS_Y+32)}" stroke="#11141B" stroke-width="${num(1.4*escala)}" fill="none" opacity=".74"/>`);
  }

  // Cejas: por encima del hueso, no pegadas al párpado.
  for (const lado of [-1, 1]) {
    const x = cx + lado * rx * 0.44;
    const escala = lado < 0 ? 1 : 0.72;
    const a = w * escala;

    piezas.push(`<path d="M${num(x - a * 1.25)} ${num(OJOS_Y - ry * 0.15)}`
      + `Q${num(x)} ${num(OJOS_Y - ry * 0.23)} ${num(x + a * 1.15)} `
      + `${num(OJOS_Y - ry * 0.14)}" stroke="${tonos.pelo}" `
      + `stroke-width="${num(4.6 * escala)}" fill="none" stroke-linecap="round" `
      + 'opacity="0.8"/>');
  }

  return piezas.join('');
}

/* ═══════════════════════════════════════════════════════════════════════════
   PELO
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Pelo que arranca en una línea de nacimiento y sigue el cráneo.
 *
 * Antes era un casquete que bajaba hasta las cejas y el resultado parecía una
 * seta. La línea de nacimiento a media frente es lo que lo convierte en pelo.
 *
 * @param {Object} forma
 * @param {Object} tonos
 * @param {Flujo} flujo
 * @returns {string}
 */
function pelo(forma, tonos, flujo) {
  const rx = RX * forma.ancho;
  const ry = RY * forma.largo;
  const cx = CX + GIRO;

  // La frente ocupa el tramo entre la ceja y el nacimiento del pelo: un tercio
  // de la altura de la cabeza, que es la proporción clásica.
  const nacimiento = OJOS_Y - ry * 0.46;

  const masa = `<path d="M${num(cx - rx * 1.04)} ${num(OJOS_Y + ry * 0.12)}`
    + `C${num(cx - rx * 1.12)} ${num(OJOS_Y - ry * 1.10)} ${num(cx + rx * 1.12)} `
    + `${num(OJOS_Y - ry * 1.10)} ${num(cx + rx * 1.04)} ${num(OJOS_Y + ry * 0.12)}`
    + `C${num(cx + rx * 0.95)} ${num(nacimiento + 12)} ${num(cx + rx * 0.55)} `
    + `${num(nacimiento - 6)} ${num(cx)} ${num(nacimiento)}`
    + `C${num(cx - rx * 0.55)} ${num(nacimiento - 6)} ${num(cx - rx * 0.95)} `
    + `${num(nacimiento + 12)} ${num(cx - rx * 1.04)} ${num(OJOS_Y + ry * 0.12)}Z" `
    + `fill="${tonos.pelo}"/>`;

  const raices = [];
  raices.push(`<path d="M${num(cx-rx*.94)} ${num(nacimiento+28)} C${num(cx-rx*.84)} ${num(OJOS_Y-ry*.76)} ${num(cx-rx*.30)} ${num(OJOS_Y-ry*1.13)} ${num(cx+rx*.36)} ${num(OJOS_Y-ry*.96)} C${num(cx+rx*.02)} ${num(OJOS_Y-ry*.73)} ${num(cx-rx*.26)} ${num(OJOS_Y-ry*.48)} ${num(cx-rx*.34)} ${num(OJOS_Y-ry*.03)} C${num(cx-rx*.54)} ${num(nacimiento+20)} ${num(cx-rx*.76)} ${num(nacimiento+36)} ${num(cx-rx*.94)} ${num(nacimiento+28)}Z" fill="${brillo(tonos.pelo,.62)}" opacity=".92"/>`);
  raices.push(`<path d="M${num(cx+rx*.34)} ${num(OJOS_Y-ry*.96)} C${num(cx+rx*.92)} ${num(OJOS_Y-ry*.84)} ${num(cx+rx*1.03)} ${num(OJOS_Y-ry*.23)} ${num(cx+rx*.88)} ${num(OJOS_Y+ry*.94)} C${num(cx+rx*.73)} ${num(OJOS_Y+ry*.58)} ${num(cx+rx*.62)} ${num(OJOS_Y-ry*.12)} ${num(cx+rx*.34)} ${num(OJOS_Y-ry*.96)}Z" fill="${brillo(tonos.pelo,.46)}" opacity=".78"/>`);
  raices.push(`<path d="M${num(cx-rx*.78)} ${num(nacimiento+8)} C${num(cx-rx*.52)} ${num(OJOS_Y-ry*.92)} ${num(cx+rx*.10)} ${num(OJOS_Y-ry*1.02)} ${num(cx+rx*.70)} ${num(nacimiento+10)}" stroke="${brillo(tonos.pelo,1.34)}" stroke-width="13" fill="none" opacity=".32" stroke-linecap="round"/>`);
  raices.push(`<path d="M${num(cx+rx*.68)} ${num(nacimiento+9)} C${num(cx+rx*.92)} ${num(OJOS_Y-ry*.10)} ${num(cx+rx*.86)} ${num(OJOS_Y+ry*.74)} ${num(cx+rx*.70)} ${num(OJOS_Y+ry*1.12)}" stroke="${brillo(tonos.pelo,.54)}" stroke-width="27" fill="none" opacity=".58" stroke-linecap="round"/>`);
  for (let i=0;i<14;i++) {
    const lado=i%2===0?-1:1;
    const t=(i%11)/10, x0=cx+lado*rx*(.52+t*.62);
    const raizX=cx-rx*.12+lado*flujo.flotante(0,rx*.16);
    const curvaX=cx+lado*rx*flujo.flotante(.56,1.0);
    const finalY=OJOS_Y+ry*flujo.flotante(.35,1.38);
    raices.push(`<path d="M${num(raizX)} ${num(OJOS_Y-ry*.93+flujo.flotante(-8,8))} Q${num(curvaX)} ${num(OJOS_Y-ry*.42)} ${num(x0+flujo.flotante(-8,8))} ${num(finalY)}" stroke="${brillo(tonos.pelo,flujo.flotante(.45,1.55))}" stroke-width="${num(flujo.flotante(.45,2.4))}" fill="none" opacity="${num(flujo.flotante(.18,.58))}" stroke-linecap="round"/>`);
  }

  // Un par de mechones sueltos rompen el borde limpio del vector.
  const mechones = [];

  for (let i = 0; i < 5; i++) {
    const x = cx + flujo.flotante(-rx, rx);
    const y = nacimiento + flujo.flotante(-4, 10);

    mechones.push(`<path class="retrato-mechon" style="--mechon-fase:${num(flujo.flotante(-3, 0))}s" d="M${num(x)} ${num(y)}q${num(flujo.flotante(-8, 8))} `
      + `${num(flujo.flotante(8, 18))} ${num(flujo.flotante(-10, 10))} `
      + `${num(flujo.flotante(16, 30))}" stroke="${tonos.pelo}" `
      + `stroke-width="${num(flujo.flotante(2, 4.5))}" fill="none" `
      + 'stroke-linecap="round"/>');
  }

  // Brillo del pelo, arriba a la izquierda como todo lo demás.
  const pincel = [];
  pincel.push(`<path d="M${num(cx+rx*.22)} ${num(OJOS_Y-ry*.96)} C${num(cx-rx*.06)} ${num(OJOS_Y-ry*.83)} ${num(cx-rx*.46)} ${num(OJOS_Y-ry*.57)} ${num(cx-rx*.62)} ${num(OJOS_Y-ry*.05)}" stroke="${brillo(tonos.pelo,1.28)}" stroke-width="15" fill="none" opacity=".42" stroke-linecap="round"/>`);
  pincel.push(`<path d="M${num(cx+rx*.37)} ${num(OJOS_Y-ry*.91)} C${num(cx+rx*.58)} ${num(OJOS_Y-ry*.64)} ${num(cx+rx*.70)} ${num(OJOS_Y-ry*.28)} ${num(cx+rx*.70)} ${num(OJOS_Y+ry*.46)}" stroke="${brillo(tonos.pelo,.70)}" stroke-width="12" fill="none" opacity=".48" stroke-linecap="round"/>`);
  pincel.push(`<path d="M${num(cx-rx*.10)} ${num(OJOS_Y-ry*.94)} Q${num(cx-rx*.72)} ${num(OJOS_Y-ry*.46)} ${num(cx-rx*.76)} ${num(OJOS_Y+ry*.78)}" stroke="${brillo(tonos.pelo,1.14)}" stroke-width="8" fill="none" opacity=".74" stroke-linecap="round"/>`);

  const luz = `<path d="M${num(cx + rx * 0.25)} ${num(OJOS_Y - ry * 0.97)}`
    + `Q${num(cx - rx * 0.20)} ${num(OJOS_Y - ry * 0.76)} ${num(cx - rx * 0.62)} `
    + `${num(OJOS_Y - ry * 0.18)}" stroke="${brillo(tonos.pelo, 1.5)}" `
    + 'stroke-width="6" fill="none" opacity="0.3" stroke-linecap="round"/>';

  for (let i=0;i<22;i++) {
    const lado=i%2===0?-1:1;
    const x=cx+lado*flujo.flotante(rx*.58,rx*.98);
    const y=OJOS_Y-ry*flujo.flotante(.48,.92);
    pincel.push(`<path d="M${num(x)} ${num(y)} Q${num(x+lado*flujo.flotante(8,24))} ${num(y+ry*.42)} ${num(x+lado*flujo.flotante(4,34))} ${num(y+ry*1.05)}" stroke="${brillo(tonos.pelo,flujo.flotante(.68,1.42))}" stroke-width="${num(flujo.flotante(1.4,4.2))}" fill="none" opacity="${num(flujo.flotante(.20,.56))}" stroke-linecap="round"/>`);
  }
  return masa + raices.join('') + pincel.join('') + mechones.join('') + luz;
}

/* ═══════════════════════════════════════════════════════════════════════════
   RASGO PROPIO DEL LINAJE
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * El añadido que separa un linaje de otro. Todo sale del campo `aspecto`.
 *
 * @param {string} rasgo
 * @param {Object} forma
 * @param {Object} tonos
 * @param {Flujo} flujo
 * @param {'detras'|'delante'} capa
 * @returns {string}
 */
function rasgoLinaje(rasgo, forma, tonos, flujo, capa) {
  const rx = RX * forma.ancho;
  const ry = RY * forma.largo;
  const cx = CX + GIRO;
  const piezas = [];

  /* ── Detrás de la cabeza ──────────────────────────────────────────────── */
  if (capa === 'detras') {
    switch (rasgo) {
      case 'cuernos': {
        // Griscuerno: «cuernos curvos que van del pardo al blanco según la edad».
        // Nacen en la sien y barren hacia atrás y arriba, no hacia los lados:
        // hacia los lados parecían un bigote.
        for (const lado of [-1, 1]) {
          const x0 = cx + lado * rx * 0.78;
          const y0 = OJOS_Y - ry * 0.62;

          piezas.push(`<path d="M${num(x0)} ${num(y0)}`
            + `C${num(x0 + lado * 34)} ${num(y0 - 26)} `
            + `${num(x0 + lado * 52)} ${num(y0 - 62)} `
            + `${num(x0 + lado * 38)} ${num(y0 - 96)}`
            + `C${num(x0 + lado * 34)} ${num(y0 - 66)} `
            + `${num(x0 + lado * 20)} ${num(y0 - 34)} `
            + `${num(x0 - lado * 4)} ${num(y0 - 6)}Z" `
            + `fill="${mezclar(BASE.hueso, '#5E5142', 0.42)}"/>`);

          // Filo de luz en el canto del cuerno.
          piezas.push(`<path d="M${num(x0 + lado * 2)} ${num(y0 - 4)}`
            + `C${num(x0 + lado * 30)} ${num(y0 - 28)} `
            + `${num(x0 + lado * 46)} ${num(y0 - 62)} `
            + `${num(x0 + lado * 37)} ${num(y0 - 92)}" `
            + `stroke="${brillo(BASE.hueso, 1.18)}" stroke-width="2.4" `
            + 'fill="none" opacity="0.5"/>');
        }
        break;
      }

      case 'brillo': {
        // Albar: «piel pálida con un brillo tenue bajo la luna».
        const id = idUnico('albar');

        piezas.push(`<defs><radialGradient id="${id}">`
          + `<stop offset="0.35" stop-color="${tonos.acento}" stop-opacity="0.26"/>`
          + `<stop offset="1" stop-color="${tonos.acento}" stop-opacity="0"/>`
          + '</radialGradient></defs>');

        piezas.push(`<ellipse cx="${num(cx)}" cy="${num(OJOS_Y)}" `
          + `rx="${num(rx * 2.4)}" ry="${num(ry * 2.0)}" fill="url(#${id})"/>`);
        break;
      }

      case 'corriente': {
        // Brumal: «cabello que se mueve como si hubiera corriente».
        for (let i = 0; i < 14; i++) {
          const x0 = cx + flujo.flotante(-rx * 0.95, rx * 0.95);
          const y0 = OJOS_Y - ry * 0.5 + flujo.flotante(-30, 10);
          const deriva = flujo.flotante(30, 92) * (flujo.moneda() ? 1 : -1);

          piezas.push(`<path d="M${num(x0)} ${num(y0)}`
            + `q${num(deriva * 0.45)} ${num(flujo.flotante(-34, -12))} `
            + `${num(deriva)} ${num(flujo.flotante(-70, -26))}" `
            + `stroke="${tonos.pelo}" stroke-width="${num(flujo.flotante(2, 5.5))}" `
            + `fill="none" opacity="${num(flujo.flotante(0.25, 0.6))}" `
            + 'stroke-linecap="round"/>');
        }
        break;
      }

      case 'rizos': {
        // Menudo: rizos apretados que desbordan el cráneo.
        for (let i = 0; i < 30; i++) {
          const a = Math.PI * 1.04 + (i / 30) * Math.PI * 0.92;
          const r = flujo.flotante(1.0, 1.12);

          piezas.push(`<circle cx="${num(cx + Math.cos(a) * rx * r)}" `
            + `cy="${num(OJOS_Y + Math.sin(a) * ry * r)}" `
            + `r="${num(flujo.flotante(10, 16))}" fill="${tonos.pelo}"/>`);
        }
        break;
      }

      default: break;
    }

    return piezas.join('');
  }

  /* ── Delante de la cabeza ─────────────────────────────────────────────── */
  switch (rasgo) {
    case 'barba': {
      // Ferrano: «barba de forja, trenzada». Cubre mandíbula y mentón, NO la
      // boca entera: taparla del todo era lo que la convertía en un babero.
      const barbaY = OJOS_Y + ry * 0.58;

      piezas.push(`<path d="M${num(cx - rx * 0.98)} ${num(barbaY - 16)}`
        + `C${num(cx - rx * 1.06)} ${num(barbaY + 76)} ${num(cx - rx * 0.4)} `
        + `${num(barbaY + 116)} ${num(cx)} ${num(barbaY + 118)}`
        + `C${num(cx + rx * 0.4)} ${num(barbaY + 116)} ${num(cx + rx * 1.06)} `
        + `${num(barbaY + 76)} ${num(cx + rx * 0.98)} ${num(barbaY - 16)}`
        + `C${num(cx + rx * 0.7)} ${num(barbaY + 26)} ${num(cx - rx * 0.7)} `
        + `${num(barbaY + 26)} ${num(cx - rx * 0.98)} ${num(barbaY - 16)}Z" `
        + `fill="${tonos.pelo}"/>`);

      // Bigote, separado de la barba por el hueco de la boca.
      piezas.push(`<path d="M${num(cx - rx * 0.52)} ${num(OJOS_Y + ry * 0.42)}`
        + `Q${num(cx)} ${num(OJOS_Y + ry * 0.52)} ${num(cx + rx * 0.5)} `
        + `${num(OJOS_Y + ry * 0.40)}" stroke="${tonos.pelo}" stroke-width="13" `
        + 'fill="none" stroke-linecap="round"/>');

      // Dos trenzas.
      for (const lado of [-1, 1]) {
        piezas.push(`<path d="M${num(cx + lado * 20)} ${num(barbaY + 84)}`
          + `q${num(lado * 4)} 22 ${num(lado * 2)} 40" `
          + `stroke="${brillo(tonos.pelo, 0.68)}" stroke-width="9" `
          + 'fill="none" stroke-linecap="round"/>');
      }
      break;
    }

    case 'veta': {
      // Sombracorteza: «piel veteada en gris y pardo que se endurece con la edad».
      for (let i = 0; i < 8; i++) {
        const x = cx + flujo.flotante(-rx * 0.85, rx * 0.85);
        const y = OJOS_Y + flujo.flotante(-ry * 0.3, ry * 0.72);

        piezas.push(`<path d="M${num(x)} ${num(y)}`
          + `q${num(flujo.flotante(-5, 5))} ${num(flujo.flotante(10, 20))} `
          + `${num(flujo.flotante(-3, 3))} ${num(flujo.flotante(20, 38))}" `
          + `stroke="${brillo(tonos.pielSombra, 0.78)}" stroke-width="1.8" `
          + 'fill="none" opacity="0.55" stroke-linecap="round"/>');
      }
      break;
    }

    case 'vetas': {
      // Crisol: «vetas de mineral luminoso que se apagan cuando están heridos».
      const id = idUnico('veta');

      piezas.push(`<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">`
        + `<stop offset="0" stop-color="${tonos.acento}" stop-opacity="0.9"/>`
        + `<stop offset="1" stop-color="${tonos.acento}" stop-opacity="0.15"/>`
        + '</linearGradient></defs>');

      for (let i = 0; i < 6; i++) {
        const x = cx + flujo.flotante(-rx * 0.8, rx * 0.8);
        const y = OJOS_Y - ry * 0.34 + flujo.flotante(-8, 8);

        piezas.push(`<path d="M${num(x)} ${num(y)}`
          + `l${num(flujo.flotante(-12, 12))} ${num(flujo.flotante(26, 54))}" `
          + `stroke="url(#${id})" stroke-width="2.2" fill="none" `
          + 'stroke-linecap="round"/>');
      }

      // La juntura de la placa facial: es un rostro fijo, construido.
      piezas.push(`<path d="M${num(cx)} ${num(OJOS_Y - ry * 0.5)}`
        + `L${num(cx)} ${num(OJOS_Y + ry * 0.72)}" `
        + `stroke="${brillo(tonos.pielSombra, 0.8)}" stroke-width="1.6" `
        + 'opacity="0.5"/>');
      break;
    }

    case 'capas': {
      // Valdés: «visten en capas superpuestas». Se lee en el cuello de la ropa.
      for (let i = 0; i < 3; i++) {
        const y = ALTO * 0.70 + i * 16;

        piezas.push(`<path d="M${num(CX - 118 - i * 22)} ${num(y + 26)}`
          + `Q${num(CX)} ${num(y - 14)} ${num(CX + 118 + i * 22)} ${num(y + 26)}" `
          + `stroke="${brillo(BASE.ceniza, 1.05 + i * 0.30)}" stroke-width="8" `
          + 'fill="none" stroke-linecap="round"/>');
      }
      break;
    }

    default: break;
  }

  return piezas.join('');
}

/** Ajusta la paleta con colores visuales escritos por el jugador. */
function tonosDescripcion(base, descripcion) {
  const d = String(descripcion ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  let pelo = base.pelo;
  let ojo = base.ojo;
  if (/pelo (rojo|pelirroj)|cabello (rojo|pelirroj)/.test(d)) pelo = '#8E432F';
  else if (/pelo (negro|azabache)|cabello (negro|azabache)/.test(d)) pelo = '#171519';
  else if (/pelo (blanco|plateado)|cabello (blanco|plateado)/.test(d)) pelo = '#AEB6B9';
  else if (/pelo (dorado|rubio)|cabello (dorado|rubio)/.test(d)) pelo = '#B99A5C';
  if (/ojos? (rojos?|carmesi|escarlata)/.test(d)) ojo = '#FF334E';
  else if (/ojos? (azul(?:es)?|celestes?|cian)/.test(d)) ojo = '#55C8FF';
  else if (/ojos? verdes?/.test(d)) ojo = '#64C991';
  else if (/ojos? (dorados?|ambar)/.test(d)) ojo = '#C29A3A';
  else if (/ojos? (violetas?|morados?)/.test(d)) ojo = '#8170A2';
  return { ...base, pelo, ojo };
}

/** Convierte palabras visuales del jugador en detalles dibujados, localmente. */
function detallesDescripcion(descripcion, forma, tonos) {
  const d = String(descripcion ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const rx = RX * forma.ancho;
  const ry = RY * forma.largo;
  const cx = CX + GIRO;
  const piezas = [];

  if (/cicatriz|scar/.test(d)) {
    const lado = /izquierd/.test(d) ? -1 : 1;
    const x = cx + lado * rx * .43;
    // Cruza la ceja y la mejilla, oscura y con su filo claro: con 3 px en
    // tono de sombra se confundía con las líneas que la cara ya tiene.
    piezas.push(`<path class="retrato-rasgo retrato-rasgo--cicatriz" d="M${num(x-12)} ${num(OJOS_Y-40)} L${num(x-2)} ${num(OJOS_Y-6)} L${num(x+10)} ${num(OJOS_Y+40)}" fill="none" stroke="#5A1F1C" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" opacity=".88"/>`);
    piezas.push(`<path d="M${num(x-10)} ${num(OJOS_Y-38)} L${num(x)} ${num(OJOS_Y-5)} L${num(x+12)} ${num(OJOS_Y+38)}" fill="none" stroke="${brillo(tonos.piel,1.35)}" stroke-width="1.3" stroke-linecap="round" opacity=".7"/>`);
    piezas.push(`<path d="M${num(x-9)} ${num(OJOS_Y-20)} l9 -4 M${num(x-2)} ${num(OJOS_Y+8)} l10 -4 M${num(x+2)} ${num(OJOS_Y+24)} l9 -3" stroke="#5A1F1C" stroke-width="1.8" stroke-linecap="round" opacity=".7"/>`);
  }
  if (/parche|eyepatch/.test(d)) {
    const lado = /izquierd/.test(d) ? -1 : 1;
    const x = cx + lado * rx * .44;
    piezas.push(`<ellipse class="retrato-rasgo retrato-rasgo--parche" cx="${num(x)}" cy="${num(OJOS_Y)}" rx="19" ry="13" fill="#171313"/>`);
    piezas.push(`<path d="M${num(cx-rx*.92)} ${num(OJOS_Y-16)} L${num(cx+rx*.92)} ${num(OJOS_Y+5)}" stroke="#211B19" stroke-width="4"/>`);
  }
  if (/barba|barbudo|beard/.test(d)) {
    piezas.push(`<path class="retrato-rasgo retrato-rasgo--barba" d="M${num(cx-rx*.68)} ${num(OJOS_Y+ry*.48)} Q${num(cx)} ${num(OJOS_Y+ry*1.22)} ${num(cx+rx*.64)} ${num(OJOS_Y+ry*.46)} Q${num(cx)} ${num(OJOS_Y+ry*.9)} ${num(cx-rx*.68)} ${num(OJOS_Y+ry*.48)}Z" fill="${tonos.pelo}" opacity=".9"/>`);
  }
  if (/capucha|hood/.test(d)) {
    piezas.push(`<path class="retrato-rasgo retrato-rasgo--capucha" d="M${num(cx-rx*1.2)} ${num(OJOS_Y+ry*.35)} Q${num(cx-rx*1.25)} ${num(OJOS_Y-ry*1.18)} ${num(cx)} ${num(OJOS_Y-ry*1.3)} Q${num(cx+rx*1.25)} ${num(OJOS_Y-ry*1.18)} ${num(cx+rx*1.2)} ${num(OJOS_Y+ry*.35)}" fill="none" stroke="${brillo(BASE.hierro,.8)}" stroke-width="25" opacity=".8"/>`);
  }
  return piezas.join('');
}

/** Fondo de niebla, contraluz y motas, derivado de la misma semilla. */
function atmosferaRetrato(tonos, flujo, idFondo, idHalo) {
  const piezas = [
    `<rect width="${ANCHO}" height="${ALTO}" fill="url(#${idFondo})"/>`,
    `<ellipse cx="${num(CX-70)}" cy="92" rx="150" ry="190" fill="url(#${idHalo})"/>`,
    '<path d="M-30 420 C75 330 78 165 22 0 L160 0 C111 164 126 340 220 500Z" fill="#BFD4DB" opacity=".045"/>',
  ];
  for (let i=0;i<22;i++) {
    const x=flujo.flotante(0,ANCHO), y=flujo.flotante(0,ALTO), r=flujo.flotante(.5,2.2);
    piezas.push(`<circle cx="${num(x)}" cy="${num(y)}" r="${num(r)}" fill="${tonos.ojo}" opacity="${num(flujo.flotante(.08,.28))}"/>`);
  }
  return piezas.join('');
}

/** Orejas altas y afiladas para los linajes feéricos de la referencia. */
function orejasAfiladas(raza, forma, tonos) {
  if (!['albar', 'brumal'].includes(raza)) return '';
  const rx=RX*forma.ancho, ry=RY*forma.largo, cx=CX+GIRO;
  return [-1,1].map(lado => {
    const baseX=cx+lado*rx*.88, baseY=OJOS_Y-ry*.03;
    const tipX=cx+lado*rx*1.72, tipY=OJOS_Y-ry*.42;
    return `<path d="M${num(baseX)} ${num(baseY-24)} Q${num(tipX)} ${num(tipY)} ${num(baseX)} ${num(baseY+34)} Q${num(baseX-lado*18)} ${num(baseY+3)} ${num(baseX)} ${num(baseY-24)}Z" fill="${tonos.pielSombra}" stroke="${brillo(tonos.piel,1.25)}" stroke-width="2"/>`
      + `<path d="M${num(baseX+lado*3)} ${num(baseY-11)} L${num(tipX-lado*16)} ${num(tipY+10)} L${num(baseX+lado*4)} ${num(baseY+18)}" fill="none" stroke="${brillo(tonos.pielSombra,.62)}" stroke-width="1.4" opacity=".8"/>`;
  }).join('');
}

/** Pinceladas de concept art: planos afilados, pelo filamentoso y luz de borde. */
function acabadoPictorico(forma, tonos, flujo, dCabeza, idRecorte, idResplandor) {
  const rx=RX*forma.ancho, ry=RY*forma.largo, cx=CX+GIRO;
  const piezas=[`<g clip-path="url(#${idRecorte})">`];
  // Veladuras amplias sobre frente, nariz y pómulos. Los bordes blandos
  // conservan estructura sin dividir la piel en polígonos visibles.
  piezas.push(`<path d="M${num(cx-rx*.82)} ${num(OJOS_Y-ry*.48)} Q${num(cx-rx*.35)} ${num(OJOS_Y-ry*.75)} ${num(cx+3)} ${num(OJOS_Y-ry*.54)} L${num(cx-10)} ${num(OJOS_Y+ry*.36)} Q${num(cx-rx*.5)} ${num(OJOS_Y+ry*.54)} ${num(cx-rx*.82)} ${num(OJOS_Y+ry*.18)}Z" fill="${brillo(tonos.piel,1.22)}" opacity=".11" filter="blur(7px)"/>`);
  piezas.push(`<path d="M${num(cx+4)} ${num(OJOS_Y-ry*.42)} Q${num(cx+rx*.82)} ${num(OJOS_Y-ry*.18)} ${num(cx+rx*.72)} ${num(OJOS_Y+ry*.43)} Q${num(cx+rx*.42)} ${num(OJOS_Y+ry*.65)} ${num(cx+8)} ${num(OJOS_Y+ry*.48)}Z" fill="#0A0E15" opacity=".13" filter="blur(6px)"/>`);
  // Pincel seco mínimo en el borde del pómulo, no sobre toda la mejilla.
  for (const lado of [-1,1]) for(let i=0;i<2;i++) {
    const x=cx+lado*rx*flujo.flotante(.62,.82), y=OJOS_Y+ry*flujo.flotante(.28,.48);
    piezas.push(`<path d="M${num(x)} ${num(y)} l${num(lado*flujo.flotante(8,16))} ${num(flujo.flotante(-3,3))}" stroke="${brillo(tonos.pielSombra,.62)}" stroke-width="${num(flujo.flotante(.6,1.2))}" opacity=".18"/>`);
  }
  piezas.push('</g>');
  // Silueta de tinta irregular y contraluz de plata.
  piezas.push(`<path d="${dCabeza}" fill="none" stroke="#090B0F" stroke-width="1.2" opacity=".34"/>`);
  piezas.push(`<path d="${dCabeza}" fill="none" stroke="${brillo(tonos.pelo,1.42)}" stroke-width="2.1" opacity=".72" filter="url(#${idResplandor})"/>`);
  // Hebras largas que cruzan el rostro, como las referencias.
  for(let i=0;i<5;i++) {
    const lado=i%2===0?-1:1;
    const x=cx+lado*flujo.flotante(rx*.54,rx*.94), y=OJOS_Y-ry*flujo.flotante(.35,.94);
    const deriva=lado*flujo.flotante(18,62);
    piezas.push(`<path class="retrato-mechon" style="--mechon-fase:${num(flujo.flotante(-3,0))}s" d="M${num(x)} ${num(y)} Q${num(x+deriva*.42)} ${num(y+ry*.65)} ${num(x+deriva)} ${num(y+ry*1.32)}" stroke="${brillo(tonos.pelo,flujo.flotante(.72,1.38))}" stroke-width="${num(flujo.flotante(.65,2.5))}" fill="none" opacity="${num(flujo.flotante(.28,.76))}" stroke-linecap="round"/>`);
  }
  return piezas.join('');
}

/* ═══════════════════════════════════════════════════════════════════════════
   PRINCIPAL
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Genera el retrato de un personaje.
 *
 * @param {Object} opciones
 * @param {string} opciones.raza `refId` del linaje.
 * @param {string} [opciones.nombre] Para el texto alternativo y el ruido fino.
 * @param {string} [opciones.semilla] Distingue dos personajes del mismo linaje.
 * @returns {string} SVG completo.
 */
export function retrato(opciones = {}) {
  const { raza = 'valdes', nombre = '', semilla: extra = '', descripcion = '' } = opciones;

  const tonos = tonosDescripcion(LINAJES[raza] ?? LINAJE_POR_DEFECTO, descripcion);
  const forma = FORMA[raza] ?? FORMA_POR_DEFECTO;

  const semilla = hashSemilla(`retrato:${raza}:${extra}`);
  const flujo = new Flujo(semilla, 'retrato');

  const idFondo = idUnico('fdo');
  const idPiel = idUnico('piel');
  const idTela = idUnico('tela');
  const idRecorte = idUnico('rec');
  const idHalo = idUnico('halo');
  const idResplandor = idUnico('glow');
  const idSuave = idUnico('soft');
  const idTextura = idUnico('skin');
  const idPintura = idUnico('paint');
  const idRelieve = idUnico('relief');

  const dCabeza = siluetaCabeza(forma);

  // Fondo plano, como pide el ancla, con un halo muy corto detrás de la cabeza
  // para que la silueta se despegue sin dibujar un escenario.
  const defs = `<radialGradient id="${idFondo}" cx="0.42" cy="0.28" r="0.9">`
    + `<stop offset="0" stop-color="${mezclar('#5E7180', tonos.ojo, 0.16)}"/>`
    + `<stop offset="0.46" stop-color="#202A33"/>`
    + `<stop offset="1" stop-color="#07090D"/>`
    + '</radialGradient>'
    + `<radialGradient id="${idHalo}"><stop offset="0" stop-color="#E5F3F5" stop-opacity=".38"/><stop offset="1" stop-color="#B7D2DD" stop-opacity="0"/></radialGradient>`
    + `<filter id="${idResplandor}" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`
    + `<filter id="${idSuave}" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="10"/></filter>`
    + `<filter id="${idTextura}" x="-20%" y="-20%" width="140%" height="140%"><feTurbulence type="fractalNoise" baseFrequency=".025 .16" numOctaves="3" seed="${semilla}"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope=".34"/></feComponentTransfer></filter>`
    + `<filter id="${idPintura}" x="-12%" y="-12%" width="124%" height="124%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency=".018 .055" numOctaves="4" seed="${semilla}" result="fibra"/><feDisplacementMap in="SourceGraphic" in2="fibra" scale="2.6" xChannelSelector="R" yChannelSelector="B" result="ondulado"/><feGaussianBlur in="SourceGraphic" stdDeviation="5" result="veladura"/><feBlend in="ondulado" in2="veladura" mode="soft-light" result="pintado"/><feComposite in="pintado" in2="SourceGraphic" operator="in"/></filter>`
    + `<filter id="${idRelieve}" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency=".012 .035" numOctaves="3" seed="${semilla+17}" result="bump"/><feDiffuseLighting in="bump" surfaceScale="5" diffuseConstant=".72" lighting-color="#DCE7EA" result="luz"><feDistantLight azimuth="225" elevation="48"/></feDiffuseLighting><feSpecularLighting in="bump" surfaceScale="3" specularConstant=".34" specularExponent="18" lighting-color="#ECF7FA" result="brillo"><feDistantLight azimuth="225" elevation="56"/></feSpecularLighting><feBlend in="SourceGraphic" in2="luz" mode="soft-light" result="volumen"/><feBlend in="volumen" in2="brillo" mode="screen"/><feComposite in2="SourceGraphic" operator="in"/></filter>`
    + degradadoLuz(idPiel, brillo(tonos.piel, 1.10), brillo(tonos.pielSombra, .66))
    // La tela tiene que despegarse del fondo. Con los grises de `ceniza` a
    // `tinta` el busto salía del mismo color que el fondo y la cabeza parecía
    // flotar sobre un palo.
    + degradadoLuz(idTela, BASE.hierro, BASE.cenizaHonda)
    + `<clipPath id="${idRecorte}"><path d="${dCabeza}"/></clipPath>`;

  const cuerpo = [
    atmosferaRetrato(tonos, flujo, idFondo, idHalo),

    rasgoLinaje(tonos.rasgo, forma, tonos, flujo, 'detras'),
    orejasAfiladas(raza, forma, tonos),
    cabelloExterior(forma, tonos, flujo),
    busto(forma, tonos, idTela),

    // La cabeza y todo lo que la modela, recortado contra su propia silueta.
    `<path d="${dCabeza}" fill="url(#${idPiel})" filter="url(#${idPintura})"/>`,
    `<path d="${dCabeza}" fill="${tonos.piel}" filter="url(#${idRelieve})" opacity=".44"/>`,
    modeladoPiel(forma, tonos, idRecorte, idSuave, idTextura),
    `<g clip-path="url(#${idRecorte})" style="filter:drop-shadow(0 1px 1px rgba(0,0,0,.18))">`,
    volumenRostro(forma, tonos),
    mirada(forma, tonos),
    pelo(forma, tonos, flujo),
    '</g>',

    // Filo de luz en el borde iluminado. Va SIN recortar y encima de todo:
    // es lo que separa la cabeza del fondo y lo que más se parece a óleo.
    `<path d="${dCabeza}" fill="none" stroke="${brillo(tonos.piel, 1.3)}" `
      + 'stroke-width="1.6" opacity="0.48" filter="url(#' + idResplandor + ')"/>',

    acabadoPictorico(forma, tonos, flujo, dCabeza, idRecorte, idResplandor),
    rasgoLinaje(tonos.rasgo, forma, tonos, flujo, 'delante'),
    detallesDescripcion(descripcion, forma, tonos),
  ].join('');

  return lienzo({
    ancho: ANCHO, alto: ALTO,
    etiqueta: nombre ? `Retrato de ${nombre}` : 'Retrato',
    semilla, defs, cuerpo,
    vineta: 0.72, grano: 0.18, clase: 'arte arte--retrato arte--retrato-concept',
    // Anclado arriba: en un hueco más apaisado que 5:6 se pierde el pecho,
    // no la coronilla. Los cuernos del griscuerno y los rizos del menudo
    // salen del cráneo hacia arriba y son la mitad de su identidad.
    recorte: 'xMidYMin slice',
  });
}

export default retrato;
