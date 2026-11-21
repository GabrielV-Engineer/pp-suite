import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { loadProject } from '../src/load.mjs';
import { validateModel, RULES } from '../src/validate.mjs';
import { renderStandards, recommend } from '../src/standards.mjs';
import { decideStandard, start, finish, LifecycleError } from '../src/lifecycle.mjs';
import { askFor, DecisionError } from '../src/decisions.mjs';
import { pendingGlances } from '../src/glance.mjs';
import { pendingReviews } from '../src/review.mjs';
import { CLI, EXAMPLE, lines, repo } from './helpers.mjs';

// Measuring what the quality targets say, and the tools the agent may use (docs/standards.md, "Experience"). The project declares one
// command that measures; the person decides it, because the audit runs it. The person also authorizes a list of tools once, and a
// tool outside the list is asked about: once, add it, or no. pp-suite ships no tool and runs nothing itself.

const fails = (fn, pattern) => assert.throws(fn, (e) => e instanceof LifecycleError && pattern.test(e.message));
const answer = (more = {}) => ({ id: 'experience', decision: 'adopt', choice: 'review', decided_by: 'owner', decided_on: '2026-11-20', ...more });

/** The example in memory with this experience answer, and these slices closed (valid ones: with an audit) on this day. */
const model = (more = {}, closed = {}) => {
  const m = structuredClone(loadProject(EXAMPLE));
  m.standards.data.standards = m.standards.data.standards.map((x) => (x.id === 'experience' ? answer(more) : x));
  for (const [id, over] of Object.entries(closed)) {
    Object.assign(m.slices.find((s) => s.data.id === id).data, {
      status: 'done', approved_by: 'a', red_approved_by: 'r', closed_on: '2026-11-25',
      audit: { commits: [{ sha: 'aaaaaaa', kind: 'red' }, { sha: 'bbbbbbb', kind: 'green' }], production_lines: 1, test_lines: 1, tests_added: 1, mutation_score: null, decisions: [], debt_created: [], deviations: [],
        ui_check: { command: 'npm run check:ui', console_errors: 0, screenshots: [], no_screenshots_reason: 'No screenshots were taken in this fixture' }, ...over.audit },
    });
  }
  return m;
};
const found = (m, rule) => validateModel(m).filter((f) => f.rule === rule);
const schemaBad = (m) => validateModel(m).some((f) => f.rule === 'SCHEMA' && f.file === '.sddpp/standards.yaml');

// ── the contract ─────────────────────────────────────────────────
test('SCHEMA: the experience standard may name a measuring command and the tools the agent may use, and no other standard may', () => {
  assert.ok(!schemaBad(model({ measure_command: 'npm run perf', measure_on: '2026-11-21', allowed_tools: ['lighthouse', 'npx playwright'] })));
  assert.ok(schemaBad(model({ measure_on: 'soon' })), 'a date');
  assert.ok(schemaBad(model({ measure_command: 'ab' })), 'a command has some length');
  assert.ok(schemaBad(model({ measure_command: 'npm run perf\nrm -rf /' })), 'one line');
  assert.ok(schemaBad(model({ allowed_tools: 'lighthouse' })), 'a list');
  assert.ok(schemaBad(model({ allowed_tools: ['a'] })), 'a name');
  assert.ok(schemaBad(model({ allowed_tools: ['lighthouse', 'lighthouse'] })), 'once each');
  assert.ok(schemaBad(model({ allowed_tools: ['has,comma'] })), 'a comma separates names on the command line');
  const other = model();
  other.standards.data.standards = other.standards.data.standards.map((x) => (x.id === 'security' ? { ...x, measure_command: 'npm run perf' } : x));
  assert.ok(schemaBad(other), 'security measures nothing');
  const history = model({ history: [{ decision: 'adopt', choice: 'glance', decided_by: 'o', decided_on: '2026-11-01', measure_command: 'npm run perf', allowed_tools: ['axe'] }] });
  assert.ok(!schemaBad(history), 'what was decided before keeps its command and its tools');
});

// ── deciding it ──────────────────────────────────────────────────
const stored = (dir) => parseYaml(readFileSync(join(dir, '.sddpp/standards.yaml'), 'utf8')).standards.find((s) => s.id === 'experience');

test('decideStandard: a new answer may carry the command and the tools', (t) => {
  const { dir } = repo(t);
  decideStandard(dir, 'experience', { adopt: 'external', measure: 'npm run perf', tools: ['lighthouse', 'axe'], by: 'owner', today: '2026-11-21' });
  const e = stored(dir);
  assert.deepEqual([e.choice, e.measure_command, e.allowed_tools], ['external', 'npm run perf', ['lighthouse', 'axe']]);
  assert.equal(e.history[0].choice, 'review', 'the earlier answer is kept');
});

test('decideStandard: with no new answer, the command or the tools change the one adopted, and the earlier one goes to history', (t) => {
  const { dir } = repo(t);
  decideStandard(dir, 'experience', { measure: 'npm run perf', by: 'owner', today: '2026-11-21' });
  decideStandard(dir, 'experience', { tools: ['lighthouse'], by: 'owner', today: '2026-11-22' });
  const e = stored(dir);
  assert.deepEqual([e.choice, e.measure_command, e.allowed_tools], ['review', 'npm run perf', ['lighthouse']], 'the choice and the command stay');
  assert.equal(e.decided_on, '2026-10-24', 'the terms of the standard did not change, so the day they were decided does not either');
  assert.equal(e.measure_on, '2026-11-21', 'the command has its own day');
  assert.equal(e.history.length, 2);
  assert.equal(e.history.at(-1).measure_command, 'npm run perf');
});

test('a change of tools or of command does not make closed slices stop waiting for a glance or a review', (t) => {
  const { dir } = repo(t);
  const closed = (m) => {
    Object.assign(m.slices.find((s) => s.data.id === 'SL-003').data, { status: 'done', closed_on: '2026-11-05' });
    return m;
  };
  assert.equal(pendingGlances(closed(loadProject(dir))).length, 1, 'closed after 2026-10-24');
  decideStandard(dir, 'experience', { tools: ['lighthouse'], by: 'owner', today: '2026-11-22' });
  decideStandard(dir, 'experience', { addTool: 'axe', by: 'owner', today: '2026-11-23' });
  decideStandard(dir, 'experience', { measure: 'npm run perf', by: 'owner', today: '2026-11-24' });
  assert.equal(pendingGlances(closed(loadProject(dir))).length, 1, 'still waiting');
  assert.equal(pendingReviews(closed(loadProject(dir))).length, 1);
});

test('decideStandard: a new choice keeps the command and the tools unless it says otherwise', (t) => {
  const { dir } = repo(t);
  decideStandard(dir, 'experience', { measure: 'npm run perf', tools: ['lighthouse'], by: 'owner', today: '2026-11-21' });
  decideStandard(dir, 'experience', { adopt: 'external', by: 'owner', today: '2026-11-22' });
  assert.deepEqual([stored(dir).choice, stored(dir).measure_command, stored(dir).allowed_tools], ['external', 'npm run perf', ['lighthouse']]);
});

test('decideStandard --add-tool: adds one to the list, once, and refuses what makes no sense', (t) => {
  const { dir } = repo(t);
  decideStandard(dir, 'experience', { tools: ['lighthouse'], by: 'owner', today: '2026-11-21' });
  decideStandard(dir, 'experience', { addTool: 'axe', by: 'owner', today: '2026-11-22' });
  assert.deepEqual(stored(dir).allowed_tools, ['lighthouse', 'axe']);
  fails(() => decideStandard(dir, 'experience', { addTool: 'axe', by: 'owner' }), /already/);
  fails(() => decideStandard(dir, 'experience', { addTool: 'a', by: 'owner' }), /name/);
  fails(() => decideStandard(dir, 'security', { addTool: 'axe', by: 'owner' }), /experience/);
  fails(() => decideStandard(dir, 'security', { measure: 'npm run perf', by: 'owner' }), /experience/);
  decideStandard(dir, 'experience', { later: true, trigger: 'git_remote', by: 'owner', today: '2026-11-23' });
  fails(() => decideStandard(dir, 'experience', { measure: 'npm run perf', by: 'owner' }), /adopt/i);
  assert.deepEqual(stored(dir).decision, 'later', 'nothing changed');
});

test('decideStandard: a command is one line of at least 3 characters, and a person decides', (t) => {
  const { dir } = repo(t);
  fails(() => decideStandard(dir, 'experience', { measure: 'ab', by: 'owner' }), /command/);
  fails(() => decideStandard(dir, 'experience', { measure: 'one\ntwo', by: 'owner' }), /command|line/);
  fails(() => decideStandard(dir, 'experience', { measure: 'npm run perf', by: ' ' }), /--by/);
  assert.equal(stored(dir).measure_command, undefined);
});

// ── the card ─────────────────────────────────────────────────────
test('renderStandards: shows the command and the tools, or how to give them', () => {
  const m = model({ measure_command: 'npm run perf', allowed_tools: ['lighthouse', 'axe'] });
  const out = renderStandards(m.standards.data.standards, recommend(m.blueprint.data, {}), { only: 'experience' });
  assert.match(out, /Measures with:\s+npm run perf/);
  assert.match(out, /Tools allowed:\s+lighthouse, axe/);
  const bare = model();
  const hint = renderStandards(bare.standards.data.standards, recommend(bare.blueprint.data, {}), { only: 'experience' });
  assert.match(hint, /ppc ask experience --measure/);
  assert.match(hint, /ppc ask experience --tools/);
  const none = renderStandards(bare.standards.data.standards, recommend(bare.blueprint.data, {}), { only: 'security' });
  assert.ok(!/Measures with/.test(none), 'only the experience standard measures');
});

// ── the panel ────────────────────────────────────────────────────
const commandsOf = (q) => q.questions[0].options.filter((o) => o.label.includes(' — ppc ')).map((o) => o.label.split(' — ').slice(1).join(' — '));

test('ask experience --measure: record this command, or not', () => {
  const q = askFor(model(), 'experience', { measure: 'npm run perf' });
  assert.deepEqual(commandsOf(q), ['ppc decide-standard experience --measure "npm run perf"']);
  assert.match(q.questions[0].question, /npm run perf/);
  assert.ok(q.questions[0].options.some((o) => o.label === 'No'));
  assert.throws(() => askFor(model(), 'experience', { measure: 'npm run "perf"' }), DecisionError, 'a double quote cannot ride in the command');
  assert.throws(() => askFor(model(), 'experience', { measure: 'ab' }), DecisionError);
  assert.equal(askFor(model({ decision: 'later', trigger: 'git_remote', choice: undefined }), 'experience', { measure: 'npm run perf' }), null, 'nothing is adopted');
});

test('ask experience --tools: allow these tools, which the agent may run', () => {
  const q = askFor(model(), 'experience', { tools: 'lighthouse,axe' });
  assert.deepEqual(commandsOf(q), ['ppc decide-standard experience --tools "lighthouse,axe"']);
  assert.match(q.questions[0].question, /lighthouse/);
  assert.match(q.questions[0].question, /not verified|did not verify/i, 'pp-suite does not vouch for the list');
  assert.throws(() => askFor(model(), 'experience', { tools: 'a' }), DecisionError);
});

test('ask experience --add-tool: use it once, add it to the list, or no', () => {
  const q = askFor(model({ allowed_tools: ['lighthouse'] }), 'experience', { addTool: 'axe' });
  const labels = q.questions[0].options.map((o) => o.label);
  assert.equal(labels.length, 3);
  assert.deepEqual(commandsOf(q), ['ppc decide-standard experience --add-tool "axe"']);
  assert.match(labels[0], /once/i);
  assert.ok(!labels[0].includes(' — ppc '), 'once records nothing');
  assert.match(labels[2], /^No/);
  assert.equal(askFor(model({ allowed_tools: ['axe'] }), 'experience', { addTool: 'axe' }), null, 'already on the list');
  assert.equal(askFor(model(), 'experience', { addTool: 'axe' }).questions.length, 1, 'with no list yet it is the first');
});

// ── the audit records what was measured ──────────────────────────
/** A copy of the example with SL-001 started in the light cycle, with its commit. */
const built = (t) => {
  const r = repo(t);
  r.write({ '.architect/blueprint.yaml': readFileSync(join(r.dir, '.architect/blueprint.yaml'), 'utf8').replace('budgets:', 'default_mode: light\nbudgets:') });
  r.git('add', '-A');
  r.git('commit', '-q', '-m', 'light by default');
  start(r.dir, 'SL-001');
  const sha = r.commit('build(SL-001): health endpoint and its test', { 'src/health.js': lines(5), 'tests/health.test.js': lines(3) });
  return { r, audit: { commits: [{ sha, kind: 'build' }], tests_added: 1 } };
};
const sl = (dir) => loadProject(dir).slices.find((s) => s.data.id === 'SL-001').data;

test('finish: records what was measured against each quality target, as the audit says it', (t) => {
  const { r, audit } = built(t);
  const measurements = [{ qa: 'QA-001', command: 'npm run perf', value: 'p95 180 ms', met: true, note: 'Measured with 1000 tasks' }];
  finish(r.dir, 'SL-001', { ...audit, measurements });
  assert.deepEqual(sl(r.dir).audit.measurements, measurements);
  assert.deepEqual(validateModel(loadProject(r.dir)).filter((f) => f.severity === 'error'), []);
});

test('finish: measurements are optional, and a bad one is refused before anything changes', (t) => {
  const ok = built(t);
  finish(ok.r.dir, 'SL-001', ok.audit);
  assert.equal(sl(ok.r.dir).audit.measurements, undefined);
  const bad = (m) => {
    const { r, audit } = built(t);
    fails(() => finish(r.dir, 'SL-001', { ...audit, measurements: m }), /measurements/);
    assert.equal(sl(r.dir).status, 'in_progress');
  };
  bad('p95 180 ms');
  bad([{ qa: 'QA-099', command: 'npm run perf', value: '1 ms', met: true }]);
  bad([{ qa: 'QA-001', value: '1 ms', met: true }]);
  bad([{ qa: 'QA-001', command: 'npm run perf', met: true }]);
  bad([{ qa: 'QA-001', command: 'npm run perf', value: '1 ms', met: 'yes' }]);
});

// ── rules ────────────────────────────────────────────────────────
test('S04: quality targets that can be measured, a slice closed that meets them, and no command to measure with', () => {
  const closed = { 'SL-002': {} };
  const warn = found(model({}, closed), 'S04');
  assert.equal(warn.length, 1);
  assert.equal(warn[0].severity, 'warning');
  assert.match(warn[0].message, /ppc ask experience --measure/);
  assert.deepEqual(found(model({ measure_command: 'npm run perf' }, closed), 'S04'), []);
  assert.deepEqual(found(model(), 'S04'), [], 'nothing is closed yet');
  assert.deepEqual(found(model({ choice: 'custom', details: 'Our QA team measures it' }, closed), 'S04'), [], 'custom is the person\'s own way');
  assert.equal(found(model({}, { 'SL-003': {} }), 'S04').length, 1, 'usability counts too (QA-005)');
  assert.deepEqual(found(model({}, { 'SL-004': {} }), 'S04'), [], 'security is not measured this way');
});

test('W10: a command is declared and a slice closed after that did not record what it measured', () => {
  const w = found(model({ measure_command: 'npm run perf' }, { 'SL-002': {} }), 'W10');
  assert.equal(w.length, 1);
  assert.equal(w[0].severity, 'warning');
  assert.match(w[0].message, /SL-002/);
  assert.match(w[0].message, /QA-001/);
  const recorded = { 'SL-002': { audit: { measurements: [{ qa: 'QA-001', command: 'npm run perf', value: '180 ms', met: true }] } } };
  assert.deepEqual(found(model({ measure_command: 'npm run perf' }, recorded), 'W10'), []);
  assert.deepEqual(found(model({}, { 'SL-002': {} }), 'W10'), [], 'with no command there is nothing to record');
  const before = model({ measure_command: 'npm run perf', decided_on: '2026-12-01' }, { 'SL-002': {} });
  assert.deepEqual(found(before, 'W10'), [], 'closed before the command was decided');
  const dated = model({ measure_command: 'npm run perf', measure_on: '2026-12-01' }, { 'SL-002': {} });
  assert.deepEqual(found(dated, 'W10'), [], 'the command has its own day, later than the standard');
  assert.deepEqual(found(model({ measure_command: 'npm run perf' }, { 'SL-004': {} }), 'W10'), [], 'security is not measured this way');
});

test('every rule this adds is described', () => {
  for (const id of ['S04', 'W10']) assert.ok(RULES[id]?.length > 20, id);
});

// ── the command line ─────────────────────────────────────────────
test('CLI: decide-standard takes --measure, --tools and --add-tool; ask takes them too; an unknown option is refused', (t) => {
  const { dir } = repo(t);
  const run = (...args) => spawnSync('node', [CLI, ...args, dir], { encoding: 'utf8' });
  assert.equal(run('decide-standard', 'experience', '--measure', 'npm run perf', '--by', 'owner', '--surprise').status, 2);
  assert.equal(run('decide-standard', 'experience', '--measure', 'npm run perf', '--by', 'owner').status, 0);
  assert.equal(run('decide-standard', 'experience', '--tools', 'lighthouse,axe', '--by', 'owner').status, 0);
  assert.equal(run('decide-standard', 'experience', '--add-tool', 'playwright', '--by', 'owner').status, 0);
  assert.deepEqual([stored(dir).measure_command, stored(dir).allowed_tools], ['npm run perf', ['lighthouse', 'axe', 'playwright']]);
  const ask = JSON.parse(run('ask', 'experience', '--add-tool', 'k6').stdout);
  assert.match(ask.questions[0].question, /k6/);
  assert.equal(run('ask', 'experience', '--add-tool', 'axe').status, 1, 'already on the list');
});
