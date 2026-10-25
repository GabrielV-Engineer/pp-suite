#!/usr/bin/env node
// Turns the results of the experiment into the verdict fixed in docs/evaluation-plan.md. Nothing here is
// chosen after seeing the data: the rules are the ones written before the first run.
//   node analyze.mjs <results dir>      prints a Markdown report
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CONDITIONS = ['B1', 'B2', 'T'];

/** One run as one row of plain numbers. `measure` may be null when the measuring failed. */
export function flatten(done, measure) {
  const m = measure ?? {};
  const counts = m.mutation?.counts ?? {};
  const src = Object.entries(counts).filter(([file]) => file.startsWith('src/')).map(([, c]) => c);
  const judged = src.reduce((n, c) => n + c.judged, 0);
  const detected = src.reduce((n, c) => n + c.detected, 0);
  const acc = m.acceptance;
  const load = m.review_load;
  return {
    id: done.id,
    slice: done.slice,
    condition: done.condition,
    rep: done.rep,
    closed: done.outcome?.closed ?? null,
    accepted: Boolean(acc && acc.tests > 0 && acc.fail === 0 && acc.pass === acc.tests),
    own_ok: Boolean(m.own_tests && m.own_tests.tests > 0 && m.own_tests.fail === 0),
    mutation: m.mutation?.score ?? null,
    mutation_src: judged > 0 ? Math.round((detected / judged) * 10000) / 10000 : null,
    oos: m.out_of_scope?.total ?? null,
    h3: m.test_edit_commits_after_first ?? null,
    test_edit_calls: m.session?.test_edit_calls ?? null,
    // a reviewer reads the tests under T, and the whole diff under the baselines
    review: load ? (done.condition === 'T' ? load.test_lines : load.production_lines + load.test_lines) : null,
    test_cases: m.test_cases ?? null,
    largest_commit: m.largest_commit_lines ?? null,
    usd: m.session?.usd ?? null,
    minutes: m.session?.minutes ?? null,
    turns: m.session?.turns ?? null,
  };
}

export function median(values) {
  const xs = values.filter((v) => typeof v === 'number').sort((a, b) => a - b);
  if (xs.length === 0) return null;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}

const slicesOf = (rows) => [...new Set(rows.map((r) => r.slice))].sort();
const valuesOf = (rows, condition, metric, slice) => rows.filter((r) => r.condition === condition && (slice === undefined || r.slice === slice)).map((r) => r[metric]);
const better = (t, b, direction) => t !== null && b !== null && (direction === 'higher' ? t > b : t < b);
const worse = (t, b, direction) => t !== null && b !== null && (direction === 'higher' ? t < b : t > b);

/** T beats the baseline: a better pooled median and a better median in at least two slices. A tie is not a win. */
export function beats(rows, baseline, metric, direction) {
  const per_slice = slicesOf(rows).map((slice) => ({ slice, t: median(valuesOf(rows, 'T', metric, slice)), b: median(valuesOf(rows, baseline, metric, slice)) }));
  const slices_won = per_slice.filter((s) => better(s.t, s.b, direction)).map((s) => s.slice);
  const pooled = { t: median(valuesOf(rows, 'T', metric)), b: median(valuesOf(rows, baseline, metric)) };
  return { beats: better(pooled.t, pooled.b, direction) && slices_won.length >= 2, pooled, slices_won, per_slice };
}

/** T may tie, but is not worse than the baseline in any slice. */
export function noLoss(rows, baseline, metric, direction) {
  return slicesOf(rows).every((slice) => !worse(median(valuesOf(rows, 'T', metric, slice)), median(valuesOf(rows, baseline, metric, slice)), direction));
}

/** The decision rules of docs/evaluation-plan.md. H1 is the mutation score of the files under src/ (the only ones every condition can be scored on); H2 the out-of-scope markers; H3 test edits. */
export function evaluate(rows) {
  const h1 = { B1: beats(rows, 'B1', 'mutation_src', 'higher'), B2: beats(rows, 'B2', 'mutation_src', 'higher') };
  const h2 = { B1: beats(rows, 'B1', 'oos', 'lower'), B2: beats(rows, 'B2', 'oos', 'lower') };
  const h3 = { B1: noLoss(rows, 'B1', 'h3', 'lower'), B2: noLoss(rows, 'B2', 'h3', 'lower') };
  const t = median(valuesOf(rows, 'T', 'usd'));
  const b = median(valuesOf(rows, 'B1', 'usd'));
  const cost_ratio = t !== null && b ? t / b : null;
  const supported = h1.B1.beats && h1.B2.beats && h2.B1.beats && h2.B2.beats && h3.B1 && h3.B2 && cost_ratio !== null && cost_ratio < 3;
  // "Not supported" needs evidence against: both measures must have data for T and for B2. No data is not a refutation.
  const known = (r) => r.pooled.t !== null && r.pooled.b !== null;
  const refuted = known(h1.B2) && known(h2.B2) && !h1.B2.beats && !h2.B2.beats;
  return { verdict: supported ? 'supported' : refuted ? 'not supported' : 'inconclusive', h1, h2, h3, cost_ratio };
}

export function loadRows(dir) {
  const rows = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !existsSync(join(dir, entry.name, 'done.json'))) continue;
    const done = JSON.parse(readFileSync(join(dir, entry.name, 'done.json'), 'utf8'));
    const file = join(dir, entry.name, 'measure.json');
    rows.push(flatten(done, existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null));
  }
  return rows.sort((a, b) => a.id.localeCompare(b.id));
}

const fmt = (v, digits = 2) => (v === null || v === undefined ? 'n/a' : Number.isInteger(v) ? String(v) : v.toFixed(digits));
const range = (xs) => {
  const ys = xs.filter((v) => typeof v === 'number');
  return ys.length ? `${fmt(Math.min(...ys))}–${fmt(Math.max(...ys))}` : 'n/a';
};

/** A Markdown report: the verdict, medians per slice and condition, and every run. */
export function report(rows) {
  const v = evaluate(rows);
  const out = [];
  out.push(`# Experiment results\n`);
  out.push(`**Verdict by the rules fixed in advance: ${v.verdict}.** Runs counted: ${rows.length}.\n`);
  const line = (label, r) => `| ${label} | ${r.beats ? 'yes' : 'no'} | ${fmt(r.pooled.t)} vs ${fmt(r.pooled.b)} | ${r.slices_won.join(', ') || 'none'} |`;
  out.push('| T beats… | Beats? | Pooled median (T vs baseline) | Slices won |', '| --- | --- | --- | --- |');
  out.push(line('B1 on mutation score of src/ (H1)', v.h1.B1), line('B2 on mutation score of src/ (H1)', v.h1.B2));
  out.push(line('B1 on out-of-scope markers (H2, fewer)', v.h2.B1), line('B2 on out-of-scope markers (H2, fewer)', v.h2.B2));
  out.push('', `Never worse on test edits (H3): B1 ${v.h3.B1 ? 'yes' : 'no'}, B2 ${v.h3.B2 ? 'yes' : 'no'}. Cost of T over B1 (median): ${v.cost_ratio === null ? 'n/a' : `${v.cost_ratio.toFixed(2)}x`} (limit: under 3x).\n`);
  const metrics = [['mutation_src', 'Mutation score, src/ (H1)'], ['mutation', 'Mutation score, all files measured'], ['oos', 'Out-of-scope markers'], ['h3', 'Commits editing tests after the first'], ['review', 'Lines to read'], ['usd', 'Cost (USD)'], ['minutes', 'Minutes']];
  for (const slice of [...slicesOf(rows), undefined]) {
    out.push(`## ${slice ?? 'All slices pooled'}\n`);
    out.push('| Measure | B1 median [range] | B2 median [range] | T median [range] |', '| --- | --- | --- | --- |');
    for (const [key, label] of metrics) {
      out.push(`| ${label} | ${CONDITIONS.map((c) => `${fmt(median(valuesOf(rows, c, key, slice)))} [${range(valuesOf(rows, c, key, slice))}]`).join(' | ')} |`);
    }
    const rate = (c, key) => {
      const own = rows.filter((r) => r.condition === c && (slice === undefined || r.slice === slice));
      return `${own.filter((r) => r[key]).length}/${own.length}`;
    };
    out.push(`| Passes the neutral acceptance test | ${CONDITIONS.map((c) => rate(c, 'accepted')).join(' | ')} |`, `| Passes its own tests | ${CONDITIONS.map((c) => rate(c, 'own_ok')).join(' | ')} |`, '');
  }
  out.push('## Every run\n', '| Run | Accepted | Own tests | Mutation | src/ only | Markers | Test-edit commits | Lines to read | USD |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const r of rows) out.push(`| ${r.id} | ${r.accepted ? 'yes' : 'no'} | ${r.own_ok ? 'yes' : 'no'} | ${fmt(r.mutation)} | ${fmt(r.mutation_src)} | ${fmt(r.oos)} | ${fmt(r.h3)} | ${fmt(r.review)} | ${fmt(r.usd)} |`);
  return out.join('\n') + '\n';
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  if (!process.argv[2]) {
    console.error('usage: analyze.mjs <results dir>');
    process.exit(2);
  }
  process.stdout.write(report(loadRows(resolve(process.argv[2]))));
}
