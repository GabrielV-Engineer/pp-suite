# Third experiment (planned, not run): a whole project, SDD.PP against Spec Kit as shipped

Status: **design only.** Nothing has been run. It needs the owner's approval of its cost and of the two
deviations below, then a harness and a pilot of one build per arm to measure the real cost.

## What the owner asked for

One experiment that compares the whole method (SDD.PP with The Architect) against Spec Kit alone, on the same
project, for: delegating, catching errors, the natural flow of work, monitoring, prompt fatigue, traceability and the
route of the project.

## A fact that changes the framing

Spec Kit's own task template (`templates/tasks-template.md`, read on 2026-10-26) is **not purely layered**. It says
"Tasks MUST be organized by user story so each story can be implemented independently and tested independently"
and ends each story with a checkpoint where the story "should be fully functional and testable independently". But it
starts with a **blocking "Foundational" phase** ("database schema and migrations framework", "base models that all
stories depend on"; "No user story work can begin until this phase is complete"), writes tests only if they are
requested, and inside each story the tasks run model, service, endpoint. So plain Spec Kit is a hybrid, and the
difference from SDD.PP is a **bundle**: a walking skeleton first instead of a foundation phase, mandatory test-first
instead of optional tests, a size budget, an explicit "out of scope" per slice, and a state machine with a next step.
An experiment between the two can say which bundle works better. It cannot say which part of the bundle does it.

## Two deviations from the owner's request, stated before running

1. **The design layer is not isolated.** Architect.PP does not exist, and without a shared design the two arms would
   choose different stacks and routes, so no common test could judge them. Both arms therefore receive the **same**
   `.architect/` documents (architecture, blueprint with non-goals, glossary). The experiment tests the slicing, the
   planning and the process, not the design layer.
2. **Fatigue, natural flow and monitoring are human experiences.** Agents cannot report them. This experiment
   measures what a script can (below) and counts the number of prompts a person has to issue. The rest needs the owner
   building a real feature set with each method and logging where they felt lost, slowed or tired; that is a field
   study, not a benchmark, and is proposed separately.

## Design

- **Product:** the four testable features of the task list, built from an empty project (no skeleton): create and list
  tasks, reject invalid titles, delete a task, list newest first with an empty state. The neutral acceptance tests
  for these exist (`tools/eval/neutral-acceptance/`), fixed from the criteria before any run.
- **Arm S: Spec Kit as shipped.** `specify`, `plan`, `tasks`, `implement`, fed the same product brief. No preset, no
  `lean`, no extension.
- **Arm P: SDD.PP.** Spec Kit with the `sddpp-slices` preset (vertical slices with budget and "out of scope"), `lean`,
  then each slice run in **light mode** (one session per slice, in the order `ppc next` gives), with the harness
  recording the approvals under a non-human name. The strict cycle is not used: the earlier experiment found it
  added cost and no measured quality.
- **Same for both:** model, tools, per-session spending caps, the shared design documents, and the same acceptance tests.
- **Runs:** 3 repetitions per arm = 6 project builds, after a **pilot** of 1 build per arm to measure real cost and
  shake out the harness. Order shuffled with a fixed seed.

## Measures, all computed by script

| # | Measure | How |
|---|---|---|
| M1 | When does something work end to end? | Replay the git history; at each commit run the acceptance tests; report the first commit (as a share of the cost spent) at which at least one feature passes |
| M2 | Working software per dollar | Area under the curve "acceptance criteria passing" against cumulative cost |
| M3 | Final correctness | Share of acceptance tests passing at the end |
| M4 | Rework | Production lines deleted divided by production lines added, over the whole history |
| M5 | Size and scope | Production lines; the out-of-scope markers |
| M6 | Prompts a person must issue | Count of distinct commands or prompts the harness gives, plus approvals required |
| M7 | Traceability | Share of acceptance criteria that have a test carrying their id **and** a commit whose message names their story or slice |

## Decision rule, fixed now

**P is better** when over the 3 builds, pooled medians show: M3 not lower than S, **and** at least two of: M1 at least
25% earlier, M4 at least 25% lower, M5 production lines at least 25% fewer, **and** M6 at most 1.5 times S.
**S is better** when the same holds with the arms swapped. Anything else is **inconclusive**. M2 and M7 are
reported but do not decide.

## What it cannot show

One project, one model, four features, three builds per arm. It will not separate the parts of each bundle. It does
not measure the design layer, the person's attention, or whether a person keeps the notion of the project. A
verdict of "P is better" would mean "this bundle did better here", not "vertical slices are better".

## Cost

Unknown until the pilot. Rough estimate from the earlier experiments: 3 to 4 USD per build, so about 7 USD for the
pilot and about 20 USD for six builds.
