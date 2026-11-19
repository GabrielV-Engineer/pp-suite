---
description: "STANDARDS: decide with the person how this project handles security, observability, git and CI, in the question panel"
---

## User input

```text
$ARGUMENTS
```

A standard (`security`, `observability`, `git` or `ci`) to decide or change. Empty means every standard still undecided.

## What this step is

The design may say nothing about security, observability, branches, pull requests or CI, and nothing else asks. This step
asks. pp-suite does not prescribe the answer: a local app for one person and a team service need different things. It
makes sure each one is decided by the person, recorded in `.sddpp/standards.yaml`, and read by the rest of the flow (the
constitution, the slice cards, the build and the audit). See `docs/standards.md` in pp-suite.

## Rules

- **The person decides; you ask.** `ppc decide-standard` is human-only: the guard lets it through only when the person picked
  that exact command in the panel. Never write `.sddpp/standards.yaml` by hand.
- **Recommend, do not push.** `ppc standards` gives a recommendation and its reason, from the design and the repository. Say
  it, and say what the other choices cost. Lean to the smaller answer for a small project: a standard nobody needs is
  ceremony.
- **"Later" and "not needed" are good answers.** Deciding never holds the work up.
- Only these four standards. Anything else the person wants recorded about how they work (a commit message style, a review
  rule) goes in their own part of `CLAUDE.md`, outside the pp-suite block.

## Steps

1. Run `ppc standards`. Tell the person in a few lines what each undecided standard is, what is recommended and why.
2. **Every undecided standard at once (the usual case).** Run `ppc ask standards` and ask that question with the
   AskUserQuestion tool: the same options in the same order. You may put the words in the person's language; everything
   after the last ` — ` stays as printed. Before the panel, say in one line per option what happens if they pick it.
   - "Take the recommendations": run the command of that option right away.
   - "One by one": go to step 3 for each undecided standard.
   - Anything else: decide nothing.
3. **One standard.** Run `ppc show <standard>`, then `ppc ask <standard>` and ask it the same way. Run only the command of the
   option they picked.
   - If they choose **Other** and describe their own rule or tool (for example "Sentry for errors", "GitLab with merge
     requests reviewed by two people"), run `ppc ask <standard> --details "<their words, without double quotes>"` and ask
     that question. It records the standard as `custom`, in their words.
4. After any decision, run `ppc constitution`, so `CLAUDE.md` lists the adopted standards.
5. Run `ppc validate` and report what it says about the standards:
   - `S03` means security or observability was adopted and the design has no quality attribute for it. Offer to open a
     change request (`ppc change-request`) so the design carries it. That change goes through the person like any other.
6. Say what follows from what they chose, in one line each. Do not do it now:
   - `ci` adopted on GitHub or GitLab: setting up the pipeline is work; `/pp-plan` gives it a slice.
   - `git` with a branch per slice: `/pp-build` works on a branch named `slice/<id>` from the next slice on.
   - A standard decided "later": `ppc next` asks again when its trigger happens.
7. End with two lines: what was decided, and what `/pp` does next.
