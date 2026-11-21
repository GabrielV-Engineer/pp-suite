import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadProject } from '../src/load.mjs';
import { validateModel, RULES } from '../src/validate.mjs';
import { start, finish, LifecycleError } from '../src/lifecycle.mjs';
import { pendingReviews, openReviews, suggestedMode } from '../src/review.mjs';
import { openReview } from '../src/reviewfile.mjs';
import { renderDecision, askFor } from '../src/decisions.mjs';
import { nextSteps } from '../src/next.mjs';
import { CLI, EXAMPLE, lines, repo } from './helpers.mjs';

// The milestone review (docs/standards.md, "Experience"): when a capability is complete, or when asked, the whole is reviewed
// against the rubric. The person picks how it is done, a fresh agent session answers the rubric and proposes each finding as debt,
// and the person decides on that debt the way they decide on any other.

const fails = (fn, pattern) => assert.throws(fn, (e) => e instanceof LifecycleError && pattern.test(e.message));
const errors = (m) => validateModel(m).filter((f) => f.severity === 'error');
const files = (dir) => readdirSync(join(dir, '.sddpp/reviews'));

/** The example in memory with these slices closed on this day (the experience standard was decided on 2026-10-24). */
const closed = (ids, day = '2026-11-25') => {
  const m = structuredClone(loadProject(EXAMPLE));
  for (const s of m.slices.filter((x) => ids.includes(x.data.id))) Object.assign(s.data, { status: 'done', closed_on: day });
  return m;
};
const choice = (m, answer) => {
  m.standards.data.standards = m.standards.data.standards.map((x) => (x.id === 'experience' ? { id: 'experience', decided_by: 'o', decided_on: '2026-10-24', ...answer } : x));
  return m;
};
const entry = (over = {}) => ({
  file: '.sddpp/reviews/RV-001-cap-002.md', body: '',
  data: { id: 'RV-001', scope: { type: 'capability', ref: 'CAP-002' }, mode: 'explain', mode_chosen_by: 'owner', surfaces: ['screen'], opened_on: '2026-11-26', status: 'open', ...over },
});
const withReviews = (...list) => Object.assign(structuredClone(loadProject(EXAMPLE)), { reviews: list });
const schemaFindings = (m) => validateModel(m).filter((f) => f.rule === 'SCHEMA' && f.file.includes('reviews'));

/** A copy of the example with SL-001 (given the capability CAP-001) closed on this day. */
const closedRepo = (t) => {
  const r = repo(t);
  const bp = '.architect/blueprint.yaml';
  const sl = '.sddpp/slices/SL-001-deployable-skeleton.md';
  r.write({
    [bp]: readFileSync(join(r.dir, bp), 'utf8').replace('budgets:', 'default_mode: light\nbudgets:'),
    [sl]: readFileSync(join(r.dir, sl), 'utf8').replace('type: skeleton', 'type: skeleton\ncapability: CAP-001'),
  });
  r.git('add', '-A');
  r.git('commit', '-q', '-m', 'light by default, and SL-001 builds CAP-001');
  start(r.dir, 'SL-001');
  const sha = r.commit('build(SL-001): health endpoint and its test', { 'src/health.js': lines(5), 'tests/health.test.js': lines(3) });
  finish(r.dir, 'SL-001', { commits: [{ sha, kind: 'build' }], tests_added: 1 }, { now: new Date('2026-11-21T10:00:00Z') });
  return r;
};

// ── the contract ─────────────────────────────────────────────────
test('SCHEMA: a review names its scope, who chose how it is done, the surfaces, and its state', () => {
  assert.deepEqual(schemaFindings(withReviews(entry())), []);
  assert.deepEqual(schemaFindings(withReviews(entry({ scope: { type: 'project' }, surfaces: ['screen', 'api', 'cli', 'docs'] }))), []);
  const bad = (over) => schemaFindings(withReviews(entry(over))).length > 0;
  assert.ok(bad({ scope: { type: 'capability' } }), 'a capability review names the capability');
  assert.ok(bad({ scope: { type: 'project', ref: 'CAP-002' } }), 'a project review names none');
  assert.ok(bad({ scope: { type: 'universe' } }));
  assert.ok(bad({ mode: 'wing-it' }));
  assert.ok(bad({ mode_chosen_by: undefined }), 'a person chose the mode');
  assert.ok(bad({ surfaces: [] }));
  assert.ok(bad({ surfaces: ['hologram'] }));
  assert.ok(bad({ id: 'REV-1' }));
  assert.ok(bad({ status: 'closed' }), 'closed says when');
  assert.ok(bad({ closed_on: '2026-11-27' }), 'open has no closing day');
  assert.ok(!bad({ status: 'closed', closed_on: '2026-11-27', findings: ['DEBT-FE-001'] }));
  assert.ok(bad({ findings: ['not-a-debt'] }));
  assert.ok(bad({ surprise: 1 }));
});

test('debt: a review is a place debt can come from', () => {
  const m = withReviews(entry());
  m.debt[0].data.entries[0].origin = { type: 'review', ref: 'RV-001' };
  assert.deepEqual(validateModel(m).filter((f) => f.rule === 'SCHEMA'), []);
});

test('R01: a review of a capability the design does not have', () => {
  assert.ok(!validateModel(withReviews(entry())).some((f) => f.rule === 'R01'));
  const found = validateModel(withReviews(entry({ scope: { type: 'capability', ref: 'CAP-099' } }))).filter((f) => f.rule === 'R01');
  assert.equal(found.length, 1);
  assert.equal(found[0].severity, 'error');
  assert.match(found[0].message, /CAP-099/);
});

test('R02: a finding must be a debt entry that came from this review', () => {
  const finding = (over) => {
    const m = withReviews(entry({ findings: [m0Id()] }));
    Object.assign(m.debt[0].data.entries[0], over);
    return validateModel(m).filter((f) => f.rule === 'R02');
  };
  const m0Id = () => structuredClone(loadProject(EXAMPLE)).debt[0].data.entries[0].id;
  assert.deepEqual(finding({ origin: { type: 'review', ref: 'RV-001' } }), []);
  const wrongOrigin = finding({ origin: { type: 'slice', ref: 'SL-002' } });
  assert.equal(wrongOrigin.length, 1);
  assert.equal(wrongOrigin[0].severity, 'error');
  assert.match(wrongOrigin[0].message, /RV-001/);
  assert.equal(finding({ origin: { type: 'review', ref: 'RV-002' } }).length, 1, 'another review');
  const missing = validateModel(withReviews(entry({ findings: ['DEBT-FE-099'] }))).filter((f) => f.rule === 'R02');
  assert.equal(missing.length, 1);
  assert.match(missing[0].message, /DEBT-FE-099/);
});

test('every rule the review adds is described', () => {
  for (const id of ['R01', 'R02']) assert.ok(RULES[id]?.length > 20, id);
});

// ── when a review is due ─────────────────────────────────────────
test('pendingReviews: a capability whose every live slice is closed, the last one after the standard was decided', () => {
  assert.deepEqual(pendingReviews(closed(['SL-003'])).map((c) => c.id), ['CAP-002']);
  assert.deepEqual(pendingReviews(closed(['SL-002'])), [], 'CAP-001 still has SL-004');
  assert.deepEqual(pendingReviews(closed(['SL-002', 'SL-004'])).map((c) => c.id), ['CAP-001']);
  const dropped = closed(['SL-002']);
  dropped.slices.find((s) => s.data.id === 'SL-004').data.status = 'dropped';
  assert.deepEqual(pendingReviews(dropped).map((c) => c.id), ['CAP-001'], 'a dropped slice does not hold it back');
  assert.deepEqual(pendingReviews(structuredClone(loadProject(EXAMPLE))), [], 'nothing is closed');
});

test('pendingReviews: not for work closed before the standard, nor when a review exists, nor for glance and custom', () => {
  assert.deepEqual(pendingReviews(closed(['SL-003'], '2026-10-01')), [], 'closed before 2026-10-24');
  assert.deepEqual(pendingReviews(closed(['SL-003'], '2026-10-24')).map((c) => c.id), ['CAP-002'], 'the same day counts');
  const reviewed = closed(['SL-003']);
  reviewed.reviews = [entry({ status: 'closed', closed_on: '2026-11-27' })];
  assert.deepEqual(pendingReviews(reviewed), [], 'reviewed once is reviewed');
  const open = closed(['SL-003']);
  open.reviews = [entry()];
  assert.deepEqual(pendingReviews(open), [], 'being reviewed');
  assert.deepEqual(pendingReviews(choice(closed(['SL-003']), { decision: 'adopt', choice: 'glance' })), [], 'glance is level 1 only');
  for (const c of ['review', 'external']) assert.equal(pendingReviews(choice(closed(['SL-003']), { decision: 'adopt', choice: c })).length, 1, c);
  assert.deepEqual(pendingReviews(choice(closed(['SL-003']), { decision: 'adopt', choice: 'custom', details: 'Our QA team reviews' })), []);
  assert.deepEqual(pendingReviews(choice(closed(['SL-003']), { decision: 'later', trigger: 'git_remote' })), []);
});

test('openReviews and suggestedMode: the unfinished ones, and the mode the person chose last', () => {
  const m = withReviews(entry({ status: 'closed', closed_on: '2026-11-27', mode: 'guide' }), { ...entry({ id: 'RV-002', mode: 'delegate' }), file: '.sddpp/reviews/RV-002-project.md' });
  assert.deepEqual(openReviews(m).map((r) => r.id), ['RV-002']);
  assert.equal(suggestedMode(m), 'delegate', 'the latest');
  assert.equal(suggestedMode(withReviews()), 'explain', 'with none, say what will be done');
});

// ── opening one ──────────────────────────────────────────────────
test('openReview: writes the file with the surfaces, the rubric and what was reviewed, and the project stays valid', (t) => {
  const r = closedRepo(t);
  const result = openReview(r.dir, { scope: 'project', mode: 'guide', by: 'owner', today: '2026-11-26' });
  assert.equal(result.review, 'RV-001');
  assert.deepEqual(files(r.dir), ['RV-001-project.md']);
  const text = readFileSync(join(r.dir, '.sddpp/reviews', files(r.dir)[0]), 'utf8');
  assert.match(text, /^id: RV-001$/m);
  assert.match(text, /^mode: guide$/m);
  assert.match(text, /^mode_chosen_by: owner$/m);
  assert.match(text, /^status: open$/m);
  for (const needle of ['## What was reviewed', 'SL-001', '## Rubric', 'S-01', 'A-01', '## Answers', '## Findings']) assert.ok(text.includes(needle), needle);
  assert.ok(!text.includes('C-01'), 'a command line is not in this project unless asked');
  assert.deepEqual(errors(loadProject(r.dir)), []);
  assert.match(result.text, /RV-001/);
});

test('openReview: a capability, the next id, and surfaces the person adds', (t) => {
  const r = closedRepo(t);
  openReview(r.dir, { scope: 'CAP-001', mode: 'explain', by: 'owner', today: '2026-11-26' });
  openReview(r.dir, { scope: 'project', mode: 'delegate', by: 'owner', surfaces: ['cli', 'docs'], today: '2026-11-26' });
  assert.deepEqual(files(r.dir), ['RV-001-cap-001.md', 'RV-002-project.md']);
  const second = readFileSync(join(r.dir, '.sddpp/reviews/RV-002-project.md'), 'utf8');
  for (const needle of ['C-01', 'D-01', 'S-01', 'A-01']) assert.ok(second.includes(needle), needle);
  assert.deepEqual(errors(loadProject(r.dir)), []);
});

test('openReview: refuses what makes no sense, and writes nothing', (t) => {
  const r = closedRepo(t);
  const asks = { mode: 'explain', by: 'owner', today: '2026-11-26' };
  fails(() => openReview(r.dir, { scope: 'project', ...asks, by: ' ' }), /--by/);
  fails(() => openReview(r.dir, { scope: 'project', ...asks, mode: 'wing-it' }), /guide, explain or delegate/);
  fails(() => openReview(r.dir, { scope: 'project', ...asks, mode: undefined }), /--mode/);
  fails(() => openReview(r.dir, { scope: 'CAP-099', ...asks }), /CAP-099/);
  fails(() => openReview(r.dir, { scope: 'CAP-004', ...asks }), /nothing|closed|built/i);
  fails(() => openReview(r.dir, { scope: 'project', ...asks, surfaces: ['hologram'] }), /hologram/);
  fails(() => openReview(r.dir, { scope: 'tomorrow', ...asks }), /CAP-|project/);
  assert.throws(() => files(r.dir), /ENOENT/);
  openReview(r.dir, { scope: 'project', ...asks });
  fails(() => openReview(r.dir, { scope: 'project', ...asks }), /already|open/i);
  assert.deepEqual(files(r.dir), ['RV-001-project.md']);
});

test('openReview: nothing closed yet means nothing to review', (t) => {
  const r = repo(t);
  fails(() => openReview(r.dir, { scope: 'project', mode: 'explain', by: 'owner' }), /nothing|closed|built/i);
});

// ── the card and the panel ───────────────────────────────────────
test('show: a complete capability says what a review is, what it covers, and how to start it', () => {
  const card = renderDecision(closed(['SL-003']), 'CAP-002');
  for (const needle of ['CAP-002', 'Complete tasks', 'SL-003', 'Screens', 'ppc review CAP-002']) assert.ok(card.includes(needle), needle);
  assert.equal(renderDecision(closed(['SL-002']), 'CAP-001'), null, 'not complete: nothing is asked');
});

test('ask: how the review is done, the mode the person chose last first, each with the exact command', () => {
  const q = askFor(closed(['SL-003']), 'CAP-002').questions[0];
  const commands = q.options.filter((o) => o.label.includes(' — ppc ')).map((o) => o.label.split(' — ').at(-1));
  assert.deepEqual(commands, ['ppc review CAP-002 --mode explain', 'ppc review CAP-002 --mode guide', 'ppc review CAP-002 --mode delegate']);
  assert.ok(q.options.some((o) => o.label === 'Not yet'));
  const after = closed(['SL-003']);
  after.reviews = [entry({ scope: { type: 'capability', ref: 'CAP-001' }, mode: 'delegate', status: 'closed', closed_on: '2026-11-27' })];
  assert.equal(askFor(after, 'CAP-002').questions[0].options[0].label.split(' — ').at(-1), 'ppc review CAP-002 --mode delegate');
  assert.equal(askFor(closed(['SL-002']), 'CAP-001'), null);
});

test('ask review: a review of the whole project whenever the person wants one', () => {
  const q = askFor(closed(['SL-003']), 'review').questions[0];
  assert.deepEqual(q.options.filter((o) => o.label.includes(' — ppc ')).map((o) => o.label.split(' — ').at(-1)),
    ['ppc review --project --mode explain', 'ppc review --project --mode guide', 'ppc review --project --mode delegate']);
  assert.equal(askFor(structuredClone(loadProject(EXAMPLE)), 'review'), null, 'nothing closed');
  const busy = closed(['SL-003']);
  busy.reviews = [entry({ scope: { type: 'project' } })];
  assert.equal(askFor(busy, 'review'), null, 'one is open');
});

// ── ppc next ─────────────────────────────────────────────────────
test('next: a capability to review waits for the person, and an open review is the agent\'s turn; neither stops the work', () => {
  const m = closed(['SL-003']);
  const due = nextSteps(m, [], []).waiting.find((a) => a.decision?.type === 'review');
  assert.deepEqual([due.who, due.decision.id], ['human', 'CAP-002']);
  assert.match(due.command, /ppc review CAP-002/);
  assert.match(due.what, /holds nothing up/i);
  m.reviews = [entry()];
  const r = nextSteps(m, [], []);
  assert.ok(!r.waiting.some((a) => a.decision?.type === 'review'), 'it is being reviewed');
  const turn = r.waiting.find((a) => a.who === 'agent' && /RV-001/.test(a.command));
  assert.equal(turn.command, '/pp-experience RV-001');
  assert.ok(!r.actions.some((a) => /RV-001|review/.test(a.command ?? '')), 'never the next step of the work');
});

test('next: a panel answer that chose how to review, not yet carried out, is reported', () => {
  const now = Date.now() / 1000;
  const r = nextSteps(closed(['SL-003']), [], [], { answers: [{ command: 'ppc review CAP-002 --mode guide', label: 'Guide me — ppc review CAP-002 --mode guide', at: now }], now });
  assert.equal(r.answered.length, 1);
  assert.deepEqual([r.answered[0].decision.type, r.answered[0].decision.id], ['review', 'CAP-002']);
});

// ── the command line ─────────────────────────────────────────────
test('CLI: ppc review opens one for a capability or the project; a missing mode or an unknown option is refused', (t) => {
  const r = closedRepo(t);
  const run = (...args) => spawnSync('node', [CLI, 'review', ...args, r.dir], { encoding: 'utf8' });
  assert.equal(run('--project', '--mode', 'guide', '--by', 'owner', '--surprise').status, 2);
  assert.equal(run('--project', '--by', 'owner').status, 1, 'the mode is the person\'s choice');
  const one = run('--project', '--mode', 'guide', '--by', 'owner');
  assert.equal(one.status, 0, one.stderr);
  assert.match(one.stdout, /RV-001/);
  const two = run('CAP-001', '--mode', 'explain', '--by', 'owner', '--surface', 'cli');
  assert.equal(two.status, 0, two.stderr);
  assert.deepEqual(files(r.dir), ['RV-001-project.md', 'RV-002-cap-001.md']);
  assert.equal(run('--mode', 'guide', '--by', 'owner').status, 1, 'say what to review');
});

test('CLI: ppc show and ppc ask take a capability and the word review', (t) => {
  const r = closedRepo(t);
  const show = spawnSync('node', [CLI, 'show', 'review', r.dir], { encoding: 'utf8' });
  assert.match(show.stdout, /ppc review --project/);
  const ask = JSON.parse(spawnSync('node', [CLI, 'ask', 'review', r.dir], { encoding: 'utf8' }).stdout);
  assert.match(ask.questions[0].question, /review/i);
});
