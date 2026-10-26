# Fixture: a blueprint produced by The Architect from a vague idea

`personal-task-tracker-blueprint.md` is the unedited output of The Architect (upstream, MIT, commit `cfa739a`, run
in its clone mode with `claude -p`, one turn at a time) for the idea "I want an app to keep track of my tasks".
It is the raw material for building and testing the hand-off to the contract. It is third-party generated content
and is not part of pp-suite's own design.

## How it was produced (2026-10-25)

The interview was conducted by me, playing a person with no technical knowledge. The answers, in full:

1. "I want an app to keep track of my tasks."
2. "It is a new project from zero. It is just for me, nobody else. I just want a prototype that works, to try the idea."
3. "Mostly on my computer. No offline mode and no reminders. I do not know anything about technology, so you choose
   the defaults. I only want to add tasks, see them in a list, and mark them as done. Maybe delete them too. Nothing
   fancy."
4. "Yes." (to the shape)
5. "Only on my computer."
6. "Yes." (to the plan and to four assumed defaults)

Six turns, about 5.5 USD in total (the generation alone 3.7 USD, 75 model turns).

## What the person asked for, and what the blueprint contains

The person named four things: add, list, mark done, maybe delete. The blueprint's v1 goals also include:

- delete as a **soft delete** (a `deleted_at` column), which the person did not ask for;
- **light and dark appearance** that follows the system, which the person did not ask for;
- a full **design system** with a contrast-checked palette, an accessibility section, an observability and cost
  section, a model-routing section and an agent-workspace section;
- Biome, Vitest and Playwright (a lint, an integration test and an end-to-end test) for a task list.

It is 1,975 lines for a four-feature list. Its non-goals table is explicit and well argued, which is the part the
design linter cannot improve. The size and the additions are the part a complexity budget exists to question.

Notable: the blueprint says it was **not smoke-tested**: the generating session could not run `pnpm`, `npx` or
`node` because each needed an approval nobody could give. That is stated honestly in its first lines.

## Limits of this fixture

One run, one persona (mine), one idea. The persona accepted every proposal; a person who pushed back would have
steered the result (in an earlier run, pushing back removed most of the additions).
