import test from 'node:test';
import assert from 'node:assert/strict';
import { isGeneratedPath, generatedGlobs } from '../src/testpaths.mjs';

const generated = ['package-lock.json', 'sub/dir/package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'Cargo.lock', 'poetry.lock', 'go.sum', 'composer.lock', 'Gemfile.lock', 'uv.lock', 'sub/uv.lock', 'Pipfile.lock', 'pdm.lock', 'bun.lock', 'bun.lockb', 'deno.lock', 'pubspec.lock', 'mix.lock', 'Podfile.lock'];
const handWritten = ['uv.toml', 'pyproject.toml', 'src/uv.lock.md', 'models.lock.json', 'package.json', 'src/lock.ts', 'src/locksmith.js', 'docs/lock.md', 'src/sum.go', 'src/app.ts'];

for (const path of generated) test(`isGeneratedPath(${JSON.stringify(path)}) is true`, () => assert.equal(isGeneratedPath(path), true));
for (const path of handWritten) test(`isGeneratedPath(${JSON.stringify(path)}) is false`, () => assert.equal(isGeneratedPath(path), false));

test('isGeneratedPath: a project can declare its own generated files with globs', () => {
  assert.equal(isGeneratedPath('models.lock.json'), false, 'not generated unless the project says so');
  assert.equal(isGeneratedPath('models.lock.json', ['models.lock.json']), true);
  assert.equal(isGeneratedPath('data/cache/a/b.bin', ['data/cache/**']), true);
  assert.equal(isGeneratedPath('data/cache/a.bin', ['data/*.bin']), false, '* stays inside one folder');
  assert.equal(isGeneratedPath('src/app.py', ['models.lock.json', 'data/cache/**']), false);
  assert.equal(isGeneratedPath('uv.lock', []), true, 'the built-in names still apply');
});

test('generatedGlobs: reads budgets.generated_paths from the blueprint, and nothing else', () => {
  assert.deepEqual(generatedGlobs({ budgets: { generated_paths: ['a/**'] } }), ['a/**']);
  assert.deepEqual(generatedGlobs({ budgets: { max_slice_production_lines: 200 } }), []);
  assert.deepEqual(generatedGlobs(undefined), []);
});
