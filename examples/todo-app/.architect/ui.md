---
screens:
  - id: SCR-01
    name: Tasks
    capabilities: [CAP-001, CAP-002, CAP-003, CAP-004]
    states: [ready, loading, empty, error]
    mockup: .architect/ui/mockups/SCR-01.html
    approved_by: example-owner
    mockup_sha256: 6ff6011d51b6e871a91d9459b2dcbeda3946d52c3785f566974c98d19d80d43f
---

# Interface

A fictional single-screen task list. The approved mockup is the reference for every slice that touches the frontend.

## Navigation

One screen, `/`. No routing.

## Flows

- Add a task: type a title, press Add; the task appears at the end of the list.
- Complete, rename, delete and filter happen in place in the list.

## States

- Ready: the list, the form and a line with how many tasks are open and done.
- Loading: "Loading tasks…".
- Empty: "No tasks yet. Add the first one."
- Error: "The tasks could not be loaded. Try again."

## Visual system

Calm and plain. Tokens as CSS variables (`--bg`, `--text`, `--muted`, `--border`, `--primary`, `--on-primary`), light and
dark. System font, 16 px base, an 8 px spacing step.

## Accessibility

WCAG 2.2 AA. Every text and background pair meets 4.5:1 in light and in dark: text on bg, muted on bg, on-primary on primary.

## Sizes

From 320 px wide; the content column stops at 640 px.
