#!/usr/bin/env node
// Measures one run of one condition against docs/evaluation-plan.md. The computing lives in lib.mjs (tested).
//   node measure.mjs <project dir> <base commit> --slice SL-004 [--session <claude -p result.json>] [--skip-mutation]
// The project must already contain Stryker (see docs/mutation-testing.md) unless --skip-mutation is given.
import { cpSync, existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addedProductionText, analyzeTranscript, commitStats, countMarkers, diffTotals, mutationFor, parseNodeTest, readJson } from './lib.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const args = process.argv.slice(2);
const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const [dirArg, base] = args;
const sliceId = opt('--slice');
if (!dirArg || !base || !sliceId) {
  console.error('usage: measure.mjs <project dir> <base commit> --slice SL-NNN [--session result.json] [--skip-mutation]');
  process.exit(2);
}
const dir = resolve(dirArg);
const config = readJson(join(HERE, 'slices', `${sliceId}.json`));

const runTests = (cwd, files) => {
  const run = spawnSync('node', ['--test', ...files], { cwd, encoding: 'utf8', timeout: 240000 });
  return parseNodeTest(run.stdout ?? '');
};

// Own tests: whatever this condition wrote under tests/, run the way the project runs them.
const own = runTests(dir, ['tests/*.test.ts']);

// Neutral acceptance: copied in, run, removed. It reads nothing from the project's tests.
const staging = join(dir, '.eval-acceptance');
cpSync(join(HERE, 'neutral-acceptance'), staging, { recursive: true });
const acceptance = runTests(dir, [join('.eval-acceptance', config.acceptance.split('/').pop())]);
rmSync(staging, { recursive: true, force: true });

const added = addedProductionText(dir, base);
const testFiles = existsSync(join(dir, 'tests')) ? readdirSync(join(dir, 'tests')).filter((f) => /\.test\.[tj]s$/.test(f)) : [];
const testCases = testFiles.reduce((n, f) => n + (readFileSync(join(dir, 'tests', f), 'utf8').match(/\b(it|test)\(/g) ?? []).length, 0);

let session = null;
if (opt('--session')) {
  const result = readJson(opt('--session'));
  session = { usd: result.total_cost_usd, minutes: +(result.duration_ms / 60000).toFixed(1), turns: result.num_turns, is_error: result.is_error };
  const projects = join(homedir(), '.claude', 'projects');
  const transcript = readdirSync(projects, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => join(projects, d.name, `${result.session_id}.jsonl`))
    .find(existsSync);
  if (transcript) Object.assign(session, analyzeTranscript(readFileSync(transcript, 'utf8').split('\n')));
}

console.log(JSON.stringify({
  slice: sliceId,
  head: spawnSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).stdout.trim(),
  ...commitStats(dir, base),
  review_load: diffTotals(dir, base),
  test_cases: testCases,
  out_of_scope: countMarkers(added, config.scope_markers),
  own_tests: own,
  acceptance,
  mutation: args.includes('--skip-mutation') ? null : mutationFor(dir, base),
  session,
}, null, 2));
