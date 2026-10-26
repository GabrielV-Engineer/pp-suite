---
id: EV-001
claim: On 2026-10-25 the pinned runtime and development package versions of the stack existed on the npm registry and were the versions the blueprint chose (next 16.4.3, react and react-dom 19.3.1, zod 4.6.7, drizzle-orm 0.45.4, better-sqlite3 13.0.3, tailwindcss 4.3.3, drizzle-kit 0.31.11, vitest 5.0.5, vite 8.3.4, @playwright/test 1.64.1, pnpm 12.15.0, create-next-app 16.4.3).
source_url: https://registry.npmjs.org/
source_type: primary
retrieved: 2026-10-25
expires: 2026-11-24
confidence: medium
quote: All checks made on 2026-10-25 with `npm view` against the live registry
---

All the package versions below were checked on the same day against the same registry, so they are one evidence
file. The quote above is the blueprint's own statement of how it checked; this conversion did not query the
registry again, which is why confidence is `medium` and not `high`.

Chosen pins, and where the blueprint says a newer one exists and was deliberately not used:

- `next` 16.4.3, `react` and `react-dom` 19.3.1, `zod` 4.6.7, `tailwindcss` 4.3.3, `vitest` 5.0.5,
  `@playwright/test` 1.64.1, `pnpm` 12.15.0, `create-next-app` 16.4.3: the `latest` tag.
- `drizzle-orm` 0.45.4 and `drizzle-kit` 0.31.11: the `latest` tag; the `1.0.0-rc` and beta tags exist and are
  deliberately not used.
- `better-sqlite3` 13.0.3: `latest`; needs Node 22 or newer and has no install script.
- `vite` 8.3.4: required by the range vitest 5.0.5 accepts; version taken from the runtime track file.
- `typescript` ~6.0.3: npm `latest` is 7.0.2, deliberately not used; the runtime track keeps tooling on 6.0.x.
- `@biomejs/biome` 2.5.15: npm `latest` is 2.6.3, deliberately not used; the track's fixes were exercised on 2.5.15.
- `@types/node` 24.19.2, `@types/react` 19.3.0, `@types/react-dom` 19.3.0, `@types/better-sqlite3` 9.6.0.

Peer ranges read for the pins: Next requires Node 20.9 or newer and React `^18.2 || ^19`; `drizzle-orm` accepts
`better-sqlite3` 7 or newer; `vitest` accepts `vite` 6, 7 or 8.

**Not verified, as the blueprint itself marks them:**

- The `--yes` and `--import-alias` flags of `create-next-app`.
- The `@tailwindcss/*` integration package the scaffold installs: it should end on the same 4.x line as `tailwindcss`.
- Whether Next bundles `better-sqlite3` or needs it listed as an external server package.
- The blueprint was **not smoke-tested**: its generating session could not run `pnpm`, `npx` or `node`, so no
  command in its build order or its acceptance gate was executed.

Versions move fast; re-check before building.
