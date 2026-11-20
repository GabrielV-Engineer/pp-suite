import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { loadProject } from '../src/load.mjs';
import { FLOORPLAN, toArchitecture, toRecentWork } from '../src/floorplan.mjs';
import { CLI, EXAMPLE, repo } from './helpers.mjs';

const run = (dir, ...args) => spawnSync('node', [CLI, ...args], { cwd: dir, encoding: 'utf8' });
const example = () => loadProject(EXAMPLE);

test('toArchitecture: each component is a node with its kind, its paths and what it is for', () => {
  const arch = toArchitecture(example());
  assert.equal(arch.$schema, 'floorplan/architecture@1');
  assert.equal(arch.project.name, 'Todo App');
  assert.deepEqual(arch.nodes.map((n) => [n.id, n.kind]), [['frontend', 'ui'], ['backend', 'service'], ['database', 'data']]);
  const db = arch.nodes.find((n) => n.id === 'database');
  assert.deepEqual(db.paths, ['migrations/**', 'src/db.ts']);
  assert.match(db.summary, /Stores tasks durably/);
});

test('toArchitecture: the state of each component, its slices and its debt are on its card', () => {
  const be = toArchitecture(example()).nodes.find((n) => n.id === 'backend');
  assert.ok(be.tags.includes('planned'), be.tags.join(', '));
  assert.ok(be.tags.includes('0/8 slices done'));
  assert.ok(be.tags.includes('debt: 1 to decide or pay'));
  assert.match(be.details, /SL-001 Deployable end-to-end skeleton \(ready\)/);
  assert.match(be.details, /DEBT-BE-001/);
});

test('toArchitecture: the design\'s dependencies are edges, and the bookkeeping folders stay off the map', () => {
  const arch = toArchitecture(example());
  assert.deepEqual(arch.edges.map((e) => [e.from, e.to, e.kind]), [['frontend', 'backend', 'call'], ['backend', 'database', 'data']]);
  assert.ok(arch.edges.every((e) => e.label === 'allowed by the design'));
  for (const dir of ['.architect/**', '.sddpp/**']) assert.ok(arch.ignore.includes(dir), dir);
});

test('toArchitecture: capabilities become the tour and the flows, naming only nodes that exist', () => {
  const arch = toArchitecture(example());
  const ids = new Set(arch.nodes.map((n) => n.id));
  assert.ok(arch.tour.length >= 1 && arch.tour.length <= 8);
  assert.match(arch.tour[0].title, /^CAP-001 /);
  assert.ok(arch.tour.every((s) => ids.has(s.node)));
  const flow = arch.flows.find((f) => f.id === 'cap-001');
  assert.equal(flow.title, 'Create and list tasks');
  assert.ok(flow.steps.length >= 2 && flow.steps.every((s) => ids.has(s.node)));
  assert.ok(arch.flows.every((f) => f.steps.length >= 2), 'a flow needs two steps');
});

test('toRecentWork: the slice that closed last, with the files its commits changed', () => {
  const slice = { id: 'SL-002', title: 'Create and list tasks', audit: { production_lines: 80, tests_added: 3 } };
  const rw = toRecentWork(slice, ['src/tasks.ts', 'public/app.js']);
  assert.equal(rw.tasks.length, 1);
  const [task] = rw.tasks;
  assert.equal(task.title, 'SL-002 Create and list tasks');
  assert.match(task.summary, /80 production lines/);
  assert.deepEqual(task.items.map((i) => i.ref), ['src/tasks.ts', 'public/app.js']);
  assert.ok(task.items.every((i) => i.change === 'changed' && /SL-002/.test(i.note)));
  assert.deepEqual(toRecentWork(null, []), { tasks: [] }, 'no closed slice clears the highlights');
});

// The adopted copy must stay as it was published, so that updating it is taking another commit and nothing else.
test('the adopted Floorplan is unmodified: every file matches the checksums it was published with, and nothing was added', () => {
  const dir = FLOORPLAN.dir;
  const listed = new Map();
  for (const line of readFileSync(join(dir, 'CHECKSUMS.txt'), 'utf8').split('\n')) {
    const m = /^([0-9a-f]{64}) {2}skills\/floorplan\/(.+)$/.exec(line);
    if (m) listed.set(m[2], m[1]);
  }
  assert.ok(listed.size > 40, 'the checksums name the skill files');
  const walk = (d) => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [relative(dir, join(d, n))]));
  const files = walk(dir).filter((f) => !['LICENSE', 'CHECKSUMS.txt'].includes(f)).sort();
  assert.deepEqual(files, [...listed.keys()].sort());
  for (const f of files) assert.equal(createHash('sha256').update(readFileSync(join(dir, f))).digest('hex'), listed.get(f), f);
  assert.match(readFileSync(join(dir, 'LICENSE'), 'utf8'), /^MIT License/);
});

// Floorplan's own tools (its Ask server, its describe step) expect the map in floorplan/ at the root, so it goes there.
test('ppc map --html: draws the Floorplan map in floorplan/ at the root, a folder git ignores, and nothing else changes', (t) => {
  const r = repo(t);
  const out = run(r.dir, 'map', '--html');
  assert.equal(out.status, 0, out.stdout + out.stderr);
  assert.ok(existsSync(join(r.dir, 'floorplan/index.html')));
  assert.match(out.stdout, /floorplan\/index\.html/);
  const graph = JSON.parse(readFileSync(join(r.dir, 'floorplan/graph.json'), 'utf8'));
  assert.deepEqual(graph.nodes.filter((n) => n.parent === null && n.id !== 'unassigned').map((n) => n.id), ['frontend', 'backend', 'database']);
  assert.ok(existsSync(join(r.dir, 'floorplan/serve.mjs')), 'the server its Ask bar names, where it names it');
  assert.ok(existsSync(join(r.dir, '.sddpp/map/map.md')), 'the markdown map is written too');
  assert.ok(!existsSync(join(r.dir, 'CLAUDE.local.md')));
  assert.deepEqual(r.git('status', '--porcelain').split('\n').filter(Boolean), ['?? .sddpp/map/'], 'only the markdown map: floorplan/ ignores itself');
});

test('ppc map --html: says how many files have a description', (t) => {
  const r = repo(t);
  r.commit('build: two files', { 'src/tasks.ts': 'export const tasks = [];\n', 'public/app.js': 'console.log(1);\n' });
  const out = run(r.dir, 'map', '--html');
  assert.equal(out.status, 0, out.stdout + out.stderr);
  assert.match(out.stdout, /Descriptions: 0 of 2 files\. To write them: ppc map --describe/);
});

test('ppc map --describe: draws the map, then names the worksheets and the files to fill, and the guide to follow', (t) => {
  const r = repo(t);
  r.commit('build: two files', { 'src/tasks.ts': 'export const tasks = [];\n', 'public/app.js': 'console.log(1);\n' });
  const out = run(r.dir, 'map', '--describe');
  assert.equal(out.status, 0, out.stdout + out.stderr);
  assert.match(out.stdout, /2 files and 0 routes have no description yet/);
  assert.match(out.stdout, /floorplan\/\.cache\/worksheets\/backend\.md -> floorplan\/descriptions\/backend\.json/);
  assert.ok(out.stdout.includes(join(FLOORPLAN.dir, 'references/writing-descriptions.md')), 'the guide, by its full path');
  const skeleton = JSON.parse(readFileSync(join(r.dir, 'floorplan/descriptions/backend.json'), 'utf8'));
  assert.ok('src/tasks.ts' in skeleton.files);

  // the agent fills it; the next drawing keeps it, and the count goes up
  skeleton.files['src/tasks.ts'] = { name: 'Task list', description: 'Holds the tasks in memory, empty for now.' };
  writeFileSync(join(r.dir, 'floorplan/descriptions/backend.json'), JSON.stringify(skeleton));
  const again = run(r.dir, 'map', '--html');
  assert.match(again.stdout, /Descriptions: 1 of 2 files/);
  const graph = JSON.parse(readFileSync(join(r.dir, 'floorplan/graph.json'), 'utf8'));
  const file = graph.files.find((f) => f.p === 'src/tasks.ts');
  assert.equal(file.name, 'Task list');
  assert.equal(file.d, 'Holds the tasks in memory, empty for now.');
});

test('ppc map --describe: says so when every file has its description', (t) => {
  const r = repo(t);
  const out = run(r.dir, 'map', '--describe');
  assert.equal(out.status, 0, out.stdout + out.stderr);
  assert.match(out.stdout, /Every file and route has a description/);
});

test('ppc map --html: the slice closed last lights up its files as recent work', (t) => {
  const r = repo(t);
  const sha = r.commit('build(SL-001): health check', { 'src/health.ts': 'export const health = () => "ok";\n' });
  const file = join(r.dir, '.sddpp/slices/SL-001-deployable-skeleton.md');
  const audit = `audit:\n  commits:\n    - sha: ${sha}\n      kind: build\n  production_lines: 1\n  test_lines: 0\n  tests_added: 0\n  mutation_score: null\n  decisions: []\n  debt_created: []\n  deviations: []\n`;
  r.write({ '.sddpp/slices/SL-001-deployable-skeleton.md': readFileSync(file, 'utf8').replace('status: ready', 'status: done').replace('approved_by: example-owner\n---', `approved_by: example-owner\n${audit}---`) });
  r.git('commit', '-q', '-am', 'audit(SL-001)');
  const out = run(r.dir, 'map', '--html');
  assert.equal(out.status, 0, out.stdout + out.stderr);
  const graph = JSON.parse(readFileSync(join(r.dir, 'floorplan/graph.json'), 'utf8'));
  assert.equal(graph.recent?.tasks?.[0]?.title, 'SL-001 Deployable end-to-end skeleton');
  // Floorplan keeps the items of every task in one list beside the tasks
  assert.ok(JSON.stringify(graph.recent.items).includes('src/health.ts'), JSON.stringify(graph.recent.items));
});

// Floorplan refuses a floorplan/ folder that belongs to the project, but only when no --out is given, and ppc gives one.
// So ppc checks first: a folder of the project's own would get a .gitignore that hides its new files from git.
test('ppc map --html: refuses a floorplan/ folder that belongs to the project, and writes nothing in it', (t) => {
  const r = repo(t);
  r.commit('the project has its own floorplan folder', { 'floorplan/rooms.md': '# Rooms\n' });
  const out = run(r.dir, 'map', '--html');
  assert.notEqual(out.status, 0);
  assert.match(out.stderr, /floorplan\/ belongs to the project/);
  assert.ok(!existsSync(join(r.dir, 'floorplan/.gitignore')), 'no .gitignore that would hide its files');
  assert.ok(!existsSync(join(r.dir, 'floorplan/architecture.json')));
  assert.deepEqual(r.git('status', '--porcelain').split('\n').filter(Boolean), ['?? .sddpp/map/'], 'the folder is as it was');
});

test('ppc map --html: refuses an untracked floorplan/ folder that is not a map, too', (t) => {
  const r = repo(t);
  r.write({ 'floorplan/sketch.txt': 'draft\n' });
  const out = run(r.dir, 'map', '--describe');
  assert.notEqual(out.status, 0);
  assert.match(out.stderr, /floorplan\/ belongs to the project/);
  assert.ok(!existsSync(join(r.dir, 'floorplan/.gitignore')));
});

test('ppc map --html: an empty floorplan/ folder, or one a map left, is used', (t) => {
  const r = repo(t);
  mkdirSync(join(r.dir, 'floorplan'));
  assert.equal(run(r.dir, 'map', '--html').status, 0);
  assert.equal(run(r.dir, 'map', '--html').status, 0, 'drawn again over its own map');
});
