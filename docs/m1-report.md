# M1 report: one slice, end to end

Run on 2026-10-24. Goal: find out whether the flow holds up with real agents, using a small project
(a personal task list), from the design tool to a closed and audited slice. Everything below was
observed; what was not tested is listed at the end.

## What was run

| Stage | What happened |
|---|---|
| Design | [The Architect](https://github.com/Hainrixz/the-architect) v2.6.0 (commit `a25b09e`), in clone mode, driven non-interactively. First time it was run rather than read. |
| Hand-off | Done **by hand**: the blueprint became `.architect/` as defined by the contract. |
| Slice SL-001 | A skeleton slice cycled through `ppc start`, a red session, a human review, `ppc approve-red`, a green session, an audit session and `ppc finish`. Each agent session was a fresh, non-interactive Claude Code session with the guard installed through Spec Kit. |

The resulting project is a local repository (`todo-app-m1`, not published): five commits, 1,059 lines
excluding Spec Kit's generated files.

## Important limit: the reviewer was a stand-in

The human approvals (the slice, the red tests, the debt, the budget exception) were given under the name
`m1-demo-reviewer` by the session that orchestrated the run, not by a person who read the tests on
their own time. The run shows that the **gates work mechanically**. It does not show that people review
well under them.

## Numbers

| Stage | Duration | Cost | Output |
|---|---|---|---|
| The Architect: interview | 2.4 min | 0.65 USD | One dense proposal |
| The Architect: blueprint generation | 18 min | 4.23 USD | One file, 1,948 lines, 10 steps |
| Red, first round | 1.1 min | 0.28 USD | 3 test files, 206 lines |
| Red, second round (after review) | 0.5 min | 0.19 USD | 1 test file, 34 lines |
| Green | 0.9 min | 0.26 USD | 8 files, 189 lines |
| Audit | 0.7 min | 0.21 USD | Audit input, 2 debt proposals |

The first attempt at the generation turn was killed by a tool time limit, and its cost is not counted.
For this slice, design cost about five times what the build loop did (4.88 USD against 0.95 USD).

## What worked

- **The red/green/audit prompts were followed.** The red agent wrote only tests, saw them fail for the
  right reason (a missing module, not a typo), committed only tests and stopped asking for approval
  without trying to approve. The green agent committed only production code. No commit touched a test
  file after the red phase, and `ppc check-git` agrees.
- **Reviewing the red tests caught a real gap.** The first AC-1 test only checked that
  `/api/health` returned `{"status":"ok"}`, so an implementation that never opened the database passed.
  The slice text said the health check "really asks the database" but no criterion required it. The
  reviewer added AC-5, a second red round tested that the file is a real SQLite database, and the green
  code had to open one. This is the case for the human gate.
- **The audit agent escalated instead of self-approving.** `ppc finish` refused with `B01` (429 changed
  lines against a budget of 200). The agent did not write the budget exception itself; it said the
  decision was the human's and listed the options. It also declared its deviations candidly: a 503 branch no test covers, durability pragmas no test reads back, and an interface
  choice that may deserve an ADR.
- **`finish` is all-or-nothing.** Given a malformed debt file (a comma inside an inline YAML value, the
  reviewer's own mistake) it refused before changing anything. When it closed the slice, the diff it
  measured from git (429) matched a manual breakdown exactly (tests 240, production 114, lockfile 75).
- **The design tool honored the scope fence.** Every item the owner excluded appears in its non-goals
  table with a reason and a "revisit when" trigger.

## Findings

| # | Finding | Evidence | Proposed action |
|---|---|---|---|
| 1 | **The design tool inflates scope by default.** Unprompted, the first proposal added soft delete with undo, reopening tasks, a systemd unit, daily snapshots, a WCAG programme and browser end-to-end tests, for a one-person list. They were cut only because the user pushed back. A user without the experience to push back would have accepted them. | Interview turn 1 | This is the job of Architect.PP's complexity budget: defaults must be minimal, and each addition needs a requirement. |
| 2 | **The blueprint's step order is layered, and its steps carry literal code.** Steps 2 to 7 are database and API with no interface; the first behavior a person can use is step 9 of 10. Tests are written in the same step as the code. Its first steps contain the code to paste, "exactly this content". | Blueprint step map and step 1 | Use its design (stack, routes, boundaries), not its task graph, and do not give the builder its code. The hand-off must regroup into vertical slices. |
| 3 | **The diff budget does not fit a skeleton slice.** 429 lines against 200, of which tests 240 and a generated lockfile 75. | `ppc finish` output | **Resolved after this run:** the budget now counts hand-written production code only. Tests and lockfiles are excluded, and an audit records `production_lines` and `test_lines` separately. The skeleton's 114 production lines fit. |
| 4 | **Green added behavior no test asked for.** The 503 answer, the default port and the loopback bind have no test. A mutation of any of them would survive. | Audit deviations; DEBT-BE-003 | A mutation-testing gate. Meanwhile the green prompt now forbids untested behavior (see below). |
| 5 | **The budget exception is a field any agent can write.** The agent chose not to, but nothing prevents it. | `budget_override_reason` | A human-only command, like `approve-red`, guarded in the same way. |
| 6 | **Debt has no approval command.** The reviewer edited YAML by hand to approve it. | Debt registers | `ppc approve-debt`. |
| 7 | **Nothing ties quality attributes to slices.** QA-003 (foreign Host and Origin rejected) has no slice, and no rule notices. | Blueprint and slices | A warning rule: every quality attribute should be referenced by a slice. |
| 8 | **The guard was not exercised under pressure.** In the green session it blocked nothing: the agent never tried to edit a test. | Session transcript | The earlier spike covers one pressure case. A harder adversarial test is still needed. |
| 9 | **Reviewing is where the human's time goes.** The red tests (240 changed lines across three files) are the specification and the only thing the reviewer must read in full. | This run | Keep tests small and readable; consider a budget on test size. |
| 10 | **A formatting defect in `ppc start`.** Editing a slice rewrote `[a, b]` as `[ a, b ]` in lines it should not touch. | Diff after start | Fixed, with a test that checks exactly which lines change. |

## Changes made because of this run

- `ppc` keeps the formatting of lines it does not edit (finding 10), with a test written first.
- The audit prompt now says an agent must not write the budget exception, and must say what it did not
  verify. The green prompt now forbids behavior no test asks for. **These two prompt changes are not
  tested**: they were written after the run.

## Not covered by this run

- Spec Kit's `specify`, `plan` and `tasks` commands and its workflows with approval gates. The slice file
  was written by hand.
- The refactor phase, a second slice, and a slice that depends on another.
- Mutation testing (not built).
- A real person reviewing the tests.
- The test lock under an agent that actively looks for a way around it.
- Automating the hand-off from the design blueprint.
