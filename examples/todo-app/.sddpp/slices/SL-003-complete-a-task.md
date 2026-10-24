---
id: SL-003
title: Mark a task as completed
type: feature
status: planned
blueprint_revision: 1
capability: CAP-002
quality_attributes: [QA-003]
components: [frontend, backend, database]
depends_on: [SL-002]
acceptance:
  - id: AC-1
    scenario: Given an open task, when the owner marks it as completed, then the list shows it as completed.
  - id: AC-2
    scenario: Given a completed task, when the backend restarts, then the task is still completed.
---

## Behavior

A task has an open or completed state, and the owner can switch it to completed.

## Out of scope

- Marking a completed task as open again.
- Bulk completion.
