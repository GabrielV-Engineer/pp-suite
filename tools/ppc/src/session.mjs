import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadProject } from './load.mjs';
import { validateModel } from './validate.mjs';
import { nextSteps, renderNext } from './next.mjs';

// What a session is told when it starts: whose turn it is. A hook runs `ppc session` and Claude Code adds the output to the
// conversation, so an agent starts oriented without anyone typing a command. It is silent outside a pp-suite project, never
// fails, and is capped: it runs at the start of every session.

export const CAP = 2000;

/** The commit subjects of the history, newest first; empty when there is no git repository. */
export function gitSubjects(root) {
  try {
    return execFileSync('git', ['log', '--format=%s'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

export function sessionContext(root) {
  if (!existsSync(join(root, '.architect/blueprint.yaml'))) return '';
  try {
    const model = loadProject(root);
    if (!model.blueprint) return 'pp-suite: this project has a design file that could not be read. `ppc validate` says why.\n';
    const findings = validateModel(model);
    const body = renderNext(nextSteps(model, gitSubjects(root), findings.filter((f) => f.severity === 'error')));
    const text = `pp-suite: ${model.blueprint.data.project.name} (blueprint revision ${model.blueprint.data.revision}). State from \`ppc next\`:\n\n${body}`;
    return text.length > CAP ? `${text.slice(0, CAP).replace(/\n[^\n]*$/, '')}\n... (shortened; run \`ppc next\` for the rest)\n` : text;
  } catch {
    return 'pp-suite: the state of this project could not be read. Run `ppc validate`.\n';
  }
}
