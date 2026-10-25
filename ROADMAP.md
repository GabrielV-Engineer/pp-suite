# Roadmap

Status key: **done** has tests in CI · **spiked** tried once by hand, not automated · **planned** not started.

## Foundation

| Item | Status |
|---|---|
| Contract v0.1 schemas (blueprint, slice, debt, ADR, evidence, change request, active state) | done |
| `ppc validate`: parsing, schema, cross-reference, lifecycle, budget and generated-view rules, each with a test that makes it fire (`ppc rules` lists them all, `check-git` rules included) | done |
| Shared definition of "test file" (`contract/v0.1/test-path-cases.json`), tested by both the guard and `ppc` | done |
| `ppc generate`: WBS and one debt table per component, with a staleness check | done |
| `ppc check-git`: audits are checked against real git history (commits exist, green/refactor leave tests untouched, red has no production code, the measured sizes are true, red precedes green) | done, tested against real temporary repositories |
| **Budget counts production code only** (tests, lockfiles and bookkeeping excluded); audits record `production_lines` and `test_lines`. Chosen because the old rule failed twice: M1 429 lines against 200, SL-002 246, in both cases tests and a lockfile were the excess | done, each part broken on purpose to confirm a test fails |
| Worked example (`examples/todo-app`), planning stage, validated in strict mode | done |
| Test-lock guard with fail-closed state handling (`sdd-pp/extension/sddpp-guard`) | done (unit tests) |
| Slice cycle commands in `ppc`: `start`, `approve-red`, `refactor`, `finish`, `status`; each is all-or-nothing and `finish` measures the diff from git | done, tested against real temporary repositories |
| Guard also locks tests in the refactor phase and keeps approvals human-only | done (unit tests) |
| `ppc approve-slice`, and a guard rule against agents writing decision fields (`approved_by` and similar) into `.sddpp/` | done, each rule broken on purpose to confirm a test fails |
| Planning with Spec Kit on one capability: constitution, `specify`, `plan`, `tasks` with the preset; slices came out contract-valid. [Findings](docs/slices-in-sdd.md) | observed once |
| Guard registered into Claude Code through Spec Kit and honored | spiked — [findings](docs/spike-findings.md) |
| `sddpp-slices` preset: template override and command wrap | spiked |
| Spec Kit's `lean` preset adopted below ours; measured once: 3 files and 358 lines against 8 and 555, same slices, 24% cheaper | done, n = 1: [slices-in-sdd](docs/slices-in-sdd.md) |
| Budget and mutation exceptions are recorded by a human with `ppc finish --budget-reason` / `--mutation-reason`, which the guard refuses to an agent | done, each part broken on purpose |
| **Mutation testing**: `ppc mutation`, an optional gate in `ppc finish` (`budgets.min_mutation_score`), rule `M01`, and the guard blocking `mutation_override_reason`. First measurement on the demo: [mutation testing](docs/mutation-testing.md) | done (tests; each part broken on purpose); measured once on the demo |
| `ppc approve-debt`: a human decides on debt the AI proposed (open, accepted with a reason, or dropped) | done, each part broken on purpose to confirm a test fails |
| Slice-to-story link in the contract (`spec: { file, story }`), checked by `T15`; applied to three slices of the demo | done, each part broken on purpose |
| `ppc next` and `ppc overview`: whose turn it is and the exact command, and where the project stands. Meant for the person who comes back after a pause | done (tests; each rule broken on purpose). Whether it actually helps a person is **not measured** |
| Rule `W05`: every quality attribute is referenced by a live slice. It flags QA-003 in the demo, which no planned slice covers | done (warning, not an error) |
| Experiment instrument (`tools/eval`): tested measures, neutral acceptance tests for four slices, mutation score per run | done: [evaluation plan](docs/evaluation-plan.md) |
| Refactor phase exercised with a real agent (a refactor slice paying one debt entry, with a tempting request to touch the tests); `ppc finish` now marks the debt paid | done once, in a throwaway copy: [refactor exercise](docs/refactor-exercise.md) |
| **Adversarial pass over the test lock**: the guard recognises writes anywhere in a command and through interpreters, locks the `test` script, and only objects to *new* decisions; `check-git` adds `C06` (a test changed after the approved red commit, even by a commit the audit omits) and `C07` (test script changed) | done, each part broken on purpose to confirm a test fails: [lock-adversarial](docs/lock-adversarial.md) |
| **M1:** one slice end to end with real agents (design tool run, red, review, green, audit, close). The reviewer was a stand-in | done, with limits: [report](docs/m1-report.md) |

## Next

| Item | Why |
|---|---|
| `check-git`: detect commits of a slice that its audit leaves out, for anything other than tests | `C06` closes this for test files only; an omitted production commit still goes unnoticed |
| Session-start check that the guard script is present | The dispatcher fails open when the script is missing |
| Approval gates as a Spec Kit workflow, and the agent prompts (`sddpp-cycle`, drafted; exercised in M1) | The `ppc` side of the loop exists and is tested; the agent side is new |
| Mutation gate in a real slice cycle: set `min_mutation_score` in a project and close a slice through it | The gate and `ppc mutation` exist and are tested (M1 finding 4); first measurement on the demo is in [mutation testing](docs/mutation-testing.md) |
| **M2, remaining:** a workflow with approval gates. SL-002, a slice with a dependency, is closed, and a person approved its red tests. The refactor phase and a harder test of the lock are done (see Foundation) | Planning, red, green, audit and close of a second slice, a refactor slice and an adversarial pass over the lock are done |
| **Prove the benefit:** done once, 45 runs: the claim is **not supported** at slice size ([report](docs/experiment-report.md)). Next is a decision, not a task: simplify the method, or run a study built to see what this one could not (pressure, length, a real reviewer) | T matched a plain prompt on every measure and cost 2.5 times as much |
| Check that acceptance criteria agree across the spec, the slice and the quickstart | The slice-to-story link now exists (`spec`, rule `T15`); the criteria are still repeated in several files and their wording differs by formatting, so comparing them needs a structured form first |


## Later

| Item | Notes |
|---|---|
| **Architect.PP layer** over The Architect: a complexity budget (its defaults inflate scope), hand-off to the contract that regroups into vertical slices and drops its literal code, architecture tests | The Architect has now been run once; findings 1 and 2 of the [M1 report](docs/m1-report.md) |
| `install/`: one command that checks or installs the base tools at pinned versions | Pin Spec Kit and The Architect |
| Brownfield: characterization-test slices for existing code | |
| Contract v1.0 | After M1 and a second real project |

## Open questions

- Whether a slice file or Spec Kit's `tasks.md` should be the source of truth for status once both exist.
