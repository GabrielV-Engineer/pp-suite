# Standards: security, observability, git, CI and experience, decided per project

Status: **built, not yet tried on a real project** (2026-11-19). What exists, with tests: the file `.sddpp/standards.yaml`
and its schema, rules `S01` to `S03`, `ppc standards`, `ppc decide-standard` (human-only through the guard), the panel
questions (`ppc show` / `ppc ask`), the step in `ppc next`, the line in the constitution, the row on the slice card, and the
`/pp-standards` command. Not measured: whether projects decided this way end up safer or easier to run.

## The problem it solves

In the first real project ([report](first-real-project-report.md)) nothing asked about security, observability, branches,
pull requests or CI. They could only come in if The Architect's interview proposed them or the person brought them up.
Neither happened. pp-suite protects what enters the design well, but had no step that asked about what did not.

Projects also differ here. A local app for one person needs neither CI nor metrics. A team service needs both. Teams
branch, review and merge in different ways. So pp-suite does not prescribe an answer. It makes sure the question is
asked, the answer is recorded, and the rest of the flow reads it.

## What it is

Five standards, a fixed list:

| Standard | Kind | Choices |
|---|---|---|
| `security` | product | `basic`, `strict`, `custom` |
| `observability` | product | `errors`, `logs-metrics`, `custom` |
| `git` | way of working | `trunk`, `branch-per-slice`, `branch-per-slice-pr`, `custom` |
| `ci` | way of working | `local`, `github`, `gitlab`, `custom` |
| `experience` | product | `glance`, `review`, `external`, `custom` (see [Experience](#experience-the-fifth-standard)) |

`ppc standards` prints what each choice means. Each standard gets one of three answers, all valid:

- **adopt**, with a choice. `custom` takes free text (`--details`), for a team that has its own rule or tool.
- **later**, with a trigger that asks again: `git_remote` (the repository gets a remote), `ci_config` (a `.github/workflows`
  or `.gitlab-ci.yml` appears), or `backend_component`, `database_component` or `infra_component` (the design gets a
  component of that kind).
- **not needed**, with a reason. Only for the product standards: every project uses git and runs its checks somewhere.

Undecided is a warning, never an error. "Later" is always one click away, so deciding never holds the work up.

## Recommendations, from the project's own facts

Each standard comes with a recommended answer and the reason for it, computed from the design and the repository:

| Standard | Recommended | Why |
|---|---|---|
| security | `basic` if the design has a backend or a database component; otherwise not needed | data crosses a boundary or is stored |
| observability | `errors` if it has a backend or an infra component; otherwise not needed | something runs that can fail where nobody sees it |
| git | `trunk` | the simplest, and the way `ppc check-git` was tried on a real project |
| ci | `github` or `gitlab` from the remote's host; `local` for a remote elsewhere; `later` (trigger `git_remote`) with no remote | CI needs a remote, and runs on the platform that hosts it |
| experience | `review` with a frontend component; `glance` with a backend or a library; not needed when no component is one a person uses | people meet a frontend on screens, where the whole matters; a backend or a library is met through its API, output and errors. Never `external`: that is the person's decision |

`ppc decide-standard --accept-recommended` takes them all in one answer.

## When it asks

- **Before planning.** Once the additions are decided and the cuts applied, `ppc next` puts the standards to the person
  before `/pp-plan`. The slices are then planned knowing them.
- **In the middle of a project.** An undecided standard, or a `later` one whose trigger has fired (rule `S02`), appears
  under "Also waiting for a person" in `ppc next`. It does not stop the slice in progress.
- **Whenever the person wants.** `/pp-standards`, or `ppc ask <standard>`, changes one. The previous decision moves to
  `history`, so a change never erases why it was decided before.

## Who reads each decision

A decision nobody reads is decoration. These are the readers:

| Reader | What it does with the standards |
|---|---|
| The constitution (`CLAUDE.md`) | One line lists the adopted standards, so every session and every build knows them |
| The slice card (`ppc show SL-…`) | A row with the standards that apply to that slice's components: security on backend and database, observability on backend and infra, and git when it is not `trunk` |
| `/pp-build` | Follows them. With `branch-per-slice`, works on a branch named `slice/<id>` |
| `/pp-audit` | Says whether the slice met each standard that applies to it. What it skipped becomes debt (`kind: security`, for example) |
| `/pp-plan` | A standard that needs setup work (a CI workflow, logging) gets its own slice |
| Rule `S03` | An adopted product standard needs a quality attribute in the design (`security`, or `operability` for observability). If there is none, the warning says to open a change request, so the design, and not only this file, carries it |

## The file

`.sddpp/standards.yaml`, written only by `ppc decide-standard`. The guard keeps the decision fields human-only.

```yaml
standards:
  - id: security
    decision: adopt          # pending | adopt | later | not_needed
    choice: basic            # adopt: one of the standard's choices
    decided_by: example-owner
    decided_on: 2026-11-19
  - id: ci
    decision: later
    trigger: git_remote      # later: what asks again
    decided_by: example-owner
    decided_on: 2026-11-19
    history:                 # earlier decisions, newest last
      - { decision: adopt, choice: local, decided_by: example-owner, decided_on: 2026-11-02 }
```

## Rules

| Rule | Severity | Fires when |
|---|---|---|
| `S01` | warning | There is no standards file, or a standard is missing or `pending` |
| `S02` | warning | A standard decided `later` has a trigger that has now happened |
| `S03` | warning | `security`, `observability` or `experience` is adopted and the design has no quality attribute of that kind (`security`, `operability`, `usability`) |

A standard listed twice is `T12`, like any other duplicated id.

## Decisions

- **2026-11-19: the name is `/pp-standards`** (the owner chose it over `/pp-agreements` and `/pp-baseline`).
- **2026-11-19: recommendations from the project's facts, not profiles.** The proposal had profiles ("solo-local",
  "solo-deployed", "team") that filled in defaults. A profile guesses what the design already says (is there a backend,
  an infra component, a remote), and two sources of defaults would disagree. What a profile adds that the facts cannot
  tell (one person or a team) shows up in the git question. A reusable team profile stays possible later.
- **2026-11-19: the constitution names a custom standard without quoting it.** The block is loaded into every session and
  a test keeps it under 2,000 characters; the longest choices of all the standards fill most of the margin. The person's
  words stay in the file, on the slice card and in `ppc standards`.
- **2026-11-19: the file lives in `.sddpp/`, not `.architect/`.** Branches and CI are how the work is done, not what is
  built, so changing them should not need a change request. Security and observability do touch the product, which is
  why `S03` sends them into the design through a change request.

## What it cannot do

- It cannot tell whether a slice really met a standard. The audit says so, and a person reads it.
- It does not write a CI workflow, create branches or open pull requests. Those are planned work (`/pp-plan`), or a
  later step once this has been used.
- `check-git` does not yet read the git standard. A squash merge still loses the slice's commits, whatever was decided.

## Not built yet

- `ppc init` offering to write the CI workflow for the chosen platform.
- `check-git` reading the git standard (warning before a squash, branch names).
- A team profile file reused across projects.

## Experience: the fifth standard

Added 2026-11-20. The first four ask how the code is protected, run and shipped. Nothing asked whether what was built is good
to use: whether it looks dated, feels slow, or confuses whoever meets it. The tests cannot say, and a design approved as a
mockup says nothing about the app as built. This standard asks how much of that judgment the project wants, and records it.

It is not a quality tool. It records what the person decided and makes the flow read it, like the other four.

| Choice | Adds |
|---|---|
| `glance` | After a slice, a person looks at what a user would meet. Never holds the slice up |
| `review` | Glance, plus a review of the whole against a short rubric when a capability is complete or when asked; the person decides which findings become debt of kind `experience` |
| `external` | Review, plus a guide for someone other than the builder to try it. No count of people, no cost and no team size is assumed; skipping it is recorded and blocks nothing |

Decided with the owner (2026-11-20): any surface a person uses counts (screens, command output, API errors, documentation);
a fresh agent session applies the rubric and the person decides; the companion mode (`guide`, `explain` or `delegate`) is
asked at every review, with a recommendation; tools the agent may install are authorized once in the standard, and a tool outside
the list is asked about (use once, add to the list, or no); measuring uses a command the project declares, as `app.check` does.

### The glance (level 1)

When `experience` is `glance`, `review` or `external`, a closed slice that a person meets (it touches a frontend, a backend or a
library) waits for a glance. `custom`, `later` and `not needed` are the person's own way and are not nudged.

| Piece | What it does |
|---|---|
| `closed_on` | `ppc finish` writes the day a slice closed. Only slices closed on or after the day the standard was decided wait for a glance; earlier ones were built under other terms, and a project with 30 closed slices does not get 30 reminders |
| `ppc show SL-…` | On a closed slice nobody has looked at, a **Look at** list written from the slice: its screens against the approved mockups, what it was checked by (try those), the quality targets it names, the captures and console errors the audit saved. The same text every time. A criterion marked `audience: system` (CI, the build: nobody who uses the thing could see it) is left out, and a line says which; without the field a criterion is shown, because pp-suite does not guess from the words |
| `ppc ask SL-…` | Looked, will not look, or not yet. The first two end with the exact command |
| `ppc glance SL-… [--skip]` | Records `glanced_by` and `glanced_on` (and `glance_skipped`) in the slice. Human-only: the guard asks the person, and refuses the three fields written by hand |
| `ppc next` | The slice waits under "Also waiting for a person", one line each, with the command. It is never the next step of the work |

It cannot tell whether the person really looked: `glanced_by` is a name, not a signature, like every approval here.

### The review of the whole (level 2)

When `experience` is `review` or `external`, a capability whose every live slice is closed is due a review of the whole, and the
person can ask for one of the whole project at any time (`ppc ask review`). Only a capability whose last slice closed on or
after the day the standard was decided is due one, and one that was reviewed is not due again.

| Piece | What it does |
|---|---|
| `ppc rubric [surface]` | The criteria, for four surfaces: screens, an API or a library, a command line, documentation. Each cites its source with the words the source uses and the day the page was read, or says it is **pp-suite's own question**. Where a user-interface heuristic is read as a rule for an API's errors, it says **"Changed by pp-suite"**. Sources read on 2026-11-20: Nielsen Norman Group's ten usability heuristics, WCAG 2.2 criterion 1.4.3 and the Command Line Interface Guidelines (clig.dev; only the first part of that page was read) |
| `ppc show CAP-…` / `ppc ask CAP-…` | The card and the panel question: how the review is done. The mode the person chose last comes first, so repeating it is one click; with none yet, `explain` |
| `ppc review CAP-… \| --project --mode …` | Human-only. Writes `.sddpp/reviews/RV-NNN-*.md`: the mode and who chose it, the surfaces (from the components of the closed slices; `--surface cli,docs` adds the two no component says), the rubric and an empty list of answers. Refuses when nothing is closed or one is already open for the same scope |
| `/pp-experience` | A fresh agent session answers the rubric criterion by criterion in that mode: `guide` (the person is told what to try; nothing is run), `explain` (it says what it will do, then does it), `delegate` (a fresh subagent inspects and answers, reading and running only what the person authorized, and it installs nothing; the agent checks its main findings in the code before any becomes debt). Carrying it out and closing the file are the agent's step; the person decides on each finding |
| `ppc next` | A complete capability waits for the person, and an open review is the agent's turn. Neither is ever the next step of the work |
| Rules `R01`, `R02` | A review of a capability the design does not have; a finding that is not in the debt register or does not name the review as its origin |

**A finding is a proposed debt entry** (kind `experience`, origin `review`), and the person decides on it with the flow that
already exists (`ppc approve DEBT-…`: pay it, live with it, or drop it with a reason). A new command to decide findings would
repeat that. A dropped entry is a finding the person dismissed, with its reason.

What it cannot do: tell whether a finding is right, or whether the agent really looked. A criterion the agent could not check is
written `not checked: <why>`, and it is told never to write `ok` for it; nothing verifies that it obeyed.

### The outside test (level 3)

When `experience` is `external`, a review that is closed waits for someone other than the builder to try what it covered. **No
number of people, no team and no cost is assumed**: the person decides who (a colleague, a user, themself after some time away) and
whether it happens at all. Skipping it is recorded and **never holds anything up**.

| Piece | What it does |
|---|---|
| `ppc guide RV-…` | The guide, the same text every time: what to ask them to do (the acceptance criteria of the closed slices), what to watch for (where they hesitate, what does nothing, what they misread, plus one line for each surface), and that the builder explains nothing while they try |
| `ppc show RV-…` / `ppc ask RV-…` | The card with the guide, and the panel question: someone tried it, I will not do this one, or not yet |
| `ppc outside RV-… [--skip] [--note <text>]` | Human-only; the guard asks the person and refuses the fields written by hand. Records `outside_by` and `outside_on` (and `outside_skipped`, and the note: who tried it and how it went, or why not) in the review file. Only a closed review can have one |
| `ppc next` | A closed review waits under "Also waiting for a person". Only reviews closed on or after the day the standard was decided; a skipped one is asked again only when another review closes, since each review has its own record |

It cannot tell whether anyone really tried it: `outside_by` is a name, not a signature. The tools that would help (a screen recording,
a way to take notes) are for the agent to **suggest, as its own suggestions**, when it presents the guide; pp-suite names none.

### Measuring, and the tools the agent may use

The quality targets of the design (a latency, a number of steps) are declared. Declared is not measured. The experience entry of
`.sddpp/standards.yaml` can carry two more fields, both decided by a person, because an agent will run what they say:

| Field | What it is |
|---|---|
| `measure_command` | One line: the command that measures the quality targets and prints the numbers. The project declares it as it declares `app.check`; **pp-suite ships no tool and runs nothing itself**. In `delegate` mode an agent may propose one (`ppc ask experience --measure "<command>"`); the person reads it and decides |
| `allowed_tools` | The tools the agent may run to look at or measure what was built, authorized once. Run **temporarily and outside the repository** (`npx`, `uvx`, a scratch directory), never added to its dependencies. A tool outside the list is asked about: **use it once** (nothing recorded), **add it to the list** (`ppc decide-standard experience --add-tool "<name>"`) or **no** |

Both are set with `ppc decide-standard experience --measure … | --tools "a,b" | --add-tool …`, which changes the adopted answer
(the choice stays and the earlier one goes to history), and a new choice keeps them unless it says otherwise. `decided_on` does not
move on such a change: it is the day the terms of the standard were decided, and it says which closed slices wait for a glance or a
review, so adding a tool must not make them stop waiting. The command has its own day (`measure_on`), `decided_by` is whoever made
the last change, and every earlier state stays in `history`. The guard refuses the fields written by hand.

The audit of a slice runs the command and records `measurements` (`qa`, `command`, `value` as printed, and `met`, the auditor's
reading of the target; `ppc finish` checks the shape and that the quality attribute exists, and **does not judge `met`**). Two
warnings: `S04` when a slice closed against a performance or usability target and no command is declared, and `W10` when one is
declared and a slice closed after it did not record the measurement.

What it cannot do: tell whether the command measures what the target says, or whether a tool is safe. The names in the list are
the person's decision on the agent's suggestion; pp-suite verified none. Whether to put an unknown tool's code on the machine is
the person's judgment, which is why the agent says what it is and where it comes from first.

**Status (2026-11-21).** Built and tested: everything in this section and the ones above, with the prompt `/pp-experience` (and the
step added to `/pp-audit`) **written and not yet run by an agent on a real project**. It tells the agent to name tools only as its own
suggestions, which pp-suite did not verify; nothing checks that it does. **Nothing planned is left from the plan of 2026-11-20.**
Not measured: whether any of it makes what is built better.
