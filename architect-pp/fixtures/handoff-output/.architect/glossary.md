# Glossary — Personal Task Tracker

| Term | Meaning |
|---|---|
| Owner | The one person who uses the app, on their own computer. |
| Task | One thing the owner wants to do: a title (1–200 characters after trimming), a done/open state and timestamps. |
| Open task | A task not yet marked done. |
| Done task | A task marked done. It stays in the list, below the open tasks, until deleted. It can be reopened. |
| Live task | A task that is not deleted. The list shows only live tasks. |
| Soft delete | Deleting a task by stamping a deletion time on its row instead of removing the row. The task leaves the list; the row stays in the database file. |
| Loopback | The address `127.0.0.1`, reachable only from the same computer. The server listens only there. |
| Server action | A server-side function the page calls directly (add, toggle, delete); the app has no REST API for the owner's data. |
| Empty state | The message shown instead of the list when there are no live tasks. |
