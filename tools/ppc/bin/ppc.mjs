#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadProject } from '../src/load.mjs';
import { validateModel, RULES } from '../src/validate.mjs';
import { generate, writeGenerated, checkGenerated } from '../src/generate.mjs';
import { checkGit } from '../src/gitcheck.mjs';
import { start, approveSlice, approveRed, toRefactor, finish, status, LifecycleError } from '../src/lifecycle.mjs';

const USAGE = `ppc — pp-suite contract tool

  Checks
    ppc validate [dir] [--strict]        check a project against the contract (strict: warnings fail too)
    ppc check-git [dir]                  verify every slice audit against the real git history
    ppc generate [dir] [--check]         write the derived views (WBS, debt tables); --check only verifies them
    ppc rules                            list every rule the checks can emit

  Slice cycle (each step changes the project or nothing at all)
    ppc approve-slice <slice> --by <name> [dir]
                                         HUMAN ONLY: planned -> ready
    ppc start <slice> [dir]              ready -> in progress, red phase
    ppc approve-red --by <name> [dir]    HUMAN ONLY: approve the committed red tests, enter green
    ppc refactor [dir]                   green -> refactor
    ppc finish <slice> --audit <file.json> [dir]
                                         close the slice; the diff size is measured from git
    ppc status [dir]                     what is in progress
`;

const VALUE_OPTIONS = new Set(['--by', '--audit']);
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
    const findings = validateModel(model);
    if (!findings.some((f) => f.severity === 'error') && model.blueprint) findings.push(...checkGenerated(root, generate(model)));
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
      return finish(dirAt(1), positionals[0], input);
    });
    break;
  case 'status':
    console.log(status(dirAt(0)).text);
    break;
  default:
    process.stderr.write(USAGE);
    process.exit(command ? 2 : 0);
}
