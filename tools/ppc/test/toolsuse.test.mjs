import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadProject } from '../src/load.mjs';
import { nextSteps, renderNext } from '../src/next.mjs';
import { renderDecision } from '../src/decisions.mjs';
import { renderConstitution, writeConstitution, checkConstitution } from '../src/constitution.mjs';
import { decideTool } from '../src/lifecycle.mjs';
import { EXAMPLE, repo } from './helpers.mjs';

// The tools a person chose are read by the rest of the flow, where the work happens: a decision nobody reads is the problem this
// feature exists to solve ("I forget to ask for the skill"). Three places: the slice's card, the rules and the build prompt every
// session reads, and `ppc next`. Nothing here asks whether a tool is installed: that is the machine's, and `ppc tools` says it.

const by = { decided_by: 'owner', decided_on: '2026-11-21' };
const adopt = (role, tool = { name: 'frontend-design', kind: 'skill' }) => ({ role, decision: 'adopt', tool, ...by });
const later = (role, trigger) => ({ role, decision: 'later', trigger, ...by });
const notNeeded = (role) => ({ role, decision: 'not_needed', reason: 'Nothing to look at here', ...by });
const withTools = (list) => {
  const m = loadProject(EXAMPLE);
  m.tools = list === null ? null : { file: '.sddpp/tools.yaml', data: { tools: list } };
  return m;
};
/** The design alone, as before planning. */
const designOnly = (m) => Object.assign(m, { slices: [], debt: [], changeRequests: [] });
const toolItems = (m) => nextSteps(m, []).waiting.filter((a) => a.decision?.type === 'tool');
const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

// ── the card ─────────────────────────────────────────────────────
test('card: the roles a slice calls for, with the tool the person chose for each', () => {
  const card = renderDecision(withTools([adopt('ui-design'), adopt('db-inspect', { name: 'postgres', kind: 'mcp', access: 'read-only' })]), 'SL-001');
  assert.match(card, /Tools/);
  assert.match(card, /ui-design .*use frontend-design \(skill\)/);
  assert.match(card, /db-inspect .*use postgres \(mcp, read-only\)/);
});

test('card: a role the slice does not call for is not listed; one with no decision, or a decision not to, says so', () => {
  const m = withTools([later('ui-capture', 'infra_component'), notNeeded('security-review')]);
  const sl1 = renderDecision(m, 'SL-001');
  assert.match(sl1, /ui-design .*no decision yet/);
  assert.match(sl1, /ui-capture .*deferred until the design gets an infrastructure component/);
  assert.match(sl1, /security-review .*not needed \(Nothing to look at here\)/);
  const sl4 = renderDecision(m, 'SL-004');
  assert.doesNotMatch(sl4, /db-inspect/, 'SL-004 touches no database component');
});

test('card: a pending entry is no decision, and a project with no tools file shows no Tools row at all', () => {
  assert.match(renderDecision(withTools([{ role: 'ui-design', decision: 'pending' }]), 'SL-001'), /ui-design .*no decision yet/);
  assert.doesNotMatch(renderDecision(withTools(null), 'SL-001'), /Tools/);
});

// ── the rules every session reads ────────────────────────────────
test('constitution: one line names the tools the person adopted, and nothing else about tools', () => {
  const out = renderConstitution(withTools([adopt('ui-design'), adopt('db-inspect', { name: 'postgres', kind: 'mcp', access: 'read-only' }), later('ui-capture', 'infra_component'), notNeeded('security-review')]));
  const line = out.split('\n').find((l) => l.startsWith('- Tools'));
  assert.ok(line, out);
  assert.match(line, /ui-design frontend-design/);
  assert.match(line, /db-inspect postgres \(mcp, read-only\)/);
  assert.doesNotMatch(line, /ui-capture|security-review/, 'only an adopted tool is named');
  assert.ok(out.length < 2200, `the block is ${out.length} characters`);
});

test('constitution: no line without an adopted tool, and the block is stale after one is decided until it is written again', (t) => {
  assert.ok(!renderConstitution(withTools(null)).includes('- Tools'));
  assert.ok(!renderConstitution(withTools([notNeeded('ui-design')])).includes('- Tools'));
  const r = repo(t);
  writeConstitution(r.dir);
  assert.deepEqual(checkConstitution(r.dir), []);
  decideTool(r.dir, 'ui-design', { by: 'Ana', adopt: 'frontend-design', kind: 'skill' });
  assert.match(checkConstitution(r.dir).join(), /out of date/, 'the rules block no longer says what the project chose');
  writeConstitution(r.dir);
  assert.deepEqual(checkConstitution(r.dir), []);
});

test('decide-tool says that the rules block is written again with `ppc constitution`', (t) => {
  const r = repo(t);
  assert.match(decideTool(r.dir, 'ui-design', { by: 'Ana', adopt: 'frontend-design', kind: 'skill' }).text, /ppc constitution/);
});

// ── the build prompt and the /pp skill ───────────────────────────
test('the build prompt tells the agent to use the chosen tool, never to pick one, and to respect an MCP server\'s access', () => {
  const build = read('../../../sdd-pp/extension/sddpp-cycle/commands/build.md');
  assert.match(build, /\*\*Tools\.\*\*/);
  assert.match(build, /under "Tools"/);
  assert.match(build, /Skill tool/);
  assert.match(build, /not choose a tool yourself/i);
  assert.match(build, /access/);
});

test('the /pp skill knows what an item of type tool is', () => {
  const pp = read('../../../sdd-pp/skills/pp/SKILL.md');
  assert.match(pp, /`type` is `tool`/);
  assert.match(pp, /ppc ask <role> --tool/);
});

// ── ppc next ─────────────────────────────────────────────────────
test('next: once the file exists, a role that slices ahead call for and nobody decided is the person\'s, beside the work', () => {
  const items = toolItems(withTools([adopt('db-inspect', { name: 'postgres', kind: 'mcp', access: 'read-only' })]));
  assert.ok(items.length >= 1);
  const ui = items.find((a) => a.decision.id === 'ui-design');
  assert.equal(ui.who, 'human');
  assert.equal(ui.command, 'ppc ask ui-design');
  assert.match(ui.what, /SL-001/);
  assert.match(ui.what, /holds nothing up/);
  assert.ok(!items.some((a) => a.decision.id === 'db-inspect'), 'a decided role is not asked again');
});

test('next: any decision silences it, a pending entry does not', () => {
  const silent = (entry) => !toolItems(withTools([entry])).some((a) => a.decision.id === 'ui-design');
  assert.ok(silent(adopt('ui-design')));
  assert.ok(silent(later('ui-design', 'infra_component')));
  assert.ok(silent(notNeeded('ui-design')));
  assert.ok(!silent({ role: 'ui-design', decision: 'pending' }));
});

test('next: a deferred role whose trigger has happened is asked again; one that is still waiting is not', () => {
  const due = toolItems(withTools([later('ui-design', 'frontend_component')])).find((a) => a.decision.id === 'ui-design');
  assert.match(due.what, /waited until the design gets a frontend component, and that has happened: decide it again/);
  assert.ok(!toolItems(withTools([later('ui-design', 'infra_component')])).some((a) => a.decision.id === 'ui-design'));
});

test('next: nothing without the file (a project that never opted in), before slices exist, or when every slice is closed', () => {
  assert.deepEqual(toolItems(withTools(null)), []);
  assert.deepEqual(toolItems(designOnly(withTools([adopt('db-inspect', { name: 'postgres', kind: 'mcp', access: 'read-only' })]))), []);
  assert.deepEqual(toolItems(designOnly(withTools([later('ui-design', 'frontend_component')]))), [], 'a deferred role whose trigger happened waits for the plan too, like the standards do');
  const closed = withTools([notNeeded('ui-capture')]);
  closed.slices.forEach((s) => Object.assign(s.data, { status: 'dropped' }));
  assert.deepEqual(toolItems(closed), []);
});

test('next: the question for the item is the role\'s own, and a panel answer to it that nothing carried out is listed', () => {
  const m = withTools([adopt('db-inspect', { name: 'postgres', kind: 'mcp', access: 'read-only' })]);
  const command = 'ppc decide-tool ui-design --not-needed --reason not needed, decided in the panel';
  const out = nextSteps(m, [], [], { answers: [{ command, label: 'Not needed — ppc decide-tool ui-design --not-needed --reason "not needed, decided in the panel"', at: 1_800_000_000 - 60, id: 'a#0' }], now: 1_800_000_000 });
  assert.deepEqual(out.answered.map((a) => [a.decision.type, a.decision.id, a.fresh]), [['tool', 'ui-design', true]]);
});

test('next: the text names the role and the command', () => {
  const text = renderNext(nextSteps(withTools([adopt('db-inspect', { name: 'postgres', kind: 'mcp', access: 'read-only' })]), []));
  assert.match(text, /ui-design/);
  assert.match(text, /ppc ask ui-design/);
});
