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
- If the design is wrong or silent about something this slice needs, **stop**. Do not decide it yourself and do not work around it: open a change request with `ppc change-request --slice <id> --title ... --problem ... --proposal ... --qa|--component|--adr ...` and put it to the person (see **When the person decides**). If they accept it, the design is revised (`/pp-change`) before you go on; if not, go on without it, or stop and say what is blocked.
- Never edit the slice's state yourself (`.sddpp/active.json`, `status`, `phase`). Use `ppc`.

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
3. Run the command of the option they picked, exactly, right away, before anything else: an answer is good for 30
   minutes, once. For any other answer, run no approval. Only if the guard refuses
   the command, say so and give them the command to run themselves.

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
6. **Stop.** The tests are committed and their approval is the person's: put it to them (see **When the person decides**;
   the id is the slice's, and each test file is a link). Run the approval only if they pick it in the panel; the guard
   lets it through then and blocks it otherwise.
