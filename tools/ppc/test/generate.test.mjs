import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadProject } from '../src/load.mjs';
import { generate, checkGenerated } from '../src/generate.mjs';
import { validateModel } from '../src/validate.mjs';

const EXAMPLE = fileURLToPath(new URL('../../../examples/todo-app/', import.meta.url));
const CLI = fileURLToPath(new URL('../bin/ppc.mjs', import.meta.url));

/** A throwaway copy of the example, so tests can break it safely. */
function sandbox(t) {
  const dir = mkdtempSync(join(tmpdir(), 'ppc-test-'));
  cpSync(EXAMPLE, dir, { recursive: true });
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}
const ppc = (...args) => spawnSync('node', [CLI, ...args], { encoding: 'utf8' });

test('generate produces the WBS and one debt table per component', () => {
  const views = generate(loadProject(EXAMPLE));
  assert.deepEqual([...views.keys()].sort(), ['.sddpp/debt/backend.md', '.sddpp/debt/database.md', '.sddpp/debt/frontend.md', '.sddpp/wbs.md']);
});

test('debt tables only contain the entries of their own component', () => {
  const views = generate(loadProject(EXAMPLE));
  assert.match(views.get('.sddpp/debt/frontend.md'), /DEBT-FE-001/);
  assert.doesNotMatch(views.get('.sddpp/debt/frontend.md'), /DEBT-BE-001|DEBT-DB-001/);
  assert.match(views.get('.sddpp/debt/backend.md'), /DEBT-BE-001/);
  assert.match(views.get('.sddpp/debt/database.md'), /DEBT-DB-001/);
});

test('the WBS lists every slice exactly once', () => {
  const model = loadProject(EXAMPLE);
  const wbs = generate(model).get('.sddpp/wbs.md');
  for (const { data } of model.slices) {
    // Count table rows that start with the id; the id also appears in other rows' "Depends on" cell.
    const rows = wbs.match(new RegExp(`^\\| ${data.id} \\|`, 'gm')) ?? [];
    assert.equal(rows.length, 1, `${data.id} has ${rows.length} rows`);
  }
});

test('generation is deterministic', () => {
  const model = loadProject(EXAMPLE);
  assert.deepEqual([...generate(model)], [...generate(model)]);
});

test('the committed generated views are up to date', () => {
  assert.deepEqual(checkGenerated(EXAMPLE, generate(loadProject(EXAMPLE))), []);
});

test('G01: a stale or missing generated view is an error', (t) => {
  const dir = sandbox(t);
  const views = generate(loadProject(dir));
  assert.deepEqual(checkGenerated(dir, views), []);

  writeFileSync(join(dir, '.sddpp/wbs.md'), 'edited by hand\n');
  rmSync(join(dir, '.sddpp/debt/backend.md'));
  const found = checkGenerated(dir, views);
  assert.deepEqual(found.map((f) => f.file).sort(), ['.sddpp/debt/backend.md', '.sddpp/wbs.md']);
  assert.ok(found.every((f) => f.rule === 'G01' && f.severity === 'error'));
});

test('cells containing a pipe do not break the table', (t) => {
  const dir = sandbox(t);
  const model = loadProject(dir);
  model.debt.find((d) => d.data.component === 'frontend').data.entries[0].title = 'Rules | duplicated';
  assert.match(generate(model).get('.sddpp/debt/frontend.md'), /Rules \\\| duplicated/);
});

test('PARSE: unreadable files are reported instead of crashing', (t) => {
  const dir = sandbox(t);
  writeFileSync(join(dir, '.sddpp/slices/SL-002-create-and-list-tasks.md'), '---\nid: [unclosed\n---\n');
  writeFileSync(join(dir, '.sddpp/slices/SL-003-complete-a-task.md'), 'no frontmatter at all\n');
  writeFileSync(join(dir, '.sddpp/active.json'), '{broken');
  const found = validateModel(loadProject(dir));
  const parse = found.filter((f) => f.rule === 'PARSE');
  assert.deepEqual(parse.map((f) => f.file).sort(), ['.sddpp/active.json', '.sddpp/slices/SL-002-create-and-list-tasks.md', '.sddpp/slices/SL-003-complete-a-task.md']);
});

// ── CLI ──────────────────────────────────────────────────────────
test('CLI: validate --strict succeeds on the example', () => {
  const r = ppc('validate', EXAMPLE, '--strict');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /0 error\(s\), 0 warning\(s\)/);
});

test('CLI: validate fails with exit 1 on a broken project', (t) => {
  const dir = sandbox(t);
  const file = join(dir, '.sddpp/slices/SL-002-create-and-list-tasks.md');
  writeFileSync(file, readFileSync(file, 'utf8').replace('capability: CAP-001', 'capability: CAP-099'));
  const r = ppc('validate', dir);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /T01/);
});

test('CLI: generate refuses an invalid project and --check detects drift', (t) => {
  const dir = sandbox(t);
  assert.equal(ppc('generate', dir, '--check').status, 0);

  writeFileSync(join(dir, '.sddpp/wbs.md'), 'stale\n');
  assert.equal(ppc('generate', dir, '--check').status, 1);
  assert.equal(ppc('generate', dir).status, 0);
  assert.equal(ppc('generate', dir, '--check').status, 0);

  rmSync(join(dir, '.architect/glossary.md'));
  assert.equal(ppc('generate', dir).status, 1);
});

test('CLI: unknown commands exit 2 and rules lists the catalog', () => {
  assert.equal(ppc('nope').status, 2);
  const r = ppc('rules');
  assert.equal(r.status, 0);
  assert.match(r.stdout, /T06/);
});
