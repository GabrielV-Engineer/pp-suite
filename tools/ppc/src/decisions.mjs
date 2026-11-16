import { execFileSync } from 'node:child_process';
import { payProblem, screenApproved } from './policy.mjs';

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
// What to read before deciding, as links the chat (and VS Code) can open: the person gets the file at once, not a path to look for.
const readList = (paths) => {
  const unique = [...new Set(paths.filter(Boolean))];
  return unique.length ? ['', 'Read:', ...unique.map((p) => `  [${p}](${p})`)] : [];
};
const bullets = (text) => text.split('\n').map((l) => l.replace(/^\s*[-*]\s*/, '').trim()).filter(Boolean);

// The debt a slice pays, and the open debt in its components that no slice pays yet: shown when it is approved, so debt meant for
// it is not forgotten (the first real project approved SL-010 17 minutes after debt meant for it, and nothing said so).
const debtEntries = (model) => model.debt.flatMap((d) => d.data.entries);
const paidBy = (model, s) => debtEntries(model).filter((e) => e.paid_by === s.id && e.status === 'scheduled');
const COST = { high: 0, medium: 1, low: 2 };
const costOf = (e) => COST[e.cost_of_delay?.level] ?? 3;
const openHere = (model, s) => (['planned', 'ready'].includes(s.status) ? debtEntries(model).filter((e) => e.status === 'open' && !payProblem(s, e)).sort((a, b) => costOf(a) - costOf(b)) : []);

function sliceCard(model, entry, { redFiles, auditInput } = {}) {
  const s = entry.data;
  const red = s.status === 'in_progress' && s.phase === 'red';
  const out = [`${s.id}  ${s.title}`, row('Kind', `${s.type}${s.mode ? `, ${s.mode} cycle` : ''}`)];
  const does = section(entry.body, 'Behavior');
  if (does) out.push(row('Does', oneLine(does)));
  const not = section(entry.body, 'Out of scope');
  if (not) out.push(row('Does not', ''), ...bullets(not).map((b) => `      - ${b}`));
  if (s.acceptance?.length) out.push(row('Checked by', ''), ...s.acceptance.map((a) => `      - ${a.id}: ${a.scenario}`));
  if (s.depends_on?.length) out.push(row('Waits for', s.depends_on.join(', ')));
  const pays = paidBy(model, s);
  if (pays.length) out.push(row('Pays', ''), ...pays.map((e) => `      - ${e.id} ${e.title}`));
  const open = openHere(model, s);
  if (open.length) {
    out.push(row('Open debt here', ''), ...open.map((e) => `      - ${e.id} ${e.title} (cost of waiting ${e.cost_of_delay?.level ?? 'unknown'})`));
    // Only a medium or high cost of waiting is put to the person before every approval; asking about all of it each time would
    // teach them to answer "not yet" without reading.
    const urgent = open.filter((e) => costOf(e) <= COST.medium);
    if (urgent.length) out.push(`      Ask before approving it:  ${urgent.map((e) => `ppc ask ${e.id} --pay-in ${s.id}`).join('  ·  ')}`);
  }
  if (red) {
    out.push('', `The red tests are the specification of this slice: approve them only if they say what you want.`, row('Red tests', (redFiles?.length ? redFiles : ['(none found in the red commit)']).join(', ')));
    out.push(...readList([...(redFiles ?? []), entry.file]));
    out.push('', 'To approve them:  ppc approve');
  } else {
    out.push(...readList([entry.file, s.status === 'in_progress' && auditInput ? AUDIT_INPUT : null]));
    if (s.status === 'planned') out.push('', `To approve it to start:  ppc approve ${s.id}`);
  }
  return out.join('\n');
}

function debtCard(register, entry) {
  const out = [`${entry.id}  ${entry.title}`, row('Component', entry.component), row('What', oneLine(entry.description ?? ''))];
  if (entry.cost_of_delay) out.push(row('Cost of waiting', `${entry.cost_of_delay.level} — ${entry.cost_of_delay.rationale}`));
  if (entry.trigger) out.push(row('Look again', entry.trigger));
  out.push(...readList([register.file]));
  out.push('', `To keep it as debt to pay:  ppc approve ${entry.id}`, `To live with it, with a reason:  ppc approve ${entry.id} --accept "<why>"`, `To drop it:  ppc approve ${entry.id} --drop --reason "<why>"`);
  return out.join('\n');
}

function screenCard(model, s) {
  const out = [`${s.id}  ${s.name}`, row('Shows', s.capabilities.join(', ')), row('States', s.states.join(', '))];
  const approved = screenApproved(model, s);
  out.push(row('Approved', approved ? `by ${s.approved_by}` : s.approved_by ? `by ${s.approved_by}, but it changed since` : 'not yet'));
  out.push('', 'Open the mockup in a browser and look at every state before deciding.');
  out.push(...readList([s.mockup, s.image, model.ui.file]));
  if (!approved) out.push('', `To approve it as the reference the slices build to:  ppc approve ${s.id}`);
  return out.join('\n');
}
const screenOf = (model, id) => model.ui?.data?.screens?.find?.((s) => s.id === id);

function changeCard(model, entry) {
  const out = [`${entry.data.id}  ${entry.data.title}`, row('Raised by', entry.data.raised_by), row('Status', entry.data.status)];
  const problem = section(entry.body, 'Problem');
  if (problem) out.push(row('Problem', oneLine(problem)));
  const proposal = section(entry.body, 'Proposal');
  if (proposal) out.push(row('Proposal', oneLine(proposal)));
  // the request, then the parts of the design it would change: the blueprint holds the quality attributes, budgets and
  // components; architecture.md describes the components; each decision has its own file
  const affects = entry.data.affects ?? {};
  const adrs = (affects.adrs ?? []).map((id) => model.adrs.find((a) => a.data.id === id)?.file);
  out.push(...readList([entry.file, model.blueprint?.file, affects.components?.length ? '.architect/architecture.md' : null, ...adrs]));
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
  out.push(...readList([...model.changeRequests.filter((c) => changes.includes(c.data)).map((c) => c.file), model.blueprint.file]));
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
  if (slice) return `${sliceCard(model, slice, extra)}\n`;
  for (const register of model.debt) {
    const entry = register.data.entries.find((e) => e.id === id);
    if (entry) return `${debtCard(register, entry)}\n`;
  }
  const shown = screenOf(model, id);
  if (shown) return `${screenCard(model, shown)}\n`;
  const change = model.changeRequests.find((c) => c.data.id === id);
  return change ? `${changeCard(model, change)}\n` : null;
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
export function askFor(model, id, { redFiles, budgetReason, mutationReason, payIn, addComponent } = {}) {
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
  if (slice && addComponent !== undefined) {
    if (['done', 'dropped'].includes(slice.status) || slice.components.includes(addComponent)) return null;
    if (!model.blueprint?.data.components.some((c) => c.id === addComponent)) throw new DecisionError(`--add-component: unknown component ${addComponent}`);
    return { questions: [{ question: `${id} "${slice.title}" needs ${addComponent} too. Add it to the slice?`, header: 'Slice', multiSelect: false, options: [
      choose(`Yes, add ${addComponent}`, `ppc widen ${id} --component ${addComponent}`, `The slice may change ${addComponent}'s files; the design does not change`),
      { label: 'No', description: 'The slice stays as it is: the work is done without that component, or the slice is split' },
      { label: 'Not yet', description: 'Nothing is decided; it waits for you' },
    ] }] };
  }
  if (slice?.status === 'planned') {
    const pays = paidBy(model, slice).map((e) => e.id);
    const also = pays.length ? ` It also pays ${pays.join(', ')}.` : '';
    return { questions: [{ question: `Approve ${id} "${slice.title}" to start?${also}`, header: 'Slice', multiSelect: false, options: [choose('Yes, approve it', `ppc approve ${id}`, 'It becomes ready, and the build can start'), ...SAY_NO] }] };
  }
  if (slice?.status === 'in_progress' && slice.phase === 'red') {
    const files = redFiles?.length ? ` (${redFiles.join(', ')})` : '';
    return { questions: [{ question: `Do the red tests of ${id}${files} say what you want? They are the specification.`, header: 'Red tests', multiSelect: false, options: [choose('Yes, approve the tests', 'ppc approve', 'The tests are locked and the code is written to pass them (green)'), ...SAY_NO] }] };
  }
  const debt = model.debt.flatMap((d) => d.data.entries).find((e) => e.id === id);
  if (debt && payIn !== undefined) {
    // The slice that will pay it, proposed by the agent: offered in place of "pay it later", which leaves debt tied to no slice.
    const payer = model.slices.find((s) => s.data.id === payIn)?.data;
    if (!payer) throw new DecisionError(`--pay-in: unknown slice ${payIn}`);
    if (!['proposed', 'open', 'scheduled'].includes(debt.status)) return null;
    const problem = payProblem(payer, debt);
    if (problem) throw new DecisionError(`--pay-in: ${problem}`);
    if (debt.status === 'scheduled') {
      if (debt.paid_by === payIn) return null;
      return { questions: [{ question: `Move ${id} "${debt.title}" from ${debt.paid_by} to ${payIn} "${payer.title}"?`, header: 'Debt', multiSelect: false, options: [
        choose(`Yes, ${payIn} pays it`, `ppc schedule-debt ${id} --slice ${payIn}`, `${debt.paid_by} no longer pays it; ${payIn} does, and its audit says whether it was paid`),
        { label: 'Not yet', description: `It stays with ${debt.paid_by}` },
      ] }] };
    }
    const pays = `${payIn} pays it: fixing it is part of that slice, and when it closes its audit says whether it was paid`;
    if (debt.status === 'open') {
      return { questions: [{ question: `Pay ${id} "${debt.title}" in ${payIn} "${payer.title}"?`, header: 'Debt', multiSelect: false, options: [
        choose(`Yes, ${payIn} pays it`, `ppc schedule-debt ${id} --slice ${payIn}`, pays),
        { label: 'Not yet', description: 'It stays open, tied to no slice' },
      ] }] };
    }
    return { questions: [{ question: `What do we do with ${id} "${debt.title}"?`, header: 'Debt', multiSelect: false, options: [
      choose(`Pay it in ${payIn}`, `ppc approve ${id} --pay-in ${payIn}`, pays),
      choose('Live with it', `ppc approve ${id} --accept "${ACCEPT_REASON}"`, 'Accepted for good: it is recorded and will not be paid'),
      choose('Drop it', `ppc approve ${id} --drop --reason "${DROP_REASON}"`, 'Discarded: it was not a real debt'),
      { label: 'Not yet', description: 'Nothing is decided; it waits for you' },
    ] }] };
  }
  if (debt?.status === 'open') {
    // An open entry a later decision made moot can still be closed (F-D9); to tie it to a slice, ask with --pay-in.
    return { questions: [{ question: `${id} "${debt.title}" is open debt. Keep it open, live with it, or drop it?`, header: 'Debt', multiSelect: false, options: [
      choose('Live with it', `ppc approve ${id} --accept "${ACCEPT_REASON}"`, 'Accepted for good: it is recorded and will not be paid'),
      choose('Drop it', `ppc approve ${id} --drop --reason "${DROP_REASON}"`, 'Discarded: a later decision covers it, or it was not a real debt'),
      { label: 'Keep it open', description: 'Nothing changes; it waits for a slice to pay it' },
    ] }] };
  }
  if (debt?.status === 'proposed') {
    return { questions: [{ question: `What do we do with ${id} "${debt.title}"?`, header: 'Debt', multiSelect: false, options: [
      choose('Pay it later', `ppc approve ${id}`, 'Open debt: it stays on the list, to be scheduled and paid'),
      choose('Live with it', `ppc approve ${id} --accept "${ACCEPT_REASON}"`, 'Accepted for good: it is recorded and will not be paid'),
      choose('Drop it', `ppc approve ${id} --drop --reason "${DROP_REASON}"`, 'Discarded: it was not a real debt'),
      { label: 'Not yet', description: 'Nothing is decided; it waits for you' },
    ] }] };
  }
  const shown = screenOf(model, id);
  if (shown) {
    if (screenApproved(model, shown)) return null;
    return { questions: [{ question: `Approve the mockup of ${id} "${shown.name}" (${shown.mockup}) as the reference the slices build to?`, header: 'Screen', multiSelect: false, options: [
      // the answer names the mockup the person saw: if it changes before the command runs, ppc approve refuses (F-D15)
      choose('Yes, approve it', `ppc approve ${id} --mockup ${String(model.uiFiles?.[shown.mockup] ?? '').slice(0, 12)}`, 'It becomes the reference: every slice on this screen is built and checked against it'), ...SAY_NO] }] };
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
