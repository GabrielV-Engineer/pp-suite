# Mutation testing

Mutation testing changes the production code a little at a time (flips a condition, empties a string,
deletes a block) and runs the tests. A mutant the tests do not notice is behavior nobody verifies. That is
the central claim SDD.PP makes about tests, and code coverage cannot check it: in the demo the tests start
the real server as a child process, so coverage does not see what they execute.

## What exists

- `ppc mutation (--files a,b | --slice SL-NNN) [dir]` runs [Stryker](https://stryker-mutator.io) and prints
  the score and the surviving mutants. It changes nothing in the project.
- An optional gate: `budgets.min_mutation_score` in the blueprint. When it is set, `ppc finish` measures the
  score of the slice's production files, records it in the audit, and refuses a lower one unless a human
  records `mutation_override_reason`. `M01` re-checks the recorded value. See the
  [contract](contract-v0.1.md#mutation-gate-optional).
- The score is `(killed + timeout) / (killed + timeout + survived + no coverage)`. Mutants that do not
  compile or were ignored are not judged. No judged mutant means no score (`null`), never 100%.

## Setup in a project

Stryker 9.6.1 with the built-in `command` runner (it works with `node --test`, TypeScript run directly by Node):

```json
{
  "testRunner": "command",
  "commandRunner": { "command": "node --test \"tests/*.test.ts\"" },
  "mutate": ["src/**/*.ts"],
  "coverageAnalysis": "off",
  "reporters": ["json", "clear-text"],
  "concurrency": 4,
  "timeoutMS": 20000,
  "tempDirName": ".stryker-tmp",
  "ignorePatterns": ["node_modules", ".git", "data"]
}
```

`coverageAnalysis` is off because the tests run the server in a child process, so every mutant runs the
whole suite. That is why it takes minutes and is a gate at the end of a slice, not a step of every commit.
Add `reports/` and `.stryker-tmp/` to `.gitignore`.

## First measurement, on the demo (n=1, not a result about the method)

`ppc mutation --slice SL-002` on `todo-app-m1`, whose tests were written by agents under the red/green
cycle and approved by a person. Duration about 2 minutes.

| File | Score | Detected | Missed |
|---|---|---|---|
| `src/tasks.ts` | 100% | 4 | 0 |
| `src/app.ts` | 75% | 18 | 6 |
| `src/db.ts` | 67% | 20 | 10 |
| `public/app.js` | 0% | 0 | 16 |
| **All four files** | **56.8%** | **42** | **32** |

What the survivors say, and it is useful:

- `public/app.js` is entirely unverified. No test runs browser code (browser tests are a non-goal of this
  blueprint), so every change there goes unnoticed. The slice tests only check that the file is served.
- In `src/db.ts`, nobody checks the migration order, the rollback after a failed migration, or the
  `journal_mode = WAL` and `synchronous = FULL` pragmas. The last two serve QA-001 (durability), but a
  `kill -9` of the process does not expose them: they only matter on power loss, so the existing test cannot
  tell them apart.
- In `src/app.ts`, the text of some error responses.

Not every survivor is a defect: changing the wording of a message may be an equivalent change. A 100% target
would push toward tests that pin down nothing useful. The score is a reviewer's map of what is unverified.

## What it does not show yet

It does not show that the method produces better-tested code than a plain prompt or an instructed-TDD
prompt. That needs the same measure on the other conditions of the [evaluation plan](evaluation-plan.md).
