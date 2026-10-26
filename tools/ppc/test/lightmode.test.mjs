import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadProject } from '../src/load.mjs';
import { validateModel, RULES } from '../src/validate.mjs';
import { checkGit } from '../src/gitcheck.mjs';
import { generate, writeGenerated, checkGenerated } from '../src/generate.mjs';
import { modeOf } from '../src/policy.mjs';
import { nextSteps } from '../src/next.mjs';
import { appliesTo, buildPrompts, resolveTarget } from '../src/prompts.mjs';
import { start, approveRed, toRefactor, finish, initialPhase, LifecycleError } from '../src/lifecycle.mjs';
import { CLI, EXAMPLE, lines, repo } from './helpers.mjs';

const fails = (fn, pattern) => assert.throws(fn, (e) => e instanceof LifecycleError && pattern.test(e.message));
const read = (dir, rel) => readFileSync(join(dir, rel), 'utf8');
const slice = (dir, id) => loadProject(dir).slices.find((s) => s.data.id === id).data;
const has = (found, rule, severity) => found.some((f) => f.rule === rule && (!severity || f.severity === severity));
const model = () => loadProject(EXAMPLE);
const sl = (m, id) => m.slices.find((s) => s.data.id === id).data;

// ── which mode applies ───────────────────────────────────────────
test('modeOf: the slice wins over the blueprint, and without either the cycle stays strict', () => {
  assert.equal(modeOf({}, {}), 'strict');
  assert.equal(modeOf({ default_mode: 'light' }, {}), 'light');
  assert.equal(modeOf({ default_mode: 'light' }, { mode: 'strict' }), 'strict');
  assert.equal(modeOf({ default_mode: 'strict' }, { mode: 'light' }), 'light');
});

test('initialPhase: a light work slice builds, everything else is as before', () => {
  for (const type of ['skeleton', 'feature', 'fix']) {
    assert.equal(initialPhase(type, 'light'), 'build');
    assert.equal(initialPhase(type, 'strict'), 'red');
    assert.equal(initialPhase(type), 'red');
  }
  assert.equal(initialPhase('refactor', 'light'), 'refactor');
  assert.equal(initialPhase('spike', 'light'), 'red');
});

// ── the contract ─────────────────────────────────────────────────
test('SCHEMA: mode and default_mode are light or strict; build is a phase and a commit kind', () => {
  const ok = model();
  ok.blueprint.data.default_mode = 'light';
  Object.assign(sl(ok, 'SL-001'), { mode: 'light', status: 'in_progress', phase: 'build' });
  ok.active = { file: '.sddpp/active.json', data: { slice: 'SL-001', phase: 'build' } };
  assert.ok(!has(validateModel(ok), 'SCHEMA'), JSON.stringify(validateModel(ok).filter((f) => f.rule === 'SCHEMA')));
  const bad = model();
  bad.blueprint.data.default_mode = 'fast';
  assert.ok(has(validateModel(bad), 'SCHEMA', 'error'));
  const badSlice = model();
  sl(badSlice, 'SL-002').mode = 'fast';
  assert.ok(has(validateModel(badSlice), 'SCHEMA', 'error'));
  const kind = model();
  Object.assign(sl(kind, 'SL-001'), { status: 'done', mode: 'light', audit: { commits: [{ sha: 'aaaaaaa', kind: 'build' }], production_lines: 1, test_lines: 1, tests_added: 1, mutation_score: null, decisions: [], debt_created: [], deviations: [] } });
  assert.ok(!has(validateModel(kind), 'SCHEMA'));
});

test('SCHEMA: a light slice needs no human-approved red tests; a strict one still does', () => {
  const audit = { commits: [{ sha: 'aaaaaaa', kind: 'build' }], production_lines: 1, test_lines: 1, tests_added: 1, mutation_score: null, decisions: [], debt_created: [], deviations: [] };
  const light = model();
  Object.assign(sl(light, 'SL-001'), { status: 'done', mode: 'light', audit });
  assert.ok(!has(validateModel(light), 'SCHEMA'));
  const strict = model();
  Object.assign(sl(strict, 'SL-001'), { status: 'done', mode: 'strict', audit });
  assert.ok(has(validateModel(strict), 'SCHEMA', 'error'));
  const unstamped = model();
  Object.assign(sl(unstamped, 'SL-001'), { status: 'done', audit });
  assert.ok(has(validateModel(unstamped), 'SCHEMA', 'error'), 'a slice with no mode is checked as before');
});

// ── L06: the phase agrees with the mode ──────────────────────────
const running = (phase, mode, defaultMode) => {
  const m = model();
  if (defaultMode) m.blueprint.data.default_mode = defaultMode;
  Object.assign(sl(m, 'SL-001'), { status: 'in_progress', phase, ...(mode ? { mode } : {}), red_approved_by: 'owner' });
  m.active = { file: '.sddpp/active.json', data: { slice: 'SL-001', phase } };
  return validateModel(m);
};

test('L06: build belongs to light slices, red and green to strict ones', () => {
  assert.ok(RULES.L06);
  assert.ok(!has(running('build', 'light'), 'L06'));
  assert.ok(!has(running('red', 'strict'), 'L06'));
  assert.ok(!has(running('green', undefined), 'L06'), 'no mode anywhere means strict');
  assert.ok(has(running('build', 'strict'), 'L06', 'error'));
  assert.ok(has(running('build', undefined), 'L06', 'error'));
  assert.ok(has(running('red', 'light'), 'L06', 'error'));
  assert.ok(has(running('green', undefined, 'light'), 'L06', 'error'), 'the blueprint default counts');
  assert.ok(!has(running('build', undefined, 'light'), 'L06'));
});

test('L02: a light slice is not asked to put a red commit before a green one', () => {
  const m = model();
  Object.assign(sl(m, 'SL-001'), { status: 'done', mode: 'light', audit: { commits: [{ sha: 'aaaaaaa', kind: 'build' }], production_lines: 1, test_lines: 1, tests_added: 1, mutation_score: null, decisions: [], debt_created: [], deviations: [] } });
  assert.ok(!has(validateModel(m), 'L02'));
  Object.assign(sl(m, 'SL-001'), { mode: 'strict', red_approved_by: 'owner' });
  assert.ok(has(validateModel(m), 'L02', 'error'));
});

// ── the transitions ──────────────────────────────────────────────
function lightRepo(t, { blueprint = true } = {}) {
  const r = repo(t);
  if (blueprint) {
    r.write({ '.architect/blueprint.yaml': read(r.dir, '.architect/blueprint.yaml').replace('budgets:', 'default_mode: light\nbudgets:') });
    writeGenerated(r.dir, generate(loadProject(r.dir)));
    r.git('add', '-A');
    r.git('commit', '-q', '-m', 'light by default');
  }
  return r;
}

test('start: records the mode it applied, and a light slice goes straight to build', (t) => {
  const r = lightRepo(t);
  assert.deepEqual(start(r.dir, 'SL-001'), { slice: 'SL-001', phase: 'build' });
  assert.equal(slice(r.dir, 'SL-001').mode, 'light');
  assert.deepEqual(JSON.parse(read(r.dir, '.sddpp/active.json')), { slice: 'SL-001', phase: 'build' });
  assert.deepEqual(validateModel(loadProject(r.dir)).filter((f) => f.severity === 'error'), []);
  assert.deepEqual(checkGenerated(r.dir, generate(loadProject(r.dir))), []);
});

test('start: without a default the cycle is strict and the mode is recorded as such', (t) => {
  const r = repo(t);
  assert.equal(start(r.dir, 'SL-001').phase, 'red');
  assert.equal(slice(r.dir, 'SL-001').mode, 'strict');
});

test('start: a slice that asks for the strict cycle gets it even when the project is light', (t) => {
  const r = lightRepo(t);
  const file = '.sddpp/slices/SL-001-deployable-skeleton.md';
  r.write({ [file]: read(r.dir, file).replace('type: skeleton', 'type: skeleton\nmode: strict') });
  writeGenerated(r.dir, generate(loadProject(r.dir)));
  r.git('add', '-A');
  r.git('commit', '-q', '-m', 'strict slice');
  assert.equal(start(r.dir, 'SL-001').phase, 'red');
});

test('start: a refactor slice has no mode to record', (t) => {
  const r = lightRepo(t);
  const file = '.sddpp/slices/SL-008-share-validation-rules.md';
  r.write({ [file]: read(r.dir, file).replace('status: planned', 'status: ready\napproved_by: reviewer').replace('depends_on: [SL-004]', 'depends_on: []') });
  writeGenerated(r.dir, generate(loadProject(r.dir)));
  assert.equal(start(r.dir, 'SL-008').phase, 'refactor');
  assert.equal(slice(r.dir, 'SL-008').mode, undefined);
});

test('a light slice has no red approval and no refactor phase, and says why', (t) => {
  const r = lightRepo(t);
  start(r.dir, 'SL-001');
  fails(() => approveRed(r.dir, 'reviewer'), /light/);
  fails(() => toRefactor(r.dir), /light/);
});

const build = (r) => {
  start(r.dir, 'SL-001');
  const one = r.commit('build(SL-001): health endpoint and its test', { 'src/health.js': lines(5), 'tests/health.test.js': lines(3) });
  return { sha: one, audit: { commits: [{ sha: one, kind: 'build' }], tests_added: 1 } };
};

test('finish: closes a light slice from the build phase with the sizes measured from git', (t) => {
  const r = lightRepo(t);
  const { audit } = build(r);
  const result = finish(r.dir, 'SL-001', audit);
  assert.equal(result.production_lines, 5);
  assert.equal(result.test_lines, 3);
  const s = slice(r.dir, 'SL-001');
  assert.equal(s.status, 'done');
  assert.equal(s.red_approved_by, undefined);
  assert.deepEqual(validateModel(loadProject(r.dir)).filter((f) => f.severity === 'error'), []);
  assert.deepEqual(checkGit(loadProject(r.dir), r.dir), []);
  assert.deepEqual(JSON.parse(read(r.dir, '.sddpp/active.json')), { slice: null, phase: null });
});

test('finish: the test policy still applies to a light slice', (t) => {
  const r = lightRepo(t);
  start(r.dir, 'SL-001');
  const sha = r.commit('build(SL-001): health endpoint', { 'src/health.js': lines(5) });
  const audit = { commits: [{ sha, kind: 'build' }], tests_added: 0 };
  finish(r.dir, 'SL-001', audit);
  const proposed = loadProject(r.dir).debt.flatMap((d) => d.data.entries).filter((e) => e.kind === 'test' && e.origin.ref === 'SL-001');
  assert.equal(proposed.length, 1);
  assert.equal(proposed[0].status, 'proposed');
});

test('finish: a required policy refuses a light slice with no tests', (t) => {
  const r = lightRepo(t);
  r.write({ '.architect/blueprint.yaml': read(r.dir, '.architect/blueprint.yaml').replace('default_mode: light', 'default_mode: light\ntest_policy: required') });
  writeGenerated(r.dir, generate(loadProject(r.dir)));
  r.git('add', '-A');
  r.git('commit', '-q', '-m', 'required');
  start(r.dir, 'SL-001');
  const sha = r.commit('build(SL-001): health endpoint', { 'src/health.js': lines(5) });
  fails(() => finish(r.dir, 'SL-001', { commits: [{ sha, kind: 'build' }], tests_added: 0 }), /required/);
});

test('finish: a light slice still cannot close with uncommitted work or an unknown commit', (t) => {
  const r = lightRepo(t);
  start(r.dir, 'SL-001');
  r.write({ 'src/health.js': lines(2) });
  fails(() => finish(r.dir, 'SL-001', { commits: [{ sha: 'a'.repeat(40), kind: 'build' }], tests_added: 0 }), /uncommitted/);
});

test('git check: in a light slice the tests may change, since no approved red commit locks them', (t) => {
  const r = lightRepo(t);
  start(r.dir, 'SL-001');
  const a = r.commit('build(SL-001): first', { 'src/health.js': lines(5), 'tests/health.test.js': lines(3) });
  const b = r.commit('build(SL-001): rework the test', { 'tests/health.test.js': lines(4) });
  finish(r.dir, 'SL-001', { commits: [{ sha: a, kind: 'build' }, { sha: b, kind: 'build' }], tests_added: 1 });
  assert.deepEqual(checkGit(loadProject(r.dir), r.dir), []);
});

// ── next, prompts ────────────────────────────────────────────────
test('next: a light slice is built, then audited, with no approval step in between', () => {
  const m = model();
  Object.assign(sl(m, 'SL-001'), { status: 'in_progress', phase: 'build', mode: 'light' });
  const first = nextSteps(m, []);
  assert.match(first.headline, /build phase/);
  assert.deepEqual(first.actions.map((a) => a.who), ['agent']);
  assert.match(first.actions[0].command, /build/);
  const after = nextSteps(m, ['build(SL-001): the work']);
  assert.match(after.actions[0].command, /audit/);
  assert.ok(!after.actions.some((a) => a.who === 'human'));
});

test('next: says which cycle a ready slice will start in', () => {
  const m = model();
  Object.assign(sl(m, 'SL-001'), { status: 'ready' });
  assert.match(nextSteps(m, []).actions[0].what, /red phase/);
  m.blueprint.data.default_mode = 'light';
  assert.match(nextSteps(m, []).actions[0].what, /build phase/);
});

test('prompts: a light slice has a build task instead of red and green', () => {
  assert.deepEqual(appliesTo('feature', 'light'), ['build', 'audit']);
  assert.deepEqual(appliesTo('feature', 'strict'), ['red', 'green', 'refactor', 'audit']);
  assert.deepEqual(appliesTo('refactor', 'light'), ['refactor', 'audit']);
  const m = model();
  m.blueprint.data.default_mode = 'light';
  const { system, negative } = buildPrompts(m, 'SL-002', 'build');
  assert.match(system, /build\(SL-002\)/);
  assert.match(system, /Tests are expected/, 'it states the test policy');
  assert.match(negative, /Exceed 200 lines/);
  assert.throws(() => buildPrompts(m, 'SL-002', 'red'), /light slice.*no red/i);
  Object.assign(sl(m, 'SL-002'), { status: 'in_progress', phase: 'build' });
  assert.deepEqual(resolveTarget(m, undefined, undefined), { slice: 'SL-002', task: 'build' });
});

test('prompts: the build task states the policy that applies, from the project or the slice', () => {
  const m = model();
  m.blueprint.data.default_mode = 'light';
  m.blueprint.data.test_policy = 'required';
  assert.match(buildPrompts(m, 'SL-002', 'build').system, /required/);
  sl(m, 'SL-002').test_policy = 'none';
  assert.match(buildPrompts(m, 'SL-002', 'build').system, /not asked for/);
});

// ── the command line ─────────────────────────────────────────────
test('CLI: the light cycle end to end', (t) => {
  const r = lightRepo(t);
  const ppc = (...args) => spawnSync('node', [CLI, ...args, r.dir], { cwd: r.dir, encoding: 'utf8' });
  assert.equal(ppc('start', 'SL-001').status, 0);
  assert.equal(ppc('approve-red', '--by', 'x').status, 1, 'there is no red phase to approve');
  const sha = r.commit('build(SL-001): health', { 'src/health.js': lines(5), 'tests/health.test.js': lines(3) });
  const input = join(r.dir, '../light-audit.json');
  r.write({ '../light-audit.json': JSON.stringify({ commits: [{ sha, kind: 'build' }], tests_added: 1 }) });
  const done = ppc('finish', 'SL-001', '--audit', input);
  assert.equal(done.status, 0, done.stderr);
  assert.equal(ppc('check-git').status, 0);
});
