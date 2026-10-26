---
description: "PROMPTS: prepare the system, negative and design prompts for the next task of a slice, from the project's design"
---

## User input

```text
$ARGUMENTS
```

Optional: a slice id and a task, for example `SL-004 build`. Empty means the next task that `ppc next` names.

## What this step is

Each task already has its instructions in its own skill (`build`, `red`, `green`, `refactor`, `audit`). What a task does not
have is **the limits of this slice**, which come from the design: what the slice leaves out of scope, the project's
non-goals, the component boundaries, the size budget, and the decisions that belong to people. This step writes those
as files. They are produced by a script (`ppc prompt`) from the same design that fills the rules in `CLAUDE.md`, so they
are the same every time and cannot contradict the skills: they never restate how to do the task.

## Rules

- You do not write the prompts yourself. `ppc prompt` does; you only run it and say what it wrote.
- Never overwrite files the person may have edited. If `ppc prompt` refuses because they exist, ask whether to keep them
  or regenerate with `--force`. Use `--force` only if they say yes.
- Offer; do not insist. They are for the person to use as they are, edit, or ignore.

## Steps

1. If no slice and task were given, run `ppc next` and take the slice and the task it names as next. If it names a
   person's step (an approval, a decision), say so and offer the prompts for the task after it.
2. Run `ppc prompt <slice> --task <task> .`. It writes `.sddpp/prompts/<slice>/<task>.system.md`, `.negative.md` and, only
   when the slice touches an interface, builds the skeleton or is bound by a decision, `.design.md`.
3. Tell the person which files were written and what each is for, in one line each. Remind them that the how-to of the
   task is in its skill and the prompts hold only this slice's limits.
