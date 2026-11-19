---
description: "AUDIT: record debt and deviations, then close the slice with ppc finish"
---

## User input

```text
$ARGUMENTS
```

## Rules for this phase

- Be honest. The audit exists so a person can review a slice in minutes: say what you cut, what you
  assumed and what you were unsure about.
- You may **propose** debt (`status: proposed`). Never set `approved_by`: only a human decides.
- Never provide the sizes or the mutation score. `ppc finish` measures production and test lines from git, and,
  when the blueprint sets `budgets.min_mutation_score`, runs mutation testing itself (it can take minutes).
- If `ppc finish` refuses because the mutation score is below the gate, do **not** write
  `mutation_override_reason` yourself and do not edit tests (they are locked). Stop, report the score and
  the surviving mutants, and put the choice to the person: a recorded exception (`ppc ask <id> --mutation-reason "<the
  reason you propose>"`, see **When the person decides**), or reopening the tests.
- For every surviving mutant you leave, propose a debt entry of kind `test` instead of hiding it.
- If `ppc finish` refuses because the slice exceeded the production-code budget (`B01`), do **not** write
  `budget_override_reason` yourself and never pass `--budget-reason` unless the person picked that command in the panel (the
  guard blocks it otherwise). An exception to the budget is the person's decision: report the measured size and what it is
  made of, then put it to them (`ppc ask <id> --budget-reason "<the reason you propose>"`, see **When the person decides**);
  the other way out is to split the slice.
- Tests are measured from git, not reported. If the slice changed no test files, `ppc finish` refuses it when the test policy
  is `required`, and otherwise proposes a debt entry of kind `test` itself: do not write that entry yourself, and do not
  claim tests that are not in the commits. A person decides on the proposal (see **When the person decides**).
- Say what you verified and what you did not. Run the project's tests and type check before finishing; if
  a command is refused, write that in the deviations instead of implying it passed.

## When the person decides

Approving a slice, its red tests or a screen's mockup, accepting or rejecting a change request, deciding a debt entry or a standard (security, observability, git, CI), an exception to the
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

1. Run `ppc status`. The slice must be in the green or refactor phase (strict cycle) or the build phase (light cycle), with everything committed.
2. Identify the slice's commits with `git log --oneline` and their message prefixes: `red(<id>)`,
   `green(<id>)`, `refactor(<id>)` or, in the light cycle, `build(<id>)`. Use the full sha you see in `git log`.
3. **The real app.** If the slice lists `screens`, open the real app, not a test double: run `app.check` from
   `.architect/ui.md`. If it has none, write that command inside the project in this slice (a script that starts the app
   with synthetic data, opens each screen and saves a screenshot), commit it with the slice, and name it in `app.check` in
   a separate commit `docs(design): app.check`, which you do not list in the audit; the next slices reuse it. Save a screenshot of each
   screen the slice builds to under `.sddpp/ui-checks/<slice id>/`, read the console, and compare each screenshot with the
   approved mockup of that screen and with `.architect/ui.md` (states, tokens, words, contrast). Show the person the
   screenshots and the mockups as links, side by side. A difference becomes a deviation, or a debt entry if it stays; a
   console error is a fault to fix before closing. With no capture tool, open the app, say what you saw, and give the reason
   in `no_screenshots_reason`. The first real project's interface failed at start-up for 23 slices because every test used
   a double that was always ready.
4. **Debt.** For every shortcut, compromise or known weakness you introduced or noticed, add an entry to
   the debt register `.sddpp/debt.yaml` (create it with `entries:` if it does not exist). Name the owning component in
   `component:`, and use the next free id for it (`DEBT-<code>-NNN`, the code is in `.architect/blueprint.yaml`):

   ```yaml
   - id: DEBT-BE-002
     component: backend
     title: "<short title>"
     description: "<what is compromised and why>"
     kind: design   # duplication | design | test | performance | security | dependency | documentation | accessibility | other
     origin: { type: slice, ref: <slice id> }
     created: <today, YYYY-MM-DD>
     proposed_by: ai
     cost_of_delay: { level: low, rationale: "<why it is or is not urgent>" }
     trigger: "<when it must be paid>"
     status: proposed
   ```

   If a slice already planned should pay it (the next one that touches the same component, say), name that slice in the
   trigger and, in step 9, ask with `--pay-in <that slice>`, so the slice is tied to it and not only named in text.

   Put every piece of free text (`title`, `description`, `rationale`, `trigger`) in double quotes, and write a double quote inside
   it as `\"`. A comma, a colon or a `#` in unquoted text breaks the register, and `ppc finish` then refuses the whole file.

   If there is none, say so explicitly. Do not invent debt to look thorough.
5. **Deviations.** List anything that differs from the slice or the blueprint, or that you decided
   without a record. If a decision needs an ADR, say so in the deviations; do not write ADRs.
   **Standards.** For each standard the slice's card lists under "Standards" (`ppc show <id>`), say in the deviations
   whether the slice met it. What it did not meet is debt (step 4), with the matching `kind` (`security` for security).
6. Write the audit input as `.sddpp/audit-input.json`:

   ```json
   {
     "commits": [{ "sha": "<full sha>", "kind": "red" }, { "sha": "<full sha>", "kind": "green" }],
     "tests_added": <number of test cases you added>,
     "decisions": [],
     "debt_created": ["DEBT-BE-002"],
     "deviations": ["<text>"]
   }
   ```

   Kinds: `red`, `green`, `refactor`, `build`, `structural`, `docs`. Do not add `mutation_score`: `ppc finish` rejects it.

   Run the project's whole test suite, not only the slice's tests, and add `"suite": { "command": "<what ran it>", "failed":
   <how many failed> }`. If any failed, inside the slice or not, propose a debt entry of kind `test` for them (step 4) and
   list it in `debt_created`: `ppc finish` refuses a failed suite without one, so the failure reaches the person.

   If the slice lists `screens`, add the check of step 3: `"ui_check": { "command": "<what opened the real app>",
   "console_errors": <how many>, "screenshots": [".sddpp/ui-checks/<slice id>/SCR-01.png"] }` (or `"screenshots": []` with
   `"no_screenshots_reason"`). `ppc finish` does not close a slice with screens without it, and checks the screenshots exist.

   If the slice pays debt (`pays` in the slice file), account for every entry, checking each against the diff, not against
   the plan: `"debt_paid": ["DEBT-…"]` for what the commits fixed, and `"debt_unpaid": [{ "id": "DEBT-…", "reason": "<why
   not>" }]` for what they did not. A feature slice does not close without this account. What is not paid is open again,
   and `ppc next` asks the person which slice pays it now.
7. Run `ppc finish <id> --audit .sddpp/audit-input.json`. If it refuses, read why, fix the cause and run
   it again. It either closes the slice or changes nothing.
8. Delete `.sddpp/audit-input.json` and commit the bookkeeping with `chore(<id>): close slice`.
9. Report to the person: what shipped, the measured size, the deviations, the debt paid and not paid, and the debt proposed.
   Then put each proposed debt entry to them, one question each (`ppc ask DEBT-…`, with `--pay-in <slice>` when a planned
   slice should pay it; see **When the person decides**), and each entry left unpaid (`ppc ask DEBT-… --pay-in <slice>`).
