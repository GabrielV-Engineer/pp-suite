import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadProject } from '../src/load.mjs';
import { validateModel, RULES } from '../src/validate.mjs';
import { checkGit } from '../src/gitcheck.mjs';
import { matchesGlob } from '../src/globs.mjs';
import { CLI, lines, repo } from './helpers.mjs';

// SL-004 of the example is a light-cycle feature over the frontend and the backend. These tests give it an audit that points at real
// commits, and check what C08 and C09 say about those commits.
const PATHS = { frontend: ['public/**'], backend: ['src/**'], database: ['migrations/**', 'src/db.ts'] };

function built(t, files, { withPaths = true, slice = 'SL-004' } = {}) {
  const r = repo(t);
  const sha = r.commit('build(SL-004): the work', files);
  const model = loadProject(r.dir);
  for (const c of model.blueprint.data.components) {
    if (withPaths) c.paths = PATHS[c.id];
    else delete c.paths;
  }
  const s = model.slices.find((x) => x.data.id === slice).data;
  Object.assign(s, { status: 'done', mode: 'light', approved_by: 'reviewer', audit: { commits: [{ sha, kind: 'build' }], production_lines: 0, test_lines: 0, tests_added: 0, mutation_score: null, decisions: [], debt_created: [], deviations: [] } });
  // the audit sizes must match git for C04 not to speak; measure them from the commit itself
  return { ...r, model, sha, s };
}
const sizes = (b) => {
  const out = spawnSync('git', ['show', '--numstat', '--format=', b.sha], { cwd: b.dir, encoding: 'utf8' }).stdout.trim().split('\n').filter(Boolean);
  let prod = 0;
  let test = 0;
  for (const line of out) {
    const [a, d, path] = line.split('\t');
    const n = Number(a) + Number(d);
    if (/^(\.sddpp|\.architect)\//.test(path)) continue;
    if (/(^|\/)tests?\//.test(path)) test += n;
    else prod += n;
  }
  b.s.audit.production_lines = prod;
  b.s.audit.test_lines = test;
  return b;
};
const run = (b) => checkGit(sizes(b).model, b.dir);
const rules = (found) => found.map((f) => f.rule);

test('C08 and C09 are part of the published catalog', () => {
  assert.ok('C08' in RULES && 'C09' in RULES);
});

// ── the globs ────────────────────────────────────────────────────
test('matchesGlob: ** crosses folders, * stays inside one, the rest is literal', () => {
  assert.ok(matchesGlob('public/**', 'public/app.js'));
  assert.ok(matchesGlob('public/**', 'public/css/site.css'));
  assert.ok(!matchesGlob('public/**', 'publicity/app.js'));
  assert.ok(!matchesGlob('public/**', 'src/public/app.js'));
  assert.ok(matchesGlob('src/*.ts', 'src/app.ts'));
  assert.ok(!matchesGlob('src/*.ts', 'src/sub/app.ts'));
  assert.ok(matchesGlob('src/db.ts', 'src/db.ts'));
  assert.ok(!matchesGlob('src/db.ts', 'src/dbxts'), 'the dot is a dot, not any character');
});

// ── the blueprint ────────────────────────────────────────────────
test('SCHEMA: a component may list the paths it owns, and nothing else', (t) => {
  const { model } = built(t, { 'src/x.ts': lines(2) });
  assert.deepEqual(validateModel(model).filter((f) => f.rule === 'SCHEMA'), []);
  model.blueprint.data.components[0].paths = 'src/**';
  assert.ok(validateModel(model).some((f) => f.rule === 'SCHEMA'));
  model.blueprint.data.components[0].paths = [''];
  assert.ok(validateModel(model).some((f) => f.rule === 'SCHEMA'));
});

// ── C08: a build does not edit the design ────────────────────────
test('C08: a commit of the slice that changes the design is reported, with what to do instead', (t) => {
  const found = run(built(t, { 'src/tasks.ts': lines(3), '.architect/architecture.md': 'rewritten\n' }));
  const c08 = found.filter((f) => f.rule === 'C08');
  assert.equal(c08.length, 1);
  assert.match(c08[0].message, /\.architect\/architecture\.md/);
  assert.match(c08[0].message, /change request/);
});

test('C08: code, tests and the slice\'s own bookkeeping are fine', (t) => {
  const found = run(built(t, { 'src/tasks.ts': lines(3), 'tests/x.test.ts': lines(2), '.sddpp/notes.md': 'note\n' }));
  assert.ok(!rules(found).includes('C08'), JSON.stringify(found));
});

test('C08: a commit the audit does not list (a design change applied from a change request, for example) is not the slice\'s', (t) => {
  const b = built(t, { 'src/tasks.ts': lines(3) });
  b.commit('design: apply CR-0002', { '.architect/architecture.md': 'revised\n' });
  assert.ok(!rules(run(b)).includes('C08'));
});

// ── C09: a slice touches the files of its own components ─────────
test('C09: a slice over the frontend and backend that changes a migration (the database) is reported', (t) => {
  const found = run(built(t, { 'src/tasks.ts': lines(3), 'migrations/002-drop-limit.sql': lines(4) }));
  const c09 = found.filter((f) => f.rule === 'C09');
  assert.equal(c09.length, 1);
  assert.match(c09[0].message, /migrations\/002-drop-limit\.sql/);
  assert.match(c09[0].message, /database/);
});

test('C09: the files of the components the slice lists are fine', (t) => {
  const found = run(built(t, { 'src/tasks.ts': lines(3), 'public/app.js': lines(2) }));
  assert.ok(!rules(found).includes('C09'), JSON.stringify(found));
});

test('C09: a file that belongs to two components is fine when the slice lists either', (t) => {
  const found = run(built(t, { 'src/db.ts': lines(3) })); // backend (src/**) and database (src/db.ts); SL-004 lists the backend
  assert.ok(!rules(found).includes('C09'), JSON.stringify(found));
});

test('C09: tests, documentation and files that belong to no component are never reported', (t) => {
  const found = run(built(t, { 'src/tasks.ts': lines(3), 'tests/x.test.ts': lines(2), 'README.md': 'docs\n', 'tsconfig.json': '{}\n' }));
  assert.ok(!rules(found).includes('C09'), JSON.stringify(found));
});

test('C09: tests are free even when a component\'s paths would claim them', (t) => {
  const b = built(t, { 'src/tasks.ts': lines(3), 'tests/db-things.test.ts': lines(3) });
  b.model.blueprint.data.components.find((c) => c.id === 'database').paths = ['tests/**'];
  assert.ok(!rules(run(b)).includes('C09'), JSON.stringify(run(b)));
});

test('C09: listing the database among the slice\'s components makes the migration fine', (t) => {
  const b = built(t, { 'migrations/002.sql': lines(4) });
  b.s.components = ['backend', 'database'];
  assert.ok(!rules(run(b)).includes('C09'));
});

test('C09 does nothing when the blueprint declares no paths: it is opt-in', (t) => {
  const found = run(built(t, { 'src/tasks.ts': lines(3), 'migrations/002.sql': lines(4) }, { withPaths: false }));
  assert.ok(!rules(found).includes('C09'));
});

test('C09 reports once per commit, naming every foreign file', (t) => {
  const found = run(built(t, { 'migrations/002.sql': lines(2), 'migrations/003.sql': lines(2) }));
  const c09 = found.filter((f) => f.rule === 'C09');
  assert.equal(c09.length, 1);
  assert.match(c09[0].message, /002\.sql/);
  assert.match(c09[0].message, /003\.sql/);
});

// ── through the command ──────────────────────────────────────────
test('CLI: check-git prints C08 and C09 and exits 1', (t) => {
  const r = repo(t);
  const sha = r.commit('build(SL-004): the work', { 'src/tasks.ts': lines(3), 'migrations/002.sql': lines(4), '.architect/architecture.md': 'x\n' });
  const slice = join(r.dir, '.sddpp/slices/SL-004-reject-invalid-titles.md');
  let s = spawnSync('cat', [slice], { encoding: 'utf8' }).stdout;
  s = s.replace('status: planned', 'status: done\napproved_by: reviewer\nmode: light').replace('---\n\n', `audit:\n  commits: [{ sha: ${sha}, kind: build }]\n  production_lines: 7\n  test_lines: 0\n  tests_added: 0\n  mutation_score: null\n  decisions: []\n  debt_created: []\n  deviations: []\n---\n\n`);
  writeFileSync(slice, s);
  const out = spawnSync(process.execPath, [CLI, 'check-git', r.dir], { encoding: 'utf8' });
  assert.match(out.stdout, /C08/);
  assert.match(out.stdout, /C09/);
  assert.equal(out.status, 1);
});
