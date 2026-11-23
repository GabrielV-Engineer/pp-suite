import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { loadProject } from '../src/load.mjs';
import { validateModel } from '../src/validate.mjs';
import { decideTool } from '../src/lifecycle.mjs';
import { askFor } from '../src/decisions.mjs';
import { checkTools, renderChecks, toolFromFlags } from '../src/tools.mjs';
import { readInventory, hasTool } from '../src/inventory.mjs';
import { CLI, repo } from './helpers.mjs';

// Being on the machine is not being able to do the job (first real project): `playwright-cli` was "on this machine", and opening a page
// failed because its browser was not installed (F-T16); it could not drive the app's pywebview window either (F-T25). A tool may now
// carry a check, a one-line command that shows it can do its job here, and `ppc tools --run-checks` runs it. And `security-review`, built
// into Claude Code, was not in the inventory, so the role could only be "none" (F-T8).

const FILE = '.sddpp/tools.yaml';
const ppc = (dir, ...args) => spawnSync('node', [CLI, ...args], { cwd: dir, encoding: 'utf8' });
const CHECK = 'npx playwright-cli screenshot about:blank';

test('a tool may carry a check, and the contract takes it', (t) => {
  assert.deepEqual(toolFromFlags({ adopt: 'playwright-cli', kind: 'skill', check: CHECK }, (m) => { throw new Error(m); }), { name: 'playwright-cli', kind: 'skill', check: CHECK });
  assert.throws(() => toolFromFlags({ adopt: 'x-tool', kind: 'skill', check: 'a\nb' }, (m) => { throw new Error(m); }), /one line/);
  const r = repo(t);
  decideTool(r.dir, 'ui-capture', { by: 'Ana', today: '2026-11-23', adopt: 'playwright-cli', kind: 'skill', check: CHECK });
  assert.equal(parseYaml(readFileSync(join(r.dir, FILE), 'utf8')).tools[0].tool.check, CHECK);
  assert.deepEqual(validateModel(loadProject(r.dir)).filter((f) => f.file === FILE && f.severity === 'error'), []);
});

test('the panel question carries the check in its command and says ppc tools --run-checks runs it', (t) => {
  const r = repo(t);
  const q = askFor(loadProject(r.dir), 'ui-capture', { tool: 'playwright-cli', kind: 'skill', check: CHECK }).questions[0];
  assert.match(q.question, /Checked by: npx playwright-cli screenshot about:blank/);
  assert.match(q.question, /ppc tools --run-checks/);
  assert.ok(q.options[0].label.endsWith(`--check-command "${CHECK}"`), q.options[0].label);
  const plain = askFor(loadProject(r.dir), 'ui-capture', { tool: 'playwright-cli', kind: 'skill' }).questions[0];
  assert.match(plain.question, /No check: nothing will show it can do its job here/);
});

test('checkTools runs each adopted tool\'s check and says whether it worked, with the error when it did not', () => {
  const model = { tools: { data: { tools: [
    { role: 'ui-capture', decision: 'adopt', tool: { name: 'playwright-cli', kind: 'skill', check: 'capture' } },
    { role: 'ui-design', decision: 'adopt', tool: { name: 'frontend-design', kind: 'skill', check: 'design' } },
    { role: 'security-review', decision: 'adopt', tool: { name: 'security-review', kind: 'skill' } },
    { role: 'db-inspect', decision: 'not_needed', reason: 'no database' },
  ] } } };
  const ran = [];
  const run = (command) => {
    ran.push(command);
    return command === 'capture' ? { status: 1, stderr: 'some line\nChromium distribution \'chrome\' is not found\n' } : { status: 0, stderr: '' };
  };
  const results = checkTools(model, run);
  assert.deepEqual(ran, ['design', 'capture'], 'only the checks recorded are run, in the order of the roles');
  assert.deepEqual(results.map((x) => [x.role, x.state]), [['ui-design', 'works'], ['ui-capture', 'failed'], ['security-review', 'no-check']]);
  assert.match(results[1].detail, /Chromium distribution 'chrome' is not found/);
  const text = renderChecks(results);
  assert.match(text, /ui-capture\s+playwright-cli: failed \(exit 1\): Chromium distribution 'chrome' is not found/);
  assert.match(text, /ui-design\s+frontend-design: works/);
  assert.match(text, /security-review\s+security-review: no check recorded/);
});

test('ppc tools --run-checks runs the checks in the project folder', (t) => {
  const r = repo(t);
  decideTool(r.dir, 'ui-capture', { by: 'Ana', today: '2026-11-23', adopt: 'capture-tool', kind: 'skill', check: 'test -d .sddpp' });
  decideTool(r.dir, 'ui-design', { by: 'Ana', today: '2026-11-23', adopt: 'design-tool', kind: 'skill', check: 'test -f no-such-file' });
  const out = ppc(r.dir, 'tools', '--run-checks');
  assert.equal(out.status, 1, 'a failed check is a failed command');
  assert.match(out.stdout, /ui-capture\s+capture-tool: works/);
  assert.match(out.stdout, /ui-design\s+design-tool: failed \(exit 1\)/);
});

test('the inventory has what Claude Code brings itself, marked as built in', () => {
  const home = mkdtempSync(join(tmpdir(), 'ppc-home-'));
  const inv = readInventory({ home, root: home });
  assert.ok(inv.builtIn.some((s) => s.name === 'security-review' && s.from === 'built-in'));
  assert.ok(!inv.skills.some((s) => s.name === 'security-review'), 'apart from what was read on disk');
  assert.ok(hasTool(inv, 'skill', 'security-review'));
});

test('/pp-tools tries a tool before proposing it and proposes it with its check', () => {
  const p = readFileSync(new URL('../../../sdd-pp/extension/sddpp-cycle/commands/tools.md', import.meta.url), 'utf8').replace(/\s+/g, ' ');
  assert.match(p, /--check/);
  assert.match(p, /[Tt]ry it once/);
  assert.match(p, /ppc tools --run-checks/);
});
