import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const AUDIT = fileURLToPath(new URL('../../../sdd-pp/extension/sddpp-cycle/commands/audit.md', import.meta.url));

// Found in the first real project (F-D6): the debt template wrote `cost_of_delay: { level: low, rationale: <why> }` and a rationale with a
// comma split the mapping into a new key, which the schema then refused; a title with ": " would have broken the file the same way.
test('the debt entry template survives free text with commas, colons, hashes, quotes and braces', () => {
  const block = readFileSync(AUDIT, 'utf8').match(/```yaml\n([\s\S]*?)```/)?.[1];
  assert.ok(block, 'audit.md has a yaml template for a debt entry');
  const text = "it wraps: one, two # three 'four' {five} [six]";
  // the template shows where the text goes; the agent puts it between the quotes it finds there
  const filled = block.replace('<today, YYYY-MM-DD>', '2026-01-01').replace('<slice id>', 'SL-001').replace(/<[^>\n]+>/g, text);
  const entry = parse(filled)[0];
  for (const [field, value] of [['title', entry.title], ['description', entry.description], ['trigger', entry.trigger], ['rationale', entry.cost_of_delay?.rationale]]) {
    assert.equal(value, text, `${field} keeps the text as written`);
  }
  assert.deepEqual(Object.keys(entry.cost_of_delay).sort(), ['level', 'rationale'], 'the mapping has no extra keys');
});

test('the template tells the agent to quote free text', () => {
  assert.match(readFileSync(AUDIT, 'utf8'), /double quotes/i);
});
