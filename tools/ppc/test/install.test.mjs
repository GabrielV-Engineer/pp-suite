import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPins, plan, apply, renderPlan, InstallError, DROPPED_SKILLS } from '../src/install.mjs';
import { shortSkills, longSkillNames } from '../src/skills.mjs';
import { CLI } from './helpers.mjs';

const SUITE = fileURLToPath(new URL('../../../', import.meta.url)).replace(/\/$/, '');
const pins = readPins(SUITE);

/** A scratch directory that is a git repository, with a clean tree. */
function project(t, { git = true, specify = false, pp = specify } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'ppc-install-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  if (git) {
    for (const args of [['init', '-q', '-b', 'main'], ['config', 'user.email', 't@example.com'], ['config', 'user.name', 'T'], ['config', 'commit.gpgsign', 'false']]) spawnSync('git', args, { cwd: dir });
    writeFileSync(join(dir, 'README.md'), 'x\n');
    if (pp) {
      mkdirSync(join(dir, '.claude/skills/pp'), { recursive: true });
      writeFileSync(join(dir, '.claude/skills/pp/SKILL.md'), readFileSync(join(SUITE, 'sdd-pp/skills/pp/SKILL.md'), 'utf8'));
      for (const skill of shortSkills(SUITE)) {
        mkdirSync(join(dir, '.claude/skills', skill.name), { recursive: true });
        writeFileSync(join(dir, '.claude/skills', skill.name, 'SKILL.md'), skill.content);
      }
    }
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
const PP_SKILL = join(SUITE, 'sdd-pp/skills/pp/SKILL.md');
const withPpSkill = (dir, text) => {
  mkdirSync(join(dir, '.claude/skills/pp'), { recursive: true });
  writeFileSync(join(dir, '.claude/skills/pp/SKILL.md'), text);
  return dir;
};

test('plan: a machine with everything in place has every check ok and nothing left to run', (t) => {
  const p = plan(project(t, { specify: true }), env(machine(installed)));
  for (const id of ['node', 'git', 'git-repo', 'python', 'specify', 'specify-project', 'extension-architect-pp', 'extension-sddpp-guard', 'extension-sddpp-cycle', 'pp-skill', 'short-skills']) assert.equal(check(p, id).status, 'ok', id);
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
test('plan: a fresh project gets specify init, the three extensions and the removal of the Spec Kit skills this flow does not use, in that order, none done', (t) => {
  const p = plan(project(t), env(machine()));
  const ids = p.steps.filter((s) => !s.done).map((s) => s.id);
  assert.deepEqual(ids.filter((id) => id !== 'npm-ci'), ['specify-init', 'extension-architect-pp', 'extension-sddpp-guard', 'extension-sddpp-cycle', ...DROPPED_SKILLS.map((n) => `drop-${n}`), ...longSkillNames(SUITE).map((n) => `drop-long-${n}`), 'pp-skill', ...shortSkills(SUITE).map((x) => `short-${x.name}`)]);
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

test('plan: the session-start hook and its script are verified', (t) => {
  const dir = project(t, { specify: true });
  mkdirSync(join(dir, '.claude'), { recursive: true });
  mkdirSync(join(dir, '.specify/extensions/sddpp-cycle/scripts/python'), { recursive: true });
  const status = () => check(plan(dir, env(machine(installed))), 'session-hook').status;
  assert.equal(status(), 'missing');
  writeFileSync(join(dir, '.claude/settings.json'), JSON.stringify({ hooks: { SessionStart: [{ hooks: [{ command: 'python3 .specify/events.py speckit.sddpp-cycle.session-start session_start 60' }] }] } }));
  assert.equal(status(), 'missing', 'the hook alone is not enough: its script must be there');
  writeFileSync(join(dir, '.specify/extensions/sddpp-cycle/scripts/python/session.py'), '#');
  assert.equal(status(), 'ok');
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
  assert.deepEqual(r2.ran.filter((id) => id !== 'npm-ci'), ['specify-init', 'extension-architect-pp', 'extension-sddpp-guard', 'extension-sddpp-cycle', ...DROPPED_SKILLS.map((n) => `drop-${n}`), ...longSkillNames(SUITE).map((n) => `drop-long-${n}`), 'pp-skill', ...shortSkills(SUITE).map((x) => `short-${x.name}`)]);
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

const UNUSED = ['speckit-specify', 'speckit-plan', 'speckit-tasks', 'speckit-implement', 'speckit-clarify', 'speckit-analyze', 'speckit-checklist', 'speckit-constitution', 'speckit-converge', 'speckit-taskstoissues'];

test('the Spec Kit skills this flow does not use are all named, and none of ours is among them', () => {
  assert.deepEqual([...DROPPED_SKILLS].sort(), [...UNUSED].sort());
  assert.ok(!DROPPED_SKILLS.some((n) => n.includes('sddpp') || n.includes('architect-pp')));
});

test('apply: removes the Spec Kit skills this flow does not use and the long names of ours; the short commands stay', (t) => {
  const dir = project(t, { specify: true });
  const ours = ['speckit-sddpp-cycle-build', 'speckit-sddpp-guard-pre-tool', 'speckit-architect-pp-handoff'];
  for (const name of [...UNUSED, ...ours]) {
    mkdirSync(join(dir, '.claude/skills', name), { recursive: true });
    writeFileSync(join(dir, '.claude/skills', name, 'SKILL.md'), 'x');
  }
  spawnSync('git', ['add', '-A'], { cwd: dir });
  spawnSync('git', ['commit', '-q', '-m', 'skills'], { cwd: dir });
  const result = apply(dir, env(machine(installed)), { run: runner([]) });
  assert.deepEqual(result.ran.sort(), [...UNUSED.map((n) => `drop-${n}`), ...ours.map((n) => `drop-long-${n}`)].sort());
  for (const name of [...UNUSED, ...ours]) assert.ok(!existsSync(join(dir, '.claude/skills', name)), name);
  for (const skill of shortSkills(SUITE)) assert.ok(existsSync(join(dir, '.claude/skills', skill.name, 'SKILL.md')), `/${skill.name} must stay`);
});

// ── updating what is installed ───────────────────────────────────
function staleCycle(t) {
  const dir = project(t, { specify: true });
  const copy = join(dir, '.specify/extensions/sddpp-cycle');
  cpSync(join(SUITE, 'sdd-pp/extension/sddpp-cycle'), copy, { recursive: true });
  writeFileSync(join(copy, 'commands/red.md'), 'older\n');
  return dir;
}

test('plan --update: a stale extension is removed and added again instead of blocking', (t) => {
  const dir = staleCycle(t);
  const m = machine(installed);
  assert.ok(plan(dir, env(m)).blocked.some((b) => b.id === 'extension-sddpp-cycle'), 'without --update it blocks');
  const p = plan(dir, env(m), { update: true });
  assert.ok(!p.blocked.some((b) => b.id === 'extension-sddpp-cycle'));
  const ids = p.steps.filter((s) => !s.done).map((s) => s.id);
  assert.ok(ids.indexOf('extension-sddpp-cycle-remove') !== -1 && ids.indexOf('extension-sddpp-cycle-remove') < ids.indexOf('extension-sddpp-cycle'), ids.join(','));
  assert.deepEqual(p.steps.find((s) => s.id === 'extension-sddpp-cycle-remove').command, ['specify', 'extension', 'remove', 'sddpp-cycle', '--force']);
});

test('plan --update: what is current is left alone', (t) => {
  const dir = project(t, { specify: true });
  const p = plan(dir, env(machine(installed)), { update: true });
  assert.ok(!p.steps.some((s) => s.id.endsWith('-remove')));
});

test('apply --update: runs the removal first, then the installation, in the project', (t) => {
  const dir = staleCycle(t);
  spawnSync('git', ['add', '-A'], { cwd: dir });
  spawnSync('git', ['commit', '-q', '-m', 'stale'], { cwd: dir });
  const log = [];
  const result = apply(dir, env(machine(installed)), { run: runner(log), update: true });
  assert.deepEqual(result.ran.slice(0, 2), ['extension-sddpp-cycle-remove', 'extension-sddpp-cycle']);
  assert.deepEqual(log.slice(0, 2).map((l) => l.command.slice(0, 3).join(' ')), ['specify extension remove', 'specify extension add']);
});

test('CLI: init --update is accepted', (t) => {
  const out = spawnSync(process.execPath, [CLI, 'init', project(t), '--update'], { encoding: 'utf8', env: { ...process.env, PATH: '/usr/bin:/bin' } });
  assert.match(out.stdout, /Checks:/);
});

// ── the /pp skill ────────────────────────────────────────────────
test('the /pp skill ships with this repository, is named pp and reads the state through ppc', () => {
  const text = readFileSync(PP_SKILL, 'utf8');
  assert.match(text, /^---\nname: pp\n/);
  assert.match(text, /ppc next --json/);
  assert.match(text, /allowed-tools:.*Bash\(ppc next/);
  assert.doesNotMatch(text.match(/allowed-tools:.*/)[0], /approve|decide-change/, 'the approvals are not pre-approved: Claude Code asks the person');
});

test('plan: the /pp skill is a step that writes the file, and a check that is missing until it is there', (t) => {
  const dir = project(t, { specify: true, pp: false });
  const p = plan(dir, env(machine(installed)));
  assert.equal(check(p, 'pp-skill').status, 'missing');
  const step = p.steps.find((s) => s.id === 'pp-skill');
  assert.equal(step.target, join(dir, '.claude/skills/pp/SKILL.md'));
  assert.equal(step.content, readFileSync(PP_SKILL, 'utf8'));
  assert.equal(step.done, false);
});

test('plan: a /pp skill that differs from this repository is reported, left alone, and rewritten only with --update', (t) => {
  const dir = withPpSkill(project(t, { specify: true }), '---\nname: pp\n---\nan older version\n');
  const reported = plan(dir, env(machine(installed)));
  assert.equal(check(reported, 'pp-skill').status, 'differs');
  assert.match(check(reported, 'pp-skill').fix, /--update/);
  assert.equal(reported.steps.find((s) => s.id === 'pp-skill').done, true, 'not rewritten without --update');
  assert.deepEqual(reported.blocked, [], 'it informs, it does not block');
  assert.equal(plan(dir, env(machine(installed)), { update: true }).steps.find((s) => s.id === 'pp-skill').done, false);
});

test('apply: writes the /pp skill as a plain file, and a second run does nothing', (t) => {
  const dir = project(t, { specify: true, pp: false });
  const m = machine(installed);
  const result = apply(dir, env(m), { run: () => ({ status: 0 }) });
  assert.ok(result.ran.includes('pp-skill'));
  assert.equal(readFileSync(join(dir, '.claude/skills/pp/SKILL.md'), 'utf8'), readFileSync(PP_SKILL, 'utf8'));
  assert.equal(statSync(join(dir, '.claude/skills/pp/SKILL.md')).mode & 0o111, 0, 'not executable');
  spawnSync('git', ['add', '-A'], { cwd: dir });
  spawnSync('git', ['commit', '-q', '-m', 'pp'], { cwd: dir });
  assert.deepEqual(apply(dir, env(machine(installed)), { run: () => ({ status: 0 }) }).ran.filter((id) => id === 'pp-skill'), []);
});

test('plan: the answer recorder and its hook are verified, because without them no panel answer lets an approval through', (t) => {
  const dir = project(t, { specify: true });
  mkdirSync(join(dir, '.claude'), { recursive: true });
  mkdirSync(join(dir, '.specify/extensions/sddpp-guard/scripts/python'), { recursive: true });
  const status = () => check(plan(dir, env(machine(installed))), 'answer-hook').status;
  assert.equal(status(), 'missing');
  writeFileSync(join(dir, '.claude/settings.json'), JSON.stringify({ hooks: { PostToolUse: [{ hooks: [{ command: 'python3 .specify/events.py speckit.sddpp-guard.record-answer post_tool_use 60' }] }] } }));
  assert.equal(status(), 'missing', 'the hook alone is not enough: its scripts must be there');
  writeFileSync(join(dir, '.specify/extensions/sddpp-guard/scripts/python/record_answer.py'), '#');
  assert.equal(status(), 'missing', 'the module it imports too');
  writeFileSync(join(dir, '.specify/extensions/sddpp-guard/scripts/python/ledger.py'), '#');
  assert.equal(status(), 'ok');
  assert.match(check(plan(project(t, { specify: true }), env(machine(installed))), 'answer-hook').fix, /--update/);
});

// ── the short commands (the owner's decision, 2026-11-12, option A) ──
const longDir = (dir, name) => join(dir, '.claude/skills', name);
function withLongSkills(dir) {
  for (const name of longSkillNames(SUITE)) {
    mkdirSync(longDir(dir, name), { recursive: true });
    writeFileSync(join(longDir(dir, name), 'SKILL.md'), `---\nname: ${name}\n---\n`);
  }
  spawnSync('git', ['add', '-A'], { cwd: dir });
  spawnSync('git', ['commit', '-q', '-m', 'Spec Kit wrote the long skills'], { cwd: dir });
  return dir;
}

test('init: the long skills Spec Kit writes are removed, the hooks keep working from extension.yml, and the short ones stay', (t) => {
  const dir = withLongSkills(project(t, { specify: true }));
  const before = plan(dir, env(machine(installed)));
  const pending = before.steps.filter((s) => !s.done).map((s) => s.id);
  assert.deepEqual(pending, longSkillNames(SUITE).map((n) => `drop-long-${n}`));
  assert.ok(pending.includes('drop-long-speckit-sddpp-guard-pre-tool'), 'the hook skills go too: a person never types them');
  apply(dir, env(machine(installed)), { run: () => ({ status: 0 }) });
  for (const name of longSkillNames(SUITE)) assert.ok(!existsSync(longDir(dir, name)), name);
  for (const skill of shortSkills(SUITE)) assert.equal(readFileSync(join(dir, '.claude/skills', skill.name, 'SKILL.md'), 'utf8'), skill.content);
  assert.equal(check(plan(dir, env(machine(installed))), 'short-skills').status, 'ok');
});

test('init: a short command that is missing is written; one edited by hand is left alone unless --update', (t) => {
  const dir = project(t, { specify: true });
  rmSync(join(dir, '.claude/skills/pp-build'), { recursive: true });
  writeFileSync(join(dir, '.claude/skills/pp-audit/SKILL.md'), 'my own audit\n');
  spawnSync('git', ['add', '-A'], { cwd: dir });
  spawnSync('git', ['commit', '-q', '-m', 'edit'], { cwd: dir });
  const p = plan(dir, env(machine(installed)));
  assert.equal(check(p, 'short-skills').status, 'missing');
  assert.deepEqual(p.steps.filter((s) => !s.done).map((s) => s.id), ['short-pp-build']);
  apply(dir, env(machine(installed)), { run: () => ({ status: 0 }) });
  assert.equal(readFileSync(join(dir, '.claude/skills/pp-audit/SKILL.md'), 'utf8'), 'my own audit\n', 'not overwritten without --update');
  assert.equal(check(plan(dir, env(machine(installed))), 'short-skills').status, 'differs');
  spawnSync('git', ['add', '-A'], { cwd: dir });
  spawnSync('git', ['commit', '-q', '-m', 'installed'], { cwd: dir });
  apply(dir, env(machine(installed)), { run: () => ({ status: 0 }), update: true });
  assert.equal(check(plan(dir, env(machine(installed))), 'short-skills').status, 'ok');
});

test('init: while an extension is still to be installed, removing its long skills is still to do, so it runs after Spec Kit writes them', (t) => {
  const dir = project(t, { specify: true });
  const p = plan(dir, env(machine({ extensions: [] })));
  for (const name of longSkillNames(SUITE)) assert.equal(p.steps.find((s) => s.id === `drop-long-${name}`).done, false, name);
  const order = p.steps.map((s) => s.id);
  assert.ok(order.indexOf('extension-sddpp-cycle') < order.indexOf('drop-long-speckit-sddpp-cycle-build'));
});

// ── what draws and captures the interface (F-U1): reported, never installed, never blocking ──
test('the pins list three capture tools for each kind of project, each with how to install it', () => {
  for (const kind of ['web', 'electron', 'desktop_webview', 'mobile']) {
    const tools = pins.capture.tools[kind];
    assert.equal(tools.length, 3, kind);
    for (const tool of tools) {
      assert.ok(tool.name && tool.install && Array.isArray(tool.bin), `${kind}: ${JSON.stringify(tool)}`);
      assert.ok(tool.seen === null || /^\d+\.\d+\.\d+/.test(tool.seen), 'a version seen, or null when it is not on npm');
    }
  }
  assert.ok(pins.capture.design_skills.includes('frontend-design'));
});

test('plan: the capture tool and the design skills on the machine are reported, as information that blocks nothing', (t) => {
  const bare = plan(project(t, { specify: true }), env(machine(installed), { home: mkdtempSync(join(tmpdir(), 'home-')) }));
  assert.equal(check(bare, 'capture-tool').status, 'info');
  assert.match(check(bare, 'capture-tool').found, /none/);
  assert.match(check(bare, 'design-skills').found, /none/);
  assert.deepEqual(bare.blocked, []);
  const bin = mkdtempSync(join(tmpdir(), 'bin-'));
  writeFileSync(join(bin, 'playwright-cli'), '');
  const home = mkdtempSync(join(tmpdir(), 'home-'));
  mkdirSync(join(home, '.claude/skills/frontend-design'), { recursive: true });
  writeFileSync(join(home, '.claude/skills/frontend-design/SKILL.md'), '---\nname: frontend-design\n---\n');
  const ready = plan(project(t, { specify: true }), env(machine(installed), { home, pathDirs: [bin] }));
  assert.match(check(ready, 'capture-tool').found, /playwright-cli/);
  assert.match(check(ready, 'design-skills').found, /frontend-design/);
  assert.match(renderPlan(ready), /info +Interface capture tool/);
});

test('plan: a design skill that a plugin brings is found, and a folder with no SKILL.md is not a skill', (t) => {
  const home = mkdtempSync(join(tmpdir(), 'home-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const install = join(home, '.claude/plugins/cache/m/designer/1');
  mkdirSync(join(install, 'skills/frontend-design'), { recursive: true });
  writeFileSync(join(install, 'skills/frontend-design/SKILL.md'), '---\nname: frontend-design\n---\n');
  mkdirSync(join(home, '.claude/skills/awesome-design-md'), { recursive: true }); // empty: not a skill
  mkdirSync(join(home, '.claude/plugins'), { recursive: true });
  writeFileSync(join(home, '.claude/plugins/installed_plugins.json'), JSON.stringify({ version: 2, plugins: { 'designer@m': [{ scope: 'user', installPath: install }] } }));
  const found = check(plan(project(t, { specify: true }), env(machine(installed), { home })), 'design-skills').found;
  assert.match(found, /frontend-design/);
  assert.doesNotMatch(found, /awesome-design-md/);
});

test('plan: the skills, plugins and MCP servers the person has are reported by name as information that blocks nothing, and no server detail leaks', (t) => {
  const home = mkdtempSync(join(tmpdir(), 'home-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  mkdirSync(join(home, '.claude/skills/my-skill'), { recursive: true });
  writeFileSync(join(home, '.claude/skills/my-skill/SKILL.md'), '---\nname: my-skill\n---\n');
  writeFileSync(join(home, '.claude.json'), JSON.stringify({ mcpServers: { figma: { type: 'http', url: 'https://URL-SECRET.invalid' }, db: { command: 'x', env: { TOKEN: 'TOKEN-SECRET' } } } }));
  const p = plan(project(t, { specify: true }), env(machine(installed), { home }));
  const c = check(p, 'tools-inventory');
  assert.equal(c.status, 'info');
  assert.match(c.found, /^skills 1 \(my-skill\)/); // the project's own /pp-* commands are not counted as the person's
  assert.match(c.found, /MCP 2\b.*db.*figma/);
  assert.match(c.found, /plugins 0/);
  assert.deepEqual(p.blocked, []);
  assert.doesNotMatch(JSON.stringify(p) + renderPlan(p), /URL-SECRET|TOKEN-SECRET/);
});

test('plan: more than ten tools are cut to ten names and the rest are counted, so the line stays readable', (t) => {
  const home = mkdtempSync(join(tmpdir(), 'home-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  for (let i = 1; i <= 12; i++) {
    mkdirSync(join(home, `.claude/skills/skill-${String(i).padStart(2, '0')}`), { recursive: true });
    writeFileSync(join(home, `.claude/skills/skill-${String(i).padStart(2, '0')}/SKILL.md`), '---\nname: x\n---\n');
  }
  const found = check(plan(project(t, { specify: true }), env(machine(installed), { home })), 'tools-inventory').found;
  assert.match(found, /^skills 12 \(skill-01, .*skill-10, \+2 more\)/);
  assert.doesNotMatch(found, /skill-11/);
});

test('plan: an unreadable tools file is said so without quoting it, and blocks nothing', (t) => {
  const home = mkdtempSync(join(tmpdir(), 'home-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  writeFileSync(join(home, '.claude.json'), '{ broken SECRET-TEXT');
  const p = plan(project(t, { specify: true }), env(machine(installed), { home }));
  assert.match(check(p, 'tools-inventory').found, /could not be read/);
  assert.doesNotMatch(JSON.stringify(p), /SECRET-TEXT/);
  assert.deepEqual(p.blocked, []);
});
