---
description: "Runtime event handler: remember the question-panel answers that name a ppc command"
scripts:
  py: scripts/python/record_answer.py
---

# SDD.PP answer recorder

This is a runtime event, not a prompt: only the `scripts` entry above runs. It reads the agent's PostToolUse payload on stdin and, when
a person answered the question panel by choosing an option whose label ends with ` — <ppc command>`, appends that answer to
`.sddpp/answers.jsonl`. The guard lets an approval through only with such an answer. It prints nothing and never fails.
