import test from 'node:test';
import assert from 'node:assert/strict';
import { isGeneratedPath } from '../src/testpaths.mjs';

const generated = ['package-lock.json', 'sub/dir/package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'Cargo.lock', 'poetry.lock', 'go.sum', 'composer.lock', 'Gemfile.lock'];
const handWritten = ['package.json', 'src/lock.ts', 'src/locksmith.js', 'docs/lock.md', 'src/sum.go', 'src/app.ts'];

for (const path of generated) test(`isGeneratedPath(${JSON.stringify(path)}) is true`, () => assert.equal(isGeneratedPath(path), true));
for (const path of handWritten) test(`isGeneratedPath(${JSON.stringify(path)}) is false`, () => assert.equal(isGeneratedPath(path), false));
