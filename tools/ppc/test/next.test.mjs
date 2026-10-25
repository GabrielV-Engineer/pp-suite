import test from 'node:test';
import assert from 'node:assert/strict';
import { loadProject } from '../src/load.mjs';
import { validateModel } from '../src/validate.mjs';
import { nextSteps, overview, renderNext } from '../src/next.mjs';
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
  assert.match(first(r).command, /ppc approve-slice SL-002 --by/);
});

test('next: it never proposes approving a slice whose dependencies are unfinished, even if it comes first', () => {
  const m = base();
  slice(m, 'SL-001').status = 'planned';
  delete slice(m, 'SL-001').approved_by;
  slice(m, 'SL-001').depends_on = ['SL-002']; // first by id, but it waits for SL-002
  slice(m, 'SL-002').depends_on = [];
  assert.match(first(nextSteps(m, [])).command, /approve-slice SL-002/);
});

test('next: slices that wait on unfinished work are reported as blocked, with what they wait for', () => {
  const m = base();
  slice(m, 'SL-001').status = 'planned';
  delete slice(m, 'SL-001').approved_by;
  const r = nextSteps(m, []);
  assert.match(first(r).command, /ppc approve-slice SL-001/);
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
  assert.match(first(r).command, /sddpp-cycle-red/);
});

test('next: red phase with a red commit is the human\'s turn to read and approve the tests', () => {
  const r = nextSteps(inProgress(base(), 'SL-002', 'red'), ['red(SL-002): create a task', 'chore: start']);
  assert.equal(first(r).who, 'human');
  assert.match(first(r).command, /ppc approve-red --by/);
});

test('next: a red commit of another slice does not count', () => {
  const r = nextSteps(inProgress(base(), 'SL-002', 'red'), ['red(SL-001): health']);
  assert.equal(first(r).who, 'agent');
});

test('next: green phase is the agent\'s; once a green commit exists the next step is the audit', () => {
  const m = inProgress(base(), 'SL-002', 'green');
  assert.match(first(nextSteps(m, [])).command, /sddpp-cycle-green/);
  const done = nextSteps(m, ['green(SL-002): it works']);
  assert.equal(first(done).who, 'agent');
  assert.match(first(done).command, /sddpp-cycle-audit/);
  assert.ok(done.actions.some((a) => /ppc refactor/.test(a.command)), 'refactoring is offered as optional');
});

test('next: a refactor slice starts in its refactor phase', () => {
  const m = inProgress(base(), 'SL-008', 'refactor');
  assert.match(first(nextSteps(m, [])).command, /sddpp-cycle-refactor/);
});

test('next: the refactor phase of a work slice leads to the audit once refactoring is committed', () => {
  const m = inProgress(base(), 'SL-002', 'refactor');
  const r = nextSteps(m, ['green(SL-002): x', 'refactor(SL-002): tidy']);
  assert.match(first(r).command, /sddpp-cycle-audit/);
});

// ── what else is waiting, and a broken contract ───────────────────
test('next: debt the AI proposed is listed as waiting for a human, whatever else is happening', () => {
  const r = nextSteps(inProgress(base(), 'SL-002', 'green'), []);
  assert.ok(r.waiting.some((w) => w.who === 'human' && /ppc approve-debt DEBT-BE-001 --by/.test(w.command)));
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
  assert.match(text, /ppc approve-red --by/);
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
