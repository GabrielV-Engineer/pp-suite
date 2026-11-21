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
| `ppc show SL-…` | On a closed slice nobody has looked at, a **Look at** list written from the slice: its screens against the approved mockups, what it was checked by (try those), the quality targets it names, the captures and console errors the audit saved. The same text every time |
| `ppc ask SL-…` | Looked, will not look, or not yet. The first two end with the exact command |
| `ppc glance SL-… [--skip]` | Records `glanced_by` and `glanced_on` (and `glance_skipped`) in the slice. Human-only: the guard asks the person, and refuses the three fields written by hand |
| `ppc next` | The slice waits under "Also waiting for a person", one line each, with the command. It is never the next step of the work |

It cannot tell whether the person really looked: `glanced_by` is a name, not a signature, like every approval here.

**Status (2026-11-20).** Built and tested: the standard, its recommendation, the schema, rule `S03` for it (a `usability` quality
attribute), the debt kind `experience`, and the glance (level 1) as described above. **Planned, not built:** the tools the agent
suggests for looking; the milestone review, its rubric and `.sddpp/reviews/`; the guide for someone else to try it; the measuring
command and the authorized-tools list. Not measured: whether any of it makes what is built better.
