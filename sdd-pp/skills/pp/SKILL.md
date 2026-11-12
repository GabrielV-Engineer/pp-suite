---
name: pp
description: "PP: do the next step of this pp-suite project, or put the next decision to the person here in the chat. Use it whenever the person asks what to do next or says to continue."
argument-hint: "[nothing, or an id such as SL-002]"
allowed-tools: Bash(ppc next *) Bash(ppc show *) Bash(ppc ask *) Bash(ppc additions *) Bash(ppc start *)
---

State of the project, from `ppc next --json` (if this block is empty or says it failed, run `ppc next --json` yourself):

!`ppc next --json`

## What to do

Talk to the person in the language they write in, briefly. Keep going on your own until the next decision is the person's:

If the person named an id (`$ARGUMENTS`, for example `SL-022`, `CR-0006` or `DEBT-PIPE-005`), decide that one first, as in
**When the person decides**, even when `ppc next` names another: they chose which. Then:

1. Read where the project stands: the block above the first time, `ppc next --json` every time after.
   If `answered` lists panel answers that nothing carried out (the session ended, for example), say what the person chose and
   when. If it is `fresh`, run its `command` now: the guard accepts it. If not, it expired: ask that decision again, saying what
   they chose before.
2. By `kind`:
   - **`agent-step`**: run the skill named in `skill` with the Skill tool, passing `args` when there are any, then go back to
     step 1. If `changes` holds a
     decision (a change request, or slices planned against an older design), put that to the person first: it can change the work.
   - **`run`**: run the `command` (for example `ppc start SL-001`), then go back to step 1.
   - **`decision`**: the decision is the person's: put it to them as in **When the person decides** (the id is `decision.id`).
     When the command they picked has run, go back to step 1. If they picked no command ("Not yet", "I want to change
     something", their own words), stop and do what they said.
     For the additions (`type: additions`): `ppc additions`, ask the person in the chat which to cut or keep, then
     `ppc decide-addition --accept-recommended --but-cut <ids> --but-keep <ids> --reason "<why>"`, and go back to step 1.
   - **`human-step`**: tell the person what to do (for example The Architect's interview) and stop. Do not run it.
   - **`none`**: say what the headline says and stop.
3. Also stop when a command fails or `ppc` or the guard refuses something (say what and why), and when a slice was closed
   (`ppc finish` succeeded): say what it delivered and what comes next, so the person can look before the next slice.
4. Before you stop, put to the person the decisions that wait in `waiting` (debt) and `changes`, one question each.
5. End with two lines: what was done in this run, and what happens at the next `/pp`.

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

## Rules

- You never decide for the person: not an approval, not a debt, not a change request, not an addition they did not tell you to
  cut or keep. When the choice is theirs, ask.
- Never write an approval or decision field (`approved_by`, `decided_by`, `red_approved_by`, ...) by hand.
- Report what `ppc` printed; do not describe what you think it did.
