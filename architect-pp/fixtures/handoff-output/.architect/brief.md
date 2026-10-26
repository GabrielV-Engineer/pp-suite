# Brief — Personal Task Tracker

## Vision

A tiny task list that runs only on the owner's own computer. The owner types a task, sees it in a list,
ticks it off when finished, and can delete it. There is no account, no login, no sync and no hosting: the
app starts with one command, listens only on `127.0.0.1`, and keeps everything in one SQLite file. It exists
to find out whether the owner actually uses a task list they built themselves, before investing in anything
bigger.

## Users

| Persona | What they come to do | Frequency |
|---|---|---|
| The owner (exactly one person, on one computer) | Add a task, scan the list, mark tasks done, delete mistakes | Daily |

## Goals (v1)

1. Add a task with a title of 1–200 characters (CAP-001).
2. See all live tasks in one list: open first, newest on top, done below (CAP-002).
3. Mark a task done and undo that (CAP-003).
4. Delete a task; the row stays in the database file but leaves the list (CAP-004).
5. The server is reachable only from the owner's own machine (CON-002, QA-001).
6. Light and dark appearance follows the operating system (CON-004).

## Success metrics

| Metric | Target | How measured |
|---|---|---|
| Days with at least one task created | At least 7 distinct days by 2026-11-08 | Count the distinct local dates of `created_at` in the `tasks` table with any SQLite viewer |

## What it deliberately is not

See `non_goals` in `blueprint.yaml`. Each one has a trigger that would make it worth revisiting:

| Not building | Revisit when |
|---|---|
| Accounts, login, sessions | The owner wants to use it from a phone or another computer |
| Hosting, deploy pipeline, domain, CI | The owner asks for online access |
| Offline mode, sync, multi-device | Same trigger as hosting |
| Reminders, notifications, due dates | The owner reports forgetting tasks even though they use the list daily |
| Projects, tags, priorities, search, drag-reorder | The list regularly exceeds about 50 live tasks |
| Editing a task's title | The owner reports re-typing tasks more than once a week |
| A trash / restore screen | The owner deletes something by mistake twice |
| Auto-start at login | Starting it by hand is the reason the owner stops using it |

A slice that seems to need one of these is a blueprint defect and goes back as a change request.
