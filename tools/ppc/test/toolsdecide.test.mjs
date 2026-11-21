import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { loadProject } from '../src/load.mjs';
import { validateModel } from '../src/validate.mjs';
import { decideTool, LifecycleError } from '../src/lifecycle.mjs';
import { ROLES } from '../src/tools.mjs';
import { CLI, repo } from './helpers.mjs';

// `ppc decide-tool`: a person records which tool a role uses in this project (docs/tools.md). It is human-only (the guard lets it
// through only when the person picked it in the question panel), changes nothing when the result would be invalid, and keeps an
// earlier decision in `history`.

const FILE = '.sddpp/tools.yaml';
const today = '2026-11-21';
const read = (r) => parseYaml(readFileSync(join(r.dir, FILE), 'utf8'));
const decide = (r, role, opts = {}) => decideTool(r.dir, role, { by: 'Ana', today, ...opts });
const refuses = (fn, pattern) => assert.throws(fn, (e) => e instanceof LifecycleError && pattern.test(e.message));
const ppc = (dir, ...args) => spawnSync('node', [CLI, ...args], { cwd: dir, encoding: 'utf8' });

test('adopt: records the tool with who decided and when, and the file is valid', (t) => {
  const r = repo(t);
  const out = decide(r, 'ui-design', { adopt: 'frontend-design', kind: 'skill', source: 'anthropics/skills', pinned: '0123abc' });
  assert.deepEqual(read(r).tools, [{
    role: 'ui-design', decision: 'adopt', tool: { name: 'frontend-design', kind: 'skill', source: 'anthropics/skills', pinned: '0123abc' }, decided_by: 'Ana', decided_on: today,
  }]);
  assert.match(out.text, /ui-design/);
  assert.deepEqual(validateModel(loadProject(r.dir)).filter((f) => f.file === FILE && f.severity === 'error'), []);
});

test('adopt: an MCP server needs its access, and read-write needs its reason; nothing is written when it is refused', (t) => {
  const r = repo(t);
  // each refusal says what is missing, in words (the schema alone answers "must not be valid")
  refuses(() => decide(r, 'db-inspect', { adopt: 'postgres', kind: 'mcp' }), /needs --access read-only or read-write.*credentials/);
  refuses(() => decide(r, 'db-inspect', { adopt: 'postgres', kind: 'mcp', access: 'read-write' }), /needs --access-reason/);
  refuses(() => decide(r, 'db-inspect', { adopt: 'postgres', kind: 'mcp', access: 'read-only', accessReason: 'it only reads' }), /read-write only/);
  refuses(() => decide(r, 'db-inspect', { adopt: 'a-skill', kind: 'skill', access: 'read-only' }), /--access is for an MCP server only/);
  assert.ok(!existsSync(join(r.dir, FILE)), 'a refused decision leaves no file');
  decide(r, 'db-inspect', { adopt: 'postgres', kind: 'mcp', access: 'read-write', accessReason: 'The slice runs its own migrations' });
  assert.deepEqual(read(r).tools[0].tool, { name: 'postgres', kind: 'mcp', access: 'read-write', access_reason: 'The slice runs its own migrations' });
});

test('later and not needed: each needs what the contract asks for', (t) => {
  const r = repo(t);
  decide(r, 'ui-capture', { later: true, trigger: 'infra_component' });
  decide(r, 'security-review', { notNeeded: true, reason: 'A throwaway prototype' });
  assert.deepEqual(read(r).tools.map((e) => [e.role, e.decision, e.trigger, e.reason]), [
    ['ui-capture', 'later', 'infra_component', undefined],
    ['security-review', 'not_needed', undefined, 'A throwaway prototype'],
  ]);
  refuses(() => decide(r, 'db-inspect', { later: true }), /--trigger/);
  refuses(() => decide(r, 'db-inspect', { later: true, trigger: 'the_moon' }), /--trigger/);
  refuses(() => decide(r, 'db-inspect', { notNeeded: true }), /--reason/);
  refuses(() => decide(r, 'db-inspect', { notNeeded: true, reason: 'no' }), /--reason/);
});

test('it takes exactly one answer, a role that exists, a design, and a person', (t) => {
  const r = repo(t);
  refuses(() => decide(r, 'ui-design'), /one answer/);
  refuses(() => decide(r, 'ui-design', { adopt: 'x1', kind: 'skill', later: true, trigger: 'infra_component' }), /one answer/);
  refuses(() => decide(r, 'make-coffee', { adopt: 'x1', kind: 'skill' }), /make-coffee.*ui-design/);
  refuses(() => decide(r, undefined, { adopt: 'x1', kind: 'skill' }), /role/);
  refuses(() => decide(r, 'ui-design', { adopt: 'frontend-design' }), /--kind/);
  refuses(() => decide(r, 'ui-design', { adopt: 'frontend-design', kind: 'extension' }), /kind/);
  refuses(() => decideTool(r.dir, 'ui-design', { adopt: 'frontend-design', kind: 'skill', by: '  ' }), /--by/);
  assert.ok(!existsSync(join(r.dir, FILE)));
  refuses(() => decideTool(`${r.dir}/.sddpp`, 'ui-design', { by: 'Ana', adopt: 'frontend-design', kind: 'skill' }), /design|blueprint/);
});

test('a decision that would leave the file invalid changes nothing, and says why', (t) => {
  const r = repo(t);
  decide(r, 'ui-design', { adopt: 'frontend-design', kind: 'skill' });
  const before = readFileSync(join(r.dir, FILE), 'utf8');
  refuses(() => decide(r, 'ui-design', { adopt: 'two words', kind: 'skill' }), /invalid|name/);
  assert.equal(readFileSync(join(r.dir, FILE), 'utf8'), before);
});

test('deciding again keeps the earlier decision in history, and the roles stay in the order pp-suite lists them', (t) => {
  const r = repo(t);
  decideTool(r.dir, 'db-inspect', { by: 'Ana', today: '2026-11-01', adopt: 'postgres', kind: 'mcp', access: 'read-only' });
  decideTool(r.dir, 'ui-design', { by: 'Ana', today: '2026-11-02', adopt: 'frontend-design', kind: 'skill' });
  decideTool(r.dir, 'ui-design', { by: 'Luis', today: '2026-11-21', adopt: 'taste-skill', kind: 'skill', pinned: 'v2' });
  const list = read(r).tools;
  assert.deepEqual(list.map((e) => e.role), ROLES.map((x) => x.id).filter((id) => ['ui-design', 'db-inspect'].includes(id)));
  const ui = list.find((e) => e.role === 'ui-design');
  assert.equal(ui.tool.name, 'taste-skill');
  assert.equal(ui.decided_by, 'Luis');
  assert.deepEqual(ui.history, [{ decision: 'adopt', tool: { name: 'frontend-design', kind: 'skill' }, decided_by: 'Ana', decided_on: '2026-11-02' }]);
  assert.equal(list.find((e) => e.role === 'db-inspect').history, undefined, 'a role decided once has no history');
  assert.deepEqual(validateModel(loadProject(r.dir)).filter((f) => f.file === FILE && f.severity === 'error'), []);
});

test('a role that was only pending has no earlier decision to keep', (t) => {
  const r = repo(t);
  writeFileSync(join(r.dir, FILE), 'tools:\n  - role: ui-design\n    decision: pending\n');
  decide(r, 'ui-design', { adopt: 'frontend-design', kind: 'skill' });
  assert.equal(read(r).tools[0].history, undefined);
});

test('a decision of another person is kept as it was: only the named role changes', (t) => {
  const r = repo(t);
  writeFileSync(join(r.dir, FILE), 'tools:\n  - role: ui-capture\n    decision: not_needed\n    reason: Nothing to look at here\n    decided_by: Luis\n    decided_on: 2026-10-01\n');
  decide(r, 'ui-design', { adopt: 'frontend-design', kind: 'skill' });
  const kept = read(r).tools.find((e) => e.role === 'ui-capture');
  assert.deepEqual(kept, { role: 'ui-capture', decision: 'not_needed', reason: 'Nothing to look at here', decided_by: 'Luis', decided_on: '2026-10-01' });
});

test('CLI: decide-tool records a decision with the name from --by, refuses an option it does not know, and prints its usage', (t) => {
  const r = repo(t);
  const ok = ppc(r.dir, 'decide-tool', 'ui-design', '--adopt', 'frontend-design', '--kind', 'skill', '--by', 'Ana', r.dir);
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(read(r).tools[0].decided_by, 'Ana');
  const bad = ppc(r.dir, 'decide-tool', 'db-inspect', '--adopt', 'postgres', '--kind', 'mcp', '--axess', 'read-only', '--by', 'Ana', r.dir);
  assert.notEqual(bad.status, 0);
  assert.equal(read(r).tools.length, 1, 'an unknown option does nothing');
  const mcp = ppc(r.dir, 'decide-tool', 'db-inspect', '--adopt', 'postgres', '--kind', 'mcp', '--access', 'read-write', '--access-reason', 'Runs its own migrations', '--by', 'Ana', r.dir);
  assert.equal(mcp.status, 0, mcp.stderr);
  const help = ppc(r.dir, 'decide-tool', '--help');
  assert.equal(help.status, 0);
  assert.match(help.stdout, /HUMAN ONLY/);
  assert.equal(read(r).tools.length, 2, '--help changes nothing');
  const unknown = ppc(r.dir, 'decide-tool', 'make-coffee', '--adopt', 'x1', '--kind', 'skill', '--by', 'Ana', r.dir);
  assert.notEqual(unknown.status, 0);
  assert.match(unknown.stderr, /make-coffee/);
});
