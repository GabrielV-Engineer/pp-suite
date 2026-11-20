# Third-party code

Code from other projects that pp-suite adopted, under the rule in [CONTRIBUTING.md](CONTRIBUTING.md): a person decided it,
it was read before it ran, its licence is compatible with ours and its notice is kept, and it is recorded here.

## Floorplan

| | |
|---|---|
| What | The interactive map of a codebase: its scan of files, imports and endpoints, its build of the map, and the viewer |
| Source | [haydenschmitty/floorplan](https://github.com/haydenschmitty/floorplan), version 0.11.0 |
| Commit | `94f81b463b7617e06d873ac71323ce71644c8399` (2026-11-16) |
| Where | [`tools/ppc/vendor/floorplan/`](tools/ppc/vendor/floorplan/): the plugin's `skills/floorplan/` folder, plus its `LICENSE` and `CHECKSUMS.txt` |
| Licence | MIT ([`LICENSE`](tools/ppc/vendor/floorplan/LICENSE)). It bundles [ELK](https://eclipse.dev/elk/) under EPL-2.0 ([`assets/vendor/elkjs-LICENSE.md`](tools/ppc/vendor/floorplan/assets/vendor/elkjs-LICENSE.md)) and the Inter font under the SIL Open Font License ([`assets/vendor/fonts/inter-LICENSE.txt`](tools/ppc/vendor/floorplan/assets/vendor/fonts/inter-LICENSE.txt)), each with its own notice |
| Changed | Nothing. Every file matches the `CHECKSUMS.txt` Floorplan published, and `tools/ppc/test/floorplan.test.mjs` fails if one is edited, added or removed. `.gitattributes` keeps git from changing line endings |
| What pp-suite adds | [`tools/ppc/src/floorplan.mjs`](tools/ppc/src/floorplan.mjs) writes Floorplan's input from the design and the slices (no AI is asked what the parts are) and runs its scripts: `ppc map --html` (scan and build the first time; `refresh.mjs` once a map exists, in its unattended mode, which writes only inside `floorplan/`) and `ppc map --describe` (the worksheets an agent writes each file's name and description from, following Floorplan's [`references/writing-descriptions.md`](tools/ppc/vendor/floorplan/references/writing-descriptions.md)) |
| Approved by | The owner of pp-suite, 2026-11-20 |

**What was checked before it ran** (in a scratch directory, on a copy of a project):

- The copy matched the published checksums.
- The scripts start one process, `git`, to read. Their other `fetch(` matches are patterns that recognize requests in the
  code being scanned, not requests they make.
- They write only inside their own folder, `floorplan/` at the project root, which ignores itself in git. `ppc` passes
  `--no-claude-md`, so nothing else in the project is touched. The folder is where Floorplan's tools expect it: its Ask
  server takes the folder above it as the codebase, and `describe.mjs` writes its worksheets there.
  Floorplan refuses a `floorplan/` folder that belongs to the project only when it picks the folder itself, and `ppc`
  passes one, so `ppc` checks first: it refuses a folder with files git tracks, or one that is not empty and carries none
  of Floorplan's marks, and writes nothing in it.
- The viewer talks only to Floorplan's own local server (`/api/...`). `ppc` does not start it: the map works without it,
  and the **Ask** bar shows as unavailable. A person who wants Ask runs `node floorplan/serve.mjs`: it listens on
  127.0.0.1 only and answers through `claude -p` with read-only tools (Read, Grep, Glob, and Bash limited to
  `floorplan/query.mjs`), on their own account. Seen starting and finding the Claude Code CLI; no question was asked.

**To update it:** clone the new release in a scratch directory, check it against its `CHECKSUMS.txt`, read what
changed, replace the folder, update the commit here and in `FLOORPLAN` (`tools/ppc/src/floorplan.mjs`), and run the tests.
