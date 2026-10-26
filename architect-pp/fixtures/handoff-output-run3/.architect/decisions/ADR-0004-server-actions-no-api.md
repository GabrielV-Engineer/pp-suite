---
id: ADR-0004
title: Use server actions and expose no HTTP API for task data
status: accepted
date: 2026-10-25
drivers: [CAP-001, CAP-003, CAP-004]
---

## Context

The only client is the app's own page. Adding, completing and deleting a task are form submissions
(CAP-001, CAP-003, CAP-004).

## Decision

The page calls the server through Next.js server actions. There are no REST endpoints for the owner's data and no
client-side data fetching. The only route handler is a health check.

## Rejected alternatives

- **REST endpoints plus client fetching.** Rejected: more moving parts, and it needs a client data layer.

## Consequences

- Fewer moving parts and no client data layer; the only client state is the add form's result.
- No HTTP API exists, so a mobile app or a third-party client could not use the data without new work.
- The decision would be reversed if a mobile or third-party client needs the data.
- It depends on the framework choice (ADR-0001, ADD-005).
