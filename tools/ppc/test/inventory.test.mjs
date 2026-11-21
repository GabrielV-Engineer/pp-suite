import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { readInventory, bareName } from '../src/inventory.mjs';

// What the person already has: skills, plugins and MCP servers, read from where Claude Code keeps them. The inventory is
// read-only and names only: a server's command, url, arguments and environment never come back (they can hold tokens).

function scratch(t) {
  const base = mkdtempSync(join(tmpdir(), 'ppc-inventory-'));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const home = join(base, 'home');
  const root = join(base, 'project');
  mkdirSync(home, { recursive: true });
  mkdirSync(root, { recursive: true });
  return { base, home: realpathSync(home), root: realpathSync(root) };
}
const put = (file, content) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content));
};
const skill = (dir, name) => put(join(dir, name, 'SKILL.md'), `---\nname: ${name}\n---\n`);
const plugins = (home, list) => put(join(home, '.claude/plugins/installed_plugins.json'), { version: 2, plugins: list });
const names = (list) => list.map((x) => x.name).sort();

test('skills: those of the user and of the project, each with where it comes from; a folder without SKILL.md is not a skill', (t) => {
  const { home, root } = scratch(t);
  skill(join(home, '.claude/skills'), 'frontend-design');
  skill(join(root, '.claude/skills'), 'pp-build');
  mkdirSync(join(home, '.claude/skills/not-a-skill'), { recursive: true });
  const inv = readInventory({ home, root });
  assert.deepEqual(inv.skills.map((s) => [s.name, s.from]).sort(), [['frontend-design', 'user'], ['pp-build', 'project']]);
});

test('skills: those a plugin brings are named plugin:skill, as the Skill tool names them', (t) => {
  const { home, root } = scratch(t);
  const install = join(home, '.claude/plugins/cache/market/the-architect/2.6.0');
  skill(join(install, 'skills'), 'architect');
  plugins(home, { 'the-architect@market': [{ scope: 'user', installPath: install, version: '2.6.0' }] });
  const inv = readInventory({ home, root });
  assert.deepEqual(inv.plugins.map((p) => [p.name, p.scope]), [['the-architect', 'user']]);
  assert.deepEqual(inv.skills.map((s) => [s.name, s.from]), [['the-architect:architect', 'plugin']]);
  assert.equal(bareName('the-architect:architect'), 'architect');
  assert.equal(bareName('frontend-design'), 'frontend-design');
});

test('plugins: one installed for another project does not count here, and one for this project does', (t) => {
  const { home, root, base } = scratch(t);
  const mine = join(home, '.claude/plugins/cache/m/mine/1');
  const theirs = join(home, '.claude/plugins/cache/m/theirs/1');
  skill(join(mine, 'skills'), 'one');
  skill(join(theirs, 'skills'), 'two');
  plugins(home, {
    'mine@m': [{ scope: 'local', projectPath: root, installPath: mine }],
    'theirs@m': [{ scope: 'local', projectPath: join(base, 'other'), installPath: theirs }],
  });
  const inv = readInventory({ home, root });
  assert.deepEqual(names(inv.plugins), ['mine']);
  assert.deepEqual(names(inv.skills), ['mine:one']);
});

test('plugins: one the person switched off in the settings is left out; the nearest setting wins', (t) => {
  const { home, root } = scratch(t);
  const a = join(home, '.claude/plugins/cache/m/a/1');
  const b = join(home, '.claude/plugins/cache/m/b/1');
  skill(join(a, 'skills'), 'sa');
  skill(join(b, 'skills'), 'sb');
  plugins(home, { 'a@m': [{ scope: 'user', installPath: a }], 'b@m': [{ scope: 'user', installPath: b }] });
  put(join(home, '.claude/settings.json'), { enabledPlugins: { 'a@m': false, 'b@m': false } });
  put(join(root, '.claude/settings.local.json'), { enabledPlugins: { 'b@m': true } });
  const inv = readInventory({ home, root });
  assert.deepEqual(names(inv.plugins), ['b']);
  assert.deepEqual(names(inv.skills), ['b:sb']);
});

test('MCP: servers of the user, of this project in the user file, and of .mcp.json, by name and scope', (t) => {
  const { home, root, base } = scratch(t);
  put(join(home, '.claude.json'), {
    mcpServers: { notion: { type: 'http', url: 'https://example.invalid/mcp' } },
    projects: { [root]: { mcpServers: { local_one: { command: 'x' } } }, [join(base, 'other')]: { mcpServers: { not_mine: { command: 'y' } } } },
  });
  put(join(root, '.mcp.json'), { mcpServers: { shared: { command: 'z' } } });
  const inv = readInventory({ home, root });
  assert.deepEqual(inv.mcp.map((m) => [m.name, m.scope]).sort(), [['local_one', 'local'], ['notion', 'user'], ['shared', 'project']]);
});

test('MCP: a server of .mcp.json the person disabled for this project is left out', (t) => {
  const { home, root } = scratch(t);
  put(join(home, '.claude.json'), { projects: { [root]: { disabledMcpjsonServers: ['off'] } } });
  put(join(root, '.mcp.json'), { mcpServers: { off: { command: 'a' }, on: { command: 'b' } } });
  assert.deepEqual(names(readInventory({ home, root }).mcp), ['on']);
});

test('nothing sensitive comes back: no command, url, arguments or environment of a server', (t) => {
  const { home, root } = scratch(t);
  put(join(home, '.claude.json'), {
    userID: 'user-id-should-not-appear',
    mcpServers: { s: { command: 'run-secret-cmd', args: ['--key=ARG-SECRET'], env: { TOKEN: 'TOKEN-SECRET' }, url: 'https://URL-SECRET.invalid', headers: { Authorization: 'HEADER-SECRET' } } },
  });
  const text = JSON.stringify(readInventory({ home, root }));
  for (const secret of ['run-secret-cmd', 'ARG-SECRET', 'TOKEN-SECRET', 'URL-SECRET', 'HEADER-SECRET', 'user-id-should-not-appear']) assert.ok(!text.includes(secret), secret);
  assert.match(text, /"s"/);
});

test('missing or broken files never throw: they give an empty list and, when broken, a problem that quotes nothing', (t) => {
  const { home, root } = scratch(t);
  assert.deepEqual(readInventory({ home, root }), { skills: [], plugins: [], mcp: [], problems: [] });
  put(join(home, '.claude.json'), '{ not json SECRET-TEXT');
  put(join(home, '.claude/plugins/installed_plugins.json'), 'also broken SECRET-TEXT');
  put(join(root, '.mcp.json'), '[1, 2');
  const inv = readInventory({ home, root });
  assert.deepEqual([inv.skills, inv.plugins, inv.mcp], [[], [], []]);
  assert.equal(inv.problems.length, 3);
  assert.ok(!JSON.stringify(inv.problems).includes('SECRET-TEXT'));
});

test('without a home directory only the project is read, and nothing is read from the current directory by accident', (t) => {
  const { root } = scratch(t);
  skill(join(root, '.claude/skills'), 'only-here');
  const inv = readInventory({ home: '', root });
  assert.deepEqual(names(inv.skills), ['only-here']);
  assert.deepEqual(inv.problems, []);
});
