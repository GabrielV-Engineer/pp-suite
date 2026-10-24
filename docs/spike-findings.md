# Spike findings: can a Spec Kit extension lock test files in Claude Code?

Run on 2026-10-24. This records what was **observed**, so later work does not rely on memory.

## Setup

- Spec Kit installed from source at commit `67e0f72` (`specify-cli` `1.2.4.dev0`; the published release
  at the time was v1.2.3), in an isolated virtual environment.
- Claude Code 2.1.310, run non-interactively (`claude -p`) inside a throwaway project.
- An extension declaring `events: pre_tool_use` and a preset overriding the tasks template and
  wrapping the `speckit.tasks` command.

## What worked

| Check | Result |
|---|---|
| Installing an extension with an `events` block | Spec Kit wrote a `PreToolUse` hook (`matcher: "*"`) into `.claude/settings.json` that calls its dispatcher. |
| The dispatcher passes the exit code through | Yes: the script's `exit 2` and its stderr reach Claude Code. |
| Claude Code honors the block | Yes. In phase `red` an edit to a test file was applied (control). In phase `green` the same request was rejected, the message reached the model, and the file hash was unchanged. |
| Behavior under pressure | Asked to make a failing test pass with `Bash` allowed, the model did not work around the lock. It reported the block, said the test looked wrong, and asked the human. One run, one model. |
| Preset replaces a template | `specify preset resolve tasks-template` pointed at the preset. |
| Preset wraps a command | After fixing the manifest, the generated Claude skill contained the preset's rules before and after the unchanged core text. |
| Cost | Median 103 ms per tool call (p95 112 ms, 30 runs), because the hook runs on every tool call. |

## What did not, and what to remember

1. **The lock is a guard rail, not a security boundary.** A shell command that writes through an
   interpreter (`node -e`, `python -c`) or builds the path from pieces is not recognised. These cases
   are pinned as "known limitation" tests in `sdd-pp/extension/sddpp-guard/tests`. The real check must
   be made afterwards from git: a green commit must not touch test files.
2. **The dispatcher fails open when it cannot find the command's script.** A missing script means no
   protection, silently. Timeouts and errors fail closed (exit 2). The guard itself fails closed when
   its state file is unreadable, but it cannot protect against its own absence.
3. **Commands declared in a preset belong in `provides.templates`** with `type: "command"`. Under a
   separate `commands:` key they are ignored without any warning.
4. `specify extension add` takes the path first and `--dev` as a flag. `specify preset add` takes the path
   as the argument of `--dev`.

## Not tested

- Running a Spec Kit workflow with `type: gate` steps end to end.
- Other models or repeated runs of the pressure test.
- Community presets, including `test-first-governance`.
