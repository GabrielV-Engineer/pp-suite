import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sessionContext, CAP } from '../src/session.mjs';
import { CLI, repo } from './helpers.mjs';

test('session: says which project this is, at which design revision, and what `ppc next` says', (t) => {
  const { dir } = repo(t);
  const out = sessionContext(dir);
  assert.match(out.split('\n')[0], /^pp-suite: Todo App \(blueprint revision 1\)/);
  assert.match(out, /SL-001/, 'the same text `ppc next` prints');
  assert.match(out, /ppc start SL-001/);
});

test('session: follows the real git history, like ppc next does', (t) => {
  const r = repo(t);
  assert.match(sessionContext(r.dir), /ppc start SL-001/);
  spawnSync(process.execPath, [CLI, 'start', 'SL-001', r.dir]);
  assert.match(sessionContext(r.dir), /in progress/i);
});

test('session: outside a pp-suite project it says nothing at all, so the hook is harmless in any repository', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'ppc-empty-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  assert.equal(sessionContext(dir), '');
  assert.equal(sessionContext(join(dir, 'does-not-exist')), '');
});

test('session: a broken project gives one short line, never an exception', (t) => {
  const r = repo(t);
  writeFileSync(join(r.dir, '.architect/blueprint.yaml'), ': : not yaml [');
  let out;
  assert.doesNotThrow(() => (out = sessionContext(r.dir)));
  assert.match(out, /^pp-suite: /);
  assert.ok(out.length < 400, out);
});

test('session: it is capped, because the hook runs at the start of every session', (t) => {
  const r = repo(t);
  assert.ok(CAP <= 2500);
  assert.ok(sessionContext(r.dir).length <= CAP + 200);
});

test('CLI: session always exits 0, prints the context in a project and nothing elsewhere', (t) => {
  const { dir } = repo(t);
  const inProject = spawnSync(process.execPath, [CLI, 'session', dir], { encoding: 'utf8' });
  assert.equal(inProject.status, 0);
  assert.match(inProject.stdout, /pp-suite: Todo App/);
  const empty = mkdtempSync(join(tmpdir(), 'ppc-empty-'));
  t.after(() => rmSync(empty, { recursive: true, force: true }));
  const elsewhere = spawnSync(process.execPath, [CLI, 'session', empty], { encoding: 'utf8' });
  assert.equal(elsewhere.status, 0);
  assert.equal(elsewhere.stdout, '');
});

// ── installed, but no design yet ─────────────────────────────────
const scratch = (t, { installed = true, architect = null } = {}) => {
  const dir = mkdtempSync(join(tmpdir(), 'ppc-nodesign-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  if (installed) {
    mkdirSync(join(dir, '.specify/extensions/architect-pp'), { recursive: true });
    writeFileSync(join(dir, '.specify/extensions/architect-pp/extension.yml'), 'extension:\n  id: architect-pp\n');
  }
  if (architect) {
    mkdirSync(join(dir, '.architect'), { recursive: true });
    for (const file of architect) writeFileSync(join(dir, '.architect', file), '');
  }
  return dir;
};
const run = (command, dir) => spawnSync(process.execPath, [CLI, command, dir], { encoding: 'utf8' });

test('session: installed and no design yet, it says so and what to run, within the cap', (t) => {
  const out = sessionContext(scratch(t));
  assert.match(out.split('\n')[0], /^pp-suite: .*no design yet/i);
  assert.match(out, /\/pp-design/);
  assert.ok(out.length <= CAP + 200);
  assert.equal(sessionContext(scratch(t, { architect: [] })).split('\n')[0], out.split('\n')[0], 'an empty .architect/ counts as no design');
});

test('session: not installed, it stays silent even with no design', (t) => {
  assert.equal(sessionContext(scratch(t, { installed: false })), '');
});

test('session: a half-written .architect/ is not "no design yet"', (t) => {
  const out = sessionContext(scratch(t, { architect: ['architecture.md'] }));
  assert.doesNotMatch(out, /no design yet/i);
});

test('CLI: next in an installed project with no design is not an error', (t) => {
  const r = run('next', scratch(t));
  assert.equal(r.status, 0);
  assert.match(r.stdout, /No design yet/);
  assert.match(r.stdout, /\/pp-design/);
});

test('CLI: next still reports the missing files when pp-suite is not installed or the design is half-written', (t) => {
  for (const dir of [scratch(t, { installed: false }), scratch(t, { architect: ['architecture.md'] })]) {
    const r = run('next', dir);
    assert.equal(r.status, 1);
    assert.match(r.stdout + r.stderr, /R00 .*blueprint\.yaml/);
  }
});

test('CLI: session exits 0 in all three states', (t) => {
  for (const dir of [scratch(t), scratch(t, { installed: false }), scratch(t, { architect: ['architecture.md'] })]) {
    assert.equal(run('session', dir).status, 0);
  }
});

// Issue #8: the dispatcher does not enforce a guard whose script is missing, and nothing said so. `ppc init` checks it when it runs; the
// session start says it every time, because that is where a person (and the agent) look.
const GUARD_HOOK = '.claude/settings.json';
const GUARD_SCRIPT = '.specify/extensions/sddpp-guard/scripts/python/guard.py';
const registerGuard = (dir) => {
  mkdirSync(join(dir, '.claude'), { recursive: true });
  writeFileSync(join(dir, GUARD_HOOK), JSON.stringify({ hooks: { PreToolUse: [{ hooks: [{ type: 'command', command: 'x speckit.sddpp-guard.pre-tool' }] }] } }));
};

test('session: a registered guard whose script is missing is said first, with the fix', (t) => {
  const { dir } = repo(t);
  registerGuard(dir);
  const out = sessionContext(dir);
  assert.match(out.split('\n')[0], /guard/i);
  assert.match(out, /not enforced|fails open/i);
  assert.match(out, /ppc init --apply --update/);
  assert.match(out, /pp-suite: Todo App/, 'the state follows');
});

test('session: the warning is also given before the design exists', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'ppc-guard-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  registerGuard(dir);
  assert.match(sessionContext(dir), /guard/i);
});

test('session: no warning when the script is there, or when no guard is registered', (t) => {
  const { dir } = repo(t);
  assert.doesNotMatch(sessionContext(dir), /guard/i, 'not registered: ppc init reports it, the session start stays quiet');
  registerGuard(dir);
  mkdirSync(join(dir, GUARD_SCRIPT, '..'), { recursive: true });
  writeFileSync(join(dir, GUARD_SCRIPT), '# guard');
  assert.doesNotMatch(sessionContext(dir), /guard/i);
});

test('session: a guard warning does not push the state past the cap', (t) => {
  const { dir } = repo(t);
  registerGuard(dir);
  assert.ok(sessionContext(dir).length <= CAP + 400);
});

// ── the install and this pp-suite agree (found in the first real project: a skill added since the last update was named and absent) ───
const installPp = (dir) => {
  mkdirSync(join(dir, '.claude/skills/pp'), { recursive: true });
  writeFileSync(join(dir, '.claude/skills/pp/SKILL.md'), readFileSync(new URL('../../../sdd-pp/skills/pp/SKILL.md', import.meta.url), 'utf8'));
};

test('session: where /pp is installed and the other commands are not, the start says so, then the usual text', (t) => {
  const { dir } = repo(t);
  installPp(dir);
  const out = sessionContext(dir);
  assert.match(out.split('\n')[0], /^pp-suite WARNING: the installed commands do not match this pp-suite \(missing: \/pp-design, /);
  assert.match(out, /\n\npp-suite: Todo App \(blueprint revision 1\)/);
  assert.match(out, /ppc start SL-001/);
});

test('session: it says nothing of the install where pp-suite is not installed, so existing projects and other repositories hear nothing new', (t) => {
  const { dir } = repo(t);
  assert.doesNotMatch(sessionContext(dir), /WARNING/);
});

test('next --json: when the next step names a command this project lacks, the warning travels with the data the /pp skill reads', (t) => {
  const { dir } = repo(t);
  installPp(dir);
  const ppc = (...args) => spawnSync(process.execPath, [CLI, ...args, dir], { encoding: 'utf8' });
  assert.equal(JSON.parse(ppc('next', '--json').stdout).warnings, undefined, 'the next step is `ppc start`, which needs no skill: the session said the rest');
  assert.equal(ppc('start', 'SL-001').status, 0);
  const data = JSON.parse(ppc('next', '--json').stdout);
  assert.equal(data.skill, 'pp-red');
  assert.match(data.warnings[0], /^pp-suite WARNING: \/pp-red is named by the next step but is not installed/);
  assert.match(ppc('next').stdout, /^pp-suite WARNING: \/pp-red is named/);
});
