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
import { renderDecision, askFor, DecisionError } from '../src/decisions.mjs';
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
  const agent = nextJson({ headline: 'h', actions: [{ who: 'agent', what: 'Plan', command: '/pp-plan' }], waiting: [], blocked: [], changes: [] });
  assert.equal(agent.kind, 'agent-step');
  assert.equal(agent.skill, 'pp-plan');
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
  const withReason = repo(t);
  approve(withReason.dir, 'DEBT-BE-001', { by: 'owner', drop: true, reason: 'not testing on the Mac before the MVP' });
  assert.match(readFileSync(join(withReason.dir, '.sddpp/debt.yaml'), 'utf8'), /dropped_reason: not testing on the Mac before the MVP/);
});

test('approve: --accept, --drop and --reason are for a debt entry, so a slice or a bare approve refuses them instead of approving', (t) => {
  const r = repo(t);
  planSl001(r);
  for (const [id, extra] of [['SL-001', { drop: true }], ['SL-001', { accept: 'because we said so' }], [undefined, { drop: true }], ['SL-001', { reason: 'a reason long enough' }]]) {
    fails(() => approve(r.dir, id, { by: 'owner', ...extra }), /apply to a debt entry/);
  }
  assert.equal(slice(r.dir, 'SL-001').status, 'planned', 'nothing was approved');
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

test('CLI: --drop takes the reason the person gives, from approve and from approve-debt', (t) => {
  for (const args of [['approve', 'DEBT-BE-001', '--drop', '--reason', 'not testing on the Mac before the MVP'],
    ['approve-debt', 'DEBT-BE-001', '--drop', '--reason', 'not testing on the Mac before the MVP', '--by', 'Ana']]) {
    const r = repo(t);
    const out = spawnSync('node', [CLI, ...args, r.dir], { encoding: 'utf8', env: NO_GIT_NAME });
    assert.equal(out.status, 0, out.stderr);
    assert.match(readFileSync(join(r.dir, '.sddpp/debt.yaml'), 'utf8'), /dropped_reason: not testing on the Mac before the MVP/);
  }
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
  assert.match(text, /--drop --reason "<why>"/, 'the card says a drop can carry a reason');
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
  assert.deepEqual(commands, ['ppc approve DEBT-BE-001', 'ppc approve DEBT-BE-001 --accept "accepted in the panel"', 'ppc approve DEBT-BE-001 --drop --reason "dropped in the panel"']);
  assert.ok(ask.questions[0].options.length <= 4);
});

// Found in the first real project (F-P2): debt meant for SL-010 was approved as open, with the slice only named in its trigger text,
// so nothing tied it to SL-010. The panel now offers to approve it into the slice that pays it.
const commandsOf = (ask) => withCommand(ask).map((o) => o.label.split(' — ').at(-1));

test('ask --pay-in: a proposed debt entry can be approved into the slice that pays it, and "open with no slice" is not offered', (t) => {
  const ask = askFor(loadProject(repo(t).dir), 'DEBT-BE-001', { payIn: 'SL-004' }); // SL-004: planned feature slice on the backend
  assert.deepEqual(commandsOf(ask), ['ppc approve DEBT-BE-001 --pay-in SL-004', 'ppc approve DEBT-BE-001 --accept "accepted in the panel"', 'ppc approve DEBT-BE-001 --drop --reason "dropped in the panel"']);
  assert.match(ask.questions[0].options[0].description, /SL-004 pays it/);
  assert.ok(ask.questions[0].options.length <= 4 && ask.questions[0].options.some((o) => !o.label.includes(' — ppc ')));
});

test('ask --pay-in: an open debt entry is asked whether to schedule it into that slice', (t) => {
  const r = repo(t);
  approve(r.dir, 'DEBT-BE-001', { by: 'owner' });
  const ask = askFor(loadProject(r.dir), 'DEBT-BE-001', { payIn: 'SL-004' });
  assert.match(ask.questions[0].question, /DEBT-BE-001.*SL-004/);
  assert.deepEqual(commandsOf(ask), ['ppc schedule-debt DEBT-BE-001 --slice SL-004']);
});

test('ask --pay-in: a slice that cannot pay the debt is refused, and says why', (t) => {
  const r = repo(t);
  const model = loadProject(r.dir);
  const refused = (payIn, pattern) => assert.throws(() => askFor(model, 'DEBT-BE-001', { payIn }), (e) => e instanceof DecisionError && pattern.test(e.message), payIn);
  refused('SL-099', /unknown slice SL-099/);
  refused('SL-001', /skeleton/); // the skeleton pays no debt
  sl(model, 'SL-003').components = ['frontend'];
  refused('SL-003', /does not touch backend/);
  sl(model, 'SL-005').status = 'in_progress';
  refused('SL-005', /planned or ready/);
  sl(model, 'SL-006').status = 'done';
  refused('SL-006', /feature slice that is done/);
});

test('approve --pay-in: the entry is approved and scheduled into the slice in one step, or nothing changes', (t) => {
  const r = repo(t);
  const before = readFileSync(join(r.dir, '.sddpp/debt.yaml'), 'utf8');
  fails(() => approve(r.dir, 'DEBT-BE-001', { by: 'owner', payIn: 'SL-001' }), /skeleton/);
  assert.equal(readFileSync(join(r.dir, '.sddpp/debt.yaml'), 'utf8'), before, 'a refused schedule leaves the entry proposed');
  fails(() => approve(r.dir, 'SL-002', { by: 'owner', payIn: 'SL-004' }), /--pay-in applies to a debt entry/);
  approve(r.dir, 'DEBT-BE-001', { by: 'owner', payIn: 'SL-004' });
  const entry = loadProject(r.dir).debt[0].data.entries.find((e) => e.id === 'DEBT-BE-001');
  assert.deepEqual([entry.status, entry.paid_by, entry.approved_by], ['scheduled', 'SL-004', 'owner']);
  assert.deepEqual(slice(r.dir, 'SL-004').pays, ['DEBT-BE-001']);
  assert.deepEqual(errorsOf(loadProject(r.dir)), []);
  const cli = repo(t);
  const out = spawnSync('node', [CLI, 'approve', 'DEBT-BE-001', '--pay-in', 'SL-004', '--by', 'owner', cli.dir], { encoding: 'utf8' });
  assert.equal(out.status, 0, out.stderr);
  assert.equal(slice(cli.dir, 'SL-004').pays[0], 'DEBT-BE-001');
  const asked = spawnSync('node', [CLI, 'ask', 'DEBT-BE-001', '--pay-in', 'SL-004', cli.dir], { encoding: 'utf8' });
  assert.equal(asked.status, 1, 'a scheduled entry has nothing left to ask');
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
  const bp = '.architect/blueprint.yaml'; // the design moved on, so there is a "read what changed" decision too
  r.write({ [bp]: readFileSync(join(r.dir, bp), 'utf8').replace(/^revision: 1$/m, 'revision: 3') });
  const model = loadProject(r.dir);
  const scratch = mkdtempSync(join(tmpdir(), 'ppc-ledger-'));
  t.after(() => rmSync(scratch, { recursive: true, force: true }));
  const env = { ...process.env, CLAUDE_PROJECT_DIR: scratch };
  const py = (script, payload) => spawnSync('python3', ['-I', join(GUARD_SCRIPTS, script)], { input: JSON.stringify(payload), encoding: 'utf8', env, cwd: scratch });
  let n = 0;
  sl(model, 'SL-002').status = 'in_progress'; // a slice being closed, for the exception questions
  const exception = { budgetReason: "the owner's lock file is generated; hand-written code is about 390", mutationReason: 'a reason that is long enough' };
  for (const [id, extra] of [['SL-001'], ['DEBT-BE-001'], ['DEBT-BE-001', { payIn: 'SL-004' }], ['CR-0001'], ['reread'], ['SL-002', exception], ['SL-002', { budgetReason: exception.budgetReason }]]) {
    for (const option of withCommand(askFor(model, id, extra))) {
      n += 1;
      const command = option.label.split(' — ').at(-1);
      const answers = { [`Q${n}?`]: option.label };
      py('record_answer.py', { tool_name: 'AskUserQuestion', tool_use_id: `toolu_${n}`, session_id: 'S', tool_input: { answers }, tool_response: { answers } });
      const verdict = py('guard.py', { tool_name: 'Bash', tool_use_id: `toolu_b${n}`, session_id: 'S', permission_mode: 'bypassPermissions', tool_input: { command } });
      assert.equal(verdict.status, 0, `${command}: ${verdict.stderr}`);
    }
  }
  assert.ok(n >= 8);
});

const sl = (m, id) => m.slices.find((x) => x.data.id === id).data;

// Found in the first real project: the agent built the budget-exception question by hand. It worked once and failed once, when a `;`
// in the reason was not matched. ppc now writes it, like every other decision, so the label is always what the guard accepts.
test('ask: an exception to the budget or the mutation score is a question with the exact ppc finish command', (t) => {
  const model = loadProject(repo(t).dir);
  sl(model, 'SL-002').status = 'in_progress';
  const reason = 'generated lock file; hand-written code is about 390';
  const budget = withCommand(askFor(model, 'SL-002', { budgetReason: reason }));
  assert.deepEqual(budget.map((o) => o.label.split(' — ').at(-1)), [`ppc finish SL-002 --audit .sddpp/audit-input.json --budget-reason "${reason}"`]);
  const both = withCommand(askFor(model, 'SL-002', { budgetReason: reason, mutationReason: 'the parser mutants are equivalent' }));
  assert.match(both[0].label, /--budget-reason "[^"]+" --mutation-reason "the parser mutants are equivalent"$/);
  assert.match(askFor(model, 'SL-002', { budgetReason: reason }).questions[0].question, new RegExp(reason));
  assert.equal(askFor(model, 'SL-001', { budgetReason: reason }), null, 'only a slice in progress can be closed with an exception');
  assert.throws(() => askFor(model, 'SL-002', { budgetReason: 'say "no"' }), (e) => e instanceof DecisionError && /double quote/.test(e.message));
  assert.throws(() => askFor(model, 'SL-002', { budgetReason: 'short' }), (e) => e instanceof DecisionError && /10 characters/.test(e.message));
});

test('ask: every option says what happens if the person picks it, and no two options of a question say the same', (t) => {
  const r = repo(t);
  planSl001(r);
  const model = loadProject(r.dir);
  sl(model, 'SL-002').status = 'in_progress';
  for (const [id, extra] of [['SL-001'], ['DEBT-BE-001'], ['CR-0001'], ['SL-002', { budgetReason: 'a reason that is long enough' }]]) {
    const options = askFor(model, id, extra).questions[0].options;
    for (const o of options) assert.ok(o.description.length >= 15, `${id}: "${o.label}" says what happens (${o.description})`);
    assert.equal(new Set(options.map((o) => o.description)).size, options.length, `${id}: each option says something different`);
  }
  const yes = askFor(model, 'SL-001').questions[0].options[0].description;
  assert.match(yes, /ready/);
  const change = askFor(model, 'CR-0001').questions[0].options.map((o) => o.description).join(' | ');
  assert.match(change, /revised/);
  assert.match(change, /stays as it is/);
});

test('CLI: ppc ask <slice> --budget-reason prints the question; a reason it cannot carry is refused', (t) => {
  const r = repo(t);
  const file = join(r.dir, '.sddpp/slices/SL-001-deployable-skeleton.md');
  r.write({ '.sddpp/slices/SL-001-deployable-skeleton.md': readFileSync(file, 'utf8').replace(/^status: ready$/m, 'status: in_progress\nphase: build\nmode: light'), '.sddpp/active.json': '{"slice":"SL-001","phase":"build"}\n' });
  const out = spawnSync('node', [CLI, 'ask', 'SL-001', '--budget-reason', 'the lock file is generated by the tool'], { cwd: r.dir, encoding: 'utf8' });
  assert.equal(out.status, 0, out.stderr);
  assert.match(JSON.parse(out.stdout).questions[0].options[0].label, /ppc finish SL-001 --audit \.sddpp\/audit-input\.json --budget-reason "the lock file is generated by the tool"$/);
  const bad = spawnSync('node', [CLI, 'ask', 'SL-001', '--budget-reason', 'say "no" please'], { cwd: r.dir, encoding: 'utf8' });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /double quote/);
});

// The owner's request (2026-11-12): when the person has to read something to decide, the file comes as a link at once.
const link = (path) => `[${path}](${path})`;
test('show: every card ends with the files to read, as links', (t) => {
  const r = repo(t);
  planSl001(r);
  const model = loadProject(r.dir);
  const slice = renderDecision(model, 'SL-001');
  assert.match(slice, /^Read:$/m);
  assert.ok(slice.includes(link('.sddpp/slices/SL-001-deployable-skeleton.md')), slice);
  assert.ok(renderDecision(model, 'DEBT-BE-001').includes(link('.sddpp/debt.yaml')));
  const change = renderDecision(model, 'CR-0001');
  assert.ok(change.includes(link('.sddpp/change-requests/CR-0001-define-the-maximum-title-length.md')) || /\[\.sddpp\/change-requests\/CR-0001[^\]]*\]\(/.test(change), change);
  assert.ok(change.includes(link('.architect/blueprint.yaml')), 'the quality attribute it affects lives in the blueprint');
  Object.assign(sl(model, 'SL-002'), { status: 'in_progress', phase: 'red' });
  const red = renderDecision(model, 'SL-002', { redFiles: ['tests/tasks.test.ts'] });
  assert.ok(red.includes(link('tests/tasks.test.ts')), 'the red tests first');
  sl(model, 'SL-002').phase = 'build'; // being closed now
  const exception = renderDecision(model, 'SL-002', { auditInput: true });
  assert.ok(exception.includes(link('.sddpp/audit-input.json')), 'the audit input, when it exists');
  assert.ok(!renderDecision(model, 'SL-002', {}).includes('audit-input'), 'and not when it does not');
});

test('show: a change request that names a decision or a component links to it', (t) => {
  const model = loadProject(repo(t).dir);
  const cr = model.changeRequests[0].data;
  cr.affects = { adrs: ['ADR-0001'], components: ['backend'] };
  const card = renderDecision(model, cr.id);
  assert.ok(card.includes(link('.architect/decisions/ADR-0001-sqlite-storage.md')), card);
  assert.ok(card.includes(link('.architect/architecture.md')));
});

test('show reread: the change requests applied since, and the blueprint, as links', (t) => {
  const r = repo(t);
  const model = loadProject(r.dir);
  model.blueprint.data.revision = 3;
  Object.assign(model.changeRequests[0].data, { status: 'applied', blueprint_revision: 1 });
  const card = renderDecision(model, 'reread');
  assert.ok(card.includes(link(model.changeRequests[0].file)), card);
  assert.ok(card.includes(link('.architect/blueprint.yaml')));
});

test('CLI: ppc show links the audit input only when it is there', (t) => {
  const r = repo(t);
  const file = join(r.dir, '.sddpp/slices/SL-001-deployable-skeleton.md');
  r.write({ '.sddpp/slices/SL-001-deployable-skeleton.md': readFileSync(file, 'utf8').replace(/^status: ready$/m, 'status: in_progress\nphase: build\nmode: light'), '.sddpp/active.json': '{"slice":"SL-001","phase":"build"}\n' });
  const show = () => spawnSync('node', [CLI, 'show', 'SL-001'], { cwd: r.dir, encoding: 'utf8' }).stdout;
  assert.doesNotMatch(show(), /audit-input/);
  r.write({ '.sddpp/audit-input.json': '{}\n' });
  assert.match(show(), /\[\.sddpp\/audit-input\.json\]\(\.sddpp\/audit-input\.json\)/);
});
