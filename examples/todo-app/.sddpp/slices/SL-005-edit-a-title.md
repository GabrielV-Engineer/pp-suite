---
id: SL-005
title: Edit the title of a task
type: feature
status: planned
blueprint_revision: 1
capability: CAP-003
components: [frontend, backend, database]
depends_on: [SL-004]
acceptance:
  - id: AC-1
    scenario: Given an existing task, when the owner changes its title to a valid one, then the list shows the new title.
  - id: AC-2
    scenario: Given an existing task, when the owner changes its title to an invalid one, then the task keeps its previous title.
---

## Behavior

The owner can rename a task, and the same validation rules as creation apply.

## Out of scope

- Editing the completed state (covered by SL-003).
- Edit history.
