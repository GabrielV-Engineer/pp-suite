# Contract v0.1

The contract is the only interface between **Architect.PP** (designs) and **SDD.PP** (builds). The two
never import each other's code; they only agree on these files. Schemas live in
[`contract/v0.1/schemas/`](../contract/v0.1/schemas); `ppc validate` checks them plus the
cross-reference rules below.

Status: **v0.1, unstable.** Expect breaking changes until v1.0.

## Layout and ownership

```
.architect/                      written by Architect.PP, read-only for SDD.PP
  blueprint.yaml                 manifest: capabilities, components, quality attributes, budgets
  brief.md  architecture.md  glossary.md
  decisions/ADR-0001-*.md        decisions with rejected alternatives
  evidence/EV-001-*.md           sourced claims behind recommendations, with an expiry date
.sddpp/                          written by SDD.PP
  slices/SL-001-*.md             one file per slice: the leaves of the WBS
  debt/<component>.yaml          one register per component (the source of truth)
  debt/<component>.md            generated table (do not edit)
  change-requests/CR-0001-*.md   how SDD.PP asks for a blueprint change
  active.json                    {slice, phase}: machine state read by the test-lock guard
  wbs.md                         generated work breakdown (do not edit)
```

SDD.PP never edits `.architect/`. If a slice finds the design wrong or silent, it opens a **change request**; the
blueprint `revision` is bumped when Architect.PP applies it. The life of a request:

| Status | How it gets there | Who |
|---|---|---|
| `open` | `ppc change-request --slice ... --problem ... --proposal ...` (records the design revision it was opened at) | an agent or a person |
| `accepted` / `rejected` | `ppc decide-change CR-NNNN --accept` or `--reject --reason ...` | **a person**; the guard blocks agents |
| `applied` | `/speckit-architect-pp-apply-change CR-NNNN` revises `.architect/` and raises `revision`; then `ppc apply-change` checks that the revision rose (`T17`) and that the constitution follows the design | Architect.PP, then the tool |

Slices planned against the older revision are flagged (`W03`, and listed by `ppc next`); nothing updates their
`blueprint_revision` automatically, since that is the reader saying "I read what changed".

**The constitution.** `ppc constitution` writes Spec Kit's `.specify/memory/constitution.md` from the design: the
decisions in force, the non-goals, the component boundaries, the quality targets, the slice budget, the default cycle and
the test policy. It is the same text every time and its version is the blueprint revision. It refuses while additions
are undecided (it would bind the plan to things the person may cut) and never replaces a hand-written file without
`--force`. `ppc constitution --check` verifies it is current. Do not write it with `/speckit-constitution`.

Spec Kit's own folders (`.specify/`, `specs/`) coexist with these and are not governed by the contract.

## Identifiers

| Kind | Format | Example |
|---|---|---|
| Capability | `CAP-NNN` | `CAP-001` |
| Quality attribute | `QA-NNN` | `QA-001` |
| Constraint | `CON-NNN` | `CON-001` |
| Component | lowercase slug, plus a 2–5 letter `code` | `frontend` / `FE` |
| Slice | `SL-NNN` | `SL-002` |
| Debt | `DEBT-<component code>-NNN` | `DEBT-FE-001` |
| ADR | `ADR-NNNN` | `ADR-0001` |
| Evidence | `EV-NNN` | `EV-001` |
| Change request | `CR-NNNN` | `CR-0001` |

A file name starts with its id (`SL-002-create-and-list-tasks.md`). Ids are never reused.

## Slices

A slice is a thin vertical cut: **one observable behavior through the layers it needs** (not always all
of them). Every leaf of the work breakdown is a slice.

| Type | Purpose | Requires |
|---|---|---|
| `skeleton` | First end-to-end path, deployed and checked by CI | acceptance criteria |
| `feature` | New behavior for a capability | capability, acceptance criteria |
| `refactor` | Pays technical debt; behavior does not change | `pays` (debt ids) |
| `spike` | Time-boxed exploration, discarded | `timebox_hours` (≤ 8), `disposable: true` |
| `fix` | Repairs a defect, starting from a test that reproduces it | acceptance criteria |

Status flow: `planned` → `ready` → `in_progress` → `done` (or `dropped`).

- `ready` and later need `approved_by`: a human approved the slice to start (`ppc approve-slice`).
- `in_progress` needs a `phase`: `red` (tests only), `green` (production code only), `refactor`.
- From `green` on, work slices need `red_approved_by`: a human approved the RED tests first.
- `done` needs an **audit** (commits, production lines, test lines, tests added, mutation score, decisions,
  debt created, deviations). A spike instead records its `outcome`.
- A slice may carry `spec: { file, story }`, the Markdown file and the heading of the user story it delivers
  (`T15` checks that both exist). It is optional: it is the contract's link from a slice to its story.
- A slice may carry `test_policy` (`required`, `optional` or `none`), which overrides the blueprint's. See
  "Test policy" below.
- Only one slice may be in progress at a time, and `.sddpp/active.json` must match it.
- Transitions are made with `ppc approve-slice`, `start`, `approve-red`, `refactor` and `finish` (see
  [how-it-works](how-it-works.md)); each one changes the project or, if the result would be invalid, nothing.

## Technical debt

One YAML register per component; an entry lives only in its owner's file, and `also_affects` links the
others. Status flow: `proposed` → `open` → `scheduled` → `paid` (or `accepted` / `dropped`).

- Anything beyond `proposed` needs `approved_by`: the AI proposes, a human decides (`ppc approve-debt`).
- `accepted` needs `accepted_reason`; `scheduled` and `paid` need `paid_by` (a refactor slice that lists
  the debt in `pays`).
- `origin` says where it came from: a `slice`, a `decision` (ADR), the `blueprint`, or an `audit`.

## Rules checked by `ppc validate`

Errors fail validation; warnings fail only with `--strict`. `ppc rules` prints this table.

| Rule | Severity | Meaning |
|---|---|---|
| `PARSE` | error | A file could not be parsed. |
| `SCHEMA` | error | An artifact does not match its JSON Schema. |
| `R00` | error | A required file is missing. |
| `D01` | error | Components depend on each other in a circle. |
| `D02` | error | A dependency between components points the wrong way for their kind (a frontend reaching the database, or a database depending on the layers above it). |
| `D03` | warning | The design is larger than the complexity budget of its declared level (lite: 4 components, 8 capabilities, 5 quality attributes; standard: 8, 20, 8). The limits are heuristics I chose, not the result of a study. |
| `D04` | warning | Every capability is a must (with four or more capabilities), so nothing was prioritized. |
| `R01` | error | A component has no debt register file. |
| `T01` | error | A slice references a capability that does not exist. |
| `T02` | error | A slice references a component that does not exist. |
| `T03` | error | A slice references a quality attribute that does not exist. |
| `T04` | error | A slice depends on a slice that does not exist. |
| `T05` | error | Slice dependencies contain a cycle. |
| `T06` | error | A capability has no slice (no requirement without a slice). |
| `T07` | error | A component references an unknown requirement or component. |
| `T08` | error | An ADR references an unknown driver, evidence or ADR. |
| `T09` | error | A debt entry is inconsistent with its component, origin or paying slice. |
| `T10` | error | A refactor slice pays a debt entry that does not point back at it. |
| `T11` | error | A change request references an unknown slice, component, ADR or quality attribute. |
| `T12` | error | An id is duplicated, or a file name does not match its id. |
| `T13` | error | A slice audit references unknown decisions or debt, or debt with the wrong origin. |
| `T14` | error | A slice was planned against a blueprint revision that does not exist yet. |
| `T15` | error | A slice points at a spec file or a user story that does not exist. |
| `T16` | error | A closed work slice changed no test files although its test policy is required. |
| `T17` | error | A change request is marked applied but the design revision has not risen since it was opened. |
| `L01` | error | A slice has a phase while it is not in progress. |
| `L02` | error | The audit commits of a strict slice are not ordered red before green. |
| `L06` | error | The phase of a slice does not belong to its mode (build is for light slices, red and green for strict ones). |
| `L03` | error | `active.json` is missing or does not match the slice in progress. |
| `L04` | error | More than one slice is in progress. |
| `L05` | error | A debt entry is marked paid but its paying slice is not done. |
| `B01` | error | A slice exceeded the production-code budget without a recorded reason. |
| `M01` | error | A slice mutation score is below the blueprint gate without a recorded reason. |
| `C01` | error | An audit commit does not exist in the git history. (`ppc check-git`) |
| `C02` | error | A green, refactor or structural commit touches a test file. (`ppc check-git`) |
| `C03` | error | A red commit touches production code. (`ppc check-git`) |
| `C04` | error | The audit `production_lines` or `test_lines` do not match what the commits changed. (`ppc check-git`) |
| `C05` | error | The red commit is not an ancestor of the green commit. (`ppc check-git`) |
| `C06` | error | A test file changed between the approved red commit and the end of the slice, whether or not the audit lists the commit that changed it. (`ppc check-git`) |
| `C07` | error | The test script in `package.json` changed between the approved red commit and the end of the slice. (`ppc check-git`) |
| `A01` | error / warning | An ADR lacks a required section (error when accepted, warning otherwise). |
| `W01` | warning | A work slice does not state what it leaves out of scope. |
| `W02` | warning | Evidence has expired and must be re-checked. |
| `W03` | warning | An unfinished slice was planned against an older blueprint revision. |
| `W04` | warning | A slice has many acceptance criteria and probably needs splitting. |
| `W05` | warning | A quality attribute is not referenced by any live slice, so nothing plans to deliver or verify it. |
| `W06` | warning | A closed work slice changed no test files and no test debt entry is recorded about it, under an optional test policy. |
| `X01` | warning / error | An addition is still undecided (a warning while the design is drafted, an error once slices exist). |
| `X02` | error | A cut addition was applied but something that only it justified is still in the design. |
| `X03` | error | A cut addition was applied but the non-goal it becomes is not among the non-goals. |
| `X04` | warning / error | An addition was decided to be cut but the cut was not applied (a warning while drafting, an error once slices exist). |
| `X05` | error | An addition points at something that does not exist (a design id, or another addition it overlaps), or its id is duplicated. |
| `G01` | error | A generated view is missing or stale (`ppc generate` fixes it). |

Cross-reference rules run only when `blueprint.yaml` itself is valid, since everything else points at it.

### Checking audits against git

`ppc validate` reads the audit as written. `ppc check-git` makes it a fact, by reading the real history
of the repository the project lives in, for every slice that has an audit:

- every listed commit exists (`C01`);
- a `green`, `refactor` or `structural` commit changes no test file (`C02`): tests are locked after the red
  phase, refactoring included. If a test has to change, the red phase reopens;
- a `red` commit changes no production code (`C03`);
- `production_lines` and `test_lines` equal the lines added plus deleted, in hand-written production code and
  in test files, across the listed commits; renames count as a delete plus an add and binary files as zero
  (`C04`). Contract bookkeeping (`.sddpp/`, `.architect/`) and generated lockfiles are neither measured nor
  checked. **Only `production_lines` counts against the budget** (`max_slice_production_lines` in the
  blueprint): a slice may carry large tests, but then `test_lines` tells the reviewer how much there is to read;
- the first `red` commit is an ancestor of the first `green` commit (`C05`).

### Mode: light and strict

The blueprint may set `default_mode` (`light` or `strict`; absent means strict) and a slice may set `mode`. `ppc start`
writes the mode it applied into the slice, so changing the default later does not rewrite history.

- **Strict** (red → green → refactor): `red_approved_by` is required from green on; `L02` requires the red commit before
  the green one; the guard and `C02`, `C06`, `C07` keep the approved tests unchanged.
- **Light** (`build`): one phase, no human approval of tests, no lock. A done light slice needs no `red_approved_by`.
  Its commits are `build`. `ppc approve-red` and `ppc refactor` refuse it.
- `L06` checks that the phase belongs to the mode. A slice with no `mode` anywhere is checked as strict.

### Test policy

The blueprint may set `test_policy`, and a slice may override it. Default: `optional`, as in Spec Kit.

| Policy | A work slice closed with no test files |
|---|---|
| `required` | `ppc finish` refuses it, and `T16` is an error if the audit says so anyway. |
| `optional` | It closes, and `ppc finish` **proposes a debt entry of kind `test`** in the register of the slice's first component, for a person to decide with `ppc approve-debt`. `W06` warns if the audit shows no tests and no such entry exists, whatever its status. |
| `none` | It closes and nothing is proposed. |

"No tests" is measured from git (`test_lines` in the audit), never taken from the agent's own count. The policy
applies to skeleton, feature and fix slices; a refactor changes no behavior and a spike leaves no code. `ppc overview`
shows how many closed slices changed tests. The strict cycle (red tests first, approval, lock) always produces tests, so
the policy matters most in the light mode, where nothing else forces tests to exist.

### Mutation gate (optional)

If the blueprint sets `budgets.min_mutation_score`, `ppc finish` runs mutation testing (Stryker) on the
production files the slice's commits changed, and records the score in the audit. A lower score is refused,
with the surviving mutants listed, unless a human records `mutation_override_reason` (`M01` checks the
result later). The score is measured by `ppc`; the caller cannot supply it. Without the setting, the score
stays `null`. `ppc mutation (--files a,b | --slice SL-NNN)` runs the same measure on demand and prints the
score and the survivors without changing the project. The project needs `@stryker-mutator/core` installed and
a `stryker.config.json`; the setup that was run against the demo is in [mutation testing](mutation-testing.md).

What counts as a test file is defined once, by [`test-path-cases.json`](../contract/v0.1/test-path-cases.json);
the Python guard and `ppc` are both tested against it.

## What the contract does not check yet

- That `tests_added` is true, and that a stored `mutation_score` is the one the tool would give today:
  `finish` measures it, but `check-git` does not re-run mutation testing (it takes minutes), so an audit edited
  by hand could claim a better score. Only the JavaScript and TypeScript tooling (Stryker) is supported.
- That an approval was given by a real person: `approved_by` is a name, not a signature.
- That the commits listed in an audit are *all* the commits of the slice: `check-git` verifies the ones
  that are listed, not that none was left out.
