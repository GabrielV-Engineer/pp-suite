import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadProject } from '../src/load.mjs';
import { validateModel, RULES } from '../src/validate.mjs';
import { ROLES, TRIGGERS, rolesFor, roleFacts } from '../src/tools.mjs';
import { EXAMPLE } from './helpers.mjs';

// `.sddpp/tools.yaml`: which tool (a skill, a plugin or an MCP server) a person chose for a role in this project. See docs/tools.md.
// The file is optional: a project without it gets no finding. The validator reads files, never the machine, so whether a tool is
// installed here is not judged by any rule (CI would fail on every machine but the person's own).

const by = { decided_by: 'owner', decided_on: '2026-11-21' };
const adopt = (role, tool = { name: 'frontend-design', kind: 'skill' }) => ({ role, decision: 'adopt', tool, ...by });
const later = (role, trigger) => ({ role, decision: 'later', trigger, ...by });
const notNeeded = (role) => ({ role, decision: 'not_needed', reason: 'A command-line tool, nothing to look at', ...by });

/** The example with this tools file (null: no file), and, optionally, other standards. */
const withTools = (list, { standards } = {}) => {
  const m = loadProject(EXAMPLE);
  m.tools = list === null ? null : { file: '.sddpp/tools.yaml', data: { tools: list } };
  if (standards) m.standards = { file: '.sddpp/standards.yaml', data: { standards } };
  return m;
};
const run = (m) => {
  const found = validateModel(m);
  for (const f of found) assert.ok(f.rule in RULES, `rule ${f.rule} is not in RULES`);
  return found;
};
const has = (found, rule, severity) => found.some((f) => f.rule === rule && (!severity || f.severity === severity));
const ofRule = (found, rule) => found.filter((f) => f.rule === rule);
const file = (found) => found.filter((f) => f.file === '.sddpp/tools.yaml');

// ── no file ──────────────────────────────────────────────────────
test('tools: a project without the file gets no finding about tools, and the example still has no warnings in strict mode', () => {
  const found = run(withTools(null));
  assert.deepEqual(found.filter((f) => /^K\d/.test(f.rule)), []);
});

// ── the file and its schema ──────────────────────────────────────
test('tools: decided roles add no findings', () => {
  const found = run(withTools([adopt('ui-design'), later('db-inspect', 'infra_component'), notNeeded('ui-capture'), notNeeded('security-review')]));
  assert.deepEqual(file(found), []);
});

test('SCHEMA: each entry carries what it needs', () => {
  const bad = (entry) => has(run(withTools([entry])), 'SCHEMA', 'error');
  assert.ok(bad({ ...adopt('ui-design'), tool: undefined }), 'adopt needs a tool');
  assert.ok(bad({ ...later('ui-design', 'frontend_component'), tool: { name: 'x1', kind: 'skill' } }), 'only an adopted role has a tool');
  assert.ok(bad({ role: 'ui-design', decision: 'later', ...by }), 'later needs a trigger');
  assert.ok(bad({ ...later('ui-design', 'the_moon') }), 'a trigger that does not exist');
  assert.ok(bad({ role: 'ui-design', decision: 'not_needed', ...by }), 'not needed needs a reason');
  assert.ok(bad({ ...adopt('ui-design'), decided_by: undefined }), 'a decision says who made it');
  assert.ok(bad({ ...adopt('ui-design'), decided_on: 'yesterday' }), 'a decision has a date');
  assert.ok(bad({ ...adopt('ui-design'), surprise: 1 }), 'unknown fields are rejected');
  assert.ok(bad(adopt('ui-design', { name: 'x', kind: 'skill' })), 'a name is at least two characters');
  assert.ok(bad(adopt('ui-design', { name: 'a b', kind: 'skill' })), 'a name has no spaces');
  assert.ok(bad(adopt('ui-design', { name: 'frontend-design', kind: 'extension' })), 'a kind that does not exist');
  assert.ok(!bad(adopt('ui-design', { name: 'example:frontend-design', kind: 'skill', source: 'https://github.com/example/skills', pinned: '0123456789abcdef0123456789abcdef01234567' })), 'a plugin skill with its source and pinned commit is fine');
});

test('SCHEMA: an MCP server says what it may do, and one that may change things says why', () => {
  const bad = (tool) => has(run(withTools([adopt('db-inspect', tool)])), 'SCHEMA', 'error');
  assert.ok(bad({ name: 'postgres', kind: 'mcp' }), 'an MCP server needs its access');
  assert.ok(bad({ name: 'postgres', kind: 'mcp', access: 'everything' }), 'an access that does not exist');
  assert.ok(bad({ name: 'postgres', kind: 'mcp', access: 'read-write' }), 'read-write needs a reason');
  assert.ok(bad({ name: 'postgres', kind: 'mcp', access: 'read-only', access_reason: 'it reads' }), 'a reason belongs to read-write only');
  assert.ok(bad({ name: 'a-skill', kind: 'skill', access: 'read-only' }), 'only an MCP server has an access');
  assert.ok(!bad({ name: 'postgres', kind: 'mcp', access: 'read-only' }));
  assert.ok(!bad({ name: 'postgres', kind: 'mcp', access: 'read-write', access_reason: 'The slice runs the migrations itself' }));
});

// ── K01: roles ───────────────────────────────────────────────────
test('K01: a role pp-suite does not know, or one listed twice, is an error', () => {
  const unknown = run(withTools([adopt('make-coffee')]));
  assert.ok(has(unknown, 'K01', 'error'));
  assert.match(ofRule(unknown, 'K01')[0].message, /make-coffee/);
  assert.match(ofRule(unknown, 'K01')[0].message, /ui-design/, 'it says which roles exist');
  assert.ok(has(run(withTools([adopt('ui-design'), notNeeded('ui-design')])), 'K01', 'error'));
  assert.ok(!has(run(withTools(ROLES.map((r) => notNeeded(r.id)))), 'K01'));
});

// ── K02: a deferred role whose trigger happened ──────────────────
test('K02: later with a trigger that has now happened is a warning; one that has not is silent', () => {
  const fired = run(withTools([later('ui-design', 'frontend_component')]));
  assert.ok(has(fired, 'K02', 'warning'));
  assert.match(ofRule(fired, 'K02')[0].message, /ui-design/);
  assert.ok(!has(run(withTools([later('ui-design', 'infra_component')])), 'K02'), 'the example has no infra component');
  assert.ok(!has(run(withTools([adopt('ui-design')])), 'K02'), 'only a role decided later waits for a trigger');
  assert.deepEqual(Object.keys(TRIGGERS).sort(), ['backend_component', 'database_component', 'frontend_component', 'infra_component']);
});

// ── K03: a role that applies to the slices ahead and has no decision ──
test('K03: once the file exists, a role that applies to a slice not yet closed and has no decision is one warning that names the slices', () => {
  const found = run(withTools([adopt('db-inspect', { name: 'postgres', kind: 'mcp', access: 'read-only' })]));
  const k03 = ofRule(found, 'K03');
  assert.ok(k03.length >= 1 && k03.every((f) => f.severity === 'warning'));
  const ui = k03.filter((f) => /ui-design/.test(f.message));
  assert.equal(ui.length, 1, 'one line per role, not one per slice');
  assert.match(ui[0].message, /SL-001/);
  assert.match(ui[0].message, /SL-008/, 'the refactor slice touches a frontend component too');
  assert.ok(!k03.some((f) => /db-inspect/.test(f.message)), 'decided roles are silent');
});

test('K03: a decision of any kind silences it, a pending one does not', () => {
  const silent = (entry) => !run(withTools([entry])).some((f) => f.rule === 'K03' && /ui-design/.test(f.message));
  assert.ok(silent(adopt('ui-design')));
  assert.ok(silent(later('ui-design', 'infra_component')));
  assert.ok(silent(notNeeded('ui-design')));
  assert.ok(!silent({ role: 'ui-design', decision: 'pending' }), 'pending is not a decision');
});

test('K03: only the slices that are not closed count, and only the roles whose signals match', () => {
  const m = withTools([notNeeded('ui-capture')]);
  // closed for real: a slice that is `done` without its audit fails the schema and the validator drops it before any rule looks at it,
  // which would make this check pass for the wrong reason. A spike needs only a timebox, who approved it and what it learned.
  m.slices.forEach((s) => Object.assign(s.data, { status: 'done', type: 'spike', timebox_hours: 4, disposable: true, approved_by: 'owner', outcome: 'It can be done in an afternoon.' }));
  const closed = run(m);
  assert.ok(!closed.some((f) => f.rule === 'SCHEMA' && /slice/.test(f.file)), 'the closed slices are valid, so they reach the rule');
  assert.ok(!has(closed, 'K03'), 'every slice is closed');

  const message = (found, role) => ofRule(found, 'K03').find((f) => f.message.startsWith(role))?.message;
  const dbRole = message(run(withTools([notNeeded('ui-capture')])), 'db-inspect');
  assert.match(dbRole, /SL-001/);
  assert.ok(!dbRole.includes('SL-004'), 'SL-004 touches no database component');

  const secure = { id: 'security', decision: 'adopt', choice: 'basic', ...by };
  const notYet = { id: 'security', decision: 'later', trigger: 'backend_component', ...by };
  assert.ok(message(run(withTools([notNeeded('ui-capture')], { standards: [secure] })), 'security-review'), 'it applies once security is adopted');
  assert.equal(message(run(withTools([notNeeded('ui-capture')], { standards: [notYet] })), 'security-review'), undefined, 'a standard that waits does not call for a review');
  assert.equal(message(run(withTools([notNeeded('ui-capture')], { standards: [] })), 'security-review'), undefined, 'no standard, no role');
});

// ── the signals, on their own ────────────────────────────────────
test('roles apply by what a slice touches: component kinds, screens, and an adopted standard', () => {
  const ids = (facts) => rolesFor(facts).map((r) => r.id).sort();
  const none = { kinds: new Set(), screens: [], standards: [] };
  assert.deepEqual(ids(none), []);
  assert.deepEqual(ids({ ...none, kinds: new Set(['frontend']) }), ['ui-design']);
  assert.deepEqual(ids({ ...none, screens: ['SCR-01'] }), ['ui-capture', 'ui-design']);
  assert.deepEqual(ids({ ...none, kinds: new Set(['database']) }), ['db-inspect']);
  assert.deepEqual(ids({ ...none, kinds: new Set(['backend']) }), [], 'security-review needs the standard');
  const secure = [{ id: 'security', decision: 'adopt', choice: 'basic' }];
  assert.deepEqual(ids({ ...none, kinds: new Set(['backend']), standards: secure }), ['security-review']);
  assert.deepEqual(ids({ ...none, kinds: new Set(['database']), standards: secure }), ['db-inspect', 'security-review']);
  assert.deepEqual(ids({ ...none, kinds: new Set(['library']), standards: secure }), [], 'a library has no backend or database to review');
  const later = [{ id: 'security', decision: 'later', trigger: 'backend_component' }];
  assert.deepEqual(ids({ ...none, kinds: new Set(['backend']), standards: later }), [], 'only an adopted standard counts');
  for (const r of ROLES) assert.ok(r.id && r.title && r.why && typeof r.applies === 'function', r.id);
});

test('roleFacts: what a slice touches, read from the design, the slice and the standards', () => {
  const m = loadProject(EXAMPLE);
  const sl = m.slices.find((s) => s.data.id === 'SL-004').data;
  const facts = roleFacts(m, sl);
  assert.deepEqual([...facts.kinds].sort(), ['backend', 'frontend']);
  assert.deepEqual(facts.screens, ['SCR-01']);
  assert.ok(Array.isArray(facts.standards));
});

// ── loading ──────────────────────────────────────────────────────
test('loadProject: reads .sddpp/tools.yaml, and says so when it is not valid YAML', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'ppc-tools-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  cpSync(EXAMPLE, dir, { recursive: true });
  assert.equal(loadProject(dir).tools, null);
  writeFileSync(join(dir, '.sddpp/tools.yaml'), 'tools:\n  - role: ui-design\n    decision: not_needed\n    reason: Nothing to look at here\n    decided_by: owner\n    decided_on: 2026-11-21\n');
  const m = loadProject(dir);
  assert.equal(m.tools.file, '.sddpp/tools.yaml');
  assert.equal(m.tools.data.tools[0].role, 'ui-design');
  mkdirSync(join(dir, '.sddpp'), { recursive: true });
  writeFileSync(join(dir, '.sddpp/tools.yaml'), 'tools: [unclosed');
  assert.ok(loadProject(dir).errors.some((e) => e.rule === 'PARSE' && e.file === '.sddpp/tools.yaml'));
});
