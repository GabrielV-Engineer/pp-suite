import { execFileSync } from 'node:child_process';
import { payProblem, screenApproved } from './policy.mjs';
import { glanceStandard, lookAt } from './glance.mjs';
import { openReviews, modesFor, pendingReviews } from './review.mjs';
import { pendingOutside, renderGuide } from './guide.mjs';
import { SURFACES, surfacesFor } from './rubric.mjs';
import { ROLES, TRIGGERS as TOOL_TRIGGERS, toolFromFlags } from './tools.mjs';
import { STANDARDS, BY_ID, CUSTOM, TRIGGERS, recommend, renderStandards, describeAnswer, projectFacts, standardsFor } from './standards.mjs';

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
  // the standards the person adopted that apply to what this slice touches (docs/standards.md)
  const kindOf = new Map((model.blueprint?.data.components ?? []).map((c) => [c.id, c.kind]));
  const applying = standardsFor(model.standards?.data?.standards ?? [], new Set((s.components ?? []).map((c) => kindOf.get(c))));
  if (applying.length) out.push(row('Standards', ''), ...applying.map((a) => `      - ${a.id} ${a.text}`));
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
    // the glance (docs/standards.md, "Experience"): what a person looks at in a closed slice, and how to say they did
    if (s.status === 'done' && !s.glanced_by && glanceStandard(model)) {
      out.push('', 'Look at:', ...lookAt(model, s).map((l) => `  - ${l}`), '', `To say you looked:  ppc glance ${s.id}   (or --skip, if you will not)`);
    }
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
const standardsOf = (model) => model.standards?.data?.standards ?? [];
const factsOf = (model) => model.facts ?? (model.root ? projectFacts(model.root) : {});
const recommendedOf = (model) => recommend(model.blueprint.data, factsOf(model));
const undecidedStandards = (model) => STANDARDS.filter((s) => !standardsOf(model).some((x) => x.id === s.id && x.decision !== 'pending'));

// How a review is done: the person's choice, asked each time (docs/standards.md, "Experience")
const MODE_WORDS = {
  explain: ['Explain first, then do it', 'The agent tells you what it will check and how, and then checks it'],
  guide: ['Guide me, I will try it', 'You are told what to try and with which tools, and you try it; nothing is run for you'],
  delegate: ['Do it for me', 'The agent inspects it by itself and reports; anything it would install is asked about first (the list of tools you allow is planned, not built)'],
};

/** What a review of a capability (or of the project, with `project`) covers: its closed slices and the surfaces a person meets in them. */
function reviewScope(model, scope) {
  const built = model.slices.map((s) => s.data).filter((s) => s.status === 'done' && (scope === 'project' || s.capability === scope));
  const kindOf = new Map((model.blueprint?.data.components ?? []).map((c) => [c.id, c.kind]));
  return { built, surfaces: surfacesFor(built.flatMap((s) => (s.components ?? []).map((c) => kindOf.get(c)))) };
}

function reviewCard(model, scope) {
  const { built, surfaces } = reviewScope(model, scope);
  if (!built.length) return null;
  const cap = model.blueprint.data.capabilities.find((c) => c.id === scope);
  const start = scope === 'project' ? 'ppc review --project' : `ppc review ${scope}`;
  return [
    scope === 'project' ? 'Review of the whole project' : `${scope}  ${cap?.name ?? ''}`.trimEnd(),
    row('Closed slices', built.map((s) => `${s.id} "${s.title}"`).join(', ')),
    row('The review covers', surfaces.length ? surfaces.map((s) => SURFACES[s].title).join(', ') : 'nothing a person meets here yet: add a surface with --surface cli or --surface docs'),
    row('What it is', 'The whole, judged against a short rubric (ppc rubric), where each criterion says its source. A fresh agent session answers it and proposes each finding as technical debt; you decide on that debt as on any other. It holds nothing up.'),
    row('Ways to do it', ''),
    ...modesFor(model).map((m) => `      - ${m}: ${MODE_WORDS[m][1]}`),
    '', `To start it:  ${start} --mode <${modesFor(model).join('|')}>   (ppc ask ${scope === 'project' ? 'review' : scope} puts the choice to you)`,
  ].join('\n');
}

function askReview(model, id) {
  const scope = id === 'review' ? 'project' : id;
  if (scope === 'project' ? !reviewScope(model, scope).built.length || openReviews(model).some((r) => r.scope.type === 'project') : !pendingReviews(model).some((c) => c.id === scope)) return null;
  const base = scope === 'project' ? 'ppc review --project' : `ppc review ${scope}`;
  const what = scope === 'project' ? 'the whole project' : `${scope} "${model.blueprint.data.capabilities.find((c) => c.id === scope)?.name}", now complete,`;
  return { questions: [{ question: `Review ${what} as a person would meet it? Choose how it is done.`, header: 'Review', multiSelect: false, options: [
    ...modesFor(model).map((m) => choose(MODE_WORDS[m][0], `${base} --mode ${m}`, MODE_WORDS[m][1])),
    { label: 'Not yet', description: 'Nothing is decided; it waits for you' },
  ] }] };
}

/** A review in plain words; when it waits for an outside test, with the guide. */
function reviewStatusCard(model, r) {
  const out = [
    `${r.id}  Review of ${r.scope.type === 'project' ? 'the whole project' : r.scope.ref}`,
    row('Mode', `${r.mode}, chosen by ${r.mode_chosen_by}`),
    row('Surfaces', r.surfaces.map((s) => SURFACES[s].title).join(', ')),
    row('State', r.status === 'closed' ? `closed ${r.closed_on}` : 'open: /pp-experience carries it out'),
    ...(r.findings?.length ? [row('Findings', r.findings.join(', '))] : []),
    ...(r.outside_by ? [row('Outside test', `${r.outside_skipped ? 'skipped' : 'done'} (${r.outside_by}, ${r.outside_on})`)] : []),
  ];
  if (pendingOutside(model).some((x) => x.id === r.id)) out.push('', renderGuide(model, r).trimEnd());
  return out.join('\n');
}

export function renderDecision(model, id, extra = {}) {
  if (id === 'standards' || BY_ID.has(id)) {
    if (!model.blueprint) return null;
    return renderStandards(standardsOf(model), recommendedOf(model), { bp: model.blueprint.data, facts: factsOf(model), only: id === 'standards' ? undefined : id });
  }
  if (id === 'reread') {
    const card = rereadCard(model);
    return card ? `${card}\n` : null;
  }
  if (id === 'review' || (/^CAP-\d{3}$/.test(id) && pendingReviews(model).some((c) => c.id === id))) {
    const card = reviewCard(model, id === 'review' ? 'project' : id);
    return card ? `${card}\n` : null;
  }
  const review = (model.reviews ?? []).find((r) => r.data.id === id);
  if (review) return `${reviewStatusCard(model, review.data)}\n`;
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
export const NOT_NEEDED_REASON = 'not needed, decided in the panel';
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
/** The command that records one answer for a standard. */
function standardCommand(id, answer) {
  if (answer.decision === 'adopt') return `ppc decide-standard ${id} --adopt ${answer.choice}`;
  if (answer.decision === 'later') return `ppc decide-standard ${id} --later --trigger ${answer.trigger}`;
  return `ppc decide-standard ${id} --not-needed --reason "${answer.reason}"`;
}

/** A one-line value that can ride in a quoted argument of the command, or an error that says why not. */
function carriedValue(flag, value, { min, max }) {
  const text = String(value).trim();
  if (text.includes('"') || /[\r\n]/.test(text)) throw new DecisionError(`${flag}: it cannot contain a double quote or a line break`);
  if (text.length < min || text.length > max) throw new DecisionError(`${flag}: it needs ${min} to ${max} characters`);
  return text;
}

/** The panel questions about what the experience standard carries: the command that measures, the tools the agent may use. */
function askExperienceExtras(model, { measure, tools, addTool }) {
  const own = standardsOf(model).find((x) => x.id === 'experience' && x.decision === 'adopt');
  if (!own) return null;
  const No = { label: 'No', description: 'Nothing is decided; it waits for you' };
  if (measure !== undefined) {
    const command = carriedValue('--measure', measure, { min: 3, max: 300 });
    return { questions: [{ question: `Record \`${command}\` as how this project measures its quality targets? The audit of a slice will run it, so read it first.`, header: 'Experience', multiSelect: false, options: [
      choose('Yes, record it', `ppc decide-standard experience --measure "${command}"`, 'The audit of each slice runs it and records the numbers against the quality targets; you can change it later'), No] }] };
  }
  if (tools !== undefined) {
    const names = String(tools).split(',').map((t) => carriedValue('--tools', t, { min: 2, max: 80 }));
    return { questions: [{ question: `Allow the agent to use ${names.join(', ')}? pp-suite did not verify them: the agent names them from its own knowledge. Each is run temporarily, outside the repository, and is never added to its dependencies.`, header: 'Experience', multiSelect: false, options: [
      choose('Yes, allow them', `ppc decide-standard experience --tools "${names.join(',')}"`, 'This becomes the list; a tool outside it is asked about each time'), No] }] };
  }
  const name = carriedValue('--add-tool', addTool, { min: 2, max: 80 });
  if (own.allowed_tools?.includes(name)) return null;
  return { questions: [{ question: `The agent wants to use ${name}, which is not on your list. pp-suite did not verify it. Use it once, add it to the list, or not at all?`, header: 'Experience', multiSelect: false, options: [
    { label: 'Use it once, do not add it', description: 'The agent runs it temporarily, outside the repository, and nothing is recorded' },
    choose('Add it to the list', `ppc decide-standard experience --add-tool "${name}"`, 'It may be used from now on, still only temporarily and outside the repository'),
    { label: 'No, do not use it', description: 'The agent goes on without it, or says what it could not check' }] }] };
}

/** The panel question for every undecided standard at once, or for one; the recommendation always first. */
function askStandards(model, id, details, extras = {}) {
  if (id === 'experience' && Object.values(extras).some((x) => x !== undefined)) return askExperienceExtras(model, extras);
  if (!model.blueprint) return null;
  const recommended = recommendedOf(model);
  if (id === 'standards') {
    const left = undecidedStandards(model);
    if (!left.length) return null;
    const list = left.map((s) => `${s.id} ${describeAnswer(recommended[s.id])}`).join('; ');
    return { questions: [{ question: `How should this project handle ${left.map((s) => s.id).join(', ')}? Recommended from the design and the repository: ${list}.`, header: 'Standards', multiSelect: false, options: [
      choose('Take the recommendations', 'ppc decide-standard --accept-recommended', 'Each undecided standard is recorded as recommended; any of them can be changed later'),
      { label: 'One by one', description: 'Nothing is decided yet; each standard is asked on its own, with its choices' },
      { label: 'Not yet', description: 'Nothing is decided; it waits for you' },
    ] }] };
  }
  const spec = BY_ID.get(id);
  if (details !== undefined) {
    const carriedDetails = carried('--details', details).replace(/^ --details /, '');
    return { questions: [{ question: `Record ${id} as your own rule: ${details.trim()}?`, header: spec.title.slice(0, 12), multiSelect: false, options: [
      choose('Yes, record it', `ppc decide-standard ${id} --adopt ${CUSTOM} --details ${carriedDetails}`, 'It becomes the project\'s standard for this, in your words'),
      { label: 'No', description: 'Nothing is decided; it waits for you' },
    ] }] };
  }
  const rec = recommended[id];
  const answers = [
    ...Object.keys(spec.choices).map((choice) => ({ decision: 'adopt', choice })),
    ...(spec.product ? [{ decision: 'not_needed', reason: rec.decision === 'not_needed' ? rec.reason : NOT_NEEDED_REASON }] : []),
    ...(rec.decision === 'later' ? [rec] : []),
  ];
  const same = (a) => a.decision === rec.decision && a.choice === rec.choice && a.trigger === rec.trigger;
  const ordered = [...answers.filter(same), ...answers.filter((a) => !same(a))];
  const words = (a) => (a.decision === 'adopt' ? a.choice : a.decision === 'later' ? `Later, when ${TRIGGERS[a.trigger]}` : 'Not needed');
  const meaning = (a) => (a.decision === 'adopt' ? spec.choices[a.choice] : a.decision === 'later' ? 'Nothing is adopted now; ppc next asks again when that happens' : `Recorded with the reason "${a.reason}"`);
  const options = ordered.map((a, i) => choose(`${words(a)}${i === 0 ? ' (recommended)' : ''}`, standardCommand(id, a), i === 0 ? `${meaning(a)}. ${rec.why}` : meaning(a)));
  const kept = options.slice(0, 3);
  // four at most: the person's own rule goes through "Other" (then `ppc ask <standard> --details "..."`)
  const now = standardsOf(model).find((x) => x.id === id && x.decision !== 'pending');
  const current = now ? ` Now: ${describeAnswer(now)} (changing it keeps this in its history).` : '';
  return { questions: [{ question: `${spec.title}: how should this project handle it?${current} Choose Other to describe your own rule or tool.`, header: spec.title.slice(0, 12), multiSelect: false, options: [...kept, options[3] ?? { label: 'Not yet', description: 'Nothing is decided; it waits for you' }] }] };
}

/** One line for a role's decision, as the question shows what stands now. */
const toolWords = (e) => (e.decision === 'adopt' ? `${e.tool.name} (${e.tool.kind})` : e.decision === 'later' ? `later, when ${TOOL_TRIGGERS[e.trigger]}` : `not needed: ${e.reason}`);

/**
 * The panel question for a role's tool. With no tool named, the choices that need none (not needed, not yet): a tool is named through
 * Other, and the agent comes back with it. With one, a confirmation that carries the exact command and what pp-suite found on this
 * machine (`installed`: true, false, or undefined when nobody looked). The name the agent brings is its own suggestion, never verified.
 */
function askTool(model, id, { tool, kind, source, pinned, access, accessReason, installed }) {
  if (!model.blueprint) return null;
  const role = ROLES.find((r) => r.id === id);
  const stands = (model.tools?.data.tools ?? []).find((e) => e.role === id && e.decision !== 'pending');
  const header = role.title.slice(0, 12);
  const No = { label: 'No', description: 'Nothing is decided; it waits for you' };
  if (tool === undefined) {
    const now = stands ? ` Now: ${toolWords(stands)} (deciding again keeps this in its history).` : '';
    return { questions: [{ question: `${role.title}: does this project need a tool for it?${now} To use one, choose Other and name it; the agent then puts it here to confirm.`, header, multiSelect: false, options: [
      choose('Not needed', `ppc decide-tool ${id} --not-needed --reason "${NOT_NEEDED_REASON}"`, `Recorded as not needed for ${role.title.toLowerCase()}, with your name and the date; you can decide again later`),
      { label: 'Not yet', description: 'Nothing is decided; it waits for you' }] }] };
  }
  const named = toolFromFlags({ adopt: tool, kind, source, pinned, access, accessReason }, (message) => {
    throw new DecisionError(message);
  });
  if (named.source) named.source = carriedValue('--source', named.source, { min: 3, max: 300 });
  if (named.access_reason) named.access_reason = carriedValue('--access-reason', named.access_reason, { min: 5, max: 200 });
  if (stands?.decision === 'adopt' && JSON.stringify(stands.tool) === JSON.stringify(named)) return null;
  const command = ['ppc decide-tool', id, '--adopt', named.name, '--kind', named.kind, named.source && `--source "${named.source}"`, named.pinned && `--pinned ${named.pinned}`, named.access && `--access ${named.access}`, named.access_reason && `--access-reason "${named.access_reason}"`].filter(Boolean).join(' ');
  const facts = [
    installed === true ? `It is on this machine.` : installed === false ? `pp-suite did not find it on this machine: the agent named it from its own knowledge, which pp-suite did not verify. You would install it first, then restart the session.` : '',
    named.source ? `Source: ${named.source}${named.pinned ? `, ${named.pinned}` : ''}.` : named.pinned ? `Pinned: ${named.pinned}.` : '',
    named.access === 'read-only' ? 'It may only read.' : named.access === 'read-write' ? `It may change things: ${named.access_reason}.` : '',
  ].filter(Boolean).join(' ');
  const now = stands ? ` Now: ${toolWords(stands)} (changing it keeps this in its history).` : '';
  return { questions: [{ question: `Use ${named.name} (${named.kind}) for ${role.title.toLowerCase()} in this project?${now} ${facts}`.trim(), header, multiSelect: false, options: [
    choose('Yes, use it', command, 'Recorded in .sddpp/tools.yaml with your name and the date; the slices that call for this role will name it'),
    No] }] };
}

export function askFor(model, id, { redFiles, budgetReason, mutationReason, payIn, addComponent, details, measure, tools, addTool, tool, kind, source, pinned, access, accessReason, installed } = {}) {
  if (ROLES.some((r) => r.id === id)) return askTool(model, id, { tool, kind, source, pinned, access, accessReason, installed });
  if (id === 'standards' || BY_ID.has(id)) return askStandards(model, id, details, { measure, tools, addTool });
  if (id === 'review' || /^CAP-\d{3}$/.test(id)) return askReview(model, id);
  if (/^RV-\d{3,}$/.test(id)) {
    if (!pendingOutside(model).some((r) => r.id === id)) return null;
    return { questions: [{ question: `Did someone other than you try what ${id} reviewed? It is your decision who, and whether; skipping it holds nothing up.`, header: 'Outside test', multiSelect: false, options: [
      choose('Yes, someone tried it', `ppc outside ${id}`, 'Recorded with your name and the date; add --note in the terminal if you want to say who and how it went'),
      choose('I will not do this one', `ppc outside ${id} --skip`, 'Recorded as skipped, with your name and the date; it is not asked again for this review'),
      { label: 'Not yet', description: 'Nothing is recorded; it stays waiting for you' },
    ] }] };
  }
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
  if (slice?.status === 'done' && !slice.glanced_by) {
    return { questions: [{ question: `Did you look at what ${id} "${slice.title}" built, as a user would meet it?`, header: 'Glance', multiSelect: false, options: [
      choose('Yes, I looked at it', `ppc glance ${id}`, 'Recorded with your name and the date; nothing else changes'),
      choose('I will not look at this one', `ppc glance ${id} --skip`, 'Recorded as skipped, with your name and the date; it is not asked again'),
      { label: 'Not yet', description: 'Nothing is recorded; it stays waiting for you' },
    ] }] };
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
