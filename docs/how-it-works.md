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

## The slice cycle, as commands

Each command either changes the project or refuses and leaves it untouched.

| Command | Who runs it | What it does |
|---|---|---|
| `ppc approve-slice <slice> --by <name>` | **a human** | `planned` → `ready`. The only way a slice becomes ready to start |
| `ppc start <slice>` | anyone | `ready` → in progress, red phase. Refuses a slice that is not approved, has unfinished dependencies, or when another slice is in progress |
| `ppc approve-red --by <name>` | **a human** | Approves the committed red tests and enters green. Refuses if code is uncommitted |
| `ppc approve-debt <DEBT-ID> --by <name> [--accept <reason> \| --drop]` | **a human** | Decides on a debt entry the AI proposed: `open` (default), `accepted` (with a reason) or `dropped` |
| `ppc refactor` | anyone | green → refactor (tests stay locked) |
| `ppc finish <slice> --audit <file>` | anyone; **a human** to add `--budget-reason` or `--mutation-reason` | Closes the slice. The sizes (production and test lines) are **measured from git**, then the result is validated and checked against git; if anything is off, nothing changes. A refactor slice also marks the debt it pays as `paid` |
| `ppc mutation (--files a,b \| --slice <id>)` | anyone | Mutation-tests those files (or a finished slice's files) and prints the score and the mutants the tests missed. Changes nothing |
| `ppc validate --design` | anyone | Judges only the design (`.architect/`) with the rules that concern it, before any slice or debt register exists. Used to check the hand-off |
| `ppc status` | anyone | What is in progress |
| `ppc next` | anyone | Whose turn it is (human, agent or anyone) and the exact command to run, from the slice's phase and the git history. Also lists what else waits for a person and which slices are blocked |
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
