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
- Never provide the diff size. `ppc finish` measures it from git.
- If `ppc finish` refuses because the slice exceeded the diff budget (`B01`), do **not** write
  `budget_override_reason` yourself. An exception to the budget is the human's decision. Stop and report
  the measured size, what it is made of, and the options (record an exception, or split the slice).
- Say what you verified and what you did not. Run the project's tests and type check before finishing; if
  a command is refused, write that in the deviations instead of implying it passed.

## Steps

1. Run `ppc status`. The slice must be in the green or refactor phase, with everything committed.
2. Identify the slice's commits with `git log --oneline` and their message prefixes: `red(<id>)`,
   `green(<id>)`, `refactor(<id>)`. Use the full sha you see in `git log`.
3. **Debt.** For every shortcut, compromise or known weakness you introduced or noticed, add an entry to
   the owning component's register `.sddpp/debt/<component>.yaml`. Use the next free id
   (`DEBT-<code>-NNN`, the code is in `.architect/blueprint.yaml`):

   ```yaml
   - id: DEBT-BE-002
     title: <short title>
     description: <what is compromised and why>
     kind: design   # duplication | design | test | performance | security | dependency | documentation | accessibility | other
     origin: { type: slice, ref: <slice id> }
     created: <today, YYYY-MM-DD>
     proposed_by: ai
     cost_of_delay: { level: low, rationale: <why it is or is not urgent> }
     trigger: <when it must be paid>
     status: proposed
   ```

   If there is none, say so explicitly. Do not invent debt to look thorough.
4. **Deviations.** List anything that differs from the slice or the blueprint, or that you decided
   without a record. If a decision needs an ADR, say so in the deviations; do not write ADRs.
5. Write the audit input as `.sddpp/audit-input.json`:

   ```json
   {
     "commits": [{ "sha": "<full sha>", "kind": "red" }, { "sha": "<full sha>", "kind": "green" }],
     "tests_added": <number of test cases you added>,
     "mutation_score": null,
     "decisions": [],
     "debt_created": ["DEBT-BE-002"],
     "deviations": ["<text>"]
   }
   ```

   Kinds: `red`, `green`, `refactor`, `structural`, `docs`.
6. Run `ppc finish <id> --audit .sddpp/audit-input.json`. If it refuses, read why, fix the cause and run
   it again. It either closes the slice or changes nothing.
7. Delete `.sddpp/audit-input.json` and commit the bookkeeping with `chore(<id>): close slice`.
8. Report to the human: what shipped, the measured size, debt proposed (they decide), and deviations.
