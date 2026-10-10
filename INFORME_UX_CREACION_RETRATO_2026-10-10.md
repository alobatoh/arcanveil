# Informe del encargo #12: orientación, creación libre y retrato disponible

10 de octubre de 2026. Rama `feat/ux-creacion-retrato-20261010`, que sale de `feat/borrado-durable-20261009` = `eebf67c` (árbol limpio al empezar; `HEAD`, remotos y árbol inspeccionados antes de editar). `main` no se ha tocado. No es «listo para lanzar» y **la usabilidad no está validada**: no ha jugado ninguna persona.

Queja de partida (jugador en PC): «aparece una scrollbar "como si fuese web", no resulta intuitivo y se pierde; intentó Pintar retrato y no pudo crear el personaje como quería».

---

## 1. Lo que sigue abierto o hay que saber primero

1. **Ninguna persona ha probado esto.** Hubo un playtester y tres inspecciones de revisor, todos agentes. El último veredicto del revisor es «aprobado con reparos», no «aprobado». Lo que dice este informe sobre orientación sale de medidas en Chrome y de capturas miradas, no de un jugador.
2. **El motor empieza todas las campañas en Vado del Yunque.** `src/world/World.js` escucha `player:created` esperando `{ raza }` y `src/player/Player.js` emite `{ jugador, inventario, contacto, deuda }`, así que el lugar de inicio por linaje no se aplica nunca. Es anterior a este encargo. **No lo he tocado**: cambiar dónde empieza cada campaña es una decisión de diseño. Lo que sí he hecho es quitar de la creación la frase «Empiezas en…», que prometía otra cosa. Decisión pendiente tuya: arreglar el motor o dejarlo así.
3. **El reparto de atributos solo sube el atributo principal del oficio.** Los datos traen también un «secundario» que el motor ignora (un Custodio sale con Carisma 8 siendo su secundario). Tampoco lo he tocado; la creación ya no anuncia «atributos fuertes: X e Y», solo el principal.
4. **El fallo intermitente de arranque del #10 sigue sin causa.** No se ha reproducido: 60/60 pestañas arrancaron en el diagnóstico final (mediana 156 ms) y 100/100 en una pasada anterior. No lo doy por cerrado. Lo que sí queda arreglado es la consecuencia: la pantalla «Preparando el motor…» ya no puede quedarse eterna (ver §6).
5. **Una pasada de la auditoría nueva falló una vez sin causa demostrada.** El combate de prueba no llegó a «tu turno» en 12 s (91/92). Subí la espera a 40 s y las nueve pasadas siguientes de ese caso salieron limpias. Mi hipótesis es que los turnos de los tres rivales tardaron más de 12 s; no la he probado.
6. **Pantallas de PC con poca altura.** A 1366×650 el paso «Origen» no cabe entero: desplaza dentro de su zona (rotulada y alcanzable con teclado) y «Siguiente» sigue a la vista. A 1280×600 la ficha desplaza 29 px dentro de su panel. A zoom 200 % (683×384) tras actuar se ven la acción y la tirada, y la narración queda en parte bajo el pliegue de su zona.
7. **«Algo contesta donde debería estar el generador».** El playtester vio ese mensaje en un equipo sin generador. Coincidió con una tanda de pruebas mía, cuyos dobles escuchan en ese puerto para otra dirección. Al terminar la tanda, la misma comprobación desde su navegador daba conexión rechazada. Es mi explicación más probable; no lo reproduje a propósito.
8. **Sin probar:** narrador LLM real (Groq sigue sin permiso), ComfyUI o cualquier modelo de imagen real, el arte que saldría, el hardware del jugador, un móvil físico, otros navegadores que no sean Chrome, lector de pantalla real. El PNG del proveedor falso es de 1×1: prueba la mecánica, no el arte.
9. **Maná / Ánima:** siguen presentes, sin renombrar ni retirar. Los contratos del #11 (Coordinación v4, invalidados/época, recibos durables, muertes mínimas, herencia 35 % XP) no se han tocado y sus auditorías siguen en verde.
10. **Servidores 79/79, no 80:** este Windows no deja crear el enlace simbólico de fichero (igual que en #9, #10 y #11).
11. **Coste: 0 €.** Sin tarjetas, APIs de pago, suscripciones ni servicios reales. Todo local, con perfiles temporales, dobles y proveedor de imágenes falso. No se han tocado partidas, retratos ni cookies reales (las pruebas usan `127.0.0.1` y contextos aislados; tu demo vive en `localhost:8080`). No se ha instalado nada en el PC. No se ha usado Haiku.
12. **Push:** el encargo no concede permisos remotos y dice que un informe no prueba una autorización. La subida de esta rama la hago por tu norma del 6 de octubre («al acabar un trabajo, push de la rama sin preguntar»), que es anterior e independiente de este informe. Nunca `main`, PR, merge ni force-push.

## 2. Base, HEAD y diff

- **Base:** `eebf67c` (= `origin/feat/borrado-durable-20261009`).
- **HEAD de código:** `e28cc8e`. El informe va en un commit aparte encima.
- **Commits:**
  - `5625b54` el sondeo del generador tiene plazo, se cancela y no promete nada (`src/art/candidata.js`);
  - `5da6c19` el dibujo del juego como imagen elegible (`src/art/dibujo.js`, galería, plantel);
  - `927dcf1` crear eligiendo, imagen sin generador y partida en «Ahora/Historial» (`app/`);
  - `aea7111` pruebas adaptadas a los pasos (regresión, retrato, bundle);
  - `52c0b3d` conductor de Chrome con barras visibles y diagnóstico de arranque;
  - `4f64e6e` lo que destapó la auditoría;
  - `d7b1110` auditoría UX en Chrome;
  - `54701bf` lo que rechazó la revisión y lo que vio el playtest;
  - `bef012d` garantías de pruebas adaptadas;
  - `e28cc8e` auditoría ampliada a 118 comprobaciones.
- **Diff `eebf67c..e28cc8e`:** 16 ficheros, +3435 / −539.

## 3. Flujos reales, antes y después

Medido en Chrome con barras de desplazamiento dibujadas (la regresión las oculta con `--hide-scrollbars`; por eso no las veía).

| | Antes (`eebf67c`) | Después (`e28cc8e`) |
|---|---|---|
| Creación a 1366×768 | Una página de 1181 px de alto en una ventana de 749: barra del navegador. Sin ningún selector: linaje, oficio y pasado solo con el dado | Cuatro pasos (Origen, Quién eres, Aspecto, Revisar) que caben sin desplazar la página, con «Siguiente» a la vista |
| Creación a 390×844 | 1633 px de alto en 840 | Sin desplazar la página; lo que desplaza es una zona con nombre |
| Elegir personaje | Imposible: solo «tirar» | Tres listas (8 linajes, 8 oficios, 10 pasados); lo elegido a mano queda marcado y el dado no lo toca |
| Imagen sin generador | «Es lo que la IA pintará». El estudio afirmaba un servicio en la nube que no existía y daba un comando de consola | «Dibujo del juego» (sin IA, sin instalar nada), con pelo, ojos, cara y rasgos. Pintar con IA dice que necesita un generador y se comprueba al pulsarlo |
| Partida a 1366×768 | El relato, de 1275 px en una caja de 400; el panel derecho, 1127 px en 567, con barra vertical y horizontal | «Ahora» enseña solo el turno en curso; «Historial», todo. Panel derecho en pestañas; ficha y mapa caben sin barra |
| Ficha en partida | FUE/CON/INT/SAB siempre 10: leía claves que el motor no tiene | Los seis atributos del motor, con su nombre |
| Arranque con un archivo perdido | «Preparando el motor… build 7» para siempre | «No ha podido cargar» y botón «Recargar» |

Subconjunto de la auditoría nueva contra la base (`--solo J,Arranque,A`): **1/6**. Los casos añadidos tras la revisión (B2 y G2) contra el estado anterior a esas correcciones (`d7b1110`): **0/8** (por ejemplo, hueco de −18 px para «El de su linaje»).

## 4. Qué se ha hecho, por apartado del encargo

**§1 Orientación**
- La partida es un espacio fijo: no desplaza la página en ningún tamaño probado.
- «Ahora» abre con tu acción y se lee desde el principio; «Historial» conserva dónde ibas. Si llega una respuesta mientras lees el historial, no te mueve ni te quita el foco: avisa («Respuesta nueva · volver al presente»).
- Los paneles (Ficha, Bolsa, Mapa, Encargos, Gente) son pestañas en PC y una hoja con «Volver a la historia» en estrecho; abrirlos no mueve la lectura ni el relato.
- Viajar desde el mapa abre su propio turno («Viajo a…»). Antes la narración se colgaba del turno anterior.
- El lugar está rotulado siempre; con poca altura, junto a las pestañas del relato.
- Las barras que quedan son interiores, finas y teñidas, y solo cuando el contenido desborda de verdad (historial largo, bolsa de 40 objetos).

**§2 Elegir personaje**
- Cada elección explica qué es y qué cambia en reglas, y la ficha de al lado es la que calcula el motor (`previsualizar`), no una estimación.
- Volver atrás por cualquier paso conserva todo, incluido el dibujo editado y la imagen elegida.
- Un error lleva a su paso, enfoca el campo y no borra nada.
- «Guardar y crear otro» crea otra identidad sin pisar la primera; editar el mismo personaje no crea un gemelo.

**§3 Retrato**
- El generador no se sondea solo: llegar a la pantalla no pide nada a ningún puerto. Se mira cuando el jugador pulsa la opción o «Comprobar».
- El sondeo tiene plazo (4 s), se aborta de verdad y distingue «cancelada» de «tiempo agotado».
- Estados: disponible en este equipo, disponible por la nube (solo si el puente lo declara), no disponible, generador caído, tiempo agotado, cancelada. Nube, envíos y caché solo se mencionan con un generador verificado.
- Cerrar a media generación la cancela en el generador y no guarda nada.
- La alternativa jugable es el dibujo del juego: se guarda como imagen del personaje (PNG en la galería local) y se dice lo que es («No es IA: no sigue toda tu descripción»). El procedural sigue siendo respaldo, no sustituto del narrador LLM.
- Sin comandos ni puertos a la vista del jugador; están en `IMAGEN_LOCAL.md`.

**§4 Arranque:** diagnóstico ampliado (URL abortada e iniciador, estado del service worker, módulos) y vigilante en línea que avisa a los 12 s o cuando falla el módulo principal. Sin reintentos ciegos.

**§5 Contratos:** intactos; sus auditorías, en §8.

## 5. Proceso: roles, modelos y qué vieron

No hubo trabajo en paralelo sobre el código: un solo programador y, por fases, revisor y playtester sobre la misma rama.

| Rol | Quién | Modelo |
|---|---|---|
| Programador | yo, en esta sesión | Opus 5.5 |
| Revisor (3 inspecciones) | agente `disenador-ux-juego`, una instancia nueva por inspección | `opus` según su definición |
| Playtester | agente `qa-funcional`, con el navegador integrado | `opus` según su definición |

La primera inspección sí fue un agente distinto de las otras dos; no pude continuar el mismo, así que cada una recibió por escrito lo que la anterior había rechazado.

**Inspecciones del revisor (miró PNG; no ejecutó pruebas):**
1. **Rechazado**, 3 bloqueos: promesa de lugar de inicio falsa; volver desde «Aspecto» perdía dibujo e imagen; desplegables ilegibles a 390 px. Más ocho importantes (combate cortado, vida sin actualizar, dos «Vigor», caja de la revisión cortada, cicatriz invisible, comando en la ayuda, franja de estado en móvil, vida invisible en pantallas bajas).
2. **Rechazado**, 1 bloqueo: «De su linaje» seguía sin caber entre 381 y 414 px y ninguna captura lo enseñaba (mi captura usaba «pelo negro»). Más cuatro importantes: ficha con barra a 1366×768, hoja del mapa de 45 px a zoom 200 %, táctiles por debajo de 44 px, dos «+N» sin rótulo. Abrió 40 de 51 capturas.
3. **Aprobado con reparos.** Abrió 30 de 57 capturas. De sus reparos atendí después los dos que tocan la queja (clic muerto en «Retrato pintado con IA»; PC con poca altura) y el de las pestañas en dos filas. **Esas últimas correcciones no han pasado por una cuarta inspección**: están medidas por la auditoría (118/118) y miré yo tres capturas.

**Playtester (agente, no persona):** 10 tareas a 1366×768 y parte a 390×844, unos 15 minutos, 88 acciones. Sus capturas de escritorio le llegaban reducidas a 800×450 y no ve los desplegables nativos abiertos; lo dijo él.
- Logradas: nombre e historia, historial y vuelta, paneles, cambiar la imagen en escritorio.
- Logradas con dudas: origen, aspecto, revisión, empezar, seis turnos, móvil.
- No lograda: cambiar la imagen en móvil (el botón no estaba). Corregido.
- Dudas que apuntó y corregí: lugar de inicio distinto del prometido, «Atributos fuertes» que la ficha desmentía, «Lo tiró el dado» sin haber tirado, «soltar», linajes sin explicar, «▴» sin texto, casilla «Barba» sin efecto en Ferrano, viaje colgado del turno anterior, listas cortadas.
- Dudas que apuntó y **no** he tocado: ver §7.

## 6. Arreglos con su prueba

| Arreglo | Prueba |
|---|---|
| Sondeo con plazo, abortado y cancelable | `auditar-ux` caso J (3), `auditar-retrato` |
| Sin generador: no se afirma nube, envío ni caché; sin comandos | `auditar-ux` caso D (10 variantes: nadie escucha, otro programa, sin CORS, generador caído, sin credenciales, colgado, cancelado…) |
| Cerrar a media generación la cancela y no guarda | caso D |
| Con generador falso: comprobar, pintar, otra versión, usar, recargar y sin red | caso C |
| Lo elegido llega al motor tal cual; la ficha es la del motor | caso A |
| Volver, avanzar, editar, error enfocado, «crear otro» | casos B y B2 |
| Historial sin robar lectura ni foco | caso E |
| 20 turnos, paneles, viaje desde el mapa | caso F |
| Narración de 30 párrafos, bolsa de 40, doble clic, combate de tres | caso H |
| Tamaños (1440×900, 1024×768, 1366×650, 1280×600, 390×844, 320×568, zoom 200 %), letra grande, teclado, Escape, toque | caso G |
| Desplegables medidos opción a opción a 390, 393, 412 y 320 px; táctiles de 44 px; imagen desde la ficha | caso G2 |
| Partida sin imagen y ficha antigua sin `aspecto` | caso I |
| Archivo perdido al arrancar | caso Arranque |

Garantías antiguas que cambian de forma (no se ha borrado ningún caso):
- `regresion-app`: antes exigía que al volver a «Aspecto» se propusiera el dibujo; era el fallo. Ahora exige que se recuerde «Sin imagen».
- `regresion-app`: antes exigía «pintar con IA» apagada sin comprobar. Ahora pulsarla comprueba; se sigue exigiendo que el dibujo sea lo elegido y cero peticiones al generador sin un gesto.
- `auditar-retrato`: la ayuda ya no trae el comando; se exige que remita a `IMAGEN_LOCAL.md` y que ese documento sí lo tenga.
- La comparación de dibujos de mi propia auditoría era vacía (no normalizaba los ids del SVG): corregida.

## 7. Pendientes que dejo apuntados

Del revisor y del playtester, sin tocar:
- Con generador, la comprobación se olvida al salir del paso «Aspecto».
- Jerga en el estudio cuando sí hay generador («ComfyUI», «caché temporal del puente»).
- La barba del dibujo se lee como sombra; «Otra cara» cambia poco a ojo (las seis caras son distintas, medido).
- Táctiles aún por debajo de 44 px: «Otra cara» (38), casillas de rasgos (36), pasos (40), píldoras «Comprobar» y «dejar al azar» (~16).
- La línea «Vida · Ánima · Energía · Oro» se repite en la hoja «Ficha» en móvil.
- La ficha de partida no enseña habilidades, rasgos, descripción ni historia; el «+3» de sus atributos no tiene leyenda (en creación sí).
- Viajar es un clic sin deshacer, también a un destino «peligroso».
- Textos pequeños y tenues en la cabecera; «Tocado» en masculino para una «ella».
- En móvil la barra «¿Sin ideas?» aparece sola y encoge el relato.
- Los avisos emergentes se han bajado para no tapar «Guardar», pero **no hay captura con un aviso abierto**: no sé si ahora tapan otra cosa.
- El historial está limitado por lo que guarda el estado (`narrativaMax`), no por la interfaz.

Del narrador procedural (fuera de este encargo): «miro alrededor» resuelto como trato social fallido; un personaje presente y «ni rastro» en la misma respuesta; preguntas sin contestar; el reloj sin avanzar tras un viaje de 3 h; el cielo «limpio» con la cabecera en «nublado».

## 8. Comandos oficiales sobre `e28cc8e` (árbol limpio antes y después)

**Node** (cada uno en su proceso):

| Comando | Exit | Total | Duración |
|---|---|---|---|
| borrado-durable | 0 | 43/43 | 10 s |
| token-guardado | 0 | 43/43 | 7 s |
| tokens-durables | 0 | 28/28 | 22 s |
| guardado-coordinado | 0 | 36/36 | 10 s |
| muertes-coordinadas | 0 | 23/23 | 6 s |
| legado | 0 | 94/94 | 11 s |
| creacion | 0 | correcto | <1 s |
| retrato | 0 | 36/36 | 1 s |
| puente-uso | 0 | 20/20 | 1 s |
| identidad | 0 | 50/50 | 17 s |
| combate-menus | 0 | 37/37 | 16 s |
| viaje | 0 | 21/21 | 7 s |
| muerte | 0 | 34/34 | 24 s |
| cierre | 0 | 39/39 | 17 s |
| recuperacion | 0 | 36/36 | 14 s |
| ranuras | 0 | 20/20 | 15 s |
| correcciones-diseno | 0 | 113/113 | 74 s |
| servidores | 0 | 79/79 | 7 s |
| `auditar-playtest --salida dist/playtest-ux-creacion` | 0 | 25/25 | 29 s |
| bundle | 0 | 8/8 | 4 s |
| sw | 0 | 12/12 | <1 s |
| coherencia | 0 | correcto | <1 s |
| `generar-sw --revisar` | 0 | al día | <1 s |
| doble-candados | 0 | 17/17 | 136 s |
| **auditar-ux** (nueva) | 0 | 118/118 | 155 s |
| auditar-todo (agregado) | 0 | 47/47 con código 0 | 696 s |

**Chrome** (`regresion-app.mjs --capturas`, una pasada aislada por modo y semilla):

| Modo | Semilla | Exit | Duración | Capturas | Sistemas / turnos / excepciones / fallos / externos |
|---|---|---|---|---|---|
| móvil | 20261008 | 0 | 159 s | 52 | 32 / 20 / 0 / 0 / 0 |
| móvil | 505 | 0 | 162 s | 52 | 32 / 20 / 0 / 0 / 0 |
| `--desktop` | 20261008 | 0 | 167 s | 52 | 32 / 20 / 0 / 0 / 0 |
| `--desktop` | 505 | 0 | 171 s | 52 | 32 / 20 / 0 / 0 / 0 |
| `--sin-ia` | 20261008 | 0 | 155 s | 50 | 32 / 20 / 0 / 0 / 0 |
| `--sin-ia` | 505 | 0 | 162 s | 51 | 32 / 20 / 0 / 0 / 0 |

La captura de más en una pasada es `09f-herencia-otra-pestana`, que solo se toma cuando gana la otra pestaña (condición de carrera ya existente en la prueba).

**Diagnóstico de arranque** (`diagnosticar-arranque.mjs`): exit 0, 13 s, 60 pestañas, 60 arrancadas. No reproducido.

**Fallos y cortes durante el trabajo** (todos anteriores al HEAD final): la pasada 91/92 de §1.5; y las pasadas rojas esperadas al añadir comprobaciones nuevas (el paso «Origen» dejó de caber al añadir una frase; el alto del relato a zoom 200 % bajó a 101 px; el mapa enseñaba dos destinos de tres; «Cerrar sin cambiar» fuera de pantalla en el diálogo a 390 px). Las cuatro se corrigieron en el producto, no en la prueba.

**Transcripciones del playtest** (`dist/playtest-ux-creacion/playtest-5.md` y `playtest-24.md`): leídas. Narran con el procedural, sin errores de motor; no ejercitan la interfaz de este encargo.

## 9. Capturas

- Antes: `dist/ux-antes/` (creación, revelación, estudio sin puente y partida a 1366×768 y 390×844, con `datos.json`).
- Después: `dist/ux-creacion/` (67 PNG de la última pasada). Las que miré yo en esta ronda: origen, aspecto, revisar y partida a 1366×768; aspecto, partida, hoja y diálogo a 390×844; partida a 320×568; partida y hoja a zoom 200 %; combate; panel del mapa; origen a 1366×650; partida a 1280×600 y 1024×768.
- Regresión: `dist/regresion-ux-creacion/<modo>-<semilla>/`.

`dist/` no va al repositorio.

## 10. Decisiones tuyas

1. Lugar de inicio por linaje: ¿arreglar el motor o dejar Vado del Yunque para todos?
2. Reparto de atributos: ¿debe contar el atributo secundario del oficio?
3. «Energía» como nombre de la barra de descanso (había dos «Vigor»). Es un rótulo: se revierte en una línea.
4. Viajar desde el mapa con un clic: ¿confirmación para destinos peligrosos?
5. Una cuarta inspección y, sobre todo, una prueba con una persona antes de dar la orientación por buena.
