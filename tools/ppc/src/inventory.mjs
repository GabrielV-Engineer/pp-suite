import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';

// What the person already has: skills, plugins and MCP servers, read from where Claude Code keeps them. It is read-only
// and returns NAMES ONLY: a server's command, url, arguments and environment can hold tokens, so they are never copied
// out of the file. Nothing here is written to a project: the inventory is about the machine, and the project's repository
// can be public (see docs/tools.md). It never throws; a file it cannot read is a `problem` that quotes none of its text.

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/** The same folder, whether or not one side is a symlink or has a trailing slash. */
function same(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const real = (p) => {
    try {
      return realpathSync(p);
    } catch {
      return resolve(p);
    }
  };
  return real(a) === real(b);
}

function readJson(file, label, problems) {
  if (!file || !existsSync(file)) return {};
  try {
    const data = JSON.parse(readFileSync(file, 'utf8'));
    return isObject(data) ? data : {};
  } catch {
    problems.push(`${label} could not be read as JSON`);
    return {};
  }
}

/** The folders of `dir` that hold a SKILL.md (a symlinked folder counts: that is how a person shares a skill between projects). */
function skillNames(dir) {
  if (!dir || !existsSync(dir)) return [];
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((e) => (e.isDirectory() || e.isSymbolicLink()) && existsSync(join(dir, e.name, 'SKILL.md')))
      .map((e) => e.name);
  } catch {
    return [];
  }
}

const byName = (a, b) => a.name.localeCompare(b.name) || String(a.scope ?? a.from).localeCompare(String(b.scope ?? b.from));

/** `plugin:skill` as the Skill tool names a plugin's skill; a skill with no plugin is its own bare name. */
export const bareName = (name) => String(name).slice(String(name).lastIndexOf(':') + 1);

/**
 * @param {{ home: string, root: string }} where `home` is the person's home directory ('' to read only the project) and `root` the project.
 * @returns {{ skills: {name: string, from: 'user'|'project'|'plugin'}[], plugins: {name: string, scope: string}[], mcp: {name: string, scope: 'user'|'local'|'project'}[], problems: string[] }}
 */
/**
 * Skills that come with Claude Code itself, with no file on disk to read: listed apart (`builtIn`) so a role one fills can be proposed
 * (first real project, F-T8: `security-review` could only be "none"). Seen in Claude Code 2.1.327's skill list on 2026-11-23; a version
 * without one would still list it here.
 */
export const BUILT_IN_SKILLS = ['security-review'];

export function readInventory({ home = '', root }) {
  const problems = [];
  const inHome = (...parts) => (home ? join(home, ...parts) : null);
  const skills = [];
  const plugins = [];
  const mcp = [];

  skillNames(inHome('.claude/skills')).forEach((name) => skills.push({ name, from: 'user' }));
  skillNames(join(root, '.claude/skills')).forEach((name) => skills.push({ name, from: 'project' }));

  // A plugin counts when it is installed for the person or for this project, and no setting switched it off. The nearest setting wins.
  const enabled = {};
  for (const [file, label] of [[inHome('.claude/settings.json'), 'the user settings'], [join(root, '.claude/settings.json'), 'the project settings'], [join(root, '.claude/settings.local.json'), 'the local project settings']]) {
    const settings = readJson(file, label, problems);
    if (isObject(settings.enabledPlugins)) for (const [key, value] of Object.entries(settings.enabledPlugins)) if (typeof value === 'boolean') enabled[key] = value;
  }
  const installed = readJson(inHome('.claude/plugins/installed_plugins.json'), 'the installed plugins list', problems);
  for (const [key, entries] of Object.entries(isObject(installed.plugins) ? installed.plugins : {})) {
    if (enabled[key] === false) continue;
    const mine = [].concat(entries).find((e) => isObject(e) && (e.scope === 'user' || e.scope === 'managed' || ((e.scope === 'project' || e.scope === 'local') && same(e.projectPath, root))));
    if (!mine) continue;
    const name = key.includes('@') ? key.slice(0, key.indexOf('@')) : key;
    plugins.push({ name, scope: mine.scope });
    if (typeof mine.installPath === 'string') skillNames(join(mine.installPath, 'skills')).forEach((skill) => skills.push({ name: `${name}:${skill}`, from: 'plugin' }));
  }

  // MCP servers: the user's, this project's in the user's file, and the project's own `.mcp.json`. Only the keys are read.
  const claude = readJson(inHome('.claude.json'), 'the user file ~/.claude.json', problems);
  Object.keys(isObject(claude.mcpServers) ? claude.mcpServers : {}).forEach((name) => mcp.push({ name, scope: 'user' }));
  const entry = Object.entries(isObject(claude.projects) ? claude.projects : {}).find(([path]) => same(path, root))?.[1];
  const local = isObject(entry) ? entry : {};
  Object.keys(isObject(local.mcpServers) ? local.mcpServers : {}).forEach((name) => mcp.push({ name, scope: 'local' }));
  const disabled = new Set(Array.isArray(local.disabledMcpjsonServers) ? local.disabledMcpjsonServers : []);
  const shared = readJson(join(root, '.mcp.json'), 'the project file .mcp.json', problems);
  Object.keys(isObject(shared.mcpServers) ? shared.mcpServers : {}).filter((name) => !disabled.has(name)).forEach((name) => mcp.push({ name, scope: 'project' }));

  return { skills: skills.sort(byName), plugins: plugins.sort(byName), mcp: mcp.sort(byName), builtIn: BUILT_IN_SKILLS.map((name) => ({ name, from: 'built-in' })), problems };
}

/** Whether the machine has a tool of this kind with this name; a skill is found by its full name (`plugin:skill`) or its bare one. */
export function hasTool(inventory, kind, name) {
  if (kind === 'skill') return [...inventory.skills, ...(inventory.builtIn ?? [])].some((s) => s.name === name || bareName(s.name) === name);
  if (kind === 'plugin') return inventory.plugins.some((p) => p.name === name);
  if (kind === 'mcp') return inventory.mcp.some((m) => m.name === name);
  return false;
}
