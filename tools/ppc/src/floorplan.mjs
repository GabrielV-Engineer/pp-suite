import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mapModel } from './map.mjs';
import { pullShared, pushShared, shareLocal, SHARED_DESCRIPTIONS } from './descriptions.mjs';

export { SHARED_DESCRIPTIONS };

// `ppc map --html`: the interactive map, drawn by Floorplan (https://github.com/haydenschmitty/floorplan, MIT), adopted unmodified
// under vendor/floorplan at the commit below (THIRD_PARTY.md). Floorplan normally asks an AI to decide what the parts of an app are;
// here they are not guessed: the design already names every component and the files it owns, so this module writes Floorplan's
// input (architecture.json, recent-work.json) from the design and the slices, and Floorplan's own scripts read the code and draw it.
// Everything pp-suite adds lives in this file; the adopted copy is never edited (floorplan.test.mjs checks it file by file).

export const FLOORPLAN = {
  repo: 'https://github.com/haydenschmitty/floorplan',
  version: '0.11.0',
  commit: '94f81b463b7617e06d873ac71323ce71644c8399',
  dir: fileURLToPath(new URL('../vendor/floorplan/', import.meta.url)),
};
// Floorplan's own tools expect the map in floorplan/ at the root: its Ask server takes the folder above it as the codebase, its
// hint says `node floorplan/serve.mjs`, and describe.mjs writes there. The folder ignores itself in git (its own .gitignore).
export const FLOORPLAN_DIR = 'floorplan';
// What the last drawing was made from (the commit, the design, the slice closed last), to tell when the map is behind; and the
// mark a drawing started in the background leaves while it runs.
export const MAP_STAMP = `${FLOORPLAN_DIR}/.cache/ppc-map.json`;
export const REDRAW_MARK = `${FLOORPLAN_DIR}/.cache/ppc-redraw.lock`;
export const DESCRIPTIONS_GUIDE = join(FLOORPLAN.dir, 'references', 'writing-descriptions.md');
export const FLOORPLAN_PAGE = `${FLOORPLAN_DIR}/index.html`;

/** pp-suite's kinds of component, as Floorplan's kinds of node. */
const KIND = { frontend: 'ui', backend: 'service', database: 'data', infra: 'infra', library: 'library', other: 'feature' };
const STATE_WORDS = { unplanned: 'no slice yet', planned: 'planned', building: 'building', built: 'built' };
const UNSETTLED = new Set(['proposed', 'open', 'scheduled']);
const list = (value) => (Array.isArray(value) ? value : []);

/** The design as Floorplan's architecture.json: components are nodes, `may_depend_on` are edges, capabilities are the tour and flows. */
export function toArchitecture(model) {
  const bp = model.blueprint.data;
  const map = mapModel(model, []);
  const slices = model.slices.map((s) => s.data).filter((s) => s.status !== 'dropped').sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const debt = model.debt.flatMap((d) => list(d.data?.entries)).filter((e) => UNSETTLED.has(e.status));
  const byId = new Map(list(bp.components).map((c) => [c.id, c]));

  const nodes = map.components.map((c) => {
    const own = slices.filter((s) => list(s.components).includes(c.id));
    const owed = debt.filter((e) => e.component === c.id);
    const tags = [c.active ? `${STATE_WORDS[c.state]}, in progress` : STATE_WORDS[c.state], `${c.slices.done}/${c.slices.total} slices done`];
    if (owed.length) tags.push(`debt: ${owed.length} to decide or pay`);
    const details = [
      own.length ? `Slices:\n${own.map((s) => `${s.id} ${s.title} (${String(s.status).replace('_', ' ')})`).join('\n')}` : 'No slice touches it yet.',
      ...(owed.length ? [`Debt to decide or pay:\n${owed.map((e) => `${e.id} ${e.title} (${e.status})`).join('\n')}`] : []),
    ].join('\n\n');
    return { id: c.id, label: c.name, kind: KIND[c.kind] ?? 'feature', summary: c.responsibility ?? '', details, paths: list(byId.get(c.id)?.paths), tags };
  });

  const known = new Set(nodes.map((n) => n.id));
  const edges = map.edges.map((e) => ({ from: e.from, to: e.to, kind: byId.get(e.to)?.kind === 'database' ? 'data' : 'call', label: 'allowed by the design' }));

  const capabilities = map.capabilities.filter((cap) => cap.components.some((id) => known.has(id)));
  const tour = capabilities.slice(0, 8).map((cap) => {
    const description = list(bp.capabilities).find((c) => c.id === cap.id)?.description ?? '';
    return { node: cap.components[0], title: `${cap.id} ${cap.name}`, note: `${description} ${cap.slices.done}/${cap.slices.total} slices done.`.trim() };
  });
  const flows = capabilities.filter((cap) => cap.components.length >= 2).map((cap) => ({
    id: String(cap.id).toLowerCase(),
    title: cap.name,
    description: `${cap.id}: the components its slices build in, in the order of the design.`,
    steps: cap.components.map((id) => ({ node: id, note: byId.get(id)?.responsibility ?? '' })),
  }));

  return {
    $schema: 'floorplan/architecture@1',
    audience: 'developers',
    project: { name: bp.project?.name ?? bp.project?.id ?? 'project', summary: bp.project?.summary ?? '' },
    ignore: ['.architect/**', '.sddpp/**', '.specify/**', '.claude/**'],
    nodes,
    edges,
    tour,
    flows,
  };
}

/** Floorplan's recent-work.json for the slice closed last: the files its commits changed. No slice clears the highlights. */
export function toRecentWork(slice, files) {
  if (!slice) return { tasks: [] };
  const a = slice.audit ?? {};
  const summary = `${slice.id} is done: ${a.production_lines ?? 0} production lines, ${a.tests_added ?? 0} tests added.`;
  return {
    tasks: [{
      title: `${slice.id} ${slice.title}`,
      request: slice.title,
      summary,
      items: files.map((ref) => ({ ref, change: 'changed', note: `Changed by ${slice.id}.` })),
    }],
  };
}

const git = (root, args) => {
  try {
    return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
};

/** The done slice whose commits are the most recent in git, and the files those commits changed (records left out). */
export function lastClosedSlice(root, model) {
  const log = git(root, ['log', '--format=%H']);
  if (!log) return { slice: null, files: [] };
  const order = new Map(log.split('\n').map((sha, i) => [sha, i]));
  const at = (sha) => [...order.keys()].find((full) => full.startsWith(String(sha)));
  let best = null;
  for (const s of model.slices.map((x) => x.data)) {
    if (s.status !== 'done') continue;
    const shas = list(s.audit?.commits).map((c) => at(c.sha)).filter(Boolean);
    if (!shas.length) continue;
    const newest = Math.min(...shas.map((sha) => order.get(sha)));
    if (!best || newest < best.newest) best = { slice: s, shas, newest };
  }
  if (!best) return { slice: null, files: [] };
  const files = new Set();
  for (const sha of best.shas) {
    for (const f of (git(root, ['show', '--name-only', '--format=', sha]) ?? '').split('\n')) {
      if (f && !/^(\.sddpp|\.architect)\//.test(f)) files.add(f);
    }
  }
  return { slice: best.slice, files: [...files].sort() };
}

/**
 * Refuse a `floorplan/` folder that belongs to the project. Floorplan checks this itself only when it picks the folder, and ppc
 * passes it one; drawing into a folder of the project's own would put a `.gitignore` there that hides its new files from git.
 * Ours is never in git, and is empty or carries Floorplan's marks (its `.gitignore`, or an architecture.json of its schema).
 */
export function checkMapFolder(root) {
  const dir = join(root, FLOORPLAN_DIR);
  if (!existsSync(dir)) return;
  const refuse = (why) => {
    throw new Error(`floorplan/ belongs to the project (${why}), so the map is not drawn there; nothing was written. Rename that folder to draw the map.`);
  };
  if (git(root, ['ls-files', '--', FLOORPLAN_DIR])) refuse('git tracks files in it');
  if (!readdirSync(dir).length) return;
  const read = (name) => {
    try {
      return readFileSync(join(dir, name), 'utf8');
    } catch {
      return '';
    }
  };
  // ppc's own marks count too: it writes them only in a folder this check accepted (startRedraw checks before writing one)
  const marked = read('.gitignore').includes('Floorplan keeps its map out of git') || read('architecture.json').includes('"floorplan/architecture@1"')
    || existsSync(join(root, MAP_STAMP)) || existsSync(join(root, REDRAW_MARK));
  if (!marked) refuse('it is not a map Floorplan drew');
}

/** How many files have a description, read from the build's report (`DESCRIPTIONS  files 1/95 · ...`). */
export function descriptionCount(report) {
  const m = /DESCRIPTIONS\s+files (\d+)\/(\d+)[^\n]*?(?:· (\d+) need review)?\s*(?:\(code changed\))?$/m.exec(report ?? '');
  return m ? { described: Number(m[1]), total: Number(m[2]), review: Number(m[3] ?? 0) } : null;
}

const script = (name) => join(FLOORPLAN.dir, 'scripts', name);
const node = (root, args, env = {}) => execFileSync(process.execPath, args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...env } });

/**
 * Write Floorplan's input in `floorplan/` and run its scan and build there. Nothing outside that folder is written (no
 * `CLAUDE.local.md`). The names and descriptions in `floorplan/descriptions/` are the agent's and are kept.
 */
/** Floorplan's input as pp-suite writes it now, and a hash of it: the same design and slices give the same hash. */
function inputs(root, model) {
  const architecture = `${JSON.stringify(toArchitecture(model), null, 2)}\n`;
  const { slice, files } = lastClosedSlice(root, model);
  const recent = `${JSON.stringify(toRecentWork(slice, files), null, 2)}\n`;
  return { architecture, recent, hash: createHash('sha256').update(architecture).update(recent).digest('hex') };
}

/**
 * Whether the map is behind: not drawn, or drawn from another commit, another design or another closed slice. Uncommitted
 * code does not count; slices commit their work. `descriptions` are the counts of the last drawing.
 */
export function mapFreshness(root, model) {
  if (!existsSync(join(root, FLOORPLAN_PAGE))) return { drawn: false, stale: true, descriptions: null };
  let stamp = null;
  try {
    stamp = JSON.parse(readFileSync(join(root, MAP_STAMP), 'utf8'));
  } catch {
    // no stamp: drawn by something else, so treated as behind
  }
  const stale = !stamp || stamp.head !== git(root, ['rev-parse', 'HEAD']) || stamp.input !== inputs(root, model).hash;
  return { drawn: true, stale, descriptions: stamp?.descriptions ?? null };
}

/** Switching to shared keeps what this clone already wrote. */
export function shareDescriptions(root) {
  shareLocal(root);
}

/**
 * Draw the map. With `shared`, the descriptions in `.sddpp/map/descriptions/` (one file each, so branches merge) are put in
 * Floorplan's shape first, with what the agent wrote since the last drawing, and split back after it, so what Floorplan
 * reconciles (moves, deletions, review flags) reaches the shared copy. `conflicts` names shared files a merge left broken.
 */
export function buildFloorplan(root, model, { shared = false } = {}) {
  try {
    checkMapFolder(root);
    const pulled = shared ? pullShared(root) : null;
    const result = draw(root, model);
    const pushed = shared ? pushShared(root) : null;
    return { ...result, conflicts: [...new Set([...(pulled?.conflicts ?? []), ...(pushed?.conflicts ?? [])])] };
  } finally {
    rmSync(join(root, REDRAW_MARK), { force: true });
  }
}

function draw(root, model) {
  const out = join(root, FLOORPLAN_DIR);
  mkdirSync(out, { recursive: true });
  const input = inputs(root, model);
  writeFileSync(join(out, 'architecture.json'), input.architecture);
  writeFileSync(join(out, 'recent-work.json'), input.recent);
  const done = (report) => {
    const descriptions = descriptionCount(report);
    mkdirSync(join(out, '.cache'), { recursive: true });
    writeFileSync(join(root, MAP_STAMP), `${JSON.stringify({ head: git(root, ['rev-parse', 'HEAD']), input: input.hash, descriptions })}\n`);
    return { page: FLOORPLAN_PAGE, report, descriptions };
  };
  // Once a map exists, Floorplan's refresh.mjs redraws it: it carries descriptions over to moved files, drops those of deleted
  // ones, and flags for review those whose exports or routes changed. Unattended, it writes only inside floorplan/. It refuses
  // where there is no map yet or no code at all; then the scan and the build draw it from scratch.
  if (existsSync(join(out, 'graph.json'))) {
    try {
      return done(node(root, [script('refresh.mjs'), root], { FLOORPLAN_UNATTENDED: '1' }));
    } catch {
      // drawn from scratch below
    }
  }
  try {
    node(root, [script('scan.mjs'), root, '--out', join(out, '.cache', 'scan.json')]);
    return done(node(root, [script('build.mjs'), root, '--out', out, '--no-claude-md']));
  } catch (error) {
    throw new Error(`Floorplan could not draw the map:\n${error.stdout ?? ''}${error.stderr ?? ''}`.trim());
  }
}

/**
 * Floorplan's describe step, after drawing the map: one worksheet per component with what each undescribed file defines and
 * who uses it, and a skeleton in `floorplan/descriptions/` for the agent to fill (Floorplan's `references/writing-descriptions.md`).
 */
export function describeFloorplan(root, model, { shared = false } = {}) {
  const { conflicts } = buildFloorplan(root, model, { shared });
  try {
    // the agent writes in floorplan/descriptions/ even when they are shared: the next drawing copies what it wrote to git
    return { ...JSON.parse(node(root, [script('describe.mjs'), root, '--json'])), conflicts };
  } catch (error) {
    throw new Error(`Floorplan could not write the worksheets:\n${error.stdout ?? ''}${error.stderr ?? ''}`.trim());
  }
}
