---
id: ADR-0001
title: Use TypeScript on Node.js with Next.js
status: accepted
date: 2026-10-25
drivers: [CON-001, CAP-002]
evidence: [EV-001, EV-002]
---

## Context

The app is one page for one person and must start with one command on the owner's computer (CON-001). The
list must show current data on every request (CAP-002), so page and server code have to work together.

## Decision

Use TypeScript on the Node.js 24 LTS line, with Next.js (App Router) and React. Page and server code live in
one project and one process. Styling is Tailwind CSS with CSS custom-property tokens, using native HTML elements
and no component library.

## Rejected alternatives

- **Python with Flask.** Rejected: a second ecosystem for no gain on a UI-first app. One language end to end
  is simpler.
- **A Vite single-page app plus a separate API.** Rejected: two processes to start for a one-page app.
- **CSS-in-JS.** Rejected: runtime cost and friction with server rendering.
- **A component library (shadcn/ui, Radix).** Rejected: the app needs a text input and three buttons; a library
  adds dependencies and an init step for four controls, and native elements are accessible for free.

## Consequences

- One process serves the page and runs the server code, so the component boundaries are enforced by rules, not
  by deployment units (see architecture.md).
- The page must be rendered per request, because the framework would otherwise prerender it at build time.
- The blueprint would reverse the language choice if the owner already runs Python tooling and wants to reuse it.
- The framework is a heavy tool for a one-table app; it was chosen for the single-process benefit above.
- Versions and the date they were checked are in EV-001 and EV-002.
