---
description: "Runtime event handler: lock test files during the green phase"
scripts:
  py: scripts/python/guard.py
---

# SDD.PP guard

This is a runtime event, not a prompt: only the `scripts` entry above runs. It reads the agent's
PreToolUse payload on stdin and exits 2, with a reason on stderr, to block the tool call.

The lock is active while `.sddpp/active.json` reports `"phase": "green"` or `"refactor"`. If that file
exists but cannot be read, test files stay locked. Independently of the phase, a shell command that runs
`ppc approve-*` is blocked: approvals are human-only.
