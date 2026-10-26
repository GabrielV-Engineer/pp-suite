---
id: EV-002
claim: On 2026-10-25 Node.js 24 was an LTS line (newest entry v24.22.1, 2026-10-20), and Node 26 was due to become LTS on 2026-10-28.
source_url: https://nodejs.org/dist/index.json
source_type: primary
retrieved: 2026-10-25
expires: 2026-10-28
confidence: medium
quote: "newest `lts` entry for 24 was v24.22.1 \"Krypton\" (2026-10-20); the session machine runs v24.21.0"
---

The `quote` is the blueprint's own record of the check (its section 11), not text re-fetched from nodejs.org during
this hand-off. The expiry was set to 2026-10-28 because the blueprint's choice of the 24 line rests on Node 26
not being LTS yet: it says "Node 26 becomes LTS on 2026-10-28 and is not used". After that date, re-check whether
the design should stay on 24.

The design pins the 24 line: `.nvmrc` is `24` and `engines.node` is `>=24.0.0 <25`. The driver needs Node
22 or later (EV-001).
