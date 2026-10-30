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
  out.push('', `To keep it as debt to pay:  ppc approve ${entry.id}`, `To live with it, with a reason:  ppc approve ${entry.id} --accept "<why>"`, `To drop it:  ppc approve ${entry.id} --drop`);
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

/** The card for a slice, debt entry or change request id, or null when there is none. */
export function renderDecision(model, id, extra = {}) {
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
const SAY_NO = [
  { label: 'I want to change something', description: 'Nothing is decided; say what to change' },
  { label: 'Not yet', description: 'Leave it for later' },
];
const choose = (words, command, description) => ({ label: `${words} — ${command}`, description });

/** The panel question (the input of the AskUserQuestion tool) for a decision, or null when there is nothing to decide on that id. */
export function askFor(model, id, { redFiles } = {}) {
  const slice = model.slices.find((s) => s.data.id === id)?.data;
  if (slice?.status === 'planned') {
    return { questions: [{ question: `Approve ${id} "${slice.title}" to start?`, header: 'Slice', multiSelect: false, options: [choose('Yes, approve it', `ppc approve ${id}`, 'The slice becomes ready to start'), ...SAY_NO] }] };
  }
  if (slice?.status === 'in_progress' && slice.phase === 'red') {
    const files = redFiles?.length ? ` (${redFiles.join(', ')})` : '';
    return { questions: [{ question: `Do the red tests of ${id}${files} say what you want? They are the specification.`, header: 'Red tests', multiSelect: false, options: [choose('Yes, approve the tests', 'ppc approve', 'The slice moves to green'), ...SAY_NO] }] };
  }
  const debt = model.debt.flatMap((d) => d.data.entries).find((e) => e.id === id);
  if (debt?.status === 'proposed') {
    return { questions: [{ question: `What do we do with ${id} "${debt.title}"?`, header: 'Debt', multiSelect: false, options: [
      choose('Pay it later', `ppc approve ${id}`, 'It becomes a real debt to schedule'),
      choose('Live with it', `ppc approve ${id} --accept "${ACCEPT_REASON}"`, 'Accepted, with the reason recorded'),
      choose('Drop it', `ppc approve ${id} --drop`, 'Discarded'),
      { label: 'Not yet', description: 'Leave it for later' },
    ] }] };
  }
  const change = model.changeRequests.find((c) => c.data.id === id)?.data;
  if (change?.status === 'open') {
    return { questions: [{ question: `${id} "${change.title}": change the design as proposed?`, header: 'Change', multiSelect: false, options: [
      choose('Yes, accept it', `ppc decide-change ${id} --accept`, 'The design will be revised'),
      choose('No, reject it', `ppc decide-change ${id} --reject --reason "${REJECT_REASON}"`, 'The design stays as it is'),
      { label: 'Not yet', description: 'Leave it for later' },
    ] }] };
  }
  return null;
}
