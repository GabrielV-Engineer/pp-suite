import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { loadProject } from '../src/load.mjs';
import { validateModel } from '../src/validate.mjs';
import { nextSteps } from '../src/next.mjs';
import { renderDecision } from '../src/decisions.mjs';
import { renderConstitution, writeConstitution, checkConstitution } from '../src/constitution.mjs';
import { decideStandard } from '../src/lifecycle.mjs';
import { EXAMPLE, repo } from './helpers.mjs';

// The standards are read by the rest of the flow: a decision nobody reads is decoration (docs/standards.md, "Who reads each decision").

const base = () => loadProject(EXAMPLE);
const errorsOf = (m) => validateModel(m).filter((f) => f.severity === 'error');
const set = (m, list) => {
  m.standards = list === null ? null : { file: '.sddpp/standards.yaml', data: { standards: list } };
  m.facts = { gitRemote: null, ciConfig: [] };
  return m;
};
/** The design alone, as before planning: no slices, and nothing that points at them. */
const designOnly = (m) => Object.assign(m, { slices: [], debt: [], changeRequests: [] });
const answer = (id, over) => ({ id, decided_by: 'owner', decided_on: '2026-11-19', ...over });
const example = () => base().standards.data.standards;
const replace = (m, id, over) => set(m, example().map((s) => (s.id === id ? answer(id, over) : s)));

// ── the constitution ─────────────────────────────────────────────
test('constitution: one line names the adopted standards, and the block stays short', () => {
  const out = renderConstitution(base());
  const line = out.split('\n').find((l) => l.startsWith('- Standards'));
  assert.ok(line, out);
  assert.match(line, /security basic, git trunk, ci local/);
  assert.ok(!/observability/.test(line), 'a standard that is not needed is not listed');
  assert.ok(out.length < 2000, `the block is ${out.length} characters`);
  assert.ok(out.split('\n').length < 20);
});

test('constitution: no line without adopted standards; a custom one is named, and the longest choices still fit', () => {
  assert.ok(!renderConstitution(set(base(), null)).includes('- Standards'));
  const custom = replace(base(), 'ci', { decision: 'adopt', choice: 'custom', details: 'Jenkins runs ppc on every merge' });
  assert.match(renderConstitution(custom), /ci custom\b/);
  assert.ok(!renderConstitution(custom).includes('Jenkins'), 'the person\'s words stay in the file, the card and ppc standards');
  const longest = { security: 'strict', observability: 'logs-metrics', git: 'branch-per-slice-pr', ci: 'custom' };
  const all = set(base(), Object.entries(longest).map(([id, choice]) => answer(id, { decision: 'adopt', choice, ...(choice === 'custom' ? { details: 'x'.repeat(500) } : {}) })));
  assert.ok(renderConstitution(all).length < 2000, `the longest choices still fit: ${renderConstitution(all).length}`);
});

test('constitution: deciding a standard makes the block out of date until ppc constitution runs again', (t) => {
  const { dir } = repo(t);
  writeConstitution(dir);
  assert.deepEqual(checkConstitution(dir), []);
  decideStandard(dir, 'git', { adopt: 'branch-per-slice', by: 'owner', today: '2026-11-19' });
  assert.match(checkConstitution(dir).join(), /out of date/);
  writeConstitution(dir);
  assert.deepEqual(checkConstitution(dir), []);
});

// ── the slice card ───────────────────────────────────────────────
test('slice card: the standards that apply to the slice\'s components', () => {
  const card = renderDecision(base(), 'SL-002');
  assert.match(card, /Standards:/);
  assert.match(card, /security basic/);
  assert.ok(!/git trunk/.test(card), 'trunk asks nothing of a slice');
  const branches = renderDecision(replace(base(), 'git', { decision: 'adopt', choice: 'branch-per-slice' }), 'SL-002');
  assert.match(branches, /git branch-per-slice/);
});

test('slice card: no standards row when none applies', () => {
  assert.ok(!renderDecision(set(base(), null), 'SL-002').includes('Standards:'));
  const m = base();
  m.slices.find((s) => s.data.id === 'SL-002').data.components = ['frontend'];
  const onScreen = renderDecision(m, 'SL-002');
  assert.match(onScreen, /experience review/, 'a person meets the frontend');
  assert.ok(!/security/.test(onScreen), 'security is about the backend and the database');
  const noExperience = replace(m, 'experience', { decision: 'not_needed', reason: 'Nothing here is used by a person' });
  assert.ok(!renderDecision(noExperience, 'SL-002').includes('Standards:'));
});

// ── ppc next ─────────────────────────────────────────────────────
test('next: before planning, undecided standards are the person\'s turn, after the additions and before the plan', () => {
  const m = designOnly(set(base(), null));
  const r = nextSteps(m, [], errorsOf(m));
  assert.equal(r.actions[0].who, 'human');
  assert.equal(r.actions[0].decision.type, 'standards');
  assert.match(r.actions[0].what, /later/i, 'it says that later is an answer');
  const decided = designOnly(base());
  assert.match(nextSteps(decided, [], errorsOf(decided)).actions[0].command, /pp-plan/, 'with them decided, planning comes next');
  assert.notEqual(nextSteps(decided, [], errorsOf(decided)).actions[0].decision?.type, 'standards');
});

test('next: in the middle of a project, undecided standards wait beside the work and do not stop it', () => {
  const m = set(base(), null);
  const r = nextSteps(m, [], errorsOf(m));
  assert.match(r.actions[0].command, /ppc start SL-001/, 'the work goes on');
  assert.ok(r.waiting.some((a) => a.decision?.type === 'standards'));
});

test('next: a deferred standard whose trigger happened is asked again', () => {
  const m = replace(base(), 'ci', { decision: 'later', trigger: 'git_remote' });
  assert.ok(!nextSteps(m, [], errorsOf(m)).waiting.some((a) => a.decision?.id === 'ci'));
  m.facts.gitRemote = 'git@github.com:someone/app.git';
  const asked = nextSteps(m, [], errorsOf(m)).waiting.find((a) => a.decision?.id === 'ci');
  assert.ok(asked);
  assert.match(asked.what, /remote/);
});

test('next: a panel answer that took the recommendations, not yet carried out, is reported', (t) => {
  const { dir } = repo(t);
  rmSync(join(dir, '.sddpp/standards.yaml'));
  const m = loadProject(dir);
  const r = nextSteps(m, [], errorsOf(m), { answers: [{ command: 'ppc decide-standard --accept-recommended', label: 'Take the recommendations — ppc decide-standard --accept-recommended', at: Date.now() / 1000 }] });
  assert.equal(r.answered.length, 1);
  assert.equal(r.answered[0].decision.type, 'standards');
});
