import { execFileSync } from 'node:child_process';
import { isGeneratedPath, isTestPath } from './testpaths.mjs';
import { matchesGlob } from './globs.mjs';

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

/** Hand-written files a commit changed, with changed-line counts. Renames count as delete plus add; binaries as 0. */
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
    .filter((f) => !isBookkeeping(f.path) && !isGeneratedPath(f.path));
}

/** Every path a commit changed, bookkeeping and generated files included. */
function allPaths(root, full) {
  return git(root, ['diff-tree', '--no-commit-id', '--name-only', '-r', '--root', '--no-renames', '-z', full]).split('\0').filter(Boolean);
}

/** What one commit changed, or null if it does not exist. */
export function measure(root, sha) {
  const full = resolve(root, sha);
  if (!full) return null;
  const files = changes(root, full);
  const lines = (list) => list.reduce((sum, f) => sum + f.lines, 0);
  return { full, files, production_lines: lines(files.filter((f) => !isTestPath(f.path))), test_lines: lines(files.filter((f) => isTestPath(f.path))) };
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

/** Hand-written test files that differ between two commits. */
function testPathsChanged(root, from, to) {
  const raw = git(root, ['diff', '--name-only', '-z', '--no-renames', from, to]);
  return raw.split('\0').filter(Boolean).filter((p) => !isBookkeeping(p) && !isGeneratedPath(p) && isTestPath(p));
}

/** The `test` script of package.json at a revision; undefined when there is no readable package.json. */
function testScriptAt(root, rev) {
  try {
    return JSON.parse(git(root, ['show', `${rev}:package.json`])).scripts?.test ?? null;
  } catch {
    return undefined;
  }
}

/** The listed commit that all the others lead up to, or null when they do not form a line. */
function latestOf(root, fulls) {
  return fulls.find((candidate) => fulls.every((other) => other === candidate || isAncestor(root, other, candidate))) ?? null;
}

/**
 * Checks every slice audit against the real git history. The audit is a claim; this makes it a fact.
 * Needs a schema-valid model (run validateModel first).
 * `tips` maps a slice id to the revision its work ends at when that is not its last listed commit
 * (`ppc finish` passes HEAD, so a commit made after the last listed one cannot slip through).
 */
export function checkGit(model, root, { tips = new Map() } = {}) {
  const out = [];
  const add = (rule, file, message) => out.push({ rule, severity: 'error', file, message });

  for (const { file, data: s } of model.slices) {
    if (!s.audit) continue;
    let production = 0;
    let tested = 0;
    let allFound = true;
    const first = {};
    const found = [];
    let lastRed = null;
    const reported = new Set(); // paths C02 already flagged, so C06 does not repeat them

    for (const { sha, kind } of s.audit.commits) {
      const m = measure(root, sha);
      if (!m) {
        add('C01', file, `${s.id}: commit ${sha} was not found in git history`);
        allFound = false;
        continue;
      }
      first[kind] ??= m.full;
      found.push(m.full);
      if (kind === 'red') lastRed = m.full;
      production += m.production_lines;
      tested += m.test_lines;
      const tests = m.files.filter((f) => isTestPath(f.path)).map((f) => f.path);
      const productionFiles = m.files.filter((f) => !isTestPath(f.path)).map((f) => f.path);

      if (tests.length && TESTS_LOCKED_KINDS.includes(kind)) {
        tests.forEach((p) => reported.add(p));
        add('C02', file, `${s.id}: ${sha} (${kind}) touches ${tests.join(', ')}; tests are locked after the red phase`);
      }
      // C08: the design belongs to Architect.PP; a build asks for a change instead of making it.
      const paths = allPaths(root, m.full);
      const design = paths.filter((p) => p.startsWith('.architect/'));
      if (design.length) add('C08', file, `${s.id}: ${sha} (${kind}) changes ${design.join(', ')}; the design is read-only for a build: open a change request (ppc change-request) and let Architect.PP revise it`);
      // C09: a slice changes the files of the components it lists. Only components that declare `paths` take part, and tests,
      // documentation and files no component claims are free.
      const claimed = (model.blueprint?.data.components ?? []).filter((c) => c.paths?.length);
      if (claimed.length) {
        const foreign = new Map();
        for (const p of paths.filter((x) => !isBookkeeping(x) && !isTestPath(x) && !isGeneratedPath(x))) {
          const owners = claimed.filter((c) => c.paths.some((pattern) => matchesGlob(pattern, p))).map((c) => c.id);
          if (owners.length && !owners.some((id) => s.components.includes(id))) foreign.set(p, owners);
        }
        if (foreign.size) {
          const names = [...new Set([...foreign.values()].flat())];
          add('C09', file, `${s.id}: ${sha} (${kind}) changes ${[...foreign.keys()].join(', ')}, which belong to ${names.join(', ')}; the slice lists ${s.components.join(', ')}. List the component in the slice or leave the file alone`);
        }
      }
      if (kind === 'red' && productionFiles.length) add('C03', file, `${s.id}: ${sha} (red) touches production code: ${productionFiles.join(', ')}`);
    }

    if (allFound && production !== s.audit.production_lines) add('C04', file, `${s.id}: audit says ${s.audit.production_lines} production lines, git shows ${production}`);
    if (allFound && tested !== s.audit.test_lines) add('C04', file, `${s.id}: audit says ${s.audit.test_lines} test lines, git shows ${tested}`);
    // From the approved red commit to the end of the slice, no test (and not what `npm test` runs) may change,
    // whether or not the audit lists the commit that changed it.
    const tip = tips.has(s.id) ? resolve(root, tips.get(s.id) === 'HEAD' ? git(root, ['rev-parse', 'HEAD']).trim() : tips.get(s.id)) : latestOf(root, found);
    if (lastRed && tip && isAncestor(root, lastRed, tip)) {
      const changed = testPathsChanged(root, lastRed, tip).filter((p) => !reported.has(p));
      if (changed.length) add('C06', file, `${s.id}: ${changed.join(', ')} changed between the red commit ${lastRed.slice(0, 7)} and ${tip.slice(0, 7)}; the approved tests are locked`);
      const before = testScriptAt(root, lastRed);
      const after = testScriptAt(root, tip);
      if (before && after !== undefined && before !== after) add('C07', file, `${s.id}: the test script in package.json changed from "${before}" to "${after ?? '(none)'}" after the red commit`);
    }
    if (first.red && first.green && !isAncestor(root, first.red, first.green)) add('C05', file, `${s.id}: the red commit ${first.red.slice(0, 7)} is not an ancestor of the green commit ${first.green.slice(0, 7)}`);
  }
  return out;
}
