---
id: ADR-0001
title: Use TypeScript on Node.js with Next.js as one project
status: accepted
date: 2026-10-25
drivers: [CON-001, CAP-002]
evidence: [EV-001, EV-002]
---

## Context

The app is one page for one person, and it must start with one command on the owner's own computer (CON-001). The
page shows a list read from the server on every load (CAP-002) and the forms change data on the server, so page code
and server code are both needed.

## Decision

Use TypeScript on Node.js (the 24 LTS line) with Next.js (App Router) and React, so the page and the server code
live in one project and one process.

## Rejected alternatives

- **Python with Flask.** Rejected: it brings a second ecosystem for no gain on an app whose work is the user
  interface.
- **A Vite single-page app plus a separate API.** Rejected: two processes to start for a one-page app.

## Consequences

- One language end to end and one process to start.
- The list must be rendered per request and never frozen at build time; the framework's caching rules are a known
  trap (see the risks in `architecture.md`).
- Next.js is a heavy tool for a four-control app. It is flagged for the owner in ADD-005; cutting it would be a
  redesign of the interface and logic layers.
- The decision would be reversed if the owner already runs Python tooling and wants to reuse it.
- Pinned versions: EV-001 and EV-002.
