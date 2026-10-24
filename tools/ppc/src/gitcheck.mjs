import { execFileSync } from 'node:child_process';
import { isTestPath } from './testpaths.mjs';

const SHA = /^[0-9a-f]{7,40}$/;
/** Contract bookkeeping is neither code nor tests: it is never measured and never trips C02/C03. */
const BOOKKEEPING = /^(\.sddpp|\.architect)\//;
/** Commit kinds that must leave the tests untouched: green and every kind of refactoring. */
const TESTS_LOCKED_KINDS = ['green', 'refactor', 'structural'];

export const isBookkeeping = (path) => BOOKKEEPING.test(path);

function git(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
}

/** Full commit id, or null when the commit does not exist (or this is not a repository). */
function resolve(root, sha) {
  if (!SHA.test(sha)) return null; // never hand anything but hex to git
  try {
    return git(root, ['rev-parse', '--verify', '--quiet', `${sha}^{commit}`]).trim() || null;
  } catch {
    return null;
  }
}

/** Code files a commit changed, with changed-line counts. Renames count as delete plus add; binaries as 0. */
function changes(root, full) {
  const raw = git(root, ['diff-tree', '--no-commit-id', '--numstat', '-r', '--root', '--no-renames', '-z', full]);
  return raw
    .split('\0')
    .filter(Boolean)
    .map((record) => {
      const [added, deleted, ...path] = record.split('\t');
      const count = (n) => (n === '-' ? 0 : Number(n));
      return { path: path.join('\t'), lines: count(added) + count(deleted) };
    })
    .filter((f) => !isBookkeeping(f.path));
}

/** What one commit changed, or null if it does not exist. */
export function measure(root, sha) {
  const full = resolve(root, sha);
  if (!full) return null;
  const files = changes(root, full);
  return { full, files, lines: files.reduce((sum, f) => sum + f.lines, 0) };
}

/**
 * Paths with uncommitted changes (including untracked files), leaving out contract bookkeeping.
 * Throws when `root` is not inside a git repository.
 */
export function dirtyPaths(root) {
  const raw = git(root, ['status', '--porcelain', '-z', '--no-renames', '--untracked-files=all']);
  return raw.split('\0').filter(Boolean).map((record) => record.slice(3)).filter((path) => !isBookkeeping(path));
}

function isAncestor(root, older, newer) {
  try {
    git(root, ['merge-base', '--is-ancestor', older, newer]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Checks every slice audit against the real git history. The audit is a claim; this makes it a fact.
 * Needs a schema-valid model (run validateModel first).
 */
export function checkGit(model, root) {
  const out = [];
  const add = (rule, file, message) => out.push({ rule, severity: 'error', file, message });

  for (const { file, data: s } of model.slices) {
    if (!s.audit) continue;
    let total = 0;
    let allFound = true;
    const first = {};

    for (const { sha, kind } of s.audit.commits) {
      const m = measure(root, sha);
      if (!m) {
        add('C01', file, `${s.id}: commit ${sha} was not found in git history`);
        allFound = false;
        continue;
      }
      first[kind] ??= m.full;
      total += m.lines;
      const tests = m.files.filter((f) => isTestPath(f.path)).map((f) => f.path);
      const production = m.files.filter((f) => !isTestPath(f.path)).map((f) => f.path);

      if (tests.length && TESTS_LOCKED_KINDS.includes(kind)) {
        add('C02', file, `${s.id}: ${sha} (${kind}) touches ${tests.join(', ')}; tests are locked after the red phase`);
      }
      if (kind === 'red' && production.length) add('C03', file, `${s.id}: ${sha} (red) touches production code: ${production.join(', ')}`);
    }

    if (allFound && total !== s.audit.diff_lines) add('C04', file, `${s.id}: audit says ${s.audit.diff_lines} changed lines, git shows ${total}`);
    if (first.red && first.green && !isAncestor(root, first.red, first.green)) add('C05', file, `${s.id}: the red commit ${first.red.slice(0, 7)} is not an ancestor of the green commit ${first.green.slice(0, 7)}`);
  }
  return out;
}
