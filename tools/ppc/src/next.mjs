// What to do next, and where the project stands. Pure functions over the loaded model (and the commit
// subjects of git history), so they are tested without a repository; bin/ppc.mjs feeds them.
//
// The aim: a person who comes back to the project after an hour or a month is told, without reading anything,
// whose turn it is and which command to run.

import { modeOf } from './policy.mjs';

const RED = '/speckit-sddpp-cycle-red';
const GREEN = '/speckit-sddpp-cycle-green';
const BUILD = '/speckit-sddpp-cycle-build';
const REFACTOR = '/speckit-sddpp-cycle-refactor';
const AUDIT = '/speckit-sddpp-cycle-audit';

const unfinished = (s, byId) => (s.depends_on ?? []).filter((d) => byId.get(d)?.status !== 'done');
const committed = (subjects, kind, id) => subjects.some((line) => line.startsWith(`${kind}(${id})`));

function inProgressActions(s, subjects) {
  const id = s.id;
  const head = `${id} "${s.title}" is in progress, ${s.phase} phase.`;
  if (s.type === 'spike') {
    return { headline: head, actions: [{ who: 'agent', what: 'Explore, then record what was learned', command: `ppc finish ${id} --audit <file.json>` }] };
  }
  if (s.phase === 'build') {
    if (!committed(subjects, 'build', id)) {
      return { headline: head, actions: [{ who: 'agent', what: 'Build the slice: tests and code together, in small commits', command: BUILD }] };
    }
    return { headline: head, actions: [{ who: 'agent', what: 'Record debt and deviations, and close the slice', command: AUDIT }] };
  }
  if (s.phase === 'red') {
    if (!committed(subjects, 'red', id)) {
      return { headline: head, actions: [{ who: 'agent', what: 'Write the failing tests, one per acceptance criterion, and commit them', command: RED }] };
    }
    return {
      headline: head,
      actions: [{ who: 'human', what: 'Read the committed tests. They are the specification; approve them only if they say what you want', command: 'ppc approve-red --by <your name>' }],
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
 */
export function nextSteps(model, subjects, errors = []) {
  const slices = model.slices.map((s) => s.data).sort((a, b) => a.id.localeCompare(b.id));
  const byId = new Map(slices.map((s) => [s.id, s]));
  const live = slices.filter((s) => s.status !== 'dropped');

  const waiting = model.debt.flatMap((d) => d.data.entries)
    .filter((e) => e.status === 'proposed')
    .map((e) => ({ who: 'human', what: `Decide on proposed debt ${e.id}: ${e.title}`, command: `ppc approve-debt ${e.id} --by <your name>` }));
  const blocked = live
    .filter((s) => ['planned', 'ready'].includes(s.status) && unfinished(s, byId).length)
    .map((s) => ({ slice: s.id, waits_for: unfinished(s, byId) }));

  // Design changes: what a person must decide, what Architect.PP must revise, and what is stale afterwards.
  const crs = model.changeRequests.map((c) => c.data).sort((a, b) => a.id.localeCompare(b.id));
  const changeAction = (c) => (c.status === 'open'
    ? { who: 'human', what: `Decide on change request ${c.id}: ${c.title} (raised by ${c.raised_by})`, command: `ppc decide-change ${c.id} --accept|--reject --by <your name>` }
    : { who: 'agent', what: `Revise the design for ${c.id}: ${c.title}`, command: `/speckit-architect-pp-apply-change ${c.id}` });
  const pending = crs.filter((c) => ['open', 'accepted'].includes(c.status));
  const revision = model.blueprint.data.revision;
  const stale = live.filter((s) => s.status !== 'done' && s.blueprint_revision < revision);
  const staleNote = stale.length ? [{ who: 'anyone', what: `Slices planned against an older design (now revision ${revision}): ${stale.map((s) => `${s.id} (revision ${s.blueprint_revision})`).join(', ')}. Read what changed, then update their blueprint_revision` }] : [];
  const result = (headline, actions, paused) => ({ headline, actions, waiting, blocked, changes: [...pending.filter((c) => c !== paused).map(changeAction), ...staleNote] });

  if (errors.length) {
    return result(`The contract has ${errors.length} error(s); fix them first, because every other step assumes a valid project.`, [
      { who: 'anyone', what: 'See the errors', command: 'ppc validate' },
    ]);
  }

  const open = live.find((s) => s.status === 'in_progress');
  if (open) {
    const asked = pending.find((c) => c.raised_by === open.id);
    if (asked) {
      const why = asked.status === 'open' ? 'a person has not decided it yet' : 'it is accepted and waits for the design to be revised';
      return result(`${open.id} "${open.title}" is paused: it raised ${asked.id} ("${asked.title}"), and ${why}.`, [changeAction(asked)], asked);
    }
    const { headline, actions } = inProgressActions(open, subjects);
    return result(headline, actions);
  }

  const ready = live.find((s) => s.status === 'ready' && !unfinished(s, byId).length);
  if (ready) {
    return result(`${ready.id} "${ready.title}" is approved and ready.`, [{ who: 'anyone', what: `Start it (${['skeleton', 'feature', 'fix'].includes(ready.type) && modeOf(model.blueprint.data, ready) === 'light' ? 'build' : 'red'} phase)`, command: `ppc start ${ready.id}` }]);
  }

  const approvable = live.find((s) => s.status === 'planned' && !unfinished(s, byId).length);
  if (approvable) {
    return result(`Nothing is approved to start. ${approvable.id} "${approvable.title}" is the next planned slice.`, [
      { who: 'human', what: 'Read the slice (behavior, acceptance, out of scope) and approve it to start', command: `ppc approve-slice ${approvable.id} --by <your name>` },
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
