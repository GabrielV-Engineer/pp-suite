---
id: SL-002
title: Create a task and see it in the list
type: feature
status: planned
blueprint_revision: 1
capability: CAP-001
quality_attributes: [QA-001, QA-003]
components: [frontend, backend, database]
depends_on: [SL-001]
acceptance:
  - id: AC-1
    scenario: Given an empty list, when the owner submits the title "Buy milk", then the list shows one open task titled "Buy milk".
  - id: AC-2
    scenario: Given a task was created, when the backend restarts, then the task is still in the list.
---

## Behavior

Submitting the form creates a task and the list shows it, through all three layers.

## Out of scope

- Editing, deleting and completing tasks (later slices).
- Pagination: the list returns every task (registered as DEBT-BE-001).
- Keyboard navigation of the list.
