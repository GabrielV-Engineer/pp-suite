import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MAP_SETTINGS, openCommand, readMapSettings, startRedraw } from '../src/mapflow.mjs';
import { sessionContext } from '../src/session.mjs';
import { CLI, lines, repo } from './helpers.mjs';

// CI=1 keeps any browser from opening while the tests run, whatever a test turns on.
const run = (dir, ...args) => spawnSync('node', [CLI, ...args], { cwd: dir, encoding: 'utf8', env: { ...process.env, CI: '1' } });
const PAGE = 'floorplan/index.html';

test('the map is off until someone turns it on: no setting means no html, no opening, descriptions per clone', (t) => {
  const r = repo(t);
  assert.deepEqual(readMapSettings(r.dir), { html: false, open: false, descriptions: 'clone' });
  r.write({ [MAP_SETTINGS]: '{ not json' });
  assert.deepEqual(readMapSettings(r.dir), { html: false, open: false, descriptions: 'clone' }, 'a broken file counts as off');
});

test('ppc map --on asks where the descriptions live before it turns anything on, and recommends by the project', (t) => {
  const r = repo(t);
  const ask = run(r.dir, 'map', '--on');
  assert.equal(ask.status, 2);
  assert.match(ask.stderr, /--descriptions shared/);
  assert.match(ask.stderr, /--descriptions clone/);
  assert.match(ask.stderr, /Recommended: clone/, 'no remote: one person, one clone');
  assert.deepEqual(readMapSettings(r.dir).html, false, 'nothing turned on');
  r.git('remote', 'add', 'origin', 'https://example.com/team/app.git');
  assert.match(run(r.dir, 'map', '--on').stderr, /Recommended: shared/, 'a remote: a team may share them');
});

test('ppc map --on and --off: turn the map into the flow and out of it, and say what they did', (t) => {
  const r = repo(t);
  const on = run(r.dir, 'map', '--on', '--descriptions', 'clone');
  assert.equal(on.status, 0, on.stderr);
  assert.match(on.stdout, /The map is on/);
  assert.deepEqual(readMapSettings(r.dir), { html: true, open: false, descriptions: 'clone' });
  assert.equal(run(r.dir, 'map', '--on', '--open', '--descriptions', 'shared').status, 0);
  assert.deepEqual(readMapSettings(r.dir), { html: true, open: true, descriptions: 'shared' });
  assert.equal(run(r.dir, 'map', '--descriptions', 'clone').status, 0, 'changed later on its own');
  assert.equal(readMapSettings(r.dir).descriptions, 'clone');
  assert.equal(run(r.dir, 'map', '--off').status, 0);
  assert.equal(readMapSettings(r.dir).html, false);
  assert.notEqual(run(r.dir, 'map', '--on', '--off').status, 0, 'on and off together is refused');
  assert.notEqual(run(r.dir, 'map', '--on', '--descriptions', 'git').status, 0, 'only shared or clone');
});

test('ppc next: no word about the map while it is off; with it on, where it is and whether it is behind the code', (t) => {
  const r = repo(t);
  assert.doesNotMatch(run(r.dir, 'next').stdout, /Map:/);
  assert.equal(JSON.parse(run(r.dir, 'next', '--json').stdout).map, null);

  run(r.dir, 'map', '--on', '--descriptions', 'clone');
  assert.match(run(r.dir, 'next').stdout, /Map: not drawn yet\. Draw it: ppc map --html/);
  assert.deepEqual(JSON.parse(run(r.dir, 'next', '--json').stdout).map, { page: join(r.dir, PAGE), drawn: false, stale: true, descriptions: null });

  assert.equal(run(r.dir, 'map', '--html').status, 0);
  assert.ok(run(r.dir, 'next').stdout.includes(`Map: ${join(r.dir, PAGE)}\n`), 'drawn and current: just the link');
  assert.equal(JSON.parse(run(r.dir, 'next', '--json').stdout).map.stale, false);

  r.commit('build: the task list', { 'src/tasks.ts': 'export const tasks = [];\n' });
  assert.ok(run(r.dir, 'next').stdout.includes(`Map: ${join(r.dir, PAGE)} is behind the code. Redraw it: ppc map --html`), 'a new commit');
  assert.equal(run(r.dir, 'map', '--html').status, 0);
  const json = JSON.parse(run(r.dir, 'next', '--json').stdout).map;
  assert.equal(json.stale, false);
  assert.deepEqual(json.descriptions, { described: 0, total: 1, review: 0 });
  assert.match(run(r.dir, 'next').stdout, /Map: .* \(descriptions: 0 of 1 files\. Write them: ppc map --describe\)/);

  r.write({ '.architect/blueprint.yaml': readFileSync(join(r.dir, '.architect/blueprint.yaml'), 'utf8').replace('Renders the task list', 'Draws the task list') });
  assert.equal(JSON.parse(run(r.dir, 'next', '--json').stdout).map.stale, true, 'the design changed, even before a commit');
});

test('the session start redraws a map that is behind, in the background, and says so; a current one only gets its link', (t) => {
  const r = repo(t);
  const calls = [];
  const redraw = (root) => (calls.push(root), true);
  assert.doesNotMatch(sessionContext(r.dir, { redraw }), /Map:/, 'off: nothing');
  assert.equal(calls.length, 0);

  run(r.dir, 'map', '--on', '--descriptions', 'clone');
  assert.match(sessionContext(r.dir, { redraw }), /Map: being drawn in the background, because the code or the design changed since it was drawn/);
  assert.deepEqual(calls, [r.dir]);

  assert.equal(run(r.dir, 'map', '--html').status, 0);
  assert.match(sessionContext(r.dir, { redraw }), new RegExp(`Map: ${join(r.dir, PAGE).replace(/[.]/g, '\\.')}\n`));
  assert.equal(calls.length, 1, 'current: not redrawn');
});

test('startRedraw: runs ppc map --html in the background once, and not again while that run is going', (t) => {
  const r = repo(t);
  const spawned = [];
  const spawnFn = (cmd, args) => spawned.push([cmd, args]);
  assert.equal(startRedraw(r.dir, { spawnFn }), true);
  assert.equal(spawned.length, 1);
  assert.equal(spawned[0][0], process.execPath);
  assert.deepEqual(spawned[0][1].slice(1), ['map', '--html', r.dir]);
  assert.equal(startRedraw(r.dir, { spawnFn }), false, 'one is already running');
  assert.equal(spawned.length, 1);
  // a drawing removes the mark, so the next session may start one again
  assert.equal(run(r.dir, 'map', '--html').status, 0);
  assert.equal(startRedraw(r.dir, { spawnFn }), true);
});

/** The example in light mode, so a slice closes from its build commit. */
function lightRepo(t) {
  const r = repo(t);
  r.write({ '.architect/blueprint.yaml': readFileSync(join(r.dir, '.architect/blueprint.yaml'), 'utf8').replace('budgets:', 'default_mode: light\nbudgets:') });
  r.git('commit', '-q', '-am', 'light mode');
  return r;
}
const closeSl001 = (r) => {
  assert.equal(run(r.dir, 'start', 'SL-001').status, 0);
  const sha = r.commit('build(SL-001): health endpoint and its test', { 'src/health.js': lines(5), 'tests/health.test.js': lines(3) });
  // the audit file lives outside the project: an untracked file in it would stop the slice from closing
  const audit = join(mkdtempSync(join(tmpdir(), 'ppc-audit-')), 'audit.json');
  writeFileSync(audit, JSON.stringify({ commits: [{ sha, kind: 'build' }], tests_added: 1 }));
  return run(r.dir, 'finish', 'SL-001', '--audit', audit);
};

test('ppc finish: with the map on, closing a slice redraws it, lights up what the slice changed and gives the link', (t) => {
  const r = lightRepo(t);
  run(r.dir, 'map', '--on', '--descriptions', 'clone');
  const out = closeSl001(r);
  assert.equal(out.status, 0, out.stdout + out.stderr);
  assert.ok(out.stdout.includes(`Map updated: ${join(r.dir, PAGE)}`), out.stdout);
  const graph = JSON.parse(readFileSync(join(r.dir, 'floorplan/graph.json'), 'utf8'));
  assert.equal(graph.recent.tasks[0].title, 'SL-001 Deployable end-to-end skeleton');
  assert.ok(JSON.stringify(graph.recent.items).includes('src/health.js'));
  assert.match(readFileSync(join(r.dir, '.sddpp/map/map.md'), 'utf8'), /1 done/);
});

test('ppc finish: with the map off, closing a slice draws nothing (the flow is as it was)', (t) => {
  const r = lightRepo(t);
  const out = closeSl001(r);
  assert.equal(out.status, 0, out.stdout + out.stderr);
  assert.doesNotMatch(out.stdout, /Map/);
  assert.ok(!existsSync(join(r.dir, '.sddpp/map')));
});

test('openCommand: opens a browser only where there is a screen, and never in CI', () => {
  const file = '/p/floorplan/index.html';
  assert.equal(openCommand(file, 'linux', { CI: '1', DISPLAY: ':0' }), null);
  assert.equal(openCommand(file, 'linux', {}), null, 'no display');
  assert.deepEqual(openCommand(file, 'linux', { DISPLAY: ':0' }), ['xdg-open', [file]]);
  assert.deepEqual(openCommand(file, 'linux', { WAYLAND_DISPLAY: 'wayland-0' }), ['xdg-open', [file]]);
  assert.deepEqual(openCommand(file, 'darwin', {}), ['open', [file]]);
  assert.deepEqual(openCommand(file, 'win32', {}), ['cmd', ['/c', 'start', '""', file]]);
});

test('startRedraw: writes nothing and starts nothing in a floorplan/ folder that belongs to the project', (t) => {
  const r = repo(t);
  r.commit('the project has its own floorplan folder', { 'floorplan/rooms.md': '# Rooms\n' });
  const spawned = [];
  assert.equal(startRedraw(r.dir, { spawnFn: (...a) => spawned.push(a) }), false);
  assert.equal(spawned.length, 0);
  assert.ok(!existsSync(join(r.dir, 'floorplan/.cache')));
});

test('the session start really draws the map in the background, and the map is current afterwards', async (t) => {
  const r = repo(t);
  run(r.dir, 'map', '--on', '--descriptions', 'clone');
  assert.match(sessionContext(r.dir), /being drawn in the background/);
  const page = join(r.dir, PAGE);
  for (let i = 0; i < 100 && !(existsSync(page) && !existsSync(join(r.dir, 'floorplan/.cache/ppc-redraw.lock'))); i++) await new Promise((ok) => setTimeout(ok, 200));
  assert.ok(existsSync(page), 'drawn by the background run');
  assert.equal(JSON.parse(run(r.dir, 'next', '--json').stdout).map.stale, false);
});

// ── the map where a person decides (found in the first real project, F-T19 and F-T22) ───────────────────────────────────
// The owner: "at no point have you shown me the floorplan, to help me take decisions". `ppc next` printed its path at every step,
// and nothing put it beside a decision; `ppc map --open` wrote map.md and opened nothing.

test('ppc show: with the map on, the card of a decision ends with the map as a link; off, no word about it', (t) => {
  const r = repo(t);
  assert.doesNotMatch(run(r.dir, 'show', 'SL-002').stdout, /Map/);
  run(r.dir, 'map', '--on', '--descriptions', 'clone');
  assert.match(run(r.dir, 'show', 'SL-002').stdout, /Map: not drawn yet; draw it to see what this touches: ppc map --html/);
  assert.equal(run(r.dir, 'map', '--html').status, 0);
  for (const id of ['SL-002', 'CR-0001', 'DEBT-BE-001']) {
    const card = run(r.dir, 'show', id).stdout;
    assert.ok(card.includes(`Map: [${PAGE}](${PAGE})`), `${id}: ${card}`);
    assert.match(card, /components (it|this) touches/);
  }
});

test('ppc map --open draws the interactive map and opens it, not only map.md', (t) => {
  const r = repo(t);
  const out = run(r.dir, 'map', '--open');
  assert.equal(out.status, 0, out.stderr);
  assert.match(out.stdout, /Interactive map written: floorplan\/index\.html/);
  assert.ok(existsSync(join(r.dir, PAGE)));
});
