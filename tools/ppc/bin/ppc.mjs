#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadProject } from '../src/load.mjs';
import { validateModel, designFindings, RULES } from '../src/validate.mjs';
import { checkGit } from '../src/gitcheck.mjs';
import { designState, nextSteps, nextJson, noDesignNext, overview, renderNext } from '../src/next.mjs';
import { execFileSync } from 'node:child_process';
import { checkConstitution, writeConstitution, ConstitutionError } from '../src/constitution.mjs';
import { apply, plan as installPlan, renderPlan, InstallError } from '../src/install.mjs';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { applyChange, decideChange, openChange } from '../src/changes.mjs';
import { sessionContext, gitSubjects, gitUserName, buildFacts } from '../src/session.mjs';
import { renderAdditions } from '../src/additions.mjs';
import { renderDecision, askFor, redCommitFiles, DecisionError, AUDIT_INPUT } from '../src/decisions.mjs';
import { buildPrompts, resolveTarget, writePrompts } from '../src/prompts.mjs';
import { start, approve, reread, approveSlice, approveRed, approveDebt, scheduleDebt, decideAddition, toRefactor, finish, mutate, status, LifecycleError } from '../src/lifecycle.mjs';

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
    ppc change-request --slice <id> --title <t> --problem <what it found> --proposal <what should change>
                       [--component a,b] [--adr ADR-0001] [--qa QA-001] [--budgets] [dir]
                                         open a change request: the design is wrong or silent about something a slice needs
    ppc decide-change <CR-ID> (--accept | --reject --reason <why>) --by <name> [dir]
                                         HUMAN ONLY: accept or reject it
    ppc apply-change <CR-ID> [dir]       mark it applied, once the design revision has risen and the constitution follows it

  Slice cycle (each step changes the project or nothing at all)
    ppc approve [<id>] [--by <name>] [--accept <reason> | --drop [--reason <why>]] [dir]
                                         HUMAN ONLY: approve a slice to start, its red tests, or decide a debt entry; with no id,
                                         the one decision that is waiting. --by defaults to the git user.name
    ppc show <id> | reread [dir]         the card of what is being decided, in plain words
    ppc approve-slice <slice> --by <name> [dir]
                                         HUMAN ONLY: planned -> ready
    ppc start <slice> [dir]              ready -> in progress, red phase
    ppc approve-red --by <name> [dir]    HUMAN ONLY: approve the committed red tests, enter green
    ppc approve-debt <DEBT-ID> --by <name> [--accept <reason> | --drop [--reason <why>]] [dir]
                                         HUMAN ONLY: decide on proposed debt (default: it becomes open; --reason records why it was dropped)
    ppc schedule-debt <DEBT-ID> --slice <refactor slice> [dir]
                                         assign an approved (open) debt to a planned refactor slice that touches its component
    ppc decide-addition <ADD-ID>... (--keep --reason <why> | --cut) [--alone] [--by <name>] [dir]
                                         several ids are decided the same way; additions that overlap must be decided
                                         together (--alone decides one on purpose)
    ppc decide-addition --accept-recommended [--but-cut ADD-1,ADD-2] [--but-keep ADD-3 --reason <why>] [--by <name>] [dir]
                                         keep or cut something the design contains that the person did not ask for. The person
                                         decides; an assistant may run it for what the person told it in the conversation
    ppc reread (--all | SL-001 ...) [dir]
                                         HUMAN ONLY: say you read what changed in the design since the slices were planned (clears W03)
    ppc ask <id> [--budget-reason <why>] [--mutation-reason <why>] [dir]
                                         the question for the panel that decides it: the option that approves ends with the exact
                                         command; with a reason, the exception that lets a slice in progress close
    ppc additions [dir]                  the additions in plain words: what needs you, what a recommendation settles
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
    ppc overview [dir]                   where the project stands: slices, capabilities, debt, contract
    ppc help [<command>]                 this text, or only the lines of one command; \`ppc <command> --help\` does the same and nothing else
`;

const VALUE_OPTIONS = new Set(['--by', '--audit', '--files', '--slice', '--accept', '--budget-reason', '--mutation-reason', '--reason', '--task', '--specify', '--title', '--problem', '--proposal', '--component', '--adr', '--qa', '--but-cut', '--but-keep']);
// What each command accepts. Anything else is refused: an option that is silently ignored can turn a request for help, or a typo,
// into an approval (`ppc approve --help` once approved the one slice that could be approved).
const OPTIONS = {
  rules: [], validate: ['--strict', '--design'], 'check-git': [], start: [], 'approve-slice': ['--by'], approve: ['--by', '--accept', '--drop', '--reason'],
  show: [], ask: ['--budget-reason', '--mutation-reason'], reread: ['--all'], 'approve-debt': ['--by', '--accept', '--drop', '--reason'], 'schedule-debt': ['--slice'],
  'decide-addition': ['--keep', '--cut', '--alone', '--by', '--reason', '--accept-recommended', '--but-cut', '--but-keep'], additions: [],
  'change-request': ['--slice', '--title', '--problem', '--proposal', '--component', '--adr', '--qa', '--budgets'],
  'decide-change': ['--accept', '--reject', '--by', '--reason'], 'apply-change': [], 'approve-red': ['--by'], refactor: [],
  finish: ['--audit', '--budget-reason', '--mutation-reason'], mutation: ['--files', '--slice'], next: ['--json'], overview: [],
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
  case 'approve-slice':
    transition(() => approveSlice(dirAt(1), positionals[0], options.get('by') ?? gitUserName(dirAt(1))));
    break;
  case 'approve': {
    // `ppc approve [id] [dir]`: the id starts with SL- or DEBT-; anything else is the directory
    const isId = (p) => /^(SL|DEBT|CR|[A-Z]+)-/.test(p) && !p.includes('/');
    const id = positionals.find(isId);
    const root = resolve(positionals.find((p) => p !== id) ?? '.');
    transition(() => approve(root, id, { by: options.get('by') ?? gitUserName(root), accept: options.get('accept'), drop: flags.has('--drop'), reason: options.get('reason') }));
    break;
  }
  case 'show': {
    const id = positionals.find((p) => /^([A-Z]+-|reread$)/.test(p) && !p.includes('/'));
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
    const id = positionals.find((p) => /^([A-Z]+-|reread$)/.test(p) && !p.includes('/'));
    const root = resolve(positionals.find((p) => p !== id) ?? '.');
    let question;
    try {
      question = id ? askFor(loadProject(root), id, { redFiles: redCommitFiles(root, id), budgetReason: options.get('budget-reason'), mutationReason: options.get('mutation-reason') }) : null;
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
        if (!left) console.error('Every addition is decided. Next: apply the cuts (/speckit-architect-pp-apply-cuts) if any were cut, then write the constitution with `ppc constitution`.');
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
  case 'change-request': {
    const list = (v) => (v ? v.split(',').map((x) => x.trim()).filter(Boolean) : []);
    transition(() => openChange(dirAt(0), { slice: options.get('slice'), title: options.get('title'), problem: options.get('problem'), proposal: options.get('proposal'), components: list(options.get('component')), adrs: list(options.get('adr')), qas: list(options.get('qa')), budgets: flags.has('--budgets') }));
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
    const next = nextSteps(model, subjects, findings.filter((f) => f.severity === 'error'), buildFacts(root));
    process.stdout.write(flags.has('--json') ? `${JSON.stringify(nextJson(next), null, 2)}\n` : renderNext(next));
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
    console.log(`schemas: ${join(suite, 'contract/v0.1/schemas')}\ndocument: ${join(suite, 'docs/contract-v0.1.md')}\nexample: ${join(suite, 'examples/todo-app')}`);
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
