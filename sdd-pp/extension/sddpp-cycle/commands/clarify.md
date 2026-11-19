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

## When the person decides

Approving a slice, its red tests or a screen's mockup, accepting or rejecting a change request, deciding a debt entry or a standard (security, observability, git, CI), an exception to the
budget or the mutation score, and saying they read what changed in the design are the person's decisions. Never give them
a command to type in a terminal. Instead:

1. Run `ppc show <id>` and say in your own words what it is and what each choice means. Write every file they should
   read as a link, `[path](path)`.
2. Run `ppc ask <id>` (for an exception: `ppc ask <slice> --budget-reason "<the reason you propose>"`, or
   `--mutation-reason`) and ask exactly that question with the AskUserQuestion tool: the same options in the same order,
   without an `answers` field. You may put the words in the person's language; everything after the last ` — ` stays as
   printed. Before the panel, say in one line per option what happens if they pick it. For a debt entry that a planned
   slice touching its component should pay, add `--pay-in <that slice>`: debt left open with no slice to pay it is
   forgotten. When a slice's card says "Ask before approving it", put each entry it names to them (`ppc ask DEBT-… --pay-in
   <slice>`) before the slice's own approval.
3. Run the command of the option they picked, exactly, right away, before anything else: an answer is good for 30
   minutes, once. For any other answer, run no approval. Only if the guard refuses
   the command, say so and give them the command to run themselves.

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
     and put it to the person (`ppc ask <the request's id>`, see **When the person decides**);
   - if it settles nothing new, say so and do not write.
4. Run `ppc validate .` and fix what your edits broke.
5. Report: questions asked and answers, files changed, change requests opened, and what stays unclear (deferred, and why).
