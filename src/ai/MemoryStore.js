/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCANVEIL · ai/MemoryStore.js
 * ---------------------------------------------------------------------------
 * Memoria narrativa a largo plazo del director.
 *
 * Es lo que separa una partida de una sucesión de escenas inconexas. Sin esto,
 * el director olvidaría en el turno 30 lo que prometiste en el turno 5.
 *
 * Tres capas, de más volátil a más permanente:
 *
 *   1. HISTORIAL — turnos recientes íntegros. Se poda por antigüedad.
 *   2. RESÚMENES — cada N turnos, el historial antiguo se comprime en un
 *      párrafo. Es la memoria de medio plazo.
 *   3. HECHOS — afirmaciones permanentes con peso. Nunca caducan por tiempo,
 *      solo por relevancia.
 *
 * Además hay HILOS: promesas, deudas y misterios abiertos. El director los
 * consulta para decidir qué retomar. Un hilo que lleva muchos turnos sin
 * tocarse sube de prioridad: es el mecanismo que hace que el pasado vuelva.
 *
 * Funciones puras salvo la clase, que mantiene estado serializable.
 *
 * Dependencias: config/ai.config.js, Logger, utils/text.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { CONTEXTO } from '../config/ai.config.js';
import { COTAS_IA } from '../config/balance.config.js';
import { crearCanal } from '../core/Logger.js';
import { limpiar, truncar } from '../utils/text.js';
import { idEstable, TIPO } from '../utils/id.js';
import { crearRegistro, anotar, migrarRegistro } from './narrador/Canon.js';

const log = crearCanal('ai');

/* ═══════════════════════════════════════════════════════════════════════════
   TIPOS DE HILO
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Categorías de hilo narrativo abierto.
 *
 * `urgencia` es cuántos turnos tarda en volverse apremiante. Una promesa pesa
 * antes que un misterio: el jugador dio su palabra y el mundo lo recuerda.
 */
export const TIPOS_HILO = Object.freeze({
  promesa: { nombre: 'promesa', urgencia: 12, peso: 3 },
  deuda: { nombre: 'deuda', urgencia: 15, peso: 3 },
  amenaza: { nombre: 'amenaza', urgencia: 8, peso: 4 },
  misterio: { nombre: 'misterio', urgencia: 25, peso: 2 },
  relacion: { nombre: 'relación', urgencia: 20, peso: 2 },
  objeto: { nombre: 'objeto', urgencia: 30, peso: 1 },
  lugar: { nombre: 'lugar', urgencia: 30, peso: 1 },
});

/* ═══════════════════════════════════════════════════════════════════════════
   ALMACÉN
   ═══════════════════════════════════════════════════════════════════════════ */

export class MemoryStore {
  /**
   * @param {Object} [inicial] Estado previo, al cargar una partida.
   */
  constructor(inicial = {}) {
    /**
     * Turnos recientes en formato compacto.
     * @type {Array<{turno: number, accion: string, resumen: string, mood: string}>}
     */
    this.historial = inicial.historial ?? [];

    /**
     * Resúmenes de capítulo.
     * @type {Array<{desde: number, hasta: number, texto: string}>}
     */
    this.resumenes = inicial.resumenes ?? [];

    /**
     * Hechos permanentes.
     * @type {Array<{id: string, texto: string, turno: number, peso: number, veces: number}>}
     */
    this.hechos = inicial.hechos ?? [];

    /**
     * Hilos narrativos abiertos.
     * @type {Array<Object>}
     */
    this.hilos = inicial.hilos ?? [];

    /** Turno del último resumen generado. */
    this.ultimoResumen = inicial.ultimoResumen ?? 0;

    /**
     * Lo que está pasando AHORA y el director tiene que saber para este turno.
     *
     * Nueve sistemas —encuentros, viaje, misiones, facciones, combate,
     * consecuencias— preparaban este material y lo publicaban en el bus con
     * `memory:context`. No lo escuchaba nadie. Se tiraba entero.
     *
     * Eso explica por qué el director narraba tan flojo, y no por ser
     * procedural: es que le llegaba la escena vacía. El sistema de encuentros
     * redactaba «ENCUENTRO EN CURSO: … Vías posibles: negociar, huir, pelear»
     * y el narrador, sin verlo, contestaba «Sigues adelante».
     *
     * No se guarda en la partida: es de este turno y del siguiente a lo sumo.
     * Por eso no aparece en `serializar()`.
     *
     * @type {Array<{texto: string, temporal: boolean}>}
     */
    this.contextoEscena = [];

    /**
     * El canon: lo que el jugador ha afirmado que existe.
     *
     * Personas, lugares y cosas que él ha nombrado al escribir sus turnos, con
     * lo que dijo de cada uno. Es la parte del mundo que no venía de fábrica.
     *
     * Esto es lo que da concordancia. El director procedural no inventa sobre
     * el canon: solo repite lo que hay aquí. Si Verros es «capitán» y «quemó
     * la forja», lo seguirá siendo en el turno cuarenta, porque el narrador no
     * tiene otro sitio de donde sacarlo.
     *
     * Sí se guarda en la partida: sin esto, la historia que el jugador ha ido
     * construyendo se perdería al recargar, que es exactamente el problema que
     * viene a resolver.
     *
     * @type {Array<{nombre: string, tipo: string, rasgos: string[],
     *   notas: string[], turno: number, menciones: number}>}
     */
    this.canon = inicial.canon ?? [];

    /**
     * Las ediciones deliberadas de canon del jugador, íntegras, y los hechos
     * atómicos que salen de ellas, con su versión y procedencia (ver
     * `ai/narrador/Canon.js`). No se podan ni se recortan. Un registro de
     * la versión 1 se migra aquí, al cargar, sin perder ninguna edición.
     * @type {{version: number, ediciones: Array<Object>, hechos: Array<Object>}}
     */
    this.registroCanon = migrarRegistro(inicial.registroCanon ?? null);

    /**
     * Lo que un modelo quiso recordar. NO son hechos del mundo: van aparte,
     * con su procedencia, y ningún PNJ los cuenta como algo que pasó.
     * @type {Array<{texto: string, turno: number}>}
     */
    this.notasNarrador = inicial.notasNarrador ?? [];
    // Partidas de antes: las notas del narrador estaban entre los hechos.
    if (this.hechos.some((h) => h.categoria === 'narrador')) {
      this.notasNarrador.push(...this.hechos.filter((h) => h.categoria === 'narrador').map((h) => ({ texto: h.texto, turno: h.turno ?? 0 })));
      this.hechos = this.hechos.filter((h) => h.categoria !== 'narrador');
    }

    // Partidas de antes: las ediciones vivían entre los hechos, recortadas a
    // 200 caracteres y podables. Se pasan al registro y se quitan de los
    // hechos. Lo recortado o podado entonces no está en el guardado: no se
    // puede recuperar, pero se dice cuáles llegan cortadas.
    const viejas = this.hechos.filter((h) => h.categoria === 'canon_jugador');
    if (viejas.length && !this.registroCanon.ediciones.length) {
      const cortadas = [];
      for (const h of viejas.sort((a, b) => (a.turno ?? 0) - (b.turno ?? 0))) {
        this.registroCanon = anotar(this.registroCanon, h.texto, { turno: h.turno ?? 0, fuente: 'jugador (migrado)' }).registro;
        if (/…$/u.test(h.texto) || h.texto.length >= 199) cortadas.push(h.texto);
      }
      this.registroCanon.migracion = {
        desde: 0,
        ediciones: viejas.length,
        avisos: [
          ...cortadas.map((t) => `Llegó recortada a 200 caracteres y el resto no está en el guardado: «${t}».`),
          'Las ediciones que la memoria podó antes de esta versión no están en el guardado y no se pueden recuperar.',
        ],
      };
    }
    if (viejas.length) this.hechos = this.hechos.filter((h) => h.categoria !== 'canon_jugador');
  }

  /* ═══════════════════════════════════════════════════════════════════════
     CANON
     ═══════════════════════════════════════════════════════════════════════ */

  /**
   * Registra algo que el jugador ha nombrado, o lo enriquece si ya existía.
   *
   * **Nunca sustituye, siempre suma.** Un rasgo registrado no se borra ni se
   * cambia: si el jugador llamó capitán a Verros, capitán se queda. Lo nuevo
   * se añade al lado. Esa es toda la regla de concordancia, y es deliberado
   * que sea tan simple: un sistema que decide cuándo contradecir lo anterior
   * es un sistema que acabará contradiciendo al jugador.
   *
   * @param {Object} entidad Lo que devuelve `Cronica.leerTurno`.
   * @param {number} turno
   * @returns {{nuevo: boolean, entrada: Object}}
   */
  registrarCanon(entidad, turno = 0) {
    const nombre = String(entidad?.nombre ?? '').trim();
    if (!nombre) return { nuevo: false, entrada: null };

    const clave = nombre.toLowerCase();
    const existente = this.canon.find((c) => c.nombre.toLowerCase() === clave);

    if (existente) {
      existente.menciones += 1;

      for (const r of entidad.rasgos ?? []) {
        if (!existente.rasgos.includes(r)) existente.rasgos.push(r);
      }
      if (entidad.nota && !existente.notas.includes(entidad.nota)) {
        existente.notas.push(entidad.nota);
      }

      return { nuevo: false, entrada: existente };
    }

    const entrada = {
      nombre,
      tipo: entidad.tipo ?? 'persona',
      rasgos: [...(entidad.rasgos ?? [])],
      notas: entidad.nota ? [entidad.nota] : [],
      turno,
      menciones: 1,
    };

    this.canon.push(entrada);

    // Sin techo: es la historia del jugador, y borrar lo menos mencionado
    // era perderla. Lo que no quepa en una petición lo decide la proyección
    // de cada turno, que además dice qué se queda fuera.

    return { nuevo: true, entrada };
  }

  /**
   * Lo que el juego sabe de un nombre, o null.
   *
   * @param {string} nombre
   * @returns {Object|null}
   */
  deCanon(nombre) {
    const clave = String(nombre ?? '').toLowerCase();
    return this.canon.find((c) => c.nombre.toLowerCase() === clave) ?? null;
  }

  /**
   * Lo más presente del canon, para que el director pueda traerlo de vuelta.
   *
   * Se ordena por menciones y no por recencia: lo que el jugador repite es lo
   * que le importa, y eso es lo que merece volver a la escena.
   *
   * @param {string} [tipo] Filtra por persona, lugar o cosa.
   * @param {number} [limite]
   * @returns {Array<Object>}
   */
  canonDestacado(tipo = null, limite = 4) {
    return this.canon
      .filter((c) => !tipo || c.tipo === tipo)
      .sort((a, b) => b.menciones - a.menciones || b.turno - a.turno)
      .slice(0, limite);
  }

  /* ═══════════════════════════════════════════════════════════════════════
     CONTEXTO DE ESCENA
     ═══════════════════════════════════════════════════════════════════════ */

  /**
   * Apunta algo que el director debe tener delante al narrar.
   *
   * @param {string} texto
   * @param {Object} [opciones]
   * @param {boolean} [opciones.temporal] Si se descarta tras usarse.
   * @returns {boolean} Si se apuntó (los duplicados se ignoran).
   */
  anotarContexto(texto, { temporal = true, lugar = null } = {}) {
    const limpio = limpiar(String(texto ?? ''));
    if (!limpio) return false;
    if (this.contextoEscena.some((c) => c.texto === limpio)) return false;

    this.contextoEscena.push({ texto: limpio, temporal: Boolean(temporal), lugar });

    // Techo bajo a propósito: si llegan doce cosas a la vez, las primeras ya
    // no son «lo que está pasando ahora», son ruido.
    if (this.contextoEscena.length > 6) this.contextoEscena.shift();

    return true;
  }

  /**
   * Lo apuntado para esta escena, en orden de llegada.
   *
   * @returns {string[]}
   */
  contextoDeEscena() {
    return this.contextoEscena.map((c) => c.texto);
  }

  /**
   * Descarta lo temporal. Se llama cuando el turno ya se ha narrado.
   *
   * @returns {void}
   */
  consumirContexto() {
    this.contextoEscena = this.contextoEscena.filter((c) => !c.temporal);
  }

  /**
   * Quita lo temporal que ya no vale (`seQueda` decide). Lo apuntado espera
   * al siguiente turno narrado, y entre medias el jugador puede irse o la
   * gente marcharse.
   *
   * @param {(c: {texto: string, temporal: boolean, lugar: ?string}) => boolean} seQueda
   * @returns {void}
   */
  podarContexto(seQueda) {
    this.contextoEscena = this.contextoEscena.filter((c) => !c.temporal || seQueda(c));
  }

  /* ═══════════════════════════════════════════════════════════════════════
     REGISTRO DE TURNOS
     ═══════════════════════════════════════════════════════════════════════ */

  /**
   * Registra un turno en el historial.
   *
   * @param {Object} turno
   * @param {number} turno.numero
   * @param {string} turno.accion Lo que hizo el jugador.
   * @param {string} turno.narracion Lo que respondió el director.
   * @param {string} [turno.mood]
   * @param {Object} [turno.tirada]
   */
  registrarTurno(turno) {
    this.historial.push({
      turno: turno.numero,
      accion: truncar(limpiar(turno.accion ?? ''), 120),
      resumen: this._comprimirNarracion(turno.narracion ?? ''),
      mood: turno.mood ?? 'neutro',
      exito: turno.tirada?.exito ?? null,
    });

    // El historial se poda por antigüedad; lo antiguo ya está en los resúmenes.
    const tope = CONTEXTO.turnosIntegros + CONTEXTO.turnosResumidos;
    if (this.historial.length > tope) {
      this.historial = this.historial.slice(-tope);
    }
  }

  /**
   * Comprime una narración larga a su primera frase útil.
   *
   * No se guarda el texto entero: el historial es para que el director recuerde
   * QUÉ pasó, no para releerlo.
   *
   * @param {string} narracion
   * @returns {string}
   * @private
   */
  _comprimirNarracion(narracion) {
    const texto = limpiar(narracion);
    if (texto.length <= 160) return texto;

    // Se corta por la primera frase completa que supere los 60 caracteres.
    const frases = texto.split(/(?<=[.!?])\s+/);
    let acumulado = '';

    for (const frase of frases) {
      acumulado += (acumulado ? ' ' : '') + frase;
      if (acumulado.length >= 60) break;
    }

    return truncar(acumulado, 160);
  }

  /* ═══════════════════════════════════════════════════════════════════════
     HECHOS
     ═══════════════════════════════════════════════════════════════════════ */

  /**
   * Registra un hecho permanente.
   *
   * Si ya existe uno equivalente, se refuerza en vez de duplicarse. Que el
   * director repita un hecho significa que le importa, y eso sube su peso.
   *
   * @param {string} texto
   * @param {Object} [opciones]
   * @param {number} [opciones.turno=0]
   * @param {number} [opciones.peso=1]
   * @param {string} [opciones.categoria]
   * @returns {boolean} true si se añadió como hecho nuevo.
   */
  recordar(texto, opciones = {}) {
    const limpio = limpiar(texto);
    if (!limpio || limpio.length < 8) return false;

    const id = idEstable(limpio.toLowerCase(), TIPO.EVENTO);
    const existente = this.hechos.find((h) => h.id === id);

    if (existente) {
      existente.veces++;
      existente.peso = Math.min(existente.peso + 0.5, 10);
      existente.turno = opciones.turno ?? existente.turno;
      return false;
    }

    this.hechos.push({
      id,
      texto: truncar(limpio, 200),
      turno: opciones.turno ?? 0,
      peso: opciones.peso ?? 1,
      categoria: opciones.categoria ?? 'general',
      veces: 1,
    });

    this._podarHechos();
    return true;
  }

  /**
   * Registra varios hechos de una vez, respetando la cota por turno.
   * @param {string[]} textos
   * @param {Object} [opciones]
   * @returns {number} Cuántos eran nuevos.
   */
  recordarVarios(textos, opciones = {}) {
    const limitados = (textos ?? []).slice(0, COTAS_IA.memoriaPorTurno);
    let nuevos = 0;
    for (const t of limitados) {
      if (this.recordar(t, opciones)) nuevos++;
    }
    return nuevos;
  }

  /**
   * Poda los hechos menos relevantes al superar el tope.
   *
   * El criterio no es la antigüedad sino el peso combinado con las repeticiones:
   * un hecho mencionado tres veces hace cuarenta turnos importa más que uno
   * mencionado una vez el turno pasado.
   *
   * @private
   */
  _podarHechos() {
    if (this.hechos.length <= COTAS_IA.memoriaPorTurno * 40) return;

    this.hechos.sort((a, b) => (b.peso * b.veces) - (a.peso * a.veces));
    const antes = this.hechos.length;
    this.hechos = this.hechos.slice(0, CONTEXTO.hechosMax * 2);

    log.debug(`memoria podada: ${antes} → ${this.hechos.length} hechos`);
  }

  /**
   * Hechos más relevantes, para el contexto del prompt.
   * @param {number} [limite]
   * @returns {Array<Object>}
   */
  hechosRelevantes(limite = CONTEXTO.hechosMax) {
    return [...this.hechos]
      .sort((a, b) => (b.peso * b.veces) - (a.peso * a.veces))
      .slice(0, limite);
  }

  /* ═══════════════════════════════════════════════════════════════════════
     HILOS NARRATIVOS
     ═══════════════════════════════════════════════════════════════════════ */

  /**
   * Abre un hilo narrativo.
   *
   * @param {Object} datos
   * @param {string} datos.tipo Clave de TIPOS_HILO.
   * @param {string} datos.texto Descripción del hilo.
   * @param {number} datos.turno Turno de apertura.
   * @param {string} [datos.relacionadoCon] refId de PNJ, lugar o misión.
   * @returns {Object} El hilo creado.
   */
  abrirHilo(datos) {
    const id = idEstable(`${datos.tipo}:${datos.texto}`.toLowerCase(), TIPO.EVENTO);

    const existente = this.hilos.find((h) => h.id === id && !h.cerrado);
    if (existente) return existente;

    const hilo = {
      id,
      tipo: datos.tipo ?? 'misterio',
      texto: truncar(limpiar(datos.texto), 200),
      turnoApertura: datos.turno ?? 0,
      turnoUltimaMencion: datos.turno ?? 0,
      relacionadoCon: datos.relacionadoCon ?? null,
      cerrado: false,
      resolucion: null,
    };

    this.hilos.push(hilo);
    log.debug(`hilo abierto (${hilo.tipo}): ${hilo.texto}`);
    return hilo;
  }

  /**
   * Marca un hilo como mencionado en este turno.
   * @param {string} id
   * @param {number} turno
   */
  tocarHilo(id, turno) {
    const hilo = this.hilos.find((h) => h.id === id);
    if (hilo) hilo.turnoUltimaMencion = turno;
  }

  /**
   * Cierra un hilo.
   * @param {string} id
   * @param {string} [resolucion]
   * @param {number} [turno]
   */
  cerrarHilo(id, resolucion, turno) {
    const hilo = this.hilos.find((h) => h.id === id);
    if (!hilo) return;

    hilo.cerrado = true;
    hilo.resolucion = resolucion ?? null;
    hilo.turnoCierre = turno ?? 0;

    // Un hilo resuelto se convierte en hecho permanente: forma parte de la
    // historia del personaje aunque ya no esté abierto.
    if (resolucion) this.recordar(resolucion, { turno, peso: 2, categoria: 'resolucion' });

    log.debug(`hilo cerrado: ${hilo.texto}`);
  }

  /**
   * Hilos abiertos ordenados por urgencia.
   *
   * La urgencia crece con los turnos sin mencionar. Es el mecanismo que hace
   * que una promesa olvidada vuelva a la superficie: cuanto más la ignoras, más
   * arriba aparece en el contexto del director.
   *
   * @param {number} turnoActual
   * @param {number} [limite=5]
   * @returns {Array<Object>}
   */
  hilosUrgentes(turnoActual, limite = 5) {
    return this.hilos
      .filter((h) => !h.cerrado)
      .map((h) => {
        const meta = TIPOS_HILO[h.tipo] ?? TIPOS_HILO.misterio;
        const silencio = turnoActual - h.turnoUltimaMencion;
        return {
          ...h,
          silencio,
          urgencia: (silencio / meta.urgencia) * meta.peso,
        };
      })
      .sort((a, b) => b.urgencia - a.urgencia)
      .slice(0, limite);
  }

  /**
   * Comprueba si conviene retomar algún hilo ahora mismo.
   *
   * @param {number} turnoActual
   * @returns {Object|null} El hilo más apremiante, o null.
   */
  hiloParaRetomar(turnoActual) {
    const urgentes = this.hilosUrgentes(turnoActual, 3);
    const primero = urgentes[0];

    // Umbral 1.0 significa que ya ha pasado el tiempo de urgencia declarado.
    return primero && primero.urgencia >= 1 ? primero : null;
  }

  /* ═══════════════════════════════════════════════════════════════════════
     RESÚMENES
     ═══════════════════════════════════════════════════════════════════════ */

  /**
   * Comprueba si toca generar un resumen de capítulo.
   * @param {number} turnoActual
   * @returns {boolean}
   */
  tocaResumir(turnoActual) {
    return turnoActual - this.ultimoResumen >= CONTEXTO.intervaloResumen;
  }

  /**
   * Turnos pendientes de resumir.
   * @returns {Array<Object>}
   */
  turnosParaResumir() {
    return this.historial.filter((t) => t.turno > this.ultimoResumen);
  }

  /**
   * Registra un resumen de capítulo.
   *
   * @param {string} texto
   * @param {number} desde
   * @param {number} hasta
   */
  guardarResumen(texto, desde, hasta) {
    this.resumenes.push({
      desde,
      hasta,
      texto: truncar(limpiar(texto), CONTEXTO.resumenMax),
    });

    this.ultimoResumen = hasta;

    // Los resúmenes también se podan: solo importan los últimos capítulos.
    if (this.resumenes.length > 8) this.resumenes = this.resumenes.slice(-8);

    log.info(`resumen de capítulo guardado (turnos ${desde}-${hasta})`);
  }

  /**
   * Genera un resumen mecánico cuando el proveedor no puede hacerlo.
   *
   * No es tan bueno como el de un modelo de lenguaje, pero conserva lo esencial:
   * qué hizo el jugador y cómo le fue.
   *
   * @param {Array<Object>} turnos
   * @returns {string}
   */
  resumenMecanico(turnos) {
    if (!turnos.length) return '';

    const acciones = turnos
      .filter((t) => t.accion)
      .map((t) => t.accion)
      .slice(0, 8);

    const exitos = turnos.filter((t) => t.exito === true).length;
    const fallos = turnos.filter((t) => t.exito === false).length;

    const partes = [];

    if (acciones.length) {
      partes.push(`El personaje: ${acciones.join('; ')}.`);
    }
    if (exitos + fallos > 0) {
      partes.push(`De ${exitos + fallos} intentos, ${exitos} salieron bien.`);
    }

    // El tono predominante da color al resumen.
    const moods = turnos.map((t) => t.mood).filter(Boolean);
    if (moods.length) {
      const cuenta = {};
      for (const m of moods) cuenta[m] = (cuenta[m] ?? 0) + 1;
      const dominante = Object.entries(cuenta).sort((a, b) => b[1] - a[1])[0][0];
      if (dominante !== 'neutro') partes.push(`El tono general fue de ${dominante}.`);
    }

    return partes.join(' ');
  }

  /* ═══════════════════════════════════════════════════════════════════════
     COMPOSICIÓN DE CONTEXTO
     ═══════════════════════════════════════════════════════════════════════ */

  /**
   * Bloque de memoria listo para el prompt.
   *
   * @param {number} turnoActual
   * @param {Object} [opciones]
   * @param {number} [opciones.maxCaracteres]
   * @returns {string}
   */
  paraPrompt(turnoActual, opciones = {}) {
    const max = opciones.maxCaracteres ?? 2000;
    const bloques = [];

    // ─── Resúmenes de capítulos anteriores ─────────────────────────────
    if (this.resumenes.length) {
      const ultimos = this.resumenes.slice(-2);
      bloques.push(`LO OCURRIDO ANTES:\n${ultimos.map((r) => r.texto).join('\n')}`);
    }

    // ─── Hechos permanentes ────────────────────────────────────────────
    const hechos = this.hechosRelevantes(12);
    if (hechos.length) {
      bloques.push(`RECUERDA:\n${hechos.map((h) => `· ${h.texto}`).join('\n')}`);
    }

    // ─── Hilos abiertos ────────────────────────────────────────────────
    const hilos = this.hilosUrgentes(turnoActual, 4);
    if (hilos.length) {
      const lineas = hilos.map((h) => {
        const meta = TIPOS_HILO[h.tipo] ?? TIPOS_HILO.misterio;
        const nota = h.urgencia >= 1.5
          ? ' [lleva mucho sin tocarse: conviene retomarlo]'
          : '';
        return `· (${meta.nombre}) ${h.texto}${nota}`;
      });
      bloques.push(`HILOS ABIERTOS:\n${lineas.join('\n')}`);
    }

    let texto = bloques.join('\n\n');

    // Si excede el presupuesto, se sacrifican primero los resúmenes: los hechos
    // y los hilos son más accionables.
    if (texto.length > max && bloques.length > 1) {
      texto = bloques.slice(1).join('\n\n');
    }

    return truncar(texto, max);
  }

  /**
   * Turnos recientes para el contexto, los últimos íntegros.
   *
   * @param {number} [cuantos]
   * @returns {string}
   */
  turnosRecientes(cuantos = CONTEXTO.turnosIntegros) {
    const recientes = this.historial.slice(-cuantos);
    if (!recientes.length) return '';

    const lineas = recientes.map((t) => {
      const partes = [];
      if (t.accion) partes.push(`Jugador: ${t.accion}`);
      if (t.resumen) partes.push(`Ocurrió: ${t.resumen}`);
      return partes.join(' → ');
    });

    return `TURNOS RECIENTES:\n${lineas.join('\n')}`;
  }

  /* ═══════════════════════════════════════════════════════════════════════
     PERSISTENCIA
     ═══════════════════════════════════════════════════════════════════════ */

  /**
   * Estado serializable para el guardado.
   * @returns {Object}
   */
  serializar() {
    return {
      historial: this.historial,
      resumenes: this.resumenes,
      hechos: this.hechos,
      hilos: this.hilos,
      ultimoResumen: this.ultimoResumen,
      canon: this.canon,
      registroCanon: this.registroCanon,
      notasNarrador: this.notasNarrador,
    };
  }

  /**
   * Apunta una nota del narrador (lo que un modelo quiso recordar).
   * @param {string} texto
   * @param {number} turno
   */
  anotarNarrador(texto, turno = 0) {
    const limpio = limpiar(String(texto ?? ''));
    if (!limpio || this.notasNarrador.some((n) => n.texto === limpio)) return;
    this.notasNarrador.push({ texto: truncar(limpio, 200), turno });
    if (this.notasNarrador.length > 30) this.notasNarrador = this.notasNarrador.slice(-30);
  }

  /**
   * Restaura desde un guardado.
   * @param {Object} datos
   * @returns {MemoryStore}
   */
  static restaurar(datos) {
    return new MemoryStore(datos ?? {});
  }

  /** Vacía la memoria. Se usa al empezar una partida nueva. */
  limpiar() {
    this.historial = [];
    this.resumenes = [];
    this.hechos = [];
    this.hilos = [];
    this.ultimoResumen = 0;
    this.canon = [];
    this.registroCanon = crearRegistro();
    this.notasNarrador = [];
  }

  /** Radiografía, para depuración. */
  inspeccionar() {
    return {
      turnos: this.historial.length,
      resumenes: this.resumenes.length,
      hechos: this.hechos.length,
      hilosAbiertos: this.hilos.filter((h) => !h.cerrado).length,
      hilosCerrados: this.hilos.filter((h) => h.cerrado).length,
      ultimoResumen: this.ultimoResumen,
    };
  }
}

export default MemoryStore;
