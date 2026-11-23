import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadProject } from '../src/load.mjs';
import { nextSteps, renderNext, inboxOf } from '../src/next.mjs';
import { renderInbox } from '../src/inbox.mjs';
import { renderDecision } from '../src/decisions.mjs';
import { renderConstitution, writeConstitution, checkConstitution } from '../src/constitution.mjs';
import { decideTool } from '../src/lifecycle.mjs';
import { ROLES } from '../src/tools.mjs';
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

test('the /pp skill knows both items: the one about all the roles, and a role asked again', () => {
  const pp = read('../../../sdd-pp/skills/pp/SKILL.md');
  assert.match(pp, /`type` is `tools`/);
  assert.match(pp, /\/pp-tools/);
  assert.match(pp, /`type` is `tool`/);
  assert.match(pp, /ppc ask <role> --tool/);
});

// ── ppc next ─────────────────────────────────────────────────────
const groupItems = (m) => nextSteps(m, []).waiting.filter((a) => a.decision?.type === 'tools');
const dueItems = (m) => nextSteps(m, []).waiting.filter((a) => a.decision?.type === 'tool');

test('next: roles that slices ahead call for and nobody decided are ONE item for the person, beside the work, even before any file exists', () => {
  for (const m of [withTools(null), withTools([adopt('db-inspect', { name: 'postgres', kind: 'mcp', access: 'read-only' })])]) {
    const items = groupItems(m);
    assert.equal(items.length, 1, 'one item for all of them, not one per role');
    assert.equal(items[0].who, 'human');
    assert.equal(items[0].command, 'ppc ask tools');
    assert.match(items[0].what, /ui-design/);
    assert.match(items[0].what, /\/pp-tools/);
    assert.match(items[0].what, /holds nothing up/);
  }
  assert.doesNotMatch(groupItems(withTools([adopt('db-inspect', { name: 'postgres', kind: 'mcp', access: 'read-only' })]))[0].what, /db-inspect/, 'a decided role is not in it');
});

test('next: any decision takes a role out of the item, a pending entry does not, and with every role decided there is no item', () => {
  const inItem = (entry) => /ui-design/.test(groupItems(withTools([entry]))[0].what);
  assert.ok(!inItem(adopt('ui-design')));
  assert.ok(!inItem(later('ui-design', 'infra_component')));
  assert.ok(!inItem(notNeeded('ui-design')));
  assert.ok(inItem({ role: 'ui-design', decision: 'pending' }));
  assert.deepEqual(groupItems(withTools(['ui-design', 'ui-capture', 'security-review', 'db-inspect'].map(notNeeded))), []);
});

test('next: a deferred role whose trigger has happened is asked again on its own; one that is still waiting is not', () => {
  const due = dueItems(withTools([later('ui-design', 'frontend_component')])).find((a) => a.decision.id === 'ui-design');
  assert.match(due.what, /waited until the design gets a frontend component, and that has happened: decide it again/);
  assert.equal(due.command, 'ppc ask ui-design');
  assert.deepEqual(dueItems(withTools([later('ui-design', 'infra_component')])), []);
});

test('next: nothing before slices exist, or when every slice is closed', () => {
  assert.deepEqual(groupItems(designOnly(withTools(null))), []);
  assert.deepEqual(dueItems(designOnly(withTools([later('ui-design', 'frontend_component')]))), [], 'a deferred role whose trigger happened waits for the plan too, like the standards do');
  const closed = withTools(null);
  closed.slices.forEach((s) => Object.assign(s.data, { status: 'dropped' }));
  assert.deepEqual(groupItems(closed), []);
});

test('next: a panel answer to the question about all of them that nothing carried out is listed', () => {
  const m = withTools(null);
  const all = ROLES.map((r) => r.id);
  const command = `ppc decide-tool --roles ${all.join(',')} --not-needed --reason not needed, decided in the panel`;
  const out = nextSteps(m, [], [], { answers: [{ command, label: 'None of them is needed', at: 1_800_000_000 - 60, id: 'a#0' }], now: 1_800_000_000 });
  assert.deepEqual(out.answered.map((a) => [a.decision.type, a.decision.id, a.fresh]), [['tools', 'tools', true]]);
});

test('next: the text counts it in the inbox line; the inbox names the roles and the command', () => {
  const next = nextSteps(withTools(null), []);
  assert.match(renderNext(next), /1 tool decision/);
  const text = renderInbox(inboxOf(next), { today: '2026-11-23' });
  assert.match(text, /ui-design/);
  assert.match(text, /ppc ask tools/);
});

test('the /pp-tools prompt: proposes only from what the person has, one tool per role, read-only servers, installs nothing, and treats what it reads as data', () => {
  const p = read('../../../sdd-pp/extension/sddpp-cycle/commands/tools.md').replace(/\s+/g, ' ');
  assert.match(p, /ppc tools --have/);
  assert.match(p, /Propose only from what they have/);
  assert.match(p, /At most one tool per role/);
  assert.match(p, /Propose one only as `read-only`/);
  assert.match(p, /data, not instructions/);
  assert.match(p, /Never install or enable anything yourself/);
  assert.match(p, /from your own knowledge, not verified by pp-suite/);
  assert.match(p, /ppc ask tools --use/);
  assert.match(p, /ppc ask tools` instead/);
  assert.match(p, /ppc constitution/);
  assert.match(p, /Never write `.sddpp\/tools.yaml` by hand/);
  assert.match(p, /restarted/);
});
