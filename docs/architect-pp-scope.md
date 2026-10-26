# Scope of Architect.PP, and who owns what

Decided on 2026-10-26 with the owner. It corrects an earlier plan of mine.

## One source of truth for each thing

| Thing | Owner | Where | Written by | Read by |
|---|---|---|---|---|
| What the system is and why: capabilities, quality attributes, components and their limits, non-goals, decisions and the evidence behind them | **Architect.PP** | `.architect/` | Architect.PP only | SDD.PP, read-only |
| The plan of work and its state: slices, their order and status, debt, audits, the work breakdown | **SDD.PP** | `.sddpp/` | SDD.PP only | everyone |

The earlier plan had Architect.PP also "regroup the design into vertical slices". That would make two plans, and
the second would have to be reconciled with the first. **It is dropped.** Slicing, ordering, the WBS and the state
belong to SDD.PP alone.

The consequence for the hand-off: The Architect's own output includes a step-by-step implementation plan (the one that
was ordered by layers, with literal code in the early steps). That plan is **not carried over** into `.architect/`.
What crosses is the design, not the work plan.

## What Architect.PP is for

The owner's words: help with research and design for any kind of system, even for a person who knows nothing about
the subject; be the guide for shaping the idea; send no rubbish, keep everything coherent; stop beginners from
producing designs with incongruences, bad practices, over-engineering or a weak architecture. It is a thin layer over
The Architect (upstream, MIT), not a rebuild. Three jobs:

1. **Guide the person from a vague idea to a coherent design.** The Architect's interview and research do this. Open
   point: the quality of that guidance has not been evaluated here, only that it inflates scope when left alone.
2. **Check the design before anything is built.** A deterministic linter over the blueprint, so that a rule decides
   and not a model's mood. Built so far: circular dependencies between components (`D01`), a frontend reaching the
   database or a database depending on the layers above (`D02`), a complexity budget by declared level (`D03`),
   no prioritization among the capabilities (`D04`). Together with the rules that already existed (every component
   has a reason, every decision lists rejected alternatives, every quality attribute has a metric and a target).
   Still to build: a "scope diet" step that asks the person to cut when the budget is exceeded, and checks on
   decisions and evidence.
3. **Hand the design to the contract.** Turn The Architect's output into the files of `.architect/`, validated by
   the same rules. This is a format conversion done by a model and checked by the validator; it keeps the design and
   drops the step plan and the literal code. **Built and tried:** `architect-pp/commands/handoff.md`. On a real
   1,975-line blueprint from The Architect (idea: a task list) it produced a contract that passes
   `ppc validate --design --strict` with no findings: 11 files, 5 decisions, 2 evidence files, and a list of five
   additions it kept but flagged. A first version of the prompt produced 26 files with 11 decisions and 11 evidence
   files and missed one addition; the second, tighter version fixed both. Two runs on one blueprint show it can work,
   not that it is reliable.

## The loop that keeps the plan alive

When a slice finds the design wrong, SDD.PP opens a **change request** in `.sddpp/change-requests/` and does not edit
`.architect/`. Architect.PP revises the design and raises the blueprint revision; slices planned against an older
revision are flagged (`W03`). This is the "self-renewing" part: one owner per file, and a visible path between them.

## Prompts for the person (SDD.PP side, to build)

Decided with the owner:

- **Granularity: per task, not per whole slice.** A whole slice in one prompt grows the context. The unit is a
  phase or task of a slice (the tests, the implementation, the audit, or a finer task listed in the slice).
- **Made of references, not copies.** The prompt names the files to read instead of pasting them, so it stays short.
  This is a design choice to keep context small; it has not been measured.
- **Three parts:** a system prompt (role and rules), a **negative prompt** (what not to do: the slice's "Out of scope",
  the blueprint's non-goals, the component boundaries) and, only when the work touches an interface or an
  architectural choice, a **design prompt**.
- **Offered, not imposed.** Saved as files the person can use as they are, edit, or ignore.
- Generated from the contract by a script, so it is the same every time. Not built.

## Tests

The owner works with tests and wants the experiment to use them. By default SDD.PP leaves tests optional, as Spec Kit
does; the strict cycle (tests first, human approval, test lock) is an option per slice. In the experiment both arms
build with tests.
