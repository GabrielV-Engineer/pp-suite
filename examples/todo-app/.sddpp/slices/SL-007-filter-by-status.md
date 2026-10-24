---
id: SL-007
title: Filter the list by status
type: feature
status: planned
blueprint_revision: 1
capability: CAP-004
components: [frontend, backend]
depends_on: [SL-003]
acceptance:
  - id: AC-1
    scenario: Given open and completed tasks, when the owner chooses the open filter, then only open tasks are listed.
  - id: AC-2
    scenario: Given open and completed tasks, when the owner chooses the completed filter, then only completed tasks are listed.
---

## Behavior

A status filter narrows the list. The backend does the filtering so that the frontend never has to
hold every task.

## Out of scope

- Free-text search.
- Remembering the chosen filter between visits.
