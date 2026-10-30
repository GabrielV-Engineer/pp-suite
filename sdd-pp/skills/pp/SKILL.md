---
name: pp
description: "PP: do the next step of this pp-suite project, or put the next decision to the person here in the chat. Use it whenever the person asks what to do next or says to continue."
argument-hint: "[nothing, or an id such as SL-002]"
allowed-tools: Bash(ppc next *) Bash(ppc show *) Bash(ppc ask *) Bash(ppc additions *) Bash(ppc start *)
---

State of the project, from `ppc next --json` (if this block is empty or says it failed, run `ppc next --json` yourself):

!`ppc next --json`

## What to do, by `kind`

Talk to the person in the language they write in, briefly. Do **one** step, then say what `/pp` will do next. Never chain two
agent steps without them.

- **`decision`**: a person decides, you carry it out.
  - For a slice, its red tests, a debt entry or a change request:
    1. Read what is being decided: `ppc show <decision.id>`. Say it in your own words in this message: what it is, what approving
       it means, what it leaves out. Do not paste the raw card.
    2. Get the question: `ppc ask <decision.id>`. Ask it with the AskUserQuestion tool: the same question and options, in the same
       order, without an `answers` field, with `questions` as a list and not as text. You may put the words of the question and of each option in the person's language, but
       **everything after the last ` — ` of an option is a command and must stay exactly as printed.**
    3. If the person picked an option that ends with ` — ppc …`, run exactly that command. Their choice is the approval, so Claude
       Code will not ask a second time. If they picked anything else ("I want to change something", "Not yet", their own words), run
       no approval: for a change, ask what to change; otherwise stop.
    4. If the command is refused, say so and give the person the command to run in a terminal. Do not look for another way around.
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

## Rules

- You never decide for the person: not an approval, not a debt, not a change request, not an addition they did not tell you to
  cut or keep. When the choice is theirs, ask.
- Never write an approval or decision field (`approved_by`, `decided_by`, `red_approved_by`, ...) by hand.
- Report what `ppc` printed; do not describe what you think it did.
