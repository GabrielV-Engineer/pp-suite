---
description: "SLICES: plan thin vertical slices from the design (the person approves the list before it is written)"
---

## User input

```text
$ARGUMENTS
```

Optional: capability ids to plan (for example `CAP-002,CAP-003`). Empty means every capability that has no slice yet.

## What this step is

The design in `.architect/` already says what the system is: capabilities, components, quality targets, decisions and
what it does not do. This step turns it into **slices**: thin cuts that each deliver one thing a person can see, through
the layers that thing needs. It replaces Spec Kit's `specify`, `plan` and `tasks` for a project that was designed
first; do not run those, and do not write `spec.md`, `plan.md` or `tasks.md`.

## Rules

- `.architect/` is read-only. Write only `.sddpp/slices/SL-NNN-<slug>.md`. If the design is wrong or silent about
  something you need, stop and open a change request (`ppc change-request`); do not decide it yourself.
- **Never by layer.** No "data layer, then server, then page". Each slice is one observable behavior.
- **The first slice is the skeleton** (`type: skeleton`): the thinnest system that runs end to end through every
  component and shows it answers. Then one or more `feature` slices per capability, ordered by its priority (must, then
  should, then could), each with `capability`.
- **Size.** A slice's hand-written production code must fit `budgets.max_slice_production_lines` in the blueprint. If you
  expect more, split by behavior. At most 5 acceptance criteria per slice.
- **Every capability gets a slice, and every quality attribute is referenced by one** that delivers or checks it.
- Acceptance criteria come from the capability's description and the quality attributes. Write them as "Given ..., when
  ..., then ...". Do not invent features. If a capability is too vague to write a testable criterion, stop and ask the
  person one question; do not guess.
- Every `skeleton`, `feature` and `fix` slice has a `## Out of scope` section: the nearby things this slice does **not**
  do, drawn from the blueprint's non-goals that sit close to it and from the neighbouring slices.
- New slices are `status: planned`. Never write `approved_by`, `phase`, `red_approved_by`, `mode` or any decision field.
  Do not write debt.

## Steps

1. Run `ppc contract` (where the slice schema and a worked example are) and `ppc validate . --design`. If additions are
   still undecided, stop: the person must decide them first (`ppc decide-addition`), or the plan is built on things
   they may cut.
2. Read `.architect/blueprint.yaml`, `.architect/architecture.md` and the decisions. List `.sddpp/slices/` to see what
   exists and which ids are taken.
3. **Show the person the list before writing any file**: a table with id, title, type, capability, components and
   `depends_on`. Say what you left out and why. Ask whether to write them. Planning is where scope is set, so this is a
   decision for a person.
4. When they agree, write each slice file with the frontmatter that `slice.schema.json` defines (`id`, `title`, `type`,
   `status: planned`, `blueprint_revision` = the blueprint's current `revision`, `capability`, `quality_attributes`,
   `components`, `depends_on`, `acceptance`), then `## Behavior` (two to four sentences) and `## Out of scope`.
5. Run `ppc validate .` and fix every error. Read the warnings: fix the ones your files caused, report the others.
6. Run `ppc overview` and report: the slices, the order, what is left for later.
7. Tell the person the next step is theirs: `ppc approve-slice SL-001 --by <name>` for the slice they want to start
   first. Then ask whether they want the prompts for the first task prepared (`/speckit-sddpp-cycle-prompts`); only if
   they say yes.
