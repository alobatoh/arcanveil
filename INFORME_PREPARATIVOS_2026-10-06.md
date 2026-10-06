# Preparativos del motor y medición offline: informe (6-oct-2026)

**Rama local** `feat/preparativos-motor-20261006`, sacada de `feat/arreglo-playtest` en **f2bc6f2**: el SHA del encargo, sin cambios ni trabajo nuevo encima al empezar. **HEAD final: 2280e8a.** Son 10 commits y 14 ficheros (+1763 / −19). No se ha tocado `main`.

**Sin push, sin PR, sin merge.** No se ha usado ninguna API real ni cuota: ni Groq, ni Anthropic, ni Gemini, ni Cloudflare, ni ComfyUI, ni servicios de imágenes. Tampoco hay claves, ni pagos, ni accesos nuevos. Todo se ha probado con partidas, personajes y proveedores ficticios, y no se han tocado partidas ni galerías reales.

La prueba de concepto `feat/coherencia-turnos-costes-20261006` (38bbac4, 0555570) **no está en este equipo**, así que no se ha usado ni comparado. Todo lo de aquí está hecho y medido en esta copia.

## Qué se ha arreglado

### 1. Esperas: la duración narrada pasa en el reloj

**Reproducido en f2bc6f2** (semilla 9303, Sive, día 1 a las 07:00, mañana, primavera):

| Frase | Texto | Reloj |
|---|---|---|
| «espero dos horas» | «Esperas dos horas.» | 07:00 → 07:10 |
| «espero hasta que anochezca» | «Esperas hasta que anochezca.» | 07:00 → 07:10 |
| «me quedo quieta hasta que anochece» | «Te quedas quieta hasta que anochece.» | 07:00 → 07:10 |

**Ruta.** Segmentos conservaba la duración, pero el turno normal no la miraba. Hacía un único `clock.turno` de 10 minutos y el narrador repetía el eco.

**Contrato:**
- **Lectura** (`engine/Espera.js`). Distingue espera simple, duración y destino. La duración puede ir en cifras o palabras: «2 horas», «dos horas», «30 minutos», «media hora», «hora y media», «al menos dos horas». El destino es una frontera de franja del reloj o una hora. Lo que no se puede medir se aclara antes de fingir: una condición («hasta que se vaya el guardia», «a que llegue…»), «un rato», «hasta mañana», negativos, cero, horas imposibles y más de 24 h.
- **Qué se mira.** Solo los trozos que de verdad se hacen. Lo citado, lo negado y lo condicional no ejecutan intervalos. Una orden compuesta con espera larga se aclara («va sola»).
- **Ejecución** (`TurnResolver._esperar`). Hace un `clock.turno({tipo:'espera'})` por cada 10 minutos, con el último pulso parcial. Pasa por todos los sistemas: desgaste, situaciones, plazos, clima y ofertas. El reloj nunca se fija a mano.
- **Interrupciones.** La espera se corta si:
  - empieza una pelea;
  - aparece un encuentro;
  - una situación de aquí avanza (un aviso «EN ESCENA» nuevo);
  - alguien llega o se va;
  - cambia el sitio;
  - el cuerpo empieza a fallar;
  - falla o vence un encargo.

  Que el estado se guarde de otra forma no corta nada.
- **Narración.** Una sola narración local al final, con lo que pasó de verdad: «Esperas 10 minutos. La espera se interrumpe: en el puente, Berger acaba pagando con la manta… Día 1, 07:40, por la mañana.» No se llama al narrador en ninguna parte de la espera. La causa narrada se quita de la memoria temporal para que no se repita en el turno siguiente.
- **Antes de empezar.** Con combate en curso, un encuentro delante o un hostil presente, se pide decisión sin mover el reloj.
- **Transaccional.** Si un pulso falla a mitad, se restaura todo: reloj, turno y desgaste. La entrada se desbloquea en `finally` y no admite turnos simultáneos.
- **Esperar no es descansar.** No consume raciones, no cura y no devuelve maná. El desgaste va en proporción a los minutos: 25 minutos cuentan 2,5 turnos, no 3.
- **Pulsos.** Los pulsos son turnos del **motor** (`meta.turno` sube uno por pulso), no respuestas de pago.

**Resultados en 2280e8a** (FIXTURE sin situaciones ni ofertas, semillas 9303 y 9505):

| Inicio | Frase | Final | Pulsos |
|---|---|---|---|
| 07:00 | «espero dos horas» / «2 horas» | 09:00 | 12 |
| 07:00 | «espero 30 minutos» / «media hora» | 07:30 | 3 |
| 23:50 | «espero 30 minutos» | día 2, 00:20, madrugada | 3 |
| 23:00 | «hasta el amanecer» | día 2, 05:00, alba | 36 |
| 20:50 | «hasta que anochezca» | 21:00, noche | 1 |
| 22:00 | «hasta que anochezca» | se aclara: «Ya es de noche» | 0 |
| 07:00 | «espero 25 minutos» | 07:25 | 3 (el último, de 5 min) |

**Escena real.** En la 9303 la espera se corta a los 10-20 minutos por el peaje. En la 9505 se corta por el carro volcado. La causa sale del estado.

**Esperar no cura.** Dos horas con 8 de vida menos y maná parcial: ni la vida ni el maná suben, las provisiones quedan iguales, el hambre baja 6,6 y la fatiga 4,8.

**En la app (Chrome).** La regresión ejecuta «espero 30 minutos» y comprueba que el texto, el reloj guardado y la cabecera coinciden. Captura: «Esperas 30 minutos. Día 2, 05:30, al alba.»

### 2. Arma inexistente: se aclara antes de cobrar turno o ronda

**Reproducido en f2bc6f2:**
- «ataco a Korsa con el hacha» (Sive no tiene hacha) daba «Intentas atacar a Korsa con el hacha. Sale mal…», con tirada y turno gastados.
- En combate, `Jugada.js` decía «No llevas hacha: atacas con tu cuchillo».

**Contrato** (`engine/ArmaPedida.js`, compartido por `TurnResolver` y `CombatManager.jugadaLibre`):
- **Cuándo se comprueba.** Antes de tirar, de intervenir en una situación, de mover reputación o de abrir combate.
- **Qué cuenta como herramienta.**
  - Se mira el instrumento («con el hacha») y lo que se desenvaina o empuña. El blanco no cuenta: «ataco a Korsa, el de la capa» conserva a Korsa.
  - Solo pide algo un arma conocida o un objeto del inventario. Por eso «con calma», «con fuerza» o «con sigilo» no piden un objeto; no es una lista de adverbios.
- **Mensajes:**

  | Caso | Respuesta |
  |---|---|
  | El arma no está | «No llevas hacha. Di con qué quieres atacar; no se ha hecho el ataque.» |
  | Está, pero no en la mano | «Llevas el arco corto, pero no en la mano (en la mano llevas el cuchillo de caza)…». No se equipa en silencio. |
  | Rota o sin cantidad | «…no sirve» |
  | «primero cojo el hacha y luego ataco» sin tener hacha | Pide hacerlo en dos turnos |
  | Objeto que no es arma («con la cuerda») | Sigue la regla de siempre de `Jugada.js` (+1 de ingenio) |
- **Qué no gasta.** No gasta turno, reloj, ronda, acciones, vida, maná, provisiones, durabilidad ni reputación. Tampoco hay tirada ni petición de combate.
- **En combate.** El jugador sigue con su turno (`ESPERANDO`): la misma ronda, los mismos enemigos y el mismo inventario.
- **Sin cambios.** «afilo el hacha» sin hacha sigue ofreciendo solo el cuchillo, sin afilar nada.

### 3. Orden compuesta: el blanco nombrado no se cambia

**Reproducido en f2bc6f2.** «desenvaino el cuchillo y ataco a Korsa» abría combate contra un «Guardia corrupto» de la tabla del camino, con emboscada.

**Causa.** El foco se quedaba en «desenvaino el cuchillo». `leerGesto` no lo reconoce como gesto, el analizador lo lee como ataque sin blanco y el router sorteaba un enemigo.

**Arreglo:**
- **Foco.** Desenvainar o empuñar prepara la acción; el foco pasa al trozo que ataca, reconocido por su verbo.
- **Las tres frases de Korsa** («ataco a Korsa», «… con el cuchillo», «desenvaino… y ataco a Korsa») van por la misma ruta de agresión de siempre. Ninguna pide combate ni saca al guardia, y dejan la misma vida y la misma reputación.
- **`_atacar`:**
  - Con hostiles delante, elige al nombrado o al del oficio («al arriero»), no al primero de la lista.
  - Con varios hostiles y sin nombre, pregunta a cuál.
  - Si el nombrado no está («ataco a Torket»), lo dice y no sortea un enemigo.
- **Control intacto.** «ataco a Xivio» sigue abriendo contra 2 guardias, con `teVen` y la intervención narrada.
- **Sin política nueva para civiles.** Atacar a un civil se narra igual que antes. No se ha prohibido nada ni se han inventado fichas, reputación perdida ni guardias.

### 4. Desgaste: el parche de vitales se aplica

**Causa verificada.** `Player.alTurno` despachaba `player/aplicarParche`, que no tenía reductor. `Vitals` calculaba 99,45 / 99,15 / 99,6 y la ficha seguía en 100.

**Arreglo.** Hay un reductor interno `player/desgaste`, que solo admite:
- hambre, sed y fatiga, de 0 a 100 y con dos decimales;
- vida y maná actuales, dentro de su máximo.

No es una puerta para el narrador.

**Comprobado:**
- Un turno normal aplica exactamente un desgaste.
- Cruzar un umbral avisa una sola vez.
- El hambre a 0 cuesta 2 de vida, y con 1 de vida el personaje cae una vez.
- Con calor sofocante, la sed baja el doble.
- El crisol (inmune) solo pierde fatiga.
- Descansar no gasta fatiga.
- Una ronda de combate no cuenta como un turno de exploración.
- Un viaje sigue su propia regla, sin aplicarla dos veces.
- Si una espera falla a mitad, se deshace entera.

**Consecuencia que hay que saber.** El mismo parche lleva la **regeneración pasiva**: vida 0,5 % y maná 2 % por turno fuera de combate. Estaba escrita y tampoco llegaba al estado; ahora sí. Las partidas largas cambian (las capturas ya muestran «Hambre 93/100»). No se ha tocado ningún número de balance ni se certifica el balance.

### 5. Medición de campañas largas (offline)

`node tools/medir-costes-campana.mjs --turnos 100 --salida costes.json`

**Red bloqueada y contada.** `fetch`, `http(s)` y `net` quedan bloqueados y cuentan los intentos; si alguno sale, la herramienta acaba con código 2.

**Montaje.** Usa el proveedor Groq del juego con un transporte doble, el doble adversario de `narrador-simulado.mjs` y guarda y carga cada 25 turnos.

**Resultado en 2280e8a** (2 × 100 turnos, semillas 9303 y 9505, 0 intentos de red):

| | 9303 | 9505 |
|---|---|---|
| Turnos ejecutados | 100/100 | 100/100 |
| Peticiones al modelo | 106 | 114 |
| · de turno | 90 | 85 |
| · reparaciones (**inducidas**) | 16 | 29 |
| · reintentos / otro | 0 / 0 | 0 / 0 |
| Entrada total (caracteres) | 1.620.038 | 1.731.097 |
| · de ellos, system | 1.011.558 (62 %) | 1.087.902 (63 %) |
| Media por petición al principio / mitad / final | 14.454 / 15.454 / 15.493 | 14.533 / 15.346 / 15.313 |
| Instantáneas sobre presupuesto · con canon omitido | 0 · 0 | 0 · 0 |

**Cómo leer estas cifras:**
- **Turnos sin modelo.** No todos los turnos llaman al modelo: entre 10 y 15 de cada 100 se resuelven en local (recuentos, esperas, aclaraciones).
- **Reparaciones.** Las provoca el doble a propósito: es una tasa **artificial**, ni la de un modelo real ni una medida de calidad.

**Coste estimado en USD (escenarios, no una factura).** Tarifa del encargo para Haiku 4.5 (6-oct-2026): $1/M de entrada y $5/M de salida, según https://platform.claude.com/docs/en/about-claude/pricing. La herramienta no la consulta.

| Caracteres por token | Salida supuesta 400 | 600 | 800 |
|---|---|---|---|
| 3,5 | $1,40 | $1,62 | $1,84 |
| Rango 4 / 3,5 / 3 | | | $1,28 – $2,00 |

**Qué es y qué no:**
- Los tokens son una **estimación** desde caracteres, y la salida es **supuesta**, no medida.
- Sin caché gratis, sin descuentos y sin razonamiento extendido (thinking).
- Quedan fuera del cálculo la tienda, los impuestos, la infraestructura, las imágenes, los reembolsos y el tipo de cambio.
- No da permiso para pruebas de pago.
- `--autoprueba` comprueba el contador con dobles deterministas: limpio, una reparación, un 429 con reintento y una petición «otro». También lo prueba con el motor real.
- Las cifras de la prueba de concepto (274/74, $1,61–$2,51) no se han usado como objetivo.

### 6. Arnés de servidor y verificación visual

**Servidor:**
- **`servir.mjs`.** Admite `--puerto 0`; antes `0 || 8080` daba 8080. Anuncia el puerto real y falla con código 1 si no puede escuchar. La política de escucha no cambia: 127.0.0.1, y la red solo con `--lan`.
- **`auditar-servidores`.**
  - **Arranque.** Lanza el servidor en un puerto efímero y espera a que anuncie que está listo. Si falla al arrancar, lo recoge con su PID.
  - **«No escucha en la LAN».** Exige un error de conexión (ECONNREFUSED); una respuesta HTTP como un 421 no vale.
  - **Cierre.** Espera a que el proceso hijo termine de verdad.
- **Resultado.** Tres ejecuciones aisladas: **76/76** cada una. La causa del 421 original sigue **sin demostrar**.

**Capturas:**
- Salían a mitad de la escritura («Guar█») y con líneas a medio aparecer.
- Ahora la regresión espera a que la pantalla esté quieta: termina de escribir, comprueba que no quedan animaciones y que el texto lleva 300 ms sin cambiar.
- Revisadas a mano en móvil (390×844) y escritorio (1440×900): texto entero, caja de entrada, ficha, cabecera con día y franja, y la espera narrada.
- El arte de la regresión es un PNG verde de 1×1 y el XSS es texto de prueba. No dicen nada del proveedor visual.

## Pendiente y decisiones que no he tomado

1. **Política con civiles** (fuera de alcance): qué pasa al atacar a un civil, sus fichas, la reputación y los guardias. Hoy se narra la agresión y no se abre combate. Solo se ha corregido la identidad del blanco.
2. **El tiempo y las estaciones no coinciden.** Hay tres reglas:
   - El reloj pone la noche a las 21:00, con estaciones de 28 días que llama `primavera / estio / otono / invierno`.
   - `TimeSystem` tiene estaciones de 90 días que llama `verano` y calcula la estación por `diasTotales`, así que no lee la que guarda el reloj.
   - El anochecer de `TimeSystem` es `round(19 × factor)`.

   Las esperas usan las fronteras del reloj, que son las que se guardan y se ven. No se ha reescrito nada; la auditoría imprime la discrepancia.
3. **Desgaste y balance largo:**
   - Ahora hay desgaste y regeneración pasiva en todos los turnos normales.
   - La sed baja 0,85 por pulso: en una espera larga cae deprisa (100 → 64 en unas 7 h de juego en la partida leída).
   - Un viaje corto (4 h) solo cuesta un turno de desgaste y ninguna ración (la regla es una ración cada 12 h).

   Hay que jugar partidas largas antes de dar el balance por bueno.
4. **Ofertas de encargo durante las esperas.** Las ofertas espontáneas llegan cada 12 turnos del motor. Como cada pulso cuenta, una espera de 2 h acaba a menudo cortada por una oferta («Cormir se te acerca con algo entre manos…»). Es coherente, pero cambia el ritmo: tú decides si las ofertas deberían contar horas en vez de pulsos.
5. **Encuentros aleatorios durante una espera.** No se tiran: hoy solo se tiran al explorar o viajar. Una espera en un sitio peligroso puede cortarse por situaciones o por un plazo, pero no por un encuentro sorteado. Tú decides si debe haber riesgo por esperar.
6. **`Jugada.js`.** Conserva su aviso antiguo («No llevas X: atacas con…») para formas que el validador no ve, como el arma en la descripción del blanco. Ya no se alcanza con «con el hacha» ni con «desenvaino».
7. **Calidad narrativa.** Sigue en 5,2 % de frases repetidas, 3 turnos solo de eco y 24/25 preguntas atendidas. No se ha tocado ni se da por arreglada. **No se ha probado** con Groq ni con Claude reales, ni en un móvil de verdad.

## Comandos y códigos de salida (HEAD 2280e8a, 6-oct-2026 18:32)

| Comando | Código | Tiempo | Resultado |
|---|---|---|---|
| `node tools/auditar-coherencia-turnos.mjs` | 0 | 50 s | 147/147 (con f2bc6f2: 44/135, 91 fallos) |
| `node tools/auditar-tester.mjs` | 0 | 11 s | 71/71 |
| `node tools/auditar-playtest.mjs` | 0 | 28 s | 25/25 |
| `node tools/auditar-combate-libre.mjs` | 0 | 13 s | Todo bien |
| `node tools/auditar-historia.mjs` | 0 | 24 s | Todo correcto |
| `node tools/auditar-servidores.mjs` | 0 | 7 s | 76/76 (y 3 aisladas, 76/76) |
| `node tools/auditar-todo.mjs` | 0 | 167 s | 30/30 terminadas con código 0 |
| `node tools/medir-narrador.mjs --json … --transcripciones …` | 0 | 44 s | 5,2 % · 3 solo eco · 24/25 |
| `node tools/regresion-app.mjs --capturas` | 0 | 46 s | 31 sistemas, 20 turnos, 0 fallos, 0 excepciones, 0 externas |
| `node tools/regresion-app.mjs --desktop --capturas` | 0 | 44 s | ídem |
| `node tools/regresion-app.mjs --sin-ia --capturas` | 0 | 41 s | ídem |
| `node tools/generar-sw.mjs --revisar` | 0 | 0 s | al día |
| `node tools/buscar-secretos.mjs` | 0 | 1 s | ninguna clave (284 commits). Es lo que ve este escáner, no una garantía |
| `node tools/medir-costes-campana.mjs --autoprueba` | 0 | 1 s | 8/8 |
| `node tools/medir-costes-campana.mjs --turnos 100 --salida …` | 0 | 19 s | arriba |

**Incidencias sin ocultar:**
- **Antes de corregir las capturas,** la regresión salía en verde con capturas a medias.
- **La primera versión de la auditoría** tenía dos comprobaciones mal planteadas:
  - El viaje: esperaba constantes de viaje, y la regla vigente es otra.
  - Torket: era un **defecto real**, ya arreglado.
- **Ninguna suite se interrumpió.** No hubo timeouts y no quedaron procesos de prueba vivos.

**Partidas leídas a mano y enteras:** semillas 9303 y 9505, 15 turnos cada una, con los casos exactos del encargo y guardar y cargar. Las transcripciones de `medir-narrador` y de `auditar-coherencia-turnos` se escriben con `--salida` / `--transcripciones`.

Nada de esto está «listo para cobrar» ni «listo para lanzamiento». Es un motor más coherente y una medición offline verificable para que decidas los siguientes pasos.
