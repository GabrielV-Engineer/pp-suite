# How it works

Status: this describes the **intended** flow. What exists today is marked in the [roadmap](../ROADMAP.md);
command names are provisional.

```
 IDEA ──► ARCHITECT.PP ────────────────► SDD.PP ───────────────────────────► CODE
          interview, stack, rules        vertical slices, TDD, debt, audit
               ▲                                   │
               └────── change request ─────────────┘
```

## Per project

| Step | You | The AI |
|---|---|---|
| **1. Design** (`/architect`) | Answer the interview, confirm the architecture | Proposes stack, data model, API, what is out of scope, risks |
| **2. Hand-off** | Review `.architect/` | Extracts capabilities, components, decisions and rules; derives the project constitution |
| **3. Slices** (per capability) | **Approve** the spec, the plan and the slice list | Writes them; splits the work into vertical slices that fit the production-code budget |
| **4. Red** (per slice) | **Read and approve the tests.** This is the one thing to read carefully | A separate subagent writes failing tests only; one `red` commit |
| **5. Green** | Nothing | The guard locks the tests; production code only, as little as it takes; one `green` commit |
| **6. Close** | Review the audit pack; approve or reject proposed debt | Refactors in its own commit, runs mutation testing, records debt in the component's register, regenerates the WBS |
| **7. Design changes** | Decide | If a slice finds the design wrong, it opens a change request back to step 1 |

## Two cycles: light and strict

A work slice follows one of two cycles. The blueprint's `default_mode` sets it (absent means strict, so projects
written before the light mode behave as they did), and a slice can set its own `mode`. `ppc start` records the mode it
applied in the slice.

| | Light | Strict |
|---|---|---|
| Phases | `build` | `red` → `green` (→ `refactor`) |
| Who writes tests | The agent, together with the code, in one session | A separate step writes failing tests first |
| A person reads the tests before the code | No | Yes: `ppc approve-red` |
| Tests locked while the code is written | No | Yes (the guard, `C02`, `C06`, `C07`) |
| Test policy (`required`, `optional`, `none`) | Applies at `ppc finish` | Applies too |
| Mutation gate, budget, debt, audit | Same | Same |
| Commit kinds | `build` | `red`, `green`, `refactor` |
| Cost seen so far | Not measured | 2.5 times a plain prompt in experiment 1 |

What the light cycle gives up is the lock: an agent that changes a test to make it pass leaves no trace until a person
reads the diff. What still protects the project is the test policy, the optional mutation gate, the size budget and the
audit. Whether that is enough is untested; the strict cycle stays available per slice for work where it is not.

## The slice cycle, as commands

Each command either changes the project or refuses and leaves it untouched.

| Command | Who runs it | What it does |
|---|---|---|
| `ppc approve-slice <slice> --by <name>` | **a human** | `planned` → `ready`. The only way a slice becomes ready to start |
| `ppc start <slice>` | anyone | `ready` → in progress, in the red phase (strict) or the build phase (light), and records the mode. Refuses a slice that is not approved, has unfinished dependencies, or when another slice is in progress |
| `ppc approve-red --by <name>` | **a human** | Strict only. Approves the committed red tests and enters green. Refuses if code is uncommitted |
| `ppc approve-debt <DEBT-ID> --by <name> [--accept <reason> \| --drop]` | **a human** | Decides on a debt entry the AI proposed: `open` (default), `accepted` (with a reason) or `dropped` |
| `ppc refactor` | anyone | Strict only. green → refactor (tests stay locked) |
| `ppc finish <slice> --audit <file>` | anyone; **a human** to add `--budget-reason` or `--mutation-reason` | Closes the slice. The sizes (production and test lines) are **measured from git**, then the result is validated and checked against git; if anything is off, nothing changes. A refactor slice also marks the debt it pays as `paid` |
| `ppc mutation (--files a,b \| --slice <id>)` | anyone | Mutation-tests those files (or a finished slice's files) and prints the score and the mutants the tests missed. Changes nothing |
| `ppc decide-addition <ADD-ID> (--keep --reason <why> \| --cut) --by <name>` or `--accept-recommended --by <name>` | **a human** | Keeps or cuts something the design contains that the person did not ask for (`.architect/additions.yaml`). Cutting records the decision; carrying it out in the design is a separate step. See [scope review](scope-review.md) |
| `ppc validate --design` | anyone | Judges only the design (`.architect/`) with the rules that concern it, before any slice or debt register exists. Used to check the hand-off |
| `ppc status` | anyone | What is in progress |
| `ppc next` | anyone | Whose turn it is (human, agent or anyone) and the exact command to run, from the slice's phase and the git history. Also lists what else waits for a person and which slices are blocked |
| `ppc change-request --slice ... --problem ... --proposal ...` | anyone | A slice asks for a design change. Records the revision it was opened at |
| `ppc decide-change CR-NNNN --accept \| --reject --reason ... --by <name>` | **a human** | Accepts or rejects it |
| `ppc apply-change CR-NNNN` | anyone | Marks an accepted request applied, once the design revision rose and the constitution is current |
| `ppc constitution [--check]` | anyone | Writes Spec Kit's constitution from the design |
| `ppc init [--apply] [--shim]` | anyone | Checks the machine and project against pinned versions; sets them up |
| `ppc prompt [<slice>] [--task <t>]` | anyone | Writes the system, negative and (when it applies) design prompt for one task under `.sddpp/prompts/`. Offered files: edit or ignore them; it will not overwrite without `--force` |
| `ppc overview` | anyone | One screen: slices by status, progress per capability, debt per component, contract problems |

Approvals are human-only. The guard blocks the agent from running `ppc approve-*` and from writing any
field that records a human decision into `.sddpp/`; the human runs the command themselves (in Claude
Code, prefix it with `!`). Like the test lock, this stops an agent that
cooperates; it is not a security boundary.

## Where things live

Everything is files in the repository, so a session can end and the next one picks up from `wbs.md`
and the slice files. See [contract-v0.1.md](contract-v0.1.md) for the layout.

## Other kinds of work

- **Existing project:** `/architect-brownfield` maps the repo first; slices start with characterization
  tests of the current behavior.
- **A bug:** a `fix` slice that starts from a test reproducing it; no design phase.
- **Exploring an idea:** a `spike`: time-boxed, no TDD, thrown away; only its `outcome` is kept.

## What enforces what

| Property | Enforced by | Strength |
|---|---|---|
| Tests are not edited during GREEN | The guard (`PreToolUse` hook) | A guard rail: stops a cooperating agent only |
| Tests were not edited during GREEN | `ppc check-git`, in CI | The real check, read from git history |
| Traceability and lifecycle rules | `ppc validate`, in CI | Mechanical |
| Human approvals | `approved_by` fields, checked for presence | A record, not a signature |
