---
id: ADR-0003
title: Store tasks in a SQLite file through Drizzle and better-sqlite3
status: accepted
date: 2026-10-25
drivers: [CON-001, CON-003, QA-004]
evidence: [EV-001]
---

## Context

Tasks must survive a restart (QA-004), stay on the owner's machine (CON-003) and need no service to operate
(CON-001). One person is the only user.

## Decision

Keep tasks in one SQLite file, `data/tasks.db`. Access it with Drizzle ORM and the synchronous `better-sqlite3`
driver. The schema is code, migrations are generated from it, committed, never edited by hand, and applied by an
explicit command, never on app start.

## Rejected alternatives

- **Postgres (for example Supabase or Neon).** Rejected: a service to start and operate for one user.
- **Prisma.** Rejected: a heavier client for one table.
- **`@libsql/client`.** Rejected in favor of `better-sqlite3`, which gives schema-as-code with generated
  migrations and trivial synchronous queries, ships its own binaries and needs no build-script approval.
- **Migrating on app start.** Rejected: it risks racing and surprise writes.

## Consequences

- The data is one file the owner can copy; the file is also the backup unit, and it is the only copy of the data.
- The blueprint would reverse the storage choice if the app must be reachable from another device (the hosting
  trigger), and the driver choice if the driver fails to load on the owner's Node version.
- The driver version and its Node requirement are in EV-001.
