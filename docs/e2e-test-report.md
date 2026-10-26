# End-to-end test on the demo project: vibecoding, Spec Kit alone, and pp-suite

Run on 2026-10-26 on copies of the demo project `todo-app-m1`, one feature, one run per arm, one model. The aim is to see what the
whole flow does to the **quality of the code**, not its cost or speed, and whether more deterministic quality metrics are needed.
Raw measurements are in [`e2e-results/`](e2e-results/).

## What was compared

One request, the same words for every arm (it is the original slice SL-004 of the demo, as prose):

> Reject empty and over-long titles. When the owner submits a title that is empty after trimming, no task is created and a message
> explains why. When the title is longer than 500 characters, no task is created. The API should answer with a validation error and
> the page should show the reason.

| Arm | What it was told and what it had |
|---|---|
| **V, vibecoding** | The request above, plus "add tests", "run `npm test` and the type check" and "commit". No slices, no spec, no Spec Kit, no pp-suite file. One session |
| **K, Spec Kit alone** | A clean `specify init` (pinned commit) and its standard flow: `/speckit-specify`, `/speckit-clarify`, `/speckit-plan`, `/speckit-tasks`, `/speckit-implement`. Nothing of pp-suite |
| **P, pp-suite** | The flow: `ppc init`, owner settings (light cycle, tests required), the rules block, `/speckit-sddpp-cycle-clarify` on the planned slice, approval and start, `/speckit-sddpp-cycle-build`, then `converge` and `audit` |

All three started from the same repository: the code, its tests and the design documents in `.architect/`. The old feature spec in
`specs/` was removed from every arm, because it already held the detailed answers (messages, "500 exactly is accepted") and would have
favoured whoever read it. When a method asked a question (`clarify`), the answer was "I accept your recommendation", given by me, not by a
person; the approval of the slice in P was simulated under a test name. Only the P approval and the `clarify` answers stand in for a human.

**A first attempt was discarded.** The first control I launched was given the slice file and told it was "slice SL-004": that is already
pp-suite's way of working, so it was not a control. Its prompt is in [`e2e-results/discarded-pilot-control-prompt.txt`](e2e-results/discarded-pilot-control-prompt.txt)
and none of its numbers is used.

**Measured from outside, the same way, with code no arm saw.** Project tests, type check, the neutral acceptance test of the request,
the earlier slice as a regression test, mutation testing of the hand-written files the arm touched, the fixed out-of-scope markers, and
eight "latent quality" probes (`tools/eval/neutral-acceptance/sl004-latent.test.ts`) written and committed **before** any arm ran, which
test what a careful reviewer would also expect of the feature and the request does not say. On the untouched demo the probes pass 2 of 8,
so they do discriminate.

## Results

| | V vibecoding | K Spec Kit alone | P pp-suite |
|---|---|---|---|
| Type check, project tests, regression of the earlier slice | pass | pass | pass |
| Neutral acceptance (the request as written) | 4 / 4 | 4 / 4 | 4 / 4 |
| **Latent quality probes** | **8 / 8** | **8 / 8** | **7 / 8** (invalid JSON answers 500) |
| Mutation score (touched hand-written files) | 0.91 | 0.88 | 0.90 |
| New tests | 10 | 34 | 15 |
| Production lines / test lines added | 43 / 87 | 128 / 558 | 37 / 175 |
| Files changed (code and tests) | 5 | 9 (plus 9 spec documents) | 5 |
| Out-of-scope markers (fixed regex list) | 0 | 0 | 0 |
| **Edited the design document** (`.architect/architecture.md`) | no | **yes** | no |
| **Touched the database layer** | no | **yes** (new migration that drops the 500 limit from the database) | no |
| Sessions / model turns | 1 / 16 | 9 / 143 | 8 / 65 |
| Model cost, wall clock | 0.27 USD, 62 s | 3.13 USD, 11 min | 1.92 USD, 5 min |

The model cost and the clock are listed for completeness; they were not the aim.

## What each arm did, and what it is worth

**V, vibecoding.** Passed every check, including all eight probes. Without being asked it handled a body that is not JSON and a title that
is not text, counted characters as code points, and told the owner in two lines what it added "beyond what you asked". It left no record
of the choices it made (the wording of the messages, trimming moved into the validator) beyond that report. *Advantage:* nothing in this feature
needed a method. *Disadvantage:* every decision is in the head of whoever reads the diff; nothing stops it from reaching into other layers
when the feature is larger.

**K, Spec Kit alone.** Passed every check. It also produced 611 lines of documents (7,600 words), the largest change (18 files, 1,396 lines,
558 of them tests) and **two changes nobody asked for**: it redefined the limit as "user-perceived characters (grapheme clusters)" in the
design document, and it added a database migration that **removes** the 500 limit from the database. Both are defensible choices made inside
its own plan, and they were written down in its documents; but no rule stopped a build step from rewriting the design and the data layer,
and `implement` did not commit. *Advantage:* the most documented decisions; the most tests. *Disadvantage:* the largest thing a person has to
review, the design drifted, and the limit is now enforced only by the application, in a different unit (grapheme clusters) from the one the database used (code points); the database no longer checks it.

**P, pp-suite.** Passed every check but one probe. The smallest change (5 files, 37 production lines), the design and the data layer
untouched, tests that cite the acceptance criteria (38 mentions of `AC-n` against 19 in the other arms), and a closing record of seven
deviations. The probe it failed was a **decision it recorded**: `clarify` put an invalid JSON body "out of scope" for the slice, and both
`converge` and the audit repeat it as a point for a person. *Advantage:* every deviation, and what was left out, is written where a reviewer
looks. *Disadvantage:* a narrow slice leaves a real gap (a 500 on malformed JSON) that vibecoding and Spec Kit closed on their own, and
the gap now waits for a person to schedule it.

## What the numbers do and do not show

- **On this feature the deterministic quality metrics did not separate the arms.** Type check, tests, acceptance and mutation (0.88 to
  0.91) were all at the ceiling for all three. The only probe that differed was a scope decision, not a defect of execution. This agrees
  with the first experiment (45 runs): on a thin slice the method does not improve the measured quality of the code.
- **What did differ is outside those metrics:** how much a person must read, what changed beyond the request, whether the design was left
  alone, and whether the decisions are recorded. There the arms differ clearly, and none of those differences is caught by a deterministic
  check today.
- It does **not** show that pp-suite yields better code. It shows that, here, it yields code as good as the alternatives with a smaller
  footprint and a record, and that it costs a person some decisions.

## Differences found in the pp-suite flow itself

1. **`build` closes the slice in its own session.** `build.md` ends by going on to the audit, so the slice was already closed when I ran
   `converge`, and the audit step found nothing to do. As designed, "`converge` before the audit" cannot happen unless someone stops the build.
2. **A feature slice can partly pay debt but cannot say so.** The build resolved most of `DEBT-BE-004` and `DEBT-FE-001`, as their
   triggers announced, but only a refactor slice may pay debt, so both stay `open`. The agent reported it and left the decision to a person.
3. **A narrow slice trades robustness for discipline** (see P above). It is the intended behavior and also a cost.
4. **`ppc init --update` leaves the old preset installed.** It warns and does not remove it.
5. **`clarify` found real issues before any code existed:** the 500-character limit counts differently in JavaScript (UTF-16 units) and in
   the database (code points), a title that is not text gives a 500, and no message was required for the over-long case. Three questions, about
   1,500 words of dialogue. In this run V and K handled those cases without being asked, so the question did not change the outcome here.
6. **`analyze` on the demo's design and slices** (before the arms) found 14 points that `ppc validate` does not see; I checked four by hand
   and all four were true, among them that no slice covers the Host/Origin guard of QA-003.

## Estimated time for a person to review and decide

These are estimates from the size of what each arm produced, **not measurements of a person**. Assumptions: prose read at 200 words per
minute; code reviewed at 300 to 500 lines per hour (the range the Cisco and SmartBear review study and its summaries give;
[SmartBear](https://smartbear.com/learn/code-review/best-practices-for-peer-code-review/) also advises reviewing fewer than 200 to 400
lines at a time and stopping before 60 to 90 minutes); tests count as code.

| | V | K | P |
|---|---|---|---|
| Prose a person reads (words) | 218 | about 10,150 (9 spec documents 7,596 plus dialogue and reports) | about 2,940 (3 clarify questions 1,530, slice 515, converge 555, build report 345) |
| Code to review (lines) | 130 | about 705 (128 production, 558 tests, 19 migration) | 212 |
| Reading time | about 1 min | about 51 min (22 if only spec, plan and the questions) | about 15 min |
| Code review time | about 16 to 26 min | about 85 to 141 min, and well beyond the 200 to 400 lines where review stays effective | about 25 to 42 min |
| **Total** | **about 17 to 27 min** | **about 107 to 192 min** (about 85 to 141 for only the code and the spec) | **about 40 to 57 min** |
| Decisions put to the person | 0 (all implicit) | the answers of its `clarify` rounds (accepted by me), plus the plan | 3 questions, the slice approval, 2 debt entries |

What pp-suite also saves a person from **writing by hand**: the slice with five acceptance criteria and its out-of-scope list, finding the
three questions, and the audit notes. I estimate 45 to 60 minutes of thoughtful work (assuming 15 to 20 words per minute for writing that
needs thought), against about 5 minutes of agent time. Nothing was measured with a real person.

So: vibecoding needs the least human time and leaves the most undocumented; Spec Kit alone needs the most; pp-suite sits in between and is the
one that leaves a short, specific record to read.

## Is more deterministic quality measurement needed?

**For the code itself, not yet.** The existing ones (type check, tests, mutation) were at the ceiling in every arm, so a fourth one
(lint, complexity, duplication) would not have changed any verdict on this feature, and the sample is too small to say where it would.

**For design integrity, yes, two cheap ones**, because that is where the arms really differed and nothing deterministic saw it. The fixed
out-of-scope markers gave K a clean 0 while it rewrote the design and a migration.

1. **A build must not edit `.architect/`.** A git check, like the existing `C` rules: any commit of a slice that changes a file under
   `.architect/` is an error unless it comes from a change request. This alone would have flagged K.
2. **A slice should touch only its components' files.** Needs an optional `paths` list on each component in the blueprint (for example
   `migrations/**` for `database`); a commit that changes files outside the paths of the slice's components (tests and docs allowed) is
   an error or a warning. This would have flagged K's migration, and would let `ppc` say "this slice says it does not touch the
   database layer" with a check instead of a promise.

Not proposed: more metrics on the quality of tests (K had six times the tests of V at the same mutation score, so volume says nothing), a
coverage figure (the first experiment already showed it does not measure verification), or a deterministic measure of "edge cases handled",
which cannot be written once for every feature; `clarify` and `analyze` exist for that and are model judgments.

## Limits

One feature, one run per arm, one model, one project of about 450 lines. A feature this small is solved well by the model alone, which hides
what a method is for; the arms may separate on a longer chain of slices, a weaker model, or a feature whose requirements are not obvious.
The human decisions were played by me. The probes are specific to this feature. The time estimates are arithmetic on sizes, not observation.
