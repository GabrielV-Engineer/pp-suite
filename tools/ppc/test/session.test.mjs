import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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
  assert.match(out, /\/speckit-architect-pp-handoff/);
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
  assert.match(r.stdout, /\/speckit-architect-pp-handoff/);
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
