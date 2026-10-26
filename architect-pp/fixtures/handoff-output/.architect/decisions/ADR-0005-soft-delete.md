---
id: ADR-0005
title: Delete tasks softly
status: accepted
date: 2026-10-25
drivers: [CAP-004]
---

## Context

The owner can delete a task (CAP-004), and a mistaken delete should not lose the text for good. A trash or
restore screen is a non-goal, so recovery is by hand.

## Decision

Deleting stamps `deleted_at` on the task's row. The row stays in the database file; every read filters on
`deleted_at` being empty. Deleting an already deleted task changes nothing.

## Rejected alternatives

- **Hard delete.** Rejected: a mistaken delete would be unrecoverable.

## Consequences

- Every read must filter out deleted rows, and the list index includes `deleted_at`.
- Deleted rows accumulate in the file. The blueprint would reverse this if the file grows large enough to matter
  or privacy requires true erasure.
- Recovery is by editing the file with a SQLite viewer; there is no restore screen in v1.
