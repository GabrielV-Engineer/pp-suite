"""The panel answers that count as a person deciding, kept in `.sddpp/answers.jsonl`.

`record_answer.py` (a PostToolUse hook) appends an entry when a person picks, in the question panel, an option whose label ends with
` — <ppc command>`. `guard.py` lets an approval command through only when it finds an unused, recent entry from the same session
with exactly that command, and marks it used. Standard library only, like the guard.

This is a guard rail, not a security boundary: it stops an agent that cooperates. The file is written by hooks only, and the guard
blocks the agent from writing it, but an agent that can edit `.claude/settings.json` could register a hook that writes it.
"""
import json
import os
import re
import shlex
import time
from pathlib import Path

LEDGER = Path(".sddpp") / "answers.jsonl"
SEP = " — "  # an em dash between spaces: what separates the words of a label from the command it stands for
TTL_SECONDS = 30 * 60  # an answer is good for half an hour, once


def project_root(payload=None) -> Path:
    """The project the hook belongs to: the one Claude Code names, else the session's directory, else where the hook runs."""
    named = os.environ.get("CLAUDE_PROJECT_DIR") or (payload.get("cwd") if isinstance(payload, dict) else None)
    return Path(named) if named else Path.cwd()


def _normalize(tokens):
    """`ppc` and its arguments, whatever started it (`node .../ppc.mjs`, `npx ppc`), without the name that git supplies."""
    for i, token in enumerate(tokens):
        if token == "ppc" or token.endswith("/ppc") or token.endswith("ppc.mjs"):
            rest, out, skip = tokens[i + 1:], ["ppc"], False
            for arg in rest:
                if skip:
                    skip = False
                elif arg == "--by":
                    skip = True
                elif not arg.startswith("--by="):
                    out.append(arg)
            return " ".join(out)
    return None


def invocations(command):
    """The `ppc` commands a shell command line would run, normalized; text that merely mentions one is not one."""
    found = []
    for segment in re.split(r"&&|\|\||[;|\n]", str(command)):
        try:
            tokens = shlex.split(segment)
        except ValueError:
            continue
        normalized = _normalize(tokens)
        if normalized:
            found.append(normalized)
    return found


def command_of(label):
    """The command an option label stands for (what follows its last ` — `), or None when it names no `ppc` command."""
    if not isinstance(label, str) or SEP not in label:
        return None
    try:
        return _normalize(shlex.split(label.rsplit(SEP, 1)[1]))
    except ValueError:
        return None


def append(root: Path, record: dict):
    file = root / LEDGER
    file.parent.mkdir(parents=True, exist_ok=True)
    with file.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(record, ensure_ascii=False) + "\n")


def _read(root: Path):
    """(entries, used ids). A line that is not what the recorder writes is ignored, so a garbled file lets nothing through."""
    entries, used = [], set()
    try:
        lines = (root / LEDGER).read_text(encoding="utf-8").splitlines()
    except OSError:
        return entries, used
    for line in lines:
        try:
            data = json.loads(line)
        except ValueError:
            continue
        if not isinstance(data, dict):
            continue
        if isinstance(data.get("consumed"), str):
            used.add(data["consumed"])
        elif all(isinstance(data.get(k), str) for k in ("id", "command")) and isinstance(data.get("at"), (int, float)):
            entries.append(data)
    return entries, used


def consume(root: Path, commands, session_id=None, by=None, now=None) -> bool:
    """Use one answer per command, all or none. True when every command had an unused, recent answer from this session."""
    now = time.time() if now is None else now
    entries, used = _read(root)
    chosen = []
    for command in commands:
        match = next((e for e in entries
                      if e["command"] == command and e["id"] not in used and e["id"] not in chosen
                      and 0 <= now - e["at"] <= TTL_SECONDS
                      and (not session_id or not e.get("session_id") or e["session_id"] == session_id)), None)
        if match is None:
            return False
        chosen.append(match["id"])
    for entry_id in chosen:
        append(root, {"consumed": entry_id, "by": by, "at": now})
    return True
