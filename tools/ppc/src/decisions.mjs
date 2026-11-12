import { execFileSync } from 'node:child_process';

// The card of one thing a person decides, in plain words: what it is and what approving it means. `ppc show <id>` prints it and
// the `/pp` skill shows it in the chat before asking. Pure over the loaded model, except the red tests, whose files come from
// git and are handed in.

const row = (label, text) => `  ${`${label}:`.padEnd(17)}${text}`;

/** The text under `## <name>` in a markdown body, trimmed; undefined when there is no such section. */
function section(body, name) {
  const match = new RegExp(`^## ${name}\\s*\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm').exec(body ?? '');
  return match?.[1].trim() || undefined;
}
const oneLine = (text) => text.replace(/\s*\n\s*/g, ' ');
const bullets = (text) => text.split('\n').map((l) => l.replace(/^\s*[-*]\s*/, '').trim()).filter(Boolean);

function sliceCard(entry, { redFiles } = {}) {
  const s = entry.data;
  const red = s.status === 'in_progress' && s.phase === 'red';
  const out = [`${s.id}  ${s.title}`, row('Kind', `${s.type}${s.mode ? `, ${s.mode} cycle` : ''}`)];
  const does = section(entry.body, 'Behavior');
  if (does) out.push(row('Does', oneLine(does)));
  const not = section(entry.body, 'Out of scope');
  if (not) out.push(row('Does not', ''), ...bullets(not).map((b) => `      - ${b}`));
  if (s.acceptance?.length) out.push(row('Checked by', ''), ...s.acceptance.map((a) => `      - ${a.id}: ${a.scenario}`));
  if (s.depends_on?.length) out.push(row('Waits for', s.depends_on.join(', ')));
  if (red) {
    out.push('', `The red tests are the specification of this slice: approve them only if they say what you want.`, row('Red tests', (redFiles?.length ? redFiles : ['(none found in the red commit)']).join(', ')));
    out.push('', 'To approve them:  ppc approve');
  } else {
    out.push('', `To approve it to start:  ppc approve ${s.id}`);
  }
  return out.join('\n');
}

function debtCard(register, entry) {
  const out = [`${entry.id}  ${entry.title}`, row('Component', entry.component), row('What', oneLine(entry.description ?? ''))];
  if (entry.cost_of_delay) out.push(row('Cost of waiting', `${entry.cost_of_delay.level} — ${entry.cost_of_delay.rationale}`));
  if (entry.trigger) out.push(row('Look again', entry.trigger));
  out.push('', `To keep it as debt to pay:  ppc approve ${entry.id}`, `To live with it, with a reason:  ppc approve ${entry.id} --accept "<why>"`, `To drop it:  ppc approve ${entry.id} --drop --reason "<why>"`);
  return out.join('\n');
}

function changeCard(entry) {
  const out = [`${entry.data.id}  ${entry.data.title}`, row('Raised by', entry.data.raised_by), row('Status', entry.data.status)];
  const problem = section(entry.body, 'Problem');
  if (problem) out.push(row('Problem', oneLine(problem)));
  const proposal = section(entry.body, 'Proposal');
  if (proposal) out.push(row('Proposal', oneLine(proposal)));
  out.push('', `To accept it:  ppc decide-change ${entry.data.id} --accept`, `To reject it:  ppc decide-change ${entry.data.id} --reject --reason "<why>"`);
  return out.join('\n');
}

function rereadCard(model) {
  const revision = model.blueprint.data.revision;
  const behind = model.slices.map((s) => s.data).filter((s) => !['done', 'dropped'].includes(s.status) && s.blueprint_revision < revision);
  if (!behind.length) return null;
  const oldest = Math.min(...behind.map((s) => s.blueprint_revision));
  const changes = model.changeRequests.map((c) => c.data).filter((c) => c.status === 'applied' && (c.blueprint_revision ?? 0) >= oldest);
  const out = [`The design is at revision ${revision}; ${behind.length} slice${behind.length === 1 ? '' : 's'} were planned against an older one`];
  out.push(row('Changed since', changes.length ? '' : 'a revision without an applied change request (see the design)'), ...changes.map((c) => `      - ${c.id}: ${c.title}`));
  out.push(row('Slices behind', behind.map((s) => `${s.id} (revision ${s.blueprint_revision})`).join(', ')));
  out.push('', 'Reading them means you looked at what changed and the slices still fit.', '', 'To say so for all of them:  ppc reread --all', 'For some:  ppc reread SL-003 SL-004');
  return out.join('\n');
}

/** The card for a slice, debt entry or change request id, or null when there is none. The word `reread` is the slices behind the design. */
export function renderDecision(model, id, extra = {}) {
  if (id === 'reread') {
    const card = rereadCard(model);
    return card ? `${card}\n` : null;
  }
  const slice = model.slices.find((s) => s.data.id === id);
  if (slice) return `${sliceCard(slice, extra)}\n`;
  for (const register of model.debt) {
    const entry = register.data.entries.find((e) => e.id === id);
    if (entry) return `${debtCard(register, entry)}\n`;
  }
  const change = model.changeRequests.find((c) => c.data.id === id);
  return change ? `${changeCard(change)}\n` : null;
}

/** The files the red commit of a slice changed, or [] when there is none or this is not a git repository. */
export function redCommitFiles(root, id) {
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  try {
    const line = git('log', '--format=%H %s').split('\n').find((l) => l.slice(41).startsWith(`red(${id})`));
    if (!line) return [];
    return git('diff-tree', '--no-commit-id', '--name-only', '-r', '--root', line.slice(0, 40)).split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

// ── the question for the panel ───────────────────────────────────
// The option that carries out a decision ends with ` — <the exact command>`. A person who picks it is choosing that command, and
// the guard (sddpp-guard) lets exactly that command through once. Words before the dash may be put in the person's language;
// the command may not change. The reasons recorded by the debt and change options are fixed text: the panel cannot carry free text.
export const ACCEPT_REASON = 'accepted in the panel';
export const REJECT_REASON = 'rejected in the panel';
export const DROP_REASON = 'dropped in the panel';
const SAY_NO = [
  { label: 'I want to change something', description: 'Nothing is decided yet; say what to change and it is redone' },
  { label: 'Not yet', description: 'Nothing is decided; it waits for you' },
];
const choose = (words, command, description) => ({ label: `${words} — ${command}`, description });
export class DecisionError extends Error {}
// The audit input the audit skill writes; `ppc finish` reads it.
export const AUDIT_INPUT = '.sddpp/audit-input.json';

/** A reason that a label can carry as one quoted argument, or an error that says why not. */
function carried(flag, reason) {
  if (reason === undefined) return '';
  if (reason.includes('"')) throw new DecisionError(`${flag}: the reason cannot contain a double quote; reword it`);
  if (reason.trim().length < 10) throw new DecisionError(`${flag}: the reason needs at least 10 characters`);
  return ` ${flag} "${reason.trim()}"`;
}

/** The panel question (the input of the AskUserQuestion tool) for a decision, or null when there is nothing to decide on that id. */
export function askFor(model, id, { redFiles, budgetReason, mutationReason } = {}) {
  if (id === 'reread') {
    const behind = model.slices.map((s) => s.data).filter((s) => !['done', 'dropped'].includes(s.status) && s.blueprint_revision < model.blueprint.data.revision);
    if (!behind.length) return null;
    return { questions: [{ question: `The design changed after ${behind.length} slice${behind.length === 1 ? ' was' : 's were'} planned (${behind.map((s) => s.id).join(', ')}). Did you read what changed, and do they still fit?`, header: 'Design', multiSelect: false, options: [choose('Yes, I read it', 'ppc reread --all', 'The slices count as planned against the current design, and the warning goes away'), ...SAY_NO] }] };
  }
  const slice = model.slices.find((s) => s.data.id === id)?.data;
  if (budgetReason !== undefined || mutationReason !== undefined) {
    // An exception to a rule is recorded by `ppc finish`; the reason is the one the agent proposes and the person sees in full.
    const flags = carried('--budget-reason', budgetReason) + carried('--mutation-reason', mutationReason);
    if (slice?.status !== 'in_progress') return null;
    const what = [budgetReason && `the size budget ("${budgetReason.trim()}")`, mutationReason && `the mutation score ("${mutationReason.trim()}")`].filter(Boolean).join(' and ');
    return { questions: [{ question: `${id} "${slice.title}" can close only with an exception to ${what}. Record it?`, header: 'Exception', multiSelect: false, options: [
      choose('Yes, record the exception', `ppc finish ${id} --audit ${AUDIT_INPUT}${flags}`, 'The slice closes, with this reason recorded in its audit'),
      { label: 'No', description: 'It stays open: split it, or change the code until it fits' },
      { label: 'Not yet', description: 'Nothing is decided; it waits for you' },
    ] }] };
  }
  if (slice?.status === 'planned') {
    return { questions: [{ question: `Approve ${id} "${slice.title}" to start?`, header: 'Slice', multiSelect: false, options: [choose('Yes, approve it', `ppc approve ${id}`, 'It becomes ready, and the build can start'), ...SAY_NO] }] };
  }
  if (slice?.status === 'in_progress' && slice.phase === 'red') {
    const files = redFiles?.length ? ` (${redFiles.join(', ')})` : '';
    return { questions: [{ question: `Do the red tests of ${id}${files} say what you want? They are the specification.`, header: 'Red tests', multiSelect: false, options: [choose('Yes, approve the tests', 'ppc approve', 'The tests are locked and the code is written to pass them (green)'), ...SAY_NO] }] };
  }
  const debt = model.debt.flatMap((d) => d.data.entries).find((e) => e.id === id);
  if (debt?.status === 'proposed') {
    return { questions: [{ question: `What do we do with ${id} "${debt.title}"?`, header: 'Debt', multiSelect: false, options: [
      choose('Pay it later', `ppc approve ${id}`, 'Open debt: it stays on the list, to be scheduled and paid'),
      choose('Live with it', `ppc approve ${id} --accept "${ACCEPT_REASON}"`, 'Accepted for good: it is recorded and will not be paid'),
      choose('Drop it', `ppc approve ${id} --drop --reason "${DROP_REASON}"`, 'Discarded: it was not a real debt'),
      { label: 'Not yet', description: 'Nothing is decided; it waits for you' },
    ] }] };
  }
  const change = model.changeRequests.find((c) => c.data.id === id)?.data;
  if (change?.status === 'open') {
    return { questions: [{ question: `${id} "${change.title}": change the design as proposed?`, header: 'Change', multiSelect: false, options: [
      choose('Yes, accept it', `ppc decide-change ${id} --accept`, 'The design is revised as proposed, then the paused slice continues'),
      choose('No, reject it', `ppc decide-change ${id} --reject --reason "${REJECT_REASON}"`, 'The design stays as it is; the slice goes on without the change'),
      { label: 'Not yet', description: 'Nothing is decided; it waits for you' },
    ] }] };
  }
  return null;
}
