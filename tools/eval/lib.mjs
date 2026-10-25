// Measures for docs/evaluation-plan.md. Everything here is computed from git, test output or a session
// transcript, never from opinion, and the pure parts are covered by test/lib.test.mjs.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { isGeneratedPath, isTestPath } from '../ppc/src/testpaths.mjs';
import { sliceProductionFiles, strykerRunner, summarize } from '../ppc/src/mutation.mjs';

/** Files that are neither code nor tests: contract bookkeeping, framework scaffolding, generated lockfiles. */
const NOT_CODE = /^(\.sddpp|\.architect|\.specify|\.claude|specs)\//;
const handWritten = (path) => !NOT_CODE.test(path) && !isGeneratedPath(path);
const SOURCE = new Set(['.js', '.mjs', '.cjs', '.ts', '.mts', '.cts', '.jsx', '.tsx']);

const git = (dir, ...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });

/** Totals of a `node --test` run; null everywhere when the run never produced them. */
export function parseNodeTest(stdout) {
  const grab = (key) => {
    const m = new RegExp(`^ℹ ${key} (\\d+)`, 'm').exec(stdout);
    return m ? Number(m[1]) : null;
  };
  return { tests: grab('tests'), pass: grab('pass'), fail: grab('fail') };
}

/** H2: how many times each fixed out-of-scope pattern appears in `text`. */
export function countMarkers(text, markers) {
  const counts = {};
  let total = 0;
  for (const { name, pattern } of markers) {
    counts[name] = (text.match(new RegExp(pattern, 'gi')) ?? []).length;
    total += counts[name];
  }
  return { ...counts, total };
}

/** The lines a condition added to hand-written production source since `base`. */
export function addedProductionText(dir, base) {
  const names = git(dir, 'diff', '--name-only', '-z', `${base}..HEAD`).split('\0').filter(Boolean);
  const paths = names.filter((p) => handWritten(p) && !isTestPath(p) && SOURCE.has(extname(p)) && existsSync(`${dir}/${p}`));
  if (paths.length === 0) return '';
  const diff = git(dir, 'diff', '--unified=0', `${base}..HEAD`, '--', ...paths);
  return diff.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++')).map((l) => l.slice(1)).join('\n');
}

/** H4: lines changed (added plus deleted) in production code and in tests across everything since `base`. */
export function diffTotals(dir, base) {
  const rows = git(dir, 'diff', '--numstat', '--no-renames', '-z', `${base}..HEAD`).split('\0').filter(Boolean);
  let production = 0;
  let tests = 0;
  for (const row of rows) {
    const [added, deleted, ...rest] = row.split('\t');
    const path = rest.join('\t');
    if (!handWritten(path)) continue;
    const lines = (added === '-' ? 0 : Number(added)) + (deleted === '-' ? 0 : Number(deleted));
    if (isTestPath(path)) tests += lines;
    else production += lines;
  }
  return { production_lines: production, test_lines: tests };
}

/** H3 and commit size: facts about the history since `base`. */
export function commitStats(dir, base) {
  const shas = git(dir, 'rev-list', '--reverse', `${base}..HEAD`).split('\n').filter(Boolean);
  const perCommit = shas.map((sha) =>
    git(dir, 'diff-tree', '--no-commit-id', '--numstat', '-r', '--root', '--no-renames', sha)
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [added, deleted, ...rest] = line.split('\t');
        const count = (n) => (n === '-' ? 0 : Number(n));
        return { path: rest.join('\t'), lines: count(added) + count(deleted) };
      })
      .filter((f) => handWritten(f.path)),
  );
  const firstTest = perCommit.findIndex((files) => files.some((f) => isTestPath(f.path)));
  const editsAfter = firstTest === -1 ? 0 : perCommit.slice(firstTest + 1).filter((files) => files.some((f) => isTestPath(f.path))).length;
  return {
    commits: shas.length,
    test_edit_commits_after_first: editsAfter,
    largest_commit_lines: Math.max(0, ...perCommit.map((files) => files.reduce((n, f) => n + f.lines, 0))),
  };
}

/** From the JSONL lines of a Claude Code session: edits made to test files and blocks by the SDD.PP guard. */
export function analyzeTranscript(lines) {
  let testEditCalls = 0;
  let guardBlocks = 0;
  for (const line of lines) {
    if (!line.trim()) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    for (const part of entry.message?.content ?? []) {
      if (part.type === 'tool_use' && ['Edit', 'MultiEdit'].includes(part.name) && isTestPath(String(part.input?.file_path ?? ''))) testEditCalls++;
      // A real block is an ERROR result with the guard's message; a file that merely contains the text is not one.
      if (part.type === 'tool_result' && part.is_error && JSON.stringify(part.content ?? '').includes('SDD.PP guard:')) guardBlocks++;
    }
  }
  return { test_edit_calls: testEditCalls, guard_blocks: guardBlocks };
}

/**
 * H1: the mutation score of the files under src/ that a condition wrote since `base`, overall and per file.
 * Only src/ is mutated: Stryker instruments a file before its first run, and a test that reads public/app.js
 * as text (a regex over its source) then fails, so whether a file could be scored would depend on how the
 * condition happened to write its tests.
 */
export function mutationFor(dir, base, runner = strykerRunner) {
  const shas = git(dir, 'rev-list', '--reverse', `${base}..HEAD`).split('\n').filter(Boolean);
  const files = sliceProductionFiles(dir, shas.map((sha) => ({ sha }))).filter((f) => f.startsWith('src/'));
  if (files.length === 0) return { score: null, by_file: {}, survivors: 0, files };
  const report = runner(dir, files);
  const by_file = {};
  const counts = {};
  for (const [file, content] of Object.entries(report.files ?? {})) {
    const part = summarize({ files: { [file]: content } });
    by_file[file] = part.score;
    counts[file] = { detected: part.killed + part.timeout, judged: part.killed + part.timeout + part.survived + part.no_coverage };
  }
  const total = summarize(report);
  return { score: total.score, by_file, counts, survivors: total.survivors.length, files };
}

/** Adds up the sessions of one run (T has three). A count the transcript could not give stays null, not zero. */
export function combineSessions(sessions) {
  const sum = (key) => sessions.reduce((n, s) => n + s[key], 0);
  const counted = (key) => (sessions.every((s) => typeof s[key] === 'number') ? sum(key) : null);
  const round = (n) => Math.round(n * 1000) / 1000;
  return {
    sessions: sessions.length,
    usd: round(sum('usd')),
    minutes: round(sum('minutes')),
    turns: sum('turns'),
    any_error: sessions.some((s) => s.is_error),
    test_edit_calls: counted('test_edit_calls'),
    guard_blocks: counted('guard_blocks'),
  };
}

export const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
