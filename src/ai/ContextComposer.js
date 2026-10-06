/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCANVEIL · ai/ContextComposer.js
 * ---------------------------------------------------------------------------
 * Composición y poda del contexto que recibe el director.
 *
 * El problema: un modelo local pequeño admite un contexto limitado, y el estado
 * completo de una partida avanzada no cabe. Hay que decidir qué se envía y qué
 * se sacrifica.
 *
 * La solución: un presupuesto en caracteres repartido por secciones, con un
 * orden de poda explícito. Cuando algo no cabe, se sabe exactamente qué cae
 * primero: el inventario antes que los PNJ, los PNJ antes que las misiones, y
 * las instrucciones y la ficha del personaje nunca.
 *
 * Todo el contexto se compone como PROSA, no como volcado de datos. Los modelos
 * trabajan mucho mejor con «va malherido y hambriento» que con
 * `{hp: 12, hunger: 22}`.
 *
 * Dependencias: config, sistemas de jugador e inventario, MemoryStore.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { CONTEXTO, DIRECTOR } from '../config/ai.config.js';
import { frasesContadas } from './narrador/Instantanea.js';
import { instruccionesContrato } from './ResponseSchema.js';
import { crearCanal } from '../core/Logger.js';
import { truncar } from '../utils/text.js';
import { memoriaParaPrompt } from '../npc/NPC.js';

const log = crearCanal('ai');

/* ═══════════════════════════════════════════════════════════════════════════
   COMPOSITOR
   ═══════════════════════════════════════════════════════════════════════════ */

export class ContextComposer {
  /**
   * @param {Object} contexto
   * @param {import('../core/Store.js').Store} contexto.store
   * @param {import('../core/Registry.js').Registry} contexto.registry
   * @param {import('./MemoryStore.js').MemoryStore} contexto.memoria
   */
  constructor(contexto) {
    this.store = contexto.store;
    this.registry = contexto.registry;
    this.memoria = contexto.memoria;
    this.log = log;
  }

  /* ═══════════════════════════════════════════════════════════════════════
     COMPOSICIÓN COMPLETA
     ═══════════════════════════════════════════════════════════════════════ */

  /**
   * Compone el contexto completo de un turno.
   *
   * @param {Object} peticion
   * @param {string} peticion.accion
   * @param {Object} [peticion.intencion]
   * @param {Object} [peticion.tirada]
   * @param {string} [peticion.tipo='narracion']
   * @returns {{secciones: Object, texto: string, caracteres: number, podadas: string[]}}
   */
  componer(peticion) {
    const turno = this.store.select('meta.turno', 0);

    // Se generan todas las secciones y después se poda lo que no quepa.
    const secciones = {
      instrucciones: this._instrucciones(peticion),
      fichaPersonaje: this._fichaPersonaje(),
      situacionActual: [
        this._situacion(peticion),
        this.registry?.obtener('world')?.paraDirector() ?? '',
        // Lo que otros sistemas preparan para esta escena (un encuentro, lo
        // que cambió desde la última visita, algo que acaba de ocurrir) solo
        // llegaba al narrador interno: un modelo nunca se enteraba de un
        // encuentro en curso.
        this._notasDeEscena(),
        this.registry?.obtener('situations')?.paraDirector?.() ?? '',
      ].filter(Boolean).join('\n'),
      turnosRecientes: this.memoria.turnosRecientes(),
      memoriaLargoPlazo: this.memoria.paraPrompt(turno),
      misionesActivas: this._misiones(),
      npcsPresentes: this._npcs(),
      inventarioRelevante: this._inventario(),
    };

    const { texto, podadas, caracteres } = this._ajustarPresupuesto(secciones);

    if (podadas.length) {
      this.log.debug(`contexto podado: ${podadas.join(', ')}`, { caracteres });
    }

    return { secciones, texto, caracteres, podadas };
  }

  /**
   * Ajusta el contexto al presupuesto, podando en el orden declarado.
   *
   * @param {Object} secciones
   * @returns {{texto: string, podadas: string[], caracteres: number}}
   * @private
   */
  _ajustarPresupuesto(secciones) {
    const presupuesto = CONTEXTO.presupuestoCaracteres;
    const podadas = [];

    const activas = { ...secciones };

    let texto = this._unir(activas);

    // Se van retirando secciones enteras siguiendo el orden de sacrificio.
    for (const clave of CONTEXTO.ordenPoda) {
      if (texto.length <= presupuesto) break;
      if (!activas[clave]) continue;

      delete activas[clave];
      podadas.push(clave);
      texto = this._unir(activas);
    }

    // Si aún no cabe, se trunca lo último que quedó. Nunca las instrucciones ni
    // la ficha: sin ellas el director no sabe ni qué es ni a quién dirige.
    if (texto.length > presupuesto) {
      const recortable = ['turnosRecientes', 'memoriaLargoPlazo', 'situacionActual'];

      for (const clave of recortable) {
        if (texto.length <= presupuesto) break;
        if (!activas[clave]) continue;

        const exceso = texto.length - presupuesto;
        const nuevaLongitud = Math.max(200, activas[clave].length - exceso);
        activas[clave] = truncar(activas[clave], nuevaLongitud);
        podadas.push(`${clave} (truncado)`);
        texto = this._unir(activas);
      }
    }

    return { texto, podadas, caracteres: texto.length };
  }

  /**
   * @param {Object} secciones
   * @returns {string}
   * @private
   */
  _unir(secciones) {
    return Object.values(secciones).filter(Boolean).join('\n\n');
  }

  /* ═══════════════════════════════════════════════════════════════════════
     SECCIONES
     ═══════════════════════════════════════════════════════════════════════ */

  /**
   * Instrucciones de rol y contrato. Es la única sección que nunca se poda.
   *
   * @param {Object} peticion
   * @returns {string}
   * @private
   */
  _instrucciones(peticion) {
    const bloques = [DIRECTOR.rol, ''];

    bloques.push('PRINCIPIOS:');
    for (const p of DIRECTOR.principios) bloques.push(`· ${p}`);

    bloques.push('', 'RESTRICCIONES:');
    for (const r of DIRECTOR.restricciones) bloques.push(`· ${r}`);

    // La longitud pedida cambia según el tipo de turno: en combate se narra más
    // corto y más seco.
    const longitud = peticion.tipo === 'combate'
      ? DIRECTOR.longitudCombate
      : DIRECTOR.longitudNarracion;

    bloques.push('', `Extensión de la narración: alrededor de ${longitud.objetivo} palabras (entre ${longitud.min} y ${longitud.max}).`);
    bloques.push(`Ofrece entre ${DIRECTOR.opciones.min} y ${DIRECTOR.opciones.max} opciones.`);

    // La intensidad que el jugador eligió al crear la partida cambia el tono,
    // no las reglas: eso ya lo hacen los dados y los encuentros.
    const TONO = {
      relato: 'INTENSIDAD: Pacífica. La historia manda. Cuenta las peleas con elipsis, sin recrearte en heridas ni sangre, y prefiere salidas que no pasen por el acero.',
      duro: 'INTENSIDAD: Dura. El mundo no regala nada: las heridas pesan y se notan.',
      implacable: 'INTENSIDAD: Brutal. El mundo muerde. Las heridas se notan, los errores cuestan y nadie está a salvo por ser protagonista.',
    };
    const tono = TONO[this.store.select('settings.dificultad', 'equilibrado')];
    if (tono) bloques.push('', tono);

    bloques.push('', instruccionesContrato());

    return bloques.join('\n');
  }

  /**
   * Ficha narrativa del personaje. Tampoco se poda nunca.
   * @returns {string}
   * @private
   */
  _fichaPersonaje() {
    const player = this.registry?.obtener('player');
    if (!player) return '';

    const bloques = ['EL PERSONAJE:'];
    bloques.push(player.fichaNarrativa());

    // Estado físico en lenguaje natural, no en números.
    const estado = player.estadoNarrativo();
    if (estado) bloques.push(`Ahora mismo está ${estado}.`);

    const jugador = this.store.select('player');
    bloques.push(`Nivel ${jugador.nivel}, con ${jugador.vida.actual} de ${jugador.vida.max} puntos de vida.`);

    return bloques.join('\n');
  }

  /**
   * Situación inmediata: dónde está, cuándo, qué acaba de hacer y cómo le fue.
   *
   * La tirada es la parte crítica. El motor ya decidió el resultado; aquí se le
   * comunica al director para que lo NARRE, no para que lo decida.
   *
   * @param {Object} peticion
   * @returns {string}
   * @private
   */
  _situacion(peticion) {
    const mundo = this.store.select('world');
    const bloques = ['SITUACIÓN:'];

    // — Lugar y momento —
    const lugar = mundo.ubicacion
      ? this.store.select(`world.localizaciones.porId.${mundo.ubicacion}.nombre`, 'un lugar sin nombre')
      : 'un lugar aún sin definir';

    bloques.push(`Se encuentra en ${lugar}, terreno de tipo ${mundo.terreno}.`);
    bloques.push(`Es el día ${mundo.tiempo.dia}, franja de ${mundo.tiempo.franja}, con clima ${mundo.clima.actual}.`);

    // — Acción del jugador —
    if (peticion.accion) {
      // Es lo que intenta, no lo que pasa: «lo mato» no es un hecho.
      bloques.push('', `LO QUE INTENTA EL JUGADOR (intención, no hecho): «${peticion.accion}»`);
    }

    if (peticion.intencion?.tipo && peticion.intencion.tipo !== 'custom') {
      bloques.push(`Intención interpretada: ${peticion.intencion.tipo}.`);
    }

    // — Resultado de la tirada —
    if (peticion.tirada) {
      const t = peticion.tirada;
      bloques.push('', 'RESULTADO DE LA PRUEBA (ya resuelto por el motor: NARRA esto, no lo cambies):');
      bloques.push(this._describirTirada(t));
    } else {
      bloques.push('', 'Esta acción no ha requerido tirada.');
    }

    // — Presión narrativa —
    if (mundo.turnosSinTension >= 8) {
      bloques.push('', 'NOTA: llevan varios turnos sin tensión. Conviene introducir algo que la genere.');
    }

    return bloques.join('\n');
  }

  /**
   * Describe una tirada en lenguaje natural.
   *
   * @param {Object} t
   * @returns {string}
   * @private
   */
  _describirTirada(t) {
    const partes = [];

    const grados = {
      exitoRotundo: 'ÉXITO ROTUNDO: sale mucho mejor de lo esperado',
      exitoClaro: 'ÉXITO CLARO: sale bien, sin complicaciones',
      exitoJusto: 'ÉXITO AJUSTADO: sale, pero por poco y no del todo limpio',
      fracaso: 'FRACASO: no lo consigue',
      fracasoGrave: 'FRACASO GRAVE: no solo falla, además empeora la situación',
    };

    partes.push(grados[t.grado] ?? 'Resultado indeterminado');

    if (t.critico) partes.push('Ha sido un golpe de suerte excepcional.');
    if (t.pifia) partes.push('Ha sido un error garrafal.');

    if (t.habilidad) partes.push(`Prueba de ${t.habilidad}.`);

    // El desglose deja claro POR QUÉ salió así, y eso da material narrativo:
    // fallar por agotamiento se narra distinto que fallar por mala suerte.
    if (t.desglose?.length) {
      const negativos = t.desglose.filter((m) => m.valor < 0);
      if (negativos.length) {
        partes.push(`Le penalizó: ${negativos.map((m) => m.fuente).join(', ')}.`);
      }
    }

    return partes.join(' ');
  }

  /**
   * El primer encargo que el jugador ha aceptado, en lo justo: título y
   * lugar. Ya no hay una «principal» que salga de su pasado; lo que haya en
   * curso es lo que él ha decidido llevar.
   * @returns {{titulo: string, nombreLugar: string|null}|null}
   * @private
   */
  _misionEnCurso() {
    const misiones = this.store.select('quests.activas', { porId: {}, orden: [] });
    const m = misiones.orden.map((id) => misiones.porId[id])
      .find((x) => x?.estado === 'aceptada');
    if (!m) return null;
    const lugar = m.lugar ? this.store.select(`world.localizaciones.porId.${m.lugar}.nombre`, null) : null;
    return { titulo: m.titulo, nombreLugar: lugar };
  }

  /**
   * Las notas de escena de este turno, en prosa.
   * @returns {string}
   * @private
   */
  _notasDeEscena() {
    const notas = (this.memoria.contextoDeEscena?.() ?? []).filter(Boolean);
    return notas.length ? `AHORA MISMO:\n${notas.map((n) => `· ${n}`).join('\n')}` : '';
  }

  /**
   * Misiones activas, con sus objetivos pendientes.
   * @returns {string}
   * @private
   */
  _misiones() {
    const misiones = this.store.select('quests.activas', { porId: {}, orden: [] });
    const activas = misiones.orden.map((id) => misiones.porId[id]).filter(Boolean);

    if (!activas.length) return '';

    // Qué es cada una. Un rumor o una oferta no es algo que el jugador haya
    // aceptado, y un objetivo propio no lo ha encargado nadie.
    const etiqueta = (m) => (m.estado === 'ofrecida' ? 'OFRECIDO, sin aceptar'
      : m.tipo === 'meta' ? 'objetivo que se ha marcado él'
        : 'aceptado');
    const lineas = activas.slice(0, 5).map((m) => {
      const pendientes = (m.objetivos ?? []).filter((o) => !o.hecho).map((o) => o.texto);
      const detalle = pendientes.length ? ` Pendiente: ${pendientes.join('; ')}.` : '';
      return `· ${m.titulo} (${etiqueta(m)}).${detalle}`;
    });

    return `MISIONES ACTIVAS:\n${lineas.join('\n')}`;
  }

  /**
   * PNJ presentes en la escena, con su actitud actual.
   * @returns {string}
   * @private
   */
  _npcs() {
    const npcs = this.store.select('npcs');
    const presentes = (npcs?.presentes ?? [])
      .map((id) => npcs.conocidos?.porId?.[id])
      .filter(Boolean);

    if (!presentes.length) return '';

    // La actitud se leía de `npcs.relaciones`, que no existe: todos salían
    // «neutral» dijera lo que dijera el estado. Es la del propio PNJ. Y cada
    // uno lleva lo que recuerda del jugador: sin eso, volver a hablar con
    // alguien era conocerle de nuevo.
    const lineas = presentes.map((n) => {
      const relacion = n.actitud ?? 0;
      const actitud = relacion >= 45 ? 'te aprecia'
        : relacion >= 15 ? 'es cordial'
        : relacion <= -45 ? 'te detesta'
        : relacion <= -15 ? 'desconfía de ti'
        : 'es neutral';
      const recuerda = n.memoria?.length ? ` Recuerda: ${memoriaParaPrompt(n, 3)}.` : '';

      return `· ${n.nombre ?? n.rol} (${n.rol}): ${actitud}.${recuerda}`;
    });

    return `PRESENTES EN LA ESCENA:\n${lineas.join('\n')}`;
  }

  /**
   * Equipo y objetos notables.
   *
   * Es la primera sección que se sacrifica: el director rara vez necesita saber
   * cuántas raciones llevas, y cuando lo necesita, puede preguntarlo narrando.
   *
   * @returns {string}
   * @private
   */
  _inventario() {
    const inventario = this.registry?.obtener('inventory');
    if (!inventario) return '';

    const texto = inventario.paraDirector();
    return texto ? `EQUIPO Y BOLSA:\n${texto}` : '';
  }

  /* ═══════════════════════════════════════════════════════════════════════
     CONTEXTO REDUCIDO
     ═══════════════════════════════════════════════════════════════════════ */

  /**
   * Versión mínima del contexto, para proveedores con poca capacidad o para
   * un reintento tras un fallo de formato.
   *
   * Conserva lo imprescindible: quién es, dónde está, qué hizo y cómo salió.
   *
   * @param {Object} peticion
   * @returns {string}
   */
  componerReducido(peticion) {
    const jugador = this.store.select('player');
    const mundo = this.store.select('world');

    const bloques = [
      DIRECTOR.rol,
      '',
      'Responde ÚNICAMENTE con JSON válido con las claves: story, choices, playerUpdates, newItems, quests, combat, events.',
      '',
      `PERSONAJE: ${jugador.nombre}, nivel ${jugador.nivel}. ${jugador.retrato || ''}`,
      `LUGAR: ${mundo.terreno}, ${mundo.tiempo.franja}, ${mundo.clima.actual}.`,
    ];

    if (peticion.accion) bloques.push(`INTENTA (no es un hecho): «${peticion.accion}»`);
    if (peticion.tirada) bloques.push(`RESULTADO YA DECIDIDO: ${peticion.tirada.grado}. Nárralo.`);

    return bloques.join('\n');
  }

  /* ═══════════════════════════════════════════════════════════════════════
     CONTEXTO ESTRUCTURADO
     ═══════════════════════════════════════════════════════════════════════ */

  /**
   * Datos estructurados para el proveedor procedural.
   *
   * El director interno no lee prosa: necesita los datos crudos para elegir
   * plantillas y componer. Esta es su vía de entrada.
   *
   * @param {Object} peticion
   * @returns {Object}
   */
  componerEstructurado(peticion) {
    const jugador = this.store.select('player');
    const mundo = this.store.select('world');
    const combate = this.store.select('combat');
    const npcs = this.store.select('npcs');
    const turno = this.store.select('meta.turno', 0);

    return {
      turno,

      jugador: {
        nombre: jugador.nombre,
        nivel: jugador.nivel,
        vida: jugador.vida,
        mana: jugador.mana,
        fatiga: jugador.fatiga,
        moral: jugador.moral,
        raza: jugador.raza,
        clase: jugador.clase,
        retrato: jugador.retrato,
        lore: jugador.lore,
        gancho: jugador.gancho,
        motivacion: jugador.motivacion,
        flags: jugador.flags,
      },

      mundo: {
        terreno: mundo.terreno,
        ubicacion: mundo.ubicacion,
        // Sin esto, el director no sabía si el personaje estaba dentro o fuera
        // y describía el terreno de la comarca desde la mesa de una taberna.
        sublugar: mundo.sublugar ?? null,
        franja: mundo.tiempo.franja,
        estacion: mundo.tiempo.estacion ?? null,
        hora: mundo.tiempo.hora,
        dia: mundo.tiempo.dia,
        clima: mundo.clima.actual,
        turnosSinTension: mundo.turnosSinTension,
        turnosDesdeEncuentro: mundo.turnosDesdeEncuentro,
      },

      combate: combate.activo ? combate : null,

      npcsPresentes: (npcs?.presentes ?? [])
        .map((id) => npcs.conocidos?.porId?.[id])
        .filter(Boolean),

      // A quién conoce el mundo, para saber de quién se habla aunque no
      // esté delante.
      conocidos: Object.values(npcs?.conocidos?.porId ?? {})
        .map((n) => ({ refId: n.refId, nombre: n.nombre, rol: n.rol, genero: n.genero, actitud: n.actitud, lugar: n.lugar })),

      // Lo que el mundo recuerda, en texto: lo que ya se ha descubierto no se
      // descubre dos veces.
      hechosTextos: (this.memoria.hechos ?? []).slice(-80).map((h) => h.texto),

      // Solo lo que PASÓ en el mundo (desenlaces de situaciones): lo que un
      // PNJ puede contar y lo que cambia un sitio. Ni hazañas, ni notas del
      // motor, ni lo que dijo alguien.
      sucesos: (this.memoria.hechos ?? []).filter((h) => h.categoria === 'suceso').slice(-20).map((h) => h.texto),

      accion: peticion.accion,
      intencion: peticion.intencion,
      tirada: peticion.tirada,
      tipo: peticion.tipo ?? 'narracion',

      hiloParaRetomar: this.memoria.hiloParaRetomar(turno),
      hechosRecientes: this.memoria.hechosRelevantes(5),
      ultimoTurno: this.memoria.historial.at(-1) ?? null,

      // Lo que otros sistemas han preparado para ESTA escena: el encuentro en
      // curso, lo que cambió desde la última visita, la promesa que caduca. Es
      // lo primero que debe mirar el director, por delante de la atmósfera.
      contextoEscena: this.memoria.contextoDeEscena(),

      // El canon del jugador: quién y qué ha traído él al mundo. El director
      // solo puede repetir lo que hay aquí, nunca añadir: de esa limitación
      // sale la concordancia.
      canon: this.memoria.canonDestacado(null, 6),

      // Quién viaja con el personaje, para que comenten de vez en cuando.
      grupo: (this.registry?.obtener('party')?.miembros?.() ?? []).map((m) => ({ ...m.ficha, herido: m.herido })),

      // Lo que el jugador lleva entre manos por decisión suya: los compañeros
      // lo tienen presente.
      misionEnCurso: this._misionEnCurso(),

      // Lo que está pasando aquí, con o sin él: quién, qué quiere cada uno y
      // si ha decidido no meterse.
      situacion: this.registry?.obtener('situations')?.paraContexto?.() ?? null,

      // Lo ya narrado (sobrevive a guardar y cargar): para no volver a
      // contar lo mismo, sea quien sea quien narre.
      yaContado: frasesContadas(this.store.select('narrative.entradas', []) ?? [], 40),
    };
  }
}

export default ContextComposer;
