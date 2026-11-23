import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mapModel, writeMap, MAP_DIR } from './map.mjs';
import { buildFloorplan, checkMapFolder, FLOORPLAN_PAGE, mapFreshness, REDRAW_MARK } from './floorplan.mjs';

// The map in the flow. Off unless someone turns it on (`ppc map --on`): then every slice that closes redraws it, `ppc next`
// and the session start carry its link, and, only with `--open`, the browser opens it when a slice closes. The setting is a
// file in the project (`.sddpp/map/settings.json`), so the whole team shares it; a missing or broken file means off.

export const MAP_SETTINGS = `${MAP_DIR}/settings.json`;
const OFF = { html: false, open: false, descriptions: 'clone' };
export const DESCRIPTION_PLACES = ['shared', 'clone'];

export function readMapSettings(root) {
  try {
    const data = JSON.parse(readFileSync(join(root, MAP_SETTINGS), 'utf8'));
    const html = data?.html === true;
    return { html, open: html && data?.open === true, descriptions: data?.descriptions === 'shared' ? 'shared' : 'clone' };
  } catch {
    return { ...OFF };
  }
}

export function writeMapSettings(root, settings) {
  const file = join(root, MAP_SETTINGS);
  mkdirSync(dirname(file), { recursive: true });
  const html = settings.html === true;
  const value = { html, open: html && settings.open === true, descriptions: settings.descriptions === 'shared' ? 'shared' : 'clone' };
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
  return value;
}

/** Where the descriptions should live, for the question asked when the map is turned on: shared once there is a remote. */
export function recommendedDescriptions(root) {
  try {
    return execFileSync('git', ['-C', root, 'remote'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() ? 'shared' : 'clone';
  } catch {
    return 'clone';
  }
}

/** Draw the HTML map with the descriptions where the setting puts them. */
export function drawMap(root, model) {
  return buildFloorplan(root, model, { shared: readMapSettings(root).descriptions === 'shared' });
}

/** Where the map is and whether it is behind, for `ppc next --json` and the session: null while it is off. */
export function mapStatus(root, model) {
  if (!readMapSettings(root).html) return null;
  return { page: join(root, FLOORPLAN_PAGE), ...mapFreshness(root, model) };
}

const describeHint = (d) => {
  if (!d?.total || (d.described >= d.total && !d.review)) return '';
  const review = d.review ? `, ${d.review} to review because the code changed` : '';
  return ` (descriptions: ${d.described} of ${d.total} files${review}. Write them: ppc map --describe)`;
};

/** One line for `ppc next`, or '' while the map is off. With `redrawing`, a drawing was just started in the background. */
export function mapLine(root, model, { redrawing = false } = {}) {
  const status = mapStatus(root, model);
  if (!status) return '';
  if (redrawing) return `Map: being drawn in the background, because the code or the design changed since it was drawn. It will be at ${status.page}\n`;
  if (!status.drawn) return 'Map: not drawn yet. Draw it: ppc map --html\n';
  if (status.stale) return `Map: ${status.page} is behind the code. Redraw it: ppc map --html${describeHint(status.descriptions)}\n`;
  return `Map: ${status.page}${describeHint(status.descriptions)}\n`;
}

/**
 * The last line of a decision's card (`ppc show`), or '' while the map is off: the map as a link the chat opens, so the person sees
 * which components a decision touches before deciding. Found in the first real project (F-T19): the path was printed at every step
 * and never put beside a decision.
 */
export function mapCardLine(root, model) {
  const status = mapStatus(root, model);
  if (!status) return '';
  if (!status.drawn) return 'Map: not drawn yet; draw it to see what this touches: ppc map --html';
  const behind = status.stale ? ' It is behind the code; redraw it first: ppc map --html' : '';
  return `Map: [${FLOORPLAN_PAGE}](${FLOORPLAN_PAGE}): the components this touches, and what is built around them.${behind}`;
}

const CLI = fileURLToPath(new URL('../bin/ppc.mjs', import.meta.url));
const MARK_LIFETIME_MS = 10 * 60 * 1000;

/**
 * Start `ppc map --html` in the background, unless a run started in the last ten minutes has not finished (a drawing removes the
 * mark when it ends, whether it worked or not). Returns whether it started one. `spawnFn` is for the tests.
 */
export function startRedraw(root, { spawnFn = spawnDetached } = {}) {
  const mark = join(root, REDRAW_MARK);
  try {
    checkMapFolder(root);
  } catch {
    return false; // a floorplan/ of the project's own: nothing is written in it, here or anywhere
  }
  try {
    if (Date.now() - statSync(mark).mtimeMs < MARK_LIFETIME_MS) return false;
  } catch {
    // no mark: nothing running
  }
  mkdirSync(dirname(mark), { recursive: true });
  writeFileSync(mark, `${process.pid}\n`);
  spawnFn(process.execPath, [CLI, 'map', '--html', root]);
  return true;
}

function spawnDetached(cmd, args) {
  try {
    spawn(cmd, args, { detached: true, stdio: 'ignore', env: { ...process.env, CI: '1' } }).on('error', () => {}).unref();
  } catch {
    // not started: the next session tries again
  }
}

/** The map's line for the session start: a map that is behind (or never drawn) is redrawn in the background first. */
export function sessionMapLine(root, model, { redraw = startRedraw } = {}) {
  const status = mapStatus(root, model);
  if (!status) return '';
  if (status.stale && redraw(root)) return mapLine(root, model, { redrawing: true });
  return mapLine(root, model);
}

/** Redraw both maps after a slice closed, when the map is on. Never throws: a slice that closed stays closed. */
export function redrawAfterClose(root, model, findings) {
  const settings = readMapSettings(root);
  if (!settings.html) return { drawn: false };
  try {
    writeMap(root, mapModel(model, findings));
    drawMap(root, model);
    const page = join(root, FLOORPLAN_PAGE);
    return { drawn: true, page, opened: settings.open ? openPage(page) : false };
  } catch (error) {
    return { drawn: false, error: error.message };
  }
}

/**
 * The command that shows a file in the browser, or null where nothing should open: in CI, or on Linux with no display.
 * Pure, so it can be tested; `openPage` runs it.
 */
export function openCommand(file, platform = process.platform, env = process.env) {
  if (env.CI) return null;
  if (platform === 'darwin') return ['open', [file]];
  if (platform === 'win32') return ['cmd', ['/c', 'start', '""', file]];
  if (!env.DISPLAY && !env.WAYLAND_DISPLAY) return null;
  return ['xdg-open', [file]];
}

/** Open the page without waiting for the browser; a failure only means it was not opened. */
export function openPage(file) {
  const command = openCommand(file);
  if (!command) return false;
  try {
    spawn(command[0], command[1], { detached: true, stdio: 'ignore' }).on('error', () => {}).unref();
    return true;
  } catch {
    return false;
  }
}
