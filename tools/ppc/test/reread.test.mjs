import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadProject } from '../src/load.mjs';
import { validateModel } from '../src/validate.mjs';
import { nextSteps, nextJson, renderNext } from '../src/next.mjs';
import { reread, LifecycleError } from '../src/lifecycle.mjs';
import { renderDecision, askFor } from '../src/decisions.mjs';
import { CLI, repo } from './helpers.mjs';

const slice = (dir, id) => loadProject(dir).slices.find((s) => s.data.id === id).data;
const warnings = (dir) => validateModel(loadProject(dir)).filter((f) => f.rule === 'W03');
const fails = (fn, pattern) => assert.throws(fn, (e) => e instanceof LifecycleError && pattern.test(e.message));
const NO_GIT = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' };

/** The design moved on twice: every slice was planned against revision 1 and the blueprint is at 3. */
function moved(t) {
  const r = repo(t);
  const file = '.architect/blueprint.yaml';
  r.write({ [file]: readFileSync(join(r.dir, file), 'utf8').replace(/^revision: 1$/m, 'revision: 3') });
  return r;
}

test('reread: --all brings every unfinished slice to the current revision, and the W03 warnings go away', (t) => {
  const r = moved(t);
  const before = warnings(r.dir);
  assert.equal(before.length, 1, 'one warning for the design change');
  assert.ok(before[0].message.includes('SL-002') && before[0].message.includes('SL-006'), 'it names the slices');
  const result = reread(r.dir, { all: true });
  assert.equal(result.revision, 3);
  assert.ok(result.reread.includes('SL-002') && result.reread.length >= 5);
  assert.deepEqual(warnings(r.dir), []);
  assert.equal(slice(r.dir, 'SL-002').blueprint_revision, 3);
  assert.deepEqual(validateModel(loadProject(r.dir)).filter((f) => f.severity === 'error'), []);
});

test('reread: named slices only, and nothing else in their files changes', (t) => {
  const r = moved(t);
  const before = readFileSync(join(r.dir, '.sddpp/slices/SL-003-complete-a-task.md'), 'utf8');
  assert.deepEqual(reread(r.dir, { ids: ['SL-002'] }).reread, ['SL-002']);
  assert.equal(slice(r.dir, 'SL-002').blueprint_revision, 3);
  assert.equal(slice(r.dir, 'SL-003').blueprint_revision, 1);
  assert.equal(readFileSync(join(r.dir, '.sddpp/slices/SL-003-complete-a-task.md'), 'utf8'), before);
  const after = readFileSync(join(r.dir, '.sddpp/slices/SL-002-create-and-list-tasks.md'), 'utf8').split('\n');
  assert.equal(after.filter((l) => l.startsWith('blueprint_revision:')).join(''), 'blueprint_revision: 3');
});

test('reread: a finished slice is left alone, and it refuses what it cannot do without changing anything', (t) => {
  const r = moved(t);
  const file = '.sddpp/slices/SL-001-deployable-skeleton.md';
  r.write({ [file]: readFileSync(join(r.dir, file), 'utf8').replace(/^status: ready$/m, 'status: dropped') });
  assert.ok(!reread(r.dir, { all: true }).reread.includes('SL-001'));
  const again = moved(t);
  fails(() => reread(again.dir, {}), /--all|name/);
  fails(() => reread(again.dir, { ids: ['SL-099'] }), /unknown slice/);
  reread(again.dir, { ids: ['SL-002'] });
  fails(() => reread(again.dir, { ids: ['SL-002'] }), /already/);
  fails(() => reread(repo(t).dir, { all: true }), /nothing|already|current/i);
});

test('next: slices behind the design are a decision for a person, with the command that settles them', (t) => {
  const r = moved(t);
  const m = loadProject(r.dir);
  const next = nextSteps(m, [], []);
  const stale = next.changes.find((c) => c.decision?.type === 'reread');
  assert.equal(stale.who, 'human');
  assert.equal(stale.command, 'ppc reread --all');
  assert.match(renderNext(next), /ppc reread --all/);
  assert.equal(nextJson(next).changes.find((c) => c.decision?.type === 'reread').command, 'ppc reread --all');
});

test('show reread: says what changed in the design and which slices were planned before it', (t) => {
  const r = moved(t);
  const text = renderDecision(loadProject(r.dir), 'reread');
  assert.match(text, /revision 3/);
  assert.match(text, /SL-002/);
  assert.match(text, /ppc reread --all/);
  assert.equal(renderDecision(loadProject(repo(t).dir), 'reread'), null, 'nothing is behind');
});

test('ask reread: one option reads them all, and it names the exact command', (t) => {
  const r = moved(t);
  const ask = askFor(loadProject(r.dir), 'reread');
  const q = ask.questions[0];
  assert.ok(q.header.length <= 12);
  assert.deepEqual(q.options.filter((o) => o.label.includes(' — ppc ')).map((o) => o.label.split(' — ').at(-1)), ['ppc reread --all']);
  assert.ok(q.options.some((o) => !o.label.includes(' — ppc ')));
  assert.equal(askFor(loadProject(repo(t).dir), 'reread'), null);
});

test('CLI: ppc reread --all and ppc reread SL-002, with show and ask for the word reread', (t) => {
  const r = moved(t);
  assert.match(spawnSync('node', [CLI, 'show', 'reread', r.dir], { encoding: 'utf8' }).stdout, /SL-002/);
  assert.match(JSON.parse(spawnSync('node', [CLI, 'ask', 'reread', r.dir], { encoding: 'utf8' }).stdout).questions[0].question, /reread|read|design/i);
  const one = spawnSync('node', [CLI, 'reread', 'SL-002', r.dir], { encoding: 'utf8', env: NO_GIT });
  assert.equal(one.status, 0, one.stderr);
  assert.equal(slice(r.dir, 'SL-002').blueprint_revision, 3);
  const all = spawnSync('node', [CLI, 'reread', '--all', r.dir], { encoding: 'utf8', env: NO_GIT });
  assert.equal(all.status, 0, all.stderr);
  assert.deepEqual(warnings(r.dir), []);
  assert.equal(spawnSync('node', [CLI, 'reread', r.dir], { encoding: 'utf8' }).status, 1);
});
