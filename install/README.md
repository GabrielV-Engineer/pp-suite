# install

**Status: built and tried once** (2026-10-26), through `ppc init`. `versions.json` holds the versions pp-suite was tested
with; nothing here is a claim about other versions.

```bash
node tools/ppc/bin/ppc.mjs init <project>                 # report only: checks and the commands it would run
node tools/ppc/bin/ppc.mjs init <project> --apply         # run the project-level steps that are missing
node tools/ppc/bin/ppc.mjs init <project> --apply --shim  # also write ~/.local/bin/ppc so the agent commands find ppc
```

What it checks: Node (minimum and tested version), git and that the project is a git repository, Python 3 (for the
guard), Spec Kit at the pinned commit, Claude Code (informs only), the dependencies of ppc, `ppc` on the PATH, and, in the
project, Spec Kit initialized, the three extensions (`architect-pp`, `sddpp-guard`, `sddpp-cycle`) and the preset at the version in this repository, the guard script
(without it the guard fails open) and the guard hook in `.claude/settings.json`.

What `--apply` does, in order, skipping what is already done: `npm ci` for ppc; `specify init --here --force
--non-interactive --integration claude`; `specify extension add <path> --dev` for `architect-pp`, `sddpp-guard` and `sddpp-cycle`;
`specify preset add --dev <path>` for `sddpp-slices`; and, only with `--shim`, a two-line shell script that runs this
checkout of ppc.

What it does not do, on purpose:

- **It does not install Spec Kit.** That is a global tool and third-party code. When it is missing, the report prints the
  command for the pinned commit. Read the code first.
- **It does not overwrite another program called `ppc`**, and it refuses to run on a project with uncommitted changes, so
  everything it does shows up as a diff you can review and revert.
- It does not clone The Architect. `versions.json` records the commit the design step was tried with.
- It does not replace a different version of an extension or the preset: it reports the difference and stops.

Tried: against Spec Kit at the pinned commit, in a scratch project and a scratch home directory: from a bare git
repository to 14 checks ok, a second run did nothing, and `ppc status` ran through the shim. Not tried: macOS or Windows,
a project that already has its own `.claude/settings.json` hooks, an update path (new versions of the extensions).
