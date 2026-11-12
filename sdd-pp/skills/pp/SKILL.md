---
name: pp
description: "PP: do the next step of this pp-suite project, or put the next decision to the person here in the chat. Use it whenever the person asks what to do next or says to continue."
argument-hint: "[nothing, or an id such as SL-002]"
allowed-tools: Bash(ppc next *) Bash(ppc show *) Bash(ppc ask *) Bash(ppc additions *) Bash(ppc start *)
---

State of the project, from `ppc next --json` (if this block is empty or says it failed, run `ppc next --json` yourself):

!`ppc next --json`

## What to do, by `kind`

If the person named an id (`$ARGUMENTS`, for example `SL-022`, `CR-0006` or `DEBT-PIPE-005`), decide that one first, as in
**When the person decides**, even when `ppc next` names another: they chose which.

Talk to the person in the language they write in, briefly. Do **one** step, then say what `/pp` will do next. Never chain two
agent steps without them.

- **`decision`**: a person decides, you carry it out, as in **When the person decides** below (the id is `decision.id`).
  - For the additions (`type: additions`): `ppc additions`, ask the person which to cut or keep in the chat, then
    `ppc decide-addition --accept-recommended --but-cut <ids> --but-keep <ids> --reason "<why>"`.
  - Afterwards run `ppc next --json` and report in two lines.
  - Decisions can also wait in `waiting` (a debt entry) or in `changes` (a change request, or slices planned against an older design,
    `type: reread`). After the main step, say in one line that they wait and offer to decide them now; if the person agrees, handle
    each the same way. For `reread`, `ppc show reread` says what changed in the design; do not run `ppc reread` before the person has
    read it and chosen the option.
- **`agent-step`**: run the skill named in `skill` with the Skill tool (pass the id from `$ARGUMENTS`, if any).
- **`run`**: run the `command` (for example `ppc start SL-001`), then `ppc next --json`.
- **`human-step`**: tell the person what to do and with which command (for example The Architect's interview). Do not run it.
- **`none`**: say what the headline says.

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

## Rules

- You never decide for the person: not an approval, not a debt, not a change request, not an addition they did not tell you to
  cut or keep. When the choice is theirs, ask.
- Never write an approval or decision field (`approved_by`, `decided_by`, `red_approved_by`, ...) by hand.
- Report what `ppc` printed; do not describe what you think it did.
