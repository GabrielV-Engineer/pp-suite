import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { SURFACES, CRITERIA, surfacesFor, renderRubric } from '../src/rubric.mjs';
import { CLI, EXAMPLE } from './helpers.mjs';

// The rubric a review applies (docs/standards.md, "Experience"): a short list of criteria for each surface a person meets. A criterion
// either cites its source with the words the source uses, or says that it is pp-suite's own question. Nothing in between.

test('the surfaces are screens, an API, a command line and documentation', () => {
  assert.deepEqual(Object.keys(SURFACES).sort(), ['api', 'cli', 'docs', 'screen']);
  for (const s of Object.values(SURFACES)) assert.ok(s.title.length >= 3);
});

test('every criterion has an id, a name and a question, in a surface that exists, and the ids are unique', () => {
  const ids = CRITERIA.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const c of CRITERIA) {
    assert.match(c.id, /^[A-Z]{1,3}-\d{2}$/, c.id);
    assert.ok(c.name.length >= 5, c.id);
    assert.ok(c.ask.length >= 25, `${c.id} asks a real question`);
    assert.ok(c.surface in SURFACES, `${c.id}: surface ${c.surface}`);
  }
  for (const surface of Object.keys(SURFACES)) assert.ok(CRITERIA.filter((c) => c.surface === surface).length >= 2, `${surface} has criteria`);
});

test('a criterion cites its source with quotes, or is pp-suite\'s own, and a quote is short and literal', () => {
  for (const c of CRITERIA) {
    if (c.source === null) {
      assert.equal(c.ours, true, `${c.id}: no source means it is ours`);
      continue;
    }
    assert.ok(!c.ours, c.id);
    assert.match(c.source.url, /^https:\/\//, c.id);
    assert.match(c.source.read, /^\d{4}-\d{2}-\d{2}$/, `${c.id}: the day the page was read`);
    assert.ok(c.source.name.length >= 5, c.id);
    assert.ok(Array.isArray(c.source.quote) && c.source.quote.length >= 1, `${c.id} keeps the quote`);
    for (const q of c.source.quote) assert.ok(q.length >= 10 && q.length <= 125, `${c.id}: a quote is a few words, not a page (${q.length})`);
    if (c.source.adapted !== undefined) assert.ok(c.source.adapted.length >= 15, `${c.id}: says what pp-suite changed`);
  }
});

test('every source is one the page really named: Nielsen Norman Group, W3C or clig.dev', () => {
  const hosts = new Set(CRITERIA.filter((c) => c.source).map((c) => new URL(c.source.url).host));
  for (const h of hosts) assert.ok(['www.nngroup.com', 'www.w3.org', 'clig.dev'].includes(h), h);
});

test('surfacesFor: a frontend is a screen, a backend or a library an API, the rest meets no one; the person may add more', () => {
  assert.deepEqual(surfacesFor(['frontend']), ['screen']);
  assert.deepEqual(surfacesFor(['backend', 'library', 'frontend']).sort(), ['api', 'screen']);
  assert.deepEqual(surfacesFor(['database', 'infra']), []);
  assert.deepEqual(surfacesFor(['backend'], ['cli', 'docs']).sort(), ['api', 'cli', 'docs']);
  assert.deepEqual(surfacesFor([], ['cli']), ['cli']);
  assert.throws(() => surfacesFor([], ['hologram']), /hologram/);
});

test('renderRubric: the criteria of the surfaces, each with its source and quote, or marked as pp-suite\'s own; the same text every time', () => {
  const once = renderRubric(['screen', 'cli']);
  assert.equal(renderRubric(['screen', 'cli']), once);
  for (const c of CRITERIA.filter((x) => ['screen', 'cli'].includes(x.surface))) {
    assert.ok(once.includes(c.id) && once.includes(c.name), c.id);
    if (c.source) assert.ok(once.includes(c.source.url) && once.includes(c.source.quote[0]), `${c.id} shows where it comes from`);
    else assert.match(once, /pp-suite's own question/);
  }
  assert.ok(!CRITERIA.filter((x) => x.surface === 'api').some((c) => once.includes(c.id)), 'not the other surfaces');
});

test('CLI: ppc rubric prints every surface, one surface, and refuses one that does not exist', () => {
  const run = (...args) => spawnSync('node', [CLI, 'rubric', ...args], { encoding: 'utf8' });
  const all = run();
  assert.equal(all.status, 0, all.stderr);
  for (const s of Object.keys(SURFACES)) assert.match(all.stdout, new RegExp(SURFACES[s].title));
  const one = run('cli');
  assert.equal(one.status, 0);
  assert.match(one.stdout, /clig\.dev/);
  assert.ok(!/nngroup/.test(one.stdout));
  assert.equal(run('hologram').status, 1);
  assert.equal(run('--surprise').status, 2);
});
