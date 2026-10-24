import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isTestPath } from '../src/testpaths.mjs';

const { cases } = JSON.parse(readFileSync(fileURLToPath(new URL('../../../contract/v0.1/test-path-cases.json', import.meta.url)), 'utf8'));

for (const { path, test: expected } of cases) {
  test(`isTestPath(${JSON.stringify(path)}) is ${expected}`, () => {
    assert.equal(isTestPath(path), expected);
  });
}
