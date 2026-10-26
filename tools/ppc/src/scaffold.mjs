import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadProject } from './load.mjs';
import { designFindings, validateModel } from './validate.mjs';
import { LifecycleError } from './lifecycle.mjs';

/**
 * Writes an empty technical-debt register for each component of the design that has none. Rule R01 asks for one per
 * component, and nothing else creates them: the hand-off writes `.architect/` only and the planner writes slices.
 * Existing registers are never touched.
 */
export function scaffold(root) {
  const model = loadProject(root);
  const errors = designFindings(validateModel(model)).filter((f) => f.severity === 'error');
  if (!model.blueprint || errors.length) throw new LifecycleError(`the design is not valid, fix it first:\n${errors.slice(0, 5).map((e) => `  ${e.rule} ${e.file}: ${e.message}`).join('\n')}`);
  const created = [];
  for (const { id } of model.blueprint.data.components) {
    const file = `.sddpp/debt/${id}.yaml`;
    if (existsSync(join(root, file))) continue;
    mkdirSync(join(root, '.sddpp/debt'), { recursive: true });
    writeFileSync(join(root, file), `component: ${id}\nentries: []\n`);
    created.push(file);
  }
  return { created };
}
