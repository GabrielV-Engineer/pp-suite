---
description: "Runtime event handler: at the start of a session, tell the agent whose turn it is in this project"
scripts:
  py: scripts/python/session.py
---

# SDD.PP session start

This is a runtime event, not a prompt: only the `scripts` entry above runs. At the start of a session (and after `/clear`, a resume
or a compaction) it prints the output of `ppc session`, which Claude Code adds to the conversation: the project, its design
revision, and what `ppc next` says (whose turn it is and the exact command). Outside a pp-suite project, or when `ppc` is not
installed, it prints nothing and does not fail.
