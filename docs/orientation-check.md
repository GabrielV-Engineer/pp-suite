# Does Claude Code know how to work in a project that has pp-suite? (three runs)

Question asked in both runs, with no mention of pp-suite: "I just opened this project. What do I have to do now and how do
we work here? Answer in a few lines." Claude Code 2.1.310, non-interactive, read-only tools plus `ppc`.

| | Before (2026-10-26, demo project) | After (2026-10-26, a fresh project) |
|---|---|---|
| What was in the project | Skills and the guard hook installed. **No `CLAUDE.md`.** | The same, plus the block of project rules that `ppc constitution` writes into `CLAUDE.md` |
| What Claude did | 3 tool calls: `ls`, `cat` of a change request and `git diff`, `cat` of the work breakdown. **Never ran `ppc next`** | 1 tool call: `ppc next; ppc overview` |
| What it answered | A fair picture of the project, but the lifecycle it described left out the human approval of a slice, and one claim was false ("SL-004 depends on CR-0001") | The right next step ("approve SL-001 yourself; I cannot run that"), how to work here, the design's decisions and non-goals, the component boundaries |
| Cost | 0.12 USD | 0.11 USD |

What this shows: with the rules block, the agent starts from `ppc next` and states that approvals are a person's. What it does
not show: it is one run each, on two different projects (the first had a hand-written constitution and an older layout), with one
model. It does not show that the agent keeps following the rules over a long session.

## Third run: a short rules block and a hook that shows the state (2026-10-26)

The block of rules in `CLAUDE.md` had grown to about 5,300 characters, most of it copies of the design. It was cut to about 1,300
characters (where the design is, how to work, the cycle, the policy, the budget) and a `SessionStart` hook was added: at the start of a
session, and after `/clear`, a resume or a compaction, it adds the output of `ppc session` (the project, its design revision and what
`ppc next` says) to the conversation. Same question, a fresh project.

| | No rules (run 1) | Rules block, 5,300 chars (run 2) | Short block and session hook (run 3) |
|---|---|---|---|
| Tool calls before answering | 3 exploring files | 1 (`ppc next; ppc overview`) | **0** |
| Answer | Fair picture, but left out the human approval and made one false claim | Correct next step, approval is the person's | Correct next step, approval is the person's, how to work here, the cycle and the budget |
| Turns / cost | 4 / 0.12 USD | 2 / 0.11 USD | 1 / 0.11 USD |

Still one run each, on different projects, with one model. The cost is not lower: the saved call is paid back in the extra context. What
changed is that the orientation is current (it comes from `ppc next`, not from a copy) and the static text is a quarter of the size.
