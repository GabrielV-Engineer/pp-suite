# How it works

Status: this describes the **intended** flow. What exists today is marked in the [roadmap](../ROADMAP.md);
command names are provisional.

```
 IDEA ──► ARCHITECT.PP ────────────────► SDD.PP ───────────────────────────► CODE
          interview, stack, rules        vertical slices, TDD, debt, audit
               ▲                                   │
               └────── change request ─────────────┘
```

## You type `/pp`

Everything below is the engine. The person types one thing in the chat, `/pp`, and the assistant does the next step or puts the next
decision to them. `/pp` reads `ppc next --json`, then, by what is next: runs the skill of the agent's step, runs a plain `ppc`
command, tells the person what only they can do (The Architect's interview), or, for a decision, shows it in plain words
(`ppc show`), asks it in the question panel (`ppc ask`) and carries it out.

**What counts as a person deciding.** The option of the panel that carries a decision out ends with the exact command it stands for
(`Yes, approve it — ppc approve SL-001`). When the person picks it, a hook (`record_answer.py`) writes the answer into
`.sddpp/answers.jsonl`; the guard then lets exactly that command through, once, if the answer came from the same session and is less
than half an hour old, and marks it used. Without such an answer the guard behaves as before (Claude Code's own confirmation in the
modes where that was tried, a block in the others). The agent cannot write the ledger or send the panel a question that already
has its answers. Several approvals in one command need one answer each.

Status: the recorder, the guard and `ppc ask` are tested, including that the label commands `ppc ask` prints are exactly what the
guard accepts, and the recorder and guard were run through Spec Kit's real event dispatcher with a payload shaped like the one the
probe recorded. **A person has not yet clicked through the whole flow** (panel, then the approval running with no second prompt), and
pressing No on Claude Code's own confirmation has not been tried. It is a guard rail for an agent that cooperates, not a security
boundary: an agent that can edit `.claude/settings.json` could register a hook that writes the ledger.

## Per project

| Step | You | The AI |
|---|---|---|
| **1. Design** (The Architect) | Answer the interview, confirm the architecture | Proposes stack, data model, API, what is out of scope, risks |
| **2. Hand-off** (`/speckit-architect-pp-handoff`) | Review `.architect/`; decide each addition the tool made (`ppc decide-addition`) | Converts the blueprint to the contract, drops its step plan, flags additions; `ppc constitution` then writes the project rules into `CLAUDE.md` |
| **3. Slices** (`/speckit-sddpp-cycle-slices`) | **Approve the list** of slices before it is written, then approve each slice to start (`ppc approve-slice`) | Splits the design into thin vertical slices that fit the production-code budget, each with its "out of scope" |
| **4. Build** (per slice, `/speckit-sddpp-cycle-build`) | Nothing (optionally, read the tests) | Tests and code together in one session, small commits. The strict cycle (red tests you approve, then locked green) is an option per slice |
| **5. Close** (`/speckit-sddpp-cycle-audit`) | Review the audit; decide the proposed debt (`ppc approve-debt`) and when to pay it (`ppc schedule-debt`) | Records debt and deviations; `ppc finish` measures the size from git |
| **6. Design changes** | Decide (`ppc decide-change`) | If a slice finds the design wrong, it opens a change request; Architect.PP revises the design |

Three optional reviews, all by a model: `/speckit-sddpp-cycle-clarify` (what is unclear before building), `/speckit-sddpp-cycle-analyze` (read-only: contradictions and vague criteria the rules cannot see) and `/speckit-sddpp-cycle-converge` (read-only, before the audit: did the code do only what the slice promised).

Before each task the agent offers to prepare its prompts (`/speckit-sddpp-cycle-prompts`): the limits of that slice, from the design.

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

The engine behind `/pp`; a person rarely types these. Each command either changes the project or refuses and leaves it untouched. `--by` defaults to the git `user.name` everywhere.

| Command | Who runs it | What it does |
|---|---|---|
| `ppc approve [<id>] [--accept <reason> \| --drop [--reason <why>]]` | **a human** | The short form of the three approvals below. A slice id approves it to start, or its red tests when it is in progress in red; a `DEBT-` id decides the debt; with no id it takes the one decision that is waiting and refuses to guess when there are several. `--accept`, `--drop` and `--reason` are for a debt entry: on anything else the command is refused rather than approving |
| `ppc show <id>` | anyone | The card of what is being decided, in plain words: a slice (does, does not, checked by, waits for), its red tests, a debt entry or a change request |
| `ppc ask <id>` | anyone | The question for the panel that decides it: the options that carry out the decision end with the exact command. A debt option that accepts records the fixed reason "accepted in the panel"; one that drops, "dropped in the panel"; a change request that is rejected, "rejected in the panel" (the panel cannot carry free text; a person who wants their own words gives them to the assistant, which runs `ppc approve DEBT-… --drop --reason "<their words>"` and Claude Code asks them to confirm that command) |
| `ppc help [<command>]`, `ppc <command> --help` | anyone | The usage, or only the lines of that command; it does nothing else. Every command lists the options it takes and **refuses any other** (exit 2, nothing done) |
| `ppc next --json` | anyone | The same next step as data, for the `/pp` skill: `kind` is `decision`, `human-step`, `agent-step`, `run` or `none` |
| `ppc reread (--all \| <slice>...)` | **a human** | Says the person read what changed in the design since those slices were planned; sets their `blueprint_revision` to the current one, which clears `W03`. `ppc show reread` lists the change requests applied since. Only unfinished slices that are behind |
| `ppc approve-slice <slice> [--by <name>]` | **a human** | `planned` → `ready`. The only way a slice becomes ready to start |
| `ppc start <slice>` | anyone | `ready` → in progress, in the red phase (strict) or the build phase (light), and records the mode. Refuses a slice that is not approved, has unfinished dependencies, or when another slice is in progress |
| `ppc approve-red --by <name>` | **a human** | Strict only. Approves the committed red tests and enters green. Refuses if code is uncommitted |
| `ppc approve-debt <DEBT-ID> --by <name> [--accept <reason> \| --drop [--reason <why>]]` | **a human** | Decides on a debt entry the AI proposed: `open` (default), `accepted` (with a reason) or `dropped` (optionally with the reason, stored as `dropped_reason`) |
| `ppc refactor` | anyone | Strict only. green → refactor (tests stay locked) |
| `ppc finish <slice> --audit <file>` | anyone; **a human** to add `--budget-reason` or `--mutation-reason` | Closes the slice. The sizes (production and test lines) are **measured from git**, then the result is validated and checked against git; if anything is off, nothing changes. A refactor slice also marks the debt it pays as `paid` |
| `ppc mutation (--files a,b \| --slice <id>)` | anyone | Mutation-tests those files (or a finished slice's files) and prints the score and the mutants the tests missed. Changes nothing |
| `ppc additions` | anyone | The additions in plain words: what needs you first, then what a recommendation settles, with cost, what is lost and how hard it is to add later |
| `ppc decide-addition --accept-recommended [--but-cut <ids>] [--but-keep <ids> --reason <why>]`, or `<ADD-ID>... (--keep --reason <why> \| --cut)`; `--by` defaults to the git `user.name` | **a person**; an assistant may run it for what the person told it in the conversation | Keeps or cuts something the design contains that the person did not ask for (`.architect/additions.yaml`). The first form settles every group whose members were recommended the same way and decides the ones you name, in one command. Cutting records the decision; carrying it out in the design is a separate step. See [scope review](scope-review.md) |
| `ppc validate --design` | anyone | Judges only the design (`.architect/`) with the rules that concern it, before any slice or debt register exists. Used to check the hand-off |
| `ppc status` | anyone | What is in progress |
| `ppc next` | anyone | Whose turn it is (human, agent or anyone) and the exact command to run, from the slice's phase and the git history. Also lists what else waits for a person and which slices are blocked. Before the design exists (pp-suite installed, `.architect/` empty) it points at The Architect's interview and the hand-off |
| `ppc schedule-debt DEBT-ID --slice SL-NNN` | anyone | Assigns an approved (open) debt to a planned refactor slice that touches its component, and lists it in the slice's `pays` |
| `ppc change-request --slice ... --problem ... --proposal ... (--component ... \| --adr ... \| --qa ... \| --budgets)` | anyone | A slice asks for a design change; `--budgets` is for a change to the budgets or generated-file globs, which belong to no component. Records the revision it was opened at |
| `ppc decide-change CR-NNNN --accept \| --reject --reason ... --by <name>` | **a human** | Accepts or rejects it |
| `ppc apply-change CR-NNNN` | anyone | Marks an accepted request applied, once the design revision rose and the constitution is current |
| `ppc constitution [--check]` | anyone | Writes the short block of project rules (about 1,300 characters, nothing copied from the design) into `CLAUDE.md` |
| `ppc session` | the hook | Prints the state for the start of a session (what `ppc next` says, including "no design yet" in a project that is set up); silent where pp-suite is not installed. Claude Code adds it to the conversation |
| `ppc init [--apply] [--shim]` | anyone | Checks the machine and project against pinned versions; sets them up |
| `ppc prompt [<slice>] [--task <t>]` | anyone | Writes the system, negative and (when it applies) design prompt for one task under `.sddpp/prompts/`. Offered files: edit or ignore them; it will not overwrite without `--force` |
| `ppc overview` | anyone | One screen: slices by status, progress per capability, debt per component, contract problems |

Approvals are human-only. The guard stops the agent from running `ppc approve-*` unless the person chose that command in the panel, and blocks it from writing any
field that records a human decision into `.sddpp/`; in the default, accept-edits and auto permission modes
Claude Code shows the person the exact command and asks, and if nobody answers the command does not run ([spike](ask-spike.md) and [probe](ask-panel-probe.md): a person saw the dialog in the VS Code extension, in auto mode, and pressed Yes; pressing No was not tried). In any other mode the guard blocks and the person runs the command in a terminal (the CLI
also takes it after `!`; the VS Code extension has no `!`). Like the test lock, this stops an agent that
cooperates; it is not a security boundary.

One exception, by the owner's decision (2026-10-30): `ppc decide-addition`. What a person tells the assistant in the conversation
about the additions counts as permission, so the guard lets the assistant run that command; the project rules tell it to run it only
for what the person said. Nothing checks that it was said, and nothing in `additions.yaml` records whether the person or the
assistant typed it. Writing a decision into the file by hand stays blocked.

## Where things live

Everything is files in the repository, so a session can end and the next one picks up from `ppc next`
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
