import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadProject } from '../src/load.mjs';
import { validateModel } from '../src/validate.mjs';
import { start, finish } from '../src/lifecycle.mjs';
import { lines, repo } from './helpers.mjs';

// A slice remembers the day it closed. Without it, deciding the experience standard in a project that already has closed slices
// could not tell the ones closed before from the ones closed after (docs/standards.md, "Experience").

const slice = (dir, id) => loadProject(dir).slices.find((s) => s.data.id === id).data;
const lightRepo = (t) => {
  const r = repo(t);
  const file = '.architect/blueprint.yaml';
  r.write({ [file]: readFileSync(join(r.dir, file), 'utf8').replace('budgets:', 'default_mode: light\nbudgets:') });
  r.git('add', '-A');
  r.git('commit', '-q', '-m', 'light by default');
  return r;
};
const built = (r) => {
  start(r.dir, 'SL-001');
  const sha = r.commit('build(SL-001): health endpoint and its test', { 'src/health.js': lines(5), 'tests/health.test.js': lines(3) });
  return { commits: [{ sha, kind: 'build' }], tests_added: 1 };
};

test('finish: a closed work slice records the day it closed', (t) => {
  const r = lightRepo(t);
  finish(r.dir, 'SL-001', built(r), { now: new Date('2026-11-21T10:00:00Z') });
  assert.equal(slice(r.dir, 'SL-001').closed_on, '2026-11-21');
  assert.deepEqual(validateModel(loadProject(r.dir)).filter((f) => f.severity === 'error'), []);
});

test('SCHEMA: closed_on is a date', (t) => {
  const r = lightRepo(t);
  finish(r.dir, 'SL-001', built(r), { now: new Date('2026-11-21T10:00:00Z') });
  const m = loadProject(r.dir);
  m.slices.find((s) => s.data.id === 'SL-001').data.closed_on = 'yesterday';
  assert.ok(validateModel(m).some((f) => f.rule === 'SCHEMA' && f.severity === 'error'));
});

test('finish: a spike records the day it closed too', (t) => {
  const r = repo(t);
  r.write({
    '.sddpp/slices/SL-009-try-it.md': `---
id: SL-009
title: Try something
type: spike
status: ready
approved_by: reviewer
blueprint_revision: 1
components: [backend]
timebox_hours: 2
disposable: true
---

## Behavior

Find out whether it can be done in an afternoon.
`,
  });
  r.git('add', '-A');
  r.git('commit', '-q', '-m', 'a spike');
  start(r.dir, 'SL-009');
  finish(r.dir, 'SL-009', { outcome: 'It can be done in an afternoon.' }, { now: new Date('2026-11-22T10:00:00Z') });
  assert.equal(slice(r.dir, 'SL-009').closed_on, '2026-11-22');
});
