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

## Next

| Item | Why |
|---|---|
| **M1 — One full cycle on the todo app:** design → one slice with red, green and audit | Proves the flow feels right before polishing anything |
| `check-git` extension: detect commits of a slice that its audit leaves out | The audit lists commits by hand; omissions go unnoticed today |
| Session-start check that the guard script is present | The dispatcher fails open when the script is missing |
| Approval gates as a Spec Kit workflow, and the agent prompts (`sddpp-cycle`, drafted; exercised in M1) | The `ppc` side of the loop exists and is tested; the agent side is new |
| Mutation-testing gate in the audit | Catches tests that pass but verify nothing |

## Later

| Item | Notes |
|---|---|
| **Architect.PP layer** over The Architect: quality attributes with numbers, complexity budget, architecture tests, hand-off to the contract | Needs a real run of The Architect first (read, never run) |
| `install/`: one command that checks or installs the base tools at pinned versions | Pin Spec Kit and The Architect |
| Brownfield: characterization-test slices for existing code | |
| Contract v1.0 | After M1 and a second real project |

## Open questions

- Whether a slice file or Spec Kit's `tasks.md` should be the source of truth for status once both exist.
