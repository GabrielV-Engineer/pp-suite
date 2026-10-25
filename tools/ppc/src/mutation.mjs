import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { extname, join } from 'node:path';
import { measure } from './gitcheck.mjs';
import { isTestPath } from './testpaths.mjs';

const SOURCE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.jsx', '.ts', '.mts', '.cts', '.tsx']);
/** Stryker's default location for the JSON report. */
const REPORT = 'reports/mutation/mutation.json';
/** What the tests detected, and what nobody ran. The remaining statuses could not be judged. */
const DETECTED = new Set(['Killed', 'Timeout']);
const MISSED = new Set(['Survived', 'NoCoverage']);

/**
 * The hand-written source files the given commits changed and that still exist: what mutation testing
 * should look at. Tests, bookkeeping and generated files are left out by `measure`.
 */
export function sliceProductionFiles(root, commits) {
  const files = new Set();
  for (const { sha } of commits) {
    const m = measure(root, String(sha));
    if (!m) continue;
    for (const f of m.files) {
      if (!isTestPath(f.path) && SOURCE_EXTENSIONS.has(extname(f.path)) && existsSync(join(root, f.path))) files.add(f.path);
    }
  }
  return [...files].sort();
}

/** Reduce a Stryker JSON report to a score and the list of mutants the tests missed. */
export function summarize(report) {
  const counts = { killed: 0, timeout: 0, survived: 0, no_coverage: 0 };
  const survivors = [];
  for (const [file, { mutants }] of Object.entries(report.files ?? {})) {
    for (const m of mutants) {
      if (m.status === 'Killed') counts.killed++;
      else if (m.status === 'Timeout') counts.timeout++;
      else if (m.status === 'Survived') counts.survived++;
      else if (m.status === 'NoCoverage') counts.no_coverage++;
      if (MISSED.has(m.status)) survivors.push({ file, line: m.location.start.line, mutator: m.mutatorName, replacement: m.replacement });
    }
  }
  const detected = counts.killed + counts.timeout;
  const judged = detected + counts.survived + counts.no_coverage;
  return { score: judged === 0 ? null : Math.round((detected / judged) * 10000) / 10000, ...counts, survivors };
}

/** Runs Stryker in the project, limited to `files`, and returns its JSON report. */
export function strykerRunner(root, files) {
  const report = join(root, REPORT);
  rmSync(report, { force: true }); // never trust a report left by an earlier run
  const run = spawnSync('npx', ['--no-install', 'stryker', 'run', '--mutate', files.join(','), '--reporters', 'json'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (run.error) throw new Error(`could not start Stryker: ${run.error.message}`);
  if (!existsSync(report)) throw new Error(`Stryker produced no report (exit ${run.status}); is @stryker-mutator/core installed and configured in the project?\n${(run.stderr || run.stdout || '').slice(-1500)}`);
  return JSON.parse(readFileSync(report, 'utf8'));
}

/** Mutation-test `files`. With nothing to mutate there is no score, and the runner is not called. */
export function runMutation(root, files, runner = strykerRunner) {
  if (files.length === 0) return { score: null, killed: 0, timeout: 0, survived: 0, no_coverage: 0, survivors: [], files };
  return { ...summarize(runner(root, files)), files };
}
