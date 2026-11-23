import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { loadProject } from '../src/load.mjs';
import { validateModel, RULES } from '../src/validate.mjs';
import { STANDARDS, recommend, renderStandards } from '../src/standards.mjs';
import { decideStandard, LifecycleError } from '../src/lifecycle.mjs';
import { EXAMPLE, repo } from './helpers.mjs';

const decided = {
  security: { id: 'security', decision: 'adopt', choice: 'basic', decided_by: 'owner', decided_on: '2026-11-19' },
  observability: { id: 'observability', decision: 'not_needed', reason: 'A local app for one person', decided_by: 'owner', decided_on: '2026-11-19' },
  git: { id: 'git', decision: 'adopt', choice: 'trunk', decided_by: 'owner', decided_on: '2026-11-19' },
  ci: { id: 'ci', decision: 'adopt', choice: 'local', decided_by: 'owner', decided_on: '2026-11-19' },
  experience: { id: 'experience', decision: 'adopt', choice: 'review', decided_by: 'owner', decided_on: '2026-11-19' },
};
const all = (over = {}) => Object.values({ ...decided, ...over });

/** The example with these standards and these repository facts. */
const withStandards = (list, facts = {}) => {
  const m = loadProject(EXAMPLE);
  m.standards = list === null ? null : { file: '.sddpp/standards.yaml', data: { standards: list } };
  m.facts = { gitRemote: null, ciConfig: [], ...facts };
  return m;
};
const run = (m) => {
  const found = validateModel(m);
  for (const f of found) assert.ok(f.rule in RULES, `rule ${f.rule} is not in RULES`);
  return found;
};
const has = (found, rule, severity) => found.some((f) => f.rule === rule && (!severity || f.severity === severity));

// ── the file and its schema ──────────────────────────────────────
test('standards: every decided standard adds no findings', () => {
  const found = run(withStandards(all()));
  assert.deepEqual(found.filter((f) => f.file === '.sddpp/standards.yaml'), []);
});

test('SCHEMA: each answer carries what it needs', () => {
  const bad = (over) => has(run(withStandards(all(over))), 'SCHEMA', 'error');
  assert.ok(bad({ security: { ...decided.security, choice: undefined } }), 'adopt needs a choice');
  assert.ok(bad({ security: { ...decided.security, choice: 'paranoid' } }), 'a choice of another standard');
  assert.ok(bad({ git: { ...decided.git, choice: 'basic' } }), 'basic is a security choice, not a git one');
  assert.ok(bad({ git: { id: 'git', decision: 'not_needed', reason: 'No git here', decided_by: 'o', decided_on: '2026-11-19' } }), 'git cannot be not needed');
  assert.ok(bad({ ci: { id: 'ci', decision: 'later', decided_by: 'o', decided_on: '2026-11-19' } }), 'later needs a trigger');
  assert.ok(bad({ observability: { ...decided.observability, reason: undefined } }), 'not needed needs a reason');
  assert.ok(bad({ ci: { ...decided.ci, choice: 'custom' } }), 'custom needs details');
  assert.ok(bad({ ci: { ...decided.ci, decided_by: undefined } }), 'a decision says who made it');
  assert.ok(bad({ ci: { ...decided.ci, surprise: 1 } }), 'unknown fields are rejected');
  assert.ok(!bad({ ci: { ...decided.ci, choice: 'custom', details: 'Jenkins runs ppc on every merge' } }), 'custom with details is fine');
});

test('T12: a standard listed twice', () => {
  assert.ok(has(run(withStandards([...all(), decided.git])), 'T12', 'error'));
});

// ── S01: undecided ───────────────────────────────────────────────
test('S01: no standards file is one warning that says how to decide them', () => {
  const found = run(withStandards(null)).filter((f) => f.rule === 'S01');
  assert.equal(found.length, 1);
  assert.equal(found[0].severity, 'warning');
  assert.match(found[0].message, /ppc standards/);
});

test('S01: a pending or missing standard is a warning, never an error', () => {
  const pending = run(withStandards(all({ ci: { id: 'ci', decision: 'pending' } })));
  assert.ok(has(pending, 'S01', 'warning') && !has(pending, 'S01', 'error'));
  const missing = run(withStandards(Object.values(decided).filter((s) => s.id !== 'git')));
  assert.ok(missing.some((f) => f.rule === 'S01' && /git/.test(f.message)));
});

// ── S02: a deferred standard whose trigger fired ─────────────────
test('S02: later with a trigger that has happened', () => {
  const later = all({ ci: { id: 'ci', decision: 'later', trigger: 'git_remote', decided_by: 'o', decided_on: '2026-11-19' } });
  assert.ok(!has(run(withStandards(later)), 'S02'), 'no remote yet');
  assert.ok(has(run(withStandards(later, { gitRemote: 'git@github.com:someone/app.git' })), 'S02', 'warning'));
  const onBackend = all({ observability: { id: 'observability', decision: 'later', trigger: 'backend_component', decided_by: 'o', decided_on: '2026-11-19' } });
  assert.ok(has(run(withStandards(onBackend)), 'S02', 'warning'), 'the example has a backend');
  const onInfra = all({ observability: { id: 'observability', decision: 'later', trigger: 'infra_component', decided_by: 'o', decided_on: '2026-11-19' } });
  assert.ok(!has(run(withStandards(onInfra)), 'S02'), 'the example has no infra component');
  const onCi = all({ ci: { id: 'ci', decision: 'later', trigger: 'ci_config', decided_by: 'o', decided_on: '2026-11-19' } });
  assert.ok(has(run(withStandards(onCi, { ciConfig: ['.gitlab-ci.yml'] })), 'S02', 'warning'));
});

// ── S03: a product standard reaches the design ───────────────────
test('S03: adopted observability without an operability quality attribute', () => {
  const adopted = all({ observability: { id: 'observability', decision: 'adopt', choice: 'errors', decided_by: 'o', decided_on: '2026-11-19' } });
  const found = run(withStandards(adopted)).filter((f) => f.rule === 'S03');
  assert.equal(found.length, 1);
  assert.match(found[0].message, /operability/);
  assert.match(found[0].message, /change request/);
});

test('S03: adopted security is satisfied by a security quality attribute (the example has one)', () => {
  assert.ok(!has(run(withStandards(all())), 'S03'));
  const m = withStandards(all());
  m.blueprint.data.quality_attributes = m.blueprint.data.quality_attributes.filter((q) => q.attribute !== 'security');
  m.slices = m.slices.map((s) => ({ ...s, data: { ...s.data, quality_attributes: (s.data.quality_attributes ?? []).filter((q) => q !== 'QA-004') } }));
  assert.ok(has(run(m), 'S03', 'warning'));
});

// ── D03 and the standards: what a person adopted is not scope the design chose ──
const observing = { id: 'observability', decision: 'adopt', choice: 'errors', decided_by: 'o', decided_on: '2026-11-19' };
/** The example as a standard project (limit 8 quality attributes) with `extra` more of its own, on top of the three a standard asks for. */
const crowded = (extra, list = all({ observability: observing })) => {
  const m = withStandards(list);
  m.blueprint.data.project.level = 'standard';
  const base = m.blueprint.data.quality_attributes;
  m.blueprint.data.quality_attributes = [...base, { ...base[0], id: 'QA-006', attribute: 'operability' }, ...Array.from({ length: extra }, (_, i) => ({ ...base[0], id: `QA-${String(7 + i).padStart(3, "0")}`, attribute: 'reliability' }))];
  return m;
};

test('D03: the quality attribute an adopted standard calls for does not count against the limit of the level', () => {
  // security, usability and operability are what three adopted standards ask for; QA-001 to QA-003 and the three added are the design's own
  const m = crowded(3);
  assert.equal(m.blueprint.data.quality_attributes.length, 9);
  assert.ok(!has(run(m), 'D03'), 'following S03 must not trip D03');
});

test('D03: it still fires when the design\'s own quality attributes pass the limit, and says what it left out', () => {
  const found = run(crowded(6)).filter((f) => f.rule === 'D03');
  assert.equal(found.length, 1);
  assert.match(found[0].message, /9 quality attributes \(limit 8\)/);
  assert.match(found[0].message, /not counting the 3 that adopted standards ask for/);
});

test('D03: a standard that is not adopted exempts nothing', () => {
  const found = run(crowded(3, all({ observability: { ...observing, decision: 'not_needed', choice: undefined, reason: 'A local app for one person' }, security: { ...decided.security, decision: 'not_needed', choice: undefined, reason: 'Nothing is stored' }, experience: { ...decided.experience, decision: 'not_needed', choice: undefined, reason: 'Nobody uses it' } }))).filter((f) => f.rule === 'D03');
  assert.equal(found.length, 1);
  assert.match(found[0].message, /9 quality attributes \(limit 8\)/);
});

// ── experience: the fifth standard (docs/standards.md) ───────────
const schemaBad = (over) => has(run(withStandards(all(over))), 'SCHEMA', 'error');
const exp = (more) => ({ ...decided.experience, ...more });

test('experience: its choices are glance, review, external and custom; it may be not needed, with a reason', () => {
  for (const choice of ['glance', 'review', 'external']) assert.ok(!schemaBad({ experience: exp({ choice }) }), choice);
  assert.ok(!schemaBad({ experience: exp({ choice: 'custom', details: 'Our QA team reviews every release' }) }));
  assert.ok(schemaBad({ experience: exp({ choice: 'custom' }) }), 'custom needs details');
  assert.ok(schemaBad({ experience: exp({ choice: 'basic' }) }), 'basic is a security choice');
  assert.ok(schemaBad({ security: { ...decided.security, choice: 'review' } }), 'review is an experience choice');
  const notNeeded = { id: 'experience', decision: 'not_needed', reason: 'Nothing here is used by a person', decided_by: 'o', decided_on: '2026-11-19' };
  assert.ok(!schemaBad({ experience: notNeeded }));
  assert.ok(!has(run(withStandards(all({ experience: notNeeded }))), 'S03'), 'not needed asks nothing of the design');
});

test('S03: adopted experience needs a usability quality attribute in the design', () => {
  assert.ok(!has(run(withStandards(all())), 'S03'), 'the example carries one');
  const m = withStandards(all());
  m.blueprint.data.quality_attributes = m.blueprint.data.quality_attributes.filter((q) => q.attribute !== 'usability');
  m.slices = m.slices.map((s) => ({ ...s, data: { ...s.data, quality_attributes: (s.data.quality_attributes ?? []).filter((q) => q !== 'QA-005') } }));
  const found = run(m).filter((f) => f.rule === 'S03');
  assert.equal(found.length, 1);
  assert.match(found[0].message, /usability/);
});

test('recommend experience: review where there is a frontend, glance where a person meets an API or a library, not needed otherwise', () => {
  const bp = loadProject(EXAMPLE).blueprint.data;
  const only = (...kinds) => ({ ...bp, components: bp.components.filter((c) => kinds.includes(c.kind)) });
  const r = recommend(bp, {}).experience;
  assert.deepEqual([r.decision, r.choice], ['adopt', 'review']);
  assert.ok(r.why.length > 10);
  assert.equal(recommend(only('backend', 'database'), {}).experience.choice, 'glance');
  assert.equal(recommend({ ...bp, components: [{ id: 'core', kind: 'library' }] }, {}).experience.choice, 'glance');
  const none = recommend(only('database'), {}).experience;
  assert.equal(none.decision, 'not_needed');
  assert.ok(none.reason.length >= 5);
  for (const kinds of [['frontend'], ['backend'], ['database'], ['frontend', 'backend', 'database']]) {
    assert.notEqual(recommend(only(...kinds), {}).experience.choice, 'external', 'external is the person\'s decision, never a recommendation');
  }
});

test('debt: experience is a kind of debt', () => {
  const m = withStandards(all());
  m.debt[0].data.entries[0].kind = 'experience';
  assert.deepEqual(run(m).filter((f) => f.rule === 'SCHEMA'), []);
});

// ── recommendations from the project's facts ─────────────────────
test('recommend: from the components and the remote, each with a reason', () => {
  const bp = loadProject(EXAMPLE).blueprint.data;
  const r = recommend(bp, { gitRemote: null, ciConfig: [] });
  assert.deepEqual(Object.keys(r).sort(), [...STANDARDS.map((s) => s.id)].sort());
  assert.equal(r.security.decision, 'adopt');
  assert.equal(r.security.choice, 'basic');
  assert.equal(r.observability.choice, 'errors');
  assert.equal(r.git.choice, 'trunk');
  assert.deepEqual([r.ci.decision, r.ci.trigger], ['later', 'git_remote']);
  for (const one of Object.values(r)) assert.ok(one.why.length > 10);
  assert.equal(recommend(bp, { gitRemote: 'https://gitlab.com/team/app.git' }).ci.choice, 'gitlab');
  assert.equal(recommend(bp, { gitRemote: 'git@github.com:someone/app.git' }).ci.choice, 'github');
  const bare = { ...bp, components: bp.components.filter((c) => c.kind === 'frontend') };
  assert.equal(recommend(bare, {}).security.decision, 'not_needed');
  assert.equal(recommend(bare, {}).observability.decision, 'not_needed');
});

test('renderStandards: every standard, what was decided or recommended, and how to decide', () => {
  const m = withStandards(all({ ci: { id: 'ci', decision: 'pending' } }));
  const out = renderStandards(m.standards.data.standards, recommend(m.blueprint.data, m.facts));
  for (const s of STANDARDS) assert.match(out, new RegExp(s.id));
  assert.match(out, /Recommended/);
  assert.match(out, /ppc ask ci/);
});

// ── deciding ─────────────────────────────────────────────────────
/** A copy of the example with no standards decided yet. */
const fresh = (t) => {
  const r = repo(t);
  rmSync(join(r.dir, '.sddpp/standards.yaml'), { force: true });
  return r;
};
const read = (dir) => parseYaml(readFileSync(join(dir, '.sddpp/standards.yaml'), 'utf8')).standards;

test('decideStandard: accept the recommended ones creates the file', (t) => {
  const { dir } = fresh(t);
  const result = decideStandard(dir, null, { acceptRecommended: true, by: 'owner', today: '2026-11-19' });
  assert.deepEqual(Object.keys(result.decided).sort(), STANDARDS.map((s) => s.id).sort());
  const list = read(dir);
  assert.equal(list.find((s) => s.id === 'security').choice, 'basic');
  assert.equal(list.find((s) => s.id === 'ci').trigger, 'git_remote', 'a copy has no remote');
  assert.ok(list.every((s) => s.decided_by === 'owner' && s.decided_on === '2026-11-19'));
  assert.ok(!validateModel(loadProject(dir)).some((f) => f.rule === 'S01' || f.rule === 'SCHEMA'));
});

test('decideStandard: accept the recommended ones leaves what is decided alone', (t) => {
  const { dir } = fresh(t);
  decideStandard(dir, 'git', { adopt: 'branch-per-slice', by: 'owner', today: '2026-11-19' });
  const { decided: again } = decideStandard(dir, null, { acceptRecommended: true, by: 'owner', today: '2026-11-19' });
  assert.ok(!('git' in again));
  assert.equal(read(dir).find((s) => s.id === 'git').choice, 'branch-per-slice');
});

test('decideStandard: a change keeps the earlier decision in history', (t) => {
  const { dir } = fresh(t);
  decideStandard(dir, 'ci', { adopt: 'local', by: 'owner', today: '2026-11-02' });
  decideStandard(dir, 'ci', { adopt: 'github', by: 'owner', today: '2026-11-19' });
  const ci = read(dir).find((s) => s.id === 'ci');
  assert.equal(ci.choice, 'github');
  assert.deepEqual(ci.history, [{ decision: 'adopt', choice: 'local', decided_by: 'owner', decided_on: '2026-11-02' }]);
});

test('decideStandard: later, not needed and custom', (t) => {
  const { dir } = fresh(t);
  decideStandard(dir, 'observability', { later: true, trigger: 'infra_component', by: 'owner', today: '2026-11-19' });
  decideStandard(dir, 'security', { notNeeded: true, reason: 'Nothing leaves this machine', by: 'owner', today: '2026-11-19' });
  decideStandard(dir, 'ci', { adopt: 'custom', details: 'Jenkins runs ppc on every merge', by: 'owner', today: '2026-11-19' });
  const list = read(dir);
  assert.equal(list.find((s) => s.id === 'observability').trigger, 'infra_component');
  assert.equal(list.find((s) => s.id === 'security').reason, 'Nothing leaves this machine');
  assert.equal(list.find((s) => s.id === 'ci').details, 'Jenkins runs ppc on every merge');
});

test('decideStandard: refuses what the contract would reject, and changes nothing', (t) => {
  const { dir } = fresh(t);
  const refused = (id, opts) => assert.throws(() => decideStandard(dir, id, { by: 'owner', today: '2026-11-19', ...opts }), LifecycleError);
  refused('privacy', { adopt: 'basic' });
  refused('security', { adopt: 'trunk' });
  refused('git', { notNeeded: true, reason: 'We do not use git' });
  refused('security', { notNeeded: true });
  refused('ci', { later: true });
  refused('ci', { later: true, trigger: 'tomorrow' });
  refused('ci', { adopt: 'custom' });
  refused('ci', {});
  assert.throws(() => decideStandard(dir, 'ci', { adopt: 'local', by: ' ' }), LifecycleError, 'a person decides');
  assert.throws(() => readFileSync(join(dir, '.sddpp/standards.yaml')), /ENOENT/, 'no file was written');
});

test('load: the facts of the repository are read only when there is a standards file', (t) => {
  const { dir, git } = fresh(t);
  assert.equal(loadProject(dir).facts, undefined);
  writeFileSync(join(dir, '.sddpp/standards.yaml'), 'standards: []\n');
  assert.equal(loadProject(dir).facts.gitRemote, null);
  git('remote', 'add', 'origin', 'git@github.com:someone/app.git');
  assert.equal(loadProject(dir).facts.gitRemote, 'git@github.com:someone/app.git');
  writeFileSync(join(dir, '.gitlab-ci.yml'), 'stages: []\n');
  assert.deepEqual(loadProject(dir).facts.ciConfig, ['.gitlab-ci.yml']);
  rmSync(join(dir, '.gitlab-ci.yml'));
});
