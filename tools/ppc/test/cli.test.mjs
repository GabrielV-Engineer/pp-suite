import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CLI, repo } from './helpers.mjs';

const run = (dir, ...args) => spawnSync('node', [CLI, ...args], { cwd: dir, encoding: 'utf8' });
const sliceFile = (dir) => join(dir, '.sddpp/slices/SL-001-deployable-skeleton.md');

/** The example has SL-001 ready; put it back to planned so that `ppc approve` has something to act on. */
function planSl001({ write, dir, git }) {
  const text = readFileSync(sliceFile(dir), 'utf8').replace(/^status: ready$/m, 'status: planned').replace(/^approved_by: .*\n/m, '');
  write({ '.sddpp/slices/SL-001-deployable-skeleton.md': text });
  git('commit', '-q', '-am', 'plan SL-001 again');
}

const COMMANDS = ['validate', 'check-git', 'start', 'stop', 'touches', 'widen', 'approve-slice', 'approve', 'show', 'ask', 'reread', 'glance', 'approve-debt', 'schedule-debt', 'decide-addition', 'additions',
  'change-request', 'decide-change', 'apply-change', 'approve-red', 'refactor', 'finish', 'mutation', 'next', 'overview', 'map', 'constitution', 'session', 'init', 'prompt', 'status'];

// Found in the first real project's fourth review: `ppc approve --help` approved the one approvable slice, in the person's name,
// because a flag ppc did not know was ignored and `approve` with no id picks the only candidate.
test('--help and -h print the usage of a command and do nothing else, whatever the command would have done', (t) => {
  const r = repo(t);
  planSl001(r);
  const before = readFileSync(sliceFile(r.dir), 'utf8');
  for (const command of COMMANDS) {
    for (const flag of ['--help', '-h']) {
      const out = run(r.dir, command, flag);
      assert.equal(out.status, 0, `ppc ${command} ${flag}: ${out.stderr}`);
      assert.match(out.stdout, new RegExp(`ppc ${command}\\b`), `ppc ${command} ${flag} says how to use ${command}`);
    }
  }
  assert.equal(readFileSync(sliceFile(r.dir), 'utf8'), before, 'nothing was approved');
  assert.equal(r.git('status', '--porcelain'), '', 'nothing in the project changed');
});

test('--help works after the arguments too, and outside a project', (t) => {
  const r = repo(t);
  planSl001(r);
  assert.equal(run(r.dir, 'approve', 'SL-001', '--by', 'Someone', '--help').status, 0);
  assert.match(readFileSync(sliceFile(r.dir), 'utf8'), /^status: planned$/m, 'naming the slice does not make help approve it');
  const out = spawnSync('node', [CLI, 'approve', '--help'], { cwd: '/', encoding: 'utf8' });
  assert.equal(out.status, 0, 'in a folder that is no project');
});

test('help, with or without a command, and a bare --help print the usage and succeed', (t) => {
  const r = repo(t);
  const all = run(r.dir, 'help');
  assert.equal(all.status, 0);
  assert.match(all.stdout, /ppc approve-slice/);
  const one = run(r.dir, 'help', 'approve');
  assert.equal(one.status, 0);
  assert.match(one.stdout, /ppc approve\b/);
  assert.doesNotMatch(one.stdout, /ppc validate/, 'a command asked about shows its own lines, not every command');
  assert.equal(run(r.dir, '--help').status, 0);
  assert.equal(run(r.dir).status, 0, 'no command: the usage, as before');
  assert.equal(run(r.dir, 'frobnicate').status, 2, 'an unknown command still fails');
});

test('every command that exists has its own entry in the usage', (t) => {
  const r = repo(t);
  for (const command of COMMANDS) {
    const out = run(r.dir, 'help', command).stdout;
    assert.match(out, new RegExp(`^    ppc ${command}\\b`, 'm'), `${command} has a usage entry`);
  }
});

test('an option a command does not know is refused and nothing is done', (t) => {
  const r = repo(t);
  planSl001(r);
  const before = readFileSync(sliceFile(r.dir), 'utf8');
  const cases = [
    ['approve', '--nope'],
    ['approve', 'SL-001', '--acept', 'a reason that is long enough'],
    ['approve', 'SL-001', '-x'],
    ['approve-slice', 'SL-001', '--forced'],
    ['approve-debt', 'DEBT-BE-001', '--acepts', 'a reason that is long enough'],
    ['start', 'SL-001', '--force'],
    ['validate', '--strictly'],
    ['next', '--jsno'],
    ['finish', 'SL-001', '--budget-reasn', 'x'],
    ['reread', '--al'],
  ];
  for (const args of cases) {
    const out = run(r.dir, ...args);
    assert.equal(out.status, 2, `ppc ${args.join(' ')} was refused: ${out.stdout}${out.stderr}`);
    assert.match(out.stderr, new RegExp(`ppc ${args[0]}: unknown option ${args.find((a) => a.startsWith('-')).replace(/[-]/g, '\\-')}`));
    assert.match(out.stderr, new RegExp(`ppc ${args[0]} --help`), 'and says where to look');
  }
  assert.equal(readFileSync(sliceFile(r.dir), 'utf8'), before, 'nothing was approved');
  assert.equal(r.git('status', '--porcelain'), '');
});

test('the options each command documents are still accepted', (t) => {
  const r = repo(t, { screens: true });
  planSl001(r);
  const named = run(r.dir, 'approve', 'SL-001', '--by', 'Ana');
  assert.equal(named.status, 0, named.stderr);
  assert.match(readFileSync(sliceFile(r.dir), 'utf8'), /^status: ready$/m);
  assert.equal(run(r.dir, 'next', '--json').status, 0);
  assert.equal(run(r.dir, 'validate', '--strict').status, 0);
  assert.equal(run(r.dir, 'validate', '--design').status, 0);
  assert.doesNotMatch(run(r.dir, 'constitution', '--check').stderr, /unknown option/);
  assert.doesNotMatch(run(r.dir, 'decide-change', 'CR-0001', '--accept', '--by', 'Ana').stderr, /unknown option/);
});
