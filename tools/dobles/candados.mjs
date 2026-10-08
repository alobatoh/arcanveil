/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCANVEIL · tools/dobles/candados.mjs
 * ---------------------------------------------------------------------------
 * Doble de Web Locks (`navigator.locks`) para el motor en Node.
 *
 * El juego EXIGE Web Locks para guardar en una ranura (sin exclusión entre
 * pestañas no escribe, y eso es correcto). Node solo los trae en algunas
 * versiones; las pruebas no pueden depender de eso. `motor-sin-ventana.mjs`
 * instala este doble UNA vez, al cargarse, por el gancho de pruebas que ya
 * existe (`EntregaLegado.usarCandados`, que también fija los de `Ranuras`).
 * No toca `navigator` ni el producto: en el navegador mandan los de verdad.
 *
 * Semántica (la que el juego usa de la API real):
 *   · un candado por nombre, exclusivo; nombres distintos, independientes;
 *   · quien espera entra en orden de llegada (el que suelta se lo pasa);
 *   · `ifAvailable`: si está tomado, llama con `null` y NO espera;
 *   · `signal`: abortar mientras espera rechaza con su motivo, sin ejecutar
 *     y sin dejar el candado tomado (también si ya venía abortado);
 *   · se suelta en `finally`, aunque la función lance o rechace.
 *
 * Es un doble de UN proceso: no coordina pestañas ni procesos reales, y una
 * prueba que pase con él no demuestra nada de Web Locks reales (eso lo
 * prueba la regresión en Chrome).
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** @returns {{request: Function, query: Function}} */
export function crearCandados() {
  const estado = new Map();
  const de = (nombre) => {
    if (!estado.has(nombre)) estado.set(nombre, { tomado: false, espera: [] });
    return estado.get(nombre);
  };
  const abortado = (signal) => signal.reason ?? Object.assign(new Error('Abortado'), { name: 'AbortError' });

  async function request(nombre, opciones, fn) {
    if (typeof opciones === 'function') { fn = opciones; opciones = {}; }
    const { ifAvailable = false, signal = null } = opciones ?? {};
    if (typeof fn !== 'function') throw new TypeError('request necesita una función');
    const c = de(nombre);
    if (signal?.aborted) throw abortado(signal);
    if (c.tomado) {
      if (ifAvailable) return fn(null);
      await new Promise((ok, mal) => {
        const turno = { ok };
        c.espera.push(turno);
        signal?.addEventListener('abort', () => {
          const i = c.espera.indexOf(turno);
          if (i >= 0) { c.espera.splice(i, 1); mal(abortado(signal)); }
        }, { once: true });
      });
      // Quien soltó nos lo ha pasado: ya es nuestro (sigue «tomado»).
    } else {
      c.tomado = true;
    }
    try {
      return await fn({ name: nombre, mode: 'exclusive' });
    } finally {
      const siguiente = c.espera.shift();
      if (siguiente) siguiente.ok();
      else c.tomado = false;
    }
  }

  /** Lo que hay tomado y esperando (para pruebas y diagnóstico). */
  async function query() {
    const held = [];
    const pending = [];
    for (const [name, c] of estado) {
      if (c.tomado) held.push({ name, mode: 'exclusive' });
      for (let i = 0; i < c.espera.length; i++) pending.push({ name, mode: 'exclusive' });
    }
    return { held, pending };
  }

  return { request, query, doble: true };
}

export default { crearCandados };
