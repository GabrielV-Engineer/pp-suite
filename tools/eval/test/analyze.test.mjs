import test from 'node:test';
import assert from 'node:assert/strict';
import { beats, evaluate, flatten, median, noLoss, report } from '../analyze.mjs';

// ── one run → one row ────────────────────────────────────────────
const measure = (over = {}) => ({
  slice: 'SL-004',
  commits: 3,
  test_edit_commits_after_first: 1,
  largest_commit_lines: 40,
  review_load: { production_lines: 30, test_lines: 100 },
  test_cases: 20,
  out_of_scope: { total: 2 },
  own_tests: { tests: 20, pass: 20, fail: 0 },
  acceptance: { tests: 4, pass: 4, fail: 0 },
  mutation: { score: 0.6, counts: { 'src/a.ts': { detected: 8, judged: 10 }, 'public/app.js': { detected: 0, judged: 6 } } },
  session: { usd: 0.5, minutes: 2, turns: 20, any_error: false },
  ...over,
});
const done = (condition = 'T', over = {}) => ({ id: `SL-004-${condition}-1`, slice: 'SL-004', condition, rep: 1, outcome: { closed: true }, ...over });

test('flatten: the measures of the plan, one value each', () => {
  const row = flatten(done('T'), measure());
  assert.equal(row.mutation, 0.6);
  assert.equal(row.mutation_src, 0.8); // 8 of 10 in src/, the 6 in public/ do not count
  assert.equal(row.oos, 2);
  assert.equal(row.h3, 1);
  assert.equal(row.usd, 0.5);
  assert.equal(row.accepted, true);
});

test('flatten: what a reviewer reads is the tests for T and the whole diff for the baselines', () => {
  assert.equal(flatten(done('T'), measure()).review, 100);
  assert.equal(flatten(done('B1'), measure()).review, 130);
  assert.equal(flatten(done('B2'), measure()).review, 130);
});

test('flatten: a failing acceptance test, or none that ran, is not accepted', () => {
  assert.equal(flatten(done(), measure({ acceptance: { tests: 4, pass: 3, fail: 1 } })).accepted, false);
  assert.equal(flatten(done(), measure({ acceptance: { tests: null, pass: null, fail: null } })).accepted, false);
});

test('flatten: no mutation score stays null; a run without a measurement still has a row', () => {
  assert.equal(flatten(done(), measure({ mutation: { score: null, counts: {} } })).mutation_src, null);
  const row = flatten(done(), null);
  assert.equal(row.mutation, null);
  assert.equal(row.accepted, false);
});

// ── medians ──────────────────────────────────────────────────────
test('median: middle value, mean of the two middle ones for an even count, nulls ignored', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.equal(median([null, 5, undefined]), 5);
  assert.equal(median([]), null);
});

// ── "beats" ──────────────────────────────────────────────────────
const rows = (spec) => spec.flatMap(([slice, condition, values]) => values.map((v, i) => ({ slice, condition, rep: i + 1, m: v })));

test('beats: needs a better pooled median AND a better median in at least two slices', () => {
  const data = rows([
    ['SL-004', 'T', [0.8, 0.8, 0.8]], ['SL-004', 'B1', [0.5, 0.5, 0.5]],
    ['SL-006', 'T', [0.8, 0.8, 0.8]], ['SL-006', 'B1', [0.5, 0.5, 0.5]],
    ['SL-008', 'T', [0.4, 0.4, 0.4]], ['SL-008', 'B1', [0.5, 0.5, 0.5]],
  ]);
  const result = beats(data, 'B1', 'm', 'higher');
  assert.equal(result.beats, true);
  assert.deepEqual(result.slices_won, ['SL-004', 'SL-006']);
});

test('beats: winning only one slice is not enough, even with a better pooled median', () => {
  // unequal numbers of runs (some were discarded), so one slice can carry the pooled median
  const data = rows([
    ['SL-004', 'T', [0.99, 0.99, 0.99, 0.99, 0.99]], ['SL-004', 'B1', [0.1, 0.1, 0.1]],
    ['SL-006', 'T', [0.4]], ['SL-006', 'B1', [0.5, 0.5, 0.5]],
    ['SL-008', 'T', [0.4]], ['SL-008', 'B1', [0.5, 0.5, 0.5]],
  ]);
  const result = beats(data, 'B1', 'm', 'higher');
  assert.ok(result.pooled.t > result.pooled.b, 'the pooled median is better');
  assert.deepEqual(result.slices_won, ['SL-004']);
  assert.equal(result.beats, false);
});

test('beats: winning two slices is not enough if the pooled median is not better', () => {
  const data = rows([
    ['SL-004', 'T', [0.6]], ['SL-004', 'B1', [0.5]],
    ['SL-006', 'T', [0.6]], ['SL-006', 'B1', [0.5]],
    ['SL-008', 'T', [0, 0, 0, 0, 0]], ['SL-008', 'B1', [0.5]],
  ]);
  const result = beats(data, 'B1', 'm', 'higher');
  assert.equal(result.slices_won.length, 2);
  assert.ok(result.pooled.t < result.pooled.b);
  assert.equal(result.beats, false);
});

test('beats: a tie is not a win, and lower can be better', () => {
  const tie = rows([['SL-004', 'T', [1]], ['SL-004', 'B1', [1]]]);
  assert.equal(beats(tie, 'B1', 'm', 'higher').beats, false);
  const fewer = rows([
    ['SL-004', 'T', [1, 1, 1]], ['SL-004', 'B1', [4, 4, 4]],
    ['SL-006', 'T', [1, 1, 1]], ['SL-006', 'B1', [4, 4, 4]],
  ]);
  assert.equal(beats(fewer, 'B1', 'm', 'lower').beats, true);
});

test('noLoss: T may tie, but must not be worse than the baseline in any slice', () => {
  const ok = rows([['SL-004', 'T', [1]], ['SL-004', 'B1', [1]], ['SL-006', 'T', [0]], ['SL-006', 'B1', [2]]]);
  assert.equal(noLoss(ok, 'B1', 'm', 'lower'), true);
  const worse = rows([['SL-004', 'T', [3]], ['SL-004', 'B1', [1]], ['SL-006', 'T', [0]], ['SL-006', 'B1', [2]]]);
  assert.equal(noLoss(worse, 'B1', 'm', 'lower'), false);
});

// ── the verdict, with the rules fixed in docs/evaluation-plan.md ──
function experiment({ tMutation, bMutation, tOos, bOos, tH3 = 0, bH3 = 1, tUsd = 1, bUsd = 0.5 }) {
  const out = [];
  for (const slice of ['SL-004', 'SL-006', 'SL-008']) {
    for (let rep = 1; rep <= 3; rep++) {
      const base = { slice, rep, accepted: true };
      out.push({ ...base, condition: 'T', mutation_src: tMutation, oos: tOos, h3: tH3, usd: tUsd });
      out.push({ ...base, condition: 'B1', mutation_src: bMutation, oos: bOos, h3: bH3, usd: bUsd });
      out.push({ ...base, condition: 'B2', mutation_src: bMutation, oos: bOos, h3: bH3, usd: bUsd });
    }
  }
  return out;
}

test('evaluate: supported when T beats both baselines on untested behavior and scope, never loses on test edits, and costs under 3x', () => {
  const v = evaluate(experiment({ tMutation: 0.8, bMutation: 0.5, tOos: 0, bOos: 3 }));
  assert.equal(v.verdict, 'supported');
  assert.equal(v.cost_ratio, 2);
});

test('evaluate: not supported when T does not beat the better prompt (B2) on either measure', () => {
  const v = evaluate(experiment({ tMutation: 0.5, bMutation: 0.5, tOos: 2, bOos: 2 }));
  assert.equal(v.verdict, 'not supported');
});

test('evaluate: anything in between is inconclusive, and a cost of 3x or more prevents "supported"', () => {
  const half = evaluate(experiment({ tMutation: 0.8, bMutation: 0.5, tOos: 2, bOos: 2 }));
  assert.equal(half.verdict, 'inconclusive');
  const dear = evaluate(experiment({ tMutation: 0.8, bMutation: 0.5, tOos: 0, bOos: 3, tUsd: 1.5, bUsd: 0.5 }));
  assert.equal(dear.cost_ratio, 3);
  assert.equal(dear.verdict, 'inconclusive');
});

test('evaluate: losing on test edits in any slice prevents "supported"', () => {
  const v = evaluate(experiment({ tMutation: 0.8, bMutation: 0.5, tOos: 0, bOos: 3, tH3: 2, bH3: 0 }));
  assert.equal(v.verdict, 'inconclusive');
});

test('report: states the verdict, every slice, and every run', () => {
  const text = report(experiment({ tMutation: 0.8, bMutation: 0.5, tOos: 0, bOos: 3 }).map((r, i) => ({ ...r, id: `run-${i}` })));
  assert.match(text, /Verdict by the rules fixed in advance: supported/);
  for (const slice of ['SL-004', 'SL-006', 'SL-008', 'All slices pooled']) assert.ok(text.includes(`## ${slice}`), slice);
  assert.equal((text.match(/^\| run-\d+ /gm) ?? []).length, 27);
});

test('report: an empty experiment does not crash and does not claim a result', () => {
  assert.match(report([]), /inconclusive/);
});
