## When the person decides

Approving a slice or its red tests, accepting or rejecting a change request, deciding a debt entry, an exception to the
budget or the mutation score, and saying they read what changed in the design are the person's decisions. Never give them
a command to type in a terminal. Instead:

1. Run `ppc show <id>` and say in your own words what it is and what each choice means. Write every file they should
   read as a link, `[path](path)`.
2. Run `ppc ask <id>` (for an exception: `ppc ask <slice> --budget-reason "<the reason you propose>"`, or
   `--mutation-reason`) and ask exactly that question with the AskUserQuestion tool: the same options in the same order,
   without an `answers` field. You may put the words in the person's language; everything after the last ` — ` stays as
   printed. Before the panel, say in one line per option what happens if they pick it. For a debt entry that a planned
   slice touching its component should pay, add `--pay-in <that slice>`: debt left open with no slice to pay it is
   forgotten. When a slice's card lists "Open debt here", put each of those to them (`ppc ask DEBT-… --pay-in <slice>`)
   before the slice's own approval.
3. Run the command of the option they picked, exactly, right away, before anything else: an answer is good for 30
   minutes, once. For any other answer, run no approval. Only if the guard refuses
   the command, say so and give them the command to run themselves.
