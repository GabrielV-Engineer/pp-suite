# pp-suite

[Leer en español →](README.es.md)

### Build with AI. Keep the wheel.

**The Pragmatic and Optimized suite for AI-assisted software.** Design it once, build it in small pieces that always work, and keep
every decision that matters in human hands.

> **Made for Claude Code, and only for Claude Code.** pp-suite uses Claude Code's hooks and skills to keep the AI inside the rules,
> so it does not work with other coding agents.

## Our mission

Help any engineer build software with AI coding agents in an organized, organic and controlled way, so that after weeks of
AI-written code the project can still be understood, changed and trusted.

**What we are aiming for:** code quality that holds up over a *long* project, not only in the first demo; nothing important
changes unless a person decides it; and the least process that gives you both. A feature should be reviewable in under an hour,
and the reviewer should know what changed, why, and what was left out.

## The problem

AI agents write code fast. What goes wrong is not the first hour; it is week two.

- Nobody remembers **why** something was done.
- The AI quietly **rewrites the design**, or a rule you were relying on.
- Features nobody asked for appear, commits grow to a thousand lines, tests get weakened until they pass.
- Or the opposite: so many documents and steps that reviewing takes longer than writing the code.

## What you get

| You get | How | What we saw in our test |
|---|---|---|
| **A design that stays yours** | The interview of [The Architect](https://github.com/Hainrixz/the-architect) becomes a checked design. A build cannot edit it; a change goes through a request that you decide | Spec Kit alone rewrote the design and dropped a database rule. pp-suite did not, and a check now catches it |
| **Small pieces that always run** | Work is cut into *vertical slices*: first the thinnest system that works end to end, then one visible behavior at a time, each with a list of what it does **not** do | The smallest change of the three ways we tried |
| **Decisions on paper, in a few lines** | Each slice carries its criteria, what was left out and what debt it created | A short record next to the work, instead of nine documents |
| **You decide, the AI proposes** | Approvals, debt, exceptions and anything the tool added that you did not ask for are human-only, and a hook enforces it | Enforced by a hook and covered by tests, not just requested |
| **Less to review** | Small slices, a short record, a design that does not move under you | About 40 to 60 minutes per feature, against 2 to 3 hours for Spec Kit alone (estimate) |
| **Every session starts oriented** | A hook tells the AI whose turn it is when a session begins | A fresh session answered "what do I do now?" without searching |

## How it works

```
 your idea ─► The Architect ─► design ─► you decide what stays ─► slices ─┬─► build ─► audit ─► you decide the debt
              (interview)      checked   of what was added        planned │
                                  ▲                                         │
                                  └──── "the design is wrong": change request, you decide ◄─┘
```

| Step | You | The AI |
|---|---|---|
| 1. Design | Answer the interview | Researches and proposes a full design |
| 2. Hand-off | Keep or cut each extra the tool added | Turns the design into a checked form and flags what you never asked for |
| 3. Slices | Approve the list, then each slice | Proposes thin slices from the design |
| 4. Build | — | Builds one slice, tests and code together, in small steps |
| 5. Close | Decide the debt it recorded | Writes the audit: what changed, what was left out, what is open |
| 6. Design was wrong | Decide the change | Opens a change request; the design is revised and re-numbered |

One command is enough to find your place: **`ppc next`** says whose turn it is and what to run.

## Vertical slices instead of the strict cascade

Writing down what you want before the AI builds it is a good idea. That is the heart of spec-driven development, and we keep it.
Followed strictly, though, it becomes a cascade: specify everything, plan everything, list every task, build, and find out what was wrong
only at the end. Spec Kit's own task list begins with a *foundation* phase that has to finish before anything visible works, and critics
call the result ["the waterfall striking back"](https://marmelab.com/blog/2025/11/12/spec-driven-development-waterfall-strikes-back.html).
Defenders answer that with an AI the feedback loop is minutes, not months. Both are right; it depends on how the work is cut.

```
 Strict cascade   specify all ─► plan all ─► tasks (foundation first) ─► build all ─► surprises at the end
 pp-suite         design once, lightly ─► slice 1: works end to end ─► slice 2 ─► slice 3 ─► ...
                                              └─ each slice: small, tested, with a "not in scope" list
                                                 and a path back to the design if it was wrong
```

- **Something works from the first slice.** Slice 1 is the thinnest system that runs end to end (a
  [walking skeleton](https://www.oreilly.com/library/view/97-things-every/9780596800611/ch60.html)). You find problems when they are small.
- **The design is firm, not frozen.** A slice that finds the design wrong stops and asks. A person decides, the design is revised, and the
  slices planned against the old version are flagged.
- **Every piece has a fence.** A size budget and a "not in scope" list keep a slice from growing into the next one.

## How it compares

We made the same small change (reject empty and over-long task titles) in a demo project three ways, from the same code and the same
request, and checked each result from the outside with the same tests plus eight edge-case checks nobody had seen.

| | Vibecoding | Spec Kit alone | pp-suite |
|---|---|---|---|
| Does the code work and pass its checks? | yes | yes | yes |
| Time to review one feature (estimate) | 20 to 30 min | 2 to 3 hours | 40 to 60 min |
| How much code changed | small | about 3 times more | the smallest |
| Changed the design or the database on its own? | no | **yes** | no, and a check catches it |
| Are the decisions written down? | no | yes, in nine long documents | yes, short, next to the work |
| Edge cases handled (8 checks) | 8 | 8 | 7: one left out on purpose, and said so |

On a change this small all three write code that works, so we do not claim better code. The difference is in what you have to read,
what moved without you knowing, and whether anything was written down. Over two weeks of about 20 features that adds up, as an estimate
from these numbers: roughly **6 to 9 hours** of review with vibecoding, **36 to 64** with Spec Kit alone and **13 to 19** with pp-suite,
with about 16,000 words of records to keep in step instead of 150,000. [The full test](docs/e2e-test-report.md).

## What it is built on, and why

We copy none of their code, and each can be upgraded on its own.

| Built on | What we use it for | Why |
|---|---|---|
| **[Claude Code](https://code.claude.com)** | Where everything runs: its skills carry each step and its hooks enforce the rules | A hook runs every time; a request in a prompt can be forgotten. It is the only way to *keep* the AI inside the rules, so we build for Claude Code alone |
| **[Spec Kit](https://github.com/github/spec-kit)** (GitHub) | The installer: it puts our skills and hooks into a project | It is widely used and already does this job, so we add to it instead of rebuilding it. We pin one tested version |
| **[The Architect](https://github.com/Hainrixz/the-architect)** | The design interview | It already asks the right questions and checks versions live. We turn its output into a checked design and drop its step-by-step build plan, which is ordered by layers |
| **Plain Node and git** (`ppc`) | The checks, the sizes, whose turn it is | Rules must answer the same way every time, so they are ordinary code and not the AI's judgment; git is the record of what really happened |

## Where the ideas come from

- **[The Architect](https://github.com/Hainrixz/the-architect)**: the interview that turns a vague idea into a design.
- **[Spec Kit](https://github.com/github/spec-kit) and spec-driven development**: write it down before you build. Spec Kit is also the host that installs our skills and hooks.
- **Test-driven development and [Kent Beck's augmented coding](https://www.kentbeck.com/summaries/augmented-coding-beyond-the-vibes/)**: tests catch what an agent breaks, and Beck reports agents deleting them to get a green run, so ours cannot.
- **The walking skeleton** (Alistair Cockburn) and **tracer bullets** (*The Pragmatic Programmer*): the thinnest end-to-end thing first.
- **[Claude Code's own guidance](https://code.claude.com/docs/en/best-practices)**: what must always happen belongs in a hook, not in a request.

## Status

Pre-alpha. Everything described here exists and is tested; each piece has been tried on small examples. The two-week picture is an
estimate, not a long project, and no novice has used it yet. [Roadmap](ROADMAP.md).

## Try it

Needs [Claude Code](https://code.claude.com) (tried with 2.1.310), Node 22+, Python 3, git and [Spec Kit](https://github.com/github/spec-kit) at the version in `install/versions.json`.

```bash
cd tools/ppc && npm ci
node bin/ppc.mjs init <your-project>            # shows what is missing
node bin/ppc.mjs init <your-project> --apply    # sets it up
node bin/ppc.mjs next                           # inside the project: whose turn is it
```

More: [how it works](docs/how-it-works.md) · [glossary and principles](docs/glossary.md) · [the contract](docs/contract-v0.1.md) · [install](install/README.md).

**PP** means Pragmatic and oPtimized: **Architect.PP** is the design side and **SDD.PP** is Pragmatic and Optimized Spec-Driven Development, the build side.

## License

[MIT](LICENSE).
