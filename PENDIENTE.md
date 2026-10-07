# Estado del paquete

**El proyecto está completo.** La web jugable, el motor, el arte procedural, el proxy local y las pruebas están en el repositorio; no queda código por copiar de una conversación.

## Contenido

| Fase | Contenido | Archivos |
|---|---|---|
| 1 | Núcleo | 24 |
| 2 | Interfaz base | 21 |
| 3 | Personaje | 24 |
| 4 | Inventario | 13 |
| 5 | Director procedural | 10 |
| 6 | Motor de IA | 11 |
| 7 | Combate | 12 |
| 8a | Mundo y exploración | 15 |
| 8b | Gente, misiones y economía | 16 |
| 9 | Progresión y guardado | 10 |
| 10 | Pulido y cierre | 3 |

## Verificación

```
151 módulos analizados
  0 importaciones rotas
1088 piezas de arte generadas, 0 problemas
regresión 1440×900 y 390×844: 20 turnos, 0 fallos, offline verificado
```

## Nota histórica: registro de sistemas

La app web actual (`app/app.js`) ya registra los sistemas en este orden. Esta lista queda como referencia de arquitectura:

**Orden obligatorio** — `TurnResolver` siempre el último, `World` después de sus
subsistemas:

```
Clock
Player, Inventory
TimeSystem, WeatherSystem, DynamicEvents, Travel, Exploration, World
RelationshipSystem, ReputationSystem, FactionSystem, DialogueSystem
MerchantSystem, EconomySystem
QuestSystem
StatsTracker, AchievementSystem, Milestones
SaveManager
RulesEngine, EffectApplier, CombatManager
DungeonMaster, ActionRouter, ConsequenceEngine, DifficultyDirector
TurnResolver
```

`TurnResolver` depende de que todo lo demás esté registrado porque consulta a los
sistemas por nombre durante el turno. `World` coordina a `TimeSystem`,
`WeatherSystem` y los demás, así que va después de ellos.

## Interfaz original: retirada

La interfaz de tres paneles de las fases 1-3 (`src/main.js`, `src/ui/`,
`styles/`) se retiró el 7-oct-2026: no podía atacar con el combate por menús
y se mantenía como segundo producto a medias. El juego tiene una sola
interfaz, `app/`. `clasico.html` queda como puente a ella para no romper
enlaces; las partidas guardadas son las mismas (mismo almacenamiento).

## Campos de estado que pueden faltar

Si `GameState.js` es el de la fase 1, comprueba que existan:

```
world.sublugar, world.eventos, world.regiones, world.ganchosEventoUsados
player.usosRasgos, player.retrato, player.motivacion, player.estados
npcs.caidos, quests.historial, quests.fracasadas
hazanas.conseguidas, hazanas.estadisticas
```

`Serializer.deserializar()` funde el guardado sobre el estado inicial, así que un
campo que falte no rompe la carga: simplemente no se conserva.

## Empaquetado

```bash
node tools/bundle.mjs
```

Parte de `app/app.js` y `app/index.html`. Si avisa de módulos ausentes, el
archivo puede no funcionar: `node tools/auditar-bundle.mjs` lo juega en Chrome
desde `file://` para comprobarlo.
