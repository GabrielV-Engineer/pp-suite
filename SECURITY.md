# Security

## Reporting a problem

Please do not open a public issue for a security problem. Use **Report a vulnerability** in the repository's
[Security tab](https://github.com/GabrielV-Engineer/pp-suite/security), which sends a private report to the maintainer.

Say what you found, how to reproduce it, and what it lets someone do.

## What counts

pp-suite runs on a developer's machine, inside Claude Code. Relevant reports include:

- a way for `ppc init` or the installed hooks to run or write something outside the project they were pointed at;
- a way for the guard to let a human-only command through without the person's choice, beyond what is already
  documented;
- secrets or personal data in the repository.

The guard is a guard rail for an agent that cooperates, not a security boundary: an agent that can edit
`.claude/settings.json` can change the hooks. That limit is documented in [how it works](docs/how-it-works.md) and is
not a vulnerability by itself.

## Supported versions

Only the latest commit on `main` is supported while pp-suite is pre-alpha.
