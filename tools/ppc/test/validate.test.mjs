import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { loadProject } from '../src/load.mjs';
import { validateModel, designFindings, RULES } from '../src/validate.mjs';

const EXAMPLE = fileURLToPath(new URL('../../../examples/todo-app/', import.meta.url));

const base = () => loadProject(EXAMPLE);
const slice = (m, id) => m.slices.find((s) => s.data.id === id);
const debtEntryOf = (m, component) => m.debt[0].data.entries.find((e) => e.component === component);

/** Validate and make sure every emitted rule is part of the published catalog. */
function run(model, options) {
  const found = validateModel(model, options);
  for (const f of found) assert.ok(f.rule in RULES, `rule ${f.rule} is not in RULES`);
  return found;
}
const has = (found, rule, severity) => found.some((f) => f.rule === rule && (!severity || f.severity === severity));
const errors = (found) => found.filter((f) => f.severity === 'error');

/** Turn a slice into a correctly finished one, so tests can break exactly one thing. */
function finish(model, id, audit = {}) {
  const s = slice(model, id).data;
  s.status = 'done';
  s.approved_by = 'reviewer';
  s.red_approved_by = 'reviewer';
  s.audit = {
    commits: [{ sha: 'a1b2c3d', kind: 'red' }, { sha: 'b2c3d4e', kind: 'green' }],
    production_lines: 120,
    test_lines: 60,
    tests_added: 4,
    mutation_score: 0.9,
    decisions: [],
    debt_created: [],
    deviations: [],
    ...audit,
  };
  return s;
}

test('the example project has no findings at all', () => {
  assert.deepEqual(run(base()), []);
});

test('a correctly finished slice is accepted', () => {
  const m = base();
  finish(m, 'SL-001');
  assert.deepEqual(errors(run(m)), []);
});

// ── structure and schema ─────────────────────────────────────────
test('R00: a missing required file is an error, and brief, glossary and evidence are not required', () => {
  const m = base();
  m.missingFiles = ['.architect/architecture.md'];
  assert.ok(has(run(m), 'R00', 'error'));
});

test('SCHEMA: unknown fields are rejected', () => {
  const m = base();
  slice(m, 'SL-002').data.surprise = true;
  assert.ok(has(run(m), 'SCHEMA', 'error'));
});

const conditionals = {
  'a feature slice needs a capability': (m) => delete slice(m, 'SL-002').data.capability,
  'a feature slice needs acceptance criteria': (m) => (slice(m, 'SL-002').data.acceptance = []),
  'a refactor slice must say which debt it pays': (m) => delete slice(m, 'SL-008').data.pays,
  'a ready slice needs approved_by': (m) => delete slice(m, 'SL-001').data.approved_by,
  'an in-progress slice needs a phase': (m) => Object.assign(slice(m, 'SL-001').data, { status: 'in_progress' }),
  'a done feature slice needs an audit': (m) => Object.assign(slice(m, 'SL-001').data, { status: 'done' }),
  'a spike needs a timebox': (m) => {
    const s = slice(m, 'SL-006').data;
    Object.assign(s, { type: 'spike', disposable: true });
    delete s.capability;
  },
  'green phase needs the human-approved red tests': (m) => Object.assign(slice(m, 'SL-001').data, { status: 'in_progress', phase: 'green' }),
  'accepted debt needs a reason': (m) => delete debtEntryOf(m, 'database').accepted_reason,
  'a dropped reason, when given, is a sentence': (m) => Object.assign(debtEntryOf(m, 'frontend'), { status: 'dropped', dropped_reason: 'short' }),
  'scheduled debt needs paid_by': (m) => delete debtEntryOf(m, 'frontend').paid_by,
  'non-proposed debt needs approved_by': (m) => delete debtEntryOf(m, 'frontend').approved_by,
  'an accepted ADR needs drivers': (m) => (m.adrs[0].data.drivers = []),
  'a decided change request needs decided_by': (m) => (m.changeRequests[0].data.status = 'accepted'),
};
for (const [name, mutate] of Object.entries(conditionals)) {
  test(`SCHEMA conditional: ${name}`, () => {
    const m = base();
    mutate(m);
    assert.ok(has(run(m), 'SCHEMA', 'error'));
  });
}

test('a dropped debt entry may carry the reason it was dropped, and has no error for it', () => {
  const m = base();
  Object.assign(debtEntryOf(m, 'frontend'), { status: 'dropped', dropped_reason: 'Not testing on the Mac before the MVP.' });
  delete debtEntryOf(m, 'frontend').paid_by;
  assert.equal(run(m).filter((f) => f.severity === 'error' && f.rule === 'SCHEMA').length, 0);
});

// ── traceability ─────────────────────────────────────────────────
const traceability = [
  ['T01', 'a slice with an unknown capability', (m) => (slice(m, 'SL-002').data.capability = 'CAP-099')],
  ['T01', 'a slice with an unknown component', (m) => (slice(m, 'SL-002').data.components = ['mobile'])],
  ['T01', 'a slice with an unknown quality attribute', (m) => (slice(m, 'SL-002').data.quality_attributes = ['QA-099'])],
  ['T01', 'a slice with an unknown dependency', (m) => (slice(m, 'SL-002').data.depends_on = ['SL-099'])],
  ['T01', 'a change request raised by an unknown slice', (m) => (m.changeRequests[0].data.raised_by = 'SL-099')],
  ['T01', 'a change request affecting an unknown component', (m) => (m.changeRequests[0].data.affects.components = ['mobile'])],
  ['T05', 'a dependency cycle', (m) => (slice(m, 'SL-001').data.depends_on = ['SL-002'])],
  ['T06', 'a capability without slices', (m) => (m.slices = m.slices.filter((s) => s.data.capability !== 'CAP-004'))],
  ['T07', 'a component justified by an unknown requirement', (m) => (m.blueprint.data.components[0].justified_by = ['CAP-099'])],
  ['T07', 'an ADR driven by an unknown requirement', (m) => (m.adrs[0].data.drivers = ['QA-099'])],
  ['T07', 'an ADR citing unknown evidence', (m) => (m.adrs[0].data.evidence = ['EV-099'])],
  ['T09', 'debt with the wrong component prefix', (m) => (debtEntryOf(m, 'frontend').id = 'DEBT-BE-001')],
  ['T10', 'a refactor paying debt that does not point back at it', (m) => (slice(m, 'SL-008').data.pays = ['DEBT-BE-001'])],
  ['T12', 'a slice file whose name does not match its id', (m) => (slice(m, 'SL-006').file = '.sddpp/slices/wrong-name.md')],
  ['T13', 'an audit citing an unknown decision', (m) => finish(m, 'SL-001', { decisions: ['ADR-0099'] })],
  ['T14', 'a slice planned for a future blueprint revision', (m) => (slice(m, 'SL-002').data.blueprint_revision = 2)],
];
for (const [rule, name, mutate] of traceability) {
  test(`${rule}: ${name}`, () => {
    const m = base();
    mutate(m);
    assert.ok(has(run(m), rule, 'error'));
  });
}

test('T09: debt is paid by a feature, fix or refactor slice that lists it, not by a skeleton', () => {
  const unlisted = base();
  debtEntryOf(unlisted, 'frontend').paid_by = 'SL-002';
  assert.ok(has(run(unlisted), 'T09', 'error'), 'a feature slice that does not list it in pays');
  const skeleton = base();
  debtEntryOf(skeleton, 'frontend').paid_by = 'SL-001';
  assert.ok(run(skeleton).some((f) => f.rule === 'T09' && /skeleton/.test(f.message)));
});

test('T12: duplicate slice ids are reported', () => {
  const m = base();
  m.slices.push(structuredClone(slice(m, 'SL-006')));
  assert.ok(has(run(m), 'T12', 'error'));
});

test('T13: debt listed in an audit must originate from that slice', () => {
  const m = base();
  finish(m, 'SL-001', { debt_created: ['DEBT-BE-001'] });
  assert.ok(has(run(m), 'T13', 'error'));
});

// ── lifecycle and budget ─────────────────────────────────────────
test('L01: a phase on a slice that is not in progress is an error', () => {
  const m = base();
  slice(m, 'SL-002').data.phase = 'red';
  assert.ok(has(run(m), 'L01', 'error'));
});

test('L02: the audit must show a red commit before a green commit', () => {
  const m = base();
  finish(m, 'SL-001', { commits: [{ sha: 'b2c3d4e', kind: 'green' }, { sha: 'a1b2c3d', kind: 'red' }] });
  assert.ok(has(run(m), 'L02', 'error'));
});

test('L03: a slice in progress requires a matching active.json', () => {
  const m = base();
  Object.assign(slice(m, 'SL-002').data, { status: 'in_progress', phase: 'red', approved_by: 'reviewer' });
  assert.ok(has(run(m), 'L03', 'error'));

  m.active = { file: '.sddpp/active.json', data: { slice: 'SL-002', phase: 'red' } };
  assert.ok(!has(run(m), 'L03'));

  m.active.data.phase = 'green';
  assert.ok(has(run(m), 'L03', 'error'));
});

test('L03: active.json cannot point at a slice that is not in progress', () => {
  const m = base();
  m.active = { file: '.sddpp/active.json', data: { slice: 'SL-002', phase: 'red' } };
  assert.ok(has(run(m), 'L03', 'error'));
});

test('L04: only one slice may be in progress', () => {
  const m = base();
  for (const id of ['SL-002', 'SL-006']) Object.assign(slice(m, id).data, { status: 'in_progress', phase: 'red', approved_by: 'reviewer' });
  assert.ok(has(run(m), 'L04', 'error'));
});

test('L05: debt cannot be paid by a slice that is not done', () => {
  const m = base();
  debtEntryOf(m, 'frontend').status = 'paid';
  assert.ok(has(run(m), 'L05', 'error'));
});

test('B01: exceeding the production-code budget needs a recorded reason', () => {
  const m = base();
  finish(m, 'SL-001', { production_lines: 500 });
  assert.ok(has(run(m), 'B01', 'error'));

  const ok = base();
  finish(ok, 'SL-001', { production_lines: 500, budget_override_reason: 'Generated migration inflates the diff.' });
  assert.ok(!has(run(ok), 'B01'));
});

test('B01: large tests do not consume the budget, only production code does', () => {
  const m = base();
  finish(m, 'SL-001', { production_lines: 100, test_lines: 900 });
  assert.ok(!has(run(m), 'B01'));
});

test('M01: a mutation score below the blueprint gate needs a recorded reason', () => {
  const gated = (audit) => {
    const m = base();
    m.blueprint.data.budgets.min_mutation_score = 0.8;
    finish(m, 'SL-001', audit);
    return m;
  };
  assert.ok(has(run(gated({ mutation_score: 0.5 })), 'M01', 'error'));
  assert.ok(!has(run(gated({ mutation_score: 0.5, mutation_override_reason: 'Equivalent mutants only.' })), 'M01'));
  assert.ok(!has(run(gated({ mutation_score: 0.8 })), 'M01'));
  assert.ok(!has(run(gated({ mutation_score: null })), 'M01'));
});

test('M01: without a gate in the blueprint any score is accepted', () => {
  const m = base();
  finish(m, 'SL-001', { mutation_score: 0.1 });
  assert.ok(!has(run(m), 'M01'));
});

test('SCHEMA: an audit must state both production_lines and test_lines', () => {
  const m = base();
  finish(m, 'SL-001');
  delete slice(m, 'SL-001').data.audit.test_lines;
  assert.ok(has(run(m), 'SCHEMA', 'error'));
  finish(m, 'SL-001');
  delete slice(m, 'SL-001').data.audit.production_lines;
  assert.ok(has(run(m), 'SCHEMA', 'error'));
});

// ── documents and warnings ───────────────────────────────────────
test('A01: an accepted ADR without its sections is an error, a proposed one a warning', () => {
  const accepted = base();
  accepted.adrs.find((a) => a.data.status === 'accepted').body = 'No sections here.';
  assert.ok(has(run(accepted), 'A01', 'error'));

  const proposed = base();
  proposed.adrs.find((a) => a.data.status === 'proposed').body = 'No sections here.';
  assert.ok(has(run(proposed), 'A01', 'warning'));
});

test('W01: a feature slice must say what it leaves out of scope', () => {
  const m = base();
  slice(m, 'SL-002').body = '## Behavior\n\nSomething.\n';
  assert.ok(has(run(m), 'W01', 'warning'));
});

test('W02: expired evidence is flagged', () => {
  assert.ok(has(run(base(), { now: new Date('2030-01-01') }), 'W02', 'warning'));
  assert.ok(!has(run(base(), { now: new Date('2026-10-25') }), 'W02'));
});

test('W03: unfinished slices planned against an older revision are flagged once, naming them', () => {
  const m = base();
  m.blueprint.data.revision = 2;
  const found = run(m).filter((f) => f.rule === 'W03');
  assert.equal(found.length, 1, 'one warning for the design change, not one per slice');
  assert.equal(found[0].severity, 'warning');
  const stale = m.slices.filter((s) => !['done', 'dropped'].includes(s.data.status) && s.data.blueprint_revision < 2);
  assert.ok(stale.length >= 3);
  for (const s of stale.slice(0, 3)) assert.ok(found[0].message.includes(s.data.id), `${s.data.id} is named`);
  assert.ok(/ppc reread/.test(found[0].message), 'it says what clears it');
  assert.ok(!has(run(base()), 'W03'));
});

// Found in the first real project (F-P1): the first slices of "import a recording" ran only through the engine and the
// terminal, although the design puts that capability in the app; the app came four slices later.
const w07 = (m) => run(m).filter((f) => f.rule === 'W07');
const SPIKE = { type: 'spike', timebox_hours: 4, disposable: true };

test('W07: the first slice of a capability must reach every component the design gives that capability', () => {
  const m = base(); // CAP-001 is justified in frontend and backend; SL-002 opens it, SL-004 follows it
  slice(m, 'SL-002').data.components = ['frontend', 'database'];
  const found = w07(m);
  assert.equal(found.length, 1);
  assert.equal(found[0].severity, 'warning');
  assert.match(found[0].message, /SL-002 opens CAP-001 but does not reach backend/);
  assert.match(found[0].message, /spike/, 'and says how to prove a risk first instead');
});

test('W07: a spike may prove a risk first, and a slice already closed is history', () => {
  const spike = base();
  Object.assign(slice(spike, 'SL-002').data, { ...SPIKE, components: ['backend'] });
  assert.ok(!run(spike).some((f) => f.rule === 'SCHEMA'), 'the spike is a valid one');
  assert.deepEqual(w07(spike), []);
  const done = base();
  finish(done, 'SL-002').components = ['frontend'];
  assert.deepEqual(w07(done), []);
});

test('W07: only the slices that open a capability must reach all of it, also when they follow it through another capability', () => {
  const second = base();
  slice(second, 'SL-004').data.components = ['frontend']; // SL-004 depends on SL-002, the slice that opened CAP-001
  assert.deepEqual(w07(second), []);
  const transitive = base();
  Object.assign(slice(transitive, 'SL-007').data, { capability: 'CAP-001', components: ['frontend'] }); // SL-007 → SL-003 → SL-002
  assert.deepEqual(w07(transitive), []);
  const opening = base();
  Object.assign(slice(opening, 'SL-006').data, { capability: 'CAP-001', depends_on: [], components: ['frontend'] });
  assert.equal(w07(opening).length, 1, 'a slice of the capability that follows no other one opens it too');
});

test('W08: an unfinished slice that depends on a slice it shares no component with is flagged', () => {
  const m = base();
  slice(m, 'SL-002').data.components = ['backend', 'database'];
  slice(m, 'SL-004').data.components = ['frontend']; // SL-004 depends on SL-002
  const found = run(m).filter((f) => f.rule === 'W08');
  assert.equal(found.length, 1);
  assert.equal(found[0].severity, 'warning');
  assert.match(found[0].message, /SL-004 depends on SL-002 but shares no component with it/);
  assert.ok(!has(run(base()), 'W08'), 'slices that share a component are not flagged');
  const done = base();
  slice(done, 'SL-002').data.components = ['backend', 'database'];
  finish(done, 'SL-004').components = ['frontend'];
  assert.ok(!has(run(done), 'W08'), 'a slice already closed is history');
});

test('T06: a spike does not deliver a capability', () => {
  const m = base();
  for (const id of ['SL-005', 'SL-006']) Object.assign(slice(m, id).data, SPIKE); // the only slices of CAP-003
  assert.ok(!run(m).some((f) => f.rule === 'SCHEMA'), 'the spikes are valid ones');
  assert.ok(has(run(m), 'T06', 'error'));
});

// ── the design itself: coherence and a complexity budget ─────────
const component = (m, id) => m.blueprint.data.components.find((c) => c.id === id);

test('D01: components that depend on each other in a circle are an architecture fault', () => {
  const m = base();
  component(m, 'database').may_depend_on = ['frontend']; // frontend -> backend -> database -> frontend
  assert.ok(has(run(m), 'D01', 'error'));
  assert.ok(!has(run(base()), 'D01'));
});

test('D02: a frontend must not reach the database, and a database must not depend on the layers above it', () => {
  const direct = base();
  component(direct, 'frontend').may_depend_on = ['backend', 'database'];
  assert.ok(has(run(direct), 'D02', 'error'));
  const inverted = base();
  component(inverted, 'database').may_depend_on = ['backend'];
  assert.ok(has(run(inverted), 'D02', 'error'));
  assert.ok(!has(run(base()), 'D02'));
});

const extraComponent = (n) => ({ id: `extra-${n}`, code: `X${'ABCDEFG'[n]}`, name: `Extra ${n}`, kind: 'library', responsibility: 'Something extra.', may_depend_on: [], justified_by: ['CAP-001'] });

test('D03: a project that declares itself lite has a small complexity budget', () => {
  const m = base();
  m.blueprint.data.project.level = 'lite';
  m.blueprint.data.components.push(extraComponent(1), extraComponent(2)); // 3 + 2 = 5 components
  const found = run(m).filter((f) => f.rule === 'D03');
  assert.equal(found.length, 1);
  assert.equal(found[0].severity, 'warning');
  assert.match(found[0].message, /5 components/);
});

test('D03: the same size is fine for a standard project, and counts capabilities and quality attributes too', () => {
  const standard = base();
  standard.blueprint.data.project.level = 'standard';
  standard.blueprint.data.components.push(extraComponent(1), extraComponent(2));
  assert.ok(!has(run(standard), 'D03'));

  const many = base();
  many.blueprint.data.project.level = 'lite';
  for (let i = 10; i < 20; i++) many.blueprint.data.capabilities.push({ id: `CAP-0${i}`, name: `Cap ${i}`, description: 'A capability.', priority: 'could' });
  assert.ok(run(many).some((f) => f.rule === 'D03' && /capabilities/.test(f.message)));

  const attrs = base();
  attrs.blueprint.data.project.level = 'lite';
  for (let i = 10; i < 16; i++) attrs.blueprint.data.quality_attributes.push({ id: `QA-0${i}`, attribute: 'usability', scenario: 'A scenario.', metric: 'a metric', target: 'a target' });
  assert.ok(run(attrs).some((f) => f.rule === 'D03' && /quality attributes/.test(f.message)));
});

test('designFindings: a design with no plan yet is judged only by the rules that concern the design', () => {
  const m = base();
  m.slices = []; // nothing planned: T06 fires for every capability
  m.debt = [];
  const all = run(m);
  assert.ok(has(all, 'T06'));
  assert.deepEqual(errors(designFindings(all)), []);
});

test('designFindings: still reports the faults of the design itself', () => {
  const cycle = base();
  cycle.slices = [];
  cycle.debt = [];
  component(cycle, 'database').may_depend_on = ['frontend'];
  assert.ok(designFindings(run(cycle)).some((f) => f.rule === 'D01'));
  const schema = base();
  schema.slices = [];
  schema.debt = [];
  schema.blueprint.data.capabilities[0].priority = 'urgent'; // not in the schema
  assert.ok(designFindings(run(schema)).some((f) => f.rule === 'SCHEMA'));
});

test('designFindings: a broken slice or debt file is not the design\'s business', () => {
  const m = base();
  slice(m, 'SL-002').data.surprise = true; // SCHEMA error in a slice file
  assert.ok(has(run(m), 'SCHEMA'));
  assert.ok(!designFindings(run(m)).some((f) => f.file.startsWith('.sddpp/')));
});

test('W05: a quality attribute that no live slice references is a warning, and a dropped slice does not count', () => {
  const m = base();
  assert.ok(!has(run(m), 'W05'));
  for (const { data: s } of m.slices) s.quality_attributes = (s.quality_attributes ?? []).filter((q) => q !== 'QA-004');
  const found = run(m);
  assert.ok(has(found, 'W05', 'warning'));
  assert.ok(found.some((f) => f.rule === 'W05' && f.message.includes('QA-004')));

  const dropped = base();
  for (const { data: s } of dropped.slices) s.quality_attributes = (s.quality_attributes ?? []).filter((q) => q !== 'QA-004');
  slice(dropped, 'SL-004').data.quality_attributes = ['QA-004'];
  slice(dropped, 'SL-004').data.status = 'dropped';
  assert.ok(has(run(dropped), 'W05'));
});

// ── rules removed on 2026-11-16: nothing in the first real project made them fire ──
test('removed rules stay removed: one T01 for references in the plan, one T07 for references in the design, no D04, no T15', () => {
  for (const id of ['T02', 'T03', 'T04', 'T08', 'T11', 'T15', 'D04']) assert.ok(!(id in RULES), `${id} is gone`);
  assert.ok('T01' in RULES && 'T07' in RULES);
});

test('a slice no longer carries a link to a spec story', () => {
  const m = base();
  slice(m, 'SL-002').data.spec = { file: 'specs/001/spec.md', story: 'User Story 1' };
  assert.ok(has(run(m), 'SCHEMA', 'error'));
});

test('W04: a slice with many acceptance criteria probably needs splitting', () => {
  const m = base();
  slice(m, 'SL-002').data.acceptance = Array.from({ length: 6 }, (_, i) => ({ id: `AC-${i + 1}`, scenario: 'Given a state, when an action happens, then something is true.' }));
  assert.ok(has(run(m), 'W04', 'warning'));
});

// ── W12: a fix slice carries its bug (found in the first real project: four planned fix slices had no section and nothing said so) ───
const asFix = (m, id, body) => {
  const s = slice(m, id);
  s.data.type = 'fix';
  s.body = body;
  return s;
};
const withReproduction = '\n## Behavior\n\nIt breaks.\n\n## Out of scope\n\nNothing else.\n\n## Reproduction\n\nSeverity: medium, one person, no data at risk\nSeen by: the owner\nHow to reproduce: add a task with 201 characters\n';

test('W12: a fix slice still to be built has no "## Reproduction" section', () => {
  const m = base();
  asFix(m, 'SL-002', '\n## Behavior\n\nIt breaks.\n\n## Out of scope\n\nNothing else.\n');
  const found = run(m).filter((f) => f.rule === 'W12');
  assert.equal(found.length, 1);
  assert.equal(found[0].severity, 'warning');
  assert.match(found[0].message, /SL-002.*## Reproduction.*not reproduced yet/);
});

test('W12: it asks for the three lines too, and "not reproduced yet" is an honest value for the last one', () => {
  const m = base();
  asFix(m, 'SL-002', withReproduction.replace('Seen by: the owner\n', ''));
  assert.match(run(m).find((f) => f.rule === 'W12').message, /Seen by:/);
  const ok = base();
  asFix(ok, 'SL-002', withReproduction.replace('add a task with 201 characters', 'not reproduced yet'));
  assert.ok(!has(run(ok), 'W12'));
  const full = base();
  asFix(full, 'SL-002', withReproduction);
  assert.ok(!has(run(full), 'W12'));
});

test('W12: not for a closed fix slice (built before the rule), a dropped one, or any other type', () => {
  const closed = base();
  asFix(closed, 'SL-002', '\n## Out of scope\n\nx\n').data.status = 'done';
  assert.ok(!has(run(closed), 'W12'));
  const dropped = base();
  asFix(dropped, 'SL-002', '\n## Out of scope\n\nx\n').data.status = 'dropped';
  assert.ok(!has(run(dropped), 'W12'));
  assert.ok(!has(run(base()), 'W12'), 'features and the skeleton carry no bug');
});
