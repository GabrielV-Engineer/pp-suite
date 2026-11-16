// Whether a slice must leave tests behind. The project sets a policy and a slice may override it.
//   required  a work slice cannot close without tests
//   optional  it can, and the missing tests become a proposed debt entry (the default, as in Spec Kit)
//   none      tests are not asked for and nothing is proposed

export const TEST_POLICIES = ['required', 'optional', 'none'];

/** The policy that applies to a slice: its own, else the project's, else optional. Takes the parsed `data` of each. */
export const testPolicy = (blueprint, slice) => slice?.test_policy ?? blueprint?.test_policy ?? 'optional';

/**
 * The cycle a work slice follows: its own `mode`, else the project's `default_mode`, else strict. Absent means strict
 * so that a project written before the light mode existed behaves as it always did.
 */
export const modeOf = (blueprint, slice) => slice?.mode ?? blueprint?.default_mode ?? 'strict';

// The slice types that may pay debt. A feature slice pays the debt of the components it touches (the owner's choice, 2026-11-14,
// after three entries meant for a feature slice of the first real project went unpaid); its audit says what it paid.
export const PAYERS = ['refactor', 'fix', 'feature'];

/** Whether `slice` touches the component a debt entry lives in, or one it also affects. */
export const touchesDebt = (slice, debt) => slice.components.includes(debt.component) || (debt.also_affects ?? []).some((c) => slice.components.includes(c));

/**
 * Why `slice` cannot be given `debt` to pay, or null when it can: it must be a paying type, still to be built (planned or ready),
 * and touch the debt's component. A fix or refactor slice already done may record debt it paid before anyone wrote it down.
 */
export function payProblem(slice, debt) {
  if (!PAYERS.includes(slice.type)) return `${slice.id} is a ${slice.type} slice. Debt is paid by a feature, fix or refactor slice that touches its component`;
  const recordsPaid = slice.status === 'done' && slice.type !== 'feature';
  if (slice.status === 'done' && slice.type === 'feature') return `${slice.id} is a feature slice that is done; it can no longer pay ${debt.id}. Schedule it into a planned slice, or plan a fix slice`;
  if (!['planned', 'ready'].includes(slice.status) && !recordsPaid) return `${slice.id} is ${slice.status}; debt can be scheduled only into a slice that is planned or ready, or recorded as paid by a fix or refactor slice that is done`;
  if (!touchesDebt(slice, debt)) return `${slice.id} does not touch ${debt.component}, where ${debt.id} lives`;
  return null;
}

/** Whether a screen's mockup (and image) is approved as it is now: approved_by is set and the hashes recorded then still match. */
export const screenApproved = (model, s) => Boolean(s.approved_by) && model.uiFiles?.[s.mockup] === s.mockup_sha256 && (!s.image || !s.image_sha256 || model.uiFiles?.[s.image] === s.image_sha256);
