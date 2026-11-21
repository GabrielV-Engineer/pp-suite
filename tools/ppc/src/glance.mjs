import { BY_ID } from './standards.mjs';

// The glance (docs/standards.md, "Experience"): after a slice closes, a person looks at what a user would meet and says so with
// `ppc glance`. This file decides which closed slices are waiting for that, and writes the list of what to look at. Pure over the
// loaded model; nothing here writes a file.

const WORK_TYPES = ['skeleton', 'feature', 'fix'];
// the choices that include the glance; `custom` is the person's own way and is not nudged
const LEVELS = new Set(['glance', 'review', 'external']);

/** The experience standard when the person adopted a choice that includes the glance, else null. */
export const glanceStandard = (model) => {
  const own = (model.standards?.data?.standards ?? []).find((s) => s.id === 'experience');
  return own?.decision === 'adopt' && LEVELS.has(own.choice) ? own : null;
};

/**
 * The closed slices waiting for a person's glance: work that closed on or after the day the standard was decided (earlier ones were
 * built under other terms), that touches something a person meets, and that nobody has looked at or skipped.
 */
export function pendingGlances(model) {
  const standard = glanceStandard(model);
  if (!standard) return [];
  const kindOf = new Map((model.blueprint?.data.components ?? []).map((c) => [c.id, c.kind]));
  const met = new Set(BY_ID.get('experience').components);
  return model.slices.map((s) => s.data).filter((s) => s.status === 'done' && WORK_TYPES.includes(s.type) && s.closed_on
    && String(s.closed_on) >= String(standard.decided_on) && !s.glanced_by && (s.components ?? []).some((c) => met.has(kindOf.get(c))));
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * What a person looks at for one closed slice, in plain lines: from the slice (its screens, what it was checked by, the quality
 * targets it names) and from what its audit saved. The same text every time; the agent may add tools to try, labelled as its own.
 */
export function lookAt(model, s) {
  const out = [];
  const screens = (s.screens ?? []).map((id) => (Array.isArray(model.ui?.data?.screens) ? model.ui.data.screens : []).find((x) => x.id === id) ?? { id });
  if (screens.length) out.push(`The screens: ${screens.map((x) => `${x.id}${x.name ? ` "${x.name}"` : ''}`).join(', ')}. Does the real one look like the mockup you approved${screens.some((x) => x.mockup) ? ` (${screens.filter((x) => x.mockup).map((x) => x.mockup).join(', ')})` : ''}?`);
  for (const a of s.acceptance ?? []) out.push(`Try it yourself, ${a.id}: ${a.scenario}`);
  for (const id of s.quality_attributes ?? []) {
    const q = (model.blueprint?.data.quality_attributes ?? []).find((x) => x.id === id);
    if (q) out.push(`${q.id} ${q.attribute}: ${q.scenario} Metric: ${q.metric}. Target: ${q.target}.`);
  }
  const check = s.audit?.ui_check;
  if (check?.screenshots?.length) out.push(`The captures the audit saved: ${check.screenshots.join(', ')}; ${plural(check.console_errors, 'console error')}.`);
  else if (check) out.push(`The audit saved no captures${check.no_screenshots_reason ? ` (${check.no_screenshots_reason})` : ''}; ${plural(check.console_errors, 'console error')}.`);
  else out.push('The audit saved no captures of the real app.');
  out.push('As someone who has never seen it: is it clear without explanation, and does it feel as fast and as current as it should?');
  return out;
}
