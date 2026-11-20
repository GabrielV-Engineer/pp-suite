import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MAP_SETTINGS, openCommand, readMapSettings } from '../src/mapflow.mjs';
import { sessionContext } from '../src/session.mjs';
import { CLI, lines, repo } from './helpers.mjs';

// CI=1 keeps any browser from opening while the tests run, whatever a test turns on.
const run = (dir, ...args) => spawnSync('node', [CLI, ...args], { cwd: dir, encoding: 'utf8', env: { ...process.env, CI: '1' } });
const PAGE = 'floorplan/index.html';

test('the map is off until someone turns it on: no setting means no html and no opening', (t) => {
  const r = repo(t);
  assert.deepEqual(readMapSettings(r.dir), { html: false, open: false });
  r.write({ [MAP_SETTINGS]: '{ not json' });
  assert.deepEqual(readMapSettings(r.dir), { html: false, open: false }, 'a broken file counts as off');
});

test('ppc map --on and --off: turn the map into the flow and out of it, and say what they did', (t) => {
  const r = repo(t);
  const on = run(r.dir, 'map', '--on');
  assert.equal(on.status, 0, on.stderr);
  assert.match(on.stdout, /on/i);
  assert.deepEqual(readMapSettings(r.dir), { html: true, open: false });
  assert.equal(run(r.dir, 'map', '--on', '--open').status, 0);
  assert.deepEqual(readMapSettings(r.dir), { html: true, open: true });
  assert.equal(run(r.dir, 'map', '--off').status, 0);
  assert.deepEqual(readMapSettings(r.dir), { html: false, open: false });
  const both = run(r.dir, 'map', '--on', '--off');
  assert.notEqual(both.status, 0, 'on and off together is refused');
});

test('ppc next: no word about the map while it is off; with it on, the link to the page, or how to draw it', (t) => {
  const r = repo(t);
  assert.doesNotMatch(run(r.dir, 'next').stdout, /Map:/);
  assert.equal(JSON.parse(run(r.dir, 'next', '--json').stdout).map, null);

  run(r.dir, 'map', '--on');
  assert.match(run(r.dir, 'next').stdout, /Map: not drawn yet\. Draw it: ppc map --html/);
  assert.deepEqual(JSON.parse(run(r.dir, 'next', '--json').stdout).map, { page: join(r.dir, PAGE), drawn: false });

  assert.equal(run(r.dir, 'map', '--html').status, 0);
  assert.ok(run(r.dir, 'next').stdout.includes(`Map: ${join(r.dir, PAGE)}`));
  assert.equal(JSON.parse(run(r.dir, 'next', '--json').stdout).map.drawn, true);
});

test('the session start carries the same link when the map is on', (t) => {
  const r = repo(t);
  assert.doesNotMatch(sessionContext(r.dir), /Map:/);
  run(r.dir, 'map', '--on');
  assert.match(sessionContext(r.dir), /Map: not drawn yet/);
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
  run(r.dir, 'map', '--on');
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
