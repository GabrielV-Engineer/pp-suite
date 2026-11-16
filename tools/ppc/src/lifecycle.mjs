import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Document, parseDocument, stringify } from 'yaml';
import { loadProject } from './load.mjs';
import { validateModel, designFindings } from './validate.mjs';
import { checkGit, dirtyPaths, measure } from './gitcheck.mjs';
import { runMutation, sliceProductionFiles } from './mutation.mjs';
import { modeOf, testPolicy, PAYERS, payProblem, testsOpen } from './policy.mjs';
import { generatedGlobs } from './testpaths.mjs';
import { overlapGroup, triage } from './additions.mjs';
import { nextSteps } from './next.mjs';
import { gitSubjects } from './session.mjs';

// The slices that pay debt: a refactor slice changes structure, a fix slice behavior (often through a change request).
export { PAYERS } from './policy.mjs';

/** A refused transition. The message says why; nothing was changed. */
export class LifecycleError extends Error {}
const fail = (message) => {
  throw new LifecycleError(message);
};

const WORK_TYPES = ['skeleton', 'feature', 'fix'];
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
const ACTIVE = '.sddpp/active.json';

/**
 * Strict work slices start in red; light ones build tests and code together; a refactor is all refactor;
 * a spike keeps the tests editable.
 */
export const initialPhase = (type, mode = 'strict') => (type === 'refactor' ? 'refactor' : mode === 'light' && WORK_TYPES.includes(type) ? 'build' : 'red');

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
export function transact(root, work) {
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

export function loadValid(root, { allow = () => false } = {}) {
  const model = loadProject(root);
  const errors = validateModel(model).filter((f) => f.severity === 'error' && !allow(f));
  if (errors.length) fail(`the project is invalid, fix it first:\n${describe(errors)}`);
  return model;
}

/** Edit one slice's frontmatter in place, keeping the body and the other fields as they were. */
export function editFrontmatter(root, file, mutate) {
  const abs = join(root, file);
  const match = FRONTMATTER.exec(readFileSync(abs, 'utf8'));
  const doc = parseDocument(match[1]);
  mutate(doc);
  // lineWidth 0 stops long values from being re-wrapped; no padding keeps `[a, b]` as the author wrote it.
  writeFileSync(abs, `---\n${doc.toString({ lineWidth: 0, flowCollectionPadding: false }).trimEnd()}\n---\n${match[2]}`);
}

function writeActive(root, slice, phase, extra = {}) {
  mkdirSync(join(root, '.sddpp'), { recursive: true });
  writeFileSync(join(root, ACTIVE), `${JSON.stringify({ slice, phase, ...extra })}\n`);
}

/** After a transition the project must still be valid; if it is not, the caller's transaction rolls back. */
export function ensureValid(root) {
  loadValid(root);
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

    const mode = modeOf(model.blueprint.data, s);
    const phase = initialPhase(s.type, mode);
    editFrontmatter(root, entry.file, (doc) => {
      doc.set('status', 'in_progress');
      doc.set('phase', phase);
      // Record the cycle that was applied, so a later change of the project default cannot rewrite this slice's history.
      if (WORK_TYPES.includes(s.type)) doc.set('mode', mode);
    });
    writeActive(root, id, phase, phase === 'refactor' && testsOpen(model, s) ? { tests_open: true } : {});
    ensureValid(root);
    return { slice: id, phase };
  });
}

/**
 * Undo a start: a slice in progress with no commits of its own goes back to ready (found in the first real project, F-D13: a slice
 * started as the wrong type could only be undone with git in a terminal). Once it has commits, it is finished or changed instead.
 */
export function stop(root, id) {
  return transact(root, () => {
    const model = loadValid(root);
    const entry = model.slices.find((s) => s.data.id === id) ?? fail(`unknown slice ${id}`);
    if (entry.data.status !== 'in_progress') fail(`${id} is ${entry.data.status}, not in progress; there is nothing to stop`);
    const own = gitSubjects(root).filter((subject) => new RegExp(`^\\w+\\(${id}\\)`).test(subject) && !/^(docs|chore)\(/.test(subject));
    if (own.length) fail(`${id} already has commits (${own.slice(0, 3).join('; ')}); finish it, or change it with a change request, instead of stopping it`);
    editFrontmatter(root, entry.file, (doc) => {
      doc.set('status', 'ready');
      doc.delete('phase');
      doc.delete('mode');
    });
    writeActive(root, null, null);
    ensureValid(root);
    return { slice: id, status: 'ready' };
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
    ensureValid(root);
    return { slice: id, status: 'ready' };
  });
}

/**
 * Set fields of one entry of the debt register, changing only that entry's lines. Re-serializing the file would
 * restyle everything else in it (`[a]` becomes `[ a ]`), so the lines are edited as text: an existing field is
 * replaced where it stands, a new one is added at the end of the entry.
 */
function setDebtFields(root, register, id, fields) {
  const abs = join(root, register.file);
  const lines = readFileSync(abs, 'utf8').split('\n');
  const start = lines.findIndex((l) => new RegExp(`^\\s*- id:\\s*${id}\\s*$`).test(l));
  if (start === -1) fail(`${id} could not be located in ${register.file} to edit it`);
  const indent = /^(\s*)-/.exec(lines[start])[1];
  const pad = `${indent}  `;
  let end = start + 1;
  while (end < lines.length && !new RegExp(`^${indent}- `).test(lines[end]) && (lines[end].trim() === '' || lines[end].startsWith(pad))) end++;
  while (end > start + 1 && lines[end - 1].trim() === '') end--;
  for (const [key, value] of Object.entries(fields)) {
    const at = lines.slice(start, end).findIndex((l) => l.startsWith(`${pad}${key}:`));
    if (value === undefined) {
      // undefined removes the field (one line: the register keeps scalar fields on one line)
      if (at !== -1) {
        lines.splice(start + at, 1);
        end--;
      }
      continue;
    }
    const text = `${pad}${key}: ${stringify(value).trim()}`;
    if (at === -1) {
      lines.splice(end, 0, text);
      end++;
    } else lines[start + at] = text;
  }
  writeFileSync(abs, lines.join('\n'));
}

/**
 * HUMAN ONLY: decide on additions the design contains and the person did not ask for: keep them, or cut them.
 * `id` is one id or a list; the list is decided the same way. Additions that overlap cannot be decided one at a time
 * without a contradiction in between, so deciding one of a group of undecided overlapping additions is refused unless
 * all of them are named (or `alone` says it is on purpose). `acceptRecommended` decides every pending group whose
 * members were all recommended the same way (cut or keep) and leaves the rest to the person.
 * Cutting only records the decision; carrying it out in the design is a separate step.
 */
export function decideAddition(root, id, { decision, by, reason, acceptRecommended, alone, cut, keep } = {}) {
  if (!by || !by.trim()) fail('--by <name> is required (or set git config user.name): a person decides what stays in the design');
  if ((cut?.length || keep?.length) && !acceptRecommended) fail('--but-cut and --but-keep go with --accept-recommended; to decide only some additions, name them: ppc decide-addition <ADD-ID>... (--keep --reason <why> | --cut)');
  const file = '.architect/additions.yaml';
  const abs = join(root, file);
  if (!existsSync(abs)) fail('there is no .architect/additions.yaml');
  const original = readFileSync(abs, 'utf8');
  const doc = parseDocument(original);
  const items = doc.get('additions')?.items ?? [];
  const byId = new Map(items.map((i) => [i.get('id'), i]));
  const plain = items.map((i) => i.toJSON());
  const pending = (i) => i.get('decision') === 'pending';
  const decided = {};

  const apply = (item, outcome, why) => {
    item.set('decision', outcome);
    item.set('decided_by', by.trim());
    if (outcome === 'keep') item.set('reason', why);
    if (outcome === 'cut' && !item.get('non_goal')) item.set('non_goal', String(item.get('what')).trim());
  };
  const overlapping = (start) => overlapGroup(plain, start);

  let result;
  if (acceptRecommended) {
    // what the person named is decided first, and wins over the recommendation
    const named = [[cut ?? [], 'cut'], [keep ?? [], 'keep']];
    for (const [ids] of named) {
      for (const one of ids) {
        const item = byId.get(one) ?? fail(`unknown addition ${one}`);
        if (!pending(item)) fail(`${one} is already decided (${item.get('decision')})`);
      }
    }
    const both = (cut ?? []).filter((one) => (keep ?? []).includes(one));
    if (both.length) fail(`${both.join(', ')} is named both to cut and to keep`);
    if ((keep ?? []).length && (!reason || reason.trim().length < 5)) fail('keeping an addition needs a --reason of at least 5 characters: why it stays');
    // an overlapping group is decided in one command, so no half-decided state exists; a deliberate split is allowed
    const every = [...(cut ?? []), ...(keep ?? [])];
    for (const one of every) {
      const missing = overlapping(one).filter((g) => !every.includes(g));
      if (missing.length) fail(`${one} overlaps ${missing.join(', ')}, which you did not name. Name every member of an overlapping group in the same command, under --but-cut or --but-keep (they may differ: a split is a decision), so nothing is left half decided`);
    }
    for (const [ids, outcome] of named) {
      for (const one of ids) {
        apply(byId.get(one), outcome, reason?.trim());
        decided[one] = outcome;
      }
    }
    const { settled, needsPerson } = triage(items.map((i) => i.toJSON()));
    for (const { ids, action } of settled) {
      for (const g of ids) {
        apply(byId.get(g), action, byId.get(g).getIn(['recommendation', 'reason']));
        decided[g] = action;
      }
    }
    result = { decided, left_to_the_person: needsPerson.flatMap((group) => group.ids) };
  } else {
    if (!['keep', 'cut'].includes(decision)) fail('the decision must be keep or cut');
    const ids = Array.isArray(id) ? id : [id];
    for (const one of ids) {
      const item = byId.get(one) ?? fail(`unknown addition ${one}`);
      if (!pending(item)) fail(`${one} is already decided (${item.get('decision')})`);
    }
    if (!alone) {
      const missing = [...new Set(ids.flatMap(overlapping))].filter((g) => !ids.includes(g));
      if (missing.length) fail(`${ids.join(', ')} overlap${ids.length === 1 ? 's' : ''} ${missing.join(', ')}, which is undecided, so they cannot be decided one at a time without a contradiction in between. Decide them together: ppc decide-addition ${[...ids, ...missing].join(' ')} --${decision ?? 'cut'} ..., or pass --alone to decide only ${ids.join(', ')} on purpose`);
    }
    if (decision === 'keep' && (!reason || reason.trim().length < 5)) fail('keeping an addition needs a --reason of at least 5 characters: why it stays');
    for (const one of ids) apply(byId.get(one), decision, reason?.trim());
    result = Array.isArray(id) ? { additions: ids, decision } : { addition: id, decision };
  }

  writeFileSync(abs, doc.toString({ lineWidth: 0 }));
  const problems = validateModel(loadProject(root)).filter((f) => f.file === file && ['SCHEMA', 'PARSE'].includes(f.rule));
  if (problems.length) {
    writeFileSync(abs, original);
    fail(`the decision would leave additions.yaml invalid:\n${describe(problems)}`);
  }
  return result;
}

/**
 * HUMAN ONLY: say that the person read what changed in the design since the slices were planned. A change request raises the design
 * revision; nothing may update `blueprint_revision` of a slice but the reader saying they read it. `ids` names slices, `all` takes
 * every unfinished slice that is behind. Changes that field and nothing else.
 */
export function reread(root, { ids = [], all = false } = {}) {
  return transact(root, () => {
    const model = loadValid(root);
    const revision = model.blueprint.data.revision;
    const behind = model.slices.filter((s) => !['done', 'dropped'].includes(s.data.status) && s.data.blueprint_revision < revision);
    let chosen;
    if (all) {
      chosen = behind;
      if (!chosen.length) fail(`nothing to read: no unfinished slice is behind the design (revision ${revision})`);
    } else {
      if (!ids.length) fail(behind.length ? `say which: ${behind.map((s) => s.data.id).join(', ')}, or --all` : 'say which slices, or --all; none is behind the design right now');
      chosen = ids.map((id) => {
        const entry = model.slices.find((s) => s.data.id === id) ?? fail(`unknown slice ${id}`);
        if (['done', 'dropped'].includes(entry.data.status)) fail(`${id} is ${entry.data.status}: there is nothing left to plan against the design`);
        if (entry.data.blueprint_revision >= revision) fail(`${id} is already at the current revision (${revision})`);
        return entry;
      });
    }
    for (const entry of chosen) editFrontmatter(root, entry.file, (doc) => doc.set('blueprint_revision', revision));
    ensureValid(root);
    return { revision, reread: chosen.map((s) => s.data.id) };
  });
}

/**
 * The short form of the approvals: `ppc approve [id]`. A slice id approves that slice to start (or its red tests, when it is in
 * progress in the red phase); a debt id decides the debt; with no id it takes the one decision `ppc next` is asking for, and
 * refuses to guess when there are several. A change request is decided with `ppc decide-change`, which needs accept or reject.
 */
export function approve(root, id, { by, accept, drop, reason, payIn } = {}) {
  if (!by || !by.trim()) fail('no name to record: set one with `git config user.name "<your name>"` or pass --by <name>');
  if (!id?.startsWith('DEBT-') && payIn !== undefined) fail('--pay-in applies to a debt entry: `ppc approve DEBT-… --pay-in SL-…`');
  // Options that mean something only for a debt entry are not ignored elsewhere: ignoring them would approve what the person meant to drop.
  if (!id?.startsWith('DEBT-') && (accept !== undefined || drop || reason !== undefined)) fail('--accept, --drop and --reason apply to a debt entry: name it with `ppc approve DEBT-… --drop`');
  if (id) {
    if (id.startsWith('SL-')) {
      const entry = loadValid(root).slices.find((s) => s.data.id === id);
      return entry?.data.status === 'in_progress' && entry.data.phase === 'red' ? approveRed(root, by) : approveSlice(root, id, by);
    }
    if (id.startsWith('DEBT-')) return approveDebt(root, id, { by, accept, drop, reason, payIn });
    if (id.startsWith('SCR-')) return approveScreen(root, id, by);
    if (id.startsWith('CR-')) fail(`${id} is a change request: decide it with \`ppc decide-change ${id} --accept\` or \`--reject --reason <why>\``);
    fail(`${id} is not something to approve here: a slice (SL-…), a debt entry (DEBT-…) or a screen (SCR-…)`);
  }
  const model = loadValid(root);
  const next = nextSteps(model, gitSubjects(root), []);
  // a slice whose red tests wait for a person comes first: it is the work in progress
  const red = next.actions.find((a) => a.decision?.type === 'red');
  if (red) return approveRed(root, by);
  const byId = new Map(model.slices.map((s) => [s.data.id, s.data]));
  const approvable = model.slices.map((s) => s.data).filter((s) => s.status === 'planned' && (s.depends_on ?? []).every((d) => byId.get(d)?.status === 'done'));
  if (approvable.length > 1) fail(`which one? ${approvable.map((s) => s.id).join(', ')}: name it with \`ppc approve <id>\``);
  if (!approvable.length) {
    const waiting = next.waiting.filter((a) => a.decision).map((a) => a.decision.id ?? a.decision.type);
    fail(`nothing is waiting for an approval right now${waiting.length ? `, except: ${waiting.join(', ')}; name one with \`ppc approve <id>\`` : ''}`);
  }
  return approveSlice(root, approvable[0].id, by);
}


/**
 * HUMAN ONLY: approve a screen's mockup (`.architect/ui.md`): record who approved it and the hash of the mockup, and of its image
 * when there is one, so a later change makes the approval stale (U05). The approved mockup is what the slices build to.
 */
export function approveScreen(root, id, by) {
  // A design decision, made before slices are planned as often as after: judged on the design's own rules (T06, "a capability
  // has no slice", fires on every project that has not planned yet).
  const designErrors = (model) => designFindings(validateModel(model)).filter((f) => f.severity === 'error');
  const model = loadProject(root);
  const invalid = designErrors(model);
  if (invalid.length) fail(`the design is invalid, fix it first:\n${describe(invalid)}`);
  const ui = model.ui ?? fail('there is no .architect/ui.md: run /pp-design ui first');
  const index = ui.data.screens.findIndex((s) => s.id === id);
  if (index === -1) fail(`unknown screen ${id} (screens: ${ui.data.screens.map((s) => s.id).join(', ')})`);
  const s = ui.data.screens[index];
  const mockup = model.uiFiles[s.mockup] ?? fail(`${id}: its mockup ${s.mockup} does not exist`);
  const image = s.image ? (model.uiFiles[s.image] ?? fail(`${id}: its image ${s.image} does not exist`)) : undefined;
  if (s.approved_by && s.mockup_sha256 === mockup && (!image || s.image_sha256 === image)) fail(`${id} is already approved by ${s.approved_by}, as it is now`);
  const abs = join(root, ui.file);
  const before = readFileSync(abs, 'utf8');
  editFrontmatter(root, ui.file, (doc) => {
    const node = doc.getIn(['screens', index]);
    node.set('approved_by', by.trim());
    node.set('mockup_sha256', mockup);
    if (image) node.set('image_sha256', image);
    else node.delete('image_sha256');
  });
  const after = designErrors(loadProject(root));
  if (after.length) {
    writeFileSync(abs, before);
    fail(`the approval would leave the design invalid:\n${describe(after)}`);
  }
  return { screen: id, approved_by: by.trim() };
}

/**
 * HUMAN ONLY: decide on a debt entry the AI proposed. Default: it becomes open (a real debt to pay);
 * `accept` records that it will be lived with, and why; `drop` discards it, optionally with the `reason`.
 */
export function approveDebt(root, id, { by, accept, drop, reason, payIn } = {}) {
  return transact(root, () => {
    if (payIn !== undefined && (accept !== undefined || drop)) fail('--pay-in keeps the debt to pay; it does not go with --accept or --drop');
    if (!by || !by.trim()) fail('--by <name> is required: a human decides on technical debt');
    if (accept !== undefined && drop) fail('use --accept <reason> or --drop, not both');
    if (accept !== undefined && accept.trim().length < 10) fail('--accept needs a reason of at least 10 characters');
    if (reason !== undefined && !drop) fail('--reason goes with --drop (to accept, the reason is the value of --accept)');
    if (reason !== undefined && reason.trim().length < 10) fail('--reason needs at least 10 characters');
    const model = loadValid(root);
    const register = model.debt.find((d) => d.data.entries.some((e) => e.id === id)) ?? fail(`unknown debt ${id}`);
    const entry = register.data.entries.find((e) => e.id === id);
    // An open entry can still be accepted or dropped (found in the first real project, F-D9: an entry a later decision covered
    // stayed open, because only a proposed one could be decided). Anything further along is decided already.
    if (entry.status === 'open' && accept === undefined && !drop) {
      if (payIn !== undefined) return { ...scheduleDebt(root, id, payIn), approved: false };
      fail(`${id} is already open; to change that: --accept "<why>", --drop --reason "<why>", or ppc schedule-debt ${id} --slice <slice>`);
    }
    if (!['proposed', 'open'].includes(entry.status)) fail(`${id} is ${entry.status}; only a proposed or open entry can be decided`);
    const status = accept !== undefined ? 'accepted' : drop ? 'dropped' : 'open';

    setDebtFields(root, register, id, { status, approved_by: by.trim(), ...(status === 'accepted' ? { accepted_reason: accept.trim() } : {}), ...(status === 'dropped' && reason !== undefined ? { dropped_reason: reason.trim() } : {}) });
    ensureValid(root);
    // Approved into the slice that pays it, in the same step: if that slice cannot pay it, the entry stays as it was.
    if (payIn !== undefined) return { ...scheduleDebt(root, id, payIn), approved: true };
    return { debt: id, status };
  });
}

/**
 * Assign an open debt (one a person approved) to the slice that pays it: a refactor slice (structure), a fix slice (behavior,
 * usually born from a change request) or a feature slice that touches the same component (the repair is part of its work, and its
 * audit says whether it was paid). Records the debt as scheduled and lists it in the slice's `pays`; for a fix or refactor slice
 * already done (it paid the debt before it was recorded), the debt is paid at once. A done feature slice is refused: it accounts
 * for its debt in its own audit.
 */
export function scheduleDebt(root, debtId, sliceId) {
  return transact(root, () => {
    // A slice that already lists this debt in `pays` (a refactor slice must list what it pays to be valid) is the plan being
    // written: its T10 error is what this command resolves (found in the first real project, F-D11).
    const model = loadValid(root, { allow: (f) => f.rule === 'T10' && f.message.startsWith(`${sliceId} pays ${debtId},`) });
    const register = model.debt.find((d) => d.data.entries.some((e) => e.id === debtId)) ?? fail(`unknown debt ${debtId}`);
    const debt = register.data.entries.find((e) => e.id === debtId);
    const target = model.slices.find((s) => s.data.id === sliceId) ?? fail(`unknown slice ${sliceId}`);
    const s = target.data;
    // A scheduled entry moves while the slice that was to pay it has not started (found in the first real project, F-D14: the
    // owner split that slice and the entry could not follow the part that pays it).
    const from = debt.status === 'scheduled' ? model.slices.find((x) => x.data.id === debt.paid_by) : undefined;
    if (debt.status === 'scheduled') {
      if (debt.paid_by === sliceId) fail(`${debtId} is already scheduled into ${sliceId}`);
      if (!from || !['planned', 'ready'].includes(from.data.status)) fail(`${debtId} is scheduled into ${debt.paid_by}, and ${debt.paid_by} is ${from?.data.status ?? 'unknown'}; it moves only while that slice has not started`);
      if (from.data.type === 'refactor' && (from.data.pays ?? []).filter((d) => d !== debtId).length === 0) fail(`${debt.paid_by} is a refactor slice and pays nothing else; drop that slice or give it other debt first`);
    } else if (debt.status !== 'open') fail(`${debtId} is ${debt.status}; only an open or scheduled debt (one a person approved) can be scheduled`);
    const problem = payProblem(s, debt);
    if (problem) fail(problem);
    if (from) {
      editFrontmatter(root, from.file, (doc) => {
        const left = (from.data.pays ?? []).filter((d) => d !== debtId);
        if (left.length) doc.set('pays', left);
        else doc.delete('pays');
      });
    }
    const paidAlready = s.status === 'done';
    setDebtFields(root, register, debtId, { status: paidAlready ? 'paid' : 'scheduled', paid_by: sliceId });
    editFrontmatter(root, target.file, (doc) => {
      const pays = doc.get('pays');
      if (pays?.items) {
        if (!pays.items.some((item) => String(item.value ?? item) === debtId)) pays.items.push(debtId);
      } else doc.set('pays', [debtId]);
    });
    ensureValid(root);
    return { debt: debtId, slice: sliceId, status: paidAlready ? 'paid' : 'scheduled', ...(from ? { moved_from: from.data.id } : {}) };
  });
}

export function approveRed(root, by) {
  return transact(root, () => {
    if (!by || !by.trim()) fail('--by <name> is required: a human approves the RED tests');
    const entry = inProgress(loadValid(root));
    const s = entry.data;
    if (!WORK_TYPES.includes(s.type)) fail(`${s.id} is a ${s.type} slice: it has no RED phase to approve`);
    if (s.mode === 'light') fail(`${s.id} follows the light cycle: it has no red tests to approve. Build the tests and the code together, then audit`);
    if (s.phase !== 'red') fail(`${s.id} is in the ${s.phase} phase, not red`);
    requireCommitted(root);

    editFrontmatter(root, entry.file, (doc) => {
      doc.set('red_approved_by', by.trim());
      doc.set('phase', 'green');
    });
    writeActive(root, s.id, 'green');
    ensureValid(root);
    return { slice: s.id, phase: 'green' };
  });
}

export function toRefactor(root) {
  return transact(root, () => {
    const entry = inProgress(loadValid(root));
    const s = entry.data;
    if (s.mode === 'light') fail(`${s.id} follows the light cycle: it has no refactor phase. Clean up inside the build, or plan a refactor slice`);
    if (s.phase !== 'green') fail(`${s.id} is in the ${s.phase} phase, not green`);
    requireCommitted(root);
    editFrontmatter(root, entry.file, (doc) => doc.set('phase', 'refactor'));
    writeActive(root, s.id, 'refactor');
    ensureValid(root);
    return { slice: s.id, phase: 'refactor' };
  });
}

const DEBT_FILE = '.sddpp/debt.yaml';

/**
 * Under an optional test policy a slice may close without tests, but not silently: a debt entry of kind
 * `test` is proposed, owned by the slice's first component, for a person to decide. Returns its id.
 */
function proposeTestDebt(root, model, slice, today) {
  const component = slice.components[0];
  const code = model.blueprint.data.components.find((c) => c.id === component).code;
  const existing = model.debt.flatMap((d) => d.data.entries).filter((e) => e.component === component);
  const last = Math.max(0, ...existing.map((e) => Number(e.id.split('-')[2])));
  const id = `DEBT-${code}-${String(last + 1).padStart(3, '0')}`;
  const fields = {
    id,
    component,
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
  const abs = join(root, DEBT_FILE);
  if (!existsSync(abs)) {
    writeFileSync(abs, new Document({ entries: [fields] }).toString({ lineWidth: 0 }));
    return id;
  }
  const text = readFileSync(abs, 'utf8');
  // Follow the register's own style: some are written with `{ a: b }` maps.
  const flow = /^\s+origin: \{/m.test(text);
  const rendered = new Document([fields]);
  if (flow) for (const key of ['origin', 'cost_of_delay']) rendered.getIn([0, key], true).flow = true;
  // `entries` is the only key, so the new entry is appended as text: nothing already written is reformatted.
  if (model.debt[0].data.entries.length && !/\n[A-Za-z]/.test(text.slice(text.indexOf('entries:')))) {
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
/**
 * The account a closing slice gives of the debt it was to pay (`pays`): `debt_paid` lists what it paid, `debt_unpaid` what it did
 * not and why. A feature slice must account for every entry (found in the first real project, F-P2: SL-010 closed without the
 * debt meant for it, and said nothing); a refactor or fix slice, whose work is the debt, pays it unless it says otherwise.
 */
function debtAccount(s, input) {
  const pays = s.pays ?? [];
  const paid = input.debt_paid ?? [];
  const unpaid = input.debt_unpaid ?? [];
  if (!Array.isArray(paid) || paid.some((x) => typeof x !== 'string')) fail('"debt_paid" is a list of debt ids');
  if (!Array.isArray(unpaid) || unpaid.some((u) => typeof u?.id !== 'string')) fail('"debt_unpaid" is a list of { "id": "DEBT-…", "reason": "why it was not paid" }');
  for (const u of unpaid) if (typeof u.reason !== 'string' || u.reason.trim().length < 10) fail(`"debt_unpaid": ${u.id} needs a reason of at least 10 characters`);
  for (const x of [...paid, ...unpaid.map((u) => u.id)]) if (!pays.includes(x)) fail(`${s.id} does not pay ${x} (its "pays" is ${pays.length ? pays.join(', ') : 'empty'})`);
  for (const x of paid) if (unpaid.some((u) => u.id === x)) fail(`${x} is both paid and unpaid; say one`);
  const missing = pays.filter((x) => !paid.includes(x) && !unpaid.some((u) => u.id === x));
  if (s.type === 'feature' && missing.length) {
    fail(`${s.id} pays ${missing.join(', ')}. Say for each whether this slice paid it: "debt_paid": ["${missing[0]}"], or "debt_unpaid": [{ "id": "${missing[0]}", "reason": "why not" }]`);
  }
  return { paid, unpaid: unpaid.map((u) => ({ id: u.id, reason: u.reason.trim() })) };
}

/**
 * The check of the real app that a slice building to screens gives at its close (found in the first real project, F-D12: no
 * test opened the real app for 23 slices, and it failed at start-up). ppc checks the check was given and its screenshots exist,
 * not that the screens look right: the person sees the screenshots.
 */
function uiCheckOf(root, s, input) {
  const screens = s.screens ?? [];
  const check = input.ui_check;
  if (!screens.length || !WORK_TYPES.includes(s.type)) return check;
  if (!check || typeof check !== 'object') {
    fail(`${s.id} builds to ${screens.join(', ')}. Open the real app (\`app.check\` in .architect/ui.md, or how the project starts) and say what you saw: "ui_check": { "command": "<what you ran>", "console_errors": <how many>, "screenshots": [".sddpp/ui-checks/${s.id}/<screen>.png"] }`);
  }
  if (typeof check.command !== 'string' || check.command.trim().length < 3) fail('"ui_check" needs "command": what opened the real app');
  if (!Number.isInteger(check.console_errors) || check.console_errors < 0) fail('"ui_check" needs "console_errors": how many errors the real app printed (0 when none)');
  const shots = check.screenshots ?? [];
  if (!Array.isArray(shots)) fail('"ui_check": "screenshots" is a list of files');
  for (const shot of shots) {
    if (typeof shot !== 'string' || !shot.startsWith(`.sddpp/ui-checks/`) || shot.includes('..')) fail(`"ui_check": a screenshot goes under .sddpp/ui-checks/${s.id}/ (got ${shot})`);
    if (!existsSync(join(root, shot))) fail(`"ui_check": the screenshot ${shot} does not exist`);
  }
  if (!shots.length && !(typeof check.no_screenshots_reason === 'string' && check.no_screenshots_reason.trim().length >= 10)) {
    fail('"ui_check" has no screenshots: take them, or say why there are none in "no_screenshots_reason"');
  }
  return check;
}

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
        const m = measure(root, String(c.sha), generatedGlobs(model.blueprint.data));
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
        const result = runMutation(root, sliceProductionFiles(root, input.commits, generatedGlobs(model.blueprint.data)), mutationRunner);
        mutation_score = result.score;
        if (mutation_score !== null && mutation_score < gate && !input.mutation_override_reason) {
          const shown = result.survivors.slice(0, 10).map((m) => `  ${m.file}:${m.line} ${m.mutator} -> ${String(m.replacement).slice(0, 50)}`);
          const more = result.survivors.length > shown.length ? [`  ... and ${result.survivors.length - shown.length} more`] : [];
          fail(`mutation score ${mutation_score} is below the gate ${gate}. Mutants the tests did not detect:\n${[...shown, ...more].join('\n')}\nThe tests must detect them (a human decides whether to reopen the tests) or a human records mutation_override_reason.`);
        }
      }
      const account = debtAccount(s, input);
      const ui_check = uiCheckOf(root, s, input);
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
        ...(account.paid.length ? { debt_paid: account.paid } : {}),
        ...(account.unpaid.length ? { debt_unpaid: account.unpaid } : {}),
        ...(ui_check ? { ui_check } : {}),
      };
      editFrontmatter(root, entry.file, (doc) => {
        doc.set('status', 'done');
        doc.delete('phase');
        doc.set('audit', audit);
      });
      // `pays` keeps what the slice was to pay; what it did not pay is open again, tied to no slice (W09 says so)
      for (const { id: debtId } of account.unpaid) {
        const register = model.debt.find((d) => d.data.entries.some((e) => e.id === debtId));
        setDebtFields(root, register, debtId, { status: 'open', paid_by: undefined });
      }
    }
    if (PAYERS.includes(s.type)) {
      // The slice is done, so the debt it was scheduled to pay is paid (rule L05 forbids saying so earlier). What it said it did not
      // pay was open again above.
      const unpaid = new Set((input?.debt_unpaid ?? []).map((u) => u.id));
      for (const id of (s.pays ?? []).filter((d) => !unpaid.has(d))) {
        const register = model.debt.find((d) => d.data.entries.some((e) => e.id === id));
        const entry = register?.data.entries.find((e) => e.id === id);
        if (entry?.status === 'scheduled' && entry.paid_by === s.id) setDebtFields(root, register, id, { status: 'paid' });
      }
    }
    writeActive(root, null, null);
    ensureValid(root);

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
    const model = loadProject(root);
    const entry = model.slices.find((s) => s.data.id === slice) ?? fail(`unknown slice ${slice}`);
    if (!entry.data.audit) fail(`${slice} has no audit yet, so its files are not known; pass --files`);
    targets = sliceProductionFiles(root, entry.data.audit.commits, generatedGlobs(model.blueprint?.data));
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
