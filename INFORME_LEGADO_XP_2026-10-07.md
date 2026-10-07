# Informe del encargo #6: legado de XP, una sola interfaz y verificación del cierre

7 de octubre de 2026. Rama `feat/legado-xp-20261007`, que sale de `feat/cierre-seguro-20261007` (3cc8421). Esa rama desciende a su vez de `feat/menus-identidad-muerte-20261007` (2fc676b).

**Lo que hay:**
- **El legado ya funciona.** El siguiente personaje recibe el 35 % de la experiencia acumulada del muerto, redondeado hacia abajo, una sola vez, al confirmar su creación.
- **La interfaz clásica está retirada.** Su dirección lleva a `app/`.
- **El archivo único parte de `app/` y se juega desde `file://`.**
- **El #5 se conserva** y está comprobado con pruebas nuevas.

**Lo que no está probado:** el narrador real, un móvil físico y un jugador humano. No es «listo para lanzar», y fusionar a `main` está pendiente de revisión externa.

---

## 1. Fallos, bloqueos y avisos (primero)

1. **Chrome móvil: una comprobación del recorrido que falla a veces, sin causa cerrada.**
   - **Qué falla:** al viajar con el compañero, la comprobación exige una escena de «llegada», y a veces el viaje acaba en un encuentro. Escenas vistas: `pnj, encuentro, combate, fin_combate`.
   - **Dónde:** es la etapa «pelea del grupo», anterior a todo lo nuevo.
   - **En el HEAD:** móvil falló 2 de 7 pasadas. Escritorio pasó 3 de 3, y sin-ia 1 de 1.
   - **En la base 3cc8421:** 0 fallos de este tipo en 6 pasadas móviles.
   - **Por qué no lo doy por preexistente:** la semilla de cada partida es aleatoria, el cambio no toca ni viaje ni encuentros, y las cifras no permiten afirmar nada. Queda **sin verificar; puede o no estar relacionado**. Mañana: fijar la semilla del viaje con un FIXTURE y repetir en la base y en el HEAD.
2. **Arnés del #5: «muerte entre el clic y la frontera» depende del dado.**
   - **Qué pasa:** el paso mata con un solo golpe de 999, pero un trasfondo trae `evitarMuerte` (`src/data/backgrounds.data.js:282`) y el trasfondo de la ficha sale del dado. Con ese trasfondo el personaje se queda a 1, la salida pendiente se completa y la prueba falla.
   - **Visto en la base:** 2 de 6 pasadas móviles, por tiempo agotado. En el HEAD aún no ha salido, pero es el mismo código.
   - **Arreglo previsto, sin hacer:** golpear hasta tres veces, como ya hace el paso «muerte». Queda para mañana.
3. **Commit con el mensaje equivocado (error mío).**
   - Las eliminaciones de la interfaz clásica (`src/main.js`, `src/ui/`, `styles/`, la entrevista y dos utilidades) ya estaban preparadas con `git rm`. Por eso entraron en `d73e43b` («guardado: decir la causa cuando el navegador no deja guardar») y no en `cc9fbdb` («interfaz clásica retirada»).
   - Entre esos dos commits, el empaquetador apunta a un `src/main.js` que ya no existe.
   - No lo he rehecho, por la norma de no reescribir historial.
   - Para revisar: `d73e43b` + `cc9fbdb` forman juntos la retirada.
4. **El archivo único no es una distribución completa.**
   - No trae el modo sin conexión instalable (`file://` no admite trabajador de servicio), ni las imágenes de `assets/` (se juega con marcadores), ni los puentes locales de IA e imagen.
   - Sus partidas viven en el almacenamiento del navegador para archivos locales, que **no** es el del juego servido: no comparten partidas.
   - Está documentado en `tools/bundle.mjs`, README y TESTING.
5. **Límite del legado: coherencia local, no antifraude.** Borrar los datos del navegador, editar `localStorage` o importar en otro equipo se lo salta. No hay servidor ni se ha añadido.
6. **Sin Web Locks no se entrega el legado.** Si el navegador no tiene `navigator.locks`, la entrega se bloquea con aviso y se ofrece «Empezar sin herencia». Chrome, Edge, Firefox y Safari 15.4+ los tienen; también desde `file://` (comprobado en Chrome).
7. **Preexistentes, vistos y sin tocar (fuera de alcance, sin balance):**
   - **El nivel 1 muere muy rápido.** En las campañas, tres lobos o el guardia Berlo matan en 2 a 14 turnos.
   - **La durabilidad se guarda con ruido de coma flotante** (`98.80000000000001`).
   - **La estadística `nivelesGanados` cuenta eventos, no niveles.** Un salto de 1 a 3 cuenta 1.
   - **La hazaña «Cinco niveles y las manos limpias»** (nivel 5 sin matar) se cumpliría con una herencia grande. Las hazañas de nivel son recompensas normales por nivel; si esta no debe contarlo, es decisión de diseño.
   - **Dos pestañas creando a la vez una partida SIN herencia** pueden elegir la misma ranura libre.

## 2. Base, ascendencia y el #5 conservado

**Antes de empezar:**
- `git status` estaba limpio en `feat/cierre-seguro-20261007` = 3cc8421 (igual que `origin`).
- `git merge-base --is-ancestor 2fc676b 3cc8421` → cierto.
- `main` = 8c02138.

**La rama:**
- `feat/legado-xp-20261007` se creó desde 3cc8421; no estaba ocupada.
- No se ha cambiado ninguna rama de referencia.

**Del #5, todo sigue igual:**
- **Intensificadores:** sigue en verde, y el arma ausente se aclara sin gastar turno.
  - «toda mi katana», «usando toda mi katana», «toda mi fuerza y el hacha» y «todas mis katanas» aclaran sin conceder nada; leído también en las campañas.
- **Salida segura:** en verde. Las cuatro ejecuciones de Chrome completas repiten todas sus etapas (doble clic, persistencia apagada, cuota llena, enemigo actuando, frontera, muerte con la salida pendiente).
- **Desgaste por `itemId`:**
  - `auditar-cierre` da 39/39.
  - En la campaña 9505, la espada corta baja 0,6 por cada golpe con daño (100 → 95,2) y los fallos no la gastan.
- **Arnés de escritorio:**
  - Escritorio completo con exit 0 en todas sus pasadas (dos en cap10, más otra antes).
  - La muerte natural en la pelea de grupo pasa ahora por la pantalla de herencia («Empezar sin herencia») y empieza un run nuevo.
  - Sin tiempos inflados ni reintentos ocultos.

## 3. El cálculo: 35 % hacia abajo, en enteros

`cantidadLegado(xp) = (xp·35 − (xp·35 mod 100)) / 100` (`src/player/Legado.js`). No usa 0,35 en coma flotante.
- Solo se acepta un entero finito entre 0 y 10⁹. Fuera de eso no hay cantidad (ni truncada ni inventada) y la foto queda **bloqueada** con su motivo y el valor original a la vista.

| XP del muerto | Hereda |
|---|---|
| 0 | 0 |
| 1 | 0 |
| 2 | 0 |
| 3 | 1 |
| 20 | 7 |
| 100 | 35 |
| 103 | 36 |
| 200 | 70 |
| 1000 | 350 |

- **Barrido de 0 a 200 000:** siempre ⌊35·x/100⌋ exacto.
- **Rechazados:** −1, 1,5, NaN, ±∞, "100", null, undefined y >10⁹.

**Procedencia:**
- La foto al morir guarda `xpAcumulada` (= `player.xp`, el saldo) y aparte `xpHeredada` y `xpGanada`.
- `stats.xpTotal` no se suma: la base es solo el saldo del jugador.
- Los puntos de habilidad, talento o atributo no son base de nada.

**Generaciones:** B heredó 350, ganó 650 y muere con 1000 → C recibe **350** (ni 577 ni 227). Comprobado en `auditar-legado` y en las campañas: 1103 → 386.

## 4. Progresión del sucesor: reglas normales, nada del muerto

- **Creación:** el sucesor nace por su flujo normal (`player/crear`, con el run reservado).
- **Entrada de la herencia:** por el canal de siempre (`player/xp` con `legado`). `Progression.otorgarXP` calcula nivel, vida, maná y puntos con la clase **del sucesor**.
- **Comparación con un testigo:** se compara con un personaje igual que gana esa experiencia jugando. Mismo nivel, vida, maná y puntos:
  - 36 XP como glifista;
  - 1050 XP (cuatro niveles de golpe);
  - 17 500 000 XP (nivel 20, con las recompensas de 19 niveles una sola vez).
- **No se copia del muerto:** ni nivel, ni estadísticas, ni armas, ni inventario, ni habilidades, ni memorias, ni relaciones, ni mapa.
  - El inventario es el de su clase (comprobado contra el del muerto).
- **Lo que se apunta:**
  - `player.legadoRecibido = { runOrigen, transaccion, xp, xpOrigen, nombreOrigen, claseOrigen, momento, nivelResultante }`;
  - `player.xpHeredada`.
  - La ganada es `xp − xpHeredada`.
- **Estadísticas:** `xpTotal` (jugada) no cuenta lo heredado; va a `xpHeredada`.
- **Crónica:** dice «empezó en el nivel N con lo heredado de X», no «alcanzó».
- **Rechazos del canal:**
  - una segunda herencia en el mismo personaje;
  - una herencia a un personaje que ya tiene experiencia;
  - experiencia tardía tras morir (no cambia la foto).
- **Herencia de 0:** se entrega una vez, sin premio, y queda cerrada.
- **De paso:** el evento de subida de nivel no traía `nivel`. El rótulo decía «NIVEL undefined» y la crónica «alcanzó el nivel undefined». Ahora dice el número.

**En pantalla:**
- **La muerte** dice «Deja 350 XP: el 35 % de 1000 XP, redondeado hacia abajo…». Si la herencia no se pudo guardar, lo dice y no promete nada.
- **«Nueva partida»** pasa por **Herencia**:
  - el caído aparece primero («acaba de caer»), con su cifra y una estimación de nivel;
  - las ya entregadas de otros no aparecen; las bloqueadas, sí, con su motivo y deshabilitadas;
  - hay que elegir una o «Empezar sin herencia». No se suman ni se toma la primera.
- **Antes de confirmar** hay un aviso con origen, cantidad y estimación («hasta entonces no se gasta»), y la opción «Cambiar herencia».
- **Después**, el aviso «Has heredado N XP…» y la ficha «N heredada de X · M ganada jugando».

## 5. Entrega atómica e idempotente (`src/persistence/EntregaLegado.js`)

`localStorage` escribe cada clave de forma atómica, pero la herencia (`arcanveil:legados`) y la ranura del sucesor (`arcanveil:partida:N`) son dos claves. `Store.transaccion` solo agrupa memoria. Por eso la herencia hace de **diario**:

```
pendiente ──reservar(T)──▶ reservado(T, runDestino, ranura) ──confirmar──▶ aplicado(T, destinatario, ranura)
     ▲                              │
     └──── deshacer (solo si NINGUNA ranura guarda T) ┘
```

**Los pasos:**
1. **Reservar.** Comparar y cambiar `pendiente → reservado(T)`, escribir y releer.
2. **Crear el sucesor en memoria**, por el flujo normal, y darle la experiencia marcada con T.
3. **Guardar su ranura y releerla:** run, T y XP. **Este es el punto de compromiso.** Desde que hay una ranura con T, el premio existe.
4. **Confirmar.** `reservado(T) → aplicado(T)`. Si esta escritura falla, el sucesor ya existe y la recuperación lo termina; no se devuelve nada.

**Recuperación** (al abrir la app y antes de cada intento):
- Una herencia en `reservado(T)` cuyo candado está libre es huérfana: la pestaña que la tomó murió.
- Si alguna ranura guarda un sucesor con T, pasa a `aplicado`. Si no, pasa a `pendiente`.
- Es determinista y nunca vuelve a `pendiente` mientras exista una ranura con T.

**Exclusión entre pestañas:**
- Web Locks (`navigator.locks`), un candado por herencia, pedido sin esperar, que dura todo el protocolo. La otra pestaña recibe «Otra pestaña está creando ahora mismo el sucesor…».
- Una variable o un botón desactivado no valen entre pestañas; dentro de una pestaña, `creandoPartida` evita el doble clic.

**Idempotencia:**
- La misma transacción (doble clic, recarga, «Reintentar») devuelve el resultado ya hecho y abre ese sucesor; no crea otro.
- Otra transacción sobre una herencia entregada recibe «ya la recibió otro personaje» y la opción de continuar con él.

**Fallos:**
- **Cuota llena, relectura que no cuadra o persistencia imposible:**
  - si quedó una ranura con T que no cuadra, se retira (es el run nuevo, recién escrito);
  - la herencia vuelve a `pendiente`; si no se puede escribir, queda `reservado` y la recuperación decide;
  - la interfaz explica la causa real («No queda espacio en el navegador…»), dice que la herencia sigue pendiente y ofrece **Reintentar** (la misma transacción, tras recargar) o **Volver al menú**;
  - el personaje creado en memoria no se juega ni se guarda;
  - no se activa la persistencia por su cuenta.
- **Registro ilegible:** no se escribe encima (antes se habría sustituido por uno vacío). La muerte avisa de que no se pudo guardar la herencia.

**Un fallo de mensaje corregido de paso:** con el almacenamiento lleno, el sondeo de `SaveManager` hacía decir «La persistencia está desactivada. Actívala en Ajustes», que no arregla nada. Ahora dice la causa.

## 6. Migraciones y compatibilidad

- **No sube la versión de guardado.**
  - Los campos nuevos del jugador (`xpHeredada`, `legadoRecibido`) son opcionales.
  - Una partida antigua se lee con todo «ganado»: sin `xpHeredada`, la heredada es 0.
- **La foto pasa a la versión 2.**
  - Las de la versión 1 se leen tal cual (`leerFoto`) y no se reescriben al leerlas.
  - **v1 pendiente con 200 XP** → 70, entregada una vez y conservando sus datos originales (`version: 1`, `puntosHabilidadDisponibles: 3`).
  - **v1 ya aplicada:** sigue aplicada.
  - **v1 sin XP válida:** bloqueada con motivo; las demás siguen.
  - **No se reconstruye la XP sumando estadísticas.**
- **Lo que no cambia:**
  - Las marcas de muerte siguen bloqueando las ranuras del mismo run.
  - El plantel (`arcanveil:personajes`) guarda apariencia, no progreso.
  - La galería no se toca.
  - Las demás herencias quedan intactas byte a byte.
- **Cargar, exportar e importar** (×3) al sucesor no reotorga nada: el canal rechaza una segunda herencia.

## 7. Retirada de la clásica

**Retirado:**
- **Código y estilos:** `src/main.js`, `src/ui/**` (30 módulos), `styles/**` (8 hojas), `src/data/interview.data.js`, `src/player/creation/CharacterInterview.js`, `src/utils/{debounce,format}.js`.
- **Por qué esos:** el grafo de `app/` no los alcanza, `auditar-imports` está en verde y ninguna herramienta los importa.
- **Lo que no se borró:** nada compartido del motor.

**Puentes y portada:**
- **`clasico.html`** queda solo como **puente** a `app/index.html`: sin código del juego, sin leer ni tocar partidas, y redirige con y sin JavaScript.
  - En Chrome, la dirección vieja abre `app/` con las mismas partidas y «Continuar» activo.
  - `/src/main.js`, `/styles/main.css` y `/src/ui/…` dan 404.
- **La portada** (`index.html`) ya no enlaza la interfaz antigua.

**Trabajador de servicio (`sw`):**
- **La lista sin conexión:** sin `styles/` ni la interfaz retirada (216 archivos; antes 256), y con la portada y el puente, para que un enlace viejo funcione sin red.
- **Al actualizar desde una instalación vieja:** borra **solo** las cachés `arcanveil-*` antiguas.
  - Antes borraba todas las del origen, y GitHub Pages comparte origen entre proyectos.
  - Las partidas y la galería no viven en cachés: no las alcanza.
  - Probado en `auditar-sw` con una caché de otro proyecto.

**Archivo único:**
- `tools/bundle.mjs` parte de `app/app.js` y `app/index.html`.
- `auditar-bundle` lo abre en Chrome desde `file://` con un perfil temporal. En el archivo, en este orden:
  1. crea, juega, guarda, recarga y continúa;
  2. muere con 400 XP (FIXTURE): la pantalla dice 140;
  3. un sucesor recibe 140.
- Todo sin red ni excepciones: 8/8.

**Lo que rompió la retirada, y su ajuste:**
- `auditar-cierre`, `auditar-servidores` y `auditar-sw` comprobaban la clásica o su `main.js`: ahora comprueban la retirada.
- `regresion-app` comprobaba el aviso: ahora comprueba el puente.
- Se actualizaron README, CLAUDE.md, TESTING y PENDIENTE.

## 8. Verificación

### Rojo en la base (3cc8421), verde aquí

**Sonda sobre la base,** solo con su propia API (`_sonda-base6.mjs`, sin commitear): 8/8 en rojo.
- `LEGADO_CONFIRMADO = null`;
- `aplicarLegado` devuelve «pendiente: falta decidir»;
- no hay entrega persistente;
- un personaje nuevo tras un muerto de 1000 XP tiene 0 XP y la herencia sigue pendiente;
- la pantalla de muerte dice «a falta de decidir»;
- la clásica sigue;
- el archivo único parte de `src/main.js`;
- el `sw` borra todas las cachés.

**`auditar-legado.mjs` sobre la base:** ni arranca (`Legado.cantidadLegado is not a function`).

### Sobre 0904410 (el código; el informe va en un commit aparte)

| Orden | Resultado | Salida |
|---|---|---|
| `node tools/auditar-todo.mjs` | **38/38** auditorías con código 0, entre ellas legado 89/89, muerte 34/34, cierre 39/39, identidad 50/50, menús 37/37, viaje 21/21, coherencia 148/148, diseño 113/113, tester 71/71, bundle 8/8, sw 12/12 | 0 |
| `node tools/auditar-servidores.mjs` ×3 | 79/79, 79/79, 79/79 | 0, 0, 0 |
| `node tools/generar-sw.mjs --revisar` | al día | 0 |
| `node tools/buscar-secretos.mjs` | ninguna clave en el árbol ni en la historia | 0 |
| `node tools/medir-costes-campana.mjs --autoprueba` | ninguna petición salió del equipo | 0 |
| `node tools/medir-costes-campana.mjs --turnos 100` | 200/200 turnos, 214 peticiones simuladas (39 reparaciones inducidas), 0 intentos de red; estimación $1,24–$1,94 (no es una factura) | 0 |
| `node tools/medir-narrador.mjs` | 132 turnos, 5,6 % de frases repetidas, 0 coletillas, 25/25 preguntas atendidas | 0 |

### Chrome (`tools/regresion-app.mjs`, perfil temporal; capturas en `dist/regresion-cap10/`, ignorado)

| Modo | Salida | Sistemas | Turnos | Excepciones | Fallos | Externas | Capturas |
|---|---|---|---|---|---|---|---|
| escritorio 1440×900, 1.ª | 0 | 32 | 20 | 0 | 0 | 0 | 27 |
| escritorio 1440×900, 2.ª | 0 | 32 | 20 | 0 | 0 | 0 | 27 |
| sin generador 390×844 | 0 | 32 | 20 | 0 | 0 | 0 | 24 |
| móvil 390×844 | 1 en 2 de 7 pasadas (ver §1.1); las otras 5, exit 0 con 27 capturas | | | | | | |

En cada pasada completa se cumple todo esto:
- **Pantalla de muerte:** con 1000 XP (FIXTURE), dice «Deja 350 XP: el 35 % de 1000 XP, redondeado hacia abajo».
- **Pantalla de herencia:** el caído sale primero, con el foco puesto; se elige con Enter (en móvil, con un toque emulado).
- **Aviso antes de confirmar:** dice origen, cantidad y estimación (nivel 3). Cancelar no escribe nada.
- **Confirmar con doble clic:** un solo sucesor, con 350 XP, nivel 3 y la herencia apuntada como entregada. La ranura releída coincide.
- **Ficha:** «350 heredada de Lyra · 0 ganada jugando».
- **Recarga real y «Continuar»:** los mismos valores, y se puede seguir jugando.
- **Cuota llena al crear:** el aviso dice «No queda espacio…» y «sigue pendiente», con el foco en Reintentar. Al reintentar, una sola entrega (105 XP de 300).
- **Dos pestañas que confirman a la vez:** gana una, la otra avisa «Otra pestaña está creando…», y queda un solo sucesor.
- **`clasico.html`:** lleva a `app/` con las mismas partidas; los ficheros retirados dan 404.
- **Sin red:** se juega bien, sin peticiones externas.

Capturas miradas:
- 08 muerte;
- 09 herencia;
- 09b confirmar;
- 09c sucesor con «NIVEL 3» y el aviso de herencia;
- 09e error de cuota;
- 09f la pestaña que pierde;
- 14 puente;
- las del archivo único (inicio, partida y sucesor con «NIVEL 2»).

### Dos campañas nuevas leídas enteras (motor sin ventana; `campana6.mjs`, fuera del repo)

**9303 · rastreadora Sive:**
- «toda mi katana» y sus variantes aclaran sin gastar turno; «Zorvak mientras Korsa mira» también aclara.
- Hay esperas interrumpidas, guardar y cargar, y viaje Vado → Saucedo → Linde.
- Acampa, y tres lobos la matan en el segundo turno de menú. El cuchillo falla las dos veces y sigue en 100.
- Muerte natural con 0 XP: herencia de 0, entregada una vez a una baluarte (Ena). Un segundo sucesor se rechaza («ya la recibió otro personaje»).
- **FIXTURE:** Ena gana 1103 XP (nivel 5) y muere. La foto da 1103 = 0 heredada + 1103 ganada → 386 XP.
- Brun, rastreador, recibe 386: nivel 3, vida 50, puntos 4/2/0, sin XP jugada. Guarda y carga dos veces sin cambios.

**9505 · baluarte Sive:**
- «todas mis katanas» y «el cuchillo y el hacha» aclaran. Entra y sale de la posada, guarda y carga.
- Ataca a Dalwen; Berlo se mete. En 14 turnos de menú, la espada baja 0,6 por cada golpe con daño (100 → 95,2) y la orden repetida se rechaza siempre.
- Muere con 0 XP: herencia de 0 para una glifista.
- **FIXTURE:** misma cadena que en 9303, con 1103 XP → 386.
- El sucesor, baluarte, sale con vida 54 y maná 19 (clase distinta, cifras distintas: salen de su clase).

En ambas, la ranura anterior del muerto no carga.

## 9. No probado

- **El narrador con un modelo real** (Groq o Claude). Las medidas de coste son offline y estimadas, no una factura.
- **Un móvil físico** (solo la emulación de Chrome a 390×844, con un toque táctil emulado).
- **Un jugador humano.**
- **Seguridad antifraude:** a propósito no hay; es coherencia local.
- **Safari y Firefox** (Web Locks, file://).

## 10. Git

- **Rama:** `feat/legado-xp-20261007`, desde 3cc8421 (que contiene el #5 y desciende de 2fc676b). Son 12 commits de código y pruebas, hasta 0904410, más el de este informe.
- **Cambios:** 68 ficheros, +1771 / −15 189; casi todo lo quitado es la interfaz retirada.
- **`main`:** 8c02138, sin tocar. Sin PR, sin merge, sin publicación y sin gasto.
- **Subida:** un push normal de esta rama, nunca forzado, por petición de Alejandro en el chat («pushea»). El encargo también lo pedía para revisión externa.
- **La fusión a `main` NO está autorizada.** Espera a la revisión externa.
- **Copia temporal de la base:** quedó en el directorio temporal de la sesión, fuera del repositorio.
