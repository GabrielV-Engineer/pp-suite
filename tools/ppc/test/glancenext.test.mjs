import test from 'node:test';
import assert from 'node:assert/strict';
import { loadProject } from '../src/load.mjs';
import { nextSteps, renderNext, nextJson } from '../src/next.mjs';
import { EXAMPLE } from './helpers.mjs';

// A closed slice nobody has looked at waits beside the work, as the person's turn. It never stops anything
// (docs/standards.md, "Experience").

/** The example with these slices closed on this day (the experience standard was decided on 2026-10-24). */
const closedOn = (day, ids = ['SL-003'], over = {}) => {
  const m = structuredClone(loadProject(EXAMPLE));
  for (const s of m.slices.filter((x) => ids.includes(x.data.id))) Object.assign(s.data, { status: 'done', ...(day ? { closed_on: day } : {}), ...over });
  return m;
};
const glances = (r) => r.waiting.filter((a) => a.decision?.type === 'glance');

test('next: a closed slice nobody has looked at waits beside the work, with the command', () => {
  const r = nextSteps(closedOn('2026-11-25'), [], []);
  assert.equal(glances(r).length, 1);
  const [one] = glances(r);
  assert.deepEqual([one.who, one.command, one.decision.id], ['human', 'ppc glance SL-003', 'SL-003']);
  assert.match(one.what, /SL-003/);
  assert.match(one.what, /holds nothing up/i);
  assert.ok(!r.actions.some((a) => a.decision?.type === 'glance'), 'it is never the next step of the work');
});

test('next: one entry for each closed slice waiting, and none for what was looked at, skipped or closed before the standard', () => {
  const two = closedOn('2026-11-25', ['SL-002', 'SL-003']);
  assert.deepEqual(glances(nextSteps(two, [], [])).map((a) => a.decision.id).sort(), ['SL-002', 'SL-003']);
  const looked = closedOn('2026-11-25', ['SL-003'], { glanced_by: 'owner', glanced_on: '2026-11-26' });
  assert.deepEqual(glances(nextSteps(looked, [], [])), []);
  const skipped = closedOn('2026-11-25', ['SL-003'], { glanced_by: 'owner', glanced_on: '2026-11-26', glance_skipped: true });
  assert.deepEqual(glances(nextSteps(skipped, [], [])), []);
  assert.deepEqual(glances(nextSteps(closedOn('2026-10-01'), [], [])), [], 'closed before the standard');
  assert.deepEqual(glances(nextSteps(closedOn(null), [], [])), [], 'closed before the date was kept');
});

test('next: nothing waits when no slice is closed', () => {
  assert.deepEqual(glances(nextSteps(structuredClone(loadProject(EXAMPLE)), [], [])), []);
});

test('next: it is counted in the inbox line, and its command is in the inbox of the JSON (test/inbox.test.mjs)', () => {
  const r = nextSteps(closedOn('2026-11-25'), [], []);
  assert.match(renderNext(r), /1 glance/);
  assert.ok(nextJson(r).inbox.items.some((a) => a.command === 'ppc glance SL-003'));
});

test('next: a panel answer that looked, not yet carried out, is reported', () => {
  const m = closedOn('2026-11-25');
  const now = Date.now() / 1000;
  const r = nextSteps(m, [], [], { answers: [{ command: 'ppc glance SL-003', label: 'Yes, I looked at it — ppc glance SL-003', at: now }], now });
  assert.equal(r.answered.length, 1);
  assert.deepEqual([r.answered[0].decision.type, r.answered[0].decision.id], ['glance', 'SL-003']);
});
