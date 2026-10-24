---
id: ADR-0001
title: Use SQLite as the storage engine
status: accepted
date: 2026-10-24
drivers: [QA-003, CON-001, CON-002]
evidence: [EV-001]
---

## Context

Tasks must survive a restart (QA-003), live on the owner's machine (CON-002) and run with no
infrastructure to administer (CON-001). One person is the only user.

## Decision

Store tasks in SQLite, in a single file next to the application.

## Rejected alternatives

- **A client/server database (for example PostgreSQL).** Rejected: it adds a service to install,
  run and back up, for a workload with one owner. The source recommends client/server engines
  when many client programs send SQL to the same database over a network, which is not this case
  (EV-001).
- **A JSON file on disk.** Rejected: partial writes can corrupt it, and it gives no transactions,
  which puts QA-003 at risk.

## Consequences

- SQLite supports one writer at a time per database file (EV-001). Fine for one owner; it becomes
  a limit if multi-user collaboration is ever added. That known limit is registered as DEBT-DB-001.
- Backups are copying one file.
