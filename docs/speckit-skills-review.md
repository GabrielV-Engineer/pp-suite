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
| `speckit-analyze` | `spec.md`, `plan.md`, `tasks.md` | "Feature directory not found"; wrote nothing; redirected to `ppc next` | **replaced** by `/speckit-sddpp-cycle-analyze` (see below) |
| `speckit-clarify` | `spec.md` | Same failure; redirected | **replaced** by `/speckit-sddpp-cycle-clarify` |
| `speckit-checklist` | `spec.md`, `plan.md`, `tasks.md` | Same failure | removed |
| `speckit-converge` | `spec.md`, `plan.md`, `tasks.md` (appends to `tasks.md`) | Same failure | **replaced** by `/speckit-sddpp-cycle-converge` |
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

## The three that were replaced instead of dropped (2026-10-26)

Their ideas are worth having, so each was rewritten for this flow (`sdd-pp/extension/sddpp-cycle/commands/`). Spec Kit's originals
are still removed from the project, because they cannot run and would carry the same names.

| Skill | What it does here | Tried on |
|---|---|---|
| `/speckit-sddpp-cycle-clarify [SL-NNN or design]` | Finds what a planned slice or the design leaves unclear; asks up to 5 questions, one at a time with a recommended answer. Answers go where the owner allows: into a **planned** slice, or into a **change request** if the gap is in the design (`.architect/` is never edited) | A planned slice of a real design: a coverage map, one question, and after the answer a 2-line edit to that slice. It named a design gap and left it for a change request. 11 + 5 turns, 0.45 USD |
| `/speckit-sddpp-cycle-analyze` | **Read-only.** Reads the design, the slices and the rules for meaning: contradictions with non-goals or decisions, vague criteria, criteria that do not verify the capability, out-of-scope lines that do not hold, drift in names, size risk, kept additions. Starts from `ppc validate` and does not repeat it | Five slices and a design that `ppc validate` passed with 0 errors and 0 warnings: 15 findings (0 critical, 3 high). One was a real contradiction (a quality target about every added task still being listed, against a capability that deletes tasks). 21 turns, 0.39 USD |
| `/speckit-sddpp-cycle-converge [SL-NNN]` | **Read-only.** Compares the commits of a slice with what it promised: `missing`, `partial`, `contradicts`, `unrequested`, each with file:line. Starts from `ppc check-git` and does not repeat it | A finished slice of the demo project: 3 findings, 2 of them `unrequested` and checked by hand afterwards: a `CHECK` constraint on title length in the slice's migration, although the slice's own Out of scope sends title validation to a later slice, and a stray whitespace change. 16 turns, 0.30 USD |

**Limits.** A model's judgment, not a rule: it can be wrong or miss things, and each run costs 0.2 to 0.4 USD. One run each, one model,
one design. Nothing here shows they improve the result of a project; they show that they run, stay inside their permissions and
find things the rules cannot. Whether `unrequested` is the right call for a defensive constraint is a person's decision, which
is why converge only reports.
