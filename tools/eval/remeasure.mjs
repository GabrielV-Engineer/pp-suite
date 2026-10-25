#!/usr/bin/env node
// Measures again a run whose first measurement failed, from the git bundle that run left behind.
//   node remeasure.mjs --work <work dir of run.mjs> --out <results dir> <run id>...
// The code of the run is rebuilt exactly (base commit + the bundle); nothing is executed by an agent.
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const args = process.argv.slice(2);
const opt = (name) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : undefined);
const work = resolve(opt('work'));
const out = resolve(opt('out'));
const ids = args.filter((a, i) => !a.startsWith('--') && !['--work', '--out'].includes(args[i - 1]));
const sh = (cwd, cmd, argv, extra = {}) => spawnSync(cmd, argv, { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, ...extra });

for (const id of ids) {
  const results = join(out, id);
  const doneFile = join(results, 'done.json');
  const done = JSON.parse(readFileSync(doneFile, 'utf8'));
  const dir = join(work, 'remeasure', id);
  rmSync(dir, { recursive: true, force: true });
  cpSync(join(work, done.condition === 'T' ? 'template-t' : 'template-b'), dir, { recursive: true });
  const fetched = sh(dir, 'git', ['fetch', '-q', join(results, 'run.bundle'), 'HEAD:refs/heads/run']);
  if (fetched.status !== 0) throw new Error(`${id}: cannot read the bundle: ${fetched.stderr}`);
  sh(dir, 'git', ['checkout', '-q', 'run']);
  const sessions = ['red', 'green', 'audit', 'all'].map((p) => join(results, `session-${p}.json`)).filter(existsSync);
  const measured = sh(dir, 'node', [join(HERE, 'measure.mjs'), dir, done.base, '--slice', done.slice, '--session', sessions.join(',')], { timeout: 20 * 60 * 1000 });
  rmSync(dir, { recursive: true, force: true });
  if (measured.status !== 0) {
    console.error(`${id}: measuring failed again:\n${String(measured.stderr).slice(-1200)}`);
    continue;
  }
  writeFileSync(join(results, 'measure.json'), measured.stdout);
  delete done.outcome.measure_error;
  done.outcome.remeasured = 'The first measurement failed (see docs/evaluation-plan.md, "Measurement change"); measured again from the saved bundle, src/ only.';
  writeFileSync(doneFile, JSON.stringify(done, null, 2));
  console.log(`${id}: measured`);
}
