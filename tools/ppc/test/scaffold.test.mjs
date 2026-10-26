import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { loadProject } from '../src/load.mjs';
import { validateModel } from '../src/validate.mjs';
import { scaffold } from '../src/scaffold.mjs';
import { LifecycleError } from '../src/lifecycle.mjs';
import { CLI, repo } from './helpers.mjs';

const r01 = (dir) => validateModel(loadProject(dir)).filter((f) => f.rule === 'R01').length;

test('scaffold: writes an empty debt register for each component that has none, so R01 stops firing', (t) => {
  const { dir } = repo(t);
  rmSync(join(dir, '.sddpp/debt/backend.yaml'));
  rmSync(join(dir, '.sddpp/debt/frontend.yaml'));
  assert.equal(r01(dir), 2);
  assert.deepEqual(scaffold(dir).created.sort(), ['.sddpp/debt/backend.yaml', '.sddpp/debt/frontend.yaml']);
  assert.equal(readFileSync(join(dir, '.sddpp/debt/backend.yaml'), 'utf8'), 'component: backend\nentries: []\n');
  assert.equal(r01(dir), 0);
  assert.deepEqual(validateModel(loadProject(dir)).filter((f) => f.file.includes('debt/') && f.severity === 'error'), []);
});

test('scaffold: never touches a register that exists, and a second run does nothing', (t) => {
  const { dir } = repo(t);
  const before = readFileSync(join(dir, '.sddpp/debt/backend.yaml'), 'utf8');
  assert.deepEqual(scaffold(dir).created, []);
  assert.equal(readFileSync(join(dir, '.sddpp/debt/backend.yaml'), 'utf8'), before);
});

test('scaffold: works in a project that has only its design, where .sddpp does not exist yet', (t) => {
  const { dir } = repo(t);
  rmSync(join(dir, '.sddpp'), { recursive: true });
  assert.equal(scaffold(dir).created.length, 3);
  assert.ok(existsSync(join(dir, '.sddpp/debt/database.yaml')));
});

test('scaffold: refuses a design that does not validate, and writes nothing', (t) => {
  const r = repo(t);
  r.write({ '.architect/blueprint.yaml': 'nonsense: true\n' });
  rmSync(join(r.dir, '.sddpp/debt/backend.yaml'));
  assert.throws(() => scaffold(r.dir), (e) => e instanceof LifecycleError);
  assert.ok(!existsSync(join(r.dir, '.sddpp/debt/backend.yaml')));
});

test('CLI: scaffold reports what it created', (t) => {
  const { dir } = repo(t);
  rmSync(join(dir, '.sddpp/debt/database.yaml'));
  const out = spawnSync(process.execPath, [CLI, 'scaffold', dir], { encoding: 'utf8' });
  assert.equal(out.status, 0, out.stderr);
  assert.match(out.stdout, /database\.yaml/);
});
