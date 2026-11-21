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

| Role | Applies to a slice when |
|---|---|
| `ui-design` | it touches a `frontend` component or names screens |
| `ui-capture` | it names screens |
| `security-review` | the security standard is **adopted** and it touches a `backend` or `database` component |
| `db-inspect` | it touches a `database` component |

These four are a first guess from one project and one person. A role with no signal that could be checked (documentation lookup was
considered) is left out until one exists.

**No rule asks whether a chosen tool is installed.** The validator reads the project's files; `ppc validate --strict` runs in CI on
machines that are not the person's, where a machine-dependent warning would fail every run. Availability is the inventory's job (`ppc
init`), as information.

## What is decided and not built (planned)

Decided with the owner on 2026-11-21. The file, its rules, the command, the panel question, the guard and `ppc tools` are built (above); the rest of this section has no code or tests: the role on the slice card, in the build prompt and in `ppc next`, the agent prompt that proposes a tool, the hook that records use, and the search for new tools.

| Part | Decision | What it rules out, and why |
|---|---|---|
| Where a project records its choice (**built**: the file, its rules, the command, the panel question, the guard) | `.sddpp/tools.yaml`: a role (`ui-design`, `security-review`, `db-inspect`...) bound to a tool, with the choice's `decision` (`adopt`, `later` with a trigger, `not_needed` with a reason), `decided_by` and `decided_on`, like `standards.yaml` | A sixth standard: the standards are a closed list with fixed choices. Inside `.architect/`: the design is locked against the build, and which skill a person installed is not part of the product. Only a global `CLAUDE.md`: nothing links it to a slice and nothing can be checked |
| Which slices a tool applies to | Fixed signals in code: the component kinds, the slice's screens, an adopted standard. The slice card, the `/pp-build` prompt and `ppc next` name the role | The model deciding at run time from free text: that is forgetting again. Injecting every installed tool: more active skills compete for attention (`docs/speckit-skills-review.md` removed ten for it) |
| MCP servers | Same file, with an `access` field that is required (`read-only`, or `read-write` with a recorded reason); pp-suite enables nothing. Changed while building: the first plan said "read-only and local"; "local or remote" is a different question, not asked yet | Treating them like skills: they reach data and credentials |
| Checking use | A `PostToolUse` hook, next to the one that records panel answers, appends calls to the `Skill` tool and to `mcp__*` tools; the audit warns when a slice closed without its bound tool | The agent's own report as proof (it can be false); `skillUsage` in `~/.claude.json` (global per user, not per slice) |
| Finding new tools | A separate later step: a live search of Anthropic's list and GitHub, candidates shown with their source, licence, last commit and what they ship (scripts, hooks, servers), adopted under `THIRD_PARTY.md`. Built only after the rest has been used on one real project | A list kept inside pp-suite: it would claim "the best" without measuring and go stale in weeks. Anthropic's list alone: it leaves out most of GitHub |

**Observed before deciding the hook** (2026-11-21, `claude -p` 2.1.327, one project skill and one user-level MCP tool, in a scratch
directory): `PreToolUse` and `PostToolUse` both fired for the `Skill` tool, with `tool_input.skill` holding the skill's name, and for
an `mcp__*` tool, whose payload also has a `mcp_server` key. **Not observed:** the name given to a plugin's skill (the Skill tool's own
description says `plugin:skill`), an interactive or VS Code session, and the hook registered through Spec Kit's dispatcher.

## What this does not claim

- That a bound skill makes what is built better. The plan measures that the chosen tool **was used**, not that it helped; whether it
  helps is a separate test (a UI slice with and without the skill, judged with `ppc rubric`) and a small one.
- That the roles and signals above are the right ones. They are a first guess from one project and one person.
