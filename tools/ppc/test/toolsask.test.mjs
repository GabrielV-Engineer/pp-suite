import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadProject } from '../src/load.mjs';
import { askFor, DecisionError } from '../src/decisions.mjs';
import { decideTool } from '../src/lifecycle.mjs';
import { readInventory, hasTool } from '../src/inventory.mjs';
import { CLI, repo } from './helpers.mjs';

// The panel question that makes `ppc decide-tool` a person's choice: the label of the option they pick carries the exact command, and
// the guard lets that command through once (docs/tools.md). The agent proposes a tool; pp-suite says whether it found it on this
// machine; the person decides.

const GUARD_SCRIPTS = fileURLToPath(new URL('../../../sdd-pp/extension/sddpp-guard/scripts/python/', import.meta.url));
const model = (t) => loadProject(repo(t).dir);
const options = (q) => q.questions[0].options;
const commands = (q) => options(q).filter((o) => o.label.includes(' — ')).map((o) => o.label.split(' — ').at(-1));
const refuses = (fn, pattern) => assert.throws(fn, (e) => e instanceof DecisionError && pattern.test(e.message));

test('ask a role with no tool named: not needed, or not yet; a tool is named through Other, and the agent comes back with it', (t) => {
  const q = askFor(model(t), 'ui-design');
  assert.equal(q.questions.length, 1);
  assert.match(q.questions[0].question, /Interface design/);
  assert.ok(q.questions[0].header.length <= 12);
  assert.deepEqual(commands(q), ['ppc decide-tool ui-design --not-needed --reason "not needed, decided in the panel"']);
  assert.equal(options(q).length, 2);
  assert.match(q.questions[0].question, /Other/);
});

test('ask a role that is already decided: the question says what stands now', (t) => {
  const r = repo(t);
  decideTool(r.dir, 'ui-design', { by: 'Ana', adopt: 'frontend-design', kind: 'skill' });
  assert.match(askFor(loadProject(r.dir), 'ui-design').questions[0].question, /Now: frontend-design \(skill\)/);
});

test('ask with a tool: the exact command, and what pp-suite found on this machine, never claimed when it was not looked at', (t) => {
  const m = model(t);
  const q = askFor(m, 'ui-design', { tool: 'frontend-design', kind: 'skill', installed: true });
  assert.deepEqual(commands(q), ['ppc decide-tool ui-design --adopt frontend-design --kind skill']);
  assert.match(q.questions[0].question, /frontend-design \(skill\)/);
  assert.match(q.questions[0].question, /on this machine/);
  const missing = askFor(m, 'ui-design', { tool: 'frontend-design', kind: 'skill', installed: false }).questions[0].question;
  assert.match(missing, /did not find/);
  assert.match(missing, /own knowledge/, 'a name the agent brought is its own suggestion, not verified');
  assert.match(missing, /restart/);
  const unknown = askFor(m, 'ui-design', { tool: 'frontend-design', kind: 'skill' }).questions[0].question;
  assert.doesNotMatch(unknown, /on this machine|did not find/);
});

test('ask with a tool: source and pinned version ride in the command and in the question', (t) => {
  const q = askFor(model(t), 'ui-design', { tool: 'example:frontend-design', kind: 'skill', source: 'github.com/example/skills', pinned: 'a1b2c3d' });
  assert.deepEqual(commands(q), ['ppc decide-tool ui-design --adopt example:frontend-design --kind skill --source "github.com/example/skills" --pinned a1b2c3d']);
  assert.match(q.questions[0].question, /github\.com\/example\/skills/);
  assert.match(q.questions[0].question, /a1b2c3d/);
});

test('ask with an MCP server: what it may do is in the question and in the command', (t) => {
  const m = model(t);
  const ro = askFor(m, 'db-inspect', { tool: 'postgres', kind: 'mcp', access: 'read-only' });
  assert.deepEqual(commands(ro), ['ppc decide-tool db-inspect --adopt postgres --kind mcp --access read-only']);
  assert.match(ro.questions[0].question, /only read/);
  const rw = askFor(m, 'db-inspect', { tool: 'postgres', kind: 'mcp', access: 'read-write', accessReason: 'The slice runs its own migrations' });
  assert.deepEqual(commands(rw), ['ppc decide-tool db-inspect --adopt postgres --kind mcp --access read-write --access-reason "The slice runs its own migrations"']);
  assert.match(rw.questions[0].question, /change/);
  assert.match(rw.questions[0].question, /runs its own migrations/);
});

test('ask refuses what the command would refuse, so the person is never offered an option that fails', (t) => {
  const m = model(t);
  refuses(() => askFor(m, 'ui-design', { tool: 'two words', kind: 'skill' }), /name/);
  refuses(() => askFor(m, 'ui-design', { tool: 'x', kind: 'skill' }), /name/);
  refuses(() => askFor(m, 'ui-design', { tool: 'frontend-design' }), /--kind/);
  refuses(() => askFor(m, 'ui-design', { tool: 'frontend-design', kind: 'extension' }), /kind/);
  refuses(() => askFor(m, 'db-inspect', { tool: 'postgres', kind: 'mcp' }), /--access/);
  refuses(() => askFor(m, 'db-inspect', { tool: 'postgres', kind: 'mcp', access: 'read-write' }), /--access-reason/);
  refuses(() => askFor(m, 'ui-design', { tool: 'a-skill', kind: 'skill', access: 'read-only' }), /MCP server only/);
  refuses(() => askFor(m, 'ui-design', { tool: 'frontend-design', kind: 'skill', source: 'say "hi"' }), /double quote/);
  refuses(() => askFor(m, 'db-inspect', { tool: 'postgres', kind: 'mcp', access: 'read-write', accessReason: 'no' }), /characters/);
});

test('ask: a tool already adopted exactly so has nothing to decide, and there is no question before the design', (t) => {
  const r = repo(t);
  decideTool(r.dir, 'ui-design', { by: 'Ana', adopt: 'frontend-design', kind: 'skill' });
  assert.equal(askFor(loadProject(r.dir), 'ui-design', { tool: 'frontend-design', kind: 'skill' }), null);
  assert.ok(askFor(loadProject(r.dir), 'ui-design', { tool: 'taste-skill', kind: 'skill' }), 'another tool is a change, and a question');
  assert.equal(askFor({ ...loadProject(r.dir), blueprint: null }, 'ui-design'), null);
});

test('ask: every option says what happens if the person picks it, and no two options of a question say the same', (t) => {
  const m = model(t);
  for (const extra of [{}, { tool: 'frontend-design', kind: 'skill', installed: true }, { tool: 'postgres', kind: 'mcp', access: 'read-only' }]) {
    const list = options(askFor(m, 'db-inspect', extra));
    for (const o of list) assert.ok(o.description.length >= 15, `"${o.label}" says what happens (${o.description})`);
    assert.equal(new Set(list.map((o) => o.description)).size, list.length);
  }
});

test('the commands in the labels are exactly what the guard accepts once the person has chosen them (Node and Python agree)', (t) => {
  const m = model(t);
  const scratch = mkdtempSync(join(tmpdir(), 'ppc-ledger-'));
  t.after(() => rmSync(scratch, { recursive: true, force: true }));
  const env = { ...process.env, CLAUDE_PROJECT_DIR: scratch };
  const py = (script, payload) => spawnSync('python3', ['-I', join(GUARD_SCRIPTS, script)], { input: JSON.stringify(payload), encoding: 'utf8', env, cwd: scratch });
  let n = 0;
  const asked = [
    askFor(m, 'ui-design'),
    askFor(m, 'ui-design', { tool: 'frontend-design', kind: 'skill', installed: true }),
    askFor(m, 'ui-design', { tool: 'example:frontend-design', kind: 'skill', source: 'github.com/example/skills; v2', pinned: 'a1b2c3d' }),
    askFor(m, 'db-inspect', { tool: 'postgres', kind: 'mcp', access: 'read-only' }),
    askFor(m, 'db-inspect', { tool: 'postgres', kind: 'mcp', access: 'read-write', accessReason: 'Runs its own migrations; nothing else' }),
  ];
  for (const q of asked) {
    for (const option of options(q).filter((o) => o.label.includes(' — '))) {
      n += 1;
      const command = option.label.split(' — ').at(-1);
      const answers = { [`Q${n}?`]: option.label };
      py('record_answer.py', { tool_name: 'AskUserQuestion', tool_use_id: `toolu_${n}`, session_id: 'S', tool_input: { answers }, tool_response: { answers } });
      const verdict = py('guard.py', { tool_name: 'Bash', tool_use_id: `toolu_b${n}`, session_id: 'S', permission_mode: 'bypassPermissions', tool_input: { command } });
      assert.equal(verdict.status, 0, `${command}: ${verdict.stderr}`);
    }
  }
  assert.equal(n, 5);
});

// ── looking for the tool on this machine ─────────────────────────
test('hasTool: a skill by its name or its bare name, a plugin, an MCP server; each only among its own kind', (t) => {
  const base = mkdtempSync(join(tmpdir(), 'ppc-has-'));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const home = join(base, 'home');
  const root = join(base, 'project');
  mkdirSync(join(home, '.claude/skills/my-skill'), { recursive: true });
  writeFileSync(join(home, '.claude/skills/my-skill/SKILL.md'), '---\nname: my-skill\n---\n');
  mkdirSync(root, { recursive: true });
  const install = join(home, '.claude/plugins/cache/m/designer/1');
  mkdirSync(join(install, 'skills/frontend-design'), { recursive: true });
  writeFileSync(join(install, 'skills/frontend-design/SKILL.md'), '---\nname: frontend-design\n---\n');
  writeFileSync(join(home, '.claude/plugins/installed_plugins.json'), JSON.stringify({ version: 2, plugins: { 'designer@m': [{ scope: 'user', installPath: install }] } }));
  writeFileSync(join(home, '.claude.json'), JSON.stringify({ mcpServers: { postgres: { command: 'x' } } }));
  const inv = readInventory({ home, root });
  assert.ok(hasTool(inv, 'skill', 'my-skill'));
  assert.ok(hasTool(inv, 'skill', 'designer:frontend-design'), 'a plugin skill by its full name');
  assert.ok(hasTool(inv, 'skill', 'frontend-design'), 'and by its bare name');
  assert.ok(!hasTool(inv, 'skill', 'other-skill'));
  assert.ok(hasTool(inv, 'plugin', 'designer'));
  assert.ok(!hasTool(inv, 'plugin', 'my-skill'), 'a skill is not a plugin');
  assert.ok(hasTool(inv, 'mcp', 'postgres'));
  assert.ok(!hasTool(inv, 'mcp', 'designer'));
});

// ── the command ──────────────────────────────────────────────────
const ppc = (dir, env, ...args) => spawnSync('node', [CLI, ...args], { cwd: dir, encoding: 'utf8', env: { ...process.env, ...env } });

test('CLI: ppc ask <role> --tool looks for the tool in the person\'s home and says so, and refuses what the command would refuse', (t) => {
  const r = repo(t);
  const home = mkdtempSync(join(tmpdir(), 'ppc-home-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const none = ppc(r.dir, { HOME: home }, 'ask', 'ui-design', '--tool', 'frontend-design', '--kind', 'skill', r.dir);
  assert.equal(none.status, 0, none.stderr);
  assert.match(JSON.parse(none.stdout).questions[0].question, /did not find/);
  mkdirSync(join(home, '.claude/skills/frontend-design'), { recursive: true });
  writeFileSync(join(home, '.claude/skills/frontend-design/SKILL.md'), '---\nname: frontend-design\n---\n');
  const found = ppc(r.dir, { HOME: home }, 'ask', 'ui-design', '--tool', 'frontend-design', '--kind', 'skill', r.dir);
  assert.match(JSON.parse(found.stdout).questions[0].question, /on this machine/);
  const bare = ppc(r.dir, { HOME: home }, 'ask', 'ui-design', r.dir);
  assert.equal(bare.status, 0, bare.stderr);
  assert.match(JSON.parse(bare.stdout).questions[0].question, /Interface design/);
  const bad = ppc(r.dir, { HOME: home }, 'ask', 'ui-design', '--tool', 'two words', '--kind', 'skill', r.dir);
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /name/);
  assert.notEqual(ppc(r.dir, { HOME: home }, 'ask', 'ui-design', '--toool', 'x', r.dir).status, 0, 'an option it does not know is refused');
});
