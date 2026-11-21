import test from 'node:test';
import assert from 'node:assert/strict';
import { loadProject } from '../src/load.mjs';
import { validateModel } from '../src/validate.mjs';
import { lookAt } from '../src/glance.mjs';
import { renderGuide } from '../src/guide.mjs';
import { EXAMPLE } from './helpers.mjs';

// What a person is asked to look at or to try is what a person can see. A criterion nobody who uses the thing could see (CI, the
// build, an internal check) says `audience: system`, and the look-at list and the guide leave it out, saying which were left out.
// Without the field a criterion is shown: pp-suite does not guess from the words.

const withCriteria = (acceptance) => {
  const m = structuredClone(loadProject(EXAMPLE));
  const s = m.slices.find((x) => x.data.id === 'SL-003').data;
  Object.assign(s, { status: 'done', closed_on: '2026-11-25', acceptance });
  return { m, s };
};
const USER = { id: 'AC-1', scenario: 'Given an open task, when the owner marks it as completed, then the list shows it as completed.' };
const SYSTEM = { id: 'AC-2', scenario: 'Given a change is pushed, when CI runs, then it executes the unit tests and the architecture tests.', audience: 'system' };

test('SCHEMA: a criterion may say who can see it: user or system, and nothing else', () => {
  const bad = (audience) => validateModel(withCriteria([{ ...USER, audience }]).m).some((f) => f.rule === 'SCHEMA' && /audience/.test(f.message));
  assert.ok(!bad('user'));
  assert.ok(!bad('system'));
  assert.ok(bad('robot'));
});

test('lookAt: a criterion for the system is left out, and the list says which', () => {
  const { m, s } = withCriteria([USER, SYSTEM]);
  const text = lookAt(m, s).join('\n');
  assert.match(text, /Try it yourself, AC-1/);
  assert.ok(!/Try it yourself, AC-2/.test(text), 'nobody can try CI');
  assert.match(text, /not for a person to try.*AC-2/i);
});

test('lookAt: with no field a criterion is shown, and with none left out there is no such line', () => {
  const { m, s } = withCriteria([USER, { id: 'AC-2', scenario: 'Given a change is pushed, when CI runs, then it executes the unit tests.' }]);
  const text = lookAt(m, s).join('\n');
  assert.match(text, /Try it yourself, AC-2/, 'pp-suite does not guess from the words');
  assert.ok(!/not for a person to try/i.test(text));
});

test('guide: only what a person can try is asked of them, and a slice with none says to do what the thing is for', () => {
  const { m } = withCriteria([USER, SYSTEM]);
  const review = { id: 'RV-001', scope: { type: 'capability', ref: 'CAP-002' }, surfaces: ['screen'], status: 'closed' };
  const text = renderGuide(m, review);
  assert.match(text, /SL-003 AC-1/);
  assert.ok(!/AC-2/.test(text));
  const none = withCriteria([SYSTEM]);
  assert.match(renderGuide(none.m, review), /do what the thing is for/);
});

test('the example marks its CI criterion as for the system, and still validates', () => {
  const m = loadProject(EXAMPLE);
  const ci = m.slices.find((x) => x.data.id === 'SL-001').data.acceptance.find((a) => /CI runs/.test(a.scenario));
  assert.equal(ci.audience, 'system');
  assert.deepEqual(validateModel(m).filter((f) => f.severity === 'error'), []);
});
