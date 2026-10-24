import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { RULES } from '../src/validate.mjs';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

test('docs/contract-v0.1.md documents every rule the validator can emit', () => {
  const doc = read('../../../docs/contract-v0.1.md');
  for (const id of Object.keys(RULES)) assert.ok(doc.includes(`| \`${id}\` |`), `rule ${id} is missing from the contract doc`);
});

test('the contract doc does not document rules that do not exist', () => {
  const doc = read('../../../docs/contract-v0.1.md');
  const documented = [...doc.matchAll(/^\| `([A-Z]+\d*)` \|/gm)].map((m) => m[1]);
  for (const id of documented) assert.ok(id in RULES, `${id} is documented but not implemented`);
});
