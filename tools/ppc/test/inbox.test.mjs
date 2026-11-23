import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { loadProject } from '../src/load.mjs';
import { nextSteps, renderNext, nextJson, inboxOf } from '../src/next.mjs';
import { renderInbox, askInbox, INBOX_PANEL } from '../src/inbox.mjs';
import { ROLES } from '../src/tools.mjs';
import { EXAMPLE, CLI, repo } from './helpers.mjs';

// The inbox (found in the first real project, 2026-11-23): what waits for a person's look and holds nothing up (glances, reviews,
// outside tests, tool roles) was printed one item per slice, each saying "it holds nothing up". From SL-047 on no glance was
// answered, and eight piled up beside the work. Now `ppc next` says it in one line, `ppc inbox` lists it oldest first, and `ppc ask inbox` puts several in
// one panel call.

/** The example with every tool role decided, so only what a test closes waits (the example leaves the roles to decide). */
const quiet = () => {
  const m = structuredClone(loadProject(EXAMPLE));
  m.tools = { data: { tools: ROLES.map((r) => ({ role: r.id, decision: 'not_needed' })) } };
  return m;
};

/** That example with these slices closed on these days (the experience standard was decided on 2026-10-24). */
const closed = (days) => {
  const m = quiet();
  for (const [id, day] of Object.entries(days)) Object.assign(m.slices.find((s) => s.data.id === id).data, { status: 'done', closed_on: day });
  return m;
};

test('next: what holds nothing up and waits for a person is one line, not one line per item', () => {
  const r = nextSteps(closed({ 'SL-002': '2026-11-20', 'SL-003': '2026-11-22' }), [], []);
  const text = renderNext(r);
  assert.doesNotMatch(text, /ppc glance SL-00[23]/, 'the glances are not listed one by one');
  assert.match(text, /things wait for your look \([^)]*2 glances/);
  assert.match(text, /ppc inbox/);
});

test('next --json: the inbox is its own field, and waiting keeps only what is not in it', () => {
  const json = nextJson(nextSteps(closed({ 'SL-002': '2026-11-20', 'SL-003': '2026-11-22' }), [], []));
  assert.ok(!json.waiting.some((a) => a.inbox || ['glance', 'review', 'outside', 'tools', 'tool'].includes(a.decision?.type)));
  const glances = json.inbox.items.filter((a) => a.decision.type === 'glance');
  assert.deepEqual(glances.map((a) => [a.decision.id, a.since]), [['SL-002', '2026-11-20'], ['SL-003', '2026-11-22']]);
  assert.equal(json.inbox.count, json.inbox.items.length);
  assert.match(json.inbox.summary, /2 glances/);
});

test('next: with nothing in the inbox there is no line and the field is empty', () => {
  const r = nextSteps(quiet(), [], []);
  assert.doesNotMatch(renderNext(r), /wait for your look/);
  assert.deepEqual(nextJson(r).inbox, { count: 0, summary: '', items: [] });
});

test('next: an answer given through the inbox panel is still reported when nothing carried it out', () => {
  const now = Date.now() / 1000;
  const r = nextSteps(closed({ 'SL-003': '2026-11-22' }), [], [], { answers: [{ command: 'ppc glance SL-003', label: 'Yes, I looked at it — ppc glance SL-003', at: now }], now });
  assert.deepEqual(r.answered.map((a) => a.decision.id), ['SL-003']);
});

test('inbox: oldest first, each with how long it has waited and where to read it', () => {
  const items = inboxOf(nextSteps(closed({ 'SL-003': '2026-11-22', 'SL-002': '2026-11-20' }), [], [])).filter((a) => a.decision.type === 'glance');
  assert.deepEqual(items.map((a) => a.decision.id), ['SL-002', 'SL-003']);
  const text = renderInbox(items, { today: '2026-11-23' });
  assert.match(text, /^2 things wait for your look/);
  assert.match(text, /SL-002 .*waiting 3 days/);
  assert.match(text, /SL-003 .*waiting 1 day\b/);
  assert.match(text, /ppc show SL-002/);
  assert.match(text, /ppc ask inbox/);
  assert.ok(text.indexOf('SL-002') < text.indexOf('SL-003'));
});

test('inbox: an empty inbox says so', () => {
  assert.match(renderInbox([], { today: '2026-11-23' }), /Nothing waits for your look/);
});

test('ask inbox: several questions in one panel, oldest first, each with the options of its own question', () => {
  const days = { 'SL-001': '2026-11-19', 'SL-002': '2026-11-20', 'SL-003': '2026-11-21', 'SL-004': '2026-11-22', 'SL-005': '2026-11-23' };
  const m = closed(days);
  const asked = askInbox(m);
  assert.equal(asked.questions.length, INBOX_PANEL);
  assert.equal(INBOX_PANEL, 4, 'the panel takes at most four questions');
  // a capability these closes complete waits for its review too, dated by its last slice: it may come between the glances
  const order = inboxOf(nextSteps(m, [], [])).map((a) => a.decision.id);
  assert.deepEqual(asked.questions.map((q) => q.header), order.slice(0, 4));
  assert.equal(asked.remaining, order.length - 4);
  assert.ok(asked.questions.some((q) => q.header === 'SL-001'), 'the oldest glance is asked');
  const [first] = asked.questions;
  assert.match(first.question, /SL-001/);
  assert.ok(first.options.some((o) => o.label.endsWith('— ppc glance SL-001')));
  assert.ok(first.options.some((o) => o.label.endsWith('— ppc glance SL-001 --skip')));
  assert.equal(new Set(asked.questions.map((q) => q.question)).size, 4, 'each question is its own');
});

test('ask inbox: nothing to ask is null', () => {
  assert.equal(askInbox(quiet()), null);
});

test('cli: ppc inbox lists, and ppc ask inbox prints the panel', (t) => {
  const r = repo(t);
  const out = spawnSync('node', [CLI, 'inbox'], { cwd: r.dir, encoding: 'utf8' });
  assert.equal(out.status, 0, out.stderr);
  assert.match(out.stdout, /for your look/);
  const asked = spawnSync('node', [CLI, 'ask', 'inbox'], { cwd: r.dir, encoding: 'utf8' });
  // the example has nothing closed since the standard, and a tool role is not asked from the inbox: nothing to ask
  assert.equal(asked.status, 1);
  assert.match(asked.stderr, /inbox: there is nothing to decide/);
});
