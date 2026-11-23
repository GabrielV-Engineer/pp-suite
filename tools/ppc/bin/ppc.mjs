#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadProject } from '../src/load.mjs';
import { validateModel, designFindings, RULES } from '../src/validate.mjs';
import { checkGit, touches } from '../src/gitcheck.mjs';
import { skillsWarning, skillCommands } from '../src/skills.mjs';
import { mapModel, renderMermaid, writeMap } from '../src/map.mjs';
import { describeFloorplan, DESCRIPTIONS_GUIDE, shareDescriptions, SHARED_DESCRIPTIONS } from '../src/floorplan.mjs';
import { DESCRIPTION_PLACES, drawMap, mapLine, mapStatus, openPage, readMapSettings, recommendedDescriptions, redrawAfterClose, writeMapSettings } from '../src/mapflow.mjs';
import { designState, inboxOf, nextSteps, nextJson, noDesignNext, overview, renderNext } from '../src/next.mjs';
import { execFileSync } from 'node:child_process';
import { checkConstitution, writeConstitution, ConstitutionError } from '../src/constitution.mjs';
import { apply, plan as installPlan, renderPlan, InstallError } from '../src/install.mjs';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { applyChange, decideChange, openChange } from '../src/changes.mjs';
import { sessionContext, gitSubjects, gitUserName, buildFacts, panelAnswers } from '../src/session.mjs';
import { renderAdditions } from '../src/additions.mjs';
import { SURFACES, renderRubric } from '../src/rubric.mjs';
import { ROLES, renderTools, renderHave } from '../src/tools.mjs';
import { readInventory, hasTool } from '../src/inventory.mjs';
import { BY_ID as STANDARD_IDS, recommend, renderStandards, projectFacts } from '../src/standards.mjs';
import { renderDecision, askFor, redCommitFiles, DecisionError, AUDIT_INPUT } from '../src/decisions.mjs';
import { buildPrompts, resolveTarget, writePrompts } from '../src/prompts.mjs';
import { openReview, recordOutside } from '../src/reviewfile.mjs';
import { renderGuide } from '../src/guide.mjs';
import { renderInbox, askInbox } from '../src/inbox.mjs';
import { start, stop, widen, approve, reread, glance, approveSlice, approveRed, approveDebt, scheduleDebt, decideAddition, decideStandard, decideTool, decideTools, toRefactor, finish, mutate, status, LifecycleError } from '../src/lifecycle.mjs';

const USAGE = `ppc — pp-suite contract tool

  Checks
    ppc validate [dir] [--strict]        check a project against the contract (strict: warnings fail too)
    ppc validate [dir] --design          judge only the design (.architect/), before any slice or debt register exists
    ppc check-git [dir]                  verify every slice audit against the real git history
    ppc rules                            list every rule the checks can emit

  Setup
    ppc session [dir]                    print the state for the start of a session (a hook shows it to the agent); silent outside a project
    ppc constitution [dir] [--check]     write the short block of project rules into CLAUDE.md; --check only verifies it is current
    ppc contract                         print where the contract's schemas, document and worked example are
    ppc init [dir] [--apply] [--shim] [--update] [--allow-untested] [--specify <path>]
                                         check the machine and the project against the pinned versions and print the
                                         commands that would set it up; --apply runs them (needs a clean git tree);
                                         --shim also writes ~/.local/bin/ppc; --update removes and reinstalls
                                         extensions whose files differ from this repository

  Design changes (a slice asks, a person decides, Architect.PP revises)
    ppc change-request (--slice <id> | --standard <id> | --design) --title <t> --problem <what it found> --proposal <what should change>
                       [--component a,b] [--adr ADR-0001] [--qa QA-001] [--budgets] [dir]
                                         open a change request: the design is wrong or silent about something. A slice that needs it raises
                                         it (--slice); so does an adopted standard whose gap the design must close (--standard observability,
                                         with nothing else to name yet), or the design itself when nobody was building (--design)
    ppc decide-change <CR-ID> (--accept | --reject --reason <why>) --by <name> [dir]
                                         HUMAN ONLY: accept or reject it
    ppc apply-change <CR-ID> [dir]       mark it applied, once the design revision has risen and the constitution follows it

  Slice cycle (each step changes the project or nothing at all)
    ppc approve [<id>] [--by <name>] [--accept <reason> | --drop [--reason <why>] | --pay-in <slice>] [dir]
                                         HUMAN ONLY: approve a slice to start, its red tests, a screen's mockup (SCR-…), or decide a debt entry; with no id,
                                         the one decision that is waiting; --pay-in approves debt into the slice that pays it.
                                         --by defaults to the git user.name
    ppc show <id> | reread | standards [dir]
                                         the card of what is being decided, in plain words (a standard by its name: security, ...)
    ppc approve-slice <slice> --by <name> [dir]
                                         HUMAN ONLY: planned -> ready
    ppc start <slice> [dir]              ready -> in progress, red phase
    ppc stop <slice> [dir]               in progress -> ready again, while the slice has no commits of its own (undo a start)
    ppc touches <slice> <file>... [dir]  before writing code: the components those files belong to that the slice does not list
    ppc widen <slice> --component <id> [dir]
                                         HUMAN ONLY: add a component to a slice still to be built (no design change)
    ppc approve-red --by <name> [dir]    HUMAN ONLY: approve the committed red tests, enter green
    ppc approve-debt <DEBT-ID> --by <name> [--accept <reason> | --drop [--reason <why>]] [dir]
                                         HUMAN ONLY: decide on proposed debt (default: it becomes open; --reason records why it was dropped)
    ppc schedule-debt <DEBT-ID> --slice <slice> [dir]
                                         assign an approved (open) debt to a planned feature, fix or refactor slice that touches
                                         its component; that slice pays it
    ppc decide-addition <ADD-ID>... (--keep --reason <why> | --cut) [--alone] [--by <name>] [dir]
                                         several ids are decided the same way; additions that overlap must be decided
                                         together (--alone decides one on purpose)
    ppc decide-addition --accept-recommended [--but-cut ADD-1,ADD-2] [--but-keep ADD-3 --reason <why>] [--by <name>] [dir]
                                         keep or cut something the design contains that the person did not ask for. The person
                                         decides; an assistant may run it for what the person told it in the conversation
    ppc glance <slice> [--skip] [--by <name>] [dir]
                                         HUMAN ONLY: say you looked at what a closed slice built, as a user would meet it (--skip: you will not);
                                         never holds anything up. --by defaults to the git user.name
    ppc review (CAP-001 | --project) --mode guide|explain|delegate [--surface cli,docs] [--by <name>] [dir]
                                         HUMAN ONLY: open a review of a complete capability, or of the whole project: how it is done is your choice;
                                         the file is .sddpp/reviews/RV-NNN-*.md, and /pp-experience carries it out. --surface adds cli or docs
    ppc guide <RV-id> [dir]              the guide for someone other than the builder to try what a review covered (no number of people is assumed)
    ppc outside <RV-id> [--skip] [--note <text>] [--by <name>] [dir]
                                         HUMAN ONLY: say someone other than the builder tried it (--skip: it will not happen); never holds anything up
    ppc reread (--all | SL-001 ...) [dir]
                                         HUMAN ONLY: say you read what changed in the design since the slices were planned (clears W03)
    ppc ask experience --no-measure   the question that decides no command measures the quality targets
    ppc ask <id> [--budget-reason <why>] [--mutation-reason <why>] [--pay-in <slice>] [--details <text>] [dir]
                                         the question for the panel that decides it: the option that approves ends with the exact
                                         command; with a reason, the exception that lets a slice in progress close; with
                                         --pay-in, a debt entry is approved or scheduled into the slice that pays it; for a
                                         standard, --details asks to record the person's own rule (ppc ask security --details "...")
    ppc ask tools [--use "<role>=<kind>:<name>[:read-only],..."] [dir]
                                         ONE question for every role that slices call for and nobody decided: none needed, one by one, or not yet;
                                         with --use, the tools the agent proposes, each saying whether it was found on this machine
    ppc ask <role> [--tool <name> --kind <skill|plugin|mcp> [--source <where>] [--pinned <version>] [--access <read-only|read-write> [--access-reason <why>]]] [dir]
                                         the panel question for a role's tool (ui-design, ui-capture, security-review, db-inspect): with no
                                         tool, not needed or not yet; with one, a confirmation that says whether it was found on this machine
    ppc additions [dir]                  the additions in plain words: what needs you, what a recommendation settles

  Standards (security, observability, git, CI: decided per project, see docs/standards.md)
    ppc rubric [screen|api|cli|docs]     the criteria a review of what people meet applies, each with its source and the words it uses, or marked as pp-suite's own
    ppc standards [dir]                  each standard: what was decided, or what is recommended from the design and the repository, and why
    ppc decide-standard <standard> (--adopt <choice> [--details <text>] | --later --trigger <what> | --not-needed --reason <why>) [--by <name>] [dir]
                                         HUMAN ONLY: decide one (security, observability, git or ci); deciding it again keeps the
                                         earlier answer in its history. --adopt custom --details "<text>" records your own rule or tool
    ppc decide-standard experience --measure-none --reason <why> [--by <name>] [dir]
                                         HUMAN ONLY: decide that no command measures the quality targets, so S04 stops saying so (a command given later replaces it)
    ppc decide-standard --accept-recommended [--by <name>] [dir]
                                         HUMAN ONLY: take the recommendation for every standard still undecided
    ppc tools [--have] [dir]             with --have, everything you have (skills, plugins, MCP servers) by name, for proposing a tool; otherwise each role (ui-design, ui-capture, security-review, db-inspect): the tool chosen for it, the slices not yet closed that call for it, and whether a chosen tool is on this machine
    ppc decide-tool --roles <a,b,...> --not-needed --reason <why> | --use "<role>=<kind>:<name>[:read-only],..." [--by <name>] [dir]
                                         HUMAN ONLY: several roles at once, as ppc ask tools offers them: all not needed, or the tool proposed for each
                                         (a server that may change things is decided on its own)
    ppc decide-tool <role> (--adopt <tool> --kind <skill|plugin|mcp> [--source <where>] [--pinned <commit|version>] [--access <read-only|read-write> [--access-reason <why>]] | --later --trigger <what> | --not-needed --reason <why>) [--by <name>] [dir]
                                         HUMAN ONLY: record the skill, plugin or MCP server this project uses for a role (ui-design, ui-capture,
                                         security-review, db-inspect); an MCP server says its access; deciding again keeps the earlier answer in history
    ppc refactor [dir]                   green -> refactor
    ppc finish <slice> --audit <file.json> [--budget-reason <text>] [--mutation-reason <text>] [dir]
                                         close the slice; the diff size is measured from git.
                                         The reason flags record an exception: HUMAN ONLY
    ppc mutation (--files a,b | --slice <id>) [dir]
                                         run mutation testing and print the score and the surviving mutants
    ppc prompt [<slice>] [--task red|green|refactor|audit|explore] [--stdout] [--force] [dir]
                                         write the system, negative and (when it applies) design prompt for one task
                                         under .sddpp/prompts/; without a slice or task, the one in progress
    ppc status [dir]                     what is in progress
    ppc next [dir] [--json]              whose turn it is and the exact command to run (--json: the same, for the /pp skill)
    ppc inbox [dir]                      what waits for your look and holds nothing up (glances, reviews, outside tests, tool roles), oldest first
    ppc ask inbox [dir]                  up to four of those in one question panel, oldest first, each with the options of its own question
    ppc overview [dir]                   where the project stands: slices, capabilities, debt, contract
    ppc map [dir] [--stdout | --html [--open]]
                                         the project as a picture: components, capabilities and screens, read from the design and the slices.
                                         Writes .sddpp/map/map.md (mermaid diagrams, shown by GitHub); --stdout prints it and writes nothing;
                                         --html also draws the interactive map with Floorplan (adopted, see THIRD_PARTY.md), reading the code,
                                         into floorplan/index.html (a folder git ignores); --open shows it in the browser
    ppc map --describe [dir]             draw the map, then list the files with no description and the worksheets to write them from
    ppc map --on --descriptions <shared|clone> [--open] | --off [dir]
                                         put the map in the flow (off by default): each slice that closes redraws it, the session start
                                         redraws it in the background when it is behind, and ppc next gives its link; with --open the browser
                                         opens it when a slice closes. The descriptions of the files are shared (in .sddpp/, in git) or kept
                                         per clone (out of git): a person decides, and --on without it explains both and recommends one
    ppc map --descriptions <shared|clone> [dir]
                                         change where the descriptions live; switching to shared keeps what was written
    ppc help [<command>]                 this text, or only the lines of one command; \`ppc <command> --help\` does the same and nothing else
`;

const VALUE_OPTIONS = new Set(['--standard', '--roles', '--use', '--measure', '--tools', '--add-tool', '--tool', '--note', '--mode', '--surface', '--descriptions', '--by', '--audit', '--files', '--slice', '--accept', '--budget-reason', '--mutation-reason', '--reason', '--task', '--specify', '--title', '--problem', '--proposal', '--component', '--adr', '--qa', '--but-cut', '--but-keep', '--pay-in', '--add-component', '--mockup', '--adopt', '--details', '--trigger', '--kind', '--source', '--pinned', '--access', '--access-reason']);
// What each command accepts. Anything else is refused: an option that is silently ignored can turn a request for help, or a typo,
// into an approval (`ppc approve --help` once approved the one slice that could be approved).
const OPTIONS = {
  rules: [], validate: ['--strict', '--design'], 'check-git': [], start: [], stop: [], 'approve-slice': ['--by'], approve: ['--by', '--accept', '--drop', '--reason', '--pay-in', '--mockup'],
  show: [], inbox: [], ask: ['--no-measure', '--budget-reason', '--mutation-reason', '--pay-in', '--add-component', '--details', '--measure', '--tools', '--add-tool', '--tool', '--kind', '--source', '--pinned', '--access', '--access-reason', '--use'], touches: [], widen: ['--component'], reread: ['--all'], guide: [], outside: ['--by', '--skip', '--note'], glance: ['--by', '--skip'], review: ['--project', '--mode', '--surface', '--by'], 'approve-debt': ['--by', '--accept', '--drop', '--reason'], 'schedule-debt': ['--slice'],
  'decide-addition': ['--keep', '--cut', '--alone', '--by', '--reason', '--accept-recommended', '--but-cut', '--but-keep'], additions: [],
  'decide-tool': ['--roles', '--use', '--adopt', '--kind', '--source', '--pinned', '--access', '--access-reason', '--later', '--trigger', '--not-needed', '--reason', '--by'],
  rubric: [], standards: [], tools: ['--have'], 'decide-standard': ['--measure', '--measure-none', '--tools', '--add-tool', '--adopt', '--details', '--later', '--trigger', '--not-needed', '--reason', '--accept-recommended', '--by'],
  'change-request': ['--slice', '--standard', '--design', '--title', '--problem', '--proposal', '--component', '--adr', '--qa', '--budgets'],
  'decide-change': ['--accept', '--reject', '--by', '--reason'], 'apply-change': [], 'approve-red': ['--by'], refactor: [],
  finish: ['--audit', '--budget-reason', '--mutation-reason'], mutation: ['--files', '--slice'], next: ['--json'], overview: [], map: ['--stdout', '--html', '--open', '--on', '--off', '--describe', '--descriptions'],
  constitution: ['--check'], session: [], contract: [], init: ['--apply', '--shim', '--update', '--allow-untested', '--specify'],
  prompt: ['--task', '--stdout', '--force'], status: [],
};

/** The usage lines of one command (its entry and the lines that continue it), or all of them when there is no such entry. */
function usageFor(name) {
  const blocks = [];
  for (const line of USAGE.split('\n')) {
    if (/^ {4}ppc /.test(line)) blocks.push({ name: line.trim().split(/\s+/)[1], lines: [line] });
    else if (/^ {5,}\S/.test(line) && blocks.length) blocks.at(-1).lines.push(line);
  }
  const own = blocks.filter((b) => b.name === name);
  return own.length ? `${own.flatMap((b) => b.lines).join('\n')}\n` : USAGE;
}

const [command, ...rest] = process.argv.slice(2);
// Help never does anything else: it comes before any command is looked at.
if (command === 'help' || command === '--help' || command === '-h' || rest.includes('--help') || rest.includes('-h')) {
  const asked = command === 'help' ? rest[0] : command;
  process.stdout.write(asked && OPTIONS[asked] ? usageFor(asked) : USAGE);
  process.exit(0);
}
const positionals = [];
const flags = new Set();
const options = new Map();
const unknown = [];
for (let i = 0; i < rest.length; i++) {
  // `--accept` takes a reason in approve-debt, and is a plain flag in decide-change
  const known = OPTIONS[command]?.includes(rest[i]);
  if (VALUE_OPTIONS.has(rest[i]) && !(rest[i] === '--accept' && command === 'decide-change')) options.set(rest[i].slice(2), rest[++i]);
  else if (rest[i].startsWith('-') && rest[i].length > 1) flags.add(rest[i]);
  else positionals.push(rest[i]);
  if (rest[i]?.startsWith('-') && rest[i].length > 1 && !known) unknown.push(rest[i]);
}
if (OPTIONS[command] && unknown.length) {
  console.error(`ppc ${command}: unknown option ${unknown[0]} (ppc ${command} --help shows what it takes). Nothing was done.`);
  process.exit(2);
}
const dirAt = (index) => resolve(positionals[index] ?? '.');

/** Shared description files a merge left broken: left out of the map and never deleted, so a person settles them. */
function warnConflicts(conflicts) {
  for (const file of conflicts ?? []) {
    console.error(`Warning: ${file} is not valid JSON (a merge conflict?), so that description is left out of the map. Keep one side, or delete the file and write it again: ppc map --describe`);
  }
}

function report(findings) {
  for (const f of findings) console.log(`${f.severity === 'error' ? 'error  ' : 'warning'} ${f.rule.padEnd(6)} ${f.file}: ${f.message}`);
  const errors = findings.filter((f) => f.severity === 'error').length;
  const warnings = findings.length - errors;
  console.log(`${errors} error(s), ${warnings} warning(s)`);
  return { errors, warnings };
}

function transition(run) {
  try {
    const result = run();
    console.log(result.text ?? JSON.stringify(result));
  } catch (error) {
    if (!(error instanceof LifecycleError)) throw error;
    console.error(error.message);
    process.exit(1);
  }
}

switch (command) {
  case 'rules':
    for (const [id, text] of Object.entries(RULES)) console.log(`${id.padEnd(7)}${text}`);
    break;
  case 'validate': {
    const root = dirAt(0);
    const model = loadProject(root);
    let findings = validateModel(model);
    if (flags.has('--design')) findings = designFindings(findings);
    const { errors, warnings } = report(findings);
    process.exit(errors || (flags.has('--strict') && warnings) ? 1 : 0);
    break;
  }
  case 'check-git': {
    const root = dirAt(0);
    const model = loadProject(root);
    const findings = validateModel(model);
    if (!findings.some((f) => f.severity === 'error')) findings.push(...checkGit(model, root));
    process.exit(report(findings).errors ? 1 : 0);
    break;
  }
  case 'start':
    transition(() => start(dirAt(1), positionals[0]));
    break;
  case 'touches': {
    const root = resolve('.');
    const [id, ...files] = positionals;
    const dir = files.length && existsSync(join(files.at(-1), '.architect')) ? files.pop() : null;
    const model = loadProject(dir ? resolve(dir) : root);
    const s = model.slices.find((x) => x.data.id === id)?.data;
    if (!s || !files.length) {
      console.error(s ? 'usage: ppc touches <slice> <file>... [dir]' : `unknown slice ${id}`);
      process.exit(2);
    }
    const r = touches(model, s, files);
    if (r.noPaths) {
      console.log('No component of the design declares `paths`, so ppc cannot tell which files belong to which: check by reading the code.');
      break;
    }
    if (!r.missing.length) {
      console.log(`${id} lists every component these files belong to.`);
      break;
    }
    for (const [file, owners] of Object.entries(r.foreign)) console.log(`${file} belongs to ${owners.join(', ')}`);
    console.log(`\n${id} lists ${s.components.join(', ')}. Before writing code, put it to the person: ${r.missing.map((c) => `ppc ask ${id} --add-component ${c}`).join('  ·  ')}`);
    process.exit(1);
  }
  case 'widen':
    transition(() => widen(dirAt(1), positionals[0], options.get('component')));
    break;
  case 'stop':
    transition(() => stop(dirAt(1), positionals[0]));
    break;
  case 'approve-slice':
    transition(() => approveSlice(dirAt(1), positionals[0], options.get('by') ?? gitUserName(dirAt(1))));
    break;
  case 'approve': {
    // `ppc approve [id] [dir]`: the id starts with SL- or DEBT-; anything else is the directory
    const isId = (p) => /^(SL|DEBT|CR|[A-Z]+)-/.test(p) && !p.includes('/');
    const id = positionals.find(isId);
    const root = resolve(positionals.find((p) => p !== id) ?? '.');
    transition(() => approve(root, id, { by: options.get('by') ?? gitUserName(root), accept: options.get('accept'), drop: flags.has('--drop'), reason: options.get('reason'), payIn: options.get('pay-in'), mockup: options.get('mockup') }));
    break;
  }
  case 'show': {
    const id = positionals.find((p) => (/^([A-Z]+-|reread$|standards$|review$)/.test(p) || STANDARD_IDS.has(p)) && !p.includes('/'));
    const root = resolve(positionals.find((p) => p !== id) ?? '.');
    const model = loadProject(root);
    const card = id ? renderDecision(model, id, { redFiles: redCommitFiles(root, id), auditInput: existsSync(join(root, AUDIT_INPUT)) }) : null;
    if (!card) {
      console.error(id ? `${id}: there is nothing with that id (a slice SL-…, a debt entry DEBT-… or a change request CR-…)` : 'usage: ppc show <id> [dir]');
      process.exit(1);
    }
    process.stdout.write(card);
    break;
  }
  case 'ask': {
    const roleIds = new Set(ROLES.map((r) => r.id));
    const id = positionals.find((p) => (/^([A-Z]+-|reread$|standards$|review$|tools$|inbox$)/.test(p) || STANDARD_IDS.has(p) || roleIds.has(p)) && !p.includes('/'));
    const root = resolve(positionals.find((p) => p !== id) ?? '.');
    // a tool the agent names is looked for in the person's home, so the question can say whether pp-suite found it (it never claims it did without looking)
    const named = options.get('tool');
    const installed = named !== undefined && options.get('kind') ? hasTool(readInventory({ home: homedir(), root }), options.get('kind'), named) : undefined;
    const inventory = options.get('use') !== undefined ? readInventory({ home: homedir(), root }) : undefined;
    let question;
    try {
      question = id === 'inbox' ? askInbox(loadProject(root)) : id ? askFor(loadProject(root), id, { noMeasure: flags.has('--no-measure'), redFiles: redCommitFiles(root, id), budgetReason: options.get('budget-reason'), mutationReason: options.get('mutation-reason'), payIn: options.get('pay-in'), addComponent: options.get('add-component'), details: options.get('details'), measure: options.get('measure'), tools: options.get('tools'), addTool: options.get('add-tool'), tool: named, kind: options.get('kind'), source: options.get('source'), pinned: options.get('pinned'), access: options.get('access'), accessReason: options.get('access-reason'), installed, use: options.get('use'), inventory }) : null;
    } catch (error) {
      if (!(error instanceof DecisionError)) throw error;
      console.error(error.message);
      process.exit(1);
    }
    if (!question) {
      console.error(id ? `${id}: there is nothing to decide on that id right now` : 'usage: ppc ask <id> [dir]');
      process.exit(1);
    }
    process.stdout.write(`${JSON.stringify(question, null, 2)}\n`);
    break;
  }
  case 'inbox': {
    const root = dirAt(0);
    const model = loadProject(root);
    if (!model.blueprint) {
      process.stdout.write('Nothing waits for your look: there is no design yet.\n');
      break;
    }
    process.stdout.write(renderInbox(inboxOf(nextSteps(model, [], []))));
    break;
  }
  case 'guide': {
    const id = positionals.find((p) => /^RV-\d+$/.test(p));
    const root = resolve(positionals.find((p) => p !== id) ?? '.');
    const entry = id ? loadProject(root).reviews.find((r) => r.data.id === id) : null;
    if (!entry) {
      console.error(id ? `unknown review ${id}` : 'say which review: ppc guide RV-001');
      process.exit(1);
    }
    process.stdout.write(renderGuide(loadProject(root), entry.data));
    break;
  }
  case 'outside': {
    const id = positionals.find((p) => /^RV-\d+$/.test(p));
    const root = resolve(positionals.find((p) => p !== id) ?? '.');
    transition(() => recordOutside(root, id, { by: options.get('by') ?? gitUserName(root), skip: flags.has('--skip'), note: options.get('note') }));
    break;
  }
  case 'review': {
    const cap = positionals.find((p) => /^CAP-\d+$/.test(p));
    const root = resolve(positionals.find((p) => p !== cap) ?? '.');
    transition(() => openReview(root, { scope: flags.has('--project') ? 'project' : cap, mode: options.get('mode'), by: options.get('by') ?? gitUserName(root), surfaces: (options.get('surface') ?? '').split(',').filter(Boolean) }));
    break;
  }
  case 'glance': {
    const id = positionals.find((p) => /^SL-\d+$/.test(p));
    const root = resolve(positionals.find((p) => p !== id) ?? '.');
    transition(() => glance(root, id, { by: options.get('by') ?? gitUserName(root), skip: flags.has('--skip') }));
    break;
  }
  case 'reread': {
    const ids = positionals.filter((p) => /^SL-\d+$/.test(p));
    const root = resolve(positionals.find((p) => !/^SL-\d+$/.test(p)) ?? '.');
    transition(() => reread(root, { ids, all: flags.has('--all') }));
    break;
  }
  case 'approve-debt':
    transition(() => approveDebt(dirAt(1), positionals[0], { by: options.get('by') ?? gitUserName(dirAt(1)), accept: options.get('accept'), drop: flags.has('--drop'), reason: options.get('reason') }));
    break;
  case 'schedule-debt':
    transition(() => scheduleDebt(dirAt(1), positionals[0], options.get('slice')));
    break;
  case 'decide-addition':
    transition(() => {
      const ids = positionals.filter((p) => /^ADD-\d{3}$/.test(p));
      const root = resolve(positionals.find((p) => !/^ADD-\d{3}$/.test(p)) ?? '.');
      const by = options.get('by') ?? gitUserName(root);
      const list = (v) => (v ? v.split(',').map((x) => x.trim()).filter(Boolean) : []);
      const hint = () => {
        const left = (loadProject(root).additions?.data.additions ?? []).filter((a) => a.decision === 'pending').length;
        if (!left) console.error('Every addition is decided. Next: apply the cuts (/pp-design cuts) if any were cut, then write the constitution with `ppc constitution`.');
      };
      if (flags.has('--accept-recommended') || options.has('but-cut') || options.has('but-keep')) {
        const done = decideAddition(root, null, { acceptRecommended: flags.has('--accept-recommended'), by, cut: list(options.get('but-cut')), keep: list(options.get('but-keep')), reason: options.get('reason') });
        hint();
        return done;
      }
      const done = decideAddition(root, ids.length === 1 ? ids[0] : ids, { decision: flags.has('--cut') ? 'cut' : flags.has('--keep') ? 'keep' : undefined, by, reason: options.get('reason'), alone: flags.has('--alone') });
      hint();
      return done;
    });
    break;
  case 'additions': {
    const list = loadProject(dirAt(0)).additions?.data.additions;
    process.stdout.write(list?.length ? renderAdditions(list) : 'There are no additions to review (no .architect/additions.yaml, or it is empty).\n');
    break;
  }
  case 'rubric': {
    const wanted = positionals[0];
    if (wanted && !Object.hasOwn(SURFACES, wanted)) {
      console.error(`unknown surface ${wanted}; the surfaces are ${Object.keys(SURFACES).join(', ')}`);
      process.exit(1);
    }
    process.stdout.write(renderRubric(wanted ? [wanted] : undefined));
    break;
  }
  case 'standards': {
    const root = dirAt(0);
    const model = loadProject(root);
    if (!model.blueprint) {
      console.error('there is no design yet (.architect/blueprint.yaml); the standards are decided after it');
      process.exit(1);
    }
    const facts = model.facts ?? projectFacts(root);
    process.stdout.write(renderStandards(model.standards?.data?.standards ?? [], recommend(model.blueprint.data, facts), { bp: model.blueprint.data, facts }));
    break;
  }
  case 'decide-standard':
    transition(() => {
      const id = positionals.find((p) => STANDARD_IDS.has(p));
      const other = positionals.find((p) => p !== id);
      if (other && !existsSync(resolve(other))) throw new LifecycleError(`unknown standard ${other}; the standards are ${[...STANDARD_IDS.keys()].join(', ')}`);
      const root = resolve(other ?? '.');
      return decideStandard(root, id, { acceptRecommended: flags.has('--accept-recommended'), by: options.get('by') ?? gitUserName(root), adopt: options.get('adopt'), details: options.get('details'), measure: options.get('measure'), tools: options.get('tools')?.split(',').map((t) => t.trim()).filter(Boolean), addTool: options.get('add-tool'), measureNone: flags.has('--measure-none'), later: flags.has('--later'), trigger: options.get('trigger'), notNeeded: flags.has('--not-needed'), reason: options.get('reason') });
    });
    break;
  case 'tools': {
    const root = dirAt(0);
    const model = loadProject(root);
    if (!model.blueprint) {
      console.error('there is no design yet (.architect/blueprint.yaml); the tools are decided after it');
      process.exit(1);
    }
    process.stdout.write(flags.has('--have') ? renderHave(readInventory({ home: homedir(), root })) : renderTools(model, readInventory({ home: homedir(), root })));
    break;
  }
  case 'decide-tool':
    transition(() => {
      const roles = new Set(ROLES.map((r) => r.id));
      const role = positionals.find((p) => roles.has(p));
      if (options.get('use') !== undefined || options.get('roles') !== undefined) {
        // several roles at once, as the panel offers them (`ppc ask tools`)
        if (role || options.get('adopt') !== undefined || flags.has('--later')) throw new LifecycleError('--roles and --use decide several roles at once; they do not go with a single role, --adopt or --later');
        const dir = resolve(positionals[0] ?? '.');
        return decideTools(dir, { by: options.get('by') ?? gitUserName(dir), roles: options.get('roles')?.split(',').map((r) => r.trim()).filter(Boolean), notNeeded: flags.has('--not-needed'), reason: options.get('reason'), use: options.get('use') });
      }
      const other = positionals.find((p) => p !== role);
      if (other && !existsSync(resolve(other))) throw new LifecycleError(`unknown role ${other}; the roles are ${[...roles].join(', ')}`);
      const root = resolve(other ?? '.');
      return decideTool(root, role, { by: options.get('by') ?? gitUserName(root), adopt: options.get('adopt'), kind: options.get('kind'), source: options.get('source'), pinned: options.get('pinned'), access: options.get('access'), accessReason: options.get('access-reason'), later: flags.has('--later'), trigger: options.get('trigger'), notNeeded: flags.has('--not-needed'), reason: options.get('reason') });
    });
    break;
  case 'change-request': {
    const list = (v) => (v ? v.split(',').map((x) => x.trim()).filter(Boolean) : []);
    transition(() => openChange(dirAt(0), { slice: options.get('slice'), standard: options.get('standard'), design: flags.has('--design'), title: options.get('title'), problem: options.get('problem'), proposal: options.get('proposal'), components: list(options.get('component')), adrs: list(options.get('adr')), qas: list(options.get('qa')), budgets: flags.has('--budgets') }));
    break;
  }
  case 'decide-change':
    transition(() => decideChange(dirAt(1), positionals[0], { decision: flags.has('--accept') ? 'accept' : flags.has('--reject') ? 'reject' : undefined, by: options.get('by') ?? gitUserName(dirAt(1)), reason: options.get('reason') }));
    break;
  case 'apply-change':
    transition(() => applyChange(dirAt(1), positionals[0]));
    break;
  case 'approve-red':
    transition(() => approveRed(dirAt(0), options.get('by') ?? gitUserName(dirAt(0))));
    break;
  case 'refactor':
    transition(() => toRefactor(dirAt(0)));
    break;
  case 'finish':
    transition(() => {
      const file = options.get('audit');
      if (!file) throw new LifecycleError('--audit <file.json> is required');
      let input;
      try {
        input = JSON.parse(readFileSync(resolve(file), 'utf8'));
      } catch (e) {
        throw new LifecycleError(`cannot read the audit file: ${e.message}`);
      }
      // A human records an exception on the command line; an agent is not allowed to (the guard blocks these flags).
      if (options.get('budget-reason')) input.budget_override_reason = options.get('budget-reason');
      if (options.get('mutation-reason')) input.mutation_override_reason = options.get('mutation-reason');
      return finish(dirAt(1), positionals[0], input);
    });
    {
      // the slice is closed; with the map on, redraw it. A map that fails is a warning: it never reopens the slice.
      const root = dirAt(1);
      const model = loadProject(root);
      const drawn = redrawAfterClose(root, model, validateModel(model));
      if (drawn.drawn) console.log(`Map updated: ${drawn.page}${drawn.opened ? ' (opened in the browser)' : ''}`);
      else if (drawn.error) console.error(`warning: the slice is closed, but the map was not redrawn:\n${drawn.error}`);
    }
    break;
  case 'mutation':
    transition(() => mutate(dirAt(0), { files: options.get('files')?.split(',').filter(Boolean), slice: options.get('slice') }));
    break;
  case 'next':
  case 'overview': {
    const root = dirAt(0);
    const model = loadProject(root);
    const findings = validateModel(model);
    if (!model.blueprint) {
      // set up, no design yet: the first step, not an error (`ppc validate` still reports the missing files)
      if (command === 'next' && designState(root) === 'no-design') {
        process.stdout.write(renderNext(noDesignNext()));
        break;
      }
      report(findings);
      process.exit(1);
    }
    if (command === 'overview') {
      process.stdout.write(overview(model, findings));
      break;
    }
    // not a git repository: the phase alone decides, as if no commit had been made yet
    const subjects = gitSubjects(root);
    const next = nextSteps(model, subjects, findings.filter((f) => f.severity === 'error'), { ...buildFacts(root), answers: panelAnswers(root) });
    const warning = skillsWarning(root, skillCommands(next));
    process.stdout.write(flags.has('--json') ? `${JSON.stringify({ ...nextJson(next), map: mapStatus(root, model), ...(warning ? { warnings: [warning] } : {}) }, null, 2)}\n` : (warning ? `${warning}\n\n` : '') + renderNext(next) + (mapLine(root, model) ? `\n${mapLine(root, model)}` : ''));
    break;
  }
  case 'map': {
    const root = dirAt(0);
    if (flags.has('--on') && flags.has('--off')) {
      console.error('ppc map: --on and --off together; pick one. Nothing was done.');
      process.exit(2);
    }
    const place = options.get('descriptions');
    if (place !== undefined && !DESCRIPTION_PLACES.includes(place)) {
      console.error(`ppc map: --descriptions takes shared or clone, not "${place}". Nothing was done.`);
      process.exit(2);
    }
    if (flags.has('--on') && place === undefined) {
      // a person decides where the descriptions live: ask once, here, before anything is turned on
      const recommended = recommendedDescriptions(root);
      console.error([
        'ppc map --on: say where the descriptions of the files live. Nothing was turned on. Ask the person:',
        '  --descriptions shared   in .sddpp/map/descriptions, in git: written once for the whole team, reviewed in pull requests',
        '  --descriptions clone    in floorplan/, out of git: nothing enters the repository, and each clone writes its own (tokens each time)',
        `Recommended: ${recommended} (${recommended === 'shared' ? 'the project has a remote, so others may work on it' : 'no remote: one person, one clone'}).`,
      ].join('\n'));
      process.exit(2);
    }
    if (flags.has('--on') || flags.has('--off') || place !== undefined) {
      const before = readMapSettings(root);
      if (!flags.has('--on') && !flags.has('--off') && !before.html) {
        console.error('ppc map: the map is off; turn it on with ppc map --on --descriptions <shared|clone>. Nothing was done.');
        process.exit(2);
      }
      const html = flags.has('--off') ? false : true;
      const s = writeMapSettings(root, { html, open: flags.has('--on') ? flags.has('--open') : before.open, descriptions: place ?? before.descriptions });
      if (s.descriptions === 'shared' && before.descriptions !== 'shared') shareDescriptions(root);
      console.log(s.html
        ? `The map is on: each slice that closes redraws it, the session start redraws it when it is behind, and \`ppc next\` gives its link${s.open ? '; the browser opens it when a slice closes' : ''}.\nDescriptions: ${s.descriptions === 'shared' ? `shared, in ${SHARED_DESCRIPTIONS} (commit them with the rest of .sddpp/)` : 'per clone, in floorplan/descriptions (out of git)'}.\nDraw it now: ppc map --html`
        : `The map is off: nothing in the flow draws it. \`ppc map\` still draws it when asked.${existsSync(join(root, SHARED_DESCRIPTIONS)) ? ` The shared descriptions stay in ${SHARED_DESCRIPTIONS}; delete them if they should leave git.` : ''}`);
      break;
    }
    const model = loadProject(root);
    const findings = validateModel(model);
    if (!model.blueprint) {
      report(findings);
      process.exit(1);
    }
    const map = mapModel(model, findings);
    if (flags.has('--stdout')) {
      process.stdout.write(renderMermaid(map));
      break;
    }
    for (const file of writeMap(root, map)) console.log(`Map written: ${file}\n  ${join(root, file)}`);
    if (flags.has('--describe')) {
      try {
        const result = describeFloorplan(root, model, { shared: readMapSettings(root).descriptions === 'shared' });
        warnConflicts(result.conflicts);
        if (result.nothingToDo || !result.worksheets?.length) {
          console.log('Every file and route has a description.');
          break;
        }
        console.log(`${result.totals.files} files and ${result.totals.routes} routes have no description yet. Each worksheet says what they define and who uses them:`);
        for (const w of result.worksheets) console.log(`  ${w.worksheet} -> ${w.descriptions}  (${w.node}: ${w.files} files, ${w.routes} routes)`);
        console.log(`Fill each \`description\` and improve each \`name\` in those files, without changing their keys, following\n  ${DESCRIPTIONS_GUIDE}\nthen draw the map again: ppc map --html`);
      } catch (error) {
        console.error(error.message);
        process.exit(1);
      }
      break;
    }
    if (flags.has('--html')) {
      try {
        const { page, descriptions, conflicts } = drawMap(root, model);
        warnConflicts(conflicts);
        const opened = flags.has('--open') && openPage(join(root, page));
        console.log(`Interactive map written: ${page}\n  ${join(root, page)}${opened ? '\n  (opened in the browser)' : ''}`);
        if (descriptions?.total) {
          const review = descriptions.review ? `; ${descriptions.review} to review because the code changed` : '';
          const todo = descriptions.described < descriptions.total || descriptions.review ? ' To write them: ppc map --describe' : '';
          console.log(`Descriptions: ${descriptions.described} of ${descriptions.total} files${review}.${todo}`);
        }
        console.log('To ask questions about the code from the map: node floorplan/serve.mjs (Claude Code CLI, read-only tools)');
      } catch (error) {
        console.error(error.message);
        process.exit(1);
      }
    }
    break;
  }
  case 'constitution': {
    const root = dirAt(0);
    try {
      if (flags.has('--check')) {
        const problems = checkConstitution(root);
        problems.forEach((p) => console.error(p));
        process.exit(problems.length ? 1 : 0);
      }
      const { file, status } = writeConstitution(root);
      console.log(`${file}: ${status}`);
    } catch (error) {
      if (!(error instanceof ConstitutionError)) throw error;
      console.error(error.message);
      process.exit(1);
    }
    break;
  }
  case 'session':
    process.stdout.write(sessionContext(dirAt(0)));
    break;
  case 'contract': {
    const suite = resolve(new URL('../../..', import.meta.url).pathname);
    console.log(`schemas: ${join(suite, 'contract/v0.1/schemas')}\ndocument: ${join(suite, 'docs/contract-v0.1.md')}\nexample: ${join(suite, 'examples/todo-app')}\ndesign guide: ${join(suite, 'architect-pp/extension/design-guide.md')}`);
    break;
  }
  case 'init': {
    const root = dirAt(0);
    const suite = resolve(new URL('../../..', import.meta.url).pathname);
    const probe = (cmd, args, opts = {}) => {
      const r = spawnSync(cmd, args, { encoding: 'utf8', cwd: opts.cwd, timeout: 30000 });
      return r.error ? null : r;
    };
    const env = { suite, probe, nodeVersion: process.versions.node, pathDirs: (process.env.PATH ?? '').split(':').filter(Boolean), home: homedir(), specify: options.get('specify') ?? 'specify' };
    const opts = { shim: flags.has('--shim'), allowUntested: flags.has('--allow-untested'), update: flags.has('--update') };
    try {
      if (!flags.has('--apply')) {
        const p = installPlan(root, env, opts);
        process.stdout.write(renderPlan(p));
        process.exit(p.blocked.length ? 1 : 0);
      }
      const run = (command, cwd) => spawnSync(command[0], command.slice(1), { cwd, encoding: 'utf8', stdio: ['ignore', 'inherit', 'pipe'] });
      const { ran, plan: after } = apply(root, env, { ...opts, run });
      console.log(ran.length ? `ran: ${ran.join(', ')}` : 'nothing to do');
      process.stdout.write(renderPlan(after, { applied: true }));
      process.exit(after.checks.some((c) => c.status !== 'ok' && ['guard-script', 'guard-hook', 'specify-project'].includes(c.id)) ? 1 : 0);
    } catch (error) {
      if (!(error instanceof InstallError)) throw error;
      console.error(error.message);
      process.exit(1);
    }
    break;
  }
  case 'prompt':
    transition(() => {
      const [first] = positionals;
      const named = /^SL-\d{3,}$/.test(first ?? '') ? first : undefined;
      const root = resolve(positionals[named ? 1 : 0] ?? '.');
      const { slice, task } = resolveTarget(loadProject(root), named, options.get('task'));
      if (flags.has('--stdout')) {
        const parts = buildPrompts(loadProject(root), slice, task);
        return { text: Object.values(parts).filter(Boolean).join('\n---\n\n').trimEnd() };
      }
      const { files } = writePrompts(root, slice, task, { force: flags.has('--force') });
      return { text: `${slice} ${task}: wrote\n${files.map((f) => `  ${f}`).join('\n')}\nThey are yours to edit or ignore.` };
    });
    break;
  case 'status':
    console.log(status(dirAt(0)).text);
    break;
  default:
    process.stderr.write(USAGE);
    process.exit(command ? 2 : 0);
}
