import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { modeOf, testPolicy } from './policy.mjs';

const SCHEMA_DIR = new URL('../../../contract/v0.1/schemas/', import.meta.url);
const SCHEMA_NAMES = ['blueprint', 'slice', 'debt', 'adr', 'evidence', 'change-request', 'active', 'additions'];
const WORK_TYPES = ['skeleton', 'feature', 'fix'];
/** Heuristic budgets by declared level, a guard against over-engineering. They are defaults, not findings of any study. */
const LEVEL_LIMITS = {
  lite: { components: 4, capabilities: 8, quality_attributes: 5 },
  standard: { components: 8, capabilities: 20, quality_attributes: 8 },
};
const ADR_HEADINGS = ['Context', 'Decision', 'Rejected alternatives', 'Consequences'];

/** Every rule the validator can emit. docs/contract-v0.1.md mirrors this table. */
export const RULES = {
  PARSE: 'A file could not be parsed.',
  SCHEMA: 'An artifact does not match its JSON Schema.',
  R00: 'A required file is missing.',
  R01: 'A component has no debt register file.',
  T01: 'A slice references a capability that does not exist.',
  T02: 'A slice references a component that does not exist.',
  T03: 'A slice references a quality attribute that does not exist.',
  T04: 'A slice depends on a slice that does not exist.',
  T05: 'Slice dependencies contain a cycle.',
  T06: 'A capability has no slice (no requirement without a slice).',
  T07: 'A component references an unknown requirement or component.',
  D01: 'Components depend on each other in a circle.',
  D02: 'A dependency between components points the wrong way for their kind (a frontend reaching the database, or a database depending on the layers above it).',
  D03: 'The design is larger than the complexity budget of its declared level.',
  D04: 'Every capability is a must, so nothing was prioritized.',
  T08: 'An ADR references an unknown driver, evidence or ADR.',
  T09: 'A debt entry is inconsistent with its component, origin or paying slice.',
  T10: 'A refactor slice pays a debt entry that does not point back at it.',
  T11: 'A change request references an unknown slice, component, ADR or quality attribute.',
  T12: 'An id is duplicated, or a file name does not match its id.',
  T13: 'A slice audit references unknown decisions or debt, or debt with the wrong origin.',
  T14: 'A slice was planned against a blueprint revision that does not exist yet.',
  T15: 'A slice points at a spec file or a user story that does not exist.',
  T17: 'A change request is marked applied but the design revision has not risen since it was opened.',
  T16: 'A closed work slice changed no test files although its test policy is required.',
  L01: 'A slice has a phase while it is not in progress.',
  L02: 'The audit commits of a strict slice are not ordered red before green.',
  L06: 'The phase of a slice does not belong to its mode (build is for light slices, red and green for strict ones).',
  L03: 'active.json is missing or does not match the slice in progress.',
  L04: 'More than one slice is in progress.',
  L05: 'A debt entry is marked paid but its paying slice is not done.',
  B01: 'A slice exceeded the production-code budget without a recorded reason.',
  M01: 'A slice mutation score is below the blueprint gate without a recorded reason.',
  C01: 'An audit commit does not exist in the git history.',
  C02: 'A green, refactor or structural commit touches a test file.',
  C03: 'A red commit touches production code.',
  C04: 'The audit production_lines or test_lines do not match what the commits changed.',
  C05: 'The red commit is not an ancestor of the green commit.',
  C06: 'A test file changed between the approved red commit and the end of the slice, whether or not the audit lists the commit that changed it.',
  C07: 'The test script in package.json changed between the approved red commit and the end of the slice.',
  A01: 'An ADR lacks a required section.',
  W01: 'A work slice does not state what it leaves out of scope.',
  W02: 'Evidence has expired and must be re-checked.',
  W03: 'An unfinished slice was planned against an older blueprint revision.',
  W04: 'A slice has many acceptance criteria and probably needs splitting.',
  W05: 'A quality attribute is not referenced by any live slice, so nothing plans to deliver or verify it.',
  W06: 'A closed work slice changed no test files and no test debt entry is open about it, under an optional test policy.',
  X01: 'An addition is still undecided (a warning while the design is drafted, an error once slices exist).',
  X02: 'A cut addition was applied but something that only it justified is still in the design.',
  X03: 'A cut addition was applied but the non-goal it becomes is not among the non-goals.',
  X04: 'An addition was decided to be cut but the cut was not applied (a warning while the design is drafted, an error once slices exist).',
  X05: 'An addition points at something that does not exist (a design id, or another addition it overlaps), or its id is duplicated.',
  G01: 'A generated view is missing or stale.',
};

/** The rules that judge a design on its own, before any slice or debt register exists. */
const DESIGN_RULES = new Set(['PARSE', 'SCHEMA', 'R00', 'T07', 'T08', 'A01', 'W02', 'D01', 'D02', 'D03', 'D04', 'X01', 'X02', 'X03', 'X04', 'X05']);

/** Keep only the findings about `.architect/`, from the rules that concern the design. */
export function designFindings(findings) {
  return findings.filter((f) => DESIGN_RULES.has(f.rule) && String(f.file).startsWith('.architect/'));
}

let compiled;
function validators() {
  if (compiled) return compiled;
  // strictRequired is off because `if/then` branches require properties declared on the parent schema.
  const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false, allowUnionTypes: true });
  addFormats(ajv);
  compiled = Object.fromEntries(
    SCHEMA_NAMES.map((n) => [n, ajv.compile(JSON.parse(readFileSync(new URL(`${n}.schema.json`, SCHEMA_DIR), 'utf8')))]),
  );
  return compiled;
}

function schemaFindings(name, data, file) {
  const validate = validators()[name];
  if (validate(data)) return [];
  return validate.errors
    .filter((e) => e.keyword !== 'if')
    .map((e) => {
      const extra = e.params?.missingProperty ?? e.params?.additionalProperty ?? '';
      return { rule: 'SCHEMA', severity: 'error', file, message: `${e.instancePath || '/'} ${e.message}${extra ? ` (${extra})` : ''}` };
    });
}

const hasHeading = (body, title) => new RegExp(`^##\\s+${title}\\s*$`, 'mi').test(body);

export function validateModel(model, { now = new Date() } = {}) {
  const out = [...model.errors];
  const add = (rule, severity, file, message) => out.push({ rule, severity, file, message });
  const error = (rule, file, message) => add(rule, 'error', file, message);
  const warn = (rule, file, message) => add(rule, 'warning', file, message);

  for (const f of model.missingFiles ?? []) error('R00', f, 'required file is missing');
  if (!model.blueprint) return out;

  // ── schema pass ───────────────────────────────────────────────
  const bpFindings = schemaFindings('blueprint', model.blueprint.data, model.blueprint.file);
  out.push(...bpFindings);
  if (bpFindings.length) return out; // cross-reference rules need a valid blueprint

  const checked = (items, schema) =>
    items.filter((item) => {
      const found = schemaFindings(schema, item.data, item.file);
      out.push(...found);
      return found.length === 0;
    });
  const slices = checked(model.slices, 'slice');
  const adrs = checked(model.adrs, 'adr');
  const evidence = checked(model.evidence, 'evidence');
  const crs = checked(model.changeRequests, 'change-request');
  const debtFiles = checked(model.debt, 'debt');
  const active = model.active ? checked([model.active], 'active')[0] : null;

  const bp = model.blueprint.data;
  const comps = new Map(bp.components.map((c) => [c.id, c]));
  const caps = new Set(bp.capabilities.map((c) => c.id));
  const qas = new Set(bp.quality_attributes.map((q) => q.id));
  const requirementIds = new Set([...caps, ...qas, ...bp.constraints.map((c) => c.id)]);
  const sliceById = new Map(slices.map((s) => [s.data.id, s]));
  const adrIds = new Set(adrs.map((a) => a.data.id));
  const evidenceIds = new Set(evidence.map((e) => e.data.id));
  const debtById = new Map();
  for (const df of debtFiles) for (const entry of df.data.entries) debtById.set(entry.id, { entry, component: df.data.component, file: df.file });

  // ── T12: ids unique, file names match ids ─────────────────────
  const checkIds = (items, kind, idOf) => {
    const seen = new Map();
    for (const item of items) {
      const id = idOf(item);
      if (seen.has(id)) error('T12', item.file, `duplicate ${kind} id ${id} (also in ${seen.get(id)})`);
      seen.set(id, item.file);
      const name = basename(item.file);
      if (!name.startsWith(`${id}-`) && !name.startsWith(`${id}.`)) error('T12', item.file, `file name must start with ${id}`);
    }
  };
  checkIds(slices, 'slice', (s) => s.data.id);
  checkIds(adrs, 'ADR', (a) => a.data.id);
  checkIds(evidence, 'evidence', (e) => e.data.id);
  checkIds(crs, 'change request', (c) => c.data.id);
  const seenDebt = new Map();
  for (const df of debtFiles) {
    if (basename(df.file) !== `${df.data.component}.yaml`) error('T12', df.file, `file name must be ${df.data.component}.yaml`);
    for (const e of df.data.entries) {
      if (seenDebt.has(e.id)) error('T12', df.file, `duplicate debt id ${e.id} (also in ${seenDebt.get(e.id)})`);
      seenDebt.set(e.id, df.file);
    }
  }

  // ── T07: components ───────────────────────────────────────────
  for (const c of bp.components) {
    for (const ref of c.justified_by) if (!requirementIds.has(ref)) error('T07', model.blueprint.file, `component ${c.id} is justified by unknown ${ref}`);
    for (const dep of c.may_depend_on) {
      if (!comps.has(dep)) error('T07', model.blueprint.file, `component ${c.id} may depend on unknown component ${dep}`);
      if (dep === c.id) error('T07', model.blueprint.file, `component ${c.id} cannot depend on itself`);
    }
  }

  // ── D01, D02: the dependency structure of the design must make sense ──
  const componentById = new Map(bp.components.map((c) => [c.id, c]));
  {
    const state = new Map();
    const visit = (id, path) => {
      if (state.get(id) === 2 || !componentById.has(id)) return;
      if (state.get(id) === 1) {
        error('D01', model.blueprint.file, `components depend on each other in a circle: ${[...path.slice(path.indexOf(id)), id].join(' → ')}`);
        return;
      }
      state.set(id, 1);
      for (const next of componentById.get(id).may_depend_on) if (next !== id) visit(next, [...path, id]);
      state.set(id, 2);
    };
    for (const c of bp.components) visit(c.id, []);
  }
  for (const c of bp.components) {
    for (const depId of c.may_depend_on) {
      const dep = componentById.get(depId);
      if (!dep || depId === c.id) continue;
      if (c.kind === 'frontend' && dep.kind === 'database') error('D02', model.blueprint.file, `${c.id} (frontend) depends directly on ${depId} (database); it should go through a backend`);
      if (c.kind === 'database' && ['frontend', 'backend'].includes(dep.kind)) error('D02', model.blueprint.file, `${c.id} (database) depends on ${depId} (${dep.kind}), which sits above it`);
    }
  }

  // ── D03, D04: a complexity budget, and a sign of unprioritized scope ──
  const limits = LEVEL_LIMITS[bp.project.level];
  if (limits) {
    const sizes = { components: bp.components.length, capabilities: bp.capabilities.length, quality_attributes: bp.quality_attributes.length };
    const over = Object.entries(sizes).filter(([key, n]) => n > limits[key]).map(([key, n]) => `${n} ${key.replace('_', ' ')} (limit ${limits[key]})`);
    if (over.length) warn('D03', model.blueprint.file, `a ${bp.project.level} project has ${over.join(', ')}; cut scope or declare a larger level`);
  }
  if (bp.capabilities.length >= 4 && bp.capabilities.every((c) => c.priority === 'must')) {
    warn('D04', model.blueprint.file, `all ${bp.capabilities.length} capabilities are a must; decide what is only a should or a could`);
  }

  // ── R01: one debt file per component ──────────────────────────
  const debtComponents = new Set(debtFiles.map((d) => d.data.component));
  for (const c of bp.components) {
    if (!debtComponents.has(c.id)) error('R01', `.sddpp/debt/${c.id}.yaml`, `component ${c.id} has no debt register (an empty one is fine)`);
  }

  // ── slices: T01-T06, T14, L01, W01, W03, W04 ──────────────────
  for (const { file, data: s, body } of slices) {
    if (s.capability && !caps.has(s.capability)) error('T01', file, `${s.id} references unknown capability ${s.capability}`);
    for (const c of s.components) if (!comps.has(c)) error('T02', file, `${s.id} references unknown component ${c}`);
    for (const q of s.quality_attributes ?? []) if (!qas.has(q)) error('T03', file, `${s.id} references unknown quality attribute ${q}`);
    for (const d of s.depends_on ?? []) if (!sliceById.has(d)) error('T04', file, `${s.id} depends on unknown slice ${d}`);
    if (s.blueprint_revision > bp.revision) error('T14', file, `${s.id} targets revision ${s.blueprint_revision}, blueprint is at ${bp.revision}`);
    if (s.phase && WORK_TYPES.includes(s.type)) {
      const mode = modeOf(bp, s);
      if (mode === 'light' && s.phase !== 'build') error('L06', file, `${s.id} is a light slice, so its phase is build, not ${s.phase}`);
      if (mode === 'strict' && s.phase === 'build') error('L06', file, `${s.id} is a strict slice, so it has no build phase`);
    }
    if (s.phase && s.status !== 'in_progress') error('L01', file, `${s.id} has phase "${s.phase}" but status is ${s.status}`);
    if (WORK_TYPES.includes(s.type) && !hasHeading(body, 'Out of scope')) warn('W01', file, `${s.id} should state what it leaves out under "## Out of scope"`);
    if (!['done', 'dropped'].includes(s.status) && s.blueprint_revision < bp.revision) warn('W03', file, `${s.id} was planned against revision ${s.blueprint_revision}, blueprint is at ${bp.revision}`);
    if ((s.acceptance?.length ?? 0) > 5) warn('W04', file, `${s.id} has ${s.acceptance.length} acceptance criteria; consider splitting it`);
  }

  // T05: dependency cycles
  const graph = new Map(slices.map(({ data: s }) => [s.id, (s.depends_on ?? []).filter((d) => sliceById.has(d))]));
  const mark = new Map();
  const visit = (id, path) => {
    if (mark.get(id) === 2) return;
    if (mark.get(id) === 1) {
      error('T05', sliceById.get(id).file, `dependency cycle: ${[...path.slice(path.indexOf(id)), id].join(' → ')}`);
      return;
    }
    mark.set(id, 1);
    for (const next of graph.get(id)) visit(next, [...path, id]);
    mark.set(id, 2);
  };
  for (const id of graph.keys()) visit(id, []);

  // T15: the story a slice delivers is a heading of the spec file it points at
  for (const { file, data: s } of slices) {
    if (!s.spec) continue;
    const text = model.specs?.[s.spec.file];
    const escaped = s.spec.story.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (text == null) error('T15', file, `${s.id} points at spec file ${s.spec.file}, which cannot be read`);
    else if (!new RegExp(`^#{1,6}\\s+${escaped}\\b`, 'im').test(text)) error('T15', file, `${s.id} points at "${s.spec.story}", which is not a heading in ${s.spec.file}`);
  }

  // T06: every capability is covered by a live slice
  for (const cap of bp.capabilities) {
    if (!slices.some(({ data: s }) => s.capability === cap.id && s.status !== 'dropped')) error('T06', model.blueprint.file, `capability ${cap.id} has no slice`);
  }

  // W05: every quality attribute is delivered or verified by some live slice
  for (const qa of bp.quality_attributes) {
    if (!slices.some(({ data: s }) => s.status !== 'dropped' && (s.quality_attributes ?? []).includes(qa.id))) warn('W05', model.blueprint.file, `quality attribute ${qa.id} is not referenced by any slice`);
  }

  // ── ADRs and evidence: T08, A01, W02 ──────────────────────────
  for (const { file, data: a, body } of adrs) {
    for (const d of a.drivers) if (!requirementIds.has(d)) error('T08', file, `${a.id} has unknown driver ${d}`);
    for (const e of a.evidence ?? []) if (!evidenceIds.has(e)) error('T08', file, `${a.id} cites unknown evidence ${e}`);
    for (const s of a.supersedes ?? []) if (!adrIds.has(s)) error('T08', file, `${a.id} supersedes unknown ${s}`);
    const missing = ADR_HEADINGS.filter((h) => !hasHeading(body, h));
    if (missing.length) (a.status === 'accepted' ? error : warn)('A01', file, `${a.id} lacks section(s): ${missing.join(', ')}`);
  }
  for (const { file, data: e } of evidence) {
    if (new Date(e.expires) < now) warn('W02', file, `${e.id} expired on ${e.expires}; re-check the source`);
  }

  // ── debt: T09, L05 ────────────────────────────────────────────
  const originOk = { slice: (r) => sliceById.has(r), decision: (r) => adrIds.has(r), blueprint: (r) => requirementIds.has(r), audit: () => true };
  for (const df of debtFiles) {
    const comp = comps.get(df.data.component);
    if (!comp) {
      error('T09', df.file, `unknown component ${df.data.component}`);
      continue;
    }
    for (const e of df.data.entries) {
      if (!new RegExp(`^DEBT-${comp.code}-\\d{3,}$`).test(e.id)) error('T09', df.file, `${e.id} must use prefix DEBT-${comp.code}- in ${comp.id}'s register`);
      if (!originOk[e.origin.type](e.origin.ref)) error('T09', df.file, `${e.id} has unknown ${e.origin.type} origin "${e.origin.ref}"`);
      for (const other of e.also_affects ?? []) if (!comps.has(other) || other === comp.id) error('T09', df.file, `${e.id} also_affects invalid component ${other}`);
      if (e.paid_by) {
        const payer = sliceById.get(e.paid_by)?.data;
        if (!payer) error('T09', df.file, `${e.id} is paid by unknown slice ${e.paid_by}`);
        else {
          if (payer.type !== 'refactor') error('T09', df.file, `${e.id} must be paid by a refactor slice, ${payer.id} is ${payer.type}`);
          if (!(payer.pays ?? []).includes(e.id)) error('T09', df.file, `${payer.id} does not list ${e.id} in "pays"`);
          if (e.status === 'paid' && payer.status !== 'done') error('L05', df.file, `${e.id} is paid but ${payer.id} is ${payer.status}`);
        }
      }
    }
  }

  // ── T10: refactor slices point at scheduled debt ──────────────
  for (const { file, data: s } of slices) {
    for (const id of s.pays ?? []) {
      const d = debtById.get(id);
      if (!d) error('T10', file, `${s.id} pays unknown debt ${id}`);
      else if (!['scheduled', 'paid'].includes(d.entry.status) || d.entry.paid_by !== s.id) error('T10', file, `${s.id} pays ${id}, but that debt is ${d.entry.status} with paid_by ${d.entry.paid_by ?? 'none'}`);
    }
  }

  // ── change requests: T11 ──────────────────────────────────────
  for (const { file, data: c } of crs) {
    if (c.status === 'applied' && c.blueprint_revision !== undefined && bp.revision <= c.blueprint_revision) error('T17', file, `${c.id} is applied, but the design is still at revision ${bp.revision}, where it was opened`);
    if (!sliceById.has(c.raised_by)) error('T11', file, `${c.id} raised by unknown slice ${c.raised_by}`);
    for (const x of c.affects.components ?? []) if (!comps.has(x)) error('T11', file, `${c.id} affects unknown component ${x}`);
    for (const x of c.affects.adrs ?? []) if (!adrIds.has(x)) error('T11', file, `${c.id} affects unknown ${x}`);
    for (const x of c.affects.quality_attributes ?? []) if (!qas.has(x)) error('T11', file, `${c.id} affects unknown quality attribute ${x}`);
  }

  const testDebtAbout = new Set([...debtById.values()].filter(({ entry: e }) => e.kind === 'test' && e.origin.type === 'slice').map(({ entry: e }) => e.origin.ref));

  // ── audits: T13, L02, B01, T16, W06 ─────────────────────────────────────
  for (const { file, data: s } of slices) {
    const audit = s.audit;
    if (!audit) continue;
    for (const d of audit.decisions) if (!adrIds.has(d)) error('T13', file, `${s.id} audit cites unknown ${d}`);
    for (const id of audit.debt_created) {
      const d = debtById.get(id);
      if (!d) error('T13', file, `${s.id} audit lists unknown debt ${id}`);
      else if (d.entry.origin.type !== 'slice' || d.entry.origin.ref !== s.id) error('T13', file, `${id} should have origin slice ${s.id}`);
    }
    if (WORK_TYPES.includes(s.type) && modeOf(bp, s) === 'strict') {
      const red = audit.commits.findIndex((c) => c.kind === 'red');
      const green = audit.commits.findIndex((c) => c.kind === 'green');
      if (red === -1 || green === -1 || red > green) error('L02', file, `${s.id} audit needs a red commit before a green commit`);
    }
    const gate = bp.budgets.min_mutation_score;
    if (gate !== undefined && audit.mutation_score !== null && audit.mutation_score < gate && !audit.mutation_override_reason) {
      error('M01', file, `${s.id} has a mutation score of ${audit.mutation_score}, the gate is ${gate}, and no mutation_override_reason is recorded`);
    }
    if (WORK_TYPES.includes(s.type) && audit.test_lines === 0) {
      const policy = testPolicy(bp, s);
      if (policy === 'required') error('T16', file, `${s.id} changed no test files, and the test policy for it is required`);
      else if (policy === 'optional' && !testDebtAbout.has(s.id)) warn('W06', file, `${s.id} changed no test files and no test debt is recorded for it (policy optional: it should at least be visible)`);
    }
    if (audit.production_lines > bp.budgets.max_slice_production_lines && !audit.budget_override_reason) {
      error('B01', file, `${s.id} changed ${audit.production_lines} production lines, budget is ${bp.budgets.max_slice_production_lines}, and no budget_override_reason is recorded`);
    }
  }

  // ── additions: X01 to X05 ─────────────────────────────────────
  if (model.additions) {
    const found = schemaFindings('additions', model.additions.data, model.additions.file);
    out.push(...found);
    if (!found.length) {
      const file = model.additions.file;
      const planned = model.slices.length > 0;
      const standing = new Set([...bp.capabilities.map((c) => c.id), ...bp.quality_attributes.map((q) => q.id), ...bp.constraints.map((c) => c.id), ...adrs.map((a) => a.data.id)]);
      const ids = new Set();
      for (const a of model.additions.data.additions) {
        if (ids.has(a.id)) error('X05', file, `${a.id} is duplicated`);
        ids.add(a.id);
        for (const other of a.overlaps ?? []) if (other === a.id || !model.additions.data.additions.some((x) => x.id === other)) error('X05', file, `${a.id} overlaps ${other}, which is not another addition`);
        const applied = a.decision === 'cut' && a.applied === true;
        if (a.decision === 'pending') (planned ? error : warn)('X01', file, `${a.id} is undecided: ${a.what}`);
        if (a.decision === 'cut' && !applied) (planned ? error : warn)('X04', file, `${a.id} was decided to be cut but the cut was not applied`);
        if (applied) {
          const left = (a.affects ?? []).filter((id) => standing.has(id));
          if (left.length) error('X02', file, `${a.id} is cut but ${left.join(', ')} is still in the design`);
          if (!bp.non_goals.some((g) => g.trim() === a.non_goal.trim())) error('X03', file, `${a.id} is cut but its non-goal "${a.non_goal}" is not among the non-goals`);
        } else {
          for (const id of a.affects ?? []) if (!standing.has(id)) error('X05', file, `${a.id} points at ${id}, which does not exist`);
        }
      }
    }
  }

  // ── execution state: L03, L04 ─────────────────────────────────
  const inProgress = slices.filter(({ data: s }) => s.status === 'in_progress');
  if (inProgress.length > 1) error('L04', inProgress[1].file, `only one slice may be in progress, found ${inProgress.map((s) => s.data.id).join(', ')}`);
  if (inProgress.length >= 1) {
    const s = inProgress[0].data;
    if (!active) error('L03', '.sddpp/active.json', `${s.id} is in progress but active.json is missing, so the test lock cannot work`);
    else if (active.data.slice !== s.id || active.data.phase !== s.phase) error('L03', active.file, `active.json says ${active.data.slice}/${active.data.phase}, slice file says ${s.id}/${s.phase}`);
  } else if (active && active.data.slice !== null) {
    error('L03', active.file, `active.json points at ${active.data.slice} but no slice is in progress`);
  }

  return out;
}
