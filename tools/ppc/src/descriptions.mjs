import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

// Shared descriptions, one file for each described file or route. Floorplan keeps them in one JSON per component, and two
// branches that describe different files of the same component both add a key in the same place of that JSON: git cannot merge
// them, although they do not disagree. In git they live one per file instead (`files/<path>.json`, `routes/<hash>.json`), so
// two branches only meet when they describe the same file. For each drawing they are put back in Floorplan's shape, and after it
// split again. Only entries with a description are shared: the empty skeletons Floorplan adds for the agent stay in the clone.
//
// Between two drawings the agent writes in `floorplan/descriptions/`. A snapshot of what the last drawing left there tells its
// edits (written here, so they win) from entries it did not touch (the shared copy wins: a pull or a merge may have changed it).

export const SHARED_DESCRIPTIONS = '.sddpp/map/descriptions';
const LOCAL = 'floorplan/descriptions';
const SNAPSHOT = 'floorplan/.cache/ppc-shared.json';
// where entries go whose component the last drawing does not know; sorted after every component's file, as the build reads them
const LEFTOVER = '~ppc-shared.json';
const KINDS = ['files', 'routes'];

const isObj = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const str = (v) => (typeof v === 'string' ? v : '');
const hasText = (v) => isObj(v) && str(v.description).trim() !== '';
/** An entry with its fields in one order, so two equal entries are equal as text. */
const entry = (v) => ({ name: str(v.name), description: str(v.description), ...(str(v.review) ? { review: v.review } : {}) });
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const readJson = (file) => {
  try {
    return { ok: true, value: JSON.parse(readFileSync(file, 'utf8')) };
  } catch {
    return { ok: false };
  }
};
const writeJson = (file, value) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
};

/** A path from the code, safe to use as a path under the shared folder: relative, no `..`, no backslash. */
export function safePath(p) {
  return typeof p === 'string' && p !== '' && !p.startsWith('/') && !/^[A-Za-z]:/.test(p) && !/[\\\0]/.test(p)
    && p.split('/').every((s) => s !== '' && s !== '.' && s !== '..');
}
const routeFile = (key) => `${createHash('sha256').update(key).digest('hex').slice(0, 16)}.json`;
const sharedFile = (root, kind, key) => join(root, SHARED_DESCRIPTIONS, kind, kind === 'files' ? `${key}.json` : routeFile(key));

function walk(dir, rel = '') {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const r = rel ? `${rel}/${d.name}` : d.name;
    if (d.isDirectory()) return walk(join(dir, d.name), r);
    return d.name.endsWith('.json') ? [r] : [];
  });
}

/**
 * The shared copy: `{ files, routes }` as maps of entries, and the files that are not valid JSON (a merge left its markers in
 * them, most likely). Those are left out and never deleted or rewritten from here, except by a new description of that entry.
 */
export function readShared(root) {
  const base = join(root, SHARED_DESCRIPTIONS);
  const out = { files: new Map(), routes: new Map(), conflicts: [] };
  for (const rel of walk(join(base, 'files'))) {
    const read = readJson(join(base, 'files', rel));
    if (!read.ok || !isObj(read.value)) out.conflicts.push(`${SHARED_DESCRIPTIONS}/files/${rel}`);
    else if (hasText(read.value)) out.files.set(rel.slice(0, -'.json'.length), entry(read.value));
  }
  for (const rel of walk(join(base, 'routes'))) {
    const read = readJson(join(base, 'routes', rel));
    if (!read.ok || !isObj(read.value) || !str(read.value.route)) out.conflicts.push(`${SHARED_DESCRIPTIONS}/routes/${rel}`);
    else if (hasText(read.value)) out.routes.set(read.value.route, entry(read.value));
  }
  return out;
}

/** The entries of `floorplan/descriptions/`, each with the file it is in, in the order Floorplan's build reads them. */
function readLocal(root) {
  const dir = join(root, LOCAL);
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir).filter((n) => n.endsWith('.json')).sort()) {
    const read = readJson(join(dir, name));
    if (!read.ok || !isObj(read.value)) continue;
    for (const kind of KINDS) {
      if (!isObj(read.value[kind])) continue;
      for (const [key, v] of Object.entries(read.value[kind])) if (hasText(v)) out.push({ kind, key, file: name, entry: entry(v) });
    }
  }
  return out;
}

function writeShared(root, kind, key, value) {
  if (kind === 'files' && !safePath(key)) return;
  writeJson(sharedFile(root, kind, key), kind === 'routes' ? { route: key, ...value } : value);
}

/** Descriptions written per clone in the earlier shape (one JSON per component, at the top of the shared folder), split. */
function migrate(root) {
  const base = join(root, SHARED_DESCRIPTIONS);
  if (!existsSync(base)) return;
  for (const name of readdirSync(base).filter((n) => n.endsWith('.json'))) {
    const read = readJson(join(base, name));
    if (!read.ok || !isObj(read.value)) continue; // left for a person: it is named by the build if it is broken
    for (const kind of KINDS) {
      if (!isObj(read.value[kind])) continue;
      for (const [key, v] of Object.entries(read.value[kind])) if (hasText(v)) writeShared(root, kind, key, entry(v));
    }
    rmSync(join(base, name));
  }
}

/** Which component each file and route belongs to, from the last drawing (graph.json), so entries go where describe looks. */
function owners(root) {
  const read = readJson(join(root, 'floorplan', 'graph.json'));
  const files = new Map();
  const routes = new Map();
  if (!read.ok || !isObj(read.value)) return { files, routes };
  for (const f of Array.isArray(read.value.files) ? read.value.files : []) if (f && f.p && f.n) files.set(f.p, f.n);
  for (const r of Array.isArray(read.value.routes) ? read.value.routes : []) if (r && files.has(r.f)) routes.set(`${r.m} ${r.p}`, files.get(r.f));
  return { files, routes };
}

/**
 * Write the shared entries in Floorplan's shape: one JSON per component, as Floorplan's describe writes them, and remember what
 * was written where (the snapshot).
 */
function compose(root, shared) {
  const dir = join(root, LOCAL);
  mkdirSync(dir, { recursive: true });
  for (const name of readdirSync(dir)) if (name.endsWith('.json')) rmSync(join(dir, name));
  const own = owners(root);
  const files = {};
  const snapshot = { files: {}, routes: {} };
  for (const kind of KINDS) {
    for (const [key, value] of [...shared[kind]].sort(([a], [b]) => a.localeCompare(b))) {
      const owner = own[kind].get(key);
      const file = owner ? `${owner}.json` : LEFTOVER;
      ((files[file] ??= { files: {} })[kind] ??= {})[key] = value;
      snapshot[kind][key] = { file, entry: value };
    }
  }
  for (const [file, value] of Object.entries(files)) writeJson(join(dir, file), value);
  writeJson(join(root, SNAPSHOT), snapshot);
}

/**
 * Before a drawing: what the agent wrote since the last one goes to the shared copy, then the shared copy is put in Floorplan's
 * shape. An entry is the agent's when its name or description changed, or when its review flag was dropped in the file the
 * drawing put it in (Floorplan's guide says to drop it once the description is right).
 */
export function pullShared(root) {
  migrate(root);
  const before = readJson(join(root, SNAPSHOT));
  const snap = before.ok && isObj(before.value) ? before.value : { files: {}, routes: {} };
  for (const { kind, key, file, entry: now } of readLocal(root)) {
    const was = snap[kind]?.[key];
    const edited = !was
      || now.name !== was.entry.name || now.description !== was.entry.description
      || (was.entry.review && !now.review && file === was.file);
    if (edited) writeShared(root, kind, key, now);
  }
  const shared = readShared(root);
  compose(root, shared);
  return { conflicts: shared.conflicts };
}

/**
 * After a drawing: Floorplan's refresh moved, dropped or flagged entries in `floorplan/descriptions/`, so the shared copy becomes
 * what is there now. A shared file that is not valid JSON is not removed: a person resolves it.
 */
export function pushShared(root) {
  const keep = { files: new Map(), routes: new Map() };
  for (const { kind, key, entry: value } of readLocal(root)) keep[kind].set(key, value); // later files win, as in the build
  const shared = readShared(root);
  for (const kind of KINDS) {
    for (const [key, value] of keep[kind]) if (!same(shared[kind].get(key), value)) writeShared(root, kind, key, value);
    for (const key of shared[kind].keys()) if (!keep[kind].has(key)) rmSync(sharedFile(root, kind, key), { force: true });
  }
  removeEmptyFolders(join(root, SHARED_DESCRIPTIONS, 'files'));
  const now = readShared(root);
  compose(root, now);
  return { conflicts: now.conflicts };
}

function removeEmptyFolders(dir) {
  if (!existsSync(dir)) return;
  for (const d of readdirSync(dir, { withFileTypes: true })) if (d.isDirectory()) removeEmptyFolders(join(dir, d.name));
  if (!readdirSync(dir).length) rmSync(dir, { recursive: true, force: true });
}

/** Switching to shared: what this clone wrote becomes shared (an entry already shared keeps the shared text). */
export function shareLocal(root) {
  migrate(root);
  const shared = readShared(root);
  for (const { kind, key, entry: value } of readLocal(root)) if (!shared[kind].has(key)) writeShared(root, kind, key, value);
}
