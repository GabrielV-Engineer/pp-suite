// What to do next, and where the project stands. Pure functions over the loaded model (and the commit
// subjects of git history), so they are tested without a repository; bin/ppc.mjs feeds them.
//
// The aim: a person who comes back to the project after an hour or a month is told, without reading anything,
// whose turn it is and which command to run.

import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { modeOf, testPolicy, screenApproved } from './policy.mjs';
import { askFor } from './decisions.mjs';
import { STANDARDS, TRIGGERS, triggerFired } from './standards.mjs';
import { pendingGlances } from './glance.mjs';
import { openReviews, pendingReviews } from './review.mjs';

const RED = '/pp-red';
const GREEN = '/pp-green';
const BUILD = '/pp-build';
const REFACTOR = '/pp-refactor';
const AUDIT = '/pp-audit';
const SLICES = '/pp-plan';
const HANDOFF = '/pp-design';

// Installed means the extension that provides the hand-off is there, so the advice below can be followed.
const INSTALLED = '.specify/extensions/architect-pp/extension.yml';

const unfinished = (s, byId) => (s.depends_on ?? []).filter((d) => byId.get(d)?.status !== 'done');
const committed = (subjects, kind, id) => subjects.some((line) => line.startsWith(`${kind}(${id})`));

function inProgressActions(s, subjects, facts, blueprint) {
  const id = s.id;
  const head = `${id} "${s.title}" is in progress, ${s.phase} phase.`;
  if (s.type === 'spike') {
    return { headline: head, actions: [{ who: 'agent', what: 'Explore, then record what was learned', command: `ppc finish ${id} --audit <file.json>` }] };
  }
  if (s.phase === 'build') {
    if (!committed(subjects, 'build', id)) {
      return { headline: head, actions: [{ who: 'agent', what: 'Build the slice: tests and code together, in small commits', command: BUILD }] };
    }
    // A first commit that only adds dependencies is not a finished build: when tests are required and none of the slice's build
    // commits holds one, the slice is still being built (it was paused by a change request, or the agent stopped early).
    if (testPolicy(blueprint, s) === 'required' && facts?.buildsWithoutTests?.has(id)) {
      return { headline: head, actions: [{ who: 'agent', what: 'Keep building: none of its commits holds a test yet, and this slice needs tests. When it is complete, audit it (record debt and deviations, and close)', command: BUILD }] };
    }
    return { headline: head, actions: [{ who: 'agent', what: 'Record debt and deviations, and close the slice', command: AUDIT }] };
  }
  if (s.phase === 'red') {
    if (!committed(subjects, 'red', id)) {
      return { headline: head, actions: [{ who: 'agent', what: 'Write the failing tests, one per acceptance criterion, and commit them', command: RED }] };
    }
    return {
      headline: head,
      actions: [{ who: 'human', what: 'Read the committed tests. They are the specification; approve them only if they say what you want', command: 'ppc approve', decision: { type: 'red', id } }],
    };
  }
  if (s.phase === 'green') {
    if (!committed(subjects, 'green', id)) {
      return { headline: head, actions: [{ who: 'agent', what: 'Write the least code that passes the approved tests', command: GREEN }] };
    }
    return {
      headline: head,
      actions: [
        { who: 'agent', what: 'Record debt and deviations, and close the slice', command: AUDIT },
        { who: 'anyone', optional: true, what: 'Clean up the structure first, with the tests still locked', command: 'ppc refactor' },
      ],
    };
  }
  // refactor phase: a refactor slice starts here, a work slice enters it from green
  if (!committed(subjects, 'refactor', id)) {
    return { headline: head, actions: [{ who: 'agent', what: 'Improve the structure without changing behavior, then audit', command: REFACTOR }] };
  }
  return { headline: head, actions: [{ who: 'agent', what: 'Record debt and deviations, and close the slice', command: AUDIT }] };
}

/**
 * The next step. `subjects` are the commit subjects of the history, newest first or in any order.
 * `errors` are the contract errors from the validator; while there are any, fixing them is the next step.
 * `facts` come from git beyond the subjects (see `buildFacts`); without them the subjects alone decide.
 */
// A panel answer is good for this long: the guard (sddpp-guard, ledger.py, TTL_SECONDS) accepts it only within it.
export const ANSWER_TTL_SECONDS = 30 * 60;

/** A command as the answer ledger stores it: its words, quotes removed, without the name `--by` supplies. */
export function normalizeCommand(command) {
  const words = [...String(command).matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map((m) => m[1] ?? m[2] ?? m[3]);
  const out = [];
  for (let i = 0; i < words.length; i++) {
    if (words[i] === '--by') i++;
    else if (!words[i].startsWith('--by=')) out.push(words[i]);
  }
  return out.join(' ');
}

/** The panel answers (unused, from the ledger) that chose a decision still waiting: the person decided, nothing ran it. */
function answeredOf(model, steps, { answers = [], now = Date.now() / 1000 } = {}) {
  const byCommand = new Map();
  for (const action of [...steps.actions, ...steps.waiting, ...steps.changes]) {
    const decision = action.decision;
    if (!decision) continue;
    let question = null;
    try {
      question = askFor(model, decision.id ?? decision.type);
    } catch {
      // a question ppc cannot write here: no answer can match it
    }
    for (const option of question?.questions[0].options ?? []) {
      const command = option.label.split(' — ').slice(1).join(' — ');
      if (command) byCommand.set(normalizeCommand(command), decision);
    }
  }
  return answers
    .filter((a) => byCommand.has(a.command))
    .map((a) => ({ decision: byCommand.get(a.command), command: a.command, label: a.label, at: a.at, fresh: now - a.at <= ANSWER_TTL_SECONDS }));
}

export function nextSteps(model, subjects, errors = [], facts = {}) {
  const steps = stepsOf(model, subjects, errors, facts);
  return { ...steps, answered: answeredOf(model, steps, facts) };
}

function stepsOf(model, subjects, errors, facts) {
  const slices = model.slices.map((s) => s.data).sort((a, b) => a.id.localeCompare(b.id));
  const byId = new Map(slices.map((s) => [s.id, s]));
  const live = slices.filter((s) => s.status !== 'dropped');

  const waiting = model.debt.flatMap((d) => d.data.entries)
    .filter((e) => e.status === 'proposed')
    .map((e) => ({ who: 'human', what: `Decide on proposed debt ${e.id}: ${e.title}`, command: `ppc approve ${e.id}`, decision: { type: 'debt', id: e.id } }));
  // Debt a closed slice did not pay, which no slice is to pay now (rule W09): the person ties it to a slice again
  const entries = new Map(model.debt.flatMap((d) => d.data.entries).map((e) => [e.id, e]));
  const leftUnpaid = new Map();
  for (const s of slices) for (const u of s.audit?.debt_unpaid ?? []) leftUnpaid.set(u.id, s.id);
  for (const [id, by] of leftUnpaid) {
    const e = entries.get(id);
    if (e?.status === 'open' && !e.paid_by) waiting.push({ who: 'human', what: `${by} closed without paying ${id}: ${e.title}. Choose the next slice that touches ${e.component} to pay it`, command: `ppc ask ${id} --pay-in <slice>` });
  }
  // The interface (F-U1): with a frontend, the screens are designed and their mockups approved before slices are built to them
  const hasFrontend = model.blueprint?.data.components?.some((c) => c.kind === 'frontend');
  const unapprovedScreens = (Array.isArray(model.ui?.data?.screens) ? model.ui.data.screens : []).filter((s) => !screenApproved(model, s));
  const screenDecision = (s) => ({ who: 'human', what: `Approve the mockup of ${s.id} "${s.name}" as the reference the slices build to (\`ppc show ${s.id}\`)`, command: `ppc approve ${s.id}`, decision: { type: 'screen', id: s.id } });
  const designUi = { who: 'agent', what: 'Design the interface with the person: screens, navigation, states, visual system, and the mockups they approve', command: '/pp-design ui' };
  if (slices.length) {
    if (hasFrontend && !model.ui) waiting.push({ ...designUi, what: `${designUi.what} (rule U01; the slices go on meanwhile)` });
    waiting.push(...unapprovedScreens.map(screenDecision));
  }
  // Standards (docs/standards.md): undecided ones, and deferred ones whose trigger happened. Never a blocker: before planning they
  // are a step, and once slices exist they wait beside the work.
  const chosen = model.standards?.data?.standards ?? [];
  const undecidedStandards = STANDARDS.filter((s) => !chosen.some((x) => x.id === s.id && x.decision !== 'pending'));
  const decideStandards = { who: 'human', what: `Decide how this project handles ${undecidedStandards.map((s) => s.id).join(', ')} (\`ppc standards\` shows them and what is recommended); one answer can take every recommendation, and later is always an answer`, command: 'ppc decide-standard --accept-recommended', decision: { type: 'standards', id: 'standards' } };
  const dueAgain = chosen
    .filter((x) => x.decision === 'later' && triggerFired(x.trigger, model.blueprint?.data, model.facts ?? {}))
    .map((x) => ({ who: 'human', what: `The ${x.id} standard waited until ${TRIGGERS[x.trigger]}, and that has happened: decide it again`, command: `ppc decide-standard ${x.id} ...`, decision: { type: 'standard', id: x.id } }));
  if (slices.length) waiting.push(...(undecidedStandards.length ? [decideStandards] : []), ...dueAgain);
  // The glance (docs/standards.md, "Experience"): a closed slice nobody has looked at is the person's turn, beside the work. Never a blocker.
  // The review of the whole (docs/standards.md, "Experience"): a complete capability is the person's turn to choose how; an open one is the agent's. Neither blocks.
  waiting.push(...pendingReviews(model).map((c) => ({ who: 'human', what: `${c.id} "${c.name}" is complete: review it as a whole, against the rubric, and choose how it is done (\`ppc show ${c.id}\`); it holds nothing up`, command: `ppc review ${c.id} --mode guide|explain|delegate`, decision: { type: 'review', id: c.id } })));
  waiting.push(...openReviews(model).map((r) => ({ who: 'agent', what: `Carry out review ${r.id} (${r.mode} mode): answer the rubric and propose each finding as debt`, command: `/pp-experience ${r.id}` })));
  waiting.push(...pendingGlances(model).map((s) => ({ who: 'human', what: `Look at what ${s.id} "${s.title}" built, as a user would meet it, and say so (\`ppc show ${s.id}\`); it holds nothing up`, command: `ppc glance ${s.id}`, decision: { type: 'glance', id: s.id } })));

  const blocked = live
    .filter((s) => ['planned', 'ready'].includes(s.status) && unfinished(s, byId).length)
    .map((s) => ({ slice: s.id, waits_for: unfinished(s, byId) }));

  // Design changes: what a person must decide, what Architect.PP must revise, and what is stale afterwards.
  const crs = model.changeRequests.map((c) => c.data).sort((a, b) => a.id.localeCompare(b.id));
  const changeAction = (c) => (c.status === 'open'
    ? { who: 'human', what: `Decide on change request ${c.id}: ${c.title} (raised by ${c.raised_by})`, command: `ppc decide-change ${c.id} --accept|--reject`, decision: { type: 'change', id: c.id } }
    : { who: 'agent', what: `Revise the design for ${c.id}: ${c.title}`, command: `/pp-change ${c.id}` });
  const pending = crs.filter((c) => ['open', 'accepted'].includes(c.status));
  const revision = model.blueprint.data.revision;
  const stale = live.filter((s) => s.status !== 'done' && s.blueprint_revision < revision);
  const staleNote = stale.length ? [{ who: 'human', what: `${stale.length} slice${stale.length === 1 ? ' was' : 's were'} planned against an older design (now revision ${revision}): ${stale.map((s) => `${s.id} (revision ${s.blueprint_revision})`).join(', ')}. Read what changed (\`ppc show reread\`), then say so`, command: 'ppc reread --all', decision: { type: 'reread' } }] : [];
  const result = (headline, actions, paused) => ({ headline, actions, waiting, blocked, changes: [...pending.filter((c) => c !== paused).map(changeAction), ...staleNote] });

  // Before any slice exists the rule "every capability has a slice" fires for all of them: that is not a fault, it is
  // the next step. Everything else is still an error.
  const unplanned = slices.length === 0;
  const blocking = unplanned ? errors.filter((e) => e.rule !== 'T06') : errors;
  if (blocking.length) {
    return result(`The contract has ${blocking.length} error(s); fix them first, because every other step assumes a valid project.`, [
      { who: 'anyone', what: 'See the errors', command: 'ppc validate' },
    ]);
  }

  if (unplanned) {
    const undecided = (model.additions?.data.additions ?? []).filter((a) => a.decision === 'pending');
    if (undecided.length) {
      return result('The design has additions nobody decided; decide them before planning slices, or the plan would be built on things you may cut.', [
        { who: 'human', what: `Decide on ${undecided.length === 1 ? undecided[0].id : undecided.length <= 4 ? undecided.map((a) => a.id).join(', ') : `${undecided.length} additions (${undecided[0].id} to ${undecided.at(-1).id})`}: read them with \`ppc additions\`, then tell your assistant what to cut or keep, or accept the recommended ones`, command: 'ppc decide-addition --accept-recommended [--but-cut <ids>] [--but-keep <ids> --reason <why>]', decision: { type: 'additions' } },
      ]);
    }
    const unapplied = (model.additions?.data.additions ?? []).filter((a) => a.decision === 'cut' && a.applied !== true);
    if (unapplied.length) {
      return result('Additions were decided to be cut but the design still contains them; carry the cuts out before planning slices (rule X04).', [
        { who: 'agent', what: `Remove ${unapplied.map((a) => a.id).join(', ')} from the design and record them as non-goals`, command: '/pp-design cuts' },
      ]);
    }
    if (undecidedStandards.length) return result('Before planning: decide how this project handles security, observability, git and CI, so the slices are planned knowing it.', [decideStandards, ...dueAgain]);
    if (dueAgain.length) return result('A standard that waited has its trigger now; decide it again before planning.', dueAgain);
    if (hasFrontend && !model.ui) return result('The design has a frontend and no interface yet; design it before planning, so every slice on a screen is built to an approved mockup.', [designUi]);
    if (unapprovedScreens.length) return result(`${unapprovedScreens.length} screen mockup${unapprovedScreens.length === 1 ? ' waits' : 's wait'} for the person's approval before slices are planned.`, unapprovedScreens.map(screenDecision));
    return result('The design is ready and no slices are planned yet.', [{ who: 'agent', what: 'Plan the thin vertical slices from the design; the person approves the list before it is written', command: SLICES }]);
  }

  const open = live.find((s) => s.status === 'in_progress');
  if (open) {
    const asked = pending.find((c) => c.raised_by === open.id);
    if (asked) {
      const why = asked.status === 'open' ? 'a person has not decided it yet' : 'it is accepted and waits for the design to be revised';
      return result(`${open.id} "${open.title}" is paused: it raised ${asked.id} ("${asked.title}"), and ${why}.`, [changeAction(asked)], asked);
    }
    const { headline, actions } = inProgressActions(open, subjects, facts, model.blueprint?.data);
    return result(headline, actions);
  }

  const ready = live.find((s) => s.status === 'ready' && !unfinished(s, byId).length);
  if (ready) {
    return result(`${ready.id} "${ready.title}" is approved and ready.`, [{ who: 'anyone', what: `Start it (${['skeleton', 'feature', 'fix'].includes(ready.type) && modeOf(model.blueprint.data, ready) === 'light' ? 'build' : 'red'} phase)`, command: `ppc start ${ready.id}` }]);
  }

  const approvable = live.find((s) => s.status === 'planned' && !unfinished(s, byId).length);
  if (approvable) {
    return result(`Nothing is approved to start. ${approvable.id} "${approvable.title}" is the next planned slice.`, [
      { who: 'human', what: 'Read the slice (behavior, acceptance, out of scope) and approve it to start', command: `ppc approve ${approvable.id}`, decision: { type: 'slice', id: approvable.id } },
    ]);
  }

  if (live.every((s) => s.status === 'done')) return result('Every slice is done. Plan the next capability, or decide on the debt that is waiting.', []);
  return result('Nothing can start: every remaining slice waits for unfinished work.', []);
}

export function renderNext(next) {
  const line = (a) => `  [${a.who}${a.optional ? ', optional' : ''}] ${a.what}\n      ${a.command}`;
  const out = [next.headline, ''];
  if (next.actions.length) out.push('Next:', ...next.actions.map(line), '');
  if (next.waiting.length) out.push('Also waiting for a person:', ...next.waiting.map(line), '');
  if (next.changes.length) out.push('Design changes:', ...next.changes.map((a) => (a.command ? line(a) : `  ${a.what}`)), '');
  if (next.blocked.length) out.push('Blocked:', ...next.blocked.map((b) => `  ${b.slice} waits for ${b.waits_for.join(', ')}`), '');
  if (next.answered?.length) {
    const time = (at) => new Date(at * 1000).toTimeString().slice(0, 5);
    out.push('Answered in the panel but not carried out:', ...next.answered.map((a) => `  ${a.decision.id ?? a.decision.type}: "${a.label.split(' — ')[0]}" at ${time(a.at)}, ${a.fresh ? 'still valid: run it now' : 'expired: ask again'}\n      ${a.command}`), '');
  }
  return out.join('\n').replace(/\n+$/, '\n');
}

/** Where the project stands, in one screen. `findings` are the validator's findings. */
export function overview(model, findings = []) {
  const bp = model.blueprint.data;
  const slices = model.slices.map((s) => s.data).sort((a, b) => a.id.localeCompare(b.id));
  const count = (status) => slices.filter((s) => s.status === status).length;
  const out = [`${bp.project.name} (blueprint revision ${bp.revision})`, ''];
  out.push(`${slices.length} slices · planned ${count('planned')} · ready ${count('ready')} · in progress ${count('in_progress')} · done ${count('done')}`);
  const open = slices.find((s) => s.status === 'in_progress');
  out.push(open ? `In progress: ${open.id} "${open.title}", phase ${open.phase}` : 'In progress: nothing');
  out.push('', 'Capabilities:');
  for (const cap of bp.capabilities) {
    const own = slices.filter((s) => s.capability === cap.id && s.status !== 'dropped');
    out.push(`  ${cap.id} ${cap.name} (${cap.priority}): ${own.filter((s) => s.status === 'done').length}/${own.length} done`);
  }
  const closed = slices.filter((s) => s.status === 'done' && ['skeleton', 'feature', 'fix'].includes(s.type) && s.audit);
  const untested = closed.filter((s) => s.audit.test_lines === 0);
  out.push('', `Verification: ${closed.length - untested.length} of ${closed.length} closed work slices changed tests (policy ${bp.test_policy ?? 'optional'})${untested.length ? `; no tests: ${untested.map((s) => s.id).join(', ')}` : ''}`);
  out.push('', 'Technical debt by component:');
  const debt = model.debt.flatMap((d) => d.data.entries);
  for (const component of bp.components.map((c) => c.id)) {
    const entries = debt.filter((e) => e.component === component);
    const n = (status) => entries.filter((e) => e.status === status).length;
    out.push(`  ${component}: proposed ${n('proposed')} · open ${n('open')} · scheduled ${n('scheduled')} · paid ${n('paid')}`);
  }
  const errors = findings.filter((f) => f.severity === 'error').length;
  out.push('', `Contract: ${errors} error(s), ${findings.length - errors} warning(s)`);
  return out.join('\n') + '\n';
}

/**
 * Where a project stands before there is a model to read: 'not-set-up' (pp-suite is not installed), 'no-design' (installed,
 * and `.architect/` is absent or empty) or 'has-design'. A half-written `.architect/` counts as 'has-design': the missing
 * files are then a real fault and `ppc validate` names them.
 */
export function designState(root) {
  if (!existsSync(join(root, INSTALLED))) return 'not-set-up';
  const dir = join(root, '.architect');
  try {
    return readdirSync(dir).length ? 'has-design' : 'no-design';
  } catch {
    return existsSync(dir) ? 'has-design' : 'no-design';
  }
}

/** The next step of a project that is set up but has no design: not a fault, the first step. Same shape as `nextSteps`. */
export function noDesignNext() {
  return {
    headline: 'No design yet. pp-suite is set up; the design comes first.',
    actions: [
      { who: 'human', what: 'Answer The Architect\'s interview; it writes a blueprint file', command: '/architect' },
      { who: 'agent', what: 'Convert the blueprint into the design files (.architect/), then check them with `ppc validate --design`', command: `${HANDOFF} <blueprint file>` },
    ],
    waiting: [],
    blocked: [],
    changes: [],
  };
}

/**
 * The same next step as data, for a skill to read. `kind` is what the reader does with it: `decision` (a person decides, the
 * assistant carries it out), `human-step` (a person does something that is not an approval), `agent-step` (run the skill in
 * `skill`), `run` (a plain `ppc` command) or `none`.
 */
export function nextJson(next) {
  const first = next.actions[0];
  const kind = !first ? 'none' : first.decision ? 'decision' : first.who === 'human' ? 'human-step' : first.command.startsWith('/') ? 'agent-step' : 'run';
  const slim = (a) => ({ who: a.who, what: a.what, command: a.command, decision: a.decision ?? null });
  return {
    headline: next.headline,
    kind,
    who: first?.who ?? null,
    what: first?.what ?? null,
    command: first?.command ?? null,
    // the Skill tool takes the name without the slash, and the words after it as arguments
    skill: kind === 'agent-step' ? first.command.split(' ')[0].replace(/^\//, '') : null,
    args: kind === 'agent-step' ? first.command.split(' ').slice(1).join(' ') || null : null,
    decision: first?.decision ?? null,
    optional: next.actions.slice(1).map(slim),
    waiting: next.waiting.map(slim),
    changes: next.changes.map(slim),
    blocked: next.blocked,
    answered: (next.answered ?? []).map((a) => ({ decision: a.decision, command: a.command, label: a.label, at: a.at, fresh: a.fresh })),
  };
}
