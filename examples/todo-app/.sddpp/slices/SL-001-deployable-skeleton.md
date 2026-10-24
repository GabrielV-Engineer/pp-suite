---
id: SL-001
title: Deployable end-to-end skeleton
type: skeleton
status: ready
blueprint_revision: 1
components: [frontend, backend, database]
quality_attributes: [QA-002]
acceptance:
  - id: AC-1
    scenario: Given the system is running, when the health endpoint is requested, then it answers 200 and reports the database as reachable.
  - id: AC-2
    scenario: Given a change is pushed, when CI runs, then it executes the unit tests, the architecture tests and `ppc validate`.
approved_by: example-owner
---

## Behavior

The thinnest path that touches every layer: the frontend asks the backend for its health, and the
backend asks the database. It is deployable and verified by CI from the first day, so integration
problems appear in slice one and not at the end.

## Out of scope

- Any task behavior. This slice only proves the layers are wired together.
- Authentication, styling and error pages.
