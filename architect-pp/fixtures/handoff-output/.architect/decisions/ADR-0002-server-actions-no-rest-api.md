---
id: ADR-0002
title: Use server actions and expose no REST API
status: accepted
date: 2026-10-25
drivers: [CAP-001, CAP-003, CAP-004, CON-001]
---

## Context

The page adds, completes and deletes tasks. A single user on a single machine has no other client that needs the data.

## Decision

The page changes tasks through three server actions (add, toggle, delete). There is no REST API for the owner's
data and no client-side data fetching. The only HTTP route is a health check.

## Rejected alternatives

- **REST endpoints with client-side fetching.** Rejected: more moving parts and a client data layer for no benefit
  with one page and one user.

## Consequences

- No client data layer, cache or global store; all state is server state.
- A mobile or third-party client would have nothing to call. The blueprint would reverse this decision if such a
  client needs the data.
