import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadProject } from './load.mjs';
import { validateModel } from './validate.mjs';
import { designState, nextSteps, noDesignNext, renderNext } from './next.mjs';
import { isTestPath } from './testpaths.mjs';
import { GUARD_SCRIPT, HOOK_NAME } from './install.mjs';

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

/** The answers of the question panel that no command has used yet (`.sddpp/answers.jsonl`); empty when there is none. */
export function panelAnswers(root) {
  let lines;
  try {
    lines = readFileSync(join(root, '.sddpp/answers.jsonl'), 'utf8').split('\n');
  } catch {
    return [];
  }
  const entries = [];
  const used = new Set();
  for (const line of lines) {
    let data;
    try {
      data = JSON.parse(line);
    } catch {
      continue;
    }
    if (typeof data?.consumed === 'string') used.add(data.consumed);
    else if (typeof data?.id === 'string' && typeof data.command === 'string' && typeof data.at === 'number') entries.push(data);
  }
  return entries.filter((e) => !used.has(e.id));
}

/** The name git would put on a commit here; undefined when none is configured. */
export function gitUserName(root) {
  try {
    return execFileSync('git', ['config', 'user.name'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || undefined;
  } catch {
    return undefined;
  }
}

/**
 * A guard that Claude Code is told to run but whose script is gone: the dispatcher fails open, so the test lock and the human-only
 * approvals stop being enforced and nothing says so (issue #8). Empty when no guard is registered (`ppc init` reports that) or the script is there.
 */
export function guardWarning(root) {
  try {
    if (!readFileSync(join(root, '.claude/settings.json'), 'utf8').includes(HOOK_NAME)) return '';
  } catch {
    return '';
  }
  if (existsSync(join(root, GUARD_SCRIPT))) return '';
  return `pp-suite WARNING: the guard is registered but its script is missing (${GUARD_SCRIPT}). Until it is restored the test lock and the human-only approvals are not enforced (the hook fails open). Run \`ppc init --apply --update\`.\n\n`;
}

export function sessionContext(root) {
  return guardWarning(root) + stateContext(root);
}

function stateContext(root) {
  if (!existsSync(join(root, '.architect/blueprint.yaml'))) {
    // set up but not designed yet: the first step, not silence; anywhere else the hook stays silent
    return designState(root) === 'no-design' ? `pp-suite: set up, no design yet. State from \`ppc next\`:\n\n${renderNext(noDesignNext())}` : '';
  }
  try {
    const model = loadProject(root);
    if (!model.blueprint) return 'pp-suite: this project has a design file that could not be read. `ppc validate` says why.\n';
    const findings = validateModel(model);
    const body = renderNext(nextSteps(model, gitSubjects(root), findings.filter((f) => f.severity === 'error'), { ...buildFacts(root), answers: panelAnswers(root) }));
    const text = `pp-suite: ${model.blueprint.data.project.name} (blueprint revision ${model.blueprint.data.revision}). State from \`ppc next\`:\n\n${body}`;
    return text.length > CAP ? `${text.slice(0, CAP).replace(/\n[^\n]*$/, '')}\n... (shortened; run \`ppc next\` for the rest)\n` : text;
  } catch {
    return 'pp-suite: the state of this project could not be read. Run `ppc validate`.\n';
  }
}
