import test from 'node:test';
import assert from 'node:assert/strict';
import { loadProject } from '../src/load.mjs';
import { validateModel } from '../src/validate.mjs';
import { nextSteps, noDesignNext, overview, renderNext } from '../src/next.mjs';
import { EXAMPLE } from './helpers.mjs';

const base = () => loadProject(EXAMPLE);
const slice = (m, id) => m.slices.find((s) => s.data.id === id).data;
const errorsOf = (m) => validateModel(m).filter((f) => f.severity === 'error');
const first = (result) => result.actions[0];

/** Put a slice in progress. */
function inProgress(m, id, phase) {
  const s = slice(m, id);
  Object.assign(s, { status: 'in_progress', phase, approved_by: 'reviewer' });
  if (phase !== 'red' && s.type !== 'refactor') s.red_approved_by = 'reviewer';
  return m;
}

// ── nothing in progress ──────────────────────────────────────────
test('next: a ready slice is started by anyone', () => {
  const r = nextSteps(base(), []);
  assert.equal(first(r).who, 'anyone');
  assert.match(first(r).command, /ppc start SL-001/);
});

test('next: with nothing ready, the human approves the first planned slice whose dependencies are done', () => {
  const m = base();
  const s = slice(m, 'SL-001');
  Object.assign(s, { status: 'done' });
  const r = nextSteps(m, []);
  assert.equal(first(r).who, 'human');
  assert.match(first(r).command, /^ppc approve SL-002$/);
});

test('next: it never proposes approving a slice whose dependencies are unfinished, even if it comes first', () => {
  const m = base();
  slice(m, 'SL-001').status = 'planned';
  delete slice(m, 'SL-001').approved_by;
  slice(m, 'SL-001').depends_on = ['SL-002']; // first by id, but it waits for SL-002
  slice(m, 'SL-002').depends_on = [];
  assert.match(first(nextSteps(m, [])).command, /ppc approve SL-002/);
});

test('next: slices that wait on unfinished work are reported as blocked, with what they wait for', () => {
  const m = base();
  slice(m, 'SL-001').status = 'planned';
  delete slice(m, 'SL-001').approved_by;
  const r = nextSteps(m, []);
  assert.match(first(r).command, /ppc approve SL-001/);
  assert.ok(r.blocked.some((b) => b.slice === 'SL-002' && b.waits_for.includes('SL-001')));
});

test('next: when every slice is done, it says so', () => {
  const m = base();
  for (const { data } of m.slices) data.status = 'done';
  const r = nextSteps(m, []);
  assert.match(r.headline, /every slice is done/i);
  assert.deepEqual(r.actions.filter((a) => a.command.includes('start')), []);
});

// ── a slice in progress: the phase and the git history decide ─────
test('next: red phase with no red commit yet is the agent\'s turn', () => {
  const r = nextSteps(inProgress(base(), 'SL-002', 'red'), []);
  assert.equal(first(r).who, 'agent');
  assert.match(first(r).command, /pp-red/);
});

test('next: red phase with a red commit is the human\'s turn to read and approve the tests', () => {
  const r = nextSteps(inProgress(base(), 'SL-002', 'red'), ['red(SL-002): create a task', 'chore: start']);
  assert.equal(first(r).who, 'human');
  assert.match(first(r).command, /^ppc approve$/);
});

test('next: a red commit of another slice does not count', () => {
  const r = nextSteps(inProgress(base(), 'SL-002', 'red'), ['red(SL-001): health']);
  assert.equal(first(r).who, 'agent');
});

test('next: green phase is the agent\'s; once a green commit exists the next step is the audit', () => {
  const m = inProgress(base(), 'SL-002', 'green');
  assert.match(first(nextSteps(m, [])).command, /pp-green/);
  const done = nextSteps(m, ['green(SL-002): it works']);
  assert.equal(first(done).who, 'agent');
  assert.match(first(done).command, /pp-audit/);
  assert.ok(done.actions.some((a) => /ppc refactor/.test(a.command)), 'refactoring is offered as optional');
});

test('next: a refactor slice starts in its refactor phase', () => {
  const m = inProgress(base(), 'SL-008', 'refactor');
  assert.match(first(nextSteps(m, [])).command, /pp-refactor/);
});

test('next: the refactor phase of a work slice leads to the audit once refactoring is committed', () => {
  const m = inProgress(base(), 'SL-002', 'refactor');
  const r = nextSteps(m, ['green(SL-002): x', 'refactor(SL-002): tidy']);
  assert.match(first(r).command, /pp-audit/);
});

// ── what else is waiting, and a broken contract ───────────────────
test('next: debt the AI proposed is listed as waiting for a human, whatever else is happening', () => {
  const r = nextSteps(inProgress(base(), 'SL-002', 'green'), []);
  assert.ok(r.waiting.some((w) => w.who === 'human' && /^ppc approve DEBT-BE-001$/.test(w.command)));
});

test('next: a contract error comes first, because every other step assumes a valid project', () => {
  const m = base();
  slice(m, 'SL-002').depends_on = ['SL-099'];
  const r = nextSteps(m, [], errorsOf(m));
  assert.match(first(r).command, /ppc validate/);
  assert.match(r.headline, /error/i);
});

test('renderNext: names who acts, the exact command, and what else is waiting', () => {
  const text = renderNext(nextSteps(inProgress(base(), 'SL-002', 'red'), ['red(SL-002): x']));
  assert.match(text, /human/i);
  assert.match(text, /ppc approve\b/);
  assert.match(text, /waiting/i);
});

// ── the overview ─────────────────────────────────────────────────
test('overview: counts slices by status, and shows progress per capability', () => {
  const m = base();
  slice(m, 'SL-001').status = 'done';
  const text = overview(m, validateModel(m));
  assert.match(text, /8 slices/);
  assert.match(text, /done 1/);
  assert.match(text, /CAP-001[^\n]*0\/\d/);
});

test('overview: shows open debt per component and the number of contract problems', () => {
  const text = overview(base(), validateModel(base()));
  assert.match(text, /backend[^\n]*proposed 1/);
  assert.match(text, /0 error\(s\), 0 warning\(s\)/);
});

test('overview: says which slice is in progress and in which phase', () => {
  const text = overview(inProgress(base(), 'SL-002', 'green'), []);
  assert.match(text, /SL-002[^\n]*green/);
});

// ── a design with no slices yet ──────────────────────────────────
const designOnly = () => {
  const m = base();
  m.slices = [];
  m.debt = [];
  m.changeRequests = []; // the example's request was raised by a slice that is gone
  return m;
};

test('next: a design with no slices is not a contract error: the next step is to plan the slices', () => {
  const m = designOnly();
  const r = nextSteps(m, [], errorsOf(m)); // T06 fires for every capability, because nothing is planned
  assert.ok(errorsOf(m).some((e) => e.rule === 'T06'));
  assert.match(r.headline, /no slices/i);
  assert.equal(first(r).who, 'agent');
  assert.match(first(r).command, /pp-plan/);
});

test('next: but a real error in a design with no slices still comes first', () => {
  const m = designOnly();
  m.blueprint.data.capabilities[0].priority = 'urgent'; // not allowed by the schema
  const r = nextSteps(m, [], errorsOf(m));
  assert.match(r.headline, /error/i);
});

test('next: additions nobody decided come before planning slices, and are a person\'s turn', () => {
  const m = designOnly();
  const add = (id, what, extra) => ({ id, what, origin: 'tool_added', cost: 'A column and a filter', if_cut: 'Nothing is lost', later: { effort: 'easy', revisit_when: 'After a mistake' }, recommendation: { action: 'cut', reason: 'Not asked for' }, ...extra });
  m.additions = { file: '.architect/additions.yaml', data: { additions: [add('ADD-001', 'Soft delete of tasks', { decision: 'pending' }), add('ADD-002', 'Dark theme', { decision: 'keep', decided_by: 'owner', reason: 'I like it' })] } };
  const r = nextSteps(m, [], errorsOf(m));
  assert.equal(first(r).who, 'human');
  assert.match(first(r).command, /decide-addition/);
  assert.match(first(r).what, /ADD-001/);
  assert.doesNotMatch(first(r).what, /ADD-002/);
  assert.match(first(r).what, /ppc additions/, 'it says where to read them');
  assert.match(first(r).command, /--accept-recommended/);
});

test('next: many undecided additions are summarised as a range, not listed one by one', () => {
  const m = designOnly();
  const add = (n) => ({ id: `ADD-${String(n).padStart(3, '0')}`, what: `Thing ${n}`, origin: 'tool_added', cost: 'A column and a filter', if_cut: 'Nothing is lost', later: { effort: 'easy', revisit_when: 'After a mistake' }, recommendation: { action: 'cut', reason: 'Not asked for' }, decision: 'pending' });
  m.additions = { file: '.architect/additions.yaml', data: { additions: Array.from({ length: 13 }, (_, i) => add(i + 1)) } };
  const what = first(nextSteps(m, [], errorsOf(m))).what;
  assert.match(what, /13 additions \(ADD-001 to ADD-013\)/);
  assert.doesNotMatch(what, /ADD-005/);
});

test('next: cuts that were decided but not applied to the design come before planning slices, and are the agent\'s turn', () => {
  const m = designOnly();
  const add = (id, extra) => ({ id, what: `Thing ${id}`, origin: 'tool_added', cost: 'A column and a filter', if_cut: 'Nothing is lost', later: { effort: 'easy', revisit_when: 'After a mistake' }, recommendation: { action: 'cut', reason: 'Not asked for' }, non_goal: `No ${id}`, ...extra });
  m.additions = { file: '.architect/additions.yaml', data: { additions: [add('ADD-001', { decision: 'cut', decided_by: 'owner' }), add('ADD-003', { decision: 'keep', decided_by: 'owner', reason: 'It stays' })] } };
  const r = nextSteps(m, [], errorsOf(m));
  assert.equal(first(r).who, 'agent');
  assert.match(first(r).command, /pp-design cuts/);
  assert.match(first(r).what, /ADD-001/);
  assert.doesNotMatch(first(r).what, /ADD-003/);
  m.additions.data.additions.shift(); // nothing left to apply: only the kept one
  assert.match(first(nextSteps(m, [], errorsOf(m))).command, /pp-plan/, 'with no cut waiting, the slices are next');
});

// ── installed, but no design yet ─────────────────────────────────
test('next: with no design yet, the person runs the interview and the agent then does the hand-off', () => {
  const r = noDesignNext();
  assert.match(r.headline, /no design/i);
  assert.equal(r.actions[0].who, 'human');
  assert.match(r.actions[0].command, /\/architect\b/);
  assert.equal(r.actions[1].who, 'agent');
  assert.match(r.actions[1].command, /\/pp-design <blueprint file>/);
  assert.deepEqual([r.waiting, r.blocked, r.changes], [[], [], []]);
  const text = renderNext(r);
  assert.match(text, /\[human\]/);
  assert.match(text, /ppc validate --design/);
});

// ── a design change that adds a capability (found in the first real project, CR-0021 and SL-035) ───
test('next: when the only errors are capabilities with no slice, it names /pp-plan for them instead of "fix the errors"', () => {
  const m = base();
  const extra = (n) => ({ id: `CAP-0${n}`, name: `Later thing ${n}`, description: 'A person can do one more thing later.', priority: 'could' });
  m.blueprint.data.capabilities.push(extra(90), extra(91));
  const errors = errorsOf(m);
  assert.deepEqual([...new Set(errors.map((e) => e.rule))], ['T06'], 'the only fault is a capability with no slice');
  const r = nextSteps(m, [], errors);
  assert.equal(first(r).who, 'agent');
  assert.equal(first(r).command, '/pp-plan CAP-090,CAP-091');
  assert.match(r.headline, /2 capabilities have no slice/);
  assert.match(renderNext(r), /\/pp-plan CAP-090,CAP-091/);
});

test('next: any other error next to a missing slice is still "fix the errors"', () => {
  const m = base();
  m.blueprint.data.capabilities.push({ id: 'CAP-090', name: 'Later thing', description: 'A person can do one more thing later.', priority: 'could' });
  const errors = [...errorsOf(m), { rule: 'T01', severity: 'error', file: 'x', message: 'something else' }];
  assert.match(first(nextSteps(m, [], errors)).command, /ppc validate/);
});

// ── debt nobody can pay (found in the first real project: DEBT-UI-026 to 028 after a review, with no slice that touched their component) ───
const stranded = (over = {}) => {
  const m = base();
  const e = m.debt.flatMap((d) => d.data.entries).find((x) => x.id === 'DEBT-FE-001');
  Object.assign(e, { status: 'open', ...over });
  delete e.paid_by;
  for (const s of m.slices) if (['planned', 'ready'].includes(s.data.status)) Object.assign(s.data, { status: 'done' });
  return m;
};
const planFor = (r) => r.waiting.find((w) => /^\/pp-plan DEBT-/.test(w.command));

test('next: open debt that costs something and that no slice still to be built could pay is put to the agent to plan, once, never as the next step', () => {
  const m = stranded();
  const r = nextSteps(m, []);
  const item = planFor(r);
  assert.equal(item.who, 'agent');
  assert.equal(item.command, '/pp-plan DEBT-FE-001');
  assert.match(item.what, /DEBT-FE-001.*frontend.*no slice/);
  assert.ok(r.actions.every((a) => !/pp-plan DEBT/.test(a.command)), 'it holds nothing up');
});

test('next: nothing to plan when a slice still to be built touches the component, when the debt is cheap, or when a closed slice already left it for the person to place', () => {
  const touched = stranded();
  Object.assign(touched.slices.find((s) => s.data.id === 'SL-007').data, { status: 'planned' });
  assert.equal(planFor(nextSteps(touched, [])), undefined, 'SL-007 touches the frontend');
  const cheap = stranded({ cost_of_delay: { level: 'low', rationale: 'It costs nothing today, as far as anyone can tell.' } });
  assert.equal(planFor(nextSteps(cheap, [])), undefined);
  const left = stranded();
  Object.assign(left.slices.find((s) => s.data.id === 'SL-002').data, { audit: { debt_unpaid: [{ id: 'DEBT-FE-001', reason: 'It did not fit the slice' }] } });
  assert.equal(planFor(nextSteps(left, [])), undefined, 'the item that asks for the next slice already says it');
  assert.equal(planFor(nextSteps(base(), [])), undefined, 'a scheduled entry has its slice');
});
