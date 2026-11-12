import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadProject } from './load.mjs';
import { validateModel } from './validate.mjs';
import { designState, nextSteps, noDesignNext, renderNext } from './next.mjs';
import { isTestPath } from './testpaths.mjs';

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

/**
 * What `ppc next` needs from git besides the subjects: the slices that have `build(<id>)` commits and no test file in any of them.
 * Empty outside a git repository.
 */
export function buildFacts(root) {
  const built = new Set();
  const tested = new Set();
  try {
    const log = execFileSync('git', ['log', '--format=%x01%s', '--name-only'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });
    for (const commit of log.split('\x01').slice(1)) {
      const [subject, ...files] = commit.split('\n').filter(Boolean);
      const id = /^build\((SL-\d+)\)/.exec(subject)?.[1];
      if (!id) continue;
      built.add(id);
      if (files.some(isTestPath)) tested.add(id);
    }
  } catch {
    // no repository: nothing to say
  }
  return { buildsWithoutTests: new Set([...built].filter((id) => !tested.has(id))) };
}

/** The name git would put on a commit here; undefined when none is configured. */
export function gitUserName(root) {
  try {
    return execFileSync('git', ['config', 'user.name'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || undefined;
  } catch {
    return undefined;
  }
}

export function sessionContext(root) {
  if (!existsSync(join(root, '.architect/blueprint.yaml'))) {
    // set up but not designed yet: the first step, not silence; anywhere else the hook stays silent
    return designState(root) === 'no-design' ? `pp-suite: set up, no design yet. State from \`ppc next\`:\n\n${renderNext(noDesignNext())}` : '';
  }
  try {
    const model = loadProject(root);
    if (!model.blueprint) return 'pp-suite: this project has a design file that could not be read. `ppc validate` says why.\n';
    const findings = validateModel(model);
    const body = renderNext(nextSteps(model, gitSubjects(root), findings.filter((f) => f.severity === 'error'), buildFacts(root)));
    const text = `pp-suite: ${model.blueprint.data.project.name} (blueprint revision ${model.blueprint.data.revision}). State from \`ppc next\`:\n\n${body}`;
    return text.length > CAP ? `${text.slice(0, CAP).replace(/\n[^\n]*$/, '')}\n... (shortened; run \`ppc next\` for the rest)\n` : text;
  } catch {
    return 'pp-suite: the state of this project could not be read. Run `ppc validate`.\n';
  }
}
