/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCANVEIL · ai/narrador/Verificador.js
 * ---------------------------------------------------------------------------
 * Lo que narra un modelo, contrastado con lo que el motor sabe.
 *
 * Un modelo de lenguaje escribe bien y se equivoca con aplomo: pone a hablar
 * a quien no está, da por hecho que el jugador acepta, convierte un fracaso
 * en éxito, se inventa una espada o cambia la hora. Nada de eso puede entrar
 * en la partida.
 *
 * Aquí se busca cada contradicción concreta contra la instantánea del turno
 * y se repara EN LOCAL, sin gastar otra petición: se quita la frase que
 * contradice. Si lo que queda no se sostiene (demasiado corto, o la
 * contradicción es el turno entero), se devuelve como no reparable y quien
 * llama decide: pedir una corrección o narrar con el procedural.
 *
 * No es un detector perfecto: busca patrones concretos. Lo que no reconoce
 * no lo corrige; por eso los efectos nunca dependen del texto (ver
 * `Autorizacion.js`): una frase que se cuele no cambia el estado.
 *
 * Funciones puras.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { sinAcentos } from '../../utils/text.js';

const llano = (t) => sinAcentos(String(t ?? '').toLowerCase());
const NOMBRE = '(\\p{Lu}\\p{Ll}+(?:\\s\\p{Lu}\\p{Ll}+)?)';
const VERBO_HABLA = '(?:dice|responde|contesta|susurra|murmura|gruñe|añade|pregunta|grita|replica|suelta|masculla|insiste|repite)';

/** Palabras que abren frase y no son nombres. */
const NO_NOMBRES = new Set(['el', 'la', 'los', 'las', 'un', 'una', 'tu', 'tus', 'su', 'sus', 'mi', 'nadie', 'alguien', 'todos', 'entonces', 'luego', 'ahora', 'aqui', 'alli', 'si', 'no', 'y', 'pero', 'cuando', 'mientras', 'tras', 'desde', 'hasta', 'con', 'sin', 'por', 'para']);

/** Frases en que el narrador decide por el jugador. */
const DECIDE = [
  ['aceptas', /\b(?:acept)/], ['decides', /\b(?:decid)/], ['prometes', /\b(?:promet)/], ['juras', /\b(?:jur)/],
  ['entregas', /\b(?:entreg)/], ['pagas', /\b(?:pag)/], ['compras', /\b(?:compr)/], ['vendes', /\b(?:vend)/],
  ['te rindes', /\b(?:rind)/], ['confiesas', /\b(?:confies)/], ['te marchas', /\b(?:march|voy|me voy|me alejo|me largo)/],
  ['atacas', /\b(?:atac|golpe|ataco)/], ['le das', /\b(?:doy|le doy|entrego)/],
];
const EMOCION_IMPUESTA = /\b(?:sientes que|piensas que|te das cuenta de que|decides que|te enamoras|sientes un escalofrio)\b/;

/* ─── Las cuentas son del motor ──────────────────────────────────────────────
   Vida, daño, XP, nivel, oro, objetos, misiones, lugar y reloj los cambia el
   motor, y los efectos de un modelo nunca los tocan (`Autorizacion.js`). Pero
   una frase como «te curas del todo» o «ganas 100 XP» engaña al jugador
   aunque el estado no cambie: aquí se quita. Una cifra mecánica vale si es la
   del estado o la que el motor produjo este turno; una cantidad de escena
   («los dos lobos») no es mecánica. */

/** Números escritos con letra (sin «un/una/one»: son artículos). */
const NUMEROS = Object.freeze({
  dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, quince: 15,
  veinte: 20, treinta: 30, cuarenta: 40, cincuenta: 50, cien: 100, mil: 1000,
  two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, fifteen: 15,
  twenty: 20, thirty: 30, forty: 40, fifty: 50, hundred: 100,
});
const NUM = `(\\d+|${Object.keys(NUMEROS).join('|')})`;
/** Unidades mecánicas, y de qué cuenta del motor sale su valor. */
const UNIDADES = [
  ['vida', '(?:puntos? de (?:vida|salud|golpe)|de (?:vida|salud)|pv|ps|hp|health|hit points?)'],
  ['dano', '(?:puntos? de dano|de dano|danos?|damage)'],
  ['xp', '(?:puntos? de (?:experiencia|xp)|de experiencia|experiencia|xp|pe|experience)'],
  ['oro', '(?:monedas?(?: de (?:oro|plata|cobre))?|piezas de oro|de oro|gold(?: coins?)?|coins?)'],
  ['objetos', '(?:pocion(?:es)?|flechas?|raciones?|potions?|arrows?|rations?)'],
];
const CIFRA_UNIDAD = UNIDADES.map(([clase, u]) => [clase, new RegExp(`\\b${NUM}\\s+${u}\\b`, 'g')]);
// El nivel, solo el del personaje («el río sube al nivel dos» no es una cuenta).
const CIFRA_NIVEL = new RegExp(`\\b(?:subes|alcanzas|llegas|eres|estas|pasas|reach|you are now|level up to)\\b[^.]{0,25}?\\b(?:nivel|level)\\s+${NUM}\\b`, 'g');
const CIFRA_QUEDA = new RegExp(`\\b(?:te|le|les|os) quedan?\\s+${NUM}\\s+puntos?\\b`, 'g');
// Oro y objetos con cifra solo son cuentas si son del personaje: una oferta,
// un precio o las flechas de un arquero son escena.
const POSESION = /\b(?:recibes|ganas|te da|te dan|te paga|te pagan|te entrega|obtienes|tienes|te quedan?|llevas|guardas|you (?:receive|gain|get|have|earn)|you'?ve got)\b/;
const CURA = /\b(?:te curas|te sanas|te recuperas del todo|curad[oa] del todo|sanad[oa] del todo|recuperas (?:toda )?(?:la|tu) (?:vida|salud)|(?:sigues|estas|quedas) con toda (?:la|tu) (?:vida|salud)|(?:estas|te sientes|quedas|te encuentras) como nuev[oa]|tus heridas (?:se cierran|sanan)|tu herida se cierra|sin un rasguno|te encuentras perfectamente|fully healed|you heal|you are healed|your wounds? (?:close|heal)|back to full health|full health|all your health|good as new)\b/;
const MUERE = /\b(?:muere|mueren|murio|murieron|cae muert[oa]|caen muert[oa]s|cae sin vida|queda sin vida|yace muert[oa]|esta muert[oa]|matas|acabas con|dies|died|is dead|falls dead|drops dead|you kill|is slain|was slain)\b/;
// Solo de seres: «la tarde muere» o «el fuego muere» no son cuentas.
const SER = /\b(?:lobos?|bandid[oa]s?|guardias?|enemig[oa]s?|criaturas?|bestias?|osos?|jabalies?|jabali|aranas?|goblins?|orcos?|soldados?|hombres?|mujer(?:es)?|ladron(?:es)?|monstruos?|wolf|wolves|bandits?|guards?|enem(?:y|ies)|creatures?|beasts?|bears?|soldiers?|man|men|woman|women|thief|thieves|monsters?)\b/;
const SUBE_NIVEL = /\b(?:subes de nivel|subes un nivel|alcanzas el \w+ nivel|levels? up)\b/;
const ADQUIERE = /\b(?:recoges|coges|te haces con|te quedas con|te llevas|te guardas|guardas|ahora llevas|ahora tienes|you pick up|you take|you receive|you get|you obtain|you loot)\s+(?:un|una|unos|unas|el|la|los|las|a|an|the|some)\s+(?:\w+\s+)?(OBJ)/;
const HALLA = /\b(?:encuentras|hallas|you find)\s+(?:un|una|unos|unas|el|la|los|las|a|an|the|some)\s+(?:\w+\s+)?(OBJ)/;
const OBJ = '(espada|daga|hacha|maza|arco|ballesta|flecha|escudo|armadura|cota|casco|pocion|anillo|amuleto|moneda|bolsa|llave|mapa|libro|pergamino|gema|joya|cuchillo|lanza|baston|sword|longsword|dagger|axe|mace|bow|crossbow|arrow|shield|armou?r|helmet|potion|ring|amulet|coin|purse|key|map|book|scroll|gem|jewel|knife|spear|staff)';
const OBJETO_ADQUIRIDO = new RegExp(ADQUIERE.source.replace('(OBJ)', OBJ));
const OBJETO_HALLADO = new RegExp(HALLA.source.replace('(OBJ)', OBJ));
const MISION_CUMPLIDA = /\b(?:(?:has completado|completas|has cumplido|cumples|terminas|has terminado)\s+(?:la|tu|el|esta)\s+(?:mision|encargo|tarea)|(?:mision|encargo|tarea)\s+(?:(?:ha |queda |esta )?(?:completad[oa]|cumplid[oa]|terminad[oa]|resuelt[oa]))|(?:quest|mission)\s+(?:complete|completed|done)|you (?:have )?(?:complete|completed|finish|finished) (?:the|your) (?:quest|mission))\b/;
// Un salto de reloj impersonal: «pasan tres horas», «al día siguiente».
// «El herrero pasa horas mirando el río» no lo es.
const PASA_TIEMPO = /(?:^|[,;:]\s*)(?:y\s+)?(?:pasan|pasa|transcurren|transcurre)\s+(?:\w+\s+)?(?:horas?|dias?|semanas?)\b|\b(?:al cabo de\s+(?:\w+\s+){0,2}(?:horas?|dias?)|horas (?:despues|mas tarde)|al dia siguiente|a la manana siguiente|(?:\w+\s+)?(?:hours?|days?)\s+(?:pass|later|go by)|the next (?:day|morning))\b/;
const ESPERA = /\b(?:espero|esperar|espera|aguardo|descanso|descansar|duermo|dormir|acampo|hasta que|paso la noche|me siento|me quedo|wait|rest|sleep)\b/;

/**
 * Qué cifras valen para cada clase de unidad, según el motor: el estado y lo
 * que el motor ha escrito este turno. Las del jugador no: «quiero 100 XP» no
 * hace verdad «ganas 100 XP».
 */
function permitidas(cuentas) {
  const t = cuentas ?? {};
  const n = (...xs) => xs.flat().filter((x) => Number.isFinite(Number(x))).map((x) => Math.round(Number(x)));
  const delTurno = n(t.turno ?? []);
  const vidas = n(t.vida?.actual, t.vida?.max, t.mana?.actual, t.mana?.max, (t.combatientes ?? []).flatMap((c) => [c.actual, c.max]));
  return {
    vida: new Set([...vidas, ...delTurno]),
    dano: new Set(delTurno),
    xp: new Set([...n(t.xp), ...delTurno]),
    nivel: new Set(n(t.nivel)),
    oro: new Set([...n(t.oro), ...delTurno]),
    objetos: new Set([...n(t.cantidades ?? []), ...delTurno]),
    queda: new Set([...vidas, ...delTurno]),
  };
}
const aNumero = (s) => (/^\d+$/.test(s) ? Number(s) : NUMEROS[s]);

/**
 * ¿Deja ver este texto un secreto? Se compara por raíces (las cinco primeras
 * letras de las palabras largas): «escondidas» delata a «esconde».
 *
 * @param {string} texto
 * @param {string} secreto
 * @returns {boolean}
 */
export function pareceSecreto(texto, secreto) {
  const raices = [...new Set(llano(secreto).split(/[^\p{L}]+/u).filter((w) => w.length >= 5).map((w) => w.slice(0, 5)))];
  if (raices.length < 3) return false;
  const t = llano(texto);
  return raices.filter((r) => t.includes(r)).length / raices.length >= 0.55;
}

/**
 * @typedef {Object} Problema
 * @property {string} tipo
 * @property {boolean} grave Si no se puede quitar, el turno no vale.
 * @property {string} frase La frase que lo contiene.
 * @property {string} [detalle]
 */

/** Parte en frases conservando los saltos de línea como frases propias. */
export function partirFrases(story) {
  return String(story ?? '')
    .split(/\n+/)
    .flatMap((linea) => linea.match(/[^.!?…]+(?:[.!?…]+[»"”]?|$)/gu) ?? [linea])
    .map((f) => f.trim())
    .filter(Boolean);
}

/** Similitud de dos frases por trigramas de palabras. @private */
function parecido(a, b) {
  const tri = (t) => {
    const p = llano(t).replace(/[^\p{L}\s]/gu, ' ').split(/\s+/).filter(Boolean);
    const s = new Set();
    for (let i = 0; i + 2 < p.length; i += 1) s.add(p.slice(i, i + 3).join(' '));
    return s;
  };
  const x = tri(a);
  const y = tri(b);
  if (!x.size || !y.size) return llano(a).trim() === llano(b).trim() ? 1 : 0;
  let comun = 0;
  for (const t of x) if (y.has(t)) comun += 1;
  return comun / Math.min(x.size, y.size);
}

/** Quién habla en una frase, si se atribuye. @private */
export function hablantesDe(frase) {
  const quien = new Set();
  const pat = [
    new RegExp(`^${NOMBRE}\\s*:\\s*[«"“—-]`, 'u'),
    new RegExp(`[»"”],?\\s*${VERBO_HABLA}\\s+${NOMBRE}`, 'u'),
    new RegExp(`${NOMBRE}\\s+${VERBO_HABLA}\\s*[:,]?\\s*[«"“]`, 'u'),
  ];
  for (const p of pat) {
    const m = frase.match(p);
    if (m && !NO_NOMBRES.has(llano(m[1]).split(' ')[0])) quien.add(m[1]);
  }
  return [...quien];
}

/**
 * Busca contradicciones entre la narración y lo que sabe el motor.
 *
 * @param {string} story
 * @param {Object} c Contexto de verificación.
 * @param {string} c.jugador Nombre del personaje.
 * @param {string} c.texto Lo que escribió el jugador.
 * @param {Array<{nombre: string, vivo?: boolean}>} c.presentes
 * @param {string[]} [c.ausentes] Nombres conocidos que no están.
 * @param {string[]} [c.muertos]
 * @param {string[]} [c.nuevos] Nombres que el modelo presenta como pnj_nuevo.
 * @param {Object|null} [c.tirada] {exito}
 * @param {boolean} [c.negativa]
 * @param {string} [c.lugar] Nombre del lugar actual.
 * @param {string[]} [c.lugares] Nombres de otros lugares conocidos.
 * @param {string} [c.franja] manana|mediodia|tarde|noche|madrugada…
 * @param {string[]} [c.secretos]
 * @param {string[]} [c.inexistentes] Palabras que el motor dice que no hay.
 * @param {string[]} [c.caidos] Combatientes caídos.
 * @param {string[]} [c.yaContado]
 * @param {Object} [c.cuentas] Las cuentas del motor (ver `cuentasDelMotor` en
 *   FiltroModelo): vida, mana, xp, nivel, oro, cantidades, combatientes y las
 *   cifras que el motor produjo este turno (`turno`).
 * @returns {Problema[]}
 */
export function verificar(story, c) {
  const problemas = [];
  const jugadorLlano = llano(c.texto);
  const vivos = new Set((c.presentes ?? []).filter((p) => p.vivo !== false).map((p) => llano(p.nombre).split(' ')[0]));
  const nuevos = new Set((c.nuevos ?? []).map((n) => llano(n).split(' ')[0]));
  const ausentes = new Set((c.ausentes ?? []).map((n) => llano(n).split(' ')[0]));
  const muertos = new Set((c.muertos ?? []).map((n) => llano(n).split(' ')[0]));
  const nombreJugador = llano(c.jugador).split(' ')[0];
  const citasJugador = (String(c.texto ?? '').match(/«[^»]*»|"[^"]*"|“[^”]*”/gu) ?? []).map((q) => llano(q.slice(1, -1)).trim());

  for (const frase of partirFrases(story)) {
    // Lo que dice un PNJ entre comillas no es narración: «Si pagas, pasas»
    // no decide nada por el jugador.
    const n = llano(frase.replace(/«[^»]*»|"[^"]*"|“[^”]*”/gu, ' '));
    const anadir = (tipo, grave, detalle) => problemas.push({ tipo, grave, frase, detalle });

    // ─── Quién habla ──────────────────────────────────────────────────────
    for (const h of hablantesDe(frase)) {
      const k = llano(h).split(' ')[0];
      if (k === nombreJugador) {
        const cita = llano(frase.match(/«([^»]*)»/u)?.[1] ?? '').trim();
        if (!citasJugador.some((q) => q === cita)) anadir('palabras_del_jugador', true, `pone palabras en boca de ${h}`);
      } else if (muertos.has(k)) anadir('muerto_habla', true, `${h} está muerto`);
      else if (ausentes.has(k) && !vivos.has(k)) anadir('hablante_ausente', true, `${h} no está en escena`);
      else if (!vivos.has(k) && !nuevos.has(k)) anadir('hablante_desconocido', true, `${h} no está en escena`);
    }

    // ─── Decidir por el jugador ───────────────────────────────────────────
    for (const [verbo, suyo] of DECIDE) {
      if (new RegExp(`\\b${llano(verbo)}\\b`).test(n) && !suyo.test(jugadorLlano)) {
        anadir('decide_por_el_jugador', true, `«${verbo}» no lo ha escrito el jugador`);
        break;
      }
    }
    if (EMOCION_IMPUESTA.test(n)) anadir('emocion_impuesta', false, 'decide lo que siente o piensa');
    if (c.negativa && /\b(?:le entregas|le das|entregas|cedes|le pasas)\b/.test(n)) anadir('ignora_negativa', true, 'el jugador se negó');

    // ─── La tirada manda ──────────────────────────────────────────────────
    if (c.tirada && c.tirada.exito === false && /\b(?:lo consigues|lo logras|consigues|logras|con exito|sin problema|sin esfuerzo)\b/.test(n)) {
      anadir('contradice_tirada', true, 'la tirada fue un fracaso');
    }
    if (c.tirada && c.tirada.exito === true && /\b(?:fallas|no lo consigues|no logras|fracasas|no puedes)\b/.test(n)) {
      anadir('contradice_tirada', true, 'la tirada fue un éxito');
    }

    // ─── Cosas que el motor no ha dado ────────────────────────────────────
    if (/\b(?:recibes|obtienes|te entrega|te regala|te pone en la mano|ahora tienes|guardas en tu)\b/.test(n)) anadir('objeto_inventado', true, 'los objetos los da el motor');
    if (/\b(?:\d+|un|una|unas|dos|tres|cuatro|cinco|seis|diez|veinte|treinta|cincuenta|cien|varias|algunas|un punado de)\s+monedas?\b/.test(n) && /\b(?:recibes|te da|te paga|te pagan|ganas|te entrega|obtienes)\b/.test(n)) anadir('oro_inventado', true, 'el oro lo mueve el motor');

    // ─── Las cuentas del motor ────────────────────────────────────────────
    // Solo si el motor ha dado sus cuentas (`cuentas`): sin ellas no se
    // puede saber qué cifra es la buena.
    if (c.cuentas) {
      const ok = permitidas(c.cuentas);
      // Lo que dice un PNJ también cuenta para lo que es del personaje: un
      // «ya estás curada del todo y te has ganado 100 XP» en boca de Vervek
      // engaña igual. Precios y ofertas entre comillas no: son escena.
      const conCitas = llano(frase);
      const vistas = new Set();
      const cifra = (clase, crudo) => {
        const v = aNumero(crudo);
        if (v === undefined || vistas.has(`${clase}${v}`)) return;
        vistas.add(`${clase}${v}`);
        if (!ok[clase].has(v)) anadir('cifra_inventada', true, `«${crudo}» (${clase}) no es una cifra del motor`);
      };
      const delPersonaje = POSESION.test(n);
      for (const [clase, re] of CIFRA_UNIDAD) {
        if ((clase === 'oro' || clase === 'objetos') && !delPersonaje) continue;
        for (const m of (clase === 'xp' ? conCitas : n).matchAll(re)) cifra(clase, m[1]);
      }
      for (const m of conCitas.matchAll(CIFRA_NIVEL)) cifra('nivel', m[1]);
      for (const m of n.matchAll(CIFRA_QUEDA)) cifra('queda', m[1]);
      const herido = Number(c.cuentas.vida?.actual) < Number(c.cuentas.vida?.max);
      if (herido && CURA.test(conCitas)) anadir('mecanica_inventada', true, 'la vida la cura el motor, y no está llena');
      if (MUERE.test(n)) {
        // Quién muere: un ser, y caído según el motor. Si la frase nombra a
        // alguien que sigue en pie (y que no se llama igual que un caído), no vale.
        const primera = (x) => llano(x).split(' ')[0];
        const caidos = new Set([...(c.caidos ?? []), ...(c.muertos ?? [])].map(primera).filter(Boolean));
        const enPie = [...(c.presentes ?? []).filter((p) => p.vivo !== false).map((p) => p.nombre), ...(c.cuentas.combatientes ?? []).filter((x) => (x.actual ?? 1) > 0).map((x) => x.nombre)]
          .map(primera).filter((k) => k && !caidos.has(k));
        const nombraSer = SER.test(n) || [...caidos, ...enPie].some((k) => new RegExp(`\\b${k}\\b`).test(n));
        const nombraCaido = [...caidos].some((k) => new RegExp(`\\b${k}`).test(n));
        const nombraEnPie = enPie.some((k) => new RegExp(`\\b${k}\\b`).test(n));
        if (nombraSer && (!nombraCaido || nombraEnPie)) anadir('mecanica_inventada', true, 'el motor no ha dejado caído a quien la frase da por muerto');
      }
      if (SUBE_NIVEL.test(conCitas)) anadir('mecanica_inventada', true, 'el nivel lo sube el motor');
      if (MISION_CUMPLIDA.test(n)) anadir('mecanica_inventada', true, 'las misiones las cierra el motor');
      if (PASA_TIEMPO.test(n.replace(/^[^\p{L}]+/u, '')) && !ESPERA.test(jugadorLlano)) anadir('mecanica_inventada', true, 'el reloj lo mueve el motor');
    }
    // Un objeto que pasa a ser tuyo lo da el motor; uno que «encuentras», solo
    // si el motor ha resuelto un hallazgo. Lo que ya llevas o lo que el motor
    // acaba de dar este turno no es invento.
    {
      const m = n.match(OBJETO_ADQUIRIDO) ?? (c.hallazgo ? null : n.match(OBJETO_HALLADO));
      const tuyo = m && [...(c.cuentas?.objetos ?? []), llano(c.cuentas?.textoTurno ?? '')].some((x) => llano(x).includes(m[1]));
      if (m && !tuyo) anadir('objeto_inventado', true, 'los objetos los da el motor');
    }

    // ─── Dónde y cuándo ───────────────────────────────────────────────────
    for (const l of c.lugares ?? []) {
      if (llano(l) === llano(c.lugar)) continue;
      if (new RegExp(`\\b(?:llegas a|entras en|estas en|te encuentras en|alcanzas|apareces en|te plantas en|te ves en|despiertas en|you appear in|you arrive (?:at|in)|you are (?:now )?in)\\s+(?:el |la |los |las |the )?${llano(l)}\\b`).test(n)) anadir('lugar_alterado', true, `el jugador está en ${c.lugar}`);
    }
    const dia = /^(?:manana|mediodia|tarde|amanecer)$/.test(llano(c.franja));
    const noche = /^(?:noche|madrugada|anochecer)$/.test(llano(c.franja));
    if (dia && /\b(?:noche cerrada|la luna|las estrellas|anochece|a medianoche|en plena noche)\b/.test(n)) anadir('fase_horaria', false, `es ${c.franja}`);
    if (noche && /\b(?:amanece|a pleno sol|sol de mediodia|a mediodia)\b/.test(n)) anadir('fase_horaria', false, `es ${c.franja}`);

    // ─── Combate ──────────────────────────────────────────────────────────
    // El motor no tiene posiciones, coberturas ni flancos: no se narran.
    if (c.enCombate && /\b(?:(?:te cubres|se cubre|se parapeta|te parapetas|se esconde|te escondes|a cubierto) (?:tras|detras de|bajo)|flanque\w*|por el flanco|le rodea\w*|os rodean|tomas? (?:la )?posicion)\b/.test(n)) {
      anadir('geometria_inventada', false, 'el motor no tiene posiciones ni cobertura');
    }
    for (const caido of c.caidos ?? []) {
      if (new RegExp(`\\b${llano(caido)}\\b[^.]{0,40}\\b(?:ataca|golpea|lanza|embiste|muerde|dispara|carga|arremete)`).test(n)) anadir('caido_ataca', true, `${caido} ya cayó`);
    }

    // ─── Lo que no existe ─────────────────────────────────────────────────
    for (const palabra of c.inexistentes ?? []) {
      if (new RegExp(`\\b(?:el|la|los|las|un|una)\\s+${llano(palabra)}\\b`).test(n) && !/\bno hay\b|\bningun/.test(n)) anadir('hace_existir', false, `el motor dice que no hay ${palabra}`);
    }

    // ─── Secretos ─────────────────────────────────────────────────────────
    // Aquí sí cuenta lo entrecomillado: el secreto se escapa por una boca.
    if ((c.secretos ?? []).some((s) => pareceSecreto(frase, s))) anadir('secreto_filtrado', true, 'revela algo que el PNJ guarda');

    // ─── Repetición ───────────────────────────────────────────────────────
    if (frase.length >= 24 && (c.yaContado ?? []).some((y) => parecido(frase, y) >= 0.8)) anadir('repeticion', false, 'ya se contó');
  }
  return problemas;
}

/**
 * Repara en local: quita las frases con problemas. Una línea de diálogo se
 * quita entera.
 *
 * @param {string} story
 * @param {Problema[]} problemas
 * @returns {{story: string, reparable: boolean, quitadas: number}}
 */
export function repararLocal(story, problemas) {
  if (!problemas.length) return { story, reparable: true, quitadas: 0 };
  const malas = new Set(problemas.map((p) => p.frase));
  const lineas = String(story ?? '').split(/\n+/).map((linea) => {
    const frases = partirFrases(linea);
    return frases.filter((f) => !malas.has(f)).join(' ');
  }).filter((l) => l.trim());
  const nueva = lineas.join('\n');
  const quitadas = malas.size;
  // Lo que queda tiene que sostenerse: si se ha ido más de la mitad o no
  // quedan ni dos frases, no es este turno.
  const antes = partirFrases(story).length;
  const despues = partirFrases(nueva).length;
  const reparable = nueva.trim().length >= 30 && despues >= Math.max(1, Math.ceil(antes / 2));
  return { story: nueva, reparable, quitadas };
}

export default { verificar, repararLocal, partirFrases, hablantesDe };
