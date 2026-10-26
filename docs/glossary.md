# Glossary, repository layout and principles

Moved here from the README so that the front page stays short.

## Words used in pp-suite

| Word | Meaning |
|---|---|
| **Blueprint** | The design as data: capabilities, components, quality attributes, non-goals (`.architect/blueprint.yaml`) |
| **Capability** (`CAP-001`) | Something a person can do with the system |
| **Quality attribute** (`QA-001`) | A measurable target: a metric and a number |
| **Non-goal** | Something the system deliberately does not do |
| **ADR** (`ADR-0001`) | Architecture Decision Record: a costly-to-reverse decision, with the alternatives rejected |
| **Addition** (`ADD-001`) | Something in the design that the person never asked for, listed so they can keep or cut it |
| **Slice** (`SL-001`) | One thin, visible piece of behavior built through all its layers |
| **Hand-off** | Converting The Architect's design into the contract |
| **Change request** (`CR-0001`) | A slice's request to change the design |
| **Technical debt** (`DEBT-BE-001`) | A known shortcut, recorded; the agent proposes it, a person decides |
| **Mutation testing** | Breaking the code on purpose to see whether the tests notice |
| **Walking skeleton** | The thinnest system that runs end to end |

## How Claude Code uses it

| Mechanism | What it is | Does |
|---|---|---|
| **Skills** (`/speckit-...`) | Markdown prompts that Spec Kit turns into Claude Code skills | Tell the model what to read, write and not do in each step |
| **Hooks** | Programs Claude Code runs at set moments | Before every tool call (the guard): blocks an agent from running `ppc approve-*` or `ppc decide-*`, from writing a decision field, and, in the strict cycle, from editing the tests. At the start of every session: shows whose turn it is (`ppc session`) |
| **Scripts** (`ppc`) | Plain Node code, no AI | Measures sizes from git, runs each transition, generates the prompts and the rules |
| **Rules** | `ppc validate` and `ppc check-git` | Check the contract and compare every audit with the real git history |
| **`CLAUDE.md`** | One short block (about 1,300 characters), generated | Where the design is and how to work: run `ppc next`, what only a person decides. It copies nothing from the design |

There are no webhooks, servers or network calls of our own: everything runs on your machine, with files, hooks and git.
The guard is a guard rail, not a security boundary; `ppc check-git` is the backstop.

## What is in this repository

```
contract/v0.1/schemas/   the contract, as JSON Schemas
tools/ppc/               the pp-suite contract tool (Node): validator, steps, install
tools/eval/              the measuring code of the experiments
architect-pp/            Architect.PP: the extension (hand-off, cuts, design changes) and real fixtures
sdd-pp/                  SDD.PP: the guard and the slice cycle, as Spec Kit extensions
install/                 pinned versions
examples/todo-app/       a worked example of every artifact
docs/                    the contract, how it works, reports of every experiment and spike
```

## Principles

1. **Rules a tool checks beat advice.** If a rule can be verified mechanically, it is.
2. **Thin slices, not layers.** One observable behavior through the layers it needs.
3. **People decide; agents propose.** And a hook, not a request, keeps it that way.
4. **One owner per file.** The design belongs to Architect.PP, the plan to SDD.PP; they talk through change requests.
5. **Debt is visible.** The agent proposes it; a person decides, and when to pay it.
6. **Pragmatic: delete before you automate.** Each piece has to earn its place; several were removed after review.
7. **Be honest about strength.** The guard is a guard rail, not a lock, and nothing here is claimed to help until measured.
