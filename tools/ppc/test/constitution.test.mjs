import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadProject } from '../src/load.mjs';
import { renderConstitution, writeConstitution, checkConstitution, hasConstitution, CONSTITUTION_FILE, ConstitutionError } from '../src/constitution.mjs';
import { CLI, EXAMPLE, repo } from './helpers.mjs';

const model = () => loadProject(EXAMPLE);
const text = () => renderConstitution(model());
const BEGIN = /^<!-- pp-suite:begin/;
const END = '<!-- pp-suite:end -->';

// ── what it says ─────────────────────────────────────────────────
test('the rules carry the design: every non-goal, every component with its limits, every quality target', () => {
  const m = model();
  const bp = m.blueprint.data;
  const out = renderConstitution(m);
  for (const goal of bp.non_goals) assert.ok(out.includes(goal), goal);
  for (const c of bp.components) {
    assert.ok(out.includes(c.responsibility), c.id);
    assert.ok(out.includes(c.may_depend_on.length ? `May depend only on: ${c.may_depend_on.join(', ')}` : 'May depend on nothing'), c.id);
  }
  for (const q of bp.quality_attributes) assert.ok(out.includes(q.id) && out.includes(q.metric) && out.includes(q.target), q.id);
  for (const a of m.adrs) {
    const inForce = a.data.status === 'accepted';
    assert.equal(out.includes(a.data.id), inForce, `${a.data.id} (${a.data.status}): only decisions in force are listed`);
    if (inForce) assert.ok(out.includes(a.data.title));
  }
  assert.ok(m.adrs.some((a) => a.data.status !== 'accepted'), 'the example has a decision that is not in force');
  assert.ok(out.includes(String(bp.budgets.max_slice_production_lines)));
});

test('the block is delimited by markers, and holds how to work here, then seven numbered principles and the version', () => {
  const out = text();
  assert.match(out, BEGIN);
  assert.ok(out.trimEnd().endsWith(END));
  assert.match(out, /^## Project rules \(pp-suite\): Todo App$/m);
  assert.match(out, /^### How to work here$/m);
  assert.deepEqual(out.match(/^### [IVX]+\. /gm).map((s) => s.trim()), ['### I.', '### II.', '### III.', '### IV.', '### V.', '### VI.', '### VII.']);
  assert.match(out, /\*\*Version\*\*: blueprint revision 1/);
  assert.ok(!/\[[A-Z_]+\]/.test(out), 'no template placeholder is left');
});

test('it orients an agent that has never seen the project: ppc next first, what only a person decides, the change request', () => {
  const out = text();
  assert.match(out, /run `ppc next`/);
  assert.match(out, /ppc overview/);
  assert.match(out, /`ppc approve-\*`/);
  assert.match(out, /ppc change-request/);
  assert.match(out, /speckit-sddpp-cycle-slices/);
  assert.match(out, /speckit-sddpp-cycle-build/);
  for (const review of ['clarify', 'analyze', 'converge']) assert.match(out, new RegExp(`speckit-sddpp-cycle-${review}|-${review}`), review);
});

test('it states the cycle and the test policy that apply, and changes with them', () => {
  const m = model();
  assert.match(renderConstitution(m), /strict cycle/i);
  assert.match(renderConstitution(m), /Test policy: optional/);
  m.blueprint.data.default_mode = 'light';
  m.blueprint.data.test_policy = 'required';
  const out = renderConstitution(m);
  assert.match(out, /light cycle/i);
  assert.match(out, /Test policy: required/);
});

test('it is the same every time: no date, no randomness, and the revision is the version', () => {
  assert.equal(text(), text());
  assert.ok(!/\b20\d\d-\d\d-\d\d\b/.test(text()));
  const m = model();
  m.blueprint.data.revision = 4;
  assert.match(renderConstitution(m), /blueprint revision 4/);
  assert.match(renderConstitution(m).split('\n')[0], /revision 4\)/);
});

// ── writing it into CLAUDE.md ────────────────────────────────────
test('write: creates CLAUDE.md with the block when there is none', (t) => {
  const { dir } = repo(t);
  const r = writeConstitution(dir);
  assert.equal(r.file, 'CLAUDE.md');
  assert.equal(CONSTITUTION_FILE, 'CLAUDE.md');
  assert.equal(readFileSync(join(dir, 'CLAUDE.md'), 'utf8'), `${text()}\n`);
  assert.equal(r.status, 'written');
  assert.equal(writeConstitution(dir).status, 'unchanged');
});

test('write: adds the block after what a person already wrote in CLAUDE.md, and leaves their text alone', (t) => {
  const { dir } = repo(t);
  const mine = '# My notes\n\nNo Friday deploys.\n';
  writeFileSync(join(dir, 'CLAUDE.md'), mine);
  assert.equal(writeConstitution(dir).status, 'written');
  const after = readFileSync(join(dir, 'CLAUDE.md'), 'utf8');
  assert.ok(after.startsWith(`${mine}\n`));
  assert.ok(after.includes(text()));
  assert.equal(writeConstitution(dir).status, 'unchanged');
});

test('write: replaces only the block, keeping the text before and after it', (t) => {
  const { dir } = repo(t);
  writeFileSync(join(dir, 'CLAUDE.md'), `Before.\n\n${text().replace('Total', 'x')}\nAfter.\n`.replace(/revision 1/g, 'revision 0'));
  assert.equal(writeConstitution(dir).status, 'written');
  const after = readFileSync(join(dir, 'CLAUDE.md'), 'utf8');
  assert.ok(after.startsWith('Before.\n\n'));
  assert.ok(after.endsWith('\nAfter.\n'));
  assert.ok(after.includes(text()));
  assert.equal(after.split('pp-suite:begin').length, 2, 'one block only');
});

test('write: a block with a begin marker but no end marker is refused, and nothing is written', (t) => {
  const { dir } = repo(t);
  const broken = 'Intro.\n<!-- pp-suite:begin (half a block)\nrules\n';
  writeFileSync(join(dir, 'CLAUDE.md'), broken);
  assert.throws(() => writeConstitution(dir), (e) => e instanceof ConstitutionError && /end marker|incomplete/i.test(e.message));
  assert.equal(readFileSync(join(dir, 'CLAUDE.md'), 'utf8'), broken);
});

test('write: no longer writes Spec Kit\'s constitution file', (t) => {
  const { dir } = repo(t);
  writeConstitution(dir);
  assert.ok(!existsSync(join(dir, '.specify/memory/constitution.md')));
});

test('write: refuses a design that does not validate', (t) => {
  const r = repo(t);
  r.write({ '.architect/blueprint.yaml': 'nonsense: true\n' });
  assert.throws(() => writeConstitution(r.dir), (e) => e instanceof ConstitutionError);
  assert.ok(!existsSync(join(r.dir, CONSTITUTION_FILE)));
});

test('write: works on a project that only has its design, before any slice is planned (when it is used)', (t) => {
  const { dir } = repo(t);
  rmSync(join(dir, '.sddpp'), { recursive: true });
  assert.equal(writeConstitution(dir).status, 'written');
  assert.deepEqual(checkConstitution(dir), []);
});

test('write: waits until the additions are decided, because it would bind the plan to things the person may cut', (t) => {
  const r = repo(t);
  rmSync(join(r.dir, '.sddpp'), { recursive: true }); // before planning, an undecided addition is a warning, not an error
  const addition = { id: 'ADD-001', what: 'Soft delete of tasks', origin: 'tool_added', cost: 'A column and a filter', if_cut: 'No recovery', later: { effort: 'easy', revisit_when: 'After a mistake' }, recommendation: { action: 'cut', reason: 'Not asked' }, decision: 'pending' };
  r.write({ '.architect/additions.yaml': `additions:\n  - ${JSON.stringify(addition)}\n` });
  assert.throws(() => writeConstitution(r.dir), (e) => e instanceof ConstitutionError && /ADD-001/.test(e.message));
  assert.ok(!existsSync(join(r.dir, CONSTITUTION_FILE)));
  assert.equal(writeConstitution(r.dir, { force: true }).status, 'written');
  r.write({ '.architect/additions.yaml': `additions:\n  - ${JSON.stringify({ ...addition, decision: 'keep', decided_by: 'owner', reason: 'I want to undo mistakes' })}\n` });
  assert.equal(writeConstitution(r.dir).status, 'unchanged');
});

// ── check ────────────────────────────────────────────────────────
test('check: missing (no file, or a file without the block), current, out of date, and edited by hand', (t) => {
  const r = repo(t);
  assert.match(checkConstitution(r.dir)[0], /missing/);
  assert.equal(hasConstitution(r.dir), false);
  writeFileSync(join(r.dir, 'CLAUDE.md'), '# only my notes\n');
  assert.match(checkConstitution(r.dir)[0], /missing/);
  writeConstitution(r.dir);
  assert.equal(hasConstitution(r.dir), true);
  assert.deepEqual(checkConstitution(r.dir), []);
  const file = join(r.dir, 'CLAUDE.md');
  writeFileSync(file, readFileSync(file, 'utf8').replace('Metric', 'Metrik'));
  assert.match(checkConstitution(r.dir)[0], /out of date/);
  writeConstitution(r.dir);
  const bp = readFileSync(join(r.dir, '.architect/blueprint.yaml'), 'utf8');
  r.write({ '.architect/blueprint.yaml': bp.replace(/^revision: 1/m, 'revision: 2') });
  assert.match(checkConstitution(r.dir)[0], /out of date/);
});

test('CLI: constitution writes, --check verifies, and --check fails when it is out of date', (t) => {
  const r = repo(t);
  const run = (...args) => spawnSync(process.execPath, [CLI, 'constitution', ...args, r.dir], { encoding: 'utf8' });
  assert.equal(run('--check').status, 1);
  const wrote = run();
  assert.equal(wrote.status, 0, wrote.stderr);
  assert.match(wrote.stdout, /CLAUDE\.md/);
  assert.equal(run('--check').status, 0);
});
