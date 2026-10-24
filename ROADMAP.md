# Roadmap

Status key: **done** has tests in CI · **spiked** tried once by hand, not automated · **planned** not started.

## Foundation

| Item | Status |
|---|---|
| Contract v0.1 schemas (blueprint, slice, debt, ADR, evidence, change request, active state) | done |
| `ppc validate`: parsing, schema, cross-reference, lifecycle, budget and generated-view rules, each with a test that makes it fire (`ppc rules` lists them all, `check-git` rules included) | done |
| Shared definition of "test file" (`contract/v0.1/test-path-cases.json`), tested by both the guard and `ppc` | done |
| `ppc generate`: WBS and one debt table per component, with a staleness check | done |
| `ppc check-git`: audits are checked against real git history (commits exist, green/refactor leave tests untouched, red has no production code, diff size is true, red precedes green) | done, tested against real temporary repositories |
| Worked example (`examples/todo-app`), planning stage, validated in strict mode | done |
| Test-lock guard with fail-closed state handling (`sdd-pp/extension/sddpp-guard`) | done (unit tests) |
| Slice cycle commands in `ppc`: `start`, `approve-red`, `refactor`, `finish`, `status`; each is all-or-nothing and `finish` measures the diff from git | done, tested against real temporary repositories |
| Guard also locks tests in the refactor phase and keeps approvals human-only | done (unit tests) |
| Guard registered into Claude Code through Spec Kit and honored | spiked — [findings](docs/spike-findings.md) |
| `sddpp-slices` preset: template override and command wrap | spiked |
| **M1:** one slice end to end with real agents (design tool run, red, review, green, audit, close). The reviewer was a stand-in | done, with limits: [report](docs/m1-report.md) |

## Next

| Item | Why |
|---|---|
| **Diff budget that fits reality:** count production code only, excluding generated files, with its own budget for tests | M1: 429 changed lines against 200, of which tests 240 and a lockfile 75 (finding 3) |
| Human-only budget exception and `ppc approve-debt` | Both are fields an agent could write; today the agent chose not to (findings 5, 6) |
| Rule: every quality attribute is referenced by a slice | QA-003 had no slice and nothing noticed (finding 7) |
| `check-git` extension: detect commits of a slice that its audit leaves out | The audit lists commits by hand; omissions go unnoticed today |
| Session-start check that the guard script is present | The dispatcher fails open when the script is missing |
| Approval gates as a Spec Kit workflow, and the agent prompts (`sddpp-cycle`, drafted; exercised in M1) | The `ppc` side of the loop exists and is tested; the agent side is new |
| Mutation-testing gate in the audit | M1: green added a 503 branch, a default port and a loopback bind that no test covers (finding 4) |
| **M2:** a second slice with a dependency and a refactor phase, Spec Kit's `specify`/`plan`/`tasks` and a workflow with approval gates, a person reviewing the tests, and a harder test of the lock | Everything M1 did not cover |

## Later

| Item | Notes |
|---|---|
| **Architect.PP layer** over The Architect: a complexity budget (its defaults inflate scope), hand-off to the contract that regroups into vertical slices and drops its literal code, architecture tests | The Architect has now been run once; findings 1 and 2 of the [M1 report](docs/m1-report.md) |
| `install/`: one command that checks or installs the base tools at pinned versions | Pin Spec Kit and The Architect |
| Brownfield: characterization-test slices for existing code | |
| Contract v1.0 | After M1 and a second real project |

## Open questions

- Whether a slice file or Spec Kit's `tasks.md` should be the source of truth for status once both exist.
