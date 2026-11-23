import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { stringify } from 'yaml';
import { LifecycleError, editFrontmatter, loadValid, transact } from './lifecycle.mjs';
import { MODES } from './review.mjs';
import { SURFACES, renderRubric, surfacesFor } from './rubric.mjs';
import { skillsWarning } from './skills.mjs';

// Opening a review (docs/standards.md, "Experience"). The file is the record: how it is done and who chose that, the surfaces, the
// rubric, and, as the agent fills it in, the answers and the debt it proposed. Writes `.sddpp/reviews/` and nothing else.

const fail = (message) => {
  throw new LifecycleError(message);
};
const DIR = '.sddpp/reviews';

/**
 * HUMAN ONLY (the guard asks the person): open a review of a capability (`CAP-002`) or of the whole project (`project`). The mode is the
 * person's choice; `surfaces` adds `cli` or `docs`, which no component kind says. Refuses when nothing is closed yet, or when one is
 * already open for the same scope.
 */
export function openReview(root, { scope, mode, by, surfaces: extra = [], today = new Date().toISOString().slice(0, 10) } = {}) {
  if (!by || !by.trim()) fail('--by <name> is required (or set git config user.name): a person chooses how a review is done');
  if (!MODES.includes(mode)) fail('--mode guide, explain or delegate is required: how the review is done is the person\'s choice');
  return transact(root, () => {
    const model = loadValid(root);
    let scopeData;
    if (scope === 'project') scopeData = { type: 'project' };
    else if (/^CAP-\d{3}$/.test(scope ?? '')) {
      if (!model.blueprint.data.capabilities.some((c) => c.id === scope)) fail(`the design has no capability ${scope}`);
      scopeData = { type: 'capability', ref: scope };
    } else fail('say what to review: a capability (ppc review CAP-001 --mode ...) or --project');
    const built = model.slices.map((s) => s.data).filter((s) => s.status === 'done' && (scopeData.type === 'project' || s.capability === scope));
    if (!built.length) fail(`nothing is built to review yet: no slice of ${scopeData.type === 'project' ? 'the project' : scope} is closed`);
    const open = (model.reviews ?? []).find((r) => r.data.status === 'open' && r.data.scope.type === scopeData.type && r.data.scope.ref === scopeData.ref);
    if (open) fail(`${open.data.id} is already open for ${scope === 'project' ? 'the project' : scope}; finish it first`);

    const kindOf = new Map(model.blueprint.data.components.map((c) => [c.id, c.kind]));
    let surfaces;
    try {
      surfaces = surfacesFor(built.flatMap((s) => (s.components ?? []).map((c) => kindOf.get(c))), extra);
    } catch (e) {
      fail(e.message);
    }
    if (!surfaces.length) fail(`nothing in ${scope === 'project' ? 'the project' : scope} is something a person meets; say which surface to review with --surface ${Object.keys(SURFACES).join('|')}`);

    const numbers = (model.reviews ?? []).map((r) => Number(r.data.id.slice(3)));
    const id = `RV-${String(Math.max(0, ...numbers) + 1).padStart(3, '0')}`;
    const front = stringify({ id, scope: scopeData, mode, mode_chosen_by: by.trim(), surfaces, opened_on: today, status: 'open' }, { lineWidth: 0, flowCollectionPadding: false });
    const file = `${DIR}/${id}-${scopeData.type === 'project' ? 'project' : scope.toLowerCase()}.md`;
    const answers = renderRubric(surfaces).split('\n').filter((l) => /^ {2}[A-Z]-\d{2}  /.test(l)).map((l) => `- ${l.trim().split(/\s+/)[0]}:`);
    const body = [
      '', '## What was reviewed', '',
      `${scopeData.type === 'project' ? 'The whole project' : scope}. Closed slices: ${built.map((s) => `${s.id} "${s.title}"`).join(', ')}.`,
      '', '## Rubric', '', '```text', renderRubric(surfaces).trimEnd(), '```',
      '', '## Answers', '', 'One line for each criterion: ok, or the concern with what was seen and where.', '', ...answers,
      '', '## Findings', '',
      `None yet. Each finding is proposed as an entry of technical debt (kind \`experience\`, origin review ${id}), and its id is added to \`findings\` above. The person decides on it like any other debt.`, '',
    ].join('\n');
    mkdirSync(join(root, DIR), { recursive: true });
    writeFileSync(join(root, file), `---\n${front}---\n${body}`);
    loadValid(root);
    return { review: id, file, mode, surfaces, text: `Opened ${id} (${mode} mode) for ${scope === 'project' ? 'the project' : scope}: ${surfaces.join(', ')}. ${file}\nNext: /pp-experience ${id}${(() => { const w = skillsWarning(root, [`/pp-experience ${id}`]); return w ? `\n${w}` : ''; })()}` };
  });
}

/**
 * HUMAN ONLY (the guard asks the person): say that someone other than the builder tried what a closed review covered, or that it
 * will not happen (`skip`). Records who says so and when, and a note if there is one, in the review's file; changes nothing else.
 * Never a gate: no number of people is assumed, and nothing waits for it.
 */
export function recordOutside(root, id, { by, skip = false, note, today = new Date().toISOString().slice(0, 10) } = {}) {
  if (!by || !by.trim()) fail('--by <name> is required (or set git config user.name): a person says it was tried');
  if (note !== undefined && note.trim().length < 5) fail('the note needs at least 5 characters: who tried it and how it went, or why not');
  return transact(root, () => {
    const model = loadValid(root);
    const entry = (model.reviews ?? []).find((r) => r.data.id === id) ?? fail(`unknown review ${id}`);
    if (entry.data.status !== 'closed') fail(`${id} is still open: the review is done first, then someone else tries it`);
    if (entry.data.outside_by) fail(`${id} already says so: ${entry.data.outside_by} on ${entry.data.outside_on}`);
    editFrontmatter(root, entry.file, (doc) => {
      doc.set('outside_by', by.trim());
      doc.set('outside_on', today);
      if (skip) doc.set('outside_skipped', true);
      if (note !== undefined) doc.set('outside_note', note.trim());
    });
    loadValid(root);
    return { review: id, outside_by: by.trim(), outside_on: today, skipped: Boolean(skip) };
  });
}
