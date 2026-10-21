# Lo que odian, lo que falta y lo que no resuelve: AI Game Master

Análisis de `/replica-entrepreneur` sobre «AI Game Master - El Narrador / Dungeon RPG» (Digital Dynasty Entertainment Inc), hecho el 2026-10-21.

- Google Play: `com.aisuccess.ai_game_master`.
- App Store: id 6475002750.

Es investigación interna para ARCANVEIL: nada de esto va a una landing, a una ficha de tienda ni al marketing.

## La muestra

**168 reseñas únicas** (170 filas en `reviews.csv`; `reviews.py` quita 2 duplicadas por texto). Son de **2 fuentes**:

| Fuente | Reseñas | Fechas | Cómo se leyó |
| --- | --- | --- | --- |
| Google Play, en español | 60 | 2025-11-12 → 2026-10-04 | la ficha, «Ver todas las reseñas», orden «Más recientes» |
| Google Play, en inglés (EE. UU.) | 60 | 2026-09-18 → 2026-10-20 | lo mismo, en inglés |
| App Store, EE. UU. | 50 | 2026-07-14 → 2026-10-16 | RSS oficial de reseñas de Apple, página 1 |

Fuentes que no se pudieron usar:

- **App Store, España:** su RSS oficial no tiene ninguna reseña.
- **Reddit:** el navegador integrado lo bloquea por seguridad. No se usaron proxies ni cuentas.
- **Hacker News** (API oficial de Algolia): ninguna reseña de usuarios. Solo hay un comentario del propio creador de la app, sin respuestas.
- **Trustpilot:** pide una verificación anti-bots, que no se salta. G2 y Capterra no aplican a un juego para móvil.

El objetivo era «100+ reseñas y 3+ fuentes». Se cumple el número, pero hay **2 fuentes, no 3**.

**Los dos números de cada punto** se calculan así:

- **Temas** (los que llevan nombre de tema): el recuento de `replica/feedback.md`, sacado por patrones de `replica/themes.json`.
- **Hallazgos** (marcados así abajo): recuentos más finos. Primero se buscan con patrones y después se leen a mano, reseña por reseña, quitando los elogios que coinciden por palabra («heals with the gameplay feel», «inventory system is spot on»…). Por eso el número del hallazgo puede ser menor que el de los patrones. Cada hallazgo lleva su lista de ids para poder repetirlo. En Google Play se dan los 8 primeros caracteres del uuid; en App Store, el id completo.

En las fuentes de App Store, el enlace es el feed RSS oficial y la reseña se localiza por su **id de Apple** (entre corchetes). En Google Play, cada enlace abre la ficha con esa reseña en primer lugar (`reviewId=`).

---

## 1. Lo que odian

**1.1 Fichas o tokens: pocas, con espera y que caducan.** El tema más grande de la muestra.

- 46 reseñas (27 %), 2 fuentes, media de 3,2★.
- Hallazgo «espera y cupo»: 18 reseñas, 2 fuentes. 2 de ellas lo valoran bien (10253e7d y 109ff691). Ids: 9d5ef3b5, fe04e7bb, b9f811f8, 22776722, 76396464, b6c5b31e, 2450ddbc, 8cddd627, 93731915, 109ff691, c452e622, e00f246b, 10253e7d, 487ba418, 01c51c75 y, de App Store, 14509354017, 14483153759 y 14406924310.
- «so no need to buy any which is a plus for me at least» (Google Play, 5★) https://play.google.com/store/apps/details?id=com.aisuccess.ai_game_master&reviewId=10253e7d-dada-4c00-b817-21f7c70db489&hl=en&gl=US
- «Esperar 4 horas solo para 5 tokens me parece absurdo.» (Google Play, 3★) https://play.google.com/store/apps/details?id=com.aisuccess.ai_game_master&reviewId=76396464-50db-4936-97ef-5a4af4830566&hl=es
- «the wait time to get the 5 free tokens just jumped from 4 hours to 10!» (Google Play, 1★) https://play.google.com/store/apps/details?id=com.aisuccess.ai_game_master&reviewId=e00f246b-33a4-4c1b-9018-8616d1cee1ff&hl=en&gl=US

**1.2 El combate: demasiado frecuente, desequilibrado a nivel bajo y con muertes que empujan a pagar.**

- Tema: 25 reseñas, 2 fuentes, media de 2,7★.
- Hallazgo (frecuencia, dificultad, muertes): 7 reseñas, 2 fuentes, media de 2,0★. Ids: 92f7f0e9, e00f246b, d7e15ce9, df577052 y, de App Store, 14632731532, 14418901490 y 14385338490.
- «constant forced deaths force you to a paywall» (Google Play, 1★) https://play.google.com/store/apps/details?id=com.aisuccess.ai_game_master&reviewId=e00f246b-33a4-4c1b-9018-8616d1cee1ff&hl=en&gl=US
- «Every time I try to do any thing there’s a fight.» (App Store, 2★) [14418901490] https://itunes.apple.com/us/rss/customerreviews/page=1/id=6475002750/sortBy=mostRecent/json

**1.3 Precio, suscripción y muro de pago.**

- Tema: 19 reseñas, 2 fuentes, media de 2,4★.
- «el sistema de monetización me parece muy abusivo» (Google Play, 3★) https://play.google.com/store/apps/details?id=com.aisuccess.ai_game_master&reviewId=63d018f7-89d9-4144-80bb-5bb55bb239d6&hl=es
- «Requires tokens to play, which are for sale at high price.» (App Store, 2★) [14555647304] https://itunes.apple.com/us/rss/customerreviews/page=1/id=6475002750/sortBy=mostRecent/json

**1.4 El narrador olvida y se contradice en partidas largas.**

- Tema «Narrador IA»: 24 reseñas, 2 fuentes, media de 2,1★.
- Hallazgo «memoria y continuidad»: 8 reseñas, 2 fuentes, media de 2,4★. Ids: fb855d6b, 68fdbf10 y, de App Store, 14655198931, 14632731532, 14627216750, 14539466116, 14461526762 y 14325000277.
- «The GM has no memory for continuity. If the game goes past 150 turns everything goes south.» (App Store, 2★) [14627216750] https://itunes.apple.com/us/rss/customerreviews/page=1/id=6475002750/sortBy=mostRecent/json
- «la IA alucina y te mete y saca personajes de cada escena, resucita o mata pero luego se contradice» (Google Play, 1★) https://play.google.com/store/apps/details?id=com.aisuccess.ai_game_master&reviewId=fb855d6b-2666-4ec6-b244-5c10a4a32eba&hl=es

**1.5 El juego pierde su propio estado: vida, curación, daño, objetos, misiones y XP.**

- Tema: 16 reseñas, 2 fuentes.
- Hallazgo leído a mano, sin los elogios que coincidían por palabra: 10 reseñas, 2 fuentes, media de 1,9★. Ids: ae181d48, fb855d6b, b6c5b31e, 6938ab37, d5e1a91c y, de App Store, 14507156590, 14385011356, 14380250033, 14369429755 y 14313444981.
- «aparece en el chat "Enemy Hit, número" pero no se resta la vida» (Google Play, 1★) https://play.google.com/store/apps/details?id=com.aisuccess.ai_game_master&reviewId=ae181d48-92da-4fca-a822-1173b6cb6898&hl=es
- «The attack from an enemy hits you for 18 hps but you loose 42 instead.» (App Store, 1★) [14313444981] https://itunes.apple.com/us/rss/customerreviews/page=1/id=6475002750/sortBy=mostRecent/json

**1.6 El narrador repite o se apropia de lo que escribe el jugador, en vez de hacer avanzar la historia.**

- Hallazgo: 4 reseñas, 2 fuentes, media de 2,0★. Ids: 6b91e4e2, b9f811f8, 15ebc3ea y, de App Store, 14463418899.
- «pasó a desarrollar mis ideas como argumentos suyos» (Google Play, 1★) https://play.google.com/store/apps/details?id=com.aisuccess.ai_game_master&reviewId=6b91e4e2-11b7-4480-af87-08ea931a6770&hl=es
- «It takes your input and rewords it.» (App Store, 2★) [14463418899] https://itunes.apple.com/us/rss/customerreviews/page=1/id=6475002750/sortBy=mostRecent/json

**1.7 Aclarar o corregir al máster cuesta otro turno.**

- Hallazgo: 3 reseñas, 2 fuentes. Ids: d5e1a91c y, de App Store, 14483153759 y 14369429755.
- La referencia ya lo ha arreglado. Su ficha (actualizada el 15-oct-2026) anuncia mensajes «fuera de personaje» gratis, y una reseña posterior lo celebra (d0f557c6, 4★; es un elogio, no cuenta como queja).
- «spent hundreds of tokens trying to fix this with the game master» (App Store, 1★) [14369429755] https://itunes.apple.com/us/rss/customerreviews/page=1/id=6475002750/sortBy=mostRecent/json
- «The question to clarify the situation you ALREADY PAID FOR costs you ANOTHER token.» (App Store, 2★) [14483153759] https://itunes.apple.com/us/rss/customerreviews/page=1/id=6475002750/sortBy=mostRecent/json
- «it used a token for me to send a correction message» (Google Play, 4★) https://play.google.com/store/apps/details?id=com.aisuccess.ai_game_master&reviewId=d5e1a91c-57b2-459d-a9d7-b61c385dc58f&hl=en&gl=US

**1.8 El personaje o su retrato no salen como se pidió.**

- Tema: 8 reseñas, 2 fuentes.
- Hallazgo leído a mano: 4 reseñas, 2 fuentes. Ids: a2b5c434 y, de App Store, 14502037470, 14376041367 y 14325000277.
- «Después de 5 descripciones, no es capaz de acertar con el personaje.» (Google Play, 1★) https://play.google.com/store/apps/details?id=com.aisuccess.ai_game_master&reviewId=a2b5c434-fb7f-41f7-a809-83c5651805f9&hl=es
- «it does not change avatars to reflect clearly written commands» (App Store, 1★) [14376041367] https://itunes.apple.com/us/rss/customerreviews/page=1/id=6475002750/sortBy=mostRecent/json

**1.9 Partidas largas que se degradan o se cuelgan** (thin: una sola fuente).

- Hallazgo: 5 reseñas, solo App Store. Ids: 14655198931 y 14627216750 (se degrada pasados unos 140-150 turnos; también están en 1.4), 14526813211 y 14304015937 (cuelgues en historias muy largas) y 14348897669 (cuelgues frecuentes, sin decir que sea por la longitud).
- «when you go past turn 6000+ the game starts to crash when you type» (App Store, 4★) [14526813211] https://itunes.apple.com/us/rss/customerreviews/page=1/id=6475002750/sortBy=mostRecent/json

**1.10 Historias repetidas: mismo esquema y mismos enemigos** (thin: una sola fuente).

- Tema: 4 reseñas, solo App Store.
- «every subsequent sequal is essentially the same story, repeated» (App Store, 3★) [14316148863] https://itunes.apple.com/us/rss/customerreviews/page=1/id=6475002750/sortBy=mostRecent/json

**1.11 Thin y no se presentan como tendencia:**

- Soporte que no contesta: 3 reseñas, 2 fuentes.
- Libertad mal dosificada: 4 reseñas, 1 fuente.
- Idioma: 2 reseñas, 1 fuente. Una de ellas se queja del lenguaje inclusivo; no es un problema que haya que arreglar.

**1.12 Otros temas con 2 fuentes que no pasan al backlog como punto propio:**

- **Guardado, sincronización y pérdidas** (6 reseñas, 2 fuentes, media de 2,7★): las que enseña `feedback.md` tratan de fichas o monedas que desaparecen, no de partidas perdidas. Ya están dentro de 1.1.
- **Fallos y cuelgues** (7 reseñas, 2 fuentes, media de 3,4★): partidas que se quedan cargando o en pausa, y cuelgues. Los de partidas largas están en 1.9.
- **Imágenes y retratos** (7 reseñas, 2 fuentes, media de 4,0★): sobre todo elogios o pegas menores. Lo que es queja de verdad está en 1.8.
  - «lo único impreciso son las imágenes» (Google Play, 5★) https://play.google.com/store/apps/details?id=com.aisuccess.ai_game_master&reviewId=7b324b13-1d06-41e6-9ed3-7f21487b68fa&hl=es

## 2. Lo que falta (piden por su nombre)

**2.1 Más fichas, recogida automática, o que se acumulen.**

- Es la petición más repetida dentro del tema 1.1.
- «Se podrían recoger las fichar automáticamente» (Google Play, 4★) https://play.google.com/store/apps/details?id=com.aisuccess.ai_game_master&reviewId=9d5ef3b5-d43e-4902-8b0d-be57aa1cd675&hl=es
- «You should make it so tokens can stack up the more hours.» (App Store, 5★) [14406924310] https://itunes.apple.com/us/rss/customerreviews/page=1/id=6475002750/sortBy=mostRecent/json

**2.2 Ver anuncios a cambio de fichas.**

- Tema: 6 reseñas, 2 fuentes, media de 4,5★: lo piden jugadores contentos.
- Leídas a mano: 4 lo piden (58fd1b5e, b6c5b31e, 2ac0960d y, de App Store, 14509354017), 1 valora que ya existe (a11438eb) y 1 es un elogio por no tener anuncios (66b65e84).
- «ojalá te permitieran ver alguna publicidad por fichas» (Google Play, 5★) https://play.google.com/store/apps/details?id=com.aisuccess.ai_game_master&reviewId=58fd1b5e-2c50-4a2e-a196-24dd21f4f76a&hl=es

**2.3 Dados y reglas que pesen** (thin: 3 reseñas, 1 fuente).

- «I would say if you could add some of the dice features?» (Google Play, 5★) https://play.google.com/store/apps/details?id=com.aisuccess.ai_game_master&reviewId=e0747e43-b308-42cf-a85d-f5d83b8f9392&hl=en&gl=US
- «no busques tiradas de dados ni nada por el estilo.» (Google Play, 5★) https://play.google.com/store/apps/details?id=com.aisuccess.ai_game_master&reviewId=83f3f793-66bd-4665-a4e3-5198cf2d6fd0&hl=es

**2.4 Compañeros que actúen en combate** (thin: 2 reseñas, 2 fuentes).

- «they just do nothing and allow my deaths in their direct presence» (Google Play, 1★) https://play.google.com/store/apps/details?id=com.aisuccess.ai_game_master&reviewId=e00f246b-33a4-4c1b-9018-8616d1cee1ff&hl=en&gl=US

**2.5 Multijugador que funcione** (thin).

- Tema: 7 reseñas por patrón («friends», «party members», «amigos»). Leídas a mano, solo 1 habla del multijugador: 14344345624, que cuenta un fallo del modo en línea.

- «the online play being super tedious due to a bug» (App Store, 4★) [14344345624] https://itunes.apple.com/us/rss/customerreviews/page=1/id=6475002750/sortBy=mostRecent/json

## 3. Lo que no resuelve (grupos o trabajos enteros)

**3.1 Quien juega campañas largas y quiere que el mundo se acuerde.**

- Evidencia: hallazgos 1.4 y 1.5 juntos, 17 reseñas distintas (fb855d6b está en los dos), 2 fuentes.
- Se nota a partir de unos 140-150 turnos y en las secuelas.
- «in 140+ moves the characters, their characters and events lose their relevance for Ai» (App Store, 2★) [14655198931] https://itunes.apple.com/us/rss/customerreviews/page=1/id=6475002750/sortBy=mostRecent/json

**3.2 Quien no puede o no quiere pagar por turnos.**

- Hallazgo «no poder pagar»: 6 reseñas, 2 fuentes. Ids: fe04e7bb, 22776722, fc206dea, a11438eb y, de App Store, 14564684284 y 14555647304. Más todo el tema 1.1.
- «Si no pagas, en breve la experiencia se termina.» (Google Play, 2★) https://play.google.com/store/apps/details?id=com.aisuccess.ai_game_master&reviewId=fc206dea-8300-4b6b-8aa5-db191e2eced9&hl=es
- «especially for someone like me were I can't buy token» (Google Play, 5★) https://play.google.com/store/apps/details?id=com.aisuccess.ai_game_master&reviewId=a11438eb-cfb7-4d94-9b1a-9b2ad52ca4e2&hl=en&gl=US

**3.3 Quien busca rol con reglas: dados, estadísticas y consecuencias calculadas** (thin).

- Evidencia: el hallazgo 2.3 y el 1.5.
- «es una pena pues no ves que haya una influencia directa de tus decisiones con tus stats.» (Google Play, 5★) https://play.google.com/store/apps/details?id=com.aisuccess.ai_game_master&reviewId=83f3f793-66bd-4665-a4e3-5198cf2d6fd0&hl=es

---

## Plan de arreglos y ángulo

El plan, con prioridades y tamaños para ARCANVEIL, está en `docs/backlog/2026-10-21-backlog-ai-game-master.md`, junto con los tres ángulos de posicionamiento y el recomendado.

No se añaden filas a `features.csv`: no hay recon de la referencia todavía, porque `/replica-recon` no se ha ejecutado.
