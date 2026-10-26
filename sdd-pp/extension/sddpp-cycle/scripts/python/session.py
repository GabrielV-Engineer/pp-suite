#!/usr/bin/env python3
"""SDD.PP session start: tell the agent whose turn it is.

Runs as a Claude Code SessionStart hook (registered by Spec Kit from extension.yml). Whatever it prints to stdout is added to the
conversation before the first prompt, so an agent starts oriented without anyone typing a command. It asks `ppc session`, which
prints nothing outside a pp-suite project. It never fails: if `ppc` is missing or errors, it prints nothing and exits 0.
"""
import os
import shutil
import subprocess
import sys
from pathlib import Path


def context(root: Path, ppc=None) -> str:
    exe = ppc or shutil.which("ppc")
    if not exe:
        return ""
    try:
        result = subprocess.run([exe, "session", str(root)], capture_output=True, text=True, timeout=20)
    except (OSError, subprocess.SubprocessError):
        return ""
    return result.stdout if result.returncode == 0 else ""


def main() -> None:
    try:
        sys.stdin.read()  # the payload (source: startup, resume, clear, compact) is not needed
    except OSError:
        pass
    root = Path(os.environ.get("CLAUDE_PROJECT_DIR") or Path.cwd())
    text = context(root)
    if text:
        sys.stdout.write(text)
    sys.exit(0)


if __name__ == "__main__":
    main()
