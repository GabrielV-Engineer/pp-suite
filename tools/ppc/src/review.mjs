// The milestone review (docs/standards.md, "Experience"): which capabilities are due one, which reviews are unfinished, and which way
// of doing it the person chose last. Pure over the loaded model; nothing here writes a file.

export const MODES = ['explain', 'guide', 'delegate'];

// the choices that include the review of the whole; `glance` is level 1 only and `custom` is the person's own way
const LEVELS = new Set(['review', 'external']);

/** The experience standard when the person adopted a choice that includes the review, else null. */
export const reviewStandard = (model) => {
  const own = (model.standards?.data?.standards ?? []).find((s) => s.id === 'experience');
  return own?.decision === 'adopt' && LEVELS.has(own.choice) ? own : null;
};

const liveSlices = (model, cap) => model.slices.map((s) => s.data).filter((s) => s.capability === cap && s.status !== 'dropped');

/**
 * The capabilities due a review: every live slice closed, the last one on or after the day the standard was decided (earlier ones were
 * built under other terms), and no review of it yet, open or closed. Reviewed once is reviewed; the person may ask again.
 */
export function pendingReviews(model) {
  const standard = reviewStandard(model);
  if (!standard) return [];
  const reviewed = new Set((model.reviews ?? []).map((r) => r.data.scope).filter((s) => s.type === 'capability').map((s) => s.ref));
  return (model.blueprint?.data.capabilities ?? []).filter((cap) => {
    const slices = liveSlices(model, cap.id);
    return slices.length > 0 && slices.every((s) => s.status === 'done') && !reviewed.has(cap.id)
      && slices.some((s) => s.closed_on && String(s.closed_on) >= String(standard.decided_on));
  });
}

/** The reviews still open: the agent's turn to answer the rubric and propose the findings. */
export const openReviews = (model) => (model.reviews ?? []).map((r) => r.data).filter((r) => r.status === 'open');

/** The way the person chose last, so that repeating it is one click; with no review yet, say what will be done first. */
export function suggestedMode(model) {
  const all = (model.reviews ?? []).map((r) => r.data).sort((a, b) => a.id.localeCompare(b.id));
  return all.at(-1)?.mode ?? 'explain';
}

/** The modes in the order to offer them: the suggested one first. */
export const modesFor = (model) => [suggestedMode(model), ...MODES.filter((m) => m !== suggestedMode(model))];
