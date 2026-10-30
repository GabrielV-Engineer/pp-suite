import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadProject } from '../src/load.mjs';
import { validateModel } from '../src/validate.mjs';
import { nextSteps, nextJson } from '../src/next.mjs';
import { approve, start, LifecycleError } from '../src/lifecycle.mjs';
import { renderDecision, askFor } from '../src/decisions.mjs';
import { CLI, lines, repo } from './helpers.mjs';

const slice = (dir, id) => loadProject(dir).slices.find((s) => s.data.id === id).data;
const fails = (fn, pattern) => assert.throws(fn, (e) => e instanceof LifecycleError && pattern.test(e.message));
const NO_GIT_NAME = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' };
const errorsOf = (m) => validateModel(m).filter((f) => f.severity === 'error');

/** The example has SL-001 ready; this puts it back to planned, so a person has something to approve. */
function planSl001({ write, dir }) {
  const file = '.sddpp/slices/SL-001-deployable-skeleton.md';
  const text = readFileSync(join(dir, file), 'utf8').replace(/^status: ready$/m, 'status: planned').replace(/^approved_by: .*\n/m, '');
  write({ [file]: text });
}

// ── next says which decision it is, in a form a skill can read ────
test('next: every decision it asks of a person says what kind it is and about which id', (t) => {
  const r = repo(t);
  planSl001(r);
  const m = loadProject(r.dir);
  const next = nextSteps(m, [], errorsOf(m));
  assert.deepEqual(next.actions[0].decision, { type: 'slice', id: 'SL-001' });
  assert.match(next.actions[0].command, /^ppc approve SL-001$/, 'short command, name from git');
  assert.deepEqual(next.waiting[0].decision, { type: 'debt', id: 'DEBT-BE-001' });
  assert.match(next.waiting[0].command, /^ppc approve DEBT-BE-001$/);
});

test('next --json: a decision, an agent step, a plain command and nothing are four different kinds', (t) => {
  const r = repo(t);
  const m = loadProject(r.dir);
  const run = nextJson(nextSteps(m, [], errorsOf(m)));
  assert.equal(run.kind, 'run');
  assert.equal(run.command, 'ppc start SL-001');
  assert.equal(run.decision, null);
  assert.ok(Array.isArray(run.waiting) && run.waiting[0].decision.type === 'debt');

  planSl001(r);
  const ask = nextJson(nextSteps(loadProject(r.dir), [], []));
  assert.equal(ask.kind, 'decision');
  assert.deepEqual(ask.decision, { type: 'slice', id: 'SL-001' });
  assert.equal(ask.who, 'human');

});

test('next --json: an agent step names the skill to run', () => {
  const agent = nextJson({ headline: 'h', actions: [{ who: 'agent', what: 'Plan', command: '/speckit-sddpp-cycle-slices' }], waiting: [], blocked: [], changes: [] });
  assert.equal(agent.kind, 'agent-step');
  assert.equal(agent.skill, '/speckit-sddpp-cycle-slices');
  const human = nextJson({ headline: 'h', actions: [{ who: 'human', what: 'Interview', command: '/architect' }], waiting: [], blocked: [], changes: [] });
  assert.equal(human.kind, 'human-step', 'a human step that is not an approval');
  assert.equal(nextJson({ headline: 'h', actions: [], waiting: [], blocked: [], changes: [] }).kind, 'none');
});

// ── ppc approve ──────────────────────────────────────────────────
test('approve: with no id it approves the one slice that is waiting, and says which', (t) => {
  const r = repo(t);
  planSl001(r);
  assert.deepEqual(approve(r.dir, undefined, { by: 'owner' }), { slice: 'SL-001', status: 'ready' });
  assert.equal(slice(r.dir, 'SL-001').approved_by, 'owner');
});

test('approve: with no id and a slice waiting for its red tests to be approved, it approves those', (t) => {
  const r = repo(t);
  start(r.dir, 'SL-001');
  r.commit('red(SL-001): health tests', { 'tests/health.test.js': lines(3) });
  assert.deepEqual(approve(r.dir, undefined, { by: 'owner' }), { slice: 'SL-001', phase: 'green' });
});

test('approve: an id of an in-progress slice in red approves its tests, so the person names one thing either way', (t) => {
  const r = repo(t);
  start(r.dir, 'SL-001');
  r.commit('red(SL-001): health tests', { 'tests/health.test.js': lines(3) });
  assert.deepEqual(approve(r.dir, 'SL-001', { by: 'owner' }), { slice: 'SL-001', phase: 'green' });
});

test('approve: with several candidates it refuses and lists them, instead of guessing', (t) => {
  const r = repo(t);
  planSl001(r);
  const file = '.sddpp/slices/SL-002-create-and-list-tasks.md';
  r.write({ [file]: readFileSync(join(r.dir, file), 'utf8').replace('depends_on: [SL-001]', 'depends_on: []') });
  fails(() => approve(r.dir, undefined, { by: 'owner' }), /SL-001.*SL-002|which/s);
  assert.equal(slice(r.dir, 'SL-001').status, 'planned');
});

test('approve: with nothing to approve it says what is waiting instead', (t) => {
  const r = repo(t);
  fails(() => approve(r.dir, undefined, { by: 'owner' }), /nothing .*approve|nothing is waiting/i);
});

test('approve: a debt id decides the debt, with --accept or --drop passed through', (t) => {
  const r = repo(t);
  assert.deepEqual(approve(r.dir, 'DEBT-BE-001', { by: 'owner' }), { debt: 'DEBT-BE-001', status: 'open' });
  const again = repo(t);
  assert.deepEqual(approve(again.dir, 'DEBT-BE-001', { by: 'owner', drop: true }), { debt: 'DEBT-BE-001', status: 'dropped' });
});

test('approve: a change request or an unknown id is not its job, and the message says what to run', (t) => {
  const { dir } = repo(t);
  fails(() => approve(dir, 'CR-0001', { by: 'owner' }), /decide-change/);
  fails(() => approve(dir, 'XYZ-1', { by: 'owner' }), /SL-|DEBT-/);
});

test('approve: without a name it says to set git user.name, and changes nothing', (t) => {
  const r = repo(t);
  planSl001(r);
  fails(() => approve(r.dir, undefined, { by: '' }), /user\.name/);
  assert.equal(slice(r.dir, 'SL-001').status, 'planned');
});

// ── the name comes from git; the old names still work ─────────────
test('CLI: approve-slice and approve-debt take the name from git when --by is missing', (t) => {
  const r = repo(t);
  planSl001(r);
  const run = (...args) => spawnSync('node', [CLI, ...args, r.dir], { encoding: 'utf8', env: NO_GIT_NAME });
  assert.equal(run('approve-slice', 'SL-001').status, 0);
  assert.equal(slice(r.dir, 'SL-001').approved_by, 'Test');
  assert.equal(run('approve-debt', 'DEBT-BE-001').status, 0);
  const noName = repo(t);
  noName.git('config', '--unset', 'user.name');
  planSl001(noName);
  const out = spawnSync('node', [CLI, 'approve-slice', 'SL-001', noName.dir], { encoding: 'utf8', env: NO_GIT_NAME });
  assert.equal(out.status, 1);
  assert.match(out.stderr, /--by|user\.name/);
});

test('CLI: ppc approve works from the command line with and without an id', (t) => {
  const r = repo(t);
  planSl001(r);
  const out = spawnSync('node', [CLI, 'approve', r.dir], { encoding: 'utf8', env: NO_GIT_NAME });
  assert.equal(out.status, 0, out.stderr);
  assert.equal(slice(r.dir, 'SL-001').status, 'ready');
  const debt = spawnSync('node', [CLI, 'approve', 'DEBT-BE-001', '--accept', 'We live with it for now', r.dir], { encoding: 'utf8', env: NO_GIT_NAME });
  assert.equal(debt.status, 0, debt.stderr);
  assert.match(readFileSync(join(r.dir, '.sddpp/debt.yaml'), 'utf8'), /status: accepted/);
});

test('CLI: ppc approve DEBT-… --drop drops the debt', (t) => {
  const r = repo(t);
  const out = spawnSync('node', [CLI, 'approve', 'DEBT-BE-001', '--drop', r.dir], { encoding: 'utf8', env: NO_GIT_NAME });
  assert.equal(out.status, 0, out.stderr);
  assert.match(readFileSync(join(r.dir, '.sddpp/debt.yaml'), 'utf8'), /status: dropped/);
});

test('CLI: ppc next --json prints one JSON object a skill can read', (t) => {
  const r = repo(t);
  planSl001(r);
  const out = spawnSync('node', [CLI, 'next', '--json', r.dir], { encoding: 'utf8' });
  assert.equal(out.status, 0, out.stderr);
  const data = JSON.parse(out.stdout);
  assert.equal(data.kind, 'decision');
  assert.deepEqual(data.decision, { type: 'slice', id: 'SL-001' });
});

// ── the card of a decision, in plain words ────────────────────────
test('show: a slice card says what it does, what it does not, how it is checked and what it waits for', (t) => {
  const { dir } = repo(t);
  const text = renderDecision(loadProject(dir), 'SL-002');
  assert.match(text, /SL-002 +Create a task and see it in the list/);
  assert.match(text, /Does: +Submitting the form creates a task/);
  assert.match(text, /Does not: [\s\S]*Pagination/);
  assert.match(text, /Checked by: [\s\S]*Buy milk/);
  assert.match(text, /Waits for: +SL-001/);
  assert.match(text, /ppc approve SL-002/, 'ends with the one thing to run');
});

test('show: the red tests of a slice are named, so a person approves tests and not an id', (t) => {
  const r = repo(t);
  start(r.dir, 'SL-001');
  const text = renderDecision(loadProject(r.dir), 'SL-001', { redFiles: ['tests/health.test.js'] });
  assert.match(text, /red tests/i);
  assert.match(text, /tests\/health\.test\.js/);
  assert.match(text, /ppc approve\b/);
});

test('show: a debt card says where, what, what it costs to wait and when to look at it again', (t) => {
  const { dir } = repo(t);
  const text = renderDecision(loadProject(dir), 'DEBT-BE-001');
  assert.match(text, /DEBT-BE-001 +The task list is returned in full/);
  assert.match(text, /Component: +backend/);
  assert.match(text, /Cost of waiting: +low — QA-001 assumes/);
  assert.match(text, /Look again: +When the stored task count passes 1000/);
  assert.match(text, /ppc approve DEBT-BE-001/);
  assert.match(text, /--accept/);
  assert.match(text, /--drop/);
});

test('show: a change request card says the problem and the proposal', (t) => {
  const { dir } = repo(t);
  const text = renderDecision(loadProject(dir), 'CR-0001');
  assert.match(text, /CR-0001 +Define the maximum title length/);
  assert.match(text, /Problem: +SL-004 must reject over-long titles/);
  assert.match(text, /Proposal: +Add a limit to the QA-004 scenario/);
  assert.match(text, /decide-change CR-0001/);
});

test('show: an unknown id has no card', (t) => {
  assert.equal(renderDecision(loadProject(repo(t).dir), 'SL-099'), null);
});

test('CLI: ppc show prints the card, and an unknown id is an error', (t) => {
  const { dir } = repo(t);
  const ok = spawnSync('node', [CLI, 'show', 'SL-002', dir], { encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /Create a task and see it in the list/);
  const bad = spawnSync('node', [CLI, 'show', 'SL-099', dir], { encoding: 'utf8' });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /SL-099/);
});

// ── the question for the panel: what a person's click means ───────
const GUARD_SCRIPTS = new URL('../../../sdd-pp/extension/sddpp-guard/scripts/python/', import.meta.url).pathname;
const labelsOf = (ask) => ask.questions[0].options.map((o) => o.label);
const withCommand = (ask) => ask.questions[0].options.filter((o) => o.label.includes(' — ppc '));

test('ask: a slice is approved or not, and the option that approves names the exact command', (t) => {
  const r = repo(t);
  planSl001(r);
  const ask = askFor(loadProject(r.dir), 'SL-001');
  assert.equal(ask.questions.length, 1);
  const q = ask.questions[0];
  assert.match(q.question, /SL-001/);
  assert.match(q.question, /Deployable end-to-end skeleton/);
  assert.equal(q.multiSelect, false);
  assert.ok(q.header.length <= 12, 'the panel shows a short header');
  assert.deepEqual(withCommand(ask).map((o) => o.label.split(' — ').at(-1)), ['ppc approve SL-001']);
  assert.ok(q.options.length >= 2 && q.options.length <= 4, 'the panel takes two to four options');
  assert.ok(q.options.some((o) => !o.label.includes(' — ppc ')), 'there is a way to say no');
});

test('ask: the three outcomes of a debt entry are three different commands, and the reason it records is fixed', (t) => {
  const ask = askFor(loadProject(repo(t).dir), 'DEBT-BE-001');
  const commands = withCommand(ask).map((o) => o.label.split(' — ').at(-1));
  assert.deepEqual(commands, ['ppc approve DEBT-BE-001', 'ppc approve DEBT-BE-001 --accept "accepted in the panel"', 'ppc approve DEBT-BE-001 --drop']);
  assert.ok(ask.questions[0].options.length <= 4);
});

test('ask: a change request is accepted or rejected, and a rejection carries its fixed reason', (t) => {
  const ask = askFor(loadProject(repo(t).dir), 'CR-0001');
  assert.deepEqual(withCommand(ask).map((o) => o.label.split(' — ').at(-1)), ['ppc decide-change CR-0001 --accept', 'ppc decide-change CR-0001 --reject --reason "rejected in the panel"']);
});

test('ask: the tests of a slice in red are approved with the command that has no id', (t) => {
  const r = repo(t);
  start(r.dir, 'SL-001');
  const ask = askFor(loadProject(r.dir), 'SL-001', { redFiles: ['tests/health.test.js'] });
  assert.match(ask.questions[0].question, /tests\/health\.test\.js/);
  assert.deepEqual(withCommand(ask).map((o) => o.label.split(' — ').at(-1)), ['ppc approve']);
});

test('ask: an unknown id, or one with nothing left to decide, has no question', (t) => {
  const r = repo(t);
  assert.equal(askFor(loadProject(r.dir), 'SL-099'), null);
  assert.equal(askFor(loadProject(r.dir), 'SL-001'), null, 'a slice that is already ready');
  approve(r.dir, 'DEBT-BE-001', { by: 'owner' });
  assert.equal(askFor(loadProject(r.dir), 'DEBT-BE-001'), null, 'a debt entry that is already decided');
});

test('ask: every question fits the panel: a short header, two to four options, a way out that is not a command', (t) => {
  const r = repo(t);
  planSl001(r);
  const asked = ['SL-001', 'DEBT-BE-001', 'CR-0001'].map((id) => askFor(loadProject(r.dir), id));
  const red = repo(t);
  start(red.dir, 'SL-001');
  asked.push(askFor(loadProject(red.dir), 'SL-001', { redFiles: ['tests/a.test.js'] }));
  assert.equal(asked.length, 4);
  for (const ask of asked) {
    const q = ask.questions[0];
    assert.ok(q.header.length <= 12, q.header);
    assert.ok(q.options.length >= 2 && q.options.length <= 4, q.question);
    assert.ok(q.options.some((o) => !o.label.includes(' — ppc ')), q.question);
  }
});

test('CLI: ppc ask prints the panel question as JSON, and an unknown id is an error', (t) => {
  const r = repo(t);
  planSl001(r);
  const ok = spawnSync('node', [CLI, 'ask', 'SL-001', r.dir], { encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(JSON.parse(ok.stdout).questions[0].question, /SL-001/);
  assert.equal(spawnSync('node', [CLI, 'ask', 'SL-099', r.dir], { encoding: 'utf8' }).status, 1);
});

test('the commands in the labels are exactly what the guard accepts once the person has chosen them (Node and Python agree)', (t) => {
  const r = repo(t);
  planSl001(r);
  const model = loadProject(r.dir);
  const scratch = mkdtempSync(join(tmpdir(), 'ppc-ledger-'));
  t.after(() => rmSync(scratch, { recursive: true, force: true }));
  const env = { ...process.env, CLAUDE_PROJECT_DIR: scratch };
  const py = (script, payload) => spawnSync('python3', ['-I', join(GUARD_SCRIPTS, script)], { input: JSON.stringify(payload), encoding: 'utf8', env, cwd: scratch });
  let n = 0;
  for (const id of ['SL-001', 'DEBT-BE-001', 'CR-0001']) {
    for (const option of withCommand(askFor(model, id))) {
      n += 1;
      const command = option.label.split(' — ').at(-1);
      const answers = { [`Q${n}?`]: option.label };
      py('record_answer.py', { tool_name: 'AskUserQuestion', tool_use_id: `toolu_${n}`, session_id: 'S', tool_input: { answers }, tool_response: { answers } });
      const verdict = py('guard.py', { tool_name: 'Bash', tool_use_id: `toolu_b${n}`, session_id: 'S', permission_mode: 'bypassPermissions', tool_input: { command } });
      assert.equal(verdict.status, 0, `${command}: ${verdict.stderr}`);
    }
  }
  assert.ok(n >= 5);
});
