---
id: ADR-0003
title: Listen only on 127.0.0.1 and have no authentication
status: accepted
date: 2026-10-25
drivers: [CON-002, QA-001]
---

## Context

Exactly one person uses the app, on their own computer (CON-002). With no login, anyone who can reach the server
can use it, so what can reach the server is the whole access boundary (QA-001).

## Decision

The server listens only on `127.0.0.1`, and the dev and start commands always say so. There are no accounts,
sessions or roles, and the task table has no `user_id` column. A script checks that the built server answers on
loopback and has no listener on a wildcard address.

## Rejected alternatives

- **Authentication plus a per-user column "just in case".** Rejected: there is one user and the server is
  loopback-only; adding it now means a schema, a test surface and no value.

## Consequences

- Any process or user on the same computer can open `http://127.0.0.1:3000`; that is the accepted trust boundary.
- Removing the loopback flag from the dev or start command would expose the app to the network with no login.
- Adding auth later is a small, known change when hosting is added: a `user_id` column, an auth layer, a hosted
  database and a host (a new blueprint).
- The decision would be reversed if any second person or device needs access.
