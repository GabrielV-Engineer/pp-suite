import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { addedProductionText, analyzeTranscript, commitStats, countMarkers, diffTotals, mutationFor, parseNodeTest } from '../lib.mjs';

/** A throwaway git repository with a base commit. */
function repo(t) {
  const dir = mkdtempSync(join(tmpdir(), 'eval-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 't@example.com');
  git('config', 'user.name', 'T');
  git('config', 'commit.gpgsign', 'false');
  const commit = (message, files) => {
    for (const [path, content] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), content);
    }
    git('add', '-A');
    git('commit', '-q', '-m', message);
    return git('rev-parse', 'HEAD');
  };
  const base = commit('base', { 'src/a.ts': 'export const a = 1;\n', 'tests/a.test.ts': 'test\n' });
  return { dir, git, commit, base };
}

// ── node:test output ─────────────────────────────────────────────
test('parseNodeTest: reads the totals of a node:test run', () => {
  const out = 'ℹ tests 16\nℹ suites 8\nℹ pass 15\nℹ fail 1\nℹ cancelled 0\n';
  assert.deepEqual(parseNodeTest(out), { tests: 16, pass: 15, fail: 1 });
});

test('parseNodeTest: output without totals means the run did not complete, not zero failures', () => {
  assert.deepEqual(parseNodeTest('Error: Cannot find module'), { tests: null, pass: null, fail: null });
});

// ── scope markers (H2) ───────────────────────────────────────────
const markers = [
  { name: 'soft_delete', pattern: 'deleted_at|trash|undo' },
  { name: 'paging', pattern: '\\bLIMIT\\b|\\bOFFSET\\b' },
];

test('countMarkers: counts matches per named marker and in total', () => {
  const counts = countMarkers('SELECT 1 LIMIT 5 OFFSET 2; // undo, trash', markers);
  assert.deepEqual(counts, { soft_delete: 2, paging: 2, total: 4 });
});

test('countMarkers: no match is zero, not missing', () => {
  assert.deepEqual(countMarkers('nothing here', markers), { soft_delete: 0, paging: 0, total: 0 });
});

test('countMarkers: matching is case-insensitive', () => {
  assert.equal(countMarkers('Limit 3', markers).paging, 1);
});

// ── what a condition added ───────────────────────────────────────
test('addedProductionText: only lines added to hand-written production files since the base', (t) => {
  const { dir, commit, base } = repo(t);
  commit('work', {
    'src/a.ts': 'export const a = 1;\nexport const extra = "trash";\n',
    'tests/a.test.ts': 'test\nundo in a test\n',
    'src/notes.md': 'LIMIT in a doc\n',
    'package-lock.json': '{"deleted_at": 1}\n',
    '.sddpp/x.md': 'undo\n',
  });
  const text = addedProductionText(dir, base);
  assert.match(text, /extra = "trash"/);
  assert.doesNotMatch(text, /export const a = 1/); // a line that was already there
  assert.doesNotMatch(text, /undo|LIMIT|deleted_at/);
});

// ── history facts (H3, size) ─────────────────────────────────────
test('commitStats: counts commits that change tests after the first test commit, and the largest commit', (t) => {
  const { dir, commit, base } = repo(t);
  commit('tests', { 'tests/new.test.ts': 'a\nb\nc\n' });
  commit('code', { 'src/b.ts': 'x\n'.repeat(10) });
  commit('edit the tests again', { 'tests/new.test.ts': 'a\nb\nc\nd\n' });
  const stats = commitStats(dir, base);
  assert.equal(stats.commits, 3);
  assert.equal(stats.test_edit_commits_after_first, 1);
  assert.equal(stats.largest_commit_lines, 10);
});

test('commitStats: bookkeeping and lockfiles do not count toward commit size', (t) => {
  const { dir, commit, base } = repo(t);
  commit('big bookkeeping', { '.sddpp/a.md': 'x\n'.repeat(500), 'package-lock.json': 'x\n'.repeat(500), 'src/b.ts': 'y\n' });
  assert.equal(commitStats(dir, base).largest_commit_lines, 1);
});

test('commitStats: no commits since the base is zero everywhere', (t) => {
  const { dir, base } = repo(t);
  assert.deepEqual(commitStats(dir, base), { commits: 0, test_edit_commits_after_first: 0, largest_commit_lines: 0 });
});

// ── session transcript (H3, guard) ───────────────────────────────
const use = (name, input) => ({ message: { content: [{ type: 'tool_use', name, input }] } });
const result = (content, is_error) => ({ message: { content: [{ type: 'tool_result', content, is_error }] } });

test('analyzeTranscript: counts edits to test files and real guard blocks', () => {
  const lines = [
    use('Edit', { file_path: 'tests/a.test.ts' }),
    use('Edit', { file_path: 'src/a.ts' }),
    use('Write', { file_path: 'tests/b.test.ts' }), // a new file is not an edit of an existing test
    result('SDD.PP guard: tests are locked', true),
    result('the file mentions SDD.PP guard: in a comment', false),
    result('ordinary error', true),
  ].map((o) => JSON.stringify(o));
  assert.deepEqual(analyzeTranscript(lines), { test_edit_calls: 1, guard_blocks: 1 });
});

test('analyzeTranscript: tolerates blank and corrupt lines', () => {
  assert.deepEqual(analyzeTranscript(['', 'not json', JSON.stringify({})]), { test_edit_calls: 0, guard_blocks: 0 });
});

// ── mutation of what a condition wrote (H1) ──────────────────────
const killed = { status: 'Killed', mutatorName: 'M', replacement: 'x', location: { start: { line: 1, column: 1 } } };
const survived = { ...killed, status: 'Survived' };

test('mutationFor: mutates the production files changed since the base and reports per file', (t) => {
  const { dir, commit, base } = repo(t);
  commit('work', { 'src/b.ts': 'x\n', 'src/c.ts': 'y\n', 'tests/b.test.ts': 't\n' });
  const seen = [];
  const runner = (root, files) => {
    seen.push(files);
    return { files: { 'src/b.ts': { mutants: [killed, killed] }, 'src/c.ts': { mutants: [killed, survived] } } };
  };
  const m = mutationFor(dir, base, runner);
  assert.deepEqual(seen, [['src/b.ts', 'src/c.ts']]);
  assert.equal(m.score, 0.75);
  assert.deepEqual(m.by_file, { 'src/b.ts': 1, 'src/c.ts': 0.5 });
  assert.equal(m.survivors, 1);
});

test('mutationFor: nothing written means no score', (t) => {
  const { dir, base } = repo(t);
  const m = mutationFor(dir, base, () => assert.fail('must not run'));
  assert.equal(m.score, null);
});

// ── what a reviewer has to read (H4) ─────────────────────────────
test('diffTotals: production and test lines added and deleted since the base, bookkeeping left out', (t) => {
  const { dir, commit, base } = repo(t);
  commit('work', { 'src/a.ts': 'export const a = 1;\nexport const b = 2;\n', 'tests/a.test.ts': 'x\ny\nz\n', '.sddpp/n.md': 'q\n'.repeat(50), 'package-lock.json': 'q\n'.repeat(50) });
  assert.deepEqual(diffTotals(dir, base), { production_lines: 1, test_lines: 3 + 1 });
});
