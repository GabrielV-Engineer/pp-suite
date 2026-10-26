# pp-suite

[Read in English →](README.md)

### Construye con IA. Conserva el volante.

**La suite Pragmática y Optimizada para software con IA.** Diséñalo una vez, constrúyelo en piezas pequeñas que siempre funcionan y deja
en manos de una persona cada decisión que importa.

> **Hecho para Claude Code, y solo para Claude Code.** pp-suite usa los hooks y las skills de Claude Code para mantener a la IA dentro de
> las reglas, así que no funciona con otros agentes de programación.

## Nuestra misión

Ayudar a cualquier ingeniero a construir software con agentes de IA de forma organizada, orgánica y controlada, para que, tras semanas
de código escrito por IA, el proyecto siga siendo comprensible, modificable y fiable.

**A qué apuntamos:** una calidad de código que aguante un proyecto *largo* y no solo la primera demo; que nada importante cambie si una
persona no lo decide; y el mínimo de proceso que dé ambas cosas. Una funcionalidad debería poder revisarse en menos de una hora, y quien
revisa debería saber qué cambió, por qué y qué se dejó fuera.

## El problema

Los agentes de IA escriben código muy rápido. Lo que sale mal no es la primera hora, sino la segunda semana.

- Nadie recuerda **por qué** se hizo algo.
- La IA **reescribe el diseño** sin avisar, o una regla en la que contabas.
- Aparecen funciones que nadie pidió, los commits crecen hasta mil líneas y los tests se debilitan hasta que pasan.
- O lo contrario: tantos documentos y pasos que revisar lleva más tiempo que escribir el código.

## Qué obtienes

| Obtienes | Cómo | Lo que vimos en nuestra prueba |
|---|---|---|
| **Un diseño que sigue siendo tuyo** | La entrevista de [The Architect](https://github.com/Hainrixz/the-architect) se convierte en un diseño comprobado. Una construcción no puede editarlo; un cambio pasa por una solicitud que decides tú | Spec Kit solo reescribió el diseño y quitó una regla de la base de datos. pp-suite no, y ahora una comprobación lo detecta |
| **Piezas pequeñas que siempre funcionan** | El trabajo se corta en *rebanadas verticales*: primero el sistema más delgado que funciona de punta a punta, luego un comportamiento visible a la vez, cada uno con una lista de lo que **no** hace | El cambio más pequeño de las tres formas que probamos |
| **Decisiones por escrito, en pocas líneas** | Cada rebanada lleva sus criterios, lo que se dejó fuera y la deuda que creó | Un registro corto junto al trabajo, en vez de nueve documentos |
| **Tú decides, la IA propone** | Aprobaciones, deuda, excepciones y todo lo que la herramienta añadió sin que lo pidieras son solo humanos, y un hook lo hace cumplir | Lo hace cumplir un hook y lo cubren pruebas; no basta con pedirlo |
| **Menos que revisar** | Rebanadas pequeñas, un registro corto y un diseño que no se mueve bajo tus pies | Unos 40 a 60 minutos por funcionalidad, frente a 2 a 3 horas con Spec Kit solo (estimación) |
| **Cada sesión empieza orientada** | Un hook le dice a la IA de quién es el turno cuando empieza una sesión | Una sesión nueva respondió «¿qué hago ahora?» sin buscar nada |

## Cómo funciona

```
 tu idea ─► The Architect ─► diseño ─► tú decides qué se queda ─► rebanadas ─┬─► construir ─► auditar ─► tú decides la deuda
            (entrevista)     comprobado  de lo que se añadió     planificadas │
                                ▲                                            │
                                └──── «el diseño está mal»: solicitud de cambio, tú decides ◄─┘
```

| Paso | Tú | La IA |
|---|---|---|
| 1. Diseño | Contestas la entrevista | Investiga y propone un diseño completo |
| 2. Traspaso | Mantienes o recortas cada extra que añadió la herramienta | Convierte el diseño a una forma comprobada y marca lo que nunca pediste |
| 3. Rebanadas | Apruebas la lista y luego cada rebanada | Propone rebanadas finas a partir del diseño |
| 4. Construcción | — | Construye una rebanada, con pruebas y código juntos, en pasos pequeños |
| 5. Cierre | Decides la deuda que registró | Escribe la auditoría: qué cambió, qué se dejó fuera, qué queda abierto |
| 6. El diseño estaba mal | Decides el cambio | Abre una solicitud de cambio; el diseño se revisa y se renumera |

Un solo comando basta para saber dónde estás: **`ppc next`** dice de quién es el turno y qué ejecutar.

## Rebanadas verticales en vez de la cascada estricta

Escribir lo que quieres antes de que la IA construya es una buena idea. Es el corazón del desarrollo guiado por especificaciones
(spec-driven development) y lo conservamos. Pero si se sigue al pie de la letra se convierte en una cascada: especificar todo, planificar
todo, listar todas las tareas, construir, y descubrir lo que estaba mal solo al final. La lista de tareas de Spec Kit empieza con una fase
de *cimientos* que debe terminar antes de que algo visible funcione, y los críticos llaman al resultado
[«el regreso de la cascada»](https://marmelab.com/blog/2025/11/12/spec-driven-development-waterfall-strikes-back.html). Sus defensores
responden que con una IA el ciclo de respuesta dura minutos y no meses. Los dos tienen razón; depende de cómo se corte el trabajo.

```
 Cascada estricta  especificar todo ─► planificar todo ─► tareas (cimientos primero) ─► construir todo ─► sorpresas al final
 pp-suite          diseño una vez, ligero ─► rebanada 1: funciona de punta a punta ─► rebanada 2 ─► rebanada 3 ─► ...
                                              └─ cada rebanada: pequeña, probada, con una lista de «fuera de alcance»
                                                 y un camino de vuelta al diseño si estaba mal
```

- **Algo funciona desde la primera rebanada.** La rebanada 1 es el sistema más delgado que corre de punta a punta (un
  [esqueleto andante](https://www.oreilly.com/library/view/97-things-every/9780596800611/ch60.html), *walking skeleton*). Encuentras
  los problemas cuando son pequeños.
- **El diseño es firme, no está congelado.** Una rebanada que descubre que el diseño está mal se detiene y pregunta. Una persona decide,
  el diseño se revisa y las rebanadas planificadas contra la versión anterior quedan marcadas.
- **Cada pieza tiene una valla.** Un presupuesto de tamaño y una lista de «fuera de alcance» impiden que una rebanada crezca hacia la
  siguiente.

## Cómo se compara

Hicimos el mismo cambio pequeño (rechazar títulos de tareas vacíos o demasiado largos) en un proyecto de demostración de tres formas, con
el mismo código y la misma petición, y revisamos cada resultado desde fuera con las mismas pruebas más ocho comprobaciones de casos
límite que nadie había visto.

| | Vibecoding | Spec Kit solo | pp-suite |
|---|---|---|---|
| ¿El código funciona y pasa sus comprobaciones? | sí | sí | sí |
| Tiempo para revisar una funcionalidad (estimación) | 20 a 30 min | 2 a 3 horas | 40 a 60 min |
| Cuánto código cambió | poco | unas 3 veces más | lo menos |
| ¿Cambió el diseño o la base de datos por su cuenta? | no | **sí** | no, y una comprobación lo detecta |
| ¿Quedan las decisiones por escrito? | no | sí, en nueve documentos largos | sí, cortas, junto al trabajo |
| Casos límite resueltos (8 comprobaciones) | 8 | 8 | 7: uno dejado fuera a propósito, y lo dijo |

En un cambio tan pequeño los tres escriben código que funciona, así que no afirmamos un código mejor. La diferencia está en lo que hay
que leer, en lo que se movió sin que lo supieras y en si algo quedó escrito. En dos semanas con unas 20 funcionalidades eso se acumula;
como estimación a partir de estas cifras: unas **6 a 9 horas** de revisión con vibecoding, **36 a 64** con Spec Kit solo y **13 a 19**
con pp-suite, con unas 16.000 palabras de registros que mantener al día en lugar de 150.000. La prueba completa está en
[docs/e2e-test-report.md](docs/e2e-test-report.md) (en inglés).

## De dónde vienen las ideas

- **[The Architect](https://github.com/Hainrixz/the-architect)**: la entrevista que convierte una idea vaga en un diseño.
- **[Spec Kit](https://github.com/github/spec-kit) y el desarrollo guiado por especificaciones**: escribirlo antes de construir. Spec Kit es además el anfitrión que instala nuestras skills y hooks.
- **El desarrollo guiado por pruebas (TDD) y el [augmented coding de Kent Beck](https://www.kentbeck.com/summaries/augmented-coding-beyond-the-vibes/)**: las pruebas detectan lo que un agente rompe, y Beck cuenta que algunos agentes las borran para obtener un resultado verde, así que las nuestras no se pueden borrar.
- **El esqueleto andante** (Alistair Cockburn) y las **balas trazadoras** (*The Pragmatic Programmer*): primero lo más delgado que funcione de punta a punta.
- **[La guía de Claude Code](https://code.claude.com/docs/en/best-practices)**: lo que siempre debe ocurrir va en un hook, no en una petición.

## Estado

Pre-alfa. Todo lo descrito existe y está probado; cada pieza se ha probado en ejemplos pequeños. La imagen a dos semanas es una
estimación, no un proyecto largo, y ningún novato lo ha usado todavía. [Hoja de ruta](ROADMAP.md) (en inglés).

## Pruébalo

Necesita [Claude Code](https://code.claude.com) (probado con 2.1.310), Node 22+, Python 3, git y [Spec Kit](https://github.com/github/spec-kit) en la versión de `install/versions.json`.

```bash
cd tools/ppc && npm ci
node bin/ppc.mjs init <tu-proyecto>            # muestra lo que falta
node bin/ppc.mjs init <tu-proyecto> --apply    # lo instala
node bin/ppc.mjs next                          # dentro del proyecto: de quién es el turno
```

Más: [cómo funciona](docs/how-it-works.md) · [glosario y principios](docs/glossary.md) · [el contrato](docs/contract-v0.1.md) · [instalación](install/README.md) (documentación en inglés).

**PP** significa Pragmático y oPtimizado (*Pragmatic and oPtimized*): **Architect.PP** es el lado del diseño y **SDD.PP** es el desarrollo guiado por especificaciones, pragmático y optimizado, el lado de la construcción.

## Licencia

[MIT](LICENSE).
