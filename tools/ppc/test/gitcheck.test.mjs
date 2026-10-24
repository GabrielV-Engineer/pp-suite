import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadProject } from '../src/load.mjs';
import { RULES } from '../src/validate.mjs';
import { checkGit } from '../src/gitcheck.mjs';

const EXAMPLE = fileURLToPath(new URL('../../../examples/todo-app/', import.meta.url));
const CLI = fileURLToPath(new URL('../bin/ppc.mjs', import.meta.url));
const lines = (n) => Array.from({ length: n }, (_, i) => `line ${i}`).join('\n') + '\n';

/** A real git repository holding a copy of the example, so the checks run against real history. */
function repo(t) {
  const dir = mkdtempSync(join(tmpdir(), 'ppc-git-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  cpSync(EXAMPLE, dir, { recursive: true });
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'Test');
  git('config', 'commit.gpgsign', 'false');
  git('add', '-A');
  git('commit', '-q', '-m', 'base');
  const commit = (message, files) => {
    for (const [path, content] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), content);
    }
    git('add', '-A');
    git('commit', '-q', '-m', message);
    return git('rev-parse', 'HEAD');
  };
  return { dir, git, commit };
}

const RED = { 'tests/health.test.js': lines(3) }; // 3 changed lines
const GREEN = { 'src/health.js': lines(5) }; // 5 changed lines

/** SL-001 finished with an audit that points at real commits. Returns the model and the shas. */
function finished(t, { red = RED, green = GREEN, diff_lines = 8, greenFirst = false } = {}) {
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
    diff_lines, tests_added: 1, mutation_score: null, decisions: [], debt_created: [], deviations: [],
  };
  return { ...r, model, audit: s.audit, redSha, greenSha };
}
const rules = (found) => found.map((f) => f.rule);

test('the new rules are part of the published catalog', () => {
  for (const id of ['C01', 'C02', 'C03', 'C04', 'C05']) assert.ok(id in RULES, `${id} missing from RULES`);
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
  const { model, dir } = finished(t, { green: { ...GREEN, 'tests/health.test.js': lines(3) + 'extra\n' }, diff_lines: 9 });
  const found = checkGit(model, dir);
  assert.deepEqual(rules(found), ['C02']);
  assert.match(found[0].message, /tests\/health\.test\.js/);
});

test('C03: a red commit that touches production code is reported', (t) => {
  const { model, dir } = finished(t, { red: { ...RED, 'src/prod.js': lines(2) }, diff_lines: 10 });
  assert.deepEqual(rules(checkGit(model, dir)), ['C03']);
});

test('C04: a diff_lines that does not match the commits is reported', (t) => {
  const { model, dir } = finished(t, { diff_lines: 99 });
  const found = checkGit(model, dir);
  assert.deepEqual(rules(found), ['C04']);
  assert.match(found[0].message, /99/);
  assert.match(found[0].message, /\b8\b/);
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
  const audit = (commits, diff_lines) => ({ commits, diff_lines, tests_added: 0, mutation_score: null, decisions: [], debt_created: [], deviations: [] });

  s.audit = audit([{ sha: clean, kind: 'structural' }], 4);
  assert.deepEqual(checkGit(model, r.dir), []);

  s.audit = audit([{ sha: clean, kind: 'structural' }, { sha: touching, kind: 'structural' }], 7);
  assert.deepEqual(rules(checkGit(model, r.dir)), ['C02']);
});

test('binary files count as zero lines and renames count as delete plus add', (t) => {
  const r = repo(t);
  const first = r.commit('add', { 'src/a.js': lines(4) });
  const binary = r.commit('binary', { 'src/logo.bin': Buffer.from([0, 1, 2, 3, 0, 255]) });
  const model = loadProject(r.dir);
  const s = model.slices.find((x) => x.data.id === 'SL-008').data;
  s.status = 'done';
  s.audit = { commits: [{ sha: first, kind: 'structural' }, { sha: binary, kind: 'structural' }], diff_lines: 4, tests_added: 0, mutation_score: null, decisions: [], debt_created: [], deviations: [] };
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
  diff_lines: ${diff}
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
  writeAudit(dir, { redSha, greenSha, diff: 8 });
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
