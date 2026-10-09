# Informe del encargo #10: tokens durables

9 de octubre de 2026. Rama `feat/tokens-durables-20261009`, que sale de `feat/retry-harness-20261008` = `7283b5a` (sin avances posteriores al empezar). `main` sigue en `8c02138`, sin tocar. No es «listo para lanzar»: siguen sin probar el narrador real, un móvil físico y un jugador humano. La fusión a `main` depende de la revisión externa.

---

## 1. Lo que sigue abierto o hay que saber primero

1. **Una pasada oficial de Chrome falló y NO tengo la causa.**
   - **Qué pasó:** en la primera tanda (`c98b479`), `--sin-ia` con la semilla 505 se cortó en el puente clásico. El documento final `app/index.html` cargó, pero el motor «no arrancó» en 15 s.
   - **Es el mismo síntoma que vio la revisión externa** en una pestaña auxiliar, también en `--sin-ia`.
   - **No lo he reproducido** en 6 intentos más de ese modo y semilla: 3 en reposo y 3 con la batería de Node corriendo a la vez como carga, todos exit 0 en 111–113 s.
   - **Tampoco salió en la tanda final:** 6/6 en verde sobre `0748a21`.
   - **No le he puesto reintentos.** La regresión ahora, si vuelve a pasar, dice:
     - el documento real (URL, `readyState`, si existe `ARCANVEIL`, si el SW la controla);
     - el rótulo de arranque (qué sistema se estaba iniciando) y `#fallos`;
     - las navegaciones y las incidencias recientes (excepciones, consola, red), con una captura.
   - **Sigue abierto.**
2. **«Maná» no está retirado en el código. La revisión lo daba por retirado.**
   - **Lo que se calcula:** `CharacterFactory` y `Progression` calculan el maná máximo.
   - **Dónde aparece con ese nombre:** rasgos de raza y clase, la «Poción de maná» y el aviso de magia en combate.
   - **La interfaz lo llama «Ánima»** (la barra del personaje).
   - **Lo que he cambiado:** como pide el encargo, la estimación de herencia ya no lo menciona y dice lo que de verdad se calcula: vida y puntos.
   - **Pendiente de decidir:** el doble nombre (maná en los datos, Ánima en la barra). No he renombrado datos ni tocado balance.
3. **El almacenamiento de recibos NO está acotado.** Esa es la decisión (§3).
   - Crece unos 130 B por guardado con token, más el contenido canónico de cada operación deshecha mientras no se rehace.
   - La interfaz no usa tokens: solo crece con quien los pasa por la API.
4. **Lo que la poda del #9 ya borró no se recupera.** Si alguien hizo más de 200 guardados con token en una versión con esa poda, los tokens de los recibos borrados no se pueden reconocer (no queda evidencia). En la práctica es improbable: la interfaz no usa tokens.
5. **Servidores 79, no 80:** este Windows no deja crear el enlace simbólico de FICHERO sin permisos, como en el #9. Lo cubre la misma comprobación de ruta canónica, pero no se ejecuta aquí.
6. **Push:** está dentro de la autorización permanente del propietario (al terminar, push de la rama, nunca `main`, PR ni merge). La URL comprobada va al final.

## 2. Base, ascendencia y cambios

- **Antes de editar:** árbol limpio; `feat/retry-harness-20261008` = `origin` = `7283b5a`; `origin/main` = `8c02138`.
- **Commits** (`7283b5a..0748a21`, más este informe):
  - `9a553d2` recibos durables (`src/persistence/Ranuras.js`);
  - `f9b4afd` texto de herencia (`app/app.js`);
  - `e168452` auditoría nueva (`tools/auditar-tokens-durables.mjs`);
  - `a9c8f23` y `0748a21` regresión (`tools/regresion-app.mjs`);
  - `c98b479` `sw.js`.
- **Ficheros:** `app/app.js`, `src/persistence/Ranuras.js`, `sw.js`, `tools/auditar-tokens-durables.mjs` (nuevo) y `tools/regresion-app.mjs`.

## 3. Contrato durable y decisión

**Causa:**
- `Ranuras.escribirPartida` llamaba, cada 25 escrituras con token, a `podarOperaciones(200)` sin esperarla y fuera del candado.
- La poda borraba los recibos más antiguos, también los de otras ranuras y los deshechos.
- Sin recibo, un token opaco ya usado es indistinguible de uno nuevo, y se aceptaba como operación NUEVA.

**Decisión: los recibos no se borran nunca.**
- Se quita la poda entera (`podarOperaciones` ya no existe).
- Es la solución pequeña y correcta que el propio encargo prefiere a un protocolo de compactación mal probado.
- **No hay compactación:** ni ventana, ni TTL, ni huella corta, ni reloj.
- **Sin poda desaparece también la carrera listar → borrar:** no queda ningún borrado de recibos que pueda cruzarse con un escritor.
- **Sin migración:** el almacén `operaciones` (v3) ya existía y no cambia de formato. No hay nada que recrear ni que el jugador tenga que borrar.

**Matriz** (efecto de la limpieza: ninguna, porque no hay limpieza):

| Estado del token | Reintento con el mismo contenido | Con otro contenido / otra ranura, run u operación | Tras mucha actividad, recarga o proceso nuevo |
|---|---|---|---|
| hecho y vigente | `repetido`: misma revisión y bytes originales, sin escribir | `token-contenido`, nada cambia | igual (caso C, I) |
| hecho y superado | `token-superado`, nada cambia | `token-superado` / `token-contenido` | igual (casos A, B, E, F) |
| deshecho (no cupo el espejo) | se rehace UNA vez (una revisión), luego `repetido` | `token-contenido` | igual (caso D) |
| no confirmado | no dejó recibo: no se usó; es una operación nueva sujeta a dueño y revisión | — | — |
| pendiente | no existe: recibo, dueño y bytes van en UNA transacción | — | — |
| podado por el #9 | no reconocible (límite anterior a esta versión) | — | — |

- **«Borrar partidas y personajes» sí vacía los recibos:** el jugador pide borrarlo todo.
  - Las lápidas de cada ranura (#8) siguen impidiendo que un reintento tardío de esa campaña la recree.

## 4. Repro: rojo en `7283b5a`, verde aquí

**Node** (`node tools/auditar-tokens-durables.mjs`, API real, sin tocar recibos a mano ni llamar a una poda):

| | Base `7283b5a` | HEAD |
|---|---|---|
| Total | **6/28**, exit 1 (22 s) | **28/28**, exit 0 (17 s) |
| Caso A (225 guardados naturales) | el recibo de T desaparece; T con el turno 500 da `{"exito":true,"rev":228,"turno":500}` y la carga devuelve el 500 | T sigue `token-superado`; autoridad y espejo en el 325; una operación nueva guarda |

- **La barrera de mantenimiento es real.** Si el producto tiene poda (la base), se espera a que el almacén de recibos deje de cambiar y se apunta lo visto (la base acaba con 202 recibos). Si no la tiene (el HEAD), se comprueba que no se ha borrado ninguno.
- **Casos:**
  - **B:** actividad desde otra ranura;
  - **C:** campaña tranquila contra otra muy activa;
  - **D:** recibo deshecho tras la actividad;
  - **E:** otra instancia del gestor;
  - **F:** retry viejo a la vez que un guardado nuevo, y dos «pestañas» con el mismo token;
  - **G:** ningún borrado de recibos, con 4 cortes de cuota a mitad (222 recibos = 222 operaciones confirmadas);
  - **H:** turno, XP, vida, inventario, combate, run, ranura y operación;
  - **I:** la misma hora en todo y el reloj hacia atrás, con empates;
  - **J:** volumen.
- **En la base fallan:** A–H (I y J en parte).

**Volumen medido (J), con datos ficticios en Node, doble de candados y estado en memoria:**
- 2000 guardados con token en 2,65 s (1,33 ms por guardado);
- 2000 recibos que ocupan 262 673 B (131 B por recibo), frente a 16 013 B de una partida.
- Es un benchmark, no una garantía de seguridad.

**Chrome real** (IndexedDB y Web Locks de verdad; etapa `#10` de `tools/regresion-app.mjs`, también en `--solo-pestanas`):
- **Pasos:** se guarda con `review-old-…`; 225 guardados reales con tokens nuevos (turnos 1000–1224); se fija el turno 2000 y se reintenta con el token viejo.
- **Base** (`--solo-pestanas`, móvil y escritorio): exit 1, con `recibo tras la actividad: null`, `misma: {"exito":true,"rev":233}`, IndexedDB y espejo en el turno 2000. Es lo mismo que observó la revisión.
- **HEAD:** el token viejo da `token-superado`:
  - en la misma pestaña;
  - tras RECARGAR la pestaña;
  - desde OTRA pestaña del mismo perfil, a la vez que un guardado nuevo en esta (el nuevo queda: una revisión más, turno 1225 en IndexedDB y en el espejo).

## 5. Pruebas: comandos oficiales en procesos limpios

HEAD `0748a21`, Node 24.17.

| Comando | Exit | Resultado | Duración |
|---|---|---|---|
| `node tools/auditar-token-guardado.mjs` | 0 | 43/43 | 7 s |
| `node tools/auditar-tokens-durables.mjs` (nueva) | 0 | 28/28 | 17 s |
| `node tools/auditar-guardado-coordinado.mjs` | 0 | 36/36 | 9 s |
| `node tools/auditar-muertes-coordinadas.mjs` | 0 | 23/23 | 7 s |
| `node tools/auditar-doble-candados.mjs` (completa, con sus 8 subprocesos) | 0 | 17/17 | 135 s |
| `node tools/auditar-legado.mjs` | 0 | 94/94 | 11 s |
| `node tools/auditar-identidad.mjs` | 0 | 50/50 | 17 s |
| `node tools/auditar-combate-menus.mjs` | 0 | 37/37 | 16 s |
| `node tools/auditar-viaje.mjs` | 0 | 21/21 | 6 s |
| `node tools/auditar-muerte.mjs` | 0 | 34/34 | 25 s |
| `node tools/auditar-cierre.mjs` | 0 | 39/39 | 17 s |
| `node tools/auditar-recuperacion.mjs` | 0 | 36/36 | 13 s |
| `node tools/auditar-ranuras.mjs` | 0 | 20/20 | 16 s |
| `node tools/auditar-correcciones-diseno.mjs` | 0 | 113/113 | 74 s |
| `node tools/auditar-servidores.mjs` | 0 | 79/79 (el enlace de fichero no se puede crear aquí) | 7 s |
| `node tools/auditar-playtest.mjs --salida dist/playtest-tokens-durables` | 0 | 25/25 | 30 s |
| `node tools/auditar-bundle.mjs` | 0 | 8/8 | 3 s |
| `node tools/auditar-sw.mjs` | 0 | 12/12 | 0 s |
| `node tools/auditar-coherencia.mjs` | 0 | correcto | 0 s |
| `node tools/auditar-guardados.mjs` | 0 | 13/13 | 1 s |
| `node tools/generar-sw.mjs --revisar` | 0 | `sw.js` al día | 0 s |
| `node tools/auditar-todo.mjs` | 0 | 45/45 con código 0 | 535 s |

- Los doce del #9 suman 582 (583 con servidores 80). Más 28 nuevas = **610**, contando cada escenario una sola vez.
- `tokens-durables` es un fichero aparte: no repite casos de `token-guardado`; prueba la duración tras mucha actividad.

**Chrome, comandos oficiales** (proveedor de imágenes falso local o sin generador; cero peticiones externas). Se registran TODAS las pasadas:

| Tanda | HEAD | Móvil 20261008 / 505 | Escritorio 20261008 / 505 | `--sin-ia` 20261008 / 505 |
|---|---|---|---|---|
| 1 | `c98b479` | 0 (119 s) / 0 (114 s) | 0 (128 s) / 0 (120 s) | 0 (115 s) / **1** (123 s, ver §1.1) |
| Reproducción (diagnóstico ampliado) | `c98b479` + el diagnóstico aún sin commit (mismo contenido que `0748a21`) | — | — | 6 × 505: todos 0 (111–113 s; 3 con carga) |
| Final | `0748a21` | 0 (119 s) / 0 (114 s) | 0 (124 s) / 0 (121 s) | 0 (116 s) / 0 (111 s) |

- **En la tanda final, cada pasada:**
  - 32 sistemas, 20 turnos, 0 excepciones, 0 fallos, 0 externos;
  - etapas #8 (4/4), #9 (2/2) y #10 (1/1);
  - salida con barrera; contrapruebas del ayudante de navegación; diagnóstico de pestaña sin motor; puente clásico; sin red; borrado final.
- **Viaje:** «llegada» con 20261008; «interrumpido por un encuentro» con 505.
- Capturas en `dist/regresion-cap17/` (ignorado).
- **Las capturas `aux-fallo-*` son la contraprueba deliberada del diagnóstico** (una pestaña sin juego), no un fallo.

## 6. Texto de herencia

- **Antes:** «Vida, maná y puntos salen de su clase, no de la del caído.» Falso por dos lados: mencionaba maná y atribuía todo a la clase.
- **Ahora:** «Su vida sale de su oficio, sus atributos y ese nivel; sus puntos de habilidad, talento y atributo, de los niveles que gane. Nada se copia del caído.» La tarjeta resumida dice «su vida y sus puntos se calculan para él; nada se copia del caído».
- **Comprobado en el código:**
  - la vida máxima sale del dado de vida del oficio, del modificador de Vigor (atributos: linaje y reparto) y del nivel;
  - los puntos salen de la tabla por nivel, igual para todas las clases.
- **No cambia:** la herencia es el 35 % de la XP; la estimación de nivel y la entrega al confirmar son las mismas.
- **La regresión exige el texto exacto** y que no aparezca «maná» ni en el aviso ni en la tarjeta.
- **Capturas inspeccionadas:** `09b-herencia-confirmar` en móvil (legible, sin maná) y en escritorio.

## 7. Transcripciones del playtest (semillas 5 y 24, narrador PROCEDURAL, sin modelo)

- **Reacción al texto libre:**
  - «salto 50 metros» se resuelve con un intento imposible narrado;
  - «me enfrento a un vecino» pide con quién y lista a los presentes con su oficio;
  - «dejame en paz» se dice con su tilde;
  - «le doy las gracias a Cordan» cierra la conversación.
- **Coherencia de actores:** los nombres y oficios encajan, y la guardia pregunta por el robo después del robo.
- **Sugerencias:** siguen el hilo («Contarle lo que viste» cuando la guardia pregunta). Una vez salió una sola sugerencia (semilla 24, tras escuchar los corrillos).
- **Repetición:** el rumor del hierro sale dos veces en cuatro turnos (preguntando y escuchando). «Mirar alrededor» varía entre el río y el puente.
- **Continuidad tras cargar:** no aparece en estas transcripciones. La cubren las auditorías (identidad, viaje, guardados) y las campañas del #9.
- **Nada de esto mide la calidad de un modelo real.**

## 8. Coste y límites

- **Coste:** 0 €.
- **Sin servicios reales:** ningún proveedor de narración ni de imágenes, ni cuentas o pagos. Perfiles de Chrome temporales y ficticios.
- **Sin datos reales:** ninguna partida real del jugador en las pruebas.
- **Sin probar:** narrador real, móvil físico, jugador humano, navegadores distintos de Chrome.
