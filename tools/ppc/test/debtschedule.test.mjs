import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadProject } from '../src/load.mjs';
import { validateModel } from '../src/validate.mjs';
import { approveDebt, scheduleDebt, LifecycleError } from '../src/lifecycle.mjs';
import { CLI, repo } from './helpers.mjs';

const fails = (fn, pattern) => assert.throws(fn, (e) => e instanceof LifecycleError && pattern.test(e.message));
const read = (dir, rel) => readFileSync(join(dir, rel), 'utf8');
const entry = (dir, id) => loadProject(dir).debt.flatMap((d) => d.data.entries).find((e) => e.id === id);
const slice = (dir, id) => loadProject(dir).slices.find((s) => s.data.id === id).data;
const errors = (dir) => validateModel(loadProject(dir)).filter((f) => f.severity === 'error');

// DEBT-BE-001 belongs to the backend; SL-008 is the planned refactor slice (frontend and backend).
const opened = (t) => {
  const r = repo(t);
  approveDebt(r.dir, 'DEBT-BE-001', { by: 'reviewer' });
  return r;
};

test('schedule: an open debt is assigned to a planned refactor slice, and both files say so', (t) => {
  const { dir } = opened(t);
  assert.deepEqual(scheduleDebt(dir, 'DEBT-BE-001', 'SL-008'), { debt: 'DEBT-BE-001', slice: 'SL-008', status: 'scheduled' });
  assert.equal(entry(dir, 'DEBT-BE-001').status, 'scheduled');
  assert.equal(entry(dir, 'DEBT-BE-001').paid_by, 'SL-008');
  assert.deepEqual(slice(dir, 'SL-008').pays.sort(), ['DEBT-BE-001', 'DEBT-FE-001']);
  assert.deepEqual(errors(dir), []);
});

test('schedule: no other entry of the register changes, and this one changes only its status and paid_by', (t) => {
  const { dir } = opened(t);
  const blocks = (text) => text.split(/\n(?=  - id: )/);
  const before = blocks(read(dir, '.sddpp/debt.yaml'));
  scheduleDebt(dir, 'DEBT-BE-001', 'SL-008');
  const after = blocks(read(dir, '.sddpp/debt.yaml'));
  assert.equal(after.length, before.length);
  const changed = after.map((block, i) => [before[i], block]).filter(([x, y]) => x !== y);
  assert.equal(changed.length, 1);
  const [old, now] = changed[0];
  assert.ok(old.startsWith('  - id: DEBT-BE-001') || old.includes('DEBT-BE-001'));
  const oldLines = old.split('\n');
  const newLines = now.split('\n');
  assert.deepEqual(oldLines.filter((l) => !newLines.includes(l)), ['    status: open']);
  assert.deepEqual(newLines.filter((l) => !oldLines.includes(l)).sort(), ['    paid_by: SL-008', '    status: scheduled']);
});

test('schedule: a debt nobody approved is not scheduled, since the person has not said it is worth paying', (t) => {
  const { dir } = repo(t);
  fails(() => scheduleDebt(dir, 'DEBT-BE-001', 'SL-008'), /approved|open/);
});

test('schedule: only a refactor slice pays debt, and the message says what to do for a feature slice', (t) => {
  const { dir } = opened(t);
  fails(() => scheduleDebt(dir, 'DEBT-BE-001', 'SL-004'), /refactor slice/i);
  fails(() => scheduleDebt(dir, 'DEBT-BE-001', 'SL-099'), /unknown slice/);
  fails(() => scheduleDebt(dir, 'DEBT-BE-099', 'SL-008'), /unknown debt/);
});

test('schedule: a slice that is not planned or ready is refused', (t) => {
  const { dir } = opened(t);
  const file = '.sddpp/slices/SL-008-share-validation-rules.md';
  const original = read(dir, file);
  writeFileSync(join(dir, file), original.replace('status: planned', 'status: dropped'));
  fails(() => scheduleDebt(dir, 'DEBT-BE-001', 'SL-008'), /planned or ready/);
});

test('schedule: a slice that does not touch the component of the debt is refused', (t) => {
  const { dir } = opened(t);
  const file = '.sddpp/slices/SL-008-share-validation-rules.md';
  writeFileSync(join(dir, file), read(dir, file).replace(/components: \[.*\]/, 'components: [frontend]'));
  fails(() => scheduleDebt(dir, 'DEBT-BE-001', 'SL-008'), /does not touch backend/);
});

test('schedule: twice is refused, and a refusal changes nothing', (t) => {
  const { dir } = opened(t);
  scheduleDebt(dir, 'DEBT-BE-001', 'SL-008');
  const before = read(dir, '.sddpp/debt.yaml');
  fails(() => scheduleDebt(dir, 'DEBT-BE-001', 'SL-008'), /open/);
  assert.equal(read(dir, '.sddpp/debt.yaml'), before);
});

test('CLI: schedule-debt', (t) => {
  const { dir } = opened(t);
  const out = spawnSync(process.execPath, [CLI, 'schedule-debt', 'DEBT-BE-001', '--slice', 'SL-008', dir], { encoding: 'utf8' });
  assert.equal(out.status, 0, out.stderr);
  assert.equal(entry(dir, 'DEBT-BE-001').paid_by, 'SL-008');
});
