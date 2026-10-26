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
test('the block points at the design instead of copying it: no non-goals, components, targets or decisions are pasted', () => {
  const m = model();
  const bp = m.blueprint.data;
  const out = renderConstitution(m);
  for (const goal of bp.non_goals) assert.ok(!out.includes(goal), `non-goal copied: ${goal}`);
  for (const c of bp.components) assert.ok(!out.includes(c.responsibility), `component copied: ${c.id}`);
  for (const q of bp.quality_attributes) assert.ok(!out.includes(q.metric), `quality target copied: ${q.id}`);
  for (const a of m.adrs) assert.ok(!out.includes(a.data.title), `decision copied: ${a.data.id}`);
  assert.match(out, /`\.architect\/`/);
  assert.match(out, /non-goals/i, 'it says not to build what the non-goals exclude');
});

test('the block is short: well under what Claude Code asks of a CLAUDE.md, and it must stay that way', () => {
  const out = text();
  assert.ok(out.length < 2000, `the block is ${out.length} characters`);
  assert.ok(out.split('\n').length < 20);
});

test('the block is delimited by markers and holds how to work here, the cycle, the policy, the budget and the version', () => {
  const m = model();
  const out = renderConstitution(m);
  assert.match(out, BEGIN);
  assert.ok(out.trimEnd().endsWith(END));
  assert.match(out, /^## Project rules \(pp-suite\): Todo App$/m);
  assert.match(out, /^### How to work here$/m);
  assert.ok(out.includes(String(m.blueprint.data.budgets.max_slice_production_lines)));
  assert.match(out, /\*\*Version\*\*: blueprint revision 1/);
  assert.ok(!/\[[A-Z_]+\]/.test(out), 'no template placeholder is left');
});

test('it orients an agent that has never seen the project: ppc next first, what only a person decides, the change request', () => {
  const out = text();
  assert.match(out, /`ppc next`/);
  assert.match(out, /ppc overview/);
  assert.match(out, /`ppc approve-\*`/);
  assert.match(out, /ppc change-request/);
  assert.match(out, /speckit-sddpp-cycle-slices/);
  assert.match(out, /speckit-sddpp-cycle-build/);
  for (const review of ['clarify', 'analyze', 'converge']) assert.match(out, new RegExp(`-${review}`), review);
});

test('it states the cycle and the test policy that apply, and changes with them', () => {
  const m = model();
  assert.match(renderConstitution(m), /Default cycle: strict/);
  assert.match(renderConstitution(m), /Test policy: optional/);
  m.blueprint.data.default_mode = 'light';
  m.blueprint.data.test_policy = 'required';
  const out = renderConstitution(m);
  assert.match(out, /Default cycle: light/);
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

test('write: undecided additions do not hold it back, since the block copies nothing from the design', (t) => {
  const r = repo(t);
  rmSync(join(r.dir, '.sddpp'), { recursive: true });
  const addition = { id: 'ADD-001', what: 'Soft delete of tasks', origin: 'tool_added', cost: 'A column and a filter', if_cut: 'No recovery', later: { effort: 'easy', revisit_when: 'After a mistake' }, recommendation: { action: 'cut', reason: 'Not asked' }, decision: 'pending' };
  r.write({ '.architect/additions.yaml': `additions:\n  - ${JSON.stringify(addition)}\n` });
  assert.equal(writeConstitution(r.dir).status, 'written');
  assert.ok(!readFileSync(join(r.dir, CONSTITUTION_FILE), 'utf8').includes('Soft delete'));
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
  writeFileSync(file, readFileSync(file, 'utf8').replace('Run `ppc next`', 'Run `ppc nxt`'));
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
