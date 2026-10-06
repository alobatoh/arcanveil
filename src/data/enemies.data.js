/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCANVEIL · data/enemies.data.js
 * ---------------------------------------------------------------------------
 * Bestiario base. Contenido original.
 *
 * Criaturas escritas a mano que cubren todos los grados de amenaza y todos los
 * terrenos. Bastan para una campaña completa; si se instala el volcado del SRD,
 * se añaden trescientas más automáticamente.
 *
 * Cada entrada declara:
 *   · Estadísticas de combate
 *   · Su comportamiento (`tactica`), que EnemyAI consulta para decidir
 *   · `promptLore`, para que el director sepa narrarla
 *
 * El campo `tactica` es lo que hace que un lobo no pelee como un guardia: uno
 * rodea y muerde al más débil, el otro aguanta la línea.
 *
 * Sin dependencias.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * @typedef {Object} Enemigo
 * @property {string} refId
 * @property {string} nombre
 * @property {'m'|'f'} genero
 * @property {string} plural
 * @property {string} tipo bestia|humanoide|no_muerto|aberracion|construido|elemental
 * @property {string} tamano
 * @property {string} amenaza
 * @property {number} nivel
 * @property {number} vida
 * @property {number} defensa
 * @property {number} reduccionDano
 * @property {Record<string, number>} atributos
 * @property {Array<Object>} ataques
 * @property {string} tactica
 * @property {string[]} terrenos
 * @property {string} descripcion
 * @property {string} promptLore
 */

/** @type {Record<string, Enemigo>} */
export const ENEMIGOS = Object.freeze({

  /* ═══════════════════════════════════════════════════════════════════════
     INSIGNIFICANTES Y MENORES
     ═══════════════════════════════════════════════════════════════════════ */

  // Ficha mínima para pelear con un civil de la escena (Korsa, Cormir…), que
  // no tiene ficha de enemigo. No sale en ninguna tabla (sin terrenos): solo
  // la usa `ActionRouter._atacarPersona`, que le pone el nombre de la persona.
  // Cifras: PROPUESTA TÉCNICA ajustable (ver `AGRESION` en balance.config.js).
  civil: {
    refId: 'civil', nombre: 'Civil', genero: 'm', plural: 'civiles',
    tipo: 'humanoide', tamano: 'mediano', amenaza: 'insignificante', nivel: 1,
    vida: 10, defensa: 10, reduccionDano: 0,
    atributos: { vigor: 10, destreza: 10, temple: 10, intelecto: 10, astucia: 10, carisma: 10 },
    ataques: [
      { nombre: 'Puñetazo', dano: '1d3', tipo: 'contundente', bonoAtaque: 1, alcance: 'cuerpo' },
    ],
    tactica: 'cobarde',
    terrenos: [],
    descripcion: 'Alguien que no esperaba tener que pelear.',
    promptLore: 'Una persona corriente atacada sin motivo: se defiende como puede y quiere escapar.',
    huye: true, umbralHuida: 0.5, negociable: true,
  },

  rata_gigante: {
    refId: 'rata_gigante', nombre: 'Rata gigante', genero: 'f', plural: 'ratas gigantes',
    tipo: 'bestia', tamano: 'pequeno', amenaza: 'insignificante', nivel: 1,
    vida: 7, defensa: 11, reduccionDano: 0,
    atributos: { vigor: 8, destreza: 14, temple: 10, intelecto: 2, astucia: 10, carisma: 4 },
    ataques: [
      { nombre: 'Mordisco', dano: '1d4', tipo: 'perforante', bonoAtaque: 2, alcance: 'cuerpo',
        estado: { refId: 'envenenado', probabilidad: 0.15 } },
    ],
    tactica: 'enjambre',
    terrenos: ['mazmorra', 'ciudad', 'ruinas', 'pantano'],
    descripcion: 'Del tamaño de un perro pequeño, con dientes que no deberían ser tan largos.',
    promptLore: 'Rata enorme, agresiva y sucia. Ataca en grupo y huye si se queda sola.',
    huye: true, umbralHuida: 0.4,
  },

  carronero: {
    refId: 'carronero', nombre: 'Carroñero', genero: 'm', plural: 'carroñeros',
    tipo: 'bestia', tamano: 'mediano', amenaza: 'menor', nivel: 1,
    vida: 13, defensa: 12, reduccionDano: 0,
    atributos: { vigor: 12, destreza: 13, temple: 12, intelecto: 3, astucia: 12, carisma: 5 },
    ataques: [
      { nombre: 'Dentellada', dano: '1d6+1', tipo: 'perforante', bonoAtaque: 3, alcance: 'cuerpo' },
    ],
    tactica: 'oportunista',
    terrenos: ['bosque', 'camino', 'desierto', 'ruinas'],
    descripcion: 'Flaco y nervioso, con el pelaje apelmazado. Come lo que encuentra.',
    promptLore: 'Bestia carroñera que ronda los caminos. Ataca a los heridos y evita a los fuertes.',
    huye: true, umbralHuida: 0.5,
  },

  saqueador: {
    refId: 'saqueador', nombre: 'Saqueador', genero: 'm', plural: 'saqueadores',
    tipo: 'humanoide', tamano: 'mediano', amenaza: 'menor', nivel: 2,
    vida: 16, defensa: 13, reduccionDano: 1,
    atributos: { vigor: 13, destreza: 12, temple: 12, intelecto: 9, astucia: 10, carisma: 8 },
    ataques: [
      { nombre: 'Machete', dano: '1d6+2', tipo: 'cortante', bonoAtaque: 3, alcance: 'cuerpo' },
      { nombre: 'Piedra', dano: '1d4', tipo: 'contundente', bonoAtaque: 2, alcance: 'distancia' },
    ],
    tactica: 'cobarde',
    terrenos: ['camino', 'bosque', 'ruinas'],
    descripcion: 'Ropa robada mal ajustada y un arma que no sabe usar del todo.',
    promptLore: 'Bandido de poca monta. Amenaza más de lo que pelea y se rinde si pierde ventaja.',
    huye: true, umbralHuida: 0.5, negociable: true,
  },

  /* ═══════════════════════════════════════════════════════════════════════
     NORMALES
     ═══════════════════════════════════════════════════════════════════════ */

  lobo_ceniciento: {
    refId: 'lobo_ceniciento', nombre: 'Lobo ceniciento', genero: 'm', plural: 'lobos cenicientos',
    tipo: 'bestia', tamano: 'mediano', amenaza: 'normal', nivel: 3,
    vida: 24, defensa: 14, reduccionDano: 1,
    atributos: { vigor: 15, destreza: 15, temple: 14, intelecto: 3, astucia: 13, carisma: 7 },
    ataques: [
      { nombre: 'Mordisco', dano: '1d8+2', tipo: 'perforante', bonoAtaque: 5, alcance: 'cuerpo',
        estado: { refId: 'sangrado', probabilidad: 0.25 } },
      { nombre: 'Embestida', dano: '1d6+3', tipo: 'contundente', bonoAtaque: 4, alcance: 'cuerpo',
        estado: { refId: 'derribado', probabilidad: 0.35 }, recarga: 3 },
    ],
    tactica: 'manada',
    terrenos: ['bosque', 'montana'],
    descripcion: 'Pelaje gris ceniza y ojos que calculan. Nunca caza solo.',
    promptLore: 'Lobo grande que caza en manada. Rodea, aísla y ataca al más débil del grupo.',
    huye: true, umbralHuida: 0.25,
  },

  guardia_corrupto: {
    refId: 'guardia_corrupto', nombre: 'Guardia corrupto', genero: 'm', plural: 'guardias corruptos',
    tipo: 'humanoide', tamano: 'mediano', amenaza: 'normal', nivel: 3,
    vida: 28, defensa: 16, reduccionDano: 2,
    atributos: { vigor: 14, destreza: 12, temple: 14, intelecto: 10, astucia: 11, carisma: 10 },
    ataques: [
      { nombre: 'Espada', dano: '1d8+2', tipo: 'cortante', bonoAtaque: 5, alcance: 'cuerpo' },
      { nombre: 'Golpe de escudo', dano: '1d4+2', tipo: 'contundente', bonoAtaque: 4, alcance: 'cuerpo',
        estado: { refId: 'aturdido', probabilidad: 0.2 }, recarga: 4 },
    ],
    tactica: 'disciplinado',
    terrenos: ['ciudad', 'camino'],
    descripcion: 'Uniforme oficial, mirada de quien cobra por dos lados.',
    promptLore: 'Guardia que abusa de su puesto. Sabe pelear en formación y prefiere el soborno al acero.',
    huye: false, negociable: true, sobornable: true, faccion: 'guardia_valle',
  },

  espectro_menor: {
    refId: 'espectro_menor', nombre: 'Espectro', genero: 'm', plural: 'espectros',
    tipo: 'no_muerto', tamano: 'mediano', amenaza: 'normal', nivel: 4,
    vida: 22, defensa: 15, reduccionDano: 0,
    atributos: { vigor: 6, destreza: 16, temple: 14, intelecto: 10, astucia: 12, carisma: 14 },
    ataques: [
      { nombre: 'Toque helado', dano: '2d6', tipo: 'necrotico', bonoAtaque: 5, alcance: 'cuerpo',
        estado: { refId: 'aterrado', probabilidad: 0.3 } },
    ],
    tactica: 'acechador',
    terrenos: ['ruinas', 'mazmorra', 'pantano'],
    descripcion: 'Una forma que recuerda a alguien, borrosa por los bordes.',
    promptLore: 'Aparición de la edad anterior. Atraviesa la materia y siembra terror. Reacciona a los nombres antiguos.',
    resistencias: ['fisico'], inmunidades: ['veneno'],
    huye: false,
  },

  /* ═══════════════════════════════════════════════════════════════════════
     PELIGROSOS
     ═══════════════════════════════════════════════════════════════════════ */

  bruto_griscuerno: {
    refId: 'bruto_griscuerno', nombre: 'Bruto de las estepas', genero: 'm', plural: 'brutos de las estepas',
    tipo: 'humanoide', tamano: 'grande', amenaza: 'peligroso', nivel: 5,
    vida: 52, defensa: 15, reduccionDano: 3,
    atributos: { vigor: 18, destreza: 11, temple: 16, intelecto: 8, astucia: 10, carisma: 9 },
    ataques: [
      { nombre: 'Maza enorme', dano: '2d8+4', tipo: 'contundente', bonoAtaque: 7, alcance: 'cuerpo' },
      { nombre: 'Barrido', dano: '1d10+4', tipo: 'contundente', bonoAtaque: 6, alcance: 'cuerpo',
        area: true, estado: { refId: 'derribado', probabilidad: 0.5 }, recarga: 4 },
    ],
    tactica: 'agresivo',
    terrenos: ['montana', 'camino'],
    descripcion: 'Dos metros y medio de músculo con una maza del tamaño de un niño.',
    promptLore: 'Mercenario enorme de las estepas del norte. Pega fuerte y aguanta más. Respeta la fuerza y desprecia la astucia.',
    huye: false, negociable: true,
  },

  tejedora_de_umbral: {
    refId: 'tejedora_de_umbral', nombre: 'Tejedora del umbral', genero: 'f', plural: 'tejedoras del umbral',
    tipo: 'aberracion', tamano: 'grande', amenaza: 'peligroso', nivel: 6,
    vida: 45, defensa: 17, reduccionDano: 2,
    atributos: { vigor: 14, destreza: 17, temple: 14, intelecto: 12, astucia: 15, carisma: 8 },
    ataques: [
      { nombre: 'Mordisco venenoso', dano: '1d10+3', tipo: 'perforante', bonoAtaque: 7, alcance: 'cuerpo',
        estado: { refId: 'envenenado', probabilidad: 0.6, acumulaciones: 2 } },
      { nombre: 'Hilo del umbral', dano: '1d6', tipo: 'necrotico', bonoAtaque: 6, alcance: 'distancia',
        estado: { refId: 'apresado', probabilidad: 0.7 }, recarga: 3 },
    ],
    tactica: 'controlador',
    terrenos: ['pantano', 'ruinas', 'mazmorra'],
    descripcion: 'Ocho patas demasiado largas y una tela que no refleja la luz.',
    promptLore: 'Criatura que teje entre este mundo y el otro. Inmoviliza a sus presas antes de acercarse. Su tela no arde.',
    resistencias: ['veneno'],
    huye: true, umbralHuida: 0.2,
  },

  ejecutor_albar: {
    refId: 'ejecutor_albar', nombre: 'Ejecutor albar', genero: 'm', plural: 'ejecutores albares',
    tipo: 'construido', tamano: 'mediano', amenaza: 'peligroso', nivel: 6,
    vida: 48, defensa: 18, reduccionDano: 4,
    atributos: { vigor: 16, destreza: 15, temple: 16, intelecto: 6, astucia: 10, carisma: 1 },
    ataques: [
      { nombre: 'Hoja de aleación', dano: '2d6+4', tipo: 'cortante', bonoAtaque: 8, alcance: 'cuerpo' },
      { nombre: 'Descarga', dano: '2d8', tipo: 'rayo', bonoAtaque: 7, alcance: 'distancia', recarga: 4 },
    ],
    tactica: 'metodico',
    terrenos: ['ruinas', 'mazmorra'],
    descripcion: 'Aleación pálida con vetas apagadas. Sigue cumpliendo una orden que nadie recuerda.',
    promptLore: 'Autómata de guerra de la edad anterior. No negocia, no se cansa, no huye. Reconoce símbolos albares y los respeta.',
    inmunidades: ['veneno', 'miedo'], resistencias: ['fisico'],
    huye: false,
  },

  /* ═══════════════════════════════════════════════════════════════════════
     LETALES
     ═══════════════════════════════════════════════════════════════════════ */

  devorador_de_brumas: {
    refId: 'devorador_de_brumas', nombre: 'Devorador de brumas', genero: 'm', plural: 'devoradores de brumas',
    tipo: 'aberracion', tamano: 'enorme', amenaza: 'letal', nivel: 9,
    vida: 95, defensa: 18, reduccionDano: 4,
    atributos: { vigor: 19, destreza: 14, temple: 18, intelecto: 8, astucia: 14, carisma: 12 },
    ataques: [
      { nombre: 'Zarpa', dano: '2d10+5', tipo: 'cortante', bonoAtaque: 9, alcance: 'cuerpo' },
      { nombre: 'Aliento de bruma', dano: '4d6', tipo: 'necrotico', bonoAtaque: 0, alcance: 'area',
        area: true, salvacion: { atributo: 'temple', umbral: 'dificil' }, recarga: 5 },
      { nombre: 'Absorber', dano: '2d8', tipo: 'necrotico', bonoAtaque: 8, alcance: 'cuerpo',
        curaAtacante: true, recarga: 4 },
    ],
    tactica: 'inteligente',
    terrenos: ['pantano', 'ruinas'],
    descripcion: 'Una masa que se condensa y se dispersa. Donde pasa, la niebla se vuelve fría.',
    promptLore: 'Criatura del velo que se alimenta de vida. Se disipa cuando la hieren y vuelve a formarse. Teme a la luz de verdad.',
    resistencias: ['fisico', 'frio'], inmunidades: ['veneno', 'miedo'],
    huye: false,
  },

  cazadora_silente: {
    refId: 'cazadora_silente', nombre: 'Cazadora silente', genero: 'f', plural: 'cazadoras silentes',
    tipo: 'humanoide', tamano: 'mediano', amenaza: 'letal', nivel: 8,
    vida: 68, defensa: 19, reduccionDano: 2,
    atributos: { vigor: 14, destreza: 20, temple: 15, intelecto: 13, astucia: 17, carisma: 11 },
    ataques: [
      { nombre: 'Hoja envenenada', dano: '2d6+5', tipo: 'perforante', bonoAtaque: 10, alcance: 'cuerpo',
        estado: { refId: 'envenenado', probabilidad: 0.7, acumulaciones: 2 } },
      { nombre: 'Disparo certero', dano: '2d8+5', tipo: 'perforante', bonoAtaque: 10, alcance: 'distancia' },
      { nombre: 'Desvanecerse', dano: '0', efecto: 'invisible', recarga: 5, sinDano: true },
    ],
    tactica: 'asesino',
    terrenos: ['bosque', 'ciudad', 'ruinas'],
    descripcion: 'No la oyes llegar. Cuando la ves, ya está demasiado cerca.',
    promptLore: 'Asesina profesional. Ataca desde la sombra, se desvanece y vuelve. Si su objetivo cae, se marcha: no pelea por gusto.',
    huye: true, umbralHuida: 0.3, faccion: 'sombras_puerto',
  },

  /* ═══════════════════════════════════════════════════════════════════════
     JEFES
     ═══════════════════════════════════════════════════════════════════════ */

  guardian_de_la_puerta: {
    refId: 'guardian_de_la_puerta', nombre: 'Guardián de la Puerta', genero: 'm', plural: 'guardianes',
    tipo: 'construido', tamano: 'enorme', amenaza: 'jefe', nivel: 12,
    vida: 180, defensa: 20, reduccionDano: 6,
    atributos: { vigor: 22, destreza: 12, temple: 20, intelecto: 10, astucia: 14, carisma: 8 },
    ataques: [
      { nombre: 'Martillo de sellado', dano: '3d10+6', tipo: 'contundente', bonoAtaque: 11, alcance: 'cuerpo',
        estado: { refId: 'aturdido', probabilidad: 0.3 } },
      { nombre: 'Onda de rechazo', dano: '3d8', tipo: 'fuerza', bonoAtaque: 0, alcance: 'area',
        area: true, salvacion: { atributo: 'vigor', umbral: 'dificil' },
        estado: { refId: 'derribado', probabilidad: 0.8 }, recarga: 4 },
      { nombre: 'Sello de contención', dano: '0', tipo: 'fuerza', bonoAtaque: 10, alcance: 'distancia',
        estado: { refId: 'paralizado', probabilidad: 0.5 }, recarga: 5 },
    ],
    tactica: 'jefe_fases',
    legendarias: ['golpe_veloz', 'embate'],
    fases: [
      { hasta: 1.0, nombre: 'Vigilancia', descripcion: 'Cumple su función sin ensañarse.' },
      { hasta: 0.6, nombre: 'Alerta', descripcion: 'Reconoce la amenaza. Ataca en serio.', bonoAtaque: 2 },
      { hasta: 0.3, nombre: 'Protocolo final', descripcion: 'Ya no protege la puerta: destruye lo que la amenaza.', bonoAtaque: 4, bonoDano: 5 },
    ],
    terrenos: ['ruinas', 'mazmorra'],
    descripcion: 'Cuatro metros de aleación grabada. Lleva aquí desde antes de que existieran los reinos.',
    promptLore: 'Autómata guardián de una puerta antigua. No ataca a quien no intenta pasar. Si le hablan en la lengua albar, duda.',
    inmunidades: ['veneno', 'miedo', 'dominado'], resistencias: ['fisico', 'necrotico'],
    huye: false, negociable: true,
  },

  senora_del_pantano: {
    refId: 'senora_del_pantano', nombre: 'Señora del Pantano', genero: 'f', plural: 'señoras',
    tipo: 'aberracion', tamano: 'grande', amenaza: 'jefe', nivel: 13,
    vida: 155, defensa: 19, reduccionDano: 4,
    atributos: { vigor: 16, destreza: 16, temple: 20, intelecto: 18, astucia: 19, carisma: 20 },
    ataques: [
      { nombre: 'Garra de raíces', dano: '2d10+5', tipo: 'cortante', bonoAtaque: 10, alcance: 'cuerpo' },
      { nombre: 'Canto del velo', dano: '0', tipo: 'psiquico', bonoAtaque: 0, alcance: 'area',
        salvacion: { atributo: 'temple', umbral: 'ardua' },
        estado: { refId: 'dominado', probabilidad: 0.6 }, recarga: 5 },
      { nombre: 'Marea negra', dano: '4d8', tipo: 'veneno', bonoAtaque: 0, alcance: 'area',
        area: true, salvacion: { atributo: 'temple', umbral: 'dificil' },
        estado: { refId: 'envenenado', probabilidad: 0.8, acumulaciones: 3 }, recarga: 4 },
    ],
    tactica: 'jefe_invocador',
    legendarias: ['mirada', 'desplazarse'],
    invoca: { refId: 'tejedora_de_umbral', cantidad: 2, cadaRondas: 4, maximo: 4 },
    fases: [
      { hasta: 1.0, nombre: 'Cortesía', descripcion: 'Habla antes de pelear. Ofrece tratos.' },
      { hasta: 0.5, nombre: 'Ira', descripcion: 'Se acabó la conversación.', bonoAtaque: 3 },
      { hasta: 0.2, nombre: 'Desesperación', descripcion: 'Invoca todo lo que puede.', invocaExtra: true },
    ],
    terrenos: ['pantano'],
    descripcion: 'Alta como un árbol joven, hecha de raíces y agua negra. Habla con voz de muchas.',
    promptLore: 'Entidad antigua del pantano. Negocia antes de pelear y cumple sus tratos al pie de la letra, con trampa. Odia el fuego.',
    vulnerabilidades: ['fuego'], inmunidades: ['veneno'], resistencias: ['fisico'],
    huye: false, negociable: true,
  },
});

/* ═══════════════════════════════════════════════════════════════════════════
   CONSULTAS
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * @param {string} refId
 * @returns {Enemigo|null}
 */
export function obtenerEnemigo(refId) {
  return ENEMIGOS[refId] ?? null;
}

/**
 * Enemigos adecuados a un terreno y a un nivel.
 *
 * @param {string} terreno
 * @param {number} nivelJugador
 * @param {Object} [opciones]
 * @param {number} [opciones.margen=2] Diferencia de nivel admitida.
 * @returns {Enemigo[]}
 */
export function apropiados(terreno, nivelJugador, opciones = {}) {
  const margen = opciones.margen ?? 2;

  return Object.values(ENEMIGOS).filter((e) => {
    if (terreno && !e.terrenos.includes(terreno)) return false;
    return e.nivel >= nivelJugador - margen - 2 && e.nivel <= nivelJugador + margen;
  });
}

/**
 * Enemigos de un grado de amenaza.
 * @param {string} amenaza
 * @returns {Enemigo[]}
 */
export function porAmenaza(amenaza) {
  return Object.values(ENEMIGOS).filter((e) => e.amenaza === amenaza);
}

/**
 * Busca un enemigo por nombre aproximado.
 * Lo usa el director cuando declara «te atacan unos lobos».
 *
 * @param {string} texto
 * @returns {Enemigo|null}
 */
export function buscarPorNombre(texto) {
  if (!texto) return null;

  // Lo más habitual es que llegue el refId exacto: se comprueba primero.
  if (ENEMIGOS[texto]) return ENEMIGOS[texto];

  const limpio = String(texto).toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  if (ENEMIGOS[limpio]) return ENEMIGOS[limpio];

  for (const e of Object.values(ENEMIGOS)) {
    const nombre = e.nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const plural = e.plural.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    if (nombre === limpio || plural === limpio) return e;
  }

  for (const e of Object.values(ENEMIGOS)) {
    const nombre = e.nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (limpio.includes(nombre) || nombre.includes(limpio)) return e;
  }

  return null;
}

export default ENEMIGOS;
