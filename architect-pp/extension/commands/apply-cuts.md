---
description: "APPLY CUTS: carry out, in the design, the additions a person decided to cut"
---

## User input

```text
$ARGUMENTS
```

The argument is the project directory. If it is empty, use the current directory.

## What this step is

A person has decided, with `ppc decide-addition`, to cut some additions listed in `.architect/additions.yaml`. A
decision only records the choice. This step **carries it out in the design**, so that nothing built from the design
brings the addition back. It is a mechanical edit, not a redesign: remove what the addition brought, and nothing else.

## Rules

- Act only on additions with `decision: cut` and no `applied: true`. Never touch a `keep` or a `pending` one.
- **Never write a decision.** Do not change `decision`, `decided_by` or `reason`, and do not decide anything yourself. The
  one field you set is `applied: true`, and only when the cut is really done.
- Write only under `.architect/`. Do not create or edit `.sddpp/`.
- Remove only what the addition's `affects` lists, and the text that only explains it. If something else depends on a
  removed id (a component justified only by it, a decision that cites it), do not guess: say so in the report and
  leave `applied` unset for that addition.
- Do not add anything the cut does not require, other than the non-goal.

## Steps

1. Read `.architect/additions.yaml`, `.architect/blueprint.yaml`, `.architect/architecture.md`
   and, if they exist, `brief.md`, `glossary.md` and the decisions and evidence under `.architect/`. List the additions to apply.
2. For each one, do all of this:
   - Remove each id in `affects` from `.architect/blueprint.yaml` (a capability, quality attribute or constraint).
     Remove it from the `justified_by` of components and from the `drivers` of decisions that cite it. A decision file
     listed in `affects` (`ADR-NNNN`) is deleted, and its number is not reused.
   - Remove the text in `architecture.md` (and `brief.md` and `glossary.md`, if they exist) that only describes the addition (a section, a
     table row, a sentence). Keep what is shared with things that stay.
   - Add its `non_goal` sentence, exactly as written in `additions.yaml`, to `non_goals` in `blueprint.yaml`.
   - Raise `revision` in `blueprint.yaml` by one (once per run, however many cuts you apply).
   - Set `applied: true` on the addition in `additions.yaml`.
3. **Search for what the ids missed.** The `affects` list was written by a model and can be incomplete, and the
   validator only checks the ids it lists. For each addition you applied, search the whole of `.architect/` (not
   `additions.yaml`) for its key words (for the dark appearance: dark, theme; for a recoverable delete: soft, restore,
   trash, `deleted_at`). For every hit, either remove or reword it, or leave it and say why. The only hits that may stay
   are the non-goal itself and its "revisit" trigger. If a hit belongs to **another addition that is still pending or
   kept** (for example a quality target about the dark theme that belongs to an accessibility addition), do not edit it:
   the two additions overlap: report it, and say that `overlaps` should list each other in `additions.yaml` so that they are decided together (you may not edit that field of a decided addition's decision, but `overlaps` is not a decision). Report every such overlap.
4. Run `ppc validate . --design` (the argument is the project directory, not the project id). Fix every error that your edit caused. In particular, `X02` and `X03` check
   that nothing of a cut addition is left and that its non-goal is present.
5. Run `ppc constitution` so the project rules in `CLAUDE.md` follow the trimmed design. If it refuses because other
   additions are still undecided, say so in the report; do not use `--force`.
6. Report: for each addition, the ids and files you removed, the non-goal added, and what you left alone on purpose;
   any addition you could not apply, and why; every overlap with an undecided or kept addition; the result of the validation. Say plainly what you decided on your own.
