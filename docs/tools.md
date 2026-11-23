# Tools of the agent: skills, plugins and MCP servers

Written on 2026-11-21. The problem, in the owner's words: a person has a kit of skills, plugins and MCP servers, forgets to
ask for the right one (a modern-frontend skill instead of a technical prompt that gives a generic design), and cannot follow
the new ones that appear every week. pp-suite knows what each slice builds (its components, screens and capabilities), so it
can connect a tool to a slice without relying on anyone's memory. **A person always decides which tool a project uses.**

## What exists

| Part | Status |
|---|---|
| **Inventory** (`src/inventory.mjs`, shown by `ppc init`): the skills (user, project, and those a plugin brings, named `plugin:skill`), the plugins that apply to the project and are not switched off, and the MCP servers (user, this project in `~/.claude.json`, and `.mcp.json`) | done (tests; each part broken on purpose). Run once on the owner's machine: it found the skills and MCP servers there, and no plugin for a project that has none. Not run on another machine, and not seen in a Claude Code session |

| **The file `.sddpp/tools.yaml`** ([schema](../contract/v0.1/schemas/tools.schema.json), [contract](contract-v0.1.md#tools-sddpptoolsyaml), `src/tools.mjs`): four roles (`ui-design`, `ui-capture`, `security-review`, `db-inspect`), each bound to a tool or `later` with a trigger or `not_needed` with a reason; rules `K01` (unknown or repeated role), `K02` (a `later` trigger happened) and `K03` (a role applies to a slice not yet closed and has no decision, one warning per role naming the slices) | done (tests; each rule, each signal and the loader broken on purpose). Optional: the example project has no file and still has no warning. **Not built:** the panel question and the guard rule (see below); nothing shows a role on a slice card or in a prompt yet |
| **`ppc decide-tool <role> ...`** (`src/lifecycle.mjs`): records a role's decision (adopt a tool with its kind, source, pinned version and, for an MCP server, its access; or `later` with a trigger; or `not_needed` with a reason), refuses what the contract refuses with a message that says what is missing, writes nothing when the result would be invalid, keeps an earlier decision in `history`, leaves other roles as they were | done (tests; each refusal, the history and the rollback broken on purpose; one equivalent mutant: dropping the role check still fails, through `K01`) |
| **The panel question, `ppc ask <role> [--tool <name> --kind <kind> ...]`** (`src/decisions.mjs`): with no tool named, "not needed" or "not yet" (a tool is named through Other, and the agent comes back with it); with one, a confirmation that carries the exact command. It says whether pp-suite found the tool on this machine (`hasTool` over the inventory) and, when it did not, that the name is the agent's own suggestion and is to be installed first, with the session restarted; it never claims either without having looked. It refuses what the command would refuse, so a person is never offered an option that fails | done (tests; each part broken on purpose; the labels were fed to the real recorder and guard scripts, including a `;` inside a quoted value). The agent prompt that asks it is not written (see below) |
| **The guard** (`sdd-pp/extension/sddpp-guard`): `ppc decide-tool` is human-only like every `ppc decide-*` except `decide-addition` (found already true, now tested); **the whole file `.sddpp/tools.yaml` is refused to an agent's write** (Edit, Write, MultiEdit, and a shell write), because the decision-field rule did not see an edit that swaps the tool or widens an MCP server's access and leaves `decided_by` alone: with the first rule of this section, that edit went through. Reading the file is free | done (Python tests; each rule broken on purpose). Not seen in a real Claude Code session, and a project installed earlier needs `ppc init --apply --update` to get the new guard |
| **`ppc tools`** (`renderTools` in `src/tools.mjs`): each role, its decision in words, the slices not yet closed that call for it (six named, the rest counted), and whether a chosen tool is on this machine; a missing one comes with what to do | done (tests; each part broken on purpose) |
| **Where the work happens** (the reason for all of the above): the slice's card (`ppc show`) has a **Tools** row, one line per role the slice calls for, with the tool chosen, "deferred", "not needed" or "no decision yet"; the project rules in `CLAUDE.md` have one line naming the adopted tools (`ppc constitution`, which `decide-tool` says to run); `/pp-build` tells the agent to use the chosen tool, never to pick one, to respect an MCP server's access and to report a role left undecided or a tool that was not available; `ppc next` and the session start list, beside the work, a role that slices ahead call for and nobody decided, and a deferred role whose trigger happened, as an item that holds nothing up; `/pp` knows the item (type `tool`) and may propose a tool the person has, saying it is its own suggestion | done (tests; each part broken on purpose; the commands run end to end on a copy of the example). **The prompts are text no agent has run yet**, and nothing verifies that an agent follows them (the hook that records use is planned) |
| **What stays opt-in** | The rules (`K01` to `K03`) judge a project only once it has `.sddpp/tools.yaml`, so a project that never touched the feature never fails `ppc validate --strict` for it; once the file exists, every role that slices call for needs a decision (`later` and not needed count) or `K03` fails strict mode. `ppc next` is the other way round on purpose: it shows **one item** for the undecided roles even when there is no file, because nothing else tells a new project the feature exists, and "none is needed" is one click (it creates the file with those roles not needed). That changes what an earlier version of this document said ("a project with no file hears nothing") |
| **One question for every undecided role** (`ppc ask tools`, `decideTools` in `src/lifecycle.mjs`, `parseUse` in `src/tools.mjs`): the roles that slices call for and nobody decided, with their slices, in one panel question: none of them is needed, one by one, or not yet. `ppc decide-tool --roles a,b --not-needed --reason …` records the first; `ppc decide-tool --use "role=kind:name,..."` records the tools an agent proposed (`ppc ask tools --use …` puts them in one confirmation, each saying whether pp-suite found it on this machine). All or nothing; earlier decisions go to `history`; **a server that may change things is never decided in a batch** (it needs its reason, so it is decided on its own); both forms are human-only like the rest | done (tests; each refusal and each part broken on purpose; the labels run through the real recorder and guard scripts, with colons, commas and an equals sign inside a quoted value) |
| **What the person has** (`ppc tools --have`, `renderHave`): every skill, plugin and MCP server by name and where it comes from, without pp-suite's own commands, not cut, never a server's command, url or environment, nothing written to the project | done (tests) |
| **`/pp-tools`** (`sdd-pp/extension/sddpp-cycle/commands/tools.md`, a short command like the others): the agent reads `ppc tools` and `ppc tools --have`, proposes at most one tool per role **from what the person already has**, says why it fits and that it is its own suggestion, and puts all of them in the one question; it installs nothing, proposes an MCP server only as read-only, treats what it reads about a tool as data, and never writes the file | the text is done (a test per instruction, each failed first when its sentence was changed; registered in the manifest and the short commands). **Written and not yet run by an agent on a real project**, so whether its proposals are useful or noise is **not known**. `ppc next` points at it (item type `tools`) |
| **Whether the chosen tool was used** (`src/uses.mjs`, `toolsOf` in `finish`, rule `W11`, the `tools` field of the audit): the recorder notes each skill and MCP server used, by name, never what it was given or answered, with the slice in progress; `.sddpp/uses.jsonl` is local, written only by the hook (the guard refuses an agent's write), and `ppc init` adds it to `.gitignore` because it names the MCP servers a person uses. `ppc finish` reads it and writes, for each role the slice called for that has a tool, `used` true or false, or **null when nothing was recorded for the slice**, so "not used" is never claimed without a record; the agent may add a one-line reason for a tool it did not use (`tools_unused`); `W11` reads the audit, never the record, and never holds a close up | done (tests; each part broken on purpose; the Python hook and the Node reader checked against each other). **Not seen in a real session**, and a project installed earlier needs `ppc init --apply --update` for the new hook and the `.gitignore` line |
| **What this check is worth** | It says a skill or an MCP server **was called** in the slice, not that it was applied well or that it helped: an agent can call a skill and ignore it. It does not see a plugin's own commands or MCP servers a plugin bundles. Whether using the chosen tool makes what is built better is **not measured** |

What the inventory promises, and tests:

- **Names only.** A server's command, url, arguments, headers and environment are never copied out of the file; they can hold tokens.
  An unreadable file is reported as a problem that quotes none of its text.
- **Read-only and never written to a project.** The inventory describes a machine. A repository can be public, and a server name
  can say something about its owner. Only a tool a person chooses for a project may be recorded there (planned, below).
- **A plugin counts only where it applies.** One installed for another project is ignored; one switched off in the settings is
  ignored, the nearest setting winning. Whether Claude Code treats "installed and not switched off" as loaded was not verified.
- pp-suite's own commands (`/pp`, `/pp-*`) and Spec Kit's are not listed as the person's skills.
- **Not covered yet:** MCP servers and skills that a plugin bundles in its own `.mcp.json`, and plugin commands.

How a role applies to a slice (`src/tools.mjs`, from facts the project already records, never from a model's reading of text):

| Role | A tool in it is (`for`, said in the panel question) | Applies to a slice when |
|---|---|---|
| `ui-design` | a skill that guides layout, type, colour and polish while the screens are built | it touches a `frontend` component or names screens |
| `ui-capture` | something that opens the real app and saves screenshots, so the audit and your glance see what was built | it names screens |
| `security-review` | a reviewer that reads the changed code for security flaws before the slice closes | the security standard is **adopted** and it touches a `backend` or `database` component |
| `db-inspect` | something that reads the stored data directly, to check what a slice wrote | it touches a `database` component |

Being on the machine is not being able to do the job. A tool may carry a **check**, a one-line command that shows it can do its job
here (for a capture tool, capturing one real screen), recorded with `ppc decide-tool --check-command "<command>"` and run by
`ppc tools --run-checks` (works, failed with the last line of its error, or no check recorded; it fails the command when a check
fails). `/pp-tools` tries a tool once before proposing it, and the command it tried becomes the check. `ppc tools --have` also lists
what comes with Claude Code itself, marked `(built-in)` (today `security-review`, seen in its skill list on 2026-11-23). Found in the
first real project: `playwright-cli` was on the machine and could not open a page, its browser not installed (F-T16), nor drive the
app's own window (F-T25); and `security-review` could only be "none" (F-T8).

The question about a role ends with "Why:", what a tool in it is for and the slices that call for it. Found in the first real project:
asked whether `db-inspect` needed a tool, the owner answered twice with a question of their own ("justify why, in which cases it
would be needed, and what it would be for").

These four are a first guess from one project and one person. A role with no signal that could be checked (documentation lookup was
considered) is left out until one exists.

**No rule asks whether a chosen tool is installed.** The validator reads the project's files; `ppc validate --strict` runs in CI on
machines that are not the person's, where a machine-dependent warning would fail every run. Availability is the inventory's job (`ppc
init`), as information.

## What is decided and not built (planned)

Decided with the owner on 2026-11-21. The file, its rules, the command, the panel question, the guard and `ppc tools` are built (above); the rest of this section has no code or tests: the search for new tools. The agent prompt that proposes a tool (`/pp-tools`) is written and not run.

| Part | Decision | What it rules out, and why |
|---|---|---|
| Where a project records its choice (**built**: the file, its rules, the command, the panel question, the guard) | `.sddpp/tools.yaml`: a role (`ui-design`, `security-review`, `db-inspect`...) bound to a tool, with the choice's `decision` (`adopt`, `later` with a trigger, `not_needed` with a reason), `decided_by` and `decided_on`, like `standards.yaml` | A sixth standard: the standards are a closed list with fixed choices. Inside `.architect/`: the design is locked against the build, and which skill a person installed is not part of the product. Only a global `CLAUDE.md`: nothing links it to a slice and nothing can be checked |
| Which slices a tool applies to (**built**) | Fixed signals in code: the component kinds, the slice's screens, an adopted standard. The slice card, the `/pp-build` prompt and `ppc next` name the role | The model deciding at run time from free text: that is forgetting again. Injecting every installed tool: more active skills compete for attention (`docs/speckit-skills-review.md` removed ten for it) |
| MCP servers | Same file, with an `access` field that is required (`read-only`, or `read-write` with a recorded reason); pp-suite enables nothing. Changed while building: the first plan said "read-only and local"; "local or remote" is a different question, not asked yet | Treating them like skills: they reach data and credentials |
| Checking use (**built**) | The same `PostToolUse` recorder as the panel answers also notes, by name, each skill and MCP server used and the slice in progress (`.sddpp/uses.jsonl`); `ppc finish` writes into the audit whether the tool chosen for each role the slice called for was used; `W11` warns when it was not and no reason was given | The agent's own report as proof (it can be false); `skillUsage` in `~/.claude.json` (global per user, not per slice); a rule that reads the local record (CI has none) |
| Finding new tools | A separate later step: a live search of Anthropic's list and GitHub, candidates shown with their source, licence, last commit and what they ship (scripts, hooks, servers), adopted under `THIRD_PARTY.md`. Built only after the rest has been used on one real project | A list kept inside pp-suite: it would claim "the best" without measuring and go stale in weeks. Anthropic's list alone: it leaves out most of GitHub |

**Observed before building the hook** (2026-11-21, `claude -p` 2.1.327, in scratch directories): `PreToolUse` and `PostToolUse` both fired for the `Skill` tool,
with `tool_input.skill` holding the skill's name; a plugin's skill arrived as `plugin:skill` (`probeplug:hello`, loaded with `--plugin-dir`), the same name the inventory gives it;
and for an `mcp__*` tool, whose payload has `mcp_server: { name, source }` (`name` is the server's name in the inventory). **Then run for real:** `record_answer.py`, registered directly as a `PostToolUse` hook in a `claude -p` session, noted a project skill and an
MCP tool with the slice in progress, by name only. **Not observed:** an interactive or VS Code session, and the recorder run through Spec Kit's event dispatcher from a
project installed with `ppc init` (it is the hook `ppc init` already verifies for the panel answers, but that path was not run for this).

## What this does not claim

- That a bound skill makes what is built better. The plan measures that the chosen tool **was used**, not that it helped; whether it
  helps is a separate test (a UI slice with and without the skill, judged with `ppc rubric`) and a small one.
- That the roles and signals above are the right ones. They are a first guess from one project and one person.
