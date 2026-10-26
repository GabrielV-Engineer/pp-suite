import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { LifecycleError } from './lifecycle.mjs';
import { loadProject } from './load.mjs';
import { modeOf, testPolicy } from './policy.mjs';

// Prompts for one task of one slice, made from the contract by a script, so they are the same every time.
// Three parts, offered as files a person can use as they are, edit, or ignore:
//   system    the role, what to read (by name, not pasted) and the rules of the task
//   negative  what not to do: the slice's "Out of scope", the non-goals, the component boundaries
//   design    only when the work touches an interface or an architectural choice

export class PromptError extends LifecycleError {}
const fail = (message) => {
  throw new PromptError(message);
};

export const TASKS = ['red', 'green', 'build', 'refactor', 'audit', 'explore'];
const WORK_TYPES = ['skeleton', 'feature', 'fix'];

export function appliesTo(type, mode = 'strict') {
  if (WORK_TYPES.includes(type)) return mode === 'light' ? ['build', 'audit'] : ['red', 'green', 'refactor', 'audit'];
  if (type === 'refactor') return ['refactor', 'audit'];
  return ['explore'];
}

/** The bullets under "## Out of scope" of a slice body, up to the next heading. */
export function outOfScope(body) {
  const lines = body.split(/\r?\n/);
  const start = lines.findIndex((l) => /^##\s+Out of scope\s*$/i.test(l));
  if (start === -1) return [];
  const items = [];
  for (const line of lines.slice(start + 1)) {
    if (/^#{1,6}\s/.test(line)) break;
    if (/^\s*[-*]\s+/.test(line)) items.push(line.replace(/^\s*[-*]\s+/, '').trim());
    else if (line.trim() && items.length) items[items.length - 1] += ` ${line.trim()}`;
  }
  return items;
}

const list = (items) => items.map((i) => `- ${i}`);
const join2 = (parts) => `${parts.flat().join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`;

const POLICY_TEXT = {
  required: 'Tests are required: the slice cannot close without test files, so write them.',
  optional: 'Tests are expected. If the slice closes without any, `ppc finish` proposes a debt entry for it.',
  none: 'Tests are not asked for in this project. Add one only where a behavior is easy to get wrong.',
};

const RULES = {
  build: (s, policy) => [
    `Build the slice: for each acceptance criterion (${(s.acceptance ?? []).map((a) => a.id).join(', ')}) write a test and the code that passes it, in small steps.`,
    POLICY_TEXT[policy],
    'No one locks the tests in this cycle, so changing a test to make it pass is invisible until review: change the code, and tell the reader if you must change a test.',
    `Commit in small steps as \`build(${s.id}): <summary>\`, keeping tests and code that belong together in the same commit.`,
    'When it works, stop and run the audit task.',
  ],
  red: (s) => [
    `Write the failing tests only: one per acceptance criterion (${(s.acceptance ?? []).map((a) => a.id).join(', ')}), named after the criterion.`,
    'Write no production code.',
    'Run them and see each fail for the right reason (the behavior is missing, not a typo).',
    `Commit as \`red(${s.id}): <summary>\`, then stop: a person reads the tests and runs \`ppc approve-red --by <name>\`.`,
  ],
  green: (s) => [
    'Write the least production code that makes the approved tests pass.',
    'The tests are locked. If one looks wrong, stop and say so; do not change it.',
    `Commit as \`green(${s.id}): <summary>\`.`,
  ],
  refactor: (s) => [
    'Improve the structure without changing behavior. The tests are locked and must pass before and after.',
    `Commit as \`refactor(${s.id}): <summary>\`, apart from any behavior change.`,
  ],
  audit: (s) => [
    'Record the debt and the deviations honestly, then close the slice with `ppc finish`. Never supply sizes or the mutation score: they are measured.',
    `Debt you propose is \`status: proposed\`; a person decides. Commit the bookkeeping as \`chore(${s.id}): close slice\`.`,
  ],
  explore: (s) => [
    `Explore within the timebox (${s.timebox_hours ?? 'a few'} hours). The code is disposable; what matters is what you learn.`,
    'Finish by recording the outcome: what was learned, in a few sentences.',
  ],
};

const FORBIDDEN = {
  build: ['Weaken, delete or skip a test to get a green result.', 'Add behavior no acceptance criterion asks for.'],
  red: ['Write or change production code in this task.'],
  green: ['Edit, delete, skip or weaken any test.', 'Add behavior no approved test asks for.'],
  refactor: ['Change behavior, or edit any test.'],
  audit: ['Edit tests or production code; this task only records and closes.', 'Set `approved_by`, or write an exception reason for a budget or a mutation gate.'],
  explore: ['Treat the exploration as the implementation: it is thrown away.'],
};

const COMMANDS = { build: '/speckit-sddpp-cycle-build', red: '/speckit-sddpp-cycle-red', green: '/speckit-sddpp-cycle-green', refactor: '/speckit-sddpp-cycle-refactor', audit: '/speckit-sddpp-cycle-audit' };

function find(model, id, task) {
  const entry = model.slices.find((s) => s.data.id === id) ?? fail(`unknown slice ${id}`);
  if (!TASKS.includes(task)) fail(`unknown task ${task} (tasks: ${TASKS.join(', ')})`);
  const s = entry.data;
  const mode = modeOf(model.blueprint.data, s);
  const tasks = appliesTo(s.type, mode);
  if (!tasks.includes(task)) fail(`${id} is a ${mode === 'light' && WORK_TYPES.includes(s.type) ? 'light' : s.type} slice: it has no ${task} task (tasks: ${tasks.join(', ')})`);
  return entry;
}

/** The ADRs that bind a slice: those driven by its capability or its quality attributes. */
const bindingAdrs = (model, s) => {
  const ids = new Set([s.capability, ...(s.quality_attributes ?? [])].filter(Boolean));
  return model.adrs.filter((a) => (a.data.drivers ?? []).some((d) => ids.has(d)));
};

/** The design prompt is offered when the slice touches an interface, builds the skeleton, or is bound by a decision. */
function needsDesign(model, s) {
  const kinds = new Map(model.blueprint.data.components.map((c) => [c.id, c.kind]));
  return s.type === 'skeleton' || s.components.some((c) => kinds.get(c) === 'frontend') || bindingAdrs(model, s).length > 0;
}

export function buildPrompts(model, id, task) {
  const entry = find(model, id, task);
  const s = entry.data;
  const bp = model.blueprint.data;
  const comps = new Map(bp.components.map((c) => [c.id, c]));
  const title = `${id} · ${task}`;
  const adrs = bindingAdrs(model, s);

  const reads = [
    `- \`${entry.file}\`: the behavior, the acceptance criteria and what is out of scope`,
    `- \`.architect/blueprint.yaml\`: ${[s.capability, ...(s.quality_attributes ?? [])].filter(Boolean).join(', ')}; components ${s.components.join(', ')}`,
    '- `.architect/architecture.md`: how the components are structured and what they may do',
    ...(s.spec ? [`- \`${s.spec.file}\` ("${s.spec.story}"): the user story this slice delivers`] : []),
    ...adrs.map((a) => `- \`${a.file}\`: ${a.data.title}`),
    ...s.components.map((c) => `- \`.sddpp/debt/${c}.yaml\`: known debt in ${c}`),
  ];
  const system = join2([
    `# System prompt: ${title}`,
    '',
    `You are working on slice ${id} "${s.title}" of ${bp.project.name}. Do this one task, then stop.`,
    '',
    '## Read first',
    'Read these files; do not copy them into your answer.',
    ...reads,
    '',
    `## This task: ${task}`,
    ...list(RULES[task](s, testPolicy(bp, s))),
    ...(task === 'audit' ? [] : ['- If the design is wrong or silent about something you need, stop and open a change request (`ppc change-request`); do not decide it yourself.']),
    ...(COMMANDS[task] ? ['', `The full instructions for this task are in \`${COMMANDS[task]}\`.`] : []),
  ]);

  const mine = new Set(s.components);
  const others = bp.components.map((c) => c.id).filter((c) => !mine.has(c));
  const budget = bp.budgets.max_slice_production_lines;
  const scope = outOfScope(entry.body);
  const negative = join2([
    `# Negative prompt: ${title}`,
    '',
    'Do not:',
    '',
    '## In this task',
    ...list(FORBIDDEN[task]),
    ...(['red', 'green', 'build', 'refactor'].includes(task) ? [`- Exceed ${budget} lines of production code in this slice (the budget in the blueprint).`] : []),
    '',
    `## Out of scope for this slice (\`${entry.file}\`)`,
    ...(scope.length ? list(scope) : ['- (the slice states nothing; ask before adding anything beyond its acceptance criteria)']),
    '',
    '## Non-goals of the project (`.architect/blueprint.yaml`)',
    ...list(bp.non_goals),
    '',
    '## Component boundaries',
    ...s.components.map((c) => `- ${c} may depend only on: ${comps.get(c)?.may_depend_on.length ? comps.get(c).may_depend_on.join(', ') : 'nothing'}.`),
    ...(others.length ? [`- Do not touch these components: ${others.join(', ')}.`] : []),
    '- Do not add a dependency between components that the blueprint does not list.',
    '',
    '## Decisions that belong to people',
    '- Approve anything, run `ppc approve-*` or `ppc decide-*`, or write `approved_by`, `red_approved_by`, `decided_by`, `accepted_reason`, `budget_override_reason` or `mutation_override_reason`.',
    '- Add a feature, a tool or a dependency the slice does not need. If you think one is needed, say so and stop.',
  ]);

  let design = null;
  if (needsDesign(model, s)) {
    const qas = (s.quality_attributes ?? []).map((q) => bp.quality_attributes.find((x) => x.id === q)).filter(Boolean);
    design = join2([
      `# Design prompt: ${title} (optional)`,
      '',
      'Use this only for work that touches an interface or an architectural choice. Skip it for routine work.',
      '',
      '## Components of this slice',
      ...s.components.map((c) => `- ${c} (${comps.get(c)?.kind}): ${comps.get(c)?.responsibility}`),
      ...(qas.length ? ['', '## Quality targets this slice must respect', ...qas.map((q) => `- ${q.id} ${q.attribute}: ${q.scenario} Metric: ${q.metric}. Target: ${q.target}.`)] : []),
      ...(adrs.length ? ['', '## Decisions that bind it', ...adrs.map((a) => `- ${a.data.id} ${a.data.title} (\`${a.file}\`)`)] : []),
      '',
      'Before changing an interface, say which one and what changes. If the design is wrong or silent, open a change request instead of deciding it yourself.',
    ]);
  }
  return { system, negative, design };
}

/** The slice and task to use when the caller gives none: the slice in progress, in its current phase. */
export function resolveTarget(model, id, task) {
  const open = model.slices.find((s) => s.data.status === 'in_progress');
  const slice = id ?? open?.data.id ?? fail('no slice is in progress; name a slice and a task');
  if (task) return { slice, task };
  const entry = model.slices.find((s) => s.data.id === slice) ?? fail(`unknown slice ${slice}`);
  if (entry.data.status !== 'in_progress') fail(`${slice} is ${entry.data.status}, so its task is not known; pass --task <${TASKS.join('|')}>`);
  return { slice, task: entry.data.type === 'spike' ? 'explore' : entry.data.phase };
}

/**
 * Write the parts as files under `.sddpp/prompts/<slice>/`. A person may have edited them, so existing files are
 * never overwritten unless `force` is given.
 */
export function writePrompts(root, id, task, { force = false } = {}) {
  const model = loadProject(root);
  const parts = buildPrompts(model, id, task);
  const header = `<!-- Generated by ppc from the contract (blueprint revision ${model.blueprint.data.revision}). Edit it freely; ppc will not overwrite it without --force. -->\n\n`;
  const files = Object.entries(parts)
    .filter(([, text]) => text !== null)
    .map(([part, text]) => ({ file: `.sddpp/prompts/${id}/${task}.${part}.md`, text: header + text }));
  const existing = files.filter((f) => existsSync(join(root, f.file))).map((f) => f.file);
  if (existing.length && !force) fail(`these files already exist and may hold your edits: ${existing.join(', ')}. Use --force to regenerate them.`);
  for (const f of files) {
    mkdirSync(dirname(join(root, f.file)), { recursive: true });
    writeFileSync(join(root, f.file), f.text);
  }
  return { files: files.map((f) => f.file) };
}
