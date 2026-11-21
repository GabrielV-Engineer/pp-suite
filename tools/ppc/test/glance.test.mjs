import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadProject } from '../src/load.mjs';
import { validateModel } from '../src/validate.mjs';
import { start, finish, glance, LifecycleError } from '../src/lifecycle.mjs';
import { renderDecision, askFor } from '../src/decisions.mjs';
import { pendingGlances, lookAt } from '../src/glance.mjs';
import { CLI, EXAMPLE, lines, repo } from './helpers.mjs';

// The glance: after a slice closes, a person looks at what a user would meet and says so. It is recorded, human-only, and it never
// holds anything up (docs/standards.md, "Experience").

const fails = (fn, pattern) => assert.throws(fn, (e) => e instanceof LifecycleError && pattern.test(e.message));
const slice = (dir, id) => loadProject(dir).slices.find((s) => s.data.id === id).data;
const errors = (m) => validateModel(m).filter((f) => f.severity === 'error');

/** A copy of the example with SL-001 closed on 2026-11-21 (light cycle, real commits, real `ppc finish`). */
const closed = (t) => {
  const r = repo(t);
  const file = '.architect/blueprint.yaml';
  r.write({ [file]: readFileSync(join(r.dir, file), 'utf8').replace('budgets:', 'default_mode: light\nbudgets:') });
  r.git('add', '-A');
  r.git('commit', '-q', '-m', 'light by default');
  start(r.dir, 'SL-001');
  const sha = r.commit('build(SL-001): health endpoint and its test', { 'src/health.js': lines(5), 'tests/health.test.js': lines(3) });
  finish(r.dir, 'SL-001', { commits: [{ sha, kind: 'build' }], tests_added: 1 }, { now: new Date('2026-11-21T10:00:00Z') });
  return r;
};

/** The example in memory, with SL-003 closed on this day and these changes on top. */
const model = (closedOn = '2026-11-25', over = {}) => {
  const m = structuredClone(loadProject(EXAMPLE));
  const s = m.slices.find((x) => x.data.id === 'SL-003').data;
  Object.assign(s, { status: 'done', ...(closedOn ? { closed_on: closedOn } : {}), ...over });
  return m;
};
const standard = (m, answer) => {
  m.standards.data.standards = m.standards.data.standards.map((x) => (x.id === 'experience' ? { id: 'experience', decided_by: 'o', decided_on: '2026-10-24', ...answer } : x));
  return m;
};

// ── the contract ─────────────────────────────────────────────────
test('SCHEMA: a glance names who and when; a skipped one names who too', () => {
  // only what is said about the glance fields: a slice closed in memory has no audit, which other rules object to
  const ok = (over) => !validateModel(model('2026-11-25', over)).some((f) => f.rule === 'SCHEMA' && /glanc/.test(f.message));
  assert.ok(ok({ glanced_by: 'owner', glanced_on: '2026-11-26' }));
  assert.ok(ok({ glanced_by: 'owner', glanced_on: '2026-11-26', glance_skipped: true }));
  assert.ok(!ok({ glanced_by: 'owner' }), 'when is missing');
  assert.ok(!ok({ glanced_on: '2026-11-26' }), 'who is missing');
  assert.ok(!ok({ glance_skipped: true }), 'a skip says who skipped it');
  assert.ok(!ok({ glanced_by: 'owner', glanced_on: 'soon' }), 'a date');
});

// ── what is pending ──────────────────────────────────────────────
test('pendingGlances: a slice that closed after the standard was decided, that a user meets, and that nobody has looked at', () => {
  assert.deepEqual(pendingGlances(model()).map((s) => s.id), ['SL-003']);
  assert.deepEqual(pendingGlances(loadProject(EXAMPLE)), [], 'nothing is closed');
});

test('pendingGlances: not a slice closed before the standard, or with no closing date, or already looked at', () => {
  assert.deepEqual(pendingGlances(model('2026-10-01')), [], 'closed before 2026-10-24');
  assert.deepEqual(pendingGlances(model(null)), [], 'closed before the date was kept');
  assert.deepEqual(pendingGlances(model('2026-11-25', { glanced_by: 'owner', glanced_on: '2026-11-26' })), []);
  assert.deepEqual(pendingGlances(model('2026-10-24')).map((s) => s.id), ['SL-003'], 'the same day counts');
});

test('pendingGlances: only where a person meets what was built, and only for work', () => {
  assert.deepEqual(pendingGlances(model('2026-11-25', { components: ['database'] })), []);
  assert.deepEqual(pendingGlances(model('2026-11-25', { components: ['backend'] })).map((s) => s.id), ['SL-003']);
  assert.deepEqual(pendingGlances(model('2026-11-25', { type: 'refactor' })), []);
});

test('pendingGlances: only for glance, review and external; custom, later and not needed are the person\'s own way', () => {
  for (const choice of ['glance', 'review', 'external']) {
    assert.equal(pendingGlances(standard(model(), { decision: 'adopt', choice })).length, 1, choice);
  }
  assert.deepEqual(pendingGlances(standard(model(), { decision: 'adopt', choice: 'custom', details: 'Our QA team looks' })), []);
  assert.deepEqual(pendingGlances(standard(model(), { decision: 'later', trigger: 'git_remote' })), []);
  assert.deepEqual(pendingGlances(standard(model(), { decision: 'not_needed', reason: 'Nothing a person uses' })), []);
  const none = model();
  none.standards = null;
  assert.deepEqual(pendingGlances(none), []);
});

// ── what to look at ──────────────────────────────────────────────
test('lookAt: the screens, what it was checked by, the quality targets, and the captures, from the slice and the design', () => {
  const m = model('2026-11-25', { audit: { commits: [{ sha: 'aaaaaaa', kind: 'build' }], production_lines: 1, test_lines: 1, tests_added: 1, mutation_score: null, decisions: [], debt_created: [], deviations: [], ui_check: { command: 'npm run check:ui', console_errors: 2, screenshots: ['.sddpp/ui-checks/SL-003-list.png'] } } });
  const text = lookAt(m, m.slices.find((s) => s.data.id === 'SL-003').data).join('\n');
  assert.match(text, /SCR-01/);
  assert.match(text, /AC-1/);
  assert.match(text, /QA-005/);
  assert.match(text, /3/, 'the usability target');
  assert.match(text, /\.sddpp\/ui-checks\/SL-003-list\.png/);
  assert.match(text, /2 console errors/);
});

test('lookAt: says so when the audit saved no captures, and gives the same text every time', () => {
  const m = model();
  const s = m.slices.find((x) => x.data.id === 'SL-003').data;
  const once = lookAt(m, s).join('\n');
  assert.match(once, /no captures/i);
  assert.equal(lookAt(m, s).join('\n'), once);
});

// ── the card and the panel ───────────────────────────────────────
test('show: a closed slice nobody has looked at says what to look at and how to say it was looked at', () => {
  const card = renderDecision(model(), 'SL-003');
  assert.match(card, /Look at/);
  assert.match(card, /ppc glance SL-003/);
});

test('show: no look-at list once it is looked at, or when the person does not use the standard', () => {
  assert.ok(!/Look at/.test(renderDecision(model('2026-11-25', { glanced_by: 'owner', glanced_on: '2026-11-26' }), 'SL-003')));
  assert.ok(!/Look at/.test(renderDecision(standard(model(), { decision: 'not_needed', reason: 'Nothing a person uses' }), 'SL-003')));
});

test('ask: looked, skip or not yet; the first two end with the exact command', () => {
  const q = askFor(model(), 'SL-003').questions[0];
  const commands = q.options.filter((o) => o.label.includes(' — ppc ')).map((o) => o.label.split(' — ').at(-1));
  assert.deepEqual(commands, ['ppc glance SL-003', 'ppc glance SL-003 --skip']);
  assert.ok(q.options.some((o) => o.label === 'Not yet'));
  assert.equal(askFor(model('2026-11-25', { glanced_by: 'owner', glanced_on: '2026-11-26' }), 'SL-003'), null, 'already looked at');
});

// ── recording it ─────────────────────────────────────────────────
test('glance: records who looked and when, and changes nothing else in the slice', (t) => {
  const r = closed(t);
  const file = '.sddpp/slices/SL-001-deployable-skeleton.md';
  const before = readFileSync(join(r.dir, file), 'utf8').split('\n');
  const result = glance(r.dir, 'SL-001', { by: 'owner', today: '2026-11-26' });
  assert.deepEqual(result, { slice: 'SL-001', glanced_by: 'owner', glanced_on: '2026-11-26', skipped: false });
  const s = slice(r.dir, 'SL-001');
  assert.deepEqual([s.glanced_by, s.glanced_on, s.glance_skipped], ['owner', '2026-11-26', undefined]);
  const added = readFileSync(join(r.dir, file), 'utf8').split('\n').filter((l) => !before.includes(l));
  assert.deepEqual(added.map((l) => l.split(':')[0]).sort(), ['glanced_by', 'glanced_on']);
  assert.deepEqual(errors(loadProject(r.dir)), []);
});

test('glance --skip: recorded as skipped, by whom and when', (t) => {
  const r = closed(t);
  assert.equal(glance(r.dir, 'SL-001', { by: 'owner', skip: true, today: '2026-11-26' }).skipped, true);
  assert.equal(slice(r.dir, 'SL-001').glance_skipped, true);
  assert.deepEqual(errors(loadProject(r.dir)), []);
});

test('glance: refuses what makes no sense, and changes nothing', (t) => {
  const r = closed(t);
  fails(() => glance(r.dir, 'SL-001', { today: '2026-11-26' }), /--by/);
  fails(() => glance(r.dir, 'SL-001', { by: '  ', today: '2026-11-26' }), /--by/);
  fails(() => glance(r.dir, 'SL-099', { by: 'owner' }), /unknown slice/);
  fails(() => glance(r.dir, 'SL-002', { by: 'owner' }), /planned|closed|done/i);
  assert.equal(slice(r.dir, 'SL-001').glanced_by, undefined);
  glance(r.dir, 'SL-001', { by: 'owner', today: '2026-11-26' });
  fails(() => glance(r.dir, 'SL-001', { by: 'someone else', today: '2026-11-27' }), /already/);
  assert.equal(slice(r.dir, 'SL-001').glanced_by, 'owner');
});

test('glance: it is only recorded once the slice is done, never while it is built', (t) => {
  const r = repo(t);
  start(r.dir, 'SL-001');
  fails(() => glance(r.dir, 'SL-001', { by: 'owner' }), /in_progress|not done|closed/i);
});

// ── the command line ─────────────────────────────────────────────
test('CLI: ppc glance SL-001 --by owner, and --skip; an unknown option or a missing id is refused', (t) => {
  const r = closed(t);
  const run = (...args) => spawnSync('node', [CLI, ...args, r.dir], { encoding: 'utf8' });
  assert.equal(run('glance', 'SL-001', '--by', 'owner', '--surprise').status, 2);
  assert.equal(run('glance', '--by', 'owner').status, 1);
  const done = run('glance', 'SL-001', '--by', 'owner');
  assert.equal(done.status, 0, done.stderr);
  assert.match(done.stdout, /SL-001/);
  assert.equal(slice(r.dir, 'SL-001').glanced_by, 'owner');
  assert.equal(run('glance', 'SL-001', '--by', 'owner').status, 1, 'already looked at');
});

test('CLI: ppc show and ppc ask take a closed slice', (t) => {
  const r = closed(t);
  const show = spawnSync('node', [CLI, 'show', 'SL-001', r.dir], { encoding: 'utf8' });
  assert.match(show.stdout, /ppc glance SL-001/);
  const ask = JSON.parse(spawnSync('node', [CLI, 'ask', 'SL-001', r.dir], { encoding: 'utf8' }).stdout);
  assert.match(ask.questions[0].question, /SL-001/);
});
