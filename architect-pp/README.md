# Architect.PP

*The **P**ragmatic and o**P**timized **Architect**: the design side of [pp-suite](../README.md).*

**Status: built as a Spec Kit extension (`architect-pp`), tried on one real blueprint three times.** Installed by
`ppc init`, which turns its two commands into Claude Code skills.

The design side of pp-suite. A thin layer over [The Architect](https://github.com/Hainrixz/the-architect), which does
the interview, live version checks and the blueprint. Architect.PP does not redo that. It adds, after it:

| Piece | What it does | Status |
|---|---|---|
| `/speckit-architect-pp-handoff <blueprint.md>` | A model converts The Architect's blueprint into the design files of the [contract](../docs/contract-v0.1.md) (`.architect/`), drops its step-by-step build plan, and lists in `additions.yaml` what the person never asked for | Tried 3 times, see [fixtures](fixtures/README.md) |
| `ppc validate --design` | Rules that judge the design on its own: circles, wrong-way dependencies, complexity budget, no priorities, undecided additions | Tested, each rule broken on purpose |
| `ppc decide-addition` | A person keeps or cuts each addition, with overlapping ones decided together | Tested; decisions in the fixtures are not human |
| `/speckit-architect-pp-apply-change CR-NNNN` | A model revises the design for a change request a person accepted, raises the revision, and stops rather than guess when the proposal is vague | Tried once, on the demo project |
| `ppc constitution` | Writes the project rules from the design into a block of `CLAUDE.md` (a script, not a model) | Tested |
| `/speckit-architect-pp-apply-cuts` | A model carries out the cuts in the design and reports leftovers | Tried twice |

What Architect.PP does **not** do: slice the work (SDD.PP owns the plan), and judge whether The Architect's interview
guided the person well. That has not been evaluated here.

Not built: architecture rules turned into tests, and a command to mark stale slices as re-read after a design change.

Files: `extension/` is what `ppc init` installs (the manifest and the two commands); `fixtures/` is a real blueprint and
the outputs of the runs on it, and is not installed.
