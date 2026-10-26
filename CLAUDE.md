# pp-suite

Two frameworks (Architect.PP, SDD.PP) joined by a versioned contract. Read `README.md` first and
`docs/contract-v0.1.md` before touching anything under `contract/` or `tools/ppc/`.

## Conventions

- **Everything in the repository is English**: code, docs, commit messages, identifiers.
- **Claim only what was verified.** Status in `README.md`, `ROADMAP.md` and `docs/` must match what has
  tests or was observed. Mark anything else as planned. When a fact comes from a source, keep the quote.
- **The contract changes through its tests.** A new rule gets an id in `RULES` (`tools/ppc/src/validate.mjs`),
  a test that makes it fire, and a row in `docs/contract-v0.1.md`; `docs.test.mjs` fails if they disagree.
- **No upstream code is copied** from The Architect, Spec Kit or OpenSpec. Link to them.
- **No secrets, ever.** No tokens, `.env` files or credentials in this repository.
- The example project is fictional; do not put real names, hashes or approvals in it. Synthetic data
  belongs in test fixtures built in code.

## Commands

```bash
cd tools/ppc && npm ci && npm test              # validator, generator, CLI, docs consistency
node tools/ppc/bin/ppc.mjs validate examples/todo-app --strict
node tools/ppc/bin/ppc.mjs check-git <project>          # audits vs. real git history
node tools/ppc/bin/ppc.mjs approve-slice|start|approve-red|refactor|finish|status   # the slice cycle
python3 -m unittest discover -s sdd-pp/extension/sddpp-guard/tests
node --test "tools/eval/test/*.test.mjs"              # the experiment's measuring library
```

## Layout

`contract/` schemas · `tools/ppc/` validator and generator · `sdd-pp/` Spec Kit extensions ·
`architect-pp/` the hand-off and scope-review prompts · `install/` pinned versions · `examples/` worked example · `docs/` documentation.

## Working rules

- Test first: write the failing test, watch it fail, then write the code.
- Keep diffs small and one concern per commit; separate structural changes from behavior changes.
- Third-party code (Spec Kit, The Architect) is untrusted input: read it before running it, and run
  experiments in a scratch directory, never inside this repository.
