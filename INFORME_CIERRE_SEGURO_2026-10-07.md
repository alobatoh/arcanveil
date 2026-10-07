# Prompt correctivo #5: identidad sin escapes, salida segura, desgaste y escritorio (7-oct-2026)

**Rama** `feat/cierre-seguro-20261007`, sacada de `feat/menus-identidad-muerte-20261007` en **2fc676b**: el SHA del encargo. Al empezar el árbol estaba limpio, sin avances posteriores, y `main` seguía en 8c02138.

**HEAD del código: 8a4751a.** Son 16 commits y 13 ficheros (+654 / −47), más el commit de este informe.

- **`main`:** 8c02138, sin tocar.
- **Sin PR, sin merge ni publicación.** El encargo pide desarrollo local. Alejandro ha pedido en el chat, varias veces, que cada trabajo se suba a una rama nueva y no a `main` («Súbelo a una nueva rama… para no subirlo a la main»). Por eso esta rama se sube a GitHub: solo la rama.
- **0 euros.** Ni proveedores de narración o imágenes, ni pagos, cuentas o claves. Todo se ha probado con dobles, el motor sin ventana y Chrome con perfiles temporales. No se han tocado partidas, galería ni almacenamiento reales. Solo se tocó la vista previa de este equipo (`localhost:8080`): se le quitó el service worker de prueba para ver la clásica.

Las cifras de la revisión anterior (50/50, 37/37, 21/21, 40/40, 148/148, 113/113, 77/77) son históricas. Todo lo de abajo se ha medido sobre ESTE código.

---

## 1. Primero, lo que falla, queda abierto o no se ha probado

### Decisiones que siguen siendo tuyas

- **Legado 35 %:** sigue PENDIENTE. `LEGADO_CONFIRMADO` sigue en null, se guarda una foto por run y no hay premio productivo. Falta saber: ¿experiencia acumulada o puntos de habilidad (disponibles o también gastados)? Y, si es experiencia, ¿qué redondeo y qué pasa con lo heredado de generaciones anteriores?
- **Interfaz clásica:** adaptarla al combate por menús o retirarla. La evidencia está en el apartado 5. Hoy tiene un aviso reversible.

### Abierto o preexistente

1. **La clásica no funciona más allá del aviso.**
   - Su menú de inicio sale vacío (pantalla «menu» sin nada visible). Es preexistente y no lo he reparado: reparar la clásica es la decisión de arriba.
   - Arreglé otra rotura preexistente: la capa de hazañas se montaba en `body` y borraba la página entera (salía en negro). Gracias a eso, el aviso y el enlace a la vigente se ven.
   - **El archivo único de `tools/bundle.mjs` parte de la clásica**, así que hereda lo mismo. Además, su enlace relativo a `app/` no existe fuera del servidor.
2. **La clásica sin red.** El service worker no la tiene precargada; una navegación sin red cae en `app/index.html`, la versión vigente. Lo he visto en el código, no en Chrome.
3. **La durabilidad acumula decimales de coma flotante** (98,80000000000001). Es la regla de siempre (0,6 por golpe con daño). No afecta al tope en 0, que es exacto, pero en un listado sin redondear se vería feo.
4. **La regla de desgaste prevé ×2 en un crítico** (`Durability.desgastarArma`), pero nadie la invocaba así. La conservo tal cual (siempre 0,6) y la dejo como propuesta, no como cifra tuya.
5. **Sin probar:** el narrador real de IA, un móvil físico, un jugador humano y la muerte permanente frente a manipulación externa (es coherencia local, no antifraude).
6. **Siguen en pie** los preexistentes del informe #4: guardia y encuentros duros a nivel 1, logros que miran `store.estado`, el aviso de nivel con `{nivel}`.

### Inestabilidad de las propias pruebas, encontrada y arreglada

| Dónde | Qué pasaba | Arreglo |
|---|---|---|
| Escritorio, «Tiempo agotado» antes del combate de prueba | Con muerte permanente, la pelea del grupo PUEDE matar (reproducido sin fixture: «La oscuridad te alcanza»). La prueba daba por hecho que seguía viva | Si muere, se comprueba ESA muerte y se sigue con un run nuevo |
| Escritorio, «Inspected target navigated or closed» | Un clic que recarga dentro de una evaluación de CDP: carrera | `pulsarYNavegar`: pulsa desde un temporizador de la página y espera al documento nuevo |
| Salida con el enemigo actuando | El turno enemigo dura ~750 ms; la captura, o el daño del fixture, llegaban tarde según el reloj | FIXTURE de cadencia: la pausa del turno enemigo espera a que la prueba la suelte |

No he alargado ninguna espera, ni añadido reintentos, ni quitado aserciones.

---

## 2. Intensificadores (un «todo/toda…» no concede objetos)

**Reproducido en 2fc676b:** con la semilla 9303 y Sive sin katana, «Ataco a Korsa con toda mi katana» abría pelea, cobraba 10 minutos, agresión y reputación. Igual con «usando toda mi katana», «todas mis katanas», «todo mi cuchillo mágico», «toda una katana» y «todo el cuchillo de plata». Auditoría: 19/35 en la base.

**Causa:** `noEsObjeto` daba por modo TODO sintagma intensificado antes de mirar qué nombraba.

**Contrato** (`src/engine/ArmaPedida.js`): el intensificador se quita y se decide por lo que queda:
- un modo de la lista cerrada, el cuerpo, la magia o una persona;
- o un objeto, que tiene que estar en el inventario real (por identidad, `IndiceObjetos`).

A los modos se suman sustantivos genuinos de «todo mi…» (peso, alma, empuje, potencia…); ningún nombre de arma.

**Después:** 39/39 en `tools/auditar-cierre.mjs`:
- **Aclaran sin gastar** las diez variantes (con, usando, utilizando, empleando; calificadores, plurales, coordinación con el hacha).
- **Siguen valiendo** los modos intensificados y normales, el arma válida intensificada, el cuerpo y «toda la fuerza de mis puños».
- **No cuentan como ataque** la cita, la negación y la condición.
- **Dos cuchillos** preguntan cuál.
- **En combate**, el texto va al menú.
- `auditar-identidad` sigue en 50/50.

---

## 3. Salida segura

**Reproducido en 2fc676b** (Chrome, la regresión nueva sobre la base):
- «Menú» con doble clic: **dos guardados y recarga**.
- Con la persistencia apagada: **recarga en el acto**. La evaluación de la prueba muere con la página y no hay ningún aviso.

Por inspección, mismo patrón en «Comenzar partida» (con otra cargada) y en «Volver al menú» / «Nueva partida» de la pantalla de muerte.

**Contrato** (`app/app.js`, `salirConGuardado`, para los cuatro caminos):
- **Cuándo se recarga.** Solo tras un guardado COMPROBADO: se relee la ranura y se comparan run, turno y vida.
- **Con el enemigo actuando.**
  - Sale «Esperando para salir» y se sale en la frontera segura (el turno del jugador o el fin de la pelea), guardando el estado de ESE momento.
  - «Cancelar y seguir jugando» deja la partida viva.
  - Nada se congela ni se fuerza, y al cargar no se repite ningún golpe.
- **Si muere entretanto,** manda la pantalla de muerte, que ya guarda el final.
- **Si no se puede guardar** (persistencia apagada, almacenamiento lleno, escritura no comprobada):
  - se dice la causa y se ofrece «Reintentar», «Quedarme» o «Salir sin guardar…»;
  - esta última pide confirmación diciendo qué se pierde; el foco está en «Volver» y Escape es quedarse.
- **Una sola salida a la vez:** el doble clic no guarda ni recarga dos veces.
- **Lo que no toca:** marcas de muerte, legados, otras ranuras, personajes ni galería. La persistencia apagada no se enciende sola.
- **«Guardar»** dice lo que de verdad ha pasado (con la misma relectura).

**Además** (`player/Muerte.js` y `CombatManager.cerrarPorMuerte`): si se muere por otra vía con una pelea abierta, la pelea se cierra como derrota.

**Pruebas en Chrome** (navegación real y relectura de la ranura, no un espía de «guardar»):
- **Doble clic:** un guardado, una navegación, y la ranura con el turno, el run y la vida exactos.
- **Persistencia apagada:** no recarga, dice la causa, y Escape deja quedarse.
- **Almacenamiento lleno:** sale el error. «Salir sin guardar…» pide confirmación con el foco en «Volver», «Volver» regresa al error y el reintento funciona con relectura.
- **Enemigo actuando:** «Esperando para salir», cancelar, salir en la frontera y cargar con vida y enemigos idénticos.
- **Muerte con la salida pendiente:** manda la muerte y no se navega.

**No automatizado:** el toque real en una pantalla táctil (las pruebas pulsan por DOM y teclado), y un error de serialización distinto del almacenamiento lleno. Para este último, la ruta es la misma que cualquier `exito: false`.

---

## 4. Desgaste del arma que de verdad atacó

**Reproducido en 2fc676b:** las armas no se desgastaban nunca. En 9303, el cuchillo de la rastreadora seguía a 100 tras golpes con daño; con dos armas, ninguna bajaba; a 0,5 de durabilidad nunca llegaba a romperse.

**Causa:** `_desgastarArma` leía `inventory.equipado.manoPrincipal` (la ranura es `armaPrincipal`) y no recibía el ataque elegido.

**Contrato:**
- **Qué se desgasta.** El `itemId` del ataque elegido, con la regla de siempre: 0,6 por golpe con daño.
- **Qué no.** Sin arma (golpe, magia) no se desgasta ninguna, y la otra mano no se toca. Rechazos, fichas viejas y cancelaciones no desgastan.
- **Límite.** El tope es 0: ni negativo ni NaN.
- **Arma rota.** Se desequipa sola. El menú la sigue enseñando «está roto», sin poder elegirla, consulta tras consulta (arreglado tras verlo en Chrome), y ofrece el golpe sin arma.
- **Persistencia.** Guardar y cargar no la devuelven sana.

**Pruebas:**
- **Rastreadora 9303 natural:** el cuchillo de la mano secundaria pierde 0,6 por golpe con daño, y el arco de la mochila no se toca.
- **Dos armas:** la daga baja 0,6 y la espada no.
- **Campaña 9505:** 100 → 99,4 → … → 95,2 en los golpes con daño, sin cambios en los fallos.
- **En Chrome:** captura 15 del arma rota en la etapa de ataque.

---

## 5. Interfaz clásica

**Evidencia:**
- **Entradas.** La portada (`index.html`) la enlazaba como «Interfaz original». `tools/bundle.mjs` construye el archivo único a partir de ella. `tools/servir.mjs` la sirve. README y CLAUDE.md la mencionan.
- **Combate.** Su panel enviaba `combat:action` sin ataque ni ficha, y el motor actual lo rechaza.
- **Al abrirla** (preexistente): salía en negro, porque la capa de hazañas vaciaba el `body`, y su menú sale vacío.

**Tratamiento reversible** (no es una decisión de producto):
- **Arriba,** un aviso visible: «Interfaz antigua: no es compatible con el combate actual (no se puede atacar)», con el enlace «Juega en la versión vigente» a `app/index.html`.
- **El panel de combate clásico** ya no dibuja «Atacar», ni lo ata a la tecla 1, ni promete «atacar al más débil». Defender, Objeto y Huir siguen, y el motor los valida.
- **La portada** enlaza «Interfaz original (antigua: sin el combate actual)».
- **La capa de hazañas** se monta en su propio hueco.
- **No se ha borrado nada.** Las migraciones y los datos quedan como estaban.

**Pruebas:**
- **En Chrome:** la portada servida avisa; `clasico.html` muestra el aviso dentro de la pantalla, con un enlace que resuelve a `/app/index.html` y sin ningún `[data-accion="atacar"]` (captura 14).
- **Estática** (`auditar-cierre`): ni botón ni tecla de atacar.

**Opciones para decidir, con su coste mínimo:**
- **(a) Retirarla:** quitar el enlace de la portada y que el bundle parta de `app/`. Es poco código, pero cambia lo que abre el archivo único.
- **(b) Adaptarla:** el mismo menú por etapas que `app/`, y además reparar su menú vacío. Es mucho más trabajo y duplica interfaz.
- **(c) Dejarla como está:** con el aviso.

---

## 6. Regresión de escritorio

Ver el cuadro del apartado 1. Además:
- **Etapas con hora en el registro.**
- **Al vencer una espera,** se vuelca el estado del motor (fase, muerte, vida, combate, encuentro, viaje, últimas líneas).
- **Una evaluación cortada por una navegación** dice su etapa.
- **La rama de muerte natural** se ejercitó forzándola (FIXTURE en una copia temporal, que no se commitea): la regresión entera terminó con exit 0.

### Rojo en la base real, verde aquí

| Prueba | 2fc676b | 8a4751a |
|---|---|---|
| `node tools/auditar-cierre.mjs` | 19/39 (salida 1) | **39/39** (0) |
| `regresion-app`, salida segura | doble clic: 2 guardados (para ahí); con ese fallo solo anotado, con la persistencia apagada recarga en el acto («Uncaught» al morir la página) | **verde** en los cuatro modos |
| Arma rota, consulta tras consulta | — | roja sin 897dbcb (38/39), verde con él |

### Suites y medidas sobre 8a4751a (offline)

| Orden | Resultado | Salida |
|---|---|---|
| `node tools/auditar-todo.mjs` (por lotes) | **36/36** auditorías con código 0, incluidas identidad 50/50, menús, viaje, muerte, coherencia, diseño y cierre | 0 |
| `node tools/auditar-servidores.mjs` ×3 (aislados) | 76/76, 76/76, 76/76 | 0, 0, 0 |
| `node tools/generar-sw.mjs --revisar` | al día | 0 |
| `node tools/buscar-secretos.mjs` | ninguna clave | 0 |
| `node tools/bundle.mjs` | `dist/arcanveil.html` (ignorado por git) | 0 |
| `node tools/medir-costes-campana.mjs --autoprueba` | todo bien; ninguna petición salió del equipo | 0 |
| `node tools/medir-costes-campana.mjs --turnos 100` | 200/200 turnos, 214 peticiones simuladas, 0 intentos de red; estimación $1,24–$1,94 (no es una factura) | 0 |
| `node tools/medir-narrador.mjs` | 132 turnos, 5,6 % de frases repetidas, 25/25 preguntas atendidas | 0 |

El servidor da 76 comprobaciones en esta máquina, no las 77 de la revisión anterior. No he investigado la diferencia.

### Chrome sobre 8a4751a (`node tools/regresion-app.mjs --capturas [--desktop|--sin-ia]`, perfil temporal)

| Modo | Salida | Sistemas | Turnos | Fallos | Excepciones | Externas | Capturas |
|---|---|---|---|---|---|---|---|
| móvil 390×844 | 0 | 32 | 20 | 0 | 0 | 0 | 22 |
| escritorio 1440×900, 1.ª | 0 | 32 | 20 | 0 | 0 | 0 | 22 |
| escritorio 1440×900, 2.ª | 0 | 32 | 20 | 0 | 0 | 0 | 22 |
| sin generador 390×844 | 0 | 32 | 20 | 0 | 0 | 0 | 19 |

- **Escritorio,** además, completo y en verde tres veces seguidas sobre ff6f2ff y dos sobre 23892b7.
- **La rama de muerte natural** se forzó una vez en escritorio y terminó con exit 0.
- **Las capturas** de cada modo van a su carpeta, que se vacía antes; el SHA está anotado junto a ellas.

**Píxeles mirados:**
- **El menú de combate:** principal, ataque, enemigo, confirmación, tras el golpe y arma rota (captura 15: el arma atenuada con «está roto» y el golpe disponible).
- **La salida:** esperando (13), error con persistencia apagada (11) y salir sin guardar (12, con el foco en «Volver» tras el arreglo).
- **El resto:** muerte y nueva partida (08, 09), el menú tras salir (10), sin red (04) y la clásica con su aviso (14).

**Corregido tras mirar:** el foco en el botón destructivo, y el arma rota que desaparecía.

### Dos campañas nuevas leídas (sobre 8a4751a; motor sin ventana, procedural)

**9303, rastreadora:**
- «con toda mi katana», «usando toda mi katana», «todo mi cuchillo mágico» y «toda mi fuerza y el hacha» aclaran sin gastar.
- «Zorvak mientras Korsa mira» aclara.
- Hay espera, guardar y cargar, y viaje Vado → Saucedo → Linde.
- Pelea por menú contra tres lobos: el cuchillo de la mano secundaria solo baja con golpes con daño; las dos veces falló, así que se queda en 100.
- Muere, la ranura anterior no carga y empieza un run nuevo.

**9505, baluarte:**
- «con todas mis katanas» y «el cuchillo y el hacha» aclaran.
- Entra y sale de la posada, guarda y carga.
- Ataque a Dalwen: 14 turnos de menú contra Berlo; la espada baja 0,6 por cada golpe con daño, de 100 a 95,2, y la orden repetida se rechaza siempre.
- Muere, la ranura anterior no carga y empieza un run nuevo.

---

## 7. Lo que se conserva

- **Las cinco decisiones** anteriores y los contratos de #3/#4. Siguen en verde:
  - `auditar-correcciones-diseno`, coherencia, identidad, viaje, muerte, menús, combate libre y tester;
  - en las campañas: viaje Saucedo → Linde, «Zorvak mientras Korsa mira» y la muerte permanente con ranura bloqueada.
- **Esquema sin cambios:** formato 10, sin migraciones nuevas. El índice de objetos sigue siendo derivado (no se guarda ningún Map). La durabilidad vive en el objeto, como siempre.

---

## 8. Estado de git

- **Rama:** `feat/cierre-seguro-20261007` sobre 2fc676b. Son 16 commits, uno por cambio lógico, más el del informe.
  - Producto: intensificadores; desgaste; salida segura; muerte que cierra la pelea; clásica; foco seguro; arma rota visible.
  - Pruebas: auditoría de cierre; regresión de escritorio; salida en Chrome; cadencia; foco; arma rota.
  - Tres `sw.js` regenerados.
- **Ficheros:** `src/engine/ArmaPedida.js`, `src/combat/{CombatManager,Combatant}.js`, `src/player/Muerte.js`, `src/ui/{UIManager.js,components/CombatPanel.js}`, `app/{app.js,index.html}`, `clasico.html`, `index.html`, `sw.js`, `tools/{auditar-cierre,regresion-app}.mjs`.
- **Árbol:** limpio tras el commit del informe. `dist/` está ignorado. Las copias temporales de reproducción (`tools/_repro-*.mjs`) se borraron sin commitear.
- **`main`:** 8c02138, sin tocar. Sin PR ni merge. Historial sin reescribir.

**Una frase de commit adelantada.** El mensaje de b2f67e4 dice «Ruta reproducida en Chrome sobre 2fc676b» y se escribió antes de ejecutarlo. Después se reprodujo de verdad (ver arriba), así que lo que dice es cierto, pero el orden no fue ese.

**No es un «listo para lanzar»:**
- faltan dos decisiones tuyas: la base del legado y qué hacer con la clásica;
- están sin probar el narrador real de IA, un móvil físico y un jugador humano;
- la identidad de objetos no está «cerrada» para cualquier frase: está cubierta para las variantes probadas.
