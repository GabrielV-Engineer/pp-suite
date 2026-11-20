import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { mapModel, writeMap, MAP_DIR } from './map.mjs';
import { buildFloorplan, FLOORPLAN_PAGE } from './floorplan.mjs';

// The map in the flow. Off unless someone turns it on (`ppc map --on`): then every slice that closes redraws it, `ppc next`
// and the session start carry its link, and, only with `--open`, the browser opens it when a slice closes. The setting is a
// file in the project (`.sddpp/map/settings.json`), so the whole team shares it; a missing or broken file means off.

export const MAP_SETTINGS = `${MAP_DIR}/settings.json`;
const OFF = { html: false, open: false };

export function readMapSettings(root) {
  try {
    const data = JSON.parse(readFileSync(join(root, MAP_SETTINGS), 'utf8'));
    return { html: data?.html === true, open: data?.html === true && data?.open === true };
  } catch {
    return { ...OFF };
  }
}

export function writeMapSettings(root, settings) {
  const file = join(root, MAP_SETTINGS);
  mkdirSync(dirname(file), { recursive: true });
  const value = { html: settings.html === true, open: settings.html === true && settings.open === true };
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
  return value;
}

/** Where the map is, for `ppc next --json` and the session: null while it is off. */
export function mapStatus(root) {
  if (!readMapSettings(root).html) return null;
  const page = join(root, FLOORPLAN_PAGE);
  return { page, drawn: existsSync(page) };
}

/** One line for `ppc next` and the session start, or '' while the map is off. */
export function mapLine(root) {
  const status = mapStatus(root);
  if (!status) return '';
  return status.drawn ? `Map: ${status.page} (redraw: ppc map --html)\n` : 'Map: not drawn yet. Draw it: ppc map --html\n';
}

/** Redraw both maps after a slice closed, when the map is on. Never throws: a slice that closed stays closed. */
export function redrawAfterClose(root, model, findings) {
  const settings = readMapSettings(root);
  if (!settings.html) return { drawn: false };
  try {
    writeMap(root, mapModel(model, findings));
    buildFloorplan(root, model);
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
