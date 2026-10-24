# How slices fit inside Spec Kit

What follows was **observed** by running Spec Kit's constitution, `specify`, `plan` and `tasks` commands
on one capability of a small project (a personal task list), with SDD.PP's preset installed. Where
something is a proposal and not an observation, it says so.

## The structure

```
.architect/blueprint.yaml        capability CAP-001 "Create and list tasks"
        │   read-only for the build
        ▼
specs/001-create-list-tasks/     ONE Spec Kit feature per capability
    spec.md      user stories P1..Pn, each with an Independent Test and Given/When/Then scenarios
    plan.md      how, inside the blueprint's boundaries; a check against each constitution principle
    tasks.md     an INDEX of slices (it points at the slice files, it does not repeat them)
        │
        ▼
.sddpp/slices/SL-002-….md        ONE file per slice: acceptance criteria, state, approvals, audit
        │
        ▼
red tests  →  green code  →  audit      (commits prefixed red(SL-002) / green(SL-002))
```

## The mapping

| In Spec Kit | In SDD.PP | Observed |
|---|---|---|
| A feature, `specs/NNN-name/` | A **capability** of the blueprint | One feature was created for CAP-001 |
| A user story with its scenarios | A **slice**; its scenarios become acceptance criteria | Three stories (P1, P1, P2) became three slices |
| The Setup and Foundational phases | The **skeleton** slice | SL-001, which already existed, was recognized as the baseline |
| `tasks.md` | An index of slices with the stories and requirements each covers | 26 lines, one row per slice, with a "Spec coverage" column |

What was observed is the reverse split: the slice SL-002, as a person had written it, covered the
behavior of two stories. The `tasks` session separated it into SL-002 and SL-008, one per story, because
the skeleton slice, measured earlier at 429 changed lines, made a single large slice risky. That decision
cited the project's own history. *Proposal, not observed:* a single story that exceeds the diff budget
would also be split into several slices.

## Who owns what

| Artifact | Truth about | Written by | Changed by |
|---|---|---|---|
| `.architect/` | Design: components, quality targets, rules | The design phase | Only through a change request |
| `spec.md` | Why, and the behavior in user terms | The `specify` command | A person, via `clarify` |
| Slice file | The executable acceptance criteria and the state of the work | The `tasks` command, then `ppc` | `ppc`, or a person for approvals |
| `tasks.md` | Nothing: it is derived | The `tasks` command | Regenerated |
| `wbs.md`, debt tables | Nothing: they are derived | `ppc generate` | Regenerated |

## What the run showed

**Good**

- The agent followed the preset: `tasks.md` stayed an index and every slice is a contract-valid file;
  `ppc validate --strict` reports 0 errors and 0 warnings on the result.
- The spec names no technology (0 mentions of the stack), and the plan checks each of the five
  constitution principles with evidence.
- The plan did **not** edit `.architect/`. Where it needed more than the blueprint says (a `500` error
  code and a `201` response), it listed them as "items for the owner to confirm". That is the
  read-only-with-change-request behavior the contract asks for.

**Gaps**

1. **Ceremony.** One capability produced 8 files and 576 lines of documents: `spec.md` 114, `plan.md`
   118, `research.md` 106, `contracts` 66, `data-model.md` 59, `quickstart.md` 51, a checklist 36 and
   `tasks.md` 26. For a project whose finished slice was about 190 lines of code, that is heavy. Spec
   Kit ships a `lean` preset; whether to adopt it is open.
2. **Acceptance criteria exist in several places.** The same scenarios appear in `spec.md`, in the slice
   file, in `quickstart.md` and in the contract notes. Nothing checks that they agree.
3. **The link from a slice to its story is not in the contract.** It lives only in the "Spec coverage"
   column of `tasks.md`, which is Markdown no tool validates. *Proposal:* an optional `spec` field on the
   slice naming the feature and its stories, and a rule that they exist.
4. **Planning edits spread.** To keep the order consistent, the `tasks` session changed the
   `depends_on` of a slice belonging to another capability (SL-003). It said so in its notes, but a
   person reviewing "the slice list for CAP-001" would not expect that change.
5. **Approvals had a hole.** Moving a slice from `planned` to `ready` meant writing `approved_by` by
   hand, so an agent that edited the file could approve itself, and `ppc start` would have accepted it.
   This run did not exploit it. It is now closed (below).

## Closed because of this run

- `ppc approve-slice <slice> --by <name>` is the way a slice becomes `ready`. Like `approve-red`, an agent
  cannot run it: the guard blocks it.
- The guard also blocks an agent from **writing** any field that records a human decision
  (`approved_by`, `red_approved_by`, `decided_by`, `accepted_reason`, `budget_override_reason`) into a
  file under `.sddpp/`, through file tools or through the shell. Both were written test first and each
  rule was broken on purpose to confirm a test fails. Like the test lock, this is a guard rail and not a
  security boundary: an interpreter writing the file is not recognized.

## Cost of this step

Four sessions: 0.3, 0.7, 2.1 and 1.4 minutes, and 1.21 USD in total.
