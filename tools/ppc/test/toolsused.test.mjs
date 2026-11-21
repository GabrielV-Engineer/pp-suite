import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadProject } from '../src/load.mjs';
import { validateModel, RULES } from '../src/validate.mjs';
import { decideTool, start, finish, editFrontmatter, LifecycleError } from '../src/lifecycle.mjs';
import { readUses, toolsAccount } from '../src/uses.mjs';
import { EXAMPLE, lines, repo } from './helpers.mjs';

// Was the tool a person chose for a role used in the slice that called for it? The hook records which skills and MCP servers were used
// (`.sddpp/uses.jsonl`, local, never in git); `ppc finish` reads it and writes the answer into the audit, which is versioned. The rule
// reads the audit, never the record: CI runs the validator on machines that have no such record. Never a blocker: the audit says what
// was, and a person reads it. Whether the tool helped is not measured here, only whether it was used.

const fails = (fn, pattern) => assert.throws(fn, (e) => e instanceof LifecycleError && pattern.test(e.message));
const use = (kind, name, slice = 'SL-001') => ({ at: 1_800_000_000, session_id: 'S', tool_use_id: `t_${kind}_${name}`, slice, kind, name });
const record = (dir, entries) => writeFileSync(join(dir, '.sddpp/uses.jsonl'), entries.map((e) => JSON.stringify(e)).join('\n') + '\n');
const FRONTEND = { name: 'frontend-design', kind: 'skill' };

/** The example with these tools adopted (role: tool). */
const withTools = (adopted) => {
  const m = loadProject(EXAMPLE);
  m.tools = { file: '.sddpp/tools.yaml', data: { tools: Object.entries(adopted).map(([role, tool]) => ({ role, decision: 'adopt', tool, decided_by: 'owner', decided_on: '2026-11-01' })) } };
  return m;
};
const slice = (m, id = 'SL-001') => m.slices.find((s) => s.data.id === id).data;

// ── reading the record ───────────────────────────────────────────
test('readUses: the lines the hook wrote, in order, and nothing for a missing file or a line that is not one', (t) => {
  const r = repo(t);
  assert.deepEqual(readUses(r.dir), []);
  writeFileSync(join(r.dir, '.sddpp/uses.jsonl'), `${JSON.stringify(use('skill', 'a1'))}\n\nnot json\n[1]\n"text"\n{"name":"no-kind"}\n{"kind":"skill"}\n{"kind":7,"name":"x1"}\n${JSON.stringify(use('mcp', 'postgres'))}\n`);
  assert.deepEqual(readUses(r.dir).map((e) => [e.kind, e.name]), [['skill', 'a1'], ['mcp', 'postgres']]);
});

// ── what the slice used, for the roles it called for ─────────────
test('toolsAccount: used when the chosen tool appears in the record of this slice, not used when other tools do, unknown when nothing was recorded', () => {
  const m = withTools({ 'ui-design': FRONTEND });
  const sl = slice(m);
  const one = (entries) => toolsAccount(m, sl, entries).find((a) => a.role === 'ui-design');
  assert.deepEqual(one([use('skill', 'frontend-design')]), { role: 'ui-design', tool: 'frontend-design', kind: 'skill', used: true });
  assert.equal(one([use('skill', 'taste-skill')]).used, false);
  assert.equal(one([use('skill', 'pp-build')]).used, false, 'recorded, but not that one');
  assert.equal(one([]).used, null, 'nothing recorded for the slice: the hook may not have been running');
  assert.equal(one([use('skill', 'frontend-design', 'SL-002')]).used, null, 'a use in another slice is no record of this one');
});

test('toolsAccount: a skill is found by its full name or its bare one, a plugin by any skill it brings, an MCP server by its name; each only as its own kind', () => {
  const used = (tool, entries) => toolsAccount(withTools({ 'ui-design': tool }), slice(withTools({})), entries)[0].used;
  assert.equal(used(FRONTEND, [use('skill', 'designer:frontend-design')]), true, 'a plugin skill used by its full name');
  assert.equal(used({ name: 'designer:frontend-design', kind: 'skill' }, [use('skill', 'frontend-design')]), true);
  assert.equal(used({ name: 'designer', kind: 'plugin' }, [use('skill', 'designer:taste')]), true);
  assert.equal(used({ name: 'designer', kind: 'plugin' }, [use('skill', 'other:taste')]), false);
  assert.equal(used({ name: 'designer', kind: 'plugin' }, [use('skill', 'designer')]), false, 'a bare skill of that name is not one of the plugin');
  assert.equal(used({ name: 'postgres', kind: 'mcp', access: 'read-only' }, [use('mcp', 'postgres')]), true);
  assert.equal(used({ name: 'postgres', kind: 'mcp', access: 'read-only' }, [use('skill', 'postgres'), use('mcp', 'figma')]), false);
  assert.equal(used(FRONTEND, [use('mcp', 'frontend-design'), use('skill', 'x1')]), false, 'an MCP server is not a skill');
});

test('toolsAccount: only roles the slice calls for and that have a tool adopted', () => {
  const m = withTools({ 'ui-design': FRONTEND, 'db-inspect': { name: 'postgres', kind: 'mcp', access: 'read-only' } });
  m.tools.data.tools.push({ role: 'security-review', decision: 'not_needed', reason: 'A local prototype', decided_by: 'o', decided_on: '2026-11-01' }, { role: 'ui-capture', decision: 'pending' });
  const roles = (id) => toolsAccount(m, slice(m, id), [use('skill', 'x1')]).map((a) => a.role);
  assert.deepEqual(roles('SL-001'), ['ui-design', 'db-inspect']);
  assert.deepEqual(roles('SL-004'), ['ui-design'], 'SL-004 touches no database component');
  assert.deepEqual(toolsAccount(loadProject(EXAMPLE), slice(loadProject(EXAMPLE)), [use('skill', 'x1')]), [], 'no tools file');
});

// ── the audit ────────────────────────────────────────────────────
/** SL-001 started in the light cycle, with its commit, in a project that adopted these tools on 2026-11-01. */
const built = (t, adopted = { 'ui-design': FRONTEND }) => {
  const r = repo(t);
  r.write({ '.architect/blueprint.yaml': readFileSync(join(r.dir, '.architect/blueprint.yaml'), 'utf8').replace('budgets:', 'default_mode: light\nbudgets:') });
  r.git('add', '-A');
  r.git('commit', '-q', '-m', 'light by default');
  for (const [role, tool] of Object.entries(adopted)) {
    decideTool(r.dir, role, { by: 'Ana', today: '2026-11-01', adopt: tool.name, kind: tool.kind, ...(tool.access ? { access: tool.access } : {}) });
  }
  r.git('add', '-A');
  r.git('commit', '-q', '--allow-empty', '-m', 'tools');
  start(r.dir, 'SL-001');
  const sha = r.commit('build(SL-001): health endpoint and its test', { 'src/health.js': lines(5), 'tests/health.test.js': lines(3) });
  return { r, audit: { commits: [{ sha, kind: 'build' }], tests_added: 1 } };
};
const audited = (dir) => loadProject(dir).slices.find((s) => s.data.id === 'SL-001').data;
const w11 = (dir) => validateModel(loadProject(dir)).filter((f) => f.rule === 'W11');
const errors = (dir) => validateModel(loadProject(dir)).filter((f) => f.severity === 'error');

test('finish: the audit says whether the chosen tool was used, from the record, and the result carries it', (t) => {
  const { r, audit } = built(t);
  record(r.dir, [use('skill', 'pp-build'), use('skill', 'frontend-design')]);
  const done = finish(r.dir, 'SL-001', audit);
  assert.deepEqual(audited(r.dir).audit.tools, [{ role: 'ui-design', tool: 'frontend-design', kind: 'skill', used: true }]);
  assert.deepEqual(done.tools, audited(r.dir).audit.tools);
  assert.deepEqual(errors(r.dir), []);
  assert.deepEqual(w11(r.dir), []);
});

test('finish: a tool that was not used is said so, and with no reason the rule warns; the reason of the agent clears it and is kept', (t) => {
  const first = built(t);
  record(first.r.dir, [use('skill', 'pp-build')]);
  finish(first.r.dir, 'SL-001', first.audit);
  assert.deepEqual(audited(first.r.dir).audit.tools, [{ role: 'ui-design', tool: 'frontend-design', kind: 'skill', used: false }]);
  const warned = w11(first.r.dir);
  assert.equal(warned.length, 1);
  assert.equal(warned[0].severity, 'warning');
  assert.match(warned[0].message, /SL-001.*ui-design.*frontend-design.*not used/);
  const second = built(t);
  record(second.r.dir, [use('skill', 'pp-build')]);
  finish(second.r.dir, 'SL-001', { ...second.audit, tools_unused: [{ role: 'ui-design', reason: 'This slice changed no screen and no style' }] });
  assert.equal(audited(second.r.dir).audit.tools[0].reason, 'This slice changed no screen and no style');
  assert.deepEqual(w11(second.r.dir), []);
  assert.deepEqual(errors(second.r.dir), []);
});

test('finish: with nothing recorded for the slice the answer is unknown, never "not used", and nothing warns', (t) => {
  const { r, audit } = built(t);
  finish(r.dir, 'SL-001', audit);
  assert.deepEqual(audited(r.dir).audit.tools, [{ role: 'ui-design', tool: 'frontend-design', kind: 'skill', used: null }]);
  assert.deepEqual(w11(r.dir), []);
  assert.deepEqual(errors(r.dir), []);
});

test('finish: every role the slice called for that has a tool is in the account, and a project with no tool adopted has no account at all', (t) => {
  const many = built(t, { 'ui-design': FRONTEND, 'db-inspect': { name: 'postgres', kind: 'mcp', access: 'read-only' } });
  record(many.r.dir, [use('mcp', 'postgres')]);
  finish(many.r.dir, 'SL-001', many.audit);
  assert.deepEqual(audited(many.r.dir).audit.tools.map((a) => [a.role, a.used]), [['ui-design', false], ['db-inspect', true]]);
  const none = built(t, {});
  finish(none.r.dir, 'SL-001', none.audit);
  assert.equal(audited(none.r.dir).audit.tools, undefined);
  assert.deepEqual(w11(none.r.dir), []);
});

test('finish: a reason for a tool that was used, for a role it is not about, or too short, is refused before anything changes', (t) => {
  const bad = (record_, tools_unused, pattern) => {
    const { r, audit } = built(t);
    record(r.dir, record_);
    fails(() => finish(r.dir, 'SL-001', { ...audit, tools_unused }), pattern);
    assert.equal(audited(r.dir).status, 'in_progress');
  };
  const notUsed = [use('skill', 'pp-build')];
  const oneLine = /needs "reason", one line of at least 5 characters/;
  bad(notUsed, 'no reason', /"tools_unused" is a list/);
  bad(notUsed, [{ role: 'ui-design', reason: 'no' }], oneLine);
  bad(notUsed, [{ role: 'ui-design' }], oneLine);
  bad(notUsed, [{ reason: 'A reason without a role' }], /needs "role"/);
  bad(notUsed, [{ role: 'db-inspect', reason: 'Not part of this slice at all' }], /db-inspect/);
  bad([use('skill', 'frontend-design')], [{ role: 'ui-design', reason: 'It was used, though' }], /ui-design.*was used|not an unused/);
  bad(notUsed, [{ role: 'ui-design', reason: 'A reason' + '\n' + 'with a line break' }], oneLine);
});

// ── the rule ─────────────────────────────────────────────────────
test('W11: a slice closed after a tool was adopted for a role it called for, with no account of it, is a warning; before the decision it is not', (t) => {
  const { r, audit } = built(t);
  finish(r.dir, 'SL-001', audit);
  editFrontmatter(r.dir, '.sddpp/slices/SL-001-deployable-skeleton.md', (doc) => doc.deleteIn(['audit', 'tools']));
  const missing = w11(r.dir);
  assert.equal(missing.length, 1);
  assert.match(missing[0].message, /SL-001.*frontend-design.*ui-design.*no account/);
  // decided after the slice closed: the slice owes nothing
  const late = loadProject(r.dir);
  late.tools.data.tools[0].decided_on = '2099-01-01';
  assert.deepEqual(validateModel(late).filter((f) => f.rule === 'W11'), []);
});

test('W11: it is a warning in RULES, and the validator never reads the record of uses', (t) => {
  assert.ok('W11' in RULES);
  const { r, audit } = built(t);
  record(r.dir, [use('skill', 'frontend-design')]);
  finish(r.dir, 'SL-001', audit);
  rmSync(join(r.dir, '.sddpp/uses.jsonl'));
  assert.deepEqual(w11(r.dir), [], 'the account is in the audit; without the local record the project is judged the same');
});

test('SCHEMA: an account entry has a role, a tool, a kind and used as true, false or null; a reason only goes with false', (t) => {
  const { r, audit } = built(t);
  finish(r.dir, 'SL-001', audit);
  const m = loadProject(r.dir);
  const bad = (entry) => {
    const copy = structuredClone(m);
    copy.slices.find((s) => s.data.id === 'SL-001').data.audit.tools = [entry];
    return validateModel(copy).some((f) => f.rule === 'SCHEMA' && /SL-001/.test(f.file));
  };
  const base = { role: 'ui-design', tool: 'frontend-design', kind: 'skill', used: true };
  assert.ok(!bad(base));
  assert.ok(!bad({ ...base, used: null }));
  assert.ok(!bad({ ...base, used: false, reason: 'No screen changed here' }));
  assert.ok(bad({ ...base, used: 'yes' }));
  assert.ok(bad({ ...base, kind: 'extension' }));
  assert.ok(bad({ ...base, surprise: 1 }));
  assert.ok(bad({ role: 'ui-design', tool: 'frontend-design', kind: 'skill' }), 'used is required');
  assert.ok(bad({ ...base, used: false, reason: 'no' }), 'a reason has some length');
});

// ── the prompt ───────────────────────────────────────────────────
test('the audit prompt says that ppc records whether the tool was used, and that the reason for not using it is the agent\'s', () => {
  const p = readFileSync(fileURLToPath(new URL('../../../sdd-pp/extension/sddpp-cycle/commands/audit.md', import.meta.url)), 'utf8').replace(/\s+/g, ' ');
  assert.match(p, /"tools_unused"/);
  assert.match(p, /ppc records whether/);
  assert.match(p, /do not write `tools`/);
});

// ── the hook and ppc agree ───────────────────────────────────────
test('what the Python hook writes is what ppc reads (Node and Python agree)', (t) => {
  const { r, audit } = built(t, { 'ui-design': FRONTEND, 'db-inspect': { name: 'postgres', kind: 'mcp', access: 'read-only' } });
  const scripts = fileURLToPath(new URL('../../../sdd-pp/extension/sddpp-guard/scripts/python/', import.meta.url));
  const hook = (payload) => spawnSync('python3', ['-I', join(scripts, 'record_answer.py')], { input: JSON.stringify(payload), encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: r.dir }, cwd: r.dir });
  writeFileSync(join(r.dir, '.sddpp/active.json'), JSON.stringify({ slice: 'SL-001', phase: 'build' }));
  const call = (tool_name, tool_input, extra = {}) => ({ hook_event_name: 'PostToolUse', tool_name, tool_input, tool_response: {}, session_id: 'S1', tool_use_id: `toolu_${tool_name}`, ...extra });
  assert.equal(hook(call('Skill', { skill: 'designer:frontend-design' })).status, 0);
  assert.equal(hook(call('mcp__postgres__query', { sql: 'select 1' }, { mcp_server: { name: 'postgres', source: 'user' } })).status, 0);
  assert.deepEqual(readUses(r.dir).map((e) => [e.kind, e.name, e.slice]), [['skill', 'designer:frontend-design', 'SL-001'], ['mcp', 'postgres', 'SL-001']]);
  finish(r.dir, 'SL-001', audit);
  assert.deepEqual(audited(r.dir).audit.tools.map((a) => [a.role, a.used]), [['ui-design', true], ['db-inspect', true]]);
});
