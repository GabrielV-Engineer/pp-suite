import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadProject } from '../src/load.mjs';
import { validateModel } from '../src/validate.mjs';
import { approve, start, finish, scheduleDebt, LifecycleError } from '../src/lifecycle.mjs';
import { nextSteps } from '../src/next.mjs';
import { lines, repo } from './helpers.mjs';

// Found in the first real project (F-P2): three debt entries were meant for SL-010, a feature slice, and it closed without paying
// them or saying so. A feature slice that pays debt now accounts for each entry when it closes: paid, or not paid and why. What it
// did not pay is open again, and W09 says nothing pays it now.

const fails = (fn, pattern) => assert.throws(fn, (e) => e instanceof LifecycleError && pattern.test(e.message));
const read = (dir, rel) => readFileSync(join(dir, rel), 'utf8');
const debt = (dir, id) => loadProject(dir).debt.flatMap((d) => d.data.entries).find((e) => e.id === id);
const slice = (dir, id) => loadProject(dir).slices.find((s) => s.data.id === id).data;
const findings = (dir, rule) => validateModel(loadProject(dir)).filter((f) => f.rule === rule);
const errors = (dir) => validateModel(loadProject(dir)).filter((f) => f.severity === 'error');
const SL002 = '.sddpp/slices/SL-002-create-and-list-tasks.md';

/** SL-002, a light feature slice on the backend, approved to pay DEBT-BE-001 (a backend entry), started and built. */
function building(t) {
  const r = repo(t);
  r.write({
    '.architect/blueprint.yaml': read(r.dir, '.architect/blueprint.yaml').replace('budgets:', 'default_mode: light\nbudgets:'),
    [SL002]: read(r.dir, SL002).replace(/^depends_on: .*\n/m, ''),
  });
  r.git('add', '-A');
  r.git('commit', '-q', '-m', 'light, and SL-002 waits for nothing');
  approve(r.dir, 'DEBT-BE-001', { by: 'owner', payIn: 'SL-002' });
  approve(r.dir, 'SL-002', { by: 'owner' });
  start(r.dir, 'SL-002');
  const sha = r.commit('build(SL-002): create and list tasks, with pagination', { 'src/tasks.js': lines(8), 'tests/tasks.test.js': lines(4) });
  return { ...r, audit: { commits: [{ sha, kind: 'build' }], tests_added: 1 } };
}

test('finish: a feature slice that pays debt does not close until it says, entry by entry, whether it paid it', (t) => {
  const r = building(t);
  const before = read(r.dir, SL002);
  fails(() => finish(r.dir, 'SL-002', r.audit), /SL-002 pays DEBT-BE-001.*"debt_paid".*"debt_unpaid"/s);
  assert.equal(read(r.dir, SL002), before, 'nothing changed');
  fails(() => finish(r.dir, 'SL-002', { ...r.audit, debt_paid: ['DEBT-BE-001'], debt_unpaid: [{ id: 'DEBT-BE-001', reason: 'both at once is not an account' }] }), /DEBT-BE-001 is both paid and unpaid/);
  fails(() => finish(r.dir, 'SL-002', { ...r.audit, debt_paid: ['DEBT-BE-001', 'DEBT-DB-001'] }), /SL-002 does not pay DEBT-DB-001/);
  fails(() => finish(r.dir, 'SL-002', { ...r.audit, debt_unpaid: [{ id: 'DEBT-BE-001', reason: 'short' }] }), /reason/);
  assert.equal(slice(r.dir, 'SL-002').status, 'in_progress');
});

test('finish: debt the slice paid is paid, and the audit says so', (t) => {
  const r = building(t);
  finish(r.dir, 'SL-002', { ...r.audit, debt_paid: ['DEBT-BE-001'] });
  assert.equal(debt(r.dir, 'DEBT-BE-001').status, 'paid');
  assert.deepEqual(slice(r.dir, 'SL-002').audit.debt_paid, ['DEBT-BE-001']);
  assert.deepEqual(errors(r.dir), []);
  assert.deepEqual(findings(r.dir, 'W09'), []);
});

test('finish: debt the slice did not pay is open again, tied to no slice, and the audit keeps why', (t) => {
  const r = building(t);
  const reason = 'the pagination did not fit the budget of this slice';
  finish(r.dir, 'SL-002', { ...r.audit, debt_unpaid: [{ id: 'DEBT-BE-001', reason }] });
  const e = debt(r.dir, 'DEBT-BE-001');
  assert.deepEqual([e.status, e.paid_by], ['open', undefined]);
  assert.deepEqual(slice(r.dir, 'SL-002').pays, ['DEBT-BE-001'], 'the slice keeps what it was to pay');
  assert.deepEqual(slice(r.dir, 'SL-002').audit.debt_unpaid, [{ id: 'DEBT-BE-001', reason }]);
  assert.deepEqual(errors(r.dir), []);
});

test('W09: debt a closed slice left unpaid is flagged until a slice is to pay it again, or a person stops it being open', (t) => {
  const r = building(t);
  finish(r.dir, 'SL-002', { ...r.audit, debt_unpaid: [{ id: 'DEBT-BE-001', reason: 'the pagination did not fit the budget of this slice' }] });
  const found = findings(r.dir, 'W09');
  assert.equal(found.length, 1);
  assert.equal(found[0].severity, 'warning');
  assert.match(found[0].message, /DEBT-BE-001 was to be paid by SL-002, which closed without it \(the pagination did not fit/);
  assert.match(found[0].message, /ppc ask DEBT-BE-001 --pay-in/);
  const dropped = loadProject(r.dir);
  dropped.debt[0].data.entries.find((x) => x.id === 'DEBT-BE-001').status = 'accepted';
  assert.ok(!validateModel(dropped).some((f) => f.rule === 'W09'), 'an entry no longer open is not flagged');
  scheduleDebt(r.dir, 'DEBT-BE-001', 'SL-004');
  assert.deepEqual(findings(r.dir, 'W09'), [], 'scheduled again: SL-004 is to pay it');
});

test('finish: a refactor or fix slice still pays what it was scheduled to pay with no account, and may say it did not', (t) => {
  // the example's SL-008 is a refactor slice paying DEBT-FE-001; it closes as before (tested in the refactor tests). Here only the
  // account: an entry a refactor slice names as unpaid is open again too.
  const r = repo(t);
  const file = '.sddpp/slices/SL-008-share-validation-rules.md';
  r.write({ [file]: read(r.dir, file).replace(/^depends_on: .*\n/m, '') });
  r.git('add', '-A');
  r.git('commit', '-q', '-m', 'SL-008 waits for nothing');
  approve(r.dir, 'SL-008', { by: 'owner' });
  start(r.dir, 'SL-008');
  const sha = r.commit('refactor(SL-008): share the title rules', { 'src/rules.js': lines(3) });
  finish(r.dir, 'SL-008', { commits: [{ sha, kind: 'refactor' }], tests_added: 0, debt_unpaid: [{ id: 'DEBT-FE-001', reason: 'the form keeps its own copy for now' }] });
  assert.equal(debt(r.dir, 'DEBT-FE-001').status, 'open');
  assert.equal(findings(r.dir, 'W09').length, 1);
});

test('next: debt a closed slice left unpaid waits for the person, with the question that ties it to a slice again', (t) => {
  const r = building(t);
  finish(r.dir, 'SL-002', { ...r.audit, debt_unpaid: [{ id: 'DEBT-BE-001', reason: 'the pagination did not fit the budget of this slice' }] });
  const item = nextSteps(loadProject(r.dir), []).waiting.find((w) => w.what.includes('DEBT-BE-001'));
  assert.ok(item, 'it is listed');
  assert.match(item.what, /SL-002 closed without paying DEBT-BE-001/);
  assert.match(item.command, /^ppc ask DEBT-BE-001 --pay-in <slice>$/);
  scheduleDebt(r.dir, 'DEBT-BE-001', 'SL-004');
  assert.ok(!nextSteps(loadProject(r.dir), []).waiting.some((w) => w.what.includes('DEBT-BE-001')), 'and not once a slice is to pay it');
});
