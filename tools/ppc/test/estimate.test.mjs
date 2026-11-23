import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadProject } from '../src/load.mjs';
import { validateModel, RULES } from '../src/validate.mjs';
import { renderDecision, askFor } from '../src/decisions.mjs';
import { EXAMPLE } from './helpers.mjs';

// A slice's size is estimated when it is planned, not found at the close (first real project: 6 of 53 slices closed over the
// 500-line budget, every one by an exception decided at `ppc finish`; `/pp-plan`'s "if you expect more, split" estimated nothing).

const example = () => structuredClone(loadProject(EXAMPLE));
const slice = (m, id) => m.slices.find((s) => s.data.id === id).data;
const findings = (m, rule) => validateModel(m).filter((f) => f.rule === rule);
const BASIS = 'AC-1 store and schema ~80, AC-2 two API methods ~60, AC-3 the form ~120';

test('estimate: the slice may carry its estimate and how it was reckoned; the schema refuses one without a basis', () => {
  const m = example();
  slice(m, 'SL-002').estimate = { production_lines: 150, basis: BASIS };
  assert.deepEqual(findings(m, 'SCHEMA'), []);
  const bad = example();
  slice(bad, 'SL-002').estimate = { production_lines: 150 };
  assert.equal(findings(bad, 'SCHEMA').length, 1);
});

test('B02: a slice still to be built that is estimated over the budget is a warning, before it is approved', () => {
  assert.equal(RULES.B02 !== undefined, true);
  const m = example();
  slice(m, 'SL-002').estimate = { production_lines: 260, basis: BASIS };
  const [one] = findings(m, 'B02');
  assert.equal(one.severity, 'warning');
  assert.match(one.message, /SL-002 is estimated at 260 production lines, budget is 200/);
  assert.match(one.message, /split it/);
  const within = example();
  slice(within, 'SL-002').estimate = { production_lines: 200, basis: BASIS };
  assert.deepEqual(findings(within, 'B02'), [], 'at the budget is inside it');
  const done = example();
  Object.assign(slice(done, 'SL-002'), { status: 'done', estimate: { production_lines: 260, basis: BASIS } });
  assert.deepEqual(findings(done, 'B02').filter((f) => f.message.includes('SL-002')), [], 'a closed slice is judged by B01, not by its estimate');
});

test('the card shows the estimate against the budget, and says to split before approving when it is over', () => {
  const m = example();
  slice(m, 'SL-002').estimate = { production_lines: 150, basis: BASIS };
  assert.match(renderDecision(m, 'SL-002'), /Size:\s+estimated 150 of 200 production lines \(AC-1 store/);
  slice(m, 'SL-002').estimate.production_lines = 260;
  assert.match(renderDecision(m, 'SL-002'), /over the budget: split it before approving it, or its close will need an exception/i);
  assert.match(askFor(m, 'SL-002').questions[0].question, /Why: .*estimated at 260 production lines, over the budget of 200/);
});

test('a closed slice shows its estimate beside what was measured', () => {
  const m = example();
  const s = slice(m, 'SL-002');
  s.estimate = { production_lines: 150, basis: BASIS };
  s.status = 'done';
  s.audit = { commits: [{ sha: 'abcdef1', kind: 'build' }], production_lines: 310, test_lines: 90, tests_added: 4, mutation_score: null, decisions: [], debt_created: [], deviations: [] };
  assert.match(renderDecision(m, 'SL-002'), /Size:\s+estimated 150, measured 310 production lines/);
});

test('/pp-plan estimates each slice by criterion and writes it, and says what B02 means', () => {
  const p = readFileSync(new URL('../../../sdd-pp/extension/sddpp-cycle/commands/slices.md', import.meta.url), 'utf8').replace(/\s+/g, ' ');
  assert.match(p, /`estimate: \{ production_lines: <n>, basis: "<per criterion>" \}`/);
  assert.match(p, /per acceptance criterion/i);
  assert.match(p, /B02/);
});
