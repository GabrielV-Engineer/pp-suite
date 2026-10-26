---
id: ADR-0002
title: Store tasks in a SQLite file through Drizzle and better-sqlite3
status: accepted
date: 2026-10-25
drivers: [CON-001, CON-003, QA-002]
evidence: [EV-001]
---

## Context

Tasks must survive a restart (QA-002), stay on the owner's machine (CON-003) and need no service to run
(CON-001). One person is the only user.

## Decision

Store tasks in one SQLite file, `data/tasks.db`, and reach it with Drizzle ORM and the synchronous
`better-sqlite3` driver. The schema is code and migrations are generated from it.

## Rejected alternatives

- **Postgres (for example Supabase or Neon).** Rejected: a service to start and operate for one user.
- **Prisma.** Rejected: a heavier client for one table.
- **`@libsql/client`.** Rejected: the chosen driver ships its own binaries and needs no build-script approval.

## Consequences

- No server to run, and the data is one file the owner can copy; backup is copying that file.
- The synchronous driver keeps every query trivial.
- Everything is in one file, so tasks are lost if it is lost (accepted for a prototype, see the risks in
  `architecture.md`).
- The decision would be reversed if the app must be reachable from another device (the hosting trigger in the
  non-goals), or if the driver fails to load on the owner's Node version.
- Whether Next.js bundles the driver correctly is unverified (EV-001).
