import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadProject } from '../src/load.mjs';
import { validateModel } from '../src/validate.mjs';
import { checkGit } from '../src/gitcheck.mjs';
import { approve, start, stop, scheduleDebt, LifecycleError } from '../src/lifecycle.mjs';
import { CLI, lines, repo } from './helpers.mjs';

// Found in the first real project. F-D13: a refactor slice that pays test debt (no test opened the real window) was blocked from
// adding the very tests it existed to add, and undoing its start took git in a terminal. F-D11: a refactor slice that lists the debt
// it pays could not have that debt scheduled, since the schema wants `pays` and T10 wants the debt scheduled first.

const fails = (fn, pattern) => assert.throws(fn, (e) => e instanceof LifecycleError && pattern.test(e.message));
const read = (dir, rel) => readFileSync(join(dir, rel), 'utf8');
const slice = (dir, id) => loadProject(dir).slices.find((s) => s.data.id === id).data;
const active = (dir) => JSON.parse(read(dir, '.sddpp/active.json'));
const SL008 = '.sddpp/slices/SL-008-share-validation-rules.md';

/** SL-008, the example's refactor slice paying DEBT-FE-001, made to wait for nothing; with `kind` the debt's kind. */
function refactorSlice(t, kind) {
  const r = repo(t);
  r.write({
    [SL008]: read(r.dir, SL008).replace(/^depends_on: .*\n/m, ''),
    '.sddpp/debt.yaml': read(r.dir, '.sddpp/debt.yaml').replace(/(id: DEBT-FE-001[\s\S]*?kind: )duplication/, `$1${kind}`),
  });
  r.git('add', '-A');
  r.git('commit', '-q', '-m', `SL-008 waits for nothing; DEBT-FE-001 is ${kind} debt`);
  approve(r.dir, 'SL-008', { by: 'owner' });
  return r;
}

test('start: a refactor slice whose debt is all test debt opens the tests; any other keeps them locked', (t) => {
  const tests = refactorSlice(t, 'test');
  start(tests.dir, 'SL-008');
  assert.deepEqual(active(tests.dir), { slice: 'SL-008', phase: 'refactor', tests_open: true });
  const structure = refactorSlice(t, 'duplication');
  start(structure.dir, 'SL-008');
  assert.deepEqual(active(structure.dir), { slice: 'SL-008', phase: 'refactor' });
});

test('C02: the refactor commits of a slice that pays test debt may touch tests; of any other they may not', (t) => {
  for (const [kind, expected] of [['test', []], ['duplication', ['C02']]]) {
    const r = refactorSlice(t, kind);
    const sha = r.commit('refactor(SL-008): the tests the debt asked for', { 'tests/rules.test.js': lines(5) });
    const model = loadProject(r.dir);
    const s = model.slices.find((x) => x.data.id === 'SL-008').data;
    Object.assign(s, { status: 'done', audit: { commits: [{ sha, kind: 'refactor' }], production_lines: 0, test_lines: 5, tests_added: 1, mutation_score: null, decisions: [], debt_created: [], deviations: [] } });
    assert.deepEqual(checkGit(model, r.dir).map((f) => f.rule).filter((x) => x === 'C02'), expected, kind);
  }
});

test('schedule-debt: a planned refactor slice that already lists the debt in pays gets it scheduled (F-D11)', (t) => {
  const r = repo(t);
  approve(r.dir, 'DEBT-BE-001', { by: 'owner' });
  r.write({ [SL008]: read(r.dir, SL008).replace(/^pays: \[DEBT-FE-001\]$/m, 'pays: [DEBT-FE-001, DEBT-BE-001]') });
  assert.ok(validateModel(loadProject(r.dir)).some((f) => f.rule === 'T10'), 'the plan as written is invalid until the debt is scheduled');
  assert.deepEqual(scheduleDebt(r.dir, 'DEBT-BE-001', 'SL-008'), { debt: 'DEBT-BE-001', slice: 'SL-008', status: 'scheduled' });
  assert.deepEqual(slice(r.dir, 'SL-008').pays, ['DEBT-FE-001', 'DEBT-BE-001'], 'listed once');
  assert.deepEqual(validateModel(loadProject(r.dir)).filter((f) => f.severity === 'error'), []);
});

test('schedule-debt: any other error still stops it', (t) => {
  const r = repo(t);
  approve(r.dir, 'DEBT-BE-001', { by: 'owner' });
  r.write({ [SL008]: read(r.dir, SL008).replace(/^pays: \[DEBT-FE-001\]$/m, 'pays: [DEBT-FE-001, DEBT-BE-001]').replace(/^components: \[.*\]$/m, 'components: [frontend, nowhere]') });
  fails(() => scheduleDebt(r.dir, 'DEBT-BE-001', 'SL-008'), /invalid/);
});

test('stop: a slice started by mistake goes back to ready while it has no commits of its own', (t) => {
  const r = refactorSlice(t, 'test');
  start(r.dir, 'SL-008');
  assert.deepEqual(stop(r.dir, 'SL-008'), { slice: 'SL-008', status: 'ready' });
  assert.equal(slice(r.dir, 'SL-008').status, 'ready');
  assert.equal(slice(r.dir, 'SL-008').phase, undefined);
  assert.deepEqual(active(r.dir), { slice: null, phase: null });
  assert.deepEqual(validateModel(loadProject(r.dir)).filter((f) => f.severity === 'error'), []);
  fails(() => stop(r.dir, 'SL-008'), /not in progress/);
  start(r.dir, 'SL-008');
  r.commit('refactor(SL-008): the tests', { 'tests/rules.test.js': lines(5) });
  fails(() => stop(r.dir, 'SL-008'), /SL-008 already has commits/);
  const cli = spawnSync('node', [CLI, 'stop', 'SL-008', r.dir], { encoding: 'utf8' });
  assert.equal(cli.status, 1, 'and the command says so');
});

test('L03: active.json may open the tests only for a refactor slice that pays test debt alone', (t) => {
  const r = refactorSlice(t, 'duplication');
  start(r.dir, 'SL-008');
  r.write({ '.sddpp/active.json': JSON.stringify({ slice: 'SL-008', phase: 'refactor', tests_open: true }) });
  assert.ok(validateModel(loadProject(r.dir)).some((f) => f.rule === 'L03' && /opens the tests/.test(f.message)));
});
