import test from 'node:test';
import assert from 'node:assert/strict';
import { sliceProductionFiles, summarize, runMutation } from '../src/mutation.mjs';
import { repo } from './helpers.mjs';

const mutant = (status, line = 1, mutatorName = 'StringLiteral') => ({ status, mutatorName, replacement: '""', location: { start: { line, column: 1 }, end: { line, column: 2 } } });
const report = (files) => ({ schemaVersion: '1.0', files: Object.fromEntries(Object.entries(files).map(([name, mutants]) => [name, { language: 'typescript', source: '', mutants }])) });

// ── summarize ────────────────────────────────────────────────────
test('summarize: the score is the share of mutants the tests detected', () => {
  const s = summarize(report({ 'src/a.ts': [mutant('Killed'), mutant('Killed'), mutant('Timeout'), mutant('Survived', 7)] }));
  assert.equal(s.score, 0.75);
  assert.deepEqual({ killed: s.killed, timeout: s.timeout, survived: s.survived, no_coverage: s.no_coverage }, { killed: 2, timeout: 1, survived: 1, no_coverage: 0 });
});

test('summarize: mutants nobody ran count against the score', () => {
  assert.equal(summarize(report({ 'src/a.ts': [mutant('Killed'), mutant('NoCoverage')] })).score, 0.5);
});

test('summarize: mutants that could not be judged are left out', () => {
  const s = summarize(report({ 'src/a.ts': [mutant('Killed'), mutant('CompileError'), mutant('Ignored'), mutant('RuntimeError')] }));
  assert.equal(s.score, 1);
});

test('summarize: no judged mutants means no score, not a perfect one', () => {
  assert.equal(summarize(report({ 'src/a.ts': [mutant('Ignored')] })).score, null);
  assert.equal(summarize(report({})).score, null);
});

test('summarize: lists each surviving mutant with its place, so a person can read them', () => {
  const s = summarize(report({ 'src/a.ts': [mutant('Survived', 7, 'BooleanLiteral'), mutant('NoCoverage', 9, 'BlockStatement'), mutant('Killed', 2)] }));
  assert.deepEqual(s.survivors, [
    { file: 'src/a.ts', line: 7, mutator: 'BooleanLiteral', replacement: '""' },
    { file: 'src/a.ts', line: 9, mutator: 'BlockStatement', replacement: '""' },
  ]);
});

test('summarize: rounds the score to four decimals', () => {
  assert.equal(summarize(report({ 'a.ts': [mutant('Killed'), mutant('Killed'), mutant('Survived')] })).score, 0.6667);
});

// ── which files are mutated ──────────────────────────────────────
test('sliceProductionFiles: hand-written source touched by the slice commits, never tests or bookkeeping', (t) => {
  const { dir, commit } = repo(t);
  const red = commit('red', { 'tests/a.test.js': 'x\n', '.sddpp/notes.md': 'n\n' });
  const green = commit('green', { 'src/a.js': 'x\n', 'src/b.ts': 'x\n', 'src/notes.md': 'doc\n', 'package-lock.json': '{}\n' });
  assert.deepEqual(sliceProductionFiles(dir, [{ sha: red }, { sha: green }]), ['src/a.js', 'src/b.ts']);
});

test('sliceProductionFiles: a file deleted later is not offered for mutation', (t) => {
  const { dir, commit, git } = repo(t);
  const green = commit('green', { 'src/gone.js': 'x\n', 'src/kept.js': 'x\n' });
  git('rm', '-q', 'src/gone.js');
  git('commit', '-q', '-m', 'remove');
  assert.deepEqual(sliceProductionFiles(dir, [{ sha: green }]), ['src/kept.js']);
});

test('sliceProductionFiles: lists a file once even if several commits touch it', (t) => {
  const { dir, commit } = repo(t);
  const one = commit('green', { 'src/a.js': 'x\n' });
  const two = commit('refactor', { 'src/a.js': 'y\n' });
  assert.deepEqual(sliceProductionFiles(dir, [{ sha: one }, { sha: two }]), ['src/a.js']);
});

// ── running the tool ─────────────────────────────────────────────
test('runMutation: hands the runner the project and the files, and summarizes what it returns', () => {
  const calls = [];
  const result = runMutation('/project', ['src/a.js'], (root, files) => {
    calls.push({ root, files });
    return report({ 'src/a.js': [mutant('Killed'), mutant('Survived', 3)] });
  });
  assert.deepEqual(calls, [{ root: '/project', files: ['src/a.js'] }]);
  assert.equal(result.score, 0.5);
  assert.deepEqual(result.files, ['src/a.js']);
});

test('runMutation: with no files there is nothing to mutate and the runner is not called', () => {
  const result = runMutation('/project', [], () => assert.fail('must not run'));
  assert.equal(result.score, null);
  assert.deepEqual(result.files, []);
});
