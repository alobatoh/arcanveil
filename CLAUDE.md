# ARCANVEIL · guía para Claude Code

Motor de rol narrativo web. **145 módulos, 66.000 líneas, cero dependencias.**
Todo en español: nombres de función, variables, comentarios y comunicación.

---

## 1 · Lo primero que hay que saber

**El motor tira los dados. El director solo narra lo que ya está decidido.**

Esa frase gobierna toda la arquitectura. `RulesEngine` resuelve la tirada
*antes* de que el proveedor de IA vea nada, y el resultado va en el prompt con
la instrucción de narrarlo sin cambiarlo. Si algún cambio permite que el
narrador decida resultados, el cambio está mal.

Consecuencias que ya están implementadas y no hay que deshacer:

- `EffectApplier` recorta todo lo que el director propone contra `COTAS_IA`.
- Resolver un encuentro hablando da **más** experiencia que matar (60 frente a 45).
- El juego nunca se detiene: si el proveedor falla, `DungeonMaster` degrada al
  director interno, que no depende de nada y no puede fallar.

---

## 2 · Estado actual

### Funciona y está verificado

| Qué | Cómo se comprobó |
|---|---|
| 28 sistemas arrancan y el `Registry` ordena por dependencias | ejecución en Node |
| Partida de 12 turnos sin fallos | ejecución en Node |
| Combate completo hasta la resolución | ejecución en Node |
| Guardado y carga (20 KB por ranura) | ejecución en Node |
| La app renderiza: creación, bitácora, paneles, combate | DOM simulado, 21 comprobaciones |
| 480 importaciones, 0 rotas | `tools/auditar-imports.mjs` |
| 0 claves de configuración ausentes | `tools/auditar-config.mjs` |

| Arranca en navegador real: menú, creación, partida, combate | Chromium, `app/index.html` |
| El archivo único (`app/`) se juega desde `file://` | `tools/auditar-bundle.mjs`, Chromium |
| 1088 piezas de arte se generan enteras | `tools/auditar-arte.mjs` |

### Roto o sin confirmar

Nada bloqueante conocido. Lo que falta es contenido y alcance, no reparación:
ver §9.

---

## 3 · Estructura

```
index.html          portada del sitio: redirige a app/
clasico.html        puente a app/ (la interfaz original se retiró el 7-oct-2026)
app/                LA ÚNICA INTERFAZ — index.html + app.js
src/
  core/             Store, EventBus, Registry, SystemBase, RNG, Dice, Clock
  config/           app · balance · ai · ui   ← constantes, nada de lógica
  data/             catálogos inmutables (razas, clases, objetos, lugares…)
  player/           atributos, vitales, progresión, alineamiento, creación
  inventory/        objetos, equipo, desgaste, botín
  combat/           combatientes, ataques, estados, iniciativa, IA, jefes
  world/            mapa (grafo), tiempo, clima, viaje, exploración, eventos
  npc/              relaciones, reputación, facciones, diálogo, mercaderes
  economy/          precios, trueque
  quests/           objetivos, generación, seguimiento
  progression/      hazañas, estadísticas, hitos
  persistence/      serialización, migraciones, ranuras
  engine/           reglas, efectos, enrutado, consecuencias, ritmo, turno
  ai/               prompts, análisis de respuestas, coordinador, proveedores
  art/              generadores de arte: paisaje, retrato, criatura
assets/            vacía; puerta para sustituir el arte por imágenes
tools/              bundle · servir · lamina-arte · auditar-{imports,config,arte}
demo/               banco de pruebas + dom-simulado.mjs
```

### Las tres capas

**Datos** (`src/data/`) — objetos congelados, sin estado, sin lógica de juego.
Añadir contenido es añadir una entrada aquí.

**Funciones puras** (`Combatant`, `MapGraph`, `PriceModel`, `Location`…) —
reciben datos y devuelven datos. Se prueban solas, sin motor.

**Sistemas** (`extends SystemBase`) — tienen estado, escuchan el bus, despachan
al store. Se registran en `Registry`.

---

## 4 · Reglas del código

### SystemBase

Un sistema declara `static nombre`, `static dependencias` y `static canal`.
Los métodos de ciclo de vida son `alIniciar`, `alArrancar`, `alTurno`,
`alDetener`.

**Nombres reservados que NO se pueden sobrescribir:**

```
iniciar  arrancar  detener  escuchar  reductor  reductores
observar  leer  despachar  emitir  sistema  espera  intervalo
nombre  id  store  bus  rng  log  registry
```

Ya pasó dos veces: `CombatManager.iniciar()` hacía que el `Registry` empezara un
combate al arrancar, y un getter `nombre` en `DungeonMaster` impedía construir
el sistema. Si necesitas un método público con uno de esos nombres, ponle otro
(`empezarCombate`, `proveedorId`).

### Estado

- Solo se muta por `store.dispatch(tipo, payload)` con un reductor registrado.
- Un reductor devuelve un **parche parcial**, no el estado entero.
- `store.getState()` para leerlo todo; `store.select(ruta)` para una rama.
- `store.instantanea()` / `restaurar()` envuelven las operaciones que pueden
  fallar a medias (turno, efectos).

### Separación plantilla / estado

`locations.data.js` describe lo que un lugar **es**; `Location.js` maneja lo que
le **ha pasado** en esta partida. Igual con `enemies.data.js` y `Combatant.js`.
Eso hace el guardado pequeño y permite actualizar los catálogos sin romper
partidas antiguas. Respétalo.

### Estilo

- Comentarios que explican **por qué**, no qué. Si el comentario repite el
  código, sobra.
- Ancho 80-100 columnas. Separadores `/* ═══ SECCIÓN ═══ */`.
- Nada de `console.log` suelto: usa `this.log.debug/info/aviso/error`.
- JSDoc en todo lo exportado.

---

## 5 · Cómo probar sin navegador

Es lo que más valor ha dado en este proyecto. `node --check` solo ve sintaxis;
los fallos reales aparecen al **ejecutar**.

```bash
node tools/auditar-imports.mjs   # nombres importados que no existen
node tools/auditar-config.mjs    # claves de config usadas pero no definidas
node tools/auditar-arte.mjs      # las 1088 piezas de arte, enteras
node tools/bundle.mjs            # empaqueta app/ a dist/arcanveil.html
node tools/auditar-bundle.mjs    # y lo juega en Chrome desde file://
```

**Para probar en el navegador, usa `node tools/servir.mjs`, no
`python -m http.server`.** El de Python cachea: editas un módulo, recargas y el
navegador sigue ejecutando el de antes. Se pierde media hora buscando un fallo
ya corregido —pasó dos veces en esta sesión, una con `app.js` y otra con
`Combatant.js`. `servir.mjs` manda `Cache-Control: no-store`.

`demo/dom-simulado.mjs` es un DOM mínimo con `querySelector` real (id, clase,
atributo, `:checked`), `localStorage` en memoria y eventos que se pueden
disparar. Con él se arranca el motor completo y se pulsan botones desde Node.

**Patrón de prueba de la app:**

```js
import './demo/dom-simulado.mjs';
import { body, Nodo } from './demo/dom-simulado.mjs';
// 1. montar el árbol a partir del HTML del paquete
// 2. ejecutar el <script> extraído
// 3. body.querySelector('#loquesea').disparar('click')
// 4. contar nodos renderizados
```

**Ejecuta siempre lo que escribas.** Estos fallos no los detecta ninguna
comprobación estática, y todos aparecieron así:

- claves de configuración inexistentes → `Math.min(2, undefined)` = `NaN`
- `this.store.estado` en vez de `getState()`
- `player/crear` esperaba `{ borrador }` y recibía `{ jugador }`
- `export function añadir` truncado a `a` por `\w` sin Unicode

---

## 6 · Trampas conocidas

**El empaquetador no puede seguir `import(variable)`.** Usa siempre
importadores literales: `() => import('./x.js')`.

**`$$` en una cadena de reemplazo significa `$`.** `html.replace(str, script)`
corrompe cualquier código con `$$`, `$&` o `` $` ``. Usa función de reemplazo.
Ya corregido en `bundle.mjs`, pero es fácil reintroducirlo.

**Identificadores con eñe o tilde.** `\w` no los cubre. Toda expresión regular
que capture identificadores necesita `[\p{L}\p{N}_$]+` con bandera `u`.

**`localStorage` en `file://`.** En Chrome, *leer la propiedad* lanza. Ni el
`typeof` es seguro fuera de un `try`. Los cuatro accesos de `SaveManager` ya
están blindados; cualquier acceso nuevo también debe estarlo.

**El combate hace pausas de 750 ms entre turnos enemigos.** Son deliberadas
(para poder leerlos). Cualquier prueba que sondee más rápido dará falsos
negativos.

**Nunca ocultes el cuerpo esperando a que algo cargue.** Un `opacity: 0` con
un fallo detrás es una pantalla en blanco sin explicación. `app/index.html`
tiene un rótulo de arranque con estilos en línea por esta razón.

---

## 7 · La pantalla en blanco · RESUELTA

Eran **tres fallos apilados**, y ninguno estaba donde apuntaban las sospechas.
No era `Clock`, no era `localStorage` y no era una restricción de origen.

**1. `app/index.html` no cargaba `app/app.js`.** No había etiqueta `<script>`.
El rótulo de arranque se quedaba puesto para siempre porque el motor nunca
empezaba. El empaquetador sí inyecta el código, y por eso el archivo único
parecía llegar «más lejos» que la versión servida: eran dos fallos distintos
mirados como uno.

**2. El rótulo de arranque no se podía ocultar.** `#arranque` lleva
`style="display:flex"` **en línea** —deliberadamente, para verse antes de que
cargue la hoja de estilos— y una declaración en línea gana a cualquier regla.
`capa.hidden = true` no hacía nada: el juego arrancaba detrás de un cartel
opaco. Arreglado por los dos lados: `!important` en la regla y `style.display`
en `arranqueListo()`.

**3. `mostrar()` ocultaba el `<body>`.** Este es el bueno:

```js
for (const s of $$('[data-pantalla]')) s.hidden = s.dataset.pantalla !== pantalla;
document.body.dataset.pantalla = pantalla;   // ← marca el propio body
```

La primera llamada marca el `body`. La **segunda** lo recoge en
`$$('[data-pantalla]')`, ve que su valor no coincide con el destino y le pone
`hidden`. El body se ocultaba a sí mismo al pasar de la portada a la creación.
Por eso la portada se veía y todo lo demás salía en blanco.

Arreglado acotando el bucle a `section[data-pantalla]` y moviendo la marca del
cuerpo a `data-active-screen`, que es el nombre que ya usaba `ui.config.js`.

### Lo que hay que aprender de esto

- **Un atributo que sirve de marca no puede compartir nombre con uno que sirve
  de selector.** El bucle se comía su propia marca.
- **Los estilos en línea del rótulo de arranque son un arma de doble filo.** Se
  ven antes que nada, y no hay forma de apagarlos desde la hoja sin
  `!important`.
- **Comprobar que el `<script>` está.** Media hora buscando por qué el motor no
  arrancaba cuando no se había pedido que arrancara.

### Cómo se encontró

`browse js "[...document.querySelectorAll('script')].map(s=>s.src)"` devolvió
`[]`, y después una subida por `parentElement` desde un campo invisible mostró
`BODY … display:none, hidden:true`. Ninguna comprobación estática ve nada de
esto: hay que abrir el navegador y preguntarle al DOM.

---

## 8 · El arte · `src/art/`

**La base del arte la genera código**: 40 piezas —8 linajes, 13 criaturas, 19
lugares— salen de tres generadores sembrados con el `refId`, así que la misma
entrada da siempre el mismo dibujo. Encima hay tres capas opcionales: las
ilustraciones WebP del manifiesto (solo las que representan su ficha: ver
`ART_QC.md` y `ART_REVISION.md`), el retrato generado a partir de la
descripción del jugador y las escenas generadas al cambiar de escena
(`retrato-ia.js`, `escena-ia.js`). **Una imagen que contradice su ficha no
entra en el manifiesto**, por bonita que sea: vuelve el vector.

```
src/art/
  paleta.js    ← la paleta ÚNICA y el ángulo de luz. Un solo archivo de color.
  lienzo.js    ← marco común: luz, viñeta, grano, curvas, utilidades de color
  paisaje.js   ← lugares. Reacciona a franja horaria y clima.
  retrato.js   ← linajes. Encuadre fijo, ojos a un tercio.
  criatura.js  ← enemigos. Silueta a contraluz por tipo y tamaño.
  index.js     ← cargador: manifiesto → imagen, si no → SVG. Toca el DOM.
```

### Por qué generado y no ocho archivos

El aviso que dejaba la versión anterior de este documento —«ocho retratos
sueltos parecen de ocho juegos distintos»— deja de ser un consejo y pasa a
estar garantizado por construcción: **hay una sola paleta y un solo ángulo de
luz**, en `paleta.js`, y todas las piezas los consumen. No se puede desviar una
sin desviarlas todas.

Y hay algo que un archivo de imagen no puede hacer: el paisaje depende de la
hora y del clima. Son 7 franjas × 8 climas = **56 variantes por lugar**,
generadas al vuelo, sin pesar nada. Vado del Yunque al alba con niebla y a
mediodía despejado son dos imágenes del mismo sitio, con el mismo relieve
—porque la semilla es solo el lugar, nunca la hora.

### El ancla de estilo, ahora en código

> Busto, tres cuartos, óleo apagado. Luz lateral única y suave. Ceniza, hierro
> y bronce oxidado. Fondo plano sin detalle. Sin brillos, sin fantasía épica.
> Rostro cansado. Encuadre idéntico, ojos a un tercio de la altura.

Se traduce así: `BASE` y `LINAJES` en `paleta.js` (los tonos salen literalmente
del campo `aspecto` de `races.data.js`), `LUZ.grados = 135` para todos los
degradados, `OJOS_Y = ALTO / 3` en `retrato.js`, y `defsGrano` con
`feTurbulence`, que es lo que quita el aspecto de vector limpio.

**La cara no se dibuja con líneas.** Se modela con sombras recortadas contra la
silueta de la cabeza (`clipPath`) más un filo de luz en el borde iluminado.
Dibujar ojos, nariz y boca con trazos daba una carita de tebeo.

### Trampa: `lienzo()` necesita que le pases los `defs`

Los tres generadores construyen sus degradados en una constante `defs` y se la
pasan a `lienzo({ ..., defs, cuerpo })`. **Olvidarlo no da ningún error**: el
SVG sale bien formado, y cada `fill="url(#piel-2)"` apunta a una definición que
no existe. El resultado es una silueta sin relleno y unas sombras dibujadas sin
recortar, es decir, una mancha. Costó cuatro vueltas de rediseño perseguir un
problema de estilo que era de fontanería.

Por eso existe `tools/auditar-arte.mjs`: genera las 1088 combinaciones y falla
si alguna tiene una referencia colgando, un `NaN` o las etiquetas descuadradas.
**Ejecútalo tras tocar `src/art/`.**

### Añadir un linaje, un terreno o un tipo de criatura

Añade la entrada al catálogo de `src/data/` y su fila en `paleta.js`
(`LINAJES`, `TERRENOS` o `TIPOS_CRIATURA`). Si te saltas la fila no se rompe
nada: cae en la de por defecto y sale genérico, que es preferible a un hueco.
Los retratos además necesitan una fila en `FORMA` de `retrato.js` y, si el
linaje tiene un rasgo propio, un caso en `rasgoLinaje`.

### Imágenes de verdad, más adelante

`assets/README.md` explica cómo sustituir cualquier pieza por un `.webp` sin
tocar código: se declara en `assets/manifest.json` y el cargador la usa. El SVG
se pinta siempre primero y la imagen lo releva ya cargada, así que un archivo
que falte no deja hueco. En el archivo único no hay `assets/`, así que todo
sale en vector: es lo previsto.

### Verlo todo junto

```bash
node tools/lamina-arte.mjs --franja ocaso --clima lluvia --horas
```

Genera `dist/lamina-arte.html` con las 40 piezas en rejilla. El fallo típico
del arte generado no se ve pieza a pieza: cada una puede estar bien y la serie
no parecer del mismo juego. Eso solo se juzga en rejilla.

---

## 9 · Lo que falta del juego

Por orden de valor:

**El narrador con IA.** Cada turno sigue este camino:

- `engine/Interpretacion.js` resuelve contra la escena a quién habla el
  jugador y qué nombra (presente, ausente, visto en otro sitio, inexistente).
- El motor resuelve.
- `ai/narrador/Instantanea.js` arma el estado de solo lectura con
  procedencia.
- El proveedor narra con la política de `PromptBuilder.sistema()` (el MASTER
  PROMPT adaptado).
- `ai/narrador/FiltroModelo.js` verifica y repara (`Verificador.js`) y
  autoriza efectos (`Autorizacion.js`).

Reglas que no se tocan:

- Un modelo nunca aplica oro, vida, objetos, misiones, combate, tiempo, lugar
  ni canon.
- La clave de Groq vive solo en `tools/groq-proxy.mjs`.
- No hay fallback a otra nube.
- El canon lo cambia el jugador con `canon: …`.

Pruebas: `auditar-interpretacion`, `auditar-narrador-ia`, `auditar-canon`,
`auditar-puente-uso` y `medir-narrador --ia-simulada`; para leer partidas
enteras, `revision-manual.mjs`.

Más reglas que no se tocan:

- El canon del jugador vive íntegro en `MemoryStore.registroCanon` (ver
  `ai/narrador/Canon.js`) y se proyecta por turno diciendo lo omitido.
- El permiso para enviar a Groq es de la sesión: no se guarda.
- Los efectos de un modelo necesitan evidencia del MOTOR (trato registrado,
  hallazgo resuelto), no palabras de su propia narración.
- El puente reserva en el peor caso y falla cerrado.

**El techo del director interno.** Ya no baraja frases: cuenta desde el
estado (`ai/narrador/Conocimiento.js`, `data/rasgos.data.js`, las situaciones
con reloj y secuelas), contesta con datos del mundo y no repite coletillas; se
mide con `tools/medir-narrador.mjs`. Lo que no puede hacer sin modelo: inventar
contenido que el mundo no tiene escrito, improvisar tramas nuevas o variar la
prosa como un modelo. La voz sale de frases con huecos, y se nota a la larga.
Para eso están `BridgeProvider` y los otros proveedores, siempre a elección del
jugador.

**Diálogo con PNJ.** `DialogueSystem` existe y funciona, pero la app solo tiene
un botón «Hablar» que manda texto libre. Merece un panel propio.

**Comercio.** `MerchantSystem` y `Trade` están completos; la app no los expone.

**Misiones.** `QuestSystem` genera y sigue encargos; la pestaña los muestra pero
no hay forma de entregar uno.

**Viaje interrumpido.** `Travel` guarda el tramo y permite reanudar; la app no
ofrece el botón de continuar.

**La IA sin validar con partidas reales.** El camino de Groq está probado sin
clave (dobles del puente y del modelo, simulador adversario, navegador de
extremo a extremo). Falta jugar las seis partidas con `openai/gpt-oss-120b`
de verdad y la evaluación a ciegas. Requiere la cuenta del autor, su
comprobación del plan Free y su permiso.

---

## 10 · Contenido: cómo ampliar

Añadir contenido **no requiere tocar código**, solo catálogos:

| Qué | Dónde | Nota |
|---|---|---|
| Enemigo | `data/enemies.data.js` | elige una `tactica` de las 13 existentes |
| Lugar | `data/locations.data.js` | las `conexiones` son bidireccionales |
| Objeto | `data/items.data.js` | |
| Facción | `data/factions.data.js` | `valora` y `desprecia` mueven la reputación solas |
| Evento | `data/events.data.js` | los efectos se multiplican entre sí |
| Estado alterado | `data/statuses.data.js` | |
| Encuentro | `world/EncounterTables.js` | mantén los neutros en mayoría |

Tras tocar un grafo (lugares, clima), **verifica la coherencia ejecutando**: que
toda conexión apunte a algo que existe y que ningún estado quede aislado.

---

## 11 · Repositorio

`https://github.com/alobatoh/arcanveil`

Ver `SUBIR.md` para los comandos. `TESTING.md` tiene 15 bloques de prueba
manual ordenados para que los fallos salgan pronto; el bloque 15 —cuarenta
turnos seguidos sin tocar la consola— es el que más encuentra.

`ATTRIBUTION.md`: contenido original salvo lo derivado del SRD 5.1 y 5.2 de
Wizards of the Coast, bajo CC BY 4.0.
