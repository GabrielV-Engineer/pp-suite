---
id: SL-008
title: Share title validation rules between form and API
type: refactor
status: planned
blueprint_revision: 1
components: [frontend, backend]
depends_on: [SL-004]
pays: [DEBT-FE-001]
---

## Behavior

Behavior does not change. The title rules are defined once and used by both the form and the API,
paying DEBT-FE-001. The tests written by SL-004 must stay green and untouched.

## Notes

A refactor slice has no acceptance criteria of its own: its proof is that the existing tests still
pass and that the duplication is gone. Its commits are structural only.
