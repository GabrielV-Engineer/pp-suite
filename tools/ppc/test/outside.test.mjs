import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadProject } from '../src/load.mjs';
import { validateModel } from '../src/validate.mjs';
import { start, finish, LifecycleError } from '../src/lifecycle.mjs';
import { openReview, recordOutside } from '../src/reviewfile.mjs';
import { pendingOutside, renderGuide } from '../src/guide.mjs';
import { renderDecision, askFor } from '../src/decisions.mjs';
import { nextSteps } from '../src/next.mjs';
import { CLI, EXAMPLE, lines, repo } from './helpers.mjs';

// The outside test (level 3 of the experience standard): someone other than the builder tries what was built. pp-suite assumes no
// number of people, no team and no cost: the person decides who and whether, and skipping it is recorded and holds nothing up.

const fails = (fn, pattern) => assert.throws(fn, (e) => e instanceof LifecycleError && pattern.test(e.message));
const errors = (m) => validateModel(m).filter((f) => f.severity === 'error');

const review = (over = {}) => ({
  file: '.sddpp/reviews/RV-001-cap-002.md', body: '',
  data: { id: 'RV-001', scope: { type: 'capability', ref: 'CAP-002' }, mode: 'explain', mode_chosen_by: 'owner', surfaces: ['screen'], opened_on: '2026-11-26', status: 'closed', closed_on: '2026-11-27', ...over },
});
/** The example in memory: SL-003 closed (CAP-002 is complete), this review, and the experience standard as `external` unless said otherwise. */
const model = (reviewOver = {}, standard = { decision: 'adopt', choice: 'external' }) => {
  const m = structuredClone(loadProject(EXAMPLE));
  Object.assign(m.slices.find((s) => s.data.id === 'SL-003').data, { status: 'done', closed_on: '2026-11-25' });
  m.reviews = [review(reviewOver)];
  m.standards.data.standards = m.standards.data.standards.map((x) => (x.id === 'experience' ? { id: 'experience', decided_by: 'o', decided_on: '2026-10-24', ...standard } : x));
  return m;
};
const files = (dir) => readFileSync(join(dir, '.sddpp/reviews/RV-001-project.md'), 'utf8');

/** A copy of the example with SL-001 closed and a project review of it, closed by the agent. */
const reviewedRepo = (t) => {
  const r = repo(t);
  const bp = '.architect/blueprint.yaml';
  r.write({ [bp]: readFileSync(join(r.dir, bp), 'utf8').replace('budgets:', 'default_mode: light\nbudgets:') });
  r.git('add', '-A');
  r.git('commit', '-q', '-m', 'light by default');
  start(r.dir, 'SL-001');
  const sha = r.commit('build(SL-001): health endpoint and its test', { 'src/health.js': lines(5), 'tests/health.test.js': lines(3) });
  finish(r.dir, 'SL-001', { commits: [{ sha, kind: 'build' }], tests_added: 1 }, { now: new Date('2026-11-21T10:00:00Z') });
  openReview(r.dir, { scope: 'project', mode: 'explain', by: 'owner', today: '2026-11-22' });
  const file = '.sddpp/reviews/RV-001-project.md';
  r.write({ [file]: readFileSync(join(r.dir, file), 'utf8').replace('status: open', 'status: closed\nclosed_on: 2026-11-23') });
  return r;
};

// ── the contract ─────────────────────────────────────────────────
test('SCHEMA: an outside test names who and when, may carry a note, and only a closed review has one', () => {
  const m = (over) => model(over);
  const bad = (over) => validateModel(m(over)).some((f) => f.rule === 'SCHEMA' && f.file.includes('reviews'));
  assert.ok(!bad({ outside_by: 'owner', outside_on: '2026-11-28' }));
  assert.ok(!bad({ outside_by: 'owner', outside_on: '2026-11-28', outside_note: 'Two colleagues tried it over lunch' }));
  assert.ok(!bad({ outside_by: 'owner', outside_on: '2026-11-28', outside_skipped: true, outside_note: 'Nobody is free this month' }));
  assert.ok(bad({ outside_by: 'owner' }), 'when is missing');
  assert.ok(bad({ outside_on: '2026-11-28' }), 'who is missing');
  assert.ok(bad({ outside_skipped: true }), 'a skip says who skipped it');
  assert.ok(bad({ outside_note: 'They liked it' }), 'a note belongs to a record');
  assert.ok(bad({ status: 'open', closed_on: undefined, outside_by: 'owner', outside_on: '2026-11-28' }), 'an open review is not tried yet');
});

// ── when it is waiting ───────────────────────────────────────────
test('pendingOutside: a closed review, under external, closed after the standard was decided, with no record', () => {
  assert.deepEqual(pendingOutside(model()).map((r) => r.id), ['RV-001']);
});

test('pendingOutside: not under review, glance or custom; not while the review is open; not before the standard; not once recorded', () => {
  assert.deepEqual(pendingOutside(model({}, { decision: 'adopt', choice: 'review' })), []);
  assert.deepEqual(pendingOutside(model({}, { decision: 'adopt', choice: 'glance' })), []);
  assert.deepEqual(pendingOutside(model({}, { decision: 'adopt', choice: 'custom', details: 'Our QA team tries it' })), []);
  assert.deepEqual(pendingOutside(model({}, { decision: 'not_needed', reason: 'Nothing a person uses' })), []);
  assert.deepEqual(pendingOutside(model({ status: 'open', closed_on: undefined })), []);
  assert.deepEqual(pendingOutside(model({ closed_on: '2026-10-01' })), [], 'closed before 2026-10-24');
  assert.deepEqual(pendingOutside(model({ outside_by: 'owner', outside_on: '2026-11-28' })), []);
  assert.deepEqual(pendingOutside(model({ outside_by: 'owner', outside_on: '2026-11-28', outside_skipped: true })), []);
});

// ── the guide ────────────────────────────────────────────────────
test('guide: what to ask them to do, what to watch for, and how to say it was done or skipped', () => {
  const m = model();
  const text = renderGuide(m, m.reviews[0].data);
  for (const needle of ['CAP-002', 'Complete tasks', 'SL-003', 'AC-1', 'Ask them to', 'Watch for', 'ppc outside RV-001', 'ppc outside RV-001 --skip']) assert.ok(text.includes(needle), needle);
  assert.match(text, /holds nothing up/i);
  assert.match(text, /does not explain|without explaining|do not explain/i, 'the builder says nothing while they try');
  assert.equal(renderGuide(m, m.reviews[0].data), text, 'the same text every time');
});

test('guide: assumes no number of people, no team and no cost, and says the person decides who', () => {
  const m = model();
  const text = renderGuide(m, m.reviews[0].data);
  assert.doesNotMatch(text, /\b\d+\s+(people|persons|users|testers|participants|colleagues)\b/i);
  assert.doesNotMatch(text, /\b(five|three|two|four)\s+(people|users|testers|participants)\b/i);
  assert.doesNotMatch(text, /\$|€|\bpay(ing)? (them|participants|users)\b/i);
  assert.match(text, /you decide|your decision|the person decides|up to you/i);
  assert.match(text, /after some time away|someone who did not build it/i);
});

test('guide: a review of the whole project covers every closed slice, and a surface adds its own things to watch', () => {
  const m = model({ id: 'RV-001', scope: { type: 'project' }, surfaces: ['screen', 'cli'] });
  const text = renderGuide(m, m.reviews[0].data);
  assert.match(text, /whole project/i);
  assert.match(text, /SL-003/);
  assert.match(text, /command|terminal|typed/i, 'a command line asks them to type, so it says what to watch there');
});

// ── the card and the panel ───────────────────────────────────────
test('show: a review waiting for an outside test carries the guide; one that is not, does not', () => {
  const card = renderDecision(model(), 'RV-001');
  for (const needle of ['RV-001', 'Ask them to', 'ppc outside RV-001']) assert.ok(card.includes(needle), needle);
  const plain = renderDecision(model({}, { decision: 'adopt', choice: 'review' }), 'RV-001');
  assert.ok(plain.includes('RV-001') && !plain.includes('Ask them to'), 'a status card, with no guide');
  assert.equal(renderDecision(model(), 'RV-099'), null);
});

test('ask: tried, will not, or not yet; the first two end with the exact command', () => {
  const q = askFor(model(), 'RV-001').questions[0];
  const commands = q.options.filter((o) => o.label.includes(' — ppc ')).map((o) => o.label.split(' — ').at(-1));
  assert.deepEqual(commands, ['ppc outside RV-001', 'ppc outside RV-001 --skip']);
  assert.ok(q.options.some((o) => o.label === 'Not yet'));
  assert.equal(askFor(model({ outside_by: 'owner', outside_on: '2026-11-28' }), 'RV-001'), null, 'already said');
  assert.equal(askFor(model({}, { decision: 'adopt', choice: 'review' }), 'RV-001'), null, 'not under external');
});

// ── ppc next ─────────────────────────────────────────────────────
test('next: waits for the person beside the work, and is never the next step', () => {
  const r = nextSteps(model(), [], []);
  const one = r.waiting.find((a) => a.decision?.type === 'outside');
  assert.deepEqual([one.who, one.command, one.decision.id], ['human', 'ppc outside RV-001', 'RV-001']);
  assert.match(one.what, /holds nothing up/i);
  assert.ok(!r.actions.some((a) => a.decision?.type === 'outside'));
  assert.ok(!nextSteps(model({ outside_by: 'owner', outside_on: '2026-11-28', outside_skipped: true }), [], []).waiting.some((a) => a.decision?.type === 'outside'));
});

test('next: a panel answer that said someone tried it, not yet carried out, is reported', () => {
  const now = Date.now() / 1000;
  const r = nextSteps(model(), [], [], { answers: [{ command: 'ppc outside RV-001', label: 'Yes, someone tried it — ppc outside RV-001', at: now }], now });
  assert.deepEqual([r.answered[0].decision.type, r.answered[0].decision.id], ['outside', 'RV-001']);
});

// ── recording it ─────────────────────────────────────────────────
test('outside: records who and when, and a note if there is one, and changes nothing else', (t) => {
  const r = reviewedRepo(t);
  const before = files(r.dir).split('\n');
  const result = recordOutside(r.dir, 'RV-001', { by: 'owner', note: 'A colleague tried it for ten minutes', today: '2026-11-28' });
  assert.deepEqual(result, { review: 'RV-001', outside_by: 'owner', outside_on: '2026-11-28', skipped: false });
  const added = files(r.dir).split('\n').filter((l) => !before.includes(l));
  assert.deepEqual(added.map((l) => l.split(':')[0]).sort(), ['outside_by', 'outside_note', 'outside_on']);
  assert.deepEqual(errors(loadProject(r.dir)), []);
});

test('outside --skip: recorded as skipped, with or without a reason, and it is no blocker', (t) => {
  const r = reviewedRepo(t);
  assert.equal(recordOutside(r.dir, 'RV-001', { by: 'owner', skip: true, today: '2026-11-28' }).skipped, true);
  assert.match(files(r.dir), /^outside_skipped: true$/m);
  assert.deepEqual(errors(loadProject(r.dir)), []);
});

test('outside: refuses what makes no sense, and changes nothing', (t) => {
  const r = reviewedRepo(t);
  const before = files(r.dir);
  fails(() => recordOutside(r.dir, 'RV-001', { today: '2026-11-28' }), /--by/);
  fails(() => recordOutside(r.dir, 'RV-099', { by: 'owner' }), /unknown review/);
  fails(() => recordOutside(r.dir, 'RV-001', { by: 'owner', note: 'ok' }), /note/);
  assert.equal(files(r.dir), before);
  recordOutside(r.dir, 'RV-001', { by: 'owner', today: '2026-11-28' });
  fails(() => recordOutside(r.dir, 'RV-001', { by: 'someone else' }), /already/);
});

test('outside: not while the review is still open', (t) => {
  const r = repo(t);
  r.write({ '.architect/blueprint.yaml': readFileSync(join(r.dir, '.architect/blueprint.yaml'), 'utf8').replace('budgets:', 'default_mode: light\nbudgets:') });
  r.git('add', '-A');
  r.git('commit', '-q', '-m', 'light');
  start(r.dir, 'SL-001');
  const sha = r.commit('build(SL-001): health', { 'src/health.js': lines(5), 'tests/health.test.js': lines(3) });
  finish(r.dir, 'SL-001', { commits: [{ sha, kind: 'build' }], tests_added: 1 });
  openReview(r.dir, { scope: 'project', mode: 'explain', by: 'owner' });
  fails(() => recordOutside(r.dir, 'RV-001', { by: 'owner' }), /open|closed|reviewed/i);
});

// ── the command line ─────────────────────────────────────────────
test('CLI: ppc guide prints it; ppc outside records it, with --skip and --note; unknown options and ids are refused', (t) => {
  const r = reviewedRepo(t);
  const run = (...args) => spawnSync('node', [CLI, ...args, r.dir], { encoding: 'utf8' });
  const guide = run('guide', 'RV-001');
  assert.equal(guide.status, 0, guide.stderr);
  assert.match(guide.stdout, /Ask them to/);
  assert.equal(run('guide', 'RV-099').status, 1);
  assert.equal(run('guide').status, 1);
  assert.equal(run('outside', 'RV-001', '--by', 'owner', '--surprise').status, 2);
  assert.equal(run('outside', '--by', 'owner').status, 1);
  const done = run('outside', 'RV-001', '--by', 'owner', '--note', 'A colleague tried it');
  assert.equal(done.status, 0, done.stderr);
  assert.match(files(r.dir), /^outside_note: A colleague tried it$/m);
  assert.equal(run('outside', 'RV-001', '--by', 'owner').status, 1, 'already said');
});
