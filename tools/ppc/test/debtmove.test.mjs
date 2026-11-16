import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadProject } from '../src/load.mjs';
import { validateModel } from '../src/validate.mjs';
import { approve, start, scheduleDebt, LifecycleError } from '../src/lifecycle.mjs';
import { askFor } from '../src/decisions.mjs';
import { repo } from './helpers.mjs';

// Found in the first real project. F-D9: DEBT-UI-004 stayed open although an accepted entry covered it, because only a proposed
// entry could be decided. F-D14: a scheduled entry could not move when the owner split the slice that was to pay it.

const fails = (fn, pattern) => assert.throws(fn, (e) => e instanceof LifecycleError && pattern.test(e.message));
const entry = (dir, id) => loadProject(dir).debt.flatMap((d) => d.data.entries).find((e) => e.id === id);
const slice = (dir, id) => loadProject(dir).slices.find((s) => s.data.id === id).data;
const errors = (dir) => validateModel(loadProject(dir)).filter((f) => f.severity === 'error');
const commandsOf = (ask) => ask.questions[0].options.filter((o) => o.label.includes(' — ppc ')).map((o) => o.label.split(' — ').at(-1));

test('an open debt entry can still be dropped or accepted by a person, with the reason recorded', (t) => {
  const r = repo(t);
  approve(r.dir, 'DEBT-BE-001', { by: 'owner' });
  approve(r.dir, 'DEBT-BE-001', { by: 'owner', drop: true, reason: 'covered by a later entry that was accepted' });
  assert.deepEqual([entry(r.dir, 'DEBT-BE-001').status, entry(r.dir, 'DEBT-BE-001').dropped_reason], ['dropped', 'covered by a later entry that was accepted']);
  const other = repo(t);
  approve(other.dir, 'DEBT-BE-001', { by: 'owner' });
  approve(other.dir, 'DEBT-BE-001', { by: 'owner', accept: 'the list stays short in practice' });
  assert.equal(entry(other.dir, 'DEBT-BE-001').status, 'accepted');
  fails(() => approve(other.dir, 'DEBT-BE-001', { by: 'owner', drop: true }), /accepted/);
  const again = repo(t);
  approve(again.dir, 'DEBT-BE-001', { by: 'owner' });
  fails(() => approve(again.dir, 'DEBT-BE-001', { by: 'owner' }), /already open/);
  assert.deepEqual(errors(again.dir), []);
});

test('ask: an open entry offers to live with it or drop it', (t) => {
  const r = repo(t);
  approve(r.dir, 'DEBT-BE-001', { by: 'owner' });
  assert.deepEqual(commandsOf(askFor(loadProject(r.dir), 'DEBT-BE-001')), ['ppc approve DEBT-BE-001 --accept "accepted in the panel"', 'ppc approve DEBT-BE-001 --drop --reason "dropped in the panel"']);
});

test('schedule-debt: a scheduled entry moves to another slice while the first one has not started', (t) => {
  const r = repo(t);
  approve(r.dir, 'DEBT-BE-001', { by: 'owner', payIn: 'SL-004' });
  assert.deepEqual(scheduleDebt(r.dir, 'DEBT-BE-001', 'SL-006'), { debt: 'DEBT-BE-001', slice: 'SL-006', status: 'scheduled', moved_from: 'SL-004' });
  assert.equal(entry(r.dir, 'DEBT-BE-001').paid_by, 'SL-006');
  assert.equal(slice(r.dir, 'SL-004').pays, undefined, 'the first slice no longer says it pays it');
  assert.deepEqual(slice(r.dir, 'SL-006').pays, ['DEBT-BE-001']);
  assert.deepEqual(errors(r.dir), []);
  const ask = askFor(loadProject(r.dir), 'DEBT-BE-001', { payIn: 'SL-005' });
  assert.match(ask.questions[0].question, /Move DEBT-BE-001 .* from SL-006 to SL-005/);
  assert.deepEqual(commandsOf(ask), ['ppc schedule-debt DEBT-BE-001 --slice SL-005']);
});

test('schedule-debt: it does not move from a slice already started, nor leave a refactor slice paying nothing', (t) => {
  const r = repo(t);
  approve(r.dir, 'DEBT-BE-001', { by: 'owner', payIn: 'SL-004' });
  const file = '.sddpp/slices/SL-004-reject-invalid-titles.md';
  r.write({ [file]: readFileSync(join(r.dir, file), 'utf8').replace(/^status: planned$/m, 'status: in_progress\nphase: build\nmode: light\napproved_by: owner'), '.sddpp/active.json': JSON.stringify({ slice: 'SL-004', phase: 'build' }) });
  fails(() => scheduleDebt(r.dir, 'DEBT-BE-001', 'SL-006'), /SL-004 is in_progress/);
  const fe = repo(t); // DEBT-FE-001 is the only debt SL-008 (a refactor slice) pays
  fails(() => scheduleDebt(fe.dir, 'DEBT-FE-001', 'SL-004'), /SL-008 is a refactor slice and pays nothing else/);
});
