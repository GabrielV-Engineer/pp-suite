---
description: "SLICES: plan thin vertical slices from the design (the person approves the list before it is written)"
---

## User input

```text
$ARGUMENTS
```

Optional: capability ids to plan (for example `CAP-002,CAP-003`). Empty means every capability that has no slice yet.

## What this step is

The design in `.architect/` already says what the system is: capabilities, components, quality targets, decisions and
what it does not do. This step turns it into **slices**: thin cuts that each deliver one behavior of a capability, end to
end through the components that behavior needs. It replaces Spec Kit's `specify`, `plan` and `tasks` for a project that was designed
first; do not run those, and do not write `spec.md`, `plan.md` or `tasks.md`.

## Rules

- `.architect/` is read-only. Write only `.sddpp/slices/SL-NNN-<slug>.md`. If the design is wrong or silent about
  something you need, stop and open a change request (`ppc change-request`); do not decide it yourself.
- **Never by layer.** No "data layer, then server, then page", and no setup or foundational phase: the skeleton is the
  only slice that exists for infrastructure, and anything else a slice needs is built inside that slice. Do not follow
  the phases of Spec Kit's tasks template.
- **The first slice is the skeleton** (`type: skeleton`): the thinnest system that runs end to end through every
  component and shows it answers. Then one or more `feature` slices per capability, ordered by its priority (must, then
  should, then could), each with `capability`.
- **Observable means where the capability's user meets it.** The design says where that is: the components that list the
  capability in `justified_by`. A capability justified in the interface is observed on its screen; one that lives in the
  command line, through its command; an integration, through its API. Neither a test nor a command stands in for a
  screen the design calls for, and a screen is not added where the design has none.
- **Each capability opens end to end.** Its first slice runs through every component that lists it, at its thinnest
  (one case, the plainest input); later slices of it thicken it. `ppc validate` warns when it does not (`W07`).
- **A risk may go first, openly.** To prove something before going end to end (an engine nobody has measured, a library
  nobody has tried), plan a `spike` (`timebox_hours`, `disposable: true`) and say which question it answers. A spike
  learns; it does not deliver the capability, so the capability still needs its own feature slice.
- **A slice on the interface names its screens.** When `.architect/ui.md` exists, every work slice that touches a
  `frontend` component lists in `screens` the screens it builds to (`SCR-NN`); it is built to their approved mockups.
  Its criteria cover the states those screens list (loading, empty, error, not only ready) and, when a criterion is about
  contrast or another measured quality, every case the interface document lists, not one example. `ppc validate` warns
  on a slice that names none (`U06`). If the design has a frontend and no `ui.md`, say so and suggest `/pp-design ui`
  first.
- **A dependency is code or data.** B depends on A only when B cannot be built or tested without what A builds. Wanting A
  first is an order, not a dependency: say it in the order, not in `depends_on`, because `ppc` will not start a slice
  whose dependencies are unfinished. `ppc validate` warns on a dependency between slices that share no component (`W08`).
- **Size.** A slice's hand-written production code must fit `budgets.max_slice_production_lines` in the blueprint. If you
  expect more, split by behavior. At most 5 acceptance criteria per slice.
- **Every capability gets a slice, and every quality attribute is referenced by one** that delivers or checks it. Plan every
  capability, also the ones a later phase will build: a slice stays `planned` until a person approves it, so it costs nothing
  to wait, and `T06` asks only that a live slice exists. Approve and start only the ones to build now.
- **A standard that needs setup gets a slice.** `ppc standards` lists what the person decided. If `ci` is adopted on GitHub
  or GitLab, or `observability` is adopted, and nothing in the project does it yet, plan that work as a slice like any other,
  on the component that owns it, after the skeleton. If no component of the design can own it, that is a change request.
- Acceptance criteria come from the capability's description and the quality attributes. Write them as "Given ..., when
  ..., then ...". Do not invent features. If a capability is too vague to write a testable criterion, stop and ask the
  person one question; do not guess.
- Every `skeleton`, `feature` and `fix` slice has a `## Out of scope` section: the nearby things this slice does **not**
  do, drawn from the blueprint's non-goals that sit close to it and from the neighbouring slices.
- **A `fix` slice carries its bug.** Besides `## Behavior` (the symptom, in the words of whoever saw it, with a link to the
  issue if there is one) and `## Out of scope`, it has a `## Reproduction` section with three lines: `Severity:` (`critical`,
  `high`, `medium` or `low`, with the reason in a few words: who is hit, how often, whether data is at risk), `Seen by:` (who
  or what found it) and `How to reproduce:` (the steps, or the test that already fails). If the bug has not been reproduced,
  write `not reproduced yet` there; do not invent steps. The first criterion is the one the reproducing test checks.
- New slices are `status: planned`. Never write `approved_by`, `phase`, `red_approved_by`, `mode` or any decision field.
  Do not write debt.

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

1. Run `ppc contract` (where the slice schema and a worked example are) and `ppc validate . --design`. If additions are
   still undecided, stop: the person must decide them first (`ppc decide-addition`), or the plan is built on things
   they may cut.
2. Read `.architect/blueprint.yaml`, `.architect/architecture.md` and the decisions. List `.sddpp/slices/` to see what
   exists and which ids are taken.
3. **Show the person the list before writing any file**: a table with id, title, type, capability, components,
   `depends_on`, why it depends (what code or data it needs from each) and why this order. Before showing it, check every
   row against the rules above: a capability's first slice reaches all its components or is a spike, and every dependency
   has a reason. Say what you left out and why. Ask whether to write them. Planning is where scope is set, so this is a
   decision for a person.
4. When they agree, write each slice file with the frontmatter that `slice.schema.json` defines (`id`, `title`, `type`,
   `status: planned`, `blueprint_revision` = the blueprint's current `revision`, `capability`, `quality_attributes`,
   `components`, `depends_on`, `acceptance`, and `screens` when it touches the interface), then `## Behavior` (two to
   four sentences) and `## Out of scope`.
5. Run `ppc validate .` and fix every error. Read the warnings: fix the ones your files caused (a `W07` or `W08` on a
   slice you wrote is one of them), report the others.
6. Run `ppc overview` and report: the slices, the order, what is left for later.
7. The next step is the person's: approving the slice they want to start first. Put it to them (`ppc ask <its id>`, see
   **When the person decides**).
