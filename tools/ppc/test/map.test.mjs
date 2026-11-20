import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadProject } from '../src/load.mjs';
import { validateModel } from '../src/validate.mjs';
import { mapModel, renderMermaid } from '../src/map.mjs';
import { CLI, EXAMPLE, repo } from './helpers.mjs';

const example = () => {
  const model = loadProject(EXAMPLE);
  return { model, map: mapModel(model, validateModel(model)) };
};
const run = (dir, ...args) => spawnSync('node', [CLI, ...args], { cwd: dir, encoding: 'utf8' });

test('mapModel: the components, their dependencies and what is built, read from the design and the slices', () => {
  const { map } = example();
  assert.deepEqual(map.components.map((c) => c.id), ['frontend', 'backend', 'database']);
  assert.deepEqual(map.edges, [{ from: 'frontend', to: 'backend' }, { from: 'backend', to: 'database' }]);
  const fe = map.components.find((c) => c.id === 'frontend');
  assert.equal(fe.kind, 'frontend');
  assert.equal(fe.state, 'planned', 'no slice of the example is done');
  assert.ok(fe.slices.total > 0 && fe.slices.done === 0);
});

test('mapModel: capabilities say how many of their slices are done, and through which components they reach the code', () => {
  const { map } = example();
  const cap = map.capabilities.find((c) => c.id === 'CAP-001');
  assert.equal(cap.name, 'Create and list tasks');
  assert.equal(cap.slices.total, 2);
  assert.equal(cap.slices.done, 0);
  assert.ok(cap.components.includes('backend') && cap.components.includes('frontend'));
});

test('mapModel: a component is planned, then building, then built, and active while a slice is in progress', () => {
  const { model } = example();
  const touching = (id) => model.slices.filter((s) => (s.data.components ?? []).includes(id) && s.data.status !== 'dropped');
  const stateOf = (id) => mapModel(model, []).components.find((c) => c.id === id);

  const own = touching('database');
  assert.ok(own.length >= 2, 'the example has slices on the database');
  own[0].data.status = 'done';
  assert.equal(stateOf('database').state, 'building');
  own.forEach((s) => (s.data.status = 'done'));
  assert.equal(stateOf('database').state, 'built');
  own[0].data.status = 'in_progress';
  assert.equal(stateOf('database').active, true);
  assert.equal(stateOf('database').state, 'building');
});

test('mapModel: a component no slice touches is unplanned', () => {
  const { model } = example();
  model.slices.forEach((s) => (s.data.components = (s.data.components ?? []).filter((c) => c !== 'database')));
  assert.equal(mapModel(model, []).components.find((c) => c.id === 'database').state, 'unplanned');
});

test('mapModel: debt that nobody has settled is counted on its component', () => {
  const { map } = example();
  const be = map.components.find((c) => c.id === 'backend');
  assert.equal(be.debt.unsettled, 1, 'DEBT-BE-001 is proposed');
  assert.equal(map.components.find((c) => c.id === 'frontend').debt.unsettled, 1, 'the scheduled one still counts');
});

test('mapModel: screens carry their capabilities and whether a person approved the mockup', () => {
  const { map } = example();
  assert.equal(map.screens.length, 1);
  assert.deepEqual(map.screens[0], { id: 'SCR-01', name: 'Tasks', capabilities: ['CAP-001', 'CAP-002', 'CAP-003', 'CAP-004'], mockup: '.architect/ui/mockups/SCR-01.html', approved: true, stale: false });
});

test('mapModel: a mockup that changed after it was approved is stale, not approved', () => {
  const { model } = example();
  model.uiFiles['.architect/ui/mockups/SCR-01.html'] = 'f'.repeat(64);
  const [screen] = mapModel(model, []).screens;
  assert.equal(screen.approved, false);
  assert.equal(screen.stale, true);
});

test('renderMermaid: a markdown page with the components, the capabilities and the screens, each in a mermaid block', () => {
  const { map } = example();
  const md = renderMermaid(map);
  assert.match(md, /^# Todo App: map/);
  assert.equal((md.match(/```mermaid/g) ?? []).length, 2, 'components, and capabilities to components');
  assert.match(md, /flowchart TD/);
  for (const name of ['Frontend', 'Backend', 'Database']) assert.match(md, new RegExp(name));
  assert.match(md, /C1 --> C2/, 'the frontend depends on the backend');
  assert.match(md, /CAP-001/);
  assert.match(md, /SCR-01/);
  assert.match(md, /planned/, 'the state is in words, not only in a style');
});

test('renderMermaid: the output is the same every time (nothing in it depends on the clock)', () => {
  const { map } = example();
  assert.equal(renderMermaid(map), renderMermaid(map));
});

test('renderMermaid: text from the design cannot break out of a label or inject markup', () => {
  const { model } = example();
  model.blueprint.data.components[0].name = 'Front"end <script>alert(1)</script> | #x\nnext';
  model.blueprint.data.capabilities[0].name = 'Cap "quoted" <b>bold</b> | pipe\nsecond line';
  const md = renderMermaid(mapModel(model, []));
  assert.ok(!md.includes('<script>') && !md.includes('<b>'), 'angle brackets are escaped');
  const blocks = md.split('```mermaid').slice(1).map((b) => b.split('```')[0]);
  for (const block of blocks) for (const line of block.split('\n')) assert.ok((line.match(/"/g) ?? []).length % 2 === 0, `balanced quotes: ${line}`);
  const table = md.split('\n').filter((l) => l.startsWith('| CAP-001'));
  assert.equal(table.length, 1, 'a pipe in a name does not split a table row, a newline does not break it');
  assert.equal(table[0].replace(/\\\|/g, '').split('|').length, 7, 'the row has five cells between its two outer bars');
});

test('ppc map: writes .sddpp/map/map.md and says where, and writing it twice changes nothing', (t) => {
  const r = repo(t);
  const first = run(r.dir, 'map');
  assert.equal(first.status, 0, first.stderr);
  const file = join(r.dir, '.sddpp/map/map.md');
  assert.ok(existsSync(file));
  assert.match(first.stdout, /\.sddpp\/map\/map\.md/);
  const before = readFileSync(file, 'utf8');
  assert.equal(run(r.dir, 'map').status, 0);
  assert.equal(readFileSync(file, 'utf8'), before);
  assert.match(before, /```mermaid/);
});

test('ppc map --stdout: prints the page and writes nothing', (t) => {
  const r = repo(t);
  const out = run(r.dir, 'map', '--stdout');
  assert.equal(out.status, 0, out.stderr);
  assert.match(out.stdout, /^# Todo App: map/);
  assert.ok(!existsSync(join(r.dir, '.sddpp/map')));
  assert.equal(r.git('status', '--porcelain'), '');
});

test('ppc map: with no design it says so and writes nothing', (t) => {
  const r = repo(t);
  r.git('rm', '-q', '-r', '.architect');
  const out = run(r.dir, 'map');
  assert.notEqual(out.status, 0);
  assert.ok(!existsSync(join(r.dir, '.sddpp/map')));
});
