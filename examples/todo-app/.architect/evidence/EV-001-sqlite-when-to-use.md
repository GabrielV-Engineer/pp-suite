---
id: EV-001
claim: SQLite suits low-to-medium traffic and per-application local storage, and supports one writer at a time per database file.
source_url: https://www.sqlite.org/whentouse.html
source_type: primary
retrieved: 2026-10-24
expires: 2027-04-24
confidence: high
quote: SQLite works great as the database engine for most low to medium traffic websites (which is to say, most websites).
---

Further verbatim lines from the same page, retrieved on the same date:

- "SQLite strives to provide local data storage for individual applications and devices."
- "SQLite only supports one writer at a time per database file."
- "If there are many client programs sending SQL to the same database over a network, then use a
  client/server database engine instead of SQLite."

Note: the page does not literally say "single user". The claim above is worded to match what the
page does say.
