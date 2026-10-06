/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCANVEIL · tools/narrador-simulado.mjs
 * ---------------------------------------------------------------------------
 * Un «Groq» de mentira y malintencionado, para probar el camino de la IA sin
 * gastar nada.
 *
 * Contesta a cada turno con prosa armada desde la instantánea que recibe
 * (así se ve qué le llega) y, a propósito, mete en cinco de cada seis turnos
 * algo que no debe entrar en la partida:
 *
 *   · un PNJ ausente que habla,
 *   · oro que regala el narrador (en la prosa y como efecto propuesto),
 *   · una frase ya contada,
 *   · una decisión que el jugador no ha tomado,
 *   · objetos y actitudes propuestos como efectos,
 *   · o JSON roto.
 *
 * No mide la calidad de un modelo de verdad: mide que el motor no deja pasar
 * lo que no debe, que el turno se cuenta una vez y cuánto pesa lo que se
 * envía. Lo usa `medir-narrador.mjs --ia-simulada`.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Marcas que no deben aparecer nunca en la bitácora. */
export const MARCAS = Object.freeze({
  ausente: '«Te estaba esperando desde el alba.»',
  oro: 'Recibes veinte monedas de plata por las molestias.',
  decide: 'Aceptas el trato sin pensarlo dos veces.',
});

const GESTOS = [
  'deja lo que tiene entre manos y te mira un momento',
  'se rasca la nuca antes de contestar',
  'baja la voz, aunque no hay nadie cerca',
  'tuerce el gesto, como quien ha oído la pregunta demasiadas veces',
  'sigue con lo suyo mientras habla',
];

export function modeloAdversario() {
  const stats = { peticiones: 0, reparaciones: 0, inyectadas: {}, tokens: [], caracteres: [] };
  let n = 0;
  const inyectar = (tipo) => { stats.inyectadas[tipo] = (stats.inyectadas[tipo] ?? 0) + 1; };

  function responder(cuerpo) {
    const turno = cuerpo.messages[1].content;
    const inst = JSON.parse(turno.slice(turno.indexOf('{'), turno.lastIndexOf('}') + 1));
    stats.tokens.push(inst.medida?.tokensAprox ?? 0);
    stats.caracteres.push(cuerpo.messages.reduce((a, m) => a + m.content.length, 0));
    const reparacion = cuerpo.messages.length === 4;
    if (reparacion) stats.reparaciones += 1;

    const segs = inst.jugador?.interpretacion?.segmentos ?? [];
    const destino = segs.find((s) => s.destinatario?.estado === 'presente')?.destinatario?.nombre;
    const vivos = (inst.presentes ?? []).filter((p) => p.vivo);
    const quien = destino ?? vivos[0]?.nombre ?? null;
    const lugar = inst.lugar?.nombre ?? 'el camino';
    n += 1;

    // Lo que narraría, armado con lo que llega.
    const lineas = [];
    if (inst.resuelto?.situacion) lineas.push(inst.resuelto.situacion);
    else if (inst.resuelto?.tirada) lineas.push(`Lo intentas, y el resultado es un ${inst.resuelto.tirada.resultado} en ${lugar}, a ${inst.lugar?.franja ?? 'estas horas'}.`);
    // Varía con lo que escribe el jugador: un modelo real no repite su
    // plantilla, y aquí se mide lo inyectado, no la pobreza del simulador.
    const eco = String(inst.jugador?.escribe ?? '').split(/\s+/).filter((w) => w.length > 4).slice(-3).join(' ') || 'eso';
    if (quien) {
      const sabe = vivos.find((p) => p.nombre === quien)?.sabe?.[n % Math.max(1, vivos.find((p) => p.nombre === quien)?.sabe?.length ?? 1)];
      lineas.push(`${quien} ${GESTOS[n % GESTOS.length]} al oír lo de ${eco}.`);
      lineas.push(`${quien}: «${sabe && n % 2 ? sabe.replace(/[«»]/g, '') : `Sobre ${eco} te digo lo que vi en la ${inst.lugar?.franja ?? 'mañana'} del día ${inst.turno}.`}»`);
    } else {
      lineas.push(`En ${lugar}, a la ${inst.lugar?.franja ?? 'hora'} del turno ${inst.turno}, nadie hace caso de ${eco}.`);
    }

    const efectos = [];
    const tipo = reparacion ? 'limpio' : ['ausente', 'oro', 'repeticion', 'decide', 'efectos', 'prosa'][n % 6];
    const ausente = inst.ausentesConocidos?.find((a) => a.nombre && !vivos.some((v) => v.nombre === a.nombre))?.nombre;
    if (tipo === 'ausente' && ausente) { lineas.push(`${ausente}: ${MARCAS.ausente}`); inyectar('ausente'); }
    if (tipo === 'oro') { lineas.push(MARCAS.oro); efectos.push({ tipo: 'oro', datos: { delta: 20 }, razon: 'molestias', evidencia: 'narración' }); inyectar('oro'); }
    if (tipo === 'repeticion' && inst.yaContado?.length) { lineas.push(inst.yaContado.at(-1)); inyectar('repeticion'); }
    if (tipo === 'decide') { lineas.push(MARCAS.decide); inyectar('decide'); }
    if (tipo === 'efectos') {
      efectos.push({ tipo: 'objeto', datos: { nombre: 'Daga de plata' }, razon: 'regalo', evidencia: 'charla' });
      efectos.push({ tipo: 'mision', datos: { action: 'accept', title: 'Algo' }, razon: 'x', evidencia: 'y' });
      if (quien) efectos.push({ tipo: 'actitud', datos: { refId: vivos.find((p) => p.nombre === quien)?.refId, delta: 25 }, razon: 'trato', evidencia: 'le habla' });
      inyectar('efectos');
    }

    const json = { story: lineas.join('\n'), pregunta: quien ? `${quien} espera.` : '¿Y ahora?', choices: [{ label: 'Seguir', intent: 'custom', risk: 'low' }], proposedEffects: efectos, playerUpdates: tipo === 'oro' ? { gold: { delta: 20 } } : {}, mood: 'neutro' };
    if (tipo === 'prosa') { inyectar('prosa'); return `${lineas.join(' ')} {"proposedEffects":[{"tipo":"actitud","datos":{"delta":9}`; }
    return JSON.stringify(json);
  }

  async function fetchFalso(url, op = {}) {
    const ok = (datos) => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => datos });
    if (/\/(?:probar|estado)$/.test(url)) return ok({ servicio: 'arcanveil-puente-groq/2', ok: true, disponible: true });
    stats.peticiones += 1;
    const contenido = responder(JSON.parse(op.body));
    return ok({ choices: [{ message: { content: contenido } }], usage: { total_tokens: 0 } });
  }

  // `responder` va suelto para quien ponga su propio transporte
  // (`medir-costes-campana.mjs`), que cuenta las peticiones por su cuenta.
  return { fetch: fetchFalso, stats, responder };
}

/**
 * Pone el motor a narrar con el modelo simulado.
 * @param {Object} m El motor sin ventana.
 * @param {ReturnType<typeof modeloAdversario>} modelo
 */
export async function conectar(m, modelo) {
  const dm = m.sistema('dungeonmaster');
  const groq = dm.proveedor('groq');
  groq._fetch = modelo.fetch;
  groq._dormirMs = async () => {};
  await groq.probar();
  groq.configurar({ consentido: true });
  dm.cambiar('groq', { silencioso: true });
  const trazas = [];
  m.bus.on('narrador:traza', (t) => trazas.push(t));
  return trazas;
}

export default { modeloAdversario, conectar, MARCAS };
