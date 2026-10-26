---
id: EV-002
claim: On 2026-10-25 Node.js 24 was an LTS line whose newest LTS release was v24.22.1 (published 2026-10-20), and Node 26 was due to become LTS on 2026-10-28.
source_url: https://nodejs.org/dist/index.json
source_type: primary
retrieved: 2026-10-25
expires: 2026-11-24
confidence: medium
quote: newest `lts` entry for 24 was v24.22.1 "Krypton" (2026-10-20)
---

The quote is the blueprint's own record of what it read in the Node.js release index; this conversion did not
fetch the index again, which is why confidence is `medium`.

- The blueprint pins the runtime to the 24 LTS line (`>=24.0.0 <25`) and does not use Node 26, which becomes LTS
  on 2026-10-28, three days after the check. This pin is worth re-reading once that date has passed.
- The blueprint's session machine ran v24.21.0.
- `better-sqlite3` 13.0.3 needs Node 22 or newer, so the 24 line satisfies it.
