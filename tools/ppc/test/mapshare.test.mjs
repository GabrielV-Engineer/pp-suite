import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { safePath } from '../src/descriptions.mjs';
import { CLI, repo } from './helpers.mjs';

const run = (dir, ...args) => spawnSync('node', [CLI, ...args], { cwd: dir, encoding: 'utf8', env: { ...process.env, CI: '1' } });
const LOCAL = 'floorplan/descriptions/backend.json';
const shared = (p) => `.sddpp/map/descriptions/files/${p}.json`;
const fileOn = (r, p) => JSON.parse(readFileSync(join(r.dir, 'floorplan/graph.json'), 'utf8')).files.find((f) => f.p === p);
const readShared = (r, p) => JSON.parse(readFileSync(join(r.dir, shared(p)), 'utf8'));

/** The example with code files, the map on with descriptions of the given kind, and the worksheets written. */
function project(t, descriptions, files = { 'src/tasks.ts': 'export const tasks = [];\n' }) {
  const r = repo(t);
  r.commit('build: the code', files);
  assert.equal(run(r.dir, 'map', '--on', '--descriptions', descriptions).status, 0);
  const out = run(r.dir, 'map', '--describe');
  assert.equal(out.status, 0, out.stdout + out.stderr);
  return { r, out };
}
/** What the agent does with a worksheet: fill entries in the descriptions file it names. */
const describe = (r, entries, file = LOCAL) => {
  const d = JSON.parse(readFileSync(join(r.dir, file), 'utf8'));
  Object.assign(d.files, entries);
  writeFileSync(join(r.dir, file), JSON.stringify(d, null, 2));
};
const TASKS = { 'src/tasks.ts': { name: 'Task list', description: 'Holds the tasks in memory, empty for now.' } };
const html = (r) => {
  const out = run(r.dir, 'map', '--html');
  assert.equal(out.status, 0, out.stdout + out.stderr);
  return out;
};

test('shared: the agent writes in floorplan/descriptions, and the next drawing puts each description in its own file in git', (t) => {
  const { r, out } = project(t, 'shared');
  assert.match(out.stdout, /-> floorplan\/descriptions\/backend\.json/);
  assert.ok(!existsSync(join(r.dir, shared('src/tasks.ts'))), 'an empty skeleton is not shared');
  describe(r, TASKS);
  html(r);
  assert.deepEqual(readShared(r, 'src/tasks.ts'), TASKS['src/tasks.ts']);
  assert.ok(r.git('status', '--porcelain', '--untracked-files=all').includes(shared('src/tasks.ts')), 'in the project, for git');
  assert.equal(fileOn(r, 'src/tasks.ts').name, 'Task list');
});

test('shared: a description survives a fresh clone (no floorplan/ folder at all)', (t) => {
  const { r } = project(t, 'shared');
  describe(r, TASKS);
  html(r);
  rmSync(join(r.dir, 'floorplan'), { recursive: true, force: true });
  html(r);
  assert.equal(fileOn(r, 'src/tasks.ts').name, 'Task list');
});

test('shared: when the code changes, the review flag Floorplan adds is kept in the shared file, for the next person too', (t) => {
  const { r } = project(t, 'shared');
  describe(r, TASKS);
  html(r);
  r.commit('build: add a task', { 'src/tasks.ts': 'export const tasks = [];\nexport function add(title) { tasks.push(title); }\n' });
  html(r);
  const entry = readShared(r, 'src/tasks.ts');
  assert.equal(entry.name, 'Task list');
  assert.ok(entry.review, 'flagged in the shared copy');
  // the agent rewrites it and drops the flag, as Floorplan's guide says, in the file the worksheet names
  const d = JSON.parse(readFileSync(join(r.dir, LOCAL), 'utf8'));
  assert.ok(d.files['src/tasks.ts'].review, 'the flag is in the file the agent edits');
  delete d.files['src/tasks.ts'].review;
  writeFileSync(join(r.dir, LOCAL), JSON.stringify(d));
  html(r);
  assert.equal(readShared(r, 'src/tasks.ts').review, undefined, 'settled');
});

test('shared: two branches that describe different files of the same component merge without a conflict', (t) => {
  const { r } = project(t, 'shared', { 'src/tasks.ts': 'export const tasks = [];\n', 'src/users.ts': 'export const users = [];\n' });
  r.git('add', '-A');
  r.git('commit', '-q', '-m', 'map on');
  r.git('checkout', '-q', '-b', 'tasks');
  describe(r, TASKS);
  html(r);
  r.git('add', '-A');
  r.git('commit', '-q', '-m', 'describe tasks');
  r.git('checkout', '-q', 'main');
  html(r);
  assert.ok(!existsSync(join(r.dir, shared('src/tasks.ts'))), 'back on main: the other branch keeps its description');
  run(r.dir, 'map', '--describe');
  r.git('checkout', '-q', '-b', 'users');
  describe(r, { 'src/users.ts': { name: 'Users', description: 'Holds the users in memory.' } });
  html(r);
  r.git('add', '-A');
  r.git('commit', '-q', '-m', 'describe users');
  const merge = spawnSync('git', ['merge', '-q', '--no-edit', 'tasks'], { cwd: r.dir, encoding: 'utf8' });
  assert.equal(merge.status, 0, merge.stdout + merge.stderr);
  html(r);
  assert.equal(fileOn(r, 'src/tasks.ts').name, 'Task list');
  assert.equal(fileOn(r, 'src/users.ts').name, 'Users');
});

test('shared: a renamed file takes its description with it, and a deleted one takes it away', (t) => {
  const { r } = project(t, 'shared', { 'src/tasks.ts': 'export const tasks = [];\n', 'src/users.ts': 'export const users = [];\n' });
  describe(r, { ...TASKS, 'src/users.ts': { name: 'Users', description: 'Holds the users in memory.' } });
  html(r);
  r.git('mv', 'src/tasks.ts', 'src/todo.ts');
  r.git('rm', '-q', 'src/users.ts');
  r.git('commit', '-q', '-m', 'move and delete');
  html(r);
  assert.equal(readShared(r, 'src/todo.ts').name, 'Task list');
  assert.ok(!existsSync(join(r.dir, shared('src/tasks.ts'))));
  assert.ok(!existsSync(join(r.dir, shared('src/users.ts'))));
});

test('shared: a description a merge left broken is named, left out of the map and left in place for a person', (t) => {
  const { r } = project(t, 'shared');
  describe(r, TASKS);
  html(r);
  const broken = '{\n<<<<<<< HEAD\n  "name": "Task list"\n=======\n  "name": "Tasks"\n>>>>>>> other\n}\n';
  writeFileSync(join(r.dir, shared('src/tasks.ts')), broken);
  const out = html(r);
  assert.match(out.stderr, /\.sddpp\/map\/descriptions\/files\/src\/tasks\.ts\.json is not valid JSON \(a merge conflict\?\)/);
  assert.equal(readFileSync(join(r.dir, shared('src/tasks.ts')), 'utf8'), broken, 'not deleted, not rewritten');
  assert.notEqual(fileOn(r, 'src/tasks.ts').name, 'Task list');
  // writing it again settles it
  run(r.dir, 'map', '--describe');
  describe(r, TASKS);
  assert.doesNotMatch(html(r).stderr, /not valid JSON/);
  assert.equal(readShared(r, 'src/tasks.ts').name, 'Task list');
});

test('shared: descriptions kept in the earlier shape (one JSON per component) are split into one file each', (t) => {
  const { r } = project(t, 'shared');
  mkdirSync(join(r.dir, '.sddpp/map/descriptions'), { recursive: true });
  writeFileSync(join(r.dir, '.sddpp/map/descriptions/backend.json'), JSON.stringify({ files: TASKS }));
  html(r);
  assert.ok(!existsSync(join(r.dir, '.sddpp/map/descriptions/backend.json')));
  assert.equal(readShared(r, 'src/tasks.ts').name, 'Task list');
  assert.equal(fileOn(r, 'src/tasks.ts').name, 'Task list');
});

test('shared: a key that would leave the shared folder is not written', (t) => {
  const { r } = project(t, 'shared');
  describe(r, { '../../escape': { name: 'x', description: 'y' } });
  html(r);
  assert.ok(!existsSync(join(r.dir, '.sddpp/escape.json')));
  const dir = join(r.dir, '.sddpp/map/descriptions');
  assert.ok(!existsSync(dir) || readdirSync(dir).length === 0, 'nothing shared');
  for (const bad of ['', '/etc/x', 'a/../b', 'a\\b', 'C:/x', './a', 'a//b']) assert.equal(safePath(bad), false, bad);
  assert.equal(safePath('src/app/page.tsx'), true);
});

test('per clone: nothing is written to .sddpp/map/descriptions', (t) => {
  const { r, out } = project(t, 'clone');
  assert.match(out.stdout, /-> floorplan\/descriptions\/backend\.json/);
  describe(r, TASKS);
  html(r);
  assert.equal(fileOn(r, 'src/tasks.ts').name, 'Task list');
  assert.ok(!existsSync(join(r.dir, '.sddpp/map/descriptions')));
});

test('switching from per clone to shared keeps the descriptions already written', (t) => {
  const { r } = project(t, 'clone');
  describe(r, TASKS);
  html(r);
  const out = run(r.dir, 'map', '--descriptions', 'shared');
  assert.equal(out.status, 0, out.stderr);
  assert.equal(readShared(r, 'src/tasks.ts').name, 'Task list');
  html(r);
  assert.equal(fileOn(r, 'src/tasks.ts').name, 'Task list');
});
