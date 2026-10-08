# Informe del encargo #9: reintento honesto, fixture común y Chrome reproducible

8 de octubre de 2026. Rama `feat/retry-harness-20261008`, que sale de `feat/guardado-coordinado-20261008` = `9e1ccde` (#8 completo, con #7 `6afe016`, #6 `f81efd9` y #5 `3cc8421` debajo). `main` sigue en `8c02138`, sin tocar. No es «listo para lanzar»: siguen sin probar el narrador real, un móvil físico y un jugador humano. La fusión a `main` depende de la revisión externa.

---

## 1. Lo que sigue abierto o hay que saber primero

1. **Token: el contrato de la API estaba roto; un fallo cotidiano no está demostrado.**
   - **El repro de la revisión es real y en rojo en `9e1ccde`:** guardar con un token, cambiar el turno a 500 y volver a guardar con el mismo token da «éxito». El resultado y el espejo dicen turno 500; IndexedDB sigue en 0.
   - **La interfaz no reutiliza tokens.** Ningún flujo de la app los pasa; tras el cambio, sin token cada guardado es una operación nueva.
   - El arreglo cierra el contrato de la API, no una pérdida observada jugando.
2. **Servidores: 79, no 80.** La comprobación que falta crea un enlace simbólico de FICHERO, que este Windows no deja crear sin permisos; el propio registro lo dice. La cubre la misma comprobación de ruta canónica, pero no la he ejecutado aquí. **Total: 582, no 583.**
3. **`auditar-legado` da 94, no 102** (cambio del #8): la entrega hace 6 escrituras en vez de 8, y la prueba comprueba un corte y una cuota por escritura. No falta ningún caso.
4. **Las dos discrepancias de Chrome de la revisión no las he visto aquí con el código de antes.** Lo que sí he hecho:
   - **Contador de guardados:** reproduzco la contaminación DENTRO de la propia regresión (un guardado previo en cola con el candado retenido) y compruebo que la barrera la quita. Es una precondición de la prueba; el producto no cambia por ello, salvo el aviso de «Guardando antes de salir».
   - **«Inspected target navigated or closed» en el puente clásico:** la causa la describe la revisión (evaluar mientras la redirección destruye el contexto). Está cerrada con un ayudante que espera al documento final, y comprobada contra un destino equivocado y contra una pestaña cerrada.
5. **Partida huérfana (del #8, sin cambio):** si otra pestaña reemplaza tu ranura, tu partida abierta no tiene dónde guardarse. No hay «guardar como» ni exportar en la interfaz, y no lo he añadido: es una decisión aparte.
6. **Herencias de 0 XP:** se ofrecen y se entregan una vez (también en las campañas 9303 y 9505). Es lo que pide el contrato («0 también se cierra una vez»).

## 2. Base, ascendencia y estado

- **Antes de editar:** árbol limpio; `feat/guardado-coordinado-20261008` = `origin` = `9e1ccde`; `origin/main` = `8c02138`.
- **Rama nueva:** desde `9e1ccde`, sin reset ni checkout destructivo.
- **Commits:** 10 hasta `1b620a0` (más este informe); 15 ficheros, +954 / −62.
  - `096abb8` estado coordinado v3 (almacén `operaciones`);
  - `6309fd2` contrato del token en `Ranuras`;
  - `ffe6f6d` resultado honesto en `SaveManager`;
  - `93d1b8d` entrega y app con `intentado`;
  - `351850d` doble de Web Locks en la fixture;
  - `df43568` auditorías nuevas;
  - `619e8c8` aviso de salida;
  - `4d70363` regresión;
  - `5192c5c` y `1b620a0` `sw.js`.

## 3. Token de guardado: contrato

**Un token nombra UNA operación inmutable:** esa ranura, ese run, esa operación (la `op` de una creación, o ninguna) y ESE contenido.
- **El recibo** vive en IndexedDB (`operaciones[token]`, global a todas las ranuras) y se escribe en la MISMA transacción que el dueño y los bytes de la ranura.

**Qué pasa al reintentar con un token:**

| Situación con el mismo token | Resultado | Qué cambia |
|---|---|---|
| Misma identidad, mismo contenido y su revisión sigue vigente | `exito`, `repetido: true`, con `texto`/`rev` **de la primera vez** | nada; el espejo recibe esos bytes, no los nuevos |
| Otro contenido (turno, XP, inventario, vida, combate, nota…) | `token-contenido` (conflicto) | nada |
| Otra ranura, otro run u otra operación | `token-contenido` | nada |
| Hubo otro guardado después (revisión superada) | `token-superado` | nada; no se reaplica ni se tapa lo posterior |
| La escritura se deshizo (no cupo el espejo) | mismo contenido: se rehace; otro: `token-contenido` | el recibo queda «deshecho» con su contenido canónico; el token no queda libre |
| La escritura no llegó a confirmarse | operación nueva | no deja recibo |

**«Mismo contenido»:**
- Es el guardado entero salvo `guardadoEn` y `firma`, que cambian en cada serialización, con las claves ordenadas.
- Se comparan **exactamente** esos bytes canónicos, no una huella.
- Cualquier campo de estado distinto es contenido distinto.
- Decisión: el reintento se compara contra la foto autoritativa congelada (la de la primera vez); un reintento con otra hora de escritura y el mismo estado es «repetido» y devuelve la hora original.

**El resultado de `SaveManager.guardar` es honesto:**
- `texto` y `rev` solo con éxito, y son los autoritativos.
- En un fallo: `intentado` (los bytes que se intentaron) y `escritura`, que vale `no-confirmada`, `deshecha` o `confirmada-sin-espejo`, para reintentar sabiendo si hubo confirmación.
- `save:done` y el aviso distinguen «Esa operación ya estaba guardada; no se ha guardado nada nuevo».
- **Sin token, cada llamada es una operación nueva** (ya no se inventa uno por guardado, que no protegía nada).
- **Recibos acotados:** se quedan los 200 más recientes. Un token tan antiguo que ya no tiene recibo cuenta como operación nueva, sujeta a dueño y revisión.

## 4. Fixture común: doble de Web Locks

- **`tools/dobles/candados.mjs`:**
  - exclusión por nombre, en orden de llegada;
  - `ifAvailable` llama con `null` sin esperar;
  - `signal` (con su tope) rechaza sin ejecutar y sin dejar nada tomado;
  - suelta en `finally`.
- **`motor-sin-ventana.mjs` lo instala UNA vez, al cargar,** por el gancho de pruebas que ya existía (`EntregaLegado.usarCandados`, que también fija los de `Ranuras`).
  - Siempre el doble, haya o no `navigator.locks` en ese Node: las auditorías no dependen de la versión.
  - `crearMotor` no lo reinyecta: una prueba que quita los candados para comprobar el error los conserva quitados hasta restaurarlos con `candadosDePrueba`.
- **El producto no cambia:** sin Web Locks sigue sin guardar en ranura, con su motivo. No se toca `navigator` en la web ni hay bypass.
- **`tools/dobles/sin-web-locks.mjs`:** imita un Node sin `navigator.locks`. Solo lo usa la auditoría del doble para probar la fixture; ningún comando oficial lo necesita.
- **Lo que no prueba:** el doble es de un proceso, así que no demuestra Web Locks reales. Eso lo prueba Chrome.

## 5. Chrome: contador de la salida y navegación

- **Contador:** antes de contar se provoca un guardado en cola (FIXTURE: candado retenido) y se vacía con la barrera real `drenar(15000)`, que lanza un error si no termina.
  - Se comprueba que sin barrera ese guardado habría contado.
  - Luego se cuenta POR OPERACIÓN (ranura y run).
  - El doble clic llega con la salida guardando (candado retenido): sale «Guardando antes de salir», Menú queda `aria-busy` y no hay otra operación.
  - Al soltar: 1 guardado (no repetido), 1 navegación (`Page.frameNavigated` del marco principal), y run, turno y vida iguales.
- **Navegación:** `navegarHasta()` espera a que la última navegación del marco principal vaya a un destino final, a que ese documento cargue y a que exista su contexto de ejecución. Solo entonces se evalúa.
  - Las redirecciones esperadas pasan por una lista.
  - Una navegación a otro sitio, o una pestaña que se cierra, es un error con diagnóstico, no un reintento.
  - Lo usan el puente clásico (`/clasico.html → /app/index.html`, el mismo origen y las mismas partidas vivas) y TODAS las recargas de la pestaña principal.
  - Contrapruebas en cada pasada, con una pestaña auxiliar: un destino equivocado da «navegación inesperada a …/ATTRIBUTION.md»; una pestaña cerrada da «se cerró durante la navegación».
- **Token en Chrome** (IndexedDB y Web Locks reales, dos pestañas del MISMO perfil):
  - el repro (+500 turnos) da conflicto con su aviso, y la autoridad y el espejo siguen en el turno original;
  - la misma partida cargada en las dos y el mismo token a la vez da 1 guardado + 1 «repetido» (una revisión);
  - contenidos distintos con el mismo token a la vez dan 1 guardado + 1 conflicto; espejo = autoridad.

## 6. Verificación

### Rojo en la base (`9e1ccde`), verde aquí

| Prueba | Base | HEAD `1b620a0` |
|---|---|---|
| `node tools/auditar-token-guardado.mjs` (A–G) | **8/42**, exit 1 (repro: espejo turno 500, IndexedDB 0) | **43/43** |
| Identidad, menús, viaje y muerte en un Node SIN `navigator.locks` (`--import tools/dobles/sin-web-locks.mjs`) | 48/49, 33/37, 19/20 y 30/34, exit 1 («no se escribe sin coordinar») | 50/50, 37/37, 21/21 y 34/34 |
| `node tools/auditar-doble-candados.mjs` (1–6) | — (no hay doble) | **17/17** |

- En la base, el caso D del token revienta por falta de API (`contenidoCanonico`): por eso 42 casos y no 43.

### Comandos oficiales, cada uno en su proceso limpio, sin shims ni preloads (HEAD `1b620a0`)

| Comando | Exit | Resultado | Duración |
|---|---|---|---|
| `node tools/auditar-legado.mjs` | 0 | 94/94 | 11 s |
| `node tools/auditar-cierre.mjs` | 0 | 39/39 | 17 s |
| `node tools/auditar-identidad.mjs` | 0 | 50/50 | 18 s |
| `node tools/auditar-combate-menus.mjs` | 0 | 37/37 | 15 s |
| `node tools/auditar-viaje.mjs` | 0 | 21/21 | 7 s |
| `node tools/auditar-muerte.mjs` | 0 | 34/34 | 24 s |
| `node tools/auditar-correcciones-diseno.mjs` | 0 | 113/113 | 74 s |
| `node tools/auditar-servidores.mjs` | 0 | 79/79 (enlace de fichero no creable aquí) | 8 s |
| `node tools/auditar-recuperacion.mjs` | 0 | 36/36 | 13 s |
| `node tools/auditar-ranuras.mjs` | 0 | 20/20 | 16 s |
| `node tools/auditar-guardado-coordinado.mjs` | 0 | 36/36 | 9 s |
| `node tools/auditar-muertes-coordinadas.mjs` | 0 | 23/23 | 7 s |
| **Suma de los doce** | | **582/582** (583 con servidores 80) | |
| `node tools/auditar-token-guardado.mjs` (nueva) | 0 | 43/43 | 7 s |
| `node tools/auditar-doble-candados.mjs` (nueva; lanza 8 procesos) | 0 | 17/17 | 135 s |
| `node tools/auditar-guardados.mjs` | 0 | 13/13 | 1 s |
| `node tools/auditar-bundle.mjs` | 0 | 8/8 | 4 s |
| `node tools/auditar-sw.mjs` | 0 | 12/12 | 0 s |
| `node tools/auditar-coherencia.mjs` | 0 | correcto | 0 s |
| `node tools/generar-sw.mjs --revisar` | 0 | `sw.js` al día | — |
| `node tools/auditar-todo.mjs` | 0 | 44/44 con código 0 | 517 s |

**Total:** 582 + 60 nuevas = **642**. Además, en esta máquina `navigator.locks` existe en Node (24.17); por eso el caso 5 del doble repite las cuatro auditorías también sin él.

### Chrome oficial (`tools/regresion-app.mjs`), HEAD `1b620a0`, sin runner aparte ni reintentos

Perfiles temporales ficticios; capturas en `dist/regresion-cap15/` (ignorado por git). Se registran TODAS las pasadas de esta tanda; no hubo reintentos.

| Modo | Semilla | Exit | Sistemas | Turnos | Excepciones | Fallos | Externos | Capturas | #8 | #9 | Salida | Puente | Viaje |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| móvil 390×844 | 20261008 | 0 | 32 | 20 | 0 | 0 | 0 | 43 | 4/4 | 2/2 | ✓ | ✓ | llegada |
| móvil | 505 | 0 | 32 | 20 | 0 | 0 | 0 | 43 | 4/4 | 2/2 | ✓ | ✓ | interrumpido por un encuentro |
| escritorio 1440×900 | 20261008 | 0 | 32 | 20 | 0 | 0 | 0 | 43 | 4/4 | 2/2 | ✓ | ✓ | llegada |
| escritorio | 505 | 0 | 32 | 20 | 0 | 0 | 0 | 43 | 4/4 | 2/2 | ✓ | ✓ | interrumpido por un encuentro |
| móvil `--sin-ia` | 20261008 | 0 | 32 | 20 | 0 | 0 | 0 | 40 | 4/4 | 2/2 | ✓ | ✓ | llegada |
| móvil `--sin-ia` | 505 | 0 | 32 | 20 | 0 | 0 | 0 | 40 | 4/4 | 2/2 | ✓ | ✓ | interrumpido por un encuentro |

- **Siguen todas las etapas del #5 al #8:**
  - legado de 350 a partir de 1000 XP, con recarga;
  - pestañas con el mismo y con distinto origen;
  - recuperación dañada; ranuras llenas, Escape y reemplazo;
  - muerte con y sin protección;
  - caché vieja, guardado pendiente, permiso caducado y dos muertes;
  - arma rota; galería y borrado; puente y sin red.
- **Las carreras de caché vieja siguen siendo FIXTURES;** el candado y la transacción son reales.
- **Capturas nuevas inspeccionadas:** `10a-salida-guardando` (modal legible), `17a-token-conflicto` (el aviso con el dato original), `17b-token-dos-pestanas-conflicto` y `14-clasica-puente` (destino final con «Continuar»).
- **Durante el desarrollo, antes de esta tanda,** dos pasadas mías fallaron por errores de la propia prueba, ya corregidos:
  - una `${…}` sin interpolar en el puente (la página respondía «Uncaught»);
  - el modo solo, al llamar a `drenar` en la base, que no lo tiene.

### Dos campañas nuevas (motor sin ventana; `campana8.mjs`, fuera del repo)

9303 (baluarte) y 9505 (glifista), cada una de principio a fin: identidad → viaje → combate por menús → desgaste y salida → muerte natural (0 XP) → herencia → sucesor de otra clase → guardar y cargar → FIXTURE de muerte con 1103 XP → tercera generación con 386 XP → guardar y cargar.

- **Comparadas con las del #8 línea a línea:** **0 líneas distintas**, quitando identificadores de run, transacción y momento. El motor narra y decide igual; el cambio no toca la partida.
- **Cada campaña:** muerte registrada; la ranura anterior no revive; un segundo sucesor se rechaza.
- **Sin probar por esto:** narrador real, móvil físico, jugador humano.

## 7. Compatibilidad

- **IndexedDB v3 solo AÑADE el almacén `operaciones`:** se conservan las ranuras, partidas, muertes y herencias del #7 y del #8. No cambia el formato de partida ni sus migraciones.
- **Guardados del #8 sin recibo de token:** siguen igual (sin token = operación nueva).
- **Sin cambios:** plantel, galería, bundle (8/8), SW (12/12) y sin red.
- **Límites locales:** coherencia local, no antifraude; sin servidor.

## 8. Git

- **Push** normal SOLO de `feat/retry-harness-20261008` a `origin`. El SHA y la URL comprobados van en el mensaje de entrega.
- **Sin tocar:** `main` (`8c02138`), PR, merge y publicación.
- **Coste:** 0 €. Sin proveedores reales ni datos del jugador: todo con personajes, perfiles y carpetas ficticias.
