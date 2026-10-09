# Informe del encargo #11: borrado durable

9 de octubre de 2026. Rama `feat/borrado-durable-20261009`, que sale de `feat/tokens-durables-20261009` = `388402c` (árbol limpio al empezar). `main` no se ha tocado. No es «listo para lanzar»: siguen sin probar el narrador real, un móvil físico y un jugador humano. La fusión a `main` depende de la revisión externa.

---

## 1. Lo que sigue abierto o hay que saber primero

1. **El fallo intermitente de arranque del #10 NO está resuelto.** No ha vuelto a salir: 6/6 pasadas oficiales en verde y varias `--solo-pestanas`. Pero no tengo su causa, así que no lo doy por cerrado. El diagnóstico ampliado del #10 sigue en su sitio.
2. **Tras un borrado a medias, las OTRAS pestañas pueden listar la copia local que queda.**
   - Ocurre hasta que una de ellas arranca y la quita, o hasta que alguien vuelve a pulsar «Borrar».
   - Abrirla no la revive: manda la autoridad y sale «No hay partida en esa ranura».
   - En la pestaña que borró, la copia ya no se ofrece (`listar` la oculta).
   - El listado lee el espejo local sin esperar; es la misma decisión del #8.
3. **Hay dos caminos por los que una campaña vuelve a guardarse, y los dos son deliberados:**
   - **Una partida que nunca se guardó ni se cargó en esa pestaña** antes de «Borrar todo»: su run no tiene época, y no hay nada borrado que revivir.
   - **Importar el archivo exportado de una campaña borrada:** se abre y puede guardarse en una ranura donde ese run nunca se borró, igual que «guardar como». En su propia ranura no puede.
   - Si se quiere cerrar también, el cambio es pequeño: invalidar el run en todas las ranuras.
4. **Las muertes no se vacían con «Borrar todo».** De cada muerto queda solo `{muerto, retirado}`, sin nombre ni causa. Sin eso, un muerto exportado volvía a la vida al importarlo.
5. **El diálogo de confirmación es el nativo del navegador** (`confirm`). En Chrome sin ventana no se puede fotografiar. Se prueba de verdad por CDP (Cancelar y Aceptar, con su texto); la captura 19a enseña Ajustes con el botón.
6. **Maná / Ánima:** sigue igual que en el #10, pendiente de decidir. No he retirado ni renombrado nada.
7. **Servidores 79/79, no 80:** este Windows no deja crear el enlace simbólico de fichero (igual que en #9 y #10).
8. **Push:** cubierto por la autorización permanente del propietario (push de la rama al terminar; nunca `main`, PR, merge ni force-push). La comprobación de la URL va al final.

## 2. Base, HEAD y diff

- **Base:** `388402c` (= `origin/feat/tokens-durables-20261009`).
- **HEAD de código:** `a102f45`. El informe va en un commit aparte encima.
- **Commits:**
  - `5c2b9a7` base coordinada v4: almacenes `invalidados` y `meta`, más `transaccionCompleta` (`Coordinacion.js`);
  - `93e68b9` protocolo (`Ranuras.js`, `SaveManager.js`), con la adaptación del caso 17 de `auditar-guardado-coordinado`: el resultado ya no es `{borradas}` y ahora se exige `ok` y `completo`, que es más estricto;
  - `903414d` la app dice lo que pasó (`app/app.js`);
  - `0b307ed` auditoría nueva (`tools/auditar-borrado-durable.mjs`);
  - `0397ec0` etapa #11 de Chrome (`tools/regresion-app.mjs`) y `sw.js`;
  - `a102f45` tamaño medido en la cabecera y `sw.js`.
- **Diff `388402c..a102f45`:** 8 ficheros, +1157 / −96.

## 3. Repro: rojo en la base, verde en HEAD

**Node** (`node tools/auditar-borrado-durable.mjs`; dos gestores en un proceso, que NO son dos pestañas reales):

| | Base `388402c` | HEAD `a102f45` |
|---|---|---|
| Total | **13/34**, exit 1 | **43/43**, exit 0 |

Fallos en la base, por caso:
- **A** (§1): 3 fallos. El guardado tardío de A da éxito y deja la ranura `ocupada` por A, con copia y espejo.
- **B:** 1 fallo.
- **C** (§2): 1 fallo. La automática vieja se recrea con y sin token.
- **E:** 2 fallos.
- **F:** 2 fallos. Un `op` inventado pasa la lápida.
- **H** (§3): 3 fallos. Sale «Se ha borrado todo: 1 entradas.», con el espejo vacío y la autoridad todavía con la partida.
- **I:** 1 fallo.
- **J:** 4 fallos.
- **K:** 2 fallos.
- **M:** 1 fallo.
- **N:** 1 fallo.
- **D, G y L:** verdes.

Ojo con **I** y **J** en la base: revientan en parte porque la prueba lee almacenes que la base no tiene. Ese rojo no es solo el defecto. Los rojos limpios son **A, C y H**.

**Chrome, dos pestañas reales**, misma etapa copiada sobre la base (`--solo-pestanas`, exit 1):
- **§1:** P guarda A y sale «Partida guardada». La ranura queda `ocupada` por A, rev 8, con copia y espejo de A. No hay invalidado.
- **§2:** la automática de C se guarda con token (`exito: true`) y sin token (`exito: true`). Queda `ocupada`, con copia y espejo.

En HEAD los dos pasan.

## 4. Protocolo

Durable y comprobado en la MISMA transacción que escribe, antes que nada (también en la automática, con token y con operación):

1. **`invalidados[<ranura>|<run>]`:**
   - si existe, ese run ya no se escribe en esa ranura (`codigo: 'invalidada'`);
   - se apunta al borrar la ranura («borrada»);
   - se apunta al reemplazar: una creación escribe sobre una reserva cuyo `previo` era de otro run («reemplazada»); si esa creación se deshace, la marca se quita con ella;
   - se apunta a cada run visto en «Borrar todo» («borrado-todo»).
2. **Época** (`meta.epoca`):
   - «Borrar todo» la sube;
   - cada pestaña recuerda en qué época conoció cada run: al cargarlo (leída ANTES de la ranura), al importarlo o en su primer guardado con éxito;
   - un run de una época anterior no se escribe en ninguna ranura;
   - una creación nueva (run sin época) sí puede usar una ranura liberada. Lo invalidado es el run, no la ranura.
3. **`op` ya no es un pase:**
   - solo vale para la reserva que hizo esa operación, o para la ranura que esa misma creación ya ocupó (`creadaPor`);
   - si no, `sin-reserva`;
   - se mantiene la regla de lápida del mismo run, ahora sin la excepción de `op`.
4. **Borrar una ranura**, en UNA transacción:
   - pone la lápida, quita la copia y apunta el invalidado;
   - quita el contenido de partida de los recibos de esa ranura (no se guarda texto «por seguridad»);
   - después quita el espejo y lo relee. Si no se puede, lo dice: «…su copia en este navegador no se ha podido quitar. Vuelve a pulsar «Borrar».».

## 5. Fronteras transaccionales y recuperación

**«Borrar partidas y personajes»**, bajo el candado global (sin Web Locks se hace igual, porque la transacción es de todo o nada, y se dice):

1. **Lista** las claves `arcanveil:` del espejo con su huella. Es solo metadato.
2. **Una transacción** sobre todos los almacenes:
   - lápida en cada ranura;
   - invalidado para cada run de registros, copias, recibos y espejo;
   - fuera copias, recibos y herencias;
   - muertes reducidas a `{muerto, retirado}`;
   - `epoca+1` y `borradoPendiente = {epoca, claves, momento}`.
   - **Si falla, no se toca nada**, tampoco el espejo.
3. **Quita del espejo** solo las claves apuntadas que conservan la huella. Lo escrito después es de otro y no se toca.
4. **Cierra la intención** si no quedan restos y relee la autoridad.
5. **Resultado:** `{ok, completo, autoridad, partidas, claves, restos, epoca, motivo}`. `partidas` cuenta ranuras con partida, no claves.
6. **Al arrancar,** `recuperarBorradoPendiente()` va en la cola del gestor. Es idempotente y, si no hay nada pendiente, no pide el candado.

**Cortes deterministas** (caso I), cada uno «reiniciado» con un motor nuevo:

| Corte | Resultado |
|---|---|
| Antes de la transacción | Nada cambia; A sigue entera y guardando; sin falsa ausencia |
| Dentro (decidida, sin aplicar) | Igual: nada cambia |
| Tras la transacción, antes del espejo | No dice «completo»; el arranque termina; la campaña nueva conserva lo suyo; A no revive |
| A mitad del espejo | Igual |
| Al cerrar la intención | Igual; la intención la cierra el arranque |
| Antes de la relectura | Igual; motivo: «…no se ha podido comprobar el resultado…» |

- **Sin IndexedDB:** se borra lo local y se avisa de que no hay coordinación entre pestañas («…ciérrala sin guardar.»). Guardar sigue negándose.
- **Sin Web Locks:** se borra en una transacción, con el aviso de que no hay candado. Guardar sigue negándose.

## 6. Metadatos y crecimiento

- **Invalidado:** unos 113 B por cada run y ranura borrados o reemplazados (medido). No se podan: podar uno devolvería a ese run la capacidad de revivir.
- **Época:** un número.
- **`borradoPendiente`:** claves y huellas, y solo mientras dura.
- **Muerte retirada:** unos 50 B por muerto, sin nombre.
- **Tokens:** los recibos del #10 se vacían con «Borrar todo». No pueden revivir nada: los runs quedan invalidados y su época es vieja. Los 225 guardados del #10 siguen en verde.

## 7. Chrome

**Etapa #11** en un **contexto de navegador aislado** (`Target.createBrowserContext`):
- dos pestañas reales, P y Q, que comparten IndexedDB, localStorage y Web Locks entre sí y nada con la pestaña principal, así que la regresión sigue jugando su campaña;
- el diálogo `confirm` nativo se responde por CDP;
- corre en la regresión completa y en `--solo-pestanas`.

**§1:**
1. A en P.
2. Q pulsa «Borrar» y luego **Cancelar**: sin época ni intención, y A intacta.
3. Q pulsa «Borrar» y luego **Aceptar**.
4. Q crea B en la misma ranura y la borra desde «Cargar».
5. P guarda A con el botón: se rechaza.
6. P juega 3 turnos: 1 aviso, no 3.
7. La ranura sigue `borrada` con la revisión de B, sin copia ni espejo.

**§2:**
1. P recarga, crea C y la guarda en la automática.
2. Q borra todo.
3. La automática de P se rechaza con token y sin token (`invalidada`), sin copia ni espejo.
4. 1 aviso en 3 turnos.

**Fallo, a medias y reintento** (los fallos son FIXTURE):
- **Falla:** IndexedDB rechaza la transacción. No se toca nada.
- **A medias:** el navegador no deja quitar la copia local. La autoridad queda borrada, la intención sigue y la copia no se ofrece en esa pestaña.
- **Reintento con el botón:** completo.
- **A medias y luego recarga:** el arranque quita la copia y cierra la intención.

**Pasadas oficiales sobre `a102f45`** (guion `chrome-final11`, una tras otra, sin nada más corriendo):

| Modo | 20261008 | 505 |
|---|---|---|
| `--capturas` (390×844) | exit 0, 141 s, 51 capturas | exit 0, 138 s, 51 |
| `--desktop --capturas` | exit 0, 153 s, 52 | exit 0, 142 s, 51 |
| `--sin-ia --capturas` | exit 0, 137 s, 48 | exit 0, 134 s, 48 |

En las seis: 32 sistemas, 20 turnos, 0 excepciones, 0 fallos y 0 peticiones fuera del equipo. Salidas en `dist/regresion-borrado-durable/`.

## 8. Comandos completos, incluidos los fallos

**Node final** (`node-final11`, cada uno en su proceso, sobre `a102f45`), todos exit 0:

| Auditoría | Resultado | Tiempo |
|---|---|---|
| borrado-durable | 43/43 | 10 s |
| token-guardado | 43/43 | 7 s |
| tokens-durables | 28/28 | 16 s |
| guardado-coordinado | 36/36 | 9 s |
| muertes-coordinadas | 23/23 | 6 s |
| doble-candados | 17/17 | 135 s |
| legado | 94/94 | 11 s |
| identidad | 50/50 | 17 s |
| combate-menus | 37/37 | 15 s |
| viaje | 21/21 | 7 s |
| muerte | 34/34 | 24 s |
| cierre | 39/39 | 18 s |
| recuperacion | 36/36 | 13 s |
| ranuras | 20/20 | 15 s |
| correcciones-diseno | 113/113 | 73 s |
| servidores | 79/79 | 8 s |
| `auditar-playtest.mjs --salida dist/playtest-borrado-durable` | 25/25 | 29 s |
| bundle | 8/8 | 3 s |
| sw | 12/12 | 1 s |
| coherencia | correcto | 0 s |
| `auditar-guardados.mjs` | 13/13 | 1 s |
| `generar-sw.mjs --revisar` | al día | 0 s |
| **auditar-todo** | **46/46** | 545 s |

**Fallos por el camino** (todos de desarrollo; ninguno queda):
- La primera batería de Node la **paré yo** a mitad para corregir el tamaño de la cabecera (`~90 B` → `~110 B`) y la relancé entera sobre `a102f45`. Quedó un proceso huérfano (`auditar-guardado-coordinado`) y lo cerré.
- Auditoría nueva, antes de terminarla:
  - **25/27:** el caso I usaba el run equivocado, porque el motor de Node comparte el estado entre motores. Fallo de la prueba.
  - **42/43:** el ayudante de creación escribía en la ranura `null`. Fallo de la prueba.
- `auditar-guardado-coordinado` dio **35/36** por el contrato viejo de `{borradas}`. Adaptado, más estricto.
- `--solo-pestanas`, en tres pasadas:
  1. La etapa #8 no encontraba «otra campaña» en el texto nuevo, que empezaba con mayúscula.
  2. La salida de la #8 no encontraba «otra partida».
  3. Se reescribió el texto del producto (no la prueba): «Esta partida fue reemplazada en la ranura N por otra partida…».
- Mi propia etapa:
  - esperaba sobre una promesa, que siempre es «verdadera»;
  - recargaba antes del reintento, lo que adelantaba la recuperación;
  - corregidas las dos antes de las pasadas oficiales.

## 9. Capturas y textos exactos

Están en `dist/regresion-borrado-durable/<modo>-<semilla>/`, en 390×844 y 1440×900:

- **19a** — Ajustes con «Borrar partidas y personajes». El diálogo nativo dice: «¿Borrar todas las partidas, personajes y retratos elegidos guardados en este navegador?»
- **19b** — borrado completo: «Borrados partidas (1), personajes, retratos elegidos y las candidatas del generador.» Con `--sin-ia`, la variante sin puente.
- **19c** — pestaña vieja (§1). El botón dice: «Esta partida se borró (desde otra pestaña o en Ajustes): ya no se puede guardar aquí. Puedes seguir jugando en esta pestaña, pero no se guardará.» Los turnos, una vez: «No se ha guardado: Esta partida se borró (desde otra pestaña o en Ajustes): ya no se puede guardar aquí. Puedes seguir jugando en esta pestaña, pero no se guardará.»
- **19d** — automática vieja (§2): el mismo aviso, una vez.
- **19e** — borrado que falla: «No se ha borrado todo: no se ha podido borrar el estado guardado del juego (FIXTURE: IndexedDB rechaza la transacción). No se ha borrado nada; puedes volver a intentarlo.»
- **19f** — a medias: «Borrado a medias: las partidas ya no se pueden abrir ni guardar, pero queda 1 dato de este navegador por quitar; se terminará al volver a abrir el juego (o vuelve a pulsar «Borrar»). Los retratos elegidos sí se han borrado.»
- **19g** — reintento: «Borrados partidas (1), personajes, retratos elegidos…»
- **Reemplazo** (sale en la #8): «Esta partida fue reemplazada en la ranura N por otra partida (desde otra pestaña o al crear una nueva): ya no se puede guardar ahí. Puedes seguir jugando en esta pestaña, pero no se guardará en esa ranura.»

**Transcripciones leídas:** `dist/playtest-borrado-durable/playtest-5.md` y `playtest-24.md`.
- Las dos son coherentes de principio a fin y no hay nada del guardado.
- Detalle menor, de antes y fuera del alcance: «Hablar con X» se sugiere dos veces seguidas.

## 10. Coste

0 €. Todo es local:
- perfiles temporales de Chrome y contextos aislados;
- dobles de Web Locks e IndexedDB en Node;
- proveedor de imágenes falso, o sin generador.

Sin cuentas, tarjetas, proveedores reales, secretos, cookies ni partidas o datos del usuario.

## 11. Pendiente

- Causa del arranque intermitente del #10 (punto 1.1).
- Si se quiere, invalidar el run en todas las ranuras al borrarlo, para cerrar el caso de importar o «guardar como» (punto 1.3).
- Que el listado de otras pestañas descarte la copia local de una intención pendiente sin esperar al arranque (punto 1.2).
- Decisión maná / Ánima.
- Revisión externa y OK para `main`.
