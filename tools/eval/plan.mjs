// What to run, in which order, with which prompt, and what a session result means. Pure, so it is tested
// (test/plan.test.mjs); run.mjs does the side effects.

export const CONDITIONS = ['B1', 'B2', 'T'];
const T_PHASES = ['red', 'green', 'audit'];

/** Small seeded generator, so the same seed gives the same plan. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * One entry per (slice, condition, repetition). Repetitions are interleaved (all of round 1, then round 2...)
 * so that stopping early still leaves complete rounds, and the order of conditions inside a round is shuffled
 * so that no condition always runs first (time of day, machine load and account state would favor it).
 */
export function buildPlan({ slices, conditions = CONDITIONS, reps, seed }) {
  const random = mulberry32(seed);
  const plan = [];
  for (let rep = 1; rep <= reps; rep++) {
    for (const slice of slices) {
      const order = [...conditions];
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
      for (const condition of order) plan.push({ id: `${slice}-${condition}-${rep}`, slice, condition, rep });
    }
  }
  return plan;
}

/**
 * The prompt for one session. B1 and B2 are single sessions (`phase` is "all"); T has a red, a green and an
 * audit session. The wording is fixed here, before any run, and committed with the plan.
 */
export function promptFor(condition, phase, slice, sliceFile) {
  const intro = `You are working in a TypeScript project on Node 24 (see .architect/architecture.md and .architect/blueprint.yaml). The work to do is slice ${slice}, described in ${sliceFile}.`;
  if (condition === 'B1' || condition === 'B2') {
    if (phase !== 'all') throw new Error(`condition ${condition} has a single session, not "${phase}"`);
    const plain = `${intro} Implement it. Run the project's tests (npm test) and the type check (npm run typecheck). Commit your work with git when you are done.`;
    return condition === 'B1' ? plain : `${plain} Work test-first: write the failing tests for the acceptance criteria before the code, watch them fail, then implement until they pass.`;
  }
  if (condition === 'T') {
    if (!T_PHASES.includes(phase)) throw new Error(`unknown phase "${phase}"`);
    const state = { red: 'the red phase', green: 'the green phase', audit: 'the green phase, ready to be audited' }[phase];
    return `${intro} The slice is already in progress, in ${state}. Follow the instructions in .specify/extensions/sddpp-cycle/commands/${phase}.md. \`ppc\` is on your PATH. When you finish, report briefly what you did and what you could not verify.`;
  }
  throw new Error(`unknown condition "${condition}"`);
}

/**
 * What a `claude -p --output-format json` result means for the experiment.
 *  ok              the session ran
 *  budget          it hit its own spending cap: a real result, the agent did not finish
 *  failed          it ended in an error of its own: a real result, kept
 *  infrastructure  the account or the network failed: not a result, the run is discarded and redone.
 * A usage limit looks like a success ("subtype": "success") with is_error true and terminal_reason api_error.
 */
export function classifySession(result) {
  if (!result) return 'infrastructure';
  if (!result.is_error) return 'ok';
  if (result.terminal_reason === 'api_error') return 'infrastructure';
  if (result.subtype === 'error_max_budget_usd') return 'budget';
  return 'failed';
}
