---
description: "Generate dependency-ordered SDD.PP slices"
---

## SDD.PP slice rules (apply before and after the core command)

- Group work by **behavior**, never by layer. Do not emit "data layer, then server, then UI" tasks.
- Write each slice as its own file `.sddpp/slices/SL-NNN-<slug>.md`, with the YAML frontmatter
  defined by `contract/v0.1/schemas/slice.schema.json` (type, components, acceptance, depends_on,
  blueprint_revision). Use only components, capabilities and quality attributes that exist in
  `.architect/blueprint.yaml`.
- Slice types are `skeleton`, `feature`, `refactor`, `spike` and `fix`. The first slice is the skeleton.
- Every `feature`, `fix` and `skeleton` states what it leaves out under a `## Out of scope` heading.
- A slice's hand-written production code must fit the budget in `.architect/blueprint.yaml` (tests and lockfiles do not count); split it otherwise.
- New slices start as `planned`. Never set `approved_by`, `red_approved_by` or any approval field:
  those are written only after a human approves.

{CORE_TEMPLATE}

## SDD.PP sign-off

Before finishing, check that no task is a layer-only task, that every slice file validates against
the schema, and that `tasks.md` only lists the slices (an index, not a second copy).
