---
description: "GREEN: write the least production code that passes the approved tests"
---

## User input

```text
$ARGUMENTS
```

## Rules for this phase

- The tests are **locked**: a guard blocks editing them. If a test looks wrong, do not look for a way
  around it. Stop and tell the human, who can reopen the red phase.
- Write the **least code that makes the tests pass**. Nothing for requirements that are not in this
  slice's acceptance criteria, and nothing from its **Out of scope**. No abstraction for a case that
  does not exist yet.
- **No behavior that no test asks for**: no extra error branch, default value or option, even if the
  design describes it. If the design calls for it, say so in your report so the human can ask for a test
  in a new red phase. Untested code is code that nothing would notice breaking.
- If the design is wrong or silent about something this slice needs, **stop**. Do not decide it yourself and do not work around it: open a change request with `ppc change-request --slice <id> --title ... --problem ... --proposal ... --qa|--component|--adr ...`, tell the human, and wait. A person decides.
- Respect the component boundaries in `.architect/architecture.md`.
- No hardcoded values: anything that varies per environment comes from configuration.

## Steps

1. Run `ppc status`. A slice must be **in progress in the green phase** (the human approved the red
   tests). If not, stop.
2. Read the slice, its tests, `.architect/blueprint.yaml` and `.architect/architecture.md`.
3. Write the production code. Run the tests after each step until they all pass, and run any
   architecture checks the project has.
4. Commit only production code, with the message `green(<id>): <what now works>`.
5. Optional cleanup: run `ppc refactor`, improve the structure without changing behavior, run the tests
   again, and commit with `refactor(<id>): <what changed>`. Tests stay locked.
6. Tell the human the slice is ready for the audit (`/speckit-sddpp-cycle-audit`).
