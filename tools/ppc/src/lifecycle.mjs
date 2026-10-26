import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Document, parseDocument } from 'yaml';
import { loadProject } from './load.mjs';
import { validateModel } from './validate.mjs';
import { checkGit, dirtyPaths, measure } from './gitcheck.mjs';
import { generate, writeGenerated } from './generate.mjs';
import { runMutation, sliceProductionFiles } from './mutation.mjs';
import { testPolicy } from './policy.mjs';

/** A refused transition. The message says why; nothing was changed. */
export class LifecycleError extends Error {}
const fail = (message) => {
  throw new LifecycleError(message);
};

const WORK_TYPES = ['skeleton', 'feature', 'fix'];
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
const ACTIVE = '.sddpp/active.json';

/** Work slices start in red; a refactor is all refactor; a spike keeps the tests editable. */
export const initialPhase = (type) => (type === 'refactor' ? 'refactor' : 'red');

// ── transactions: every transition changes .sddpp/ or nothing at all ──────────────
function listFiles(dir, base = dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? listFiles(join(dir, e.name), base) : [join(dir, e.name)]));
}
function snapshot(root) {
  return new Map(listFiles(join(root, '.sddpp')).map((f) => [f, readFileSync(f)]));
}
function restore(root, snap) {
  for (const f of listFiles(join(root, '.sddpp'))) if (!snap.has(f)) rmSync(f);
  for (const [f, content] of snap) {
    mkdirSync(dirname(f), { recursive: true });
    writeFileSync(f, content);
  }
}
function transact(root, work) {
  const snap = snapshot(root);
  try {
    return work();
  } catch (error) {
    restore(root, snap);
    throw error;
  }
}

// ── helpers ───────────────────────────────────────────────────────────────────────
const describe = (findings) => findings.map((f) => `  ${f.rule} ${f.file}: ${f.message}`).join('\n');

function loadValid(root) {
  const model = loadProject(root);
  const errors = validateModel(model).filter((f) => f.severity === 'error');
  if (errors.length) fail(`the project is invalid, fix it first:\n${describe(errors)}`);
  return model;
}

/** Edit one slice's frontmatter in place, keeping the body and the other fields as they were. */
function editFrontmatter(root, file, mutate) {
  const abs = join(root, file);
  const match = FRONTMATTER.exec(readFileSync(abs, 'utf8'));
  const doc = parseDocument(match[1]);
  mutate(doc);
  // lineWidth 0 stops long values from being re-wrapped; no padding keeps `[a, b]` as the author wrote it.
  writeFileSync(abs, `---\n${doc.toString({ lineWidth: 0, flowCollectionPadding: false }).trimEnd()}\n---\n${match[2]}`);
}

function writeActive(root, slice, phase) {
  mkdirSync(join(root, '.sddpp'), { recursive: true });
  writeFileSync(join(root, ACTIVE), `${JSON.stringify({ slice, phase })}\n`);
}

/** Regenerate the derived views and make sure the project is still valid. */
function refreshViews(root) {
  const model = loadValid(root);
  writeGenerated(root, generate(model));
}

function inProgress(model) {
  const open = model.slices.filter((s) => s.data.status === 'in_progress');
  if (open.length === 0) fail('no slice is in progress; start one with `ppc start <slice>`');
  return open[0];
}

function requireCommitted(root) {
  let dirty;
  try {
    dirty = dirtyPaths(root);
  } catch {
    fail('this directory is not inside a git repository');
  }
  if (dirty.length) fail(`there are uncommitted changes outside .sddpp/ and .architect/; commit them first:\n  ${dirty.slice(0, 8).join('\n  ')}`);
}

// ── transitions ───────────────────────────────────────────────────────────────────
export function start(root, id) {
  return transact(root, () => {
    const model = loadValid(root);
    const entry = model.slices.find((s) => s.data.id === id) ?? fail(`unknown slice ${id}`);
    const s = entry.data;
    if (s.status !== 'ready') fail(`${id} is ${s.status}; only a ready slice (approved by a human) can start`);
    const busy = model.slices.find((x) => x.data.status === 'in_progress');
    if (busy) fail(`${busy.data.id} is already in progress; finish it first (one slice at a time)`);
    const unfinished = (s.depends_on ?? []).filter((d) => model.slices.find((x) => x.data.id === d)?.data.status !== 'done');
    if (unfinished.length) fail(`${id} depends on unfinished ${unfinished.join(', ')}`);

    const phase = initialPhase(s.type);
    editFrontmatter(root, entry.file, (doc) => {
      doc.set('status', 'in_progress');
      doc.set('phase', phase);
    });
    writeActive(root, id, phase);
    refreshViews(root);
    return { slice: id, phase };
  });
}

/** A human approves a planned slice to start. The only way a slice becomes ready. */
export function approveSlice(root, id, by) {
  return transact(root, () => {
    if (!by || !by.trim()) fail('--by <name> is required: a human approves a slice to start');
    const model = loadValid(root);
    const entry = model.slices.find((s) => s.data.id === id) ?? fail(`unknown slice ${id}`);
    if (entry.data.status !== 'planned') fail(`${id} is ${entry.data.status}; only a planned slice can be approved`);
    editFrontmatter(root, entry.file, (doc) => {
      doc.set('status', 'ready');
      doc.set('approved_by', by.trim());
    });
    refreshViews(root);
    return { slice: id, status: 'ready' };
  });
}

/** Edit one entry of a component's debt register in place, keeping the file's formatting. */
function editDebtEntry(root, register, id, change) {
  const abs = join(root, register.file);
  const doc = parseDocument(readFileSync(abs, 'utf8'));
  change(doc.get('entries').items.find((i) => i.get('id') === id));
  // Debt registers are written with `{ a: b }`; keep that spacing so untouched entries are not rewritten.
  writeFileSync(abs, doc.toString({ lineWidth: 0 }));
}

/**
 * HUMAN ONLY: decide on an addition the design contains and the person did not ask for: keep it, or cut it.
 * `acceptRecommended` decides every pending addition the way it was recommended and leaves the ones recommended
 * as "decide" to the person. Cutting only records the decision; carrying it out in the design is a separate step.
 */
export function decideAddition(root, id, { decision, by, reason, acceptRecommended } = {}) {
  if (!by || !by.trim()) fail('--by <name> is required: a person decides what stays in the design');
  const file = '.architect/additions.yaml';
  const abs = join(root, file);
  if (!existsSync(abs)) fail('there is no .architect/additions.yaml');
  const original = readFileSync(abs, 'utf8');
  const doc = parseDocument(original);
  const items = doc.get('additions')?.items ?? [];
  const decided = {};
  const left = [];

  const apply = (item, outcome, why) => {
    item.set('decision', outcome);
    item.set('decided_by', by.trim());
    if (outcome === 'keep') item.set('reason', why);
    if (outcome === 'cut' && !item.get('non_goal')) item.set('non_goal', String(item.get('what')).trim());
  };

  if (acceptRecommended) {
    for (const item of items.filter((i) => i.get('decision') === 'pending')) {
      const action = item.getIn(['recommendation', 'action']);
      if (action === 'cut' || action === 'keep') {
        apply(item, action, item.getIn(['recommendation', 'reason']));
        decided[item.get('id')] = action;
      } else left.push(item.get('id'));
    }
  } else {
    if (!['keep', 'cut'].includes(decision)) fail('the decision must be keep or cut');
    const item = items.find((i) => i.get('id') === id) ?? fail(`unknown addition ${id}`);
    if (item.get('decision') !== 'pending') fail(`${id} is already decided (${item.get('decision')})`);
    if (decision === 'keep' && (!reason || reason.trim().length < 5)) fail('keeping an addition needs a --reason of at least 5 characters: why it stays');
    apply(item, decision, reason?.trim());
  }

  writeFileSync(abs, doc.toString({ lineWidth: 0 }));
  const problems = validateModel(loadProject(root)).filter((f) => f.file === file && ['SCHEMA', 'PARSE'].includes(f.rule));
  if (problems.length) {
    writeFileSync(abs, original);
    fail(`the decision would leave additions.yaml invalid:\n${describe(problems)}`);
  }
  return acceptRecommended ? { decided, left_to_the_person: left } : { addition: id, decision };
}

/**
 * HUMAN ONLY: decide on a debt entry the AI proposed. Default: it becomes open (a real debt to pay);
 * `accept` records that it will be lived with, and why; `drop` discards it.
 */
export function approveDebt(root, id, { by, accept, drop } = {}) {
  return transact(root, () => {
    if (!by || !by.trim()) fail('--by <name> is required: a human decides on technical debt');
    if (accept !== undefined && drop) fail('use --accept <reason> or --drop, not both');
    if (accept !== undefined && accept.trim().length < 10) fail('--accept needs a reason of at least 10 characters');
    const model = loadValid(root);
    const register = model.debt.find((d) => d.data.entries.some((e) => e.id === id)) ?? fail(`unknown debt ${id}`);
    const entry = register.data.entries.find((e) => e.id === id);
    if (entry.status !== 'proposed') fail(`${id} is ${entry.status}; only a proposed entry can be decided`);
    const status = accept !== undefined ? 'accepted' : drop ? 'dropped' : 'open';

    editDebtEntry(root, register, id, (item) => {
      item.set('status', status);
      item.set('approved_by', by.trim());
      if (status === 'accepted') item.set('accepted_reason', accept.trim());
    });
    refreshViews(root);
    return { debt: id, status };
  });
}

export function approveRed(root, by) {
  return transact(root, () => {
    if (!by || !by.trim()) fail('--by <name> is required: a human approves the RED tests');
    const entry = inProgress(loadValid(root));
    const s = entry.data;
    if (!WORK_TYPES.includes(s.type)) fail(`${s.id} is a ${s.type} slice: it has no RED phase to approve`);
    if (s.phase !== 'red') fail(`${s.id} is in the ${s.phase} phase, not red`);
    requireCommitted(root);

    editFrontmatter(root, entry.file, (doc) => {
      doc.set('red_approved_by', by.trim());
      doc.set('phase', 'green');
    });
    writeActive(root, s.id, 'green');
    refreshViews(root);
    return { slice: s.id, phase: 'green' };
  });
}

export function toRefactor(root) {
  return transact(root, () => {
    const entry = inProgress(loadValid(root));
    const s = entry.data;
    if (s.phase !== 'green') fail(`${s.id} is in the ${s.phase} phase, not green`);
    requireCommitted(root);
    editFrontmatter(root, entry.file, (doc) => doc.set('phase', 'refactor'));
    writeActive(root, s.id, 'refactor');
    refreshViews(root);
    return { slice: s.id, phase: 'refactor' };
  });
}

/**
 * Under an optional test policy a slice may close without tests, but not silently: a debt entry of kind
 * `test` is proposed in the register of the slice's first component, for a person to decide. Returns its id.
 */
function proposeTestDebt(root, model, slice, today) {
  const component = slice.components[0];
  const register = model.debt.find((d) => d.data.component === component) ?? fail(`${component} has no debt register`);
  const code = model.blueprint.data.components.find((c) => c.id === component).code;
  const last = Math.max(0, ...register.data.entries.map((e) => Number(e.id.split('-')[2])));
  const id = `DEBT-${code}-${String(last + 1).padStart(3, '0')}`;
  const abs = join(root, register.file);
  const text = readFileSync(abs, 'utf8');
  const fields = {
    id,
    title: `${slice.id} closed without tests`,
    description: `${slice.id} "${slice.title}" changed no test files, so nothing checks its behavior automatically and a later change can break it unnoticed.`,
    kind: 'test',
    origin: { type: 'slice', ref: slice.id },
    created: today,
    proposed_by: 'ai',
    cost_of_delay: { level: 'medium', rationale: 'Grows with every later slice that touches the same behavior.' },
    trigger: `Before a later slice changes the behavior of ${slice.id}.`,
    status: 'proposed',
  };
  // Follow the register's own style: some are written with `{ a: b }` maps.
  const flow = /^\s+origin: \{/m.test(text);
  const rendered = new Document([fields]);
  if (flow) for (const key of ['origin', 'cost_of_delay']) rendered.getIn([0, key], true).flow = true;
  // `entries` is the last key, so the new entry is appended as text: nothing already written is reformatted.
  const afterEntries = text.slice(text.indexOf('\nentries:') + 1);
  if (register.data.entries.length && !/\n[A-Za-z]/.test(afterEntries)) {
    const block = rendered.toString({ lineWidth: 0 }).trimEnd().split('\n').map((line) => `  ${line}`).join('\n');
    writeFileSync(abs, `${text.trimEnd()}\n${block}\n`);
  } else {
    const doc = parseDocument(text);
    doc.get('entries').add(doc.createNode(fields));
    writeFileSync(abs, doc.toString({ lineWidth: 0 }));
  }
  return id;
}

/**
 * Close a slice. The sizes are measured from git here, never taken from the caller, and the result
 * is validated and checked against git before it is kept: if it would be wrong, nothing changes.
 * When the blueprint sets a mutation gate, the score is measured here too (`mutationRunner` replaces
 * Stryker in tests).
 */
export function finish(root, id, input, { mutationRunner, now = new Date() } = {}) {
  return transact(root, () => {
    const model = loadValid(root);
    const entry = model.slices.find((s) => s.data.id === id) ?? fail(`unknown slice ${id}`);
    const s = entry.data;
    if (s.status !== 'in_progress') fail(`${id} is ${s.status}, not in_progress`);
    if (WORK_TYPES.includes(s.type) && s.phase === 'red') fail(`${id} is still in the red phase: its red tests were not approved`);
    requireCommitted(root);
    for (const field of ['diff_lines', 'production_lines', 'test_lines']) {
      if (field in (input ?? {})) fail(`${field} is computed from git; remove it from the audit input`);
    }

    if ('mutation_score' in (input ?? {})) fail('mutation_score is computed by ppc from the mutation tool; remove it from the audit input');

    let production_lines = 0;
    let test_lines = 0;
    if (s.type === 'spike') {
      if (typeof input?.outcome !== 'string') fail('a spike needs "outcome": what it learned');
      editFrontmatter(root, entry.file, (doc) => {
        doc.set('status', 'done');
        doc.delete('phase');
        doc.set('outcome', input.outcome);
      });
    } else {
      if (!Array.isArray(input?.commits) || input.commits.length === 0) fail('the audit needs "commits": [{ "sha": "...", "kind": "red|green|refactor|structural|docs" }]');
      for (const c of input.commits) {
        const m = measure(root, String(c.sha));
        if (!m) fail(`commit ${c.sha} was not found in git history`);
        production_lines += m.production_lines;
        test_lines += m.test_lines;
      }
      const policy = testPolicy(model.blueprint.data, s);
      const withoutTests = WORK_TYPES.includes(s.type) && test_lines === 0;
      if (withoutTests && policy === 'required') {
        fail(`the test policy for ${id} is required, but its commits changed no test files. Add tests, or a person changes the policy (test_policy) for this slice.`);
      }
      let mutation_score = null;
      const gate = model.blueprint.data.budgets.min_mutation_score;
      if (gate !== undefined && WORK_TYPES.includes(s.type)) {
        const result = runMutation(root, sliceProductionFiles(root, input.commits), mutationRunner);
        mutation_score = result.score;
        if (mutation_score !== null && mutation_score < gate && !input.mutation_override_reason) {
          const shown = result.survivors.slice(0, 10).map((m) => `  ${m.file}:${m.line} ${m.mutator} -> ${String(m.replacement).slice(0, 50)}`);
          const more = result.survivors.length > shown.length ? [`  ... and ${result.survivors.length - shown.length} more`] : [];
          fail(`mutation score ${mutation_score} is below the gate ${gate}. Mutants the tests did not detect:\n${[...shown, ...more].join('\n')}\nThe tests must detect them (a human decides whether to reopen the tests) or a human records mutation_override_reason.`);
        }
      }
      const debt_created = [...(input.debt_created ?? [])];
      if (withoutTests && policy === 'optional') debt_created.push(proposeTestDebt(root, model, s, now.toISOString().slice(0, 10)));
      const audit = {
        commits: input.commits,
        production_lines,
        test_lines,
        tests_added: input.tests_added,
        mutation_score,
        decisions: input.decisions ?? [],
        debt_created,
        deviations: input.deviations ?? [],
        ...(input.budget_override_reason ? { budget_override_reason: input.budget_override_reason } : {}),
        ...(input.mutation_override_reason ? { mutation_override_reason: input.mutation_override_reason } : {}),
      };
      editFrontmatter(root, entry.file, (doc) => {
        doc.set('status', 'done');
        doc.delete('phase');
        doc.set('audit', audit);
      });
    }
    if (s.type === 'refactor') {
      // The slice is done, so the debt it was scheduled to pay is paid (rule L05 forbids saying so earlier).
      for (const id of s.pays ?? []) {
        const register = model.debt.find((d) => d.data.entries.some((e) => e.id === id));
        const entry = register?.data.entries.find((e) => e.id === id);
        if (entry?.status === 'scheduled' && entry.paid_by === s.id) editDebtEntry(root, register, id, (item) => item.set('status', 'paid'));
      }
    }
    writeActive(root, null, null);
    refreshViews(root);

    const problems = checkGit(loadProject(root), root, { tips: new Map([[id, 'HEAD']]) });
    if (problems.length) fail(`the audit does not match git history:\n${describe(problems)}`);
    return { slice: id, production_lines, test_lines };
  });
}

/**
 * Mutation-test on demand, without changing the project: either the given files, or the production
 * files of a finished slice (taken from its audit commits).
 */
export function mutate(root, { files, slice } = {}, mutationRunner) {
  if (files && slice) fail('give --files or --slice, not both');
  if (!files && !slice) fail('say what to mutate: --files <a,b> or --slice <id>');
  let targets = files;
  if (slice) {
    const entry = loadProject(root).slices.find((s) => s.data.id === slice) ?? fail(`unknown slice ${slice}`);
    if (!entry.data.audit) fail(`${slice} has no audit yet, so its files are not known; pass --files`);
    targets = sliceProductionFiles(root, entry.data.audit.commits);
  }
  return runMutation(root, targets, mutationRunner);
}

export function status(root) {
  const model = loadProject(root);
  const open = model.slices.find((s) => s.data.status === 'in_progress');
  if (!open) {
    const ready = model.slices.filter((s) => s.data.status === 'ready').map((s) => s.data.id);
    return { text: `no slice is in progress${ready.length ? `; ready to start: ${ready.join(', ')}` : ''}` };
  }
  return { text: `${open.data.id} "${open.data.title}" is in progress, phase ${open.data.phase}` };
}
