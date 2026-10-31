#!/usr/bin/env python3
"""SDD.PP guard: while the active slice is in the GREEN or REFACTOR phase, test files are read-only,
and approvals and exceptions can only be given by a human.

Runs as a Claude Code PreToolUse hook (registered by Spec Kit from extension.yml).
Exit 0 allows the tool call. Exit 2 blocks it and feeds stderr back to the model. For an approval, in the permission modes where
that was tested (ASKABLE_MODES), the hook answers "ask" instead: Claude Code shows the exact command to the person, who decides.

Standard library only, on purpose: it must run anywhere the agent runs.

This is a guard rail, not a security boundary. It stops an agent that cooperates; it does not stop
one that looks for a way around (see docs/spike-findings.md). CI is the real check.
"""
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))  # also under `python -I`, which leaves the script's folder out
import ledger  # noqa: E402

FILE_TOOLS = {"Edit", "Write", "MultiEdit", "NotebookEdit"}

# Returned in place of an exit code when the person should be asked instead of the call being blocked.
ASK = "ask"
# Tried with the real Claude Code on 2026-10-30: in `default` and `acceptEdits` (docs/ask-spike.md, non-interactive) and in `auto`
# (docs/ask-panel-probe.md, the VS Code extension, seen by a person) a hook answer of "ask" kept the command from running until the
# person answered, even with `Bash` allowed by the skill. For any other mode, or none, an approval stays blocked: nothing says what
# "ask" does there.
ASKABLE_MODES = {"default", "acceptEdits", "auto"}

# Tests are locked in both phases, so refactoring cannot be used to weaken them.
LOCKED_PHASES = {"green", "refactor"}

# `ppc approve-red`, `node .../ppc.mjs approve-slice`, ...: the human gate, never the agent's to pass.
# `ppc decide-addition` is not in it: the owner decided (2026-10-30) that telling the assistant in the conversation what to cut or
# keep is permission enough. Writing the decision into additions.yaml by hand stays blocked (DECISION_FIELD, CONTRACT_DIR).
APPROVAL = re.compile(
    r"\bppc(\.mjs)?\s+(approve|reread|decide(?!-addition))"
    # `ppc finish ... --budget-reason ...` records an exception to a rule: that is a decision too
    r"|\bppc(\.mjs)?\s+finish\b[^\n]*--(budget|mutation)-reason",
    re.IGNORECASE,
)

# Fields that record a human decision. An agent never writes them: a person does, or `ppc` on a person's behalf.
DECISION_FIELD = re.compile(r"(approved_by|red_approved_by|decided_by|accepted_reason|budget_override_reason|mutation_override_reason)[\"']?\s*:")
CONTRACT_DIR = re.compile(r"(^|/)(\.sddpp/|\.architect/additions\.yaml$)")

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

# Redirections that only throw output away or join two streams: they write nothing, so they must not make a command look like a write.
NO_WRITE_REDIRECT = re.compile(r"(\d*|&)>>?\s*/dev/null|\d*>&\d")


def writes(command) -> bool:
    """True when a shell command appears to write something (see WRITES), not counting `2>/dev/null` and `2>&1`."""
    return bool(WRITES.search(NO_WRITE_REDIRECT.sub(" ", str(command))))


# Text for `cat` to write to a file, in a heredoc whose delimiter is quoted: the shell expands and runs nothing in it, and `cat` only copies it.
# `ppc approve` inside it is a note in a log, not an approval. An unquoted delimiter (the shell runs `$(...)` in the text), a pipe, `;`, `&`
# or a backtick after the delimiter, or any command other than `cat` receiving the text, leaves it as it is.
INERT_HEREDOC = re.compile(
    r"(?P<head>\bcat\b[^\n|;&<`]*<<-?[ \t]*(?P<quote>['\"])(?P<tag>\w+)(?P=quote)[^\n|;&`$()]*\n)"
    r"(?P<body>.*?)(?P<end>^[ \t]*(?P=tag)[ \t]*$)",
    re.DOTALL | re.MULTILINE,
)


def without_inert_text(command) -> str:
    """The command line without the text `cat` copies from quoted heredocs, so that a mention of an approval in it is not mistaken for one."""
    return INERT_HEREDOC.sub(lambda m: m.group("head") + m.group("end"), str(command))


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
        return bool("package.json" in command and writes(command) and re.search(r"\btest\b", command))
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
        return bool(".sddpp/" in command and DECISION_FIELD.search(command) and writes(command))
    return False


def _writes_the_ledger(payload) -> bool:
    """True when a tool call would write the file that holds the person's panel answers: only the recorder hook may."""
    if not isinstance(payload, dict):
        return False
    tool, args = payload.get("tool_name", ""), payload.get("tool_input") or {}
    if tool in FILE_TOOLS:
        return str(args.get("file_path") or args.get("notebook_path") or "").replace("\\", "/").endswith("answers.jsonl")
    if tool == "Bash":
        command = str(args.get("command", ""))
        return "answers.jsonl" in command and writes(command)
    return False


def decide(payload, root: Path):
    """Return (exit_code, message) for one PreToolUse payload; the code is ASK when the person should be asked."""
    # The proof that a person decided is theirs alone: the agent writes neither the ledger nor the answers to its own question.
    if _writes_the_ledger(payload):
        return 2, "SDD.PP guard: .sddpp/answers.jsonl holds the person's answers in the question panel; only the recorder hook writes it."
    if isinstance(payload, dict) and payload.get("tool_name") == "AskUserQuestion" and (payload.get("tool_input") or {}).get("answers"):
        return 2, "SDD.PP guard: the answers to a question are the person's; do not fill them in. Ask the question without `answers`."

    # Approvals belong to a human, whatever the phase. A human has decided when they picked, in the question panel, the option that
    # names exactly this command (`/pp` asks it that way); that answer is used up by the approval it allows.
    if isinstance(payload, dict) and payload.get("tool_name") == "Bash":
        command = without_inert_text((payload.get("tool_input") or {}).get("command", ""))
        if APPROVAL.search(command):
            needed = [inv for inv in ledger.invocations(command) if APPROVAL.search(inv)]
            if not (needed and ledger.consume(root, needed, payload.get("session_id"), payload.get("tool_use_id"))):
                if payload.get("permission_mode") in ASKABLE_MODES:
                    return ASK, "SDD.PP guard: approvals are human decisions. Approve this only if you decided it yourself."
                return 2, (
                    "SDD.PP guard: approvals are human-only. Type /pp so the person can decide in the question panel, or run the "
                    "command in a terminal (in the Claude Code CLI also after `!`; the VS Code extension has no `!`)."
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
        if COMMAND_TEST_PATH.search(command) and writes(command):
            return 2, f"SDD.PP guard: {prefix}this command appears to modify test files while {where}."
    return 0, ""


def main() -> None:
    try:
        payload = json.load(sys.stdin)
    except (ValueError, OSError):
        payload = None
    code, message = decide(payload, ledger.project_root(payload))
    if code == ASK:
        print(json.dumps({"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "ask", "permissionDecisionReason": message}}))
        sys.exit(0)
    if message:
        sys.stderr.write(message + "\n")
    sys.exit(code)


if __name__ == "__main__":
    main()
