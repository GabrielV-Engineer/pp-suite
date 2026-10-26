---
id: ADR-0005
title: Delete tasks softly, keeping the row in the database file
status: accepted
date: 2026-10-25
drivers: [CAP-004]
---

## Context

The owner can delete a task (CAP-004). The blueprint chose to make a mistaken delete recoverable by hand in the
database file. This goes beyond a plain delete and is flagged for the owner in ADD-001.

## Decision

Deleting a task sets `deleted_at` and keeps the row. Every read filters on `deleted_at is null`. A repeated delete
changes nothing.

## Rejected alternatives

- **Hard delete.** Rejected: a mistake would not be recoverable by hand in the file.

## Consequences

- The `tasks` table gets a `deleted_at` column and an index on (`deleted_at`, `created_at`), and every query must
  filter on it.
- A mistake can be fixed by editing the file, but there is no restore screen (a non-goal, revisited after two
  accidental deletes).
- Deleted rows stay in the file for good, so true erasure is not possible without removing rows by hand.
- The decision would be reversed if the file grows large enough to matter, or if privacy requires true erasure.
