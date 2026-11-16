import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { loadProject } from '../src/load.mjs';
import { validateModel } from '../src/validate.mjs';
import { touches } from '../src/gitcheck.mjs';
import { widen, LifecycleError } from '../src/lifecycle.mjs';
import { askFor } from '../src/decisions.mjs';
import { CLI, EXAMPLE, repo } from './helpers.mjs';

// Found in the first real project (F-D8, three times): a slice did not list a component its work needed. C09 found it at the close,
// after the code was written, and the only way to add the component was a change request that raised the design's revision, although
// the design did not change. `ppc touches` checks the files before any code is written; `ppc widen` adds the component, decided by a
// person in the panel, without a design change.

const sl = (m, id) => m.slices.find((s) => s.data.id === id).data;
const slice = (dir, id) => sl(loadProject(dir), id);
const run = (dir, ...args) => spawnSync('node', [CLI, ...args, dir], { encoding: 'utf8' });

test('touches: names the components the files belong to that the slice does not list', () => {
  const m = loadProject(EXAMPLE); // SL-004 lists frontend and backend; migrations/ belong to the database alone
  const r = touches(m, sl(m, 'SL-004'), ['public/app.js', 'migrations/001.sql', 'tests/db.test.ts', 'README.md']);
  assert.deepEqual(r.missing, ['database']);
  assert.deepEqual(r.foreign, { 'migrations/001.sql': ['database'] });
  assert.deepEqual(touches(m, sl(m, 'SL-004'), ['public/app.js', 'src/tasks.ts']).missing, [], 'files of its own components are fine');
});

test('touches: a design whose components declare no paths cannot say, and says so', () => {
  const m = loadProject(EXAMPLE);
  for (const c of m.blueprint.data.components) delete c.paths;
  assert.equal(touches(m, sl(m, 'SL-004'), ['migrations/001.sql']).noPaths, true);
});

test('CLI touches: exit 1 with the question to put to the person, exit 0 when the slice already lists them', (t) => {
  const { dir } = repo(t);
  const missing = run(dir, 'touches', 'SL-004', 'migrations/001.sql');
  assert.equal(missing.status, 1);
  assert.match(missing.stdout, /database/);
  assert.match(missing.stdout, /ppc ask SL-004 --add-component database/);
  assert.equal(run(dir, 'touches', 'SL-004', 'public/app.js').status, 0);
});

test('widen: a person adds a component to a slice that is not done, with no change to the design', (t) => {
  const r = repo(t);
  const revision = loadProject(r.dir).blueprint.data.revision;
  assert.deepEqual(widen(r.dir, 'SL-004', 'database'), { slice: 'SL-004', components: ['frontend', 'backend', 'database'] });
  assert.deepEqual(slice(r.dir, 'SL-004').components, ['frontend', 'backend', 'database']);
  assert.equal(loadProject(r.dir).blueprint.data.revision, revision, 'the design revision does not move');
  assert.deepEqual(validateModel(loadProject(r.dir)).filter((f) => f.severity === 'error'), []);
  const refused = (id, component, pattern) => assert.throws(() => widen(r.dir, id, component), (e) => e instanceof LifecycleError && pattern.test(e.message), `${id} ${component}`);
  refused('SL-004', 'database', /already lists database/);
  refused('SL-004', 'cache', /unknown component cache; a component the design does not have is a change request/);
});

test('ask --add-component: the panel offers the exact widen command', (t) => {
  const m = loadProject(repo(t).dir);
  const q = askFor(m, 'SL-004', { addComponent: 'database' }).questions[0];
  assert.match(q.question, /SL-004 .*database/);
  assert.deepEqual(q.options.filter((o) => o.label.includes(' — ppc ')).map((o) => o.label.split(' — ').at(-1)), ['ppc widen SL-004 --component database']);
});
