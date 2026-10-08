/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCANVEIL · persistence/Coordinacion.js
 * ---------------------------------------------------------------------------
 * La AUTORIDAD compartida entre pestañas: lo que tiene que ser exacto aunque
 * dos pestañas escriban a la vez.
 *
 *   · `legados`  → estado de cada herencia (pendiente, reservado, aplicado,
 *                  bloqueos) y su foto, por run de origen.
 *   · `muertos`  → la marca de muerte de cada run (con su causa y momento).
 *   · `ranuras`  → dueño y REVISIÓN de cada ranura de partida: qué run la
 *                  ocupa (o qué operación la tiene reservada) y cuántas veces
 *                  se ha escrito. Durable: no caduca con el tiempo.
 *   · `partidas` → la copia AUTORITATIVA de los bytes de cada ranura, con su
 *                  revisión. `localStorage` guarda un espejo (para listar sin
 *                  esperar y por compatibilidad); si el espejo va atrasado,
 *                  manda esta.
 *
 * Por qué no en `localStorage`: en Chrome cada pestaña lee `localStorage` de
 * su propia caché y los cambios de otra llegan un poco después (medido, #7:
 * 118 de 120 con Web Locks). IndexedDB es transaccional y coherente entre
 * pestañas: una transacción de lectura-escritura ve lo último confirmado y
 * las que tocan los mismos almacenes van de una en una.
 *
 * Operaciones: comparar y cambiar en UNA transacción (`cas`), también sobre
 * varias claves de varios almacenes a la vez (`casVarios`), con una función
 * síncrona que decide a partir de los valores actuales. O se escriben todos
 * los cambios, o ninguno.
 *
 * Sin IndexedDB no se puede asegurar: quien lo necesita falla con aviso.
 * Las pruebas en Node usan `crearEnMemoria()` (misma semántica, un proceso).
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const BASE = 'arcanveil-coordinacion';
export const VERSION_BASE = 2;
export const ALMACENES = Object.freeze({ LEGADOS: 'legados', RANURAS: 'ranuras', PARTIDAS: 'partidas', MUERTOS: 'muertos' });

/** undefined = automático (IndexedDB si existe); null = ninguno; objeto = el dado. */
let elegido;

/** Para pruebas y para el motor sin ventana. */
export function usarCoordinacion(impl) { elegido = impl; }

export function disponible() { return Boolean(motor()); }

/** Para pruebas: el estado coordinado en uso (para envolverlo con un fallo). */
export function motorActual() { return motor(); }

function motor() {
  if (elegido !== undefined) return elegido;
  try { return globalThis.indexedDB ? idb : null; } catch { return null; }
}

/* ── IndexedDB ──────────────────────────────────────────────────────────── */

let abierta = null;
function abrir() {
  abierta ??= new Promise((ok, mal) => {
    // v1 (#7): legados y ranuras. v2 (#8): + partidas y muertos. Subir de
    // versión solo AÑADE almacenes: lo que ya había se conserva.
    const p = globalThis.indexedDB.open(BASE, VERSION_BASE);
    p.onupgradeneeded = () => {
      const db = p.result;
      for (const a of Object.values(ALMACENES)) if (!db.objectStoreNames.contains(a)) db.createObjectStore(a);
    };
    p.onsuccess = () => {
      const db = p.result;
      // Si otra pestaña necesita actualizar la base, se cede.
      db.onversionchange = () => { db.close(); abierta = null; };
      ok(db);
    };
    p.onerror = () => { abierta = null; mal(p.error ?? new Error('no se puede abrir IndexedDB')); };
    p.onblocked = () => { abierta = null; mal(new Error('IndexedDB bloqueada por otra pestaña (cierra las pestañas antiguas del juego)')); };
  });
  return abierta;
}

function terminar(t, ok, mal, valor) {
  t.oncomplete = () => ok(valor());
  t.onerror = () => mal(t.error ?? new Error('transacción fallida'));
  t.onabort = () => mal(t.error ?? new Error('transacción abortada'));
}

const idb = {
  async leer(almacen, clave) {
    const db = await abrir();
    return new Promise((ok, mal) => {
      const t = db.transaction(almacen, 'readonly');
      const q = t.objectStore(almacen).get(clave);
      terminar(t, ok, mal, () => q.result);
    });
  },
  async listar(almacen) {
    const db = await abrir();
    return new Promise((ok, mal) => {
      const t = db.transaction(almacen, 'readonly');
      const s = t.objectStore(almacen);
      const ks = s.getAllKeys();
      const vs = s.getAll();
      terminar(t, ok, mal, () => ks.result.map((k, i) => [k, vs.result[i]]));
    });
  },
  async cas(almacen, clave, decidir) {
    const r = await idb.casVarios([[almacen, clave]], (actuales) => [decidir(actuales[0])]);
    return { cambiado: r.cambiado, actual: r.actuales[0], nuevo: r.nuevos[0] };
  },
  /**
   * @param {Array<[string, string]>} claves Pares [almacén, clave].
   * @param {(actuales: any[]) => Array<{nuevo: any}|{borrar: true}|null>|null} decidir
   */
  async casVarios(claves, decidir) {
    const db = await abrir();
    const almacenes = [...new Set(claves.map(([a]) => a))];
    return new Promise((ok, mal) => {
      const t = db.transaction(almacenes, 'readwrite');
      const actuales = new Array(claves.length);
      let pendientes = claves.length;
      let salida = { cambiado: false, actuales, nuevos: [] };
      claves.forEach(([a, k], i) => {
        const q = t.objectStore(a).get(k);
        q.onsuccess = () => {
          actuales[i] = q.result;
          pendientes -= 1;
          if (pendientes) return;
          let d;
          try { d = decidir(actuales.slice()); } catch (e) { try { t.abort(); } catch { /* ya */ } mal(e); return; }
          const cambios = Array.isArray(d) ? d : [];
          cambios.forEach((c, j) => {
            if (!c) return;
            const [aa, kk] = claves[j];
            if (c.borrar) t.objectStore(aa).delete(kk);
            else if ('nuevo' in c) t.objectStore(aa).put(c.nuevo, kk);
          });
          salida = { cambiado: cambios.some(Boolean), actuales: actuales.slice(), nuevos: claves.map((_, j) => (cambios[j]?.borrar ? undefined : cambios[j]?.nuevo)) };
        };
      });
      terminar(t, ok, mal, () => salida);
    });
  },
  async vaciar() {
    const db = await abrir();
    return new Promise((ok, mal) => {
      const t = db.transaction(Object.values(ALMACENES), 'readwrite');
      for (const a of Object.values(ALMACENES)) t.objectStore(a).clear();
      terminar(t, ok, mal, () => true);
    });
  },
};

/** Misma semántica que IndexedDB en un solo proceso (pruebas, motor sin ventana). */
export function crearEnMemoria() {
  const datos = new Map(Object.values(ALMACENES).map((a) => [a, new Map()]));
  const copia = (v) => (v === undefined ? undefined : structuredClone(v));
  const impl = {
    datos,
    async leer(a, k) { return copia(datos.get(a).get(k)); },
    async listar(a) { return [...datos.get(a).entries()].map(([k, v]) => [k, copia(v)]); },
    async casVarios(claves, decidir) {
      const actuales = claves.map(([a, k]) => copia(datos.get(a).get(k)));
      const d = decidir(actuales.slice());
      const cambios = Array.isArray(d) ? d : [];
      // Todo o nada: se valida antes de aplicar.
      cambios.forEach((c, j) => {
        if (!c) return;
        const [a, k] = claves[j];
        if (c.borrar) datos.get(a).delete(k);
        else if ('nuevo' in c) datos.get(a).set(k, copia(c.nuevo));
      });
      return { cambiado: cambios.some(Boolean), actuales, nuevos: claves.map((_, j) => (cambios[j]?.borrar ? undefined : copia(cambios[j]?.nuevo))) };
    },
    async cas(a, k, decidir) {
      const r = await impl.casVarios([[a, k]], (actuales) => [decidir(actuales[0])]);
      return { cambiado: r.cambiado, actual: r.actuales[0], nuevo: r.nuevos[0] };
    },
    async vaciar() { for (const m of datos.values()) m.clear(); return true; },
  };
  return impl;
}

/* ── API ────────────────────────────────────────────────────────────────── */

function exigir() {
  const m = motor();
  if (!m) throw Object.assign(new Error('Este navegador no tiene IndexedDB: no se puede asegurar el estado compartido entre pestañas.'), { codigo: 'sin-coordinacion' });
  return m;
}

export const leer = (almacen, clave) => exigir().leer(almacen, clave);
export const listar = (almacen) => exigir().listar(almacen);
/** Compara y cambia en UNA transacción. `decidir(actual)` → `{nuevo}`, `{borrar: true}` o null. */
export const cas = (almacen, clave, decidir) => exigir().cas(almacen, clave, decidir);
/** Lo mismo sobre varias claves (de varios almacenes): todo o nada. */
export const casVarios = (claves, decidir) => {
  const m = exigir();
  if (m.casVarios) return m.casVarios(claves, decidir);
  // Un doble antiguo sin `casVarios`: no se puede asegurar a la vez.
  throw Object.assign(new Error('el estado compartido no admite transacciones de varias claves'), { codigo: 'sin-coordinacion' });
};
/** «Borrar partidas»: también el estado compartido. */
export async function vaciar() { const m = motor(); if (m) await m.vaciar(); }

export default { BASE, VERSION_BASE, ALMACENES, usarCoordinacion, disponible, motorActual, crearEnMemoria, leer, listar, cas, casVarios, vaciar };
