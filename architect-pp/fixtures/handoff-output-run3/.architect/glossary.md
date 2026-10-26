# Glossary — Personal Task Tracker

| Term | Meaning |
|---|---|
| Owner | The one person who uses the app, on their own computer. |
| Task | One thing the owner wants to do: a title of 1 to 200 characters and a done/open state. |
| Open task | A task not yet marked done. Listed first, newest on top. |
| Done task | A task marked done; shown with the text "Done" and a line through its title, listed below the open tasks. It can be reopened. |
| Live task | A task that has not been deleted; only live tasks are listed. |
| Deleted task | A task the owner deleted. It no longer appears in the list; its row stays in the database file (soft delete, ADR-0005, ADD-001). |
| Loopback | The address `127.0.0.1`: only programs on the owner's own computer can reach it. |
| Server action | A function the page calls on the server when a form is submitted (add, toggle, delete); the app has no other API for the owner's data. |
| Design token | A named color (for example `--primary`) defined once and reused by every component. |
| Appearance | Light or dark look of the page; follows the operating system, with no toggle. |
