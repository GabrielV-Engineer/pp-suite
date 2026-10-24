#!/usr/bin/env node
import { resolve } from 'node:path';
import { loadProject } from '../src/load.mjs';
import { validateModel, RULES } from '../src/validate.mjs';
import { generate, writeGenerated, checkGenerated } from '../src/generate.mjs';
import { checkGit } from '../src/gitcheck.mjs';

const USAGE = `ppc — pp-suite contract tool

  ppc validate [dir] [--strict]   check a project against the contract (strict: warnings fail too)
  ppc generate [dir] [--check]    write the derived views (WBS, debt tables); --check only verifies them
  ppc check-git [dir]             verify every slice audit against the real git history
  ppc rules                       list every rule the validator can emit
`;

const [command, ...rest] = process.argv.slice(2);
const flags = new Set(rest.filter((a) => a.startsWith('--')));
const root = resolve(rest.find((a) => !a.startsWith('--')) ?? '.');

function report(findings) {
  for (const f of findings) console.log(`${f.severity === 'error' ? 'error  ' : 'warning'} ${f.rule.padEnd(6)} ${f.file}: ${f.message}`);
  const errors = findings.filter((f) => f.severity === 'error').length;
  const warnings = findings.length - errors;
  console.log(`${errors} error(s), ${warnings} warning(s)`);
  return { errors, warnings };
}

if (command === 'rules') {
  for (const [id, text] of Object.entries(RULES)) console.log(`${id.padEnd(7)}${text}`);
} else if (command === 'validate') {
  const model = loadProject(root);
  const findings = validateModel(model);
  if (!findings.some((f) => f.severity === 'error') && model.blueprint) findings.push(...checkGenerated(root, generate(model)));
  const { errors, warnings } = report(findings);
  process.exit(errors || (flags.has('--strict') && warnings) ? 1 : 0);
} else if (command === 'check-git') {
  const model = loadProject(root);
  const findings = validateModel(model);
  if (!findings.some((f) => f.severity === 'error')) findings.push(...checkGit(model, root));
  const { errors } = report(findings);
  process.exit(errors ? 1 : 0);
} else if (command === 'generate') {
  const model = loadProject(root);
  const findings = validateModel(model);
  if (findings.some((f) => f.severity === 'error')) {
    report(findings);
    console.error('refusing to generate from an invalid project');
    process.exit(1);
  }
  const views = generate(model);
  if (flags.has('--check')) {
    const { errors } = report(checkGenerated(root, views));
    process.exit(errors ? 1 : 0);
  }
  writeGenerated(root, views);
  console.log(`wrote ${views.size} generated view(s)`);
} else {
  process.stderr.write(USAGE);
  process.exit(command ? 2 : 0);
}
