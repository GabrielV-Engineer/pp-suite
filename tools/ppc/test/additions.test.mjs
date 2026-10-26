import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadProject } from '../src/load.mjs';
import { validateModel, designFindings, RULES } from '../src/validate.mjs';
import { decideAddition, LifecycleError } from '../src/lifecycle.mjs';
import { CLI, EXAMPLE, repo } from './helpers.mjs';

const addition = (over = {}) => ({
  id: 'ADD-001',
  what: 'A recoverable delete: the row stays in the file',
  origin: 'stronger_than_asked',
  cost: 'A column, a filter in every query, a migration and one decision',
  if_cut: 'A mistaken delete cannot be undone',
  later: { effort: 'needs_migration', revisit_when: 'The owner deletes something by mistake twice' },
  recommendation: { action: 'cut', reason: 'The person only said "maybe delete"' },
  affects: ['CAP-004'],
  decision: 'pending',
  ...over,
});

const withAdditions = (list, { planned = false } = {}) => {
  const m = loadProject(EXAMPLE);
  m.additions = { file: '.architect/additions.yaml', data: { additions: list } };
  if (!planned) m.slices = [];
  return m;
};
const run = (m) => {
  const found = validateModel(m);
  for (const f of found) assert.ok(f.rule in RULES, `rule ${f.rule} is not in RULES`);
  return found;
};
const has = (found, rule, severity) => found.some((f) => f.rule === rule && (!severity || f.severity === severity));

// ── the file and its schema ──────────────────────────────────────
test('additions: a well-formed file adds no findings of its own', () => {
  const found = run(withAdditions([addition()])).filter((f) => f.file === '.architect/additions.yaml');
  assert.deepEqual(found.filter((f) => f.severity === 'error'), []);
});

test('additions: the file is optional', () => {
  const m = loadProject(EXAMPLE);
  assert.equal(m.additions ?? null, null);
  assert.ok(!run(m).some((f) => f.file === '.architect/additions.yaml'));
});

test('SCHEMA: an unknown field, a bad origin, or a decision without who made it is rejected', () => {
  assert.ok(has(run(withAdditions([addition({ surprise: 1 })])), 'SCHEMA', 'error'));
  assert.ok(has(run(withAdditions([addition({ origin: 'because' })])), 'SCHEMA', 'error'));
  assert.ok(has(run(withAdditions([addition({ decision: 'keep', reason: 'I like it' })])), 'SCHEMA', 'error'), 'keep needs decided_by');
  assert.ok(has(run(withAdditions([addition({ decision: 'keep', decided_by: 'owner' })])), 'SCHEMA', 'error'), 'keep needs a reason');
  assert.ok(has(run(withAdditions([addition({ decision: 'cut', decided_by: 'owner' })])), 'SCHEMA', 'error'), 'cut needs the non-goal it becomes');
});

// ── X01: undecided additions hold up planning ────────────────────
test('X01: an undecided addition is a warning while the design is drafted, and an error once slices exist', () => {
  assert.ok(has(run(withAdditions([addition()])), 'X01', 'warning'));
  assert.ok(!has(run(withAdditions([addition()])), 'X01', 'error'));
  assert.ok(has(run(withAdditions([addition()], { planned: true })), 'X01', 'error'));
});

// ── X04, X02, X03: a cut has to be carried out ───────────────────
const cut = (over = {}) => addition({ decision: 'cut', decided_by: 'owner', non_goal: 'A recoverable delete', ...over });

test('X04: a decided cut that was not applied is a warning, and an error once slices exist', () => {
  assert.ok(has(run(withAdditions([cut()])), 'X04', 'warning'));
  assert.ok(has(run(withAdditions([cut()], { planned: true })), 'X04', 'error'));
});

test('X02: an applied cut leaves nothing standing that only the addition justified', () => {
  const standing = withAdditions([cut({ applied: true })]);
  assert.ok(has(run(standing), 'X02', 'error')); // CAP-004 is still in the blueprint
  const gone = withAdditions([cut({ applied: true })]);
  gone.blueprint.data.capabilities = gone.blueprint.data.capabilities.filter((c) => c.id !== 'CAP-004');
  assert.ok(!has(run(gone), 'X02'));
});

test('X02: a decision that is still standing is found too', () => {
  const m = withAdditions([cut({ applied: true, affects: ['ADR-0001'] })]);
  assert.ok(m.adrs.some((a) => a.data.id === 'ADR-0001'), 'the example has ADR-0001');
  assert.ok(has(run(m), 'X02', 'error'));
});

test('X03: an applied cut must appear among the non-goals', () => {
  const m = withAdditions([cut({ applied: true, affects: [] })]);
  assert.ok(has(run(m), 'X03', 'error'));
  m.blueprint.data.non_goals.push('A recoverable delete');
  assert.ok(!has(run(m), 'X03'));
});

// ── X05: what an addition points at must exist ───────────────────
test('X05: an undecided or kept addition must point at things that exist, and ids are unique', () => {
  assert.ok(has(run(withAdditions([addition({ affects: ['CAP-099'] })])), 'X05', 'error'));
  assert.ok(has(run(withAdditions([addition(), addition()])), 'X05', 'error'));
  assert.ok(!has(run(withAdditions([addition()])), 'X05'));
});

test('the design-only check includes these rules', () => {
  const found = designFindings(run(withAdditions([addition()])));
  assert.ok(found.some((f) => f.rule === 'X01'));
});

// ── the loader ───────────────────────────────────────────────────
test('the loader reads .architect/additions.yaml, and reports a broken one', (t) => {
  const r = repo(t);
  r.write({ '.architect/additions.yaml': 'additions: []\n' });
  assert.deepEqual(loadProject(r.dir).additions.data, { additions: [] });
  r.write({ '.architect/additions.yaml': 'additions: [unclosed\n' });
  assert.ok(loadProject(r.dir).errors.some((e) => e.rule === 'PARSE' && e.file === '.architect/additions.yaml'));
});

// ── the human decision ───────────────────────────────────────────
const yamlOf = (list) => `additions:\n${list.map((a) => `  - ${JSON.stringify(a)}`).join('\n')}\n`;
const read = (dir) => readFileSync(join(dir, '.architect/additions.yaml'), 'utf8');
const entryOf = (dir, id) => loadProject(dir).additions.data.additions.find((a) => a.id === id);
const fails = (fn, pattern) => assert.throws(fn, (e) => e instanceof LifecycleError && pattern.test(e.message));
const setup = (t, list) => {
  const r = repo(t);
  r.write({ '.architect/additions.yaml': yamlOf(list) });
  return r;
};

test('decide-addition: records a keep with who and why', (t) => {
  const { dir } = setup(t, [addition({ id: 'ADD-001' })]);
  assert.deepEqual(decideAddition(dir, 'ADD-001', { decision: 'keep', by: 'owner', reason: 'I want to undo mistakes' }), { addition: 'ADD-001', decision: 'keep' });
  assert.equal(entryOf(dir, 'ADD-001').decision, 'keep');
  assert.equal(entryOf(dir, 'ADD-001').decided_by, 'owner');
  assert.equal(entryOf(dir, 'ADD-001').reason, 'I want to undo mistakes');
});

test('decide-addition: a cut records the non-goal it becomes, from the recommendation text when none is given', (t) => {
  const { dir } = setup(t, [addition({ id: 'ADD-001', non_goal: 'A recoverable delete' })]);
  decideAddition(dir, 'ADD-001', { decision: 'cut', by: 'owner' });
  const e = entryOf(dir, 'ADD-001');
  assert.equal(e.decision, 'cut');
  assert.equal(e.non_goal, 'A recoverable delete');
  assert.ok(!e.applied);
});

test('decide-addition: refuses without a name, for an unknown or already decided addition, and for a keep without a reason', (t) => {
  const { dir } = setup(t, [addition({ id: 'ADD-001' }), addition({ id: 'ADD-002', decision: 'keep', decided_by: 'o', reason: 'because' })]);
  const before = read(dir);
  fails(() => decideAddition(dir, 'ADD-001', { decision: 'keep', reason: 'x'.repeat(8) }), /--by/);
  fails(() => decideAddition(dir, 'ADD-099', { decision: 'cut', by: 'o' }), /unknown addition/);
  fails(() => decideAddition(dir, 'ADD-002', { decision: 'cut', by: 'o' }), /already decided/);
  fails(() => decideAddition(dir, 'ADD-001', { decision: 'keep', by: 'o' }), /reason/);
  fails(() => decideAddition(dir, 'ADD-001', { decision: 'maybe', by: 'o' }), /keep or cut/);
  assert.equal(read(dir), before);
});

test('decide-addition: --accept-recommended decides every pending addition the way it was recommended', (t) => {
  const { dir } = setup(t, [
    addition({ id: 'ADD-001', non_goal: 'A recoverable delete' }),
    addition({ id: 'ADD-002', recommendation: { action: 'keep', reason: 'The skeleton needs a health route' }, affects: [] }),
    addition({ id: 'ADD-003', recommendation: { action: 'decide', reason: 'Changing framework is a redesign' }, affects: [] }),
  ]);
  const result = decideAddition(dir, null, { acceptRecommended: true, by: 'owner' });
  assert.deepEqual(result.decided, { 'ADD-001': 'cut', 'ADD-002': 'keep' });
  assert.deepEqual(result.left_to_the_person, ['ADD-003']);
  assert.equal(entryOf(dir, 'ADD-003').decision, 'pending');
});

test('CLI: decide-addition works from the command line, and needs a name', (t) => {
  const { dir } = setup(t, [addition({ id: 'ADD-001', non_goal: 'A recoverable delete' })]);
  const run = (...args) => spawnSync('node', [CLI, ...args, dir], { encoding: 'utf8' });
  assert.equal(run('decide-addition', 'ADD-001', '--cut').status, 1);
  assert.equal(run('decide-addition', 'ADD-001', '--cut', '--by', 'owner').status, 0);
  assert.equal(entryOf(dir, 'ADD-001').decision, 'cut');
  writeFileSync(join(dir, '.architect/additions.yaml'), yamlOf([addition({ id: 'ADD-001', non_goal: 'A recoverable delete' })]));
  assert.equal(run('decide-addition', '--accept-recommended', '--by', 'owner').status, 0);
  assert.equal(entryOf(dir, 'ADD-001').decision, 'cut');
});

// ── overlapping additions are decided together ───────────────────
test('SCHEMA: overlaps lists addition ids', () => {
  assert.ok(!has(run(withAdditions([addition({ overlaps: ['ADD-002'] }), addition({ id: 'ADD-002', affects: [] })])), 'SCHEMA'));
  assert.ok(has(run(withAdditions([addition({ overlaps: ['dark'] })])), 'SCHEMA', 'error'));
  assert.ok(has(run(withAdditions([addition({ overlaps: ['ADD-002', 'ADD-002'] })])), 'SCHEMA', 'error'));
});

test('X05: an overlap must point at another addition that exists', () => {
  assert.ok(has(run(withAdditions([addition({ overlaps: ['ADD-009'] })])), 'X05', 'error'));
  assert.ok(has(run(withAdditions([addition({ overlaps: ['ADD-001'] })])), 'X05', 'error'), 'not itself');
  assert.ok(!has(run(withAdditions([addition({ overlaps: ['ADD-002'] }), addition({ id: 'ADD-002', affects: [] })])), 'X05'));
});

const pair = (a = {}, b = {}) => [addition({ id: 'ADD-001', non_goal: 'No dark appearance', overlaps: ['ADD-002'], ...a }), addition({ id: 'ADD-002', affects: [], non_goal: 'No numeric accessibility targets', ...b })];
const decidedOf = (dir) => Object.fromEntries(loadProject(dir).additions.data.additions.map((a) => [a.id, a.decision]));

test('decide-addition: refuses to decide one addition while one that overlaps it is undecided, and says how', (t) => {
  const { dir } = setup(t, pair());
  const before = read(dir);
  fails(() => decideAddition(dir, 'ADD-001', { decision: 'cut', by: 'owner' }), /ADD-002.*together|together.*ADD-002/s);
  fails(() => decideAddition(dir, 'ADD-002', { decision: 'cut', by: 'owner' }), /ADD-001/);
  assert.equal(read(dir), before);
});

test('decide-addition: several ids are decided in one go, the same way', (t) => {
  const { dir } = setup(t, pair());
  assert.deepEqual(decideAddition(dir, ['ADD-001', 'ADD-002'], { decision: 'cut', by: 'owner' }), { additions: ['ADD-001', 'ADD-002'], decision: 'cut' });
  assert.deepEqual(decidedOf(dir), { 'ADD-001': 'cut', 'ADD-002': 'cut' });
  assert.equal(entryOf(dir, 'ADD-002').decided_by, 'owner');
});

test('decide-addition: --alone decides one on purpose', (t) => {
  const { dir } = setup(t, pair());
  decideAddition(dir, 'ADD-001', { decision: 'cut', by: 'owner', alone: true });
  assert.deepEqual(decidedOf(dir), { 'ADD-001': 'cut', 'ADD-002': 'pending' });
});

test('decide-addition: an overlap that is already decided does not hold the other back', (t) => {
  const { dir } = setup(t, pair({}, { decision: 'keep', decided_by: 'owner', reason: 'Baseline practice stays' }));
  decideAddition(dir, 'ADD-001', { decision: 'cut', by: 'owner' });
  assert.equal(decidedOf(dir)['ADD-001'], 'cut');
});

test('decide-addition: overlaps count in both directions and through a third addition', (t) => {
  const list = [
    addition({ id: 'ADD-001', non_goal: 'No dark appearance' }),
    addition({ id: 'ADD-002', affects: [], non_goal: 'No accessibility numbers', overlaps: ['ADD-001'] }),
    addition({ id: 'ADD-003', affects: [], non_goal: 'No contrast tests', overlaps: ['ADD-002'] }),
  ];
  const { dir } = setup(t, list);
  fails(() => decideAddition(dir, 'ADD-001', { decision: 'cut', by: 'o' }), /ADD-002/); // listed only on ADD-002
  fails(() => decideAddition(dir, ['ADD-001', 'ADD-002'], { decision: 'cut', by: 'o' }), /ADD-003/); // reached through ADD-002
  decideAddition(dir, ['ADD-001', 'ADD-002', 'ADD-003'], { decision: 'cut', by: 'o' });
  assert.deepEqual(decidedOf(dir), { 'ADD-001': 'cut', 'ADD-002': 'cut', 'ADD-003': 'cut' });
});

test('decide-addition: keeping several needs the reason once, and a failure changes nothing', (t) => {
  const { dir } = setup(t, pair());
  const before = read(dir);
  fails(() => decideAddition(dir, ['ADD-001', 'ADD-002'], { decision: 'keep', by: 'o' }), /reason/);
  fails(() => decideAddition(dir, ['ADD-001', 'ADD-099'], { decision: 'cut', by: 'o' }), /unknown addition ADD-099/);
  assert.equal(read(dir), before);
  decideAddition(dir, ['ADD-001', 'ADD-002'], { decision: 'keep', by: 'o', reason: 'Both stay' });
  assert.equal(entryOf(dir, 'ADD-002').reason, 'Both stay');
});

test('--accept-recommended: a group is decided only when its members were recommended the same way', (t) => {
  const same = setup(t, pair({ recommendation: { action: 'cut', reason: 'Nobody asked' } }, { recommendation: { action: 'cut', reason: 'Nobody asked' } }));
  assert.deepEqual(decideAddition(same.dir, null, { acceptRecommended: true, by: 'o' }).decided, { 'ADD-001': 'cut', 'ADD-002': 'cut' });
  const mixed = setup(t, pair({ recommendation: { action: 'cut', reason: 'Nobody asked' } }, { recommendation: { action: 'decide', reason: 'A matter of values' } }));
  const result = decideAddition(mixed.dir, null, { acceptRecommended: true, by: 'o' });
  assert.deepEqual(result.decided, {});
  assert.deepEqual(result.left_to_the_person.sort(), ['ADD-001', 'ADD-002']);
  assert.deepEqual(decidedOf(mixed.dir), { 'ADD-001': 'pending', 'ADD-002': 'pending' });
});

test('CLI: decide-addition takes several ids and --alone', (t) => {
  const { dir } = setup(t, pair());
  const cli = (...args) => spawnSync('node', [CLI, 'decide-addition', ...args], { encoding: 'utf8' });
  const refused = cli('ADD-001', '--cut', '--by', 'o', dir);
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /ADD-002/);
  assert.equal(cli('ADD-001', 'ADD-002', '--cut', '--by', 'o', dir).status, 0);
  assert.deepEqual(decidedOf(dir), { 'ADD-001': 'cut', 'ADD-002': 'cut' });
  writeFileSync(join(dir, '.architect/additions.yaml'), yamlOf(pair()));
  assert.equal(cli('ADD-001', '--cut', '--alone', '--by', 'o', dir).status, 0);
});
