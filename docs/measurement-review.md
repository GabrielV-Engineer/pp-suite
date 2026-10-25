# Are we measuring the right thing, and asking the right questions?

Written on 2026-10-25, after the first experiment ([report](experiment-report.md)) and before the second. It looks at
the experiment from several points of view and says what each one changes. Where a point leads to a change in the
next experiment, the change is in [evaluation-plan](evaluation-plan.md), fixed before any run.

## What the project claims

pp-suite is meant to help people **without senior-engineer judgment** build **clean, maintainable** software with
AI agents, without losing **control and notion of the project** over a long time. That is four claims, not one:

1. The agent's code is better (cleaner, better tested, in scope).
2. The person is protected from their own weak judgment (a vague or over-ambitious request does not turn into
   over-engineering).
3. The person always knows the state and the next step.
4. The code stays maintainable as the project grows.

The first experiment tested only claim 1, in its easiest form.

## Point of view 1: the person the method is for

A non-senior person does not write a careful, structured task description for every change. The first experiment
gave the baselines exactly that: a slice file with behavior, acceptance criteria and an "Out of scope" list, written
by the framework's planning step. That is **the framework's own output used as the baseline's input**. It answers
"does the enforcement add anything on top of good specifications?" (no), not "does the framework help a person who
would otherwise type one vague sentence?".

*Change:* a new condition **B0** gives the agent only a one-sentence request, with the slice files removed from the
repository (the baseline copies still contained `.sddpp/slices/` and `specs/`, so a request-only condition would
have found them by exploring). Two styles, because the target person varies: **B0a** a terse, clear request, and
**B0b** an ambitious, non-expert request that invites over-reach ("production-ready", "scales", "recover if I delete
by mistake"). Claim 2 is tested by B0b: does the agent drift into things nobody should build?

## Point of view 2: the statistician

- n = 5 per cell, and most cells tied (0 markers, 0 test edits, 15/15 accepted). A tie-heavy outcome cannot show a
  small difference; it can only show that large ones are absent. The first result is better read as "no large
  effect on these measures" than as "no effect".
- Several measures, one rule: "beats on H1 **and** H2 in at least two slices" is strict by design, so a mixed
  picture reads as "not supported". That is the right bias for a claim the author wants to be true, and it was
  fixed in advance.
- Floor and ceiling effects (scope markers at 0, SL-008 mutation at 1.0) mean those measures had no room to
  discriminate. A measure that cannot move is not evidence of equality.

*Change for B0:* the outcome is chosen where there is room to move (B0b invites over-reach; correctness can fall
when details are missing), and the decision rule states in advance how large a difference counts.

## Point of view 3: construct validity

| Measure | What it really measures | Weakness |
|---|---|---|
| Mutation score on `src/` | how many small code changes the agent's own tests detect | says nothing about the maintainability of the code, and saturates on tiny slices |
| Out-of-scope markers | regex hits for things the slice forbids | catches only what the regexes name; floor effect |
| Neutral acceptance test | API behavior from the criteria | cannot see the page (no browser); the frontend part is unmeasured |
| Lines to read | a proxy for review load | not time, not effectiveness |
| Cost and minutes | machine cost | not the person's attention, which is the real cost |

*Change for B0:* add **production lines added** (a blunt, hard-to-game measure of how much the agent built) next to
the markers. Mutation, acceptance, cost and time stay.

*Not fixed, and said plainly:* none of these measures maintainability. See point of view 6.

## Point of view 4: external validity

One project, one language, one model, one person's design. Slices of 5 to 53 production lines in a clean
repository, each built in a fresh context. Real use is a dirty repository, vague requests, a codebase that grows,
and a model that changes every few months. The result may not transfer. Any claim must carry that.

## Point of view 5: the skeptic of the author

The person who built the method also built the experiment, the measures and the reading of the results. Safeguards
used: decision rules written before the first run, all runs and raw data published, a measure changed mid-run only
for a reason unrelated to the outcome and recorded as such. Not enough to remove the doubt. **Anyone can rerun it**:
`tools/eval/run.mjs` and the saved bundles are in the repository.

## Point of view 6: the maintainer

The real concern is that code written under a method **stays easy to change**. The right test is a chain: build
slice A under each condition, then ask the **same plain request for slice B, which builds on A**, and measure
whether B passes, how much it costs and how many earlier tests it breaks. The 15 SL-004 bundles already saved are
the starting points for SL-005 ("rename a task", which depends on SL-004). This is cheap and I recommend it as the
next study, after B0. Not part of the second experiment, to keep it to one question.

## Point of view 7: what is being compared

"T" is a bundle: slice spec, test-first, human approval, a test lock, an audit, three fresh sessions. A single
comparison cannot say which part helps. The first experiment partly separated them (B1 has the spec, B2 adds
test-first, T adds the enforcement). B0 adds the missing piece: the spec itself. After B0 the ablation will be
complete along the spec/test-first/enforcement axis.

## Point of view 8: the cost that matters

Machine cost was measured. The cost that decides whether a person uses the method is **their attention**: minutes
spent reading, approving and deciding per slice. That cannot be measured with agents. It needs a person using the
method on a real project and logging it. The most useful study the project can run is not an agent benchmark: it
is the owner building one real feature set with it and recording where they felt lost or slowed down.

## The questions, rewritten

| # | Question | Can agents answer it? | Status |
|---|---|---|---|
| Q1 | Does the enforcement add value over good specifications? | yes | answered: no measurable value at slice size |
| Q2 | Does the per-slice specification matter for a person who writes vague requests? | yes | **second experiment (B0)** |
| Q3 | Does the method protect against over-reach invited by the request? | yes | **second experiment (B0b)** |
| Q4 | Does code built under each condition stay easy to change? | yes | chain study, proposed next |
| Q5 | Does the person keep the notion of the project and the next step? | no, needs a person | `ppc next` and `overview` exist; unmeasured |
| Q6 | Is the person's review effective and cheap? | no | unmeasured; the human gate was simulated |
| Q7 | Does the lock matter under pressure? | partly | unmeasured; nobody weakened a test |

Honest summary: the first experiment asked a question (Q1) whose answer could not make or break the project,
because the project's purpose is mostly Q2 to Q6. The second experiment moves to Q2 and Q3, the ones agents can
answer. Q5 and Q6 will not be answered by more runs; they need the owner using it for real.
