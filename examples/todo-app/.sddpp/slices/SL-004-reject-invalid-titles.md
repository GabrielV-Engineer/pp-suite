---
id: SL-004
title: Reject empty and over-long titles
type: feature
status: planned
blueprint_revision: 1
capability: CAP-001
quality_attributes: [QA-004]
components: [frontend, backend]
depends_on: [SL-002]
acceptance:
  - id: AC-1
    scenario: Given the form, when the owner submits an empty title, then no task is created and a message explains why.
  - id: AC-2
    scenario: Given the form, when the owner submits a title longer than the maximum length, then no task is created. The limit is pending CR-0001.
---

## Behavior

Invalid titles are rejected by the backend, and the frontend shows the reason. It does not touch the
database layer: this slice shows that a slice crosses only the layers it needs.

## Out of scope

- Trimming or normalizing titles.
- Any rule about duplicate titles.
