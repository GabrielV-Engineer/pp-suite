---
description: "RED: write the failing tests for the slice in progress, commit them, stop for human approval"
---

## User input

```text
$ARGUMENTS
```

## Rules for this phase

- You write **tests only**. No production code, no stubs, no configuration of the application.
- The tests are the specification. A person will read them and approve them before any code exists,
  so make them easy to read.
- If the design is wrong or silent about something this slice needs, **stop**. Do not decide it yourself and do not work around it: open a change request with `ppc change-request --slice <id> --title ... --problem ... --proposal ... --qa|--component|--adr ...`, tell the human, and wait. A person decides.
- Never edit the slice's state yourself (`.sddpp/active.json`, `status`, `phase`). Use `ppc`.

## Steps

1. Run `ppc status`. A slice must be **in progress in the red phase**. If not, stop and tell the human
   which `ppc start <slice>` to run.
2. Read the slice file `.sddpp/slices/<id>-*.md` (acceptance criteria, components, **Out of scope**),
   `.architect/blueprint.yaml` (components, quality attributes, non-goals) and
   `.architect/architecture.md` (boundary rules). Read existing code only to learn where tests belong and
   which names already exist.
3. Write at least one test per acceptance criterion, named after it (`AC-1`, `AC-2`, ...). Test behavior
   through the public interface (an HTTP endpoint, an exported function), never internals. Put tests and
   their fixtures where a test path matches: `tests/`, `*.test.*`, `*.spec.*`, `test_*`.
   Test what the slice asks for and nothing from its **Out of scope**.
4. Run the tests. They must **fail, and for the right reason**: the behavior does not exist yet, not a
   typo or a syntax error. Show the failing output.
5. Commit only the tests, with the message `red(<id>): <what the tests specify>`.
6. **Stop.** Tell the human: the tests are committed; they should read them and approve by running
   `ppc approve-red --by <their name>` themselves (in Claude Code, prefix it with `!`). Do not run it
   yourself; the guard blocks it on purpose.
