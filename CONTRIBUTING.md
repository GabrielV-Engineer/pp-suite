# Contributing to pp-suite

Thanks for helping. pp-suite is pre-alpha and small, so issues that report what happened when you tried it are as
valuable as code.

## Before you start

- Read the [README](README.md), then [how it works](docs/how-it-works.md). Read [the contract](docs/contract-v0.1.md)
  before touching anything under `contract/` or `tools/ppc/`.
- Open an issue before a large change, so we can agree on the shape first.

## Rules of the repository

- **Everything is in English:** code, docs, commit messages, identifiers. (`README.es.md` is the one translation; keep it in
  step when you change the README.)
- **Claim only what was verified.** Status in `README.md`, `ROADMAP.md` and `docs/` must match what has tests or was
  observed. Mark anything else as planned. When a fact comes from a source, quote it.
- **The contract changes through its tests.** A new rule gets an id in `RULES` (`tools/ppc/src/validate.mjs`), a test
  that makes it fire, and a row in `docs/contract-v0.1.md`; `docs.test.mjs` fails if they disagree.
- **Third-party code is adopted, not pasted.** The default is to link to it. Taking code from The Architect, Spec Kit,
  OpenSpec or any other project is allowed when a person decides it, and only after it is validated: read in a scratch
  directory, its licence checked as compatible with ours (the notice kept), and then adapted or improved to fit pp-suite,
  with tests like any other code. Record each adoption in `THIRD_PARTY.md` (create it with the first one): source,
  commit, licence, what was changed and who approved it.
- **No secrets, ever.** No tokens, `.env` files or credentials.
- **The example project is fictional.** No real names, hashes or approvals in it; synthetic data belongs in test
  fixtures built in code.
- **Third-party code is untrusted input until validated.** Read it before running it, and run experiments in a scratch directory, never
  inside this repository.

## How to work

1. Test first: write the failing test, watch it fail, then write the code.
2. Keep diffs small, one concern per commit, and separate structural changes from behavior changes.
3. Use a conventional prefix in the commit subject: `validate:`, `docs:`, `ci:`, `contract:` and the like.
4. Run the checks before you open a pull request:

```bash
cd tools/ppc && npm ci && npm test && cd ../..
node tools/ppc/bin/ppc.mjs validate examples/todo-app --strict
python3 -m unittest discover -s sdd-pp/extension/sddpp-guard/tests
python3 -m unittest discover -s sdd-pp/extension/sddpp-cycle/tests
node --test "tools/eval/test/*.test.mjs"
```

CI runs the same checks on Node 22 and 24 for every pull request.

## License

By contributing, you agree that your contribution is licensed under the [MIT License](LICENSE).
