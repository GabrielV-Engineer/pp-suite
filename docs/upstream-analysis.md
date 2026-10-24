# Upstream analysis: extend, do not rebuild

Why pp-suite is a thin layer over existing tools instead of new frameworks. Figures are as of
2026-10-24 and come from reading the repositories, not from running every feature.

| Project | Version | Stars | License | Role in pp-suite |
|---|---|---|---|---|
| [The Architect](https://github.com/Hainrixz/the-architect) | 2.6.0 | 562 | MIT | Design phase (interview, blueprint). Read, **not run**. |
| [Spec Kit](https://github.com/github/spec-kit) | 1.2.3 | 142,707 | MIT | Base for SDD.PP. Installed and partly exercised (see `spike-findings.md`). |
| [OpenSpec](https://github.com/Fission-AI/OpenSpec) | 1.15.0 | 72,899 | MIT | Read only. Ideas borrowed, not used as a base. |

## What none of them has

Searched the three repositories for each topic (mentions outside the changelog):

| Topic | The Architect | Spec Kit | OpenSpec |
|---|---|---|---|
| Vertical slices as the unit of work | 2 (a heuristic) | 0 | 0 |
| Technical-debt register | 0 | 0 (real) | 0 |
| Mutation testing | 0 | 0 | 0 |
| Architecture tests / fitness functions | 0 | 0 | 0 |
| TDD enforced by default | 1 | optional | not built in (only an example schema name) |

This is what pp-suite adds. Everything else is inherited.

## Why Spec Kit as the base for SDD.PP

- Extensions can register native agent events, including Claude Code's `PreToolUse` (verified).
- Presets replace templates and wrap commands without forking (verified).
- Workflows have approval gates (`type: gate`) between phases (read, not executed).
- Tasks are already grouped by user story, the closest built-in notion to a slice.
- The cost: it is heavy (many artifacts per feature), multi-agent (more than 40 integrations) and
  moves fast (a release two days before this analysis), so versions must be pinned. Its `lean` preset
  and our own preset mitigate the weight.

OpenSpec is lighter and stronger on living specs (capabilities and deltas). It has no hooks (no
`PreToolUse` anywhere in the repository) and I did not find an approval-gate step. Mixing two spec
frameworks in one project would give the same lifecycle two owners, so we borrow its ideas instead.

## Why Architect.PP is a layer over The Architect

The Architect already covers a guided interview, live version verification, brownfield mode, EARS
acceptance criteria and a resumable task graph. Its task-splitting rule is by layer ("schema + API + UI
→ data layer → server layer → interface") and it targets an autonomous builder, both the opposite of
SDD.PP. So we use its **blueprint**, ignore its task graph, and add what is missing: quality attributes
with numbers, a complexity budget, architecture rules as tests, and the hand-off to the contract.

## Caveats

- Third-party code runs on your machine when installed. Read each extension and skill first; community
  catalogs are not vetted.
- All three projects change fast. Pin versions in `install/` once it exists.
