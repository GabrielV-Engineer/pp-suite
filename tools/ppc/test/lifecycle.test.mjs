import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadProject } from '../src/load.mjs';
import { validateModel } from '../src/validate.mjs';
import { checkGit } from '../src/gitcheck.mjs';
import { start, approveSlice, approveRed, approveDebt, toRefactor, finish, mutate, status, initialPhase, LifecycleError } from '../src/lifecycle.mjs';
import { CLI, lines, repo } from './helpers.mjs';

const read = (dir, rel) => readFileSync(join(dir, rel), 'utf8');
const slice = (dir, id) => loadProject(dir).slices.find((s) => s.data.id === id).data;
const active = (dir) => JSON.parse(read(dir, '.sddpp/active.json'));
const RED = { 'tests/health.test.js': lines(3) };
const GREEN = { 'src/health.js': lines(5) };
const fails = (fn, pattern) => assert.throws(fn, (e) => e instanceof LifecycleError && pattern.test(e.message));

/** After a transition the project must still be valid. */
function assertConsistent(dir) {
  const model = loadProject(dir);
  assert.deepEqual(validateModel(model).filter((f) => f.severity === 'error'), []);
}

// ── start ────────────────────────────────────────────────────────
test('initialPhase: work slices start in red, refactors in refactor, spikes stay unlocked', () => {
  assert.equal(initialPhase('feature'), 'red');
  assert.equal(initialPhase('skeleton'), 'red');
  assert.equal(initialPhase('fix'), 'red');
  assert.equal(initialPhase('refactor'), 'refactor');
  assert.equal(initialPhase('spike'), 'red');
});

test('start: a ready slice goes in progress in the red phase', (t) => {
  const { dir } = repo(t);
  assert.deepEqual(start(dir, 'SL-001'), { slice: 'SL-001', phase: 'red' });
  assert.equal(slice(dir, 'SL-001').status, 'in_progress');
  assert.equal(slice(dir, 'SL-001').phase, 'red');
  assert.deepEqual(active(dir), { slice: 'SL-001', phase: 'red' });
  assertConsistent(dir);
});

test('start keeps the slice body and the other frontmatter fields untouched', (t) => {
  const { dir } = repo(t);
  const file = '.sddpp/slices/SL-001-deployable-skeleton.md';
  const before = read(dir, file);
  start(dir, 'SL-001');
  const after = read(dir, file);
  assert.equal(after.split('\n---\n')[1], before.split('\n---\n')[1], 'body changed');
  for (const line of ['id: SL-001', 'title: Deployable end-to-end skeleton', 'approved_by: example-owner']) assert.ok(after.includes(line), line);
});

test('start only changes the lines it means to: flow lists keep their formatting', (t) => {
  const { dir } = repo(t);
  const file = '.sddpp/slices/SL-001-deployable-skeleton.md';
  const before = read(dir, file).split('\n');
  start(dir, 'SL-001');
  const after = read(dir, file).split('\n');
  const removed = before.filter((line) => !after.includes(line));
  const added = after.filter((line) => !before.includes(line));
  assert.deepEqual(removed, ['status: ready']);
  assert.deepEqual(added.sort(), ['mode: strict', 'phase: red', 'status: in_progress']);
});

test('start refuses what is not allowed', (t) => {
  const { dir } = repo(t);
  fails(() => start(dir, 'SL-099'), /unknown slice/);
  fails(() => start(dir, 'SL-002'), /planned/); // not approved yet
  start(dir, 'SL-001');
  fails(() => start(dir, 'SL-001'), /in_progress/);
});

test('start refuses a slice whose dependencies are not done, and a second slice in progress', (t) => {
  const { dir } = repo(t);
  const file = join(dir, '.sddpp/slices/SL-002-create-and-list-tasks.md');
  writeFileSync(file, readFileSync(file, 'utf8').replace('status: planned', 'status: ready\napproved_by: example-owner'));
  fails(() => start(dir, 'SL-002'), /depends on unfinished SL-001/);
  start(dir, 'SL-001');
  fails(() => start(dir, 'SL-002'), /in progress/);
});

// ── approve-slice ────────────────────────────────────────────────
test('approve-slice: a planned slice becomes ready, with the approver recorded', (t) => {
  const { dir } = repo(t);
  assert.deepEqual(approveSlice(dir, 'SL-002', 'reviewer'), { slice: 'SL-002', status: 'ready' });
  assert.equal(slice(dir, 'SL-002').status, 'ready');
  assert.equal(slice(dir, 'SL-002').approved_by, 'reviewer');
  assertConsistent(dir);
});

test('approve-slice refuses without a name, for an unknown slice and for one that is not planned', (t) => {
  const { dir } = repo(t);
  fails(() => approveSlice(dir, 'SL-002', ''), /--by/);
  fails(() => approveSlice(dir, 'SL-099', 'reviewer'), /unknown slice/);
  fails(() => approveSlice(dir, 'SL-001', 'reviewer'), /ready/); // already ready
  assert.equal(slice(dir, 'SL-002').status, 'planned');
});

test('approve-slice does not start anything, and the approved slice can then be started', (t) => {
  const { dir } = repo(t);
  start(dir, 'SL-001');
  approveSlice(dir, 'SL-002', 'reviewer');
  assert.deepEqual(active(dir), { slice: 'SL-001', phase: 'red' });
  fails(() => start(dir, 'SL-002'), /in progress|unfinished/); // still gated by one-at-a-time and dependencies
});

// ── approve-debt ─────────────────────────────────────────────────
const debtEntry = (dir, id) => loadProject(dir).debt.flatMap((d) => d.data.entries).find((e) => e.id === id);

test('approve-debt: a proposed entry becomes open, with the approver recorded', (t) => {
  const { dir } = repo(t);
  assert.deepEqual(approveDebt(dir, 'DEBT-BE-001', { by: 'reviewer' }), { debt: 'DEBT-BE-001', status: 'open' });
  assert.equal(debtEntry(dir, 'DEBT-BE-001').status, 'open');
  assert.equal(debtEntry(dir, 'DEBT-BE-001').approved_by, 'reviewer');
  assertConsistent(dir);
});

test('approve-debt: accepting records the reason, dropping records only the approver', (t) => {
  const a = repo(t);
  approveDebt(a.dir, 'DEBT-BE-001', { by: 'reviewer', accept: 'The list never passes a hundred tasks.' });
  assert.equal(debtEntry(a.dir, 'DEBT-BE-001').status, 'accepted');
  assert.equal(debtEntry(a.dir, 'DEBT-BE-001').accepted_reason, 'The list never passes a hundred tasks.');
  assertConsistent(a.dir);

  const d = repo(t);
  approveDebt(d.dir, 'DEBT-BE-001', { by: 'reviewer', drop: true });
  assert.equal(debtEntry(d.dir, 'DEBT-BE-001').status, 'dropped');
  assert.equal(debtEntry(d.dir, 'DEBT-BE-001').approved_by, 'reviewer');
  assertConsistent(d.dir);
});

test('approve-debt: refuses without a name, for unknown or already decided entries, and for conflicting options', (t) => {
  const { dir } = repo(t);
  fails(() => approveDebt(dir, 'DEBT-BE-001', {}), /--by/);
  fails(() => approveDebt(dir, 'DEBT-BE-999', { by: 'r' }), /unknown debt/);
  fails(() => approveDebt(dir, 'DEBT-FE-001', { by: 'r' }), /only a proposed/);
  fails(() => approveDebt(dir, 'DEBT-BE-001', { by: 'r', accept: 'because we said so', drop: true }), /not both/);
  fails(() => approveDebt(dir, 'DEBT-BE-001', { by: 'r', accept: 'short' }), /reason/);
  assert.equal(debtEntry(dir, 'DEBT-BE-001').status, 'proposed'); // nothing changed
});

test('approve-debt keeps the register as its author wrote it, including the spacing inside { } maps', (t) => {
  const { dir, write } = repo(t);
  const text = read(dir, '.sddpp/debt.yaml').replace('origin:\n      type: slice\n      ref: SL-002', 'origin: { type: slice, ref: SL-002 }');
  assert.match(text, /origin: \{ type: slice, ref: SL-002 \}/);
  write({ '.sddpp/debt.yaml': text });
  approveDebt(dir, 'DEBT-BE-001', { by: 'reviewer' });
  assert.match(read(dir, '.sddpp/debt.yaml'), /origin: \{ type: slice, ref: SL-002 \}/);
});

test('approve-debt keeps the register readable: only the lines of the decided entry change', (t) => {
  const { dir } = repo(t);
  const before = read(dir, '.sddpp/debt.yaml').split('\n');
  approveDebt(dir, 'DEBT-BE-001', { by: 'reviewer' });
  const after = read(dir, '.sddpp/debt.yaml').split('\n');
  assert.deepEqual(before.filter((l) => !after.includes(l)), ['    status: proposed']);
  assert.deepEqual(after.filter((l) => !before.includes(l)).sort(), ['    approved_by: reviewer', '    status: open']);
});

// ── approve-red ──────────────────────────────────────────────────
test('approve-red: needs a name, the red phase and committed tests', (t) => {
  const { dir, commit, write } = repo(t);
  start(dir, 'SL-001');
  fails(() => approveRed(dir, ''), /--by/);

  write(RED); // tests written but not committed
  fails(() => approveRed(dir, 'reviewer'), /uncommitted/);

  commit('red(SL-001): health tests', {});
  assert.deepEqual(approveRed(dir, 'reviewer'), { slice: 'SL-001', phase: 'green' });
  assert.equal(slice(dir, 'SL-001').red_approved_by, 'reviewer');
  assert.deepEqual(active(dir), { slice: 'SL-001', phase: 'green' });
  assertConsistent(dir);
  fails(() => approveRed(dir, 'reviewer'), /not red/);
});

test('approve-red: uncommitted contract bookkeeping does not count as unfinished work', (t) => {
  const { dir, commit, write } = repo(t);
  start(dir, 'SL-001');
  commit('red(SL-001): health tests', RED);
  write({ '.sddpp/notes.md': 'scratch\n' }); // uncommitted, but it is contract bookkeeping, not code
  assert.doesNotThrow(() => approveRed(dir, 'reviewer'));
});

test('approve-red: there must be a slice in progress', (t) => {
  const { dir } = repo(t);
  fails(() => approveRed(dir, 'reviewer'), /no slice is in progress/);
});

// ── refactor ─────────────────────────────────────────────────────
test('refactor: only from green, and only with everything committed', (t) => {
  const { dir, commit } = repo(t);
  start(dir, 'SL-001');
  fails(() => toRefactor(dir), /not green/);
  commit('red', RED);
  approveRed(dir, 'reviewer');
  commit('green', GREEN);
  assert.deepEqual(toRefactor(dir), { slice: 'SL-001', phase: 'refactor' });
  assert.deepEqual(active(dir), { slice: 'SL-001', phase: 'refactor' });
  assertConsistent(dir);
});

// ── finish ───────────────────────────────────────────────────────
function throughGreen(t) {
  const r = repo(t);
  start(r.dir, 'SL-001');
  const red = r.commit('red(SL-001): health tests', RED);
  approveRed(r.dir, 'reviewer');
  const green = r.commit('green(SL-001): health endpoint', GREEN);
  return { ...r, red, green, audit: { commits: [{ sha: red, kind: 'red' }, { sha: green, kind: 'green' }], tests_added: 1 } };
}

test('finish: computes the diff from git, closes the slice and leaves a valid, verified project', (t) => {
  const { dir, audit } = throughGreen(t);
  const result = finish(dir, 'SL-001', audit);
  assert.equal(result.production_lines, 5); // the green commit
  assert.equal(result.test_lines, 3); // the red commit
  const s = slice(dir, 'SL-001');
  assert.equal(s.status, 'done');
  assert.equal(s.phase, undefined);
  assert.equal(s.audit.production_lines, 5);
  assert.equal(s.audit.test_lines, 3);
  assert.equal(s.audit.mutation_score, null);
  assert.deepEqual(active(dir), { slice: null, phase: null });
  assertConsistent(dir);
  assert.deepEqual(checkGit(loadProject(dir), dir), []);
});

test('finish: a refactor slice marks the debt it pays as paid, and nothing else', (t) => {
  const r = repo(t);
  const file = '.sddpp/slices/SL-008-share-validation-rules.md';
  const original = read(r.dir, file);
  r.write({ [file]: original.replace('status: planned', 'status: ready\napproved_by: reviewer').replace('depends_on: [SL-004]', 'depends_on: []') });
  const debtBefore = read(r.dir, '.sddpp/debt.yaml').split('\n');
  assert.equal(start(r.dir, 'SL-008').phase, 'refactor');
  const sha = r.commit('refactor(SL-008): share the rules', { 'src/rules.js': lines(4) });
  finish(r.dir, 'SL-008', { commits: [{ sha, kind: 'refactor' }], tests_added: 0 });
  assert.equal(debtEntry(r.dir, 'DEBT-FE-001').status, 'paid');
  assert.equal(debtEntry(r.dir, 'DEBT-FE-001').paid_by, 'SL-008');
  const debtAfter = read(r.dir, '.sddpp/debt.yaml').split('\n');
  assert.deepEqual(debtBefore.filter((l) => !debtAfter.includes(l)), ['    status: scheduled']); // only the paid entry changes
  assert.deepEqual(debtAfter.filter((l) => !debtBefore.includes(l)), ['    status: paid']);
  assertConsistent(r.dir);
  assert.deepEqual(checkGit(loadProject(r.dir), r.dir), []);
});

test('finish: a feature slice leaves the debt register alone', (t) => {
  const { dir, audit } = throughGreen(t);
  const before = read(dir, '.sddpp/debt.yaml');
  finish(dir, 'SL-001', audit);
  assert.equal(read(dir, '.sddpp/debt.yaml'), before);
});

test('finish: the sizes are never taken from the caller', (t) => {
  const { dir, audit } = throughGreen(t);
  for (const field of ['diff_lines', 'production_lines', 'test_lines']) {
    fails(() => finish(dir, 'SL-001', { ...audit, [field]: 1 }), /computed from git/);
  }
});

// ── finish: the mutation gate ────────────────────────────────────
const survivor = { status: 'Survived', mutatorName: 'BooleanLiteral', replacement: 'true', location: { start: { line: 2, column: 1 }, end: { line: 2, column: 5 } } };
const killed = { status: 'Killed', mutatorName: 'StringLiteral', replacement: '""', location: { start: { line: 1, column: 1 }, end: { line: 1, column: 5 } } };
const mutationReport = (...mutants) => ({ schemaVersion: '1.0', files: { 'src/health.js': { language: 'javascript', source: '', mutants } } });
const neverRun = () => assert.fail('the mutation tool must not run when the blueprint sets no gate');

function withGate(r, min = 0.8) {
  r.write({ '.architect/blueprint.yaml': read(r.dir, '.architect/blueprint.yaml').replace(/(max_slice_production_lines: \d+)/, `$1\n  min_mutation_score: ${min}`) });
  return r;
}

test('finish: without a mutation gate in the blueprint the tool is not run and the score stays null', (t) => {
  const { dir, audit } = throughGreen(t);
  finish(dir, 'SL-001', audit, { mutationRunner: neverRun });
  assert.equal(slice(dir, 'SL-001').audit.mutation_score, null);
});

test('finish: the mutation score is never taken from the caller', (t) => {
  const { dir, audit } = throughGreen(t);
  fails(() => finish(dir, 'SL-001', { ...audit, mutation_score: 1 }), /mutation_score is computed/);
});

test('finish: with a gate it measures the score of the slice files and records it', (t) => {
  const r = withGate(throughGreen(t));
  const seen = [];
  const mutationRunner = (root, files) => (seen.push(files), mutationReport(killed, killed, killed, killed, survivor));
  finish(r.dir, 'SL-001', r.audit, { mutationRunner });
  assert.deepEqual(seen, [['src/health.js']]);
  assert.equal(slice(r.dir, 'SL-001').audit.mutation_score, 0.8);
  assertConsistent(r.dir);
});

test('finish: below the gate it refuses, shows the surviving mutants, and changes nothing', (t) => {
  const r = withGate(throughGreen(t));
  const files = ['.sddpp/slices/SL-001-deployable-skeleton.md', '.sddpp/active.json'];
  const before = files.map((f) => read(r.dir, f));
  fails(() => finish(r.dir, 'SL-001', r.audit, { mutationRunner: () => mutationReport(killed, survivor) }), /0\.5.*0\.8[\s\S]*src\/health\.js:2/);
  assert.deepEqual(files.map((f) => read(r.dir, f)), before);
});

test('finish: below the gate it closes only with a recorded reason', (t) => {
  const r = withGate(throughGreen(t));
  const reason = 'Equivalent mutants in the generated banner.';
  finish(r.dir, 'SL-001', { ...r.audit, mutation_override_reason: reason }, { mutationRunner: () => mutationReport(killed, survivor) });
  const audit = slice(r.dir, 'SL-001').audit;
  assert.equal(audit.mutation_score, 0.5);
  assert.equal(audit.mutation_override_reason, reason);
  assertConsistent(r.dir);
});

// ── mutate: mutation testing on demand ───────────────────────────
test('mutate: the files come from --files or from the audit of a finished slice', (t) => {
  const { dir, audit } = throughGreen(t);
  finish(dir, 'SL-001', audit);
  const seen = [];
  const runner = (root, files) => (seen.push(files), mutationReport(killed, survivor));
  assert.equal(mutate(dir, { slice: 'SL-001' }, runner).score, 0.5);
  assert.equal(mutate(dir, { files: ['src/other.js'] }, runner).files[0], 'src/other.js');
  assert.deepEqual(seen, [['src/health.js'], ['src/other.js']]);
});

test('mutate: refuses without files, with both options, or for a slice that has no audit', (t) => {
  const { dir } = repo(t);
  const never = () => assert.fail('must not run');
  fails(() => mutate(dir, {}, never), /--files <a,b> or --slice/);
  fails(() => mutate(dir, { files: ['a.js'], slice: 'SL-001' }, never), /not both/);
  fails(() => mutate(dir, { slice: 'SL-999' }, never), /unknown slice/);
  fails(() => mutate(dir, { slice: 'SL-001' }, never), /no audit/);
});

test('finish ignores contract bookkeeping when it measures the diff', (t) => {
  const { dir, red, green, write } = throughGreen(t);
  write({ '.sddpp/notes.md': lines(40) });
  assert.equal(finish(dir, 'SL-001', { commits: [{ sha: red, kind: 'red' }, { sha: green, kind: 'green' }], tests_added: 1 }).production_lines, 5);
});

test('finish: rolls everything back when the result would be invalid', (t) => {
  const { dir, audit } = throughGreen(t);
  const files = ['.sddpp/slices/SL-001-deployable-skeleton.md', '.sddpp/active.json'];
  const before = files.map((f) => read(dir, f));
  fails(() => finish(dir, 'SL-001', { ...audit, decisions: ['ADR-0099'] }), /ADR-0099/);
  assert.deepEqual(files.map((f) => read(dir, f)), before);
});

test('finish: refuses an unfinished or unapproved slice and uncommitted work', (t) => {
  const { dir, commit, write } = repo(t);
  fails(() => finish(dir, 'SL-001', { commits: [] }), /not in progress|in_progress/);
  start(dir, 'SL-001');
  const red = commit('red', RED);
  fails(() => finish(dir, 'SL-001', { commits: [{ sha: red, kind: 'red' }], tests_added: 1 }), /red tests were not approved|phase red/i);
  approveRed(dir, 'reviewer');
  write(GREEN);
  fails(() => finish(dir, 'SL-001', { commits: [{ sha: red, kind: 'red' }], tests_added: 1 }), /uncommitted/);
});

test('finish: refuses and rolls back when a green commit weakened the tests (the git backstop)', (t) => {
  const r = repo(t);
  start(r.dir, 'SL-001');
  const red = r.commit('red', RED);
  approveRed(r.dir, 'reviewer');
  const green = r.commit('green', { ...GREEN, 'tests/health.test.js': lines(3) + 'weakened\n' });
  const before = read(r.dir, '.sddpp/slices/SL-001-deployable-skeleton.md');
  fails(() => finish(r.dir, 'SL-001', { commits: [{ sha: red, kind: 'red' }, { sha: green, kind: 'green' }], tests_added: 1 }), /C02/);
  assert.equal(read(r.dir, '.sddpp/slices/SL-001-deployable-skeleton.md'), before);
  assert.deepEqual(active(r.dir), { slice: 'SL-001', phase: 'green' });
});

test('finish: refuses when a test was changed after the red commit by a commit the audit does not list', (t) => {
  const r = repo(t);
  start(r.dir, 'SL-001');
  const red = r.commit('red', RED);
  approveRed(r.dir, 'reviewer');
  const green = r.commit('green', GREEN);
  r.commit('tidy up', { 'tests/health.test.js': lines(3) + 'weakened\n' }); // made after green, never listed
  const before = read(r.dir, '.sddpp/slices/SL-001-deployable-skeleton.md');
  fails(() => finish(r.dir, 'SL-001', { commits: [{ sha: red, kind: 'red' }, { sha: green, kind: 'green' }], tests_added: 1 }), /C06/);
  assert.equal(read(r.dir, '.sddpp/slices/SL-001-deployable-skeleton.md'), before);
});

test('finish: a commit that does not exist rolls back', (t) => {
  const { dir } = throughGreen(t);
  fails(() => finish(dir, 'SL-001', { commits: [{ sha: 'deadbeef', kind: 'red' }], tests_added: 1 }), /deadbeef/);
  assert.equal(slice(dir, 'SL-001').status, 'in_progress');
});

// ── status and CLI ───────────────────────────────────────────────
test('status describes the slice in progress, or says there is none', (t) => {
  const { dir } = repo(t);
  assert.match(status(dir).text, /no slice is in progress/);
  start(dir, 'SL-001');
  assert.match(status(dir).text, /SL-001.*red/);
});

const ppc = (cwd, ...args) => spawnSync('node', [CLI, ...args], { cwd, encoding: 'utf8' });

test('CLI: the whole cycle through the commands', (t) => {
  const { dir, commit } = repo(t);
  assert.equal(ppc(dir, 'start', 'SL-001', dir).status, 0);
  const red = commit('red', RED);
  assert.equal(ppc(dir, 'approve-red', '--by', 'reviewer', dir).status, 0);
  const green = commit('green', GREEN);
  writeFileSync(join(dir, '../audit.json'), JSON.stringify({ commits: [{ sha: red, kind: 'red' }, { sha: green, kind: 'green' }], tests_added: 1 }));
  const done = ppc(dir, 'finish', 'SL-001', '--audit', join(dir, '../audit.json'), dir);
  assert.equal(done.status, 0, done.stdout + done.stderr);
  assert.equal(ppc(dir, 'validate', dir, '--strict').status, 0);
  assert.equal(ppc(dir, 'check-git', dir).status, 0);
  assert.match(ppc(dir, 'status', dir).stdout, /no slice is in progress/);
});

test('CLI: a human records a budget exception with --budget-reason, and without it the slice is refused', (t) => {
  const r = repo(t);
  r.commit('chore: a small budget for this test', { '.architect/blueprint.yaml': read(r.dir, '.architect/blueprint.yaml').replace(/max_slice_production_lines: \d+/, 'max_slice_production_lines: 20') });
  assert.equal(ppc(r.dir, 'start', 'SL-001', r.dir).status, 0);
  const red = r.commit('red', RED);
  assert.equal(ppc(r.dir, 'approve-red', '--by', 'reviewer', r.dir).status, 0);
  const green = r.commit('green', { 'src/health.js': lines(25) });
  const input = join(r.dir, '../over-budget.json');
  writeFileSync(input, JSON.stringify({ commits: [{ sha: red, kind: 'red' }, { sha: green, kind: 'green' }], tests_added: 1 }));
  const refused = ppc(r.dir, 'finish', 'SL-001', '--audit', input, r.dir);
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /B01/);
  const accepted = ppc(r.dir, 'finish', 'SL-001', '--audit', input, '--budget-reason', 'Generated migration inflates the diff.', r.dir);
  assert.equal(accepted.status, 0, accepted.stderr);
  assert.equal(slice(r.dir, 'SL-001').audit.budget_override_reason, 'Generated migration inflates the diff.');
});

test('CLI: approve-debt opens, accepts or drops a proposed entry', (t) => {
  const run = (dir, ...args) => spawnSync('node', [CLI, ...args, dir], { encoding: 'utf8' });
  const a = repo(t);
  assert.equal(run(a.dir, 'approve-debt', 'DEBT-BE-001', '--by', 'reviewer').status, 0);
  assert.equal(debtEntry(a.dir, 'DEBT-BE-001').status, 'open');
  const b = repo(t);
  assert.equal(run(b.dir, 'approve-debt', 'DEBT-BE-001', '--by', 'reviewer', '--drop').status, 0);
  assert.equal(debtEntry(b.dir, 'DEBT-BE-001').status, 'dropped');
  const c = repo(t);
  assert.equal(run(c.dir, 'approve-debt', 'DEBT-BE-001', '--by', 'reviewer', '--accept', 'Lists stay small forever.').status, 0);
  assert.equal(debtEntry(c.dir, 'DEBT-BE-001').accepted_reason, 'Lists stay small forever.');
  assert.equal(run(c.dir, 'approve-debt', 'DEBT-BE-001', '--by', 'reviewer').status, 1);
});

test('CLI: next tells whose turn it is, following the real git history', (t) => {
  const { dir, commit } = repo(t);
  assert.match(ppc(dir, 'next', dir).stdout, /\[anyone\][\s\S]*ppc start SL-001/);
  assert.equal(ppc(dir, 'start', 'SL-001', dir).status, 0);
  assert.match(ppc(dir, 'next', dir).stdout, /\[agent\][\s\S]*sddpp-cycle-red/);
  commit('red(SL-001): health', RED);
  assert.match(ppc(dir, 'next', dir).stdout, /\[human\][\s\S]*ppc approve-red --by/);
  const overviewOut = ppc(dir, 'overview', dir);
  assert.equal(overviewOut.status, 0);
  assert.match(overviewOut.stdout, /In progress: SL-001/);
});

test('CLI: approve-slice records the approver', (t) => {
  const { dir } = repo(t);
  assert.equal(ppc(dir, 'approve-slice', 'SL-002', '--by', 'reviewer', dir).status, 0);
  assert.match(ppc(dir, 'status', dir).stdout, /SL-002/);
  assert.equal(ppc(dir, 'approve-slice', 'SL-003', dir).status, 1); // no --by
});

test('CLI: a refused transition prints why and exits 1', (t) => {
  const { dir } = repo(t);
  const r = ppc(dir, 'approve-red', '--by', 'reviewer', dir);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /no slice is in progress/);
  assert.equal(existsSync(join(dir, '.sddpp/active.json')), false);
});
