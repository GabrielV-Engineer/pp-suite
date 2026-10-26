---
description: "HAND-OFF: turn The Architect's blueprint into the design files of the pp-suite contract (.architect/)"
---

## User input

```text
$ARGUMENTS
```

The argument is the path of the blueprint file written by The Architect. If it is empty, stop and ask for it.

## What this step is, and is not

The Architect's blueprint mixes two things: **the design** (what the system is, and why) and **a plan of work** (a build
order with commands and code). pp-suite keeps them apart: the design goes into `.architect/`, owned by Architect.PP, and
the plan of work belongs to SDD.PP, which builds its own from the design. So this step **converts the design and drops
the plan**. It is a format conversion, not a redesign: do not improve, add or remove decisions.

## Rules

- **Carry over:** the vision, users, goals, non-goals, constraints, stack choices and the reasons for them, the data
  model, the API, the component boundaries, the measurable quality targets, the risks, and the evidence (which versions
  were verified, when, against what).
- **Do not carry over:** the build order and its steps, setup and bootstrap commands, rollback commands, directory
  listings that only serve the build, source code, the model-routing and skills sections, and the generated project
  instructions for the builder. List each dropped section in your report.
- **Never invent.** A quality attribute needs a metric and a target taken from numbers or checks the blueprint states
  (a contrast ratio, a binding address, a latency, a count). If the blueprint states none for a concern, do not
  create a quality attribute for it. A capability is a behavior a person can see; a technical or cosmetic goal that
  nobody asked for is a constraint, a decision or an addition to flag, not a capability.
- **Record additions.** If the blueprint contains something beyond what the person's own words asked for (a feature
  they never named, a stronger version of one they did, such as a recoverable delete when they said "maybe delete
  them", a heavy tool for a small system, a quality target nobody requested), keep it in the design as the blueprint
  says and write it in `.architect/additions.yaml` (step 6). Do not remove it: removing is the person's decision.
- **One owner per file.** Write only under `.architect/`. Do not create `.sddpp/`.
- **English.** The files of the contract are in English whatever the language of the blueprint.

## Steps

1. Read the blueprint completely. Read the contract so that you follow it exactly:
   `contract/v0.1/schemas/blueprint.schema.json`, `adr.schema.json`, `evidence.schema.json`, `docs/contract-v0.1.md`
   (the layout and the id formats), and the worked example `examples/todo-app/.architect/` as a model of each file.
   The repository that holds them is the one that contains this command; the user may give its path.
2. Write `.architect/blueprint.yaml`:
   - `project`: a short id (kebab-case), name, a `level` (`lite`, `standard` or `full`) that matches the size of
     what the blueprint describes, and a one-sentence summary.
   - `non_goals`: every row of the blueprint's non-goals, as short statements.
   - `constraints` (`CON-NNN`): limits that shape the design (where it runs, who can reach it, cost).
   - `quality_attributes` (`QA-NNN`): only measurable ones, following the Never invent rule.
   - `capabilities` (`CAP-NNN`) with a priority: one per behavior a person can see.
   - `components`: the parts with a boundary that matters, with `kind`, `responsibility`, `may_depend_on` and
     `justified_by` (a capability, quality attribute or constraint behind each). A framework that merges layers in one
     project (a server-rendered page whose server code lives beside it) is still described by responsibility:
     the interface, the logic, the data.
   - `budgets.max_slice_production_lines`: 200 unless the blueprint says otherwise.
   - `default_mode: light`: the cycle SDD.PP follows by default (tests and code together in one session; a slice can
     ask for the strict cycle). This is the method's default, not something the blueprint states. Leave `test_policy`
     out unless the blueprint or the person says tests are required or not wanted.
3. Write `.architect/brief.md` (the vision, users and goals in a page), `.architect/architecture.md` (the structure
   of the components and their rules, the data model and the API in summary; **no build steps**) and
   `.architect/glossary.md` (the terms of the domain).
4. Write `.architect/decisions/ADR-NNNN-<slug>.md` only for decisions that are **costly to reverse or that a
   reader would question**: the runtime and framework, the database, how the system is exposed, and a choice that
   removes a capability others expect. Cosmetic choices (a colour scheme), tooling choices (a linter, a formatter)
   and a choice already fixed by another ADR do not get one. Aim for about five or fewer; if you write more than
   six, say why in the report. Each has context, the decision, the **rejected alternatives and why** (those the
   blueprint gives; do not make up others) and the consequences, and references the capabilities, quality
   attributes or constraints that drove it.
5. Write `.architect/evidence/EV-NNN-<slug>.md` for the checks the blueprint reports (for example, versions verified
   against a package registry), with the source, the date and an expiry date. **Group by source and date**: all the
   package versions verified against one registry on one day are one evidence file, not one per package.
6. Write `.architect/additions.yaml`, following `contract/v0.1/schemas/additions.schema.json`, with one entry per
   addition you recorded:
   - `what` in words a novice can read, and `origin` (`not_requested`, `stronger_than_asked`, `tool_added` or
     `implied_by_request`);
   - `cost` (what it adds: components, targets, decisions, tools to learn, lines to read) and `if_cut` (what the
     person loses);
   - `later`: how hard it is to add afterwards (`easy`, `needs_migration`, `needs_redesign`) and when to revisit it;
   - `affects`: the ids (`CAP-`, `QA-`, `CON-`, `ADR-`) that exist **only** because of this addition;
   - `recommendation`: `cut` if the person did not ask for it and nothing they asked for needs it; `keep` if
     something they asked for, or the way the system is built and checked, needs it; `decide` if cutting it would
     mean a redesign (a change of framework) or the choice is a matter of the person's values. Give the reason;
   - `overlaps`: the ids of other additions that cannot be decided separately from this one, because they mention the same
     thing (a dark appearance and an accessibility target about contrast in it). List it on both; leave it out if none;
   - `non_goal`: the sentence it would become among the non-goals if cut;
   - `decision: pending`. **Never write `decided_by`, `reason` or any decision**: only a person does.
   If there are no additions, do not create the file.
7. Run `ppc validate <project> --design` (if you are not allowed to run it, say so in the report; do not claim it passed). Fix every error. Read every warning: fix it if the cause is in your
   conversion, and report it if the cause is in the blueprint's design.
8. Report: the files written; the sections dropped; the additions you flagged; the quality attributes you did not
   create because the blueprint gave no measure; every warning left, with its cause. Say plainly what you decided
   on your own.
