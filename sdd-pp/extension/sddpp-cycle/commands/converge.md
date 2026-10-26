---
description: "CONVERGE: read-only comparison of a slice's code with what the slice promised: missing, partial, contradicts, unrequested"
---

## User input

```text
$ARGUMENTS
```

A slice id. Empty means the slice in progress, or the most recently finished one.

## What this step is

The tests say whether the behavior works. They do not say whether the code does **only** what was asked, or whether every
promise was kept. This step compares what the slice's commits changed with what the slice, the design and the project rules
promised, and classifies the difference. It is **read-only**. It replaces Spec Kit's `converge`, which compares the code with
a `spec.md`, `plan.md` and `tasks.md` and appends tasks to a `tasks.md` this flow does not have. Run it before the audit.

## Rules

- **Read-only.** Never edit code, tests, slices or the design, and never run `ppc approve-*`, `ppc decide-*` or
  `ppc finish`. Report; the person and the builder act.
- Every finding cites **file:line** of the code (or the quoted slice text) as evidence. A finding without evidence is not
  reported. Do not judge style or taste.
- Start from what `ppc` already checks and do not repeat it: `ppc check-git .` (commits, sizes, tests untouched) and
  `ppc validate .`. Quote their result in one line.

## Steps

1. Identify the slice with `ppc status` or the argument. Read `.sddpp/slices/<slice>.md` (behavior, acceptance, **Out of
   scope**), `.architect/blueprint.yaml` (non-goals, components and what each may depend on, quality targets), the decisions
   in force, and the project rules in `CLAUDE.md`.
2. See what the slice changed: its commits from `git log` (messages that name the slice id) and `git diff` for them, or
   the commits in its audit. Read the changed code and tests.
3. Classify each finding as one of:
   - `missing`: an acceptance criterion with no code (or no test) behind it;
   - `partial`: the code exists but does not satisfy the whole criterion (an empty or error case it names is not handled);
   - `contradicts`: the code does something a non-goal, a decision in force, a component boundary or the slice's
     **Out of scope** forbids;
   - `unrequested`: behavior or code that no criterion asks for and nothing in the design needs (an extra option, a
     convenience feature, a second way to do the same thing). This is the growth of scope that the size budget does not catch.
4. Assign a severity: **CRITICAL** (`contradicts`, or a `missing` criterion of a must capability), **HIGH** (`missing` or
   `partial` on a criterion), **MEDIUM** (`unrequested` with a real behavior), **LOW** (`unrequested` of a few lines).
5. Report a table: id (F1, F2, ...), kind, severity, criterion or rule it relates to, evidence (file:line), and the suggested
   action. The actions to suggest:
   - `missing` / `partial`: keep working in the slice if it is still in progress; otherwise plan a `fix` slice
     (`/speckit-sddpp-cycle-slices`) or record it as debt the person accepts;
   - `contradicts`: change the code, or open a change request if the design is what is wrong (`ppc change-request`);
   - `unrequested`: remove it, or have a person add it to the slice's criteria on purpose, or record it in the audit's
     deviations.
6. End with the counts, and say plainly what you could not check (for example criteria that need a running system).
