# pp-suite

### Pragmatic and Optimized suite for Spec-Driven Development with AI

[![ci](https://github.com/GabrielV-Engineer/pp-suite/actions/workflows/ci.yml/badge.svg)](https://github.com/GabrielV-Engineer/pp-suite/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![status: pre-alpha](https://img.shields.io/badge/status-pre--alpha-orange.svg)

[Leer en español →](README.es.md)

**Build with AI. Keep the wheel.** pp-suite is an agile way to build software with AI coding agents. You design the
project once, the agent builds it in thin slices that always run, and every decision that matters stays in your hands
and on record, so the project still makes sense after weeks of AI-written code.

> **Made for Claude Code, and only for Claude Code.** pp-suite uses Claude Code's hooks and skills to keep the agent
> inside the rules, so it does not work with other coding agents.

## In 30 seconds

- **What it is:** a design step, a build cycle and a small command-line checker (`ppc`) that plug into Claude Code.
- **Who it is for:** a developer who wants an agent to build a real project, not a demo, without losing track of it.
- **What you do:** type **`/pp`** in the chat. The agent goes on by itself until a decision is yours, then asks you in
  a question panel, with one line per option saying what happens if you pick it.

## The problem it solves

AI agents write code fast. What goes wrong is not the first hour; it is week two.

- **The agent guesses.** Without a fixed design it invents a stack, a table or an API that nobody asked for.
- **The agent drifts.** It rewrites the design or a rule you relied on, adds features, or weakens a test until it passes.
- **You lose control.** Nobody remembers *why* something was done, the shortcuts are forgotten, and "where are we?" takes
  an afternoon to answer.
- **Or the opposite:** so many documents and steps that reviewing takes longer than writing the code.

pp-suite answers each one with something a tool can check: a design the build cannot edit, slices with a fence, tests
the agent cannot weaken, a debt register, and decisions written next to the work.

## How it works

```
 your idea ─► The Architect ─► design ─► you decide what stays ─► slices ─┬─► build ─► audit ─► you decide the debt
              (interview)      checked   of what was added        planned │
                                  ▲                                         │
                                  └──── "the design is wrong": change request, you decide ◄─┘
```

| Step | You | The agent |
|---|---|---|
| 1. Design | Answer the interview | Researches and proposes a full design: stack, components, data, quality targets, what is out of scope |
| 2. Hand-off | Keep or cut each extra the tool added | Turns it into a checked design and flags what you never asked for |
| 3. Interface | Approve one mockup per screen | Designs screens, states and a visual system with you, when the project has a frontend |
| 4. Slices | Approve the list, then each slice | Proposes thin vertical slices from the design |
| 5. Build | — | Builds one slice, tests and code together, in small commits |
| 6. Close | Decide the debt it recorded | Writes the audit: what changed, what was left out, what is still open |
| 7. Design was wrong | Decide the change | Stops, opens a change request; the design is revised and the affected slices are flagged |

### One slice crosses the whole stack

The design names every **component** and its kind: `frontend`, `backend`, `database`, infrastructure or library, with
the files it owns and what it may depend on. That gives the agent and you the same map of the project:

- **Database:** the data model and its rules live in the design. The checker rejects a frontend that talks to the
  database directly, and a build cannot change the design on its own.
- **Backend:** each slice lists the components it touches; before writing code, `ppc touches` names any file that falls
  outside them, so the slice cannot spread quietly into the rest of the system.
- **Frontend:** `.architect/ui.md` holds the screens, their states, the visual system (with the contrast of every color
  pair) and the mockups you approved. Every frontend capability needs a screen, a slice names the screens it builds, and
  it cannot close until its audit says what the real app showed, with screenshots.
- **Status:** `ppc next` says whose turn it is and the exact next command; `ppc status` shows every slice, its phase and
  what waits for you. A capability with no slice is an error, so nothing in the design is silently left unplanned.

So planning is not a separate document that goes stale: the plan *is* the slices, and their state is checked against
the real git history.

## What you get

| You get | How | Evidence |
|---|---|---|
| **A design that stays yours** | The design is checked; a build cannot edit it; a change goes through a request that you decide | In a side-by-side test, Spec Kit alone rewrote the design and dropped a database rule. pp-suite did not, and a check now catches it ([test](docs/e2e-test-report.md)) |
| **Small pieces that always run** | The first slice is the thinnest system that runs end to end; each next one adds one visible behavior, with a list of what it does **not** do | In controlled runs, a one-sentence request produced 4.6 times more code; a narrow slice kept it bounded ([report](docs/experiment-report-2.md)) |
| **Tests the agent cannot weaken** | In the strict cycle, a hook blocks edits to the tests you approved; in every cycle, `ppc check-git` verifies each slice's audit against the real commits | Unit tests for the guard and the checker run on every push |
| **Debt that is not forgotten** | Every shortcut becomes an entry in `.sddpp/debt.yaml`; a person decides it, and it can be scheduled into the slice that pays it | In the short project below, 18 of 34 entries were paid and each of the rest has a decision |
| **Decisions that last** | Approvals, change requests and additions are recorded with who decided and why | A fresh session answered "what do I do now?" without searching |
| **You decide, the agent proposes** | Human-only commands go through a question panel; a hook lets through only the command you picked, once | About 50 decisions in the short project, each one a click |

## A short project with pp-suite

How a real project went, from a blank folder to a working first version. It was a desktop app for one professional
user: a local processing pipeline, a database, a React interface and a server that lets an AI assistant read the
app's data. One developer, Linux, 18 calendar days.

**First: design and the walking skeleton.**
The developer answered The Architect's interview. The hand-off flagged 13 things the design added that nobody had asked
for (a settings screen, keyboard shortcuts, a strict security policy, and more); the developer kept 9 and cut 4 in five
minutes. The first slice built only a window, served locally, with its first tests on each side. It found a real conflict in
the design: the strict security policy blocked the bridge between the interface and the backend. The agent stopped
instead of improvising, opened a change request, and the decision was made and applied in six minutes.

**Then: decide with numbers, and build.**
Before committing to a processing engine, a timeboxed slice measured two candidates on the same input: one took 573 s
for 46 minutes of audio and met the design's target; the other took 2,350 s and did not. The design was revised through
a change request, and the following slices each added one visible behavior: import, process, list, play, edit.

**Last: use it, and fix what using it shows.**
The interface was designed with approved mockups, and the developer started using the app. That found what tests had
not: the real app had not been opened during 23 slices, because every interface test used a stand-in for the backend.
The fix went into pp-suite itself (a slice now needs the real app opened and captured), and into four fix slices in
the project.

**Results at the first version:**

| | |
|---|---|
| Slices done | 34 of 40 planned (6 left for the next version) |
| Code | about 6,500 lines of production code and 6,500 of tests; 560 tests pass, strict type checks clean |
| Design changes | 21 change requests, every one decided by a person, with the reason recorded |
| Technical debt | 34 entries recorded: 18 paid, 13 open, 2 accepted, 1 dropped; none undecided |
| Time | 8 working days, about 15 hours of agent sessions |
| Cost | about **129 USD** at API prices (34 slices, about 3.80 USD per slice) |

**Cost and benefit.** About 70% of the commits were records, not code: plans, audits, debt entries, change requests.
That is the price of the method, and it is real: tokens and minutes. But the agent wrote all of it. The developer made
about 50 decisions in a question panel and never had to write a status report, keep a task list, remember a shortcut or
rebuild why something was done. At any moment `ppc next` answered "where are we?" in one line, and the record
of the project was complete when the version shipped.

## How it was tested, honestly

- **What we measured.** 63 controlled runs in two experiments, a three-way comparison on one change, and the short
  project above. [Experiment 1](docs/experiment-report.md) · [Experiment 2](docs/experiment-report-2.md) ·
  [three-way test](docs/e2e-test-report.md) · [first real project](docs/first-real-project-report.md).
- **What it costs.** On slice-sized tasks, the full strict cycle (red, green, refactor with approvals) matched a plain
  prompt in quality and cost 2.5 times more. The short project used the light cycle (tests and code together) for
  every slice; the strict one is worth it for risky slices.
- **What we do not claim.** We have **no controlled evidence that pp-suite writes better code** than a good prompt. What
  it gives you, and what we did see, is control and a record: the design did not move without a decision, the debt was
  tracked and paid, and a long project stayed understandable.
- **What it missed.** In the short project, the process checks passed while the real app did not start. The gates
  measured the process, not the product; using the app is what found it, and it is now a check.
- **Not yet tried:** a second project, a team, another person using it, macOS or Windows.

## The commands

You rarely need more than `/pp`. The others run one phase on purpose.

| Command | What it does |
|---|---|
| `/pp` | The next step, on and on until a decision is yours. `/pp SL-022` decides that one |
| `/pp-design` | Turns The Architect's design into the checked design; `ui` designs the interface with you; `cuts` removes what you cut |
| `/pp-plan` | Thin vertical slices from the design |
| `/pp-build` | Builds the slice in progress, tests with the code |
| `/pp-check` | Reviews: `clarify`, `analyze` or `converge` |
| `/pp-audit` | Records debt and deviations, closes the slice |
| `/pp-change` | Applies an accepted change to the design |
| `/pp-red`, `/pp-green`, `/pp-refactor` | The strict cycle, when a slice uses it |

In a terminal: `ppc next` (whose turn), `ppc status` (every slice), `ppc validate` (check the project). The full list
and how they map to Spec Kit and OpenSpec are in [how it works](docs/how-it-works.md#you-type-pp).

## Quick start

Needs [Claude Code](https://code.claude.com) (tried with 2.1.310), Node 22+, Python 3, git, and
[Spec Kit](https://github.com/github/spec-kit) at the commit in [`install/versions.json`](install/versions.json).
Install [The Architect](https://github.com/Hainrixz/the-architect) in Claude Code for the design interview.

```bash
git clone https://github.com/GabrielV-Engineer/pp-suite.git
cd pp-suite/tools/ppc && npm ci && cd ../..

node tools/ppc/bin/ppc.mjs init ~/my-project                  # report only: what is missing
node tools/ppc/bin/ppc.mjs init ~/my-project --apply --shim   # set it up; --shim puts `ppc` on your PATH
```

`init` does not install Spec Kit for you; when it is missing, the report prints the command for the pinned commit.
`--apply` needs a clean git tree, so everything it does shows up as a diff you can review. [Install details](install/README.md).

Then open Claude Code in your project and type `/pp`. With no design yet, it points you to The Architect's interview.

## Why vertical slices

Writing down what you want before the agent builds it is the heart of spec-driven development, and we keep it. Followed
strictly, it becomes a cascade: specify everything, plan everything, build everything, and find out what was wrong at
the end. Critics call it ["the waterfall striking back"](https://marmelab.com/blog/2025/11/12/spec-driven-development-waterfall-strikes-back.html).

```
 Strict cascade   specify all ─► plan all ─► tasks (foundation first) ─► build all ─► surprises at the end
 pp-suite         design once, lightly ─► slice 1: works end to end ─► slice 2 ─► slice 3 ─► ...
                                              └─ each slice: small, tested, with a "not in scope" list
                                                 and a path back to the design if it was wrong
```

The design is **firm, not frozen**: a slice that finds it wrong stops and asks, a person decides, and the change is on
record.

## Credits: what it is built on, and why

The goal is an agile way of working with AI agents in which the work moves in slices you can see running, tests hold
what is done, the debt is tracked, and decisions are not lost over a long project. The design aims to leave the agent
less room to guess, to drift or to take control away from you. Each piece below brings one part of that. We copy none
of their code, and each can be upgraded on its own.

| Built on | What it brings to the workflow | Why this one |
|---|---|---|
| **[Claude Code](https://code.claude.com)** | Where everything runs: skills carry each step, hooks enforce the rules | A hook runs every time; a request in a prompt can be forgotten. Enforcement is what keeps the agent from drifting, and Claude Code's hooks make it possible |
| **[The Architect](https://github.com/Hainrixz/the-architect)** | The design interview | It asks the right questions and checks versions live, so the agent starts from facts instead of guesses. We keep its design and drop its build plan, which is ordered by layers |
| **[Spec Kit](https://github.com/github/spec-kit)** (GitHub) | The installer that puts our skills and hooks into a project | It is widely used and already does this job well, so we build on it instead of rebuilding it. We pin one tested version |
| **Plain Node and git** (`ppc`) | The checks, the sizes, whose turn it is | Rules must answer the same way every time, so they are ordinary code, not the agent's judgment; git is the record of what really happened |

**Where the ideas come from:**

| Idea | What pp-suite takes from it |
|---|---|
| **Spec-driven development** ([Spec Kit](https://github.com/github/spec-kit), [OpenSpec](https://github.com/Fission-AI/OpenSpec)) | Write it down before you build, so the agent works from a shared truth |
| **Agile and XP: vertical slices, the walking skeleton** (Alistair Cockburn), **tracer bullets** (*The Pragmatic Programmer*) | Something runs from the first slice, and every slice is a small, visible step you can review |
| **Test-driven development and [Kent Beck's augmented coding](https://www.kentbeck.com/summaries/augmented-coding-beyond-the-vibes/)** | Tests catch what an agent breaks. Beck reports agents deleting tests to get a green run, so in the strict cycle ours are locked |
| **[Technical debt](https://c2.com/doc/oopsla92.html)** (Ward Cunningham) | A shortcut is a loan: it is recorded, a person decides it, and a slice pays it |
| **[Architecture decision records](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions)** (Michael Nygard) | Decisions are short, dated and kept next to the design, so the *why* survives the project |
| **[Claude Code's best practices](https://code.claude.com/docs/en/best-practices)** | What must always happen belongs in a hook, not in a request |

## Status

Pre-alpha. Everything described above exists and has tests, and one real project was built with it. It has not been
used by a team or by anyone other than its author. [Roadmap](ROADMAP.md) · [glossary and principles](docs/glossary.md) ·
[the contract](docs/contract-v0.1.md).

**PP** means Pragmatic and oPtimized: **Architect.PP** is the design side and **SDD.PP** is the build side.

## Contributing

Issues and pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) first; to report a security problem, see
[SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE).
