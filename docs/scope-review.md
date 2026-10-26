# Scope review: the person accepts or cuts each addition

Status: **built and tried once** (2026-10-26). Owner approved the design ("after the hand-off"). What exists: the
contract file and its rules `X01` to `X05`, the human-only command `ppc decide-addition`, the guard that blocks agents
from deciding, the hand-off writing the file, and the cut-applying prompt (`architect-pp/commands/apply-cuts.md`).
See "What the first real try showed" at the end.

## The problem it solves

A person with no technical background cannot tell which parts of a proposed design they asked for and which the
tool added. In the first real run of The Architect (idea: "an app to keep track of my tasks") the person named four
things: add, list, mark done, "maybe delete". The design that came back, and that the person approved with "yes",
also contained a recoverable (soft) delete, light and dark appearance, numeric accessibility targets (WCAG 2.2 AA),
a health route that exists only for a script, and a heavy tool chain (Next.js, Drizzle, Tailwind, Vitest,
Playwright). The blueprint ran to 1,975 lines. Nobody decided those additions; they entered because the default
answer was "yes".

Today the hand-off flags such additions in its report. A report is read once and forgotten, and nothing stops the
additions from reaching the plan. The scope review turns each one into a visible, individual, recorded decision.

## What it is

A step between the hand-off and SDD.PP's planning. Its output is a file, `.architect/additions.yaml`, with one entry
per addition:

| Field | Meaning |
|---|---|
| `id` | `ADD-001`, ... |
| `what` | The addition in plain words, as a novice would read it |
| `origin` | Where it came from: not in the person's words; added by the tool; implied by a thing they asked for |
| `cost` | What it adds: components, quality targets, decisions, tools the person would have to learn, lines to read |
| `if_cut` | What the person loses |
| `later` | How hard it is to add afterwards (easy, needs a migration, needs a redesign) and a trigger to revisit it |
| `recommendation` | `cut`, `keep` or `decide`, with the reason, proposed by the model |
| `decision` | `pending`, `keep` or `cut`: written **only by a person** |
| `decided_by`, `reason` | Who, and why |

## What happens to each decision

- **cut:** a model step removes everything the addition brought into `.architect/` (the capability, quality target,
  constraint and decision that exist only because of it), adds it to the non-goals with its "revisit when" trigger,
  raises the blueprint revision, and runs `ppc validate --design`. Cut items then reach SDD.PP as non-goals, which
  are the negative prompt of every task.
- **keep:** stays, with the person's reason recorded, so that later nobody asks again why it is there.
- **pending:** blocks planning. SDD.PP does not plan slices from a design with undecided additions.

## How the person decides without being overwhelmed

- Each addition is explained in a few lines, with its cost and what is lost, not in jargon.
- One command shows all of them. The person can decide one by one, or accept all recommendations at once
  (`accept-recommended`). The default is the opposite of today's: doing nothing blocks, and the easy answer is the
  recommended minimal design instead of "keep everything".
- Only a person can decide: the same guard that keeps approvals human-only blocks an agent from writing a decision.

## My recommendations for the five additions found

These are a model's proposals; the owner decides.

| Addition | Recommendation | Why |
|---|---|---|
| Recoverable (soft) delete | **cut** | The person said "maybe delete". It adds a column, a filter in every query, a migration and a decision, and the recovery is "by hand in the database file", which a novice cannot do. Revisit if they delete something by mistake twice |
| Light and dark appearance | **cut** | Nobody asked. It brings a constraint, a token system and contrast tests with it |
| Numeric accessibility targets (contrast, target size, reflow) | **cut the numbers, keep the baseline** | Native controls, labelled inputs and keyboard use cost nothing and stay as practice. The numeric targets add three quality attributes and tests no one requested |
| A health route | **keep** | A walking skeleton needs something to start the system and check it answers; it is required by how SDD.PP builds, not a feature |
| Heavy tool chain | **cut Playwright and the design system; decide on the framework** | An end-to-end browser test for four buttons is the clearest excess. Changing the framework is a redesign, so it is a separate decision for the person, with a "re-run with a lighter stack" option |

## What to build, in order

1. A schema for `additions.yaml` and the rules: an addition with `decision: pending` is a warning while the design is
   being drafted and an error once slices exist; a `cut` decision must have no capability, quality attribute or
   constraint left that only it justified.
2. The hand-off writes `additions.yaml` instead of only reporting.
3. A human-only decision command (`accept`/`cut`/`accept-recommended`), with the guard blocking agents from it.
4. The step that applies the cuts to `.architect/`, validated by `ppc validate --design`.
5. A test on the real fixture: the hand-off output of the task-list blueprint, additions detected, a cut applied under
   a fixture name (not a human approval), and the trimmed design measured against the original (files, decisions,
   quality attributes, lines).

## What it cannot do

- It reviews what the model **noticed**. The first hand-off run missed one addition (soft delete) until the prompt
  was tightened. An addition nobody flags is not reviewed. A deterministic check (the complexity budget, the count of
  decisions) catches size, not intent.
- It works **after** The Architect has generated its blueprint, so the generation cost (3.7 USD in the real run) is
  already spent. The same additions are visible earlier, at The Architect's confirmation gate, where the person said
  "yes". Intercepting there would save that cost, but means changing the upstream interview, which is why this
  design starts after the hand-off, where it works with any blueprint, including ones already written.
- It does not make the person understand the trade-offs; it makes them visible.

## How we would know it works

On the task-list fixture: the number of additions detected, the size of the design before and after the cuts, and,
in the later project-level experiment, whether the slices planned from the trimmed design stay narrow where the
original design led an ambitious request to 4.6 times the code.

## What the first real try showed (2026-10-26, one run of each step)

Chain: hand-off from The Architect's real blueprint, then the decision, then the cuts, then validation.

- The hand-off wrote **5 additions** in plain words (a dark appearance, accessibility targets, a recoverable delete,
  a full-stack framework, a health route), each with cost, what is lost, how hard it is to add later and a
  recommendation: cut two, keep one, leave two to the person. This is close to my own table above. It cost 0.81 USD.
  An example is in `architect-pp/fixtures/additions-example.yaml`.
- The decisions were made **by me under a fixture name** (`--accept-recommended`): this tested the mechanism and is not
  a human decision. It cut two and kept one, and left two to the person.
- Applying the cuts took about 1.5 minutes and 0.33 to 0.45 USD. Result: 12 files and 649 lines became 11 files and
  617 lines, 5 decisions became 4, the non-goals went from 8 to 10, the revision from 1 to 2, and the design validated
  with 0 errors and 2 warnings (`X01`, the two additions left to the person).
- **The reduction is small (5%) by construction**: the two large items, the framework and the accessibility targets,
  are the ones recommended for the person to decide. The value of the step is that the decisions are visible, not that
  it shrinks the design by itself.

Two weaknesses found, and one fixed:

1. **The ids an addition lists (`affects`) are written by a model and can be incomplete.** The validator only checks the
   ids it is told about. In the first run the dark appearance had an empty list, and a quality target still demanded
   contrast "in the dark theme", contradicting the new non-goal. Neither the rules nor the step noticed.
   *Fixed in the prompt:* the step now searches the whole design for each cut addition's key words and reports any
   mention that belongs to another undecided addition. In the second run it reported exactly that overlap and told
   the person to decide the two additions together. It is a prompt fix checked in one run; the validator still cannot
   see a contradiction in prose.
2. **Overlapping additions** (a dark appearance and an accessibility target about contrast) cannot be decided one at a
   time without a contradiction in between. *Built afterwards:* an addition lists `overlaps`, and `ppc decide-addition` refuses to
   decide one while an overlapping one is undecided unless all are named (or `--alone`); `--accept-recommended` leaves a group to the
   person when its members were not recommended the same way. On the real additions (with the overlap written by hand,
   since the hand-off prompt that now asks for it has not been run again) the dark appearance and the accessibility target
   were both left to the person, where the first run had cut one and left the other, which produced the contradiction.

Also: in both runs the cut step said it could not run a helper script (no permission) and did the edits by hand. It
reported that, and the final validation was repeated by me.
