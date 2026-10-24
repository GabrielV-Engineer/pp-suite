import { execFileSync } from 'node:child_process';
import { isTestPath } from './testpaths.mjs';

const SHA = /^[0-9a-f]{7,40}$/;

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

/** Files a commit changed, with changed-line counts. Renames count as delete plus add; binaries as 0. */
function changes(root, full) {
  const raw = git(root, ['diff-tree', '--no-commit-id', '--numstat', '-r', '--root', '--no-renames', '-z', full]);
  return raw.split('\0').filter(Boolean).map((record) => {
    const [added, deleted, ...path] = record.split('\t');
    const count = (n) => (n === '-' ? 0 : Number(n));
    return { path: path.join('\t'), lines: count(added) + count(deleted) };
  });
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
      const full = resolve(root, sha);
      if (!full) {
        add('C01', file, `${s.id}: commit ${sha} was not found in git history`);
        allFound = false;
        continue;
      }
      first[kind] ??= full;
      const files = changes(root, full);
      total += files.reduce((sum, f) => sum + f.lines, 0);
      const tests = files.filter((f) => isTestPath(f.path)).map((f) => f.path);
      const production = files.filter((f) => !isTestPath(f.path)).map((f) => f.path);

      if (tests.length && (kind === 'green' || s.type === 'refactor')) {
        const why = kind === 'green' ? 'a green commit must leave tests untouched' : 'a refactor slice must leave tests untouched';
        add('C02', file, `${s.id}: ${sha} (${kind}) touches ${tests.join(', ')}; ${why}`);
      }
      if (kind === 'red' && production.length) add('C03', file, `${s.id}: ${sha} (red) touches production code: ${production.join(', ')}`);
    }

    if (allFound && total !== s.audit.diff_lines) add('C04', file, `${s.id}: audit says ${s.audit.diff_lines} changed lines, git shows ${total}`);
    if (first.red && first.green && !isAncestor(root, first.red, first.green)) add('C05', file, `${s.id}: the red commit ${first.red.slice(0, 7)} is not an ancestor of the green commit ${first.green.slice(0, 7)}`);
  }
  return out;
}
