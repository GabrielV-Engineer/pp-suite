# Brief — Personal Task Tracker

## Problem

The owner wants a tiny task list that runs only on their own computer. They type a task, see it in a list,
tick it off when finished, and can delete it. There is no account, no login, no sync and no hosting: the app
starts with one command, listens only on `127.0.0.1`, and keeps everything in one SQLite file
(`data/tasks.db`). It exists to find out whether the owner actually uses a task list they built themselves,
before investing in anything bigger.

## Who it is for

| Who | What they come to do | How often |
|---|---|---|
| The owner (exactly one person, on one computer) | Add a task, scan the list, mark tasks done, delete mistakes | Daily |

## Goals (v1)

1. Add a task with a title of 1 to 200 characters (CAP-001).
2. See all tasks in one list: open first (newest on top), done below (CAP-002).
3. Mark a task done and undo that (CAP-003).
4. Delete a task so it disappears from the list (CAP-004).
5. Reachable only from the owner's own machine (CON-002, QA-001).

Also in the design, but flagged for the owner to decide (see `additions.yaml`): light and dark appearance that
follows the operating system, and a recoverable (soft) delete.

## What good looks like

- **Success metric:** at least 7 distinct days with a task created by 2026-11-08, counted from `data/tasks.db`
  with `select count(distinct date(created_at/1000,'unixepoch','localtime')) from tasks;`.
- **Quality attributes** (each has a number in `blueprint.yaml`): local-only access (QA-001), no lost
  tasks (QA-002), readable colors (QA-003), large enough controls and no sideways scroll (QA-004),
  keyboard-only operation (QA-005).
- **Cost:** $0 per month (CON-004).

## What it deliberately is not

See `non_goals` in `blueprint.yaml`. They are the scope fence: a slice that seems to need one of them is a
blueprint defect and goes back as a change request.

| Not building | Why not now | Revisit when |
|---|---|---|
| Accounts, login, sessions | One person on their own machine; auth adds a schema, a test surface and no value | The owner wants to use it from a phone or another computer |
| Hosting, deploy pipeline, domain, CI | Local-only by decision; nothing to host | The owner asks for online access |
| Offline mode, sync, multi-device | Single computer, always-local data | Same trigger as hosting |
| Reminders, notifications, due dates | Explicitly declined by the owner | The owner reports forgetting tasks even though they use the list daily |
| Projects, tags, priorities, search, drag-reorder | "Nothing fancy": the list is the whole product | The list regularly exceeds about 50 live tasks |
| Editing a task's title | Not requested; delete and re-add covers it for a prototype | The owner reports re-typing tasks more than once a week |
| A trash / restore screen | Delete is soft only so a mistake is recoverable by hand in the database file | The owner deletes something by mistake twice |
| Auto-start at login | Adds OS-specific service files; v1 starts with one command | Starting it by hand is the reason the owner stops using it |
