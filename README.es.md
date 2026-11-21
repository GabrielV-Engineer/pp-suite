# pp-suite

### Suite pragmática y optimizada para el desarrollo guiado por especificaciones con IA

[![ci](https://github.com/GabrielV-Engineer/pp-suite/actions/workflows/ci.yml/badge.svg)](https://github.com/GabrielV-Engineer/pp-suite/actions/workflows/ci.yml)
[![Licencia: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![estado: pre-alfa](https://img.shields.io/badge/status-pre--alpha-orange.svg)

[Read in English →](README.md)

**Construye con IA. Conserva el volante.** pp-suite es una forma ágil de construir software con agentes de IA. Diseñas
el proyecto una vez, el agente lo construye en rebanadas finas que siempre funcionan, y cada decisión importante queda
en tus manos y por escrito, de modo que el proyecto sigue teniendo sentido después de semanas de código escrito por IA.

> **Hecho para Claude Code, y solo para Claude Code.** pp-suite usa los hooks y las skills de Claude Code para mantener
> al agente dentro de las reglas, así que no funciona con otros agentes de código.

## En 30 segundos

- **Qué es:** un paso de diseño, un ciclo de construcción y un pequeño verificador de línea de comandos (`ppc`) que se
  conectan a Claude Code.
- **Para quién:** quien quiere que un agente construya un proyecto real, no una demo, sin perderle el rastro.
- **Qué haces tú:** escribes **`/pp`** en el chat. El agente avanza solo hasta que una decisión es tuya, y entonces te
  pregunta en un panel, con una línea por opción que dice qué pasa si la eliges.

## El problema que resuelve

Los agentes de IA escriben código rápido. Lo que sale mal no es la primera hora; es la segunda semana.

- **El agente adivina.** Sin un diseño fijo, inventa un stack, una tabla o una API que nadie pidió.
- **El agente se desvía.** Reescribe el diseño o una regla de la que dependías, añade funciones, o debilita un test
  hasta que pasa.
- **Pierdes el control.** Nadie recuerda *por qué* se hizo algo, los atajos se olvidan y responder "¿dónde estamos?"
  lleva una tarde.
- **O lo contrario:** tantos documentos y pasos que revisar cuesta más que escribir el código.

pp-suite responde a cada uno con algo que una herramienta puede verificar: un diseño que la construcción no puede
editar, rebanadas con una cerca, tests que el agente no puede debilitar, un registro de deuda, y decisiones escritas
junto al trabajo.

## Cómo funciona

```
 tu idea ─► The Architect ─► diseño ─► decides qué se queda ─► rebanadas ─┬─► construir ─► auditar ─► decides la deuda
            (entrevista)     verificado  de lo añadido         planificadas│
                                  ▲                                         │
                                  └──── "el diseño está mal": solicitud de cambio, tú decides ◄─┘
```

| Paso | Tú | El agente |
|---|---|---|
| 1. Diseño | Respondes la entrevista | Investiga y propone un diseño completo: stack, componentes, datos, metas de calidad, qué queda fuera |
| 2. Entrega | Conservas o cortas cada extra que añadió la herramienta | Lo convierte en un diseño verificado y marca lo que nunca pediste |
| 3. Interfaz | Apruebas una maqueta por pantalla | Diseña contigo pantallas, estados y un sistema visual, cuando el proyecto tiene frontend |
| 4. Rebanadas | Apruebas la lista, y luego cada rebanada | Propone rebanadas verticales finas a partir del diseño |
| 5. Construcción | — | Construye una rebanada, tests y código juntos, en commits pequeños |
| 6. Cierre | Decides la deuda que registró | Escribe la auditoría: qué cambió, qué quedó fuera, qué sigue abierto |
| 7. El diseño estaba mal | Decides el cambio | Se detiene y abre una solicitud de cambio; el diseño se revisa y las rebanadas afectadas quedan marcadas |

### Una rebanada atraviesa todo el stack

El diseño nombra cada **componente** y su tipo: `frontend`, `backend`, `database`, infraestructura o biblioteca, con los
archivos que le pertenecen y de qué puede depender. Así el agente y tú comparten el mismo mapa del proyecto:

- **Base de datos:** el modelo de datos y sus reglas viven en el diseño. El verificador rechaza un frontend que hable
  directamente con la base de datos, y una construcción no puede cambiar el diseño por su cuenta.
- **Backend:** cada rebanada lista los componentes que toca; antes de escribir código, `ppc touches` señala cualquier
  archivo que quede fuera de ellos, para que la rebanada no se extienda en silencio al resto del sistema.
- **Frontend:** `.architect/ui.md` guarda las pantallas, sus estados, el sistema visual (con el contraste de cada par de
  colores) y las maquetas que aprobaste. Cada capacidad del frontend necesita una pantalla, una rebanada nombra las
  pantallas que construye, y no puede cerrarse hasta que su auditoría diga qué mostró la app real, con capturas.
- **Estado:** `ppc next` dice a quién le toca y el comando exacto; `ppc status` muestra cada rebanada, su fase y lo que
  espera por ti. Una capacidad sin rebanada es un error, así que nada del diseño queda sin planificar en silencio.

Así la planificación no es un documento aparte que envejece: el plan *son* las rebanadas, y su estado se verifica contra
la historia real de git.

## Qué obtienes

| Obtienes | Cómo | Evidencia |
|---|---|---|
| **Un diseño que sigue siendo tuyo** | El diseño se verifica; una construcción no puede editarlo; un cambio pasa por una solicitud que tú decides | En una prueba lado a lado, Spec Kit solo reescribió el diseño y quitó una regla de la base de datos. pp-suite no, y ahora una verificación lo detecta ([prueba](docs/e2e-test-report.md)) |
| **Piezas pequeñas que siempre funcionan** | La primera rebanada es el sistema más fino que funciona de punta a punta; cada una después añade un comportamiento visible, con una lista de lo que **no** hace | En corridas controladas, una petición de una frase produjo 4,6 veces más código; una rebanada estrecha lo mantuvo acotado ([informe](docs/experiment-report-2.md)) |
| **Tests que el agente no puede debilitar** | En el ciclo estricto, un hook bloquea los cambios a los tests que aprobaste; en cualquier ciclo, `ppc check-git` verifica la auditoría de cada rebanada contra los commits reales | Los tests del guardián y del verificador corren en cada push |
| **Deuda que no se olvida** | Cada atajo se vuelve una entrada en `.sddpp/debt.yaml`; una persona la decide, y se puede asignar a la rebanada que la paga | En el proyecto corto de abajo se pagaron 18 de 34 entradas y cada una de las demás tiene una decisión |
| **Decisiones que perduran** | Las aprobaciones, las solicitudes de cambio y los extras se registran con quién decidió y por qué | Una sesión nueva respondió "¿qué hago ahora?" sin buscar |
| **Tú decides, el agente propone** | Los comandos solo para personas pasan por un panel de preguntas; un hook deja pasar solo el comando que elegiste, una vez | Unas 50 decisiones en el proyecto corto, cada una con un clic |

## Un proyecto corto con pp-suite

Cómo fue un proyecto real, desde una carpeta vacía hasta una primera versión que funciona. Era una app de escritorio
para un único usuario profesional: un proceso local de datos, una base de datos, una interfaz en React y un servidor que
deja a un asistente de IA leer los datos de la app. Un desarrollador, Linux, 18 días de calendario.

**Primero: el diseño y el esqueleto andante.**
El desarrollador respondió la entrevista de The Architect. La entrega marcó 13 cosas que el diseño añadió sin que nadie
las pidiera (una pantalla de ajustes, atajos de teclado, una política de seguridad estricta, y más); el desarrollador
conservó 9 y cortó 4 en cinco minutos. La primera rebanada construyó solo una ventana, servida en local, con sus
primeros tests a cada lado. Encontró un conflicto real en el diseño: la política de seguridad estricta bloqueaba el
puente entre la interfaz y el backend. El agente se detuvo en vez de improvisar, abrió una solicitud de cambio, y la
decisión se tomó y se aplicó en seis minutos.

**Después: decidir con números, y construir.**
Antes de comprometerse con un motor de procesamiento, una rebanada con tiempo acotado midió dos candidatos con la misma
entrada: uno tardó 573 s para 46 minutos de audio y cumplió la meta del diseño; el otro tardó 2.350 s y no. El diseño
se revisó con una solicitud de cambio, y las rebanadas siguientes añadieron cada una un comportamiento visible:
importar, procesar, listar, reproducir, editar.

**Al final: usarla, y arreglar lo que el uso muestra.**
La interfaz se diseñó con maquetas aprobadas y el desarrollador empezó a usar la app. Eso encontró lo que los tests no:
la app real no se había abierto en 23 rebanadas, porque todos los tests de interfaz usaban un sustituto del backend. El
arreglo entró en el propio pp-suite (una rebanada ahora necesita la app real abierta y capturada) y en cuatro rebanadas
de corrección del proyecto.

**Resultados en la primera versión:**

| | |
|---|---|
| Rebanadas hechas | 34 de 40 planificadas (6 quedan para la siguiente versión) |
| Código | unas 6.500 líneas de producción y 6.500 de tests; 560 tests pasan, verificación estricta de tipos limpia |
| Cambios de diseño | 21 solicitudes de cambio, cada una decidida por una persona, con su razón registrada |
| Deuda técnica | 34 entradas registradas: 18 pagadas, 13 abiertas, 2 aceptadas, 1 descartada; ninguna sin decidir |
| Tiempo | 8 días de trabajo, unas 15 horas de sesiones del agente |
| Costo | unos **129 USD** a precios de API (34 rebanadas, unos 3,80 USD por rebanada) |

**Costo y beneficio.** Cerca del 70% de los commits fueron registros, no código: planes, auditorías, entradas de deuda,
solicitudes de cambio. Ese es el precio del método, y es real: tokens y minutos. Pero todo eso lo escribió el agente. El
desarrollador tomó unas 50 decisiones en un panel de preguntas y nunca tuvo que escribir un informe de estado, llevar una
lista de tareas, recordar un atajo ni reconstruir por qué se hizo algo. En cualquier momento `ppc next` respondía
"¿dónde estamos?" en una línea, y el registro del proyecto estaba completo cuando salió la versión.

## Cómo se probó, con honestidad

- **Qué medimos.** 63 corridas controladas en dos experimentos, una comparación de tres vías sobre un cambio, y el
  proyecto corto de arriba. [Experimento 1](docs/experiment-report.md) · [Experimento 2](docs/experiment-report-2.md) ·
  [prueba de tres vías](docs/e2e-test-report.md) · [primer proyecto real](docs/first-real-project-report.md).
- **Qué cuesta.** En tareas del tamaño de una rebanada, el ciclo estricto completo (rojo, verde, refactor con
  aprobaciones) igualó en calidad a un prompt simple y costó 2,5 veces más. El proyecto corto usó el ciclo ligero (tests
  y código juntos) en todas las rebanadas; el estricto vale la pena en rebanadas de riesgo.
- **Qué no afirmamos.** **No tenemos evidencia controlada de que pp-suite escriba mejor código** que un buen prompt. Lo
  que da, y lo que sí vimos, es control y un registro: el diseño no se movió sin una decisión, la deuda se siguió y se
  pagó, y un proyecto largo siguió siendo comprensible.
- **Qué se le escapó.** En el proyecto corto, las verificaciones del proceso pasaban mientras la app real no arrancaba.
  Las compuertas medían el proceso, no el producto; usar la app fue lo que lo encontró, y ahora es una verificación.
- **Aún sin probar:** un segundo proyecto, un equipo, otra persona usándolo, macOS o Windows.

## Los comandos

Rara vez necesitas más que `/pp`. Los demás corren una fase a propósito.

| Comando | Qué hace |
|---|---|
| `/pp` | El siguiente paso, uno tras otro hasta que una decisión es tuya. `/pp SL-022` decide esa |
| `/pp-design` | Convierte el diseño de The Architect en el diseño verificado; `ui` diseña la interfaz contigo; `cuts` quita lo que cortaste |
| `/pp-standards` | Decide contigo cómo maneja el proyecto la seguridad, la observabilidad, git y CI: con una recomendación sacada del diseño, y "más adelante" siempre es una respuesta |
| `/pp-experience` | Hace una revisión de lo que la gente usa, como conjunto, del modo que elegiste (guía, explicación o delegar), y propone cada hallazgo como deuda para que decidas |
| `/pp-plan` | Rebanadas verticales finas a partir del diseño |
| `/pp-build` | Construye la rebanada en curso, tests junto al código |
| `/pp-check` | Revisa: `clarify`, `analyze` o `converge` |
| `/pp-audit` | Registra deuda y desviaciones, cierra la rebanada |
| `/pp-change` | Aplica al diseño un cambio aceptado |
| `/pp-red`, `/pp-green`, `/pp-refactor` | El ciclo estricto, cuando una rebanada lo usa |

En una terminal: `ppc next` (a quién le toca), `ppc status` (todas las rebanadas), `ppc validate` (verifica el
proyecto). La lista completa y su equivalencia con Spec Kit y OpenSpec están en
[cómo funciona](docs/how-it-works.md#you-type-pp).

## Inicio rápido

Necesitas [Claude Code](https://code.claude.com) (probado con 2.1.310), Node 22+, Python 3, git y
[Spec Kit](https://github.com/github/spec-kit) en el commit de [`install/versions.json`](install/versions.json).
Instala [The Architect](https://github.com/Hainrixz/the-architect) en Claude Code para la entrevista de diseño.

```bash
git clone https://github.com/GabrielV-Engineer/pp-suite.git
cd pp-suite/tools/ppc && npm ci && cd ../..

node tools/ppc/bin/ppc.mjs init ~/mi-proyecto                  # solo informa: qué falta
node tools/ppc/bin/ppc.mjs init ~/mi-proyecto --apply --shim   # lo instala; --shim pone `ppc` en tu PATH
```

`init` no instala Spec Kit por ti; si falta, el informe imprime el comando para el commit fijado. `--apply` necesita un
árbol de git limpio, así que todo lo que hace aparece como un diff que puedes revisar.
[Detalles de instalación](install/README.md).

Luego abre Claude Code en tu proyecto y escribe `/pp`. Si aún no hay diseño, te lleva a la entrevista de The Architect.

## Por qué rebanadas verticales

Escribir lo que quieres antes de que el agente lo construya es el corazón del desarrollo guiado por especificaciones, y
lo conservamos. Seguido al pie de la letra, se vuelve una cascada: especificar todo, planificar todo, construir todo, y
descubrir al final qué estaba mal. Sus críticos lo llaman
["the waterfall striking back"](https://marmelab.com/blog/2025/11/12/spec-driven-development-waterfall-strikes-back.html).

```
 Cascada estricta  especificar todo ─► planificar todo ─► tareas (base primero) ─► construir todo ─► sorpresas al final
 pp-suite          diseñar una vez, ligero ─► rebanada 1: funciona de punta a punta ─► rebanada 2 ─► rebanada 3 ─► ...
                                                  └─ cada rebanada: pequeña, probada, con una lista de "fuera de alcance"
                                                     y un camino de vuelta al diseño si estaba mal
```

El diseño es **firme, no congelado**: una rebanada que lo encuentra mal se detiene y pregunta, una persona decide, y el
cambio queda registrado.

## Créditos: sobre qué está construido, y por qué

La meta es una forma ágil de trabajar con agentes de IA en la que el trabajo avanza en rebanadas que ves funcionar, los
tests sostienen lo hecho, la deuda se sigue y las decisiones no se pierden en un proyecto largo. El diseño busca dejarle
al agente menos espacio para adivinar, desviarse o quitarte el control. Cada pieza de abajo aporta una parte de eso. No
copiamos código de ninguna, salvo el mapa de Floorplan, adoptado sin cambios y registrado en
[THIRD_PARTY.md](THIRD_PARTY.md); cada una se puede actualizar por separado.

| Construido sobre | Qué aporta al flujo | Por qué esta |
|---|---|---|
| **[Claude Code](https://code.claude.com)** | Donde todo corre: las skills llevan cada paso y los hooks hacen cumplir las reglas | Un hook corre siempre; una petición en un prompt se puede olvidar. Hacer cumplir es lo que evita que el agente se desvíe, y los hooks de Claude Code lo hacen posible |
| **[The Architect](https://github.com/Hainrixz/the-architect)** | La entrevista de diseño | Hace las preguntas correctas y verifica versiones en vivo, así el agente parte de hechos y no de suposiciones. Conservamos su diseño y dejamos su plan de construcción, ordenado por capas |
| **[Spec Kit](https://github.com/github/spec-kit)** (GitHub) | El instalador que pone nuestras skills y hooks en un proyecto | Es muy usado y ya hace bien este trabajo, así que construimos sobre él en vez de rehacerlo. Fijamos una versión probada |
| **Node y git simples** (`ppc`) | Las verificaciones, los tamaños, a quién le toca | Las reglas deben responder igual cada vez, así que son código común, no el juicio del agente; git es el registro de lo que realmente pasó |

**De dónde vienen las ideas:**

| Idea | Qué toma pp-suite de ella |
|---|---|
| **Desarrollo guiado por especificaciones** ([Spec Kit](https://github.com/github/spec-kit), [OpenSpec](https://github.com/Fission-AI/OpenSpec)) | Escribirlo antes de construir, para que el agente trabaje desde una verdad compartida |
| **Agile y XP: rebanadas verticales, el esqueleto andante** (Alistair Cockburn), **balas trazadoras** (*The Pragmatic Programmer*) | Algo funciona desde la primera rebanada, y cada rebanada es un paso pequeño y visible que puedes revisar |
| **Desarrollo guiado por tests y el [augmented coding de Kent Beck](https://www.kentbeck.com/summaries/augmented-coding-beyond-the-vibes/)** | Los tests atrapan lo que un agente rompe. Beck cuenta que los agentes borran tests para ver todo en verde, así que en el ciclo estricto los nuestros se bloquean |
| **[Deuda técnica](https://c2.com/doc/oopsla92.html)** (Ward Cunningham) | Un atajo es un préstamo: se registra, una persona lo decide y una rebanada lo paga |
| **[Registros de decisiones de arquitectura](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions)** (Michael Nygard) | Las decisiones son cortas, fechadas y viven junto al diseño, para que el *por qué* sobreviva al proyecto |
| **[Las buenas prácticas de Claude Code](https://code.claude.com/docs/en/best-practices)** | Lo que siempre debe pasar va en un hook, no en una petición |

## Estado

Pre-alfa. Todo lo descrito arriba existe y tiene tests, y un proyecto real se construyó con él. No lo ha usado un equipo
ni nadie aparte de su autor. [Hoja de ruta](ROADMAP.md) · [glosario y principios](docs/glossary.md) ·
[el contrato](docs/contract-v0.1.md).

**PP** significa Pragmatic and oPtimized (pragmático y optimizado): **Architect.PP** es el lado del diseño y **SDD.PP**
el de la construcción.

## Contribuir

Los issues y pull requests son bienvenidos. Lee primero [CONTRIBUTING.md](CONTRIBUTING.md); para reportar un problema de
seguridad, mira [SECURITY.md](SECURITY.md).

## Licencia

[MIT](LICENSE).
