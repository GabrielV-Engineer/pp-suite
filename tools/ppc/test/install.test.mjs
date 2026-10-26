import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPins, plan, apply, InstallError } from '../src/install.mjs';
import { CLI } from './helpers.mjs';

const SUITE = fileURLToPath(new URL('../../../', import.meta.url)).replace(/\/$/, '');
const pins = readPins(SUITE);

/** A scratch directory that is a git repository, with a clean tree. */
function project(t, { git = true, specify = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'ppc-install-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  if (git) {
    for (const args of [['init', '-q', '-b', 'main'], ['config', 'user.email', 't@example.com'], ['config', 'user.name', 'T'], ['config', 'commit.gpgsign', 'false']]) spawnSync('git', args, { cwd: dir });
    writeFileSync(join(dir, 'README.md'), 'x\n');
    spawnSync('git', ['add', '-A'], { cwd: dir });
    spawnSync('git', ['commit', '-q', '-m', 'base'], { cwd: dir });
  }
  if (specify) mkdirSync(join(dir, '.specify'));
  return dir;
}

/** A pretend machine: which commands exist and what they answer. Everything else is "not found". */
function machine({ specify = `specify ${pins.speckit.version}`, claude = '2.1.310 (Claude Code)', extensions = [], presets = [], python = true, node = '24.21.0' } = {}) {
  const calls = [];
  const probe = (cmd, args, opts) => {
    calls.push([cmd, ...args]);
    if (cmd === 'git') return spawnSync('git', args, { encoding: 'utf8', cwd: opts?.cwd });
    if (cmd === 'python3') return python ? { status: 0, stdout: 'Python 3.14.8\n' } : null;
    if (cmd === 'claude') return claude ? { status: 0, stdout: `${claude}\n` } : null;
    if (cmd === 'specify' && args[0] === '--version') return specify ? { status: 0, stdout: `${specify}\n` } : null;
    if (cmd === 'specify' && args[0] === 'extension') return { status: 0, stdout: JSON.stringify(extensions) };
    if (cmd === 'specify' && args[0] === 'preset') return { status: 0, stdout: JSON.stringify(presets) };
    return null;
  };
  return { probe, calls, node };
}
const env = (m, extra = {}) => ({ suite: SUITE, probe: m.probe, nodeVersion: m.node, pathDirs: [], ...extra });
const installed = { extensions: [{ id: 'architect-pp', version: '0.1.0' }, { id: 'sddpp-guard', version: '0.1.0' }, { id: 'sddpp-cycle', version: '0.1.0' }] };
const check = (p, id) => p.checks.find((c) => c.id === id);
const fails = (fn, pattern) => assert.throws(fn, (e) => e instanceof InstallError && pattern.test(e.message));

// ── the pins ─────────────────────────────────────────────────────
test('the pins name exact versions and full commits, not ranges', () => {
  assert.match(pins.speckit.commit, /^[0-9a-f]{40}$/);
  assert.match(pins.the_architect.commit, /^[0-9a-f]{40}$/);
  assert.match(pins.speckit.version, /^\d+\.\d+\.\d+/);
  assert.ok(pins.node.min >= 22);
  assert.ok(pins.claude_code.tested);
});

// ── checking the machine ─────────────────────────────────────────
test('plan: a machine with everything in place has every check ok and nothing left to run', (t) => {
  const p = plan(project(t, { specify: true }), env(machine(installed)));
  for (const id of ['node', 'git', 'git-repo', 'python', 'specify', 'specify-project', 'extension-architect-pp', 'extension-sddpp-guard', 'extension-sddpp-cycle']) assert.equal(check(p, id).status, 'ok', id);
  assert.deepEqual(p.blocked, []);
  assert.deepEqual(p.steps.filter((s) => !s.done), []);
});

test('plan: a Node older than the pinned minimum blocks', (t) => {
  const p = plan(project(t), env(machine({ ...installed, node: '20.11.0' })));
  assert.equal(check(p, 'node').status, 'differs');
  assert.ok(p.blocked.some((b) => b.id === 'node'));
});

test('plan: the pinned minimum Node itself is accepted', (t) => {
  const p = plan(project(t), env(machine({ ...installed, node: `${pins.node.min}.0.0` })));
  assert.equal(check(p, 'node').status, 'ok');
});

test('plan: no specify blocks and says exactly how to install the pinned one', (t) => {
  const p = plan(project(t), env(machine({ specify: null })));
  assert.equal(check(p, 'specify').status, 'missing');
  assert.ok(p.blocked.some((b) => b.id === 'specify'));
  assert.ok(check(p, 'specify').fix.includes(pins.speckit.commit));
  assert.match(check(p, 'specify').fix, /uv tool install/);
});

test('plan: another specify version blocks, unless untested versions are allowed', (t) => {
  const m = machine({ specify: 'specify 1.9.0' });
  assert.equal(check(plan(project(t), env(m)), 'specify').status, 'differs');
  assert.ok(plan(project(t), env(m)).blocked.some((b) => b.id === 'specify'));
  assert.ok(!plan(project(t), env(m), { allowUntested: true }).blocked.some((b) => b.id === 'specify'));
});

test('plan: Claude Code and the Architect only inform, they never block', (t) => {
  const p = plan(project(t), env(machine({ claude: '2.0.0 (Claude Code)' })));
  assert.equal(check(p, 'claude').status, 'differs');
  assert.ok(!p.blocked.some((b) => b.id === 'claude'));
  assert.equal(check(plan(project(t), env(machine({ claude: null }))), 'claude').status, 'missing');
});

test('plan: a directory that is not a git repository blocks, since ppc reads git', (t) => {
  const p = plan(project(t, { git: false }), env(machine(installed)));
  assert.ok(p.blocked.some((b) => b.id === 'git-repo'));
});

// ── the steps ────────────────────────────────────────────────────
test('plan: a fresh project gets specify init, the three extensions and the removal of the two skills this flow replaces, in that order, none done', (t) => {
  const p = plan(project(t), env(machine()));
  const ids = p.steps.filter((s) => !s.done).map((s) => s.id);
  assert.deepEqual(ids.filter((id) => id !== 'npm-ci'), ['specify-init', 'extension-architect-pp', 'extension-sddpp-guard', 'extension-sddpp-cycle', 'drop-speckit-specify', 'drop-speckit-plan']);
  const init = p.steps.find((s) => s.id === 'specify-init');
  assert.deepEqual(init.command.slice(0, 2), ['specify', 'init']);
  for (const flag of ['--here', '--force', '--non-interactive']) assert.ok(init.command.includes(flag), flag);
  assert.ok(init.command.join(' ').includes('--integration claude'));
  const architect = p.steps.find((s) => s.id === 'extension-architect-pp');
  assert.deepEqual(architect.command, ['specify', 'extension', 'add', join(SUITE, 'architect-pp/extension'), '--dev']);
  const guard = p.steps.find((s) => s.id === 'extension-sddpp-guard');
  assert.deepEqual(guard.command, ['specify', 'extension', 'add', join(SUITE, 'sdd-pp/extension/sddpp-guard'), '--dev']);
  assert.equal(p.steps.find((s) => s.id === 'drop-speckit-plan').remove, join(p.steps.find((x) => x.id === 'specify-init').cwd, '.claude/skills/speckit-plan'));
});

test('plan: what is already installed at the right version is marked done, and the rest still runs', (t) => {
  const dir = project(t, { specify: true });
  const p = plan(dir, env(machine({ extensions: [{ id: 'sddpp-guard', version: '0.1.0' }] })));
  assert.equal(p.steps.find((s) => s.id === 'specify-init').done, true);
  assert.equal(p.steps.find((s) => s.id === 'extension-sddpp-guard').done, true);
  assert.equal(p.steps.find((s) => s.id === 'extension-sddpp-cycle').done, false);
});

test('plan: an extension at another version is reported, not silently replaced', (t) => {
  const dir = project(t, { specify: true });
  const p = plan(dir, env(machine({ extensions: [{ id: 'sddpp-guard', version: '0.0.9' }] })));
  assert.equal(check(p, 'extension-sddpp-guard').status, 'differs');
  assert.ok(p.blocked.some((b) => b.id === 'extension-sddpp-guard'));
  assert.equal(p.steps.find((s) => s.id === 'extension-sddpp-guard').done, false);
});

test('plan: the guard hook and script are verified, because a missing guard fails open', (t) => {
  const dir = project(t, { specify: true });
  mkdirSync(join(dir, '.claude'), { recursive: true });
  mkdirSync(join(dir, '.specify/extensions/sddpp-guard/scripts/python'), { recursive: true });
  const ok = (p) => [check(p, 'guard-hook').status, check(p, 'guard-script').status];
  assert.deepEqual(ok(plan(dir, env(machine(installed)))), ['missing', 'missing']);
  writeFileSync(join(dir, '.claude/settings.json'), JSON.stringify({ hooks: { PreToolUse: [{ hooks: [{ command: 'python3 .specify/events.py speckit.sddpp-guard.pre-tool pre_tool_use 60' }] }] } }));
  writeFileSync(join(dir, '.specify/extensions/sddpp-guard/scripts/python/guard.py'), '#');
  assert.deepEqual(ok(plan(dir, env(machine(installed)))), ['ok', 'ok']);
});

// ── same version, other content ──────────────────────────────────
test('plan: an installed extension with the right version but other content is reported, since a version can stay while files change', (t) => {
  const dir = project(t, { specify: true });
  const installedCopy = join(dir, '.specify/extensions/sddpp-cycle');
  cpSync(join(SUITE, 'sdd-pp/extension/sddpp-cycle'), installedCopy, { recursive: true });
  mkdirSync(join(installedCopy, '.specify-dev'));
  writeFileSync(join(installedCopy, '.specify-dev/extra.txt'), 'added by Spec Kit');
  const status = () => check(plan(dir, env(machine(installed))), 'extension-sddpp-cycle');
  assert.equal(status().status, 'ok', 'an identical copy, with extra files of its own, is current');
  mkdirSync(join(SUITE, 'sdd-pp/extension/sddpp-cycle/__pycache__'), { recursive: true });
  writeFileSync(join(SUITE, 'sdd-pp/extension/sddpp-cycle/__pycache__/x.pyc'), 'compiled');
  t.after(() => rmSync(join(SUITE, 'sdd-pp/extension/sddpp-cycle/__pycache__'), { recursive: true, force: true }));
  assert.equal(status().status, 'ok', 'compiled python caches are ignored');
  writeFileSync(join(installedCopy, 'commands/red.md'), 'an older red.md\n');
  assert.equal(status().status, 'differs');
  assert.match(status().found, /red\.md/);
  assert.match(status().fix, /specify extension remove sddpp-cycle/);
  assert.ok(plan(dir, env(machine(installed))).blocked.some((b) => b.id === 'extension-sddpp-cycle'));
  cpSync(join(SUITE, 'sdd-pp/extension/sddpp-cycle/commands/red.md'), join(installedCopy, 'commands/red.md'));
  rmSync(join(installedCopy, 'commands/build.md'));
  assert.match(status().found, /build\.md/, 'a file that is missing counts too');
});

test('plan: the skills this flow replaces are removed after Spec Kit is initialized, and not again once gone', (t) => {
  const fresh = plan(project(t), env(machine()));
  assert.equal(fresh.steps.find((s) => s.id === 'drop-speckit-specify').done, false, 'pending until init has run');
  const dir = project(t, { specify: true });
  mkdirSync(join(dir, '.claude/skills/speckit-specify'), { recursive: true });
  mkdirSync(join(dir, '.claude/skills/speckit-plan'), { recursive: true });
  const p = plan(dir, env(machine(installed)));
  assert.equal(p.steps.find((s) => s.id === 'drop-speckit-specify').done, false);
  rmSync(join(dir, '.claude/skills/speckit-specify'), { recursive: true });
  rmSync(join(dir, '.claude/skills/speckit-plan'), { recursive: true });
  assert.ok(plan(dir, env(machine(installed))).steps.every((s) => s.done));
});

test('plan: the preset this repository used to ship is reported if it is still installed, without blocking', (t) => {
  const dir = project(t, { specify: true });
  const p = plan(dir, env(machine({ ...installed, presets: [{ id: 'sddpp-slices', version: '0.1.0' }] })));
  assert.equal(check(p, 'preset-sddpp-slices').status, 'differs');
  assert.match(check(p, 'preset-sddpp-slices').fix, /specify preset remove sddpp-slices/);
  assert.ok(!p.blocked.some((b) => b.id === 'preset-sddpp-slices'));
  assert.equal(check(plan(dir, env(machine(installed))), 'preset-sddpp-slices'), undefined);
});

// ── the shim ─────────────────────────────────────────────────────
function shimEnv(t) {
  const home = mkdtempSync(join(tmpdir(), 'ppc-home-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  mkdirSync(join(home, '.local/bin'), { recursive: true });
  return { home, bin: join(home, '.local/bin') };
}

test('plan: ppc is not on the PATH, so the shim is offered but only planned when asked', (t) => {
  const { home, bin } = shimEnv(t);
  const m = machine(installed);
  const without = plan(project(t), env(m, { home, pathDirs: [bin] }));
  assert.equal(check(without, 'ppc-on-path').status, 'missing');
  assert.ok(!without.steps.some((s) => s.id === 'ppc-shim'));
  const withShim = plan(project(t), env(m, { home, pathDirs: [bin] }), { shim: true });
  const step = withShim.steps.find((s) => s.id === 'ppc-shim');
  assert.equal(step.target, join(bin, 'ppc'));
  assert.ok(step.content.includes(join(SUITE, 'tools/ppc/bin/ppc.mjs')));
  assert.ok(step.content.startsWith('#!/bin/sh'));
});

test('plan: a shim of ours is recognized, and another program called ppc is never overwritten', (t) => {
  const { home, bin } = shimEnv(t);
  const m = machine(installed);
  writeFileSync(join(bin, 'ppc'), `#!/bin/sh\nexec node "${join(SUITE, 'tools/ppc/bin/ppc.mjs')}" "$@"\n`);
  chmodSync(join(bin, 'ppc'), 0o755);
  assert.equal(check(plan(project(t), env(m, { home, pathDirs: [bin] })), 'ppc-on-path').status, 'ok');
  writeFileSync(join(bin, 'ppc'), '#!/bin/sh\necho something else\n');
  chmodSync(join(bin, 'ppc'), 0o755);
  const other = plan(project(t), env(m, { home, pathDirs: [bin] }), { shim: true });
  assert.equal(check(other, 'ppc-on-path').status, 'differs');
  assert.ok(other.blocked.some((b) => b.id === 'ppc-shim'), 'it must not overwrite another ppc');
});

// ── applying ─────────────────────────────────────────────────────
const runner = (log, { failOn } = {}) => (command, cwd) => {
  log.push({ command, cwd });
  return failOn && command.join(' ').includes(failOn) ? { status: 1, stderr: 'boom' } : { status: 0, stderr: '' };
};

test('apply: runs the steps that are not done, in order, inside the project', (t) => {
  const dir = project(t, { specify: true });
  const log = [];
  const result = apply(dir, env(machine(installed)), { run: runner(log) });
  assert.deepEqual(result.ran, []);
  const fresh = project(t);
  const log2 = [];
  const r2 = apply(fresh, env(machine()), { run: runner(log2) });
  assert.deepEqual(r2.ran.filter((id) => id !== 'npm-ci'), ['specify-init', 'extension-architect-pp', 'extension-sddpp-guard', 'extension-sddpp-cycle', 'drop-speckit-specify', 'drop-speckit-plan']);
  assert.ok(log2.every((l) => l.cwd === fresh || l.command[0] === 'npm'));
});

test('apply: stops at the first step that fails and says which', (t) => {
  const dir = project(t);
  const log = [];
  fails(() => apply(dir, env(machine()), { run: runner(log, { failOn: 'extension add' }) }), /extension-sddpp-guard.*boom|boom/s);
  assert.ok(!log.some((l) => l.command.join(' ').includes('sddpp-cycle')), 'nothing runs after the failure');
});

test('apply: refuses a blocked machine and changes nothing', (t) => {
  const log = [];
  fails(() => apply(project(t), env(machine({ specify: null })), { run: runner(log) }), /specify/);
  assert.deepEqual(log, []);
});

test('apply: refuses a project with uncommitted changes, so everything the install does can be reviewed', (t) => {
  const dir = project(t);
  writeFileSync(join(dir, 'notes.txt'), 'unsaved work\n');
  const log = [];
  fails(() => apply(dir, env(machine()), { run: runner(log) }), /uncommitted/);
  assert.deepEqual(log, []);
});

test('apply: writes the shim only when asked, executable, and never over another program', (t) => {
  const { home, bin } = shimEnv(t);
  const dir = project(t, { specify: true });
  apply(dir, env(machine(installed), { home, pathDirs: [bin] }), { run: runner([]) });
  assert.ok(!existsSync(join(bin, 'ppc')));
  const r = apply(dir, env(machine(installed), { home, pathDirs: [bin] }), { run: runner([]), shim: true });
  assert.ok(r.ran.includes('ppc-shim'));
  assert.ok(existsSync(join(bin, 'ppc')));
  assert.ok((spawnSync('test', ['-x', join(bin, 'ppc')]).status ?? 1) === 0, 'the shim is executable');
  assert.match(readFileSync(join(bin, 'ppc'), 'utf8'), /ppc\.mjs/);
  writeFileSync(join(bin, 'ppc'), '#!/bin/sh\necho other\n');
  fails(() => apply(dir, env(machine(installed), { home, pathDirs: [bin] }), { run: runner([]), shim: true }), /another/i);
  assert.match(readFileSync(join(bin, 'ppc'), 'utf8'), /echo other/);
});

// ── the command ──────────────────────────────────────────────────
test('CLI: init without --apply only reports: it prints the checks and the commands it would run, and changes nothing', (t) => {
  const dir = project(t);
  const out = spawnSync(process.execPath, [CLI, 'init', dir], { encoding: 'utf8', env: { ...process.env, PATH: '/usr/bin:/bin' } });
  assert.match(out.stdout, /Node\.js/);
  assert.match(out.stdout, /would run/i);
  assert.ok(!existsSync(join(dir, '.specify')));
  assert.equal(spawnSync('git', ['status', '--porcelain'], { cwd: dir, encoding: 'utf8' }).stdout, '');
});

// ── ppc contract: where the contract files are, for prompts that run inside a project ──
test('CLI: contract prints where the schemas, the contract document and the example are', () => {
  const out = spawnSync(process.execPath, [CLI, 'contract'], { encoding: 'utf8' });
  assert.equal(out.status, 0, out.stderr);
  const lines = Object.fromEntries(out.stdout.trim().split('\n').map((l) => l.split(/:\s+/)));
  assert.ok(existsSync(join(lines.schemas, 'blueprint.schema.json')), lines.schemas);
  assert.ok(existsSync(lines.document), lines.document);
  assert.ok(existsSync(join(lines.example, '.architect/blueprint.yaml')), lines.example);
});

test('apply: removes the skills Spec Kit just installed that this flow replaces, and nothing else', (t) => {
  const dir = project(t, { specify: true });
  for (const name of ['speckit-specify', 'speckit-plan', 'speckit-tasks']) {
    mkdirSync(join(dir, '.claude/skills', name), { recursive: true });
    writeFileSync(join(dir, '.claude/skills', name, 'SKILL.md'), 'x');
  }
  spawnSync('git', ['add', '-A'], { cwd: dir });
  spawnSync('git', ['commit', '-q', '-m', 'skills'], { cwd: dir });
  const result = apply(dir, env(machine(installed)), { run: runner([]) });
  assert.deepEqual(result.ran, ['drop-speckit-specify', 'drop-speckit-plan']);
  assert.ok(!existsSync(join(dir, '.claude/skills/speckit-specify')));
  assert.ok(!existsSync(join(dir, '.claude/skills/speckit-plan')));
  assert.ok(existsSync(join(dir, '.claude/skills/speckit-tasks')), 'only the two named skills go');
});
