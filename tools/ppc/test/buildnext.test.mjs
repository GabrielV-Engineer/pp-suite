import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadProject } from '../src/load.mjs';
import { nextSteps } from '../src/next.mjs';
import { buildFacts, sessionContext } from '../src/session.mjs';
import { CLI, EXAMPLE, lines, repo } from './helpers.mjs';

const sl = (m, id) => m.slices.find((s) => s.data.id === id).data;
const inBuild = (m, policy) => Object.assign(sl(m, 'SL-001'), { status: 'in_progress', phase: 'build', mode: 'light', ...(policy ? { test_policy: policy } : {}) });

// Found closing SL-003 and SL-004 in the first real project (F-D1, then again): the first build commit only added dependencies, a
// change request paused the slice, and when it resumed `ppc next` offered the audit of a slice with no code and no test.
test('next: a build slice that needs tests and has none in its build commits is still being built, not ready to audit', () => {
  const m = loadProject(EXAMPLE);
  inBuild(m, 'required');
  const r = nextSteps(m, ['build(SL-001): add the dependencies'], [], { buildsWithoutTests: new Set(['SL-001']) });
  assert.match(r.actions[0].command, /build/);
  assert.doesNotMatch(r.actions[0].command, /audit/);
  assert.match(r.actions[0].what, /none of its commits holds a test/);
  assert.match(r.actions[0].what, /audit it/, 'and says what follows when it is complete');
  assert.deepEqual(r.actions.map((a) => a.who), ['agent']);
});

test('next: the same build commits lead to the audit when tests exist, when none are needed, or when nothing is known', () => {
  const subjects = ['build(SL-001): the work'];
  for (const [policy, facts] of [['required', { buildsWithoutTests: new Set() }], ['required', undefined], ['optional', { buildsWithoutTests: new Set(['SL-001']) }], ['none', { buildsWithoutTests: new Set(['SL-001']) }]]) {
    const m = loadProject(EXAMPLE);
    inBuild(m, policy);
    assert.match(nextSteps(m, subjects, [], facts).actions[0].command, /audit/, `${policy} ${facts ? 'with facts' : 'without facts'}`);
  }
});

// ── the facts come from the real history ─────────────────────────
test('buildFacts: a slice whose build commits changed no test file is listed, and stops being listed once one does', (t) => {
  const r = repo(t);
  assert.deepEqual([...buildFacts(r.dir).buildsWithoutTests], [], 'no build commit yet');
  r.commit('build(SL-001): add the dependencies', { 'package.json': '{}\n', 'package-lock.json': lines(3) });
  assert.deepEqual([...buildFacts(r.dir).buildsWithoutTests], ['SL-001']);
  r.commit('build(SL-002): code and its test together', { 'src/a.ts': lines(2), 'tests/a.test.ts': lines(2) });
  assert.deepEqual([...buildFacts(r.dir).buildsWithoutTests], ['SL-001'], 'SL-002 changed a test');
  r.commit('build(SL-001): the code and its test', { 'src/b.ts': lines(2), 'src/b.test.ts': lines(2) });
  assert.deepEqual([...buildFacts(r.dir).buildsWithoutTests], [], 'SL-001 has a test now');
  r.commit('fix(SL-003): not a build commit', { 'src/c.ts': lines(1) });
  assert.deepEqual([...buildFacts(r.dir).buildsWithoutTests], []);
});

test('buildFacts: outside a git repository there is nothing to say', () => {
  assert.deepEqual([...buildFacts('/').buildsWithoutTests], []);
});

test('CLI: ppc next --json offers the build, not the audit, while the build commits hold no test', (t) => {
  const r = repo(t);
  const file = join(r.dir, '.sddpp/slices/SL-001-deployable-skeleton.md');
  const text = readFileSync(file, 'utf8').replace(/^status: ready$/m, 'status: in_progress\nphase: build\nmode: light\ntest_policy: required');
  r.write({ '.sddpp/slices/SL-001-deployable-skeleton.md': text, '.sddpp/active.json': '{"slice":"SL-001","phase":"build"}\n' });
  r.commit('build(SL-001): add the dependencies', { 'package.json': '{}\n' });
  const out = JSON.parse(spawnSync('node', [CLI, 'next', '--json'], { cwd: r.dir, encoding: 'utf8' }).stdout);
  assert.equal(out.kind, 'agent-step');
  assert.match(out.skill ?? out.command ?? '', /build/);
  assert.match(sessionContext(r.dir), /pp-build/, 'the session-start hook says the same');
  assert.doesNotMatch(sessionContext(r.dir), /pp-audit/);
  r.commit('build(SL-001): code and test', { 'src/a.ts': lines(2), 'tests/a.test.ts': lines(2) });
  const done = JSON.parse(spawnSync('node', [CLI, 'next', '--json'], { cwd: r.dir, encoding: 'utf8' }).stdout);
  assert.match(done.skill ?? done.command ?? '', /audit/);
});
