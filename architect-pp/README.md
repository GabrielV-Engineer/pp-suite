# Architect.PP

**Status: planned. Nothing is implemented here yet.**

The design side of pp-suite. It will be a thin layer over
[The Architect](https://github.com/Hainrixz/the-architect), which already provides the interview, live
version verification, brownfield mode and the blueprint. Architect.PP adds what that project does not
have (see [upstream-analysis](../docs/upstream-analysis.md)):

- Quality attributes with numbers, so the design has measurable criteria.
- A complexity budget: the simplest thing that meets each attribute, nothing without a requirement.
- Architecture rules turned into tests.
- The hand-off: the blueprint converted into `.architect/` as defined by the
  [contract](../docs/contract-v0.1.md).

Before building any of it, The Architect must be **run** on a real idea. So far it has only been read.
