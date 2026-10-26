import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { stringify } from 'yaml';
import { checkConstitution, CONSTITUTION_FILE } from './constitution.mjs';
import { LifecycleError, editFrontmatter, loadValid, transact } from './lifecycle.mjs';

// The way a slice asks the design to change. SDD.PP never edits `.architect/`: a slice that finds the design wrong or
// silent opens a change request; a person accepts or rejects it; Architect.PP revises the design and raises its
// revision; only then is the request marked applied, and the slices planned against the old revision show up as stale.

const fail = (message) => {
  throw new LifecycleError(message);
};
const DIR = '.sddpp/change-requests';
const slug = (title) => title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50).replace(/-+$/, '');

const find = (model, id) => model.changeRequests.find((c) => c.data.id === id) ?? fail(`unknown change request ${id}`);

/** Any agent may open one: it only asks. The ids it names must exist, and it must say what it affects. */
export function openChange(root, { slice, title, problem, proposal, components = [], adrs = [], qas = [] } = {}) {
  return transact(root, () => {
    const model = loadValid(root);
    const bp = model.blueprint.data;
    if (!model.slices.some((s) => s.data.id === slice)) fail(`unknown slice ${slice}`);
    if (!title || title.trim().length < 5) fail('the title needs at least 5 characters');
    if (!problem || problem.trim().length < 15) fail('the problem needs at least 15 characters: what the slice found');
    if (!proposal || proposal.trim().length < 15) fail('the proposal needs at least 15 characters: what should change in the design');
    if (!components.length && !adrs.length && !qas.length) fail('say what it affects: at least one component, decision or quality attribute');
    for (const c of components) if (!bp.components.some((x) => x.id === c)) fail(`the design has no component ${c}`);
    for (const q of qas) if (!bp.quality_attributes.some((x) => x.id === q)) fail(`the design has no quality attribute ${q}`);
    for (const a of adrs) if (!model.adrs.some((x) => x.data.id === a)) fail(`the design has no decision ${a}`);

    const numbers = model.changeRequests.map((c) => Number(c.data.id.slice(3)));
    const id = `CR-${String(Math.max(0, ...numbers) + 1).padStart(4, '0')}`;
    const affects = { ...(components.length ? { components } : {}), ...(adrs.length ? { adrs } : {}), ...(qas.length ? { quality_attributes: qas } : {}) };
    const front = stringify({ id, title: title.trim(), status: 'open', raised_by: slice, blueprint_revision: bp.revision, affects }, { lineWidth: 0, flowCollectionPadding: false });
    const file = `${DIR}/${id}-${slug(title)}.md`;
    mkdirSync(join(root, DIR), { recursive: true });
    writeFileSync(join(root, file), `---\n${front}---\n\n## Problem\n\n${problem.trim()}\n\n## Proposal\n\n${proposal.trim()}\n`);
    loadValid(root);
    return { change: id, file };
  });
}

/** HUMAN ONLY: accept or reject an open request. A rejection says why. */
export function decideChange(root, id, { decision, by, reason } = {}) {
  return transact(root, () => {
    if (!by || !by.trim()) fail('--by <name> is required: a person decides on a change to the design');
    if (!['accept', 'reject'].includes(decision)) fail('the decision must be accept or reject');
    const entry = find(loadValid(root), id);
    if (entry.data.status !== 'open') fail(`${id} is ${entry.data.status}; only an open request can be decided`);
    if (decision === 'reject' && (!reason || reason.trim().length < 5)) fail('rejecting needs a --reason of at least 5 characters');
    const status = decision === 'accept' ? 'accepted' : 'rejected';
    editFrontmatter(root, entry.file, (doc) => {
      doc.set('status', status);
      doc.set('decided_by', by.trim());
      if (reason && reason.trim()) doc.set('reason', reason.trim());
    });
    loadValid(root);
    return { change: id, status };
  });
}

/**
 * Mark an accepted request applied. The tool checks what it can: the design revision has risen since the request was
 * opened, and the constitution (if there is one) follows the new design. That the design was revised *correctly* is
 * for the person to read.
 */
export function applyChange(root, id) {
  return transact(root, () => {
    const model = loadValid(root);
    const entry = find(model, id);
    if (entry.data.status !== 'accepted') fail(`${id} is ${entry.data.status}; only an accepted request can be applied`);
    const revision = model.blueprint.data.revision;
    const opened = entry.data.blueprint_revision;
    if (opened !== undefined && revision <= opened) fail(`the design is still at revision ${revision}, where ${id} was opened: revise .architect/ and raise its revision first (/speckit-architect-pp-apply-change ${id})`);
    if (existsSync(join(root, CONSTITUTION_FILE)) && checkConstitution(root).length) fail(`the constitution still describes the old design: run \`ppc constitution\` first`);
    editFrontmatter(root, entry.file, (doc) => doc.set('status', 'applied'));
    loadValid(root);
    return { change: id, status: 'applied' };
  });
}
