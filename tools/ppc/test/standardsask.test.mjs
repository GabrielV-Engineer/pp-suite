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
  assert.match(shown.stdout, /0 of 4 standards decided/);
  assert.equal(ppc(dir, 'decide-standard', 'git', '--adopt', 'trunk', '--squash').status, 2);
  const r = ppc(dir, 'decide-standard', 'git', '--adopt', 'branch-per-slice', '--by', 'owner');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /git: branch-per-slice/);
  assert.match(ppc(dir, 'standards').stdout, /1 of 4 standards decided/);
  const refused = ppc(dir, 'decide-standard', 'git', '--not-needed', '--reason', 'We never use it', '--by', 'owner');
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /cannot be not needed/);
  assert.equal(ppc(dir, 'show', 'git').status, 0);
  assert.match(askFor(loadProject(dir), 'git').questions[0].question, /Now: branch-per-slice/);
  assert.equal(ppc(dir, 'ask', 'standards').status, 0);
});
