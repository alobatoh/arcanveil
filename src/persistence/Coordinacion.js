/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCANVEIL · persistence/Coordinacion.js
 * ---------------------------------------------------------------------------
 * Estado compartido ENTRE PESTAÑAS que tiene que ser exacto: en qué punto
 * está cada herencia (pendiente, reservada, aplicada, bloqueada) y qué
 * ranura está apartada u ocupada por una campaña recién creada.
 *
 * Por qué no en `localStorage`: en Chrome cada pestaña lee `localStorage` de
 * su propia caché y los cambios de otra pestaña llegan un poco después. Medido
 * (8-oct-2026): dos pestañas incrementando un contador, cada vez DENTRO de un
 * Web Lock, dejaron 118 de 120 — dos lecturas viejas aun con el candado. Con
 * eso, «reservar si está pendiente» podía cobrar dos veces y «la ranura está
 * libre» podía pisar otra campaña. IndexedDB, en cambio, es transaccional y
 * coherente entre pestañas: una transacción de lectura-escritura ve lo último
 * confirmado y las de un mismo almacén se ejecutan de una en una.
 *
 * Aquí solo hay una operación: comparar y cambiar (`cas`) dentro de UNA
 * transacción, con una función síncrona que decide a partir del valor actual.
 * Los datos grandes (las partidas) siguen en `localStorage`; esto guarda las
 * decisiones.
 *
 * Sin IndexedDB no se puede asegurar: quien lo necesita bloquea con aviso.
 * Las pruebas en Node usan `crearEnMemoria()` (misma semántica, un proceso).
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const BASE = 'arcanveil-coordinacion';
export const ALMACENES = Object.freeze({ LEGADOS: 'legados', RANURAS: 'ranuras' });

/** undefined = automático (IndexedDB si existe); null = ninguno; objeto = el dado. */
let elegido;

/** Para pruebas y para el motor sin ventana. */
export function usarCoordinacion(impl) { elegido = impl; }

export function disponible() { return Boolean(motor()); }

function motor() {
  if (elegido !== undefined) return elegido;
  try { return globalThis.indexedDB ? idb : null; } catch { return null; }
}

/* ── IndexedDB ──────────────────────────────────────────────────────────── */

let abierta = null;
function abrir() {
  abierta ??= new Promise((ok, mal) => {
    const p = globalThis.indexedDB.open(BASE, 1);
    p.onupgradeneeded = () => {
      const db = p.result;
      if (!db.objectStoreNames.contains(ALMACENES.LEGADOS)) db.createObjectStore(ALMACENES.LEGADOS);
      if (!db.objectStoreNames.contains(ALMACENES.RANURAS)) db.createObjectStore(ALMACENES.RANURAS);
    };
    p.onsuccess = () => {
      const db = p.result;
      // Si otra pestaña necesita actualizar la base, se cede.
      db.onversionchange = () => { db.close(); abierta = null; };
      ok(db);
    };
    p.onerror = () => { abierta = null; mal(p.error ?? new Error('no se puede abrir IndexedDB')); };
    p.onblocked = () => { abierta = null; mal(new Error('IndexedDB bloqueada por otra pestaña')); };
  });
  return abierta;
}

const idb = {
  async leer(almacen, clave) {
    const db = await abrir();
    return new Promise((ok, mal) => {
      const t = db.transaction(almacen, 'readonly');
      const q = t.objectStore(almacen).get(clave);
      q.onsuccess = () => ok(q.result);
      t.onerror = () => mal(t.error);
      t.onabort = () => mal(t.error ?? new Error('transacción abortada'));
    });
  },
  async listar(almacen) {
    const db = await abrir();
    return new Promise((ok, mal) => {
      const t = db.transaction(almacen, 'readonly');
      const s = t.objectStore(almacen);
      const ks = s.getAllKeys();
      const vs = s.getAll();
      t.oncomplete = () => ok(ks.result.map((k, i) => [k, vs.result[i]]));
      t.onerror = () => mal(t.error);
      t.onabort = () => mal(t.error ?? new Error('transacción abortada'));
    });
  },
  async cas(almacen, clave, decidir) {
    const db = await abrir();
    return new Promise((ok, mal) => {
      const t = db.transaction(almacen, 'readwrite');
      const s = t.objectStore(almacen);
      let salida = null;
      const q = s.get(clave);
      q.onsuccess = () => {
        const actual = q.result;
        let d;
        try { d = decidir(actual); } catch (e) { t.abort(); mal(e); return; }
        if (d?.borrar) s.delete(clave);
        else if (d && 'nuevo' in d) s.put(d.nuevo, clave);
        salida = { cambiado: Boolean(d), actual, nuevo: d?.borrar ? undefined : d?.nuevo };
      };
      t.oncomplete = () => ok(salida);
      t.onerror = () => mal(t.error);
      t.onabort = () => mal(t.error ?? new Error('transacción abortada'));
    });
  },
  async vaciar() {
    const db = await abrir();
    return new Promise((ok, mal) => {
      const t = db.transaction([ALMACENES.LEGADOS, ALMACENES.RANURAS], 'readwrite');
      t.objectStore(ALMACENES.LEGADOS).clear();
      t.objectStore(ALMACENES.RANURAS).clear();
      t.oncomplete = () => ok(true);
      t.onerror = () => mal(t.error);
    });
  },
};

/** Misma semántica que IndexedDB en un solo proceso (pruebas, motor sin ventana). */
export function crearEnMemoria() {
  const datos = new Map([[ALMACENES.LEGADOS, new Map()], [ALMACENES.RANURAS, new Map()]]);
  const copia = (v) => (v === undefined ? undefined : structuredClone(v));
  return {
    datos,
    async leer(a, k) { return copia(datos.get(a).get(k)); },
    async listar(a) { return [...datos.get(a).entries()].map(([k, v]) => [k, copia(v)]); },
    async cas(a, k, decidir) {
      const actual = copia(datos.get(a).get(k));
      const d = decidir(actual);
      if (d?.borrar) datos.get(a).delete(k);
      else if (d && 'nuevo' in d) datos.get(a).set(k, copia(d.nuevo));
      return { cambiado: Boolean(d), actual, nuevo: d?.borrar ? undefined : copia(d?.nuevo) };
    },
    async vaciar() { for (const m of datos.values()) m.clear(); return true; },
  };
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
/** «Borrar partidas»: también el estado compartido. */
export async function vaciar() { const m = motor(); if (m) await m.vaciar(); }

export default { BASE, ALMACENES, usarCoordinacion, disponible, crearEnMemoria, leer, listar, cas, vaciar };
