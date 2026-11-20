import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CLI, repo } from './helpers.mjs';

const run = (dir, ...args) => spawnSync('node', [CLI, ...args], { cwd: dir, encoding: 'utf8', env: { ...process.env, CI: '1' } });
const SHARED = '.sddpp/map/descriptions/backend.json';
const fileOn = (r, p) => JSON.parse(readFileSync(join(r.dir, 'floorplan/graph.json'), 'utf8')).files.find((f) => f.p === p);

/** The example with one code file, the map on with descriptions of the given kind, and that file described. */
function project(t, descriptions) {
  const r = repo(t);
  r.commit('build: the task list', { 'src/tasks.ts': 'export const tasks = [];\n' });
  assert.equal(run(r.dir, 'map', '--on', '--descriptions', descriptions).status, 0);
  const out = run(r.dir, 'map', '--describe');
  assert.equal(out.status, 0, out.stdout + out.stderr);
  return { r, out };
}
const describe = (r, file) => {
  const d = JSON.parse(readFileSync(join(r.dir, file), 'utf8'));
  d.files['src/tasks.ts'] = { name: 'Task list', description: 'Holds the tasks in memory, empty for now.' };
  writeFileSync(join(r.dir, file), JSON.stringify(d, null, 2));
};

test('shared: --describe points at the files in .sddpp/map/descriptions, which git keeps', (t) => {
  const { r, out } = project(t, 'shared');
  assert.match(out.stdout, /-> \.sddpp\/map\/descriptions\/backend\.json/);
  assert.ok(existsSync(join(r.dir, SHARED)));
  assert.ok(r.git('status', '--porcelain').includes('.sddpp/map/'), 'in the project, for git');
});

test('shared: a description written there is drawn, and survives a fresh clone (no floorplan/ folder at all)', (t) => {
  const { r } = project(t, 'shared');
  describe(r, SHARED);
  assert.equal(run(r.dir, 'map', '--html').status, 0);
  assert.equal(fileOn(r, 'src/tasks.ts').name, 'Task list');
  rmSync(join(r.dir, 'floorplan'), { recursive: true, force: true });
  assert.equal(run(r.dir, 'map', '--html').status, 0);
  assert.equal(fileOn(r, 'src/tasks.ts').name, 'Task list');
});

test('shared: when the code changes, the review flag Floorplan adds is kept in the shared file, for the next person too', (t) => {
  const { r } = project(t, 'shared');
  describe(r, SHARED);
  assert.equal(run(r.dir, 'map', '--html').status, 0);
  r.commit('build: add a task', { 'src/tasks.ts': 'export const tasks = [];\nexport function add(title) { tasks.push(title); }\n' });
  assert.equal(run(r.dir, 'map', '--html').status, 0);
  const shared = JSON.parse(readFileSync(join(r.dir, SHARED), 'utf8'));
  assert.equal(shared.files['src/tasks.ts'].name, 'Task list');
  assert.ok(shared.files['src/tasks.ts'].review, 'flagged in the shared copy');
});

test('per clone: nothing is written to .sddpp/map/descriptions', (t) => {
  const { r, out } = project(t, 'clone');
  assert.match(out.stdout, /-> floorplan\/descriptions\/backend\.json/);
  describe(r, 'floorplan/descriptions/backend.json');
  assert.equal(run(r.dir, 'map', '--html').status, 0);
  assert.ok(!existsSync(join(r.dir, '.sddpp/map/descriptions')));
});

test('switching from per clone to shared keeps the descriptions already written', (t) => {
  const { r } = project(t, 'clone');
  describe(r, 'floorplan/descriptions/backend.json');
  assert.equal(run(r.dir, 'map', '--html').status, 0);
  const out = run(r.dir, 'map', '--descriptions', 'shared');
  assert.equal(out.status, 0, out.stderr);
  assert.equal(JSON.parse(readFileSync(join(r.dir, SHARED), 'utf8')).files['src/tasks.ts'].name, 'Task list');
});
