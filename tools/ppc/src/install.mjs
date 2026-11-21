import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { longSkillNames, shortSkills, isOwnSkill } from './skills.mjs';
import { readInventory, bareName } from './inventory.mjs';

// Sets a project up for pp-suite. It reports first and changes nothing; `apply` runs only the project-level steps
// that are missing. Installing Spec Kit itself (a global tool, third-party code) is left to the person: the exact
// command is printed. All outside effects (running commands, probing the machine) are passed in, so this module is
// tested without installing anything.

export class InstallError extends Error {}
const fail = (message) => {
  throw new InstallError(message);
};

export const readPins = (suite) => JSON.parse(readFileSync(join(suite, 'install/versions.json'), 'utf8'));

// Where each extension lives in this repository. Architect.PP comes first: it is the first step of a project.
const EXTENSIONS = [
  { id: 'architect-pp', dir: 'architect-pp/extension' },
  { id: 'sddpp-guard', dir: 'sdd-pp/extension/sddpp-guard' },
  { id: 'sddpp-cycle', dir: 'sdd-pp/extension/sddpp-cycle' },
];
// Skills of Spec Kit that this flow does not use: the design already exists and the slices come from it
// (`/pp-plan`), tasks are built by `/pp-build` and checked by `ppc`, and the project rules are
// generated into CLAUDE.md. Left in place they compete with our skills for the agent's attention. They are removed
// from the project, not from Spec Kit; the change shows in git.
export const DROPPED_SKILLS = ['speckit-specify', 'speckit-plan', 'speckit-tasks', 'speckit-implement', 'speckit-clarify', 'speckit-analyze', 'speckit-checklist', 'speckit-constitution', 'speckit-converge', 'speckit-taskstoissues'];
const OLD_PRESET = 'sddpp-slices';
export const GUARD_SCRIPT = '.specify/extensions/sddpp-guard/scripts/python/guard.py';
export const HOOK_NAME = 'speckit.sddpp-guard.pre-tool';
const SESSION_SCRIPT = '.specify/extensions/sddpp-cycle/scripts/python/session.py';
const SESSION_HOOK_NAME = 'speckit.sddpp-cycle.session-start';
// The recorder of the question-panel answers: without it, no answer lets an approval through (the guard then asks or blocks as before).
const ANSWER_SCRIPTS = ['.specify/extensions/sddpp-guard/scripts/python/record_answer.py', '.specify/extensions/sddpp-guard/scripts/python/ledger.py'];
const ANSWER_HOOK_NAME = 'speckit.sddpp-guard.record-answer';
// `/pp`: the one command a person types. It is not a Spec Kit command, so it is written into the project directly.
const PP_SKILL_SOURCE = 'sdd-pp/skills/pp/SKILL.md';
const PP_SKILL_TARGET = '.claude/skills/pp/SKILL.md';

const manifestVersion = (suite, file, key) => String(parseYaml(readFileSync(join(suite, file), 'utf8'))[key].version);
const shimText = (suite) => `#!/bin/sh\nexec node "${join(suite, 'tools/ppc/bin/ppc.mjs')}" "$@"\n`;
/** Files of `source` that are missing from `installed` or differ there. Extra files in `installed` are Spec Kit's own. */
function differing(source, installed, base = '') {
  return readdirSync(join(source, base), { withFileTypes: true }).flatMap((entry) => {
    const rel = join(base, entry.name);
    if (entry.name === '__pycache__') return []; // compiled by running the tests; not part of what is installed
    if (entry.isDirectory()) return differing(source, installed, rel);
    const there = join(installed, rel);
    return !existsSync(there) || !readFileSync(there).equals(readFileSync(join(source, rel))) ? [rel] : [];
  });
}

const versionOf = (out) => /(\d+(?:\.\d+)+\S*)/.exec(out ?? '')?.[1];

/** Reads the current state of the machine and the project, and the steps that would fix what is missing. */
export function plan(root, env, { shim = false, allowUntested = false, update = false } = {}) {
  const { suite, probe, nodeVersion, pathDirs = [], home = '', specify = 'specify' } = env;
  const pins = readPins(suite);
  const checks = [];
  const blocked = [];
  const add = (check, { blocks = false } = {}) => {
    checks.push(check);
    if (blocks && check.status !== 'ok') blocked.push({ id: check.id, why: `${check.label}: ${check.status}${check.found ? ` (${check.found})` : ''}` });
  };

  // ── what draws and captures the interface: information for /pp-design ui, never a block and never installed here ──
  const bins = [...new Set(Object.values(pins.capture.tools).flat().flatMap((tool) => tool.bin))];
  const capture = bins.filter((b) => pathDirs.some((d) => existsSync(join(d, b))));
  add({ id: 'capture-tool', label: 'Interface capture tool (optional)', status: 'info', found: capture.length ? capture.join(', ') : 'none; /pp-design ui approves the HTML mockup and offers three tools for the kind of project' });
  // ── what the person already has: names only, never written to the project (see src/inventory.mjs and docs/tools.md) ──
  const inventory = readInventory({ home, root });
  const have = new Set(inventory.skills.map((s) => bareName(s.name)));
  const design = pins.capture.design_skills.filter((s) => have.has(s));
  add({ id: 'design-skills', label: 'Design skills (optional)', status: 'info', found: design.length ? design.join(', ') : "none; /pp-design ui uses pp-suite's own design guide" });
  const named = (label, items) => `${label} ${items.length}${items.length ? ` (${items.slice(0, 10).map((i) => i.name).join(', ')}${items.length > 10 ? `, +${items.length - 10} more` : ''})` : ''}`;
  // pp-suite's own commands (`/pp`, `/pp-*`) and Spec Kit's are not "yours": listed, they would fill the ten names this line shows.
  const yours = inventory.skills.filter((k) => !isOwnSkill(k.name));
  const summary = [named('skills', yours), named('plugins', inventory.plugins), named('MCP', inventory.mcp), ...inventory.problems].join(' · ');
  add({ id: 'tools-inventory', label: 'Skills, plugins and MCP servers you have (information only)', status: 'info', found: summary });

  // ── the machine ──
  const major = Number(String(nodeVersion).split('.')[0]);
  add({ id: 'node', label: 'Node.js', status: major >= pins.node.min ? 'ok' : 'differs', found: nodeVersion, wanted: `>= ${pins.node.min} (tested ${pins.node.tested})` }, { blocks: true });
  const git = probe('git', ['--version']);
  add({ id: 'git', label: 'git', status: git?.status === 0 ? 'ok' : 'missing', found: versionOf(git?.stdout) }, { blocks: true });
  const repo = probe('git', ['rev-parse', '--git-dir'], { cwd: root });
  add({ id: 'git-repo', label: 'the project is a git repository', status: repo?.status === 0 ? 'ok' : 'missing', fix: 'git init' }, { blocks: true });
  const python = probe('python3', ['--version']);
  add({ id: 'python', label: 'Python 3 (for the guard)', status: python?.status === 0 ? 'ok' : 'missing', found: versionOf(python?.stdout), wanted: `${pins.python.tested} is the tested version` }, { blocks: true });

  const spec = probe(specify, ['--version']);
  const specVersion = spec?.status === 0 ? versionOf(spec.stdout) : undefined;
  const specStatus = !specVersion ? 'missing' : specVersion === pins.speckit.version ? 'ok' : 'differs';
  const installCommand = `uv tool install specify-cli --from git+${pins.speckit.repository}.git@${pins.speckit.commit}`;
  checks.push({ id: 'specify', label: 'Spec Kit (specify)', status: specStatus, found: specVersion, wanted: `${pins.speckit.version} (commit ${pins.speckit.commit.slice(0, 7)})`, fix: installCommand });
  if (specStatus === 'missing' || (specStatus === 'differs' && !allowUntested)) blocked.push({ id: 'specify', why: `Spec Kit (specify) ${specStatus === 'missing' ? 'is not installed' : `is ${specVersion}, not ${pins.speckit.version}`}` });

  const claude = probe('claude', ['--version']);
  const claudeVersion = versionOf(claude?.stdout);
  add({ id: 'claude', label: 'Claude Code', status: !claudeVersion ? 'missing' : claudeVersion === pins.claude_code.tested ? 'ok' : 'differs', found: claudeVersion, wanted: `${pins.claude_code.tested} is the tested version` });

  // ── ppc itself ──
  const depsOk = existsSync(join(suite, 'tools/ppc/node_modules/ajv'));
  add({ id: 'ppc-deps', label: 'ppc dependencies installed', status: depsOk ? 'ok' : 'missing' });
  const onPath = pathDirs.map((d) => join(d, 'ppc')).find((f) => existsSync(f));
  const ours = onPath ? readFileSync(onPath, 'utf8').includes(join(suite, 'tools/ppc/bin/ppc.mjs')) : false;
  add({ id: 'ppc-on-path', label: 'ppc on the PATH (the agent commands call it)', status: !onPath ? 'missing' : ours ? 'ok' : 'differs', found: onPath, fix: 'ppc init --apply --shim' });

  // ── the project ──
  const hasSpecify = existsSync(join(root, '.specify'));
  add({ id: 'specify-project', label: 'Spec Kit initialized in the project', status: hasSpecify ? 'ok' : 'missing' });
  const listed = (kind) => {
    if (!hasSpecify || specStatus === 'missing') return [];
    const out = probe(specify, [kind, 'list', '--json'], { cwd: root });
    try {
      return out?.status === 0 ? JSON.parse(out.stdout) : [];
    } catch {
      return [];
    }
  };
  const staleExtensions = new Set();
  const piece = (kind, id, version, sourceDir) => {
    const found = listed(kind).find((x) => x.id === id);
    let status = !found ? 'missing' : found.version === version ? 'ok' : 'differs';
    let shown = found?.version;
    let fix;
    // A version can stay the same while the files change: compare the installed copy with this repository's.
    const copy = join(root, '.specify', kind === 'extension' ? 'extensions' : 'presets', id);
    if (status === 'ok' && existsSync(copy)) {
      const stale = differing(join(suite, sourceDir), copy);
      if (stale.length) {
        status = 'differs';
        shown = `${found.version}, but ${stale.slice(0, 3).join(', ')}${stale.length > 3 ? ` and ${stale.length - 3} more` : ''} differ from this repository`;
        fix = `specify ${kind} remove ${id}, then ppc init --apply (check the generated skills afterwards: docs/spike-findings.md, point 5)`;
      }
    }
    // With --update a stale piece is removed and added again, so it is not a blocker.
    if (update && status === 'differs') staleExtensions.add(id);
    add({ id: `${kind}-${id}`, label: `${kind} ${id}`, status, found: shown, wanted: version, fix }, { blocks: status === 'differs' && !update });
    return status === 'ok';
  };
  const extensionOk = Object.fromEntries(EXTENSIONS.map(({ id, dir }) => [id, piece('extension', id, manifestVersion(suite, `${dir}/extension.yml`, 'extension'), dir)]));
  // The preset this repository used to ship is gone (the slices skill replaced it). If it is still installed, say so.
  if (listed('preset').some((x) => x.id === OLD_PRESET)) add({ id: `preset-${OLD_PRESET}`, label: `preset ${OLD_PRESET} (no longer part of pp-suite)`, status: 'differs', found: 'still installed', fix: `specify preset remove ${OLD_PRESET}` });
  add({ id: 'guard-script', label: 'the guard script is present (without it the guard fails open)', status: existsSync(join(root, GUARD_SCRIPT)) ? 'ok' : 'missing' });
  let hook = false;
  try {
    hook = readFileSync(join(root, '.claude/settings.json'), 'utf8').includes(HOOK_NAME);
  } catch {
    // no settings file: no hook
  }
  add({ id: 'guard-hook', label: 'the guard is registered as a Claude Code hook', status: hook ? 'ok' : 'missing' });
  let sessionHook = false;
  try {
    sessionHook = readFileSync(join(root, '.claude/settings.json'), 'utf8').includes(SESSION_HOOK_NAME);
  } catch {
    // no settings file: no hook
  }
  add({ id: 'session-hook', label: 'the session-start hook is registered (shows whose turn it is when a session begins)', status: sessionHook && existsSync(join(root, SESSION_SCRIPT)) ? 'ok' : 'missing', fix: 'ppc init --apply --update' });

  let answerHook = false;
  try {
    answerHook = readFileSync(join(root, '.claude/settings.json'), 'utf8').includes(ANSWER_HOOK_NAME);
  } catch {
    // no settings file: no hook
  }
  add({ id: 'answer-hook', label: "the question-panel answer recorder is registered (a person's choice in the panel is what lets an approval through)", status: answerHook && ANSWER_SCRIPTS.every((f) => existsSync(join(root, f))) ? 'ok' : 'missing', fix: 'ppc init --apply --update' });
  const ppSource = readFileSync(join(suite, PP_SKILL_SOURCE), 'utf8');
  const ppTarget = join(root, PP_SKILL_TARGET);
  const ppThere = existsSync(ppTarget);
  const ppStatus = !ppThere ? 'missing' : readFileSync(ppTarget, 'utf8') === ppSource ? 'ok' : 'differs';
  add({ id: 'pp-skill', label: 'the /pp skill is installed (the one command a person types)', status: ppStatus, fix: ppStatus === 'differs' ? 'ppc init --apply --update' : 'ppc init --apply' });
  // The short commands (/pp-build, /pp-audit, ...): written from the extension command files; a person may edit them, so a file
  // that differs is rewritten only with --update, as for /pp.
  const shorts = shortSkills(suite);
  const shortTarget = (name) => join(root, '.claude/skills', name, 'SKILL.md');
  const shortStatus = shorts.map((sk) => (!existsSync(shortTarget(sk.name)) ? 'missing' : readFileSync(shortTarget(sk.name), 'utf8') === sk.content ? 'ok' : 'differs'));
  const shortsStatus = shortStatus.includes('missing') ? 'missing' : shortStatus.includes('differs') ? 'differs' : 'ok';
  add({ id: 'short-skills', label: `the short commands are installed (${shorts.map((sk) => `/${sk.name}`).join(', ')})`, status: shortsStatus, fix: shortsStatus === 'differs' ? 'ppc init --apply --update' : 'ppc init --apply' });
  // Spec Kit writes a long-named skill for every extension command each time an extension is added: while one is still to be
  // added, removing them is still to do, so that it runs after.
  const extensionsPending = EXTENSIONS.some(({ id }) => !extensionOk[id] || staleExtensions.has(id));

  // ── the steps that would fix what is missing ──
  const steps = [
    { id: 'npm-ci', title: 'Install the dependencies of ppc', command: ['npm', 'ci'], cwd: join(suite, 'tools/ppc'), done: depsOk },
    { id: 'specify-init', title: 'Initialize Spec Kit for Claude Code', command: [specify, 'init', '--here', '--force', '--non-interactive', '--integration', 'claude'], cwd: root, done: hasSpecify },
    ...EXTENSIONS.flatMap(({ id, dir }) => [
      ...(staleExtensions.has(id) ? [{ id: `extension-${id}-remove`, title: `Remove the out-of-date ${id} extension`, command: [specify, 'extension', 'remove', id, '--force'], cwd: root, done: false }] : []),
      { id: `extension-${id}`, title: `Install the ${id} extension`, command: [specify, 'extension', 'add', join(suite, dir), '--dev'], cwd: root, done: extensionOk[id] },
    ]),
    ...DROPPED_SKILLS.map((name) => ({ id: `drop-${name}`, title: `Remove the ${name} skill, which this flow does not use`, remove: join(root, '.claude/skills', name), done: hasSpecify && !existsSync(join(root, '.claude/skills', name)) })),
    ...longSkillNames(suite).map((name) => ({ id: `drop-long-${name}`, title: `Remove the long-named skill ${name}: a short command replaces it, or a hook runs it from extension.yml`, remove: join(root, '.claude/skills', name), done: !extensionsPending && !existsSync(join(root, '.claude/skills', name)) })),
    // missing: written; different: left alone unless --update, since a person may have edited it
    { id: 'pp-skill', title: 'Install the /pp skill', target: ppTarget, content: ppSource, mode: 0o644, done: ppStatus === 'ok' || (ppStatus === 'differs' && !update) },
    ...shorts.map((sk, i) => ({ id: `short-${sk.name}`, title: `Install /${sk.name}`, target: shortTarget(sk.name), content: sk.content, mode: 0o644, done: shortStatus[i] === 'ok' || (shortStatus[i] === 'differs' && !update) })),
  ];
  // `.sddpp/uses.jsonl` names the skills and MCP servers that were used (docs/tools.md); a server's name can say something about its owner
  // and the repository may be public, so it stays out of git. Written as a diff the person reviews, like everything `init` does.
  const gitignore = join(root, '.gitignore');
  const ignoreText = existsSync(gitignore) ? readFileSync(gitignore, 'utf8') : '';
  const ignored = ignoreText.split(/\r?\n/).some((l) => ['.sddpp/uses.jsonl', '/.sddpp/uses.jsonl'].includes(l.trim()));
  steps.push({ id: 'ignore-uses', title: 'Keep the record of which tools were used (.sddpp/uses.jsonl) out of git: it names the MCP servers a person uses', target: gitignore, content: `${ignoreText}${ignoreText && !ignoreText.endsWith('\n') ? '\n' : ''}.sddpp/uses.jsonl\n`, mode: 0o644, done: ignored });
  if (shim) {
    const dir = pathDirs.find((d) => d === join(home, '.local/bin'));
    const status = checks.find((c) => c.id === 'ppc-on-path').status;
    if (status === 'differs') blocked.push({ id: 'ppc-shim', why: `another program called ppc is already on the PATH (${onPath}); it will not be overwritten` });
    else if (!dir && status === 'missing') blocked.push({ id: 'ppc-shim', why: '~/.local/bin is not on the PATH, so a shim there would not be found' });
    steps.push({ id: 'ppc-shim', title: 'Write the ppc shim', target: join(dir ?? join(home, '.local/bin'), 'ppc'), content: shimText(suite), done: status === 'ok' });
  }
  return { checks, steps, blocked };
}

/**
 * Runs the steps that are not done, in order, and stops at the first failure. Refuses a blocked machine and a project
 * with uncommitted changes, so that everything the install does shows up as a reviewable diff.
 */
export function apply(root, env, { run, shim = false, allowUntested = false, update = false } = {}) {
  const before = plan(root, env, { shim, allowUntested, update });
  if (before.blocked.length) fail(`cannot continue:\n${before.blocked.map((b) => `  - ${b.why}`).join('\n')}`);
  const pending = before.steps.filter((s) => !s.done);
  if (pending.length) {
    const status = env.probe('git', ['status', '--porcelain'], { cwd: root });
    if (status?.stdout?.trim()) fail('the project has uncommitted changes; commit or stash them first, so the install can be reviewed as a diff');
  }
  const ran = [];
  for (const step of pending) {
    if (step.remove) {
      rmSync(step.remove, { recursive: true, force: true });
    } else if (step.target) {
      mkdirSync(join(step.target, '..'), { recursive: true });
      writeFileSync(step.target, step.content);
      chmodSync(step.target, step.mode ?? 0o755);
    } else {
      const result = run(step.command, step.cwd);
      if (result.status !== 0) fail(`step ${step.id} failed (${step.command.join(' ')}):\n${String(result.stderr ?? '').trim()}`);
    }
    ran.push(step.id);
  }
  return { ran, plan: plan(root, env, { shim, allowUntested, update }) };
}

const MARK = { ok: 'ok     ', differs: 'DIFFERS', missing: 'MISSING', info: 'info   ' };

/** The report a person reads: what was found, what blocks, and the exact commands the steps would run. */
export function renderPlan(p, { applied = false } = {}) {
  const out = ['Checks:'];
  for (const c of p.checks) {
    const detail = [c.found && `found ${c.found}`, !['ok', 'info'].includes(c.status) && c.wanted && `wanted ${c.wanted}`].filter(Boolean).join(', ');
    out.push(`  ${MARK[c.status]}  ${c.label}${detail ? ` (${detail})` : ''}`);
    if (!['ok', 'info'].includes(c.status) && c.fix) out.push(`           fix: ${c.fix}`);
  }
  if (p.blocked.length) out.push('', 'Blocked:', ...p.blocked.map((b) => `  - ${b.why}`));
  const pending = p.steps.filter((s) => !s.done);
  out.push('', applied ? 'Steps still pending:' : 'Steps:');
  if (!pending.length) out.push('  none: the project is set up');
  for (const s of pending) out.push(`  ${applied ? 'pending' : 'would run'}: ${s.remove ? `remove ${s.remove}` : s.target ? `write ${s.target}` : s.command.join(' ')}${s.cwd ? `   (in ${s.cwd})` : ''}`);
  if (!applied && pending.length && !p.blocked.length) out.push('', 'Nothing was changed. `ppc init --apply` runs the steps above (`--shim` also writes ~/.local/bin/ppc).');
  return `${out.join('\n')}\n`;
}
