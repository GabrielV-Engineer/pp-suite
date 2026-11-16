import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadProject } from '../src/load.mjs';
import { approve, start, finish, LifecycleError } from '../src/lifecycle.mjs';
import { lines, repo } from './helpers.mjs';

// Found in the first real project (F-D12): for 23 slices every interface test used a double of the Python bridge that was ready
// from the start, and nobody opened the real app; it failed at start-up until the owner ran it. A slice that builds to screens now
// closes only after its audit opened the real app: the command, the screenshots it wrote and the console errors it saw.

const fails = (fn, pattern) => assert.throws(fn, (e) => e instanceof LifecycleError && pattern.test(e.message));
const read = (dir, rel) => readFileSync(join(dir, rel), 'utf8');
const slice = (dir, id) => loadProject(dir).slices.find((s) => s.data.id === id).data;
const SL002 = '.sddpp/slices/SL-002-create-and-list-tasks.md';
const SHOT = '.sddpp/ui-checks/SL-002/SCR-01.png';

/** SL-002 (screens: [SCR-01]), light, waiting for nothing, started and built. */
function building(t) {
  const r = repo(t, { screens: true });
  r.write({
    '.architect/blueprint.yaml': read(r.dir, '.architect/blueprint.yaml').replace('budgets:', 'default_mode: light\nbudgets:'),
    [SL002]: read(r.dir, SL002).replace(/^depends_on: .*\n/m, ''),
  });
  r.git('add', '-A');
  r.git('commit', '-q', '-m', 'light, and SL-002 waits for nothing');
  approve(r.dir, 'SL-002', { by: 'owner' });
  start(r.dir, 'SL-002');
  const sha = r.commit('build(SL-002): create and list tasks', { 'public/app.js': lines(6), 'tests/tasks.test.js': lines(4) });
  return { ...r, audit: { commits: [{ sha, kind: 'build' }], tests_added: 1 } };
}

test('finish: a slice with screens does not close until its audit opened the real app', (t) => {
  const r = building(t);
  fails(() => finish(r.dir, 'SL-002', r.audit), /SL-002 builds to SCR-01.*"ui_check"/s);
  assert.equal(slice(r.dir, 'SL-002').status, 'in_progress');
});

test('finish: the screenshots it names must exist, or it says why there are none', (t) => {
  const r = building(t);
  fails(() => finish(r.dir, 'SL-002', { ...r.audit, ui_check: { command: 'npm start', console_errors: 0, screenshots: [SHOT] } }), /does not exist/);
  fails(() => finish(r.dir, 'SL-002', { ...r.audit, ui_check: { command: 'npm start', console_errors: 0, screenshots: [] } }), /no_screenshots_reason/);
  fails(() => finish(r.dir, 'SL-002', { ...r.audit, ui_check: { command: 'npm start', screenshots: [SHOT] } }), /console_errors/);
  fails(() => finish(r.dir, 'SL-002', { ...r.audit, ui_check: { command: 'npm start', console_errors: 0, screenshots: ['/tmp/x.png'] } }), /\.sddpp\/ui-checks\//);
});

test('finish: with the check, it closes and the audit keeps it', (t) => {
  const r = building(t);
  r.commit('docs(SL-002): screenshot of the real app', { [SHOT]: 'png bytes' });
  const ui_check = { command: 'npm start', console_errors: 0, screenshots: [SHOT] };
  finish(r.dir, 'SL-002', { ...r.audit, ui_check });
  assert.deepEqual(slice(r.dir, 'SL-002').audit.ui_check, ui_check);
});

test('finish: without a capture tool, a reason stands for the screenshots', (t) => {
  const r = building(t);
  const ui_check = { command: 'npm start', console_errors: 0, screenshots: [], no_screenshots_reason: 'no capture tool installed; the person opened the app and looked' };
  finish(r.dir, 'SL-002', { ...r.audit, ui_check });
  assert.equal(slice(r.dir, 'SL-002').audit.ui_check.no_screenshots_reason, ui_check.no_screenshots_reason);
});
