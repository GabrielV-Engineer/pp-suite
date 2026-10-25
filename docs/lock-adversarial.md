# How hard is the test lock to get around?

The lock exists because an agent that is told "make the tests pass" can make them pass by weakening them.
This page records an adversarial pass over it: the ways to defeat the lock that were tried, what stopped each
one, and what is still open. Every "blocked" and "caught" line below is a test in the repository.

Two layers, with different jobs:

- The **guard** (`sdd-pp/extension/sddpp-guard`) refuses a tool call while it is being made. It is a guard
  rail, not a security boundary: it reads text, and text can be disguised.
- **`ppc check-git`** looks at the real history afterwards, and `ppc finish` runs it before a slice is closed.
  It cannot be disguised from inside the repository, but it only sees what was committed.

## What the pass found

Reading the guard with an attacker's eye turned up three real holes, all now closed and tested:

| Hole | Why it mattered | Now |
|---|---|---|
| A test path was recognised only at the **end of the command line** | `sed -i … tests/a.test.js && npm test` was not blocked | Blocked. The path is found anywhere in the command |
| `node -e`, `python -c`, `ln`, `dd`, `install` were not treated as writes | A test could be emptied or replaced with one of them | Blocked when the command names a test path |
| `npm test` can be made to pass **without touching any test**, by changing the `test` script in `package.json` | `"test": "true"` turns every run green | Guard blocks edits to that script in green and refactor; `check-git` rule `C07` catches it afterwards |

And one hole in `check-git`: the audit lists commits by hand, so a commit that weakens a test but is **left out
of the list** was invisible. Rule `C06` now compares the tests at the approved red commit with the end of the
slice (the last listed commit, or `HEAD` when `ppc finish` runs), whatever the audit says.

## Outcome by attack

| Attack | Guard | `check-git` |
|---|---|---|
| Edit or write a test with the file tools | blocked | `C02` if committed in a green, refactor or structural commit |
| `sed -i`, `>`, `tee`, `rm`, `mv`, `cp`, `truncate`, `git checkout`/`restore` naming the test | blocked | as above |
| The same, followed by `&& npm test` or `; …` | blocked (was not) | as above |
| `node -e`, `python -c`, `ln`, `dd`, `install` naming the test | blocked (was not) | as above |
| Change `scripts.test` in `package.json` (file tools or `npm pkg set`) | blocked (was not) | `C07` (was not caught) |
| A commit between red and green that weakens a test, **not listed** in the audit | not blocked if disguised | `C06` (was not caught) |
| The same, made after the last listed commit but before `ppc finish` | not blocked if disguised | `C06`, because `finish` checks up to `HEAD` |
| Delete an approved test | blocked | `C06` |
| Build the test path from fragments (`'te'+'sts/'…`) | **not blocked** (pinned by a test as a known limit) | `C06` once committed |
| Edit a decision field (`approved_by`…) in `.sddpp/` | blocked, but only when the edit **adds or changes** one | n/a |

Also fixed because of this pass: the guard used to refuse an edit that merely showed an existing `approved_by`
line as context, which cost an agent extra turns in the refactor exercise.

## What is still open

- **Other test runners.** `C07` looks only at the `test` script of `package.json`. A Makefile target, a
  `pytest.ini`, a vitest config that excludes files, or a CI workflow are not watched.
- **Code that recognises the tests.** Production code that detects a test environment and returns canned
  answers passes every rule here. Mutation testing and the human reading the audit are the defense.
- **A person approving a weak red test.** The lock keeps tests as approved; it cannot judge them. This is the
  one thing the human is asked to read carefully.
- **Disguised writes that are never committed** change nothing the slice can claim, because `ppc finish`
  refuses uncommitted work.
- **No adversarial agent was run.** The attacks above are payloads fed to the guard and histories built in
  temporary repositories. A cooperating agent was observed respecting the lock; an agent that is trying to
  defeat it has not been tested.
