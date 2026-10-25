#!/usr/bin/env node
// Runs the experiment of docs/evaluation-plan.md: every (slice, condition, repetition) in tools/eval/plan.mjs,
// each in a fresh copy of the demo project, with real `claude -p` sessions. It is resumable: a run that has a
// done.json is skipped. A run is discarded only if the account or the network failed (never because its
// result looks bad), and then the driver stops so the run can be repeated.
//
//   node run.mjs --demo <todo-app-m1 dir> --base <commit> --work <dir outside ~/.claude> --out <results dir>
//                [--slices SL-004,SL-006,SL-008] [--reps 5] [--seed 20261024] [--only <run id>] [--max <n>]
//
// The side effects are not unit tested; the plan, the prompts and the classification of results are
// (test/plan.test.mjs). What a run does is checked by smoke-running it and reading its outputs.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPlan, classifySession, promptFor } from './plan.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const PPC = resolve(HERE, '../ppc/bin/ppc.mjs');
const args = process.argv.slice(2);
const opt = (name, fallback) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : fallback);

const demo = resolve(opt('demo'));
const base = opt('base');
const work = resolve(opt('work'));
const out = resolve(opt('out'));
const slices = opt('slices', 'SL-004,SL-006,SL-008').split(',');
const reps = Number(opt('reps', '5'));
const seed = Number(opt('seed', '20261024'));
const only = opt('only');
const max = Number(opt('max', '0')) || Infinity;
if (!demo || !base || !opt('work') || !opt('out')) {
  console.error('usage: run.mjs --demo <dir> --base <commit> --work <dir> --out <dir> [--slices ..] [--reps n] [--seed n] [--only id] [--max n]');
  process.exit(2);
}
if (work.includes('/.claude')) {
  console.error('--work must be outside ~/.claude: Claude Code refuses to edit files there');
  process.exit(2);
}

// The same tools for every condition. No network access beyond localhost, no pushing (the remote is removed).
const TOOLS = ['Read', 'Grep', 'Glob', 'Edit', 'Write', 'Bash(ppc:*)', 'Bash(npm:*)', 'Bash(npx:*)', 'Bash(node:*)', 'Bash(git:*)', 'Bash(ls:*)', 'Bash(cat:*)', 'Bash(mkdir:*)', 'Bash(curl:*)'];
const CAPS = { all: 3, red: 1.5, green: 2, audit: 1.5 };

const sh = (cwd, cmd, argv, extra = {}) => spawnSync(cmd, argv, { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, ...extra });
const must = (r, what) => {
  if (r.status !== 0) throw new Error(`${what} failed: ${r.stderr || r.stdout}`);
  return r.stdout.trim();
};
const log = (line) => console.log(`${new Date().toISOString()} ${line}`);

// ── project copies ──────────────────────────────────────────────────────────────────────────
function prepareTemplates() {
  mkdirSync(join(work, 'bin'), { recursive: true });
  writeFileSync(join(work, 'bin', 'ppc'), `#!/bin/sh\nexec node ${PPC} "$@"\n`, { mode: 0o755 });
  const t = join(work, 'template-t');
  if (!existsSync(t)) {
    must(sh(work, 'git', ['clone', '-q', '--no-hardlinks', demo, t]), 'clone');
    must(sh(t, 'git', ['checkout', '-q', base]), 'checkout base');
    sh(t, 'git', ['remote', 'remove', 'origin']);
    must(sh(t, 'npm', ['ci', '--silent']), 'npm ci');
  }
  const b = join(work, 'template-b');
  if (!existsSync(b)) {
    cpSync(t, b, { recursive: true });
    rmSync(join(b, '.claude'), { recursive: true, force: true });
    rmSync(join(b, '.specify'), { recursive: true, force: true });
    must(sh(b, 'git', ['-c', 'user.email=harness@experiment.invalid', '-c', 'user.name=Harness', 'commit', '-aqm', 'setup: plain project, no framework files']), 'commit setup');
  }
  return { t, b, baseB: must(sh(b, 'git', ['rev-parse', 'HEAD']), 'rev-parse') };
}

// ── one session ─────────────────────────────────────────────────────────────────────────────
function session(dir, resultFile, prompt, cap) {
  const env = { ...process.env, PATH: `${join(work, 'bin')}:${process.env.PATH}` };
  const run = sh(dir, 'claude', ['-p', prompt, '--permission-mode', 'acceptEdits', '--allowedTools', ...TOOLS, '--max-budget-usd', String(cap), '--output-format', 'json'], { env, timeout: 25 * 60 * 1000 });
  let result = null;
  try {
    result = JSON.parse(run.stdout);
  } catch {
    // no parsable result: the process died or timed out
  }
  writeFileSync(resultFile, JSON.stringify(result ?? { is_error: true, raw: String(run.stdout).slice(-2000), stderr: String(run.stderr).slice(-2000) }, null, 2));
  return { kind: classifySession(result), result };
}

const commitAll = (dir, message) => {
  sh(dir, 'git', ['add', '-A']);
  sh(dir, 'git', ['commit', '-qm', message]); // nothing to commit is fine
};

// ── one run ─────────────────────────────────────────────────────────────────────────────────
function execute(entry, templates) {
  const { id, slice, condition } = entry;
  const dir = join(work, 'runs', id);
  const results = join(out, id);
  rmSync(dir, { recursive: true, force: true });
  rmSync(results, { recursive: true, force: true });
  mkdirSync(results, { recursive: true });
  mkdirSync(join(work, 'runs'), { recursive: true });
  cpSync(condition === 'T' ? templates.t : templates.b, dir, { recursive: true });
  sh(dir, 'git', ['config', 'user.email', 'agent@experiment.invalid']);
  sh(dir, 'git', ['config', 'user.name', 'Experiment Agent']);
  const sliceFile = `.sddpp/slices/${readdirSync(join(dir, '.sddpp/slices')).find((f) => f.startsWith(`${slice}-`))}`;
  const measureBase = condition === 'T' ? base : templates.baseB;
  const sessions = [];
  const kinds = [];
  const outcome = { closed: null, stopped_early: null };

  const step = (phase, cap) => {
    const file = join(results, `session-${phase}.json`);
    const { kind } = session(dir, file, promptFor(condition, phase, slice, sliceFile), cap);
    kinds.push(`${phase}:${kind}`);
    sessions.push(file);
    return kind;
  };
  const env = { ...process.env, PATH: `${join(work, 'bin')}:${process.env.PATH}` };
  const ppc = (...a) => sh(dir, 'node', [PPC, ...a, dir], { env });

  let infrastructure = false;
  if (condition === 'T') {
    // Both approvals are given by the harness under a name that says so: a person is not in the loop of an
    // automated run. This is a limit of the design, stated in docs/evaluation-plan.md.
    must(ppc('approve-slice', slice, '--by', 'experiment-harness (automated, not a human)'), 'approve-slice');
    must(ppc('start', slice), 'start');
    commitAll(dir, `chore(${slice}): start`);
    if (step('red', CAPS.red) === 'infrastructure') infrastructure = true;
    else {
      const approved = ppc('approve-red', '--by', 'experiment-harness (automated, not a human)');
      if (approved.status !== 0) outcome.stopped_early = `approve-red refused: ${approved.stderr.trim().slice(0, 300)}`;
      else {
        commitAll(dir, `chore(${slice}): approve red`);
        if (step('green', CAPS.green) === 'infrastructure') infrastructure = true;
        else if (step('audit', CAPS.audit) === 'infrastructure') infrastructure = true;
      }
    }
    const status = ppc('status');
    outcome.status_after = status.stdout.trim();
    outcome.closed = /no slice is in progress/.test(status.stdout);
  } else if (step('all', CAPS.all) === 'infrastructure') infrastructure = true;

  if (infrastructure) {
    // Keep what the failed session said, so that "infrastructure" can be checked and not just believed.
    const failures = join(out, '_infrastructure-failures');
    mkdirSync(failures, { recursive: true });
    for (const file of readdirSync(results)) if (file.startsWith('session-')) writeFileSync(join(failures, `${id}-${Date.now()}-${file}`), readFileSync(join(results, file)));
    rmSync(dir, { recursive: true, force: true });
    rmSync(results, { recursive: true, force: true });
    return { infrastructure: true, kinds };
  }

  const measured = sh(dir, 'node', [join(HERE, 'measure.mjs'), dir, measureBase, '--slice', slice, '--session', sessions.join(',')], { timeout: 20 * 60 * 1000 });
  if (measured.status !== 0) outcome.measure_error = String(measured.stderr).slice(-1500);
  else writeFileSync(join(results, 'measure.json'), measured.stdout);
  sh(dir, 'git', ['bundle', 'create', join(results, 'run.bundle'), 'HEAD', '--not', measureBase]);
  writeFileSync(join(results, 'done.json'), JSON.stringify({ ...entry, base: measureBase, sessions: kinds, outcome, finished_at: new Date().toISOString() }, null, 2));
  rmSync(dir, { recursive: true, force: true });
  return { infrastructure: false, kinds, outcome };
}

// ── main ────────────────────────────────────────────────────────────────────────────────────
mkdirSync(work, { recursive: true });
mkdirSync(out, { recursive: true });
const templates = prepareTemplates();
let ran = 0;
for (const entry of buildPlan({ slices, reps, seed })) {
  if (only && entry.id !== only) continue;
  if (existsSync(join(out, entry.id, 'done.json'))) continue;
  if (ran >= max) break;
  let r;
  for (let attempt = 1; attempt <= 3; attempt++) {
    log(`start ${entry.id}${attempt > 1 ? ` (attempt ${attempt})` : ''}`);
    r = execute(entry, templates);
    if (!r.infrastructure) break;
    log(`${entry.id}: infrastructure failure (${r.kinds.join(', ')}); the run was discarded${attempt < 3 ? ', trying again in 2 minutes' : ''}`);
    if (attempt < 3) spawnSync('sleep', ['120']);
  }
  if (r.infrastructure) {
    log(`STOP: ${entry.id} failed three times on infrastructure; see _infrastructure-failures/. Run again to resume.`);
    process.exit(3);
  }
  ran++;
  log(`done  ${entry.id} sessions=${r.kinds.join(',')} closed=${r.outcome.closed} ${r.outcome.measure_error ? 'MEASURE ERROR' : ''}`);
}
log(`finished: ${ran} run(s) this time`);
