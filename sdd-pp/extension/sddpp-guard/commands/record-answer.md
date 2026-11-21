---
description: "Runtime event handler: remember the question-panel answers that name a ppc command, and which skills and MCP servers were used"
scripts:
  py: scripts/python/record_answer.py
---

# SDD.PP answer recorder

This is a runtime event, not a prompt: only the `scripts` entry above runs. It reads the agent's PostToolUse payload on stdin and, when
a person answered the question panel by choosing an option whose label ends with ` — <ppc command>`, appends that answer to
`.sddpp/answers.jsonl`. The guard lets an approval through only with such an answer. It also notes, by name only, each skill and MCP server the agent
used and the slice in progress (`.sddpp/uses.jsonl`, never in git), which `ppc finish` reads to say whether the tool a person chose was used. It prints nothing and never fails.
