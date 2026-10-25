# Does it help? An evaluation plan

pp-suite claims that building with AI agents under its rules gives code that is more in scope, better
tested and easier to audit than building without them, at an acceptable cost. **Nothing so far
supports or refutes that.** The M1 report and the M2 notes show that the mechanism works (n = 1, no
comparison). This document fixes how the claim will be tested, and what result would count against it,
**before** looking at results.

## The claim, split into testable parts

| # | Claim | Why it matters |
|---|---|---|
| H1 | The code that ships has **less untested behavior** | AI code tends to contain branches nobody asked for and nothing verifies |
| H2 | The code does **less than nobody asked for**: fewer behaviors outside the acceptance criteria | Scope creep is how AI projects turn into over-engineered ones |
| H3 | **Tests are not weakened** after they are written | A test that can be edited to pass proves nothing |
| H4 | A person can **review it faster**: less to read for the same confidence | The human gate only works if it is cheap |
| H5 | The overhead is **acceptable** | A method that costs 5 times more for a little gain will not be used |

## Design

The same unit of work is built several times from the **same commit**, with the same context files
(slice, blueprint, architecture), once per condition.

| Condition | What the agent gets |
|---|---|
| **B1: plain** | One prompt: implement the slice. No framework. |
| **B2: instructed TDD** | The same prompt plus "work test-first". Tests whether the enforcement adds anything beyond asking. |
| **T: SDD.PP** | The full cycle: red, human approval, green with the test lock, audit. |

Each condition is repeated **at least 5 times per slice**, because one run of a language model says almost
nothing. A run is discarded only if the session itself failed (for example a usage limit), never because
its result looks bad.

## Measures, all computed by a script and not by opinion

| Part | Measure |
|---|---|
| H1 | Share of production lines executed by the test suite (coverage), and, once available, the mutation score |
| H2 | Behaviors present in the code that no acceptance criterion names (routes, status codes, branches), counted from a fixed checklist written from the criteria |
| H3 | Number of commits after the first test commit that change a test file |
| H4 | Lines a reviewer must read: the tests in T, the whole diff in B1 and B2 |
| H5 | Cost in USD, wall-clock minutes and number of turns |
| Also | Does the slice meet its acceptance criteria? Do the architecture tests pass? Largest single commit |

## Decision rules, fixed in advance

- **The method is supported at this size** if, over at least 5 runs per condition, T beats B1 **and** B2 on
  H1 and on H2, never loses on H3, and costs less than 3 times B1.
- **It is not supported** if T does not beat B2 on H1 and H2: then the extra machinery adds nothing over a
  better prompt, and should be dropped or simplified.
- Anything in between is reported as inconclusive, with the numbers.

## Known weaknesses of this design

- **Small tasks.** A slice of about 150 lines may hide effects that appear in long projects, which is where
  the claim matters most (losing track of the code over weeks). A long-run study is a separate piece of work.
- **One model, one task family.** Results may not transfer.
- **The builder and the evaluator are the same person.** The checklist for H2 is written from the
  criteria before the runs, to limit that.
- **Tests written by one condition cannot judge another.** The pilot hit this: see [pilot-sl002](pilot-sl002.md).
- **The human gate is simulated** in automated runs. Its value (catching a weak test) has one observed
  case, not a measurement.
- **A strong baseline prompt may close the gap**; that is the reason for B2.

## Status

| Item | State |
|---|---|
| Design and decision rules | written (this file) |
| Pilot: one slice, one run per condition, to check the measuring works | done: [pilot-sl002](pilot-sl002.md). It found a circular measure and a false positive, and proves nothing |
| The experiment itself (5 or more runs per condition, more than one slice) | not started |
| Evidence that the methodology helps | **none yet** |
