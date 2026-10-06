# Correcciones de diseño: informe (6-oct-2026)

**Rama local** `feat/correcciones-diseno-20261006`, sacada de `feat/preparativos-motor-20261006` en **3d44aa9**: el SHA del encargo, sin nada encima al empezar. **HEAD del código: d4c3ad6.** Son 21 commits y 42 ficheros (+1721 / −452), más el commit de este informe.

- **Subida a GitHub el 6-oct-2026** porque Alejandro lo pidió en el chat, al final del trabajo: «cuando termines comitea y push». El encargo decía que la publicación la decidía él, y la ha decidido. **Sin PR, sin merge, sin publicar.**
- **`main` sin tocar:** sigue en 8c02138, del 24-sep.
- **0 euros.** No se ha llamado a Groq, Anthropic, Gemini, Cloudflare, ComfyUI ni a ningún servicio de imágenes. No hay claves, pagos, cuentas ni accesos nuevos. Todo se ha probado con el motor sin ventana, dobles y personajes ficticios («Sive»), en almacenamiento aislado. No se han tocado partidas ni galerías reales.
- El narrador procedural sigue siendo el **respaldo offline**. No sustituye al narrador de IA, que no se ha probado aquí (cuesta dinero).

---

## 1. Primero, lo que falla o queda abierto

### Encontrado al leer las dos partidas nuevas, y SIN arreglar

**1.1. Viajar por un sendero de peligro 2 no viaja.** Esto ya pasaba en 3d44aa9 y no es de esta rama.

| Desde | Frase | Qué sale | Reloj |
|---|---|---|---|
| Camino del Norte | «voy a las Tumbas Bajas» | «Vas a las Tumbas Bajas. Llegas a las afueras de El Camino del Norte. De aquí salen caminos hacia… ¿Hacia dónde?» | +10 min, no se mueve |
| Saucedo | «voy a la Linde del Cenizo» | igual, con «las afueras de Saucedo» | +10 min |
| Vado | «voy a la Linde del Cenizo» | igual | +10 min |

Responder «sí» tampoco viaja. Mientras no se arregle, los sitios peligrosos de la decisión G solo se alcanzan por rutas de peligro 1 o con fixture. No lo he tocado porque es la ruta de viaje y queda fuera del encargo. Lo propongo como siguiente arreglo.

**1.2. «voy a Saucedo» estando en Saucedo.** Sale «Emprendes el camino hacia Saucedo. Ya estás ahí.» y gasta 10 minutos. También pasaba en 3d44aa9. Debería aclarar sin gastar.

**1.3. El guardia que se mete pesa mucho para un nivel 1.** Al atacar a un civil, el guardia presente pelea con la única ficha de guardia que hay, `guardia_corrupto` (29-31 de vida, armadura que bloquea 1 de daño).
- En la 9505, una baluarte de nivel 1 con espada corta pierde el uno contra uno con Berlo: de 34 a 1 de vida en unas 16 rondas, mientras Berlo baja de 31 a 19.
- Esto es una consecuencia dura, pero es un **parámetro propuesto** (`AGRESION.plantillaGuardia`), no una decisión: ver el apartado 6.

**1.4. Perder una pelea no tiene consecuencia.** Tras «La oscuridad te alcanza.», la partida sigue con 1 de vida y los mismos presentes. `CombatManager` emite `player:defeated` y ningún sistema lo escucha. Ya pasaba en 3d44aa9 con cualquier combate; con los civiles atacables se nota más. Falta decidir qué pasa al perder (por ejemplo, despertar en el calabozo de la guardia).

**1.5. Logro «Nunca con hambre».** Su condición es `turnosBienAlimentado`, que ya no se cuenta. Es oculto y ahora no se puede conseguir. Falta decidir si se quita o se cambia (por ejemplo, «comer en cinco campamentos»).

**1.6. Restos inertes del hambre y la sed.** No cambian nada del juego, pero siguen ahí:
- `player.hambre` y `player.sed` siguen en el estado: se crean a 100 y los guardados viejos los conservan. No suben, no bajan y nadie los lee para decidir.
- `app.config.js` mantiene `hambreYSed: true`, que no se usa.
- `ui.config.js` mantiene los avisos «El hambre aprieta» y «La sed te castiga», que nadie emite.
- `MapGraph.provisionesNecesarias` ya no se usa.

Se pueden borrar en una limpieza aparte.

**1.7. La propagación social.** Atacar a un civil delante de testigos usa la acción «atacar» de siempre. Esa acción propaga el enfado a quien conoce a la víctima **y está presente**, no a todo el pueblo. La reputación de facción baja una vez (−20 por crimen presenciado). Las facciones aliadas o enemigas se mueven por las relaciones que ya existían: en la 9505, el gremio −6 y las sombras +8.

**1.8. Lo que no se ha podido probar:** el narrador real de IA (cuesta dinero), un móvil de verdad (solo Chrome con viewport de 390×844) y un jugador humano.

### Arreglado en esta rama tras leer las partidas (no venía en el encargo)

Cada uno tiene su caso en la auditoría: rojo sin el arreglo, verde con él.

| Leído en | Qué pasaba | Arreglo | Commit |
|---|---|---|---|
| 9505 | Todo el Vado es de la facción `guardia_valle`. Al atacar al vendedor Dalwen, el carretero Eltín se metía «como guardia», y los dos peleaban con la ficha de guardia corrupto (≈30 de vida) | Guardia es quien lo es de oficio (`rol`), no por facción. Ahora Dalwen pelea como `civil` y solo se mete el guardia Berlo | 66e5c9d |
| 9505 | «Atacas a Dalwen… **Dalwen espera tu respuesta.**» con el golpe ya dado | Si la ruta abre combate, el cierre no nombra a nadie | 181a9ef |
| 9303 | En el Camino del Norte se narraba «Berger ha empezado a desatar la manta», con Berger en el Vado | Cada nota «EN ESCENA» guarda dónde se apuntó; al empezar el turno se quita la de otro lugar | af910fe |
| 9303 | «**Valcio** se te acerca con algo entre manos…» dos turnos después de que Valcio se fuera | Se quita la oferta de quien ya no está; el encargo sigue en el diario | af910fe |
| 9505 | Dalwen huía y seguía en la ficha del combate de la pantalla | El reductor quita con `BORRAR` a quien ya no está (el almacén funde los parches) | 246701e |
| revisión | Una espera cortada por perder vida podía culpar «al hambre» o «a la sed» en un guardado viejo con esos valores a 0 | Solo se nombra el agotamiento | e08390c |

---

## 2. Los tres fallos

### A. Armas inventadas y nombres parciales

**Antes (3d44aa9).** Semilla 9303, Sive con el arco corto en la mochila y el cuchillo de caza en la mano:
- «ataco a Korsa con la katana» → «Intentas atacar a Korsa con la katana. Sale mal, y además llama la atención.»: tirada, turno y consecuencias, con un arma que no existe.
- Lo mismo con «el cuchillo mágico», «el cuchillo y el hacha», «el cuchillo, el arco y la katana».
- En combate, «ataco al guardia con el cuchillo mágico» golpeaba con el cuchillo de caza.
- «desenvaino la katana» no se detectaba.

**Ruta.** La comprobación de armas solo leía la primera palabra tras «con» y no veía las coordinaciones. Un nombre parcial casaba con cualquier objeto que contuviera la palabra.

**Contrato** (`src/engine/ArmaPedida.js`, usado igual dentro y fuera de combate, antes de dados, turno, situación, reputación o combate):
- **Qué se lee.** El sintagma entero tras «con», hasta «;», «.» o una preposición de rumbo. La coma no corta. Se parte en coordinaciones («,», «y», «e») y se validan **todos** los instrumentos.
- **Cuándo casa.** Un instrumento casa con un objeto si **todas** sus palabras están en el nombre.
  - «cuchillo» = el único cuchillo que llevas.
  - Con dos cuchillos, se pregunta: «¿Con cuál: el cuchillo de caza o el cuchillo gastado?».
  - «cuchillo mágico» no es un alias del de caza.
- **Lo que no es objeto:** modos e intensificadores («con calma», «con toda mi fuerza»), partes del cuerpo y magia.
- **Herramientas no bélicas.** Una herramienta real del inventario («con la cuerda») sigue su regla de siempre.
- **Mensajes:**
  - ausentes: «No llevas hacha ni katana. Di con qué quieres atacar; no se ha hecho el ataque.»
  - sin empuñar: «Llevas el arco corto, pero no en la mano…»
  - roto: «no sirve»
  - adquisición en la misma frase: «Todavía no llevas katana…»
- **Lo que no se mira:** la negación, la cita y la condición no se ejecutan, así que no se comprueban.

**Después.** Todas esas frases aclaran sin tirada, turno, reloj ni consecuencias. Las válidas («con el cuchillo de caza», «con el cuchillo», «con calma», «con la cuerda», «con el arco y el cuchillo» empuñando los dos) atacan a Korsa. En combate se aclara sin perder la ronda.

### B. Duraciones no soportadas

**Antes.**
- «espero 90 segundos» → «Esperas 90 segundos.»
- «espero 1e9 horas» → «Esperas 1e9 horas.»
- «espero tres lunas» → «Esperas tres lunas.»
- «espero 1e+9 horas», «espero una hora y 90 segundos» y «espero hasta las 24:30» esperaban 20 minutos.

**Ruta.** `leerDuracion` se quedaba con el primer trozo que entendía y tiraba el resto. Lo que no entendía hacía una espera simple de un turno.

**Contrato** (`src/engine/Espera.js`, `leerDuracionCompleta`). La expresión se valida **entera**:
- **Segundos.** «Las esperas se cuentan en minutos, no en segundos…»
- **Lo que no se entiende entero** (cifras sueltas, notación científica, unidades raras). «No entiendo toda esa duración… Como mucho, 24 horas.»
- **Formato ambiguo.** «1.500 minutos» se pregunta, no se normaliza.
- **Horas que no existen.** «24:30» → «Esa hora no existe en el reloj.» No se convierte en 00:30.
- **Lo que ya se aclaraba sigue igual:** cero, negativos, más de 24 h e «infinitas horas».

**Después.** Las 13 frases malas aclaran con reloj, turno y estado intactos. «espero» sigue siendo un turno. «dos horas», «30 minutos», «media hora», «hora y media», «25 minutos» y «24 horas» pasan exactamente 120, 30, 30, 90, 25 y 1440 minutos, en 12, 3, 3, 9, 3 y 144 pulsos.

### C. Blanco ausente sustituido por el único hostil

**FIXTURE:** semilla 9303, situaciones vacías, Xivio hostil con `refId` `guardia_corrupto`.

**Antes:**
- «Ataco a Zorvak» → «Te lanzas tú primero contra Xivio: Guardia corrupto.»
- Con dos hostiles, «¿A cuál?» en vez de «Zorvak no está».
- «no ataco a Zorvak» también atacaba a Xivio.
- En combate, «ataco a Zorvak» golpeaba al de siempre.
- La ficha del combate decía «Guardia corrupto A / B», no Xivio.
- «Ataco a Korsa» con Xivio hostil no abría nada.

**Ruta.** `_atacar` buscaba primero un hostil y solo luego el nombre dicho. Combatant ponía el nombre de la plantilla, sin persona.

**Contrato** (`ActionRouter._blancoDelAtaque`, `_atacarPersona`; `CombatManager._aclararAntes`; `Combatant`, `CombatLog`, `SituationSystem._combateConIdentidad`):
- **Orden de decisión.** Primero el blanco **dicho**:
  - ausente → «No ves a Zorvak por aquí. A unos pasos: …»
  - oficio ausente → «Aquí no hay ningún herrero.»
  - ambiguo → pregunta
  - presente → se ataca a esa persona

  Solo si no se dice nadie: un hostil → ese; varios → «¿A cuál?».
- **Negación.** «no ataco a…» no ataca y no tira dados.
- **Identidad.** El combatiente lleva `nombre` y `npc` (la clave de la persona). La apertura la nombra: «Te lanzas tú primero contra Korsa, y Xivio se mete en la pelea». El daño, la muerte o la herida se apuntan en esa persona al terminar, y se guardan.
- **En combate.** Un nombre que no está en la pelea se aclara: «Zorvak no está en esta pelea…». Sin tirada, en la misma ronda.

**Después.** Los 15 casos de C en verde, con 0, 1 y 2 hostiles, en mayúscula y minúscula, con cita, negación y combate.

---

## 3. Las cinco decisiones

### D. Atacar a un civil

**Antes.** «ataco a Korsa» → «Intentas atacar a Korsa. Sale mal, y además llama la atención.» Había tirada y no había ni combate ni consecuencias guardadas.

**Ahora** (`_atacarPersona` + `_consecuenciasAgresion`):
- **La pelea.** Se abre contra la víctima con su nombre y la ficha `civil` (10 de vida, puñetazo 1d3, cobarde: suele huir). Los guardias **de oficio** presentes se meten con su nombre. Quien ataca pega primero.
- **Con testigos:**
  - la acción social «atacar» (−70 con la víctima, propagada a quien la conoce y está);
  - −20 de reputación con la facción de la víctima o de los guardias (si no hay, la del lugar);
  - recuerdos en la víctima y los testigos.
- **Sin testigos:** solo la víctima lo sabe; ni reputación ni guardias.
- **Una sola vez.** Se guarda en `world.agresiones[agr_<turno>_<npc>]`. Ni una recarga ni el narrador lo vuelven a aplicar.
- **Lo que no deja consecuencias:** la negación, la cita, la amenaza dicha, el gesto («saco el cuchillo delante de Korsa»), el nombre ausente y el arma ausente.

**Leído en la partida 9505:**
- «Atacas a Dalwen. Lo han visto Eltín y Berlo. Berlo se mete en medio.»
- guardia_valle −20, gremio −6, sombras +8;
- Dalwen huye y sale de la ficha; Berlo pelea.

### E. El reloj es la única regla de tiempo

**Antes.** TimeSystem tenía sus propias estaciones («verano», con `desde` y horas de luz propias) y el reloj otras. Podían discrepar en estación, franja y horas de luz.

**Ahora** (`src/world/Calendario.js`, nuevo):
- **Estaciones.** Duran 28 días: primavera, estío, otoño e invierno (año de 112 días).
- **Franjas.** Salen de `MUNDO.tiempo.franjas`. Amanecer a las 05:00 y anochecer a las 21:00.
- **Una sola fuente.** El reloj, TimeSystem, el clima (`verano` → `estio`), los eventos y la cabecera leen de ahí.

**Comprobado:**
- las franjas coinciden en las 24 horas;
- las estaciones coinciden en los días 0, 27, 28, 55, 56, 83, 84, 111, 112, 139 y 140;
- las horas de luz salen del anochecer del reloj;
- esperar más allá de la medianoche del día 27 pasa a estío.

### F. Ofertas de encargos por horas del mundo

**Antes.** Había una oferta cada 12 turnos, con el contador en memoria. Una espera de 2 h (12 pulsos) traía una oferta que la cortaba. Al cargar, el contador volvía a 0.

**Ahora** (`QuestSystem._evaluarOferta`):
- **Cadencia.** Mínimo `OFERTAS.cadenciaHoras` (3 h) desde la última oferta, en minutos absolutos del calendario. Cruzar la medianoche cuenta bien.
- **Una tirada por revisión,** con la probabilidad de todo el tiempo pasado: 1 − 0,8^tramos de 10 min. No hay doce tiradas por fragmentar.
- **Las esperas no revisan:** ni las cortan ni tiran. La revisión llega en el siguiente turno normal.
- **Sin nadie delante no hay oferta.**
- **Se guarda** en `quests.oferta {ultimaMinuto, revisadoMinuto}` y la migración la crea.

### G. Riesgo al esperar en sitio peligroso

**Antes.** Esperar no tenía ningún riesgo, en ningún sitio.

**Ahora** (`Exploration.riesgoAlEsperar`, llamado tras cada pulso de espera):
- **Probabilidad.** p30 = min(0,35; (peligro + peligro de rutas) × 0,07) × `ESPERA_RIESGO.factor`, y p = 1 − (1 − p30)^(minutos/30). Un paso de 5 minutos lleva el riesgo de 5 minutos.
- **Equivalencia.** Doce pulsos dan el mismo riesgo que 2 h de golpe: 0,4530 en la Linde del Cenizo.
- **Sin riesgo** en asentamientos, sublugares, peligro 0, con combate o con un encuentro delante, ni en las aclaraciones.
- **Gracia.** Se respeta la de siempre (`tocaEncuentro`).
- **Si sale,** la espera se corta en ese pulso: «Esperas 40 minutos. La espera se interrumpe: …».

**Medido:** 40 esperas de 2 h en el Camino del Norte (peligro 1) dan 12 con encuentro (30 %), frente a un teórico del 25 %.

### H. Hambre y sed fuera; comer cura vida en campamento

**Antes:**
- el hambre y la sed bajaban cada turno y en los viajes;
- restaban a las tiradas, quitaban vida y salían en la cabecera y en el narrador;
- los viajes gastaban raciones y pedían confirmación sin provisiones.

**Ahora** (`src/player/Comida.js`, nuevo; Vitals, Player, Inventory, Travel, DifficultyDirector, EffectApplier, ContextComposer, Instantanea, ProceduralProvider, StatsTracker, VitalsWidget, MapPanel y app.js):
- **Sin presión de hambre ni sed.** No bajan, no dañan, no penalizan, no se consumen solas, no salen en pantalla ni en el narrador. La fatiga sigue con sus reglas.
- **Campamento.** «acampo» lo monta en el estado (`world.campamento`, del lugar). «levanto el campamento» o irse del lugar lo deshace. Decir «estoy en un campamento» no lo monta.
- **Comer.** Solo en un campamento real cura el 25 % de la vida máxima (`COMIDA.curaVidaFraccion`), hasta el máximo, gastando una ración una vez. No da maná.
- **Cuándo se aclara sin gastar:**
  - fuera del campamento: «Comer solo te repone en un campamento…»;
  - con la vida llena;
  - sin comida;
  - en una orden compuesta.
- **Agua.** Beber ya no es una obligación: el odre no se gasta.
- **Lo que no cambia:** la poción sigue curando donde sea.

**Leído en la 9505:** en el campamento de Saucedo, con 1 de vida, «como una ración» da «recuperas 9 de vida», y las raciones bajan de 4 a 3.

---

## 4. Migración de guardados 8 → 9

`PERSISTENCIA.versionFormato` pasa a 9. La migración (`Migrations.js`):
- recalcula la estación y la franja con el Calendario (`verano` pasa a `estio`). El día, la hora, el minuto y `diasTotales` quedan intactos;
- crea `quests.oferta` con el instante del guardado, para que no haya ráfaga de ofertas al cargar;
- deja el hambre, la sed y la vida como estén (inertes);
- es idempotente.

Comprobado con un guardado v8 a mano («verano», franja «manana» a las 22:15), que pasa a «estio» y «noche». `auditar-borrados` sigue pasando por la 7→8.

---

## 5. Verificación

### Auditoría nueva: `tools/auditar-correcciones-diseno.mjs`

Cubre A–H y los arreglos del apartado 1. Cada caso hace una foto del estado antes y después: reloj, turno, vida, maná, fatiga, hambre, sed, inventario, reputación, actitudes, agresiones, combate y tiradas. Los fixtures van etiquetados como FIXTURE.

| Código | Resultado | Salida |
|---|---|---|
| **d4c3ad6** (final) | **113/113** | 0 |
| **3d44aa9** (base) | **28/100** | 1 |

Las importaciones son tolerantes, para que la base falle por el defecto y no por un import. En la base, los casos que revientan cuentan como un solo fallo; por eso el total es 100 y no 113. En la base falla cada sección:

| Sección | Bien | Mal |
|---|---|---|
| A | 5 | 18 |
| B | 7 | 9 |
| C | 3 | 12 |
| D | 5 | 8 |
| E | 3 | 5 |
| F | 0 | 3 |
| G | 0 | 4 |
| H | 4 | 11 |
| Escena | 1 | 2 |

Lo que pasa en la base son los **controles**: la negación, la cita, la condición, lo que ya se aclaraba y la poción. Los casos añadidos tras leer las partidas se comprobaron también en rojo **sin sus arreglos**, sobre este mismo código: 110/113.

### Suites y medidas (todo offline, en d4c3ad6)

| Orden | Resultado | Salida |
|---|---|---|
| `node tools/auditar-todo.mjs` | 31/31 auditorías con código 0 (incluida la nueva) | 0 |
| `node tools/auditar-servidores.mjs` ×3 (aislados) | 76/76, 76/76, 76/76 | 0, 0, 0 |
| `node tools/generar-sw.mjs --revisar` | `sw.js` al día | 0 |
| `node tools/buscar-secretos.mjs` | 307 commits mirados: ninguna clave | 0 |
| `node tools/medir-costes-campana.mjs --autoprueba` | 6/6; ninguna petición salió del equipo | 0 |
| `node tools/medir-costes-campana.mjs --turnos 100` | 200/200 turnos (9303 y 9505), 214 peticiones simuladas, 0 sobre presupuesto, 0 intentos de red; estimación $1,24–$1,94 por las dos campañas con Haiku 4.5 (no es una factura) | 0 |
| `node tools/medir-narrador.mjs` | 132 turnos, 5,6 % de frases repetidas, 0 coletillas, 0 genéricos, 25/25 preguntas atendidas | 0 |

Por el camino se actualizaron, sin perder cobertura: `auditar-coherencia-turnos` (148/148: contrato de civiles, Xivio con nombre, desgaste por fatiga), `auditar-tester` (71/71) y `auditar-borrados` (versión ≥ 8, pasando por la 7→8).

### Chrome (`node tools/regresion-app.mjs --capturas …`)

| Modo | Turnos | Fallos | Excepciones | Peticiones externas | SW | Sin red |
|---|---|---|---|---|---|---|
| móvil 390×844 | 20 | 0 | 0 | 0 | controla | arranca |
| `--desktop` 1440×900 | 20 | 0 | 0 | 0 | controla | arranca |
| `--sin-ia` 390×844 | 20 | 0 | 0 | 0 | controla | arranca; retrato de marcador |

**Píxeles mirados** en `03-partida-20-turnos` de los tres modos:
- La cabecera dice «Día 2 · al alba · nublado» y el texto «Esperas 30 minutos. Día 2, 05:30, al alba.». En el modo sin IA, 05:40 tras una espera desde las 05:10.
- En escritorio, la ficha lateral tiene Vida, Ánima y Vigor: **no hay barras de hambre ni sed**.
- En móvil, la caja de texto no tapa nada.

**Límite.** La regresión de Chrome no abre ningún combate, así que la identidad en la ficha del combate está comprobada en el motor (auditoría y partidas), no en píxeles.

### Dos partidas nuevas leídas enteras (motor sin ventana, proveedor procedural)

**9303, rastreadora, 25 órdenes:**
- «con la katana» y «con el cuchillo mágico» aclaran.
- «ataco a Zorvak» lista a quien sí está.
- «90 segundos» y «1e9 horas» aclaran; «media hora» se corta a los 20 minutos por el peaje, con la causa real.
- Comer fuera del campamento aclara.
- Viaje al Camino del Norte; allí «dos horas» se corta por Valcio.
- «acampo»; comer con la vida llena aclara; guardar y cargar; levantar el campamento.
- «voy a las Tumbas Bajas» no viaja (apartado 1.1).
- «hasta el anochecer», 9 h sin encuentro: con p ≈ 0,73 de que hubiera uno, sale así un 27 % de las veces; medido aparte, el riesgo se aplica.
- Descanso hasta el alba; guardar y cargar.

**9505, baluarte, 23 órdenes:**
- «cinco segundos» y «24:30» aclaran.
- «ataco a Zorvak» aclara; «con el cuchillo y el hacha» aclara.
- Ataque a Dalwen con consecuencias; Dalwen huye y sale de la ficha; derrota ante Berlo (apartados 1.3 y 1.4).
- Guardar y cargar con la agresión guardada.
- Viaje a Saucedo; la oferta de Dalvek, que sí está; «voy a la Linde» no viaja.
- Campamento y «como una ración»: +9 de vida, 4 → 3 raciones; guardar y cargar.
- «voy a Saucedo» estando allí (apartado 1.2).

En las dos, el hambre y la sed se quedan en 100 todo el rato y ninguna espera trae una oferta en medio.

**Antes de los arreglos del apartado 1,** estas partidas mostraban a Berger en el camino, a Valcio ofreciendo ya ido, a Eltín como guardia, «Dalwen espera tu respuesta» y al Dalwen huido en la ficha. Después, nada de eso.

---

## 6. Parámetros propuestos (ajustables, NO decisiones)

| Parámetro | Valor | Qué hace | Por qué este valor |
|---|---|---|---|
| `OFERTAS.cadenciaHoras` | 3 | Horas mínimas entre ofertas espontáneas | No traduce «12 turnos» a 12 h; como mucho unas 5 ofertas en un día jugado de punta a punta |
| `OFERTAS.probabilidadCada10Min` | 0,2 | Probabilidad por cada 10 min, una vez cumplida la cadencia | La de antes por turno |
| `ESPERA_RIESGO.factor` | 1 | Multiplica el riesgo por hora de esperar | 1 = el mismo riesgo por hora que explorar ese sitio |
| `COMIDA.curaVidaFraccion` | 0,25 | Vida que devuelve una comida en campamento | Cuatro raciones de inicio = una vida entera |
| `AGRESION.plantillaCivil` | `civil` | Ficha de un civil sin ficha propia | 10 de vida, 1d3, huye |
| `AGRESION.plantillaGuardia` | `guardia_corrupto` | Ficha del guardia que se mete | Es la única ficha de guardia. Pesa mucho para un nivel 1 (apartado 1.3); propongo una ficha `guardia` más ligera |
| Umbral `critico` de DifficultyDirector | ≥3 carencias y vida < 40 % | Al quitar el hambre, la sed y las provisiones, quedan vida, oro y curación | Para mantener el sentido de «crítico» con menos carencias |

---

## 7. Estado de git

- **Rama:** `feat/correcciones-diseno-20261006`, sobre `feat/preparativos-motor-20261006` (3d44aa9), con 21 commits de código, uno por cambio lógico, más el del informe.
- **Árbol:** limpio tras el commit del informe. `dist/` está ignorado (capturas de la regresión) y no se ha subido ningún binario.
- **`main`:** 8c02138, sin tocar.
- **Remoto:** subida a `origin` por orden expresa de Alejandro. Sin PR ni merge.
- **Historial:** sin reescribir; sin force-push.

**No es un «listo para lanzar».** Quedan abiertos los puntos del apartado 1: sobre todo el viaje por senderos (1.1) y qué pasa al perder una pelea (1.4). Además, el narrador real de IA y un móvil de verdad están sin probar.
