#!/usr/bin/env python3
"""SDD.PP answer recorder: when a person answers the question panel, remember the answers that name a `ppc` command.

Runs as a Claude Code PostToolUse hook (registered by Spec Kit from extension.yml); the matcher is every tool, so it returns at once
for anything but the panel. It never fails and prints nothing: a missing record only means the guard asks the person again.
Standard library only.
"""
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))  # also under `python -I`, which leaves the script's folder out
import ledger  # noqa: E402


def record(payload, root: Path):
    if not isinstance(payload, dict) or payload.get("tool_name") != "AskUserQuestion":
        return
    response = payload.get("tool_response")
    answers = response.get("answers") if isinstance(response, dict) else None
    if not isinstance(answers, dict):
        return
    for index, (question, chosen) in enumerate(answers.items()):
        for label in chosen if isinstance(chosen, list) else [chosen]:
            command = ledger.command_of(label)
            if command:
                ledger.append(root, {
                    "id": f"{payload.get('tool_use_id') or 'unknown'}#{index}", "at": time.time(), "session_id": payload.get("session_id"),
                    "tool_use_id": payload.get("tool_use_id"), "question": question, "label": label, "command": command,
                })


def main() -> None:
    try:
        payload = json.load(sys.stdin)
        record(payload, ledger.project_root(payload))
    except Exception:  # a hook that fails must not stop the session
        pass
    sys.exit(0)


if __name__ == "__main__":
    main()
