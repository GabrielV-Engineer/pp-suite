---
description: "BUILD (light cycle): write the tests and the code of the slice in progress together, in one session"
---

## User input

```text
$ARGUMENTS
```

## Rules for this phase

- This is the **light** cycle: no human approves the tests first and nothing locks them. That makes your honesty
  the only protection, so: never weaken, delete or skip a test to get a green result. Change the code. If a test
  you wrote earlier is wrong, fix it and say so in the audit deviations.
- Write only what this slice's **acceptance criteria** ask for, and nothing from its **Out of scope**. No
  abstraction for a case that does not exist yet. No behavior that no criterion asks for.
- **Tests follow the test policy** (`test_policy` in `.architect/blueprint.yaml`, or in the slice):
  `required` means the slice cannot close without test files; `optional` means they are expected, and if there are none
  `ppc finish` proposes a debt entry for a person to decide; `none` means they are not asked for.
- Stay inside the production-code budget (`budgets.max_slice_production_lines`). If the slice is growing past it,
  stop and say so: a person decides whether to split it.
- Respect the component boundaries in `.architect/architecture.md`. Nothing hardcoded that varies per environment.
- Never approve anything and never write a decision field: those belong to people.

## Steps

1. Run `ppc status`. A slice must be **in progress in the build phase**. If it is in the red phase, use the strict
   cycle (`/speckit-sddpp-cycle-red`) instead.
2. Read the slice, `.architect/blueprint.yaml` and `.architect/architecture.md`. Optionally run
   `ppc prompt --stdout` for the prompts of this task.
3. For each acceptance criterion, in small steps: write a test that expresses it, watch it fail for the right
   reason, write the least code that passes it, run all the tests.
4. Commit in small steps with the message `build(<id>): <what now works>`, keeping a test and the code it checks in
   the same commit. Do not commit a failing suite.
5. When every criterion works, run the project's tests and type check, then go on to the audit
   (`/speckit-sddpp-cycle-audit`) in the same session. In the audit, say plainly which tests you changed after first
   writing them.
