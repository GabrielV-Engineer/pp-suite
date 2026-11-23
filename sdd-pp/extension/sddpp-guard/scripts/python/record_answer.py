#!/usr/bin/env python3
"""SDD.PP answer recorder: when a person answers the question panel, remember the answers that name a `ppc` command.

Runs as a Claude Code PostToolUse hook (registered by Spec Kit from extension.yml); the matcher is every tool, so it returns at once
for anything but the panel, a skill or an MCP tool (the last two are noted by `record_use`, into `.sddpp/uses.jsonl`). It never fails and prints nothing: a missing record only means the guard asks the person again.
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
    offered = _offered(payload.get("tool_input"))
    for index, (question, chosen) in enumerate(answers.items()):
        for label in chosen if isinstance(chosen, list) else [chosen]:
            command = ledger.command_of(label)
            base = {"id": f"{payload.get('tool_use_id') or 'unknown'}#{index}", "at": time.time(), "session_id": payload.get("session_id"),
                    "tool_use_id": payload.get("tool_use_id"), "question": question}
            if command:
                ledger.append(root, {**base, "label": label, "command": command})
                continue
            # An answer that carries out nothing ("not yet", or the person's own words) is noted with no command, so the guard never
            # matches it and `ppc asked` can count it. Their own words are never kept: only that they were their own.
            options = offered.get(question)
            if options is None:
                ledger.append(root, {**base, "kind": "unknown"})
            elif label in options:
                ledger.append(root, {**base, "kind": "option", "label": label})
            else:
                ledger.append(root, {**base, "kind": "own-words"})


def _offered(tool_input):
    """The option labels each question offered, by question text; a question whose options are not in the payload is left out."""
    out = {}
    questions = tool_input.get("questions") if isinstance(tool_input, dict) else None
    for q in questions if isinstance(questions, list) else []:
        if isinstance(q, dict) and isinstance(q.get("question"), str) and isinstance(q.get("options"), list):
            out[q["question"]] = {o.get("label") for o in q["options"] if isinstance(o, dict)}
    return out


def record_use(payload, root: Path):
    """Note that a skill or an MCP server was used, and in which slice: names only, never what the tool was given or answered.

    A skill arrives as the `Skill` tool with `tool_input.skill` (a plugin's skill as `plugin:skill`); an MCP tool as `mcp__<server>__<tool>`
    with an `mcp_server` field (seen on 2026-11-21, docs/tools.md). `ppc finish` reads this to say whether the tool a person chose for a role
    was used; the guard keeps the file the recorder's.
    """
    if not isinstance(payload, dict):
        return
    tool = payload.get("tool_name")
    if tool == "Skill":
        kind, name = "skill", (payload.get("tool_input") or {}).get("skill") if isinstance(payload.get("tool_input"), dict) else None
    elif isinstance(tool, str) and tool.startswith("mcp__"):
        server = payload.get("mcp_server")
        named = server.get("name") if isinstance(server, dict) else None
        kind, name = "mcp", named if isinstance(named, str) and named else tool[len("mcp__"):].split("__", 1)[0]
    else:
        return
    if not isinstance(name, str) or not name:
        return
    ledger.append_use(root, {"at": time.time(), "session_id": payload.get("session_id"), "tool_use_id": payload.get("tool_use_id"),
                             "slice": ledger.active_slice(root), "kind": kind, "name": name})


def main() -> None:
    try:
        payload = json.load(sys.stdin)
        root = ledger.project_root(payload)
    except Exception:  # a hook that fails must not stop the session
        sys.exit(0)
    for write in (record, record_use):  # one failing does not stop the other
        try:
            write(payload, root)
        except Exception:
            pass
    sys.exit(0)


if __name__ == "__main__":
    main()
