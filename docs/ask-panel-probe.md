# Probe: what does the question panel hand to a hook?

Needed before the panel answer can count as a person deciding (see the ROADMAP). The documentation says a `PostToolUse` hook gets
`tool_input` and `tool_response`, and that `AskUserQuestion` can be matched by name, but not what `tool_response` holds for it.
This cannot be run without a person: the panel needs one.

The probe is a throwaway project outside both repositories (`~/Proyectos/personal/pp-probe`, safe to delete): a skill `/pp-probe`
and two hooks that append what Claude Code sends them to `probe.log.jsonl`.

## What to do (about ten minutes, in the VS Code extension, default permission mode)

1. Open the folder `pp-probe` in VS Code and start Claude Code there.
2. Type `/pp-probe`. Note whether `/pp-probe` and `/pp` show up in the `/` menu (a clash would show as two entries).
3. Answer the panel **Yes, approve probe-1**.
4. A permission prompt should appear for `touch marker-approve-1` with the text "PROBE: this stands for a pp-suite approval".
   First run: press **No**. Note what the prompt looked like and whether it showed the command.
5. Run `/pp-probe` again, answer the panel **No**, and this time press **Yes** on the permission prompt.
6. Tell the assistant "probe listo". It reads `probe.log.jsonl` and `ls` of the folder.

## What the log answers

| Question | Where | If the answer is no |
|---|---|---|
| Does `tool_response` of the panel say which option was chosen, and how (text, index)? | the `post-ask` lines | The panel answer cannot be verified; the plan changes (see the ROADMAP) |
| Did the injected `date` number show in the skill (`!` commands work in VS Code)? | the assistant's first line | `/pp` has to run `ppc next --json` itself |
| Did the confirmation prompt appear at all, and did "No" keep `marker-approve-1` from being created, although the skill allows `touch`? | the `pre-bash` lines and the folder | The guard's question does not hold against a skill's allowed tools, and `/pp` must not allow `ppc` commands |
| Did the permission mode in the payload read `default`? | `permission_mode` in the lines | The guard's list of modes must follow what is observed |

## Results (run by the owner on 2026-10-30, VS Code extension, Claude Code 2.1.311)

Read from `probe.log.jsonl` and the session transcript, plus two answers from the owner.

| Question | Result |
|---|---|
| What does the hook receive when a person answers the panel? | A `PostToolUse` payload with `tool_name: "AskUserQuestion"`, `tool_use_id`, `session_id`, `cwd`, `permission_mode`, `transcript_path` and `tool_response.answers`, a map from the **text of the question** to the **label of the option chosen** (for example `{"Approve probe-1?": "Yes, approve probe-1"}`). `tool_input` carries the same `answers`. The panel answer can therefore be recorded and checked by a hook |
| Do `` !`cmd` `` injections work in a skill in VS Code? | Yes: the injected `date` came out as a number |
| Did the confirmation prompt appear for a command a hook answered `ask` to, with the command allowed by the skill's `allowed-tools`? | **Yes, the owner saw it** and pressed Yes; the command ran. So the hook's `ask` won over the skill's allowed tools, and a person saw the dialog |
| Did pressing **No** keep the command from running? | **Not tested.** On the first run the owner pressed Yes; on the second the assistant did not attempt the command because the panel answer was No |
| Which permission mode was the session in? | **`auto`**, which the owner says is their normal mode. The guard asked only in `default` and `acceptEdits`, so in this mode it **blocked** approvals. `auto` is now in the list of modes where it asks |
| Does `/pp` clash with another command in the `/` menu? | Not reported |

What this does not show: the behavior of the prompt when answered No, any mode other than `auto`, `default` and `acceptEdits` in
a person's hands, and one run is one run.

## What was built from it

The shape of the answer made the design possible: an option whose label ends with ` — <command>` is recorded when picked, and the
guard accepts that command once. The mechanism and its limits are in [how it works](how-it-works.md#you-type-pp).
