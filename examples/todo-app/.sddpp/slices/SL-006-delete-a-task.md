---
id: SL-006
title: Delete a task permanently
type: feature
status: planned
blueprint_revision: 1
capability: CAP-003
components: [frontend, backend, database]
depends_on: [SL-002]
acceptance:
  - id: AC-1
    scenario: Given an existing task, when the owner deletes it, then it disappears from the list and does not come back after a backend restart.
---

## Behavior

Deleting removes the task for good.

## Out of scope

- Undo, a trash bin or soft deletion.
- Deleting several tasks at once.
