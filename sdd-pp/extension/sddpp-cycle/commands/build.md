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
- If the design is wrong or silent about something this slice needs, **stop**. Do not decide it yourself and do not work around it: open a change request with `ppc change-request --slice <id> --title ... --problem ... --proposal ... --qa|--component|--adr ...` and put it to the person (see **When the person decides**). If they accept it, the design is revised (`/speckit-architect-pp-apply-change`) before you go on; if not, go on without it, or stop and say what is blocked.
- Respect the component boundaries in `.architect/architecture.md`. Nothing hardcoded that varies per environment.
- Never approve anything and never write a decision field: those belong to people.

## When the person decides

Approving a slice or its red tests, accepting or rejecting a change request, deciding a debt entry, an exception to the
budget or the mutation score, and saying they read what changed in the design are the person's decisions. Never give them
a command to type in a terminal. Instead:

1. Run `ppc show <id>` and say in your own words what it is and what each choice means. Write every file they should
   read as a link, `[path](path)`.
2. Run `ppc ask <id>` (for an exception: `ppc ask <slice> --budget-reason "<the reason you propose>"`, or
   `--mutation-reason`) and ask exactly that question with the AskUserQuestion tool: the same options in the same order,
   without an `answers` field. You may put the words in the person's language; everything after the last ` — ` stays as
   printed. Before the panel, say in one line per option what happens if they pick it.
3. Run the command of the option they picked, exactly. For any other answer, run no approval. Only if the guard refuses
   the command, say so and give them the command to run themselves.

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
