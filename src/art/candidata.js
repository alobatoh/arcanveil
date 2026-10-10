/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCANVEIL · art/candidata.js
 * ---------------------------------------------------------------------------
 * Pedir una imagen candidata al generador del propio equipo.
 *
 * Solo cuando el jugador lo pide («Pintar retrato», «Otra versión»): nunca
 * al repintar, al llegar a un sitio, al encontrarse con alguien ni en
 * combate. Lo que vuelve es una CANDIDATA: se enseña en el estudio y solo
 * pasa a la galería si el jugador pulsa «Usar esta versión» (ver
 * `galeria.js`). Mientras tanto el puente la guarda en su caché temporal,
 * en este PC, para no repintar la misma versión; cerrar el estudio la
 * olvida (`olvidarCandidatas`). Con ComfyUI el encargo no sale del PC; con
 * un proveedor en la nube, sí (`estadoGenerador().envia`).
 *
 * Habla únicamente con el puente local (127.0.0.1:11437, ver
 * tools/imagen-local-proxy.mjs), que genera con ComfyUI en esta máquina.
 * El proveedor en la nube (Cloudflare) está preparado en el puente pero no
 * se activa desde aquí. No hay servicio anónimo de respaldo: sin puente, se
 * dice (sin prometer nada) y el jugador tiene el dibujo del juego, que no es
 * IA ni necesita ningún programa (ver `dibujo.js`).
 *
 * Dos peticiones iguales (misma clave y misma variante) comparten viaje; la
 * respuesta de una variante vieja no pisa a la nueva (eso lo decide quien
 * llama, con `variante`).
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const ORIGEN_GENERADOR = 'http://127.0.0.1:11437';
const SERVICIO = /^arcanveil-puente-imagen\/\d+$/;

/**
 * Mensajes por causa, para el jugador: qué pasa y qué puede hacer AHORA.
 * Lo técnico (qué programa instalar o arrancar) va aparte, en `AYUDA`: en
 * una primera partida un comando de consola no es una solución.
 */
export const MOTIVOS = Object.freeze({
  sin_generador: 'En este equipo no hay ningún generador de imágenes en marcha, así que aquí no se puede pintar un retrato con IA.',
  no_deja_leer: 'Algo contesta donde debería estar el generador de imágenes de este equipo, pero no deja leer desde esta página: así no se puede pintar con IA. No se le pide nada.',
  otro_servicio: 'Donde debería estar el generador de imágenes de este equipo contesta otro programa. No se le pide nada.',
  proveedor: 'El puente de imágenes está en marcha, pero su generador no responde.',
  sin_clave: 'El puente de imágenes está configurado para un servicio en la nube sin credenciales: no puede pintar.',
  tiempo_estado: 'Nada ha contestado a tiempo donde debería estar el generador de imágenes de este equipo. No se le ha pedido nada.',
  limite: 'Has llegado al tope de imágenes del puente por ahora. Prueba dentro de un rato.',
  ocupado: 'Ya se está pintando otra imagen. Espera a que termine.',
  tiempo: 'La imagen tardó demasiado. Prueba otra vez.',
  datos: 'Hace falta una descripción de al menos 8 letras para pintar.',
  cancelada: 'Cancelada.',
});

/**
 * Ayuda avanzada, con los requisitos reales: se enseña solo si el jugador la
 * pide. No es una instalación instantánea ni hardware gratis.
 */
export const AYUDA = Object.freeze({
  sin_generador: 'Pintar con IA necesita dos programas en marcha en ESTE equipo: ComfyUI con un modelo de imagen (varios GB de descarga y una tarjeta gráfica capaz) y el puente de imágenes del juego. Es para quien ya usa esas herramientas: el juego no instala nada de eso. Los pasos están en el documento IMAGEN_LOCAL del juego.',
  no_deja_leer: 'Donde el juego busca su puente de imágenes hay otro programa, o el puente se arrancó para otra dirección de la página. Hay que arrancarlo desde la misma dirección en la que juegas (documento IMAGEN_LOCAL).',
  otro_servicio: 'Donde el juego busca su puente de imágenes hay otro programa. Habría que cerrarlo y arrancar el puente del juego (documento IMAGEN_LOCAL).',
  proveedor: '¿Está ComfyUI abierto y con el modelo cargado? El puente lo necesita (documento IMAGEN_LOCAL).',
  sin_clave: 'El puente funciona sin credenciales con ComfyUI, que es su generador por defecto (documento IMAGEN_LOCAL).',
  tiempo_estado: 'Si tienes el puente y ComfyUI abiertos, puede que el equipo esté ocupado: vuelve a comprobar en un momento.',
});

/** Cuánto se espera a que el puente diga su estado antes de cancelar la consulta. */
export const PLAZO_ESTADO_MS = 4000;

const enCurso = new Map();

function error(causa, detalle = null) {
  return Object.assign(new Error(MOTIVOS[causa] ?? detalle ?? 'No se pudo pintar.'), { causa, detalle });
}

/**
 * ¿Hay alguien escuchando aunque no se le pueda leer? `fetch` falla igual
 * en los dos casos; una petición opaca sale si algo contesta.
 */
async function sinLectura(pedir, signal) {
  try {
    await pedir(`${ORIGEN_GENERADOR}/estado`, { mode: 'no-cors', cache: 'no-store', ...(signal ? { signal } : {}) });
    return error('no_deja_leer');
  } catch {
    return error('sin_generador');
  }
}

/** El estado de un sondeo que no encontró generador utilizable. */
function sinGenerador(causa, extra = {}) {
  const estado = ({ tiempo_estado: 'timeout', cancelada: 'cancelada', proveedor: 'proveedor-fallo', sin_clave: 'proveedor-fallo' })[causa] ?? 'no-disponible';
  return { ok: false, estado, causa, motivo: MOTIVOS[causa] ?? 'No se puede pintar ahora.', ayuda: AYUDA[causa] ?? null, ...extra };
}

/**
 * Estado del generador, sin generar nada.
 *
 * La consulta tiene PLAZO y se cancela de verdad: al vencer (o si quien
 * llama aborta `signal`) se aborta la petición en curso, no solo se deja de
 * escuchar. Antes, un `fetch` colgado dejaba la interfaz en «Buscando…»
 * para siempre.
 *
 * `envia` y `proveedor` solo vienen cuando el puente del juego ha contestado
 * (`servicio` comprobado): sin eso no se sabe NADA de a dónde iría un
 * encargo, y no se dice.
 *
 * @param {{fetch?: Function, signal?: AbortSignal, plazo?: number}} [op]
 * @returns {Promise<{ok: boolean, estado: 'disponible-local'|'disponible-nube'|'no-disponible'|'proveedor-fallo'|'timeout'|'cancelada', causa: string|null, motivo: string|null, ayuda?: string|null, proveedor?: string, estilo?: string, envia?: 'local'|'nube', disponible?: boolean}>}
 */
export async function estadoGenerador({ fetch: pedir = globalThis.fetch, signal = null, plazo = PLAZO_ESTADO_MS } = {}) {
  const control = new AbortController();
  let vencido = false;
  const reloj = setTimeout(() => { vencido = true; control.abort(); }, plazo);
  const cancelar = () => control.abort();
  if (signal?.aborted) control.abort(); else signal?.addEventListener?.('abort', cancelar, { once: true });
  // Aunque el `fetch` de turno no atienda a la señal, la espera termina con ella.
  const corte = new Promise((_, mal) => {
    const salir = () => mal(Object.assign(new Error('abortada'), { name: 'AbortError' }));
    if (control.signal.aborted) salir(); else control.signal.addEventListener('abort', salir, { once: true });
  });
  corte.catch(() => {});
  const conCorte = (p) => Promise.race([Promise.resolve(p), corte]);
  const cortada = () => (vencido ? sinGenerador('tiempo_estado') : sinGenerador('cancelada'));

  try {
    let r;
    try { r = await conCorte(pedir(`${ORIGEN_GENERADOR}/estado`, { cache: 'no-store', signal: control.signal })); } catch {
      if (control.signal.aborted) return cortada();
      let e;
      try { e = await conCorte(sinLectura(pedir, control.signal)); } catch { return cortada(); }
      if (control.signal.aborted) return cortada();
      return sinGenerador(e.causa);
    }
    let datos;
    try { datos = await conCorte(r.json()); } catch {
      if (control.signal.aborted) return cortada();
      datos = {};
    }
    if (!SERVICIO.test(String(datos?.servicio ?? ''))) return sinGenerador('otro_servicio');
    // Qué pasa con lo pedido: con ComfyUI no sale del PC; con un proveedor en
    // la nube, el encargo viaja. Un puente viejo que no lo dice cuenta como nube.
    const envia = datos.envia === 'local' ? 'local' : 'nube';
    const comun = { proveedor: datos.proveedor, estilo: datos.estilo, envia, cache: datos.cache ?? null };
    if (datos.disponible === false) {
      const causa = /credencial|clave|token/i.test(String(datos.motivo ?? '')) ? 'sin_clave' : 'proveedor';
      return sinGenerador(causa, { motivo: `${MOTIVOS[causa]}${datos.motivo ? ` (${datos.motivo})` : ''}`, ...comun });
    }
    return { ok: true, estado: envia === 'local' ? 'disponible-local' : 'disponible-nube', causa: null, motivo: null, disponible: true, ...comun };
  } finally {
    clearTimeout(reloj);
    signal?.removeEventListener?.('abort', cancelar);
  }
}

/**
 * Olvida las candidatas de un dueño (al cerrar el estudio) o todas (al
 * borrar partidas). Las que el jugador ya eligió viven en la galería y no se
 * tocan. Sin puente, no hay nada que hacer aquí: caducan solas.
 *
 * @param {{clave?: string, todas?: boolean}} que
 * @param {{fetch?: Function}} [op]
 * @returns {Promise<{ok: boolean, borradas: number}>}
 */
export async function olvidarCandidatas(que, { fetch: pedir = globalThis.fetch } = {}) {
  try {
    const r = await pedir(`${ORIGEN_GENERADOR}/v1/olvidar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify(que?.todas ? { todas: true } : { clave: String(que?.clave ?? '') }),
    });
    const datos = await r.json().catch(() => ({}));
    return { ok: r.ok && SERVICIO.test(String(datos?.servicio ?? '')), borradas: Number(datos?.borradas) || 0 };
  } catch {
    return { ok: false, borradas: 0 };
  }
}

/**
 * Pide una candidata.
 *
 * @param {Object} encargo
 * @param {'personaje'|'pnj'|'enemigo'} encargo.tipo
 * @param {string} encargo.clave Clave estable (ver `galeria.claveDe`).
 * @param {string} encargo.descripcion Apariencia, 8 a 300 caracteres.
 * @param {string} [encargo.linaje]
 * @param {string} [encargo.rol]
 * @param {Object} [op]
 * @param {number} [op.variante=0] «Otra versión» sube este número: otra semilla.
 * @param {AbortSignal} [op.signal]
 * @param {Function} [op.fetch]
 * @returns {Promise<{blob: Blob, proveedor: string|null, variante: number}>}
 */
export function pedirCandidata(encargo, { variante = 0, signal, fetch: pedir = globalThis.fetch } = {}) {
  const descripcion = String(encargo?.descripcion ?? '').trim().slice(0, 300);
  if (descripcion.length < 8) return Promise.reject(error('datos'));
  const clave = String(encargo?.clave ?? '');
  if (!/^[\w:.-]{1,80}$/.test(clave)) return Promise.reject(error('datos'));

  const id = `${clave}#${variante}`;
  const previa = enCurso.get(id);
  if (previa) return previa;

  const promesa = (async () => {
    let r;
    try {
      r = await pedir(`${ORIGEN_GENERADOR}/v1/candidata`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        signal,
        body: JSON.stringify({
          tipo: encargo.tipo,
          clave,
          descripcion,
          ...(encargo.linaje ? { linaje: encargo.linaje } : {}),
          ...(encargo.rol ? { rol: String(encargo.rol).slice(0, 40) } : {}),
          variante,
        }),
      });
    } catch (e) {
      if (e?.name === 'AbortError') throw error('cancelada');
      // La comprobación de «¿hay alguien?» tampoco espera sin fin.
      const corte = new AbortController();
      const reloj = setTimeout(() => corte.abort(), PLAZO_ESTADO_MS);
      try { throw await sinLectura(pedir, corte.signal); } finally { clearTimeout(reloj); }
    }
    if (!SERVICIO.test(String(r.headers?.get?.('X-Arcanveil-Servicio') ?? ''))) throw error('otro_servicio');
    if (!r.ok) {
      const datos = await r.json().catch(() => ({}));
      const causa = datos?.error?.codigo ?? datos?.error?.code ?? null;
      throw error(MOTIVOS[causa] ? causa : 'proveedor', datos?.error?.message);
    }
    const blob = await r.blob();
    if (!/^image\/(?:png|jpeg|webp)$/.test(blob.type)) throw error('otro_servicio');
    return { blob, proveedor: r.headers.get('X-Arcanveil-Proveedor'), variante };
  })();

  enCurso.set(id, promesa);
  promesa.then(() => enCurso.delete(id), () => enCurso.delete(id));
  return promesa;
}

export default { pedirCandidata, estadoGenerador, olvidarCandidatas, MOTIVOS, AYUDA, PLAZO_ESTADO_MS, ORIGEN_GENERADOR };
