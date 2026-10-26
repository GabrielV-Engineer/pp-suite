---
description: "REFACTOR: pay technical debt without changing behavior, with the tests locked"
---

## User input

```text
$ARGUMENTS
```

## Rules for this phase

- Behavior does not change. The proof is that **the existing tests pass, untouched**. A guard blocks editing
  them. If a test has to change, the behavior is changing: stop and tell the human, who can reopen a red phase
  in a new slice.
- If the design is wrong or silent about something this slice needs, **stop**. Do not decide it yourself and do not work around it: open a change request with `ppc change-request --slice <id> --title ... --problem ... --proposal ... --qa|--component|--adr ...`, tell the human, and wait. A person decides.
- Change the structure only: names, duplication, where code lives, how it is configured. No new feature, no
  new error branch, no new option, no new dependency.
- Do only what the debt entries this slice pays describe (`pays` in the slice file). If you find other
  weaknesses, do not fix them here: propose them as debt in the audit.
- Respect the component boundaries in `.architect/architecture.md`. A refactor must not make one component
  reach into another.
- Small commits, one concern each, with the message `refactor(<id>): <what changed>`. Never mix a structural
  change with a behavior change.

## Steps

1. Run `ppc status`. A slice must be **in progress in the refactor phase**. A work slice gets there with
   `ppc refactor` after its green commit; a refactor slice starts there. If not, stop.
2. Read the slice, the debt entries it pays (`.sddpp/debt/<component>.yaml`), the code involved and the
   tests that cover it. Say which tests protect the code you are about to change. If none does, stop and
   report it: refactoring unprotected code is guessing.
3. Run the tests and the type check first, so you know they pass before you touch anything.
4. Refactor in small steps, running the tests after each one. Commit each step.
5. Run the full tests and the type check again. If anything fails, undo the last step instead of editing
   a test.
6. Leave the debt register alone: `ppc finish` marks the entries a refactor slice pays as `paid` when it
   closes the slice (setting `paid` earlier is refused, because the slice is not done yet).
7. Tell the human what changed and what was **not** verified, then continue with the audit
   (`/speckit-sddpp-cycle-audit`).
