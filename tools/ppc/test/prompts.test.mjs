import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadProject } from '../src/load.mjs';
import { TASKS, appliesTo, buildPrompts, outOfScope, resolveTarget, writePrompts, PromptError } from '../src/prompts.mjs';
import { CLI, EXAMPLE, repo } from './helpers.mjs';

const model = () => loadProject(EXAMPLE);
const fails = (fn, pattern) => assert.throws(fn, (e) => e instanceof PromptError && pattern.test(e.message));
const blueprint = () => model().blueprint.data;

// ── which tasks a slice has ──────────────────────────────────────
test('appliesTo: work slices have red, green, refactor and audit; refactors skip red and green; spikes only explore', () => {
  assert.deepEqual(TASKS, ['red', 'green', 'build', 'refactor', 'audit', 'explore']);
  assert.deepEqual(appliesTo('feature'), ['red', 'green', 'refactor', 'audit']);
  assert.deepEqual(appliesTo('skeleton'), ['red', 'green', 'refactor', 'audit']);
  assert.deepEqual(appliesTo('refactor'), ['refactor', 'audit']);
  assert.deepEqual(appliesTo('spike'), ['explore']);
});

test('outOfScope: takes the bullets under the heading and stops at the next heading', () => {
  const body = '## Behavior\n\nx\n\n## Out of scope\n\n- First thing.\n- Second thing\n  continued.\n\n## Notes\n\n- not this\n';
  assert.deepEqual(outOfScope(body), ['First thing.', 'Second thing continued.']);
  assert.deepEqual(outOfScope('## Behavior\n\nx\n'), []);
});

// ── what is in each prompt ───────────────────────────────────────
const prompts = (id, task) => buildPrompts(model(), id, task);

test('system prompt: names the slice and the task, points at the files to read, and states the rules of the phase', () => {
  const { system } = prompts('SL-002', 'red');
  for (const part of ['SL-002', 'red', '.sddpp/slices/SL-002-create-and-list-tasks.md', '.architect/blueprint.yaml', '.architect/architecture.md', 'CAP-001', 'QA-001', 'AC-1', 'AC-2']) {
    assert.ok(system.includes(part), `the system prompt should mention ${part}`);
  }
  assert.match(system, /no production code/i);
  assert.match(system, /commit/i);
});

test('system prompt: made of references, so it does not paste the slice or the architecture', () => {
  const { system } = prompts('SL-002', 'green');
  assert.ok(!system.includes('Submitting the form creates a task'), 'the slice behavior text is read from the file, not pasted');
  assert.ok(system.length < 3500, `the system prompt stays short, it is ${system.length} characters`);
});

test('every task except the audit tells the agent to stop and open a change request when the design is wrong', () => {
  for (const task of ['red', 'green', 'refactor']) assert.match(prompts('SL-002', task).system, /change request/i, task);
  assert.doesNotMatch(prompts('SL-002', 'audit').system, /change request/i);
});

test('each task has its own rules', () => {
  assert.match(prompts('SL-002', 'green').system, /do not (edit|change|touch).*tests?|tests?.*locked/i);
  assert.match(prompts('SL-002', 'refactor').system, /behavior/i);
  assert.match(prompts('SL-002', 'audit').system, /ppc finish/);
  assert.match(prompts('SL-002', 'red').negative, /production code/i);
  assert.match(prompts('SL-002', 'green').negative, /test/i);
});

test('the green task states the production-code budget of the blueprint', () => {
  const budget = blueprint().budgets.max_slice_production_lines;
  assert.ok(prompts('SL-002', 'green').negative.includes(String(budget)));
});

test('negative prompt: carries the slice out of scope, every non-goal, and the component boundaries', () => {
  const { negative } = prompts('SL-002', 'red');
  assert.ok(negative.includes('Pagination: the list returns every task'));
  for (const goal of blueprint().non_goals) assert.ok(negative.includes(goal), `missing non-goal: ${goal}`);
  assert.match(negative, /frontend/);
  assert.match(negative, /may depend only on/i);
  assert.match(negative, /approv/i, 'it forbids approving');
});

test('negative prompt: lists the components the slice must not touch', () => {
  const m = model();
  m.slices.find((s) => s.data.id === 'SL-004').data.components = ['frontend'];
  const { negative } = buildPrompts(m, 'SL-004', 'red');
  assert.match(negative, /do not touch.*backend/i);
  assert.match(negative, /do not touch.*database/i);
});

// ── the design prompt is optional ────────────────────────────────
test('design prompt: present when the slice touches an interface or an architectural choice', () => {
  const { design } = prompts('SL-002', 'red'); // a frontend slice
  assert.ok(design);
  assert.match(design, /optional/i);
  assert.ok(design.includes('QA-001'));
  assert.ok(design.includes('ADR-0001'), 'the decision that binds the slice');
  assert.ok(design.includes('Use SQLite as the storage engine'));
  assert.ok(prompts('SL-001', 'red').design, 'a skeleton always crosses every layer');
});

test('design prompt: absent for a slice that touches only one internal component and no decision', () => {
  const m = model();
  const s = m.slices.find((x) => x.data.id === 'SL-004').data;
  Object.assign(s, { components: ['backend'], quality_attributes: [], capability: 'CAP-001' });
  for (const adr of m.adrs) adr.data.drivers = adr.data.drivers.filter((d) => !d.startsWith('CAP-001'));
  assert.equal(buildPrompts(m, 'SL-004', 'red').design, null);
});


// each reason for offering the design prompt, on its own
const alone = (patch, bindDecisions = false) => {
  const m = model();
  Object.assign(m.slices.find((x) => x.data.id === 'SL-004').data, { type: 'feature', capability: 'CAP-001', quality_attributes: [], ...patch });
  if (!bindDecisions) for (const adr of m.adrs) adr.data.drivers = ['CON-001'];
  return buildPrompts(m, 'SL-004', 'red').design;
};

test('design prompt: a frontend component is enough', () => {
  assert.ok(alone({ components: ['frontend'] }));
  assert.equal(alone({ components: ['backend'] }), null);
});

test('design prompt: a skeleton is enough', () => {
  assert.ok(alone({ components: ['backend'], type: 'skeleton' }));
});

test('design prompt: a decision driven by the slice quality attributes is enough, and is named', () => {
  const design = alone({ components: ['backend'], quality_attributes: ['QA-003'] }, true);
  assert.ok(design?.includes('ADR-0001'));
});

test('negative prompt: says nothing about other components when the slice already crosses them all', () => {
  assert.doesNotMatch(prompts('SL-002', 'red').negative, /do not touch/i);
});

test('negative prompt: a component that may depend on nothing says so', () => {
  assert.match(prompts('SL-002', 'red').negative, /database may depend only on: nothing/);
});

test('system prompt: points at the spec story when the slice has one', () => {
  const m = model();
  m.slices.find((x) => x.data.id === 'SL-002').data.spec = { file: 'docs/spec.md', story: 'User Story 1' };
  const { system } = buildPrompts(m, 'SL-002', 'red');
  assert.ok(system.includes('docs/spec.md') && system.includes('User Story 1'));
  assert.ok(!prompts('SL-002', 'red').system.includes('User Story'));
});

// ── the task to use when none is given ───────────────────────────
test('resolveTarget: the slice in progress and its phase, a spike explores, and nothing in progress needs a task', () => {
  const m = model();
  assert.throws(() => resolveTarget(m, undefined, undefined), (e) => e instanceof PromptError && /no slice is in progress/.test(e.message));
  assert.throws(() => resolveTarget(m, 'SL-002', undefined), (e) => e instanceof PromptError && /pass --task/.test(e.message));
  assert.deepEqual(resolveTarget(m, 'SL-002', 'audit'), { slice: 'SL-002', task: 'audit' });
  const s = m.slices.find((x) => x.data.id === 'SL-002').data;
  Object.assign(s, { status: 'in_progress', phase: 'green' });
  assert.deepEqual(resolveTarget(m, undefined, undefined), { slice: 'SL-002', task: 'green' });
  assert.deepEqual(resolveTarget(m, 'SL-002', undefined), { slice: 'SL-002', task: 'green' });
  s.type = 'spike';
  assert.deepEqual(resolveTarget(m, 'SL-002', undefined), { slice: 'SL-002', task: 'explore' });
});

// ── determinism and errors ───────────────────────────────────────
test('the prompts are the same every time: no dates, no randomness', () => {
  assert.deepEqual(prompts('SL-002', 'red'), prompts('SL-002', 'red'));
  assert.ok(!/\b20\d\d-\d\d-\d\d\b/.test(Object.values(prompts('SL-002', 'red')).join('\n')));
});

test('buildPrompts refuses an unknown slice, an unknown task and a task the slice does not have', () => {
  fails(() => prompts('SL-099', 'red'), /unknown slice/);
  fails(() => prompts('SL-002', 'dance'), /unknown task/);
  fails(() => prompts('SL-008', 'red'), /refactor slice.*no red/i);
});

// ── writing the files ────────────────────────────────────────────
test('writePrompts: writes one file per part under .sddpp/prompts/<slice>/, and says which', (t) => {
  const { dir } = repo(t);
  const result = writePrompts(dir, 'SL-002', 'red');
  assert.deepEqual(result.files.sort(), ['.sddpp/prompts/SL-002/red.design.md', '.sddpp/prompts/SL-002/red.negative.md', '.sddpp/prompts/SL-002/red.system.md']);
  for (const f of result.files) assert.ok(existsSync(join(dir, f)));
  assert.match(readFileSync(join(dir, result.files.find((f) => f.endsWith('system.md'))), 'utf8'), /SL-002/);
});

test('writePrompts: no design file when the design prompt does not apply', (t) => {
  const r = repo(t);
  const file = '.sddpp/slices/SL-004-reject-invalid-titles.md';
  r.write({ [file]: readFileSync(join(r.dir, file), 'utf8').replace(/components: \[.*\]/, 'components: [backend]').replace(/quality_attributes: \[.*\]\n/, '') });
  const adrs = readdirSync(join(r.dir, '.architect/decisions'));
  for (const a of adrs) r.write({ [`.architect/decisions/${a}`]: readFileSync(join(r.dir, '.architect/decisions', a), 'utf8').replace(/drivers: \[.*\]/, 'drivers: [CON-001]') });
  const result = writePrompts(r.dir, 'SL-004', 'red');
  assert.ok(!result.files.some((f) => f.endsWith('design.md')), result.files.join(','));
});

test('writePrompts: never overwrites a file a person may have edited, unless forced', (t) => {
  const { dir } = repo(t);
  writePrompts(dir, 'SL-002', 'red');
  const file = join(dir, '.sddpp/prompts/SL-002/red.negative.md');
  writeFileSync(file, 'my own rules\n');
  fails(() => writePrompts(dir, 'SL-002', 'red'), /already exist|--force/);
  assert.equal(readFileSync(file, 'utf8'), 'my own rules\n');
  writePrompts(dir, 'SL-002', 'red', { force: true });
  assert.notEqual(readFileSync(file, 'utf8'), 'my own rules\n');
});

test('the prompt files do not break validation or the generated views', (t) => {
  const { dir } = repo(t);
  writePrompts(dir, 'SL-002', 'red');
  const out = spawnSync('node', [CLI, 'validate', dir, '--strict'], { encoding: 'utf8' });
  assert.equal(out.status, 0, out.stdout + out.stderr);
});

// ── the command ──────────────────────────────────────────────────
const ppc = (cwd, ...args) => spawnSync('node', [CLI, ...args], { cwd, encoding: 'utf8' });

test('CLI: prompt writes the files for a slice and task, and --stdout prints them without writing', (t) => {
  const { dir } = repo(t);
  const printed = ppc(dir, 'prompt', 'SL-002', '--task', 'red', '--stdout', dir);
  assert.equal(printed.status, 0, printed.stderr);
  assert.match(printed.stdout, /# System prompt/);
  assert.match(printed.stdout, /# Negative prompt/);
  assert.ok(!existsSync(join(dir, '.sddpp/prompts')));
  const written = ppc(dir, 'prompt', 'SL-002', '--task', 'red', dir);
  assert.equal(written.status, 0, written.stderr);
  assert.match(written.stdout, /\.sddpp\/prompts\/SL-002\/red\.system\.md/);
  assert.ok(existsSync(join(dir, '.sddpp/prompts/SL-002/red.system.md')));
  assert.equal(ppc(dir, 'prompt', 'SL-002', '--task', 'red', dir).status, 1, 'second run refuses to overwrite');
  assert.equal(ppc(dir, 'prompt', 'SL-002', '--task', 'red', '--force', dir).status, 0);
});

test('CLI: without --task the phase of the slice in progress decides; without a slice, the one in progress', (t) => {
  const { dir } = repo(t);
  assert.equal(ppc(dir, 'prompt', 'SL-002', dir).status, 1, 'a slice that is not in progress needs --task');
  assert.equal(ppc(dir, 'start', 'SL-001', dir).status, 0);
  const out = ppc(dir, 'prompt', '--stdout', dir);
  assert.equal(out.status, 0, out.stderr);
  assert.match(out.stdout, /SL-001/);
  assert.match(out.stdout, /red/);
});
