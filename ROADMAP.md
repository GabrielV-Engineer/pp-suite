# Roadmap

Status key: **done** has tests in CI · **spiked** tried once by hand, not automated · **planned** not started.

## Foundation

| Item | Status |
|---|---|
| Contract v0.1 schemas (blueprint, slice, debt, ADR, evidence, change request, active state) | done |
| `ppc validate`: 30 rules (parsing, schema, cross-references, lifecycle, budget, generated views), each with a test | done |
| `ppc generate`: WBS and one debt table per component, with a staleness check | done |
| Worked example (`examples/todo-app`), planning stage, validated in strict mode | done |
| Test-lock guard with fail-closed state handling (`sdd-pp/extension/sddpp-guard`) | done (unit tests) |
| Guard registered into Claude Code through Spec Kit and honored | spiked — [findings](docs/spike-findings.md) |
| `sddpp-slices` preset: template override and command wrap | spiked |

## Next

| Item | Why |
|---|---|
| **M1 — One full cycle on the todo app:** design → one slice with red, green and audit | Proves the flow feels right before polishing anything |
| `ppc check-git`: a green commit must not touch test files; audit commits and diff size must match git | The real check behind the guard, and the missing half of the audit |
| Session-start check that the guard script is present | The dispatcher fails open when the script is missing |
| SDD.PP commands: `red`, `green`, `audit`, `debt`, and the approval gates as a Spec Kit workflow | The loop itself |
| Mutation-testing gate in the audit | Catches tests that pass but verify nothing |

## Later

| Item | Notes |
|---|---|
| **Architect.PP layer** over The Architect: quality attributes with numbers, complexity budget, architecture tests, hand-off to the contract | Needs a real run of The Architect first (read, never run) |
| `install/`: one command that checks or installs the base tools at pinned versions | Pin Spec Kit and The Architect |
| Brownfield: characterization-test slices for existing code | |
| Contract v1.0 | After M1 and a second real project |

## Open questions

- License for the repository (none chosen yet).
- Whether a slice file or Spec Kit's `tasks.md` should be the source of truth for status once both exist.
