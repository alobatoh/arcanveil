# Backlog para ARCANVEIL a partir de las reseñas de «AI Game Master»

21 de octubre de 2026. Rama `feat/replica-entrepreneur-ai-game-master-20261021`. Análisis hecho con `/replica-entrepreneur` sobre la app de referencia (Google Play `com.aisuccess.ai_game_master`, App Store id 6475002750, de Digital Dynasty Entertainment Inc).

## Lo que hay detrás de este documento

- **Muestra: 168 reseñas reales y únicas de 2 fuentes:**
  - Google Play: 60 en español y 60 en inglés, las más recientes.
  - App Store de EE. UU.: 50 reseñas, del RSS oficial de Apple.
- **El objetivo de 3 fuentes no se alcanza.**
  - Reddit está bloqueado en el navegador que usé.
  - Hacker News no tiene reseñas de usuarios.
  - Trustpilot exige una verificación anti-bots.
  - La App Store española no tiene reseñas.
- **Dónde está el detalle:**
  - `replica/reviews.csv`: las 170 filas, con el texto copiado tal cual y su enlace.
  - `replica/feedback.md`: la clasificación por temas.
  - `replica/fixes.md`: las tres listas y los ids de cada recuento.
- **Las citas** van tal cual y con su enlace. Las de App Store llevan su id de Apple entre corchetes; el enlace es el feed oficial.
- **Sala limpia:** los títulos y las propuestas son nuestros. No se copia el código, los textos, los nombres ni los assets de la referencia. Las reseñas son investigación interna: no van a la web ni al marketing de ARCANVEIL.
- **0 €:** ninguna propuesta exige pagar, ni cuentas con tarjeta, ni APIs de pago.

**Cómo se ha priorizado:** fuerza de la evidencia (reseñas × fuentes), luego encaje con las prioridades ya conocidas, luego que siga costando 0 €, luego esfuerzo.

- Las prioridades conocidas: primero, un narrador LLM real guiado por el MASTER PROMPT que se adapte a acciones libres; después, la orientación, la creación con elección real y el retrato (#12).
- Los temas con menos de 3 reseñas o de una sola fuente se marcan **thin** y no pasan de P2.

---

## P0

### B1 · El mundo recuerda: memoria de campaña por capas y continuidad comprobable

- **Evidencia:** «memoria y continuidad», 8 reseñas de 2 fuentes, media de 2,4★. Dentro del tema «Narrador IA» (24 reseñas, 2 fuentes).
  - «The GM has no memory for continuity. If the game goes past 150 turns everything goes south.» (App Store, 2★) [14627216750] https://itunes.apple.com/us/rss/customerreviews/page=1/id=6475002750/sortBy=mostRecent/json
  - «la IA alucina y te mete y saca personajes de cada escena, resucita o mata pero luego se contradice» (Google Play, 1★) https://play.google.com/store/apps/details?id=com.aisuccess.ai_game_master&reviewId=fb855d6b-2666-4ec6-b244-5c10a4a32eba&hl=es
- **Sistema afectado:** narrador IA (canon, memoria, prompt).
- **Propuesta para ARCANVEIL:**
  - Lo que el modelo recibe cada turno sale del **estado del juego**, no de la bitácora: personajes con sus datos, hechos establecidos e **hilos con estado abierto o cerrado**.
    - Un hilo resuelto se marca cerrado y el prompt lo dice: una reseña cuenta que la IA retomaba como pendiente algo ya terminado.
  - Un resumen por capítulo, comprobado contra el canon antes de guardarlo.
  - Medición antes de activar el LLM real: una campaña de 200 turnos (simulada y, cuando haya permiso, con Groq real). Se cuentan las contradicciones con el canon y los personajes que reaparecen con datos cambiados. Objetivo: 0.
- **Prioridad P0 · tamaño L.** La queja más dañina de la referencia es justo nuestra prioridad n.º 1.

### B2 · Tu acción, sus consecuencias: el narrador ni repite ni se apropia de lo que haces

- **Evidencia:** «eco o apropiación», 4 reseñas de 2 fuentes, media de 2,0★. Dentro del tema «Narrador IA» (24 reseñas, 2 fuentes).
  - «pasó a desarrollar mis ideas como argumentos suyos» (Google Play, 1★) https://play.google.com/store/apps/details?id=com.aisuccess.ai_game_master&reviewId=6b91e4e2-11b7-4480-af87-08ea931a6770&hl=es
  - «It takes your input and rewords it.» (App Store, 2★) [14463418899] https://itunes.apple.com/us/rss/customerreviews/page=1/id=6475002750/sortBy=mostRecent/json
- **Sistema afectado:** narrador IA (política del MASTER PROMPT, verificador).
- **Propuesta para ARCANVEIL:**
  - La respuesta abre con la **consecuencia**, no con la acción del jugador reescrita.
  - El **cómo** que dijo el jugador se respeta: si intenta derribar con la maza y el motor dice éxito, cae por la maza.
  - El verificador rechaza una respuesta que se parezca mucho a la entrada y no aporte ningún hecho nuevo. Se regenera una vez y, si no, narra el procedural.
  - La métrica de eco que ya existe (`soloEco` en la rúbrica de atención) pasa a tener un objetivo y a bloquear.
- **Prioridad P0 · tamaño M.** Es la otra mitad de «narrar bien con un LLM real».

### B3 · Las cuentas las lleva el motor, también con el LLM real

- **Evidencia:** «el juego pierde el estado», 10 reseñas de 2 fuentes leídas a mano, media de 1,9★. El tema completo, por patrón, tiene 16.
  - «aparece en el chat "Enemy Hit, número" pero no se resta la vida» (Google Play, 1★) https://play.google.com/store/apps/details?id=com.aisuccess.ai_game_master&reviewId=ae181d48-92da-4fca-a822-1173b6cb6898&hl=es
  - «The attack from an enemy hits you for 18 hps but you loose 42 instead.» (App Store, 1★) [14313444981] https://itunes.apple.com/us/rss/customerreviews/page=1/id=6475002750/sortBy=mostRecent/json
- **Sistema afectado:** narrador IA, combate, inventario, progresión.
- **Propuesta para ARCANVEIL:** hoy la vida, el daño, los objetos y la XP ya los calcula el motor, y el filtro de autorización rechaza lo mecánico. Lo que falta es **demostrarlo antes de encender el LLM real**:
  - Una batería de intentos con un proveedor simulado, y se exige que ninguno cambie el estado: «te curas del todo», «encuentras una espada», «le haces 50 de daño», «subes de nivel».
  - El narrador no da cifras. Las cifras salen de la interfaz, que ya enseña el daño real.
- **Prioridad P0 · tamaño S.** Es barato y protege lo que la referencia hace peor.

### B4 · Combate justo cuando morir es para siempre

- **Evidencia:** tema «Combate y muertes forzadas», 25 reseñas de 2 fuentes, media de 2,7★. Hallazgo de frecuencia, dificultad y muertes: 7 reseñas de 2 fuentes, media de 2,0★.
  - «constant forced deaths force you to a paywall» (Google Play, 1★) https://play.google.com/store/apps/details?id=com.aisuccess.ai_game_master&reviewId=e00f246b-33a4-4c1b-9018-8616d1cee1ff&hl=en&gl=US
  - «Every time I try to do any thing there’s a fight.» (App Store, 2★) [14418901490] https://itunes.apple.com/us/rss/customerreviews/page=1/id=6475002750/sortBy=mostRecent/json
- **Sistema afectado:** combate, encuentros, muerte y legado.
- **Propuesta para ARCANVEIL:**
  - **Presupuesto de encuentros:** nunca dos peleas seguidas sin causa en el relato, y un tope por horas de juego.
  - **Curva de nivel 1 a 3 medida:** tasa de muerte por encuentro con `qa-balance`. Ya hay pendientes conocidos: el guardia corrupto y los lobos son demasiado duros a nivel 1.
  - **Salidas reales** con tirada del motor: evitar, esconderse, huir y negociar. Una reseña en español echa de menos poder esquivar a los enemigos.
  - **Aviso** antes de un combate claramente mortal.
  - La muerte no está nunca ligada a pagar, porque no hay nada que pagar.
- **Prioridad P0 · tamaño M.** Con la muerte permanente, una pelea injusta cuesta mucho más que en la referencia.

### B5 · Nunca te quedas sin turnos

- **Evidencia:** tema «Fichas / tokens», 46 reseñas de 2 fuentes, el 27 % de la muestra. Es el tema más grande. El hallazgo «espera y cupo» suma 18 reseñas de 2 fuentes.
  - «Esperar 4 horas solo para 5 tokens me parece absurdo.» (Google Play, 3★) https://play.google.com/store/apps/details?id=com.aisuccess.ai_game_master&reviewId=76396464-50db-4936-97ef-5a4af4830566&hl=es
  - «Si no pagas, en breve la experiencia se termina.» (Google Play, 2★) https://play.google.com/store/apps/details?id=com.aisuccess.ai_game_master&reviewId=fc206dea-8300-4b6b-8aa5-db191e2eced9&hl=es
- **Sistema afectado:** economía de cupo del LLM y narrador de respaldo.
- **Propuesta para ARCANVEIL:** ARCANVEIL no tiene fichas. El riesgo llega con el LLM real, porque el plan gratuito de Groq tiene topes. Además, Groq exige una cuenta y una clave de API: que el plan gratuito no pida tarjeta, y sus condiciones de datos, los tiene que comprobar el dueño en su consola antes de activarlo (ya estaba pendiente), y la clave nunca va al repositorio. Por eso:
  - Cuando se agota el cupo del día, **sigue narrando el procedural** sin cortar la partida, y se dice con una línea honesta: nada de «vuelve en 4 horas».
  - Un indicador discreto del cupo restante.
  - Mirar la ficha, aclarar o corregir no gasta cupo.
- **Prioridad P0 · tamaño S.** Es la evidencia más fuerte de la muestra, va con el LLM y cuesta 0 €.

## P1

### B6 · Preguntar al máster no cuesta un turno

- **Evidencia:** hallazgo de 3 reseñas, 2 fuentes (d5e1a91c y, de App Store, 14483153759 y 14369429755). La referencia ya lo ha arreglado: su ficha (actualizada el 15-oct-2026) anuncia mensajes «fuera de personaje» gratis, y la reseña más reciente de la muestra lo celebra.
  - «spent hundreds of tokens trying to fix this with the game master» (App Store, 1★) [14369429755] https://itunes.apple.com/us/rss/customerreviews/page=1/id=6475002750/sortBy=mostRecent/json
  - «The question to clarify the situation you ALREADY PAID FOR costs you ANOTHER token.» (App Store, 2★) [14483153759] https://itunes.apple.com/us/rss/customerreviews/page=1/id=6475002750/sortBy=mostRecent/json
  - «it used a token for me to send a correction message» (Google Play, 4★) https://play.google.com/store/apps/details?id=com.aisuccess.ai_game_master&reviewId=d5e1a91c-57b2-459d-a9d7-b61c385dc58f&hl=en&gl=US
- **Sistema afectado:** narrador e interpretación.
- **Propuesta para ARCANVEIL:**
  - Un canal explícito de pregunta al máster que no avanza ni el turno ni el reloj, y responde desde el estado: qué llevo, dónde estoy, qué pasó con X.
  - Ya hay piezas: el arma que no tienes se aclara sin gastar turno, y `canon:` edita el canon a propósito.
- **Prioridad P1 · tamaño S/M.**

### B7 · El personaje que pediste, comprobado con personas

- **Evidencia:** hallazgo de 4 reseñas, 2 fuentes, leídas a mano. El tema completo tiene 8.
  - «Después de 5 descripciones, no es capaz de acertar con el personaje.» (Google Play, 1★) https://play.google.com/store/apps/details?id=com.aisuccess.ai_game_master&reviewId=a2b5c434-fb7f-41f7-a809-83c5651805f9&hl=es
  - «it does not change avatars to reflect clearly written commands» (App Store, 1★) [14376041367] https://itunes.apple.com/us/rss/customerreviews/page=1/id=6475002750/sortBy=mostRecent/json
- **Sistema afectado:** creación de personaje y retrato.
- **Propuesta para ARCANVEIL:**
  - El #12 ya da elección explícita de linaje, oficio y pasado, y un dibujo con controles que cambian lo que se ve.
  - Falta lo que el #12 no pudo hacer: **probarlo con personas**.
  - Con el LLM real, que el narrador use la descripción escrita (una prueba con rasgos concretos).
- **Prioridad P1 · tamaño S.** Coincide con la queja que motivó el encargo #12: un solo jugador, en PC, no pudo crear el personaje como quería ni pintar el retrato. Es una sola persona; no es una tendencia.

## P2 (thin o con poca evidencia)

### B8 · Campañas de mil turnos (thin: 5 reseñas, una sola fuente)

- «when you go past turn 6000+ the game starts to crash when you type» (App Store, 4★) [14526813211] https://itunes.apple.com/us/rss/customerreviews/page=1/id=6475002750/sortBy=mostRecent/json
- **Sistema afectado:** guardado y rendimiento.
- **Propuesta:** una prueba de carga con 1.000 turnos (tamaño del guardado, apertura, memoria y relato). El historial del estado tiene tope (`narrativaMax`): hay que comprobar que recortarlo no pierde canon.
- **P2 · tamaño S** para medir, **M** si hay que arreglar.

### B9 · Que cada capítulo no sea el mismo (thin: 4 reseñas, una sola fuente)

- «every subsequent sequal is essentially the same story, repeated» (App Store, 3★) [14316148863] https://itunes.apple.com/us/rss/customerreviews/page=1/id=6475002750/sortBy=mostRecent/json
- **Sistema afectado:** situaciones y sucesos.
- **Propuesta:** apuntar en cada campaña qué tipos de situación ya han salido y no repetirlos hasta agotar las alternativas.
- **P2 · tamaño M.**

### B10 · Compañeros que actúan en combate (thin: 2 reseñas)

- «they just do nothing and allow my deaths in their direct presence» (Google Play, 1★) https://play.google.com/store/apps/details?id=com.aisuccess.ai_game_master&reviewId=e00f246b-33a4-4c1b-9018-8616d1cee1ff&hl=en&gl=US
- **Sistema afectado:** grupo y combate.
- **Propuesta:** una auditoría que exija que cada compañero actúe en cada ronda en la que pueda hacerlo.
- **P2 · tamaño S.**

### B11 · Tiradas que se entienden (thin: 3 reseñas, una sola fuente)

- «I would say if you could add some of the dice features?» (Google Play, 5★) https://play.google.com/store/apps/details?id=com.aisuccess.ai_game_master&reviewId=e0747e43-b308-42cf-a85d-f5d83b8f9392&hl=en&gl=US
- **Sistema afectado:** reglas y presentación.
- **Propuesta:** ARCANVEIL ya enseña cada tirada. Se añadiría una línea de por qué se tira y qué cambia según el resultado.
- **P2 · tamaño S.**

---

## Lo que ARCANVEIL ya hace mejor

Son propiedades del diseño comprobadas con las auditorías del repositorio. **No están validadas con jugadores.**

1. **Las cuentas no las lleva el modelo.**
   - Vida, daño, objetos y XP salen del motor. El narrador no puede conceder objetos ni cambiar números: hay un filtro de autorización, y lo vigilan las auditorías de combate, identidad de objetos y coherencia.
   - En la referencia, es justo lo que falla en 10 reseñas de 2 fuentes (vida que no baja, curación que no cura, daño mal sumado, objetos que no aparecen). Que la causa sea que lo lleve el modelo es una suposición nuestra: no lo sabemos.
   - Matiz: falta demostrarlo con el LLM real (B3).
2. **Sin fichas, esperas, compras ni anuncios.** Es la queja n.º 1 (46 reseñas) y la n.º 4 (precio, 19) de la referencia.
   - Matiz: el narrador procedural no tiene límite y funciona sin conexión; el LLM real dependerá del plan gratuito de Groq (B5).
3. **Las tiradas se ven y las decide el motor.** Evidencia thin: 3 reseñas de una sola fuente lo echan de menos en la referencia.

## No objetivos

- **Anuncios a cambio de turnos** (tema de 6 reseñas, 2 fuentes; leídas a mano, 4 lo piden, y son jugadores contentos): en ARCANVEIL no hay turnos que comprar ni anuncios.
- **Suscripción, compras o fichas de pago:** fuera por la regla de 0 €, y porque es justo lo que más se odia de la referencia.
- **Multijugador en línea** (thin): necesitaría servidor y cuentas. ARCANVEIL es web/PWA local. Solo se reconsideraría una forma sin servidor.
- **Imágenes o vídeo por escena con servicios de pago:** ARCANVEIL usa el dibujo del juego y el retrato con IA local opcional. Nada de APIs de pago.
- **Un servicio de soporte con tickets** (3 reseñas): no aplica a un proyecto personal.

## Ángulos de posicionamiento

Con el formato de la skill: «Para {quién} que {odia esto de la referencia}, ARCANVEIL {hace esto en su lugar}». Son para decidir el rumbo. No se publican, y no nombran la app de referencia.

1. **Para quien juega al rol en solitario y está harto de que el máster olvide lo que pasó o se invente la vida y los objetos,** ARCANVEIL lleva el mundo en el motor: las cuentas no se las inventa el narrador, y lo que pasó queda en el canon.
   - Evidencia: memoria (8 reseñas), estado (10), tema «Narrador IA» (24), todo de 2 fuentes.
2. **Para quien no puede o no quiere pagar por turnos,** ARCANVEIL se juega entero gratis, sin esperas ni anuncios, en el navegador y sin conexión.
   - Evidencia: fichas (46 reseñas) y precio (19), de 2 fuentes.
3. **Para jugadores de rol que quieren que sus decisiones pesen,** ARCANVEIL tira los dados en el motor y enseña la tirada: el narrador cuenta lo que ya está decidido.
   - Evidencia: dados y reglas (3 reseñas, una fuente, thin) y estado (10).

**Recomiendo el 1.** Es el que mejor encaja con la prioridad principal (narrar bien con un LLM real) y tiene evidencia de 2 fuentes. Además, el motor ya cumple la mitad: las cuentas.

- Condición: no usarlo hacia fuera hasta tener B1, B2 y B3 hechos y medidos con el LLM real.
- El 2 tiene más reseñas, pero competir por «gratis» es frágil en cuanto el narrador use un modelo con cuota.
- El 3 es thin.
