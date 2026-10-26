# Which Spec Kit skills does this flow still use? (checked before removing them)

`specify init` installs about a dozen skills. The flow of pp-suite plans the slices from the design (`/speckit-sddpp-cycle-slices`),
builds them with `-build` and keeps its rules in `CLAUDE.md`. Before `ppc init` was made to remove the Spec Kit skills that are
left, each one was read and, where it could be, run (2026-10-26, Spec Kit at the pinned commit, Claude Code 2.1.310).

**Method.** Read each skill and list the files it needs. Then run it in a project that has what this flow produces (the design in
`.architect/`, five slices, the rules block in `CLAUDE.md`) and none of `spec.md`, `plan.md` or `tasks.md`, with read-only tools so
nothing could be written. About 0.14 USD each.

| Skill | What it needs | What happened when run here | Verdict |
|---|---|---|---|
| `speckit-specify`, `speckit-plan` | They produce `spec.md` and `plan.md` | Not run. They are what `/speckit-sddpp-cycle-slices` replaces, because the design already exists | removed |
| `speckit-analyze` | `spec.md`, `plan.md`, `tasks.md` | "Feature directory not found"; wrote nothing; redirected to `ppc next` | removed. `ppc validate` and `ppc check-git` do this check |
| `speckit-clarify` | `spec.md` | Same failure; redirected | removed. The Architect's interview and the slices skill ask the questions |
| `speckit-checklist` | `spec.md`, `plan.md`, `tasks.md` | Same failure | removed |
| `speckit-converge` | `spec.md`, `plan.md`, `tasks.md` (appends to `tasks.md`) | Same failure | removed. Its idea (compare what is built with what was planned) is `ppc overview` plus `ppc check-git` |
| `speckit-implement` | `tasks.md`; runs all of it | Same failure | removed. It would build everything at once, outside the slices and the guard, if a `tasks.md` ever existed |
| `speckit-tasks` | `plan.md`, `spec.md`, research files | **Not run** (the copy available here was an older, preset-wrapped one). Read only: it organizes work by user story after a blocking foundation phase, which is what slicing replaces | removed on that reading |
| `speckit-taskstoissues` | `tasks.md`; GitHub | **Not run.** Read only: marked deprecated by its own description | removed on that reading |
| `speckit-constitution` | Nothing: it would run | It was stopped only by the read-only tools. It writes `.specify/memory/constitution.md`, which nothing in this flow reads, and could leave a second, different set of rules next to the block in `CLAUDE.md` | removed: the one that conflicts |

**What the runs show.** Five skills cannot run in a project made by this flow, and they fail safely: they write nothing and,
because of the rules in `CLAUDE.md`, they point back to `ppc next`. So leaving them would not have been dangerous; it would have
cost about 0.14 USD and several turns each time someone or the agent tried one, and added their descriptions to the skills the
agent sees. `constitution` is the only one that works and would compete with the generated rules.

**Limits.** One run each, one model. Two skills judged by reading. The ideas inside `clarify`, `analyze` and `converge` could be
worth rebuilding for slices later; what is removed is the Spec Kit versions, which assume a different set of files.

`ppc init` removes these from the project only (the change shows in git, since `init` requires a clean tree). Spec Kit itself is not touched.
