import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadProject } from '../src/load.mjs';
import { validateModel } from '../src/validate.mjs';
import { checkGit, measure } from '../src/gitcheck.mjs';
import { sliceProductionFiles } from '../src/mutation.mjs';
import { start, finish } from '../src/lifecycle.mjs';
import { lines, repo } from './helpers.mjs';

const read = (dir, rel) => readFileSync(join(dir, rel), 'utf8');
const errorsOf = (dir) => validateModel(loadProject(dir)).filter((f) => f.severity === 'error');

/** The example project, light by default, declaring `models.lock.json` as generated when asked. */
function project(t, { declare = true } = {}) {
  const r = repo(t);
  const extra = `default_mode: light\nbudgets:${declare ? '\n  generated_paths: [models.lock.json, "data/cache/**"]' : ''}`;
  r.write({ '.architect/blueprint.yaml': read(r.dir, '.architect/blueprint.yaml').replace('budgets:', extra) });
  r.git('add', '-A');
  r.git('commit', '-q', '-m', 'declare generated files');
  return r;
}
const work = (r) => {
  start(r.dir, 'SL-001');
  return r.commit('build(SL-001): health and a lock file', { 'src/health.js': lines(5), 'tests/health.test.js': lines(3), 'models.lock.json': lines(120), 'data/cache/a/b.bin': lines(40), 'uv.lock': lines(300) });
};

test('the blueprint accepts generated_paths, and refuses anything but a list of non-empty strings', (t) => {
  const r = project(t);
  assert.deepEqual(errorsOf(r.dir), []);
  const bad = (value) => {
    r.write({ '.architect/blueprint.yaml': read(r.dir, '.architect/blueprint.yaml').replace(/generated_paths: .*/, `generated_paths: ${value}`) });
    return errorsOf(r.dir).some((f) => f.rule === 'SCHEMA');
  };
  assert.equal(bad('models.lock.json'), true, 'a string, not a list');
  assert.equal(bad('[""]'), true, 'an empty pattern');
  assert.equal(bad('[a, a]'), true, 'a repeated pattern');
});

test('measure: files the project declares as generated are not counted, and without the declaration they are', (t) => {
  const r = project(t);
  const sha = work(r);
  assert.equal(measure(r.dir, sha).production_lines, 5 + 120 + 40, 'uv.lock is a built-in name; the rest counts when nothing is declared');
  assert.equal(measure(r.dir, sha, ['models.lock.json', 'data/cache/**']).production_lines, 5);
  assert.deepEqual(measure(r.dir, sha, ['models.lock.json', 'data/cache/**']).files.map((f) => f.path).sort(), ['src/health.js', 'tests/health.test.js']);
});

test('finish: the sizes it records leave out what the blueprint declares generated, and check-git agrees', (t) => {
  const r = project(t);
  const sha = work(r);
  const result = finish(r.dir, 'SL-001', { commits: [{ sha, kind: 'build' }], tests_added: 1 });
  assert.equal(result.production_lines, 5);
  assert.deepEqual(errorsOf(r.dir), []);
  assert.deepEqual(checkGit(loadProject(r.dir), r.dir), []);
});

test('finish: without the declaration the generated file counts, as it did before', (t) => {
  const r = project(t, { declare: false });
  const sha = work(r);
  assert.equal(finish(r.dir, 'SL-001', { commits: [{ sha, kind: 'build' }], tests_added: 1 }).production_lines, 5 + 120 + 40);
});

test('mutation testing does not look at generated files either', (t) => {
  const r = project(t);
  const sha = work(r);
  assert.deepEqual(sliceProductionFiles(r.dir, [{ sha }], ['models.lock.json', 'data/cache/**']), ['src/health.js']);
});

test('finish: the mutation gate is run on the hand-written files only, not on a generated source file the blueprint declares', (t) => {
  const r = repo(t);
  r.write({ '.architect/blueprint.yaml': read(r.dir, '.architect/blueprint.yaml').replace('budgets:', 'default_mode: light\nbudgets:\n  generated_paths: ["src/gen/**"]\n  min_mutation_score: 0.5') });
  r.git('add', '-A');
  r.git('commit', '-q', '-m', 'gate and generated source');
  start(r.dir, 'SL-001');
  const sha = r.commit('build(SL-001): health and a generated client', { 'src/health.js': lines(5), 'tests/health.test.js': lines(3), 'src/gen/client.js': lines(80) });
  const seen = [];
  const killed = { status: 'Killed', mutatorName: 'StringLiteral', replacement: '""', location: { start: { line: 1, column: 1 }, end: { line: 1, column: 5 } } };
  const mutationRunner = (root, files) => (seen.push(files), { schemaVersion: '1.0', files: { 'src/health.js': { language: 'javascript', source: '', mutants: [killed] } } });
  finish(r.dir, 'SL-001', { commits: [{ sha, kind: 'build' }], tests_added: 1 }, { mutationRunner });
  assert.deepEqual(seen, [['src/health.js']]);
});
