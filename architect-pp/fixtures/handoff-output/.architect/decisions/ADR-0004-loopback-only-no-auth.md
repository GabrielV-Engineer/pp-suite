---
id: ADR-0004
title: Listen on 127.0.0.1 only, with no authentication and no user_id
status: accepted
date: 2026-10-25
drivers: [QA-001, CON-001, CON-002]
---

## Context

Only one person uses the app, on their own computer. Accounts would add a schema, a test surface and no value
for that person.

## Decision

The server listens only on `127.0.0.1`, in development and in production, and this is checked when the server
starts. There are no accounts, sessions or roles, and the task table has no `user_id` column.

## Rejected alternatives

- **Authentication plus a per-user column "just in case".** Rejected: single user and loopback-only access;
  retrofitting later is a small, known change when hosting is added.

## Consequences

- Anyone able to open `http://127.0.0.1:3000` on the same computer can use the app. This is the accepted
  residual risk (CON-002).
- Removing the loopback binding from the start commands exposes the data to the local network with no login;
  the start-up check exists to catch this (QA-001).
- Any second person or device needing access calls for a new design: authentication, a `user_id` column and a host.
