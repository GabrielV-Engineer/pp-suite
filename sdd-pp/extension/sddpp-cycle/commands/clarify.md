---
description: "CLARIFY: find what a planned slice or the design leaves unclear, ask up to 5 questions, and put each answer where its owner allows"
---

## User input

```text
$ARGUMENTS
```

A slice id (`SL-004`) or `design`. Empty means the next planned slice that `ppc next` names, or, if no slice exists yet, the design.

## What this step is

Before building, find what is vague enough that the builder would have to guess. Ask the person, one question at a time,
and record each answer **in the file that owns it**. It replaces Spec Kit's `clarify`, which works on a `spec.md` this flow
does not have.

## Rules

- **Who owns what.** A slice (`.sddpp/slices/`) is SDD.PP's: you may edit it, but **only while it is `planned`**. A slice
  that is `ready` or later was approved by a person as written; changing it would void that approval, so do not touch it;
  say so and let the person decide. The design (`.architect/`) is Architect.PP's: **never edit it**. A gap in the design
  becomes a change request (`ppc change-request`), with the question as the problem and the answer as the proposal.
- At most **5 questions** per run, **one question at a time**, each with the answer you would recommend and why. Wait for the
  answer before the next. Choose by impact: what would change the code or a test if answered differently.
- Do not invent answers, do not ask what the files already say, and do not ask for implementation details (a library, a file
  layout): those belong to the design or the builder.
- Never approve anything and never write a decision field.

## Steps

1. Run `ppc next` and `ppc validate .`. Read what the target needs: the slice, `.architect/blueprint.yaml`,
   `.architect/architecture.md` and the decisions it cites. Note the limits the slice already inherits (non-goals, budget).
2. Scan the target for gaps and mark each area Clear, Partial or Missing:
   - **For a slice:** is every acceptance criterion testable, with concrete values (not "fast", "valid", "properly")? Are the
     empty, error and repeated-action cases stated or deliberately left out? Does "Out of scope" say what a reader would
     assume is included? Is every number the slice needs (a limit, a size, a time) stated in the slice **or** the design? Does
     it depend on behavior another slice has not yet defined?
   - **For the design:** can each capability be written as a test? Does each quality attribute have a metric and a target a
     person could check? Do two components claim the same responsibility? Is a decision's rejected alternative missing?
3. Show the coverage map, then ask the first question. After each answer:
   - if it belongs to a **planned slice**, edit that slice (an acceptance criterion, an out-of-scope line);
   - if it belongs to the **design**, run `ppc change-request --slice <id> --title ... --problem ... --proposal ... [--qa|--component|--adr ...]`
     and tell the person it now needs their decision (`ppc decide-change`);
   - if it settles nothing new, say so and do not write.
4. Run `ppc validate .` and fix what your edits broke.
5. Report: questions asked and answers, files changed, change requests opened, and what stays unclear (deferred, and why).
