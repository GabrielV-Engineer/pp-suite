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


---

# Third review: the first two slices built (same day, 12:10)

Sources: the log (`PPSUITE-LOG.md`, lines 564 to 670), the git history, `ppc validate`, `ppc check-git` and `ppc overview` run
against the project, both session transcripts (counted, not read in full) and the code of `ppc`. Still one run, no control arm.
SL-001 and SL-002 are done; 19 slices are planned. Both slices ran in the **light** cycle, so the strict cycle and the test lock have
still not been exercised.

## What happened

| Step | Time (-06:00) | Result |
|---|---|---|
| SL-001 build | 03:47 to 04:05 | Window served on loopback with a CSP; 13 pytest and 3 vitest; stopped once for **CR-0001** (the strict CSP blocks pywebview's `js_api`), opened 03:54, decided and applied by 04:00 |
| SL-001 close | 04:05 | `B01`: 942 production lines against 200; the owner recorded the exception |
| SL-002 build | 04:15 to 04:19 | Model fetch with a sha256 lock and audio normalization; 11 test cases written first (self-reported) |
| SL-002 stall | 04:19 to 11:44 | A model download hung for about 7 hours (no timeout, buffered output); fixed with a timeout and a test. Not a pp-suite fault |
| CR-0002 and SL-002 close | 11:50 to 12:03 | The owner raised the slice budget from 200 to 500 lines through a change request; SL-002 closed at 295 lines |
| `/pp` test | 12:07 | A new session started with the hook's state (the first real session start with the hook), `/pp` explained SL-003 and opened the panel in Spanish, keeping the command suffix intact. **Waiting for the click**: SL-003 is still `planned` and `.sddpp/answers.jsonl` does not exist yet |

Session so far: 290 assistant messages, about 270,000 output tokens, 29 user messages, 3 refusals by the guard (all before 04:00).
No price computed. Wall time 10.5 hours, mostly idle.

## Verified by me

- `ppc validate` and `ppc check-git`: 0 errors, 19 `W03` warnings. `ppc overview`: 2 of 21 slices done, 2 of 2 closed work slices
  changed tests. Nothing edited `.architect/` from a build, and no slice touched files outside its components (`C08` and `C09` did not
  fire); the two design changes went through change requests.
- F-B4 (`uv.lock` counted as production): the list of generated names in `tools/ppc/src/testpaths.mjs:8` has the other lockfiles and
  not `uv.lock`. Of SL-001's 942 lines 539 are `uv.lock`; with it excluded SL-001 is 403, still above 200.
- F-C1 (a change request must name a component, a decision or a quality attribute): `tools/ppc/src/changes.mjs:28` refuses otherwise,
  so a change to the budget had to pretend to affect SL-002's components.
- F-B6 (a file a project generates, like `models.lock.json`, counts as production): the only mechanism is that fixed list of names.
- The hand-written part of both slices was above the original budget: about 295 (SL-001, with 108 lines of configuration) and
  232 (SL-002). The slices the agent planned as thin were 1.2 to 1.5 times the 200 lines the contract allows.
- The session-start hook worked: the second session received `pp-suite: psyBook (blueprint revision 4)` and the pending approval.

## How it is going

- **Strongest evidence so far for the method:** the walking skeleton found a real conflict in its first slice. An addition the owner
  kept (ADD-008, a strict CSP) clashed with a decision already taken (ADR-0001, pywebview's `js_api`), invisible in the design and
  found the moment the window ran. The slice stopped, a person chose, the design was revised, the project rules were regenerated,
  and the build resumed within 6 minutes. One instance.
- **The budget did its job once and was then moved.** It stopped both slices and made a person decide; the second time the person
  changed the number. It cannot be said yet that the fence kept slices small.
- **Cost of the design-change path:** every change request raises the revision, and 19 planned slices now carry a `W03` warning that
  nothing clears. With two requests that is noise; with more it would hide real warnings. The command to mark slices as re-read
  (ROADMAP, "Not built") is now needed.
- **Not tested:** the strict cycle, the test lock, mutation testing, anything about long-run drift. Tests written first is
  self-reported: in the light cycle one commit holds tests and code, so git cannot show the order.
- **The approvals** of SL-001, SL-002 and both change requests were made in a terminal. The first approval through the panel
  is pending.

## Findings from this part

| Id | Finding | Verified | State |
|---|---|---|---|
| F-B4 | `uv.lock` counted as production | Yes | **Fixed**, with the other well-known lockfiles (`bun.lock`, `deno.lock`, `Pipfile.lock`, `pdm.lock`, `pubspec.lock`, `mix.lock`, `Podfile.lock`) |
| F-B5 | A skeleton that sets up two toolchains does not fit 200 lines; configuration files count | Log, and the sizes above | Open: a decision for the owner, not a bug (the owner raised the budget to 500) |
| F-B6 | A generated file the project declares (`models.lock.json`) cannot be excluded | Yes | **Fixed**: `budgets.generated_paths` in the blueprint. In psyBook it takes a change request to add it, now possible with `--budgets` |
| F-C1 | A budget change cannot be a change request without a fake component | Yes | **Fixed**: `ppc change-request --budgets` |
| (new) | `W03` on every planned slice after each change request, with no command to clear it | Yes | **Fixed**: `ppc reread`, human-only and offered by `/pp` as a decision with `ppc show reread` |
| F-H1, F-H2, F-S1 | See the second review | | Open |


---

# Fourth review: three slices built, the first panel approvals (2026-10-31)

Sources: the log (`PPSUITE-LOG.md`, lines 563 to 708), the git history, `.sddpp/answers.jsonl`, the second session transcript (parsed:
tool calls, guard decisions, permission decisions), `ppc validate`, `ppc check-git`, `ppc overview`, `ppc next --json`, and the project's
own tests, linter and type checker run by me. Still one run, no control arm. SL-001 to SL-003 are done, 18 slices are planned, all
three ran in the **light** cycle, so the strict cycle, the test lock and mutation testing have still not been exercised.

## What happened

| Step | Time (-06:00) | Result |
|---|---|---|
| SL-003 approval | 10-30 12:13 | The first approval through the panel: `ppc approve SL-003` ran 2 seconds after the click, with no second prompt |
| SL-003 build | 10-31 01:00 to 01:24 | Diarization (sherpa-onnx) and Parakeet; stopped once for **CR-0003** (sherpa-onnx 2.0 dropped espeak-ng, so the Piper test voices make no sound): opened 01:00, applied as revision 5 at 01:09 |
| SL-003 audit | 01:35 to 02:05 | Two debt entries proposed and decided in the panel; `B01` (1117 lines against 500), the owner recorded an exception; the close took four attempts (below) |

Session 2 so far: about 95 assistant messages, 60,000 output tokens, 22 user messages, 92 Bash calls (counted from the transcript,
approximate). Active time for SL-003, from the first to the last commit: about 65 minutes. No price computed.

## Verified by me

- `ppc validate --strict` and `ppc check-git`: 0 errors, 0 warnings. `ppc next`: the owner must approve SL-004; nothing else waits.
- The project's own tests, run by me: **34 passed in 31 s**, as the log says. `ruff check` clean, `mypy --strict src` clean. The largest
  file is 143 lines (the limit in the project rules is 300). Hand-written production code in SL-003 is about 360 lines; 722 of the 1,117
  counted lines are `models.lock.json`, written by `psybook models fetch`.
- **The panel path works end to end.** `.sddpp/answers.jsonl` holds 6 answers; 5 were consumed, by the exact tool call that ran the
  command (one approval and four debt decisions; two of the answers were consumed by one command). The guard returned no `ask`
  for any of them.
- It failed for the sixth, the budget exception (F-K1). The agent's own log says "the guard let it through"; the transcript says the
  guard asked.

## How it is going

- **A second design change found by building.** CR-0003 is the second time a slice found something the design could not show. Two
  instances; both took under 10 minutes from the stop to a revised design.
- **The audit is honest.** SL-003 declares nine deviations and two debt entries, among them that the designed split of long turns was
  not done because no criterion asked for it. This is self-reported; light mode leaves no way to check "no test was changed".
- **Costs of the change path remain.** Every request raises the revision and every planned slice then needs re-reading (F-K3).
- **Predicted, not observed:** SL-004 has two criteria (AC-3, AC-4) that only the owner can meet, by running a benchmark on three
  machines. How `test_policy: required` and the audit treat a slice whose acceptance is a measurement is unknown.

## Findings from this part

| Id | Finding | Verified | State |
|---|---|---|---|
| F-K1 | The panel answer for `ppc finish … --budget-reason "…; …"` is not recognized: the guard splits the command on `;` even inside quotes, `shlex` then fails on each piece, and no command is found, so it falls back to Claude Code's confirmation. The owner got it three times (each retry of the close) | Yes: transcript (guard output `ask` at 08:00:59, 08:01:11, 08:02:02, none consumed) and `ledger.invocations()` returns `[]` for that command | **Fixed** (`e6faf47`): the guard now splits on separators outside quotes. Replayed against the real command and the real ledger entry from psyBook: allowed once, then asks again because the answer is used up |
| F-K2 | **`ppc approve --help` approves.** `--help` and any unknown `--flag` are silently ignored, and `ppc approve` with no id picks the one approvable slice. I hit it by running `ppc approve --help` in psyBook while reviewing: SL-004 became `ready`, approved in the owner's name. I restored the file with `git checkout`; nothing was committed. Reproduced in a copy | Yes | **Fixed** (`d2aa414`): every command lists the options it takes and refuses any other (exit 2, nothing done); `--help`, `-h` and `ppc help [command]` print usage and do nothing else, also outside a project. `ppc approve SL-001 --drop` used to approve the slice and ignore `--drop`; it is refused too (`e527b5b`) |
| F-K3 | `blueprint_revision` of 19 slices was changed from 4 to 5 by hand, inside a commit titled "docs(log): record the SL-003 build, CR-0003 and two ppc findings" (`5e408fe`). Nothing logs that the person read the change, and nothing in the guard covers the field, so `ppc reread` (the human-only way) can be bypassed | Yes (diff and message) | Open: a decision for the owner (protect the field except for `ppc reread` and slice planning, or accept it) |
| F-K4 | A change in how `ppc` counts lines made closed audits fail `C04` (SL-001 942 vs 403, SL-002 295 vs 267). The two numbers were corrected by hand, with the owner's yes. It came from the F-B4 fix: `ppc` runs from the pp-suite checkout and is not pinned | Yes | Open: no re-measure command; any future change in the counting hits every closed slice |
| F-K5 | `ppc next` offers the audit as soon as a slice has one `build(...)` commit. SL-003's first commit only added dependencies, so after CR-0003 it offered the audit before any code existed (the log's F-D1) | Yes: `next.mjs:32`; it happened again in SL-004 (`a53e8d0`, dependencies only) | **Fixed** (`d6ef595`): with `test_policy: required` and no test file in any of the slice's `build(<id>)` commits, `ppc next` and the session-start hook offer the build and say the audit follows when the slice is complete. A heuristic: it cannot tell a complete slice from an incomplete one when tests are optional or none |
| F-K6 | The guard asked about two commands that only wrote log text mentioning `ppc approve` or `ppc finish` (heredoc into `PPSUITE-LOG.md`) and rejected `git add .sddpp/answers.jsonl`. With the three prompts of F-K1, all 6 times the guard interrupted this session (5 confirmations, 1 rejection) were avoidable | Yes: transcript | **Fixed for the cases seen** (`ae08d3e`): text `cat` copies from a heredoc with a quoted delimiter, and `2>/dev/null` / `2>&1`, no longer count. **Not fixed**: a commit message or `echo` that mentions `ppc approve` still asks, and the agent still cannot run `ppc approve --help` without a question (the guard does not trust `--help` to be harmless) |
| F-K7 | A debt entry decided with `--drop` stores no reason. The owner typed one; the panel cannot carry free text and the command takes none, so it exists only in the log | Yes: `debt.yaml` | **Fixed** (`e527b5b`): `--drop --reason <why>` stores `dropped_reason` (optional, 10+ characters; a field the guard protects). The panel's Drop option records "dropped in the panel"; a person's own words go through the assistant with `--reason`, which Claude Code asks them to confirm. The drop already recorded in psyBook (DEBT-PIPE-001) has no reason and was not edited |
| F-D3 (log) | `models.lock.json` counted again | Yes | Already **fixed** by `budgets.generated_paths`; psyBook has not declared it, so SL-004 may hit it again |
| F-D5 (log) | A design commit listed in the audit is refused with `C08` | Yes | Correct behavior; no change |
| F-D2 (log) | `ppc change-request --help` prints `unknown slice undefined` | Yes | Part of F-K2: no command has help |

## Limits of this review

- One run, one project, one person; the owner approved most of what the agent proposed.
- I did not run the application or the window, only its tests, linter and type checker.
- Which of the five confirmations the owner answered and how long each took is not measured. The permission decisions show a user
  accepting each one.
- Claude Code's confirmation on **No** and the bypass mode are still untried.

## Next

Fix F-K2 first (reject unknown flags on the human-only commands, give every command `--help` that does nothing else), then F-K1
(quote-aware splitting in the guard, with `;`, `&&`, `|` and apostrophes in a reason), then F-K6. F-K3, F-K4 and F-K7 need a decision
from the owner before any change. In psyBook: commit the pp-suite update that is sitting in the working tree, and open a change
request with `--budgets` to declare `models.lock.json` before SL-004.

## After the fixes (same day)

F-K1, F-K2, F-K6 (the cases seen) and F-K7 are fixed, each with a failing test first and each part broken on purpose
(5 breaks of the option check and help, 8 of the drop reason, 4 of the guard, 1 more added after one break went unnoticed:
a pipe before `<<` in the heredoc rule). Node 485 tests, guard 66, cycle 5, all passing. F-K3 (who may change
`blueprint_revision`), F-K4 (re-measuring closed audits) and F-K5 (the audit offered after the first build commit) are open and wait
for a decision. Not verified: the fixed guard has not run inside a live session; psyBook needs `ppc init . --apply --update` with a
clean tree to get it.

---

# Catch-up, 2026-11-12: SL-004 done, and what it showed

Sources: `ppc overview`, `validate --strict`, `check-git`, `PPSUITE-LOG.md` (lines 706 to 717), `.sddpp/answers.jsonl`, `docs/decisions/engine.md`,
the debt register, the session transcript (searched for guard confirmations and rejections after the update). Nothing was changed in the project.

- **State:** 4 of 21 slices done (all light cycle), `validate --strict` and `check-git` 0 errors and 0 warnings. SL-004 closed with 362 production
  and 90 test lines. Five change requests so far, all decided by the owner; CR-0004 and CR-0005 came from SL-004.
- **The panel path again:** the approval of SL-004 went through the panel and was consumed. The transcript holds no guard confirmation or rejection
  after the guard update (searched, not read line by line). Not seen by me: how the `reread` of 18 slices on 11-01 was run (no command in the
  transcript; likely the owner in a terminal).
- **Result of the benchmark (provisional, Linux laptop only):** Parakeet 573 s for 46 min of audio (meets QA-001), Whisper 2,350 s (does not). CR-0005
  limited the criteria to Linux and recorded the gap as DEBT-PIPE-004, so it is visible and not silent. On the owner's simulated session the run
  found what the synthetic fixture did not (DEBT-PIPE-005, cost of waiting high: overlapping turns transcribed twice, words cut at speaker
  changes, blank and English filler turns). Fixing it needs a change request, because the design is silent on overlaps.
- **Two more pp-suite findings from the same slice:** F-D6 (a comma in a debt rationale split the template's inline mapping and `ppc finish` refused
  the register), reproduced and **fixed** (`f50907e`: the template quotes free text, and a test parses it filled with commas, colons, hashes and
  braces); and F-K5 again (above), **fixed**.
- **Still open:** F-K3, F-K4, the residual of F-K6, and what was never tried (No on the confirmation, bypass mode, the strict cycle, mutation
  testing). Claude Code is 2.1.322 here; the pinned, tested version is 2.1.310.

---

# Review, 2026-11-12 evening: SL-022 and SL-005, and the first run with the short commands

Sources: the git history, `ppc overview`, `validate --strict`, `check-git`, `PPSUITE-LOG.md` (lines 717 to 724), `.sddpp/answers.jsonl` and the
session transcript after row 1800 (searched for decisions, panel questions, guard answers and the word "terminal"). Nothing was changed in the project.

- **State:** 6 of 22 slices done (SL-001 to SL-005 and SL-022), all in the light cycle; `validate --strict` and `check-git` 0 and 0. SL-022
  (the fix from CR-0006) closed at 242 production and 155 test lines, SL-005 at 402 and 146, both under the 500-line budget without an exception.
- **The product:** SL-022 cut the owner's simulated session from 320 to 209 turns, with 0 duplicated, 0 empty and 0 English-filler turns
  (74, 31 and 28 before), as the agent measured and reported. Six filler turns slip through (DEBT-PIPE-006); speaker mistakes and misheard words remain
  for later slices. Not checked by me: I did not rerun the transcription.
- **Before the update** (the long names), the agent still sent the person to the terminal for CR-0006, SL-022, SL-005 and DEBT-PIPE-006,
  and none of those is in the ledger: the four were decided by hand.
- **After the update** (`32a7ab1`, the short names): one `/pp` started SL-005, built it (with the owner's design skills and a look at
  the screen in a browser), ran the audit, and stopped at the two new debt entries, asked in the panel. Eight minutes and no other prompt. The panel
  question was the one `ppc ask` writes, with a recommendation the agent added to the question text; it did not explain the options in the chat first,
  as the skill now asks.
- **New finding F-L1:** the two panel answers (DEBT-UI-001 and DEBT-UI-002) and the next one (SL-006) were never used. The first reading,
  that the session ended, was wrong: the transcript shows the agent ran `ppc approve DEBT-UI-001 2>&1 | tail -2`; the `2>&1` stayed in the
  command, the answer did not match, and the guard asked again (the person confirmed 18 minutes later; for SL-006, 6 seconds later).
  **Fixed:** redirections are left out when a command is matched (`8b6db53`), and `ppc next`, the session hook and `/pp` now show an answer
  nothing used, run it while it is valid and ask again after (`41a744f`).
- **F-D7 (the log's, confirmed in the code):** a `fix` slice that pays debt through a change request could not mark it paid; only a refactor
  slice could (`paid_by`, rule `T09`, `ppc schedule-debt`). **Fixed** by the owner's choice (`320a88a`): a fix slice may pay debt, and
  `ppc schedule-debt DEBT-PIPE-005 --slice SL-022` on the done slice records it paid at once.
- **Still not exercised:** the strict cycle, mutation testing, pressing No, the bypass mode.

---

# Review, 2026-11-14: was the plan sliced, or layered in disguise? (F-P1)

The owner asked whether the project was following slices or a layered plan (engine, store, back end, and the app last). Sources: the
frontmatter of the 22 slices (`components`, `depends_on`, `capability`, `type`), `.architect/blueprint.yaml` (`justified_by`), the git history,
and Spec Kit's `tasks-template.md` as installed in the project. Nothing was changed in the project.

- **What was sliced:** every slice ran one behavior through several components, and from SL-005 on each one ended in the app. No slice was
  a layer. SL-002 to SL-004 were each observable from the command line, and for SL-004 that is right: the design puts the benchmark
  (CAP-009) in `cli` and `pipeline`.
- **What was layered (F-P1):** importing a recording (CAP-002) is justified in `desktop-shell`, `pipeline` and `store`, but its first slice
  (SL-002) ran through `cli` and `pipeline` only; the capability reached the app in SL-006, four slices later. And SL-005 (patients) declared
  `depends_on: [SL-004]`, the engine benchmark, with no component in common; since `ppc` starts only a slice whose dependencies are done,
  the planning order became a hard order.
- **Likely cause:** Spec Kit's tasks template orders work as "Phase 2: Foundational (Blocking Prerequisites) ... Core infrastructure that
  MUST be complete before ANY user story can be implemented". `/pp-plan` replaces that template, but it did not say where a capability is
  observed or what a dependency is, so nothing pushed back on that habit. Not verified: whether the planning agent read the template.
- **Fixed** (`5049e88`, `8530ae2`, `2635103`, `4284389`):
  - `W07`: the slices that open a capability reach every component that lists it in `justified_by`; a spike may prove a risk first.
  - `W08`: a dependency between slices that share no component.
  - `T06`: a spike no longer counts as delivering a capability.
  - `/pp-plan`: observable is where the design puts the capability, so neither a test nor a command replaces a screen the design calls for,
    and no screen is added where it has none. No foundational phase, a risk goes first only as a spike, a dependency is code or data, and the
    plan table gives a reason for each dependency and for the order.
  - The hand-off lists in `justified_by` every capability that runs through a component.
- **Checked:** on a copy of the project's slices set back to `planned`, `W07` flags SL-002 and nothing else, and `W08` flags SL-005 → SL-004 and
  nothing else; on the project as it is, neither fires, since both slices are done. Node 530 tests, each new check broken on purpose (6 breaks,
  all caught); the example stays at 0 and 0 in strict mode.
- **What the checks cannot see:** sharing a component does not prove a dependency is real, so `W08` catches only the plain case; the reasons in
  the plan table, which the person approves, cover the rest. `W07` is only as good as `justified_by`: in this project `ui` does not list CAP-002,
  although recordings are imported from the patient screen. That may be a gap in the design; it is the owner's to decide.
