# Automation map: what a person has to do, with Spec Kit alone and with SDD.PP + Architect

Written on 2026-10-26. The question behind it: starting from the **same ambiguous idea**, how many of the steps
between the idea and a working, bounded result does each method take off the person? Each cell says who does the
step. **Auto** = the tool produces it without the person writing it; **Person** = the person must write or decide it;
**Model** = a language model produces it from a generic prompt (the person reads and corrects); **None** = nobody.

Honesty about the evidence: the Spec Kit column comes from its commands and templates, which I read
(`specify`, `clarify`, `plan`, `tasks`, `analyze`, `checklist`, `implement`, `constitution`, and the tasks template). I
have not run Spec Kit in this session. The SDD.PP column is what exists and is tested in this repository; the
last column is what is **not built yet**. Nothing below has been measured as time saved by a person.

| # | Step from idea to result | Spec Kit alone | SDD.PP + Architect today | Not built yet |
|---|---|---|---|---|
| 1 | Turn a vague idea into requirements | Model (`specify`, then `clarify` asks up to 5 questions); Person answers | Model (The Architect's interview); Person answers | |
| 2 | Choose a stack, data model, API | Model (`plan`, `research.md`, `data-model.md`, `contracts/`) | Model (The Architect's blueprint) | A **complexity budget**: The Architect inflates scope by default until it is pushed back |
| 3 | State what is out of scope | Person (the spec has assumptions, no field for non-goals) | Blueprint non-goals (Model); `Out of scope` per slice (Model, then approved) | Automatic carry-over of non-goals into every slice |
| 4 | Record decisions and why | Constitution only | ADRs with rejected alternatives, checked by rule `A01` (Model writes, Person reads) | |
| 5 | Turn the design into the project's files | n/a | **Person (by hand)**: the hand-off from the blueprint to `.architect/` was done manually for the demo | **Automatic hand-off** (Architect.PP) |
| 6 | Split the work into units | Model (`tasks`: by user story, after a blocking foundation phase) | Model (`tasks` with the `sddpp-slices` preset: vertical slices with budget) | Regroup an Architect plan that is ordered by layers into vertical slices; drop literal code from plans |
| 7 | Write what the agent must be told for each unit | Generic (`implement` runs all tasks from one command) | Generic phase prompts plus the slice file; `ppc next` names the command to run | **A per-slice prompt generated from the contract** (the dropped `ppc brief`, now reconsidered) |
| 8 | Know the order and what is next | tasks.md order and `[P]` markers; Person decides | **Auto**: `depends_on`, `ppc next` says whose turn it is and the command | |
| 9 | Track the state of the project | Checkboxes in tasks.md | **Auto**: state machine, generated WBS, `ppc overview`, debt tables | |
| 10 | Keep the work inside its scope | Person | **Auto**: size budget (`B01`) checked from git; optional guard that locks tests | Check that a slice does not touch what a non-goal forbids |
| 11 | Check what was built | Model (`analyze` for consistency of documents); tests only if requested | **Auto**: 40 contract rules, `check-git` against real history; optional mutation gate | |
| 12 | Track technical debt | None | Model proposes, Person decides (`approve-debt`), one register per component | |
| 13 | Trace a requirement to a test and a commit | Coverage notes by hand | **Auto-checked**: ids (CAP, QA, SL, DEBT, ADR), rules `T01` to `T15`, `W05`; spec link `T15` | A check that criteria agree across spec, slice and tests |
| 14 | Design the interface (UI/UX) | None | None | A design field in the contract and a design step |
| 15 | Install and start | `specify init` | **Person (by hand)**, versions not pinned | An install command with pinned versions |

## What this table says

- The clearest automation SDD.PP already has is in **knowing the state and the next step (8, 9), checking (10, 11),
  debt (12) and traceability (13)**: the person does not have to remember or verify them.
- The steps where it **still asks the person for the most** are the first ones: the hand-off (5) is manual, and there
  is no complexity budget (2). Those are exactly the steps the Architect layer exists to take over. Until they are
  built, an ambiguous idea cannot go through SDD.PP + Architect without a person doing the hand-off.
- Step 7 (writing the prompt for each unit) is generic in both methods. A generator would be a real difference.
- Steps 14 and 15 are covered by neither, or by neither well.

## What must exist before the comparison

1. **Architect.PP**: steps 2 (complexity budget), 5 (automatic hand-off), 6 (regroup into vertical slices, drop
   literal code).
2. **Tests optional** in SDD.PP, so that its default mode matches Spec Kit's and the strict cycle is an option.
3. A decision on **step 7** (a generated prompt per slice).
4. An **install command** with pinned versions.
5. The harness: the same ambiguous idea into both methods, counting the steps and prompts a person must supply
   and recording what each method produced by itself.
