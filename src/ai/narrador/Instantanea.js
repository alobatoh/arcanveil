/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCANVEIL · ai/narrador/Instantanea.js
 * ---------------------------------------------------------------------------
 * Lo que un modelo de lenguaje recibe cada turno: una instantánea del mundo
 * de solo lectura, ya resuelta por el motor.
 *
 * El modelo no guarda la conversación entre turnos (la API no recuerda nada
 * por su cuenta), así que todo lo que necesita para no contradecirse viaja
 * aquí, compacto y con PROCEDENCIA:
 *
 *   · motor      — lo que ha resuelto el juego: tiradas, desenlaces, estado.
 *   · jugador    — lo que el jugador ha escrito o establecido (su canon).
 *   · testimonio — lo que ha dicho un PNJ. Puede ser mentira o error.
 *   · narrador   — lo que un narrador describió y el motor aceptó.
 *
 * Lo que NO viaja: los secretos de los PNJ (solo la marca de que guardan
 * algo), la clave de nada, datos del equipo, la partida guardada entera.
 *
 * Cuatro escalas de memoria, como pide el diseño del narrador:
 * inmediata (los últimos turnos), capítulo (resúmenes), saga (hechos de peso)
 * y canon (lo que el jugador trajo o estableció). Nada de canon se poda por
 * presupuesto: se recorta antes lo inmediato y el ambiente.
 *
 * Funciones puras.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { proyectar } from './Canon.js';

/** Versión del formato. Sube si cambia la forma. */
export const VERSION_INSTANTANEA = 2;

/** Presupuesto de la instantánea, en caracteres (≈ 3,5 por token). */
export const PRESUPUESTO = Object.freeze({ total: 6000, canon: 2400, canonOmitido: 12, inmediata: 5, yaContado: 14, hechos: 12, conocidos: 8 });

const recortar = (t, n) => {
  const s = String(t ?? '').replace(/\s+/g, ' ').trim();
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
};

/** Procedencia de un hecho recordado, por su forma. @private */
function procedencia(h) {
  const t = String(h?.texto ?? '');
  if (/^Según /.test(t)) return 'testimonio';
  if (h?.categoria === 'canon' || /^Dejó dicho|^Dio su palabra|^El personaje ha nombrado/.test(t)) return 'jugador';
  if (h?.categoria === 'narrador') return 'narrador';
  return 'motor';
}

/**
 * Frases ya narradas, para no repetirlas. Salen de la bitácora guardada, así
 * que sobreviven a guardar y cargar.
 *
 * @param {Array<{voz: string, texto: string}>} entradas
 * @param {number} n
 * @returns {string[]}
 */
export function frasesContadas(entradas, n = PRESUPUESTO.yaContado) {
  const frases = [];
  for (const e of [...(entradas ?? [])].reverse()) {
    if (e?.voz !== 'dm') continue;
    for (const f of String(e.texto ?? '').split(/(?<=[.!?…»])\s+|\n+/u).reverse()) {
      const limpia = f.trim();
      if (limpia.length < 18 || /\?$/.test(limpia) || frases.includes(limpia)) continue;
      frases.push(recortar(limpia, 140));
      if (frases.length >= n) return frases.reverse();
    }
  }
  return frases.reverse();
}

/**
 * Construye la instantánea de un turno.
 *
 * @param {Object} e Lo de `ContextComposer.componerEstructurado`, con lo que
 *   el motor añade en el turno (interpretación, resultados, pendientes…).
 * @param {Object} extra
 * @param {Object} [extra.memoria] El MemoryStore.
 * @param {Array<Object>} [extra.entradas] La bitácora.
 * @param {Object} [extra.lugar] {nombre, descripcion}
 * @param {Array<string>} [extra.elementos] Elementos de escena registrados aquí.
 * @param {Array<Object>} [extra.inventario] {nombre, cantidad}
 * @param {number} [extra.oro]
 * @param {string} [extra.texto] Lo que escribió el jugador, literal.
 * @returns {Object}
 */
export function construirInstantanea(e, extra = {}) {
  const j = e.jugador ?? {};
  const m = e.mundo ?? {};
  const memoria = extra.memoria;
  const turno = e.turno ?? 0;

  const presentes = (e.npcsPresentes ?? []).map((n) => ({
    refId: n.refId ?? n.id,
    nombre: n.nombre,
    rol: n.rol,
    genero: n.genero,
    actitud: n.actitud ?? 0,
    vivo: n.situacion !== 'muerto',
    rasgo: n.rasgo ?? null,
    caracter: n.rasgos ? {
      habla: n.rasgos.apertura > 0.6 ? 'suelta' : n.rasgos.apertura < 0.4 ? 'poco' : 'lo justo',
      honesto: n.rasgos.honestidad >= 0.5,
      valiente: n.rasgos.valentia >= 0.5,
    } : null,
    // Lo que sabe y puede contar; lo que guarda solo se marca.
    sabe: (n.conocimiento?.rumores ?? []).slice(0, 3).map((r) => recortar(r, 120)),
    yaTeConto: (n.conocimiento?.compartidos ?? []).slice(-3).map((r) => recortar(r, 100)),
    guardaAlgo: (n.conocimiento?.secretos ?? []).length > 0,
    recuerdaDeTi: (n.memoria ?? []).filter((r) => !['encuentro', 'actitud'].includes(r.tipo)).slice(-3).map((r) => ({ tipo: r.tipo, texto: recortar(r.texto, 110) })),
    trato: n.ultimoEncuentro == null ? 'no os conocéis' : `última vez en el turno ${n.ultimoEncuentro}`,
  }));

  const presentesIds = new Set(presentes.map((p) => p.refId));
  const ausentes = (e.conocidos ?? []).filter((c) => !presentesIds.has(c.refId)).slice(-PRESUPUESTO.conocidos)
    .map((c) => ({ nombre: c.nombre, rol: c.rol, donde: c.lugar ?? 'desconocido' }));

  const hechos = (memoria?.hechosRelevantes?.(40) ?? [])
    .filter((h) => h.categoria !== 'canon_jugador')
    .filter((h) => (h.peso ?? 1) >= 2 || h.categoria === 'suceso' || /^Según /.test(h.texto))
    .slice(-PRESUPUESTO.hechos)
    .map((h) => ({ texto: recortar(h.texto, 160), fuente: procedencia(h), turno: h.turno ?? null }));

  // El canon no se recorta: se PROYECTA. Lo pertinente para este turno va
  // entero; lo que no cabe se nombra como omitido (ver `Canon.js`).
  const proyeccion = proyectar(
    { registro: memoria?.registroCanon, lore: j.lore, entidades: memoria?.canon ?? e.canon ?? [] },
    { texto: extra.texto ?? e.accion ?? '', nombres: [...(e.npcsPresentes ?? []).map((n) => n.nombre), extra.lugar?.nombre ?? ''], presupuesto: PRESUPUESTO.canon },
  );
  const canon = proyeccion.entradas;

  const resultado = {
    tirada: e.tirada ? {
      prueba: e.tirada.nombreHabilidad ?? e.tirada.habilidad ?? 'prueba',
      resultado: e.tirada.pifia ? 'fracaso grave' : e.tirada.critico ? 'éxito rotundo' : e.tirada.exito ? ((e.tirada.margen ?? 0) >= 5 ? 'éxito claro' : 'éxito justo') : ((Math.abs(e.tirada.margen ?? 0) <= 2) ? 'fracaso por poco' : 'fracaso'),
      desmedida: Boolean(e.tirada.desmedida),
    } : null,
    situacion: e.situacionResultado ? recortar(e.situacionResultado, 400) : null,
    detalleVisto: e.detalleEscena ? recortar(e.detalleEscena, 300) : null,
    aclaraciones: e.aclaraciones ?? [],
  };

  const combate = e.combate?.activo ? {
    ronda: e.combate.ronda ?? null,
    combatientes: Object.values(e.combate.combatientes ?? {}).map((c) => ({
      nombre: c.nombre,
      bando: c.bando,
      vida: c.vida ? `${c.vida.actual}/${c.vida.max}` : null,
      caido: (c.vida?.actual ?? 1) <= 0,
      estados: (c.estados ?? []).map((s) => s.id ?? s).slice(0, 4),
    })),
    // No hay un modelo de posiciones en el motor: no se inventan columnas
    // ni flancos. Lo que no esté aquí no existe en la pelea.
    geometria: 'sin posiciones en el motor: solo cerca o lejos si el motor lo dice',
  } : null;

  const instantanea = {
    version: VERSION_INSTANTANEA,
    turno,
    lugar: {
      nombre: extra.lugar?.nombre ?? m.ubicacion,
      sublugar: m.sublugar ?? null,
      descripcion: recortar(extra.lugar?.descripcion ?? '', 240),
      franja: m.franja,
      hora: m.hora,
      estacion: m.estacion,
      clima: m.clima,
      elementos: (extra.elementos ?? []).slice(-8).map((x) => recortar(x, 120)),
    },
    personaje: {
      nombre: j.nombre,
      linaje: j.raza,
      clase: j.clase,
      nivel: j.nivel,
      vida: j.vida ? `${j.vida.actual}/${j.vida.max}` : null,
      oro: extra.oro ?? null,
      lleva: (extra.inventario ?? []).slice(0, 10).map((o) => (o.cantidad > 1 ? `${o.nombre} ×${o.cantidad}` : o.nombre)),
      estados: { fatiga: j.fatiga, moral: j.moral },
    },
    presentes,
    ausentesConocidos: ausentes,
    situacion: e.situacion ? {
      texto: recortar(e.situacion.texto, 360),
      quiereCadaUno: recortar(e.situacion.agenda, 280),
      tension: e.situacion.tension ?? 0,
      sinAtender: e.situacion.sinAtender ?? 0,
      ignoradaAProposito: Boolean(e.situacion.ignoradaAProposito),
    } : null,
    enEscenaAhora: (e.contextoEscena ?? []).map((t) => recortar(t, 220)),
    combate,
    jugador: {
      escribe: extra.texto ?? e.accion,
      interpretacion: e.interpretacion ?? null,
      pendientes: (e.pendientes ?? []).map((p) => ({ si: p.condicion, entonces: p.consecuencia })),
      negativa: e.negativa ? { ante: e.negativa.nombre, cita: e.negativa.cita } : null,
      notaDelMotor: e.pistaRuta ?? null,
    },
    resuelto: resultado,
    memoria: {
      inmediata: (memoria?.historial ?? []).slice(-PRESUPUESTO.inmediata).map((h) => ({ turno: h.turno, hizo: recortar(h.accion, 90), paso: recortar(h.resumen, 140) })),
      capitulo: (memoria?.resumenes ?? []).slice(-2).map((r) => recortar(r.texto, 360)),
      saga: hechos,
      canon,
      hilos: (memoria?.hilosUrgentes?.(turno, 3) ?? []).map((h) => recortar(h.texto, 140)),
      // Lo que el narrador quiso recordar: para su continuidad, no es un
      // hecho del mundo y así se marca.
      notasDelNarrador: (memoria?.notasNarrador ?? []).slice(-6).map((n) => ({ texto: recortar(n.texto, 160), fuente: 'narrador (no es un hecho del motor)', turno: n.turno })),
    },
    yaContado: frasesContadas(extra.entradas),
    // La lista de lo omitido también cuesta: con un canon grande, sus
    // resúmenes solos se comían la cuota del minuto. Van los primeros y la
    // cuenta; el registro entero sigue guardado y verificado en local.
    canonOmitido: proyeccion.completa ? null : {
      n: proyeccion.omitidas.length,
      total: proyeccion.total,
      cuales: proyeccion.omitidas.slice(0, PRESUPUESTO.canonOmitido).map((o) => recortar(o.resumen, 48)),
      ...(proyeccion.omitidas.length > PRESUPUESTO.canonOmitido ? { yMas: proyeccion.omitidas.length - PRESUPUESTO.canonOmitido } : {}),
    },
    canonConflictos: proyeccion.conflictos,
  };

  return ajustarPresupuesto(instantanea);
}

/**
 * Recorta hasta que quepa. Primero lo inmediato y lo ya contado, luego el
 * ambiente; el canon, los hechos de peso y lo resuelto nunca.
 *
 * @param {Object} inst
 * @returns {Object}
 */
export function ajustarPresupuesto(inst) {
  const medir = () => JSON.stringify(inst).length;
  const recortes = [
    () => inst.yaContado.length > 6 && inst.yaContado.shift(),
    () => inst.memoria.inmediata.length > 2 && inst.memoria.inmediata.shift(),
    () => inst.ausentesConocidos.length > 3 && inst.ausentesConocidos.shift(),
    () => inst.lugar.elementos.length > 3 && inst.lugar.elementos.shift(),
    () => inst.presentes.some((p) => p.sabe.length > 1) && inst.presentes.forEach((p) => p.sabe.splice(1)),
    () => inst.memoria.capitulo.length > 1 && inst.memoria.capitulo.shift(),
    // La lista de lo omitido es un índice, no canon: se acorta (la cuenta queda).
    () => (inst.canonOmitido?.cuales?.length ?? 0) > 3 && inst.canonOmitido.cuales.pop()
      && (inst.canonOmitido.yMas = (inst.canonOmitido.yMas ?? 0) + 1),
  ];
  let i = 0;
  while (medir() > PRESUPUESTO.total && i < 60) {
    const hecho = recortes.some((r) => r());
    if (!hecho) break;
    i += 1;
  }
  inst.medida = { caracteres: medir(), tokensAprox: Math.ceil(medir() / 3.5) };
  return inst;
}

export default { construirInstantanea, ajustarPresupuesto, frasesContadas, VERSION_INSTANTANEA, PRESUPUESTO };
