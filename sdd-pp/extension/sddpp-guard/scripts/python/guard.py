#!/usr/bin/env python3
"""SDD.PP guard: while the active slice is in the GREEN phase, test files are read-only.

Runs as a Claude Code PreToolUse hook (registered by Spec Kit from extension.yml).
Exit 0 allows the tool call. Exit 2 blocks it and feeds stderr back to the model.

Standard library only, on purpose: it must run anywhere the agent runs.

This is a guard rail, not a security boundary. It stops an agent that cooperates; it does not stop
one that looks for a way around (see docs/spike-findings.md). CI is the real check.
"""
import json
import re
import sys
from pathlib import Path

FILE_TOOLS = {"Edit", "Write", "MultiEdit", "NotebookEdit"}

TEST_PATH = re.compile(
    r"(^|/)(tests?|__tests__|spec)/"  # tests/, test/, __tests__/, spec/
    r"|[._-](test|spec)\.[a-z0-9]+$"  # name.test.ts, name_spec.rb
    r"|(^|/)test_[^/]+$",  # test_name.py
    re.IGNORECASE,
)

# A shell command is suspicious when it names a test path AND does something that writes.
WRITES = re.compile(
    r"(>>?|\btee\b|\bsed\s+-i|\bperl\s+-i|\bmv\b|\bcp\b|\brm\b|\btruncate\b"
    r"|git\s+(checkout|restore|stash|apply)|open\([^)]*['\"][wa])",
    re.IGNORECASE,
)


def read_phase(root: Path):
    """Return (phase, problem). `problem` is set when the state file exists but cannot be trusted."""
    state = root / ".sddpp" / "active.json"
    try:
        raw = state.read_text(encoding="utf-8")
    except FileNotFoundError:
        return None, None
    except OSError as exc:
        return None, f"cannot read .sddpp/active.json ({exc})"
    try:
        data = json.loads(raw)
    except ValueError:
        return None, ".sddpp/active.json is not valid JSON"
    if not isinstance(data, dict):
        return None, ".sddpp/active.json is not an object"
    return data.get("phase"), None


def decide(payload, root: Path):
    """Return (exit_code, message) for one PreToolUse payload."""
    phase, problem = read_phase(root)
    if problem is None and phase != "green":
        return 0, ""
    # Either the slice is in GREEN, or the state file is broken: fail closed for test files.
    prefix = f"{problem}, so test files are locked. " if problem else ""
    if not isinstance(payload, dict):
        return 2, f"SDD.PP guard: {prefix}unreadable hook payload while the test lock is active."

    tool = payload.get("tool_name", "")
    args = payload.get("tool_input") or {}
    if tool in FILE_TOOLS:
        target = str(args.get("file_path") or args.get("notebook_path") or "")
        if TEST_PATH.search(target.replace("\\", "/")):
            return 2, (
                f"SDD.PP guard: {prefix}{target} is a test file and the slice is in the GREEN phase. "
                "Tests are locked: change production code, or ask the human to reopen the RED phase."
            )
    elif tool == "Bash":
        command = str(args.get("command", ""))
        if TEST_PATH.search(command) and WRITES.search(command):
            return 2, f"SDD.PP guard: {prefix}this command appears to modify test files while the slice is in the GREEN phase."
    return 0, ""


def main() -> None:
    root = Path.cwd()
    phase, problem = read_phase(root)
    if problem is None and phase != "green":
        sys.exit(0)  # no lock: do not even parse the payload
    try:
        payload = json.load(sys.stdin)
    except (ValueError, OSError):
        payload = None
    code, message = decide(payload, root)
    if message:
        sys.stderr.write(message + "\n")
    sys.exit(code)


if __name__ == "__main__":
    main()
