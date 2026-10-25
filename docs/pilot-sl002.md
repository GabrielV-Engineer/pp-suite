# Pilot: slice SL-002 built with and without the framework

Run on 2026-10-24 to check that the measuring works, as the first step of the
[evaluation plan](evaluation-plan.md). **It is one run per condition and proves nothing.** Its value is the
list of things that were wrong with the measuring.

## What was compared

The same slice (create a task and list it, with persistence across `kill -9`), from the same commit, with
the same context files (slice, blueprint, architecture).

| Condition | What the agent got |
|---|---|
| **T: SDD.PP** | Red session, a person's approval of the tests, green session with the test lock, audit session |
| **B1: plain** | One prompt: implement the slice, run the tests, commit. No framework |

Condition B2 (instructed TDD) was not run.

## Numbers

| Measure | T: SDD.PP | B1: plain |
|---|---|---|
| Sessions | 3 (red, green, audit) | 1 |
| Cost | 0.88 USD | 0.33 USD |
| Machine time | about 3.5 min | about 1.3 min |
| Production lines at the end (same base) | 173 | 203 |
| Test cases at the end (7 existed before) | 16 | 12 |
| Largest single commit | 137 lines | 224 lines |
| Markers of behavior outside the criteria | 1 | 5 |
| Edits to tests after they were written | 0 | 0 |
| Project's own tests | 16 of 16 | 12 of 12 |
| Neutral acceptance test (below) | 2 of 2 | 2 of 2 |

T's cost is 2.6 times B1's, which is under the 3 times fixed in the plan. T's time does not include the
person's review. T's audit was first refused by the budget as it was then (246 lines counted, of which 137
were tests and 109 production). After the budget was changed to count production code only, the slice
closed with no exception: 109 production lines and 137 test lines, both checked against git.

The 5 markers in B1 are 4 validation paths (invalid JSON, a title that is not text) that belong to another
slice, plus an ordering rule. T had one ordering clause, which it reported itself.

## What the pilot got wrong

1. **A circular measure.** The first acceptance check ran T's approved tests against B1's code: B1 passed 4
   of 9. That looked like a large advantage and was an artifact. The failures demanded things the slice and
   the architecture do not state (a `201` status, the shape of the response, and element identifiers that
   T's agent chose). Tests written by one condition cannot judge another. **That measure is withdrawn.**
   It was replaced by a neutral test written only from the text of the criteria
   (`tools/eval/neutral-acceptance/sl002.test.ts`): both conditions pass it.
2. **A false positive.** The counter of guard blocks counted a file that only contained the guard's text.
   It now counts only error results that carry the guard's message.
3. **Nothing measured the main claim.** Coverage cannot see code run by the child server process the tests
   spawn, and mutation testing does not exist yet, so *untested behavior* (H1) was not measured.

## What the pilot can and cannot say

- It can say the measuring runs, and that the neutral test sees no difference in whether the criteria are met.
- It suggests, with n = 1, that T writes more tests, smaller commits and fewer out-of-scope behaviors, and
  costs about 2.6 times more.
- It **cannot** say any of that is a real effect. The plain agent did this slice well: it wrote its own
  tests, read the "out of scope" section and respected most of it.

## Needed before the experiment proper

- A neutral acceptance test for every slice, written from the criteria before any run.
- A measure of untested behavior that sees child processes, or a mutation tool.
- Condition B2, and at least 5 runs per condition.
- Tests for `measure.mjs`, which has none.
