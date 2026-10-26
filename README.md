# pp-suite

**The Pragmatic and Optimized suite for building software with AI coding agents without losing control of the code.**
Design first, build in thin slices, and keep people in charge of the decisions that matter.

It is for any engineer who wants to work in an organized, organic and controlled way, building on what already works
(spec-driven and test-driven development) and avoiding the waterfall model: a design that is decided once and never
revisited, and built all at once.

> **Status: pre-alpha.** Everything below exists and is tested, and a first small comparison against vibecoding and Spec Kit
> alone is in [How it compares](#how-it-compares). Each piece was tried only once or twice, on small examples, with a stand-in
> for the human reviewer. See [Status and honesty](#status-and-honesty).

## The problem

AI agents write code fast. The problems that follow are known: over-engineered designs, a stack picked without criteria,
1,000-line commits, tests rewritten until they pass, features nobody asked for, and no overview of the code after a few
weeks. pp-suite attacks those with rules a tool can check, not only with advice to the model.

## How it compares

We made the same small change (reject empty and over-long task titles) in the demo project three ways, starting from the same code
and the same one-paragraph request: **vibecoding** (just ask the AI, no method), **Spec Kit alone** (its standard flow), and **pp-suite**.
Every result was checked from the outside with the same tests, plus eight extra edge-case checks nobody had seen.

| | Vibecoding | Spec Kit alone | pp-suite |
|---|---|---|---|
| Does the code work and pass its checks? | yes | yes | yes |
| Time a person needs to review one feature (estimate) | 20 to 30 min | 2 to 3 hours | 40 to 60 min |
| How much code changed | small | about 3 times more | the smallest |
| Did it change the design or the database on its own? | no | **yes** | no, and a check now catches it |
| Are the decisions written down? | no | yes, in nine long documents | yes, short, next to the work |
| Edge cases handled (8 checks) | 8 | 8 | 7: one left out on purpose and said so |

In plain words:

- **On a change this small, all three write code that works.** The AI is already good at small things, so no method made the
  code better here. Nobody should expect it to.
- **Vibecoding is the quickest to review and leaves no trail.** Nothing says why anything was done, which is where it starts to hurt.
- **Spec Kit alone leaves the biggest pile to read.** It also rewrote the design document and removed a rule from the database
  without anyone deciding it.
- **pp-suite keeps what each does well and drops the rest.** From vibecoding, one quick build session. From Spec Kit, written
  decisions, but short and attached to the feature instead of nine documents. On top, it will not let a build quietly rewrite the
  design or reach into another part of the system. That is what *pragmatic and optimized* means here: the smallest process that
  keeps the work under control, not the biggest.

Times are estimates from the size of what each way produced, not measurements of a person. Details: [the full test](docs/e2e-test-report.md).

## What two weeks would look like (an estimate)

One small test cannot show how a method behaves over weeks, so this is arithmetic on the numbers above, plus the problems each approach is
already known for. It is not a measurement. Say 20 features in two weeks.

| For about 20 features | Vibecoding | Spec Kit alone | pp-suite |
|---|---|---|---|
| A person's time to review and decide | 6 to 9 hours | 36 to 64 hours | 13 to 19 hours |
| Written records to keep in step with the code | none | about 150,000 words | about 16,000 words |
| Quiet changes to the design or the database | none seen | seen in the one feature we tried | none seen, and checked automatically |

What usually goes wrong, and where each way would be expected to end up:

- **Vibecoding:** after a week nobody remembers why things are the way they are; tests get weakened without anyone noticing
  ([Kent Beck reports agents deleting them](https://www.kentbeck.com/summaries/augmented-coding-beyond-the-vibes/)); and an open request
  grows (our second experiment saw 4.6 times the code). Time to review stays low and the risk piles up unseen.
- **Spec Kit alone:** the documents drift away from the code, and they are heavy even for small changes
  ([one team got 1,300 lines of spec to show the current date](https://marmelab.com/blog/2025/11/12/spec-driven-development-waterfall-strikes-back.html)).
  Reviews also get too big to be effective: past a few hundred lines
  [reviewers stop finding problems](https://smartbear.com/learn/code-review/best-practices-for-peer-code-review/).
- **pp-suite:** each feature is small and stands alone, so the cost of one does not grow as the project grows; the design is protected
  from drifting; the record is short enough to be kept. The price is that a person decides something on every feature (about
  50 minutes), and a narrow feature can leave a small gap that someone has to schedule.

Whether that pays back over many weeks is the open question. The way to find out is to use it on a long, real project.

## The names, spelled out

**PP means Pragmatic and oPtimized.** *Pragmatic*: keep what already works (spec-driven and test-driven development), use rules a
tool can check, and delete the rest. *Optimized*: the smallest process that keeps the work under control.

| Name | Stands for | What it is |
|---|---|---|
| **pp-suite** | the **P**ragmatic and o**P**timized suite: the whole project | The method, the two parts below, the contract between them and the tool |
| **Architect.PP** | the **P**ragmatic and o**P**timized **Architect**: the *design* side | Takes the design that [The Architect](https://github.com/Hainrixz/the-architect) produces, turns it into a checked, machine-readable form, and lets a person decide what stays |
| **SDD.PP** | **P**ragmatic and o**P**timized **S**pec-**D**riven **D**evelopment: the *build* side | Plans the work in thin slices from that design and builds them with an AI agent, with people approving at the key points |
| **The contract** | the agreement between the two sides | Versioned file formats (JSON Schemas) for the design (`.architect/`) and the plan (`.sddpp/`). Neither side imports the other |
| **`ppc`** | **p**p-suite **c**ontract tool | The command line that checks the contract, runs each step of a slice, and tells you whose turn it is |
| **Spec Kit** | GitHub's [Spec Kit](https://github.com/github/spec-kit) | The host: it installs our skills and hooks into Claude Code |
| **The Architect** | the upstream project by Hainrixz | An interview that ends in a full design (stack, data model, API, risks) |

## The idea in one picture

```
 your idea
    │
    ▼
 The Architect ──► Architect.PP ───────────────────────────────► SDD.PP ───────────────────► code
 (interview and    hand-off: design → checked contract           plan the slices from the design
  full design)     you decide what stays of what the tool added  for each slice: you approve it → an agent
                   project rules written into CLAUDE.md          builds it → audit → you decide the debt
                         ▲                                                    │
                         └────── change request: "the design is wrong" ◄──────┘
```

Three ideas run through it:

1. **Design first, but the design can change.** A slice that finds the design wrong opens a *change request*. A person
   decides; the design is revised, its revision number goes up, and slices planned against the old one are flagged.
2. **Thin slices, not layers.** A slice is one thing a person can see, built through every layer it needs. The first one
   is the thinnest system that runs end to end (the *walking skeleton*). Each slice states what it does **not** do.
3. **People decide; agents propose.** Approving a slice, keeping or cutting something the tool added, accepting technical
   debt, an exception to a size budget, a change to the design: an agent cannot record any of these. A hook blocks it.

## What you do and what the agent does

| Step | You | The agent | Files |
|---|---|---|---|
| 0. Install, once | `ppc init . --apply` | — | `.specify/`, `.claude/skills/`, the guard hook |
| 1. Design | Answer The Architect's interview | Researches, proposes the full design | `blueprint.md` |
| 2. Hand-off | Read `.architect/` | `/speckit-architect-pp-handoff` converts it and flags what you never asked for | `.architect/` (blueprint, architecture, decisions, `additions.yaml`) |
| 3. Scope | `ppc decide-addition`: keep or cut each addition (overlapping ones together) | `/speckit-architect-pp-apply-cuts` carries out the cuts. `ppc constitution` writes the project rules | the rules block in `CLAUDE.md` |
| 4. Slices | Approve the list, then each slice (`ppc approve-slice`) | `/speckit-sddpp-cycle-slices` proposes the slices | `.sddpp/slices/` |
| 5. Build | — | `/speckit-sddpp-cycle-build`: tests and code together, small commits | code, tests |
| 6. Close | Decide the debt (`ppc approve-debt`, `ppc schedule-debt`) | `/speckit-sddpp-cycle-audit`; `ppc finish` measures the size from git | `.sddpp/debt.yaml` |
| 7. Design was wrong | `ppc decide-change` | `ppc change-request`, then `/speckit-architect-pp-apply-change` | `.sddpp/change-requests/` |

You only need to remember one command: **`ppc next`**. It says whose turn it is and the exact command to run.
`ppc overview` shows where the project stands. Three optional reviews by a model:
`/speckit-sddpp-cycle-clarify` (what is unclear), `-analyze` (read-only: contradictions and vague criteria the rules cannot
see) and `-converge` (read-only: did the code do only what the slice promised).

Each slice follows one of two cycles. **Light** (the default for new projects): tests and code together in one session.
**Strict** (optional per slice): failing tests first, which you read and approve, then code with the tests locked.

## How Claude Code uses it

| Mechanism | What it is | Does |
|---|---|---|
| **Skills** (`/speckit-...`) | Markdown prompts that Spec Kit turns into Claude Code skills | Tell the model what to read, write and not do in each step |
| **Hooks** | Programs Claude Code runs at set moments | Before every tool call (the guard): blocks an agent from running `ppc approve-*` or `ppc decide-*`, from writing a decision field, and, in the strict cycle, from editing the tests. At the start of every session: shows whose turn it is (`ppc session`) |
| **Scripts** (`ppc`) | Plain Node code, no AI | Measures sizes from git, runs each transition, generates the prompts and the rules |
| **Rules** | `ppc validate` and `ppc check-git` | Check the contract and compare every audit with the real git history |
| **`CLAUDE.md`** | One short block (about 1,300 characters), generated | Where the design is and how to work: run `ppc next`, what only a person decides. It copies nothing from the design |

There are no webhooks, servers or network calls of our own: everything runs on your machine, with files, hooks and git.
The guard is a guard rail, not a security boundary; `ppc check-git` is the backstop.

## It builds on existing tools; it does not replace them

No upstream code is copied. Why these bases and not others: [upstream-analysis](docs/upstream-analysis.md).

- **Spec-driven development** (Spec Kit, Kiro, OpenSpec and others) is the family pp-suite belongs to. It is popular, and
  [Thoughtworks placed it in "Assess"](https://www.thoughtworks.com/en-au/radar/techniques/spec-driven-development) (worth
  exploring, not yet adopted); critics warn that it can turn into waterfall with heavy up-front documents. pp-suite plans the
  slices from a design and keeps them small to stay away from that.
- **Test-driven development** is the practice with the most supporting evidence I found for working with AI agents
  ([Kent Beck](https://www.kentbeck.com/summaries/augmented-coding-beyond-the-vibes/) also reports agents deleting tests to get a
  green run). The strict cycle and the test policy come from it.
- **Claude Code's own guidance** says `CLAUDE.md` is advisory and what must always happen belongs in hooks
  ([best practices](https://code.claude.com/docs/en/best-practices)). That is how the guard works.

How the others teach Claude Code to use them, as far as their documentation shows: Spec Kit installs skills (slash commands)
into `.claude/skills/` plus a `.specify/` folder; [OpenSpec](https://github.com/Fission-AI/OpenSpec) installs skills and
slash commands into `.claude/` plus an `openspec/` folder with a `config.yaml`. pp-suite does the same, and adds a guard hook,
a hook that shows the project's state when a session starts, and a short block of rules in `CLAUDE.md`, so a session starts
oriented without anyone typing a command.

What pp-suite adds, as far as the sources I checked show: the review of what the tool added to the design, human decisions
protected by a hook, sizes measured from git, and a contract with a validator.

## Status and honesty

**Built and tested** (hundreds of unit tests; each rule is broken on purpose to check a test fails): the contract and its
validator; the slice cycle (light and strict) and its guard; the test policy; technical debt in one register; mutation
testing as an optional gate; the hand-off from The Architect; the scope review; change requests; the project rules in
`CLAUDE.md`; the per-slice prompts; the install command with pinned versions; the three optional model reviews; and two checks
that a build does not edit the design or change the files of a part of the system it did not say it would touch.

**Tried with real agents, once or twice each:** the hand-off (three runs on one real design), cutting additions, applying a
design change, planning slices from a design, and the three reviews.

**What is shown so far, and how far**
- A 45-run experiment found that on thin slices the strict cycle did not produce better tested or more focused code than a
  plain prompt, and cost 2.5 times as much: [experiment report](docs/experiment-report.md).
- A second one found that a written, narrow slice does keep an agent from building what an ambitious request invites
  (4.6 times the code, soft delete, paging, search): [report 2](docs/experiment-report-2.md).
- A small three-way test on the demo project (above): the same quality of working code, a smaller change, the design left alone and
  a short written record, with an estimated review time between the other two:
  [the full test](docs/e2e-test-report.md). A first check that a project's rules in `CLAUDE.md` orient an agent:
  [orientation-check](docs/orientation-check.md).

**Not yet done:** a long real project (the two-week picture above is an estimate); any trial with a real novice; macOS and Windows. Decisions in the tests and fixtures were made under a test name, not by a person. See the [roadmap](ROADMAP.md).

## Try it

Requires Node 22+, Python 3, git and [Spec Kit](https://github.com/github/spec-kit) at the pinned commit
(`install/versions.json`).

```bash
cd tools/ppc && npm ci && npm test               # validator, steps, git checks, install, docs consistency
node bin/ppc.mjs validate ../../examples/todo-app --strict
node bin/ppc.mjs rules                           # every rule the validator can emit
node bin/ppc.mjs init <your-project>             # report what is missing; add --apply to set it up
cd ../.. && python3 -m unittest discover -s sdd-pp/extension/sddpp-guard/tests
```

Details: [install](install/README.md), [how it works](docs/how-it-works.md), [the contract](docs/contract-v0.1.md).

## Words used here

| Word | Meaning |
|---|---|
| **Blueprint** | The design as data: capabilities, components, quality attributes, non-goals (`.architect/blueprint.yaml`) |
| **Capability** (`CAP-001`) | Something a person can do with the system |
| **Quality attribute** (`QA-001`) | A measurable target: a metric and a number |
| **Non-goal** | Something the system deliberately does not do |
| **ADR** (`ADR-0001`) | Architecture Decision Record: a costly-to-reverse decision, with the alternatives rejected |
| **Addition** (`ADD-001`) | Something in the design that the person never asked for, listed so they can keep or cut it |
| **Slice** (`SL-001`) | One thin, visible piece of behavior built through all its layers |
| **Hand-off** | Converting The Architect's design into the contract |
| **Change request** (`CR-0001`) | A slice's request to change the design |
| **Technical debt** (`DEBT-BE-001`) | A known shortcut, recorded; the agent proposes it, a person decides |
| **Mutation testing** | Breaking the code on purpose to see whether the tests notice |
| **Walking skeleton** | The thinnest system that runs end to end |

## What is in this repo

```
contract/v0.1/schemas/   the contract, as JSON Schemas
tools/ppc/               the pp-suite contract tool (Node): validator, steps, install
tools/eval/              the measuring code of the experiments
architect-pp/            Architect.PP: the extension (hand-off, cuts, design changes) and real fixtures
sdd-pp/                  SDD.PP: the guard and the slice cycle, as Spec Kit extensions
install/                 pinned versions
examples/todo-app/       a worked example of every artifact
docs/                    the contract, how it works, reports of every experiment and spike
```

## Principles

1. **Rules a tool checks beat advice.** If a rule can be verified mechanically, it is.
2. **Thin slices, not layers.** One observable behavior through the layers it needs.
3. **People decide; agents propose.** And a hook, not a request, keeps it that way.
4. **One owner per file.** The design belongs to Architect.PP, the plan to SDD.PP; they talk through change requests.
5. **Debt is visible.** The agent proposes it; a person decides, and when to pay it.
6. **Pragmatic: delete before you automate.** Each piece has to earn its place; several were removed after review.
7. **Be honest about strength.** The guard is a guard rail, not a lock, and nothing here is claimed to help until measured.

## License

[MIT](LICENSE).
