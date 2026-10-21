# Equipo Replica: 11 skills de terceros

## Qué es

Un equipo de 11 skills para Claude Code de un tercero, con licencia MIT
(Copyright (c) 2026 Jake Schincariol). Origen:
https://github.com/Jakeschincariol/replica-skill (commit `77c9436`, «The
Replica skill: 11 Claude skills, v1.0»).

Instaladas **a nivel de proyecto** en `.claude/skills/` el 2026-10-21, en la
rama `feat/replica-skills-20261021`. **Solo instaladas y verificadas: todavía
no se ha usado ninguna.** Se copiaron las 11 carpetas `replica-*` tal cual,
sin `tests/`, sin `.claude-plugin/` y sin el README ni la licencia del repo de
origen. No se instaló nada en `~/.claude/skills`.

Se cargan al abrir Claude Code **dentro de esta carpeta** (`arcanum`). Una
sesión abierta en otra carpeta no las ve.

## Las 11 skills

| Comando | Qué hace |
| --- | --- |
| `/replica-recon` | Ingeniería inversa de una app desde fuentes públicas: pantallas, flujos, componentes, modelo de datos y matriz de funciones. |
| `/replica-architect` | Planifica stack, esquema de base de datos y API a partir del mapa de recon. |
| `/replica-design` | Sistema de diseño como tokens (roles de color, tipografía, espaciado, componentes) con assets propios. Trae `contrast.py` (contraste WCAG). |
| `/replica-build` | Reconstruye la app pantalla a pantalla, en sala limpia: nada del código, assets ni textos del original. |
| `/replica-backend` | Auth, base de datos, pagos, correo e integraciones con APIs oficiales y claves del propio usuario. |
| `/replica-test` | Plan de pruebas por flujo, e2e con Playwright, recorrido manual e informes de fallos con severidad. |
| `/replica-diff` | Nota de paridad contra el original (`parity.py`) y diferencias de maquetación por capturas (`imgdiff.py`). |
| `/replica-entrepreneur` | Lee reseñas reales del original, las agrupa (`reviews.py`) y saca lo que odian, lo que falta y un ángulo de posicionamiento. |
| `/replica-brand` | Nombre, paleta, brief de logo, voz y un barrido (`sweep.py`) que busca restos del original. |
| `/replica-launch` | Landing, precios y ficha de tienda, con un comprobador de la ficha (`listing.py`). |
| `/replica-deploy` | Puesta en producción en dominio propio, con lista de comprobación previa. |

Las herramientas `.py` son solo de biblioteca estándar de Python 3.8+: no hay
que instalar nada con pip. En este equipo funciona `python` (también `py -3`),
Python 3.13.7.

## Orden de uso del autor

recon → architect → design → build → backend → test → diff → entrepreneur →
brand → launch → deploy

## Cómo las usaremos en ARCANVEIL

ARCANVEIL es un juego original. Estas skills se usan como equipo de análisis,
pruebas y producto, **no para copiar nada**.

- **`/replica-entrepreneur`** sobre la app de referencia «AI Game Master»
  (`com.aisuccess.ai_game_master`, Google Play): sacar de reseñas reales lo
  que los jugadores odian o echan en falta, y convertirlo en propuestas de
  mejora para ARCANVEIL.
- **`/replica-recon`** sobre esa misma app: un mapa de pantallas y flujos con
  el que comparar ARCANVEIL.
- **`/replica-test`** como arnés de playtesting de los flujos del juego.
- **`/replica-diff`** para puntuar ARCANVEIL contra el mapa de la referencia.
- **architect, design, backend, brand, launch y deploy** quedan disponibles,
  sin uso previsto inmediato. ARCANVEIL es web/PWA local, sin backend de pago,
  y cualquier decisión de lanzamiento o de marca pasa antes por el dueño del
  repo.

Encaje con lo que ya hay: las skills escriben en una carpeta `replica/` en la
raíz. ARCANVEIL ya tiene sus propias auditorías en `tools/` y sus agentes en
`.claude/agents/`; `replica/` no sustituye nada de eso.

## Advertencias

- **Sala limpia.** Las skills reconstruyen lo que una app *hace*, nunca lo que
  *posee*. No se copia código, assets, textos ni marca de terceros.
- **Reseñas reales.** Verbatim, enlazadas y con su fuente. Nunca inventadas.
  Nunca se publican reseñas falsas, ni a favor ni en contra. Las reseñas de
  otros son investigación: no van a ninguna página de ARCANVEIL.
- **Nada se ejecuta sin que el dueño del repo lo pida expresamente.** Ninguna
  skill corre por su cuenta.
- **Lo que harían al usarse:**
  - `replica-entrepreneur` y `replica-recon` leen páginas públicas (fichas de
    tienda, reseñas y, si se acepta, feeds oficiales como el RSS de reseñas de
    Apple o la API de Hacker News). Es lectura a ritmo humano: nada de
    scraping ni de cuentas ajenas.
  - `replica-test` propone instalar Playwright con npm. En este repo eso sería
    una dependencia nueva: se decide antes de hacerlo, y ARCANVEIL ya tiene su
    propio conductor de Chrome en `tools/dobles/chrome.mjs`.
  - `replica-backend` y `replica-deploy` hablan de Stripe, dominios y cuentas.
    No aplica aquí, y sus propias reglas dicen que las cuentas, las claves y
    los pagos los pone siempre el usuario.

## Auditoría de seguridad hecha antes de instalar (2026-10-21)

- Se leyeron enteros los 11 `SKILL.md`. Ninguno pide enviar datos del repo a
  servicios externos, desactivar confirmaciones ni ejecutar comandos
  destructivos. Sus reglas prohíben teclear contraseñas, tarjetas o claves.
- Los 6 scripts (`sweep.py`, `contrast.py`, `imgdiff.py`, `parity.py`,
  `reviews.py`, `listing.py`) solo importan biblioteca estándar: `argparse`,
  `csv`, `datetime`, `json`, `math`, `os`, `re`, `struct`, `sys`,
  `unicodedata` y `zlib`.
  - Sin llamadas de red ni procesos: no hay `urlopen`, `urllib`, `socket`,
    `subprocess`, `os.system`, `curl` ni `wget`. El único resultado de buscar
    `requests.` es una lista local en `reviews.py:173`.
  - No leen variables de entorno ni rutas de credenciales.
  - Solo escriben en la ruta que se les da con `--out` (`imgdiff.py`,
    `reviews.py`).
- Licencia MIT confirmada en el `LICENSE` del origen.
