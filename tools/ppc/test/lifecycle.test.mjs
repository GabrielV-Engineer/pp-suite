import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadProject } from '../src/load.mjs';
import { validateModel } from '../src/validate.mjs';
import { checkGit } from '../src/gitcheck.mjs';
import { generate, checkGenerated } from '../src/generate.mjs';
import { start, approveRed, toRefactor, finish, status, initialPhase, LifecycleError } from '../src/lifecycle.mjs';
import { CLI, lines, repo } from './helpers.mjs';

const read = (dir, rel) => readFileSync(join(dir, rel), 'utf8');
const slice = (dir, id) => loadProject(dir).slices.find((s) => s.data.id === id).data;
const active = (dir) => JSON.parse(read(dir, '.sddpp/active.json'));
const RED = { 'tests/health.test.js': lines(3) };
const GREEN = { 'src/health.js': lines(5) };
const fails = (fn, pattern) => assert.throws(fn, (e) => e instanceof LifecycleError && pattern.test(e.message));

/** After a transition the project must still be valid and its generated views current. */
function assertConsistent(dir) {
  const model = loadProject(dir);
  assert.deepEqual(validateModel(model).filter((f) => f.severity === 'error'), []);
  assert.deepEqual(checkGenerated(dir, generate(model)), []);
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
  assert.equal(result.diff_lines, 8); // 3 (red) + 5 (green)
  const s = slice(dir, 'SL-001');
  assert.equal(s.status, 'done');
  assert.equal(s.phase, undefined);
  assert.equal(s.audit.diff_lines, 8);
  assert.equal(s.audit.mutation_score, null);
  assert.deepEqual(active(dir), { slice: null, phase: null });
  assertConsistent(dir);
  assert.deepEqual(checkGit(loadProject(dir), dir), []);
});

test('finish: the diff size is never taken from the caller', (t) => {
  const { dir, audit } = throughGreen(t);
  fails(() => finish(dir, 'SL-001', { ...audit, diff_lines: 1 }), /computed from git/);
});

test('finish ignores contract bookkeeping when it measures the diff', (t) => {
  const { dir, red, green, write } = throughGreen(t);
  write({ '.sddpp/notes.md': lines(40) });
  assert.equal(finish(dir, 'SL-001', { commits: [{ sha: red, kind: 'red' }, { sha: green, kind: 'green' }], tests_added: 1 }).diff_lines, 8);
});

test('finish: rolls everything back when the result would be invalid', (t) => {
  const { dir, audit } = throughGreen(t);
  const files = ['.sddpp/slices/SL-001-deployable-skeleton.md', '.sddpp/active.json', '.sddpp/wbs.md'];
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

test('CLI: a refused transition prints why and exits 1', (t) => {
  const { dir } = repo(t);
  const r = ppc(dir, 'approve-red', '--by', 'reviewer', dir);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /no slice is in progress/);
  assert.equal(existsSync(join(dir, '.sddpp/active.json')), false);
});
