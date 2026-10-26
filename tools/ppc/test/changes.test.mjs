import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadProject } from '../src/load.mjs';
import { validateModel, RULES } from '../src/validate.mjs';
import { nextSteps, renderNext } from '../src/next.mjs';
import { writeConstitution } from '../src/constitution.mjs';
import { openChange, decideChange, applyChange } from '../src/changes.mjs';
import { LifecycleError } from '../src/lifecycle.mjs';
import { CLI, EXAMPLE, repo } from './helpers.mjs';

const fails = (fn, pattern) => assert.throws(fn, (e) => e instanceof LifecycleError && pattern.test(e.message));
const read = (dir, rel) => readFileSync(join(dir, rel), 'utf8');
const crs = (dir) => loadProject(dir).changeRequests.map((c) => c.data);
const cr = (dir, id) => crs(dir).find((c) => c.id === id);
const errors = (dir) => validateModel(loadProject(dir)).filter((f) => f.severity === 'error');
const PROBLEM = 'SL-004 must reject long titles but QA-004 gives no length, so the slice would invent one.';
const PROPOSAL = 'Add a limit of 200 characters to the QA-004 scenario and raise the revision.';
const open = (dir, over = {}) => openChange(dir, { slice: 'SL-004', title: 'Define the title limit', problem: PROBLEM, proposal: PROPOSAL, qas: ['QA-004'], ...over });

// ── opening ──────────────────────────────────────────────────────
test('open: writes a change request in the contract format, as open, at the current design revision', (t) => {
  const { dir } = repo(t);
  const r = open(dir);
  assert.equal(r.change, 'CR-0002'); // the example already has CR-0001
  assert.equal(r.file, '.sddpp/change-requests/CR-0002-define-the-title-limit.md');
  const c = cr(dir, 'CR-0002');
  assert.deepEqual({ status: c.status, raised_by: c.raised_by, blueprint_revision: c.blueprint_revision, affects: c.affects }, { status: 'open', raised_by: 'SL-004', blueprint_revision: 1, affects: { quality_attributes: ['QA-004'] } });
  assert.equal(c.decided_by, undefined, 'opening is not deciding');
  const body = read(dir, r.file);
  assert.match(body, /## Problem\n\nSL-004 must reject long titles/);
  assert.match(body, /## Proposal\n\nAdd a limit of 200/);
  assert.deepEqual(errors(dir), []);
});

test('open: affects components, decisions and quality targets, all of which must exist', (t) => {
  const { dir } = repo(t);
  open(dir, { qas: [], components: ['backend'], adrs: ['ADR-0001'] });
  assert.deepEqual(cr(dir, 'CR-0002').affects, { components: ['backend'], adrs: ['ADR-0001'] });
  fails(() => open(dir, { qas: ['QA-099'] }), /QA-099/);
  fails(() => open(dir, { qas: [], components: ['nothing'] }), /nothing/);
  fails(() => open(dir, { qas: [], adrs: ['ADR-9999'] }), /ADR-9999/);
});

test('open: refuses a vague request, an unknown slice, and one that says what it affects nowhere', (t) => {
  const { dir } = repo(t);
  const before = crs(dir).length;
  fails(() => open(dir, { slice: 'SL-099' }), /unknown slice/);
  fails(() => open(dir, { title: 'x' }), /title/);
  fails(() => open(dir, { problem: 'too short' }), /problem/);
  fails(() => open(dir, { proposal: 'short' }), /proposal/);
  fails(() => open(dir, { qas: [] }), /affects/);
  assert.equal(crs(dir).length, before, 'nothing was written');
});

test('open: ids keep counting, and a title becomes a safe file name', (t) => {
  const { dir } = repo(t);
  open(dir, { title: 'Title: limit / "length"?' });
  open(dir, { title: 'Second one' });
  assert.deepEqual(crs(dir).map((c) => c.id).sort(), ['CR-0001', 'CR-0002', 'CR-0003']);
  assert.ok(existsSync(join(dir, '.sddpp/change-requests/CR-0002-title-limit-length.md')));
});

// ── deciding: a person ───────────────────────────────────────────
test('decide: a person accepts or rejects an open change request, and a rejection says why', (t) => {
  const { dir } = repo(t);
  open(dir);
  assert.deepEqual(decideChange(dir, 'CR-0002', { decision: 'accept', by: 'owner' }), { change: 'CR-0002', status: 'accepted' });
  assert.equal(cr(dir, 'CR-0002').decided_by, 'owner');
  fails(() => decideChange(dir, 'CR-0001', { decision: 'reject', by: 'owner' }), /reason/);
  decideChange(dir, 'CR-0001', { decision: 'reject', by: 'owner', reason: 'The slice can pick 200 itself' });
  assert.equal(cr(dir, 'CR-0001').status, 'rejected');
  assert.equal(cr(dir, 'CR-0001').reason, 'The slice can pick 200 itself');
  assert.deepEqual(errors(dir), []);
});

test('decide: needs a name, a known and still open request, and accept or reject', (t) => {
  const { dir } = repo(t);
  open(dir);
  const before = read(dir, '.sddpp/change-requests/CR-0002-define-the-title-limit.md');
  fails(() => decideChange(dir, 'CR-0002', { decision: 'accept' }), /--by/);
  fails(() => decideChange(dir, 'CR-0099', { decision: 'accept', by: 'o' }), /unknown/);
  fails(() => decideChange(dir, 'CR-0002', { decision: 'maybe', by: 'o' }), /accept or reject/);
  decideChange(dir, 'CR-0002', { decision: 'accept', by: 'o' });
  fails(() => decideChange(dir, 'CR-0002', { decision: 'reject', by: 'o', reason: 'changed my mind' }), /already|open/);
  assert.notEqual(read(dir, '.sddpp/change-requests/CR-0002-define-the-title-limit.md'), before);
});

// ── applying: the design moved ───────────────────────────────────
const raiseRevision = (r) => r.write({ '.architect/blueprint.yaml': read(r.dir, '.architect/blueprint.yaml').replace(/^revision: 1/m, 'revision: 2') });

test('apply: only an accepted request, and only once the design revision has risen', (t) => {
  const r = repo(t);
  open(r.dir);
  fails(() => applyChange(r.dir, 'CR-0002'), /accepted/);
  decideChange(r.dir, 'CR-0002', { decision: 'accept', by: 'owner' });
  fails(() => applyChange(r.dir, 'CR-0002'), /revision/);
  raiseRevision(r);
  assert.deepEqual(applyChange(r.dir, 'CR-0002'), { change: 'CR-0002', status: 'applied' });
  assert.equal(cr(r.dir, 'CR-0002').status, 'applied');
  assert.equal(cr(r.dir, 'CR-0002').decided_by, 'owner', 'who decided is kept');
});

test('apply: refuses while the constitution, if there is one, still describes the old design', (t) => {
  const r = repo(t);
  open(r.dir);
  decideChange(r.dir, 'CR-0002', { decision: 'accept', by: 'owner' });
  writeConstitution(r.dir);
  raiseRevision(r);
  fails(() => applyChange(r.dir, 'CR-0002'), /constitution/);
  writeConstitution(r.dir);
  assert.equal(applyChange(r.dir, 'CR-0002').status, 'applied');
});

test('T17: a request marked applied while the design has not moved since it was opened is an error', () => {
  assert.ok(RULES.T17);
  const m = loadProject(EXAMPLE);
  const c = m.changeRequests[0].data;
  Object.assign(c, { status: 'applied', decided_by: 'owner', blueprint_revision: 1 });
  assert.ok(validateModel(m).some((f) => f.rule === 'T17' && f.severity === 'error'));
  m.blueprint.data.revision = 2;
  assert.ok(!validateModel(m).some((f) => f.rule === 'T17'));
  delete c.blueprint_revision;
  m.blueprint.data.revision = 1;
  assert.ok(!validateModel(m).some((f) => f.rule === 'T17'), 'an older request without the field cannot be judged');
});

test('SCHEMA: a rejection needs a reason, an applied request needs who decided it', () => {
  const m = loadProject(EXAMPLE);
  const c = m.changeRequests[0].data;
  Object.assign(c, { status: 'rejected', decided_by: 'owner' });
  assert.ok(validateModel(m).some((f) => f.rule === 'SCHEMA'));
  c.reason = 'Not needed';
  assert.ok(!validateModel(m).some((f) => f.rule === 'SCHEMA' && f.file.includes('change-requests')));
});

// ── next: whose turn it is ───────────────────────────────────────
test('next: an open request is a decision for a person; an accepted one is work for Architect.PP; neither is lost', (t) => {
  const r = repo(t);
  const next = () => nextSteps(loadProject(r.dir), []);
  assert.ok(next().changes.some((c) => /CR-0001/.test(c.what) && c.who === 'human' && /decide-change CR-0001/.test(c.command)));
  decideChange(r.dir, 'CR-0001', { decision: 'accept', by: 'owner' });
  const accepted = next().changes.find((c) => /CR-0001/.test(c.what));
  assert.equal(accepted.who, 'agent');
  assert.match(accepted.command, /speckit-architect-pp-apply-change CR-0001/);
  raiseRevision(r);
  applyChange(r.dir, 'CR-0001');
  assert.ok(!next().changes.some((c) => /CR-0001/.test(c.what) && c.command));
});

test('next: after the design moves, slices planned against the old revision are listed', (t) => {
  const r = repo(t);
  raiseRevision(r);
  const stale = nextSteps(loadProject(r.dir), []).changes.find((c) => /older design/i.test(c.what));
  assert.ok(stale && /SL-002/.test(stale.what));
});

test('next: the slice that raised an open request is paused until it is decided', (t) => {
  const r = repo(t);
  const m = loadProject(r.dir);
  Object.assign(m.slices.find((s) => s.data.id === 'SL-004').data, { status: 'in_progress', phase: 'red', approved_by: 'owner' });
  const n = nextSteps(m, []);
  assert.match(n.headline, /SL-004.*paused|paused.*SL-004/i);
  assert.ok(n.actions.some((a) => a.who === 'human' && /decide-change CR-0001/.test(a.command)));
  assert.ok(!n.actions.some((a) => a.who === 'agent'), 'the agent does not go on building');
  assert.match(renderNext(n), /paused/i);
});

// ── the command line ─────────────────────────────────────────────
test('CLI: open, decide and apply', (t) => {
  const r = repo(t);
  const ppc = (...args) => spawnSync(process.execPath, [CLI, ...args, r.dir], { encoding: 'utf8' });
  const opened = ppc('change-request', '--slice', 'SL-004', '--title', 'Define the title limit', '--problem', PROBLEM, '--proposal', PROPOSAL, '--qa', 'QA-004');
  assert.equal(opened.status, 0, opened.stderr);
  assert.match(opened.stdout, /CR-0002/);
  assert.equal(ppc('decide-change', 'CR-0002', '--accept').status, 1, 'needs --by');
  assert.equal(ppc('decide-change', 'CR-0002', '--accept', '--by', 'owner').status, 0);
  assert.equal(ppc('apply-change', 'CR-0002').status, 1, 'the design has not moved');
  raiseRevision(r);
  assert.equal(ppc('apply-change', 'CR-0002').status, 0);
  assert.equal(cr(r.dir, 'CR-0002').status, 'applied');
});
