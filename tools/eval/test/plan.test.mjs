import test from 'node:test';
import assert from 'node:assert/strict';
import { CONDITIONS, buildPlan, classifySession, promptFor } from '../plan.mjs';
import { combineSessions } from '../lib.mjs';

// ── the plan ─────────────────────────────────────────────────────
const SLICES = ['SL-004', 'SL-006', 'SL-008'];

test('buildPlan: every slice, condition and repetition appears exactly once', () => {
  const plan = buildPlan({ slices: SLICES, reps: 5, seed: 7 });
  assert.equal(plan.length, 3 * 3 * 5);
  assert.equal(new Set(plan.map((r) => r.id)).size, plan.length);
  for (const slice of SLICES) for (const condition of CONDITIONS) {
    assert.equal(plan.filter((r) => r.slice === slice && r.condition === condition).length, 5);
  }
});

test('buildPlan: repetitions are interleaved, so stopping early still leaves complete rounds', () => {
  const plan = buildPlan({ slices: SLICES, reps: 5, seed: 7 });
  assert.deepEqual(plan.slice(0, 9).map((r) => r.rep), Array(9).fill(1));
  assert.deepEqual(plan.slice(9, 18).map((r) => r.rep), Array(9).fill(2));
});

test('buildPlan: the order of conditions varies, and is the same for the same seed', () => {
  const a = buildPlan({ slices: SLICES, reps: 5, seed: 7 });
  const b = buildPlan({ slices: SLICES, reps: 5, seed: 7 });
  const c = buildPlan({ slices: SLICES, reps: 5, seed: 8 });
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.map((r) => r.id), c.map((r) => r.id));
  const firsts = new Set(a.filter((r, i) => i % 3 === 0).map((r) => r.condition));
  assert.ok(firsts.size > 1, 'the condition that goes first must not always be the same');
});

test('buildPlan: ids name the run', () => {
  assert.match(buildPlan({ slices: ['SL-004'], reps: 1, seed: 1 })[0].id, /^SL-004-(B1|B2|T)-1$/);
});

// ── prompts ──────────────────────────────────────────────────────
const SLICE_FILE = '.sddpp/slices/SL-004-reject-invalid-titles.md';

test('promptFor: the plain condition names the slice and says nothing about method', () => {
  const p = promptFor('B1', 'all', 'SL-004', SLICE_FILE);
  assert.match(p, /SL-004/);
  assert.ok(p.includes(SLICE_FILE));
  assert.doesNotMatch(p, /test-first|TDD|red|green|ppc/i);
});

test('promptFor: instructed TDD adds only the instruction to work test-first', () => {
  const plain = promptFor('B1', 'all', 'SL-004', SLICE_FILE);
  const tdd = promptFor('B2', 'all', 'SL-004', SLICE_FILE);
  assert.ok(tdd.startsWith(plain));
  assert.match(tdd.slice(plain.length), /test-first/i);
  assert.doesNotMatch(tdd, /ppc|guard/i);
});

test('promptFor: the framework condition points each phase at its own prompt file', () => {
  for (const [phase, file] of [['red', 'red.md'], ['green', 'green.md'], ['audit', 'audit.md']]) {
    const p = promptFor('T', phase, 'SL-004', SLICE_FILE);
    assert.ok(p.includes(`.specify/extensions/sddpp-cycle/commands/${file}`), phase);
    assert.match(p, /SL-004/);
  }
});

test('promptFor: refuses an unknown condition or phase', () => {
  assert.throws(() => promptFor('X', 'all', 'SL-004', SLICE_FILE));
  assert.throws(() => promptFor('T', 'dance', 'SL-004', SLICE_FILE));
  assert.throws(() => promptFor('B1', 'red', 'SL-004', SLICE_FILE));
});

// ── what a session result means ──────────────────────────────────
test('classifySession: a normal result is ok', () => {
  assert.equal(classifySession({ is_error: false, subtype: 'success' }), 'ok');
});

test('classifySession: a usage limit is an infrastructure failure, not a result (it looks like a success)', () => {
  assert.equal(classifySession({ is_error: true, subtype: 'success', terminal_reason: 'api_error', result: 'You have hit your limit' }), 'infrastructure');
});

test('classifySession: running out of the budget cap is a result, and any other error is a failed run that is kept', () => {
  assert.equal(classifySession({ is_error: true, subtype: 'error_max_budget_usd' }), 'budget');
  assert.equal(classifySession({ is_error: true, subtype: 'error_during_execution' }), 'failed');
});

test('classifySession: no result at all (the process died) is an infrastructure failure', () => {
  assert.equal(classifySession(null), 'infrastructure');
});

// ── several sessions of one run ──────────────────────────────────
test('combineSessions: cost, time and turns add up; flags and counts combine', () => {
  const total = combineSessions([
    { usd: 0.3, minutes: 1, turns: 10, is_error: false, test_edit_calls: 0, guard_blocks: 1 },
    { usd: 0.5, minutes: 2.5, turns: 20, is_error: true, test_edit_calls: 2, guard_blocks: 0 },
  ]);
  assert.deepEqual(total, { sessions: 2, usd: 0.8, minutes: 3.5, turns: 30, any_error: true, test_edit_calls: 2, guard_blocks: 1 });
});

test('combineSessions: a missing transcript count stays unknown instead of becoming zero', () => {
  const total = combineSessions([{ usd: 0.1, minutes: 1, turns: 2, is_error: false }]);
  assert.equal(total.test_edit_calls, null);
});
