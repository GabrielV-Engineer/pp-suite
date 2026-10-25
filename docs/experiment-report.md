# Experiment report: does SDD.PP beat a plain prompt?

Run on 2026-10-25 under the protocol in [evaluation-plan](evaluation-plan.md), fixed before the first run. All
45 runs, every number and every run are in [experiment-results](experiment-results/README.md).

## Result

**By the decision rules written in advance, the claim is not supported.** T (SDD.PP) did not beat B2 (a plain
prompt that also says "work test-first") on untested behavior or on scope, and it did not beat B1 either.

| | B1: plain prompt | B2: plain + test-first | T: SDD.PP |
|---|---|---|---|
| Runs | 15 | 15 | 15 |
| Passes the neutral acceptance test | 15/15 | 15/15 | 15/15 |
| Passes its own tests | 15/15 | 15/15 | 15/15 |
| Mutation score of `src/` (median) | 0.90 | 0.89 | 0.87 |
| Behaviors outside the criteria (markers, median) | 0 | 0 | 0 |
| Commits that edit a test after the first test commit | 0 | 0 | 0 |
| Cost per run (median) | 0.29 USD | 0.33 USD | 0.74 USD |
| Time per run (median) | 1.0 min | 1.3 min | 2.7 min |

T cost 2.5 times B1 and took 2.8 times as long. It did not produce better-tested code, did not stay more in scope,
and did not fail less. In these runs it did not do worse either, except in cost.

Total spent on the 45 runs: about 19.9 USD (B1 4.2, B2 4.6, T 11.1).

## The baseline was not "no framework"

B1 and B2 were told to implement a slice **described in the slice file** that SDD.PP's planning step wrote:
behavior, Given/When/Then acceptance criteria, an "Out of scope" list, the components involved, and a link to the
blueprint and architecture. That file is, in effect, the careful per-task prompt that a person without the
framework would have to write by hand every time. So the experiment compared **the enforcement** (three
sessions, the test lock, the audit) **against the planning artifacts alone**; it did not compare the framework
against a bare request. Its result is "the enforcement added nothing measurable on top of good specifications".
Whether the specifications themselves (and the vertical slicing that produces them) are what matters was not
tested. That would need a condition B0 that gets only a one-sentence request.

## What this means, and what it does not

**It means** that on thin slices that changed between 5 and 53 lines of production code, written for a strong model that is
given the slice file with its acceptance criteria and its "Out of scope" list, a one-paragraph prompt produced
code that met the criteria, stayed in scope and was about as well tested as the full cycle with its guard, at
about 40% of the cost. The added machinery bought nothing we could measure here. Under the plan's own rule
this is the "drop or simplify" case: not supported at this size.

**It does not mean** the method is useless. The experiment could not see the things the method is for:

1. **Nobody weakened a test, in any condition.** There were 0 test edits after the first test commit in all 45
   runs. The lock never had anything to stop, so its value was not measured. A plain agent that writes its own
   tests and has no pressure to pass them does not cheat.
2. **Scope did not drift.** Out-of-scope markers were 0 in nearly every run, baselines included (two runs of 45 had one: SL-006-B1-3 and SL-006-B2-3, both baselines). When the baseline never does the thing a rule forbids, the rule cannot show an advantage. This is a floor
   effect and the measure has little sensitivity.
3. **A ceiling on SL-008.** Its change is one line and every condition scored 1.0.
4. **The human gate was simulated.** The claimed benefit of reading and approving the tests first (a person catches
   a weak test) is not measured: the harness approved every red commit.
5. **Short tasks.** The method's central worry is losing control of a project over weeks. A slice built in three
   minutes in a clean context cannot show that.
6. **One model, one project, one language.**

## Weaknesses of the measurement that I know of

- The mutation score depends on how little code a slice adds. SL-008 changes 5 or 6 lines and saturates at 1.0.
  Inside SL-006 every run of a condition got almost the same score (B1 0.85 in all five, T 0.83 in all five), so
  the code the agent writes is close to deterministic, and the 0.02 gap there comes from small implementation
  details, not from a method effect. I did not check which mutants survive.
- The markers for scope are regular expressions written from the "Out of scope" lists. They catch what they
  name, not other overreach.
- `public/app.js` cannot be scored (no test drives a browser) and was left out of H1 for every condition. The
  frontend part of each slice is therefore unmeasured. See the measurement change in the plan.
- Three infrastructure problems were found and fixed during the run, all in my tooling, none in the
  conditions: Stryker failing on instrumented page scripts (the measure changed, with the reason recorded),
  two transient session failures at start (the runs were repeated), and a re-measure tool that silently left one run
  at its base commit (found by a contradiction with the agent's own report, fixed, and all 45 measurements were then
  checked against the final commit of their run). One run, SL-008-B1-2, needed a second measurement for a reason I
  did not record. Its rebuilt code matches its saved bundle.
- n = 5 per cell, no significance test. The medians are close enough that nothing here would survive one.

## What would make a better test

An experiment that could show an advantage needs conditions where a plain agent fails often enough to leave room:

- **Pressure**: slices whose tests are hard to pass, or ambiguous criteria, where weakening a test is tempting.
- **Length**: a sequence of dependent slices on one project, measuring drift, duplication and whether later
  slices break earlier behavior.
- **A real reviewer**: injected weak tests, with a person (or a blinded model) deciding, and the time it takes.
- **A sharper scope measure**: criteria that invite extra behavior by design.

Each is a larger study than this one. Whether it is worth running is a decision for the project's owner, and it
should be made knowing that the simple version of the claim just failed.
