import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { loadProject, REQUIRED_FILES } from '../src/load.mjs';
import { validateModel } from '../src/validate.mjs';
import { repo } from './helpers.mjs';

test('only the blueprint and the architecture are required; brief, glossary and evidence are optional', (t) => {
  assert.deepEqual(REQUIRED_FILES, ['.architect/blueprint.yaml', '.architect/architecture.md']);
  const { dir } = repo(t);
  for (const optional of ['.architect/brief.md', '.architect/glossary.md']) rmSync(join(dir, optional));
  rmSync(join(dir, '.architect/evidence'), { recursive: true });
  const found = validateModel(loadProject(dir));
  assert.ok(!found.some((f) => f.rule === 'R00'), JSON.stringify(found.filter((f) => f.rule === 'R00')));
  // an ADR that cites evidence still needs it to exist (T08), so nothing is silently skipped
  assert.ok(found.every((f) => f.rule !== 'PARSE'));
});
