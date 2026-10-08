# Informe del encargo #8: guardado coordinado y muerte durable entre pestañas

8 de octubre de 2026. Rama `feat/guardado-coordinado-20261008`, que sale del HEAD revisado del #7 (`6afe016`) con toda su ascendencia. `main` sigue en `8c02138`, sin tocar. No es «listo para lanzar»: siguen sin probar el narrador real, un móvil físico y un jugador humano. La fusión a `main` depende de la revisión externa.

---

## 1. Lo que sigue abierto o hay que saber primero

1. **Una carrera NATURAL entre pestañas no la he visto en Chrome, ni en la base ni aquí.**
   - **El repro de la caché vieja es un FIXTURE**, también en Chrome: `getItem` de la ranura devuelve los bytes viejos.
     - En la base `6afe016` ese fixture **pisa la campaña nueva** (Chrome real, captura `BASE-16a`).
     - Sin el fixture, la base también rechazaba el guardado en Chrome: la caché ya estaba al día.
   - **Lo que sí es real en Chrome:** el candado (Web Locks), las transacciones de IndexedDB, el reemplazo desde otra pestaña, el guardado pendiente mientras otra pestaña retiene el candado y las dos muertes a la vez.
   - Las dos muertes «a la vez» no garantizan una intercalación de milisegundos. La pérdida por el mapa compartido se demuestra con el fixture de mapas viejos, en Node y en Chrome.
2. **Ocho comprobaciones menos en `auditar-legado` (102 → 94), sin quitar casos.** La prueba de cortes comprueba una vez por cada escritura de la entrega.
   - **Por qué hay menos:** la entrega pasa de 8 escrituras a 6, porque los bytes del sucesor y el dueño de la ranura van ahora en una sola transacción y desaparece el paso aparte de «confirmar la ranura».
   - **Lo que no cambia:** cada escritura sigue con su corte y su cuota.
   - **Total:** 532 de base → **523** aquí (y servidores 79, ver el punto 7).
3. **Una expectativa original cambiada** (`auditar-legado`, «registro ilegible»).
   - **Antes (#6/#7):** con el mapa local de herencias dañado, la muerte renunciaba a guardar la herencia, para no escribir encima del mapa.
   - **Ahora:** la autoridad es una clave por run en IndexedDB. El mapa dañado se conserva byte a byte, no se escribe encima y se avisa al morir. La herencia, en cambio, **sí queda guardada**.
   - **La comprobación exige ahora todo esto junto:** el mapa intacto, el aviso, la marca y la foto (35 XP) en el registro coordinado.
4. **Fixtures de cuatro auditorías del #7 apuntados a la autoridad nueva**, sin quitar casos.
   - Antes fallaban solo en `localStorage`; ahora fallan también donde manda IndexedDB:
     - relectura que no cuadra (`legado`, `recuperacion`): ahora se altera también la copia autoritativa, porque es la que se relee;
     - almacenamiento lleno al morir (`muerte`): también lleno el registro coordinado;
     - «otra pestaña guarda» (`ranuras`): por la escritura coordinada, no escribiendo `localStorage` a mano;
     - permisos de reemplazo: con la revisión.
   - La muerte se espera a su registro real, no con un `sleep`.
5. **Hallados en las capturas de Chrome y arreglados:**
   - un «null» visible entre los botones de la pantalla de Herencia (venía del #7, cuando no hay ninguna herencia bloqueada);
   - el motivo del permiso caducado quedaba tapado por el modal;
   - el guardado manual rechazado avisaba dos veces;
   - **el rechazo prometía «guárdala en otra ranura desde el menú»**, y la interfaz no tiene ese camino. Ahora dice la verdad: la partida sigue abierta aquí, pero ya no se guarda en esa ranura, y si sales se pierde lo jugado desde su último guardado.
6. **Abierto (producto, no persistencia):**
   - **Partida huérfana:** cuando otra pestaña reemplaza tu ranura, la partida de tu pestaña no tiene adónde guardarse (no hay «guardar como» ni exportar en la interfaz).
   - **Herencias de 0 XP:** en las campañas 9303 y 9505 el nivel 1 muere sin XP, y esa herencia se ofrece y se entrega (0 XP).
   - Siguen los preexistentes ya informados en el #7: durabilidad con ruido de coma flotante, `nivelesGanados`, un nivel 1 frágil.
7. **Servidores 79, no 80.** Una comprobación depende de un enlace simbólico que esta plataforma no crea; es la misma limitación del #7, no un fallo.

## 2. Base, ascendencia y estado

- **Antes de editar:** `feat/legado-seguro-20261008` = `6afe016` = `origin`; `main` = `origin/main` = `8c02138`.
- **Rama nueva:** desde `6afe016`, sin reset ni checkout destructivo. Se conservan #6 y #7 enteros.
- **Commits:** 16 hasta `78f53cc` (código y pruebas de Node), 3 más solo de la regresión (`d5c9061`, `878db20`, `e420ca2`) y el de este informe.
  - Hasta `78f53cc`: 34 ficheros, +2216 / −497.
  - Las pruebas de Node se pasaron sobre `78f53cc`; después solo cambió `tools/regresion-app.mjs`.
  - `dcb75b5` estado coordinado v2;
  - `acae7de` ranuras;
  - `2fb4483` muerte;
  - `6ac4642` entrega del legado;
  - `6396ea9` guardado y carga;
  - `df5522a` y `a6051d9` app;
  - `889f098` motor y llamadores;
  - `5a94eae` auditorías del #7;
  - `54ec487` y `9666b37` auditorías nuevas;
  - `0ec13ef` regresión;
  - `9303f69` «Borrar todo»;
  - `8bf1690`, `f0faf0c` y `78f53cc` `sw.js`.

## 3. Autoridad, esquema y protocolo

**Qué manda (IndexedDB `arcanveil-coordinacion`, versión 2; subir de versión solo añade almacenes):**

| Almacén | Clave | Qué guarda |
|---|---|---|
| `ranuras` | ranura | `{estado: ocupada, runId, rev, ultimoToken}` · `{estado: reservada, op, runId, previo}` · `{estado: borrada, runId}` (lápida) |
| `partidas` | ranura | los bytes AUTORITATIVOS de esa revisión `{runId, rev, texto, huella}` |
| `muertos` | runId | la marca de muerte |
| `legados` | runOrigen | la foto y el estado de la herencia (#7) |

- `localStorage` (`arcanveil:partida:N`, `arcanveil:runs-muertos`, `arcanveil:legados`) queda de **espejo**. Se escribe después, sirve para listar sin esperar y por compatibilidad. Si miente (caché vieja), manda IndexedDB.

**Escribir una partida (`Ranuras.escribirPartida`), para TODOS los escritores.** Son el guardado manual, el automático, el de turno, la salida, el final de la muerte, la creación con y sin herencia, el reemplazo y la recuperación. Cada escritura:
- va bajo el candado global de Web Locks (`arcanveil:ranuras`);
- decide en **una transacción** sobre `ranuras[n]` + `partidas[n]`:
  - ocupada por OTRO run → no, aunque la caché local diga lo contrario o diga «vacía»;
  - mismo run → sí, si la revisión en la que se basa es la vigente; si no, código `revision`;
  - el mismo token → no crea otra revisión;
  - reservada → solo la operación que la reservó;
  - libre → la ocupa;
  - lápida del mismo run → no la recrea;
  - ranura de antes del #8 (solo en `localStorage`) → se importa una vez y se aplica la regla.
- **Después, el espejo.** Si el espejo no cabe, se deshace la escritura propia (solo si sigue siendo la vigente) y se devuelve el error: lo anterior o lo nuevo, nunca a medias.
- **Orden de candados:** el de la herencia (`ifAvailable`) → el global (con espera y tope de 15 s). La creación ya tiene el global y guarda con su **arriendo**, un objeto que solo existe mientras el candado está tomado. Así no hay interbloqueo ni atajo por bandera (un arriendo falso → `sin-candado`).
- **La ocupación es durable:** fuera la ventana de 30 s del #7.
- **El permiso de reemplazo** se ata a ranura + run + fecha + huella + **revisión vigente**.

**Qué es atómico y qué es recuperable:**
- **Atómico** (una transacción): dueño + bytes de una ranura; marca + foto de una muerte; cada paso del diario de la herencia.
- **Recuperable:**
  - la entrega de herencia entre sus pasos (diario #7, con verificación sobre la copia autoritativa);
  - el espejo local atrasado (lo corrige el siguiente guardado; cargar no lo usa).
- **No atómico entre sí:** la escritura coordinada y su espejo. Si el proceso muere entre los dos, el espejo queda viejo; la autoridad está bien y cargar la usa.

**Muertes (`persistence/Muertes.js`):**
- **En memoria, al instante:** el run queda terminal (fase `fin`) y la foto se congela al morir.
- **El registro es asíncrono:** `meta.muerte.guardado.estado` dice `registrando`, y después `registrada` o `error` (evento `run:registrado`).
- **Marca y foto en una transacción**, añadiendo solo si faltan. Otra foto distinta del mismo run da un conflicto explicado y se queda la primera; no gana «la de más XP».
- **Reintentar** registra la misma muerte con la foto de entonces.
- **Mapas antiguos:** se importan (añadir si falta) sin reiniciar ni repetir premio; un mapa dañado no se toca.
- **`estaMuerto`** consulta la autoridad. Si IndexedDB no responde, **lanza**, y cargar e importar lo convierten en «no se carga» con motivo.

## 4. API asíncrona y llamadores migrados

| Sitio | Antes | Ahora |
|---|---|---|
| `SaveManager.guardar` | síncrono, dueño leído en `localStorage` | `async`; foto tomada al pedir (antes del primer `await`); cola por pestaña; resultado con `runId`, `ranura`, `rev` y `texto` |
| `cargar` / `importar` | síncronos, muerte leída en el mapa local | `async`; copia autoritativa y muerte comprobada en el registro coordinado |
| `borrar` / `borrarTodo` | síncronos | en la cola y bajo el candado global, con lápidas |
| `drenar(tope)` | — | barrera con tope y error real |
| `inspeccionar()` | — | `guardadosPendientes` |
| `game:save`, `game:load`, `alTurno` | promesas sueltas | con `catch` |
| app: botón Guardar | lectura inmediata de `exito` | «Guardando…» + `aria-busy`; el doble clic no pide otro; el aviso, tras el resultado y solo si la pantalla sigue en esa partida |
| app: fin de turno y pelea | un guardado por turno | uno en marcha como mucho y uno más al terminar; el fallo se dice una vez por motivo |
| app: salir | guardado y relectura locales | espera al registro de la muerte y relee la copia AUTORITATIVA (bytes exactos + run, turno y vida) |
| app: crear con o sin herencia | `guardar` sin candado | `guardar({lease, op})` |
| app: cargar, borrar, vaciar, copia de ranura | síncronos | `await` |
| app: pantalla de muerte | marca síncrona | «registrando…» / «Muerte registrada» / error con «Reintentar» |
| `motor-sin-ventana.guardarYCargar` | reiniciaba antes de comprobar | espera al guardado y luego a la carga |
| 18 herramientas | llamadas síncronas | `await` |

## 5. Verificación

### Rojo en la base (`6afe016`), verde aquí (Node)

| Prueba | Base | HEAD |
|---|---|---|
| `tools/auditar-guardado-coordinado.mjs` (casos 1–7, 13–17) | 16/28, exit 1 | **36/36** |
| `tools/auditar-muertes-coordinadas.mjs` (casos 8–12) | 11/23, exit 1 | **23/23** |

- **Repro de la revisión (caso 1), en la base:** el guardado de A con la caché vieja da éxito y el fichero vuelve a OLD-RUN. Aquí: rechazo, NEW-RUN y su dueño intactos.
- **En la base, en verde por diseño:** 3, 4 (orden), 5, 6, 7, 13 y 14.
  - El 5 y el 13, porque el guardado síncrono no esperaba.
  - El 14, porque la caché no era vieja.
  - Son la red de no-regresión de la API asíncrona.
- **Revientan en la base por falta de API, no por comportamiento:** el caso 16 (`duenoRanura`) y la parte «Borrar todo» del 17.
- **En la base, también en rojo:**
  - el 15: tras el reemplazo fallido por cuota, A sigue cargando, pero el registro coordinado de la ranura 2 queda sin dueño (`null`);
  - el 17: tras borrar, un guardado tardío vuelve a crear la campaña.
- **Ficheros:** las versiones finales de los dos ficheros, copiadas al árbol de `6afe016`.
- **El caso 2 en la base:** la caché dice «vacía» y A escribe encima de B; con IndexedDB caída, o sin Web Locks, escribe igual.
- **Los casos 8–12 en la base:**
  - Con mapas viejos se pierden la marca **y** la foto de A (`{"a":false,"b":true}`, `{"fa":null,"fb":210}`).
  - El corte en la 2.ª escritura deja «muerto sin foto».
  - La cuota en la 1.ª deja «foto de un vivo», que además se carga.
  - La pestaña vieja revive al muerto; con IndexedDB caída, carga como vivo.
  - Con el mapa local de muertes dañado (se conserva), sus muertos dejan de contar como muertos: la base solo lee ese mapa.

### Las 532 originales (ahora 523, ver §1.2), HEAD `78f53cc`, todas exit 0

| Auditoría | Base | HEAD |
|---|---|---|
| legado | 102 | 94/94 |
| cierre | 39 | 39/39 |
| identidad | 50 | 50/50 |
| combate-menus | 37 | 37/37 |
| viaje | 21 | 21/21 |
| muerte | 34 | 34/34 |
| correcciones-diseno (bloque H, 100 turnos) | 113 | 113/113 (74 s) |
| servidores | 80 | 79/79 + limitación del enlace simbólico |
| recuperacion | 36 | 36/36 |
| ranuras | 20 | 20/20 |
| **Total** | **532** | **523/523** |

- **Nuevas, aparte:** 36 + 23 = **59/59**.
- **Apoyo:**
  - bundle 8/8;
  - SW 12/12 (219 ficheros);
  - coherencia correcta;
  - `auditar-todo` **42/42** con código 0 (376 s);
  - guardados 13/13.

### Chrome real

`tools/regresion-app.mjs`, Chrome sin ventana con perfiles temporales ficticios. Capturas en `dist/regresion-cap14/` (ignorado por git).

**Seis pasadas completas finales, HEAD `878db20`, una por modo y semilla, todas exit 0:**

| Modo | Semilla | Exit | Sistemas | Turnos | Excepciones | Fallos | Externos | Capturas | Viaje con compañero |
|---|---|---|---|---|---|---|---|---|---|
| móvil 390×844 | 20261008 | 0 | 32 | 20 | 0 | 0 | 0 | 40 | llegada |
| móvil | 505 | 0 | 32 | 20 | 0 | 0 | 0 | 40 | interrumpido por un encuentro |
| escritorio 1440×900 | 20261008 | 0 | 32 | 20 | 0 | 0 | 0 | 40 | llegada |
| escritorio | 505 | 0 | 32 | 20 | 0 | 0 | 0 | 40 | interrumpido por un encuentro |
| móvil `--sin-ia` | 20261008 | 0 | 32 | 20 | 0 | 0 | 0 | 37 | llegada |
| móvil `--sin-ia` | 505 | 0 | 32 | 20 | 0 | 0 | 0 | 37 | interrumpido por un encuentro |

- **Cobertura de cada pasada:**
  - todas las etapas del #7: muerte con y sin protección, dos pestañas con el mismo y con distinto origen, recuperación dañada, ranuras llenas, reemplazo, galería, borrado y sin red;
  - la etapa nueva **#8**, con pestañas del mismo perfil (mismo `localStorage`, misma IndexedDB, mismos Web Locks).
- **Lo que comprueba la etapa #8:**
  1. **Reemplazo y guardado viejo.** Otra pestaña reemplaza por la interfaz real la ranura de esta partida, y esta pulsa «Guardar»:
     - **sin fixture:** se rechaza con un solo aviso;
     - **con FIXTURE de caché vieja:** se rechaza igual;
     - en los dos casos se relee el espejo y la autoridad: bytes de NEW-RUN, run NEW-RUN, misma revisión y dueño NEW-RUN;
     - el guardado de fin de turno tampoco escribe.
  2. **La nueva se conserva** tras recargar su pestaña.
  3. **Guardado pendiente** mientras esta pestaña retiene el candado (FIXTURE):
     - se ve «Guardando…» sin ningún aviso y la revisión no se mueve;
     - el doble clic no crea un guardado extra: al soltar el candado sale un aviso y la revisión sube en uno (5 → 6 en las seis pasadas).
  4. **La pestaña vieja sale** con el motivo y «Salir sin guardar», sin tocar la ranura.
  5. **Permiso caducado:** la otra pestaña abre y guarda (por la interfaz) la campaña que se iba a reemplazar.
     - Se ve «ha cambiado» dentro del selector; nada tocado.
     - Con el permiso releído se reemplaza solo esa ranura.
  6. **Dos muertes a la vez** en dos pestañas, una con FIXTURE de mapas locales viejos:
     - las dos con marca y foto en IndexedDB (350 y 210 XP);
     - el final se guarda en la autoridad y en el espejo;
     - cargar al muerto da «muerto»;
     - las dos herencias se pueden elegir.
- **Capturas inspeccionadas** (16a–16h, en móvil y en escritorio): aviso de rechazo legible, botón «Guardando…», éxito, salida de la pestaña vieja, permiso caducado con su motivo, «Muerte registrada» con la cifra, dos herencias.
  - El aviso de la esquina tapa parte de la cabecera mientras dura: es el diseño de avisos de siempre, no se ha tocado.

**Rojo en la base, en Chrome real** (`--solo-pestanas`, la misma etapa contra `6afe016`): exit 1 en móvil y en escritorio.
- **Sin fixture**, la base también rechaza.
- **Con la caché vieja simulada**, la pestaña vieja dice «Partida guardada» y la relectura da `{"bytes":false,"run":"<OLD-RUN>","dueno":"<NEW-RUN>"}`: el espejo pisado por OLD-RUN mientras IndexedDB dice NEW-RUN.
- Capturas `BASE-16a-*` (fuera del repo).
- **HEAD con `--solo-pestanas`:** exit 0 en los dos modos (`e420ca2`).

**Rojos que salieron por el camino (no los escondo):**
- **Fallo mío de la prueba, HEAD `78f53cc`, móvil 505 y móvil sin generador 505.** Tras pedir una recarga en la otra pestaña, una espera fija de 600 ms leía «app lista» todavía en la página vieja.
  - Arreglo: marca de navegación, como `pulsarYNavegar` (`d5c9061`).
- **HEAD `d5c9061`, móvil sin generador 505, en el paso sin fixture.** El guardado de la pestaña vieja SÍ se rechazó: un aviso de «otra partida» y dueño NEW-RUN. Lo que falló fue la igualdad byte a byte con la referencia de NEW-RUN.
  - **Causa más probable, NO demostrada:** la referencia se leyó antes del guardado que la propia pestaña nueva hace al abrir la crónica. La pestaña vieja no puede escribir el espejo sin una escritura coordinada aceptada.
  - **La prueba es ahora más estricta:** espera a la cola de la pestaña nueva con `drenar()` y exige bytes iguales, run NEW-RUN y la misma revisión (`878db20`).
  - **Resultado:** 2 pasadas aisladas más de ese modo y las 6 finales, en verde.

### Dos campañas nuevas leídas (motor sin ventana; `campana8.mjs`, fuera del repo)

Ambas recorren el mismo camino: identidad → viaje → combate por menús → desgaste y salida → muerte → herencia → sucesor de otra clase → guardar y recargar → seguir. Todos los personajes son ficticios.

- **9303 (baluarte):**
  - Esperas interrumpidas, viaje a Saucedo y a la Linde.
  - Acampa y le caen 3 lobos; muerte natural a los 3 turnos de pelea, con 0 XP.
  - Muerte `registrada` en el registro coordinado; la ranura 5 (mismo run) no revive.
  - Sucesora glifista con 0 XP; un segundo sucesor se rechaza («ya la recibió otro»).
  - Dos guardar/cargar sin cambios.
  - FIXTURE: gana 1103 XP y muere. Tercera generación con **386 XP**, nivel 3; dos guardar/cargar iguales.
- **9505 (glifista):**
  - Posada, guardar/cargar y ataque a Dalwen: Berlo se mete.
  - Muerte natural en 7 turnos, con 0 XP.
  - Lo demás, igual que en 9303: 0 → 386 XP en tercera generación.
- **Observaciones (no de persistencia):**
  - una herencia de 0 XP se ofrece y se entrega;
  - «No hay tiempo para hablar» al intentar comer cuando atacan los lobos;
  - «¿Qué haces?» antes del cierre del turno de ataque;
  - la durabilidad sale con ruido de coma flotante.
- La estabilidad mecánica no demuestra la calidad de la narrativa real.

## 6. Compatibilidad

- **Partidas de antes del #8** (solo en `localStorage`): se listan, cargan y guardan. La primera escritura las importa a la autoridad (revisión 1).
- **Reservas del #7** que dejaron el sucesor solo en la ranura local: la verificación lo encuentra en el espejo y `confirmarRanura` lo pasa a la autoridad.
- **Mapas v1, #6 y #7** (pendiente, aplicada, reservada, bloqueada, JSON dañado): caso 12.
- **Sin cambios:** plantel, galería, bundle y SW.
- **Formato:** `VERSION_BASE` 2 conserva los almacenes de la 1. No cambia el formato de partida ni sus migraciones.
- **Límites:**
  - sin IndexedDB o sin Web Locks no se guarda en ranura (error honesto; la partida sigue en memoria);
  - sin red funciona igual (todo es local);
  - IndexedDB lleno se trata como cuota.

## 7. No probado

- Narrador real (Groq u otro), generador de imágenes real, móvil físico, jugador humano.
- Carrera natural de milisegundos entre pestañas (ver §1.1).
- Navegadores distintos de Chrome.

## 8. Git

- **Push** normal SOLO de `feat/guardado-coordinado-20261008` a `origin` (`github.com/petetes93/arcanveil`). El SHA y la URL comprobados van en el mensaje de entrega.
- **Sin tocar:** `main` (`8c02138`), PR, merge y publicación del producto.
- **Coste:** 0 €. Sin proveedores reales, sin cuentas y sin datos reales del jugador: todo con personajes, perfiles y carpetas ficticias.
- **Pendiente:** la revisión externa antes de cualquier fusión.
