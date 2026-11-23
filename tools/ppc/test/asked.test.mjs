import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { loadProject } from '../src/load.mjs';
import { askedReport, renderAsked } from '../src/asked.mjs';
import { CLI, EXAMPLE, repo } from './helpers.mjs';

// `ppc asked`: how the person's side went, in numbers, from files that never leave the machine (`.sddpp/answers.jsonl` is git-ignored).
// It reads and prints; it writes nothing. The baseline for the inbox and the "Why:" line (first real project, 2026-11-23).

const day = (d) => Date.parse(`${d}T12:00:00`) / 1000;
const example = () => structuredClone(loadProject(EXAMPLE));
const slice = (m, id) => m.slices.find((s) => s.data.id === id).data;
const AUDIT = (production_lines, extra = {}) => ({ commits: [{ sha: 'abcdef1', kind: 'build' }], production_lines, test_lines: 10, tests_added: 1, mutation_score: null, decisions: [], debt_created: [], deviations: [], ...extra });

function closedModel() {
  const m = example();
  Object.assign(slice(m, 'SL-001'), { status: 'done', closed_on: '2026-11-20', audit: AUDIT(150), glanced_by: 'Ana', glanced_on: '2026-11-22' });
  Object.assign(slice(m, 'SL-002'), { status: 'done', closed_on: '2026-11-21', audit: AUDIT(260, { budget_override_reason: 'one flow' }), estimate: { production_lines: 180, basis: 'AC-1 ~80, AC-2 ~100' } });
  Object.assign(slice(m, 'SL-003'), { status: 'done', closed_on: '2026-11-22', audit: AUDIT(90), glanced_by: 'Ana', glanced_on: '2026-11-22', glance_skipped: true });
  return m;
}
const ENTRIES = [
  { id: 'a#0', at: day('2026-11-20'), question: 'Approve SL-001?', label: 'Yes — ppc approve SL-001', command: 'ppc approve SL-001' },
  { consumed: 'a#0', at: day('2026-11-20') },
  { id: 'b#0', at: day('2026-11-21'), question: 'Approve SL-002?', label: 'Yes — ppc approve SL-002', command: 'ppc approve SL-002' },
  { id: 'c#0', at: day('2026-11-21'), question: 'What do we do with DEBT-BE-001?', kind: 'option', label: 'Not yet' },
  { id: 'd#0', at: day('2026-11-22'), question: 'Look at the database: does this project need a tool for it?', kind: 'own-words' },
  { id: 'e#0', at: day('2026-11-22'), question: 'Q?', kind: 'unknown' },
  'not json at all',
];

test('the panel: every answer counted by what it did, and the questions answered in the person\'s own words', () => {
  const r = askedReport(closedModel(), ENTRIES, { today: '2026-11-23' });
  assert.deepEqual(r.panel, { answers: 5, carried_out: 1, chose_a_command_not_carried_out: 1, option_without_command: 1, own_words: 1, unknown: 1, since: '2026-11-20' });
  assert.deepEqual(r.own_words, ['Look at the database: does this project need a tool for it?']);
});

test('per closed slice: answers and closes counted over the same days, from the first dated close', () => {
  const m = closedModel();
  const early = [{ id: 'z#0', at: day('2026-11-01'), question: 'Old?', label: 'Yes — ppc approve SL-009', command: 'ppc approve SL-009' }, ...ENTRIES];
  assert.deepEqual(askedReport(m, early, { today: '2026-11-23' }).slices, { from: '2026-11-20', closed_since: 3, answers_since: 5, answers_per_closed_slice: 1.7 }, 'an answer before the first dated close is left out of the ratio');

  const r = askedReport(closedModel(), ENTRIES, { today: '2026-11-23' });
  assert.deepEqual(r.slices, { from: '2026-11-20', closed_since: 3, answers_since: 5, answers_per_closed_slice: 1.7 });
});

test('glances: looked, skipped, waiting, and how many days a look took', () => {
  const m = closedModel();
  const r = askedReport(m, ENTRIES, { today: '2026-11-23' });
  assert.equal(r.glances.looked, 1);
  assert.equal(r.glances.skipped, 1);
  assert.deepEqual(r.glances.waiting, [{ id: 'SL-002', days: 2 }]);
  assert.deepEqual(r.glances.days_to_look, { median: 2, max: 2 });
});

test('budget: slices closed over it, and the estimate beside what was measured', () => {
  const r = askedReport(closedModel(), ENTRIES, { today: '2026-11-23' });
  assert.deepEqual(r.budget, { budget: 200, closed: 3, over: ['SL-002'], estimated: [{ id: 'SL-002', estimate: 180, measured: 260 }] });
});

test('the text says each number in a line, and says what it cannot see', () => {
  const text = renderAsked(askedReport(closedModel(), ENTRIES, { today: '2026-11-23' }));
  assert.match(text, /5 panel answers since 2026-11-20/);
  assert.match(text, /1 in the person's own words/);
  assert.match(text, /1\.7 answers per closed slice/);
  assert.match(text, /SL-002: waiting 2 days/);
  assert.match(text, /SL-002: estimated 180, measured 260/);
  assert.match(text, /Answers recorded before .* name a command only/i);
  assert.match(text, /nothing here leaves this machine/i);
});

test('with no answers file it still reports the slices, and says there are no answers', () => {
  const text = renderAsked(askedReport(closedModel(), [], { today: '2026-11-23' }));
  assert.match(text, /No panel answers are recorded/);
  assert.match(text, /SL-002: waiting 2 days/);
});

test('cli: ppc asked prints and writes nothing; --json gives the same numbers', (t) => {
  const r = repo(t);
  const out = spawnSync('node', [CLI, 'asked'], { cwd: r.dir, encoding: 'utf8' });
  assert.equal(out.status, 0, out.stderr);
  assert.match(out.stdout, /panel answers|No panel answers/);
  const json = JSON.parse(spawnSync('node', [CLI, 'asked', '--json'], { cwd: r.dir, encoding: 'utf8' }).stdout);
  assert.ok('panel' in json && 'glances' in json && 'budget' in json);
  assert.equal(r.git('status', '--porcelain'), '', 'nothing in the project changed');
});
