# Slice review: look again at a slice before it starts

Status: **design, not built** (2026-11-19). Nothing in this document has code or tests yet. The owner chose this shape
over two alternatives: a review step on every slice, and a separate review command with no interview. Two of the three
open questions are decided (see [Decisions](#decisions)); the third waits for measurement.

## The problem it solves

Slices are planned once, from the design, before anything is built. That is when the least is known. By the time a
slice starts, the design may have changed under it, the slice before it may have left something open, or debt may be
waiting in its components. In the first real project ([report](first-real-project-report.md)):

- There were 21 change requests across 34 slices. After one of them, 19 planned slices carried a `W03` warning (planned
  against an older revision).
- The only way to clear that warning is `ppc reread`, for all slices at once. It records that someone read the change,
  not that each slice still fits. Finding F-K3: "`blueprint_revision` of 19 slices was changed from 4 to 5 by hand,
  inside a commit titled 'docs(log): record the SL-003 build, CR-0003 and two ppc findings'". Nobody read anything.
- The question that approves a slice offers "I want to change something". That option says nothing about *what* might
  need changing, so the person has nothing to react to.

The slice review moves the reading to the moment it matters, one slice at a time. It also lets the person adjust the
slice, through questions about specific changes, before approving it.

## The flow

```
ppc ask SL-012
   │  card: the slice as planned + "Since it was planned" (signals)
   ▼
panel ── Yes, approve it as planned ──────────────► ppc approve SL-012 (also rereads it)
      ── Review it with me first ──┐
      ── Not yet ──────────────────┼──────────────► nothing changes
                                   ▼
                     interview: 1 to 5 questions in the panel,
                     each one tied to a signal
                                   ▼
                     a proposed diff of the slice file only
                     (a split also shows the new slice in full)
                                   ▼
panel ── Apply the changes and approve ──► diff applied (+ new slice, planned),
      │                                    ppc validate, ppc approve SL-012 (also rereads it)
      ── Discard the changes, approve as planned ──► ppc approve SL-012 (also rereads it)
      ── Not yet ──► the diff is discarded; the slice stays planned
```

The person approves last, and only once. What they approve is exactly what gets built. A slice created by a split
enters the plan as `planned` and needs its own approval to start.

## 1. The card shows what changed since the slice was planned

`ppc show SL-NNN` (and so `ppc ask`) adds a section **Since it was planned**, listing only the signals that exist for
this slice:

| Signal | Where it comes from |
|---|---|
| Change requests applied after the slice's `blueprint_revision` | `.sddpp/change-requests/`, as `rereadCard` already computes for all slices |
| Deviations and open items in the audits of closed slices that share a component with it | the audits of `done` slices |
| Debt it pays, and open debt in its components | already on the card (`Pays`, `Open debt here`) |
| The size of the last slices on the same components, against `max_slice_production_lines` | the audits' `production_lines` |

With no signal, the section says "Nothing changed since it was planned". The question is then the one we have today,
with "Review it with me first" in place of "I want to change something".

## 2. The panel question

| Option | Command | What happens |
|---|---|---|
| Yes, approve it as planned | `ppc approve SL-NNN` | It becomes `ready`. If the slice is behind the design, its `blueprint_revision` moves to the current one: the card showed the change requests, and approving after seeing them counts as having read them (decision 1) |
| Review it with me first | — | The interview starts. Nothing is decided |
| Not yet | — | Nothing is decided; it waits |

When the card has signals, the question says so in one line ("2 changes since it was planned"), so the person sees
why a review could be worth it. It does not push either way.

## 3. The interview

A prompt in the build cycle (`sdd-pp/extension/sddpp-cycle/commands/review.md`), written for pp-suite. It follows
the shape of the interface interview (`architect-pp/extension/commands/ui.md`, step 2): questions in the panel, only
about what the design and the slice do not already answer, with a fixed maximum.

It does **not** reuse The Architect's interview. That one designs a whole project from an idea, and its first run cost
0.65 USD on its own ([m1 report](m1-report.md)). Its code may not be copied here either. It takes one idea from
"grill me" style interviews: one question at a time, each one specific. It adds a limit those interviews do not have.

Rules for the questions:

- **At most 5, at least 1.** Each one comes from a signal on the card, or from a gap between the slice and the design
  (an acceptance scenario that does not test its capability, an `Out of scope` item that a change request now needs).
- **Each one names its source.** For example: "CR-0007 moved validation to the backend. SL-012 checks titles in the form.
  Should it also check them in the backend?"
- **Options, not open text.** Two to four answers with what each one changes in the slice. The panel's own "Other"
  remains for free text.
- **Biased to keep the slice small.** For each question, the first option is the one that leaves the slice smallest.
  The scope review found the tool adding things nobody asked for (13 in the first real project). A review that asks
  "what is missing?" would do the same.
- **No signal, no invention.** If there is nothing to ask, it says so and returns to the approval question.

## 4. The proposed diff

From the answers, the agent proposes a change to **the slice file only**, shown as a diff before anything is written.
It may:

| Change | Limit |
|---|---|
| Cut: remove an acceptance scenario, or move behavior to `Out of scope` | none |
| Adjust: reword `Behavior`, a scenario, or `Out of scope` | it must still serve the slice's `capability` |
| Split: turn the slice into two planned slices | each one still runs end to end, and the later one `depends_on` the earlier one. The diff shows the new slice in full (behavior, acceptance, out of scope, components, `depends_on`), not only that one is created (decision 2) |
| Add: a scenario or behavior | only something a capability, quality attribute or screen in the design already justifies, and only within the components the slice touches |

It may not:

- **Change `.architect/`.** If the interview shows that the design is wrong, the result is a change request
  (`/pp-change`), not a diff. The rule that a build does not edit the design (`C08`) stays true.
- **Add something the design does not have.** That is a change request too. An addition hidden inside a slice is
  exactly what the scope review exists to stop.
- **Touch approved red tests, a slice that is not `planned`, or another slice**, except the new one created by a split.
- **Go over the size budget.** If the answers make the slice larger than `max_slice_production_lines` seems to allow,
  the proposal is a split, not a larger slice.

The diff comes with two short lists: **consequences** (what the slice will and will not deliver now, and which later
slices depend on what changed) and **warnings** (debt that stays unpaid, a split that adds a slice to the plan).

## 5. The second question

| Option | What happens |
|---|---|
| Apply the changes and approve | The agent writes the diff, `ppc validate --strict` must pass, then `ppc approve SL-NNN` (for a split, the first of the two). A split's new slice enters the plan as `planned` with no further question; this answer counts as approving it into the plan, not as approving it to start (decision 2) |
| Discard the changes, approve as planned | `ppc approve SL-NNN` on the original slice |
| Not yet | The diff is discarded; the slice stays `planned` |

If validation fails after the diff, nothing is approved. The agent reports the failure and the slice file goes back
to how it was.

The guard lets a human-only command through only when it appears in the label after ` — `. So the first option needs
the agent to apply the diff before the command runs. That has to be designed and tested against the guard (see what
to build, step 4).

## What it costs, and how we will know if it is worth it

- **Two more decisions per reviewed slice**, plus the interview. A slice approved as planned costs what it costs today.
- **Tokens.** Reading the slice, its components, the change requests and the previous audits, plus the interview. Not
  measured.
- **What we record**: every answer to the approval question already goes to `.sddpp/answers.jsonl`. We add whether the
  review was chosen, how many questions it asked, and whether the applied diff changed the slice.
- **When we decide**: after about 10 slices of a real project. If reviews are rarely chosen, or rarely change
  anything, the interview goes and only the card stays.

## What it cannot do

- It cannot tell whether a slice is good. It can only bring up what changed and ask the person.
- It does not replace change requests. The design still changes only through one.
- The signals are only as good as the audits. An audit that records no deviation gives the card nothing to show.

## Decisions

- **2026-11-19, decision 1: approving a slice rereads it.** `ppc approve SL-NNN` on a slice behind the design also
  moves its `blueprint_revision` to the current one, and nobody else's. An approval now means "it may start, and it
  fits the current design". Reason: the card shows the change requests since the slice was planned, so the reading
  happens one slice at a time, when it matters. The bulk `ppc reread --all` was a stamp (F-K3). `ppc reread` stays, for
  clearing several slices at once.
- **2026-11-19, decision 2: the second question approves a split's new slice into the plan.** There is no third
  question. The diff must show the new slice in full. The new slice still needs its own card and `ppc approve` before
  it starts. Reason: a split is one decision, and the control that matters (approving it to start) is kept.

## Open question for the owner

- **A rule for the review.** None of this needs a new contract rule as designed, because `ppc validate` already checks
  the edited slice. A rule could require a reviewed slice to carry a record (questions, answers, hash of the resulting
  file) and fail if the file changed after it. Deferred until about 10 reviewed slices show whether the review is used,
  and which fields of a record matter. If built, it gets an id, a test and a row in [contract-v0.1](contract-v0.1.md).

## What to build, in order

Each step test first.

1. **The card section.** "Since it was planned" in `sliceCard` (`tools/ppc/src/decisions.mjs`): change requests after
   its revision, audit deviations on shared components, recent sizes. Tests with fixtures built in code, one per signal
   and one with none.
2. **The question.** In `askFor`, for a planned slice, "Review it with me first" in place of "I want to change
   something", with the signal count in the question. A test on the panel input.
3. **Approve rereads one slice** (decision 1). A test that approving a slice behind the design moves its
   `blueprint_revision`, and only its own; `docs/how-it-works.md` says what an approval now means. A test that a split's
   new slice passes `ppc validate` as `planned` and cannot start without its own approval (decision 2).
4. **The second question through the guard.** A test, through the real guard and ledger, that "Apply the changes and
   approve" lets through exactly `ppc approve SL-NNN` once, after the slice file changed.
5. **The prompt** (`review.md`) and its place in `/pp`: offered when the person picks "Review it with me first".
   Tried once on a copy of the example project, with the interview run in the panel. The result is recorded here.
