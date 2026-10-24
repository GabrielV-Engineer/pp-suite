# SDD.PP

The build side of pp-suite: spec-driven development in thin vertical slices, test-first, with a human
approving at the key points. It is a set of **Spec Kit** add-ons, not a fork.

## What is here

| Piece | Path | Status |
|---|---|---|
| Test-lock guard (extension) | `extension/sddpp-guard/` | Unit-tested (16 tests). Registered into Claude Code through Spec Kit and honored in a manual spike. |
| Slices preset | `preset/sddpp-slices/` | Template override and command wrap verified by hand. Not run end to end. |
| Cycle commands (`red`, `green`, `audit`, `debt`) | — | planned |
| Workflow with approval gates | — | planned |

## The guard

While `.sddpp/active.json` says `"phase": "green"`, Claude Code cannot edit test files through its file
tools, and obvious shell writes to test paths are blocked too. If the state file is unreadable, test files
stay locked.

It is a **guard rail**, not a security boundary: writing through an interpreter or building a path from
pieces is not recognised. The real check is a git-based test in CI (planned). Details and the exact
limitations: [spike findings](../docs/spike-findings.md).

```bash
python3 -m unittest discover -s extension/sddpp-guard/tests -v
```

## Installing the pieces into a Spec Kit project (manual, for now)

```bash
specify extension add /path/to/pp-suite/sdd-pp/extension/sddpp-guard --dev
specify preset add --dev /path/to/pp-suite/sdd-pp/preset/sddpp-slices
```

Tested against Spec Kit at commit `67e0f72` (`1.2.4.dev0`). Pin the version you use. Read the guard
script before installing it: extensions run code on your machine.
