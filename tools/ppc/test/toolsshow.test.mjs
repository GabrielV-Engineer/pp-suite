import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadProject } from '../src/load.mjs';
import { decideTool } from '../src/lifecycle.mjs';
import { renderTools } from '../src/tools.mjs';
import { CLI, repo } from './helpers.mjs';

// `ppc tools`: the roles, what a person decided for each, which slices not yet closed call for it, and, only when the machine was
// looked at, whether a chosen tool is on it. What the machine has is information; it never decides anything.

const line = (text, role) => text.split('\n').find((l) => l.startsWith(role) || l.trim().startsWith(role));
const inventory = (over = {}) => ({ skills: [], plugins: [], mcp: [], problems: [], ...over });

test('tools: with no file every role says it has no decision and which slices call for it', (t) => {
  const text = renderTools(loadProject(repo(t).dir));
  for (const role of ['ui-design', 'ui-capture', 'security-review', 'db-inspect']) assert.match(text, new RegExp(role));
  assert.match(line(text, 'ui-design'), /no decision/);
  assert.match(text, /SL-001/);
  assert.match(text, /does not exist yet|no file/i);
});

test('tools: each kind of decision is shown in words', (t) => {
  const r = repo(t);
  decideTool(r.dir, 'ui-design', { by: 'Ana', adopt: 'frontend-design', kind: 'skill' });
  decideTool(r.dir, 'ui-capture', { by: 'Ana', notNeeded: true, reason: 'Nothing to look at yet' });
  decideTool(r.dir, 'db-inspect', { by: 'Ana', later: true, trigger: 'infra_component' });
  decideTool(r.dir, 'security-review', { by: 'Ana', adopt: 'sec-mcp', kind: 'mcp', access: 'read-write', accessReason: 'It files the findings itself' });
  const text = renderTools(loadProject(r.dir));
  assert.match(line(text, 'ui-design'), /frontend-design \(skill\)/);
  assert.match(line(text, 'ui-capture'), /not needed: Nothing to look at yet/);
  assert.match(line(text, 'db-inspect'), /later, when the design gets an infrastructure component/);
  assert.match(line(text, 'security-review'), /sec-mcp \(mcp, read-write\)/);
  assert.doesNotMatch(line(text, 'ui-design'), /no decision/);
});

test('tools: only slices not yet closed are named, a long list is cut, and a role no slice calls for says so', (t) => {
  const m = loadProject(repo(t).dir);
  assert.match(line(renderTools(m), 'db-inspect'), /SL-001/);
  assert.doesNotMatch(line(renderTools(m), 'db-inspect'), /SL-004/, 'SL-004 touches no database component');
  m.slices.forEach((s) => Object.assign(s.data, { status: 'dropped' }));
  assert.match(line(renderTools(m), 'ui-design'), /no slice calls for it/);
  const many = loadProject(repo(t).dir);
  const cut = line(renderTools(many), 'ui-design');
  assert.match(cut, /SL-006 and 2 more/);
  assert.doesNotMatch(cut, /SL-007/, 'six are named, the rest are counted');
});

test('tools: whether a chosen tool is on this machine is said only when the machine was looked at', (t) => {
  const r = repo(t);
  decideTool(r.dir, 'ui-design', { by: 'Ana', adopt: 'frontend-design', kind: 'skill' });
  decideTool(r.dir, 'db-inspect', { by: 'Ana', adopt: 'postgres', kind: 'mcp', access: 'read-only' });
  const m = loadProject(r.dir);
  const unlooked = renderTools(m);
  assert.doesNotMatch(unlooked, /on this machine|not found/);
  const looked = renderTools(m, inventory({ skills: [{ name: 'frontend-design', from: 'user' }] }));
  assert.match(line(looked, 'ui-design'), /on this machine/);
  assert.match(line(looked, 'db-inspect'), /not found on this machine/);
  assert.match(looked, /restart/i, 'it says what to do about a tool that is missing');
});

test('CLI: ppc tools prints it, looks in the person\'s home, and needs a design', (t) => {
  const r = repo(t);
  const home = mkdtempSync(join(tmpdir(), 'ppc-home-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  decideTool(r.dir, 'ui-design', { by: 'Ana', adopt: 'frontend-design', kind: 'skill' });
  const run = (dir, h) => spawnSync('node', [CLI, 'tools', dir], { encoding: 'utf8', env: { ...process.env, HOME: h } });
  const missing = run(r.dir, home);
  assert.equal(missing.status, 0, missing.stderr);
  assert.match(line(missing.stdout, 'ui-design'), /not found on this machine/);
  mkdirSync(join(home, '.claude/skills/frontend-design'), { recursive: true });
  writeFileSync(join(home, '.claude/skills/frontend-design/SKILL.md'), '---\nname: frontend-design\n---\n');
  assert.match(line(run(r.dir, home).stdout, 'ui-design'), /on this machine/);
  const bare = mkdtempSync(join(tmpdir(), 'ppc-bare-'));
  t.after(() => rmSync(bare, { recursive: true, force: true }));
  const none = run(bare, home);
  assert.equal(none.status, 1);
  assert.match(none.stderr, /design/);
});
