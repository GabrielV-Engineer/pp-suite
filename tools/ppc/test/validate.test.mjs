import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadProject } from '../src/load.mjs';
import { validateModel, designFindings, RULES } from '../src/validate.mjs';
import { repo } from './helpers.mjs';

const EXAMPLE = fileURLToPath(new URL('../../../examples/todo-app/', import.meta.url));

const base = () => loadProject(EXAMPLE);
const slice = (m, id) => m.slices.find((s) => s.data.id === id);
const debtOf = (m, component) => m.debt.find((d) => d.data.component === component).data;

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

test('R01: a component without a debt register is an error', () => {
  const m = base();
  m.debt = m.debt.filter((d) => d.data.component !== 'backend');
  assert.ok(has(run(m), 'R01', 'error'));
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
  'accepted debt needs a reason': (m) => delete debtOf(m, 'database').entries[0].accepted_reason,
  'scheduled debt needs paid_by': (m) => delete debtOf(m, 'frontend').entries[0].paid_by,
  'non-proposed debt needs approved_by': (m) => delete debtOf(m, 'frontend').entries[0].approved_by,
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

// ── traceability ─────────────────────────────────────────────────
const traceability = {
  T01: ['an unknown capability', (m) => (slice(m, 'SL-002').data.capability = 'CAP-099')],
  T02: ['an unknown component', (m) => (slice(m, 'SL-002').data.components = ['mobile'])],
  T03: ['an unknown quality attribute', (m) => (slice(m, 'SL-002').data.quality_attributes = ['QA-099'])],
  T04: ['an unknown dependency', (m) => (slice(m, 'SL-002').data.depends_on = ['SL-099'])],
  T05: ['a dependency cycle', (m) => (slice(m, 'SL-001').data.depends_on = ['SL-002'])],
  T06: ['a capability without slices', (m) => (m.slices = m.slices.filter((s) => s.data.capability !== 'CAP-004'))],
  T07: ['a component justified by an unknown requirement', (m) => (m.blueprint.data.components[0].justified_by = ['CAP-099'])],
  T08: ['an ADR driven by an unknown requirement', (m) => (m.adrs[0].data.drivers = ['QA-099'])],
  T09: ['debt with the wrong component prefix', (m) => (debtOf(m, 'frontend').entries[0].id = 'DEBT-BE-001')],
  T10: ['a refactor paying debt that does not point back at it', (m) => (slice(m, 'SL-008').data.pays = ['DEBT-BE-001'])],
  T11: ['a change request raised by an unknown slice', (m) => (m.changeRequests[0].data.raised_by = 'SL-099')],
  T12: ['a slice file whose name does not match its id', (m) => (slice(m, 'SL-006').file = '.sddpp/slices/wrong-name.md')],
  T13: ['an audit citing an unknown decision', (m) => finish(m, 'SL-001', { decisions: ['ADR-0099'] })],
  T14: ['a slice planned for a future blueprint revision', (m) => (slice(m, 'SL-002').data.blueprint_revision = 2)],
};
for (const [rule, [name, mutate]] of Object.entries(traceability)) {
  test(`${rule}: ${name}`, () => {
    const m = base();
    mutate(m);
    assert.ok(has(run(m), rule, 'error'));
  });
}

test('T09: debt must be paid by a refactor slice', () => {
  const m = base();
  debtOf(m, 'frontend').entries[0].paid_by = 'SL-002';
  assert.ok(has(run(m), 'T09', 'error'));
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
  debtOf(m, 'frontend').entries[0].status = 'paid';
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

test('W03: unfinished slices planned against an older revision are flagged', () => {
  const m = base();
  m.blueprint.data.revision = 2;
  assert.ok(has(run(m), 'W03', 'warning'));
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

test('D04: when every capability is a must, nothing was prioritized', () => {
  const m = base();
  for (const c of m.blueprint.data.capabilities) c.priority = 'must';
  assert.ok(has(run(m), 'D04', 'warning'));
  assert.ok(!has(run(base()), 'D04'));
  const few = base();
  few.blueprint.data.capabilities = few.blueprint.data.capabilities.slice(0, 2).map((c) => ({ ...c, priority: 'must' }));
  assert.ok(!has(run(few), 'D04')); // with so few capabilities, all of them being a must is plausible
});

test('designFindings: a design with no plan yet is judged only by the rules that concern the design', () => {
  const m = base();
  m.slices = []; // nothing planned: T06 fires for every capability
  m.debt = []; // no registers yet: R01 fires for every component
  const all = run(m);
  assert.ok(has(all, 'T06') && has(all, 'R01'));
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

// ── the link from a slice to its story in the spec ───────────────
const SPEC = '# Feature\n\n### User Story 1 - Add a task (Priority: P1)\n\nGiven...\n\n### User Story 2 - See the list\n';
const withSpec = (spec, specs) => {
  const m = base();
  slice(m, 'SL-002').data.spec = spec;
  m.specs = specs;
  return m;
};

test('T15: a slice may point at its story in a spec file, and the story must exist', () => {
  const ok = withSpec({ file: 'specs/001/spec.md', story: 'User Story 1' }, { 'specs/001/spec.md': SPEC });
  assert.ok(!has(run(ok), 'T15'));
  assert.ok(!has(run(ok), 'SCHEMA'));
  const noStory = withSpec({ file: 'specs/001/spec.md', story: 'User Story 7' }, { 'specs/001/spec.md': SPEC });
  assert.ok(has(run(noStory), 'T15', 'error'));
  const noFile = withSpec({ file: 'specs/001/spec.md', story: 'User Story 1' }, { 'specs/001/spec.md': null });
  assert.ok(has(run(noFile), 'T15', 'error'));
});

test('T15: a story is a heading, not any mention of its name in the text', () => {
  const m = withSpec({ file: 'specs/001/spec.md', story: 'User Story 3' }, { 'specs/001/spec.md': SPEC + '\nSee also User Story 3 for later.\n' });
  assert.ok(has(run(m), 'T15', 'error'));
});

test('SCHEMA: the spec link must be a relative path to a Markdown file inside the project', () => {
  for (const file of ['/etc/passwd.md', '../outside/spec.md', 'specs/spec.txt']) {
    const m = withSpec({ file, story: 'User Story 1' }, {});
    assert.ok(has(run(m), 'SCHEMA', 'error'), file);
  }
});

test('the loader reads the spec files that slices point at', (t) => {
  const r = repo(t);
  r.write({ 'specs/001/spec.md': SPEC });
  const file = '.sddpp/slices/SL-002-create-and-list-tasks.md';
  const text = readFileSync(`${r.dir}/${file}`, 'utf8');
  r.write({ [file]: text.replace('status: planned', 'status: planned\nspec: { file: specs/001/spec.md, story: User Story 1 }') });
  const model = loadProject(r.dir);
  assert.equal(model.specs['specs/001/spec.md'], SPEC);
  assert.ok(!has(run(model), 'T15'));
  r.write({ [file]: text.replace('status: planned', 'status: planned\nspec: { file: specs/nope.md, story: User Story 1 }') });
  const missing = loadProject(r.dir);
  assert.equal(missing.specs['specs/nope.md'], null);
  assert.ok(has(run(missing), 'T15', 'error'));
});

test('W04: a slice with many acceptance criteria probably needs splitting', () => {
  const m = base();
  slice(m, 'SL-002').data.acceptance = Array.from({ length: 6 }, (_, i) => ({ id: `AC-${i + 1}`, scenario: 'Given a state, when an action happens, then something is true.' }));
  assert.ok(has(run(m), 'W04', 'warning'));
});
