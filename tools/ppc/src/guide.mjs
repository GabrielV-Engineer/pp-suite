import { SURFACES } from './rubric.mjs';

// The outside test (level 3 of the experience standard, docs/standards.md): someone other than the builder tries what was built.
// pp-suite assumes no number of people, no team and no cost: the person decides who and whether, and skipping it is recorded and holds
// nothing up. This file says which closed reviews are waiting for that, and writes the guide, the same text every time.

/** The closed reviews waiting for an outside test: under `external`, closed on or after the day the standard was decided, with no record. */
export function pendingOutside(model) {
  const own = (model.standards?.data?.standards ?? []).find((s) => s.id === 'experience');
  if (own?.decision !== 'adopt' || own.choice !== 'external') return [];
  return (model.reviews ?? []).map((r) => r.data)
    .filter((r) => r.status === 'closed' && !r.outside_by && r.closed_on && String(r.closed_on) >= String(own.decided_on));
}

// what to watch for on each surface, besides what is true on all of them
const WATCH = {
  screen: 'What they look at first on a screen, and what they do not see that is there',
  api: 'Which call they try first, and what they do when it answers with an error',
  cli: 'What command they type first, and what they do when the output is not what they expected',
  docs: 'Where in the pages they get lost, and what they go looking for somewhere else',
};

/** The guide for someone else to try what a review covered. */
export function renderGuide(model, review) {
  const project = review.scope.type === 'project';
  const cap = project ? null : (model.blueprint?.data.capabilities ?? []).find((c) => c.id === review.scope.ref);
  const where = project ? 'the whole project' : `${review.scope.ref}${cap ? ` "${cap.name}"` : ''}`;
  const slices = model.slices.map((s) => s.data).filter((s) => s.status === 'done' && (project || s.capability === review.scope.ref));
  const asks = slices.flatMap((s) => (s.acceptance ?? []).filter((a) => a.audience !== 'system').map((a) => `  - ${s.id} ${a.id}: ${a.scenario}`));
  return [
    `Guide: someone other than the builder tries ${where}`,
    '',
    'Why. The builder knows too much to see what is unclear; someone who did not build it shows where it is. Who that is, how many, and',
    'whether it happens at all is your decision: a colleague, a user, or you after some time away from it all. Nothing here assumes a',
    'team or a cost.',
    '',
    'Before. Give them the goal, not the steps, and do not explain anything while they try: what they cannot work out alone is what you',
    'came to learn.',
    '',
    'Ask them to:',
    ...(asks.length ? asks : ['  - (no closed slice has a criterion a person can try: ask them to do what the thing is for)']),
    '',
    'Watch for:',
    '  - where they hesitate or stop',
    '  - what they click, type or tap that does nothing',
    '  - what they misread, or call by another name',
    '  - what they ask you, and what they say out loud',
    ...review.surfaces.map((s) => `  - ${WATCH[s]}`),
    '',
    'After. Write what happened in your own words; it need not be tidy. If something is worth fixing, say so to /pp and it is proposed as',
    'debt like any other finding.',
    '',
    `To say someone tried it:  ppc outside ${review.id}   (add --note "<who, and how it went>" if you want it recorded)`,
    `If you cannot or will not:  ppc outside ${review.id} --skip   (recorded as skipped; it holds nothing up)`,
    '',
  ].join('\n').replace(/\n+$/, '\n');
}

export const surfaceTitles = (review) => review.surfaces.map((s) => SURFACES[s].title);
