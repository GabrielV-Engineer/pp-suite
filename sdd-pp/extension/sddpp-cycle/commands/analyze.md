---
description: "ANALYZE: read-only review of the design and the planned slices for what ppc validate cannot see: contradictions, vague criteria, drift"
---

## User input

```text
$ARGUMENTS
```

Optional: a slice id or a capability id to focus on. Empty means the whole project.

## What this step is

`ppc validate` checks the structure with rules: ids that exist, a slice for every capability, sizes. It cannot read meaning.
This step reads the design, the slices and the project rules **for meaning** and reports what does not fit. It is
**read-only**. It replaces Spec Kit's `analyze`, which compares a `spec.md`, `plan.md` and `tasks.md` this flow does not have.

## Rules

- **Read-only.** Never edit, create or delete a file, never run `ppc approve-*`, `ppc decide-*` or `ppc change-request`
  on your own. You report; the person decides.
- Do not repeat what the rules already check. Run `ppc validate .` first and quote its result in one line; if it has errors,
  say the review is unreliable until they are fixed.
- Cite evidence for every finding: the file and the quoted words. Never report a problem you cannot quote. Never invent a
  missing section; if something is absent, say it is absent.
- Be economical: at most 40 findings, the most serious first; summarize the rest.

## Steps

1. Run `ppc validate .` and `ppc overview`. Read `.architect/blueprint.yaml`, `.architect/architecture.md`, the decisions,
   `.architect/additions.yaml` if present, the project rules block in `CLAUDE.md`, and every slice in the focus.
2. Look for, in this order:
   - **Contradiction.** A slice, an acceptance criterion or a decision that implements a **non-goal**, contradicts a decision in
     force, or names something the design removed (for example a quality target about a feature that was cut). Text in one
     file that says the opposite of another.
   - **Vague criteria.** An acceptance criterion or quality target with no value to check ("fast", "user-friendly", "valid",
     "properly"), or one that two readers would test differently.
   - **Coverage in meaning.** A capability whose description has a part no criterion verifies, or a criterion that checks
     something no capability asks for.
   - **Out of scope that does not hold.** A line that sends something to another slice ("later, in SL-003") when that slice
     does not do it, or a slice that does what another says it leaves out.
   - **Drift in names.** The same thing under two names across the design and the slices.
   - **Size risk.** A slice whose behavior, criteria and components suggest it will not fit the production-code budget.
   - **Kept additions.** An addition a person kept that now conflicts with a target or a non-goal.
3. Assign each finding a severity: **CRITICAL** (contradicts a non-goal or a decision in force), **HIGH** (a criterion that
   cannot be tested, a capability part nobody verifies), **MEDIUM** (drift, an out-of-scope line that does not hold),
   **LOW** (wording).
4. Report a table: id (A1, A2, ...), category, severity, where (file and quote), what is wrong, and the suggested action:
   fix a planned slice, run `/speckit-sddpp-cycle-clarify`, or open a change request for the design.
5. End with the counts by severity and the one next step you recommend. If there is nothing to report, say so and give
   what you checked.
