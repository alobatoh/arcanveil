/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCANVEIL · data/items.data.js
 * ---------------------------------------------------------------------------
 * Catálogo base de objetos.
 *
 * Estos son los objetos escritos a mano que garantizan que el juego funcione
 * sin ningún paquete instalado. Cubren el equipo inicial de las ocho vocaciones
 * y los diez trasfondos, más lo imprescindible para sobrevivir.
 *
 * Cuando se instale el volcado del SRD, `srdAdapter` añadirá cientos de
 * entradas más con esta misma forma. El motor no distinguirá unas de otras.
 *
 * Notas de diseño:
 *   · El peso está en unidades abstractas, no en kilos reales. Una capacidad
 *     base de 25 con Vigor medio significa que ir sobrecargado es fácil, y eso
 *     es intencionado: qué dejar atrás debe ser una decisión.
 *   · `promptLore` solo lo llevan los objetos con carga narrativa. Un odre de
 *     agua no necesita que el director sepa nada especial sobre él.
 *
 * Sin dependencias.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * @typedef {Object} PlantillaObjeto
 * @property {string} refId
 * @property {string} nombre
 * @property {'m'|'f'} genero Para la concordancia en la narración.
 * @property {string} categoria arma|armadura|escudo|consumible|material|util|magico|moneda
 * @property {string} [subtipo] Precisión dentro de la categoría.
 * @property {string} rareza Grado de rareza.
 * @property {number} peso Unidades de carga.
 * @property {number} valor Monedas de oro.
 * @property {string} descripcion
 * @property {string} [promptLore] Contexto para el director, si lo merece.
 * @property {boolean} [apilable=false]
 * @property {number} [pilaMax]
 * @property {string} [ranura] Ranura de equipo que ocupa.
 * @property {Object} [dano] { notacion, tipo }
 * @property {Object} [armadura] { defensa, reduccion }
 * @property {Object} [efecto] Efecto al consumirlo o al equiparlo.
 * @property {boolean} [tieneDurabilidad=false]
 * @property {string[]} [propiedades] Etiquetas mecánicas.
 * @property {string} [icono]
 */

/** @type {Record<string, PlantillaObjeto>} */
export const OBJETOS_BASE = Object.freeze({

  /* ═══════════════════════════════════════════════════════════════════════
     ARMAS CUERPO A CUERPO
     ═══════════════════════════════════════════════════════════════════════ */

  daga: {
    refId: 'daga', nombre: 'Daga', genero: 'f',
    categoria: 'arma', subtipo: 'ligera', rareza: 'comun',
    peso: 1, valor: 2, icono: 'espada',
    descripcion: 'Hoja corta de un palmo. Se esconde bien y se saca deprisa.',
    ranura: 'armaPrincipal',
    dano: { notacion: '1d4', tipo: 'perforante' },
    propiedades: ['ligera', 'arrojadiza', 'oculta'],
    tieneDurabilidad: true,
  },

  espada_corta: {
    refId: 'espada_corta', nombre: 'Espada corta', genero: 'f',
    categoria: 'arma', subtipo: 'ligera', rareza: 'comun',
    peso: 2, valor: 10, icono: 'espada',
    descripcion: 'Arma de infantería, fiable y sin pretensiones.',
    ranura: 'armaPrincipal',
    dano: { notacion: '1d6', tipo: 'cortante' },
    propiedades: ['ligera', 'versatil'],
    tieneDurabilidad: true,
  },

  espada_larga: {
    refId: 'espada_larga', nombre: 'Espada larga', genero: 'f',
    categoria: 'arma', subtipo: 'media', rareza: 'comun',
    peso: 3, valor: 15, icono: 'espada',
    descripcion: 'Hoja de mano y media. Con las dos manos pega bastante más.',
    ranura: 'armaPrincipal',
    dano: { notacion: '1d8', tipo: 'cortante' },
    propiedades: ['versatil'],
    danoVersatil: { notacion: '1d10', tipo: 'cortante' },
    tieneDurabilidad: true,
  },

  estoque: {
    refId: 'estoque', nombre: 'Estoque', genero: 'm',
    categoria: 'arma', subtipo: 'ligera', rareza: 'comun',
    peso: 2, valor: 25, icono: 'espada',
    descripcion: 'Hoja fina de duelo. Premia la precisión y castiga la torpeza.',
    promptLore: 'Un estoque delata formación de esgrima. En algunas cortes se considera arma de caballero.',
    ranura: 'armaPrincipal',
    dano: { notacion: '1d8', tipo: 'perforante' },
    propiedades: ['ligera', 'precisa', 'duelo'],
    bonoAtaque: 1,
    tieneDurabilidad: true,
  },

  hacha_mano: {
    refId: 'hacha_mano', nombre: 'Hacha de mano', genero: 'f',
    categoria: 'arma', subtipo: 'ligera', rareza: 'comun',
    peso: 2, valor: 5, icono: 'espada',
    descripcion: 'Sirve para partir leña y para lo otro.',
    ranura: 'armaPrincipal',
    dano: { notacion: '1d6', tipo: 'cortante' },
    propiedades: ['ligera', 'arrojadiza', 'herramienta'],
    tieneDurabilidad: true,
  },

  hacha_guerra: {
    refId: 'hacha_guerra', nombre: 'Hacha de guerra', genero: 'f',
    categoria: 'arma', subtipo: 'pesada', rareza: 'comun',
    peso: 4, valor: 20, icono: 'espada',
    descripcion: 'Pesada y contundente. No perdona un golpe bien puesto.',
    ranura: 'armaPrincipal',
    dano: { notacion: '1d10', tipo: 'cortante' },
    propiedades: ['pesada', 'dosManos'],
    tieneDurabilidad: true,
  },

  maza: {
    refId: 'maza', nombre: 'Maza', genero: 'f',
    categoria: 'arma', subtipo: 'media', rareza: 'comun',
    peso: 3, valor: 8, icono: 'espada',
    descripcion: 'Cabeza de hierro sobre mango corto. Ignora buena parte de la armadura.',
    ranura: 'armaPrincipal',
    dano: { notacion: '1d6', tipo: 'contundente' },
    propiedades: ['perforaArmadura'],
    tieneDurabilidad: true,
  },

  baston_glifos: {
    refId: 'baston_glifos', nombre: 'Bastón de glifos', genero: 'm',
    categoria: 'arma', subtipo: 'foco', rareza: 'fino',
    peso: 3, valor: 60, icono: 'mana',
    descripcion: 'Vara de fresno con muescas talladas que ordenan la notación arcana.',
    promptLore: 'Un bastón de glifos identifica de inmediato a un mago formado. Algunos lugares prohíben portarlo abiertamente.',
    ranura: 'armaPrincipal',
    dano: { notacion: '1d6', tipo: 'contundente' },
    propiedades: ['foco', 'dosManos'],
    efecto: { tipo: 'bonoLanzamiento', valor: 1 },
    tieneDurabilidad: true,
  },

  foco_pacto: {
    refId: 'foco_pacto', nombre: 'Foco de pacto', genero: 'm',
    categoria: 'arma', subtipo: 'foco', rareza: 'fino',
    peso: 1, valor: 50, icono: 'mana',
    descripcion: 'Objeto pequeño y personal por el que canaliza el poder prestado. Está caliente al tacto.',
    promptLore: 'El foco de pacto reacciona a la presencia de su entidad. A veces se mueve solo.',
    ranura: 'amuleto',
    efecto: { tipo: 'bonoLanzamiento', valor: 1 },
    propiedades: ['foco', 'vinculado'],
  },

  daga_ritual: {
    refId: 'daga_ritual', nombre: 'Daga ritual', genero: 'f',
    categoria: 'arma', subtipo: 'ligera', rareza: 'fino',
    peso: 1, valor: 35, icono: 'espada',
    descripcion: 'Hoja de plata con inscripciones en el filo. No está pensada para pelear.',
    promptLore: 'La daga ritual se usa en pactos y ofrendas. Verla desenvainada pone nerviosa a la gente.',
    ranura: 'armaSecundaria',
    dano: { notacion: '1d4', tipo: 'perforante' },
    propiedades: ['ligera', 'ritual', 'plata'],
    tieneDurabilidad: true,
  },

  cuchillo_caza: {
    refId: 'cuchillo_caza', nombre: 'Cuchillo de caza', genero: 'm',
    categoria: 'arma', subtipo: 'ligera', rareza: 'comun',
    peso: 1, valor: 3, icono: 'espada',
    descripcion: 'Hoja curva para desollar. Vale también para lo que haga falta.',
    ranura: 'armaSecundaria',
    dano: { notacion: '1d4', tipo: 'cortante' },
    propiedades: ['ligera', 'herramienta'],
    tieneDurabilidad: true,
  },

  cuchillo_gastado: {
    refId: 'cuchillo_gastado', nombre: 'Cuchillo gastado', genero: 'm',
    categoria: 'arma', subtipo: 'ligera', rareza: 'tosco',
    peso: 1, valor: 1, icono: 'espada',
    descripcion: 'Le falta filo y le sobran muescas. Ha visto cosas.',
    promptLore: 'Un cuchillo así habla de alguien que sobrevivió con lo que tenía a mano.',
    ranura: 'armaSecundaria',
    dano: { notacion: '1d4', tipo: 'cortante' },
    propiedades: ['ligera'],
    tieneDurabilidad: true,
    durabilidadInicial: 35,
  },

  herramienta_campo: {
    refId: 'herramienta_campo', nombre: 'Hoz', genero: 'f',
    categoria: 'arma', subtipo: 'ligera', rareza: 'tosco',
    peso: 2, valor: 2, icono: 'espada',
    descripcion: 'Herramienta de siega. Corta bien lo que sea que corte.',
    ranura: 'armaPrincipal',
    dano: { notacion: '1d4', tipo: 'cortante' },
    propiedades: ['ligera', 'herramienta'],
    tieneDurabilidad: true,
  },

  /* ═══════════════════════════════════════════════════════════════════════
     ARMAS A DISTANCIA
     ═══════════════════════════════════════════════════════════════════════ */

  arco_corto: {
    refId: 'arco_corto', nombre: 'Arco corto', genero: 'm',
    categoria: 'arma', subtipo: 'distancia', rareza: 'comun',
    peso: 2, valor: 25, icono: 'espada',
    descripcion: 'Arco de caza. Silencioso y manejable entre árboles.',
    ranura: 'armaPrincipal',
    dano: { notacion: '1d6', tipo: 'perforante' },
    propiedades: ['distancia', 'dosManos', 'municion'],
    municion: 'flecha',
    tieneDurabilidad: true,
  },

  arco_largo: {
    refId: 'arco_largo', nombre: 'Arco largo', genero: 'm',
    categoria: 'arma', subtipo: 'distancia', rareza: 'comun',
    peso: 3, valor: 50, icono: 'espada',
    descripcion: 'Arma de guerra. Requiere fuerza y espacio para tensarlo.',
    ranura: 'armaPrincipal',
    dano: { notacion: '1d8', tipo: 'perforante' },
    propiedades: ['distancia', 'dosManos', 'municion', 'pesada'],
    municion: 'flecha',
    tieneDurabilidad: true,
  },

  flecha: {
    refId: 'flecha', nombre: 'Flecha', genero: 'f',
    categoria: 'material', subtipo: 'municion', rareza: 'comun',
    peso: 0.05, valor: 0.05, icono: 'espada',
    descripcion: 'Asta de madera con punta de hierro y emplume de ganso.',
    apilable: true, pilaMax: 99,
  },

  /* ═══════════════════════════════════════════════════════════════════════
     ARMADURAS Y ESCUDOS
     ═══════════════════════════════════════════════════════════════════════ */

  ropa_trabajo: {
    refId: 'ropa_trabajo', nombre: 'Ropa de trabajo', genero: 'f',
    categoria: 'armadura', subtipo: 'ligera', rareza: 'tosco',
    peso: 2, valor: 3, icono: 'escudo',
    descripcion: 'Basta, remendada y con manchas que ya no salen.',
    ranura: 'torso',
    armadura: { defensa: 1, reduccion: 0 },
    tieneDurabilidad: true,
  },

  ropa_basta: {
    refId: 'ropa_basta', nombre: 'Ropa basta', genero: 'f',
    categoria: 'armadura', subtipo: 'ligera', rareza: 'tosco',
    peso: 2, valor: 2, icono: 'escudo',
    descripcion: 'Lana sin teñir. Abriga y poco más.',
    ranura: 'torso',
    armadura: { defensa: 1, reduccion: 0 },
    tieneDurabilidad: true,
  },

  tunica_estudio: {
    refId: 'tunica_estudio', nombre: 'Túnica de estudio', genero: 'f',
    categoria: 'armadura', subtipo: 'ligera', rareza: 'comun',
    peso: 2, valor: 12, icono: 'escudo',
    descripcion: 'Túnica larga con bolsillos internos para tinta y reglas.',
    promptLore: 'La túnica de estudio identifica a un académico. Abre puertas en bibliotecas y las cierra en tabernas.',
    ranura: 'torso',
    armadura: { defensa: 1, reduccion: 0 },
    efecto: { tipo: 'bonoHabilidad', habilidad: 'saber_arcano', valor: 1 },
    tieneDurabilidad: true,
  },

  tunica_sencilla: {
    refId: 'tunica_sencilla', nombre: 'Túnica sencilla', genero: 'f',
    categoria: 'armadura', subtipo: 'ligera', rareza: 'comun',
    peso: 2, valor: 8, icono: 'escudo',
    descripcion: 'Hábito sin adornos, del color de su orden.',
    ranura: 'torso',
    armadura: { defensa: 1, reduccion: 0 },
    tieneDurabilidad: true,
  },

  jubon_reforzado: {
    refId: 'jubon_reforzado', nombre: 'Jubón reforzado', genero: 'm',
    categoria: 'armadura', subtipo: 'ligera', rareza: 'comun',
    peso: 4, valor: 30, icono: 'escudo',
    descripcion: 'Cuero acolchado con placas cosidas en el pecho. Protege sin estorbar.',
    ranura: 'torso',
    armadura: { defensa: 2, reduccion: 1 },
    tieneDurabilidad: true,
  },

  coraza_cuero: {
    refId: 'coraza_cuero', nombre: 'Coraza de cuero', genero: 'f',
    categoria: 'armadura', subtipo: 'media', rareza: 'comun',
    peso: 6, valor: 45, icono: 'escudo',
    descripcion: 'Cuero endurecido en aceite hirviendo. Rígido y fiable.',
    ranura: 'torso',
    armadura: { defensa: 3, reduccion: 1 },
    propiedades: ['penalizaSigilo'],
    tieneDurabilidad: true,
  },

  cota_ligera: {
    refId: 'cota_ligera', nombre: 'Cota de malla ligera', genero: 'f',
    categoria: 'armadura', subtipo: 'media', rareza: 'comun',
    peso: 9, valor: 75, icono: 'escudo',
    descripcion: 'Anillas de hierro sobre acolchado. Pesa, pero se agradece cuando pesa.',
    ranura: 'torso',
    armadura: { defensa: 4, reduccion: 2 },
    propiedades: ['penalizaSigilo', 'ruidosa'],
    tieneDurabilidad: true,
  },

  escudo_madera: {
    refId: 'escudo_madera', nombre: 'Escudo de madera', genero: 'm',
    categoria: 'escudo', rareza: 'comun',
    peso: 4, valor: 12, icono: 'escudo',
    descripcion: 'Tablas de tilo con umbo de hierro y refuerzo de cuero en el canto.',
    ranura: 'armaSecundaria',
    armadura: { defensa: 2, reduccion: 1 },
    tieneDurabilidad: true,
  },

  ropas_finas: {
    refId: 'ropas_finas', nombre: 'Ropas finas', genero: 'f',
    categoria: 'armadura', subtipo: 'ligera', rareza: 'fino',
    peso: 3, valor: 80, icono: 'escudo',
    descripcion: 'Terciopelo, botonadura de nácar y corte de sastre de capital.',
    promptLore: 'Las ropas finas abren puertas en las clases altas y despiertan recelo en los barrios pobres.',
    ranura: 'torso',
    armadura: { defensa: 1, reduccion: 0 },
    efecto: { tipo: 'bonoHabilidad', habilidad: 'trato_social', valor: 2 },
    tieneDurabilidad: true,
  },

  traje_escena: {
    refId: 'traje_escena', nombre: 'Traje de escena', genero: 'm',
    categoria: 'armadura', subtipo: 'ligera', rareza: 'comun',
    peso: 3, valor: 25, icono: 'escudo',
    descripcion: 'Llamativo de lejos, algo raído de cerca. Cumple su función.',
    ranura: 'torso',
    armadura: { defensa: 1, reduccion: 0 },
    efecto: { tipo: 'bonoHabilidad', habilidad: 'acrobacias', valor: 1 },
    tieneDurabilidad: true,
  },

  /* ═══════════════════════════════════════════════════════════════════════
     CAPAS Y ACCESORIOS
     ═══════════════════════════════════════════════════════════════════════ */

  capa_viaje: {
    refId: 'capa_viaje', nombre: 'Capa de viaje', genero: 'f',
    categoria: 'armadura', subtipo: 'accesorio', rareza: 'comun',
    peso: 2, valor: 8, icono: 'escudo',
    descripcion: 'Lana encerada con capucha. Aguanta la lluvia y el viento.',
    ranura: 'capa',
    efecto: { tipo: 'resistenciaClima', valor: 1 },
    tieneDurabilidad: true,
  },

  capa_oscura: {
    refId: 'capa_oscura', nombre: 'Capa oscura', genero: 'f',
    categoria: 'armadura', subtipo: 'accesorio', rareza: 'comun',
    peso: 2, valor: 15, icono: 'escudo',
    descripcion: 'Tejido mate que no devuelve la luz. Cosida sin adornos ni hebillas que tintineen.',
    ranura: 'capa',
    efecto: { tipo: 'bonoHabilidad', habilidad: 'sigilo', valor: 2 },
    tieneDurabilidad: true,
  },

  capa_raida: {
    refId: 'capa_raida', nombre: 'Capa raída', genero: 'f',
    categoria: 'armadura', subtipo: 'accesorio', rareza: 'tosco',
    peso: 2, valor: 3, icono: 'escudo',
    descripcion: 'Deshilachada por los bordes. Oculta lo que hay debajo, que es lo que importa.',
    promptLore: 'Una capa raída sugiere alguien que prefiere no ser mirado de cerca.',
    ranura: 'capa',
    efecto: { tipo: 'bonoHabilidad', habilidad: 'sigilo', valor: 1 },
    tieneDurabilidad: true,
  },

  anillo_familia: {
    refId: 'anillo_familia', nombre: 'Anillo de familia', genero: 'm',
    categoria: 'magico', subtipo: 'joya', rareza: 'fino',
    peso: 0.1, valor: 120, icono: 'mana',
    descripcion: 'Sello de oro con el escudo de su casa grabado en hueco.',
    promptLore: 'El anillo de familia identifica a su portador ante quien conozca el escudo. Puede abrir puertas o cerrarlas de golpe.',
    ranura: 'anillo1',
    efecto: { tipo: 'bonoHabilidad', habilidad: 'trato_social', valor: 1 },
  },

  simbolo_sagrado: {
    refId: 'simbolo_sagrado', nombre: 'Símbolo sagrado', genero: 'm',
    categoria: 'magico', subtipo: 'foco', rareza: 'comun',
    peso: 0.5, valor: 20, icono: 'mana',
    descripcion: 'Emblema de su orden, gastado por el roce del pulgar.',
    ranura: 'amuleto',
    efecto: { tipo: 'bonoLanzamiento', valor: 1 },
    propiedades: ['foco'],
  },

  simbolo_juramento: {
    refId: 'simbolo_juramento', nombre: 'Símbolo de juramento', genero: 'm',
    categoria: 'magico', subtipo: 'foco', rareza: 'fino',
    peso: 0.5, valor: 40, icono: 'mana',
    descripcion: 'Objeto que representa lo prometido. Solo tiene valor para quien juró.',
    promptLore: 'El símbolo de juramento se enfría cuando su portador se aleja de lo que prometió.',
    ranura: 'amuleto',
    efecto: { tipo: 'bonoLanzamiento', valor: 1 },
    propiedades: ['foco', 'vinculado'],
  },

  insignia_compania: {
    refId: 'insignia_compania', nombre: 'Insignia de compañía', genero: 'f',
    categoria: 'util', rareza: 'comun',
    peso: 0.1, valor: 5, icono: 'escudo',
    descripcion: 'Broche de latón con el emblema de su antigua unidad.',
    promptLore: 'Otros veteranos reconocen la insignia. Algunos con respeto, otros con rencor.',
  },

  sello_lacrado: {
    refId: 'sello_lacrado', nombre: 'Sello de lacre', genero: 'm',
    categoria: 'util', rareza: 'comun',
    peso: 0.2, valor: 15, icono: 'pergamino',
    descripcion: 'Matriz de bronce y una barra de lacre carmesí.',
    promptLore: 'Un sello permite autenticar cartas. También falsificarlas, si se tiene el sello equivocado.',
  },

  moneda_suerte: {
    refId: 'moneda_suerte', nombre: 'Moneda de la suerte', genero: 'f',
    categoria: 'util', rareza: 'comun',
    peso: 0.05, valor: 1, icono: 'oro',
    descripcion: 'Una moneda vieja de un reino que ya no existe. La lleva desde siempre.',
    promptLore: 'La moneda de la suerte no tiene poder alguno, pero su dueño no lo cree del todo.',
  },

  recuerdo_familiar: {
    refId: 'recuerdo_familiar', nombre: 'Recuerdo familiar', genero: 'm',
    categoria: 'util', rareza: 'comun',
    peso: 0.2, valor: 0, icono: 'pergamino',
    descripcion: 'Lo único que quedó. No tiene valor para nadie más.',
    promptLore: 'Este objeto es el último vínculo con lo que perdió. Perderlo sería un golpe.',
    propiedades: ['irreemplazable'],
  },

  /* ═══════════════════════════════════════════════════════════════════════
     CONSUMIBLES
     ═══════════════════════════════════════════════════════════════════════ */

  racion_viaje: {
    refId: 'racion_viaje', nombre: 'Ración de viaje', genero: 'f',
    categoria: 'consumible', subtipo: 'comida', rareza: 'comun',
    peso: 0.5, valor: 2, icono: 'bolsa',
    descripcion: 'Carne seca, pan duro y fruta pasa. En un campamento, comerla repone fuerzas.',
    apilable: true, pilaMax: 20,
    // Comida: solo cura vida en un campamento (ver `player/Comida.js`). Ya no
    // repone un hambre que no existe como presión.
    efecto: { tipo: 'comida' },
  },

  odre_agua: {
    refId: 'odre_agua', nombre: 'Odre de agua', genero: 'm',
    categoria: 'consumible', subtipo: 'bebida', rareza: 'comun',
    peso: 2, valor: 1, icono: 'pocion',
    descripcion: 'Cuero curtido con capacidad para un día de marcha.',
    apilable: true, pilaMax: 5,
    // Beber ya no es una obligación ni cura: el odre se conserva (valor, usos
    // creativos) y «usarlo» no lo gasta.
    efecto: { tipo: 'bebida' },
    recargable: true,
  },

  pocion_curacion: {
    refId: 'pocion_curacion', nombre: 'Poción de curación', genero: 'f',
    categoria: 'consumible', subtipo: 'pocion', rareza: 'fino',
    peso: 0.5, valor: 50, icono: 'pocion',
    descripcion: 'Líquido rojizo que sabe a hierro y a menta. Cierra las heridas por dentro.',
    apilable: true, pilaMax: 10,
    efecto: { tipo: 'curacion', notacion: '2d6+2' },
  },

  pocion_mana: {
    refId: 'pocion_mana', nombre: 'Poción de maná', genero: 'f',
    categoria: 'consumible', subtipo: 'pocion', rareza: 'fino',
    peso: 0.5, valor: 60, icono: 'pocion',
    descripcion: 'Azul intenso, casi luminoso. Deja un zumbido en los dientes.',
    apilable: true, pilaMax: 10,
    efecto: { tipo: 'mana', notacion: '2d6' },
  },

  antidoto: {
    refId: 'antidoto', nombre: 'Antídoto', genero: 'm',
    categoria: 'consumible', subtipo: 'pocion', rareza: 'fino',
    peso: 0.3, valor: 35, icono: 'pocion',
    descripcion: 'Turbio y amargo. Corta el veneno en seco.',
    apilable: true, pilaMax: 5,
    efecto: { tipo: 'curarEstado', estados: ['envenenado'] },
  },

  venda: {
    refId: 'venda', nombre: 'Vendas', genero: 'f',
    categoria: 'consumible', subtipo: 'medicina', rareza: 'comun',
    peso: 0.2, valor: 3, icono: 'bolsa',
    descripcion: 'Lino limpio enrollado. Detiene una hemorragia si se sabe usar.',
    apilable: true, pilaMax: 10,
    efecto: { tipo: 'curacion', notacion: '1d4', requiereHabilidad: 'medicina' },
  },

  incienso: {
    refId: 'incienso', nombre: 'Incienso', genero: 'm',
    categoria: 'consumible', subtipo: 'ritual', rareza: 'comun',
    peso: 0.2, valor: 5, icono: 'bolsa',
    descripcion: 'Resina aromática en conos. Se usa en ritos y para tapar otros olores.',
    apilable: true, pilaMax: 20,
  },

  /* ═══════════════════════════════════════════════════════════════════════
     ÚTILES
     ═══════════════════════════════════════════════════════════════════════ */

  ganzuas: {
    refId: 'ganzuas', nombre: 'Juego de ganzúas', genero: 'f',
    categoria: 'util', subtipo: 'herramienta', rareza: 'comun',
    peso: 0.5, valor: 25, icono: 'bolsa',
    descripcion: 'Varillas y tensores en un estuche de cuero enrollado.',
    promptLore: 'Llevar ganzúas es delito en muchas ciudades. Conviene no enseñarlas.',
    efecto: { tipo: 'permiteAccion', accion: 'forzarCerradura' },
    propiedades: ['ilegal'],
    tieneDurabilidad: true,
  },

  herramientas_oficio: {
    refId: 'herramientas_oficio', nombre: 'Herramientas de oficio', genero: 'f',
    categoria: 'util', subtipo: 'herramienta', rareza: 'comun',
    peso: 5, valor: 30, icono: 'bolsa',
    descripcion: 'Martillo, tenazas, limas y punzones. Pesan, pero sin ellas no hay oficio.',
    efecto: { tipo: 'bonoHabilidad', habilidad: 'artesania', valor: 2 },
    tieneDurabilidad: true,
  },

  cuerda: {
    refId: 'cuerda', nombre: 'Cuerda (15 m)', genero: 'f',
    categoria: 'util', rareza: 'comun',
    peso: 3, valor: 5, icono: 'bolsa',
    descripcion: 'Cáñamo trenzado. Aguanta el peso de dos personas.',
    efecto: { tipo: 'bonoHabilidad', habilidad: 'atletismo', valor: 1 },
    tieneDurabilidad: true,
  },

  cuerda_seda: {
    refId: 'cuerda_seda', nombre: 'Cuerda de seda (15 m)', genero: 'f',
    categoria: 'util', rareza: 'fino',
    peso: 1, valor: 40, icono: 'bolsa',
    descripcion: 'Fina, ligera y sorprendentemente resistente. No hace ruido al desenrollarse.',
    efecto: { tipo: 'bonoHabilidad', habilidad: 'atletismo', valor: 2 },
    tieneDurabilidad: true,
  },

  saco_dormir: {
    refId: 'saco_dormir', nombre: 'Saco de dormir', genero: 'm',
    categoria: 'util', rareza: 'comun',
    peso: 4, valor: 10, icono: 'bolsa',
    descripcion: 'Lana y piel de oveja. La diferencia entre dormir y pasar la noche.',
    efecto: { tipo: 'mejoraDescanso', valor: 0.2 },
  },

  manta_raida: {
    refId: 'manta_raida', nombre: 'Manta raída', genero: 'f',
    categoria: 'util', rareza: 'tosco',
    peso: 2, valor: 1, icono: 'bolsa',
    descripcion: 'Agujereada y fina, pero es la que tiene.',
    efecto: { tipo: 'mejoraDescanso', valor: 0.1 },
  },

  cuaderno_arcano: {
    refId: 'cuaderno_arcano', nombre: 'Cuaderno de glifos', genero: 'm',
    categoria: 'util', subtipo: 'grimorio', rareza: 'fino',
    peso: 2, valor: 100, icono: 'pergamino',
    descripcion: 'Tapas de cuero y hojas cosidas, llenas de notación apretada y correcciones al margen.',
    promptLore: 'El cuaderno es irremplazable para su dueño: contiene años de trabajo. Perderlo sería una catástrofe personal.',
    propiedades: ['irreemplazable', 'grimorio'],
    tieneDurabilidad: true,
  },

  libro_notas: {
    refId: 'libro_notas', nombre: 'Libro de notas', genero: 'm',
    categoria: 'util', rareza: 'comun',
    peso: 1, valor: 15, icono: 'pergamino',
    descripcion: 'Páginas en blanco y algunas ya escritas con letra apretada.',
    efecto: { tipo: 'bonoHabilidad', habilidad: 'historia', valor: 1 },
  },

  tinta_plata: {
    refId: 'tinta_plata', nombre: 'Tinta de plata', genero: 'f',
    categoria: 'material', rareza: 'fino',
    peso: 0.3, valor: 25, icono: 'bolsa',
    descripcion: 'Necesaria para trazar glifos que funcionen. Se agota deprisa.',
    apilable: true, pilaMax: 10,
  },

  lente_aumento: {
    refId: 'lente_aumento', nombre: 'Lente de aumento', genero: 'f',
    categoria: 'util', rareza: 'fino',
    peso: 0.2, valor: 40, icono: 'ojo',
    descripcion: 'Cristal pulido con montura de latón. Revela lo que el ojo pasa por alto.',
    efecto: { tipo: 'bonoHabilidad', habilidad: 'percepcion', valor: 1 },
  },

  instrumento: {
    refId: 'instrumento', nombre: 'Instrumento', genero: 'm',
    categoria: 'util', rareza: 'comun',
    peso: 2, valor: 30, icono: 'bolsa',
    descripcion: 'Su instrumento. Lo afina por costumbre aunque no vaya a tocar.',
    promptLore: 'Un instrumento permite ganarse el sustento en cualquier taberna, y llamar la atención cuando no conviene.',
    efecto: { tipo: 'bonoHabilidad', habilidad: 'trato_social', valor: 1 },
    tieneDurabilidad: true,
  },

  antorcha: {
    refId: 'antorcha', nombre: 'Antorcha', genero: 'f',
    categoria: 'consumible', subtipo: 'luz', rareza: 'comun',
    peso: 1, valor: 0.5, icono: 'bolsa',
    descripcion: 'Estopa embreada sobre mango de pino. Arde una hora larga.',
    apilable: true, pilaMax: 10,
    efecto: { tipo: 'luz', radio: 6, duracion: 60 },
  },

  /* ═══════════════════════════════════════════════════════════════════════
     MATERIALES Y VALOR
     ═══════════════════════════════════════════════════════════════════════ */

  chatarra: {
    refId: 'chatarra', nombre: 'Chatarra', genero: 'f',
    categoria: 'material', rareza: 'tosco',
    peso: 1, valor: 1, icono: 'bolsa',
    descripcion: 'Metal retorcido sin forma reconocible. Un herrero pagaría algo.',
    apilable: true, pilaMax: 50,
  },

  piel_curtida: {
    refId: 'piel_curtida', nombre: 'Piel curtida', genero: 'f',
    categoria: 'material', rareza: 'comun',
    peso: 1, valor: 4, icono: 'bolsa',
    descripcion: 'Preparada y lista para trabajar.',
    apilable: true, pilaMax: 30,
  },

  gema_menor: {
    refId: 'gema_menor', nombre: 'Gema pequeña', genero: 'f',
    categoria: 'material', subtipo: 'valor', rareza: 'fino',
    peso: 0.05, valor: 50, icono: 'oro',
    descripcion: 'Tallada de forma tosca, pero limpia de inclusiones.',
    apilable: true, pilaMax: 20,
  },

  reliquia_antigua: {
    refId: 'reliquia_antigua', nombre: 'Reliquia de la edad anterior', genero: 'f',
    categoria: 'material', subtipo: 'valor', rareza: 'superior',
    peso: 1, valor: 250, icono: 'pergamino',
    descripcion: 'Fragmento de algo que fue mayor. La aleación no se fabrica desde hace siglos.',
    promptLore: 'Las reliquias de la edad anterior interesan a coleccionistas, academias y a gente peor. Llevarlas encima atrae atención.',
    apilable: true, pilaMax: 10,
  },
});

/* ═══════════════════════════════════════════════════════════════════════════
   CONSULTAS
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * @param {string} refId
 * @returns {PlantillaObjeto|null}
 */
export function obtenerPlantilla(refId) {
  return OBJETOS_BASE[refId] ?? null;
}

/**
 * Objetos de una categoría.
 * @param {string} categoria
 * @returns {PlantillaObjeto[]}
 */
export function porCategoria(categoria) {
  return Object.values(OBJETOS_BASE).filter((o) => o.categoria === categoria);
}

/**
 * Objetos que encajan en una ranura de equipo.
 * @param {string} ranura
 * @returns {PlantillaObjeto[]}
 */
export function porRanura(ranura) {
  return Object.values(OBJETOS_BASE).filter((o) => o.ranura === ranura);
}

/**
 * Objetos dentro de un rango de valor, para las tablas de botín.
 * @param {number} min
 * @param {number} max
 * @returns {PlantillaObjeto[]}
 */
export function porValor(min, max) {
  return Object.values(OBJETOS_BASE).filter((o) => o.valor >= min && o.valor <= max);
}

/**
 * Objetos de una rareza concreta.
 * @param {string} rareza
 * @returns {PlantillaObjeto[]}
 */
export function porRareza(rareza) {
  return Object.values(OBJETOS_BASE).filter((o) => o.rareza === rareza);
}

/**
 * Busca por nombre aproximado. Lo usa el director cuando quiere entregar «una
 * espada» sin conocer los identificadores del catálogo.
 *
 * @param {string} texto
 * @returns {PlantillaObjeto|null}
 */
export function buscarPorNombre(texto) {
  if (!texto) return null;

  const limpio = String(texto).toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // Coincidencia exacta primero.
  for (const o of Object.values(OBJETOS_BASE)) {
    const nombre = o.nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (nombre === limpio) return o;
  }

  // Contención después.
  for (const o of Object.values(OBJETOS_BASE)) {
    const nombre = o.nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (nombre.includes(limpio) || limpio.includes(nombre)) return o;
  }

  return null;
}

export default OBJETOS_BASE;
