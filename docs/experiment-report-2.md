# Second experiment: does the per-slice specification matter?

Run on 2026-10-25 and 2026-10-26 under the protocol in [evaluation-plan](evaluation-plan.md) ("Second experiment"),
reduced to 18 runs before any result was read. Why this question: [measurement-review](measurement-review.md). Every
run is in [experiment-results-b0](experiment-results-b0/README.md); B1 is taken from the
[first experiment](experiment-report.md).

## Result by the rule fixed in advance

**"The slice spec matters."** Both request-only styles crossed a threshold.

| | B1: slice file | B0a: one clear sentence | B0b: one ambitious sentence |
|---|---|---|---|
| Runs | 15 | 9 | 9 |
| Passes the neutral acceptance test | 15/15 | 9/9 | 8/9 |
| Production lines added (median) | 29 | 29 | **134** |
| Out-of-scope markers (median) | 0 | 1 (see below) | **19** (range 0 to 84) |
| Cost per run (median) | 0.29 USD | 0.21 USD | 0.36 USD |
| Time per run (median) | 1.0 min | 0.7 min | 1.5 min |

## What the numbers really say (I read the code behind them)

- **B0a crossed the threshold by mistake.** Its one marker per run in SL-006 is the confirmation text "This cannot be
  undone" (the slice requires a confirmation), matched by my regex for "undo". In SL-008 it comes from filtering open
  tasks, which the B0a request itself asks for ("list the **open** tasks"). The same regex fired on two runs of the
  first experiment, and I had counted those as out-of-scope behavior; they were not (corrected in that report). The
  regex is fixed for future use; the stored counts are left as they were measured. **Without those false
  positives, B0a is equal to B1 on everything measured, and cheaper** (0.21 against 0.29 USD, 0.7 against 1.0 minutes).
- **B0b is a real and large effect.** The ambitious request produced 4.6 times the production code and did what the
  blueprint lists as non-goals. In SL-006, run 1 built soft delete: a migration adding `deleted_at`, a "Recently
  deleted" list and a Restore button (10 files, 389 lines added). In SL-008 it built paging (`PAGE_SIZE = 20`) and a
  search box. One of the nine runs failed the acceptance test (SL-006-B0b-2), plausibly because the extras changed
  the API. The agent could read the blueprint's non-goals in the repository and followed the request instead.

## What this means, and what it does not

**It means** two things. First, for a **clear, small request** the written slice added nothing measurable and cost
about 40% more to run: reading and following a spec is not free. Second, when the request is **ambitious**, an agent
builds what is asked even against non-goals written in the repository, and a narrow, written task is what kept B1 at
29 lines. The value of the slice file, in these data, is that it **bounds the work**.

**It does not mean** the framework protects a person from their own weak judgment. In B1 a slice file already
existed, narrow and approved. The experiment did not test the step that matters most for that claim: **whether the
planning step turns an ambitious request into narrow slices** or inflates it. Earlier I observed that The Architect
inflates scope by default until it is pushed back, and the planning step is a model too. If it writes soft delete into
the slice, the bound is gone. That is the next question, and it needs the real planning step in the loop.

Other limits, as before: one project, one model, three slices, nine runs per style, B1 reused from the day before,
no mutation testing in this experiment, and no measure of the person's attention.

## What changes in the project

- The **specification layer is supported as a scope bound**, not as a quality gain. That justifies keeping slices with
  an explicit "Out of scope" in the core, and justifies the next test of the planning step.
- It does **not** justify the strict cycle: the first experiment stands.
- The conclusion "a plain prompt matched SDD.PP" must always carry its condition: *when handed a narrow written
  task*.
