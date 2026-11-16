import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadProject } from '../src/load.mjs';
import { approve, start, finish, LifecycleError } from '../src/lifecycle.mjs';
import { lines, repo } from './helpers.mjs';

// Found in the first real project (SL-032): a test outside the slice failed, and it was only a line in the audit's deviations;
// nothing put it to the person. The audit says how the whole suite ran; a failure becomes proposed test debt, which the person
// decides like any other (and can tie to the slice that fixes it).

const fails = (fn, pattern) => assert.throws(fn, (e) => e instanceof LifecycleError && pattern.test(e.message));
const read = (dir, rel) => readFileSync(join(dir, rel), 'utf8');
const TEST_DEBT = `  - id: DEBT-FE-002
    component: frontend
    title: "The window test fails at a narrow width"
    description: "tests/window.test.js fails outside this slice: the window opens under the fold width."
    kind: test
    origin: { type: slice, ref: SL-001 }
    created: 2026-11-16
    proposed_by: ai
    cost_of_delay: { level: medium, rationale: "a red suite hides the next failure" }
    trigger: "the next slice on the window"
    status: proposed
`;

function building(t) {
  const r = repo(t);
  r.write({ '.architect/blueprint.yaml': read(r.dir, '.architect/blueprint.yaml').replace('budgets:', 'default_mode: light\nbudgets:') });
  r.git('commit', '-q', '-am', 'light');
  start(r.dir, 'SL-001');
  const sha = r.commit('build(SL-001): health endpoint', { 'src/health.js': lines(5), 'tests/health.test.js': lines(3) });
  return { ...r, audit: { commits: [{ sha, kind: 'build' }], tests_added: 1 } };
}

test('finish: a suite that failed needs a proposed test debt entry, so the failure reaches the person', (t) => {
  const r = building(t);
  fails(() => finish(r.dir, 'SL-001', { ...r.audit, suite: { command: 'npm test', failed: 1 } }), /1 test.* failed.*kind test/s);
  fails(() => finish(r.dir, 'SL-001', { ...r.audit, suite: { command: 'npm test' } }), /"failed"/);
  r.write({ '.sddpp/debt.yaml': `${read(r.dir, '.sddpp/debt.yaml').trimEnd()}\n${TEST_DEBT}` });
  r.git('commit', '-q', '-am', 'propose the test debt');
  finish(r.dir, 'SL-001', { ...r.audit, suite: { command: 'npm test', failed: 1 }, debt_created: ['DEBT-FE-002'] });
  const s = loadProject(r.dir).slices.find((x) => x.data.id === 'SL-001').data;
  assert.deepEqual(s.audit.suite, { command: 'npm test', failed: 1 });
});

test('finish: a green suite is recorded and asks for nothing', (t) => {
  const r = building(t);
  finish(r.dir, 'SL-001', { ...r.audit, suite: { command: 'npm test', failed: 0 } });
  assert.equal(loadProject(r.dir).slices.find((x) => x.data.id === 'SL-001').data.audit.suite.failed, 0);
});
