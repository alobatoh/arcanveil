/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCANVEIL · tools/dobles/sin-web-locks.mjs
 * ---------------------------------------------------------------------------
 * SOLO PARA PROBAR LA FIXTURE: hace que este proceso de Node se comporte como
 * uno que NO trae Web Locks (Node anterior a `navigator.locks`), quitando
 * `navigator.locks`. Lo usa `auditar-doble-candados.mjs` con `--import`
 * para comprobar que las auditorías oficiales no dependen de la versión de
 * Node. No es parte del producto ni de ningún comando oficial.
 *
 *   node --import ./tools/dobles/sin-web-locks.mjs tools/auditar-identidad.mjs
 * ═══════════════════════════════════════════════════════════════════════════
 */
const anterior = globalThis.navigator;
Object.defineProperty(globalThis, 'navigator', {
  value: { userAgent: anterior?.userAgent ?? 'node', language: anterior?.language ?? 'es' },
  configurable: true, writable: true,
});
