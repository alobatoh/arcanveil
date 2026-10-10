/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCANVEIL · tools/dobles/creacion-ui.mjs
 * ---------------------------------------------------------------------------
 * Recorrer la creación de personaje POR LA INTERFAZ, como la recorre un
 * jugador: elegir en las listas, escribir, pulsar «Siguiente». Lo comparten
 * las pruebas de navegador (regresión, empaquetado, auditoría de UX) para no
 * repetir los pasos en cada una.
 *
 * Desde el #12 la creación va por pasos (origen → quién eres → aspecto →
 * revisar). Antes era un formulario único con «Crear personaje»: las pruebas
 * que rellenaban tres campos y pulsaban ese botón usan ahora esto, y
 * conservan lo que comprobaban (que el personaje nace con esos datos).
 *
 * Devuelve el TEXTO de una expresión asíncrona para evaluar en la página.
 * No toca el estado del juego por detrás: solo controles que el jugador ve.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * @param {Object} o
 * @param {string} o.nombre
 * @param {string} o.descripcion
 * @param {string} o.lore
 * @param {string} [o.raza] refId del linaje (si falta, lo que haya tirado el dado).
 * @param {string} [o.clase]
 * @param {string} [o.trasfondo]
 * @param {'f'|'m'} [o.genero]
 * @param {string} [o.intensidad] `relato` | `equilibrado` | `implacable`.
 * @param {'dibujo'|'pintado'|'ninguno'} [o.imagen] Qué imagen elegir (por omisión, la que proponga el juego).
 * @param {'origen'|'quien'|'aspecto'|'revisar'} [o.hasta='revisar'] En qué paso parar.
 * @returns {string} Expresión que resuelve con el paso en el que queda.
 */
export function crearPersonajeUI(o) {
  return `(async () => {
    const o = ${JSON.stringify(o)};
    const parar = o.hasta ?? 'revisar';
    const esp = (ms) => new Promise((r) => setTimeout(r, ms));
    const llegar = async (f, que, ms = 12000) => { const t = Date.now(); while (Date.now() - t < ms) { if (f()) return; await esp(40); } throw new Error('creación por la interfaz: no llegó «' + que + '»'); };
    const paso = () => document.querySelector('[data-pantalla="creacion"]')?.dataset.paso;
    const fill = (q, v) => { const n = document.querySelector(q); if (!n) throw new Error('creación por la interfaz: falta ' + q); n.value = v; n.dispatchEvent(new Event('input', { bubbles: true })); };
    const elegir = (q, v) => { const n = document.querySelector(q); if (!n) throw new Error('creación por la interfaz: falta ' + q); n.value = v; if (n.value !== v) throw new Error('creación por la interfaz: ' + q + ' no ofrece «' + v + '»'); n.dispatchEvent(new Event('change', { bubbles: true })); };
    const siguiente = async (destino) => {
      document.querySelector('#creacion-siguiente').click();
      await llegar(() => paso() === destino || document.querySelector('.campo__error'), destino);
      if (paso() !== destino) throw new Error('creación por la interfaz: no avanza a «' + destino + '»: ' + (document.querySelector('.campo__error')?.textContent ?? 'sin motivo'));
    };
    await llegar(() => document.body.dataset.activeScreen === 'creacion' && paso() === 'origen', 'origen');
    if (o.raza) elegir('#origen-raza', o.raza);
    if (o.clase) elegir('#origen-clase', o.clase);
    if (o.trasfondo) elegir('#origen-trasfondo', o.trasfondo);
    if (parar === 'origen') return paso();
    await siguiente('quien');
    fill('#nombre', o.nombre);
    if (o.genero) document.querySelector('#trato [data-genero="' + o.genero + '"]').click();
    fill('#lore-personaje', o.lore);
    if (o.intensidad) document.querySelector('[data-intensidad="' + o.intensidad + '"]').click();
    if (parar === 'quien') return paso();
    await siguiente('aspecto');
    fill('#retrato-descripcion', o.descripcion);
    if (o.imagen) {
      // «pintado» solo se puede elegir si hay generador, y eso se mira cuando
      // el jugador lo pide: se pulsa «Comprobar» y se espera la respuesta.
      if (o.imagen === 'pintado') document.querySelector('#aspecto-comprobar')?.click();
      if (o.imagen === 'pintado') await llegar(() => document.querySelector('#aspecto-modo-pintado')?.getAttribute('aria-disabled') !== 'true', 'generador disponible');
      document.querySelector('#aspecto-modo-' + o.imagen).click();
    }
    if (parar === 'aspecto') return paso();
    await siguiente('revisar');
    return paso();
  })()`;
}

export default { crearPersonajeUI };
