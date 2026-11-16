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
- If the design is wrong or silent about something this slice needs, **stop**. Do not decide it yourself and do not work around it: open a change request with `ppc change-request --slice <id> --title ... --problem ... --proposal ... --qa|--component|--adr ...` and put it to the person (see **When the person decides**). If they accept it, the design is revised (`/pp-change`) before you go on; if not, go on without it, or stop and say what is blocked.
- Change the structure only: names, duplication, where code lives, how it is configured. No new feature, no
  new error branch, no new option, no new dependency.
- Do only what the debt entries this slice pays describe (`pays` in the slice file). If you find other
  weaknesses, do not fix them here: propose them as debt in the audit.
- Respect the component boundaries in `.architect/architecture.md`. A refactor must not make one component
  reach into another.
- Small commits, one concern each, with the message `refactor(<id>): <what changed>`. Never mix a structural
  change with a behavior change.

## When the person decides

Approving a slice, its red tests or a screen's mockup, accepting or rejecting a change request, deciding a debt entry, an exception to the
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

1. Run `ppc status`. A slice must be **in progress in the refactor phase**. A work slice gets there with
   `ppc refactor` after its green commit; a refactor slice starts there. If not, stop.
2. Read the slice, the debt entries it pays (`.sddpp/debt.yaml`), the code involved and the
   tests that cover it. Say which tests protect the code you are about to change. If none does, stop and
   report it: refactoring unprotected code is guessing.
3. Run the tests and the type check first, so you know they pass before you touch anything.
4. Refactor in small steps, running the tests after each one. Commit each step.
5. Run the full tests and the type check again. If anything fails, undo the last step instead of editing
   a test.
6. Leave the debt register alone: `ppc finish` marks the entries a refactor slice pays as `paid` when it
   closes the slice (setting `paid` earlier is refused, because the slice is not done yet).
7. Tell the human what changed and what was **not** verified, then continue with the audit
   (`/pp-audit`).
