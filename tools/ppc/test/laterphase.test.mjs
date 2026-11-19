import test from 'node:test';
import assert from 'node:assert/strict';
import { loadProject } from '../src/load.mjs';
import { validateModel } from '../src/validate.mjs';
import { start } from '../src/lifecycle.mjs';
import { repo } from './helpers.mjs';

// Issue #4 (F-S1): a project that builds only its first phase now still plans every capability. T06 is satisfied by a slice that stays
// `planned`, so the first slice can be approved and started while the later capabilities wait, unapproved.
test('T06 does not block the first slice while the later capabilities only have planned slices', (t) => {
  const r = repo(t);
  const model = loadProject(r.dir);
  const planned = model.slices.filter((s) => s.data.status === 'planned' && s.data.capability !== 'CAP-001');
  assert.ok(planned.length > 0, 'the example has later capabilities with planned slices');
  assert.deepEqual(validateModel(model).filter((f) => f.rule === 'T06'), []);
  start(r.dir, 'SL-001'); // the example's first slice is approved; everything after it is only planned
  assert.equal(loadProject(r.dir).slices.find((s) => s.data.id === 'SL-001').data.status, 'in_progress');
});
