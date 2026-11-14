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
- If the design is wrong or silent about something this slice needs, **stop**. Do not decide it yourself and do not work around it: open a change request with `ppc change-request --slice <id> --title ... --problem ... --proposal ... --qa|--component|--adr ...` and put it to the person (see **When the person decides**). If they accept it, the design is revised (`/pp-change`) before you go on; if not, go on without it, or stop and say what is blocked.
- Respect the component boundaries in `.architect/architecture.md`.
- No hardcoded values: anything that varies per environment comes from configuration.

## When the person decides

Approving a slice or its red tests, accepting or rejecting a change request, deciding a debt entry, an exception to the
budget or the mutation score, and saying they read what changed in the design are the person's decisions. Never give them
a command to type in a terminal. Instead:

1. Run `ppc show <id>` and say in your own words what it is and what each choice means. Write every file they should
   read as a link, `[path](path)`.
2. Run `ppc ask <id>` (for an exception: `ppc ask <slice> --budget-reason "<the reason you propose>"`, or
   `--mutation-reason`) and ask exactly that question with the AskUserQuestion tool: the same options in the same order,
   without an `answers` field. You may put the words in the person's language; everything after the last ` — ` stays as
   printed. Before the panel, say in one line per option what happens if they pick it. For a debt entry that a planned
   slice touching its component should pay, add `--pay-in <that slice>`: debt left open with no slice to pay it is
   forgotten. When a slice's card says "Ask before approving it", put each entry it names to them (`ppc ask DEBT-… --pay-in
   <slice>`) before the slice's own approval.
3. Run the command of the option they picked, exactly, right away, before anything else: an answer is good for 30
   minutes, once. For any other answer, run no approval. Only if the guard refuses
   the command, say so and give them the command to run themselves.

## Steps

1. Run `ppc status`. A slice must be **in progress in the green phase** (the human approved the red
   tests). If not, stop.
2. Read the slice, its tests, `.architect/blueprint.yaml` and `.architect/architecture.md`.
3. Write the production code. Run the tests after each step until they all pass, and run any
   architecture checks the project has.
4. Commit only production code, with the message `green(<id>): <what now works>`.
5. Optional cleanup: run `ppc refactor`, improve the structure without changing behavior, run the tests
   again, and commit with `refactor(<id>): <what changed>`. Tests stay locked.
6. Tell the human the slice is ready for the audit (`/pp-audit`).
