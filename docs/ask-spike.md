# Spike: can the guard ask the person instead of blocking?

Date: 2026-10-30. Claude Code 2.1.311. Done with the real program in a scratch project outside this repository, model `haiku`,
non-interactive (`claude -p`), `--setting-sources project`. A PreToolUse hook either answered
`{"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "ask", "permissionDecisionReason": ...}}`,
exited 2, or did nothing, for the command `touch <file>`. The question: does a hook's `ask` keep the command from running
without a person, in the modes pp-suite cares about?

## Result

| Case | Mode | Hook | Allow | Command ran? |
|---|---|---|---|---|
| control | default | none | `--allowedTools Bash` | **yes** (so the setup can run it) |
| ask | default | `ask` | none | no: denied, nobody to ask |
| ask | acceptEdits | `ask` | none | no |
| ask + allow | default | `ask` | `--allowedTools Bash` | **no**: the hook's `ask` wins over an allow |
| deny | default | exit 2 | `--allowedTools Bash` | no |
| the real guard | default | `guard.py`, on `echo ppc approve-slice ...` | `--allowedTools Bash` | no; the reason it gave was shown |

The hook input carries `permission_mode` (`default`, `acceptEdits` were seen), which is what lets the guard decide per mode.

## What this supports, and what it does not

- Supports: in the default and accept-edits modes, `ask` does not let the command through when nobody answers, and a blanket allow
  does not override it. So the guard answers `ask` for approvals in exactly those two modes (`ASKABLE_MODES`).
- **Not tested: `bypassPermissions`.** The safety classifier of the session that ran this refused to start a nested agent with the
  bypass flag, and the check was not worked around. So in that mode, and in any other (`dontAsk`, `auto`, `plan`) or when the mode
  is missing, the guard keeps blocking with exit 2, which is what it did before.
- **Not tested: the interactive dialog.** A non-interactive run cannot show it, so that a person sees the exact command and that
  approving runs it is from the documentation ("`ask` prompts the user to confirm", with the reason shown in the prompt), not from
  this run. Not tested in the VS Code extension either: that is the first thing to try there (procedure below).
- An allow rule written in the project's `settings.json` (`Bash(touch:*)` and `Bash(touch *)`) did not allow the command in this
  setup even without a hook, for a reason not found; the allow cases above use the command-line flag instead.

## To check by hand, in the VS Code extension

In a project whose `.claude/settings.json` has the guard installed (`ppc init . --apply --update`), ask Claude to run
`ppc approve-slice SL-001 --by <you>` in the default mode. Expected: a permission prompt that shows the command and says
"approvals are human decisions"; Yes runs it, No leaves the slice planned. If no prompt appears and the command is refused,
write that down: the fallback is the old block.

## Update (2026-10-30, later)

The owner's VS Code session runs in `auto`, which this spike did not try, so the guard blocked approvals there. A probe run by the
owner ([ask-panel-probe](ask-panel-probe.md)) showed that in `auto` a hook's `ask` produces the permission prompt too, so `auto` is
now one of the modes where the guard asks.
