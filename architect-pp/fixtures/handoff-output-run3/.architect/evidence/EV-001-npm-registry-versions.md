---
id: EV-001
claim: On 2026-10-25 the blueprint's session read the npm registry and pinned each runtime and tooling package of the stack to the version listed below.
source_url: https://registry.npmjs.org/
source_type: primary
retrieved: 2026-10-25
expires: 2026-11-25
confidence: medium
quote: "All checks made on 2026-10-25 with `npm view` against the live registry (or the URL shown)."
---

The `quote` is the blueprint's own record of the check (its section 11), not text re-fetched from the registry
during this hand-off. Confidence is medium for that reason, and because the blueprint states that it was **not
smoke-tested**: no setup or build command was run, so the pins have not been installed together. The expiry
(30 days) was chosen at hand-off; the blueprint gives none.

Per-package source: `https://registry.npmjs.org/-/package/<name>/dist-tags` (`latest`), or `npm view` as noted.

| Package | Pinned | Note from the blueprint |
|---|---|---|
| next | 16.4.3 | React peer `^18.2.0 \|\| ^19.0.0`; Node `>=20.9.0` |
| react, react-dom | 19.3.1 | |
| zod | 4.6.7 | |
| drizzle-orm | 0.45.4 | `1.0.0-rc` and `beta` tags exist and are deliberately not used; peers `better-sqlite3 >=7`, `@types/better-sqlite3 *` |
| better-sqlite3 | 13.0.3 | `engines.node >=22`; no install script; ships its binaries |
| drizzle-kit | 0.31.11 | RC and beta tags not used |
| typescript | ~6.0.3 | npm `latest` is 7.0.2, deliberately not used: the runtime track keeps tooling on 6.0.x |
| @biomejs/biome | 2.5.15 | npm `latest` is 2.6.3, deliberately not used: the track's fixes were exercised on 2.5.15 |
| tailwindcss | 4.3.3 | |
| vitest | 5.0.5 | engines `^22.12 \|\| ^24 \|\| >=26` |
| vite | 8.3.4 | `^20.19 \|\| >=22.12`; installed so vitest's peer is deterministic |
| @playwright/test | 1.64.1 | |
| @types/node, @types/react, @types/react-dom, @types/better-sqlite3 | 24.19.2, 19.3.0, 19.3.0, 9.6.0 | |
| pnpm | 12.15.0 | |
| create-next-app | 16.4.3 | |

Marked **unverified** by the blueprint (not checked at any point):

- Whether Next treats `better-sqlite3` as an external server package by default; if the build cannot bundle it,
  it must be listed in `serverExternalPackages`.
- The version of the scaffold's own Tailwind integration package (`@tailwindcss/*`); it should sit on the same 4.x
  line as `tailwindcss`.
- The `create-next-app` flags `--yes` and `--import-alias`.
