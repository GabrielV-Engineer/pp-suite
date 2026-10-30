# First real project: psyBook

Date reviewed: 2026-10-30. One run (n=1), no control arm. Source: the build session's own log
(`psyBook/PPSUITE-LOG.md`, written by the agent), the project's git history, `ppc` run against the project, and the
session transcript's counts. The transcript's content was not read, only counted.

## What was exercised

Of the six steps in [how it works](how-it-works.md), only the first ran in full (install, then the design interview).
The hand-off, additions review, slices, build, audit and design changes **have not run**. Nothing below says anything about
them. `ppc validate`, `ppc validate --design`, `ppc check-git` and `ppc next` on the project report only
`R00` (`.architect/` missing), because the hand-off has not happened.

## What I verified myself

| Log claim | Check | Result |
|---|---|---|
| F-B1: `ppc next` errors right after a clean install | Ran `ppc next <project>` | Reproduced: two `R00` errors |
| F-B2: the session-start hook is silent until `.architect/blueprint.yaml` exists | Read `tools/ppc/src/session.mjs:24`; ran `ppc session <project>` | Reproduced: early `return ''`, empty output |
| F-E1: the guard blocks a command that only *mentions* an approval command | Called `guard.decide` with a heredoc containing `ppc decide-addition ...` | Reproduced: exit code 2 (a plain `echo` gives 0). The pattern `APPROVAL` is applied to the whole command string |
| Non-goals respected (soft delete, installers) | Read the blueprint, `psybook-blueprint.md` lines 59-60 | Matches |
| Additions such as `models.lock.json`, `psybook bench` | Grep in the blueprint | Present |

Not re-run by me: the install steps of stages A and B, the blueprint's version checks, and the tagging of each
feature as named, proposed-and-accepted or not named. That tagging was done by the same agent that wrote the blueprint.

## Results against the questions fixed in advance

1. **Install.** Worked: from an empty directory to 14 checks ok and 1 `DIFFERS` (Claude Code 2.1.311 against 2.1.310).
   Stage A took about 5 minutes, B under 1 minute. Same machine as the author's, so this says nothing about a clean one.
2. **Hub note and Notion card.** Created and cross-linked.
3. **Scope.** The brief had 10 named non-goals; all 10 were respected. Of the 38 blueprint items beyond the brief, the agent
   tagged 7 as named later by the user, 15 as proposed by the agent and accepted in the interview, and **16 as named by
   nobody** (a settings screen, keyboard shortcuts, WCAG 2.2 details, a content-free rotating log, a strict CSP, a model
   download command with a hash lock, and others). The brief's rule "if you think one is needed, flag it as an addition"
   was not followed for these; they went into the blueprint. The hand-off's additions review (`additions.yaml`) is the
   step that would catch them, and it has not run.
4. **Orientation.** No evidence. The session began before pp-suite was installed, so the hook never had a chance. The gap
   between install and hand-off is silent (F-B2).
5. **Decisions without enough information.** Six listed in the log (engine choice without a benchmark, metric thresholds
   without a baseline, a frontend stack that went from vanilla to React with TypeScript, Vite and Tailwind on the user's
   later priority, which country's health-data rules apply, test-audio method, design skills).
6. **Cost.** 97 assistant messages, about 105,000 output tokens, 14.3 million cache-read tokens, 264,000 cache-creation
   tokens, model `claude-opus-5-5`. Wall time 66 minutes (01:37 to 02:43, -06:00), 53 of them in the interview; this
   includes the user's response time (10 user messages, 5 multiple-choice questions). No price was computed.

## Limits of this run

- **It is not a faithful run of The Architect.** Its plugin was installed in the same session and did not load, so the
  agent followed its files by hand in the main thread. The three subagents, the full validator and the smoke test were not
  run (the last because it writes application code). The blueprint states it is not smoke-tested.
- **The friction question did not work as an instrument.** Offered as options, the user chose "Nada" in all four stages,
  while the agent logged 10 findings. No verbatim confusion was captured. Next time it needs free text.
- The stack grew at the user's request, against the brief's "keep the complexity budget small". This run cannot separate
  that from The Architect's own tendency to inflate.

## Findings for pp-suite

| Id | Finding | Verified | Direction |
|---|---|---|---|
| F-B1, F-B2 | Between install and hand-off, `ppc next` fails and `ppc session` is silent, against the README's "one command is enough to find your place" | Yes | **Fixed** in `d5ed70a`: both now point at The Architect and the hand-off when pp-suite is installed and `.architect/` is empty |
| F-E1 | The guard refuses a command that writes text mentioning an approval command | Yes | Not a quick fix: matching the whole command string was a deliberate result of the [adversarial pass](lock-adversarial.md) |
| F-A1 | The printed fix `ppc init --apply --shim` does not run when `ppc` is not on the PATH | Read in the log only | Print the full path |
| F-A2 | Only the last of seven project-level `MISSING` lines carries a fix | Read in the log only | One fix for the block |
| F-A3, F-D1 | No way to install The Architect at the pinned commit; a plugin installed mid-session is not loaded | Read in the log only | Document the order: install it before starting the session |
| F-D2, F-D3 | The Architect's smoke test and its "blueprint in the user's language" rule conflict with a design-only stage and an English contract | Read in the log only | State which apply |
| F-B3, F-A4 | An unexplained Spec Kit "configuration may be required"; Spec Kit runs on Python 3.13 while `versions.json` pins 3.14 | Read in the log only | Document or ignore |

## Next

Run `/speckit-architect-pp-handoff blueprints/psybook-blueprint.md` in psyBook. That is where the 16 unnamed items meet
the additions review, and the first test of the claim that matters most: whether a person ends up deciding what was added.

---

# Second review: hand-off, additions and slice planning (same day, 03:49)

Sources: the log (`PPSUITE-LOG.md`, lines 381 to 563), `.architect/`, `.sddpp/`, `ppc validate`, `ppc validate --design`,
`ppc check-git` and `ppc overview` run against the project, and the session transcript's counts. Still one run, no control arm,
and nothing built yet: no slice is approved, started or closed, so the build, the audit, the test lock, the budget and the
integrity checks `C08` and `C09` have not been exercised.

## What happened

| Step | Time | Result |
|---|---|---|
| Hand-off (`/speckit-architect-pp-handoff`) | 02:49 to 02:54, 5 min | 17 files under `.architect/`, 13 additions flagged, `validate --design`: 0 errors, 13 `X01` warnings |
| Additions decided | about 03:05 to 03:10 | 9 kept, 4 cut, all by the owner; cuts applied by `/speckit-architect-pp-apply-cuts`, revision 1 to 2, 0 errors and 0 warnings after |
| Project `CLAUDE.md` with the owner | about 03:25 | 8 questions, written outside the pp-suite markers |
| Slice planning (`/speckit-sddpp-cycle-slices`) | 03:30 to 03:40, 10 min | 21 slices, all `planned`; `validate`, `validate --design` and `check-git` give 0 errors and 0 warnings |

Session so far: 187 assistant messages, about 200,000 output tokens, 47 million cache-read tokens, 410,000 cache-creation tokens,
`claude-opus-5-5`; wall time 2 h 04 (01:37 to 03:41, -06:00), which includes the owner's time (22 user messages). 3 tool calls were
refused by the guard. No price was computed.

## Verified by me

- `.architect/additions.yaml`: 9 keep, 4 cut (3 recommended cut, plus ADD-010, which was recommended `decide`), all `decided_by` the
  owner, the cuts marked `applied`. Of 13 recommendations, the owner's outcome matched 12; ADD-010 was left to them and they cut it,
  with their own reason (a manual option instead of a re-review after each session). The 9 keeps carry only 2 distinct reasons.
- The owner **split** the overlapping pair ADD-004 (cut) and ADD-005 (keep). The batch decision I had just built refused that.
  Fixed; see the findings.
- The scope check worked in part. The build session had listed 16 items "named by nobody"; by the names, 12 of them are among the 13
  additions. The other 4 are in the design and not in `additions.yaml` (checked by search): the zero-outbound-connections test, the
  segment merge and split rule, the engine decision file, and the screen that marks an analysis reviewed. Also, by the hand-off's own
  choice (F-H2), 11 proposals the owner accepted in the interview were treated as asked and not flagged.
- F-H5 reproduced on a copy: with a cut decided and not applied, `ppc validate --design` warned (`X04`) and `ppc next` said the
  design was ready.

## What it cost the person

The strongest result of the run is not in the numbers above. The owner tried to run the human-only commands three times before one
worked: first with a `!` prefix (the VS Code extension has no `!`), then pasting the four lines inside a chat message, then by asking
the assistant ("ejecutalos tu todos"), which the guard refused. The decisions took effect when they ran them in a terminal. The docs and the
guard message all said "prefix it with `!`".

## Findings from this part

| Id | Finding | Verified | State |
|---|---|---|---|
| F-H4 | `!` does not exist in the VS Code extension; the docs and the guard message promised it | Log, and the owner's own attempts | **Fixed**: the message and the docs say to use a terminal; the guard asks in Claude Code's own prompt in the default and accept-edits modes ([spike](ask-spike.md)); the prompt itself was not seen by a person |
| F-H5 | `ppc next` skips applying decided cuts | Yes | **Fixed** (`a6f9a1f`) |
| (new) | The batch decision refused to split an overlapping pair | Yes | **Fixed** (`f137144`); the rule "one recommendation per overlap group" was dropped |
| F-H3 | The guard blocks `--help` of a human-only command | Log | Open, together with F-E1 for `approve-*` |
| F-H1 | Nothing checks that the hand-off carried over the risks | Log | Open |
| F-H2 | No rule for interview proposals the person accepted; 11 went unflagged | Log | Open: decide whether an accepted proposal is "asked" |
| F-S1 | Planning a subset of capabilities is impossible: `T06` blocks every approval and start | Log, and code (`loadValid`) | Open: decide between allowing phase-2 capabilities to be deferred and keeping the rule |

## Not answered yet

- **Orientation** (fact 4): the session began before pp-suite was installed, so the session-start hook has not been seen at a session
  start. A new session in psyBook would show it now (it would print the pending `ppc approve-slice SL-001`).
- **Whether the design stays the owner's** under a build: nothing has been built.
- **The friction question** was not asked after stage D.

## Next

Open a new session in psyBook (this tests the hook), update its copies of the guard and the project rules (`ppc init . --apply --update`
and `ppc constitution`, with a clean tree), approve SL-001 and run one slice end to end. That is the first test of the part of pp-suite
that the run has not reached.

