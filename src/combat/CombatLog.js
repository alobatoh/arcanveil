/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCANVEIL · combat/CombatLog.js
 * ---------------------------------------------------------------------------
 * Registro de la refriega.
 *
 * Dos consumidores con necesidades opuestas:
 *
 *   · EL JUGADOR quiere saber qué acaba de pasar, con números concretos. «17
 *     de daño cortante, crítico» es información accionable.
 *   · EL DIRECTOR quiere material narrativo, no una hoja de cálculo. Necesita
 *     saber que el golpe fue devastador y que el enemigo está a punto de caer.
 *
 * Este módulo produce ambas versiones del mismo registro. También genera el
 * resumen final del combate, que es lo que se guarda en la memoria a largo
 * plazo: dentro de treinta turnos importará que ganaste, no cuánto daño hiciste
 * en la ronda tres.
 *
 * Funciones puras.
 *
 * Dependencias: DamageCalculator, AttackResolver, narrative.templates, statuses.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { TIPOS_DANO, magnitud } from './DamageCalculator.js';
import { RESULTADO } from './AttackResolver.js';
import { COMBATE as PLANTILLAS } from '../data/narrative.templates.js';
import { obtenerEstado } from '../data/statuses.data.js';
import { concordar, articuloIndet, enumerar, plural } from '../utils/text.js';
import { obtenerPlantilla } from '../data/items.data.js';

/* ═══════════════════════════════════════════════════════════════════════════
   ENTRADAS
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Construye una entrada de registro a partir de un ataque resuelto.
 *
 * @param {Object} resultado Salida de AttackResolver.resolver().
 * @param {Object} contexto
 * @returns {Object}
 */
export function entradaAtaque(resultado, contexto) {
  const { ronda, atacante, objetivo, ataque } = contexto;

  return {
    ronda,
    tipo: 'ataque',
    resultado: resultado.resultado,

    atacante: { id: atacante.id, nombre: atacante.nombre, esJugador: atacante.esJugador },
    objetivo: { id: objetivo.id, nombre: objetivo.nombre, esJugador: objetivo.esJugador, genero: objetivo.genero ?? 'm' },

    ataque: ataque?.nombre ?? 'ataque',

    tirada: resultado.tirada
      ? {
          natural: resultado.tirada.natural,
          total: resultado.tirada.total,
          umbral: resultado.tirada.umbral,
          critico: resultado.tirada.critico,
          pifia: resultado.tirada.pifia,
          // El bono de la jugada escrita, si lo hubo, para enseñarlo aparte.
          creativo: (resultado.tirada.desglose ?? []).find((m) => m.fuente === 'Creativo')?.valor ?? 0,
        }
      : null,

    // Con qué se hizo la jugada, en palabras del jugador: «desde la roca».
    jugada: contexto.jugada ?? null,

    dano: resultado.dano
      ? {
          total: resultado.dano.total,
          tipo: resultado.dano.tipo,
          bloqueado: resultado.dano.bloqueado,
          afinidad: resultado.dano.afinidad,
          magnitud: magnitud(resultado.dano.total, objetivo),
        }
      : null,

    estados: resultado.estadosAplicados ?? [],
    vidaRobada: resultado.vidaRobada ?? 0,
    cayo: resultado.cayo,

    // Estado del objetivo tras el golpe: es lo que el director necesita para
    // narrar la reacción.
    objetivoTras: {
      vida: resultado.objetivo.vida.actual,
      max: resultado.objetivo.vida.max,
      fraccion: resultado.objetivo.vida.actual / Math.max(1, resultado.objetivo.vida.max),
    },
  };
}

/**
 * Entrada de un efecto periódico.
 *
 * @param {Object} evento
 * @param {Object} combatiente
 * @param {number} ronda
 * @returns {Object}
 */
export function entradaPeriodico(evento, combatiente, ronda) {
  return {
    ronda,
    tipo: evento.tipo === 'curacion_periodica' ? 'curacion' : 'dano_periodico',
    objetivo: { id: combatiente.id, nombre: combatiente.nombre, esJugador: combatiente.esJugador },
    estado: evento.nombre,
    cantidad: evento.cantidad,
    acumulaciones: evento.acumulaciones ?? 1,
  };
}

/**
 * Entrada de un suceso singular: cambio de fase, invocación, huida.
 *
 * @param {string} tipo
 * @param {Object} datos
 * @param {number} ronda
 * @returns {Object}
 */
export function entradaSuceso(tipo, datos, ronda) {
  return { ronda, tipo, ...datos };
}

/* ═══════════════════════════════════════════════════════════════════════════
   NARRACIÓN PARA EL JUGADOR
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Convierte una entrada en la línea que ve el jugador.
 *
 * Es concreta y con números: en combate, saber que has hecho 17 y que al
 * enemigo le quedan 8 es lo que permite decidir el turno siguiente.
 *
 * @param {Object} entrada
 * @returns {string}
 */
export function paraJugador(entrada) {
  switch (entrada.tipo) {
    case 'ataque': return _lineaAtaque(entrada);
    case 'dano_periodico':
      return `${entrada.objetivo.nombre} sufre ${entrada.cantidad} de daño por ${entrada.estado.toLowerCase()}.`;
    case 'curacion':
      return `${entrada.objetivo.nombre} recupera ${entrada.cantidad} de vida.`;
    case 'fase':
      return entrada.narracion ?? `${entrada.jefe} cambia de comportamiento.`;
    case 'invocacion':
      return entrada.narracion ?? 'Llegan refuerzos.';
    case 'huida':
      return `${entrada.nombre} escapa del combate.`;
    case 'caida':
      // El parte le habla al jugador de tú: «Caes.», no «Brunhilda cae.».
      return entrada.esJugador ? 'Caes.' : `${entrada.nombre} cae.`;
    case 'estado_expirado':
      return `${entrada.nombre}: se le pasa el efecto de ${entrada.estado.toLowerCase()}.`;
    case 'salvacion':
      return `${entrada.nombre} se libra de ${entrada.estado.toLowerCase()}.`;
    default:
      return '';
  }
}

/**
 * @param {Object} e
 * @returns {string}
 * @private
 */
function _lineaAtaque(e) {
  const atacaJugador = Boolean(e.atacante.esJugador);
  const recibeJugador = Boolean(e.objetivo.esJugador);

  // El pronombre átono va DELANTE del verbo, no detrás.
  //
  // Se montaba como «sujeto + verbo + complemento» y salía «Saqueador B ataca
  // te y acierta». En castellano es «te ataca», y la única forma de que salga
  // bien es armar el sintagma entero en vez de pegar tres trozos.
  const ataque = atacaJugador
    ? `Atacas a ${e.objetivo.nombre}`
    : (recibeJugador ? `${e.atacante.nombre} te ataca` : `${e.atacante.nombre} ataca a ${e.objetivo.nombre}`);

  // Y el segundo verbo concuerda con quien ataca. Iba fijo en tercera persona,
  // así que salía «Atacas a Saqueador C y acierta»: empiezas hablando de tú y
  // terminas hablando de él.
  const conjugar = (tu, el) => (atacaJugador ? tu : el);

  // Si la jugada escrita dio bono, se enseña la tirada entera: el jugador
  // tiene que ver que lo que escribió ha contado, y cuánto.
  const creativo = e.tirada?.creativo ?? 0;
  const dados = creativo
    ? ` (d20 ${e.tirada.natural}, ${creativo > 0 ? '+' : ''}${creativo} por la jugada: ${e.tirada.total} contra ${e.tirada.umbral})`
    : '';

  switch (e.resultado) {
    case RESULTADO.ESQUIVADO:
      // Con compañeros hay un tercer caso: ni atacas tú ni te atacan a ti.
      if (recibeJugador) return `Esquivas el ataque de ${e.atacante.nombre}.`;
      if (atacaJugador) return `${e.objetivo.nombre} esquiva tu ataque.`;
      return `${e.objetivo.nombre} esquiva el ataque de ${e.atacante.nombre}.`;

    case RESULTADO.FALLO:
      return `${ataque} y ${conjugar('fallas', 'falla')}.${dados || ` (${e.tirada?.total} contra ${e.tirada?.umbral})`}`;

    case RESULTADO.PIFIA:
      return `${ataque} y ${conjugar('fallas', 'falla')} estrepitosamente. (1 natural)`;

    case RESULTADO.IMPOSIBLE:
      return `${e.atacante.nombre} no puede atacar.`;

    case RESULTADO.CRITICO:
    case RESULTADO.IMPACTO: {
      const partes = [];

      const verbo = e.resultado === RESULTADO.CRITICO
        ? conjugar('golpeas de lleno', 'golpea de lleno')
        : conjugar('aciertas', 'acierta');

      partes.push(`${ataque} y ${verbo}: ${e.dano.total} de daño`);

      if (e.dano.tipo) partes.push(TIPOS_DANO[e.dano.tipo]?.nombre ?? e.dano.tipo);

      const notas = [];
      if (e.resultado === RESULTADO.CRITICO) notas.push('crítico');
      if (e.dano.bloqueado > 0) notas.push(`${e.dano.bloqueado} absorbidos`);
      if (e.dano.afinidad === 'resistente') notas.push('resistido');
      if (e.dano.afinidad === 'vulnerable') notas.push('vulnerable');
      if (e.vidaRobada > 0) notas.push(`+${e.vidaRobada} de vida robada`);

      // Notas y tirada en un solo paréntesis: dos seguidos se leen como dos
      // frases sueltas.
      let linea = partes.join(' ');
      const tiradaEnClaro = dados.trim().replace(/^\(|\)$/g, '');
      const entreParentesis = [notas.join(', '), tiradaEnClaro].filter(Boolean).join('; ');
      if (entreParentesis) linea += ` (${entreParentesis})`;
      linea += '.';

      // Estados aplicados.
      for (const est of e.estados ?? []) {
        const estado = obtenerEstado(est.refId);
        if (!estado) continue;
        // Si el golpe te lo dan a ti, quedas tú: la línea ya empezó con «te
        // ataca» y pasar a «Brunhilda queda…» cambia de persona a media frase.
        const como = concordar(estado.nombre.toLowerCase(), e.objetivo.genero);
        linea += recibeJugador ? ` Quedas ${como}.` : ` ${e.objetivo.nombre} queda ${como}.`;
      }

      // La caída NO se cuenta aquí.
      //
      // El parte sacó «Brunhilda cae.» dos veces: una pegada al golpe y otra
      // como entrada propia desde `_registrarCaida`. La entrada propia es la
      // buena —también la usa el daño por veneno o sangrado, que no viene de
      // ningún golpe—, así que el golpe se limita a narrar el golpe.

      return linea;
    }

    default:
      return '';
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   NARRACIÓN PARA EL DIRECTOR
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Convierte una tanda de entradas en material narrativo para el director.
 *
 * Sin números: el director necesita saber que el golpe fue devastador y que el
 * enemigo cojea, no las cifras exactas.
 *
 * @param {Array<Object>} entradas Entradas de la ronda.
 * @returns {string}
 */
export function paraDirector(entradas) {
  const lineas = [];

  for (const e of entradas) {
    switch (e.tipo) {
      case 'ataque': {
        if (e.resultado === RESULTADO.ESQUIVADO) {
          lineas.push(`${e.objetivo.nombre} esquivó el ataque de ${e.atacante.nombre}.`);
          break;
        }
        if (e.resultado === RESULTADO.FALLO || e.resultado === RESULTADO.PIFIA) {
          lineas.push(`${e.atacante.nombre} falló su ataque${e.resultado === RESULTADO.PIFIA ? ' de forma torpe' : ''}.`);
          break;
        }
        if (!e.dano) break;

        const golpe = `${e.atacante.nombre} alcanzó a ${e.objetivo.nombre} con un golpe ${e.dano.magnitud}`;
        const genero = e.objetivo.genero ?? 'm';
        const estados = (e.estados ?? [])
          .map((s) => obtenerEstado(s.refId)?.nombre?.toLowerCase())
          .filter(Boolean)
          .map((n) => concordar(n, genero));

        let linea = golpe;
        if (estados.length) linea += `, dejándol${genero === 'f' ? 'a' : 'o'} ${estados.join(' y ')}`;
        if (e.cayo) linea += '. Cayó';
        else if (e.objetivoTras.fraccion < 0.25) linea += '. Está al límite';

        lineas.push(`${linea}.`);
        break;
      }

      case 'dano_periodico':
        lineas.push(`${e.objetivo.nombre} sigue sufriendo por ${e.estado.toLowerCase()}.`);
        break;

      case 'fase':
        lineas.push(e.narracion ?? `${e.jefe} cambió de comportamiento.`);
        break;

      case 'invocacion':
        lineas.push(e.narracion ?? 'Llegaron refuerzos enemigos.');
        break;

      case 'huida':
        lineas.push(`${e.nombre} huyó del combate.`);
        break;
    }
  }

  return lineas.join(' ');
}

/* ═══════════════════════════════════════════════════════════════════════════
   RESUMEN DEL COMBATE
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Resumen de toda la refriega, para la memoria a largo plazo.
 *
 * Dentro de treinta turnos importará que ganaste y a qué precio, no cuánto daño
 * hiciste en la ronda tres.
 *
 * @param {Array<Object>} registro Todas las entradas.
 * @param {Object} contexto
 * @returns {{texto: string, estadisticas: Object}}
 */
export function resumir(registro, contexto) {
  const { resultado, rondas, enemigos, jugadorInicial, jugadorFinal } = contexto;

  // ─── Estadísticas ───────────────────────────────────────────────────────
  const ataquesJugador = registro.filter((e) => e.tipo === 'ataque' && e.atacante?.esJugador);
  const impactos = ataquesJugador.filter((e) => e.dano);

  const estadisticas = {
    rondas,
    ataques: ataquesJugador.length,
    impactos: impactos.length,
    fallos: ataquesJugador.length - impactos.length,
    criticos: ataquesJugador.filter((e) => e.resultado === RESULTADO.CRITICO).length,
    danoInfligido: impactos.reduce((a, e) => a + (e.dano?.total ?? 0), 0),
    danoRecibido: registro
      .filter((e) => (e.tipo === 'ataque' && e.objetivo?.esJugador)
        || (e.tipo === 'dano_periodico' && e.objetivo?.esJugador))
      .reduce((a, e) => a + (e.dano?.total ?? e.cantidad ?? 0), 0),
    enemigosDerrotados: registro.filter((e) => e.tipo === 'caida' && !e.esJugador).length,
    enemigosHuidos: registro.filter((e) => e.tipo === 'huida').length,
    precision: ataquesJugador.length ? impactos.length / ataquesJugador.length : 0,
  };

  // ─── Texto ──────────────────────────────────────────────────────────────
  const nombres = [...new Set(enemigos.map((e) => e.nombreBase ?? e.nombre))];
  const contra = nombres.length === 1
    ? nombres[0]
    : `${nombres.slice(0, -1).join(', ')} y ${nombres.at(-1)}`;

  const partes = [];

  switch (resultado) {
    case 'victoria':
      partes.push(`Combate contra ${contra}: victoria en ${rondas} ronda${rondas === 1 ? '' : 's'}.`);
      break;
    case 'derrota':
      partes.push(`Combate contra ${contra}: derrota.`);
      break;
    case 'huida':
      partes.push(`Combate contra ${contra}: el personaje escapó.`);
      break;
    case 'acuerdo':
      partes.push(`Combate contra ${contra}: se detuvo hablando, sin más sangre.`);
      break;
    default:
      partes.push(`Combate contra ${contra}: quedó en tablas.`);
  }

  // El precio pagado importa más que las cifras.
  const vidaPerdida = (jugadorInicial?.vida?.actual ?? 0) - (jugadorFinal?.vida?.actual ?? 0);
  const fraccionFinal = (jugadorFinal?.vida?.actual ?? 0) / Math.max(1, jugadorFinal?.vida?.max ?? 1);

  if (vidaPerdida <= 0) {
    partes.push('Salió sin un rasguño.');
  } else if (fraccionFinal < 0.2) {
    partes.push('Salió al borde de la muerte.');
  } else if (fraccionFinal < 0.5) {
    partes.push('Salió malherido.');
  }

  if (estadisticas.enemigosHuidos > 0) {
    partes.push(`${estadisticas.enemigosHuidos} enemigo${estadisticas.enemigosHuidos === 1 ? '' : 's'} escapó.`);
  }

  return { texto: partes.join(' '), estadisticas };
}

/* ═══════════════════════════════════════════════════════════════════════════
   APERTURA Y CIERRE
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Línea de apertura del combate.
 *
 * @param {import('../core/RNG.js').Flujo} flujo
 * @param {Array<Object>} enemigos
 * @param {Object} [opciones]
 * @param {boolean} [opciones.teVen] Ya estaban cara a cara: golpea primero, pero no es una emboscada.
 * @param {string} [opciones.contra] Contra quién, tal como se le ve en la escena («la patrulla que tenías delante»).
 * @returns {string}
 */
export function apertura(flujo, enemigos, opciones = {}) {
  const nombres = [...new Set(enemigos.map((e) => e.nombreBase ?? e.nombre))];
  const cuantos = enemigos.length;

  const descripcion = cuantos === 1
    ? nombres[0]
    : `${cuantos} ${nombres.length === 1 ? (enemigos[0].plural ?? nombres[0]) : nombres.join(' y ')}`;

  if (opciones.emboscadaEnemiga) {
    return `Te caen encima sin aviso: ${descripcion}.`;
  }
  // Personas de la escena con su nombre (Korsa, Xivio): se dice quién, no
  // «2 Korsa y Xivio» ni «contra Xivio: Xivio». Los que no son nadie de la
  // escena (el del pretil) van por su clase: «un guardia corrupto».
  if (enemigos.some((e) => e.npc) && opciones.emboscadaJugador && opciones.teVen && opciones.contra) {
    const sinNombre = new Map();
    for (const e of enemigos.filter((x) => !x.npc)) sinNombre.set(e.nombreBase ?? e.nombre, [...(sinNombre.get(e.nombreBase ?? e.nombre) ?? []), e]);
    const otros = [
      ...enemigos.filter((e) => e.npc && e.nombre !== opciones.contra).map((e) => e.nombre),
      ...[...sinNombre.entries()].map(([base, l]) => (l.length === 1 ? `${l[0].genero === 'f' ? 'una' : 'un'} ${base.toLowerCase()}` : `${l.length} ${l[0].plural ?? base}`)),
    ];
    const lista = otros.length > 1 ? `${otros.slice(0, -1).join(', ')} y ${otros.at(-1)}` : otros[0];
    return `Te lanzas tú primero contra ${opciones.contra}${otros.length ? `, y ${lista} ${otros.length > 1 ? 'se meten' : 'se mete'} en la pelea` : ''}.`;
  }
  // Quien ya estaba hablando contigo te ha visto. «No te han visto» justo
  // después de hablar con la patrulla dejaba sin saber contra quién iba el
  // golpe ni de dónde salía.
  if (opciones.emboscadaJugador && opciones.teVen) {
    return `Te lanzas tú primero${opciones.contra ? ` contra ${opciones.contra}` : ''}: ${descripcion}.`;
  }
  if (opciones.emboscadaJugador) {
    return `Los tienes a tiro y no te han visto: ${descripcion}.`;
  }

  // Con dos puntos, igual que las dos emboscadas de arriba.
  //
  // Iba pegado con un espacio y salía «No hay tiempo para hablar 2
  // saqueadores.», como si uno hablara saqueadores. Las cuatro aperturas son
  // frases cerradas que no admiten complemento detrás; los dos puntos
  // presentan la lista en vez de cosérsela al verbo.
  const base = flujo.elegir(PLANTILLAS.inicio);
  return `${base}: ${descripcion}.`;
}

/**
 * El botín contado como parte de la historia.
 *
 * Se apuntaba en el inventario sin decir nada, y el jugador no sabía si había
 * sacado algo hasta abrir la mochila. Ahora se cuenta: «Entre sus cosas
 * encuentras una daga oxidada y 14 monedas de oro.»
 *
 * @param {{oro: number, objetos: Array<Object>}} botin
 * @param {number} [caidos=1] Cuántos cayeron, para el número del verbo.
 * @returns {string}
 */
export function narrarBotin(botin = {}, caidos = 1) {
  const cosas = (botin.objetos ?? []).map((o) => {
    const nombre = String(o.nombre ?? 'algo').toLowerCase();
    // «2 raciones», «3 pociones de curación»: el plural va en la primera palabra.
    if ((o.cantidad ?? 1) > 1) {
      const [cabeza, ...resto] = nombre.split(' ');
      return [o.cantidad, plural(cabeza), ...resto].join(' ');
    }
    const genero = obtenerPlantilla(o.refId)?.genero ?? 'm';
    return `${articuloIndet(nombre, genero)} ${nombre}`;
  });

  if (botin.oro > 0) cosas.push(`${botin.oro} ${botin.oro === 1 ? 'moneda' : 'monedas'} de oro`);

  if (!cosas.length) {
    return caidos > 1 ? 'No llevaban nada que valga la pena.' : 'No llevaba nada que valga la pena.';
  }

  const solo = !(botin.objetos ?? []).length ? 'solo hay ' : 'encuentras ';
  return `Entre sus cosas ${solo}${enumerar(cosas)}.`;
}

/**
 * Línea de cierre del combate.
 *
 * @param {import('../core/RNG.js').Flujo} flujo
 * @param {string} resultado
 * @returns {string}
 */
export function cierre(flujo, resultado) {
  // Las plantillas van sin punto porque otras piezas las encadenan; como
  // línea suelta de la bitácora lo necesitan («La oscuridad te alcanza»).
  const conPunto = (t) => (/[.!?…»]$/u.test(t) ? t : `${t}.`);
  switch (resultado) {
    case 'victoria': return conPunto(flujo.elegir(PLANTILLAS.victoria));
    case 'derrota': return conPunto(flujo.elegir(PLANTILLAS.derrota));
    case 'huida': return conPunto(flujo.elegir(PLANTILLAS.huida));
    case 'acuerdo': return 'Se bajan las armas. Hoy nadie más va a sangrar.';
    default: return 'El combate se detiene sin un vencedor claro.';
  }
}

export default {
  entradaAtaque,
  entradaPeriodico,
  entradaSuceso,
  paraJugador,
  paraDirector,
  resumir,
  apertura,
  cierre,
};
