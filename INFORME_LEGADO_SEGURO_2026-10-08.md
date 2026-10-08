# Informe del encargo #7: recuperación verificable, ranuras sin pérdidas y prueba móvil estable

8 de octubre de 2026. Rama `feat/legado-seguro-20261008`, que sale del HEAD revisado del #6 (`f81efd9`), con toda su ascendencia (cierre-seguro `3cc8421` y menus-identidad-muerte `2fc676b`). `main` sigue en `8c02138`, sin tocar. No es «listo para lanzar»: siguen sin probar el narrador real, un móvil físico y un jugador humano. La fusión a `main` depende de la revisión externa.

---

## 1. Lo que sigue abierto o hay que saber primero

1. **`localStorage` no es coherente entre pestañas al instante. Lo descubrí durante el encargo y cambia el diseño.**
   - **Qué pasaba:** en Chrome, cada pestaña lee `localStorage` de su propia caché.
   - **Medido:** dos pestañas incrementan un contador, cada incremento DENTRO de un Web Lock. Resultado: **118 de 120**, porque hubo dos lecturas viejas pese al candado.
   - **Consecuencia:** «reservar si está pendiente» y «la ranura está libre», leídos de `localStorage`, podían equivocarse con dos pestañas a la vez.
   - **Lo que lo destapó en Chrome:** dos herencias distintas a la vez dejaron una de ellas en `reservado` con su sucesor ya guardado.
   - **El #6 también estaba expuesto:** en «la misma herencia en dos pestañas» salió bien, pero no estaba garantizado.
   - **Arreglo:** las decisiones que tienen que ser exactas (en qué estado está cada herencia y qué ranura está reclamada) se toman con una operación de comparar y cambiar dentro de una transacción de **IndexedDB** (`src/persistence/Coordinacion.js`), que sí es coherente entre pestañas. Las partidas siguen en `localStorage`.
   - Sin IndexedDB o sin Web Locks, la creación de partidas nuevas se bloquea con aviso.
2. **Ventanas residuales, documentadas.**
   - **Guardado normal desde una pestaña vieja:** `SaveManager.guardar` es síncrono y comprueba el dueño de la ranura con lo que ve en `localStorage`. Si otra pestaña acaba de reemplazar esa ranura hace **milisegundos**, aún puede no verse. Con una pestaña vieja de verdad (segundos o más) la caché ya está al día y la comprobación funciona (probado en Node).
   - **Reemplazar una campaña que otra pestaña está guardando en ese mismo milisegundo:** se pierde ese último guardado de una campaña que el jugador ha elegido borrar.
   - **Dos muertes en dos pestañas en el mismo milisegundo:** la foto de la herencia se escribe en un mapa compartido de `localStorage`, que no he migrado. Se podría perder una de las dos fotos.
3. **«Llegada» en Chrome móvil: preexistente, ya aclarado.**
   - **Qué fallaba:** con la semilla 505, la base (`f81efd9`, con la misma siembra) y el HEAD fallaban **igual**. El viaje forzado Vado del Yunque → Camino del Norte lo corta un encuentro legítimo, porque el camino tiene peligro.
   - **Cambio:** la prueba exige ahora que el estado cuadre con el desenlace: llegada con su escena, o un encuentro que explique por qué no llegó. No oculta el encuentro.
   - **Resultado:** de las 6 pasadas finales, 3 llegan y 3 son interrumpidas, todas en verde.
4. **Contrato cambiado en tres comprobaciones originales de `auditar-legado`**, porque el encargo pide lo contrario que el #6. No se ha quitado ninguna.
   - Reintentar con el mismo token y **otro** destino se rechaza. Antes devolvía «hecho»; ahora el reintento lleva el mismo destino.
   - Si la relectura no coincide con lo escrito, **no se borra la ranura ni se libera la herencia**: queda bloqueada. Se añade una comprobación: con lecturas sanas, la recuperación la da por aplicada.
   - La reserva de prueba de «pestaña muerta» no llevaba cantidad; una reserva real siempre la lleva.
5. **Arnés del motor sin ventana.** Guardaba todas las campañas de un proceso en la misma ranura «9». El guardado nuevo (correctamente) se niega a pisar otra campaña, así que cada campaña usa ya su propia ranura de prueba.
6. **Preexistentes, sin tocar:**
   - el nivel 1 muere en 2–14 turnos contra lobos o contra Berlo;
   - la durabilidad se guarda con ruido de coma flotante (`98.80000000000001`);
   - `nivelesGanados` cuenta eventos, no niveles;
   - la hazaña «Cinco niveles y las manos limpias» se cumpliría con una herencia grande.

## 2. Base, ascendencia y estado

- **Antes de editar:** árbol limpio en `feat/legado-xp-20261007` = `f81efd9` = `origin`; `main` = `8c02138`.
- **Rama nueva:** `feat/legado-seguro-20261008` desde `f81efd9`. No hay reset ni checkout destructivo.
- **Commits:** 13 de código y pruebas más el de este informe; 13 ficheros, +2053 / −290.
  - `8a891bb` estado coordinado en IndexedDB;
  - `25f5423` motor sin ventana;
  - `3167368` ranuras y guardado sin pisar;
  - `724dbfc` protocolo de entrega;
  - `086dcae` app;
  - `232b194` auditorías nuevas;
  - `2bc55e6` `auditar-legado` migrada;
  - `e4d700c`, `a66f916` y `f903fdf` regresión;
  - `7b95ea8` `sw.js`.

## 3. Recuperación: «no puedo leer» no es «no está»

**Lecturas discriminadas** (`Ranuras.leerRanura`): `ausente` · `inaccesible` · `ilegible` (no es JSON) · `invalida` (JSON que no es una partida que el juego pueda abrir) · `valida`.
- La validez se comprueba con la **migración y la deserialización reales**, y además se exigen versión, run y personaje.
- `enumerarPartidas` dice también cuándo NO ha podido enumerar (falla `length` o `key`, o el almacenamiento cambia mientras se lee).

**Verificación de una reserva huérfana** (`verificarReserva`):
- **Lo que se coteja:** TODO lo que ata la operación.
  - token, origen, destino exacto y ranura reservada;
  - cantidad: `legadoRecibido.xp` y `xpHeredada` iguales a la cantidad reservada;
  - que el destino no sea el origen;
  - el XP total puede ser mayor: 350 heredados + 20 ganados = 370 se reconoce, sin volver a dar nada.
- **Alcance:** decide la ranura **reservada**, porque el protocolo solo escribe el sucesor ahí.
  - Las demás ranuras se recorren para encontrar **copias** con la misma transacción (importadas o editadas). Dos sucesores → conflicto: se conservan ambos.
  - Una ranura ajena ilegible **no bloquea**: no puede ser el sucesor de esta entrega, y bloquearla dejaría sin juego las demás campañas. Probado: la ranura 7 rota y la reservada vacía → pendiente, sin tocar la 7.
  - Si no se puede **enumerar**, no hay ausencia comprobada → bloqueo.
- **Decisión:**
  - **ausencia comprobada** → pendiente;
  - **compromiso coherente** → aplicado, una vez;
  - **cualquier otra cosa** → **bloqueo con motivo**. Se conservan la reserva (token, destino, ranura, cantidad) y los bytes; no se inventa destinatario; se puede **volver a comprobar**.
- **Lo aplicado se queda aplicado** aunque luego se borre al sucesor.

**Deshacer seguro:** solo se retira lo que, **byte a byte**, escribió este intento en su ranura. `SaveManager.guardar` devuelve los bytes escritos.
- Si se reemplazaba otra campaña, se restauran sus bytes anteriores.
- Si la ranura cambió desde la escritura, o no se puede leer, no se toca y queda bloqueada.
- Una copia ajena con el mismo token no se borra.

**Interfaz:** el texto sale del estado verificado.
- Si la herencia volvió a pendiente: «La herencia sigue pendiente y no se ha guardado ningún personaje nuevo».
- Si no se sabe: «No puedo comprobar la entrega… No he vuelto a entregar la herencia ni he borrado ninguna partida», con «Volver a comprobar».
- Al abrir el juego se avisa de las herencias bloqueadas. «Nueva partida» las enseña con su motivo, deshabilitadas, sin bloquear las demás.

## 4. Ranuras: exclusión global y nada se pisa

- **Orden fijo de candados:** primero el de la herencia (Web Locks, sin esperar; si está ocupado, «Otra pestaña…»), después el **global de ranuras**, que espera con tope de 15 s. No hay interbloqueo: probado con dos orígenes a la vez.
- **Bajo el candado global:**
  1. se lee la ocupación mezclando `localStorage` con el registro coordinado (una ranura recién ocupada por otra pestaña no sale libre);
  2. se **reclama** la ranura con comparar y cambiar en IndexedDB (si el registro cambió desde que se miró, otra pestaña se adelantó y no se escribe);
  3. después se reserva la herencia, se crea, se guarda, se verifica y se confirma.
- **Con y sin herencia, por el mismo camino** (`entregarLegado` / `crearPartidaNueva`): ninguna pisa a la otra.
- **Pestaña vieja:** `SaveManager.guardar` no escribe encima de otra campaña. Actualizar la **misma** campaña sigue funcionando.
- **Ranuras llenas:** nunca se elige la más antigua.
  - **El selector:** lista las ocho ranuras con nombre, run, fecha, vivo o muerto y vínculo de herencia. Ofrece **Descargar copia** (local), **Reemplazar…** (la confirmación nombra la campaña y la pérdida, y el foco va a «Volver») y **Cancelar**.
  - **Cancelar o Escape:** no tocan bytes, herencia ni borrador.
  - **El permiso de reemplazo** se ata a ranura, run, fecha y huella de los bytes leídos. Si otra pestaña cambia esa campaña antes de confirmar, **caduca** y hay que volver a elegir.
  - **Cuota llena al reemplazar:** la campaña vieja sigue intacta.
  - **Guardar sin ranura asignada** solo toma una libre, nunca la más antigua.
- **Borrar una partida** libera también su registro coordinado. «Borrar partidas y personajes» vacía el estado coordinado.

## 5. Móvil: el fixture garantiza la muerte, sin datos falsos

**Causa:** el paso «muerte entre el clic y la frontera» mataba con **un** golpe de 999. Con el trasfondo superviviente («Instinto de conservación», `evitarMuerte`) ese golpe deja 1 de vida y la salida pendiente se completa.
- **Demostrado con la misma semilla (101):** en la base falla por tiempo agotado; en el HEAD pasa.

**Ahora** (`muerteConSalidaPendiente`):
- La protección se **fija** como dato de ficha (FIXTURE: `player._rasgoTrasfondo`). No se neutraliza en el juego.
- El daño llega por el canal real, en golpes acotados: protección (1) + golpe letal (1) + uno de margen que no debe hacer falta.
- Tras **cada** golpe se comprueban vida, fase y eventos, que la salida sigue «Esperando para salir» y que no se ha navegado.
- La muerte, la marca y la herencia persistidas se confirman **antes** de soltar la frontera.
- La pausa se restaura en `finally`.
- Los eventos de caída repetidos no crean otra muerte ni otra herencia, y el final queda guardado.

**Casos:**
- **B, con protección:** el primer golpe lo para la protección (vida 1); el segundo mata.
- **A, sin protección:** un golpe y muerte.
- Los dos casos se cumplen en las 6 pasadas.
- La supervivencia legítima («salir en la frontera») sigue probada aparte.

**Semilla (FIXTURE):** `--semilla N` siembra `Math.random` y `crypto.getRandomValues` antes de cargar la página. Valor por defecto: 20261008. Misma semilla, misma partida, en la base y en el HEAD.

## 6. Verificación

### Rojo en la base (`f81efd9`), verde aquí

| Prueba | Base | HEAD |
|---|---|---|
| `auditar-recuperacion` (nueva; en la base, con los accesos de su API) | **13/36** (caso A → pendiente; caso B → aplicado a wrong-run con 999; getItem/key/length → pendiente; dos sucesores → el primero…) | **36/36** |
| `auditar-ranuras` (nueva; en la base varias comprobaciones ni se alcanzan) | **3/14** (dos herencias aplicadas y un solo sucesor; pestaña vieja pisa; sin selector) | **20/20** |
| Chrome móvil, semilla 101 | exit 1 (muerte entre el clic y la frontera) | exit 0 |
| Chrome móvil, semilla 505 | exit 1 (llegada) | exit 1 → exit 0 tras aclarar el desenlace |

### Las 463 originales, conservadas

| Auditoría | Base revisada | HEAD | Diferencia |
|---|---|---|---|
| `auditar-legado` | 89 | **102/102** | +12 de cortes y cuotas sobre las 3 escrituras coordinadas nuevas (8 por entrega, antes 5) + 1 de recuperación; 3 con contrato #7 (§1.4) |
| `auditar-cierre` | 39 | **39/39** | — |
| `auditar-identidad` | 50 | **50/50** | — |
| `auditar-combate-menus` | 37 | **37/37** | — |
| `auditar-viaje` | 21 | **21/21** | — |
| `auditar-muerte` | 34 | **34/34** | — |
| `auditar-correcciones-diseno` | 113 | **113/113** | — |
| `auditar-servidores` | 80 | **79/79** ×3 (exit 0) | En este Windows no se puede crear el enlace simbólico de esa comprobación; queda cubierto por la ruta canónica, igual que en el #6 |
| **Nuevas** | — | recuperación **36**, ranuras **20** | |

**Además:**
- `auditar-todo` **40/40** con código 0;
- `auditar-bundle` **8/8** (Web Locks e IndexedDB también desde `file://`);
- `auditar-sw` **12/12**;
- `auditar-coherencia`: todo correcto;
- `generar-sw --revisar`: al día;
- `buscar-secretos`: ninguna clave;
- `medir-costes-campana --autoprueba`: 0 peticiones fuera del equipo;
- `--turnos 100`: 200/200 turnos, 214 peticiones simuladas, 0 intentos de red, estimación $1,24–$1,94 (no es una factura);
- `medir-narrador`: 132 turnos, 5,6 % de frases repetidas, 25/25 preguntas atendidas.

### Chrome (`tools/regresion-app.mjs`, perfiles temporales, HEAD `f903fdf`; capturas en `dist/regresion-cap11/`, ignorado)

| Modo | Semilla | Salida | Sistemas | Turnos | Excepciones | Fallos | Externas | Capturas |
|---|---|---|---|---|---|---|---|---|
| móvil 390×844 | 20261008 | 0 | 32 | 20 | 0 | 0 | 0 | 32 |
| móvil 390×844 | 505 | 0 | 32 | 20 | 0 | 0 | 0 | 32 |
| escritorio 1440×900 | 20261008 | 0 | 32 | 20 | 0 | 0 | 0 | 32 |
| escritorio 1440×900 | 505 | 0 | 32 | 20 | 0 | 0 | 0 | 32 |
| móvil sin generador | 20261008 | 0 | 32 | 20 | 0 | 0 | 0 | 29 |
| móvil sin generador | 505 | 0 | 32 | 20 | 0 | 0 | 0 | 29 |

**Todas las ejecuciones, también las fallidas (sin reintentos ocultos):**
- **Primera pasada final sobre `a66f916`:** 5 de 6 en verde.
  - Móvil con la semilla 20261008 falló en «sin red».
  - La causa es mía: «Nueva partida» ahora es asíncrona y el arnés miraba la pantalla en el mismo instante del clic.
  - Se arregló esperando a que cambie la pantalla (`f903fdf`), y se repitieron las **seis**.
- **Antes, durante el desarrollo**, dos fallos ya corregidos:
  - el foco del selector;
  - el estado de la herencia leído aún de `localStorage`.
- **Muestreo de semillas (HEAD / base):**

  | Semilla | HEAD | Base |
  |---|---|---|
  | 20261008 | 0 | 0 |
  | 101 | 0 | 1 (protección) |
  | 202 | 0 | 0 |
  | 303 | 0 | 0 |
  | 404 | 0 | 0 |
  | 505 | 1 | 1 (llegada, idéntico) |

**En cada pasada completa se cumple:**
- **Muerte con salida pendiente:** el caso B (2 golpes) y el caso A (1 golpe) se cumplen.
- **Herencia elegida por el jugador:** 1000 → 350, nivel 3, la ranura releída coincide, recargar y seguir jugando.
- **Cuota llena al crear:** el aviso dice «No queda espacio» y «sigue pendiente»; Reintentar hace una sola entrega.
- **La misma herencia en dos pestañas:** un sucesor, y la otra pestaña avisa.
- **Dos herencias distintas en dos pestañas a la vez:** Uxo en la ranura 5 (140 XP) y Vela en la 6 (210 XP). Tras recargar, las dos se ven en «Cargar» y se abren con su XP y su token.
- **Recuperación bloqueada:** la ranura reservada tiene JSON roto. Hay aviso al abrir, la tarjeta sale con su motivo y «Volver a comprobar» no libera nada (bytes intactos).
- **Ranuras llenas:**
  - selector con 8 filas, la reservada deshabilitada, foco en Cancelar;
  - Escape no toca nada;
  - la confirmación nombra la campaña;
  - el permiso caduca si la campaña cambia;
  - el reemplazo toca **solo** esa ranura.
- **La clásica:** su dirección lleva a `app/`.
- **Sin red:** el retrato elegido sigue visible.
- **«Borrar partidas»:** no toca lo ajeno.

**Capturas miradas:**
- `08` y `08b` (muertes);
- `09` y `09b` a `09k`: herencia, confirmar, sucesor, error de cuota, la otra pestaña, dos herencias en «Cargar», recuperación bloqueada, ranuras llenas, confirmar reemplazo y reemplazo;
- `14` (puente).

Corregido tras mirarlas: un motivo redundante («dañada (… dañado …)») y el foco del selector.

### Dos campañas nuevas leídas (motor sin ventana; `campana7.mjs`, fuera del repo)

**9303 · rastreadora Sive:**
- «toda mi katana» y sus variantes aclaran sin gastar turno; «Zorvak mientras Korsa mira» también.
- Hay espera, guardar y cargar, y viaje Vado → Saucedo → Linde (con tramos peligrosos).
- Acampa, y tres lobos la matan en dos turnos de menú. El cuchillo falla y sigue en 100.
- La ranura anterior no carga.
- Herencia de 0 entregada una vez a una baluarte; un segundo sucesor se rechaza.
- **FIXTURE:** Ena gana 1103 (nivel 5) y muere → 386 XP.
- Brun, rastreador, recibe 386: nivel 3, vida 50, puntos 4/2/0. Guarda y carga dos veces sin cambios.

**9505 · baluarte Sive:**
- «todas mis katanas» y «el cuchillo y el hacha» aclaran. Entra y sale de la posada, guarda y carga.
- Ataca a Dalwen y Berlo se mete. La espada baja 0,6 por cada golpe con daño y la orden repetida se rechaza siempre.
- Muere, y la ranura anterior no carga.
- Herencia de 0 a una glifista.
- **FIXTURE:** misma cadena → 386, para una baluarte con vida 54 y maná 19.

## 7. Compatibilidad

- **Fotos v1 y #6:** se importan al estado coordinado la primera vez que se tocan, sin reescribirlas en `localStorage`.
  - Una v1 pendiente da 70 de 200.
  - Una bloqueada no impide jugar las demás.
- **Guardados:** sin cambio de formato. Los guardados del #6 cargan igual.
- **Campañas existentes sin registro coordinado:** cuenta lo que se ve en `localStorage`.
- **Plantel, galería y retratos:** no se tocan.
- **SW:** `sw.js` regenerado (218 archivos, con los dos módulos nuevos). La actualización desde una instalación vieja sigue borrando solo las cachés `arcanveil-*`.
- **Archivo único:** se juega desde `file://` con Web Locks e IndexedDB (8/8).

## 8. No probado

- El narrador real (Groq o Claude). Los costes son una estimación sin conexión.
- Un móvil físico (solo la emulación 390×844 con toque emulado).
- Un jugador humano.
- Firefox y Safari (Web Locks e IndexedDB entre pestañas).
- Antifraude: no hay; esto es coherencia local.

## 9. Git

- **Rama:** `feat/legado-seguro-20261008`, desde `f81efd9`. El código y las pruebas llegan hasta `f903fdf`; encima va el commit de este informe.
- **Subida:** push normal, nunca forzado, de esta rama sola, a https://github.com/petetes93/arcanveil/tree/feat/legado-seguro-20261008. El SHA remoto comprobado va en el mensaje de entrega.
- **`main`:** sin tocar (`8c02138`). Sin PR, sin merge y sin publicar el producto. Gasto: 0 €.
- **Árbol:** limpio tras el commit del informe. `dist/` está ignorado.
- **Copias temporales de la base** (con las auditorías nuevas adaptadas a su API y la misma siembra en el arnés): solo en el directorio temporal de la sesión, nunca en el repositorio.
- **La fusión a `main` NO está autorizada** por este informe: espera a la revisión externa.
