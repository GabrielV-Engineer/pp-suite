---
name: pp
description: "PP: do the next step of this pp-suite project, or put the next decision to the person here in the chat. Use it whenever the person asks what to do next or says to continue."
argument-hint: "[nothing, or an id such as SL-002]"
allowed-tools: Bash(ppc next *) Bash(ppc show *) Bash(ppc additions *) Bash(ppc start *)
---

State of the project, from `ppc next --json` (if this block is empty or says it failed, run `ppc next --json` yourself):

!`ppc next --json`

## What to do, by `kind`

Talk to the person in the language they write in, briefly. Do **one** step, then say what `/pp` will do next. Never chain two
agent steps without them.

- **`decision`**: a person decides, you carry it out.
  1. Read what is being decided: `ppc show <decision.id>` (for `additions`: `ppc additions`). Show it in your own words in this
     message: what it is, what approving it means, what it leaves out. Do not paste the raw card.
  2. If there are more than two outcomes (a debt entry: pay it later, live with it, drop it; a change request: accept or reject),
     ask which with the question panel (AskUserQuestion), one option per outcome, and use the answer.
  3. Run the command: `ppc approve <id>` (slice or red tests), `ppc approve <id> --accept "<reason>"` or `--drop` (debt),
     `ppc decide-change <id> --accept` or `--reject --reason "<why>"` (change request), or for additions
     `ppc decide-addition --accept-recommended --but-cut <ids> --but-keep <ids> --reason "<why>"`.
     Claude Code asks the person to confirm approvals: that confirmation is the decision. If it is refused or blocked, say so and
     give the person the command to run in a terminal. Do not look for another way around it.
  4. Run `ppc next --json` and report in two lines.
- **`agent-step`**: run the skill named in `skill` with the Skill tool (pass the id from `$ARGUMENTS`, if any).
- **`run`**: run the `command` (for example `ppc start SL-001`), then `ppc next --json`.
- **`human-step`**: tell the person what to do and with which command (for example The Architect's interview). Do not run it.
- **`none`**: say what the headline says.

## Rules

- You never decide for the person: not an approval, not a debt, not a change request, not an addition they did not tell you to
  cut or keep. When the choice is theirs, ask.
- Never write an approval or decision field (`approved_by`, `decided_by`, `red_approved_by`, ...) by hand.
- Report what `ppc` printed; do not describe what you think it did.
