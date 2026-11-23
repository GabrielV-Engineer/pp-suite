---
description: "EXPERIENCE: carry out a review of what people meet, as a whole, against the rubric, and propose each finding as technical debt"
---

## User input

```text
$ARGUMENTS
```

A review id (`RV-001`) to carry out. Empty means the open review: `ppc next` lists it as waiting for you. If none is open, say
so, and that `ppc ask review` puts a review of the whole project to the person.

## What this step is

A review judges what was built **as a whole**, the way a critic or a tester who did not build it would: not "do the tests pass"
but "is it clear, consistent, readable, current and quick enough". The person chose how it is done (`mode` in the review file,
`.sddpp/reviews/RV-NNN-*.md`). You answer the rubric one criterion at a time, look at the real thing, and propose each concern as
an entry of technical debt. You do not decide anything: the person decides on that debt like on any other. See
`docs/standards.md` in pp-suite, "Experience".

## Rules

- **Honor the mode. It is the person's choice, and it is in the file.**
  - `guide`: run nothing. Write the person what to try (from the rubric and the acceptance criteria of the closed slices), what to
    look for in each place, and which tools could help. Every tool you name is a **suggestion by you, not verified by pp-suite**:
    say what it is, where it comes from and what it would show. Then wait for what they report, and write their words under
    "Answers", saying they are theirs.
  - `explain`: say in a few lines what you will check and how, then do it.
  - `delegate`: hand the review to a fresh subagent (the Agent tool in Claude Code), because a session that did not build it reads it
    as a stranger would. Give it the review file, `ppc rubric` for its surfaces and the closed slices, and tell it to read and run
    only what the person authorized (`ppc standards experience`, "Tools allowed", see **Tools** below), to install nothing and to
    write no file. It answers the rubric and proposes the findings; you check the main ones in the code before any becomes debt, and
    say which you checked. If no subagent is available, say so and answer the rubric in this session, marking what you could not judge as a stranger.
    A tool it lacks and may not use is a suggestion to the person, with the same labels as in `guide`.
- **Read it as a stranger would.** Do not rely on having built it in this session. Open the real app, run the real command, read the
  real response. A criterion you could not check is written `not checked: <why>`, never `ok`.
- **Say what you saw, not a verdict on taste.** For "feels current and quick" (and any criterion that is partly taste), write what is
  there ("the list jumps with no transition when a task is added"), not "it looks bad". The person decides what to do about it.
- **The rubric cites its sources.** `ppc rubric` prints each criterion with the page it comes from and its words. Claim no more than
  the quote says. Where it says "Changed by pp-suite", it is a rule for another kind of surface that pp-suite moved, and you say so.
- **Tools.** A tool is someone else's code: say what it is and where it comes from before the first run, run it **temporarily and
  outside this repository** (`npx`, `uvx` or a scratch directory), and never add it to the project's dependencies or lockfiles.
  A tool on the list may be run. For one that is not, ask with `ppc ask experience --add-tool "<name>"` and follow the answer:
  "use it once" means run it this time and record nothing; "add it to the list" means the person ran the command, so it is on the
  list now; "no" means go on without it and write `not checked: <why>` for what it would have shown. Pick no tool because it is
  popular: pick it because it answers one criterion, and say which.
- **Measuring.** If the standard shows no `Measures with:` command and a quality target of the design can be measured, you may
  propose one (`ppc ask experience --measure "<command>"`); the person decides, because every audit runs it.
- **Closing is yours; deciding is not.** Writing the answers, proposing the debt and setting `status: closed` (steps 4 to 6) are your
  step, in every mode. The person decides on each debt entry you propose (step 8), and only they record that an outside test happened.
- **Never write a decision field.** `mode`, `mode_chosen_by`, `measure_command` and `allowed_tools` are the person's; the guard
  refuses them from you.
- **A finding is a real concern, not an observation.** One entry of debt each, in the same words the person will read in the panel.

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

1. Run `ppc validate`. Read the review file, and the closed slices it lists (their audit says what was built and what was left out).
2. Run `ppc rubric <surface>` for each surface in the file, if you need the criteria with their sources again.
3. Do the review in the mode the file says. For screens, use the project's `app.check` (it opens the real app and saves captures);
   read the captures next to the approved mockups. For an API, call it; for a command line, run it; for documentation, follow it from
   nothing.
4. Fill in `## Answers` in the review file: one line per criterion, `- S-01: ok`, or the concern with what was seen and where.
5. For each concern, add an entry to `.sddpp/debt.yaml` with this shape (free text between double quotes, as in `/pp-audit`). The id
   prefix is the code of the component that owns the problem:

   ```yaml
   - id: DEBT-<component code>-<next number>
     component: "<component id>"
     title: "<what a person meets, in a few words>"
     description: "<what was seen, where, and what a person would notice>"
     kind: experience
     origin: { type: review, ref: RV-<number> }
     created: <today, YYYY-MM-DD>
     proposed_by: ai
     cost_of_delay: { level: <low|medium|high>, rationale: "<why waiting costs that much>" }
     trigger: "<when it should be fixed>"
     status: proposed
   ```

6. In the review file, list those ids under `findings:` in the frontmatter, set `status: closed` and `closed_on:` to today.
7. Run `ppc validate`. `R02` means a finding is not in the register or does not name this review as its origin; fix it.
8. Put each proposed entry to the person, one question each, as the text above says (`ppc show DEBT-…`, `ppc ask DEBT-…`; add
   `--pay-in <slice>` for a planned slice that touches its component).
9. When the experience standard is `external`, the review now waits for someone other than the builder to try it. Say so in one
   line and give the guide: `ppc guide RV-…` prints it, the same text every time. You may add tools that would help (a screen
   recording, a way to take notes), each as **your suggestion, not verified by pp-suite**, with what it is and where it comes from;
   assume no number of people, no team and no cost, and say that skipping it is fine. The person says it was tried, or skipped,
   through the panel (`ppc ask RV-…`); you never record it.
10. End with two lines: what the review found (how many concerns, how many criteria you could not check), and what `/pp` does next.
