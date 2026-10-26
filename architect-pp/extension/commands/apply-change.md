---
description: "APPLY CHANGE: revise the design for a change request a person accepted, and raise its revision"
---

## User input

```text
$ARGUMENTS
```

The argument is a change request id, for example `CR-0002`. If it is empty, stop and ask for it.

## What this step is

A slice found the design wrong or silent, opened a change request (`.sddpp/change-requests/CR-NNNN-*.md`), and **a person
accepted it**. This step revises `.architect/` accordingly. It is the only way the design changes while the project is
being built: SDD.PP never edits `.architect/`, and nobody edits it without a request that a person accepted.

## Rules

- Act only on a request whose `status` is `accepted`. If it is `open` or `rejected`, stop and say so.
- Make **the change the request proposes, and nothing else.** If the proposal is vague, is bigger than it looks (a change of
  framework, a new component), or you would have to choose between options, stop and report instead of guessing: a person
  decides, then you carry it out.
- **Never write a decision.** Do not edit the change request file at all (`ppc apply-change` marks it), and never write
  `decided_by`, `approved_by` or any decision field.
- Write only under `.architect/`. Do not touch `.sddpp/` or the code.
- Keep the design coherent: search the whole of `.architect/` for the words the change touches (a limit, a component, a
  tool) and fix or report every place that now disagrees. A quality target that changes keeps its metric.
- When a decision changes, do not rewrite its record: write a new `ADR-NNNN` (next free number) that lists the old one in
  `supersedes`, and set the old one's `status` to `superseded`. Numbers are never reused.
- Follow the contract exactly: run `ppc contract` for where the schemas, the document and an example are.

## Steps

1. Read the change request, then the parts of `.architect/` it affects (`blueprint.yaml`, `architecture.md`, the decisions
   it names). Check `status: accepted`.
2. Make the revision. Raise `revision` in `blueprint.yaml` by exactly one.
3. Run `ppc validate . --design` (the argument is the project directory) and fix every error your edit caused.
4. Run `ppc constitution` so the project rules in `CLAUDE.md` carry the new revision.
5. Run `ppc apply-change <id> .`. It checks that the revision rose and that the project rules are current, then marks the
   request applied. If it refuses, fix the cause; never edit the request by hand.
6. Run `ppc next` and copy the slices it lists as planned against an older design.
7. Report: what you changed, file by file; what you left alone on purpose; the slices that were planned against the old
   revision (a person reads what changed and updates them); and what you decided on your own. Say that the diff of
   `.architect/` is what the person should read.
