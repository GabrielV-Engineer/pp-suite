import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadProject } from '../src/load.mjs';
import { validateModel, RULES } from '../src/validate.mjs';
import { testPolicy } from '../src/policy.mjs';
import { overview } from '../src/next.mjs';
import { start, approveRed, finish, LifecycleError } from '../src/lifecycle.mjs';
import { generate, writeGenerated } from '../src/generate.mjs';
import { CLI, EXAMPLE, lines, repo } from './helpers.mjs';

const fails = (fn, pattern) => assert.throws(fn, (e) => e instanceof LifecycleError && pattern.test(e.message));
const read = (dir, rel) => readFileSync(join(dir, rel), 'utf8');
const slice = (dir, id) => loadProject(dir).slices.find((s) => s.data.id === id).data;
const entries = (dir) => loadProject(dir).debt.flatMap((d) => d.data.entries);
const has = (found, rule, severity) => found.some((f) => f.rule === rule && (!severity || f.severity === severity));

// ── which policy applies ─────────────────────────────────────────
test('testPolicy: the slice wins over the project, and the default is optional', () => {
  assert.equal(testPolicy({}, {}), 'optional');
  assert.equal(testPolicy({ test_policy: 'required' }, {}), 'required');
  assert.equal(testPolicy({ test_policy: 'required' }, { test_policy: 'none' }), 'none');
  assert.equal(testPolicy({}, { test_policy: 'required' }), 'required');
});

// ── the contract ─────────────────────────────────────────────────
const withPolicy = (project, slices = {}) => {
  const m = loadProject(EXAMPLE);
  if (project) m.blueprint.data.test_policy = project;
  for (const [id, policy] of Object.entries(slices)) m.slices.find((s) => s.data.id === id).data.test_policy = policy;
  return m;
};

test('SCHEMA: the policy is required, optional or none, in the blueprint and in a slice', () => {
  assert.ok(!has(validateModel(withPolicy('required', { 'SL-002': 'none' })), 'SCHEMA'));
  assert.ok(has(validateModel(withPolicy('sometimes')), 'SCHEMA', 'error'));
  assert.ok(has(validateModel(withPolicy(null, { 'SL-002': 'maybe' })), 'SCHEMA', 'error'));
});

// ── T16: a required policy is checked against the audit ──────────
const AUDIT = (testLines) => ({
  commits: [{ sha: 'aaaaaaa', kind: 'red' }, { sha: 'bbbbbbb', kind: 'green' }],
  production_lines: 5,
  test_lines: testLines,
  tests_added: testLines ? 1 : 0,
  mutation_score: null,
  decisions: [],
  debt_created: [],
  deviations: [],
});
/** The example has no closed slice, so SL-001 is closed in the model. */
const audited = (policy, testLines, slicePolicy) => {
  const m = withPolicy(policy);
  const s = m.slices.find((x) => x.data.id === 'SL-001');
  Object.assign(s.data, { status: 'done', approved_by: 'owner', red_approved_by: 'owner', audit: AUDIT(testLines) });
  if (slicePolicy) s.data.test_policy = slicePolicy;
  return { m, s };
};

test('T16: a closed work slice with no test lines breaks a required policy, from the project or from the slice', () => {
  assert.ok(RULES.T16);
  assert.ok(!has(validateModel(audited('required', 4).m), 'T16'));
  assert.ok(has(validateModel(audited('required', 0).m), 'T16', 'error'));
  assert.ok(!has(validateModel(audited('optional', 0).m), 'T16'));
  assert.ok(!has(validateModel(audited('none', 0).m), 'T16'));
  const { m, s } = audited('optional', 0);
  s.data.test_policy = 'required';
  assert.ok(has(validateModel(m), 'T16', 'error'));
  s.data.test_policy = 'none';
  m.blueprint.data.test_policy = 'required';
  assert.ok(!has(validateModel(m), 'T16'));
});

test('T16 does not apply to refactors and spikes, which change no behavior or leave no code', () => {
  const m = withPolicy('required');
  const refactor = m.slices.find((x) => x.data.type === 'refactor');
  Object.assign(refactor.data, { status: 'done', approved_by: 'owner', audit: AUDIT(0) });
  assert.ok(!has(validateModel(m), 'T16'));
});

// ── W06: optional must not mean invisible ────────────────────────
test('W06: a closed work slice with no tests and no test debt about it is a warning, only under an optional policy', () => {
  assert.ok(RULES.W06);
  const { m, s } = audited('optional', 0);
  assert.ok(has(validateModel(m), 'W06', 'warning'));
  assert.ok(!has(validateModel(audited('none', 0).m), 'W06'));
  assert.ok(!has(validateModel(audited('optional', 4).m), 'W06'));
  // a test debt entry whose origin is the slice answers it, whatever its status (even a dropped one is a decision)
  const register = m.debt[0];
  register.data.entries.push({ id: `DEBT-${register.data.component === 'backend' ? 'BE' : 'XX'}-900`, title: 'No tests', description: 'The slice added no tests', kind: 'test', origin: { type: 'slice', ref: s.data.id }, created: '2026-10-26', proposed_by: 'ai', cost_of_delay: { level: 'low', rationale: 'Nothing depends on it yet.' }, trigger: 'Before the next change', status: 'proposed' });
  assert.ok(!has(validateModel(m), 'W06'));
});

// ── the closing of a slice ───────────────────────────────────────
const NO_TESTS = (r) => r.git('commit', '--allow-empty', '-q', '-m', 'red(SL-001): nothing to test yet');

function throughGreenWithoutTests(t, project) {
  const r = repo(t);
  if (project) {
    r.write({ '.architect/blueprint.yaml': read(r.dir, '.architect/blueprint.yaml').replace('budgets:', `test_policy: ${project}\nbudgets:`) });
    writeGenerated(r.dir, generate(loadProject(r.dir)));
    r.git('add', '-A');
    r.git('commit', '-q', '-m', 'policy');
  }
  start(r.dir, 'SL-001');
  NO_TESTS(r);
  const red = r.git('rev-parse', 'HEAD');
  approveRed(r.dir, 'reviewer');
  const green = r.commit('green(SL-001): health endpoint', { 'src/health.js': lines(5) });
  return { ...r, audit: { commits: [{ sha: red, kind: 'red' }, { sha: green, kind: 'green' }], tests_added: 0 } };
}

test('finish: under a required policy a slice with no tests is refused and nothing changes', (t) => {
  const r = throughGreenWithoutTests(t, 'required');
  const before = read(r.dir, '.sddpp/slices/SL-001-deployable-skeleton.md');
  fails(() => finish(r.dir, 'SL-001', r.audit), /test_policy.*required|required.*tests/i);
  assert.equal(read(r.dir, '.sddpp/slices/SL-001-deployable-skeleton.md'), before);
});

test('finish: under the optional policy it closes, and proposes a test debt entry for a person to decide', (t) => {
  const r = throughGreenWithoutTests(t);
  const result = finish(r.dir, 'SL-001', r.audit);
  assert.equal(result.test_lines, 0);
  const s = slice(r.dir, 'SL-001');
  assert.equal(s.status, 'done');
  const proposed = entries(r.dir).filter((e) => e.origin.type === 'slice' && e.origin.ref === 'SL-001' && e.kind === 'test');
  assert.equal(proposed.length, 1);
  assert.equal(proposed[0].status, 'proposed');
  assert.equal(proposed[0].approved_by, undefined, 'only a person approves debt');
  assert.deepEqual(s.audit.debt_created, [proposed[0].id]);
  assert.deepEqual(validateModel(loadProject(r.dir)).filter((f) => f.severity === 'error'), []);
  assert.ok(!has(validateModel(loadProject(r.dir)), 'W06'));
});

test('finish: the proposed debt goes in the register of the slice component, with the next free id', (t) => {
  const r = throughGreenWithoutTests(t);
  finish(r.dir, 'SL-001', r.audit);
  const component = slice(r.dir, 'SL-001').components[0];
  const register = loadProject(r.dir).debt.find((d) => d.data.component === component);
  const code = loadProject(r.dir).blueprint.data.components.find((c) => c.id === component).code;
  const mine = register.data.entries.find((e) => e.kind === 'test' && e.origin.ref === 'SL-001');
  const numbers = register.data.entries.map((e) => Number(e.id.split('-')[2]));
  assert.match(mine.id, new RegExp(`^DEBT-${code}-\\d{3}$`));
  assert.equal(Number(mine.id.split('-')[2]), Math.max(...numbers.filter((n) => n !== Number(mine.id.split('-')[2]))) + 1);
});

test('finish: the register keeps the spacing its author used for the entries already there', (t) => {
  const r = throughGreenWithoutTests(t);
  const component = slice(r.dir, 'SL-001').components[0];
  const file = `.sddpp/debt/${component}.yaml`;
  const before = read(r.dir, file).split('\n');
  finish(r.dir, 'SL-001', r.audit);
  const after = read(r.dir, file).split('\n');
  assert.deepEqual(before.filter((line) => !after.includes(line)), []);
});

test('finish: under the none policy it closes and proposes nothing', (t) => {
  const r = throughGreenWithoutTests(t, 'none');
  const before = entries(r.dir).length;
  finish(r.dir, 'SL-001', r.audit);
  assert.equal(entries(r.dir).length, before);
  assert.deepEqual(slice(r.dir, 'SL-001').audit.debt_created, []);
});

test('finish: a slice that did add tests proposes nothing', (t) => {
  const r = repo(t);
  start(r.dir, 'SL-001');
  const red = r.commit('red(SL-001): health tests', { 'tests/health.test.js': lines(3) });
  approveRed(r.dir, 'reviewer');
  const green = r.commit('green(SL-001): health endpoint', { 'src/health.js': lines(5) });
  const before = entries(r.dir).length;
  finish(r.dir, 'SL-001', { commits: [{ sha: red, kind: 'red' }, { sha: green, kind: 'green' }], tests_added: 1 });
  assert.equal(entries(r.dir).length, before);
});

// ── the overview ─────────────────────────────────────────────────
test('overview: says how many closed slices have no verification, and which', () => {
  const m = audited('optional', 0).m;
  const text = overview(m, []);
  assert.match(text, /Verification:.*no tests/i);
  assert.match(text, /policy optional/);
  const ok = overview(audited('optional', 4).m, []);
  assert.match(ok, /Verification:/);
  assert.doesNotMatch(ok, /no tests: SL/);
});

test('CLI: overview shows the verification line', () => {
  const out = spawnSync('node', [CLI, 'overview', EXAMPLE], { encoding: 'utf8' });
  assert.equal(out.status, 0);
  assert.match(out.stdout, /Verification:/);
});
