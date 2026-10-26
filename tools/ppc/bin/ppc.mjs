#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadProject } from '../src/load.mjs';
import { validateModel, designFindings, RULES } from '../src/validate.mjs';
import { generate, writeGenerated, checkGenerated } from '../src/generate.mjs';
import { checkGit } from '../src/gitcheck.mjs';
import { nextSteps, overview, renderNext } from '../src/next.mjs';
import { execFileSync } from 'node:child_process';
import { apply, plan as installPlan, renderPlan, InstallError } from '../src/install.mjs';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { buildPrompts, resolveTarget, writePrompts } from '../src/prompts.mjs';
import { start, approveSlice, approveRed, approveDebt, decideAddition, toRefactor, finish, mutate, status, LifecycleError } from '../src/lifecycle.mjs';

const USAGE = `ppc — pp-suite contract tool

  Checks
    ppc validate [dir] [--strict]        check a project against the contract (strict: warnings fail too)
    ppc validate [dir] --design          judge only the design (.architect/), before any slice or debt register exists
    ppc check-git [dir]                  verify every slice audit against the real git history
    ppc generate [dir] [--check]         write the derived views (WBS, debt tables); --check only verifies them
    ppc rules                            list every rule the checks can emit

  Setup
    ppc init [dir] [--apply] [--shim] [--allow-untested] [--specify <path>]
                                         check the machine and the project against the pinned versions and print the
                                         commands that would set it up; --apply runs them (needs a clean git tree);
                                         --shim also writes ~/.local/bin/ppc

  Slice cycle (each step changes the project or nothing at all)
    ppc approve-slice <slice> --by <name> [dir]
                                         HUMAN ONLY: planned -> ready
    ppc start <slice> [dir]              ready -> in progress, red phase
    ppc approve-red --by <name> [dir]    HUMAN ONLY: approve the committed red tests, enter green
    ppc approve-debt <DEBT-ID> --by <name> [--accept <reason> | --drop] [dir]
                                         HUMAN ONLY: decide on proposed debt (default: it becomes open)
    ppc decide-addition <ADD-ID> (--keep --reason <why> | --cut) --by <name> [dir]
    ppc decide-addition --accept-recommended --by <name> [dir]
                                         HUMAN ONLY: keep or cut something the design contains that the person did not ask for
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
    ppc next [dir]                       whose turn it is and the exact command to run
    ppc overview [dir]                   where the project stands: slices, capabilities, debt, contract
`;

const VALUE_OPTIONS = new Set(['--by', '--audit', '--files', '--slice', '--accept', '--budget-reason', '--mutation-reason', '--reason', '--task', '--specify']);
const [command, ...rest] = process.argv.slice(2);
const positionals = [];
const flags = new Set();
const options = new Map();
for (let i = 0; i < rest.length; i++) {
  if (VALUE_OPTIONS.has(rest[i])) options.set(rest[i].slice(2), rest[++i]);
  else if (rest[i].startsWith('--')) flags.add(rest[i]);
  else positionals.push(rest[i]);
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
    else if (!findings.some((f) => f.severity === 'error') && model.blueprint) findings.push(...checkGenerated(root, generate(model)));
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
  case 'generate': {
    const root = dirAt(0);
    const model = loadProject(root);
    const findings = validateModel(model);
    if (findings.some((f) => f.severity === 'error')) {
      report(findings);
      console.error('refusing to generate from an invalid project');
      process.exit(1);
    }
    const views = generate(model);
    if (flags.has('--check')) process.exit(report(checkGenerated(root, views)).errors ? 1 : 0);
    writeGenerated(root, views);
    console.log(`wrote ${views.size} generated view(s)`);
    break;
  }
  case 'start':
    transition(() => start(dirAt(1), positionals[0]));
    break;
  case 'approve-slice':
    transition(() => approveSlice(dirAt(1), positionals[0], options.get('by')));
    break;
  case 'approve-debt':
    transition(() => approveDebt(dirAt(1), positionals[0], { by: options.get('by'), accept: options.get('accept'), drop: flags.has('--drop') }));
    break;
  case 'decide-addition':
    transition(() =>
      flags.has('--accept-recommended')
        ? decideAddition(dirAt(0), null, { acceptRecommended: true, by: options.get('by') })
        : decideAddition(dirAt(1), positionals[0], { decision: flags.has('--cut') ? 'cut' : flags.has('--keep') ? 'keep' : undefined, by: options.get('by'), reason: options.get('reason') }),
    );
    break;
  case 'approve-red':
    transition(() => approveRed(dirAt(0), options.get('by')));
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
      report(findings);
      process.exit(1);
    }
    if (command === 'overview') {
      process.stdout.write(overview(model, findings));
      break;
    }
    let subjects = [];
    try {
      subjects = execFileSync('git', ['log', '--format=%s'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\n').filter(Boolean);
    } catch {
      // not a git repository: the phase alone decides, as if no commit had been made yet
    }
    process.stdout.write(renderNext(nextSteps(model, subjects, findings.filter((f) => f.severity === 'error'))));
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
    const opts = { shim: flags.has('--shim'), allowUntested: flags.has('--allow-untested') };
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
