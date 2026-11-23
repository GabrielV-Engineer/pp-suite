import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { loadProject } from '../src/load.mjs';
import { askFor, renderDecision } from '../src/decisions.mjs';
import { STANDARDS } from '../src/standards.mjs';
import { CLI, repo } from './helpers.mjs';

const ppc = (dir, ...args) => spawnSync(process.execPath, [CLI, ...args, dir], { encoding: 'utf8' });
/** A copy of the example with no standards decided yet. */
const fresh = (t) => {
  const r = repo(t);
  rmSync(join(r.dir, '.sddpp/standards.yaml'), { force: true });
  return r;
};
const commandOf = (option) => option.label.split(' — ').slice(1).join(' — ');
/** Split a command line the way a shell would for these simple quoted arguments. */
const words = (line) => [...line.matchAll(/"([^"]*)"|(\S+)/g)].map((m) => m[1] ?? m[2]);

test('ppc show: a card for all of them and one per standard', (t) => {
  const { dir } = fresh(t);
  const m = loadProject(dir);
  const all = renderDecision(m, 'standards');
  for (const s of STANDARDS) assert.match(all, new RegExp(`^  ${s.id}`, 'm'));
  const one = renderDecision(m, 'security');
  assert.match(one, /Recommended/);
  assert.match(one, /basic/);
  assert.match(one, /strict/);
});

test('ppc ask standards: one answer takes every recommendation; nothing to ask once all are decided', (t) => {
  const { dir } = fresh(t);
  const q = askFor(loadProject(dir), 'standards').questions[0];
  assert.equal(commandOf(q.options[0]), 'ppc decide-standard --accept-recommended');
  assert.match(q.question, /security basic/);
  assert.ok(q.options.length <= 4);
  ppc(dir, 'decide-standard', '--accept-recommended', '--by', 'owner');
  assert.equal(askFor(loadProject(dir), 'standards'), null);
});

test('ppc ask <standard>: the recommendation first, at most four options, every command accepted by ppc', (t) => {
  for (const s of STANDARDS) {
    const { dir } = fresh(t);
    const q = askFor(loadProject(dir), s.id).questions[0];
    assert.ok(q.options.length >= 2 && q.options.length <= 4, `${s.id}: ${q.options.length} options`);
    assert.match(q.options[0].label, /recommended/i, `${s.id}: the recommendation comes first`);
    for (const option of q.options.filter(commandOf)) {
      const { dir: copy } = fresh(t);
      const [, ...args] = words(commandOf(option));
      const r = ppc(copy, ...args, '--by', 'owner');
      assert.equal(r.status, 0, `${s.id}: "${option.label}" failed: ${r.stderr}`);
      const saved = parseYaml(readFileSync(join(copy, '.sddpp/standards.yaml'), 'utf8')).standards;
      assert.ok(saved.some((x) => x.id === s.id));
    }
  }
});

test('ppc ask <standard> --details: a custom answer in the person\'s words', (t) => {
  const { dir } = fresh(t);
  const q = askFor(loadProject(dir), 'observability', { details: 'Sentry for errors in production' }).questions[0];
  assert.equal(commandOf(q.options[0]), 'ppc decide-standard observability --adopt custom --details "Sentry for errors in production"');
  assert.throws(() => askFor(loadProject(dir), 'observability', { details: 'say "hi"' }), /double quote/);
});

test('CLI: ppc standards prints them; decide-standard refuses unknown options and records a decision', (t) => {
  const { dir } = fresh(t);
  const shown = ppc(dir, 'standards');
  assert.equal(shown.status, 0);
  assert.match(shown.stdout, /0 of 5 standards decided/);
  assert.equal(ppc(dir, 'decide-standard', 'git', '--adopt', 'trunk', '--squash').status, 2);
  const r = ppc(dir, 'decide-standard', 'git', '--adopt', 'branch-per-slice', '--by', 'owner');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /git: branch-per-slice/);
  assert.match(ppc(dir, 'standards').stdout, /1 of 5 standards decided/);
  const refused = ppc(dir, 'decide-standard', 'git', '--not-needed', '--reason', 'We never use it', '--by', 'owner');
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /cannot be not needed/);
  assert.equal(ppc(dir, 'show', 'git').status, 0);
  assert.match(askFor(loadProject(dir), 'git').questions[0].question, /Now: branch-per-slice/);
  assert.equal(ppc(dir, 'ask', 'standards').status, 0);
});

// ── postponing a deferred standard whose trigger has happened (found in the first real project: S02 on every /pp after "Not yet") ───
const due = (t) => {
  const r = repo(t);
  const m = loadProject(r.dir);
  m.facts = { gitRemote: 'git@github.com:someone/app.git', ciConfig: [] };
  m.standards.data.standards = m.standards.data.standards.map((s) => (s.id === 'ci' ? { id: 'ci', decision: 'later', trigger: 'git_remote', decided_by: 'o', decided_on: '2026-11-19' } : s));
  return m;
};

test('ppc ask ci: a standard that waited for a remote, which has appeared, can wait for the next trigger instead of being asked on every run', (t) => {
  const q = askFor(due(t), 'ci').questions[0];
  const commands = q.options.map(commandOf);
  assert.ok(commands.includes('ppc decide-standard ci --later --trigger ci_config'), commands.join(' | '));
  assert.ok(commands.includes('ppc decide-standard ci --adopt github'));
  assert.ok(q.options.length <= 4);
  const later = q.options.find((o) => commandOf(o).includes('--trigger ci_config'));
  assert.match(later.label, /Later, when a CI configuration appears/);
});

test('ppc ask ci: with the next trigger already true there is nothing to postpone to', (t) => {
  const m = due(t);
  m.facts.ciConfig = ['.github/workflows/ci.yml'];
  assert.ok(!askFor(m, 'ci').questions[0].options.some((o) => commandOf(o).includes('--later')));
});

test('postponing is recorded as a decision: the earlier "later" goes to history, and S02 stops while the new trigger has not happened', (t) => {
  const r = repo(t);
  const out = ppc(r.dir, 'decide-standard', 'ci', '--later', '--trigger', 'ci_config', '--by', 'owner');
  assert.equal(out.status, 0, out.stderr);
  const ci = parseYaml(readFileSync(join(r.dir, '.sddpp/standards.yaml'), 'utf8')).standards.find((s) => s.id === 'ci');
  assert.deepEqual([ci.decision, ci.trigger], ['later', 'ci_config']);
  assert.ok(ci.history?.length >= 1);
});
