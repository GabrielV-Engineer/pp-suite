import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadProject } from '../src/load.mjs';
import { RULES } from '../src/validate.mjs';
import { checkGit } from '../src/gitcheck.mjs';
import { CLI, EXAMPLE, lines, repo } from './helpers.mjs';

const RED = { 'tests/health.test.js': lines(3) }; // 3 changed lines
const GREEN = { 'src/health.js': lines(5) }; // 5 changed lines

/** SL-001 finished with an audit that points at real commits. Returns the model and the shas. */
function finished(t, { red = RED, green = GREEN, production_lines = 5, test_lines = 3, greenFirst = false } = {}) {
  const r = repo(t);
  let redSha, greenSha;
  if (greenFirst) {
    greenSha = r.commit('green', green);
    redSha = r.commit('red', red);
  } else {
    redSha = r.commit('red', red);
    greenSha = r.commit('green', green);
  }
  const model = loadProject(r.dir);
  const s = model.slices.find((x) => x.data.id === 'SL-001').data;
  Object.assign(s, { status: 'done', red_approved_by: 'reviewer' });
  s.audit = {
    commits: [{ sha: redSha, kind: 'red' }, { sha: greenSha, kind: 'green' }],
    production_lines, test_lines, tests_added: 1, mutation_score: null, decisions: [], debt_created: [], deviations: [],
  };
  return { ...r, model, audit: s.audit, redSha, greenSha };
}
const rules = (found) => found.map((f) => f.rule);
/** Commit extra files on top of whatever `finished` built, inside the same temporary repository. */
const repoCommit = (dir, files) => {
  const run = (...a) => spawnSync('git', a, { cwd: dir, encoding: 'utf8' });
  for (const [path, content] of Object.entries(files)) writeFileSync(join(dir, path), content);
  run('add', '-A');
  run('commit', '-q', '-m', 'extra');
  return run('rev-parse', 'HEAD').stdout.trim();
};

test('the new rules are part of the published catalog', () => {
  for (const id of ['C01', 'C02', 'C03', 'C04', 'C05', 'C06', 'C07']) assert.ok(id in RULES, `${id} missing from RULES`);
});

test('a history that matches its audit has no findings', (t) => {
  const { model, dir } = finished(t);
  assert.deepEqual(checkGit(model, dir), []);
});

test('a project with no audited slice needs no git at all', () => {
  assert.deepEqual(checkGit(loadProject(EXAMPLE), '/nonexistent-so-git-would-fail'), []);
});

test('C01: a commit that does not exist is reported', (t) => {
  const { model, dir, audit } = finished(t);
  audit.commits[0].sha = 'deadbeef';
  assert.ok(rules(checkGit(model, dir)).includes('C01'));
});

test('C02: a green commit that touches a test file is reported', (t) => {
  const { model, dir } = finished(t, { green: { ...GREEN, 'tests/health.test.js': lines(3) + 'extra\n' }, test_lines: 4 });
  const found = checkGit(model, dir);
  assert.deepEqual(rules(found), ['C02']);
  assert.match(found[0].message, /tests\/health\.test\.js/);
});

test('C03: a red commit that touches production code is reported', (t) => {
  const { model, dir } = finished(t, { red: { ...RED, 'src/prod.js': lines(2) }, production_lines: 7 });
  assert.deepEqual(rules(checkGit(model, dir)), ['C03']);
});

test('C04: a production_lines that does not match the commits is reported', (t) => {
  const { model, dir } = finished(t, { production_lines: 99 });
  const found = checkGit(model, dir);
  assert.deepEqual(rules(found), ['C04']);
  assert.match(found[0].message, /production/);
  assert.match(found[0].message, /99/);
  assert.match(found[0].message, /\b5\b/);
});

test('C04: a test_lines that does not match the commits is reported', (t) => {
  const { model, dir } = finished(t, { test_lines: 50 });
  const found = checkGit(model, dir);
  assert.deepEqual(rules(found), ['C04']);
  assert.match(found[0].message, /test/);
  assert.match(found[0].message, /\b50\b/);
});

test('generated files (lockfiles) count as neither production nor test lines', (t) => {
  const { model, dir } = finished(t, { green: { ...GREEN, 'package-lock.json': lines(40), 'sub/yarn.lock': lines(10) } });
  assert.deepEqual(checkGit(model, dir), []); // still 5 production and 3 test lines
});

test('C05: the red commit must come before the green commit in history', (t) => {
  const { model, dir } = finished(t, { greenFirst: true });
  assert.deepEqual(rules(checkGit(model, dir)), ['C05']);
});

test('a refactor slice may not touch test files (C02) but may change production code', (t) => {
  const r = repo(t);
  const clean = r.commit('structural', { 'src/rules.js': lines(4) });
  const touching = r.commit('structural 2', { 'tests/health.test.js': lines(3) });
  const model = loadProject(r.dir);
  const s = model.slices.find((x) => x.data.id === 'SL-008').data;
  s.status = 'done';
  const audit = (commits, production_lines, test_lines) => ({ commits, production_lines, test_lines, tests_added: 0, mutation_score: null, decisions: [], debt_created: [], deviations: [] });

  s.audit = audit([{ sha: clean, kind: 'structural' }], 4, 0);
  assert.deepEqual(checkGit(model, r.dir), []);

  s.audit = audit([{ sha: clean, kind: 'structural' }, { sha: touching, kind: 'structural' }], 4, 3);
  assert.deepEqual(rules(checkGit(model, r.dir)), ['C02']);
});

test('C02: a refactor-kind commit may not touch tests in any slice, since green and refactor both lock them', (t) => {
  const { model, dir, audit } = finished(t);
  const touching = repoCommit(dir, { 'tests/health.test.js': lines(3) + 'weakened\n' });
  audit.commits.push({ sha: touching, kind: 'refactor' });
  audit.test_lines = 4;
  assert.deepEqual(rules(checkGit(model, dir)), ['C02']);
});

test('contract bookkeeping (.sddpp, .architect) is not code: it never trips C03 and is not measured', (t) => {
  const { model, dir } = finished(t, { red: { ...RED, '.sddpp/active.json': '{"slice":"SL-001","phase":"red"}\n', '.sddpp/notes.md': lines(30) } });
  assert.deepEqual(checkGit(model, dir), []); // diff stays 3 + 5 = 8
});

test('binary files count as zero lines and renames count as delete plus add', (t) => {
  const r = repo(t);
  const first = r.commit('add', { 'src/a.js': lines(4) });
  const binary = r.commit('binary', { 'src/logo.bin': Buffer.from([0, 1, 2, 3, 0, 255]) });
  const model = loadProject(r.dir);
  const s = model.slices.find((x) => x.data.id === 'SL-008').data;
  s.status = 'done';
  s.audit = { commits: [{ sha: first, kind: 'structural' }, { sha: binary, kind: 'structural' }], production_lines: 4, test_lines: 0, tests_added: 0, mutation_score: null, decisions: [], debt_created: [], deviations: [] };
  assert.deepEqual(checkGit(model, r.dir), []);
});

// ── CLI ──────────────────────────────────────────────────────────
const ppc = (...args) => spawnSync('node', [CLI, ...args], { encoding: 'utf8' });

/** Write the audit into SL-001's real file, so the CLI reads it from disk. */
function writeAudit(dir, { redSha, greenSha, diff }) {
  const file = join(dir, '.sddpp/slices/SL-001-deployable-skeleton.md');
  const audit = `red_approved_by: reviewer
audit:
  commits:
    - sha: ${redSha}
      kind: red
    - sha: ${greenSha}
      kind: green
  production_lines: ${diff}
  test_lines: 3
  tests_added: 1
  mutation_score: null
  decisions: []
  debt_created: []
  deviations: []
`;
  writeFileSync(file, readFileSync(file, 'utf8').replace('status: ready', 'status: done').replace('approved_by: example-owner\n---', `approved_by: example-owner\n${audit}---`));
}

test('CLI: check-git passes on a project with no audits and on a matching history', (t) => {
  assert.equal(ppc('check-git', EXAMPLE).status, 0);

  const { dir, redSha, greenSha } = finished(t);
  writeAudit(dir, { redSha, greenSha, diff: 5 });
  const r = ppc('check-git', dir);
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test('CLI: check-git fails with exit 1 when the audit lies about the diff', (t) => {
  const { dir, redSha, greenSha } = finished(t);
  writeAudit(dir, { redSha, greenSha, diff: 3 });
  const r = ppc('check-git', dir);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /C04/);
});

test('CLI: check-git refuses an invalid project', (t) => {
  const { dir } = finished(t);
  rmSync(join(dir, '.architect/glossary.md'));
  assert.equal(ppc('check-git', dir).status, 1);
});

// ── tests and their runner are locked from the approved red commit to the end of the slice ──
/** red, then `between` (not listed in the audit), then green: the audit lists only red and green. */
function withUnlistedCommit(t, between, { red = RED, green = GREEN } = {}) {
  const r = repo(t);
  const redSha = r.commit('red', red);
  r.commit('something nobody listed', between);
  const greenSha = r.commit('green', green);
  const model = loadProject(r.dir);
  const s = model.slices.find((x) => x.data.id === 'SL-001').data;
  Object.assign(s, { status: 'done', red_approved_by: 'reviewer' });
  s.audit = {
    commits: [{ sha: redSha, kind: 'red' }, { sha: greenSha, kind: 'green' }],
    production_lines: 5, test_lines: 3, tests_added: 1, mutation_score: null, decisions: [], debt_created: [], deviations: [],
  };
  return { ...r, model, redSha, greenSha };
}

test('C06: a commit between red and green that weakens a test is caught even though the audit does not list it', (t) => {
  const { model, dir } = withUnlistedCommit(t, { 'tests/health.test.js': lines(3) + 'weakened\n' });
  const found = checkGit(model, dir).filter((f) => f.rule === 'C06');
  assert.equal(found.length, 1);
  assert.match(found[0].message, /tests\/health\.test\.js/);
});

test('C06: deleting an approved test between red and green is caught as well', (t) => {
  const r = repo(t);
  const redSha = r.commit('red', RED);
  r.git('rm', '-q', 'tests/health.test.js');
  r.git('commit', '-q', '-m', 'quietly drop the test');
  const greenSha = r.commit('green', GREEN);
  const model = loadProject(r.dir);
  const s = model.slices.find((x) => x.data.id === 'SL-001').data;
  s.audit = { commits: [{ sha: redSha, kind: 'red' }, { sha: greenSha, kind: 'green' }], production_lines: 5, test_lines: 3, tests_added: 1, mutation_score: null, decisions: [], debt_created: [], deviations: [] };
  assert.ok(rules(checkGit(model, r.dir)).includes('C06'));
});

test('C06: an unlisted commit that touches no test is fine, and so is later work on the same test file', (t) => {
  const { model, dir } = withUnlistedCommit(t, { 'src/other.js': lines(2), '.sddpp/notes.md': 'x\n' });
  assert.ok(!rules(checkGit(model, dir)).includes('C06'));
  repoCommit(dir, { 'tests/health.test.js': lines(3) + 'a later slice adds a case\n' }); // after the slice ended
  assert.ok(!rules(checkGit(model, dir)).includes('C06'));
});

const pkg = (testScript, extra = {}) => JSON.stringify({ name: 'x', scripts: { test: testScript }, ...extra }, null, 2) + '\n';

test('C07: changing the test script between red and green is caught', (t) => {
  const { model, dir } = withUnlistedCommit(t, { 'package.json': pkg('true') }, { red: { ...RED, 'package.json': pkg('node --test') } });
  assert.ok(rules(checkGit(model, dir)).includes('C07'));
});

test('C07: other changes to package.json are fine, and a package.json born after red is not compared', (t) => {
  const kept = withUnlistedCommit(t, { 'package.json': pkg('node --test', { dependencies: { hono: '^4' } }) }, { red: { ...RED, 'package.json': pkg('node --test') } });
  assert.ok(!rules(checkGit(kept.model, kept.dir)).includes('C07'));
  const born = withUnlistedCommit(t, { 'package.json': pkg('node --test') });
  assert.ok(!rules(checkGit(born.model, born.dir)).includes('C07'));
});

test('C06: a reopened red phase may change tests; only what follows the last red commit is locked', (t) => {
  const r = repo(t);
  const red1 = r.commit('red', RED);
  const red2 = r.commit('red again, after the human reopened the tests', { 'tests/health.test.js': lines(3) + 'a better case\n' });
  const green = r.commit('green', GREEN);
  const model = loadProject(r.dir);
  const s = model.slices.find((x) => x.data.id === 'SL-001').data;
  s.audit = {
    commits: [{ sha: red1, kind: 'red' }, { sha: red2, kind: 'red' }, { sha: green, kind: 'green' }],
    production_lines: 5, test_lines: 3 + 1, tests_added: 1, mutation_score: null, decisions: [], debt_created: [], deviations: [],
  };
  assert.ok(!rules(checkGit(model, r.dir)).includes('C06'));
});
