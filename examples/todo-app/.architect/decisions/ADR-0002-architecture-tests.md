---
id: ADR-0002
title: Enforce component boundaries with architecture tests
status: proposed
date: 2026-10-24
drivers: [QA-002]
---

## Context

QA-002 asks for zero cross-component dependency violations. A rule written only in prose is
forgotten by people and by AI agents alike.

## Decision

Turn the boundary rules in `architecture.md` into automated tests that run in CI, using whichever
dependency-checking tool fits the chosen language.

## Rejected alternatives

- **Convention plus code review only.** Rejected: it relies on every reviewer noticing, every time.
- **Strict module visibility in the language alone.** Rejected as the only mechanism: it does not
  cover the HTTP boundary between frontend and backend.

## Consequences

- One more check in CI, and a small amount of test code to maintain.
- A violation fails the build instead of surfacing months later.
