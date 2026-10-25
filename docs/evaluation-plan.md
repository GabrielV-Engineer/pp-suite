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
| H1 | Mutation score of the production files the run wrote, measured with the condition's own tests (see [mutation testing](mutation-testing.md)). Coverage cannot be used: the tests start the server as a child process |
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

## Protocol, fixed on 2026-10-24 before the first run

- **Project and base:** `todo-app-m1` at commit `e4b45d6` (SL-001 and SL-002 done, Stryker installed).
- **Slices:** SL-004 (reject invalid titles), SL-006 (delete a task), SL-008 (newest first, empty state, performance).
  Chosen because each depends only on SL-002, and they differ in shape: validation, a new route through all three
  layers, and ordering with a performance target.
- **Runs:** 5 repetitions x 3 slices x 3 conditions = 45. Order: round by round, conditions shuffled with a fixed
  seed (`tools/eval/plan.mjs`), so stopping early leaves complete rounds.
- **Each run** is a fresh copy of the project with real `claude -p` sessions, the same tools for every condition,
  no git remote. B1 and B2 are one session (cap 3 USD). T is three sessions: red (1.5), green (2), audit (1.5).
  The prompts are in `tools/eval/plan.mjs`.
- **B1 and B2 do not get the framework files** (`.claude/`, `.specify/`), so no hook or skill can reach them.
  They do get the same slice file, blueprint and architecture as T.
- **The human gate is simulated in T.** Approval of the slice and of the red tests is recorded by the harness under
  the name "experiment-harness (automated, not a human)". It approves every red commit that exists, so the
  catch of a weak test by a person, which is a claimed benefit of T, **is not measured here**.
- **What is discarded:** only a run whose session failed because of the account or the network (a usage limit looks
  like a success with an error flag). It is deleted and repeated. A run that runs out of its cap, fails its own
  tests, fails the acceptance test or does not close its slice is **kept and reported**.
- **Measures per run:** neutral acceptance test (pass or fail), the run's own tests, mutation score of the
  production files it wrote (H1, with its own tests), out-of-scope markers from `tools/eval/slices/` (H2), test
  edits after the first test commit and edit calls to test files (H3), lines to read (H4), cost, time and turns (H5).
- **"Beats" means:** the median of T is better than the median of the baseline on that measure in the pooled 15
  runs **and** in at least 2 of the 3 slices. With 5 runs per cell no significance test is claimed; medians,
  ranges and every individual run are published in `docs/experiment-results/`.
- **Second view of the mutation score, declared after the first run and before the other 44:** the score of the files
  under `src/` only. In the first run `public/app.js` scored 0% (no test of any condition drives a browser), which
  dominates the overall figure. The overall score stays the primary measure; the `src/` view is reported next to it.
- **Reading the mutation score:** it is compared as measured, and also among only the runs that pass the
  acceptance test, so that a condition is not rewarded for writing less.

### Measurement change, 2026-10-25, after 10 runs and before any comparison between conditions was computed

- **What happened.** In 4 of the first 10 runs (all three conditions among them) the mutation tool refused to start:
  "there were failed tests in the initial test run". The project's own tests passed. The cause is that Stryker
  instruments each file it will mutate *before* that first run, and a test that reads `public/app.js` as text (a
  regex over its source) fails on the instrumented copy. Whether a run could be scored at all therefore depended on
  how its tests happened to check the page script, not on how well they tested.
- **Change.** H1 is now the mutation score of the files under `src/` only. The page script was never testable by
  mutation in this project (no test drives a browser) and the score on it was 0% in every run where it was measured.
  The earlier "src/ view" is now the primary one, the all-files score is kept in the data where it exists, and the
  verdict does not use it.
- **Why this is not tuned to the result.** Before the change, the only scores I had seen were those of the first run
  (T on SL-004). No median or comparison between conditions had been computed. The 4 failed measurements are
  repeated from the git bundles each run saved, and runs measured earlier already stored per-file counts, so their
  `src/` score is computed from those.
- **Also on 2026-10-25:** the driver stopped once on a transient failure of the account or network at the start of
  run SL-004-T-2. By the protocol that run was discarded and is redone.

## Second experiment, fixed on 2026-10-25 before its first run

Question (see [measurement-review](measurement-review.md)): **does the per-slice specification matter** for a
person who would otherwise type one sentence, and does it protect against an over-ambitious request?

- **Conditions** (all one session, cap 3 USD, same tools and same prompt tail as B1): **B0a**, a clear one-sentence
  request; **B0b**, an ambitious request of the kind a person without senior judgment might write
  ("production-ready", "scales", "recover if I delete by mistake", "paging and search"). The six requests are in
  `tools/eval/plan.mjs`. The comparison is the **15 B1 runs of the first experiment**, taken as they are.
- **B0 projects have no `.sddpp/` and no `specs/`**, or the agent would find the slice files by exploring. They keep
  `.architect/` (architecture and blueprint, with their non-goals): the neutral acceptance tests rely on the API
  facts stated there. So this isolates the slice-level specification, not the design documents.
- **Runs:** 3 repetitions x 3 slices (SL-004, SL-006, SL-008) x 2 conditions = **18 runs**, shuffled with a fixed seed.
- **Measures:** pass of the neutral acceptance test (the criteria are not shown to B0, so a miss means a detail was
  not guessed); production lines added; out-of-scope markers; cost and time. **Mutation testing is not run**: the
  decision rule does not use it.
- **Decision rule.** A request-only style **matters** when, pooled (9 runs against B1's 15), it either passes the
  acceptance test at least **20 points** less often than B1, or builds at least **1.5 times** B1's median production
  lines, or has a median of at least **one more** out-of-scope marker, **and** the same direction holds in at least
  two slices. The verdict is "the slice spec matters" if either style matters; "no evidence that the slice spec
  matters" if neither does; "inconclusive" if data is missing. Applied by `tools/eval/analyze.mjs --spec --b1-from`.
- **Reduced on 2026-10-25 at the owner's request ("the minimum that is sufficient"), before any result of this
  experiment was read.** It was planned as 45 runs (5 repetitions, B1 run again at the same time to see its
  run-to-run variation). It was stopped after one run (SL-004-B0b-1), which is kept because it belongs to the reduced
  plan. The thresholds were not changed. The cost of reusing B1: it was run earlier the same day, so a drift of the
  model between the two would go unseen. B1's own runs were near-identical to each other (for example SL-006 scored
  the same in all five), which makes this a small risk, not zero.
- **Why 18 is enough for this question.** The rule asks whether a large effect exists (20 points, 1.5 times the code,
  a whole marker) in a majority of slices. With three runs per slice a failure rate of one in three is visible in
  every slice. A smaller effect than that would not change what the project does, so it is not looked for.
- **What it cannot show:** whether the spec matters for a person who also lacks the design documents; whether it
  matters over many dependent slices; anything about the person's own attention. Same model, same project.
- **Discard rule:** as in the first experiment (only account or network failures; the run is redone).

## Structure decided on 2026-10-25

Three layers, accepted by the owner: a **core** that is always on (contract, `ppc`, vertical slices with their "out of
scope", debt per component, human approval of slices and debt, `next` and `overview`); a **light mode** as the default
(one session implements the slice, then `finish` measures from git and reports the mutation score without
blocking); and a **strict mode**, optional per slice (red, human approval, green with the test lock, audit, mutation
gate). Architect.PP is on hold until this experiment says whether the planning layer is where the value is. The
light and strict modes are not yet separate in the code: today only the strict cycle exists as prompts.

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
| Instrument: `tools/eval` measures a run from git, test output and the session transcript (tested, 14 tests); neutral acceptance tests for SL-002, SL-004, SL-006 and SL-008, each self-contained; out-of-scope markers per slice fixed in `tools/eval/slices/`; mutation score (H1) | done. The acceptance tests were checked in both directions on the demo: they fail where the slice is not built and pass on a reference implementation |
| The experiment itself (5 runs per condition, 3 slices, 45 runs) | done on 2026-10-25: [experiment-report](experiment-report.md) |
| Evidence that the methodology helps | **none.** By the rules above the claim is **not supported** at this size: T did not beat a plain prompt on untested behavior or scope, and cost 2.5 times as much. The experiment could not test the claims about long projects or the human reviewer |
