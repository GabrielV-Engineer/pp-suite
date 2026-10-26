# pp-suite

Two small frameworks for building software with AI agents without losing control of the code.

- **Architect.PP** decides *what* is built and *with which rules*: stack, architecture, quality targets.
- **SDD.PP** builds it in thin vertical slices, test-first, with a human approving at the key points and
  every shortcut recorded as technical debt.

They talk through one versioned [contract](docs/contract-v0.1.md), and neither imports the other.

> **Status: pre-alpha.** The contract, its validator, the slice cycle commands and the test-lock guard
> exist and are tested. One slice has been taken end to end with real agents, with a stand-in as the
> human reviewer: see the [M1 report](docs/m1-report.md). Since then: the design checks and the hand-off from The
> Architect, the scope review, the tests policy, per-task prompts, the light cycle and `ppc init` were built and
> tested, each tried once or twice on small examples. Architect.PP is now installable as a Spec Kit extension. Not built: opening change requests from a slice, the experiment that compares whole methods, and any trial with a
> real novice. See the [roadmap](ROADMAP.md).
>
> **Does it help? Not shown.** A 45-run experiment found that on thin slices SDD.PP did not produce better
> tested or more focused code than a plain prompt, and cost 2.5 times as much: see the
> [experiment report](docs/experiment-report.md) for what it could and could not test. A second one found that a
> written, narrow slice does keep an agent from building what an ambitious request invites (4.6 times the code,
> soft delete, paging, search): [report 2](docs/experiment-report-2.md).

## Why

AI agents write code fast. The problems that follow are known: over-engineered designs, a stack picked
without criteria, 1,000-line commits, tests rewritten until they pass, and no overview of the code after a
few weeks. pp-suite attacks those with rules a tool can check, not only advice.

## It builds on existing tools, it does not replace them

| Piece | Built on | pp-suite adds |
|---|---|---|
| SDD.PP | [Spec Kit](https://github.com/github/spec-kit) (extension, preset, workflow) | Slices, a test lock, debt register per component, audit pack |
| Architect.PP | [The Architect](https://github.com/Hainrixz/the-architect) | Quality targets, complexity budget, architecture tests, hand-off *(planned)* |

No upstream code is copied. Why these bases and not others: [upstream-analysis](docs/upstream-analysis.md).
How slices fit inside Spec Kit: [slices-in-sdd](docs/slices-in-sdd.md).
The experiment, with every number: [experiment-report](docs/experiment-report.md). How hard the test lock is to get around: [lock-adversarial](docs/lock-adversarial.md). Mutation testing: [mutation-testing](docs/mutation-testing.md). The refactor phase with a real agent: [refactor-exercise](docs/refactor-exercise.md).

## What is in this repo

```
contract/v0.1/schemas/   the contract, as JSON Schemas
tools/ppc/               validator and generator for the contract (Node)
sdd-pp/                  Spec Kit extension (test-lock guard) and preset (slices)
architect-pp/            planned
install/                 planned
examples/todo-app/       a worked example of every artifact
docs/                    contract, how it works, spike findings, upstream analysis
```

## Try it

Requires Node 22+ and Python 3.

```bash
cd tools/ppc && npm ci
npm test                                         # validator, generator, git checks, CLI, docs consistency
node bin/ppc.mjs validate ../../examples/todo-app --strict
node bin/ppc.mjs rules                           # every rule the validator can emit
node bin/ppc.mjs check-git ../../examples/todo-app   # audits vs. real git history (none in the example yet)
cd ../.. && python3 -m unittest discover -s sdd-pp/extension/sddpp-guard/tests
```

## License

[MIT](LICENSE).

## Principles

1. **Rules a tool checks beat advice.** If a rule can be verified mechanically, it is.
2. **Thin slices, not layers.** One observable behavior through the layers it needs.
3. **The human approves the tests, not every line.** RED tests are the specification.
4. **Debt is visible and per component.** The AI proposes it; a person decides.
5. **No requirement without a slice, no component without a requirement.**
6. **Be honest about strength.** The guard is a guard rail, not a lock; see the
   [spike findings](docs/spike-findings.md).
