import test from 'node:test';
import assert from 'node:assert/strict';
import { loadProject } from '../src/load.mjs';
import { askFor } from '../src/decisions.mjs';
import { ROLES } from '../src/tools.mjs';
import { EXAMPLE } from './helpers.mjs';

// Every panel question says why it is asked, in the question itself: the person may see only the panel. Found in the first real
// project: asked whether `db-inspect` needed a tool, the owner answered twice with a question ("justify why, in which cases it would
// be needed, and what it would be for"), and asked to pay three debts in SL-053 they said yes to all three, though two were due only
// on another machine; the trigger that said so was in the debt entry, not in the question.

const example = () => structuredClone(loadProject(EXAMPLE));
const question = (m, id, opts) => askFor(m, id, opts).questions[0].question;
const why = (text) => /Why: (.+)$/.exec(text)?.[1];

test('a tool role says what a tool in it is for and why the slices call for it', () => {
  for (const role of ROLES) assert.ok(role.for && role.for.length > 20, `${role.id} says what it is for`);
  const m = example();
  const db = ROLES.find((r) => r.id === 'db-inspect');
  const one = why(question(m, 'db-inspect'));
  assert.ok(one, 'the role question has a why');
  assert.ok(one.includes(db.for));
  assert.ok(one.includes(db.why));
  const all = why(question(m, 'tools'));
  assert.ok(all, 'the question about every role has a why');
  assert.ok(all.includes(db.for));
});

test('a debt question says what waiting costs and when it falls due, from the entry', () => {
  const m = example();
  const proposed = why(question(m, 'DEBT-BE-001'));
  assert.match(proposed, /low/);
  assert.match(proposed, /QA-001 assumes at most 1000 tasks/);
  assert.match(proposed, /When the stored task count passes 1000/);
});

test('paying a debt in a slice says when it falls due, so a slice that cannot pay it shows', () => {
  const m = example();
  const entry = m.debt[0].data.entries.find((e) => e.id === 'DEBT-BE-001');
  entry.status = 'open';
  const text = why(question(m, 'DEBT-BE-001', { payIn: 'SL-005' }));
  assert.match(text, /When the stored task count passes 1000/);
  assert.match(text, /SL-005 can pay it only if/);
});

test('a change request says what problem it answers', () => {
  assert.match(why(question(example(), 'CR-0001')), /QA-004 does not say how long is too long/);
});

test('approving a slice, its red tests, a glance and a reread each say why', () => {
  const m = example();
  assert.match(why(question(m, 'SL-002')), /build/i);
  const red = example();
  Object.assign(red.slices.find((s) => s.data.id === 'SL-001').data, { status: 'in_progress', phase: 'red' });
  assert.match(why(question(red, 'SL-001')), /locked/i);
  const closed = example();
  Object.assign(closed.slices.find((s) => s.data.id === 'SL-003').data, { status: 'done', closed_on: '2026-11-25' });
  assert.match(why(question(closed, 'SL-003')), /ppc show SL-003 lists \d+ things? to look at/);
  const behind = example();
  behind.slices.find((s) => s.data.id === 'SL-002').data.blueprint_revision = 0;
  assert.match(why(question(behind, 'reread')), /revision 0/);
});

test('every question the example can produce here has a why', () => {
  const m = example();
  const closed = example();
  Object.assign(closed.slices.find((s) => s.data.id === 'SL-003').data, { status: 'done', closed_on: '2026-11-25' });
  const progress = example();
  Object.assign(progress.slices.find((s) => s.data.id === 'SL-001').data, { status: 'in_progress', phase: 'build' });
  const asked = [
    [m, 'tools'], [m, 'db-inspect'], [m, 'ui-design'], [m, 'DEBT-BE-001'], [m, 'CR-0001'], [m, 'SL-002'], [closed, 'SL-003'],
    [progress, 'SL-001', { budgetReason: 'the import flow does not split' }], [m, 'SL-004', { addComponent: 'database' }],
  ];
  for (const [model, id, opts] of asked) {
    const q = askFor(model, id, opts);
    if (!q) continue;
    assert.ok(why(q.questions[0].question), `${id} ${JSON.stringify(opts ?? {})}: ${q.questions[0].question}`);
  }
});
