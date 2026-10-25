#!/usr/bin/env node
// Pilot measuring script for docs/evaluation-plan.md. NOT yet covered by tests: it must get them before
// the experiment proper starts. Usage:
//   node measure.mjs <project dir> <base commit> [--accept <test file>] [--session <session result.json>]
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, copyFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { homedir } from 'node:os';
import { isTestPath } from '../ppc/src/testpaths.mjs';

const args = process.argv.slice(2);
const dir = args[0];
const base = args[1];
const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const git = (...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

const BOOKKEEPING = /^(\.sddpp|\.architect|\.specify|\.claude|specs)\//;
const files = git('ls-files').split('\n').filter(Boolean);
const lines = (f) => (existsSync(join(dir, f)) ? readFileSync(join(dir, f), 'utf8').split('\n').length - 1 : 0);
const production = files.filter((f) => /^(src|public)\//.test(f) && !isTestPath(f));
const tests = files.filter((f) => isTestPath(f));
const sum = (list) => list.reduce((n, f) => n + lines(f), 0);
const productionText = production.map((f) => readFileSync(join(dir, f), 'utf8')).join('\n');

// ── history since the base commit ───────────────────────────────────────────────
const shas = git('rev-list', '--reverse', `${base}..HEAD`).split('\n').filter(Boolean);
const touched = (sha) =>
  git('diff-tree', '--no-commit-id', '--numstat', '-r', '--root', '--no-renames', sha)
    .split('\n').filter(Boolean)
    .map((l) => { const [a, d, ...p] = l.split('\t'); return { path: p.join('\t'), lines: (a === '-' ? 0 : +a) + (d === '-' ? 0 : +d) }; })
    .filter((f) => !BOOKKEEPING.test(f.path) && basename(f.path) !== 'package-lock.json');
const perCommit = shas.map((sha) => ({ sha, files: touched(sha) }));
const firstTest = perCommit.findIndex((c) => c.files.some((f) => isTestPath(f.path)));
const testEditCommitsAfterFirst = firstTest === -1 ? 0 : perCommit.slice(firstTest + 1).filter((c) => c.files.some((f) => isTestPath(f.path))).length;

// ── out-of-scope markers for SL-002 (fixed before the runs; see docs/evaluation-plan.md) ──
// SL-002 means: create a task (POST) and list tasks (GET), persisted. It does NOT mean: editing, deleting,
// completing, validating title length (SL-004), or ordering rules (SL-008).
const count = (re) => (productionText.match(re) ?? []).length;
const scope = {
  routes_beyond_create_and_list: count(/\.(patch|put|delete)\(\s*["'`]\/api\/tasks/gi),
  title_length_limit: /\b500\b/.test(productionText) ? 1 : 0,
  ordering_rules: count(/ORDER\s+BY/gi),
  validation_error_paths: count(/validation_failed|invalid_json|400\b/g),
};
scope.total_markers = Object.values(scope).reduce((a, b) => a + b, 0);

// ── do the project's own tests pass, and do the approved acceptance tests pass? ──────────────
const run = (cwd, extra = []) => {
  const r = spawnSync('node', ['--test', ...extra], { cwd, encoding: 'utf8', timeout: 180000 });
  const grab = (k) => Number((r.stdout.match(new RegExp(`^ℹ ${k} (\\d+)`, 'm')) ?? [])[1] ?? NaN);
  return { tests: grab('tests'), pass: grab('pass'), fail: grab('fail') };
};
const own = run(dir, ['tests/*.test.ts']);
let acceptance = null;
if (opt('--accept')) {
  const target = join(dir, 'tests', '_acceptance.test.ts');
  copyFileSync(opt('--accept'), target);
  acceptance = run(dir, [target]);
}

// ── session: cost, time, test edits, guard blocks ──────────────────────────────────────────
let session = null;
if (opt('--session')) {
  const r = JSON.parse(readFileSync(opt('--session'), 'utf8'));
  session = { usd: r.total_cost_usd, minutes: +(r.duration_ms / 60000).toFixed(1), turns: r.num_turns, is_error: r.is_error };
  const root = join(homedir(), '.claude', 'projects');
  const file = readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => join(root, d.name, `${r.session_id}.jsonl`)).find(existsSync);
  if (file) {
    let testEditCalls = 0, guardBlocks = 0;
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      let o; try { o = JSON.parse(line); } catch { continue; }
      for (const c of o.message?.content ?? []) {
        if (c.type === 'tool_use' && ['Edit', 'MultiEdit'].includes(c.name) && isTestPath(String(c.input?.file_path ?? ''))) testEditCalls++;
        // A real block is an ERROR result carrying the guard's message; reading a file that merely contains the text is not one.
        if (c.type === 'tool_result' && c.is_error && JSON.stringify(c.content ?? '').includes('SDD.PP guard:')) guardBlocks++;
      }
    }
    session.test_edit_calls = testEditCalls;
    session.guard_blocks = guardBlocks;
  }
}

console.log(JSON.stringify({
  commits: shas.length,
  production_loc: sum(production),
  test_loc: sum(tests),
  test_cases: tests.reduce((n, f) => n + (readFileSync(join(dir, f), 'utf8').match(/\bit\(/g) ?? []).length, 0),
  largest_commit_lines: Math.max(0, ...perCommit.map((c) => c.files.reduce((n, f) => n + f.lines, 0))),
  test_edit_commits_after_first: testEditCommitsAfterFirst,
  out_of_scope_markers: scope,
  own_tests: own,
  approved_acceptance_tests: acceptance,
  session,
}, null, 2));
