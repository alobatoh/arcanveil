# Informe del encargo #15: las cuentas las lleva el motor, también con el LLM real

21 de octubre de 2026. Rama `feat/cuentas-motor-llm-20261021`, que sale de `feat/replica-entrepreneur-ai-game-master-20261021` = `15efa6f` (árbol limpio al empezar). Implementa el **B3** del backlog (`docs/backlog/2026-10-21-backlog-ai-game-master.md`). `main` no se ha tocado.

Sin LLM real, sin clave, sin red y sin gasto: el modelo es una función en memoria.

---

## 1. Lo que hay que saber primero

1. **Fugas de estado: ninguna.** En 66 turnos maliciosos, más las variantes de forma, el estado mecánico sale igual que con un modelo limpio: vida, ánima, XP, nivel, oro, hambre, sed, fatiga, moral, atributos, inventario, equipado, misiones, lugar, reloj, clima, lugares, combate, caídos, relaciones, reputación, hazañas, grupo y canon.
   - Ya era así antes de este encargo: en la base `15efa6f` la auditoría tampoco encuentra ninguna diferencia de estado.
   - Lo mecánico lo rechaza `Autorizacion.js` por tipo y `FiltroModelo.js` vacía los campos del contrato antiguo.
2. **Sí había una fuga de PROSA, y está arreglada.** Frases como «Te curas del todo.», «Ganas 100 XP.», «Encuentras una espada larga.», «Apareces en Saucedo.» o «Pasan tres horas.» llegaban a la bitácora.
   - No cambiaban la partida, pero engañaban al jugador: es la queja de las 10 reseñas de la referencia.
   - De las once de la batería, el Verificador solo reconocía el oro que «recibes».
3. **Una fuga pequeña en `Autorizacion.js`, anterior al encargo, arreglada.** Un `elemento_escena` se aceptaba si sus palabras aparecían como **trozo** de la narración: en combate entraba «un cofre con cien monedas de oro» porque «cien» está dentro de «cenicientos». Ahora se compara por palabras enteras.
4. **El detector es de patrones, no perfecto.** Reconoce las formas probadas (las de la batería, las que encontró la revisión y sus variantes en inglés) y deja pasar frases que no conoce. Por eso los efectos no dependen nunca del texto: una frase que se cuele no cambia la partida.
5. **Cambio de comportamiento que hay que conocer:** si una narración de modelo tiene más de la mitad de frases con cuentas inventadas, se pide UNA corrección. Si tampoco vale, narra el procedural, como ya pasaba con las demás contradicciones. Con el narrador simulado de siempre no cambia nada: las mismas 9 caídas en 107 turnos, en HEAD y en la base.

## 2. Base, HEAD y diff

- **Base:** `15efa6f`.
- **Archivos tocados:**
  - `src/ai/narrador/Verificador.js`: el detector.
  - `src/ai/narrador/FiltroModelo.js`: `cuentasDelMotor`.
  - `src/ai/narrador/Autorizacion.js`: comparación por palabras.
  - `tools/auditar-cuentas-motor.mjs`: nueva.
  - `TESTING.md` y `sw.js` regenerado.
- **No toca:** `GroqProvider.js`, el motor (combate, economía, guardado, muerte), la interfaz (`app/`) ni los contratos de #9-#14.

## 3. La batería (`node tools/auditar-cuentas-motor.mjs`)

**Cómo mide.** Cada turno se juega en dos partidas idénticas (misma semilla, misma preparación y misma acción del jugador): una narrada por un modelo limpio y otra por el malicioso. Se compara una foto del estado mecánico completo. Si el turno cae al procedural, la referencia es una tercera partida narrada solo por el procedural, y la narración tiene que ser la misma.

- El apartado 0 comprueba que dos partidas con la misma semilla llegan al mismo estado; sin eso, comparar no probaría nada.
- El personaje empieza herido, para que «te curas del todo» contradiga el estado.
- En combate, contra dos lobos.

**Los intentos.** Once, cada uno en tres formas (español, inglés y pregunta) y en dos contextos (fuera y dentro de combate): 66 turnos.
1. Te curas del todo.
2. Le haces 50 de daño y cae.
3. El lobo muere.
4. Subes al nivel 2.
5. Ganas 100 XP.
6. Encuentras una espada larga.
7. Recibes veinte monedas de oro.
8. Has completado la misión.
9. Apareces en Saucedo.
10. Pasan tres horas.
11. Tu herida no era grave: sigues con toda la vida.

**Las vías, en cada turno a la vez:**
- La frase en la prosa.
- `proposedEffects` de cada tipo de `DEL_MOTOR`: oro, vida, experiencia, objeto, misión, combate, tiempo, lugar y canon.
- Tipos desconocidos o disfrazados: «nivel», «curacion», «Vida», vacío y sin campo `tipo`.
- Narrativos abusados: una actitud de +99, un PNJ que no aparece y un cofre con monedas.
- El contrato antiguo completo: `playerUpdates` con hp, mana, gold, xp, hunger, thirst, fatigue, morale y flags; `newItems`, `quests`, `combat`, `timeAdvance` (en minutos, que es como lo lee el esquema), `location`, `events` de seis tipos, `npcs` y `npcMemory`.

**Variantes de forma:**
- Los once intentos a la vez: el turno no se sostiene y lo narra el procedural sobre la misma petición.
- JSON roto (un rescate de prosa).
- Solo efectos, o solo prosa.
- La trampa en boca de un PNJ.
- Otras redacciones: «Matas al lobo de un tajo.», «Tus heridas sanan por completo.», «Ahora llevas una espada larga.», «Horas después…».
- La corrección remota que devuelve la trampa reformulada: se pide una sola corrección y no entra ninguna de las dos.

**Lo que se exige en cada turno:**
- El estado igual que la referencia.
- Nada de lo inyectado en la bitácora.
- El turno contado una vez.
- De los efectos, solo lo narrativo y con tope.

**Regla de cifras** (apartado 3, `verificar()` sin motor):
- Fuera: 7 cifras inventadas (vida, XP, pociones, vida de un enemigo, oro, en inglés, nivel).
- Dentro: 6 cifras que sí son del motor o de escena.
- Afirmaciones sin cifra, según el estado.
- 21 redacciones que la primera versión dejaba pasar.
- 28 frases normales de narrador que no se pueden quitar.
- Lo que ya llevas, lo que el motor acaba de dar y los hallazgos resueltos.

**La interfaz** (apartado 4):
- Un turno de combate narrado por el modelo malicioso: su «50 de daño» no llega.
- Después, una ronda real: la suma de las cifras de los golpes, que es lo que pinta la interfaz, es la vida que el motor resta.

**Resultado:**

| | Comprobaciones |
|---|---|
| HEAD | **168/168** (exit 0, ~100 s) |
| Base `15efa6f` con la misma batería | **113/168**: 55 fallan, todas prosa en la bitácora o detector ausente; **ninguna fuga de estado** |

## 4. El detector (Verificador.js)

Solo actúa sobre lo que narra un modelo: `verificar()` lo llama `FiltroModelo`, nunca el procedural. Con las cuentas del motor (`cuentasDelMotor`):

- **Cifras con unidad mecánica** (vida, daño, XP, nivel, oro, pociones, flechas, raciones): valen si son del estado o si el motor las escribió este turno (golpes, compras, objetos dados).
  - No valen las del jugador («quiero 100 XP»).
  - No valen las de una tirada («sacas un 17» no hace verdad «ganas 17 XP»).
  - Oro y objetos con cifra solo cuentan si son del personaje («recibes», «tienes», «te quedan»). Una oferta, un precio o las flechas de un arquero son escena.
  - El nivel, solo el del personaje.
- **Afirmaciones sin cifra:**
  - curación, con la vida no llena;
  - muerte de un ser al que el motor no ha dejado caído («la tarde muere» no cuenta);
  - subir de nivel;
  - misión cumplida;
  - un salto de reloj impersonal sin que el jugador deje pasar el tiempo («el herrero pasa horas mirando el río» no cuenta);
  - aparecer en otro lugar.
- **Objetos:** se quitan si pasan a ser tuyos (recoges, te llevas, ahora llevas…). Si los «encuentras», se quitan solo cuando el motor no ha resuelto un hallazgo. Lo que ya llevas o lo que el motor acaba de dar este turno no es invento.
- **Lo que dice un PNJ:** se mira solo lo que es del personaje (curación, XP, nivel). Precios y ofertas entre comillas son escena.

Todo es grave: la frase se quita. Si se va más de la mitad, una corrección; si tampoco vale, el procedural.

## 5. Roles y modelos

| Rol | Quién | Qué hizo |
|---|---|---|
| Programador | yo (Opus 5.5) | la batería, el detector, el arreglo de `Autorizacion.js` |
| Revisor | un agente aparte (`general-purpose`, Opus) | ejecutó todo él mismo desde cero (no se fió de mis números): la batería en HEAD y en la base, el narrador simulado, cuatro auditorías y el agregado (48/48) |
| Playtester | un agente aparte (`qa-funcional`, Opus) | la regresión en Chrome (móvil y escritorio), una partida con capturas mirando píxeles, y 23 turnos jugados a mano (apartado 6) |

**Lo que encontró el revisor** («aprobado con reparos») y está corregido:
- La foto no miraba todo el estado. Ampliándola él no aparecía ninguna diferencia, pero la auditoría no lo demostraba; ahora la foto es completa.
- `timeAdvance` se probaba con una forma que el esquema convierte en 0.
- Faltaban campos del contrato antiguo.
- No se miraban las citas de PNJ.
- Pasaban 21 redacciones obvias.
- Valían las cifras del jugador y de la tirada.
- Una muerte valía si la frase nombraba a cualquier caído.
- Había 20 falsos positivos («la tarde muere», «el herrero pasa horas», precios, flechas de un arquero, «el río sube al nivel dos»…).
- La comprobación de la interfaz no hacía narrar al modelo.
- El cofre de monedas (punto 3 de §1).

Haiku no se usó: los pasos mecánicos los hacen scripts.

## 6. Verificación

| Comando | Resultado |
|---|---|
| `node tools/auditar-cuentas-motor.mjs` | 168/168 (base 113/168) |
| `node tools/auditar-narrador-ia.mjs` | 79/79 |
| `node tools/auditar-interpretacion.mjs` | 71/71 |
| `node tools/auditar-tester.mjs` | 71/71 |
| `node tools/auditar-coherencia-turnos.mjs` | 148/148 |
| `node tools/auditar-canon.mjs` | 80/80 |
| `node tools/medir-narrador.mjs --ia-simulada` | idéntico en HEAD y en la base: reparación local 66, remota 20, no 21; 9 caídas al procedural; fugas 0. HEAD solo añade la etiqueta `cifra_inventada` a las 19 frases de oro inyectado que ya se quitaban |
| `node tools/auditar-todo.mjs` | **48/48 con código 0** (781 s); la nueva entra sola por el nombre: 168/168 |
| Chrome `regresion-app.mjs --solo-pestanas --semilla 505`, móvil (390×844) | exit 0, 57 s, excepciones 0, peticiones externas 0 |
| Chrome `regresion-app.mjs --desktop --solo-pestanas --semilla 505` | exit 0, 59 s, excepciones 0, peticiones externas 0 |
| Chrome `regresion-app.mjs --desktop --capturas --semilla 505` (partida completa, narrador procedural) | exit 0, 160 s: 32 sistemas, 20 turnos, excepciones 0, fallos 0, service worker controlando, 0 peticiones externas |

**Playtester** (agente `qa-funcional`, aparte; abrió las capturas):
- La interfaz enseña las cifras reales. Barras y cifras en cada luchador; tras «5 de daño», la barra pasa a 12/17, y 17−5=12. La ficha cuadra con la cabecera.
- La narración procedural se lee entera.
- No hay ninguna cuenta inventada en la bitácora.
- No se generaron capturas a 390×844 de esta rama; en móvil se pasó la regresión sin capturas.

**Fallos que vio jugando a mano, ninguno de este cambio** (el procedural no pasa por el detector). Comprobó contra la base los de «compro pan» y «me curo las heridas»; el resto no:
- «compro pan» con un solo mercader presente: no responde y no cobra. `ActionRouter.js` abre la tienda con un evento que nadie escucha; viene del commit inicial.
- «me curo las heridas» con la vida llena tira dado y dice que no hay manera.
- Un «ZAS.» tras un robo sigiloso.
- Turnos que solo repiten la acción («trepo a un árbol…»).
- «(1 absorbidos)» en el registro de combate.
- Un aviso de depuración en consola en cada turno: `campo desconocido descartado: hunger, thirst`.

## 7. Lo que queda para B1 y B2 (el LLM real)

- **Encender Groq:** depende del dueño, que debe comprobar en su consola que el plan gratuito no pide tarjeta, sus condiciones de datos y la cuota. La clave nunca va al repositorio.
- **Con el modelo real hay que repetir esta batería en partidas reales**, porque un modelo de verdad escribirá formas que el detector no conoce. Mirar `traza.problemas` (`cifra_inventada`, `mecanica_inventada`) y cuántos turnos caen al procedural.
- **B1, memoria por capas:** el canon y los hilos abiertos o cerrados como fuente del prompt.
- **B2, eco o apropiación de la acción:** una métrica de eco con objetivo.
- **Limitaciones conocidas del detector:**
  - Muertes en inglés de enemigos con nombre español.
  - Un PNJ que «ofrece» oro con verbo de posesión podría quitarse.
  - «Al cabo de unas horas de charla» se trata como salto de reloj.
