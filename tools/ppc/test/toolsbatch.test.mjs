import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { loadProject } from '../src/load.mjs';
import { validateModel } from '../src/validate.mjs';
import { askFor, DecisionError } from '../src/decisions.mjs';
import { decideTool, decideTools, LifecycleError } from '../src/lifecycle.mjs';
import { parseUse, ROLES } from '../src/tools.mjs';
import { CLI, repo } from './helpers.mjs';

// Decision C: every role that slices call for and nobody decided, put to the person in ONE question. Two commands record it: all of
// them not needed, or a tool for each role the agent proposed. Both are the person's (the guard lets them through only when picked in
// the panel), both are all-or-nothing, and a server that may change things is never decided in a batch.

const FILE = '.sddpp/tools.yaml';
const today = '2026-11-21';
const read = (r) => parseYaml(readFileSync(join(r.dir, FILE), 'utf8'));
const refuses = (fn, pattern, type = LifecycleError) => assert.throws(fn, (e) => e instanceof type && pattern.test(e.message));
const ppc = (dir, env, ...args) => spawnSync('node', [CLI, ...args], { cwd: dir, encoding: 'utf8', env: { ...process.env, ...env } });
const options = (q) => q.questions[0].options;
const commands = (q) => options(q).filter((o) => o.label.includes(' — ')).map((o) => o.label.split(' — ').at(-1));
const all = ROLES.map((r) => r.id);
const fail = (message) => {
  throw new LifecycleError(message);
};

// ── parsing what the agent proposes ──────────────────────────────
test('parseUse: role=kind:name, with the access of an MCP server last, and the names a plugin skill has', () => {
  assert.deepEqual(parseUse('ui-design=skill:frontend-design', fail), [{ role: 'ui-design', tool: { name: 'frontend-design', kind: 'skill' } }]);
  assert.deepEqual(parseUse('ui-design=skill:designer:frontend-design, db-inspect=mcp:postgres:read-only', fail), [
    { role: 'ui-design', tool: { name: 'designer:frontend-design', kind: 'skill' } },
    { role: 'db-inspect', tool: { name: 'postgres', kind: 'mcp', access: 'read-only' } },
  ]);
  assert.deepEqual(parseUse('ui-capture=plugin:playwright', fail)[0].tool, { name: 'playwright', kind: 'plugin' });
});

test('parseUse refuses what it cannot take, and a server that may change things is not decided in a batch', () => {
  const bad = (text, pattern) => refuses(() => parseUse(text, fail), pattern);
  bad('', /at least one/);
  bad('ui-design', /role=kind:name/);
  bad('ui-design=frontend-design', /role=kind:name/);
  bad('make-coffee=skill:frontend-design', /make-coffee.*ui-design/);
  bad('ui-design=skill:a-skill,ui-design=skill:b-skill', /twice/);
  bad('ui-design=extension:frontend-design', /kind/);
  bad('ui-design=skill:two words', /name/);
  bad('db-inspect=mcp:postgres', /needs its access/);
  bad('db-inspect=mcp:postgres:everything', /read-only/);
  bad('db-inspect=mcp:postgres:read-write', /on its own.*ppc ask db-inspect --tool postgres --kind mcp --access read-write --access-reason/);
});

// ── the command ──────────────────────────────────────────────────
test('--roles --not-needed: every named role is recorded as not needed, with the same reason, in one step', (t) => {
  const r = repo(t);
  const out = decideTools(r.dir, { by: 'Ana', today, roles: ['ui-capture', 'db-inspect'], notNeeded: true, reason: 'A throwaway prototype' });
  assert.deepEqual(read(r).tools.map((e) => [e.role, e.decision, e.reason, e.decided_by]), [['ui-capture', 'not_needed', 'A throwaway prototype', 'Ana'], ['db-inspect', 'not_needed', 'A throwaway prototype', 'Ana']]);
  assert.match(out.text, /ui-capture.*\n.*db-inspect|db-inspect.*\n.*ui-capture/);
  assert.match(out.text, /ppc constitution/);
  assert.deepEqual(validateModel(loadProject(r.dir)).filter((f) => f.file === FILE && f.severity === 'error'), []);
});

test('--use: a tool for each role named, in one step, with the access of an MCP server', (t) => {
  const r = repo(t);
  decideTools(r.dir, { by: 'Ana', today, use: 'db-inspect=mcp:postgres:read-only,ui-design=skill:frontend-design' });
  assert.deepEqual(read(r).tools.map((e) => [e.role, e.decision, e.tool]), [
    ['ui-design', 'adopt', { name: 'frontend-design', kind: 'skill' }],
    ['db-inspect', 'adopt', { name: 'postgres', kind: 'mcp', access: 'read-only' }],
  ]);
});

test('a batch is all or nothing, and asks for what it needs', (t) => {
  const r = repo(t);
  const go = (opts) => decideTools(r.dir, { by: 'Ana', today, ...opts });
  refuses(() => go({ use: 'ui-design=skill:frontend-design,db-inspect=mcp:postgres' }), /needs its access/);
  refuses(() => go({ roles: ['ui-capture', 'make-coffee'], notNeeded: true, reason: 'A throwaway prototype' }), /make-coffee/);
  refuses(() => go({ roles: ['ui-capture', 'ui-capture'], notNeeded: true, reason: 'A throwaway prototype' }), /twice/);
  refuses(() => go({ roles: [], notNeeded: true, reason: 'A throwaway prototype' }), /role/);
  refuses(() => go({ roles: ['ui-capture'], notNeeded: true }), /--reason/);
  refuses(() => go({ roles: ['ui-capture'], notNeeded: true, reason: 'no' }), /--reason/);
  refuses(() => go({ roles: ['ui-capture'], notNeeded: true, reason: 'A throwaway prototype', use: 'ui-design=skill:frontend-design' }), /one answer|either/);
  refuses(() => go({}), /one answer|either/);
  refuses(() => decideTools(r.dir, { today, use: 'ui-design=skill:frontend-design' }), /--by/);
  assert.ok(!existsSync(join(r.dir, FILE)), 'nothing was written');
});

test('a batch keeps earlier decisions in history, and leaves the roles it does not name as they were', (t) => {
  const r = repo(t);
  decideTool(r.dir, 'db-inspect', { by: 'Luis', today: '2026-11-01', adopt: 'postgres', kind: 'mcp', access: 'read-only' });
  decideTool(r.dir, 'ui-design', { by: 'Luis', today: '2026-11-02', adopt: 'taste-skill', kind: 'skill' });
  decideTools(r.dir, { by: 'Ana', today, use: 'ui-design=skill:frontend-design' });
  const list = read(r).tools;
  assert.equal(list.find((e) => e.role === 'ui-design').tool.name, 'frontend-design');
  assert.deepEqual(list.find((e) => e.role === 'ui-design').history.map((h) => h.tool.name), ['taste-skill']);
  assert.deepEqual(list.find((e) => e.role === 'db-inspect'), { role: 'db-inspect', decision: 'adopt', tool: { name: 'postgres', kind: 'mcp', access: 'read-only' }, decided_by: 'Luis', decided_on: '2026-11-01' });
});

test('CLI: the batch forms, refused when mixed with a single role, and their usage', (t) => {
  const r = repo(t);
  const run = (...args) => ppc(r.dir, {}, 'decide-tool', ...args, r.dir);
  const none = run('--roles', 'ui-capture,db-inspect', '--not-needed', '--reason', 'A throwaway prototype', '--by', 'Ana');
  assert.equal(none.status, 0, none.stderr);
  assert.equal(read(r).tools.length, 2);
  const use = run('--use', 'ui-design=skill:frontend-design', '--by', 'Ana');
  assert.equal(use.status, 0, use.stderr);
  assert.equal(read(r).tools.length, 3);
  for (const args of [['ui-design', '--use', 'security-review=skill:x1'], ['--roles', 'security-review', '--adopt', 'x1', '--kind', 'skill'], ['--use', 'security-review=skill:x1', '--later']]) {
    const mixed = run(...args, '--by', 'Ana');
    assert.notEqual(mixed.status, 0, args.join(' '));
    assert.match(mixed.stderr, /decide several roles at once; they do not go with a single role, --adopt or --later/, args.join(' '));
  }
  assert.equal(read(r).tools.length, 3, 'a refused batch changes nothing');
  assert.match(ppc(r.dir, {}, 'decide-tool', '--help').stdout, /--roles .*--not-needed/s);
});

// ── the question ─────────────────────────────────────────────────
// the example's slices name their screens only when asked: without them ui-capture calls for nothing
const model = (t) => loadProject(repo(t, { screens: true }).dir);

test('ask tools: every role nobody decided, with the slices that call for it, in one question with the choices that need no tool', (t) => {
  const q = askFor(model(t), 'tools');
  assert.equal(q.questions.length, 1);
  const text = q.questions[0].question;
  for (const role of all) assert.match(text, new RegExp(role));
  assert.match(text, /SL-001/);
  assert.ok(q.questions[0].header.length <= 12);
  assert.deepEqual(commands(q), [`ppc decide-tool --roles ${all.join(',')} --not-needed --reason "not needed, decided in the panel"`]);
  assert.deepEqual(options(q).map((o) => o.label.split(' — ')[0]), ['None of them is needed', 'One by one', 'Not yet']);
  for (const o of options(q)) assert.ok(o.description.length >= 15, o.label);
  assert.equal(new Set(options(q).map((o) => o.description)).size, 3);
});

test('ask tools: a role that is decided is not in the question, and with nothing left there is no question', (t) => {
  const r = repo(t, { screens: true });
  decideTool(r.dir, 'ui-design', { by: 'Ana', adopt: 'frontend-design', kind: 'skill' });
  const q = askFor(loadProject(r.dir), 'tools');
  assert.doesNotMatch(q.questions[0].question, /ui-design/);
  assert.match(commands(q)[0], /--roles ui-capture,security-review,db-inspect /);
  decideTools(r.dir, { by: 'Ana', today, roles: ['ui-capture', 'security-review', 'db-inspect'], notNeeded: true, reason: 'A throwaway prototype' });
  assert.equal(askFor(loadProject(r.dir), 'tools'), null);
  assert.equal(askFor({ ...loadProject(r.dir), blueprint: null }, 'tools'), null);
});

test('ask tools --use: the proposals in one confirmation, each with what pp-suite found on this machine', (t) => {
  const inventory = { skills: [{ name: 'frontend-design', from: 'user' }], plugins: [], mcp: [], problems: [] };
  const q = askFor(model(t), 'tools', { use: 'ui-design=skill:frontend-design,db-inspect=mcp:postgres:read-only', inventory });
  assert.deepEqual(commands(q), ['ppc decide-tool --use "ui-design=skill:frontend-design,db-inspect=mcp:postgres:read-only"']);
  const text = q.questions[0].question;
  assert.match(text, /ui-design.*frontend-design \(skill\).*on this machine/);
  assert.match(text, /db-inspect.*postgres \(mcp, read-only\).*did not find/);
  assert.match(text, /own knowledge/);
  const unlooked = askFor(model(t), 'tools', { use: 'ui-design=skill:frontend-design' }).questions[0].question;
  assert.doesNotMatch(unlooked, /on this machine|did not find/);
});

test('ask tools --use refuses what the command would refuse', (t) => {
  const m = model(t);
  const bad = (use, pattern) => refuses(() => askFor(m, 'tools', { use }), pattern, DecisionError);
  bad('db-inspect=mcp:postgres:read-write', /on its own/);
  bad('ui-design=skill:two words', /name/);
  bad('make-coffee=skill:x1', /make-coffee/);
  assert.equal(askFor({ ...m, blueprint: null }, 'tools', { use: 'ui-design=skill:frontend-design' }), null, 'no question that the command would refuse for want of a design');
});

test('the commands in the labels are exactly what the guard accepts once the person has chosen them (Node and Python agree)', (t) => {
  const guardScripts = fileURLToPath(new URL('../../../sdd-pp/extension/sddpp-guard/scripts/python/', import.meta.url));
  const scratch = mkdtempSync(join(tmpdir(), 'ppc-ledger-'));
  t.after(() => rmSync(scratch, { recursive: true, force: true }));
  const env = { ...process.env, CLAUDE_PROJECT_DIR: scratch };
  const py = (script, payload) => spawnSync('python3', ['-I', join(guardScripts, script)], { input: JSON.stringify(payload), encoding: 'utf8', env, cwd: scratch });
  const m = model(t);
  let n = 0;
  for (const q of [askFor(m, 'tools'), askFor(m, 'tools', { use: 'ui-design=skill:designer:frontend-design,db-inspect=mcp:postgres:read-only' })]) {
    for (const option of options(q).filter((o) => o.label.includes(' — '))) {
      n += 1;
      const command = option.label.split(' — ').at(-1);
      const answers = { [`Q${n}?`]: option.label };
      py('record_answer.py', { tool_name: 'AskUserQuestion', tool_use_id: `toolu_${n}`, session_id: 'S', tool_input: { answers }, tool_response: { answers } });
      const verdict = py('guard.py', { tool_name: 'Bash', tool_use_id: `toolu_b${n}`, session_id: 'S', permission_mode: 'bypassPermissions', tool_input: { command } });
      assert.equal(verdict.status, 0, `${command}: ${verdict.stderr}`);
    }
  }
  assert.equal(n, 2);
});

test('CLI: ppc ask tools prints the question, looks in the person\'s home for the proposals, and refuses a proposal it cannot take', (t) => {
  const r = repo(t);
  const home = mkdtempSync(join(tmpdir(), 'ppc-home-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const plain = ppc(r.dir, { HOME: home }, 'ask', 'tools', r.dir);
  assert.equal(plain.status, 0, plain.stderr);
  assert.match(JSON.parse(plain.stdout).questions[0].question, /ui-design/);
  const missing = ppc(r.dir, { HOME: home }, 'ask', 'tools', '--use', 'ui-design=skill:frontend-design', r.dir);
  assert.match(JSON.parse(missing.stdout).questions[0].question, /did not find/);
  mkdirSync(join(home, '.claude/skills/frontend-design'), { recursive: true });
  writeFileSync(join(home, '.claude/skills/frontend-design/SKILL.md'), '---\nname: frontend-design\n---\n');
  const found = ppc(r.dir, { HOME: home }, 'ask', 'tools', '--use', 'ui-design=skill:frontend-design', r.dir);
  assert.match(JSON.parse(found.stdout).questions[0].question, /on this machine/);
  assert.equal(ppc(r.dir, { HOME: home }, 'ask', 'tools', '--use', 'db-inspect=mcp:postgres:read-write', r.dir).status, 1);
});
