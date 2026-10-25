#!/usr/bin/env python3
"""SDD.PP guard: while the active slice is in the GREEN or REFACTOR phase, test files are read-only,
and approvals and exceptions can only be given by a human.

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

# Tests are locked in both phases, so refactoring cannot be used to weaken them.
LOCKED_PHASES = {"green", "refactor"}

# `ppc approve-red`, `node .../ppc.mjs approve-slice`, ...: the human gate, never the agent's to pass.
APPROVAL = re.compile(
    r"\bppc(\.mjs)?\s+approve"
    # `ppc finish ... --budget-reason ...` records an exception to a rule: that is a decision too
    r"|\bppc(\.mjs)?\s+finish\b[^\n]*--(budget|mutation)-reason",
    re.IGNORECASE,
)

# Fields that record a human decision. An agent never writes them: a person does, or `ppc` on a person's behalf.
DECISION_FIELD = re.compile(r"(approved_by|red_approved_by|decided_by|accepted_reason|budget_override_reason|mutation_override_reason)[\"']?\s*:")
CONTRACT_DIR = re.compile(r"(^|/)\.sddpp/")

TEST_PATH = re.compile(
    r"(^|/)(tests?|__tests__|spec)/"  # tests/, test/, __tests__/, spec/
    r"|[._-](test|spec)\.[a-z0-9]+$"  # name.test.ts, name_spec.rb
    r"|(^|/)test_[^/]+$",  # test_name.py
    re.IGNORECASE,
)

# The same idea for a command line, where a path is surrounded by spaces, quotes, `=`, `;` or `&&` instead
# of standing alone at the end of a string.
COMMAND_TEST_PATH = re.compile(
    r"(^|[\s'\"=(/])(tests?|__tests__|spec)/"
    r"|[._-](test|spec)\.[a-z0-9]+(?=$|[\s'\"):;&|<>])"
    r"|(^|[\s'\"=(/])test_[^\s/'\"]+",
    re.IGNORECASE,
)

# A shell command is suspicious when it names a test path AND does something that writes.
WRITES = re.compile(
    r"(>>?|\btee\b|\bsed\s+-i|\bperl\s+-i|\bmv\b|\bcp\b|\brm\b|\btruncate\b"
    r"|git\s+(checkout|restore|stash|apply)|open\([^)]*['\"][wa]"
    # interpreters and utilities that write without redirection (only in command position or as API calls,
    # so that `npm install` or a commit message mentioning "rename" is not mistaken for a write)
    r"|(^|[;&|]\s*)(ln|install)\s|\bdd\s[^|;&]*\bof="
    r"|writeFile|appendFile|createWriteStream|unlinkSync|\.unlink\(|rmSync|renameSync|\.write_text|\.write_bytes"
    r"|shutil\.(copy|move))",
    re.IGNORECASE,
)

# What `npm test` runs is part of the proof: changing it makes tests pass without touching a test file.
PACKAGE_JSON = re.compile(r"(^|/)package\.json$")
TEST_SCRIPT = re.compile(r"[\"']test[\"']\s*:")
NPM_TEST_SCRIPT = re.compile(r"\bnpm\s+(pkg\s+(set|delete)\s+scripts\.test|set-script\s+test)", re.IGNORECASE)


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


def _changes_the_test_script(tool, args) -> bool:
    """True when a tool call is about to change the `test` script of a package.json."""
    if tool in FILE_TOOLS:
        target = str(args.get("file_path") or "").replace("\\", "/")
        if not PACKAGE_JSON.search(target):
            return False
        old = [str(args.get("old_string", ""))] + [str(e.get("old_string", "")) for e in args.get("edits") or [] if isinstance(e, dict)]
        return bool(TEST_SCRIPT.search(_written_text(args) + "\n" + "\n".join(old)))
    if tool == "Bash":
        command = str(args.get("command", ""))
        if NPM_TEST_SCRIPT.search(command):
            return True
        return bool("package.json" in command and WRITES.search(command) and re.search(r"\btest\b", command))
    return False


def _written_text(tool_input):
    """Everything a file tool is about to write."""
    parts = [str(tool_input.get(key, "")) for key in ("content", "new_string")]
    for edit in tool_input.get("edits") or []:
        if isinstance(edit, dict):
            parts.append(str(edit.get("new_string", "")))
    return "\n".join(parts)


def _decision_lines(text):
    return {line.strip() for line in text.splitlines() if DECISION_FIELD.search(line)}


def _adds_a_decision(args, root: Path, target: str) -> bool:
    """True when a file tool would write a decision line that is not already there.

    An edit often shows a decision line only as context (the `status` of a debt entry sits next to its
    `approved_by`); leaving an existing decision as it is does not record a new one.
    """
    pairs = [(str(e.get("old_string", "")), str(e.get("new_string", ""))) for e in args.get("edits") or [] if isinstance(e, dict)]
    if "old_string" in args or "new_string" in args:
        pairs.append((str(args.get("old_string", "")), str(args.get("new_string", ""))))
    if "content" in args:
        try:
            existing = (root / target).read_text(encoding="utf-8")
        except OSError:
            existing = ""
        pairs.append((existing, str(args["content"])))
    return any(_decision_lines(new) - _decision_lines(old) for old, new in pairs)


def _writes_a_decision(payload, root: Path) -> bool:
    tool = payload.get("tool_name", "")
    args = payload.get("tool_input") or {}
    if tool in FILE_TOOLS:
        target = str(args.get("file_path") or args.get("notebook_path") or "").replace("\\", "/")
        return bool(CONTRACT_DIR.search(target)) and _adds_a_decision(args, root, target)
    if tool == "Bash":
        command = str(args.get("command", ""))
        # In a command line the path follows a space, so look for the folder anywhere in it.
        return bool(".sddpp/" in command and DECISION_FIELD.search(command) and WRITES.search(command))
    return False


def decide(payload, root: Path):
    """Return (exit_code, message) for one PreToolUse payload."""
    # Approvals belong to a human, whatever the phase.
    if isinstance(payload, dict) and payload.get("tool_name") == "Bash":
        command = str((payload.get("tool_input") or {}).get("command", ""))
        if APPROVAL.search(command):
            return 2, (
                "SDD.PP guard: approvals are human-only. Ask the human to run this command themselves "
                "(in Claude Code, prefix it with `!`)."
            )

    # Decisions belong to a human too: no file tool or shell write may record one.
    if isinstance(payload, dict) and _writes_a_decision(payload, root):
        return 2, (
            "SDD.PP guard: approvals and exceptions are human decisions. Do not write approved_by, "
            "red_approved_by, decided_by, accepted_reason, budget_override_reason or mutation_override_reason; ask the human to "
            "record them (ppc approve-slice, ppc approve-red, or an edit by hand)."
        )

    phase, problem = read_phase(root)
    if problem is None and phase not in LOCKED_PHASES:
        return 0, ""
    # Either the slice is in a locked phase, or the state file is broken: fail closed for test files.
    where = f"the slice is in the {str(phase).upper()} phase" if problem is None else "the lock state is unknown"
    prefix = f"{problem}, so test files are locked. " if problem else ""
    if not isinstance(payload, dict):
        return 2, f"SDD.PP guard: {prefix}unreadable hook payload while the test lock is active."

    tool = payload.get("tool_name", "")
    args = payload.get("tool_input") or {}
    if _changes_the_test_script(tool, args):
        return 2, (
            f"SDD.PP guard: {prefix}this would change the `test` script in package.json while {where}. "
            "What the tests run is locked with the tests: ask the human to reopen the RED phase."
        )
    if tool in FILE_TOOLS:
        target = str(args.get("file_path") or args.get("notebook_path") or "")
        if TEST_PATH.search(target.replace("\\", "/")):
            return 2, (
                f"SDD.PP guard: {prefix}{target} is a test file and {where}. "
                "Tests are locked: change production code, or ask the human to reopen the RED phase."
            )
    elif tool == "Bash":
        command = str(args.get("command", ""))
        if COMMAND_TEST_PATH.search(command) and WRITES.search(command):
            return 2, f"SDD.PP guard: {prefix}this command appears to modify test files while {where}."
    return 0, ""


def main() -> None:
    try:
        payload = json.load(sys.stdin)
    except (ValueError, OSError):
        payload = None
    code, message = decide(payload, Path.cwd())
    if message:
        sys.stderr.write(message + "\n")
    sys.exit(code)


if __name__ == "__main__":
    main()
