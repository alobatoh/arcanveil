# Prompt correctivo #4: armas por identidad, combate por menús, viaje y muerte permanente (7-oct-2026)

**Rama** `feat/menus-identidad-muerte-20261007`, sacada de `feat/correcciones-diseno-20261006` en **996e073**: el SHA revisado del encargo. Al empezar el árbol estaba limpio, sin trabajo local del #3 ni ramas posteriores, así que no había nada que conservar ni duplicar.

**HEAD del código: 8e4aa96.** Son 19 commits y 36 ficheros (+2264 / −436), más el commit de este informe.

- **`main`:** 8c02138 (24-sep), sin tocar.
- **Sin PR, sin merge ni publicación.** El encargo pide desarrollo local. Alejandro dejó dicho en el chat, dos veces (6-oct), que al terminar se suba la rama aunque el encargo diga lo contrario. Por eso la rama se sube a GitHub (solo la rama: sin PR, sin merge, sin tocar `main`). Esa autorización viene de él en el chat, no de un informe del repositorio.
- **0 euros.** Ni Groq, ni Anthropic, ni Gemini, ni Cloudflare, ni proveedores de imágenes. No hay pagos, cuentas, claves ni accesos nuevos. Todo se ha probado con el motor sin ventana, personajes ficticios («Sive», «Ena», «Lyra») y Chrome con perfil temporal aislado. No se han tocado partidas, galería ni datos reales.
- El procedural sigue siendo respaldo offline. **No se ha evaluado la calidad del narrador real de IA** (no hay un doble que valga para eso).

Las cifras de 996e073 (113/113, 148/148, 31 auditorías, Chrome) son históricas. Todas las cifras de este informe se han medido sobre ESTE código.

---

## 1. Primero, lo que falla o queda abierto

### Decisión que falta (una sola pregunta)

**¿El 35 % se hereda como experiencia acumulada o como puntos de habilidad? Si son puntos, ¿solo los disponibles o también los gastados?** Si es experiencia, falta además el redondeo de las fracciones (hoy las pruebas usan «a la baja» solo para medir) y si cuenta lo que ya venía heredado de una generación anterior.

Mientras no se decida, la herencia se **guarda** al morir (una por run, con cada base por separado) y **no se aplica**. Todo está en el apartado 6.

### Preexistente y SIN arreglar (fuera del alcance o del encargo)

1. **El guardia del pueblo sigue usando la ficha `guardia_corrupto`** (29-31 de vida, armadura). En la campaña 9505, una baluarte de nivel 1 muere contra Berlo en 14 turnos: Berlo baja de 31 a 16, y Dalwen sigue en la pelea a 10/10. El encargo pide no tocar la dificultad del guardia solo porque es duro: queda como propuesta (apartado 7).
2. **Encuentros duros a nivel 1.** En la campaña 9303, tres lobos cenicientos en la Linde del Cenizo matan a la rastreadora en dos turnos (32 → 15 → 0). Con muerte permanente se nota mucho más. No he cambiado el tamaño de los grupos: es balance.
3. **Un encuentro pendiente se queda la siguiente orden.** En la Linde, con «Manada se presenta y pide una decisión» pendiente, «como raciones mágicas» abrió el combate («No hay tiempo para hablar…»). No se gastó ninguna ración: la aclaración de identidad no llegó a hacer falta, pero la frase se tomó como respuesta al encuentro.
4. **El desgaste de las armas no ocurre nunca.** `CombatManager._desgastarArma` lee `inventory.equipado.manoPrincipal`, y la ranura se llama `armaPrincipal`. Por eso «está roto» en el menú solo se ha probado con un fixture (durabilidad 0).
5. **Logros que miran el estado.** `AchievementSystem` usa `this.store.estado`, que no existe (debería ser `getState()`). Las condiciones que miran el estado dan falso en silencio.
6. **Reductores que no existen.** `player/estados/fijar` (combate) y `player/estado/quitar` (economía) no tienen reductor.
7. **Nivel tras subir.** `app.js` lee `{nivel}` del aviso de subida de nivel, pero el aviso trae `nivelFinal`.
8. **La interfaz clásica** (`clasico.html`, `CombatPanel.js`) no está adaptada al menú. Su botón Atacar manda `combat:action` sin ataque, y el motor ahora lo rechaza: en esa interfaz no se puede atacar. La interfaz viva es `app/`.

### Límites de lo hecho

- **La muerte permanente es coherencia local, no antifraude.** Borrar los datos del navegador, editar el almacenamiento o importar el guardado en otro equipo se la salta. Además, «Borrar partidas y personajes» borra también las marcas de muerte y las herencias (borra todo `arcanveil:*`).
- **Guardar en mitad de un combate** solo vale en el turno del jugador. Con el enemigo actuando, no guarda y lo dice. El botón «Menú» de la app guarda y recarga: si se pulsa justo mientras actúa el enemigo, se pierde lo jugado desde el último guardado.
- **Las maniobras por texto** («le lanzo arena a los ojos») solo valen contra alguien nombrado. Los ataques con daño solo van por el menú, así que se pierde el +1 de creatividad que daba «arena y golpe» en una sola frase.
- **La causa de la muerte** nombra a todos los enemigos de la pelea, aunque alguno no llegara a pegar («contra Dalwen y Berlo»).
- **Sin probar:** el narrador real de IA, un móvil físico (solo Chrome con viewport de 390×844) y un jugador humano.

### Encontrado al leer las campañas, y arreglado aquí

| Leído en | Qué pasaba | Arreglo |
|---|---|---|
| 9303 | La rastreadora lleva el cuchillo de caza en la mano secundaria y el menú solo le daba «Golpe 1d3»: peleaba a puñetazos con un cuchillo empuñado | Cada arma empuñada con daño da su ataque; un escudo no cuenta (e57dcba) |
| 9505 | Guardar en mitad de la pelea dejaba la fase «combate» sin combate al cargar | Combate guardable en tu turno y restaurado con ficha nueva; los guardados viejos vuelven a explorar (06e64b6) |
| prueba | El router narraba «recuperas 8 de vida» aunque el inventario no hubiera gastado el objeto | Solo se narra la cura si el inventario la ha gastado de verdad (6b5da0f) |
| probe | «voy a la posada» entraba y a la vez decía «No conoces ningún sitio llamado posada»; con «salgo de la posada» estando dentro respondía «No estás dentro» | Entrar y salir se narran como tales (192fe82) |
| interpretación | «No voy a darte mis monedas» se leía como un viaje a «darte mis» | «voy a + infinitivo», también con clítico, es futuro, no viaje (192fe82) |
| reproducción | «mientras Korsa mira, ataco a Zorvak»: lo de «mientras» era el foco y el ataque se narraba («atacas a Zorvak») sin pasar por el motor | Lo de «mientras» es circunstancia, no la acción del turno (c70c519) |

---

## 2. Objetos por identidad (armas y comida)

**Reproducido en 996e073** (semilla 9303, Sive, con arco corto y cuchillo de caza; sin katana):
- «ataco a Korsa con katana» y «ataco a Korsa usando la katana» abrían pelea, cobraban 10 minutos, agresión y reputación.
- «como raciones mágicas» se comía una ración normal.

Auditoría: 28/50 en la base.

**Causa:**
- `ArmaPedida.noEsObjeto` tomaba cualquier palabra desconocida sin artículo por un modo, como «con calma».
- Solo se miraba «con», no «usando».
- La comida casaba por el prefijo de la palabra.

**Contrato** (`src/inventory/IndiceObjetos.js`, compartido por armas y comida):
- **El índice.** Es un `Map` derivado del inventario VIGENTE en cada consulta. No se guarda ni se cachea: no puede quedarse viejo tras cargar, coger, gastar, romper, equipar o cambiar de personaje. El estado serializable sigue siendo el objeto plano.
- **Claves explícitas.** El nombre completo y el sustantivo de cabeza, normalizados (sin tildes, sin paréntesis, en singular), más «arma» para lo empuñado. Lo dicho tiene que ser UNA clave entera: «cuchillo mágico» no es «cuchillo», ni «ración de oro» es «ración».
- **Ambigüedad.** Objetos distintos con la misma clave se preguntan («¿Con cuál…?», «¿Cuál…?»). Las copias del mismo objeto (dos montones de raciones) no.
- **Armas:**
  - El instrumento puede ir tras «con», «usando», «utilizando», «empleando», «mediante», «valiéndome de»…
  - Los modos son una **lista cerrada** (calma, sigilo, fuerza, rabia…); el cuerpo y la magia siguen sus reglas.
  - La gente conocida no es un objeto («con Korsa mirando»).
  - Se validan todos los instrumentos coordinados.
  - Una herramienta real (la cuerda) sigue su regla de siempre.
- **Comida:**
  - Lo nombrado tiene que llevarse.
  - Lo genérico («algo», «comida») con dos comidas distintas pregunta cuál.
  - La cura solo se narra si se ha gastado de verdad.
  - Se mantiene la cura solo en campamento real, con el tope de vida, un consumo y el maná intacto.
- **La parte mecánica sale del ID elegido.** El texto solo da la intención. En combate, el menú manda el `itemId` del ataque y el motor lo revalida antes de resolver.

**Después:** 50/50 (`tools/auditar-identidad.mjs`).

---

## 3. Destinatario: quién recibe el ataque

**Reproducido en 996e073:** «ataco a Zorvak mientras Korsa mira» pegaba a Korsa, que solo miraba. Lo mismo con «delante de Korsa», «, que está junto a Korsa», «con Korsa mirando» y «mientras Korsa mira, ataco a Zorvak». Además, la situación del peaje abría su pelea contra Xivio con «ataco a Korsa mientras Xivio mira».

**Contrato** (`src/engine/Destinatario.js`):
- **Qué se lee.** El destinatario es el verbo de ataque, su «a / al / contra» y lo que sigue hasta «mientras», «delante de», «con», «y» o la coma.
- **Quién lo usa.** Con la misma regla, `ActionRouter._blancoDelAtaque` y `SituationSystem.intervenir`. Un ataque es de la situación solo si su destinatario es de los suyos.
- **Circunstancias.** `Segmentos` trata lo que empieza por «mientras» como circunstancia, no como la acción del turno.
- **Lo que no es ataque:** citas, negaciones, condiciones y recuerdos.

**Después:** los 12 casos del destinatario de `auditar-identidad`, en verde.

---

## 4. Combate por menús

**Reproducido en 996e073** (código):
- `accionJugador` caía al **enemigo más débil** si el objetivo no valía (inexistente, aliado, caído).
- Usaba siempre `ataques[0]`.
- El texto libre atacaba al primero de la lista.
- No había ficha de turno: una orden vieja o repetida actuaba.

Auditoría de menús: 0/20 en la base (el motor no tenía menú).

**Contrato del motor** (`CombatManager`):
- **`turnoToken()`.** Ficha del turno del jugador: combate + número de turno.
- **`accionesDelJugador()`.** Ataques reales del equipo (id, arma, daño, alcance, coste «sin coste», disponible o motivo), enemigos vivos con nombre e id distintos, y consumibles con si se pueden usar.
- **`ejecutar({tipo, token, ataqueId, itemId, objetivoId})`.** Valida ANTES de mutar: la ficha, el ataque disponible, el arma en la mano y que sea la del ataque, el objetivo vivo y enemigo, y el objeto usable (la comida, solo en campamento). Si no vale:
  - el turno sigue abierto;
  - se dice por qué;
  - no hay tirada ni coste, ni se ataca a otro.

  Una ficha sirve una sola vez: el doble clic o el Enter repetido no actúan dos veces.
- **Lo que se ha quitado.** Fuera `_objetivoPorDefecto` y el «primer ataque» implícito. La vía antigua (`combat:action`) pasa por la misma validación.
- **Texto libre en combate:**
  - los ataques van al menú («En combate se ataca desde el menú…»), sin gastar la ronda;
  - una maniobra, solo contra alguien nombrado;
  - defender, huir, hablar y curarse siguen por texto.
- **El arma de la segunda mano** también da su ataque.
- **Guardar y cargar.** Ver el apartado 1 (límites) y 06e64b6.

**Interfaz** (`app/app.js`, decisión técnica, no dictada):
- **Las etapas.** Menú principal → Atacar → elegir ataque → elegir enemigo (tocando su fila) → «Atacar a X», con ataque, objetivo, daño, alcance, coste y vida a la vista. Solo ese botón ejecuta.
- **Volver y cambiar** no gastan nada; Escape vuelve una etapa.
- **Las filas** de enemigos solo se pulsan al elegir a quién.
- **Turno nuevo.** Con la ficha de un turno nuevo, la selección se borra aunque el enemigo de antes siga en pie.
- **Lo que deja de valer** se dice y se vuelve a elegir.
- **Accesibilidad.** Etapa con `aria-live`, foco visible, menú bloqueado mientras se resuelve.
- **Otras acciones.** Defender y Huir dicen su coste; Objeto lista los consumibles con su motivo.
- **Estilo.** La referencia funcional son los combates por turnos clásicos, con el aspecto de Arcanveil: ni logos, ni sprites, ni música de terceros.

**Después:** 37/37 (`tools/auditar-combate-menus.mjs`). En Chrome: la pelea del grupo por menús, con captura de cada etapa y triple clic en «Confirmar», da un golpe, al elegido.

---

## 5. Viaje real

**Reproducido en 996e073:** Saucedo → «voy a la Linde del Cenizo» (y Camino del Norte → «voy a las Tumbas Bajas») daba «Llegas a las afueras de Saucedo… ¿Hacia dónde?», no se movía y cobraba 10 minutos. «Sí» no reanudaba nada. «voy a Saucedo» estando allí narraba el camino y cobraba.

**Causa demostrada:** `extraerObjetivo` probaba «a» antes que «a la». Capturaba «la Linde», el artículo cortaba la captura y el destino se perdía. Control en la base: «voy a Linde del Cenizo» (sin artículo) sí viajaba. No tenía nada que ver con el peligro ni con el tipo de ruta.

**Contrato:**
- **Destino concreto:** se viaja (reloj, ubicación y progreso del motor) o se presenta el encuentro real que lo interrumpe.
- **Sin destino, destino desconocido o «ya estás aquí»:** aclaración con los caminos que hay, sin tiempo ni movimiento.
- **Viaje interrumpido:** se reanuda lo que queda (no la distancia entera) y solo hacia el mismo destino. Otro destino a medias se explica.
- **Doble `viajar`:** un solo viaje.
- **Entrar y salir** de un sitio del pueblo («voy a la posada», «salgo de la posada») funcionan como tales.
- **Lo que no se ha tocado:** el mapa, la dificultad y los encuentros.

**Después:** 21/21 (`tools/auditar-viaje.mjs`). Las dos campañas viajan Vado → Saucedo → Linde de verdad.

---

## 6. Muerte permanente y legado

**Reproducido en 996e073** (semilla 9505, baluarte, atacando a Dalwen; Berlo se mete): tras 14 turnos, vida 0/34, el combate acaba y «miro alrededor» no contesta nada. `CombatManager` emite `player:defeated` y en el motor nadie lo escucha. La interfaz ofrecía «Volver en ti», que devolvía al personaje con 1 de vida.

**Contrato:**
- **Controlador** (`src/player/Muerte.js`): único. Escucha las dos caídas (combate y agotamiento) y fija `meta.muerte` (run, causa, momento del mundo, resumen) y la fase `fin` **una vez**. Cierra el viaje y el encuentro. Emite `run:ended`. Los rasgos de clase que evitan caer siguen siendo reglas de clase, y la muerte de un compañero o de un PNJ no pasa por aquí.
- **Después de morir:**
  - el turno lo dice («La crónica de Sive ha terminado: ha muerto…»), así que la caja nunca queda muda;
  - no se abre combate, no hay curas ni experiencia tardía, y no pasa el tiempo;
  - fuera `player/revivir` y «Volver en ti».
- **Identidad:** `meta.runId` en cada partida nueva.
- **Marca durable** (`src/persistence/RegistroRuns.js`, `arcanveil:runs-muertos`): escribe y relee, y si falla (almacenamiento lleno) lo dice en la pantalla en vez de prometerlo.
- **Guardados:**
  - un run muerto no carga, ni su final ni una ranura anterior del MISMO run;
  - la lista los marca como «Muerto» y «Continuar» no los ofrece;
  - las demás partidas cargan;
  - dos «Sive» distintas no se confunden.
- **Interfaz:** pantalla final con la causa, el momento, el resumen y la herencia pendiente, dicha sin prometerla. Ofrece «Nueva partida» (motor limpio, elección de personaje) y «Volver al menú». La plantilla del personaje (`CharacterRoster`) se puede reutilizar como apariencia, pero la partida nueva es un run nuevo a nivel 1.
- **Migración 9 → 10** (formato 10):
  - `runId` estable si falta, sacado de la semilla, la creación, el personaje y la plantilla: idempotente y sin juntar por nombre;
  - un guardado a 0 de vida pasa a resultado terminal;
  - uno vivo sigue vivo;
  - sin fecha de creación se avisa de que la identidad sale de la semilla y del personaje.

**Legado** (`src/player/Legado.js`, PREPARADO, NO APLICADO):
- **La fracción.** `FRACCION_LEGADO = 0.35` es una constante del contrato, no un parámetro de balance. `LEGADO_CONFIRMADO = null`.
- **La foto al morir.** `xpAcumulada`, `xpHeredadaIncluida`, `puntosHabilidadDisponibles` y las habilidades invertidas, cada una por separado; no se suman estadísticas. Se guarda una por run en `arcanveil:legados`.
- **`calcularLegado`.** Es pura, por modalidad:
  - 100 → 35, 200 → 70 y 0 → 0 de experiencia;
  - con 103 y 1 la fracción se calcula, y el redondeo productivo sigue pendiente;
  - con 10 puntos disponibles salen 3;
  - los puntos totales **no se calculan**, porque los gastados no tienen un contador fiable;
  - un valor corrupto no hereda nada.
- **`aplicarLegado`.**
  - Sin confirmación no hace nada.
  - Con una confirmación DE PRUEBA, aplica una vez y a un sucesor distinto, por el canal normal (`player/xp`, que recalcula niveles y sus recompensas normales). Es una sola moneda: nunca experiencia y puntos a la vez.
  - No copia nivel, objetos ni habilidades.

**Después:** 40/40 (`tools/auditar-muerte.mjs`, que incluye la limpieza del logro).

---

## 7. Parámetros y propuestas (NO decisiones)

| Qué | Hoy | Propuesta | Por qué |
|---|---|---|---|
| `AGRESION.plantillaGuardia` | `guardia_corrupto` (≈30 de vida, armadura) | Una ficha `guardia` más ligera para el guardia del pueblo | En 9505 mata a una baluarte de nivel 1 sin que ella pueda con él |
| Grupos de encuentro a nivel 1 | 3 lobos en la Linde (los de siempre) | Revisar el tope de grupo con muerte permanente | En 9303, muerte en dos turnos |
| Redondeo del legado | sin decidir | «a la baja», si la base es experiencia | Lo más conservador; no se aplica hasta que se confirme |
| Lista de modos de ataque | cerrada (calma, sigilo, fuerza…) | Ampliarla con lo que salga en partidas reales | Lo que no está se trata como objeto pedido y se aclara |

---

## 8. Verificación (sobre ESTE código)

### Auditorías nuevas: rojas en la base real, verdes aquí

Base 996e073: un worktree aparte con la auditoría copiada. En la base, los casos que revientan cuentan como un fallo, por eso los totales no coinciden.

| Auditoría | 996e073 | 8e4aa96 | Qué pasa en la base |
|---|---|---|---|
| `tools/auditar-identidad.mjs` | 28/50 (salida 1) | **50/50** (0) | Controles: «con la katana», modos, cuerpo, negación, cita |
| `tools/auditar-viaje.mjs` | 6/20 (1) | **21/21** (0) | Vado → Saucedo y destinos **sin artículo**: el control que demuestra la causa |
| `tools/auditar-muerte.mjs` | 6/27 (1) | **40/40** (0) | Casos triviales: otra «Sive» viva, y «estable/idempotente» porque sin `runId` todo es `undefined` |
| `tools/auditar-combate-menus.mjs` | 0/20 (1) | **37/37** (0) | Ninguno: no había menú |

### Auditorías antiguas actualizadas, sin perder cobertura

Todas se actualizan por un **contrato nuevo**, que se dice en cada una:
- `auditar-tester`: «salgo del pueblo» ahora aclara sin gastar tiempo (antes, «afueras» + 10 minutos).
- `auditar-combate-libre` y `auditar-coherencia-turnos`: el ataque por texto en combate va al menú. El control se hace por el menú, contra el elegido.
- `regresion-app`: ya no hay «Volver en ti» ni segunda caída; ahora pantalla de muerte, ranura muerta y «Nueva partida». La pelea es por menús. «le golpeo» en combate va al menú.

### Suites y medidas sobre 8e4aa96 (todo offline)

| Orden | Resultado | Salida |
|---|---|---|
| `node tools/auditar-todo.mjs` | **35/35** auditorías con código 0 (por lotes, incluidas las 4 nuevas) | 0 |
| `node tools/auditar-servidores.mjs` ×3 (aislados) | 76/76, 76/76, 76/76 | 0, 0, 0 |
| `node tools/generar-sw.mjs --revisar` | `sw.js` al día | 0 |
| `node tools/buscar-secretos.mjs` | 327 commits mirados (todas las ramas): ninguna clave | 0 |
| `node tools/bundle.mjs` | `dist/arcanveil.html` (3256 KB), ignorado por git | 0 |
| `node tools/medir-costes-campana.mjs --autoprueba` | 6/6; ninguna petición salió del equipo | 0 |
| `node tools/medir-costes-campana.mjs --turnos 100` | 200/200 turnos (9303 y 9505), 214 peticiones simuladas, 0 sobre presupuesto, 0 intentos de red; estimación $1,24–$1,94 con Haiku 4.5 (no es una factura) | 0 |
| `node tools/medir-narrador.mjs` | 132 turnos, 5,6 % de frases repetidas, 0 coletillas, 0 genéricos, 25/25 preguntas atendidas | 0 |

### Chrome (`node tools/regresion-app.mjs --capturas [--desktop|--sin-ia]`, perfil temporal aislado)

| Modo | Sistemas | Turnos | Fallos | Excepciones | Externas | SW | Sin red | Salida |
|---|---|---|---|---|---|---|---|---|
| móvil 390×844 | 32 | 20 | 0 | 0 | 0 | controla | arranca | 0 |
| `--desktop` 1440×900 | 32 | 20 | 0 | 0 | 0 | controla | arranca | 0 |
| `--sin-ia` 390×844 | 32 | 20 | 0 | 0 | 0 | controla | arranca; retrato de marcador | 0 |

**Píxeles mirados** en los tres modos:
- **Las etapas del menú** (07a principal, 07b ataque, 07c objetivo, 07d confirmar, 07e tras el golpe). Atacar, Defender, Objeto y Huir llevan su dato. En la etapa de ataque se ve «Daga · 1d4 perforante · cuerpo a cuerpo · sin coste». En la de objetivo, la fila elegible está resaltada. En la confirmación se lee «Atacar a Saqueador B · Daga · … · 16/16 de vida», con el foco visible.
- **La pantalla de muerte** (08): «Lyra ha muerto», la causa con día, hora y lugar («en el Camino del Norte»), y la herencia «Todavía no se aplica». El foco está en «Nueva partida».
- **La partida nueva** (09): la elección de personaje.

**Corregido tras mirar los píxeles:**
- en el móvil, el panel tapaba la barra de arriba;
- el texto de ayuda de la caja se cortaba;
- salía «1 disponibles»;
- salía «en El Camino».

### Dos campañas nuevas leídas enteras (motor sin ventana, proveedor procedural)

**9303, rastreadora Sive:**
- «con katana» y «usando la katana» aclaran; «Zorvak mientras Korsa mira» aclara sin tocar a Korsa; «90 segundos» aclara.
- Espera cortada por el peaje; guardar y cargar.
- Viaje Vado → Saucedo (4 h) → **la Linde (7 h, llega)**.
- Espera de 2 h en peligro: aparece una manada; acampar.
- **Pelea por menú** contra tres lobos: ataca con el cuchillo de la otra mano, y la orden repetida se rechaza en cada turno.
- **Muerte** en dos turnos (vida 32 → 15 → 0): causa, run, herencia pendiente guardada, marca escrita. «miro alrededor» lo dice; la ranura anterior del run no carga.
- **Partida nueva (Ena):** run distinto, 32/32, sin muerte; viaja y guarda.

**9505, baluarte Sive:**
- «con el cuchillo y el hacha» aclara; «Zorvak mientras Dalwen mira» aclara; entra y sale de la posada; guardar y cargar.
- Ataque a Dalwen: Berlo se mete; la agresión queda registrada (guardia −20).
- **14 turnos de menú** (en el 1.º, Atacar → ataque → Volver → Volver, cancelado sin enviar nada), eligiendo a Berlo en cada turno; la orden repetida se rechaza siempre.
- **Muerte**, ranura anterior que no carga, y partida nueva con run distinto.

**FIXTURE** (y dicho en cada caso de las auditorías):
- vida 3 para la muerte rápida;
- fatiga 0 para la muerte por agotamiento;
- almacenamiento lleno;
- encuentro forzado en ruta;
- Dalwen que cae o huye con el menú abierto;
- arma fuera de la mano;
- un «Queso curado» con las reglas de la ración (el catálogo solo tiene una comida);
- un guardado viejo hecho a mano.

Las campañas de arriba son escena natural, sin fixtures.

---

## 9. Estado de git

- **Rama:** `feat/menus-identidad-muerte-20261007`, sobre 996e073. Son 19 commits de código y auditoría, uno por cambio lógico, más el del informe. 36 ficheros, +2264 / −436 (sin el informe).
- **Árbol:** limpio tras el commit del informe. `dist/` (capturas, bundle) está ignorado; no se ha subido ningún binario.
- **`main`:** 8c02138, sin tocar. Sin PR ni merge. Historial sin reescribir; sin force-push.

**No es un «listo para lanzar»:**
- falta la base del legado;
- quedan los preexistentes del apartado 1, sobre todo el guardia y los encuentros duros con muerte permanente;
- están sin probar el narrador real de IA, un móvil físico y un jugador humano.
