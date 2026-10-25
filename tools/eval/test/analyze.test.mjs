import test from 'node:test';
import assert from 'node:assert/strict';
import { beats, evaluate, evaluateSpec, flatten, median, noLoss, report, reportSpec } from '../analyze.mjs';

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

// ── does the slice specification matter? (second experiment) ─────
const specRow = (slice, condition, rep, over = {}) => ({ slice, condition, rep, accepted: true, oos: 0, prod_lines: 30, ...over });
const specRows = (make) => ['SL-004', 'SL-006', 'SL-008'].flatMap((slice) => ['B1', 'B0a', 'B0b'].flatMap((c) => [1, 2, 3, 4, 5].map((rep) => specRow(slice, c, rep, make(slice, c, rep)))));

test('flatten: keeps the production lines a run added', () => {
  assert.equal(flatten(done('B1'), measure()).prod_lines, 30);
});

test('evaluateSpec: no evidence that the spec matters when the request-only runs do as well', () => {
  const v = evaluateSpec(specRows(() => ({})));
  assert.equal(v.verdict, 'no evidence that the slice spec matters');
});

test('evaluateSpec: matters when request-only runs fail the acceptance test much more often, in at least two slices', () => {
  const v = evaluateSpec(specRows((slice, c, rep) => (c === 'B0a' && slice !== 'SL-008' && rep <= 3 ? { accepted: false } : {})));
  assert.equal(v.verdict, 'the slice spec matters');
  assert.equal(v.styles.B0a.correctness_gap >= 20, true);
});

test('evaluateSpec: matters when request-only runs build much more code, or step outside scope', () => {
  const bigger = evaluateSpec(specRows((slice, c) => (c === 'B0b' ? { prod_lines: 60 } : {})));
  assert.equal(bigger.verdict, 'the slice spec matters');
  const wider = evaluateSpec(specRows((slice, c) => (c === 'B0b' ? { oos: 2 } : {})));
  assert.equal(wider.verdict, 'the slice spec matters');
});

test('evaluateSpec: a gap that exists in only one slice is not enough', () => {
  const v = evaluateSpec(specRows((slice, c) => (c === 'B0a' && slice === 'SL-004' ? { accepted: false } : {})));
  assert.equal(v.styles.B0a.matters, false);
  assert.equal(v.verdict, 'no evidence that the slice spec matters');
});

test('evaluateSpec: a small difference below the stated thresholds does not count', () => {
  const v = evaluateSpec(specRows((slice, c, rep) => (c === 'B0a' && rep === 5 && slice === 'SL-004' ? { accepted: false, prod_lines: 40 } : {})));
  assert.equal(v.verdict, 'no evidence that the slice spec matters'); // one failure in 15 is about 7 points, and 40 lines is 1.33 times 30
});

test('evaluateSpec: without data for a style it says so, instead of claiming a result', () => {
  const rows = specRows(() => ({})).filter((r) => r.condition === 'B1');
  assert.equal(evaluateSpec(rows).verdict, 'inconclusive');
});

test('evaluateSpec: thresholds are exact: 13 points below, 1.2 times the code and half a marker more do not count', () => {
  const fewer = evaluateSpec(specRows((slice, c, rep) => (c === 'B0a' && rep === 5 && slice !== 'SL-008' ? { accepted: false } : {})));
  assert.equal(fewer.styles.B0a.matters, false); // 2 failures in 15 is 13.3 points
  const slightlyBigger = evaluateSpec(specRows((slice, c) => (c === 'B0a' ? { prod_lines: 36 } : {})));
  assert.equal(slightlyBigger.styles.B0a.matters, false); // 1.2 times
  const halfAMarker = evaluateSpec(specRows((slice, c, rep) => (c === 'B0b' ? { oos: rep <= 2 ? 1 : 0 } : {})).filter((r) => !(r.condition === 'B0b' && r.rep === 5)));
  assert.equal(halfAMarker.styles.B0b.oos.x, 0.5);
  assert.equal(halfAMarker.styles.B0b.matters, false);
});

test('evaluateSpec: exactly 20 points, 1.5 times the code and one marker more do count', () => {
  const twenty = evaluateSpec(specRows((slice, c, rep) => (c === 'B0a' && rep === 5 ? { accepted: false } : {})));
  assert.equal(twenty.styles.B0a.matters, true); // 3 failures in 15, one per slice
  const ratio = evaluateSpec(specRows((slice, c) => (c === 'B0a' ? { prod_lines: 45 } : {})));
  assert.equal(ratio.styles.B0a.matters, true);
  const marker = evaluateSpec(specRows((slice, c) => (c === 'B0a' ? { oos: 1 } : {})));
  assert.equal(marker.styles.B0a.matters, true);
});

test('reportSpec: states the verdict and compares the three conditions on the measures of the second experiment', () => {
  const text = reportSpec(specRows((slice, c) => (c === 'B0b' ? { prod_lines: 60 } : {})).map((r, i) => ({ ...r, id: `run-${i}`, usd: 0.3, mutation_src: 0.9 })));
  assert.match(text, /Verdict by the rules fixed in advance: the slice spec matters/);
  for (const c of ['B0a', 'B0b', 'B1']) assert.ok(text.includes(`| ${c} |`), c);
  assert.match(text, /Passes the neutral acceptance test/);
});
